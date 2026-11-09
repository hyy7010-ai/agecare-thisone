// Sunrise Care Agent console — added for the Cyberport AI Agent Challenge (Nov 2026).
// Public demo page at /agent. Uses fictional sample inputs only.
import React, { useEffect, useRef, useState } from "react";
import {
  Bot, Mic, Square, Play, ShieldCheck, ShieldAlert, Lock, CheckCircle2, XCircle,
  UserCheck, ClipboardList, Languages, Loader2, ChevronDown, ChevronRight,
} from "lucide-react";

type Step = {
  step: number; tool: string; reason: string; args: any; output: any; ms: number;
  enforcedBy: "agent" | "orchestrator";
};
type AgentResult = {
  status: string; transcript: string; detectedLanguage?: string; maskedIdentifiers: number;
  note?: { englishNote: string; nativeConfirmation: string; suggestedFollowUps?: string[] };
  verification?: { supported: boolean; unsupportedStatements: string[] };
  sirs?: {
    isReportable: boolean; category: string; priority: number | null; timeframe: string | null;
    rationale?: string; mustReportReasons: string[]; rnCheckReasons: string[]; rnMustCheck: boolean; raisedByRedLine: boolean; lockDowngrade: boolean;
    framework?: string; jurisdiction?: "AU" | "HK"; modelPriority?: number | null;
  };
  review?: { ticket: string; status: string; note: string };
  trace: Step[]; totalMs: number; model: string;
};
type AuditEntry = { at: string; action: string; detail: string };

const LANGS = [
  { code: "zh", label: "普通话 Mandarin" },
  { code: "yue", label: "粵語 Cantonese" },
  { code: "zh-HK", label: "繁體中文 (香港)" },
  { code: "en", label: "English" },
  { code: "tl", label: "Tagalog" },
];

// Fictional examples written for the demo. Not real residents or events.
const SAMPLES = [
  { lang: "zh", label: "普通话：跌倒撞头", text: "王奶奶早上七点在卫生间跌倒了，撞到头，额头有一点流血，我扶她起来坐在椅子上，用纱布按住了。" },
  { lang: "yue", label: "粵語：食飯同如廁", text: "陳伯今朝食咗半碗粥，之後我扶佢去廁所，佢話膝頭有啲痛。" },
  { lang: "zh", label: "普通话：被推（暴力）", text: "另一个护工推了刘奶奶一下，她很害怕，一直在哭。" },
  { lang: "en", label: "English: with phone number", text: "Mrs Lee refused lunch today. Her daughter called from 0412 345 678 asking about her mood. She seemed quiet but settled." },
];

const TOOL_LABEL: Record<string, string> = {
  transcribe_audio: "转写录音 Transcribe",
  draft_progress_note: "生成英文护理记录 Draft note",
  verify_against_source: "逐句核对原话 Verify",
  assess_incident: "严重事件判断 Assess incident",
  route_for_human_review: "交给护士确认 Human review",
};

const AUDIT_KEY = "sunrise_agent_audit";
const readAudit = (): AuditEntry[] => {
  try { return JSON.parse(localStorage.getItem(AUDIT_KEY) || "[]"); } catch { return []; }
};

