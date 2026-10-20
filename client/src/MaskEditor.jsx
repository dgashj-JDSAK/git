import React, { useRef, useState } from "react";
import { Brush, Eraser, Eye, RotateCcw } from "lucide-react";
import { upload } from "./api";
export default function MaskEditor({ asset, onClose, onConfirm, notify }) {
  const ref = useRef(),
    drawing = useRef(false),
    last = useRef(null);
  const [tool, setTool] = useState("brush"),
    [size, setSize] = useState(60),
    [preview, setPreview] = useState(true),
    [busy, setBusy] = useState(false);
  const point = (e) => {
    const r = ref.current.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) * asset.width) / r.width,
      y: ((e.clientY - r.top) * asset.height) / r.height,
    };
  };
  function draw(e, start = false) {
    const c = ref.current.getContext("2d");
    const p = point(e);
    c.globalCompositeOperation =
      tool === "erase" ? "destination-out" : "source-over";
    c.strokeStyle = "#9b83ff";
    c.fillStyle = "#9b83ff";
    c.lineCap = "round";
    c.lineJoin = "round";
    c.lineWidth = size;
    c.beginPath();
    if (start || !last.current) {
      c.arc(p.x, p.y, size / 2, 0, Math.PI * 2);
      c.fill();
    } else {
      c.moveTo(last.current.x, last.current.y);
      c.lineTo(p.x, p.y);
      c.stroke();
    }
    last.current = p;
  }
  async function confirm() {
    setBusy(true);
    try {
      const c = ref.current,
        ctx = c.getContext("2d"),
        data = ctx.getImageData(0, 0, c.width, c.height);
      let selected = 0;
      for (let i = 0; i < data.data.length; i += 4) {
        const alpha = data.data[i + 3];
        data.data[i] = data.data[i + 1] = data.data[i + 2] = 255;
        data.data[i + 3] = alpha ? 0 : 255;
        if (alpha) selected++;
      }
      if (!selected) throw new Error("请先涂抹需要修改的区域");
      if (selected === c.width * c.height)
        throw new Error("请保留部分未选区域");
      const output = document.createElement("canvas");
      output.width = c.width;
      output.height = c.height;
      output.getContext("2d").putImageData(data, 0, 0);
      const blob = await new Promise((r) => output.toBlob(r, "image/png"));
      if (blob.size >= 4 * 1024 * 1024)
        throw new Error("遮罩不能超过 4MB，请减小区域复杂度");
      const mask = await upload(
        new File([blob], "局部编辑遮罩.png", { type: "image/png" }),
        "mask",
      );
      onConfirm(mask);
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <section
        className="modal mask-modal"
        role="dialog"
        aria-modal="true"
        aria-label="涂抹局部修改区域"
      >
        <div className="modal-title">
          <div>
            <h2>涂抹你想改变的地方</h2>
            <p>紫色区域将被修改 · 基于原始素材，不含画布上的滤镜与裁剪</p>
          </div>
          <button onClick={onClose} aria-label="关闭遮罩编辑">
            ×
          </button>
        </div>
        <div className="mask-toolbar">
          <button
            className={tool === "brush" ? "active" : ""}
            onClick={() => setTool("brush")}
          >
            <Brush size={16} />
            画笔
          </button>
          <button
            className={tool === "erase" ? "active" : ""}
            onClick={() => setTool("erase")}
          >
            <Eraser size={16} />
            擦除
          </button>
          <label>
            画笔 {size}px{" "}
            <input
              aria-label="画笔大小"
              type="range"
              min="4"
              max="300"
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
            />
          </label>
          <button onClick={() => setPreview(!preview)}>
            <Eye size={16} />
            {preview ? "隐藏" : "显示"}遮罩
          </button>
          <button
            onClick={() => {
              ref.current
                .getContext("2d")
                .clearRect(0, 0, asset.width, asset.height);
            }}
          >
            <RotateCcw size={16} />
            清空
          </button>
        </div>
        <div className="mask-stage">
          <div
            style={{
              aspectRatio: `${asset.width}/${asset.height}`,
              width: `min(100%, ${Math.min(760, (480 * asset.width) / asset.height)}px)`,
            }}
          >
            <img src={asset.url} alt="原图" />
            <canvas
              ref={ref}
              width={asset.width}
              height={asset.height}
              style={{ opacity: preview ? 0.65 : 0 }}
              onPointerDown={(e) => {
                drawing.current = true;
                last.current = null;
                e.currentTarget.setPointerCapture(e.pointerId);
                draw(e, true);
              }}
              onPointerMove={(e) => {
                if (drawing.current) draw(e);
              }}
              onPointerUp={() => {
                drawing.current = false;
                last.current = null;
              }}
              onPointerCancel={() => {
                drawing.current = false;
              }}
            />
          </div>
        </div>
        <p className="notice">
          向服务提交同尺寸原图、PNG
          透明遮罩和你的指令。模型会尽量保留未选区域，不能保证像素级一致。
        </p>
        <footer>
          <button onClick={onClose}>取消</button>
          <button className="primary" disabled={busy} onClick={confirm}>
            {busy ? "保存遮罩中…" : "确认选区"}
          </button>
        </footer>
      </section>
    </div>
  );
}
