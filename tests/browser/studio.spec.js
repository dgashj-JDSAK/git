import { test, expect } from "@playwright/test";
import sharp from "sharp";
import fs from "node:fs/promises";
async function ready(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "把灵感，变成画面" }),
  ).toBeVisible();
  return errors;
}
async function newProject(page, name = "验收作品", bg = "solid") {
  await page.getByRole("button", { name: "空白画布", exact: true }).click();
  await page.getByLabel("新项目名称").fill(name);
  await page.getByLabel("画布宽度", { exact: true }).fill("400");
  await page.getByLabel("画布高度", { exact: true }).fill("400");
  if (bg === "transparent")
    await page.getByRole("button", { name: "透明背景", exact: true }).click();
  await page.getByRole("button", { name: "创建画布", exact: true }).click();
  await expect(page.locator(".canvas-topline")).toContainText("400 × 400");
}
async function saveSnapshot(page) {
  const done = page.waitForResponse(
    (r) => r.url().includes("/api/projects/") && r.request().method() === "PUT",
  );
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await done;
  await expect(
    page.getByRole("button", { name: "保存", exact: true }),
  ).toBeEnabled();
  await expect(page.getByRole("status")).toContainText("项目已保存");
  const ps = await (await page.request.get("/api/projects")).json();
  const name = await page.getByLabel("项目名称", { exact: true }).inputValue();
  const p = ps.find((p) => p.name === name);
  return (await page.request.get("/api/projects/" + p.id)).json();
}
async function uploadProduct(page) {
  const red = await sharp({
    create: { width: 100, height: 100, channels: 4, background: "#ff0000" },
  })
    .png()
    .toBuffer();
  const blue = await sharp({
    create: { width: 50, height: 100, channels: 4, background: "#0000ff" },
  })
    .png()
    .toBuffer();
  const img = await sharp(red)
    .composite([{ input: blue, left: 50, top: 0 }])
    .png()
    .toBuffer();
  await page.getByLabel("导入图片文件").setInputFiles({
    name: "真实测试产品.png",
    mimeType: "image/png",
    buffer: img,
  });
  await expect(page.getByLabel("图层名称", { exact: true })).toHaveValue(
    "真实测试产品.png",
  );
}
async function exportImage(page, { transparent = false, format = "png" } = {}) {
  await page.getByRole("button", { name: "导出作品", exact: true }).click();
  await page.getByLabel("导出格式").selectOption(format);
  if (format === "png")
    await page.getByLabel("透明背景导出").setChecked(transparent);
  const promise = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载图片", exact: true }).click();
  return (await promise).path();
}
test("项目：创建、上传、文字、保存、刷新恢复、重新打开、重命名与删除", async ({
  page,
}) => {
  const errors = await ready(page);
  await newProject(page, "项目流程验收");
  await uploadProduct(page);
  await page.getByRole("button", { name: "添加文字", exact: true }).click();
  await page
    .getByLabel("文字内容", { exact: true })
    .fill("万象画室\n真实产品文案");
  await page.getByLabel("字号", { exact: true }).fill("28");
  await page.getByRole("button", { name: "缩小画布", exact: true }).click();
  const snapshot = await saveSnapshot(page);
  expect(snapshot.canvas.objects).toHaveLength(2);
  expect(snapshot.view.zoom).toBeCloseTo(1 / 1.2);
  expect(snapshot.canvas.objects[1].text).toBe("万象画室\n真实产品文案");
  expect(snapshot.canvas.objects[0].assetId).toBeTruthy();
  await page.reload();
  await expect(page.getByLabel("项目名称", { exact: true })).toHaveValue(
    "项目流程验收",
  );
  await expect(page.locator(".canvas-footer")).toContainText("2 个图层");
  await expect(page.locator(".zoom-value")).toHaveText("83%");
  await page.getByRole("button", { name: "项目", exact: true }).click();
  await page
    .getByRole("button", { name: "项目流程验收 400", exact: false })
    .click();
  await expect(page.getByRole("dialog", { name: "我的项目" })).toHaveCount(0);
  await expect(page.locator(".canvas-footer")).toContainText("2 个图层");
  await expect(page.locator(".zoom-value")).toHaveText("83%");
  await page.getByLabel("项目名称", { exact: true }).fill("重新命名验收");
  await saveSnapshot(page);
  await page.getByRole("button", { name: "项目", exact: true }).click();
  await expect(page.locator(".project-row")).toContainText("重新命名验收");
  page.once("dialog", (d) => d.accept());
  await page.getByLabel("删除重新命名验收").click();
  await expect(
    page.locator(".project-row").filter({ hasText: "重新命名验收" }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});
test("变换、撤销重做、复制、对齐、图层锁定与显示隐藏", async ({ page }) => {
  const errors = await ready(page);
  await newProject(page, "图层变换验收");
  await page.getByRole("button", { name: "添加矩形", exact: true }).click();
  await page.getByLabel("X 位置", { exact: true }).fill("80");
  await page.getByLabel("Y 位置", { exact: true }).fill("60");
  await page.getByLabel("宽度", { exact: true }).fill("120");
  await page.getByLabel("高度", { exact: true }).fill("90");
  await page.getByLabel("旋转角度", { exact: true }).fill("25");
  await expect(page.getByLabel("旋转角度", { exact: true })).toHaveValue("25");
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await page.getByRole("button", { name: "图层", exact: true }).click();
  await page.locator(".layer-main").first().click();
  await expect(page.getByLabel("旋转角度", { exact: true })).toHaveValue("0");
  await page.getByRole("button", { name: "重做", exact: true }).click();
  await page.locator(".layer-main").first().click();
  await expect(page.getByLabel("旋转角度", { exact: true })).toHaveValue("25");
  await page.getByRole("button", { name: "复制", exact: true }).click();
  await expect(page.locator(".layer")).toHaveCount(2);
  await page.getByRole("button", { name: "水平居中", exact: true }).click();
  await page.getByRole("button", { name: "下移", exact: true }).click();
  await page.getByLabel("锁定矩形 副本", { exact: true }).click();
  await expect(page.getByLabel("图层名称")).toBeDisabled();
  await page.getByLabel("解锁矩形 副本", { exact: true }).click();
  await page.getByLabel("隐藏矩形 副本", { exact: true }).click();
  const p = await saveSnapshot(page);
  const copy = p.canvas.objects.find((o) => o.label === "矩形 副本");
  expect(copy.visible).toBe(false);
  expect(copy.locked).toBe(false);
  expect(copy.angle).toBe(25);
  expect(p.canvas.objects.indexOf(copy)).toBe(0);
  expect(errors).toEqual([]);
});
test("图片裁剪、滤镜、文字布局与导出像素一致；透明 PNG 与 JPEG", async ({
  page,
}) => {
  const errors = await ready(page);
  await newProject(page, "导出验收");
  await uploadProduct(page);
  await page.getByText("裁剪图片（原图像素）", { exact: true }).click();
  await page.getByLabel("裁剪 X", { exact: true }).fill("50");
  await page.getByLabel("裁剪宽度", { exact: true }).fill("50");
  await page.getByRole("button", { name: "应用裁剪", exact: true }).click();
  await page.getByLabel("X 位置", { exact: true }).fill("30");
  await page.getByLabel("Y 位置", { exact: true }).fill("30");
  await page.getByLabel("宽度", { exact: true }).fill("100");
  await page.getByLabel("高度", { exact: true }).fill("100");
  await page.getByLabel("亮度", { exact: true }).fill("0.1");
  await page.getByRole("button", { name: "添加文字", exact: true }).click();
  await page.getByLabel("文字内容", { exact: true }).fill("万象画室\n导出排版");
  await page.getByLabel("字号", { exact: true }).fill("24");
  await page.getByLabel("Y 位置", { exact: true }).fill("200");
  await page.getByLabel("旋转角度", { exact: true }).fill("-8");
  await page.getByRole("button", { name: "添加圆形", exact: true }).click();
  await page.getByLabel("X 位置", { exact: true }).fill("230");
  await page.getByLabel("Y 位置", { exact: true }).fill("60");
  await page.getByLabel("透明度 %", { exact: true }).fill("60");
  await page.getByRole("button", { name: "适应窗口", exact: true }).click();
  await expect(page.locator(".zoom-value")).toHaveText("100%");
  await page
    .locator("canvas.upper-canvas")
    .click({ position: { x: 380, y: 380 } });
  await page.waitForTimeout(200);
  const lower = await page
    .locator("canvas.lower-canvas")
    .evaluate((c) => c.toDataURL("image/png"));
  const expected = await sharp(Buffer.from(lower.split(",")[1], "base64"))
    .ensureAlpha()
    .raw()
    .toBuffer();
  const path = await exportImage(page);
  const { data, info } = await sharp(path)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  expect(info.width).toBe(400);
  expect(info.height).toBe(400);
  if (!data.equals(expected)) {
    await fs.writeFile(
      "/tmp/wx-actual.png",
      await sharp(data, { raw: { width: 400, height: 400, channels: 4 } })
        .png()
        .toBuffer(),
    );
    await fs.writeFile(
      "/tmp/wx-expected.png",
      Buffer.from(lower.split(",")[1], "base64"),
    );
    let n = 0,
      minX = 400,
      minY = 400,
      maxX = 0,
      maxY = 0,
      delta = 0;
    for (let i = 0; i < data.length; i++) {
      if (data[i] !== expected[i]) {
        n++;
        delta = Math.max(delta, Math.abs(data[i] - expected[i]));
        const p = Math.floor(i / 4),
          x = p % 400,
          y = Math.floor(p / 400);
        minX = Math.min(x, minX);
        maxX = Math.max(x, maxX);
        minY = Math.min(y, minY);
        maxY = Math.max(y, maxY);
      }
    }
    console.log("PIXEL_DIFF", n, { minX, minY, maxX, maxY, delta });
  }
  expect(data.equals(expected)).toBe(true);
  const blueOffset = (70 * 400 + 70) * 4;
  expect(data[blueOffset + 2]).toBeGreaterThan(240);
  expect(data[blueOffset]).toBeLessThan(50);
  const transparentPath = await exportImage(page, { transparent: true });
  const rgba = await sharp(transparentPath).ensureAlpha().raw().toBuffer();
  expect(rgba[3]).toBe(0);
  expect(rgba[blueOffset + 3]).toBe(255);
  const jpg = await exportImage(page, { format: "jpeg" });
  const meta = await sharp(jpg).metadata();
  expect(meta.format).toBe("jpeg");
  expect(meta.width).toBe(400);
  expect(errors).toEqual([]);
});
test("局部遮罩可画、擦除、预览；无 AI 配置时给出入口而非虚假成功", async ({
  page,
}) => {
  const errors = await ready(page);
  await page.getByRole("button", { name: "局部修改", exact: true }).click();
  const img = await sharp({
    create: { width: 200, height: 160, channels: 4, background: "#887766" },
  })
    .png()
    .toBuffer();
  await page.getByLabel("参考图片文件").setInputFiles({
    name: "参考原图.png",
    mimeType: "image/png",
    buffer: img,
  });
  await expect(
    page.getByRole("button", { name: "涂抹局部修改区域", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "涂抹局部修改区域", exact: true })
    .click();
  const canvas = page.locator(".mask-stage canvas");
  const b = await canvas.boundingBox();
  await page.mouse.move(b.x + b.width * 0.4, b.y + b.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.65, b.y + b.height * 0.5, {
    steps: 8,
  });
  await page.mouse.up();
  await page.getByRole("button", { name: "擦除", exact: true }).click();
  await page.mouse.click(b.x + b.width * 0.4, b.y + b.height * 0.4);
  await page.getByRole("button", { name: "隐藏遮罩", exact: true }).click();
  await expect(canvas).toHaveCSS("opacity", "0");
  await page.getByRole("button", { name: "显示遮罩", exact: true }).click();
  await page.getByRole("button", { name: "确认选区", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "选区已保存 · 重新涂抹", exact: true }),
  ).toBeVisible();
  await page.getByLabel("创作描述").fill("将选中区域改为蓝色，保留其他部分");
  await page.getByRole("button", { name: "配置 AI 服务", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "AI 服务设置" })).toBeVisible();
  await expect(
    page.getByText("待配置 · 画布编辑不受影响", { exact: true }),
  ).toBeVisible();
  const tasks = await (await page.request.get("/api/tasks")).json();
  expect(tasks).toEqual([]);
  expect(errors).toEqual([]);
});
test("模板各元素独立、品牌素材与提示词助手可复用", async ({ page }) => {
  const errors = await ready(page);
  await page
    .getByRole("button", { name: "使用商品主图模板", exact: true })
    .click();
  await page.getByRole("button", { name: "图层", exact: true }).click();
  await expect(page.locator(".layer")).toHaveCount(6);
  await page.getByRole("button", { name: "品牌", exact: true }).click();
  page.once("dialog", (d) => d.accept("真实品牌 · 准确文案"));
  await page
    .locator(".section-heading")
    .filter({ hasText: "常用文案" })
    .getByRole("button", { name: "添加" })
    .click();
  await expect(page.locator(".brand-copies")).toContainText(
    "真实品牌 · 准确文案",
  );
  await page.locator(".brand-copies").getByRole("button").first().click();
  await expect(page.locator(".canvas-footer")).toContainText("7 个图层");
  await page.getByLabel("创作描述").fill("青山品牌的陶瓷杯");
  await page.getByRole("button", { name: "提示词助手", exact: true }).click();
  await expect(page.getByLabel("整理后的提示词")).toContainText(
    "青山品牌的陶瓷杯",
  );
  await page
    .getByRole("button", { name: "确认并使用提示词", exact: true })
    .click();
  await expect(page.getByLabel("创作描述")).toHaveValue(
    /主体：青山品牌的陶瓷杯/,
  );
  expect(errors).toEqual([]);
});
test("鼠标拖动、控制点缩放与旋转、快捷键撤销重做", async ({ page }) => {
  const errors = await ready(page);
  await newProject(page, "鼠标操作验收");
  await page.getByRole("button", { name: "添加矩形", exact: true }).click();
  const box = await page.locator("canvas.upper-canvas").boundingBox();
  await page.mouse.move(box.x + 150, box.y + 150);
  await page.mouse.down();
  await page.mouse.move(box.x + 190, box.y + 180, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByLabel("X 位置", { exact: true })).toHaveValue("140");
  await expect(page.getByLabel("Y 位置", { exact: true })).toHaveValue("150");
  const beforeW = Number(
    await page.getByLabel("宽度", { exact: true }).inputValue(),
  );
  const beforeH = Number(
    await page.getByLabel("高度", { exact: true }).inputValue(),
  );
  await page.mouse.move(box.x + 140 + beforeW, box.y + 150 + beforeH);
  await page.mouse.down();
  await page.mouse.move(
    box.x + 140 + beforeW + 35,
    box.y + 150 + beforeH + 30,
    { steps: 8 },
  );
  await page.mouse.up();
  expect(
    Number(await page.getByLabel("宽度", { exact: true }).inputValue()),
  ).toBeGreaterThan(beforeW + 15);
  const w = Number(await page.getByLabel("宽度", { exact: true }).inputValue());
  await page.mouse.move(box.x + 140 + w / 2, box.y + 150 - 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 140 + w / 2 + 70, box.y + 150 - 15, {
    steps: 10,
  });
  await page.mouse.up();
  expect(
    Number(await page.getByLabel("旋转角度", { exact: true }).inputValue()),
  ).not.toBe(0);
  await page.locator(".canvas-topline").click();
  await page.keyboard.press("Control+z");
  await expect(page.getByLabel("旋转角度", { exact: true })).toHaveValue("0");
  await page.keyboard.press("Control+Shift+z");
  expect(
    Number(await page.getByLabel("旋转角度", { exact: true }).inputValue()),
  ).not.toBe(0);
  expect(errors).toEqual([]);
});
test("任务界面契约（模拟服务）：进行中去重、失败提示、结果预览下载及加入画布", async ({
  page,
}) => {
  let fakeTasks = [],
    posted = 0;
  await page.route("**/api/config", async (route) => {
    const actual = await route.fetch();
    const c = await actual.json();
    await route.fulfill({ json: { ...c, configured: true } });
  });
  await page.route("**/api/tasks", async (route) => {
    if (route.request().method() === "POST") {
      posted++;
      const body = route.request().postDataJSON();
      const t = {
        id: crypto.randomUUID(),
        requestId: body.requestId,
        status: "running",
        createdAt: new Date().toISOString(),
        input: { ...body.input, actualPrompt: body.input.prompt },
        service: {
          provider: "openai-images",
          model: "gpt-image-1",
          baseURL: "https://api.openai.com/v1",
        },
        results: [],
      };
      fakeTasks = [t, ...fakeTasks];
      await route.fulfill({ status: 202, json: t });
    } else await route.fulfill({ json: fakeTasks });
  });
  const errors = await ready(page);
  await newProject(page, "模拟任务界面验收");
  await uploadProduct(page);
  const asset = (await (await page.request.get("/api/assets")).json()).find(
    (a) => a.name === "真实测试产品.png",
  );
  await page.getByRole("button", { name: "AI 创作", exact: true }).click();
  await page.getByLabel("创作描述").fill("测试替身任务，不调用真实服务");
  await page.getByRole("button", { name: "开始生成", exact: true }).click();
  await expect(page.locator(".task-state")).toHaveText("生成中");
  await page.getByRole("button", { name: "AI 创作", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "相同任务进行中…", exact: true }),
  ).toBeDisabled();
  expect(posted).toBe(1);
  fakeTasks[0] = {
    ...fakeTasks[0],
    status: "failed",
    error: "服务限流或额度不足；未自动重试。",
  };
  await page.getByRole("button", { name: "历史", exact: false }).click();
  await expect(page.locator(".task-error")).toContainText("额度不足");
  await expect(page.locator(".task-results img")).toHaveCount(0);
  await page.getByRole("button", { name: "AI 创作", exact: true }).click();
  await page.getByLabel("创作描述").fill("第二个测试替身任务");
  await page.getByRole("button", { name: "开始生成", exact: true }).click();
  fakeTasks[0] = { ...fakeTasks[0], status: "succeeded", results: [asset] };
  await expect(page.locator(".task-results img")).toHaveCount(1);
  await page.locator(".task-results>div>button").click();
  await expect(
    page.getByRole("dialog", { name: "生成结果预览" }),
  ).toBeVisible();
  const d = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载原图", exact: true }).click();
  expect((await d).suggestedFilename()).toContain(".png");
  await page.getByRole("button", { name: "添加到画布", exact: true }).click();
  await expect(page.locator(".canvas-footer")).toContainText("2 个图层");
  expect(posted).toBe(2);
  expect(errors).toEqual([]);
});
