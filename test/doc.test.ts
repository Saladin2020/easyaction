import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { STRINGS, levelFromScene, resolveDoc, validateDoc } from "../src/shared/doc.js";
import type { ActionDoc } from "../src/shared/types.js";

const sample = async () => JSON.parse(await readFile(new URL("../samples/actions/three_towns.easyaction.json", import.meta.url), "utf8")) as ActionDoc;

describe("documents", () => {
  it("every string has th / en / ms", () => {
    for (const [k, v] of Object.entries(STRINGS)) for (const l of ["th", "en", "ms"] as const) expect(v[l], `${k}.${l}`).toBeTruthy();
  });
  it("sample is valid and resolves defaults", async () => {
    const doc = await sample();
    expect(validateDoc(doc).errors).toEqual([]);
    expect(resolveDoc(doc).physics.gravity).toBeGreaterThan(0);
  });
  it("flags unreachable platforms, bad spawns and unknown enemies", async () => {
    const doc = await sample();
    doc.levels![0]!.platforms.push({ x: 700, y: 40, w: 30 });
    doc.encounters![0]!.enemies.push({ id: "dragon_king" });
    const r = validateDoc(doc, { heroes: [], enemies: [{ id: "monkey_thief" }, { id: "paddy_crab" }, { id: "field_rat" }, { id: "apple_snail" }] } as never);
    expect(r.warnings.some((w) => /higher than a jump/.test(w.message))).toBe(true);
    expect(r.errors.some((e) => /dragon_king/.test(e.message))).toBe(true);
    const bad = { ...doc, format: "nope" } as unknown as ActionDoc;
    expect(validateDoc(bad).errors.length).toBeGreaterThan(0);
  });
  it("builds a level base from an Easy Scene pixi.json", () => {
    const l = levelFromScene({ id: "town_x", size: { width: 400, height: 272 }, collision: { solid: [{ x: 10, y: 214, w: 20, h: 10 }, { x: 0, y: 224, w: 400, h: 48 }], oneWay: [{ x: 50, y: 180, w: 60, h: 4 }] } } as never);
    expect(l.groundY).toBe(224);
    expect(l.platforms.length).toBe(1);
    expect(l.solids.length).toBeGreaterThanOrEqual(1);
  });
});
