import crypto from "node:crypto";
import { generateImages } from "./ai.js";
import { assetBuffer, saveAsset, validateMask } from "./assets.js";
export class TaskQueue {
  constructor(store, readConfig, { generator = generateImages } = {}) {
    this.store = store;
    this.readConfig = readConfig;
    this.generator = generator;
    this.busy = false;
    this.pending = [];
  }
  async init() {
    for (const task of await this.store.records("tasks"))
      if (["queued", "running"].includes(task.status)) {
        task.status = "failed";
        task.error =
          "服务重启导致任务中断，可能已计费；请检查服务商记录后再手动重试。";
        await this.store.write(`tasks/${task.id}.json`, task);
      }
  }
  async submit(input, requestId) {
    const existing = (await this.store.records("tasks")).find(
      (t) => t.requestId === requestId,
    );
    if (existing) return existing;
    const config = await this.readConfig();
    if (!config.apiKey) throw new Error("AI 服务待配置，请先打开服务设置。");
    const task = {
      id: crypto.randomUUID(),
      requestId,
      status: "queued",
      createdAt: new Date().toISOString(),
      input,
      service: {
        provider: "openai-images",
        baseURL: config.baseURL,
        model: config.model,
      },
      results: [],
    };
    await this.store.write(`tasks/${task.id}.json`, task);
    this.pending.push({ task, config });
    this.drain();
    return task;
  }
  async drain() {
    if (this.busy) return;
    this.busy = true;
    try {
      while (this.pending.length) {
        const { task, config } = this.pending.shift();
        try {
          task.status = "running";
          task.startedAt = new Date().toISOString();
          await this.store.write(`tasks/${task.id}.json`, task);
          const original = task.input.assetId
            ? await assetBuffer(this.store, task.input.assetId)
            : undefined;
          const mask = task.input.maskId
            ? await assetBuffer(this.store, task.input.maskId)
            : undefined;
          if (task.input.mode === "inpaint") await validateMask(original, mask);
          const images = await this.generator({
            config,
            input: task.input,
            original,
            mask,
          });
          const results = [];
          for (const buffer of images)
            results.push(
              await saveAsset(this.store, buffer, "AI 生成图片", "generated"),
            );
          task.results = results;
          task.status = "succeeded";
        } catch (e) {
          task.status = "failed";
          task.error = e.message.startsWith("Input")
            ? "图片解码失败，请检查素材"
            : e.message;
        }
        task.completedAt = new Date().toISOString();
        await this.store.write(`tasks/${task.id}.json`, task);
      }
    } finally {
      this.busy = false;
    }
  }
}
