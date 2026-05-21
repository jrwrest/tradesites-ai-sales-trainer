# Deployment Notes

These are generic self-hosting notes for Tradesites AI Sales Trainer. Keep live server IPs, SSH users, service names, tunnel commands, credentials, and provider tokens in a private ops repo or password manager.

## Recommended Public Setup

- Put the trainer behind HTTPS with a reverse proxy such as Caddy, nginx, or a platform router.
- Run the Node app on loopback or a private container network.
- Run PocketBase on loopback or a private container network.
- Set `AUTH_REQUIRED=1`.
- Set `SIGNUP_MODE=disabled` or `SIGNUP_MODE=approval`; use `open` only if you intentionally want public account creation.
- Create users through your private PocketBase admin workflow.
- Use the mock brain for public demos unless you have quotas, rate limits, and abuse monitoring around model-backed providers.
- Store transcripts in a private `DATA_DIR` outside the git checkout.

## Example Environment

```bash
HOST=127.0.0.1
PORT=3137
DATA_DIR=/var/lib/tradesites-ai-sales-trainer/data
AUTH_REQUIRED=1
SIGNUP_ENABLED=0
SIGNUP_MODE=approval
PUBLIC_BASE_URL=https://trainer.example.com
ACCESS_APPROVAL_TOKEN=replace-with-a-long-random-secret
POCKETBASE_URL=http://127.0.0.1:8090
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
OPENCLAW_AGENT_ID=main
```

## Health Check

```bash
curl -s http://127.0.0.1:3137/api/health
```

Expected shape:

```json
{
  "ok": true,
  "brain": "mock",
  "auth": {
    "required": true,
    "signupEnabled": false
  }
}
```

## Deployment Checklist

- [ ] No real transcripts or customer names are committed.
- [ ] `.env`, PocketBase data, transcript data, and logs are outside git.
- [ ] Public signup is disabled for shared deployments.
- [ ] Provider tokens are stored outside the repo and rotated if exposed.
- [ ] Reverse proxy terminates HTTPS.
- [ ] Auth and app logs do not include passwords or bearer tokens.
- [ ] Model providers have spending limits or quotas.
- [ ] Backups exclude transient smoke-test data.

## Updating A Server

Use your deployment tool of choice. A safe update should:

1. Pull or upload the reviewed release.
2. Install production dependencies.
3. Restart the app service.
4. Validate `/api/health`.
5. Sign in with a test user.
6. Start and end one mock call.

Do not publish production SSH commands, hostnames, or live topology in this repo.
