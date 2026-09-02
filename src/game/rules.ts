/**
 * Speedrun Trivia Ladder.
 *
 * A timed trivia gauntlet: each player races up a 10-rung ladder of escalating, tiered questions.
 * Speed and accuracy determine their score; the game server (this rules module) holds the answer
 * key and re-derives every score from raw player inputs.
 *
 * Trust model — the whole point:
 *   - The canonical answer key lives ONLY in server State. It is never in a view type.
 *   - A player sends only { questionId, chosen } (an option index). `decide` verifies against the
 *     key and never reveals it. `playerView` shows the player their own current question text and
 *     their own shuffled option order — private and per-player, so a leaked "press C" cheat-sheet
 *     does not transfer between players.
 *   - Timing is `command.at` (authoritative). Per-player deadlines are enforced server-side by
 *     wakes, so a modified client cannot claim impossible reaction times.
 *   - Only the best single run in a round counts toward allowance (anti-grinding). Points are
 *     settled at run end as the delta over the previous best, so replays can never accumulate.
 */

import { defineGame, type Decision, type Refusal } from '@flayerlabs/gamemode-spec';

export interface Question {
  id: string;
  /** Authored difficulty: 1 = easy, 2 = medium, 3 = hard. */
  tier: 1 | 2 | 3;
  prompt: string;
  /** Canonical option order (as authored). */
  options: string[];
  /** Index of the correct option in `options`. Never leaves this module. */
  correct: number;
}

export interface TierSpec {
  /** Base points for a correct answer on this tier. */
  points: number;
  /** Time budget per question on this tier, in ms. */
  budgetMs: number;
}

export interface Config {
  title: string;
  packId: string;
  questions: Question[];
  tierSpecs: Record<1 | 2 | 3, TierSpec>;
  /** Rung count per tier: [tier1 rungs, tier2 rungs, tier3 rungs]. */
  rungsPerTier: [number, number, number];
  /** Bonus for finishing all rungs, regardless of tier drops. */
  completionBonus: number;
  /** Top of the speed multiplier; a fast answer adds up to this fraction of base points. */
  speedBonusCap: number;
}

export interface PlayerRun {
  status: 'idle' | 'active' | 'done';
  /** Current rung, 1-based. 0 before the run starts. */
  rung: number;
  /** Cumulative penalties: +1 per wrong answer, feeds effectiveTier. */
  penalty: number;
  /** Points banked this run from correct answers (no completion bonus yet). */
  runScore: number;
  /** True when the run reached the top rung. */
  completed: boolean;
  /** The player's join seed, used to derive their private, per-player question order (anti-cheat). */
  joinSeed: number;
  /** Which replay of the round this run is (0-based). A fresh value each `start`. */
  runId: number;
  /** Absolute epoch ms when the current question must be answered, or null when not on one. */
  deadline: number | null;
  /** id of the current question, or null when not on a live question. */
  currentQuestion: string | null;
  /** Player-shuffled option order for the current question (text, as the player sees them). */
  options: string[] | null;
  /** Question ids already used this run, so one run never repeats a question. */
  used: string[];
  /** Raw answer trace [{questionId, chosen, at, right, points, speedBonus}] for forensics. */
  trace: { questionId: string; chosen: number; at: number; right: boolean; points?: number; speedBonus?: number }[];
  /** Best single-run score across all replays this round. This drives allowance. */
  bestScore: number;
}

export interface State {
  config: Config;
  seed: number;
  window: { opensAt: number; closesAt: number };
  over: boolean;
  players: Record<string, PlayerRun>;
}

export type Action =
  | { kind: 'start' }
  | { kind: 'answer'; questionId: string; chosen: number };

export type Event =
  | { t: 'started'; player: string; run: PlayerRun }
  | { t: 'advanced'; player: string; run: PlayerRun; awarded: number }
  | { t: 'run_end'; player: string; run: PlayerRun; awarded: number }
  | { t: 'round_over' };

export const TOTAL_RUNGS = 10;

function baseRungTier(config: Config, rung: number): 1 | 2 | 3 {
  const [t1, t2] = config.rungsPerTier;
  if (rung <= t1) return 1;
  if (rung <= t1 + t2) return 2;
  return 3;
}

