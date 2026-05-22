const { hasHardNo } = require("./objectionPlaybook");

const ROUTING_REPLIES = [
  "Maybe. What did you send over?",
  "No, not directly. What is this about?",
  "It depends what you mean by energy decisions. Give me the short version.",
  "Possibly, but I need to know what you are asking before I point you anywhere.",
];

function stableIndex(seedText, modulo) {
  const hash = Array.from(String(seedText || "")).reduce(
    (total, char) => (total * 31 + char.charCodeAt(0)) >>> 0,
    7,
  );
  return modulo === 0 ? 0 : hash % modulo;
}

function latestCustomerTurn(session) {
  const customerTurns = (session.turns || []).filter((turn) => turn.role === "persona" || turn.speaker === "customer");
  return customerTurns[customerTurns.length - 1] || null;
}

function isRoutingQuestion(text = "") {
  return /\b(best\s+(?:best\s+)?person|right person|someone better|better person|best (?:one|person) to (?:speak|talk|deal) with|right (?:one|person) to (?:speak|talk|deal) with|who (?:would be )?(?:best|better) to (?:speak|talk) (?:to|with)|who (?:looks after|handles|owns|deals with)|(?:do|would) you (?:look after|handle|own|cover|deal with)|are you (?:the )?(?:person|one)|would you be (?:the )?(?:person|one)|is this (?:something )?you (?:look after|handle|own|cover|deal with))\b/i.test(
    text,
  );
}

function isCleanExit(text = "") {
  return /\b(understood|i understand|no problem|all good|thanks|thank you|close (?:it|this) off|take you off|remove you|won't call|will not call|bye|goodbye)\b/i.test(
    text,
  );
}

function answersExistingSolarObjection(text = "") {
  return /\b(maximi[sz](?:e|ing)|maximum|most of it|current system|covering|output|performance|expansion|battery|another site|unmet demand|check (?:that|whether|if))\b/i.test(
    text,
  );
}

function answersCommercialModelObjection(text = "") {
  return /\b(funded|provider pays|no upfront|generated power|agreed terms|commercial model|site fit|demand)\b/i.test(text);
}

function answersLandlordObjection(text = "") {
  return /\b(landlord|owner|short note|close (?:it|this) off|not realistic|useful)\b/i.test(text);
}

function isPermissionAsk(text = "") {
  return /\b(can i|could i|may i|do you have|have you got|we got|would it be okay|take|spare|give me|quick question|20 seconds|twenty seconds|30 seconds|thirty seconds|half a minute|briefly)\b/i.test(
    text,
  );
}

