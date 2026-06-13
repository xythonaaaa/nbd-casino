function renderGames() {
  renderGameGrid('originalsGrid', GAMES.originals.slice(0, 8));
  renderGameGrid('slotsGrid', GAMES.slots);
  renderGameGrid('newReleasesGrid', GAMES.newReleases);
  renderGameGrid('liveGrid', GAMES.live);
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

function initCarousel() {
  const carousel = document.getElementById('promoCarousel');
  const slides = document.querySelectorAll('.promo-slide');
  const dotsContainer = document.getElementById('carouselDots');
  const prevBtn = document.getElementById('carouselPrev');
  const nextBtn = document.getElementById('carouselNext');
  if (!carousel || !slides.length) return;

  let current = 0;
  let interval;

  slides.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.className = `carousel-dot${i === 0 ? ' active' : ''}`;
    dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
    dot.addEventListener('click', () => goTo(i));
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

  prevBtn.addEventListener('click', prev);
  nextBtn.addEventListener('click', next);

  function startAuto() {
    interval = setInterval(next, 5000);
  }

  function stopAuto() {
    clearInterval(interval);
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
  renderLiveWins([...GAMES.originals, ...GAMES.slots, ...GAMES.live]);
  renderBets([...GAMES.originals, ...GAMES.slots, ...GAMES.live]);
  renderChat();
  initCarousel();
  initFilters();
  initCasinoJackpots();
  setInterval(() => renderBets([...GAMES.originals, ...GAMES.slots, ...GAMES.live]), 15000);
  document.addEventListener('xython:leaderboard-change', () => {
    renderLiveWins([...GAMES.originals, ...GAMES.slots, ...GAMES.live]);
    updateJackpotPaid();
  });
});

function initCasinoJackpots() {
  const daily = document.getElementById('jackpotDaily');
  const online = document.getElementById('jackpotOnline');
  if (!daily) return;

  let dailyVal = 124892.5;
  setInterval(() => {
    dailyVal += Math.random() * 12 + 2;
    daily.textContent = `$${dailyVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }, 3000);

  if (online) {
    let count = 1180 + Math.floor(Math.random() * 120);
    setInterval(() => {
      count += Math.floor(Math.random() * 7) - 3;
      count = Math.max(980, Math.min(2400, count));
      online.textContent = count.toLocaleString('en-US');
    }, 5000);
  }

  updateJackpotPaid();
}

function updateJackpotPaid() {
  const el = document.getElementById('jackpotPaid');
  if (!el || !window.NbdLeaderboard) return;
  const wins = window.NbdLeaderboard.getRecentWins?.(500) || [];
  const total = wins.reduce((sum, w) => sum + w.payout, 0);
  if (total >= 1000000) {
    el.textContent = `$${(total / 1000000).toFixed(1)}M+`;
  } else if (total >= 1000) {
    el.textContent = `$${Math.round(total / 1000)}K+`;
  } else if (total > 0) {
    el.textContent = `$${total.toLocaleString('en-US', { maximumFractionDigits: 0 })}+`;
  }
}
