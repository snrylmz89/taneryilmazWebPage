'use strict';

/* ──────────────────────────── SETUP ──────────────────────────── */
const cvs = document.getElementById('brain-canvas');
const cx  = cvs.getContext('2d');
let W, H, DPR;

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  cvs.width  = W * DPR;
  cvs.height = H * DPR;
  cvs.style.width  = W + 'px';
  cvs.style.height = H + 'px';
  cx.scale(DPR, DPR);
  buildNodes();
}
window.addEventListener('resize', () => { resize(); resizeSvc(); });

/* ──────────────────────────── CONFIG ─────────────────────────── */
const CFG = {
  N_CORE:      72,   // core brain neurons (always visible)
  N_MID:       22,   // mid-ring neurons (appear scroll 0.15-0.45)
  N_OUTER:     18,   // outer-ring neurons (appear scroll 0.40-0.75)
  get N() { return this.N_CORE + this.N_MID + this.N_OUTER; },
  AXON_DIST:   140,  // base connection distance (expands with scroll)
  MAX_PULSES:  5,
  SPD:         [0.008, 0.015],
  SPRING:      0.007,
  SCROLL_SPR:  0.025,
  DAMP:        0.90,
  DRIFT:       0.05,
};

/* ──────────────────────────── NODES ──────────────────────────── */
let nodes = [];
let mouse = { x: 0, y: 0 };

// Brain-region attractors — tighter so no isolated outliers
// ox/oy = centre offset (fraction of scl), rx/ry = radius (fraction of scl)
const REGIONS = [
  { ox:  0,    oy: -.11, rx: .13, ry: .08, w: 14 }, // prefrontal
  { ox:-.05,   oy: -.03, rx: .10, ry: .07, w: 12 }, // left parietal
  { ox: .05,   oy: -.03, rx: .10, ry: .07, w: 12 }, // right parietal
  { ox:-.09,   oy:  .06, rx: .07, ry: .055,w: 10 }, // left temporal
  { ox: .09,   oy:  .06, rx: .07, ry: .055,w: 10 }, // right temporal
  { ox:  0,    oy:  .08, rx: .065,ry: .045,w:  8 }, // occipital
  { ox:  0,    oy: -.01, rx: .035,ry: .03, w:  6 }, // corpus callosum
];

function pickRegion() {
  const total = REGIONS.reduce((a,r) => a+r.w, 0);
  let r = Math.random() * total;
  for (const z of REGIONS) { r -= z.w; if (r <= 0) return z; }
  return REGIONS[0];
}

function buildNodes() {
  const bcx = W * .5, bcy = H * .43;
  const scl = H * 0.82;   // H-based so wide screens don't blow out
  nodes = [];

  // ── CORE nodes (tight brain cluster, always visible) ──────
  for (let i = 0; i < CFG.N_CORE; i++) {
    const reg  = pickRegion();
    const ang  = Math.random() * Math.PI * 2;
    const dist = Math.sqrt(Math.random());
    const hx   = bcx + (reg.ox * scl + Math.cos(ang) * reg.rx * scl * dist);
    const hy   = bcy + (reg.oy * scl + Math.sin(ang) * reg.ry * scl * dist);
    nodes.push({
      x: hx + (Math.random()-.5)*16, y: hy + (Math.random()-.5)*16,
      hx, hy,
      offX: hx - bcx, offY: hy - bcy,   // offset from brain centre
      vx: (Math.random()-.5)*.4, vy: (Math.random()-.5)*.4,
      r: 1.5 + Math.random()*2.2,
      act: 0, phase: Math.random()*Math.PI*2,
      entryDelay: i * .32,
      scrollThreshold: 0,    // always visible
      pulses: [], refractory: 0,
    });
  }

  // ── MID nodes (middle ring, appear scroll 0.15 → 0.45) ────
  for (let i = 0; i < CFG.N_MID; i++) {
    const ang  = Math.random() * Math.PI * 2;
    // Place on a ring ~1.6× brain radius from centre
    const ring = 0.16 + Math.random() * 0.06;
    const hx   = bcx + Math.cos(ang) * scl * ring;
    const hy   = bcy + Math.sin(ang) * scl * ring * 0.75;
    const threshold = 0.13 + (i / CFG.N_MID) * 0.28; // staggered 0.13–0.41
    nodes.push({
      x: hx + (Math.random()-.5)*20, y: hy + (Math.random()-.5)*20,
      hx, hy,
      offX: hx - bcx, offY: hy - bcy,
      vx: (Math.random()-.5)*.4, vy: (Math.random()-.5)*.4,
      r: 1.2 + Math.random()*1.8,
      act: 0, phase: Math.random()*Math.PI*2,
      entryDelay: 0,
      scrollThreshold: threshold,
      pulses: [], refractory: 0,
    });
  }

  // ── OUTER nodes (wide ring, appear scroll 0.38 → 0.72) ────
  for (let i = 0; i < CFG.N_OUTER; i++) {
    const ang  = Math.random() * Math.PI * 2;
    const ring = 0.26 + Math.random() * 0.09;
    const hx   = bcx + Math.cos(ang) * scl * ring;
    const hy   = bcy + Math.sin(ang) * scl * ring * 0.72;
    const threshold = 0.36 + (i / CFG.N_OUTER) * 0.32; // staggered 0.36–0.68
    nodes.push({
      x: hx + (Math.random()-.5)*22, y: hy + (Math.random()-.5)*22,
      hx, hy,
      offX: hx - bcx, offY: hy - bcy,
      vx: (Math.random()-.5)*.4, vy: (Math.random()-.5)*.4,
      r: 1.0 + Math.random()*1.6,
      act: 0, phase: Math.random()*Math.PI*2,
      entryDelay: 0,
      scrollThreshold: threshold,
      pulses: [], refractory: 0,
    });
  }
}

