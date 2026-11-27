/** Resolve + validate Easy Action documents; th / en / ms UI strings; Easy Scene → level helper. */
import { DEFAULT_COMBAT, DEFAULT_MOVES } from "./combat.js";
import { DEFAULT_PHYSICS, jumpReach } from "./physics.js";
import { FORMAT, SAFE_ID, type ActionDoc, type BattleDbLike, type Diagnostic, type Level, type Name, type ResolvedDoc } from "./types.js";

export const STRINGS: Record<string, Name & { ms: string }> = {
  "action.hp": { th: "พลัง", en: "HP", ms: "HP" },
  "action.mp": { th: "เวท", en: "MP", ms: "MP" },
  "action.light": { th: "ตี", en: "Strike", ms: "Pukul" },
  "action.heavy": { th: "ท่าหนัก", en: "Heavy", ms: "Berat" },
  "action.win": { th: "ชนะ!", en: "Victory!", ms: "Menang!" },
  "action.lose": { th: "แพ้แล้ว…", en: "Defeated…", ms: "Kalah…" },
  "action.draw": { th: "หมดเวลา", en: "Time up", ms: "Masa tamat" },
  "action.help": { th: "← → เดิน · Z/Space กระโดด · ↑↓ ปีน · J ตี · K ท่าหนัก", en: "← → move · Z/Space jump · ↑↓ climb · J strike · K heavy", ms: "← → gerak · Z/Space lompat · ↑↓ panjat · J pukul · K berat" },
  "action.climb": { th: "↑ ปีนบันได", en: "↑ climb", ms: "↑ panjat" },
  "action.coin": { th: "ได้เหรียญ", en: "Coin!", ms: "Syiling!" },
};

export const t = (key: string, lang: "th" | "en" | "ms" = "th") => STRINGS[key]?.[lang] ?? key;

export function resolveDoc(doc: ActionDoc): ResolvedDoc {
  const c = doc.combat ?? {};
  const moves = { light: { ...DEFAULT_MOVES.light, ...(c.moves?.light ?? {}) }, heavy: { ...DEFAULT_MOVES.heavy, ...(c.moves?.heavy ?? {}) } };
  return {
    id: doc.id,
    name: doc.name,
    physics: { ...DEFAULT_PHYSICS, ...(doc.physics ?? {}) },
    combat: { ...DEFAULT_COMBAT, ...c, moves },
    levels: (doc.levels ?? []).map((l) => ({ ...l, solids: l.solids ?? [], platforms: l.platforms ?? [], ladders: l.ladders ?? [], pickups: l.pickups ?? [] })),
    encounters: doc.encounters ?? [],
  };
}

const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);

