/* ============================================================
   KARGAS — app.js
   Workout tracker | LocalStorage persistence
   ============================================================ */

'use strict';

// ── STATE ────────────────────────────────────────────────────
const STORAGE_KEY = 'kargas_data';

let state = {
  activeCategory: 'Costas',
  exercises: {},   // { id: { name, category, logs: [], collapsed: bool } }
};

// Timer runtime
let timerInterval = null;
let timerRemaining = 0; // seconds
// ── STORAGE ──────────────────────────────────────────────────
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state.exercises = parsed.exercises || {};
    }
  } catch (e) {
    console.warn('Kargas: falha ao carregar dados.', e);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ exercises: state.exercises }));
  } catch (e) {
    console.warn('Kargas: falha ao salvar dados.', e);
  }
}

// ── HELPERS ──────────────────────────────────────────────────
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function difficultyLabel(v) {
  return { easy: 'Fácil', medium: 'Médio', hard: 'Difícil' }[v] || v;
}

function difficultyClass(v) {
  return { easy: 'badge-easy', medium: 'badge-medium', hard: 'badge-hard' }[v] || '';
}

// Returns ISO date string of most recent log, or '' if none
function lastLogDate(ex) {
  if (!ex.logs || ex.logs.length === 0) return '';
  return ex.logs.reduce((best, log) => {
    const d = log.date || '';
    return d > best ? d : best;
  }, '');
}

function lastLog(ex) {
  if (!ex.logs || ex.logs.length === 0) return null;
  return ex.logs.reduce((best, log) => {
    if (!best) return log;
    // prefer later date, then later ts
    if ((log.date || '') > (best.date || '')) return log;
    if ((log.date || '') === (best.date || '')) return (log.ts || 0) > (best.ts || 0) ? log : best;
    return best;
  }, null);
}

function personalRecord(ex) {
  if (!ex.logs || ex.logs.length === 0) return null;
  // choose log with highest weight, fallback to highest (weight * reps)
  return ex.logs.reduce((best, log) => {
    if (!best) return log;
    const w1 = best.weight || 0;
    const w2 = log.weight || 0;
    if (w2 > w1) return log;
    if (w2 === w1) {
      const s1 = (best.reps || 0) * (best.weight || 0);
      const s2 = (log.reps || 0) * (log.weight || 0);
      return s2 > s1 ? log : best;
    }
    return best;
  }, null);
}

// ── SORT: by last log date desc, then by name asc ─────────────
function sortedExercises(category) {
  return Object.values(state.exercises)
    .filter(ex => ex.category === category)
    .sort((a, b) => {
      const da = lastLogDate(a);
      const db = lastLogDate(b);
      if (db !== da) return db.localeCompare(da); // more recent first
      return a.name.localeCompare(b.name);        // alphabetical fallback
    });
}

// ── RENDER ───────────────────────────────────────────────────
function render() {
  const list  = document.getElementById('exerciseList');
  const empty = document.getElementById('emptyState');

  const exercises = sortedExercises(state.activeCategory);

  list.innerHTML = '';

  if (exercises.length === 0) {
    empty.classList.add('visible');
    return;
  }

  empty.classList.remove('visible');
  exercises.forEach(ex => list.appendChild(buildCard(ex)));
}

