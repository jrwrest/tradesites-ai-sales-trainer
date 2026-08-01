const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { test } = require("node:test");
const { installGracefulShutdown } = require("../src/shutdown");

test("graceful shutdown stops accepting traffic and records the signal", async () => {
  const processTarget = new EventEmitter();
  const entries = [];
  let closed = 0;
  let idleClosed = 0;
  const server = {
    close(callback) {
      closed += 1;
      callback();
    },
    closeIdleConnections() {
      idleClosed += 1;
    },
  };
  const uninstall = installGracefulShutdown(server, {
    processTarget,
    logger: { info: (entry) => entries.push(entry), error: (entry) => entries.push(entry) },
    forceAfterMs: 100,
  });

  processTarget.emit("SIGTERM");
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(closed, 1);
  assert.equal(idleClosed, 1);
  assert.equal(processTarget.exitCode, 0);
  assert.deepEqual(entries.map((entry) => entry.event), ["shutdown_started", "shutdown_complete"]);
  uninstall();
});

test("graceful shutdown is idempotent across repeated signals", () => {
  const processTarget = new EventEmitter();
  let closed = 0;
  const server = { close: () => { closed += 1; } };
  const uninstall = installGracefulShutdown(server, {
    processTarget,
    logger: { info: () => {}, error: () => {} },
    forceAfterMs: 100,
  });

  processTarget.emit("SIGINT");
  processTarget.emit("SIGTERM");

  assert.equal(closed, 1);
  uninstall();
});
