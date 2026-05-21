const express = require("express");
const path = require("node:path");
const crypto = require("node:crypto");
const { scenarios, getScenario } = require("./scenarios");
const { ensureStore, listSessions, loadSession, saveSession } = require("./store");
const { generateCustomerReply } = require("./brain");
const { scoreTranscript } = require("./scoring");
const { getDueDrills, updateSkillMemory } = require("./skillMemory");
const { generateGauntletPlan, scoreGauntletAnswer, scoreHardNoCleanExit, summarizeGauntlet } = require("./gauntlet");
const { buildReviewQueue, buildSkillTrends } = require("./reviewQueue");
const { findApprovedResponse, findApprovedResponseForDrill } = require("./approvedResponses");
const { buildCoachingSuggestion, HELP_MOVES, inferStage } = require("./objectionPlaybook");
const { loadProfile, saveProfile } = require("./profileStore");
const {
  approveAccessRequest,
  consumeApprovedAccess,
  createAccessRequest,
  isEmailApproved,
  notifyAccessRequest,
} = require("./accessRequests");
const {
  LOCAL_USER,
  loginWithPocketBase,
  resolveRequestUser,
  signupWithPocketBase,
  verifyPocketBaseToken,
} = require("./auth");

function getBrainProvider() {
  if (process.env.OPENCLAW_GATEWAY_URL) return "openclaw";
  if (process.env.CODEX_BRAIN_COMMAND) return "command";
  return "mock";
}

function isLoopbackHost(host) {
  return ["127.0.0.1", "localhost", "::1"].includes(host);
}

function validateServerConfig({ host = process.env.HOST || "127.0.0.1" } = {}) {
  const remoteUnsafeAllowed = process.env.ALLOW_REMOTE_UNSAFE === "1";
  if (!isLoopbackHost(host) && !remoteUnsafeAllowed) {
    throw new Error(
      `Refusing to bind to ${host}. Set ALLOW_REMOTE_UNSAFE=1 only for a trusted local demo.`,
    );
  }
}

function sendApiError(req, res, status, code, message) {
  res.status(status).json({
    error: message,
    code,
    requestId: req.requestId,
  });
}

