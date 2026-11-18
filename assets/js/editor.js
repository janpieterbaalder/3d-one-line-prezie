/* ═══════════════════════════════════════════════════════════════════════
   3D One Line Prezi — editor
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';
const O = window.OLP3D, THREE = O.THREE;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const FW = 1920, FH = 1080, DEG = Math.PI / 180;
const clamp = O.clamp;
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r2 = v => Math.round(v * 100) / 100;

// ── toestand ────────────────────────────────────────────────────────────
let doc = O.normalizeDoc({ slides: [] });
let cur = 0, sel = -1, mode = 'world', tab = 'slide';
let fileHandle = null, fileName = '', dirty = false;
let world = null, needRender = true, presenting = null, clip = null;
const view = { pos: new THREE.Vector3(30, 20, 40), target: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) };
const orbit = { target: new THREE.Vector3(), dist: 50, yaw: .55, pitch: .32 };
let camAnim = null;

// ── kleine hulpjes ──────────────────────────────────────────────────────
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  kids.flat(4).forEach(c => { if (c === null || c === undefined || c === false) return; el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c); });
  return el;
}
function toHex(c, d) { try { if (!c) return d || '#000000'; return '#' + new THREE.Color(c).getHexString(); } catch (e) { return d || '#000000'; } }
function toast(msg, type, ms) {
  const t = h('div', { class: 'toast ' + (type || '') }, msg);
  $('#toasts').appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 320); }, ms || 2600);
}
function actionToast(msg, label, fn, ms) {
  const b = h('button', { class: 'btn pink', style: 'margin-left:12px;padding:6px 12px;pointer-events:auto' }, label);
  const t = h('div', { class: 'toast ok', style: 'display:flex;align-items:center;pointer-events:auto' }, msg, b);
  const close = () => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 320); };
  b.addEventListener('click', () => { close(); fn(); });
  $('#toasts').appendChild(t); setTimeout(close, ms || 10000);
}
function busy(txt) { $('#busy').classList.toggle('on', !!txt); if (txt) $('#busytxt').textContent = txt; }
function theme() { return O.themeOf(doc.settings); }
// ── media (afbeeldingen en video's) apart bewaren, zodat ongedaan maken en
// automatisch bewaren snel blijven; elementen verwijzen ernaar met media:<id>
const noMedia = (k, v) => (k === 'media' && v && typeof v === 'object' && !Array.isArray(v)) ? undefined : v;
function addMedia(dataUrl) {
  const id = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  doc.media[id] = dataUrl;
  DB.set('m:' + id, dataUrl).catch(() => {});
  return 'media:' + id;
}
function usedMedia(d) {
  const ids = new Set();
  d.slides.forEach(sl => sl.items.forEach(it => { if (typeof it.src === 'string' && it.src.startsWith('media:')) ids.add(it.src.slice(6)); }));
  const m = {}; ids.forEach(id => { if (d.media && d.media[id]) m[id] = d.media[id]; }); return m;
}
function fmtTime(t) { t = Math.max(0, +t || 0); const m = Math.floor(t / 60), s2 = Math.round((t - m * 60) * 10) / 10; return m + ':' + (s2 < 10 ? '0' : '') + s2; }
function parseTime(v) { v = String(v || '').trim(); if (!v) return 0; if (/^\d+(\.\d+)?$/.test(v)) return +v; const p = v.split(':').map(Number); if (p.some(isNaN)) return 0; return p.reduce((a, b) => a * 60 + b, 0); }
function slide() { return doc.slides[cur]; }
function item() { const s = slide(); return s && sel >= 0 ? s.items[sel] : null; }
function isTyping(t) { return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable); }

// ── dialogen ────────────────────────────────────────────────────────────
function dialog({ title, body, buttons, wide, onOpen, search }) {
  return new Promise(resolve => {
    const m = $('#modal'), d = $('#dlg');
    d.className = 'dlg' + (wide ? '' : ' sm');
    d.innerHTML = '';
    const close = v => { m.classList.remove('open'); document.removeEventListener('keydown', onKey, true); resolve(v); };
    const head = h('header', {}, h('h2', {}, title));
    if (search) head.appendChild(search);
    head.appendChild(h('button', { class: 'ibtn', title: 'Sluiten', onclick: () => close(null) }, '✕'));
    const bd = h('div', { class: 'body' }); if (typeof body === 'string') bd.innerHTML = body; else if (body) bd.appendChild(body);
    d.append(head, bd);
    if (buttons && buttons.length) d.appendChild(h('footer', {}, buttons.map(b => h('button', { class: 'btn' + (b.pink ? ' pink' : ''), onclick: () => close(typeof b.value === 'function' ? b.value() : b.value) }, b.label))));
    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(null); }
      else if (e.key === 'Enter' && !e.shiftKey && (e.target.tagName !== 'TEXTAREA' || e.ctrlKey) && buttons) { const p = buttons.find(b => b.pink); if (p) { e.preventDefault(); close(typeof p.value === 'function' ? p.value() : p.value); } }
    };
    document.addEventListener('keydown', onKey, true);
    m.onclick = e => { if (e.target === m) close(null); };
    m.classList.add('open');
    if (onOpen) onOpen(d, close);
  });
}
const confirmDlg = (title, text, ok) => dialog({ title, body: `<p class="note" style="font-size:14px;color:var(--ink)">${text}</p>`, buttons: [{ label: 'Annuleren', value: false }, { label: ok || 'OK', value: true, pink: true }] });

// ── wereld / camera ─────────────────────────────────────────────────────
function initWorld() {
  world = new O.World($('#view'), { mode: 'edit' });
  world.onAsync = requestRender;
  const ro = new ResizeObserver(resize); ro.observe($('#stage'));
  resize();
  requestAnimationFrame(loop);
}
function resize() {
  const st = $('#stage'); world.resize(st.clientWidth, st.clientHeight);
  if (mode === 'slide' && slide()) setView(world.stationPose(cur, { noSlideCam: true }));
  requestRender(); updateOverlay();
}
function requestRender() { needRender = true; }
function setView(p) {
  view.pos.copy(p.pos); view.target.copy(p.target); view.up.copy(p.up).normalize();
  const c = world.camera; c.position.copy(view.pos); c.up.copy(view.up); c.lookAt(view.target);
}
function orbitPose() {
  const cp = Math.cos(orbit.pitch);
  return { pos: orbit.target.clone().add(new THREE.Vector3(cp * Math.sin(orbit.yaw), Math.sin(orbit.pitch), cp * Math.cos(orbit.yaw)).multiplyScalar(orbit.dist)), target: orbit.target.clone(), up: new THREE.Vector3(0, 1, 0) };
}
function orbitFromPose(p) {
  const d = p.pos.clone().sub(p.target);
  orbit.target.copy(p.target); orbit.dist = Math.max(1, d.length());
  orbit.pitch = Math.asin(clamp(d.y / orbit.dist, -.99, .99)); orbit.yaw = Math.atan2(d.x, d.z);
}
function flyTo(pose, dur, done) {
  camAnim = { from: { pos: view.pos.clone(), target: view.target.clone(), up: view.up.clone() }, to: pose, t: 0, dur: dur ?? .75, done };
  $('#overlay').style.visibility = 'hidden';
  requestRender();
}
function stationWorldPose(i) {
  // in de wereldweergave: schuin voor de dia, met wat ruimte eromheen
  const p = world.stationPose(i, { noSlideCam: true });
  const dir = p.pos.clone().sub(p.target);
  const d = dir.length() * 1.55;
  dir.normalize(); dir.y += .32; dir.normalize();
  const yawTurn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), .32);
  dir.applyQuaternion(yawTurn);
  return { pos: p.target.clone().addScaledVector(dir, d), target: p.target.clone(), up: new THREE.Vector3(0, 1, 0) };
}
function fitAll(animate) {
  const R = world.sceneRadius, d = R / Math.sin(O.FOV * DEG / 2) * 1.05;
  orbit.target.copy(world.sceneCenter); orbit.dist = d;
  if (animate) flyTo(orbitPose()); else setView(orbitPose());
}
function goToSlideView(animate) {
  if (!slide()) return;
  if (mode === 'slide') { const p = world.stationPose(cur, { noSlideCam: true }); animate ? flyTo(p, .7, updateOverlay) : (setView(p), updateOverlay()); }
  else { const p = stationWorldPose(cur); animate ? flyTo(p, .75, () => orbitFromPose(p)) : (setView(p), orbitFromPose(p)); }
}
let lastNow = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(.1, Math.max(0, (now - (lastNow || now)) / 1000)); lastNow = now;
  if (presenting) return;
  if (camAnim) {
    const a = camAnim; a.t += dt;
    const u = Math.min(1, a.t / a.dur), e = u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
    const p = { pos: a.from.pos.clone().lerp(a.to.pos, e), target: a.from.target.clone().lerp(a.to.target, e), up: a.from.up.clone().lerp(a.to.up, e) };
    const span = a.from.target.distanceTo(a.to.target);
    if (span > 1) p.pos.addScaledVector(p.pos.clone().sub(p.target).normalize(), Math.sin(Math.PI * e) * span * .35);
    setView(p);
    if (u >= 1) { camAnim = null; $('#overlay').style.visibility = ''; if (a.done) a.done(); updateOverlay(); }
    needRender = true;
  }
  if (needRender) { needRender = false; world.render(); }
}
function bindStage() {
  const cv = $('#view');
  let drag = null;
  cv.addEventListener('pointerdown', e => {
    cv.focus();
    if (camAnim) return;
    drag = { x: e.clientX, y: e.clientY, btn: e.button, moved: false, shift: e.shiftKey, yaw: orbit.yaw, pitch: orbit.pitch };
    if (mode === 'world' && e.shiftKey && e.button === 0) {
      const i = pickAt(e.clientX, e.clientY);
      if (i >= 0) {
        if (i !== cur) selectSlide(i);
        const s = doc.slides[i];
        const n = world.camera.getWorldDirection(new THREE.Vector3());
        drag.plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, new THREE.Vector3(s.pos.x, s.pos.y, s.pos.z));
        drag.start = rayPlane(e.clientX, e.clientY, drag.plane);
        drag.pos0 = { ...s.pos };
        drag.moveSlide = i;
      }
    }
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    if (mode !== 'world') return;
    if (drag.moveSlide !== undefined && drag.start) {
      const p = rayPlane(e.clientX, e.clientY, drag.plane); if (!p) return;
      const s = doc.slides[drag.moveSlide];
      s.pos = { x: r2(drag.pos0.x + p.x - drag.start.x), y: r2(drag.pos0.y + p.y - drag.start.y), z: r2(drag.pos0.z + p.z - drag.start.z) };
      throttledRebuild();
      return;
    }
    if (drag.btn === 0 && !e.ctrlKey) {
      orbit.yaw = drag.yaw - dx * .006; orbit.pitch = clamp(drag.pitch + dy * .005, -1.45, 1.45);
      setView(orbitPose());
    } else {
      const c = world.camera, right = new THREE.Vector3().setFromMatrixColumn(c.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(c.matrixWorld, 1);
      const k = orbit.dist * .0016;
      orbit.target.addScaledVector(right, -(e.movementX || 0) * k).addScaledVector(up, (e.movementY || 0) * k);
      setView(orbitPose());
    }
    requestRender();
  });
  cv.addEventListener('pointerup', e => {
    const d = drag; drag = null;
    if (!d) return;
    if (d.moveSlide !== undefined && d.moved) { changed({ panel: true }); return; }
    if (d.moved) return;
    if (mode === 'world' && d.btn === 0) {
      const i = pickAt(e.clientX, e.clientY);
      if (i >= 0 && i !== cur) selectSlide(i);
    } else if (mode === 'slide' && d.btn === 0) { if (sel >= 0) { sel = -1; updateOverlay(); renderPanel(); } }
  });
  cv.addEventListener('dblclick', e => {
    if (mode !== 'world') return;
    const i = pickAt(e.clientX, e.clientY);
    if (i >= 0) { selectSlide(i); setMode('slide'); }
  });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    if (mode !== 'world' || camAnim) return;
    orbit.dist = clamp(orbit.dist * (e.deltaY > 0 ? 1.1 : 1 / 1.1), 2, 3000);
    setView(orbitPose()); requestRender();
  }, { passive: false });
  // overlay: elementen verslepen
  const ov = $('#overlay');
  ov.addEventListener('pointerdown', e => {
    const box = e.target.closest('.box'); if (!box) return;
    e.preventDefault(); e.stopPropagation();
    const i = +box.dataset.i, s = slide(), it = s.items[i];
    if (sel !== i) { sel = i; tab = 'item'; $$('.box', ov).forEach(b => b.classList.toggle('on', +b.dataset.i === i)); renderTabs(); renderPanel(); }
    const R = world.frameRect(cur), k = R.w / FW;
    const handle = e.target.classList.contains('hd') ? 'size' : e.target.classList.contains('rt') ? 'rot' : 'move';
    const st = { x: e.clientX, y: e.clientY, it: JSON.parse(JSON.stringify(it)), k, box, handle, moved: false };
    const bb = box.getBoundingClientRect(); st.cx = bb.left + bb.width / 2; st.cy = bb.top + bb.height / 2;
    const mv = ev => {
      const dx = (ev.clientX - st.x) / k, dy = (ev.clientY - st.y) / k;
      if (!st.moved && Math.hypot(ev.clientX - st.x, ev.clientY - st.y) < 3) return;
      st.moved = true;
      if (handle === 'move') {
        it.x = Math.round(st.it.x + dx); it.y = Math.round(st.it.y + dy);
        if (ev.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) it.y = st.it.y; else it.x = st.it.x; }
      } else if (handle === 'size') {
        if (it.type === 'text') {
          const w0 = O.measureTextItem(st.it).w;
          it.size = clamp(Math.round(st.it.size * (w0 + dx) / w0), 8, 600);
        } else {
          const f = Math.max(.05, Math.max((st.it.w + dx) / st.it.w, (st.it.h + dy) / st.it.h));
          it.w = Math.max(20, Math.round(st.it.w * f)); it.h = Math.max(20, Math.round(st.it.h * f));
        }
      } else {
        let a = Math.atan2(ev.clientY - st.cy, ev.clientX - st.cx) / DEG + 90;
        if (a > 180) a -= 360;
        if (ev.shiftKey) a = Math.round(a / 15) * 15;
        it.rot = Math.round(a);
      }
      placeBox(box, it, R, k);
      throttledRebuild();
    };
    const up = () => {
      document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up);
      if (st.moved) { changed({ panel: true }); }
    };
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
  });
  ov.addEventListener('dblclick', e => {
    const box = e.target.closest('.box'); if (!box) return;
    const it = slide().items[+box.dataset.i];
    if (it && it.type === 'video') { openVideoEditor(it); return; }
    if (it && (it.type === 'text' || it.type === 'olt')) { tab = 'item'; renderTabs(); renderPanel(); setTimeout(() => { const t = $('#panel textarea'); if (t) { t.focus(); t.select(); } }, 30); }
  });
  // bestanden slepen
  const st = $('#stage');
  st.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  st.addEventListener('drop', e => { if (!e.dataTransfer.files.length) return; e.preventDefault(); handleFiles([...e.dataTransfer.files]); });
}
let lastThrottle = 0, throttleT = null;
function throttledRebuild() {
  const now = performance.now();
  clearTimeout(throttleT);
  if (now - lastThrottle > 110) { lastThrottle = now; rebuildNow(true); }
  else throttleT = setTimeout(() => { lastThrottle = performance.now(); rebuildNow(true); }, 120);
}
function pickAt(x, y) { const r = $('#view').getBoundingClientRect(); return world.pickStation((x - r.left) / r.width * 2 - 1, -((y - r.top) / r.height) * 2 + 1); }
function rayPlane(x, y, plane) {
  const r = $('#view').getBoundingClientRect(), rc = new THREE.Raycaster();
  rc.setFromCamera(new THREE.Vector2((x - r.left) / r.width * 2 - 1, -((y - r.top) / r.height) * 2 + 1), world.camera);
  return rc.ray.intersectPlane(plane, new THREE.Vector3());
}

// ── opbouwen ────────────────────────────────────────────────────────────
let rebuildT = null;
function rebuildNow(keepOverlay) {
  clearTimeout(rebuildT); rebuildT = null;
  world.selected = cur;
  world.setDoc(doc);
  world.updateFrames();
  if (!keepOverlay) updateOverlay();
  updateEmptyHint();
  requestRender();
}
function scheduleRebuild(ms) { clearTimeout(rebuildT); rebuildT = setTimeout(() => rebuildNow(), ms ?? 70); }
function changed(o) {
  o = o || {};
  dirty = true; updateDocName();
  if (o.rebuild !== false) scheduleRebuild(o.now ? 0 : 70);
  scheduleThumbs(); scheduleHistory(); scheduleAutosave();
  if (o.list) renderSlides();
  if (o.panel) renderPanel();
}
let thumbsT = null;
function scheduleThumbs() { clearTimeout(thumbsT); thumbsT = setTimeout(renderSlides, 260); }
function setDoc(d, keepCur) {
  doc = O.normalizeDoc(d);
  Object.entries(doc.media).forEach(([id, v]) => DB.set('m:' + id, v).catch(() => {}));
  if (!keepCur) cur = 0;
  cur = clamp(cur, 0, Math.max(0, doc.slides.length - 1)); sel = -1;
  // tekstpaden opnieuw opbouwen met het huidige font
  doc.slides.forEach(s => s.items.forEach(it => { if (it.type === 'olt' && it.text) { const src = O.composeOneLineText(it.text, it.letterColors); if (src) it.src = src; } }));
  rebuildNow(); renderAll();
  O.loadFonts(doc).then(() => { rebuildNow(); renderSlides(); });
}
function renderAll() { renderSlides(); renderTabs(); renderPanel(); updateDocName(); updateUndo(); buildWorldMenu(); updateHint(); }
function updateEmptyHint() {
  const eh = $('#emptyhint');
  if (!doc.slides.length) { eh.hidden = false; eh.innerHTML = '<b>Nog leeg</b>Maak een dia met ＋, of kies Bestand → Voorbeeldpresentatie laden'; }
  else if (mode === 'slide' && !slide().items.length) { eh.hidden = false; eh.innerHTML = '<b>Lege dia</b>Voeg een tekening, tekst als lijn of 3D-vorm toe (rechts of via Toevoegen ▾)'; }
  else eh.hidden = true;
}
function updateDocName() {
  const n = fileName ? fileName.replace(/\.json$/i, '') : (doc.title || 'Naamloos');
  $('#docname').innerHTML = esc(n) + (dirty ? ' <i>●</i>' : '');
  document.title = (dirty ? '● ' : '') + n + ' — 3D One Line Prezi';
}
function updateHint() {
  $('#vhint').textContent = mode === 'world'
    ? 'Slepen = draaien · rechts slepen = schuiven · scrollen = zoomen · klik = dia kiezen · dubbelklik = bewerken · Shift+slepen = dia verplaatsen'
    : 'Sleep om te verplaatsen · hoekje = groter/kleiner · bolletje = draaien (Shift = per 15°) · pijltjes = schuiven · Esc = terug';
  $$('.seg button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
}
function setMode(m) {
  if (m === 'slide' && !slide()) return;
  mode = m; updateHint(); updateEmptyHint();
  if (m === 'slide') goToSlideView(true);
  else { $('#overlay').innerHTML = ''; goToSlideView(true); }
}

// ── dia-editor (overlay) ────────────────────────────────────────────────
const ITEM_ICON = { svg: '✎', olt: 'ℓ', shape: '◍', model: '⬡', text: 'T', image: '▣', video: '▶' };
const ITEM_TYPE = { svg: 'Tekening', olt: 'Tekst als lijn', shape: '3D-vorm', model: '3D-tekening', text: 'Tekst', image: 'Afbeelding', video: 'Video' };
function itemLabel(it) {
  if (it.type === 'svg') return it.name || 'Tekening';
  if (it.type === 'olt') return '“' + (it.text || '').replace(/\n/g, ' ') + '”';
  if (it.type === 'shape') return (O.SHAPES[it.shape] || {}).name || 'Vorm';
  if (it.type === 'model') return it.name || ((window.OLP3D_MODELS && window.OLP3D_MODELS.MODELS[it.model]) || {}).name || '3D-tekening';
  if (it.type === 'video') return it.name || 'Video';
  if (it.type === 'text') return (it.text || '').split('\n')[0] || 'Tekst';
  return 'Afbeelding';
}
function itemBox(it) {
  if (it.type === 'text') { const m = O.measureTextItem(it); return { x: it.x, y: it.y, w: m.w, h: m.h }; }
  return { x: it.x, y: it.y, w: it.w, h: it.h };
}
function placeBox(el, it, R, k) {
  const b = itemBox(it);
  el.style.left = (R.x + b.x * k) + 'px'; el.style.top = (R.y + b.y * k) + 'px';
  el.style.width = Math.max(6, b.w * k) + 'px'; el.style.height = Math.max(6, b.h * k) + 'px';
  el.style.transform = `rotate(${it.rot || 0}deg)`;
}
function updateOverlay() {
  const ov = $('#overlay');
  if (mode !== 'slide' || !slide() || camAnim) { if (mode !== 'slide') ov.innerHTML = ''; return; }
  const R = world.frameRect(cur); if (!R || R.w < 10) { ov.innerHTML = ''; return; }
  const k = R.w / FW;
  ov.innerHTML = '';
  ov.appendChild(h('div', { class: 'frame-guide', style: `left:${R.x}px;top:${R.y}px;width:${R.w}px;height:${R.h}px` }));
  slide().items.forEach((it, i) => {
    const b = h('div', { class: 'box' + (i === sel ? ' on' : ''), 'data-i': i }, h('div', { class: 'tag' }, ITEM_ICON[it.type] + ' ' + itemLabel(it)), h('div', { class: 'hd', title: 'Groter / kleiner' }), h('div', { class: 'rt', title: 'Draaien' }));
    placeBox(b, it, R, k); ov.appendChild(b);
  });
}

// ── dia-lijst ───────────────────────────────────────────────────────────
const thumbCache = new Map();
function thumbSVG(s) {
  const th = theme();
  const key = O.hashStr(JSON.stringify(s) + '|' + JSON.stringify(doc.settings.custom) + doc.settings.world + doc.settings.frame);
  if (thumbCache.has(key)) return thumbCache.get(key);
  const bg = doc.settings.frame === 'kaart' ? (s.cardColor || th.card) : th.mid, lineDef = s.lineColor || th.line;
  let o = `<svg viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg"><rect width="1920" height="1080" fill="${esc(bg)}"/>`;
  s.items.forEach(it => {
    const rot = it.rot ? ` transform="rotate(${it.rot} ${it.x + it.w / 2} ${it.y + it.h / 2})"` : '';
    if (it.type === 'svg' || it.type === 'olt') {
      const src = it.type === 'olt' ? it.src : it.svg; if (!src) return;
      const info = O.readSvg(src), [vx, vy, vw, vh] = info.vb;
      let d = '';
      info.paths.forEach(p => { if (!p.visible) return; p.subs.forEach(sp => { const step = Math.max(1, Math.floor(sp.length / 300)); let first = true; for (let k = 0; k < sp.length; k += step) { d += (first ? 'M' : 'L') + sp[k].x.toFixed(0) + ' ' + sp[k].y.toFixed(0); first = false; } }); });
      const col = (it.pathColors && it.pathColors[0]) || it.color || lineDef;
      o += `<g${rot}><svg x="${it.x}" y="${it.y}" width="${it.w}" height="${it.h}" viewBox="${vx} ${vy} ${vw} ${vh}" overflow="visible"><path d="${d}" fill="none" stroke="${esc(col)}" stroke-width="1.4" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/></svg></g>`;
    } else if (it.type === 'shape') {
      const sz = Math.min(it.w, it.h), x = it.x + (it.w - sz) / 2, y = it.y + (it.h - sz) / 2;
      o += `<svg x="${x}" y="${y}" width="${sz}" height="${sz}" viewBox="0 0 100 100"><path d="${O.shapePreviewPath(it.shape, it.detail, it.tiltX, it.tiltY, 100)}" fill="none" stroke="${esc(it.color || lineDef)}" stroke-width="1.2" vector-effect="non-scaling-stroke"/></svg>`;
    } else if (it.type === 'model' && window.OLP3D_MODELS) {
      const md = window.OLP3D_MODELS.build(it.model, it.detail); if (!md) return;
      const e = new THREE.Euler(it.tiltX * DEG, it.tiltY * DEG, 0, 'YXZ'), v = new THREE.Vector3(), sz = Math.min(it.w, it.h);
      let d = ''; const step = Math.max(1, Math.floor(md.p.length / 900));
      for (let k = 0; k < md.p.length; k += step) { v.set(...md.p[k]).applyEuler(e); d += (k && md.v[k] ? 'L' : 'M') + (it.x + it.w / 2 + v.x * sz * .46).toFixed(0) + ' ' + (it.y + it.h / 2 - v.y * sz * .46).toFixed(0); }
      o += '<path d="' + d + '" fill="none" stroke="' + esc(it.color || lineDef) + '" stroke-width="1.2" vector-effect="non-scaling-stroke"/>';
    } else if (it.type === 'text') {
      const m = O.measureTextItem(it), anchor = it.align === 'left' ? 'start' : it.align === 'right' ? 'end' : 'middle';
      const ax = it.align === 'left' ? it.x + it.size * .15 : it.align === 'right' ? it.x + m.w - it.size * .15 : it.x + m.w / 2;
      const rt = it.rot ? ` transform="rotate(${it.rot} ${it.x + m.w / 2} ${it.y + m.h / 2})"` : '';
      o += `<g${rt} font-family="${esc(it.font)}" font-size="${it.size}" font-weight="${it.bold ? 700 : 400}" font-style="${it.italic ? 'italic' : 'normal'}" fill="${esc(it.color || th.text)}" text-anchor="${anchor}">` +
        m.lines.map((l, k) => `<text x="${ax}" y="${it.y + it.size * .1 + it.size * 1.25 * (k + .5)}" dominant-baseline="central">${esc(l)}</text>`).join('') + '</g>';
    } else if (it.type === 'video') {
      o += `<g${rot}><rect x="${it.x}" y="${it.y}" width="${it.w}" height="${it.h}" rx="18" fill="#1c1736"/><circle cx="${it.x + it.w / 2}" cy="${it.y + it.h / 2}" r="${Math.min(it.w, it.h) * .14}" fill="#fff"/><path d="M${it.x + it.w / 2 - Math.min(it.w, it.h) * .05} ${it.y + it.h / 2 - Math.min(it.w, it.h) * .07}l${Math.min(it.w, it.h) * .12} ${Math.min(it.w, it.h) * .07}l-${Math.min(it.w, it.h) * .12} ${Math.min(it.w, it.h) * .07}z" fill="#ff5eb8"/></g>`;
    } else if (it.type === 'image' && it.src) {
      o += `<g${rot}><image href="${esc(O.resolveSrc(doc, it.src))}" x="${it.x}" y="${it.y}" width="${it.w}" height="${it.h}" opacity="${it.opacity ?? 1}" preserveAspectRatio="xMidYMid meet"/></g>`;
    }
  });
  o += '</svg>';
  if (thumbCache.size > 400) thumbCache.clear();
  thumbCache.set(key, o);
  return o;
}
function autoTitle(s) {
  const t = s.items.find(it => it.type === 'text' || it.type === 'olt');
  if (t) return (t.text || '').split('\n')[0];
  const a = s.items.find(it => it.type === 'svg'); if (a) return a.name || 'Tekening';
  const sh = s.items.find(it => it.type === 'shape'); if (sh) return (O.SHAPES[sh.shape] || {}).name;
  return 'Lege dia';
}
function renderSlides() {
  clearTimeout(thumbsT);
  const box = $('#slides');
  const top = box.scrollTop;
  box.innerHTML = doc.slides.map((s, i) => `<div class="sl ${i === cur ? 'on' : ''}" draggable="true" data-i="${i}"><div class="th">${thumbSVG(s)}</div><div class="meta"><span class="n">${i + 1}</span><span class="t">${esc(s.title || autoTitle(s))}</span></div><div class="acts"><button data-a="up" title="Eerder in de presentatie">↑</button><button data-a="down" title="Later in de presentatie">↓</button><button data-a="dup" title="Dupliceren">⧉</button><button data-a="del" title="Verwijderen">✕</button></div></div>`).join('')
    + `<button class="addslide" data-a="add">＋ Nieuwe dia</button>`;
  box.scrollTop = top;
}
function bindSlides() {
  const box = $('#slides');
  box.addEventListener('click', e => {
    const a = e.target.closest('[data-a]'), sl = e.target.closest('.sl');
    if (a && a.dataset.a === 'add') { addSlide(); return; }
    if (!sl) return;
    const i = +sl.dataset.i;
    if (a && a.dataset.a === 'dup') { duplicateSlide(i); return; }
    if (a && a.dataset.a === 'up') { reorderSlide(i, i - 1); return; }
    if (a && a.dataset.a === 'down') { reorderSlide(i, i + 1); return; }
    if (a && a.dataset.a === 'del') { deleteSlide(i); return; }
    selectSlide(i, true);
  });
  box.addEventListener('dblclick', e => { const sl = e.target.closest('.sl'); if (sl) { selectSlide(+sl.dataset.i); setMode('slide'); } });
  let from = -1;
  box.addEventListener('dragstart', e => { const sl = e.target.closest('.sl'); if (!sl) return; from = +sl.dataset.i; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'slide'); });
  box.addEventListener('dragover', e => { if (from < 0) return; e.preventDefault(); $$('.sl', box).forEach(s => s.classList.remove('drag-over')); const sl = e.target.closest('.sl'); if (sl) sl.classList.add('drag-over'); });
  box.addEventListener('drop', e => {
    if (from < 0) return; e.preventDefault();
    const sl = e.target.closest('.sl'); let to = sl ? +sl.dataset.i : doc.slides.length - 1;
    if (to !== from) reorderSlide(from, to);
    from = -1; $$('.sl', box).forEach(s => s.classList.remove('drag-over'));
  });
  box.addEventListener('dragend', () => { from = -1; $$('.sl', box).forEach(s => s.classList.remove('drag-over')); });
}
// Dia verplaatsen in de volgorde. De presentatie volgt de nieuwe volgorde;
// de plekken in de ruimte blijven op hun route, zodat de reis door de
// ruimte gewoon doorloopt (de dia's wisselen van plek op die route).
function reorderSlide(from, to) {
  if (to < 0 || to >= doc.slides.length || to === from) return;
  const slots = doc.slides.map(sl => JSON.parse(JSON.stringify({ pos: sl.pos, rot: sl.rot, scale: sl.scale })));
  const [m] = doc.slides.splice(from, 1); doc.slides.splice(to, 0, m);
  doc.slides.forEach((sl, i) => Object.assign(sl, slots[i]));
  cur = to; sel = -1;
  rebuildNow(); changed({ list: true, panel: true, rebuild: false });
  goToSlideView(true);
  toast('Dia ' + (from + 1) + ' is nu dia ' + (to + 1));
}
function selectSlide(i, fly) {
  if (i < 0 || i >= doc.slides.length) return;
  const changedSlide = i !== cur;
  cur = i; sel = -1;
  $$('#slides .sl').forEach(el => el.classList.toggle('on', +el.dataset.i === i));
  const el = $(`#slides .sl[data-i="${i}"]`); if (el) el.scrollIntoView({ block: 'nearest' });
  world.selected = cur; world.updateFrames(); requestRender();
  if (tab === 'item') tab = 'slide';
  renderTabs(); renderPanel(); updateEmptyHint();
  if (mode === 'slide') { $('#overlay').innerHTML = ''; goToSlideView(true); }
  else if (fly || changedSlide && fly !== false) goToSlideView(true);
}
function newSlidePos(after) {
  const base = doc.slides[after];
  if (!base) return { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 }, scale: 1 };
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(base.rot.x * DEG, base.rot.y * DEG, base.rot.z * DEG, 'YXZ'));
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
  const p = new THREE.Vector3(base.pos.x, base.pos.y, base.pos.z);
  for (let k = 1; k < 30; k++) {
    const c = p.clone().addScaledVector(right, 24 * base.scale * k);
    if (!doc.slides.some(s => new THREE.Vector3(s.pos.x, s.pos.y, s.pos.z).distanceTo(c) < 12)) { p.copy(c); break; }
  }
  return { pos: { x: r2(p.x), y: r2(p.y), z: r2(p.z) }, rot: { ...base.rot }, scale: base.scale };
}
function addSlide(items) {
  const at = doc.slides.length ? cur : -1;
  const s = O.normalizeSlide(Object.assign(newSlidePos(at), { items: items || [] }), 0);
  doc.slides.splice(at + 1, 0, s);
  cur = at + 1; sel = -1;
  rebuildNow(); changed({ list: true, panel: true, rebuild: false });
  renderTabs(); goToSlideView(true);
  return s;
}
function duplicateSlide(i) {
  const c = JSON.parse(JSON.stringify(doc.slides[i]));
  c.items.forEach(it => { it.id = O.newId(); });
  const np = newSlidePos(i); c.pos = np.pos;
  doc.slides.splice(i + 1, 0, c); cur = i + 1; sel = -1;
  rebuildNow(); changed({ list: true, panel: true, rebuild: false }); goToSlideView(true);
  toast('Dia gedupliceerd');
}
function deleteSlide(i) {
  doc.slides.splice(i, 1);
  if (cur > i || cur >= doc.slides.length) cur--;
  cur = clamp(cur, 0, Math.max(0, doc.slides.length - 1));
  sel = -1; if (!doc.slides.length && mode === 'slide') { mode = 'world'; updateHint(); }
  rebuildNow(); changed({ list: true, panel: true, rebuild: false });
  toast('Dia verwijderd — Ctrl+Z zet hem terug');
}

// ── elementen toevoegen ─────────────────────────────────────────────────
function ensureSlide() { if (!slide()) addSlide(); return slide(); }
function pushItem(it, opts) {
  const s = ensureSlide();
  const n = O.normalizeItem(it); if (!n) return;
  s.items.push(n); sel = s.items.length - 1; tab = 'item';
  if (!(opts && opts.stayWorld) && mode !== 'slide') setMode('slide');
  rebuildNow(); changed({ list: true, panel: true, rebuild: false }); renderTabs();
  return n;
}
function vbOf(svg) { return O.readSvg(svg).vb; }
function oltBox(src, cx, cy, hPerLine) {
  const vb = vbOf(src), lines = Math.max(1, Math.round((vb[3] - 40) / 230));
  let h = hPerLine * lines, w = vb[2] * (h / vb[3]);
  if (w > 1700) { h *= 1700 / w; w = 1700; }
  return { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w: Math.round(w), h: Math.round(h) };
}
// Bibliotheek: de platte 2D-tekeningen (3D staat apart, bij 3D-tekeningen).
function addLibrary(entry) {
  pushItem({ type: 'svg', svg: entry.svg, name: entry.name, x: 0, y: 0, w: FW, h: FH });
}
// Een figuur uit de bibliotheek met subtiel reliëf (bij de 3D-tekeningen)
function addRelief(entry, depth) {
  pushItem({ type: 'svg', svg: entry.svg, name: entry.name, x: 0, y: 0, w: FW, h: FH, deform: 'relief', depth: depth || .75 });
}
function addSvgText(text, name) {
  const clean = O.sanitizeSvgText(text);
  const info = O.readSvg(clean);
  if (!info.paths.length) { toast('In dit bestand staan geen lijnen', 'err'); return; }
  const [, , vw, vh] = info.vb;
  const full = Math.abs(vw / vh - 16 / 9) < .02;
  let w = FW, h = FH;
  if (!full) { const sc = Math.min(1500 / vw, 860 / vh); w = vw * sc; h = vh * sc; }
  pushItem({ type: 'svg', svg: clean, name: (name || 'Tekening').replace(/\.svg$/i, ''), x: Math.round((FW - w) / 2), y: Math.round((FH - h) / 2), w: Math.round(w), h: Math.round(h) });
}
async function addOlt() {
  const text = await askOltText('Tekst als lijn', '', 'Toevoegen');
  if (!text) return;
  const src = O.composeOneLineText(text);
  if (!src) { toast('Geen tekens gevonden die in het one-line-font staan', 'err'); return; }
  const b = oltBox(src, FW / 2, FH * .5, 230);
  pushItem({ type: 'olt', text, src, ...b });
}
function addModel(name) {
  const M = window.OLP3D_MODELS && window.OLP3D_MODELS.MODELS[name]; if (!M) return;
  const s = slide();
  if (s && !s.items.length && s.motion === 'zweven') s.motion = 'rondje';
  pushItem({ type: 'model', model: name, name: M.name, x: 530, y: 110, w: 860, h: 860 });
}
function addShape(name) {
  pushItem({ type: 'shape', shape: name, x: 610, y: 190, w: 700, h: 700, detail: 5 });
}
function addText() {
  const it = { type: 'text', text: 'Tekst', size: 90, align: 'center', w: 1600 };
  const m = O.measureTextItem(O.normalizeItem(it));
  it.x = Math.round((FW - m.w) / 2); it.y = Math.round(FH * .78 - m.h / 2);
  pushItem(it);
  setTimeout(() => { const t = $('#panel textarea'); if (t) { t.focus(); t.select(); } }, 40);
}
function readFileAs(f, how) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); how === 'text' ? r.readAsText(f) : r.readAsDataURL(f); }); }
function compressImage(dataUrl, maxW, maxH) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const sc = Math.min(1, maxW / img.width, maxH / img.height);
      if (sc >= 1 && dataUrl.length < 1.5e6) { res({ src: dataUrl, w: img.width, h: img.height }); return; }
      const c = document.createElement('canvas'); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const png = /image\/png|image\/webp|image\/gif/.test(dataUrl.slice(0, 30));
      res({ src: c.toDataURL(png ? 'image/png' : 'image/jpeg', .88), w: img.width, h: img.height });
    };
    img.onerror = () => res(null);
    img.src = dataUrl;
  });
}
async function addImageFile(f) {
  const data = await readFileAs(f, 'url');
  const r = await compressImage(data, 2400, 2400);
  if (!r) { toast('Deze afbeelding kan niet gelezen worden', 'err'); return; }
  const sc = Math.min(1000 / r.w, 700 / r.h, 1.5);
  const w = Math.round(r.w * sc), h = Math.round(r.h * sc);
  pushItem({ type: 'image', src: addMedia(r.src), x: Math.round((FW - w) / 2), y: Math.round((FH - h) / 2), w, h });
}
async function handleFiles(files) {
  for (const f of files) {
    const n = f.name.toLowerCase();
    if (n.endsWith('.json')) { if (await confirmDiscard()) loadText(await readFileAs(f, 'text'), f.name, null); return; }
    if (n.endsWith('.svg') || f.type === 'image/svg+xml') addSvgText(await readFileAs(f, 'text'), f.name);
    else if (f.type.startsWith('image/')) await addImageFile(f);
    else if (f.type.startsWith('video/')) await addVideoFile(f);
    else toast('Dit bestandstype wordt niet ondersteund: ' + f.name, 'err');
  }
}

// ── video's (zoals in de 2D-app: bestand, link of YouTube) ──────────────
let replaceVideo = false;
function extractYouTubeID(url) {
  if (!url) return null;
  const pats = [/(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/, /(?:youtube\.com\/watch\?(?:.*&)?v=)([a-zA-Z0-9_-]{11})/, /(?:youtube(?:-nocookie)?\.com\/(?:embed|v|shorts|live)\/)([a-zA-Z0-9_-]{11})/, /^([a-zA-Z0-9_-]{11})$/];
  for (const p of pats) { const m = String(url).trim().match(p); if (m) return m[1]; }
  return null;
}
function parseYouTubeStart(url) {
  const m = /[?&#](?:t|start)=([0-9hms:.]+)/i.exec(url || ''); if (!m) return 0;
  const v = m[1]; if (/^\d+$/.test(v)) return parseInt(v, 10);
  const hms = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/i.exec(v);
  if (hms) return (parseInt(hms[1] || 0) * 3600) + (parseInt(hms[2] || 0) * 60) + parseInt(hms[3] || 0);
  return parseTime(v);
}
// Deellinks van Dropbox, Google Drive, OneDrive en SharePoint omzetten naar een
// link die rechtstreeks naar het videobestand wijst (zoals in de 2D-app).
function cloudVideoUrl(raw) {
  raw = String(raw || '').trim(); let u; try { u = new URL(raw); } catch (e) { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.toLowerCase();
  if (host === 'dropbox.com' || host.endsWith('.dropbox.com')) { if (host.startsWith('dl.')) return { url: u.toString(), service: 'Dropbox' }; u.searchParams.delete('dl'); u.searchParams.set('raw', '1'); return { url: u.toString(), service: 'Dropbox' }; }
  const gd = raw.match(/drive\.google\.com\/file\/d\/([\w-]{10,})/) || raw.match(/drive\.google\.com\/(?:open|uc)\?(?:.*&)?id=([\w-]{10,})/);
  if (gd) return { url: 'https://drive.google.com/uc?export=download&id=' + gd[1], service: 'Google Drive' };
  if (host === '1drv.ms' || host === 'onedrive.live.com') { const b64 = btoa(unescape(encodeURIComponent(raw))).replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-'); return { url: 'https://api.onedrive.com/v1.0/shares/u!' + b64 + '/root/content', service: 'OneDrive' }; }
  if (host.endsWith('.sharepoint.com')) { u.searchParams.set('download', '1'); return { url: u.toString(), service: 'SharePoint' }; }
  return { url: u.toString(), service: u.hostname };
}
function probeVideo(url) {
  return new Promise(res => {
    const v = document.createElement('video'); let done = false;
    const fin = r => { if (done) return; done = true; clearTimeout(t); v.removeAttribute('src'); try { v.load(); } catch (e) {} res(r); };
    const t = setTimeout(() => fin(null), 15000);
    v.preload = 'metadata'; v.muted = true;
    v.addEventListener('loadedmetadata', () => fin({ w: v.videoWidth, h: v.videoHeight, dur: v.duration }));
    v.addEventListener('error', () => fin(null));
    v.src = url;
  });
}
function videoBox(meta) {
  const ar = meta && meta.w && meta.h ? meta.h / meta.w : 9 / 16;
  let w = 1120, h = Math.round(w * ar); if (h > 760) { h = 760; w = Math.round(h / ar); }
  return { x: Math.round((FW - w) / 2), y: Math.round((FH - h) / 2 - 20), w, h };
}
async function readVideo(f) {
  if (f.size > 150e6 && !await confirmDlg('Grote video', `Deze video is ${Math.round(f.size / 1e6)} MB. Hij komt in het presentatiebestand en maakt dat groot. Een link (cloud) houdt het bestand klein. Toch toevoegen?`, 'Toevoegen')) return null;
  busy('Video inlezen…');
  try { const d = await readFileAs(f, 'url'); return d.startsWith('data:video/') ? d : d.replace(/^data:[^;,]*/, 'data:video/mp4'); } finally { busy(false); }
}
async function addVideoFile(f) {
  const data = await readVideo(f); if (!data) return;
  const meta = await probeVideo(data);
  if (!meta) { toast('Deze video kan de browser niet afspelen (gebruik MP4 of WebM)', 'err', 4000); return; }
  pushItem({ type: 'video', kind: 'file', src: addMedia(data), name: f.name.replace(/\.[^.]+$/, ''), autoplay: true, ...videoBox(meta) });
  toast('Tip: kies met ✂ welke stukken je laat zien', 'ok', 3500);
}
async function askText(title, help, value, ok) {
  const inp = h('input', { type: 'text', value: value || '', placeholder: 'https://…', style: 'font-size:15px' });
  return dialog({ title, body: h('div', {}, inp, h('p', { class: 'note' }, help)), buttons: [{ label: 'Annuleren', value: null }, { label: ok || 'OK', value: () => inp.value.trim(), pink: true }], onOpen: () => setTimeout(() => { inp.focus(); inp.select(); }, 30) });
}
const CLOUD_HELP = 'De link moet openbaar zijn ("iedereen met de link") en naar het videobestand zelf wijzen (MP4 of WebM). Deellinks van Dropbox, OneDrive, SharePoint en Google Drive worden vanzelf omgezet. Tijdens het presenteren is internet nodig.';
async function addVideoLink() {
  const raw = await askText('Video via link (cloud)', CLOUD_HELP, '', 'Toevoegen'); if (!raw) return;
  const c = cloudVideoUrl(raw); if (!c) { toast('Dat is geen geldige link', 'err'); return; }
  busy('Link controleren…'); const meta = await probeVideo(c.url); busy(false);
  if (!meta) { toast('Deze link geeft geen afspeelbare video. Is hij openbaar en wijst hij naar het bestand zelf?', 'err', 5000); return; }
  pushItem({ type: 'video', kind: 'link', src: c.url, name: c.service, autoplay: true, ...videoBox(meta) });
}
async function addYouTube() {
  const raw = await askText('YouTube-video', 'Plak de link van de YouTube-video. Een link met ?t=90 begint vanzelf op die tijd. YouTube heeft internet nodig en kan reclame tonen.', '', 'Toevoegen'); if (!raw) return;
  const id = extractYouTubeID(raw); if (!id) { toast('Dat is geen YouTube-link', 'err'); return; }
  const st0 = parseYouTubeStart(raw);
  pushItem({ type: 'video', kind: 'youtube', src: id, name: 'YouTube', segments: st0 ? [{ s: st0, e: null }] : [], autoplay: true, ...videoBox(null) });
  toast('Tip: kies met ✂ welke stukken je laat zien', 'ok', 3500);
}
function openVideoChoice() {
  dialog({ title: 'Video toevoegen', body: h('div', { class: 'grid2' },
    h('button', { class: 'btn full', onclick: () => { $('#modal').classList.remove('open'); $('#file-video').click(); } }, '▶ Video (bestand)'),
    h('button', { class: 'btn full', onclick: () => { $('#modal').classList.remove('open'); addVideoLink(); } }, '☁ Video via link'),
    h('button', { class: 'btn full', onclick: () => { $('#modal').classList.remove('open'); addYouTube(); } }, '▶ YouTube'),
    h('button', { class: 'btn full', onclick: () => { $('#modal').classList.remove('open'); $('#file-img').click(); } }, '▣ Afbeelding')) });
}
function videoPanel(it, ch) {
  const out = [];
  const nm = h('input', { type: 'text', value: it.name, placeholder: 'Naam' }); nm.addEventListener('input', () => { it.name = nm.value; changed({ rebuild: false }); });
  out.push(row('Naam', nm));
  if (it.kind === 'youtube' || it.kind === 'link') {
    const u = h('input', { type: 'text', value: it.kind === 'youtube' ? 'https://youtu.be/' + it.src : it.src });
    u.addEventListener('change', () => {
      if (it.kind === 'youtube') { const id = extractYouTubeID(u.value); if (id) { it.src = id; ch(); } else toast('Geen YouTube-link', 'err'); }
      else { const c = cloudVideoUrl(u.value); if (c) { it.src = c.url; ch(); } else toast('Geen geldige link', 'err'); }
    });
    out.push(row('Link', u));
  } else out.push(h('button', { class: 'btn full', onclick: () => { replaceVideo = true; $('#file-video').click(); } }, 'Andere video kiezen…'));
  out.push(check('Automatisch starten', it.autoplay, v => { it.autoplay = v; ch(false); }));
  out.push(check('Geluid aan', !it.muted, v => { it.muted = !v; ch(false); }));
  out.push(check('Herhalen', it.loop, v => { it.loop = v; ch(false); }));
  out.push(h('button', { class: 'btn pink full', style: 'margin-top:6px', onclick: () => openVideoEditor(it) }, '✂ Afspelen en stukjes kiezen…'));
  out.push(h('p', { class: 've-legend', style: 'margin:6px 0 0' }, segSummary(it)));
  out.push(h('p', { class: 'note' }, 'Tijdens het presenteren tekent de lijn eerst een kader; daarna verschijnt de video. Zonder “automatisch starten” start de volgende klik eerst de video. K = afspelen/pauzeren, of klik op de video.' + (it.kind === 'youtube' ? ' YouTube wordt niet meegenomen in een video-opname.' : '')));
  return out;
}

