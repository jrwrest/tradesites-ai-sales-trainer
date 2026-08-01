const form = document.querySelector("#setPasswordForm");
const status = document.querySelector("#setPasswordStatus");
const password = document.querySelector("#password");
const button = document.querySelector("#setPasswordBtn");
const params = new URLSearchParams(window.location.search);
const id = params.get("id");
const token = params.get("token");

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("error", isError);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!id || !token) {
    setStatus("Password setup link is missing details.", true);
    return;
  }
  if (!password.value || password.value.length < 8) {
    setStatus("Password must be at least 8 characters.", true);
    return;
  }
  button.disabled = true;
  try {
    const response = await fetch(`/api/signup-requests/${id}/set-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: password.value }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Could not set password.");
    sessionStorage.setItem("tradesitesAiSalesTrainerToken", payload.token);
    window.location.href = "/app";
  } catch (error) {
    setStatus(error.message, true);
    button.disabled = false;
  }
});
