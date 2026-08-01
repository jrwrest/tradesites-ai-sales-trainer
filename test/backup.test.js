const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { afterEach, beforeEach, test } = require("node:test");
const { createBackup, restoreBackup, verifyBackup } = require("../src/backup");

let root;
let dataDir;
let backupRoot;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "trainer-backup-test-"));
  dataDir = path.join(root, "data");
  backupRoot = path.join(root, "backups");
  await fs.mkdir(path.join(dataDir, "sessions"), { recursive: true });
  await fs.writeFile(path.join(dataDir, "sessions", "one.json"), "{\"id\":\"one\"}\n");
  await fs.writeFile(path.join(dataDir, "skill-memory.json"), "{\"skills\":{}}\n");
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

test("backup manifest verifies every copied data file", async () => {
  const backup = await createBackup({
    dataDir,
    backupRoot,
    now: new Date("2026-08-01T10:00:00.000Z"),
  });
  const verification = await verifyBackup({ backupDir: backup.backupDir });

  assert.equal(verification.valid, true, verification.errors.join("\n"));
  assert.deepEqual(verification.manifest.files.map((file) => file.path), [
    "sessions/one.json",
    "skill-memory.json",
  ]);
  assert.ok(verification.manifest.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256)));
});

test("backup refuses overlapping source and destination trees", async () => {
  await assert.rejects(
    () => createBackup({ dataDir, backupRoot: root }),
    /must not overlap/,
  );
  await assert.rejects(
    () => createBackup({ dataDir, backupRoot: path.join(dataDir, "backups") }),
    /must not overlap/,
  );
});

test("backup verification detects payload tampering", async () => {
  const backup = await createBackup({ dataDir, backupRoot });
  await fs.writeFile(path.join(backup.backupDir, "data", "skill-memory.json"), "tampered\n");

  const verification = await verifyBackup({ backupDir: backup.backupDir });

  assert.equal(verification.valid, false);
  assert.ok(verification.errors.some((error) => /checksum mismatch/.test(error)));
});

test("restore verifies then writes only to an empty target", async () => {
  const backup = await createBackup({ dataDir, backupRoot });
  const restoreDir = path.join(root, "restored");

  const restored = await restoreBackup({ backupDir: backup.backupDir, targetDir: restoreDir });

  assert.equal(restored.files, 2);
  assert.equal(await fs.readFile(path.join(restoreDir, "sessions", "one.json"), "utf8"), "{\"id\":\"one\"}\n");
  await assert.rejects(
    () => restoreBackup({ backupDir: backup.backupDir, targetDir: restoreDir }),
    /must be empty/,
  );
});
