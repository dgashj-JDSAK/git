import React, { useState } from "react";
import { Field, NumberField } from "./Properties";
import { RATIOS } from "./templates";
import { api } from "./api";
export function Modal({ title, subtitle, children, onClose, wide = false }) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className={"modal " + (wide ? "wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-title">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export function ProjectDialog({ onCreate, onClose }) {
  const [name, setName] = useState("未命名作品"),
    [w, setW] = useState(1080),
    [h, setH] = useState(1080),
    [bg, setBg] = useState("#f3f0e9");
  return (
    <Modal
      title="开启新的创作"
      subtitle="从合适的尺寸开始，画布里有无限可能。"
      onClose={onClose}
    >
      <Field label="项目名称">
        <input
          aria-label="新项目名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
        />
      </Field>
      <div className="ratio-grid">
        {RATIOS.map(([s, a, b]) => (
          <button
            key={s}
            className={w === a && h === b ? "active" : ""}
            onClick={() => {
              setW(a);
              setH(b);
            }}
          >
            <span className="ratio-icon" style={{ aspectRatio: `${a}/${b}` }} />
            {s}
          </button>
        ))}
      </div>
      <div className="grid2">
        <NumberField
          label="画布宽度"
          value={w}
          min={64}
          max={4096}
          onChange={setW}
        />
        <NumberField
          label="画布高度"
          value={h}
          min={64}
          max={4096}
          onChange={setH}
        />
      </div>
      <Field label="背景">
        <div className="button-group">
          <button
            className={bg !== "transparent" ? "active" : ""}
            onClick={() => setBg("#f3f0e9")}
          >
            纯色背景
          </button>
          <button
            className={bg === "transparent" ? "active" : ""}
            onClick={() => setBg("transparent")}
          >
            透明背景
          </button>
          {bg !== "transparent" && (
            <input
              aria-label="背景颜色"
              type="color"
              value={bg}
              onChange={(e) => setBg(e.target.value)}
            />
          )}
        </div>
      </Field>
      <footer>
        <button onClick={onClose}>取消</button>
        <button
          className="primary"
          disabled={!name.trim()}
          onClick={() =>
            onCreate({ name: name.trim(), width: w, height: h, background: bg })
          }
        >
          创建画布
        </button>
      </footer>
    </Modal>
  );
}
export function Settings({ config, onSaved, onClose, notify }) {
  const [baseURL, setURL] = useState(config.baseURL),
    [model, setModel] = useState(config.model),
    [key, setKey] = useState(""),
    [clearKey, setClear] = useState(false),
    [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const c = await api("/config", {
        method: "PUT",
        body: { baseURL, model, apiKey: key || undefined, clearKey },
      });
      setKey("");
      onSaved(c);
      onClose();
      notify("服务设置已保存；实际调用时才产生服务商费用");
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="AI 服务设置"
      subtitle="凭证仅保存在服务端，不写入项目或浏览器存储。"
      onClose={onClose}
    >
      <div className={"status-banner " + (config.configured ? "ready" : "")}>
        <span className="status-dot" />
        {config.configured
          ? "已配置凭证 · 尚需实际请求验证"
          : "待配置 · 画布编辑不受影响"}
      </div>
      <Field label="服务适配器">
        <input readOnly value="OpenAI Images API（官方接口）" />
      </Field>
      <Field label="服务地址">
        <input
          aria-label="服务地址"
          value={baseURL}
          onChange={(e) => setURL(e.target.value)}
          placeholder="https://api.openai.com/v1"
        />
      </Field>
      <p className="muted small">
        默认使用官方 API。自定义 HTTPS
        地址需自行确认实现相同接口；未认证其他服务商的兼容性。切换地址必须重新输入密钥。
      </p>
      <Field label="模型">
        <select
          aria-label="模型"
          value={model}
          onChange={(e) => setModel(e.target.value)}
        >
          {Object.entries(config.models).map(([id, c]) => (
            <option key={id} value={id}>
              {c.label} · {id}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label={
          config.configured ? "更新 API 密钥（留空保留现有密钥）" : "API 密钥"
        }
      >
        <input
          aria-label="API 密钥"
          type="password"
          autoComplete="new-password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="仅发送至本机后端，不回显"
        />
      </Field>
      {config.configured && (
        <label className="checkbox">
          <input
            type="checkbox"
            checked={clearKey}
            onChange={(e) => setClear(e.target.checked)}
          />
          清除服务端保存的凭证
        </label>
      )}
      <p className="notice">
        生成可能产生费用。服务失败与超时不会自动重试。环境变量设置的密钥需在服务器上修改；请勿通过公网明文
        HTTP 输入密钥。
      </p>
      <footer>
        <button onClick={onClose}>取消</button>
        <button disabled={busy} className="primary" onClick={save}>
          {busy ? "校验地址中…" : "保存设置"}
        </button>
      </footer>
    </Modal>
  );
}
export function PromptAssistant({ prompt, onApply, onClose }) {
  const [values, setValues] = useState({
    主体: prompt,
    数量: "",
    构图: "主体清晰，预留适当留白",
    背景: "",
    色彩: "",
    材质: "",
    光线: "自然柔和光线",
    风格: "",
    限制条件:
      "保留用户提供的品牌、文案与产品信息；不添加未经确认的价格、销量或功效",
  });
  const [edited, setEdited] = useState(null);
  const result = Object.entries(values)
    .filter(([, v]) => v.trim())
    .map(([k, v]) => `${k}：${v.trim()}`)
    .join("\n");
  return (
    <Modal
      title="提示词助手"
      subtitle="本地结构化整理 · 无需额外 AI 配置，不产生费用。"
      onClose={onClose}
      wide
    >
      <div className="assistant-grid">
        <div>
          {Object.entries(values).map(([k, v]) => (
            <Field key={k} label={k}>
              <input
                value={v}
                placeholder="未确定可留空"
                onChange={(e) => {
                  setValues({ ...values, [k]: e.target.value });
                  setEdited(null);
                }}
              />
            </Field>
          ))}
        </div>
        <div>
          <Field label="确认后的提示词（可直接编辑）">
            <textarea
              aria-label="整理后的提示词"
              rows={19}
              value={edited ?? result}
              onChange={(e) => setEdited(e.target.value)}
            />
          </Field>
          <p className="muted small">
            请自行确认数量、产品信息与准确文案。空白信息不会被编造；成品中的准确文案建议使用文字图层。
          </p>
        </div>
      </div>
      <footer>
        <button onClick={onClose}>取消</button>
        <button className="primary" onClick={() => onApply(edited ?? result)}>
          确认并使用提示词
        </button>
      </footer>
    </Modal>
  );
}
