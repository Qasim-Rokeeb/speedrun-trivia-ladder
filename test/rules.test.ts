import { describe, expect, it } from 'vitest';
import { Round } from '@flayerlabs/gamemode-spec/round';
import type { PlayerView } from '../src/game/rules.js';
import { rules, TOTAL_RUNGS } from '../src/game/rules.js';
import { demoPack } from '../src/game/packs/demo.js';

const OPENS = 1_000_000;
const CLOSES = OPENS + 300_000;

function freshGame(seed = 42) {
  const r = Round.start(rules, demoPack, seed, { opensAt: OPENS, closesAt: CLOSES });
  return r;
}

function joinStart(r: ReturnType<typeof freshGame>, player: string, at = OPENS + 10_000) {
  r.send({ kind: 'join', player, seed: 7, at });
  r.send({ kind: 'action', player, action: { kind: 'start' }, at });
  return r.playerView(player) as PlayerView;
}

/** The shuffled option index the player must pick for the current question to be right. */
function correctChoice(pack: typeof demoPack, you: PlayerView): number {
  const q = pack.questions.find((x) => x.id === you.questionId)!;
  const correctText = q.options[q.correct]!;
  return you.options!.indexOf(correctText);
}

function tierKey(t: number | null): 1 | 2 | 3 {
  if (t === 1 || t === 2 || t === 3) return t;
  return 1;
}

