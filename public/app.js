const state = {
  scenarios: [],
  scenario: null,
  session: null,
  recognition: null,
  listening: false,
  waiting: false,
  startedAt: null,
  timerId: null,
  authToken: sessionStorage.getItem("tradesitesAiSalesTrainerToken") || "",
  user: null,
  authRequired: false,
  signupEnabled: false,
  signupMode: "disabled",
};

const elements = {
  authGate: document.querySelector("#authGate"),
  appShell: document.querySelector("#appShell"),
  authForm: document.querySelector("#authForm"),
  authStatus: document.querySelector("#authStatus"),
  authUser: document.querySelector("#authUser"),
  authEmail: document.querySelector("#authEmail"),
  authPassword: document.querySelector("#authPassword"),
  loginBtn: document.querySelector("#loginBtn"),
  requestAccessBtn: document.querySelector("#requestAccessBtn"),
  signupBtn: document.querySelector("#signupBtn"),
  logoutBtn: document.querySelector("#logoutBtn"),
  accountUser: document.querySelector("#accountUser"),
  scenarioSelect: document.querySelector("#scenarioSelect"),
  startBtn: document.querySelector("#startBtn"),
  gauntletBtn: document.querySelector("#gauntletBtn"),
  micBtn: document.querySelector("#micBtn"),
  endBtn: document.querySelector("#endBtn"),
  coachBtn: document.querySelector("#coachBtn"),
  profileBtn: document.querySelector("#profileBtn"),
  reviewBtn: document.querySelector("#reviewBtn"),
  sendBtn: document.querySelector("#sendBtn"),
  messageForm: document.querySelector("#messageForm"),
  messageInput: document.querySelector("#messageInput"),
  transcript: document.querySelector("#transcript"),
  statusText: document.querySelector("#statusText"),
  supportText: document.querySelector("#supportText"),
  dueDrill: document.querySelector("#dueDrill"),
  scenarioCard: document.querySelector("#scenarioCard"),
  timer: document.querySelector("#timer"),
  asideTitle: document.querySelector("#asideTitle"),
  coachEmpty: document.querySelector("#coachEmpty"),
  coachCard: document.querySelector("#coachCard"),
  scoreEmpty: document.querySelector("#scoreEmpty"),
  scoreCard: document.querySelector("#scoreCard"),
};

function getSpeechRecognition() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function setStatus(message, isError = false) {
  elements.statusText.textContent = message;
  elements.statusText.className = isError ? "error" : "";
  if (!state.user) {
    elements.authStatus.textContent = message;
    elements.authStatus.className = isError ? "error" : "";
  }
}

function setButtons() {
  const active = Boolean(state.session && state.session.status === "active");
  const hasUser = Boolean(state.user);
  elements.startBtn.disabled = !hasUser || active || state.waiting;
  elements.gauntletBtn.disabled = !hasUser || active || state.waiting;
  elements.endBtn.disabled = !hasUser || !active || state.waiting;
  elements.coachBtn.disabled = !hasUser || !active || state.waiting;
  elements.profileBtn.disabled = !hasUser || state.waiting;
  elements.reviewBtn.disabled = !hasUser || state.waiting;
  elements.messageInput.disabled = !hasUser || !active || state.waiting;
  elements.sendBtn.disabled = !hasUser || !active || state.waiting;
  elements.scenarioSelect.disabled = !hasUser || active;
  elements.micBtn.disabled = !hasUser || !active || !state.recognition || state.waiting;
  elements.micBtn.textContent = state.listening ? "Stop Mic" : "Mic";
  elements.loginBtn.disabled = state.waiting;
  elements.requestAccessBtn.disabled = state.waiting;
  elements.signupBtn.disabled = state.waiting || !state.signupEnabled;
  elements.logoutBtn.disabled = state.waiting || (!state.authToken && state.user?.id === "local");
}

