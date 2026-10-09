// Captures screenshots of every screen (desktop + mobile). Usage: node scripts/screenshots.mjs <outDir> [baseUrl]
import { chromium } from "@playwright/test";
import fs from "node:fs";

const out = process.argv[2] ?? "docs/screenshots";
const base = process.argv[3] ?? "http://localhost:3000";
const extra = (process.env.SHOT_PATHS ?? "").split(",").filter(Boolean);
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
for (const [label, viewport] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`[pageerror ${label}]`, e.message));
  page.on("console", (m) => m.type() === "error" && console.log(`[console ${label}]`, m.text(), m.location()?.url ?? ""));
  page.on("response", (r) => r.status() >= 400 && console.log(`[http ${label}] ${r.status()} ${r.url()}`));
  await page.goto(base + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${out}/${label}-landing.png` });
  if (process.env.FULL) await page.screenshot({ path: `${out}/${label}-landing-full.png`, fullPage: true });
  await page.goto(base + "/login", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/${label}-login.png` });
  await page.fill("#email", process.env.FORGEAI_ADMIN_EMAIL ?? "operator@forgeai.local");
  await page.fill("#password", process.env.FORGEAI_ADMIN_PASSWORD ?? "local-dev-passphrase");
  await page.click("button[type=submit]");
  await page.waitForURL("**/app", { timeout: 30000 });
  for (const p of ["/app", "/app/observability", "/app/evals", "/app/settings", ...extra]) {
    await page.goto(base + p, { waitUntil: "networkidle" });
    await page.waitForTimeout(1800);
    const name = p.replace(/^\/app\/?/, "").replace(/\//g, "-") || "workspace";
    await page.screenshot({ path: `${out}/${label}-${name}.png`, fullPage: true });
  }
  await ctx.close();
}
await browser.close();
console.log("done");
