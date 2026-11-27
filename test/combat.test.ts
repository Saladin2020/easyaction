import { describe, expect, it } from "vitest";
import { Skirmish, arena, fightersFromBattle, heroStats, simulateSkirmish } from "../src/shared/combat.js";
import { loadBattleDb, loadDoc } from "../src/lib/workspace.js";
import { tempWorkspace } from "./helpers.js";

describe("real-time combat on Easy Battle stats", async () => {
  const { root, cleanup } = await tempWorkspace();
  const db = await loadBattleDb(root);
  const doc = await loadDoc(root, "three_towns");
  const enc = doc.encounters.find((e) => e.id === "monkey_raid")!;
  const party = [{ id: "ton", level: 3 }, { id: "adam", level: 3 }];

  it("uses Easy Battle growth (level 5 > level 1)", () => {
    const ton = db.heroes.find((h) => h.id === "ton")!;
    expect(heroStats(ton, 5).hp).toBeGreaterThan(heroStats(ton, 1).hp);
  });
  it("same seed → same digest; a level-3 pair beats the monkey raid", () => {
    const f = fightersFromBattle(db, party, enc.enemies, 480);
    const a = simulateSkirmish(f, arena(480), 7, doc);
    expect(simulateSkirmish(f, arena(480), 7, doc).digest).toBe(a.digest);
    const wins = [1, 2, 3, 4, 5].filter((s) => simulateSkirmish(f, arena(480), s, doc).result === "win").length;
    expect(wins).toBeGreaterThanOrEqual(4);
    expect(a.rewards.xp).toBeGreaterThan(0);
  });
  it("player-driven fighter takes input and emits hit / end events", () => {
    const f = fightersFromBattle(db, [{ id: "ton", level: 5 }], [{ id: "field_rat", level: 1 }], 480);
    const s = new Skirmish({ fighters: f, level: arena(480), seed: 1 });
    const events: string[] = [];
    s.on((ev) => events.push(ev));
    for (let i = 0; i < 3000 && s.result === "ongoing"; i++) {
      const p = s.player!.body;
      const foe = s.fighters.find((x) => x.side === "enemy" && x.hp > 0)?.body;
      const near = foe ? Math.abs(foe.x - p.x) < 24 : false;
      s.step({ right: foe ? foe.x > p.x + 18 : false, left: foe ? foe.x < p.x - 18 : false, light: near && i % 20 === 0 });
    }
    expect(s.result).toBe("win");
    expect(events).toContain("hit");
    expect(events.at(-1)).toBe("end");
  });
  it("cleanup", () => cleanup());
});
