// Sunrise Care Agent — added for the Cyberport "Hong Kong AI Agent Challenge" (Nov 2026).
//
// Everything in this file is NEW contest work. The pre-existing features
// (/api/audio-note, /api/care-note, /api/sirs, ...) are untouched.
//
// What makes this an agent rather than a single prompt:
//   - Gemini plans its own steps and calls tools through function calling.
//   - Each tool runs server-side and its result is fed back to the model.
//   - Every step is recorded in a trace the UI shows to the carer and RN.
//
// Safety is enforced in code, not left to the model:
//   1. Human gate: the agent can only end by routing to human review.
//      It has no tool that finalises a record or notifies a regulator.
//   2. Red line: rule-based checks run beside the model. Clearly reportable events
//      (unexpected death, use of force / abuse) can never be rated below Priority 1.
//      Possibly reportable events (fall with injury, missing resident, medication
//      error) are flagged for an RN decision and the flag cannot be dropped.
//   3. Anti-fabrication: a separate verifier call checks every sentence of the
//      English note against the carer's own words and lists anything unsupported.
//   4. Privacy: phone numbers, Medicare-style IDs and HKID-style numbers are
//      masked before any text reaches the model.
//   5. Bounded loop: at most MAX_STEPS tool calls; if the model stops early,
//      the remaining mandatory steps are run by the orchestrator.

import type { Express } from "express";
import multer from "multer";
import { Type } from "@google/genai";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const MODEL = "gemini-3.5-flash";
const MAX_STEPS = 8;

type GenerateFn = (request: any) => Promise<any>;

export type TraceStep = {
  step: number;
  tool: string;
  reason: string;
  args: Record<string, any>;
  output: Record<string, any>;
  ms: number;
  enforcedBy: "agent" | "orchestrator";
};

const LANGUAGE_HINTS: Record<string, string> = {
  en: "English",
  zh: "Mandarin Chinese (write the confirmation in Simplified Chinese)",
  "zh-HK": "Written Chinese for Hong Kong (write the confirmation in Traditional Chinese)",
  yue: "Cantonese (write the confirmation in Traditional Chinese, Hong Kong usage)",
  tl: "Tagalog",
};

// ---------- deterministic guardrails ----------

export function maskIdentifiers(text: string): { text: string; masked: string[] } {
  const masked: string[] = [];
  let out = text;
  const rules: [RegExp, string][] = [
    [/\b[A-Z]{1,2}\d{6}\(?[0-9A]\)?/g, "[HKID_REDACTED]"],
    [/\b\d{10,11}\b/g, "[ID_REDACTED]"],
    [/(\+?61|0)4\d{2}\s?\d{3}\s?\d{3}\b/g, "[PHONE_REDACTED]"],
    [/(\+?852[\s-]?)?\b[569]\d{3}[\s-]?\d{4}\b/g, "[PHONE_REDACTED]"],
  ];
  for (const [re, label] of rules) {
    out = out.replace(re, (m) => {
      masked.push(label);
      return label;
    });
  }
  return { text: out, masked };
}

// Keywords in English, Simplified and Traditional Chinese, and Tagalog.
const FALL = /(fall|fell|found .{0,30}on (the )?floor|slipped|nahulog|natumba|nadulas|滑到地上|坐在地上|躺在地上|跌倒|摔倒|跌落|摔了|跌咗|仆倒|滑倒)/i;
const INJURY =
  /(head|hit|bleed|blood|fractur|bruis|lacerat|skin tear|swelling|pain|unconscious|撞到头|撞到頭|撞头|撞頭|头部|頭部|流血|出血|骨折|淤青|瘀青|肿|腫|痛|昏迷|伤口|傷口|擦伤|擦傷|tumama|dugo|sugat|masakit|bali)/i;
const DEATH = /(unexpected death|passed away|died|deceased|namatay|pumanaw|去世|死亡|过身|過身)/i;
const FORCE =
  /((staff|carer|worker|nurse|another resident|visitor|someone|son|daughter)\b.{0,40}\b(hit|slapped|punched|kicked|shoved|pushed|grabbed)\b(?! (his|her|their) head)|\b(slapped|punched|kicked|shoved)\b|\b(abuse|abused|restrained)\b|打了|打咗|推了|推咗|掌掴|掌摑|虐待|约束|約束|sinampal|sinuntok|tinulak)/i;

const MISSING = /(missing|wandered off|cannot be found|走失|失蹤|失踪|找不到|搵唔到)/i;
const MEDICATION = /(wrong (drug|medication|tablet)|overdose|missed (a )?dose|食錯藥|食错药|吃错药|吃錯藥|漏藥|漏药|派錯藥|派错药)/i;