function buildCard(ex) {
  const isExpanded = !ex.collapsed; // default: expanded

  const card = document.createElement('div');
  card.className = 'exercise-card' + (isExpanded ? ' expanded' : '');
  card.dataset.id = ex.id;

  // ── Header (accordion trigger)
  const header = document.createElement('div');
  header.className = 'card-header';
  header.setAttribute('role', 'button');
  header.setAttribute('aria-expanded', String(isExpanded));

  // Last log summary text
  const last = lastLogDate(ex);
  const lastText = last ? `Última carga: ${formatDate(last)}` : 'Sem registros';

  header.innerHTML = `
    <div class="card-header-left">
      <div class="card-chevron">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M2 4.5L7 9.5L12 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="card-title-wrap">
        <span class="card-title">${escapeHtml(ex.name)}</span>
        <span class="card-last-log">${lastText}</span>
      </div>
    </div>
    <div class="card-header-right">
      <button class="btn-remove" data-remove="${ex.id}">Remover</button>
    </div>
  `;

  // add PR badge next to title if present
  const pr = personalRecord(ex);
  if (pr) {
    const titleWrap = header.querySelector('.card-title-wrap');
    const prEl = document.createElement('span');
    prEl.className = 'card-pr';
    prEl.textContent = `${pr.weight || '—'}kg x ${pr.reps || '—'}`;
    titleWrap.querySelector('.card-title').after(prEl);
  }

  // ── Collapsible body
  const body = document.createElement('div');
  body.className = 'card-body';

  const form    = buildLogForm(ex);
  const history = buildHistory(ex);

  body.appendChild(form);
  body.appendChild(history);

  card.appendChild(header);
  card.appendChild(body);

  // Accordion click (header, but not remove button)
  header.addEventListener('click', (e) => {
    if (e.target.closest('.btn-remove')) return;
    toggleCard(ex.id, card);
  });

  // Remove button
  header.querySelector('[data-remove]').addEventListener('click', (e) => {
    e.stopPropagation();
    removeExercise(ex.id);
  });

  return card;
}

