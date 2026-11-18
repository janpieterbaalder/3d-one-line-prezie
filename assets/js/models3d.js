/* ═══════════════════════════════════════════════════════════════════════
   3D One Line Prezi — 3D-lijntekeningen voor de bibliotheek
   Elk model is een echte 3D-tekening: één doorlopende lijn door de ruimte
   (met hier en daar een onzichtbare sprong naar een los deel, zoals een
   vallend blaadje). Coördinaten: x rechts, y omhoog, z naar de kijker.
   ═══════════════════════════════════════════════════════════════════════ */
(function (G) {
'use strict';
const D = Math.PI / 180;
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const len = a => Math.hypot(a[0], a[1], a[2]);
const unit = a => mul(a, 1 / (len(a) || 1));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];
const clampN = (v, a, b) => Math.max(a, Math.min(b, +v || 5));
function rnd(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// draai punt p om eenheidsas k over hoek a (Rodrigues)
function rotAxis(p, k, a) { const c = Math.cos(a), s = Math.sin(a), d = p[0] * k[0] + p[1] * k[1] + p[2] * k[2], cr = cross(k, p); return [p[0] * c + cr[0] * s + k[0] * d * (1 - c), p[1] * c + cr[1] * s + k[1] * d * (1 - c), p[2] * c + cr[2] * s + k[2] * d * (1 - c)]; }
const rotY = (p, deg) => rotAxis(p, Y, deg * D), rotX = (p, deg) => rotAxis(p, X, deg * D), rotZ = (p, deg) => rotAxis(p, Z, deg * D);

// ── bouwstenen (geven puntenlijsten) ────────────────────────────────────
function seg(a, b, n) { n = n || Math.max(2, Math.ceil(len(sub(b, a)) / .03)); const o = []; for (let k = 0; k <= n; k++) o.push(lerp3(a, b, k / n)); return o; }
function poly(pts) { const o = [pts[0]]; for (let k = 1; k < pts.length; k++) o.push(...seg(pts[k - 1], pts[k]).slice(1)); return o; }
// boog: middelpunt c, eenheidsassen u en v van het vlak, straal r, hoeken in graden
function arc(c, u, v, r, a0, a1, n) {
  n = n || Math.max(8, Math.ceil(Math.abs(a1 - a0) * D * Math.max(r, .05) / .025));
  const o = []; for (let k = 0; k <= n; k++) { const a = (a0 + (a1 - a0) * k / n) * D; o.push(add(c, add(mul(u, r * Math.cos(a)), mul(v, r * Math.sin(a))))); } return o;
}
function bez(p0, p1, p2, p3, n) {
  n = n || Math.max(8, Math.ceil((len(sub(p1, p0)) + len(sub(p2, p1)) + len(sub(p3, p2))) / .025));
  const o = []; for (let k = 0; k <= n; k++) { const t = k / n, m = 1 - t; o.push(add(add(mul(p0, m * m * m), mul(p1, 3 * m * m * t)), add(mul(p2, 3 * m * t * t), mul(p3, t * t * t)))); } return o;
}
// draadmodel van een (eventueel gedraaide) doos: 12 ribben in één lijn (3 keer dubbel)
function box8(b0, b1, b2, b3, t0, t1, t2, t3) { return poly([b0, b1, b2, b3, b0, t0, t1, t2, t3, t0, t1, b1, b2, t2, t3, b3]); }
function box(min, max, tf) {
  const [x0, y0, z0] = min, [x1, y1, z1] = max, f = tf || (p => p);
  return box8(f([x0, y0, z1]), f([x1, y0, z1]), f([x1, y0, z0]), f([x0, y0, z0]), f([x0, y1, z1]), f([x1, y1, z1]), f([x1, y1, z0]), f([x0, y1, z0]));
}
// spiraal over een omwentelingsoppervlak: profiel t → [straal, hoogte]
function revolve(profile, turns, n, a0) { const o = []; for (let k = 0; k <= n; k++) { const t = k / n, [r, y] = profile(t), a = ((a0 ?? 90) + turns * 360 * t) * D; o.push([r * Math.cos(a), y, r * Math.sin(a)]); } return o; }
// platte omtrek (xy) uitgerekt in de diepte: voorkant, achterkant en ribben
function extrude(outline, z, ribs) {
  const f = outline.map(p => [p[0], p[1], z]), b = outline.map(p => [p[0], p[1], -z]);
  const o = [f, seg(f[f.length - 1], b[b.length - 1]), b.slice().reverse()];
  return { front: f, back: b, parts: o, ribs: (ribs || []).map(i => seg(f[i], b[i])) };
}

// Pen: verzamelt lijnstukken tot één lijn. add() sluit zichtbaar aan,
// jump() gaat met de pen omhoog naar een los deel.
class Pen {
  constructor() { this.p = []; this.v = []; }
  get last() { return this.p[this.p.length - 1]; }
  add(pts, jump) {
    if (!pts || !pts.length) return this;
    let k0 = 0;
    if (!this.p.length) { this.p.push(pts[0]); this.v.push(false); k0 = 1; }
    else if (len(sub(this.last, pts[0])) < 1e-6) k0 = 1;
    else if (jump || len(sub(this.last, pts[0])) > .15) { this.p.push(pts[0]); this.v.push(false); k0 = 1; }
    for (let k = k0; k < pts.length; k++) { this.p.push(pts[k]); this.v.push(true); }
    return this;
  }
  jump(pts) { return this.add(pts, true); }
  many(list) { list.forEach(l => this.add(l)); return this; }
}
const ring = (y, r, a0, rr) => arc([0, y, 0], X, Z, r, a0 ?? 90, (a0 ?? 90) + 360, rr);
const at = (a, y, r) => [r * Math.cos(a * D), y, r * Math.sin(a * D)];
// rechthoek met ronde hoeken in het vlak (u, v) rond c
function rrect(c, u, v, w, h, r) {
  const hw = w / 2, hh = h / 2; r = Math.min(r, hw * .99, hh * .99);
  const p2 = (x, y) => add(c, add(mul(u, x), mul(v, y))), pts = [p2(0, -hh)];
  [[hw - r, -hh + r, -90], [hw - r, hh - r, 0], [-hw + r, hh - r, 90], [-hw + r, -hh + r, 180]].forEach(([cx, cy, a0]) => {
    for (let k = 0; k <= 8; k++) { const a = (a0 + 90 * k / 8) * D; pts.push(p2(cx + r * Math.cos(a), cy + r * Math.sin(a))); }
  });
  pts.push(p2(0, -hh));
  return poly(pts);
}
// bolletje als spiraal, van onder naar boven
function ball(c, r, turns) { turns = turns || 5; return revolve(t => [Math.sin(t * Math.PI) * r, -Math.cos(t * Math.PI) * r], turns, Math.ceil(60 * turns), 90).map(p => add(p, c)); }
function perp(d) { return unit(cross(d, Math.abs(d[1]) < .9 ? Y : X)); }
// touw: spiraal om het lijnstuk a→b
function coil(a, b, r, turns) { const d = unit(sub(b, a)), p1 = perp(d), p2 = cross(d, p1), n = Math.ceil(turns * 40), o = []; for (let k = 0; k <= n; k++) { const t = k / n, c = lerp3(a, b, t), g = turns * 2 * Math.PI * t; o.push(add(c, add(mul(p1, r * Math.cos(g)), mul(p2, r * Math.sin(g))))); } return o; }
// gevlochten ring (spiraal om een cirkel)
function ropeRing(c, u, v, R, r, wraps) { const w = cross(u, v), n = Math.ceil(wraps * 30), o = []; for (let k = 0; k <= n; k++) { const t = -Math.PI / 2 + k / n * 2 * Math.PI, ph = wraps * (t + Math.PI / 2), rad = add(mul(u, Math.cos(t)), mul(v, Math.sin(t))); o.push(add(c, add(mul(rad, R + r * Math.cos(ph)), mul(w, r * Math.sin(ph))))); } return o; }
// ketting van a naar b: schakels om en om gedraaid
function chain(a, b, nLinks, size) { const d = unit(sub(b, a)), p1 = perp(d), p2 = cross(d, p1), step = len(sub(b, a)) / nLinks, out = []; for (let k = 0; k < nLinks; k++) out.push(rrect(add(a, mul(d, step * (k + .5))), d, k % 2 ? p1 : p2, step * 1.25, size, size * .49)); return out; }
// Zachte hoeken: elke lijn gelijkmatig verdelen en licht gladstrijken, zodat
// er nergens een harde hoek overblijft (de vorm zelf blijft gelijk).
function smoothRuns(p, v, sp, it) {
  const P2 = [], V2 = [];
  let i = 0;
  while (i < p.length) {
    let j = i + 1; while (j < p.length && v[j]) j++;
    let run = p.slice(i, j);
    if (run.length > 1) {
      const cum = [0]; for (let k = 1; k < run.length; k++) cum.push(cum[k - 1] + len(sub(run[k], run[k - 1])));
      const L = cum[cum.length - 1], n = Math.max(1, Math.round(L / sp)), r2 = []; let q = 1;
      for (let k = 0; k <= n; k++) { const tg = L * k / n; while (q < cum.length - 1 && cum[q] < tg) q++; const sg = cum[q] - cum[q - 1] || 1; r2.push(lerp3(run[q - 1], run[q], Math.min(1, Math.max(0, (tg - cum[q - 1]) / sg)))); }
      run = r2;
      for (let r = 0; r < it; r++) { const o = [run[0]]; for (let k = 1; k < run.length - 1; k++) o.push([.25 * run[k - 1][0] + .5 * run[k][0] + .25 * run[k + 1][0], .25 * run[k - 1][1] + .5 * run[k][1] + .25 * run[k + 1][1], .25 * run[k - 1][2] + .5 * run[k][2] + .25 * run[k + 1][2]]); o.push(run[run.length - 1]); run = o; }
    }
    run.forEach((q2, k) => { P2.push(q2); V2.push(k > 0); });
    i = j;
  }
  return { p: P2, v: V2 };
}

// ═══════════════════════════════════════════════════════════════════════
const MODELS = {};

MODELS.kompas = { name: 'Kompas', tilt: [10, -28], build() {
  const P = new Pen(), T = .16;
  P.add(arc([0, 0, T], X, Y, 1, -90, 270));                  // voorrand
  P.add(seg([0, -1, T], [0, -1, -T]));                        // dikte
  P.add(arc([0, 0, -T], X, Y, 1, -90, 270));                 // achterrand
  P.add(seg([0, -1, -T], [0, -1, T]));
  P.add(seg([0, -1, T], [0, -.86, T + .02]));
  P.add(arc([0, 0, T + .02], X, Y, .86, -90, 270));          // binnenrand
  const tick = [];                                            // schaalverdeling als één getande ring
  for (let k = 0; k <= 720; k++) {
    const a = -90 + k / 2; let dep = 0;
    for (let j = 0; j < 16; j++) { const ta = -90 + j * 22.5, dd = Math.abs(((a - ta + 540) % 360) - 180); const td = j % 4 === 0 ? .17 : j % 2 === 0 ? .1 : .06; dep = Math.max(dep, td * Math.max(0, 1 - dd / 2.4)); }
    tick.push([(.78 - dep) * Math.cos(a * D), (.78 - dep) * Math.sin(a * D), T + .02]);
  }
  P.add(seg([0, -.86, T + .02], tick[0])); P.add(tick);
  const S = [0, -.6, .3], E = [.12, 0, .36], N = [0, .6, .3], W = [-.12, 0, .36], C = [0, 0, .4];
  P.add(poly([S, E, N, W, S, C]));                             // naald
  P.add(arc([0, 0, .41], X, Y, .045, -90, 270));
  P.add(poly([C, [0, .3, .36], N]));
  P.add(poly([N, [.05, .32, .33], [-.05, .32, .33], N]));     // noordpunt gevuld
  P.jump(seg([0, .99, 0], [0, 1.07, 0]));                       // beugel bovenop, haaks op de wijzerplaat
  P.add(arc([0, 1.23, 0], Z, Y, .16, -90, 270));
  return P;
} };

MODELS.wegwijzer = { name: 'Wegwijzer', tilt: [8, -30], build() {
  const P = new Pen(), w = .045, yb = -1.15, yt = .92;
  P.add(arc([0, yb, 0], X, Z, .6, 140, 500));                  // grond
  [[-.35, .25], [.3, .4], [.1, -.45]].forEach(([x, z]) => P.add(poly([[x - .06, yb, z], [x - .02, yb + .12, z], [x, yb, z], [x + .03, yb + .1, z], [x + .06, yb, z]])));
  P.add(seg(P.last, [-w, yb, w]));
  P.add(box([-w, yb, -w], [w, yt, w]));                        // paal
  P.add(poly([[-w, yt, -w], [0, yt + .1, 0], [w, yt, w], [w, yt, -w], [0, yt + .1, 0], [-w, yt, w]]));
  const sign = (y, yaw, L, flip) => {
    const h = .24, t = .035, tip = .15, s = flip ? -1 : 1;
    const o = [[w, -h / 2], [w + L, -h / 2], [w + L + tip, 0], [w + L, h / 2], [w, h / 2], [w, -h / 2]].map(([x, yy]) => [s * x, yy]);
    const f = poly(o.map(([x, yy]) => [x, y + yy, t])), b = poly(o.map(([x, yy]) => [x, y + yy, -t]));
    const r = p => rotY(p, yaw);
    const tp = [s * (w + L + tip), y, 0];
    return [f.map(r), seg(r([o[5][0], y + o[5][1], t]), r([o[5][0], y + o[5][1], -t])), b.map(r), seg(r([s * (w + L), y - h / 2, -t]), r([s * (w + L), y - h / 2, t])), seg(r([tp[0], y, t]), r([tp[0], y, -t]))];
  };
  const s1 = sign(.66, 18, .82), s2 = sign(.34, -35, .7, true), s3 = sign(.02, -70, .74);
  P.jump(s1[0]); P.add(s1[1]); P.add(s1[2]); P.jump(s1[3]); P.jump(s1[4]);
  P.jump(s2[0]); P.add(s2[1]); P.add(s2[2]); P.jump(s2[3]); P.jump(s2[4]);
  P.jump(s3[0]); P.add(s3[1]); P.add(s3[2]); P.jump(s3[3]); P.jump(s3[4]);
  return P;
} };

MODELS.appel = { name: 'Appel', tilt: [14, -20], build(d) {
  const P = new Pen();
  const prof = t => { const ph = t * Math.PI; const r = Math.sin(ph) * (1 + .12 * Math.cos(ph)) * .92; let y = -Math.cos(ph) * .78; y -= .16 * Math.exp(-Math.pow((Math.PI - ph) / .5, 2)); y += .08 * Math.exp(-Math.pow(ph / .45, 2)); return [r, y]; };
  P.add(revolve(prof, 7 + d, 1800, 90));
  const top = [0, prof(1)[1], 0];
  P.add(bez(top, [0, .78, 0], [.02, .92, .02], [.08, 1.04, .03]));            // steeltje
  const s = [.035, .86, .015], tip = [.52, 1.02, .22], m1 = [.22, 1.06, .02], m2 = [.36, .82, .24];
  P.jump(bez(s, m1, [.42, 1.12, .14], tip)); P.add(bez(tip, [.42, .86, .3], m2, s)); P.add(bez(s, [.2, .95, .1], [.36, .99, .17], tip)); // blad met nerf
  return P;
} };

// Rustig maar niet kaal: een stam met drie hoofdtakken die in een wolkvormige
// kruin verdwijnen. De kruin golft in de diepte, met binnenin een paar
// bladerpartijen; aan de rand hangen blaadjes en een paar dwarrelen omlaag.
// "Detail" geeft alleen meer blaadjes; de vorm van de boom blijft gelijk.
MODELS.boom = { name: 'Boom met vallend blad', tilt: [6, -20], build(d) {
  const P = new Pen(), R = rnd(8), cc = [0, .3, 0], RX = .78, RY = .56, RZ = .62;
  // blad: amandelvorm met nerf, licht gebogen; begint en eindigt bij de steel b
  const leaf = (b, t, roll, sz) => {
    t = unit(t); let u = cross(t, Y); if (len(u) < .2) u = cross(t, X); u = unit(rotAxis(unit(u), t, roll));
    const n = unit(cross(t, u)), p = (q, w) => add(add(b, mul(t, q * sz)), add(mul(u, w * sz), mul(n, .16 * q * q * sz)));
    const A = [], B = [];
    for (let k = 0; k <= 16; k++) { const q = k / 16, w = .34 * Math.sin(Math.PI * Math.pow(q, .75)); A.push(p(q, w)); B.push(p(q, -w)); }
    const mid = []; for (let k = 0; k <= 10; k++) mid.push(p(.78 * k / 10, 0));
    return [...A, ...B.reverse().slice(1), ...mid.slice(1), ...mid.reverse().slice(1)];
  };
  P.add(arc([0, -1, 0], X, Z, .5, 200, 560));                                 // grond
  // tak als smalle omtrek: aan de ene kant omhoog, aan de andere kant terug
  const branch = (base, dir, L, w, lvl) => {
    const tip = add(base, mul(dir, L)), wt = w * .58;
    let side = cross(dir, Z); if (len(side) < .2) side = cross(dir, X); side = unit(side);
    const bend = mul(cross(dir, side), (R() - .5) * L * .4);
    P.add(bez(add(base, mul(side, w)), add(add(base, mul(dir, L * .35)), add(mul(side, w * .85), bend)), add(add(base, mul(dir, L * .7)), add(mul(side, wt * 1.1), bend)), add(tip, mul(side, wt))));
    if (lvl > 0) {
      const n = lvl === 2 ? 3 : 2, az0 = R() * 360;
      for (let k = 0; k < n; k++) {
        const az = az0 + k * 360 / n + (R() - .5) * 50, tilt = (lvl === 2 ? 34 : 30) + R() * 14;
        const r0 = unit(rotAxis(dir, unit(rotAxis(side, dir, az * D)), tilt * D)), nd = unit([r0[0], r0[1] + .15, r0[2] * .55]);
        branch(tip, nd, L * (.7 + R() * .12), w * .6, lvl - 1);
      }
    }
    P.add(bez(add(tip, mul(side, -wt)), add(add(base, mul(dir, L * .7)), add(mul(side, -wt * 1.1), bend)), add(add(base, mul(dir, L * .35)), add(mul(side, -w * .85), bend)), add(base, mul(side, -w))));
  };
  P.add(seg(P.last, [.1, -1, 0]));
  branch([0, -1, 0], [0, 1, 0], .8, .1, 2);
  // kruin: wolkcontour met bollingen van wisselende grootte, golvend in de diepte
  const W = []; let tot = 0; for (let k = 0; k < 11; k++) { const w = .7 + R() * .6; W.push(w); tot += w; }
  const crown = [], a0 = -90 + (R() - .5) * 20; let acc = 0;
  W.forEach((w, k) => {
    const amp = .11 * (.75 + R() * .5), n = 26;
    for (let j = (k ? 1 : 0); j <= n; j++) {
      const th = (a0 + 360 * (acc + w * j / n) / tot) * D, bump = 1 + amp * Math.pow(Math.max(0, Math.sin(Math.PI * j / n)), .7);
      crown.push([cc[0] + RX * bump * Math.cos(th), cc[1] + RY * bump * Math.sin(th), cc[2] + RZ * .45 * Math.sin(2 * th + 1) * bump]);
    }
    acc += w;
  });
  P.jump(crown);
  // binnenin: bladerpartijen als twee bolletjes, op verschillende diepte
  for (let k = 0; k < 3; k++) {
    const az = (k / 3) * 360 + R() * 40, c = add(cc, [Math.cos(az * D) * .38, (R() - .3) * .3, Math.sin(az * D) * .38]), r = .17 + R() * .07;
    const u = unit(rotY(X, -az * .3)), r2 = r * (.6 + R() * .25);
    P.jump(arc(c, u, Y, r, 172, 18));
    P.add(arc(add(c, mul(u, (r + r2) * .82)), u, Y, r2, 168, 22));
  }
  // blaadjes aan de rand van de kruin
  const nl = 5 + Math.round(clampN(d, 1, 10) * .6);
  for (let k = 0; k < nl; k++) {
    const i = Math.floor((k + R() * .6) / nl * crown.length) % crown.length, p0 = crown[i];
    const out = unit(sub(p0, cc)), t = unit(add(out, [(R() - .5) * .6, -.35, (R() - .5) * .6]));
    P.jump(leaf(p0, t, R() * 6, .13));
  }
  [[-.82, -.42, .2, .9], [.74, -.66, -.1, 2.4], [-.46, -.9, .3, 4.1]].forEach(([x, y, z, r]) =>   // dwarrelende blaadjes
    P.jump(leaf([x, y, z], [Math.cos(r), Math.sin(r) * .6, Math.sin(r * 1.3) * .5], r * 1.7, .17)));
  return P;
} };

MODELS.diamant = { name: 'Diamant', tilt: [16, -16], build() {
  const P = new Pen(), yt = .42, rt = .48, yg = .1, rg = 1, yc = -1.05;
  const T = k => at(22.5 + 45 * k, yt, rt), Gp = j => at(22.5 * j, yg, rg), Gl = j => at(22.5 * j, yg - .07, rg);
  P.add(poly([0, 1, 2, 3, 4, 5, 6, 7, 0].map(T)));                           // tafel
  const zig = []; for (let k = 0; k <= 8; k++) { zig.push(T(k % 8)); if (k < 8) zig.push(Gp(2 * k + 1)); }
  P.add(poly(zig));                                                           // kroon
  P.add(seg(T(0), Gp(1)));
  P.add(poly(Array.from({ length: 17 }, (_, j) => Gp((j + 1) % 16))));       // rondist
  P.add(seg(Gp(1), Gl(1)));
  P.add(poly(Array.from({ length: 17 }, (_, j) => Gl((j + 1) % 16))));
  const pav = []; for (let k = 0; k < 8; k++) { pav.push(Gl(2 * k + 1)); pav.push([0, yc, 0]); } pav.push(Gl(1));
  P.add(poly(pav));                                                           // paviljoen
  return P;
} };

MODELS.vraagteken = { name: 'Vraagteken', tilt: [8, -34], build() {
  const P = new Pen(), z = .1;
  const c = [0, .42], r = .4, pts = [];
  for (let a = 165; a >= -40; a -= 2) pts.push([c[0] + r * Math.cos(a * D), c[1] + r * Math.sin(a * D)]);
  const e = pts[pts.length - 1];
  const tail = bez([e[0], e[1], 0], [e[0] - .12, e[1] - .12, 0], [0, .08, 0], [0, -.05, 0]).map(p => [p[0], p[1]]);
  const all = pts.concat(tail.slice(1), [[0, -.28]]);
  const f = poly(all.map(p => [p[0], p[1], z])), b = poly(all.map(p => [p[0], p[1], -z]));
  P.add(f); P.add(seg(f[f.length - 1], b[b.length - 1])); P.add(b.slice().reverse()); P.add(seg(b[0], f[0]));
  P.jump(revolve(t => [Math.sin(t * Math.PI) * .11, -.55 - Math.cos(t * Math.PI) * .11], 5, 400, 90)); // punt als bolletje
  return P;
} };

MODELS.herstel = { name: 'Herstel (veer die tot rust komt)', tilt: [10, -38], build(d) {
  const P = new Pen(), turns = 7 + d, n = 1600;
  P.add(bez([-1.15, .85, 0], [-1.15, .3, 0], [-1.1, .0, 0], [-1.0, .5, 0]));
  const o = []; for (let k = 0; k <= n; k++) { const t = k / n, x = -1 + 1.6 * t, r = .5 * Math.pow(1 - t, 1.3) + .03, a = 90 + turns * 360 * t; o.push([x, r * Math.sin(a * D), r * Math.cos(a * D)]); }
  P.add(o); P.add(bez(o[o.length - 1], [.75, .03, 0], [.95, .02, 0], [1.15, .12, 0]));
  return P;
} };

MODELS.zandloper = { name: 'Zandloper', tilt: [14, -22], build(d) {
  const P = new Pen();
  const band = (yTop, yBot, R, bulge, a0) => revolve(t => [R + bulge * Math.sin(t * Math.PI), yTop + (yBot - yTop) * t], 3, 540, a0);
  // bovenplaat met bolle rand en een knop
  P.add(ring(1.0, .66, 90)); P.add(band(1.0, .86, .66, .08, 90)); P.add(ring(.86, .66, 90));
  P.jump(ball([0, 1.08, 0], .06, 4));
  // drie gedraaide palen met kralen
  const post = ang => {
    const c = at(ang, 0, .56), beads = [.6, 0, -.6], rb = .05;
    P.jump(seg(add(c, [0, .86, 0]), add(c, [0, beads[0] + rb, 0])));
    beads.forEach((b, i) => {
      const cb = add(c, [0, b, 0]);                                              // sierring: twee ringen
      P.add(seg(add(cb, [0, rb, 0]), add(cb, [0, rb * .4, .045]))); P.add(arc(add(cb, [0, rb * .4, 0]), Z, X, .045, 0, 360)); P.add(seg(add(cb, [0, rb * .4, .045]), add(cb, [0, -rb * .4, .045]))); P.add(arc(add(cb, [0, -rb * .4, 0]), Z, X, .045, 0, 360)); P.add(seg(add(cb, [0, -rb * .4, .045]), add(cb, [0, -rb, 0])));
      P.add(seg(add(c, [0, b - rb, 0]), add(c, [0, i < 2 ? beads[i + 1] + rb : -.86, 0])));
    });
  };
  post(30); post(150); post(270);
  // onderplaat
  P.jump(ring(-.86, .66, 90)); P.add(band(-.86, -1.0, .66, .08, 90)); P.add(ring(-1.0, .66, 90));
  // glas: meridianen op en neer
  const gr = y => .06 + .5 * y * y;
  const mer = (a, up) => { const o = []; for (let k = 0; k <= 90; k++) { const y = up ? -.84 + 1.68 * k / 90 : .84 - 1.68 * k / 90; o.push(at(a, y, gr(y))); } return o; };
  P.jump(ring(.84, gr(.84), 0));
  let top = true;
  for (let k = 0; k < 8; k++) {
    const a = k * 45;
    P.add(mer(a, !top)); top = !top;
    P.add(arc([0, top ? .84 : -.84, 0], X, Z, gr(.84), a, a + 45));
  }
  P.jump(ring(-.84, gr(.84), 0));
  // zand: bovenste laag, straaltje, hoopje
  const ys = .32;
  P.jump(revolve(t => [gr(ys) * (1 - t) + .02 * t, ys - .24 * t * t], 3, 360, 90));
  P.add(seg([0, ys - .24, .02], [0, -.56, .02]));
  P.add(revolve(t => [.02 + .4 * t, -.56 - .26 * t], 4, 520, 90));
  return P;
} };

MODELS.anker = { name: 'Anker', tilt: [6, -32], build() {
  const P = new Pen(), c = [0, -.2, 0], Ro = .8, Ri = .68;
  const po = a => add(c, [Ro * Math.cos(a * D), Ro * Math.sin(a * D), 0]), pi = a => add(c, [Ri * Math.cos(a * D), Ri * Math.sin(a * D), 0]);
  const ai = 270 + Math.asin(.05 / Ri) / D, aiL = 270 - Math.asin(.05 / Ri) / D;
  P.add(poly([pi(200), [-.7, -.32, 0], [-.97, -.13, 0], po(200)]));           // linker ankerblad
  P.add(arc(c, X, Y, Ro, 200, 340));
  P.add(poly([po(340), [.97, -.13, 0], [.7, -.32, 0], pi(340)]));             // rechter ankerblad
  P.add(arc(c, X, Y, Ri, 340, ai));
  P.add(seg(pi(ai), [.05, .72, 0]));                                           // schacht
  P.add(seg([.05, .72, 0], [0, .72, .5])); P.add(ball([0, .72, .56], .06, 4)); // dwarsstok met bolle uiteinden
  P.add(seg([0, .72, .5], [0, .72, -.5])); P.add(ball([0, .72, -.56], .06, 4));
  P.add(seg([0, .72, -.5], [.05, .72, 0]));
  P.add(seg([.05, .72, 0], [.05, .83, 0]));
  P.add(arc([0, 1.0, 0], X, Y, .19, -75, 255)); P.add(seg([-.049, .816, 0], [-.031, .885, 0])); P.add(arc([0, 1.0, 0], X, Y, .118, 255, -75)); P.add(seg([.031, .885, 0], [.05, .83, 0])); // oog
  P.jump(seg([-.05, .83, 0], pi(aiL)));
  P.add(arc(c, X, Y, Ri, aiL, 200));
  chain([.15, 1.07, 0], [.78, .5, .05], 5, .075).forEach(l => P.jump(l));      // ketting
  P.jump(coil([0, .52, 0], [0, -.3, 0], .085, 7));                             // touw om de schacht
  return P;
} };

MODELS.boek = { name: 'Open boek', tilt: [36, -16], build() {
  const P = new Pen(), L = .95, W = .66, lerp1 = (a, b, t) => a + (b - a) * t;
  const pg = (x, lift) => lift + .2 * Math.sin(Math.min(1, Math.abs(x) / L) * Math.PI / 2) - .05 * Math.exp(-((x / .1) ** 2));
  const edge = (x0, x1, z, lift) => { const o = []; for (let k = 0; k <= 70; k++) { const x = lerp1(x0, x1, k / 70); o.push([x, pg(x, lift), z]); } return o; };
  // twee bladzijden met de rug in het midden
  P.add(edge(0, -L, W, .1)); P.add(seg([-L, pg(-L, .1), W], [-L, pg(-L, .1), -W])); P.add(edge(-L, 0, -W, .1));
  P.add(seg([0, pg(0, .1), -W], [0, pg(0, .1), W]));
  P.add(edge(0, L, W, .1)); P.add(seg([L, pg(L, .1), W], [L, pg(L, .1), -W])); P.add(edge(L, 0, -W, .1));
  // dikte van het papier
  [.068, .036, .004].forEach(lift => { P.jump(edge(-.14, -L + .02, W, lift)); P.jump(edge(.14, L - .02, W, lift)); });
  // kaft eronder
  P.jump(edge(-L - .06, L + .06, W + .05, -.05)); P.add(seg([L + .06, pg(L, -.05), W + .05], [L + .06, pg(L, -.05), -W - .05]));
  P.add(edge(L + .06, -L - .06, -W - .05, -.05)); P.add(seg([-L - .06, pg(L, -.05), -W - .05], [-L - .06, pg(L, -.05), W + .05]));
  // tekstregels (woorden) op beide bladzijden
  for (const side of [-1, 1]) for (let r = 0; r < 6; r++) {
    const z = .46 - r * .17; let x = .2;
    while (x < .82) {
      const wl = .08 + ((r * 7 + x * 13) % 1) * .12, o = [];
      for (let k = 0; k <= 24; k++) { const xx = side * (x + wl * k / 24); o.push([xx, pg(xx, .1) + .006, z + .014 * Math.sin(k * .8)]); }
      P.jump(o); x += wl + .05;
    }
  }
  // leeslint over de rug, hangt aan de voorkant naar beneden
  P.jump(seg([.02, pg(0, .1) + .01, -W + .08], [.02, pg(0, .1) + .01, W - .02]));
  P.add(bez([.02, pg(0, .1) + .01, W - .02], [.03, -.02, W + .08], [.05, -.18, W + .1], [.08, -.36, W + .06]));
  return P;
} };

MODELS.boeken = { name: 'Boekenplank', tilt: [10, -26], build() {
  const P = new Pen(), yb = -.85;
  P.add(box([-1.45, yb - .1, -.5], [1.6, yb, .56]));                          // plank
  const books = [[-1.35, .2, 1.45, .82], [-1.13, .16, 1.24, .74], [-.95, .27, 1.64, .86], [-.66, .18, 1.32, .78], [-.46, .22, 1.52, .8], [-.22, .15, 1.18, .72]];
  books.forEach(([x, w, h, dd], i) => {
    const f = dd / 2;
    P.jump(box([x, yb, -f], [x + w, yb + h, f]));
    P.jump(seg([x, yb + h * .86, f], [x + w, yb + h * .86, f]));
    P.jump(seg([x, yb + h * .12, f], [x + w, yb + h * .12, f]));
    const t = []; for (let k = 0; k <= 60; k++) t.push([x + w / 2 + w * .16 * Math.sin(k * .55 + i), yb + h * (.3 + .45 * k / 60), f]);
    P.jump(t);                                                                  // titel op de rug
    if (i % 2 === 0) P.jump(rrect([x + w / 2, yb + h * .2, f + .001], X, Y, w * .55, h * .05, .012));
  });
  const piv = [.24, yb, 0], tf = p => add(piv, rotZ(sub(p, piv), 22));           // schuin leunend boek
  P.jump(box([.02, yb, -.42], [.24, yb + 1.42, .42], tf)); P.jump(seg(tf([.02, yb + 1.15, .42]), tf([.24, yb + 1.15, .42])));
  [[.62, 0, .16, .82, .7], [.66, .16, .13, .76, .64], [.6, .29, .14, .8, .68]].forEach(([x, y0, hh, ww, dd]) => {
    P.jump(box([x, yb + y0, -dd / 2], [x + ww, yb + y0 + hh, dd / 2]));          // liggende stapel
    P.jump(seg([x, yb + y0 + hh / 2, dd / 2], [x + ww, yb + y0 + hh / 2, dd / 2]));
  });
  return P;
} };

MODELS.lego = { name: 'Legostenen', tilt: [24, -30], build() {
  const P = new Pen(), U2 = .4, H = .48;
  const bricks = [
    { c: [-.3, -1, 0], nx: 4, nz: 2, ry: 0 }, { c: [.1, -.52, 0], nx: 4, nz: 2, ry: 0 }, { c: [.1, -.04, 0], nx: 2, nz: 2, ry: 40 },
    { c: [.1, .44, 0], nx: 2, nz: 1, ry: 40 }, { c: [.35, -1, 1.1], nx: 4, nz: 1, ry: -18 }, { c: [-1.35, -1, .8], nx: 2, nz: 2, ry: 28 },
    { c: [-1.35, -.52, .8], nx: 2, nz: 1, ry: 28 }, { c: [1.35, -1, -.2], nx: 2, nz: 2, ry: -35 }];
  const local = (b, p) => add(rotY([p[0] - b.nx * U2 / 2, p[1], p[2] - b.nz * U2 / 2], b.ry), b.c);
  const inv = (b, q) => { const r = rotY(sub(q, b.c), -b.ry); return [r[0] + b.nx * U2 / 2, r[1], r[2] + b.nz * U2 / 2]; };
  bricks.forEach(b => {
    const w = b.nx * U2, dd = b.nz * U2;
    P.jump(box([0, 0, 0], [w, H, dd], p => local(b, p)));
    for (let i = 0; i < b.nx; i++) for (let j = 0; j < b.nz; j++) {
      const sp = local(b, [(i + .5) * U2, H, (j + .5) * U2]);
      const covered = bricks.some(o => o !== b && Math.abs(o.c[1] - (b.c[1] + H)) < .02 && (() => { const q = inv(o, sp); return q[0] > 0 && q[0] < o.nx * U2 && q[2] > 0 && q[2] < o.nz * U2; })());
      if (covered) continue;
      const base = arc(sp, X, Z, .12, 90, 450), topR = arc(add(sp, [0, .1, 0]), X, Z, .12, 90, 450);
      P.jump(base); P.add(seg(base[base.length - 1], topR[0])); P.add(topR);
    }
  });
  return P;
} };

// Rustig gehouden: alleen de zichtbare kant (voor, rechts, boven) krijgt vakjes,
// en de achterste ribben vallen weg. De lagen staan iets verdraaid ten opzichte van elkaar.
MODELS.rubiks = { name: "Rubik's kubus", tilt: [26, -34], build() {
  const P = new Pen(), s = .9, g = .05, cell = 2 * s / 3, angs = [-5, 6, 22];
  for (let L = 0; L < 3; L++) {
    const y0 = -s + L * cell + g / 2, y1 = -s + (L + 1) * cell - g / 2, tf = p => rotY(p, angs[L]), ym = (y0 + y1) / 2, sz = cell * .7, hh = (y1 - y0) * .7;
    const c = (x, y, z) => tf([x, y, z]);
    // omtrek van de laag: bovenrand voor, rib rechtsachter, onderrand voor, rib linksvoor
    P.jump(poly([c(-s, y1, s), c(s, y1, s), c(s, y1, -s), c(s, y0, -s), c(s, y0, s), c(-s, y0, s), c(-s, y1, s)]));
    P.jump(poly([c(s, y1, s), c(s, y0, s)]));                                   // voorste rib
    if (L === 2) P.jump(poly([c(-s, y1, s), c(-s, y1, -s), c(s, y1, -s)]));       // bovenvlak helemaal
    [[Z, X], [X, [0, 0, -1]]].forEach(([n, u]) => {
      for (let j = -1; j <= 1; j++) { const m = add(mul(n, s + .003), mul(u, j * cell)); m[1] = ym; P.jump(rrect(m, u, Y, sz, hh, .06).map(tf)); }
    });
    if (L === 2) for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) P.jump(rrect([i * cell, y1 + .003, j * cell], X, Z, sz, sz, .06).map(tf));
  }
  return P;
} };

MODELS.taart = { name: 'Taart', tilt: [24, -16], build() {
  const P = new Pen();
  const tier = (r, y0, y1) => {
    const nb = Math.round(r * 46), beads = []; for (let k = 0; k <= nb * 40; k++) { const t = k / (nb * 40) * 2 * Math.PI, a = t * nb, rr = r + .03 + .028 * Math.cos(a); beads.push([rr * Math.cos(t), y0 + .03 + .028 * Math.sin(a), rr * Math.sin(t)]); }
    P.jump(beads);                                                              // parelrand
    P.add(seg([r, y0 + .06, 0], [r, y1 - .07, 0]));
    const drip = []; for (let k = 0; k <= 900; k++) { const t = k / 900 * 2 * Math.PI, dd = .1 * Math.pow(Math.max(0, Math.sin(t * 7)), 4) + .04 * Math.pow(Math.max(0, Math.sin(t * 11 + 1)), 6); drip.push([r * Math.cos(t), y1 - .07 - dd, r * Math.sin(t)]); }
    P.add(drip);                                                                // druipende slagroom
    P.add(seg([r, y1 - .07, 0], [r, y1, 0])); P.add(ring(y1, r, 0));
    [120, 240].forEach(a => P.jump(seg(at(a, y0 + .06, r), at(a, y1 - .09, r))));
  };
  tier(.95, -.8, -.3); tier(.58, -.3, .12);
  [90, 210, 330].forEach(a => {                                                 // kaarsjes met vlammetjes
    const b = at(a, .12, .3), tp = add(b, [0, .32, 0]), fl = add(tp, [0, .06, 0]), f2 = add(fl, [0, .22, 0]);
    P.jump(arc(b, X, Z, .045, 0, 360)); P.add(coil(b, tp, .045, 3)); P.add(arc(tp, X, Z, .045, 0, 360));
    P.add(seg(tp, fl));
    P.add(bez(fl, add(fl, [.07, .05, 0]), add(fl, [.03, .17, 0]), f2)); P.add(bez(f2, add(fl, [-.03, .17, 0]), add(fl, [-.07, .05, 0]), fl));
    P.add(bez(fl, add(fl, [0, .05, .07]), add(fl, [0, .17, .03]), f2)); P.add(bez(f2, add(fl, [0, .17, -.03]), add(fl, [0, .05, -.07]), fl));
  });
  const pc = [.2, -.8, 1.35];                                                  // bordje met een taartpunt
  P.jump(arc(pc, X, Z, .46, 0, 360)); P.add(arc(add(pc, [0, .03, 0]), X, Z, .38, 0, 360));
  const wtf = p => add(rotY(p, -115), add(pc, [-.12, .035, .08]));
  const aT = arc([0, .4, 0], X, Z, .58, -24, 24), aB = arc([0, 0, 0], X, Z, .58, -24, 24), aM = arc([0, .2, 0], X, Z, .58, -24, 24);
  P.jump(poly([[0, .4, 0], aT[0]]).map(wtf)); P.add(aT.map(wtf)); P.add(poly([aT[aT.length - 1], [0, .4, 0], [0, 0, 0], aB[0]]).map(wtf)); P.add(aB.map(wtf)); P.add(seg(aB[aB.length - 1], [0, 0, 0]).map(wtf));
  P.jump(seg(aB[0], aT[0]).map(wtf)); P.jump(seg(aB[aB.length - 1], aT[aT.length - 1]).map(wtf));
  P.jump(poly([[0, .2, 0], aM[0]]).map(wtf)); P.add(aM.map(wtf)); P.add(seg(aM[aM.length - 1], [0, .2, 0]).map(wtf));
  P.jump(ball(wtf([.4, .47, 0]), .06, 4));                                     // kersje
  return P;
} };

MODELS.sleutel = { name: 'Steeksleutel', tilt: [32, -24], build() {
  const P = new Pen(), z = .05, hc = [.8, 0], hr = .3, rc = [-.8, 0], rr = .27, tilt = 15;
  const joinA = Math.asin(.1 / hr) / D, rj = Math.asin(.085 / rr) / D;
  const dir = [Math.cos(tilt * D), Math.sin(tilt * D)], nrm = [-dir[1], dir[0]];
  const jp = (along, side) => [hc[0] + dir[0] * along + nrm[0] * side, hc[1] + dir[1] * along + nrm[1] * side];
  const o = [[rc[0] + rr * Math.cos(rj * D), .085], [hc[0] - hr * Math.cos(joinA * D), .1]];
  for (let a = 180 - joinA; a > tilt + 40; a -= 4) o.push([hc[0] + hr * Math.cos(a * D), hr * Math.sin(a * D)]);
  o.push([hc[0] + hr * Math.cos((tilt + 40) * D), hr * Math.sin((tilt + 40) * D)], jp(.08, .115), jp(-.04, .11), jp(-.09, 0), jp(-.04, -.11), jp(.08, -.115), [hc[0] + hr * Math.cos((tilt - 40) * D), hr * Math.sin((tilt - 40) * D)]);
  for (let a = tilt - 40; a > -180 + joinA; a -= 4) o.push([hc[0] + hr * Math.cos(a * D), hr * Math.sin(a * D)]);
  o.push([hc[0] - hr * Math.cos(joinA * D), -.1], [rc[0] + rr * Math.cos(rj * D), -.085]);
  for (let a = -rj; a > -360 + rj; a -= 4) o.push([rc[0] + rr * Math.cos(a * D), rr * Math.sin(a * D)]);
  o.push(o[0]);
  const f = poly(o.map(p => [p[0], p[1], z])), b = poly(o.map(p => [p[0], p[1], -z]));
  P.add(f); P.add(seg(f[f.length - 1], b[b.length - 1])); P.add(b.slice().reverse());
  const star = zz => { const s = []; for (let k = 0; k <= 24; k++) { const a = k * 15 * D, r = k % 2 ? .13 : .165; s.push([rc[0] + r * Math.cos(a), r * Math.sin(a), zz]); } return poly(s); };
  P.jump(star(z)); P.jump(star(-z));                                            // ringkant met 12 punten
  P.jump(rrect([-.05, 0, z + .002], X, Y, .82, .075, .035));                   // groef in de steel
  [jp(.08, .115), jp(.08, -.115), [rc[0] - rr, 0], [hc[0], hr], [hc[0], -hr]].forEach(p => P.jump(seg([p[0], p[1], z], [p[0], p[1], -z])));
  return P;
} };

MODELS.weegschaal = { name: 'Weegschaal', tilt: [12, -22], build() {
  const P = new Pen(), by = .64;
  // getrapte voet met een koepeltje
  P.add(ring(-1, .56, 90)); P.add(seg(at(90, -1, .56), at(90, -.95, .56))); P.add(ring(-.95, .56, 90));
  P.add(seg(at(90, -.95, .56), at(90, -.95, .44))); P.add(ring(-.95, .44, 90)); P.add(seg(at(90, -.95, .44), at(90, -.9, .44))); P.add(ring(-.9, .44, 90));
  for (let k = 0; k < 4; k++) { const a = 90 + k * 90; const m = []; for (let j = 0; j <= 30; j++) { const u = j / 30; m.push(at(a, -.9 + .08 * Math.sin(u * Math.PI / 2), .44 * (1 - u) + .05 * u)); } P.jump(m); }
  // zuil: drie staven met sierringen
  [0, 120, 240].forEach(a => P.jump(seg(at(a, -.83, .04), at(a, .62, .04))));
  [-.6, -.1, .42].forEach(y => { P.jump(ring(y + .025, .075, 90)); P.add(seg(at(90, y + .025, .075), at(90, y - .025, .075))); P.add(ring(y - .025, .075, 90)); });
  P.jump(seg([0, .62, 0], [0, .63, 0]));
  P.add(ball([0, .7, 0], .07, 4)); P.add(seg([0, .77, 0], [0, .86, 0])); P.add(ball([0, .89, 0], .028, 3));
  const beam = s => { const o = []; for (let k = 0; k <= 80; k++) { const x = -1 + 2 * k / 80; o.push([x, by + .06 * (1 - x * x) + s, 0]); } return o; };
  P.jump(beam(.022)); P.add(arc([1.04, by + .0, 0], X, Y, .042, 120, -200)); P.add(beam(-.022).reverse()); P.add(arc([-1.04, by, 0], X, Y, .042, -60, 260)); // gebogen balk met krullen
  [-.95, .95].forEach(x => {
    const hp = [x, by - .03, 0], pc = [x, -.25, 0], r = .34;
    [90, 210, 330].forEach(a => chain(hp, add(pc, [r * Math.cos(a * D), 0, r * Math.sin(a * D)]), 6, .05).forEach(l => P.jump(l)));
    P.jump(arc(pc, X, Z, r, 90, 450));                                          // schaal: rand, bodem en vier lijnen
    for (let k = 0; k < 4; k++) { const a = 90 + k * 90, m = []; for (let j = 0; j <= 30; j++) { const u = j / 30; m.push(add(pc, at(a, -.13 * Math.sin(u * Math.PI / 2), r * (1 - u) + .1 * u))); } if (k % 2 === 0) { P.add(m); P.add(arc(add(pc, [0, -.13, 0]), X, Z, .1, a, a + 90)); } else { P.add(m.slice().reverse()); P.add(arc(pc, X, Z, r, a, a + 90)); } }
  });
  return P;
} };

const shapeCache = new Map();
function build(name, detail) {
  const key = name + ':' + detail;
  if (shapeCache.has(key)) return shapeCache.get(key);
  const m = MODELS[name]; if (!m) return null;
  const raw = m.build(detail || 5), pen = smoothRuns(raw.p, raw.v, .012, 6);
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  pen.p.forEach(p => { for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], p[a]); mx[a] = Math.max(mx[a], p[a]); } });
  const c = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
  let ext = 0; pen.p.forEach(p => { ext = Math.max(ext, Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2])); }); ext = ext * .92 || 1;
  const out = { p: pen.p.map(p => [(p[0] - c[0]) / ext, (p[1] - c[1]) / ext, (p[2] - c[2]) / ext]), v: pen.v.slice() };
  shapeCache.set(key, out);
  return out;
}

