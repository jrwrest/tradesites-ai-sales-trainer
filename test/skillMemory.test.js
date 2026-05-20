const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { afterEach, beforeEach, test } = require("node:test");
const {
  getDueDrills,
  intervalDaysForScore,
  loadSkillMemory,
  skillMemoryPath,
  updateSkillMemory,
} = require("../src/skillMemory");

let previousDataDir;
let tempDataDir;

beforeEach(async () => {
  previousDataDir = process.env.DATA_DIR;
  tempDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "tradesites-memory-test-"));
  process.env.DATA_DIR = tempDataDir;
});

afterEach(async () => {
  if (previousDataDir === undefined) {
    delete process.env.DATA_DIR;
  } else {
    process.env.DATA_DIR = previousDataDir;
  }
  await fs.rm(tempDataDir, { recursive: true, force: true });
});

test("intervalDaysForScore uses deterministic spaced repetition intervals", () => {
  assert.equal(intervalDaysForScore(0), 1);
  assert.equal(intervalDaysForScore(4), 1);
  assert.equal(intervalDaysForScore(5), 3);
  assert.equal(intervalDaysForScore(6), 5);
  assert.equal(intervalDaysForScore(7), 7);
  assert.equal(intervalDaysForScore(8), 14);
  assert.equal(intervalDaysForScore(9), 21);
  assert.equal(intervalDaysForScore(10), 30);
});

test("updateSkillMemory persists skill scores with fixed next due dates", async () => {
  const now = new Date("2026-05-20T10:00:00.000Z");
  await updateSkillMemory({
    session: { id: "session-1" },
    evaluation: {
      skillScores: {
        schemaVersion: 1,
        permission_ask: 8,
        hard_no_clean_exit: 4,
      },
    },
    now,
  });

  const memory = await loadSkillMemory();
  assert.equal(memory.schemaVersion, 1);
  assert.equal(memory.skills.permission_ask.intervalDays, 14);
  assert.equal(memory.skills.permission_ask.nextDueAt, "2026-06-03T10:00:00.000Z");
  assert.equal(memory.skills.hard_no_clean_exit.intervalDays, 1);
  assert.equal(memory.skills.hard_no_clean_exit.nextDueAt, "2026-05-21T10:00:00.000Z");
});

test("updateSkillMemory does not duplicate the same session attempt", async () => {
  const now = new Date("2026-05-20T10:00:00.000Z");
  const payload = {
    session: { id: "session-1" },
    evaluation: { skillScores: { schemaVersion: 1, permission_ask: 5 } },
    now,
  };

  await updateSkillMemory(payload);
  await updateSkillMemory(payload);

  const memory = await loadSkillMemory();
  assert.equal(memory.skills.permission_ask.attempts, 1);
  assert.deepEqual(memory.skills.permission_ask.recentSessionIds, ["session-1"]);
});

test("getDueDrills sorts overdue weaker skills first", async () => {
  await updateSkillMemory({
    session: { id: "session-1" },
    evaluation: { skillScores: { schemaVersion: 1, permission_ask: 8 } },
    now: new Date("2026-05-01T10:00:00.000Z"),
  });
  await updateSkillMemory({
    session: { id: "session-2" },
    evaluation: { skillScores: { schemaVersion: 1, hard_no_clean_exit: 4 } },
    now: new Date("2026-05-19T10:00:00.000Z"),
  });

  const due = await getDueDrills(new Date("2026-05-21T10:00:00.000Z"));
  assert.equal(due[0].skill, "hard_no_clean_exit");
});

test("skill memory is stored and queried per rep", async () => {
  await updateSkillMemory({
    session: { id: "session-a", repId: "rep-a" },
    evaluation: { skillScores: { schemaVersion: 1, permission_ask: 4 } },
    now: new Date("2026-05-19T10:00:00.000Z"),
  });
  await updateSkillMemory({
    session: { id: "session-b", repId: "rep/b" },
    evaluation: { skillScores: { schemaVersion: 1, hard_no_clean_exit: 4 } },
    now: new Date("2026-05-19T10:00:00.000Z"),
  });

  const repA = await loadSkillMemory("rep-a");
  const repB = await loadSkillMemory("rep/b");
  assert.equal(repA.repId, "rep-a");
  assert.equal(repB.repId, "rep/b");
  assert.ok(repA.skills.permission_ask);
  assert.equal(repA.skills.hard_no_clean_exit, undefined);
  assert.ok(repB.skills.hard_no_clean_exit);

  const dueA = await getDueDrills(new Date("2026-05-21T10:00:00.000Z"), "rep-a");
  const dueB = await getDueDrills(new Date("2026-05-21T10:00:00.000Z"), "rep/b");
  assert.deepEqual(dueA.map((drill) => drill.skill), ["permission_ask"]);
  assert.deepEqual(dueB.map((drill) => drill.skill), ["hard_no_clean_exit"]);
  assert.notEqual(skillMemoryPath("rep/b"), skillMemoryPath("rep_b"));
  assert.match(skillMemoryPath("rep/b"), /skill-memory-[a-zA-Z0-9_-]+\.json$/);
});
