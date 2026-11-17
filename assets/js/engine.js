/* ═══════════════════════════════════════════════════════════════════════
   3D One Line Prezi — gedeelde 3D-motor
   Wordt gebruikt door de editor, de presentatie én de HTML-export.
   Eén doorlopende lijn reist als 3D-buis door de ruimte van tekening naar
   tekening; de camera vliegt mee.
   ═══════════════════════════════════════════════════════════════════════ */
(function (G) {
'use strict';
const THREE = G.THREE;

// ── Maten ───────────────────────────────────────────────────────────────
// Een dia ("station") is net als in de 2D-app 1920 × 1080 px. In de wereld
// is dat 16 × 9 eenheden.
const FW = 1920, FH = 1080, U = 1 / 120;
const FW3 = FW * U, FH3 = FH * U;
const FOV = 50;
const PEN_UP = 0.12;            // onzichtbare verbinding: zoveel sneller
const RADIAL = 6;               // hoekpunten rond de buis

// ── Hulpjes ─────────────────────────────────────────────────────────────
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
const easeIO = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeSine = t => -(Math.cos(Math.PI * t) - 1) / 2;
// Vliegen: vertrekt en komt aan op het tekentempo en gaat onderweg iets vlotter.
const travelEase = u => { const a = .7, p = (u + a * (1 - Math.cos(Math.PI * u)) / Math.PI) / (1 + 2 * a / Math.PI); return p * .85 + (u * u * (3 - 2 * u)) * .15; };
const DEG = Math.PI / 180;
function hashStr(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36) + ':' + s.length; }
const SAFE_COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\)|[a-z]{3,20})$/i;
function safeColor(c, d) { return (typeof c === 'string' && SAFE_COLOR_RE.test(c.trim())) ? c.trim() : d; }
const numOr = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : (typeof v === 'string' && v.trim() !== '' && isFinite(+v) ? +v : d);
const strOr = (v, d) => typeof v === 'string' ? v : d;
function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function sanitizeSvgText(txt) {
  txt = String(txt || '');
  if (!/<script|\son[a-z]+\s*=|javascript:|<foreignObject|<iframe|<object|<embed/i.test(txt)) return txt;
  return txt.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<(foreignObject|iframe|object|embed)[\s\S]*?<\/\1>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '').replace(/javascript:/gi, '');
}

// ── Werelden (thema's) ──────────────────────────────────────────────────
const THEMES = {
  papier:   { name: 'Papier',        top: '#fbf8f2', mid: '#f3ede2', bot: '#e4dac8', card: '#fffdf9', line: '#1a1a1a', text: '#1a1a1a', dust: '#a8987c', dustOp: .45, style: 'inkt',  shadow: true,  fog: 1.0 },
  nacht:    { name: 'Nacht',         top: '#03040f', mid: '#0d1233', bot: '#1d1650', card: '#121838', line: '#68e3d6', text: '#f3f0ff', dust: '#ffffff', dustOp: .9,  style: 'neon',  stars: true,   fog: 1.4, edge: '#3a4380' },
  y2k:      { name: 'Y2K pastel',    top: '#c9b0f7', mid: '#ffd6ef', bot: '#fff1c9', card: '#fff7fd', line: '#2a1458', text: '#2a1458', dust: '#ff5eb8', dustOp: .8,  style: 'klei',  sparkle: true, grid: '#ff8fd0', shadow: true, fog: 1.1 },
  mist:     { name: 'Mist',          top: '#eef2f4', mid: '#dbe3e8', bot: '#c2ced6', card: '#f7fafb', line: '#2f3e48', text: '#22303a', dust: '#8a9ba7', dustOp: .5,  style: 'inkt',  shadow: true,  fog: .55 },
  blauwdruk:{ name: 'Blauwdruk',     top: '#0b2950', mid: '#123a6b', bot: '#0e3260', card: '#15457a', line: '#ffffff', text: '#eaf3ff', dust: '#9cc3ff', dustOp: .6,  style: 'inkt',  grid: '#4b80bf', fog: 1.2, edge: '#5d8fd0' },
  zonsondergang: { name: 'Zonsondergang', top: '#3b2a6b', mid: '#ff9e7a', bot: '#ffd29a', card: '#fff4ea', line: '#3a1d4f', text: '#3a1d4f', dust: '#fff0c0', dustOp: .7, style: 'klei', shadow: true, fog: 1.0 },
  ruimte:   { name: 'Ruimte (zonder sterren)', top: '#03040f', mid: '#0d1233', bot: '#1d1650', card: '#121838', line: '#68e3d6', text: '#f3f0ff', dust: '#9fb0ff', dustOp: .45, style: 'neon', fog: 1.4, edge: '#3a4380' },
  synthwave:{ name: 'Synthwave',     top: '#12022a', mid: '#4a1460', bot: '#ff4f9a', card: '#24093a', line: '#ffd166', text: '#ffe9f5', dust: '#ff9de2', dustOp: .7, style: 'neon', stars: true, grid: '#ff4f9a', fog: 1.2, edge: '#a33b9a' },
  aurora:   { name: 'Noorderlicht',  top: '#021208', mid: '#0b3b3a', bot: '#1a0f33', card: '#0f2a2c', line: '#9cffb8', text: '#eafff1', dust: '#c6ffdc', dustOp: .7, style: 'neon', stars: true, fog: 1.3, edge: '#2f6b58' },
  oceaan:   { name: 'Oceaan',        top: '#0a2a43', mid: '#0f4c6b', bot: '#06283d', card: '#0f3d57', line: '#7ff3e1', text: '#e6fbff', dust: '#a8f0ff', dustOp: .6, style: 'neon', fog: 1.0, edge: '#2f7a9c' },
  bos:      { name: 'Bos',           top: '#e3efd4', mid: '#bcd6a4', bot: '#7fa36b', card: '#f6faef', line: '#203a1c', text: '#1d3319', dust: '#5f7f4a', dustOp: .5, style: 'inkt', fog: .9 },
  woestijn: { name: 'Woestijn',      top: '#f8dfb2', mid: '#f0b77b', bot: '#c98a52', card: '#fff6e8', line: '#4a2a14', text: '#3d2210', dust: '#fff3d6', dustOp: .6, style: 'klei', fog: 1.0 },
  krijtbord:{ name: 'Krijtbord',     top: '#1c3529', mid: '#24463a', bot: '#182e24', card: '#2b5244', line: '#f4f1e8', text: '#f4f1e8', dust: '#e8efe6', dustOp: .3, style: 'inkt', fog: 1.1, edge: '#4f7b69' },
  snoep:    { name: 'Suikerspin',    top: '#a8e6ff', mid: '#ffc6e9', bot: '#fff4b8', card: '#ffffff', line: '#d6337f', text: '#7a1f55', dust: '#ffffff', dustOp: .9, style: 'klei', sparkle: true, fog: 1.1 },
  zwartwit: { name: 'Zwart-wit',     top: '#ffffff', mid: '#f1f1f1', bot: '#d9d9d9', card: '#ffffff', line: '#000000', text: '#000000', dust: '#999999', dustOp: .4, style: 'inkt', grid: '#cfcfcf', fog: 1.0 }
};
// Thema met de eigen aanpassingen uit de instellingen (lucht, sterren, raster, mist…)
const CUSTOM_COLORS = ['top', 'mid', 'bot', 'card', 'line', 'text'];
function themeOf(st) {
  const b = THEMES[st && st.world] || THEMES.papier, c = (st && st.custom) || {}, t = Object.assign({}, b);
  CUSTOM_COLORS.forEach(k => { if (c[k]) t[k] = c[k]; });
  if (c.stars === 'aan') t.stars = true; else if (c.stars === 'uit') t.stars = false;
  if (c.dust === 'uit') t.dustOp = 0; else if (c.dust === 'aan') t.dustOp = Math.max(.5, b.dustOp || 0);
  if (c.grid === 'aan') t.grid = b.grid || t.line; else if (c.grid === 'uit') t.grid = null;
  if (c.fog) t.fog = (b.fog || 1) * c.fog;
  return t;
}
const LINE_STYLES = { inkt: 'Inkt (plat)', neon: 'Neon (gloed)', klei: 'Klei (3D)' };
const FONTS = ['Cormorant Garamond', 'Playfair Display', 'Lora', 'Merriweather', 'Source Serif 4', 'Outfit', 'DM Sans', 'Raleway', 'Silkscreen', 'VT323'];
const FONT_FILES = {
  'Cormorant Garamond': { '400': 'cormorant-garamond-400', '700': 'cormorant-garamond-700', '400i': 'cormorant-garamond-400-italic', '700i': 'cormorant-garamond-700-italic' },
  'Playfair Display': { '400': 'playfair-display-400', '700': 'playfair-display-700', '400i': 'playfair-display-400-italic', '700i': 'playfair-display-700-italic' },
  'Lora': { '400': 'lora-400', '700': 'lora-700', '400i': 'lora-400-italic', '700i': 'lora-700-italic' },
  'Merriweather': { '400': 'merriweather-400', '700': 'merriweather-700', '400i': 'merriweather-400-italic', '700i': 'merriweather-700-italic' },
  'Source Serif 4': { '400': 'source-serif-4-400', '700': 'source-serif-4-700', '400i': 'source-serif-4-400-italic', '700i': 'source-serif-4-700-italic' },
  'Outfit': { '400': 'outfit-400', '700': 'outfit-700' },
  'DM Sans': { '400': 'dm-sans-400', '700': 'dm-sans-700', '400i': 'dm-sans-400-italic', '700i': 'dm-sans-700-italic' },
  'Raleway': { '400': 'raleway-400', '700': 'raleway-700', '400i': 'raleway-400-italic', '700i': 'raleway-700-italic' },
  'Silkscreen': { '400': 'silkscreen-400', '700': 'silkscreen-700' },
  'VT323': { '400': 'vt323-400' }
};
const SHAPE_DEFORMS = { plat: 'Plat', relief: 'Reliëf (bolt op)', bol: 'Bol', golf: 'Golf', cilinder: 'Gebogen (cilinder)', draai: 'Gedraaid', lagen: 'Lagen (per pad)' };
const VIDEO_KINDS = { file: 'Video (bestand)', link: 'Video via link', youtube: 'YouTube' };
const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const MEDIA_RE = /^media:[\w-]{1,64}$/;
const LINKS = { vloeiend: 'Vloeiend', lus: 'Looping', spiraal: 'Kurkentrekker', golf: 'Golf', recht: 'Recht' };
const MOTIONS = { zweven: 'Zweven', rondje: 'Rondje om tekening', stil: 'Stil' };

