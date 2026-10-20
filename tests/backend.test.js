import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
process.env.WANXIANG_TEST_MODE = "1";
for (const name of [
  "WANXIANG_AI_KEY",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "WANXIANG_PASSWORD",
])
  process.env[name] = "";
const { createApp } = await import("../server/index.js");
import { generateImages, privateIP, providerError } from "../server/ai.js";
import { validateMask } from "../server/assets.js";
const uuid = () => crypto.randomUUID();
const image = () =>
  sharp({
    create: {
      width: 64,
      height: 64,
      channels: 4,
      background: { r: 255, g: 100, b: 50, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
async function maskImage() {
  const pixels = Buffer.alloc(64 * 64 * 4, 255);
  for (let y = 16; y < 32; y++)
    for (let x = 16; x < 32; x++) pixels[(y * 64 + x) * 4 + 3] = 0;
  return sharp(pixels, { raw: { width: 64, height: 64, channels: 4 } })
    .png()
    .toBuffer();
}
async function harness(t, generator) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wx-test-"));
  const app = await createApp({
    dataDir: dir,
    production: true,
    password: "测试密码",
    generator,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = "http://127.0.0.1:" + server.address().port;
  let cookie = "";
  const call = async (
    url,
    { method = "GET", body, raw = false, ...rest } = {},
  ) => {
    const form = body instanceof FormData;
    const res = await fetch(base + "/api" + url, {
      method,
      headers: {
        "X-Studio-Request": "1",
        ...(body && !form ? { "Content-Type": "application/json" } : {}),
        Cookie: cookie,
        ...rest.headers,
      },
      body: form ? body : body ? JSON.stringify(body) : undefined,
    });
    if (res.headers.get("set-cookie"))
      cookie = res.headers.get("set-cookie").split(";")[0];
    const data = raw ? Buffer.from(await res.arrayBuffer()) : await res.json();
    return { status: res.status, data };
  };
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await fs.rm(dir, { recursive: true, force: true });
  });
  return { call, app, dir, base };
}
async function uploadFile(
  call,
  buffer,
  name = "product.png",
  mime = "image/png",
  kind = "image",
) {
  const f = new FormData();
  f.set("kind", kind);
  f.set("file", new Blob([buffer], { type: mime }), name);
  return call("/assets", { method: "POST", body: f });
}
async function waitTask(call, id) {
  for (let i = 0; i < 100; i++) {
    const { data } = await call("/tasks");
    const t = data.find((t) => t.id === id);
    if (["succeeded", "failed"].includes(t?.status)) return t;
    await new Promise((r) => setTimeout(r, 15));
  }
  throw new Error("Task did not complete");
}
test("private sessions, project roundtrip, upload validation and secret redaction", async (t) => {
  const { call, app, base } = await harness(t);
  assert.equal((await call("/projects")).status, 401);
  assert.equal(
    (await call("/session", { method: "POST", body: { password: "错" } }))
      .status,
    401,
  );
  assert.equal(
    (await call("/session", { method: "POST", body: { password: "测试密码" } }))
      .status,
    200,
  );
  const asset = await uploadFile(call, await image());
  assert.equal(asset.status, 201);
  assert.equal(
    (
      await call("/projects/" + uuid(), {
        method: "DELETE",
        headers: { Origin: "https://other.example" },
      })
    ).status,
    403,
  );
  assert.equal(
    (await fetch(base + asset.data.url)).status,
    401,
    "unauthenticated assets must not be public",
  );
  assert.equal(
    (await uploadFile(call, Buffer.from("<svg/>"), "bad.svg", "image/svg+xml"))
      .status,
    400,
  );
  assert.equal(
    (await uploadFile(call, Buffer.from("not an image"))).status,
    400,
  );
  const id = uuid(),
    project = {
      schemaVersion: 1,
      name: "验收作品",
      width: 400,
      height: 300,
      background: "transparent",
      canvas: {
        version: "6.9.0",
        objects: [
          {
            type: "Image",
            id: uuid(),
            src: asset.data.url,
            assetId: asset.data.id,
            left: 20,
            top: 30,
            width: 64,
            height: 64,
            scaleX: 2,
            scaleY: 2,
            angle: 15,
            cropX: 2,
            cropY: 2,
          },
          {
            type: "Textbox",
            id: uuid(),
            text: "万象画室",
            left: 80,
            top: 20,
            fontSize: 30,
          },
        ],
      },
      view: { zoom: 0.5, x: 5, y: 6 },
    };
  assert.equal(
    (await call("/projects/" + id, { method: "PUT", body: project })).status,
    200,
  );
  const opened = (await call("/projects/" + id)).data;
  assert.equal(opened.name, project.name);
  assert.deepEqual(opened.canvas, project.canvas);
  assert.deepEqual(opened.view, project.view);
  assert.equal(
    (
      await call("/projects/" + id, {
        method: "PUT",
        body: { ...project, name: "新名字" },
      })
    ).data.name,
    "新名字",
  );
  assert.equal(
    (
      await call("/projects/" + uuid(), {
        method: "PUT",
        body: { ...project, width: 99999 },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("/projects/" + uuid(), {
        method: "PUT",
        body: {
          ...project,
          canvas: {
            objects: [{ type: "Image", src: "https://evil.test/image.png" }],
          },
        },
      })
    ).status,
    400,
  );
  const fakeKey = "unit-test-only-not-a-real-key";
  await app.locals.store.write("config.json", {
    apiKey: fakeKey,
    model: "gpt-image-1",
    baseURL: "https://api.openai.com/v1",
  });
  const config = (await call("/config")).data;
  assert.equal(config.configured, true);
  assert.equal(JSON.stringify(config).includes(fakeKey), false);
  assert.equal(
    (
      await call("/config", {
        method: "PUT",
        body: {
          baseURL: "http://127.0.0.1/v1",
          model: "gpt-image-1",
          apiKey: "x",
        },
      })
    ).status,
    400,
  );
  assert.equal(
    (await call("/projects/" + id, { method: "DELETE" })).status,
    200,
  );
  assert.equal((await call("/projects/" + id)).status, 404);
});
test("AI pending configuration, mask/original/instruction contract, idempotency and honest failure state", async (t) => {
  let calls = 0,
    seen;
  const output = await image();
  const { call, app } = await harness(t, async (args) => {
    calls++;
    seen = args;
    if (args.input.prompt === "模拟服务失败")
      throw new Error(providerError(429));
    return [output];
  });
  await call("/session", { method: "POST", body: { password: "测试密码" } });
  const input = {
    mode: "text",
    prompt: "产品摄影",
    style: "摄影",
    size: "1024x1024",
    quality: "medium",
    count: 1,
  };
  assert.equal(
    (
      await call("/tasks", {
        method: "POST",
        body: { requestId: uuid(), input },
      })
    ).status,
    400,
  );
  await app.locals.store.write("config.json", {
    apiKey: "test-only",
    model: "gpt-image-1",
    baseURL: "https://api.openai.com/v1",
  });
  const original = (await uploadFile(call, output)).data,
    mask = (
      await uploadFile(call, await maskImage(), "mask.png", "image/png", "mask")
    ).data;
  const requestId = uuid(),
    edit = {
      ...input,
      mode: "inpaint",
      assetId: original.id,
      maskId: mask.id,
      prompt: "将选中区域改成蓝色",
    };
  const response = await call("/tasks", {
    method: "POST",
    body: { requestId, input: edit },
  });
  assert.equal(response.status, 202);
  const done = await waitTask(call, response.data.id);
  assert.equal(done.status, "succeeded");
  assert.equal(done.results.length, 1);
  assert.deepEqual(seen.original, output);
  assert.ok(seen.mask);
  assert.match(seen.input.actualPrompt, /将选中区域改成蓝色/);
  assert.match(seen.input.actualPrompt, /尽量保留/);
  const dup = await call("/tasks", {
    method: "POST",
    body: { requestId, input: edit },
  });
  assert.equal(dup.data.id, done.id);
  assert.equal(calls, 1);
  const missing = await call("/tasks", {
    method: "POST",
    body: { requestId: uuid(), input: { ...edit, maskId: undefined } },
  });
  assert.equal(missing.status, 400);
  const invalid = await call("/tasks", {
    method: "POST",
    body: { requestId: uuid(), input: { ...edit, maskId: original.id } },
  });
  assert.equal(invalid.status, 400);
  assert.equal(calls, 1);
  const bad = await call("/tasks", {
    method: "POST",
    body: { requestId: uuid(), input: { ...input, prompt: "模拟服务失败" } },
  });
  const fail = await waitTask(call, bad.data.id);
  assert.equal(fail.status, "failed");
  assert.deepEqual(fail.results, []);
  assert.match(fail.error, /额度不足/);
  const listed = (await call("/assets")).data;
  assert.ok(
    !listed.some((a) => a.id === mask.id),
    "mask should not clutter normal assets",
  );
});
test("official OpenAI adapter serializes JSON and multipart correctly without automatic retries", async () => {
  const config = {
      apiKey: "test-only",
      baseURL: "https://api.openai.com/v1",
      model: "gpt-image-1",
    },
    original = await image(),
    mask = await maskImage();
  let captured,
    calls = 0;
  const fetcher = async (url, options) => {
    captured = { url, ...options };
    calls++;
    return new Response(
      JSON.stringify({ data: [{ b64_json: original.toString("base64") }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  const input = {
    mode: "inpaint",
    actualPrompt: "只把选区改成蓝色",
    count: 1,
    size: "1024x1024",
    quality: "medium",
  };
  const result = await generateImages({
    config,
    input,
    original,
    mask,
    fetcher,
    checkURL: false,
  });
  assert.deepEqual(result, [original]);
  assert.equal(captured.url, "https://api.openai.com/v1/images/edits");
  assert.equal(captured.body.get("prompt"), input.actualPrompt);
  assert.equal(captured.body.get("model"), "gpt-image-1");
  assert.equal(captured.body.get("mask").type, "image/png");
  assert.deepEqual(
    Buffer.from(await captured.body.get("mask").arrayBuffer()),
    mask,
  );
  assert.deepEqual(
    Buffer.from(await captured.body.get("image").arrayBuffer()),
    original,
  );
  assert.equal(captured.headers["Content-Type"], undefined);
  await generateImages({
    config,
    input: { ...input, mode: "text" },
    fetcher,
    checkURL: false,
  });
  assert.equal(JSON.parse(captured.body).output_format, "png");
  assert.equal(captured.url, "https://api.openai.com/v1/images/generations");
  calls = 0;
  await assert.rejects(
    generateImages({
      config,
      input: { ...input, mode: "text" },
      fetcher: async () => {
        calls++;
        return new Response("{}", { status: 401 });
      },
      checkURL: false,
    }),
    /凭证无效/,
  );
  assert.equal(calls, 1);
  await assert.rejects(
    generateImages({
      config,
      input,
      original,
      mask,
      fetcher: async () => new Response('{"data":[]}'),
      checkURL: false,
    }),
    /完整的图片结果/,
  );
});
test("mask validation, unsafe endpoint detection and restart interruption reporting", async (t) => {
  const original = await image();
  await validateMask(original, await maskImage());
  await assert.rejects(
    validateMask(
      original,
      await sharp(await maskImage())
        .resize(32, 32)
        .png()
        .toBuffer(),
    ),
    /尺寸相同/,
  );
  await assert.rejects(validateMask(original, original), /涂抹/);
  for (const ip of [
    "127.0.0.1",
    "10.1.1.1",
    "192.168.0.1",
    "169.254.169.254",
    "::1",
  ])
    assert.equal(privateIP(ip), true);
  assert.equal(privateIP("8.8.8.8"), false);
  const { app } = await harness(t);
  const id = uuid();
  await app.locals.store.write(`tasks/${id}.json`, {
    id,
    status: "running",
    results: [],
  });
  await app.locals.queue.init();
  const saved = await app.locals.store.read(`tasks/${id}.json`);
  assert.equal(saved.status, "failed");
  assert.match(saved.error, /可能已计费/);
});
