import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { access } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MCP_TOOL_NAMES, createEasyActionMcp } from "../src/mcp/server.js";
import { createApp } from "../src/server/app.js";
import { tempWorkspace } from "./helpers.js";

let root: string;
let cleanup: () => Promise<void>;
let client: Client;
beforeAll(async () => {
  ({ root, cleanup } = await tempWorkspace());
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createEasyActionMcp(root).connect(a);
  client = new Client({ name: "test", version: "0.0.1" });
  await client.connect(b);
});
afterAll(async () => {
  await client.close();
  await cleanup();
});
const body = (res: unknown) => JSON.parse(((res as { content: Array<{ text: string }> }).content[0]!).text);

describe("MCP server", () => {
  it("lists the tools", async () => {
    expect((await client.listTools()).tools.map((t) => t.name).sort()).toEqual([...MCP_TOOL_NAMES].sort());
  });
  it("checks, simulates, renders and exports", async () => {
    const info = body(await client.callTool({ name: "workspace_info", arguments: {} }));
    expect(info.format).toMatch(/Content rules/);
    expect(info.battle.enemies).toContain("monkey_thief");
    expect(body(await client.callTool({ name: "check_action", arguments: { id: "three_towns" } })).errors).toEqual([]);
    const sim = body(await client.callTool({ name: "simulate_skirmish", arguments: { id: "three_towns", encounter: "monkey_raid", party: [{ id: "ton", level: 3 }, { id: "adam", level: 3 }] } }));
    expect(sim.wins).toBeGreaterThanOrEqual(4);
    const png = await client.callTool({ name: "render_level", arguments: { id: "three_towns", level: "ban_na_di_rooftops" } });
    expect((png.content as Array<{ type: string }>)[0]!.type).toBe("image");
    const bad = body(await client.callTool({ name: "write_action", arguments: { id: "bad", doc: { format: "easyaction/1", id: "bad", levels: "x" }, dryRun: true } }));
    expect(bad.errors?.length ?? (bad.saved === false ? 1 : 0)).toBeGreaterThan(0);
    const ex = body(await client.callTool({ name: "export_action", arguments: { id: "three_towns", preset: "pixi" } }));
    await access(path.join(ex.out, "easyaction-pixi.js"));
    const escape = await client.callTool({ name: "export_action", arguments: { id: "three_towns", preset: "json", out: "../../outside" } });
    expect((escape as { isError?: boolean }).isError).toBe(true);
  }, 60_000);
});

describe("HTTP API", () => {
  it("serves docs, level PNGs and sims; blocks cross-origin writes and rebinding", async () => {
    const app = createApp({ workspaceRoot: root, webRoot: "/nonexistent" });
    const h = { host: "127.0.0.1:8988" };
    expect((await app.request("/api/health", { headers: h })).status).toBe(200);
    const ws = (await (await app.request("/api/workspace", { headers: h })).json()) as { docs: Array<{ id: string }>; strings: object };
    expect(ws.docs.map((d) => d.id)).toContain("three_towns");
    const png = await app.request("/api/actions/three_towns/levels/ban_na_di_rooftops.png", { headers: h });
    expect(png.headers.get("content-type")).toBe("image/png");
    const sim = await app.request("/api/actions/three_towns/sim", { method: "POST", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify({ encounter: "field_pests", party: [{ id: "ton", level: 4 }], seeds: [1] }) });
    expect(((await sim.json()) as { runs: unknown[] }).runs.length).toBe(1);
    const cross = await app.request("/api/actions/x", { method: "PUT", headers: { ...h, origin: "https://evil.example", "content-type": "application/json" }, body: "{}" });
    expect(cross.status).toBe(403);
    expect((await app.request("/api/workspace", { headers: { host: "evil.example:8988" } })).status).toBe(403);
  });
});
