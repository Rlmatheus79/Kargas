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
      <div class="form-group" style="justify-content:flex-end;padding-bottom:9px">
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