/* ──────────────────────────── SCROLL ─────────────────────────── */
let sp = 0, tsp = 0;  // smooth / target scroll progress
let lastFire = 0;

window.addEventListener('scroll', () => {
  const maxY = document.documentElement.scrollHeight - window.innerHeight;
  tsp = maxY > 0 ? Math.max(0, Math.min(1, window.scrollY / maxY)) : 0;
  document.getElementById('prog-bar').style.width = (tsp * 100) + '%';
  if (tsp > .015) {
    const sh = document.getElementById('scroll-hint');
    sh.style.opacity = '0';
    sh.style.pointerEvents = 'none';
  }
  updatePanels(tsp);
  updateSvcScroll();
}, { passive: true });

/* ──────────────────────────── PANELS ─────────────────────────── */
function lerp01(v, lo, hi) { return Math.max(0, Math.min(1, (v - lo) / (hi - lo))); }

function updatePanels(p) {
  // p0: fully visible at top (p=0), fades out at 0.18–0.26
  setPanel('p0', 1 - lerp01(p, .18, .26));
  // p1: in 0.28–0.37, out 0.50–0.58
  setPanel('p1', lerp01(p, .28, .37) * (1 - lerp01(p, .50, .58)));
  // p2: in 0.61–0.70, out 0.77–0.84
  setPanel('p2', lerp01(p, .61, .70) * (1 - lerp01(p, .77, .84)));
  // p3: in 0.86–0.93 → stays
  setPanel('p3', lerp01(p, .86, .93));
}

function setPanel(id, alpha) {
  const el = document.getElementById(id);
  if (!el) return;
  const a = Math.max(0, Math.min(1, alpha));
  el.style.opacity   = a;
  el.style.transform = `translateY(${(1 - a) * 20}px)`;
  // pointer-events only when visible
  el.style.pointerEvents = a > .05 ? 'auto' : 'none';
}

window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });

/* ──────────────────────────── PULSE EMIT ──────────────────────── */
// dynDist is computed per-frame in draw(); expose it here for fireNeuron
let _dynDist = CFG.AXON_DIST;

