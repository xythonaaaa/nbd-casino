document.addEventListener('DOMContentLoaded', () => {
  initCommon();

  if (!window.XythonAuth?.isLoggedIn?.()) {
    window.XythonAuth?.requireAuth?.('login');
    return;
  }

  renderProfile();
  bindProfileEvents();
});

function renderProfile() {
  const user = window.XythonAuth.getUser();
  if (!user) return;

  const initial = user.username[0].toUpperCase();
  const stats = window.XythonStats?.get() || { totalBets: 0, wins: 0, losses: 0, wagered: 0 };
  const profile = window.XythonProfile.get();
  const rank = window.XythonRanks?.get(stats.wagered) || { displayName: 'Unranked', progressPct: 0, color: '#737373', current: { tier: 'unranked' } };
  const winRate = stats.totalBets > 0 ? ((stats.wins / stats.totalBets) * 100).toFixed(1) : '0';

  window.XythonProfile.applyAvatar(document.getElementById('profileAvatar'), initial);
  document.getElementById('profileAvatarRemove').hidden = !window.XythonProfile.getAvatarUrl();

  document.getElementById('profileHeaderName').textContent = user.username;
  document.getElementById('profileJoined').textContent = `Joined ${formatJoinedDate(user.registeredAt)}`;

  const ringEl = document.getElementById('profileRankRing');
  ringEl.dataset.tier = rank.current.tier;
  ringEl.style.setProperty('--rank-color', rank.color);
  document.getElementById('profileRankPct').textContent = `${rank.progressPct.toFixed(1)}%`;
  document.getElementById('profileRankLabel').textContent = rank.displayName;
  setRankRing(rank.progressPct);

  const nextEl = document.getElementById('profileRankNext');
  if (rank.isMax) {
    nextEl.textContent = 'Maximum rank reached';
  } else if (rank.next) {
    nextEl.textContent = `$${rank.remaining.toFixed(2)} wagered to reach ${rank.nextName}`;
  } else {
    nextEl.textContent = '';
  }
  document.getElementById('statTotalBets').textContent = stats.totalBets;
  document.getElementById('statWins').textContent = stats.wins;
  document.getElementById('statLosses').textContent = stats.losses;
  document.getElementById('statWagered').textContent = `$${stats.wagered.toFixed(2)}`;
  document.getElementById('profileWinRateFill').style.width = `${winRate}%`;
  document.getElementById('profileWinRateText').textContent = `Win rate — ${winRate}%`;
  document.getElementById('profileUsername').value = user.username;
  document.getElementById('profileEmail').value = profile.email || '';
}

function bindProfileEvents() {
  const avatarBtn = document.getElementById('profileAvatarBtn');
  const avatarInput = document.getElementById('profileAvatarInput');
  const avatarRemove = document.getElementById('profileAvatarRemove');

  avatarBtn?.addEventListener('click', () => avatarInput?.click());

  avatarInput?.addEventListener('change', async () => {
    const file = avatarInput.files?.[0];
    avatarInput.value = '';
    if (!file) return;

    try {
      const dataUrl = await processAvatarFile(file);
      window.XythonProfile.save({ avatar: dataUrl });
      renderProfile();
      showProfileToast('Profile picture updated');
    } catch (err) {
      showProfileToast(err.message || 'Could not upload image', 'error');
    }
  });

  avatarRemove?.addEventListener('click', () => {
    window.XythonProfile.save({ avatar: null });
    renderProfile();
    showProfileToast('Profile picture removed');
  });

  document.getElementById('profileVerifyEmail')?.addEventListener('click', () => {
    const email = document.getElementById('profileEmail')?.value.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showProfileToast('Enter a valid email address', 'error');
      return;
    }
    window.XythonProfile.save({ email });
    showProfileToast('Verification email sent!');
  });

  document.getElementById('profileEmail')?.addEventListener('change', e => {
    window.XythonProfile.save({ email: e.target.value.trim() });
  });

  document.getElementById('profileToggleInfo')?.addEventListener('click', () => {
    document.querySelector('.profile-card:last-child')?.classList.toggle('profile-info-hidden');
  });

  document.getElementById('profileRequestStats')?.addEventListener('click', () => {
    const stats = window.XythonStats?.get() || {};
    const user = window.XythonAuth.getUser();
    const blob = new Blob([JSON.stringify({ username: user?.username, stats }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'xython-statistics.json';
    a.click();
    URL.revokeObjectURL(url);
    showProfileToast('Statistics downloaded');
  });

  document.addEventListener('xython:profile-change', renderProfile);
  document.addEventListener('xython:stats-change', renderProfile);
}

const RING_CIRCUMFERENCE = 238.76;

function setRankRing(pct) {
  const ring = document.getElementById('profileRingFill');
  if (!ring) return;
  const offset = RING_CIRCUMFERENCE - (RING_CIRCUMFERENCE * Math.min(100, pct)) / 100;
  ring.style.strokeDashoffset = String(offset);
}

function processAvatarFile(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Please choose an image file'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      reject(new Error('Image must be under 5 MB'));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const min = Math.min(img.width, img.height);
        const sx = (img.width - min) / 2;
        const sy = (img.height - min) / 2;
        ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => reject(new Error('Could not read image'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

function formatJoinedDate(timestamp) {
  const date = new Date(timestamp || Date.now());
  const day = date.getDate();
  const month = date.toLocaleString('en-GB', { month: 'long' });
  const year = date.getFullYear();
  return `${day} ${month}, ${year}`;
}

function showProfileToast(message, type = 'success') {
  const toast = document.getElementById('profileToast');
  if (!toast) return;
  toast.textContent = message;
  toast.style.color = type === 'error' ? '#f87171' : '#4ade80';
  toast.hidden = false;
  clearTimeout(showProfileToast._timer);
  showProfileToast._timer = setTimeout(() => {
    toast.hidden = true;
  }, 2500);
}