// Red-line result:
//   mustReport: clearly reportable. The final priority can never be lower than 1.
//   mustCheck: possibly reportable. An RN must record a decision; the flag cannot be dropped.
// Falls are NOT automatically reportable under SIRS: a fall is reportable only when it
// fits a SIRS category (e.g. unexpected death, unreasonable use of force, neglect).
export type RedLine = { mustReport: string[]; mustCheck: string[] };

export function ruleBasedSirsFloor(text: string): RedLine {
  const mustReport: string[] = [];
  const mustCheck: string[] = [];
  if (DEATH.test(text)) mustReport.push("Possible unexpected death");
  if (FORCE.test(text)) mustReport.push("Possible unreasonable use of force");
  if (FALL.test(text) && INJURY.test(text))
    mustCheck.push("Fall with injury: RN to check whether it fits a SIRS category (e.g. neglect, use of force, unexpected death)");
  if (MISSING.test(text)) mustCheck.push("Possible unexplained absence from care");
  if (MEDICATION.test(text)) mustCheck.push("Medication error: RN to check for possible neglect");
  return { mustReport, mustCheck };
}

// Hong Kong: Social Welfare Department, Code of Practice for Residential Care Homes
// (Elderly Persons / Nursing Homes), June 2024 revised edition, "Special Incident Report"
// annex. A special incident must be reported to the Licensing Office of Residential
// Care Homes for the Elderly (LORCHE) within 3 calendar days, including public holidays.
// mustReport = clearly a reportable special incident. mustCheck = an RN must check it against
// the Code (for example, a fall with injury becomes Type (1) if the resident is sent to hospital).
export function ruleBasedHkFloor(text: string): RedLine {
  const mustReport: string[] = [];
  const mustCheck: string[] = [];
  if (DEATH.test(text)) mustReport.push("Type (1): unusual death of a resident");
  if (FORCE.test(text)) mustReport.push("Type (3): established or suspected abuse");
  if (MISSING.test(text)) mustCheck.push("Type (2): missing resident, report if police assistance is needed");
  if (FALL.test(text) && INJURY.test(text)) mustCheck.push("Possible Type (1): serious injury if the resident is sent to hospital");
  if (MEDICATION.test(text)) mustCheck.push("Possible Type (5): serious medication incident if admitted to hospital");
  return { mustReport, mustCheck };
}

export type Jurisdiction = "AU" | "HK";
const FRAMEWORK: Record<Jurisdiction, { name: string; p1: string; p2: string }> = {
  AU: { name: "Australia SIRS (Aged Care Quality and Safety Commission)", p1: "24 hours", p2: "30 days" },
  HK: {
    name: "Hong Kong SWD Code of Practice for RCHEs: Special Incident Report to LORCHE",
    p1: "3 calendar days (incl. public holidays)",
    p2: "3 calendar days (incl. public holidays)",
  },
};

function parseJson(text: string): any {
  const cleaned = String(text || "").replace(/```json\n?/g, "").replace(/```/g, "").trim();
  const a = cleaned.indexOf("{");
  const b = cleaned.lastIndexOf("}");
  return JSON.parse(a >= 0 && b > a ? cleaned.slice(a, b + 1) : cleaned);
}

// ---------- tool implementations ----------

