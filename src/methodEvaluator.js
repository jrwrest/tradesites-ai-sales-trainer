const { loadMethodPack } = require("./methodPack");

const REP_ROLES = new Set(["user", "rep"]);
const CUSTOMER_ROLES = new Set(["persona", "customer"]);
const HARD_NO = /\b(no requirement|take (?:us|me) off|do not call|don't call|no use for (?:it|this)|absolutely no use|stop calling|not interested[.!]?$)\b/i;
const PUSH_AFTER_NO = /\b(before you go|one (?:quick|last) question|let me explain|do you have|have you heard|solar|ppa|no upfront|funded|site review|book|schedule|payment)\b/i;
const CLEAN_EXIT = /\b(understood|fair enough|will not push|won't push|take you off|remove you|thank you|thanks|goodbye|bye|leave it there)\b/i;
const OBJECTION = /\b(send (?:me |something |it )?(?:over|information)|too expensive|costs? too much|busy|need to think|not (?:a )?priority|already have|need (?:to ask|approval)|no budget|not interested)\b/i;

const DETECTORS = {
  preparation_continuity: {
    positive: [["uses prior context", /\b(you (?:mentioned|shared|said)|your (?:form|notes?|site)|I saw that|based on what you sent)\b/i]],
    counter: [["asks for known context again", /\b(start from the beginning|tell me again)\b/i]],
  },
  ppp_proof: {
    positive: [["states relevant evidence", /\b(helped|worked with|experience (?:with|in)|\d+\s+(?:companies|sites|manufacturers|customers)|based on (?:our|the) (?:work|analysis|data))\b/i]],
    counter: [["uses an unsupported absolute claim", /\b(guarantee|always works|best in the world|number one without question)\b/i]],
  },
  ppp_promise: {
    positive: [["states the call outcome", /\b(by the end|so (?:we|you) can (?:clarify|determine|decide|see)|figure out whether|work out whether|leave with)\b/i]],
    counter: [["guarantees the business outcome", /\bguarantee (?:you|your|the)\b/i]],
  },
  ppp_plan: {
    positive: [
      ["sets sequence", /\b(first .{0,100} then|a few questions.{0,100}(?:then|after))\b/i],
      ["defines fit decision", /\b(fit or (?:no fit|not)|makes sense or not|decide whether)\b/i],
      ["checks permission", /\b(fair\?|sound (?:fair|good)|okay\?|is that okay|can I take \d+ seconds)\b/i],
    ],
    counter: [["pitches without a mutual plan", /\b(just listen|you need to hear this)\b/i]],
  },
  closer_clarify: {
    positive: [
      ["asks why now", /\b(what prompted|why now|what changed|why (?:is|does) this matter now)\b/i],
      ["asks desired outcome", /\b(what outcome|what are you trying|what would you like|where (?:do you|would you) want)\b/i],
      ["asks current state", /\b(how are you currently|what happens today|what are you doing now)\b/i],
    ],
    counter: [["assumes the motive", /\bI know exactly why you need this\b/i]],
  },
  closer_label: {
    positive: [["summarizes and verifies the gap", /\b(so it sounds like|what I(?:'m| am) hearing|if I heard you|so the gap is|have I got that right|is that (?:right|fair|accurate))\b/i]],
    counter: [["declares an unverified diagnosis", /\bthe problem is obviously\b/i]],
  },
  closer_overview_pain: {
    positive: [
      ["explores a prior attempt", /\b(what have you tried|what did you try|since (?:that|the)|last (?:audit|attempt|provider)|previously tried)\b/i],
      ["explores the cost of inaction", /\b(what (?:is|does).{0,60}cost|costing|another .{0,30} delay|if nothing changes|continue as is)\b/i],
    ],
    counter: [["manufactures fear", /\b(you should be terrified|everything will collapse|you'll regret it forever)\b/i]],
  },
  bant_budget: {
    positive: [["verifies resources", /\b(budget|investment range|resources|finance support|commercial path|afford|funding)\b/i]],
    counter: [["assumes affordability", /\byou can obviously afford\b/i]],
  },
  bant_authority: {
    positive: [["maps authority", /\b(who .{0,60}(?:approv\w*|decid\w*|sign\w*|influenc\w*)|approval path|decision[- ]maker|which stakeholders?|finance.{0,30}approv\w*)\b/i]],
    counter: [["encourages bypassing authority", /\b(don't need (?:them|the board)|without (?:their|them)|ignore procurement|you can decide alone)\b/i]],
  },
  bant_need: {
    positive: [["verifies need or fit", /\b(what (?:requirement|problem|outcome).{0,50}(?:matters|need)|fit criteria|which requirement|what do you need|what would make this useful)\b/i]],
    counter: [["pushes despite no fit", /\b(even if (?:it|this) (?:doesn't|does not) fit|buy it anyway)\b/i]],
  },
  bant_timing: {
    positive: [["verifies timing", /\b(when (?:could|would|do|must)|timing|deadline|this quarter|implementation begin|start date|why now)\b/i]],
    counter: [["invents urgency", /\b(today only|expires in an hour|last chance)\b/i]],
  },
  closer_sell_vacation: {
    positive: [["connects destination to bridge", /\b(the outcome is|desired outcome|the destination|the bridge (?:is|has)|gets? you to)\b/i]],
    counter: [["dumps features", /\bhere are (?:all|the) \d+ features\b/i]],
  },
  pitch_three_pillars: {
    positive: [["uses three requirements", /\b(exactly three|three (?:pillars|requirements|parts|things)|the bridge has .{0,20}three)\b/i]],
    counter: [["uses an unstructured feature list", /\b(first feature|second feature|third feature|fourth feature|fifth feature)\b/i]],
  },
  pitch_past_attempt_link: {
    positive: [["links prior attempt to a missing pillar", /\b(covered|gave you|provided).{0,90}\b(but|lacked|missing|without)\b|\b(?:tried|attempt).{0,90}\b(?:lacked|missing|without)\b/i]],
    counter: [["belittles the prior attempt", /\b(that was stupid|waste of time because you)\b/i]],
  },
  pitch_outcome_focus: {
    positive: [["keeps explanation outcome-led", /\b(outcome|result|destination|so that you can|which means you can|investable plan)\b/i]],
    counter: [["overloads operational detail", /\b(let me walk you through every|all \d+ implementation steps)\b/i]],
  },
  pitch_analogy: {
    positive: [["uses a mechanism analogy", /\b(like a|think of it as|analogy|three-legged stool|three legged stool)\b/i]],
    counter: [["uses analogy as a guarantee", /\b(just like magic|cannot fail)\b/i]],
  },
  clean_ask: {
    positive: [["makes a specific commitment ask", /\b(shall we|are you ready to|would you like to|can we|let's)\b.{0,100}\b(book|schedule|start|go ahead|pay|payment|invoice|diagnostic|next meeting)\b/i]],
    counter: [["keeps pitching after an explicit yes", /\b(?:yes|agreed).{0,40}(?:but let me tell you|one more feature)\b/i]],
  },
  closer_explain_concerns: {
    positive: [["clarifies before resolving", /\b(what (?:specifically|part|outcome)|help me understand|when you say|what would have to)\b/i]],
    counter: [["fires an instant rebuttal", /\b(that's wrong|no, you're wrong|that objection makes no sense)\b/i]],
  },
  objection_isolation: {
    positive: [["isolates the real obstacle", /\b(main concern|what specifically|what would have to be true|what makes it a no|afraid might happen|only thing stopping)\b/i]],
    counter: [["assumes the surface objection", /\b(so price is definitely the only issue)\b/i]],
  },
  detail_question_intent: {
    positive: [["asks why a detail matters", /\b(why does that matter|what (?:answer|requirement) do you need|what would that allow|what sits behind that)\b/i]],
    counter: [["invents certainty", /\b(I can promise that detail without checking)\b/i]],
  },
  aaa_acknowledge: {
    positive: [["acknowledges the concern", /\b(fair|makes sense|understood|I understand|I hear you|reasonable concern|appreciate that)\b/i]],
    counter: [["dismisses the concern", /\b(that's ridiculous|doesn't matter|irrelevant concern)\b/i]],
  },
  aaa_associate: {
    positive: [["associates with a credible pattern", /\b(other|similar|we often see|usually|a common|the reason|because)\b/i]],
    counter: [["uses fabricated social proof", /\b(every customer says yes|all your competitors bought)\b/i]],
  },
  aaa_ask: {
    positive: [["returns with a question", /\?\s*$/]],
    counter: [["ends in a rebuttal monologue", /\bthat's why you should buy\.?\s*$/i]],
  },
  closer_reinforce: {
    positive: [["books and contextualizes the next step", /\b(book the next|next meeting|onboarding|introduce you to|handoff|hand off|transfer (?:the )?context)\b/i]],
    counter: [["uses a cold handoff", /\bsomeone will contact you sometime\b/i]],
  },
  reinforce_warm_handoff: {
    positive: [["names the next owner and purpose", /\bintroduce you to .{1,60} (?:who|so|for)|meet .{1,40}, (?:your|our)\b/i]],
    counter: [["leaves ownership vague", /\bsome department will reach out\b/i]],
  },
  enterprise_stakeholder_map: {
    positive: [["maps enterprise gates", /\b(procurement|legal|security|finance|estates|committee|stakeholder).{0,100}\b(next|stage|approval|review|owner)\b/i]],
    counter: [["forces a unilateral enterprise decision", /\b(ignore procurement|sign without (?:legal|finance|the board)|you can decide alone)\b/i]],
  },
};

function normalizeTurns(turns = []) {
  return turns.map((turn, turnIndex) => {
    const rawRole = String(turn.role || turn.speaker || "").toLowerCase();
    const role = REP_ROLES.has(rawRole) ? "rep" : CUSTOMER_ROLES.has(rawRole) ? "customer" : rawRole;
    return { turnIndex, role, text: String(turn.text || "").trim() };
  });
}

function excerpt(text) {
  return text.length <= 220 ? text : `${text.slice(0, 217)}...`;
}

function collectSignals(turns, signals, role = "rep") {
  const matches = [];
  for (const turn of turns) {
    if (turn.role !== role) continue;
    for (const [reason, pattern] of signals || []) {
      if (pattern.test(turn.text)) {
        matches.push({ turnIndex: turn.turnIndex, reason, excerpt: excerpt(turn.text) });
      }
    }
  }
  return matches.filter((item, index, all) => all.findIndex(
    (candidate) => candidate.turnIndex === item.turnIndex && candidate.reason === item.reason,
  ) === index);
}

function confidenceFor(evidence, counterEvidence) {
  const observedTurns = new Set([...evidence, ...counterEvidence].map((item) => item.turnIndex));
  if (observedTurns.size >= 2) return "high";
  if (observedTurns.size === 1) return "medium";
  return "low";
}

function behaviorScore(evidence, counterEvidence) {
  if (counterEvidence.length && !evidence.length) return 1;
  if (counterEvidence.length) return 2;
  if (evidence.length >= 2) return 4;
  if (evidence.length === 1) return 3;
  return 0;
}

function hardNoEvidence(turns) {
  const hardNoTurn = turns.find((turn) => turn.role === "customer" && HARD_NO.test(turn.text));
  if (!hardNoTurn) return { observed: false, customer: null, repAfter: [] };
  return {
    observed: true,
    customer: hardNoTurn,
    repAfter: turns.filter((turn) => turn.role === "rep" && turn.turnIndex > hardNoTurn.turnIndex),
  };
}

function evaluateHardNoBehavior(hardNo) {
  if (!hardNo.observed) {
    return { evidence: [], counterEvidence: [], score: 0, confidence: "low", applicability: "not_applicable" };
  }
  const rep = hardNo.repAfter[0];
  if (!rep) {
    return { evidence: [], counterEvidence: [], score: 0, confidence: "low", applicability: "applicable" };
  }
  const evidence = CLEAN_EXIT.test(rep.text) && !PUSH_AFTER_NO.test(rep.text)
    ? [{ turnIndex: rep.turnIndex, reason: "acknowledges and exits after hard no", excerpt: excerpt(rep.text) }]
    : [];
  const counterEvidence = PUSH_AFTER_NO.test(rep.text)
    ? [{ turnIndex: rep.turnIndex, reason: "continues persuasion after hard no", excerpt: excerpt(rep.text) }]
    : [];
  return {
    evidence,
    counterEvidence,
    score: behaviorScore(evidence, counterEvidence),
    confidence: "high",
    applicability: "applicable",
  };
}

function evaluateMethod({ turns = [], scenario = null, methodPack = loadMethodPack(), claimAudit = null } = {}) {
  const normalizedTurns = normalizeTurns(turns);
  const repTurns = normalizedTurns.filter((turn) => turn.role === "rep");
  const customerTurns = normalizedTurns.filter((turn) => turn.role === "customer");
  const hardNo = hardNoEvidence(normalizedTurns);
  const objectionTurn = customerTurns.find((turn) => OBJECTION.test(turn.text) || HARD_NO.test(turn.text));
  const enterpriseConcern = customerTurns.some((turn) =>
    /\b(landlord|do not own|don't own|leased|procurement|legal|security|finance committee|board approval)\b/i.test(turn.text));

  const rawBehaviors = methodPack.framework.behaviors.map((definition) => {
    if (definition.id === "hard_no_clean_exit") {
      return { ...definition, ...evaluateHardNoBehavior(hardNo) };
    }
    if (definition.id === "prospect_talk_share") {
      const questionTurns = repTurns.filter((turn) => /\?/.test(turn.text));
      const evidence = questionTurns.length >= 3 && customerTurns.length >= 3
        ? questionTurns.slice(0, 2).map((turn) => ({
          turnIndex: turn.turnIndex,
          reason: "uses repeated questions while the prospect responds",
          excerpt: excerpt(turn.text),
        }))
        : [];
      return {
        ...definition,
        evidence,
        counterEvidence: [],
        score: behaviorScore(evidence, []),
        confidence: confidenceFor(evidence, []),
      };
    }
    const detector = DETECTORS[definition.id] || {};
    let candidateTurns = repTurns;
    if (["closer_explain_concerns", "objection_isolation", "detail_question_intent", "aaa_acknowledge", "aaa_associate", "aaa_ask"].includes(definition.id)) {
      candidateTurns = objectionTurn
        ? repTurns.filter((turn) => turn.turnIndex > objectionTurn.turnIndex)
        : [];
    }
    const evidence = collectSignals(candidateTurns, detector.positive || []);
    const counterEvidence = collectSignals(candidateTurns, detector.counter || []);
    return {
      ...definition,
      evidence,
      counterEvidence,
      score: behaviorScore(evidence, counterEvidence),
      confidence: confidenceFor(evidence, counterEvidence),
    };
  });

  const byId = new Map(rawBehaviors.map((behavior) => [behavior.id, behavior]));
  const stageReached = {
    prepare: byId.get("preparation_continuity").evidence.length > 0,
    open: repTurns.length > 0,
    diagnose: ["closer_clarify", "closer_label", "closer_overview_pain"].some((id) => byId.get(id).evidence.length > 0),
    qualify: ["bant_budget", "bant_authority", "bant_need", "bant_timing"].some((id) => byId.get(id).evidence.length > 0),
    present: ["closer_sell_vacation", "pitch_three_pillars", "pitch_past_attempt_link", "pitch_outcome_focus", "pitch_analogy"].some((id) => byId.get(id).evidence.length > 0),
    ask: byId.get("clean_ask").evidence.length > 0,
    resolve: Boolean(objectionTurn),
    reinforce: ["closer_reinforce", "reinforce_warm_handoff"].some((id) => byId.get(id).evidence.length > 0),
    enterprise: (Boolean(scenario && /enterprise/i.test(scenario.id || "")) && enterpriseConcern)
      || byId.get("enterprise_stakeholder_map").evidence.length > 0,
  };

  const resolveWhenHardNo = new Set(["aaa_acknowledge", "hard_no_clean_exit"]);
  const behaviors = rawBehaviors.map((behavior) => {
    let applicability = behavior.applicability || (stageReached[behavior.stageId] ? "applicable" : "not_reached");
    if (behavior.stageId === "resolve" && hardNo.observed && !resolveWhenHardNo.has(behavior.id)) {
      applicability = "not_applicable";
    }
    if (behavior.id === "hard_no_clean_exit" && !hardNo.observed) applicability = "not_applicable";
    return { ...behavior, applicability };
  });

  const stages = methodPack.framework.stages.map((stage) => {
    const stageBehaviors = behaviors.filter(
      (behavior) => stage.behaviorIds.includes(behavior.id) && behavior.applicability === "applicable",
    );
    const score = stageBehaviors.length
      ? Math.round(stageBehaviors.reduce((total, behavior) => total + behavior.score, 0) / stageBehaviors.length / 4 * 100)
      : null;
    return {
      id: stage.id,
      label: stage.label,
      reached: Boolean(stageReached[stage.id]),
      score,
      behaviorIds: stageBehaviors.map((behavior) => behavior.id),
      confidence: confidenceFor(
        stageBehaviors.flatMap((behavior) => behavior.evidence),
        stageBehaviors.flatMap((behavior) => behavior.counterEvidence),
      ),
    };
  });

  const criticalGates = evaluateCriticalGates({
    normalizedTurns,
    hardNo,
    behaviors,
    methodPack,
    claimAudit,
  });
  const weights = new Map(methodPack.rubric.stageWeights.map((item) => [item.stageId, item.weight]));
  const scoredStages = stages.filter((stage) => stage.score !== null && weights.has(stage.id));
  const activeWeight = scoredStages.reduce((total, stage) => total + weights.get(stage.id), 0);
  let overallScore = activeWeight
    ? Math.round(scoredStages.reduce((total, stage) => total + stage.score * weights.get(stage.id), 0) / activeWeight)
    : 0;
  for (const gate of criticalGates) {
    if (gate.status === "fail" && Number.isFinite(gate.effect.capOverallScore)) {
      overallScore = Math.min(overallScore, gate.effect.capOverallScore);
    }
  }

  const drillByBehavior = new Map(methodPack.drills.drills.map((drill) => [drill.behaviorId, drill]));
  const failedGateDrill = criticalGates.find(
    (gate) => gate.status === "fail" && gate.effect.requiredDrillBehaviorId,
  );
  const weakBehavior = failedGateDrill
    ? behaviors.find((behavior) => behavior.id === failedGateDrill.effect.requiredDrillBehaviorId)
    : behaviors
      .filter((behavior) => behavior.applicability === "applicable" && behavior.score < 3 && drillByBehavior.has(behavior.id))
      .sort((left, right) => Number(right.critical) - Number(left.critical) || left.score - right.score)[0];
  const assignedDrill = weakBehavior && drillByBehavior.has(weakBehavior.id)
    ? {
      ...drillByBehavior.get(weakBehavior.id),
      reason: failedGateDrill
        ? `Critical gate failed: ${failedGateDrill.label}.`
        : `${weakBehavior.label} has no effective observed execution yet.`,
    }
    : null;

  const observedBehaviorCount = behaviors.filter((behavior) => behavior.evidence.length > 0).length;
  return {
    schemaVersion: 1,
    methodPack: {
      id: methodPack.manifest.id,
      version: methodPack.manifest.version,
    },
    overallScore,
    overallConfidence: observedBehaviorCount >= 10 ? "high" : observedBehaviorCount >= 4 ? "medium" : "low",
    stages,
    behaviors,
    criticalGates,
    assignedDrill,
    strengths: behaviors.filter((behavior) => behavior.applicability === "applicable" && behavior.score >= 3).map((behavior) => behavior.id),
    constraints: behaviors.filter((behavior) => behavior.applicability === "applicable" && behavior.score < 3).map((behavior) => behavior.id),
  };
}

function evaluateCriticalGates({ normalizedTurns, hardNo, behaviors, methodPack, claimAudit }) {
  const behaviorById = new Map(behaviors.map((behavior) => [behavior.id, behavior]));
  return methodPack.rubric.criticalGates.map((definition) => {
    let status = "not_observed";
    let evidence = [];
    if (definition.id === "respect_hard_no" && hardNo.observed) {
      const hardNoBehavior = behaviorById.get("hard_no_clean_exit");
      evidence = [
        { turnIndex: hardNo.customer.turnIndex, reason: "explicit hard no", excerpt: excerpt(hardNo.customer.text) },
        ...hardNoBehavior.evidence,
        ...hardNoBehavior.counterEvidence,
      ];
      status = hardNoBehavior.counterEvidence.length ? "fail" : hardNoBehavior.evidence.length ? "pass" : "review";
    }
    if (definition.id === "truthful_claims") {
      const claims = normalizedTurns.filter(
        (turn) => turn.role === "rep" && /\b(helped|worked with|guarantee|\d+\s+(?:companies|sites|customers)|percent|%)\b/i.test(turn.text),
      );
      if (claims.length) {
        evidence = claims.map((turn) => ({ turnIndex: turn.turnIndex, reason: "claim requires provenance", excerpt: excerpt(turn.text) }));
        status = claimAudit === true ? "pass" : claimAudit === false ? "fail" : "review";
      }
    }
    if (definition.id === "respect_real_authority") {
      const authorityConcern = normalizedTurns.find(
        (turn) => turn.role === "customer" && /\b(need (?:the|to ask)|board|partner|procurement|finance|approval|committee)\b/i.test(turn.text),
      );
      const bypass = authorityConcern && normalizedTurns.find(
        (turn) => turn.role === "rep" && turn.turnIndex > authorityConcern.turnIndex
          && /\b(don't need (?:them|approval)|ignore (?:them|procurement)|sign without|you can decide alone)\b/i.test(turn.text),
      );
      if (authorityConcern) {
        evidence = [{ turnIndex: authorityConcern.turnIndex, reason: "real authority requirement stated", excerpt: excerpt(authorityConcern.text) }];
        if (bypass) evidence.push({ turnIndex: bypass.turnIndex, reason: "attempts to bypass authority", excerpt: excerpt(bypass.text) });
        status = bypass ? "fail" : behaviorById.get("bant_authority").evidence.length ? "pass" : "review";
      }
    }
    if (definition.id === "fit_before_commitment") {
      const noFit = normalizedTurns.find(
        (turn) => turn.role === "customer" && /\b(cannot benefit|can't benefit|not a fit|no need for this|would not help us)\b/i.test(turn.text),
      );
      const commitment = noFit && normalizedTurns.find(
        (turn) => turn.role === "rep" && turn.turnIndex > noFit.turnIndex
          && /\b(book|buy|pay|sign|go ahead|invoice)\b/i.test(turn.text),
      );
      if (noFit) {
        evidence = [{ turnIndex: noFit.turnIndex, reason: "material no-fit evidence", excerpt: excerpt(noFit.text) }];
        if (commitment) evidence.push({ turnIndex: commitment.turnIndex, reason: "asks for commitment despite no fit", excerpt: excerpt(commitment.text) });
        status = commitment ? "fail" : "review";
      }
    }
    return { ...definition, status, evidence };
  });
}

module.exports = { evaluateMethod };
