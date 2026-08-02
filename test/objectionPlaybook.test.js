const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  COMMERCIAL_SOLAR_SITUATIONS,
  buildCoachingSuggestion,
  enterpriseObjectionPlaybook,
  hasHardNo,
  manufacturerPowerPaybackPlaybook,
  recommendedMoveForObjection,
  selectNextObjection,
} = require("../src/objectionPlaybook");
const { applyMethodCoaching } = require("../src/methodCoaching");
const { listMethodPacks, resolveMethodPack } = require("../src/methodPack");
const { getScenario } = require("../src/scenarios");

const scenario = getScenario("enterprise-commercial-solar");
const reportScenario = getScenario("manufacturer-power-payback-report");

const EXPECTED_COMMERCIAL_SOLAR_SITUATION_IDS = {
  gatekeeper: "gatekeeper-routing",
  send_info: "send-information",
  existing_solar: "existing-solar",
  prior_solar: "prior-solar-review",
  lease_landlord: "lease-landlord",
  price_cost: "price-cost",
  credibility_catch: "credibility-catch",
  long_contract: "long-contract",
  busy_callback: "busy-callback",
  source_opt_out: "hard-opt-out",
  broker_incumbent: "broker-incumbent",
  tied_contract_renewal: "tied-contract-renewal",
  roof_site_move_size: "roof-site-move-size",
  disruption_performance_maintenance_loan: "disruption-performance-maintenance-loan",
  stakeholder: "stakeholder-approval",
  numbers: "numbers-proof",
  esg: "esg-priority",
};

function session(turns = [], id = "enterprise-test") {
  return {
    id,
    scenarioId: scenario.id,
    turns,
  };
}

test("enterprise scenario has objection playbook metadata", () => {
  assert.equal(scenario.objectionPlaybookId, "enterprise-commercial-solar");
  assert.ok(scenario.persona.objections.length >= 8);
  assert.ok(scenario.persona.successConditions.length >= 4);
});

test("manufacturer report scenario has dedicated paid-report playbook", () => {
  assert.equal(reportScenario.objectionPlaybookId, "manufacturer-power-payback-report");
  assert.ok(
    reportScenario.persona.successConditions.some((condition) =>
      condition.includes("GBP 500 report"),
    ),
  );
  assert.ok(
    manufacturerPowerPaybackPlaybook.objections.some((objection) =>
      objection.text.includes("GBP 500"),
    ),
  );
});

test("objection selector returns bounded non-repeating objections", () => {
  const first = selectNextObjection({
    scenario,
    session: session([
      { role: "persona", text: scenario.persona.openingLine },
      { role: "user", text: "Who am I speaking to?" },
    ]),
    repMessage: "Can I take 20 seconds?",
  });
  assert.ok(first);

  const second = selectNextObjection({
    scenario,
    session: session([
      { role: "persona", text: scenario.persona.openingLine },
      { role: "user", text: "Who am I speaking to?" },
      { role: "persona", text: first.text, objectionId: first.id },
      { role: "user", text: "Can I ask one quick question?" },
    ]),
    repMessage: "Is this site leased or owned?",
  });
  assert.ok(second);
  assert.notEqual(second.id, first.id);
});

test("identity-only first reply asks for call context instead of jumping to a later objection", () => {
  const objection = selectNextObjection({
    scenario,
    session: session([
      { role: "persona", text: scenario.persona.openingLine },
      { role: "user", text: "hey this is James" },
    ]),
    repMessage: "hey this is James",
  });

  assert.equal(objection.id, "gatekeeper-who-is-this");
});

test("hard no suppresses further objections", () => {
  const hardNoSession = session([
    { role: "persona", text: scenario.persona.openingLine },
    { role: "user", text: "Calling about solar." },
    { role: "persona", text: "Please take us off your list." },
  ]);
  assert.equal(hasHardNo(hardNoSession.turns), true);
  assert.equal(
    selectNextObjection({
      scenario,
      session: hardNoSession,
      repMessage: "Can I just explain?",
    }),
    null,
  );
});

