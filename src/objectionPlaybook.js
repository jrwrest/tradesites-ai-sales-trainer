const enterpriseObjectionPlaybook = {
  id: "enterprise-commercial-solar",
  name: "Enterprise Commercial Solar Objection Gauntlet",
  maxObjectionsPerCall: 5,
  sourceNotes: [
    "Validate the objection, label the concern, then ask a smaller secondary question.",
    "Encourage/question, confirm understanding, address, and check.",
    "For larger sales, avoid early pitching; use problem and implication questions before solution claims.",
    "SFS guardrails: keep it low-pressure, classify correctly, use small next steps, and cleanly exit on hard no.",
  ],
  objections: [
    {
      id: "gatekeeper-who-is-this",
      stage: "opener",
      type: "gatekeeper",
      triggerAfterTurns: 0,
      text: "Who exactly are you, and why are you calling us?",
      coaching: [
        "Lead with full name, company, and one clear reason for the call.",
        "Do not dodge the question or over-explain.",
        "Ask for permission to take 20 seconds, then give them an easy out.",
      ],
      tryThis:
        "Fair question. It is James from Solar Future Scotland. The reason for the call is a quick check on whether funded commercial solar is even relevant for this site. If it is not, I can close it off. Can I take 20 seconds?",
    },
    {
      id: "send-info",
      stage: "permission",
      type: "dismissive",
      triggerAfterTurns: 1,
      text: "Just send something over. I do not have time for a call.",
      coaching: [
        "Acknowledge the time pressure.",
        "Avoid agreeing to send a generic brochure.",
        "Ask one qualifying question so anything you send is relevant.",
      ],
      tryThis:
        "Of course. To avoid sending the wrong thing, can I ask one quick question first: is this site owned, leased, or managed by a landlord?",
    },
    {
      id: "no-requirement",
      stage: "permission",
      type: "hard_no",
      triggerAfterTurns: 1,
      text: "We have no requirement for this. Please take us off your list.",
      coaching: [
        "Treat this as a hard no unless they leave a clear opening.",
        "Do not pitch after a suppression request.",
        "Confirm you will close it and exit respectfully.",
      ],
      tryThis:
        "Understood. I will close this off and make sure we do not keep chasing. Thanks for letting me know.",
      terminal: true,
    },
    {
      id: "already-have-solar",
      stage: "discovery",
      type: "existing_solution",
      triggerAfterTurns: 2,
      text: "We already have solar installed, so I do not see why this is relevant.",
      coaching: [
        "Agree that owned solar can be the best route for existing output.",
        "Do not argue that PPA beats their own plant.",
        "Qualify only for expansion, battery, another site, or unmet demand.",
      ],
      tryThis:
        "That may well mean you have already done the sensible route. Is the current system covering all useful site demand, or is there still demand or another site that has not been looked at?",
    },
    {
      id: "landlord",
      stage: "qualification",
      type: "authority",
      triggerAfterTurns: 2,
      text: "We do not own the building. The landlord would never go for it.",
      coaching: [
        "Do not ask the tenant to approve roof works.",
        "Position landlord involvement as normal.",
        "Offer a forwardable note or close if landlord friction is high.",
      ],
      tryThis:
        "Completely understand. For leased sites, the owner would need to be involved before anything moved forward. Would a short landlord note be useful, or is the landlord route not realistic here?",
    },
    {
      id: "procurement",
      stage: "commercial",
      type: "process",
      triggerAfterTurns: 3,
      text: "Anything like this has to go through procurement and sustainability. I cannot just book a supplier call.",
      coaching: [
        "Respect the buying process.",
        "Ask how they normally evaluate energy projects.",
        "Aim for routing or a fit-check, not bypassing procurement.",
      ],
      tryThis:
        "Makes sense. For projects like this, who normally owns the first filter: energy, estates, procurement, or sustainability?",
    },
    {
      id: "budget-free-claim",
      stage: "commercial",
      type: "commercial_risk",
      triggerAfterTurns: 3,
      text: "No upfront cost usually means the catch shows up later. What is the actual commercial model?",
      coaching: [
        "Avoid saying free or guaranteed.",
        "Separate funded/PPA from capex.",
        "Offer to check fit before discussing numbers.",
      ],
      tryThis:
        "Fair challenge. I would not describe it as free. The funded route normally means the provider funds the install and the site buys the generated power under agreed terms. The useful first check is whether the site has enough demand and roof/site suitability for that to make sense.",
    },
    {
      id: "incumbent-consultant",
      stage: "discovery",
      type: "existing_solution",
      triggerAfterTurns: 2,
      text: "We already have an energy consultant looking at renewables.",
      coaching: [
        "Do not attack the incumbent.",
        "Position the call as a comparison or extra route.",
        "Ask if there is a specific site or funding route not yet covered.",
      ],
      tryThis:
        "That is good. I am not trying to replace them. Is their review mainly capex, or are they also checking funded/PPA options and landlord routes?",
    },
    {
      id: "multi-site-complexity",
      stage: "qualification",
      type: "complexity",
      triggerAfterTurns: 3,
      text: "We have multiple sites, different leases, and different meters. This is not a quick conversation.",
      coaching: [
        "Agree that it is not a one-call sale.",
        "Reduce the ask to one candidate site.",
        "Ask for the simplest route to identify the best site.",
      ],
      tryThis:
        "Agreed, it would not be sensible to treat all sites the same. Would it be worth starting with just the biggest owned or highest-usage site and ignoring the rest for now?",
    },
    {
      id: "not-priority",
      stage: "close",
      type: "timing",
      triggerAfterTurns: 3,
      text: "It might be sensible, but it is not a priority this quarter.",
      coaching: [
        "Validate timing.",
        "Look for a timing trigger such as contract renewal, budget cycle, or energy review.",
        "Offer a low-pressure reminder only if there is a real trigger.",
      ],
      tryThis:
        "That is fair. Is there a natural review point I should respect, like contract renewal, budget planning, or an energy review later in the year?",
    },
  ],
};