export function AgentConsole() {
  const [language, setLanguage] = useState("zh");
  const [jurisdiction, setJurisdiction] = useState<"AU" | "HK">("HK");
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AgentResult | null>(null);
  const [live, setLive] = useState<{ steps: Step[]; running: { step: number; tool: string; reason: string; enforcedBy: string }[] }>({ steps: [], running: [] });
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [editedNote, setEditedNote] = useState("");
  const [rnName, setRnName] = useState("");
  const [approver, setApprover] = useState("");
  const [rnCheck, setRnCheck] = useState<"" | "report" | "no_report">("");
  const [decision, setDecision] = useState<"" | "approved" | "returned">("");
  const [lockMsg, setLockMsg] = useState("");
  const [audit, setAudit] = useState<AuditEntry[]>(readAudit());
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const log = (action: string, detail: string) => {
    const next = [{ at: new Date().toLocaleString(), action, detail }, ...readAudit()].slice(0, 50);
    localStorage.setItem(AUDIT_KEY, JSON.stringify(next));
    setAudit(next);
  };

  useEffect(() => { if (result?.note) setEditedNote(result.note.englishNote); }, [result]);

  const startRec = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = () => {
        setAudioBlob(new Blob(chunks.current, { type: rec.mimeType || "audio/webm" }));
        stream.getTracks().forEach((t) => t.stop());
      };
      rec.start();
      recRef.current = rec;
      setRecording(true);
    } catch {
      setError("无法使用麦克风。Microphone not available.");
    }
  };
  const stopRec = () => { recRef.current?.stop(); setRecording(false); };

  const run = async () => {
    setLoading(true); setError(""); setResult(null); setLive({ steps: [], running: [] }); setDecision(""); setApprover(""); setRnCheck(""); setLockMsg(""); setOpen({});
    try {
      const fd = new FormData();
      fd.append("language", language);
      fd.append("jurisdiction", jurisdiction);
      fd.append("text", text);
      if (audioBlob) fd.append("audio", audioBlob, "note.webm");
      const r = await fetch("/api/agent/run?stream=1", { method: "POST", body: fd });
      if (!r.ok || !r.body) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || "Agent failed");
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let final: AgentResult | null = null;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line);
          if (ev.type === "tool_start") setLive((l) => ({ steps: l.steps, running: [...l.running, ev] }));
          if (ev.type === "step") setLive((l) => ({ steps: [...l.steps, ev.step], running: l.running.filter((r) => r.step !== ev.step.step) }));
          if (ev.type === "result") final = ev.result;
          if (ev.type === "error") throw new Error(ev.error);
        }
      }
      if (!final) throw new Error("Agent stopped before finishing.");
      setResult(final);
      log("AGENT_RUN", `${final.review?.ticket} · ${final.trace.length} steps · SIRS P${final.sirs?.priority ?? "-"}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const tryDowngrade = () => {
    if (!result?.sirs) return;
    if (result.sirs.lockDowngrade) {
      setLockMsg(`已锁定：这是必须上报的严重事件（期限 ${result.sirs.timeframe}），系统不允许降级。Locked: cannot be downgraded.`);
      log("BLOCKED_DOWNGRADE", `${result.review?.ticket} · attempted P1 → P2`);
    } else {
      setLockMsg("可以由护士调整，但会记录在审计日志里。RN may adjust; change is logged.");
      log("PRIORITY_CHANGE_REQUESTED", `${result.review?.ticket}`);
    }
  };

  const decide = (d: "approved" | "returned") => {
    if (!rnName.trim()) { setError("请先填写确认护士的名字。Enter the RN's name first."); return; }
    if (d === "approved" && result?.sirs?.rnMustCheck && !rnCheck) {
      setError("红线要求：请先选择这件事要不要上报。Red line: record the reporting decision first."); return;
    }
    setError(""); setDecision(d); setApprover(rnName.trim());
    if (result?.sirs?.rnMustCheck && rnCheck)
      log("RN_REPORTING_DECISION", `${result?.review?.ticket} · ${rnCheck === "report" ? "will report" : "not reportable"} · by ${rnName}`);
    const edited = result?.note && editedNote.trim() !== result.note.englishNote.trim();
    log(d === "approved" ? "RN_APPROVED" : "RN_RETURNED",
      `${result?.review?.ticket} · by ${rnName}${edited ? " · note edited by RN" : ""}`);
  };

  const s = result?.sirs;
  const guardrails = result ? [
    { ok: true, label: "隐私遮盖 Privacy masking", detail: `${result.maskedIdentifiers} 个号码已遮盖 identifiers masked before AI` },
    { ok: !!result.verification?.supported, label: "逐句核对 Anti-fabrication check",
      detail: result.verification?.supported ? "每句话都能在原话里找到 All statements supported" : `${result.verification?.unsupportedStatements?.length || 0} 句没有依据，需人工看 unsupported` },
    { ok: true, label: "红线规则 Red-line rule",
      detail: s?.raisedByRedLine ? "AI 原本判断不用上报，规则强制改为必须上报 Rule forced must-report"
        : s?.rnMustCheck ? "可能需要上报：护士必须作出决定，不能直接忽略 RN must decide"
        : s?.lockDowngrade ? "必须上报，已锁定 Must report, locked" : "未触发 Not triggered" },
    { ok: decision === "approved", label: "人工确认 Human gate",
      detail: decision === "approved" ? `已由 ${approver} 确认 Approved` : decision === "returned" ? "已退回护工修改 Returned" : "等待护士确认，AI 不能自己定稿 Awaiting RN" },
  ] : [];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3">
          <Bot className="w-8 h-8 text-orange-500" />
          <div>
            <h1 className="text-xl font-bold">Sunrise Care Agent</h1>
            <p className="text-sm text-slate-500">护工说母语 → AI 智能体整理成英文护理记录、判断严重事件 → 护士确认后才生效</p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl border p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Languages className="w-4 h-4 text-slate-500" />
              {LANGS.map((l) => (
                <button key={l.code} onClick={() => setLanguage(l.code)}
                  className={`px-3 py-1 rounded-full text-sm border ${language === l.code ? "bg-orange-500 text-white border-orange-500" : "bg-white"}`}>
                  {l.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <ShieldCheck className="w-4 h-4 text-slate-500" />
              <span className="text-slate-500">事故规则 Incident rules:</span>
              {([["HK", "香港 社署特別事故 (3 天內)"], ["AU", "Australia SIRS (24h / 30d)"]] as const).map(([k, l]) => (
                <button key={k} onClick={() => setJurisdiction(k)}
                  className={`px-3 py-1 rounded-full border ${jurisdiction === k ? "bg-slate-800 text-white border-slate-800" : "bg-white"}`}>{l}</button>
              ))}
            </div>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4}
              placeholder="用任何语言打字或录音，描述刚才发生的事。Type or record what happened, in any language."
              className="w-full border rounded-lg p-3 text-sm" />
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="text-slate-500 self-center">虚构示例 Fictional samples:</span>
              {SAMPLES.map((x) => (
                <button key={x.label} onClick={() => { setText(x.text); setLanguage(x.lang); setAudioBlob(null); }}
                  className="px-2 py-1 rounded border bg-slate-50 hover:bg-slate-100">{x.label}</button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!recording ? (
                <button onClick={startRec} className="flex items-center gap-1 px-3 py-2 rounded-lg border text-sm"><Mic className="w-4 h-4" />录音 Record</button>
              ) : (
                <button onClick={stopRec} className="flex items-center gap-1 px-3 py-2 rounded-lg border border-red-400 text-red-600 text-sm"><Square className="w-4 h-4" />停止 Stop</button>
              )}
              {audioBlob && <span className="text-xs text-green-700">已录音 Audio attached</span>}
              <button onClick={run} disabled={loading || (!text.trim() && !audioBlob)}
                className="ml-auto flex items-center gap-1 px-4 py-2 rounded-lg bg-orange-500 text-white text-sm disabled:opacity-50">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}运行智能体 Run agent
              </button>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>

          {(result || loading) && (
            <div className="bg-white rounded-xl border p-4">
              <h2 className="font-semibold mb-3 flex items-center gap-2"><ClipboardList className="w-4 h-4" />智能体步骤 Agent trace
                {result && <span className="text-xs font-normal text-slate-500">{result.trace.length} steps · {(result.totalMs / 1000).toFixed(1)}s · {result.model}</span>}</h2>
              <ol className="space-y-2">
                {(result?.trace || live.steps).map((t) => (
                  <li key={t.step} className="border rounded-lg">
                    <button onClick={() => setOpen({ ...open, [t.step]: !open[t.step] })} className="w-full flex items-center gap-2 p-2 text-left text-sm">
                      {open[t.step] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      <span className="font-mono text-xs text-slate-400">#{t.step}</span>
                      <span className="font-medium">{TOOL_LABEL[t.tool] || t.tool}</span>
                      <span className={`text-xs px-2 rounded-full ${t.enforcedBy === "agent" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}`}>
                        {t.enforcedBy === "agent" ? "AI 自己决定 agent" : "安全规则强制 enforced"}</span>
                      <span className="ml-auto text-xs text-slate-400">{t.ms} ms</span>
                    </button>
                    {t.reason && <p className="px-8 pb-2 text-xs text-slate-600">理由 Reason: {t.reason}</p>}
                    {open[t.step] && <pre className="mx-2 mb-2 p-2 bg-slate-50 rounded text-xs overflow-auto max-h-60">{JSON.stringify(t.output, null, 2)}</pre>}
                  </li>
                ))}
                {loading && (live.running.length ? live.running : [null]).map((r, k) => (
                  <li key={r ? r.step : `plan-${k}`} className="border border-dashed rounded-lg p-2 text-sm flex items-center gap-2 text-slate-600">
                    <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
                    {r
                      ? <span><b>{TOOL_LABEL[r.tool] || r.tool}</b> 进行中… {live.running.length > 1 && <span className="text-xs text-blue-600">（并行 parallel）</span>} {r.reason && <span className="text-xs text-slate-500">理由：{r.reason}</span>}</span>
                      : <span>AI 正在规划下一步 Planning next step…</span>}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {result?.note && (
            <div className="bg-white rounded-xl border p-4 space-y-3">
              <h2 className="font-semibold">英文护理记录（护士可修改）Draft progress note</h2>
              <textarea value={editedNote} onChange={(e) => setEditedNote(e.target.value)} rows={5} className="w-full border rounded-lg p-3 text-sm" />
              {result.note.nativeConfirmation && (
                <div className="text-sm bg-orange-50 rounded-lg p-3"><b>给护工核对的母语版本 For the carer to check:</b><br />{result.note.nativeConfirmation}</div>
              )}
              {!!result.note.suggestedFollowUps?.length && (
                <div className="text-sm"><b>建议跟进（没写进记录）Suggested follow-ups, not added to the note:</b>
                  <ul className="list-disc ml-5">{result.note.suggestedFollowUps.map((f) => <li key={f}>{f}</li>)}</ul></div>
              )}
              {result.verification && !result.verification.supported && (
                <div className="text-sm bg-red-50 text-red-700 rounded-lg p-3"><b>以下句子在原话里找不到依据，请护士删改：</b>
                  <ul className="list-disc ml-5">{result.verification.unsupportedStatements.map((u) => <li key={u}>{u}</li>)}</ul></div>
              )}
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <div className="bg-white rounded-xl border p-4 space-y-3">
            <h2 className="font-semibold flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-green-600" />安全面板 Safety panel</h2>
            {!result && <p className="text-sm text-slate-500">运行后显示每一道安全关卡的结果。Run the agent to see each guardrail.</p>}
            {guardrails.map((g) => (
              <div key={g.label} className="flex gap-2 text-sm">
                {g.ok ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" /> : <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />}
                <div><b>{g.label}</b><br /><span className="text-slate-600">{g.detail}</span></div>
              </div>
            ))}
          </div>

          {s && (
            <div className={`rounded-xl border p-4 space-y-2 ${s.priority === 1 ? "bg-red-50 border-red-200" : "bg-white"}`}>
              <h2 className="font-semibold">{s.jurisdiction === "HK" ? "社署特別事故 Special incident (HK)" : "SIRS 严重事件 Serious incident (AU)"}</h2>
              <p className="text-xs text-slate-500">{s.framework}</p>
              <p className="text-sm">{s.priority === 1 ? `需要上报 Reportable · 期限 ${s.timeframe}`
                : s.priority === 2 ? (s.jurisdiction === "HK" ? `可能需要上报，请护士核对 Possible: ${s.timeframe}` : `需要上报 Reportable · Priority 2 · ${s.timeframe}`)
                : "不需要上报 Not reportable"}</p>
              {s.raisedByRedLine && <p className="text-xs text-amber-700">AI 原本判断：{s.modelPriority ? `P${s.modelPriority}` : "不需要上报"}；红线规则提高了等级。</p>}
              {s.category && <p className="text-sm text-slate-600">{s.category}</p>}
              {s.lockDowngrade && <p className="text-xs flex items-center gap-1 text-red-700"><Lock className="w-3 h-3" />红线锁定：不能降级 Locked</p>}
              <button onClick={tryDowngrade} className="text-xs underline text-slate-600">尝试降级 Try to downgrade</button>
              {lockMsg && <p className="text-xs text-red-700">{lockMsg}</p>}
              {s.rnMustCheck && (
                <div className="mt-2 p-2 rounded-lg bg-amber-50 border border-amber-200 text-xs space-y-1">
                  <p className="font-semibold text-amber-800">红线：护士必须核对 RN must check</p>
                  <ul className="list-disc ml-4 text-amber-800">{s.rnCheckReasons.map((r) => <li key={r}>{r}</li>)}</ul>
                  <div className="flex gap-2 pt-1">
                    <button disabled={!!decision} onClick={() => setRnCheck("report")} className={`px-2 py-1 rounded border ${rnCheck === "report" ? "bg-red-600 text-white" : "bg-white"}`}>要上报 Report</button>
                    <button disabled={!!decision} onClick={() => setRnCheck("no_report")} className={`px-2 py-1 rounded border ${rnCheck === "no_report" ? "bg-slate-700 text-white" : "bg-white"}`}>不用上报 Not reportable</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {result && (
            <div className="bg-white rounded-xl border p-4 space-y-3">
              <h2 className="font-semibold flex items-center gap-2"><UserCheck className="w-4 h-4" />护士确认 RN confirmation</h2>
              <p className="text-xs text-slate-500">工单 {result.review?.ticket} · AI 不能自己定稿，必须由护士确认。</p>
              <input value={rnName} onChange={(e) => setRnName(e.target.value)} placeholder="护士名字 RN name" disabled={!!decision} className="w-full border rounded-lg p-2 text-sm" />
              <div className="flex gap-2">
                <button onClick={() => decide("approved")} disabled={!!decision} className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg bg-green-600 text-white text-sm disabled:opacity-50"><CheckCircle2 className="w-4 h-4" />确认 Approve</button>
                <button onClick={() => decide("returned")} disabled={!!decision} className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg border text-sm disabled:opacity-50"><XCircle className="w-4 h-4" />退回 Return</button>
              </div>
              {decision && <p className="text-sm text-green-700">{decision === "approved" ? "已确认，记入审计日志。" : "已退回护工，记入审计日志。"}</p>}
            </div>
          )}

          <div className="bg-white rounded-xl border p-4">
            <h2 className="font-semibold mb-2">审计日志 Audit log</h2>
            {audit.length === 0 ? <p className="text-sm text-slate-500">暂无记录 No entries yet.</p> : (
              <ul className="space-y-1 text-xs max-h-64 overflow-auto">
                {audit.map((a, i) => <li key={i} className="border-b pb-1"><span className="text-slate-400">{a.at}</span> <b>{a.action}</b> {a.detail}</li>)}
              </ul>
            )}
          </div>
        </aside>
      </main>
      <footer className="max-w-6xl mx-auto px-4 pb-8 text-xs text-slate-500">
        演示只使用虚构数据。AI 仅作辅助，最终临床判断由注册护士作出。Demo uses fictional data only. Final clinical judgement rests with a Registered Nurse.
      </footer>
    </div>
  );
}
