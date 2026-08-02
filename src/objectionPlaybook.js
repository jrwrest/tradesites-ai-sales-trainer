const enterpriseObjectionPlaybook = {
  id: "enterprise-commercial-solar",
  name: "Enterprise Commercial Solar Objection Gauntlet",
  maxObjectionsPerCall: 5,
  sourceNotes: [
    "Validate the objection, label the concern, then ask a smaller secondary question.",
    "Encourage/question, confirm understanding, address, and check.",
    "For larger sales, avoid early pitching; use problem and implication questions before solution claims.",
    "Trainer guardrails: keep it low-pressure, classify correctly, use small next steps, and cleanly exit on hard no.",
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
        "Fair question. It is {repName} from {companyName}. The reason for the call is a quick check on whether funded commercial solar is even relevant for this site. If it is not, I can close it off. Can I take 20 seconds?",
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

function commercialSolarSituation({
  id,
  family,
  stage,
  type,
  text,
  fact,
  methodCoachingKey,
  terminal = false,
}) {
  const situation = {
    id,
    family,
    stage,
    type,
    triggerAfterTurns: stage === "opener" ? 0 : stage === "permission" ? 1 : 2,
    text,
    coaching: [fact],
    tryThis: "",
    terminal: Boolean(terminal),
    methodCoachingKey,
    industryFacts: { boundary: fact },
  };
  situation.recommendedMove = recommendedMoveForObjection(situation);
  return Object.freeze(situation);
}

// The supplied Solar Future Scotland PPA playbook is used here only as the
// situation/fact layer. Alex and Jeremy method packs independently own how a
// rep is coached and scored through the same prospect condition.
const COMMERCIAL_SOLAR_SITUATIONS = Object.freeze([
  commercialSolarSituation({ id: "gatekeeper-routing", family: "gatekeeper", stage: "opener", type: "gatekeeper", text: "What company is this, what is the call about, and who are you trying to reach?", fact: "A gatekeeper may route the call but should not be misled about identity or purpose.", methodCoachingKey: "identity_and_permission", tryThis: "It is {repName} from {companyName}, calling about a commercial energy fit check. Who normally handles electricity contracts or site energy projects?" }),
  commercialSolarSituation({ id: "send-information", family: "send_info", stage: "permission", type: "dismissive", text: "Send the information by email and I will look at it if it is relevant.", fact: "A useful email depends on one or two fit facts; a generic brochure does not qualify the site.", methodCoachingKey: "clarify_before_email", tryThis: "Of course. To make it relevant, may I check one thing first: is the building owned or leased?" }),
  commercialSolarSituation({ id: "existing-solar", family: "existing_solar", stage: "discovery", type: "existing_solution", text: "We already have solar, so there is nothing else to discuss.", fact: "Existing solar may still leave expansion, battery, export, tariff, or additional-site opportunities, but those must be verified.", methodCoachingKey: "existing_solution_gap", tryThis: "That may mean this is already covered. Is the current system meeting most daytime demand, or is there an unreviewed site or expansion need?" }),
  commercialSolarSituation({ id: "prior-solar-review", family: "prior_solar", stage: "discovery", type: "existing_solution", text: "We looked at solar before and decided not to proceed.", fact: "A prior review may have failed for roof, payback, funding, timing, or stakeholder reasons; do not assume which.", methodCoachingKey: "prior_attempt_reason", tryThis: "Understood. What was the main reason it did not move forward at the time?" }),
  commercialSolarSituation({ id: "lease-landlord", family: "lease_landlord", stage: "qualification", type: "authority", text: "We lease the building and the landlord controls the roof.", fact: "Roof rights and landlord consent are genuine fit and authority constraints.", methodCoachingKey: "landlord_route", tryThis: "That makes sense. Is landlord involvement realistic, or should we close this site off?" }),
  commercialSolarSituation({ id: "price-cost", family: "price_cost", stage: "commercial", type: "commercial_risk", text: "What will this cost us, and do we need capital available?", fact: "Capex and funded/PPA routes have different ownership, payment, term, and risk structures; neither should be described as free.", methodCoachingKey: "commercial_model", tryThis: "It depends on whether capex or a funded route fits. Before quoting anything, may I check your spend and site-control position?" }),
  commercialSolarSituation({ id: "credibility-catch", family: "credibility_catch", stage: "commercial", type: "commercial_risk", text: "This sounds too good to be true. Where is the catch?", fact: "PPA economics depend on demand, tariff, system output, contract terms, roof suitability, and provider diligence; savings are not guaranteed.", methodCoachingKey: "risk_transparency", tryThis: "That is a fair concern. The trade-offs are in site fit, output assumptions, and the contract terms. Which part would you want verified first?" }),
  commercialSolarSituation({ id: "long-contract", family: "long_contract", stage: "commercial", type: "commercial_risk", text: "We will not lock the business into a long energy contract.", fact: "A PPA can involve a long-term commitment; term, price mechanics, break rights, and property plans require review.", methodCoachingKey: "contract_term", tryThis: "Understood. Is the concern the term itself, future property plans, or the price and exit terms inside it?" }),
  commercialSolarSituation({ id: "busy-callback", family: "busy_callback", stage: "permission", type: "timing", text: "I am busy and about to go into a meeting. Call another time.", fact: "A callback is only useful when a specific time and appropriate contact are agreed.", methodCoachingKey: "specific_callback", tryThis: "No problem. Is there a better day and time, or would you prefer I close this off?" }),
  commercialSolarSituation({ id: "hard-opt-out", family: "source_opt_out", stage: "permission", type: "hard_no", text: "Where did you get my number? Do not call me again and remove me from your list.", fact: "An explicit do-not-call request is terminal and must be actioned without further persuasion.", methodCoachingKey: "hard_no_exit", tryThis: "Understood. I will remove you and will not call again. Goodbye.", terminal: true }),
  commercialSolarSituation({ id: "broker-incumbent", family: "broker_incumbent", stage: "discovery", type: "existing_solution", text: "Our energy broker handles all of this for us.", fact: "An incumbent broker may own tariff procurement but may or may not cover onsite generation, funded solar, or site engineering.", methodCoachingKey: "incumbent_scope", tryThis: "That is sensible. Do they also cover onsite generation and funded solar, or mainly the supply contract?" }),
  commercialSolarSituation({ id: "tied-contract-renewal", family: "tied_contract_renewal", stage: "qualification", type: "timing", text: "We are tied into our electricity contract, so nothing can change until renewal.", fact: "Supply-contract renewal and onsite-generation timing can interact, but current contract restrictions and notice dates must be checked.", methodCoachingKey: "renewal_trigger", tryThis: "When is the next renewal or notice point, and has anyone checked whether onsite generation can be assessed before then?" }),
  commercialSolarSituation({ id: "roof-site-move-size", family: "roof_site_move_size", stage: "qualification", type: "qualification", text: "The roof may be old, the site is small, and we might move premises.", fact: "Roof condition, usable area, structural suitability, demand, tenure, and planned relocation can each make a site unfit.", methodCoachingKey: "site_fit", tryThis: "Those may rule it out. Which is most definite today: roof condition, usable size, or the move plan?" }),
  commercialSolarSituation({ id: "disruption-performance-maintenance-loan", family: "disruption_performance_maintenance_loan", stage: "commercial", type: "commercial_risk", text: "I am concerned about disruption, underperformance, maintenance, and whether this is really a loan.", fact: "Installation disruption, performance assumptions, maintenance obligations, and financing structure must be separated and evidenced in the proposed route.", methodCoachingKey: "delivery_risk", tryThis: "Those are four different risks. Which one would stop the project even if the others were satisfactory?" }),
  commercialSolarSituation({ id: "stakeholder-approval", family: "stakeholder", stage: "qualification", type: "authority", text: "The finance director, landlord, and operations team would all need to agree.", fact: "Complex B2B energy decisions can require financial, property, operational, procurement, and board participation.", methodCoachingKey: "decision_map", tryThis: "How would those people normally evaluate a project like this, and who should join the first fit review?" }),
  commercialSolarSituation({ id: "numbers-proof", family: "numbers", stage: "commercial", type: "commercial_risk", text: "Send me the numbers and proof before I agree to any meeting.", fact: "Site-specific numbers require adequate usage, tariff, roof, and commercial inputs; indicative claims must be labelled and sourced.", methodCoachingKey: "evidence_requirements", tryThis: "That is reasonable. What evidence would make an initial review worthwhile, and which site inputs can be shared safely?" }),
  commercialSolarSituation({ id: "esg-priority", family: "esg", stage: "discovery", type: "qualification", text: "We are already green enough and solar is not a current priority.", fact: "ESG interest alone does not establish financial, technical, or timing fit.", methodCoachingKey: "priority_trigger", tryThis: "Understood. Is there any commercial or contract trigger that would change that, or should I close this off?" }),
  commercialSolarSituation({ id: "email-follow-up-context", family: "gatekeeper", stage: "opener", type: "gatekeeper", text: "I do not remember your email. Remind me what this is about.", fact: "An email follow-up must accurately restate the prior message and must not imply engagement that did not occur.", methodCoachingKey: "email_context", tryThis: "Of course. I sent a note about checking whether this site's power use and roof position make a funded solar review relevant. May I give you the 20-second version?" }),
  commercialSolarSituation({ id: "roof-data-source", family: "numbers", stage: "opener", type: "gatekeeper", text: "What roof data are you referring to, and where did you get it?", fact: "Public or supplied site data can be incomplete; imagery must not be presented as proof of ownership, condition, or solar status.", methodCoachingKey: "data_provenance", tryThis: "It was only a preliminary public-site check, not proof of suitability. Would you prefer I explain the source, or close the record?" }),
  commercialSolarSituation({ id: "wrong-person-route", family: "gatekeeper", stage: "opener", type: "gatekeeper", text: "You have the wrong person. I do not deal with energy or the building.", fact: "The rep should seek an appropriate role, not pressure an unrelated contact to act as a decision-maker.", methodCoachingKey: "role_routing", tryThis: "Thanks for saying. Which role normally handles electricity contracts, estates, or energy projects?" }),
  commercialSolarSituation({ id: "unit-rate-unknown", family: "numbers", stage: "qualification", type: "qualification", text: "I do not know our unit rate or annual electricity spend.", fact: "Rough bands can screen fit, but precise savings require verified bills, interval data, tariffs, and assumptions.", methodCoachingKey: "spend_band", tryThis: "No problem. Are you roughly above or below GBP 50,000 a year, or should we involve whoever holds the bills?" }),
  commercialSolarSituation({ id: "low-electricity-spend", family: "roof_site_move_size", stage: "qualification", type: "qualification", text: "Our electricity spend is only about GBP 15,000 a year.", fact: "Low spend can make a commercial PPA or paid diagnostic uneconomic; the trainer should allow clean disqualification.", methodCoachingKey: "spend_disqualify", tryThis: "That may put the site below the useful threshold, so I would rather close it than waste your time. Is there a larger site in the group?" }),
  commercialSolarSituation({ id: "roof-condition-old", family: "roof_site_move_size", stage: "qualification", type: "qualification", text: "The roof is old and likely needs replacing within a few years.", fact: "Roof condition and replacement timing must be resolved before a long-life solar installation.", methodCoachingKey: "roof_condition", tryThis: "That may make now the wrong time. Is the replacement planned, or should this site be ruled out?" }),
  commercialSolarSituation({ id: "limited-roof-area", family: "roof_site_move_size", stage: "qualification", type: "qualification", text: "There is very little usable roof space because of plant and skylights.", fact: "Usable roof area, shading, access, structure, fire routes, and demand determine technical fit.", methodCoachingKey: "usable_area", tryThis: "Understood. Has usable area been measured, or is it clearly too restricted to justify a site check?" }),
  commercialSolarSituation({ id: "low-daytime-demand", family: "roof_site_move_size", stage: "qualification", type: "qualification", text: "Most of our power use is overnight, not during daylight hours.", fact: "Daytime consumption and export economics materially affect behind-the-meter solar and PPA fit.", methodCoachingKey: "load_profile", tryThis: "That could make the site a poor fit. Is there meaningful daytime baseload, battery interest, or another site with daytime use?" }),
  commercialSolarSituation({ id: "no-budget-capex", family: "price_cost", stage: "commercial", type: "commercial_risk", text: "There is no capital budget for solar this year.", fact: "No capex budget does not automatically prove PPA fit; funded terms and site economics still require qualification.", methodCoachingKey: "funding_route", tryThis: "Understood. Would a funded route be worth assessing, or is there no appetite for a long-term energy agreement either?" }),
  commercialSolarSituation({ id: "ppa-price-question", family: "price_cost", stage: "commercial", type: "commercial_risk", text: "What price per kilowatt-hour would we actually pay?", fact: "A credible PPA price requires site, demand, generation, term, indexation, and provider inputs; do not fabricate a rate.", methodCoachingKey: "ppa_price", tryThis: "I cannot give a responsible rate without the site inputs. Which commercial terms would you need defined before sharing data?" }),
  commercialSolarSituation({ id: "moving-premises", family: "roof_site_move_size", stage: "qualification", type: "timing", text: "We expect to move out of this building within two years.", fact: "A near-term move can conflict with installation life and long-term contractual commitments.", methodCoachingKey: "relocation_fit", tryThis: "That may rule this site out. Is the next premises known, or should we close this until the move is complete?" }),
  commercialSolarSituation({ id: "panel-aesthetics", family: "disruption_performance_maintenance_loan", stage: "commercial", type: "commercial_risk", text: "The directors will object to how panels look on the building.", fact: "Planning, heritage, visibility, and stakeholder preferences may constrain design; aesthetics should not be dismissed.", methodCoachingKey: "aesthetic_constraint", tryThis: "Understood. Is visibility a fixed no, or would a low-visibility design still be considered?" }),
  commercialSolarSituation({ id: "installation-disruption", family: "disruption_performance_maintenance_loan", stage: "commercial", type: "commercial_risk", text: "We cannot allow installation to disrupt production.", fact: "Access, outages, safety, roof works, and programme constraints require site-specific planning.", methodCoachingKey: "disruption_plan", tryThis: "That is a legitimate constraint. Which operations or outage conditions would any design have to meet?" }),
  commercialSolarSituation({ id: "output-underperformance", family: "disruption_performance_maintenance_loan", stage: "commercial", type: "commercial_risk", text: "What protects us if the system produces less than forecast?", fact: "Forecast methodology, degradation, availability, metering, guarantees, remedies, and exclusions belong in technical and contractual diligence.", methodCoachingKey: "performance_risk", tryThis: "That needs to be evidenced in the forecast and contract. Which protection or remedy would your team expect to see?" }),
  commercialSolarSituation({ id: "maintenance-responsibility", family: "disruption_performance_maintenance_loan", stage: "commercial", type: "commercial_risk", text: "Who maintains it and pays when something fails?", fact: "Maintenance ownership, response standards, insurance, access, replacement obligations, and costs vary by commercial structure.", methodCoachingKey: "maintenance_terms", tryThis: "That depends on the ownership model and contract. Would your priority be fixed responsibility, response time, or cost exposure?" }),
  commercialSolarSituation({ id: "loan-confusion", family: "disruption_performance_maintenance_loan", stage: "commercial", type: "commercial_risk", text: "Is a PPA just a loan secured against our roof?", fact: "A PPA is not automatically a loan, but legal structure, security, property rights, and accounting treatment require professional review.", methodCoachingKey: "finance_structure", tryThis: "It should not be described as a loan without reviewing the documents. Would finance need a structure summary before any site work?" }),
  commercialSolarSituation({ id: "finance-director-not-present", family: "stakeholder", stage: "close", type: "authority", text: "I cannot agree to this without the finance director.", fact: "The finance director's authority must be respected and the next step should include the evidence they require.", methodCoachingKey: "finance_route", tryThis: "Of course. What would the finance director need to see, and should they join the next fit review?" }),
  commercialSolarSituation({ id: "send-numbers-only", family: "numbers", stage: "close", type: "dismissive", text: "Do not book a meeting. Just email the projected savings.", fact: "Projected savings without verified inputs can mislead; the rep must label indicative evidence and request only necessary data.", methodCoachingKey: "numbers_before_meeting", tryThis: "I can send the assumptions and required inputs, but not invent a site saving. Which data can your team verify first?" }),
  commercialSolarSituation({ id: "already-net-zero-plan", family: "esg", stage: "discovery", type: "existing_solution", text: "We already have a net-zero plan and approved suppliers.", fact: "An ESG plan or supplier panel may close the route or create a formal procurement path; neither proves a current gap.", methodCoachingKey: "esg_incumbent", tryThis: "That may mean this is covered. Is onsite generation already included and procured, or should I close this off?" }),
  commercialSolarSituation({ id: "specific-callback", family: "busy_callback", stage: "close", type: "timing", text: "Call me after our board meeting next month.", fact: "A callback should record the real trigger, date, owner, and purpose rather than creating an indefinite chase.", methodCoachingKey: "callback_trigger", tryThis: "Certainly. What date follows the board meeting, and what should we be ready to discuss then?" }),
]);

const commercialSolarSituationPlaybook = {
  id: "commercial-solar-situation-catalog",
  name: "Commercial Solar Real-Call Situation Catalog",
  maxObjectionsPerCall: 5,
  sourceNotes: ["Shared solar facts; coaching and scoring are owned by the selected method pack."],
  objections: [...COMMERCIAL_SOLAR_SITUATIONS],
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
        "Fair question. It is {repName} from {companyName}. I am not calling to pitch an install today. We build a short Power Payback Report for manufacturers to see whether solar, PPA, battery, or tariff options are worth a proper look. Can I ask one quick question to see if it is even relevant?",
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

const PLAYBOOKS = [
  enterpriseObjectionPlaybook,
  manufacturerPowerPaybackPlaybook,
  commercialSolarSituationPlaybook,
];

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
      methodCoachingKey: objection.methodCoachingKey || `move_${recommendedMoveForObjection(objection)}`,
      industryFacts: objection.industryFacts || {},
      terminal: Boolean(objection.terminal),
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
        "It is {repName} from {companyName}. I am calling about a Power Payback Report for manufacturers. If your electricity spend is not high enough, I can close it off. Can I take 20 seconds?",
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
    methodCoachingKey: `stage_${stage}`,
    industryFacts: {},
    terminal: false,
    source: scenario.objectionPlaybookId || "playbook",
    ...fallback[stage],
  };
}

module.exports = {
  COMMERCIAL_SOLAR_SITUATIONS,
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