function fireNeuron(src) {
  if (src.refractory > 0) return;
  src.act = 1;
  src.refractory = 60; // ~1 sec cooldown

  // Find axon targets using current dynamic distance
  const candidates = nodes
    .filter(n => n !== src && n.refractory === 0 && n._entry > .1)
    .map(n => {
      const dx = n.x - src.x, dy = n.y - src.y;
      return { n, d: Math.sqrt(dx*dx+dy*dy) };
    })
    .filter(o => o.d < _dynDist)
    .sort((a,b) => a.d - b.d)
    .slice(0, CFG.MAX_PULSES);

  for (const { n } of candidates) {
    if (src.pulses.length >= CFG.MAX_PULSES) break;
    src.pulses.push({
      t: 0,
      to: n,
      spd: CFG.SPD[0] + Math.random() * (CFG.SPD[1] - CFG.SPD[0]),
      isGold: Math.random() > .72,
      // Control point for bezier (organic axon curve)
      cpx: (src.x + n.x) / 2 + (Math.random()-.5) * 55,
      cpy: (src.y + n.y) / 2 + (Math.random()-.5) * 55,
    });
  }
}

/* ──────────────────────────── DRAW LOOP ──────────────────────── */
let frame = 0;

function draw() {
  requestAnimationFrame(draw);
  frame++;
  sp += (tsp - sp) * .055;

  // Clear
  cx.fillStyle = '#050d1a';
  cx.fillRect(0, 0, W, H);

  // ── Ambient brain glow — always visible, grows with scroll ──
  {
    // Frame-based entry (0→1 in ~2 sec) blended with scroll
    const entryGlow = Math.min(frame / 120, 1);
    const intensity = Math.max(entryGlow * .55, Math.min(sp * 2.5, 1));
    const gcx = W*.5 + (mouse.x-W*.5)*.035;
    const gcy = H*.43 + (mouse.y-H*.5)*.035;
    const g = cx.createRadialGradient(gcx, gcy, 0, gcx, gcy, W*.38);
    g.addColorStop(0,    `rgba(42,127,143,${.14*intensity})`);
    g.addColorStop(.45,  `rgba(15,34,64,${.06*intensity})`);
    g.addColorStop(1,    'rgba(5,13,26,0)');
    cx.fillStyle = g;
    cx.fillRect(0, 0, W, H);
  }

  const mx = (mouse.x - W*.5) * .016;
  const my = (mouse.y - H*.5) * .016;
  const spring = CFG.SPRING + sp * CFG.SCROLL_SPR;
  const entryT = frame / 60; // global entry timer (faster than before)

  // ── Expansion scale: network blooms outward as user scrolls ──
  // At scroll=0 → scale=1 (compact brain). At scroll=1 → scale=3.0
  const expandScale = 1 + sp * 2.0;

  // Dynamic connection distance — grows with expansion
  // so expanding outer nodes still connect to their neighbours
  const dynDist = CFG.AXON_DIST * (0.95 + sp * 1.6);
  _dynDist = dynDist;  // expose to fireNeuron

  const bcx = W * .5, bcy = H * .43;

  // ── Update nodes ───────────────────────────────────────
  nodes.forEach((n, i) => {
    // Core nodes: frame-based fade-in
    // Mid/outer nodes: scroll-based fade-in
    let entry;
    if (n.scrollThreshold === 0) {
      entry = Math.max(0, Math.min(1, entryT - n.entryDelay * .008));
    } else {
      // Outer nodes: fade in over 0.08 scroll range after their threshold
      entry = Math.max(0, Math.min(1, (sp - n.scrollThreshold) / 0.08));
    }

    // Expand home position outward from brain centre
    const exHx = bcx + n.offX * expandScale;
    const exHy = bcy + n.offY * expandScale;

    n.vx += (exHx + mx*.5 - n.x) * spring;
    n.vy += (exHy + my*.5 - n.y) * spring;
    n.vx *= CFG.DAMP;
    n.vy *= CFG.DAMP;
    n.vx += (Math.random()-.5) * CFG.DRIFT;
    n.vy += (Math.random()-.5) * CFG.DRIFT;
    n.x  += n.vx;
    n.y  += n.vy;
    n.phase     += .021;
    n.act       *= .970;
    n.refractory = Math.max(0, n.refractory - 1);
    n._entry     = entry;
  });

  // ── Fire pulses — active from frame 1, intensifies with scroll ──
  const fireRate = sp < .12 ? 28     // steady baseline from the start
                 : sp < .32 ? 20
                 : sp < .65 ? 12
                 : sp < .85 ? 22 : 38;
  if (frame - lastFire >= fireRate) {
    const candidates = nodes.filter(n => n.refractory === 0 && n._entry > .5);
    if (candidates.length) {
      fireNeuron(candidates[Math.floor(Math.random() * candidates.length)]);
    }
    lastFire = frame;
  }

  // ── Connection visibility — starts at 0.7, reaches 1 after scroll ──
  const connEntry = Math.min(frame / 90, 1);   // 0→1 in ~1.5 sec
  const connV = Math.max(connEntry * .72, Math.min(sp * .35 + .72, 1.0));

  // ── Draw axon connections (bezier curves) ──────────────
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i];
    if (a._entry < .05) continue;

    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      if (b._entry < .05) continue;

      const dx = b.x - a.x, dy = b.y - a.y;
      const d  = Math.sqrt(dx*dx+dy*dy);
      if (d > dynDist) continue;

      const prox = 1 - d / dynDist;
      const act  = (a.act + b.act) * .5;
      const alpha = prox * connV * (.10 + act * .5) * Math.min(a._entry, b._entry);
      if (alpha < .004) continue;

      // Subtle bezier — slight organic curve
      const cpx = (a.x+b.x)*.5 + (b.y-a.y)*.08;
      const cpy = (a.y+b.y)*.5 - (b.x-a.x)*.08;

      cx.beginPath();
      cx.moveTo(a.x, a.y);
      cx.quadraticCurveTo(cpx, cpy, b.x, b.y);

      if (act > .22) {
        cx.strokeStyle = `rgba(77,217,236,${alpha})`;
        cx.lineWidth   = .5 + act * 1.0;
        cx.shadowBlur  = 5;
        cx.shadowColor = 'rgba(77,217,236,.65)';
      } else {
        cx.strokeStyle = `rgba(38,90,110,${alpha * .85})`;
        cx.lineWidth   = .35;
        cx.shadowBlur  = 0;
      }
      cx.stroke();
    }
  }
  cx.shadowBlur = 0;

  // ── Draw action-potential pulses ───────────────────────
  // Each pulse travels along a bezier path with a bright spike head + trailing decay
  nodes.forEach(src => {
    src.pulses = src.pulses.filter(p => {
      p.t += p.spd;
      if (p.t >= 1) {
        // Activate destination, chain reaction
        p.to.act = Math.min(1, p.to.act + .85);
        if (Math.random() < .38 && p.to.pulses.length < 3) {
          const nexts = nodes
            .filter(n => n !== src && n !== p.to && n.refractory === 0)
            .map(n => { const dx=n.x-p.to.x,dy=n.y-p.to.y; return {n,d:Math.sqrt(dx*dx+dy*dy)}; })
            .filter(o => o.d < _dynDist)
            .sort((a,b)=>a.d-b.d);
          if (nexts.length) {
            const pick = nexts[0].n;
            p.to.pulses.push({
              t: 0, to: pick, spd: p.spd*(0.9+Math.random()*.2),
              isGold: p.isGold,
              cpx: (p.to.x+pick.x)/2+(Math.random()-.5)*55,
              cpy: (p.to.y+pick.y)/2+(Math.random()-.5)*55,
            });
          }
        }
        return false;
      }

      // Bezier point at t
      const pt = bezierPoint(src.x, src.y, p.cpx, p.cpy, p.to.x, p.to.y, p.t);

      // Visibility envelope: full in middle, fade at ends
      const vis = connV * Math.pow(Math.sin(p.t * Math.PI), .6) * .95;
      if (vis < .01) return true;

      // --- Trail (5 ghost dots behind) ---
      for (let k = 1; k <= 5; k++) {
        const tt  = Math.max(0, p.t - k * .025);
        const gpt = bezierPoint(src.x, src.y, p.cpx, p.cpy, p.to.x, p.to.y, tt);
        const ga  = vis * (1 - k/6) * .45;
        cx.beginPath();
        cx.arc(gpt.x, gpt.y, .8, 0, Math.PI*2);
        cx.fillStyle = p.isGold
          ? `rgba(201,168,76,${ga})`
          : `rgba(160,235,255,${ga})`;
        cx.fill();
      }

      // --- Signal head (action potential spike) ---
      const headR = 2.4;
      cx.beginPath();
      cx.arc(pt.x, pt.y, headR, 0, Math.PI*2);
      cx.fillStyle = p.isGold
        ? `rgba(255,225,110,${vis})`
        : `rgba(240,252,255,${vis})`;
      cx.shadowBlur  = 18;
      cx.shadowColor = p.isGold ? 'rgba(201,168,76,.95)' : 'rgba(77,217,236,.95)';
      cx.fill();
      cx.shadowBlur = 0;

      // Tiny directional flare at head
      const angle = Math.atan2(p.to.y - src.y, p.to.x - src.x);
      cx.beginPath();
      cx.arc(pt.x + Math.cos(angle)*3.5, pt.y + Math.sin(angle)*3.5, .9, 0, Math.PI*2);
      cx.fillStyle = p.isGold
        ? `rgba(255,235,150,${vis*.5})`
        : `rgba(200,248,255,${vis*.5})`;
      cx.fill();

      return true;
    });
  });

  // ── Draw neurons ───────────────────────────────────────
  nodes.forEach(n => {
    if (n._entry < .04) return;
    const blink = .5 + .5 * Math.sin(n.phase);
    const glow  = n.act * .78 + blink * .22;
    const alpha = n._entry * (.42 + glow * .58);

    // Halo
    if (glow > .12) {
      const hr = n.r * 4.5;
      const hg = cx.createRadialGradient(n.x, n.y, 0, n.x, n.y, hr);
      hg.addColorStop(0, `rgba(77,217,236,${glow * .22 * alpha})`);
      hg.addColorStop(1, 'rgba(77,217,236,0)');
      cx.beginPath();
      cx.arc(n.x, n.y, hr, 0, Math.PI*2);
      cx.fillStyle = hg;
      cx.fill();
    }

    // Core dot
    cx.beginPath();
    cx.arc(n.x, n.y, n.r, 0, Math.PI*2);
    if (n.act > .32) {
      cx.fillStyle  = `rgba(215,248,255,${alpha})`;
      cx.shadowBlur = 12;
      cx.shadowColor= '#4dd9ec';
    } else {
      cx.fillStyle  = `rgba(77,217,236,${alpha * .72})`;
      cx.shadowBlur = 3;
      cx.shadowColor= 'rgba(77,217,236,.45)';
    }
    cx.fill();
    cx.shadowBlur = 0;
  });

  // ── Brain silhouette sketch ────────────────────────────
  const silA = Math.min(lerp01(sp,.28,.48), 1-lerp01(sp,.90,.97)) * .08;
  if (silA > .004) drawSilhouette(silA);

  // ── Services neural canvas (runs every frame, only visible when section in view) ──
  drawSvcCanvas();
}