// ── video-editor: afspelen en kiezen welke stukken je laat zien ──────────
// Stukjes zijn [{s, e}] (seconden, e = null = tot het eind). Geen stukjes =
// de hele video. Je markeert een stuk (begin/einde) en kiest "laten zien"
// of "weghalen"; de randen van een stukje kun je op de tijdlijn verslepen.
function segSummary(it) {
  const sg = it.segments || [];
  if (!sg.length) return 'Hele video';
  return sg.length + (sg.length === 1 ? ' stukje: ' : ' stukjes: ') + sg.map(x => fmtTime(x.s) + '–' + (x.e == null ? 'eind' : fmtTime(x.e))).join(', ');
}
async function openVideoEditor(it) {
  const src = it.kind === 'youtube' ? it.src : O.resolveSrc(doc, it.src);
  if (!src) { toast('Deze video heeft nog geen bron', 'err'); return; }
  let segs = O.cleanSegments(it.segments).map(x => ({ ...x }));
  let dur = 0, markA = null, markB = null, preview = false, raf = 0, yt = null, alive = true;
  const stage = h('div', { class: 've-stage' });
  const P = { t: () => 0, play() {}, pause() {}, seek() {}, playing: () => false };
  let video = null;
  if (it.kind === 'youtube') {
    stage.appendChild(h('div', { id: 've-yt' }));
  } else {
    video = h('video', { playsinline: true, preload: 'auto' }); video.src = src; stage.appendChild(video);
    video.addEventListener('loadedmetadata', () => { dur = video.duration || 0; render(); });
    video.addEventListener('click', () => P.playing() ? P.pause() : P.play());
    P.t = () => video.currentTime; P.play = () => video.play().catch(() => {}); P.pause = () => video.pause();
    P.seek = t => { try { video.currentTime = clamp(t, 0, dur || t); } catch (e) {} }; P.playing = () => !video.paused;
  }
  const time = h('span', { class: 've-time' }, '0:00.0');
  const playBtn = h('button', { class: 'btn pink', title: 'Afspelen / pauzeren (spatie)', onclick: () => { preview = false; P.playing() ? P.pause() : P.play(); } }, '▶ Afspelen');
  const tl = h('div', { class: 've-tl', title: 'Klik om naar dat moment te gaan' });
  const markInfo = h('span', { class: 've-legend' });
  const keepBtn = h('button', { class: 'btn', onclick: () => applyMark('keep') }, '✓ Dit stuk laten zien');
  const cutBtn = h('button', { class: 'btn', onclick: () => applyMark('cut') }, '✂ Dit stuk weghalen');
  const list = h('div', { class: 've-list' });
  const sum = h('p', { class: 've-legend' });
  const T = () => P.t() || 0;
  const len = () => dur || Math.max(1, ...segs.map(x => x.e || x.s + 1));
  const iv = () => segs.map(x => [x.s, x.e == null ? len() : x.e]);
  const toSegs = arr => O.cleanSegments(arr.filter(([a, b]) => b - a > .2).map(([a, b]) => ({ s: Math.max(0, a), e: b >= len() - .15 ? null : b })));
  const isWhole = () => !segs.length || (segs.length === 1 && segs[0].s <= .05 && segs[0].e == null);
  function applyMark(kind) {
    if (markA == null || markB == null || markB - markA < .2) { toast('Markeer eerst een begin en een einde (knoppen [ en ])', 'err'); return; }
    const a = markA, b = markB;
    if (kind === 'keep') segs = toSegs((isWhole() ? [] : iv()).concat([[a, b]]));
    else {
      const out = [];
      (isWhole() ? [[0, len()]] : iv()).forEach(([x, y]) => { if (b <= x || a >= y) out.push([x, y]); else { if (a > x) out.push([x, a]); if (b < y) out.push([b, y]); } });
      const n = toSegs(out);
      if (!n.length) { toast('Dan blijft er niets over van de video', 'err'); return; }
      segs = n;
    }
    if (isWhole()) segs = [];
    markA = markB = null; render();
  }
  const pct = t => (clamp(t / len(), 0, 1) * 100) + '%';
  function render() {
    tl.innerHTML = '';
    const shown = isWhole() ? [[0, len()]] : iv();
    shown.forEach(([a, b], k) => {
      const blk = h('div', { class: 've-keep', style: `left:${pct(a)};width:calc(${pct(b)} - ${pct(a)})` });
      if (!isWhole()) {
        blk.appendChild(h('i', { class: 'l', 'data-k': k, 'data-side': 's', title: 'Sleep om het begin te verschuiven' }));
        blk.appendChild(h('i', { class: 'r', 'data-k': k, 'data-side': 'e', title: 'Sleep om het einde te verschuiven' }));
      }
      tl.appendChild(blk);
    });
    if (markA != null) tl.appendChild(h('div', { class: 've-mark', style: `left:${pct(markA)};width:calc(${pct(markB ?? T())} - ${pct(markA)})` }));
    tl.appendChild(h('div', { class: 've-head', style: `left:${pct(T())}` }));
    markInfo.textContent = markA == null ? 'Nog niets gemarkeerd' : 'Gemarkeerd: ' + fmtTime(markA) + ' – ' + (markB == null ? '…' : fmtTime(markB));
    keepBtn.disabled = cutBtn.disabled = !(markA != null && markB != null && markB > markA);
    list.innerHTML = '';
    if (isWhole()) list.appendChild(h('p', { class: 've-legend' }, 'De hele video wordt getoond. Markeer een stuk en kies “laten zien” of “weghalen”.'));
    else segs.forEach((x, k) => {
      const si = h('input', { type: 'text', value: fmtTime(x.s) }), ei = h('input', { type: 'text', value: x.e == null ? '' : fmtTime(x.e), placeholder: 'eind' });
      si.addEventListener('change', () => { x.s = parseTime(si.value); segs = O.cleanSegments(segs); if (!segs.length) segs = []; render(); });
      ei.addEventListener('change', () => { x.e = ei.value.trim() ? parseTime(ei.value) : null; segs = O.cleanSegments(segs); render(); });
      list.appendChild(h('div', { class: 've-row' }, h('b', {}, 'Stukje ' + (k + 1)), si, h('span', {}, 'tot'), ei,
        h('button', { class: 'ibtn', title: 'Dit stukje afspelen', onclick: () => { preview = false; P.seek(x.s); P.play(); } }, '▶'),
        h('button', { class: 'ibtn', title: 'Dit stukje weghalen', onclick: () => { segs.splice(k, 1); if (!segs.length) toast('Geen stukjes meer: de hele video wordt getoond'); render(); } }, '✕')));
    });
    const total = (isWhole() ? [[0, len()]] : iv()).reduce((n, [a, b]) => n + (b - a), 0);
    sum.textContent = dur ? `Lengte video ${fmtTime(dur)} · in de presentatie ${fmtTime(total)}` : 'Video laden…';
  }
  // tijdlijn: klikken = spoelen, randen verslepen = stukje aanpassen
  tl.addEventListener('pointerdown', e => {
    const r = tl.getBoundingClientRect(), tAt = ev => clamp((ev.clientX - r.left) / r.width, 0, 1) * len();
    const hd = e.target.closest('i[data-k]');
    if (!hd) { P.seek(tAt(e)); render(); return; }
    e.preventDefault(); preview = false; P.pause();
    const k = +hd.dataset.k, side = hd.dataset.side, arr = iv();
    const mv = ev => {
      const t = tAt(ev), lo = k > 0 ? arr[k - 1][1] + .2 : 0, hi = k < arr.length - 1 ? arr[k + 1][0] - .2 : len();
      if (side === 's') arr[k][0] = clamp(t, lo, arr[k][1] - .3); else arr[k][1] = clamp(t, arr[k][0] + .3, hi);
      segs = toSegs(arr.map(x => x.slice())); P.seek(side === 's' ? arr[k][0] : arr[k][1]); render();
    };
    const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); };
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
  });
  const step = d => { preview = false; P.seek(Math.max(0, T() + d)); render(); };
  const markIn = () => { markA = T(); if (markB != null && markB <= markA) markB = null; render(); };
  const markOut = () => { const t = T(); if (markA == null || t <= markA) { markA = Math.max(0, t - 5); } markB = t; render(); };
  const body = h('div', { class: 've' }, stage,
    h('div', { class: 've-ctrl' },
      h('button', { class: 'btn', title: '5 seconden terug (←)', onclick: () => step(-5) }, '⏪ 5 s'), playBtn,
      h('button', { class: 'btn', title: '5 seconden vooruit (→)', onclick: () => step(5) }, '5 s ⏩'), time,
      h('span', { style: 'flex:1' }),
      h('button', { class: 'btn', title: 'Speel alleen de gekozen stukjes, zoals in de presentatie', onclick: () => { const fst = isWhole() ? 0 : segs[0].s; preview = true; P.seek(fst); P.play(); } }, '▶ Bekijk het resultaat')),
    tl,
    h('div', { class: 've-legend' }, h('span', { class: 've-sw keep' }), ' wordt getoond   ', h('span', { class: 've-sw cut' }), ' wordt overgeslagen   ', h('span', { class: 've-sw mark' }), ' gemarkeerd'),
    h('div', { class: 've-ctrl' },
      h('button', { class: 'btn', title: 'Begin van het stuk = nu (toets I)', onclick: markIn }, '[ Begin hier'),
      h('button', { class: 'btn', title: 'Einde van het stuk = nu (toets O)', onclick: markOut }, 'Einde hier ]'), markInfo,
      h('span', { style: 'flex:1' }), keepBtn, cutBtn),
    list, sum,
    h('div', { class: 've-ctrl' }, h('button', { class: 'btn', onclick: () => { segs = []; markA = markB = null; render(); } }, '↺ Hele video laten zien'),
      h('span', { class: 've-legend' }, 'Toetsen: spatie = afspelen · I = begin · O = einde · ← → = 1 s (Shift = 5 s)')));
  const onKey = e => {
    if (e.target.tagName === 'INPUT') return;
    const k = e.key;
    if (k === ' ') { e.preventDefault(); preview = false; P.playing() ? P.pause() : P.play(); }
    else if (k === 'i' || k === 'I') { e.preventDefault(); markIn(); }
    else if (k === 'o' || k === 'O') { e.preventDefault(); markOut(); }
    else if (k === 'ArrowLeft' || k === 'ArrowRight') { e.preventDefault(); step((k === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 5 : 1)); }
  };
  document.addEventListener('keydown', onKey, true);
  const tick = () => {
    if (!alive) return;
    raf = requestAnimationFrame(tick);
    if (yt && !dur && yt.getDuration) { const d = yt.getDuration(); if (d > 0) { dur = d; render(); } }
    const t = T();
    time.textContent = fmtTime(t) + (dur ? ' / ' + fmtTime(dur) : '');
    playBtn.textContent = P.playing() ? '⏸ Pauze' : '▶ Afspelen';
    const head = tl.querySelector('.ve-head'); if (head) head.style.left = pct(t);
    const mk = tl.querySelector('.ve-mark'); if (mk && markB == null) mk.style.width = `calc(${pct(Math.max(t, markA))} - ${pct(markA)})`;
    if (preview && P.playing() && !isWhole()) {
      const i = segs.findIndex(sg => sg.e == null || t < sg.e - .08);
      if (i === -1) { P.pause(); preview = false; } else if (t < segs[i].s - .3) P.seek(segs[i].s);
    }
  };
  render();
  const res = await dialog({
    title: '✂ Video: kies wat je laat zien' + (it.name ? ' — ' + it.name : ''), wide: true, body,
    buttons: [{ label: 'Annuleren', value: null }, { label: 'Opslaan', value: 'ok', pink: true }],
    onOpen: async () => {
      raf = requestAnimationFrame(tick);
      if (it.kind === 'youtube') {
        try { await O.ytApi(); } catch (e) { toast('YouTube kan niet geladen worden (internet nodig)', 'err', 4000); return; }
        if (!alive) return;
        yt = new YT.Player('ve-yt', { videoId: it.src, host: 'https://www.youtube-nocookie.com', width: '100%', height: '100%',
          playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
          events: { onReady: e => { dur = e.target.getDuration() || 0; render(); } } });
        P.t = () => (yt && yt.getCurrentTime ? yt.getCurrentTime() : 0); P.play = () => yt && yt.playVideo && yt.playVideo(); P.pause = () => yt && yt.pauseVideo && yt.pauseVideo();
        P.seek = t => yt && yt.seekTo && yt.seekTo(Math.max(0, t), true); P.playing = () => !!(yt && yt.getPlayerState && yt.getPlayerState() === 1);
      }
    }
  });
  alive = false; cancelAnimationFrame(raf); document.removeEventListener('keydown', onKey, true);
  try { if (video) { video.pause(); video.removeAttribute('src'); video.load(); } if (yt && yt.destroy) yt.destroy(); } catch (e) {}
  if (res === 'ok') {
    it.segments = isWhole() ? [] : segs.map(x => ({ s: x.s, e: x.e }));
    changed({ panel: true }); toast(segSummary(it), 'ok', 3500);
  }
}

