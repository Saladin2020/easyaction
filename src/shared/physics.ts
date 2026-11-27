/**
 * Easy Action platformer physics — deterministic fixed-step (60 ticks / s), pure functions, same rules as the
 * GDScript port (runtime/godot/easyaction_core.gd). Only + − × ÷, floor, min, max, abs are used so both runtimes
 * produce identical doubles.
 *
 *   run with acceleration / friction (less in the air), variable jump height (release to cut), coyote time,
 *   jump buffer, max fall speed, solid blocks, one-way platforms (Down + Jump drops through), ladders (Up / Down
 *   to grab, Jump to leave), street floor at groundY, level bounds.
 */
import type { Level, Physics, Rect } from "./types.js";

export const DEFAULT_PHYSICS: Physics = {
  gravity: 0.35,
  jump: 6.2,
  jumpCut: 0.45,
  maxFall: 7,
  run: 1.6,
  accel: 0.25,
  friction: 0.3,
  airControl: 0.6,
  climb: 1.2,
  coyote: 6,
  buffer: 6,
  bodyW: 14,
  bodyH: 30,
};

export interface Input {
  left?: boolean;
  right?: boolean;
  up?: boolean;
  down?: boolean;
  /** Jump held this tick. */
  jump?: boolean;
  /** Jump pressed this tick (edge). */
  jumpPressed?: boolean;
}

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  onGround: boolean;
  climbing: boolean;
  jumping: boolean;
  coyote: number;
  buffer: number;
  facing: 1 | -1;
  /** Run speed multiplier (combat: from SPD). */
  speed: number;
}

export type BodyAnim = "idle" | "run" | "jump" | "fall" | "climb";

export function newBody(P: Physics, x: number, y: number, speed = 1): Body {
  return { x, y, vx: 0, vy: 0, w: P.bodyW, h: P.bodyH, onGround: false, climbing: false, jumping: false, coyote: 0, buffer: 0, facing: 1, speed };
}

const overlaps = (b: Body, r: Rect) => b.x + b.w / 2 > r.x && b.x - b.w / 2 < r.x + r.w && b.y > r.y && b.y - b.h < r.y + r.h;

export function onLadder(b: Body, lvl: Level): Rect | null {
  for (const l of lvl.ladders) if (b.x > l.x && b.x < l.x + l.w && b.y > l.y && b.y - b.h / 2 < l.y + l.h) return l;
  return null;
}

function approach(v: number, target: number, step: number): number {
  return v < target ? Math.min(target, v + step) : Math.max(target, v - step);
}

