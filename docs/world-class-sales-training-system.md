# World-Class Cold-Calling Training System

Goal: make this trainer good enough to keep reps sharp for high-value B2B and large-business cold calls, especially Solar Future Scotland/commercial solar conversations.

## Research Base

The product should combine sales-coaching practice with proven learning science.

- **Deliberate practice:** expertise improves fastest when practice targets specific sub-skills, has clear goals, immediate feedback, repetition, and adjustment. Ericsson-style deliberate practice is not just "do more calls"; it is designed practice on weaknesses with feedback.
  Source: https://pubmed.ncbi.nlm.nih.gov/18778378/
- **Spaced practice:** Cepeda et al.'s distributed-practice meta-analysis reviewed hundreds of assessments and found robust advantages for spacing practice over massed practice.
  Source: https://colab.ws/articles/10.1037/0033-2909.132.3.354
- **Retrieval practice / testing effect:** Roediger and Karpicke showed that being tested improves long-term retention compared with restudying.
  Source: https://pubmed.ncbi.nlm.nih.gov/16507066/
- **High-utility learning techniques:** Dunlosky et al. rated practice testing and distributed practice as high-utility techniques across learners, materials, and task types.
  Source: https://www.psychologicalscience.org/publications/journals/pspi/learning-techniques.html
- **Feedback quality matters:** feedback helps when it focuses on the task and next action; it can hurt when it becomes vague, ego-focused, or distracting.
  Source: https://www.frontiersin.org/articles/10.3389/feduc.2021.720195/full
- **Sales coaching affects performance through behaviour:** recent sales-management research links managerial coaching with customer orientation, results orientation, and sales performance.
  Source: https://www.sciencedirect.com/org/science/article/pii/S1741040122000073

## Product Principles

1. **Train sub-skills, not just whole calls.**
   A rep should practise opener, permission, gatekeeper handling, discovery, authority mapping, commercial objection handling, close, and clean exit as separate drills.

2. **Every call creates the next drill.**
   The evaluation should identify the weakest pattern and schedule a focused repetition.

3. **Use spaced repetition for sales behaviour.**
   Reps should see the same objection type again after 1 day, 3 days, 7 days, 14 days, and 30 days, with spacing adapted by performance.

4. **Use interleaving.**
   Do not let reps practise only "send info" ten times in a row. Mix similar objections so they learn to diagnose: hard no, timing, incumbent, procurement, authority, commercial risk, and existing solution.

5. **Use retrieval before hints.**
   Before showing the ideal response, ask the rep what move they should make. This creates active recall instead of passive script reading.

6. **Score observable behaviours.**
   Avoid vague "confidence" scoring. Score exact behaviours:
   - identified self and company;
   - gave reason for call;
   - asked permission;
   - asked one useful qualifying question;
   - acknowledged objection;
   - avoided overclaiming;
   - mapped stakeholder/process;
   - earned next step or exited cleanly.

7. **Reward clean exits.**
   Large-business selling is not about pushing every prospect. If there is a hard no or suppression request, the best move is often to close cleanly.

8. **Keep coaching short in-call, deeper after-call.**
   In-call help should be one suggested move. Post-call review can show transcript, missed moments, drills, and examples.

## Training System Components

### 1. Skill Map

Track each rep's skill level by capability:

- opener clarity;
- permission ask;
- relevance statement;
- gatekeeper control;
- discovery question quality;
- authority/process mapping;
- commercial model explanation;
- PPA/capex distinction;
- landlord/tenant routing;
- procurement navigation;
- incumbent consultant handling;
- timing/follow-up handling;
- clean exit.

Each skill needs:

- current score;
- confidence;
- last practised;
- next review date;
- recent examples;
- assigned drill.

### 2. Scenario Library

Scenarios should vary by:

