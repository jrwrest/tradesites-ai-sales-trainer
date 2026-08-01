const { purgeExpiredSessions } = require("./store");
const { purgeExpiredSignupRequests } = require("./signupRequests");

function positiveDays(value, fallback) {
  const parsed = Number(value || fallback);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error("Retention days must be a positive integer");
  return parsed;
}

async function runRetention(options = {}) {
  const now = options.now || new Date();
  const sessionRetentionDays = positiveDays(
    options.sessionRetentionDays || process.env.SESSION_RETENTION_DAYS,
    90,
  );
  const signupRetentionDays = positiveDays(
    options.signupRetentionDays || process.env.SIGNUP_REQUEST_RETENTION_DAYS,
    30,
  );
  const [sessions, signupRequests] = await Promise.all([
    purgeExpiredSessions({ retentionDays: sessionRetentionDays, now }),
    purgeExpiredSignupRequests({ retentionDays: signupRetentionDays, now }),
  ]);
  return {
    ranAt: now.toISOString(),
    policy: { sessionRetentionDays, signupRetentionDays },
    deleted: { sessions: sessions.deleted, signupRequests: signupRequests.deleted },
  };
}

module.exports = { runRetention };
