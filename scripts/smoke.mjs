import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForHealth(baseUrl) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10000) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Smoke server did not become healthy.");
}

async function main() {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "tradesites-smoke-"));
  const env = {
    ...process.env,
    DATA_DIR: dataDir,
    HOST: "127.0.0.1",
    PORT: String(port),
  };
  env.AUTH_REQUIRED = "0";
  delete env.CODEX_BRAIN_COMMAND;
  delete env.OPENCLAW_GATEWAY_URL;
  delete env.OPENCLAW_GATEWAY_TOKEN;
  delete env.POCKETBASE_URL;

  const server = spawn(process.execPath, ["src/server.js"], {
    cwd: path.join(import.meta.dirname, ".."),
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const logs = [];
  server.stdout.on("data", (chunk) => logs.push(chunk.toString()));
  server.stderr.on("data", (chunk) => logs.push(chunk.toString()));

  let browser;
  try {
    await waitForHealth(baseUrl);
    await fs.writeFile(
      path.join(dataDir, "skill-memory.json"),
      `${JSON.stringify(
        {
          schemaVersion: 2,
          repId: "smoke",
          methods: {
            "hormozi-sales-2026@1.0.0-beta.3": {
              methodPack: {
                id: "hormozi-sales-2026",
                version: "1.0.0-beta.3",
              },
              skills: {
                hard_no_clean_exit: {
                  score: 4,
                  confidence: 0.5,
                  attempts: 1,
                  lastPractisedAt: "2026-05-19T10:00:00.000Z",
                  nextDueAt: "2026-05-19T10:00:00.000Z",
                  intervalDays: 1,
                  recentSessionIds: ["smoke-seed"],
                },
              },
            },
          },
        },
        null,
        2,
      )}\n`,
    );
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/app?smoke=1`, { waitUntil: "networkidle" });
    await page.getByText("Due Drill").waitFor({ timeout: 5000 });
    await page.getByRole("button", { name: "Profile", exact: true }).click();
    const coachingMethod = page.getByLabel("Coaching method");
    await coachingMethod.waitFor({ timeout: 5000 });
    assert.equal(await coachingMethod.inputValue(), "hormozi-sales-2026");
    assert.match(await coachingMethod.locator("option:checked").textContent(), /Hormozi/i);

    let profilePutCount = 0;
    let accountDeleteCount = 0;
    let releaseProfileSave;
    let markProfilePutSeen;
    const profilePutSeen = new Promise((resolve) => { markProfilePutSeen = resolve; });
    const profileSaveRelease = new Promise((resolve) => { releaseProfileSave = resolve; });
    let profileSaveMode = "delay";
    await page.route("**/api/profile", async (route) => {
      if (route.request().method() !== "PUT") {
        await route.continue();
        return;
      }
      profilePutCount += 1;
      markProfilePutSeen();
      if (profileSaveMode === "delay") await profileSaveRelease;
      if (profileSaveMode === "fail") {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Temporary profile save failure." }),
        });
        return;
      }
      await route.continue();
    });
    await page.route("**/api/account-data", async (route) => {
      accountDeleteCount += 1;
      await route.continue();
    });

    const companyInput = page.getByLabel("Company", { exact: true });
    const saveProfileButton = page.getByRole("button", { name: "Save Profile" });
    const savedCompany = `Smoke Solar ${Date.now()}`;
    await companyInput.fill(savedCompany);
    await saveProfileButton.click();
    await profilePutSeen;
    assert.equal(await companyInput.isDisabled(), true);
    assert.equal(await page.getByRole("button", { name: "Saving..." }).isDisabled(), true);
    assert.equal(await page.getByLabel("Deletion confirmation").isDisabled(), true);
    assert.equal(await page.getByRole("button", { name: "Delete My Training Data" }).isDisabled(), true);
    await page.getByRole("button", { name: "Delete My Training Data" }).evaluate((deleteButton) => {
      deleteButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await page.locator(".profile-form").evaluate((form) => form.requestSubmit());
    releaseProfileSave();
    await page.locator(".profile-save-status").getByText("Profile saved.", { exact: true }).waitFor({ timeout: 5000 });
    assert.equal(profilePutCount, 1);
    assert.equal(accountDeleteCount, 0);
    assert.equal(await companyInput.inputValue(), savedCompany);
    assert.equal(await saveProfileButton.evaluate((button) => document.activeElement === button), true);

    await companyInput.fill("Unsaved smoke edit");
    await page.getByText("Unsaved changes.", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Profile", exact: true }).click();
    await page.waitForFunction(
      (expected) => document.querySelector('input[name="companyName"]')?.value === expected,
      savedCompany,
    );
    assert.equal(await page.getByLabel("Company", { exact: true }).inputValue(), savedCompany);

    profileSaveMode = "fail";
    const failedCompany = "Preserve this failed edit";
    await page.getByLabel("Company", { exact: true }).fill(failedCompany);
    await page.getByRole("button", { name: "Save Profile" }).click();
    const inlineError = page.getByRole("alert");
    await inlineError.waitFor({ timeout: 5000 });
    assert.match(await inlineError.textContent(), /Temporary profile save failure/);
    assert.equal(await page.getByLabel("Company", { exact: true }).inputValue(), failedCompany);
    assert.equal(await page.getByRole("button", { name: "Save Profile" }).isEnabled(), true);

    await page.getByRole("button", { name: "Start Call" }).click();
    await page.getByPlaceholder("Type what you would say on the call...").fill(
      "Ava from Northstar Energy. Can I take 20 seconds?",
    );
    await page.getByRole("button", { name: "Send" }).click();
    await page.getByText("Customer replied.").waitFor({ timeout: 5000 });
    await page.getByRole("button", { name: "Help" }).click();
    await page.getByText("What is your next move?").waitFor({ timeout: 5000 });
    await page.getByRole("button", { name: "Clarify" }).click();
    await page.getByText("Approved example:").waitFor({ timeout: 5000 });
    await page.getByRole("button", { name: "End Call" }).click();
    await page.getByText("Next Drill").waitFor({ timeout: 5000 });
    await page.getByRole("button", { name: "Review" }).click();
    await page.getByText("Coach Review Queue").waitFor({ timeout: 5000 });
    await page.getByRole("button", { name: "Gauntlet" }).click();
    for (let index = 0; index < 3; index += 1) {
      await page.getByPlaceholder("Type what you would say on the call...").fill(
        "Fair point. Can I ask one quick question so I route this properly?",
      );
      await page.getByRole("button", { name: "Send" }).click();
    }
    await page.getByText("Gauntlet complete").waitFor({ timeout: 5000 });
    console.log("Smoke passed: profile save feedback, method selector, due drill, retrieval Help, next drill, review queue, and gauntlet.");
  } catch (error) {
    console.error(logs.join(""));
    throw error;
  } finally {
    if (browser) await browser.close();
    server.kill("SIGTERM");
    await fs.rm(dataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
