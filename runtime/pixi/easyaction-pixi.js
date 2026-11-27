// Easy Action — PixiJS v8 runtime: side-view platforming on Easy Scene streets + real-time skirmishes. MIT.
// The rules live in easyaction-core.js (generated from src/shared, the same engine as the CLI and the Godot port).
//
//   const ea = await loadAction(PIXI, "easyaction/easyaction.json");
//   const pl = await ea.platformer(parent, { level: "ban_na_di_rooftops", sheet: "characters/side_player.png" });
//   pl.update(dt)  ·  pl.key(e.key, down)  ·  pl.body / pl.anim / pl.collected / on("pickup", fn)
//   const sk = await ea.skirmish(app, { encounter: "monkey_raid", battle: eb.db, party, heroSheets, enemyArt, background, seed, onEnd })
//   sk.update(dt) · sk.key(e.key, down) · sk.sk (core Skirmish: fighters, hits, result) · sk.destroy()
// Keys: ← → / A D move · Space / Z jump · ↑ ↓ climb (and Down + Jump drops through a platform) · J strike · K heavy.
import * as core from "./easyaction-core.js";

export { core };
const TICK = 1 / 60;
// Easy Sprite side-view sheet columns
const F = { idle: [0], walk: [1, 2, 3, 2], run: [4, 5, 6, 7], jump: [8], fall: [9], attack: [18, 19], hurt: [20, 21], down: [22, 23], cheer: [16, 17] };
const ROWS = { right: 0, left: 1, front: 2 };