/** Advance one tick. Mutates and returns the body. */
export function stepBody(b: Body, inp: Input, lvl: Level, P: Physics): Body {
  const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  if (dir !== 0) b.facing = dir > 0 ? 1 : -1;
  // ladders
  const ladder = onLadder(b, lvl);
  if (!ladder) b.climbing = false;
  else if (!b.climbing && (inp.up || (inp.down && !b.onGround))) b.climbing = true;
  // jump buffer + coyote
  b.buffer = inp.jumpPressed ? P.buffer : Math.max(0, b.buffer - 1);
  b.coyote = b.onGround ? P.coyote : Math.max(0, b.coyote - 1);
  const dropThrough = Boolean(inp.down && inp.jumpPressed && b.onGround && standingOnPlatform(b, lvl));
  if (dropThrough) {
    b.buffer = 0;
    b.coyote = 0;
  }
  if (b.climbing) {
    b.vx = dir * P.climb * 0.5;
    b.vy = ((inp.down ? 1 : 0) - (inp.up ? 1 : 0)) * P.climb;
    if (b.buffer > 0) {
      b.climbing = false;
      b.vy = -P.jump * 0.8;
      b.buffer = 0;
      b.jumping = true;
    }
  } else {
    const top = P.run * b.speed;
    const a = b.onGround ? P.accel : P.accel * P.airControl;
    const f = b.onGround ? P.friction : P.friction * P.airControl;
    b.vx = dir !== 0 ? approach(b.vx, dir * top, a) : approach(b.vx, 0, f);
    if (b.buffer > 0 && b.coyote > 0 && !dropThrough) {
      b.vy = -P.jump;
      b.buffer = 0;
      b.coyote = 0;
      b.jumping = true;
    }
    if (b.jumping && !inp.jump && b.vy < 0) {
      b.vy = b.vy * P.jumpCut;
      b.jumping = false;
    }
    b.vy = Math.min(b.vy + P.gravity, P.maxFall);
  }
  if (b.vy >= 0) b.jumping = false;
  // X
  b.x += b.vx;
  for (const s of lvl.solids)
    if (overlaps(b, s)) {
      b.x = b.vx > 0 ? s.x - b.w / 2 : s.x + s.w + b.w / 2;
      b.vx = 0;
    }
  b.x = Math.max(b.w / 2, Math.min(lvl.width - b.w / 2, b.x));
  // Y
  const prev = b.y;
  b.y += b.vy;
  b.onGround = false;
  for (const s of lvl.solids)
    if (overlaps(b, s)) {
      if (b.vy > 0) {
        b.y = s.y;
        b.onGround = true;
      } else b.y = s.y + s.h + b.h;
      b.vy = 0;
    }
  if (b.vy >= 0 && !dropThrough && !(b.climbing && inp.down))
    for (const p of lvl.platforms)
      if (prev <= p.y && b.y >= p.y && b.x > p.x && b.x < p.x + p.w) {
        b.y = p.y;
        b.vy = 0;
        b.onGround = true;
      }
  if (b.y >= lvl.groundY) {
    b.y = lvl.groundY;
    b.vy = 0;
    b.onGround = true;
  }
  if (b.y - b.h < 0) {
    b.y = b.h;
    if (b.vy < 0) b.vy = 0;
  }
  if (b.onGround && b.climbing && !inp.up) b.climbing = false;
  return b;
}

function standingOnPlatform(b: Body, lvl: Level): boolean {
  return lvl.platforms.some((p) => b.y === p.y && b.x > p.x && b.x < p.x + p.w) && b.y < lvl.groundY;
}

export function bodyAnim(b: Body): BodyAnim {
  if (b.climbing) return "climb";
  if (!b.onGround) return b.vy < 0 ? "jump" : "fall";
  return Math.abs(b.vx) > 0.2 ? "run" : "idle";
}

/** Highest jump (px) and longest flat running jump (px) for these physics — level design helpers. */
export function jumpReach(P: Physics, speed = 1): { height: number; distance: number; airTicks: number } {
  const flat: Level = { id: "_", name: { th: "", en: "" }, width: 100000, height: 1000, groundY: 500, solids: [], platforms: [], ladders: [], spawn: [0, 500] };
  const b = newBody(P, 100, 500, speed);
  b.vx = P.run * speed;
  b.onGround = true;
  let top = 500, t = 0;
  const x0 = b.x;
  stepBody(b, { right: true, jump: true, jumpPressed: true }, flat, P);
  t++;
  while (!b.onGround && t < 1000) {
    stepBody(b, { right: true, jump: true }, flat, P);
    top = Math.min(top, b.y);
    t++;
  }
  return { height: 500 - top, distance: b.x - x0, airTicks: t };
}

/** Run a scripted input sequence; returns per-tick positions (for tests, previews and Godot parity). */
export function simulatePath(lvl: Level, P: Physics, script: Input[], start?: [number, number]): Array<[number, number, BodyAnim]> {
  const b = newBody(P, start?.[0] ?? lvl.spawn[0], start?.[1] ?? lvl.spawn[1]);
  return script.map((inp) => {
    stepBody(b, inp, lvl, P);
    return [b.x, b.y, bodyAnim(b)];
  });
}
