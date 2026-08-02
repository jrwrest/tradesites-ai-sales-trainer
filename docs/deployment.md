# Deployment Notes

These are generic self-hosting notes for Tradesites AI Sales Trainer. Keep live server IPs, SSH users, service names, tunnel commands, credentials, and provider tokens in a private ops repo or password manager.

## Recommended Public Setup

- Put the trainer behind HTTPS with a reverse proxy such as Caddy, nginx, or a platform router.
- Run the Node app on loopback or a private container network.
- Run PocketBase on loopback or a private container network.
- Set `AUTH_REQUIRED=1`.
- Set `SIGNUP_MODE=disabled` or `SIGNUP_MODE=approval`; use `open` only if you intentionally want public account creation.
- For controlled public access, use approval mode so visitors verify email first, then admins approve from Telegram, then the app sends a password setup link.
- Use the mock brain for public demos unless you have quotas, rate limits, and abuse monitoring around model-backed providers.
- Store transcripts in a private `DATA_DIR` outside the git checkout.
- Run exactly one app process while using the JSON data store. Horizontal replicas require replacing it with a transactional database first.
- Keep `BACKUP_ROOT` on a separate path from `DATA_DIR`; take backups with the app stopped or from a filesystem snapshot.
- Run the trainer and PocketBase as a dedicated unprivileged service account. Example systemd environment and hardening drop-ins live under `ops/systemd/`.

## Example Environment

```bash
HOST=127.0.0.1
PORT=3137
NODE_ENV=production
DATA_DIR=/var/lib/tradesites-ai-sales-trainer/data
STORAGE_MODE=single-instance-json
BACKUP_ROOT=/var/backups/tradesites-ai-sales-trainer
DATA_RETENTION_ENABLED=1
SESSION_RETENTION_DAYS=90
SIGNUP_REQUEST_RETENTION_DAYS=30
AUTH_REQUIRED=1
SIGNUP_ENABLED=0
SIGNUP_MODE=approval
PUBLIC_BASE_URL=https://trainer.example.com
ACCESS_APPROVAL_TOKEN=replace-with-a-long-random-secret
POCKETBASE_URL=http://127.0.0.1:8090
```

Required signup email delivery through Brevo SMTP:

```bash
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=replace-with-your-brevo-smtp-user
SMTP_PASS=replace-with-your-brevo-smtp-password
SMTP_FROM=trainer@example.com
SMTP_FROM_NAME="Tradesites AI Sales Trainer"
```

These are required when `SIGNUP_MODE=approval`; the app fails closed instead of logging signup links or telling users that email was sent when delivery is not configured.

Optional signup link lifetimes:

```bash
SIGNUP_EMAIL_TOKEN_TTL_HOURS=24
SIGNUP_APPROVAL_TOKEN_TTL_HOURS=72
SIGNUP_PASSWORD_TOKEN_TTL_HOURS=24
SIGNUP_EMAIL_RESEND_COOLDOWN_SECONDS=300
```

Optional Telegram approval notifications:

```bash
TELEGRAM_BOT_TOKEN=replace-with-your-bot-token
TELEGRAM_CHAT_ID=replace-with-your-chat-id
```

Optional OpenClaw provider:

```bash
OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789
OPENCLAW_GATEWAY_TOKEN=replace-with-a-secret
OPENCLAW_AGENT_ID=sales-trainer-customer
OPENCLAW_DATA_POLICY_ACK=1
```

The gateway handshake requests `operator.read` plus `operator.write`, never `operator.admin`. Read is required for streamed agent events; write starts ordinary turns. Production accepts only the dedicated `sales-trainer-customer` agent. Configure that agent with the `minimal` tool profile, deny `session_status`, and set its skill allowlist to `[]`; verify an agent canary reports an empty effective tool list. Never point public trainee input at an operational sales, messaging, or coding agent. `OPENCLAW_DATA_POLICY_ACK=1` records the deployment decision that this boundary receives synthetic roleplay only—never imported recordings, real prospect details, or other customer PII. A shared OpenClaw gateway is not a hostile multi-tenant security boundary; use a separate gateway/OS account if other workloads are not equally trusted.

Optional dialogue rendering canary:

```bash
DIALOGUE_MANAGER_ENABLED=1
DIALOGUE_LLM_RENDER_ENABLED=1
DIALOGUE_LLM_RENDER_TIMEOUT_MS=10000
DIALOGUE_LLM_RENDER_RETRY_ON_VIOLATION=0
DIALOGUE_LLM_RENDER_MAX_CONCURRENT_PER_SESSION=1
DIALOGUE_LLM_RENDER_MAX_CONCURRENT_PER_USER=2
DIALOGUE_LLM_RENDER_MAX_CONCURRENT_GLOBAL=10
OPENCLAW_GATEWAY_TIMEOUT_MS=40000
```

Keep `DIALOGUE_LLM_RENDER_ENABLED=0` for normal production rollback. The render timeout should stay well below the general OpenClaw timeout. The 40000 ms OpenClaw value is one end-to-end provider deadline, not a fresh timeout for each gateway phase; expiry returns a deterministic customer reply with `openclaw_timeout`.