- company size;
- role: receptionist, facilities, finance, operations, MD, procurement;
- site type: single owned site, leased site, multi-site estate, existing solar, high-energy industrial;
- mood: polite, impatient, skeptical, technical, hostile, distracted;
- target outcome: qualify, route, book, close cleanly, recover from confusion.

### 3. Objection Bank

Each objection needs:

- type;
- stage;
- difficulty;
- trigger conditions;
- customer wording variants;
- hidden evaluation rubric;
- ideal moves;
- unacceptable moves;
- clean-exit conditions;
- next spaced-review schedule.

### 4. Spaced Repetition Scheduler

After every call:

```text
if score >= 8:
  review in 14-30 days
elif score >= 5:
  review in 3-7 days
else:
  review tomorrow
```

The scheduler should target **skills and objection types**, not exact scripts.

Example:

```json
{
  "rep_id": "james",
  "skill": "hard_no_clean_exit",
  "objection_type": "hard_no",
  "last_score": 3,
  "next_due_at": "2026-05-21",
  "interval_days": 1
}
```

### 5. Retrieval-First Coaching

When the rep clicks Help:

1. Ask: "What is your next move?"
2. Let the rep choose:
   - acknowledge;
   - clarify;
   - ask permission;
   - qualify;
   - route;
   - exit.
3. Then show the coach suggestion.

This uses retrieval practice instead of making the rep dependent on hints.

### 6. After-Call Review

Post-call review should include:

- score by skill;
- 3 best moments;
- 3 missed moments;
- exact transcript quotes;
- "better next line";
- one assigned drill;
- spaced review date;
- whether the rep respected compliance/suppression boundaries.

### 7. Coach Dashboard

For a manager or trainer:

- reps ranked by skill, not just average score;
- objection types that are causing the most failures;
- call examples worth reviewing;
- drift alerts when reps start overpitching or ignoring hard no;
- weekly drill plan.

### 8. Game Loop

The system should feel like training, not admin:

- daily 10-minute drill;
- weekly benchmark call;
- streak for completed spaced reps;
- level unlocks by scenario difficulty;
- "boss fight" calls: multi-stakeholder, hard procurement, existing solar plus PPA challenge;
- leaderboard only for healthy metrics: clean exits, discovery quality, improvement velocity.

## MVP Build Order

### Phase 1: Drill Engine

- Add `skills` and `objection_type` to evaluations.
- Store per-session skill scores.
- Assign one next drill after each call.
- Add due-drill list on app load.

### Phase 2: Spaced Repetition

- Add local JSON/SQLite store for rep skill memory.
- Implement due dates: 1, 3, 7, 14, 30 days.
- Make scenario selection default to due drills.

### Phase 3: Retrieval-First Help

- Change Help panel from immediate suggestion to:
  - "Choose your next move"
  - then reveal suggestion.
- Track whether the rep chose the right move before seeing advice.

### Phase 4: Interleaved Objection Gauntlets

- Build 5-call sessions mixing similar objections.
- Include near-misses:
  - "send info" vs "hard no";
  - "landlord" vs "procurement";
  - "already have solar" vs "energy consultant";
  - "not priority" vs "no requirement".

### Phase 5: Coach Review

- Add review queue for calls with low scores, hard-no failures, or big improvements.
- Add manager notes and approved example responses.

## Quality Gates

The trainer is not "world-class" until it can prove:

- reps improve on repeated skill scores over time;
- hard-no compliance improves, not worsens;
- reps retain objection handling after a week, not just immediately after practice;
- help usage decreases or becomes more diagnostic over time;
- practice transfers from mock calls to real call outcomes.

## What We Need In Place

- A durable skill model.
- A spaced repetition scheduler.
- A high-quality objection taxonomy.
- Stage-aware simulated customers.
- Retrieval-first coaching.
- After-call scoring with evidence from transcript.
- A coach dashboard.
- Clean data retention rules.
- Safety rules for no-interest, suppression, and overclaiming.
- Benchmarks using synthetic call fixtures that model hard rejection and poor context-setting.
