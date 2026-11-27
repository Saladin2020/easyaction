import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { DEV_UI_ORIGINS, checkRequest } from "../shared/requestGuard.js";
import { arena, fightersFromBattle, simulateSkirmish } from "../shared/combat.js";
import { STRINGS } from "../shared/doc.js";
import type { ExportPreset } from "../shared/types.js";
import { exportAction } from "../lib/export.js";
import { renderLevelPng } from "../lib/render.js";
import { assertSafeId, checkDoc, loadBattleDb, loadDoc, readDocRaw, saveDoc, workspaceSummary } from "../lib/workspace.js";

export interface CreateAppOptions {
  workspaceRoot: string;
  webRoot?: string;
  dev?: boolean;
  host?: string;
  token?: string;
}

const TOKEN_COOKIE = "easyaction_token";
const fail = (e: unknown) => (e instanceof Error ? e.message : String(e));

function tokenPage(): string {
  return `<!doctype html><meta charset="utf-8"><title>Easy Action</title>
<body style="font-family:system-ui;background:#1a1410;color:#f3e7d3;padding:2rem">
<h1>Easy Action token required</h1>
<p>Paste the token printed in the terminal that started Easy Action.</p>
<form method="get"><input name="token" autocomplete="off" style="width:22rem"> <button>Open</button></form>
</body>`;
}

export function createApp(options: CreateAppOptions): Hono {
  const app = new Hono();
  const { workspaceRoot: root, webRoot, dev, host = "127.0.0.1", token } = options;
  const guard = { bindHost: host, token, extraOrigins: dev ? DEV_UI_ORIGINS : [] };

  app.use("*", async (c, next) => {
    const queryToken = c.req.query("token");
    const provided = c.req.header("x-easyaction-token") ?? queryToken ?? getCookie(c, TOKEN_COOKIE);
    const denied = checkRequest(guard, { method: c.req.method, host: c.req.header("host"), origin: c.req.header("origin"), token: provided });
    if (denied) {
      if (denied.status === 401 && c.req.method === "GET" && !c.req.path.startsWith("/api/")) return c.html(tokenPage(), 401);
      return c.json({ error: denied.error }, denied.status);
    }
    if (token && queryToken) setCookie(c, TOKEN_COOKIE, queryToken, { httpOnly: true, sameSite: "Strict", path: "/", maxAge: 60 * 60 * 24 * 365 });
    await next();
  });

  app.get("/api/health", (c) => c.json({ ok: true, workspaceRoot: root }));
  app.get("/api/workspace", async (c) => c.json({ ...(await workspaceSummary(root)), strings: STRINGS }));
  app.get("/api/actions/:id", async (c) => {
    try {
      const raw = await readDocRaw(root, assertSafeId(c.req.param("id")));
      return raw ? c.json({ raw, resolved: await loadDoc(root, raw.id).catch(() => null) }) : c.json({ error: "not found" }, 404);
    } catch (e) {
      return c.json({ error: fail(e) }, 400);
    }
  });
  app.put("/api/actions/:id", async (c) => {
    try {
      const id = assertSafeId(c.req.param("id"));
      return c.json(await saveDoc(root, id, await c.req.json(), { dryRun: c.req.query("dryRun") === "1" }));
    } catch (e) {
      return c.json({ error: fail(e) }, 400);
    }
  });
  app.get("/api/actions/:id/check", async (c) => c.json(await checkDoc(root, assertSafeId(c.req.param("id")))));
  app.get("/api/actions/:id/levels/:level{[a-z0-9_-]+\\.png}", async (c) => {
    try {
      const doc = await loadDoc(root, assertSafeId(c.req.param("id")));
      const lid = c.req.param("level").replace(/\.png$/, "");
      const l = doc.levels.find((x) => x.id === lid);
      if (!l) return c.json({ error: "unknown level" }, 404);
      const png = await renderLevelPng(l, doc.physics, { scale: Number(c.req.query("scale") ?? 2) });
      return c.body(new Uint8Array(png), 200, { "Content-Type": "image/png", "Cache-Control": "no-store" });
    } catch (e) {
      return c.json({ error: fail(e) }, 400);
    }
  });
  app.post("/api/actions/:id/sim", async (c) => {
    try {
      const doc = await loadDoc(root, assertSafeId(c.req.param("id")));
      const body = (await c.req.json()) as { encounter: string; party: Array<{ id: string; level: number }>; seeds?: number[] };
      const enc = doc.encounters.find((e) => e.id === body.encounter);
      if (!enc) return c.json({ error: "unknown encounter" }, 404);
      const db = await loadBattleDb(root);
      const level = enc.level ? doc.levels.find((l) => l.id === enc.level)! : arena(enc.width ?? 480);
      const runs = (body.seeds ?? [1, 2, 3, 4, 5]).map((seed) => ({ seed, ...simulateSkirmish(fightersFromBattle(db, body.party, enc.enemies, level.width), level, seed, { physics: doc.physics, combat: doc.combat }) }));
      return c.json({ runs });
    } catch (e) {
      return c.json({ error: fail(e) }, 400);
    }
  });
  app.post("/api/export", async (c) => {
    try {
      const body = (await c.req.json()) as { id: string; preset?: ExportPreset; out?: string };
      const res = await exportAction(root, assertSafeId(body.id), { preset: body.preset, out: body.out });
      return c.json({ ok: true, ...res, files: res.files.length });
    } catch (e) {
      return c.json({ error: fail(e) }, 400);
    }
  });
  if (!dev && webRoot) {
    app.use("/*", serveStatic({ root: webRoot }));
    app.get("*", async (c) => {
      try {
        return c.html((await readFile(path.join(webRoot, "index.html"))).toString("utf8"));
      } catch {
        return c.text("Web UI not built yet. Run npm run build:web or start with --dev.", 503);
      }
    });
  } else if (dev) {
    app.get("/", (c) =>
      c.html(`<!doctype html><meta charset="utf-8"><title>Easy Action (dev)</title>
<body style="font-family:system-ui;background:#1a1410;color:#f3e7d3;padding:2rem">
<h1>Easy Action API is running</h1><p>Workspace: <code>${root}</code></p>
<p>Open the Vite UI at <a href="http://127.0.0.1:5198" style="color:#f0c36a">http://127.0.0.1:5198</a></p></body>`),
    );
  }
  return app;
}

export function defaultWebRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.resolve(here, "../web/dist"), path.resolve(here, "../../web/dist")];
  return candidates.find((p) => existsSync(path.join(p, "index.html"))) ?? candidates[1]!;
}
