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

const manufacturerPowerPaybackPlaybook = {
  id: "manufacturer-power-payback-report",
  name: "Manufacturer Power Payback Report Objection Gauntlet",
  maxObjectionsPerCall: 6,
  sourceNotes: [
    "Treat the report as a paid diagnostic, not a free solar quote.",
    "Qualify GBP 50k+ electricity spend, site control, and the decision route before closing.",
    "If GBP 500 creates friction, use the GBP 0-down card-on-file fallback only after confirming fit.",
    "Do not assume roof panels from satellite imagery; ask neutrally and let the prospect confirm.",
  ],
  objections: [
    {
      id: "power-payback-is-this-solar-call",
      stage: "opener",
      type: "gatekeeper",
      triggerAfterTurns: 0,
      text: "Is this just another solar sales call?",
      coaching: [
        "Acknowledge the concern without defending.",
        "Frame the call as a quick power-cost fit check and paid report, not an install pitch.",
        "Ask permission for one relevant question.",
      ],
      tryThis:
        "Fair question. It is James from Solar Future Scotland. I am not calling to pitch an install today. We build a short Power Payback Report for manufacturers to see whether solar, PPA, battery, or tariff options are worth a proper look. Can I ask one quick question to see if it is even relevant?",
    },
    {
      id: "power-payback-already-have-panels",
      stage: "discovery",
      type: "existing_solution",
      triggerAfterTurns: 2,
      text: "We might already have panels on the roof.",
      coaching: [
        "Do not claim the satellite image proves anything.",
        "Ask whether the current setup covers enough daytime demand.",
        "Look for expansion, battery, export, tariff, or another site rather than arguing.",
      ],
      tryThis:
        "That may mean you have already taken the obvious first step. I did not want to assume from an image. Is the current setup covering most of your daytime load, or has anyone checked expansion, battery, export, or tariff savings recently?",
    },
    {
      id: "power-payback-no-bill",
      stage: "qualification",
      type: "qualification",
      triggerAfterTurns: 2,
      text: "I do not have our electricity bill in front of me.",
      coaching: [
        "Do not ask for exact private figures immediately.",
        "Use the GBP 50k annual spend threshold as a rough gate.",
        "Explain that below the threshold it may not be worth their time.",
      ],
      tryThis:
        "No problem, I would not expect you to have the bill open. Roughly, are you above or below about GBP 50,000 a year on electricity? If you are well below that, I would probably close this off rather than waste your time.",
    },
    {
      id: "power-payback-why-pay",
      stage: "commercial",
      type: "commercial_risk",
      triggerAfterTurns: 3,
      text: "Why would we pay GBP 500 for a report?",
      coaching: [
        "Do not apologize for charging.",
        "Position the fee as a filter for a site-specific commercial report.",
        "Tie it to avoided wasted time and crediting it back if they proceed.",
      ],
      tryThis:
        "Fair question. The reason it is paid is that it is not a generic brochure or free quote. We check the site, usage route, likely savings options, and whether a funded or capex route is worth pursuing. The GBP 500 is credited back if you proceed, so the real question is whether the possible saving is big enough to justify a proper diagnostic.",
    },
    {
      id: "power-payback-send-info",
      stage: "permission",
      type: "dismissive",
      triggerAfterTurns: 1,
      text: "Just send me the information first.",
      coaching: [
        "Acknowledge the request.",
        "Avoid sending a generic report pitch to an unqualified prospect.",
        "Ask one gate question so the follow-up is relevant.",
      ],
      tryThis:
        "Of course. So I send the right thing rather than a generic deck, can I ask one gate question first: is the site roughly above GBP 50,000 a year in electricity spend?",
    },
    {
      id: "power-payback-finance-approval",
      stage: "close",
      type: "authority",
      triggerAfterTurns: 4,
      text: "I would need to speak to finance before paying for anything.",
      coaching: [
        "Respect the decision route.",
        "Ask what finance would need to approve a small diagnostic.",
        "Do not try to bypass finance; map the next step.",
      ],
      tryThis:
        "Makes sense. For a GBP 500 diagnostic, what would finance need to see: the scope, the savings threshold, or who credits it back if the project proceeds?",
    },
    {
      id: "power-payback-too-busy",
      stage: "commercial",
      type: "timing",
      triggerAfterTurns: 3,
      text: "We are too busy for another supplier review.",
      coaching: [
        "Agree that they should not run a supplier review without a strong reason.",
        "Reframe the report as a way to avoid supplier time unless the numbers justify it.",
        "Ask whether a short evidence-led review would be useful later.",
      ],
      tryThis:
        "I agree, a supplier review is only worth doing if there is a strong enough number behind it. The point of the report is to avoid dragging your team into quotes unless the saving is real. If we kept your input to the minimum, would a report only be useful if it showed a 10% plus saving?",
    },
    {
      id: "power-payback-no-savings",
      stage: "close",
      type: "commercial_risk",
      triggerAfterTurns: 4,
      text: "What happens if your report does not find any savings?",
      coaching: [
        "Use the risk reversal plainly.",
        "Keep the fallback conditional on qualified fit.",
        "Do not overpromise the result.",
      ],
      tryThis:
        "If we have qualified the site and that is your main concern, we can do the GBP 0-down version: card on file, and you only pay if the report shows at least 10% savings. If it does not, you have not paid for a poor-fit report.",
    },
  ],
};

