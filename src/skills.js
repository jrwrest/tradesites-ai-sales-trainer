const SKILLS = [
  "opener_clarity",
  "permission_ask",
  "relevance_statement",
  "gatekeeper_control",
  "discovery_question_quality",
  "objection_acknowledgement",
  "authority_mapping",
  "commercial_model_explanation",
  "ppa_capex_distinction",
  "landlord_tenant_routing",
  "procurement_navigation",
  "incumbent_handling",
  "timing_followup",
  "hard_no_clean_exit",
  "next_step_close",
];

const DRILL_PRIORITY = [
  "hard_no_clean_exit",
  "landlord_tenant_routing",
  "procurement_navigation",
  "incumbent_handling",
  "relevance_statement",
  "discovery_question_quality",
  "next_step_close",
  "permission_ask",
  "objection_acknowledgement",
  "authority_mapping",
  "commercial_model_explanation",
  "ppa_capex_distinction",
  "timing_followup",
  "gatekeeper_control",
  "opener_clarity",
];

function clampScore(score) {
  return Math.max(0, Math.min(10, Math.round(score)));
}

function turnText(turns, role) {
  return turns
    .filter((turn) => turn.role === role || (role === "persona" && turn.speaker === "customer") || (role === "user" && turn.speaker === "rep"))
    .map((turn) => String(turn.text || "").toLowerCase())
    .join(" ");
}

function hasHardNo(text) {
  return /\b(no requirement|take us off|call list|wasting your time|no use for it|absolutely no use|do not call)\b/.test(
    text,
  );
}

function scoreContextRouting({ customerText, repText, trigger, goodResponse }) {
  if (!trigger.test(customerText)) return 6;
  return goodResponse.test(repText) ? 8 : 3;
}

function scoreHardNoExit(turns) {
  const hardNoIndex = turns.findIndex(
    (turn) => (turn.role === "persona" || turn.speaker === "customer") && hasHardNo(String(turn.text || "").toLowerCase()),
  );
  if (hardNoIndex === -1) return 6;

  const repAfterHardNo = turns
    .slice(hardNoIndex + 1)
    .filter((turn) => turn.role === "user" || turn.speaker === "rep")
    .map((turn) => String(turn.text || "").toLowerCase())
    .join(" ");

  if (!repAfterHardNo.trim()) return 5;
  const cleanExit = /\b(fair enough|understand|thanks|thank you|bye|leave it there|won't push|will not push|remove|take you off)\b/.test(
    repAfterHardNo,
  );
  const pushedAfterNo = /\b(ppa|solar|funded|no upfront|site review|heard of|not trying to sell|do you have)\b/.test(
    repAfterHardNo,
  );
  if (cleanExit && !pushedAfterNo) return 9;
  if (pushedAfterNo) return 2;
  return cleanExit ? 7 : 3;
}

function buildSkillScores({ turns, categories }) {
  const repText = turnText(turns, "user");
  const customerText = turnText(turns, "persona");
  const permissionAsked = /\b(can i take|could i take|do you have|is now okay|is now ok|quick question|permission)\b/.test(
    repText,
  );
  const relevanceStated = /\b(solar|ppa|energy|renewable|site|commercial|electricity|roof)\b/.test(repText);
  const commercialExplained = /\b(ppa|power purchase|funded|no upfront|capex|capital|savings|tariff)\b/.test(repText);
  const customerRaisedObjection =
    /\b(send something|no requirement|take us off|landlord|do not own|don't own|not own|procurement|sustainability|already have solar|energy consultant|no upfront|budget|priority|busy)\b/.test(
      customerText,
    );
  const customerRaisedAuthority =
    /\b(procurement|sustainability|finance|estates|landlord|decision|who handles|managing director)\b/.test(
      customerText,
    );
  const nextStep = /\b(meeting|call|next step|book|schedule|review|audit|send|email|tomorrow|today|monday|tuesday|wednesday|thursday|friday)\b/.test(
    repText,
  );

  return {
    schemaVersion: 1,
    opener_clarity: clampScore(categories.opener),
    permission_ask: permissionAsked ? 8 : 4,
    relevance_statement: relevanceStated ? 7 : 4,
    gatekeeper_control: /\b(peter|available|back|who should|who handles|best person)\b/.test(repText) ? 6 : 5,
    discovery_question_quality: clampScore(categories.discovery),
    objection_acknowledgement: customerRaisedObjection ? clampScore(categories.objectionHandling) : 6,
    authority_mapping: customerRaisedAuthority
      ? /\b(who|decision|procurement|sustainability|landlord|finance|estates|managing director|who manages|who handles)\b/.test(
          repText,
        )
        ? 7
        : 4
      : 6,
    commercial_model_explanation: commercialExplained ? 7 : 6,
    ppa_capex_distinction: /\b(ppa|power purchase|no upfront|capex|capital)\b/.test(repText) ? 7 : 6,
    landlord_tenant_routing: scoreContextRouting({
      customerText,
      repText,
      trigger: /\b(landlord|do not own|don't own|not own|leased|building)\b/,
      goodResponse: /\b(landlord|approval|who manages|who handles|building owner|lease)\b/,
    }),
    procurement_navigation: scoreContextRouting({
      customerText,
      repText,
      trigger: /\b(procurement|sustainability|finance|estates|committee)\b/,
      goodResponse: /\b(procurement|sustainability|finance|estates|process|who else)\b/,
    }),
    incumbent_handling: scoreContextRouting({
      customerText,
      repText,
      trigger: /\b(already have solar|energy consultant|consultant|installed)\b/,
      goodResponse: /\b(already|consultant|installed|what are they looking|alongside|benchmark)\b/,
    }),
    timing_followup: nextStep ? 7 : 3,
    hard_no_clean_exit: scoreHardNoExit(turns),
    next_step_close: clampScore(categories.close),
  };
}

function assignNextDrill(evaluation, now = new Date()) {
  const skillScores = evaluation.skillScores || {};
  const weakSkills = DRILL_PRIORITY.filter((skill) => skillScores[skill] <= 5);
  const skill = weakSkills[0];
  if (!skill) return null;

  const nextDueAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  return {
    schemaVersion: 1,
    skill,
    reason: `Lowest priority weak skill scored ${skillScores[skill]}/10.`,
    nextDueAt,
  };
}

module.exports = {
  DRILL_PRIORITY,
  SKILLS,
  assignNextDrill,
  buildSkillScores,
};
