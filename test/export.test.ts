import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { exportAction } from "../src/lib/export.js";
import { tempWorkspace } from "./helpers.js";

describe("exports", () => {
  it("json, pixi and godot presets write their files", async () => {
    const { root, cleanup } = await tempWorkspace();
    const j = await exportAction(root, "three_towns", { preset: "json" });
    const data = JSON.parse(await readFile(path.join(j.out, "easyaction.json"), "utf8"));
    expect(data.format).toBe("easyaction/1");
    expect(data.strings["action.win"].ms).toBe("Menang!");
    expect((await exportAction(root, "three_towns", { preset: "pixi" })).files).toEqual(expect.arrayContaining(["easyaction-core.js", "easyaction-pixi.js", "index.html", "battle_db.json"]));
    const g = await exportAction(root, "three_towns", { preset: "godot" });
    expect(g.files).toEqual(expect.arrayContaining(["project.godot", "easyaction/easyaction_core.gd", "easyaction/action_player.gd", "easyaction/skirmish_view.gd", "easyaction/parity.json", "test_action.gd"]));
    await cleanup();
  });
});
