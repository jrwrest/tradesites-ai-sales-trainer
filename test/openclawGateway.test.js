const assert = require("node:assert/strict");
const { test } = require("node:test");
const { WebSocketServer } = require("ws");
const { runOpenClawBrain, validateGatewayUrl } = require("../src/openclawGateway");
const { getScenario } = require("../src/scenarios");

function send(socket, payload) {
  socket.send(JSON.stringify(payload));
}

async function startFakeGateway() {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise((resolve) => server.once("listening", resolve));
  const requests = [];

  server.on("connection", (socket) => {
    send(socket, {
      type: "event",
      event: "connect.challenge",
      seq: 1,
      payload: { nonce: "test-nonce" },
    });

    socket.on("message", (raw) => {
      const frame = JSON.parse(String(raw));
      requests.push(frame);
      const reply = (payload) => send(socket, { type: "res", id: frame.id, ok: true, payload });

      if (frame.method === "connect") {
        reply({ protocol: 4, server: { version: "test" } });
        return;
      }

      if (frame.method === "agent") {
        reply({ status: "accepted", runId: "run-1", sessionKey: frame.params.sessionKey });
        setTimeout(() => {
          send(socket, {
            type: "event",
            event: "agent",
            seq: 2,
            payload: {
              runId: "run-1",
              sessionKey: frame.params.sessionKey,
              stream: "assistant",
              data: {
                delta:
                  '{"reply":"I do not have a requirement for solar. Why are you calling?","mood":"impatient"}',
              },
            },
          });
        }, 5);
        return;
      }

      if (frame.method === "agent.wait") {
        reply({ status: "ok", runId: "run-1" });
      }
    });
  });

  const address = server.address();
  return {
    url: `ws://127.0.0.1:${address.port}`,
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test("OpenClaw gateway brain runs through websocket RPC", async () => {
  const gateway = await startFakeGateway();
  process.env.OPENCLAW_GATEWAY_URL = gateway.url;
  process.env.OPENCLAW_GATEWAY_TOKEN = "test-token";
  process.env.OPENCLAW_GATEWAY_TIMEOUT_MS = "2000";

  try {
    const reply = await runOpenClawBrain({
      instruction: "reply as customer",
      scenario: getScenario("commercial-solar-rejection"),
      sessionId: "test-session",
      transcript: [],
      latestRepMessage: "Have you heard of solar PPA?",
    });

    assert.equal(reply.provider, "openclaw");
    assert.equal(reply.mood, "impatient");
    assert.match(reply.text, /requirement for solar/);
  assert.equal(gateway.requests[0].method, "connect");
  assert.equal(gateway.requests[0].params.auth.token, "test-token");
  assert.equal(gateway.requests[1].method, "agent");
  assert.equal(gateway.requests[1].params.timeout, 2);
  } finally {
    delete process.env.OPENCLAW_GATEWAY_URL;
    delete process.env.OPENCLAW_GATEWAY_TOKEN;
    delete process.env.OPENCLAW_GATEWAY_TIMEOUT_MS;
    await gateway.close();
  }
});

test("OpenClaw gateway brain accepts a per-call timeout override", async () => {
  const gateway = await startFakeGateway();
  process.env.OPENCLAW_GATEWAY_URL = gateway.url;
  process.env.OPENCLAW_GATEWAY_TOKEN = "test-token";
  process.env.OPENCLAW_GATEWAY_TIMEOUT_MS = "45000";

  try {
    await runOpenClawBrain(
      {
        instruction: "reply as customer",
        scenario: getScenario("commercial-solar-rejection"),
        sessionId: "test-session",
        transcript: [],
        latestRepMessage: "Have you heard of solar PPA?",
      },
      { timeoutMs: 7000 },
    );

    assert.equal(gateway.requests[1].method, "agent");
    assert.equal(gateway.requests[1].params.timeout, 7);
    assert.equal(gateway.requests[2].method, "agent.wait");
    assert.equal(gateway.requests[2].params.timeoutMs, 7000);
  } finally {
    delete process.env.OPENCLAW_GATEWAY_URL;
    delete process.env.OPENCLAW_GATEWAY_TOKEN;
    delete process.env.OPENCLAW_GATEWAY_TIMEOUT_MS;
    await gateway.close();
  }
});

test("OpenClaw gateway requires explicit opt-in for non-loopback URLs", () => {
  delete process.env.ALLOW_REMOTE_PROVIDER_UNSAFE;
  assert.doesNotThrow(() => validateGatewayUrl("ws://127.0.0.1:18789"));
  assert.throws(
    () => validateGatewayUrl("ws://example.com:18789"),
    /ALLOW_REMOTE_PROVIDER_UNSAFE=1/,
  );
  process.env.ALLOW_REMOTE_PROVIDER_UNSAFE = "1";
  assert.doesNotThrow(() => validateGatewayUrl("ws://example.com:18789"));
  delete process.env.ALLOW_REMOTE_PROVIDER_UNSAFE;
});