// ── bibliotheek & vormen ────────────────────────────────────────────────
function svgDataUrl(svg) { return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); }
function openLibrary() {
  const lib = (window.SVG_LIBRARY || []);
  const grid = h('div', { class: 'lib' });
  const search = h('input', { type: 'text', class: 'search', placeholder: 'Zoeken…' });
  const fill = q => {
    grid.innerHTML = '';
    lib.filter(e => !q || e.name.toLowerCase().includes(q)).forEach(e => {
      grid.appendChild(h('button', { title: e.name, onclick: () => { closeFn && closeFn(null); addLibrary(e); } }, h('img', { src: svgDataUrl(e.svg), alt: e.name, loading: 'lazy' }), h('span', {}, e.name)));
    });
  };
  let closeFn = null;
  search.addEventListener('input', () => fill(search.value.trim().toLowerCase()));
  fill('');
  dialog({ title: '2D-tekening uit bibliotheek', body: grid, wide: true, search, onOpen: (d, close) => { closeFn = close; setTimeout(() => search.focus(), 30); } });
}
function openShapes() {
  const grid = h('div', { class: 'lib dark' });
  let closeFn = null;
  Object.entries(O.SHAPES).forEach(([k, sh]) => {
    const svg = `<svg viewBox="0 0 100 56" xmlns="http://www.w3.org/2000/svg"><g transform="translate(22,-0.5) scale(.57)"><path d="${O.shapePreviewPath(k, 5, 18, -24, 100)}" fill="none" stroke="#68e3d6" stroke-width="1.1" vector-effect="non-scaling-stroke"/></g></svg>`;
    const b = h('button', { title: sh.name, onclick: () => { closeFn && closeFn(null); addShape(k); } }, h('span', { html: '' }), h('span', {}, sh.name));
    b.firstChild.outerHTML = svg;
    grid.appendChild(b);
  });
  const grid2 = h('div', { class: 'lib dark' });
  const MM = window.OLP3D_MODELS;
  if (MM) Object.entries(MM.MODELS).forEach(([k, m]) => {
    const svg = `<svg viewBox="0 0 100 56" xmlns="http://www.w3.org/2000/svg"><g transform="translate(22,-0.5) scale(.57)"><path d="${MM.preview(k, 5, null, null, 100)}" fill="none" stroke="#ff9ad5" stroke-width="1.1" vector-effect="non-scaling-stroke"/></g></svg>`;
    const b = h('button', { title: m.name, onclick: () => { closeFn && closeFn(null); addModel(k); } }, h('span', { html: '' }), h('span', {}, m.name));
    b.firstChild.outerHTML = svg; grid2.appendChild(b);
  });
  const grid3 = h('div', { class: 'lib' });
  if (MM) (window.SVG_LIBRARY || []).filter(e => MM.reliefDepth(e.file) > 0).forEach(e => {
    grid3.appendChild(h('button', { title: e.name + ' (reliëf)', onclick: () => { closeFn && closeFn(null); addRelief(e, MM.reliefDepth(e.file)); } }, h('img', { src: svgDataUrl(e.svg), alt: e.name, loading: 'lazy' }), h('span', {}, e.name)));
  });
  dialog({ title: '3D: tekeningen, figuren en vormen', wide: true, body: h('div', {},
    h('p', { class: 'note' }, 'Alles hieronder is 3D: de camera kan er tijdens het presenteren omheen draaien (beweging “Rondje om tekening”). Platte tekeningen vind je bij 2D-tekening uit bibliotheek.'),
    h('div', { class: 'sec' }, h('h4', {}, '3D-tekeningen'), grid2),
    h('div', { class: 'sec' }, h('h4', {}, 'Figuren in reliëf'), grid3),
    h('div', { class: 'sec' }, h('h4', {}, 'Wiskundige vormen'), grid)), onOpen: (d, close) => { closeFn = close; } });
}
async function askOltText(title, value, ok) {
  O.loadOneLineFont();
  const ta = h('textarea', { rows: 3, placeholder: 'Typ hier je tekst (Enter = nieuwe regel, Ctrl+Enter = klaar)', style: 'font-size:16px' }); ta.value = value || '';
  const miss = h('p', { class: 'note' });
  const upd = () => { const m = O.oneLineMissing(ta.value); miss.innerHTML = m.length ? `<span style="color:var(--danger)">Niet in het font (wordt overgeslagen): ${esc(m.join(' '))}</span>` : 'Het font bevat a–z, A–Z, 0–9 en . , ! ? - : ; \' " ( ) & / + =  — letters met accent worden zonder accent geschreven.'; };
  ta.addEventListener('input', upd); upd();
  return dialog({ title, body: h('div', {}, ta, miss), buttons: [{ label: 'Annuleren', value: null }, { label: ok || 'OK', value: () => ta.value.trim(), pink: true }], onOpen: () => setTimeout(() => { ta.focus(); ta.select(); }, 30) });
}

