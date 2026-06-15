document.addEventListener('DOMContentLoaded', () => {
  initCommon();

  if (!window.XythonAuth?.isLoggedIn?.()) {
    window.XythonAuth?.requireAuth?.('login');
    return;
  }

  const form = document.getElementById('securityPasswordForm');
  const messageEl = document.getElementById('secPasswordMessage');
  const submitBtn = document.getElementById('secPasswordSubmit');

  form?.addEventListener('submit', async e => {
    e.preventDefault();
    messageEl.hidden = true;

    const current = document.getElementById('secCurrentPassword')?.value || '';
    const next = document.getElementById('secNewPassword')?.value || '';
    const confirm = document.getElementById('secConfirmPassword')?.value || '';

    if (next !== confirm) {
      showMessage('New passwords do not match', true);
      return;
    }

    submitBtn.disabled = true;
    const result = await window.XythonAccount.changePassword(current, next);
    submitBtn.disabled = false;

    if (!result.ok) {
      showMessage(result.error || 'Could not update password', true);
      return;
    }

    form.reset();
    showMessage('Password updated successfully', false);
  });

  function showMessage(text, isError) {
    messageEl.textContent = text;
    messageEl.className = `security-message ${isError ? 'is-error' : 'is-success'}`;
    messageEl.hidden = false;
  }
});
