# Custom Pack Feature Guide

This project supports custom question packs for local authoring and preview testing, but the browser build is intentionally not configured to fetch a public answer-bearing JSON file from a raw URL.

> Critical security rule: a pack that exposes `correct` in a public JSON URL is not allowed. The answer key must remain on the trusted server-side rules layer. If you can fetch it via plain `curl` or a browser URL, it is not safe for live gameplay.

## What is safe

Safe flows for this repository are:
- local creator preview flow via the in-browser authoring UI and `sessionStorage`
- a trusted server or gate that loads and validates the pack before the round starts
- a private config source that never reaches the public browser with the answer bank attached

Unsafe flows include:
- hosting a public JSON file with `correct` values readable by anyone
- fetching arbitrary pack URLs in the browser with the answer key still attached
- treating a public browser-fetch as the source of truth for scoring

---

## Local authoring workflow

Use the creator page to build and preview a pack without exposing answers in a public location.

1. Open `creator.html`
2. Add questions with prompt, four options, and the correct answer
3. Preview the pack locally in the browser
4. Validate pool depth before publishing
5. Export the final config only when you have a trusted server or gate pipeline for runtime loading

This flow keeps the question bank local to the authoring session and does not rely on public URL fetches.

---

## Pack schema for trusted server-side use

When a trusted server or gate loads a pack, the runtime config still uses the same shape as the rules engine. The important point is that the answer bank stays behind the trusted layer, not in a public URL the client can curl.

```json
{
  "title": "How well do you know [Your Project]?",
  "packId": "unique-pack-id-v1",
  "completionBonus": 500,
  "speedBonusCap": 0.5,
  "rungsPerTier": [4, 4, 2],
  "tierSpecs": {
    "1": { "points": 100, "budgetMs": 8000 },
    "2": { "points": 200, "budgetMs": 7000 },
    "3": { "points": 400, "budgetMs": 6000 }
  },
  "questions": [
    {
      "id": "q1",
      "tier": 1,
      "prompt": "What is your project?",
      "options": [
        "Option A",
        "Option B",
        "Option C",
        "Option D"
      ],
      "correct": 1
    }
  ]
}
```

The browser should only ever receive what it needs to present the question. The authoritative answer key for score verification remains in the trusted rules layer.

---

## Required pack rules

### Top-level fields

- `title` (string): lobby title
- `packId` (string): stable pack identifier
- `completionBonus` (number): points for clearing all 10 rungs
- `speedBonusCap` (number): max speed bonus multiplier; typical value is `0.5`
- `rungsPerTier` (array of 3 numbers): must total 10
- `tierSpecs` (object with keys `1`, `2`, `3`): points and timing by tier
- `questions` (array): all pack questions

### Question object

- `id` (string): unique question identifier
- `tier` (1, 2, or 3): difficulty tier
- `prompt` (string): visible to the player
- `options` (array of 4 strings): private answer set for the player view only when the question is live
- `correct` (number): canonical answer index, but this value must remain behind the trusted rules boundary in production

### Pool and freshness

- target at least 7 questions per tier, and more is better for varied runs
- never repeat a question within a single run
- enforce a minimum pool before publication to avoid stale packs and repeated questions across many launches

---

## Why public pack URLs are intentionally disabled

This browser build intentionally refuses arbitrary `?pack=https://...` URLs.

That is not a limitation for the gameplay itself. It is a protection measure.

A public JSON file with plain `correct` indexes is equivalent to shipping a complete answer key to anyone who can access the URL. That directly contradicts the game-mode trust model and undermines the core anti-cheat claim.

For production, the pack must be loaded and validated in a trusted environment before round config is created, which keeps the answer bank off the public client surface.

---

## Validation rules

The creator preview and trusted server-side config should validate:
- title and packId are present
- each question has a valid `id`, `tier`, `prompt`, and 4 option strings
- each question has a valid `correct` index if a trusted server is building runtime config
- each tier spec includes `points` and `budgetMs`
- `rungsPerTier` contains exactly 3 positive values that sum to 10

If validation fails in the browser preview flow, fall back to the demo pack and show a warning instead of silently continuing with a broken pack.

---

## Recommended production pattern

Use this pattern for production:

1. Author the pack locally in the creator UI.
2. Upload the authored pack to a trusted backend or gate configuration service.
3. Load and validate it server-side before the round starts.
4. Hand only the minimal player-facing config to the browser.
5. Keep `correct` values behind the rules engine and never expose them in public URLs.

This preserves the intended Game Mode trust boundary and keeps custom content useful without turning it into a public answer sheet.

---

## Example: safe preview pack (local only)

```json
{
  "title": "How well do you know Cosmos?",
  "packId": "cosmos-quiz-v1",
  "completionBonus": 500,
  "speedBonusCap": 0.5,
  "rungsPerTier": [4, 4, 2],
  "tierSpecs": {
    "1": { "points": 100, "budgetMs": 8000 },
    "2": { "points": 200, "budgetMs": 7000 },
    "3": { "points": 400, "budgetMs": 6000 }
  },
  "questions": [
    { "id": "q1", "tier": 1, "prompt": "What is Cosmos?", "options": ["A blockchain", "A constellation", "An IBC network", "All of above"], "correct": 3 },
    { "id": "q2", "tier": 1, "prompt": "What does IBC stand for?", "options": ["Inter-Blockchain Communication", "International Bank Code", "Integrated Block Chain", "Inter-Block Crypto"], "correct": 0 },
    { "id": "q3", "tier": 2, "prompt": "What token powers the Cosmos Hub?", "options": ["ATOM", "COSMOS", "OSMO", "JUNO"], "correct": 0 },
    { "id": "q4", "tier": 3, "prompt": "Who was the primary author of the Cosmos whitepaper?", "options": ["Jae Kwon", "Ethan Buchman", "Sunny Aggarwal", "Jack Zampolin"], "correct": 0 }
  ]
}
```

This example is safe only in a local preview or a trusted private config pipeline. It must not be exposed to the public browser as a standalone URL.

---

## Troubleshooting

### Pack loads to the demo instead of the custom content
- you are using a public URL flow, which is intentionally disabled
- use the creator preview flow or a trusted server-side loader

### The game still looks like it is using a public answer bank
- verify the pack is not being fetched directly from a public URL
- ensure the answer key stays behind the trusted rules layer

### Scoring seems wrong
- verify `tierSpecs` and `speedBonusCap`
- confirm the pack is validated in the trusted rules environment before round start

---

**Questions?** Review the demo pack in `src/game/packs/demo.ts` and the authoritative rules in `src/game/rules.ts`.
