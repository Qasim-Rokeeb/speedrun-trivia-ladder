import { createMockRoom, type Snapshot } from '@flayerlabs/gamemode-client';
import { rules, TOTAL_RUNGS, type Action, type Config, type PlayerView, type PublicView } from './game/rules.js';
import { demoPack } from './game/packs/demo.js';

const MY_ID = '0xyou';
const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('the page needs an #app element');
const rootEl: HTMLElement = app;

// Module-level state (set after async load)
let config: Config = demoPack;
let room: ReturnType<typeof createMockRoom> | null = null;

/**
 * Validates that a Config object has the required structure for the game.
 * Returns true if valid, false otherwise.
 */
function isValidConfig(obj: unknown): obj is Config {
  if (typeof obj !== 'object' || obj === null) return false;
  const cfg = obj as Record<string, unknown>;
  
  // Check required top-level fields
  if (typeof cfg.title !== 'string' || !cfg.title) return false;
  if (typeof cfg.packId !== 'string' || !cfg.packId) return false;
  if (!Array.isArray(cfg.questions)) return false;
  if (cfg.questions.length === 0) return false;
  
  // Validate each question
  for (const q of cfg.questions) {
    if (typeof q !== 'object' || q === null) return false;
    const question = q as Record<string, unknown>;
    if (typeof question.id !== 'string' || !question.id) return false;
    const tier = (question.tier as unknown) as number;
    if (![1, 2, 3].includes(tier)) return false;
    if (typeof question.prompt !== 'string' || !question.prompt) return false;
    if (!Array.isArray(question.options) || question.options.length !== 4) return false;
    if (question.options.some((opt) => typeof opt !== 'string')) return false;
    if (typeof question.correct !== 'number' || question.correct < 0 || question.correct > 3) return false;
  }
  
  // Validate tierSpecs
  if (typeof cfg.tierSpecs !== 'object' || cfg.tierSpecs === null) return false;
  const specs = cfg.tierSpecs as Record<string, unknown>;
  for (const tier of [1, 2, 3]) {
    const spec = specs[tier] as Record<string, unknown> | undefined;
    if (!spec || typeof spec.points !== 'number' || typeof spec.budgetMs !== 'number') return false;
  }
  
  // Validate rungsPerTier
  if (!Array.isArray(cfg.rungsPerTier) || cfg.rungsPerTier.length !== 3) return false;
  if (cfg.rungsPerTier.some((r) => typeof r !== 'number' || r <= 0)) return false;
  
  // Validate numeric fields
  if (typeof cfg.completionBonus !== 'number' || cfg.completionBonus < 0) return false;
  if (typeof cfg.speedBonusCap !== 'number' || cfg.speedBonusCap <= 0) return false;
  
  return true;
}

/**
 * Load custom pack from URL parameter (?pack=url), preview mode, or use demo pack.
 * Returns a promise resolving to the Config to use.
 */
async function loadConfig(): Promise<Config> {
  const params = new URLSearchParams(window.location.search);
  
  // Check for preview mode (creator testing)
  if (params.has('preview')) {
    const preview = sessionStorage.getItem('previewConfig');
    if (preview) {
      try {
        const config = JSON.parse(preview);
        if (isValidConfig(config)) {
          console.log(`Loaded preview pack: ${config.packId}`);
          sessionStorage.removeItem('previewConfig'); // Clean up
          return config;
        }
      } catch (err) {
        console.warn('Failed to load preview pack:', err);
      }
    }
    return demoPack;
  }
  
  const packUrl = params.get('pack');
  
  if (!packUrl) {
    // No custom pack: use demo
    return demoPack;
  }
  
  try {
    // Fetch the custom pack
    const response = await fetch(packUrl);
    if (!response.ok) {
      console.warn(`Failed to load pack from ${packUrl}: HTTP ${response.status}`);
      return demoPack;
    }
    
    const data = await response.json();
    
    // Validate the pack structure
    if (!isValidConfig(data)) {
      console.warn(`Custom pack from ${packUrl} failed validation. Using demo pack.`, data);
      return demoPack;
    }
    
    console.log(`Loaded custom pack: ${data.packId} with ${data.questions.length} questions`);
    return data;
  } catch (err) {
    console.warn(`Error loading custom pack from ${packUrl}:`, err);
    return demoPack;
  }
}

/**
 * Fire an answer by index (0–3). Used by both click and keyboard handlers.
 */
