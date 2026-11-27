import { describe, expect, it } from "vitest";
import { arena } from "../src/shared/combat.js";
import { DEFAULT_PHYSICS as P, bodyAnim, jumpReach, newBody, simulatePath, stepBody, type Input } from "../src/shared/physics.js";
import type { Level } from "../src/shared/types.js";

const lvl: Level = { ...arena(480, 200), platforms: [{ x: 100, y: 160, w: 60 }], ladders: [{ x: 300, y: 140, w: 20, h: 60 }], solids: [{ x: 400, y: 0, w: 80, h: 200 }] };
const hold = (inp: Input, n: number) => Array.from({ length: n }, (_, i) => ({ ...inp, jumpPressed: !!inp.jump && i === 0 }));

describe("platformer physics", () => {
  it("jump reach: ~52px high, longer when running", () => {
    const r = jumpReach(P, 1);
    expect(r.height).toBeGreaterThan(48);
    expect(r.height).toBeLessThan(56);
    expect(r.distance).toBeGreaterThan(jumpReach(P, 0).distance);
  });
  it("runs, lands and is deterministic", () => {
    const a = simulatePath(lvl, P, [...hold({ right: true }, 30), ...hold({ right: true, jump: true }, 40)], [40, 200]);
    const b = simulatePath(lvl, P, [...hold({ right: true }, 30), ...hold({ right: true, jump: true }, 40)], [40, 200]);
    expect(a).toEqual(b);
    expect(a.some(([, , anim]) => anim === "jump")).toBe(true);
    expect(a.at(-1)![0]).toBeGreaterThan(80);
  });
  it("lands on a one-way platform from below and drops through with ↓+jump", () => {
    const b = newBody(P, 110, 200);
    b.onGround = true;
    for (const inp of hold({ jump: true }, 60)) stepBody(b, inp, lvl, P);
    expect(b.y).toBe(160);
    expect(b.onGround).toBe(true);
    stepBody(b, { down: true, jump: true, jumpPressed: true }, lvl, P);
    for (let i = 0; i < 40; i++) stepBody(b, {}, lvl, P);
    expect(b.y).toBe(200);
  });
  it("climbs a ladder and stops at walls", () => {
    const b = newBody(P, 310, 200);
    b.onGround = true;
    for (let i = 0; i < 30; i++) stepBody(b, { up: true }, lvl, P);
    expect(b.y).toBeLessThan(200);
    expect(bodyAnim(b)).toBe("climb");
    const w = newBody(P, 380, 200);
    for (let i = 0; i < 60; i++) stepBody(w, { right: true }, lvl, P);
    expect(w.x + P.bodyW / 2).toBeLessThanOrEqual(400);
  });
});
