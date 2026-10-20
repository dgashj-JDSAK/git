import express from "express";
import dotenv from "dotenv";
if (process.env.WANXIANG_TEST_MODE !== "1") dotenv.config({ quiet: true });
import multer from "multer";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import { z } from "zod";
import { Store } from "./store.js";
import { MODELS, publicConfig, validateBaseURL } from "./ai.js";
import { saveAsset, assetBuffer, validateMask, MAX_FILE } from "./assets.js";
import { TaskQueue } from "./tasks.js";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const uuid = z.string().uuid();
const size = z.number().int().min(64).max(4096);
const configSchema = z.object({
  baseURL: z.string().url().max(300),
  model: z.enum(Object.keys(MODELS)),
  apiKey: z.string().max(1000).optional(),
  clearKey: z.boolean().optional(),
});
const inputSchema = z.object({
  mode: z.enum(["text", "reference", "inpaint"]),
  prompt: z.string().trim().min(1).max(12000),
  style: z
    .enum(["原始", "摄影", "插画", "水彩", "3D 设计", "极简"])
    .default("原始"),
  size: z.enum(["1024x1024", "1024x1536", "1536x1024"]),
  quality: z.enum(["low", "medium", "high"]),
  count: z.number().int().min(1).max(4),
  assetId: uuid.optional(),
  maskId: uuid.optional(),
});
const projectSchema = z.object({
  schemaVersion: z.literal(1),
  name: z.string().trim().min(1).max(80),
  width: size,
  height: size,
  background: z.string().regex(/^(transparent|#[a-fA-F0-9]{6})$/),
  canvas: z.object({ objects: z.array(z.any()).max(300) }).passthrough(),
  view: z
    .object({
      zoom: z.number().positive().max(10),
      x: z.number(),
      y: z.number(),
      selectedId: uuid.optional(),
    })
    .optional(),
});
function validateObjects(objects) {
  for (const o of objects) {
    if (
      ![
        "Rect",
        "Circle",
        "Textbox",
        "Image",
        "rect",
        "circle",
        "textbox",
        "image",
      ].includes(o.type)
    )
      throw new Error("项目含有不受支持的图层类型");
    if (
      o.type.toLowerCase() === "image" &&
      !/^\/api\/assets\/[a-f0-9-]{36}$/.test(o.src)
    )
      throw new Error("项目图片必须引用本机素材库");
    if (o.clipPath) throw new Error("不支持外部裁剪路径");
  }
}
export async function createApp({
  dataDir = process.env.WANXIANG_DATA_DIR || path.join(ROOT, ".data"),
  production = false,
  password = process.env.WANXIANG_PASSWORD || "",
  generator,
} = {}) {
  const store = new Store(dataDir);
  await store.init();
  const readConfig = async () => ({
    baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    model: "gpt-image-1",
    ...(await store.read("config.json", {})),
    ...(process.env.WANXIANG_AI_KEY || process.env.OPENAI_API_KEY
      ? { apiKey: process.env.WANXIANG_AI_KEY || process.env.OPENAI_API_KEY }
      : {}),
  });
  const queue = new TaskQueue(store, readConfig, { generator });
  await queue.init();
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Referrer-Policy", "same-origin");
    res.set("X-Frame-Options", "DENY");
    next();
  });
  app.use("/api", express.json({ limit: "5mb" }));
  // Single-user local studio: all material is session-private. Multi-user hosting is out of v1 scope.
  const sessions = new Map(),
    loginAttempts = new Map();
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (!["GET", "HEAD"].includes(req.method)) {
      if (req.headers["x-studio-request"] !== "1")
        return res
          .status(403)
          .json({ error: "请求校验失败，请从画室页面操作" });
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host)
        return res.status(403).json({ error: "不允许跨站请求" });
    }
    next();
  });
  app.post("/api/session", (req, res) => {
    const ip = req.ip,
      now = Date.now(),
      state = loginAttempts.get(ip) || { count: 0, until: now + 60000 };
    if (now > state.until) {
      state.count = 0;
      state.until = now + 60000;
    }
    if (state.count >= 10)
      return res.status(429).json({ error: "尝试过于频繁，请一分钟后再试" });
    const supplied = String(req.body?.password || "");
    if (
      password &&
      (Buffer.byteLength(supplied) !== Buffer.byteLength(password) ||
        !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(password)))
    ) {
      state.count++;
      loginAttempts.set(ip, state);
      return res
        .status(401)
        .json({ error: "请输入正确的工作室访问密码", passwordRequired: true });
    }
    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, now + 86400000);
    for (const [key, expiry] of sessions)
      if (expiry < now) sessions.delete(key);
    res.cookie("wx_session", token, {
      httpOnly: true,
      sameSite: "strict",
      secure: req.secure,
      maxAge: 86400000,
      path: "/",
    });
    res.json({ ok: true });
  });
  app.use("/api", (req, res, next) => {
    const token = req.headers.cookie?.match(
      /(?:^|; )wx_session=([a-f0-9]+)/,
    )?.[1];
    if (!token || (sessions.get(token) || 0) < Date.now())
      return res
        .status(401)
        .json({
          error: "会话已失效，请重新打开工作室",
          passwordRequired: !!password,
        });
    next();
  });
  app.get("/api/config", async (req, res) =>
    res.json(publicConfig(await readConfig())),
  );
  app.put("/api/config", async (req, res) => {
    const parsed = configSchema.parse(req.body),
      old = await readConfig();
    const baseURL = await validateBaseURL(parsed.baseURL);
    if (
      (process.env.WANXIANG_AI_KEY || process.env.OPENAI_API_KEY) &&
      (baseURL !== old.baseURL.replace(/\/$/, "") || parsed.clearKey)
    )
      throw new Error(
        "环境变量凭证启用时，服务地址和凭证清除需在服务器环境变量中修改",
      );
    if (
      baseURL !== old.baseURL.replace(/\/$/, "") &&
      !parsed.apiKey &&
      !parsed.clearKey
    )
      throw new Error(
        "切换服务地址时请重新输入凭证，避免将原有密钥发送到新服务",
      );
    const apiKey = parsed.clearKey ? "" : parsed.apiKey || old.apiKey || "";
    if (
      (process.env.WANXIANG_AI_KEY || process.env.OPENAI_API_KEY) &&
      parsed.apiKey
    )
      throw new Error("当前凭证由服务端环境变量管理，请修改环境变量并重启");
    await store.write("config.json", { baseURL, model: parsed.model, apiKey });
    res.json(publicConfig(await readConfig()));
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE, files: 1 },
    fileFilter: (req, file, cb) =>
      cb(
        null,
        ["image/png", "image/jpeg", "image/webp"].includes(file.mimetype),
      ),
  });
  app.post("/api/assets", upload.single("file"), async (req, res) => {
    if (!req.file) throw new Error("请选择 PNG、JPEG 或 WebP 图片");
    res
      .status(201)
      .json(
        await saveAsset(
          store,
          req.file.buffer,
          typeof req.body.name === "string"
            ? req.body.name
            : req.file.originalname,
          req.body.kind === "mask" ? "mask" : "image",
        ),
      );
  });
  app.get("/api/assets", async (req, res) =>
    res.json(
      (await store.records("assets"))
        .filter((a) => a.kind !== "mask")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    ),
  );
  app.get("/api/assets/:id", async (req, res) => {
    const id = uuid.parse(req.params.id);
    const asset = await store.read(`assets/${id}.json`);
    if (!asset) return res.status(404).json({ error: "素材不存在" });
    res.type("png").send(await assetBuffer(store, id));
  });
  app.get("/api/projects", async (req, res) =>
    res.json(
      (await store.records("projects"))
        .map(({ id, name, width, height, updatedAt }) => ({
          id,
          name,
          width,
          height,
          updatedAt,
        }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    ),
  );
  app.get("/api/projects/:id", async (req, res) => {
    const p = await store.read(`projects/${uuid.parse(req.params.id)}.json`);
    if (!p) return res.status(404).json({ error: "项目不存在" });
    res.json(p);
  });
  app.put("/api/projects/:id", async (req, res) => {
    const id = uuid.parse(req.params.id),
      p = projectSchema.parse(req.body);
    validateObjects(p.canvas.objects);
    for (const o of p.canvas.objects)
      if (
        o.type.toLowerCase() === "image" &&
        !(await store.read(`assets/${o.src.split("/").pop()}.json`))
      )
        throw new Error("项目引用了不存在的素材");
    const result = { ...p, id, updatedAt: new Date().toISOString() };
    await store.write(`projects/${id}.json`, result);
    res.json(result);
  });
  app.delete("/api/projects/:id", async (req, res) => {
    await store.remove(`projects/${uuid.parse(req.params.id)}.json`);
    res.json({ ok: true });
  });
  app.get("/api/brand", async (req, res) =>
    res.json(
      await store.read("brand.json", {
        colors: ["#8b7cf8", "#e8b87a", "#f3f0e9"],
        copies: [],
        assets: [],
      }),
    ),
  );
  app.put("/api/brand", async (req, res) => {
    const b = z
      .object({
        colors: z.array(z.string().regex(/^#[a-fA-F0-9]{6}$/)).max(24),
        copies: z.array(z.string().max(500)).max(50),
        assets: z.array(uuid).max(100),
      })
      .parse(req.body);
    await store.write("brand.json", b);
    res.json(b);
  });
  app.get("/api/tasks", async (req, res) =>
    res.json(
      (await store.records("tasks")).sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      ),
    ),
  );
  let submitting = false;
  app.post("/api/tasks", async (req, res) => {
    if (submitting)
      return res.status(409).json({ error: "正在提交任务，请勿重复操作" });
    submitting = true;
    try {
      const requestId = uuid.parse(req.body.requestId),
        input = inputSchema.parse(req.body.input),
        config = await readConfig();
      if (!MODELS[config.model]?.[input.mode])
        throw new Error("此服务不支持所选生成能力");
      if (input.mode !== "text" && !input.assetId)
        throw new Error("请上传参考原图");
      if (input.mode === "inpaint") {
        if (!input.maskId) throw new Error("局部修改必须提供遮罩");
        await validateMask(
          await assetBuffer(store, input.assetId),
          await assetBuffer(store, input.maskId),
        );
      }
      input.actualPrompt =
        input.prompt +
        (input.style === "原始" ? "" : `\n视觉风格：${input.style}。`) +
        (input.mode === "inpaint"
          ? "\n仅修改遮罩指定区域，尽量保留未选区域的主体与构图。"
          : "");
      res.status(202).json(await queue.submit(input, requestId));
    } finally {
      submitting = false;
    }
  });
  app.use("/api", (req, res) => res.status(404).json({ error: "接口不存在" }));
  app.use((err, req, res, next) => {
    const isZod = err instanceof z.ZodError;
    const error = isZod
      ? "输入内容不符合要求，请检查必填项、尺寸和文件格式"
      : err.code === "LIMIT_FILE_SIZE"
        ? "上传文件不能超过 10MB"
        : err.code === "ENOENT"
          ? "素材或项目不存在"
          : err.message || "操作失败";
    res.status(isZod ? 400 : err.code === "ENOENT" ? 404 : 400).json({ error });
  });
  if (production) {
    app.use(express.static(path.join(ROOT, "dist")));
    app.get("/{*path}", (req, res) =>
      res.sendFile(path.join(ROOT, "dist/index.html")),
    );
  } else {
    const { createServer } = await import("vite");
    const vite = await createServer({
      configFile: path.join(ROOT, "vite.config.js"),
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    app.locals.vite = vite;
  }
  app.locals.store = store;
  app.locals.queue = queue;
  return app;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const host = process.env.HOST || "127.0.0.1",
    port = Number(process.env.PORT || 3000);
  if (
    !["127.0.0.1", "localhost", "::1"].includes(host) &&
    !process.env.WANXIANG_PASSWORD
  )
    throw new Error(
      "对外监听时必须设置 WANXIANG_PASSWORD，保护私有素材和服务设置",
    );
  const app = await createApp({
    production: process.argv.includes("--production"),
  });
  app.listen(port, host, () =>
    console.log(`万象画室已启动：http://${host}:${port}`),
  );
}