// ── panelen ─────────────────────────────────────────────────────────────
function renderTabs() { $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab)); }
const sec = (title, ...kids) => h('div', { class: 'sec' }, h('h4', {}, title), ...kids);
const row = (label, ...ctl) => h('div', { class: 'row' }, h('label', {}, label), h('div', { class: 'ctl' }, ...ctl));
function slider(val, min, max, step, onInput) {
  const r = h('input', { type: 'range', min, max, step, value: val });
  const n = h('input', { type: 'number', min, max, step, value: r2(val) });
  r.addEventListener('input', () => { n.value = r.value; onInput(+r.value); });
  n.addEventListener('change', () => { const v = clamp(+n.value || 0, min, max); r.value = v; n.value = v; onInput(v); });
  return [r, n];
}
function colorCtl(val, fallback, onInput) {
  const c = h('input', { type: 'color', value: toHex(val || fallback) });
  const auto = h('button', { class: 'chip' + (val ? '' : ' on'), title: 'Kleur van de wereld gebruiken' }, 'auto');
  c.addEventListener('input', () => { auto.classList.remove('on'); onInput(c.value); });
  auto.addEventListener('click', () => { auto.classList.add('on'); c.value = toHex(fallback); onInput(''); });
  const pal = h('div', { class: 'pal' }, ['#1a1a1a', '#ffffff', '#ff5eb8', '#68e3d6', '#fff38c', '#c9b0f7', '#2a1458', '#e8443a'].map(col => h('button', { style: `background:${col}`, title: col, onclick: () => { c.value = col; auto.classList.remove('on'); onInput(col); } })));
  return h('div', { style: 'display:flex;flex-direction:column;flex:1' }, h('div', { style: 'display:flex;gap:6px;align-items:center' }, c, auto), pal);
}
function chips(options, val, onChange) {
  const wrap = h('div', { class: 'chips' });
  Object.entries(options).forEach(([k, l]) => wrap.appendChild(h('button', { class: 'chip' + (k === val ? ' on' : ''), onclick: e => { $$('.chip', wrap).forEach(c => c.classList.remove('on')); e.currentTarget.classList.add('on'); onChange(k); } }, l)));
  return wrap;
}
function selectCtl(options, val, onChange) {
  const s = h('select', {});
  Object.entries(options).forEach(([k, l]) => { const o = h('option', { value: k }, l); if (k === val) o.selected = true; s.appendChild(o); });
  s.addEventListener('change', () => onChange(s.value));
  return s;
}
function check(label, val, onChange) { const i = h('input', { type: 'checkbox', checked: val }); i.addEventListener('change', () => onChange(i.checked)); return h('label', { class: 'check' }, i, label); }
function numIn(val, onChange, step) { const n = h('input', { type: 'number', value: Math.round(val), step: step || 1 }); n.addEventListener('change', () => onChange(+n.value || 0)); return n; }
function renderPanel() {
  const p = $('#panel'); const top = p.scrollTop; p.innerHTML = '';
  if (tab === 'slide') panelSlide(p); else if (tab === 'item') panelItem(p); else panelPres(p);
  p.scrollTop = top;
}
function panelSlide(p) {
  const s = slide();
  if (!s) { p.appendChild(h('p', { class: 'note' }, 'Nog geen dia’s. Klik links op ＋ of laad het voorbeeld via Bestand.')); return; }
  const th = theme();
  const ch = (rebuild = true) => changed({ rebuild });
  const nm = h('input', { type: 'text', value: s.title, placeholder: autoTitle(s) });
  nm.addEventListener('input', () => { s.title = nm.value; changed({ rebuild: false }); });
  p.appendChild(sec('Dia ' + (cur + 1), row('Naam', nm)));
  // elementen
  const list = h('div', { class: 'items' });
  s.items.forEach((it, i) => {
    list.appendChild(h('div', { class: 'it' + (i === sel ? ' on' : ''), onclick: () => { sel = i; tab = 'item'; renderTabs(); renderPanel(); if (mode !== 'slide') setMode('slide'); else updateOverlay(); } },
      h('span', { class: 'ic' }, ITEM_ICON[it.type]), h('span', { class: 'nm', title: ITEM_TYPE[it.type] }, itemLabel(it)),
      h('button', { title: 'Eerder tekenen', onclick: e => { e.stopPropagation(); moveItem(i, -1); } }, '↑'),
      h('button', { title: 'Later tekenen', onclick: e => { e.stopPropagation(); moveItem(i, 1); } }, '↓'),
      h('button', { title: 'Verwijderen', onclick: e => { e.stopPropagation(); deleteItem(i); } }, '✕')));
  });
  if (!s.items.length) list.appendChild(h('p', { class: 'note' }, 'Nog leeg. Zonder tekening loopt de lijn met een zwierige streep door de dia.'));
  p.appendChild(sec('Elementen (in tekenvolgorde)', list, addButtons()));
  // kleuren
  p.appendChild(sec('Kleuren',
    row('Kaart', colorCtl(s.cardColor, th.card, v => { s.cardColor = v; ch(); })),
    row('Lijn', colorCtl(s.lineColor, th.line, v => { s.lineColor = v; ch(); })),
    row('Sfeer', colorCtl(s.tint, th.mid, v => { s.tint = v; ch(false); })),
    h('p', { class: 'note' }, 'Sfeer kleurt de lucht zodra je tijdens het presenteren bij deze dia aankomt.')));
  // plaats
  const P = (label, get, set, min, max, step) => row(label, slider(get(), min, max, step, v => { set(v); ch(); }));
  p.appendChild(sec('Plaats in de ruimte',
    P('Links / rechts', () => s.pos.x, v => s.pos.x = v, -300, 300, .5),
    P('Omlaag / omhoog', () => s.pos.y, v => s.pos.y = v, -200, 200, .5),
    P('Naar achter / voor', () => s.pos.z, v => s.pos.z = v, -300, 300, .5),
    P('Draaien', () => s.rot.y, v => s.rot.y = v, -180, 180, 1),
    P('Kantelen', () => s.rot.x, v => s.rot.x = v, -90, 90, 1),
    P('Scheef', () => s.rot.z, v => s.rot.z = v, -180, 180, 1),
    P('Grootte', () => s.scale, v => s.scale = v, .3, 4, .05),
    h('p', { class: 'note' }, 'Tip: in de wereldweergave verplaats je een dia met Shift + slepen. Of kies Indeling ▾ voor alle dia’s tegelijk.')));
  // camera
  p.appendChild(sec('Camera bij deze dia',
    P('Afstand', () => s.camZoom, v => s.camZoom = v, .4, 2.5, .05),
    P('Kijkhoek opzij', () => s.camYaw, v => s.camYaw = v, -60, 60, 1),
    P('Kijkhoek hoogte', () => s.camPitch, v => s.camPitch = v, -45, 45, 1),
    row('Beweging', chips(O.MOTIONS, s.motion, v => { s.motion = v; ch(false); })),
    h('button', { class: 'btn full', onclick: () => present(cur) }, '▶ Bekijk vanaf deze dia')));
  p.appendChild(sec('Lijn naar de volgende dia', chips(O.LINKS, s.link, v => { s.link = v; ch(); }),
    h('p', { class: 'note' }, cur === doc.slides.length - 1 ? 'Dit is de laatste dia: na afloop vliegt de lijn de ruimte in en zie je het hele kunstwerk.' : 'Zo reist de lijn door de ruimte naar dia ' + (cur + 2) + '.')));
  p.appendChild(sec('Dia', h('div', { class: 'grid2' },
    h('button', { class: 'btn', onclick: () => duplicateSlide(cur) }, '⧉ Dupliceren'),
    h('button', { class: 'btn danger', onclick: () => deleteSlide(cur) }, '✕ Verwijderen'))));
}
function addButtons() {
  return h('div', { class: 'addrow' },
    h('button', { onclick: openLibrary }, h('span', {}, '✎'), '2D-tekening'),
    h('button', { onclick: addOlt }, h('span', {}, 'ℓ'), 'Tekst als lijn'),
    h('button', { onclick: openShapes }, h('span', {}, '◍'), '3D'),
    h('button', { onclick: addText }, h('span', {}, 'T'), 'Tekst'),
    h('button', { onclick: () => $('#file-img').click() }, h('span', {}, '▣'), 'Afbeelding'),
    h('button', { onclick: openVideoChoice }, h('span', {}, '▶'), 'Video'),
    h('button', { onclick: () => $('#file-svg').click() }, h('span', {}, '⇪'), 'SVG-bestand'));
}
function moveItem(i, d) {
  const s = slide(), j = i + d; if (j < 0 || j >= s.items.length) return;
  [s.items[i], s.items[j]] = [s.items[j], s.items[i]];
  if (sel === i) sel = j; else if (sel === j) sel = i;
  changed({ panel: true }); updateOverlay();
}
function deleteItem(i) {
  const s = slide(); if (!s || !s.items[i]) return;
  s.items.splice(i, 1); sel = -1; if (tab === 'item') tab = 'slide';
  renderTabs(); changed({ panel: true, now: true }); setTimeout(updateOverlay, 0);
}
function duplicateItem() {
  const it = item(); if (!it) return;
  const c = JSON.parse(JSON.stringify(it)); c.id = O.newId(); c.x += 40; c.y += 40;
  slide().items.push(c); sel = slide().items.length - 1;
  changed({ panel: true, now: true }); setTimeout(updateOverlay, 0);
}
function panelItem(p) {
  const s = slide(), it = item();
  if (!s || !it) { p.appendChild(h('p', { class: 'note' }, 'Kies een element: klik erop in “Dia bewerken” of in de lijst bij het tabblad Dia.')); if (s) p.appendChild(sec('Toevoegen', addButtons())); return; }
  const th = theme();
  const ch = (rebuild = true) => { changed({ rebuild }); };
  p.appendChild(h('div', { class: 'sec' }, h('h4', {}, ITEM_ICON[it.type] + '  ' + ITEM_TYPE[it.type])));
  const deform = () => {
    const depthRow = row('Diepte', slider(it.depth, 0, 5, .1, v => { it.depth = v; ch(); }));
    depthRow.style.display = it.deform === 'plat' ? 'none' : '';
    return sec('3D-vervorming', chips(O.SHAPE_DEFORMS, it.deform, v => { it.deform = v; depthRow.style.display = v === 'plat' ? 'none' : ''; ch(); }), depthRow,
      h('p', { class: 'note' }, 'Buig de tekening de ruimte in. Draai er in de wereldweergave omheen om het effect te zien.'));
  };
  if (it.type === 'svg') {
    const nm = h('input', { type: 'text', value: it.name }); nm.addEventListener('input', () => { it.name = nm.value; changed({ rebuild: false }); });
    p.appendChild(sec('Tekening', row('Naam', nm), row('Lijnkleur', colorCtl(it.color, s.lineColor || th.line, v => { it.color = v; ch(); })),
      check('Tekenrichting omdraaien', it.reverse, v => { it.reverse = v; ch(); })));
    const info = O.readSvg(it.svg), vis = info.paths.map((pp, i) => ({ pp, i })).filter(o => o.pp.visible);
    if (vis.length > 1 && vis.length <= 24) {
      const wrap = h('div', {});
      vis.forEach(({ i }) => {
        const c = h('input', { type: 'color', value: toHex(it.pathColors[i] || it.color || s.lineColor || th.line) });
        c.addEventListener('input', () => { while (it.pathColors.length <= i) it.pathColors.push(''); it.pathColors[i] = c.value; ch(); });
        wrap.appendChild(h('span', { style: 'display:inline-flex;align-items:center;gap:4px;margin:0 8px 6px 0;font-size:12px;color:var(--muted)' }, 'pad ' + (i + 1), c));
      });
      wrap.appendChild(h('button', { class: 'chip', onclick: () => { it.pathColors = []; ch(); renderPanel(); } }, 'alle paden gelijk'));
      p.appendChild(sec('Kleur per pad', wrap));
    }
    p.appendChild(deform());
  } else if (it.type === 'olt') {
    const ta = h('textarea', { rows: 2 }); ta.value = it.text;
    const miss = h('p', { class: 'note' });
    const upd = () => { const m = O.oneLineMissing(ta.value); miss.innerHTML = m.length ? `<span style="color:var(--danger)">Niet in het font: ${esc(m.join(' '))}</span>` : ''; };
    ta.addEventListener('input', () => {
      upd();
      const src = O.composeOneLineText(ta.value, it.letterColors); if (!src) return;
      const old = vbOf(it.src || src), nv = vbOf(src);
      const scale = it.h / old[3];
      it.text = ta.value; it.src = src; it.h = Math.round(nv[3] * scale); it.w = Math.round(nv[2] * scale);
      changed({ rebuild: true }); updateOverlay(); scheduleThumbs();
    });
    upd();
    p.appendChild(sec('Tekst als lijn', ta, miss, row('Kleur', colorCtl(it.color, s.lineColor || th.line, v => { it.color = v; it.letterColors = []; it.src = O.composeOneLineText(it.text) || it.src; ch(); })),
      h('p', { class: 'note' }, 'Handgeschreven met het one-line-font van One Line Prezi: de pen schrijft de woorden in één beweging.')));
    p.appendChild(deform());
  } else if (it.type === 'shape') {
    const grid = h('div', { class: 'chips' });
    Object.entries(O.SHAPES).forEach(([k, sh]) => grid.appendChild(h('button', { class: 'chip' + (k === it.shape ? ' on' : ''), onclick: () => { it.shape = k; ch(); renderPanel(); } }, sh.name)));
    p.appendChild(sec('Vorm', grid,
      row('Detail', slider(it.detail, 1, 10, 1, v => { it.detail = v; ch(); })),
      row('Voorover', slider(it.tiltX, -90, 90, 1, v => { it.tiltX = v; ch(); })),
      row('Draaien', slider(it.tiltY, -180, 180, 1, v => { it.tiltY = v; ch(); })),
      row('Kleur', colorCtl(it.color, s.lineColor || th.line, v => { it.color = v; ch(); }))));
  } else if (it.type === 'text') {
    const ta = h('textarea', { rows: 3 }); ta.value = it.text;
    ta.addEventListener('input', () => { it.text = ta.value; changed(); updateOverlay(); });
    const fonts = {}; O.FONTS.forEach(f => fonts[f] = f);
    p.appendChild(sec('Tekst', ta,
      row('Lettertype', selectCtl(fonts, it.font, v => { it.font = v; document.fonts.load(`400 40px "${v}"`).finally(() => { ch(); updateOverlay(); }); })),
      row('Grootte', slider(it.size, 12, 400, 1, v => { it.size = v; ch(); updateOverlay(); })),
      row('Kleur', colorCtl(it.color, th.text, v => { it.color = v; ch(); })),
      row('Stijl', check('Vet', it.bold, v => { it.bold = v; ch(); updateOverlay(); }), check('Cursief', it.italic, v => { it.italic = v; ch(); updateOverlay(); })),
      row('Uitlijnen', chips({ left: 'Links', center: 'Midden', right: 'Rechts' }, it.align, v => { it.align = v; ch(); })),
      row('Max. breedte', slider(it.w, 200, 1920, 10, v => { it.w = v; ch(); updateOverlay(); })),
      h('p', { class: 'note' }, 'De tekst verschijnt zodra de lijn de tekening op deze dia af heeft.')));
  } else if (it.type === 'model') {
    const MM = window.OLP3D_MODELS, grid = h('div', { class: 'chips' });
    if (MM) Object.entries(MM.MODELS).forEach(([k, m]) => grid.appendChild(h('button', { class: 'chip' + (k === it.model ? ' on' : ''), onclick: () => { it.model = k; it.name = m.name; ch(); renderPanel(); } }, m.name)));
    p.appendChild(sec('3D-tekening', grid,
      row('Voorover', slider(it.tiltX, -90, 90, 1, v => { it.tiltX = v; ch(); })),
      row('Draaien', slider(it.tiltY, -180, 180, 1, v => { it.tiltY = v; ch(); })),
      it.model === 'boom' || it.model === 'boomkaal' || it.model === 'appel' || it.model === 'herstel' || it.model === 'zandloper' ? row('Detail', slider(it.detail, 1, 10, 1, v => { it.detail = v; ch(); })) : null,
      row('Kleur', colorCtl(it.color, s.lineColor || th.line, v => { it.color = v; ch(); })),
      h('p', { class: 'note' }, 'Een echte 3D-tekening uit één doorlopende lijn. Met “Rondje om tekening” (tabblad Dia) draait de camera er tijdens het presenteren omheen.')));
  } else if (it.type === 'video') {
    p.appendChild(sec(O.VIDEO_KINDS[it.kind] || 'Video', ...videoPanel(it, ch)));
  } else if (it.type === 'image') {
    p.appendChild(sec('Afbeelding', row('Zichtbaar', slider(it.opacity, .05, 1, .05, v => { it.opacity = v; ch(); })),
      h('p', { class: 'note' }, 'Tijdens het presenteren tekent de lijn eerst een kader; daarna verschijnt de afbeelding.'),
      h('button', { class: 'btn full', onclick: () => { replaceImage = true; $('#file-img').click(); } }, 'Andere afbeelding kiezen…')));
  }
  // positie
  const pos = h('div', { class: 'grid2' },
    row('X', numIn(it.x, v => { it.x = v; ch(); updateOverlay(); })), row('Y', numIn(it.y, v => { it.y = v; ch(); updateOverlay(); })));
  const size = it.type === 'text' ? null : h('div', { class: 'grid2' },
    row('Breed', numIn(it.w, v => { const f = v / it.w; it.w = Math.max(10, v); it.h = Math.max(10, Math.round(it.h * f)); ch(); updateOverlay(); })),
    row('Hoog', numIn(it.h, v => { const f = v / it.h; it.h = Math.max(10, v); it.w = Math.max(10, Math.round(it.w * f)); ch(); updateOverlay(); })));
  p.appendChild(sec('Plaats op de dia (px van 1920 × 1080)', pos, size, row('Draaiing', slider(it.rot || 0, -180, 180, 1, v => { it.rot = v; ch(); updateOverlay(); })),
    h('div', { class: 'grid2', style: 'margin-top:6px' },
      h('button', { class: 'btn', onclick: () => centerItem('x') }, '↔ Midden'),
      h('button', { class: 'btn', onclick: () => centerItem('y') }, '↕ Midden'))));
  p.appendChild(sec('Element', h('div', { class: 'grid2' },
    h('button', { class: 'btn', onclick: () => moveItem(sel, -1) }, '↑ Eerder tekenen'),
    h('button', { class: 'btn', onclick: () => moveItem(sel, 1) }, '↓ Later tekenen'),
    h('button', { class: 'btn', onclick: duplicateItem }, '⧉ Dupliceren'),
    h('button', { class: 'btn danger', onclick: () => deleteItem(sel) }, '✕ Verwijderen'))));
}
let replaceImage = false;
function centerItem(axis) {
  const it = item(); if (!it) return;
  const b = itemBox(it);
  if (axis === 'x') it.x = Math.round((FW - b.w) / 2); else it.y = Math.round((FH - b.h) / 2);
  changed({ panel: true }); updateOverlay();
}
function panelPres(p) {
  const st = doc.settings;
  const ch = (rebuild = true) => changed({ rebuild });
  const worlds = h('div', { class: 'worlds' });
  Object.entries(O.THEMES).forEach(([k, t]) => worlds.appendChild(h('button', { class: k === st.world ? 'on' : '', onclick: () => setWorld(k) }, h('i', { style: `background:linear-gradient(180deg,${t.top},${t.mid} 60%,${t.bot})` }), h('span', {}, t.name))));
  const tnm = h('input', { type: 'text', value: doc.title, placeholder: 'Titel (voor de export)' });
  tnm.addEventListener('input', () => { doc.title = tnm.value; changed({ rebuild: false }); updateDocName(); });
  p.appendChild(sec('Presentatie', row('Titel', tnm)));
  p.appendChild(sec('Wereld', worlds, ...worldCustom(st)));
  p.appendChild(sec('Lijn',
    row('Stijl', chips(Object.assign({ auto: 'Bij wereld' }, O.LINE_STYLES), st.lineStyle, v => { st.lineStyle = v; ch(); })),
    row('Dikte', slider(st.lineWidth, 1, 10, .5, v => { st.lineWidth = v; ch(); })),
    row('Neon-gloed', slider(st.glow, 0, 10, .5, v => { st.glow = v; ch(); })),
    h('p', { class: 'note' }, 'De gloed hoort bij de lijnstijl Neon (standaard in Nacht, Ruimte, Synthwave, Noorderlicht en Oceaan). 0 = geen gloed.'),
    h('button', { class: 'btn full', onclick: resetLineColors }, 'Alle lijnkleuren terug naar de wereldkleur')));
  p.appendChild(sec('Tempo',
    row('Tekenen', slider(st.drawSpeed, 1, 10, 1, v => { st.drawSpeed = v; ch(false); })),
    row('Vliegen', slider(st.travelSpeed, 1, 10, 1, v => { st.travelSpeed = v; ch(false); })),
    row('Automatisch', slider(st.autoplay, 0, 30, 1, v => { st.autoplay = v; ch(false); })),
    h('p', { class: 'note' }, 'Automatisch: na zoveel seconden vanzelf naar de volgende dia (0 = uit, je klikt zelf).')));
  p.appendChild(sec('Camera',
    row('Onderweg', chips({ volgen: 'Achter de pen aan', zweven: 'Zweefvlucht', direct: 'Rechtstreeks' }, st.travelCam, v => { st.travelCam = v; ch(false); })),
    row('Tekenen', chips({ rustig: 'Rustig', meekijken: 'Meekijken', inzoomen: 'Inzoomen' }, st.drawCam, v => { st.drawCam = v; ch(false); })),
    h('p', { class: 'note' }, 'Inzoomen: de camera begint dicht op de pen en zoomt uit terwijl de tekening ontstaat.')));
  p.appendChild(sec('Effecten',
    row('Dia-kader', chips(O.FRAMES, st.frame, v => { st.frame = v; st.cards = v !== 'geen'; thumbCache.clear(); changed({ list: true }); })),
    h('p', { class: 'note' }, 'Het kader verschijnt zacht als de camera bij een dia aankomt. “Onzichtbaar”: alleen de lijn en de tekst, zonder kaart.'),
    check('Spookspoor: de rest van de lijn vaag zichtbaar', st.ghost, v => { st.ghost = v; ch(false); }),
    check('Vonkjes bij de pen', st.sparkles, v => { st.sparkles = v; ch(false); }),
    check('Beweegt mee met de muis (parallax)', st.parallax, v => { st.parallax = v; ch(false); }),
    check('Openingsvlucht naar de eerste dia', st.intro, v => { st.intro = v; ch(false); }),
    check('Slot: de lijn vliegt weg, overzicht van alles', st.finale, v => { st.finale = v; ch(false); }),
    check('Geluid van de pen', st.sound, v => { st.sound = v; ch(false); })));
  p.appendChild(sec('Video', row('Sec. per dia', slider(st.hold, 0, 15, .5, v => { st.hold = v; ch(false); })),
    h('button', { class: 'btn full', onclick: recordVideo }, '● Opnemen als video')));
}
function setWorld(k) {
  doc.settings.world = k; doc.settings.custom = {};
  thumbCache.clear();
  changed({ list: true, panel: true, now: true });
  buildWorldMenu();
}
// Wereld naar eigen smaak: lucht, kleuren, sterren, stofjes, raster en mist.
function worldCustom(st) {
  const base = O.THEMES[st.world] || O.THEMES.papier, c = st.custom || (st.custom = {});
  const ch = () => { thumbCache.clear(); changed({ list: true }); };
  const col = (label, k) => row(label, colorCtl(c[k] || '', base[k], v => { c[k] = v; ch(); }));
  const tri = (label, k) => row(label, chips({ auto: 'Zoals wereld', aan: 'Aan', uit: 'Uit' }, c[k] || 'auto', v => { c[k] = v; ch(); }));
  const wrap = h('div', { style: 'display:none' },
    col('Lucht boven', 'top'), col('Horizon', 'mid'), col('Lucht onder', 'bot'),
    col('Kaart', 'card'), col('Lijn', 'line'), col('Tekst', 'text'),
    tri('Sterren', 'stars'), tri('Stofjes', 'dust'), tri('Rasterbodem', 'grid'),
    row('Mist', slider(c.fog || 1, .2, 3, .1, v => { c.fog = v; ch(); })),
    h('button', { class: 'btn full', onclick: () => { st.custom = {}; ch(); renderPanel(); } }, '↺ Terug naar de standaard van deze wereld'));
  const custom = Object.keys(c).some(k => (k === 'fog' ? c[k] && c[k] !== 1 : c[k] && c[k] !== 'auto'));
  if (custom) wrap.style.display = '';
  const toggle = h('button', { class: 'btn full', style: 'margin-top:8px', onclick: () => { wrap.style.display = wrap.style.display ? '' : 'none'; } }, '🎨 Wereld aanpassen…');
  return [toggle, wrap];
}