// ── Document ────────────────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  world: 'papier', lineStyle: 'auto', lineWidth: 3, drawSpeed: 5, travelSpeed: 5,
  travelCam: 'volgen', drawCam: 'meekijken', cards: true, ghost: true, sparkles: true,
  parallax: true, intro: true, finale: true, sound: false, autoplay: 0, hold: 3,
  frame: 'kaart', glow: 5, custom: {}
};
const FRAMES = { kaart: 'Kaart', rand: 'Alleen een rand', geen: 'Onzichtbaar' };
let idSeq = 0;
function newId() { return 'i' + Date.now().toString(36) + (idSeq++).toString(36); }
function normalizeItem(it) {
  if (!it || typeof it !== 'object') return null;
  const type = ['svg', 'olt', 'shape', 'model', 'text', 'image', 'video'].includes(it.type) ? it.type : null;
  if (!type) return null;
  const b = { id: strOr(it.id, '') || newId(), type, x: numOr(it.x, 0), y: numOr(it.y, 0), w: Math.max(4, numOr(it.w, 400)), h: Math.max(4, numOr(it.h, 300)), rot: numOr(it.rot, 0) };
  if (type === 'svg' || type === 'olt') {
    b.color = it.color ? safeColor(it.color, '') : '';
    b.deform = SHAPE_DEFORMS[it.deform] ? it.deform : 'plat';
    b.depth = numOr(it.depth, 1.5);
  }
  if (type === 'svg') {
    b.svg = sanitizeSvgText(strOr(it.svg, ''));
    b.name = strOr(it.name, '');
    b.pathColors = Array.isArray(it.pathColors) ? it.pathColors.map(c => c ? safeColor(c, '') : '') : [];
    b.reverse = !!it.reverse;
  } else if (type === 'olt') {
    b.text = strOr(it.text, '');
    b.letterColors = Array.isArray(it.letterColors) ? it.letterColors.map(c => c ? safeColor(c, '') : '') : [];
    b.src = sanitizeSvgText(strOr(it.src, ''));
  } else if (type === 'shape') {
    b.shape = SHAPES[it.shape] ? it.shape : 'bol';
    b.color = it.color ? safeColor(it.color, '') : '';
    b.detail = clamp(Math.round(numOr(it.detail, 5)), 1, 10);
    b.tiltX = numOr(it.tiltX, 18); b.tiltY = numOr(it.tiltY, -24);
  } else if (type === 'model') {
    const M = G.OLP3D_MODELS && G.OLP3D_MODELS.MODELS;
    b.model = strOr(it.model, 'kompas'); if (M && !M[b.model]) return null; // vervallen model
    const tl = (M && M[b.model] && M[b.model].tilt) || [12, -26];
    b.name = strOr(it.name, '');
    b.color = it.color ? safeColor(it.color, '') : '';
    b.detail = clamp(Math.round(numOr(it.detail, 5)), 1, 10);
    b.tiltX = numOr(it.tiltX, tl[0]); b.tiltY = numOr(it.tiltY, tl[1]);
  } else if (type === 'video') {
    b.kind = VIDEO_KINDS[it.kind] ? it.kind : 'file';
    let src = strOr(it.src, '');
    if (b.kind === 'youtube') src = YT_ID_RE.test(src) ? src : '';
    else if (!(MEDIA_RE.test(src) || /^(data:video\/|https?:\/\/)/i.test(src))) src = '';
    b.src = src;
    b.name = strOr(it.name, '');
    b.autoplay = !!it.autoplay; b.muted = !!it.muted; b.loop = !!it.loop;
    // stukjes die getoond worden (zoals in de 2D-app): [{s, e}], e = null = tot het eind
    b.segments = cleanSegments(it.segments);
    if (!b.segments.length && (numOr(it.start, 0) > 0 || numOr(it.end, 0) > 0)) b.segments = cleanSegments([{ s: Math.max(0, numOr(it.start, 0)), e: numOr(it.end, 0) || null }]);
  } else if (type === 'text') {
    b.w = Math.max(40, numOr(it.w, 1600));
    b.text = strOr(it.text, 'Tekst');
    b.font = FONTS.includes(it.font) ? it.font : 'Cormorant Garamond';
    b.size = clamp(numOr(it.size, 80), 8, 600);
    b.color = it.color ? safeColor(it.color, '') : '';
    b.bold = !!it.bold; b.italic = !!it.italic;
    b.align = ['left', 'center', 'right'].includes(it.align) ? it.align : 'center';
  } else if (type === 'image') {
    const src = strOr(it.src, '');
    b.src = (MEDIA_RE.test(src) || /^(data:image\/|https?:\/\/)/i.test(src)) ? src : '';
    b.opacity = clamp(numOr(it.opacity, 1), 0, 1);
  }
  return b;
}
function normalizeSlide(s, i) {
  s = s || {};
  const p = s.pos || {}, r = s.rot || {};
  return {
    title: strOr(s.title, ''),
    pos: { x: numOr(p.x, i * 22), y: numOr(p.y, 0), z: numOr(p.z, 0) },
    rot: { x: numOr(r.x, 0), y: numOr(r.y, 0), z: numOr(r.z, 0) },
    scale: clamp(numOr(s.scale, 1), .1, 20),
    cardColor: s.cardColor ? safeColor(s.cardColor, '') : '',
    lineColor: s.lineColor ? safeColor(s.lineColor, '') : '',
    tint: s.tint ? safeColor(s.tint, '') : '',
    camZoom: clamp(numOr(s.camZoom, 1), .2, 5),
    camYaw: clamp(numOr(s.camYaw, 0), -89, 89),
    camPitch: clamp(numOr(s.camPitch, 0), -80, 80),
    motion: MOTIONS[s.motion] ? s.motion : 'zweven',
    link: LINKS[s.link] ? s.link : 'vloeiend',
    notes: strOr(s.notes, ''),
    items: (Array.isArray(s.items) ? s.items : []).map(normalizeItem).filter(Boolean)
  };
}
function normalizeDoc(d) {
  d = d || {};
  const st = Object.assign({}, DEFAULT_SETTINGS, d.settings || {});
  st.world = THEMES[st.world] ? st.world : 'papier';
  st.lineStyle = (st.lineStyle === 'auto' || LINE_STYLES[st.lineStyle]) ? st.lineStyle : 'auto';
  ['lineWidth', 'drawSpeed', 'travelSpeed'].forEach(k => { st[k] = clamp(numOr(st[k], DEFAULT_SETTINGS[k]), 1, 10); });
  st.travelCam = ['volgen', 'zweven', 'direct'].includes(st.travelCam) ? st.travelCam : 'volgen';
  st.drawCam = ['rustig', 'meekijken', 'inzoomen'].includes(st.drawCam) ? st.drawCam : 'rustig';
  ['cards', 'ghost', 'sparkles', 'parallax', 'intro', 'finale', 'sound'].forEach(k => { st[k] = !!st[k]; });
  st.autoplay = clamp(numOr(st.autoplay, 0), 0, 120);
  if (!FRAMES[st.frame]) st.frame = 'kaart';
  if (d.settings && d.settings.cards === false && !d.settings.frame) st.frame = 'geen';
  st.cards = st.frame !== 'geen';
  st.glow = clamp(numOr(st.glow, 5), 0, 10);
  const cu = (st.custom && typeof st.custom === 'object') ? st.custom : {}, cc = {};
  CUSTOM_COLORS.forEach(k => { if (cu[k]) { const v = safeColor(cu[k], ''); if (v) cc[k] = v; } });
  ['stars', 'dust', 'grid'].forEach(k => { cc[k] = ['aan', 'uit'].includes(cu[k]) ? cu[k] : 'auto'; });
  cc.fog = clamp(numOr(cu.fog, 1), .2, 3);
  st.custom = cc;
  st.hold = clamp(numOr(st.hold, 3), 0, 60);
  const slides = (Array.isArray(d.slides) ? d.slides : []).map(normalizeSlide);
  // media (afbeeldingen, video's) apart bewaard; elementen verwijzen ernaar met "media:<id>"
  const media = {};
  if (d.media && typeof d.media === 'object') for (const [k, v] of Object.entries(d.media)) { if (/^[\w-]{1,64}$/.test(k) && typeof v === 'string' && /^data:(image|video)\//i.test(v)) media[k] = v; }
  return { app: '3D One Line Prezi', version: 2, title: strOr(d.title, ''), settings: st, slides, media };
}
function cleanSegments(list) {
  if (!Array.isArray(list)) return [];
  const out = list.filter(x => x && isFinite(x.s) && x.s >= 0 && (x.e == null || (isFinite(x.e) && x.e > x.s + .2)))
    .map(x => ({ s: Math.round(x.s * 10) / 10, e: x.e == null ? null : Math.round(x.e * 10) / 10 })).sort((p, q) => p.s - q.s);
  const merged = [];
  for (const x of out) {
    const last = merged[merged.length - 1];
    if (last && (last.e == null || x.s <= last.e)) { if (last.e != null) last.e = x.e == null ? null : Math.max(last.e, x.e); }
    else merged.push({ ...x });
  }
  return merged.slice(0, 50);
}
const segStart = it => (it.segments && it.segments[0] ? it.segments[0].s : 0);
let ytApiP = null;
function ytApi() {
  if (G.YT && G.YT.Player) return Promise.resolve();
  if (ytApiP) return ytApiP;
  ytApiP = new Promise((res, rej) => {
    const prev = G.onYouTubeIframeAPIReady;
    G.onYouTubeIframeAPIReady = () => { if (prev) try { prev(); } catch (e) {} res(); };
    const sc = document.createElement('script'); sc.src = 'https://www.youtube.com/iframe_api';
    sc.onerror = () => { ytApiP = null; rej(new Error('YouTube')); };
    document.head.appendChild(sc);
    setTimeout(() => { if (!(G.YT && G.YT.Player)) { ytApiP = null; rej(new Error('YouTube')); } }, 15000);
  });
  return ytApiP;
}
function resolveSrc(doc, src) {
  if (src && MEDIA_RE.test(src)) return (doc && doc.media && doc.media[src.slice(6)]) || '';
  return src || '';
}

// ── SVG lezen ───────────────────────────────────────────────────────────
// Affiene matrix [a,b,c,d,e,f] zoals in SVG.
const I2 = [1, 0, 0, 1, 0, 0];
function mMul(m, n) { return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]]; }
function parseTransform(str) {
  let m = I2.slice();
  if (!str) return m;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g; let r;
  while ((r = re.exec(str))) {
    const a = (r[2].match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || []).map(Number);
    let t = I2;
    if (r[1] === 'matrix' && a.length >= 6) t = a.slice(0, 6);
    else if (r[1] === 'translate') t = [1, 0, 0, 1, a[0] || 0, a[1] || 0];
    else if (r[1] === 'scale') t = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0];
    else if (r[1] === 'rotate') {
      const an = (a[0] || 0) * DEG, c = Math.cos(an), s = Math.sin(an);
      t = [c, s, -s, c, 0, 0];
      if (a.length >= 3) t = mMul(mMul([1, 0, 0, 1, a[1], a[2]], t), [1, 0, 0, 1, -a[1], -a[2]]);
    } else if (r[1] === 'skewX') t = [1, 0, Math.tan((a[0] || 0) * DEG), 1, 0, 0];
    else if (r[1] === 'skewY') t = [1, Math.tan((a[0] || 0) * DEG), 0, 1, 0, 0];
    m = mMul(m, t);
  }
  return m;
}
// Pad-data → lijst van subpaden met dichte punten.
function parsePathD(d) {
  const tokens = String(d || '').match(/[A-Za-z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || [];
  const subs = []; let cur = null;
  let i = 0, cx = 0, cy = 0, sx = 0, sy = 0, pcx = 0, pcy = 0, pqx = 0, pqy = 0, cmd = '', prev = '';
  const isCmd = t => /^[A-Za-z]$/.test(t);
  const num = () => { const v = parseFloat(tokens[i++]); return v; };
  const flag = () => { const t = tokens[i]; if (t && t.length > 1 && /^[01]/.test(t)) { tokens[i] = t.slice(1); return +t[0]; } i++; return +t; };
  const start = (x, y) => { cur = [{ x, y }]; subs.push(cur); };
  const add = (x, y) => { if (!cur) start(cx, cy); cur.push({ x, y }); };
  const cubic = (x0, y0, x1, y1, x2, y2, x3, y3) => {
    const len = Math.hypot(x1 - x0, y1 - y0) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2);
    const n = clamp(Math.ceil(len / 1.5), 3, 400);
    for (let j = 1; j <= n; j++) {
      const t = j / n, mt = 1 - t;
      add(mt * mt * mt * x0 + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3,
          mt * mt * mt * y0 + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3);
    }
  };
  const arc = (x0, y0, rx, ry, phi, fa, fs, x, y) => {
    if (rx === 0 || ry === 0) { add(x, y); return; }
    rx = Math.abs(rx); ry = Math.abs(ry);
    const cp = Math.cos(phi * DEG), sp = Math.sin(phi * DEG);
    const dx = (x0 - x) / 2, dy = (y0 - y) / 2;
    const x1 = cp * dx + sp * dy, y1 = -sp * dx + cp * dy;
    let lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
    if (lam > 1) { lam = Math.sqrt(lam); rx *= lam; ry *= lam; }
    let num2 = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
    let co = Math.sqrt(Math.max(0, num2 / (rx * rx * y1 * y1 + ry * ry * x1 * x1)));
    if (fa === fs) co = -co;
    const cxp = co * rx * y1 / ry, cyp = -co * ry * x1 / rx;
    const ccx = cp * cxp - sp * cyp + (x0 + x) / 2, ccy = sp * cxp + cp * cyp + (y0 + y) / 2;
    const ang = (ux, uy, vx, vy) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
    const t1 = ang(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
    let dt = ang((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
    if (!fs && dt > 0) dt -= 2 * Math.PI; else if (fs && dt < 0) dt += 2 * Math.PI;
    const n = clamp(Math.ceil(Math.abs(dt) * Math.max(rx, ry) / 1.5), 4, 400);
    for (let j = 1; j <= n; j++) {
      const t = t1 + dt * j / n, ex = rx * Math.cos(t), ey = ry * Math.sin(t);
      add(cp * ex - sp * ey + ccx, sp * ex + cp * ey + ccy);
    }
  };
  while (i < tokens.length) {
    if (isCmd(tokens[i])) cmd = tokens[i++];
    else if (!cmd) { i++; continue; }
    const rel = cmd === cmd.toLowerCase() && cmd !== 'z' ? true : false;
    const C = cmd.toUpperCase();
    const ox = rel ? cx : 0, oy = rel ? cy : 0;
    if (C !== 'Z' && i >= tokens.length) break;
    if (C === 'M') {
      const x = num() + ox, y = num() + oy; if (!isFinite(x) || !isFinite(y)) break;
      cx = sx = x; cy = sy = y; start(x, y); cmd = rel ? 'l' : 'L'; pcx = pqx = cx; pcy = pqy = cy;
    } else if (C === 'L') {
      const x = num() + ox, y = num() + oy; if (!isFinite(x) || !isFinite(y)) break;
      add(x, y); cx = x; cy = y; pcx = pqx = cx; pcy = pqy = cy;
    } else if (C === 'H') {
      const x = num() + ox; if (!isFinite(x)) break; add(x, cy); cx = x; pcx = pqx = cx; pcy = pqy = cy;
    } else if (C === 'V') {
      const y = num() + oy; if (!isFinite(y)) break; add(cx, y); cy = y; pcx = pqx = cx; pcy = pqy = cy;
    } else if (C === 'C') {
      const x1 = num() + ox, y1 = num() + oy, x2 = num() + ox, y2 = num() + oy, x = num() + ox, y = num() + oy;
      if (!isFinite(y)) break;
      cubic(cx, cy, x1, y1, x2, y2, x, y); pcx = x2; pcy = y2; cx = x; cy = y; pqx = cx; pqy = cy;
    } else if (C === 'S') {
      const x2 = num() + ox, y2 = num() + oy, x = num() + ox, y = num() + oy;
      if (!isFinite(y)) break;
      const x1 = (prev === 'C' || prev === 'S') ? 2 * cx - pcx : cx, y1 = (prev === 'C' || prev === 'S') ? 2 * cy - pcy : cy;
      cubic(cx, cy, x1, y1, x2, y2, x, y); pcx = x2; pcy = y2; cx = x; cy = y; pqx = cx; pqy = cy;
    } else if (C === 'Q' || C === 'T') {
      let qx, qy;
      if (C === 'Q') { qx = num() + ox; qy = num() + oy; }
      else { qx = (prev === 'Q' || prev === 'T') ? 2 * cx - pqx : cx; qy = (prev === 'Q' || prev === 'T') ? 2 * cy - pqy : cy; }
      const x = num() + ox, y = num() + oy; if (!isFinite(y)) break;
      cubic(cx, cy, cx + 2 / 3 * (qx - cx), cy + 2 / 3 * (qy - cy), x + 2 / 3 * (qx - x), y + 2 / 3 * (qy - y), x, y);
      pqx = qx; pqy = qy; cx = x; cy = y; pcx = cx; pcy = cy;
    } else if (C === 'A') {
      const rx = num(), ry = num(), ph = num(), fa = flag(), fs = flag(), x = num() + ox, y = num() + oy;
      if (!isFinite(y)) break;
      arc(cx, cy, rx, ry, ph, fa, fs, x, y); cx = x; cy = y; pcx = pqx = cx; pcy = pqy = cy;
    } else if (C === 'Z') {
      if (cur && (cx !== sx || cy !== sy)) add(sx, sy);
      cx = sx; cy = sy; cmd = ''; cur = null; pcx = pqx = cx; pcy = pqy = cy;
    } else { i++; }
    prev = C;
  }
  return subs.filter(s => s.length > 1);
}
function shapeToD(el) {
  const g = n => parseFloat(el.getAttribute(n)) || 0;
  switch (el.tagName.toLowerCase()) {
    case 'path': return el.getAttribute('d') || '';
    case 'line': return `M${g('x1')} ${g('y1')}L${g('x2')} ${g('y2')}`;
    case 'polyline': case 'polygon': {
      const c = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
      if (c.length < 4) return '';
      let d = `M${c[0]} ${c[1]}`; for (let k = 2; k + 1 < c.length; k += 2) d += `L${c[k]} ${c[k + 1]}`;
      return el.tagName.toLowerCase() === 'polygon' ? d + 'Z' : d;
    }
    case 'circle': { const cx = g('cx'), cy = g('cy'), r = g('r'); if (!r) return ''; return `M${cx - r} ${cy}A${r} ${r} 0 1 1 ${cx + r} ${cy}A${r} ${r} 0 1 1 ${cx - r} ${cy}`; }
    case 'ellipse': { const cx = g('cx'), cy = g('cy'), rx = g('rx'), ry = g('ry'); if (!rx || !ry) return ''; return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 1 ${cx + rx} ${cy}A${rx} ${ry} 0 1 1 ${cx - rx} ${cy}`; }
    case 'rect': { const x = g('x'), y = g('y'), w = g('width'), h = g('height'); if (!w || !h) return ''; return `M${x} ${y}H${x + w}V${y + h}H${x}Z`; }
  }
  return '';
}
// Kleur en zichtbaarheid van een lijn: attribuut, inline style of de klasse
// uit een <style>-blok (zoals Illustrator dat maakt).
function strokeResolver(doc) {
  const cls = {};
  const css = [...doc.querySelectorAll('style')].map(s => s.textContent).join('\n');
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const sm = m[2].match(/(?:^|[;\s])stroke\s*:\s*([^;]+)/);
    if (!sm) continue;
    for (const sel of m[1].split(',')) { const c = sel.trim().match(/^\.([\w-]+)$/); if (c) cls[c[1]] = sm[1].trim(); }
  }
  return el => {
    for (let e = el; e && e.getAttribute; e = e.parentNode) {
      const a = e.getAttribute('stroke'); if (a) return a.trim();
      const st = (e.getAttribute('style') || '').match(/(?:^|[;\s])stroke\s*:\s*([^;]+)/); if (st) return st[1].trim();
      const c = (e.getAttribute('class') || '').split(/\s+/).find(k => cls[k]); if (c) return cls[c];
      if (e.tagName && e.tagName.toLowerCase() === 'svg') break;
    }
    return '';
  };
}
const svgCache = new Map();
// Leest een SVG en geeft de paden als puntlijsten terug, in viewBox-coördinaten.
function readSvg(svgText) {
  const key = hashStr(svgText);
  if (svgCache.has(key)) return svgCache.get(key);
  const out = { vb: [0, 0, FW, FH], paths: [] };
  try {
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    const svg = doc.querySelector('svg');
    if (svg) {
      const raw = svg.getAttribute('viewBox');
      const vb = raw ? raw.trim().split(/[\s,]+/).map(Number) : null;
      if (vb && vb.length === 4 && vb[2] > 0 && vb[3] > 0) out.vb = vb;
      else { const w = parseFloat(svg.getAttribute('width')), h = parseFloat(svg.getAttribute('height')); if (w > 0 && h > 0) out.vb = [0, 0, w, h]; }
      const strokeOf = strokeResolver(doc);
      svg.querySelectorAll('path,line,polyline,polygon,circle,ellipse,rect').forEach(el => {
        if (el.closest('defs,clipPath,mask,symbol,pattern')) return;
        const d = shapeToD(el); if (!d) return;
        let m = I2;
        const chain = [];
        for (let e = el; e && e !== svg && e.getAttribute; e = e.parentNode) chain.unshift(e);
        chain.forEach(e => { const t = e.getAttribute('transform'); if (t) m = mMul(m, parseTransform(t)); });
        const subs = parsePathD(d).map(sp => sp.map(p => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] })));
        if (!subs.length) return;
        const stroke = strokeOf(el);
        const invisible = el.getAttribute('data-invisible') === 'true' || stroke === 'none';
        out.paths.push({ subs, stroke: invisible ? '' : stroke, visible: !invisible });
      });
      if (out.paths.length && !out.paths.some(p => p.visible)) out.paths.forEach(p => { p.visible = true; });
    }
  } catch (e) { console.warn('SVG lezen mislukt', e); }
  if (svgCache.size > 300) svgCache.clear();
  svgCache.set(key, out);
  return out;
}
// Herbemonsteren op vaste afstand (gelijkmatig tekentempo).
function resample(pts, spacing) {
  if (pts.length < 2) return pts.slice();
  const cum = [0];
  for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
  const L = cum[cum.length - 1];
  if (L < 1e-6) return [pts[0], pts[pts.length - 1]];
  const n = clamp(Math.round(L / spacing), 2, 20000);
  const out = []; let j = 1;
  for (let k = 0; k <= n; k++) {
    const target = L * k / n;
    while (j < cum.length - 1 && cum[j] < target) j++;
    const seg = cum[j] - cum[j - 1] || 1, t = clamp((target - cum[j - 1]) / seg, 0, 1);
    out.push({ x: lerp(pts[j - 1].x, pts[j].x, t), y: lerp(pts[j - 1].y, pts[j].y, t) });
  }
  return out;
}

// ── One-line-font (handschrift uit één lijn) ────────────────────────────
const oneLineFont = {};
const ONE_LINE_PUNCTUATION = { punt: '.', komma: ',', uitroepteken: '!', vraagteken: '?', streepje: '-', dubbelepunt: ':', puntkomma: ';', apostrof: "'", aanhalingsteken: '"', 'haakje-openen': '(', 'haakje-sluiten': ')', 'en-teken': '&', 'schuine-streep': '/', plus: '+', is: '=' };
// typografische tekens (bijv. uit Word) → het teken uit het font; met tekencodes,
// zodat dit bestand ook zonder UTF-8 goed gelezen wordt
const ONE_LINE_ALIASES = {}; [[0x2018, "'"], [0x2019, "'"], [0x201A, "'"], [0x2032, "'"], [0x201C, '"'], [0x201D, '"'], [0x201E, '"'], [0x2013, '-'], [0x2014, '-'], [0x2212, '-'], [0xD7, 'x']].forEach(([c, t]) => { ONE_LINE_ALIASES[String.fromCharCode(c)] = t; });
const COMBINING_RE = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');
let fontLoaded = false;
function loadOneLineFont() {
  if (fontLoaded) return true;
  const entries = G.ONE_LINE_FONT_DATA;
  if (!entries) return false;
  const metaRe = /(kleine|hoofdletter|cijfer|leesteken)\s+(\S+)\s+\(lo=([^;]+);\s*ro=([^;]+);\s*s=([^;]+);\s*f=([^)]+)\)/;
  const spaceRe = /spatie\s+\(lo=([^;]+);\s*ro=([^;]+);\s*s=([^;]+);\s*f=([^)]+)\)/;
  for (const ent of entries) {
    let letter, m = ent.file.match(metaRe), isSpace = false;
    if (m) { letter = m[1] === 'leesteken' ? ONE_LINE_PUNCTUATION[m[2]] : m[2]; m = m.slice(1); if (!letter) continue; }
    else { m = ent.file.match(spaceRe); if (m) { letter = ' '; isSpace = true; m = [null, ...m]; } else continue; }
    const xy = s => { const [x, y] = s.split(',').map(Number); return { x, y }; };
    const ro = xy(m[3]), s = xy(m[4]), f = xy(m[5]);
    const doc = new DOMParser().parseFromString(ent.svg, 'image/svg+xml');
    const all = doc.querySelectorAll('path'); if (!all.length) continue;
    const vb = (doc.querySelector('svg')?.getAttribute('viewBox') || '0 0 200 200').split(/\s+/).map(Number);
    const isDot = letter === 'i' || letter === 'j';
    const strokeOf = strokeResolver(doc);
    const paths = [];
    all.forEach((p, pi) => {
      const st = strokeOf(p);
      const visible = isSpace ? false : (isDot ? pi % 2 === 0 : (st !== '' && st !== 'none'));
      paths.push({ d: p.getAttribute('d'), visible });
    });
    if (isDot && paths.length >= 5) paths.reverse();
    oneLineFont[letter] = { paths, isSpace, width: ro.x, svgHeight: vb[3], startX: s.x, startY: 200 - s.y, finishX: f.x, finishY: 200 - f.y };
  }
  fontLoaded = Object.keys(oneLineFont).length > 0;
  return fontLoaded;
}
function oneLineGlyph(ch) {
  if (ONE_LINE_ALIASES[ch]) ch = ONE_LINE_ALIASES[ch];
  if (oneLineFont[ch]) return oneLineFont[ch];
  const lo = ch.toLowerCase(); if (oneLineFont[lo]) return oneLineFont[lo];
  const base = ch.normalize('NFD').replace(COMBINING_RE, '');
  if (base !== ch) return oneLineFont[base] || oneLineFont[base.toLowerCase()] || null;
  return null;
}
function oneLineMissing(text) { loadOneLineFont(); return [...new Set([...text].filter(ch => ch !== ' ' && ch !== '\n' && !oneLineGlyph(ch)))]; }
function translateD(d, dx) {
  // Verschuif alle absolute x-coördinaten (het font gebruikt absolute M/C/L).
  return parsePathD(d).map(sp => 'M' + sp.map(p => (p.x + dx).toFixed(2) + ',' + p.y.toFixed(2)).join('L')).join('');
}
// Zet tekst om naar een SVG met één doorlopende lijn per regel.
function composeOneLineText(text, letterColors) {
  loadOneLineFont();
  const SPACE_W = 60, LINE_H = 230, DIGIT_GAP = 22;
  const lines = String(text || '').split('\n');
  const paths = []; let totalW = 0, letterIdx = 0, maxH = 200;
  lines.forEach((line, li) => {
    const oy = li * LINE_H;
    let cursorX = 0, first = true, prevDigit = false, prevFinishY = 0;
    const lineStart = paths.length;
    for (const ch of line) {
      if (ch === ' ' && !oneLineFont[' ']) { cursorX += SPACE_W; prevDigit = false; letterIdx++; continue; }
      const g = oneLineGlyph(ch);
      if (!g) { letterIdx++; continue; }
      const isDigit = /^[0-9]$/.test(ch);
      let dx;
      if (first) { dx = -g.startX; first = false; }
      else {
        if (isDigit && prevDigit) { const x2 = cursorX + DIGIT_GAP; paths.push({ d: `M${cursorX},${prevFinishY + oy}L${x2},${g.startY + oy}`, visible: false, idx: letterIdx }); cursorX = x2; }
        dx = cursorX - g.startX;
      }
      const color = (letterColors && letterColors[letterIdx]) || 'currentColor';
      g.paths.forEach(p => {
        let d = translateD(p.d, dx);
        if (oy) d = parsePathD(d).map(sp => 'M' + sp.map(q => q.x.toFixed(2) + ',' + (q.y + oy).toFixed(2)).join('L')).join('');
        paths.push({ d, visible: p.visible && !g.isSpace, color, idx: letterIdx });
      });
      cursorX = dx + g.finishX; totalW = Math.max(totalW, dx + g.width, cursorX);
      prevDigit = isDigit; prevFinishY = g.finishY; letterIdx++;
    }
    // onzichtbare verbindingen aan begin en eind van de regel weglaten
    while (paths.length > lineStart && paths[lineStart].visible === false) paths.splice(lineStart, 1);
    while (paths.length > lineStart && paths[paths.length - 1].visible === false) paths.pop();
    letterIdx++; // de regelovergang telt als teken
    maxH = Math.max(maxH, oy + 200);
  });
  if (!paths.length) return null;
  const pad = 20;
  const els = paths.map(p => p.visible
    ? `<path d="${p.d}" data-idx="${p.idx}" fill="none" stroke="${p.color}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<path d="${p.d}" data-idx="${p.idx}" data-invisible="true" fill="none" stroke="none"/>`).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${Math.ceil(totalW) + pad * 2} ${maxH + pad * 2}">\n${els}\n</svg>`;
}

// ── 3D one-line-vormen ──────────────────────────────────────────────────
// Elke vorm is wiskundig één doorlopende lijn. Resultaat: [[x,y,z],…] in ±1.
function hilbert3(bits) {
  const N = 1 << (bits * 3), out = [];
  for (let h = 0; h < N; h++) {
    const X = [0, 0, 0];
    for (let b = bits - 1; b >= 0; b--) for (let i = 0; i < 3; i++) X[i] |= ((h >> (b * 3 + (2 - i))) & 1) << b;
    // Skilling: transpose → assen
    const M = 2 << (bits - 1);
    let t = X[2] >> 1;
    for (let i = 2; i > 0; i--) X[i] ^= X[i - 1];
    X[0] ^= t;
    for (let Q = 2; Q !== M; Q <<= 1) {
      const P = Q - 1;
      for (let i = 2; i >= 0; i--) { if (X[i] & Q) X[0] ^= P; else { t = (X[0] ^ X[i]) & P; X[0] ^= t; X[i] ^= t; } }
    }
    const s = (1 << bits) - 1;
    out.push([X[0] / s * 2 - 1, X[1] / s * 2 - 1, X[2] / s * 2 - 1]);
  }
  return out;
}
function chaikin(pts, it) {
  for (let r = 0; r < it; r++) {
    const o = [pts[0]];
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1];
      o.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25, a[2] * .75 + b[2] * .25]);
      o.push([a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75, a[2] * .25 + b[2] * .75]);
    }
    o.push(pts[pts.length - 1]); pts = o;
  }
  return pts;
}
const SHAPES = {
  bol: { name: 'Bol', icon: '◍', gen(d) {
    const turns = 8 + d * 2, N = 2400, o = [];
    for (let k = 0; k <= N; k++) { const t = k / N, ph = t * Math.PI, lo = turns * 2 * Math.PI * t; o.push([Math.sin(ph) * Math.cos(lo), Math.cos(ph), Math.sin(ph) * Math.sin(lo)]); }
    return o; } },
  hart: { name: 'Hart', icon: '♡', gen(d) {
    const copies = 2 + Math.round(d / 2.5), o = [];
    for (let c = 0; c < copies; c++) {
      const a = c * Math.PI / copies, ca = Math.cos(a), sa = Math.sin(a);
      for (let k = 0; k <= 400; k++) {
        const t = (c % 2 ? -1 : 1) * k / 400 * 2 * Math.PI;
        const x = 16 * Math.pow(Math.sin(t), 3), y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        o.push([x * ca / 17, (y + 2.5) / 17, x * sa / 17]);
      }
    }
    return o; } },
  knoop: { name: 'Knoop', icon: '∞', gen(d) {
    const qs = [3, 5, 7, 4, 5], ps = [2, 2, 2, 3, 3];
    const q = qs[(d - 1) % 5], p = ps[(d - 1) % 5], N = 2600, o = [];
    for (let k = 0; k <= N; k++) { const f = k / N * 2 * Math.PI, r = 2 + Math.cos(q * f); o.push([r * Math.cos(p * f) / 3, -Math.sin(q * f) / 3 * 1.4, r * Math.sin(p * f) / 3]); }
    return o; } },
  veer: { name: 'Veer', icon: '〰', gen(d) {
    const turns = 3 + d, N = 1800, o = [];
    for (let k = 0; k <= N; k++) { const t = k / N, a = turns * 2 * Math.PI * t; o.push([Math.cos(a) * .7, -1 + 2 * t, Math.sin(a) * .7]); }
    return o; } },
  dna: { name: 'DNA', icon: '⧚', gen(d) {
    const rungs = 8 + d * 2, R = .5, tw = 2.4 * 2 * Math.PI, o = [];
    const A = (t, ph) => [R * Math.cos(t * tw + ph), -1 + 2 * t, R * Math.sin(t * tw + ph)];
    let onA = true;
    for (let r = 0; r < rungs; r++) {
      const t0 = r / rungs, t1 = (r + 1) / rungs;
      const s1 = onA ? Math.PI : 0;
      // sport naar de andere streng
      for (let k = 0; k <= 12; k++) { const p = A(t0, onA ? 0 : Math.PI), q = A(t0, s1), u = k / 12; o.push([lerp(p[0], q[0], u), lerp(p[1], q[1], u), lerp(p[2], q[2], u)]); }
      for (let k = 1; k <= 40; k++) o.push(A(lerp(t0, t1, k / 40), s1));
      onA = !onA;
    }
    return o; } },
  kubus: { name: 'Kubus (Hilbert)', icon: '⬡', gen(d) { return chaikin(hilbert3(d < 5 ? 2 : 3), 2).map(p => [p[0] * .85, p[1] * .85, p[2] * .85]); } },
  lissajous: { name: 'Lissajous', icon: '✺', gen(d) {
    const sets = [[3, 2, 5], [2, 3, 7], [3, 4, 5], [5, 2, 7], [4, 3, 5]];
    const [a, b, c] = sets[(d - 1) % 5], N = 2600, o = [];
    for (let k = 0; k <= N; k++) { const t = k / N * 2 * Math.PI; o.push([Math.cos(a * t + .7), Math.cos(b * t + .2), Math.cos(c * t)]); }
    return o; } },
  tornado: { name: 'Wervelwind', icon: '🌀', gen(d) {
    const turns = 7 + d * 2, N = 2400, o = [];
    for (let k = 0; k <= N; k++) { const t = k / N, a = turns * 2 * Math.PI * t, r = .12 + .88 * Math.pow(t, 1.3); o.push([r * Math.cos(a), -1 + 2 * t, r * Math.sin(a)]); }
    return o; } },
  zandloper: { name: 'Zandloper', icon: '⧗', gen(d) {
    const turns = 9 + d * 2, N = 2600, o = [];
    for (let k = 0; k <= N; k++) { const t = k / N, y = -1 + 2 * t, a = turns * 2 * Math.PI * t, r = .16 + .78 * y * y; o.push([r * Math.cos(a), y, r * Math.sin(a)]); }
    return o; } },
  heuvels: { name: 'Heuvels', icon: '⛰', gen(d) {
    const rows = 9 + d * 2, M = 140, o = [];
    const h = (x, z) => .62 * Math.exp(-((x + .28) ** 2 * 3.2 + (z - .15) ** 2 * 3)) + .34 * Math.exp(-((x - .52) ** 2 * 5 + (z + .45) ** 2 * 4)) + .035 * Math.sin(9 * x + 3 * z);
    for (let j = 0; j < rows; j++) {
      const z = -1 + 2 * j / (rows - 1);
      for (let k = 0; k <= M; k++) { const u = k / M, x = j % 2 ? 1 - 2 * u : -1 + 2 * u; o.push([x, h(x, z) * 1.3 - .45, z]); }
    }
    return o; } }
};
const shapeCache = new Map();
function shapePoints(name, detail) {
  const key = name + ':' + detail;
  if (shapeCache.has(key)) return shapeCache.get(key);
  const sh = SHAPES[name] || SHAPES.bol;
  let pts = sh.gen(detail);
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  pts.forEach(p => { for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], p[a]); mx[a] = Math.max(mx[a], p[a]); } });
  const c = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
  const ext = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) / 2 || 1;
  pts = pts.map(p => [(p[0] - c[0]) / ext, (p[1] - c[1]) / ext, (p[2] - c[2]) / ext]);
  shapeCache.set(key, pts);
  return pts;
}
// Kleine 2D-voorvertoning (SVG-pad) van een vorm, voor knoppen en miniaturen.
function shapePreviewPath(name, detail, tiltX, tiltY, size) {
  const e = new THREE.Euler((tiltX ?? 18) * DEG, (tiltY ?? -24) * DEG, 0, 'YXZ'), v = new THREE.Vector3();
  const pts = shapePoints(name, detail || 5);
  const step = Math.max(1, Math.floor(pts.length / 500));
  let d = '';
  for (let k = 0; k < pts.length; k += step) {
    v.set(pts[k][0], pts[k][1], pts[k][2]).applyEuler(e);
    d += (k ? 'L' : 'M') + ((v.x * .46 + .5) * size).toFixed(1) + ' ' + ((-v.y * .46 + .5) * size).toFixed(1);
  }
  return d;
}

// ── Lijnstukken per dia ─────────────────────────────────────────────────
// Lokale coördinaten van een station: x naar rechts, y omhoog, z naar de kijker.
function framePxToLocal(px, py) { return [(px - FW / 2) * U, (FH / 2 - py) * U]; }
function deformZ(kind, depth, x, y, pathIdx, pathCount) {
  switch (kind) {
    case 'bol': { const r2 = (x / 8) ** 2 + (y / 4.5) ** 2; return [x, y, depth * Math.exp(-2 * r2)]; }
    case 'golf': return [x, y, depth * (.5 + .5 * Math.sin(x * .7 + y * .25))];
    case 'cilinder': { const R = Math.max(3.5, 16 / Math.max(.3, depth)), a = x / R; return [R * Math.sin(a), y, R - R * Math.cos(a)]; }
    case 'draai': { const a = y * .12 * depth; return [x * Math.cos(a), y, x * Math.sin(a)]; }
    case 'lagen': return [x, y, pathCount > 1 ? depth * 1.4 * pathIdx / (pathCount - 1) : 0];
  }
  return [x, y, 0];
}
// Reliëf: de tekening "bolt op". Gebieden die door lijnen omsloten worden
// (een figuur, een hand) krijgen hoogte naar hun afstand tot de buitenkant,
// zoals een opgeblazen ballon. Geeft een functie (frame-px) → hoogte 0..1.
const reliefCache = new Map();
function reliefField(runs, key) {
  if (reliefCache.has(key)) return reliefCache.get(key);
  const C = 8, OX = -240, OY = -240, GW = Math.ceil((FW + 480) / C), GH = Math.ceil((FH + 480) / C), N = GW * GH;
  const cell = new Uint8Array(N); // 0 leeg, 1 lijn, 2 buiten
  const R = 1;
  runs.forEach(r => { if (!r.visible) return; r.pts.forEach(p => {
    const gx = Math.floor((p.x - OX) / C), gy = Math.floor((p.y - OY) / C);
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { if (dx * dx + dy * dy > R * R + 1) continue; const x = gx + dx, y = gy + dy; if (x >= 0 && y >= 0 && x < GW && y < GH) cell[y * GW + x] = 1; }
  }); });
  // buitenkant volgen vanaf de randen
  const q = new Int32Array(N); let qh = 0, qt = 0;
  const seed = i => { if (cell[i] === 0) { cell[i] = 2; q[qt++] = i; } };
  for (let x = 0; x < GW; x++) { seed(x); seed((GH - 1) * GW + x); }
  for (let y = 0; y < GH; y++) { seed(y * GW); seed(y * GW + GW - 1); }
  while (qh < qt) { const i = q[qh++], x = i % GW, y = (i / GW) | 0; if (x > 0) seed(i - 1); if (x < GW - 1) seed(i + 1); if (y > 0) seed(i - GW); if (y < GH - 1) seed(i + GW); }
  // afstand tot de buitenkant (alles wat niet buiten is)
  const dist = new Float32Array(N).fill(1e9); qh = qt = 0;
  for (let i = 0; i < N; i++) if (cell[i] === 2) { dist[i] = 0; q[qt++] = i; }
  while (qh < qt) {
    const i = q[qh++], x = i % GW, y = (i / GW) | 0, d = dist[i] + 1;
    const nb = [x > 0 ? i - 1 : -1, x < GW - 1 ? i + 1 : -1, y > 0 ? i - GW : -1, y < GH - 1 ? i + GW : -1];
    for (const j of nb) if (j >= 0 && dist[j] > d) { dist[j] = d; q[qt++] = j; }
  }
  let mx = 0; for (let i = 0; i < N; i++) if (cell[i] !== 2 && dist[i] < 1e8) mx = Math.max(mx, dist[i]);
  let h = new Float32Array(N);
  // hoogte loopt zacht op vanaf de rand en vlakt dan af: subtiel, geen ballon
  if (mx > 0) for (let i = 0; i < N; i++) h[i] = cell[i] === 2 ? 0 : 1 - Math.exp(-Math.min(dist[i], mx) / 5);
  // twee keer vervagen voor een zachte bolling
  for (let pass = 0; pass < 3; pass++) {
    const o = new Float32Array(N);
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < GW && yy < GH) { s += h[yy * GW + xx]; n++; } }
      o[y * GW + x] = s / n;
    }
    h = o;
  }
  const f = (px, py) => {
    const gx = (px - OX) / C - .5, gy = (py - OY) / C - .5;
    const x0 = clamp(Math.floor(gx), 0, GW - 2), y0 = clamp(Math.floor(gy), 0, GH - 2), tx = clamp(gx - x0, 0, 1), ty = clamp(gy - y0, 0, 1);
    const a = h[y0 * GW + x0], b = h[y0 * GW + x0 + 1], c = h[(y0 + 1) * GW + x0], d = h[(y0 + 1) * GW + x0 + 1];
    return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
  };
  if (reliefCache.size > 60) reliefCache.clear();
  reliefCache.set(key, f);
  return f;
}
// Ronde hoeken zoals bij de kleine letters: waar de lijn echt een hoek maakt
// (ook waar twee letters aansluiten) komt een korte, vloeiende bocht. Rechte
// en gebogen stukken blijven zoals ze zijn.
function roundCorners(out, rad) {
  const P = out.p, V = out.v;
  let i = 0;
  while (i < P.length) {
    let j = i + 1; while (j < P.length && V[j]) j++;
    if (j - i > 8) roundRun(P, i, j - 1, rad);
    i = j;
  }
}
function roundRun(P, a, b, rad) {
  const n = b - a + 1, d3 = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  let L = 0; for (let k = 1; k < n; k++) L += d3(P[a + k], P[a + k - 1]);
  const sp = L / (n - 1); if (!(sp > 0)) return;
  const k0 = Math.max(2, Math.round(rad / sp)), w = Math.max(2, Math.round(k0 * .6));
  const turn = new Float32Array(n);
  for (let k = w; k < n - w; k++) {
    const p0 = P[a + k - w], p1 = P[a + k], p2 = P[a + k + w];
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2], vx = p2[0] - p1[0], vy = p2[1] - p1[1], vz = p2[2] - p1[2];
    const lu = Math.hypot(ux, uy, uz), lv = Math.hypot(vx, vy, vz);
    if (lu > 1e-9 && lv > 1e-9) turn[k] = Math.acos(clamp((ux * vx + uy * vy + uz * vz) / (lu * lv), -1, 1));
  }
  const TH = 30 * DEG;
  for (let k = w; k < n - w; k++) {
    if (turn[k] < TH) continue;
    let isMax = true; for (let m = Math.max(0, k - w); m <= Math.min(n - 1, k + w); m++) if (turn[m] > turn[k]) { isMax = false; break; }
    if (!isMax) continue;
    // Een keerpunt (top van A, M, N) krijgt een smalle, ronde top die bijna
    // even hoog blijft; een gewone hoek een korte bocht.
    const cusp = turn[k] > 2.2, kk = Math.max(2, Math.round(k0 * (cusp ? 1.25 : 1)));
    const s0 = Math.max(0, k - kk), e0 = Math.min(n - 1, k + kk);
    const A = P[a + s0].slice(), C = P[a + k].slice(), B = P[a + e0].slice();
    for (let m = s0; m <= e0; m++) {
      const t = (m - s0) / (e0 - s0), u = 1 - t;
      const wA = cusp ? u * u * u : u * u, wC = cusp ? 3 * u * u * t + 3 * u * t * t : 2 * u * t, wB = cusp ? t * t * t : t * t;
      P[a + m] = [wA * A[0] + wC * C[0] + wB * B[0], wA * A[1] + wC * C[1] + wB * B[1], wA * A[2] + wC * C[2] + wB * B[2]];
    }
    k = e0;
  }
}
// Maakt de puntenlijst (lokaal 3D) van één lijnelement.
// Resultaat: { p:[[x,y,z]], c:[hex], v:[bool] }  (v[k] = stuk k-1→k getekend)
function itemPolyline(it, slide, theme) {
  const out = { p: [], c: [], v: [] };
  const defColor = it.color || slide.lineColor || theme.line;
  if (it.type === 'shape' || it.type === 'model') {
    let pts, vis = null;
    if (it.type === 'model') {
      const md = G.OLP3D_MODELS && G.OLP3D_MODELS.build(it.model, it.detail);
      if (!md) return out;
      pts = md.p; vis = md.v;
    } else pts = shapePoints(it.shape, it.detail);
    const e = new THREE.Euler((it.tiltX ?? 18) * DEG, (it.tiltY ?? -24) * DEG, 0, 'YXZ');
    const [cx, cy] = framePxToLocal(it.x + it.w / 2, it.y + it.h / 2);
    // De vorm zweeft iets voor de kaart; door het perspectief lijkt hij dan
    // groter, dus een fractie kleiner maken zodat hij in zijn kader past.
    const r0 = Math.min(it.w, it.h) / 2 * U, lift = r0 * .55, sc = r0 * (11.2 - lift) / 11.2;
    const v = new THREE.Vector3();
    let prev = null;
    // herbemonsteren op afstand ~0.03 eenheden; een pen-omhoog-sprong niet opvullen
    const raw = pts.map(p => { v.set(p[0], p[1], p[2]).applyEuler(e); return [cx + v.x * sc, cy + v.y * sc, v.z * sc + lift]; });
    for (let k = 0; k < raw.length; k++) {
      const q = raw[k], down = vis ? !!vis[k] : true;
      if (prev && down) {
        const dd = Math.hypot(q[0] - prev[0], q[1] - prev[1], q[2] - prev[2]);
        if (dd < .02 && k < raw.length - 1 && (!vis || vis[k + 1])) continue;
        const n = Math.ceil(dd / .05);
        for (let j = 1; j < n; j++) { const t = j / n; out.p.push([lerp(prev[0], q[0], t), lerp(prev[1], q[1], t), lerp(prev[2], q[2], t)]); out.c.push(defColor); out.v.push(true); }
      }
      out.p.push(q); out.c.push(defColor); out.v.push(!!prev && down); prev = q;
    }
    return out;
  }
  // svg / olt
  let svgText = it.type === 'olt' ? it.src : it.svg;
  if (it.type === 'olt' && !svgText && it.text) svgText = composeOneLineText(it.text, it.letterColors) || '';
  if (!svgText) return out;
  const info = readSvg(svgText);
  const [vx, vy, vw, vh] = info.vb;
  const sc = Math.min(it.w / vw, it.h / vh);
  const ox = it.x + (it.w - vw * sc) / 2 - vx * sc, oy = it.y + (it.h - vh * sc) / 2 - vy * sc;
  const rot = (it.rot || 0) * DEG, cR = Math.cos(rot), sR = Math.sin(rot), bcx = it.x + it.w / 2, bcy = it.y + it.h / 2;
  const spacing = 3.2; // frame-px tussen punten
  const runs = [];
  const visCount = info.paths.length;
  info.paths.forEach((path, pi) => {
    let col = defColor;
    if (it.type === 'svg' && it.pathColors && it.pathColors[pi]) col = it.pathColors[pi];
    if (it.type === 'olt' && path.stroke && path.stroke !== 'currentColor') col = path.stroke;
    path.subs.forEach(sp => {
      let pts = sp.map(p => {
        let x = p.x * sc + ox, y = p.y * sc + oy;
        if (rot) { const dx = x - bcx, dy = y - bcy; x = bcx + dx * cR - dy * sR; y = bcy + dx * sR + dy * cR; }
        return { x, y };
      });
      pts = path.visible ? resample(pts, spacing) : [pts[0], pts[pts.length - 1]];
      runs.push({ pts, col, visible: path.visible, pi });
    });
  });
  if (!runs.length) return out;
  // Tekening loopt van rechts naar links? Dan omdraaien (zoals in de 2D-app),
  // zodat de lijn links binnenkomt en rechts weer verdergaat.
  let flip = false;
  if (it.type === 'svg') {
    const f = runs[0].pts[0], l = runs[runs.length - 1].pts[runs[runs.length - 1].pts.length - 1];
    let mn = Infinity, mx = -Infinity; runs.forEach(r => r.pts.forEach(p => { mn = Math.min(mn, p.x); mx = Math.max(mx, p.x); }));
    if (mx - mn > 0 && (f.x - l.x) > (mx - mn) * .3) flip = true;
    if (it.reverse) flip = !flip;
  }
  if (flip) { runs.reverse(); runs.forEach(r => r.pts.reverse()); }
  const dk = it.deform || 'plat', depth = it.depth ?? 1.5;
  const field = dk === 'relief' ? reliefField(runs, hashStr(svgText) + '|' + [it.x, it.y, it.w, it.h, it.rot, flip].join(',')) : null;
  let last = null;
  runs.forEach(r => {
    r.pts.forEach((p, k) => {
      const [lx, ly] = framePxToLocal(p.x, p.y);
      const q = field ? [lx, ly, depth * field(p.x, p.y)] : deformZ(dk, depth, lx, ly, r.pi, visCount);
      let vis = r.visible && k > 0;
      if (k === 0 && last) {
        // sprong naar een los deel: pen omhoog
        const gap = Math.hypot(q[0] - last[0], q[1] - last[1], q[2] - last[2]);
        if (gap < .03) { return; }
        vis = false;
      }
      out.p.push(q); out.c.push(r.col); out.v.push(vis); last = q;
    });
  });
  if (it.type === 'olt') roundCorners(out, 17 * sc * U);
  return out;
}
// Lijnkader rond een afbeelding of video: de pen tekent eerst het kader.
function framePolyline(it, slide, theme) {
  const col = it.color || slide.lineColor || theme.line;
  const pad = 16, r = 28, x0 = it.x - pad, y0 = it.y - pad, w = it.w + pad * 2, h = it.h + pad * 2;
  const pts = [];
  const line = (ax, ay, bx, by) => { const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay) / 4)); for (let k = 1; k <= n; k++) pts.push({ x: lerp(ax, bx, k / n), y: lerp(ay, by, k / n) }); };
  const corner = (cx, cy, a0) => { for (let k = 1; k <= 10; k++) { const a = (a0 + 9 * k) * DEG; pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); } };
  pts.push({ x: x0, y: y0 + h - r });
  line(x0, y0 + h - r, x0, y0 + r); corner(x0 + r, y0 + r, 180);
  line(x0 + r, y0, x0 + w - r, y0); corner(x0 + w - r, y0 + r, 270);
  line(x0 + w, y0 + r, x0 + w, y0 + h - r); corner(x0 + w - r, y0 + h - r, 0);
  line(x0 + w - r, y0 + h, x0 + r, y0 + h); corner(x0 + r, y0 + h - r, 90);
  const rot = (it.rot || 0) * DEG, cR = Math.cos(rot), sR = Math.sin(rot), bx = it.x + it.w / 2, by = it.y + it.h / 2;
  const out = { p: [], c: [], v: [] };
  pts.forEach((p, k) => {
    let x = p.x, y = p.y;
    if (rot) { const dx = x - bx, dy = y - by; x = bx + dx * cR - dy * sR; y = by + dx * sR + dy * cR; }
    const [lx, ly] = framePxToLocal(x, y);
    out.p.push([lx, ly, .02]); out.c.push(col); out.v.push(k > 0);
  });
  return out;
}
// Vloeiende Bézier tussen twee punten met richtingen (lokaal of wereld).
function bezierPts(A, tA, B, tB, lift, liftDir, spacing, maxN) {
  const dist = A.distanceTo(B);
  const h = clamp(dist * .42, .4, 40);
  const P1 = A.clone().addScaledVector(tA, h * .6), P2 = B.clone().addScaledVector(tB, -h * .6);
  if (liftDir) { P1.addScaledVector(liftDir[0], lift); P2.addScaledVector(liftDir[1], lift); }
  const pts = [];
  // lengte schatten
  let L = 0, prev = A.clone();
  const tmp = new THREE.Vector3();
  const at = (t, o) => { const mt = 1 - t; return o.set(0, 0, 0).addScaledVector(A, mt * mt * mt).addScaledVector(P1, 3 * mt * mt * t).addScaledVector(P2, 3 * mt * t * t).addScaledVector(B, t * t * t); };
  for (let k = 1; k <= 48; k++) { at(k / 48, tmp); L += tmp.distanceTo(prev); prev.copy(tmp); }
  const n = clamp(Math.round(L / spacing), 8, maxN || 4000);
  for (let k = 0; k <= n; k++) pts.push(at(k / n, new THREE.Vector3()));
  return { pts, L };
}
function dirAt(pts, fromEnd, minDist) {
  // richting aan begin (fromEnd=false, loop-richting) of eind (true, loop-richting)
  const n = pts.length; if (n < 2) return new THREE.Vector3(1, 0, 0);
  const a = fromEnd ? pts[n - 1] : pts[0];
  for (let k = 1; k < n; k++) {
    const b = fromEnd ? pts[n - 1 - k] : pts[k];
    const d = a.distanceTo(b);
    if (d >= minDist || k === n - 1) {
      const v = fromEnd ? a.clone().sub(b) : b.clone().sub(a);
      return v.lengthSq() > 1e-12 ? v.normalize() : new THREE.Vector3(1, 0, 0);
    }
  }
  return new THREE.Vector3(1, 0, 0);
}

// ── Station (dia in de ruimte) ──────────────────────────────────────────
function stationOf(slide) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(slide.rot.x * DEG, slide.rot.y * DEG, slide.rot.z * DEG, 'YXZ'));
  const m = new THREE.Matrix4().compose(new THREE.Vector3(slide.pos.x, slide.pos.y, slide.pos.z), q, new THREE.Vector3(slide.scale, slide.scale, slide.scale));
  return {
    m, q, scale: slide.scale,
    center: new THREE.Vector3(slide.pos.x, slide.pos.y, slide.pos.z),
    normal: new THREE.Vector3(0, 0, 1).applyQuaternion(q),
    up: new THREE.Vector3(0, 1, 0).applyQuaternion(q),
    right: new THREE.Vector3(1, 0, 0).applyQuaternion(q)
  };
}

// ── Het hele spoor ──────────────────────────────────────────────────────
// Fasen: [intro] teken0 reis0 teken1 reis1 … tekenN [outro]
// Elke fase: punten (wereld), kleuren, zichtbaarheid, en een tijd-as s.
function buildTrack(doc, stations, theme, opts) {
  const st = doc.settings;
  const phases = [];
  const colorObj = new THREE.Color();
  const slidePolys = doc.slides.map((slide, i) => {
    const S = stations[i];
    const items = slide.items.filter(it => it.type === 'svg' || it.type === 'olt' || it.type === 'shape' || it.type === 'model' || it.type === 'image' || it.type === 'video');
    let poly = { p: [], c: [], v: [] };
    let prevItem = null;
    const marks = [];
    const lineItems = items.map(it => ({ it, pl: (it.type === 'image' || it.type === 'video') ? framePolyline(it, slide, theme) : itemPolyline(it, slide, theme) })).filter(x => x.pl.p.length > 1);
    if (!lineItems.length) {
      // Geen tekening: een zwierige onderstreping, zodat de lijn doorloopt
      const col = slide.lineColor || theme.line, pts = [];
      for (let k = 0; k <= 260; k++) { const u = k / 260, px = -160 + u * (FW + 320), py = 905 + Math.sin(u * Math.PI * 3) * 22 * Math.sin(u * Math.PI); pts.push({ x: px, y: py }); }
      lineItems.push({ it: { type: 'swoosh' }, pl: { p: pts.map(p => { const [x, y] = framePxToLocal(p.x, p.y); return [x, y, 0]; }), c: pts.map(() => col), v: pts.map((_, k) => k > 0) } });
    }
    lineItems.forEach(({ it, pl }) => {
      if (poly.p.length) {
        const A = new THREE.Vector3(...poly.p[poly.p.length - 1]), B = new THREE.Vector3(...pl.p[0]);
        const gap = A.distanceTo(B);
        // van tekstpad naar tekstpad gaat de pen onzichtbaar en snel
        const penUp = !!(prevItem && prevItem.type === 'olt' && it.type === 'olt');
        if (gap > .04) {
          const tA = dirAt(poly.p.slice(-40).map(a => new THREE.Vector3(...a)), true, .25);
          const tB = dirAt(pl.p.slice(0, 40).map(a => new THREE.Vector3(...a)), false, .25);
          const lift = clamp(gap * .18, .05, 1.2), z = new THREE.Vector3(0, 0, 1);
          const { pts } = bezierPts(A, tA, B, tB, lift, [z, z], .03, 3000);
          // kleurverloop van het ene element naar het volgende
          const ca = new THREE.Color(poly.c[poly.c.length - 1]), cb = new THREE.Color(pl.c[0]), cm = new THREE.Color();
          for (let k = 1; k < pts.length - 1; k++) { poly.p.push([pts[k].x, pts[k].y, pts[k].z]); poly.c.push('#' + cm.copy(ca).lerp(cb, k / (pts.length - 1)).getHexString()); poly.v.push(!penUp); }
        }
        pl.v[0] = !penUp;
      }
      poly.p.push(...pl.p); poly.c.push(...pl.c); poly.v.push(...pl.v);
      if (it.id) marks.push({ id: it.id, idx: poly.p.length - 1 });
      prevItem = it;
    });
    if (poly.v.length) poly.v[0] = false;
    // naar wereld
    const v = new THREE.Vector3();
    const wp = poly.p.map(p => v.set(p[0], p[1], p[2]).applyMatrix4(S.m).clone());
    let minZ = 0; poly.p.forEach(p => { if (p[0] > -8.5 && p[0] < 8.5 && p[1] > -5 && p[1] < 5) minZ = Math.min(minZ, p[2]); });
    return { wp, c: poly.c, v: poly.v, minZ, marks };
  });

  const toPhase = (kind, slide, wp, cols, vis, speedW) => {
    const n = wp.length;
    const P = new Float32Array(n * 3), C = new Float32Array(n * 3), V = new Uint8Array(n), Sx = new Float32Array(n);
    let s = 0, geo = 0;
    for (let k = 0; k < n; k++) {
      P[k * 3] = wp[k].x; P[k * 3 + 1] = wp[k].y; P[k * 3 + 2] = wp[k].z;
      colorObj.set(typeof cols === 'function' ? cols(k, n) : cols[k]);
      C[k * 3] = colorObj.r; C[k * 3 + 1] = colorObj.g; C[k * 3 + 2] = colorObj.b;
      V[k] = vis[k] ? 1 : 0;
      if (k > 0) { const d = wp[k].distanceTo(wp[k - 1]); s += V[k] ? d : d * (speedW ?? PEN_UP); geo += d; }
      Sx[k] = s;
    }
    return { kind, slide, P, C, V, S: Sx, n, len: s, geoLen: geo };
  };

  // travel-curve tussen twee punten in de wereld
  const travel = (E, tE, nA, S, tS, nB, style, idx) => {
    const dist = E.distanceTo(S);
    const h = clamp(dist * .45, 1.2, 40);
    const P1 = E.clone().addScaledVector(tE, h * .55).addScaledVector(nA, style === 'recht' ? 0 : h * .4);
    const P2 = S.clone().addScaledVector(tS, -h * .55).addScaledVector(nB, style === 'recht' ? 0 : h * .4);
    if (style === 'recht') { P1.copy(E).addScaledVector(tE, h * .15); P2.copy(S).addScaledVector(tS, -h * .15); }
    const base = (t, o) => { const mt = 1 - t; return o.set(0, 0, 0).addScaledVector(E, mt * mt * mt).addScaledVector(P1, 3 * mt * mt * t).addScaledVector(P2, 3 * mt * t * t).addScaledVector(S, t * t * t); };
    const tmp = new THREE.Vector3(), prev = E.clone(); let L = 0;
    for (let k = 1; k <= 64; k++) { base(k / 64, tmp); L += tmp.distanceTo(prev); prev.copy(tmp); }
    const n = clamp(Math.round(L / .045), 40, 5000);
    const raw = []; for (let k = 0; k <= n; k++) raw.push(base(k / n, new THREE.Vector3()));
    if (style === 'vloeiend' || style === 'recht') return raw;
    // frame langs de curve (parallel transport) voor de versieringen
    const out = [];
    let Uv = new THREE.Vector3(0, 1, 0);
    const T = new THREE.Vector3(), Vv = new THREE.Vector3();
    const R = clamp(L * .4 / (2 * Math.PI) * 1.1, .6, 3.2);
    const turns = clamp(Math.round(L / 7), 2, 9), waves = clamp(Math.round(L / 11), 1, 5), amp = clamp(dist * .04, .3, 1.6);
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      T.copy(raw[Math.min(n, k + 1)]).sub(raw[Math.max(0, k - 1)]).normalize();
      if (k === 0) { Uv.set(0, 1, 0); if (Math.abs(Uv.dot(T)) > .95) Uv.set(1, 0, 0); }
      Uv.addScaledVector(T, -Uv.dot(T)).normalize();
      Vv.crossVectors(T, Uv);
      const p = raw[k].clone();
      if (style === 'lus') {
        if (t > .3 && t < .7) { const u = (t - .3) / .4, a = 2 * Math.PI * u; p.addScaledVector(T, R * Math.sin(a)).addScaledVector(Uv, R * (1 - Math.cos(a))); }
      } else if (style === 'spiraal') {
        const env = Math.sin(Math.PI * t), a = turns * 2 * Math.PI * t, r = clamp(dist * .03, .25, 1.2) * env;
        p.addScaledVector(Uv, Math.sin(a) * r).addScaledVector(Vv, (1 - Math.cos(a)) * r * .5);
      } else if (style === 'golf') {
        p.addScaledVector(Uv, Math.sin(2 * Math.PI * waves * t) * amp * Math.sin(Math.PI * t));
      }
      out.push(p);
    }
    // gelijkmatig herverdelen (de looping maakt stukken langer)
    const cum = [0]; for (let k = 1; k < out.length; k++) cum.push(cum[k - 1] + out[k].distanceTo(out[k - 1]));
    const L2 = cum[cum.length - 1], m = clamp(Math.round(L2 / .045), 40, 6000), res = []; let j = 1;
    for (let k = 0; k <= m; k++) {
      const tg = L2 * k / m; while (j < cum.length - 1 && cum[j] < tg) j++;
      const sg = cum[j] - cum[j - 1] || 1; res.push(out[j - 1].clone().lerp(out[j], clamp((tg - cum[j - 1]) / sg, 0, 1)));
    }
    return res;
  };

  const N = doc.slides.length;
  const info = []; // per dia: fase-indexen
  if (!N) return { phases, info, stations };
  const firstStart = slidePolys[0].wp[0];
  if (opts.intro) {
    const S0 = stations[0];
    const tS = dirAt(slidePolys[0].wp.slice(0, 60), false, .3);
    const from = firstStart.clone().addScaledVector(tS, -14 * S0.scale).addScaledVector(S0.normal, 9 * S0.scale).addScaledVector(S0.up, 4 * S0.scale);
    const pts = travel(from, tS.clone(), S0.normal, firstStart, tS, S0.normal, 'vloeiend', -1);
    const c0 = slidePolys[0].c[0];
    phases.push(toPhase('intro', 0, pts, () => c0, pts.map((_, k) => k > 0), 1));
  }
  doc.slides.forEach((slide, i) => {
    const sp = slidePolys[i];
    const di = phases.length;
    phases.push(toPhase('draw', i, sp.wp, sp.c, sp.v));
    let ti = -1;
    if (i < N - 1) {
      const nx = slidePolys[i + 1], A = stations[i], B = stations[i + 1];
      const E = sp.wp[sp.wp.length - 1], S = nx.wp[0];
      const tE = dirAt(sp.wp.slice(-60), true, .3), tS = dirAt(nx.wp.slice(0, 60), false, .3);
      const pts = travel(E, tE, A.normal, S, tS, B.normal, slide.link, i);
      const ca = new THREE.Color(sp.c[sp.c.length - 1]), cb = new THREE.Color(nx.c[0]), cc = new THREE.Color();
      ti = phases.length;
      phases.push(toPhase('travel', i, pts, (k, n) => cc.copy(ca).lerp(cb, k / Math.max(1, n - 1)), pts.map((_, k) => k > 0), 1));
    }
    info.push({ draw: di, travel: ti, minZ: sp.minZ, marks: sp.marks });
  });
  if (opts.finale) {
    const lp = slidePolys[N - 1], L = stations[N - 1];
    const E = lp.wp[lp.wp.length - 1], tE = dirAt(lp.wp.slice(-60), true, .3);
    const to = E.clone().addScaledVector(tE, 16 * L.scale).addScaledVector(L.normal, 6 * L.scale).addScaledVector(L.up, 7 * L.scale);
    const pts = travel(E, tE, L.normal, to, L.up.clone().multiplyScalar(.6).add(tE).normalize(), L.normal, 'spiraal', N);
    const c1 = lp.c[lp.c.length - 1];
    phases.push(toPhase('outro', N - 1, pts, () => c1, pts.map((_, k) => k > 0), 1));
  }
  // globale tijd-as
  let s = 0;
  phases.forEach(ph => { ph.s0 = s; s += ph.len; ph.s1 = s; });
  // per element: het moment waarop de lijn het af heeft (afbeelding/video verschijnt dan)
  info.forEach(inf => { const ph = phases[inf.draw]; inf.reveal = {}; (inf.marks || []).forEach(m => { inf.reveal[m.id] = ph.s0 + ph.S[Math.min(ph.n - 1, m.idx)]; }); });
  return { phases, info, total: s };
}

// ── Buis-geometrie ──────────────────────────────────────────────────────
function buildTube(ph, radius) {
  const { P, C, V, n } = ph, R = RADIAL;
  const pos = new Float32Array(n * R * 3), nor = new Float32Array(n * R * 3), col = new Float32Array(n * R * 3);
  const T = new Float32Array(n * 3);
  let lx = 1, ly = 0, lz = 0;
  for (let k = 0; k < n; k++) {
    const a = Math.max(0, k - 1), b = Math.min(n - 1, k + 1);
    let x = P[b * 3] - P[a * 3], y = P[b * 3 + 1] - P[a * 3 + 1], z = P[b * 3 + 2] - P[a * 3 + 2];
    const l = Math.hypot(x, y, z);
    if (l > 1e-9) { x /= l; y /= l; z /= l; lx = x; ly = y; lz = z; } else { x = lx; y = ly; z = lz; }
    T[k * 3] = x; T[k * 3 + 1] = y; T[k * 3 + 2] = z;
  }
  // beginnormaal loodrecht op de eerste raaklijn
  let Nx, Ny, Nz;
  { const tx = T[0], ty = T[1], tz = T[2]; const ax = Math.abs(ty) < .9 ? 0 : 1, ay = Math.abs(ty) < .9 ? 1 : 0;
    Nx = ty * 0 - tz * ay; Ny = tz * ax - tx * 0; Nz = tx * ay - ty * ax; // T × axis
    const l = Math.hypot(Nx, Ny, Nz) || 1; Nx /= l; Ny /= l; Nz /= l; }
  const cs = [], sn = []; for (let j = 0; j < R; j++) { cs.push(Math.cos(2 * Math.PI * j / R)); sn.push(Math.sin(2 * Math.PI * j / R)); }
  for (let k = 0; k < n; k++) {
    const tx = T[k * 3], ty = T[k * 3 + 1], tz = T[k * 3 + 2];
    const d = Nx * tx + Ny * ty + Nz * tz; Nx -= tx * d; Ny -= ty * d; Nz -= tz * d;
    let l = Math.hypot(Nx, Ny, Nz);
    if (l < 1e-6) { const ax = Math.abs(ty) < .9 ? 0 : 1, ay = Math.abs(ty) < .9 ? 1 : 0; Nx = -tz * ay; Ny = tz * ax; Nz = tx * ay - ty * ax; l = Math.hypot(Nx, Ny, Nz) || 1; }
    Nx /= l; Ny /= l; Nz /= l;
    const Bx = ty * Nz - tz * Ny, By = tz * Nx - tx * Nz, Bz = tx * Ny - ty * Nx;
    for (let j = 0; j < R; j++) {
      const o = (k * R + j) * 3;
      const nx = cs[j] * Nx + sn[j] * Bx, ny = cs[j] * Ny + sn[j] * By, nz = cs[j] * Nz + sn[j] * Bz;
      pos[o] = P[k * 3] + nx * radius; pos[o + 1] = P[k * 3 + 1] + ny * radius; pos[o + 2] = P[k * 3 + 2] + nz * radius;
      nor[o] = nx; nor[o + 1] = ny; nor[o + 2] = nz;
      col[o] = C[k * 3]; col[o + 1] = C[k * 3 + 1]; col[o + 2] = C[k * 3 + 2];
    }
  }
  let segs = 0; for (let k = 1; k < n; k++) if (V[k]) segs++;
  const idx = new Uint32Array(segs * R * 6), idxEnd = new Uint32Array(n);
  let m = 0;
  for (let k = 1; k < n; k++) {
    if (V[k]) for (let j = 0; j < R; j++) {
      const a = (k - 1) * R + j, b = (k - 1) * R + (j + 1) % R, c = k * R + j, d = k * R + (j + 1) % R;
      idx[m++] = a; idx[m++] = b; idx[m++] = c; idx[m++] = b; idx[m++] = d; idx[m++] = c;
    }
    idxEnd[k] = m;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return { geo: g, idxEnd };
}

// ── Texturen ────────────────────────────────────────────────────────────
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.25, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function sparkleTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.2, 'rgba(255,255,255,.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  x.fillStyle = 'rgba(255,255,255,.9)';
  x.beginPath(); x.moveTo(32, 2); x.quadraticCurveTo(35, 29, 62, 32); x.quadraticCurveTo(35, 35, 32, 62); x.quadraticCurveTo(29, 35, 2, 32); x.quadraticCurveTo(29, 29, 32, 2); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const x = c.getContext('2d'), g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.5, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function roundRectShape(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
}
function shadowTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 160;
  const x = c.getContext('2d'); x.filter = 'blur(14px)'; x.fillStyle = 'rgba(0,0,0,1)'; x.fillRect(34, 34, 188, 92);
  const t = new THREE.CanvasTexture(c); return t;
}
function fontCss(it, px) { return `${it.italic ? 'italic ' : ''}${it.bold ? '700' : '400'} ${px}px "${it.font || 'Cormorant Garamond'}", Georgia, serif`; }
function wrapLines(ctx, text, maxW) {
  const out = [];
  String(text).split('\n').forEach(par => {
    const words = par.split(/(\s+)/); let line = '';
    words.forEach(w => {
      const test = line + w;
      if (ctx.measureText(test.trimEnd()).width > maxW && line.trim()) { out.push(line.trimEnd()); line = w.trimStart(); }
      else line = test;
    });
    out.push(line.trimEnd());
  });
  return out;
}
// Meet een tekstblok in frame-px (voor de editor-kaders).
function measureTextItem(it) {
  const c = measureTextItem.c || (measureTextItem.c = document.createElement('canvas').getContext('2d'));
  c.font = fontCss(it, it.size);
  const lines = wrapLines(c, it.text || ' ', it.w || 1600);
  const w = Math.max(20, ...lines.map(l => c.measureText(l).width)) + it.size * .3;
  const h = lines.length * it.size * 1.25 + it.size * .2;
  return { w, h, lines };
}
function textTexture(it, color, halo) {
  const sc = 2;
  const m = measureTextItem(it);
  const c = document.createElement('canvas');
  c.width = Math.min(4096, Math.ceil(m.w * sc)); c.height = Math.min(4096, Math.ceil(m.h * sc));
  const x = c.getContext('2d');
  x.scale(c.width / (m.w * sc) * sc, c.height / (m.h * sc) * sc);
  x.font = fontCss(it, it.size); x.fillStyle = color; x.textBaseline = 'middle';
  x.textAlign = it.align || 'center';
  const ax = it.align === 'left' ? it.size * .15 : it.align === 'right' ? m.w - it.size * .15 : m.w / 2;
  if (halo) { x.shadowColor = halo; x.shadowBlur = Math.max(4, it.size * .35); m.lines.forEach((l, k) => x.fillText(l, ax, it.size * .1 + it.size * 1.25 * (k + .5))); x.shadowBlur = Math.max(2, it.size * .12); }
  m.lines.forEach((l, k) => x.fillText(l, ax, it.size * .1 + it.size * 1.25 * (k + .5)));
  x.shadowBlur = 0;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return { tex: t, w: m.w, h: m.h };
}

// ── Video: placeholder en eerste beeld ───────────────────────────────────
const posterCache = new Map();
function videoPlaceholder(it) {
  const key = 'ph:' + (it.kind || 'file') + ':' + Math.round(it.w / it.h * 10);
  if (posterCache.has(key)) return posterCache.get(key);
  const c = document.createElement('canvas'); c.width = 640; c.height = Math.max(120, Math.round(640 * it.h / it.w));
  const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, c.height);
  g.addColorStop(0, '#2a2150'); g.addColorStop(1, '#130f26'); x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
  const r = Math.min(c.width, c.height) * .16;
  x.fillStyle = 'rgba(255,255,255,.92)'; x.beginPath(); x.arc(c.width / 2, c.height / 2, r, 0, 7); x.fill();
  x.fillStyle = '#ff5eb8'; x.beginPath(); x.moveTo(c.width / 2 - r * .35, c.height / 2 - r * .5); x.lineTo(c.width / 2 + r * .55, c.height / 2); x.lineTo(c.width / 2 - r * .35, c.height / 2 + r * .5); x.fill();
  x.fillStyle = 'rgba(255,255,255,.75)'; x.font = '600 26px Outfit, sans-serif'; x.textAlign = 'center';
  x.fillText(it.kind === 'youtube' ? 'YouTube' : it.kind === 'link' ? 'Video via link' : 'Video', c.width / 2, c.height / 2 + r + 40);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  posterCache.set(key, t); return t;
}
// Eerste beeld van de video (of de YouTube-miniatuur) als textuur.
function posterFor(vd, done) {
  const it = vd.it;
  if (!vd.src) return;
  const key = 'p:' + (it.kind === 'youtube' ? it.src : hashStr(vd.src)) + ':' + segStart(it);
  const hit = posterCache.get(key);
  if (hit && hit.isTexture) { done(hit); return; }
  if (hit === 'bezig' || hit === 'mislukt') return;
  posterCache.set(key, 'bezig');
  if (it.kind === 'youtube') {
    const l = new THREE.TextureLoader(); l.setCrossOrigin('anonymous');
    l.load('https://i.ytimg.com/vi/' + it.src + '/hqdefault.jpg', t => { t.colorSpace = THREE.SRGBColorSpace; posterCache.set(key, t); done(t); }, undefined, () => posterCache.set(key, 'mislukt'));
    return;
  }
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto'; if (it.kind === 'link') v.crossOrigin = 'anonymous';
  v.addEventListener('loadeddata', () => { try { v.currentTime = Math.max(.05, segStart(it)); } catch (e) {} }, { once: true });
  v.addEventListener('seeked', () => {
    try {
      const c = document.createElement('canvas'); c.width = Math.min(960, v.videoWidth || 640); c.height = Math.round(c.width * (v.videoHeight || 360) / (v.videoWidth || 640));
      const x = c.getContext('2d'); x.drawImage(v, 0, 0, c.width, c.height); x.getImageData(0, 0, 1, 1);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; posterCache.set(key, t); done(t);
    } catch (e) { posterCache.set(key, 'mislukt'); }
    v.removeAttribute('src'); try { v.load(); } catch (e) {}
  }, { once: true });
  v.addEventListener('error', () => posterCache.set(key, 'mislukt'), { once: true });
  v.src = vd.src;
}
function youTubeUrl(it, origin) {
  const p = new URLSearchParams({ enablejsapi: '1', playsinline: '1', rel: '0', modestbranding: '1', controls: '1' });
  if (segStart(it)) p.set('start', String(Math.floor(segStart(it))));
  if (it.muted) p.set('mute', '1');
  if (it.loop) { p.set('loop', '1'); p.set('playlist', it.src); }
  if (origin && /^https?:/.test(origin)) p.set('origin', origin);
  return 'https://www.youtube-nocookie.com/embed/' + it.src + '?' + p.toString();
}
// Homografie: element (w × h px) → vierhoek op het scherm, als CSS matrix3d.
// q = [x0,y0, x1,y1, x2,y2, x3,y3] voor de hoeken linksboven, rechtsboven,
// rechtsonder, linksonder.
function quadMatrix(w, h, q) {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = q;
  const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3, dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
  const det = dx1 * dy2 - dx2 * dy1 || 1e-9;
  const g = (sx * dy2 - dx2 * sy) / det, hh = (dx1 * sy - sx * dy1) / det;
  const a = x1 - x0 + g * x1, b = x3 - x0 + hh * x3, c = x0, d = y1 - y0 + g * y1, e = y3 - y0 + hh * y3, f = y0;
  return 'matrix3d(' + [a / w, d / w, 0, g / w, b / h, e / h, 0, hh / h, 0, 0, 1, 0, c, f, 0, 1].join(',') + ')';
}

// ── Shaders ─────────────────────────────────────────────────────────────
function haloMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uGrow: { value: .05 }, uOpacity: { value: .55 } },
    vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform float uGrow; varying vec3 vC; varying float vF;
      void main(){ vec3 p = position + normal * uGrow; vec4 mv = modelViewMatrix * vec4(p,1.0);
        vec3 n = normalize(normalMatrix * normal); vF = abs(dot(n, normalize(-mv.xyz))); vC = color; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uOpacity; varying vec3 vC; varying float vF;
      void main(){ float a = pow(vF, 2.0) * uOpacity; gl_FragColor = vec4(vC, a);
        #include <colorspace_fragment>
      }`
  });
}
function skyMaterial(theme) {
  return new THREE.ShaderMaterial({
    uniforms: { uTop: { value: new THREE.Color(theme.top) }, uMid: { value: new THREE.Color(theme.mid) }, uBot: { value: new THREE.Color(theme.bot) } },
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uBot; varying vec3 vD;
      void main(){ float h = vD.y; vec3 c = h > 0.0 ? mix(uMid, uTop, smoothstep(0.0, 0.65, h)) : mix(uMid, uBot, smoothstep(0.0, 0.55, -h));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`
  });
}
function particleMaterial(tex) {
  return new THREE.ShaderMaterial({
    uniforms: { uMap: { value: tex }, uScale: { value: 600 } },
    vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float aLife; attribute float aSize; uniform float uScale; varying float vL; varying vec3 vC;
      void main(){ vL = aLife; vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * aLife * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D uMap; varying float vL; varying vec3 vC;
      void main(){ vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(vC, t.a * vL);
        #include <colorspace_fragment>
      }`
  });
}

// ═══════════════════════════════════════════════════════════════════════
// World: bouwt de 3D-scène uit een document
// ═══════════════════════════════════════════════════════════════════════
class World {
  constructor(canvas, opts) {
    this.opts = Object.assign({ mode: 'edit' }, opts || {});
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!this.opts.preserve });
    this.renderer.setPixelRatio(Math.min(G.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 16 / 9, .05, 3000);
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x8a7f99, 1.6); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.6); this.sun.position.set(.4, 1, .7); this.scene.add(this.sun);
    this.texGlow = glowTexture(); this.texSpark = sparkleTexture(); this.texDot = dotTexture(); this.texShadow = shadowTexture();
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1400, 32, 16), skyMaterial(THEMES.papier)); this.sky.renderOrder = -10; this.sky.frustumCulled = false;
    this.scene.add(this.sky);
    this.scene.fog = new THREE.Fog(0xffffff, 30, 200);
    this.doc = null; this.phases = []; this.stations = []; this.info = [];
    this.sceneCenter = new THREE.Vector3(); this.sceneRadius = 20;
    this.selected = -1;
    this.w = 0; this.h = 0;
  }
  get theme() { return themeOf(this.doc && this.doc.settings); }
  lineStyle() { const s = this.doc.settings.lineStyle; return s === 'auto' ? (this.theme.style || 'inkt') : s; }
  lineRadius() { return .008 * this.doc.settings.lineWidth; }
  setDoc(doc) { this.doc = normalizeDoc(doc); this.rebuild(); }
  clearRoot() {
    const disp = o => { o.traverse(c => { if (c.geometry && !c.userData.sharedGeo) c.geometry.dispose(); if (c.material) { (Array.isArray(c.material) ? c.material : [c.material]).forEach(m => { if (m.map && !m.userData?.sharedMap) m.map.dispose(); if (!m.userData?.shared) m.dispose(); }); } }); };
    while (this.root.children.length) { const c = this.root.children[0]; this.root.remove(c); disp(c); }
  }
  rebuild() {
    this.clearRoot();
    if (this.lineMat) this.lineMat.dispose();
    if (this.haloMat) this.haloMat.dispose();
    const doc = this.doc, th = this.theme, st = doc.settings, present = this.opts.mode === 'present';
    this.sky.material.uniforms.uTop.value.set(th.top); this.sky.material.uniforms.uMid.value.set(th.mid); this.sky.material.uniforms.uBot.value.set(th.bot);
    this.baseMid = new THREE.Color(th.mid);
    this.scene.fog.color.set(th.mid);
    this.stations = doc.slides.map(stationOf);
    const track = buildTrack(doc, this.stations, th, { intro: present && st.intro, finale: present && st.finale });
    this.phases = track.phases; this.info = track.info; this.total = track.total || 0;
    // scènegrootte
    const box = new THREE.Box3();
    this.stations.forEach(s => { box.expandByPoint(s.center.clone().addScaledVector(s.right, 8 * s.scale).addScaledVector(s.up, 4.5 * s.scale)); box.expandByPoint(s.center.clone().addScaledVector(s.right, -8 * s.scale).addScaledVector(s.up, -4.5 * s.scale)); });
    this.phases.forEach(ph => { for (let k = 0; k < ph.n; k += 25) box.expandByPoint(new THREE.Vector3(ph.P[k * 3], ph.P[k * 3 + 1], ph.P[k * 3 + 2])); });
    if (box.isEmpty()) box.set(new THREE.Vector3(-8, -5, -1), new THREE.Vector3(8, 5, 1));
    // strakke omhullende bol: verste punt vanaf het midden van de doos
    const ctr = box.getCenter(new THREE.Vector3()); let rad = 0;
    const grow = (x, y, z) => { const d = Math.hypot(x - ctr.x, y - ctr.y, z - ctr.z); if (d > rad) rad = d; };
    this.stations.forEach(s => [[-8, -4.5], [8, -4.5], [8, 4.5], [-8, 4.5]].forEach(([a, b]) => { const p = s.center.clone().addScaledVector(s.right, a * s.scale).addScaledVector(s.up, b * s.scale); grow(p.x, p.y, p.z); }));
    this.phases.forEach(ph => { if (ph.kind === 'intro' || ph.kind === 'outro') return; for (let k = 0; k < ph.n; k += 25) grow(ph.P[k * 3], ph.P[k * 3 + 1], ph.P[k * 3 + 2]); });
    this.sceneCenter.copy(ctr); this.sceneRadius = Math.max(10, rad || box.getBoundingSphere(new THREE.Sphere()).radius);
    this.box = box;
    // lijn
    const style = this.lineStyle(), radius = this.lineRadius();
    const mat = style === 'klei' ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .42, metalness: .05 })
      : new THREE.MeshBasicMaterial({ vertexColors: true });
    mat.userData.shared = true; this.lineMat = mat;
    const glow = st.glow ?? 5;
    this.haloMat = style === 'neon' && glow > 0 ? haloMaterial() : null;
    if (this.haloMat) { this.haloMat.uniforms.uGrow.value = radius * (1.2 + glow * .45); this.haloMat.uniforms.uOpacity.value = .11 * glow; this.haloMat.userData.shared = true; }
    this.phases.forEach(ph => {
      const { geo, idxEnd } = buildTube(ph, radius);
      ph.idxEnd = idxEnd; ph.geo = geo;
      const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; this.root.add(mesh); ph.mesh = mesh;
      if (this.haloMat) { const h = new THREE.Mesh(geo, this.haloMat); h.userData.sharedGeo = true; h.frustumCulled = false; h.renderOrder = 2; this.root.add(h); ph.halo = h; }
      if (present && st.ghost) {
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(ph.P, 3));
        const ix = []; for (let k = 1; k < ph.n; k++) if (ph.V[k]) ix.push(k - 1, k);
        g.setIndex(ix);
        const lm = new THREE.LineBasicMaterial({ color: th.line, transparent: true, opacity: 0, depthWrite: false });
        const ln = new THREE.LineSegments(g, lm); ln.frustumCulled = false; this.root.add(ln); ph.ghost = ln;
      }
    });
    // stations: kaart, teksten, afbeeldingen
    this.stationFx = [];
    doc.slides.forEach((slide, i) => this.buildStation(slide, i));
    this.buildEnvironment();
    this.setProgress(present ? 0 : Infinity);
    if (!present) this.updateFrames();
  }
  buildStation(slide, i) {
    const th = this.theme, S = this.stations[i], st = this.doc.settings, present = this.opts.mode === 'present';
    const g = new THREE.Group(); g.matrixAutoUpdate = false; g.matrix.copy(S.m); this.root.add(g);
    const fx = { group: g, items: [], videos: [], presence: present ? 0 : 1, textPresence: present ? 0 : 1 };
    const minZ = (this.info[i] && this.info[i].minZ) || 0, cz = Math.min(-.06, minZ - .12);
    const cardCol = slide.cardColor || th.card;
    if (st.frame === 'kaart') {
      const card = new THREE.Mesh(new THREE.ShapeGeometry(roundRectShape(FW3 + .7, FH3 + .7, .35), 6), new THREE.MeshBasicMaterial({ color: cardCol, side: THREE.DoubleSide, transparent: true, opacity: .97 }));
      card.position.z = cz; g.add(card); fx.card = card;
    }
    if ((st.frame === 'kaart' && th.edge) || (st.frame === 'rand' && present)) {
      const pts = roundRectShape(FW3 + .7, FH3 + .7, .35).getPoints(10).map(p => new THREE.Vector3(p.x, p.y, cz + .01));
      const ed = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: th.edge || th.line, transparent: true, opacity: .8 }));
      g.add(ed); fx.edge = ed; fx.edgeBase = st.frame === 'rand' ? .55 : .8;
    }
    // pick-vlak (onzichtbaar, voor klikken in editor en overzicht)
    const pick = new THREE.Mesh(new THREE.PlaneGeometry(FW3 + .7, FH3 + .7), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true, opacity: 0, side: THREE.DoubleSide }));
    pick.userData.station = i; g.add(pick); fx.pick = pick;
    const halo = st.frame === 'kaart' ? cardCol : th.mid;
    slide.items.forEach((it, ii) => {
      const [lx, ly] = framePxToLocal(it.x + it.w / 2, it.y + it.h / 2);
      if (it.type === 'text') {
        const t = textTexture(it, it.color || th.text, halo);
        const m = new THREE.MeshBasicMaterial({ map: t.tex, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(t.w * U, t.h * U), m);
        const [tx, ty] = framePxToLocal(it.x + t.w / 2, it.y + t.h / 2);
        mesh.position.set(tx, ty, .05 + ii * .002); mesh.rotation.z = -(it.rot || 0) * DEG; mesh.renderOrder = 10;
        g.add(mesh); fx.items.push({ kind: 'text', id: it.id, m, base: 1, alpha: present ? 0 : 1 });
      } else if (it.type === 'image' && resolveSrc(this.doc, it.src)) {
        const m = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
        new THREE.TextureLoader().load(resolveSrc(this.doc, it.src), tex => { tex.colorSpace = THREE.SRGBColorSpace; m.map = tex; m.needsUpdate = true; if (this.onAsync) this.onAsync(); }, undefined, () => {});
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(it.w * U, it.h * U), m);
        mesh.position.set(lx, ly, .03 + ii * .002); mesh.rotation.z = -(it.rot || 0) * DEG; mesh.renderOrder = 3;
        g.add(mesh); fx.items.push({ kind: 'media', id: it.id, m, base: it.opacity ?? 1, alpha: present ? 0 : 1 });
      } else if (it.type === 'video') {
        const m = new THREE.MeshBasicMaterial({ map: videoPlaceholder(it), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
        m.userData.sharedMap = true;
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(it.w * U, it.h * U), m);
        mesh.position.set(lx, ly, .03 + ii * .002); mesh.rotation.z = -(it.rot || 0) * DEG; mesh.renderOrder = 3;
        g.add(mesh); fx.items.push({ kind: 'media', id: it.id, m, base: 1, alpha: present ? 0 : 1 });
        const vd = { it, mesh, m, station: i, src: it.kind === 'youtube' ? it.src : resolveSrc(this.doc, it.src) };
        mesh.userData.video = vd;
        fx.videos.push(vd);
        posterFor(vd, tex => { if (!vd.playing) { m.map = tex; m.needsUpdate = true; if (this.onAsync) this.onAsync(); } });
      }
    });
    this.stationFx.push(fx);
    this.applyStation(fx);
  }
  setStationAlpha(i, a) { const fx = this.stationFx[i]; if (!fx) return; fx.items.forEach(o => { o.alpha = a; }); this.applyStation(fx); }
  setItemAlpha(i, id, a) { const fx = this.stationFx[i]; if (!fx) return; const o = fx.items.find(x => x.id === id); if (o) o.alpha = a; }
  // Aanwezigheid (0..1): hoe dicht de camera bij deze dia is. De kaart verschijnt
  // pas als je aankomt; onderweg zie je alleen de lijnen.
  setPresence(i, p, tp) { const fx = this.stationFx[i]; if (!fx) return; fx.presence = p; fx.textPresence = tp ?? p; this.applyStation(fx); }
  applyStation(fx) {
    const p = fx.presence ?? 1, tp = fx.textPresence ?? p;
    fx.items.forEach(o => { const a = o.alpha * (o.kind === 'text' ? tp : p) * o.base; o.m.opacity = a; o.m.visible = a > .002; });
    if (fx.card) { fx.card.material.opacity = .97 * p; fx.card.visible = p > .003; const s = .95 + .05 * p; fx.card.scale.set(s, s, 1); }
    if (fx.edge) { fx.edge.material.opacity = (fx.edgeBase || .8) * p; fx.edge.visible = p > .003; }
  }
  buildEnvironment() {
    const th = this.theme, c = this.sceneCenter, R = this.sceneRadius;
    const rnd = mulberry(7);
    // stofjes / sterretjes voor diepte
    const n = th.dustOp > 0 ? (th.stars ? 1400 : 900) : 0, pos = new Float32Array(Math.max(1, n) * 3), col = new Float32Array(Math.max(1, n) * 3);
    const cc = new THREE.Color(th.dust), alt = [new THREE.Color('#ff5eb8'), new THREE.Color('#68e3d6'), new THREE.Color('#fff38c')];
    for (let k = 0; k < n; k++) {
      const r = R * (.4 + 1.6 * Math.cbrt(rnd())), a = rnd() * Math.PI * 2, b = Math.acos(2 * rnd() - 1);
      pos[k * 3] = c.x + r * Math.sin(b) * Math.cos(a); pos[k * 3 + 1] = c.y + r * Math.cos(b) * .7; pos[k * 3 + 2] = c.z + r * Math.sin(b) * Math.sin(a);
      const col1 = th.sparkle ? alt[k % 3] : cc; col[k * 3] = col1.r; col[k * 3 + 1] = col1.g; col[k * 3 + 2] = col1.b;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({ size: th.sparkle ? .55 : th.stars ? .22 : .16, map: th.sparkle ? this.texSpark : this.texDot, vertexColors: true, transparent: true, opacity: th.dustOp, depthWrite: false, sizeAttenuation: true, blending: th.stars || th.sparkle ? THREE.AdditiveBlending : THREE.NormalBlending });
    m.userData = { sharedMap: true };
    this.dust = new THREE.Points(g, m); this.root.add(this.dust);
    if (th.stars) {
      const sn = 1800, sp = new Float32Array(sn * 3);
      for (let k = 0; k < sn; k++) { const a = rnd() * Math.PI * 2, b = Math.acos(2 * rnd() - 1), r = 900; sp[k * 3] = r * Math.sin(b) * Math.cos(a); sp[k * 3 + 1] = r * Math.cos(b); sp[k * 3 + 2] = r * Math.sin(b) * Math.sin(a); }
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
      const smat = new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, color: 0xffffff, transparent: true, opacity: .85, fog: false, depthWrite: false });
      this.stars = new THREE.Points(sg, smat); this.stars.frustumCulled = false; this.root.add(this.stars);
    } else this.stars = null;
    if (th.grid) {
      const size = Math.max(300, R * 8);
      const grid = new THREE.GridHelper(size, Math.round(size / 6), th.grid, th.grid);
      grid.material.transparent = true; grid.material.opacity = .45; grid.material.depthWrite = false;
      grid.position.set(c.x, this.box.min.y - 7, c.z); this.root.add(grid);
    }
  }
  // Toon de lijn tot tijd s (Infinity = alles).
  setProgress(s) {
    this.progress = s;
    this.phases.forEach(ph => {
      let cnt;
      if (s >= ph.s1) cnt = ph.idxEnd[ph.n - 1];
      else if (s <= ph.s0) cnt = 0;
      else cnt = ph.idxEnd[this.indexAt(ph, s - ph.s0)];
      ph.geo.setDrawRange(0, cnt);
    });
  }
  indexAt(ph, ls) { // laatste index met S <= ls
    let lo = 0, hi = ph.n - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (ph.S[mid] <= ls) lo = mid; else hi = mid - 1; }
    return lo;
  }
  phaseAt(s) {
    for (let k = 0; k < this.phases.length; k++) if (s <= this.phases[k].s1 || k === this.phases.length - 1) return this.phases[k];
    return null;
  }
  // Positie (en kleur) van de pen op tijd s
  penAt(s, out, colOut) {
    const ph = this.phaseAt(s); if (!ph) return false;
    const ls = clamp(s - ph.s0, 0, ph.len), k = this.indexAt(ph, ls), k2 = Math.min(ph.n - 1, k + 1);
    const span = ph.S[k2] - ph.S[k], t = span > 1e-9 ? clamp((ls - ph.S[k]) / span, 0, 1) : 0;
    out.set(lerp(ph.P[k * 3], ph.P[k2 * 3], t), lerp(ph.P[k * 3 + 1], ph.P[k2 * 3 + 1], t), lerp(ph.P[k * 3 + 2], ph.P[k2 * 3 + 2], t));
    if (colOut) colOut.setRGB(ph.C[k2 * 3], ph.C[k2 * 3 + 1], ph.C[k2 * 3 + 2]);
    return true;
  }
  // Stationsweergave voor de camera
  fitDist(aspect) { const t = Math.tan(FOV * DEG / 2); return Math.max((FH3 / 2) / t, (FW3 / 2) / (t * aspect)) * 1.16; }
  stationPose(i, extra) {
    const S = this.stations[i], sl = this.doc.slides[i]; if (!S) return null;
    extra = extra || {};
    const yaw = ((extra.noSlideCam ? 0 : sl.camYaw) + (extra.yaw || 0)) * DEG, pitch = ((extra.noSlideCam ? 0 : sl.camPitch) + (extra.pitch || 0)) * DEG;
    const q = S.q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitch, yaw, 0, 'YXZ')));
    const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const d = this.fitDist(this.camera.aspect) * S.scale * (extra.noSlideCam ? 1 : sl.camZoom) * (extra.zoom || 1);
    const target = S.center.clone();
    if (extra.offset) target.add(extra.offset);
    return { pos: S.center.clone().addScaledVector(dir, d), target, up };
  }
  overviewPose(angle) {
    const R = this.sceneRadius, d = R / Math.sin(FOV * DEG / 2) * (this.camera.aspect < 1 ? 1.5 : 1.02);
    const a = angle || 0;
    const dir = new THREE.Vector3(Math.sin(a) * .82, .42, Math.cos(a) * .82).normalize();
    return { pos: this.sceneCenter.clone().addScaledVector(dir, d), target: this.sceneCenter.clone(), up: new THREE.Vector3(0, 1, 0) };
  }
  applyPose(p) { this.camera.position.copy(p.pos); this.camera.up.copy(p.up); this.camera.lookAt(p.target); }
  resize(w, h) {
    if (!w || !h) return;
    this.w = w; this.h = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  updateFog() {
    const d = this.camera.position.distanceTo(this.sceneCenter), R = this.sceneRadius, f = this.theme.fog || 1;
    this.scene.fog.near = Math.max(18, (d - R) * .9) * Math.min(1, f);
    this.scene.fog.far = (d + R * 1.3) * f + 30;
    this.sky.position.copy(this.camera.position);
    if (this.stars) this.stars.position.copy(this.camera.position);
  }
  render() { this.updateFog(); this.renderer.render(this.scene, this.camera); }
  // ── editor-hulp ──
  updateFrames() {
    if (this.frames) { this.frames.forEach(f => { f.parent && f.parent.remove(f); f.geometry.dispose(); f.material.dispose(); }); }
    this.frames = [];
    if (this.opts.mode !== 'edit') return;
    this.stationFx.forEach((fx, i) => {
      const sel = i === this.selected;
      const pts = [[-8, -4.5], [8, -4.5], [8, 4.5], [-8, 4.5]].map(p => new THREE.Vector3(p[0] * 1.03, p[1] * 1.05, .02));
      const ln = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: sel ? 0xff5eb8 : 0x9a8cc0, transparent: true, opacity: sel ? 1 : .55, depthTest: !sel }));
      ln.renderOrder = 5; fx.group.add(ln); this.frames.push(ln);
    });
  }
  pickStation(ndcX, ndcY) {
    this.scene.updateMatrixWorld();
    const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const hits = rc.intersectObjects(this.stationFx.map(f => f.pick), false);
    return hits.length ? hits[0].object.userData.station : -1;
  }
  // Schermrechthoek van het frame van station i (voor de dia-editor).
  frameRect(i) {
    const S = this.stations[i]; if (!S) return null;
    const a = new THREE.Vector3(-8, 4.5, 0).applyMatrix4(S.m).project(this.camera);
    const b = new THREE.Vector3(8, -4.5, 0).applyMatrix4(S.m).project(this.camera);
    const x0 = (a.x + 1) / 2 * this.w, y0 = (1 - a.y) / 2 * this.h, x1 = (b.x + 1) / 2 * this.w, y1 = (1 - b.y) / 2 * this.h;
    return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
  }
  dispose() {
    this.clearRoot();
    this.sky.geometry.dispose(); this.sky.material.dispose();
    [this.texGlow, this.texSpark, this.texDot, this.texShadow].forEach(t => t.dispose());
    this.renderer.dispose();
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Geluid: zacht krassen van de pen en een zucht bij het vliegen
// ═══════════════════════════════════════════════════════════════════════
class PenSound {
  constructor() { this.ctx = null; this.on = false; }
  ensure() {
    if (this.ctx) return true;
    const AC = G.AudioContext || G.webkitAudioContext; if (!AC) return false;
    const ctx = this.ctx = new AC();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0);
    let b = 0; for (let k = 0; k < d.length; k++) { const w = Math.random() * 2 - 1; b = (b + .02 * w) / 1.02; d[k] = w * .6 + b * 3; }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    this.filter = ctx.createBiquadFilter(); this.filter.type = 'bandpass'; this.filter.frequency.value = 2400; this.filter.Q.value = .9;
    this.gain = ctx.createGain(); this.gain.gain.value = 0;
    this.dest = ctx.createMediaStreamDestination ? ctx.createMediaStreamDestination() : null;
    src.connect(this.filter); this.filter.connect(this.gain); this.gain.connect(ctx.destination); if (this.dest) this.gain.connect(this.dest);
    src.start();
    return true;
  }
  update(mode, speed) {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    const t = this.ctx.currentTime;
    let g = 0, f = 2400;
    if (this.on && mode === 'draw') { g = clamp(speed / 14, 0, 1) * .07; f = 2200 + speed * 40; }
    else if (this.on && mode === 'travel') { g = clamp(speed / 30, 0, 1) * .09; f = 380 + speed * 22; }
    this.gain.gain.setTargetAtTime(g, t, .08);
    this.filter.frequency.setTargetAtTime(f, t, .1);
    this.filter.Q.setTargetAtTime(mode === 'travel' ? .6 : .9, t, .1);
  }
  stop() { if (this.ctx) { try { this.ctx.close(); } catch (e) {} this.ctx = null; } }
}

