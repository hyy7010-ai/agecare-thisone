// Latency check: three fictional notes under Hong Kong rules. Run: npx tsx eval/speed-check.mts
import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { runAgent } from "../agent";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
const gen = (r: any) => ai.models.generateContent(r);
const cases = [["zh","王奶奶早上七点在卫生间跌倒了，撞到头，额头有一点流血，我扶她起来坐在椅子上，用纱布按住了。"],["yue","陳伯今朝食咗半碗粥，之後我扶佢去廁所，佢話膝頭有啲痛。"],["en","Mrs Brown refused lunch today. She seemed quiet but settled."]];
for (const [lang,text] of cases) { const r = await runAgent(gen, { text, language: lang, jurisdiction: "HK" });
  console.log(lang, (r.totalMs/1000).toFixed(1)+"s", r.trace.map(s=>s.step+":"+s.tool.split("_")[0]+"("+(s.ms/1000).toFixed(1)+")").join(" "), "| review:", !!r.review); }
