const APPROVED_RESPONSES = [
  {
    objectionId: "send-info",
    recommendedMove: "clarify",
    skill: "discovery_question_quality",
    text: "Of course. To avoid sending the wrong thing, can I ask one quick question first: is this site owned, leased, or managed by a landlord?",
  },
  {
    objectionId: "no-requirement",
    recommendedMove: "exit",
    skill: "hard_no_clean_exit",
    text: "Understood. I will close this off and make sure we do not keep chasing. Thanks for letting me know.",
  },
  {
    objectionId: "landlord",
    recommendedMove: "route",
    skill: "landlord_tenant_routing",
    text: "Completely understand. For leased sites, the owner would need to be involved before anything moved forward. Is the landlord route realistic here?",
  },
  {
    objectionId: "procurement",
    recommendedMove: "route",
    skill: "procurement_navigation",
    text: "Makes sense. For projects like this, who normally owns the first filter: energy, estates, procurement, or sustainability?",
  },
  {
    objectionId: "budget-free-claim",
    recommendedMove: "commercial_explain",
    skill: "ppa_capex_distinction",
    text: "Fair challenge. I would not describe it as free. The useful first check is whether the site has enough demand and suitability for funded solar to make sense.",
  },
  {
    objectionId: "incumbent-consultant",
    recommendedMove: "qualify",
    skill: "incumbent_handling",
    text: "That is good. I am not trying to replace them. Are they mainly checking capex, or are they also looking at funded/PPA and landlord routes?",
  },
  {
    objectionId: "power-payback-is-this-solar-call",
    recommendedMove: "ask_permission",
    skill: "permission_ask",
    text: "Fair question. It is {repName} from {companyName}. I am not calling to pitch an install today. We build a Power Payback Report for manufacturers. Can I ask one quick question to see if it is even relevant?",
  },
  {
    objectionId: "power-payback-already-have-panels",
    recommendedMove: "qualify",
    skill: "incumbent_handling",
    text: "That may mean you have already taken the obvious first step. I did not want to assume from an image. Is the current setup covering most of your daytime load, or has anyone checked expansion, battery, export, or tariff savings recently?",
  },
  {
    objectionId: "power-payback-no-bill",
    recommendedMove: "qualify",
    skill: "electricity_spend_gate",
    text: "No problem, I would not expect you to have the bill open. Roughly, are you above or below about GBP 50,000 a year on electricity?",
  },
  {
    objectionId: "power-payback-why-pay",
    recommendedMove: "commercial_explain",
    skill: "paid_report_close",
    text: "Fair question. The reason it is paid is that it is not a generic brochure or free quote. It is a site-specific report, and the GBP 500 is credited back if you proceed.",
  },
  {
    objectionId: "power-payback-send-info",
    recommendedMove: "clarify",
    skill: "electricity_spend_gate",
    text: "Of course. So I send the right thing rather than a generic deck, can I ask one gate question first: is the site roughly above GBP 50,000 a year in electricity spend?",
  },
  {
    objectionId: "power-payback-finance-approval",
    recommendedMove: "route",
    skill: "decision_process_map",
    text: "Makes sense. For a GBP 500 diagnostic, what would finance need to see: the scope, the savings threshold, or who credits it back if the project proceeds?",
  },
  {
    objectionId: "power-payback-no-savings",
    recommendedMove: "commercial_explain",
    skill: "risk_reversal_fallback",
    text: "If we have qualified the site and that is your main concern, we can do GBP 0 down, card on file, and you only pay if the report shows at least 10% savings.",
  },
];

function findApprovedResponse({ objectionId, recommendedMove, skill, methodPack, profile } = {}) {
  const example = (
    APPROVED_RESPONSES.find(
      (example) =>
        example.objectionId === objectionId &&
        (!recommendedMove || example.recommendedMove === recommendedMove),
    ) ||
    APPROVED_RESPONSES.find((example) => skill && example.skill === skill) ||
    null
  );
  if (!example || !methodPack || methodPack.manifest.id !== "hormozi-sales-2026") return example;
  const { renderCoachingTemplate } = require("./methodCoaching");
  return { ...example, text: renderCoachingTemplate(example.text, profile, methodPack) };
}

function findApprovedResponseForDrill(drill, options = {}) {
  return findApprovedResponse({ skill: drill?.skill, ...options });
}

module.exports = {
  APPROVED_RESPONSES,
  findApprovedResponse,
  findApprovedResponseForDrill,
};
