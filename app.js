'use strict';

/* ===================== CONSTANTS ===================== */
const STORAGE_KEY = 'treasury.transactions.v1';
const SETTINGS_KEY = 'treasury.settings.v1';

const CATEGORIES = {
  expense: [
    { id: 'Food', icon: '🍔', color: '#F0B429' },
    { id: 'Transport', icon: '🚗', color: '#3B82F6' },
    { id: 'Shopping', icon: '🛍️', color: '#EC63C0' },
    { id: 'Bills', icon: '🧾', color: '#63A0FF' },
    { id: 'Health', icon: '💊', color: '#2FBF7A' },
    { id: 'Education', icon: '📚', color: '#A78BFA' },
    { id: 'Entertainment', icon: '🎬', color: '#FF8797' },
    { id: 'Rent', icon: '🏠', color: '#C9A227' },
    { id: 'Other', icon: '📦', color: '#7482A3' },
  ],
  income: [
    { id: 'Salary', icon: '💼', color: '#2FBF7A' },
    { id: 'Freelance', icon: '💻', color: '#3B82F6' },
    { id: 'Business', icon: '🏢', color: '#C9A227' },
    { id: 'Gift', icon: '🎁', color: '#EC63C0' },
    { id: 'Other', icon: '📦', color: '#7482A3' },
  ]
};

function catMeta(type, id) {
  const list = CATEGORIES[type] || [];
  return list.find(c => c.id === id) || { id, icon: '📦', color: '#7482A3' };
}

/* ===================== STATE ===================== */
let state = {
  transactions: [],
  settings: { theme: 'dark', currency: 'Rs.' },
  filters: { search: '', type: 'all', date: 'all', category: 'all', sort: 'newest', from: '', to: '' },
  dashMonthCursor: new Date(),
  anMonthCursor: new Date(),
  currentView: 'dashboard',
  editingId: null,
  quickType: 'expense',
  pendingConfirm: null,
};

/* ===================== STORAGE ===================== */
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state.transactions = raw ? JSON.parse(raw) : [];
  } catch (e) { state.transactions = []; }
  try {
    const rawS = localStorage.getItem(SETTINGS_KEY);
    if (rawS) state.settings = Object.assign(state.settings, JSON.parse(rawS));
  } catch (e) { /* keep defaults */ }
}
function saveTransactions() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.transactions));
}
function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
}

/* ===================== HELPERS ===================== */
function uid() {
  return 'tx_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}
function fmtMoney(n) {
  const val = Math.round((Number(n) || 0) * 100) / 100;
  const parts = Math.abs(val).toFixed(2).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const dec = parts[1] === '00' ? '' : '.' + parts[1];
  const sign = val < 0 ? '-' : '';
  return `${sign}${state.settings.currency} ${parts[0]}${dec}`;
}
function fmtDateLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
}
function todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function monthKey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
function monthLabel(d) { return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); }
function isSameMonth(dateStr, cursor) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.getFullYear() === cursor.getFullYear() && d.getMonth() === cursor.getMonth();
}
function startOfWeek(d) {
  const dt = new Date(d);
  const day = dt.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // Monday start
  dt.setDate(dt.getDate() + diff);
  dt.setHours(0, 0, 0, 0);
  return dt;
}
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ===================== TOTALS ===================== */
function computeTotals(list) {
  let income = 0, expense = 0;
  for (const t of list) {
    if (t.type === 'income') income += t.amount; else expense += t.amount;
  }
  return { income, expense, balance: income - expense };
}

/* ===================== CRUD ===================== */
function addOrUpdateTransaction(data) {
  if (state.editingId) {
    const idx = state.transactions.findIndex(t => t.id === state.editingId);
    if (idx !== -1) {
      state.transactions[idx] = Object.assign({}, state.transactions[idx], data);
    }
  } else {
    state.transactions.push(Object.assign({ id: uid(), createdAt: Date.now() }, data));
  }
  saveTransactions();
}
function deleteTransaction(id) {
  state.transactions = state.transactions.filter(t => t.id !== id);
  saveTransactions();
}
function clearAllTransactions() {
  state.transactions = [];
  saveTransactions();
}

