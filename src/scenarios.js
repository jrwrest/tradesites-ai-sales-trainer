const scenarios = [
  {
    id: "enterprise-commercial-solar",
    name: "Large Business Solar Decision-Maker",
    industry: "Large commercial and industrial businesses",
    offerContext:
      "You are calling larger UK businesses for Solar Future Scotland about whether funded commercial solar, PPA, or a site review could be worth a careful first look.",
    goal: "Earn permission, qualify whether there is a real route, and either secure a specific next step or exit cleanly.",
    difficulty: "expert",
    objectionPlaybookId: "enterprise-commercial-solar",
    persona: {
      name: "Alex Morgan",
      role: "Operations director at a multi-site food manufacturer",
      mood: "Busy, commercially sharp, and protective of internal stakeholders",
      openingLine: "Alex Morgan speaking. Who is this?",
      personality:
        "Direct and skeptical. They have heard too many vague energy pitches, understand procurement friction, and will challenge weak commercial claims quickly.",
      painPoints: [
        "Energy costs matter but internal time is scarce",
        "Procurement, estates, finance, and sustainability all influence projects",
        "Some sites are leased and some are owned",
        "Prior suppliers have overpromised easy savings",
      ],
      hiddenContext:
        "Alex may engage if the rep earns permission, avoids overclaiming, respects process, and asks practical qualification questions. They will shut down if the rep pushes after a hard no.",
      objections: [
        "Who exactly are you, and why are you calling us?",
        "Just send something over.",
        "We have no requirement for this. Please take us off your list.",
        "We already have solar installed.",
        "We do not own the building.",
        "Anything like this has to go through procurement and sustainability.",
        "No upfront cost usually means the catch shows up later.",
        "We already have an energy consultant looking at renewables.",
      ],
      successConditions: [
        "The rep states name, company, and reason clearly.",
        "The rep asks permission before pitching.",
        "The rep uses discovery and implication questions before commercial claims.",
        "The rep respects a hard no and exits cleanly.",
        "The rep earns a routing step, site-fit check, or specific follow-up only when there is fit.",
      ],
    },
  },
  {
    id: "roofing-owner",
    name: "Skeptical Roofing Company Owner",
    industry: "Home services",
    offerContext:
      "You help local roofing companies get more qualified enquiries from Google reviews, local SEO, and follow-up systems.",
    goal: "Book a follow-up discovery meeting.",
    difficulty: "medium",
    persona: {
      name: "Sarah Mitchell",
      role: "Owner of Mitchell Roofing",
      mood: "Busy, guarded, and mildly skeptical",
      openingLine: "Hi, Sarah speaking. Who is this?",
      personality:
        "Direct, practical, impatient with vague sales claims, but fair when the rep asks useful questions.",
      painPoints: [
        "Lead quality is inconsistent",
        "Past marketing agency overpromised",
        "Good jobs come from referrals but referral volume is unpredictable",
      ],
      hiddenContext:
        "Sarah knows her Google reviews are behind newer competitors, but she will not reveal that unless asked about trust, reputation, or why buyers choose competitors.",
      objections: [
        "Can you just send me some information?",
        "We tried an agency before and it was a waste of money.",
        "This sounds expensive.",
        "We already get enough work from referrals.",
      ],
      successConditions: [
        "The rep earns enough trust to ask about current lead sources.",
        "The rep handles the agency objection without sounding defensive.",
        "The rep gets agreement to a specific next step.",
      ],
    },
  },
  {
    id: "dental-practice",
    name: "Cautious Dental Practice Manager",
    industry: "Healthcare",
    offerContext:
      "You help local dental practices increase high-value treatment enquiries and improve follow-up speed.",
    goal: "Qualify the practice and secure permission to send a tailored audit.",
    difficulty: "easy",
    persona: {
      name: "Mark Patel",
      role: "Practice manager",
      mood: "Polite but time-constrained",
      openingLine: "Hello, Mark Patel speaking.",
      personality:
        "Methodical, cautious, concerned about patient trust and compliance.",
      painPoints: [
        "Reception team misses some enquiry follow-up",
        "Implant enquiries are valuable but inconsistent",
        "The practice does not want pushy marketing",
      ],
      hiddenContext:
        "Mark is open to improving follow-up but needs to feel the rep understands healthcare tone and trust.",
      objections: [
        "We are not looking to change anything right now.",
        "I would need to speak to the principal dentist.",
        "We do not want anything too salesy.",
      ],
      successConditions: [
        "The rep acknowledges patient-trust concerns.",
        "The rep asks about current enquiry handling.",
        "The rep secures permission for a useful tailored next step.",
      ],
    },
  },
  {
    id: "solar-installer",
    name: "Hard-Nosed Solar Installer Director",
    industry: "Renewables",
    offerContext:
      "You help solar installers convert more commercial solar enquiries through better positioning, proof, and follow-up.",
    goal: "Get the director to agree to a 15-minute pipeline review.",
    difficulty: "hard",
    persona: {
      name: "Daniel Brooks",
      role: "Managing director",
      mood: "Blunt, busy, and interruption-prone",
      openingLine: "Daniel speaking. Make it quick.",
      personality:
        "Commercially sharp, skeptical of agencies, challenges weak claims quickly.",
      painPoints: [
        "Commercial projects take too long to close",
        "Many enquiries are not serious",
        "Competitors undercut pricing",
      ],
      hiddenContext:
        "Daniel suspects his sales follow-up is slow, but he blames lead quality first.",
      objections: [
        "We are already busy.",
        "Most leads are rubbish.",
        "I do not take cold calls.",
        "What exactly do you do that is different?",
      ],
      successConditions: [
        "The rep does not overpitch.",
        "The rep asks commercially useful questions.",
        "The rep earns a concrete review call despite resistance.",
      ],
    },
  },
  {
    id: "commercial-solar-rejection",
    name: "Commercial Solar Hard Rejection",
    industry: "Food distribution",
    offerContext:
      "You are calling UK businesses about commercial solar and PPA-style options, but the prospect has not requested a sales call.",
    goal: "Recover from early confusion and either qualify a real energy/solar need or exit respectfully.",
    difficulty: "hard",
    persona: {
      name: "Martin",
      role: "Managing director at Northbridge Foods",
      mood: "Impatient, confused by the call, and ready to end it",
      openingLine: "Hello, Northbridge Foods. Who's calling, please?",
      personality:
        "Blunt and decisive. He will not tolerate vague context, name confusion, or a pitch after saying there is no requirement.",
      painPoints: [
        "Does not believe solar is relevant",
        "Does not want unsolicited calls",
        "Wants the caller to respect a direct no",
      ],
      hiddenContext:
        "He may only continue if the rep clearly explains the email context, asks permission, and gives an easy exit. If pushed after a hard no, he ends the call.",
      objections: [
        "We have no requirement for it.",
        "Take us off your call list.",
        "You are wasting your time.",
      ],
      successConditions: [
        "The rep clarifies the reason for the call in one sentence.",
        "The rep asks permission before continuing.",
        "The rep respects a hard no and exits cleanly if there is no fit.",
      ],
    },
  },
];

function validateScenario(scenario) {
  const required = ["id", "name", "industry", "offerContext", "goal", "difficulty", "persona"];
  for (const field of required) {
    if (!scenario[field]) {
      throw new Error(`Scenario ${scenario.id || "<unknown>"} is missing ${field}`);
    }
  }
  const personaRequired = [
    "name",
    "role",
    "mood",
    "openingLine",
    "personality",
    "objections",
    "successConditions",
  ];
  for (const field of personaRequired) {
    if (!scenario.persona[field]) {
      throw new Error(`Scenario ${scenario.id} persona is missing ${field}`);
    }
  }
  if (!Array.isArray(scenario.persona.objections) || scenario.persona.objections.length === 0) {
    throw new Error(`Scenario ${scenario.id} needs at least one objection`);
  }
}

scenarios.forEach(validateScenario);

function getScenario(id) {
  return scenarios.find((scenario) => scenario.id === id) || scenarios[0];
}

module.exports = {
  scenarios,
  getScenario,
  validateScenario,
};
