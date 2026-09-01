# Custom Pack Feature Guide

The Speedrun Trivia Ladder now supports **custom question packs** at runtime via URL parameters. This means creators can use their own questions without touching any code.

## Quick Start

1. **Create a JSON file with your questions** (following the pack schema below)
2. **Host it on a web server** (CORS-enabled)
3. **Load the game with your pack**: `https://game.example.com/?pack=https://your-server.com/my-questions.json`

## Pack JSON Format

Your JSON file must follow this exact structure:

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
        "Option B (correct answer)",
        "Option C",
        "Option D"
      ],
      "correct": 1
    },
    {
      "id": "q2",
      "tier": 2,
      "prompt": "How does your tokenomics work?",
      "options": ["A", "B", "C", "D"],
      "correct": 2
    }
  ]
}
```

## Schema Details

### Top-Level Fields

- **`title`** (string, required): The prompt shown in the lobby. Example: "How well do you know crypto & Base?"
- **`packId`** (string, required): Unique identifier for this pack. Used for seeding question shuffling, so keep it stable across runs.
- **`completionBonus`** (number, required): Points awarded for reaching all 10 rungs (regardless of penalties). Typical: 500.
- **`speedBonusCap`** (number, required): Maximum speed bonus multiplier (0 to 1). At 0.5, fastest answers earn +50%. Typical: 0.5.
- **`rungsPerTier`** (array of 3 numbers, required): Rung count per tier. `[4, 4, 2]` = 4 Warm-up, 4 Climb, 2 Summit = 10 total.
- **`tierSpecs`** (object with keys "1", "2", "3"): Points and time budget per tier.
- **`questions`** (array of questions, required): At least 7 questions per tier (more is better to avoid repeats).

### Tier Specifications

Each tier needs:
- **`points`** (number): Base points for a correct answer on this tier
- **`budgetMs`** (number): Time budget in milliseconds (e.g., 8000 = 8 seconds)

Typical progression (from demo):
- **Tier 1 (Warm-up)**: 100 points, 8 sec — broadly known concepts
- **Tier 2 (Climb)**: 200 points, 7 sec — moderately specific knowledge
- **Tier 3 (Summit)**: 400 points, 6 sec — deep/expert knowledge

### Question Object

```json
{
  "id": "unique-id",
  "tier": 1,
  "prompt": "The question text",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correct": 1
}
```

- **`id`** (string): Unique question ID (used for trace logging and memoization checks)
- **`tier`** (1, 2, or 3): Difficulty tier (1 = easy, 3 = hard)
- **`prompt`** (string): The question text
- **`options`** (array of 4 strings): The four multiple choice options
- **`correct`** (number): Index (0–3) of the correct option in the canonical order

## Best Practices

### Content Guidelines

- **Tier 1 (Warm-up)**: Answerable from your homepage or white paper
  - Example: "What blockchain does your project use?"
- **Tier 2 (Climb)**: Requires 10+ minutes of reading (docs, tokenomics, roadmap)
  - Example: "What is the max supply of your token?"
- **Tier 3 (Summit)**: Requires active engagement (community, lore, deep specifics)
  - Example: "Which team member proposed the liquidity mechanism?"

### Question Pool

- **Aim for 7–10 questions per tier minimum** (demo has 8/8/9)
- Never repeat a question in the same run
- The shuffling is deterministic per player, so leaked answer traces won't transfer to others
- Avoid ambiguous answers — all 4 options should be clearly distinct

### Hosting

- **CORS headers**: Your JSON endpoint must allow cross-origin requests (`Access-Control-Allow-Origin: *`)
- **Content-Type**: Serve with `Content-Type: application/json`
- **SSL/HTTPS**: Required (most browsers block mixed content)

Example Node.js + Express setup:
```js
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
});