function toggleCard(exId, cardEl) {
  const ex = state.exercises[exId];
  if (!ex) return;

  ex.collapsed = !ex.collapsed;
  saveState();

  cardEl.classList.toggle('expanded', !ex.collapsed);
  cardEl.querySelector('.card-header').setAttribute('aria-expanded', String(!ex.collapsed));
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function buildLogForm(ex) {
  const wrap = document.createElement('div');
  wrap.className = 'log-form';

  wrap.innerHTML = `
    <div class="form-row three">
      <div class="form-group">
        <label for="date-${ex.id}">Data</label>
        <input type="date" id="date-${ex.id}" name="date" value="${todayISO()}" />
      </div>
      <div class="form-group">
        <label for="reps-${ex.id}">Repetições</label>
        <input type="number" id="reps-${ex.id}" name="reps" placeholder="12" min="1" max="999" inputmode="numeric" />
      </div>
      <div class="form-group">
        <label for="weight-${ex.id}">Peso (kg)</label>
        <input type="number" id="weight-${ex.id}" name="weight" placeholder="40" min="0" step="0.5" inputmode="decimal" />
      </div>
    </div>
    <div class="form-row" style="align-items:flex-end">
      <div class="form-group">
        <label for="diff-${ex.id}">Dificuldade</label>
        <select id="diff-${ex.id}" name="difficulty">
          <option value="easy">Fácil</option>
          <option value="medium" selected>Médio</option>
          <option value="hard">Difícil</option>
        </select>
      </div>
      <div class="form-group checkbox-group">
        <label class="checkbox-row">
          <input type="checkbox" id="personal-${ex.id}" name="personal" />
          <span>Ajuda do personal</span>
        </label>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group full">
        <label for="obs-${ex.id}">Observações <span style="font-weight:400;text-transform:none;letter-spacing:0">(opcional)</span></label>
        <textarea id="obs-${ex.id}" name="obs" placeholder="Ex: aumentar carga na próxima…"></textarea>
      </div>
    </div>
  `;

  // Difficulty color feedback
  const diffSelect = wrap.querySelector(`#diff-${ex.id}`);
  diffSelect.addEventListener('change', function () {
    this.className = `diff-${this.value}`;
  });

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn-save';
  saveBtn.textContent = 'Salvar Carga';
  saveBtn.addEventListener('click', () => saveLog(ex.id, wrap));
  wrap.appendChild(saveBtn);

  const repeatBtn = document.createElement('button');
  repeatBtn.className = 'btn-repeat-last';
  repeatBtn.type = 'button';
  repeatBtn.textContent = 'Repetir última';
  repeatBtn.addEventListener('click', () => repeatLast(ex.id, wrap));
  wrap.appendChild(repeatBtn);

  return wrap;
}

function buildHistory(ex) {
  const section = document.createElement('div');
  section.className = 'history-section';

  const titleEl = document.createElement('div');
  titleEl.className = 'history-title';
  titleEl.textContent = `Histórico (${ex.logs.length})`;
  section.appendChild(titleEl);

  if (ex.logs.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'history-empty';
    empty.textContent = 'Nenhuma carga registrada ainda.';
    section.appendChild(empty);
    return section;
  }

  const list = document.createElement('div');
  list.className = 'history-list';

  const sorted = [...ex.logs].sort(
    (a, b) => (b.date || '').localeCompare(a.date || '') || b.ts - a.ts
  );

  sorted.forEach(log => {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.dataset.logId = log.id;

    // Top row: badges + delete button
    const top = document.createElement('div');
    top.className = 'history-item-top';

    const meta = document.createElement('div');
    meta.className = 'history-meta';

    const date = document.createElement('span');
    date.className = 'history-date';
    date.textContent = formatDate(log.date);
    meta.appendChild(date);

    if (log.reps) {
      const b = document.createElement('span');
      b.className = 'history-badge badge-reps';
      b.textContent = `${log.reps} reps`;
      meta.appendChild(b);
    }

    if (log.weight != null && log.weight !== '') {
      const b = document.createElement('span');
      b.className = 'history-badge badge-weight';
      b.textContent = `${log.weight} kg`;
      meta.appendChild(b);
    }

    if (log.difficulty) {
      const b = document.createElement('span');
      b.className = `history-badge ${difficultyClass(log.difficulty)}`;
      b.textContent = difficultyLabel(log.difficulty);
      meta.appendChild(b);
    }

    if (log.personal) {
      const b = document.createElement('span');
      b.className = 'history-badge badge-personal';
      b.textContent = '★ Personal';
      meta.appendChild(b);
    }

    // Delete log button
    const delBtn = document.createElement('button');
    delBtn.className = 'btn-delete-log';
    delBtn.title = 'Excluir registro';
    delBtn.setAttribute('aria-label', 'Excluir registro');
    delBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 3.5h10M5.5 3.5V2.5h3v1M5.5 6v4M8.5 6v4M3 3.5l.7 7.5h6.6L11 3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
    delBtn.addEventListener('click', () => deleteLog(ex.id, log.id));

    top.appendChild(meta);
    top.appendChild(delBtn);
    item.appendChild(top);

    if (log.obs) {
      const obs = document.createElement('div');
      obs.className = 'history-obs';
      obs.textContent = log.obs;
      item.appendChild(obs);
    }

    list.appendChild(item);
  });

  section.appendChild(list);
  return section;
}

// ── ACTIONS ──────────────────────────────────────────────────
function addExercise(name, category) {
  const trimmed = name.trim();
  if (!trimmed) return;

  const dup = Object.values(state.exercises).find(
    ex => ex.category === category && ex.name.toLowerCase() === trimmed.toLowerCase()
  );
  if (dup) {
    showToast(`"${trimmed}" já existe nessa categoria.`);
    return;
  }

  const id = uid();
  state.exercises[id] = { id, name: trimmed, category, collapsed: false, logs: [] };
  saveState();
  render();
  showToast('Exercício adicionado! 💪');
}

function removeExercise(id) {
  const ex = state.exercises[id];
  if (!ex) return;
  if (!confirm(`Remover "${ex.name}" e todo o histórico?`)) return;
  delete state.exercises[id];
  saveState();
  render();
  showToast('Exercício removido.');
}

function deleteLog(exId, logId) {
  const ex = state.exercises[exId];
  if (!ex) return;

  ex.logs = ex.logs.filter(l => l.id !== logId);
  saveState();

  // Patch: update header last-log text + history section in-place
  const card = document.querySelector(`.exercise-card[data-id="${exId}"]`);
  if (card) {
    // Update last-log subtitle
    const last = lastLogDate(ex);
    const lastText = last ? `Última carga: ${formatDate(last)}` : 'Sem registros';
    const sub = card.querySelector('.card-last-log');
    if (sub) sub.textContent = lastText;

    // Replace history section
    const oldHist = card.querySelector('.history-section');
    const newHist  = buildHistory(ex);
    oldHist.parentNode.replaceChild(newHist, oldHist);
    // Update PR badge
    const prEl = card.querySelector('.card-pr');
    const newPr = personalRecord(ex);
    if (prEl) {
      if (newPr) prEl.textContent = `${newPr.weight || '—'}kg x ${newPr.reps || '—'}`;
      else prEl.remove();
    } else if (newPr) {
      const title = card.querySelector('.card-title');
      const el = document.createElement('span'); el.className = 'card-pr'; el.textContent = `${newPr.weight || '—'}kg x ${newPr.reps || '—'}`;
      if (title) title.after(el);
    }
  }

  showToast('Registro excluído.');
}

function saveLog(exId, formEl) {
  const ex = state.exercises[exId];
  if (!ex) return;

  const date     = formEl.querySelector(`#date-${exId}`)?.value || todayISO();
  const reps     = formEl.querySelector(`#reps-${exId}`)?.value;
  const weight   = formEl.querySelector(`#weight-${exId}`)?.value;
  const diff     = formEl.querySelector(`#diff-${exId}`)?.value || 'medium';
  const personal = formEl.querySelector(`#personal-${exId}`)?.checked || false;
  const obs      = formEl.querySelector(`#obs-${exId}`)?.value.trim() || '';

  if (!reps && (weight === '' || weight == null)) {
    showToast('Insira ao menos repetições ou peso.');
    return;
  }

  const log = {
    id: uid(),
    ts: Date.now(),
    date,
    reps:       reps   ? parseInt(reps, 10)   : null,
    weight:     weight ? parseFloat(weight)   : null,
    difficulty: diff,
    personal,
    obs,
  };

  ex.logs.push(log);
  saveState();

  // Reset fields
  const repsEl     = formEl.querySelector(`#reps-${exId}`);
  const weightEl   = formEl.querySelector(`#weight-${exId}`);
  const personalEl = formEl.querySelector(`#personal-${exId}`);
  const obsEl      = formEl.querySelector(`#obs-${exId}`);
  if (repsEl)     repsEl.value = '';
  if (weightEl)   weightEl.value = '';
  if (personalEl) personalEl.checked = false;
  if (obsEl)      obsEl.value = '';

  // Update last-log subtitle
  const card = document.querySelector(`.exercise-card[data-id="${exId}"]`);
  if (card) {
    const sub = card.querySelector('.card-last-log');
    if (sub) sub.textContent = `Última carga: ${formatDate(date)}`;

    const oldHist = card.querySelector('.history-section');
    const newHist  = buildHistory(ex);
    oldHist.parentNode.replaceChild(newHist, oldHist);
    // Update PR badge after save
    const prEl = card.querySelector('.card-pr');
    const newPr = personalRecord(ex);
    if (prEl) {
      if (newPr) prEl.textContent = `${newPr.weight || '—'}kg x ${newPr.reps || '—'}`;
      else prEl.remove();
    } else if (newPr) {
      const title = card.querySelector('.card-title');
      const el = document.createElement('span'); el.className = 'card-pr'; el.textContent = `${newPr.weight || '—'}kg x ${newPr.reps || '—'}`;
      if (title) title.after(el);
    }
  }

  // Re-sort list to reflect new last-log order
  const list = document.getElementById('exerciseList');
  const sorted = sortedExercises(state.activeCategory);
  sorted.forEach(e => {
    const el = document.querySelector(`.exercise-card[data-id="${e.id}"]`);
    if (el) list.appendChild(el); // move to new position
  });

  showToast('Carga salva! ✅');
}

// ── TOAST ────────────────────────────────────────────────────
function showToast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 2200);
}

