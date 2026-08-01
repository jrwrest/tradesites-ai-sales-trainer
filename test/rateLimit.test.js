const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createFixedWindowRateLimiter } = require("../src/rateLimit");

test("fixed-window limiter returns retry metadata and resets after the window", () => {
  let currentTime = 1_000;
  const limiter = createFixedWindowRateLimiter({
    maxAttempts: 2,
    windowMs: 10_000,
    now: () => currentTime,
  });

  assert.deepEqual(limiter.consume("ip:email"), { limited: false, remaining: 1, retryAfterSeconds: 10 });
  assert.deepEqual(limiter.consume("ip:email"), { limited: false, remaining: 0, retryAfterSeconds: 10 });
  assert.equal(limiter.consume("ip:email").limited, true);
  currentTime += 10_001;
  assert.equal(limiter.consume("ip:email").limited, false);
});

test("limiter bounds key cardinality and supports successful-login reset", () => {
  const limiter = createFixedWindowRateLimiter({ maxAttempts: 2, windowMs: 10_000, maxKeys: 2 });
  limiter.consume("one");
  limiter.consume("two");
  limiter.consume("three");
  assert.equal(limiter.size(), 2);

  limiter.consume("three");
  assert.equal(limiter.consume("three").limited, true);
  limiter.reset("three");
  assert.equal(limiter.consume("three").limited, false);
});

test("limiter rejects unsafe numeric configuration", () => {
  assert.throws(() => createFixedWindowRateLimiter({ maxAttempts: 0 }), /positive integer/);
  assert.throws(() => createFixedWindowRateLimiter({ windowMs: Number.NaN }), /positive integer/);
  assert.throws(() => createFixedWindowRateLimiter({ maxKeys: -1 }), /positive integer/);
});
