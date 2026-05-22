const { spawn } = require("node:child_process");
const { runOpenClawBrain } = require("./openclawGateway");
const { buildDialogueReply } = require("./dialogueManager");
const { hasHardNo, selectNextObjection } = require("./objectionPlaybook");

const FALLBACKS = [
  "Can you make this quick? I have about two minutes.",
  "I still do not know whether this is relevant. Be specific.",
  "Maybe. What would you actually need from me?",
  "I am not against improving things, but I do not want another vague marketing pitch.",
  "Send me something over and I will look at it.",
];

const DEFAULT_DIALOGUE_RENDER_TIMEOUT_MS = 10000;
const activeDialogueRenderSessions = new Map();
const activeDialogueRenderUsers = new Map();
let activeDialogueRenderGlobalCount = 0;
const dialogueRenderStats = {
  attempts: 0,
  rendered: 0,
  fallbacks: 0,
  timeouts: 0,
  constraintViolations: 0,
  providerErrors: 0,
  concurrencyLimited: 0,
};

const RIGHT_PERSON_REPLIES = [
  "Maybe. What did you send over?",
  "No, not directly. What is this about?",
  "It depends what you mean by energy decisions. Give me the short version.",
  "Possibly, but I need to know what you are asking before I point you anywhere.",
];

function normalizeSpeech(text = "") {
  return String(text).trim().replace(/\s+/g, " ").toLowerCase();
}

function stableIndex(seedText, modulo) {
  const hash = Array.from(String(seedText || "")).reduce(
    (total, char) => (total * 31 + char.charCodeAt(0)) >>> 0,
    7,
  );
  return modulo === 0 ? 0 : hash % modulo;
}

function latestRepTurnMatches({ session, repMessage }) {
  const userTurns = (session.turns || []).filter((turn) => turn.role === "user");
  const latestUserTurn = userTurns[userTurns.length - 1];
  if (!latestUserTurn) return false;
  return normalizeSpeech(latestUserTurn.text) === normalizeSpeech(repMessage);
}

function hasEarlyCallContext(text = "") {
  return /\b(solar|energy|electricity|ppa|power purchase|commercial|site|roof|renewable|installer|solar installer list|company|business|calling about|reason for (the )?call|regarding|speak with|talking to|emailed|email|sent you|20 seconds|twenty seconds|quick question)\b/i.test(
    text,
  );
}

function hasPermissionAsk(text = "") {
  return /\b(can i|could i|may i|do you have|have you got|is now|would it be okay|take|spare|give me|quick question|20 seconds|twenty seconds|half a minute|briefly)\b/i.test(
    text,
  );
}

function hasRightPersonAsk(text = "") {
  return /\b(best person|right person|someone better|better person|best (?:one|person) to (?:speak|talk|deal) with|right (?:one|person) to (?:speak|talk|deal) with|who (?:would be )?(?:best|better) to (?:speak|talk) (?:to|with)|who (?:looks after|handles|owns|deals with)|(?:do|would) you (?:look after|handle|own|cover|deal with)|are you (?:the )?(?:person|one)|would you be (?:the )?(?:person|one)|is this (?:something )?you (?:look after|handle|own|cover|deal with))\b/i.test(
    text,
  );
}

function isCleanExit(text = "") {
  return /\b(understood|i understand|no problem|all good|thanks|thank you|close (?:it|this) off|take you off|remove you|won't call|will not call|bye|goodbye)\b/i.test(
    text,
  );
}

