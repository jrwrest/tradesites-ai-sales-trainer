const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.join(__dirname, "..");
const TEXT_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".txt",
  ".yml",
  ".yaml",
]);
const SCAN_DIRS = ["docs", "public", "scripts", "src", "test"];
const SCAN_FILES = [".env.example", "CONTRIBUTING.md", "README.md", "SECURITY.md", "package.json"];
const FORBIDDEN_PUBLIC_RELEASE_STRINGS = [
  "Cold Call Trainer",
  "McCallum",
  "McCallums",
  "James Wrest",
  "Solar Installer List",
  "89.167.74.15",
  "root@",
  "server-deployment",
];

async function* walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(absolute);
    } else {
      yield absolute;
    }
  }
}

test("public release files do not include old private names or live infrastructure details", async () => {
  const files = [...SCAN_FILES.map((file) => path.join(ROOT, file))];
  for (const dir of SCAN_DIRS) {
    for await (const file of walk(path.join(ROOT, dir))) {
      if (path.relative(ROOT, file) === "test/publicRelease.test.js") continue;
      if (TEXT_EXTENSIONS.has(path.extname(file))) files.push(file);
    }
  }

  const hits = [];
  for (const file of files) {
    const text = await fs.readFile(file, "utf8");
    for (const forbidden of FORBIDDEN_PUBLIC_RELEASE_STRINGS) {
      if (text.includes(forbidden)) {
        hits.push(`${path.relative(ROOT, file)} contains ${forbidden}`);
      }
    }
  }

  assert.deepEqual(hits, []);
});
