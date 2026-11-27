/**
 * Easy Action real-time combat — the action alternative to turn-based Easy Battle, reusing its heroes, enemies and
 * stats (heroStats / enemyStats / skill-tree bonuses, same formulas). Fixed 60 ticks / s, deterministic with a seed
 * (mulberry32), same rules as the GDScript port.
 *
 *   light attack (J) / heavy attack (K, costs MP) with startup → active → recovery ticks and a hitbox in front
 *   damage = max(1, floor(ATK × power − DEF / 2) + variance(−2..2)), crit (rules.crit %) × 1.5
 *   hit → knockback, stun, invulnerability; jump / run use the platformer physics (SPD speeds you up)
 *   enemies + party allies: walk to the nearest foe, attack in reach on a cooldown from SPD
 *   RNG draw order per hit: crit roll, variance roll; per AI attack decision: cooldown jitter roll.
 */
import { DEFAULT_PHYSICS, bodyAnim, newBody, stepBody, type Body, type Input } from "./physics.js";
import { mulberry32 } from "./rng.js";
import type { BattleDbLike, BattleStats, CombatRules, Level, Move, Physics } from "./types.js";

export const DEFAULT_MOVES: { light: Move; heavy: Move } = {
  light: { startup: 5, active: 4, recovery: 9, reach: 22, height: 24, power: 1, knockback: 2.5, cooldown: 0, mp: 0 },
  heavy: { startup: 12, active: 5, recovery: 16, reach: 28, height: 28, power: 1.7, knockback: 4.5, cooldown: 45, mp: 3 },
};

export const DEFAULT_COMBAT: CombatRules = {
  stun: 14,
  invuln: 24,
  speedBase: 0.8,
  speedDiv: 50,
  aiCooldown: 60,
  minCooldown: 24,
  aiJitter: 24,
  maxTicks: 60 * 90,
  crit: 6,
  moves: DEFAULT_MOVES,
};

export type Side = "hero" | "enemy";
export type FighterState = "idle" | "run" | "jump" | "fall" | "attack" | "hurt" | "down";

export interface FighterSetup {
  id: string;
  side: Side;
  stats: BattleStats;
  x: number;
  name?: { th: string; en: string; ms?: string };
  /** Player-controlled (input from the game); others use the AI. */
  player?: boolean;
  xp?: number;
  coins?: number;
  art?: string;
}

export interface Fighter extends FighterSetup {
  hp: number;
  mp: number;
  maxHp: number;
  maxMp: number;
  body: Body;
  state: FighterState;
  move: "light" | "heavy" | null;
  t: number;
  hitDone: string[];
  stun: number;
  invuln: number;
  cd: { light: number; heavy: number };
  ai: number;
}

export interface CombatInput extends Input {
  light?: boolean;
  heavy?: boolean;
}

export interface HitEvent {
  tick: number;
  from: string;
  to: string;
  damage: number;
  crit: boolean;
  down: boolean;
}

export type CombatResult = "ongoing" | "win" | "lose" | "draw";

const floor = Math.floor;

/** Easy Battle formulas (copied, parity-tested against easybattle-core.js). */
export function heroStats(h: BattleDbLike["heroes"][number], level: number, tree: string[] = []): BattleStats {
  const out: Record<string, number> = {};
  for (const k of Object.keys(h.base)) out[k] = floor(h.base[k]! + (h.growth[k] ?? 0) * (level - 1));
  for (const n of h.tree ?? []) if (tree.includes(n.id) && n.stats) for (const k of Object.keys(n.stats)) out[k] = (out[k] ?? 0) + n.stats[k]!;
  return out as BattleStats;
}
export function enemyStats(db: BattleDbLike, e: BattleDbLike["enemies"][number], level: number): BattleStats {
  const out: Record<string, number> = {};
  const pct = 100 + db.rules.enemyScale * (level - e.level);
  for (const k of Object.keys(e.stats)) out[k] = Math.max(k === "hp" ? 1 : 0, floor((e.stats[k]! * pct) / 100));
  return out as BattleStats;
}

