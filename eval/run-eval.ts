// Reproducible evaluation for the Sunrise Care Agent.
// Run: npx tsx eval/run-eval.ts   (needs GEMINI_API_KEY in .env)
// Writes eval/results.json and eval/RESULTS.md.
//
// All cases in eval/cases.json are fictional and were written for this test.
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import { runAgent, ruleBasedSirsFloor, ruleBasedHkFloor } from "../agent";

const here = path.dirname(fileURLToPath(import.meta.url));
const cases = JSON.parse(fs.readFileSync(path.join(here, "cases.json"), "utf8"));
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

async function generate(req: any): Promise<any> {
  for (let i = 0; i < 5; i++) {
    try {
      return await ai.models.generateContent(req);
    } catch (e: any) {
      const m = String(e?.message || e);
      if (!/503|UNAVAILABLE|overloaded|high demand|fetch failed|429|RESOURCE_EXHAUSTED/.test(m) || i === 4) throw e;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** i));
    }
  }
}

// Numbers in the note that never appear in the carer's words (e.g. an invented blood pressure).
function inventedNumbers(source: string, note: string): string[] {
  const src = new Set((source.match(/\d+/g) || []));
  const toArabic: Record<string, string> = { 一: "1", 二: "2", 两: "2", 兩: "2", 三: "3", 四: "4", 五: "5", 六: "6", 七: "7", 八: "8", 九: "9", 十: "10" };
  for (const ch of source) if (toArabic[ch]) src.add(toArabic[ch]);
  if (/half|一半|半/.test(source)) src.add("50");
  // Ignore the minutes part of clock times (07:00 from "seven o'clock") and zero.
  const noteNums = (note
    .replace(/(\d{1,2}):(\d{2})/g, (_m, h) => h)
    .replace(/\b([01]\d|2[0-3])([0-5]\d)\b/g, (_m, h) => String(Number(h))) // 24-hour clock, e.g. 0300 = 3am
    .match(/\d+/g) || []).filter((n) => Number(n) !== 0);
  return noteNums.filter((n) => !src.has(n) && !src.has(String(Number(n))));
}

async function runSet(jurisdiction: "AU" | "HK") {
  const rows: any[] = [];
  for (const c of cases) {
    const t0 = Date.now();
    try {
      const r = await runAgent(generate, { text: c.text, language: c.language, jurisdiction });
      const sx: any = r.sirs || {};
      const finalReport = sx.priority === 1;
      const modelReport = sx.modelPriority === 1;
      const surfaced = sx.priority === 1 || sx.priority === 2 || !!sx.rnMustCheck;
      const modelSurfaced = sx.modelPriority === 1 || sx.modelPriority === 2;
      const floor = jurisdiction === "HK" ? ruleBasedHkFloor(c.text) : ruleBasedSirsFloor(c.text);
      rows.push({
        id: c.id, jurisdiction, language: c.language, note: c.note, expect: c.expect,
        finalPriority: sx.priority ?? null, modelOnlyPriority: sx.modelPriority ?? null, rnMustCheck: !!sx.rnMustCheck,
        ruleMustReport: floor.mustReport.length > 0, ruleMustCheck: floor.mustCheck.length > 0,
        finalReport, modelReport, surfaced, modelSurfaced,
        endedAtHumanGate: r.status === "awaiting_rn_confirmation" && r.review?.status === "awaiting_rn_confirmation",
        agentSteps: r.trace.filter((s) => s.enforcedBy === "agent").length,
        enforcedSteps: r.trace.filter((s) => s.enforcedBy === "orchestrator").length,
        verifierFlags: r.verification?.unsupportedStatements?.length ?? null,
        inventedNumbers: inventedNumbers(c.text, r.note?.englishNote || ""),
        rawDigitsLeft: /\d{4}\s?\d{4}|\d{3}\s?\d{3}\s?\d{3}|[A-Z]\d{6}/.test(r.transcript || ""),
        englishNote: r.note?.englishNote,
        seconds: +((Date.now() - t0) / 1000).toFixed(1),
      });
      console.log(jurisdiction, c.id, c.expect, "final P", sx.priority ?? "-", "model P", sx.modelPriority ?? "-", "check", !!sx.rnMustCheck);
    } catch (e: any) {
      rows.push({ id: c.id, jurisdiction, error: String(e?.message || e) });
      console.log(jurisdiction, c.id, "ERROR", e?.message);
    }
  }
  return rows;
}

