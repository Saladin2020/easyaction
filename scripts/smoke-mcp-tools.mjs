/** MCP smoke test: start the server over stdio and over HTTP like a client would and call tools. */
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const ws = mkdtempSync(path.join(os.tmpdir(), "easyaction-smoke-"));
execFileSync("npx", ["tsx", "src/cli.ts", "init", "--workspace", ws], { stdio: "ignore", shell: process.platform === "win32" });
const fail = (m) => {
  console.error("FAIL", m);
  process.exitCode = 1;
};
const body = (r) => JSON.parse(r.content?.[0]?.text ?? "{}");
const EXPECTED = 9;

async function exercise(client, label) {
  const tools = (await client.listTools()).tools.map((t) => t.name);
  console.log(`[${label}] tools (${tools.length}):`, tools.join(", "));
  if (tools.length !== EXPECTED) fail(`${label}: expected ${EXPECTED} tools`);
  const info = body(await client.callTool({ name: "workspace_info", arguments: {} }));
  if (!info.docs?.length || !info.battle) fail(`${label}: workspace_info`);
  const chk = body(await client.callTool({ name: "check_action", arguments: { id: "three_towns" } }));
  if (chk.errors?.length) fail(`${label}: check_action`);
  const reach = body(await client.callTool({ name: "jump_reach", arguments: { id: "three_towns" } }));
  console.log(`[${label}] jump ${reach.height?.toFixed(1)} px / ${reach.distance} px`);
  const sim = body(await client.callTool({ name: "simulate_skirmish", arguments: { id: "three_towns", encounter: "monkey_raid", party: [{ id: "ton", level: 3 }, { id: "adam", level: 3 }], seeds: [1, 2, 3] } }));
  console.log(`[${label}] monkey_raid wins ${sim.wins}/3`);
  if (!(sim.wins >= 2)) fail(`${label}: simulate_skirmish`);
  const r = await client.callTool({ name: "render_level", arguments: { id: "three_towns", level: "ban_na_di_rooftops" } });
  if (!r.content?.some((c) => c.type === "image")) fail(`${label}: render_level`);
}

{
  const client = new Client({ name: "smoke", version: "0.0.1" });
  await client.connect(new StdioClientTransport({ command: "npx", args: ["tsx", "src/mcp/server.ts", "--workspace", ws], cwd: process.cwd(), env: { ...process.env }, stderr: "ignore" }));
  await exercise(client, "stdio");
  const exp = body(await client.callTool({ name: "export_action", arguments: { id: "three_towns", preset: "godot" } }));
  console.log("[stdio] export godot:", path.relative(ws, exp.out ?? ""), "files", exp.files);
  if (!exp.files) fail("stdio: export_action");
  await client.close();
}
{
  const port = 18989 + Math.floor(Math.random() * 500);
  const proc = spawn("npx", ["tsx", "src/mcp/server.ts", "--http", "--port", String(port), "--workspace", ws], { stdio: ["ignore", "ignore", "pipe"], shell: process.platform === "win32" });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("MCP HTTP did not start")), 20000);
    proc.stderr.on("data", (d) => {
      if (/http:\/\//i.test(String(d))) (clearTimeout(t), resolve());
    });
  });
  const client = new Client({ name: "smoke-http", version: "0.0.1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
  await exercise(client, "http");
  await client.close();
  proc.kill();
}
rmSync(ws, { recursive: true, force: true });
console.log(process.exitCode ? "MCP smoke FAILED" : "MCP smoke OK");
process.exit(process.exitCode ?? 0);