function makeTools(generate: GenerateFn, ctx: { audio?: { data: string; mimeType: string }; language: string; jurisdiction: Jurisdiction }) {
  const langHint = LANGUAGE_HINTS[ctx.language] || LANGUAGE_HINTS.en;

  return {
    async transcribe_audio() {
      if (!ctx.audio) return { error: "No audio was provided. Use the typed text instead." };
      const r = await generate({
        model: MODEL,
        contents: {
          parts: [
            {
              text:
                "Transcribe this aged care worker's voice note word for word in the language spoken. " +
                "Do not translate, summarise or add anything. Return JSON {\"transcript\": string, \"detectedLanguage\": string}.",
            },
            { inlineData: ctx.audio },
          ],
        },
        config: { responseMimeType: "application/json", temperature: 0 },
      });
      const out = parseJson(r.text);
      const m = maskIdentifiers(out.transcript || "");
      return { transcript: m.text, detectedLanguage: out.detectedLanguage, maskedIdentifiers: m.masked.length };
    },

    async draft_progress_note({ transcript }: { transcript: string }) {
      const r = await generate({
        model: MODEL,
        contents: `You are an aged care documentation assistant.
Turn the carer's words into an objective English progress note.
Rules:
- Only document what the carer explicitly said. Never add vitals, notifications, assessments or diagnoses.
- Describe observations, do not diagnose ("area of redness", not "pressure injury").
- Use "resident", never "patient". Keep it short.
- If a usual follow-up was not mentioned (e.g. neuro obs after a head strike), put it in suggestedFollowUps, not in the note.
- nativeConfirmation: translate the English note back into ${langHint} so the carer can check it. Empty if the carer spoke English.
Carer's words: """${transcript}"""
Return JSON {"englishNote": string, "nativeConfirmation": string, "suggestedFollowUps": string[]}.`,
        config: { responseMimeType: "application/json", temperature: 0.1 },
      });
      return parseJson(r.text);
    },

    async verify_against_source({ transcript, englishNote }: { transcript: string; englishNote: string }) {
      const r = await generate({
        model: MODEL,
        contents: `You are an auditor. Compare an English progress note with the carer's original words (any language).
List every statement in the note that is NOT supported by the original words (added facts, numbers, actions, diagnoses).
Original words: """${transcript}"""
Note: """${englishNote}"""
Return JSON {"supported": boolean, "unsupportedStatements": string[]}.`,
        config: { responseMimeType: "application/json", temperature: 0 },
      });
      return parseJson(r.text);
    },

    async assess_incident({ transcript, englishNote }: { transcript: string; englishNote: string }) {
      const hk = ctx.jurisdiction === "HK";
      const floor = hk ? ruleBasedHkFloor(`${transcript}\n${englishNote}`) : ruleBasedSirsFloor(`${transcript}\n${englishNote}`);
      const prompt = hk
        ? `Classify this residential care home event under Hong Kong's Social Welfare Department Code of Practice for Residential Care Homes (Elderly Persons), Special Incident Report.
Types: (1) unusual death / repeated injuries / incident causing death or serious injury (e.g. resident sent to hospital for treatment); (2) missing resident requiring police assistance; (3) established or suspected abuse (physical, psychological, neglect, financial, abandonment, sexual); (4) dispute requiring police assistance; (5) serious medical or drug incident with hospital admission; (6) other incidents affecting operation (power, water, fire, outbreak...); (7) others (e.g. serious data breach, media attention).
Reportable special incidents must reach LORCHE within 3 calendar days including public holidays.
Priority 1 = clearly a reportable special incident. Priority 2 = possibly reportable, RN must check (e.g. injury where hospital transfer is not yet known). null = not a special incident.
Do not assume facts that are not stated.
Event: """${englishNote}"""
Return JSON {"isReportable": boolean, "category": string (e.g. "Type (1) ..."), "priority": 1 | 2 | null, "rationale": string, "confidence": number}.`
        : `Classify this aged care event under Australia's Serious Incident Response Scheme (SIRS).
Priority 1 = injury needing medical/psychological treatment, unexpected death, or suspected criminal conduct (report within 24 hours).
Priority 2 = other reportable incidents (within 30 days).
An accidental fall is never "Neglect".
Event: """${englishNote}"""
Return JSON {"isReportable": boolean, "category": string, "priority": 1 | 2 | null, "rationale": string, "confidence": number}.`;
      const r = await generate({ model: MODEL, contents: prompt, config: { responseMimeType: "application/json", temperature: 0.1 } });
      const model = parseJson(r.text);
      const modelPriority: number | null = model.priority ?? null;
      let priority = modelPriority;
      let raisedByRedLine = false;
      if (floor.mustReport.length && priority !== 1) {
        priority = 1;
        raisedByRedLine = true;
      }
      const fw = FRAMEWORK[ctx.jurisdiction];
      const weakCategory = !model.category || /not applicable|^none$|n\/a|not reportable|not a special/i.test(model.category);
      const isReportable = priority === 1 || (!hk && priority === 2) || (!!model.isReportable && priority !== null);
      return {
        ...model,
        framework: fw.name,
        jurisdiction: ctx.jurisdiction,
        category: raisedByRedLine && weakCategory ? `${floor.mustReport.join("; ")} (set by red-line rule)` : model.category,
        modelPriority,
        isReportable,
        priority: isReportable ? priority : null,
        timeframe: !isReportable ? null : priority === 1 ? fw.p1 : fw.p2,
        mustReportReasons: floor.mustReport,
        rnMustCheck: floor.mustCheck.length > 0 && !(isReportable && priority === 1),
        rnCheckReasons: floor.mustCheck,
        raisedByRedLine,
        lockDowngrade: priority === 1,
      };
    },

    async route_for_human_review({ summary }: { summary: string }) {
      return {
        status: "awaiting_rn_confirmation",
        ticket: `RV-${Date.now().toString(36).toUpperCase()}`,
        summary,
        note: "Nothing is saved to the record or sent to a regulator until a Registered Nurse confirms.",
      };
    },
  };
}

