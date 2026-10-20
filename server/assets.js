import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
export const MAX_FILE = 10 * 1024 * 1024;
export const ASSET_ID = /^[a-f0-9-]{36}$/;
export async function saveAsset(store, buffer, name = "图片", kind = "image") {
  if (buffer.length > MAX_FILE) throw new Error("图片不能超过 10MB");
  const meta = await sharp(buffer, { limitInputPixels: 24000000 }).metadata();
  if (!["png", "jpeg", "webp"].includes(meta.format) || meta.pages > 1)
    throw new Error("仅支持静态 PNG、JPEG、WebP 图片");
  const normalized = await sharp(buffer, { limitInputPixels: 24000000 })
    .rotate()
    .png()
    .toBuffer({ resolveWithObject: true });
  const id = crypto.randomUUID();
  await fs.writeFile(
    path.join(store.dir, "assets", `${id}.png`),
    normalized.data,
    { mode: 0o600 },
  );
  const asset = {
    id,
    name: name.slice(0, 100),
    kind,
    width: normalized.info.width,
    height: normalized.info.height,
    url: `/api/assets/${id}`,
    createdAt: new Date().toISOString(),
  };
  await store.write(`assets/${id}.json`, asset);
  return asset;
}
export async function assetBuffer(store, id) {
  if (!ASSET_ID.test(id)) throw new Error("无效的素材标识");
  return fs.readFile(path.join(store.dir, "assets", `${id}.png`));
}
export async function validateMask(original, mask) {
  if (mask.length >= 4 * 1024 * 1024) throw new Error("遮罩必须小于 4MB");
  const a = await sharp(original).metadata(),
    b = await sharp(mask).metadata();
  if (
    b.format !== "png" ||
    a.width !== b.width ||
    a.height !== b.height ||
    !b.hasAlpha
  )
    throw new Error("遮罩必须是与原图尺寸相同、带透明通道的 PNG");
  const { data, info } = await sharp(mask)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let transparent = false,
    opaque = false;
  for (let i = 3; i < data.length; i += info.channels) {
    if (data[i] === 0) transparent = true;
    if (data[i] === 255) opaque = true;
  }
  if (!transparent) throw new Error("请先涂抹要修改的区域");
  if (!opaque)
    throw new Error("遮罩覆盖了整张图片，请保留部分未选区域或使用参考图生成");
}
