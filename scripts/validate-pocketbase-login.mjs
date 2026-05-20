const trainerUrl = (process.env.TRAINER_URL || "http://127.0.0.1:3137").replace(/\/$/, "");
const pocketBaseUrl = (process.env.POCKETBASE_URL || "http://127.0.0.1:8090").replace(/\/$/, "");

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
  const pbHealth = await fetch(`${pocketBaseUrl}/api/health`).catch((error) => {
    throw new Error(`PocketBase is not reachable at ${pocketBaseUrl}: ${error.message}`);
  });
  await assertOk(pbHealth, "PocketBase health");

  const trainerHealth = await assertOk(await fetch(`${trainerUrl}/api/health`), "Trainer health");
  if (!trainerHealth.auth?.required) {
    throw new Error("Trainer auth is not required; start it without AUTH_REQUIRED=0 for this validation.");
  }

  const email = `validator-${Date.now()}@example.com`;
  const password = "Testpass12345";
  const auth = await assertOk(
    await fetch(`${trainerUrl}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: "Validator Rep" }),
    }),
    "Trainer signup",
  );
  if (!auth.token || !auth.user?.id) {
    throw new Error(`Signup returned an invalid auth payload: ${JSON.stringify(auth)}`);
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
      body: JSON.stringify({ text: "James from Solar Future Scotland. Can I take 20 seconds?" }),
    }),
    "Send message",
  );

  console.log(
    `PocketBase login validation passed for ${email}; user=${auth.user.id}; session=${created.session.id}`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
