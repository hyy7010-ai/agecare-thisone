const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(/mimeType: "audio\\/webm",\\s*data: base64Data/g,
  'mimeType: audioBase64.includes("mp4") || audioBase64.includes("m4a") ? "audio/mp4" : "audio/webm",\n            data: base64Data');

code = code.replace(/const base64Data = audioBase64\.replace\(\/\\\^data:audio\\\\\\\/\\\\w\\\+;base64,\/, ""\);/g,
  'const base64Data = audioBase64.replace(/^data:[^,]+,/, "");');

fs.writeFileSync('server.ts', code);