// Quadratic bezier point
function bezierPoint(x0, y0, cpx, cpy, x1, y1, t) {
  const mt = 1 - t;
  return {
    x: mt*mt*x0 + 2*mt*t*cpx + t*t*x1,
    y: mt*mt*y0 + 2*mt*t*cpy + t*t*y1,
  };
}

// Dashed brain outline
function drawSilhouette(alpha) {
  const bcx  = W*.5 + (mouse.x-W*.5)*.016;
  const bcy  = H*.43 + (mouse.y-H*.5)*.016;
  const scl  = Math.min(W, H*1.3);

  cx.save();
  cx.strokeStyle = `rgba(77,217,236,${alpha})`;
  cx.lineWidth   = 1;
  cx.setLineDash([4,9]);

  // Cerebrum oval
  cx.beginPath();
  cx.ellipse(bcx, bcy - scl*.012, scl*.196, scl*.218, 0, 0, Math.PI*2);
  cx.stroke();

  // Hemisphere sulcus (wavy)
  cx.beginPath();
  cx.moveTo(bcx, bcy - scl*.218);
  cx.bezierCurveTo(bcx+11, bcy-scl*.12, bcx-11, bcy+scl*.04, bcx, bcy+scl*.1);
  cx.stroke();

  // Crown gyrus bumps
  cx.setLineDash([3,7]);
  cx.beginPath();
  cx.moveTo(bcx-scl*.12, bcy-scl*.18);
  cx.bezierCurveTo(bcx-scl*.05,bcy-scl*.24, bcx+scl*.05,bcy-scl*.24, bcx+scl*.12,bcy-scl*.18);
  cx.stroke();

  cx.setLineDash([]);
  cx.restore();
}

