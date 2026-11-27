/**
 * Optional Godot parity check: GODOT=/path/to/godot npx vitest run test/godot.test.ts
 * The GDScript port must print the same platformer paths (P|) and skirmish digests (S|) as the TS core.
 */
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { exportAction } from "../src/lib/export.js";
import { loadBattleDb, loadDoc } from "../src/lib/workspace.js";
import { parityLines } from "../src/shared/parity.js";
import { tempWorkspace } from "./helpers.js";

const GODOT = process.env.GODOT;
describe.skipIf(!GODOT)("Godot export", () => {
  it("GDScript physics + combat match the TS core", async () => {
    const { root, cleanup } = await tempWorkspace();
    const { out } = await exportAction(root, "three_towns", { preset: "godot" });
    for (let i = 0; i < 2; i++) spawnSync(GODOT!, ["--headless", "--editor", "--quit", "--path", out], { encoding: "utf8", timeout: 180_000 });
    const run = spawnSync(GODOT!, ["--headless", "--path", out, "--script", "res://test_action.gd"], { encoding: "utf8", timeout: 180_000 });
    expect(run.stderr + run.stdout).not.toMatch(/SCRIPT ERROR|Parse Error/);
    expect(run.stdout).toMatch(/^OK$/m);
    const gd = run.stdout.split("\n").filter((l) => /^[PS]\|/.test(l));
    expect(gd).toEqual(parityLines(await loadDoc(root, "three_towns"), await loadBattleDb(root)));
    const main = spawnSync(GODOT!, ["--headless", "--path", out, "--quit-after", "120"], { encoding: "utf8", timeout: 120_000 });
    expect(main.stderr + main.stdout).not.toMatch(/SCRIPT ERROR|Parse Error/);
    await cleanup();
  }, 600_000);
});
