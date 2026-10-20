import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  MousePointer2,
  Hand,
  ImagePlus,
  Type,
  Square,
  Circle,
  Layers,
  Shapes,
  FolderOpen,
  Plus,
  Undo2,
  Redo2,
  Save,
  Download,
  Settings2,
  Sparkles,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  LockKeyhole,
  LockKeyholeOpen,
  Trash2,
  Upload,
  LayoutTemplate,
  Palette,
  History,
  ZoomIn,
  ZoomOut,
  Maximize,
  Check,
  LoaderCircle,
  Image as ImageIcon,
  WandSparkles,
  Brush,
  ArrowRight,
  Copy,
  Grid2X2,
  X,
} from "lucide-react";
import { Editor } from "./editor";
import { api, upload, fileCheck, download } from "./api";
import { TEMPLATES, RATIOS } from "./templates";
import { Field, NumberField, Properties } from "./Properties";
import { Modal, ProjectDialog, Settings, PromptAssistant } from "./Dialogs";
import MaskEditor from "./MaskEditor";
import "./styles.css";
const STATUS = {
  queued: "等待中",
  running: "生成中",
  succeeded: "已完成",
  failed: "失败",
};
const MODE_NAMES = {
  text: "文字生图",
  reference: "参考图生成",
  inpaint: "局部修改",
};
const EMPTY = {
  objects: [],
  width: 1080,
  height: 1080,
  background: "#f3f0e9",
  canUndo: false,
  canRedo: false,
};
function App() {
  const [authenticated, setAuthenticated] = useState(false),
    [authError, setAuthError] = useState(""),
    [needsPassword, setNeedsPassword] = useState(false),
    [password, setPassword] = useState("");
  const [info, setInfo] = useState(EMPTY),
    [project, setProject] = useState({
      id: crypto.randomUUID(),
      name: "未命名作品",
    }),
    [dirty, setDirty] = useState(false),
    [saving, setSaving] = useState(false),
    [projects, setProjects] = useState([]),
    [assets, setAssets] = useState([]),
    [brand, setBrand] = useState({ colors: [], copies: [], assets: [] });
  const [config, setConfig] = useState(null),
    [tasks, setTasks] = useState([]),
    [tab, setTab] = useState("templates"),
    [right, setRight] = useState("ai"),
    [modal, setModal] = useState(null),
    [toast, setToast] = useState(""),
    [selectedTask, setSelectedTask] = useState(null);
  const [prompt, setPrompt] = useState(""),
    [mode, setMode] = useState("text"),
    [style, setStyle] = useState("原始"),
    [genSize, setGenSize] = useState("1024x1024"),
    [count, setCount] = useState(1),
    [quality, setQuality] = useState("medium"),
    [reference, setReference] = useState(null),
    [mask, setMask] = useState(null),
    [submitting, setSubmitting] = useState(false);
  const [zoom, setZoom] = useState(0.4),
    [pan, setPan] = useState({ x: 0, y: 0 }),
    [tool, setTool] = useState("select"),
    [space, setSpace] = useState(false),
    [exportFormat, setExportFormat] = useState("png"),
    [transparent, setTransparent] = useState(false),
    [exporting, setExporting] = useState(false);
  const canvasRef = useRef(),
    stageRef = useRef(),
    editorRef = useRef(),
    dirtyRef = useRef(false),
    projectRef = useRef(project),
    fileRef = useRef(),
    referenceRef = useRef(),
    fileTarget = useRef("canvas"),
    submittingRef = useRef(false),
    panStart = useRef(null),
    toastTimer = useRef(),
    saveRef = useRef();
  projectRef.current = project;
  function notify(message) {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 6000);
  }
  async function run(fn) {
    try {
      return await fn();
    } catch (e) {
      notify(e.message);
      return null;
    }
  }
  async function authenticate(value = "") {
    try {
      await api("/session", { method: "POST", body: { password: value } });
      setAuthenticated(true);
      setPassword("");
    } catch (e) {
      setNeedsPassword(e.passwordRequired || false);
      setAuthError(e.message);
    }
  }
  useEffect(() => {
    authenticate();
    return () => clearTimeout(toastTimer.current);
  }, []);
  function fit() {
    const ed = editorRef.current,
      stage = stageRef.current;
    if (!ed || !stage) return;
    const z = Math.min(
      (stage.clientWidth - 100) / ed.width,
      (stage.clientHeight - 110) / ed.height,
      1,
    );
    ed.setZoom(z);
    setZoom(ed.zoom);
    setPan({ x: 0, y: 0 });
  }
  function changeZoom(z) {
    const ed = editorRef.current;
    if (!ed) return;
    ed.setZoom(z);
    setZoom(ed.zoom);
  }
  async function refreshAssets() {
    setAssets(await api("/assets"));
  }
  async function refreshProjects() {
    setProjects(await api("/projects"));
  }
  useEffect(() => {
    if (!authenticated) return;
    let disposed = false;
    const ed = new Editor(canvasRef.current, (s) => {
      if (disposed) return;
      setInfo(s);
      if (s.changed && editorRef.current) {
        dirtyRef.current = true;
        setDirty(true);
      }
    });
    editorRef.current = ed;
    (async () => {
      try {
        const [c, a, p, b, t] = await Promise.all([
          api("/config"),
          api("/assets"),
          api("/projects"),
          api("/brand"),
          api("/tasks"),
        ]);
        if (disposed) return;
        setConfig(c);
        setAssets(a);
        setProjects(p);
        setBrand(b);
        setTasks(t);
        const last = localStorage.getItem("wanxiang:lastProject");
        if (last && p.some((x) => x.id === last)) {
          const saved = await api("/projects/" + last);
          await ed.load(saved);
          setProject({ id: saved.id, name: saved.name });
          dirtyRef.current = false;
          setDirty(false);
          if (saved.view) {
            ed.setZoom(saved.view.zoom);
            setZoom(ed.zoom);
            setPan({ x: saved.view.x, y: saved.view.y });
          } else fit();
        } else fit();
      } catch (e) {
        notify(e.message);
      }
    })();
    const ro = new ResizeObserver(() => {
      ed.canvas.calcOffset();
    });
    ro.observe(stageRef.current);
    return () => {
      disposed = true;
      ro.disconnect();
      ed.dispose();
      editorRef.current = null;
    };
  }, [authenticated]);
  useEffect(() => {
    if (!authenticated) return;
    const timer = setInterval(
      () =>
        api("/tasks")
          .then(setTasks)
          .catch(() => {}),
      1800,
    );
    return () => clearInterval(timer);
  }, [authenticated]);
  useEffect(() => {
    const before = (e) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, []);
  useEffect(() => {
    function keydown(e) {
      const input =
        ["INPUT", "TEXTAREA", "SELECT"].includes(
          document.activeElement?.tagName,
        ) ||
        document.activeElement?.isContentEditable ||
        editorRef.current?.canvas.getActiveObject()?.isEditing;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveRef.current?.();
        return;
      }
      if (input || modal) return;
      if (e.code === "Space") {
        e.preventDefault();
        setSpace(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        run(() =>
          e.shiftKey ? editorRef.current?.redo() : editorRef.current?.undo(),
        );
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        run(() => editorRef.current?.redo());
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        run(() => editorRef.current?.duplicate());
      }
      if (e.key === "Delete" || e.key === "Backspace")
        editorRef.current?.remove();
      if (e.key === "Escape")
        editorRef.current?.canvas.discardActiveObject().requestRenderAll();
    }
    const up = (e) => {
      if (e.code === "Space") setSpace(false);
    };
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", up);
    const blur = () => setSpace(false);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("blur", blur);
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", up);
    };
  }, [modal]);
  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      const ed = editorRef.current;
      const current = projectRef.current;
      const snapshot = ed.snapshot();
      const signature = JSON.stringify({ ...snapshot, name: current.name });
      const saved = await api("/projects/" + current.id, {
        method: "PUT",
        body: {
          ...snapshot,
          name: current.name,
          view: {
            zoom: ed.zoom,
            x: pan.x,
            y: pan.y,
            selectedId: ed.canvas.getActiveObject()?.id,
          },
        },
      });
      localStorage.setItem("wanxiang:lastProject", saved.id);
      const unchanged =
        current.id === projectRef.current.id &&
        signature ===
          JSON.stringify({ ...ed.snapshot(), name: projectRef.current.name });
      if (unchanged) {
        dirtyRef.current = false;
        setDirty(false);
      }
      await refreshProjects();
      notify("项目已保存，刷新后可恢复");
    } catch (e) {
      notify(e.message);
    } finally {
      setSaving(false);
    }
  }
  saveRef.current = save;
  function canLeave() {
    return (
      !dirtyRef.current ||
      window.confirm("有尚未保存的修改。确定放弃这些修改吗？")
    );
  }
  async function createProject(p) {
    if (!canLeave()) return;
    const ed = editorRef.current;
    await ed.load({ ...p, canvas: { objects: [] } });
    setProject({ id: crypto.randomUUID(), name: p.name });
    dirtyRef.current = true;
    setDirty(true);
    setModal(null);
    setRight("ai");
    fit();
  }
  async function openProject(p) {
    if (!canLeave()) return;
    await run(async () => {
      const saved = await api("/projects/" + p.id);
      await editorRef.current.load(saved);
      setProject({ id: p.id, name: saved.name });
      dirtyRef.current = false;
      setDirty(false);
      localStorage.setItem("wanxiang:lastProject", p.id);
      setModal(null);
      if (saved.view) {
        editorRef.current.setZoom(saved.view.zoom);
        setZoom(editorRef.current.zoom);
        setPan({ x: saved.view.x, y: saved.view.y });
      } else fit();
    });
  }
  async function deleteProject(p) {
    if (
      !window.confirm(`删除项目「${p.name}」？此操作无法撤销，素材库仍会保留。`)
    )
      return;
    await run(async () => {
      await api("/projects/" + p.id, { method: "DELETE" });
      await refreshProjects();
      if (p.id === project.id) {
        localStorage.removeItem("wanxiang:lastProject");
        await editorRef.current.load({
          width: 1080,
          height: 1080,
          background: "#f3f0e9",
          canvas: { objects: [] },
        });
        setProject({ id: crypto.randomUUID(), name: "未命名作品" });
        dirtyRef.current = false;
        setDirty(false);
        fit();
      }
    });
  }
  function markDirty() {
    dirtyRef.current = true;
    setDirty(true);
  }
  async function importFiles(files, target) {
    for (const file of files) {
      const asset = await run(async () => {
        fileCheck(file);
        return upload(file);
      });
      if (!asset) continue;
      if (target === "reference") {
        setReference(asset);
        setMask(null);
        if (mode === "text") setMode("reference");
      } else if (target === "brand") {
        await saveBrand({ ...brand, assets: [...brand.assets, asset.id] });
      } else {
        await run(() => editorRef.current.addImage(asset));
        setRight("properties");
      }
    }
    await refreshAssets();
  }
  async function saveBrand(value) {
    const saved = await api("/brand", { method: "PUT", body: value });
    setBrand(saved);
  }
  async function applyTemplate(t) {
    if (!canLeave()) return;
    await run(async () => {
      await editorRef.current.load({
        width: t.width,
        height: t.height,
        background: t.bg,
        canvas: { objects: [] },
      });
      await editorRef.current.template(t);
      setProject({ id: crypto.randomUUID(), name: t.name });
      markDirty();
      fit();
      notify("模板已创建：背景、装饰和文字均可独立编辑，请上传真实产品素材");
    });
  }
  async function submit() {
    if (submittingRef.current) return;
    if (!prompt.trim()) {
      notify("请先写下你的创作描述");
      return;
    }
    if (!config?.configured) {
      setModal("settings");
      return;
    }
    if (mode !== "text" && !reference) {
      notify("请先上传参考原图");
      return;
    }
    if (mode === "inpaint" && !mask) {
      notify("请先涂抹局部修改区域");
      return;
    }
    if (equivalentPending) {
      setRight("history");
      notify("相同参数的任务仍在进行中，请等待结果，避免重复计费");
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const task = await api("/tasks", {
        method: "POST",
        body: {
          requestId: crypto.randomUUID(),
          input: {
            mode,
            prompt,
            style,
            size: genSize,
            count,
            quality,
            ...(mode !== "text" ? { assetId: reference.id } : {}),
            ...(mode === "inpaint" ? { maskId: mask.id } : {}),
          },
        },
      });
      setTasks((prev) => [task, ...prev.filter((t) => t.id !== task.id)]);
      setRight("history");
      notify("任务已提交，请勿重复生成。失败时不会自动重试。");
    } catch (e) {
      notify(e.message);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }
  async function doExport() {
    setExporting(true);
    try {
      const data = await editorRef.current.export(exportFormat, transparent);
      download(
        data,
        `${project.name}.${exportFormat === "jpeg" ? "jpg" : "png"}`,
      );
      setModal(null);
      notify("图片已导出");
    } catch (e) {
      notify("导出失败：" + e.message);
    } finally {
      setExporting(false);
    }
  }
  function chooseCanvasReference() {
    const id = info.selected?.assetId,
      a = assets.find((x) => x.id === id);
    if (!a) {
      notify("请先在画布上选中一张图片");
      return;
    }
    setReference(a);
    setMask(null);
    if (mode === "text") setMode("reference");
  }
  function reuseTask(task) {
    const p = task.input;
    setPrompt(p.prompt);
    setMode(p.mode);
    setStyle(p.style);
    setGenSize(p.size);
    setQuality(p.quality);
    setCount(p.count);
    setReference(assets.find((a) => a.id === p.assetId) || null);
    setMask(p.maskId ? { id: p.maskId, url: "/api/assets/" + p.maskId } : null);
    setRight("ai");
    setSelectedTask(null);
    notify("已复用参数；再次点击生成才会提交新付费请求");
  }
  const pending = tasks.filter((t) =>
    ["queued", "running"].includes(t.status),
  ).length;
  const equivalentPending = tasks.some(
    (t) =>
      ["queued", "running"].includes(t.status) &&
      t.service.model === config?.model &&
      t.input.mode === mode &&
      t.input.prompt === prompt &&
      t.input.style === style &&
      t.input.size === genSize &&
      t.input.count === count &&
      t.input.quality === quality &&
      (mode === "text" || t.input.assetId === reference?.id) &&
      (mode !== "inpaint" || t.input.maskId === mask?.id),
  );
  if (!authenticated)
    return (
      <main className="login">
        <div className="login-card">
          <div className="brand-mark large">万</div>
          <h1>万象画室</h1>
          <p>让想象，有形可见。</p>
          {needsPassword ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                authenticate(password);
              }}
            >
              <Field label="工作室访问密码">
                <input
                  aria-label="工作室访问密码"
                  type="password"
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <button className="primary" type="submit">
                进入工作台 <ArrowRight size={16} />
              </button>
            </form>
          ) : (
            <p>{authError || "正在准备你的创作空间…"}</p>
          )}
          {authError && needsPassword && (
            <p className="danger-text">{authError}</p>
          )}
        </div>
      </main>
    );
  const ed = editorRef.current;
  return (
    <div className="app-shell">
      <input
        ref={fileRef}
        hidden
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp"
        aria-label="导入图片文件"
        onChange={(e) => {
          importFiles([...e.target.files], fileTarget.current);
          e.target.value = "";
        }}
      />
      <input
        ref={referenceRef}
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp"
        aria-label="参考图片文件"
        onChange={(e) => {
          importFiles([...e.target.files], "reference");
          e.target.value = "";
        }}
      />
      <header className="topbar">
        <a className="brand" href="#" onClick={(e) => e.preventDefault()}>
          <div className="brand-mark">万</div>
          <div>
            <strong>万象画室</strong>
            <span>WANXIANG STUDIO</span>
          </div>
        </a>
        <div className="header-separator" />
        <div className="project-title">
          <input
            aria-label="项目名称"
            maxLength={80}
            value={project.name}
            onChange={(e) => {
              setProject({ ...project, name: e.target.value });
              markDirty();
            }}
            onBlur={() => {
              if (!project.name.trim())
                setProject({ ...project, name: "未命名作品" });
            }}
          />
          <span className={"saved-state " + (dirty ? "unsaved" : "")}>
            {dirty ? "未保存" : "本地工作室"}
          </span>
        </div>
        <button className="header-button" onClick={() => setModal("projects")}>
          <FolderOpen size={16} />
          项目
          <ChevronDown size={12} />
        </button>
        <div className="header-spacer" />
        <div className="history-actions">
          <button
            className="icon-button"
            title="撤销 Ctrl+Z"
            aria-label="撤销"
            disabled={!info.canUndo}
            onClick={() => run(() => ed.undo())}
          >
            <Undo2 size={18} />
          </button>
          <button
            className="icon-button"
            title="重做 Ctrl+Shift+Z"
            aria-label="重做"
            disabled={!info.canRedo}
            onClick={() => run(() => ed.redo())}
          >
            <Redo2 size={18} />
          </button>
        </div>
        <button className="header-button" disabled={saving} onClick={save}>
          <Save size={16} />
          {saving ? "保存中" : "保存"}
        </button>
        <button
          className="primary export-button"
          onClick={() => setModal("export")}
        >
          <Download size={16} />
          导出作品
        </button>
        <button
          className="avatar"
          title="AI 服务设置"
          aria-label="打开设置"
          onClick={() => setModal("settings")}
        >
          <Settings2 size={18} />
        </button>
      </header>
      <div className="workspace">
        <nav className="tool-rail" aria-label="画布工具">
          <div className="rail-top">
            <button
              className={tool === "select" ? "active" : ""}
              title="选择"
              aria-label="选择工具"
              onClick={() => setTool("select")}
            >
              <MousePointer2 size={19} />
            </button>
            <button
              className={tool === "hand" ? "active" : ""}
              title="平移（按住空格也可拖动）"
              aria-label="平移工具"
              onClick={() => setTool("hand")}
            >
              <Hand size={19} />
            </button>
            <div className="rail-divider" />
            <button
              title="上传图片"
              aria-label="上传图片"
              onClick={() => {
                fileTarget.current = "canvas";
                fileRef.current.click();
              }}
            >
              <ImagePlus size={20} />
            </button>
            <button
              title="添加文字"
              aria-label="添加文字"
              onClick={() => {
                ed.addText();
                setRight("properties");
              }}
            >
              <Type size={21} />
            </button>
            <button
              title="添加矩形"
              aria-label="添加矩形"
              onClick={() => {
                ed.addShape("rect");
                setRight("properties");
              }}
            >
              <Square size={19} />
            </button>
            <button
              title="添加圆形"
              aria-label="添加圆形"
              onClick={() => {
                ed.addShape("circle");
                setRight("properties");
              }}
            >
              <Circle size={20} />
            </button>
          </div>
          <div className="rail-bottom">
            <span>V1</span>
            <button
              title="使用帮助"
              aria-label="使用帮助"
              onClick={() => setModal("help")}
            >
              ?
            </button>
          </div>
        </nav>
        <aside className="left-panel">
          <div className="left-tabs">
            {[
              ["templates", "模板", LayoutTemplate],
              ["assets", "素材", ImageIcon],
              ["layers", "图层", Layers],
              ["brand", "品牌", Palette],
            ].map(([id, label, Icon]) => (
              <button
                key={id}
                className={tab === id ? "active" : ""}
                onClick={() => setTab(id)}
              >
                <Icon size={16} />
                <span>{label}</span>
              </button>
            ))}
          </div>
          <div className="left-scroll">
            {tab === "templates" && (
              <>
                <div className="panel-intro">
                  <span className="eyebrow">A LITTLE INSPIRATION</span>
                  <h2>好设计，从这里开始</h2>
                  <p>可自由编辑的模板，让灵感快一步落地。</p>
                </div>
                <button className="new-canvas" onClick={() => setModal("new")}>
                  <Plus size={18} />
                  <span>空白画布</span>
                  <ArrowUpRight size={15} />
                </button>
                <div className="section-heading">
                  <h3>精选模板</h3>
                  <span className="muted small">6 个场景</span>
                </div>
                <div className="template-grid">
                  {TEMPLATES.map((t) => (
                    <button
                      className="template-card"
                      key={t.id}
                      onClick={() => applyTemplate(t)}
                      aria-label={"使用" + t.name + "模板"}
                    >
                      <div
                        className={"template-art template-" + t.id}
                        style={{ background: t.bg, "--accent": t.color }}
                      >
                        <div className="template-block" />
                        <div className="template-lines">
                          <span>
                            {t.id === "product"
                              ? "日常 / 好物"
                              : t.id === "detail"
                                ? "细节的力量"
                                : t.id === "feature"
                                  ? "好物有声"
                                  : t.id === "sale"
                                    ? "为喜欢而来"
                                    : t.id === "social"
                                      ? "灵感手记"
                                      : "角色档案"}
                          </span>
                          <i />
                          <i />
                        </div>
                        <div className="template-circle" />
                        {t.id === "product" && (
                          <div className="product-object" />
                        )}
                      </div>
                      <strong>{t.name}</strong>
                      <span>{t.tag}</span>
                    </button>
                  ))}
                </div>
                <div className="template-tip">
                  <Sparkles size={16} />
                  <p>
                    先选布局，再添灵感。
                    <br />
                    产品素材与准确文案由你提供。
                  </p>
                </div>
              </>
            )}
            {tab === "assets" && (
              <>
                <div className="panel-intro">
                  <span className="eyebrow">YOUR MATERIALS</span>
                  <h2>素材，让创意有据可依</h2>
                  <p>你的图片与生成结果，安全保存在本机。</p>
                </div>
                <button
                  className="upload-box"
                  onClick={() => {
                    fileTarget.current = "canvas";
                    fileRef.current.click();
                  }}
                >
                  <Upload size={24} />
                  <strong>上传图片</strong>
                  <span>PNG / JPEG / WebP · 最大 10MB</span>
                </button>
                <div className="section-heading">
                  <h3>全部素材</h3>
                  <span className="muted small">{assets.length} 张</span>
                </div>
                <div className="asset-grid">
                  {assets.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => run(() => ed.addImage(a))}
                      title={"添加到画布：" + a.name}
                    >
                      <img src={a.url} alt={a.name} loading="lazy" />
                      <span>{a.name}</span>
                    </button>
                  ))}
                </div>
                {!assets.length && (
                  <p className="empty-text">
                    还没有素材，上传你的第一张图片吧。
                  </p>
                )}
              </>
            )}
            {tab === "layers" && (
              <>
                <div className="panel-intro">
                  <span className="eyebrow">EVERY LAYER MATTERS</span>
                  <h2>图层管理</h2>
                  <p>上方图层显示在画布的更前面。</p>
                </div>
                <div className="layer-list">
                  {[...info.objects].reverse().map((o, i) => (
                    <div
                      key={o.id || i}
                      className={
                        "layer " + (info.selected === o ? "selected" : "")
                      }
                    >
                      <button
                        className="layer-main"
                        onClick={() => {
                          ed.select(o);
                          setRight("properties");
                        }}
                      >
                        <span className="layer-type">
                          {o.type === "textbox" ? (
                            <Type size={15} />
                          ) : o.type === "image" ? (
                            <ImageIcon size={15} />
                          ) : (
                            <Shapes size={15} />
                          )}
                        </span>
                        <span>{o.label || "未命名图层"}</span>
                      </button>
                      <button
                        className="layer-icon"
                        aria-label={(o.visible ? "隐藏" : "显示") + o.label}
                        title={o.visible ? "隐藏" : "显示"}
                        onClick={() => ed.layer(o, "visibility")}
                      >
                        {o.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                      </button>
                      <button
                        className="layer-icon"
                        aria-label={(o.locked ? "解锁" : "锁定") + o.label}
                        title={o.locked ? "解锁" : "锁定"}
                        onClick={() => ed.layer(o, "lock")}
                      >
                        {o.locked ? (
                          <LockKeyhole size={14} />
                        ) : (
                          <LockKeyholeOpen size={14} />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
                {!info.objects.length && (
                  <p className="empty-text">每个作品，都从第一个图层开始。</p>
                )}
                <div className="canvas-settings">
                  <h3>画布设置</h3>
                  <div className="grid2">
                    <NumberField
                      label="宽度"
                      value={info.width}
                      min={64}
                      max={4096}
                      onChange={(v) => {
                        ed.setSize(v, info.height);
                        fit();
                      }}
                    />
                    <NumberField
                      label="高度"
                      value={info.height}
                      min={64}
                      max={4096}
                      onChange={(v) => {
                        ed.setSize(info.width, v);
                        fit();
                      }}
                    />
                  </div>
                  <Field label="画布比例">
                    <select
                      value=""
                      onChange={(e) => {
                        const r = RATIOS.find((x) => x[0] === e.target.value);
                        if (r) {
                          ed.setSize(r[1], r[2]);
                          fit();
                        }
                      }}
                    >
                      <option value="">选择预设比例</option>
                      {RATIOS.map((r) => (
                        <option key={r[0]}>{r[0]}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="画布背景">
                    <div className="button-group">
                      <input
                        aria-label="画布背景颜色"
                        type="color"
                        value={
                          info.background === "transparent"
                            ? "#ffffff"
                            : info.background
                        }
                        onChange={(e) =>
                          ed.setSize(info.width, info.height, e.target.value)
                        }
                      />
                      <button
                        className={
                          info.background === "transparent" ? "active" : ""
                        }
                        onClick={() =>
                          ed.setSize(
                            info.width,
                            info.height,
                            info.background === "transparent"
                              ? "#f3f0e9"
                              : "transparent",
                          )
                        }
                      >
                        透明背景
                      </button>
                    </div>
                  </Field>
                </div>
              </>
            )}
            {tab === "brand" && (
              <>
                <div className="panel-intro">
                  <span className="eyebrow">MADE FOR YOUR BRAND</span>
                  <h2>品牌素材</h2>
                  <p>让每一次表达，都保留品牌的样子。</p>
                </div>
                <h3>品牌色</h3>
                <div className="brand-colors">
                  {brand.colors.map((color, i) => (
                    <div key={i}>
                      <button
                        style={{ background: color }}
                        title={"应用品牌色 " + color}
                        onClick={() => {
                          if (info.selected && info.selected.type !== "image")
                            ed.update({ fill: color });
                          else ed.setSize(info.width, info.height, color);
                        }}
                      />
                      <span>{color}</span>
                      <button
                        className="small-remove"
                        title="移除此颜色"
                        onClick={() =>
                          run(() =>
                            saveBrand({
                              ...brand,
                              colors: brand.colors.filter((_, j) => j !== i),
                            }),
                          )
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <label className="add-color" title="添加品牌色">
                    <Plus size={18} />
                    <input
                      aria-label="添加品牌色"
                      type="color"
                      onChange={(e) =>
                        run(() =>
                          saveBrand({
                            ...brand,
                            colors: [...brand.colors, e.target.value].slice(
                              0,
                              24,
                            ),
                          }),
                        )
                      }
                    />
                  </label>
                </div>
                <div className="section-heading">
                  <h3>Logo 与产品图</h3>
                  <button
                    className="text-button"
                    onClick={() => {
                      fileTarget.current = "brand";
                      fileRef.current.click();
                    }}
                  >
                    <Plus size={14} />
                    添加
                  </button>
                </div>
                <div className="asset-grid">
                  {brand.assets
                    .map((id) => assets.find((a) => a.id === id))
                    .filter(Boolean)
                    .map((a) => (
                      <div className="brand-asset" key={a.id}>
                        <button onClick={() => run(() => ed.addImage(a))}>
                          <img src={a.url} alt={a.name} />
                        </button>
                        <button
                          className="small-remove"
                          title="从品牌区移除"
                          onClick={() =>
                            run(() =>
                              saveBrand({
                                ...brand,
                                assets: brand.assets.filter(
                                  (id) => id !== a.id,
                                ),
                              }),
                            )
                          }
                        >
                          ×
                        </button>
                      </div>
                    ))}
                </div>
                <div className="section-heading">
                  <h3>常用文案</h3>
                  <button
                    className="text-button"
                    onClick={() => {
                      const value = window.prompt("输入经过确认的品牌文案");
                      if (value?.trim())
                        run(() =>
                          saveBrand({
                            ...brand,
                            copies: [...brand.copies, value.trim()],
                          }),
                        );
                    }}
                  >
                    <Plus size={14} />
                    添加
                  </button>
                </div>
                <div className="brand-copies">
                  {brand.copies.map((copy, i) => (
                    <div key={i}>
                      <button onClick={() => ed.addText(copy)}>
                        {copy}
                        <Plus size={14} />
                      </button>
                      <button
                        title="移除文案"
                        onClick={() =>
                          run(() =>
                            saveBrand({
                              ...brand,
                              copies: brand.copies.filter((_, j) => j !== i),
                            }),
                          )
                        }
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                <p className="notice">
                  品牌信息由你提供；模板不会预设价格、销量、认证或功效。
                </p>
              </>
            )}
          </div>
        </aside>
        <main className="canvas-area">
          <div className="canvas-topline">
            <div>
              <span className="live-dot" />
              自由画布 <ChevronRight size={12} />
              <span>{project.name}</span>
            </div>
            <span>
              {info.width} × {info.height} px
            </span>
          </div>
          <div
            className={
              "canvas-stage " + (tool === "hand" || space ? "panning" : "")
            }
            ref={stageRef}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files.length)
                importFiles([...e.dataTransfer.files], "canvas");
            }}
            onWheel={(e) => {
              if (e.ctrlKey || e.metaKey)
                changeZoom(zoom * (e.deltaY > 0 ? 0.92 : 1.08));
            }}
          >
            <div
              className="artboard-wrap checkerboard"
              style={{
                width: info.width * zoom,
                height: info.height * zoom,
                transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px)`,
              }}
            >
              <canvas ref={canvasRef} aria-label="创作画布" />
              {!info.objects.length && (
                <div className="canvas-welcome">
                  <div className="welcome-symbol">
                    <Sparkles size={30} />
                  </div>
                  <span className="welcome-eyebrow">
                    YOUR NEXT IDEA STARTS HERE
                  </span>
                  <h1>每个想象，都值得成画</h1>
                  <p>
                    写下灵感，或放入一张图片。
                    <br />
                    下一幅好作品，就从这里开始。
                  </p>
                  <div>
                    <button
                      onClick={() => {
                        setRight("ai");
                        document
                          .querySelector('[aria-label="创作描述"]')
                          ?.focus();
                      }}
                    >
                      <Sparkles size={15} />
                      描述想法
                    </button>
                    <button
                      onClick={() => {
                        fileTarget.current = "canvas";
                        fileRef.current.click();
                      }}
                    >
                      <Upload size={15} />
                      上传图片
                    </button>
                  </div>
                  <small>拖放图片到画布，也是一种开始</small>
                </div>
              )}
            </div>
            {(tool === "hand" || space) && (
              <div
                className="pan-capture"
                onPointerDown={(e) => {
                  panStart.current = {
                    x: e.clientX - pan.x,
                    y: e.clientY - pan.y,
                  };
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (panStart.current)
                    setPan({
                      x: e.clientX - panStart.current.x,
                      y: e.clientY - panStart.current.y,
                    });
                }}
                onPointerUp={() => (panStart.current = null)}
                onPointerCancel={() => (panStart.current = null)}
              />
            )}
            <div className="canvas-coordinate">
              X {Math.round(info.selected?.left || 0)} &nbsp; Y{" "}
              {Math.round(info.selected?.top || 0)}
            </div>
            <div className="zoom-bar">
              <button
                aria-label="缩小画布"
                title="缩小"
                onClick={() => changeZoom(zoom / 1.2)}
              >
                <ZoomOut size={16} />
              </button>
              <button
                className="zoom-value"
                onClick={() => changeZoom(1)}
                title="还原 100%"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                aria-label="放大画布"
                title="放大"
                onClick={() => changeZoom(zoom * 1.2)}
              >
                <ZoomIn size={16} />
              </button>
              <span />
              <button aria-label="适应窗口" title="适应窗口" onClick={fit}>
                <Maximize size={16} />
              </button>
            </div>
          </div>
          <div className="canvas-footer">
            <span>
              <MousePointer2 size={12} />
              拖动对象进行编辑<span className="footer-dot">·</span>空格 + 拖动
              平移<span className="footer-dot">·</span>Ctrl + 滚轮 缩放
            </span>
            <span>
              {info.objects.length} 个图层
              <Check size={12} />
            </span>
          </div>
        </main>
        <aside className="right-panel">
          <div className="right-tabs">
            {[
              ["ai", "AI 创作", Sparkles],
              ["properties", "属性", Settings2],
              ["history", "历史", History],
            ].map(([id, label, Icon]) => (
              <button
                key={id}
                className={right === id ? "active" : ""}
                onClick={() => setRight(id)}
              >
                <Icon size={15} />
                {label}
                {id === "history" && pending > 0 && <i>{pending}</i>}
              </button>
            ))}
          </div>
          <div className="right-scroll">
            {right === "ai" && (
              <>
                <div className="ai-heading">
                  <span className="ai-icon">
                    <Sparkles size={22} />
                  </span>
                  <div>
                    <h2>把灵感，变成画面</h2>
                    <p>描述你想象中的世界</p>
                  </div>
                </div>
                <div className="mode-tabs">
                  {Object.entries(MODE_NAMES)
                    .filter(([id]) => !config || config.capabilities?.[id])
                    .map(([id, name]) => (
                      <button
                        key={id}
                        className={mode === id ? "active" : ""}
                        onClick={() => setMode(id)}
                      >
                        {name}
                      </button>
                    ))}
                </div>
                {mode !== "text" && (
                  <div className="reference-zone">
                    {reference ? (
                      <>
                        <img src={reference.url} alt="参考原图" />
                        <div>
                          <strong>{reference.name}</strong>
                          <span>
                            {reference.width} × {reference.height}
                          </span>
                          <button
                            className="text-button"
                            onClick={() => referenceRef.current.click()}
                          >
                            更换图片
                          </button>
                        </div>
                        <button
                          className="icon-button"
                          title="移除参考图"
                          onClick={() => {
                            setReference(null);
                            setMask(null);
                          }}
                        >
                          <X size={14} />
                        </button>
                      </>
                    ) : (
                      <button
                        className="reference-upload"
                        onClick={() => referenceRef.current.click()}
                      >
                        <ImagePlus size={23} />
                        <span>上传参考图片</span>
                        <small>PNG / JPEG / WebP</small>
                      </button>
                    )}
                    <button
                      className="text-button"
                      onClick={chooseCanvasReference}
                    >
                      使用画布选中的图片 <ArrowUpRight size={12} />
                    </button>
                    {mode === "inpaint" && (
                      <>
                        <button
                          className={"mask-button " + (mask ? "done" : "")}
                          disabled={!reference}
                          onClick={() => setModal("mask")}
                        >
                          <Brush size={16} />
                          {mask ? "选区已保存 · 重新涂抹" : "涂抹局部修改区域"}
                          {mask && <Check size={15} />}
                        </button>
                        <p className="muted small">
                          尽量保留未选区域，不能保证像素级一致。
                        </p>
                      </>
                    )}
                  </div>
                )}
                <div className="prompt-label">
                  <label htmlFor="prompt">
                    {mode === "text" ? "创作描述" : "修改说明"}
                  </label>
                  <button
                    className="text-button"
                    onClick={() => setModal("assistant")}
                  >
                    <WandSparkles size={13} />
                    提示词助手
                  </button>
                </div>
                <div className="prompt-box">
                  <textarea
                    id="prompt"
                    aria-label="创作描述"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    maxLength={12000}
                    placeholder={
                      mode === "text"
                        ? "例如：一只陶瓷花瓶，几枝白色洋桔梗，米色背景，自然窗光，简洁的静物摄影…"
                        : mode === "reference"
                          ? "描述你希望如何改变这张图片，保留哪些细节…"
                          : "描述紫色选区中需要修改的内容…"
                    }
                  />
                  <div>
                    <span>中文描述即可</span>
                    <span>{prompt.length}/12000</span>
                  </div>
                </div>
                <div className="section-heading style-heading">
                  <h3>画面风格</h3>
                  <span className="muted small">提示词修饰</span>
                </div>
                <div className="style-grid">
                  {["原始", "摄影", "插画", "水彩", "3D 设计", "极简"].map(
                    (s, i) => (
                      <button
                        key={s}
                        className={style === s ? "active" : ""}
                        onClick={() => setStyle(s)}
                      >
                        <span className={"style-swatch swatch-" + i}>
                          {["✧", "◉", "✿", "≈", "◈", "▱"][i]}
                        </span>
                        <span>{s}</span>
                        {style === s && <Check size={11} />}
                      </button>
                    ),
                  )}
                </div>
                <div className="grid2 ai-options">
                  <Field label="生成比例">
                    <select
                      aria-label="生成比例"
                      value={genSize}
                      onChange={(e) => setGenSize(e.target.value)}
                    >
                      <option value="1024x1024">1:1 · 1024²</option>
                      <option value="1024x1536">2:3 · 1024×1536</option>
                      <option value="1536x1024">3:2 · 1536×1024</option>
                    </select>
                  </Field>
                  <Field label="生成数量">
                    <select
                      aria-label="生成数量"
                      value={count}
                      onChange={(e) => setCount(Number(e.target.value))}
                    >
                      {[1, 2, 3, 4].map((n) => (
                        <option key={n} value={n}>
                          {n} 张
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="图片质量">
                  <select
                    value={quality}
                    aria-label="图片质量"
                    onChange={(e) => setQuality(e.target.value)}
                  >
                    <option value="low">低 · 快速探索</option>
                    <option value="medium">中 · 均衡质量</option>
                    <option value="high">高 · 精细成图</option>
                  </select>
                </Field>
                <p className="muted small">
                  画布支持任意预设比例；当前模型生成尺寸以此处实际支持值为准，无参考强度参数。
                </p>
                <div className="model-status">
                  <div>
                    <span
                      className={
                        "status-dot " + (config?.configured ? "green" : "")
                      }
                    />
                    <span>
                      {config?.configured
                        ? config.models[config.model]?.label
                        : "AI 服务待配置"}
                    </span>
                  </div>
                  <button onClick={() => setModal("settings")}>
                    设置 <ChevronRight size={13} />
                  </button>
                </div>
                <button
                  className="generate-button"
                  disabled={submitting || !config || equivalentPending}
                  onClick={submit}
                >
                  {submitting ? (
                    <LoaderCircle size={18} className="spin" />
                  ) : (
                    <Sparkles size={18} />
                  )}
                  <span>
                    {config?.configured
                      ? submitting
                        ? "提交中…"
                        : equivalentPending
                          ? "相同任务进行中…"
                          : "开始生成"
                      : "配置 AI 服务"}
                  </span>
                  <ArrowRight size={17} />
                </button>
                <p className="generation-note">
                  {config?.configured
                    ? "生成将调用真实服务并可能计费；不会自动重试。"
                    : "配置前不会发送生成请求，也不会展示虚假结果。"}
                </p>
                <div className="ai-bottom-tip">
                  <span>✳</span>
                  <div>
                    <strong>让文字，留在文字图层</strong>
                    <p>品牌名与准确文案，用编辑器文字叠加，排版更可控。</p>
                  </div>
                </div>
              </>
            )}
            {right === "properties" && (
              <Properties editor={ed} info={info} notify={notify} />
            )}
            {right === "history" && (
              <>
                <div className="panel-intro">
                  <span className="eyebrow">YOUR CREATIVE JOURNEY</span>
                  <h2>每一次探索，都有迹可循</h2>
                  <p>保留实际参数、参考素材与生成结果。</p>
                </div>
                {!tasks.length && (
                  <div className="empty">
                    <History size={32} />
                    <h3>灵感还在路上</h3>
                    <p>
                      真实生成的任务会出现在这里。
                      <br />
                      先写下你的第一个想法吧。
                    </p>
                    <button onClick={() => setRight("ai")}>
                      开始创作 <ArrowRight size={14} />
                    </button>
                  </div>
                )}
                <div className="task-list">
                  {tasks.map((t) => (
                    <article className="task-card" key={t.id}>
                      <div className="task-meta">
                        <span>{MODE_NAMES[t.input.mode]}</span>
                        <span className={"task-state " + t.status}>
                          {t.status === "running" && (
                            <LoaderCircle size={12} className="spin" />
                          )}
                          {STATUS[t.status]}
                        </span>
                      </div>
                      <button
                        className="task-prompt"
                        onClick={() => setSelectedTask(t)}
                      >
                        {t.input.prompt}
                      </button>
                      <div className="task-params">
                        {t.service.model} · {t.input.size} · {t.input.count} 张
                      </div>
                      {t.status === "failed" && (
                        <p className="task-error">{t.error}</p>
                      )}
                      {t.results?.length > 0 && (
                        <div className="task-results">
                          {t.results.map((a) => (
                            <div key={a.id}>
                              <button onClick={() => setModal({ preview: a })}>
                                <img src={a.url} alt="真实生成结果" />
                              </button>
                              <div>
                                <button
                                  title="添加到画布"
                                  onClick={() =>
                                    run(async () => {
                                      await ed.addImage(a);
                                      await refreshAssets();
                                      notify("生成结果已添加到画布");
                                    })
                                  }
                                >
                                  <Plus size={13} />
                                  画布
                                </button>
                                <button
                                  title="下载图片"
                                  onClick={() =>
                                    download(a.url, "万象生成-" + a.id + ".png")
                                  }
                                >
                                  <Download size={13} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="task-actions">
                        <button onClick={() => reuseTask(t)}>
                          <Copy size={12} />
                          复用参数
                        </button>
                        <button onClick={() => setSelectedTask(t)}>
                          详细记录 <ArrowUpRight size={12} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="privacy-footer">
            <LockKeyhole size={11} />
            素材与项目保存在当前工作室服务器
          </div>
        </aside>
      </div>
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button aria-label="关闭提示" onClick={() => setToast("")}>
            ×
          </button>
        </div>
      )}
      {modal === "new" && (
        <ProjectDialog
          onClose={() => setModal(null)}
          onCreate={createProject}
        />
      )}
      {modal === "settings" && config && (
        <Settings
          config={config}
          onSaved={setConfig}
          onClose={() => setModal(null)}
          notify={notify}
        />
      )}
      {modal === "assistant" && (
        <PromptAssistant
          prompt={prompt}
          onClose={() => setModal(null)}
          onApply={(p) => {
            setPrompt(p);
            setModal(null);
          }}
        />
      )}
      {modal === "mask" && reference && (
        <MaskEditor
          asset={reference}
          onClose={() => setModal(null)}
          onConfirm={(m) => {
            setMask(m);
            setModal(null);
            notify("遮罩已保存，填写修改指令后提交");
          }}
          notify={notify}
        />
      )}
      {modal === "projects" && (
        <Modal
          title="我的项目"
          subtitle="项目保存在当前服务器；已保存项目可在刷新后恢复。"
          onClose={() => setModal(null)}
          wide
        >
          <button className="primary" onClick={() => setModal("new")}>
            <Plus size={16} />
            创建新项目
          </button>
          <div className="project-list">
            {projects.map((p) => (
              <div className="project-row" key={p.id}>
                <div className="project-icon">
                  <Grid2X2 size={25} />
                </div>
                <button onClick={() => openProject(p)}>
                  <strong>{p.name}</strong>
                  <span>
                    {p.width} × {p.height} ·{" "}
                    {new Date(p.updatedAt).toLocaleString("zh-CN")}
                  </span>
                </button>
                <button
                  aria-label={"重命名" + p.name}
                  onClick={() =>
                    run(async () => {
                      const name = window.prompt("项目新名称", p.name);
                      if (!name?.trim()) return;
                      const full = await api("/projects/" + p.id);
                      await api("/projects/" + p.id, {
                        method: "PUT",
                        body: { ...full, name: name.trim() },
                      });
                      if (p.id === project.id)
                        setProject({ ...project, name: name.trim() });
                      await refreshProjects();
                    })
                  }
                >
                  重命名
                </button>
                <button
                  className="icon-button danger-text"
                  aria-label={"删除" + p.name}
                  onClick={() => deleteProject(p)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            {!projects.length && (
              <div className="empty">
                <FolderOpen size={30} />
                <p>
                  还没有已保存的项目。
                  <br />
                  完成编辑后，点击顶部「保存」。
                </p>
              </div>
            )}
          </div>
        </Modal>
      )}
      {modal === "export" && (
        <Modal
          title="导出你的作品"
          subtitle={`${info.width} × ${info.height} px · 按原始画布尺寸导出`}
          onClose={() => setModal(null)}
        >
          <Field label="文件格式">
            <select
              aria-label="导出格式"
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value)}
            >
              <option value="png">PNG · 无损图片</option>
              <option value="jpeg">JPEG · 高质量图片</option>
            </select>
          </Field>
          {exportFormat === "png" && (
            <label className="checkbox">
              <input
                aria-label="透明背景导出"
                type="checkbox"
                checked={transparent}
                onChange={(e) => setTransparent(e.target.checked)}
              />
              透明背景（仅移除画布背景，不移除背景图层）
            </label>
          )}
          <p className="notice">
            导出使用画布同一渲染引擎，保留图片裁剪、层级与文字布局。JPEG
            不支持透明通道，透明画布将使用白色底。
          </p>
          <footer>
            <button onClick={() => setModal(null)}>取消</button>
            <button className="primary" disabled={exporting} onClick={doExport}>
              {exporting ? "正在导出…" : "下载图片"}
              <Download size={15} />
            </button>
          </footer>
        </Modal>
      )}
      {modal === "help" && (
        <Modal title="从灵感到作品" onClose={() => setModal(null)}>
          <ol className="help-list">
            <li>选择模板或创建空白画布，上传真实素材。</li>
            <li>
              使用左侧工具添加文字、矩形和圆形。选中对象后在「属性」调整；拖动角点缩放，顶部控制点旋转。
            </li>
            <li>在「图层」调整显示、锁定和画布尺寸；在属性中调整前后顺序。</li>
            <li>
              需要 AI 时，先配置官方 Images API
              密钥。参考生成需上传原图；局部修改还需涂抹遮罩。
            </li>
            <li>
              Ctrl+S 保存，Ctrl+Z 撤销，Ctrl+Shift+Z 重做；顶部导出 PNG / JPEG。
            </li>
          </ol>
          <p className="notice">
            第一版为单人本地工作室。抠图、扩图、放大、压感、多画板、账户与团队协作暂未实现。
          </p>
        </Modal>
      )}
      {modal?.preview && (
        <Modal title="生成结果预览" onClose={() => setModal(null)} wide>
          <img
            className="preview-image checkerboard"
            src={modal.preview.url}
            alt="生成结果大图"
          />
          <footer>
            <button
              onClick={() =>
                download(
                  modal.preview.url,
                  "万象画室-" + modal.preview.id + ".png",
                )
              }
            >
              <Download size={15} />
              下载原图
            </button>
            <button
              className="primary"
              onClick={() =>
                run(async () => {
                  await ed.addImage(modal.preview);
                  setModal(null);
                  await refreshAssets();
                })
              }
            >
              <Plus size={15} />
              添加到画布
            </button>
          </footer>
        </Modal>
      )}
      {selectedTask && (
        <Modal
          title="生成任务记录"
          subtitle={new Date(selectedTask.createdAt).toLocaleString("zh-CN")}
          onClose={() => setSelectedTask(null)}
          wide
        >
          <div className="task-record">
            <span className={"task-state " + selectedTask.status}>
              {STATUS[selectedTask.status]}
            </span>
            <h3>实际提交的提示词</h3>
            <pre>{selectedTask.input.actualPrompt}</pre>
            <div className="record-params">
              <span>服务：{selectedTask.service.provider}</span>
              <span>模型：{selectedTask.service.model}</span>
              <span>尺寸：{selectedTask.input.size}</span>
              <span>数量：{selectedTask.input.count}</span>
              <span>质量：{selectedTask.input.quality}</span>
              <span>输出：PNG</span>
            </div>
            {selectedTask.input.assetId && (
              <div className="record-images">
                <div>
                  <span>原图</span>
                  <img
                    src={"/api/assets/" + selectedTask.input.assetId}
                    alt="请求原图"
                  />
                </div>
                {selectedTask.input.maskId && (
                  <div className="checkerboard">
                    <span>实际 PNG 遮罩（透明区域待修改）</span>
                    <img
                      src={"/api/assets/" + selectedTask.input.maskId}
                      alt="实际提交的透明遮罩"
                    />
                  </div>
                )}
              </div>
            )}
            {selectedTask.error && (
              <p className="task-error">{selectedTask.error}</p>
            )}
            <footer>
              <button onClick={() => setSelectedTask(null)}>关闭</button>
              <button
                className="primary"
                onClick={() => reuseTask(selectedTask)}
              >
                复用提示词与参数
              </button>
            </footer>
          </div>
        </Modal>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