function effectiveTier(base: 1 | 2 | 3, penalty: number): 1 | 2 | 3 {
  return Math.max(1, base - penalty) as 1 | 2 | 3;
}

/** Deterministic PRNG (mulberry32) seeded from a stable integer. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Fisher-Yates shuffle using the provided PRNG. Returns a new array. */
function shuffle<T>(items: readonly T[], rand: () => number): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = arr[i] as T;
    arr[i] = arr[j] as T;
    arr[j] = tmp;
  }
  return arr;
}

/** Pick a question for a player from a tier pool, never repeating one used this run. */
function pickQuestion(
  config: Config,
  tier: 1 | 2 | 3,
  used: string[],
  rand: () => number,
): { question: Question; options: string[] } {
  // Prefer an unused question of the requested tier.
  let pool = config.questions.filter((q) => q.tier === tier && !used.includes(q.id));
  // If a run is pushed into a low tier by penalties, there may not be enough left in that tier;
  // fall back to any unused question (of any tier) so a 10-rung run always has 10 distinct ones.
  if (pool.length === 0) {
    pool = config.questions.filter((q) => !used.includes(q.id));
  }
  const question = pool[Math.floor(rand() * pool.length)]!;
  const options = shuffle(question.options, rand);
  return { question, options };
}

/** A clean fresh run for a player. */
function freshRun(joinSeed: number): PlayerRun {
  return {
    status: 'idle',
    rung: 0,
    penalty: 0,
    runScore: 0,
    completed: false,
    joinSeed,
    runId: 0,
    deadline: null,
    currentQuestion: null,
    options: null,
    used: [],
    trace: [],
    bestScore: 0,
  };
}

/**
 * Begin the next rung for a run: pick a question, assign its deadline from `at`.
 * If the run is already past the top rung, mark it done (returns a done run).
 */
function nextRung(
  config: Config,
  seed: number,
  run: PlayerRun,
  at: number,
): PlayerRun {
  const nextRung = run.rung + 1;
  if (nextRung > TOTAL_RUNGS) {
    return { ...run, status: 'done', completed: true, deadline: null, currentQuestion: null, options: null, rung: TOTAL_RUNGS + 1 };
  }
  const base = baseRungTier(config, nextRung);
  const tier = effectiveTier(base, run.penalty);
  // Deterministic per player/run/rung, so the game replays identically yet every player sees a
  // different private question order and option shuffle.
  const rand = mulberry32(hash(`${seed}:${run.joinSeed}:${run.runId}:${nextRung}`) ^ hash(nextRung.toString() + ':' + run.runId + ':' + run.joinSeed));
  const { question, options } = pickQuestion(config, tier, run.used, rand);
  return {
    ...run,
    status: 'active',
    rung: nextRung,
    deadline: at + config.tierSpecs[tier].budgetMs,
    currentQuestion: question.id,
    options,
  };
}

/**
 * Score the current rung's answer for a player. Returns the run with rung advanced and points
 * banked, plus the right/wrong result and the per-question score.
 */
function scoreAnswer(
  config: Config,
  run: PlayerRun,
  questionId: string,
  chosen: number,
  at: number,
): { run: PlayerRun; right: boolean; questionScore: number; timedOut: boolean } {
  const question = config.questions.find((q) => q.id === questionId);
  const timedOut = run.deadline !== null && at > run.deadline;
  const alreadyAnswered = run.trace.some((t) => t.questionId === questionId);
  if (alreadyAnswered || timedOut) {
    return { run, right: false, questionScore: 0, timedOut: timedOut || alreadyAnswered };
  }
  // The player picks from their SHUFFLED option order; the canonical answer key is an index into
  // the authored order. Compare the chosen option's text against the correct option's text, so
  // the per-player shuffle can never leak or be exploited via position.
  const correctText = question !== undefined ? question.options[question.correct] : undefined;
  const right = question !== undefined && correctText !== undefined && run.options?.[chosen] === correctText;
  const base = baseRungTier(config, run.rung);
  const tier = effectiveTier(base, run.penalty);
  const spec = config.tierSpecs[tier];

  let questionScore = 0;
  let speedBonus = 0;
  let penalty = run.penalty;
  if (right) {
    const budgetMs = spec.budgetMs;
    const deadline = run.deadline ?? at + budgetMs;
    const timeRemaining = Math.max(0, deadline - at);
    const fraction = budgetMs > 0 ? Math.min(1, timeRemaining / budgetMs) : 0;
    const multi = 1 + fraction * config.speedBonusCap;
    questionScore = Math.round(spec.points * multi);
    speedBonus = questionScore - spec.points;
  } else {
    penalty = penalty + 1;
  }

  const advanced: PlayerRun = {
    ...run,
    rung: run.rung,
    penalty,
    runScore: run.runScore + questionScore,
    deadline: null,
    currentQuestion: null,
    options: null,
    used: [...run.used, questionId],
    trace: [...run.trace, { questionId, chosen, at, right, points: questionScore, speedBonus }],
  };
  return { run: advanced, right, questionScore, timedOut: false };
}

