# Submission Guide — Speedrun Trivia Ladder

This guide provides step-by-step instructions for packaging and submitting the game to Flaunch.

## Pre-Submission Checklist

Before you submit, verify everything locally:

```bash
# 1. Run all tests (must pass)
pnpm test

# 2. Run type checking (must pass)
pnpm typecheck

# 3. Build the production bundle
pnpm exec vite build

# 4. Verify build output
ls -la dist/
# Should show:
#   - dist/index.html
#   - dist/assets/index-[hash].js
```

All three commands must complete successfully before proceeding.

### Security / rules checks that matter as much as the test pass

- [ ] No custom pack exposes the answer key over a public URL
- [ ] Public views contain no secret answer data
- [ ] `rewardBounds()` matches the maximum possible per-player score
- [ ] The authoritative rules live in `src/game/rules.ts` and are not bypassed by browser logic

The real source of truth is the rules module. The browser is only a presentation layer and cannot be trusted to award points or reveal hidden answers.

---

## Build & Package for Submission

### Step 1: Clean and Rebuild

```bash
# Start fresh
rm -rf dist/

# Build production bundle
pnpm exec vite build
```

**Expected output:**
```
vite v5.4.21 building for production...
✓ 17 modules transformed.
dist/index.html                25.08 kB │ gzip:  5.64 kB
dist/assets/index-COtNsiyo.js  31.37 kB │ gzip: 11.20 kB
✓ built in 507ms
```

### Step 2: Create Submission ZIP

From the project root, create a ZIP file containing the entire `dist/` folder:

```bash
# Create zip (preserves dist/ structure)
zip -r speedrun-trivia-ladder.zip dist/
```

**Verify the zip contents:**
```bash
unzip -l speedrun-trivia-ladder.zip
# Should show:
#   dist/
#   dist/index.html
#   dist/assets/index-[hash].js
#   dist/assets/[other assets if any]
```

### Step 3: Test the ZIP (Optional but Recommended)

Extract in a clean folder and serve to confirm it works:

```bash
# In a temporary directory:
unzip speedrun-trivia-ladder.zip

# Serve with Python (or any static server)
python -m http.server 8000

# In your browser, visit: http://localhost:8000/dist/
# The game should load and be fully playable
```

---

## Upload to Flaunch

1. **Navigate** to `flaunch.gg/game-mode/create`

2. **Fill in the form:**
   - **Name:** `Speedrun Trivia Ladder`
   - **Category:** `Knowledge` ← (important: select this, not Skill or Luck)
   - **Description:** (See template below)
   - **Game ZIP file:** Select your `speedrun-trivia-ladder.zip`

3. **Submit**

> Important: this project does not ship a public custom pack URL that contains `correct` values. In production, the answer bank must remain server-side or otherwise behind the trusted gate layer. The browser build intentionally does not fetch public answer-bearing pack files.

---

## Submission Description Template

Copy and paste this (or customize to match your project):

```
Speedrun Trivia Ladder is the first Knowledge-category Game Mode on Flaunch.
Players race up a 10-rung ladder of escalating trivia questions before the
round closes, earning a spending allowance based on their final score.

Why Trivia?
Trivia gating rewards a community that genuinely understands a project instead
of the fastest bot. Unlike reflex games, knowledge is harder to cheat at scale,
creating a stronger quality filter for launch participants.

How it works:
Each player climbs three tiers (Warm-up, Climb, Summit) with increasing time
pressure and point value. Wrong answers drop your effective tier value (soft-fail)
but never end your run. Reach all 10 rungs and earn a completion bonus. Speed
multipliers (1.0–1.5x) reward accuracy over raw reflex.

Anti-cheat built in:
The trusted rules layer holds the answer key, never the browser. Per-player
shuffling ensures leaked cheat sheets don't transfer between players. Scores are
re-derived from raw inputs, so clients can't forge points or claim impossible
reaction times. Only the best single run counts, preventing grinding.

This is a server-side trust model. A public JSON file that exposes `correct`
values would break the pitfall that the game is designed to avoid.

Extensible:
Creators drop in any trivia pack without touching game code. The included
crypto + Base + Flaunch demo has 25 questions across three tiers. Follow the
pack schema in the README to customize for your project's launch story.
```

---

## File Structure Inside the ZIP

The ZIP must have this structure:

```
speedrun-trivia-ladder.zip
└── dist/
    ├── index.html          (25.08 kB)
    └── assets/
        ├── index-[hash].js (31.37 kB)
        └── [any CSS/other assets bundled by Vite]
```

**Important:** The ZIP file should contain the `dist/` folder at the root, not just its contents.

---

## After Upload

Once submitted:

1. Flaunch will extract the ZIP and host it
2. The game will be listed on the Game Mode library
3. Creators can select "Speedrun Trivia Ladder" when setting up a new launch
4. Players will be directed to play it in a launch window

---

## Troubleshooting

### Build fails or produces errors
```bash
# Clear node_modules and reinstall
rm -rf node_modules pnpm-lock.yaml
pnpm install
pnpm test    # Verify tests still pass
pnpm build   # Try again
```

### ZIP doesn't extract properly
```bash
# Use unzip to verify integrity
unzip -t speedrun-trivia-ladder.zip

# If issues, recreate with verbose output
zip -r -v speedrun-trivia-ladder.zip dist/
```

### Game doesn't load after upload
- Verify the ZIP structure (must have `dist/index.html` at root level)
- Check browser console for errors
- Ensure all assets are in `dist/assets/`
- Test locally by serving `dist/index.html`

---

## Verification Checklist Before Submitting

- [ ] All tests pass: `pnpm test`
- [ ] No type errors: `pnpm typecheck`
- [ ] Build succeeds: `pnpm exec vite build`
- [ ] ZIP created: `zip -r speedrun-trivia-ladder.zip dist/`
- [ ] ZIP verified: `unzip -l speedrun-trivia-ladder.zip` shows correct structure
- [ ] ZIP tested locally by extracting and serving
- [ ] No public pack URL exposes `correct` answers
- [ ] `rewardBounds()` matches the maximum possible score
- [ ] Public views contain no secret answer data
- [ ] Name is "Speedrun Trivia Ladder"
- [ ] Category is "Knowledge"
- [ ] Description covers anti-cheat, knowledge reward, and extensibility
- [ ] Submission form accepted and confirmed

---

**You are now ready to submit!** 🚀
