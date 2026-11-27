import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { docSummary, resolveDoc, validateDoc } from "../shared/doc.js";
import { EXPORT_PRESETS, SAFE_ID, type ActionDoc, type BattleDbLike, type Diagnostic, type ResolvedDoc } from "../shared/types.js";
import { pkgRoot } from "./assets.js";

export const CONFIG_NAME = "easyaction.config.json";
export const DOC_EXT = ".easyaction.json";

export interface EasyActionConfig {
  name: string;
  /** Easy Battle data: an easybattle.json export, an Easy Battle workspace or its battles/ folder. Default: $EASYBATTLE_HOME/samples or the sibling easybattle install. */
  battle?: string;
  /** Easy Scene / Easy Tilemap town exports (towns/<scene>/<scene>.pixi.json) for scene-backed levels. */
  scenes?: string;
}

export const DEFAULT_CONFIG: EasyActionConfig = { name: "Easy Action Workspace" };

export function assertSafeId(id: unknown, label = "id"): string {
  if (typeof id !== "string" || !SAFE_ID.test(id)) throw new Error(`Invalid ${label} ${JSON.stringify(id)} (use a-z, 0-9, _ or -)`);
  return id;
}
export const resolveWorkspace = (dir = process.cwd()) => path.resolve(dir);
export const dirs = (root: string) => ({ actions: path.join(root, "actions"), exports: path.join(root, "exports") });

export function allowedRoots(root: string): string[] {
  const extra = (process.env.EASYACTION_ALLOWED_DIRS ?? "").split(path.delimiter).map((s) => s.trim()).filter(Boolean).map((p) => path.resolve(p));
  return [path.resolve(root), ...extra];
}
export function resolveInside(root: string, p: string): string {
  const abs = path.resolve(root, p);
  if (!allowedRoots(root).some((r) => abs === r || abs.startsWith(r + path.sep))) throw new Error(`${p} is outside the workspace (set EASYACTION_ALLOWED_DIRS to allow it)`);
  return abs;
}

