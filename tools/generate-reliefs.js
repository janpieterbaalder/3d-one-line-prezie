#!/usr/bin/env node
/*
 * generate-reliefs.js
 * ───────────────────
 * Tekent de figuren voor "Figuren in reliëf" (mensen, handen) en schrijft ze
 * naar assets/js/reliefs3d.js. Elke figuur is opgebouwd uit zachte vormen
 * (hoofd, romp, armen, benen als afgeronde staafjes); daarvan wordt één
 * vloeiende omtrek berekend. Die omtrek wordt in de app opgebold met reliëf.
 *
 *   node tools/generate-reliefs.js            alles opnieuw maken
 *   node tools/generate-reliefs.js --preview  ook een voorbeeldblad (reliefs-preview.html)
 */
'use strict';
const fs = require('fs'), path = require('path');

// ── afstandsvelden (negatief = binnen) ──────────────────────────────────
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const circ = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r;
const ell = (cx, cy, rx, ry, rot) => { const c = Math.cos(-(rot || 0)), s = Math.sin(-(rot || 0)); return (x, y) => { const dx = x - cx, dy = y - cy, lx = dx * c - dy * s, ly = dx * s + dy * c, k = Math.hypot(lx / rx, ly / ry); return (k - 1) * Math.min(rx, ry); }; };
// staafje van a naar b, straal ra → rb
const cap = (a, b, ra, rb) => { rb = rb ?? ra; const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1; return (x, y) => { const t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / L2, 0, 1); return Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t) - (ra + (rb - ra) * t); }; };
const smin = (a, b, k) => { const h = clamp(.5 + .5 * (b - a) / k, 0, 1); return b + (a - b) * h - k * h * (1 - h); };
const union = (fs, k) => (x, y) => { let d = 1e9; for (const f of fs) d = smin(d, f(x, y), k); return d; };
const minus = (f, g) => (x, y) => Math.max(f(x, y), -g(x, y));

// ── omtrek zoeken (marching squares) ────────────────────────────────────
function contour(f, box, step) {
  step = step || 2;
  const [x0, y0, x1, y1] = box, nx = Math.ceil((x1 - x0) / step) + 1, ny = Math.ceil((y1 - y0) / step) + 1;
  const v = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) v[j * nx + i] = f(x0 + i * step, y0 + j * step);
  const segs = [];
  const P = (i, j) => [x0 + i * step, y0 + j * step];
  const lerpP = (i1, j1, i2, j2) => { const a = v[j1 * nx + i1], b = v[j2 * nx + i2], t = a / (a - b), p = P(i1, j1), q = P(i2, j2); return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]; };
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = v[j * nx + i] < 0, b = v[j * nx + i + 1] < 0, c = v[(j + 1) * nx + i + 1] < 0, d = v[(j + 1) * nx + i] < 0;
    const code = (a ? 8 : 0) | (b ? 4 : 0) | (c ? 2 : 0) | (d ? 1 : 0);
    if (code === 0 || code === 15) continue;
    const T = () => lerpP(i, j, i + 1, j), R = () => lerpP(i + 1, j, i + 1, j + 1), B = () => lerpP(i, j + 1, i + 1, j + 1), L = () => lerpP(i, j, i, j + 1);
    const add = (p, q) => segs.push([p, q]);
    switch (code) {
      case 1: case 14: add(L(), B()); break;
      case 2: case 13: add(B(), R()); break;
      case 3: case 12: add(L(), R()); break;
      case 4: case 11: add(T(), R()); break;
      case 5: add(L(), T()); add(B(), R()); break;
      case 6: case 9: add(T(), B()); break;
      case 7: case 8: add(L(), T()); break;
      case 10: add(T(), R()); add(L(), B()); break;
    }
  }
  // stukjes aan elkaar rijgen tot lussen
  const key = p => Math.round(p[0] * 50) + ',' + Math.round(p[1] * 50);
  const adj = new Map();
  segs.forEach((s, k) => { [0, 1].forEach(e => { const kk = key(s[e]); if (!adj.has(kk)) adj.set(kk, []); adj.get(kk).push(k); }); });
  const used = new Uint8Array(segs.length), loops = [];
  for (let s0 = 0; s0 < segs.length; s0++) {
    if (used[s0]) continue;
    used[s0] = 1; const loop = [segs[s0][0], segs[s0][1]];
    for (;;) {
      const end = loop[loop.length - 1], cand = (adj.get(key(end)) || []).find(k => !used[k]);
      if (cand == null) break;
      used[cand] = 1; const s = segs[cand]; loop.push(key(s[0]) === key(end) ? s[1] : s[0]);
    }
    if (loop.length > 12) loops.push(loop);
  }
  return loops;
}
// gelijkmatig verdelen en licht gladstrijken (gesloten lus)
function tidy(loop, sp, it) {
  const pts = loop.slice(); if (Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) > .01) pts.push(pts[0]);
  const cum = [0]; for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  const L = cum[cum.length - 1], n = Math.max(8, Math.round(L / sp)), o = []; let q = 1;
  for (let k = 0; k < n; k++) { const tg = L * k / n; while (q < cum.length - 1 && cum[q] < tg) q++; const sg = cum[q] - cum[q - 1] || 1, t = (tg - cum[q - 1]) / sg; o.push([pts[q - 1][0] + (pts[q][0] - pts[q - 1][0]) * t, pts[q - 1][1] + (pts[q][1] - pts[q - 1][1]) * t]); }
  let r = o;
  for (let i = 0; i < (it ?? 2); i++) r = r.map((p, k) => { const a = r[(k - 1 + r.length) % r.length], b = r[(k + 1) % r.length]; return [.25 * a[0] + .5 * p[0] + .25 * b[0], .25 * a[1] + .5 * p[1] + .25 * b[1]]; });
  r.push(r[0]); return r;
}
// open lijn gelijkmatig verdelen
function resample(pts, sp) {
  const cum = [0]; for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  const L = cum[cum.length - 1], n = Math.max(2, Math.round(L / sp)), o = []; let q = 1;
  for (let k = 0; k <= n; k++) { const tg = L * k / n; while (q < cum.length - 1 && cum[q] < tg) q++; const sg = cum[q] - cum[q - 1] || 1, t = clamp((tg - cum[q - 1]) / sg, 0, 1); o.push([pts[q - 1][0] + (pts[q][0] - pts[q - 1][0]) * t, pts[q - 1][1] + (pts[q][1] - pts[q - 1][1]) * t]); }
  return o;
}
const bez = (p0, p1, p2, p3, n) => { n = n || 40; const o = []; for (let k = 0; k <= n; k++) { const t = k / n, m = 1 - t; o.push([m * m * m * p0[0] + 3 * m * m * t * p1[0] + 3 * m * t * t * p2[0] + t * t * t * p3[0], m * m * m * p0[1] + 3 * m * m * t * p1[1] + 3 * m * t * t * p2[1] + t * t * t * p3[1]]); } return o; };
const line = (a, b) => [a, b];