// ── MODAL ────────────────────────────────────────────────────
const overlay     = document.getElementById('modalOverlay');
const modalInput  = document.getElementById('modalInput');
const modalCat    = document.getElementById('modalCatLabel');
const modalClose  = document.getElementById('modalClose');
const modalCancel = document.getElementById('modalCancel');
const modalConfirm= document.getElementById('modalConfirm');

function openModal() {
  modalCat.textContent = state.activeCategory;
  modalInput.value = '';
  overlay.classList.add('open');
  setTimeout(() => modalInput.focus(), 180);
}

function closeModal() {
  overlay.classList.remove('open');
}

function confirmModal() {
  const val = modalInput.value.trim();
  if (!val) { modalInput.focus(); return; }
  addExercise(val, state.activeCategory);
  closeModal();
}

document.getElementById('btnAdd').addEventListener('click', openModal);
modalClose.addEventListener('click', closeModal);
modalCancel.addEventListener('click', closeModal);
modalConfirm.addEventListener('click', confirmModal);
overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
modalInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') confirmModal();
  if (e.key === 'Escape') closeModal();
});

// --- Additional features: repeat last, export, timer, steppers ---

// Fill form with last log values
function repeatLast(exId, formEl) {
  const ex = state.exercises[exId];
  if (!ex) return;
  const last = lastLog(ex);
  if (!last) {
    showToast('Nenhum registro anterior.');
    return;
  }

  const dateEl = formEl.querySelector(`#date-${exId}`);
  const repsEl = formEl.querySelector(`#reps-${exId}`);
  const weightEl = formEl.querySelector(`#weight-${exId}`);
  const diffEl = formEl.querySelector(`#diff-${exId}`);
  const personalEl = formEl.querySelector(`#personal-${exId}`);
  const obsEl = formEl.querySelector(`#obs-${exId}`);

  if (dateEl) dateEl.value = last.date || todayISO();
  if (repsEl) repsEl.value = last.reps || '';
  if (weightEl) weightEl.value = last.weight != null ? last.weight : '';
  if (diffEl) { diffEl.value = last.difficulty || 'medium'; diffEl.className = `diff-${diffEl.value}`; }
  if (personalEl) personalEl.checked = !!last.personal;
  if (obsEl) obsEl.value = last.obs || '';

  showToast('Campos preenchidos com último registro.');
}

