import { expect, test } from "@playwright/test";

const email = process.env.FORGEAI_ADMIN_EMAIL ?? "operator@forgeai.local";
const password = process.env.FORGEAI_ADMIN_PASSWORD ?? "local-dev-passphrase";

test("landing renders the galaxy backdrop and primary entry points", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Issues in.");
  const bg = page.locator('img[src="/galaxy.jpg"]');
  await expect(bg).toHaveCount(1);
  expect(await bg.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(2576);
  await expect(page.getByRole("link", { name: "Start a task" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("app routes require sign-in", async ({ page }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login\?next=%2Fapp/);
  const res = await page.request.get("/api/runs");
  expect(res.status()).toBe(401);
});

test("operator can sign in and reach every screen", async ({ page }) => {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", "wrong-password");
  await page.click("button[type=submit]");
  await expect(page.locator("form [role=alert]")).toContainText(/Invalid email or password|Too many/);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { name: "Workspace" })).toBeVisible();
  for (const [path, heading] of [["/app/observability", "Observability"], ["/app/evals", "Evaluations"], ["/app/settings", "Settings"]]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
  }
});

test("reduced motion disables the particle canvas animation", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto("/");
  const drawn = await page.locator("canvas").evaluate((c: HTMLCanvasElement) => c.width);
  expect(drawn).toBe(300); // never sized/drawn: the effect bails out under reduced motion
  await ctx.close();
});
