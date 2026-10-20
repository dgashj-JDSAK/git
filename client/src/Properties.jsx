import React, { useState, useEffect } from "react";
import {
  Copy,
  Trash2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ArrowUpToLine,
  ArrowDownToLine,
  FlipHorizontal,
  FlipVertical,
  RotateCw,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
export function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function NumberField({ label, value, onChange, min, max, step = 1 }) {
  return (
    <Field label={label}>
      <input
        type="number"
        value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          if (e.target.value !== "") {
            const v = Number(e.target.value);
            if (
              Number.isFinite(v) &&
              (min === undefined || v >= min) &&
              (max === undefined || v <= max)
            )
              onChange(v);
          }
        }}
      />
    </Field>
  );
}
export function Properties({ editor, info, notify }) {
  const o = info.selected;
  const [crop, setCrop] = useState({ x: 0, y: 0, width: 100, height: 100 });
  useEffect(() => {
    if (o?.type === "image")
      setCrop({
        x: o.cropX || 0,
        y: o.cropY || 0,
        width: o.width,
        height: o.height,
      });
  }, [o?.id]);
  if (!o)
    return (
      <div className="empty compact">
        <span className="empty-glyph">↗</span>
        <h3>每个细节，都由你掌握</h3>
        <p>选择画布上的对象，即可调整位置、文字与图片效果。</p>
      </div>
    );
  const update = (v) => editor.update(v);
  const image = o.type === "image",
    text = o.type === "textbox";
  return (
    <div className="properties">
      <div className="section-heading">
        <h3>对象属性</h3>
        <span className="pill">
          {image
            ? "图片"
            : text
              ? "文字"
              : o.type === "circle"
                ? "圆形"
                : "矩形"}
        </span>
      </div>
      <Field label="图层名称">
        <input
          aria-label="图层名称"
          value={o.label || ""}
          onChange={(e) => update({ label: e.target.value })}
          disabled={o.locked}
        />
      </Field>
      {o.locked && <p className="notice">此图层已锁定，请先在图层列表解锁。</p>}
      <fieldset disabled={o.locked}>
        <div className="grid2">
          <NumberField
            label="X 位置"
            value={o.left}
            onChange={(left) => update({ left })}
          />
          <NumberField
            label="Y 位置"
            value={o.top}
            onChange={(top) => update({ top })}
          />
          <NumberField
            label="宽度"
            value={o.width * o.scaleX}
            min={1}
            max={12000}
            onChange={(v) => update({ scaleX: v / o.width })}
          />
          <NumberField
            label="高度"
            value={o.height * o.scaleY}
            min={1}
            max={12000}
            onChange={(v) => update({ scaleY: v / o.height })}
          />
          <NumberField
            label="旋转角度"
            value={o.angle}
            onChange={(angle) => update({ angle })}
          />
          <NumberField
            label="透明度 %"
            value={o.opacity * 100}
            min={0}
            max={100}
            onChange={(v) => update({ opacity: v / 100 })}
          />
        </div>
        <Field label="画布对齐">
          <div className="button-group align-buttons">
            {[
              ["left", AlignLeft, "左对齐"],
              ["center", AlignCenter, "水平居中"],
              ["right", AlignRight, "右对齐"],
              ["top", ArrowUpToLine, "顶对齐"],
              ["middle", AlignCenter, "垂直居中"],
              ["bottom", ArrowDownToLine, "底对齐"],
            ].map(([a, Icon, label]) => (
              <button
                key={a}
                title={label}
                aria-label={label}
                onClick={() => editor.align(a)}
              >
                <Icon size={16} />
              </button>
            ))}
          </div>
        </Field>
        {text && (
          <>
            <div className="divider" />
            <h3>文字排版</h3>
            <Field label="文字内容">
              <textarea
                aria-label="文字内容"
                rows={3}
                value={o.text}
                onChange={(e) => update({ text: e.target.value })}
              />
            </Field>
            <Field label="字体">
              <select
                value={o.fontFamily}
                onChange={(e) => update({ fontFamily: e.target.value })}
              >
                <option
                  value={
                    '"Noto Sans CJK SC", "Microsoft YaHei", "PingFang SC", sans-serif'
                  }
                >
                  中文黑体
                </option>
                <option value='"Noto Serif CJK SC", "SimSun", serif'>
                  中文宋体
                </option>
                <option value="sans-serif">无衬线</option>
                <option value="serif">衬线</option>
                <option value="monospace">等宽</option>
              </select>
            </Field>
            <div className="grid2">
              <NumberField
                label="字号"
                value={o.fontSize}
                min={6}
                max={600}
                onChange={(fontSize) => update({ fontSize })}
              />
              <NumberField
                label="行距"
                value={o.lineHeight}
                min={0.5}
                max={4}
                step={0.1}
                onChange={(lineHeight) => update({ lineHeight })}
              />
              <Field label="字重">
                <select
                  value={o.fontWeight}
                  onChange={(e) => update({ fontWeight: e.target.value })}
                >
                  <option value="normal">常规</option>
                  <option value="bold">粗体</option>
                </select>
              </Field>
              <Field label="文字对齐">
                <select
                  value={o.textAlign}
                  onChange={(e) => update({ textAlign: e.target.value })}
                >
                  <option value="left">左对齐</option>
                  <option value="center">居中</option>
                  <option value="right">右对齐</option>
                  <option value="justify">两端对齐</option>
                </select>
              </Field>
            </div>
          </>
        )}
        {!image && (
          <Field label={text ? "文字颜色" : "填充颜色"}>
            <div className="color-input">
              <input
                type="color"
                value={
                  typeof o.fill === "string" && o.fill.startsWith("#")
                    ? o.fill
                    : "#000000"
                }
                onChange={(e) => update({ fill: e.target.value })}
              />
              <span>{o.fill}</span>
            </div>
          </Field>
        )}
        {image && (
          <>
            <div className="divider" />
            <h3>图片调整</h3>
            <div className="button-group">
              <button onClick={() => update({ flipX: !o.flipX })}>
                <FlipHorizontal size={15} />
                水平翻转
              </button>
              <button onClick={() => update({ flipY: !o.flipY })}>
                <FlipVertical size={15} />
                垂直翻转
              </button>
              <button
                title="旋转 90°"
                onClick={() => update({ angle: (o.angle + 90) % 360 })}
              >
                <RotateCw size={15} />
              </button>
            </div>
            <Field label={`亮度 ${Math.round((o.brightness || 0) * 100)}`}>
              <input
                type="range"
                aria-label="亮度"
                min="-1"
                max="1"
                step=".01"
                value={o.brightness || 0}
                onChange={(e) =>
                  editor.setFilters({ brightness: Number(e.target.value) })
                }
              />
            </Field>
            <Field label={`对比度 ${Math.round((o.contrast || 0) * 100)}`}>
              <input
                type="range"
                aria-label="对比度"
                min="-.9"
                max=".9"
                step=".01"
                value={o.contrast || 0}
                onChange={(e) =>
                  editor.setFilters({ contrast: Number(e.target.value) })
                }
              />
            </Field>
            <details>
              <summary>裁剪图片（原图像素）</summary>
              <div className="grid2">
                {["x", "y", "width", "height"].map((k, i) => (
                  <NumberField
                    key={k}
                    label={["裁剪 X", "裁剪 Y", "裁剪宽度", "裁剪高度"][i]}
                    value={crop[k]}
                    min={k === "x" || k === "y" ? 0 : 1}
                    onChange={(v) => setCrop({ ...crop, [k]: v })}
                  />
                ))}
              </div>
              <div className="button-group">
                <button
                  onClick={() => {
                    try {
                      editor.crop(crop);
                    } catch (e) {
                      notify(e.message);
                    }
                  }}
                >
                  应用裁剪
                </button>
                <button
                  onClick={() => {
                    const el = o._originalElement;
                    const v = {
                      x: 0,
                      y: 0,
                      width: el.naturalWidth,
                      height: el.naturalHeight,
                    };
                    setCrop(v);
                    editor.crop(v);
                  }}
                >
                  恢复原图范围
                </button>
              </div>
            </details>
          </>
        )}
        <div className="divider" />
        <div className="button-group">
          <button onClick={() => editor.layer(o, "up")}>
            <ChevronUp size={16} />
            上移
          </button>
          <button onClick={() => editor.layer(o, "down")}>
            <ChevronDown size={16} />
            下移
          </button>
        </div>
        <div className="button-group">
          <button onClick={() => editor.duplicate()}>
            <Copy size={15} />
            复制
          </button>
          <button className="danger-text" onClick={() => editor.remove()}>
            <Trash2 size={15} />
            删除图层
          </button>
        </div>
      </fieldset>
    </div>
  );
}