/* ══════════════════════════════════════════════════════════════════
   SERVICES NEURAL SECTION
   ══════════════════════════════════════════════════════════════════ */

// Card positions as [cx, cy] fractions of viewport (organic, non-linear)
// Arranged so consecutive cards have visible connections
const SVC_POS = [
  [0.38, 0.44],   // 0 Kaygı       – left-centre
  [0.62, 0.30],   // 1 Depresyon   – upper-right
  [0.76, 0.54],   // 2 Travma      – right
  [0.58, 0.72],   // 3 İlişki      – lower-right
  [0.28, 0.66],   // 4 Uyku        – lower-left
  [0.18, 0.40],   // 5 Online      – left
];

const SVC_POS_MOBILE = [
  [0.50, 0.30],
  [0.79, 0.40],
  [0.79, 0.62],
  [0.50, 0.72],
  [0.21, 0.62],
  [0.21, 0.40],
];

// Extra ambient nodes (smaller dots, no card) for richer network feel
const SVC_AUX = [
  [0.50, 0.22], [0.82, 0.35], [0.88, 0.70],
  [0.42, 0.82], [0.12, 0.60], [0.10, 0.24],
  [0.68, 0.14], [0.50, 0.52],
];

const SVC_AUX_MOBILE = [
  [0.50, 0.16], [0.89, 0.28], [0.94, 0.52], [0.82, 0.79],
  [0.50, 0.88], [0.18, 0.79], [0.06, 0.52], [0.12, 0.28],
];