/** Settle a finished run, folding runScore into bestScore. Returns the updated run. */
function settleRun(config: Config, run: PlayerRun, completed: boolean): { run: PlayerRun; delta: number } {
  const done = run.rung >= TOTAL_RUNGS && completed;
  const score = done ? run.runScore + config.completionBonus : run.runScore;
  const newBest = Math.max(run.bestScore, score);
  // Award only the increase over what the player has already banked (bestScore). A later weaker
  // run awards a delta of 0, so replays can never accumulate points (anti-grinding).
  const delta = newBest - run.bestScore;
  const next: PlayerRun = {
    ...run,
    status: 'done',
    completed: done,
    bestScore: newBest,
    deadline: null,
    currentQuestion: null,
    options: null,
  };
  return { run: next, delta };
}

/** Apply soft-fail (wrong or timed-out) at the current rung: +penalty, advance, no points. */
function advanceWithPenalty(
  config: Config,
  seed: number,
  run: PlayerRun,
  at: number,
  questionId: string | null,
): PlayerRun {
  const baseRun: PlayerRun = {
    ...run,
    penalty: run.penalty + 1,
    deadline: null,
    currentQuestion: null,
    options: null,
    used: questionId !== null && !run.used.includes(questionId) ? [...run.used, questionId] : run.used,
    trace: run.trace,
  };
  return nextRung(config, seed, baseRun, at);
}