function extractCallerName(text = "") {
  const match = String(text).match(/\b(?:this is|it's|its|i am|i'm)\s+([a-z][a-z'-]{1,30})\b/i);
  if (!match) return null;
  return match[1][0].toUpperCase() + match[1].slice(1).toLowerCase();
}

function firstCustomerTurnAsksForContext(session) {
  const customerTurns = (session.turns || []).filter((turn) => turn.role === "persona" || turn.speaker === "customer");
  if (customerTurns.length !== 1) return false;
  return /\b(who'?s calling|who is calling|who is this|who are you|who am i speaking|what is this about|what'?s this about|calling,? please|calling please|what regarding)\b/i.test(
    customerTurns[0].text || "",
  );
}

function buildConversationFlowGuard({ scenario, session, repMessage }) {
  const userTurns = (session.turns || []).filter((turn) => turn.role === "user");
  if (userTurns.length !== 1 || !latestRepTurnMatches({ session, repMessage })) return null;
  if (!firstCustomerTurnAsksForContext(session)) return null;

  if (!hasEarlyCallContext(repMessage)) {
    const callerName = extractCallerName(repMessage);
    return {
      text: callerName
        ? `${callerName} from where, and what is this about?`
        : "Who are you with, and what is this about?",
      mood: "busy",
      provider: "flow_guard",
      flowGuard: "missing_call_context",
      objectionId: scenario.objectionPlaybookId ? "gatekeeper-who-is-this" : undefined,
      objectionType: "gatekeeper",
    };
  }

  if (hasRightPersonAsk(repMessage)) {
    return {
      text: RIGHT_PERSON_REPLIES[stableIndex(`${session.id}:${repMessage}`, RIGHT_PERSON_REPLIES.length)],
      mood: "busy",
      provider: "flow_guard",
      flowGuard: "right_person_check",
    };
  }

  if (!hasPermissionAsk(repMessage)) {
    return {
      text: "Okay. Keep it brief. What is the relevance to us?",
      mood: "busy",
      provider: "flow_guard",
      flowGuard: "missing_permission_or_relevance",
    };
  }

  return null;
}

function asksForEnergyUsageFigure(text = "") {
  const normalized = String(text || "");
  const hasEnergyTopic = /\b(electric|electrical|electricity|energy|power|utility|kwh|kilowatt|daytime usage)\b/i.test(
    normalized,
  );
  const hasUsageMetric = /\b(bill|spend|cost|usage|kwh|kilowatt|unit rate|rate|annual|yearly|monthly|quarterly|amount)\b/i.test(
    normalized,
  );
  const asksForFigure =
    /\b(how much|what(?:'s| is| are)|what do you pay|roughly|approximately|estimate|estimated|ballpark|exact\s+figure|amount)\b/i.test(
      normalized,
    ) ||
    /\b(can|could|would)\s+you\s+(?:share|tell|check|confirm|give|send)\b/i.test(normalized) ||
    /\bdo\s+you\s+(?:know|have)\b/i.test(normalized);

  return hasEnergyTopic && hasUsageMetric && asksForFigure;
}

function buildQualificationFlowGuard({ repMessage }) {
  if (!asksForEnergyUsageFigure(repMessage)) return null;

  return {
    text: "I would need to check the exact figure. It is a fair bit, but why do you need that?",
    mood: "guarded",
    provider: "flow_guard",
    flowGuard: "energy_bill_qualification",
  };
}

function latestCustomerObjection(session) {
  const customerTurns = (session.turns || []).filter((turn) => turn.role === "persona" || turn.speaker === "customer");
  return customerTurns[customerTurns.length - 1] || null;
}

function buildObjectionFollowUpGuard({ session, repMessage }) {
  const latestCustomerTurn = latestCustomerObjection(session);
  if (!latestCustomerTurn?.objectionId) return null;

  const text = String(repMessage || "");

  if (
    latestCustomerTurn.objectionId === "budget-free-claim" &&
    /\b(funded|provider pays|no upfront|generated power|agreed terms|commercial model|site fit|demand)\b/i.test(text)
  ) {
    return {
      text: "Okay, so what would you actually need from us to check whether it makes sense?",
      mood: "guarded",
      provider: "flow_guard",
      flowGuard: "commercial_model_follow_up",
      objectionId: latestCustomerTurn.objectionId,
      objectionType: latestCustomerTurn.objectionType,
    };
  }

  if (
    latestCustomerTurn.objectionId === "landlord" &&
    /\b(landlord|owner|short note|close (?:it|this) off|not realistic|useful)\b/i.test(text)
  ) {
    return {
      text: "A short note might be okay, but I am not promising the landlord will engage with it.",
      mood: "guarded",
      provider: "flow_guard",
      flowGuard: "landlord_follow_up",
      objectionId: latestCustomerTurn.objectionId,
      objectionType: latestCustomerTurn.objectionType,
    };
  }

  return null;
}

function fallbackWithWarning({ scenario, session, repMessage, code }) {
  return {
    ...mockReply({ scenario, session, repMessage }),
    warning: "AI provider unavailable; using mock customer.",
    warningCode: code,
  };
}

function isDialogueLlmRenderEnabled() {
  return process.env.DIALOGUE_LLM_RENDER_ENABLED === "1";
}

function getDialogueRenderTimeoutMs() {
  const timeoutMs = Number(process.env.DIALOGUE_LLM_RENDER_TIMEOUT_MS || DEFAULT_DIALOGUE_RENDER_TIMEOUT_MS);
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_DIALOGUE_RENDER_TIMEOUT_MS;
}

function getDialogueRenderMaxConcurrentPerSession() {
  const maxConcurrent = Number(process.env.DIALOGUE_LLM_RENDER_MAX_CONCURRENT_PER_SESSION || 1);
  return Number.isFinite(maxConcurrent) && maxConcurrent > 0 ? Math.floor(maxConcurrent) : 1;
}

function getDialogueRenderMaxConcurrentPerUser() {
  const maxConcurrent = Number(process.env.DIALOGUE_LLM_RENDER_MAX_CONCURRENT_PER_USER || 2);
  return Number.isFinite(maxConcurrent) && maxConcurrent > 0 ? Math.floor(maxConcurrent) : 2;
}

function getDialogueRenderMaxConcurrentGlobal() {
  const maxConcurrent = Number(process.env.DIALOGUE_LLM_RENDER_MAX_CONCURRENT_GLOBAL || 10);
  return Number.isFinite(maxConcurrent) && maxConcurrent > 0 ? Math.floor(maxConcurrent) : 10;
}

function getDialogueRenderStats() {
  return {
    ...dialogueRenderStats,
    active: activeDialogueRenderGlobalCount,
  };
}

function getDefaultRenderProvider() {
  if (process.env.OPENCLAW_GATEWAY_URL) return (payload, options) => runOpenClawBrain(payload, options);
  if (process.env.CODEX_BRAIN_COMMAND) return (payload, options) => runCommandBrain(payload, options);
  return null;
}

function withTimeout(promise, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      const error = new Error("Dialogue render timed out");
      error.code = "DIALOGUE_RENDER_TIMEOUT";
      reject(error);
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function forbiddenTopicsForReply(reply) {
  if (reply.flowGuard === "missing_call_context" || reply.dialogue?.customerAction === "repeat_gatekeeper_context_request") {
    return ["existing solar", "multi-site complexity", "procurement"];
  }
  if (reply.flowGuard === "right_person_check" || reply.dialogue?.customerAction === "answer_routing_question") {
    return ["existing solar", "multi-site complexity", "procurement"];
  }
  if (reply.dialogue?.customerAction === "end_call" || reply.dialogue?.customerAction === "repeat_hard_no") {
    return ["meeting request", "sale reopening", "new objection"];
  }
  if (reply.dialogue?.customerAction === "stay_on_existing_solar") {
    return ["landlord", "procurement", "multi-site complexity", "commercial risk"];
  }
  if (reply.dialogue?.customerAction === "stay_on_commercial_model") {
    return ["existing solar", "landlord", "procurement", "multi-site complexity"];
  }
  if (reply.dialogue?.customerAction === "stay_on_landlord_route") {
    return ["existing solar", "procurement", "multi-site complexity", "commercial risk"];
  }
  return [];
}

function requiredTopicForReply(reply) {
  if (reply.flowGuard === "missing_call_context" || reply.dialogue?.customerAction === "repeat_gatekeeper_context_request") {
    return "caller identity, company, and reason for the call";
  }
  if (reply.flowGuard === "right_person_check" || reply.dialogue?.customerAction === "answer_routing_question") {
    return "whether this is the right person or what the call is about";
  }
  if (reply.flowGuard === "energy_bill_qualification") {
    return "why the rep needs electricity usage or bill information";
  }
  if (reply.flowGuard === "commercial_model_follow_up" || reply.dialogue?.customerAction === "stay_on_commercial_model") {
    return "what is needed to check the commercial model";
  }
  if (reply.flowGuard === "landlord_follow_up" || reply.dialogue?.customerAction === "stay_on_landlord_route") {
    return "landlord route or landlord note";
  }
  if (reply.dialogue?.customerAction === "stay_on_existing_solar") {
    return "existing solar system checks";
  }
  if (reply.dialogue?.customerAction === "end_call" || reply.dialogue?.customerAction === "repeat_hard_no") {
    return "ending the call after a hard no";
  }
  return "latest rep message";
}

function customerActionForReply(reply) {
  if (reply.dialogue?.customerAction) return reply.dialogue.customerAction;
  if (reply.flowGuard === "missing_call_context") return "repeat_gatekeeper_context_request";
  if (reply.flowGuard === "right_person_check") return "answer_routing_question";
  if (reply.flowGuard === "energy_bill_qualification") return "answer_energy_qualification_question";
  if (reply.flowGuard === "commercial_model_follow_up") return "stay_on_commercial_model";
  if (reply.flowGuard === "landlord_follow_up") return "stay_on_landlord_route";
  return "reply_to_latest_rep_turn";
}

function buildDialogueContract({ reply, session, repMessage }) {
  const customerAction = customerActionForReply(reply);
  return {
    state: reply.dialogue?.state || reply.flowGuard || "guarded_reply",
    repAct: reply.dialogue?.repAct || reply.flowGuard || "guarded_reply",
    customerAction,
    sourceProvider: reply.provider,
    flowGuard: reply.flowGuard,
    activeObjectionId: reply.objectionId || reply.dialogue?.activeObjectionId || null,
    activeObjectionType: reply.objectionType || reply.dialogue?.activeObjectionType || null,
    requiredTopic: requiredTopicForReply(reply),
    forbiddenTopics: forbiddenTopicsForReply(reply),
    mustAnswerLatestQuestion: true,
    schedulerBlocked: reply.dialogue?.schedulerBlocked ?? true,
    tone: `${reply.mood || "busy"}, natural, guarded`,
    maxWords: 28,
    fallbackText: reply.text,
    latestRepMessage: repMessage,
    turnCount: (session.turns || []).length,
  };
}

function buildDialogueRenderPayload({ scenario, session, repMessage, contract }) {
  const payload = {
    instruction:
      "Reply only as the customer in a realistic cold-call training roleplay. Render one short, natural spoken reply that follows dialogueContract exactly. Answer or challenge the latest rep message directly. Do not jump to a different objection. Do not reveal that you are an AI.",
    scenario,
    sessionId: session.id,
    transcript: session.turns,
    latestRepMessage: repMessage,
    dialogueContract: contract,
    responseSchema: {
      text: "string customer reply",
      mood: "short optional mood label",
    },
  };

  if (contract.activeObjectionId) {
    payload.forcedObjection = {
      id: contract.activeObjectionId,
      type: contract.activeObjectionType,
    };
  }

  return payload;
}

function matchesForbiddenTopic(text, topic) {
  const normalized = String(text || "");
  if (topic === "existing solar") return /\b(already have solar|solar installed|existing solar|current system|monitor the system)\b/i.test(normalized);
  if (topic === "multi-site complexity") return /\b(multiple sites|different leases|different meters|not a quick conversation)\b/i.test(normalized);
  if (topic === "procurement") return /\b(procurement|sustainability|supplier call)\b/i.test(normalized);
  if (topic === "landlord") return /\b(landlord|building owner|do not own|don't own|owner would|building)\b/i.test(normalized);
  if (topic === "commercial risk") return /\b(no upfront|commercial model|catch shows up|funded route|provider pays)\b/i.test(normalized);
  if (topic === "meeting request") return /\b(meeting|book|schedule|calendar|supplier call)\b/i.test(normalized);
  if (topic === "sale reopening") return /\b(send me|tell me more|what are you offering|sounds interesting)\b/i.test(normalized);
  if (topic === "new objection") return /\b(already have solar|procurement|landlord|consultant|multiple sites)\b/i.test(normalized);
  return false;
}

function matchesRequiredAction(text, contract) {
  const normalized = String(text || "");
  if (contract.customerAction === "answer_routing_question") {
    return /\b(possibly|maybe|not directly|depends|right person|person|look after|handle|deal with|decision|energy|site|what did you send|what is this about|short version|point you|someone)\b/i.test(
      normalized,
    );
  }
  if (contract.customerAction === "answer_energy_qualification_question") {
    return /\b(check|exact figure|figure|fair bit|why do you need|electricity|energy|usage|bill|spend)\b/i.test(
      normalized,
    );
  }
  if (contract.customerAction === "stay_on_existing_solar") {
    return /\b(solar|system|current|output|performance|maximi[sz]|monitor|check|what would you need)\b/i.test(
      normalized,
    );
  }
  if (contract.customerAction === "stay_on_commercial_model") {
    return /\b(need from us|check whether|makes sense|commercial model|funded|no upfront|terms|site fit)\b/i.test(
      normalized,
    );
  }
  if (contract.customerAction === "stay_on_landlord_route") {
    return /\b(landlord|owner|building|property|short note|note)\b/i.test(normalized);
  }
  return true;
}

function validateRenderedDialogue({ text, contract }) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return { code: "empty_output", reason: "Provider returned no customer text." };

  for (const topic of contract.forbiddenTopics || []) {
    if (matchesForbiddenTopic(trimmed, topic)) {
      return {
        code: "forbidden_topic",
        topic,
        reason: `Rendered reply introduced forbidden topic: ${topic}.`,
      };
    }
  }

  if (contract.customerAction === "repeat_gatekeeper_context_request") {
    const asksForContext = /\b(who|from where|what company|who are you with|what is this about|what are you calling about|which company)\b/i.test(
      trimmed,
    );
    if (!asksForContext) {
      return { code: "ignored_context_request", reason: "Rendered reply did not ask for caller/company context." };
    }
  }

  if (contract.customerAction === "end_call" && !/\b(okay|thanks|bye|goodbye|understood)\b/i.test(trimmed)) {
    return { code: "did_not_end_call", reason: "Rendered reply did not end the call." };
  }

  if (contract.customerAction === "repeat_hard_no" && !/\b(no requirement|take us off|not interested|do not call|no use)\b/i.test(trimmed)) {
    return { code: "did_not_repeat_hard_no", reason: "Rendered reply did not repeat the hard no." };
  }

  if (!matchesRequiredAction(trimmed, contract)) {
    return {
      code: "ignored_latest_question",
      reason: `Rendered reply did not satisfy customer action: ${contract.customerAction}.`,
    };
  }

  return null;
}

function acquireDialogueRenderSlot({ sessionKey, userKey }) {
  const sessionCount = activeDialogueRenderSessions.get(sessionKey) || 0;
  if (sessionCount >= getDialogueRenderMaxConcurrentPerSession()) {
    return { ok: false, reason: "concurrency_limit" };
  }

  const userCount = activeDialogueRenderUsers.get(userKey) || 0;
  if (userCount >= getDialogueRenderMaxConcurrentPerUser()) {
    return { ok: false, reason: "user_concurrency_limit" };
  }

  if (activeDialogueRenderGlobalCount >= getDialogueRenderMaxConcurrentGlobal()) {
    return { ok: false, reason: "global_concurrency_limit" };
  }

  activeDialogueRenderSessions.set(sessionKey, sessionCount + 1);
  activeDialogueRenderUsers.set(userKey, userCount + 1);
  activeDialogueRenderGlobalCount += 1;
  return { ok: true };
}

function releaseDialogueRenderSlot({ sessionKey, userKey }) {
  const remainingSessionCount = (activeDialogueRenderSessions.get(sessionKey) || 1) - 1;
  if (remainingSessionCount > 0) {
    activeDialogueRenderSessions.set(sessionKey, remainingSessionCount);
  } else {
    activeDialogueRenderSessions.delete(sessionKey);
  }

  const remainingUserCount = (activeDialogueRenderUsers.get(userKey) || 1) - 1;
  if (remainingUserCount > 0) {
    activeDialogueRenderUsers.set(userKey, remainingUserCount);
  } else {
    activeDialogueRenderUsers.delete(userKey);
  }

  activeDialogueRenderGlobalCount = Math.max(0, activeDialogueRenderGlobalCount - 1);
}

function withDialogueTrace(reply, trace) {
  return {
    ...reply,
    dialogue: {
      ...(reply.dialogue || {}),
      repAct: reply.dialogue?.repAct || trace.contract.repAct,
      customerAction: reply.dialogue?.customerAction || trace.contract.customerAction,
      state: reply.dialogue?.state || trace.contract.state,
      schedulerBlocked: reply.dialogue?.schedulerBlocked ?? trace.contract.schedulerBlocked,
      renderedBy: trace.renderedBy,
      rendererProvider: trace.rendererProvider,
      fallbackReason: trace.fallbackReason,
      constraintViolation: trace.constraintViolation,
      latencyMs: trace.latencyMs,
    },
  };
}

async function maybeRenderDialogueReply({ scenario, session, repMessage, reply, renderProvider }) {
  const provider = renderProvider || getDefaultRenderProvider();
  if (!isDialogueLlmRenderEnabled() || !provider) return reply;

  const sessionKey = session.id || "stateless";
  const userKey = session.repId || "local";
  const contract = buildDialogueContract({ reply, session, repMessage });
  const slot = acquireDialogueRenderSlot({ sessionKey, userKey });
  if (!slot.ok) {
    dialogueRenderStats.fallbacks += 1;
    dialogueRenderStats.concurrencyLimited += 1;
    return withDialogueTrace(reply, {
      contract,
      renderedBy: "fallback",
      rendererProvider: "none",
      fallbackReason: slot.reason,
      constraintViolation: null,
      latencyMs: 0,
    });
  }

  const startedAt = Date.now();
  dialogueRenderStats.attempts += 1;
  const timeoutMs = getDialogueRenderTimeoutMs();
  const deadline = startedAt + timeoutMs;
  const providerName = renderProvider ? "injected" : getBrainProvider();

  try {
    const payload = buildDialogueRenderPayload({ scenario, session, repMessage, contract });
    let remainingTimeoutMs = Math.max(1, deadline - Date.now());
    let rendered = await withTimeout(
      Promise.resolve().then(() => provider(payload, { timeoutMs: remainingTimeoutMs })),
      remainingTimeoutMs,
    );
    let renderedText = String(rendered?.text || rendered?.reply || "").trim().slice(0, 1200);
    let violation = validateRenderedDialogue({ text: renderedText, contract });
    const rendererProvider = rendered?.provider || providerName;

    if (violation && process.env.DIALOGUE_LLM_RENDER_RETRY_ON_VIOLATION === "1" && Date.now() < deadline - 100) {
      const retryPayload = {
        ...payload,
        instruction: `${payload.instruction} Your previous reply violated the dialogue contract: ${violation.reason}. Try again and obey the contract.`,
        previousViolation: violation,
      };
      remainingTimeoutMs = Math.max(1, deadline - Date.now());
      rendered = await withTimeout(
        Promise.resolve().then(() => provider(retryPayload, { timeoutMs: remainingTimeoutMs })),
        remainingTimeoutMs,
      );
      renderedText = String(rendered?.text || rendered?.reply || "").trim().slice(0, 1200);
      violation = validateRenderedDialogue({ text: renderedText, contract });
    }

    if (violation) {
      dialogueRenderStats.fallbacks += 1;
      dialogueRenderStats.constraintViolations += 1;
      return withDialogueTrace(reply, {
        contract,
        renderedBy: "fallback",
        rendererProvider,
        fallbackReason: "constraint_violation",
        constraintViolation: violation,
        latencyMs: Date.now() - startedAt,
      });
    }

    dialogueRenderStats.rendered += 1;
    return withDialogueTrace(
      {
        ...reply,
        text: renderedText,
        mood: rendered?.mood || reply.mood,
        provider: rendererProvider,
        warning: undefined,
        warningCode: undefined,
      },
      {
        contract,
        renderedBy: "llm",
        rendererProvider,
        fallbackReason: null,
        constraintViolation: null,
        latencyMs: Date.now() - startedAt,
      },
    );
  } catch (error) {
    const timedOut = error.code === "DIALOGUE_RENDER_TIMEOUT" || /timed out/i.test(error.message || "");
    dialogueRenderStats.fallbacks += 1;
    if (timedOut) {
      dialogueRenderStats.timeouts += 1;
    } else {
      dialogueRenderStats.providerErrors += 1;
    }
    return withDialogueTrace(reply, {
      contract,
      renderedBy: "fallback",
      rendererProvider: providerName,
      fallbackReason: timedOut ? "provider_timeout" : "provider_error",
      constraintViolation: null,
      latencyMs: Date.now() - startedAt,
    });
  } finally {
    releaseDialogueRenderSlot({ sessionKey, userKey });
  }
}

function buildBrainPayload({ scenario, session, repMessage }) {
  const objection = selectNextObjection({ scenario, session, repMessage });
  return {
    instruction:
      "Reply only as the customer in a realistic cold-call training roleplay. Keep the response spoken, short, and in character. Follow the transcript's immediate conversational state. Do not answer or volunteer discovery facts unless the latest rep message actually asked for that topic. If the latest rep message asks whether you are the right/best person or decision-maker, answer that routing question briefly first; you may be the right person, not the right person, or need clarification before routing them. If the latest rep message is a vague explanation, challenge or clarify that explanation instead of answering an unasked question. If the transcript already contains a hard no or take-us-off request, do not introduce new objections; if the rep exits cleanly, end politely, and if the rep pushes, repeat the hard no. If the rep has not explained who they are with and why they are calling, ask for that context instead of introducing a later objection. Do not reveal that you are an AI. If forcedObjection is present, your reply must express that objection and must not introduce a different company, industry, or objection.",
    scenario,
    sessionId: session.id,
    transcript: session.turns,
    latestRepMessage: repMessage,
    forcedObjection: objection
      ? {
          id: objection.id,
          type: objection.type,
          stage: objection.stage,
          text: objection.text,
          terminal: objection.terminal === true,
        }
      : null,
    responseSchema: {
      text: "string customer reply",
      mood: "short optional mood label",
    },
  };
}

function mockReply({ scenario, session, repMessage }) {
  const objection = selectNextObjection({ scenario, session, repMessage });
  if (objection) {
    return {
      text: objection.text,
      mood: objection.type === "hard_no" ? "firm" : "skeptical",
      provider: "mock",
      objectionId: objection.id,
      objectionType: objection.type,
    };
  }

  const text = repMessage.toLowerCase();
  const turnCount = session.turns.filter((turn) => turn.role === "persona" || turn.speaker === "customer").length;
  const persona = scenario.persona;

  if (hasHardNo(session.turns || [])) {
    return {
      text: isCleanExit(repMessage) ? "Okay. Thanks. Bye." : "As I said, we have no requirement. Please take us off your list.",
      mood: "firm",
      provider: "mock",
    };
  }

  const substantiveFirstLine =
    /\b(meeting|book|schedule|call|review|audit|next step|price|cost|expensive|budget|google|reputation|trust|lead|enquir|referral|pipeline|follow.?up|send|email|information|info)\b/.test(
      text,
    );

  if (turnCount === 0 && !substantiveFirstLine) {
    return {
      text: `Hi, ${persona.name} speaking. I am between things, so what is this about?`,
      mood: "busy",
      provider: "mock",
    };
  }

  if (/\b(meeting|book|schedule|call|review|audit|next step)\b/.test(text)) {
    const earned = /\b(current|lead|review|follow|problem|challenge|competitor|referral|agency)\b/.test(
      session.turns.map((turn) => turn.text.toLowerCase()).join(" "),
    );
    return {
      text: earned
        ? "A short review could be fine. Send me a calendar option, but keep it practical."
        : "You are asking for a meeting before I know if this is relevant. Why should I spend time on it?",
      mood: earned ? "cautiously open" : "resistant",
      provider: "mock",
    };
  }

  if (/\b(price|cost|expensive|budget)\b/.test(text)) {
    return {
      text: "That is exactly my concern. Agencies always say there is upside, then the invoices arrive first.",
      mood: "skeptical",
      provider: "mock",
    };
  }

  if (/\b(review|google|reputation|trust)\b/.test(text)) {
    return {
      text: "Our reviews are decent, but a couple of newer competitors look stronger online than they should.",
      mood: "more open",
      provider: "mock",
    };
  }

  if (/\b(lead|enquir|referral|pipeline|follow.?up)\b/.test(text)) {
    return {
      text: "Most good work still comes through referrals. The problem is the random enquiries are hit and miss.",
      mood: "practical",
      provider: "mock",
    };
  }

  if (/\b(send|email|information|info)\b/.test(text)) {
    return {
      text: "Just send me information. I am not promising I will read it.",
      mood: "dismissive",
      provider: "mock",
    };
  }

  return {
    text: FALLBACKS[turnCount % FALLBACKS.length],
    mood: "guarded",
    provider: "mock",
  };
}

function parseCommandLine(command) {
  try {
    const parsed = JSON.parse(command);
    if (Array.isArray(parsed) && parsed.every((part) => typeof part === "string") && parsed.length > 0) {
      return { file: parsed[0], args: parsed.slice(1) };
    }
  } catch {
    // Fall through to the small quoted-string parser.
  }

  const parts = [];
  let current = "";
  let quote = null;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        parts.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current) parts.push(current);
  if (!parts.length || quote) throw new Error("Invalid CODEX_BRAIN_COMMAND");
  return { file: parts[0], args: parts.slice(1) };
}

function buildCommandEnv() {
  const allowed = new Set([
    "PATH",
    "HOME",
    "USER",
    "TMPDIR",
    "TEMP",
    "CODEX_MODEL",
    "CODEX_HOME",
  ]);
  for (const key of String(process.env.CODEX_BRAIN_ENV_ALLOWLIST || "").split(",")) {
    if (key.trim()) allowed.add(key.trim());
  }
  return Object.fromEntries([...allowed].filter((key) => process.env[key] !== undefined).map((key) => [key, process.env[key]]));
}

function runCommandBrain(payload, options = {}) {
  return new Promise((resolve, reject) => {
    const command = process.env.CODEX_BRAIN_COMMAND;
    if (!command) {
      reject(new Error("CODEX_BRAIN_COMMAND is not set"));
      return;
    }

    const { file, args } = parseCommandLine(command);
    const child = spawn(file, args, {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      env: buildCommandEnv(),
    });

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      const error = new Error("Brain command timed out");
      error.code = "DIALOGUE_RENDER_TIMEOUT";
      reject(error);
    }, Number(options.timeoutMs ?? process.env.BRAIN_TIMEOUT_MS ?? 30000));

    let stdout = "";
    let stderr = "";
    const maxStdoutBytes = Number(process.env.BRAIN_MAX_STDOUT_BYTES || 20000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout, "utf8") > maxStdoutBytes) {
        child.kill("SIGTERM");
        reject(new Error("Brain command returned too much output"));
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`Brain command exited ${code}: ${stderr.slice(0, 500)}`));
        return;
      }

      const trimmed = stdout.trim();
      if (!trimmed) {
        reject(new Error("Brain command returned no output"));
        return;
      }

      try {
        const parsed = JSON.parse(trimmed);
        resolve({
          text: String(parsed.text || parsed.reply || "").trim().slice(0, 1200),
          mood: parsed.mood || "unknown",
          provider: "command",
        });
      } catch {
        resolve({
          text: trimmed.slice(0, 1200),
          mood: "unknown",
          provider: "command",
        });
      }
    });

    child.stdin.end(JSON.stringify(payload));
  });
}