/* ===================== RENDER: DASHBOARD ===================== */
function renderDashboard() {
  const totals = computeTotals(state.transactions);
  document.getElementById('statBalance').textContent = fmtMoney(totals.balance);
  document.getElementById('statIncome').textContent = fmtMoney(totals.income);
  document.getElementById('statExpense').textContent = fmtMoney(totals.expense);
  const rate = totals.income > 0 ? Math.max(0, Math.min(100, ((totals.income - totals.expense) / totals.income) * 100)) : 0;
  document.getElementById('statSavings').textContent = (totals.income > 0 ? rate.toFixed(1) : '0') + '%';
  document.getElementById('savingsBar').style.width = rate + '%';
  document.getElementById('statBalanceFoot').textContent = totals.balance >= 0 ? 'You are in the green' : 'Spending exceeds income';

  document.getElementById('dashMonthLabel').textContent = monthLabel(state.dashMonthCursor);
  const monthList = state.transactions.filter(t => isSameMonth(t.date, state.dashMonthCursor));
  const mTotals = computeTotals(monthList);
  document.getElementById('mIncome').textContent = fmtMoney(mTotals.income);
  document.getElementById('mExpense').textContent = fmtMoney(mTotals.expense);
  document.getElementById('mBalance').textContent = fmtMoney(mTotals.balance);
  document.getElementById('mCount').textContent = monthList.length;

  const topCat = topCategoryFor(monthList);
  document.getElementById('mTopCat').innerHTML = topCat
    ? `Top category this month: <b>${escapeHtml(topCat.id)}</b> — ${fmtMoney(topCat.total)}`
    : 'No spending recorded this month yet.';

  renderCategoryChart(document.getElementById('dashCatChart'), monthList);
  renderRecentList();
}

function topCategoryFor(list) {
  const map = {};
  for (const t of list) {
    if (t.type !== 'expense') continue;
    map[t.category] = (map[t.category] || 0) + t.amount;
  }
  let best = null;
  for (const k in map) { if (!best || map[k] > best.total) best = { id: k, total: map[k] }; }
  return best;
}

function renderCategoryChart(container, list) {
  const map = {};
  let max = 0, total = 0;
  for (const t of list) {
    if (t.type !== 'expense') continue;
    map[t.category] = (map[t.category] || 0) + t.amount;
    total += t.amount;
  }
  const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
  if (!entries.length) {
    container.innerHTML = '<div class="empty-mini">No expenses to chart yet.</div>';
    return;
  }
  max = entries[0][1];
  container.innerHTML = entries.map(([cat, amt]) => {
    const meta = catMeta('expense', cat);
    const pct = total > 0 ? (amt / total * 100).toFixed(0) : 0;
    const width = max > 0 ? (amt / max * 100) : 0;
    return `<div class="cat-row">
      <div class="cat-icon" style="background:${meta.color}22;color:${meta.color}">${meta.icon}</div>
      <div class="cat-meta">
        <div class="cat-meta-top"><span>${escapeHtml(cat)}</span><span>${fmtMoney(amt)} · ${pct}%</span></div>
        <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${width}%;background:${meta.color}"></div></div>
      </div>
    </div>`;
  }).join('');
}

function txRowHtml(t) {
  const meta = catMeta(t.type, t.category);
  const sign = t.type === 'income' ? '+' : '−';
  return `<div class="tx-row" data-id="${t.id}">
    <div class="tx-icon" style="background:${meta.color}22;color:${meta.color}">${meta.icon}</div>
    <div class="tx-main">
      <div class="tx-title">${escapeHtml(t.category)}</div>
      <div class="tx-sub">${t.note ? escapeHtml(t.note) + ' · ' : ''}${fmtDateLabel(t.date)}</div>
    </div>
    <div class="tx-amount ${t.type}">${sign} ${fmtMoney(t.amount)}</div>
    <div class="tx-actions">
      <button class="edit-btn" data-action="edit" aria-label="Edit transaction">
        <svg viewBox="0 0 24 24" width="15" height="15"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
      </button>
      <button class="del-btn" data-action="delete" aria-label="Delete transaction">
        <svg viewBox="0 0 24 24" width="15" height="15"><path d="M4 7h16M9 7V4h6v3m-8 0l1 13h8l1-13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
      </button>
    </div>
  </div>`;
}