/** Party + encounter enemies → fighters (heroes on the left, enemies on the right of the arena). */
export function fightersFromBattle(
  db: BattleDbLike,
  party: Array<{ id: string; level: number; tree?: string[]; hp?: number }>,
  enemies: Array<{ id: string; level?: number; x?: number }>,
  width: number,
): FighterSetup[] {
  const out: FighterSetup[] = [];
  party.forEach((p, i) => {
    const h = db.heroes.find((x) => x.id === p.id);
    if (!h) throw new Error(`unknown hero ${p.id}`);
    out.push({ id: p.id, side: "hero", stats: heroStats(h, p.level, p.tree ?? []), x: 60 - i * 24, name: h.name, player: i === 0 });
  });
  enemies.forEach((e, i) => {
    const d = db.enemies.find((x) => x.id === e.id);
    if (!d) throw new Error(`unknown enemy ${e.id}`);
    out.push({ id: `${e.id}#${i}`, side: "enemy", stats: enemyStats(db, d, e.level ?? d.level), x: e.x ?? width - 80 - i * 36, name: d.name, xp: d.xp ?? 0, coins: d.coins ?? 0, art: d.art });
  });
  return out;
}

export class Skirmish {
  readonly P: Physics;
  readonly R: CombatRules;
  readonly level: Level;
  readonly fighters: Fighter[];
  readonly hits: HitEvent[] = [];
  tick = 0;
  result: CombatResult = "ongoing";
  private rnd: () => number;
  private listeners: Array<(ev: string, ...a: unknown[]) => void> = [];

  constructor(setup: { fighters: FighterSetup[]; level: Level; seed: number; physics?: Physics; combat?: CombatRules }) {
    this.P = setup.physics ?? DEFAULT_PHYSICS;
    this.R = setup.combat ?? DEFAULT_COMBAT;
    this.level = setup.level;
    this.rnd = mulberry32(setup.seed);
    this.fighters = setup.fighters.map((f) => {
      const speed = this.R.speedBase + (f.stats.spd ?? 0) / this.R.speedDiv;
      const body = newBody(this.P, f.x, this.level.groundY, speed);
      body.facing = f.side === "hero" ? 1 : -1;
      return { ...f, hp: f.stats.hp, mp: f.stats.mp ?? 0, maxHp: f.stats.hp, maxMp: f.stats.mp ?? 0, body, state: "idle", move: null, t: 0, hitDone: [], stun: 0, invuln: 0, cd: { light: 0, heavy: 0 }, ai: 30 };
    });
  }

  on(fn: (ev: string, ...a: unknown[]) => void) {
    this.listeners.push(fn);
    return this;
  }
  private emit(ev: string, ...a: unknown[]) {
    for (const l of this.listeners) l(ev, ...a);
  }

  alive(side?: Side) {
    return this.fighters.filter((f) => f.hp > 0 && (!side || f.side === side));
  }
  get player(): Fighter | undefined {
    return this.fighters.find((f) => f.player);
  }

  private nearestFoe(f: Fighter): Fighter | null {
    let best: Fighter | null = null, bd = Infinity;
    for (const o of this.fighters) {
      if (o.side === f.side || o.hp <= 0) continue;
      const d = Math.abs(o.body.x - f.body.x);
      if (d < bd) (bd = d), (best = o);
    }
    return best;
  }

  private aiInput(f: Fighter): CombatInput {
    const foe = this.nearestFoe(f);
    if (!foe) return {};
    const dx = foe.body.x - f.body.x;
    const reach = this.R.moves.light.reach + foe.body.w / 2 - 2;
    if (f.ai > 0) f.ai--;
    if (Math.abs(dx) > reach) return { left: dx < 0, right: dx > 0 };
    f.body.facing = dx < 0 ? -1 : 1;
    if (f.ai > 0 || f.move) return {};
    f.ai = Math.max(this.R.minCooldown, this.R.aiCooldown - (f.stats.spd ?? 0)) + floor(this.rnd() * this.R.aiJitter);
    const heavy = f.mp >= this.R.moves.heavy.mp && f.cd.heavy === 0 && f.side === "hero" && f.hp * 2 > f.maxHp;
    return heavy ? { heavy: true } : { light: true };
  }

  private startMove(f: Fighter, m: "light" | "heavy") {
    const mv = this.R.moves[m];
    if (f.move || f.stun > 0 || f.cd[m] > 0 || f.mp < mv.mp) return;
    f.mp -= mv.mp;
    f.move = m;
    f.t = 0;
    f.hitDone = [];
    f.cd[m] = mv.cooldown;
  }

  private hitbox(f: Fighter, mv: Move) {
    const b = f.body;
    const x0 = b.facing > 0 ? b.x : b.x - mv.reach;
    return { x: x0, y: b.y - mv.height, w: mv.reach, h: mv.height };
  }

