/** Easy Action document format: side-view platforming levels (Easy Scene streets) + real-time skirmishes. */
export const FORMAT = "easyaction/1";
export const SAFE_ID = /^[a-z0-9][a-z0-9_-]*$/;
export const EXPORT_PRESETS = ["json", "pixi", "godot"] as const;
export type ExportPreset = (typeof EXPORT_PRESETS)[number];

export interface Name {
  th: string;
  en: string;
  ms?: string;
}

/** Physics in pixels per tick (60 ticks / s). Positions are the body's feet (x centre, y bottom), y grows down. */
export interface Physics {
  gravity: number;
  jump: number;
  /** Releasing jump while rising multiplies vy by this once (variable jump height). */
  jumpCut: number;
  maxFall: number;
  run: number;
  accel: number;
  friction: number;
  /** Fraction of accel / friction in the air. */
  airControl: number;
  climb: number;
  /** Ticks after leaving a ledge when a jump still works. */
  coyote: number;
  /** Ticks a jump press is remembered before landing. */
  buffer: number;
  bodyW: number;
  bodyH: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** One-way platform: land from above, jump through from below, Down + Jump drops through. */
export interface Platform {
  x: number;
  y: number;
  w: number;
}

export interface Level {
  id: string;
  name: Name;
  /** Easy Scene street this level is laid over (towns/<scene>), optional. */
  scene?: string;
  width: number;
  height: number;
  /** Street floor (feet y). */
  groundY: number;
  solids: Rect[];
  platforms: Platform[];
  ladders: Rect[];
  spawn: [number, number];
  /** Pick-ups (coins / items) placed on the level. */
  pickups?: Array<{ id: string; x: number; y: number; item?: string; coins?: number }>;
}

export interface Move {
  /** Ticks before the hitbox is active, while active, after. */
  startup: number;
  active: number;
  recovery: number;
  /** Hitbox reach in front of the body and its height. */
  reach: number;
  height: number;
  /** Damage multiplier on ATK. */
  power: number;
  knockback: number;
  /** Ticks before this move can be used again. */
  cooldown: number;
  mp: number;
}

export interface CombatRules {
  /** Ticks of hit-stun and invulnerability after a hit. */
  stun: number;
  invuln: number;
  /** Speed multiplier: run × (speedBase + SPD / speedDiv). */
  speedBase: number;
  speedDiv: number;
  /** Enemy attack interval: max(minCooldown, aiCooldown − SPD) + rng × aiJitter. */
  aiCooldown: number;
  minCooldown: number;
  aiJitter: number;
  /** Fight ends as a draw after this many ticks. */
  maxTicks: number;
  crit: number;
  moves: { light: Move; heavy: Move };
}

export interface ActionEncounter {
  id: string;
  name: Name;
  /** Level used as the arena (flat arena of `width` when absent). */
  level?: string;
  width?: number;
  /** Easy Battle enemy ids (+ level, start x). */
  enemies: Array<{ id: string; level?: number; x?: number }>;
}

export interface ActionDoc {
  format: typeof FORMAT;
  id: string;
  name: Name;
  physics?: Partial<Physics>;
  combat?: Partial<Omit<CombatRules, "moves">> & { moves?: Partial<Record<"light" | "heavy", Partial<Move>>> };
  levels?: Level[];
  encounters?: ActionEncounter[];
}

export interface ResolvedDoc {
  id: string;
  name: Name;
  physics: Physics;
  combat: CombatRules;
  levels: Level[];
  encounters: ActionEncounter[];
}

export interface Diagnostic {
  path: string;
  message: string;
}

/** Minimal Easy Battle database shape (easybattle.json `db` or a merged workspace). */
export interface BattleStats {
  hp: number;
  mp: number;
  atk: number;
  def: number;
  spd: number;
  [k: string]: number;
}
export interface BattleDbLike {
  rules: { enemyScale: number; crit?: number };
  heroes: Array<{ id: string; name?: Name; base: Record<string, number>; growth: Record<string, number>; tree?: Array<{ id: string; stats?: Record<string, number> }> }>;
  enemies: Array<{ id: string; name?: Name; level: number; stats: Record<string, number>; xp?: number; coins?: number; art?: string }>;
}
