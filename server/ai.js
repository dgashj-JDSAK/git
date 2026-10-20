import dns from "node:dns/promises";
import net from "node:net";
import { EnvHttpProxyAgent } from "undici";
let proxyAgent;
function dispatcher() {
  if (
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy
  ) {
    return (proxyAgent ||= new EnvHttpProxyAgent());
  }
  return undefined;
}
export const MODELS = {
  "gpt-image-1": {
    label: "GPT Image 1",
    text: true,
    reference: true,
    inpaint: true,
    sizes: ["1024x1024", "1024x1536", "1536x1024"],
    qualities: ["low", "medium", "high"],
    maxCount: 4,
  },
  "gpt-image-1-mini": {
    label: "GPT Image 1 Mini",
    text: true,
    reference: true,
    inpaint: true,
    sizes: ["1024x1024", "1024x1536", "1536x1024"],
    qualities: ["low", "medium", "high"],
    maxCount: 4,
  },
  "gpt-image-1.5": {
    label: "GPT Image 1.5",
    text: true,
    reference: true,
    inpaint: true,
    sizes: ["1024x1024", "1024x1536", "1536x1024"],
    qualities: ["low", "medium", "high"],
    maxCount: 4,
  },
};
export function privateIP(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  return true; // Custom IPv6 endpoints are not supported in v1; fail closed.
}
export async function validateBaseURL(baseURL) {
  let u;
  try {
    u = new URL(baseURL);
  } catch {
    throw new Error("服务地址格式不正确");
  }
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    (u.port && u.port !== "443")
  )
    throw new Error(
      "服务地址必须是无凭证、无查询参数的 HTTPS 地址（443 端口）",
    );
  // The fixed official host is trusted and can be resolved by an enterprise proxy.
  // Do not require local DNS for it: many proxy-only machines have no public DNS.
  if (u.hostname === "api.openai.com") return u.toString().replace(/\/$/, "");
  let addresses;
  try {
    addresses = await dns.lookup(u.hostname, { all: true, family: 4 });
  } catch {
    throw new Error(
      "无法解析自定义服务地址，请检查域名与服务器 DNS；官方地址可通过现有 HTTPS 代理访问",
    );
  }
  if (!addresses.length || addresses.some((x) => privateIP(x.address)))
    throw new Error("服务地址不能指向本机、内网或不受支持的 IPv6 地址");
  return u.toString().replace(/\/$/, "");
}
export function publicConfig(config) {
  return {
    baseURL: config.baseURL,
    model: config.model,
    configured: !!config.apiKey,
    models: MODELS,
    capabilities: MODELS[config.model],
    provider: "openai-images",
    timeoutSeconds: 180,
  };
}
export function providerError(status) {
  if (status === 401 || status === 403)
    return "凭证无效、模型权限不足或网络策略拒绝访问，请检查服务设置与服务器网络。";
  if (status === 429)
    return "服务限流或额度不足，请在服务商控制台检查余额与用量；未自动重试。";
  if (status === 400 || status === 422)
    return "服务拒绝了参数或内容，请检查模型权限、图片及提示词。";
  if (status >= 500) return "AI 服务暂时不可用，请稍后手动重试。";
  return `AI 请求失败（HTTP ${status}）。请检查服务配置。`;
}
// OpenAI Images API adapter. No retry: a retry may incur another charge.
export async function generateImages({
  config,
  input,
  original,
  mask,
  fetcher = fetch,
  checkURL = true,
}) {
  if (!config.apiKey) throw new Error("AI 服务待配置，请先在设置中保存凭证。");
  const caps = MODELS[config.model];
  if (!caps || !caps[input.mode]) throw new Error("当前模型不支持此能力");
  if (checkURL) await validateBaseURL(config.baseURL);
  const common = {
    model: config.model,
    prompt: input.actualPrompt,
    n: input.count,
    size: input.size,
    quality: input.quality,
    output_format: "png",
  };
  let body,
    headers = { Authorization: `Bearer ${config.apiKey}` },
    endpoint;
  if (input.mode === "text") {
    endpoint = "generations";
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(common);
  } else {
    endpoint = "edits";
    body = new FormData();
    for (const [k, v] of Object.entries(common)) body.set(k, String(v));
    body.append(
      "image",
      new Blob([original], { type: "image/png" }),
      "original.png",
    );
    if (input.mode === "inpaint") {
      if (!mask) throw new Error("局部修改缺少遮罩");
      body.set("mask", new Blob([mask], { type: "image/png" }), "mask.png");
    }
  }
  let res;
  try {
    res = await fetcher(
      `${config.baseURL.replace(/\/$/, "")}/images/${endpoint}`,
      {
        method: "POST",
        dispatcher: dispatcher(),
        headers,
        body,
        signal: AbortSignal.timeout(180000),
        redirect: "error",
      },
    );
  } catch (e) {
    if (e.name === "TimeoutError" || e.name === "AbortError")
      throw new Error(
        "生成请求超时，服务端可能已计费；请检查服务商记录后再手动重试。",
      );
    throw new Error("无法连接 AI 服务，请检查服务地址和网络；未自动重试。");
  }
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(providerError(res.status));
  }
  // Bound the response to prevent unbounded upstream allocations.
  let bytes = 0,
    chunks = [];
  for await (const chunk of res.body) {
    bytes += chunk.length;
    if (bytes > 80 * 1024 * 1024) throw new Error("AI 返回内容过大");
    chunks.push(chunk);
  }
  let result;
  try {
    result = JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    throw new Error("AI 服务返回了无效 JSON");
  }
  if (
    !Array.isArray(result.data) ||
    result.data.length !== input.count ||
    result.data.some((x) => typeof x.b64_json !== "string" || !x.b64_json)
  )
    throw new Error(
      "AI 服务未返回完整的图片结果（此适配器要求 b64_json），没有生成成功记录。",
    );
  return result.data.map((x) => Buffer.from(x.b64_json, "base64"));
}
