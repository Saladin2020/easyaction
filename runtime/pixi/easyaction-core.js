/* Easy Action core — generated from src/shared/core.ts by scripts/build-core.mjs. Do not edit. MIT. */
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/shared/types.ts
var FORMAT = "easyaction/1";
var SAFE_ID = /^[a-z0-9][a-z0-9_-]*$/;
var EXPORT_PRESETS = ["json", "pixi", "godot"];

// src/shared/rng.ts
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 1831565813 >>> 0;
    let t2 = a;
    t2 = Math.imul(t2 ^ t2 >>> 15, t2 | 1);
    t2 ^= t2 + Math.imul(t2 ^ t2 >>> 7, t2 | 61);
    return ((t2 ^ t2 >>> 14) >>> 0) / 4294967296;
  };
}

// src/shared/physics.ts
var DEFAULT_PHYSICS = {
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
  bodyH: 30
};
function newBody(P, x, y, speed = 1) {
  return { x, y, vx: 0, vy: 0, w: P.bodyW, h: P.bodyH, onGround: false, climbing: false, jumping: false, coyote: 0, buffer: 0, facing: 1, speed };
}
var overlaps = (b, r) => b.x + b.w / 2 > r.x && b.x - b.w / 2 < r.x + r.w && b.y > r.y && b.y - b.h < r.y + r.h;
function onLadder(b, lvl) {
  for (const l of lvl.ladders) if (b.x > l.x && b.x < l.x + l.w && b.y > l.y && b.y - b.h / 2 < l.y + l.h) return l;
  return null;
}
function approach(v, target, step) {
  return v < target ? Math.min(target, v + step) : Math.max(target, v - step);
}
function stepBody(b, inp, lvl, P) {
  const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  if (dir !== 0) b.facing = dir > 0 ? 1 : -1;
  const ladder = onLadder(b, lvl);
  if (!ladder) b.climbing = false;
  else if (!b.climbing && (inp.up || inp.down && !b.onGround)) b.climbing = true;
  b.buffer = inp.jumpPressed ? P.buffer : Math.max(0, b.buffer - 1);
  b.coyote = b.onGround ? P.coyote : Math.max(0, b.coyote - 1);
  const dropThrough = Boolean(inp.down && inp.jumpPressed && b.onGround && standingOnPlatform(b, lvl));
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
  b.x += b.vx;
  for (const s of lvl.solids)
    if (overlaps(b, s)) {
      b.x = b.vx > 0 ? s.x - b.w / 2 : s.x + s.w + b.w / 2;
      b.vx = 0;
    }
  b.x = Math.max(b.w / 2, Math.min(lvl.width - b.w / 2, b.x));
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
  if (b.vy >= 0 && !dropThrough && !(b.climbing && inp.down)) {
    for (const p of lvl.platforms)
      if (prev <= p.y && b.y >= p.y && b.x > p.x && b.x < p.x + p.w) {
        b.y = p.y;
        b.vy = 0;
        b.onGround = true;
      }
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
function standingOnPlatform(b, lvl) {
  return lvl.platforms.some((p) => b.y === p.y && b.x > p.x && b.x < p.x + p.w) && b.y < lvl.groundY;
}
function bodyAnim(b) {
  if (b.climbing) return "climb";
  if (!b.onGround) return b.vy < 0 ? "jump" : "fall";
  return Math.abs(b.vx) > 0.2 ? "run" : "idle";
}
function jumpReach(P, speed = 1) {
  const flat = { id: "_", name: { th: "", en: "" }, width: 1e5, height: 1e3, groundY: 500, solids: [], platforms: [], ladders: [], spawn: [0, 500] };
  const b = newBody(P, 100, 500, speed);
  b.vx = P.run * speed;
  b.onGround = true;
  let top = 500, t2 = 0;
  const x0 = b.x;
  stepBody(b, { right: true, jump: true, jumpPressed: true }, flat, P);
  t2++;
  while (!b.onGround && t2 < 1e3) {
    stepBody(b, { right: true, jump: true }, flat, P);
    top = Math.min(top, b.y);
    t2++;
  }
  return { height: 500 - top, distance: b.x - x0, airTicks: t2 };
}
function simulatePath(lvl, P, script, start) {
  const b = newBody(P, start?.[0] ?? lvl.spawn[0], start?.[1] ?? lvl.spawn[1]);
  return script.map((inp) => {
    stepBody(b, inp, lvl, P);
    return [b.x, b.y, bodyAnim(b)];
  });
}

// src/shared/combat.ts
var DEFAULT_MOVES = {
  light: { startup: 5, active: 4, recovery: 9, reach: 22, height: 24, power: 1, knockback: 2.5, cooldown: 0, mp: 0 },
  heavy: { startup: 12, active: 5, recovery: 16, reach: 28, height: 28, power: 1.7, knockback: 4.5, cooldown: 45, mp: 3 }
};
var DEFAULT_COMBAT = {
  stun: 14,
  invuln: 24,
  speedBase: 0.8,
  speedDiv: 50,
  aiCooldown: 60,
  minCooldown: 24,
  aiJitter: 24,
  maxTicks: 60 * 90,
  crit: 6,
  moves: DEFAULT_MOVES
};
var floor = Math.floor;
function heroStats(h, level, tree = []) {
  const out = {};
  for (const k of Object.keys(h.base)) out[k] = floor(h.base[k] + (h.growth[k] ?? 0) * (level - 1));
  for (const n of h.tree ?? []) if (tree.includes(n.id) && n.stats) for (const k of Object.keys(n.stats)) out[k] = (out[k] ?? 0) + n.stats[k];
  return out;
}
function enemyStats(db, e, level) {
  const out = {};
  const pct = 100 + db.rules.enemyScale * (level - e.level);
  for (const k of Object.keys(e.stats)) out[k] = Math.max(k === "hp" ? 1 : 0, floor(e.stats[k] * pct / 100));
  return out;
}
function fightersFromBattle(db, party, enemies, width) {
  const out = [];
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
var Skirmish = class {
  constructor(setup) {
    __publicField(this, "P");
    __publicField(this, "R");
    __publicField(this, "level");
    __publicField(this, "fighters");
    __publicField(this, "hits", []);
    __publicField(this, "tick", 0);
    __publicField(this, "result", "ongoing");
    __publicField(this, "rnd");
    __publicField(this, "listeners", []);
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
  on(fn) {
    this.listeners.push(fn);
    return this;
  }
  emit(ev, ...a) {
    for (const l of this.listeners) l(ev, ...a);
  }
  alive(side) {
    return this.fighters.filter((f) => f.hp > 0 && (!side || f.side === side));
  }
  get player() {
    return this.fighters.find((f) => f.player);
  }
  nearestFoe(f) {
    let best = null, bd = Infinity;
    for (const o of this.fighters) {
      if (o.side === f.side || o.hp <= 0) continue;
      const d = Math.abs(o.body.x - f.body.x);
      if (d < bd) bd = d, best = o;
    }
    return best;
  }
  aiInput(f) {
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
  startMove(f, m) {
    const mv = this.R.moves[m];
    if (f.move || f.stun > 0 || f.cd[m] > 0 || f.mp < mv.mp) return;
    f.mp -= mv.mp;
    f.move = m;
    f.t = 0;
    f.hitDone = [];
    f.cd[m] = mv.cooldown;
  }
  hitbox(f, mv) {
    const b = f.body;
    const x0 = b.facing > 0 ? b.x : b.x - mv.reach;
    return { x: x0, y: b.y - mv.height, w: mv.reach, h: mv.height };
  }
  resolveHits(f) {
    const mv = this.R.moves[f.move];
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
      const ev = { tick: this.tick, from: f.id, to: o.id, damage: dmg, crit, down };
      this.hits.push(ev);
      this.emit("hit", ev);
      if (down) this.emit("down", o.id);
    }
  }
  /** One tick. `input` drives the player fighter (others use the AI). */
  step(input = {}) {
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
      let inp = f.player ? input : this.aiInput(f);
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
      f.state = f.stun > 0 ? "hurt" : f.move ? "attack" : bodyAnim(f.body) === "climb" ? "idle" : bodyAnim(f.body);
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
  /** Compact state for parity tests: tick, result, then id:hp:x:y per fighter (x / y to 3 decimals). */
  digest() {
    return [this.tick, this.result, ...this.fighters.map((f) => `${f.id}:${f.hp}:${f.body.x.toFixed(3)}:${f.body.y.toFixed(3)}`)].join("|");
  }
};
function simulateSkirmish(fighters, level, seed, opts = {}) {
  const s = new Skirmish({ fighters: fighters.map((f) => ({ ...f, player: false })), level, seed, physics: opts.physics, combat: opts.combat });
  const max = opts.maxTicks ?? s.R.maxTicks;
  while (s.step() === "ongoing" && s.tick < max) ;
  return { result: s.result, ticks: s.tick, hits: s.hits.length, digest: s.digest(), rewards: s.rewards() };
}
function arena(width = 480, groundY = 200) {
  return { id: "arena", name: { th: "\u0E25\u0E32\u0E19\u0E15\u0E48\u0E2D\u0E2A\u0E39\u0E49", en: "Arena", ms: "Gelanggang" }, width, height: groundY + 40, groundY, solids: [], platforms: [], ladders: [], spawn: [40, groundY] };
}

// src/shared/doc.ts
var STRINGS = {
  "action.hp": { th: "\u0E1E\u0E25\u0E31\u0E07", en: "HP", ms: "HP" },
  "action.mp": { th: "\u0E40\u0E27\u0E17", en: "MP", ms: "MP" },
  "action.light": { th: "\u0E15\u0E35", en: "Strike", ms: "Pukul" },
  "action.heavy": { th: "\u0E17\u0E48\u0E32\u0E2B\u0E19\u0E31\u0E01", en: "Heavy", ms: "Berat" },
  "action.win": { th: "\u0E0A\u0E19\u0E30!", en: "Victory!", ms: "Menang!" },
  "action.lose": { th: "\u0E41\u0E1E\u0E49\u0E41\u0E25\u0E49\u0E27\u2026", en: "Defeated\u2026", ms: "Kalah\u2026" },
  "action.draw": { th: "\u0E2B\u0E21\u0E14\u0E40\u0E27\u0E25\u0E32", en: "Time up", ms: "Masa tamat" },
  "action.help": { th: "\u2190 \u2192 \u0E40\u0E14\u0E34\u0E19 \xB7 Z/Space \u0E01\u0E23\u0E30\u0E42\u0E14\u0E14 \xB7 \u2191\u2193 \u0E1B\u0E35\u0E19 \xB7 J \u0E15\u0E35 \xB7 K \u0E17\u0E48\u0E32\u0E2B\u0E19\u0E31\u0E01", en: "\u2190 \u2192 move \xB7 Z/Space jump \xB7 \u2191\u2193 climb \xB7 J strike \xB7 K heavy", ms: "\u2190 \u2192 gerak \xB7 Z/Space lompat \xB7 \u2191\u2193 panjat \xB7 J pukul \xB7 K berat" },
  "action.climb": { th: "\u2191 \u0E1B\u0E35\u0E19\u0E1A\u0E31\u0E19\u0E44\u0E14", en: "\u2191 climb", ms: "\u2191 panjat" },
  "action.coin": { th: "\u0E44\u0E14\u0E49\u0E40\u0E2B\u0E23\u0E35\u0E22\u0E0D", en: "Coin!", ms: "Syiling!" }
};
var t = (key, lang = "th") => STRINGS[key]?.[lang] ?? key;
function resolveDoc(doc) {
  const c = doc.combat ?? {};
  const moves = { light: { ...DEFAULT_MOVES.light, ...c.moves?.light ?? {} }, heavy: { ...DEFAULT_MOVES.heavy, ...c.moves?.heavy ?? {} } };
  return {
    id: doc.id,
    name: doc.name,
    physics: { ...DEFAULT_PHYSICS, ...doc.physics ?? {} },
    combat: { ...DEFAULT_COMBAT, ...c, moves },
    levels: (doc.levels ?? []).map((l) => ({ ...l, solids: l.solids ?? [], platforms: l.platforms ?? [], ladders: l.ladders ?? [], pickups: l.pickups ?? [] })),
    encounters: doc.encounters ?? []
  };
}
var num = (v) => typeof v === "number" && Number.isFinite(v);
function validateDoc(doc, battle) {
  const errors = [];
  const warnings = [];
  const err = (path, message) => errors.push({ path, message });
  const warn = (path, message) => warnings.push({ path, message });
  if (!doc || typeof doc !== "object") return { errors: [{ path: "(doc)", message: "not an object" }], warnings };
  if (doc.format !== FORMAT) err("format", `must be "${FORMAT}"`);
  if (!SAFE_ID.test(doc.id ?? "")) err("id", "use a-z, 0-9, _ or -");
  if (!doc.name?.th || !doc.name?.en) err("name", "needs th and en");
  for (const [k, v] of Object.entries(doc.physics ?? {})) if (!num(v) || v < 0) err(`physics.${k}`, "must be a number >= 0");
  if (errors.length) return { errors, warnings };
  const r = resolveDoc(doc);
  const reach = jumpReach(r.physics);
  const ids = /* @__PURE__ */ new Set();
  r.levels.forEach((l, i) => {
    const p = `levels[${i}]`;
    if (!SAFE_ID.test(l.id ?? "")) err(`${p}.id`, "use a-z, 0-9, _ or -");
    if (ids.has(l.id)) err(`${p}.id`, `duplicate level ${l.id}`);
    ids.add(l.id);
    if (!l.name?.th || !l.name?.en) err(`${p}.name`, "needs th and en");
    if (!(l.width > 0 && l.height > 0 && l.groundY > 0 && l.groundY <= l.height)) err(p, "width, height > 0 and 0 < groundY <= height");
    for (const [k, list] of [["solids", l.solids], ["ladders", l.ladders]])
      list.forEach((s, j) => {
        if (![s.x, s.y, s.w, s.h].every(num) || s.w <= 0 || s.h <= 0) err(`${p}.${k}[${j}]`, "needs x, y, w > 0, h > 0");
        else if (s.x < 0 || s.x + s.w > l.width) warn(`${p}.${k}[${j}]`, "outside the level width");
      });
    l.platforms.forEach((s, j) => {
      if (![s.x, s.y, s.w].every(num) || s.w <= 0) err(`${p}.platforms[${j}]`, "needs x, y, w > 0");
      const fromBelow = [l.groundY, ...l.platforms.filter((q) => q !== s && q.y > s.y).map((q) => q.y)].some((y) => y - s.y <= reach.height);
      const byLadder = l.ladders.some((d) => d.y <= s.y + 1 && d.y + d.h >= s.y && d.x + d.w > s.x - 8 && d.x < s.x + s.w + 8);
      if (!fromBelow && !byLadder) warn(`${p}.platforms[${j}]`, `${Math.round(l.groundY - s.y)} px above the floor: higher than a jump (${Math.round(reach.height)} px) and no ladder`);
    });
    if (!Array.isArray(l.spawn) || !num(l.spawn[0]) || !num(l.spawn[1])) err(`${p}.spawn`, "needs [x, y]");
  });
  r.encounters.forEach((e, i) => {
    const p = `encounters[${i}]`;
    if (!SAFE_ID.test(e.id ?? "")) err(`${p}.id`, "use a-z, 0-9, _ or -");
    if (!e.name?.th || !e.name?.en) err(`${p}.name`, "needs th and en");
    if (e.level && !ids.has(e.level)) err(`${p}.level`, `unknown level ${e.level}`);
    if (!e.enemies?.length) err(`${p}.enemies`, "needs at least one enemy");
    if (battle) e.enemies?.forEach((x, j) => !battle.enemies.some((d) => d.id === x.id) && err(`${p}.enemies[${j}]`, `unknown Easy Battle enemy ${x.id}`));
  });
  return { errors, warnings };
}
function levelFromScene(scene, id = scene.id) {
  const solid = scene.collision?.solid ?? [];
  const floorRows = solid.filter((s) => s.w >= scene.size.width - 1);
  const groundY = floorRows.length ? Math.min(...floorRows.map((s) => s.y)) : scene.size.height;
  return {
    id,
    name: { th: id, en: id },
    scene: scene.id,
    width: scene.size.width,
    height: scene.size.height,
    groundY,
    solids: solid.filter((s) => s.w < scene.size.width - 1 && s.y < groundY),
    platforms: (scene.collision?.oneWay ?? []).map((o) => ({ x: o.x, y: o.y, w: o.w })),
    ladders: [],
    spawn: [24, groundY]
  };
}
function docSummary(doc) {
  const r = resolveDoc(doc);
  return { id: r.id, name: r.name, levels: r.levels.map((l) => ({ id: l.id, name: l.name, scene: l.scene ?? null, width: l.width, platforms: l.platforms.length, ladders: l.ladders.length, pickups: l.pickups?.length ?? 0 })), encounters: r.encounters.map((e) => ({ id: e.id, name: e.name, enemies: e.enemies.map((x) => x.id) })), jump: jumpReach(r.physics) };
}
export {
  DEFAULT_COMBAT,
  DEFAULT_MOVES,
  DEFAULT_PHYSICS,
  EXPORT_PRESETS,
  FORMAT,
  SAFE_ID,
  STRINGS,
  Skirmish,
  arena,
  bodyAnim,
  docSummary,
  enemyStats,
  fightersFromBattle,
  heroStats,
  jumpReach,
  levelFromScene,
  mulberry32,
  newBody,
  onLadder,
  resolveDoc,
  simulatePath,
  simulateSkirmish,
  stepBody,
  t,
  validateDoc
};