let svcCvs, svcCtx2, svcW, svcH;
let svcActive = 0;
let svcPulses  = [];  // { from, to, t, spd, cpx, cpy, isAux }
let svcAmbient = []; // floating micro-particles

function initSvc() {
  svcCvs  = document.getElementById('svc-canvas');
  if (!svcCvs) return;
  svcCtx2 = svcCvs.getContext('2d');
  resizeSvc();
  positionSvcNodes();
  // seed ambient particles
  svcAmbient = Array.from({ length: 28 }, () => ({
    x: Math.random(), y: Math.random(),
    vx: (Math.random()-.5)*.0002, vy: (Math.random()-.5)*.0002,
    r: .5 + Math.random()*.8, a: .1 + Math.random()*.25,
  }));
}

function resizeSvc() {
  if (!svcCvs) return;
  svcW = svcCvs.width  = svcCvs.offsetWidth;
  svcH = svcCvs.height = svcCvs.offsetHeight;
  positionSvcNodes();
}

function getSvcPositions() {
  return window.innerWidth < 700 ? SVC_POS_MOBILE : SVC_POS;
}

function getSvcAuxPositions() {
  return window.innerWidth < 700 ? SVC_AUX_MOBILE : SVC_AUX;
}

function positionSvcNodes() {
  const pos = getSvcPositions();
  pos.forEach(([cx, cy], i) => {
    const el = document.getElementById(`svc-node-${i}`);
    if (!el) return;
    el.style.left = (cx * 100) + '%';
    el.style.top  = (cy * 100) + '%';
  });
}