describe('speedrun-trivia-ladder', () => {
  it('declares a flawless run to be worth 3500 points', () => {
    // 4 tier-1 @ 100*1.5 + 4 tier-2 @ 200*1.5 + 2 tier-3 @ 400*1.5 + 500 completion bonus.
    expect(rules.rewardBounds(demoPack)).toEqual({ maxPointsPerPlayer: 3500 });
  });

  it('pays a flawless run its full, speed-bonused score', () => {
    const r = freshGame();
    r.send({ kind: 'join', player: 'you', seed: 7, at: OPENS + 1_000 });
    const startAt = OPENS + 2_000;
    r.send({ kind: 'action', player: 'you', action: { kind: 'start' }, at: startAt });
    let you = r.playerView('you') as PlayerView;

    let expected = 0;
    for (let rung = 1; rung <= TOTAL_RUNGS; rung++) {
      const tier = tierKey(you.tier);
      const budget = demoPack.tierSpecs[tier].budgetMs;
      const answeredAt = you.deadline! - budget; // answer instantly
      const choice = correctChoice(demoPack, you);
      r.send({ kind: 'action', player: 'you', action: { kind: 'answer', questionId: you.questionId!, chosen: choice }, at: answeredAt });
      expected += Math.round(demoPack.tierSpecs[tier].points * 1.5);
      you = r.playerView('you') as PlayerView;
    }
    expect(you.status).toBe('done');
    expect(you.completed).toBe(true);
    expect(you.bestScore).toBe(expected + demoPack.completionBonus);
    expect(r.pointsFor('you')).toBe(expected + demoPack.completionBonus);
    expect(you.bestScore).toBe(3500);
  });

  it('soft-fails on a wrong answer: drops tier value but keeps climbing', () => {
    const r = freshGame();
    const you0 = joinStart(r, 'you');
    // Answer rung 1 wrong on purpose.
    const wrong = (correctChoice(demoPack, you0) + 1) % 4;
    const answeredAt = you0.deadline! - 1000;
    r.send({ kind: 'action', player: 'you', action: { kind: 'answer', questionId: you0.questionId!, chosen: wrong }, at: answeredAt });
    const you = r.playerView('you') as PlayerView;
    // Advanced to rung 2, still active, penalty shrank the effective tier of rung 2 (base 1 -> 1 max).
    expect(you.status).toBe('active');
    expect(you.rung).toBe(2);
    expect(you.runScore).toBe(0); // wrong answers earn nothing
    expect(you.lastRight).toBe(false);
  });

  it('awards the completion bonus even with tier drops once all rungs are reached', () => {
    const r = freshGame();
    joinStart(r, 'you');
    let you = r.playerView('you') as PlayerView;
    for (let rung = 1; rung <= TOTAL_RUNGS; rung++) {
      const wrong = (correctChoice(demoPack, you) + 1) % 4; // always wrong
      const answeredAt = you.deadline! - 1000;
      r.send({ kind: 'action', player: 'you', action: { kind: 'answer', questionId: you.questionId!, chosen: wrong }, at: answeredAt });
      you = r.playerView('you') as PlayerView;
    }
    expect(you.status).toBe('done');
    expect(you.completed).toBe(true);
    // No correct answers, but reached all 10 rungs -> completion bonus alone.
    expect(you.bestScore).toBe(demoPack.completionBonus);
  });

  it('refuses a second answer to the same question', () => {
    const r = freshGame();
    const you0 = joinStart(r, 'you');
    const choice = correctChoice(demoPack, you0);
    const at = you0.deadline! - 1000;
    r.send({ kind: 'action', player: 'you', action: { kind: 'answer', questionId: you0.questionId!, chosen: choice }, at });
    const second = r.send({
      kind: 'action',
      player: 'you',
      action: { kind: 'answer', questionId: you0.questionId!, chosen: (choice + 1) % 4 },
      at: at + 500,
    });
    expect(second).toEqual({ refuse: 'ladder.question_mismatch' });
  });

  it('refuses answers from someone who never joined', () => {
    const r = freshGame();
    expect(r.send({ kind: 'action', player: 'nobody', action: { kind: 'start' }, at: OPENS + 5_000 })).toEqual({
      refuse: 'ladder.not_joined',
    });
  });

  it('refuses malformed actions and out-of-range chosen indices', () => {
    expect(rules.parseAction({ kind: 'answer', questionId: 'q', chosen: 4 })).toBeNull();
    expect(rules.parseAction({ kind: 'answer', questionId: 'q', chosen: -1 })).toBeNull();
    expect(rules.parseAction({ kind: 'answer', questionId: '', chosen: 0 })).toBeNull();
    expect(rules.parseAction({ kind: 'bogus' })).toBeNull();
    expect(rules.parseAction(null)).toBeNull();
  });

  it('never puts the answer key where everyone can see it', () => {
    const r = freshGame();
    joinStart(r, 'you');
    const everything = JSON.stringify(r.publicView());
    for (const q of demoPack.questions) {
      expect(everything).not.toContain(`"correct":`);
      expect(everything).not.toContain(`"${q.id}":"${q.options[q.correct]}"`);
    }
    // The public view must not carry any question text or option content at all (those are per-player).
    expect(everything).not.toContain('"options"');
    expect(everything).not.toContain('"correct"');
    expect(everything).not.toContain('"said');
  });

  it('anti-grinding: only the best single run counts, replays never accumulate', () => {
    const r = freshGame();
    joinStart(r, 'you');

    // First run: answer everything instantly and correctly -> 3500.
    let you0 = r.playerView('you') as PlayerView;
    // Reuse the current active run (status active after joinStart).
    for (let rung = 1; rung <= TOTAL_RUNGS; rung++) {
      const tier = tierKey(you0.tier);
      const budget = demoPack.tierSpecs[tier].budgetMs;
      const at = you0.deadline! - budget;
      const choice = correctChoice(demoPack, you0);
      r.send({ kind: 'action', player: 'you', action: { kind: 'answer', questionId: you0.questionId!, chosen: choice }, at });
      you0 = r.playerView('you') as PlayerView;
    }
    expect(r.pointsFor('you')).toBe(3500);

    // Second, much weaker run: start again before the window closes, get everything wrong.
    r.send({ kind: 'action', player: 'you', action: { kind: 'start' }, at: OPENS + 100_000 });
    let you = r.playerView('you') as PlayerView;
    for (let rung = 1; rung <= TOTAL_RUNGS; rung++) {
      const wrong = (correctChoice(demoPack, you) + 1) % 4;
      const at = you.deadline! - 1000;
      r.send({ kind: 'action', player: 'you', action: { kind: 'answer', questionId: you.questionId!, chosen: wrong }, at });
      you = r.playerView('you') as PlayerView;
    }
    expect(you.bestScore).toBe(3500); // best still the first run
    // Cumulative allowance still equals the best single run, not 3500 + completion bonus.
    expect(r.pointsFor('you')).toBe(3500);
  });

  it('times out soft-fails and advances the ladder even without answering', () => {
    const r = freshGame();
    const you0 = joinStart(r, 'you');
    const deadline = you0.deadline!;
    r.advanceTo(deadline + 1);
    const you = r.playerView('you') as PlayerView;
    expect(you.status).toBe('active');
    expect(you.rung).toBe(2);
    expect(you.runScore).toBe(0);
  });

  it('settles active runs when the round closes', () => {
    const r = freshGame();
    joinStart(r, 'you');
    r.advanceTo(CLOSES + 1);
    expect(r.publicView().over).toBe(true);
    expect(rules.nextWakeAt(r.snapshot())).toBeNull();
  });

  it('replaying the same commands gives the same result', () => {
    const run = (seed: number) => {
      const r = freshGame(seed);
      const you0 = joinStart(r, 'you');
      const choice = correctChoice(demoPack, you0);
      r.send({ kind: 'action', player: 'you', action: { kind: 'answer', questionId: you0.questionId!, chosen: choice }, at: you0.deadline! - 1000 });
      return r.pointsFor('you');
    };
    expect(run(42)).toBe(run(42));
    expect(run(1)).toBe(run(1));
  });

  it('derives different private question orders per player (anti-cheat)', () => {
    const r = freshGame();
    r.send({ kind: 'join', player: 'a', seed: 1, at: OPENS + 1_000 });
    r.send({ kind: 'join', player: 'b', seed: 2, at: OPENS + 1_000 });
    r.send({ kind: 'action', player: 'a', action: { kind: 'start' }, at: OPENS + 2_000 });
    r.send({ kind: 'action', player: 'b', action: { kind: 'start' }, at: OPENS + 2_000 });
    const a = r.playerView('a') as PlayerView;
    const b = r.playerView('b') as PlayerView;
    expect(a.questionId).not.toBe(b.questionId);
    expect(a.options).not.toEqual(b.options);
  });
});
