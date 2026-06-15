document.addEventListener('DOMContentLoaded', () => {
  initCommon();

  if (!window.XythonAuth?.isLoggedIn?.()) {
    window.XythonAuth?.requireAuth?.('login');
    return;
  }

  const statusEl = document.getElementById('exclusionStatus');
  const formPanel = document.getElementById('exclusionFormPanel');
  const messageEl = document.getElementById('exclusionMessage');
  const submitBtn = document.getElementById('exclusionSubmit');
  const confirmInput = document.getElementById('exclusionConfirmUser');

  function renderStatus() {
    const status = window.XythonAccount.getStatus?.();
    const active = window.XythonAccount.isSelfExcluded?.();

    if (!active || !status) {
      statusEl.hidden = true;
      formPanel.hidden = false;
      return;
    }

    const end = window.XythonAccount.formatSelfExclusionEnd?.();
    statusEl.textContent = end
      ? `Self-exclusion is active until ${end}. Betting and tips are disabled on your account.`
      : 'Permanent self-exclusion is active. Betting and tips are disabled on your account.';
    statusEl.hidden = false;
    formPanel.hidden = status.permanent;
  }

  renderStatus();
  document.addEventListener('xython:account-status', renderStatus);

  submitBtn?.addEventListener('click', async () => {
    messageEl.hidden = true;

    const username = window.XythonAuth.getUsername?.() || '';
    const typed = (confirmInput?.value || '').trim();
    if (!typed || typed.toLowerCase() !== username.toLowerCase()) {
      showMessage('Type your username exactly to confirm', true);
      return;
    }

    const duration = document.querySelector('input[name="exclusionDuration"]:checked')?.value;
    if (!duration) {
      showMessage('Choose an exclusion period', true);
      return;
    }

    const label = duration === 'permanent' ? 'permanently' : `for ${duration}`;
    const ok = window.confirm(
      `Activate self-exclusion ${label}?\n\nYou will not be able to place bets or send tips during this period.`
    );
    if (!ok) return;

    submitBtn.disabled = true;
    const result = await window.XythonAccount.requestSelfExclusion(duration);
    submitBtn.disabled = false;

    if (!result.ok) {
      showMessage(result.error || 'Could not activate self-exclusion', true);
      return;
    }

    confirmInput.value = '';
    renderStatus();
    showMessage('Self-exclusion activated', false);
  });

  function showMessage(text, isError) {
    messageEl.textContent = text;
    messageEl.className = `security-message ${isError ? 'is-error' : 'is-success'}`;
    messageEl.hidden = false;
  }
});
