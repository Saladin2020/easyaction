/** Level preview PNG: optional Easy Scene backdrop, solids, one-way platforms, ladders, pickups, spawn and the jump arc. */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { jumpReach, newBody, stepBody } from "../shared/physics.js";
import type { Level, Physics } from "../shared/types.js";
import { decodePng, encodePng } from "./png.js";

type RGBA = [number, number, number, number];
const hex = (h: string, a = 255): RGBA => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), a];

export async function renderLevelPng(level: Level, P: Physics, opts: { background?: string; scale?: number } = {}): Promise<Buffer> {
  const W = Math.ceil(level.width), H = Math.ceil(level.height);
  const px = new Uint8Array(W * H * 4);
  if (opts.background && existsSync(opts.background)) {
    const bg = decodePng(await readFile(opts.background));
    for (let y = 0; y < Math.min(H, bg.height); y++)
      for (let x = 0; x < Math.min(W, bg.width); x++) for (let k = 0; k < 4; k++) px[(y * W + x) * 4 + k] = bg.data[(y * bg.width + x) * 4 + k]!;
  } else
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) px.set(y >= level.groundY ? hex("#6b4a2a") : hex("#87b7d9"), (y * W + x) * 4);
  const blend = (x: number, y: number, c: RGBA) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4, a = c[3] / 255;
    for (let k = 0; k < 3; k++) px[i + k] = Math.round(px[i + k]! * (1 - a) + c[k]! * a);
    px[i + 3] = 255;
  };
  const rect = (x: number, y: number, w: number, h: number, c: RGBA) => {
    for (let yy = Math.floor(y); yy < y + h; yy++) for (let xx = Math.floor(x); xx < x + w; xx++) blend(xx, yy, c);
  };
  for (let x = 0; x < W; x++) blend(x, level.groundY, hex("#ffffff", 140));
  for (const s of level.solids) rect(s.x, s.y, s.w, s.h, hex("#e04848", 150));
  for (const p of level.platforms) rect(p.x, p.y - 1, p.w, 3, hex("#ffc040", 230));
  for (const l of level.ladders) {
    rect(l.x + 2, l.y, 2, l.h, hex("#7a4a22"));
    rect(l.x + l.w - 4, l.y, 2, l.h, hex("#7a4a22"));
    for (let y = l.y + 4; y < l.y + l.h; y += 6) rect(l.x + 2, y, l.w - 4, 2, hex("#c08040"));
  }
  for (const p of level.pickups ?? []) rect(p.x - 3, p.y - 3, 7, 7, hex("#f6c445"));
  rect(level.spawn[0] - 7, level.spawn[1] - P.bodyH, P.bodyW, P.bodyH, hex("#2f7fd0", 200));
  // running-jump arc from the spawn
  const b = newBody(P, level.spawn[0], level.spawn[1]);
  b.onGround = true;
  b.vx = P.run;
  stepBody(b, { right: true, jump: true, jumpPressed: true }, level, P);
  for (let i = 0; i < 80 && !b.onGround; i++) {
    blend(b.x, b.y - P.bodyH / 2, hex("#ffffff", 220));
    stepBody(b, { right: true, jump: true }, level, P);
  }
  void jumpReach;
  const s = Math.max(1, Math.floor(opts.scale ?? 2));
  if (s === 1) return encodePng(W, H, px);
  const out = new Uint8Array(W * s * H * s * 4);
  for (let y = 0; y < H * s; y++) for (let x = 0; x < W * s; x++) out.set(px.subarray(((Math.floor(y / s) * W + Math.floor(x / s)) * 4), (Math.floor(y / s) * W + Math.floor(x / s)) * 4 + 4), (y * W * s + x) * 4);
  return encodePng(W * s, H * s, out);
}
