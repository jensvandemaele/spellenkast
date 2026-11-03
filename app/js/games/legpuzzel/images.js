// Legpuzzel: eigen getekende afbeeldingen (canvas). Geen afbeeldingsbestanden nodig, werkt offline.
// Elke afbeelding wordt getekend met een seed, dus elke puzzel ziet er net iets anders uit.
import { seededRandom } from '../../core/util.js';

export const IMAGES = {
  molen: { naam: 'Molen in de polder', draw: drawMolen },
  zee: { naam: 'Zonsondergang aan zee', draw: drawZee },
  bergen: { naam: 'Bergmeer', draw: drawBergen },
  stad: { naam: 'Stad bij nacht', draw: drawStad },
  rif: { naam: 'Koraalrif', draw: drawRif },
  ballonnen: { naam: 'Luchtballonnen', draw: drawBallonnen },
};
export const IMAGE_IDS = Object.keys(IMAGES);

/** Tekent afbeelding `id` op een canvas van size×size pixels. */
export function drawImage(ctx, id, size, seed) {
  const img = IMAGES[id];
  if (!img) throw new Error('Onbekende afbeelding: ' + id);
  ctx.save();
  ctx.clearRect(0, 0, size, size);
  ctx.scale(size / 1000, size / 1000); // alles hieronder tekent op een vlak van 1000×1000
  img.draw(ctx, seededRandom(seed >>> 0));
  ctx.restore();
}

// ---------------- Hulpjes ----------------
const rnd = (rng, a, b) => a + rng() * (b - a);
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

function grad(ctx, y0, y1, stops) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  stops.forEach(([t, c]) => g.addColorStop(t, c));
  return g;
}

function cloud(ctx, x, y, w, color = 'rgba(255,255,255,.92)', rng = Math.random) {
  ctx.fillStyle = color;
  ctx.beginPath();
  const parts = 5;
  for (let i = 0; i < parts; i++) {
    const px = x + (i - (parts - 1) / 2) * w * 0.18;
    const r = w * (0.13 + 0.07 * Math.sin((i / (parts - 1)) * Math.PI)) * rnd(rng, 0.85, 1.15);
    ctx.moveTo(px + r, y - r * 0.3);
    ctx.arc(px, y - r * 0.3, r, 0, Math.PI * 2);
  }
  ctx.rect(x - w * 0.42, y - w * 0.06, w * 0.84, w * 0.1);
  ctx.fill();
}

function star(ctx, x, y, r, points = 5, inner = 0.45) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = (i * Math.PI) / points - Math.PI / 2;
    const rr = i % 2 ? r * inner : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

function hills(ctx, base, amp, color, rng, waves = 3) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 1000);
  const ph = rnd(rng, 0, Math.PI * 2);
  for (let x = 0; x <= 1000; x += 10) {
    const y = base - amp * (0.6 * Math.sin((x / 1000) * Math.PI * waves + ph) + 0.4 * Math.sin((x / 1000) * Math.PI * waves * 2.3 + ph * 1.7));
    ctx.lineTo(x, y);
  }
  ctx.lineTo(1000, 1000);
  ctx.closePath();
  ctx.fill();
}