// Export data (copy to clipboard or prompt)
function exportData() {
  try {
    const lines = [];
    lines.push(`Kargas Backup — ${new Date().toLocaleString()}`);
    lines.push('');

    const exercises = Object.values(state.exercises);
    if (exercises.length === 0) {
      lines.push('Nenhum exercício encontrado.');
    } else {
      exercises.forEach(ex => {
        lines.push(`${ex.name} (${ex.category}) — ${ex.logs.length} registros`);
        const pr = personalRecord(ex);
        if (pr) lines.push(`PR: ${pr.weight || '—'}kg x ${pr.reps || '—'}`);
        if (ex.logs.length > 0) {
          const sorted = [...ex.logs].sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.ts - a.ts);
          sorted.forEach(log => {
            const parts = [];
            parts.push(formatDate(log.date));
            if (log.weight != null && log.weight !== '') parts.push(`${log.weight}kg`);
            if (log.reps) parts.push(`${log.reps} reps`);
            if (log.difficulty) parts.push(difficultyLabel(log.difficulty));
            if (log.personal) parts.push('Personal');
            let line = ` - ${parts.join(' • ')}`;
            if (log.obs) line += ` — ${log.obs}`;
            lines.push(line);
          });
        }
        lines.push('');
      });
    }

    const txt = lines.join('\n');
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    const filename = `kargas-backup-${new Date().toISOString().slice(0,10)}.txt`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Backup gerado e baixado.');
  } catch (e) {
    console.warn(e);
    showToast('Falha ao exportar dados.');
  }
}

