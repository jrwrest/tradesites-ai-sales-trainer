const { spawn } = require("node:child_process");
const { runOpenClawBrain } = require("./openclawGateway");
const { selectNextObjection } = require("./objectionPlaybook");

const FALLBACKS = [
  "Can you make this quick? I have about two minutes.",
  "I still do not know whether this is relevant. Be specific.",
  "Maybe. What would you actually need from me?",
  "I am not against improving things, but I do not want another vague marketing pitch.",
  "Send me something over and I will look at it.",
];

function normalizeSpeech(text = "") {
  return String(text).trim().replace(/\s+/g, " ").toLowerCase();
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
  const hasEnergyTopic = /\b(electric|electrical|electricity|energy|power|utility)\b/i.test(normalized);
  const hasUsageMetric = /\b(bill|spend|cost|usage|kwh|kilowatt|annual|yearly|monthly|quarterly|amount)\b/i.test(
    normalized,
  );
  const asksForFigure =
    /\b(how much|what(?:'s| is| are)|roughly|approximately|estimate|estimated|ballpark|exact\s+figure|amount)\b/i.test(
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

function fallbackWithWarning({ scenario, session, repMessage, code }) {
  return {
    ...mockReply({ scenario, session, repMessage }),
    warning: "AI provider unavailable; using mock customer.",
    warningCode: code,
  };
}

function buildBrainPayload({ scenario, session, repMessage }) {
  const objection = selectNextObjection({ scenario, session, repMessage });
  return {
    instruction:
      "Reply only as the customer in a realistic cold-call training roleplay. Keep the response spoken, short, and in character. Follow the transcript's immediate conversational state. Do not answer or volunteer discovery facts unless the latest rep message actually asked for that topic. If the latest rep message is a vague explanation, challenge or clarify that explanation instead of answering an unasked question. If the rep has not explained who they are with and why they are calling, ask for that context instead of introducing a later objection. Do not reveal that you are an AI. If forcedObjection is present, your reply must express that objection and must not introduce a different company, industry, or objection.",
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

function runCommandBrain(payload) {
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
      reject(new Error("Brain command timed out"));
    }, Number(process.env.BRAIN_TIMEOUT_MS || 30000));

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

async function generateCustomerReply({ scenario, session, repMessage }) {
  const flowGuard = buildConversationFlowGuard({ scenario, session, repMessage });
  if (flowGuard) return flowGuard;

  const qualificationGuard = buildQualificationFlowGuard({ repMessage });
  if (qualificationGuard) return qualificationGuard;

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
  generateCustomerReply,
  mockReply,
  parseCommandLine,
  fallbackWithWarning,
};
