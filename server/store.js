import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
export class Store {
  constructor(dir) {
    this.dir = dir;
  }
  async init() {
    for (const d of ["", "assets", "projects", "tasks"])
      await fs.mkdir(path.join(this.dir, d), { recursive: true, mode: 0o700 });
  }
  async read(file, fallback = null) {
    try {
      return JSON.parse(await fs.readFile(path.join(this.dir, file), "utf8"));
    } catch (e) {
      if (e.code === "ENOENT") return fallback;
      throw e;
    }
  }
  async write(file, value) {
    const dest = path.join(this.dir, file),
      tmp = dest + "." + crypto.randomUUID() + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(value), { mode: 0o600 });
    await fs.rename(tmp, dest);
  }
  async list(dir) {
    return (await fs.readdir(path.join(this.dir, dir))).filter((x) =>
      x.endsWith(".json"),
    );
  }
  async records(dir) {
    return Promise.all(
      (await this.list(dir)).map((f) => this.read(`${dir}/${f}`)),
    );
  }
  async remove(file) {
    await fs.rm(path.join(this.dir, file), { force: true });
  }
}