function resetLineColors() {
  doc.slides.forEach(s => { s.lineColor = ''; s.items.forEach(it => { if ('color' in it && it.type !== 'text') it.color = ''; if (it.pathColors) it.pathColors = []; if (it.type === 'olt') { it.letterColors = []; it.src = O.composeOneLineText(it.text) || it.src; } }); });
  changed({ list: true, panel: true, now: true }); toast('Alle lijnen gebruiken nu de kleur van de wereld');
}
function buildWorldMenu() {
  const m = $('#worldmenu'); m.innerHTML = '';
  m.appendChild(h('div', { class: 'lbl' }, 'Sfeer van de ruimte'));
  Object.entries(O.THEMES).forEach(([k, t]) => m.appendChild(h('button', { onclick: () => { closeMenus(); setWorld(k); } },
    h('span', { class: 'sw', style: `background:linear-gradient(180deg,${t.top},${t.mid},${t.bot})` }), t.name, k === doc.settings.world ? h('span', { class: 'k' }, '✓') : null)));
}

// ── indeling ────────────────────────────────────────────────────────────
function applyLayout(name, quiet) {
  const N = doc.slides.length, rnd = O.mulberry(1234 + N);
  const placed = [];
  doc.slides.forEach((s, i) => {
    let p = { x: 0, y: 0, z: 0 }, r = { x: 0, y: 0, z: 0 };
    switch (name) {
      case 'rij': p = { x: i * 24, y: 0, z: 0 }; break;
      case 'trap': { const a = i * 52; p = { x: Math.sin(a * DEG) * 26, y: i * 6.5, z: Math.cos(a * DEG) * 26 }; r = { x: 0, y: a, z: 0 }; break; }
      case 'carrousel': { const R = Math.max(18, N * 24 / (2 * Math.PI)), a = i / N * 360; p = { x: Math.sin(a * DEG) * R, y: 0, z: Math.cos(a * DEG) * R }; r = { x: 0, y: a + 180, z: 0 }; break; }
      case 'golf': p = { x: i * 19, y: Math.sin(i * .9) * 4, z: i % 2 ? -12 : 0 }; r = { x: 0, y: i % 2 ? 22 : -22, z: 0 }; break;
      case 'tunnel': p = { x: Math.sin(i * 1.3) * 7, y: Math.cos(i * 1.1) * 3.5, z: -i * 30 }; r = { x: 0, y: 0, z: i % 2 ? 7 : -7 }; break;
      case 'sterren': {
        const R = 16 + N * 4;
        let best = null;
        for (let t = 0; t < 300; t++) {
          const a = rnd() * Math.PI * 2, b = Math.acos(2 * rnd() - 1), rr = R * Math.cbrt(rnd());
          const c = { x: rr * Math.sin(b) * Math.cos(a), y: rr * Math.cos(b) * .55, z: rr * Math.sin(b) * Math.sin(a) };
          const md = placed.reduce((m, q) => Math.min(m, Math.hypot(q.x - c.x, q.y - c.y, q.z - c.z)), Infinity);
          if (md > 22) { best = c; break; }
          if (!best || md > best.md) best = Object.assign(c, { md });
        }
        p = { x: best.x, y: best.y, z: best.z }; placed.push(p);
        r = { x: (rnd() - .5) * 30, y: (rnd() - .5) * 80, z: (rnd() - .5) * 16 };
        break;
      }
    }
    s.pos = { x: r2(p.x), y: r2(p.y), z: r2(p.z) }; s.rot = { x: r2(r.x), y: r2(r.y), z: r2(r.z) };
  });
  if (!quiet) { rebuildNow(); changed({ panel: true, rebuild: false }); fitAll(true); toast('Indeling: ' + ({ rij: 'rij', trap: 'wenteltrap', carrousel: 'carrousel', golf: 'golf in de diepte', tunnel: 'tunnel', sterren: 'sterrenstelsel' })[name]); }
}
function applyLinks(kind, quiet) {
  const cyc = ['lus', 'spiraal', 'golf', 'vloeiend'], keys = Object.keys(O.LINKS), rnd = O.mulberry(Date.now() & 0xffff);
  doc.slides.forEach((s, i) => { s.link = kind === 'vloeiend' ? 'vloeiend' : kind === 'afwisselend' ? cyc[i % 4] : keys[Math.floor(rnd() * keys.length)]; });
  if (!quiet) { changed({ panel: true, now: true }); toast('Verbindingen aangepast'); }
}