function createApp(options = {}) {
  const authRequired = options.authRequired ?? process.env.AUTH_REQUIRED !== "0";
  const signupMode = options.signupMode || process.env.SIGNUP_MODE || (process.env.SIGNUP_ENABLED === "1" ? "open" : "disabled");
  const signupEnabled = options.signupEnabled ?? ["open", "approval"].includes(signupMode);
  const verifyToken = options.authVerifier || verifyPocketBaseToken;
  const authClient = options.authClient || {
    login: loginWithPocketBase,
    signup: signupWithPocketBase,
  };
  const accessRequestNotifier = options.accessRequestNotifier || notifyAccessRequest;
  const authAttempts = new Map();
  const app = express();
  const publicDir = path.join(__dirname, "..", "public");
  app.use(express.json({ limit: "1mb" }));
  app.use((req, res, next) => {
    req.requestId = crypto.randomUUID();
    res.setHeader("X-Request-Id", req.requestId);
    next();
  });
  app.get("/", (_req, res) => {
    res.sendFile(path.join(publicDir, "home.html"));
  });

  app.get("/home", (_req, res) => {
    res.sendFile(path.join(publicDir, "home.html"));
  });

  app.get(["/app", "/login", "/register"], (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });

  app.use(express.static(publicDir, { index: false }));

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      brain: getBrainProvider(),
      auth: {
        required: authRequired,
        signupEnabled,
        signupMode,
      },
    });
  });

  app.get("/api/scenarios", (_req, res) => {
    res.json({ scenarios });
  });

  function isAuthRateLimited(req, email) {
    const now = Date.now();
    const key = `${req.ip || "unknown"}:${email.toLowerCase()}`;
    const windowMs = 15 * 60 * 1000;
    const maxAttempts = 20;
    const entry = authAttempts.get(key) || { count: 0, resetAt: now + windowMs };
    if (entry.resetAt <= now) {
      entry.count = 0;
      entry.resetAt = now + windowMs;
    }
    entry.count += 1;
    authAttempts.set(key, entry);
    return entry.count > maxAttempts;
  }

  app.post("/api/auth/login", async (req, res, next) => {
    try {
      const email = String(req.body.email || "").trim();
      const password = String(req.body.password || "");
      if (!email || !password) {
        sendApiError(req, res, 400, "credentials_required", "Email and password are required");
        return;
      }
      if (isAuthRateLimited(req, email)) {
        sendApiError(req, res, 429, "auth_rate_limited", "Too many login attempts");
        return;
      }
      const auth = await authClient.login({ email, password });
      res.json(auth);
    } catch (error) {
      error.code = error.status && error.status < 500 ? "AUTH_INVALID" : "AUTH_UNAVAILABLE";
      next(error);
    }
  });

  app.post("/api/auth/signup", async (req, res, next) => {
    try {
      if (!signupEnabled) {
        sendApiError(req, res, 403, "signup_disabled", "Sign up is disabled");
        return;
      }
      const email = String(req.body.email || "").trim();
      const password = String(req.body.password || "");
      const name = String(req.body.name || "").trim();
      if (!email || !password) {
        sendApiError(req, res, 400, "credentials_required", "Email and password are required");
        return;
      }
      if (isAuthRateLimited(req, email)) {
        sendApiError(req, res, 429, "auth_rate_limited", "Too many signup attempts");
        return;
      }
      if (signupMode === "approval" && !(await isEmailApproved(email))) {
        sendApiError(req, res, 403, "access_not_approved", "Access request has not been approved yet");
        return;
      }
      const auth = await authClient.signup({ email, password, name });
      if (signupMode === "approval") await consumeApprovedAccess(email);
      res.status(201).json(auth);
    } catch (error) {
      error.code = error.status && error.status < 500 ? "AUTH_INVALID" : "AUTH_UNAVAILABLE";
      next(error);
    }
  });

  app.post("/api/access-requests", async (req, res, next) => {
    try {
      const { request, created } = await createAccessRequest(req.body || {});
      if (created) await accessRequestNotifier(request);
      res.status(202).json({
        id: request.id,
        status: request.status,
        created,
      });
    } catch (error) {
      if (error.code === "ACCESS_REQUEST_EMAIL_REQUIRED") {
        sendApiError(req, res, 400, "email_required", error.message);
        return;
      }
      next(error);
    }
  });

  app.get("/api/access-requests/:id/approve", async (req, res, next) => {
    try {
      const expectedToken = process.env.ACCESS_APPROVAL_TOKEN || "";
      if (!expectedToken || req.query.token !== expectedToken) {
        res.status(403).type("text/plain").send("Invalid approval token");
        return;
      }
      const request = await approveAccessRequest(req.params.id);
      res.type("text/plain").send(`${request.email} approved. They can now create an account.`);
    } catch (error) {
      if (error.code === "ACCESS_REQUEST_NOT_FOUND") {
        res.status(404).type("text/plain").send("Access request not found");
        return;
      }
      next(error);
    }
  });

  app.use("/api", async (req, res, next) => {
    try {
      req.user = await resolveRequestUser(req, { authRequired, verifyToken });
      next();
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/auth/me", (req, res) => {
    res.json({ user: req.user || LOCAL_USER, authRequired });
  });

  app.get("/api/profile", async (req, res, next) => {
    try {
      res.json({ profile: await loadProfile(req.user) });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/profile", async (req, res, next) => {
    try {
      const input = req.body.profile || req.body || {};
      res.json({ profile: await saveProfile(req.user, input) });
    } catch (error) {
      next(error);
    }
  });

  async function loadOwnedSession(req, sessionId) {
    const session = await loadSession(sessionId);
    if ((session.repId || "local") !== req.user.id) {
      const error = new Error("Session not found");
      error.code = "SESSION_FORBIDDEN";
      throw error;
    }
    return session;
  }

  app.get("/api/drills/due", async (req, res, next) => {
    try {
      const now = req.query.now ? new Date(String(req.query.now)) : new Date();
      if (Number.isNaN(now.getTime())) {
        sendApiError(req, res, 400, "invalid_now", "Bad request");
        return;
      }
      const drills = await getDueDrills(now, req.user.id);
      res.json({ drills });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/review-queue", async (_req, res, next) => {
    try {
      const sessions = await listSessions(_req.user.id);
      res.json({
        queue: buildReviewQueue(sessions),
        skillTrends: buildSkillTrends(sessions),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/sessions", async (req, res, next) => {
    try {
      const scenario = getScenario(req.body.scenarioId);
      const now = new Date().toISOString();
      const session = {
        id: crypto.randomUUID(),
        repId: req.user.id,
        scenarioId: scenario.id,
        status: "active",
        startedAt: now,
        endedAt: null,
        turns: [
          {
            id: crypto.randomUUID(),
            role: "persona",
            text: scenario.persona.openingLine,
            mood: scenario.persona.mood,
            provider: "scenario",
            at: now,
          },
        ],
        evaluation: null,
        state: {
          stage: "opener",
          currentObjectionId: null,
          objectionsUsed: [],
        },
      };
      await saveSession(session);
      res.status(201).json({ session, scenario });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/gauntlets", async (req, res, next) => {
    try {
      const scenario = getScenario("enterprise-commercial-solar");
      const plan = generateGauntletPlan({ rounds: Number(req.body.rounds || 5) });
      const now = new Date().toISOString();
      const firstRound = plan.rounds[0];
      const session = {
        id: crypto.randomUUID(),
        repId: req.user.id,
        scenarioId: scenario.id,
        status: "active",
        startedAt: now,
        endedAt: null,
        turns: [
          {
            id: crypto.randomUUID(),
            role: "persona",
            text: firstRound.text,
            mood: "skeptical",
            provider: "gauntlet",
            objectionId: firstRound.objectionId,
            objectionType: firstRound.type,
            at: now,
          },
        ],
        evaluation: null,
        assignedDrill: null,
        gauntlet: {
          schemaVersion: 1,
          plan,
          currentRound: 0,
          results: [],
          summary: null,
        },
      };
      await saveSession(session);
      res.status(201).json({ session, scenario });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/sessions/:id", async (req, res, next) => {
    try {
      const session = await loadOwnedSession(req, req.params.id);
      res.json({ session, scenario: getScenario(session.scenarioId) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/sessions/:id/message", async (req, res, next) => {
    try {
      const text = String(req.body.text || "").trim();
      if (!text) {
        sendApiError(req, res, 400, "message_required", "Message text is required");
        return;
      }

      const session = await loadOwnedSession(req, req.params.id);
      if (session.status !== "active") {
        sendApiError(req, res, 409, "session_not_active", "Session is not active");
        return;
      }

      const scenario = getScenario(session.scenarioId);
      const repTurn = {
        id: crypto.randomUUID(),
        role: "user",
        text,
        at: new Date().toISOString(),
      };
      session.turns.push(repTurn);

      const reply = await generateCustomerReply({
        scenario,
        session,
        repMessage: text,
      });
      const customerTurn = {
        id: crypto.randomUUID(),
        role: "persona",
        text: reply.text,
        mood: reply.mood,
        provider: reply.provider,
        objectionId: reply.objectionId,
        objectionType: reply.objectionType,
        flowGuard: reply.flowGuard,
        warning: reply.warning,
        warningCode: reply.warningCode,
        at: new Date().toISOString(),
      };
      session.turns.push(customerTurn);
      session.state = {
        ...(session.state || {}),
        stage: inferStage(session.turns),
        currentObjectionId: reply.objectionId || null,
        objectionsUsed: [
          ...new Set([
            ...((session.state && session.state.objectionsUsed) || []),
            ...(reply.objectionId ? [reply.objectionId] : []),
          ]),
        ],
      };

      await saveSession(session);
      res.json({ session, reply: customerTurn });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/gauntlets/:id/round", async (req, res, next) => {
    try {
      const text = String(req.body.text || "").trim();
      if (!text) {
        sendApiError(req, res, 400, "message_required", "Message text is required");
        return;
      }
      const session = await loadOwnedSession(req, req.params.id);
      if (!session.gauntlet || session.status !== "active") {
        sendApiError(req, res, 409, "session_not_active", "Session is not active");
        return;
      }

      const now = new Date().toISOString();
      const round = session.gauntlet.plan.rounds[session.gauntlet.currentRound];
      session.turns.push({ id: crypto.randomUUID(), role: "user", text, at: now });
      const result = {
        round: round.round,
        objectionId: round.objectionId,
        objectionType: round.type,
        nearMissFamily: round.nearMissFamily,
        score: scoreGauntletAnswer(text),
      };
      if (round.type === "hard_no") {
        result.hardNoCleanExit = scoreHardNoCleanExit(text);
      }
      session.gauntlet.results.push(result);
      session.gauntlet.currentRound += 1;

      const nextRound = session.gauntlet.plan.rounds[session.gauntlet.currentRound];
      if (nextRound) {
        session.turns.push({
          id: crypto.randomUUID(),
          role: "persona",
          text: nextRound.text,
          mood: "skeptical",
          provider: "gauntlet",
          objectionId: nextRound.objectionId,
          objectionType: nextRound.type,
          at: now,
        });
      } else {
        session.status = "ended";
        session.endedAt = now;
        session.gauntlet.summary = summarizeGauntlet(session.gauntlet.results);
      }

      await saveSession(session);
      res.json({ session, result });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/sessions/:id/end", async (req, res, next) => {
    try {
      const session = await loadOwnedSession(req, req.params.id);
      session.status = "ended";
      session.endedAt = new Date().toISOString();
      session.evaluation = scoreTranscript({
        scenario: getScenario(session.scenarioId),
        turns: session.turns,
        helpAttempts: session.helpAttempts || [],
      });
      session.assignedDrill = session.evaluation.assignedDrill;
      session.evaluation.approvedExample = findApprovedResponseForDrill(session.assignedDrill);
      await updateSkillMemory({ session, evaluation: session.evaluation });
      await saveSession(session);
      res.json({ session });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/sessions/:id/coach", async (req, res, next) => {
    try {
      const session = await loadOwnedSession(req, req.params.id);
      const scenario = getScenario(session.scenarioId);
      const suggestion = buildCoachingSuggestion({ scenario, session });
      const selectedMove = String(req.body.selectedMove || "").trim();
      if (!selectedMove) {
        res.json({
          suggestion: {
            stage: suggestion.stage,
            objectionId: suggestion.objectionId,
            objectionType: suggestion.objectionType,
            title: "What is your next move?",
            prompt: "Choose your move before seeing the coaching suggestion.",
            moves: HELP_MOVES,
            suggestionHidden: true,
          },
        });
        return;
      }

      const correct = selectedMove === suggestion.recommendedMove;
      const attempt = {
        id: crypto.randomUUID(),
        selectedMove,
        recommendedMove: suggestion.recommendedMove,
        correct,
        objectionId: suggestion.objectionId,
        at: new Date().toISOString(),
      };
      session.helpAttempts = [...(session.helpAttempts || []), attempt];
      await saveSession(session);
      res.json({
        session,
        suggestion: {
          ...suggestion,
          selectedMove,
          correct,
          approvedExample: findApprovedResponse({
            objectionId: suggestion.objectionId,
            recommendedMove: suggestion.recommendedMove,
          }),
          suggestionHidden: false,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/sessions/:id/coach-notes", async (req, res, next) => {
    try {
      const note = String(req.body.note || "").trim();
      if (!note) {
        sendApiError(req, res, 400, "note_required", "Note text is required");
        return;
      }
      const session = await loadOwnedSession(req, req.params.id);
      session.coachNotes = [
        ...(session.coachNotes || []),
        {
          id: crypto.randomUUID(),
          note,
          at: new Date().toISOString(),
        },
      ];
      await saveSession(session);
      res.json({ session });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/sessions/:id/review-request", async (req, res, next) => {
    try {
      const session = await loadOwnedSession(req, req.params.id);
      session.reviewRequested = true;
      session.reviewRequestedAt = new Date().toISOString();
      await saveSession(session);
      res.json({ session });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/reply", async (req, res, next) => {
    try {
      const scenario = getScenario(req.body.scenarioId);
      const text = String(req.body.text || "").trim();
      if (!text) {
        sendApiError(req, res, 400, "message_required", "Message text is required");
        return;
      }
      const session = {
        id: "stateless",
        repId: req.user.id,
        scenarioId: scenario.id,
        turns: Array.isArray(req.body.turns) ? req.body.turns : [],
      };
      const reply = await generateCustomerReply({ scenario, session, repMessage: text });
      res.json({ reply });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/score", (req, res, next) => {
    try {
      const scenario = getScenario(req.body.scenarioId);
      const turns = Array.isArray(req.body.turns) ? req.body.turns : [];
      res.json({ evaluation: scoreTranscript({ scenario, turns }) });
    } catch (error) {
      next(error);
    }
  });

  app.use((error, req, res, _next) => {
    if (error.code === "ENOENT") {
      sendApiError(req, res, 404, "not_found", "Not found");
      return;
    }
    if (error.code === "INVALID_SESSION_ID") {
      sendApiError(req, res, 400, "invalid_session_id", "Bad request");
      return;
    }
    if (error.code === "AUTH_REQUIRED" || error.code === "AUTH_INVALID") {
      sendApiError(req, res, 401, error.code.toLowerCase(), "Authentication required");
      return;
    }
    if (error.code === "AUTH_UNAVAILABLE") {
      sendApiError(
        req,
        res,
        503,
        "auth_unavailable",
        "Authentication service unavailable.",
      );
      return;
    }
    if (error.code === "SESSION_FORBIDDEN") {
      sendApiError(req, res, 404, "not_found", "Not found");
      return;
    }
    console.error(
      JSON.stringify({
        level: "error",
        requestId: req.requestId,
        route: req.originalUrl,
        code: error.code || "internal_error",
        errorType: error.name || "Error",
      }),
    );
    sendApiError(req, res, 500, "internal_error", "Internal server error");
  });

  return app;
}

async function start() {
  await ensureStore();
  const app = createApp();
  const port = Number(process.env.PORT || 3137);
  const host = process.env.HOST || "127.0.0.1";
  validateServerConfig({ host });
  const server = app.listen(port, host, (error) => {
    if (error) {
      console.error(`Failed to start server on ${host}:${port}: ${error.message}`);
      process.exit(1);
    }
    console.log(`Tradesites AI Sales Trainer running at http://${host}:${port}`);
    console.log(`Brain provider: ${getBrainProvider()}`);
  });
  server.on("error", (error) => {
    console.error(`Failed to start server on ${host}:${port}: ${error.message}`);
    process.exit(1);
  });
  return server;
}

let activeServer;

if (require.main === module) {
  start().then((server) => {
    activeServer = server;
  }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  createApp,
  getBrainProvider,
  start,
  validateServerConfig,
};