// ── één doorgetrokken lijn ──────────────────────────────────────────────
// De figuur bestaat uit omtrekken (lussen) en details (haar, kraag, vingers,
// poten). Die worden tot één lijn aaneengeregen, zoals bij een tekening uit
// één pennenstreek: de lijn komt links binnen over een golvende grond, loopt
// elke omtrek rond, maakt onderweg kleine uitstapjes voor de details en gaat
// rechts weer verder.
class Fig {
  constructor() { this.parts = []; this.strokes = []; this.details = []; this.groundY = null; }
  ground(y) { this.groundY = y; return this; }
  part(shapes, k) { this.parts.push({ f: union(shapes, k ?? 7) }); return this; }
  partF(f) { this.parts.push({ f }); return this; }
  stroke(pts) { this.strokes.push(pts); return this; }
  detail(...list) { list.forEach(d => d && d.length > 1 && this.details.push(d)); return this; }
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function compose(F) {
  const gy = F.groundY, sp = 6;
  const gyAt = x => gy + 5 * Math.sin(x / 170 + .5) + 3 * Math.sin(x / 61 + 2);
  // omtrekken
  const loops = [];
  F.parts.forEach(p => contour(p.f, [-100, -100, 2020, 1180], 3).forEach(l => {
    const t = tidy(l, sp, 2); t.pop();
    const xs = t.map(q => q[0]), ys = t.map(q => q[1]);
    loops.push({ pts: t, minX: Math.min(...xs), maxY: Math.max(...ys), sats: new Map(), spurs: new Map(), done: false });
  }));
  const nearestIdx = (L, q) => { let bi = 0, bd = Infinity; L.pts.forEach((p, i) => { const d = dist(p, q); if (d < bd) { bd = d; bi = i; } }); return [bi, bd]; };
  const loopDist = (A, B) => { let best = [Infinity, 0, 0]; for (let i = 0; i < A.pts.length; i += 2) { const [j, d] = nearestIdx(B, A.pts[i]); if (d < best[0]) best = [d, i, j]; } return best; };
  // losse lijnen: poten die op de grond staan, of details
  const legs = [], spurList = [...F.details.map(s => resample(s, sp))];
  F.strokes.forEach(s0 => {
    let s = resample(s0, sp);
    if (gy != null) { const e0 = s[0][1] > gy - 20, e1 = s[s.length - 1][1] > gy - 20; if (e1 && !e0) s = s.reverse(); if (e0 || e1) { legs.push({ pts: s, x: s[0][0] }); return; } }
    spurList.push(s);
  });
  // wie hangt aan de grond: figuren die de grond raken, en wat bovenop een poot staat
  const anchored = new Set();
  const groundLoops = gy != null ? loops.filter(L => L.maxY > gy - 45) : [];
  groundLoops.forEach(L => anchored.add(L));
  legs.forEach(g => { const top = g.pts[g.pts.length - 1]; let host = null, bd = 90; loops.forEach(L => { const [i, d] = nearestIdx(L, top); if (d < bd) { bd = d; host = { L, i }; } }); g.host = host; if (host) anchored.add(host.L); });
  if (!anchored.size && loops.length) anchored.add(loops.slice().sort((a, b) => a.minX - b.minX)[0]);
  // de rest hangt aan het dichtstbijzijnde stuk dat al vastzit
  const rest = loops.filter(L => !anchored.has(L));
  while (rest.length) {
    let best = null;
    rest.forEach((r, ri) => anchored.forEach(a => { const [d, ia, ir] = loopDist(a, r); if (!best || d < best.d) best = { d, a, r, ri, ia, ir }; }));
    best.r.entry = best.ir; if (!best.a.sats.has(best.ia)) best.a.sats.set(best.ia, []); best.a.sats.get(best.ia).push(best.r);
    anchored.add(best.r); rest.splice(best.ri, 1);
  }
  spurList.forEach(s => {
    let best = null;
    loops.forEach(L => [0, 1].forEach(e => { const [i, d] = nearestIdx(L, e ? s[s.length - 1] : s[0]); if (!best || d < best.d) best = { d, L, i, rev: !!e }; }));
    if (!best) return;
    if (!best.L.spurs.has(best.i)) best.L.spurs.set(best.i, []);
    best.L.spurs.get(best.i).push(best.rev ? s.slice().reverse() : s);
  });
  const out = [], push = pts => pts.forEach(q => out.push(q));
  const back = (line, w) => { const o = []; for (let k = line.length - 1; k >= 0; k--) { const a = line[Math.max(0, k - 1)], b = line[Math.min(line.length - 1, k + 1)], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, ww = w * Math.min(1, k / 3, (line.length - 1 - k) / 2 + .35); o.push([line[k][0] - dy / L * ww, line[k][1] + dx / L * ww]); } return o; };
  const curve = (a, b) => { const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - Math.min(40, dist(a, b) * .12)]; return bez(a, [a[0] + (m[0] - a[0]) * .7, a[1] + (m[1] - a[1]) * .7], [b[0] + (m[0] - b[0]) * .7, b[1] + (m[1] - b[1]) * .7], b, Math.max(3, Math.round(dist(a, b) / sp))).slice(1); };
  const along = (a, b) => { const n = Math.max(2, Math.round(Math.abs(b[0] - a[0]) / sp)); for (let k = 1; k < n; k++) { const t = k / n, x = a[0] + (b[0] - a[0]) * t, w = Math.min(1, t * 5, (1 - t) * 5); out.push([x, gyAt(x) * w + (a[1] + (b[1] - a[1]) * t) * (1 - w)]); } out.push(b); };
  // een omtrek rondlopen, met uitstapjes voor details en aangehangen stukken
  const visit = (L, i0) => {
    L.done = true; const n = L.pts.length;
    for (let k = 0; k <= n; k++) {
      const i = (i0 + k) % n, q = L.pts[i]; out.push(q);
      if (k === n) break;
      (L.spurs.get(i) || []).forEach(s => { push(s); push(back(s, .8)); out.push(q); });
      (L.sats.get(i) || []).forEach(S => { if (S.done) return; push(curve(q, S.pts[S.entry])); visit(S, S.entry); push(curve(S.pts[S.entry], q)); });
    }
  };
  if (gy != null) {
    let pen = [-60, gyAt(-60)]; out.push(pen);
    const items = [...groundLoops.map(L => { const low = L.pts.filter(q => q[1] > gy - 45), cx = Math.min(...low.map(q => q[0])); return { L, x: cx }; }), ...legs];
    items.sort((a, b) => a.x - b.x);
    items.forEach(it => {
      if (it.L) {
        if (it.L.done) return;
        const [i0] = nearestIdx(it.L, [it.x, gy]);
        along(pen, it.L.pts[i0]); visit(it.L, i0); pen = it.L.pts[i0];
      } else {
        const g = it.pts; along(pen, g[0]); push(g.slice(1));
        const top = g[g.length - 1];
        if (it.host && !it.host.L.done) { push(curve(top, it.host.L.pts[it.host.i])); visit(it.host.L, it.host.i); push(curve(it.host.L.pts[it.host.i], top)); }
        push(back(g, 1.2)); pen = out[out.length - 1];
      }
    });
    loops.forEach(L => { if (!L.done) { const [i0] = nearestIdx(L, pen); push(curve(pen, L.pts[i0])); visit(L, i0); pen = L.pts[i0]; } });
    along(pen, [1640, gyAt(1640)]);
    const c = [1660, gyAt(1660) - 16]; for (let k = 0; k <= 30; k++) { const a = Math.PI / 2 + k / 30 * Math.PI * 2; out.push([c[0] - 25 * Math.cos(a) + k * 1.3, c[1] + 16 * Math.sin(a)]); }
    along(out[out.length - 1], [1980, gyAt(1980)]);
  } else {
    const root = [...anchored][0], [i0] = nearestIdx(root, [-60, 400]);
    out.push([-60, root.pts[i0][1] - 160]); push(curve(out[0], root.pts[i0])); visit(root, i0);
    push(curve(root.pts[i0], [1980, root.pts[i0][1] - 160]));
  }
  return out.map((q, k) => [q[0] + 1.1 * Math.sin(k * .07) + .6 * Math.sin(k * .23 + 1), q[1] + 1.1 * Math.cos(k * .06 + 2) + .6 * Math.sin(k * .19)]);
}