// ── voorbeeld ───────────────────────────────────────────────────────────
function libEntry(prefix) { return (window.SVG_LIBRARY || []).find(e => e.file.toLowerCase().startsWith(prefix)); }
// ── showcase: een presentatie die laat zien wat je met de app kunt ──────
function demoDoc() {
  const lib = (f, extra) => { const e = libEntry(f); return e ? Object.assign({ type: 'svg', svg: e.svg, name: e.name, x: 0, y: 0, w: FW, h: FH }, extra || {}) : null; };
  const olt = (text, cy, hh, extra) => { const src = O.composeOneLineText(text); if (!src) return null; return Object.assign({ type: 'olt', text, src }, oltBox(src, FW / 2, cy, hh), extra || {}); };
  const txt = (text, cy, size, extra) => { const it = O.normalizeItem(Object.assign({ type: 'text', text, size, align: 'center', w: 1700, font: 'Cormorant Garamond' }, extra || {})); const m = O.measureTextItem(it); it.x = Math.round((FW - m.w) / 2); it.y = Math.round(cy - m.h / 2); return it; };
  const shape = (name, x, y, sz, extra) => Object.assign({ type: 'shape', shape: name, x, y, w: sz, h: sz, detail: 5 }, extra || {});
  const model = (name, x, y, sz, extra) => Object.assign({ type: 'model', model: name, x, y, w: sz, h: sz }, extra || {});
  const slides = [
    { title: 'One Line', lineColor: '#68e3d6', items: [olt('One Line', 430, 360), txt('een presentatie in drie dimensies', 830, 76, { italic: true })] },
    { title: 'Eén lijn', lineColor: '#ff9ad5', link: 'spiraal', items: [lib('wandelaar', { deform: 'relief', depth: .8 }), txt('Eén lijn die door de ruimte reist', 975, 64)] },
    { title: 'Kompas', lineColor: '#fff38c', tint: '#161245', motion: 'rondje', items: [model('kompas', 590, 100, 740), txt('Echte 3D-tekeningen — de camera draait mee', 985, 60)] },
    { title: 'Zandloper', lineColor: '#c9b0f7', motion: 'rondje', link: 'lus', items: [model('zandloper', 610, 80, 700), txt('Neem de tijd', 990, 64, { italic: true })] },
    { title: 'Wiskunde', lineColor: '#68e3d6', tint: '#0b2b3a', motion: 'rondje', items: [shape('bol', 230, 180, 650), shape('knoop', 1040, 180, 650), txt('Wiskunde in één doorlopende lijn', 975, 60)] },
    { title: 'Bouwen', lineColor: '#ff5eb8', motion: 'rondje', link: 'golf', items: [model('rubiks', 200, 160, 700), model('lego', 1020, 160, 700), txt('Bouwen, stapelen en draaien', 975, 62)] },
    { title: 'Tekst als lijn', lineColor: '#7ff3e1', items: [olt('Tekst als lijn', 470, 300, { deform: 'cilinder', depth: 1 }), txt('handgeschreven — en gebogen in de ruimte', 840, 64, { italic: true })] },
    { title: 'Mensen', lineColor: '#ffd166', tint: '#1d1650', items: [lib('gesprek.svg', { deform: 'relief', depth: .7 }), txt('Figuren met een subtiel reliëf', 975, 62)] },
    { title: 'Loslaten', lineColor: '#9cffb8', tint: '#0f2a2c', motion: 'rondje', link: 'lus', items: [model('boomkaal', 560, 60, 800), txt('Loslaten', 985, 70, { italic: true })] },
    { title: 'Balans', lineColor: '#fff38c', motion: 'rondje', items: [model('weegschaal', 590, 80, 740), txt('Alles in balans', 985, 64)] },
    { title: 'Jouw verhaal', lineColor: '#ff5eb8', items: [olt('Jouw verhaal', 470, 320), txt('Druk op O voor het hele kunstwerk', 840, 60, { italic: true })] }
  ].map(sl => Object.assign(sl, { items: sl.items.filter(Boolean) }));
  return O.normalizeDoc({ title: 'Showcase — 3D One Line Prezi', settings: { world: 'nacht', glow: 3.5, frame: 'kaart', travelCam: 'volgen', drawCam: 'meekijken', drawSpeed: 6 }, slides });
}
function loadDemo() {
  setDoc(demoDoc());
  applyLayout('trap', true);
  fileHandle = null; fileName = ''; dirty = false; cur = 0;
  rebuildNow(); renderAll(); snapshotNow(true); fitAll(false);
}