function clearActiveSession() {
  if (state.recognition && state.listening) state.recognition.stop();
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  state.session = null;
  state.startedAt = null;
  clearInterval(state.timerId);
  updateTimer();
  renderTranscript();
  renderScoreEmpty();
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.authToken) headers.Authorization = `Bearer ${state.authToken}`;
  const response = await fetch(path, {
    ...options,
    headers,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `Request failed: ${response.status}`);
    error.code = payload.code;
    error.status = response.status;
    if (["auth_required", "auth_invalid"].includes(error.code) && state.authToken) {
      clearActiveSession();
      storeAuth("", null);
    }
    throw error;
  }
  return payload;
}

function storeAuth(token, user) {
  state.authToken = token || "";
  state.user = user || null;
  if (state.authToken) {
    sessionStorage.setItem("tradesitesAiSalesTrainerToken", state.authToken);
  } else {
    sessionStorage.removeItem("tradesitesAiSalesTrainerToken");
  }
  renderAuth();
  setButtons();
}

function renderAuth() {
  if (!state.user) {
    elements.authGate.classList.remove("hidden");
    elements.appShell.classList.add("hidden");
    elements.authUser.textContent = "Log in to use the trainer.";
    elements.loginBtn.classList.remove("hidden");
    elements.requestAccessBtn.classList.toggle("hidden", state.signupMode !== "approval");
    elements.signupBtn.classList.toggle("hidden", !state.signupEnabled);
    elements.authEmail.classList.remove("hidden");
    elements.authPassword.classList.remove("hidden");
    return;
  }

  elements.authGate.classList.add("hidden");
  elements.appShell.classList.remove("hidden");
  elements.authUser.textContent =
    state.user.id === "local"
      ? "Local Rep: progress saves only on this computer."
      : `Signed in: ${state.user.name || state.user.email}`;
  elements.accountUser.textContent =
    state.user.id === "local"
      ? "Local Rep"
      : state.user.name || state.user.email;
  elements.logoutBtn.classList.toggle("hidden", state.user.id === "local" && !state.authToken);
  elements.loginBtn.classList.toggle("hidden", state.user.id !== "local" || Boolean(state.authToken));
  elements.requestAccessBtn.classList.toggle(
    "hidden",
    state.signupMode !== "approval" || state.user.id !== "local" || Boolean(state.authToken),
  );
  elements.signupBtn.classList.toggle(
    "hidden",
    !state.signupEnabled || state.user.id !== "local" || Boolean(state.authToken),
  );
  elements.authEmail.classList.toggle("hidden", state.user.id !== "local" || Boolean(state.authToken));
  elements.authPassword.classList.toggle("hidden", state.user.id !== "local" || Boolean(state.authToken));
}

function renderScenario() {
  if (!state.scenario) {
    elements.scenarioCard.textContent = "";
    return;
  }
  const persona = state.scenario.persona;
  elements.scenarioCard.innerHTML = "";

  const title = document.createElement("h3");
  title.textContent = state.scenario.name;
  const meta = document.createElement("p");
  meta.className = "muted";
  meta.textContent = `${persona.name}, ${persona.role}. Goal: ${state.scenario.goal}`;
  const list = document.createElement("ul");
  persona.objections.slice(0, 3).forEach((objection) => {
    const item = document.createElement("li");
    item.textContent = objection;
    list.append(item);
  });

  elements.scenarioCard.append(title, meta, list);
}

function renderDueDrill(drill) {
  elements.dueDrill.innerHTML = "";
  if (!drill) {
    elements.dueDrill.classList.add("hidden");
    return;
  }
  elements.dueDrill.classList.remove("hidden");
  const label = document.createElement("strong");
  label.textContent = "Due Drill";
  const text = document.createElement("span");
  text.textContent = `${drill.skill.replaceAll("_", " ")}: ${drill.reason}`;
  elements.dueDrill.append(label, text);
}

function renderTranscript() {
  elements.transcript.innerHTML = "";
  const turns = state.session?.turns || [];
  turns.forEach((turn) => {
    const item = document.createElement("div");
    item.className = `turn ${turn.role || "user"}${turn.warning ? " warning" : ""}`;

    const label = document.createElement("strong");
    label.textContent = turn.role === "persona" ? "Customer" : "You";
    const body = document.createElement("span");
    body.textContent = turn.text;

    item.append(label, body);
    if (turn.objectionType) {
      const tag = document.createElement("em");
      tag.textContent = turn.objectionType.replaceAll("_", " ");
      item.append(tag);
    }
    elements.transcript.append(item);
  });
  elements.transcript.scrollTop = elements.transcript.scrollHeight;
}

