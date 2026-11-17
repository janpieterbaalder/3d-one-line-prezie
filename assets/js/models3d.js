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
    else if (jump) { this.p.push(pts[0]); this.v.push(false); k0 = 1; }
    for (let k = k0; k < pts.length; k++) { this.p.push(pts[k]); this.v.push(true); }
    return this;
  }
  jump(pts) { return this.add(pts, true); }
  many(list) { list.forEach(l => this.add(l)); return this; }
}
const ring = (y, r, a0, rr) => arc([0, y, 0], X, Z, r, a0 ?? 90, (a0 ?? 90) + 360, rr);
const at = (a, y, r) => [r * Math.cos(a * D), y, r * Math.sin(a * D)];

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

MODELS.zandloper = { name: 'Zandloper', tilt: [16, -20], build(d) {
  const P = new Pen(), R = .72, rp = .62;
  P.add(ring(1, R, 30)); P.add(seg(at(30, 1, R), at(30, .88, R))); P.add(ring(.88, R, 30));
  P.add(seg(at(30, .88, R), at(30, .88, rp)));
  P.add(seg(at(30, .88, rp), at(30, -.88, rp)));               // paal 1
  P.add(seg(at(30, -.88, rp), at(30, -.88, R)));
  P.add(arc([0, -.88, 0], X, Z, R, 30, 390)); P.add(seg(at(30, -.88, R), at(30, -1, R))); P.add(arc([0, -1, 0], X, Z, R, 30, 390));
  P.add(seg(at(30, -1, R), at(30, -.88, R)));
  P.add(arc([0, -.88, 0], X, Z, R, 30, 150)); P.add(seg(at(150, -.88, R), at(150, -.88, rp)));
  P.add(seg(at(150, -.88, rp), at(150, .88, rp)));             // paal 2
  P.add(seg(at(150, .88, rp), at(150, .88, R))); P.add(arc([0, .88, 0], X, Z, R, 150, 270)); P.add(seg(at(270, .88, R), at(270, .88, rp)));
  P.add(seg(at(270, .88, rp), at(270, -.88, rp)));             // paal 3
  const prof = t => { const y = -.86 + 1.72 * t; return [.07 + .5 * y * y, y]; };
  P.add(revolve(prof, 4 + Math.round(d / 3), 1400, 270));      // glas
  const ys = .3, rs = .07 + .5 * ys * ys;
  P.jump(ring(ys, rs, 270)); P.add(seg(at(270, ys, rs), [0, ys - .05, 0])); P.add(seg([0, ys - .05, 0], [0, -.56, 0])); // zand valt
  P.add(revolve(t => [.02 + .38 * t, -.56 - .3 * t], 3, 500, 270)); // zandhoop
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

MODELS.anker = { name: 'Anker', tilt: [6, -32], build() {
  const P = new Pen(), c = [0, -.2, 0], Ro = .8, Ri = .68;
  const po = a => add(c, [Ro * Math.cos(a * D), Ro * Math.sin(a * D), 0]), pi = a => add(c, [Ri * Math.cos(a * D), Ri * Math.sin(a * D), 0]);
  const ai = 270 + Math.asin(.05 / Ri) / D, aiL = 270 - Math.asin(.05 / Ri) / D;
  P.add(poly([pi(200), [-.72, -.3, 0], [-.95, -.16, 0], po(200)]));        // linker ankerblad
  P.add(arc(c, X, Y, Ro, 200, 340));
  P.add(poly([po(340), [.95, -.16, 0], [.72, -.3, 0], pi(340)]));           // rechter ankerblad
  P.add(arc(c, X, Y, Ri, 340, ai));
  P.add(seg(pi(ai), [.05, .72, 0]));                                         // schacht rechts
  P.add(poly([[.05, .72, 0], [0, .72, .55]])); P.add(arc([0, .72, .55], X, Y, .05, 180, 540)); // dwarsstok (haaks!)
  P.add(seg([0, .72, .55], [0, .72, -.55])); P.add(arc([0, .72, -.55], X, Y, .05, 180, 540));
  P.add(seg([0, .72, -.55], [.05, .72, 0]));
  P.add(seg([.05, .72, 0], [.05, .85, 0]));
  P.add(arc([0, 1.0, 0], X, Y, .155, -71, 251));                              // oog
  P.add(seg([-.05, .85, 0], pi(aiL)));                                        // schacht links
  P.add(arc(c, X, Y, Ri, aiL, 200));
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

MODELS.boek = { name: 'Boek', tilt: [26, -24], build() {
  const P = new Pen(), L = .95, W = .62, yc = .13;
  P.add(poly([[-L, yc, W], [L, yc, W], [L, yc, -W], [-L, yc, -W]]));
  P.add(arc([-L, 0, -W], X, Y, yc, 90, 270));                                 // rug achter
  P.add(poly([[-L, -yc, -W], [L, -yc, -W], [L, -yc, W], [-L, -yc, W]]));
  P.add(arc([-L, 0, W], X, Y, yc, 270, 180));
  P.add(seg([-L - yc, 0, W], [-L - yc, 0, -W]));                               // rug
  const ys = [.075, .03, -.015, -.06];
  ys.forEach((y, i) => {
    const u = [[-L + .03, y, -W + .03], [L - .03, y, -W + .03], [L - .03, y, W - .03], [-L + .03, y, W - .03]];
    P.add(poly(i % 2 ? u.slice().reverse() : u));                             // bladzijden
  });
  P.jump(bez([-.18, yc, -W], [-.16, -.1, -W - .08], [-.12, -.25, -W - .1], [-.08, -.38, -W - .06])); // leeslint
  return P;
} };

MODELS.boeken = { name: 'Boeken', tilt: [10, -26], build() {
  const P = new Pen(), yb = -.85;
  P.add(seg([-1.25, yb, .55], [1.25, yb, .55])); P.add(seg([1.25, yb, .55], [1.25, yb, -.5])); // plank
  const books = [[-1.0, .22, 1.5, .8], [-.76, .17, 1.28, .74], [-.56, .27, 1.66, .86], [-.26, .2, 1.4, .8], [-.03, .16, 1.2, .72]];
  books.forEach(([x, w, h, d], i) => {
    const b = box([x, yb, -d / 2], [x + w, yb + h, d / 2]);
    P.jump(b);
    const f = d / 2 + .001;
    P.add(seg(b[b.length - 1], [x, yb + h * .78, f])); P.add(seg([x, yb + h * .78, f], [x + w, yb + h * .78, f])); // band op de rug
    P.jump(seg([x, yb + h * .2, f], [x + w, yb + h * .2, f]));
    if (i % 2 === 0) P.jump(arc([x + w / 2, yb + h * .5, f], X, Y, w * .22, -90, 270));
  });
  // schuin leunend boek
  const piv = [.95, yb, 0], tf = p => add(piv, rotZ(sub(p, piv), 24));
  P.jump(box([.95 - .22, yb, -.42], [.95, yb + 1.45, .42], tf));
  P.add(seg(tf([.95 - .22, yb + 1.1, .42]), tf([.95, yb + 1.1, .42])));
  return P;
} };

MODELS.boom = { name: 'Boom met vallend blad', tilt: [6, -20], build(d) {
  const P = new Pen(), R = rnd(11 + d), depth = d >= 7 ? 5 : 4;
  P.add(arc([0, -1, 0], X, Z, .55, 200, 560));                                // grond
  const leaf = (c, s, a) => { const t = [Math.cos(a) * s, Math.sin(a) * s * .5, Math.sin(a * 1.7) * s * .6], n = [-t[1] * .5, t[0] * .5, .1]; return poly([sub(c, t), add(c, n), add(c, t), sub(c, n), sub(c, t), add(c, t)]); };
  const branch = (base, dir, L, w, lvl) => {
    const tip = add(base, mul(dir, L));
    let side = cross(dir, Z); if (len(side) < .2) side = cross(dir, X); side = unit(side);
    const bend = mul(cross(dir, side), (R() - .5) * L * .25);
    P.add(bez(add(base, mul(side, w)), add(add(base, mul(dir, L * .35)), add(mul(side, w * .9), bend)), add(add(base, mul(dir, L * .7)), add(mul(side, w * .75), bend)), add(tip, mul(side, w * .6))));
    if (lvl > 0) {
      const n = lvl >= depth - 1 ? 3 : 2 + (R() < .4 ? 1 : 0);
      const az0 = R() * 360;
      for (let k = 0; k < n; k++) {
        const az = az0 + k * 360 / n + (R() - .5) * 40;
        const tilt = 22 + R() * 22;
        let axis = rotAxis(side, dir, az * D);
        let nd = unit(rotAxis(dir, unit(axis), tilt * D));
        nd = unit(add(nd, [0, .25, 0]));
        branch(tip, nd, L * (.62 + R() * .16), w * .62, lvl - 1);
      }
    } else P.add(leaf(add(tip, mul(dir, .04)), .05, R() * 6));
    P.add(bez(add(tip, mul(side, -w * .6)), add(add(base, mul(dir, L * .7)), add(mul(side, -w * .75), bend)), add(add(base, mul(dir, L * .35)), add(mul(side, -w * .9), bend)), add(base, mul(side, -w))));
  };
  P.add(seg(P.last, [.11, -1, 0]));
  branch([0, -1, 0], [0, 1, 0], .72, .11, depth);
  for (let k = 0; k < 7; k++) {                                              // vallende blaadjes
    const c = [(R() - .5) * 2, -.95 + R() * 1.1, (R() - .5) * 1.2];
    if (Math.abs(c[0]) < .3 && c[1] > -.4) c[0] += c[0] < 0 ? -.45 : .45;
    P.jump(leaf(c, .08, R() * 6));
  }
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

MODELS.lego = { name: 'Legostenen', tilt: [24, -30], build() {
  const P = new Pen();
  const stud = (x, y, z) => [arc([x, y, z], X, Z, .13, 90, 450), seg([x, y, z + .13], [x, y + .1, z + .13]), arc([x, y + .1, z], X, Z, .13, 90, 450)];
  P.add(box([-1, -.5, -.42], [.6, -.05, .42]));
  [[0, .21], [0, -.21], [.4, .21], [.4, -.21]].forEach(([x, z]) => stud(x, -.05, z).forEach((s, i) => i ? P.add(s) : P.jump(s)));
  P.jump(box([-1, -.05, -.42], [-.2, .4, .42]));
  [[-.8, .21], [-.8, -.21], [-.4, .21], [-.4, -.21]].forEach(([x, z]) => stud(x, .4, z).forEach((s, i) => i ? P.add(s) : P.jump(s)));
  // derde steen, gedraaid, ervoor
  const tf = p => add(rotY(p, -25), [1.25, -.5, .35]);
  P.jump(box([-.4, 0, -.21], [.4, .45, .21], tf));
  [[-.2, 0], [.2, 0]].forEach(([x, z]) => stud(x, .45, z).map(s => s.map(tf)).forEach((s, i) => i ? P.add(s) : P.jump(s)));
  return P;
} };

MODELS.rubiks = { name: "Rubik's kubus", tilt: [24, -34], build() {
  const P = new Pen(), s = .9, t = s / 3;
  const loopX = v => poly([[v, -s, -s], [v, s, -s], [v, s, s], [v, -s, s], [v, -s, -s]]);
  const loopY = v => poly([[-s, v, -s], [s, v, -s], [s, v, s], [-s, v, s], [-s, v, -s]]);
  const loopZ = v => poly([[-s, -s, v], [s, -s, v], [s, s, v], [-s, s, v], [-s, -s, v]]);
  P.add(loopX(-s));
  P.add(seg([-s, -s, -s], [s, -s, -s]));
  P.add(loopX(s));
  P.add(poly([[s, -s, -s], [s, -s, s], [-s, -s, s]]));                     // 4 ribben langs x
  P.add(seg([-s, -s, s], [-s, s, s])); P.add(seg([-s, s, s], [s, s, s])); P.jump(seg([-s, s, -s], [s, s, -s]));
  [loopX(-t), loopX(t), loopY(-t), loopY(t), loopZ(-t), loopZ(t)].forEach(l => P.jump(l));
  return P;
} };

MODELS.taart = { name: 'Taart', tilt: [26, -14], build() {
  const P = new Pen(), R = .85, yt = .22, yb = -.38, ym = -.08, c0 = 62, c1 = 118, O = [0, 0, 0];
  const cen = y => [0, y, 0];
  P.add(arc(cen(yt), X, Z, R, c1, c0 + 360)); P.add(poly([at(c0, yt, R), cen(yt), at(c1, yt, R)]));
  P.add(seg(at(c1, yt, R), at(c1, yb, R)));
  P.add(arc(cen(yb), X, Z, R, c1, c0 + 360)); P.add(poly([at(c0, yb, R), cen(yb), at(c1, yb, R), cen(yb), cen(yt)]));
  P.add(poly([cen(yt), at(c0, yt, R), at(c0, ym, R)]));
  const cream = []; for (let k = 0; k <= 600; k++) { const a = c0 - (360 - (c1 - c0)) * k / 600; cream.push([R * Math.cos(a * D), ym + .035 * Math.sin(a * D * 16), R * Math.sin(a * D)]); }
  P.add(cream); P.add(poly([at(c1, ym, R), cen(ym), at(c0, ym, R)]));       // slagroomlaag
  P.jump(revolve(t => [Math.sin(t * Math.PI) * .1, yt + .1 - Math.cos(t * Math.PI) * .1], 5, 300, 90).map(p => add(p, [0, 0, -.3]))); // kers
  P.add(bez([0, yt + .2, -.3], [.02, yt + .32, -.3], [.08, yt + .4, -.32], [.14, yt + .44, -.34]));
  // het uitgesneden stuk, naar voren geschoven
  const off = [0, -.02, .5], m = p => add(p, off);
  P.jump(arc(m(cen(yt)), X, Z, R, c0, c1).map(p => p)); P.add(poly([m(at(c1, yt, R)), m(cen(yt)), m(at(c0, yt, R))]));
  P.add(seg(m(at(c0, yt, R)), m(at(c0, yb, R)))); P.add(arc(m(cen(yb)), X, Z, R, c0, c1)); P.add(poly([m(at(c1, yb, R)), m(cen(yb)), m(cen(yt))]));
  P.jump(seg(m(at(c1, yb, R)), m(at(c1, yt, R))));
  P.jump(poly([m(at(c0, ym, R)), m(cen(ym)), m(at(c1, ym, R))]));
  return P;
} };

MODELS.sleutel = { name: 'Steeksleutel', tilt: [34, -22], build() {
  const P = new Pen(), hc = [.62, 0], hr = .32, hw = .09;
  const o = [];
  const a0 = 180 - Math.asin(hw / hr) / D;
  o.push([-.9, hw], [hc[0] + hr * Math.cos(a0 * D), hw]);
  for (let a = a0; a >= 35; a -= 3) o.push([hc[0] + hr * Math.cos(a * D), hr * Math.sin(a * D)]);
  o.push([hc[0] + hr * Math.cos(35 * D), hr * Math.sin(35 * D)], [.7, .1], [.7, -.1], [hc[0] + hr * Math.cos(-35 * D), hr * Math.sin(-35 * D)]);
  for (let a = -35; a >= -a0; a -= 3) o.push([hc[0] + hr * Math.cos(a * D), hr * Math.sin(a * D)]);
  o.push([hc[0] + hr * Math.cos(-a0 * D), -hw], [-.9, -hw]);
  for (let a = -90; a >= -270; a -= 10) o.push([-.9 + hw * Math.cos(a * D), hw * Math.sin(a * D)]);
  o.push([-.9, hw]);
  const z = .055, f = poly(o.map(p => [p[0], p[1], z])), b = poly(o.map(p => [p[0], p[1], -z]));
  P.add(f); P.add(seg(f[f.length - 1], b[b.length - 1])); P.add(b.slice().reverse());
  const jaw = [[.7, .1], [.7, -.1], [hc[0] + hr * Math.cos(35 * D), hr * Math.sin(35 * D)], [hc[0] + hr * Math.cos(-35 * D), hr * Math.sin(-35 * D)]];
  jaw.forEach(([x, y]) => P.jump(seg([x, y, z], [x, y, -z])));
  P.jump(arc([-.55, 0, z], X, Y, .045, 0, 360));                              // gaatje in de steel
  return P;
} };

MODELS.weegschaal = { name: 'Weegschaal', tilt: [14, -22], build() {
  const P = new Pen(), yb = -1, by = .72;
  P.add(ring(yb, .48, 90)); P.add(seg(at(90, yb, .48), at(90, yb + .1, .34))); P.add(ring(yb + .1, .34, 90));
  P.add(seg(at(90, yb + .1, .34), [0, yb + .1, .05]));
  P.add(seg([0, yb + .1, .05], [0, by, .05]));                               // zuil
  P.add(arc([0, by + .12, .05], X, Y, .07, -90, 270));
  P.add(seg([0, by, .05], [-.95, by, .05]));                                  // balk
  const pan = (x, hang) => {
    const top = [x, by, 0], pc = [x, hang, 0], r = .36, A = [90, 210, 330].map(a => add(pc, [r * Math.cos(a * D), 0, r * Math.sin(a * D)]));
    return [seg(top, A[0]), arc(pc, X, Z, r, 90, 450), seg(A[0], top), seg(top, A[1]), seg(A[1], top), seg(top, A[2]),
      seg(A[2], add(pc, [r * .62 * Math.cos(330 * D), -.12, r * .62 * Math.sin(330 * D)])), arc(add(pc, [0, -.12, 0]), X, Z, r * .62, 330, 690)];
  };
  P.add(seg([-.95, by, .05], [-.95, by, 0]));
  pan(-.95, -.15).forEach(s => P.add(s));
  P.jump(seg([-.95, by, .05], [.95, by, .05]));
  P.add(seg([.95, by, .05], [.95, by, 0]));
  pan(.95, -.15).forEach(s => P.add(s));
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

MODELS.helling = { name: 'Helling (diagram)', tilt: [16, -30], build() {
  const P = new Pen(), z = .35, v = [[-1, -.4], [1, -.4], [1, .45], [-1, -.4]];
  const f = poly(v.map(p => [p[0], p[1], z])), b = poly(v.map(p => [p[0], p[1], -z]));
  P.add(f); P.add(seg([-1, -.4, z], [-1, -.4, -z])); P.add(b);
  P.add(poly([[-1, -.4, -z], [1, -.4, -z], [1, -.4, z]])); P.add(poly([[1, -.4, z], [1, .45, z], [1, .45, -z], [1, -.4, -z]]));
  const xd = .45, yd = -.4 + .85 * (xd + 1) / 2;                            // scheidingswand
  P.jump(poly([[xd, -.4, z], [xd, yd, z], [xd, yd, -z], [xd, -.4, -z], [xd, -.4, z]]));
  return P;
} };

MODELS.trap = { name: 'Trap (diagram)', tilt: [16, -30], build() {
  const P = new Pen(), z = .35, prof = [[-1, -.4], [1, -.4], [1, .45], [.45, .45], [.45, .2], [-.1, .2], [-1, -.4]];
  const f = poly(prof.map(p => [p[0], p[1], z])), b = poly(prof.map(p => [p[0], p[1], -z]));
  P.add(f); P.add(seg(f[f.length - 1], b[b.length - 1])); P.add(b.slice().reverse());
  prof.slice(1, -1).forEach(p => P.jump(seg([p[0], p[1], z], [p[0], p[1], -z])));
  [-.1, .45].forEach(x => P.jump(seg([x, -.4, z], [x, -.4, -z])));
  return P;
} };

MODELS.opsomming = { name: 'Opsomming', tilt: [12, -30], build() {
  const P = new Pen();
  P.add(box([-1, -.55, -.03], [.55, .55, .03]));                             // kaart
  const star = (cx, cy, z) => { const o = []; for (let k = 0; k <= 10; k++) { const a = (90 + k * 36) * D, r = k % 2 ? .13 : .33; o.push([cx + r * Math.cos(a), cy + r * Math.sin(a), z]); } return poly(o); };
  const s1 = star(-.25, .02, .22), s2 = star(-.25, .02, .12);
  P.jump(s1); P.add(seg(s1[s1.length - 1], s2[0])); P.add(s2);
  P.jump(seg([.9, .65, .1], [.9, -.7, .1]));
  [.35, 0, -.35].forEach((y, i) => P.jump(arc([.9, y, .1 + i * .12], X, Y, .09, -90, 270)));
  return P;
} };

const shapeCache = new Map();
function build(name, detail) {
  const key = name + ':' + detail;
  if (shapeCache.has(key)) return shapeCache.get(key);
  const m = MODELS[name]; if (!m) return null;
  const pen = m.build(detail || 5);
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

G.OLP3D_MODELS = { MODELS, build, libraryFor };
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