export async function initWorkspace(dir = process.cwd(), opts: { force?: boolean } = {}): Promise<string> {
  const root = resolveWorkspace(dir);
  await mkdir(dirs(root).actions, { recursive: true });
  const cfg = path.join(root, CONFIG_NAME);
  if (!existsSync(cfg) || opts.force) await writeFile(cfg, JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n");
  const src = path.join(pkgRoot, "samples", "actions");
  for (const f of await readdir(src)) {
    const to = path.join(dirs(root).actions, f);
    if (!existsSync(to) || opts.force) await copyFile(path.join(src, f), to);
  }
  return root;
}

export async function loadConfig(root: string): Promise<EasyActionConfig> {
  const f = path.join(root, CONFIG_NAME);
  return existsSync(f) ? { ...DEFAULT_CONFIG, ...JSON.parse(await readFile(f, "utf8")) } : { ...DEFAULT_CONFIG };
}

export const docPath = (root: string, id: string) => path.join(dirs(root).actions, `${assertSafeId(id)}${DOC_EXT}`);

export async function readDocRaw(root: string, id: string): Promise<ActionDoc | undefined> {
  const f = docPath(root, id);
  return existsSync(f) ? (JSON.parse(await readFile(f, "utf8")) as ActionDoc) : undefined;
}

export async function listDocs(root: string): Promise<{ docs: ActionDoc[]; broken: Array<{ id: string; error: string }> }> {
  const docs: ActionDoc[] = [];
  const broken: Array<{ id: string; error: string }> = [];
  const files = (await readdir(dirs(root).actions).catch(() => [] as string[])).filter((f) => f.endsWith(DOC_EXT)).sort();
  for (const f of files) {
    const id = f.slice(0, -DOC_EXT.length);
    try {
      docs.push(JSON.parse(await readFile(path.join(dirs(root).actions, f), "utf8")));
    } catch (e) {
      broken.push({ id, error: (e as Error).message });
    }
  }
  return { docs, broken };
}

export async function loadDoc(root: string, id: string): Promise<ResolvedDoc> {
  const raw = await readDocRaw(root, id);
  if (!raw) throw new Error(`No action document "${id}" (actions/${id}${DOC_EXT})`);
  const { errors } = validateDoc(raw);
  if (errors.length) throw new Error(`${id}: ${errors.map((e) => `${e.path}: ${e.message}`).join("; ")}`);
  return resolveDoc(raw);
}

export async function saveDoc(root: string, id: string, raw: unknown, opts: { dryRun?: boolean } = {}) {
  assertSafeId(id);
  const doc = raw as ActionDoc;
  if (doc?.id !== id) throw new Error(`document id ${JSON.stringify(doc?.id)} must equal ${id}`);
  const battle = await loadBattleDb(root).catch(() => null);
  const res = validateDoc(doc, battle);
  if (!res.errors.length && !opts.dryRun) {
    await mkdir(dirs(root).actions, { recursive: true });
    await writeFile(docPath(root, id), JSON.stringify(doc, null, 2) + "\n");
  }
  return { saved: !res.errors.length && !opts.dryRun, ...res };
}

/** Easy Battle database: config.battle → $EASYBATTLE_HOME/samples/battles → sibling ../easybattle/samples/battles. */
export async function loadBattleDb(root: string): Promise<BattleDbLike> {
  const cfg = await loadConfig(root);
  const candidates = [
    cfg.battle ? path.resolve(root, cfg.battle) : null,
    process.env.EASYBATTLE_HOME ? path.join(process.env.EASYBATTLE_HOME, "samples", "battles") : null,
    path.resolve(pkgRoot, "..", "easybattle", "samples", "battles"),
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    if (!existsSync(c)) continue;
    if (c.endsWith(".json")) {
      const j = JSON.parse(await readFile(c, "utf8"));
      return (j.db ?? j) as BattleDbLike;
    }
    const folder = existsSync(path.join(c, "battles")) ? path.join(c, "battles") : c;
    const db: BattleDbLike = { rules: { enemyScale: 8, crit: 6 }, heroes: [], enemies: [] };
    for (const f of (await readdir(folder)).filter((x) => x.endsWith(".easybattle.json")).sort()) {
      const d = JSON.parse(await readFile(path.join(folder, f), "utf8"));
      if (d.rules) db.rules = { ...db.rules, ...d.rules };
      for (const h of d.heroes ?? []) db.heroes = [...db.heroes.filter((x) => x.id !== h.id), h];
      for (const e of d.enemies ?? []) db.enemies = [...db.enemies.filter((x) => x.id !== e.id), e];
    }
    if (db.heroes.length || db.enemies.length) return db;
  }
  throw new Error("Easy Battle data not found: set \"battle\" in easyaction.config.json (easybattle.json export or workspace) or EASYBATTLE_HOME");
}

export async function checkDoc(root: string, id: string): Promise<{ errors: Diagnostic[]; warnings: Diagnostic[] }> {
  const raw = await readDocRaw(root, id);
  if (!raw) return { errors: [{ path: "(doc)", message: `no document ${id}` }], warnings: [] };
  const battle = await loadBattleDb(root).catch(() => null);
  const res = validateDoc(raw, battle);
  if (!battle) res.warnings.push({ path: "(battle)", message: "Easy Battle data not found; enemy ids not checked" });
  return res;
}

export async function workspaceSummary(root: string) {
  const { docs, broken } = await listDocs(root);
  const battle = await loadBattleDb(root).catch(() => null);
  return {
    root,
    config: await loadConfig(root),
    docs: docs.map((d) => { try { return docSummary(d); } catch { return { id: d.id, error: "invalid" }; } }),
    broken,
    battle: battle ? { heroes: battle.heroes.map((h) => h.id), enemies: battle.enemies.map((e) => e.id) } : null,
    exportPresets: EXPORT_PRESETS,
  };
}
