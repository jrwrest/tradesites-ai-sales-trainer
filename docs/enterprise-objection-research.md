# Enterprise Cold-Call Objection Research

This prototype uses a bounded objection playbook rather than free-form random pushback.

## Source Patterns

- Gong cold-call guidance groups objection handling around validating the objection, labelling the concern, then making a smaller secondary ask. It also emphasizes stating name/company, giving the reason for the call, and asking permission early.
  Source: https://www.gong.io/blog/cold-call-objections
- Gong Labs' 300M-call article separates dismissive, situational, and existing-solution objections. The trainer mirrors that distinction with `dismissive`, `process`, `authority`, `commercial_risk`, and `existing_solution` objection types.
  Source: https://www.gong.io/resources/labs/we-found-the-top-objections-across-300m-cold-calls-heres-how-to-handle-them-all/
- HubSpot's objection process is useful for coaching: encourage/question, confirm understanding, address the concern, and check. The help panel returns short prompts in that style.
  Source: https://blog.hubspot.com/sales/three-step-objection-handling-process
- For larger sales, SPIN guidance says early pitching creates avoidable objections; the rep should use problem, implication, and need-payoff questions before making solution claims.
  Source: https://www.cabem.com/spin-selling-summary/
- Internal sales notes emphasized low-pressure replies, correct classification, small next steps, `1 / 2 / 3` options, and clean exits on hard no or suppression requests. Those notes are not bundled with this public repository.

## Enterprise Objection Categories

- Gatekeeper / identity: "Who are you and why are you calling?"
- Dismissive: "Send info."
- Hard no / suppression: "No requirement. Take us off your list."
- Existing solution: "We already have solar / consultant / supplier."
- Authority: "We do not own the building."
- Process: "Procurement, estates, sustainability, finance need to be involved."
- Commercial risk: "No upfront cost means catch later."
- Complexity: "Multiple sites, leases, meters, and stakeholders."
- Timing: "Not a priority this quarter."

## Design Decisions

- Random objections are stage-gated so they do not appear before the rep has said enough.
- Used objections are tracked per session to avoid immediate repetition.
- Hard no objections suppress further objections and should be scored as an exit moment.
- Help suggestions never expose hidden persona context.
- OpenClaw may phrase the customer reply, but the local playbook chooses the objection so the drill remains testable.