// ═══════════════════════════════════════════════════════════════════════
// Player: de presentatie
// ═══════════════════════════════════════════════════════════════════════
const PLAYER_CSS = `
.olp-player{position:fixed;inset:0;z-index:9000;background:#000;overflow:hidden;cursor:default;user-select:none;-webkit-user-select:none;font-family:'Outfit','DM Sans',system-ui,sans-serif}
.olp-player canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}
.olp-player.rec canvas{inset:auto;left:50%;top:50%;transform:translate(-50%,-50%);width:min(100vw,177.78vh);height:min(56.25vw,100vh)}
.olp-player.hide-cursor{cursor:none}
.olp-counter{position:absolute;right:22px;bottom:16px;font-size:13px;letter-spacing:.12em;opacity:.55;pointer-events:none;transition:opacity .4s}
.olp-bar{position:absolute;left:50%;bottom:18px;transform:translateX(-50%) translateY(8px);display:flex;gap:6px;padding:6px;border-radius:999px;background:rgba(20,16,40,.55);backdrop-filter:blur(10px);opacity:0;transition:opacity .3s,transform .3s;pointer-events:none}
.olp-bar.show{opacity:1;transform:translateX(-50%);pointer-events:auto}
.olp-bar button{all:unset;cursor:pointer;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;color:#fff;font-size:17px;line-height:1}
.olp-bar button:hover{background:rgba(255,255,255,.16)}
.olp-bar button.on{background:rgba(255,94,184,.55)}
.olp-blank{position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .35s}
.olp-hint{position:absolute;left:50%;top:22px;transform:translateX(-50%);padding:8px 16px;border-radius:999px;background:rgba(20,16,40,.6);color:#fff;font-size:13px;letter-spacing:.04em;opacity:0;transition:opacity .4s;pointer-events:none;white-space:nowrap}
.olp-hint.show{opacity:1}
.olp-jump{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:64px;color:#fff;text-shadow:0 2px 20px rgba(0,0,0,.5);pointer-events:none;opacity:0}
.olp-jump.show{opacity:1}
.olp-rec{position:absolute;left:18px;top:16px;display:flex;align-items:center;gap:8px;color:#fff;font-size:13px;padding:6px 12px;border-radius:999px;background:rgba(200,20,60,.75);pointer-events:none}
.olp-rec i{width:9px;height:9px;border-radius:50%;background:#fff;animation:olpblink 1s infinite}
@keyframes olpblink{50%{opacity:.2}}
.olp-help{position:absolute;inset:0;display:none;place-items:center;background:rgba(10,8,25,.55);backdrop-filter:blur(4px)}
.olp-help.show{display:grid}
.olp-help div{background:rgba(255,255,255,.95);color:#2a1458;border-radius:18px;padding:22px 28px;font-size:14px;line-height:1.75;min-width:300px;box-shadow:0 20px 60px rgba(0,0,0,.35)}
.olp-help b{display:inline-block;min-width:110px;color:#ff5eb8}
.olp-media{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.olp-media-el{position:absolute;left:0;top:0;transform-origin:0 0;border:0;background:#000;pointer-events:auto;opacity:0}
.olp-media video.olp-media-el{object-fit:contain;cursor:pointer}
.olp-media-el iframe{width:100%;height:100%;border:0;display:block}
`;
let cssInjected = false;
function injectPlayerCSS() { if (cssInjected) return; cssInjected = true; const s = document.createElement('style'); s.textContent = PLAYER_CSS; document.head.appendChild(s); }