/* ── Scroll-driven update ── */
function updateSvcScroll() {
  const stage = document.getElementById('svc-stage');
  if (!stage) return;
  const rect       = stage.getBoundingClientRect();
  const stageH     = stage.offsetHeight - window.innerHeight;
  const local      = Math.max(0, Math.min(1, -rect.top / stageH));
  const positions  = getSvcPositions();

  const step    = 1 / positions.length;
  const rawIdx  = local / step;
  const newIdx  = Math.min(positions.length - 1, Math.floor(rawIdx));

  if (newIdx !== svcActive) {
    // Fire a traveling pulse from previous active to new active
    fireSvcPulse(svcActive, newIdx, false);
    // Also shoot a few aux pulses along the network for drama
    const near = svcNearby(newIdx, 2);
    near.forEach(j => fireSvcPulse(newIdx, j, true));
    svcActive = newIdx;
  }

  // Update card DOM
  positions.forEach((_, i) => {
    const el = document.getElementById(`svc-node-${i}`);
    if (!el) return;
    const dist = Math.abs(i - svcActive);
    let scale, opacity;
    if (window.innerWidth < 700) {
      if      (dist === 0) { scale = 1.00; opacity = 1.00; }
      else if (dist === 1) { scale = 0.74; opacity = 0.44; }
      else if (dist === 2) { scale = 0.38; opacity = 0.16; }
      else                 { scale = 0.28; opacity = 0.08; }
    } else {
      if      (dist === 0) { scale = 1.00; opacity = 1.00; }
      else if (dist === 1) { scale = 0.80; opacity = 0.48; }
      else if (dist === 2) { scale = 0.67; opacity = 0.24; }
      else                 { scale = 0.58; opacity = 0.11; }
    }
    el.style.transform     = `translate(-50%,-50%) scale(${scale})`;
    el.style.opacity       = opacity;
    el.style.pointerEvents = dist === 0 ? 'auto' : 'none';
    el.dataset.active      = dist === 0 ? 'true' : 'false';
    el.dataset.distance    = String(dist);
  });

  // Dots
  document.querySelectorAll('#svc-dots .svc-dot').forEach((d, i) => {
    d.classList.toggle('svc-dot-on', i === svcActive);
  });
}

function svcNearby(idx, count) {
  // Returns indices of closest card-nodes by spatial distance
  const positions = getSvcPositions();
  const [ax, ay] = positions[idx];
  return positions
    .map(([bx, by], j) => ({ j, d: Math.hypot(bx-ax, by-ay) }))
    .filter(o => o.j !== idx)
    .sort((a, b) => a.d - b.d)
    .slice(0, count)
    .map(o => o.j);
}

function fireSvcPulse(from, to, isAux) {
  const positions = getSvcPositions();
  const [ax, ay] = positions[from];
  const [bx, by] = positions[to];
  svcPulses.push({
    from, to, t: 0,
    spd: isAux ? .014 + Math.random()*.008 : .018,
    cpx: (ax + bx) / 2 + (Math.random()-.5) * .18,
    cpy: (ay + by) / 2 + (Math.random()-.5) * .14,
    isAux,
  });
}

