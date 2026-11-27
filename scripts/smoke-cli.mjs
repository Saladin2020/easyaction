/** CLI smoke test: init a temp workspace, info, check, jump, sim, render, from-scene and export through the real CLI. */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const ws = mkdtempSync(path.join(os.tmpdir(), "easyaction-cli-"));
const run = (args, withWs = true) => execFileSync("npx", ["tsx", "src/cli.ts", ...args, ...(withWs ? ["--workspace", ws] : [])], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" });
let failed = false;
const ok = (cond, label) => {
  console.log(`${cond ? "ok  " : "FAIL"} ${label}`);
  if (!cond) failed = true;
};
const png = (f) => existsSync(f) && readFileSync(f).toString("ascii", 1, 4) === "PNG";

run(["init"]);
ok(existsSync(path.join(ws, "actions", "three_towns.easyaction.json")), "init copies the sample");
const info = JSON.parse(run(["info", "--json"]));
ok(info.docs.length === 1 && info.battle?.enemies.includes("monkey_thief"), "info finds the doc and Easy Battle data");
ok(/✓ three_towns/.test(run(["check"])), "check passes");
const jump = JSON.parse(run(["jump", "three_towns"]));
ok(jump.running.height > 48 && jump.running.distance > 40, `jump reach ${jump.running.height.toFixed(1)} px high, ${jump.running.distance} px long`);
const sim = JSON.parse(run(["sim", "three_towns", "monkey_raid", "--party", "ton:3,adam:3", "--json"]));
ok(sim.filter((r) => r.result === "win").length >= 4, `sim monkey_raid: ${sim.map((r) => r.result).join(",")}`);
ok(/ชนะ|แพ้/.test(run(["sim", "three_towns", "field_pests", "--lang", "th", "--seeds", "1"])), "sim prints Thai results");
const out = path.join(ws, "lvl.png");
run(["render", "three_towns", "ban_na_di_rooftops", "--out", out, "--scale", "1"]);
ok(png(out) && readFileSync(out).readUInt32BE(16) === 880, "render level → 880 px PNG");
const scene = path.join(ws, "scene.pixi.json");
writeFileSync(scene, JSON.stringify({ id: "town_x", size: { width: 400, height: 272 }, collision: { solid: [{ x: 0, y: 224, w: 400, h: 48 }], oneWay: [{ x: 50, y: 180, w: 60, h: 4 }] } }));
const lvl = JSON.parse(run(["from-scene", scene], false));
ok(lvl.groundY === 224 && lvl.platforms.length === 1, "from-scene builds a level base");
writeFileSync(path.join(ws, "actions", "broken.easyaction.json"), JSON.stringify({ format: "easyaction/1", id: "broken", name: { th: "x", en: "x" }, levels: [{ id: "a", name: { th: "a", en: "a" }, width: 100, height: 100, groundY: 90, solids: [], platforms: [], ladders: [], spawn: [1, 90] }], encounters: [{ id: "e", name: { th: "e", en: "e" }, enemies: [{ id: "dragon_king" }] }] }));
let err = "";
try {
  run(["check", "broken"]);
} catch (e) {
  err = String(e.stdout);
}
ok(/dragon_king/.test(err), "check reports unknown Easy Battle enemies and exits 1");
for (const p of ["json", "pixi", "godot"]) {
  const r = JSON.parse(run(["export", "three_towns", "--preset", p, "--json"]));
  ok(r.files.length >= 2 && existsSync(r.out), `export ${p}: ${r.files.length} files`);
}
rmSync(ws, { recursive: true, force: true });
console.log(failed ? "CLI smoke FAILED" : "CLI smoke OK");
process.exit(failed ? 1 : 0);