// ── 2D-import ───────────────────────────────────────────────────────────
function is2D(d) {
  if (!d || !Array.isArray(d.slides)) return false;
  if (d.app === 'One Line Prezi') return true;
  return d.slides.some(s => s && ('originalSVG' in s || 'mediaBlocks' in s || 'textBlocks' in s || 'svgPath' in s)) && !d.slides.some(s => s && Array.isArray(s.items));
}
function from2D(d) {
  let skipped = 0;
  const slides = d.slides.map((s, i) => {
    const items = [];
    if (s.originalSVG) {
      const cols = Array.isArray(s.pathColors) ? s.pathColors.map(pc => (pc && pc.color) || '') : [];
      const allSame = cols.every(c => !c || c.toLowerCase() === (s.lineColor || '#1a1a1a').toLowerCase());
      items.push({ type: 'svg', svg: s.originalSVG, name: s.title || 'Tekening', x: 0, y: 0, w: FW, h: FH, pathColors: allSame ? [] : cols, color: allSame && s.lineColor && s.lineColor !== '#1a1a1a' ? s.lineColor : '' });
    } else if (s.svgPath) {
      items.push({ type: 'svg', svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080"><path d="${esc(s.svgPath)}" fill="none" stroke="#000"/></svg>`, name: 'Tekening', x: 0, y: 0, w: FW, h: FH });
    }
    (Array.isArray(s.mediaBlocks) ? s.mediaBlocks : []).sort((a, b) => (a.zOrder || 0) - (b.zOrder || 0)).forEach(mb => {
      if (!mb) return;
      if (mb.type === 'svgtext') items.push({ type: 'olt', text: mb.text || '', letterColors: mb.letterColors || [], src: '', x: mb.x, y: mb.y, w: mb.width, h: mb.height, rot: mb.rotation || 0 });
      else if (mb.type === 'video' && mb.src) items.push({ type: 'video', kind: /^https?:/i.test(mb.src) ? 'link' : 'file', src: mb.src, x: mb.x, y: mb.y, w: mb.width, h: mb.height, rot: mb.rotation || 0, autoplay: mb.autoplay !== false, muted: mb.muted !== false, loop: mb.loop !== false, segments: mb.segments || [] });
      else if (mb.type === 'youtube' && mb.src) items.push({ type: 'video', kind: 'youtube', src: mb.src, x: mb.x, y: mb.y, w: mb.width, h: mb.height, rot: mb.rotation || 0, autoplay: mb.autoplay !== false, segments: (mb.segments && mb.segments.length) ? mb.segments : (mb.start ? [{ s: mb.start, e: null }] : []) });
      else if ((mb.type || 'image') === 'image' && mb.src) items.push({ type: 'image', src: mb.src, x: mb.x, y: mb.y, w: mb.width, h: mb.height, rot: mb.rotation || 0, opacity: mb.opacity ?? 1 });
      else skipped++;
    });
    (Array.isArray(s.textBlocks) ? s.textBlocks : []).forEach(tb => { if (tb && tb.text) items.push({ type: 'text', text: tb.text, x: tb.x, y: tb.y, w: 1800, font: tb.font, size: tb.size, bold: tb.bold, italic: tb.italic, align: tb.align || 'left', rot: tb.rotation || 0, color: tb.color }); });
    if (s.subtitle) { const it = O.normalizeItem({ type: 'text', text: s.subtitle, size: s.subSize || 80, font: s.subFont, bold: s.subBold, italic: s.subItalic, color: s.subColor, align: 'center', w: 1700 }); const m = O.measureTextItem(it); it.x = Math.round((FW - m.w) / 2); it.y = Math.round(FH * .84 - m.h / 2); items.push(it); }
    return { title: s.title || '', cardColor: s.bgColor && s.bgColor.toLowerCase() !== '#ffffff' ? s.bgColor : '', lineColor: s.lineColor && s.lineColor !== '#1a1a1a' ? s.lineColor : '', items };
  });
  // ingesloten video's uit de 2D-presentatie naar de media-opslag
  const media = {};
  slides.forEach(sl => sl.items.forEach(it => { if ((it.type === 'video' || it.type === 'image') && /^data:/.test(it.src || '')) { const id = 'm' + Math.random().toString(36).slice(2, 10); media[id] = it.src; it.src = 'media:' + id; } }));
  const out = O.normalizeDoc({ media, title: d.title || '', settings: { world: 'papier', drawSpeed: clamp(((d.settings && d.settings.drawSpeed) || 3) + 2, 1, 10) }, slides });
  return { doc: out, skipped: 0 };
}

// ── bestanden ───────────────────────────────────────────────────────────
function baseName() { return (fileName ? fileName.replace(/\.json$/i, '') : (doc.title || 'presentatie')).replace(/[\\/:*?"<>|]+/g, '-').trim() || 'presentatie'; }
async function saveBlob(blob, name, desc, accept) {
  try {
    if (window.showSaveFilePicker) {
      const hnd = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: desc, accept }] });
      const w = await hnd.createWritable(); await w.write(blob); await w.close();
      return hnd;
    }
  } catch (e) { if (e && e.name === 'AbortError') return null; console.warn(e); }
  const a = h('a', { href: URL.createObjectURL(blob), download: name }); document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'download';
}
function docJSON() { return JSON.stringify(Object.assign({}, doc, { app: '3D One Line Prezi', version: 2, media: usedMedia(doc) }), null, 1); }
async function save(saveAs) {
  const blob = new Blob([docJSON()], { type: 'application/json' });
  if (!saveAs && fileHandle && fileHandle.createWritable) {
    try { const w = await fileHandle.createWritable(); await w.write(blob); await w.close(); markSaved(); toast('Opgeslagen', 'ok'); return; }
    catch (e) { console.warn(e); }
  }
  const r = await saveBlob(blob, baseName() + '.json', '3D One Line Prezi-presentatie', { 'application/json': ['.json'] });
  if (!r) return;
  if (r !== 'download') { fileHandle = r; fileName = r.name; } else if (!fileName) fileName = baseName() + '.json';
  markSaved(); toast('Opgeslagen', 'ok');
}
function markSaved() { dirty = false; updateDocName(); scheduleAutosave(); }
async function confirmDiscard() {
  if (!dirty) return true;
  return confirmDlg('Niet-opgeslagen wijzigingen', 'Je huidige presentatie heeft wijzigingen die nog niet zijn opgeslagen. Toch doorgaan?', 'Doorgaan');
}
async function openFile() {
  if (!await confirmDiscard()) return;
  if (window.showOpenFilePicker) {
    try {
      const [hnd] = await window.showOpenFilePicker({ types: [{ description: 'Presentatie (.json)', accept: { 'application/json': ['.json'] } }] });
      const f = await hnd.getFile(); loadText(await f.text(), f.name, hnd);
    } catch (e) { if (e.name !== 'AbortError') toast('Openen mislukt', 'err'); }
  } else $('#file-json').click();
}
function loadText(text, name, handle) {
  let d;
  try { d = JSON.parse(text); } catch (e) { toast('Dit is geen geldig presentatiebestand', 'err'); return; }
  if (is2D(d)) {
    const r = from2D(d);
    setDoc(r.doc); applyLayout('golf', true); applyLinks('afwisselend', true);
    fileHandle = null; fileName = (name || 'presentatie').replace(/\.json$/i, '') + ' 3D.json'; dirty = true;
    rebuildNow(); renderAll(); fitAll(false); snapshotNow(true);
    toast('2D-presentatie omgezet naar 3D' + (r.skipped ? ` (${r.skipped} video’s overgeslagen)` : ''), 'ok', 4000);
    return;
  }
  if (!Array.isArray(d.slides)) { toast('Dit is geen presentatiebestand', 'err'); return; }
  setDoc(d); fileHandle = handle || null; fileName = name || ''; dirty = false;
  renderAll(); fitAll(false); snapshotNow(true);
  toast('Geopend: ' + (name || ''), 'ok');
}
async function newDoc() {
  if (!await confirmDiscard()) return;
  setDoc({ slides: [{ pos: { x: 0, y: 0, z: 0 }, items: [] }] });
  fileHandle = null; fileName = ''; dirty = false; renderAll(); snapshotNow(true); goToSlideView(false);
}
async function fetchText(u) { const r = await fetch(u); if (!r.ok) throw new Error(u); return r.text(); }
async function fontFaces() {
  const rules = [];
  for (const [fam, w, i] of O.fontsUsed(doc)) {
    const files = O.FONT_FILES[fam]; if (!files) continue;
    const file = files[w + (i ? 'i' : '')] || files[w] || files['400']; if (!file) continue;
    try {
      const buf = await (await fetch('assets/fonts/' + file + '.woff2')).arrayBuffer();
      let bin = ''; const b = new Uint8Array(buf); for (let k = 0; k < b.length; k += 32768) bin += String.fromCharCode.apply(null, b.subarray(k, k + 32768));
      rules.push(`@font-face{font-family:'${fam}';font-style:${i ? 'italic' : 'normal'};font-weight:${w};src:url(data:font/woff2;base64,${btoa(bin)}) format('woff2')}`);
    } catch (e) { console.warn('font', fam, e); }
  }
  return rules.join('\n');
}
async function exportHTML() {
  if (!doc.slides.length) { toast('Er is nog niets om te exporteren', 'err'); return; }
  busy('HTML-pagina maken…');
  try {
    const html = await buildExportHTML();
    busy(false);
    const r = await saveBlob(new Blob([html], { type: 'text/html' }), baseName() + '.html', 'Webpagina', { 'text/html': ['.html'] });
    if (r) toast('HTML-pagina opgeslagen — dubbelklik om te presenteren', 'ok', 4000);
  } catch (e) { console.error(e); toast('Exporteren mislukt: de app moet via de webserver draaien (npm start of online)', 'err', 5000); }
  finally { busy(false); }
}
// Eén los HTML-bestand: Three.js, de motor, de lettertypen en de presentatie zitten erin.
async function buildExportHTML() {
  {
    const [three, engine, fonts, models, icon] = await Promise.all([fetchText('assets/vendor/three.min.js'), fetchText('assets/js/engine.js'), fontFaces(), fetchText('assets/js/models3d.js'), fetchText('assets/favicon.svg').catch(() => '')]);
    const scriptSafe = s => s.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
    const BS = String.fromCharCode(92), SEP = new RegExp('[' + String.fromCharCode(0x2028, 0x2029) + ']', 'g');
    const json = JSON.stringify(Object.assign({}, doc, { media: usedMedia(doc) })).replace(/</g, BS + 'u003c').replace(SEP, c => BS + 'u' + c.charCodeAt(0).toString(16));
    const title = esc(doc.title || baseName());
    const html = `<!DOCTYPE html>\n<html lang="nl">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>${title}</title>\n` +
      (icon ? `<link rel="icon" href="data:image/svg+xml;charset=utf-8,${encodeURIComponent(icon)}">\n` : '') +
      `<!-- Gemaakt met 3D One Line Prezi. Three.js (MIT-licentie) is hieronder ingesloten. -->\n<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}\n${fonts}\n</style>\n</head>\n<body>\n` +
      `<script>${scriptSafe(three)}</script>\n<script>${scriptSafe(engine)}</script>\n<script>${scriptSafe(models)}</script>\n<script>OLP3D.startStandalone(${json});</script>\n</body>\n</html>\n`;
    return html;
  }
}
async function recordVideo() {
  if (!doc.slides.length) { toast('Er is nog niets om op te nemen', 'err'); return; }
  if (!window.MediaRecorder) { toast('Opnemen wordt in deze browser niet ondersteund', 'err'); return; }
  const ok = await confirmDlg('Opnemen als video', `De presentatie speelt zichzelf af in 1920 × 1080 en wordt opgenomen, met ${doc.settings.hold} seconden per dia nadat de tekening af is (aan te passen bij Presentatie → Video). Laat dit venster zichtbaar openstaan tijdens het opnemen. Aan het eind kies je waar de video komt. Esc stopt eerder.`, '● Start opname');
  if (!ok) return;
  await O.loadFonts(doc);
  presenting = new O.Player(doc, {
    record: true,
    onRecorded: async (blob, ext) => { const r = await saveBlob(blob, baseName() + '.' + ext, 'Video', ext === 'mp4' ? { 'video/mp4': ['.mp4'] } : { 'video/webm': ['.webm'] }); if (r) toast('Video opgeslagen', 'ok'); },
    onExit: () => { presenting = null; resize(); requestRender(); }
  });
  presenting.mount(document.body);
}
function present(from) {
  if (!doc.slides.length) { toast('Voeg eerst een dia toe', 'err'); return; }
  closeMenus();
  presenting = new O.Player(doc, { startAt: from || 0, onExit: () => { presenting = null; resize(); requestRender(); $('#view').focus(); } });
  presenting.mount(document.body);
  presenting.toggleFullscreen();
}

// ── geschiedenis & automatisch bewaren ──────────────────────────────────
const hist = { stack: [], idx: -1 };
let histT = null;
function scheduleHistory() { clearTimeout(histT); histT = setTimeout(() => snapshotNow(), 380); }
function snapshotNow(reset) {
  clearTimeout(histT);
  const s = JSON.stringify(doc, noMedia);
  if (reset) { hist.stack = [s]; hist.idx = 0; updateUndo(); return; }
  if (hist.stack[hist.idx] === s) return;
  hist.stack = hist.stack.slice(0, hist.idx + 1); hist.stack.push(s);
  if (hist.stack.length > 60) hist.stack.shift();
  hist.idx = hist.stack.length - 1; updateUndo();
}
function updateUndo() { $('#undo').disabled = hist.idx <= 0; $('#redo').disabled = hist.idx >= hist.stack.length - 1; }
function restoreHist(i) {
  const media = doc.media; hist.idx = i; doc = O.normalizeDoc(JSON.parse(hist.stack[i])); doc.media = media;
  cur = clamp(cur, 0, Math.max(0, doc.slides.length - 1)); sel = -1;
  if (tab === 'item') tab = 'slide';
  dirty = true; rebuildNow(); renderAll(); scheduleAutosave();
}
function undo() { snapshotNow(); if (hist.idx > 0) restoreHist(hist.idx - 1); }
function redo() { if (hist.idx < hist.stack.length - 1) restoreHist(hist.idx + 1); }
const DB = {
  open() { return new Promise((res, rej) => { const r = indexedDB.open('olp3d', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  async get(k) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('kv').objectStore('kv').get(k); t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error); }); },
  async set(k, v) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); }
};
let autoT = null;
function scheduleAutosave() { clearTimeout(autoT); autoT = setTimeout(autosave, 1200); }
function autosave() { DB.set('autosave', { json: JSON.stringify(doc, noMedia), fileName, dirty, time: Date.now(), cur, media: 2 }).catch(() => {}); }
// Opstarten: altijd met de showcase. Je vorige werk staat klaar om verder te gaan.
async function restoreOrDemo() {
  let saved = null;
  try { saved = await DB.get('autosave'); } catch (e) {}
  loadDemo();
  let hasPrev = false;
  try { const d = saved && saved.json && JSON.parse(saved.json); hasPrev = !!(d && Array.isArray(d.slides) && d.slides.length); } catch (e) {}
  if (hasPrev) {
    await DB.set('previous', saved).catch(() => {});
    actionToast('Welkom! Je vorige presentatie staat klaar.', 'Ga verder met mijn werk', restorePrevious, 14000);
  } else toast('Welkom! Druk op ▶ Presenteren en zie wat je ermee kunt', 'ok', 5000);
}
async function restorePrevious() {
  let saved = null;
  try { saved = await DB.get('previous'); } catch (e) {}
  if (!saved || !saved.json) { toast('Er is geen vorige presentatie bewaard', 'err'); return; }
  try {
    const d = JSON.parse(saved.json);
    if (!d.media) { d.media = {}; for (const sl of d.slides) for (const it of (sl.items || [])) if (typeof it.src === 'string' && it.src.startsWith('media:')) { const v = await DB.get('m:' + it.src.slice(6)).catch(() => null); if (v) d.media[it.src.slice(6)] = v; } }
    cur = saved.cur || 0; setDoc(d, true); fileName = saved.fileName || ''; fileHandle = null; dirty = !!saved.dirty;
    renderAll(); fitAll(false); snapshotNow(true); scheduleAutosave();
    toast('Je vorige presentatie is teruggezet', 'ok');
  } catch (e) { toast('Terugzetten mislukt', 'err'); }
}