function fireAnswer(chosen: number): void {
  if (lockAnswer) return;
  const tiles = rootEl.querySelectorAll<HTMLElement>('[data-answer]');
  const ans = tiles[chosen] as HTMLElement | undefined;
  if (!ans) return;
  const qid = ans.dataset.qid ?? '';

  lockAnswer = true;
  ans.classList.add('picked');
  for (const b of tiles) {
    (b as HTMLButtonElement).disabled = true;
    b.style.pointerEvents = 'none';
  }
  void room!.send({ kind: 'answer', questionId: qid, chosen } satisfies Action);
}

/**
 * Initialize the game with the loaded config.
 */
async function initGame(): Promise<void> {
  config = await loadConfig();
  room = createMockRoom(rules, { config, player: MY_ID, lobbyMs: 800, roundMs: 180_000 });

  // Set up all event listeners after room is created
  rootEl.addEventListener('click', (ev) => {
    const target = ev.target as HTMLElement;
    const start = target.closest('[data-start]');
    if (start) {
      lockAnswer = false;
      void room!.send({ kind: 'start' } satisfies Action);
      return;
    }
    const buy = target.closest('[data-buy]');
    if (buy) {
      void room!.economy.buy(room!.economy.available());
      return;
    }
    const ans = target.closest('[data-answer]') as HTMLElement | null;
    if (ans && !lockAnswer) {
      fireAnswer(Number(ans.dataset.answer));
    }
  });

  // ── Task 1: A/B/C/D keyboard shortcuts ──────────────────────────────────
  document.addEventListener('keydown', (ev) => {
    // Only fire when a question is active and no modifier keys are held
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    // Don't steal keys when user is typing in an input/textarea
    const tag = (ev.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    const map: Record<string, number> = { a: 0, b: 1, c: 2, d: 3 };
    const idx = map[ev.key.toLowerCase()];
    if (idx === undefined) return;

    // Only active when tiles are present (question screen)
    const tiles = rootEl.querySelectorAll<HTMLElement>('[data-answer]');
    if (!tiles.length) return;

    ev.preventDefault();

    // Visual flash on the key badge before firing
    const tile = tiles[idx];
    if (tile && !lockAnswer) {
      tile.classList.add('key-flash');
      setTimeout(() => tile.classList.remove('key-flash'), 150);
      fireAnswer(idx);
    }
  });

  room!.subscribe((snapshot) => {
    const snap = snapshot as Snapshot<PublicView, PlayerView>;
    const you = snap.playerView;
    const prevYou = latest?.playerView;

    // Feedback Flash logic: if we advanced rungs or finished, show feedback for the previous question
    if (prevYou?.status === 'active' && you && (you.rung > prevYou.rung || you.status === 'done')) {
      const lastRight = you.lastRight;
      const pickedBtn = rootEl.querySelector<HTMLElement>(`.answer-tile.picked`);
      
      if (pickedBtn) {
        pickedBtn.classList.remove('picked');
        pickedBtn.classList.add(lastRight ? 'correct' : 'wrong');
        
        if (!lastRight) {
          rootEl.querySelector('.question-card')?.classList.add('screen-shake');
        } else {
          // Floating Score effect
          const anchor = document.getElementById('float-anchor');
          if (anchor) {
            const floater = document.createElement('div');
            floater.className = 'float-score';
            floater.textContent = `+${you.runScore - prevYou.runScore}`;
            anchor.appendChild(floater);
            setTimeout(() => floater.remove(), 800);
          }
        }
      }

      // Delay render of next question/screen for the feedback duration
      if (renderTimer) clearTimeout(renderTimer);
      renderTimer = setTimeout(() => {
        renderTimer = null;
        lockAnswer = false;
        render(snap);
      }, 450);
    } else {
      lockAnswer = false;
      if (renderTimer) {
        latest = snap;
        return;
      }
      render(snap);
    }
  });
  room!.economy.subscribe(() => {
    if (renderTimer) return;
    render();
  });

  // Live timer tick
  const clock = setInterval(() => {
    if (!latest) return;
    const pv = latest.playerView;
    if (pv?.status === 'active' && pv.deadline !== null) {
      const timerEl = rootEl.querySelector<HTMLElement>('.timer-number');
      const fillEl = rootEl.querySelector<HTMLElement>('.timer-bar-fill');
      const t = countdownParts(pv.deadline);
      if (timerEl && t) {
        timerEl.textContent = (t.ms / 1000).toFixed(1);
        timerEl.className = 'timer-number ' + timerClass(t.ms);
        
        // Auto-lock on timeout
        if (t.ms <= 0 && !lockAnswer) {
          lockAnswer = true;
          for (const b of rootEl.querySelectorAll<HTMLElement>('[data-answer]')) {
            (b as HTMLButtonElement).disabled = true;
          }
        }
      }
      if (fillEl && t) fillEl.style.width = t.pct + '%';
    }
    const round = rootEl.querySelector<HTMLElement>('.led-meta span');
    if (round && latest) round.textContent = `${Math.max(0, Math.ceil((latest.publicView.closesAt - room!.now()) / 1_000))}s left`;
    const buyBtn = rootEl.querySelector<HTMLButtonElement>('[data-buy]');
    if (buyBtn && latest) {
      const bal = room!.economy.available();
      buyBtn.disabled = bal <= 0n;
      buyBtn.textContent = `Claim ${(Number(bal) / 1e18).toFixed(4)} ETH ➜`;
    }
  }, 100);

  window.addEventListener('pagehide', () => {
    clearInterval(clock);
    room!.dispose();
  });

  // Initial render
  render();
}

// Start the game
initGame().catch((err) => {
  console.error('Failed to initialize game:', err);
  rootEl.innerHTML = `<div class="neon-card glass" style="padding:40px;max-width:600px;margin:40px auto"><h2>Error Loading Game</h2><p>${esc(String(err))}</p><p>Using demo pack instead...</p></div>`;
  // Retry with demo pack
  window.location.search = '';
});

function tierKey(t: number | null): 1 | 2 | 3 {
  if (t === 1 || t === 2 || t === 3) return t;
  return 1;
}

const TIER_COLORS: Record<number, string> = { 1: 'var(--tier1)', 2: 'var(--tier2)', 3: 'var(--tier3)' };
const TIER_RAW: Record<number, string> = { 1: '#00f0ff', 2: '#c084fc', 3: '#fb923c' };
const TIER_GLOW: Record<number, string> = { 1: 'var(--tier1-glow)', 2: 'var(--tier2-glow)', 3: 'var(--tier3-glow)' };
const TIER_LABEL: Record<number, string> = { 1: 'Warm-Up', 2: 'Climb', 3: 'Summit' };

let latest: Snapshot<PublicView, PlayerView> | null = null;
let lockAnswer = false;
let renderTimer: ReturnType<typeof setTimeout> | null = null;
// Track the last rendered screen so we can trigger fade-in only on screen changes
let prevScreen: string | null = null;

/**
 * Task 3: Animates a numeric element from 0 up to `target` over `durationMs`.
 */
function countUp(el: HTMLElement, target: number, durationMs = 900): void {
  const start = performance.now();
  const step = (now: number) => {
    const progress = Math.min((now - start) / durationMs, 1);
    // Ease-out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(eased * target).toLocaleString();
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function ladderSpine(rung: number): string {
  const rows: string[] = [];
  const t1 = config.rungsPerTier[0];
  const t2 = config.rungsPerTier[0] + config.rungsPerTier[1];

  for (let i = TOTAL_RUNGS; i >= 1; i--) {
    const tier = i <= t1 ? 1 : i <= t2 ? 2 : 3;
    const reached = i < rung || (i === rung && rung === TOTAL_RUNGS + 1);
    const active = i === rung && rung <= TOTAL_RUNGS;
    const color = TIER_RAW[tier];
    const stateClass = active ? 'active' : reached ? 'completed' : 'future';
    rows.push(
      `<div class="spine-rung ${stateClass}" style="--rung-color:${color}">
        <span class="spine-rung-num">${i}</span>
        <span class="climber-dot" style="--rung-color:${color}"></span>
      </div>`,
    );
    /*
     * The container is column-reverse, so the LAST pushed child renders at the TOP.
     * We iterate rung 10 → 1. A divider pushed right after rung 10 lands just above it
     * (i.e. at the top), so we place the "Summit" label + divider immediately after rung 10.
     * The "Climb" label lands after rung 5 (bottom of the summit zone), and the
     * "Warm-up" label is pushed last so it renders at the very bottom.
     */
    if (i === TOTAL_RUNGS) {
      rows.push(`<div class="spine-tier-label" style="--label-color:${TIER_RAW[3]}">Summit</div>`);
      rows.push(`<div class="spine-tier-sep" style="--sep-color:${TIER_RAW[3]}"></div>`);
    }
    if (i === t1 + 1) {
      rows.push(`<div class="spine-tier-label" style="--label-color:${TIER_RAW[2]}">Climb</div>`);
      rows.push(`<div class="spine-tier-sep" style="--sep-color:${TIER_RAW[2]}"></div>`);
    }
  }
  rows.push(`<div class="spine-tier-label" style="--label-color:${TIER_RAW[1]}">Warm-up</div>`);
  return `<div class="ladder-spine" aria-label="Ladder position rung ${Math.min(rung, TOTAL_RUNGS)} of ${TOTAL_RUNGS}">
    <div class="ladder-spine-inner">${rows.join('')}</div>
  </div>`;
}

function countdownParts(deadline: number | null): { ms: number; pct: number; budgetMs: number } | null {
  if (!latest || deadline === null) return null;
  const pv = latest.playerView;
  const budgetMs = pv?.tier ? config.tierSpecs[tierKey(pv.tier)].budgetMs : 8000;
  const ms = Math.max(0, deadline - room!.now());
  const pct = budgetMs > 0 ? Math.min(100, (ms / budgetMs) * 100) : 0;
  return { ms, pct, budgetMs };
}

function timerClass(ms: number): string {
  if (ms < 1000) return 'danger';
  if (ms < 3000) return 'warning';
  return '';
}

function render(snapshot = latest): void {
  if (!snapshot) return;
  latest = snapshot;
  const { publicView: pub, playerView: you } = snapshot;
  const balance = room!.economy.current();
  const roundLeft = Math.max(0, Math.ceil((pub.closesAt - room!.now()) / 1_000));
  const hasAllowance = balance.availableWei > 0n;
  const standings = pub.standings.length
    ? pub.standings
        .map((s, i) => {
          const rankClass = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : '';
          return `<li class="${rankClass} ${s.player === MY_ID ? 'me' : ''}">
            <span class="rank">${i + 1}</span>
            <span class="name">${esc(s.player.slice(0, 8))}</span>
            <span class="led-score">${s.score.toLocaleString()}<em>pts</em></span>
          </li>`;
        })
        .join('')
    : '<li class="empty">No climbers yet — be the first to start</li>';

  const tier = you?.tier ? tierKey(you.tier) : 2;
  const tierColor = TIER_RAW[tier];
  const tierGlow = TIER_GLOW[tier];
  const timer = you?.status === 'active' ? countdownParts(you.deadline) : null;

  // ── Task 2: Determine screen key for transition detection ──────────────
  const screenKey = you?.status ?? 'idle';

  let main = '';
  switch (you?.status) {
    case 'unjoined':
    case 'idle': {
      // ── Pull tier timings from config ──────────────────────────────────
      const t1s = (config.tierSpecs[1].budgetMs / 1000).toFixed(0);
      const t2s = (config.tierSpecs[2].budgetMs / 1000).toFixed(0);
      const t3s = (config.tierSpecs[3].budgetMs / 1000).toFixed(0);
      const speedPct = `+${Math.round(config.speedBonusCap * 100)}%`;

      // Freshness badge for custom packs
      let freshnessBadge = '';
      if (config.packId !== 'demo') {
        try {
          const saved = localStorage.getItem('creatorPack');
          if (saved) {
            const pack = JSON.parse(saved);
            if (pack.packId === config.packId) {
              const daysSince = Math.floor((Date.now() - (pack.lastUpdated || 0)) / 86_400_000);
              if (daysSince === 0) {
                freshnessBadge = '<span class="rule-pill accent-green"><span class="pill-icon">✨</span>Updated today</span>';
              } else if (daysSince < 7) {
                freshnessBadge = `<span class="rule-pill"><span class="pill-icon">🔄</span>Updated ${daysSince}d ago</span>`;
              }
            }
          }
        } catch (_) { /* ignore */ }
      }

      main = `
        <section class="neon-card glass intro" style="--neon:var(--tier2);--neon-glow:var(--tier2-glow)">
          <div class="intro-eyebrow">
            <span class="dot"></span>
            <span class="label">${esc(config.packId.toUpperCase())}</span>
            <span class="sep">·</span>
            <span class="live-label">LIVE</span>
          </div>
          <h1><span class="grad">${esc(pub.title)}</span></h1>
          <p class="intro-desc">Climb a 10-rung ladder of escalating questions before the clock runs out. Answer fast and right to earn more — one wrong answer drops your tier, never the run.</p>
          <div class="rule-pills">
            <span class="rule-pill"><span class="pill-icon">🏔️</span>10 rungs · 3 tiers</span>
            <span class="rule-pill accent-t1"><span class="pill-icon">⏱</span>Speed bonus +${Math.round(config.speedBonusCap * 100)}%</span>
            <span class="rule-pill accent-green"><span class="pill-icon">↻</span>Wrong = keep climbing, earn less</span>
            <span class="rule-pill accent-t2"><span class="pill-icon">🏅</span>+${config.completionBonus} completion bonus</span>
            ${freshnessBadge}
          </div>
          <div class="stat-header">Time per question by tier</div>
          <div class="stat-cards">
            <div class="stat-card stat-card--t1">
              <div class="stat-icon">🔥</div>
              <div class="stat-value">${t1s}s</div>
              <div class="stat-label">Warm-up</div>
            </div>
            <div class="stat-card stat-card--t2">
              <div class="stat-icon">⛰️</div>
              <div class="stat-value">${t2s}s</div>
              <div class="stat-label">Climb</div>
            </div>
            <div class="stat-card stat-card--t3">
              <div class="stat-icon">🏔️</div>
              <div class="stat-value">${t3s}s</div>
              <div class="stat-label">Summit</div>
            </div>
            <div class="stat-card stat-card--speed">
              <div class="stat-icon">⚡</div>
              <div class="stat-value">${speedPct}</div>
              <div class="stat-label">Speed Bonus</div>
            </div>
          </div>
          <button class="btn btn-cta" data-start ${pub.over ? 'disabled' : ''}>
            ${pub.over ? 'Round Closed' : 'Start the Climb'}<span class="cta-arrow">${pub.over ? '' : '→'}</span>
          </button>
        </section>`;
      break;
    }
    case 'active': {
      const tCls = timer ? timerClass(timer.ms) : '';
      main = `
        <section class="neon-card glass question-card" style="--neon:${tierColor};--neon-glow:${tierGlow}">
          <div class="question-header">
            <span class="tier-badge" style="--badge-color:${tierColor}">${TIER_LABEL[tier]} &middot; Tier ${tier}</span>
            <span class="rung-counter">RUNG ${you.rung} / ${TOTAL_RUNGS}</span>
          </div>
          <div class="question-prompt">${esc(you.question ?? '')}</div>
          <div class="answer-grid" data-feedback>
            ${(you.options ?? []).map((opt, i) =>
              `<button class="answer-tile" data-answer="${i}" data-qid="${esc(you.questionId ?? '')}" style="--neon:${tierColor};--neon-glow:${tierGlow}" ${lockAnswer ? 'disabled' : ''}>
                <span class="tile-key">${String.fromCharCode(65 + i)}</span>
                <span>${esc(opt)}</span>
              </button>`,
            ).join('')}
          </div>
          <div class="keyboard-hint">Press A · B · C · D to answer</div>
          <div class="timer-wrap">
            <div class="timer-bar-wrap">
              <div class="timer-bar-fill" style="width:${timer ? timer.pct : 0}%;background:${tierColor};--timer-color:${tierColor}"></div>
            </div>
            <div class="timer-number ${tCls}" style="--timer-glow:${tierGlow}">${timer ? (timer.ms / 1000).toFixed(1) : '—'}</div>
          </div>
        </section>
        <div class="score-hud" style="position:relative">
          <span class="score-label">Score</span>
          <span class="score-value">${you.runScore}</span>
          <span class="score-best">best ${you.bestScore}</span>
          <span id="float-anchor"></span>
        </div>`;
      break;
    }
    case 'done': {
      const final = you.completed ? you.runScore + config.completionBonus : you.runScore;
      const stats = you.stats;
      // ── Task 3: final-score uses data-countup so we can animate it after render ──
      main = `
        <section class="neon-card glass end ${you.completed ? 'gold' : ''}" style="--neon:${you.completed ? 'var(--tier3)' : 'var(--tier2)'};--neon-glow:${you.completed ? 'var(--tier3-glow)' : 'var(--tier2-glow)'}">
          ${you.completed ? '<div class="tier-badge" style="--badge-color:var(--tier3);margin:0 auto 8px;display:flex;justify-content:center;width:max-content">🏔️ Summit Reached</div>' : '<div class="eyebrow">Run Complete</div>'}
          <h2 class="final-score" data-countup="${final}">0</h2>
          
          <div class="run-stats-grid">
            <div class="run-stat">
              <div class="run-stat-val">${stats.correctCount}/10</div>
              <div class="run-stat-lab">Accuracy</div>
            </div>
            <div class="run-stat">
              <div class="run-stat-val">+${stats.speedBonusTotal}</div>
              <div class="run-stat-lab">Speed Bonus</div>
            </div>
            <div class="run-stat">
              <div class="run-stat-val">Tier ${stats.finalTier}</div>
              <div class="run-stat-lab">Final Rank</div>
            </div>
          </div>

          <p class="end-sub"><b>Best this round: ${you.bestScore.toLocaleString()}</b> pts${you.bestScore > 0 ? ` · ≈ ${((you.bestScore * Number(balance.weiPerPoint)) / 1e18).toFixed(4)} ETH` : ''}</p>
          ${you.completed ? '<p class="confetti-text">🎉 Completion Bonus +500 Included!</p>' : ''}
          ${pub.over
            ? '<p class="end-sub" style="margin-top:4px">The launch window has closed.</p>'
            : `<button class="btn btn-cta" data-start style="margin-top:20px">Climb Again <span class="cta-arrow">↻</span></button>`}
        </section>`;
      break;
    }
  }

  rootEl.innerHTML = `
    <div class="layout">
      ${ladderSpine(you?.status === 'active' ? you.rung : you?.status === 'done' ? TOTAL_RUNGS + 1 : 0)}
      <div class="main-stage">${main}</div>
      <aside class="neon-card glass leaderboard" data-open="true">
        <h3>Leaderboard</h3>
        <div class="led-meta">
          <span class="round-countdown ${roundLeft <= 30 ? 'urgent' : ''}">${roundLeft}s left</span>
          <span>${pub.standings.length} climber${pub.standings.length === 1 ? '' : 's'}</span>
        </div>
        <ul class="standings">${standings}</ul>
        <button class="btn btn-buy" data-buy ${!hasAllowance ? 'disabled' : ''} ${!hasAllowance ? 'style="display:none"' : ''}>
          Claim ${(Number(balance.availableWei) / 1e18).toFixed(4)} ETH ➜</button>
      </aside>
    </div>`;

  const leaderboardEl = rootEl.querySelector<HTMLElement>('.leaderboard');
  const leaderboardHeading = leaderboardEl?.querySelector('h3');
  if (leaderboardEl && leaderboardHeading) {
    const syncLeaderboardState = () => {
      if (window.innerWidth <= 900) {
        leaderboardEl.dataset.open = 'false';
        return;
      }
      if (window.innerWidth <= 1023) {
        leaderboardEl.dataset.open = 'true';
      }
    };

    leaderboardHeading.onclick = () => {
      const compact = window.innerWidth <= 1023;
      if (!compact) return;
      leaderboardEl.dataset.open = leaderboardEl.dataset.open === 'true' ? 'false' : 'true';
    };
    syncLeaderboardState();
    window.addEventListener('resize', syncLeaderboardState, { once: false });
  }

  // ── Task 2: Fade-in animation on screen change ────────────────────────
  const isNewScreen = screenKey !== prevScreen;
  if (isNewScreen) {
    const stage = rootEl.querySelector<HTMLElement>('.main-stage');
    if (stage) {
      stage.classList.remove('screen-fade-in');
      // Force reflow so the class re-triggers the animation
      void stage.offsetWidth;
      stage.classList.add('screen-fade-in');
    }
    prevScreen = screenKey;
  }

  // ── Task 3: Trigger count-up on end screen (only on screen entry) ─────
  const countupEl = rootEl.querySelector<HTMLElement>('[data-countup]');
  if (countupEl) {
    const target = Number(countupEl.dataset.countup);
    if (isNewScreen) {
      // Fresh entry into end screen — animate from 0
      countUp(countupEl, target, 1000);
    } else {
      // Already on end screen (e.g. leaderboard refresh): show final value immediately
      countupEl.textContent = target.toLocaleString();
    }
  }
}
