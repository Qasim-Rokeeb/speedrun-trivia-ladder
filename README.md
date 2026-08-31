# Speedrun Trivia Ladder

A Flaunch **Game Mode** in the **Knowledge** category: a timed trivia ladder where players race up
10 escalating rungs before the clock runs out. Speed + accuracy determine the score, and the score
maps to the ETH-spending allowance a player earns on a launch's bonding curve.

The browser owns the game experience. Pure, server-authoritative rules decide which actions earn
points — the correct answer key never ships to the client.

## Play it

```bash
pnpm install
pnpm dev
```

The local room uses the real rules (`src/game/rules.ts`) with a mock economy — no server, chain or
wallet needed. The included demo pack (`src/game/packs/demo.ts`) covers general crypto, Base-ecosystem
and Flaunch-specific questions across three tiers.

## How it plays

- A run is **10 rungs** in **3 tiers**: Warm-up (rungs 1–4), Climb (rungs 5–8), Summit (rungs 9–10).
- Each question has a per-tier time budget. Answer fast and right for a **speed multiplier up to +50%**.
- **Soft-fail**: a wrong answer never ends the run — it drops your effective tier (and point value)
  while you keep climbing. Everyone can reach the summit; how *well* you climb is the contest.
- Reaching all 10 rungs pays a **+500 completion bonus**, even after tier drops.
- **Anti-grinding**: only your **best single run** in a round counts toward allowance. Points are
  settled at run end as a delta, so replaying can never accumulate.

## Trust model (why judges can trust the score)

- The **canonical answer key lives only in the rules module** (server state). It is never in a view.
- A player sends only `{ questionId, chosen }` — the option they picked. The server re-derives the
  score from that raw input, so a modified client cannot forge a score or claim impossible reaction times.
- Question order and option order are **shuffled per player** (seeded), so a leaked "press C" cheat
  sheet does not transfer between players.
- Timing is `command.at` (authoritative); per-question deadlines are enforced server-side by wakes.

## Question packs (how a creator drops in their own questions)

The game runs off a `Config`/pack — any creator can supply their own questions with **no code
changes**. This is what makes the game reusable across many launches. A pack is built from:

```ts
interface Question {
  id: string;          // unique id
  tier: 1 | 2 | 3;     // authored difficulty
  prompt: string;      // the question text
  options: string[];   // 4 options, canonical order
  correct: number;     // index into options — server-authoritative, never sent to the client
}

interface Config {
  title: string;          // shown on the lobby ("How well do you know [Project]?")
  packId: string;         // stable pack id (used to seed per-player shuffling)
  questions: Question[];
  tierSpecs: Record<1|2|3, { points: number; budgetMs: number }>;
  rungsPerTier: [number, number, number]; // e.g. [4, 4, 2]
  completionBonus: number;                 // e.g. 500
  speedBonusCap: number;                   // top of speed multiplier, e.g. 0.5
}
```

To ship the demo as a custom pack, replace `demoPack` in `src/play.ts` with your own `Config`, or
follow the shape above. Author guidance baked into the tiers:

- **Tier 1** — answerable from a project's homepage.
- **Tier 2** — answerable by a moderately engaged holder (docs, tokenomics, AMM/DeFi concepts).
- **Tier 3** — answerable only by someone active in the project's community (lore, deep specifics).

The default pack ships in `src/game/packs/demo.ts`.

## Evidence / checks

```bash
pnpm test        # rules purity check + scoring / secrecy / replay / anti-grind tests
pnpm typecheck   # whole project
```

Tests cover: flawless-run scoring (3500 max), soft-fail tier drops, completion bonus, refusal of
invalid/repeated/mismatched answers, no answer key in the public view, best-of-session
anti-grinding, timeout soft-fails, round-close settling, deterministic replay, and per-player
question-order divergence.

## Submit to Flaunch

1. `pnpm exec vite build` produces the static `dist/` bundle.
2. Zip it and upload at `flaunch.gg/game-mode/create` with **name** "Speedrun Trivia Ladder",
   **category** "Knowledge", and a description noting it is the first Knowledge-category entry, its
   server-side validation, and its content-pluggable pack system.

## Connect a live gate

Finish against the mock room first; when a real launch runs through the game, follow the
[gate guide](https://github.com/flayerlabs/gamemode-sdk/blob/main/docs/guides/run-a-gate.md). The
game never handles a wallet, key or transaction — those live in the SDK/pool layer.

