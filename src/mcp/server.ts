#!/usr/bin/env node
/**
 * Easy Action MCP server (stdio by default; optional Streamable HTTP on :8989).
 *   npx tsx src/mcp/server.ts            npx tsx src/mcp/server.ts --http --port 8989
 * Env: EASYACTION_WORKSPACE  absolute path to the workspace (default: cwd)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { z } from "zod";
import { arena, fightersFromBattle, simulateSkirmish } from "../shared/combat.js";
import { levelFromScene } from "../shared/doc.js";
import { jumpReach } from "../shared/physics.js";
import { checkRequest, resolveToken } from "../shared/requestGuard.js";
import { EXPORT_PRESETS, FORMAT } from "../shared/types.js";
import { exportAction } from "../lib/export.js";
import { renderLevelPng } from "../lib/render.js";
import { checkDoc, loadBattleDb, loadDoc, readDocRaw, resolveInside, resolveWorkspace, saveDoc, workspaceSummary } from "../lib/workspace.js";

export const MCP_TOOL_NAMES = ["workspace_info", "get_action", "write_action", "check_action", "jump_reach", "simulate_skirmish", "level_from_scene", "render_level", "export_action"] as const;

const IdSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]*$/, "Use a-z, 0-9, _ or -");
const text = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });
const err = (message: string) => ({ isError: true as const, content: [{ type: "text" as const, text: message }] });
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const FORMAT_CHEATSHEET = `Document actions/<id>.easyaction.json: { format "${FORMAT}", id, name {th,en,ms},
  physics? { gravity 0.35, jump 6.2, jumpCut 0.45, maxFall 7, run 1.6, accel, friction, airControl, climb 1.2, coyote 6, buffer 6, bodyW 14, bodyH 30 } (px per tick, 60 ticks/s),
  combat? { stun, invuln, speedBase, speedDiv, aiCooldown, minCooldown, aiJitter, maxTicks, crit, moves { light|heavy: { startup, active, recovery, reach, height, power, knockback, cooldown, mp } } },
  levels [{ id, name, scene? (Easy Scene id), width, height, groundY (street floor = feet y), solids [{x,y,w,h}], platforms [{x,y,w}] one-way, ladders [{x,y,w,h}], spawn [x,y], pickups [{id,x,y,coins?,item?}] }],
  encounters [{ id, name, level? or width, enemies [{ id (Easy Battle enemy), level?, x? }] }] }
Platforms must be reachable: within a jump (see jump_reach) of the floor / another platform, or by a ladder.
Content rules: no sacred figures, no places of worship as arenas or enemies, no Quran / Arabic calligraphy decoration; keep casts multicultural.`;

export function createEasyActionMcp(workspaceRoot: string): McpServer {
  const root = resolveWorkspace(workspaceRoot);
  const server = new McpServer({ name: "easyaction", version: "0.1.0" });
  const guard = async <T>(fn: () => Promise<T>) => {
    try {
      return text(await fn());
    } catch (e) {
      return err(msg(e));
    }
  };
  server.registerTool("workspace_info", { title: "Workspace info", description: "Easy Action workspace: action documents (levels, encounters), Easy Battle heroes / enemies found, export presets and the document format. Call this first.", inputSchema: {} }, async () =>
    guard(async () => ({ ...(await workspaceSummary(root)), format: FORMAT_CHEATSHEET })),
  );
  server.registerTool("get_action", { title: "Get action document", description: "Raw document (levels, encounters, physics / combat overrides).", inputSchema: { id: IdSchema } }, async ({ id }) =>
    guard(async () => (await readDocRaw(root, id)) ?? Promise.reject(new Error(`no document ${id}`))),
  );
  server.registerTool("write_action", { title: "Write action document", description: "Validate and save actions/<id>.easyaction.json (dryRun to only validate). Enemy ids are checked against Easy Battle.", inputSchema: { id: IdSchema, doc: z.record(z.string(), z.unknown()), dryRun: z.boolean().optional() } }, async ({ id, doc, dryRun }) =>
    guard(() => saveDoc(root, id, doc, { dryRun })),
  );
  server.registerTool("check_action", { title: "Check action document", description: "Errors and warnings: shape, unreachable platforms (higher than a jump, no ladder), unknown levels or Easy Battle enemies.", inputSchema: { id: IdSchema } }, async ({ id }) =>
    guard(() => checkDoc(root, id)),
  );
  server.registerTool("jump_reach", { title: "Jump reach", description: "Highest jump and longest running jump (px, ticks) for a document's physics — use to place platforms.", inputSchema: { id: IdSchema, speed: z.number().positive().optional() } }, async ({ id, speed }) =>
    guard(async () => jumpReach((await loadDoc(root, id)).physics, speed ?? 1)),
  );
  server.registerTool(
    "simulate_skirmish",
    { title: "Simulate skirmish", description: "Run a real-time encounter headless (all fighters on AI) for several seeds: win / lose / draw, ticks, hits, HP left. Party = Easy Battle hero ids + levels.", inputSchema: { id: IdSchema, encounter: IdSchema, party: z.array(z.object({ id: IdSchema, level: z.number().int().min(1).max(99), tree: z.array(z.string()).optional() })).min(1), seeds: z.array(z.number().int()).optional() } },
    async ({ id, encounter, party, seeds }) =>
      guard(async () => {
        const doc = await loadDoc(root, id);
        const db = await loadBattleDb(root);
        const enc = doc.encounters.find((e) => e.id === encounter);
        if (!enc) throw new Error(`unknown encounter ${encounter}`);
        const level = enc.level ? doc.levels.find((l) => l.id === enc.level)! : arena(enc.width ?? 480);
        const runs = (seeds ?? [1, 2, 3, 4, 5]).map((seed) => ({ seed, ...simulateSkirmish(fightersFromBattle(db, party, enc.enemies, level.width), level, seed, { physics: doc.physics, combat: doc.combat }) }));
        return { encounter, wins: runs.filter((r) => r.result === "win").length, runs: runs.map(({ digest: _d, ...r }) => r) };
      }),
  );
  server.registerTool("level_from_scene", { title: "Level from Easy Scene", description: "Turn an Easy Scene Pixi export (<scene>.pixi.json: size + collision) into a level base (floor, solids, one-way platforms); add ladders / platforms on top.", inputSchema: { path: z.string(), id: IdSchema.optional() } }, async ({ path: p, id }) =>
    guard(async () => levelFromScene(JSON.parse(await readFile(resolveInside(root, p), "utf8")), id)),
  );
  server.registerTool("render_level", { title: "Render level", description: "PNG preview of a level (solids red, platforms gold, ladders, coins, spawn, running-jump arc); optional Easy Scene preview PNG as backdrop.", inputSchema: { id: IdSchema, level: IdSchema, background: z.string().optional(), scale: z.number().int().min(1).max(4).optional() } }, async ({ id, level, background, scale }) => {
    try {
      const doc = await loadDoc(root, id);
      const l = doc.levels.find((x) => x.id === level);
      if (!l) return err(`unknown level ${level}`);
      const png = await renderLevelPng(l, doc.physics, { background: background ? resolveInside(root, background) : undefined, scale: scale ?? 1 });
      return { content: [{ type: "image" as const, data: png.toString("base64"), mimeType: "image/png" }] };
    } catch (e) {
      return err(msg(e));
    }
  });
  server.registerTool("export_action", { title: "Export", description: `Export a document: ${EXPORT_PRESETS.join(" | ")} (pixi: easyaction-pixi.js + core + demo; godot: EasyActionPlayer, EasySkirmishView, core port, parity test).`, inputSchema: { id: IdSchema, preset: z.enum(EXPORT_PRESETS), out: z.string().optional() } }, async ({ id, preset, out }) =>
    guard(async () => {
      const r = await exportAction(root, id, { preset, out });
      return { ...r, files: r.files.length };
    }),
  );
  return server;
}

function parseArgs(argv: string[]) {
  const out = { http: false, port: 8989, host: "127.0.0.1", workspace: process.env.EASYACTION_WORKSPACE ?? process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--http") out.http = true;
    else if (a === "--port") out.port = Number(argv[++i] ?? out.port);
    else if (a === "--host") out.host = argv[++i] ?? out.host;
    else if (a === "--workspace") out.workspace = argv[++i] ?? out.workspace;
  }
  return out;
}

async function startMcp(opts: ReturnType<typeof parseArgs>) {
  const workspace = resolveWorkspace(opts.workspace);
  if (opts.http) return startHttp(workspace, opts.host, opts.port);
  await createEasyActionMcp(workspace).connect(new StdioServerTransport());
}

async function startHttp(workspace: string, host: string, port: number) {
  const { StreamableHTTPServerTransport } = await import("@modelcontextprotocol/sdk/server/streamableHttp.js");
  const sessions = new Map<string, InstanceType<typeof StreamableHTTPServerTransport>>();
  const token = resolveToken(host);
  if (token) console.error(`Non-loopback host: send "Authorization: Bearer <token>" — token printed once: ${token}`);
  const httpServer = createServer(async (req, res) => {
    const auth = req.headers.authorization;
    const denied = checkRequest(
      { bindHost: host, token },
      { method: req.method ?? "GET", host: req.headers.host, origin: req.headers.origin, token: auth?.startsWith("Bearer ") ? auth.slice(7) : (req.headers["x-easyaction-token"] as string | undefined) },
    );
    if (denied) {
      res.writeHead(denied.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: denied.error }));
      return;
    }
    const url = new URL(req.url ?? "/", `http://${host}:${port}`);
    if (url.pathname !== "/mcp") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ name: "easyfx", transport: "streamable-http", endpoint: `http://${host}:${port}/mcp`, workspace }));
      return;
    }
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    try {
      if (req.method === "POST") {
        let transport = sessionId ? sessions.get(sessionId) : undefined;
        if (!transport) {
          const mcp = createEasyActionMcp(workspace);
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => crypto.randomUUID(),
            onsessioninitialized: (id: string) => {
              sessions.set(id, transport!);
            },
          });
          transport.onclose = () => {
            const id = transport!.sessionId;
            if (id) sessions.delete(id);
          };
          await mcp.connect(transport);
        }
        await transport.handleRequest(req, res);
        return;
      }
      if (req.method === "GET" || req.method === "DELETE") {
        const transport = sessionId ? sessions.get(sessionId) : undefined;
        if (!transport) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid or missing mcp-session-id" }));
          return;
        }
        await transport.handleRequest(req, res);
        return;
      }
      res.writeHead(405).end();
    } catch (e) {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: msg(e) }));
      }
    }
  });
  httpServer.listen(port, host, () => {
    console.error(`Easy Action MCP (HTTP) http://${host}:${port}/mcp`);
    console.error(`Workspace ${workspace}`);
  });
}

function entryIndex(): number {
  return process.argv.findIndex((arg) => /(?:^|[/\\])mcp[/\\]server\.(?:ts|js|mjs)$/i.test(arg));
}

if (entryIndex() >= 0) {
  await startMcp(parseArgs(process.argv.slice(entryIndex() + 1)));
}