// Bibliotheek: welk 3D-model hoort bij welke tekening uit One Line Prezi.
// model = echte 3D-tekening, relief = de 2D-tekening bolt automatisch op,
// text = handgeschreven tekst als 3D-lijn.
const LIBRARY = {
  'anker': { model: 'anker' }, 'appel': { model: 'appel' }, 'autonomie': { relief: 2.4 }, 'bed': { relief: 2.2 },
  'boek': { model: 'boek' }, 'boeken': { model: 'boeken' }, 'boom-loslaten': { model: 'boom' }, 'bullitpoints': { model: 'opsomming' },
  'diamant-model-leget': { model: 'diamant' }, 'dimensies-nolan': { relief: 2 }, 'gesprek': { relief: 2.4 }, 'gesprek4': { relief: 2.4 },
  'hand': { model: 'helling' }, 'handa': { relief: 2.6 }, 'herstel-na-trauma': { model: 'herstel' }, 'kompas': { model: 'kompas' },
  'lego': { model: 'lego' }, 'palliatief-diagram': { model: 'trap' }, 'rubiks-kubus': { model: 'rubiks' }, 'taartjes': { model: 'taart' },
  'tang': { model: 'sleutel' }, 'tot-ziens': { text: 'Tot ziens', deform: 'cilinder', depth: .9 }, 'twee-handen': { relief: 2.4 },
  'twijfeltafel': { relief: 2.4 }, 'vragen': { model: 'vraagteken' }, 'vuist': { relief: 2.8 }, 'wandelaar': { relief: 2.6 },
  'weegschaal': { model: 'weegschaal' }, 'wegwijzer': { model: 'wegwijzer' }, 'welkom': { text: 'Welkom', deform: 'golf', depth: .9 }, 'zandloper': { model: 'zandloper' }
};
function libraryFor(file) {
  const base = String(file || '').toLowerCase().replace(/\.svg$/, '').replace(/(-\d+)+$/, '');
  return LIBRARY[base] || { relief: 2.2 };
}

