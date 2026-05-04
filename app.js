/* =========================================================================
   Em & Trish — trip site
   Vanilla JS, hash-routed, mobile-first.
   ========================================================================= */
(() => {
  // ---------- timezone helpers ----------
  // Static offsets are correct for May 2026 (no DST changes mid-trip).
  const TZ_OFFSETS = { EDT: -4, EST: -5, JST: 9, ICT: 7, PHT: 8, KST: 9 };
  const TZ_IANA    = {
    EDT: 'America/New_York',
    EST: 'America/New_York',
    JST: 'Asia/Tokyo',
    ICT: 'Asia/Bangkok',
    PHT: 'Asia/Manila',
    KST: 'Asia/Seoul',
  };

  function dateOf(dateStr, timeStr, tzLabel) {
    if (!dateStr || !timeStr) return null;
    if (!/^\d{2}:\d{2}$/.test(timeStr)) return null;  // skip TBD / ALL DAY
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

  // ---------- state ----------
  const state = {
    trip: null,
    timeline: null,
    vault: null,
    route: 'timeline',   // timeline | vault | journal
    vaultCountry: 'Bangkok',
    expanded: new Set(),  // ids of expanded cards
    otgOpen: new Set(),
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
    // pick default vault country based on today
    state.vaultCountry = currentSegment().vault_segment;
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
    plus:   `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>`,
    sun:    `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`,
    phone:  `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0 1 22 16.92z"/></svg>`,
    file:   `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h4"/></svg>`,
    shield: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-12V5l-8-3-8 3v5c0 8 8 12 8 12z"/><path d="M12 8v4M12 16h.01"/></svg>`,
    sim:    `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><circle cx="12" cy="14" r="3"/></svg>`,
    train:  `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="16" rx="2"/><path d="M4 11h16M8 15h.01M16 15h.01M9 19l-2 3M15 19l2 3"/></svg>`,
    arrow:  `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M7 7h10v10"/></svg>`,
    check:  `<svg viewBox="0 0 24 24" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    journ:  `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/><path d="M9 7h7M9 11h5"/></svg>`,
    vault:  `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M12 7v2M12 15v2M7 12h2M15 12h2"/></svg>`,
    timl:   `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h2M14 14h2M8 18h2"/></svg>`,
    image:  `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.81.01L6 21"/></svg>`,
    chat:   `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v12H5.17L4 17.17z"/></svg>`,
    link:   `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8"/></svg>`,
    drive:  `<svg viewBox="0 0 24 24" style="flex-shrink:0"><path fill="#FFC107" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A10.997 10.997 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.997 10.997 0 0 0 1 12c0 1.78.43 3.46 1.18 4.93z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>`,
  };

  // ---------- segment / now-state helpers ----------
  function todayISO() {
    const now = new Date();
    return now.toISOString().slice(0, 10);
  }
  function currentSegment() {
    const today = todayISO();
    const segs = state.trip.segments;
    let active = segs[0];
    for (const s of segs) {
      if (today >= s.from) active = s;
      if (today >= s.to) continue;
    }
    // Vault toggle: Bangkok vs Philippines
    const vault_segment = (active.country === 'Philippines') ? 'Philippines' : 'Bangkok';
    return { ...active, vault_segment };
  }
  function tripDayInfo() {
    const today = new Date(todayISO());
    const start = new Date(state.trip.start_date);
    const end   = new Date(state.trip.end_date);
    const totalDays = Math.round((end - start) / 86400000) + 1;
    if (today < start) {
      const days = Math.ceil((start - today) / 86400000);
      return { label: `Trip in ${days}d`, kind: 'pre' };
    }
    if (today > end) return { label: 'Trip complete', kind: 'post' };
    const dayN = Math.round((today - start) / 86400000) + 1;
    return { label: `Day ${dayN} of ${totalDays}`, kind: 'live' };
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
    render();
  });

  // ---------- toast ----------
  let toastTimer;
  function toast(msg) {
    let el = document.querySelector('.toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 1600);
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
      [/Nippon|ANA/i,        { code: 'ANA', color: 'var(--coral)' }],
      [/Korean Air/i,        { code: 'KE',  color: 'var(--cerulean)' }],
      [/Philippine Air/i,    { code: 'PR',  color: 'var(--cerulean)' }],
      [/AirAsia/i,           { code: 'Z2',  color: 'var(--coral)' }],
      [/JAL|Japan Air/i,     { code: 'JL',  color: 'var(--coral)' }],
      [/Thai/i,              { code: 'TG',  color: 'var(--lavender-deep)' }],
    ];
    for (const [re, v] of map) if (re.test(airline)) return v;
    return { code: airline.slice(0, 3).toUpperCase(), color: 'var(--muted)' };
  }
  function cleanPhone(v) {
    if (v == null) return '';
    return String(v).replace(/\.0$/, '').trim();
  }
  function telHref(v) {
    return 'tel:' + cleanPhone(v).replace(/\s+/g, '');
  }
  function mapsHref(addr) {
    return 'https://maps.google.com/?q=' + encodeURIComponent(addr);
  }

  // ---------- render: app shell ----------
  function renderAppbar() {
    const ab = document.getElementById('appbar');
    const di = tripDayInfo();
    ab.innerHTML = '';
    ab.appendChild(el(`
      <div class="appbar-inner">
        <div class="appbar-row">
          <div>
            <h1>${escapeHtml(state.trip.title)}</h1>
            <p class="sub">${escapeHtml(state.trip.subtitle)}</p>
          </div>
          <div class="day-chip">
            ${ICON.cal}
            <span>${escapeHtml(di.label)}</span>
          </div>
        </div>
      </div>
    `));
  }

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
          ${t.icon}
          <span>${t.label}</span>
          <span class="indicator"></span>
        </button>
      `);
      b.addEventListener('click', () => {
        location.hash = '#/' + t.id;
      });
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

  function eventTypeIcon(type) {
    const map = {
      depart:    ICON.cal,
      transit:   ICON.plane,
      arrive:    ICON.bed,  // misnomer but neutral
      'check-in': ICON.bed,
      'check-out': ICON.bed,
      activity:  ICON.cal,
      wedding:   ICON.cal,
    };
    return map[type] || ICON.cal;
  }

  function renderEventCard(ev, day) {
    const todayStr = todayISO();
    const isPast = day.date < todayStr;
    const isHighlight = ev.title && /Bangkok \(BKK\)/.test(ev.title);  // landing = trip begins
    const klass = ['event-card'];
    if (isPast) klass.push('past');
    if (isHighlight) klass.push('highlight');

    const statusPill = ev.status === 'confirmed'
      ? `<span class="pill confirmed"><span class="dot"></span>Confirmed</span>`
      : ev.status === 'tentative'
      ? `<span class="pill tentative"><span class="dot"></span>Tentative</span>`
      : ev.status === 'done'
      ? `<span class="pill done"><span class="dot"></span>Done</span>`
      : '';
    const tripBeginsPill = isHighlight ? `<span class="pill trip-begins"><span class="dot"></span>Trip begins</span>` : '';

    const lockOrEdit = ev.locked
      ? ICON.lock
      : (ev.status === 'tentative' || ev.option_a) ? ICON.edit : '';

    const ab = (ev.option_a || ev.option_b) ? `
      <div class="ab-toggle" data-ev="${ev.id}">
        <button class="ab-option selected" data-pick="a">
          <div class="ab-option-head">
            <span class="ab-option-name">Option A</span>
            <span class="ab-option-radio">${ICON.check}</span>
          </div>
          <div class="ab-option-text">${escapeHtml(ev.option_a || '')}</div>
        </button>
        <button class="ab-option" data-pick="b">
          <div class="ab-option-head">
            <span class="ab-option-name">Option B</span>
            <span class="ab-option-radio">${ICON.check}</span>
          </div>
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
          <div class="event-title-row">
            <span class="event-title">${escapeHtml(ev.title)}</span>
          </div>
          ${ev.location ? `<div class="event-meta">${escapeHtml(ev.location)}</div>` : ''}
          <div class="event-foot">
            ${tripBeginsPill || statusPill}
            ${lockOrEdit}
          </div>
          ${ab}
          ${notesBlock}
        </div>
      </div>
    `);

    // wire A/B toggle
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

    const weekday = day.weekday || new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' });
    const dateLabel = new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

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
      </section>
    `);
    const list = sec.querySelector('.event-list');
    day.events.forEach(ev => list.appendChild(renderEventCard(ev, day)));
    return sec;
  }

  function renderTimeline() {
    const main = document.getElementById('main');
    main.innerHTML = '';
    main.appendChild(renderSyncCard());
    state.timeline.days.forEach(day => main.appendChild(renderDaySection(day)));
    // scroll to today (or first day if pre-trip)
    requestAnimationFrame(() => {
      const todayStr = todayISO();
      const target = main.querySelector(`[data-date="${todayStr}"]`)
                  || main.querySelector('.day-section');
      if (target) target.scrollIntoView({ block: 'start', behavior: 'auto' });
    });
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
      </div>
    `);
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
      </div>
    `);
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

  function renderFlightCard(f) {
    const id = `f-${f.code || f.from}-${f.to}-${f.depart?.date || ''}`;
    const expanded = state.expanded.has(id);
    const ap = airlinePill(f.airline);
    const dep = f.depart || {};
    const arr = f.arrive || {};
    const depHuman = dep.date ? new Date(dep.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    const arrHuman = arr.date ? new Date(arr.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    const subtitle = `${depHuman} · ${fmtTimeFromHHMM(dep.time)} ${dep.tz || ''} → ${arrHuman} · ${fmtTimeFromHHMM(arr.time)} ${arr.tz || ''}`;

    if (!expanded) {
      const card = el(`
        <div class="vault-card vault-card-collapsed" data-flight="${id}">
          <div class="vault-flight-left">
            <div class="airline-pill" style="background:${ap.color}">${escapeHtml(ap.code)}</div>
            <div style="min-width:0">
              <div class="vault-flight-title">${escapeHtml(f.code || f.airline || '')} · ${escapeHtml(f.from)} → ${escapeHtml(f.to)}</div>
              <div class="vault-flight-sub">${escapeHtml(subtitle)}${f.confirmation ? ` · <span style="font-family:'JetBrains Mono',monospace;font-weight:600;color:var(--cerulean-deep)">${escapeHtml(f.confirmation)}</span>` : ''}</div>
            </div>
          </div>
          ${ICON.chevDn.replace('<svg', '<svg class="chevron"')}
        </div>
      `);
      card.addEventListener('click', () => {
        state.expanded.add(id);
        renderVault();
      });
      return card;
    }

    // expanded
    const card = el(`
      <div class="vault-card" data-flight="${id}">
        <div class="vault-flight-head">
          <div class="vault-flight-left">
            <div class="airline-pill" style="background:${ap.color}">${escapeHtml(ap.code)}</div>
            <div style="min-width:0">
              <div class="vault-flight-title">${escapeHtml(f.code || '')} · ${escapeHtml(f.from)} → ${escapeHtml(f.to)}</div>
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
        ${(f.source || f.drive_link) ? `
          <div class="source-row">
            ${f.source ? `<span class="label">Booked via</span><span class="source-pill" style="background:${srcColor(f.source)}">${escapeHtml(f.source)}</span>` : ''}
            ${f.notes ? ` · <span>${escapeHtml(f.notes)}</span>` : ''}
          </div>` : ''}
      </div>
    `);
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
    const subtitle = `${s.check_in_date ? new Date(s.check_in_date).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : ''} → ${s.check_out_date ? new Date(s.check_out_date).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : ''}${s.nights ? ` · ${s.nights} night${s.nights === 1 ? '' : 's'}` : ''}`;

    if (!expanded) {
      const card = el(`
        <div class="vault-card vault-card-collapsed" data-stay="${id}">
          <div style="min-width:0;flex:1">
            <div class="vault-stay-title">${escapeHtml(s.name)}</div>
            <div class="vault-stay-sub">${escapeHtml(subtitle)}${s.confirmation ? ` · <span style="font-family:'JetBrains Mono',monospace;font-weight:600;color:var(--cerulean-deep)">${escapeHtml(s.confirmation)}</span>` : ''}</div>
            ${s.source ? `<div style="margin-top:4px;display:flex;align-items:center;gap:6px"><span class="source-pill" style="background:${srcColor(s.source)};font-size:9px;padding:1px 5px">${escapeHtml(s.source)}</span><span style="font-size:10px;color:var(--faint)">${s.drive_link ? '· Drive linked' : ''}</span></div>` : ''}
          </div>
          ${ICON.chevDn.replace('<svg', '<svg class="chevron"')}
        </div>
      `);
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
      </div>
    `);
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
              : (o.category === 'emergency')  ? ICON.shield
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
        </div>
      `);
      card.querySelector('.otg-card-head').addEventListener('click', () => {
        if (state.otgOpen.has(id)) state.otgOpen.delete(id); else state.otgOpen.add(id);
        renderVault();
      });
      return card;
    }
    return el(`
      <div class="otg-card">
        <div class="otg-card-head">
          <div class="otg-card-head-left">${icon}<span class="otg-card-title">${escapeHtml(o.title)}</span></div>
        </div>
        <div class="otg-card-body">
          <div class="row"><span>${escapeHtml(o.details)}</span></div>
          ${o.notes ? `<div class="row"><span style="font-size:11px;color:var(--muted)">${escapeHtml(o.notes)}</span></div>` : ''}
        </div>
      </div>
    `);
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

    // Flights
    const fSec = el(`
      <section class="vault-section" id="sec-flights">
        <div class="vault-section-header">
          <div class="vault-section-header-left">
            <div class="vault-section-icon">${ICON.plane}</div>
            <div class="vault-section-title">Flights</div>
            <div class="vault-section-count">${flights.length} booking${flights.length===1?'':'s'}</div>
          </div>
          ${ICON.plus.replace('<svg', '<svg style="width:16px;height:16px;stroke:var(--muted)"')}
        </div>
        <div class="vault-section-list"></div>
      </section>
    `);
    const fList = fSec.querySelector('.vault-section-list');
    flights.forEach(f => fList.appendChild(renderFlightCard(f)));
    main.appendChild(fSec);

    // Stays
    const sSec = el(`
      <section class="vault-section" id="sec-stays">
        <div class="vault-section-header">
          <div class="vault-section-header-left">
            <div class="vault-section-icon">${ICON.bed}</div>
            <div class="vault-section-title">Stays</div>
            <div class="vault-section-count">${stays.length} booking${stays.length===1?'':'s'}</div>
          </div>
          ${ICON.plus.replace('<svg', '<svg style="width:16px;height:16px;stroke:var(--muted)"')}
        </div>
        <div class="vault-section-list"></div>
      </section>
    `);
    const sList = sSec.querySelector('.vault-section-list');
    stays.forEach(s => sList.appendChild(renderStayCard(s)));
    main.appendChild(sSec);

    // OTG
    const oSec = el(`
      <section class="vault-section" id="sec-otg">
        <div class="vault-section-header">
          <div class="vault-section-header-left">
            <div class="vault-section-icon">${ICON.locate}</div>
            <div class="vault-section-title">On the Ground</div>
          </div>
          ${ICON.plus.replace('<svg', '<svg style="width:16px;height:16px;stroke:var(--muted)"')}
        </div>
        <div class="vault-section-list"></div>
      </section>
    `);
    const oList = oSec.querySelector('.vault-section-list');
    otg.forEach((o, i) => oList.appendChild(renderOTGCard(o, `${country}-${i}`)));
    main.appendChild(oSec);
  }

  // ---------- render: journal ----------
  function renderJournal() {
    const main = document.getElementById('main');
    main.innerHTML = '';
    main.appendChild(el(`
      <div class="journal-empty">
        <div class="polaroid-stack">
          <div class="polaroid back"><div class="image"></div></div>
          <div class="polaroid front"><div class="image"></div><div class="caption">May 11 · Bangkok</div></div>
        </div>
        <div>
          <div class="journal-headline">Coming May 9 · Bangkok</div>
          <div class="journal-sub">Photos, voice notes, and one-line entries from the road. Both of you can post. Friends &amp; family follow via private link.</div>
        </div>
        <div class="feature-pills">
          <div class="feature-pill">${ICON.image}<div><div class="name">Photo + caption posts</div><div class="sub">Drag-drop from camera roll · auto-tagged with location</div></div></div>
          <div class="feature-pill">${ICON.chat}<div><div class="name">Comments from home</div><div class="sub">Mom, Dad &amp; friends can leave notes on each post</div></div></div>
          <div class="feature-pill">${ICON.link}<div><div class="name">One private share link</div><div class="sub">Public/private toggle TBD · default is invite-only</div></div></div>
        </div>
      </div>
    `));
  }

  // ---------- main render ----------
  function render() {
    renderAppbar();
    renderTabbar();
    if (state.route === 'timeline') renderTimeline();
    else if (state.route === 'vault') renderVault();
    else if (state.route === 'journal') renderJournal();
  }

  // ---------- live tick (sync card + countdown) ----------
  function tick() {
    if (state.route !== 'timeline') return;
    const sync = document.querySelector('.sync');
    if (!sync) return;
    const newCard = renderSyncCard();
    sync.replaceWith(newCard);
  }

  // ---------- boot ----------
  async function boot() {
    try {
      await load();
    } catch (e) {
      document.getElementById('main').innerHTML = `<div class="loading">Couldn't load trip data. Check your connection and reload.</div>`;
      console.error(e);
      return;
    }
    state.route = parseRoute();
    render();
    setInterval(tick, 1000);
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
