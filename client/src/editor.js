import {
  Canvas,
  StaticCanvas,
  FabricImage,
  Rect,
  Circle,
  Textbox,
  FabricObject,
  filters,
} from "fabric";
FabricObject.customProperties = [
  "id",
  "label",
  "assetId",
  "locked",
  "brightness",
  "contrast",
];
export const FONT =
  '"Noto Sans CJK SC", "Microsoft YaHei", "PingFang SC", sans-serif';
export class Editor {
  constructor(element, onChange) {
    this.canvas = new Canvas(element, {
      preserveObjectStacking: true,
      selection: false,
      backgroundColor: "#f3f0e9",
    });
    this.width = 1080;
    this.height = 1080;
    this.background = "#f3f0e9";
    this.zoom = 0.5;
    this.onChange = onChange;
    this.history = [];
    this.index = -1;
    this.restoring = false;
    this.canvas.on("object:modified", () => this.commit());
    this.canvas.on("text:editing:exited", () => this.commit());
    this.canvas.on("text:changed", () => this.commit());
    for (const event of [
      "selection:created",
      "selection:updated",
      "selection:cleared",
    ])
      this.canvas.on(event, () => this.notify());
    this.resize();
    this.commit();
  }
  notify(changed = false) {
    this.onChange?.({
      changed,
      selected: this.canvas.getActiveObject(),
      objects: [...this.canvas.getObjects()],
      width: this.width,
      height: this.height,
      background: this.background,
      canUndo: this.index > 0,
      canRedo: this.index < this.history.length - 1,
    });
  }
  snapshot() {
    const canvas = this.canvas.toObject();
    for (const o of canvas.objects)
      if (o.assetId) o.src = `/api/assets/${o.assetId}`;
    return {
      schemaVersion: 1,
      width: this.width,
      height: this.height,
      background: this.background,
      canvas,
    };
  }
  commit() {
    if (this.restoring) return;
    const s = JSON.stringify(this.snapshot());
    if (this.history[this.index] !== s) {
      this.history = this.history.slice(0, this.index + 1);
      this.history.push(s);
      if (this.history.length > 80) this.history.shift();
      this.index = this.history.length - 1;
    }
    this.canvas.requestRenderAll();
    this.notify(true);
  }
  resize() {
    this.canvas.setDimensions({
      width: this.width * this.zoom,
      height: this.height * this.zoom,
    });
    this.canvas.setZoom(this.zoom);
    this.canvas.backgroundColor =
      this.background === "transparent" ? "" : this.background;
    this.canvas.requestRenderAll();
  }
  setZoom(z) {
    this.zoom = Math.max(0.05, Math.min(3, z));
    this.resize();
  }
  async load(p, { reset = true } = {}) {
    const selectedId = reset
      ? p.view?.selectedId
      : this.canvas.getActiveObject()?.id;
    this.restoring = true;
    try {
      this.canvas.discardActiveObject();
      await this.canvas.loadFromJSON(p.canvas);
      this.width = p.width;
      this.height = p.height;
      this.background = p.background;
      this.resize();
      if (selectedId) {
        const selected = this.canvas
          .getObjects()
          .find((o) => o.id === selectedId);
        if (selected) this.canvas.setActiveObject(selected);
      }
      if (reset) {
        this.history = [JSON.stringify(this.snapshot())];
        this.index = 0;
      }
    } finally {
      this.restoring = false;
      this.notify(true);
    }
  }
  async undo() {
    if (this.index > 0) {
      this.index--;
      await this.load(JSON.parse(this.history[this.index]), { reset: false });
    }
  }
  async redo() {
    if (this.index < this.history.length - 1) {
      this.index++;
      await this.load(JSON.parse(this.history[this.index]), { reset: false });
    }
  }
  setSize(w, h, bg = this.background) {
    this.width = w;
    this.height = h;
    this.background = bg;
    this.resize();
    this.commit();
  }
  add(obj, label) {
    obj.set({ id: crypto.randomUUID(), label: label || "图层" });
    this.canvas.add(obj);
    this.canvas.setActiveObject(obj);
    this.commit();
    return obj;
  }
  addText(text = "双击编辑文字") {
    return this.add(
      new Textbox(text, {
        left: this.width * 0.12,
        top: this.height * 0.16,
        width: this.width * 0.7,
        fontFamily: FONT,
        fontSize: Math.round(this.width / 15),
        fill: "#24252e",
        lineHeight: 1.25,
        fontWeight: "normal",
      }),
      "文字",
    );
  }
  addShape(type) {
    const params = {
      left: this.width * 0.25,
      top: this.height * 0.3,
      fill: "#9384f6",
      strokeWidth: 0,
    };
    return this.add(
      type === "circle"
        ? new Circle({ ...params, radius: this.width * 0.13 })
        : new Rect({
            ...params,
            width: this.width * 0.35,
            height: this.height * 0.23,
            rx: 12,
            ry: 12,
          }),
      type === "circle" ? "圆形" : "矩形",
    );
  }
  async addImage(asset) {
    const image = await FabricImage.fromURL(asset.url);
    const scale = Math.min(
      (this.width * 0.75) / image.width,
      (this.height * 0.75) / image.height,
    );
    image.set({
      left: (this.width - image.width * scale) / 2,
      top: (this.height - image.height * scale) / 2,
      scaleX: scale,
      scaleY: scale,
      assetId: asset.id,
    });
    return this.add(image, asset.name || "图片");
  }
  update(values) {
    const obj = this.canvas.getActiveObject();
    if (!obj || obj.locked) return;
    obj.set(values);
    obj.setCoords();
    this.commit();
  }
  setFilters(values) {
    const obj = this.canvas.getActiveObject();
    if (!(obj instanceof FabricImage) || obj.locked) return;
    obj.set(values);
    obj.filters = [
      new filters.Brightness({ brightness: obj.brightness || 0 }),
      new filters.Contrast({ contrast: obj.contrast || 0 }),
    ];
    obj.applyFilters();
    this.commit();
  }
  select(obj) {
    this.canvas.setActiveObject(obj);
    this.canvas.requestRenderAll();
    this.notify();
  }
  remove() {
    const obj = this.canvas.getActiveObject();
    if (!obj || obj.locked) return;
    this.canvas.remove(obj);
    this.canvas.discardActiveObject();
    this.commit();
  }
  async duplicate() {
    const obj = this.canvas.getActiveObject();
    if (!obj) return;
    const clone = await obj.clone();
    clone.set({
      left: obj.left + 24,
      top: obj.top + 24,
      locked: false,
      selectable: true,
      evented: true,
    });
    this.add(clone, (obj.label || "图层") + " 副本");
  }
  layer(obj, action) {
    if (action === "visibility") obj.set("visible", !obj.visible);
    if (action === "lock") {
      const locked = !obj.locked;
      obj.set({
        locked,
        selectable: !locked,
        evented: !locked,
        lockMovementX: locked,
        lockMovementY: locked,
        lockScalingX: locked,
        lockScalingY: locked,
        lockRotation: locked,
      });
    }
    if (action === "up") this.canvas.bringObjectForward(obj);
    if (action === "down") this.canvas.sendObjectBackwards(obj);
    this.commit();
  }
  align(action) {
    const obj = this.canvas.getActiveObject();
    if (!obj || obj.locked) return;
    const b = obj.getBoundingRect();
    const dx =
      action === "left"
        ? -b.left
        : action === "center"
          ? (this.width - b.width) / 2 - b.left
          : action === "right"
            ? this.width - b.left - b.width
            : 0;
    const dy =
      action === "top"
        ? -b.top
        : action === "middle"
          ? (this.height - b.height) / 2 - b.top
          : action === "bottom"
            ? this.height - b.top - b.height
            : 0;
    obj.set({ left: obj.left + dx, top: obj.top + dy });
    obj.setCoords();
    this.commit();
  }
  crop({ x, y, width, height }) {
    const obj = this.canvas.getActiveObject();
    if (!(obj instanceof FabricImage) || obj.locked) return;
    const element = obj._originalElement,
      nw = element.naturalWidth,
      nh = element.naturalHeight;
    if (
      x < 0 ||
      y < 0 ||
      width <= 0 ||
      height <= 0 ||
      x + width > nw ||
      y + height > nh
    )
      throw new Error("裁剪范围超出原图边界");
    obj.set({ cropX: x, cropY: y, width, height });
    obj.setCoords();
    this.commit();
  }
  async export(format = "png", transparent = false) {
    await document.fonts.ready;
    const element = document.createElement("canvas");
    const c = new StaticCanvas(element, {
      width: this.width,
      height: this.height,
      enableRetinaScaling: false,
    });
    try {
      await c.loadFromJSON(this.snapshot().canvas);
      c.backgroundColor =
        transparent && format === "png"
          ? ""
          : this.background === "transparent"
            ? "#ffffff"
            : this.background;
      c.setViewportTransform([1, 0, 0, 1, 0, 0]);
      c.renderAll();
      return c.toDataURL({
        format,
        quality: 1,
        multiplier: 1,
        enableRetinaScaling: false,
      });
    } finally {
      c.dispose();
    }
  }
  async template(template) {
    this.canvas.clear();
    this.width = template.width;
    this.height = template.height;
    this.background = template.bg;
    this.resize();
    for (const item of template.items) {
      const obj =
        item.type === "text"
          ? new Textbox(item.text, {
              ...item.props,
              fontFamily: FONT,
              lineHeight: 1.2,
            })
          : item.type === "circle"
            ? new Circle(item.props)
            : new Rect(item.props);
      obj.set({ id: crypto.randomUUID(), label: item.label });
      this.canvas.add(obj);
    }
    this.commit();
  }
  dispose() {
    return this.canvas.dispose();
  }
}