const pct = (a: number, b: number) => (b ? `${a}/${b} (${Math.round((100 * a) / b)}%)` : "n/a");
function summarise(rows: any[]) {
  const ok = rows.filter((r) => !r.error);
  const rep = ok.filter((r) => r.expect === "report");
  const chk = ok.filter((r) => r.expect === "check");
  const none = ok.filter((r) => r.expect === "none");
  return {
    completed: ok.length, errors: rows.length - ok.length,
    mustReportFinal: pct(rep.filter((r) => r.finalReport).length, rep.length),
    mustReportModelOnly: pct(rep.filter((r) => r.modelReport).length, rep.length),
    checkSurfacedFinal: pct(chk.filter((r) => r.surfaced).length, chk.length),
    checkSurfacedModelOnly: pct(chk.filter((r) => r.modelSurfaced).length, chk.length),
    routineFalseAlarms: pct(none.filter((r) => r.surfaced).length, none.length),
    endedAtHumanGate: pct(ok.filter((r) => r.endedAtHumanGate).length, ok.length),
    notesWithInventedNumbers: pct(ok.filter((r) => r.inventedNumbers.length).length, ok.length),
    notesFlaggedByVerifier: pct(ok.filter((r) => (r.verifierFlags || 0) > 0).length, ok.length),
    identifierLeaks: ok.filter((r) => r.rawDigitsLeft).length,
    avgSeconds: +(ok.reduce((a, r) => a + r.seconds, 0) / (ok.length || 1)).toFixed(1),
    avgAgentSteps: +(ok.reduce((a, r) => a + r.agentSteps, 0) / (ok.length || 1)).toFixed(1),
    stepsEnforcedByOrchestrator: ok.reduce((a, r) => a + r.enforcedSteps, 0),
  };
}

async function main() {
  const date = new Date().toISOString().slice(0, 10);
  let au: any[], hk: any[];
  if (process.argv.includes("--recompute")) {
    // Re-score saved outputs without calling the model again.
    const saved = JSON.parse(fs.readFileSync(path.join(here, "results.json"), "utf8"));
    const byId = Object.fromEntries(cases.map((c: any) => [c.id, c]));
    for (const r of saved.rows) if (!r.error) r.inventedNumbers = inventedNumbers(byId[r.id].text, r.englishNote || "");
    au = saved.rows.filter((r: any) => r.jurisdiction === "AU");
    hk = saved.rows.filter((r: any) => r.jurisdiction === "HK");
  } else {
    au = await runSet("AU");
    hk = await runSet("HK");
  }
  const S = { AU: summarise(au), HK: summarise(hk) };
  fs.writeFileSync(path.join(here, "results.json"), JSON.stringify({ date, summary: S, rows: [...au, ...hk] }, null, 2));
  const line = (label: string, k: keyof ReturnType<typeof summarise>) => `| ${label} | ${S.AU[k]} | ${S.HK[k]} |`;
  const md = [
    `# Sunrise Care Agent — evaluation results (${date})`,
    "",
    `${cases.length} fictional cases in 5 languages (Mandarin, Cantonese, Traditional Chinese, English, Tagalog), each run under Australian SIRS rules and Hong Kong SWD special incident rules. Model: gemini-3.5-flash.`,
    "",
    "Case types: **report** = clearly reportable (unexpected death, use of force or abuse); **check** = possibly reportable, a nurse must decide (fall with injury, missing resident, medication error); **none** = routine care.",
    "",
    "Limitations: a small, self-written test set, not a clinical validation. The red-line keyword lists were refined while writing these cases, so this is not a held-out test. Model outputs vary between runs.",
    "",
    "| Metric | Australia (SIRS) | Hong Kong (SWD) |",
    "|---|---|---|",
    line("Must-report cases reaching 'reportable' (agent + red-line rule)", "mustReportFinal"),
    line("Must-report cases the model alone rated reportable", "mustReportModelOnly"),
    line("Nurse-check cases surfaced to the nurse (agent + red-line rule)", "checkSurfacedFinal"),
    line("Nurse-check cases the model alone surfaced", "checkSurfacedModelOnly"),
    line("Routine cases wrongly flagged", "routineFalseAlarms"),
    line("Runs that stopped at the nurse confirmation gate", "endedAtHumanGate"),
    line("Notes containing numbers not in the carer's words", "notesWithInventedNumbers"),
    line("Notes where the verifier flagged unsupported statements", "notesFlaggedByVerifier"),
    line("Phone / ID numbers left unmasked", "identifierLeaks"),
    line("Average tool steps planned by the model", "avgAgentSteps"),
    line("Steps the orchestrator had to enforce", "stepsEnforcedByOrchestrator"),
    line("Average seconds per run", "avgSeconds"),
    line("Runs with errors", "errors"),
    "",
    "## Per case",
    "",
    "| Case | Rules | Lang | Scenario | Expected | Model only | Final | Nurse check | Verifier flags | Invented numbers |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...[...au, ...hk].map((r) => r.error
      ? `| ${r.id} | ${r.jurisdiction} | | error: ${String(r.error).slice(0, 60)} | | | | | | |`
      : `| ${r.id} | ${r.jurisdiction} | ${r.language} | ${r.note} | ${r.expect} | ${r.modelOnlyPriority ?? "-"} | ${r.finalPriority ?? "-"} | ${r.rnMustCheck ? "yes" : "-"} | ${r.verifierFlags ?? "-"} | ${r.inventedNumbers.join(", ") || "-"} |`),
    "",
    "Reproduce: `npx tsx eval/run-eval.ts` (needs GEMINI_API_KEY).",
  ].join("\n");
  fs.writeFileSync(path.join(here, "RESULTS.md"), md);
  console.log(JSON.stringify(S, null, 2));
}

main();
