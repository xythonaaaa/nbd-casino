const FIELD_MAP = {
  setEmailMarketing: 'emailMarketing',
  setPrivateMode: 'privateMode',
  setHideStatistics: 'hideStatistics',
  setHideRaceStatistics: 'hideRaceStatistics',
  setStreamerMode: 'streamerMode',
  setFiatView: 'fiatView',
  setFiatFormat: 'fiatFormat',
};

document.addEventListener('DOMContentLoaded', () => {
  initCommon();

  if (!window.XythonAuth?.isLoggedIn?.()) {
    window.XythonAuth?.requireAuth?.('login');
    return;
  }

  const settings = window.XythonSettings.get();
  applySettingsToForm(settings);

  document.getElementById('setSaveBtn')?.addEventListener('click', () => {
    const next = readSettingsFromForm();
    window.XythonSettings.save(next);
    showToast();
  });

  document.getElementById('setRefreshApp')?.addEventListener('click', () => {
    window.location.reload();
  });

  document.getElementById('setResetAccount')?.addEventListener('click', () => {
    const ok = confirm(
      'Reset all balance, stats, rakeback, and rank progress?\n\nYour username, settings, and profile photo will be kept.'
    );
    if (!ok) return;
    if (!confirm('This cannot be undone. Reset now?')) return;

    if (window.XythonAccount?.reset?.()) {
      window.location.href = 'profile.html';
    }
  });
});

function applySettingsToForm(settings) {
  Object.entries(FIELD_MAP).forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = !!settings[key];
    else el.value = settings[key];
  });
}

function readSettingsFromForm() {
  const settings = { ...window.XythonSettings.defaults };
  Object.entries(FIELD_MAP).forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.type === 'checkbox') settings[key] = el.checked;
    else settings[key] = el.value;
  });
  return settings;
}

function showToast() {
  const toast = document.getElementById('setToast');
  if (!toast) return;
  toast.hidden = false;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.hidden = true;
  }, 2500);
}