function isDiscoveryQuestion(text = "") {
  return /\b(how much|what(?:'s| is| are)|do you have|are you|is there|who handles|who owns|when do you|where do you|why do you|can you share|could you tell|roughly|ballpark)\b/i.test(
    text,
  );
}

function isValuePitch(text = "") {
  return /\b(help|cut|reduce|save|cheaper|funded|no upfront|solar install|electricity cost|commercial companies|power purchase|ppa)\b/i.test(
    text,
  );
}

function customerAskedForCallContext(turn) {
  return (
    turn?.objectionId === "gatekeeper-who-is-this" ||
    turn?.flowGuard === "missing_call_context" ||
    /\b(from where|who are you with|what is this about|what'?s this about|from where,? and what|coco from where|james from where)\b/i.test(
      turn?.text || "",
    )
  );
}

function answeredCallContext(text = "") {
  return /\b(from|with|at)\s+[A-Z]?[a-z][a-z0-9& .'-]{2,}|solar|energy|electricity|ppa|power purchase|commercial|company|business|scotland|installer|reason (?:for|i called)|calling about|sent (?:you )?an email|emailed/i.test(
    text,
  );
}

function classifyRepTurn({ session, repMessage }) {
  const latestCustomer = latestCustomerTurn(session);

  if (hasHardNo(session.turns || [])) {
    return {
      label: isCleanExit(repMessage) ? "clean_exit" : "push_after_hard_no",
      confidence: 0.95,
      reason: "Previous customer turn contains a hard no or take-us-off request.",
    };
  }

  if (customerAskedForCallContext(latestCustomer) && !answeredCallContext(repMessage)) {
    return {
      label: "context_repair_needed",
      confidence: 0.92,
      reason: "Customer asked for caller/company/reason context and the rep did not answer it.",
    };
  }

  if (isRoutingQuestion(repMessage)) {
    return {
      label: "routing_question",
      confidence: 0.9,
      reason: "Rep asked whether this is the right/best person or who owns the topic.",
    };
  }

  if (latestCustomer?.objectionId === "already-have-solar" && answersExistingSolarObjection(repMessage)) {
    return {
      label: "objection_answer",
      confidence: 0.88,
      reason: "Rep answered the existing-solar objection.",
      activeObjectionId: latestCustomer.objectionId,
      activeObjectionType: latestCustomer.objectionType,
    };
  }

  if (latestCustomer?.objectionId === "budget-free-claim" && answersCommercialModelObjection(repMessage)) {
    return {
      label: "objection_answer",
      confidence: 0.88,
      reason: "Rep answered the commercial-model objection.",
      activeObjectionId: latestCustomer.objectionId,
      activeObjectionType: latestCustomer.objectionType,
    };
  }

  if (latestCustomer?.objectionId === "landlord" && answersLandlordObjection(repMessage)) {
    return {
      label: "objection_answer",
      confidence: 0.88,
      reason: "Rep answered the landlord objection.",
      activeObjectionId: latestCustomer.objectionId,
      activeObjectionType: latestCustomer.objectionType,
    };
  }

  if (isDiscoveryQuestion(repMessage)) {
    return {
      label: "discovery_question",
      confidence: 0.72,
      reason: "Rep asked a discovery or qualification question.",
    };
  }

  if (isPermissionAsk(repMessage)) {
    return {
      label: "permission_ask",
      confidence: 0.72,
      reason: "Rep asked for time or permission to continue.",
    };
  }

  if (isValuePitch(repMessage)) {
    return {
      label: "value_pitch",
      confidence: 0.65,
      reason: "Rep gave a value proposition or pitch.",
    };
  }

  return {
    label: "unclassified",
    confidence: 0.2,
    reason: "No dialogue-manager rule matched.",
  };
}

function buildDialogueReply({ scenario, session, repMessage }) {
  const classification = classifyRepTurn({ scenario, session, repMessage });

  if (classification.label === "routing_question") {
    return {
      text: ROUTING_REPLIES[stableIndex(`${session.id}:${repMessage}`, ROUTING_REPLIES.length)],
      mood: "busy",
      provider: "dialogue_manager",
      dialogue: {
        repAct: classification.label,
        customerAction: "answer_routing_question",
        state: "routing",
        confidence: classification.confidence,
        reason: classification.reason,
        schedulerBlocked: true,
      },
    };
  }

  if (classification.label === "context_repair_needed") {
    return {
      text: "No, I am asking who you are with and what this is about.",
      mood: "confused",
      provider: "dialogue_manager",
      objectionId: "gatekeeper-who-is-this",
      objectionType: "gatekeeper",
      dialogue: {
        repAct: classification.label,
        customerAction: "repeat_gatekeeper_context_request",
        state: "opening_context",
        confidence: classification.confidence,
        reason: classification.reason,
        schedulerBlocked: true,
      },
    };
  }

  if (classification.label === "clean_exit") {
    return {
      text: "Okay. Thanks. Bye.",
      mood: "firm",
      provider: "dialogue_manager",
      dialogue: {
        repAct: classification.label,
        customerAction: "end_call",
        state: "terminal_hard_no",
        confidence: classification.confidence,
        reason: classification.reason,
        schedulerBlocked: true,
      },
    };
  }

  if (classification.label === "push_after_hard_no") {
    return {
      text: "As I said, we have no requirement. Please take us off your list.",
      mood: "firm",
      provider: "dialogue_manager",
      dialogue: {
        repAct: classification.label,
        customerAction: "repeat_hard_no",
        state: "terminal_hard_no",
        confidence: classification.confidence,
        reason: classification.reason,
        schedulerBlocked: true,
      },
    };
  }

  if (classification.activeObjectionId === "already-have-solar") {
    return {
      text: "Possibly, but what would you actually need to check? We already monitor the system.",
      mood: "guarded",
      provider: "dialogue_manager",
      objectionId: classification.activeObjectionId,
      objectionType: classification.activeObjectionType,
      dialogue: {
        repAct: classification.label,
        customerAction: "stay_on_existing_solar",
        state: "active_objection",
        confidence: classification.confidence,
        reason: classification.reason,
        schedulerBlocked: true,
      },
    };
  }

  if (classification.activeObjectionId === "budget-free-claim") {
    return {
      text: "Okay, so what would you actually need from us to check whether it makes sense?",
      mood: "guarded",
      provider: "dialogue_manager",
      objectionId: classification.activeObjectionId,
      objectionType: classification.activeObjectionType,
      dialogue: {
        repAct: classification.label,
        customerAction: "stay_on_commercial_model",
        state: "active_objection",
        confidence: classification.confidence,
        reason: classification.reason,
        schedulerBlocked: true,
      },
    };
  }

  if (classification.activeObjectionId === "landlord") {
    return {
      text: "A short note might be okay, but I am not promising the landlord will engage with it.",
      mood: "guarded",
      provider: "dialogue_manager",
      objectionId: classification.activeObjectionId,
      objectionType: classification.activeObjectionType,
      dialogue: {
        repAct: classification.label,
        customerAction: "stay_on_landlord_route",
        state: "active_objection",
        confidence: classification.confidence,
        reason: classification.reason,
        schedulerBlocked: true,
      },
    };
  }

  return null;
}

module.exports = {
  buildDialogueReply,
  classifyRepTurn,
};