/** Shape + reachability checks; `battle` (Easy Battle db) also checks enemy ids. */
export function validateDoc(doc: ActionDoc, battle?: BattleDbLike | null): { errors: Diagnostic[]; warnings: Diagnostic[] } {
  const errors: Diagnostic[] = [];
  const warnings: Diagnostic[] = [];
  const err = (path: string, message: string) => errors.push({ path, message });
  const warn = (path: string, message: string) => warnings.push({ path, message });
  if (!doc || typeof doc !== "object") return { errors: [{ path: "(doc)", message: "not an object" }], warnings };
  if (doc.format !== FORMAT) err("format", `must be "${FORMAT}"`);
  if (!SAFE_ID.test(doc.id ?? "")) err("id", "use a-z, 0-9, _ or -");
  if (!doc.name?.th || !doc.name?.en) err("name", "needs th and en");
  for (const [k, v] of Object.entries(doc.physics ?? {})) if (!num(v) || (v as number) < 0) err(`physics.${k}`, "must be a number >= 0");
  if (errors.length) return { errors, warnings };
  const r = resolveDoc(doc);
  const reach = jumpReach(r.physics);
  const ids = new Set<string>();
  r.levels.forEach((l, i) => {
    const p = `levels[${i}]`;
    if (!SAFE_ID.test(l.id ?? "")) err(`${p}.id`, "use a-z, 0-9, _ or -");
    if (ids.has(l.id)) err(`${p}.id`, `duplicate level ${l.id}`);
    ids.add(l.id);
    if (!l.name?.th || !l.name?.en) err(`${p}.name`, "needs th and en");
    if (!(l.width > 0 && l.height > 0 && l.groundY > 0 && l.groundY <= l.height)) err(p, "width, height > 0 and 0 < groundY <= height");
    for (const [k, list] of [["solids", l.solids], ["ladders", l.ladders]] as const)
      list.forEach((s, j) => {
        if (![s.x, s.y, s.w, s.h].every(num) || s.w <= 0 || s.h <= 0) err(`${p}.${k}[${j}]`, "needs x, y, w > 0, h > 0");
        else if (s.x < 0 || s.x + s.w > l.width) warn(`${p}.${k}[${j}]`, "outside the level width");
      });
    l.platforms.forEach((s, j) => {
      if (![s.x, s.y, s.w].every(num) || s.w <= 0) err(`${p}.platforms[${j}]`, "needs x, y, w > 0");
      // reachable: from the floor by a jump, or a ladder reaches it, or another platform below within a jump
      const fromBelow = [l.groundY, ...l.platforms.filter((q) => q !== s && q.y > s.y).map((q) => q.y)].some((y) => y - s.y <= reach.height);
      const byLadder = l.ladders.some((d) => d.y <= s.y + 1 && d.y + d.h >= s.y && d.x + d.w > s.x - 8 && d.x < s.x + s.w + 8);
      if (!fromBelow && !byLadder) warn(`${p}.platforms[${j}]`, `${Math.round(l.groundY - s.y)} px above the floor: higher than a jump (${Math.round(reach.height)} px) and no ladder`);
    });
    if (!Array.isArray(l.spawn) || !num(l.spawn[0]) || !num(l.spawn[1])) err(`${p}.spawn`, "needs [x, y]");
  });
  r.encounters.forEach((e, i) => {
    const p = `encounters[${i}]`;
    if (!SAFE_ID.test(e.id ?? "")) err(`${p}.id`, "use a-z, 0-9, _ or -");
    if (!e.name?.th || !e.name?.en) err(`${p}.name`, "needs th and en");
    if (e.level && !ids.has(e.level)) err(`${p}.level`, `unknown level ${e.level}`);
    if (!e.enemies?.length) err(`${p}.enemies`, "needs at least one enemy");
    if (battle) e.enemies?.forEach((x, j) => !battle.enemies.some((d) => d.id === x.id) && err(`${p}.enemies[${j}]`, `unknown Easy Battle enemy ${x.id}`));
  });
  return { errors, warnings };
}

/** Easy Scene pixi export (collision.solid / oneWay) → level base: floor = the full-width solid row. */
export function levelFromScene(scene: { id: string; size: { width: number; height: number }; collision?: { solid?: Array<{ x: number; y: number; w: number; h: number }>; oneWay?: Array<{ x: number; y: number; w: number }> } }, id = scene.id): Level {
  const solid = scene.collision?.solid ?? [];
  const floorRows = solid.filter((s) => s.w >= scene.size.width - 1);
  const groundY = floorRows.length ? Math.min(...floorRows.map((s) => s.y)) : scene.size.height;
  return {
    id,
    name: { th: id, en: id },
    scene: scene.id,
    width: scene.size.width,
    height: scene.size.height,
    groundY,
    solids: solid.filter((s) => s.w < scene.size.width - 1 && s.y < groundY),
    platforms: (scene.collision?.oneWay ?? []).map((o) => ({ x: o.x, y: o.y, w: o.w })),
    ladders: [],
    spawn: [24, groundY],
  };
}

export function docSummary(doc: ActionDoc) {
  const r = resolveDoc(doc);
  return { id: r.id, name: r.name, levels: r.levels.map((l) => ({ id: l.id, name: l.name, scene: l.scene ?? null, width: l.width, platforms: l.platforms.length, ladders: l.ladders.length, pickups: l.pickups?.length ?? 0 })), encounters: r.encounters.map((e) => ({ id: e.id, name: e.name, enemies: e.enemies.map((x) => x.id) })), jump: jumpReach(r.physics) };
}