export async function loadAction(PIXI, url = "easyaction.json") {
  const data = await (await fetch(url)).json();
  const doc = data.doc ?? core.resolveDoc(data);
  const base = new URL(url, location.href);
  const tex = async (src) => (typeof src === "string" ? PIXI.Assets.load(new URL(src, base).href) : src);
  const t = (k, lang = "th") => core.t(k, lang);

  function sheetFrames(texture, fs = 48) {
    const cols = Math.floor(texture.width / fs), rows = Math.floor(texture.height / fs);
    const at = (c, r) => new PIXI.Texture({ source: texture.source, frame: new PIXI.Rectangle(c * fs, r * fs, fs, fs) });
    const out = {};
    for (const [dir, r] of Object.entries(ROWS)) {
      if (r >= rows) continue;
      out[dir] = {};
      for (const [k, list] of Object.entries(F)) out[dir][k] = list.filter((c) => c < cols).map((c) => at(c, r));
    }
    out.climb = (out.front ?? out.right).walk;
    return out;
  }
  function fallbackFigure(color = 0x2f7fd0) {
    const g = new PIXI.Graphics().roundRect(-7, -30, 14, 30, 4).fill(color).circle(0, -36, 7).fill(0xf0c8a0);
    return g;
  }
  function makeKeys() {
    const k = { left: false, right: false, up: false, down: false, jump: false, jumpPressed: false, light: false, heavy: false };
    k.key = (key, down) => {
      const n = key.length === 1 ? key.toLowerCase() : key;
      if (n === "ArrowLeft" || n === "a") k.left = down;
      else if (n === "ArrowRight" || n === "d") k.right = down;
      else if (n === "ArrowUp" || n === "w") k.up = down;
      else if (n === "ArrowDown" || n === "s") k.down = down;
      else if (n === " " || n === "z") { if (down && !k.jump) k.jumpPressed = true; k.jump = down; }
      else if (n === "j") { if (down) k.light = true; }
      else if (n === "k") { if (down) k.heavy = true; }
      else return false;
      return true;
    };
    k.take = () => {
      const s = { left: k.left, right: k.right, up: k.up, down: k.down, jump: k.jump, jumpPressed: k.jumpPressed, light: k.light, heavy: k.heavy };
      k.jumpPressed = k.light = k.heavy = false;
      return s;
    };
    return k;
  }
  function animSprite(frames, groundRow = 47, fs = 48) {
    const s = new PIXI.AnimatedSprite(frames.right.idle);
    s.anchor.set(0.5, groundRow / fs);
    s.animationSpeed = 0.15;
    s.play();
    let cur = "";
    s.show = (dir, anim) => {
      const key = `${dir}:${anim}`;
      if (key === cur) return;
      cur = key;
      const list = anim === "climb" ? frames.climb : (frames[dir] ?? frames.right)[anim] ?? frames.right.idle;
      s.textures = list;
      s.loop = anim !== "down";
      s.gotoAndPlay(0);
    };
    return s;
  }

  /** Platformer controller on a level (usually laid over its Easy Scene street; parent = the street container). */
  async function platformer(parent, o = {}) {
    const level = typeof o.level === "string" ? doc.levels.find((l) => l.id === o.level) : o.level ?? doc.levels[0];
    if (!level) throw new Error(`easyaction: unknown level ${o.level}`);
    const P = doc.physics;
    const body = core.newBody(P, o.x ?? level.spawn[0], o.y ?? level.spawn[1]);
    const view = new PIXI.Container();
    view.label = "easyaction-platformer";
    const debug = new PIXI.Graphics();
    if (o.debug) {
      for (const s of level.solids) debug.rect(s.x, s.y, s.w, s.h).stroke({ color: 0xff5050, width: 1 });
      for (const p of level.platforms) debug.rect(p.x, p.y, p.w, 2).fill(0xffc040);
      for (const l of level.ladders) debug.rect(l.x, l.y, l.w, l.h).stroke({ color: 0x60e0ff, width: 1 });
    }
    // ladders + platform edges drawn so players can see them (original simple pixel art)
    const deco = new PIXI.Graphics();
    for (const l of level.ladders) {
      deco.rect(l.x + 2, l.y, 2, l.h).rect(l.x + l.w - 4, l.y, 2, l.h).fill(0x7a4a22);
      for (let y = l.y + 4; y < l.y + l.h; y += 6) deco.rect(l.x + 2, y, l.w - 4, 2).fill(0xa8703a);
    }
    if (o.drawPlatforms !== false) for (const p of level.platforms) deco.rect(p.x, p.y - 1, p.w, 2).fill({ color: 0xf4d08a, alpha: 0.55 });
    const coins = new PIXI.Container();
    const pickups = (level.pickups ?? []).map((p) => {
      const g = new PIXI.Graphics().circle(0, 0, 4).fill(0xf6c445).stroke({ color: 0x8a5a10, width: 1 }).rect(-1, -2, 2, 4).fill(0xfff3b0);
      g.position.set(p.x, p.y);
      coins.addChild(g);
      return { ...p, g, taken: false };
    });
    const sheet = o.sheet ? sheetFrames(await tex(o.sheet), o.frameSize ?? 48) : null;
    const sprite = sheet ? animSprite(sheet, o.groundRow ?? 47, o.frameSize ?? 48) : fallbackFigure();
    view.addChild(deco, coins, sprite, debug);
    parent.addChild(view);
    const keys = makeKeys();
    const handlers = {};
    const emit = (ev, ...a) => (handlers[ev] ?? []).forEach((f) => f(...a));
    let acc = 0, ticks = 0, bob = 0;
    const ctl = {
      level, body, view, sprite, keys, pickups,
      get anim() { return core.bodyAnim(body); },
      get collected() { return pickups.filter((p) => p.taken).map((p) => p.id); },
      get ticks() { return ticks; },
      on: (ev, fn) => ((handlers[ev] ??= []).push(fn), ctl),
      key: (k, down) => keys.key(k, down),
      /** Drive one fixed tick with an explicit input (tests / scripted demos). */
      tick(inp) {
        core.stepBody(body, inp, level, P);
        ticks++;
        for (const p of pickups)
          if (!p.taken && Math.abs(p.x - body.x) < 10 && p.y > body.y - body.h - 4 && p.y < body.y + 2) {
            p.taken = true;
            p.g.visible = false;
            emit("pickup", p);
          }
        const a = core.bodyAnim(body);
        if (sprite.show) sprite.show(body.facing > 0 ? "right" : "left", a === "idle" ? "idle" : a);
        sprite.position.set(Math.round(body.x), Math.round(body.y));
      },
      update(dt) {
        acc = Math.min(acc + dt, 0.25);
        while (acc >= TICK) {
          acc -= TICK;
          ctl.tick(keys.take());
        }
        bob += dt;
        coins.children.forEach((c, i) => (c.scale.x = Math.abs(Math.cos(bob * 3 + i))));
      },
      place(x, y) { body.x = x; body.y = y; body.vx = body.vy = 0; ctl.tick({}); },
      destroy() { view.destroy({ children: true }); },
    };
    ctl.tick({});
    return ctl;
  }

  /** Real-time fight. `battle` = Easy Battle db (eb.db), `party` = [{id, level, tree?}], heroSheets = {heroId: side sheet}, enemyArt(art) → url of the Easy Battle enemy sheet. */
  async function skirmish(app, o) {
    const enc = typeof o.encounter === "string" ? doc.encounters.find((e) => e.id === o.encounter) : o.encounter;
    if (!enc) throw new Error(`easyaction: unknown encounter ${o.encounter}`);
    const W = o.width ?? app.screen.width, H = o.height ?? app.screen.height;
    const level = enc.level ? doc.levels.find((l) => l.id === enc.level) : core.arena(enc.width ?? W, o.groundY ?? H - 40);
    const fighters = core.fightersFromBattle(o.battle, o.party, enc.enemies, level.width);
    const sk = new core.Skirmish({ fighters, level, seed: o.seed ?? 1, physics: doc.physics, combat: doc.combat });
    const lang = o.lang ?? "th";
    const view = new PIXI.Container();
    view.label = "easyaction-skirmish";
    if (o.background) {
      const bg = new PIXI.Sprite(await tex(o.background));
      bg.position.set(-(o.backgroundX ?? 0), level.groundY - (o.backgroundGround ?? level.groundY));
      view.addChild(bg);
    } else view.addChild(new PIXI.Graphics().rect(0, 0, W, H).fill(0x87b7d9).rect(0, level.groundY, W, H - level.groundY).fill(0x6b4a2a));
    view.addChild(new PIXI.Graphics().rect(0, level.groundY, level.width, 3).fill({ color: 0x2a1a0e, alpha: 0.35 }));
    const actors = new PIXI.Container();
    const hud = new PIXI.Container();
    view.addChild(actors, hud);
    const sprites = {};
    for (const f of sk.fighters) {
      let s;
      if (f.side === "hero" && o.heroSheets?.[f.id]) s = animSprite(sheetFrames(await tex(o.heroSheets[f.id])), o.groundRow ?? 47);
      else if (f.side === "enemy" && o.enemyArt && f.art) {
        const tx = await tex(o.enemyArt(f.art));
        const n = Math.max(1, Math.floor(tx.width / tx.height));
        const frames = Array.from({ length: n }, (_, i) => new PIXI.Texture({ source: tx.source, frame: new PIXI.Rectangle(i * tx.height, 0, tx.height, tx.height) }));
        s = new PIXI.AnimatedSprite(frames);
        s.anchor.set(0.5, 0.96);
        s.animationSpeed = 0.1;
        s.play();
        s.enemy = true;
      } else s = fallbackFigure(f.side === "hero" ? 0x2f7fd0 : 0xc04030);
      const bar = new PIXI.Graphics();
      const box = new PIXI.Container();
      box.addChild(s, bar);
      actors.addChild(box);
      sprites[f.id] = { box, s, bar };
    }
    const fxl = new PIXI.Container();
    view.addChild(fxl);
    const label = (txt, x, y, color = 0xffffff, size = 10) => {
      const tt = new PIXI.Text({ text: txt, style: { fontFamily: o.fontFamily ?? "Kanit, sans-serif", fontSize: size, fill: color, stroke: { color: 0x1a120b, width: 3 } } });
      tt.anchor.set(0.5, 1);
      tt.position.set(x, y);
      return tt;
    };
    const pops = [];
    sk.on((ev, a) => {
      if (ev === "hit") {
        const to = sk.fighters.find((f) => f.id === a.to);
        const p = label(`${a.damage}${a.crit ? "!" : ""}`, to.body.x, to.body.y - 40, a.crit ? 0xffd23f : 0xffffff, a.crit ? 13 : 11);
        fxl.addChild(p);
        pops.push({ p, life: 0.8 });
        o.onHit?.(a);
        if (o.fx) o.fx.play(fxl, "hit_sparks", to.body.x, to.body.y - 18);
      }
      if (ev === "end") {
        const msg = label(t(`action.${a}`, lang), W / 2, H / 2, 0xffe08a, 20);
        hud.addChild(msg);
        setTimeout(() => o.onEnd?.(a, sk.rewards()), o.endDelay ?? 1200);
      }
    });
    const help = label(t("action.help", lang), W / 2, H - 6, 0xf7ebd3, 9);
    hud.addChild(help);
    const hpHud = new PIXI.Graphics();
    hud.addChild(hpHud);
    const names = sk.fighters.filter((f) => f.side === "hero").map((f, i) => {
      const n = label(`${f.name?.[lang] ?? f.id}`, 40, 18 + i * 16, 0xffffff, 9);
      n.anchor.set(0.5, 1);
      hud.addChild(n);
      return n;
    });
    (o.parent ?? app.stage).addChild(view);
    const keys = makeKeys();
    let acc = 0;
    function draw() {
      for (const f of sk.fighters) {
        const { box, s, bar } = sprites[f.id];
        box.position.set(Math.round(f.body.x), Math.round(f.body.y));
        const dir = f.body.facing > 0 ? "right" : "left";
        if (s.show) s.show(dir, f.hp <= 0 ? "down" : f.state === "attack" ? "attack" : f.state === "hurt" ? "hurt" : f.state === "run" ? "run" : f.state === "jump" ? "jump" : f.state === "fall" ? "fall" : "idle");
        else if (s.enemy) s.scale.x = f.body.facing > 0 ? -1 : 1;
        s.alpha = f.hp <= 0 ? 0.45 : f.invuln > 0 && sk.tick % 6 < 3 ? 0.5 : 1;
        if (s.enemy) s.rotation = f.hp <= 0 ? Math.PI / 2 * 0.9 : 0;
        bar.clear();
        if (f.hp > 0) bar.rect(-12, -46, 24, 3).fill(0x301010).rect(-12, -46, Math.round((24 * f.hp) / f.maxHp), 3).fill(f.side === "hero" ? 0x5fd35f : 0xe05040);
      }
      hpHud.clear();
      sk.fighters.filter((f) => f.side === "hero").forEach((f, i) => {
        const y = 22 + i * 16;
        hpHud.roundRect(68, y - 9, 80, 6, 2).fill(0x301010).roundRect(68, y - 9, Math.round((80 * f.hp) / f.maxHp), 6, 2).fill(0x5fd35f);
        if (f.maxMp) hpHud.rect(68, y - 2, Math.round((80 * f.mp) / f.maxMp), 2).fill(0x5fa8ff);
        names[i].text = `${f.name?.[lang] ?? f.id}`;
      });
    }
    const ctl = {
      sk, view, keys,
      key: (k, down) => keys.key(k, down),
      update(dt) {
        acc = Math.min(acc + dt, 0.25);
        while (acc >= TICK && sk.result === "ongoing") {
          acc -= TICK;
          sk.step(keys.take());
        }
        for (let i = pops.length - 1; i >= 0; i--) {
          const q = pops[i];
          q.life -= dt;
          q.p.y -= dt * 24;
          q.p.alpha = Math.max(0, q.life / 0.8);
          if (q.life <= 0) (q.p.destroy(), pops.splice(i, 1));
        }
        draw();
      },
      destroy() { view.destroy({ children: true }); },
    };
    draw();
    return ctl;
  }

  return { data, doc, core, t, platformer, skirmish, sheetFrames };
}