// ── menu's & toetsen ────────────────────────────────────────────────────
function closeMenus() { $$('.menu.open').forEach(m => m.classList.remove('open')); }
function bindTop() {
  $$('.menu > .tbtn').forEach(b => b.addEventListener('click', e => { const m = b.parentElement, was = m.classList.contains('open'); closeMenus(); if (!was) m.classList.add('open'); e.stopPropagation(); }));
  $$('.menu').forEach(m => m.addEventListener('mouseenter', () => { if ($('.menu.open') && !m.classList.contains('open')) { closeMenus(); m.classList.add('open'); } }));
  document.addEventListener('click', e => { if (!e.target.closest('.menu')) closeMenus(); });
  const acts = {
    new: newDoc, open: openFile, save: () => save(false), saveas: () => save(true), import2d: openFile, export: exportHTML, record: recordVideo,
    demo: async () => { if (await confirmDiscard()) { loadDemo(); toast('Showcase geladen', 'ok'); } },
    previous: restorePrevious,
    video: () => $('#file-video').click(), videolink: addVideoLink, youtube: addYouTube,
    slide: () => addSlide(), library: openLibrary, svgfile: () => $('#file-svg').click(), olt: addOlt, shape: openShapes, text: addText, image: () => $('#file-img').click()
  };
  $$('[data-act]').forEach(b => b.addEventListener('click', () => { closeMenus(); acts[b.dataset.act](); }));
  $$('[data-layout]').forEach(b => b.addEventListener('click', () => { closeMenus(); if (doc.slides.length) applyLayout(b.dataset.layout); }));
  $$('[data-links]').forEach(b => b.addEventListener('click', () => { closeMenus(); applyLinks(b.dataset.links); }));
  $('#undo').addEventListener('click', undo); $('#redo').addEventListener('click', redo);
  $('#play').addEventListener('click', () => present(0)); $('#playhere').addEventListener('click', () => present(cur));
  $('#helpbtn').addEventListener('click', showHelp);
  $('#addslide2').addEventListener('click', () => addSlide());
  $('#fitall').addEventListener('click', () => { if (mode !== 'world') { mode = 'world'; updateHint(); $('#overlay').innerHTML = ''; } fitAll(true); });
  $('#tocur').addEventListener('click', () => goToSlideView(true));
  $$('.seg button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  $$('.tabs button').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; renderTabs(); renderPanel(); }));
  $('#file-json').addEventListener('change', async e => { const f = e.target.files[0]; e.target.value = ''; if (f) loadText(await readFileAs(f, 'text'), f.name, null); });
  $('#file-video').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    if (replaceVideo && item() && item().type === 'video') { replaceVideo = false; const it = item(); const data = await readVideo(f); if (!data) return; it.kind = 'file'; it.src = addMedia(data); it.name = f.name.replace(/\.[^.]+$/, ''); changed({ panel: true }); return; }
    replaceVideo = false; addVideoFile(f);
  });
  $('#file-svg').addEventListener('change', async e => { const fs = [...e.target.files]; e.target.value = ''; for (const f of fs) addSvgText(await readFileAs(f, 'text'), f.name); });
  $('#file-img').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    if (replaceImage && item() && item().type === 'image') {
      replaceImage = false;
      const r = await compressImage(await readFileAs(f, 'url'), 2400, 2400); if (!r) return;
      const it = item(); it.src = addMedia(r.src); it.h = Math.round(it.w * r.h / r.w); changed({ panel: true }); updateOverlay(); return;
    }
    replaceImage = false; addImageFile(f);
  });
  window.addEventListener('beforeunload', e => { if (dirty && !window.__olpNoWarn) { autosave(); e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('paste', async e => {
    if (isTyping(e.target) || presenting) return;
    const files = [...(e.clipboardData && e.clipboardData.files || [])];
    if (files.length) { e.preventDefault(); handleFiles(files); return; }
    const t = e.clipboardData && e.clipboardData.getData('text/plain');
    if (t && /^\s*(<\?xml[\s\S]*?\?>\s*)?<svg[\s>]/i.test(t)) { e.preventDefault(); addSvgText(t, 'Geplakte tekening'); return; }
    if (clip) { e.preventDefault(); const c = JSON.parse(JSON.stringify(clip)); c.id = O.newId(); c.x += 30; c.y += 30; pushItem(c); }
  });
}
function bindKeys() {
  document.addEventListener('keydown', e => {
    if (presenting || $('#modal').classList.contains('open')) return;
    const k = e.key, ctrl = e.ctrlKey || e.metaKey;
    if (k === 'F5') { e.preventDefault(); present(e.shiftKey ? cur : 0); return; }
    if (ctrl && (k === 's' || k === 'S')) { e.preventDefault(); save(e.shiftKey); return; }
    if (ctrl && (k === 'o' || k === 'O')) { e.preventDefault(); openFile(); return; }
    if (k === 'F1') { e.preventDefault(); showHelp(); return; }
    if (isTyping(e.target)) return;
    if (ctrl && (k === 'z' || k === 'Z')) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (ctrl && (k === 'y' || k === 'Y')) { e.preventDefault(); redo(); return; }
    if (ctrl && (k === 'd' || k === 'D')) { e.preventDefault(); item() ? duplicateItem() : slide() && duplicateSlide(cur); return; }
    if (ctrl && (k === 'c' || k === 'C' || k === 'x' || k === 'X')) { if (item()) { e.preventDefault(); clip = JSON.parse(JSON.stringify(item())); if (k === 'x' || k === 'X') deleteItem(sel); toast(k === 'x' || k === 'X' ? 'Geknipt' : 'Gekopieerd'); } return; }
    if (k === 'k' || k === 'K') { return; }
    if (k === 'Delete' || k === 'Backspace') { if (item()) { e.preventDefault(); deleteItem(sel); } return; }
    if (k === 'Escape') { if (sel >= 0) { sel = -1; tab = 'slide'; renderTabs(); renderPanel(); updateOverlay(); } else if (mode === 'slide') setMode('world'); closeMenus(); return; }
    if (k === 'Tab' && !ctrl) { e.preventDefault(); setMode(mode === 'world' ? 'slide' : 'world'); return; }
    if (mode === 'slide' && item() && k.startsWith('Arrow')) {
      e.preventDefault(); const it = item(), d = e.shiftKey ? 10 : 1;
      if (k === 'ArrowLeft') it.x -= d; if (k === 'ArrowRight') it.x += d; if (k === 'ArrowUp') it.y -= d; if (k === 'ArrowDown') it.y += d;
      updateOverlay(); changed({ rebuild: true }); return;
    }
    if (k === 'PageDown' || k === 'ArrowDown' || k === 'ArrowRight') { e.preventDefault(); selectSlide(Math.min(doc.slides.length - 1, cur + 1), true); return; }
    if (k === 'PageUp' || k === 'ArrowUp' || k === 'ArrowLeft') { e.preventDefault(); selectSlide(Math.max(0, cur - 1), true); return; }
    if (k === 'Home') { selectSlide(0, true); return; }
    if (k === 'End') { selectSlide(doc.slides.length - 1, true); return; }
  });
}
function showHelp() {
  closeMenus();
  dialog({ title: 'Hulp — 3D One Line Prezi', wide: true, body: `<div class="help">
    <p class="note" style="grid-column:1/-1;font-size:13.5px;color:var(--ink)">Eén doorlopende lijn reist door de ruimte van tekening naar tekening; de camera vliegt mee. Zet je dia's in de ruimte (Indeling ▾), voeg tekeningen, tekst als lijn of 3D-vormen toe en druk op <kbd>F5</kbd>.</p>
    <h5>PRESENTEREN</h5>
    <div><kbd>F5</kbd> vanaf het begin</div><div><kbd>Shift</kbd><kbd>F5</kbd> vanaf deze dia</div>
    <div><kbd>→</kbd><kbd>spatie</kbd> klik — volgende</div><div><kbd>←</kbd> vorige (lijn tekent opnieuw)</div>
    <div><kbd>O</kbd> overzicht van de hele lijn</div><div><kbd>slepen</kbd> om de tekening heen kijken</div>
    <div><kbd>3</kbd><kbd>Enter</kbd> naar dia 3</div><div><kbd>A</kbd> 3D-bril (rood/cyaan)</div>
    <div><kbd>M</kbd> geluid aan/uit</div><div><kbd>B</kbd>/<kbd>W</kbd> zwart / wit scherm</div>
    <div><kbd>F</kbd> volledig scherm</div><div><kbd>Esc</kbd> stoppen</div>
    <h5>BEWERKEN</h5>
    <div><kbd>Tab</kbd> wereld ⇄ dia bewerken</div><div><kbd>dubbelklik</kbd> dia bewerken</div>
    <div><kbd>Shift</kbd>+slepen dia verplaatsen (wereld)</div><div><kbd>pijltjes</kbd> element schuiven (<kbd>Shift</kbd> = 10 px)</div>
    <div><kbd>Ctrl</kbd><kbd>Z</kbd> / <kbd>Ctrl</kbd><kbd>Y</kbd> ongedaan / opnieuw</div><div><kbd>Ctrl</kbd><kbd>D</kbd> dupliceren</div>
    <div><kbd>Ctrl</kbd><kbd>C</kbd>/<kbd>V</kbd> element kopiëren / plakken</div><div><kbd>Delete</kbd> element verwijderen</div>
    <div><kbd>Ctrl</kbd><kbd>S</kbd> opslaan</div><div><kbd>Ctrl</kbd><kbd>O</kbd> openen (ook 2D-presentaties)</div>
    <h5>BESTANDEN</h5>
    <div style="grid-column:1/-1">Sleep een <b>.svg</b>, afbeelding of <b>.json</b> op het venster. Een presentatie uit de 2D One Line Prezi wordt automatisch omgezet. Exporteer als HTML om te delen: die pagina werkt los, zonder app. Of neem de presentatie op als video.</div>
  </div>`, buttons: [{ label: 'Sluiten', value: true, pink: true }] });
}

// ── start ───────────────────────────────────────────────────────────────
function init() {
  initWorld(); bindTop(); bindStage(); bindSlides(); bindKeys();
  O.loadOneLineFont();
  buildWorldMenu(); updateHint();
  document.fonts && document.fonts.ready.then(() => { if (doc.slides.length) { rebuildNow(); thumbCache.clear(); renderSlides(); } });
  restoreOrDemo();
  // haakjes voor testen vanuit de console
  window.__olp = { get doc() { return doc; }, get player() { return presenting; }, world: () => world, present, loadDemo, applyLayout, setMode, selectSlide, loadText, buildExportHTML };
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
