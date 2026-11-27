# Easy Action

Side-view **platformer physics** (run, variable-height jump, coyote time, jump buffer, ladders, one-way platforms, drop-through) for Easy Scene streets, plus **real-time action combat** that reuses Easy Battle heroes, enemies, growth and skill trees. It is an alternative to turn-based Easy Battle. Exports to **Godot 4.3+** and **PixiJS v8**. Strings are in ไทย / English / Melayu.

The simulation is deterministic: the TS core and the GDScript port print identical paths and fight digests (`test/godot.test.ts`).

```bash
npm install
npx tsx src/cli.ts init                       # actions/three_towns.easyaction.json
npx tsx src/cli.ts check                      # shape, unreachable platforms, unknown Easy Battle enemies
npx tsx src/cli.ts jump three_towns           # jump height / distance (px) for placing platforms
npx tsx src/cli.ts sim three_towns monkey_raid --party ton:3,adam:3 --lang th
npx tsx src/cli.ts render three_towns ban_na_di_rooftops --background town_ban_na_di_preview.png
npx tsx src/cli.ts from-scene town_ban_na_di.pixi.json      # level base from an Easy Scene export
npx tsx src/cli.ts export three_towns --preset pixi|godot|json
npx tsx src/cli.ts serve                      # web tool http://127.0.0.1:8988 (live level playground + fight sims)
npm run mcp            # MCP stdio · npm run mcp:http → http://127.0.0.1:8989/mcp
```

## Document (`actions/<id>.easyaction.json`, format `easyaction/1`)

| field | meaning |
|---|---|
| `physics` | gravity 0.35, jump 6.2, jumpCut 0.45, maxFall 7, run 1.6, accel 0.25, friction 0.3, airControl 0.6, climb 1.2, coyote 6, buffer 6, bodyW 14, bodyH 30 (px and ticks at 60 Hz) |
| `combat` | stun, invuln, AI cadence, `moves.light/heavy` {startup, active, recovery, reach, height, power, knockback, cooldown, mp} |
| `levels[]` | `width`, `height`, `groundY` (feet y), `solids`, one-way `platforms` {x,y,w}, `ladders`, `spawn`, `pickups` (coins / items). `scene` names the Easy Scene street it sits on |
| `encounters[]` | Easy Battle `enemies` [{id, level}] on a level or a flat arena of `width` |

Damage uses the Easy Battle formula (atk vs def, ±10 % variance, crit). Hero stats come from `base + growth × (level − 1)` plus skill-tree nodes. Enemies use `enemyScale` per level. Easy Battle data is found via `battle` in `easyaction.config.json`, `EASYBATTLE_HOME`, `../easybattle`, or the bundled snapshot `samples/battle/battle_db.json`.

## Runtimes

- **PixiJS** (`easyaction-pixi.js` + `easyaction-core.js`):
  - `const ea = await loadAction(PIXI, "easyaction.json")`.
  - `ea.platformer(container, {level, sheet})` returns `key()`, `update(dt)`, `tick(input)`, `on("pickup")`, `body` and `anim`.
  - `ea.skirmish(app, {encounter, battle, party, heroSheets, enemyArt, background, onEnd})` shows HP bars, damage pops and a result banner.
  - Easy Sprite side sheets are 48 px, 30×3: idle 0, run 4–7, jump 8, fall 9, attack 18–19, hurt 20–21, down 22–23. Ladders use the front row.
- **Godot**: `EasyActionCore` (physics + combat port), `EasyActionPlayer` (CharacterBody-free fixed-tick platformer node) and `EasySkirmishView` (signal `finished(result, rewards)`). The export includes `test_action.gd` (parity) and a playable `main.tscn`.

Keys: ← → / A D move · Space / Z jump (hold for higher) · ↑ ↓ / W S climb · ↓ + jump drops through a platform · J strike · K heavy.

## Content rules

Use original pixel art only. Keep casts multicultural Thai + Muslim. Do not use sacred figures or places of worship as arenas or enemies, and do not use Quran or Arabic calligraphy as decoration. Enemies are pests and rascals (monkeys, crabs, rats), not people's faiths.

## Tests

`npm test` covers physics, combat, documents, exports, MCP and HTTP. Set `GODOT=/path/to/godot` to add the Godot parity test. `npm run smoke` runs the CLI and MCP (stdio + HTTP) smoke tests. `python3 scripts/check-pixi.py <pixi-export>` is a headless Chrome check of the Pixi export.
