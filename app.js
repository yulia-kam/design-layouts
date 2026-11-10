(() => {
  'use strict';

  const stage = document.getElementById('stage');
  const canvas = document.getElementById('canvas');
  const listEl = document.getElementById('framesList');
  const countEl = document.getElementById('count');
  const zoomLabel = document.getElementById('zoomLabel');
  const statusText = document.getElementById('statusText');
  const emptyHint = document.getElementById('emptyHint');
  const stageEmpty = document.getElementById('stageEmpty');
  const searchEl = document.getElementById('search');
  const pageEl = document.getElementById('pageMode');

  const COLUMNS = 3;
  const GAP = 80;
  const PAGE_W = 1440;
  const MIN_ZOOM = 0.02;
  const MAX_ZOOM = 1.6;

  const state = {
    zoom: 0.55,
    x: 60,
    y: 130,
    items: [],
    frames: new Map(),
    selected: null,
    zones: [],
    observer: null,
    signature: '',
  };

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function plural(n) {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'экран';
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'экрана';
    return 'экранов';
  }

  function applyTransform() {
    canvas.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.zoom})`;
    zoomLabel.textContent = Math.round(state.zoom * 100) + '%';
    updateGrid();
  }

  function updateGrid() {
    const size = 24 * state.zoom;
    stage.style.backgroundSize = `${size}px ${size}px`;
    stage.style.backgroundPosition = `${state.x}px ${state.y}px`;
  }

  function zoomAt(cx, cy, factor) {
    const z = clamp(state.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    const k = z / state.zoom;
    const rect = stage.getBoundingClientRect();
    const px = cx - rect.left;
    const py = cy - rect.top;
    state.x = px - (px - state.x) * k;
    state.y = py - (py - state.y) * k;
    state.zoom = z;
    applyTransform();
  }

  function zoomCenter(factor) {
    const rect = stage.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
  }

  function fit() {
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    if (!w || !h) return;
    const vw = stage.clientWidth;
    const vh = stage.clientHeight;
    const z = clamp(Math.min((vw - 120) / w, (vh - 120) / h), MIN_ZOOM, 1);
    state.zoom = z;
    state.x = (vw - w * z) / 2;
    state.y = (vh - h * z) / 2;
    applyTransform();
  }

  function centerZone(zone) {
    const el = zone && zone.el;
    if (!el || el.classList.contains('hidden')) return;
    state.zoom = clamp(Math.max(state.zoom, 0.55), MIN_ZOOM, 1);
    state.x = 80 - el.offsetLeft * state.zoom;
    state.y = 80 - el.offsetTop * state.zoom;
    applyTransform();
  }

  function centerOn(frame) {
    if (frame.el.classList.contains('hidden')) return;
    const vw = stage.clientWidth;
    const vh = stage.clientHeight;
    const w = frame.w;
    const h = frame.h || frame.el.offsetHeight || 900;
    const z = clamp((vw - 140) / w, MIN_ZOOM, 1);
    const cx = frame.el.offsetLeft + w / 2;
    const cy = frame.el.offsetTop + h / 2;
    state.zoom = z;
    state.x = vw / 2 - cx * z;
    state.y = vh / 2 - cy * z;
    applyTransform();
  }

  function describe(item) {
    if (item.kind === 'page') return item.page ? `страница ${item.page} · 1440 px` : 'страница · 1440 px';
    return item.w && item.h ? `${item.w}×${item.h}` : 'изображение';
  }

  function mount(frame) {
    const item = frame.item;
    if (frame.mounted) return;
    frame.mounted = true;

    if (item.kind === 'image') return;

    const iframe = document.createElement('iframe');
    iframe.setAttribute('scrolling', 'no');
    iframe.style.height = '1600px';
    iframe.src = item.path.split('/').map(encodeURIComponent).join('/');

    const measure = () => {
      let h = 0;
      try {
        const doc = iframe.contentDocument;
        if (doc && doc.documentElement) h = doc.documentElement.scrollHeight;
        if (doc && doc.body) h = Math.max(h, doc.body.scrollHeight);
      } catch (err) {
        h = 0;
      }
      if (h > 200) {
        if (Math.abs(h - frame.h) >= 2) {
          frame.h = h;
          iframe.style.height = h + 'px';
        }
        frame.box.classList.remove('loading');
      }
    };

    iframe.addEventListener('load', () => {
      measure();
      setTimeout(measure, 900);
    });

    frame.box.classList.add('loading');
    frame.box.appendChild(iframe);
    frame.iframe = iframe;
  }

  function createFrame(item) {
    const el = document.createElement('div');
    el.className = 'frame';
    el.style.width = item.kind === 'page' ? PAGE_W + 'px' : `${Math.min(item.w || 900, PAGE_W)}px`;

    const label = document.createElement('div');
    label.className = 'frame-label';
    label.textContent = item.name.replace(/\.html?$/i, '');
    label.title = item.name + ' — ' + describe(item);

    const box = document.createElement('div');
    box.className = 'frame-box';

    el.appendChild(label);
    el.appendChild(box);

    const frame = {
      item,
      el,
      box,
      w: item.kind === 'page' ? PAGE_W : Math.min(item.w || 900, PAGE_W),
      h: item.kind === 'page' ? 1600 : 0,
      mounted: false,
      iframe: null,
    };
    el._frame = frame;

    if (item.kind === 'image') {
      const img = document.createElement('img');
      img.alt = item.name;
      img.loading = 'lazy';
      img.src = item.path.split('/').map(encodeURIComponent).join('/');
      img.addEventListener('load', () => {
        frame.h = img.naturalHeight * (frame.w / img.naturalWidth);
      });
      box.appendChild(img);
      frame.h = frame.w * (item.h && item.w ? item.h / item.w : 2 / 3);
    }

    el.addEventListener('pointerdown', (e) => {
      if (spaceDown) return;
      e.stopPropagation();
      select(item.path);
    });

    return frame;
  }

  const ZONE_DEFS = [
    {
      id: 'main',
      title: 'Главная',
      cols: 2,
      match: (item) => item.kind === 'page' && (item.name === 'Main.html' || item.name === 'main-logo.html'),
    },
    {
      id: 'uyaz',
      title: 'Уязвимости и угрозы',
      cols: 3,
      match: (item) => item.kind === 'page' && item.name.startsWith('uyaz-'),
    },
    {
      id: 'rest',
      title: 'Остальные страницы',
      cols: 3,
      match: () => true,
    },
  ];

  function build(items) {
    if (state.observer) state.observer.disconnect();

    state.items = items;
    state.frames.clear();
    state.zones = [];
    canvas.innerHTML = '';

    const supportsIO = 'IntersectionObserver' in window;
    state.observer = supportsIO
      ? new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const frame = entry.target._frame;
            if (frame) mount(frame);
          }
        }
      }, { rootMargin: '1400px 0px' })
      : { observe() {}, disconnect() {} };

    const mode = pageEl.value;
    const inMode = (item) => item.kind !== 'page' || mode === 'all' || item.page === Number(mode);

    const buckets = new Map(ZONE_DEFS.map((def) => [def.id, []]));
    for (const item of items) {
      const def = ZONE_DEFS.find((d) => d.match(item));
      buckets.get(def.id).push(item);
    }

    const zonesWrap = document.createElement('div');
    zonesWrap.className = 'zones';
    canvas.appendChild(zonesWrap);

    for (const def of ZONE_DEFS) {
      const zoneItems = buckets.get(def.id);
      if (!zoneItems.length) continue;

      const ordered = zoneItems.filter(inMode).concat(zoneItems.filter((item) => !inMode(item)));

      const zoneEl = document.createElement('div');
      zoneEl.className = 'zone';
      if (def.id === 'uyaz') zoneEl.classList.add('zone-sep');

      const head = document.createElement('div');
      head.className = 'zone-head';
      const title = document.createElement('div');
      title.className = 'zone-title';
      title.textContent = def.title;
      const count = document.createElement('div');
      count.className = 'zone-count';
      head.appendChild(title);
      head.appendChild(count);
      zoneEl.appendChild(head);

      const colsWrap = document.createElement('div');
      colsWrap.className = 'board-columns';
      const cols = [];
      for (let i = 0; i < def.cols; i += 1) {
        const col = document.createElement('div');
        col.className = 'col';
        colsWrap.appendChild(col);
        cols.push(col);
      }
      zoneEl.appendChild(colsWrap);
      zonesWrap.appendChild(zoneEl);

      const zone = { def, el: zoneEl, countEl: count, frames: [] };
      state.zones.push(zone);

      const estimates = new Array(def.cols).fill(0);

      for (const item of ordered) {
        let best = 0;
        for (let i = 1; i < def.cols; i += 1) {
          if (estimates[i] < estimates[best]) best = i;
        }
        estimates[best] += (item.kind === 'page' ? 2200 : 900) + GAP;

        const frame = createFrame(item);
        frame.visible = inMode(item);
        cols[best].appendChild(frame.el);
        state.frames.set(item.path, frame);
        zone.frames.push(frame);
        state.observer.observe(frame.el);
      }
    }

    let mounted = 0;
    for (const zone of state.zones) {
      for (const frame of zone.frames) {
        if (mounted >= COLUMNS) break;
        if (frame.visible) {
          mount(frame);
          mounted += 1;
        }
      }
      if (mounted >= COLUMNS) break;
    }
    if (!supportsIO) {
      for (const frame of state.frames.values()) mount(frame);
    }

    state.selected = null;
    rebuildSidebar();
    applyFilter();
    applyTransform();
  }

  function rebuildSidebar() {
    listEl.innerHTML = '';
    for (const zone of state.zones) {
      const head = document.createElement('li');
      head.className = 'group';
      head.dataset.zone = zone.def.id;
      head.textContent = zone.def.title;
      head.title = 'Показать группу на холсте';
      head.addEventListener('click', () => centerZone(zone));
      listEl.appendChild(head);

      const frames = [...zone.frames].sort((a, b) => a.item.name.localeCompare(b.item.name));

      for (const frame of frames) {
        const item = frame.item;
        const li = document.createElement('li');
        li.dataset.path = item.path;

        const name = document.createElement('div');
        name.className = 'name';
        name.textContent = item.name.replace(/\.html?$/i, '');
        name.title = item.path;

        const meta = document.createElement('div');
        meta.className = 'dims';
        meta.textContent = describe(item);

        li.appendChild(name);
        li.appendChild(meta);
        li.addEventListener('click', () => {
          if (!state.frames.has(item.path)) return;
          select(item.path);
          mount(frame);
          centerOn(frame);
        });
        listEl.appendChild(li);
      }
    }
  }

  function applyFilter() {
    const q = searchEl.value.trim().toLowerCase();
    let shown = 0;

    for (const frame of state.frames.values()) {
      const item = frame.item;
      let visible = true;
      if (item.kind === 'page' && pageEl.value !== 'all' && item.page !== Number(pageEl.value)) {
        visible = false;
      }
      if (q && !item.name.toLowerCase().includes(q) && !item.path.toLowerCase().includes(q)) visible = false;
      frame.el.classList.toggle('hidden', !visible);
      if (visible) shown += 1;
    }

    for (const zone of state.zones) {
      let visibleCount = 0;
      for (const frame of zone.frames) {
        if (!frame.el.classList.contains('hidden')) visibleCount += 1;
      }
      zone.el.classList.toggle('hidden', visibleCount === 0);
      zone.countEl.textContent = `${visibleCount} ${plural(visibleCount)}`;
    }

    for (const li of listEl.children) {
      if (li.classList.contains('group')) continue;
      const frame = state.frames.get(li.dataset.path);
      const hidden = !frame || frame.el.classList.contains('hidden');
      li.classList.toggle('hidden', hidden);
      li.classList.toggle('active', li.dataset.path === state.selected);
    }

    for (const li of listEl.children) {
      if (!li.classList.contains('group')) continue;
      const zone = state.zones.find((z) => z.def.id === li.dataset.zone);
      li.classList.toggle('hidden', !zone || zone.el.classList.contains('hidden'));
    }

    const total = state.items.length;
    countEl.textContent = shown === total ? `${shown} ${plural(shown)}` : `${shown} из ${total}`;
    emptyHint.style.display = shown ? 'none' : 'block';
    stageEmpty.style.display = shown ? 'none' : 'flex';

    if (state.selected && state.frames.get(state.selected)?.el.classList.contains('hidden')) {
      clearSelection();
    }
  }

  function select(path) {
    state.selected = path;
    for (const [p, frame] of state.frames) {
      frame.el.classList.toggle('selected', p === path);
    }
    for (const li of listEl.children) {
      li.classList.toggle('active', li.dataset.path === path);
    }
    const item = state.items.find((i) => i.path === path);
    if (item) statusText.textContent = `${item.path} · ${describe(item)}`;
  }

  function clearSelection() {
    state.selected = null;
    for (const frame of state.frames.values()) frame.el.classList.remove('selected');
    for (const li of listEl.children) li.classList.remove('active');
  }

  async function refresh() {
    try {
      const res = await fetch('items.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('bad status');
      const data = await res.json();
      const signature = data.items.map((i) => i.path).join('|');
      if (signature !== state.signature) {
        state.signature = signature;
        build(data.items);
      }
      const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      statusText.textContent = `обновлено в ${time} · колесо — зум, перетаскивание — панорама`;
    } catch (err) {
      statusText.textContent = 'сервер недоступен — проверьте, что он запущен';
    }
  }

  // Pan
  let panning = null;
  let spaceDown = false;

  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.button !== 1) return;
    if (!spaceDown && (e.target === stage || e.target === canvas)) clearSelection();
    panning = { sx: e.clientX, sy: e.clientY, ox: state.x, oy: state.y };
    stage.classList.add('panning');
    stage.setPointerCapture(e.pointerId);
  });

  stage.addEventListener('pointermove', (e) => {
    if (!panning) return;
    state.x = panning.ox + (e.clientX - panning.sx);
    state.y = panning.oy + (e.clientY - panning.sy);
    applyTransform();
  });

  const endPan = (e) => {
    if (!panning) return;
    panning = null;
    stage.classList.remove('panning');
    try { stage.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  };
  stage.addEventListener('pointerup', endPan);
  stage.addEventListener('pointercancel', endPan);

  // Zoom
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });

  // Controls
  document.getElementById('topbar').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'zoom-in') zoomCenter(1.2);
    if (act === 'zoom-out') zoomCenter(1 / 1.2);
    if (act === 'fit') fit();
    if (act === 'reset') {
      const frame = state.selected ? state.frames.get(state.selected) : null;
      if (frame) centerOn(frame);
      else zoomCenter(1 / state.zoom);
    }
  });

  searchEl.addEventListener('input', applyFilter);
  pageEl.addEventListener('change', () => build(state.items));

  window.addEventListener('keydown', (e) => {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;

    if (e.code === 'Space') {
      if (!spaceDown) {
        spaceDown = true;
        stage.classList.add('space');
      }
      e.preventDefault();
      return;
    }

    if (e.key === '0') fit();
    else if (e.key === '1') zoomCenter(1 / state.zoom);
    else if (e.key === '+' || e.key === '=') zoomCenter(1.2);
    else if (e.key === '-') zoomCenter(1 / 1.2);
    else if (e.key === 'Escape') clearSelection();
    else if (e.key === 'ArrowLeft') { state.x += 80; applyTransform(); }
    else if (e.key === 'ArrowRight') { state.x -= 80; applyTransform(); }
    else if (e.key === 'ArrowUp') { state.y += 80; applyTransform(); }
    else if (e.key === 'ArrowDown') { state.y -= 80; applyTransform(); }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      spaceDown = false;
      stage.classList.remove('space');
    }
  });

  window.addEventListener('blur', () => {
    spaceDown = false;
    stage.classList.remove('space');
  });

  window.addEventListener('resize', updateGrid);

  applyTransform();
  refresh();
  setInterval(refresh, 4000);
})();