// ---------------- 1. Molen in de polder ----------------
function drawMolen(ctx, rng) {
  const horizon = 520;
  ctx.fillStyle = grad(ctx, 0, horizon, [[0, '#5aa7e0'], [0.65, '#a9d4f2'], [1, '#e6f2f7']]);
  ctx.fillRect(0, 0, 1000, horizon);
  // zon
  const sx = rnd(rng, 120, 300);
  ctx.fillStyle = 'rgba(255,240,170,.35)';
  ctx.beginPath(); ctx.arc(sx, 130, 95, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffe58a';
  ctx.beginPath(); ctx.arc(sx, 130, 55, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 5; i++) cloud(ctx, rnd(rng, 80, 920), rnd(rng, 70, 360), rnd(rng, 160, 300), 'rgba(255,255,255,.9)', rng);
  // bomenrij aan de horizon
  ctx.fillStyle = '#4f7d4a';
  for (let x = -20; x < 1020; x += rnd(rng, 18, 34)) {
    const r = rnd(rng, 14, 30);
    ctx.beginPath(); ctx.arc(x, horizon - r * 0.6, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#6d9b55';
  ctx.fillRect(0, horizon - 6, 1000, 30);
  // boerderij
  const fx = rnd(rng, 80, 260);
  ctx.fillStyle = '#9c3b2c';
  ctx.fillRect(fx, horizon - 38, 70, 34);
  ctx.fillStyle = '#5a2b22';
  ctx.beginPath(); ctx.moveTo(fx - 8, horizon - 36); ctx.lineTo(fx + 35, horizon - 66); ctx.lineTo(fx + 78, horizon - 36); ctx.fill();
  ctx.fillStyle = '#f3e3b5';
  ctx.fillRect(fx + 10, horizon - 28, 10, 10); ctx.fillRect(fx + 48, horizon - 28, 10, 10);
  // tulpenvelden in perspectief
  const colors = ['#e23b3b', '#f6c90e', '#ef6fa5', '#f8f4ec', '#8e44ad', '#ff8c2b', '#e23b3b', '#f6c90e'];
  const order = colors.slice().sort(() => rng() - 0.5);
  const vx = rnd(rng, 400, 600); // verdwijnpunt
  const strips = 9;
  for (let i = 0; i < strips; i++) {
    const x0 = -900 + (i / strips) * 2800, x1 = -900 + ((i + 1) / strips) * 2800;
    const isGreen = i % 2 === 1;
    ctx.fillStyle = isGreen ? '#3f8b3a' : order[(i / 2) % order.length | 0];
    ctx.beginPath();
    ctx.moveTo(vx + (x0 - vx) * 0.02, horizon + 18);
    ctx.lineTo(vx + (x1 - vx) * 0.02, horizon + 18);
    ctx.lineTo(x1, 1000);
    ctx.lineTo(x0, 1000);
    ctx.closePath();
    ctx.fill();
    if (!isGreen) {
      // bloemetjes
      ctx.fillStyle = 'rgba(255,255,255,.18)';
      for (let k = 0; k < 140; k++) {
        const t = rng() ** 1.6;
        const y = horizon + 20 + t * 480;
        const f = (y - horizon) / 500;
        const xa = vx + (x0 - vx) * f, xb = vx + (x1 - vx) * f;
        const x = rnd(rng, xa, xb);
        ctx.beginPath(); ctx.arc(x, y, 1 + f * 5, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  // sloot
  ctx.fillStyle = grad(ctx, horizon + 20, 1000, [[0, '#b9dcf0'], [1, '#4a8fc0']]);
  ctx.beginPath();
  ctx.moveTo(vx - 30, horizon + 18); ctx.lineTo(vx - 10, horizon + 18); ctx.lineTo(260, 1000); ctx.lineTo(60, 1000); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 3;
  for (let k = 0; k < 14; k++) {
    const y = horizon + 40 + k * 32;
    const f = (y - horizon) / 500;
    const xc = vx - 20 + (160 - (vx - 20)) * f;
    ctx.beginPath(); ctx.moveTo(xc - 10 - 20 * f, y); ctx.lineTo(xc + 10 + 20 * f, y); ctx.stroke();
  }
  // molen
  const mx = rnd(rng, 620, 820), base = horizon + 40;
  ctx.fillStyle = '#5b3b26';
  ctx.beginPath(); ctx.moveTo(mx - 55, base); ctx.lineTo(mx - 32, base - 220); ctx.lineTo(mx + 32, base - 220); ctx.lineTo(mx + 55, base); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#3d2618';
  ctx.fillRect(mx - 70, base - 70, 140, 10);
  ctx.fillStyle = '#2b1a10';
  ctx.beginPath(); ctx.ellipse(mx, base - 225, 40, 26, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#f0e2c0';
  ctx.fillRect(mx - 10, base - 40, 20, 40);
  ctx.fillRect(mx - 8, base - 150, 16, 22);
  // wieken
  const ang = rnd(rng, 0, Math.PI / 2);
  const hub = [mx, base - 215];
  for (let w = 0; w < 4; w++) {
    const a = ang + (w * Math.PI) / 2;
    ctx.save();
    ctx.translate(hub[0], hub[1]);
    ctx.rotate(a);
    ctx.fillStyle = '#3a2516';
    ctx.fillRect(-5, 0, 10, 230);
    ctx.fillStyle = 'rgba(245,235,215,.9)';
    ctx.fillRect(6, 40, 46, 185);
    ctx.strokeStyle = '#3a2516'; ctx.lineWidth = 3;
    ctx.strokeRect(6, 40, 46, 185);
    for (let y = 60; y < 225; y += 22) { ctx.beginPath(); ctx.moveTo(6, y); ctx.lineTo(52, y); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(29, 40); ctx.lineTo(29, 225); ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = '#1c120b';
  ctx.beginPath(); ctx.arc(hub[0], hub[1], 11, 0, Math.PI * 2); ctx.fill();
}

// ---------------- 2. Zonsondergang aan zee ----------------
function drawZee(ctx, rng) {
  const horizon = rnd(rng, 520, 580);
  ctx.fillStyle = grad(ctx, 0, horizon, [[0, '#2b2a6b'], [0.35, '#8a3f8f'], [0.65, '#ef6f5c'], [0.9, '#fbb45c'], [1, '#ffd98a']]);
  ctx.fillRect(0, 0, 1000, horizon);
  // sterren bovenin
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(255,255,255,${rnd(rng, 0.2, 0.8)})`;
    ctx.beginPath(); ctx.arc(rnd(rng, 0, 1000), rnd(rng, 0, horizon * 0.3), rnd(rng, 0.8, 2.2), 0, Math.PI * 2); ctx.fill();
  }
  // wolkenstrepen
  for (let i = 0; i < 9; i++) {
    const y = rnd(rng, horizon * 0.25, horizon * 0.85);
    ctx.fillStyle = `rgba(${pick(rng, ['255,170,130', '200,90,140', '255,210,150'])},${rnd(rng, 0.35, 0.7)})`;
    ctx.beginPath(); ctx.ellipse(rnd(rng, 0, 1000), y, rnd(rng, 90, 260), rnd(rng, 6, 16), 0, 0, Math.PI * 2); ctx.fill();
  }
  // zon
  const sx = rnd(rng, 350, 650);
  const glow = ctx.createRadialGradient(sx, horizon, 10, sx, horizon, 300);
  glow.addColorStop(0, 'rgba(255,230,150,.75)'); glow.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, 1000, horizon);
  ctx.fillStyle = '#fff1b8';
  ctx.beginPath(); ctx.arc(sx, horizon, 85, Math.PI, 0); ctx.fill();
  // eiland
  const ix = rnd(rng, 650, 900);
  ctx.fillStyle = '#3b2a4e';
  ctx.beginPath(); ctx.moveTo(ix - 160, horizon); ctx.quadraticCurveTo(ix - 40, horizon - 70, ix + 60, horizon - 40); ctx.quadraticCurveTo(ix + 120, horizon - 20, ix + 170, horizon); ctx.fill();
  // zee
  ctx.fillStyle = grad(ctx, horizon, 1000, [[0, '#f29a6b'], [0.15, '#7a4f88'], [0.6, '#2b3a74'], [1, '#14214a']]);
  ctx.fillRect(0, horizon, 1000, 1000 - horizon);
  // weerspiegeling en golven
  for (let i = 0; i < 70; i++) {
    const t = i / 70;
    const y = horizon + 6 + t * t * (1000 - horizon - 220);
    const w = 30 + (1 - t) * 120 + rng() * 60;
    ctx.fillStyle = `rgba(255,220,150,${0.7 - t * 0.55})`;
    ctx.fillRect(sx - w / 2 + rnd(rng, -30, 30) * t, y, w, 3 + t * 3);
  }
  ctx.strokeStyle = 'rgba(180,190,255,.25)'; ctx.lineWidth = 2;
  for (let i = 0; i < 40; i++) {
    const y = rnd(rng, horizon + 20, 800), x = rnd(rng, 0, 1000), w = rnd(rng, 20, 70);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + w / 2, y - 5, x + w, y); ctx.stroke();
  }
  // zeilboot
  const bx = rnd(rng, 120, 360), by = horizon + rnd(rng, 40, 90);
  ctx.fillStyle = '#1d1630';
  ctx.beginPath(); ctx.moveTo(bx - 50, by); ctx.lineTo(bx + 55, by); ctx.lineTo(bx + 38, by + 16); ctx.lineTo(bx - 38, by + 16); ctx.fill();
  ctx.beginPath(); ctx.moveTo(bx, by - 4); ctx.lineTo(bx, by - 120); ctx.lineTo(bx + 52, by - 8); ctx.fill();
  ctx.beginPath(); ctx.moveTo(bx - 4, by - 100); ctx.lineTo(bx - 4, by - 6); ctx.lineTo(bx - 46, by - 10); ctx.fill();
  // vogels
  ctx.strokeStyle = '#2a1b3a'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const x = rnd(rng, 150, 850), y = rnd(rng, 120, horizon - 150), w = rnd(rng, 12, 26);
    ctx.beginPath(); ctx.moveTo(x - w, y); ctx.quadraticCurveTo(x - w / 2, y - w * 0.6, x, y); ctx.quadraticCurveTo(x + w / 2, y - w * 0.6, x + w, y); ctx.stroke();
  }
  // strand met duinen
  ctx.fillStyle = '#d9a46a';
  ctx.beginPath(); ctx.moveTo(0, 1000); ctx.lineTo(0, 860);
  for (let x = 0; x <= 1000; x += 20) ctx.lineTo(x, 850 + 30 * Math.sin(x / 140 + rng() * 0.2) + (x > 600 ? (x - 600) * -0.15 : 0));
  ctx.lineTo(1000, 1000); ctx.fill();
  ctx.fillStyle = '#b77f4b';
  ctx.beginPath(); ctx.moveTo(0, 1000); for (let x = 0; x <= 1000; x += 20) ctx.lineTo(x, 930 + 18 * Math.sin(x / 90)); ctx.lineTo(1000, 1000); ctx.fill();
  ctx.strokeStyle = '#6b6a3a'; ctx.lineWidth = 3;
  for (let i = 0; i < 70; i++) {
    const x = rnd(rng, 0, 1000), y = rnd(rng, 860, 930), h = rnd(rng, 20, 55), lean = rnd(rng, -14, 14);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + lean / 2, y - h / 2, x + lean, y - h); ctx.stroke();
  }
}

// ---------------- 3. Bergmeer ----------------
function drawBergen(ctx, rng) {
  const lake = 600;
  ctx.fillStyle = grad(ctx, 0, lake, [[0, '#3f7fc6'], [0.7, '#9fcbea'], [1, '#e8f3f8']]);
  ctx.fillRect(0, 0, 1000, lake);
  for (let i = 0; i < 4; i++) cloud(ctx, rnd(rng, 50, 950), rnd(rng, 60, 220), rnd(rng, 150, 260), 'rgba(255,255,255,.85)', rng);
  const ranges = [
    { base: lake, peak: 230, color: '#8b9bb8', snow: true, n: 4 },
    { base: lake, peak: 330, color: '#5f7491', snow: true, n: 5 },
    { base: lake, peak: 450, color: '#3e566c', snow: false, n: 6 },
  ];
  const mountains = [];
  for (const rg of ranges) {
    const pts = [[-50, rg.base]];
    for (let i = 0; i <= rg.n; i++) {
      const x = (i / rg.n) * 1100 - 50 + rnd(rng, -40, 40);
      pts.push([x - rnd(rng, 40, 90), rg.base - rnd(rng, 0, 60) - (rg.base - rg.peak) * 0.35]);
      pts.push([x, rg.peak + rnd(rng, -40, 60)]);
    }
    pts.push([1050, rg.base]);
    mountains.push({ ...rg, pts });
  }
  const drawRange = (m, mirror) => {
    const tf = (y) => (mirror ? 2 * lake - y : y);
    ctx.fillStyle = m.color;
    ctx.beginPath();
    m.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, tf(y)) : ctx.moveTo(x, tf(y))));
    ctx.closePath(); ctx.fill();
    if (m.snow) {
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      for (let i = 2; i < m.pts.length - 1; i += 2) {
        const [x, y] = m.pts[i];
        const h = 45 + rng() * 30;
        ctx.beginPath();
        ctx.moveTo(x, tf(y));
        ctx.lineTo(x - h * 0.7, tf(y + h));
        ctx.lineTo(x - h * 0.25, tf(y + h * 0.75));
        ctx.lineTo(x + h * 0.1, tf(y + h * 1.05));
        ctx.lineTo(x + h * 0.7, tf(y + h));
        ctx.closePath(); ctx.fill();
      }
    }
  };
  mountains.forEach((m) => drawRange(m, false));
  // meer met weerspiegeling
  ctx.fillStyle = '#2f6b8f';
  ctx.fillRect(0, lake, 1000, 400);
  ctx.save();
  ctx.globalAlpha = 0.45;
  mountains.forEach((m) => drawRange(m, true));
  ctx.restore();
  ctx.fillStyle = grad(ctx, lake, 1000, [[0, 'rgba(47,107,143,.2)'], [1, 'rgba(20,60,90,.85)']]);
  ctx.fillRect(0, lake, 1000, 400);
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2;
  for (let i = 0; i < 50; i++) {
    const y = rnd(rng, lake + 10, 980), x = rnd(rng, 0, 1000), w = rnd(rng, 20, 80);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke();
  }
  // bossen op de oevers
  const tree = (x, y, h, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const yy = y - k * h * 0.28;
      const w = h * (0.32 - k * 0.07);
      ctx.moveTo(x, yy - h * 0.45); ctx.lineTo(x + w, yy); ctx.lineTo(x - w, yy); ctx.closePath();
    }
    ctx.fill();
    ctx.fillStyle = '#3b2a1c';
    ctx.fillRect(x - h * 0.03, y, h * 0.06, h * 0.1);
  };
  const greens = ['#1f4d33', '#2a5e3c', '#183f2a', '#336b44'];
  for (let i = 0; i < 70; i++) tree(rnd(rng, 0, 1000), lake + rnd(rng, -6, 10), rnd(rng, 40, 90), pick(rng, greens));
  // oever voorgrond links en rechts
  ctx.fillStyle = '#4a6b3a';
  ctx.beginPath(); ctx.moveTo(0, 1000); ctx.lineTo(0, 800); ctx.quadraticCurveTo(160, 820, 300, 1000); ctx.fill();
  ctx.beginPath(); ctx.moveTo(1000, 1000); ctx.lineTo(1000, 760); ctx.quadraticCurveTo(820, 800, 700, 1000); ctx.fill();
  for (let i = 0; i < 16; i++) tree(rnd(rng, 0, 200), rnd(rng, 860, 990), rnd(rng, 110, 180), pick(rng, greens));
  for (let i = 0; i < 16; i++) tree(rnd(rng, 800, 1000), rnd(rng, 830, 990), rnd(rng, 110, 190), pick(rng, greens));
  // hutje
  const hx = rnd(rng, 860, 920), hy = 840;
  ctx.fillStyle = '#b5452f'; ctx.fillRect(hx - 40, hy - 40, 80, 50);
  ctx.fillStyle = '#5b2a1d'; ctx.beginPath(); ctx.moveTo(hx - 52, hy - 38); ctx.lineTo(hx, hy - 82); ctx.lineTo(hx + 52, hy - 38); ctx.fill();
  ctx.fillStyle = '#ffe6a3'; ctx.fillRect(hx - 25, hy - 25, 16, 14);
  // bootje
  const bx = rnd(rng, 380, 620), by = rnd(rng, 700, 780);
  ctx.fillStyle = '#e4a33a';
  ctx.beginPath(); ctx.moveTo(bx - 50, by); ctx.lineTo(bx + 50, by); ctx.lineTo(bx + 34, by + 16); ctx.lineTo(bx - 34, by + 16); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.5)';
  ctx.beginPath(); ctx.ellipse(bx, by + 18, 70, 6, 0, 0, Math.PI * 2); ctx.stroke();
}

// ---------------- 4. Stad bij nacht ----------------
function drawStad(ctx, rng) {
  const river = 700;
  ctx.fillStyle = grad(ctx, 0, river, [[0, '#0b1030'], [0.6, '#1d2a5c'], [1, '#3a3f7a']]);
  ctx.fillRect(0, 0, 1000, river);
  for (let i = 0; i < 180; i++) {
    ctx.fillStyle = `rgba(255,255,255,${rnd(rng, 0.2, 0.95)})`;
    const r = rnd(rng, 0.6, 2.2);
    ctx.beginPath(); ctx.arc(rnd(rng, 0, 1000), rnd(rng, 0, 420), r, 0, Math.PI * 2); ctx.fill();
  }
  for (let i = 0; i < 4; i++) { ctx.fillStyle = '#fff6d0'; star(ctx, rnd(rng, 50, 950), rnd(rng, 30, 300), rnd(rng, 6, 10), 4, 0.3); ctx.fill(); }
  // maan
  const mx = rnd(rng, 650, 880), my = rnd(rng, 110, 200);
  const glow = ctx.createRadialGradient(mx, my, 20, mx, my, 200);
  glow.addColorStop(0, 'rgba(255,248,220,.45)'); glow.addColorStop(1, 'rgba(255,248,220,0)');
  ctx.fillStyle = glow; ctx.fillRect(mx - 200, my - 200, 400, 400);
  ctx.fillStyle = '#fbf3d5'; ctx.beginPath(); ctx.arc(mx, my, 62, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(200,190,160,.5)';
  [[-20, -12, 13], [18, 10, 9], [5, 30, 7], [-25, 22, 6]].forEach(([dx, dy, r]) => { ctx.beginPath(); ctx.arc(mx + dx, my + dy, r, 0, Math.PI * 2); ctx.fill(); });
  // gebouwen in twee lagen
  const windowColors = ['#ffd36b', '#ffe9a8', '#ffb347', '#bfe3ff', '#ffc6e0'];
  const buildings = [];
  const layer = (base, minH, maxH, color, density) => {
    let x = -10;
    while (x < 1010) {
      const w = rnd(rng, 50, 120), h = rnd(rng, minH, maxH);
      buildings.push({ x, w, h, base, color, density });
      x += w + rnd(rng, 0, 12);
    }
  };
  layer(river, 150, 330, '#1c2347', 0.25);
  layer(river, 80, 260, '#121733', 0.45);
  for (const b of buildings) {
    const top = b.base - b.h;
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, top, b.w, b.h);
    if (rng() < 0.3) { ctx.fillRect(b.x + b.w / 2 - 3, top - rnd(rng, 30, 70), 6, 70); ctx.fillStyle = '#ff4d4d'; ctx.beginPath(); ctx.arc(b.x + b.w / 2, top - 60, 4, 0, Math.PI * 2); ctx.fill(); }
    else if (rng() < 0.3) { ctx.fillStyle = b.color; ctx.beginPath(); ctx.moveTo(b.x, top); ctx.lineTo(b.x + b.w / 2, top - b.w * 0.45); ctx.lineTo(b.x + b.w, top); ctx.fill(); }
    for (let y = top + 12; y < b.base - 14; y += 20) {
      for (let x = b.x + 8; x < b.x + b.w - 10; x += 16) {
        if (rng() < b.density) { ctx.fillStyle = pick(rng, windowColors); ctx.fillRect(x, y, 8, 11); }
      }
    }
  }
  // rivier met weerspiegeling
  ctx.fillStyle = '#0c1430'; ctx.fillRect(0, river, 1000, 300);
  for (let i = 0; i < 260; i++) {
    const x = rnd(rng, 0, 1000), y = rnd(rng, river + 4, 1000), w = rnd(rng, 8, 40);
    ctx.fillStyle = `rgba(${pick(rng, ['255,211,107', '255,233,168', '191,227,255', '255,198,224'])},${rnd(rng, 0.1, 0.45) * (1 - (y - river) / 400)})`;
    ctx.fillRect(x, y, w, 3);
  }
  ctx.fillStyle = 'rgba(251,243,213,.3)';
  for (let i = 0; i < 18; i++) ctx.fillRect(mx - rnd(rng, 10, 50), river + 10 + i * 15, rnd(rng, 30, 100), 3);
  // brug
  const by = river - 40;
  ctx.strokeStyle = '#2b2f55'; ctx.lineWidth = 12;
  ctx.beginPath(); ctx.moveTo(0, by); ctx.lineTo(1000, by); ctx.stroke();
  ctx.lineWidth = 6;
  for (let x = 100; x < 1000; x += 300) {
    ctx.beginPath(); ctx.moveTo(x - 150, by); ctx.quadraticCurveTo(x, by - 110, x + 150, by); ctx.stroke();
    ctx.fillStyle = '#2b2f55'; ctx.fillRect(x - 8, by, 16, 46);
  }
  for (let x = 10; x < 1000; x += 35) {
    ctx.fillStyle = '#ffe9a8'; ctx.beginPath(); ctx.arc(x, by - 8, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,233,168,.25)'; ctx.fillRect(x - 3, river + 30 + (x % 70), 6, 30);
  }
}

// ---------------- 5. Koraalrif ----------------
function drawRif(ctx, rng) {
  ctx.fillStyle = grad(ctx, 0, 1000, [[0, '#3fc1d9'], [0.45, '#1b87b8'], [1, '#0d3f73']]);
  ctx.fillRect(0, 0, 1000, 1000);
  // lichtstralen
  for (let i = 0; i < 7; i++) {
    const x = rnd(rng, 0, 1000);
    ctx.fillStyle = 'rgba(255,255,255,.07)';
    ctx.beginPath(); ctx.moveTo(x - 30, 0); ctx.lineTo(x + 30, 0); ctx.lineTo(x + 200, 1000); ctx.lineTo(x + 40, 1000); ctx.fill();
  }
  // zandbodem
  ctx.fillStyle = '#e8cf95';
  ctx.beginPath(); ctx.moveTo(0, 1000); for (let x = 0; x <= 1000; x += 20) ctx.lineTo(x, 820 + 30 * Math.sin(x / 120) + 15 * Math.sin(x / 47)); ctx.lineTo(1000, 1000); ctx.fill();
  ctx.fillStyle = 'rgba(190,160,100,.5)';
  for (let i = 0; i < 120; i++) { ctx.beginPath(); ctx.arc(rnd(rng, 0, 1000), rnd(rng, 850, 1000), rnd(rng, 1, 4), 0, Math.PI * 2); ctx.fill(); }
  // zeewier
  const weeds = ['#2f8f4e', '#3fa65c', '#5bb36a'];
  for (let i = 0; i < 14; i++) {
    const x = rnd(rng, 0, 1000), h = rnd(rng, 180, 420);
    ctx.strokeStyle = pick(rng, weeds); ctx.lineWidth = rnd(rng, 8, 16); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, 880);
    for (let y = 880; y > 880 - h; y -= 30) ctx.lineTo(x + 18 * Math.sin(y / 40 + i), y);
    ctx.stroke();
  }
  // koralen
  const coralColors = ['#ff6f61', '#ff9f43', '#f368e0', '#feca57', '#ff4d6d', '#c56cf0'];
  const branch = (x, y, len, ang, depth, color, w) => {
    if (depth === 0 || len < 8) return;
    const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
    branch(x2, y2, len * rnd(rng, 0.65, 0.8), ang - rnd(rng, 0.2, 0.6), depth - 1, color, w * 0.75);
    branch(x2, y2, len * rnd(rng, 0.65, 0.8), ang + rnd(rng, 0.2, 0.6), depth - 1, color, w * 0.75);
  };
  for (let i = 0; i < 9; i++) branch(rnd(rng, 30, 970), rnd(rng, 860, 930), rnd(rng, 60, 110), -Math.PI / 2 + rnd(rng, -0.3, 0.3), 5, pick(rng, coralColors), rnd(rng, 10, 16));
  // waaiers en hersenkoraal
  for (let i = 0; i < 5; i++) {
    const x = rnd(rng, 50, 950), y = rnd(rng, 880, 960), r = rnd(rng, 50, 90), c = pick(rng, coralColors);
    ctx.fillStyle = c; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, Math.PI * 1.1, Math.PI * 1.9); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.lineWidth = 2;
    for (let a = 1.15; a < 1.9; a += 0.1) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a * Math.PI) * r, y + Math.sin(a * Math.PI) * r); ctx.stroke(); }
  }
  for (let i = 0; i < 4; i++) {
    const x = rnd(rng, 50, 950), y = rnd(rng, 930, 990);
    ctx.fillStyle = pick(rng, ['#a3cb38', '#e17055', '#fdcb6e']);
    ctx.beginPath(); ctx.ellipse(x, y, rnd(rng, 40, 70), rnd(rng, 25, 40), 0, Math.PI, 0); ctx.fill();
  }
  // vissen
  const fishColors = [['#ff9f1a', '#fff'], ['#feca57', '#2e86de'], ['#ff6b81', '#ffd1dc'], ['#48dbfb', '#0a3d62'], ['#c8d6e5', '#576574'], ['#1dd1a1', '#10ac84']];
  for (let i = 0; i < 16; i++) {
    const x = rnd(rng, 40, 960), y = rnd(rng, 80, 760), s = rnd(rng, 18, 46), dir = rng() < 0.5 ? 1 : -1;
    const [body, stripe] = pick(rng, fishColors);
    ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-s * 0.8, 0); ctx.lineTo(-s * 1.5, -s * 0.5); ctx.lineTo(-s * 1.5, s * 0.5); ctx.fill();
    ctx.fillStyle = stripe;
    ctx.fillRect(-s * 0.2, -s * 0.5, s * 0.18, s);
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(s * 0.55, -s * 0.12, s * 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // schildpad
  const tx = rnd(rng, 250, 750), ty = rnd(rng, 250, 500);
  ctx.fillStyle = '#7bae5a';
  [[-55, -35], [55, -35], [-50, 40], [50, 40]].forEach(([dx, dy]) => { ctx.beginPath(); ctx.ellipse(tx + dx, ty + dy, 28, 12, dx * dy > 0 ? 0.6 : -0.6, 0, Math.PI * 2); ctx.fill(); });
  ctx.beginPath(); ctx.ellipse(tx, ty - 70, 22, 26, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5c7d3a'; ctx.beginPath(); ctx.ellipse(tx, ty, 62, 72, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#3e5a26'; ctx.lineWidth = 4;
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + Math.cos(a) * 60, ty + Math.sin(a) * 70); ctx.stroke(); }
  ctx.beginPath(); ctx.ellipse(tx, ty, 30, 34, 0, 0, Math.PI * 2); ctx.stroke();
  // bubbels
  ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 2;
  for (let i = 0; i < 40; i++) { ctx.beginPath(); ctx.arc(rnd(rng, 0, 1000), rnd(rng, 0, 800), rnd(rng, 3, 12), 0, Math.PI * 2); ctx.stroke(); }
}

// ---------------- 6. Luchtballonnen ----------------
function drawBallonnen(ctx, rng) {
  ctx.fillStyle = grad(ctx, 0, 1000, [[0, '#7ec8f0'], [0.55, '#cdeaf7'], [0.75, '#fde9c8'], [1, '#f6d49a']]);
  ctx.fillRect(0, 0, 1000, 1000);
  for (let i = 0; i < 6; i++) cloud(ctx, rnd(rng, 0, 1000), rnd(rng, 60, 600), rnd(rng, 140, 280), 'rgba(255,255,255,.85)', rng);
  // heuvels met akkers
  hills(ctx, 720, 60, '#9cc47a', rng, 2);
  hills(ctx, 800, 50, '#6ea95a', rng, 3);
  hills(ctx, 900, 40, '#4f8a43', rng, 2.4);
  const fields = ['#d8c36a', '#b9d47c', '#8fbf5a', '#e2b45f', '#a7c957', '#c9a15a'];
  for (let i = 0; i < 26; i++) {
    const x = rnd(rng, -50, 1000), y = rnd(rng, 760, 960), w = rnd(rng, 60, 160), h = rnd(rng, 18, 40);
    ctx.fillStyle = pick(rng, fields);
    ctx.save(); ctx.translate(x, y); ctx.transform(1, 0, rnd(rng, -0.5, 0.5), 1, 0, 0);
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,.08)'; ctx.lineWidth = 2;
    for (let k = 6; k < h; k += 7) { ctx.beginPath(); ctx.moveTo(0, k); ctx.lineTo(w, k); ctx.stroke(); }
    ctx.restore();
  }
  // boompjes
  for (let i = 0; i < 30; i++) {
    const x = rnd(rng, 0, 1000), y = rnd(rng, 770, 990), r = rnd(rng, 8, 18);
    ctx.fillStyle = '#2f6b35'; ctx.beginPath(); ctx.arc(x, y - r, r, 0, Math.PI * 2); ctx.fill();
  }
  // ballonnen
  const palettes = [
    ['#e63946', '#f1faee', '#457b9d'], ['#ffb703', '#fb8500', '#023047'], ['#8338ec', '#ff006e', '#ffbe0b'],
    ['#2a9d8f', '#e9c46a', '#e76f51'], ['#06d6a0', '#118ab2', '#ffd166'], ['#ef476f', '#ffd166', '#26547c'],
  ];
  const balloons = [];
  for (let i = 0; i < 7; i++) balloons.push({ x: rnd(rng, 80, 920), y: rnd(rng, 120, 640), r: rnd(rng, 35, 110), p: pick(rng, palettes) });
  balloons.sort((a, b) => a.r - b.r);
  for (const b of balloons) {
    const { x, y, r, p } = b;
    const stripes = 8;
    const shape = () => {
      ctx.beginPath();
      ctx.moveTo(x, y + r * 1.25);
      ctx.bezierCurveTo(x - r * 0.35, y + r * 0.95, x - r * 1.05, y + r * 0.5, x - r, y - r * 0.1);
      ctx.arc(x, y - r * 0.1, r, Math.PI, 0);
      ctx.bezierCurveTo(x + r * 1.05, y + r * 0.5, x + r * 0.35, y + r * 0.95, x, y + r * 1.25);
      ctx.closePath();
    };
    ctx.save();
    shape(); ctx.clip();
    for (let s = 0; s < stripes; s++) {
      ctx.fillStyle = p[s % p.length];
      const x0 = x - r + (s / stripes) * 2 * r, x1 = x - r + ((s + 1) / stripes) * 2 * r;
      ctx.beginPath(); ctx.moveTo(x, y + r * 1.3); ctx.lineTo(x0 - (x - x0) * 0.25, y - r * 1.2); ctx.lineTo(x1 - (x - x1) * 0.25, y - r * 1.2); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    ctx.beginPath(); ctx.ellipse(x - r * 0.35, y - r * 0.4, r * 0.25, r * 0.5, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = Math.max(1.5, r / 40);
    shape(); ctx.stroke();
    // touwen en mandje
    ctx.strokeStyle = '#5a4630'; ctx.lineWidth = Math.max(1.2, r / 50);
    ctx.beginPath();
    ctx.moveTo(x - r * 0.18, y + r * 1.2); ctx.lineTo(x - r * 0.16, y + r * 1.48);
    ctx.moveTo(x + r * 0.18, y + r * 1.2); ctx.lineTo(x + r * 0.16, y + r * 1.48);
    ctx.stroke();
    ctx.fillStyle = '#8a5a2b';
    ctx.fillRect(x - r * 0.18, y + r * 1.48, r * 0.36, r * 0.22);
    ctx.strokeStyle = '#5a3a1a'; ctx.strokeRect(x - r * 0.18, y + r * 1.48, r * 0.36, r * 0.22);
  }
}
