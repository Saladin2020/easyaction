import type { ActionDoc, Diagnostic, ResolvedDoc } from "../../src/shared/types";

export interface WorkspaceInfo {
  root: string;
  docs: Array<{ id: string; [k: string]: unknown }>;
  broken: Array<{ id: string; error: string }>;
  battle: { heroes: string[]; enemies: string[] } | null;
  strings: Record<string, { th: string; en: string; ms: string }>;
}
export interface SimRun { seed: number; result: "win" | "lose" | "draw"; ticks: number; hits: number }

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? res.statusText);
  return body;
}
const post = (url: string, body: unknown, method = "POST") => fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export const api = {
  workspace: () => fetch("/api/workspace").then((r) => json<WorkspaceInfo>(r)),
  doc: (id: string) => fetch(`/api/actions/${id}`).then((r) => json<{ raw: ActionDoc; resolved: ResolvedDoc | null }>(r)),
  check: (id: string) => fetch(`/api/actions/${id}/check`).then((r) => json<{ errors: Diagnostic[]; warnings: Diagnostic[] }>(r)),
  save: (id: string, doc: unknown) => post(`/api/actions/${id}`, doc, "PUT").then((r) => json<unknown>(r)),
  sim: (id: string, encounter: string, party: Array<{ id: string; level: number }>) => post(`/api/actions/${id}/sim`, { encounter, party }).then((r) => json<{ runs: SimRun[] }>(r)),
  exportDoc: (id: string, preset: string) => post("/api/export", { id, preset }).then((r) => json<{ out: string; files: number }>(r)),
  levelPng: (id: string, level: string) => `/api/actions/${id}/levels/${level}.png?scale=1`,
};