  private resolveHits(f: Fighter) {
    const mv = this.R.moves[f.move!];
    const hb = this.hitbox(f, mv);
    for (const o of this.fighters) {
      if (o.side === f.side || o.hp <= 0 || o.invuln > 0 || f.hitDone.includes(o.id)) continue;
      const b = o.body;
      if (!(b.x + b.w / 2 > hb.x && b.x - b.w / 2 < hb.x + hb.w && b.y > hb.y && b.y - b.h < hb.y + hb.h)) continue;
      f.hitDone.push(o.id);
      const crit = this.rnd() * 100 < this.R.crit;
      const variance = floor(this.rnd() * 5) - 2;
      let dmg = Math.max(1, floor(f.stats.atk * mv.power - (o.stats.def ?? 0) / 2) + variance);
      if (crit) dmg = floor(dmg * 1.5);
      o.hp = Math.max(0, o.hp - dmg);
      o.stun = this.R.stun;
      o.invuln = this.R.invuln;
      o.move = null;
      b.vx = mv.knockback * f.body.facing;
      b.vy = -2;
      b.onGround = false;
      const down = o.hp <= 0;
      if (down) o.state = "down";
      const ev: HitEvent = { tick: this.tick, from: f.id, to: o.id, damage: dmg, crit, down };
      this.hits.push(ev);
      this.emit("hit", ev);
      if (down) this.emit("down", o.id);
    }
  }

  /** One tick. `input` drives the player fighter (others use the AI). */
  step(input: CombatInput = {}): CombatResult {
    if (this.result !== "ongoing") return this.result;
    this.tick++;
    for (const f of this.fighters) {
      if (f.hp <= 0) {
        stepBody(f.body, {}, this.level, this.P);
        continue;
      }
      f.cd.light = Math.max(0, f.cd.light - 1);
      f.cd.heavy = Math.max(0, f.cd.heavy - 1);
      if (f.invuln > 0) f.invuln--;
      let inp: CombatInput = f.player ? input : this.aiInput(f);
      if (f.stun > 0) {
        f.stun--;
        inp = {};
      } else if (f.move) {
        const mv = this.R.moves[f.move];
        f.t++;
        if (f.t > mv.startup && f.t <= mv.startup + mv.active) this.resolveHits(f);
        if (f.t >= mv.startup + mv.active + mv.recovery) f.move = null;
        inp = { jump: inp.jump };
      } else if (inp.heavy) this.startMove(f, "heavy");
      else if (inp.light) this.startMove(f, "light");
      const keepFacing = f.body.facing;
      stepBody(f.body, inp, this.level, this.P);
      if (f.move) f.body.facing = keepFacing;
      f.state = f.stun > 0 ? "hurt" : f.move ? "attack" : (bodyAnim(f.body) === "climb" ? "idle" : bodyAnim(f.body)) as FighterState;
    }
    if (!this.alive("enemy").length) this.result = "win";
    else if (!this.alive("hero").length) this.result = "lose";
    else if (this.tick >= this.R.maxTicks) this.result = "draw";
    if (this.result !== "ongoing") this.emit("end", this.result, this.rewards());
    return this.result;
  }

  rewards() {
    const beaten = this.fighters.filter((f) => f.side === "enemy" && f.hp <= 0);
    return { xp: beaten.reduce((a, f) => a + (f.xp ?? 0), 0), coins: beaten.reduce((a, f) => a + (f.coins ?? 0), 0), party: this.fighters.filter((f) => f.side === "hero").map((f) => ({ id: f.id, hp: f.hp })) };
  }

  /** Compact state for parity tests: tick, result, then id:hp:round(x×1000):round(y×1000) per fighter. */
  digest(): string {
    return [this.tick, this.result, ...this.fighters.map((f) => `${f.id}:${f.hp}:${Math.round(f.body.x * 1000)}:${Math.round(f.body.y * 1000)}`)].join("|");
  }
}

/** Headless fight with every fighter on AI (the player too) — balance checks, tests, Godot parity. */
export function simulateSkirmish(fighters: FighterSetup[], level: Level, seed: number, opts: { physics?: Physics; combat?: CombatRules; maxTicks?: number } = {}) {
  const s = new Skirmish({ fighters: fighters.map((f) => ({ ...f, player: false })), level, seed, physics: opts.physics, combat: opts.combat });
  const max = opts.maxTicks ?? s.R.maxTicks;
  while (s.step() === "ongoing" && s.tick < max);
  return { result: s.result, ticks: s.tick, hits: s.hits.length, digest: s.digest(), rewards: s.rewards() };
}

/** Flat arena level for encounters without a level. */
export function arena(width = 480, groundY = 200): Level {
  return { id: "arena", name: { th: "ลานต่อสู้", en: "Arena", ms: "Gelanggang" }, width, height: groundY + 40, groundY, solids: [], platforms: [], ladders: [], spawn: [40, groundY] };
}
