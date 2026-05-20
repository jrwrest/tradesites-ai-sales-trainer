const { hasHardNo } = require("./objectionPlaybook");

function numericSkillScores(session) {
  return Object.entries(session.evaluation?.skillScores || {})
    .filter(([skill, score]) => skill !== "schemaVersion" && typeof score === "number");
}

function buildReviewQueue(sessions) {
  const ended = sessions
    .filter((session) => session.status === "ended" && session.evaluation)
    .sort((a, b) => String(a.endedAt || a.startedAt || "").localeCompare(String(b.endedAt || b.startedAt || "")));
  const missedCounts = new Map();
  for (const session of ended) {
    for (const [skill, score] of numericSkillScores(session)) {
      if (score <= 5) missedCounts.set(skill, (missedCounts.get(skill) || 0) + 1);
    }
  }

  return ended
    .map((session, index) => {
      const reasons = [];
      const weakSkills = numericSkillScores(session)
        .filter(([, score]) => score <= 4)
        .map(([skill]) => skill);
      if (weakSkills.length) reasons.push("low_score");
      if ((session.evaluation.skillScores?.hard_no_clean_exit || 10) <= 4 && hasHardNo(session.turns || [])) {
        reasons.push("hard_no_failure");
      }
      if (numericSkillScores(session).some(([skill, score]) => score <= 5 && missedCounts.get(skill) >= 3)) {
        reasons.push("repeated_missed_skill");
      }
      const prior = ended.slice(0, index);
      const improvedSkills = numericSkillScores(session).filter(([skill, score]) => {
        const priorScores = prior
          .map((priorSession) => priorSession.evaluation?.skillScores?.[skill])
          .filter((value) => typeof value === "number");
        if (!priorScores.length) return false;
        const average = priorScores.reduce((total, value) => total + value, 0) / priorScores.length;
        return score - average >= 3;
      });
      if (improvedSkills.length) reasons.push("high_improvement");
      if (session.reviewRequested) reasons.push("user_marked_review");
      if (!reasons.length) return null;
      return {
        sessionId: session.id,
        scenarioId: session.scenarioId,
        reasons,
        weakSkills,
        endedAt: session.endedAt,
      };
    })
    .filter(Boolean);
}

function buildSkillTrends(sessions) {
  const values = new Map();
  for (const session of sessions) {
    for (const [skill, score] of numericSkillScores(session)) {
      const list = values.get(skill) || [];
      list.push(score);
      values.set(skill, list);
    }
  }
  return [...values.entries()].map(([skill, scores]) => ({
    skill,
    attempts: scores.length,
    average: Math.round(scores.reduce((total, score) => total + score, 0) / scores.length),
    latest: scores[scores.length - 1],
  }));
}

module.exports = {
  buildReviewQueue,
  buildSkillTrends,
};