test("coaching suggestion is stage and objection aware without hidden context", () => {
  const suggestion = buildCoachingSuggestion({
    scenario,
    session: session([
      { role: "persona", text: scenario.persona.openingLine },
      { role: "user", text: "Calling about solar." },
      {
        role: "persona",
        text: "Just send something over.",
        objectionId: "send-info",
      },
    ]),
  });

  assert.equal(suggestion.objectionId, "send-info");
  assert.match(suggestion.tryThis, /one quick question/i);
  assert.doesNotMatch(
    JSON.stringify(suggestion).toLowerCase(),
    /hidden|secret|alex may engage/,
  );
});

test("each enterprise objection has a recommended retrieval move", () => {
  for (const objection of enterpriseObjectionPlaybook.objections) {
    assert.match(recommendedMoveForObjection(objection), /^(acknowledge|clarify|ask_permission|qualify|route|commercial_explain|exit)$/);
  }
});

test("commercial solar situation catalog covers every supplied PPA family with stable routing metadata", () => {
  assert.ok(Array.isArray(COMMERCIAL_SOLAR_SITUATIONS));
  const byId = new Map(COMMERCIAL_SOLAR_SITUATIONS.map((item) => [item.id, item]));

  assert.deepEqual(
    [...new Set(COMMERCIAL_SOLAR_SITUATIONS.map((item) => item.family))].sort(),
    Object.keys(EXPECTED_COMMERCIAL_SOLAR_SITUATION_IDS).sort(),
  );
  assert.equal(
    new Set(COMMERCIAL_SOLAR_SITUATIONS.map((item) => item.id)).size,
    COMMERCIAL_SOLAR_SITUATIONS.length,
    "situation ids must be unique and stable",
  );

  for (const [family, id] of Object.entries(EXPECTED_COMMERCIAL_SOLAR_SITUATION_IDS)) {
    const situation = byId.get(id);
    assert.ok(situation, `missing ${family}`);
    assert.equal(situation.family, family, `${id} changed family`);
    assert.match(situation.stage, /^(opener|permission|discovery|qualification|commercial|close)$/);
    assert.equal(typeof situation.terminal, "boolean");
    assert.match(
      situation.recommendedMove,
      /^(acknowledge|clarify|ask_permission|qualify|route|commercial_explain|exit)$/,
    );
    assert.equal(situation.recommendedMove, recommendedMoveForObjection(situation));
    assert.match(situation.methodCoachingKey, /^[a-z0-9]+(?:_[a-z0-9]+)*$/);
    assert.equal(typeof situation.text, "string");
    assert.ok(situation.text.length >= 12);
    assert.ok(situation.industryFacts && Object.keys(situation.industryFacts).length >= 1);
  }
});

