const crypto = require("node:crypto");
const WebSocket = require("ws");

const TERMINAL_PHASES = new Set(["end", "error"]);

function asRecord(value) {
  return value && typeof value === "object" ? value : {};
}

function readText(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const record = value;
  for (const key of ["delta", "text", "content", "reply", "message", "output"]) {
    if (typeof record[key] === "string") return record[key];
  }
  if (Array.isArray(record.content)) {
    return record.content
      .map((part) => {
        const item = asRecord(part);
        return typeof item.text === "string" ? item.text : "";
      })
      .join("");
  }
  return "";
}

function formatGatewayError(error) {
  if (!error || typeof error !== "object") return String(error);
  const message = error.message || error.code || "gateway request failed";
  return String(message).slice(0, 400);
}

class OpenClawGatewayClient {
  constructor({ url, token, timeoutMs = 120000, agentId = "main" }) {
    this.url = url;
    this.token = token;
    this.timeoutMs = timeoutMs;
    this.agentId = agentId;
    this.pending = new Map();
    this.connected = false;
    this.ws = null;
    this.currentRun = null;
    this.assistantText = "";
  }

  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url, { maxPayload: 25 * 1024 * 1024 });
      this.ws = ws;

      const timer = setTimeout(() => {
        reject(new Error("OpenClaw gateway connect timed out"));
        this.close();
      }, Math.min(this.timeoutMs, 30000));

      ws.on("message", (raw) => {
        this.handleMessage(String(raw), resolve, reject, timer);
      });

      ws.on("error", (error) => {
        clearTimeout(timer);
        reject(new Error(`OpenClaw gateway connection failed: ${error.message}`));
      });

      ws.on("close", () => {
        for (const pending of this.pending.values()) {
          pending.reject(new Error("OpenClaw gateway closed"));
        }
        this.pending.clear();
      });
    });
  }

  handleMessage(raw, connectResolve, connectReject, connectTimer) {
    let frame;
    try {
      frame = JSON.parse(raw);
    } catch {
      return;
    }

    if (frame.type === "event") {
      if (frame.event === "connect.challenge" && !this.connected) {
        const nonce = asRecord(frame.payload).nonce;
        if (typeof nonce !== "string" || !nonce) {
          clearTimeout(connectTimer);
          connectReject(new Error("OpenClaw gateway did not send a valid challenge"));
          return;
        }
        this.request("connect", {
          minProtocol: 4,
          maxProtocol: 4,
          client: {
            id: "gateway-client",
            displayName: "Tradesites AI Sales Trainer",
            version: "0.1.0",
            platform: process.platform,
            mode: "backend",
          },
          caps: [],
          commands: [],
          auth: { token: this.token },
          role: "operator",
          scopes: ["operator.admin"],
        })
          .then(() => {
            this.connected = true;
            clearTimeout(connectTimer);
            connectResolve();
          })
          .catch((error) => {
            clearTimeout(connectTimer);
            connectReject(error);
          });
        return;
      }

      this.captureRunEvent(frame);
      return;
    }

    if (frame.type === "res") {
      const pending = this.pending.get(frame.id);
      if (!pending) return;
      this.pending.delete(frame.id);
      clearTimeout(pending.timer);
      if (frame.ok) {
        pending.resolve(frame.payload);
      } else {
        pending.reject(new Error(formatGatewayError(frame.error)));
      }
    }
  }

  captureRunEvent(frame) {
    const payload = asRecord(frame.payload);
    if (!this.currentRun || payload.runId !== this.currentRun) return;

    const stream = payload.stream;
    const data = asRecord(payload.data);
    if (stream === "assistant") {
      this.assistantText += readText(data);
    }

    if (stream === "lifecycle" && TERMINAL_PHASES.has(data.phase)) {
      this.currentRun = null;
    }
  }

  request(method, params, timeoutMs = this.timeoutMs) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("OpenClaw gateway is not connected"));
    }

    const id = crypto.randomUUID();
    const frame = { type: "req", id, method, params };
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`OpenClaw gateway request timed out for ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
    });
    this.ws.send(JSON.stringify(frame));
    return promise;
  }

  async runCustomerPrompt(input, sessionKey) {
    const accepted = await this.request("agent", {
      message: input,
      agentId: this.agentId,
      sessionKey,
      deliver: false,
      timeout: Math.ceil(this.timeoutMs / 1000),
      label: "Tradesites AI Sales Trainer customer reply",
      idempotencyKey: crypto.randomUUID(),
    });

    const runId = asRecord(accepted).runId;
    if (typeof runId !== "string" || !runId) {
      throw new Error("OpenClaw gateway did not return a run id");
    }

    this.currentRun = runId;
    this.assistantText = "";
    const result = await this.request(
      "agent.wait",
      { runId, timeoutMs: this.timeoutMs },
      this.timeoutMs + 5000,
    );

    if (!this.assistantText.trim()) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    const text = this.assistantText.trim() || readText(result).trim();
    return {
      text,
      raw: result,
    };
  }

  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

function buildOpenClawPrompt(payload) {
  return [
    "You are the customer in a cold-call training simulator.",
    "Return only strict JSON with this shape:",
    '{"reply":"short spoken customer response","mood":"short mood label"}',
    "Do not include markdown. Do not explain the scoring. Do not break character.",
    "",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

function parseCustomerReply(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("OpenClaw returned an empty customer reply");
  }

  const candidates = [trimmed];
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) {
    candidates.push(trimmed.slice(start, end + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const reply = String(parsed.reply || parsed.text || "").trim();
      if (reply) {
        return {
          text: reply.slice(0, 1200),
          mood: parsed.mood || "unknown",
        };
      }
    } catch {
      // Try the next shape.
    }
  }

  return {
    text: trimmed.slice(0, 1200),
    mood: "unknown",
  };
}

async function runOpenClawBrain(payload) {
  const url = process.env.OPENCLAW_GATEWAY_URL;
  const token = process.env.OPENCLAW_GATEWAY_TOKEN;
  if (!url) throw new Error("OPENCLAW_GATEWAY_URL is not set");
  if (!token) throw new Error("OPENCLAW_GATEWAY_TOKEN is not set");
  validateGatewayUrl(url);

  const timeoutMs = Number(process.env.OPENCLAW_GATEWAY_TIMEOUT_MS || 45000);
  const agentId = process.env.OPENCLAW_AGENT_ID || "main";
  const sessionKey = `tradesites-ai-sales-trainer:${payload.scenario.id}:${payload.sessionId || "local"}`;
  const client = new OpenClawGatewayClient({ url, token, timeoutMs, agentId });

  try {
    await client.connect();
    const result = await client.runCustomerPrompt(buildOpenClawPrompt(payload), sessionKey);
    return {
      ...parseCustomerReply(result.text),
      provider: "openclaw",
    };
  } finally {
    client.close();
  }
}

function validateGatewayUrl(url) {
  const parsed = new URL(url);
  const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
  if (!loopbackHosts.has(parsed.hostname) && process.env.ALLOW_REMOTE_PROVIDER_UNSAFE !== "1") {
    throw new Error("Remote OpenClaw gateway requires ALLOW_REMOTE_PROVIDER_UNSAFE=1");
  }
}

module.exports = {
  OpenClawGatewayClient,
  buildOpenClawPrompt,
  parseCustomerReply,
  runOpenClawBrain,
  validateGatewayUrl,
};