// Timer helpers
let wakeLock = null;

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      // re-request on release
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch (e) {
    // ignore if not supported or denied
    console.warn('WakeLock failed', e);
  }
}

async function releaseWakeLock() {
  try {
    if (wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch (e) {
    console.warn('WakeLock release failed', e);
  }
}

function toggleTimerPanel(force) {
  const panel = document.getElementById('timerPanel');
  if (!panel) return;
  if (typeof force === 'boolean') {
    panel.setAttribute('aria-hidden', String(!force));
    return;
  }
  const isHidden = panel.getAttribute('aria-hidden') === 'true';
  panel.setAttribute('aria-hidden', String(!isHidden));
}

function startTimer(minutes) {
  stopTimer();
  timerRemaining = (minutes || 1) * 60;
  updateTimerDisplay();
  // request wake lock to keep screen on
  requestWakeLock();
  timerInterval = setInterval(() => {
    timerRemaining -= 1;
    if (timerRemaining <= 0) {
      triggerVibration();
      stopTimer();
      showToast('Tempo!');
      return;
    }
    updateTimerDisplay();
  }, 1000);
}

function triggerVibration() {
  try {
    if ('vibrate' in navigator && navigator.vibrate) {
      navigator.vibrate(200);
      setTimeout(() => navigator.vibrate(200), 300);
      setTimeout(() => navigator.vibrate(200), 600);
    }
  } catch (e) {
    console.warn('Vibration failed', e);
  }
}

function stopTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  timerRemaining = 0;
  updateTimerDisplay();
  // release wake lock
  releaseWakeLock();
}

function updateTimerDisplay() {
  const d = document.getElementById('timerDisplay');
  if (!d) return;
  const mm = String(Math.floor(timerRemaining / 60)).padStart(2, '0');
  const ss = String(timerRemaining % 60).padStart(2, '0');
  d.textContent = `${mm}:${ss}`;
}

// re-request wake lock when visibility changes (some browsers release it)
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && timerInterval && !wakeLock) {
    await requestWakeLock();
  }
});

// Export button
const exportBtn = document.getElementById('exportBtn');
if (exportBtn) exportBtn.addEventListener('click', exportData);

// Timer FAB
const timerFab = document.getElementById('timerFab');
if (timerFab) timerFab.addEventListener('click', () => toggleTimerPanel());
const timerPanel = document.getElementById('timerPanel');
if (timerPanel) {
  timerPanel.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-min]');
    if (b) { startTimer(parseInt(b.dataset.min, 10)); }
  });
  const startBtn = document.getElementById('timerStart');
  const stopBtn = document.getElementById('timerStop');
  if (startBtn) startBtn.addEventListener('click', () => { if (timerRemaining <= 0) startTimer(1); });
  if (stopBtn) stopBtn.addEventListener('click', () => stopTimer());
}

// Close timer panel when clicking outside
document.addEventListener('click', (e) => {
  const panel = document.getElementById('timerPanel');
  const fab = document.getElementById('timerFab');
  if (!panel || !fab) return;
  const open = panel.getAttribute('aria-hidden') === 'false';
  if (!open) return;
  if (!e.target.closest('#timerPanel') && !e.target.closest('#timerFab')) {
    toggleTimerPanel(false);
  }
});

// ── TABS ─────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', function () {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    state.activeCategory = this.dataset.cat;
    render();
    this.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  });
});

// ── INIT ─────────────────────────────────────────────────────
loadState();
render();
