document.addEventListener('DOMContentLoaded', async () => {

  initCommon();



  if (!window.XythonAuth?.isLoggedIn?.()) {

    window.XythonAuth?.requireAuth?.('login');

    return;

  }



  document.getElementById('affCopyBtn')?.addEventListener('click', copyReferralLink);

  document.getElementById('affClaimBtn')?.addEventListener('click', claimCommission);

  document.addEventListener('xython:affiliate-change', renderAffiliates);



  await window.XythonAffiliates?.refresh?.();

  renderAffiliates();

});



function formatMoney(value) {

  return `$${Number(value || 0).toLocaleString(undefined, {

    minimumFractionDigits: 2,

    maximumFractionDigits: 2,

  })}`;

}



function formatDate(ts) {

  return new Date(ts).toLocaleDateString(undefined, {

    month: 'short',

    day: 'numeric',

    year: 'numeric',

  });

}



function renderAffiliates() {

  const username = window.XythonAuth?.getUsername?.();

  if (!username) return;



  const aff = window.XythonAffiliates;

  const data = aff.get(username);

  const rate = (aff.rate * 100).toFixed(0);

  const link = aff.getLink(username);

  const referrer = aff.getReferrer(username);

  const minClaim = aff.minClaim;



  const rateLabel = document.getElementById('affRateLabel');

  if (rateLabel) rateLabel.textContent = `${rate}%`;



  const statsEl = document.getElementById('affStats');

  if (statsEl) {

    statsEl.innerHTML = `

      <div class="aff-stat">

        <span class="aff-stat-value">${data.referrals.length}</span>

        <span class="aff-stat-label">Referrals</span>

      </div>

      <div class="aff-stat">

        <span class="aff-stat-value aff-stat-value--purple">${formatMoney(data.referralWagered)}</span>

        <span class="aff-stat-label">Referral Wagered</span>

      </div>

      <div class="aff-stat">

        <span class="aff-stat-value aff-stat-value--green">${formatMoney(data.pending)}</span>

        <span class="aff-stat-label">Available</span>

      </div>

      <div class="aff-stat">

        <span class="aff-stat-value">${formatMoney(data.lifetime)}</span>

        <span class="aff-stat-label">Lifetime</span>

      </div>`;

  }



  const linkInput = document.getElementById('affLinkInput');

  if (linkInput) linkInput.value = link;



  const isLocalFile = window.location.protocol === 'file:';

  const tipEl = document.getElementById('affLocalTip');

  const codeHint = document.getElementById('affCodeHint');

  if (tipEl) tipEl.hidden = !isLocalFile;

  if (codeHint) codeHint.textContent = username;



  const referredByEl = document.getElementById('affReferredBy');

  if (referredByEl) {

    if (referrer) {

      referredByEl.hidden = false;

      referredByEl.innerHTML = `You were referred by <strong>${escapeHtml(referrer)}</strong>`;

    } else {

      referredByEl.hidden = true;

    }

  }



  const pendingDesc = document.getElementById('affPendingDesc');

  if (pendingDesc) {

    pendingDesc.textContent = `${formatMoney(data.pending)} available · ${rate}% of referral wagers`;

  }



  const claimBtn = document.getElementById('affClaimBtn');

  if (claimBtn) {

    claimBtn.disabled = (data.pending || 0) < minClaim;

    claimBtn.textContent = (data.pending || 0) >= minClaim ? 'Claim' : 'Nothing to claim';

  }



  const listEl = document.getElementById('affReferrals');

  if (!listEl) return;



  if (!data.referrals.length) {

    listEl.innerHTML = '<p class="aff-empty">No referrals yet. Share your link to start earning commission.</p>';

    return;

  }



  listEl.innerHTML = [...data.referrals]

    .sort((a, b) => (b.joinedAt || 0) - (a.joinedAt || 0))

    .map(ref => `

      <div class="aff-ref-row">

        <div>

          <span class="aff-ref-name">${escapeHtml(ref.username)}</span>

          <span class="aff-ref-meta">Joined ${formatDate(ref.joinedAt)}</span>

        </div>

        <span class="aff-ref-wagered">${formatMoney(ref.wagered || 0)}</span>

      </div>`)

    .join('');

}



async function copyReferralLink() {

  const input = document.getElementById('affLinkInput');

  const btn = document.getElementById('affCopyBtn');

  if (!input || !btn) return;



  try {

    await navigator.clipboard.writeText(input.value);

    btn.textContent = 'Copied!';

  } catch {

    input.select();

    document.execCommand('copy');

    btn.textContent = 'Copied!';

  }

  setTimeout(() => { btn.textContent = 'Copy'; }, 1500);

}



async function claimCommission() {

  const btn = document.getElementById('affClaimBtn');

  if (btn) btn.disabled = true;

  const claimed = await window.XythonAffiliates?.claim?.();

  if (claimed > 0) renderAffiliates();

  else if (btn) {

    const data = window.XythonAffiliates?.get?.();

    btn.disabled = (data?.pending || 0) < (window.XythonAffiliates?.minClaim || 0.01);

  }

}



function escapeHtml(text) {

  const div = document.createElement('div');

  div.textContent = text;

  return div.innerHTML;

}