const TOOL_DECLARATIONS = [
  {
    name: "transcribe_audio",
    description: "Transcribe the carer's voice note word for word. Call this first only when audio is attached.",
    parameters: { type: Type.OBJECT, properties: { reason: { type: Type.STRING } }, required: ["reason"] },
  },
  {
    name: "draft_progress_note",
    description: "Draft an objective English progress note from the carer's own words, with a back-translation for the carer.",
    parameters: {
      type: Type.OBJECT,
      properties: { transcript: { type: Type.STRING }, reason: { type: Type.STRING } },
      required: ["transcript", "reason"],
    },
  },
  {
    name: "verify_against_source",
    description: "Check every statement in the drafted note against the carer's original words and list unsupported statements.",
    parameters: {
      type: Type.OBJECT,
      properties: { transcript: { type: Type.STRING }, englishNote: { type: Type.STRING }, reason: { type: Type.STRING } },
      required: ["transcript", "englishNote", "reason"],
    },
  },
  {
    name: "assess_incident",
    description: "Decide whether the event is a reportable serious incident under the active framework (Australia SIRS or Hong Kong SWD special incidents) and its priority.",
    parameters: {
      type: Type.OBJECT,
      properties: { transcript: { type: Type.STRING }, englishNote: { type: Type.STRING }, reason: { type: Type.STRING } },
      required: ["transcript", "englishNote", "reason"],
    },
  },
  {
    name: "route_for_human_review",
    description: "Send the draft to a Registered Nurse for confirmation. This is the only way to finish.",
    parameters: {
      type: Type.OBJECT,
      properties: { summary: { type: Type.STRING }, reason: { type: Type.STRING } },
      required: ["summary", "reason"],
    },
  },
];

const SYSTEM = `You are Sunrise Care, a documentation agent for aged care workers.
Goal: turn a carer's voice note or typed note (any language) into a safe English progress note and route it to a Registered Nurse.
Plan your own steps using the tools. A safe run usually is:
transcribe_audio (only if audio is attached) -> draft_progress_note -> verify_against_source -> assess_incident -> route_for_human_review.
If verify_against_source finds unsupported statements, call draft_progress_note again once with stricter wording before continuing.
Always give a short plain-English "reason" argument explaining why you are calling the tool.
You cannot finalise a record or notify anyone. You must finish with route_for_human_review.`;

export type AgentInput = {
  text?: string;
  audio?: { data: string; mimeType: string };
  language?: string;
  jurisdiction?: Jurisdiction;
};
export type AgentEvent =
  | { type: "tool_start"; step: number; tool: string; reason: string; enforcedBy: TraceStep["enforcedBy"] }
  | { type: "step"; step: TraceStep };

