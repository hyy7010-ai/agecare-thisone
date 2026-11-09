# Sunrise Care — an AI documentation agent for multilingual aged care workers

Sunrise Care lets an aged care worker describe what happened in their own language, by voice or text.
An AI agent turns it into an objective English progress note, checks every sentence against the worker's own words,
decides whether it is a reportable serious incident, and hands everything to a Registered Nurse.
**Nothing becomes part of the record until a nurse confirms it.**

> Entry for the Cyberport **Hong Kong AI Agent Challenge 2026 (智賦香江 AI 智能體應用大賽)**, Open Track.

## The problem

- Many aged care workers in Australia and Hong Kong are not native English speakers, but clinical records are often written in English.
- Writing notes takes time away from residents, and translated notes can add or lose facts.
- Serious incidents (for example a fall with a head strike) have strict reporting deadlines. Under Australia's Serious Incident Response Scheme (SIRS), Priority 1 incidents must be reported within 24 hours.

## How the agent works

```
Carer voice / text (Mandarin, Cantonese, Traditional Chinese, Tagalog, English)
        │  privacy masking (phone, ID and HKID-style numbers removed before AI)
        ▼
 ┌──────────────── Gemini agent loop (function calling, max 8 steps) ────────────────┐
 │ transcribe_audio → draft_progress_note → verify_against_source → assess_incident │
 │                                         (redraft once if unsupported)             │
 │                        route_for_human_review  ← the only way to finish           │
 └──────────────────────────────────────────────────────────────────────────────────┘
        ▼
 Registered Nurse reviews, edits, approves or returns  →  audit log
```

The model plans its own tool calls and gives a reason for each one. The server runs the tools and records every step.
If the model skips a mandatory step, the orchestrator runs it anyway and marks it as "enforced".

## Safety by design

| Guardrail | How it is enforced |
|---|---|
| Human gate | The agent has no tool that finalises a record or contacts a regulator. Every run ends at "awaiting RN confirmation". |
| Red line | Rule-based checks (English, Simplified and Traditional Chinese, Tagalog keywords) run beside the model. **Must report:** unexpected death and use of force / abuse can never be rated below "reportable"; the UI blocks downgrades and logs the attempt. **Nurse must check:** a fall with injury, a missing resident or a medication error is flagged, and the nurse cannot approve the note without recording a reporting decision. |
| Anti-fabrication | A separate verifier call lists any statement in the note that is not supported by the carer's own words. The note prompt also forbids adding vitals, notifications or diagnoses; missing follow-ups go to a separate list. |
| Back-translation | The note is translated back into the carer's language so they can check it. |
| Privacy | Identifier masking before any AI call. The demo uses fictional data only. |
| Bounded autonomy | Max 8 tool calls per run. The server injects the carer's source text into each tool, so the model cannot alter what the carer said. |
| Audit | Every run, approval, return and blocked downgrade is logged. |

## Two rule sets: Hong Kong and Australia

| | Hong Kong (default in the demo) | Australia |
|---|---|---|
| Source | Social Welfare Department, *Code of Practice for Residential Care Homes* (June 2024 revised edition), Special Incident Report annex | Aged Care Quality and Safety Commission, Serious Incident Response Scheme (SIRS) |
| Deadline | Report to the Licensing Office of Residential Care Homes for the Elderly within **3 calendar days, including public holidays** | Priority 1 within **24 hours**, Priority 2 within **30 days** |
| Must report | Type (1) unusual death, Type (3) established or suspected abuse | Unexpected death, unreasonable use of force |
| Nurse must check | Possible Type (1) serious injury (if sent to hospital), Type (2) missing resident, Type (5) serious medication incident | Fall with injury, possible unexplained absence, medication error (possible neglect) |

A fall is not automatically reportable in either system. The agent never decides that on its own: it flags the case and the nurse records the decision.

## Evaluation

`eval/` holds 26 fictional cases in 5 languages and a script that runs each one under both rule sets.
See [`eval/RESULTS.md`](eval/RESULTS.md) for the latest numbers. Reproduce with `npx tsx eval/run-eval.ts`.

## Pre-existing work vs. new contest work

| Built before the contest (July 2026) | Built for this contest (November 2026) |
|---|---|
| Carer and RN app: dashboard, resident profiles, body diagram, roster guard, family updates | `agent.ts`: function-calling agent loop, tool definitions, orchestrator for mandatory steps |
| Single-prompt endpoints: `/api/audio-note`, `/api/care-note`, `/api/sirs`, `/api/vision`, shift summary and handover | Rule-based SIRS Priority 1 floor that the model cannot lower |
| Australian aged care terminology rules and anti-fabrication prompt | Sentence-level verifier against the carer's own words |
| Red Line Lockdown UI for SIRS Priority 1 | `/agent` console: step trace, safety panel, RN approve/return, audit log |
| | Cantonese and Traditional Chinese (Hong Kong) input and confirmation; HKID-style masking |
| | Hong Kong SWD special incident rule set, selectable beside Australian SIRS |
| | Live step streaming, nurse reporting-decision gate, `eval/` test set and script |

The July 2026 version won **Best of the Year – Vibe Coding** at the Google AI Vibe-a-thon 2026 (395 entries).

## Models, APIs and tools used

- Google Gemini (`gemini-3.5-flash`) through the `@google/genai` SDK: transcription, note drafting, verification, SIRS assessment and agent planning (function calling).
- Google Search grounding in the pre-existing `/api/sirs` endpoint.
- React 19, Vite, Tailwind CSS, Express, Firebase Firestore (pre-existing app).
- Code written with AI coding assistants (Google AI Studio, Claude Code) under the author's direction.
- No real resident data is used. All sample inputs are fictional.

## Try it

1. `npm install`
2. Create `.env` with `GEMINI_API_KEY=...`
3. `npm run dev`, then open `http://localhost:3000/agent`
4. Choose Hong Kong or Australia rules, pick a fictional sample (Mandarin, Cantonese or English) or record your own voice, and press **Run agent**. Steps appear live as the agent works.

The original carer / RN app is at `http://localhost:3000/` (demo logins on the sign-in page).

## Limitations

- The Hong Kong rule set follows the published Special Incident Report categories; it has not been reviewed by a Hong Kong care home operator or the Social Welfare Department.
- The older single-prompt endpoints from July 2026 (`/api/audio-note`, `/api/sirs`) still treat a fall with injury as SIRS Priority 1. The new agent does not; those endpoints should be aligned.
- The agent assists documentation only. It does not make clinical decisions.
- Not yet tested with real aged care staff or residents.