async function generateCustomerReply({ scenario, session, repMessage, renderProvider }) {
  if (process.env.DIALOGUE_MANAGER_ENABLED === "1") {
    const dialogueReply = buildDialogueReply({ scenario, session, repMessage });
    if (dialogueReply) {
      return maybeRenderDialogueReply({ scenario, session, repMessage, reply: dialogueReply, renderProvider });
    }
  }

  const flowGuard = buildConversationFlowGuard({ scenario, session, repMessage });
  if (flowGuard) return maybeRenderDialogueReply({ scenario, session, repMessage, reply: flowGuard, renderProvider });

  const qualificationGuard = buildQualificationFlowGuard({ repMessage });
  if (qualificationGuard) {
    return maybeRenderDialogueReply({ scenario, session, repMessage, reply: qualificationGuard, renderProvider });
  }

  const objectionFollowUpGuard = buildObjectionFollowUpGuard({ session, repMessage });
  if (objectionFollowUpGuard) {
    return maybeRenderDialogueReply({ scenario, session, repMessage, reply: objectionFollowUpGuard, renderProvider });
  }

  const payload = buildBrainPayload({ scenario, session, repMessage });
  const forcedObjection = payload.forcedObjection;

  if (process.env.OPENCLAW_GATEWAY_URL) {
    try {
      const reply = await runOpenClawBrain(payload);
      if (reply.text) {
        return {
          ...reply,
          objectionId: forcedObjection?.id,
          objectionType: forcedObjection?.type,
        };
      }
    } catch (error) {
      return fallbackWithWarning({ scenario, session, repMessage, code: "openclaw_unavailable" });
    }
  }

  if (process.env.CODEX_BRAIN_COMMAND) {
    try {
      const reply = await runCommandBrain(payload);
      if (reply.text) {
        return {
          ...reply,
          objectionId: forcedObjection?.id,
          objectionType: forcedObjection?.type,
        };
      }
    } catch (error) {
      return fallbackWithWarning({ scenario, session, repMessage, code: "command_unavailable" });
    }
  }

  return mockReply({ scenario, session, repMessage });
}

module.exports = {
  buildBrainPayload,
  buildCommandEnv,
  buildConversationFlowGuard,
  buildQualificationFlowGuard,
  getDialogueRenderMaxConcurrentGlobal,
  getDialogueRenderMaxConcurrentPerSession,
  getDialogueRenderMaxConcurrentPerUser,
  getDialogueRenderStats,
  getDialogueRenderTimeoutMs,
  generateCustomerReply,
  isDialogueLlmRenderEnabled,
  mockReply,
  parseCommandLine,
  fallbackWithWarning,
};
