import { spawn } from "node:child_process";
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
          schemaVersion: 1,
          repId: "smoke",
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
        null,
        2,
      )}\n`,
    );
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/app?smoke=1`, { waitUntil: "networkidle" });
    await page.getByText("Due Drill").waitFor({ timeout: 5000 });
    await page.getByRole("button", { name: "Start Call" }).click();
    await page.getByPlaceholder("Type what you would say on the call...").fill(
      "James from Solar Future Scotland. Can I take 20 seconds?",
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
    console.log("Smoke passed: due drill, retrieval Help, next drill, review queue, and gauntlet.");
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
