function renderGames() {
  renderGameGrid('originalsGrid', GAMES.originals.slice(0, 8));
  renderGameGrid('slotsGrid', GAMES.slots);
}

function renderProviders() {
  const grid = document.getElementById('providersGrid');
  if (!grid) return;
  PROVIDERS.forEach(name => {
    const card = document.createElement('div');
    card.className = 'provider-card';
    card.textContent = name;
    grid.appendChild(card);
  });
}

const PROMO_ACTIONS = {
  originals: () => { window.location.href = 'originals.html'; },
  war: () => { window.location.href = 'war.html'; },
  plinko: () => { window.location.href = 'plinko.html'; },
  rewards: () => {
    if (window.XythonAuth?.isLoggedIn?.()) {
      window.openRewardsPopout?.();
      return;
    }
    window.openAuthModal?.('register');
  },
};

function handlePromoAction(action) {
  PROMO_ACTIONS[action]?.();
}

function initCarousel() {
  const carousel = document.getElementById('promoCarousel');
  const slides = carousel?.querySelectorAll('.promo-slide');
  const dotsContainer = document.getElementById('carouselDots');
  const prevBtn = document.getElementById('carouselPrev');
  const nextBtn = document.getElementById('carouselNext');
  if (!carousel || !slides?.length || !dotsContainer || !prevBtn || !nextBtn) return;

  let current = 0;
  let interval;

  slides.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = `carousel-dot${i === 0 ? ' active' : ''}`;
    dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      goTo(i);
      restartAuto();
    });
    dotsContainer.appendChild(dot);
  });

  const dots = dotsContainer.querySelectorAll('.carousel-dot');

  function goTo(index) {
    slides[current].classList.remove('active');
    dots[current].classList.remove('active');
    current = (index + slides.length) % slides.length;
    slides[current].classList.add('active');
    dots[current].classList.add('active');
  }

  function next() { goTo(current + 1); }
  function prev() { goTo(current - 1); }

  prevBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    prev();
    restartAuto();
  });

  nextBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    next();
    restartAuto();
  });

  carousel.querySelectorAll('[data-promo-action]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handlePromoAction(btn.dataset.promoAction);
    });
  });

  function startAuto() {
    stopAuto();
    interval = setInterval(next, 5000);
  }

  function stopAuto() {
    clearInterval(interval);
  }

  function restartAuto() {
    stopAuto();
    startAuto();
  }

  carousel.addEventListener('mouseenter', stopAuto);
  carousel.addEventListener('mouseleave', startAuto);
  startAuto();
}

function initFilters() {
  const tabs = document.querySelectorAll('.filter-tab[data-filter]');
  const sections = document.querySelectorAll('.game-section:not(.providers-section)');
  const providers = document.querySelector('.providers-section');
  const search = document.getElementById('gameSearch');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const filter = tab.dataset.filter;
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      sections.forEach(section => {
        if (filter === 'all') {
          section.classList.remove('hidden');
        } else {
          section.classList.toggle('hidden', section.dataset.category !== filter);
        }
      });

      providers?.classList.toggle('hidden', filter !== 'all');

      if (search) search.value = '';
      document.querySelectorAll('.game-card').forEach(card => { card.style.display = ''; });
    });
  });

  if (search) {
    search.addEventListener('input', () => {
      const query = search.value.toLowerCase().trim();
      document.querySelectorAll('.game-card').forEach(card => {
        const name = card.dataset.name || '';
        card.style.display = !query || name.includes(query) ? '' : 'none';
      });
      if (query) {
        sections.forEach(s => s.classList.remove('hidden'));
        providers?.classList.remove('hidden');
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initCommon();
  renderGames();
  renderProviders();
  renderLiveWins();
  initCarousel();
  initFilters();
  initCasinoJackpots();
  document.addEventListener('xython:leaderboard-change', () => {
    renderLiveWins();
  });
});

function getStatsApiUrl() {
  if (window.NBD_STATS_API) return window.NBD_STATS_API;
  if (location.protocol === 'http:' || location.protocol === 'https:') {
    return `${location.origin}/api/stats`;
  }
  return null;
}

async function updateJackpotOnline() {
  const el = document.getElementById('jackpotOnline');
  if (!el) return;
  const url = getStatsApiUrl();
  if (!url) return;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (res.ok && typeof data.playersOnline === 'number') {
      el.textContent = data.playersOnline.toLocaleString('en-US');
    }
  } catch {
    // keep current display
  }
}

function initCasinoJackpots() {
  const daily = document.getElementById('jackpotDaily');
  const paid = document.getElementById('jackpotPaid');
  const online = document.getElementById('jackpotOnline');
  if (!daily) return;

  daily.textContent = 's00n';
  if (paid) paid.textContent = '67m+';

  if (online) {
    updateJackpotOnline();
    setInterval(updateJackpotOnline, 60000);
  }
}
