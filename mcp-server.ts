// Sunrise Care MCP server — added for the Cyberport AI Agent Challenge (Nov 2026).
//
// Exposes the same tools the Sunrise Care agent uses as Model Context Protocol
// tools, so other agents and MCP clients (e.g. Claude Desktop, Cursor) can reuse
// them. The safety rules stay inside each tool: the red-line floor cannot be
// lowered and nothing here finalises a record or contacts a regulator.
//
// Run:  npx tsx mcp-server.ts      (stdio transport; needs GEMINI_API_KEY)
import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { GoogleGenAI } from "@google/genai";
import { makeTools, runAgent, maskIdentifiers, ruleBasedHkFloor, ruleBasedSirsFloor } from "./agent";

let ai: GoogleGenAI | null = null;
const generate = (req: any) => {
  if (!ai) {
    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is missing");
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return ai.models.generateContent(req);
};

const language = z.enum(["en", "zh", "zh-HK", "yue", "tl"]).default("en").describe("Carer's language");
const jurisdiction = z.enum(["HK", "AU"]).default("HK").describe("HK = Social Welfare Department special incidents; AU = SIRS");
const json = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });

const server = new McpServer({ name: "sunrise-care", version: "1.0.0" });

server.registerTool(
  "mask_identifiers",
  {
    title: "Mask identifiers",
    description: "Mask phone numbers, Medicare-style IDs and HKID-style numbers before text is sent to any AI model. No AI call.",
    inputSchema: { text: z.string() },
  },
  async ({ text }) => json(maskIdentifiers(text)),
);

server.registerTool(
  "red_line_check",
  {
    title: "Red-line incident rules",
    description:
      "Rule-based check (no AI). Returns mustReport (clearly reportable: death, use of force/abuse) and mustCheck (a nurse must decide: fall with injury, missing resident, medication error).",
    inputSchema: { text: z.string(), jurisdiction },
  },
  async ({ text, jurisdiction }) => json(jurisdiction === "HK" ? ruleBasedHkFloor(text) : ruleBasedSirsFloor(text)),
);

server.registerTool(
  "draft_progress_note",
  {
    title: "Draft progress note",
    description: "Turn a carer's own words (any language) into an objective English progress note with a back-translation. Never adds vitals, diagnoses or actions that were not stated.",
    inputSchema: { transcript: z.string(), language },
  },
  async ({ transcript, language }) => {
    const t = makeTools(generate, { language, jurisdiction: "HK" });
    return json(await t.draft_progress_note({ transcript: maskIdentifiers(transcript).text }));
  },
);

server.registerTool(
  "verify_against_source",
  {
    title: "Verify note against source",
    description: "List every statement in an English note that is not supported by the carer's original words.",
    inputSchema: { transcript: z.string(), englishNote: z.string() },
  },
  async ({ transcript, englishNote }) => {
    const t = makeTools(generate, { language: "en", jurisdiction: "HK" });
    return json(await t.verify_against_source({ transcript: maskIdentifiers(transcript).text, englishNote }));
  },
);

server.registerTool(
  "assess_incident",
  {
    title: "Assess reportable incident",
    description: "Classify an event under Hong Kong SWD special incident rules or Australian SIRS. The red-line rule can raise but never lower the result.",
    inputSchema: { transcript: z.string(), englishNote: z.string(), jurisdiction },
  },
  async ({ transcript, englishNote, jurisdiction }) => {
    const t = makeTools(generate, { language: "en", jurisdiction });
    return json(await t.assess_incident({ transcript: maskIdentifiers(transcript).text, englishNote }));
  },
);

server.registerTool(
  "run_documentation_agent",
  {
    title: "Run the full Sunrise Care agent",
    description:
      "Run the full agent loop on a carer's typed note. Always ends at 'awaiting_rn_confirmation': a Registered Nurse must confirm before anything is saved.",
    inputSchema: { text: z.string(), language, jurisdiction },
  },
  async ({ text, language, jurisdiction }) => json(await runAgent(generate, { text, language, jurisdiction })),
);

await server.connect(new StdioServerTransport());
