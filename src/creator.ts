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

  const pack = loadPack();
  const tier = parseInt((document.getElementById('tier') as HTMLInputElement).value) as 1 | 2 | 3;
  const prompt = (document.getElementById('prompt') as HTMLInputElement).value.trim();
  const correctVal = (document.querySelector('input[name="correct"]:checked') as HTMLInputElement | null)?.value;

  if (!prompt || !correctVal) {
    alert('Please fill all fields and select a correct answer');
    return;
  }

  const options = Array.from(document.querySelectorAll('.option')).map((el) =>
    (el as HTMLInputElement).value.trim(),
  );

  if (options.some((o) => !o)) {
    alert('All options must be filled');
    return;
  }

  const question: Question = {
    id: generateQuestionId(),
    tier,
    prompt,
    options,
    correct: parseInt(correctVal),
  };

  pack.questions.push(question);
  savePack(pack);

  // Show success
  const msg = document.createElement('div');
  msg.className = 'alert alert-success';
  msg.textContent = '✓ Question added!';
  document.getElementById('add-form')?.parentElement?.prepend(msg);
  setTimeout(() => msg.remove(), 3000);

  // Reset form
  (document.getElementById('add-form') as HTMLFormElement)?.reset();
});

// ============ Bulk CSV Import ============
const dropZone = document.getElementById('drop-zone');
const csvInput = document.getElementById('csv-input') as HTMLInputElement;

dropZone?.addEventListener('click', () => csvInput?.click());

['dragover', 'drop'].forEach((event) => {
  dropZone?.addEventListener(event, (e) => {
    e.preventDefault();
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
      alert.textContent = `✓ Imported ${added} question${added !== 1 ? 's' : ''}`;
    }
    if (errors.length > 0) {
      const msg = errors.length > 3 ? `${errors.length} errors found` : errors.join('; ');
      alert.className = 'alert alert-warn';
      alert.textContent = `⚠ ${msg}`;
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
  const count = document.getElementById('question-count')!;

  count.textContent = pack.questions.length.toString();

  if (pack.questions.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted);">No questions yet.</p>';
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
            <span class="tier-badge tier-${q.tier}">Tier ${q.tier}</span>
          </div>
          <button class="btn btn-danger btn-sm" onclick="deleteQuestion('${q.id}')">Delete</button>
        </div>
        <div class="question-card-options">
          ${q.options.map((o: string, i: number) => `<div>${String.fromCharCode(65 + i)}. ${escapeHtml(o)}${i === q.correct ? ' ✓' : ''}</div>`).join('')}
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
function refreshFreshnessPanel(): void {
  const pack = loadPack();
  const status = document.getElementById('pool-status')!;

  const counts = { 1: 0, 2: 0, 3: 0 };
  pack.questions.forEach((q) => {
    counts[q.tier as 1 | 2 | 3]++;
  });

  const tiers = [
    { tier: 1, name: 'Tier 1 (Warm-up)', icon: '🔥' },
    { tier: 2, name: 'Tier 2 (Climb)', icon: '⛰️' },
    { tier: 3, name: 'Tier 3 (Summit)', icon: '🏔️' },
  ];

  status.innerHTML = tiers
    .map(({ tier, name, icon }) => {
      const count = counts[tier as 1 | 2 | 3];
      const ok = count >= MIN_QUESTIONS_PER_TIER;
      const poolClass = ok ? 'pool-ok' : count >= 3 ? 'pool-warn' : 'pool-danger';
      const poolLabel = ok ? '✓ Healthy' : count >= 3 ? '⚠ Thin' : '✗ Critically low';
      return `
        <div class="freshness-row">
          <div>${icon} ${name}</div>
          <span class="pool-indicator ${poolClass}">${count}/${MIN_QUESTIONS_PER_TIER} questions — ${poolLabel}</span>
        </div>
      `;
    })
    .join('');

  // Update metadata
  (document.getElementById('pack-title') as HTMLInputElement).value = pack.title;
  (document.getElementById('pack-id') as HTMLInputElement).value = pack.packId;
  (document.getElementById('rounds-played') as HTMLInputElement).value = pack.roundsPlayed.toString();

  // Update publish button state
  const canPublish = Object.values(counts).every((c) => c >= MIN_QUESTIONS_PER_TIER);
  const btn = document.getElementById('publish-btn') as HTMLButtonElement;
  btn.disabled = !canPublish;
  if (!canPublish) {
    btn.title = `Need at least ${MIN_QUESTIONS_PER_TIER} questions per tier`;
  }
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
  status.innerHTML = `✓ JSON downloaded: <code>${pack.packId}.json</code><br/>
    <small>Upload to a CORS-enabled server and load with: <code>?pack=https://your-server.com/${pack.packId}.json</code></small>`;
});

// ============ Utilities ============
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============ Init ============
// Expose deleteQuestion to window for onclick handlers
declare global {
  interface Window {
    deleteQuestion: (id: string) => void;
  }
}

window.deleteQuestion = deleteQuestion;
refreshQuestionsList();