/* ── Per-frame draw ── */
function drawSvcCanvas() {
  if (!svcCtx2 || !svcCvs) return;
  const s = svcCtx2;
  s.clearRect(0, 0, svcW, svcH);

  // ── Ambient glow under active card ──
  const positions = getSvcPositions();
  const auxPositions = getSvcAuxPositions();
  const [acx, acy] = positions[svcActive];
  const ag = s.createRadialGradient(acx*svcW, acy*svcH, 0, acx*svcW, acy*svcH, svcW*.22);
  ag.addColorStop(0, 'rgba(42,127,143,.13)');
  ag.addColorStop(1, 'rgba(5,13,26,0)');
  s.fillStyle = ag;
  s.fillRect(0, 0, svcW, svcH);

  // ── Ambient micro-particles ──
  svcAmbient.forEach(p => {
    p.x += p.vx; p.y += p.vy;
    if (p.x < 0) p.x = 1; if (p.x > 1) p.x = 0;
    if (p.y < 0) p.y = 1; if (p.y > 1) p.y = 0;
    s.beginPath();
    s.arc(p.x*svcW, p.y*svcH, p.r, 0, Math.PI*2);
    s.fillStyle = `rgba(77,217,236,${p.a * .4})`;
    s.fill();
  });

  const CONN_THRESH = 0.48; // connect nodes within this fraction of viewport

  // Build combined node list (cards + aux)
  const allNodes = [...positions, ...auxPositions];

  // ── Draw all connections ──
  for (let i = 0; i < allNodes.length - 1; i++) {
    for (let j = i + 1; j < allNodes.length; j++) {
      const [ax, ay] = allNodes[i];
      const [bx, by] = allNodes[j];
      const d = Math.hypot(bx-ax, by-ay);
      if (d > CONN_THRESH) continue;
      const prox = 1 - d / CONN_THRESH;
      const iCardI = i < SVC_POS.length ? i : -1;
      const iCardJ = j < SVC_POS.length ? j : -1;
      const isActiveEdge = iCardI === svcActive || iCardJ === svcActive;
      const alpha = isActiveEdge
        ? prox * .38
        : prox * .1;
      const colour = isActiveEdge ? `rgba(77,217,236,${alpha})` : `rgba(38,90,110,${alpha})`;
      const cpx = (ax+bx)/2*svcW + (by-ay)*svcH*.08;
      const cpy = (ay+by)/2*svcH - (bx-ax)*svcW*.08;
      s.beginPath();
      s.moveTo(ax*svcW, ay*svcH);
      s.quadraticCurveTo(cpx, cpy, bx*svcW, by*svcH);
      s.strokeStyle = colour;
      s.lineWidth   = isActiveEdge ? 1.1 : .45;
      s.stroke();
    }
  }

  // ── Node glows (card nodes only) ──
  positions.forEach(([nx, ny], i) => {
    const dist  = Math.abs(i - svcActive);
    const glow  = dist === 0 ? 1 : dist === 1 ? .4 : .15;
    const r     = dist === 0 ? svcW*.032 : svcW*.018;
    const ng    = s.createRadialGradient(nx*svcW, ny*svcH, 0, nx*svcW, ny*svcH, r);
    ng.addColorStop(0, `rgba(77,217,236,${.22*glow})`);
    ng.addColorStop(1, 'rgba(77,217,236,0)');
    s.beginPath();
    s.arc(nx*svcW, ny*svcH, r, 0, Math.PI*2);
    s.fillStyle = ng;
    s.fill();
    // centre dot
    s.beginPath();
    s.arc(nx*svcW, ny*svcH, dist===0?4.5:2.2, 0, Math.PI*2);
    s.fillStyle = `rgba(77,217,236,${(.55+glow*.4)})`;
    if (dist===0) { s.shadowBlur=14; s.shadowColor='rgba(77,217,236,.8)'; }
    s.fill();
    s.shadowBlur = 0;
  });

  // Aux node dots (tiny)
  auxPositions.forEach(([nx, ny]) => {
    s.beginPath();
    s.arc(nx*svcW, ny*svcH, 1.4, 0, Math.PI*2);
    s.fillStyle = 'rgba(77,217,236,.22)';
    s.fill();
  });

  // ── Traveling pulses ──
  svcPulses = svcPulses.filter(p => {
    p.t = Math.min(1, p.t + p.spd);
    const [ax, ay] = positions[p.from];
    const [bx, by] = positions[p.to];
    const cpx = p.cpx * svcW, cpy = p.cpy * svcH;
    const vis  = Math.pow(Math.sin(p.t * Math.PI), .55) * (p.isAux ? .6 : 1);
    if (vis < .015) return p.t < 1;

    // Trail
    for (let k = 1; k <= 6; k++) {
      const tt  = Math.max(0, p.t - k * .03);
      const gpt = bezierPoint(ax*svcW, ay*svcH, cpx, cpy, bx*svcW, by*svcH, tt);
      s.beginPath();
      s.arc(gpt.x, gpt.y, 1.1, 0, Math.PI*2);
      s.fillStyle = `rgba(77,217,236,${vis*(1-k/7)*.48})`;
      s.fill();
    }
    // Head
    const pt = bezierPoint(ax*svcW, ay*svcH, cpx, cpy, bx*svcW, by*svcH, p.t);
    s.beginPath();
    s.arc(pt.x, pt.y, p.isAux ? 2.5 : 3.8, 0, Math.PI*2);
    s.fillStyle = `rgba(240,252,255,${vis})`;
    s.shadowBlur  = p.isAux ? 12 : 22;
    s.shadowColor = 'rgba(77,217,236,.95)';
    s.fill();
    s.shadowBlur = 0;
    return p.t < 1;
  });
}

/* ──────────────────────────── INIT ───────────────────────────── */
resize();
updatePanels(0);   // p0 fully visible at load
initSvc();
draw();

/* ──────────────────────────── FORM ───────────────────────────── */
function submitForm() {
  const fields = ['fn','fp','fe','ft'];
  let ok = true;
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.value.trim()) {
      ok = false;
      el.style.borderColor = '#f87171';
      setTimeout(() => el.style.borderColor = '', 2200);
    }
  });
  if (!ok) return;
  document.getElementById('form-fields').style.display = 'none';
  document.getElementById('form-ok').style.display = 'block';
}

