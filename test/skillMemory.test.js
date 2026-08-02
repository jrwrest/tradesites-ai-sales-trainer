const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { afterEach, beforeEach, test } = require("node:test");
const {
  getDueDrills,
  intervalDaysForScore,
  loadSkillMemory,
  saveSkillMemory,
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
  assert.equal(memory.schemaVersion, 2);
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

test("skill memory namespaces the same skill by pinned method id and version", async () => {
  const hormoziPin = { id: "hormozi-sales-2026", version: "1.0.0-beta.3" };
  const futurePin = { id: "hormozi-sales-2026", version: "2.0.0" };

  await updateSkillMemory({
    session: { id: "session-v1", repId: "rep-a", methodPack: hormoziPin },
    evaluation: { skillScores: { schemaVersion: 1, ppp_plan: 4 } },
    now: new Date("2026-05-19T10:00:00.000Z"),
  });
  await updateSkillMemory({
    session: { id: "session-v2", repId: "rep-a", methodPack: futurePin },
    evaluation: { skillScores: { schemaVersion: 1, ppp_plan: 9 } },
    now: new Date("2026-05-19T10:00:00.000Z"),
  });

  const memory = await loadSkillMemory("rep-a");
  assert.equal(memory.schemaVersion, 2);
  assert.deepEqual(memory.methods["hormozi-sales-2026@1.0.0-beta.3"].methodPack, hormoziPin);
  assert.equal(memory.methods["hormozi-sales-2026@1.0.0-beta.3"].skills.ppp_plan.score, 4);
  assert.deepEqual(memory.methods["hormozi-sales-2026@2.0.0"].methodPack, futurePin);
  assert.equal(memory.methods["hormozi-sales-2026@2.0.0"].skills.ppp_plan.score, 9);
});

test("due drills return only the requested method namespace with its pin", async () => {
  const selectedPin = { id: "hormozi-sales-2026", version: "1.0.0-beta.3" };
  const otherPin = { id: "other-method", version: "1.0.0" };
  const now = new Date("2026-05-19T10:00:00.000Z");

  await updateSkillMemory({
    session: { id: "selected-session", repId: "rep-a", methodPack: selectedPin },
    evaluation: { skillScores: { schemaVersion: 1, ppp_plan: 4 } },
    now,
  });
  await updateSkillMemory({
    session: { id: "other-session", repId: "rep-a", methodPack: otherPin },
    evaluation: { skillScores: { schemaVersion: 1, aaa_ask: 3 } },
    now,
  });

  const due = await getDueDrills(
    new Date("2026-05-21T10:00:00.000Z"),
    "rep-a",
    selectedPin,
  );

  assert.deepEqual(due.map((drill) => drill.skill), ["ppp_plan"]);
  assert.deepEqual(due[0].methodPack, selectedPin);
});

test("legacy schema v1 memory stays in beta.2 while beta.3 starts isolated and replay-safe", async () => {
  const legacyPin = { id: "hormozi-sales-2026", version: "1.0.0-beta.2" };
  const currentPin = { id: "hormozi-sales-2026", version: "1.0.0-beta.3" };
  await fs.writeFile(skillMemoryPath("legacy-rep"), `${JSON.stringify({
    schemaVersion: 1,
    repId: "legacy-rep",
    skills: {
      ppp_plan: {
        score: 4,
        confidence: 0.5,
        attempts: 1,
        lastPractisedAt: "2026-05-19T10:00:00.000Z",
        nextDueAt: "2026-05-20T10:00:00.000Z",
        intervalDays: 1,
        recentSessionIds: ["legacy-session"],
      },
    },
  }, null, 2)}\n`);

  const memory = await loadSkillMemory("legacy-rep");
  const legacySkills = memory.methods["hormozi-sales-2026@1.0.0-beta.2"].skills;
  const currentSkills = memory.methods["hormozi-sales-2026@1.0.0-beta.3"].skills;
  assert.equal(memory.schemaVersion, 2);
  assert.equal(legacySkills.ppp_plan.attempts, 1);
  assert.deepEqual(currentSkills, {});
  assert.deepEqual(memory.skills, currentSkills, "compatibility callers should see the current namespace");

  await saveSkillMemory(memory);
  const afterMigrationSave = await loadSkillMemory("legacy-rep");
  assert.equal(
    afterMigrationSave.methods["hormozi-sales-2026@1.0.0-beta.2"].skills.ppp_plan.attempts,
    1,
  );
  assert.deepEqual(
    afterMigrationSave.methods["hormozi-sales-2026@1.0.0-beta.3"].skills,
    {},
  );

  await updateSkillMemory({
    session: { id: "current-session", repId: "legacy-rep", methodPack: currentPin },
    evaluation: { skillScores: { schemaVersion: 1, ppp_plan: 4 } },
    now: new Date("2026-05-20T10:00:00.000Z"),
  });
  await updateSkillMemory({
    session: { id: "current-session", repId: "legacy-rep", methodPack: currentPin },
    evaluation: { skillScores: { schemaVersion: 1, ppp_plan: 4 } },
    now: new Date("2026-05-20T10:00:00.000Z"),
  });
  const afterReplay = await loadSkillMemory("legacy-rep");
  assert.equal(
    afterReplay.methods["hormozi-sales-2026@1.0.0-beta.3"].skills.ppp_plan.attempts,
    1,
    "current-version replay must not double-count the session",
  );
  assert.equal(
    afterReplay.methods["hormozi-sales-2026@1.0.0-beta.2"].skills.ppp_plan.attempts,
    1,
    "beta.3 practice must not alter beta.2 history",
  );

  const legacyDue = await getDueDrills(
    new Date("2026-05-22T10:00:00.000Z"),
    "legacy-rep",
    legacyPin,
  );
  const currentDue = await getDueDrills(
    new Date("2026-05-22T10:00:00.000Z"),
    "legacy-rep",
    currentPin,
  );
  assert.equal(legacyDue.length, 1);
  assert.deepEqual(legacyDue[0].methodPack, legacyPin);
  assert.equal(currentDue.length, 1);
  assert.deepEqual(currentDue[0].methodPack, currentPin);
});
