export async function api(path, options = {}) {
  const { body, ...rest } = options;
  const form = body instanceof FormData;
  const res = await fetch("/api" + path, {
    ...rest,
    headers: {
      "X-Studio-Request": "1",
      ...(!form && body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    body: form ? body : body ? JSON.stringify(body) : undefined,
  });
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error("服务返回异常，请检查后端是否正在运行");
  }
  if (!res.ok) {
    const e = new Error(data.error || "请求失败");
    e.status = res.status;
    e.passwordRequired = data.passwordRequired;
    throw e;
  }
  return data;
}
export async function upload(file, kind = "image") {
  const body = new FormData();
  body.append("kind", kind);
  body.append("name", file.name);
  body.append("file", file);
  return api("/assets", { method: "POST", body });
}
export function download(url, name) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
}
export function fileCheck(file) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new Error("仅支持 PNG、JPEG、WebP 图片");
  if (file.size > 10 * 1024 * 1024) throw new Error("图片不能超过 10MB");
}
