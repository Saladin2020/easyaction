import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initWorkspace } from "../src/lib/workspace.js";

/** Fresh workspace with the three_towns sample (Easy Battle data found via ../easybattle). */
export async function tempWorkspace(): Promise<{ root: string; cleanup: () => Promise<void> }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "easyaction-test-"));
  await initWorkspace(root);
  return { root, cleanup: () => rm(root, { recursive: true, force: true }) };
}
