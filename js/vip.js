document.addEventListener('DOMContentLoaded', () => {
  initCommon();

  if (!window.XythonAuth?.isLoggedIn?.()) {
    window.XythonAuth?.requireAuth?.('login');
    return;
  }

  document.addEventListener('xython:stats-change', renderVip);
  renderVip();
});

function formatWager(value) {
  return `$${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function formatRankName(rank) {
  if (!rank) return 'Unranked';
  return rank.sub ? `${rank.label} ${rank.sub}` : rank.label;
}

function renderVip() {
  const ranks = window.XythonRanks;
  if (!ranks) return;

  const stats = window.XythonStats?.get?.() || { wagered: 0 };
  const player = ranks.getCurrent();
  const ladder = ranks.ladder || [];
  const colors = ranks.colors || {};
  const rakebackRates = ranks.rakebackRates || {};

  renderCurrentCard(player, stats.wagered, colors);
  renderLadder(ladder, player.index, colors, rakebackRates);
}

function renderCurrentCard(player, wagered, colors) {
  const el = document.getElementById('vipCurrent');
  if (!el) return;

  const color = player.color || colors[player.current.tier] || '#9333ea';

  if (player.isMax) {
    el.innerHTML = `
      <div class="vip-current-top">
        <span class="vip-current-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 19h20M2 7l4 5 6-8 6 8 4-5v12H2V7z"/></svg>
        </span>
        <div class="vip-current-body">
          <span class="vip-current-label">Your rank</span>
          <span class="vip-current-rank" style="color:${color}">${escapeHtml(player.displayName)}</span>
          <span class="vip-current-wagered"><strong>${formatWager(wagered)}</strong> wagered total</span>
        </div>
      </div>
      <p class="vip-current-max">Maximum rank reached — you're at the top.</p>`;
    return;
  }

  el.innerHTML = `
    <div class="vip-current-top">
      <span class="vip-current-icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 19h20M2 7l4 5 6-8 6 8 4-5v12H2V7z"/></svg>
      </span>
      <div class="vip-current-body">
        <span class="vip-current-label">Your rank</span>
        <span class="vip-current-rank" style="color:${color}">${escapeHtml(player.displayName)}</span>
        <span class="vip-current-wagered"><strong>${formatWager(wagered)}</strong> wagered · ${formatWager(player.remaining)} to ${escapeHtml(player.nextName)}</span>
      </div>
    </div>
    <div class="vip-progress-wrap">
      <div class="vip-progress-labels">
        <span>${escapeHtml(player.displayName)}</span>
        <span><strong>${player.progressPct.toFixed(1)}%</strong> → ${escapeHtml(player.nextName)}</span>
      </div>
      <div class="vip-progress-bar">
        <div class="vip-progress-fill" style="width:${player.progressPct.toFixed(1)}%"></div>
      </div>
    </div>`;
}

function renderLadder(ladder, currentIndex, colors, rakebackRates) {
  const listEl = document.getElementById('vipLadder');
  const metaEl = document.getElementById('vipLadderMeta');
  if (!listEl) return;

  if (metaEl) {
    metaEl.textContent = `${currentIndex + 1} / ${ladder.length} reached`;
  }

  listEl.innerHTML = ladder.map((rank, index) => {
    const name = formatRankName(rank);
    const color = colors[rank.tier] || '#737373';
    const rake = ((rakebackRates[rank.tier] || 0.03) * 100).toFixed(1);
    const isCurrent = index === currentIndex;
    const isAchieved = index < currentIndex;
    const isLocked = index > currentIndex;
    const stateClass = isCurrent ? 'is-current' : isAchieved ? 'is-achieved' : 'is-locked';

    const wagerLabel = rank.minWagered === 0
      ? 'Starting rank'
      : `${formatWager(rank.minWagered)} wagered`;

    const rewardLabel = rank.reward > 0 ? `$${rank.reward.toLocaleString()} reward` : '—';

    const trailing = isCurrent
      ? '<span class="vip-rank-badge">Current</span>'
      : isAchieved
        ? `<span class="vip-rank-check" aria-label="Achieved"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg></span>`
        : '';

    return `
      <article class="vip-rank ${stateClass}" id="vip-rank-${index}" data-rank-index="${index}">
        <span class="vip-rank-dot" style="color:${color};background:${color}"></span>
        <div class="vip-rank-info">
          <span class="vip-rank-name" style="${isCurrent ? `color:${color}` : ''}">${escapeHtml(name)}</span>
          <span class="vip-rank-req">${wagerLabel}</span>
        </div>
        <div class="vip-rank-perks">
          <span class="vip-rank-reward">${rewardLabel}</span>
          <span class="vip-rank-rake">${rake}% rakeback</span>
        </div>
        ${trailing}
      </article>`;
  }).join('');

  requestAnimationFrame(() => {
    document.getElementById(`vip-rank-${currentIndex}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
