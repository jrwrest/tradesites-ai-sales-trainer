const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { afterEach, beforeEach, test } = require("node:test");
const { createApp } = require("../src/server");
const { createFixedWindowRateLimiter } = require("../src/rateLimit");
const { loadSkillMemory, saveSkillMemory } = require("../src/skillMemory");
const { profilePath } = require("../src/profileStore");
const { loadSignupRequests } = require("../src/signupRequests");

let previousDataDir;
let tempDataDir;

beforeEach(async () => {
  previousDataDir = process.env.DATA_DIR;
  tempDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "tradesites-auth-test-"));
  process.env.DATA_DIR = tempDataDir;
});

afterEach(async () => {
  if (previousDataDir === undefined) {
    delete process.env.DATA_DIR;
  } else {
    process.env.DATA_DIR = previousDataDir;
  }
  await fs.rm(tempDataDir, { recursive: true, force: true });
});

async function withServer(app, run) {
  let server;
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  async function request(route, options = {}) {
    const response = await fetch(`${baseUrl}${route}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
    const body = await response.json().catch(() => null);
    return { response, body };
  }

  try {
    await run(request);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const usersByToken = {
  "token-a": { id: "rep-a", email: "a@example.com", name: "Rep A", source: "pocketbase" },
  "token-b": { id: "rep-b", email: "b@example.com", name: "Rep B", source: "pocketbase" },
};

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

test("auth endpoints use injected PocketBase client and return normalized auth shape", async () => {
  const app = createApp({
    authRequired: true,
    signupEnabled: true,
    authClient: {
      login: async ({ email, password }) => {
        assert.equal(email, "a@example.com");
        assert.equal(password, "secret");
        return { token: "token-a", user: usersByToken["token-a"] };
      },
      signup: async ({ email, password, name }) => {
        assert.equal(email, "new@example.com");
        assert.equal(password, "secret");
        assert.equal(name, "New Rep");
        return {
          token: "token-new",
          user: { id: "rep-new", email, name, source: "pocketbase" },
        };
      },
    },
    authVerifier: async (token) => usersByToken[token],
  });

  await withServer(app, async (request) => {
    const login = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "a@example.com", password: "secret" }),
    });
    assert.equal(login.response.status, 200);
    assert.deepEqual(login.body, { token: "token-a", user: usersByToken["token-a"] });

    const signup = await request("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email: "new@example.com", password: "secret", name: "New Rep" }),
    });
    assert.equal(signup.response.status, 201);
    assert.equal(signup.body.token, "token-new");
    assert.equal(signup.body.user.id, "rep-new");
  });
});

test("failed auth attempts return bounded Retry-After metadata", async () => {
  const app = createApp({
    authRequired: true,
    authRateLimiter: createFixedWindowRateLimiter({ maxAttempts: 1, windowMs: 30_000 }),
    authClient: {
      login: async () => {
        const error = new Error("bad credentials");
        error.status = 400;
        throw error;
      },
    },
  });

  await withServer(app, async (request) => {
    const body = JSON.stringify({ email: "limited@example.com", password: "wrong" });
    assert.equal((await request("/api/auth/login", { method: "POST", body })).response.status, 401);
    const limited = await request("/api/auth/login", { method: "POST", body });
    assert.equal(limited.response.status, 429);
    assert.match(limited.response.headers.get("retry-after"), /^\d+$/);
  });
});

test("auth-required mode rejects anonymous trainer routes", async () => {
  const app = createApp({
    authRequired: true,
    authVerifier: async (token) => usersByToken[token],
  });

  await withServer(app, async (request) => {
    const routes = [
      ["/api/drills/due", {}],
      ["/api/methods", {}],
      ["/api/review-queue", {}],
      ["/api/sessions", { method: "POST", body: JSON.stringify({ scenarioId: "enterprise-commercial-solar" }) }],
      ["/api/gauntlets", { method: "POST", body: JSON.stringify({ rounds: 3 }) }],
      ["/api/reply", { method: "POST", body: JSON.stringify({ scenarioId: "roofing-owner", text: "hello" }) }],
      ["/api/score", { method: "POST", body: JSON.stringify({ scenarioId: "roofing-owner", turns: [] }) }],
    ];

    for (const [route, options] of routes) {
      const result = await request(route, options);
      assert.equal(result.response.status, 401, route);
      assert.equal(result.body.code, "auth_required", route);
    }
  });
});

test("authenticated reps can list the closed coaching method registry", async () => {
  const app = createApp({
    authRequired: true,
    authVerifier: async (token) => usersByToken[token],
  });

  await withServer(app, async (request) => {
    const anonymous = await request("/api/methods");
    assert.equal(anonymous.response.status, 401);

    const result = await request("/api/methods", { headers: authHeader("token-a") });
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.body.methods, [
      {
        id: "hormozi-sales-2026",
        version: "1.0.0-beta.3",
        displayName: "Hormozi Sales Operating Method — 2026 Talk Adaptation",
        status: "source-grounded-beta",
      },
    ]);
  });
});

test("auth is required by default when AUTH_REQUIRED is unset", async () => {
  const previousAuthRequired = process.env.AUTH_REQUIRED;
  delete process.env.AUTH_REQUIRED;
  const app = createApp({
    authVerifier: async (token) => usersByToken[token],
  });

  try {
    await withServer(app, async (request) => {
      const response = await request("/api/drills/due");
      assert.equal(response.response.status, 401);
      assert.equal(response.body.code, "auth_required");
    });
  } finally {
    if (previousAuthRequired === undefined) {
      delete process.env.AUTH_REQUIRED;
    } else {
      process.env.AUTH_REQUIRED = previousAuthRequired;
    }
  }
});

test("signup can be disabled for shared deployments", async () => {
  const app = createApp({
    authRequired: true,
    signupEnabled: false,
    authVerifier: async (token) => usersByToken[token],
    authClient: {
      login: async () => ({ token: "token-a", user: usersByToken["token-a"] }),
      signup: async () => {
        throw new Error("signup should not be called");
      },
    },
  });

  await withServer(app, async (request) => {
    const response = await request("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email: "new@example.com", password: "secret", name: "New Rep" }),
    });
    assert.equal(response.response.status, 403);
    assert.equal(response.body.code, "signup_disabled");
  });
});

test("signup is disabled by default unless explicitly enabled", async () => {
  const previousSignupEnabled = process.env.SIGNUP_ENABLED;
  delete process.env.SIGNUP_ENABLED;
  const app = createApp({
    authRequired: true,
    authVerifier: async (token) => usersByToken[token],
    authClient: {
      login: async () => ({ token: "token-a", user: usersByToken["token-a"] }),
      signup: async () => {
        throw new Error("signup should not be called by default");
      },
    },
  });

  try {
    await withServer(app, async (request) => {
      const health = await request("/api/health");
      assert.equal(health.body.auth.signupEnabled, false);

      const response = await request("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email: "new@example.com", password: "secret" }),
      });
      assert.equal(response.response.status, 403);
      assert.equal(response.body.code, "signup_disabled");
    });
  } finally {
    if (previousSignupEnabled === undefined) {
      delete process.env.SIGNUP_ENABLED;
    } else {
      process.env.SIGNUP_ENABLED = previousSignupEnabled;
    }
  }
});

test("approval-mode signup verifies email before admin approval and password setup", async () => {
  const previousSignupMode = process.env.SIGNUP_MODE;
  const previousApprovalToken = process.env.ACCESS_APPROVAL_TOKEN;
  const previousPublicBaseUrl = process.env.PUBLIC_BASE_URL;
  process.env.SIGNUP_MODE = "approval";
  process.env.ACCESS_APPROVAL_TOKEN = "approval-secret";
  process.env.PUBLIC_BASE_URL = "https://trainer.example.test";

  const emails = [];
  const notifications = [];
  const createdUsers = [];
  const app = createApp({
    authRequired: true,
    authVerifier: async (token) => usersByToken[token],
    signupRequestMailer: async (message) => {
      emails.push(message);
      return { sent: true, channel: "test" };
    },
    verifiedSignupNotifier: async (request) => {
      notifications.push(request);
      return { sent: true, channel: "test" };
    },
    authClient: {
      login: async ({ email }) => ({
        token: `token-${email}`,
        user: { id: `user-${email}`, email, name: email, source: "pocketbase" },
      }),
      signup: async ({ email, password }) => {
        assert.equal(email, "approved@example.com");
        assert.equal(password, "secret123");
        createdUsers.push(email);
        return {
          token: "token-approved",
          user: { id: "approved-user", email, name: email, source: "pocketbase" },
        };
      },
    },
  });

  try {
    await withServer(app, async (request) => {
      const health = await request("/api/health");
      assert.equal(health.body.auth.signupMode, "approval");
      assert.equal(health.body.auth.signupEnabled, true);

      const blockedDirectSignup = await request("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email: "approved@example.com", password: "secret" }),
      });
      assert.equal(blockedDirectSignup.response.status, 403);
      assert.equal(blockedDirectSignup.body.code, "signup_approval_required");

      const requested = await request("/api/signup-requests", {
        method: "POST",
        body: JSON.stringify({
          email: "approved@example.com",
          name: "Approved Rep",
          company: "BrightTrade Solar",
        }),
      });
      assert.equal(requested.response.status, 202);
      assert.equal(requested.body.status, "pending_email_verification");
      assert.equal(emails.length, 1);
      assert.equal(emails[0].to, "approved@example.com");
      assert.match(emails[0].text, /verify your email/i);
      assert.equal(notifications.length, 0);

      const verificationUrl = emails[0].text.match(/https:\/\/trainer\.example\.test\/\S+/)[0];
      const verified = await request(`${new URL(verificationUrl).pathname}${new URL(verificationUrl).search}`);
      assert.equal(verified.response.status, 200);
      assert.equal(notifications.length, 1);
      assert.equal(notifications[0].email, "approved@example.com");
      assert.equal(notifications[0].status, "verified_pending_approval");
      assert.ok(notifications[0].adminApprovalToken);

      const blockedApproval = await request(`/api/signup-requests/${requested.body.id}/approve?token=bad`);
      assert.equal(blockedApproval.response.status, 403);

      const confirmation = await request(
        `/api/signup-requests/${requested.body.id}/approve?token=${notifications[0].adminApprovalToken}`,
      );
      assert.equal(confirmation.response.status, 200);
      assert.match(confirmation.response.headers.get("content-type"), /text\/html/);
      assert.equal(emails.length, 1, "GET confirmation must not approve or send email");

      const approved = await request(`/api/signup-requests/${requested.body.id}/approve`, {
        method: "POST",
        body: JSON.stringify({ token: notifications[0].adminApprovalToken }),
      });
      assert.equal(approved.response.status, 200);
      assert.equal(emails.length, 2);
      assert.equal(emails[1].to, "approved@example.com");
      assert.match(emails[1].text, /set your password/i);

      const setupUrl = emails[1].text.match(/https:\/\/trainer\.example\.test\/\S+/)[0];
      const setPassword = await request(`/api/signup-requests/${requested.body.id}/set-password`, {
        method: "POST",
        body: JSON.stringify({ token: new URL(setupUrl).searchParams.get("token"), password: "secret123" }),
      });
      assert.equal(setPassword.response.status, 201);
      assert.equal(setPassword.body.user.id, "approved-user");
      assert.deepEqual(createdUsers, ["approved@example.com"]);

      const secondSetPassword = await request(`/api/signup-requests/${requested.body.id}/set-password`, {
        method: "POST",
        body: JSON.stringify({ token: new URL(setupUrl).searchParams.get("token"), password: "secret123" }),
      });
      assert.equal(secondSetPassword.response.status, 403);
      assert.equal(secondSetPassword.body.code, "signup_request_not_approved");
    });
  } finally {
    if (previousSignupMode === undefined) {
      delete process.env.SIGNUP_MODE;
    } else {
      process.env.SIGNUP_MODE = previousSignupMode;
    }
    if (previousApprovalToken === undefined) {
      delete process.env.ACCESS_APPROVAL_TOKEN;
    } else {
      process.env.ACCESS_APPROVAL_TOKEN = previousApprovalToken;
    }
    if (previousPublicBaseUrl === undefined) {
      delete process.env.PUBLIC_BASE_URL;
    } else {
      process.env.PUBLIC_BASE_URL = previousPublicBaseUrl;
    }
  }
});

test("verified signup stays verified and emits a safe recovery signal when admin notification fails", async () => {
  const previousSignupMode = process.env.SIGNUP_MODE;
  const previousApprovalToken = process.env.ACCESS_APPROVAL_TOKEN;
  const previousPublicBaseUrl = process.env.PUBLIC_BASE_URL;
  process.env.SIGNUP_MODE = "approval";
  process.env.ACCESS_APPROVAL_TOKEN = "approval-secret";
  process.env.PUBLIC_BASE_URL = "https://trainer.example.test";
  const emails = [];
  const errors = [];
  const app = createApp({
    authRequired: true,
    signupRequestMailer: async (message) => {
      emails.push(message);
      return { sent: true, channel: "test" };
    },
    verifiedSignupNotifier: async () => {
      const error = new Error("provider included a sensitive detail");
      error.code = "EMAIL_DELIVERY_FAILED";
      throw error;
    },
    logger: { info() {}, error: (entry) => errors.push(entry) },
  });

  try {
    await withServer(app, async (request) => {
      const created = await request("/api/signup-requests", {
        method: "POST",
        body: JSON.stringify({ email: "delayed@example.com" }),
      });
      const verifyUrl = new URL(emails[0].text.match(/https:\/\/\S+/)[0]);
      const verified = await request(`${verifyUrl.pathname}${verifyUrl.search}`);

      assert.equal(created.response.status, 202);
      assert.equal(verified.response.status, 200);
      assert.equal((await loadSignupRequests())[0].status, "verified_pending_approval");
      assert.deepEqual(errors, [{
        event: "signup_approval_notification_failed",
        requestId: created.body.id,
        code: "EMAIL_DELIVERY_FAILED",
        recoveryCommand: "npm run signup:resend-approval -- --email <applicant-email>",
      }]);
      assert.doesNotMatch(JSON.stringify(errors), /sensitive detail/);
      assert.doesNotMatch(JSON.stringify(errors), /token=/);
    });
  } finally {
    if (previousSignupMode === undefined) delete process.env.SIGNUP_MODE;
    else process.env.SIGNUP_MODE = previousSignupMode;
    if (previousApprovalToken === undefined) delete process.env.ACCESS_APPROVAL_TOKEN;
    else process.env.ACCESS_APPROVAL_TOKEN = previousApprovalToken;
    if (previousPublicBaseUrl === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = previousPublicBaseUrl;
  }
});

test("default admin notifier uses the injected mailer and password-email failure stays recoverable", async () => {
  const previousSignupMode = process.env.SIGNUP_MODE;
  const previousApprovalToken = process.env.ACCESS_APPROVAL_TOKEN;
  const previousPublicBaseUrl = process.env.PUBLIC_BASE_URL;
  const previousApprovalEmail = process.env.SIGNUP_APPROVAL_EMAIL;
  process.env.SIGNUP_MODE = "approval";
  process.env.ACCESS_APPROVAL_TOKEN = "approval-secret";
  process.env.PUBLIC_BASE_URL = "https://trainer.example.test";
  process.env.SIGNUP_APPROVAL_EMAIL = "owner@example.com";
  const emails = [];
  const errors = [];
  const app = createApp({
    authRequired: true,
    signupRequestMailer: async (message) => {
      emails.push(message);
      if (/Set your .* password/.test(message.subject)) {
        const error = new Error("private provider failure");
        error.code = "EMAIL_DELIVERY_FAILED";
        throw error;
      }
      return { sent: true, channel: "test" };
    },
    logger: { info() {}, error: (entry) => errors.push(entry) },
  });

  try {
    await withServer(app, async (request) => {
      const created = await request("/api/signup-requests", {
        method: "POST",
        body: JSON.stringify({ email: "recoverable@example.com", name: "Recoverable Rep" }),
      });
      const verifyUrl = new URL(emails[0].text.match(/https:\/\/\S+/)[0]);
      const verifyResponse = await request(`${verifyUrl.pathname}${verifyUrl.search}`);
      assert.equal(verifyResponse.response.status, 200);
      assert.equal(emails[1].to, "owner@example.com");
      assert.match(emails[1].text, /recoverable@example\.com/);

      const approvalUrl = new URL(emails[1].text.match(/https:\/\/\S+/)[0]);
      const confirmation = await request(`${approvalUrl.pathname}${approvalUrl.search}`);
      assert.equal(confirmation.response.status, 200);
      assert.equal(confirmation.response.headers.get("cache-control"), "no-store");
      assert.equal(confirmation.response.headers.get("referrer-policy"), "no-referrer");
      assert.equal((await loadSignupRequests())[0].status, "verified_pending_approval");

      const approved = await request(approvalUrl.pathname, {
        method: "POST",
        body: JSON.stringify({ token: approvalUrl.searchParams.get("token") }),
      });
      assert.equal(approved.response.status, 503);
      assert.equal((await loadSignupRequests())[0].status, "approved_pending_password");
      assert.equal(errors[0].event, "signup_password_email_failed");
      assert.equal(errors[0].requestId, created.body.id);
      assert.doesNotMatch(JSON.stringify(errors), /private provider failure/);
      assert.doesNotMatch(JSON.stringify(errors), /token=/);
    });
  } finally {
    for (const [name, value] of [
      ["SIGNUP_MODE", previousSignupMode],
      ["ACCESS_APPROVAL_TOKEN", previousApprovalToken],
      ["PUBLIC_BASE_URL", previousPublicBaseUrl],
      ["SIGNUP_APPROVAL_EMAIL", previousApprovalEmail],
    ]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("unexpected approval failures never log query-string tokens", async () => {
  const previousSignupMode = process.env.SIGNUP_MODE;
  const previousApprovalToken = process.env.ACCESS_APPROVAL_TOKEN;
  const previousPublicBaseUrl = process.env.PUBLIC_BASE_URL;
  process.env.SIGNUP_MODE = "approval";
  process.env.ACCESS_APPROVAL_TOKEN = "approval-secret";
  process.env.PUBLIC_BASE_URL = "https://trainer.example.test";
  const logs = [];
  const brokenStore = path.join(tempDataDir, "signup-requests.json");
  await fs.mkdir(brokenStore);
  const app = createApp({
    authRequired: true,
    signupRequestMailer: async () => ({ sent: true, channel: "test" }),
    verifiedSignupNotifier: async () => ({ sent: true, channel: "test" }),
    logger: { info() {}, error: (entry) => logs.push(entry) },
  });

  try {
    await withServer(app, async (request) => {
      const response = await request(
        "/api/signup-requests/request-id/approve?token=approval-token-must-not-log",
      );
      assert.equal(response.response.status, 500);
      assert.equal(logs[0].route, "/api/signup-requests/request-id/approve");
      assert.doesNotMatch(JSON.stringify(logs), /approval-token-must-not-log/);
      assert.doesNotMatch(JSON.stringify(logs), /token=/);
    });
  } finally {
    if (previousSignupMode === undefined) delete process.env.SIGNUP_MODE;
    else process.env.SIGNUP_MODE = previousSignupMode;
    if (previousApprovalToken === undefined) delete process.env.ACCESS_APPROVAL_TOKEN;
    else process.env.ACCESS_APPROVAL_TOKEN = previousApprovalToken;
    if (previousPublicBaseUrl === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = previousPublicBaseUrl;
  }
});

test("auth me returns the current normalized user", async () => {
  const app = createApp({
    authRequired: true,
    authVerifier: async (token) => usersByToken[token],
  });

  await withServer(app, async (request) => {
    const me = await request("/api/auth/me", { headers: authHeader("token-a") });
    assert.equal(me.response.status, 200);
    assert.deepEqual(me.body, {
      user: usersByToken["token-a"],
      authRequired: true,
    });
  });
});

test("profile endpoints return and save the current rep profile", async () => {
  const app = createApp({
    authRequired: true,
    authVerifier: async (token) => usersByToken[token],
  });

  await withServer(app, async (request) => {
    const loaded = await request("/api/profile", { headers: authHeader("token-a") });
    assert.equal(loaded.response.status, 200);
    assert.equal(loaded.body.profile.repId, "rep-a");
    assert.equal(loaded.body.profile.companyName, "BrightTrade Solar");
    assert.equal(loaded.body.profile.coachingMethodId, "hormozi-sales-2026");

    const saved = await request("/api/profile", {
      method: "PUT",
      headers: authHeader("token-a"),
      body: JSON.stringify({
        profile: {
          repName: "Alex Morgan",
          companyName: "BrightTrade Solar",
          callGoal: "Book useful commercial solar follow-ups.",
          coachingMethodId: "hormozi-sales-2026",
        },
      }),
    });
    assert.equal(saved.response.status, 200);
    assert.equal(saved.body.profile.repId, "rep-a");
    assert.equal(saved.body.profile.repName, "Alex Morgan");
    assert.equal(saved.body.profile.callGoal, "Book useful commercial solar follow-ups.");
    assert.equal(saved.body.profile.coachingMethodId, "hormozi-sales-2026");

    for (const coachingMethodId of ["missing-pack", "../data"]) {
      const rejected = await request("/api/profile", {
        method: "PUT",
        headers: authHeader("token-a"),
        body: JSON.stringify({ profile: { coachingMethodId } }),
      });
      assert.equal(rejected.response.status, 400);
      assert.equal(rejected.body.code, "invalid_coaching_method");
    }
  });
});

test("sessions and gauntlets pin the profile-selected method id and registry version", async () => {
  const app = createApp({
    authRequired: true,
    authVerifier: async (token) => usersByToken[token],
  });

  await withServer(app, async (request) => {
    const saved = await request("/api/profile", {
      method: "PUT",
      headers: authHeader("token-a"),
      body: JSON.stringify({ profile: { coachingMethodId: "hormozi-sales-2026" } }),
    });
    assert.equal(saved.response.status, 200);

    const call = await request("/api/sessions", {
      method: "POST",
      headers: authHeader("token-a"),
      body: JSON.stringify({ scenarioId: "manufacturer-power-payback-report" }),
    });
    const gauntlet = await request("/api/gauntlets", {
      method: "POST",
      headers: authHeader("token-a"),
      body: JSON.stringify({ scenarioId: "manufacturer-power-payback-report", rounds: 3 }),
    });

    assert.equal(call.response.status, 201);
    assert.equal(gauntlet.response.status, 201);
    assert.deepEqual(call.body.session.methodPack, {
      id: "hormozi-sales-2026",
      version: "1.0.0-beta.3",
    });
    assert.deepEqual(gauntlet.body.session.methodPack, call.body.session.methodPack);
  });
});

test("active session coaching and scoring use the session pin after profile changes", async () => {
  const app = createApp({
    authRequired: true,
    authVerifier: async (token) => usersByToken[token],
  });

  await withServer(app, async (request) => {
    const created = await request("/api/sessions", {
      method: "POST",
      headers: authHeader("token-a"),
      body: JSON.stringify({ scenarioId: "manufacturer-power-payback-report" }),
    });
    assert.equal(created.response.status, 201);

    await fs.mkdir(path.dirname(profilePath("rep-a")), { recursive: true });
    await fs.writeFile(profilePath("rep-a"), JSON.stringify({
      schemaVersion: 2,
      repId: "rep-a",
      repName: "Changed Rep",
      companyName: "Changed Company",
      coachingMethodId: "missing-after-session-start",
    }));

    const coached = await request(`/api/sessions/${created.body.session.id}/coach`, {
      method: "POST",
      headers: authHeader("token-a"),
      body: JSON.stringify({ selectedMove: "ask_permission" }),
    });
    assert.equal(coached.response.status, 200);
    assert.deepEqual(
      {
        id: coached.body.suggestion.methodMetadata.id,
        version: coached.body.suggestion.methodMetadata.version,
      },
      created.body.session.methodPack,
    );

    const ended = await request(`/api/sessions/${created.body.session.id}/end`, {
      method: "POST",
      headers: authHeader("token-a"),
    });
    assert.equal(ended.response.status, 200);
    assert.deepEqual(ended.body.session.evaluation.methodPack, created.body.session.methodPack);
  });
});

test("beta.2 sessions retain legacy coaching while new sessions use beta.3 method coaching", async () => {
  const app = createApp({
    authRequired: true,
    authVerifier: async (token) => usersByToken[token],
  });

  await withServer(app, async (request) => {
    const legacy = await request("/api/sessions", {
      method: "POST",
      headers: authHeader("token-a"),
      body: JSON.stringify({ scenarioId: "manufacturer-power-payback-report" }),
    });
    const current = await request("/api/sessions", {
      method: "POST",
      headers: authHeader("token-a"),
      body: JSON.stringify({ scenarioId: "manufacturer-power-payback-report" }),
    });
    const legacyPath = path.join(tempDataDir, "sessions", `${legacy.body.session.id}.json`);
    const persisted = JSON.parse(await fs.readFile(legacyPath, "utf8"));
    persisted.methodPack.version = "1.0.0-beta.2";
    await fs.writeFile(legacyPath, `${JSON.stringify(persisted, null, 2)}\n`);

    await request("/api/profile", {
      method: "PUT",
      headers: authHeader("token-a"),
      body: JSON.stringify({
        profile: {
          repName: "Changed Rep",
          companyName: "Changed Company",
          coachingMethodId: "hormozi-sales-2026",
        },
      }),
    });

    const legacyCoach = await request(`/api/sessions/${legacy.body.session.id}/coach`, {
      method: "POST",
      headers: authHeader("token-a"),
      body: JSON.stringify({ selectedMove: "ask_permission" }),
    });
    const currentCoach = await request(`/api/sessions/${current.body.session.id}/coach`, {
      method: "POST",
      headers: authHeader("token-a"),
      body: JSON.stringify({ selectedMove: "ask_permission" }),
    });

    assert.equal(legacyCoach.response.status, 200);
    assert.equal(legacyCoach.body.suggestion.methodMetadata, undefined);
    assert.equal(legacyCoach.body.suggestion.methodPrompt, undefined);
    assert.equal(currentCoach.response.status, 200);
    assert.equal(currentCoach.body.suggestion.methodMetadata.version, "1.0.0-beta.3");
    assert.equal(typeof currentCoach.body.suggestion.methodPrompt, "string");

    const legacyEnd = await request(`/api/sessions/${legacy.body.session.id}/end`, {
      method: "POST",
      headers: authHeader("token-a"),
    });
    const currentEnd = await request(`/api/sessions/${current.body.session.id}/end`, {
      method: "POST",
      headers: authHeader("token-a"),
    });
    assert.equal(legacyEnd.body.session.evaluation.methodPack.version, "1.0.0-beta.2");
    assert.equal(currentEnd.body.session.evaluation.methodPack.version, "1.0.0-beta.3");
  });
});

test("missing or mismatched active session method pins fail with stable method_unavailable", async () => {
  const app = createApp({
    authRequired: true,
    authVerifier: async (token) => usersByToken[token],
  });

  await withServer(app, async (request) => {
    for (const [pin, route] of [
      [{ id: "missing-pack", version: "1.0.0" }, "coach"],
      [{ id: "hormozi-sales-2026", version: "0.0.0" }, "end"],
    ]) {
      const created = await request("/api/sessions", {
        method: "POST",
        headers: authHeader("token-a"),
        body: JSON.stringify({ scenarioId: "manufacturer-power-payback-report" }),
      });
      const target = path.join(tempDataDir, "sessions", `${created.body.session.id}.json`);
      const persisted = JSON.parse(await fs.readFile(target, "utf8"));
      persisted.methodPack = pin;
      await fs.writeFile(target, `${JSON.stringify(persisted, null, 2)}\n`);

      const result = await request(`/api/sessions/${created.body.session.id}/${route}`, {
        method: "POST",
        headers: authHeader("token-a"),
        body: route === "coach" ? JSON.stringify({ selectedMove: "ask_permission" }) : undefined,
      });
      assert.equal(result.response.status, 409, JSON.stringify(pin));
      assert.equal(result.body.code, "method_unavailable", JSON.stringify(pin));
      assert.equal(result.body.error, "The coaching method for this session is unavailable.");
    }
  });
});

test("legacy sessions without a method pin continue on the default method", async () => {
  const app = createApp({
    authRequired: true,
    authVerifier: async (token) => usersByToken[token],
  });

  await withServer(app, async (request) => {
    const created = await request("/api/sessions", {
      method: "POST",
      headers: authHeader("token-a"),
      body: JSON.stringify({ scenarioId: "manufacturer-power-payback-report" }),
    });
    const target = path.join(tempDataDir, "sessions", `${created.body.session.id}.json`);
    const persisted = JSON.parse(await fs.readFile(target, "utf8"));
    delete persisted.methodPack;
    await fs.writeFile(target, `${JSON.stringify(persisted, null, 2)}\n`);

    const coached = await request(`/api/sessions/${created.body.session.id}/coach`, {
      method: "POST",
      headers: authHeader("token-a"),
      body: JSON.stringify({ selectedMove: "ask_permission" }),
    });
    assert.equal(coached.response.status, 200);
    assert.deepEqual(coached.body.session.methodPack, {
      id: "hormozi-sales-2026",
      version: "1.0.0-beta.3",
    });

    const ended = await request(`/api/sessions/${created.body.session.id}/end`, {
      method: "POST",
      headers: authHeader("token-a"),
    });
    assert.equal(ended.response.status, 200);
    assert.deepEqual(ended.body.session.evaluation.methodPack, coached.body.session.methodPack);
  });
});

test("coaching identifies the method/framework and personalizes only allowlisted identity fields", async () => {
  const app = createApp({
    authRequired: true,
    authVerifier: async (token) => usersByToken[token],
  });

  await withServer(app, async (request) => {
    await request("/api/profile", {
      method: "PUT",
      headers: authHeader("token-a"),
      body: JSON.stringify({
        profile: {
          repName: "Ava Chen",
          companyName: "Northstar Energy",
          coachingMethodId: "hormozi-sales-2026",
          notes: "UNTRUSTED-NOTES-MARKER",
          offer: "UNTRUSTED-OFFER-MARKER",
        },
      }),
    });
    const created = await request("/api/sessions", {
      method: "POST",
      headers: authHeader("token-a"),
      body: JSON.stringify({ scenarioId: "manufacturer-power-payback-report" }),
    });
    const coached = await request(`/api/sessions/${created.body.session.id}/coach`, {
      method: "POST",
      headers: authHeader("token-a"),
      body: JSON.stringify({ selectedMove: "ask_permission" }),
    });

    assert.equal(coached.response.status, 200);
    assert.deepEqual(coached.body.suggestion.methodMetadata, {
      id: "hormozi-sales-2026",
      version: "1.0.0-beta.3",
      displayName: "Hormozi Sales Operating Method — 2026 Talk Adaptation",
      frameworkLabel: "Proof, Promise, Plan",
    });
    assert.match(coached.body.suggestion.tryThis, /Ava Chen/);
    assert.match(coached.body.suggestion.tryThis, /Northstar Energy/);
    assert.doesNotMatch(JSON.stringify(coached.body.suggestion), /James|Solar Future Scotland/);
    assert.doesNotMatch(JSON.stringify(coached.body.suggestion), /UNTRUSTED-(?:NOTES|OFFER)-MARKER/);
  });
});

test("authenticated sessions are saved under the current rep and denied to other reps", async () => {
  const app = createApp({
    authRequired: true,
    authVerifier: async (token) => usersByToken[token],
  });

  await withServer(app, async (request) => {
    const created = await request("/api/sessions", {
      method: "POST",
      headers: authHeader("token-a"),
      body: JSON.stringify({ scenarioId: "enterprise-commercial-solar" }),
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.body.session.repId, "rep-a");

    const sessionId = created.body.session.id;
    const loadedByOwner = await request(`/api/sessions/${sessionId}`, {
      headers: authHeader("token-a"),
    });
    assert.equal(loadedByOwner.response.status, 200);

    const loadedByOther = await request(`/api/sessions/${sessionId}`, {
      headers: authHeader("token-b"),
    });
    assert.equal(loadedByOther.response.status, 404);
    assert.equal(loadedByOther.body.code, "not_found");

    const mutatedByOther = await request(`/api/sessions/${sessionId}/coach-notes`, {
      method: "POST",
      headers: authHeader("token-b"),
      body: JSON.stringify({ note: "Should not save." }),
    });
    assert.equal(mutatedByOther.response.status, 404);
  });
});

test("rep can delete their training data without deleting another rep's data", async () => {
  const app = createApp({
    authRequired: true,
    authVerifier: async (token) => usersByToken[token],
  });

  await withServer(app, async (request) => {
    const repA = await request("/api/sessions", {
      method: "POST",
      headers: authHeader("token-a"),
      body: JSON.stringify({ scenarioId: "roofing-owner" }),
    });
    const repB = await request("/api/sessions", {
      method: "POST",
      headers: authHeader("token-b"),
      body: JSON.stringify({ scenarioId: "roofing-owner" }),
    });
    await request("/api/profile", {
      method: "PUT",
      headers: authHeader("token-a"),
      body: JSON.stringify({ profile: { companyName: "Private Rep A Company" } }),
    });
    await saveSkillMemory({
      schemaVersion: 1,
      repId: usersByToken["token-a"].id,
      skills: { permission_opener: { score: 4, attempts: 1 } },
    });

    const unconfirmed = await request("/api/account-data", {
      method: "DELETE",
      headers: authHeader("token-a"),
      body: JSON.stringify({ confirmation: "delete" }),
    });
    assert.equal(unconfirmed.response.status, 400);

    const deleted = await request("/api/account-data", {
      method: "DELETE",
      headers: authHeader("token-a"),
      body: JSON.stringify({ confirmation: "DELETE MY TRAINING DATA" }),
    });
    assert.equal(deleted.response.status, 200);
    assert.equal(deleted.body.deleted.sessions, 1);
    assert.equal(deleted.body.deleted.profile, 1);
    assert.equal(deleted.body.deleted.skillMemory, 1);

    const missingA = await request(`/api/sessions/${repA.body.session.id}`, {
      headers: authHeader("token-a"),
    });
    assert.equal(missingA.response.status, 404);
    const retainedB = await request(`/api/sessions/${repB.body.session.id}`, {
      headers: authHeader("token-b"),
    });
    assert.equal(retainedB.response.status, 200);
    const resetProfile = await request("/api/profile", { headers: authHeader("token-a") });
    assert.notEqual(resetProfile.body.profile.companyName, "Private Rep A Company");
    assert.deepEqual((await loadSkillMemory(usersByToken["token-a"].id)).skills, {});
  });
});

test("review queue and due drills are scoped to the authenticated rep", async () => {
  const app = createApp({
    authRequired: true,
    authVerifier: async (token) => usersByToken[token],
  });

  await withServer(app, async (request) => {
    const repA = await request("/api/sessions", {
      method: "POST",
      headers: authHeader("token-a"),
      body: JSON.stringify({ scenarioId: "enterprise-commercial-solar" }),
    });
    const repB = await request("/api/sessions", {
      method: "POST",
      headers: authHeader("token-b"),
      body: JSON.stringify({ scenarioId: "enterprise-commercial-solar" }),
    });
    await request(`/api/sessions/${repA.body.session.id}/message`, {
      method: "POST",
      headers: authHeader("token-a"),
      body: JSON.stringify({ text: "James from SFS. Can I take 20 seconds?" }),
    });
    await request(`/api/sessions/${repB.body.session.id}/message`, {
      method: "POST",
      headers: authHeader("token-b"),
      body: JSON.stringify({ text: "Just calling about solar." }),
    });
    await request(`/api/sessions/${repA.body.session.id}/end`, {
      method: "POST",
      headers: authHeader("token-a"),
    });
    await request(`/api/sessions/${repB.body.session.id}/end`, {
      method: "POST",
      headers: authHeader("token-b"),
    });

    const queueA = await request("/api/review-queue", { headers: authHeader("token-a") });
    const queueB = await request("/api/review-queue", { headers: authHeader("token-b") });
    const sessionIdsA = queueA.body.queue.map((item) => item.sessionId);
    const sessionIdsB = queueB.body.queue.map((item) => item.sessionId);
    assert.ok(sessionIdsA.includes(repA.body.session.id));
    assert.equal(sessionIdsA.includes(repB.body.session.id), false);
    assert.ok(sessionIdsB.includes(repB.body.session.id));
    assert.equal(sessionIdsB.includes(repA.body.session.id), false);

    const dueA = await request("/api/drills/due?now=2030-01-01T00:00:00.000Z", {
      headers: authHeader("token-a"),
    });
    const dueB = await request("/api/drills/due?now=2030-01-01T00:00:00.000Z", {
      headers: authHeader("token-b"),
    });
    assert.equal(dueA.response.status, 200);
    assert.equal(dueB.response.status, 200);
    assert.ok(Array.isArray(dueA.body.drills));
    assert.ok(Array.isArray(dueB.body.drills));
  });
});

test("bad bearer tokens fail closed when auth is optional", async () => {
  const app = createApp({
    authRequired: false,
    authVerifier: async () => {
      const error = new Error("PocketBase down");
      error.status = 503;
      throw error;
    },
  });

  await withServer(app, async (request) => {
    const response = await request("/api/auth/me", { headers: authHeader("bad") });
    assert.equal(response.response.status, 503);
    assert.equal(response.body.code, "auth_unavailable");
    assert.equal(response.body.error, "Authentication service unavailable.");
  });
});