function renderScore(evaluation) {
  elements.asideTitle.textContent = "Score";
  elements.coachEmpty.classList.add("hidden");
  elements.coachCard.classList.add("hidden");
  elements.scoreEmpty.classList.add("hidden");
  elements.scoreCard.classList.remove("hidden");
  elements.scoreCard.innerHTML = "";

  const wrapper = document.createElement("div");
  wrapper.className = "score-grid";

  const main = document.createElement("div");
  main.className = "score-main";
  main.textContent = `${evaluation.overallScore}/10`;
  wrapper.append(main);

  Object.entries(evaluation.categories).forEach(([name, value]) => {
    const row = document.createElement("div");
    row.className = "score-row";
    const label = document.createElement("span");
    label.textContent = name.replace(/([A-Z])/g, " $1");
    const score = document.createElement("strong");
    score.textContent = `${value}/10`;
    row.append(label, score);
    wrapper.append(row);
  });

  const feedback = document.createElement("p");
  feedback.className = "muted";
  feedback.textContent = evaluation.recommendedDrill;
  wrapper.append(feedback);

  const drill = state.session?.assignedDrill || evaluation.assignedDrill;
  const drillBox = document.createElement("section");
  drillBox.className = "next-drill";
  const drillTitle = document.createElement("h3");
  drillTitle.textContent = drill?.skill ? "Next Drill" : "No Drill Assigned";
  const drillSkill = document.createElement("strong");
  drillSkill.textContent = drill?.skill ? drill.skill.replaceAll("_", " ") : "Keep practising";
  const drillReason = document.createElement("p");
  drillReason.textContent = drill?.reason || "This call did not produce a specific weak-skill drill.";
  drillBox.append(drillTitle, drillSkill, drillReason);
  wrapper.append(drillBox);

  if (evaluation.missedOpportunities.length) {
    const list = document.createElement("ul");
    evaluation.missedOpportunities.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      list.append(li);
    });
    wrapper.append(list);
  }

  if (evaluation.approvedExample) {
    const approved = document.createElement("div");
    approved.className = "approved-example";
    const label = document.createElement("strong");
    label.textContent = "Approved example:";
    const text = document.createElement("p");
    text.textContent = evaluation.approvedExample.text;
    approved.append(label, text);
    wrapper.append(approved);
  }

  elements.scoreCard.append(wrapper);
}

function renderCoaching(suggestion) {
  elements.asideTitle.textContent = "Coach";
  elements.scoreEmpty.classList.add("hidden");
  elements.scoreCard.classList.add("hidden");
  elements.coachEmpty.classList.add("hidden");
  elements.coachCard.classList.remove("hidden");
  elements.coachCard.innerHTML = "";

  const wrapper = document.createElement("div");
  wrapper.className = "coach-grid";
  const title = document.createElement("h3");
  title.textContent = suggestion.title;
  const stage = document.createElement("p");
  stage.className = "muted";
  stage.textContent = `Stage: ${suggestion.stage}`;
  wrapper.append(title, stage);

  if (suggestion.suggestionHidden) {
    const moves = document.createElement("div");
    moves.className = "move-grid";
    suggestion.moves.forEach((move) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = move.label;
      button.addEventListener("click", () => requestCoaching(move.id));
      moves.append(button);
    });
    const prompt = document.createElement("p");
    prompt.className = "muted";
    prompt.textContent = suggestion.prompt;
    wrapper.append(prompt, moves);
    elements.coachCard.append(wrapper);
    return;
  }

  if (suggestion.selectedMove) {
    const result = document.createElement("p");
    result.className = suggestion.correct ? "move-result correct" : "move-result";
    result.textContent = suggestion.correct ? "Good move." : `Better move: ${suggestion.recommendedMove.replaceAll("_", " ")}.`;
    wrapper.append(result);
  }

  const list = document.createElement("ul");
  suggestion.suggestions.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    list.append(li);
  });
  const tryThis = document.createElement("div");
  tryThis.className = "try-this";
  const tryLabel = document.createElement("strong");
  tryLabel.textContent = "Try:";
  const tryText = document.createElement("p");
  tryText.textContent = suggestion.tryThis;
  tryThis.append(tryLabel, tryText);
  wrapper.append(list, tryThis);
  if (suggestion.approvedExample) {
    const approved = document.createElement("div");
    approved.className = "approved-example";
    const approvedLabel = document.createElement("strong");
    approvedLabel.textContent = "Approved example:";
    const approvedText = document.createElement("p");
    approvedText.textContent = suggestion.approvedExample.text;
    approved.append(approvedLabel, approvedText);
    wrapper.append(approved);
  }
  elements.coachCard.append(wrapper);
}

