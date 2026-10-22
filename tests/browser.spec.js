import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
const dir = mkdtempSync(join(tmpdir(), "aspirants-browser-")),
  password = randomBytes(20).toString("hex");
let server, base;
test.beforeAll(async () => {
  server = spawn(process.execPath, ["server.js"], {
    env: { ...process.env, PORT: "0", DATA_DIR: dir, ADMIN_PASSWORD: password },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    let output = "";
    server.stdout.on("data", (d) => {
      output += d;
      const p = output.match(/port (\d+)/);
      if (p) {
        base = "http://127.0.0.1:" + p[1];
        resolve();
      }
    });
    server.once("exit", (code) => reject(Error("Server exited " + code)));
  });
});
test.afterAll(async () => {
  if (server?.exitCode === null) {
    const closed = new Promise((r) => server.once("exit", r));
    server.kill();
    await closed;
  }
  rmSync(dir, { recursive: true, force: true });
});
test("desktop home, imagery, Bengali content and navigation", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await expect(page.locator(".content-card")).toHaveCount(12);
  await expect(
    page.getByRole("heading", { name: "A little reading." }),
  ).toBeVisible();
  await expect(page.locator(".content-card").first()).toContainText("লালসালু");
  await page.evaluate(() => document.fonts.ready);
  for (const image of await page.locator(".content-card img").all())
    expect(
      await image.evaluate((i) => i.complete && i.naturalWidth > 0),
    ).toBeTruthy();
  await page.screenshot({
    path: "/tmp/aspirants-check/desktop-final.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Our story", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A curious mind has no syllabus." }),
  ).toBeVisible();
  await expect(page.locator(".source-credit").first()).toContainText(
    "আবদুল্লাহ আল নোমান অন্তর",
  );
  expect(errors).toEqual([]);
});
test("Bengali and English search, multiple filters and URL restoration", async ({
  page,
}) => {
  await page.goto(base + "/library");
  await page.getByRole("searchbox", { name: "Search library" }).fill("লালসালু");
  await page.getByRole("searchbox", { name: "Search library" }).press("Enter");
  await expect(page.locator(".content-card")).toHaveCount(1);
  await expect(page).toHaveURL(/q=/);
  await page.getByRole("button", { name: "Clear all", exact: true }).click();
  await page.locator('[data-category="Movies"]').click();
  await page.locator("summary").filter({ hasText: "Genre" }).click();
  await page.locator('[data-filter="genre"][value="Science fiction"]').check();
  await expect(page.locator(".content-card")).toHaveCount(6);
  await expect(page).toHaveURL(/category=Movies.*genre=Science/);
  await page.locator('[data-filter="genre"][value="Romance"]').check();
  const count = await page.locator(".content-card").count();
  expect(count).toBeGreaterThanOrEqual(6);
  await page.selectOption("#sort", "year-desc");
  await expect(page).toHaveURL(/sort=year-desc/);
  const url = page.url();
  await page.reload();
  await expect(
    page.locator('[data-filter="genre"][value="Romance"]'),
  ).toBeChecked();
  await expect(page.locator(".content-card")).toHaveCount(count);
  expect(page.url()).toBe(url);
  await page.locator('[data-remove="genre"][data-value="Romance"]').click();
  await expect(page.locator(".content-card")).toHaveCount(6);
  await page.goBack();
  await expect(
    page.locator('[data-filter="genre"][value="Romance"]'),
  ).toBeChecked();
});
test("pagination, view preference, detail routes and saved collection persist", async ({
  page,
}) => {
  await page.goto(base + "/library");
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page).toHaveURL(/page=2/);
  await page.getByRole("button", { name: "List view", exact: true }).click();
  await expect(page.locator(".content-grid")).toHaveClass(/list/);
  await page.reload();
  await expect(page.locator(".content-grid")).toHaveClass(/list/);
  const first = page.locator(".content-card").first();
  const title = await first.locator("h3").textContent();
  await first.locator("[data-save]").click();
  await first.locator("h3 a").click();
  await expect(page.locator(".detail h1")).toHaveText(title);
  await expect(page.locator(".detail [data-save]")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("link", { name: "My saved items" }).click();
  await expect(page.locator(".content-card")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".content-card h3")).toHaveText(title);
});
test("mobile drawer, combined filters, keyboard close and no horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base);
  await expect(page.locator(".content-card")).toHaveCount(12);
  await page.screenshot({
    path: "/tmp/aspirants-check/mobile-final.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await expect(page.locator(".filter-sidebar")).toHaveClass(/open/);
  await page.locator('[data-filter="type"][value="book"]').check();
  await expect(page.locator(".filter-sidebar")).toHaveClass(/open/);
  await page.getByRole("button", { name: "Close filters" }).click();
  await expect(page.locator(".filter-sidebar")).not.toBeVisible();
  await expect(page.locator(".chip")).toContainText(["Book"]);
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".filter-sidebar")).not.toBeVisible();
  await page.getByRole("button", { name: "Clear all", exact: true }).click();
  await page
    .getByRole("searchbox", { name: "Search library" })
    .fill("nothing matches this");
  await page.getByRole("searchbox", { name: "Search library" }).press("Enter");
  await expect(
    page.getByRole("heading", { name: "No discoveries here, yet." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("admin forms create, edit, preview and publish a real discovery", async ({
  page,
}) => {
  await page.goto(base + "/admin");
  await page.getByLabel("Administrator password").fill(password);
  await page.getByRole("button", { name: "Sign in to manage" }).click();
  await expect(
    page.getByRole("heading", { name: "A growing collection." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add discovery" }).click();
  await page
    .getByLabel("Title *", { exact: true })
    .fill("A browser-tested discovery");
  await page.getByLabel("Writers / creators").fill("Browser test writer");
  await page
    .getByLabel("Short description")
    .fill("A real description from the browser test.");
  await page.getByRole("button", { name: "Save as draft" }).click();
  await expect(page.locator("dialog")).not.toBeVisible();
  await page
    .getByRole("searchbox", { name: "Search admin content" })
    .fill("A browser-tested discovery");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.locator(".preview-banner")).toContainText("draft");
  await expect(page.locator(".detail h1")).toHaveText(
    "A browser-tested discovery",
  );
  await page.getByRole("button", { name: "Back to dashboard" }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByLabel("Title *", { exact: true })
    .fill("A published browser discovery");
  await page.selectOption("#edit-status", "published");
  await page.getByRole("button", { name: "Save discovery" }).click();
  await expect(page.locator("dialog")).not.toBeVisible();
  await page.goto(base + "/library?q=published+browser");
  await expect(page.locator(".content-card")).toHaveCount(1);
  await expect(page.locator(".content-card h3")).toHaveText(
    "A published browser discovery",
  );
  await page.goto(base + "/admin");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign in to manage" }),
  ).toBeVisible();
  const result = await page.request.get(base + "/api/admin/items");
  expect(result.status()).toBe(401);
});
test("writer, language, year and English description searches compose", async ({
  page,
}) => {
  await page.goto(
    base + "/library?creator=" + encodeURIComponent("George Orwell"),
  );
  await expect(page.locator(".content-card")).toHaveCount(2);
  await page
    .getByRole("searchbox", { name: "Search library" })
    .fill("surveillance");
  await page.getByRole("searchbox", { name: "Search library" }).press("Enter");
  await expect(page.locator(".content-card")).toHaveCount(1);
  await expect(page.locator(".content-card h3")).toHaveText("1984");
  await page.goto(base + "/library?category=Movies&language=English&year=2014");
  await expect(page.locator(".content-card")).toHaveCount(3);
  await page.getByRole("button", { name: "Clear all", exact: true }).click();
  await page
    .getByRole("searchbox", { name: "Search library" })
    .fill("Inception");
  await page.getByRole("searchbox", { name: "Search library" }).press("Enter");
  await expect(page.locator(".content-card h3")).toHaveText("Inception");
});
test("public pages and editor pass automated WCAG A/AA checks", async ({
  page,
}) => {
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  for (const route of [
    "/",
    "/library",
    "/content/item-001",
    "/about",
    "/admin",
  ]) {
    await page.goto(base + route);
    await expect(page.locator(".initial-loading")).toHaveCount(0);
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(result.violations, route).toEqual([]);
  }
  await page.getByLabel("Administrator password").fill(password);
  await page.getByRole("button", { name: "Sign in to manage" }).click();
  await page.getByRole("button", { name: "Add discovery" }).click();
  const editor = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(editor.violations).toEqual([]);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("button", { name: "Manage taxonomy & creators" })
    .click();
  const taxonomy = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(taxonomy.violations).toEqual([]);
});
