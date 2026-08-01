const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { afterEach, beforeEach, test } = require("node:test");
const {
  deleteSessionsForRep,
  ensureStore,
  loadSession,
  purgeExpiredSessions,
  saveSession,
} = require("../src/store");

let dataDir;
let previousDataDir;

beforeEach(async () => {
  previousDataDir = process.env.DATA_DIR;
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "trainer-store-test-"));
  process.env.DATA_DIR = dataDir;
});

afterEach(async () => {
  if (previousDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = previousDataDir;
  await fs.rm(dataDir, { recursive: true, force: true });
});

test("store uses private directory and file permissions", async () => {
  await ensureStore();
  await saveSession({ id: "private-session", repId: "rep-a", turns: [] });

  const directoryMode = (await fs.stat(path.join(dataDir, "sessions"))).mode & 0o777;
  const fileMode = (await fs.stat(path.join(dataDir, "sessions", "private-session.json"))).mode & 0o777;
  assert.equal(directoryMode & 0o077, 0);
  assert.equal(fileMode & 0o077, 0);
});

test("optimistic revisions reject a stale session write instead of losing data", async () => {
  const original = { id: "concurrent-session", repId: "rep-a", turns: [] };
  await saveSession(original);
  const first = await loadSession(original.id);
  const stale = await loadSession(original.id);
  first.turns.push({ role: "user", text: "first" });
  stale.turns.push({ role: "user", text: "stale" });

  await saveSession(first);
  await assert.rejects(
    () => saveSession(stale),
    (error) => error.code === "SESSION_CONFLICT",
  );
  assert.deepEqual((await loadSession(original.id)).turns, [{ role: "user", text: "first" }]);
});

test("a stale in-flight session cannot recreate training data after deletion", async () => {
  const session = { id: "deleted-session", repId: "rep-a", turns: [] };
  await saveSession(session);
  const stale = await loadSession(session.id);
  await deleteSessionsForRep("rep-a");

  await assert.rejects(
    () => saveSession(stale),
    (error) => error.code === "SESSION_CONFLICT",
  );
});

test("retention removes only ended sessions older than the cutoff", async () => {
  await saveSession({ id: "old-ended", repId: "rep-a", status: "ended", endedAt: "2026-01-01T00:00:00.000Z", turns: [] });
  await saveSession({ id: "recent-ended", repId: "rep-a", status: "ended", endedAt: "2026-07-15T00:00:00.000Z", turns: [] });
  await saveSession({ id: "old-active", repId: "rep-a", status: "active", startedAt: "2026-01-01T00:00:00.000Z", turns: [] });

  const result = await purgeExpiredSessions({ retentionDays: 90, now: new Date("2026-08-01T00:00:00.000Z") });

  assert.deepEqual(result.deletedSessionIds, ["old-ended"]);
  await assert.rejects(() => loadSession("old-ended"), (error) => error.code === "ENOENT");
  assert.equal((await loadSession("recent-ended")).id, "recent-ended");
  assert.equal((await loadSession("old-active")).id, "old-active");
});

test("rep data deletion removes only that rep's sessions", async () => {
  await saveSession({ id: "rep-a-one", repId: "rep-a", turns: [] });
  await saveSession({ id: "rep-b-one", repId: "rep-b", turns: [] });

  assert.equal((await deleteSessionsForRep("rep-a")).deleted, 1);
  await assert.rejects(() => loadSession("rep-a-one"), (error) => error.code === "ENOENT");
  assert.equal((await loadSession("rep-b-one")).repId, "rep-b");
});