function renderReviewQueue(payload) {
  elements.asideTitle.textContent = "Review";
  elements.scoreEmpty.classList.add("hidden");
  elements.scoreCard.classList.add("hidden");
  elements.coachEmpty.classList.add("hidden");
  elements.coachCard.classList.remove("hidden");
  elements.coachCard.innerHTML = "";

  const wrapper = document.createElement("div");
  wrapper.className = "coach-grid";
  const title = document.createElement("h3");
  title.textContent = "Coach Review Queue";
  wrapper.append(title);

  const queue = document.createElement("ul");
  (payload.queue || []).slice(0, 6).forEach((item) => {
    const li = document.createElement("li");
    li.textContent = `${item.sessionId.slice(0, 8)}: ${item.reasons.join(", ")}`;
    const noteForm = document.createElement("form");
    noteForm.className = "note-form";
    const input = document.createElement("input");
    input.placeholder = "Coach note...";
    const button = document.createElement("button");
    button.type = "submit";
    button.textContent = "Add";
    noteForm.append(input, button);
    noteForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!input.value.trim()) return;
      await api(`/api/sessions/${item.sessionId}/coach-notes`, {
        method: "POST",
        body: JSON.stringify({ note: input.value.trim() }),
      });
      input.value = "";
      setStatus("Coach note saved.");
    });
    li.append(noteForm);
    queue.append(li);
  });
  if (!queue.children.length) {
    const li = document.createElement("li");
    li.textContent = "No calls need review.";
    queue.append(li);
  }
  wrapper.append(queue);

  const trendTitle = document.createElement("h3");
  trendTitle.textContent = "Skill Trends";
  wrapper.append(trendTitle);
  const trends = document.createElement("ul");
  (payload.skillTrends || []).slice(0, 5).forEach((item) => {
    const li = document.createElement("li");
    li.textContent = `${item.skill.replaceAll("_", " ")}: ${item.latest}/10 latest`;
    trends.append(li);
  });
  wrapper.append(trends);
  elements.coachCard.append(wrapper);
}

function profileField(form, profile, key, label, multiline = false) {
  const field = document.createElement("label");
  field.className = "profile-field";
  const text = document.createElement("span");
  text.textContent = label;
  const input = multiline ? document.createElement("textarea") : document.createElement("input");
  input.name = key;
  input.value = profile[key] || "";
  if (multiline) input.rows = 3;
  field.append(text, input);
  form.append(field);
}

function renderProfile(profile) {
  elements.asideTitle.textContent = "Profile";
  elements.scoreEmpty.classList.add("hidden");
  elements.scoreCard.classList.add("hidden");
  elements.coachEmpty.classList.add("hidden");
  elements.coachCard.classList.remove("hidden");
  elements.coachCard.innerHTML = "";

  const form = document.createElement("form");
  form.className = "profile-form";
  const title = document.createElement("h3");
  title.textContent = "Rep Profile";
  form.append(title);

  profileField(form, profile, "repName", "Name");
  profileField(form, profile, "companyName", "Company");
  profileField(form, profile, "role", "Role");
  profileField(form, profile, "offer", "Offer", true);
  profileField(form, profile, "targetCustomers", "Target customers", true);
  profileField(form, profile, "callGoal", "Call goal", true);
  profileField(form, profile, "opener", "Default opener", true);
  profileField(form, profile, "notes", "Notes", true);

  const button = document.createElement("button");
  button.type = "submit";
  button.textContent = "Save Profile";
  form.append(button);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      const payload = await api("/api/profile", {
        method: "PUT",
        body: JSON.stringify({ profile: data }),
      });
      renderProfile(payload.profile);
      setStatus("Profile saved.");
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  elements.coachCard.append(form);
}

