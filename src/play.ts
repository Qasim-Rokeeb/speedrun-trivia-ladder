import { createMockRoom, type Snapshot } from '@flayerlabs/gamemode-client';
import { rules, TOTAL_RUNGS, type Action, type Config, type PlayerView, type PublicView } from './game/rules.js';
import { demoPack } from './game/packs/demo.js';

const config: Config = demoPack;
const MY_ID = '0xyou';
const room = createMockRoom(rules, { config, player: MY_ID, lobbyMs: 800, roundMs: 180_000 });
const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('the page needs an #app element');
const rootEl: HTMLElement = app;

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
  const ms = Math.max(0, deadline - room.now());
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
  const balance = room.economy.current();
  const roundLeft = Math.max(0, Math.ceil((pub.closesAt - room.now()) / 1_000));
  const standings = pub.standings
    .map((s, i) => {
      const rankClass = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : '';
      return `<li class="${rankClass} ${s.player === MY_ID ? 'me' : ''}">
        <span class="rank">${i + 1}</span>
        <span class="name">${esc(s.player.slice(0, 8))}</span>
        <span class="led-score">${s.score.toLocaleString()}<em>pts</em></span>
      </li>`;
    })
    .join('');

  const tier = you?.tier ? tierKey(you.tier) : 2;
  const tierColor = TIER_RAW[tier];
  const tierGlow = TIER_GLOW[tier];
  const timer = you?.status === 'active' ? countdownParts(you.deadline) : null;

  let main = '';
  switch (you?.status) {
    case 'unjoined':
    case 'idle': {
      main = `
        <section class="neon-card glass intro" style="--neon:var(--tier2);--neon-glow:var(--tier2-glow)">
          <div class="eyebrow">${esc(pub.title)}</div>
          <h1><span class="accent">Speedrun</span><br/>Trivia Ladder</h1>
          <p class="sub">Climb a 10-rung ladder of escalating questions before the clock runs out. Answer fast and right to earn more — one wrong answer drops your tier, never the run.</p>
          <div class="stat-cards">
            <div class="stat-card stat-card--t1"><div class="stat-value">8s</div><div class="stat-label">Warm-up</div></div>
            <div class="stat-card stat-card--t2"><div class="stat-value">7s</div><div class="stat-label">Climb</div></div>
            <div class="stat-card stat-card--t3"><div class="stat-value">6s</div><div class="stat-label">Summit</div></div>
            <div class="stat-card stat-card--speed"><div class="stat-value">+50%</div><div class="stat-label">Speed</div></div>
          </div>
          <button class="btn btn-cta" data-start ${pub.over ? 'disabled' : ''}>${pub.over ? 'Round Closed' : 'Start the Climb'}</button>
        </section>`;
      break;
    }
    case 'active': {
      const circ = 2 * Math.PI * 42;
      const off = circ * (1 - (timer ? timer.pct / 100 : 1));
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
          <div class="timer-bar-wrap">
            <div class="timer-bar-fill" style="width:${timer ? timer.pct : 0}%;background:${tierColor};--timer-color:${tierColor}"></div>
          </div>
          <div class="timer-number ${tCls}" style="--timer-glow:${tierGlow}">${timer ? (timer.ms / 1000).toFixed(1) : '—'}</div>
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
      main = `
        <section class="neon-card glass end ${you.completed ? 'gold' : ''}" style="--neon:${you.completed ? 'var(--tier3)' : 'var(--tier2)'};--neon-glow:${you.completed ? 'var(--tier3-glow)' : 'var(--tier2-glow)'}">
          ${you.completed ? '<div class="tier-badge" style="--badge-color:var(--tier3);margin:0 auto 8px;display:flex;justify-content:center;width:max-content">🏔️ Summit Reached</div>' : '<div class="eyebrow">Run Complete</div>'}
          <h2 class="final-score">${final.toLocaleString()}</h2>
          <p class="sub" style="margin:0 0 12px"><b>Best this round: ${you.bestScore.toLocaleString()}</b> pts
            ${you.bestScore > 0 ? ` &middot; ≈ ${((you.bestScore * Number(balance.weiPerPoint)) / 1e18).toFixed(4)} ETH Allowance` : ''}
          </p>
          ${you.completed ? '<p class="confetti-text">🎉 You reached the top of the ladder!</p>' : ''}
          ${pub.over
            ? '<p class="sub" style="margin:0">The launch window has closed.</p>'
            : `<button class="btn btn-cta" data-start style="margin-top:16px">Climb Again ↻</button>`}
        </section>`;
      break;
    }
  }

  rootEl.innerHTML = `
    <div class="layout">
      ${ladderSpine(you?.status === 'active' ? you.rung : you?.status === 'done' ? TOTAL_RUNGS + 1 : 0)}
      <div class="main-stage">${main}</div>
      <aside class="neon-card glass leaderboard">
        <h3>Leaderboard</h3>
        <div class="led-meta"><span>${roundLeft}s left</span><span>${pub.standings.length} climber${pub.standings.length === 1 ? '' : 's'}</span></div>
        <ul class="standings">${standings || '<li class="empty">No climbers yet</li>'}</ul>
        <button class="btn btn-buy" data-buy ${balance.availableWei <= 0n ? 'disabled' : ''}>
          Claim ${(Number(balance.availableWei) / 1e18).toFixed(4)} ETH ➜</button>
      </aside>
    </div>`;
}

rootEl.addEventListener('click', (ev) => {
  const target = ev.target as HTMLElement;
  const start = target.closest('[data-start]');
  if (start) {
    lockAnswer = false;
    void room.send({ kind: 'start' } satisfies Action);
    return;
  }
  const buy = target.closest('[data-buy]');
  if (buy) {
    void room.economy.buy(room.economy.available());
    return;
  }
  const ans = target.closest('[data-answer]') as HTMLElement | null;
  if (ans && !lockAnswer) {
    const chosen = Number(ans.dataset.answer);
    const qid = ans.dataset.qid ?? '';
    lockAnswer = true;
    ans.classList.add('picked');
    for (const b of rootEl.querySelectorAll<HTMLElement>('[data-answer]')) b.style.pointerEvents = 'none';
    if (renderTimer) clearTimeout(renderTimer);
    renderTimer = setTimeout(() => render(), 320);
    void room.send({ kind: 'answer', questionId: qid, chosen } satisfies Action);
  }
});

room.subscribe((snapshot) => {
  lockAnswer = false;
  if (renderTimer) {
    latest = snapshot;
    return;
  }
  render(snapshot);
});
room.economy.subscribe(() => {
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
    }
    if (fillEl && t) fillEl.style.width = t.pct + '%';
  }
  const round = rootEl.querySelector<HTMLElement>('.led-meta span');
  if (round && latest) round.textContent = `${Math.max(0, Math.ceil((latest.publicView.closesAt - room.now()) / 1_000))}s left`;
  const buyBtn = rootEl.querySelector<HTMLButtonElement>('[data-buy]');
  if (buyBtn && latest) {
    const bal = room.economy.available();
    buyBtn.disabled = bal <= 0n;
    buyBtn.textContent = `Claim ${(Number(bal) / 1e18).toFixed(4)} ETH ➜`;
  }
}, 100);

window.addEventListener('pagehide', () => {
  clearInterval(clock);
  room.dispose();
});