export const rules = defineGame<Config, State, Event, Action, PublicView, PlayerView>({
  id: 'speedrun-trivia-ladder',

  parseAction(input): Action | null {
    if (typeof input !== 'object' || input === null) return null;
    const obj = input as Record<string, unknown>;
    if (obj.kind === 'start') return { kind: 'start' };
    if (obj.kind === 'answer') {
      if (typeof obj.questionId !== 'string' || obj.questionId.length === 0) return null;
      if (typeof obj.chosen !== 'number' || !Number.isInteger(obj.chosen) || obj.chosen < 0 || obj.chosen > 3) {
        return null;
      }
      return { kind: 'answer', questionId: obj.questionId, chosen: obj.chosen };
    }
    return null;
  },

  initRound(config, seed, window) {
    return {
      config,
      seed,
      window: { opensAt: window.opensAt, closesAt: window.closesAt },
      over: false,
      players: {},
    };
  },

  decide(state, command): Decision<Event> | Refusal {
    const { config: cfg, seed } = state;
    const now = command.at;
    const finalize = (player: string, run: PlayerRun, completed: boolean): { events: Event[]; awards: AwardLike[] } => {
      const { run: settled, delta } = settleRun(cfg, run, completed);
      const awards: AwardLike[] = delta > 0 ? [{ player, points: delta }] : [];
      return { events: [{ t: 'run_end', player, run: settled, awarded: delta }], awards };
    };

    switch (command.kind) {
      case 'join': {
        if (state.players[command.player]) return { events: [] };
        return { events: [{ t: 'started', player: command.player, run: freshRun(command.seed) }] };
      }

      case 'leave':
        return { events: [] };

      case 'wake': {
        // Round close: settle every active or idle run with what they have banked.
        if (!state.over && now >= state.window.closesAt) {
          const events: Event[] = [{ t: 'round_over' }];
          const awards: AwardLike[] = [];
          const updated: Record<string, PlayerRun> = { ...state.players };
          for (const [player, run] of Object.entries(state.players)) {
            if (run.status === 'done') continue;
            const { run: settled, delta } = settleRun(cfg, run, false);
            updated[player] = settled;
            events.push({ t: 'run_end', player, run: settled, awarded: delta });
            if (delta > 0) awards.push({ player, points: delta });
          }
          return { events, awards };
        }
        // Player-question timeouts: soft-fail anyone whose deadline passed.
        const events: Event[] = [];
        const awards: AwardLike[] = [];
        const updated: Record<string, PlayerRun> = { ...state.players };
        for (const [player, run] of Object.entries(state.players)) {
          if (run.status !== 'active' || run.deadline === null || now < run.deadline) continue;
          const timed = advanceWithPenalty(cfg, seed, run, now, run.currentQuestion);
          const end = timed.rung > TOTAL_RUNGS;
          if (end) {
            // Reached the top via timeout on the last rung.
            const { run: settled, delta } = settleRun(cfg, { ...timed, completed: true }, true);
            updated[player] = settled;
            events.push({ t: 'run_end', player, run: settled, awarded: delta });
            if (delta > 0) awards.push({ player, points: delta });
          } else {
            updated[player] = timed;
            events.push({ t: 'advanced', player, run: timed, awarded: 0 });
          }
        }
        return { events, awards };
      }

      case 'action': {
        const run = state.players[command.player];
        if (state.over) return { refuse: 'ladder.window_closed' };
        if (!run) return { refuse: 'ladder.not_joined' };

        if (command.action.kind === 'start') {
          if (run.status === 'active') return { refuse: 'ladder.already_active' };
          const fresh = freshRun(run.joinSeed);
          // Each replay is a new run with a different question order (anti-memorisation grinding).
          const withRunId = { ...fresh, runId: run.runId + 1 };
          const started = nextRung(cfg, seed, withRunId, now);
          // Preserve accumulated best across replays; evolve merges it in.
          return { events: [{ t: 'started', player: command.player, run: started }] };
        }

        // answer (from here on command.action is the answer kind)
        if (command.action.kind !== 'answer') {
          return { refuse: 'ladder.malformed' };
        }
        const actionAnswer = command.action;
        if (run.status !== 'active') return { refuse: 'ladder.not_active' };
        if (run.currentQuestion !== actionAnswer.questionId) return { refuse: 'ladder.question_mismatch' };
        if (run.trace.some((t) => t.questionId === actionAnswer.questionId)) {
          return { refuse: 'ladder.already_answered' };
        }
        if (run.deadline !== null && now > run.deadline) return { refuse: 'ladder.timed_out' };

        const scored = scoreAnswer(cfg, run, actionAnswer.questionId, actionAnswer.chosen, now);
        if (scored.timedOut) return { refuse: 'ladder.timed_out' };

        const advanced = scored.run;
        const provisioned = nextRung(cfg, seed, advanced, now);
        if (provisioned.status === 'done') {
          const { events, awards } = finalize(command.player, provisioned, true);
          return { events, awards };
        }
        return {
          events: [
            { t: 'advanced', player: command.player, run: provisioned, awarded: scored.questionScore },
          ],
        };
      }
    }
  },

  evolve(state, event) {
    switch (event.t) {
      case 'started': {
        const was = state.players[event.player];
        const merged: PlayerRun = {
          ...freshRun(event.run.joinSeed),
          ...event.run,
          bestScore: was?.bestScore ?? 0,
        };
        return { ...state, players: { ...state.players, [event.player]: merged } };
      }
      case 'advanced':
        return { ...state, players: { ...state.players, [event.player]: event.run } };
      case 'run_end':
        return { ...state, players: { ...state.players, [event.player]: event.run } };
      case 'round_over':
        return { ...state, over: true };
    }
  },

  publicView(state): PublicView {
    const standings = Object.entries(state.players)
      .filter(([, run]) => run.status !== 'idle')
      .map(([player, run]) => ({
        player,
        score: run.bestScore,
        rung: run.status === 'done' ? (run.completed ? TOTAL_RUNGS : run.rung - 1) : run.rung,
      }))
      .sort((a, b) => b.score - a.score || a.player.localeCompare(b.player));
    return {
      title: state.config.title,
      over: state.over,
      closesAt: state.window.closesAt,
      totalRungs: TOTAL_RUNGS,
      standings,
    };
  },

  playerView(state, player): PlayerView {
    const run = state.players[player];
    if (!run) {
      return {
        status: 'unjoined',
        rung: 0,
        totalRungs: TOTAL_RUNGS,
        tier: null,
        runScore: 0,
        bestScore: 0,
        deadline: null,
        questionId: null,
        question: null,
        options: null,
        completed: false,
        lastRight: null,
        stats: { correctCount: 0, speedBonusTotal: 0, basePointsTotal: 0, finalTier: 1 },
      };
    }
    const currentBase = run.status === 'active' ? baseRungTier(state.config, run.rung) : baseRungTier(state.config, Math.min(run.rung, TOTAL_RUNGS));
    const currentTier = effectiveTier(currentBase, run.penalty);

    let correctCount = 0;
    let speedBonusTotal = 0;
    let basePointsTotal = 0;

    for (const t of run.trace) {
      if (t.right) {
        correctCount++;
        const sb = t.speedBonus ?? 0;
        const pts = t.points ?? 0;
        speedBonusTotal += sb;
        basePointsTotal += (pts - sb);
      }
    }

    return {
      status: run.status === 'idle' ? 'idle' : run.status === 'done' ? 'done' : 'active',
      rung: run.status === 'done' ? Math.min(run.rung, TOTAL_RUNGS) : run.rung,
      totalRungs: TOTAL_RUNGS,
      tier: run.status === 'active' ? currentTier : null,
      runScore: run.runScore,
      bestScore: run.bestScore,
      deadline: run.deadline,
      // questionId is just an identifier (safe to show); the authoritative answer key never is.
      questionId: run.currentQuestion,
      question: run.currentQuestion !== null
        ? state.config.questions.find((q) => q.id === run.currentQuestion)!.prompt
        : null,
      options: run.options,
      completed: run.completed,
      lastRight: run.trace.length ? run.trace[run.trace.length - 1]!.right : null,
      stats: {
        correctCount,
        speedBonusTotal,
        basePointsTotal,
        finalTier: currentTier,
      },
    };
  },

  nextWakeAt(state) {
    if (state.over) return null;
    if (state.window.closesAt === undefined) return null;
    let earliest = state.window.closesAt;
    for (const run of Object.values(state.players)) {
      if (run.status === 'active' && run.deadline !== null) {
        if (run.deadline < earliest) earliest = run.deadline;
      }
    }
    return earliest;
  },

  rewardBounds(config) {
    const [t1, t2] = config.rungsPerTier;
    const t3 = TOTAL_RUNGS - t1 - t2;
    const maxMulti = 1 + config.speedBonusCap;
    const maxPerRun =
      t1 * config.tierSpecs[1].points * maxMulti +
      t2 * config.tierSpecs[2].points * maxMulti +
      t3 * config.tierSpecs[3].points * maxMulti +
      config.completionBonus;
    return { maxPointsPerPlayer: Math.ceil(maxPerRun) };
  },
});

interface AwardLike {
  player: string;
  points: number;
}

export interface PublicView {
  title: string;
  over: boolean;
  closesAt: number;
  totalRungs: number;
  standings: { player: string; score: number; rung: number }[];
}

export interface PlayerView {
  status: 'unjoined' | 'idle' | 'active' | 'done';
  rung: number;
  totalRungs: number;
  /** Effective tier of the current question (1-3) or null when not on one. */
  tier: number | null;
  runScore: number;
  bestScore: number;
  deadline: number | null;
  questionId: string | null;
  question: string | null;
  options: string[] | null;
  completed: boolean;
  lastRight: boolean | null;
  stats: {
    correctCount: number;
    speedBonusTotal: number;
    basePointsTotal: number;
    finalTier: number;
  };
}