function updateTimer() {
  if (!state.startedAt) {
    elements.timer.textContent = "00:00";
    return;
  }
  const elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
  const minutes = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const seconds = String(elapsed % 60).padStart(2, "0");
  elements.timer.textContent = `${minutes}:${seconds}`;
}

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1;
  utterance.pitch = 0.95;
  window.speechSynthesis.speak(utterance);
}

async function loadScenarios() {
  const payload = await api("/api/scenarios");
  state.scenarios = payload.scenarios;
  elements.scenarioSelect.innerHTML = "";
  state.scenarios.forEach((scenario) => {
    const option = document.createElement("option");
    option.value = scenario.id;
    option.textContent = scenario.name;
    elements.scenarioSelect.append(option);
  });
  state.scenario = state.scenarios[0];
  renderScenario();
}

async function loadHealth() {
  const payload = await api("/api/health");
  state.authRequired = Boolean(payload.auth?.required);
  state.signupEnabled = Boolean(payload.auth?.signupEnabled);
  state.signupMode = payload.auth?.signupMode || "disabled";
  renderAuth();
}

async function loadAuth() {
  try {
    const payload = await api("/api/auth/me");
    state.authRequired = payload.authRequired;
    storeAuth(state.authToken, payload.user);
    if (payload.user?.id === "local") {
      setStatus("Choose a scenario and start a local training call.");
    } else {
      setStatus("Choose a scenario and start a rep-tracked training call.");
    }
  } catch (error) {
    state.user = null;
    renderAuth();
    setButtons();
    if (error.code === "auth_required") {
      setStatus("Log in to start rep-tracked training.", true);
      return;
    }
    setStatus(error.message, true);
  }
}

async function authenticate() {
  const email = elements.authEmail.value.trim();
  const password = elements.authPassword.value;
  if (!email || !password) {
    setStatus("Email and password are required.", true);
    return;
  }

  state.waiting = true;
  setButtons();
  try {
    const payload = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    storeAuth(payload.token, payload.user);
    elements.authPassword.value = "";
    setStatus(`Signed in as ${payload.user.name || payload.user.email}.`);
    await loadDueDrill();
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    state.waiting = false;
    setButtons();
  }
}

