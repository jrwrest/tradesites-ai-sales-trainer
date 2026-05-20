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
];

function findApprovedResponse({ objectionId, recommendedMove, skill }) {
  return (
    APPROVED_RESPONSES.find(
      (example) =>
        example.objectionId === objectionId &&
        (!recommendedMove || example.recommendedMove === recommendedMove),
    ) ||
    APPROVED_RESPONSES.find((example) => skill && example.skill === skill) ||
    null
  );
}

function findApprovedResponseForDrill(drill) {
  return findApprovedResponse({ skill: drill?.skill });
}

module.exports = {
  APPROVED_RESPONSES,
  findApprovedResponse,
  findApprovedResponseForDrill,
};
