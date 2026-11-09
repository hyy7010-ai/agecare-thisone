// Token usage per agent run (for cost estimates). Run: npx tsx eval/token-check.mts
import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { runAgent } from "../agent";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
const samples = [["zh","王奶奶早上七点在卫生间跌倒了，撞到头，额头有一点流血，我扶她起来坐在椅子上，用纱布按住了。"],["yue","陳伯今朝食咗半碗粥，之後我扶佢去廁所，佢話膝頭有啲痛。"],["en","Mrs Brown refused lunch today. She seemed quiet but settled."]];
for (const [lang, text] of samples) {
  let inTok = 0, outTok = 0, calls = 0;
  const gen = async (r: any) => { const res: any = await ai.models.generateContent(r); const u = res.usageMetadata || {}; inTok += u.promptTokenCount || 0; outTok += (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0); calls++; return res; };
  await runAgent(gen, { text, language: lang, jurisdiction: "HK" });
  console.log(lang, "calls", calls, "input", inTok, "output+thinking", outTok);
}