const PLAYBOOKS = [enterpriseObjectionPlaybook, manufacturerPowerPaybackPlaybook];

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
  return PLAYBOOKS.find((playbook) => playbook.id === id) || null;
}

function getObjectionById(id) {
  for (const playbook of PLAYBOOKS) {
    const objection = playbook.objections.find((item) => item.id === id);
    if (objection) return objection;
  }
  return null;
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
  return /\b(solar|energy|ppa|power purchase|commercial|site|electricity|renewable|roof|installer|company|business|manufacturer|manufacturing|factory|power payback|report|electricity spend|calling about|reason for (the )?call|20 seconds|twenty seconds)\b/i.test(
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
  if (["existing_solution", "qualification", "timing"].includes(objection.type)) return "qualify";
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
    const playbook = getPlaybook(scenario.objectionPlaybookId);
    return {
      stage,
      objectionId: objection.id,
      objectionType: objection.type,
      recommendedMove: recommendedMoveForObjection(objection),
      title: objection.terminal ? "Respect the hard no" : `Handle: ${objection.text}`,
      suggestions: objection.coaching,
      tryThis: objection.tryThis,
      source: playbook?.id || "playbook",
    };
  }

  const manufacturerFallback = {
    opener: {
      title: "Earn permission for the report",
      suggestions: [
        "State name, company, and why this is about power cost rather than a generic solar pitch.",
        "Ask for a small amount of time.",
        "Give them an easy out if the site is not a fit.",
      ],
      tryThis:
        "It is James from Solar Future Scotland. I am calling about a Power Payback Report for manufacturers. If your electricity spend is not high enough, I can close it off. Can I take 20 seconds?",
    },
    permission: {
      title: "Ask one gate question",
      suggestions: [
        "Do not pitch the report yet.",
        "Qualify electricity spend first.",
        "Use the GBP 50,000 annual spend threshold as the first filter.",
      ],
      tryThis: "Roughly, are you above or below about GBP 50,000 a year on electricity?",
    },
    discovery: {
      title: "Qualify the business case",
      suggestions: [
        "Ask about electricity spend, site control, and existing roof/panel context.",
        "Do not assume from satellite imagery.",
        "Look for pain before mentioning the GBP 500 close.",
      ],
      tryThis:
        "Has anyone recently checked whether the site is better suited to extra solar, battery, PPA, or tariff savings?",
    },
    qualification: {
      title: "Map control and decision route",
      suggestions: [
        "Find whether they own, lease, or need landlord approval.",
        "Ask who signs off a small diagnostic report.",
        "Route finance/procurement instead of bypassing them.",
      ],
      tryThis: "Who would normally need to be involved before a GBP 500 diagnostic report could be approved?",
    },
    commercial: {
      title: "Frame the GBP 500 report",
      suggestions: [
        "Explain why the report is paid.",
        "Tie the fee to a site-specific diagnostic, not a brochure.",
        "Mention it is credited back if they proceed.",
      ],
      tryThis:
        "The GBP 500 is for a site-specific report, not a generic quote, and it is credited back if you proceed. Would the possible saving justify checking it properly?",
    },
    close: {
      title: "Close or use the fallback",
      suggestions: [
        "Ask directly for the GBP 500 report if qualified.",
        "If the fee is the blocker, use the GBP 0-down 10% savings fallback.",
        "Do not offer the fallback before confirming fit.",
      ],
      tryThis:
        "If the site is qualified, shall we put the GBP 500 report in motion? If the fee is the only concern, we can do GBP 0 down, card on file, and only invoice if it shows at least 10% savings.",
    },
  };

  const enterpriseFallback = {
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

  const fallback =
    scenario.objectionPlaybookId === manufacturerPowerPaybackPlaybook.id
      ? manufacturerFallback
      : enterpriseFallback;

  return {
    stage,
    objectionId: null,
    objectionType: null,
    recommendedMove: recommendedMoveForStage(stage),
    source: scenario.objectionPlaybookId || "playbook",
    ...fallback[stage],
  };
}

module.exports = {
  HARD_NO_PATTERN,
  HELP_MOVES,
  PLAYBOOKS,
  enterpriseObjectionPlaybook,
  manufacturerPowerPaybackPlaybook,
  getObjectionById,
  getPlaybook,
  inferStage,
  hasHardNo,
  recommendedMoveForObjection,
  recommendedMoveForStage,
  selectNextObjection,
  buildCoachingSuggestion,
};