## Health Check

```bash
curl -s http://127.0.0.1:3137/api/health
curl -fsS http://127.0.0.1:3137/api/ready
```

Expected shape:

```json
{
  "ok": true,
  "brain": "mock",
  "dialogueManager": {
    "enabled": true
  },
  "dialogueRendering": {
    "enabled": false,
    "provider": "mock",
    "timeoutMs": 10000,
    "maxConcurrentPerSession": 1,
    "maxConcurrentPerUser": 2,
    "maxConcurrentGlobal": 10,
    "stats": {
      "attempts": 0,
      "rendered": 0,
      "fallbacks": 0,
      "timeouts": 0,
      "constraintViolations": 0,
      "providerErrors": 0,
      "concurrencyLimited": 0,
      "active": 0
    }
  },
  "auth": {
    "required": true,
    "signupEnabled": true,
    "signupMode": "approval"
  }
}
```

`/api/health` reports process metadata. Route traffic only when `/api/ready` returns 200: in production it verifies the writable store/backup lifecycle, PocketBase, and the configured OpenClaw gateway handshake.

## Retention, Deletion, And Backups

Production startup fails unless retention is enabled. The app purges sessions older than 90 days and signup requests older than 30 days by default, at startup and daily. Override the periods with `SESSION_RETENTION_DAYS`, `SIGNUP_REQUEST_RETENTION_DAYS`, and `RETENTION_INTERVAL_MS`.

Authenticated users can delete their own saved calls, profile, and skill history from Profile by typing `DELETE MY TRAINING DATA`. This deliberately leaves the PocketBase login account intact so account deletion remains an administrator-controlled identity operation.

The deletion endpoint removes the trainer's local copy immediately. If an optional model provider is enabled, its session/transcript retention remains governed by that provider boundary. For the shared OpenClaw beta boundary, allow synthetic roleplay only and keep its enforced session maintenance at no more than 30 days; use a separate Gateway if you need an independently erasable provider store.

The backup tool writes a private, checksummed snapshot. Stop the app first, or point `DATA_DIR` at a read-only filesystem snapshot so files from several stores cannot change mid-copy:

```bash
npm run data:backup -- /var/backups/tradesites-ai-sales-trainer
npm run data:verify -- /var/backups/tradesites-ai-sales-trainer/REPLACE_WITH_SNAPSHOT
```

This command covers trainer transcripts, profiles, skill memory, and signup requests only. Back up PocketBase separately using its supported backup/snapshot procedure, and restore the trainer and PocketBase snapshots from the same maintenance window so identity and training-data ownership remain aligned.

Run a restore drill into a new empty directory; never overwrite the live data directory:

```bash
npm run data:restore -- \
  /var/backups/tradesites-ai-sales-trainer/REPLACE_WITH_SNAPSHOT \
  /var/lib/tradesites-ai-sales-trainer/restore-drill
```

After verifying the restored files, rollback by stopping the app, moving the current data directory aside, moving the verified restore directory into the configured `DATA_DIR`, checking ownership/modes, starting the old known-good release, and requiring `/api/ready` plus an authenticated canary before reopening traffic. Retain the moved-aside directory until the rollback is accepted.

## Deployment Checklist

- [ ] No real transcripts or customer names are committed.
- [ ] `.env`, PocketBase data, transcript data, and logs are outside git.
- [ ] `DATA_DIR` and `BACKUP_ROOT` are absolute, separate, private paths; only one Node app process writes JSON storage.
- [ ] Retention ran successfully and a checksummed backup passed a restore drill into an empty directory.
- [ ] Public signup is disabled or approval-mode email verification is enabled for shared deployments.
- [ ] Provider tokens are stored outside the repo and rotated if exposed.
- [ ] Dialogue rendering is canaried with `DIALOGUE_LLM_RENDER_ENABLED=1` before broader use.
- [ ] Rollback is tested by setting `DIALOGUE_LLM_RENDER_ENABLED=0` and restarting the service.
- [ ] Reverse proxy terminates HTTPS.
- [ ] Auth and app logs do not include passwords or bearer tokens.
- [ ] Model providers have spending limits or quotas.
- [ ] OpenClaw uses read/write (no admin), the minimal-tool `sales-trainer-customer` agent, and synthetic practice data only.
- [ ] Backups exclude transient smoke-test data.

## Updating A Server

Use your deployment tool of choice. A safe update should:

1. Stop writes and create/verify a backup.
2. Pull or upload the reviewed release and install locked production dependencies with `npm ci --omit=dev`.
3. Run retention once with `npm run data:retention`.
4. Restart the single app service.
5. Require 200 from `/api/ready` and inspect `/api/health`.
6. Sign in with a dedicated canary user, start a call, send one synthetic turn, end the call, and verify the method-pack version and evidence-based result.
7. If the canary fails, disable LLM rendering first; if the failure remains, execute the restore/release rollback above.

Do not publish production SSH commands, hostnames, or live topology in this repo.
