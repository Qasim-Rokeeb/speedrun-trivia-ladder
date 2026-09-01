/**
 * Creator Authoring Interface
 * - Add questions one at a time or bulk import via CSV
 * - Manage pack metadata and pool depth
 * - Validate freshness (minimum 7 questions per tier)
 * - Generate and download JSON pack file
 *
 * Storage: All data stored in localStorage under key 'creatorPack'
 */

import type { Config, Question } from './game/rules.js';

interface CreatorPack {
  title: string;
  packId: string;
  questions: Question[];
  roundsPlayed: number;
  lastUpdated: number;
}

const MIN_QUESTIONS_PER_TIER = 7;
const STORAGE_KEY = 'creatorPack';

// Load pack from localStorage or initialize empty
function loadPack(): CreatorPack {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      console.warn('Failed to parse saved pack, starting fresh');
    }
  }
  return {
    title: 'My Trivia Pack',
    packId: `pack-${Date.now()}`,
    questions: [],
    roundsPlayed: 0,
    lastUpdated: Date.now(),
  };
}

function savePack(pack: CreatorPack): void {
  pack.lastUpdated = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pack));
}

function generateQuestionId(): string {
  return `q${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createSampleQuestion(tier: 1 | 2 | 3, prompt: string, options: [string, string, string, string], correct: number): Question {
  return {
    id: generateQuestionId(),
    tier,
    prompt,
    options,
    correct,
  };
}

function generateSamplePack(): CreatorPack {
  const samples: Question[] = [
    createSampleQuestion(1, 'What is the main job of a crypto wallet?', ['Store private keys and sign transactions', 'Mine blocks automatically', 'Issue new tokens', 'Run a validator node'], 0),
    createSampleQuestion(1, 'What does ETH usually pay for on Ethereum?', ['Gas fees for transactions', 'A protocol dividend', 'An ownership share', 'A stablecoin reserve'], 0),
    createSampleQuestion(1, 'What is a smart contract?', ['Self-executing code on-chain', 'A centralised exchange wallet', 'A browser extension', 'A token listing page'], 0),
    createSampleQuestion(1, 'Which term best describes a token launch with public participation and no private whitelist?', ['Fair launch', 'Staking lockup', 'KYC gate', 'Private round'], 0),
    createSampleQuestion(1, 'What is a common purpose of a memecoin?', ['Community culture and speculation', 'Proof-of-work mining', 'Stable asset reserve', 'Cross-chain validator voting'], 0),
    createSampleQuestion(1, 'Which chain is commonly used for Ethereum-compatible activity?', ['Base', 'Solana', 'Bitcoin Core', 'Filecoin'], 0),
    createSampleQuestion(1, 'What does a stablecoin try to minimise?', ['Price volatility', 'Network latency', 'Validator slashing', 'Airdrop size'], 0),
    createSampleQuestion(2, 'What is an AMM in DeFi?', ['An automated market maker using liquidity pools', 'A yield farming dashboard', 'A cold-storage wallet', 'A block explorer'], 0),
    createSampleQuestion(2, 'Which transaction pattern is most commonly used when bridging assets between chains?', ['Lock on one chain and mint on another', 'Directly copy a wallet secret', 'Replace ENS names with ETH', 'Rebase the token supply'], 0),
    createSampleQuestion(2, 'What does ERC-20 standardise?', ['A token interface on Ethereum', 'A consensus algorithm', 'A wallet signature method', 'A mining reward schedule'], 0),
    createSampleQuestion(2, 'What is the usual purpose of a vesting schedule?', ['To release tokens over time', 'To reduce gas fees', 'To create a validator', 'To enforce airdrop claim limits'], 0),
    createSampleQuestion(2, 'Why do projects often use a spend cap or allowlist?', ['To gate access and manage risk', 'To double the treasury', 'To bypass wallets', 'To reduce block size'], 0),
    createSampleQuestion(2, 'Which is the most accurate description of a launchpad?', ['A platform that supports token launches and participant access', 'A hardware wallet brand', 'A stablecoin custodian', 'A chain migration service'], 0),
    createSampleQuestion(2, 'What is a typical risk of low-liquidity markets?', ['Large price swings from small trades', 'No slashing penalties', 'Guaranteed stable returns', 'Permanent network outage'], 0),
    createSampleQuestion(3, 'Which of these best describes game-mode style gating?', ['Rules verify actions on the server and award points based on trusted state', 'Browser code directly sets scores', 'Wallets submit answers in the UI', 'The client chooses the correct answer'], 0),
    createSampleQuestion(3, 'Why are server-side rules important in a launch game?', ['They keep score and validation deterministic and trusted', 'They hide the UI from players', 'They replace the wallet', 'They remove the leaderboard'], 0),
    createSampleQuestion(3, 'In a trivia ladder, why is answer secrecy important?', ['So players do not learn the answer key before the reveal', 'So the UI can load faster', 'So every player sees the same question', 'So gas fees become lower'], 0),
    createSampleQuestion(3, 'What is the most important purpose of replaying the same input sequence?', ['To prove the state and score are deterministic', 'To count wallet approvals', 'To reduce token supply', 'To issue rewards from the browser'], 0),
    createSampleQuestion(3, 'Which statement best matches a fixed launch round?', ['The schedule stays anchored to the authored times even when wakes are delayed', 'The server clock changes every second', 'Answers are accepted without validation', 'Players can claim any allowance amount'], 0),
    createSampleQuestion(3, 'Which feature helps prevent anti-grinding?', ['Best-run scoring and per-player seeded question order', 'Unlimited retries with no timer', 'Browser-side reward selection', 'A static leaderboard from the client'], 0),
    createSampleQuestion(3, 'What is a good reason to keep wallets outside game code?', ['It keeps the game logic pure and avoids trusted wallet access in creator code', 'It lets the client sign transactions automatically', 'It prevents launch timers from closing', 'It guarantees no scoring mismatch'], 0),
  ];

  return {
    title: 'Test Launch Pack',
    packId: `test-pack-${Date.now()}`,
    questions: samples,
    roundsPlayed: 0,
    lastUpdated: Date.now(),
  };
}

// ============ Tab Switching ============
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const tab = (btn as HTMLElement).dataset.tab;
    if (!tab) return;

    // Hide all, show this
    document.querySelectorAll('.tab-content').forEach((el) => el.classList.remove('active'));
    document.getElementById(tab)?.classList.add('active');

    // Update button states
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    // Refresh UI for certain tabs
    if (tab === 'manage') refreshQuestionsList();
    if (tab === 'freshness') refreshFreshnessPanel();
  });
});

// ============ Add Single Question ============
document.getElementById('add-form')?.addEventListener('submit', (e) => {
  e.preventDefault();

  const errorEl = document.getElementById('add-form-error')!;
  const errorText = document.getElementById('add-form-error-text')!;

  function showError(msg: string): void {
    errorText.textContent = msg;
    errorEl.style.display = 'flex';
  }
  errorEl.style.display = 'none';

  const pack = loadPack();
  const tier = parseInt((document.getElementById('tier') as HTMLInputElement).value) as 1 | 2 | 3;
  const prompt = (document.getElementById('prompt') as HTMLInputElement).value.trim();
  const correctVal = (document.querySelector('input[name="correct"]:checked') as HTMLInputElement | null)?.value;

  if (!prompt) return showError('Question text is required.');
  if (!correctVal) return showError('Mark one answer as correct by clicking its tile.');

  const options = Array.from(document.querySelectorAll('.option')).map((el) =>
    (el as HTMLInputElement).value.trim(),
  );

  if (options.some((o) => !o)) return showError('All four option fields must be filled in.');

  const question: Question = {
    id: generateQuestionId(),
    tier,
    prompt,
    options,
    correct: parseInt(correctVal),
  };

  pack.questions.push(question);
  savePack(pack);

  // Show inline success
  const msg = document.createElement('div');
  msg.className = 'alert alert-success';
  msg.innerHTML = '<span class="alert-icon">✓</span><span>Question added successfully!</span>';
  document.getElementById('add-form')?.parentElement?.prepend(msg);
  setTimeout(() => msg.remove(), 3000);

  // Reset form
  (document.getElementById('add-form') as HTMLFormElement)?.reset();
  // Refresh count in tab
  for (const id of ['question-count', 'question-count-2']) {
    const el = document.getElementById(id);
    if (el) el.textContent = pack.questions.length.toString();
  }
});

function setSampleFeedbackVisible(visible: boolean): void {
  const el = document.getElementById('sample-feedback');
  if (!el) return;
  el.style.display = visible ? 'block' : 'none';
}

// ============ Sample Test Pack ============
document.getElementById('generate-sample-btn')?.addEventListener('click', () => {
  const pack = generateSamplePack();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pack));

  const btn = document.getElementById('generate-sample-btn') as HTMLButtonElement | null;
  if (btn) {
    btn.textContent = 'Sample Pack Ready';
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = 'Generate Test Pack';
      btn.disabled = false;
    }, 2000);
  }

  setSampleFeedbackVisible(true);
  refreshQuestionsList();
  refreshFreshnessPanel();
  const status = document.getElementById('publish-status');
  if (status) {
    status.className = 'alert alert-success';
    status.innerHTML = `<span class="alert-icon">✓</span><span>Test pack created: <strong>${pack.packId}</strong>. Open the preview to test it.</span>`;
  }
});

document.getElementById('open-preview-btn')?.addEventListener('click', () => {
  window.open('/preview.html', 'preview', 'width=1200,height=800');
});

document.getElementById('switch-to-freshness-btn')?.addEventListener('click', () => {
  document.querySelectorAll('.tab-btn').forEach((btn) => btn.classList.toggle('active', (btn as HTMLElement).dataset.tab === 'freshness'));
  document.querySelectorAll('.tab-content').forEach((el) => el.classList.toggle('active', el.id === 'freshness'));
  refreshFreshnessPanel();
});

// ============ Bulk CSV Import ============
const dropZone = document.getElementById('drop-zone');
const csvInput = document.getElementById('csv-input') as HTMLInputElement;

dropZone?.addEventListener('click', () => csvInput?.click());

['dragover', 'dragleave', 'drop'].forEach((event) => {
  dropZone?.addEventListener(event, (e) => {
    e.preventDefault();
    if (event === 'dragover') dropZone.classList.add('drag-over');
    else dropZone.classList.remove('drag-over');
  });
});

dropZone?.addEventListener('drop', (e) => {
  const files = (e as DragEvent).dataTransfer?.files;
  if (files?.[0]) handleCSVFile(files[0]);
});

csvInput?.addEventListener('change', (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) handleCSVFile(file);
});

function handleCSVFile(file: File): void {
  const reader = new FileReader();
  reader.onload = (e) => {
    const csv = e.target?.result as string;
    const lines = csv.split('\n').filter((l) => l.trim());
    const pack = loadPack();
    let added = 0;
    let errors: string[] = [];

    lines.forEach((line, idx) => {
      const parts = line.split(',').map((p) => p.trim());
      if (parts.length !== 7) {
        errors.push(`Line ${idx + 1}: Expected 7 fields, got ${parts.length}`);
        return;
      }

      const [prompt, tierStr, ...optionsAndCorrect] = parts;
      const correct = optionsAndCorrect.pop() ?? '';
      const options = optionsAndCorrect;
      const tier = parseInt(tierStr ?? '');

      if (!prompt || ![1, 2, 3].includes(tier) || options.some((o) => !o) || !correct) {
        errors.push(`Line ${idx + 1}: Invalid data`);
        return;
      }

      const question: Question = {
        id: generateQuestionId(),
        tier: tier as 1 | 2 | 3,
        prompt,
        options,
        correct: parseInt(correct),
      };

      if (question.correct < 0 || question.correct > 3) {
        errors.push(`Line ${idx + 1}: Correct index must be 0–3`);
        return;
      }

      pack.questions.push(question);
      added++;
    });

    savePack(pack);

    const alert = document.getElementById('import-alert')!;
    if (added > 0) {
      alert.className = 'alert alert-success';
      alert.innerHTML = `<span class="alert-icon">✓</span><span>Imported ${added} question${added !== 1 ? 's' : ''}</span>`;
    }
    if (errors.length > 0) {
      const msg = errors.length > 3 ? `${errors.length} rows had errors` : errors.join('; ');
      alert.className = 'alert alert-warn';
      alert.innerHTML = `<span class="alert-icon">⚠</span><span>${msg}</span>`;
    }

    csvInput.value = '';
    setTimeout(() => (alert.textContent = ''), 4000);
    refreshQuestionsList();
  };
  reader.readAsText(file);
}

// ============ Manage Questions List ============
function refreshQuestionsList(): void {
  const pack = loadPack();
  const container = document.getElementById('questions-list')!;
  // Update both count elements (tab badge + manage panel header)
  for (const id of ['question-count', 'question-count-2']) {
    const el = document.getElementById(id);
    if (el) el.textContent = pack.questions.length.toString();
  }

  if (pack.questions.length === 0) {
    container.innerHTML = '<div class="q-empty">No questions yet.<br/>Add some from the <strong>Add Question</strong> tab.</div>';
    return;
  }

  container.innerHTML = pack.questions
    .sort((a, b) => a.tier - b.tier)
    .map(
      (q) =>
        `<div class="question-card">
        <div class="question-card-header">
          <div>
            <div class="question-card-title">${escapeHtml(q.prompt)}</div>
            <span class="tier-badge tier-${q.tier}" style="margin-top:6px;display:inline-flex">Tier ${q.tier}</span>
          </div>
          <div class="question-card-actions">
            <button class="btn btn-danger btn-sm" onclick="deleteQuestion('${q.id}')">Delete</button>
          </div>
        </div>
        <div class="question-card-options">
          ${q.options.map((o: string, i: number) =>
            `<div class="question-card-option ${i === q.correct ? 'correct' : ''}">
              <span class="q-key">${String.fromCharCode(65 + i)}</span>
              ${escapeHtml(o)}${i === q.correct ? ' ✓' : ''}
            </div>`
          ).join('')}
        </div>
      </div>`,
    )
    .join('');
}

function deleteQuestion(id: string): void {
  if (!confirm('Delete this question?')) return;
  const pack = loadPack();
  pack.questions = pack.questions.filter((q) => q.id !== id);
  savePack(pack);
  refreshQuestionsList();
}

// ============ Freshness Panel ============

/**
 * The recommended pool size per tier scales with rounds played.
 * Every 5 rounds the target grows by 3 questions, nudging creators
 * to keep feeding the pack as their launch gets popular.
 * The hard publish gate stays at MIN_QUESTIONS_PER_TIER regardless.
 */
function recommendedPoolSize(roundsPlayed: number): number {
  return MIN_QUESTIONS_PER_TIER + Math.floor(roundsPlayed / 5) * 3;
}

/** Switch to the Add Question tab and pre-select the given tier. */
function switchToAddWithTier(tier: 1 | 2 | 3): void {
  document.querySelectorAll('.tab-content').forEach((el) => el.classList.remove('active'));
  document.getElementById('add')?.classList.add('active');
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
  document.querySelector('.tab-btn[data-tab="add"]')?.classList.add('active');
  const tierSelect = document.getElementById('tier') as HTMLSelectElement | null;
  if (tierSelect) {
    tierSelect.value = String(tier);
    // Focus the prompt textarea so the creator can start typing immediately
    (document.getElementById('prompt') as HTMLTextAreaElement | null)?.focus();
  }
}

// Expose for inline onclick handlers
window.switchToAddWithTier = switchToAddWithTier;

function refreshFreshnessPanel(): void {
  const pack = loadPack();
  const status = document.getElementById('pool-status')!;

  const counts = { 1: 0, 2: 0, 3: 0 };
  pack.questions.forEach((q) => {
    counts[q.tier as 1 | 2 | 3]++;
  });

  const recommended = recommendedPoolSize(pack.roundsPlayed);

  const tiers = [
    { tier: 1, name: 'Tier 1 — Warm-up', icon: '🔥' },
    { tier: 2, name: 'Tier 2 — Climb',   icon: '⛰️' },
    { tier: 3, name: 'Tier 3 — Summit',  icon: '🏔️' },
  ];

  status.innerHTML = tiers
    .map(({ tier, name, icon }) => {
      const count = counts[tier as 1 | 2 | 3];
      const belowGate        = count < MIN_QUESTIONS_PER_TIER;
      const belowRecommended = count < recommended && !belowGate;
      const healthy          = !belowGate && !belowRecommended;

      const poolClass = belowGate
        ? (count >= 3 ? 'pool-warn' : 'pool-bad')
        : belowRecommended ? 'pool-warn' : 'pool-ok';

      const poolLabel = `${count} / ${recommended}`;

      let meta: string;
      let cta = '';

      if (belowGate) {
        const needed = MIN_QUESTIONS_PER_TIER - count;
        meta = `Need ${needed} more to unlock publishing`;
        cta = `<button class="btn btn-secondary btn-sm" style="margin-top:8px" onclick="switchToAddWithTier(${tier})">+ Add Tier ${tier} questions →</button>`;
      } else if (belowRecommended) {
        const needed = recommended - count;
        meta = `${needed} below recommended — players may see repeats after ${pack.roundsPlayed} rounds`;
        cta = `<button class="btn btn-secondary btn-sm" style="margin-top:8px" onclick="switchToAddWithTier(${tier})">+ Add more Tier ${tier} questions →</button>`;
      } else {
        meta = pack.roundsPlayed === 0
          ? 'Healthy — enough variation for random selection'
          : `Healthy for ${pack.roundsPlayed} rounds played`;
      }

      return `
        <div class="pool-row">
          <div style="flex:1;min-width:0">
            <div class="pool-row-label">${icon} ${name}</div>
            <div class="pool-row-meta">${meta}</div>
            ${cta}
          </div>
          <span class="pool-indicator ${poolClass}" style="align-self:flex-start;margin-left:16px">${poolLabel}</span>
        </div>
      `;
    })
    .join('');

  // Rounds-played nudge — shown when pool is healthy but starting to get stale
  if (pack.roundsPlayed >= 5) {
    const allHealthy = Object.values(counts).every((c) => c >= recommended);
    if (!allHealthy) {
      const nudge = document.createElement('div');
      nudge.className = 'alert alert-warn';
      nudge.style.marginTop = '16px';
      nudge.innerHTML = `<span class="alert-icon">⚠</span><span>This pack has run <strong>${pack.roundsPlayed} rounds</strong>. Regular players may have seen most questions — consider adding new ones before your next launch.</span>`;
      status.appendChild(nudge);
    }
  }

  // Update metadata fields
  (document.getElementById('pack-title') as HTMLInputElement).value = pack.title;
  (document.getElementById('pack-id') as HTMLInputElement).value = pack.packId;
  (document.getElementById('rounds-played') as HTMLInputElement).value = pack.roundsPlayed.toString();

  // Hard gate: publish only unlocked when every tier meets the minimum
  const canPublish = Object.values(counts).every((c) => c >= MIN_QUESTIONS_PER_TIER);
  const btn = document.getElementById('publish-btn') as HTMLButtonElement;
  btn.disabled = !canPublish;
  btn.title = canPublish ? '' : `Need at least ${MIN_QUESTIONS_PER_TIER} questions per tier to publish`;
}

// ============ Preview / Playtest ============
document.getElementById('preview-btn')?.addEventListener('click', () => {
  const pack = loadPack();
  const counts = { 1: 0, 2: 0, 3: 0 };
  pack.questions.forEach((q) => {
    counts[q.tier as 1 | 2 | 3]++;
  });

  if (Object.values(counts).some((c) => c < MIN_QUESTIONS_PER_TIER)) {
    alert(`Need at least ${MIN_QUESTIONS_PER_TIER} questions per tier to preview`);
    return;
  }

  // Open preview in a new window
  window.open('/preview.html', 'preview', 'width=1200,height=800');
});

// ============ Publish / Generate JSON ============
document.getElementById('publish-btn')?.addEventListener('click', () => {
  const pack = loadPack();

  // Update metadata
  pack.title = (document.getElementById('pack-title') as HTMLInputElement).value || pack.title;
  pack.packId = (document.getElementById('pack-id') as HTMLInputElement).value || pack.packId;

  // Validate
  const counts = { 1: 0, 2: 0, 3: 0 };
  pack.questions.forEach((q) => {
    counts[q.tier as 1 | 2 | 3]++;
  });

  if (Object.values(counts).some((c) => c < MIN_QUESTIONS_PER_TIER)) {
    alert(`Need at least ${MIN_QUESTIONS_PER_TIER} questions per tier`);
    return;
  }

  // Build Config
  const config: Config = {
    title: pack.title,
    packId: pack.packId,
    questions: pack.questions,
    completionBonus: 500,
    speedBonusCap: 0.5,
    rungsPerTier: [4, 4, 2],
    tierSpecs: {
      1: { points: 100, budgetMs: 8000 },
      2: { points: 200, budgetMs: 7000 },
      3: { points: 400, budgetMs: 6000 },
    },
  };

  // Increment rounds played
  pack.roundsPlayed++;
  pack.title = config.title;
  pack.packId = config.packId;
  savePack(pack);

  // Download JSON
  const json = JSON.stringify(config, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${pack.packId}.json`;
  a.click();
  URL.revokeObjectURL(url);

  // Show success
  const status = document.getElementById('publish-status')!;
  status.className = 'alert alert-success';
  status.innerHTML = `<span class="alert-icon">✓</span><span>JSON downloaded: <strong>${pack.packId}.json</strong><br/>
    Upload to a CORS-enabled server and load with <code>?pack=https://your-server.com/${pack.packId}.json</code></span>`;
});

// ============ Utilities ============
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============ Init ============
declare global {
  interface Window {
    deleteQuestion: (id: string) => void;
    switchToAddWithTier: (tier: 1 | 2 | 3) => void;
  }
}

window.deleteQuestion = deleteQuestion;
refreshQuestionsList();