app.get('/my-pack.json', (req, res) => {
  res.json(myPackConfig);
});
```

## Validation

The game validates your pack at load time:
- ✅ Must have title, packId, and at least 1 question
- ✅ Each question must have id, tier (1–3), prompt, 4 options, and a correct index (0–3)
- ✅ Each tier spec must have points and budgetMs
- ✅ rungsPerTier must be 3 numbers that sum to 10

If validation fails, the game **silently falls back to the demo pack** with a console warning.

**Always test your JSON locally before deployment.**

## Loading a Custom Pack

### Via URL Parameter

```
https://game.flaunch.gg/?pack=https://your-cdn.com/my-pack.json
```

The game will:
1. Fetch the JSON from that URL
2. Validate the structure
3. Load your questions
4. Log to console: `Loaded custom pack: my-pack-v1 with 25 questions`

### Fallback Behavior

If the URL load fails (network error, bad JSON, validation fail):
- Game logs a warning to console
- Automatically uses the demo pack
- User sees normal Warm-up/Climb/Summit questions

### Testing Locally

For local development, use `pnpm dev` and pass a local URL:
```
http://localhost:5173/?pack=http://localhost:3000/my-pack.json
```

Or use a file-based pack in TypeScript:
```ts
// src/game/packs/custom.ts
export const customPack: Config = { /* ... */ };

// src/play.ts
import { customPack } from './game/packs/custom.js';
```

## Maximizing Score

The scoring system encourages **knowledge + speed**:

```
Score per question = base_points × (1 + speed_bonus_multiplier)
  where multiplier = (timeRemaining / budget) × speedBonusCap
  capped at [1.0, 1 + speedBonusCap]
```

Example (Tier 1, speedBonusCap=0.5):
- Answer in 0 sec (instant): 100 × 1.5 = **150 points**
- Answer in 4 sec (halfway): 100 × 1.25 = **125 points**
- Answer in 8 sec (timeout): 0 points (wrong/timed out)

**Knowledge matters most**: A fast wrong answer earns 0, a slow correct answer earns up to 150.

## Anti-Cheat Properties

Even with a custom pack, anti-cheat is built-in:

✅ **Server-side validation**: Correct answers are verified by the server, never sent to the client  
✅ **Per-player shuffling**: Each player sees a different option order for the same question  
✅ **Deterministic seeding**: Shuffling is based on packId + player seed, so identical setups produce identical (but secret) orders  
✅ **Trace logging**: All answers are recorded and can be replayed to verify scoring  
✅ **Delta scoring**: Only the best single run counts; replays never accumulate points  

## Example: Minimal Custom Pack

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

(This only has 4 questions, so it would fail validation. Add at least 7 per tier.)

## Troubleshooting

### Custom pack isn't loading
- **Check console**: Open browser DevTools → Console for warnings
- **CORS error**: Ensure your server sends `Access-Control-Allow-Origin: *` header
- **Network error**: Verify URL is correct and server is responding with HTTP 200
- **JSON error**: Validate JSON syntax using `jsonlint.com`

### Questions aren't my custom ones
- Check the browser console for fallback message
- Verify the JSON structure matches the schema exactly
- Test the JSON URL directly in your browser to see the response

### Same questions appear multiple times
- If your pack has fewer than 7 questions per tier, repeats are unavoidable
- Add more questions or adjust `rungsPerTier` to match pool size

### Scoring seems wrong
- Verify `tierSpecs` points and budgetMs are set correctly
- Remember: wrong answers earn 0 points (no negative scoring)
- Speed bonus caps at `1 + speedBonusCap` (e.g., 1.5x for 0.5 cap)

## Future Enhancements

Planned (not yet implemented):
- Creator UI for pack management (upload/edit in Flaunch dashboard)
- Multiple packs per launch (selector screen in lobby)
- Analytics dashboard (question difficulty, player performance)
- Leaderboard/ranking by pack
- Pack versioning and archiving

---

**Questions?** Refer to the demo pack in `src/game/packs/demo.ts` or review the type definitions in `src/game/rules.ts`.
