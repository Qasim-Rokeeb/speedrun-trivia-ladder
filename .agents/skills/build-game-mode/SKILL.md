---
name: build-game-mode
description: Builds or changes a creator Game Mode with @flayerlabs/gamemode-spec and @flayerlabs/gamemode-client. Use when working on rules, actions, views, scoring, room capabilities, browser play, mock rooms or conformance tests in this SDK or a generated game. Do not use for trusted parent, registry writer or platform-owned gate changes.
---

# Build a Game Mode

Follow the local `AGENTS.md` as the contract. Keep this skill focused on the workflow and do not replace those rules with guesses.

## Find the working context

1. Read the nearest `AGENTS.md` in full before editing anything.
2. Inspect `package.json`, the game rules and their tests.
3. If this is the SDK, read the closest reference game. Use `examples/arrow` for continuous public scoring. Use `examples/quiz` for hidden answers, phases and deferred awards.
4. If this is a generated game, keep the shipped rules and tests as the working starting point.

## Define the game before editing

State assumptions and set verifiable success criteria for:

- the authoritative state and accepted commands
- the source of time and deterministic variation
- hidden values and their reveal point
- action shape, size, cooldown and round limits
- acceptance, scoring and award timing
- the maximum possible reward
- refusal codes and observable outcomes

If the SDK interface cannot represent the game safely, stop and describe the missing seam. Do not build a parallel protocol.

## Build the smallest complete loop

1. Write or update tests for the intended rule change.
2. Define every shared shape once. Import SDK contract types instead of copying them.
3. Bound malformed and oversized input in `parseAction`.
4. Implement `decide` and `evolve` as pure functions. Derive time and variation only from supplied inputs.
5. Make hidden data absent from public view types. Reveal it only when the rules allow.
6. Keep action acceptance separate from awards when an early balance change would leak a result.
7. Calculate `rewardBounds` from the rules, including the best possible play.
8. Build the browser around `Room` capabilities. Keep scoring, wallets, keys and calldata out of creator client code.
9. Prove the loop with the mock room before adding a project-specific live harness.

## Verify the result

In a generated game:

1. Run `pnpm test`.
2. Run `pnpm typecheck`.
3. Run `pnpm dev` and check the changed play loop when presentation changed.

In the SDK:

1. Run the affected example or package tests and typecheck.
2. Run the root typecheck and required repository tests.
3. Run `pnpm release:check` when a published contract or package surface changed.

Check replay, reconnect, hidden-data leaks, late actions, duplicate actions, oversized input, wake timing and the reward ceiling where they apply. If infrastructure blocks a check, report the exact check you could not run. Do not weaken or skip it.
