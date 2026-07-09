const { getObjectionById, getPlaybook } = require("./objectionPlaybook");

const GAUNTLET_POOL = [
  { objectionId: "send-info", nearMissFamily: "dismissal" },
  { objectionId: "no-requirement", nearMissFamily: "dismissal" },
  { objectionId: "landlord", nearMissFamily: "authority-route" },
  { objectionId: "procurement", nearMissFamily: "authority-route" },
  { objectionId: "already-have-solar", nearMissFamily: "existing-solution" },
  { objectionId: "incumbent-consultant", nearMissFamily: "existing-solution" },
  { objectionId: "not-priority", nearMissFamily: "timing" },
  { objectionId: "budget-free-claim", nearMissFamily: "commercial-risk" },
];

function familyForObjection(objection) {
  if (objection.id.includes("send-info")) return "dismissal";
  if (objection.type === "hard_no") return "dismissal";
  if (["authority", "process"].includes(objection.type)) return "authority-route";
  if (objection.type === "existing_solution") return "existing-solution";
  if (objection.type === "timing") return "timing";
  if (objection.type === "commercial_risk") return "commercial-risk";
  if (objection.type === "qualification") return "qualification";
  return objection.type || "objection";
}

function buildGauntletPool(playbookId) {
  if (!playbookId || playbookId === "enterprise-commercial-solar") return [...GAUNTLET_POOL];
  const playbook = getPlaybook(playbookId);
  if (!playbook) return GAUNTLET_POOL;
  return playbook.objections.map((objection) => ({
    objectionId: objection.id,
    nearMissFamily: familyForObjection(objection),
  }));
}

function generateGauntletPlan({ rounds = 5, playbookId = "enterprise-commercial-solar" } = {}) {
  const selected = [];
  const remaining = buildGauntletPool(playbookId);
  while (selected.length < rounds && remaining.length) {
    const lastType = selected[selected.length - 1]?.type;
    const index = remaining.findIndex((item) => getObjectionById(item.objectionId).type !== lastType);
    const [item] = remaining.splice(index >= 0 ? index : 0, 1);
    const objection = getObjectionById(item.objectionId);
    selected.push({
      round: selected.length + 1,
      objectionId: objection.id,
      type: objection.type,
      text: objection.text,
      nearMissFamily: item.nearMissFamily,
    });
  }

  return {
    schemaVersion: 1,
    mode: "objection-gauntlet",
    rounds: selected,
  };
}

function scoreGauntletAnswer(text) {
  const value = String(text || "").toLowerCase();
  let score = 2;
  if (/\b(fair|understand|understood|makes sense|good question|completely)\b/.test(value)) score += 2;
  if (/\?/.test(value) || /\b(can i ask|who|what|how|which)\b/.test(value)) score += 2;
  if (/\b(route|process|owner|landlord|procurement|priority|site|fit|close this off|50,?000|electricity spend|report|diagnostic|card on file|10%|ten percent)\b/.test(value)) score += 2;
  if (/\b(free|guaranteed|definitely|obviously)\b/.test(value)) score -= 2;
  return Math.max(0, Math.min(10, score));
}

function scoreHardNoCleanExit(text) {
  const value = String(text || "").toLowerCase();
  const cleanExit = /\b(understand|understood|fair|close this off|take you off|will not push|won't push|thanks|thank you|bye)\b/.test(
    value,
  );
  const pushed = /\b(ppa|solar|funded|no upfront|site review|just explain|but)\b/.test(value);
  if (cleanExit && !pushed) return 9;
  if (pushed) return 2;
  return cleanExit ? 7 : 3;
}

function summarizeGauntlet(results) {
  const byFamily = new Map();
  for (const result of results) {
    const existing = byFamily.get(result.nearMissFamily) || { total: 0, count: 0 };
    existing.total += result.score;
    existing.count += 1;
    byFamily.set(result.nearMissFamily, existing);
  }
  const ranked = [...byFamily.entries()]
    .map(([family, value]) => ({ family, average: value.total / value.count }))
    .sort((a, b) => a.average - b.average);
  return {
    schemaVersion: 1,
    roundCount: results.length,
    weakestFamily: ranked[0]?.family || null,
    strongestFamily: ranked[ranked.length - 1]?.family || null,
    hardNoCleanExit:
      results
        .filter((result) => typeof result.hardNoCleanExit === "number")
        .reduce((total, result, _index, list) => total + result.hardNoCleanExit / list.length, 0) || null,
    familyScores: ranked,
  };
}

module.exports = {
  generateGauntletPlan,
  scoreHardNoCleanExit,
  scoreGauntletAnswer,
  summarizeGauntlet,
};