function emptyStateHtml() {
  return `<div class="empty-state">
    <div class="empty-icon">
      <svg viewBox="0 0 24 24" width="28" height="28"><path d="M3 7h18M3 7v11a2 2 0 002 2h14a2 2 0 002-2V7M3 7l2-4h14l2 4M9 11a3 3 0 006 0" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
    </div>
    <h3>No transactions yet</h3>
    <p>Start tracking your money by adding your first transaction.</p>
    <button class="btn btn-primary" id="emptyAddBtn">+ Add Transaction</button>
  </div>`;
}

function renderRecentList() {
  const container = document.getElementById('recentList');
  const sorted = [...state.transactions].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);
  if (!sorted.length) { container.innerHTML = emptyStateHtml(); bindEmptyBtn(container); return; }
  container.innerHTML = sorted.map(txRowHtml).join('');
  bindRowActions(container);
}

/* ===================== RENDER: TRANSACTIONS VIEW ===================== */
function populateCategoryFilterOptions() {
  const sel = document.getElementById('categoryFilter');
  const all = [...CATEGORIES.expense, ...CATEGORIES.income].map(c => c.id);
  const unique = [...new Set(all)];
  sel.innerHTML = '<option value="all">All categories</option>' + unique.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
}

function getFilteredTransactions() {
  const f = state.filters;
  let list = [...state.transactions];

  if (f.type !== 'all') list = list.filter(t => t.type === f.type);
  if (f.category !== 'all') list = list.filter(t => t.category === f.category);

  if (f.search.trim()) {
    const q = f.search.trim().toLowerCase();
    list = list.filter(t =>
      t.category.toLowerCase().includes(q) ||
      (t.note || '').toLowerCase().includes(q) ||
      String(t.amount).includes(q)
    );
  }

  if (f.date !== 'all') {
    const now = new Date();
    if (f.date === 'today') {
      const today = todayISO();
      list = list.filter(t => t.date === today);
    } else if (f.date === 'week') {
      const start = startOfWeek(now);
      list = list.filter(t => new Date(t.date + 'T00:00:00') >= start);
    } else if (f.date === 'month') {
      list = list.filter(t => isSameMonth(t.date, now));
    } else if (f.date === 'custom' && f.from && f.to) {
      list = list.filter(t => t.date >= f.from && t.date <= f.to);
    }
  }

  switch (f.sort) {
    case 'oldest': list.sort((a, b) => a.createdAt - b.createdAt); break;
    case 'highest': list.sort((a, b) => b.amount - a.amount); break;
    case 'lowest': list.sort((a, b) => a.amount - b.amount); break;
    default: list.sort((a, b) => b.createdAt - a.createdAt);
  }
  return list;
}

