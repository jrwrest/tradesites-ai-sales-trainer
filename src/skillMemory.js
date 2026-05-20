const fs = require("node:fs/promises");
const path = require("node:path");
const { getDataDir } = require("./store");

function safeRepId(repId = "local") {
  return Buffer.from(String(repId || "local"), "utf8").toString("base64url");
}

function skillMemoryPath(repId = "local") {
  return path.join(getDataDir(), repId === "local" ? "skill-memory.json" : `skill-memory-${safeRepId(repId)}.json`);
}

function emptySkillMemory(repId = "local") {
  return {
    schemaVersion: 1,
    repId,
    skills: {},
  };
}

function intervalDaysForScore(score) {
  const rounded = Math.max(0, Math.min(10, Math.round(Number(score) || 0)));
  if (rounded <= 4) return 1;
  if (rounded === 5) return 3;
  if (rounded === 6) return 5;
  if (rounded === 7) return 7;
  if (rounded === 8) return 14;
  if (rounded === 9) return 21;
  return 30;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

async function loadSkillMemory(repId = "local") {
  try {
    const raw = await fs.readFile(skillMemoryPath(repId), "utf8");
    const parsed = JSON.parse(raw);
    return {
      ...emptySkillMemory(repId),
      ...parsed,
      repId,
      skills: parsed.skills || {},
    };
  } catch (error) {
    if (error.code === "ENOENT") return emptySkillMemory(repId);
    error.code = "SKILL_MEMORY_READ_FAILED";
    throw error;
  }
}

async function saveSkillMemory(memory) {
  await fs.mkdir(getDataDir(), { recursive: true });
  const target = skillMemoryPath(memory.repId || "local");
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(memory, null, 2)}\n`);
  await fs.rename(temp, target);
}

async function updateSkillMemory({ session, evaluation, now = new Date() }) {
  const repId = session.repId || "local";
  const memory = await loadSkillMemory(repId);
  const skillScores = evaluation.skillScores || {};
  for (const [skill, score] of Object.entries(skillScores)) {
    if (skill === "schemaVersion" || typeof score !== "number") continue;
    const existing = memory.skills[skill] || {
      score,
      confidence: 0.5,
      attempts: 0,
      recentSessionIds: [],
    };
    const recentSessionIds = Array.isArray(existing.recentSessionIds)
      ? existing.recentSessionIds
      : [];
    const alreadyCounted = recentSessionIds.includes(session.id);
    const intervalDays = intervalDaysForScore(score);
    memory.skills[skill] = {
      score,
      confidence: Math.min(1, Math.max(0.1, (existing.confidence || 0.5) + (score >= 8 ? 0.05 : -0.03))),
      attempts: existing.attempts + (alreadyCounted ? 0 : 1),
      lastPractisedAt: now.toISOString(),
      nextDueAt: addDays(now, intervalDays).toISOString(),
      intervalDays,
      recentSessionIds: alreadyCounted
        ? recentSessionIds
        : [...recentSessionIds.slice(-4), session.id],
    };
  }
  await saveSkillMemory(memory);
  return memory;
}

async function getDueDrills(now = new Date(), repId = "local") {
  const memory = await loadSkillMemory(repId);
  return Object.entries(memory.skills)
    .filter(([, value]) => value.nextDueAt && new Date(value.nextDueAt) <= now)
    .map(([skill, value]) => ({
      schemaVersion: 1,
      skill,
      score: value.score,
      nextDueAt: value.nextDueAt,
      reason: `Due for practice after scoring ${value.score}/10.`,
    }))
    .sort((a, b) => {
      const scoreDelta = a.score - b.score;
      if (scoreDelta !== 0) return scoreDelta;
      return new Date(a.nextDueAt) - new Date(b.nextDueAt);
    });
}

module.exports = {
  getDueDrills,
  intervalDaysForScore,
  loadSkillMemory,
  saveSkillMemory,
  safeRepId,
  skillMemoryPath,
  updateSkillMemory,
};