async function signup() {
  if (!state.signupEnabled) {
    setStatus("Account creation is disabled on this deployment.", true);
    return;
  }
  const email = elements.authEmail.value.trim();
  const password = elements.authPassword.value;
  if (!email || !password) {
    setStatus("Email and password are required.", true);
    return;
  }

  state.waiting = true;
  setButtons();
  try {
    const payload = await api("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    storeAuth(payload.token, payload.user);
    elements.authPassword.value = "";
    setStatus(`Account created for ${payload.user.name || payload.user.email}.`);
    await loadDueDrill();
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    state.waiting = false;
    setButtons();
  }
}

async function requestAccess() {
  const email = elements.authEmail.value.trim();
  if (!email) {
    setStatus("Enter your email to request access.", true);
    return;
  }

  state.waiting = true;
  setButtons();
  try {
    const payload = await api("/api/access-requests", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    setStatus(
      payload.created
        ? "Access request sent. We will approve it before you can create an account."
        : "Access request already exists. If approved, create your account with this email.",
    );
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    state.waiting = false;
    setButtons();
  }
}

async function logout() {
  clearActiveSession();
  storeAuth("", null);
  await loadAuth();
}

function renderScoreEmpty() {
  elements.asideTitle.textContent = "Coach";
  elements.coachEmpty.classList.remove("hidden");
  elements.coachCard.classList.add("hidden");
  elements.scoreEmpty.classList.remove("hidden");
  elements.scoreCard.classList.add("hidden");
}

async function loadDueDrill() {
  if (!state.user) {
    renderDueDrill(null);
    return;
  }
  const payload = await api("/api/drills/due");
  renderDueDrill(payload.drills[0]);
}

function setupSpeech() {
  const Recognition = getSpeechRecognition();
  const tts = "speechSynthesis" in window;
  const notes = [];
  if (!Recognition) notes.push("Mic speech-to-text is unavailable in this browser; typed calls still work.");
  if (!tts) notes.push("Text-to-speech is unavailable; customer replies will display as text.");
  elements.supportText.textContent = notes.join(" ");

  if (!Recognition) return;
  const recognition = new Recognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  recognition.onresult = (event) => {
    let text = "";
    for (const result of event.results) {
      text += result[0]?.transcript || "";
    }
    text = text.trim();
    if (text) {
      elements.messageInput.value = text;
      setStatus("Mic transcript ready. Press Send when your line is complete.");
    }
  };
  recognition.onerror = (event) => {
    setStatus(`Mic unavailable: ${event.error}. You can type instead.`, true);
    state.listening = false;
    setButtons();
  };
  recognition.onend = () => {
    state.listening = false;
    setButtons();
  };
  state.recognition = recognition;
}

async function startCall() {
  state.waiting = true;
  setButtons();
  try {
    const scenarioId = elements.scenarioSelect.value;
    const payload = await api("/api/sessions", {
      method: "POST",
      body: JSON.stringify({ scenarioId }),
    });
    state.session = payload.session;
    state.scenario = payload.scenario;
    state.startedAt = Date.now();
    state.timerId = setInterval(updateTimer, 1000);
    elements.asideTitle.textContent = "Coach";
    elements.coachEmpty.classList.remove("hidden");
    elements.coachCard.classList.add("hidden");
    elements.scoreEmpty.classList.remove("hidden");
    elements.scoreCard.classList.add("hidden");
    renderScenario();
    renderTranscript();
    const openingLine = state.session.turns.find((turn) => turn.role === "persona")?.text;
    if (openingLine) speak(openingLine);
    setStatus("Call active. The customer answered. Speak with the mic or type your line.");
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    state.waiting = false;
    setButtons();
  }
}

async function startGauntlet() {
  state.waiting = true;
  setButtons();
  try {
    const payload = await api("/api/gauntlets", {
      method: "POST",
      body: JSON.stringify({ rounds: new URLSearchParams(window.location.search).has("smoke") ? 3 : 5 }),
    });
    state.session = payload.session;
    state.scenario = payload.scenario;
    state.startedAt = Date.now();
    state.timerId = setInterval(updateTimer, 1000);
    elements.asideTitle.textContent = "Gauntlet";
    elements.coachEmpty.classList.add("hidden");
    elements.coachCard.classList.add("hidden");
    elements.scoreEmpty.classList.remove("hidden");
    elements.scoreCard.classList.add("hidden");
    renderScenario();
    renderTranscript();
    const openingLine = state.session.turns.find((turn) => turn.role === "persona")?.text;
    if (openingLine) speak(openingLine);
    setStatus("Gauntlet active. Handle each objection in turn.");
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    state.waiting = false;
    setButtons();
  }
}

async function requestCoaching(selectedMove = null) {
  if (!state.session || state.waiting) return;
  state.waiting = true;
  setButtons();
  try {
    const payload = await api(`/api/sessions/${state.session.id}/coach`, {
      method: "POST",
      body: JSON.stringify(selectedMove ? { selectedMove } : {}),
    });
    if (payload.session) state.session = payload.session;
    renderCoaching(payload.suggestion);
    setStatus(payload.suggestion.suggestionHidden ? "Choose your next move." : "Coaching suggestion ready.");
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    state.waiting = false;
    setButtons();
  }
}

async function requestReviewQueue() {
  if (state.waiting) return;
  state.waiting = true;
  setButtons();
  try {
    const payload = await api("/api/review-queue");
    renderReviewQueue(payload);
    setStatus("Review queue loaded.");
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    state.waiting = false;
    setButtons();
  }
}

async function requestProfile() {
  if (state.waiting || !state.user) return;
  state.waiting = true;
  setButtons();
  try {
    const payload = await api("/api/profile");
    renderProfile(payload.profile);
    setStatus("Profile loaded.");
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    state.waiting = false;
    setButtons();
  }
}

async function submitMessage() {
  const text = elements.messageInput.value.trim();
  if (!text || !state.session || state.waiting) return;

  state.waiting = true;
  setButtons();
  elements.messageInput.value = "";
  try {
    if (state.session.gauntlet) {
      const payload = await api(`/api/gauntlets/${state.session.id}/round`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      state.session = payload.session;
      renderTranscript();
      if (state.session.status === "ended") {
        clearInterval(state.timerId);
        const summary = state.session.gauntlet.summary;
        const average = Math.round(
          state.session.gauntlet.results.reduce((total, item) => total + item.score, 0) /
            state.session.gauntlet.results.length,
        );
        renderScore({
          overallScore: average,
          categories: Object.fromEntries(
            summary.familyScores.map((item) => [item.family, Math.round(item.average)]),
          ),
          recommendedDrill: `Repeat the gauntlet and focus on ${summary.weakestFamily}.`,
          missedOpportunities: [],
        });
        setStatus(`Gauntlet complete. Weakest family: ${summary.weakestFamily}.`);
        return;
      }
      const nextTurn = [...state.session.turns].reverse().find((turn) => turn.role === "persona");
      if (nextTurn) speak(nextTurn.text);
      setStatus(`Round scored ${payload.result.score}/10. Next objection loaded.`);
      return;
    }
    const payload = await api(`/api/sessions/${state.session.id}/message`, {
      method: "POST",
      body: JSON.stringify({ text }),
    });
    state.session = payload.session;
    renderTranscript();
    speak(payload.reply.text);
    setStatus(payload.reply.warning ? `Using mock fallback: ${payload.reply.warning}` : "Customer replied.");
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    state.waiting = false;
    setButtons();
    elements.messageInput.focus();
  }
}

async function endCall() {
  if (!state.session || state.waiting) return;
  if (state.recognition && state.listening) state.recognition.stop();
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  state.waiting = true;
  setButtons();
  try {
    const payload = await api(`/api/sessions/${state.session.id}/end`, { method: "POST" });
    state.session = payload.session;
    clearInterval(state.timerId);
    updateTimer();
    renderTranscript();
    renderScore(state.session.evaluation);
    setStatus("Call ended. Review your score and run it again.");
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    state.waiting = false;
    setButtons();
  }
}

function toggleMic() {
  if (!state.recognition) return;
  if (state.listening) {
    state.recognition.stop();
    state.listening = false;
  } else {
    try {
      state.recognition.start();
      state.listening = true;
      setStatus("Listening...");
    } catch (error) {
      setStatus(`Mic failed: ${error.message}`, true);
      state.listening = false;
    }
  }
  setButtons();
}

elements.scenarioSelect.addEventListener("change", () => {
  state.scenario = state.scenarios.find((scenario) => scenario.id === elements.scenarioSelect.value);
  renderScenario();
});
elements.startBtn.addEventListener("click", startCall);
elements.gauntletBtn.addEventListener("click", startGauntlet);
elements.endBtn.addEventListener("click", endCall);
elements.coachBtn.addEventListener("click", () => requestCoaching());
elements.profileBtn.addEventListener("click", requestProfile);
elements.reviewBtn.addEventListener("click", requestReviewQueue);
elements.micBtn.addEventListener("click", toggleMic);
elements.authForm.addEventListener("submit", (event) => {
  event.preventDefault();
  authenticate();
});
elements.signupBtn.addEventListener("click", signup);
elements.requestAccessBtn.addEventListener("click", requestAccess);
elements.logoutBtn.addEventListener("click", logout);
elements.messageForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitMessage();
});

setupSpeech();
loadHealth()
  .then(loadScenarios)
  .then(loadAuth)
  .then(loadDueDrill)
  .then(setButtons)
  .catch((error) => setStatus(error.message, true));