class Player {
  constructor(doc, opts) {
    injectPlayerCSS();
    this.opts = Object.assign({ startAt: 0, standalone: false, onExit: null, record: false }, opts || {});
    this.el = document.createElement('div'); this.el.className = 'olp-player';
    this.canvas = document.createElement('canvas'); this.el.appendChild(this.canvas);
    this.blankEl = document.createElement('div'); this.blankEl.className = 'olp-blank'; this.el.appendChild(this.blankEl);
    this.counterEl = document.createElement('div'); this.counterEl.className = 'olp-counter'; this.el.appendChild(this.counterEl);
    this.hintEl = document.createElement('div'); this.hintEl.className = 'olp-hint'; this.el.appendChild(this.hintEl);
    this.jumpEl = document.createElement('div'); this.jumpEl.className = 'olp-jump'; this.el.appendChild(this.jumpEl);
    this.helpEl = document.createElement('div'); this.helpEl.className = 'olp-help';
    this.helpEl.innerHTML = `<div><b>→ spatie klik</b> volgende<br><b>←</b> vorige (lijn tekent opnieuw)<br><b>O</b> overzicht van de hele lijn<br><b>slepen</b> om de tekening heen kijken<br><b>3 Enter</b> naar dia 3<br><b>Home / End</b> eerste / laatste<br><b>A</b> 3D-bril (rood/cyaan)<br><b>M</b> geluid aan/uit<br><b>K</b> video afspelen / pauzeren<br><b>B / W</b> zwart / wit scherm<br><b>F</b> volledig scherm<br><b>Esc</b> stoppen</div>`;
    this.el.appendChild(this.helpEl);
    this.bar = document.createElement('div'); this.bar.className = 'olp-bar';
    const btn = (txt, title, fn) => { const b = document.createElement('button'); b.textContent = txt; b.title = title; b.addEventListener('click', e => { e.stopPropagation(); fn(); this.wake(); }); this.bar.appendChild(b); return b; };
    btn('◀', 'Vorige (←)', () => this.prev());
    btn('▶', 'Volgende (→)', () => this.next());
    this.btnOverview = btn('⊙', 'Overzicht (O)', () => this.toggleOverview());
    this.btnAna = btn('👓', '3D-bril rood/cyaan (A)', () => this.toggleAnaglyph());
    this.btnSound = btn('♪', 'Geluid (M)', () => this.toggleSound());
    btn('⛶', 'Volledig scherm (F)', () => this.toggleFullscreen());
    btn('?', 'Sneltoetsen', () => this.helpEl.classList.toggle('show'));
    btn('✕', 'Stoppen (Esc)', () => this.exit());
    this.el.appendChild(this.bar);
    this.world = new World(this.canvas, { mode: 'present' });
    this.world.setDoc(doc);
    this.doc = this.world.doc;
    this.sound = new PenSound(); this.sound.on = this.doc.settings.sound;
    this.btnSound.classList.toggle('on', this.sound.on);
    this.N = this.doc.slides.length;
    this.s = 0; this.cur = -1; this.state = 'start';
    this.cam = null; this.time = 0; this.user = { yaw: 0, pitch: 0, zoom: 1 }; this.mouse = { x: 0, y: 0 };
    this.anaglyph = false; this.typed = ''; this.pen = new THREE.Vector3(); this.penCol = new THREE.Color();
    this.buildPen();
    this.handlers = [];
  }
  mount(parent) {
    (parent || document.body).appendChild(this.el);
    if (this.opts.record) this.el.classList.add('rec');
    this.onResize(); this.bind(); this.setupMedia();
    const startAt = clamp(this.opts.startAt | 0, 0, Math.max(0, this.N - 1));
    if (!this.N) { this.hint('Deze presentatie heeft nog geen dia’s', 3000); }
    else if (startAt > 0) {
      const ph = this.world.phases[this.world.info[startAt].draw];
      this.s = ph.s0; this.cur = startAt; this.state = 'draw-wait';
      this.cam = this.world.stationPose(startAt); this.setCamNow(this.cam);
      this.syncTexts(true);
      this.startDraw(startAt);
    } else if (this.doc.settings.intro && this.world.phases[0] && this.world.phases[0].kind === 'intro') {
      this.cam = this.world.overviewPose(.5); this.setCamNow(this.cam);
      this.state = 'opening'; this.openT = 0;
    } else {
      this.cam = this.world.stationPose(0); this.setCamNow(this.cam);
      this.cur = 0; this.startDraw(0);
    }
    this.counter();
    this.last = performance.now();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
    this.wake();
    if (this.opts.record) this.startRecording();
    else if (this.N) this.hint(this.opts.standalone ? 'Klik of → om verder te gaan  ·  O = overzicht  ·  ? = sneltoetsen' : 'Klik of → om verder te gaan  ·  Esc = stoppen', 3500);
  }
  buildPen() {
    const w = this.world, r = w.lineRadius();
    this.lightWorld = new THREE.Color(w.theme.mid).getHSL({}).l > .45 && w.lineStyle() !== 'neon';
    this.penMesh = new THREE.Mesh(new THREE.SphereGeometry(r * 1.7, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.penGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: w.texGlow, color: 0xffffff, transparent: true, depthWrite: false, blending: w.theme.stars || w.lineStyle() === 'neon' ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: .8 }));
    this.penGlow.scale.setScalar(r * 22);
    w.scene.add(this.penMesh); w.scene.add(this.penGlow);
    // vonkjes
    const n = 260; this.sparkN = n; this.sparkI = 0;
    const g = new THREE.BufferGeometry();
    this.spPos = new Float32Array(n * 3); this.spVel = new Float32Array(n * 3); this.spLife = new Float32Array(n); this.spSize = new Float32Array(n); this.spCol = new Float32Array(n * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.spPos, 3)); g.setAttribute('aLife', new THREE.BufferAttribute(this.spLife, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.spSize, 1)); g.setAttribute('color', new THREE.BufferAttribute(this.spCol, 3));
    this.sparkMat = particleMaterial(w.texSpark);
    if (!(w.theme.stars || w.lineStyle() === 'neon')) this.sparkMat.blending = THREE.NormalBlending;
    this.sparks = new THREE.Points(g, this.sparkMat); this.sparks.frustumCulled = false; w.scene.add(this.sparks);
  }
  bind() {
    const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); this.handlers.push([t, ev, fn, o]); };
    on(window, 'resize', () => this.onResize());
    on(document, 'keydown', e => this.onKey(e), true);
    on(this.el, 'mousemove', e => { this.mouse.x = e.clientX / innerWidth * 2 - 1; this.mouse.y = e.clientY / innerHeight * 2 - 1; this.wake(); });
    let down = null;
    on(this.el, 'pointerdown', e => { if (e.target.closest('.olp-bar,.olp-media-el')) return; down = { x: e.clientX, y: e.clientY, yaw: this.user.yaw, pitch: this.user.pitch, moved: false, t: performance.now() }; this.dragging = false; });
    on(window, 'pointermove', e => {
      if (!down) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (Math.hypot(dx, dy) > 6) { down.moved = true; this.dragging = true; }
      if (down.moved) { this.user.yaw = clamp(down.yaw - dx * .18, -75, 75); this.user.pitch = clamp(down.pitch + dy * .14, -55, 55); }
    });
    on(window, 'pointerup', e => {
      if (!down) return;
      const d = down; down = null; this.dragging = false;
      if (e.target.closest && e.target.closest('.olp-bar,.olp-help')) { if (e.target.closest('.olp-help')) this.helpEl.classList.remove('show'); return; }
      if (d.moved) {
        // vegen op touch
        const dx = e.clientX - d.x;
        if (e.pointerType === 'touch' && Math.abs(dx) > 80 && performance.now() - d.t < 450) { this.user.yaw = d.yaw; dx < 0 ? this.next() : this.prev(); }
        return;
      }
      if (this.state === 'overview') { const i = this.pickAt(e.clientX, e.clientY); if (i >= 0) this.goTo(i); else this.toggleOverview(); return; }
      const vh = this.videoAt(e.clientX, e.clientY);
      if (vh) { this.toggleVideo(vh); return; }
      if (e.button === 0) this.next();
    });
    on(this.el, 'wheel', e => { e.preventDefault(); this.user.zoom = clamp(this.user.zoom * (e.deltaY > 0 ? 1.08 : 1 / 1.08), .35, 3); }, { passive: false });
    on(this.el, 'contextmenu', e => { e.preventDefault(); this.prev(); });
    on(document, 'fullscreenchange', () => { if (!document.fullscreenElement && this.wasFull && !this.opts.standalone) this.exit(); this.wasFull = !!document.fullscreenElement; });
  }
  pickAt(x, y) {
    const r = this.canvas.getBoundingClientRect();
    return this.world.pickStation((x - r.left) / r.width * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  }
  onResize() {
    if (this.opts.record) { this.world.renderer.setPixelRatio(1); this.world.resize(1920, 1080); }
    else this.world.resize(this.el.clientWidth || innerWidth, this.el.clientHeight || innerHeight);
    this.sparkMat.uniforms.uScale.value = this.world.h * this.world.renderer.getPixelRatio() / (2 * Math.tan(FOV * DEG / 2));
    if (this.anaRT) this.makeAnaglyphTargets();
  }
  wake() {
    this.bar.classList.add('show'); this.el.classList.remove('hide-cursor');
    clearTimeout(this.wakeT);
    this.wakeT = setTimeout(() => { this.bar.classList.remove('show'); this.el.classList.add('hide-cursor'); }, 2200);
  }
  hint(txt, ms) { this.hintEl.textContent = txt; this.hintEl.classList.add('show'); clearTimeout(this.hintT); this.hintT = setTimeout(() => this.hintEl.classList.remove('show'), ms || 2000); }
  counter() {
    const th = this.world.theme, dark = new THREE.Color(th.mid).getHSL({}).l < .45;
    this.counterEl.style.color = dark ? '#fff' : '#2a1458';
    this.counterEl.textContent = this.N ? `${Math.max(1, this.cur + 1)} / ${this.N}` : '';
    this.counterEl.style.opacity = this.opts.record ? 0 : .5;
  }
  onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    let handled = true;
    if (/^[0-9]$/.test(k)) { this.typed = (this.typed + k).slice(-3); this.jumpEl.textContent = this.typed; this.jumpEl.classList.add('show'); clearTimeout(this.typedT); this.typedT = setTimeout(() => { this.typed = ''; this.jumpEl.classList.remove('show'); }, 2500); }
    else if (k === 'Enter' && this.typed) { const n = parseInt(this.typed, 10) - 1; this.typed = ''; this.jumpEl.classList.remove('show'); if (n >= 0 && n < this.N) this.goTo(n); }
    else if (k === 'ArrowRight' || k === ' ' || k === 'PageDown' || k === 'Enter' || k === 'ArrowDown') this.next();
    else if (k === 'ArrowLeft' || k === 'PageUp' || k === 'ArrowUp' || k === 'Backspace') this.prev();
    else if (k === 'Home') this.goTo(0);
    else if (k === 'End') this.goTo(this.N - 1);
    else if (k === 'o' || k === 'O') this.toggleOverview();
    else if (k === 'a' || k === 'A') this.toggleAnaglyph();
    else if (k === 'm' || k === 'M') this.toggleSound();
    else if (k === 'k' || k === 'K') this.toggleMedia();
    else if (k === 'b' || k === 'B') this.blank('#000');
    else if (k === 'w' || k === 'W') this.blank('#fff');
    else if (k === 'f' || k === 'F' || k === 'F11') this.toggleFullscreen();
    else if (k === '?' || k === 'h' || k === 'H' || k === 'F1') this.helpEl.classList.toggle('show');
    else if (k === 'Escape') { if (this.helpEl.classList.contains('show')) this.helpEl.classList.remove('show'); else if (this.state === 'overview') this.toggleOverview(); else this.exit(); }
    else handled = false;
    if (handled) { e.preventDefault(); e.stopPropagation(); }
  }
  blank(c) {
    const on = this.blankEl.style.opacity === '1' && this.blankEl.style.background === (c === '#000' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)');
    this.blankEl.style.background = c; this.blankEl.style.opacity = on ? '0' : '1';
  }
  toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else (this.el.requestFullscreen ? this.el.requestFullscreen() : Promise.reject()).then(() => { this.wasFull = true; }).catch(() => {});
  }
  toggleSound() {
    this.sound.on = !this.sound.on;
    if (this.sound.on) this.sound.ensure();
    this.btnSound.classList.toggle('on', this.sound.on);
    this.hint(this.sound.on ? 'Geluid aan' : 'Geluid uit', 1200);
  }
  toggleAnaglyph() {
    this.anaglyph = !this.anaglyph; this.btnAna.classList.toggle('on', this.anaglyph);
    if (this.anaglyph && !this.anaRT) this.makeAnaglyphTargets();
    this.hint(this.anaglyph ? '3D-bril aan: zet een rood/cyaan brilletje op' : '3D-bril uit', 2200);
  }
  makeAnaglyphTargets() {
    const w = this.world.renderer, pr = w.getPixelRatio(), W = Math.max(2, this.world.w * pr), H = Math.max(2, this.world.h * pr);
    if (this.anaRT) { this.anaRT[0].setSize(W, H); this.anaRT[1].setSize(W, H); return; }
    this.anaRT = [new THREE.WebGLRenderTarget(W, H, { samples: 4 }), new THREE.WebGLRenderTarget(W, H, { samples: 4 })];
    this.anaMat = new THREE.ShaderMaterial({
      uniforms: { tL: { value: this.anaRT[0].texture }, tR: { value: this.anaRT[1].texture } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `uniform sampler2D tL; uniform sampler2D tR; varying vec2 vUv;
        void main(){ vec4 l = texture2D(tL, vUv), r = texture2D(tR, vUv); float lum = dot(l.rgb, vec3(.299,.587,.114));
          gl_FragColor = vec4(lum, r.g, r.b, 1.0);
          #include <colorspace_fragment>
        }`, depthTest: false, depthWrite: false
    });
    this.anaScene = new THREE.Scene(); this.anaCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.anaMat); q.frustumCulled = false; this.anaScene.add(q);
    this.eye = new THREE.PerspectiveCamera();
  }
  // ── tijdlijn ──
  phaseOf(i, kind) { const inf = this.world.info[i]; if (!inf) return null; const k = kind === 'draw' ? inf.draw : inf.travel; return k >= 0 ? this.world.phases[k] : null; }
  // Eén pen, één tempo: vliegen gaat met dezelfde pen als tekenen, alleen iets vlotter.
  penSpeed() { return 4 * Math.pow(1.3, this.doc.settings.drawSpeed - 1); }
  drawDuration(ph) { return clamp(ph.len / this.penSpeed(), 1.2, 18); }
  travelDuration(ph) { const k = 1.6 * Math.pow(1.15, this.doc.settings.travelSpeed - 5); return clamp(ph.len / (this.penSpeed() * k), 1.2, 7); }
  startDraw(i) {
    const ph = this.phaseOf(i, 'draw'); if (!ph) return;
    this.cur = i; this.counter();
    this.anim = { kind: 'draw', i, s0: ph.s0, s1: ph.s1, dur: this.drawDuration(ph), t: 0 };
    this.state = 'drawing'; this.user.yaw = this.user.pitch = 0;
  }
  startTravel(i) {
    const ph = this.phaseOf(i, 'travel'); if (!ph) { this.startDraw(i + 1); return; }
    this.anim = { kind: 'travel', i, s0: ph.s0, s1: ph.s1, dur: this.travelDuration(ph), t: 0, from: this.snapPose(), to: i + 1 };
    this.state = 'travel'; this.user.yaw = this.user.pitch = 0; this.user.zoom = 1;
  }
  snapPose() { return { pos: this.camera().position.clone(), target: this.camTarget.clone(), up: this.camera().up.clone() }; }
  camera() { return this.world.camera; }
  next() {
    this.helpEl.classList.remove('show');
    if (!this.N) return;
    if (this.state === 'opening') { this.startIntro(); return; }
    if (this.state === 'intro') { this.anim.t = this.anim.dur; return; }
    if (this.state === 'drawing') { this.anim.t = this.anim.dur; return; }        // meteen af
    if (this.state === 'travel' || this.state === 'seek') { this.anim.t = this.anim.dur; return; }
    if (this.state === 'overview') { this.toggleOverview(); return; }
    if (this.state === 'idle') {
      // staat er een video op de dia: eerst die starten
      const pend = this.pendingMedia(this.cur);
      if (pend.length) { pend.forEach(v => this.playVideo(v)); this.hint('Video speelt — nog een keer verder = volgende dia', 2200); return; }
      this.pauseAll();
      if (this.cur < this.N - 1) this.startTravel(this.cur);
      else this.startFinale();
      return;
    }
    if (this.state === 'outro') { this.anim.t = this.anim.dur; return; }
    if (this.state === 'end') { if (this.opts.standalone) this.restart(); else this.exit(); }
  }
  prev() {
    this.helpEl.classList.remove('show');
    if (!this.N) return;
    if (this.state === 'end' || this.state === 'outro') { this.goTo(this.N - 1); return; }
    if (this.state === 'opening' || this.state === 'intro') { this.goTo(0); return; }
    // onderweg: terug naar de dia die je net verliet; anders de vorige dia
    if (this.state === 'travel') { this.goTo(this.cur); return; }
    this.goTo(Math.max(0, this.cur - 1));
  }
  goTo(i) {
    if (!this.N) return;
    this.pauseAll();
    i = clamp(i, 0, this.N - 1);
    const ph = this.phaseOf(i, 'draw');
    this.overviewOn = false; this.btnOverview.classList.remove('on');
    this.anim = { kind: 'seek', i, sFrom: this.s, s0: this.s, s1: ph.s0, dur: clamp(Math.abs(ph.s0 - this.s) / 60, .9, 2.4), t: 0, from: this.snapPose() };
    this.state = 'seek'; this.cur = i; this.counter(); this.user.yaw = this.user.pitch = 0; this.user.zoom = 1;
  }
  restart() { this.hideEnd(); this.goTo(0); }
  startIntro() {
    const ph = this.world.phases[0];
    this.anim = { kind: 'intro', s0: ph.s0, s1: ph.s1, dur: clamp(ph.len / 7, 2.2, 4.5), t: 0, from: this.snapPose(), to: 0 };
    this.state = 'intro'; this.cur = 0; this.counter();
  }
  startFinale() {
    const ph = this.world.phases[this.world.phases.length - 1];
    if (ph && ph.kind === 'outro') { this.anim = { kind: 'outro', s0: ph.s0, s1: ph.s1, dur: clamp(ph.len / 8, 2, 4), t: 0, from: this.snapPose() }; this.state = 'outro'; }
    else { this.anim = null; this.state = 'end'; this.endT = 0; this.showEnd(); }
  }
  showEnd() { this.hint(this.opts.standalone ? 'Einde — klik om opnieuw te beginnen' : 'Einde — klik of Esc om af te sluiten', 4000); }
  hideEnd() {}
  toggleOverview() {
    if (this.state === 'overview') {
      this.state = this.prevState || 'idle'; this.overviewOn = false; this.btnOverview.classList.remove('on');
      if (this.state === 'drawing' || this.state === 'travel' || this.state === 'seek' || this.state === 'intro' || this.state === 'outro') this.paused = false;
      return;
    }
    if (this.state === 'opening') { this.startIntro(); return; }
    this.prevState = this.state; this.state = 'overview'; this.overviewOn = true; this.btnOverview.classList.add('on');
    this.ovAngle = this.overviewAngleFromCamera();
    this.hint('Overzicht — klik op een tekening om erheen te vliegen', 2500);
  }
  overviewAngleFromCamera() { const d = this.camera().position.clone().sub(this.world.sceneCenter); return Math.atan2(d.x, d.z); }
  // ── frame-update ──
  loop(now) {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(.05, Math.max(0, (now - this.last) / 1000)); this.last = now; this.time += dt;
    this.update(dt);
    this.renderFrame();
  }
  update(dt) {
    const w = this.world, st = this.doc.settings;
    let desired = null, penMode = 'idle', sPrev = this.s;
    const a = this.anim;
    if (this.state === 'overview') {
      this.ovAngle += dt * .07;
      desired = w.overviewPose(this.ovAngle);
      desired.pos.addScaledVector(desired.pos.clone().sub(desired.target), this.user.zoom - 1);
    } else if (this.state === 'opening') {
      this.openT += dt;
      desired = w.overviewPose(.5 + this.openT * .05);
      if (st.autoplay > 0 || this.opts.record) { if (this.openT > 1.6) this.startIntro(); }
    } else if (a) {
      a.t = Math.min(a.dur, a.t + dt);
      const u = a.t / a.dur;
      if (a.kind === 'draw') {
        const e = u * .8 + smooth(u) * .2;
        this.s = lerp(a.s0, a.s1, e); penMode = 'draw';
        desired = this.drawCamPose(a.i, u);
        if (a.t >= a.dur) { this.s = a.s1; this.anim = null; this.state = 'idle'; this.idleT = 0; }
      } else if (a.kind === 'travel' || a.kind === 'intro') {
        const e = travelEase(u);
        this.s = lerp(a.s0, a.s1, e); penMode = 'travel';
        desired = this.travelPose(a, u);
        if (a.t >= a.dur) { this.s = a.s1; this.startDraw(a.to); }
      } else if (a.kind === 'seek') {
        const e = easeIO(u);
        this.s = lerp(a.s0, a.s1, e); penMode = 'travel';
        const to = w.stationPose(a.i);
        desired = this.swoop(a.from, to, e, 1.25);
        if (a.t >= a.dur) { this.s = a.s1; this.startDraw(a.i); }
      } else if (a.kind === 'outro') {
        const e = easeSine(u);
        this.s = lerp(a.s0, a.s1, e); penMode = 'travel';
        const ov = w.overviewPose(this.overviewAngleStart ?? (this.overviewAngleStart = this.overviewAngleFromCamera()));
        desired = this.swoop(a.from, ov, easeIO(u), .4);
        if (a.t >= a.dur) { this.s = a.s1; this.anim = null; this.state = 'end'; this.endT = 0; this.ovAngle = this.overviewAngleStart; this.showEnd(); }
      }
    } else if (this.state === 'idle') {
      this.idleT += dt;
      desired = this.drawCamPose(this.cur, 1);
      if ((st.autoplay > 0 || this.opts.record) && this.idleT > (this.opts.record ? st.hold || 3 : st.autoplay)) this.next();
    } else if (this.state === 'end') {
      this.endT += dt; this.ovAngle = (this.ovAngle || 0) + dt * .06;
      desired = w.overviewPose(this.ovAngle);
      if (this.opts.record && this.endT > 4.5) this.stopRecording();
    }
    if (!desired) desired = this.cam || w.stationPose(Math.max(0, this.cur)) || w.overviewPose(0);
    // muis-parallax
    if (st.parallax && !this.opts.record && (this.state === 'idle' || this.state === 'drawing')) {
      const c = this.camera(), right = new THREE.Vector3().subVectors(desired.target, desired.pos).cross(desired.up).normalize();
      const d = desired.pos.distanceTo(desired.target) * .035;
      desired.pos.addScaledVector(right, this.mouse.x * d).addScaledVector(desired.up, -this.mouse.y * d * .6);
    }
    // gebruiker kijkt even om de tekening heen; daarna veert het terug
    if (!this.dragging && this.state !== 'overview') { this.user.yaw *= Math.exp(-dt * 1.6); this.user.pitch *= Math.exp(-dt * 1.6); }
    this.dampCam(desired, dt, this.state === 'travel' || this.state === 'intro' ? 3.6 : this.state === 'seek' ? 9 : 3.2);
    w.setProgress(this.s);
    // pen
    const moving = Math.abs(this.s - sPrev) / Math.max(dt, 1e-4);
    const showPen = this.N > 0 && this.state !== 'opening' && this.s > 0;
    if (showPen && w.penAt(this.s, this.pen, this.penCol)) {
      this.penMesh.visible = this.penGlow.visible = true;
      this.penMesh.position.copy(this.pen); this.penGlow.position.copy(this.pen);
      const pulse = penMode === 'idle' ? 1 + Math.sin(this.time * 3) * .25 : 1.15;
      this.penGlow.scale.setScalar(w.lineRadius() * 22 * pulse * (this.state === 'end' ? 2.2 : 1));
      if (this.lightWorld) {
        // lichte wereld: een zachte gekleurde halo i.p.v. wit licht
        this.penMesh.material.color.copy(this.penCol); this.penGlow.material.color.copy(this.penCol);
        this.penGlow.material.opacity = .28;
      } else {
        const c = this.penCol.clone().lerp(new THREE.Color(1, 1, 1), .35);
        this.penMesh.material.color.copy(c); this.penGlow.material.color.copy(c);
      }
      if (st.sparkles && moving > .5) this.emitSparks(dt, moving);
    } else { this.penMesh.visible = this.penGlow.visible = false; }
    this.updateSparks(dt);
    // spookspoor
    const wide = this.state === 'overview' || this.state === 'opening' || this.state === 'end';
    const ghostTarget = st.ghost ? (wide ? .3 : .07) : (this.state === 'end' || this.state === 'overview' ? .18 : 0);
    this.ghostA = lerp(this.ghostA || 0, ghostTarget, 1 - Math.exp(-dt * 3));
    w.phases.forEach(ph => { if (ph.ghost) { ph.ghost.material.opacity = this.ghostA; ph.ghost.visible = this.ghostA > .005; } });
    this.syncTexts(false, dt);
    this.updatePresence(dt);
    this.updateMedia();
    // wereldtint per dia
    this.updateTint(dt);
    this.sound.update(penMode === 'idle' ? 'idle' : penMode, moving);
  }
  // Teksten verschijnen als de dia af is; een afbeelding of video zodra de
  // pen zijn kader heeft getekend.
  syncTexts(instant, dt) {
    const w = this.world, fin = 1 - Math.exp(-(dt || 0) * 2.6), fout = 1 - Math.exp(-(dt || 0) * 8);
    w.info.forEach((inf, i) => {
      const fx = w.stationFx[i]; if (!fx) return;
      const done = this.s >= w.phases[inf.draw].s1 - 1e-4;
      fx.items.forEach(o => {
        const rs = o.kind === 'media' && inf.reveal && inf.reveal[o.id] != null ? inf.reveal[o.id] : null;
        const target = rs != null ? (this.s >= rs - 1e-4 ? 1 : 0) : (done ? 1 : 0);
        o.alpha = instant || Math.abs(o.alpha - target) < .003 ? target : lerp(o.alpha, target, target ? fin : fout);
      });
      w.applyStation(fx);
    });
  }
  updatePresence(dt) {
    const w = this.world, cam = this.camera(), fwd = cam.getWorldDirection(new THREE.Vector3()), to = new THREE.Vector3();
    const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    w.stations.forEach((S, i) => {
      const fx = w.stationFx[i]; if (!fx) return;
      const Dd = w.fitDist(cam.aspect) * S.scale * (this.doc.slides[i].camZoom || 1);
      to.copy(S.center).sub(cam.position);
      const dist = to.length(); to.normalize();
      const front = to.clone().negate().dot(S.normal);
      const p = sm(2.1, 1.3, dist / Dd) * sm(.8, .96, fwd.dot(to)) * sm(.15, .45, front);
      const cur = fx.presence ?? 0, k = 1 - Math.exp(-dt * 5);
      // de tekst van de laatste dia blijft in beeld tijdens het slotshot
      const tpT = (this.state === 'outro' || this.state === 'end') && i === this.N - 1 ? 1 : p, tpc = fx.textPresence ?? 0;
      w.setPresence(i, Math.abs(p - cur) < .002 ? p : lerp(cur, p, k), Math.abs(tpT - tpc) < .002 ? tpT : lerp(tpc, tpT, k));
    });
  }
  updateTint(dt) {
    const w = this.world, slides = this.doc.slides;
    let col = w.baseMid.clone();
    const i = clamp(this.cur, 0, this.N - 1);
    if (this.N && slides[i] && slides[i].tint && this.state !== 'end' && this.state !== 'overview') col = new THREE.Color(slides[i].tint);
    this.tintCol = this.tintCol || w.baseMid.clone();
    this.tintCol.lerp(col, 1 - Math.exp(-dt * 1.5));
    w.sky.material.uniforms.uMid.value.copy(this.tintCol);
    w.scene.fog.color.copy(this.tintCol);
  }
  drawCamPose(i, u) {
    const w = this.world, sl = this.doc.slides[i], st = this.doc.settings;
    let yaw = this.user.yaw, pitch = this.user.pitch;
    const t = this.time;
    if (sl.motion === 'zweven') { yaw += Math.sin(t * .23) * 4; pitch += Math.sin(t * .17) * 2.2; }
    else if (sl.motion === 'rondje') { yaw += Math.sin(t * .25) * 17; pitch += Math.sin(t * .17) * 5; }
    let zoom = this.user.zoom, offset = null;
    if (this.state === 'drawing' && st.drawCam !== 'rustig' && this.pen) {
      const S = w.stations[i];
      const rel = this.pen.clone().sub(S.center);
      if (st.drawCam === 'meekijken') { offset = rel.multiplyScalar(.16); }
      else if (st.drawCam === 'inzoomen') { const f = 1 - smooth(clamp(u / .75, 0, 1)); offset = rel.multiplyScalar(.85 * f); zoom *= lerp(1, .42, f); }
    }
    return w.stationPose(i, { yaw, pitch, zoom, offset });
  }
  travelPose(a, u) {
    const w = this.world, st = this.doc.settings;
    const to = w.stationPose(a.to);
    const e = easeIO(u);
    if (st.travelCam === 'direct') return this.lerpPose(a.from, to, e);
    if (st.travelCam === 'zweven') return this.swoop(a.from, to, e, .55);
    // volgen: achter de pen aan vliegen
    const base = this.swoop(a.from, to, e, .3);
    const p = new THREE.Vector3(), q = new THREE.Vector3(), r = new THREE.Vector3();
    w.penAt(this.s, p); w.penAt(this.s + 2.2, q); w.penAt(Math.max(a.s0, this.s - 2.2), r);
    const tan = q.clone().sub(r); if (tan.lengthSq() < 1e-6) tan.copy(to.target).sub(a.from.target);
    tan.normalize();
    const back = clamp(w.fitDist(w.camera.aspect) * .85, 6, 16);
    const up = base.up.clone();
    const chase = { pos: p.clone().addScaledVector(tan, -back).addScaledVector(up, back * .3), target: p.clone().addScaledVector(tan, back * .45), up };
    const wgt = Math.pow(Math.sin(Math.PI * clamp((u - .05) / .9, 0, 1)), .8) * .5;
    return this.lerpPose(base, chase, wgt);
  }
  lerpPose(A, B, t) { return { pos: A.pos.clone().lerp(B.pos, t), target: A.target.clone().lerp(B.target, t), up: A.up.clone().lerp(B.up, t).normalize() }; }
  swoop(A, B, t, outF) {
    const P = this.lerpPose(A, B, t);
    const span = A.target.distanceTo(B.target) + A.pos.distanceTo(B.pos) * .3;
    const viewDir = A.pos.clone().sub(A.target).normalize().add(B.pos.clone().sub(B.target).normalize()).normalize();
    if (!isFinite(viewDir.x)) viewDir.set(0, 0, 1);
    P.pos.addScaledVector(viewDir, Math.sin(Math.PI * t) * span * outF);
    return P;
  }
  setCamNow(p) { this.camTarget = p.target.clone(); this.world.applyPose(p); }
  dampCam(p, dt, lam) {
    const c = this.camera(), f = 1 - Math.exp(-lam * dt);
    if (!this.camTarget) this.camTarget = p.target.clone();
    c.position.lerp(p.pos, f); this.camTarget.lerp(p.target, f);
    c.up.lerp(p.up, f).normalize(); c.lookAt(this.camTarget);
  }
  emitSparks(dt, speed) {
    this.sparkAcc = (this.sparkAcc || 0) + Math.min(speed, 40) * dt * 1.4;
    const n = Math.min(3, Math.floor(this.sparkAcc)); this.sparkAcc -= n;
    for (let k = 0; k < n; k++) {
      const i = this.sparkI = (this.sparkI + 1) % this.sparkN;
      this.spPos[i * 3] = this.pen.x; this.spPos[i * 3 + 1] = this.pen.y; this.spPos[i * 3 + 2] = this.pen.z;
      const r = this.world.lineRadius() * 16;
      this.spVel[i * 3] = (Math.random() - .5) * r; this.spVel[i * 3 + 1] = (Math.random() - .3) * r; this.spVel[i * 3 + 2] = (Math.random() - .5) * r;
      this.spLife[i] = 1; this.spSize[i] = this.world.lineRadius() * (3 + Math.random() * 5);
      const c = this.penCol.clone().lerp(new THREE.Color(1, 1, 1), Math.random() * .6);
      this.spCol[i * 3] = c.r; this.spCol[i * 3 + 1] = c.g; this.spCol[i * 3 + 2] = c.b;
    }
  }
  updateSparks(dt) {
    for (let i = 0; i < this.sparkN; i++) {
      if (this.spLife[i] <= 0) continue;
      this.spLife[i] = Math.max(0, this.spLife[i] - dt * 1.9);
      this.spPos[i * 3] += this.spVel[i * 3] * dt; this.spPos[i * 3 + 1] += this.spVel[i * 3 + 1] * dt; this.spPos[i * 3 + 2] += this.spVel[i * 3 + 2] * dt;
      this.spVel[i * 3 + 1] -= dt * .15;
    }
    const g = this.sparks.geometry; g.attributes.position.needsUpdate = true; g.attributes.aLife.needsUpdate = true; g.attributes.aSize.needsUpdate = true; g.attributes.color.needsUpdate = true;
  }
  renderFrame() {
    const w = this.world;
    w.updateFog();
    if (!this.anaglyph) { w.renderer.render(w.scene, w.camera); return; }
    const c = w.camera, e = this.eye, sep = c.position.distanceTo(this.camTarget || w.sceneCenter) / 32;
    e.copy(c); const right = new THREE.Vector3().setFromMatrixColumn(c.matrixWorld, 0);
    [-1, 1].forEach((s, k) => {
      e.position.copy(c.position).addScaledVector(right, s * sep / 2);
      e.lookAt(this.camTarget || w.sceneCenter); e.updateMatrixWorld();
      w.renderer.setRenderTarget(this.anaRT[k]); w.renderer.render(w.scene, e);
    });
    w.renderer.setRenderTarget(null); w.renderer.render(this.anaScene, this.anaCam);
  }
  // ── video's ──
  setupMedia() {
    this.mediaLayer = document.createElement('div'); this.mediaLayer.className = 'olp-media';
    this.canvas.after(this.mediaLayer);
    this.videos = [];
    this.world.stationFx.forEach(fx => fx.videos.forEach(vd => this.videos.push(vd)));
  }
  pendingMedia(i) {
    const fx = this.world.stationFx[i]; if (!fx) return [];
    return fx.videos.filter(vd => !vd.started && vd.src && this.itemAlpha(i, vd.it.id) > .5);
  }
  itemAlpha(i, id) { const fx = this.world.stationFx[i], o = fx && fx.items.find(x => x.id === id); return o ? o.alpha : 0; }
  // Maakt het afspeel-element: een <video> als textuur in de 3D-scène, of (YouTube,
  // links zonder toestemming) een element dat over de dia wordt gelegd.
  ensureVideo(vd) {
    if (vd.el || !vd.src) return;
    const it = vd.it;
    if (it.kind === 'youtube') {
      const box = document.createElement('div'); box.className = 'olp-media-el';
      box.style.width = '960px'; box.style.height = Math.round(960 * it.h / it.w) + 'px';
      const inner = document.createElement('div'); box.appendChild(inner);
      this.mediaLayer.appendChild(box); vd.el = box; vd.overlay = true;
      ytApi().then(() => {
        if (this.exited) return;
        vd.yt = new YT.Player(inner, {
          videoId: it.src, host: 'https://www.youtube-nocookie.com', width: '100%', height: '100%',
          playerVars: { playsinline: 1, rel: 0, modestbranding: 1, start: Math.floor(segStart(it)), mute: it.muted ? 1 : 0 },
          events: {
            onReady: e => { vd.ytReady = true; if (vd.wantPlay) { this.resumeAt(vd); e.target.playVideo(); } },
            onStateChange: e => { if (e.data === 0 && it.loop) { e.target.seekTo(segStart(it), true); e.target.playVideo(); } }
          }
        });
      }).catch(() => this.hint('YouTube kan niet geladen worden (internet nodig)', 3000));
      return;
    }
    const v = document.createElement('video');
    v.playsInline = true; v.preload = 'auto'; v.muted = !!it.muted;
    if (it.kind === 'link') v.crossOrigin = 'anonymous';
    v.addEventListener('ended', () => { if (it.loop) { v.currentTime = segStart(it); v.play().catch(() => {}); } });
    v.addEventListener('error', () => {
      // link zonder CORS: dan als los element over de dia afspelen
      if (it.kind === 'link' && v.crossOrigin && !vd.retried) {
        vd.retried = true; v.removeAttribute('crossorigin'); v.crossOrigin = null;
        vd.overlay = true; v.className = 'olp-media-el'; v.style.width = '960px'; v.style.height = Math.round(960 * it.h / it.w) + 'px';
        v.addEventListener('click', e => { e.stopPropagation(); this.toggleVideo(vd); });
        this.mediaLayer.appendChild(v); v.src = vd.src; if (vd.wantPlay) v.play().catch(() => {});
      }
    });
    v.src = vd.src;
    vd.el = v;
    if (!vd.overlay) { const tex = new THREE.VideoTexture(v); tex.colorSpace = THREE.SRGBColorSpace; vd.tex = tex; }
  }
  videoTime(vd) {
    if (vd.it.kind === 'youtube') return vd.yt && vd.yt.getCurrentTime ? vd.yt.getCurrentTime() : null;
    return vd.el ? vd.el.currentTime : null;
  }
  seekVideo(vd, t) {
    if (vd.it.kind === 'youtube') { if (vd.yt && vd.yt.seekTo) vd.yt.seekTo(t, true); }
    else if (vd.el) { try { vd.el.currentTime = t; } catch (e) {} }
  }
  // Waar moet de video (her)beginnen, gezien de gekozen stukjes?
  resumeAt(vd) {
    const segs = vd.it.segments || [], t = this.videoTime(vd);
    if (!segs.length) { if (vd.el && vd.el.ended) this.seekVideo(vd, 0); return; }
    if (vd.segDone || t == null) { vd.segDone = false; this.seekVideo(vd, segs[0].s); return; }
    const i = segs.findIndex(sg => sg.e == null || t < sg.e - .08);
    if (i === -1) this.seekVideo(vd, segs[0].s);
    else if (t < segs[i].s - .3) this.seekVideo(vd, segs[i].s);
  }
  playVideo(vd) {
    this.ensureVideo(vd); if (!vd.el) return;
    vd.started = true; vd.playing = true; vd.wantPlay = true;
    if (vd.it.kind === 'youtube') { if (vd.ytReady) { this.resumeAt(vd); vd.yt.playVideo(); } return; }
    const v = vd.el;
    if (vd.tex && !vd.overlay) { vd.m.map = vd.tex; vd.m.needsUpdate = true; }
    const go = () => { this.resumeAt(vd); v.play().catch(() => { v.muted = true; v.play().catch(() => {}); }); };
    if (v.readyState >= 1) go(); else v.addEventListener('loadedmetadata', go, { once: true });
  }
  pauseVideo(vd) {
    vd.playing = false; vd.wantPlay = false;
    if (!vd.el) return;
    if (vd.it.kind === 'youtube') { if (vd.yt && vd.yt.pauseVideo) vd.yt.pauseVideo(); } else vd.el.pause();
  }
  toggleVideo(vd) { if (vd.playing) this.pauseVideo(vd); else this.playVideo(vd); }
  pauseAll() { (this.videos || []).forEach(vd => { if (vd.playing) this.pauseVideo(vd); vd.started = false; }); }
  toggleMedia() {
    const fx = this.world.stationFx[this.cur]; if (!fx) return;
    const vis = fx.videos.filter(vd => this.itemAlpha(this.cur, vd.it.id) > .5);
    const anyPlaying = vis.some(vd => vd.playing);
    vis.forEach(vd => anyPlaying ? this.pauseVideo(vd) : this.playVideo(vd));
  }
  videoAt(x, y) {
    const fx = this.world.stationFx[this.cur]; if (!fx || !fx.videos.length) return null;
    const r = this.canvas.getBoundingClientRect(), rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2((x - r.left) / r.width * 2 - 1, -((y - r.top) / r.height) * 2 + 1), this.camera());
    const hits = rc.intersectObjects(fx.videos.filter(vd => this.itemAlpha(this.cur, vd.it.id) > .5).map(vd => vd.mesh), false);
    return hits.length ? hits[0].object.userData.video : null;
  }
  // Alleen de gekozen stukjes: aan het eind van een stukje door naar het
  // volgende; na het laatste stoppen (of opnieuw bij herhalen).
  watchSegments(vd) {
    const segs = vd.it.segments; if (!segs || !segs.length || !vd.playing) return;
    const isYT = vd.it.kind === 'youtube';
    if (isYT ? !(vd.yt && vd.yt.getPlayerState && vd.yt.getPlayerState() === 1) : (!vd.el || vd.el.paused)) return;
    const t = this.videoTime(vd); if (t == null || !isFinite(t)) return;
    const i = segs.findIndex(sg => sg.e == null || t < sg.e - .08);
    if (i === -1) { if (vd.it.loop) this.seekVideo(vd, segs[0].s); else { this.pauseVideo(vd); vd.segDone = true; } return; }
    if (t < segs[i].s - .3 && (i > 0 || !isYT || t > .5)) this.seekVideo(vd, segs[i].s);
  }
  updateMedia() {
    if (!this.videos || !this.videos.length) return;
    const w = this.world, cam = this.camera(), r = this.canvas.getBoundingClientRect(), er = this.el.getBoundingClientRect();
    this.videos.forEach(vd => {
      const fx = w.stationFx[vd.station];
      const a = this.itemAlpha(vd.station, vd.it.id) * (fx.presence ?? 0);
      // automatisch starten zodra het kader af is en je bij de dia bent
      if (vd.it.autoplay && !vd.started && vd.station === this.cur && a > .6 && (this.state === 'idle' || this.state === 'drawing')) this.playVideo(vd);
      if (vd.playing && vd.station !== this.cur && this.state !== 'overview') this.pauseVideo(vd);
      this.watchSegments(vd);
      if (!vd.overlay || !vd.el) return;
      const el = vd.el, it = vd.it;
      if (a < .02) { el.style.opacity = '0'; el.style.visibility = 'hidden'; return; }
      const S = w.stations[vd.station], rot = (it.rot || 0) * DEG, cx = it.x + it.w / 2, cy = it.y + it.h / 2;
      const q = [];
      for (const [px, py] of [[it.x, it.y], [it.x + it.w, it.y], [it.x + it.w, it.y + it.h], [it.x, it.y + it.h]]) {
        const dx = px - cx, dy = py - cy, rx = cx + dx * Math.cos(rot) - dy * Math.sin(rot), ry = cy + dx * Math.sin(rot) + dy * Math.cos(rot);
        const [lx, ly] = framePxToLocal(rx, ry);
        const v = new THREE.Vector3(lx, ly, .04).applyMatrix4(S.m).project(cam);
        if (v.z > 1 || v.z < -1) { el.style.visibility = 'hidden'; return; }
        q.push(r.left - er.left + (v.x + 1) / 2 * r.width, r.top - er.top + (1 - v.y) / 2 * r.height);
      }
      const W = parseFloat(el.style.width) || 960, H = parseFloat(el.style.height) || 540;
      el.style.transform = quadMatrix(W, H, q);
      el.style.visibility = 'visible'; el.style.opacity = String(a);
    });
  }
  disposeMedia() {
    (this.videos || []).forEach(vd => {
      try { if (vd.yt && vd.yt.destroy) vd.yt.destroy(); } catch (e) {}
      if (vd.el) { try { vd.el.pause && vd.el.pause(); } catch (e) {} vd.el.remove(); }
      if (vd.tex) vd.tex.dispose();
    });
    if (this.mediaLayer) this.mediaLayer.remove();
  }
  // ── opnemen als video ──
  startRecording() {
    const types = ['video/mp4;codecs=avc1.640028', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    const mime = types.find(t => G.MediaRecorder && MediaRecorder.isTypeSupported(t));
    if (!mime) { this.hint('Opnemen wordt in deze browser niet ondersteund', 4000); return; }
    const stream = this.canvas.captureStream(60);
    if (this.sound.on && this.sound.ensure() && this.sound.dest) this.sound.dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    this.recChunks = []; this.recMime = mime;
    this.rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 10e6 });
    this.rec.ondataavailable = e => { if (e.data && e.data.size) this.recChunks.push(e.data); };
    this.rec.onstop = () => { const blob = new Blob(this.recChunks, { type: mime.split(';')[0] }); if (this.opts.onRecorded) this.opts.onRecorded(blob, mime.includes('mp4') ? 'mp4' : 'webm'); this.exit(); };
    this.rec.start(250);
    const badge = document.createElement('div'); badge.className = 'olp-rec'; badge.innerHTML = '<i></i> Opnemen… (Esc = stoppen)'; this.el.appendChild(badge);
    this.recBadge = badge;
  }
  stopRecording() { if (this.rec && this.rec.state !== 'inactive') { this.recBadge && (this.recBadge.textContent = 'Video opslaan…'); this.rec.stop(); } }
  exit() {
    if (this.exited) return;
    if (this.rec && this.rec.state !== 'inactive') { this.stopRecording(); return; }
    this.exited = true;
    cancelAnimationFrame(this.raf);
    this.handlers.forEach(([t, ev, fn, o]) => t.removeEventListener(ev, fn, o));
    clearTimeout(this.wakeT); clearTimeout(this.hintT);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    this.sound.stop();
    this.disposeMedia();
    this.world.dispose();
    this.el.remove();
    if (this.opts.onExit) this.opts.onExit();
  }
}