function render(fig) {
  const F = fig.build(), pts = compose(F);
  // dunner maken: punten die bijna op één lijn liggen mogen weg
  const o = [pts[0]]; for (let k = 1; k < pts.length - 1; k++) if (dist(pts[k], o[o.length - 1]) > 3.2) o.push(pts[k]); o.push(pts[pts.length - 1]);
  const d = 'M' + o.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('L');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080"><path d="${d}" fill="none" stroke="#000" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// ── details voor de doorgetrokken lijn ──
const arcPts = (c, rx, ry, a0, a1, n, wav) => { const o = []; n = n || 24; for (let k = 0; k <= n; k++) { const a = (a0 + (a1 - a0) * k / n) * Math.PI / 180; o.push([c[0] + Math.cos(a) * rx, c[1] + Math.sin(a) * ry + (wav || 0) * Math.sin(k * 1.4)]); } return o; };
// haar: kort (golvende rand over de kruin), lang (lokken langs het gezicht)
function hairDet(c, rx, ry, kind, dir) {
  if (kind === 'long') return [arcPts(c, rx + 6, ry + 6, 200, 340, 20, 2), [[c[0] - rx * .7, c[1] - ry * .8], [c[0] - rx - 6, c[1]], [c[0] - rx - 2, c[1] + ry + 30]], [[c[0] + rx * .7, c[1] - ry * .8], [c[0] + rx + 6, c[1]], [c[0] + rx + 2, c[1] + ry + 30]]];
  if (kind === 'knot') return [arcPts(c, rx + 3, ry + 3, 205, 335, 18, 1.2)];
  const d = dir || 1; return [arcPts(c, rx + 5, ry + 5, d > 0 ? 195 : 205, d > 0 ? 335 : 345, 22, 2.4), [[c[0] - d * rx * .2, c[1] - ry - 4], [c[0] + d * rx * .1, c[1] - ry * .55], [c[0] + d * rx * .55, c[1] - ry * .7]]];
}
const earDet = (c, rx, side) => arcPts([c[0] + side * rx, c[1] + 4], 9, 13, side > 0 ? -70 : 110, side > 0 ? 70 : 250, 10);
const cuff = (el, wr, w) => { const dx = wr[0] - el[0], dy = wr[1] - el[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, c = [wr[0] - dx / L * 4, wr[1] - dy / L * 4]; return [[c[0] - nx * w, c[1] - ny * w], [c[0] + nx * w, c[1] + ny * w]]; };
const fingers = (el, wr, H) => { const dx = wr[0] - el[0], dy = wr[1] - el[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy, ny = ux, b = [wr[0] + ux * .03 * H, wr[1] + uy * .03 * H]; return [-1, 1].map(s => [[b[0] + nx * s * .008 * H, b[1] + ny * s * .008 * H], [b[0] + ux * .03 * H + nx * s * .01 * H, b[1] + uy * .03 * H + ny * s * .01 * H]]); };

// Persoon van voren. Maten in "lengtes" (1 = lichaamslengte), y omhoog vanaf de voeten.
// Geeft losse groepen terug (romp, hoofd, armen), zodat een arm die over
// iemand anders heen valt als eigen lijn zichtbaar kan blijven.
function person(o) {
  const H = o.h, X = (u, v) => [o.x + u * H, o.g - v * H];
  const J = Object.assign({
    head: [0, .905], headR: [.062, .074], headRot: 0, hair: null,
    shL: [-.118, .758], shR: [.118, .758],
    elL: [-.158, .6], elR: [.158, .6], wrL: [-.172, .45], wrR: [.172, .45],
    hip: [0, .47], knL: [-.056, .25], knR: [.056, .25], anL: [-.06, .05], anR: [.06, .05],
    torsoTop: [0, .72], torsoBot: [0, .53], torsoR: [.105, .098],
    skirt: false, noArmL: false, noArmR: false, noLegs: false
  }, o.j || {});
  const body = [], head = [], armL = [], armR = [];
  const hc = J.head;
  head.push(ell(...X(...hc), J.headR[0] * H, J.headR[1] * H, J.headRot));
  if (J.hair === 'knot') head.push(circ(...X(hc[0] + (J.knot || [0, .07])[0], hc[1] + (J.knot || [0, .07])[1]), .034 * H));
  if (J.hair === 'long') head.push(cap(X(hc[0], hc[1] + .01), X(hc[0] - .003, hc[1] - .095), .067 * H, .074 * H));
  body.push(cap(X(hc[0] * .5, .8), X(hc[0] * .7, .87), .03 * H));
  body.push(cap(X(J.shL[0] + .02, J.shL[1]), X(J.shR[0] - .02, J.shR[1]), .046 * H));
  body.push(cap(X(...J.torsoTop), X(...J.torsoBot), J.torsoR[0] * H, J.torsoR[1] * H));
  body.push(ell(...X(...J.hip), .106 * H, .072 * H));
  const arm = (dst, sh, el, wr) => {
    dst.push(cap(X(...sh), X(...el), .037 * H, .031 * H), cap(X(...el), X(...wr), .031 * H, .026 * H));
    const d = [wr[0] - el[0], wr[1] - el[1]], L = Math.hypot(d[0], d[1]) || 1, h = [wr[0] + d[0] / L * .03, wr[1] + d[1] / L * .03];
    dst.push(ell(...X(...h), .027 * H, .037 * H, Math.atan2(d[0], d[1])));
  };
  if (!J.noArmL) arm(armL, J.shL, J.elL, J.wrL);
  if (!J.noArmR) arm(armR, J.shR, J.elR, J.wrR);
  if (!J.noLegs) {
    if (J.skirt) body.push(cap(X(0, .52), X(0, .2), .11 * H, .155 * H));
    [[J.knL, J.anL, -1], [J.knR, J.anR, 1]].forEach(([kn, an, sd]) => {
      body.push(cap(X(J.hip[0] + sd * .05, J.hip[1] - .02), X(...kn), .05 * H, .041 * H), cap(X(...kn), X(...an), .04 * H, .031 * H));
      body.push(ell(...X(an[0] + sd * .016, .022), .042 * H, .022 * H));
    });
  }
  const det = [], hp = X(...hc), hrx = J.headR[0] * H, hry = J.headR[1] * H;
  det.push(...hairDet(hp, hrx, hry, J.hair));
  if (J.hair !== 'long') det.push(earDet(hp, hrx, 1));
  det.push([X(-.038, .795), X(0, .735), X(.038, .795)]);                         // kraag
  if (!J.skirt) det.push(bez(X(-.1, .515), X(-.04, .5), X(.04, .5), X(.1, .515), 16));   // riem
  else det.push(arcPts(X(0, .2), .15 * H, 6, 180, 0, 30, 2.5));                   // zoom van de jurk
  [[J.noArmL, J.elL, J.wrL], [J.noArmR, J.elR, J.wrR]].forEach(([no, el, wr]) => { if (no) return; det.push(cuff(X(...el), X(...wr), .03 * H), ...fingers(X(...el), X(...wr), H)); });
  return { X, H, body, head, armL, armR, det, all: () => [...body, ...head, ...armL, ...armR] };
}
// Persoon van opzij; dir = 1 kijkt naar rechts, -1 naar links.
function side(o) {
  const H = o.h, d = o.dir || 1, X = (u, v) => [o.x + d * u * H, o.g - v * H];
  const J = Object.assign({
    head: [.02, .905], headR: [.07, .076], headRot: 0, hair: null,
    sh: [0, .745], el: [.03, .6], wr: [.05, .45], torsoTop: [0, .73], torsoBot: [0, .53], torsoR: [.085, .08],
    hip: [0, .47], knF: [.025, .25], anF: [.025, .05], knB: [-.02, .25], anB: [-.03, .05], noArm: false, noLegs: false, skirt: false
  }, o.j || {});
  const body = [], head = [], arm = [];
  head.push(ell(...X(...J.head), J.headR[0] * H, J.headR[1] * H, d * J.headRot));
  if (J.hair === 'long') head.push(cap(X(J.head[0] - .02, J.head[1] + .01), X(J.head[0] - .035, J.head[1] - .09), .062 * H, .05 * H));
  if (J.hair === 'knot') head.push(circ(...X(J.head[0] - .07, J.head[1] + .03), .033 * H));
  body.push(cap(X(J.torsoTop[0] + (J.head[0] - J.torsoTop[0]) * .25, J.torsoTop[1] + .06), X(J.torsoTop[0] + (J.head[0] - J.torsoTop[0]) * .6, J.head[1] - .04), .032 * H));
  body.push(circ(...X(J.torsoTop[0], J.torsoTop[1] + .01), .075 * H));
  body.push(cap(X(...J.torsoTop), X(...J.torsoBot), J.torsoR[0] * H, J.torsoR[1] * H));
  body.push(ell(...X(...J.hip), .086 * H, .075 * H));
  if (!J.noLegs) {
    if (J.skirt) body.push(cap(X(0, .52), X(0, .2), .09 * H, .13 * H));
    [[J.knF, J.anF], [J.knB, J.anB]].forEach(([kn, an]) => {
      body.push(cap(X(J.hip[0], J.hip[1] - .02), X(...kn), .052 * H, .042 * H), cap(X(...kn), X(...an), .04 * H, .031 * H));
      body.push(ell(...X(an[0] + .035, .022), .056 * H, .022 * H));
    });
  }
  if (!J.noArm) {
    arm.push(cap(X(...J.sh), X(...J.el), .038 * H, .032 * H), cap(X(...J.el), X(...J.wr), .032 * H, .026 * H));
    const dd = [J.wr[0] - J.el[0], J.wr[1] - J.el[1]], L = Math.hypot(dd[0], dd[1]) || 1;
    arm.push(ell(...X(J.wr[0] + dd[0] / L * .03, J.wr[1] + dd[1] / L * .03), .028 * H, .037 * H, Math.atan2(d * dd[0], dd[1])));
  }
  const det = [], hp = X(...J.head), hrx = J.headR[0] * H, hry = J.headR[1] * H;
  det.push(...hairDet(hp, hrx, hry, J.hair || 'short', d));
  if (J.hair !== 'long') det.push(earDet([hp[0] - d * hrx * .15, hp[1]], 1, -d).map(q => [q[0], q[1]]));
  det.push([X(J.torsoTop[0] + .03, J.torsoTop[1] + .03), X(J.torsoTop[0] + .055, J.torsoTop[1] - .03)]);
  if (!J.noArm) det.push(cuff(X(...J.el), X(...J.wr), .03 * H), ...fingers(X(...J.el), X(...J.wr), H));
  return { X, H, body, head, arm, det, all: () => [...body, ...head, ...arm] };
}
const px = (P, u, v) => P.X(u, v);
// blad (spitsboog tussen a en b, breedte w)
function leafS(a, b, w) {
  const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
  const R = (L * L / 4 + w * w) / (2 * w), off = R - w;
  const c1 = [m[0] + n[0] * off, m[1] + n[1] * off], c2 = [m[0] - n[0] * off, m[1] - n[1] * off];
  return (x, y) => Math.max(Math.hypot(x - c1[0], y - c1[1]) - R, Math.hypot(x - c2[0], y - c2[1]) - R);
}
const below = yy => (x, y) => yy - y;     // binnen = onder deze lijn
const rbox = (cx, cy, hw, hh, r) => (x, y) => { const qx = Math.abs(x - cx) - hw + r, qy = Math.abs(y - cy) - hh + r; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r; };
// twee handen van opzij, handpalmen omhoog, duimen rechtop; de vingertoppen raken elkaar
function cupped(F, cy) {
  [-1, 1].forEach(sd => {
    const X = x => 960 + sd * x;
    F.part([cap([X(390), cy + 350], [X(250), cy + 150], 68, 58), cap([X(250), cy + 150], [X(120), cy + 112], 58, 48),
      cap([X(125), cy + 110], [X(30), cy + 94], 38, 28), cap([X(205), cy + 112], [X(160), cy + 26], 28, 23), ell(X(155), cy + 14, 24, 28, sd * .2)], 14);
    [[cy + 102, cy + 92], [cy + 118, cy + 108]].forEach(([y0, y1]) => F.stroke(bez([X(112), y0], [X(80), y0 - 4], [X(45), y1 - 2], [X(20), y1], 12)));
    { const a = [X(390), cy + 350], b = [X(250), cy + 150], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), c = [a[0] + dx * .42, a[1] + dy * .42], nx = -dy / L, ny = dx / L, w = 64; F.detail([[c[0] - nx * w, c[1] - ny * w], [c[0] + nx * w * .1, c[1] + ny * w * .1 + 6], [c[0] + nx * w, c[1] + ny * w]], arcPts([X(155), cy + 10], 12, 9, 200, 340, 8)); }
  });
}
const halfEll = (cx, cy, rx, ry, a0, a1) => { const o = []; for (let k = 0; k <= 60; k++) { const a = (a0 + (a1 - a0) * k / 60) * Math.PI / 180; o.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); } return o; };
const FIG = {};
const G0 = 935;

// ── Troost: een hand op de schouder ─────────────────────────────────────
FIG['troost'] = { name: 'Troost', group: 'nabijheid', depth: .75, build() {
  const F = new Fig(), H = 770;
  const B = person({ x: 1105, g: G0, h: H * .95, j: { head: [-.018, .885], headRot: .22, hair: 'long', elL: [-.152, .6], wrL: [-.15, .45], skirt: true } });
  F.part(B.all()); F.detail(...B.det);
  const A = person({ x: 795, g: G0, h: H, j: { head: [.012, .905], headRot: -.1, elR: [.25, .7], wrR: [.33, .755], noArmR: false } });
  // de hand van A rust op de schouder van B
  A.armR.length = 0;
  const sh = A.X(.118, .758), el = A.X(.25, .705), hand = B.X(-.095, .79);
  A.armR.push(cap(sh, el, .037 * H, .032 * H), cap(el, [hand[0] - 14, hand[1] + 4], .032 * H, .027 * H), ell(hand[0], hand[1], .045 * H, .025 * H, -.15));
  F.part(A.all()); F.detail(...A.det.filter((d, i) => i < A.det.length - 3));
  F.ground(G0 + 2);
  return F;
} };

// ── Hand in hand ────────────────────────────────────────────────────────
FIG['hand-in-hand'] = { name: 'Hand in hand', group: 'nabijheid', depth: .75, build() {
  const F = new Fig(), H = 770, h2 = 480;
  const M = [1035, 598];
  const A = person({ x: 820, g: G0, h: H, j: { headRot: .12, head: [.01, .903], elR: [(990 - 820) / H, (G0 - 470) / H], wrR: [(1022 - 820) / H, (G0 - 575) / H] } });
  const C = person({ x: 1190, g: G0, h: h2, j: { headR: [.078, .09], head: [-.012, .88], headRot: -.12, hair: 'knot', knot: [-.02, .085], shL: [-.12, .735], shR: [.12, .735], elL: [(1100 - 1190) / h2, (G0 - 630) / h2], wrL: [(1052 - 1190) / h2, (G0 - 606) / h2], torsoTop: [0, .69], torsoBot: [0, .52], skirt: true } });
  F.part(A.all()); F.part(C.all()); F.detail(...A.det, ...C.det);
  F.ground(G0 + 2);
  return F;
} };

// ── Verdriet: op de grond, armen om de knieën, hoofd gebogen ────────────
FIG['verdriet'] = { name: 'Verdriet', group: 'verlies', depth: .8, build() {
  const F = new Fig(), H = 800, X = (u, v) => [900 + u * H, G0 - v * H];
  const hip = [-.12, .085], knee = [.12, .37], foot = [.2, .035];
  F.part([ell(...X(...hip), .1 * H, .08 * H, -.3), cap(X(...hip), X(...knee), .07 * H, .056 * H), cap(X(...knee), X(...foot), .05 * H, .036 * H),
    ell(...X(foot[0] + .035, .022), .055 * H, .024 * H), cap(X(-.1, .14), X(-.035, .5), .1 * H, .086 * H)], 9);
  F.part([ell(...X(.085, .505), .066 * H, .078 * H, .75)]);                      // hoofd rust op de knieën
  F.detail(arcPts(X(.085, .505), .066 * H + 6, .078 * H + 6, 150, 290, 20, 2.2), [X(.03, .33), X(.055, .305)]);
  F.part([cap(X(-.025, .5), X(.04, .31), .038 * H, .032 * H), cap(X(.04, .31), X(.2, .27), .032 * H, .027 * H), ell(...X(.225, .27), .03 * H, .036 * H, 1.2)], 6);
  F.ground(G0 + 2);
  return F;
} };

// ── Omhelzing ───────────────────────────────────────────────────────────
FIG['omhelzing'] = { name: 'Omhelzing', group: 'verlies', depth: .75, build() {
  const F = new Fig(), H = 760;
  const A = side({ x: 850, g: G0, h: H, dir: 1, j: { head: [.115, .87], headRot: -.4, torsoTop: [.045, .73], noArm: true } });
  const B = side({ x: 1075, g: G0, h: H * .96, dir: -1, j: { head: [.075, .895], headRot: -.2, hair: 'long', torsoTop: [.04, .73], noArm: true, skirt: true } });
  F.part([...A.body, ...A.head]); F.part([...B.body, ...B.head]); F.detail(...A.det, ...B.det);
  // A slaat een arm om B heen; van B zie je alleen de hand op de rug van A
  const a0 = A.X(.04, .75), a1 = [1000, 395], a2 = [1098, 452];
  F.part([cap(a0, a1, .038 * H, .032 * H), cap(a1, a2, .032 * H, .027 * H), ell(a2[0] + 4, a2[1] + 16, .028 * H, .038 * H, -.25)], 6);
  F.part([ell(808, 520, .026 * H, .04 * H, .25), cap([818, 505], [845, 500], 14, 12)], 4);
  F.ground(G0 + 2);
  return F;
} };

// ── Samen op een bankje (van achteren) ──────────────────────────────────
FIG['samen-op-een-bankje'] = { name: 'Samen op een bankje', group: 'nabijheid', depth: .7, build() {
  const F = new Fig(), top = 640;
  const back = (x, hy, hr, rot, hair) => {
    const s = [ell(x + (rot || 0) * 70, hy, hr, hr * 1.13, rot || 0), cap([x, hy + 62], [x, hy + 110], 30), cap([x - 92, hy + 140], [x + 92, hy + 140], 50), cap([x, hy + 150], [x, top + 40], 118, 132)];
    if (hair === 'long') s.push(cap([x + (rot || 0) * 70, hy], [x + (rot || 0) * 80, hy + 98], hr * 1.04, hr * .95));
    return (xx, yy) => Math.max(union(s, 11)(xx, yy), -below(top)(xx, yy));
  };
  F.partF(back(825, 352, 64, .3, 'long'));
  F.partF(back(1105, 318, 68, 0));
  F.detail(arcPts([1105, 318], 52, 34, 20, 160, 16, 2.5), arcPts([1105, 432], 34, 12, 10, 170, 12), bez([778, 330], [770, 380], [800, 410], [790, 460], 14), bez([818, 318], [826, 372], [808, 410], [826, 462], 14), arcPts([840, 470], 30, 10, 10, 170, 12));
  // arm van de rechterpersoon om de schouders van de linker
  F.part([cap([1000, 470], [870, 438], 36, 32), cap([870, 438], [732, 458], 32, 27), ell(718, 466, 38, 28, .3)], 6);
  // bank: twee rugleuninglatten en de zitting
  F.part([cap([610, top + 24], [1310, top + 24], 24)]); F.part([cap([610, top + 92], [1310, top + 92], 24)]);
  F.part([cap([590, 790], [1330, 790], 17)]);
  [[660, top + 118, 660, 773], [1260, top + 118, 1260, 773], [640, 807, 628, G0], [1280, 807, 1292, G0], [672, 807, 690, G0 - 50], [1248, 807, 1230, G0 - 50]].forEach(([a, b, c, d]) => F.stroke([[a, b], [c, d]]));
  F.ground(G0 + 2);
  return F;
} };

// ── Aan het bed ─────────────────────────────────────────────────────────
FIG['aan-het-bed'] = { name: 'Aan het bed', group: 'verlies', depth: .7, build() {
  const F = new Fig();
  // bed met matras, rand en voeteneinde
  F.partF(rbox(1230, 655, 330, 26, 22));
  F.partF(rbox(1230, 722, 342, 16, 12));
  F.part([cap([1585, 540], [1585, 770], 20)]);
  [[915, 740, 915, G0], [1545, 740, 1545, G0]].forEach(([a, b, c, d]) => F.stroke([[a, b], [c, d]]));
  F.part([ell(985, 615, 78, 30, -.04)]);                                          // kussen
  // iemand in bed: hoofd op het kussen, lichaam onder de deken
  F.part([ell(1002, 574, 46, 52, -.3)]);
  F.detail(arcPts([1002, 574], 52, 58, 120, 250, 16, 2), [[1130, 572], [1160, 590], [1200, 588]], [[1290, 582], [1320, 600], [1350, 598]], [[1420, 590], [1450, 606]], [[915, 600], [935, 612], [960, 610]]);
  F.part([cap([1065, 606], [1240, 606], 46, 44), cap([1240, 606], [1520, 614], 40, 30), circ(1365, 596, 38)], 12);
  F.part([cap([1085, 592], [1005, 642], 22, 19), cap([1005, 642], [935, 668], 19, 16), ell(925, 672, 20, 15, .4)], 5);   // arm naar de bezoeker
  // bezoeker op een stoel, leunt naar voren en houdt de hand vast
  F.part([cap([640, 742], [780, 742], 12)]); F.part([cap([648, 500], [644, 742], 12)]);
  [[655, 752, 648, G0], [770, 752, 780, G0]].forEach(([a, b, c, d]) => F.stroke([[a, b], [c, d]]));
  const V = side({ x: 712, g: G0, h: 780, dir: 1, j: { hip: [0, .25], head: [.135, .69], headRot: -.35, torsoTop: [.075, .57], torsoBot: [.01, .32], knF: [.19, .265], anF: [.2, .05], knB: [.18, .265], anB: [.18, .05], noArm: true, hair: 'knot' } });
  F.part([...V.body, ...V.head]); F.detail(...V.det);
  F.part([cap(V.X(.08, .565), [850, 640], 30, 26), cap([850, 640], [905, 672], 26, 21), ell(918, 676, 24, 18, .5)], 6);
  F.ground(G0 + 2);
  return F;
} };

// ── Moreel beraad: in gesprek rond de tafel ─────────────────────────────
FIG['moreel-beraad'] = { name: 'Moreel beraad', group: 'ethiek', depth: .7, build() {
  const F = new Fig(), tc = [960, 640], trx = 370, try_ = 82;
  const table = ell(tc[0], tc[1], trx, try_);
  F.partF(table);
  F.stroke(halfEll(tc[0], tc[1] + 18, trx, try_, 0, 180)); F.stroke([[tc[0] - trx, tc[1]], [tc[0] - trx, tc[1] + 18]]); F.stroke([[tc[0] + trx, tc[1]], [tc[0] + trx, tc[1] + 18]]);
  F.part([cap([960, tc[1] + try_ + 22], [960, 878], 24), ell(960, 902, 120, 22)], 8);
  // drie mensen achter de tafel (van voren), tot aan het tafelblad
  const bust = (x, hy, hr, rot, hair, extra) => {
    const s = [ell(x + rot * 40, hy, hr, hr * 1.16, rot), cap([x, hy + 55], [x, hy + 90], 24), cap([x - 74, hy + 115], [x + 74, hy + 115], 40), cap([x, hy + 120], [x, hy + 260], 88, 96)];
    if (hair === 'long') s.push(cap([x + rot * 40, hy], [x + rot * 40, hy + 80], hr * 1.05, hr * .96));
    if (hair === 'knot') s.push(circ(x + rot * 40, hy - hr * 1.1, hr * .5));
    return (xx, yy) => Math.max(union([...s, ...(extra || [])], 9)(xx, yy), -table(xx, yy));
  };
  F.partF(bust(700, 400, 50, .12, 'long'));
  F.partF(bust(960, 372, 54, 0, null, [cap([1040, 488], [1095, 570], 30, 26), cap([1095, 570], [1110, 485], 26, 22), ell(1112, 465, 24, 32, .1)]));   // hand omhoog: aan het woord
  F.partF(bust(1220, 398, 50, -.15, 'knot'));
  F.detail(...hairDet([960, 372], 54, 62, 'short'), ...hairDet([1212, 398], 50, 58, 'knot'), [[700 - 40, 360], [705 - 52, 400], [700 - 48, 452]], [[740, 360], [752, 400], [748, 452]], [[935, 445], [960, 478], [985, 445]], [[675, 470], [700, 500], [725, 470]], [[1195, 468], [1220, 498], [1245, 468]]);
  // aan de korte kanten: twee mensen van opzij
  const L = side({ x: 520, g: G0, h: 700, dir: 1, j: { hip: [0, .3], head: [.04, .74], torsoTop: [.02, .63], torsoBot: [0, .37], knF: [.17, .31], anF: [.18, .05], knB: [.16, .31], anB: [.16, .05], el: [.1, .48], wr: [.2, .43] } });
  const R = side({ x: 1400, g: G0, h: 680, dir: -1, j: { hip: [0, .3], head: [.03, .745], headRot: .15, hair: 'long', torsoTop: [.02, .63], torsoBot: [0, .37], knF: [.17, .31], anF: [.18, .05], knB: [.16, .31], anB: [.16, .05], el: [.06, .5], wr: [.15, .55] } });
  F.part(L.all()); F.part(R.all()); F.detail(...L.det, ...R.det);
  F.ground(G0 + 2);
  return F;
} };

// ── Handen met een kaars ────────────────────────────────────────────────
FIG['handen-met-lichtje'] = { name: 'Handen met een lichtje', group: 'verlies', depth: .8, build() {
  const F = new Fig(), cy = 560;
  cupped(F, cy); F.ground(cy + 412);
  F.partF(rbox(960, cy + 26, 104, 38, 14));                                        // waxinelichtje
  F.stroke(halfEll(960, cy - 8, 96, 14, 180, 360)); F.stroke([[960, cy - 8], [962, cy - 44]]);
  F.part([circ(962, cy - 86, 32), cap([962, cy - 86], [968, cy - 210], 32, 2)], 18);      // vlam
  return F;
} };

// ── Handen met een plantje ──────────────────────────────────────────────
FIG['handen-met-plantje'] = { name: 'Handen met een plantje', group: 'zingeving', depth: .8, build() {
  const F = new Fig();
  cupped(F, 560); F.ground(972);
  F.part([ell(960, 596, 140, 44)]);                                               // aarde
  F.stroke(bez([960, 580], [945, 500], [982, 440], [962, 370], 30));               // steeltje
  F.part([leafS([962, 375], [820, 300], 48)]); F.part([leafS([962, 375], [1110, 282], 50)]);
  return F;
} };

// ── uitvoer ─────────────────────────────────────────────────────────────
const out = [], names = Object.keys(FIG);
names.forEach(k => { const f = FIG[k]; out.push({ file: k, name: f.name, group: f.group, depth: f.depth, svg: render(f) }); });
const root = path.resolve(__dirname, '..');
const js = `/* Gegenereerd door tools/generate-reliefs.js — niet met de hand aanpassen. */\n(function (G) { 'use strict';\nG.OLP3D_RELIEFS = ${JSON.stringify(out)};\n})(window);\n`;
fs.writeFileSync(path.join(root, 'assets/js/reliefs3d.js'), js);
if (process.argv.includes('--preview')) {
  const html = '<html><body style="margin:0;background:#ddd;font:14px sans-serif;display:flex;flex-wrap:wrap">' + out.map(e => `<div style="margin:4px;background:#fff"><div style="padding:2px 6px">${e.name}</div><div style="width:470px;height:265px">${e.svg.replace('<svg ', '<svg width="470" height="265" ')}</div></div>`).join('') + '</body></html>';
  fs.writeFileSync(process.argv[process.argv.indexOf('--preview') + 1] || path.join(root, 'reliefs-preview.html'), html);
}
console.log('reliëffiguren: ' + out.length);
