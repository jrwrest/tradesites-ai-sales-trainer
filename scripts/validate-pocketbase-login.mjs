const trainerUrl = (process.env.TRAINER_URL || "http://127.0.0.1:3137").replace(/\/$/, "");
const pocketBaseUrl = process.env.POCKETBASE_URL?.replace(/\/$/, "");

async function readJson(response) {
  return response.json().catch(() => ({}));
}

async function assertOk(response, label) {
  const body = await readJson(response);
  if (!response.ok) {
    throw new Error(`${label} failed: ${response.status} ${JSON.stringify(body)}`);
  }
  return body;
}

async function main() {
  if (pocketBaseUrl) {
    const pbHealth = await fetch(`${pocketBaseUrl}/api/health`).catch((error) => {
      throw new Error(`PocketBase is not reachable at ${pocketBaseUrl}: ${error.message}`);
    });
    await assertOk(pbHealth, "PocketBase health");
  }

  const trainerHealth = await assertOk(await fetch(`${trainerUrl}/api/health`), "Trainer health");
  if (!trainerHealth.auth?.required) {
    throw new Error("Trainer auth is not required; start it without AUTH_REQUIRED=0 for this validation.");
  }

  const suppliedEmail = process.env.VALIDATE_EMAIL;
  const suppliedPassword = process.env.VALIDATE_PASSWORD;
  let auth;
  let email = suppliedEmail || `validator-${Date.now()}@example.com`;
  const password = suppliedPassword || "Testpass12345";

  if (suppliedEmail && suppliedPassword) {
    auth = await assertOk(
      await fetch(`${trainerUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      }),
      "Trainer login",
    );
  } else if (trainerHealth.auth.signupMode === "approval") {
    const deniedSignup = await fetch(`${trainerUrl}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const deniedBody = await readJson(deniedSignup);
    if (deniedSignup.status !== 403 || deniedBody.code !== "signup_approval_required") {
      throw new Error(
        `Expected unapproved signup to be blocked; got ${deniedSignup.status} ${JSON.stringify(deniedBody)}`,
      );
    }

    const requested = await assertOk(
      await fetch(`${trainerUrl}/api/signup-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name: "Validator Rep" }),
      }),
      "Trainer signup request",
    );
    if (!requested.id || requested.status !== "pending_email_verification") {
      throw new Error(`Signup request returned an invalid payload: ${JSON.stringify(requested)}`);
    }
    console.log(
      `Trainer auth validation passed: approval mode blocks direct signup and sends verification for ${requested.id}.`,
    );
    return;
  } else if (trainerHealth.auth.signupEnabled) {
    auth = await assertOk(
      await fetch(`${trainerUrl}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name: "Validator Rep" }),
      }),
      "Trainer signup",
    );
  } else {
    const blockedSignup = await fetch(`${trainerUrl}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: "Validator Rep" }),
    });
    const blockedBody = await readJson(blockedSignup);
    if (blockedSignup.status !== 403 || blockedBody.code !== "signup_disabled") {
      throw new Error(
        `Expected signup to be disabled; got ${blockedSignup.status} ${JSON.stringify(blockedBody)}`,
      );
    }

    const protectedRoute = await fetch(`${trainerUrl}/api/drills/due`);
    const protectedBody = await readJson(protectedRoute);
    if (protectedRoute.status !== 401 || protectedBody.code !== "auth_required") {
      throw new Error(
        `Expected protected route to require auth; got ${protectedRoute.status} ${JSON.stringify(protectedBody)}`,
      );
    }

    console.log("Trainer auth validation passed: auth required and public signup disabled.");
    return;
  }

  if (!auth.token || !auth.user?.id) {
    throw new Error(`Auth returned an invalid payload: ${JSON.stringify(auth)}`);
  }

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${auth.token}`,
  };
  const me = await assertOk(await fetch(`${trainerUrl}/api/auth/me`, { headers }), "Trainer auth me");
  if (me.user.id !== auth.user.id) {
    throw new Error(`Auth user mismatch: ${JSON.stringify({ signup: auth.user, me: me.user })}`);
  }

  const created = await assertOk(
    await fetch(`${trainerUrl}/api/sessions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ scenarioId: "enterprise-commercial-solar" }),
    }),
    "Create session",
  );
  if (created.session.repId !== auth.user.id) {
    throw new Error(`Session was not scoped to the signed-in rep: ${JSON.stringify(created.session)}`);
  }

  await assertOk(
    await fetch(`${trainerUrl}/api/sessions/${created.session.id}/message`, {
      method: "POST",
      headers,
      body: JSON.stringify({ text: "Alex from BrightTrade Solar. Can I take 20 seconds?" }),
    }),
    "Send message",
  );

  console.log(
    `Trainer auth validation passed for ${email}; user=${auth.user.id}; session=${created.session.id}`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