const HARD_NO_PATTERN =
  /\b(take (us|me) off|remove (us|me)|do not call|don't call|no requirement|not interested|wasting your time|stop calling)\b/i;

const HELP_MOVES = [
  { id: "acknowledge", label: "Acknowledge" },
  { id: "clarify", label: "Clarify" },
  { id: "ask_permission", label: "Ask permission" },
  { id: "qualify", label: "Qualify" },
  { id: "route", label: "Route" },
  { id: "commercial_explain", label: "Commercial explain" },
  { id: "exit", label: "Exit" },
];

function getPlaybook(id) {
  return id === enterpriseObjectionPlaybook.id ? enterpriseObjectionPlaybook : null;
}

function getObjectionById(id) {
  return enterpriseObjectionPlaybook.objections.find((objection) => objection.id === id) || null;
}

function inferStage(turns) {
  const userTurns = turns.filter((turn) => turn.role === "user").length;
  if (userTurns <= 0) return "opener";
  if (userTurns === 1) return "permission";
  if (userTurns === 2) return "discovery";
  if (userTurns === 3) return "qualification";
  if (userTurns === 4) return "commercial";
  return "close";
}

function hasHardNo(turns) {
  return turns.some((turn) => turn.role === "persona" && HARD_NO_PATTERN.test(turn.text || ""));
}

function seededIndex(seedText, modulo) {
  const hash = Array.from(seedText).reduce(
    (total, char) => (total * 31 + char.charCodeAt(0)) >>> 0,
    7,
  );
  return modulo === 0 ? 0 : hash % modulo;
}

function hasCallContext(text = "") {
  return /\b(solar|energy|ppa|power purchase|commercial|site|electricity|renewable|roof|installer|company|business|calling about|reason for (the )?call|20 seconds|twenty seconds)\b/i.test(
    text,
  );
}

function selectNextObjection({ session, scenario, repMessage }) {
  if (hasHardNo(session.turns)) return null;
  const playbook = getPlaybook(scenario.objectionPlaybookId);
  if (!playbook) return null;

  const usedIds = new Set(
    (session.turns || [])
      .map((turn) => turn.objectionId)
      .filter((value) => typeof value === "string" && value.length > 0),
  );
  if (usedIds.size >= playbook.maxObjectionsPerCall) return null;

  const stage = inferStage(session.turns);
  const userTurnCount = session.turns.filter((turn) => turn.role === "user").length;

  if (userTurnCount <= 1 && !hasCallContext(repMessage)) {
    const gatekeeper = playbook.objections.find((objection) => objection.id === "gatekeeper-who-is-this");
    if (gatekeeper && !usedIds.has(gatekeeper.id)) return gatekeeper;
  }

  const candidates = playbook.objections.filter((objection) => {
    if (usedIds.has(objection.id)) return false;
    if (userTurnCount < objection.triggerAfterTurns) return false;
    return objection.stage === stage || (stage === "close" && objection.stage === "commercial");
  });

  if (candidates.length === 0) return null;
  return candidates[
    seededIndex(`${session.id}:${repMessage}:${usedIds.size}:${stage}`, candidates.length)
  ];
}

function recommendedMoveForObjection(objection) {
  if (!objection) return "clarify";
  if (objection.terminal || objection.type === "hard_no") return "exit";
  if (objection.type === "commercial_risk") return "commercial_explain";
  if (["authority", "process", "complexity"].includes(objection.type)) return "route";
  if (["existing_solution", "timing"].includes(objection.type)) return "qualify";
  if (objection.type === "gatekeeper") return "ask_permission";
  if (objection.type === "dismissive") return "clarify";
  return "acknowledge";
}

function recommendedMoveForStage(stage) {
  const byStage = {
    opener: "ask_permission",
    permission: "clarify",
    discovery: "qualify",
    qualification: "route",
    commercial: "commercial_explain",
    close: "exit",
  };
  return byStage[stage] || "clarify";
}

function buildCoachingSuggestion({ scenario, session }) {
  const latestPersonaTurn = [...(session.turns || [])]
    .reverse()
    .find((turn) => turn.role === "persona");
  const objection = latestPersonaTurn?.objectionId
    ? getObjectionById(latestPersonaTurn.objectionId)
    : null;
  const stage = inferStage(session.turns || []);

  if (objection) {
    return {
      stage,
      objectionId: objection.id,
      objectionType: objection.type,
      recommendedMove: recommendedMoveForObjection(objection),
      title: objection.terminal ? "Respect the hard no" : `Handle: ${objection.text}`,
      suggestions: objection.coaching,
      tryThis: objection.tryThis,
      source: "enterprise-playbook",
    };
  }

  const fallback = {
    opener: {
      title: "Earn permission",
      suggestions: [
        "Use full name and company.",
        "Say the reason for the call in one sentence.",
        "Ask for a small amount of time and give an easy exit.",
      ],
      tryThis:
        "I know I am calling out of the blue. The reason is a quick commercial solar fit check. If it is not relevant, I can close it off. Can I take 20 seconds?",
    },
    permission: {
      title: "Keep the ask small",
      suggestions: [
        "Do not pitch the whole offer.",
        "Ask one qualifying question.",
        "Stay calm if they push back.",
      ],
      tryThis: "Can I ask one quick question so I know whether to close this or route it properly?",
    },
    discovery: {
      title: "Find the business reason",
      suggestions: [
        "Ask about site ownership, energy usage, and timing.",
        "Avoid quoting savings before facts are known.",
        "Listen for contract renewal, multi-site, or landlord clues.",
      ],
      tryThis:
        "What usually triggers an energy project review for you: contract renewal, budget, ESG, or site changes?",
    },
    qualification: {
      title: "Qualify the route",
      suggestions: [
        "Find the right stakeholder.",
        "Separate tenant, landlord, estates, procurement, and sustainability roles.",
        "Ask for the next smallest routing step.",
      ],
      tryThis: "Who would normally be involved before a site like this could even be assessed?",
    },
    commercial: {
      title: "Avoid over-claiming",
      suggestions: [
        "Do not say free or guaranteed.",
        "Separate funded/PPA from capex.",
        "Ask what a credible business case would need to prove.",
      ],
      tryThis:
        "What would the business case need to show before this would be worth anyone's time internally?",
    },
    close: {
      title: "Close cleanly",
      suggestions: [
        "Ask for a specific next step only if there is fit.",
        "If there is no requirement, confirm closure.",
        "Do not push after a suppression request.",
      ],
      tryThis:
        "Based on what you have said, should I close this off, or is there one person/site where a quick check would still be useful?",
    },
  };

  return {
    stage,
    objectionId: null,
    objectionType: null,
    recommendedMove: recommendedMoveForStage(stage),
    source: "enterprise-playbook",
    ...fallback[stage],
  };
}

module.exports = {
  HARD_NO_PATTERN,
  HELP_MOVES,
  enterpriseObjectionPlaybook,
  getObjectionById,
  getPlaybook,
  inferStage,
  hasHardNo,
  recommendedMoveForObjection,
  recommendedMoveForStage,
  selectNextObjection,
  buildCoachingSuggestion,
};
