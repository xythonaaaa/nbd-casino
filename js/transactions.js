let activeFilter = 'all';

document.addEventListener('DOMContentLoaded', () => {
  initCommon();

  if (!window.XythonAuth?.isLoggedIn?.()) {
    window.XythonAuth?.requireAuth?.('login');
    return;
  }

  document.querySelectorAll('.tx-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.filter || 'all';
      document.querySelectorAll('.tx-filter').forEach(b => b.classList.toggle('active', b === btn));
      renderTransactions();
    });
  });

  document.addEventListener('xython:transactions-change', renderTransactions);
  renderTransactions();
});

function formatTxAmount(amount, currency) {
  const abs = Math.abs(amount);
  const prefix = amount >= 0 ? '+' : '-';
  if (currency === 'USD') {
    return `${prefix}$${abs.toFixed(2)}`;
  }
  return `${prefix}${abs.toFixed(8)} ${currency}`;
}

function formatTxTime(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function txIcon(type) {
  const icons = {
    deposit: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
    bet: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/></svg>',
    win: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5M19 12l-7 7-7-7"/></svg>',
    reward: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8V21M12 8c-2-3-6-3-6 0h6zM12 8c2-3 6-3 6 0h-6z"/></svg>',
    tip: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>',
    vault: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M12 9v3l2 1"/></svg>',
  };
  return icons[type] || icons.win;
}

function renderTransactions() {
  const listEl = document.getElementById('txList');
  const emptyEl = document.getElementById('txEmpty');
  if (!listEl || !emptyEl) return;

  let items = window.XythonTransactions?.list?.() || [];
  if (activeFilter !== 'all') {
    items = items.filter(tx => tx.type === activeFilter);
  }

  if (items.length === 0) {
    listEl.innerHTML = '';
    emptyEl.hidden = false;
    emptyEl.textContent = activeFilter === 'all'
      ? 'No transactions yet. Deposit or play a game to get started.'
      : `No ${activeFilter} transactions yet.`;
    return;
  }

  emptyEl.hidden = true;
  listEl.innerHTML = items.map(tx => {
    const credit = tx.amount >= 0;
    return `
      <article class="tx-row">
        <span class="tx-row-icon tx-row-icon--${tx.type}">${txIcon(tx.type)}</span>
        <div class="tx-row-body">
          <span class="tx-row-label">${escapeHtml(tx.label)}</span>
          <span class="tx-row-detail">${escapeHtml(tx.detail || tx.type)}</span>
        </div>
        <div class="tx-row-meta">
          <span class="tx-row-amount ${credit ? 'is-credit' : 'is-debit'}">${formatTxAmount(tx.amount, tx.currency)}</span>
          <span class="tx-row-time">${formatTxTime(tx.ts)}</span>
        </div>
      </article>`;
  }).join('');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
