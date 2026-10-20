# AI 接口与能力约束

## 官方依据

2026-10-20 开发前读取 OpenAI 官方仓库的 OpenAPI 文档：

- https://raw.githubusercontent.com/openai/openai-openapi/master/openapi.yaml
- schema：`CreateImageRequest`、`CreateImageEditRequest`、`ImagesResponse`
- 路径：`POST /images/generations`、`POST /images/edits`

开发者网站指南在本次执行环境返回 HTTP 403，故以成功读取的官方 OpenAPI 为依据，没有据此假定第三方兼容性。

## 输入结构

```ts
type ImageTaskInput = {
  mode: "text" | "reference" | "inpaint";
  prompt: string; // 原始用户提示词，最多 12000 字符
  actualPrompt: string; // 服务端计算，用户内容 + 风格 + 局部保留要求
  style: "原始" | "摄影" | "插画" | "水彩" | "3D 设计" | "极简";
  size: "1024x1024" | "1024x1536" | "1536x1024";
  quality: "low" | "medium" | "high";
  count: 1 | 2 | 3 | 4;
  assetId?: string; // 参考图 / 局部修改原图
  maskId?: string; // 局部修改 PNG 遮罩
};
```

`actualPrompt` 不接受前端直接赋值，由后端从已校验输入生成。服务注册表以实际集成过的协议能力为准，每种模式必须有对应标志；扩展服务时在 `server/ai.js` 建立新适配器和模型能力，前端只显示支持的模式和参数。当前仅一个 OpenAI Images 适配器，三个已实现 GPT Image 型号，不提供未接入服务的空按钮。

## 请求映射

文字：发送 JSON `{model,prompt,n,size,quality,output_format:'png'}` 到 `${baseURL}/images/generations`。

参考图：发送 multipart，同名参数加一个 PNG `image` 到 `${baseURL}/images/edits`。没有发送 `strength`，也没有臆造参考强度参数。

局部修改：同参考图请求，另外发送 `mask`，原图、遮罩、提示词必须同时存在。原图和遮罩尺寸必须相同；遮罩为小于 4MB 的 PNG，透明 alpha=0 为待修改区域，alpha=255 为保留区域。前端以紫色预览遮罩，上传时转换透明语义，后端再校验。不是把紫色覆盖图当作原图发送。模型仍可能更改未选区域，不保证像素锁定。

这些 GPT Image 模型的响应按 `data[].b64_json` 处理，收到 URL-only / 空结果 / 数量不符响应会失败，不会悄悄下载未知外部 URL。图片再次经过解码、格式校验和私有存储后才标记成功。

## 输出与状态

```ts
type Task = {
  id: string;
  requestId: string; // 持久化的幂等标识
  status: "queued" | "running" | "succeeded" | "failed";
  input: ImageTaskInput;
  service: { provider: "openai-images"; baseURL: string; model: string };
  results: { id: string; url: string; width: number; height: number }[];
  error?: string; // 不含上游原始响应、请求头或密钥
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
};
```

单进程串行队列；无自动付费重试。服务重启时等待/生成中任务标记中断失败并提示可能已计费。历史复用由用户确认新一次生成；前端阻止相同参数的进行中任务重复提交，后端以 `requestId` 去重相同 HTTP 请求。

调用超时 180 秒；401/403 给出凭证或权限错误，429 明示限流/额度不足，400/422 提示参数或内容限制，5xx 提示服务不可用。请求错误时不记录原始响应，以避免服务端意外回显凭证。没有客户端密钥、localStorage 密钥或项目密钥字段。

## 扩展方式

新增服务需先查官方文档，定义各模式输入格式、mask 语义、尺寸、质量、批次和输出结构。将差异限制在适配器内，再加契约测试。参考强度、抠图、扩图、放大、一致性管理等仅在真实适配器和验收完成后提供入口。
