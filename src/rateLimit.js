function createFixedWindowRateLimiter(options = {}) {
  const maxAttempts = Number(options.maxAttempts ?? 20);
  const windowMs = Number(options.windowMs ?? 15 * 60 * 1000);
  const maxKeys = Number(options.maxKeys ?? 10000);
  if (![maxAttempts, windowMs, maxKeys].every((value) => Number.isInteger(value) && value > 0)) {
    throw new Error("Rate-limit settings must be positive integers");
  }
  const now = options.now || Date.now;
  const entries = new Map();

  function cleanup(currentTime) {
    for (const [key, entry] of entries) {
      if (entry.resetAt <= currentTime) entries.delete(key);
    }
  }

  function ensureCapacity(currentTime) {
    cleanup(currentTime);
    while (entries.size >= maxKeys) {
      let oldestKey;
      let oldestSeen = Infinity;
      for (const [key, entry] of entries) {
        if (entry.lastSeenAt < oldestSeen) {
          oldestSeen = entry.lastSeenAt;
          oldestKey = key;
        }
      }
      if (oldestKey === undefined) break;
      entries.delete(oldestKey);
    }
  }

  function consume(key) {
    const currentTime = now();
    let entry = entries.get(key);
    if (!entry || entry.resetAt <= currentTime) {
      if (!entry) ensureCapacity(currentTime);
      entry = { count: 0, resetAt: currentTime + windowMs, lastSeenAt: currentTime };
    }
    entry.count += 1;
    entry.lastSeenAt = currentTime;
    entries.set(key, entry);
    return {
      limited: entry.count > maxAttempts,
      remaining: Math.max(0, maxAttempts - entry.count),
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - currentTime) / 1000)),
    };
  }

  return {
    consume,
    reset(key) {
      entries.delete(key);
    },
    size() {
      cleanup(now());
      return entries.size;
    },
  };
}

module.exports = { createFixedWindowRateLimiter };
