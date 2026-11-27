import { useEffect, useRef, useState } from "react";
import { bodyAnim, newBody, stepBody, type Input } from "../../src/shared/physics";
import type { ResolvedDoc } from "../../src/shared/types";
import { api, type SimRun, type WorkspaceInfo } from "./api";

type Lang = "th" | "en" | "ms";

/** Live platformer test on the level preview (← → / A D run, Space jump, ↑ ↓ climb, ↓+Space drop through). */
function Playground({ doc, level }: { doc: ResolvedDoc; level: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState("");
  useEffect(() => {
    const L = doc.levels.find((l) => l.id === level);
    const cv = ref.current;
    if (!L || !cv) return;
    const ctx = cv.getContext("2d")!;
    const img = new Image();
    img.src = api.levelPng(doc.id, level);
    const P = doc.physics;
    const b = newBody(P, L.spawn[0], L.spawn[1]);
    const keys = new Set<string>();
    let prevJump = false, coins = 0;
    const got = new Set<string>();
    const kd = (e: KeyboardEvent) => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(e.key)) e.preventDefault(); keys.add(e.key.toLowerCase()); };
    const ku = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    addEventListener("keydown", kd);
    addEventListener("keyup", ku);
    let raf = 0;
    const loop = () => {
      const jump = keys.has(" ") || keys.has("z");
      const inp: Input = { left: keys.has("arrowleft") || keys.has("a"), right: keys.has("arrowright") || keys.has("d"), up: keys.has("arrowup") || keys.has("w"), down: keys.has("arrowdown") || keys.has("s"), jump, jumpPressed: jump && !prevJump };
      prevJump = jump;
      stepBody(b, inp, L, P);
      for (const p of L.pickups ?? []) if (!got.has(p.id) && Math.abs(p.x - b.x) < 12 && Math.abs(p.y - (b.y - P.bodyH / 2)) < 20) { got.add(p.id); coins += p.coins ?? 1; }
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (img.complete) ctx.drawImage(img, 0, 0);
      for (const p of L.pickups ?? []) if (got.has(p.id)) { ctx.fillStyle = "#87b7d9"; ctx.fillRect(p.x - 4, p.y - 4, 9, 9); }
      ctx.fillStyle = "#2f7fd0";
      ctx.fillRect(Math.round(b.x - P.bodyW / 2), Math.round(b.y - P.bodyH), P.bodyW, P.bodyH);
      setStatus(`x ${b.x.toFixed(1)} y ${b.y.toFixed(1)} · ${bodyAnim(b)} · coins ${coins}`);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); removeEventListener("keydown", kd); removeEventListener("keyup", ku); };
  }, [doc, level]);
  const L = doc.levels.find((l) => l.id === level);
  return (
    <section>
      <canvas ref={ref} width={L?.width ?? 480} height={L?.height ?? 272} data-testid="playground" />
      <p className="mono">{status}</p>
    </section>
  );
}

export function App() {
  const [ws, setWs] = useState<WorkspaceInfo | null>(null);
  const [id, setId] = useState("");
  const [doc, setDoc] = useState<ResolvedDoc | null>(null);
  const [level, setLevel] = useState("");
  const [lang, setLang] = useState<Lang>("th");
  const [party, setParty] = useState("ton:3,adam:3");
  const [runs, setRuns] = useState<Record<string, SimRun[]>>({});
  const [diag, setDiag] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const s = (k: string) => ws?.strings[k]?.[lang] ?? k;

  useEffect(() => { api.workspace().then((w) => { setWs(w); if (w.docs[0]) setId(w.docs[0].id); }).catch((e) => setErr(String(e))); }, []);
  useEffect(() => {
    if (!id) return;
    api.doc(id).then((d) => { setDoc(d.resolved); setLevel(d.resolved?.levels[0]?.id ?? ""); }).catch((e) => setErr(String(e)));
    api.check(id).then((c) => setDiag([...c.errors.map((e) => `error ${e.path}: ${e.message}`), ...c.warnings.map((w) => `warning ${w.path}: ${w.message}`)]));
  }, [id]);

  const sim = async (enc: string) => {
    const p = party.split(",").map((x) => { const [h, lv] = x.trim().split(":"); return { id: h!, level: Number(lv ?? 1) || 1 }; });
    try { const r = await api.sim(id, enc, p); setRuns((o) => ({ ...o, [enc]: r.runs })); } catch (e) { setErr(String(e)); }
  };

  return (
    <main className="ea">
      <header>
        <h1>Easy Action</h1>
        <select value={id} onChange={(e) => setId(e.target.value)} aria-label="document">{ws?.docs.map((d) => <option key={d.id}>{d.id}</option>)}</select>
        <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label="language"><option value="th">ไทย</option><option value="en">English</option><option value="ms">Melayu</option></select>
        {(["pixi", "godot", "json"] as const).map((p) => <button key={p} onClick={() => api.exportDoc(id, p).then((r) => setNote(`${r.out} (${r.files})`)).catch((e) => setErr(String(e)))}>Export {p}</button>)}
      </header>
      {err && <p className="diag">{err}</p>}
      {note && <p className="mono">{note}</p>}
      {diag.length ? diag.map((d) => <p key={d} className="diag">{d}</p>) : doc && <p>✓ {doc.id}</p>}
      {doc && (
        <>
          <div className="row">{doc.levels.map((l) => <button key={l.id} aria-pressed={l.id === level} onClick={() => setLevel(l.id)}>{l.name?.[lang] ?? l.id}</button>)}</div>
          {level && <Playground doc={doc} level={level} />}
          <p>{s("action.help")}</p>
          <h2>{s("action.fight")}</h2>
          <div className="row"><label>Party <input value={party} onChange={(e) => setParty(e.target.value)} /></label>{ws?.battle ? null : <span className="diag">Easy Battle data not found</span>}</div>
          <table>
            <thead><tr><th>encounter</th><th>enemies</th><th /><th>result</th></tr></thead>
            <tbody>
              {doc.encounters.map((e) => (
                <tr key={e.id}>
                  <td>{e.name?.[lang] ?? e.id}</td>
                  <td>{e.enemies.map((x) => `${x.id}${x.level ? ` L${x.level}` : ""}`).join(", ")}</td>
                  <td><button onClick={() => sim(e.id)}>Simulate</button></td>
                  <td className="mono">{runs[e.id]?.map((r) => `${s(`action.${r.result}`)} ${(r.ticks / 60).toFixed(1)}s`).join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}
