# Sunrise Care — an AI documentation agent for multilingual aged care workers

Sunrise Care lets an aged care worker describe what happened in their own language, by voice or text.
An AI agent turns it into an objective English progress note, checks every sentence against the worker's own words,
decides whether it is a reportable serious incident, and hands everything to a Registered Nurse.
**Nothing becomes part of the record until a nurse confirms it.**

> Entry for the Cyberport **Hong Kong AI Agent Challenge 2026 (智賦香江 AI 智能體應用大賽)**, Healthcare & Wellness track.

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
 │ transcribe_audio → draft_progress_note → verify_against_source → assess_sirs →   │
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
| SIRS red line | A rule-based check (English, Simplified and Traditional Chinese keywords) sets a Priority 1 floor for falls with injury, head strikes, bleeding, fractures, unexpected death and use of force. The model can raise a priority, never lower it. The UI blocks downgrades and logs the attempt. |
| Anti-fabrication | A separate verifier call lists any statement in the note that is not supported by the carer's own words. The note prompt also forbids adding vitals, notifications or diagnoses; missing follow-ups go to a separate list. |
| Back-translation | The note is translated back into the carer's language so they can check it. |
| Privacy | Identifier masking before any AI call. The demo uses fictional data only. |
| Bounded autonomy | Max 8 tool calls per run. The server injects the carer's source text into each tool, so the model cannot alter what the carer said. |
| Audit | Every run, approval, return and blocked downgrade is logged. |

## Pre-existing work vs. new contest work

| Built before the contest (July 2026) | Built for this contest (November 2026) |
|---|---|
| Carer and RN app: dashboard, resident profiles, body diagram, roster guard, family updates | `agent.ts`: function-calling agent loop, tool definitions, orchestrator for mandatory steps |
| Single-prompt endpoints: `/api/audio-note`, `/api/care-note`, `/api/sirs`, `/api/vision`, shift summary and handover | Rule-based SIRS Priority 1 floor that the model cannot lower |
| Australian aged care terminology rules and anti-fabrication prompt | Sentence-level verifier against the carer's own words |
| Red Line Lockdown UI for SIRS Priority 1 | `/agent` console: step trace, safety panel, RN approve/return, audit log |
| | Cantonese and Traditional Chinese (Hong Kong) input and confirmation; HKID-style masking |

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
4. Pick a fictional sample (Mandarin, Cantonese or English), or record your own voice, and press **Run agent**.

The original carer / RN app is at `http://localhost:3000/` (demo logins on the sign-in page).

## Limitations

- SIRS rules are Australian. A Hong Kong deployment would need to map them to Hong Kong's incident reporting rules for residential care homes; this has not been built yet.
- The agent assists documentation only. It does not make clinical decisions.
- Not yet tested with real aged care staff or residents.