export async function runAgent(generate: GenerateFn, input: AgentInput, onEvent: (e: AgentEvent) => void = () => {}) {
  const started = Date.now();
  const language = String(input.language || "en");
  const typed = maskIdentifiers(String(input.text || "").trim());
  const audio = input.audio;
  if (!typed.text && !audio) throw Object.assign(new Error("Please type a note or record audio."), { status: 400 });

  const jurisdiction: Jurisdiction = input.jurisdiction === "HK" ? "HK" : "AU";
  const tools = makeTools(generate, { audio, language, jurisdiction }) as Record<string, (args: any) => Promise<any>>;
  const trace: TraceStep[] = [];
  const state: Record<string, any> = { transcript: typed.text, maskedIdentifiers: typed.masked.length };

  const runTool = async (name: string, args: any, enforcedBy: TraceStep["enforcedBy"]) => {
    const t0 = Date.now();
    const { reason = "", ...rest } = args || {};
    onEvent({ type: "tool_start", step: trace.length + 1, tool: name, reason, enforcedBy });
    // Fill arguments from state so the model cannot pass in altered source text.
    const callArgs: any = { ...rest };
    if (["draft_progress_note", "verify_against_source", "assess_incident"].includes(name)) callArgs.transcript = state.transcript;
    if (["verify_against_source", "assess_incident"].includes(name)) callArgs.englishNote = state.note?.englishNote || "";
    let output: any;
    try {
      output = tools[name] ? await tools[name](callArgs) : { error: `Unknown tool ${name}` };
    } catch (e: any) {
      output = { error: String(e?.message || e) };
    }
    if (name === "transcribe_audio" && output.transcript) {
      state.transcript = [state.transcript, output.transcript].filter(Boolean).join("\n");
      state.detectedLanguage = output.detectedLanguage;
    }
    if (name === "draft_progress_note" && output.englishNote) state.note = output;
    if (name === "verify_against_source" && !output.error) state.verification = output;
    if (name === "assess_incident" && !output.error) state.sirs = output;
    if (name === "route_for_human_review") state.review = output;
    const step: TraceStep = { step: trace.length + 1, tool: name, reason, args: rest, output, ms: Date.now() - t0, enforcedBy };
    trace.push(step);
    onEvent({ type: "step", step });
    return output;
  };

  // Agent loop: Gemini plans, the server executes.
  const contents: any[] = [
    {
      role: "user",
      parts: [
        {
          text:
            `Carer language setting: ${LANGUAGE_HINTS[language] || language}.\n` +
            `Incident framework: ${FRAMEWORK[jurisdiction].name}.\n` +
            (audio ? "A voice note is attached (call transcribe_audio).\n" : "No audio attached.\n") +
            (typed.text ? `Typed note: """${typed.text}"""` : ""),
        },
      ],
    },
  ];
  for (let i = 0; i < MAX_STEPS && !state.review; i++) {
    const r = await generate({
      model: MODEL,
      contents,
      config: { systemInstruction: SYSTEM, tools: [{ functionDeclarations: TOOL_DECLARATIONS }], temperature: 0 },
    });
    const calls = r.functionCalls || [];
    if (!calls.length) break;
    contents.push(r.candidates?.[0]?.content || { role: "model", parts: calls.map((c: any) => ({ functionCall: c })) });
    const responses = [];
    for (const call of calls) {
      const output = await runTool(call.name, call.args, "agent");
      responses.push({ functionResponse: { name: call.name, response: { output } } });
    }
    contents.push({ role: "user", parts: responses });
  }

  // Orchestrator: mandatory safety steps the agent skipped are run anyway.
  if (audio && !trace.some((s) => s.tool === "transcribe_audio"))
    await runTool("transcribe_audio", { reason: "Mandatory: audio attached" }, "orchestrator");
  if (!state.note) await runTool("draft_progress_note", { reason: "Mandatory: no note drafted" }, "orchestrator");
  if (!state.verification) await runTool("verify_against_source", { reason: "Mandatory safety check" }, "orchestrator");
  if (!state.sirs) await runTool("assess_incident", { reason: "Mandatory incident check" }, "orchestrator");
  if (!state.review)
    await runTool("route_for_human_review", { summary: state.note?.englishNote || "", reason: "Mandatory human gate" }, "orchestrator");

  return {
    status: "awaiting_rn_confirmation",
    jurisdiction,
    transcript: state.transcript,
    detectedLanguage: state.detectedLanguage,
    maskedIdentifiers: state.maskedIdentifiers,
    note: state.note,
    verification: state.verification,
    sirs: state.sirs,
    review: state.review,
    trace,
    totalMs: Date.now() - started,
    model: MODEL,
  };
}

function friendlyError(error: any) {
  const msg = String(error?.message || "Agent failed");
  return /api[_ ]?key|key is missing/i.test(msg) ? "AI service is not configured (missing GEMINI_API_KEY)." : msg;
}

export function registerAgentRoutes(app: Express, generate: GenerateFn) {
  app.post("/api/agent/run", upload.single("audio"), async (req, res) => {
    const input: AgentInput = {
      text: req.body.text,
      language: req.body.language,
      jurisdiction: req.body.jurisdiction === "HK" ? "HK" : "AU",
      audio: req.file
        ? {
            data: req.file.buffer.toString("base64"),
            mimeType: req.file.mimetype.includes("mp4") || req.file.mimetype.includes("m4a") ? "audio/mp4" : "audio/webm",
          }
        : undefined,
    };
    const stream = req.query.stream === "1";
    if (!stream) {
      try {
        res.json({ result: await runAgent(generate, input) });
      } catch (error: any) {
        console.error("Agent API Error:", error);
        res.status(error?.status || 500).json({ error: friendlyError(error) });
      }
      return;
    }
    // Streaming mode: one JSON object per line, so the page can show each step as it happens.
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    const send = (obj: any) => res.write(JSON.stringify(obj) + "\n");
    try {
      const result = await runAgent(generate, input, send);
      send({ type: "result", result });
    } catch (error: any) {
      console.error("Agent API Error:", error);
      send({ type: "error", error: friendlyError(error) });
    }
    res.end();
  });
}
