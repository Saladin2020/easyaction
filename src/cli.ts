#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { serve } from "@hono/node-server";
import { Command } from "commander";
import open from "open";
import { createApp, defaultWebRoot } from "./server/app.js";
import { resolveToken } from "./shared/requestGuard.js";
import { arena, fightersFromBattle, simulateSkirmish } from "./shared/combat.js";
import { levelFromScene, t } from "./shared/doc.js";
import { jumpReach } from "./shared/physics.js";
import { EXPORT_PRESETS, type ExportPreset } from "./shared/types.js";
import { exportAction } from "./lib/export.js";
import { renderLevelPng } from "./lib/render.js";
import { checkDoc, dirs, initWorkspace, loadBattleDb, loadConfig, loadDoc, resolveWorkspace, workspaceSummary } from "./lib/workspace.js";

const program = new Command();
const workspaceOf = (cli?: string) => resolveWorkspace(cli?.trim() || process.env.EASYACTION_HOME?.trim() || process.env.EASYACTION_WORKSPACE?.trim() || process.cwd());
const fail = (e: unknown) => {
  console.error(`error: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
};
const run = (fn: () => Promise<void>) => fn().catch(fail);

/** "ton:3,adam:2" → [{id:"ton",level:3},…] */
export function parseParty(s: string) {
  return s.split(",").map((p) => p.trim()).filter(Boolean).map((p) => {
    const [id, lv] = p.split(":");
    return { id: id!, level: Math.max(1, Number(lv ?? 1) || 1) };
  });
}

program.name("easyaction").description("Side-view platformer physics (jump / climb / one-way platforms) and real-time action combat on Easy Battle stats → Godot 4.3+ / PixiJS v8").version("0.1.0");

program.command("init").description("Create actions/ exports/ with the three_towns sample").option("--force").option("--workspace <path>")
  .action((o: { force?: boolean; workspace?: string }) => run(async () => {
    const root = await initWorkspace(workspaceOf(o.workspace), { force: o.force });
    console.log(`Initialized Easy Action workspace at ${root}`);
    console.log("  actions/   <id>.easyaction.json (levels, encounters, physics / combat tuning)");
    console.log("  exports/   Godot / PixiJS / JSON exports");
  }));

program.command("info").description("Workspace summary").option("--workspace <path>").option("--json")
  .action((o: { workspace?: string; json?: boolean }) => run(async () => {
    const s = await workspaceSummary(workspaceOf(o.workspace));
    if (o.json) return void console.log(JSON.stringify(s, null, 2));
    console.log(`Easy Action workspace ${s.root}`);
    for (const d of s.docs) console.log(`  ${d.id}  ${JSON.stringify(d).slice(0, 140)}`);
    for (const b of s.broken) console.log(`  ! ${b.id}: ${b.error}`);
    console.log(s.battle ? `  Easy Battle: ${s.battle.heroes.length} heroes, ${s.battle.enemies.length} enemies` : "  Easy Battle data not found (set config.battle or EASYBATTLE_HOME)");
  }));

program.command("check").description("Validate documents (reachability, enemy ids)").argument("[ids...]").option("--workspace <path>").option("--json")
  .action((ids: string[], o: { workspace?: string; json?: boolean }) => run(async () => {
    const root = workspaceOf(o.workspace);
    const all = ids.length ? ids : (await workspaceSummary(root)).docs.map((d) => d.id);
    let bad = 0;
    const out: Record<string, unknown> = {};
    for (const id of all) {
      const r = await checkDoc(root, id);
      out[id] = r;
      bad += r.errors.length;
      if (!o.json) {
        console.log(`${r.errors.length ? "✗" : "✓"} ${id}  ${r.errors.length} errors, ${r.warnings.length} warnings`);
        r.errors.forEach((e) => console.log(`  error ${e.path}: ${e.message}`));
        r.warnings.forEach((w) => console.log(`  warning ${w.path}: ${w.message}`));
      }
    }
    if (o.json) console.log(JSON.stringify(out, null, 2));
    if (bad) process.exit(1);
  }));

program.command("jump").description("Jump reach for a document's physics").argument("<id>").option("--workspace <path>")
  .action((id: string, o: { workspace?: string }) => run(async () => {
    const doc = await loadDoc(workspaceOf(o.workspace), id);
    console.log(JSON.stringify({ standing: jumpReach(doc.physics, 0), running: jumpReach(doc.physics, 1) }, null, 2));
  }));

program.command("sim").description("Simulate a real-time encounter headless (AI on both sides)").argument("<id>").argument("<encounter>")
  .option("--party <list>", "Easy Battle heroes id:level,…", "ton:3,adam:3").option("--seeds <list>", "Seeds", "1,2,3,4,5").option("--lang <lang>", "th | en | ms", "en").option("--workspace <path>").option("--json")
  .action((id: string, encounter: string, o: { party: string; seeds: string; lang: "th" | "en" | "ms"; workspace?: string; json?: boolean }) => run(async () => {
    const root = workspaceOf(o.workspace);
    const doc = await loadDoc(root, id);
    const enc = doc.encounters.find((e) => e.id === encounter);
    if (!enc) throw new Error(`unknown encounter ${encounter} (have ${doc.encounters.map((e) => e.id).join(", ")})`);
    const db = await loadBattleDb(root);
    const level = enc.level ? doc.levels.find((l) => l.id === enc.level)! : arena(enc.width ?? 480);
    const runs = o.seeds.split(",").map(Number).map((seed) => ({ seed, ...simulateSkirmish(fightersFromBattle(db, parseParty(o.party), enc.enemies, level.width), level, seed, { physics: doc.physics, combat: doc.combat }) }));
    if (o.json) return void console.log(JSON.stringify(runs, null, 2));
    for (const r of runs) console.log(`seed ${r.seed}: ${t(`action.${r.result}`, o.lang)}  ${r.ticks} ticks (${(r.ticks / 60).toFixed(1)}s)  hits ${r.hits}`);
    console.log(`${runs.filter((r) => r.result === "win").length}/${runs.length} wins`);
  }));

program.command("render").description("Level preview PNG").argument("<id>").argument("<level>").option("--out <file>").option("--background <png>", "Easy Scene preview PNG").option("--scale <n>", "Scale", "2").option("--workspace <path>")
  .action((id: string, level: string, o: { out?: string; background?: string; scale: string; workspace?: string }) => run(async () => {
    const root = workspaceOf(o.workspace);
    const doc = await loadDoc(root, id);
    const l = doc.levels.find((x) => x.id === level);
    if (!l) throw new Error(`unknown level ${level}`);
    const file = o.out ?? path.join(dirs(root).exports, `${id}-${level}.png`);
    await mkdir(path.dirname(path.resolve(file)), { recursive: true });
    await writeFile(file, await renderLevelPng(l, doc.physics, { background: o.background, scale: Number(o.scale) }));
    console.log(`wrote ${file}`);
  }));

program.command("from-scene").description("Level base from an Easy Scene <scene>.pixi.json (floor, solids, one-way platforms)").argument("<pixiJson>").option("--id <id>")
  .action((file: string, o: { id?: string }) => run(async () => {
    console.log(JSON.stringify(levelFromScene(JSON.parse(await readFile(file, "utf8")), o.id), null, 2));
  }));

program.command("export").description(`Export a document: ${EXPORT_PRESETS.join(" | ")}`).argument("<id>").option("--preset <preset>", EXPORT_PRESETS.join(" | "), "pixi").option("--out <dir>").option("--workspace <path>").option("--json")
  .action((id: string, o: { preset: string; out?: string; workspace?: string; json?: boolean }) => run(async () => {
    const r = await exportAction(workspaceOf(o.workspace), id, { preset: o.preset as ExportPreset, out: o.out, trustedPaths: true });
    if (o.json) return void console.log(JSON.stringify(r, null, 2));
    console.log(`exported ${r.out}  (${r.files.length} files)`);
  }));

program.command("serve").description("Web tool + API (default http://127.0.0.1:8988)").option("--port <port>", "Port", "8988").option("--host <host>", "Interface (non-loopback requires the printed token)", "127.0.0.1").option("--dev", "API only; use the Vite UI on :5198").option("--open").option("--workspace <path>")
  .action((o: { port: string; host: string; dev?: boolean; open?: boolean; workspace?: string }) => run(async () => {
    const root = workspaceOf(o.workspace);
    if (!existsSync(dirs(root).actions)) await initWorkspace(root);
    await loadConfig(root);
    const token = resolveToken(o.host);
    const app = createApp({ workspaceRoot: root, webRoot: defaultWebRoot(), dev: o.dev, host: o.host, token });
    const port = Number(o.port);
    serve({ fetch: app.fetch, port, hostname: o.host }, () => {
      const url = `http://${o.host === "0.0.0.0" ? "127.0.0.1" : o.host}:${port}/`;
      console.log(`Easy Action ${o.dev ? "API (dev)" : "tool"} → ${url}`);
      console.log(`Workspace ${root}`);
      if (token) console.log(`Token (needed off-loopback): ${url}?token=${token}`);
      if (o.open) void open(o.dev ? "http://127.0.0.1:5198" : url);
    });
  }));

program.parseAsync(process.argv).catch(fail);