function renderTransactionsView() {
  const container = document.getElementById('fullList');
  const list = getFilteredTransactions();
  const countLabel = document.getElementById('txListCount');
  if (!state.transactions.length) {
    container.innerHTML = emptyStateHtml();
    bindEmptyBtn(container);
    countLabel.textContent = 'All transactions';
    return;
  }
  countLabel.textContent = `${list.length} transaction${list.length === 1 ? '' : 's'}`;
  if (!list.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">
      <svg viewBox="0 0 24 24" width="28" height="28"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.7" fill="none"/><path d="M21 21l-4-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
      </div><h3>No matches found</h3><p>Try adjusting your search or filters.</p></div>`;
    return;
  }
  container.innerHTML = list.map(txRowHtml).join('');
  bindRowActions(container);
}

function bindRowActions(container) {
  container.querySelectorAll('.tx-row').forEach(row => {
    const id = row.dataset.id;
    row.querySelector('[data-action="edit"]').addEventListener('click', () => openTxModal(id));
    row.querySelector('[data-action="delete"]').addEventListener('click', () => {
      askConfirm('Delete transaction?', 'This transaction will be permanently removed.', () => {
        deleteTransaction(id);
        renderAll();
        showToast('Transaction deleted');
      });
    });
  });
}
function bindEmptyBtn(container) {
  const btn = container.querySelector('#emptyAddBtn');
  if (btn) btn.addEventListener('click', () => openTxModal());
}

/* ===================== RENDER: ANALYTICS ===================== */
function renderAnalytics() {
  document.getElementById('anMonthLabel').textContent = monthLabel(state.anMonthCursor);
  const monthList = state.transactions.filter(t => isSameMonth(t.date, state.anMonthCursor));
  renderCategoryChart(document.getElementById('fullCatChart'), monthList);
  renderOverviewChart(monthList);

  const totals = computeTotals(monthList);
  const topCat = topCategoryFor(monthList);
  const grid = document.getElementById('anSummaryGrid');
  grid.innerHTML = `
    <div><span>Income</span><strong>${fmtMoney(totals.income)}</strong></div>
    <div><span>Expenses</span><strong>${fmtMoney(totals.expense)}</strong></div>
    <div><span>Balance</span><strong>${fmtMoney(totals.balance)}</strong></div>
    <div><span>Transactions</span><strong>${monthList.length}</strong></div>
    <div><span>Top Category</span><strong>${topCat ? escapeHtml(topCat.id) : '—'}</strong></div>
  `;
}

function renderOverviewChart(monthList) {
  const container = document.getElementById('overviewChart');
  const totals = computeTotals(monthList);
  const max = Math.max(totals.income, totals.expense, 1);
  const incH = Math.round((totals.income / max) * 140);
  const expH = Math.round((totals.expense / max) * 140);
  container.innerHTML = `
    <div class="ov-col">
      <div class="ov-bars">
        <div class="ov-bar income" style="height:${incH}px" title="Income ${fmtMoney(totals.income)}"></div>
        <div class="ov-bar expense" style="height:${expH}px" title="Expense ${fmtMoney(totals.expense)}"></div>
      </div>
      <div class="ov-label">${monthLabel(state.anMonthCursor)}</div>
    </div>
  `;
  container.insertAdjacentHTML('afterend', '');
  let legend = container.parentElement.querySelector('.overview-legend');
  if (!legend) {
    legend = document.createElement('div');
    legend.className = 'overview-legend';
    container.insertAdjacentElement('afterend', legend);
  }
  legend.innerHTML = `<span><i class="dot income"></i>Income ${fmtMoney(totals.income)}</span><span><i class="dot expense"></i>Expenses ${fmtMoney(totals.expense)}</span>`;
}

/* ===================== RENDER ALL ===================== */
function renderAll() {
  renderDashboard();
  renderTransactionsView();
  renderAnalytics();
}

/* ===================== VIEW SWITCHING ===================== */
function switchView(view) {
  state.currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('is-active'));
  document.getElementById('view-' + view).classList.add('is-active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('is-active', n.dataset.view === view));
  document.querySelectorAll('.bn-item').forEach(n => n.classList.toggle('is-active', n.dataset.view === view));
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

/* ===================== MODAL: ADD/EDIT TRANSACTION ===================== */
function populateCategorySelect(type) {
  const sel = document.getElementById('txCategory');
  sel.innerHTML = CATEGORIES[type].map(c => `<option value="${escapeHtml(c.id)}">${c.icon} ${escapeHtml(c.id)}</option>`).join('');
}

function openTxModal(id) {
  state.editingId = id || null;
  const overlay = document.getElementById('txModalOverlay');
  const title = document.getElementById('txModalTitle');
  const form = document.getElementById('txForm');
  form.reset();
  clearFormErrors();

  let type = state.quickType || 'expense';
  let data = null;
  if (id) {
    data = state.transactions.find(t => t.id === id);
    if (data) type = data.type;
  }

  setTxTypeUI(type);
  populateCategorySelect(type);

  if (data) {
    title.textContent = 'Edit Transaction';
    document.getElementById('txAmount').value = data.amount;
    document.getElementById('txCategory').value = data.category;
    document.getElementById('txDate').value = data.date;
    document.getElementById('txNote').value = data.note || '';
  } else {
    title.textContent = 'Add Transaction';
    document.getElementById('txDate').value = todayISO();
  }

  overlay.hidden = false;
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('txAmount').focus(), 50);
}

function closeTxModal() {
  document.getElementById('txModalOverlay').hidden = true;
  document.body.style.overflow = '';
  state.editingId = null;
}

function setTxTypeUI(type) {
  document.querySelectorAll('#txForm [data-txtype]').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.txtype === type);
  });
  document.getElementById('txForm').dataset.currentType = type;
}

function clearFormErrors() {
  ['errAmount', 'errCategory', 'errDate'].forEach(id => document.getElementById(id).hidden = true);
}

function handleTxFormSubmit(e) {
  e.preventDefault();
  clearFormErrors();
  const type = document.getElementById('txForm').dataset.currentType || 'expense';
  const amount = parseFloat(document.getElementById('txAmount').value);
  const category = document.getElementById('txCategory').value;
  const date = document.getElementById('txDate').value;
  const note = document.getElementById('txNote').value.trim();

  let valid = true;
  if (!(amount > 0)) { document.getElementById('errAmount').hidden = false; valid = false; }
  if (!category) { document.getElementById('errCategory').hidden = false; valid = false; }
  if (!date) { document.getElementById('errDate').hidden = false; valid = false; }
  if (!valid) return;

  addOrUpdateTransaction({ type, amount, category, date, note });
  closeTxModal();
  renderAll();
  showToast(state.editingId ? 'Transaction updated' : 'Transaction added');
}

/* ===================== CONFIRM DIALOG ===================== */
function askConfirm(title, text, onConfirm) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmText').textContent = text;
  state.pendingConfirm = onConfirm;
  document.getElementById('confirmOverlay').hidden = false;
}
function closeConfirm() {
  document.getElementById('confirmOverlay').hidden = true;
  state.pendingConfirm = null;
}

/* ===================== TOAST ===================== */
function showToast(msg) {
  const stack = document.getElementById('toastStack');
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<svg viewBox="0 0 24 24" width="15" height="15"><path d="M20 6L9 17l-5-5" stroke="#E0BC4D" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>${escapeHtml(msg)}`;
  stack.appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 2400);
}

