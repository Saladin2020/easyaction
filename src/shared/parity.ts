/** Parity cases: the TS engine and the GDScript port (test_action.gd) must print identical lines. */
import { arena, fightersFromBattle, simulateSkirmish, type FighterSetup } from "./combat.js";
import { simulatePath, type Input } from "./physics.js";
import type { BattleDbLike, Level, ResolvedDoc } from "./types.js";

const rep = (n: number, i: Input): Input[] => Array.from({ length: n }, () => ({ ...i }));

/** Scripted inputs: run + full jump, short hop, ladder climb, platform drop-through, wall bump, coyote jump. */
export function parityScripts(): Record<string, { start?: [number, number]; script: Input[] }> {
  return {
    run_jump: { script: [...rep(30, { right: true }), { right: true, jump: true, jumpPressed: true }, ...rep(40, { right: true, jump: true }), ...rep(20, {})] },
    short_hop: { script: [...rep(10, { right: true }), { jump: true, jumpPressed: true }, ...rep(3, { jump: true }), ...rep(40, {})] },
    ladder: { start: [150, 224], script: [...rep(16, { right: true }), ...rep(50, { up: true }), ...rep(30, { left: true }), { jump: true, jumpPressed: true }, ...rep(50, { left: true, jump: true })] },
    drop_through: { start: [120, 183], script: [...rep(5, {}), { down: true, jump: true, jumpPressed: true }, ...rep(40, { down: true })] },
    left_wall: { start: [80, 224], script: [...rep(60, { left: true }), { jump: true, jumpPressed: true }, ...rep(30, { left: true, jump: true })] },
    platform_hops: { start: [190, 183], script: [...rep(5, { right: true }), { right: true, jump: true, jumpPressed: true }, ...rep(25, { right: true, jump: true }), ...rep(20, { right: true }), { right: true, jump: true, jumpPressed: true }, ...rep(60, { right: true, jump: true })] },
  };
}

export function pathLine(name: string, pts: Array<[number, number, string]>): string {
  const samples = pts.filter((_, i) => i % 15 === 14 || i === pts.length - 1).map(([x, y, a]) => `${Math.round(x * 1000)},${Math.round(y * 1000)},${a}`);
  return `P| ${name} ${samples.join(";")}`;
}

export interface SkirmishCase {
  name: string;
  fighters: FighterSetup[];
  level: Level;
  seed: number;
}

export function skirmishCases(doc: ResolvedDoc, db: BattleDbLike): SkirmishCase[] {
  const party = [{ id: db.heroes[0]!.id, level: 3 }, ...(db.heroes[3] ? [{ id: db.heroes[3].id, level: 3, tree: (db.heroes[3].tree ?? []).slice(0, 1).map((n) => n.id) }] : [])];
  const out: SkirmishCase[] = [];
  for (const e of doc.encounters)
    for (const seed of [1, 7, 20261127]) {
      const level = e.level ? doc.levels.find((l) => l.id === e.level)! : arena(e.width ?? 480);
      out.push({ name: `${e.id}:${seed}`, fighters: fightersFromBattle(db, party, e.enemies, level.width), level, seed });
    }
  // a lone hero against a strong enemy (lose path)
  const strong = db.enemies.reduce((a, b) => (b.stats.atk! > a.stats.atk! ? b : a));
  out.push({ name: `solo_vs_${strong.id}:3`, fighters: fightersFromBattle(db, [{ id: db.heroes[0]!.id, level: 1 }], [{ id: strong.id, level: strong.level + 2 }], 480), level: arena(480), seed: 3 });
  return out;
}

export function parityLines(doc: ResolvedDoc, db: BattleDbLike): string[] {
  const lines: string[] = [];
  const lvl = doc.levels[0]!;
  for (const [name, c] of Object.entries(parityScripts())) lines.push(pathLine(name, simulatePath(lvl, doc.physics, c.script, c.start)));
  for (const c of skirmishCases(doc, db)) {
    const r = simulateSkirmish(c.fighters, c.level, c.seed, { physics: doc.physics, combat: doc.combat });
    lines.push(`S| ${c.name} ${r.result} ${r.hits} ${r.digest}`);
  }
  return lines;
}
