# Contributing

Tradesites AI Sales Trainer is an early open-source project. Small, focused pull requests are easiest to review.

## Local Setup

```bash
npm ci
npm test
AUTH_REQUIRED=0 npm start
```

Open <http://127.0.0.1:3137/>.

## Contribution Guidelines

- Use synthetic examples. Do not commit real customer names, transcripts, phone numbers, email addresses, server IPs, SSH commands, or tokens.
- Keep trade packs grounded in real buyer objections, but write original scenario text.
- Add or update tests for behavior changes.
- Run `npm test` before opening a pull request.
- Use clear issue or PR titles that describe the user-facing outcome.

## Adding A Trade Pack

Trade packs usually touch:

- `src/scenarios.js`
- `src/objectionPlaybook.js`
- `src/approvedResponses.js`
- `src/scoring.js`
- `src/skills.js`
- `test/fixtures/training-evals/`

Add synthetic fixtures that prove the pack can score both good and weak calls.

## Security And Privacy

If you notice a security issue, follow [SECURITY.md](SECURITY.md). Do not publish secrets or live infrastructure details in issues, discussions, pull requests, screenshots, or fixtures.
