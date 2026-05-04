/* =========================================================================
   Em & Trish — trip site
   Vanilla JS, hash-routed, mobile-first.
   v1.1 — collapse past days, date picker, flight reorder, lavender day
   cards, full Journal feed with Vercel Blob/KV.
   ========================================================================= */
(() => {
  // ---------- timezone helpers ----------
  const TZ_OFFSETS = { EDT: -4, EST: -5, JST: 9, ICT: 7, PHT: 8, KST: 9 };
  const TZ_IANA = {
    EDT: 'America/New_York', EST: 'America/New_York',
    JST: 'Asia/Tokyo', ICT: 'Asia/Bangkok', PHT: 'Asia/Manila', KST: 'Asia/Seoul',
  };

  function dateOf(dateStr, timeStr, tzLabel) {
    if (!dateStr || !timeStr) return null;
    if (!/^\d{2}:\d{2}$/.test(timeStr)) return null;
    const [y, m, d] = dateStr.split('-').map(Number);
    const [hh, mm] = timeStr.split(':').map(Number);
    const offset = TZ_OFFSETS[tzLabel] ?? 0;
    return new Date(Date.UTC(y, m - 1, d, hh - offset, mm));
  }

  function fmtTimeIn(tzIana, date) {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tzIana, hour: 'numeric', minute: '2-digit', hour12: true,
    }).format(date);
  }
  function fmtDateIn(tzIana, date) {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tzIana, weekday: 'short', month: 'short', day: 'numeric',
    }).format(date);
  }
  function fmtCountdown(ms) {
    if (ms <= 0) return '0m';
    const total = Math.floor(ms / 1000);
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }
  function fmtTimeFromHHMM(hhmm) {
    if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return hhmm || '';
    const [h, m] = hhmm.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
  }
  function fmtRelative(iso) {
    const now = Date.now();
    const t = new Date(iso).getTime();
    const ms = now - t;
    const min = Math.floor(ms / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const d = Math.floor(hr / 24);
    if (d < 7) return `${d}d ago`;
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  // ---------- state ----------
  const state = {
    trip: null,
    timeline: null,
    vault: null,
    route: 'timeline',
    vaultCountry: 'Bangkok',
    expanded: new Set(),
    otgOpen: new Set(),
    datePickerOpen: false,
    viewFromDate: null,    // null = today; otherwise an ISO date the user jumped to
    journal: {
      loading: false,
      configured: null,    // null = unknown, true = ready, false = not set up
      authed: false,
      posts: [],
      modal: null,         // null | 'passcode' | 'composer'
      composer: { author: 'Em', caption: '', location: '', photoFile: null, photoPreview: null, posting: false },
    },
  };

  // ---------- data loading ----------
  async function load() {
    const [trip, timeline, vault] = await Promise.all([
      fetch('data/trip.json').then(r => r.json()),
      fetch('data/timeline.json').then(r => r.json()),
      fetch('data/vault.json').then(r => r.json()),
    ]);
    state.trip = trip;
    state.timeline = timeline;
    state.vault = vault;
    state.vaultCountry = currentSegment().vault_segment;
    // pre-fill composer author from local pref
    const a = localStorage.getItem('et_author');
    if (a === 'Em' || a === 'Trish') state.journal.composer.author = a;
  }

  async function refreshAuth() {
    try {
      const r = await fetch('api/auth');
      if (!r.ok) throw new Error('auth check failed');
      const data = await r.json();
      state.journal.configured = data.configured;
      state.journal.authed = data.authed;
    } catch {
      state.journal.configured = false;
      state.journal.authed = false;
    }
  }

  async function loadPosts() {
    state.journal.loading = true;
    try {
      const r = await fetch('api/posts');
      if (r.status === 503) {
        state.journal.configured = false;
        state.journal.posts = [];
      } else if (r.ok) {
        const data = await r.json();
        state.journal.posts = data.posts || [];
      } else {
        state.journal.posts = [];
      }
    } catch {
      state.journal.posts = [];
    } finally {
      state.journal.loading = false;
    }
  }

  // ---------- icons ----------
  const ICON = {
    cal:    `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`,
    plane:  `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.2.6-.6.5-1.1z"/></svg>`,
    bed:    `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20v-7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v7M4 11V7a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v4M2 17h20"/></svg>`,
    map:    `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
    locate: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/></svg>`,
    search: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
    lock:   `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lock-icon"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
    edit:   `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="edit-icon"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="m18.5 2.5 3 3L12 15l-4 1 1-4z"/></svg>`,
    copy:   `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
    chevDn: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
    chevUp: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>`,
    plus:   `<svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>`,
    sun:    `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`,
    phone:  `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0 1 22 16.92z"/></svg>`,
    file:   `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h4"/></svg>`,
    shield: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-12V5l-8-3-8 3v5c0 8 8 12 8 12z"/><path d="M12 8v4M12 16h.01"/></svg>`,
    sim:    `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><circle cx="12" cy="14" r="3"/></svg>`,
    train:  `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="16" rx="2"/><path d="M4 11h16M8 15h.01M16 15h.01M9 19l-2 3M15 19l2 3"/></svg>`,
    arrow:  `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M7 7h10v10"/></svg>`,
    check:  `<svg viewBox="0 0 24 24" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    journ:  `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 5 0-5H20"/><path d="M9 7h7M9 11h5"/></svg>`,
    vault:  `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M12 7v2M12 15v2M7 12h2M15 12h2"/></svg>`,
    timl:   `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h2M14 14h2M8 18h2"/></svg>`,
    image:  `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.81.01L6 21"/></svg>`,
    chat:   `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v12H5.17L4 17.17z"/></svg>`,
    link:   `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8"/></svg>`,
    send:   `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg>`,
    close:  `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`,
    pin:    `<svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
    drive:  `<svg viewBox="0 0 24 24" style="flex-shrink:0"><path fill="#FFC107" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A10.997 10.997 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.997 10.997 0 0 0 1 12c0 1.78.43 3.46 1.18 4.93z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>`,
  };

  // ---------- segment / now-state helpers ----------
  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }
  function currentSegment() {
    const today = todayISO();
    const segs = state.trip.segments;
    let active = segs[0];
    for (const s of segs) {
      if (today >= s.from) active = s;
    }
    const vault_segment = (active.country === 'Philippines') ? 'Philippines' : 'Bangkok';
    return { ...active, vault_segment };
  }
  function tripDayInfo() {
    const today = new Date(todayISO());
    const start = new Date(state.trip.start_date);
    const end = new Date(state.trip.end_date);
    const totalDays = Math.round((end - start) / 86400000) + 1;
    if (today < start) {
      const days = Math.ceil((start - today) / 86400000);
      return { label: `Trip in ${days}d`, kind: 'pre', dayN: 0, totalDays };
    }
    if (today > end) return { label: 'Trip complete', kind: 'post', dayN: totalDays, totalDays };
    const dayN = Math.round((today - start) / 86400000) + 1;
    return { label: `Day ${dayN} of ${totalDays}`, kind: 'live', dayN, totalDays };
  }
  function nextLockedEvent() {
    const now = new Date();
    for (const day of state.timeline.days) {
      for (const ev of day.events) {
        if (!ev.locked) continue;
        const d = dateOf(day.date, ev.time, ev.tz);
        if (d && d > now) return { day, ev, d };
      }
    }
    return null;
  }

  // ---------- routing ----------
  function parseRoute() {
    const h = location.hash.replace(/^#\/?/, '');
    if (h === 'vault') return 'vault';
    if (h === 'journal') return 'journal';
    return 'timeline';
  }
  window.addEventListener('hashchange', () => {
    state.route = parseRoute();
    state.datePickerOpen = false;
    if (state.route === 'journal') ensureJournalLoaded();
    render();
  });

  // ---------- toast ----------
  let toastTimer;
  function toast(msg) {
    let t = document.querySelector('.toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
  }

  // ---------- helpers ----------
  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  function escapeHtml(s) {
    return String(s ?? '')
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  }
  function srcColor(source) {
    const map = {
      'Booking.com': 'var(--src-booking)',
      'Agoda':       'var(--src-agoda)',
      'Chase Travel':'var(--src-chase)',
      'Trip.com':    'var(--src-trip)',
      'Direct airline':'var(--src-direct)',
      'Direct':      'var(--src-direct)',
      'Kiwi.com':    'var(--src-kiwi)',
      'Family':      'var(--lavender-deep)',
    };
    return map[source] || 'var(--muted)';
  }
  function airlinePill(airline) {
    if (!airline) return { code: '✈', color: 'var(--muted)' };
    const map = [
      [/Nippon|ANA/i,     { code: 'ANA', color: 'var(--coral)' }],
      [/Korean Air/i,     { code: 'KE',  color: 'var(--cerulean)' }],
      [/Philippine Air/i, { code: 'PR',  color: 'var(--cerulean)' }],
      [/AirAsia/i,        { code: 'Z2',  color: 'var(--coral)' }],
      [/JAL|Japan Air/i,  { code: 'JL',  color: 'var(--coral)' }],
      [/Thai/i,           { code: 'TG',  color: 'var(--lavender-deep)' }],
    ];
    for (const [re, v] of map) if (re.test(airline)) return v;
    return { code: airline.slice(0, 3).toUpperCase(), color: 'var(--muted)' };
  }
  function cleanPhone(v) {
    if (v == null) return '';
    return String(v).replace(/\.0$/, '').trim();
  }
  function telHref(v) { return 'tel:' + cleanPhone(v).replace(/\s+/g, ''); }
  function mapsHref(addr) { return 'https://maps.google.com/?q=' + encodeURIComponent(addr); }

  function dayMeta(day) {
    // Build a one-line context string for the date dropdown
    const events = day.events;
    const wedding = events.find(e => /Wedding Day 1/i.test(e.title));
    const wedding2 = events.find(e => /Wedding Day 2/i.test(e.title));
    const tripStart = events.find(e => /Land Bangkok|TRIP BEGINS/i.test(e.title) || (e.notes && /TRIP BEGINS/i.test(e.notes)));
    const tripEnd = events.find(e => e.notes && /TRIP ENDS/i.test(e.notes));
    const flight = events.find(e => e.type === 'transit' && /flight/i.test(e.title));
    if (wedding) return '⭐ Wedding day 1';
    if (wedding2) return '⭐ Wedding day 2';
    if (tripStart) return 'trip begins';
    if (tripEnd) return 'trip ends';
    if (flight) return `${events.length} events · flight day`;
    return `${events.length} event${events.length === 1 ? '' : 's'}`;
  }

  // ---------- render: appbar (with date chip) ----------
  function renderAppbar() {
    const ab = document.getElementById('appbar');
    const di = tripDayInfo();
    ab.innerHTML = '';
    const inner = el(`
      <div>
        <div class="appbar-row">
          <div>
            <h1>${escapeHtml(state.trip.title)}</h1>
            <p class="sub">${escapeHtml(state.trip.subtitle)}</p>
          </div>
          <button class="day-chip ${state.datePickerOpen ? 'open' : ''}" id="day-chip"
                  ${state.route === 'timeline' ? '' : 'style="visibility:hidden"'}>
            ${ICON.cal}
            <span>${escapeHtml(di.label)}</span>
            <span class="day-chip-chev">${state.datePickerOpen ? ICON.chevUp : ICON.chevDn}</span>
          </button>
        </div>
      </div>
    `);
    ab.appendChild(inner);
    const chip = ab.querySelector('#day-chip');
    if (chip) {
      chip.addEventListener('click', e => {
        e.stopPropagation();
        state.datePickerOpen = !state.datePickerOpen;
        render();
      });
    }
  }

  function renderDatePicker() {
    if (!state.datePickerOpen) return null;
    const todayStr = todayISO();
    const wrap = el(`<div class="date-picker" id="date-picker">
      <div class="date-picker-head">
        <div class="date-picker-title">Jump to day</div>
        <div class="date-picker-range">${escapeHtml(state.trip.start_date.slice(5).replace('-', '/'))} – ${escapeHtml(state.trip.end_date.slice(5).replace('-', '/'))}</div>
      </div>
      <div class="date-picker-list"></div>
    </div>`);
    const list = wrap.querySelector('.date-picker-list');

    state.timeline.days.forEach(day => {
      const isToday = day.date === todayStr;
      const isPast = day.date < todayStr;
      const isWedding = /^2026-05-1[67]$/.test(day.date);
      const klass = ['date-row'];
      if (isPast) klass.push('past');
      if (isToday) klass.push('today');

      const dateLabel = new Date(day.date + 'T12:00:00').toLocaleDateString('en-US',
        { weekday: 'short', month: 'short', day: 'numeric' });
      const country = day.country || '';
      const flag = country === 'Thailand' ? ' 🇹🇭' :
                   country === 'Philippines' ? ' 🇵🇭' :
                   country === 'Japan' ? ' 🇯🇵' : '';
      const meta = dayMeta(day);

      const row = el(`<button class="${klass.join(' ')}" data-date="${day.date}">
        <span class="date-row-dot ${isToday ? 'today' : isWedding ? 'wedding' : ''}"></span>
        <span class="date-row-body">
          <span class="date-row-title">${escapeHtml(dateLabel)} · ${escapeHtml(country)}${flag}</span>
          <span class="date-row-meta ${isWedding ? 'wedding' : ''}">${escapeHtml(meta)}${isToday ? ' · TODAY' : ''}</span>
        </span>
        ${isPast ? `<span class="date-row-check">${ICON.check}</span>` :
           isToday ? `<span class="date-row-now">NOW</span>` : ''}
      </button>`);
      row.addEventListener('click', () => {
        state.viewFromDate = day.date;
        state.datePickerOpen = false;
        render();
        requestAnimationFrame(() => {
          const target = document.querySelector(`.day-section[data-date="${day.date}"]`);
          if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
      list.appendChild(row);
    });

    return wrap;
  }

  // dismiss the popover when clicking outside
  document.addEventListener('click', (e) => {
    if (!state.datePickerOpen) return;
    if (e.target.closest('#date-picker, #day-chip')) return;
    state.datePickerOpen = false;
    render();
  });

  // ---------- render: tabbar ----------
  function renderTabbar() {
    const tb = document.getElementById('tabbar');
    tb.innerHTML = '';
    const tabs = [
      { id: 'timeline', label: 'Timeline', icon: ICON.timl },
      { id: 'vault',    label: 'Vault',    icon: ICON.vault },
      { id: 'journal',  label: 'Journal',  icon: ICON.journ },
    ];
    for (const t of tabs) {
      const b = el(`
        <button data-route="${t.id}" class="${state.route === t.id ? 'active' : ''}">
          ${t.icon}<span>${t.label}</span><span class="indicator"></span>
        </button>`);
      b.addEventListener('click', () => { location.hash = '#/' + t.id; });
      tb.appendChild(b);
    }
  }

  // ---------- render: timeline ----------
  function renderSyncCard() {
    const seg = currentSegment();
    const next = nextLockedEvent();
    const now = new Date();
    const localTime = fmtTimeIn(seg.tz, now);
    const localDate = fmtDateIn(seg.tz, now);
    let countdownLabel = 'No upcoming deadline';
    let countdownValue = '—';
    if (next) {
      const ms = next.d - now;
      countdownLabel = `Next: ${next.ev.title}`;
      countdownValue = fmtCountdown(ms);
    }
    return el(`
      <div class="sync">
        <div>
          <div class="sync-time-label">${escapeHtml(seg.label.toUpperCase())} · ${escapeHtml(seg.tz_label)} · ${escapeHtml(localDate)}</div>
          <div class="sync-time">${escapeHtml(localTime)}</div>
        </div>
        <div class="sync-deadline">
          <div class="sync-deadline-tile">${ICON.plane}</div>
          <div class="sync-deadline-text">
            <span class="label">${escapeHtml(countdownLabel)}</span>
            <span class="value">in <span class="accent">${escapeHtml(countdownValue)}</span></span>
          </div>
        </div>
      </div>
    `);
  }

  function renderEventCard(ev, day) {
    const todayStr = todayISO();
    const isPast = day.date < todayStr;
    const isHighlight = ev.title && /Bangkok \(BKK\)/.test(ev.title);
    const klass = ['event-card'];
    if (isPast) klass.push('past');
    if (isHighlight) klass.push('highlight');

    const statusPill = ev.status === 'confirmed'
      ? `<span class="pill confirmed"><span class="dot"></span>Confirmed</span>`
      : ev.status === 'tentative'
      ? `<span class="pill tentative"><span class="dot"></span>Tentative</span>`
      : ev.status === 'done'
      ? `<span class="pill done"><span class="dot"></span>Done</span>` : '';
    const tripBeginsPill = isHighlight ? `<span class="pill trip-begins"><span class="dot"></span>Trip begins</span>` : '';
    const lockOrEdit = ev.locked
      ? ICON.lock
      : (ev.status === 'tentative' || ev.option_a) ? ICON.edit : '';

    const ab = (ev.option_a || ev.option_b) ? `
      <div class="ab-toggle" data-ev="${ev.id}">
        <button class="ab-option selected" data-pick="a">
          <div class="ab-option-head"><span class="ab-option-name">Option A</span><span class="ab-option-radio">${ICON.check}</span></div>
          <div class="ab-option-text">${escapeHtml(ev.option_a || '')}</div>
        </button>
        <button class="ab-option" data-pick="b">
          <div class="ab-option-head"><span class="ab-option-name">Option B</span><span class="ab-option-radio">${ICON.check}</span></div>
          <div class="ab-option-text">${escapeHtml(ev.option_b || '')}</div>
        </button>
      </div>` : '';

    const notesBlock = ev.notes ? `
      <div class="event-notes">
        ${ICON.edit.replace('class="edit-icon"', 'class="event-notes-icon"')}
        <div>
          <div class="event-notes-label">Notes</div>
          <div class="event-notes-text">${escapeHtml(ev.notes)}</div>
        </div>
      </div>` : '';

    const card = el(`
      <div class="${klass.join(' ')}">
        <div class="event-time">
          <span class="event-time-main">${escapeHtml(fmtTimeFromHHMM(ev.time) || '—')}</span>
          <span class="event-time-tz">${escapeHtml(ev.tz || '')}</span>
        </div>
        <div class="event-body">
          <div class="event-title-row"><span class="event-title">${escapeHtml(ev.title)}</span></div>
          ${ev.location ? `<div class="event-meta">${escapeHtml(ev.location)}</div>` : ''}
          <div class="event-foot">${tripBeginsPill || statusPill}${lockOrEdit}</div>
          ${ab}
          ${notesBlock}
        </div>
      </div>`);
    card.querySelectorAll('.ab-option').forEach(btn => {
      btn.addEventListener('click', () => {
        card.querySelectorAll('.ab-option').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });
    return card;
  }

  function renderDaySection(day) {
    const todayStr = todayISO();
    const klass = ['day-section'];
    if (day.date === todayStr) klass.push('today');
    else if (day.date < todayStr) klass.push('past');

    const weekday = day.weekday || new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
    const dateLabel = new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const sec = el(`
      <section class="${klass.join(' ')}" data-date="${day.date}">
        <div class="day-header">
          <div class="day-header-left">
            <span class="day-dot"></span>
            <span class="day-title">${escapeHtml(weekday)}, ${escapeHtml(dateLabel)}</span>
            <span class="day-sub">${escapeHtml(day.country || '')}</span>
          </div>
          <span class="day-count">${day.events.length} event${day.events.length === 1 ? '' : 's'}</span>
        </div>
        <div class="event-list"></div>
      </section>`);
    const list = sec.querySelector('.event-list');
    day.events.forEach(ev => list.appendChild(renderEventCard(ev, day)));
    return sec;
  }

  function renderTimeline() {
    const main = document.getElementById('main');
    main.innerHTML = '';

    // popover (above the sync card if open)
    const dp = renderDatePicker();
    if (dp) main.appendChild(dp);

    main.appendChild(renderSyncCard());

    // filter past unless user has jumped to a past day
    const todayStr = todayISO();
    const filterFrom = state.viewFromDate || todayStr;
    let visible = state.timeline.days.filter(d => d.date >= filterFrom);

    // pre-trip safety: if everything is in the future (filter is today and trip
    // hasn't started), show all days from today's window
    if (visible.length === 0) visible = state.timeline.days;

    // viewing past: small "Today" snap-back chip at top
    if (state.viewFromDate && state.viewFromDate < todayStr) {
      const snap = el(`<button class="snap-today">${ICON.cal}<span>Snap back to today</span></button>`);
      snap.addEventListener('click', () => {
        state.viewFromDate = null;
        render();
        requestAnimationFrame(() => {
          const t = document.querySelector(`.day-section[data-date="${todayStr}"]`)
                  || document.querySelector('.day-section');
          t?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
      main.appendChild(snap);
    }

    visible.forEach(day => main.appendChild(renderDaySection(day)));

    // first paint scroll: jump to today (or first visible day) if no override
    if (!state.viewFromDate) {
      requestAnimationFrame(() => {
        const target = main.querySelector(`.day-section[data-date="${todayStr}"]`)
                    || main.querySelector('.day-section');
        if (target) target.scrollIntoView({ block: 'start', behavior: 'auto' });
      });
    }
  }

  // ---------- render: vault ----------
  function renderCountryToggle() {
    const wrap = el(`
      <div class="country-toggle">
        <button data-country="Bangkok" class="${state.vaultCountry==='Bangkok'?'active':''}">
          <span>🇹🇭</span><span>Bangkok</span><span class="dates">May 9–13</span>
        </button>
        <button data-country="Philippines" class="${state.vaultCountry==='Philippines'?'active':''}">
          <span>🇵🇭</span><span>Philippines</span><span class="dates">May 13–26</span>
        </button>
      </div>`);
    wrap.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => {
        state.vaultCountry = b.dataset.country;
        renderVault();
      });
    });
    return wrap;
  }

  function renderSectionPills() {
    const wrap = el(`
      <div class="section-pills">
        <button data-jump="flights" class="active">${ICON.plane}<span>Flights</span></button>
        <button data-jump="stays">${ICON.bed}<span>Stays</span></button>
        <button data-jump="otg">${ICON.locate}<span>On the Ground</span></button>
      </div>`);
    wrap.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => {
        wrap.querySelectorAll('button').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        const id = 'sec-' + b.dataset.jump;
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    return wrap;
  }

  function flightSubtitle(f) {
    const dep = f.depart || {}, arr = f.arrive || {};
    const depHuman = dep.date ? new Date(dep.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    const arrHuman = arr.date ? new Date(arr.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    const code = f.code || '';
    const codeBit = code ? `${code} · ` : '';
    return `${codeBit}${depHuman} · ${fmtTimeFromHHMM(dep.time)} ${dep.tz || ''} → ${arrHuman} · ${fmtTimeFromHHMM(arr.time)} ${arr.tz || ''}`;
  }

  function renderFlightCard(f) {
    const id = `f-${f.code || f.from}-${f.to}-${f.depart?.date || ''}`;
    const expanded = state.expanded.has(id);
    const ap = airlinePill(f.airline);
    const route = `${escapeHtml(f.from)} → ${escapeHtml(f.to)}`;
    const subtitle = flightSubtitle(f);

    if (!expanded) {
      const card = el(`
        <div class="vault-card vault-card-collapsed" data-flight="${id}">
          <div class="vault-flight-left">
            <div class="airline-pill" style="background:${ap.color}">${escapeHtml(ap.code)}</div>
            <div style="min-width:0">
              <div class="vault-flight-title">${route}</div>
              <div class="vault-flight-sub">${escapeHtml(subtitle)}${f.confirmation ? ` · <span style="font-family:'JetBrains Mono',monospace;font-weight:600;color:var(--cerulean-deep)">${escapeHtml(f.confirmation)}</span>` : ''}</div>
            </div>
          </div>
          ${ICON.chevDn.replace('<svg', '<svg class="chevron"')}
        </div>`);
      card.addEventListener('click', () => { state.expanded.add(id); renderVault(); });
      return card;
    }

    const card = el(`
      <div class="vault-card" data-flight="${id}">
        <div class="vault-flight-head">
          <div class="vault-flight-left">
            <div class="airline-pill" style="background:${ap.color}">${escapeHtml(ap.code)}</div>
            <div style="min-width:0">
              <div class="vault-flight-title">${route}</div>
              <div class="vault-flight-sub">${escapeHtml(subtitle)}</div>
            </div>
          </div>
          <span class="pill confirmed" style="white-space:nowrap"><span class="dot"></span>CONFIRMED</span>
        </div>
        ${f.confirmation ? `
          <div class="confirmation-row">
            <div>
              <div class="confirmation-row-label">Confirmation</div>
              <div class="confirmation-row-code">${escapeHtml(f.confirmation)}</div>
            </div>
            <button class="copy-btn" data-copy="${escapeHtml(f.confirmation)}">${ICON.copy}</button>
          </div>` : ''}
        <div class="action-row">
          ${f.drive_link ? `<a class="action-btn primary" href="${escapeHtml(f.drive_link)}" target="_blank" rel="noopener">${ICON.file}<span>e-Ticket PDF</span></a>` : `<div class="action-btn secondary">${ICON.file}<span>No PDF linked</span></div>`}
        </div>
        ${(f.source) ? `
          <div class="source-row">
            <span class="label">Booked via</span><span class="source-pill" style="background:${srcColor(f.source)}">${escapeHtml(f.source)}</span>
            ${f.notes ? ` · <span>${escapeHtml(f.notes)}</span>` : ''}
          </div>` : ''}
      </div>`);
    card.addEventListener('click', e => {
      if (e.target.closest('a, .copy-btn')) return;
      state.expanded.delete(id);
      renderVault();
    });
    card.querySelectorAll('.copy-btn').forEach(b => {
      b.addEventListener('click', e => {
        e.stopPropagation();
        navigator.clipboard?.writeText(b.dataset.copy);
        toast('Confirmation copied');
      });
    });
    return card;
  }

  function renderStayCard(s) {
    const id = `s-${s.name}-${s.check_in_date}`;
    const expanded = state.expanded.has(id);
    const ci = s.check_in_date ? new Date(s.check_in_date + 'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '';
    const co = s.check_out_date ? new Date(s.check_out_date + 'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '';
    const subtitle = `${ci} → ${co}${s.nights ? ` · ${s.nights} night${s.nights === 1 ? '' : 's'}` : ''}`;

    if (!expanded) {
      const card = el(`
        <div class="vault-card vault-card-collapsed" data-stay="${id}">
          <div style="min-width:0;flex:1">
            <div class="vault-stay-title">${escapeHtml(s.name)}</div>
            <div class="vault-stay-sub">${escapeHtml(subtitle)}${s.confirmation ? ` · <span style="font-family:'JetBrains Mono',monospace;font-weight:600;color:var(--cerulean-deep)">${escapeHtml(s.confirmation)}</span>` : ''}</div>
            ${s.source ? `<div style="margin-top:4px;display:flex;align-items:center;gap:6px"><span class="source-pill" style="background:${srcColor(s.source)};font-size:9px;padding:1px 5px">${escapeHtml(s.source)}</span><span style="font-size:10px;color:var(--faint)">${s.drive_link ? '· Drive linked' : ''}</span></div>` : ''}
          </div>
          ${ICON.chevDn.replace('<svg', '<svg class="chevron"')}
        </div>`);
      card.addEventListener('click', () => { state.expanded.add(id); renderVault(); });
      return card;
    }

    const card = el(`
      <div class="vault-card" data-stay="${id}">
        <div class="vault-stay-head">
          <div style="min-width:0;flex:1">
            <div class="vault-stay-title">${escapeHtml(s.name)}</div>
            <div class="vault-stay-sub">${escapeHtml(s.address || '')}${s.city ? ` · ${escapeHtml(s.city)}` : ''}${s.nights ? ` · ${s.nights} night${s.nights === 1 ? '' : 's'}` : ''}</div>
            <div class="vault-stay-sub" style="margin-top:2px">${escapeHtml(subtitle)} · Check-in ${s.check_in_time ? fmtTimeFromHHMM(s.check_in_time) : '—'}</div>
          </div>
          <span class="pill confirmed" style="white-space:nowrap"><span class="dot"></span>CONFIRMED</span>
        </div>
        ${s.confirmation ? `
          <div class="confirmation-row">
            <div>
              <div class="confirmation-row-label">Booking ref</div>
              <div class="confirmation-row-code">${escapeHtml(s.confirmation)}</div>
            </div>
            <button class="copy-btn" data-copy="${escapeHtml(s.confirmation)}">${ICON.copy}</button>
          </div>` : ''}
        <div class="action-row">
          ${s.address ? `<a class="action-btn primary" href="${escapeHtml(mapsHref(s.address))}" target="_blank" rel="noopener">${ICON.map}<span>Open in Maps</span></a>` : ''}
          ${s.phone ? `<a class="action-btn secondary" href="${escapeHtml(telHref(s.phone))}">${ICON.phone}<span>Call hotel</span></a>` : ''}
        </div>
        ${(s.source || s.drive_link) ? `
          <div class="source-row">
            ${s.source ? `<span class="label">Booked via</span><span class="source-pill" style="background:${srcColor(s.source)}">${escapeHtml(s.source)}</span>` : ''}
            ${s.drive_link ? ` · <span class="drive">${ICON.drive}<a href="${escapeHtml(s.drive_link)}" target="_blank" rel="noopener">Drive: voucher</a></span>` : ''}
          </div>` : ''}
      </div>`);
    card.addEventListener('click', e => {
      if (e.target.closest('a, .copy-btn')) return;
      state.expanded.delete(id);
      renderVault();
    });
    card.querySelectorAll('.copy-btn').forEach(b => {
      b.addEventListener('click', e => {
        e.stopPropagation();
        navigator.clipboard?.writeText(b.dataset.copy);
        toast('Booking ref copied');
      });
    });
    return card;
  }

  function renderOTGCard(o, idx) {
    const id = `o-${idx}`;
    const open = state.otgOpen.has(id);
    const isDanger = o.category === 'emergency' || o.category === 'customer service';
    const icon = (o.category === 'transport') ? ICON.train
              : (o.category === 'SIM')        ? ICON.sim
              : ICON.shield;
    if (isDanger) {
      const card = el(`
        <div class="otg-card ${o.category === 'emergency' ? 'danger' : ''}" data-otg="${id}">
          <div class="otg-card-head" style="cursor:pointer">
            <div class="otg-card-head-left">${icon}<span class="otg-card-title">${escapeHtml(o.title)}</span></div>
            ${ICON.chevDn.replace('<svg', `<svg class="chevron ${open?'open':''}" style="${o.category==='emergency'?'stroke:var(--coral-deep)':''}"`)}
          </div>
          <div class="otg-card-body ${open?'':'hidden'}">
            <div class="row"><span>${escapeHtml(o.details)}</span>${/^\+?[\d\s\-]+$/.test(o.details) ? `<a href="${escapeHtml(telHref(o.details))}">${ICON.phone}</a>` : ''}</div>
            ${o.notes ? `<div class="row"><span style="font-size:11px;color:var(--muted)">${escapeHtml(o.notes)}</span></div>` : ''}
          </div>
        </div>`);
      card.querySelector('.otg-card-head').addEventListener('click', () => {
        if (state.otgOpen.has(id)) state.otgOpen.delete(id); else state.otgOpen.add(id);
        renderVault();
      });
      return card;
    }
    return el(`
      <div class="otg-card">
        <div class="otg-card-head"><div class="otg-card-head-left">${icon}<span class="otg-card-title">${escapeHtml(o.title)}</span></div></div>
        <div class="otg-card-body">
          <div class="row"><span>${escapeHtml(o.details)}</span></div>
          ${o.notes ? `<div class="row"><span style="font-size:11px;color:var(--muted)">${escapeHtml(o.notes)}</span></div>` : ''}
        </div>
      </div>`);
  }

  function renderVault() {
    const main = document.getElementById('main');
    main.innerHTML = '';
    main.appendChild(renderCountryToggle());
    main.appendChild(renderSectionPills());

    const country = state.vaultCountry;
    const flights = state.vault.flights[country] || [];
    const stays   = state.vault.stays[country] || [];
    const otg     = state.vault.on_the_ground[country] || [];

    const fSec = el(`
      <section class="vault-section" id="sec-flights">
        <div class="vault-section-header">
          <div class="vault-section-header-left">
            <div class="vault-section-icon">${ICON.plane}</div>
            <div class="vault-section-title">Flights</div>
            <div class="vault-section-count">${flights.length} booking${flights.length===1?'':'s'}</div>
          </div>
        </div>
        <div class="vault-section-list"></div>
      </section>`);
    const fList = fSec.querySelector('.vault-section-list');
    flights.forEach(f => fList.appendChild(renderFlightCard(f)));
    main.appendChild(fSec);

    const sSec = el(`
      <section class="vault-section" id="sec-stays">
        <div class="vault-section-header">
          <div class="vault-section-header-left">
            <div class="vault-section-icon">${ICON.bed}</div>
            <div class="vault-section-title">Stays</div>
            <div class="vault-section-count">${stays.length} booking${stays.length===1?'':'s'}</div>
          </div>
        </div>
        <div class="vault-section-list"></div>
      </section>`);
    const sList = sSec.querySelector('.vault-section-list');
    stays.forEach(s => sList.appendChild(renderStayCard(s)));
    main.appendChild(sSec);

    const oSec = el(`
      <section class="vault-section" id="sec-otg">
        <div class="vault-section-header">
          <div class="vault-section-header-left">
            <div class="vault-section-icon">${ICON.locate}</div>
            <div class="vault-section-title">On the Ground</div>
          </div>
        </div>
        <div class="vault-section-list"></div>
      </section>`);
    const oList = oSec.querySelector('.vault-section-list');
    otg.forEach((o, i) => oList.appendChild(renderOTGCard(o, `${country}-${i}`)));
    main.appendChild(oSec);
  }

  // ---------- render: journal ----------
  function dayBadgeForPost(post) {
    if (!post.day_number || post.day_number < 1) return null;
    return `Day ${post.day_number}`;
  }

  function avatarFor(name) {
    const lc = (name || '').trim().toLowerCase();
    if (lc.startsWith('em')) return { letter: 'E', bg: 'var(--lavender)', fg: 'var(--cerulean-deep)' };
    if (lc.startsWith('trish')) return { letter: 'T', bg: 'var(--cerulean-mist)', fg: 'var(--cerulean-deep)' };
    if (lc.startsWith('mom')) return { letter: 'M', bg: 'var(--lavender-mist)', fg: 'var(--lavender-deep)' };
    if (lc.startsWith('dad')) return { letter: 'D', bg: 'var(--cerulean-mist)', fg: 'var(--cerulean-deep)' };
    return { letter: (name?.[0] || '?').toUpperCase(), bg: 'var(--coral-mist)', fg: 'var(--coral-deep)' };
  }

  function renderComment(c) {
    const av = avatarFor(c.name);
    return el(`
      <div class="comment">
        <div class="avatar small" style="background:${av.bg};color:${av.fg}">${escapeHtml(av.letter)}</div>
        <div class="comment-body">
          <div class="comment-meta">
            <span class="comment-name">${escapeHtml(c.name)}</span>
            <span class="comment-time">${escapeHtml(fmtRelative(c.created_at))}</span>
          </div>
          <div class="comment-text">${escapeHtml(c.text)}</div>
        </div>
      </div>`);
  }

  function renderCommentComposer(post) {
    const savedName = localStorage.getItem('et_visitor_name') || '';
    const wrap = el(`
      <form class="comment-input">
        <input class="comment-name-input" placeholder="your name" maxlength="40" value="${escapeHtml(savedName)}">
        <input class="comment-text-input" placeholder="add a comment…" maxlength="500">
        <button type="submit" class="comment-send" aria-label="Send">${ICON.send}</button>
      </form>`);
    wrap.addEventListener('submit', async e => {
      e.preventDefault();
      const name = wrap.querySelector('.comment-name-input').value.trim();
      const text = wrap.querySelector('.comment-text-input').value.trim();
      if (!name || !text) {
        toast(name ? 'add a comment' : 'add your name');
        return;
      }
      localStorage.setItem('et_visitor_name', name);
      try {
        const r = await fetch(`api/posts/${post.id}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, text }),
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.error || 'failed');
        }
        const data = await r.json();
        const updated = data.post;
        const idx = state.journal.posts.findIndex(p => p.id === post.id);
        if (idx >= 0) state.journal.posts[idx] = updated;
        renderJournal();
      } catch (err) {
        toast('Could not post comment');
      }
    });
    return wrap;
  }

  function renderPost(post) {
    const av = avatarFor(post.author);
    const dayBadge = dayBadgeForPost(post);
    const card = el(`
      <article class="journal-post">
        <div class="post-header">
          <div class="post-header-left">
            <div class="avatar" style="background:${av.bg};color:${av.fg}">${escapeHtml(av.letter)}</div>
            <div>
              <div class="post-author">${escapeHtml(post.author)}</div>
              <div class="post-time">${escapeHtml(fmtRelative(post.created_at))}${post.location ? ` · ${escapeHtml(post.location)}` : ''}</div>
            </div>
          </div>
          ${dayBadge ? `<div class="day-badge"><span class="dot"></span>${escapeHtml(dayBadge.toUpperCase())}</div>` : ''}
        </div>
        ${post.photo_url ? `
          <div class="post-photo">
            <img src="${escapeHtml(post.photo_url)}" alt="" loading="lazy">
            ${post.location ? `<div class="post-photo-pin">${ICON.pin}<span>${escapeHtml(post.location)}</span></div>` : ''}
          </div>` : ''}
        <div class="post-body">
          ${post.caption ? `<div class="post-caption">${escapeHtml(post.caption)}</div>` : ''}
          <div class="post-comments"></div>
        </div>
      </article>`);

    const commentsRoot = card.querySelector('.post-comments');
    (post.comments || []).forEach(c => commentsRoot.appendChild(renderComment(c)));
    commentsRoot.appendChild(renderCommentComposer(post));
    return card;
  }

  function renderJournalEmptyState() {
    return el(`
      <div class="journal-empty">
        <div class="polaroid-stack">
          <div class="polaroid back"><div class="image"></div></div>
          <div class="polaroid front"><div class="image"></div><div class="caption">Day 1 · Bangkok</div></div>
        </div>
        <div>
          <div class="journal-headline">No posts yet</div>
          <div class="journal-sub">When Em or Trish post their first photo or note, it'll appear here. Friends &amp; family can comment on every post.</div>
        </div>
      </div>`);
  }

  function renderJournalNotConfigured() {
    return el(`
      <div class="journal-empty">
        <div class="polaroid-stack">
          <div class="polaroid back"><div class="image"></div></div>
          <div class="polaroid front"><div class="image"></div><div class="caption">Coming soon</div></div>
        </div>
        <div>
          <div class="journal-headline">Journal isn't set up yet</div>
          <div class="journal-sub">Add the Upstash for Redis integration and the Vercel Blob store on Vercel, set <code>JOURNAL_PASSCODE</code>, and redeploy. Then come back here. (See README.)</div>
        </div>
      </div>`);
  }

  function renderJournal() {
    const main = document.getElementById('main');
    main.innerHTML = '';

    const di = tripDayInfo();
    const subtitleBits = [];
    if (di.kind === 'live') subtitleBits.push(`Day ${di.dayN} · ${currentSegment().label} ${currentSegment().country === 'Thailand' ? '🇹🇭' : currentSegment().country === 'Philippines' ? '🇵🇭' : ''}`);
    else if (di.kind === 'pre') subtitleBits.push(di.label);
    else subtitleBits.push('Trip complete');
    const count = state.journal.posts.length;
    if (count > 0) subtitleBits.push(`${count} post${count === 1 ? '' : 's'} so far`);

    const header = el(`
      <div class="journal-header">
        <div>
          <h2>Journal</h2>
          <p class="sub">${escapeHtml(subtitleBits.join(' · '))}</p>
        </div>
        <div class="journal-header-actions"></div>
      </div>`);
    const actions = header.querySelector('.journal-header-actions');

    if (state.journal.configured === false) {
      // not configured: read-only feed (which will be empty)
      main.appendChild(header);
      main.appendChild(renderJournalNotConfigured());
      return;
    }

    if (state.journal.authed) {
      const postBtn = el(`<button class="post-btn">${ICON.plus}<span>Post</span></button>`);
      postBtn.addEventListener('click', () => openComposer());
      actions.appendChild(postBtn);

      const logoutBtn = el(`<button class="logout-btn" title="Log out of posting">${ICON.close}</button>`);
      logoutBtn.addEventListener('click', async () => {
        await fetch('api/auth', { method: 'DELETE' });
        state.journal.authed = false;
        renderJournal();
      });
      actions.appendChild(logoutBtn);
    } else {
      const unlockBtn = el(`<button class="unlock-btn">${ICON.lock.replace('class="lock-icon"', 'class="unlock-icon"')}<span>Unlock posting</span></button>`);
      unlockBtn.addEventListener('click', () => openPasscodePrompt());
      actions.appendChild(unlockBtn);
    }
    main.appendChild(header);

    if (state.journal.loading) {
      main.appendChild(el(`<div class="loading">Loading posts…</div>`));
      return;
    }
    if (state.journal.posts.length === 0) {
      main.appendChild(renderJournalEmptyState());
      return;
    }

    const feed = el(`<div class="journal-feed"></div>`);
    state.journal.posts.forEach(p => feed.appendChild(renderPost(p)));
    main.appendChild(feed);
  }

  // ---------- modals (passcode + composer) ----------
  function closeModal() {
    document.querySelector('.modal-backdrop')?.remove();
    state.journal.modal = null;
  }

  function openPasscodePrompt() {
    closeModal();
    state.journal.modal = 'passcode';
    const back = el(`
      <div class="modal-backdrop">
        <form class="modal passcode-modal" autocomplete="off">
          <div class="modal-head">
            <h3>Unlock posting</h3>
            <button type="button" class="modal-close" aria-label="Close">${ICON.close}</button>
          </div>
          <p class="modal-sub">Enter the passcode to post on this device.</p>
          <input class="modal-input passcode-input" type="password" inputmode="numeric" autocomplete="one-time-code" placeholder="passcode" autofocus>
          <div class="modal-error"></div>
          <div class="modal-actions">
            <button type="submit" class="action-btn primary">Unlock</button>
          </div>
        </form>
      </div>`);
    document.body.appendChild(back);
    back.querySelector('.modal-close').addEventListener('click', closeModal);
    back.addEventListener('click', e => { if (e.target === back) closeModal(); });
    back.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      const pass = back.querySelector('.passcode-input').value.trim();
      const errEl = back.querySelector('.modal-error');
      if (!pass) { errEl.textContent = 'Enter the passcode.'; return; }
      try {
        const r = await fetch('api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ passcode: pass }),
        });
        if (r.status === 401) { errEl.textContent = 'Wrong passcode.'; return; }
        if (r.status === 503) { errEl.textContent = 'Passcode not configured on this deployment.'; return; }
        if (!r.ok) { errEl.textContent = 'Could not unlock.'; return; }
        state.journal.authed = true;
        closeModal();
        renderJournal();
        toast('Unlocked. Tap + Post to share.');
      } catch {
        errEl.textContent = 'Network error.';
      }
    });
    setTimeout(() => back.querySelector('.passcode-input')?.focus(), 30);
  }

  function openComposer() {
    closeModal();
    state.journal.modal = 'composer';
    const c = state.journal.composer;
    const back = el(`
      <div class="modal-backdrop">
        <form class="modal composer-modal" autocomplete="off">
          <div class="modal-head">
            <h3>New post</h3>
            <button type="button" class="modal-close" aria-label="Close">${ICON.close}</button>
          </div>

          <div class="who-toggle">
            <button type="button" data-who="Em"   class="${c.author==='Em'?'active':''}">Em</button>
            <button type="button" data-who="Trish" class="${c.author==='Trish'?'active':''}">Trish</button>
          </div>

          <label class="photo-drop ${c.photoPreview?'has-photo':''}">
            ${c.photoPreview
              ? `<img class="photo-preview" src="${c.photoPreview}" alt="">`
              : `<div class="photo-drop-cta">${ICON.image}<span>Add photo</span></div>`}
            <input type="file" class="photo-input" accept="image/*" hidden>
            ${c.photoPreview ? `<button type="button" class="photo-clear" aria-label="Remove">${ICON.close}</button>` : ''}
          </label>

          <textarea class="modal-input caption-input" placeholder="What's the moment?" rows="3" maxlength="1500">${escapeHtml(c.caption)}</textarea>

          <div class="modal-input-row">
            ${ICON.pin.replace('<svg', '<svg style="width:14px;height:14px;stroke:var(--muted);flex-shrink:0"')}
            <input class="modal-input location-input" placeholder="Location · e.g. Wat Pho · Phra Nakhon" maxlength="80" value="${escapeHtml(c.location)}">
          </div>

          <div class="modal-error"></div>

          <div class="modal-actions">
            <button type="button" class="action-btn secondary modal-cancel">Cancel</button>
            <button type="submit" class="action-btn primary post-submit">${c.posting ? 'Posting…' : 'Post'}</button>
          </div>
        </form>
      </div>`);
    document.body.appendChild(back);

    back.querySelector('.modal-close').addEventListener('click', closeModal);
    back.querySelector('.modal-cancel').addEventListener('click', closeModal);
    back.addEventListener('click', e => { if (e.target === back) closeModal(); });

    back.querySelectorAll('.who-toggle button').forEach(btn => {
      btn.addEventListener('click', () => {
        c.author = btn.dataset.who;
        localStorage.setItem('et_author', c.author);
        back.querySelectorAll('.who-toggle button').forEach(b => b.classList.toggle('active', b === btn));
      });
    });

    back.querySelector('.caption-input').addEventListener('input', e => { c.caption = e.target.value; });
    back.querySelector('.location-input').addEventListener('input', e => { c.location = e.target.value; });

    const drop = back.querySelector('.photo-drop');
    const fileInput = back.querySelector('.photo-input');
    drop.addEventListener('click', e => {
      if (e.target.closest('.photo-clear')) return;
      fileInput.click();
    });
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        const compressed = await compressImage(file);
        c.photoFile = compressed;
        c.photoPreview = URL.createObjectURL(compressed);
        // re-render the modal contents to swap in the preview
        closeModal();
        openComposer();
      } catch (err) {
        toast('Could not load image');
      }
    });
    back.querySelector('.photo-clear')?.addEventListener('click', () => {
      c.photoFile = null;
      c.photoPreview = null;
      closeModal();
      openComposer();
    });

    back.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      const errEl = back.querySelector('.modal-error');
      const submitBtn = back.querySelector('.post-submit');
      if (!c.caption && !c.photoFile) {
        errEl.textContent = 'Add a caption or a photo.';
        return;
      }
      submitBtn.disabled = true;
      submitBtn.textContent = 'Posting…';
      c.posting = true;

      try {
        let photo_url = null;
        if (c.photoFile) {
          photo_url = await uploadPhoto(c.photoFile);
        }
        const r = await fetch('api/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            author: c.author,
            caption: c.caption,
            photo_url,
            location: c.location,
          }),
        });
        if (r.status === 401) {
          errEl.textContent = 'Posting unlocked expired. Re-enter passcode.';
          state.journal.authed = false;
          submitBtn.disabled = false;
          submitBtn.textContent = 'Post';
          c.posting = false;
          return;
        }
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.error || 'failed');
        }
        const data = await r.json();
        state.journal.posts.unshift(data.post);
        // reset composer
        state.journal.composer = { author: c.author, caption: '', location: '', photoFile: null, photoPreview: null, posting: false };
        closeModal();
        renderJournal();
        toast('Posted');
      } catch (err) {
        errEl.textContent = err.message || 'Could not post.';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Post';
        c.posting = false;
      }
    });
  }

  // ---------- photo helpers ----------
  async function compressImage(file, maxDim = 1600, quality = 0.85) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) { height = Math.round(height * maxDim / width); width = maxDim; }
          else                { width  = Math.round(width  * maxDim / height); height = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        canvas.toBlob(blob => {
          if (!blob) return reject(new Error('compression failed'));
          const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
          resolve(new File([blob], name, { type: 'image/jpeg' }));
        }, 'image/jpeg', quality);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  let _blobClient = null;
  async function getBlobClient() {
    if (_blobClient) return _blobClient;
    _blobClient = await import('https://esm.sh/@vercel/blob@0.27/client');
    return _blobClient;
  }

  async function uploadPhoto(file) {
    const { upload } = await getBlobClient();
    const blob = await upload(`journal/${Date.now()}-${file.name}`, file, {
      access: 'public',
      handleUploadUrl: 'api/upload',
    });
    return blob.url;
  }

  // ---------- main render ----------
  function render() {
    renderAppbar();
    renderTabbar();
    if (state.route === 'timeline')   renderTimeline();
    else if (state.route === 'vault') renderVault();
    else if (state.route === 'journal') renderJournal();
  }

  // ---------- live tick (sync card + countdown) ----------
  function tick() {
    if (state.route !== 'timeline') return;
    const sync = document.querySelector('.sync');
    if (!sync) return;
    sync.replaceWith(renderSyncCard());
  }

  // ---------- journal lazy load ----------
  let _journalLoaded = false;
  async function ensureJournalLoaded() {
    if (_journalLoaded) return;
    _journalLoaded = true;
    await Promise.all([refreshAuth(), loadPosts()]);
    if (state.route === 'journal') render();
  }

  // ---------- boot ----------
  async function boot() {
    try { await load(); }
    catch (e) {
      document.getElementById('main').innerHTML = `<div class="loading">Couldn't load trip data. Check your connection and reload.</div>`;
      console.error(e);
      return;
    }
    state.route = parseRoute();
    render();
    setInterval(tick, 1000);
    if (state.route === 'journal') ensureJournalLoaded();
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