// HTML-export: speelt zichzelf af.
function startStandalone(doc) {
  loadFonts(doc).then(() => {
    const p = new Player(doc, { standalone: true, onExit: () => { setTimeout(() => startStandalone(doc), 50); } });
    p.mount(document.body);
    G.__olpPlayer = p;
  });
}

// Lettertypen die een document gebruikt, laden (voor teksten in de 3D-scène).
function fontsUsed(doc) {
  const set = new Set();
  (doc.slides || []).forEach(s => (s.items || []).forEach(it => { if (it.type === 'text') set.add(JSON.stringify([it.font || 'Cormorant Garamond', it.bold ? '700' : '400', it.italic ? 'i' : ''])); }));
  return [...set].map(s => JSON.parse(s));
}
function loadFonts(doc) {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  return Promise.all(fontsUsed(doc).map(([f, w, i]) => document.fonts.load(`${i ? 'italic ' : ''}${w} 40px "${f}"`).catch(() => {}))).then(() => {});
}

G.OLP3D = {
  THREE, FW, FH, U, FOV, THEMES, LINE_STYLES, FONTS, FONT_FILES, SHAPES, SHAPE_DEFORMS, LINKS, MOTIONS, DEFAULT_SETTINGS,
  normalizeDoc, normalizeSlide, normalizeItem, newId, safeColor, sanitizeSvgText, readSvg, parsePathD,
  loadOneLineFont, composeOneLineText, oneLineMissing, shapePreviewPath, measureTextItem, fontsUsed, loadFonts,
  World, Player, startStandalone, resolveSrc, cleanSegments, ytApi, _itemPolyline: itemPolyline, VIDEO_KINDS, FRAMES, YT_ID_RE, themeOf, clamp, lerp, mulberry, hashStr
};
})(window);