const RELIEF = { 'wandelaar': .8, 'gesprek': .7, 'gesprek4': .7, 'twijfeltafel': .7, 'autonomie': .75, 'bed': .7, 'handa': .8, 'twee-handen': .75, 'vuist': .85, 'dimensies-nolan': .6 };
const baseName = file => String(file || '').toLowerCase().replace(/\.svg$/, '').replace(/(-\d+)+$/, '');
const reliefDepth = file => RELIEF[baseName(file)] || 0;
G.OLP3D_MODELS = { MODELS, build, libraryFor, reliefDepth };
// Kleine voorvertoning (SVG-pad, pen omhoog = nieuw stuk) voor knoppen en miniaturen.
G.OLP3D_MODELS.preview = function (name, detail, tx, ty, size) {
  const m = build(name, detail || 5); if (!m) return '';
  const T = MODELS[name].tilt || [12, -26];
  const a = (tx ?? T[0]) * D, b = (ty ?? T[1]) * D, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
  const step = Math.max(1, Math.floor(m.p.length / 1200)); let d = '';
  for (let k = 0; k < m.p.length; k += step) {
    const [x, y, z] = m.p[k];
    const y2 = y * ca - z * sa, z1 = y * sa + z * ca, x1 = x * cb + z1 * sb; // eerst om x, dan om y (Euler YXZ)
    let up = !k; for (let j = Math.max(1, k - step + 1); j <= k; j++) if (!m.v[j]) up = true;
    d += (up ? 'M' : 'L') + ((x1 * .46 + .5) * size).toFixed(1) + ' ' + ((-y2 * .46 + .5) * size).toFixed(1);
  }
  return d;
};
})(window);
