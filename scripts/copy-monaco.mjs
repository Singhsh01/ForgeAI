// Copies Monaco's AMD build into /public so the diff editor works offline (no CDN).
import fs from "node:fs";
import path from "node:path";

const src = path.join(process.cwd(), "node_modules", "monaco-editor", "min", "vs");
const dest = path.join(process.cwd(), "public", "monaco", "vs");
if (!fs.existsSync(src)) {
  console.warn("[forgeai] monaco-editor not installed; diff viewer will be unavailable");
  process.exit(0);
}
fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.cpSync(src, dest, { recursive: true });
console.log("[forgeai] Monaco copied to public/monaco/vs");