/* ===================== THEME ===================== */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  state.settings.theme = theme;
  saveSettings();
  const isDark = theme === 'dark';
  const sunPath = '<circle cx="12" cy="12" r="4" fill="currentColor"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>';
  const moonPath = '<path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z" fill="currentColor"/>';
  document.getElementById('themeIconMobile').innerHTML = isDark ? moonPath : sunPath;
  document.getElementById('themeIconDesktop').innerHTML = isDark ? moonPath : sunPath;
  document.querySelectorAll('[data-theme]').forEach(btn => {
    if (btn.tagName === 'BUTTON') btn.classList.toggle('is-active', btn.dataset.theme === theme);
  });
}

/* ===================== CURRENCY ===================== */
function applyCurrency(sym) {
  state.settings.currency = sym;
  saveSettings();
  document.getElementById('currencyPrefix').textContent = sym;
  document.getElementById('currencySelect').value = sym;
  renderAll();
}

/* ===================== EXPORT / IMPORT ===================== */
function exportData() {
  const payload = {
    app: 'Treasury Expense Tracker',
    exportedAt: new Date().toISOString(),
    settings: state.settings,
    transactions: state.transactions,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `treasury-export-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('Data exported');
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const txs = Array.isArray(parsed) ? parsed : parsed.transactions;
      if (!Array.isArray(txs)) throw new Error('Invalid file');
      const cleaned = txs.filter(t => t && t.amount && t.type && t.date && t.category).map(t => ({
        id: t.id || uid(),
        type: t.type === 'income' ? 'income' : 'expense',
        amount: Number(t.amount),
        category: String(t.category),
        date: String(t.date),
        note: t.note ? String(t.note) : '',
        createdAt: t.createdAt || Date.now(),
      }));
      askConfirm('Import data?', `This will add ${cleaned.length} transaction(s) to your existing data.`, () => {
        state.transactions = state.transactions.concat(cleaned);
        saveTransactions();
        renderAll();
        showToast('Data imported');
      });
    } catch (err) {
      showToast('Import failed — invalid file');
    }
  };
  reader.readAsText(file);
}

/* ===================== EVENT BINDING ===================== */
function bindEvents() {
  // nav
  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
  document.querySelectorAll('[data-view-link]').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.viewLink));
  });

  // add transaction entry points
  document.getElementById('btnAddDesktop').addEventListener('click', () => { state.quickType = 'expense'; openTxModal(); });
  document.getElementById('btnAddMobile').addEventListener('click', () => { state.quickType = 'expense'; openTxModal(); });
  document.querySelectorAll('[data-quick]').forEach(btn => {
    btn.addEventListener('click', () => { state.quickType = btn.dataset.quick; openTxModal(); });
  });

  // modal
  document.getElementById('btnCloseModal').addEventListener('click', closeTxModal);
  document.getElementById('btnCancelTx').addEventListener('click', closeTxModal);
  document.getElementById('txModalOverlay').addEventListener('click', e => { if (e.target.id === 'txModalOverlay') closeTxModal(); });
  document.getElementById('txForm').addEventListener('submit', handleTxFormSubmit);
  document.querySelectorAll('#txForm [data-txtype]').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.txtype;
      setTxTypeUI(type);
      populateCategorySelect(type);
    });
  });

  // confirm dialog
  document.getElementById('confirmCancel').addEventListener('click', closeConfirm);
  document.getElementById('confirmOverlay').addEventListener('click', e => { if (e.target.id === 'confirmOverlay') closeConfirm(); });
  document.getElementById('confirmOk').addEventListener('click', () => {
    const fn = state.pendingConfirm;
    closeConfirm();
    if (fn) fn();
  });

  // escape closes modals
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!document.getElementById('txModalOverlay').hidden) closeTxModal();
      if (!document.getElementById('confirmOverlay').hidden) closeConfirm();
    }
  });

  // filters
  document.getElementById('searchInput').addEventListener('input', e => { state.filters.search = e.target.value; renderTransactionsView(); });
  document.querySelectorAll('.seg-control [data-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.seg-control [data-type]').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      state.filters.type = btn.dataset.type;
      renderTransactionsView();
    });
  });
  document.getElementById('dateFilter').addEventListener('change', e => {
    state.filters.date = e.target.value;
    document.getElementById('customRangeRow').hidden = e.target.value !== 'custom';
    renderTransactionsView();
  });
  document.getElementById('categoryFilter').addEventListener('change', e => { state.filters.category = e.target.value; renderTransactionsView(); });
  document.getElementById('sortFilter').addEventListener('change', e => { state.filters.sort = e.target.value; renderTransactionsView(); });
  document.getElementById('rangeFrom').addEventListener('change', e => { state.filters.from = e.target.value; renderTransactionsView(); });
  document.getElementById('rangeTo').addEventListener('change', e => { state.filters.to = e.target.value; renderTransactionsView(); });

  // month navigation
  document.getElementById('dashPrevMonth').addEventListener('click', () => { shiftMonth('dashMonthCursor', -1); renderDashboard(); });
  document.getElementById('dashNextMonth').addEventListener('click', () => { shiftMonth('dashMonthCursor', 1); renderDashboard(); });
  document.getElementById('anPrevMonth').addEventListener('click', () => { shiftMonth('anMonthCursor', -1); renderAnalytics(); });
  document.getElementById('anNextMonth').addEventListener('click', () => { shiftMonth('anMonthCursor', 1); renderAnalytics(); });

  // theme
  document.getElementById('btnThemeMobile').addEventListener('click', () => applyTheme(state.settings.theme === 'dark' ? 'light' : 'dark'));
  document.getElementById('btnThemeDesktop').addEventListener('click', () => applyTheme(state.settings.theme === 'dark' ? 'light' : 'dark'));
  document.querySelectorAll('#view-settings [data-theme]').forEach(btn => {
    btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
  });

  // currency
  document.getElementById('currencySelect').addEventListener('change', e => applyCurrency(e.target.value));

  // export/import
  document.getElementById('btnExportData').addEventListener('click', exportData);
  document.getElementById('btnExportQuick').addEventListener('click', exportData);
  document.getElementById('btnImportData').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('btnImportQuick').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) importData(file);
    e.target.value = '';
  });

  // clear data
  document.getElementById('btnClearData').addEventListener('click', () => {
    askConfirm('Clear all data?', 'This will permanently delete all locally stored transactions. This cannot be undone.', () => {
      clearAllTransactions();
      renderAll();
      showToast('All data cleared');
    });
  });
}

function shiftMonth(key, dir) {
  const d = new Date(state[key]);
  d.setDate(1);
  d.setMonth(d.getMonth() + dir);
  state[key] = d;
}

/* ===================== INIT ===================== */
function setTodayLabel() {
  const el = document.getElementById('todayLabel');
  el.textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function init() {
  loadData();
  applyTheme(state.settings.theme || 'dark');
  document.getElementById('currencyPrefix').textContent = state.settings.currency;
  document.getElementById('currencySelect').value = state.settings.currency;
  populateCategoryFilterOptions();
  setTodayLabel();
  bindEvents();
  renderAll();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js').catch(() => {});
    });
  }
}

document.addEventListener('DOMContentLoaded', init);