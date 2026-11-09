// Smoke test for the MCP server: list tools and call the rule-based ones (no AI cost).
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const client = new Client({ name: "smoke", version: "1.0.0" });
await client.connect(new StdioClientTransport({ command: "npx", args: ["tsx", "mcp-server.ts"] }));
const { tools } = await client.listTools();
console.log("tools:", tools.map((t) => t.name).join(", "));
const r1: any = await client.callTool({ name: "red_line_check", arguments: { text: "另一个护工推了刘奶奶一下", jurisdiction: "HK" } });
console.log("red_line_check:", r1.content[0].text.replace(/\s+/g, " "));
const r2: any = await client.callTool({ name: "mask_identifiers", arguments: { text: "佢個仔打 9123 4567，身份證 A123456(7)" } });
console.log("mask_identifiers:", r2.content[0].text.replace(/\s+/g, " "));
await client.close();
