const crypto = require("node:crypto");
const { COMMERCIAL_SOLAR_SITUATIONS, getObjectionById, getPlaybook } = require("./objectionPlaybook");

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
  if (!playbookId || playbookId === "enterprise-commercial-solar") {
    return COMMERCIAL_SOLAR_SITUATIONS.map((objection) => ({
      objectionId: objection.id,
      nearMissFamily: familyForObjection(objection),
      situationFamily: objection.family,
    }));
  }
  const playbook = getPlaybook(playbookId);
  if (!playbook) return GAUNTLET_POOL;
  return playbook.objections.map((objection) => ({
    objectionId: objection.id,
    nearMissFamily: familyForObjection(objection),
  }));
}

function generateGauntletPlan({ rounds = 5, playbookId = "enterprise-commercial-solar", startIndex = 0 } = {}) {
  const selected = [];
  const remaining = buildGauntletPool(playbookId);
  if (remaining.length) {
    const offset = Math.max(0, Number(startIndex) || 0) % remaining.length;
    remaining.push(...remaining.splice(0, offset));
  }
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
      situationFamily: item.situationFamily || objection.family || familyForObjection(objection),
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

const FAMILY_SIGNALS = Object.freeze({
  gatekeeper: /\b(company|calling|reason|identity|who handles|right person|energy contracts?)\b/i,
  send_info: /\b(email|information|send|relevant|right thing|generic)\b/i,
  existing_solar: /\b(current system|existing solar|daytime|expansion|battery|another site|demand)\b/i,
  prior_solar: /\b(looked before|previous|last time|reason|stopped|did not proceed|at the time)\b/i,
  lease_landlord: /\b(lease|leased|landlord|owner|consent|roof rights?)\b/i,
  price_cost: /\b(cost|capital|budget|funded|price|rate|commercial model|investment)\b/i,
  credibility_catch: /\b(catch|terms|assumptions?|verified|proof|risk|guarantee)\b/i,
  long_contract: /\b(term|contract|break|exit|long-term|property plans?)\b/i,
  busy_callback: /\b(call back|callback|day|time|date|calendar|meeting)\b/i,
  broker_incumbent: /\b(broker|consultant|incumbent|scope|onsite|supply contract)\b/i,
  tied_contract_renewal: /\b(renewal|notice|contract date|expires?|review point)\b/i,
  roof_site_move_size: /\b(roof|site|move|relocat|daytime|space|condition|structure|demand)\b/i,
  disruption_performance_maintenance_loan: /\b(disruption|performance|output|maintenance|loan|operations|risk|failure|responsib)\b/i,
  stakeholder: /\b(finance|landlord|operations|procurement|stakeholder|decision|who else|involved)\b/i,
  numbers: /\b(evidence|data|assumptions?|inputs?|numbers?|proof|bill|rate|spend)\b/i,
  esg: /\b(green|esg|net[- ]zero|priority|commercial trigger|approved suppliers?)\b/i,
});

// These signals are deliberately tied to the prospect's actual statement, not
// just the broad readiness family. A response must engage with the situation it
// was shown before method style or a generic next question can earn a pass.
const SITUATION_SIGNALS = Object.freeze({
  "gatekeeper-routing": /\b(company|calling|call about|reason for (?:the|my) call|who (?:normally )?handles|right person)\b/i,
  "send-information": /\b(email|send (?:it|something|information)|information|brochure|make it relevant|wrong thing)\b/i,
  "existing-solar": /\b(existing|already have solar|current system|current solar|daytime demand|expansion|battery|another site)\b/i,
  "prior-solar-review": /\b(looked (?:at it )?before|previous review|last time|did not proceed|didn't proceed|stopped|at the time)\b/i,
  "lease-landlord": /\b(lease|leased|landlord|building owner|owner consent|roof rights?)\b/i,
  "price-cost": /\b(cost|capital|capex|budget|funded route|commercial model|investment)\b/i,
  "credibility-catch": /\b(catch|too good|trade-?offs?|assumptions?|verify|evidence|guarantee|risk)\b/i,
  "long-contract": /\b(long(?:-| )term|contract term|break right|exit term|property plans?|lock (?:the business|you) in)\b/i,
  "busy-callback": /\b(call back|callback|better (?:day|time)|specific time|calendar|close this off)\b/i,
  "broker-incumbent": /\b(broker|consultant|incumbent|their scope|already covered|funded options?)\b/i,
  "tied-contract-renewal": /\b(renewal|notice date|contract date|expires?|review point|tied in)\b/i,
  "roof-site-move-size": /\b(old roof|roof condition|small site|move premises|moving|usable (?:roof )?space|site fit)\b/i,
  "disruption-performance-maintenance-loan": /\b(disruption|underperformance|output|maintenance|loan|operations|failure|responsibility|remed(?:y|ies))\b/i,
  "stakeholder-approval": /\b(finance director|landlord|operations team|stakeholders?|decision process|who else|need to agree)\b/i,
  "numbers-proof": /\b(numbers?|proof|evidence|data|assumptions?|inputs?|bill|tariff)\b/i,
  "esg-priority": /\b(green|esg|net[- ]zero|not a priority|commercial trigger|approved suppliers?)\b/i,
  "email-follow-up-context": /\b(email|message|remind|context|commercial energy|solar|why (?:i am|you're) calling)\b/i,
  "roof-data-source": /\b(roof data|data source|source|imagery|survey|verify|where (?:it|that) came from)\b/i,
  "wrong-person-route": /\b(wrong person|right person|which role|who handles|estates|energy contracts?)\b/i,
  "unit-rate-unknown": /\b(unit rate|electricity spend|rough band|above or below|bills?|who holds)\b/i,
  "low-electricity-spend": /\b(15,?000|fifteen thousand|low spend|below (?:the )?threshold|larger site|uneconomic)\b/i,
  "roof-condition-old": /\b(old roof|roof condition|replac(?:e|ing|ement)|roof life|rule (?:the )?site out)\b/i,
  "limited-roof-area": /\b(roof (?:space|area)|plant|skylights?|usable area|shading|access|fire routes?)\b/i,
  "low-daytime-demand": /\b(daytime|overnight|load profile|baseload|export|battery|night)\b/i,
  "no-budget-capex": /\b(no (?:capital|capex) budget|capital budget|funded route|long-term energy agreement|funding)\b/i,
  "ppa-price-question": /\b(kilowatt|kwh|unit price|ppa price|rate|indexation|site inputs?|responsible price)\b/i,
  "moving-premises": /\b(move|moving|relocat|next premises|two years?|long-term commitment)\b/i,
  "panel-aesthetics": /\b(look|aesthetic|visible|visibility|heritage|low-visibility|appearance|directors?)\b/i,
  "installation-disruption": /\b(disrupt|production|operations?|outage|access|installation programme|safety)\b/i,
  "output-underperformance": /\b(underperform|output|forecast|produce|generation|degradation|availability|remed(?:y|ies))\b/i,
  "maintenance-responsibility": /\b(maintain|maintenance|failure|fails|response time|replacement|cost exposure|responsib)\b/i,
  "loan-confusion": /\b(loan|security|secured|legal structure|accounting|roof rights?|finance structure)\b/i,
  "finance-director-not-present": /\b(finance director|finance team|what (?:they|the fd) need|join the next|authority)\b/i,
  "send-numbers-only": /\b(numbers?|projected savings|email|meeting|assumptions?|inputs?|evidence)\b/i,
  "already-net-zero-plan": /\b(net[- ]zero|approved suppliers?|existing plan|procurement|incumbent|supplier list)\b/i,
  "specific-callback": /\b(board meeting|next month|after (?:the|your) meeting|specific (?:day|date|time)|calendar)\b/i,
});

const SITUATION_FAMILIES = new Map(
  COMMERCIAL_SOLAR_SITUATIONS.map((situation) => [situation.id, situation.family]),
);

const RESPONSE_STOP_WORDS = new Set([
  "and", "are", "but", "can", "could", "did", "does", "fair", "for", "from",
  "have", "how", "into", "just", "may", "might", "not", "our", "that", "the",
  "their", "this", "understand", "what", "when", "where", "which", "who", "with",
  "would", "you", "your",
]);

function responseFingerprint(text) {
  const normalized = String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

function responseTokenHashes(text) {
  const tokens = String(text || "").toLowerCase().match(/[a-z0-9]+/g) || [];
  return [...new Set(tokens
    .filter((token) => token.length >= 3 && !/\d/.test(token) && !RESPONSE_STOP_WORDS.has(token))
    .map((token) => crypto.createHash("sha256").update(token).digest("hex").slice(0, 16)))]
    .sort();
}

function scoreSituationAttempt(text, situation, methodPack = null) {
  if (!situation) return scoreGauntletAnswer(text);
  if (situation.terminal || situation.type === "hard_no") return scoreHardNoCleanExit(text);
  const value = String(text || "");
  const acknowledged = /\b(fair|understand|understood|makes sense|of course|no problem|that may|reasonable|certainly)\b/i.test(value);
  const contextual = (FAMILY_SIGNALS[situation.family] || /$a/).test(value);
  const situationSpecific = (SITUATION_SIGNALS[situation.id] || /$a/).test(value);
  const matchedSituationFamilies = new Set(Object.entries(SITUATION_SIGNALS)
    .filter(([, signal]) => signal.test(value))
    .map(([situationId]) => SITUATION_FAMILIES.get(situationId))
    .filter(Boolean));
  const wordCount = value.trim().split(/\s+/).filter(Boolean).length;
  const move = situation.recommendedMove || "clarify";
  const nextMove = move === "route"
    ? /\b(who|which role|involved|process|route|landlord|finance|procurement|owner)\b/i.test(value)
    : move === "commercial_explain"
      ? /\b(depends|terms|route|model|evidence|verify|assumptions?|contract|cost|risk)\b/i.test(value)
      : /\?/.test(value);
  const methodId = methodPack?.manifest?.id || methodPack?.id || "";
  const methodSignal = methodId === "jeremy-miner-nepq-ppa"
    ? /\b(might|could|possibly|not sure|if anything|when you say|how so|what specifically|would it)\b/i.test(value)
    : methodId === "hormozi-sales-2026"
      ? /\b(fair|understand|what specifically|which|who|what would|fit|route|three)\b/i.test(value)
      : true;
  const unsafe = /\b(guaranteed|definitely|obviously|free solar|you must|no-brainer)\b/i.test(value);
  let score = Number(acknowledged) * 2
    + Number(contextual && situationSpecific) * 3
    + Number(nextMove) * 3
    + Number(methodSignal) * 2;
  if (!contextual || !situationSpecific) score = Math.min(score, 6);
  // A real objection response should be brief and focused. Keyword unions that
  // touch many unrelated call situations are not evidence of handling this one.
  if (matchedSituationFamilies.size > 5 || wordCount > 60) score = Math.min(score, 3);
  if (unsafe) score = Math.min(score, 3);
  return Math.max(0, Math.min(10, score));
}

function scoreHardNoCleanExit(text) {
  const value = String(text || "").toLowerCase();
  const cleanExit = /\b(understand|understood|fair|close this off|take you off|will not push|won't push|thanks|thank you|bye)\b/.test(
    value,
  );
  const pushed = /\?|\b(ppa|solar|funded|no upfront|site review|just explain|one (?:quick|last) question|can i ask|but)\b/.test(value);
  if (cleanExit && !pushed) return 10;
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
  scoreSituationAttempt,
  responseFingerprint,
  responseTokenHashes,
  summarizeGauntlet,
};