test("Hormozi and Jeremy coaching cover every PPA situation while preserving shared industry facts", () => {
  assert.ok(Array.isArray(COMMERCIAL_SOLAR_SITUATIONS));
  const methods = Object.fromEntries(listMethodPacks().map((method) => [
    method.id,
    resolveMethodPack({ id: method.id, version: method.version }),
  ]));
  assert.ok(methods["hormozi-sales-2026"]);
  assert.ok(methods["jeremy-miner-nepq-ppa"]);

  for (const situation of COMMERCIAL_SOLAR_SITUATIONS) {
    const originalSituation = JSON.parse(JSON.stringify(situation));
    const suggestion = buildCoachingSuggestion({
      scenario,
      session: session([
        { role: "persona", text: scenario.persona.openingLine },
        { role: "user", text: "I am calling about a commercial solar and PPA fit check." },
        { role: "persona", text: situation.text, objectionId: situation.id },
      ], `situation-${situation.id}`),
    });
    assert.equal(suggestion.objectionId, situation.id);
    assert.equal(suggestion.methodCoachingKey, situation.methodCoachingKey);
    assert.deepEqual(suggestion.industryFacts, situation.industryFacts);

    const alex = applyMethodCoaching({
      suggestion,
      methodPack: methods["hormozi-sales-2026"],
      profile: { repName: "Ava", companyName: "Northstar Energy" },
    });
    const jeremy = applyMethodCoaching({
      suggestion,
      methodPack: methods["jeremy-miner-nepq-ppa"],
      profile: { repName: "Ava", companyName: "Northstar Energy" },
    });

    for (const coached of [alex, jeremy]) {
      assert.deepEqual(coached.industryFacts, situation.industryFacts, `${situation.id} facts changed`);
      assert.equal(coached.methodCoachingKey, situation.methodCoachingKey);
      assert.ok(coached.methodMetadata?.frameworkLabel);
      assert.ok(Array.isArray(coached.suggestions) && coached.suggestions.length >= 1);
      assert.ok(coached.methodPrompt?.length >= 12);
      assert.ok(coached.tryThis?.length >= 12);
      assert.deepEqual(coached.situationGuidance, Object.values(situation.industryFacts));
      assert.equal(coached.situationExample, null);
      assert.doesNotMatch(coached.tryThis, /\{[A-Za-z][A-Za-z0-9]*\}/);
    }
    assert.notEqual(alex.methodPrompt, jeremy.methodPrompt, `${situation.id} method prompt was shared`);
    assert.notEqual(alex.tryThis, jeremy.tryThis, `${situation.id} example was shared`);
    assert.deepEqual(situation, originalSituation, `${situation.id} source facts were mutated`);
  }
});

test("hard opt-out resolves to a clean terminal exit under both methods", () => {
  const optOut = COMMERCIAL_SOLAR_SITUATIONS.find(
    (item) => item.family === "source_opt_out" && item.terminal,
  );
  assert.ok(optOut, "catalog needs an explicit hard opt-out");
  assert.equal(optOut.id, "hard-opt-out");
  assert.equal(optOut.recommendedMove, "exit");

  const suggestion = buildCoachingSuggestion({
    scenario,
    session: session([
      { role: "persona", text: scenario.persona.openingLine },
      { role: "user", text: "Calling about commercial solar." },
      { role: "persona", text: optOut.text, objectionId: optOut.id },
    ], "hard-opt-out-test"),
  });
  for (const method of listMethodPacks()) {
    const coached = applyMethodCoaching({
      suggestion,
      methodPack: resolveMethodPack(method),
    });
    assert.equal(coached.recommendedMove, "exit", method.id);
    assert.match(coached.tryThis, /understood|remove|will not (?:call|push)|close this off|goodbye/i);
    assert.doesNotMatch(coached.tryThis, /\?|solar|ppa|assessment|one (?:quick|last) question/i);
  }
});

test("manufacturer report coaching uses report-specific fallback prompts", () => {
  const suggestion = buildCoachingSuggestion({
    scenario: reportScenario,
    session: {
      id: "report-test",
      scenarioId: reportScenario.id,
      turns: [
        { role: "persona", text: reportScenario.persona.openingLine },
        { role: "user", text: "James from Solar Future Scotland. Can I take 20 seconds?" },
      ],
    },
  });

  assert.equal(suggestion.source, "manufacturer-power-payback-report");
  assert.match(suggestion.tryThis, /GBP 50,000/i);
});

test("manufacturer report objection selector uses paid-report objections", () => {
  const objection = selectNextObjection({
    scenario: reportScenario,
    session: {
      id: "report-objection-test",
      scenarioId: reportScenario.id,
      turns: [
        { role: "persona", text: reportScenario.persona.openingLine },
        { role: "user", text: "James from Solar Future Scotland about a Power Payback Report for manufacturers. Can I take 20 seconds?" },
      ],
    },
    repMessage: "Can I take 20 seconds?",
  });

  assert.ok(objection.id.startsWith("power-payback-"));
});
