import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { STRINGS } from "../shared/doc.js";
import { parityScripts, skirmishCases } from "../shared/parity.js";
import { EXPORT_PRESETS, FORMAT, type BattleDbLike, type ExportPreset, type ResolvedDoc } from "../shared/types.js";
import { RUNTIME_DIR } from "./assets.js";
import { dirs, loadBattleDb, loadDoc, resolveInside } from "./workspace.js";

export { EXPORT_PRESETS };

/** The battle data a game needs at runtime (heroes, enemies, rules). */
function battleSubset(db: BattleDbLike) {
  return { rules: db.rules, heroes: db.heroes.map((h) => ({ id: h.id, name: h.name, base: h.base, growth: h.growth, tree: h.tree ?? [] })), enemies: db.enemies.map((e) => ({ id: e.id, name: e.name, level: e.level, stats: e.stats, xp: e.xp ?? 0, coins: e.coins ?? 0, art: e.art ?? "" })) };
}

const PIXI_HTML = (id: string) => `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><link rel="icon" href="data:,"><title>Easy Action — ${id}</title>
<style>body{margin:0;background:#1a1410;color:#f3e7d3;font-family:system-ui}canvas{image-rendering:pixelated;width:960px;height:540px;display:block;margin:12px auto}p{text-align:center}</style></head>
<body><p>← → เดิน · Space/Z กระโดด · ↑↓ ปีน · Enter = ต่อสู้แบบเรียลไทม์ · J ตี · K ท่าหนัก</p>
<script>
const s = document.createElement("script"); s.src = "./pixi.min.js";
s.onerror = () => { const c = document.createElement("script"); c.src = "https://cdn.jsdelivr.net/npm/pixi.js@8/dist/pixi.min.js"; c.onload = boot; document.head.appendChild(c); };
s.onload = boot; document.head.appendChild(s);
async function boot() {
  const { loadAction } = await import("./easyaction-pixi.js");
  const app = new PIXI.Application(); await app.init({ width: 480, height: 270, background: "#87b7d9", antialias: false });
  document.body.appendChild(app.canvas);
  const ea = await loadAction(PIXI, "./easyaction.json");
  const db = await (await fetch("./battle_db.json")).json();
  const world = new PIXI.Container(); app.stage.addChild(world);
  const lvl = ea.doc.levels[0];
  world.addChild(new PIXI.Graphics().rect(0, lvl.groundY, lvl.width, lvl.height - lvl.groundY).fill(0x6b4a2a));
  const pl = await ea.platformer(world, { level: lvl.id, debug: true });
  let fight = null;
  addEventListener("keydown", async (e) => {
    if (e.key === "Enter" && !fight) { world.visible = false; fight = await ea.skirmish(app, { encounter: ea.doc.encounters[0].id, battle: db, party: [{ id: db.heroes[0].id, level: 3 }], seed: 1, onEnd: () => { fight.destroy(); fight = null; world.visible = true; } }); return; }
    (fight ?? pl).key(e.key, true);
  });
  addEventListener("keyup", (e) => (fight ?? pl).key(e.key, false));
  app.ticker.add((t) => { const dt = t.deltaMS / 1000; if (fight) fight.update(dt); else { pl.update(dt); world.x = Math.min(0, Math.max(480 - lvl.width, 240 - pl.body.x)); } });
  window.__ea = { ea, pl, get fight() { return fight; } }; window.__ready = true;
}
</script></body></html>
`;

const PROJECT_GODOT = (id: string) => `; Easy Action export (${id})
config_version=5

[application]
config/name="Easy Action — ${id}"
run/main_scene="res://main.tscn"
config/features=PackedStringArray("4.3")

[display]
window/size/viewport_width=960
window/size/viewport_height=540

[rendering]
textures/canvas_textures/default_texture_filter=0
`;

const MAIN_TSCN = `[gd_scene load_steps=2 format=3]

[ext_resource type="Script" path="res://main.gd" id="1"]

[node name="Main" type="Node2D"]
script = ExtResource("1")
`;

export async function exportAction(root: string, id: string, opts: { preset?: ExportPreset; out?: string; trustedPaths?: boolean } = {}): Promise<{ preset: ExportPreset; out: string; files: string[] }> {
  const preset = opts.preset ?? "json";
  if (!EXPORT_PRESETS.includes(preset)) throw new Error(`preset must be ${EXPORT_PRESETS.join(" | ")}`);
  const doc: ResolvedDoc = await loadDoc(root, id);
  const db = await loadBattleDb(root).catch(() => null);
  const out = opts.out ? (opts.trustedPaths ? path.resolve(opts.out) : resolveInside(root, opts.out)) : path.join(dirs(root).exports, `${id}-${preset}`);
  const files: string[] = [];
  const write = async (rel: string, data: string | Buffer) => {
    const f = path.join(out, rel);
    await mkdir(path.dirname(f), { recursive: true });
    await writeFile(f, data);
    files.push(rel);
  };
  const cp = async (from: string, rel: string) => {
    const f = path.join(out, rel);
    await mkdir(path.dirname(f), { recursive: true });
    await copyFile(from, f);
    files.push(rel);
  };
  const json = JSON.stringify({ format: FORMAT, generator: "easyaction", doc, strings: STRINGS }, null, 2) + "\n";
  if (preset === "json") {
    await write("easyaction.json", json);
    if (db) await write("battle_db.json", JSON.stringify(battleSubset(db)) + "\n");
  } else if (preset === "pixi") {
    await write("easyaction.json", json);
    if (db) await write("battle_db.json", JSON.stringify(battleSubset(db)) + "\n");
    await cp(path.join(RUNTIME_DIR, "pixi", "easyaction-core.js"), "easyaction-core.js");
    await cp(path.join(RUNTIME_DIR, "pixi", "easyaction-pixi.js"), "easyaction-pixi.js");
    const pixi = process.env.PIXI_JS;
    if (pixi && existsSync(pixi)) await cp(pixi, "pixi.min.js");
    await write("index.html", PIXI_HTML(id));
  } else {
    await write("project.godot", PROJECT_GODOT(id));
    await write("main.tscn", MAIN_TSCN);
    for (const f of ["easyaction_core.gd", "action_player.gd", "skirmish_view.gd"]) await cp(path.join(RUNTIME_DIR, "godot", f), `easyaction/${f}`);
    for (const f of ["main.gd", "test_action.gd"]) await cp(path.join(RUNTIME_DIR, "godot", f), f);
    await write("easyaction/easyaction.json", json);
    await write("easyaction/battle_db.json", JSON.stringify(db ? battleSubset(db) : {}) + "\n");
    const sk = db ? skirmishCases(doc, db).map((c) => ({ name: c.name, fighters: c.fighters, level: c.level, seed: c.seed })) : [];
    await write("easyaction/parity.json", JSON.stringify({ scripts: parityScripts(), skirmishes: sk }) + "\n");
  }
  return { preset, out, files };
}

export async function readExportJson(file: string) {
  return JSON.parse(await readFile(file, "utf8"));
}
