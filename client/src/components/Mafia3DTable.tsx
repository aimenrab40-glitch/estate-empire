// @ts-nocheck
/**
 * SUPER NOVA – ZOMBIE MAFIA ONLINE
 * Interactive 3D abandoned zombie mansion, rebuilt to match the reference image:
 *  - boarded window with full moon, MAFIA ONLINE poster, SUPER NOVA wall graffiti
 *  - large CIRCULAR damaged wooden table, metal chain, red underglow, and a
 *    rotating SUPER NOVA COMMUNITY medallion at the centre
 *  - 10 damaged dark-wood / worn red-leather chairs
 *  - detailed 3D human characters (face, hair, clothing) seated at the table,
 *    with public name tags, natural idle/blink/speaking motion, and clearly
 *    labelled BOT stand-ins on empty seats (visual only)
 *  - crates + lanterns, blood handprints, stone floor, hanging red lamp, fog
 * Preserved: camera controls, private overhead role sprites (owner only),
 * multiplayer / roles / chat wiring via props.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import TableSeats from './TableSeats';
import { SECRET_ROLES, type PrivateProfile, type PublicPlayer } from '@shared/types';

const SEAT_COUNT = 10;

const SEAT_LOOK = [
  { arche: 'king', suit: '#1a1a1a', skin: '#e8e3d8', hair: '#0a0a0a', style: 'crown' },
  { arche: 'clown', suit: '#e8e3d8', skin: '#d9cfc0', hair: '#7f1d1d', style: 'redhair' },
  { arche: 'hood', suit: '#1f1f1f', skin: '#c9b8a3', hair: '#0f0f0f', style: 'hood' },
  { arche: 'dress', suit: '#3a0a0a', skin: '#e8e0d0', hair: '#1a1a1a', style: 'long' },
  { arche: 'cap', suit: '#111827', skin: '#9ca3af', hair: '#111111', style: 'cap' },
  { arche: 'zombie', suit: '#2a2a26', skin: '#b8c4b8', hair: '#1a1a1a', style: 'short' },
  { arche: 'mask', suit: '#0f0f0f', skin: '#cbd5e1', hair: '#f1f5f9', style: 'whitehair' },
  { arche: 'vest', suit: '#1e293b', skin: '#a8b5a0', hair: '#0f0f0f', style: 'vest' },
  { arche: 'hoodie', suit: '#0b0b0b', skin: '#d6ccc0', hair: '#1a1a1a', style: 'hoodie' },
  { arche: 'shades', suit: '#171717', skin: '#b8a090', hair: '#0a0a0a', style: 'short' },
];

interface Props {
  players: PublicPlayer[];
  meId: string | null;
  privateProfile: PrivateProfile | null;
  turnIndex?: number;
  speaking?: Set<string>;
  startedAt?: number | null;
  phase?: string;
  onLeave?: () => void;
}

function seatAngle(seat: number) {
  return (seat / SEAT_COUNT) * Math.PI * 2 - Math.PI / 2;
}

function canvasTexture(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, w = 512, h = 256) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/* ------------------------------- drawing helpers ------------------------------- */

function drawCrown(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, color: string) {
  const h = w * 0.55;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - w / 2, cy + h / 2);
  ctx.lineTo(cx - w / 2, cy - h / 2);
  ctx.lineTo(cx - w / 4, cy + h * 0.05);
  ctx.lineTo(cx, cy - h * 0.75);
  ctx.lineTo(cx + w / 4, cy + h * 0.05);
  ctx.lineTo(cx + w / 2, cy - h / 2);
  ctx.lineTo(cx + w / 2, cy + h / 2);
  ctx.closePath(); ctx.fill();
  [-w / 2, 0, w / 2].forEach(dx => {
    ctx.beginPath(); ctx.arc(cx + dx, cy - h * 0.62, w * 0.07, 0, Math.PI * 2); ctx.fill();
  });
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(cx - w / 2, cy + h / 2 - 4, w, 4);
}

function drawHandprint(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: string, alpha = 0.75) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(cx, cy + s * 0.22, s * 0.3, s * 0.34, 0, 0, Math.PI * 2); ctx.fill();
  const fingers = [[-0.3, -0.42, 0.09], [-0.11, -0.55, 0.1], [0.08, -0.58, 0.1], [0.26, -0.48, 0.09], [0.42, -0.28, 0.08]];
  fingers.forEach(([dx, dy, fw]) => {
    ctx.beginPath(); ctx.ellipse(cx + dx * s, cy + dy * s, fw * s, s * 0.28, dx * 0.5, 0, Math.PI * 2); ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function distressedText(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, font: string, fill: string, drip = false) {
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = fill;
    ctx.fillText(text, cx + (Math.random() - 0.5) * 4, cy + (Math.random() - 0.5) * 4);
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.65)';
  ctx.lineWidth = 2;
  ctx.strokeText(text, cx, cy);
  ctx.fillStyle = fill;
  ctx.fillText(text, cx, cy);
  if (drip) {
    ctx.fillStyle = fill;
    const tw = ctx.measureText(text).width;
    for (let i = 0; i < 12; i++) {
      const x = cx - tw / 2 + Math.random() * tw;
      const len = 14 + Math.random() * 55;
      ctx.fillRect(x, cy + 20, 3.5, len);
      ctx.beginPath(); ctx.arc(x + 1.7, cy + 20 + len, 3, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.strokeStyle = 'rgba(8,8,8,0.75)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 20; i++) {
    const x = cx + (Math.random() - 0.5) * 320;
    const y = cy - 45 + Math.random() * 90;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 34, y + (Math.random() - 0.5) * 26); ctx.stroke();
  }
}

function scratch(ctx: CanvasRenderingContext2D, w: number, h: number, blood = true) {
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 36; i++) {
    ctx.beginPath();
    let x = Math.random() * w, y = Math.random() * h;
    ctx.moveTo(x, y);
    for (let s = 0; s < 3; s++) { x += (Math.random() - 0.5) * 110; y += (Math.random() - 0.5) * 110; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  if (blood) {
    ctx.fillStyle = 'rgba(96,12,12,0.4)';
    for (let i = 0; i < 22; i++) {
      ctx.beginPath();
      ctx.ellipse(Math.random() * w, Math.random() * h, 4 + Math.random() * 22, 3 + Math.random() * 14, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function woodBase(ctx: CanvasRenderingContext2D, w: number, h: number, base = '#4a3220', planks = 6) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  const ph = h / planks;
  for (let p = 0; p < planks; p++) {
    ctx.fillStyle = `rgba(${20 + Math.random() * 30},${12 + Math.random() * 18},6,${0.18 + Math.random() * 0.2})`;
    ctx.fillRect(0, p * ph, w, ph);
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, p * ph, w, 2.5);
    for (let i = 0; i < 26; i++) {
      ctx.strokeStyle = `rgba(0,0,0,${0.12 + Math.random() * 0.25})`;
      ctx.lineWidth = 1 + Math.random() * 1.6;
      const y = p * ph + Math.random() * ph;
      ctx.beginPath(); ctx.moveTo(0, y);
      for (let x = 0; x <= w; x += 60) ctx.lineTo(x, y + (Math.random() - 0.5) * 7);
      ctx.stroke();
    }
    for (let i = 0; i < 3; i++) {
      const x = Math.random() * w, y = p * ph + ph / 2;
      ctx.strokeStyle = 'rgba(18,8,3,0.7)';
      ctx.beginPath(); ctx.ellipse(x, y, 9 + Math.random() * 8, 5 + Math.random() * 4, 0, 0, Math.PI * 2); ctx.stroke();
    }
  }
}

/* --------------------------------- textures --------------------------------- */

function floorTexture() {
  return canvasTexture((ctx, w, h) => {
    ctx.fillStyle = '#1b1919';
    ctx.fillRect(0, 0, w, h);
    const n = 4, s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const v = 34 + Math.random() * 26;
      ctx.fillStyle = `rgb(${v + 8},${v + 2},${v})`;
      ctx.fillRect(i * s + 3, j * s + 3, s - 6, s - 6);
      for (let k = 0; k < 14; k++) {
        ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.22})`;
        ctx.fillRect(i * s + Math.random() * s, j * s + Math.random() * s, 20 + Math.random() * 50, 10 + Math.random() * 30);
      }
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 5;
    for (let i = 0; i <= n; i++) {
      ctx.beginPath(); ctx.moveTo(i * s, 0); ctx.lineTo(i * s, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * s); ctx.lineTo(w, i * s); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 1.6;
    for (let i = 0; i < 26; i++) {
      ctx.beginPath();
      let x = Math.random() * w, y = Math.random() * h;
      ctx.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (Math.random() - 0.4) * 130; y += (Math.random() - 0.4) * 130; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    scratch(ctx, w, h);
    ctx.fillStyle = 'rgba(110,12,12,0.55)';
    for (let i = 0; i < 12; i++) {
      ctx.beginPath();
      ctx.ellipse(Math.random() * w, Math.random() * h, 16 + Math.random() * 46, 10 + Math.random() * 26, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  }, 1024, 1024);
}

function wallTexture() {
  return canvasTexture((ctx, w, h) => {
    ctx.fillStyle = '#2c2424';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) {
      const v = 30 + Math.random() * 34;
      ctx.fillStyle = `rgba(${v + 22},${v + 8},${v + 4},0.5)`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 60 + Math.random() * 180, 40 + Math.random() * 120);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 2;
    for (let i = 0; i < 16; i++) {
      ctx.beginPath();
      let x = Math.random() * w, y = Math.random() * h * 0.5;
      ctx.moveTo(x, y);
      for (let k = 0; k < 6; k++) { y += 30 + Math.random() * 60; x += (Math.random() - 0.5) * 60; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(70,8,8,0.5)';
    for (let i = 0; i < 10; i++) {
      const x = Math.random() * w, y = Math.random() * h * 0.4;
      ctx.fillRect(x, y, 5 + Math.random() * 10, 60 + Math.random() * 160);
    }
    for (let i = 0; i < 5; i++) drawHandprint(ctx, Math.random() * w, h * (0.25 + Math.random() * 0.4), 46, '#5c0d0d', 0.55);
    scratch(ctx, w, h, false);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, h - 40, w, 40);
  }, 1024, 512);
}

function woodTexture(base = '#4a3220', planks = 6) {
  return canvasTexture((ctx, w, h) => {
    woodBase(ctx, w, h, base, planks);
    scratch(ctx, w, h);
  }, 512, 512);
}

function tableTopTexture() {
  return canvasTexture((ctx, w, h) => {
    woodBase(ctx, w, h, '#503626', 7);
    // dark rim ring (cap UV maps the square, circle sits inside)
    ctx.strokeStyle = 'rgba(15,6,3,0.9)'; ctx.lineWidth = 26;
    ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 16, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(120,70,30,0.5)'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 34, 0, Math.PI * 2); ctx.stroke();
    scratch(ctx, w, h);
    ctx.fillStyle = 'rgba(110,12,12,0.5)';
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2, r = 90 + Math.random() * 160;
      ctx.beginPath();
      ctx.ellipse(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r, 8 + Math.random() * 30, 6 + Math.random() * 18, a, 0, Math.PI * 2);
      ctx.fill();
    }
  }, 1024, 1024);
}

/**
 * SUPER NOVA COMMUNITY medallion — circular adaptation of the homepage
 * banner artwork (crown logo centre, black/white snakes around the rim,
 * tech ring). Applied to a disc at the table centre which rotates
 * continuously in the render loop.
 */
function tableMedallionTexture() {
  return canvasTexture((ctx, w, h) => {
    const cx = w / 2, cy = h / 2;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, w * 0.498, 0, Math.PI * 2); ctx.clip();

    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#f7f9fb');
    g.addColorStop(0.55, '#eceff3');
    g.addColorStop(1, '#d8dde4');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

    // faint tech grid
    ctx.strokeStyle = 'rgba(150,160,175,0.28)'; ctx.lineWidth = 1.5;
    for (let i = 1; i < 10; i++) {
      ctx.beginPath(); ctx.moveTo((w / 10) * i, 0); ctx.lineTo((w / 10) * i, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, (h / 10) * i); ctx.lineTo(w, (h / 10) * i); ctx.stroke();
    }
    // soft red glow behind the logo
    const glow = ctx.createRadialGradient(cx, cy, 40, cx, cy, 330);
    glow.addColorStop(0, 'rgba(255,42,42,0.16)');
    glow.addColorStop(1, 'rgba(255,42,42,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);

    const head = (x: number, y: number, ang: number, dark: boolean) => {
      ctx.save();
      ctx.translate(x, y); ctx.rotate(ang);
      ctx.fillStyle = dark ? '#101115' : '#f2f5f8';
      ctx.strokeStyle = dark ? '#000000' : '#9aa5b1'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(0, 0, 34, 22, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = dark ? '#ffffff' : '#101115';
      ctx.beginPath(); ctx.arc(12, -6, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#c81e1e'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(32, 0); ctx.lineTo(52, 0); ctx.moveTo(52, 0); ctx.lineTo(62, -8); ctx.moveTo(52, 0); ctx.lineTo(62, 8); ctx.stroke();
      ctx.restore();
    };
    const snake = (pts: [number, number][], dark: boolean, width: number, hx: number, hy: number, hang: number) => {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const trace = () => {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length - 1; i += 2) {
          ctx.quadraticCurveTo(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
        }
      };
      if (!dark) { ctx.strokeStyle = '#9aa5b1'; ctx.lineWidth = width + 7; trace(); ctx.stroke(); }
      ctx.strokeStyle = dark ? '#101115' : '#eef1f5'; ctx.lineWidth = width; trace(); ctx.stroke();
      ctx.strokeStyle = dark ? 'rgba(160,170,185,0.5)' : 'rgba(120,130,145,0.45)';
      ctx.lineWidth = width * 0.4; ctx.setLineDash([8, 20]); trace(); ctx.stroke(); ctx.setLineDash([]);
      head(hx, hy, hang, dark);
    };

    // snakes around the rim (alternating black / white, as in the artwork)
    snake([[330, 120], [430, 80], [520, 130], [520, 210]], false, 30, 540, 235, 1.2);
    snake([[700, 70], [780, 130], [880, 90], [930, 160]], true, 32, 950, 185, 1.1);
    snake([[880, 300], [960, 260], [985, 330], [940, 380]], true, 30, 925, 400, 1.9);
    snake([[250, 420], [330, 500], [430, 470], [470, 540]], false, 30, 490, 560, 0.7);
    snake([[560, 920], [650, 850], [760, 890], [800, 820]], true, 34, 815, 800, -0.9);
    snake([[180, 700], [260, 760], [350, 720], [380, 790]], true, 32, 395, 810, 0.4);
    snake([[120, 300], [90, 390], [150, 450], [120, 520]], false, 28, 115, 545, 1.8);

    // centre logo: crown + SUPER NOVA COMMUNITY
    ctx.fillStyle = '#101115';
    ctx.save();
    ctx.translate(cx, cy - 190);
    ctx.beginPath();
    ctx.moveTo(-78, 46); ctx.lineTo(-78, -14); ctx.lineTo(-48, 16); ctx.lineTo(-25, -34); ctx.lineTo(0, -2); ctx.lineTo(25, -34); ctx.lineTo(48, 16); ctx.lineTo(78, -14); ctx.lineTo(78, 46);
    ctx.closePath(); ctx.fill();
    ctx.fillRect(-78, 52, 156, 10);
    ctx.beginPath(); ctx.moveTo(0, -62); ctx.lineTo(8, -50); ctx.lineTo(0, -38); ctx.lineTo(-8, -50); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(255,42,42,0.35)'; ctx.shadowBlur = 18;
    ctx.font = '900 104px "Arial Black", "Segoe UI", Arial, sans-serif';
    ctx.fillText('SUPER', cx, cy - 62);
    ctx.fillText('NOVA', cx, cy + 40);
    ctx.shadowBlur = 0;
    ctx.font = '600 30px "Segoe UI", Arial, sans-serif';
    ctx.fillText('C O M M U N I T Y', cx, cy + 104);
    ctx.strokeStyle = '#101115'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx - 170, cy + 140); ctx.lineTo(cx - 24, cy + 140); ctx.moveTo(cx + 24, cy + 140); ctx.lineTo(cx + 170, cy + 140); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy + 129); ctx.lineTo(cx + 11, cy + 140); ctx.lineTo(cx, cy + 151); ctx.lineTo(cx - 11, cy + 140); ctx.closePath(); ctx.fill();

    ctx.restore();
    // outer tech rings
    ctx.strokeStyle = '#8b95a3'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(cx, cy, w * 0.485, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,42,42,0.8)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(cx, cy, w * 0.462, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#ff2a2a';
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * w * 0.473, cy + Math.sin(a) * w * 0.473, 8, 0, Math.PI * 2); ctx.fill();
    }
  }, 1024, 1024);
}

function redLeatherTexture(seed: number) {
  return canvasTexture((ctx, w, h) => {
    ctx.fillStyle = '#5e1111';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(${90 + Math.random() * 60},${16 + Math.random() * 20},${16 + Math.random() * 16},0.4)`;
      ctx.beginPath();
      ctx.ellipse((i * 67 + seed * 31) % w, (i * 53 + seed * 17) % h, 16 + Math.random() * 34, 10 + Math.random() * 22, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(30,4,4,0.65)'; ctx.lineWidth = 1.6;
    for (let i = 0; i < 18; i++) {
      ctx.beginPath();
      const x = Math.random() * w, y = Math.random() * h;
      ctx.moveTo(x, y); ctx.lineTo(x + 50 + Math.random() * 60, y + (Math.random() - 0.5) * 60); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(20,2,2,0.5)';
    for (let i = 0; i < 10; i++) { ctx.beginPath(); ctx.arc(Math.random() * w, Math.random() * h, 4 + Math.random() * 12, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = 'rgba(210,170,140,0.35)'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.setLineDash([]);
  }, 256, 256);
}

function moonWindowTexture() {
  return canvasTexture((ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0a1024');
    g.addColorStop(0.6, '#182237');
    g.addColorStop(1, '#0a0a10');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // full moon, upper-left like the reference
    const mx = w * 0.36, my = h * 0.3;
    ctx.fillStyle = 'rgba(200,215,255,0.25)';
    ctx.beginPath(); ctx.arc(mx, my, 118, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#eef2f8';
    ctx.beginPath(); ctx.arc(mx, my, 92, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(150,160,180,0.5)';
    [[-30, -20, 18], [25, 15, 13], [10, -35, 10], [-15, 30, 9]].forEach(([dx, dy, r]) => {
      ctx.beginPath(); ctx.arc(mx + dx, my + dy, r, 0, Math.PI * 2); ctx.fill();
    });
    ctx.fillStyle = 'rgba(120,130,160,0.35)';
    for (let i = 0; i < 5; i++) ctx.fillRect(0, h * 0.45 + i * 26, w, 9);
    // bare tree silhouette
    ctx.strokeStyle = '#020204'; ctx.lineWidth = 13; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(w * 0.55, h); ctx.quadraticCurveTo(w * 0.58, h * 0.55, w * 0.5, h * 0.35); ctx.stroke();
    ctx.lineWidth = 7;
    [[0.5, 0.5, 0.3, 0.18], [0.52, 0.55, 0.78, 0.3], [0.5, 0.42, 0.38, 0.2], [0.51, 0.62, 0.85, 0.5]].forEach(([x1, y1, x2, y2]) => {
      ctx.beginPath(); ctx.moveTo(w * x1, h * y1); ctx.quadraticCurveTo(w * (x1 + x2) / 2, h * (y1 + y2) / 2 - 20, w * x2, h * y2); ctx.stroke();
    });
    ctx.fillStyle = '#020204'; ctx.fillRect(0, h - 46, w, 46);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = 'rgba(230,238,255,0.7)';
      ctx.fillRect(Math.random() * w, Math.random() * h * 0.5, 2, 2);
    }
  }, 512, 640);
}

function posterTexture() {
  return canvasTexture((ctx, w, h) => {
    ctx.fillStyle = '#33291f';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.3})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 30 + Math.random() * 80, 20 + Math.random() * 60);
    }
    ctx.strokeStyle = 'rgba(10,6,2,0.9)'; ctx.lineWidth = 10; ctx.strokeRect(5, 5, w - 10, h - 10);
    // man in hat silhouette, red eyes, holding a card
    ctx.fillStyle = '#0d0a08';
    ctx.beginPath(); ctx.ellipse(w / 2, h * 0.34, 92, 30, 0, 0, Math.PI * 2); ctx.fill(); // hat brim
    ctx.fillRect(w / 2 - 58, h * 0.2, 116, 78); // hat crown
    ctx.beginPath(); ctx.ellipse(w / 2, h * 0.42, 62, 70, 0, 0, Math.PI * 2); ctx.fill(); // face
    ctx.beginPath(); ctx.moveTo(w * 0.22, h * 0.78); ctx.quadraticCurveTo(w / 2, h * 0.52, w * 0.78, h * 0.78); ctx.closePath(); ctx.fill(); // shoulders
    ctx.fillStyle = '#ff2222';
    ctx.beginPath(); ctx.ellipse(w / 2 - 24, h * 0.42, 9, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(w / 2 + 24, h * 0.42, 9, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d8d2c2';
    ctx.fillRect(w * 0.66, h * 0.52, 44, 62); // card
    ctx.fillStyle = '#8c1a1a';
    ctx.font = 'bold 30px Georgia, serif'; ctx.textAlign = 'center';
    ctx.fillText('A', w * 0.66 + 22, h * 0.52 + 38);
    ctx.fillStyle = 'rgba(120,14,14,0.85)';
    ctx.font = '900 74px Georgia, serif';
    ctx.fillText('MAFIA', w / 2, h * 0.86);
    ctx.fillStyle = '#cfc7b4';
    ctx.font = '900 52px Georgia, serif';
    ctx.fillText('ONLINE', w / 2, h * 0.94);
    scratch(ctx, w, h);
  }, 512, 720);
}

function superNovaWallTexture() {
  return canvasTexture((ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    // black splatter backing
    ctx.fillStyle = 'rgba(5,4,4,0.88)';
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, w * 0.48, h * 0.44, 0, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, r = 120 + Math.random() * 220;
      ctx.beginPath();
      ctx.ellipse(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r * 0.7, 8 + Math.random() * 42, 6 + Math.random() * 26, a, 0, Math.PI * 2);
      ctx.fill();
    }
    drawCrown(ctx, w / 2, h * 0.2, 110, '#d8232a');
    distressedText(ctx, 'SUPER', w / 2, h * 0.42, '900 150px Georgia, serif', '#ddd6c8');
    distressedText(ctx, 'NOVA', w / 2, h * 0.68, '900 190px Georgia, serif', '#d81f1f', true);
    drawHandprint(ctx, w * 0.08, h * 0.3, 55, '#7a1010', 0.85);
    drawHandprint(ctx, w * 0.93, h * 0.55, 48, '#7a1010', 0.8);
    scratch(ctx, w, h);
  }, 1400, 640);
}

function handprintTexture() {
  return canvasTexture((ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    drawHandprint(ctx, w / 2, h / 2, 90, '#6d0d0d', 0.9);
  }, 256, 256);
}

function crateTexture() {
  return canvasTexture((ctx, w, h) => {
    woodBase(ctx, w, h, '#4f3a22', 5);
    ctx.strokeStyle = '#241505'; ctx.lineWidth = 14; ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.beginPath(); ctx.moveTo(8, 8); ctx.lineTo(w - 8, h - 8); ctx.moveTo(w - 8, 8); ctx.lineTo(8, h - 8); ctx.stroke();
    // biohazard stencil
    ctx.strokeStyle = '#c9a227'; ctx.fillStyle = '#c9a227'; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.arc(w / 2, h / 2, 34, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(w / 2, h / 2, 12, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
      ctx.beginPath(); ctx.arc(w / 2 + Math.cos(a) * 58, h / 2 + Math.sin(a) * 58, 30, a + 0.5, a + Math.PI * 1.4); ctx.stroke();
    }
    scratch(ctx, w, h);
  }, 512, 512);
}

function paperTexture() {
  return canvasTexture((ctx, w, h) => {
    ctx.fillStyle = '#b8ab8d';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 20; i++) {
      ctx.fillStyle = `rgba(60,40,20,${Math.random() * 0.25})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 20 + Math.random() * 50, 12 + Math.random() * 30);
    }
    ctx.strokeStyle = '#1c1410'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(w / 2, h / 2, 62, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w / 2, h / 2 - 62); ctx.lineTo(w / 2 + 54, h / 2 + 38); ctx.lineTo(w / 2 - 54, h / 2 + 38); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.arc(w / 2, h / 2, 12, 0, Math.PI * 2); ctx.fillStyle = '#1c1410'; ctx.fill();
    scratch(ctx, w, h);
  }, 256, 256);
}

/* --------------------------------- 3D pieces --------------------------------- */

function makeChair(seat: number) {
  const g = new THREE.Group();
  const leatherTex = redLeatherTexture(seat);
  leatherTex.wrapS = leatherTex.wrapT = THREE.RepeatWrapping;
  const leatherMat = new THREE.MeshStandardMaterial({ map: leatherTex, roughness: 0.92, metalness: 0.02 });
  const woodMat = new THREE.MeshStandardMaterial({ map: woodTexture('#3d2816', 3), roughness: 0.88 });
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x241305, roughness: 0.9 });

  const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.16, 0.6), leatherMat);
  cushion.position.y = 0.5; cushion.castShadow = true; g.add(cushion);

  const back = new THREE.Mesh(new THREE.BoxGeometry(0.68, 1.02, 0.11), leatherMat);
  back.position.set(0, 1.16, -0.37); back.rotation.x = -0.07; back.castShadow = true; g.add(back);

  // plain worn-leather backrest

  // damaged wooden top rail, slightly askew
  const topBar = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.1, 0.15), woodMat);
  topBar.position.set(0, 1.71, -0.41); topBar.rotation.z = 0.05 + (seat % 3) * 0.015; topBar.castShadow = true; g.add(topBar);

  [-1, 1].forEach(side => {
    const legF = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.5, 8), darkWood);
    legF.position.set(side * 0.26, 0.25, 0.22); legF.rotation.x = 0.06; legF.castShadow = true; g.add(legF);
    const legB = legF.clone(); legB.position.z = -0.25; g.add(legB);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.54), woodMat);
    arm.position.set(side * 0.37, 0.79, 0); arm.rotation.z = side * -0.04; g.add(arm);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.36, 8), darkWood);
    post.position.set(side * 0.37, 0.62, 0.2); g.add(post);
  });
  // a torn patch on the leather
  const patch = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.02), new THREE.MeshStandardMaterial({ color: 0x2a0d0d, roughness: 1 }));
  patch.position.set(0.17, 0.52, 0.31); patch.rotation.z = 0.25; g.add(patch);
  return g;
}

function makeLantern() {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6, metalness: 0.5 });
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.1, 8), metal);
  cap.position.y = 0.26; g.add(cap);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.07, 8), metal);
  base.position.y = -0.2; g.add(base);
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.34, 8, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xffb45e, emissive: 0xff8c2e, emissiveIntensity: 2.2, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
  g.add(glass);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.02, 6, 12, Math.PI), metal);
  handle.position.y = 0.31; g.add(handle);
  const light = new THREE.PointLight(0xff9a3d, 6, 7, 1.6);
  light.position.y = 0.05; g.add(light);
  return g;
}

const SEAT_LOOK_TMP = SEAT_LOOK;

/* ---------------------- realistic seated human figure rig ---------------------- */

const IRIS_COLORS = [0x4a3b2a, 0x3e5a48, 0x46617a, 0x6b4f2f, 0x2f2a26, 0x54603f, 0x3a4a5a, 0x5a4636, 0x423226, 0x36505e];

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Tapered limb spanning two points — every body segment is built from these. */
function limb(a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number, mat: THREE.Material, seg = 10) {
  const dir = b.clone().sub(a);
  const len = Math.max(dir.length(), 1e-4);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rb, ra, len, seg, 1, false), mat);
  mesh.position.copy(a.clone().add(b).multiplyScalar(0.5));
  mesh.quaternion.setFromUnitVectors(V(0, 1, 0), dir.normalize());
  mesh.castShadow = true;
  return mesh;
}

function ball(r: number, mat: THREE.Material, seg = 16) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(8, seg - 6)), mat);
  m.castShadow = true;
  return m;
}

function part(w: number, h: number, d: number, mat: THREE.Material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true;
  return m;
}

function makeCharacter(seat: number) {
  const look = SEAT_LOOK_TMP[seat % SEAT_LOOK_TMP.length];
  const fem = seat === 3;
  const g = new THREE.Group();

  const skinMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(look.skin), roughness: 0.6, metalness: 0.02 });
  const suitMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(look.suit), roughness: 0.85 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: 0xe9e5db, roughness: 0.78 });
  const hairMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(look.hair), roughness: 0.9 });
  const lipMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(look.skin).multiplyScalar(0.55), roughness: 0.5 });
  const scleraMat = new THREE.MeshStandardMaterial({ color: 0xeae7e0, roughness: 0.22 });
  const irisMat = new THREE.MeshStandardMaterial({ color: IRIS_COLORS[seat % IRIS_COLORS.length], roughness: 0.18 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x0d0d10, roughness: 0.75 });
  const bloodMat = new THREE.MeshStandardMaterial({ color: 0x4d0d0d, roughness: 0.62 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.55, metalness: 0.1 });

  /* torso: lathe profile hip→shoulders, flattened front-to-back */
  const profile = [
    [0.150, 0.00], [0.147, 0.07], [0.140, 0.15], [0.147, 0.24],
    [0.163, 0.33], [0.178, 0.42], [0.185, 0.50], [0.178, 0.56], [0.125, 0.61],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const torsoMesh = new THREE.Mesh(new THREE.LatheGeometry(profile, 26), suitMat);
  torsoMesh.scale.set(1.12, 1, 0.8);
  torsoMesh.castShadow = true;
  torsoMesh.receiveShadow = true;

  const torsoG = new THREE.Group();
  torsoG.position.y = 0.64;
  torsoG.add(torsoMesh);
  g.add(torsoG);

  const pelvis = ball(0.155, suitMat, 18);
  pelvis.scale.set(1.15, 0.7, 0.9);
  pelvis.position.set(0, 0.6, 0);
  g.add(pelvis);

  /* neck + trapezius */
  torsoG.add(limb(V(0, 0.57, 0.012), V(0, 0.75, 0.004), 0.06, 0.052, skinMat, 12));
  const trapez = ball(0.09, suitMat, 14);
  trapez.scale.set(1.7, 0.5, 0.9);
  trapez.position.set(0, 0.565, -0.01);
  torsoG.add(trapez);

  /* jacket front: shirt, tie, lapels, collar, buttons */
  const shirt = part(0.13, 0.34, 0.05, shirtMat);
  shirt.position.set(0, 0.45, 0.125);
  torsoG.add(shirt);
  const tie = part(0.045, 0.26, 0.022, bloodMat);
  tie.position.set(0, 0.42, 0.152);
  torsoG.add(tie);
  const tieKnot = part(0.05, 0.045, 0.026, bloodMat);
  tieKnot.position.set(0, 0.565, 0.145);
  torsoG.add(tieKnot);
  [-1, 1].forEach(side => {
    const lapel = part(0.1, 0.36, 0.03, suitMat);
    lapel.position.set(side * 0.077, 0.44, 0.132);
    lapel.rotation.z = side * -0.3;
    lapel.rotation.y = side * 0.16;
    torsoG.add(lapel);
    const collar = part(0.06, 0.07, 0.035, shirtMat);
    collar.position.set(side * 0.05, 0.6, 0.105);
    collar.rotation.z = side * -0.45;
    torsoG.add(collar);
  });
  [0.3, 0.2].forEach(y => {
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.01, 10), darkMat);
    btn.rotation.x = Math.PI / 2;
    btn.position.set(0.04, y, 0.152);
    torsoG.add(btn);
  });
  /* worn spatter across the jacket front */
  [[-0.09, 0.36, 0.13, 0.05], [0.1, 0.5, 0.12, 0.038], [-0.03, 0.2, 0.14, 0.045], [0.07, 0.14, 0.12, 0.03]].forEach(([x, y, z, r]) => {
    const stain = ball(r, bloodMat, 10);
    stain.scale.set(1.3, 1, 0.28);
    stain.position.set(x, y, z);
    torsoG.add(stain);
  });

  /* seated legs: thigh forward, shin down, shoe planted on the floor */
  [-1, 1].forEach(side => {
    const hip = V(side * 0.1, 0.62, 0);
    const knee = V(side * 0.11, 0.575, 0.42);
    const ankle = V(side * 0.11, 0.13, 0.47);
    g.add(limb(hip, knee, 0.09, 0.066, suitMat, 12));
    const kb = ball(0.064, suitMat, 12);
    kb.position.copy(knee);
    g.add(kb);
    g.add(limb(knee, ankle, 0.062, 0.046, suitMat, 12));
    const shoe = part(0.1, 0.075, 0.23, shoeMat);
    shoe.position.set(side * 0.11, 0.06, 0.545);
    g.add(shoe);
    const sole = part(0.106, 0.03, 0.24, darkMat);
    sole.position.set(side * 0.11, 0.022, 0.545);
    g.add(sole);
    const heel = part(0.09, 0.05, 0.05, darkMat);
    heel.position.set(side * 0.11, 0.05, 0.44);
    g.add(heel);
  });

  /* dress archetype: hip skirt plus a drape over the thighs */
  if (fem) {
    const skirtMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(look.suit), roughness: 0.85, side: THREE.DoubleSide });
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.26, 0.3, 22, 1, true), skirtMat);
    skirt.position.set(0, 0.66, 0.02);
    skirt.castShadow = true;
    g.add(skirt);
    const lap = part(0.34, 0.035, 0.4, skirtMat);
    lap.position.set(0, 0.645, 0.19);
    lap.rotation.x = 0.05;
    g.add(lap);
  }

  /* ------------------------------ head ------------------------------ */
  const headG = new THREE.Group();
  headG.position.set(0, 0.8, 0.01);
  torsoG.add(headG);

  const skull = ball(0.105, skinMat, 24);
  skull.scale.set(0.9, 1.04, 0.95);
  skull.position.y = 0.01;
  headG.add(skull);

  /* jaw rides its own pivot so the mouth can open when the player talks */
  const jawG = new THREE.Group();
  jawG.position.set(0, -0.01, 0);
  headG.add(jawG);

  const jawMesh = ball(0.078, skinMat, 20);
  jawMesh.scale.set(0.86, 0.78, 0.92);
  jawMesh.position.set(0, -0.05, 0.015);
  jawG.add(jawMesh);
  const chin = ball(0.036, skinMat, 14);
  chin.scale.set(1, 0.85, 0.9);
  chin.position.set(0, -0.082, 0.062);
  jawG.add(chin);
  const lowerLip = new THREE.Mesh(new THREE.SphereGeometry(0.026, 14, 10), lipMat);
  lowerLip.scale.set(1.25, 0.42, 0.5);
  lowerLip.position.set(0, -0.055, 0.082);
  jawG.add(lowerLip);

  const upperLip = new THREE.Mesh(new THREE.SphereGeometry(0.028, 14, 10), lipMat);
  upperLip.scale.set(1.3, 0.4, 0.5);
  upperLip.position.set(0, -0.036, 0.085);
  headG.add(upperLip);
  const mouthLine = part(0.05, 0.006, 0.014, darkMat);
  mouthLine.position.set(0, -0.046, 0.088);
  headG.add(mouthLine);

  /* nose: bridge, tip, nostrils */
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.021, 0.05, 10), skinMat);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, -0.012, 0.096);
  nose.castShadow = true;
  headG.add(nose);
  const noseTip = ball(0.02, skinMat, 12);
  noseTip.position.set(0, -0.026, 0.106);
  headG.add(noseTip);
  [-0.014, 0.014].forEach(x => {
    const n = ball(0.007, darkMat, 8);
    n.position.set(x, -0.036, 0.103);
    headG.add(n);
  });

  /* cheekbones */
  [-1, 1].forEach(side => {
    const cheek = ball(0.04, skinMat, 14);
    cheek.scale.set(0.9, 0.65, 0.8);
    cheek.position.set(side * 0.057, -0.004, 0.058);
    headG.add(cheek);
  });

  /* eyes: sclera, iris, pupil, catchlight, upper lid for blinking, brow */
  const lids: THREE.Mesh[] = [];
  [-1, 1].forEach(side => {
    const eye = new THREE.Group();
    eye.position.set(side * 0.043, 0.028, 0.078);
    headG.add(eye);
    const socket = ball(0.032, new THREE.MeshStandardMaterial({ color: new THREE.Color(look.skin).multiplyScalar(0.84), roughness: 0.7 }), 14);
    socket.scale.set(1.15, 0.8, 0.5);
    socket.position.z = -0.006;
    eye.add(socket);
    const white = ball(0.023, scleraMat, 16);
    white.scale.set(1, 1, 0.85);
    eye.add(white);
    const iris = new THREE.Mesh(new THREE.CircleGeometry(0.0115, 18), irisMat);
    iris.position.z = 0.0185;
    eye.add(iris);
    const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.0052, 14), new THREE.MeshBasicMaterial({ color: 0x040404 }));
    pupil.position.z = 0.0196;
    eye.add(pupil);
    const glint = new THREE.Mesh(new THREE.CircleGeometry(0.0024, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    glint.position.set(0.004, 0.005, 0.0204);
    eye.add(glint);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.0255, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), skinMat);
    lid.rotation.x = -1;
    eye.add(lid);
    lids.push(lid);
    const low = new THREE.Mesh(new THREE.SphereGeometry(0.025, 16, 8, 0, Math.PI * 2, Math.PI * 0.78, Math.PI * 0.22), skinMat);
    eye.add(low);
    const brow = part(0.044, 0.009, 0.013, hairMat);
    brow.position.set(side * 0.002, 0.034, 0.016);
    brow.rotation.z = side * -0.12;
    eye.add(brow);
  });

  /* ears with inner fold */
  [-1, 1].forEach(side => {
    const ear = ball(0.034, skinMat, 12);
    ear.scale.set(0.32, 1, 0.72);
    ear.position.set(side * 0.093, -0.005, -0.008);
    headG.add(ear);
    const inner = ball(0.014, darkMat, 8);
    inner.scale.set(0.3, 1, 0.6);
    inner.position.set(side * 0.099, -0.004, -0.004);
    headG.add(inner);
  });

  /* hair: top cap with a hairline above the brow, plus a back/side shell */
  const hairTop = new THREE.Mesh(new THREE.SphereGeometry(0.113, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.36), hairMat);
  hairTop.scale.set(0.94, 1.06, 0.99);
  hairTop.position.set(0, 0.012, -0.004);
  hairTop.castShadow = true;
  headG.add(hairTop);
  const hairBack = new THREE.Mesh(new THREE.SphereGeometry(0.116, 20, 14, Math.PI / 2 + 0.55, Math.PI * 2 - 1.1, Math.PI * 0.3, Math.PI * 0.6), hairMat);
  hairBack.scale.set(0.95, 1.05, 1);
  hairBack.position.set(0, 0.01, -0.006);
  hairBack.castShadow = true;
  headG.add(hairBack);

  /* beard sits on the jaw line only — never over the lips */
  if (seat % 3 === 1 || seat % 3 === 2) {
    const chinPatch = ball(0.05, hairMat, 12);
    chinPatch.scale.set(1, 0.5, 0.7);
    chinPatch.position.set(0, -0.096, 0.052);
    headG.add(chinPatch);
    const tache = ball(0.03, hairMat, 10);
    tache.scale.set(1.35, 0.32, 0.45);
    tache.position.set(0, -0.024, 0.09);
    headG.add(tache);
    [-1, 1].forEach(side => {
      const jawPatch = ball(0.034, hairMat, 10);
      jawPatch.scale.set(0.55, 0.9, 0.8);
      jawPatch.position.set(side * 0.058, -0.058, 0.05);
      headG.add(jawPatch);
    });
  }

  /* hair styles layered over the base cap */
  switch (look.style) {
    case 'long': {
      const back = part(0.17, 0.36, 0.075, hairMat);
      back.position.set(0, -0.15, -0.085);
      headG.add(back);
      [-1, 1].forEach(side => {
        const panel = part(0.05, 0.28, 0.1, hairMat);
        panel.position.set(side * 0.085, -0.1, 0.005);
        panel.rotation.z = side * 0.06;
        headG.add(panel);
      });
      break;
    }
    case 'hood': {
      const hoodMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(look.suit), roughness: 0.95, side: THREE.DoubleSide });
      const hood = new THREE.Mesh(new THREE.SphereGeometry(0.14, 20, 14, Math.PI / 2 + 0.7, Math.PI * 2 - 1.4, 0, Math.PI * 0.8), hoodMat);
      hood.position.set(0, 0.02, -0.02);
      hood.scale.set(1.06, 1.12, 1.08);
      hood.castShadow = true;
      headG.add(hood);
      const cowl = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.045, 8, 18), hoodMat);
      cowl.position.set(0, -0.13, -0.02);
      cowl.rotation.x = Math.PI / 2;
      headG.add(cowl);
      break;
    }
    case 'hoodie': {
      const hoodMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(look.suit), roughness: 0.95 });
      const cowl = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.05, 8, 20), hoodMat);
      cowl.position.set(0, -0.14, -0.045);
      cowl.rotation.x = Math.PI / 2;
      headG.add(cowl);
      const hood = new THREE.Mesh(new THREE.SphereGeometry(0.125, 18, 12, Math.PI / 2 + 0.8, Math.PI * 2 - 1.6, 0, Math.PI * 0.55), hoodMat);
      hood.position.set(0, 0.005, -0.05);
      headG.add(hood);
      break;
    }
    case 'cap': {
      const capMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(look.suit), roughness: 0.85 });
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.117, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.44), capMat);
      dome.position.set(0, 0.014, -0.004);
      dome.castShadow = true;
      headG.add(dome);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.014, 16, 1, false, -1, 2), capMat);
      brim.position.set(0, 0.062, 0.07);
      brim.rotation.x = -0.2;
      brim.castShadow = true;
      headG.add(brim);
      const button = ball(0.014, capMat, 8);
      button.position.set(0, 0.12, -0.004);
      headG.add(button);
      break;
    }
    case 'redhair': {
      const puffMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(look.hair), roughness: 0.95 });
      [-1, 1].forEach(side => {
        const puff = ball(0.05, puffMat, 12);
        puff.position.set(side * 0.1, 0.04, -0.02);
        headG.add(puff);
      });
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 8), puffMat);
      tuft.position.set(0, 0.13, -0.01);
      tuft.rotation.z = 0.25;
      headG.add(tuft);
      const redNose = ball(0.024, new THREE.MeshStandardMaterial({ color: 0xc22a2a, roughness: 0.35 }), 12);
      redNose.position.set(0, -0.028, 0.118);
      headG.add(redNose);
      break;
    }
    case 'whitehair': {
      const sweep = new THREE.Mesh(new THREE.SphereGeometry(0.118, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.3), hairMat);
      sweep.position.set(0, 0.02, -0.03);
      sweep.rotation.x = -0.3;
      headG.add(sweep);
      break;
    }
    case 'crown': {
      const gold = new THREE.MeshStandardMaterial({ color: 0xf5b942, metalness: 0.85, roughness: 0.28, emissive: 0x3a2a00, emissiveIntensity: 0.4 });
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.096, 0.07, 12, 1, true), gold);
      band.position.set(0, 0.11, -0.004);
      band.castShadow = true;
      headG.add(band);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.017, 0.055, 6), gold);
        spike.position.set(Math.cos(a) * 0.09, 0.16, Math.sin(a) * 0.09 - 0.004);
        headG.add(spike);
      }
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.093, 0.011, 8, 18), gold);
      rim.position.set(0, 0.078, -0.004);
      rim.rotation.x = Math.PI / 2;
      headG.add(rim);
      break;
    }
    case 'vest': {
      const collarMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(look.suit), roughness: 0.9 });
      [-1, 1].forEach(side => {
        const up = part(0.05, 0.09, 0.06, collarMat);
        up.position.set(side * 0.07, -0.14, 0.03);
        up.rotation.z = side * 0.3;
        headG.add(up);
      });
      break;
    }
    default:
      break;
  }

  /* arché accessories */
  if (look.arche === 'shades') {
    const lensMat = new THREE.MeshStandardMaterial({ color: 0x08080a, roughness: 0.15, metalness: 0.4 });
    [-1, 1].forEach(side => {
      const lens = part(0.05, 0.034, 0.014, lensMat);
      lens.position.set(side * 0.043, 0.028, 0.094);
      headG.add(lens);
      const temple = part(0.012, 0.01, 0.1, lensMat);
      temple.position.set(side * 0.088, 0.032, 0.04);
      headG.add(temple);
    });
    const bridge = part(0.03, 0.01, 0.014, lensMat);
    bridge.position.set(0, 0.032, 0.094);
    headG.add(bridge);
  }
  if (look.arche === 'mask') {
    const maskMat = new THREE.MeshStandardMaterial({ color: 0x14141a, roughness: 0.9 });
    const mask = part(0.17, 0.075, 0.05, maskMat);
    mask.position.set(0, -0.038, 0.075);
    headG.add(mask);
    [-1, 1].forEach(side => {
      const strap = part(0.03, 0.02, 0.1, maskMat);
      strap.position.set(side * 0.085, -0.03, 0.01);
      headG.add(strap);
    });
  }
  if (look.arche === 'zombie') {
    [[-0.05, -0.02, 0.085, 0.03], [0.055, 0.05, 0.07, 0.024], [0.01, -0.07, 0.08, 0.02]].forEach(([x, y, z, r]) => {
      const wound = ball(r, new THREE.MeshStandardMaterial({ color: 0x5a3a3a, roughness: 0.8 }), 10);
      wound.scale.set(1.2, 0.8, 0.3);
      wound.position.set(x, y, z);
      headG.add(wound);
    });
    for (let i = 0; i < 3; i++) {
      const stitch = part(0.004, 0.03, 0.008, darkMat);
      stitch.position.set(-0.05 + i * 0.008, -0.02, 0.1);
      stitch.rotation.z = 0.4;
      headG.add(stitch);
    }
  }

  /* arms: shoulder pivot → elbow pivot → hand, hands resting on the thighs */
  const armPivots: THREE.Group[] = [];
  const elbowPivots: THREE.Group[] = [];
  [-1, 1].forEach(side => {
    const sh = new THREE.Group();
    sh.position.set(side * (fem ? 0.163 : 0.185), 0.55, 0);
    torsoG.add(sh);
    const delt = ball(fem ? 0.062 : 0.072, suitMat);
    delt.position.set(side * 0.006, -0.015, 0);
    sh.add(delt);
    sh.add(limb(V(0, 0, 0), V(side * 0.02, -0.27, 0.06), fem ? 0.05 : 0.056, 0.044, suitMat));
    const el = new THREE.Group();
    el.position.set(side * 0.02, -0.27, 0.06);
    sh.add(el);
    el.add(ball(0.045, suitMat, 12));
    el.add(limb(V(0, 0, 0), V(-side * 0.04, -0.22, 0.24), 0.045, 0.034, suitMat));
    el.add(limb(V(-side * 0.03, -0.18, 0.19), V(-side * 0.04, -0.23, 0.26), 0.04, 0.037, shirtMat, 8));
    const hand = new THREE.Group();
    hand.position.set(-side * 0.04, -0.22, 0.24);
    el.add(hand);
    const palm = part(0.064, 0.085, 0.04, skinMat);
    palm.position.y = -0.04;
    hand.add(palm);
    for (let f = 0; f < 4; f++) {
      const fg = part(0.014, 0.055, 0.018, skinMat);
      fg.position.set(-0.024 + f * 0.016, -0.104, 0.008);
      fg.rotation.x = -0.35;
      hand.add(fg);
    }
    const thumb = part(0.016, 0.05, 0.018, skinMat);
    thumb.position.set(-side * 0.036, -0.05, 0.02);
    thumb.rotation.z = side * 0.7;
    thumb.rotation.x = -0.4;
    hand.add(thumb);
    armPivots.push(sh);
    elbowPivots.push(el);
  });

  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.04, 10, 36), new THREE.MeshStandardMaterial({ color: 0xff1a1a, emissive: 0xff1a1a, emissiveIntensity: 1.4 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.03; ring.visible = false;
  g.add(ring);

  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 512; labelCanvas.height = 256;
  const labelTex = new THREE.CanvasTexture(labelCanvas);
  labelTex.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex, transparent: true, depthTest: false }));
  label.scale.set(1.25, 0.62, 1);
  label.position.y = 2.08;
  label.visible = false;
  label.renderOrder = 999;
  g.add(label);

  // public name tag (everyone sees it): real player name + avatar, or BOT label
  const tagCanvas = document.createElement('canvas');
  tagCanvas.width = 384; tagCanvas.height = 128;
  const tagTex = new THREE.CanvasTexture(tagCanvas);
  tagTex.colorSpace = THREE.SRGBColorSpace;
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex, transparent: true, depthTest: false }));
  tag.scale.set(1.05, 0.35, 1);
  tag.position.y = 1.72;
  tag.renderOrder = 998;
  g.add(tag);

  g.userData = {
    head: headG, torso: torsoMesh, torsoG, ring, jawG, lids,
    armPivots, elbowPivots,
    label, labelTex, labelCanvas, tag, tagTex, tagCanvas,
    tagKey: '', arche: look.arche,
    blinkNext: 1.5 + Math.random() * 4, lidClose: 0,
    baseHeadY: 0.8, baseTorsoY: 0.64,
  };
  return g;
}

function drawPrivateLabel(canvas: HTMLCanvasElement, tex: THREE.Texture, profile: PrivateProfile) {
  const ctx = canvas.getContext('2d')!;
  const role = profile.role ? SECRET_ROLES[profile.role] : null;
  ctx.clearRect(0, 0, 512, 256);
  ctx.fillStyle = 'rgba(20,4,6,0.94)';
  ctx.strokeStyle = '#ff2222';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.roundRect(6, 6, 500, 244, 20); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#f87171';
  ctx.font = 'bold 40px "Segoe UI", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('🔒', 22, 62);
  ctx.fillStyle = '#f8fafc';
  ctx.font = '900 48px "Segoe UI", sans-serif';
  ctx.fillText(profile.username.slice(0, 16), 78, 62);
  if (role) {
    ctx.font = '800 38px "Segoe UI", sans-serif';
    ctx.fillStyle = role.color;
    ctx.fillText(`${role.emoji}  ${role.label}`, 78, 118);
    ctx.fillStyle = '#a8a29e';
    ctx.font = '500 24px "Segoe UI", sans-serif';
    ctx.fillText(role.hint + ' · 🔒 only you', 78, 158);
  } else {
    ctx.fillStyle = '#a8a29e';
    ctx.font = '600 34px "Segoe UI", sans-serif';
    ctx.fillText('⏳ Awaiting secret role…', 78, 120);
  }
  tex.needsUpdate = true;
}

/** Public tag above every seated character — real name + avatar, or BOT. */
function drawNameTag(
  canvas: HTMLCanvasElement,
  tex: THREE.Texture,
  data: { name: string; avatar: string; color: string; connected: boolean; isBot: boolean },
) {
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 384, 128);
  ctx.fillStyle = data.isBot ? 'rgba(24,24,27,0.92)' : 'rgba(12,4,6,0.92)';
  ctx.strokeStyle = data.isBot ? '#71717a' : data.color;
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.roundRect(5, 5, 374, 118, 20); ctx.fill(); ctx.stroke();
  // avatar circle with initials (no emoji — the 3D character is the avatar)
  const initials = data.isBot
    ? 'BOT'
    : data.name.trim().split(/\s+/).map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase() || '?';
  ctx.fillStyle = data.isBot ? '#3f3f46' : data.color;
  ctx.beginPath(); ctx.arc(52, 64, 34, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `900 ${data.isBot ? 26 : 32}px "Segoe UI", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(initials, 52, 66);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f8fafc';
  ctx.font = '900 42px "Segoe UI", sans-serif';
  ctx.fillText(data.isBot ? 'BOT' : data.name.slice(0, 14), 100, 56);
  ctx.font = '600 27px "Segoe UI", sans-serif';
  ctx.fillStyle = data.isBot ? '#a1a1aa' : data.connected ? '#4ade80' : '#f87171';
  ctx.beginPath(); ctx.arc(108, 92, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = data.isBot ? '#a1a1aa' : data.connected ? '#4ade80' : '#f87171';
  ctx.fillText(data.isBot ? 'waiting for a player' : data.connected ? 'online' : 'offline', 122, 102);
  tex.needsUpdate = true;
}

export default function Mafia3DTable({ players, meId, privateProfile, turnIndex = 0, speaking = new Set(), startedAt = null, phase = 'lobby', onLeave }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [webglFailed, setWebglFailed] = useState(false);
  const [view, setView] = useState<'overview' | 'mine' | 'top'>('overview');
  const [timer, setTimer] = useState('--:--');
  const stateRef = useRef({ players, meId, privateProfile, turnIndex, speaking });
  stateRef.current = { players, meId, privateProfile, turnIndex, speaking };
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => {
    if (!startedAt) { setTimer(phase === 'lobby' ? 'Lobby' : '--:--'); return; }
    const tick = () => {
      const s = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
      setTimer(`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt, phase]);

  const goFullscreen = () => {
    const el = mountRef.current?.parentElement;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void el.requestFullscreen?.().catch(() => undefined);
  };

  useEffect(() => {
    if (!mountRef.current) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch {
      setWebglFailed(true);
      return;
    }
    const mount = mountRef.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070505);
    scene.fog = new THREE.FogExp2(0x070505, 0.05);
    // subtle environment reflections (bone clearcoat, chain, wet blood) — one-time cost
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      (scene as any).environmentIntensity = 0.35;
      pmrem.dispose();
    } catch { /* environment is a reflection nicety, never fatal */ }

    const camera = new THREE.PerspectiveCamera(46, 2, 0.1, 90);
    camera.position.set(0, 5.2, 11.2);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75)); // mobile-friendly cap
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 3;
    controls.maxDistance = 16;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.target.set(0, 0.9, 0);

    /* ------------------------------- lighting ------------------------------- */
    scene.add(new THREE.HemisphereLight(0x33201e, 0x050505, 0.45));
    // hanging industrial lamp (the single red lamp over the table in the reference)
    const lampSpot = new THREE.SpotLight(0xff5a33, 190, 22, Math.PI / 3.2, 0.65, 1.2);
    lampSpot.position.set(0, 5.6, 0);
    lampSpot.target.position.set(0, 1, 0);
    lampSpot.castShadow = true;
    lampSpot.shadow.mapSize.set(1024, 1024);
    scene.add(lampSpot, lampSpot.target);
    // cold moonlight spilling through the boarded window
    const moonDir = new THREE.DirectionalLight(0xaec6ff, 1.6);
    moonDir.position.set(-6, 6.5, -8);
    moonDir.castShadow = true;
    moonDir.shadow.mapSize.set(1024, 1024);
    scene.add(moonDir);
    const redFill = new THREE.PointLight(0xff1a1a, 8, 14, 1.6);
    redFill.position.set(5, 2.4, 4);
    scene.add(redFill);
    // faint cold rim from the window side — the centrepiece catches a pale edge against the red gloom
    const rimLight = new THREE.PointLight(0x8fa8d8, 5, 9, 1.7);
    rimLight.position.set(-4.5, 2.6, -3.5);
    scene.add(rimLight);

    /* -------------------------------- floor -------------------------------- */
    const floorTex = floorTexture();
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(2.5, 2.5);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(22, 22), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.55, metalness: 0.12 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    /* --------------------------------- walls -------------------------------- */
    const wallTex = wallTexture();
    wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
    wallTex.repeat.set(3, 1.4);
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.96 });
    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(22, 7.5), wallMat);
    backWall.position.set(0, 3.75, -9);
    scene.add(backWall);
    const frontWall = new THREE.Mesh(new THREE.PlaneGeometry(22, 7.5), wallMat.clone());
    frontWall.position.set(0, 3.75, 10); frontWall.rotation.y = Math.PI;
    scene.add(frontWall);
    [-10, 10].forEach(x => {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(19, 7.5), wallMat);
      side.position.set(x, 3.75, 0.5); side.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
      scene.add(side);
    });
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(22, 22), new THREE.MeshStandardMaterial({ color: 0x0c0a0a, roughness: 1 }));
    ceiling.rotation.x = Math.PI / 2; ceiling.position.y = 7.5;
    scene.add(ceiling);

    /* -------- boarded window with full moon (back wall, left) -------- */
    const winGroup = new THREE.Group();
    const winTex = moonWindowTexture();
    const winPlane = new THREE.Mesh(new THREE.PlaneGeometry(3.9, 4.8), new THREE.MeshBasicMaterial({ map: winTex }));
    winGroup.add(winPlane);
    const frameMat = new THREE.MeshStandardMaterial({ map: woodTexture('#3d2816', 4), roughness: 0.9 });
    [[0, 2.45, 4.3, 0.22], [0, -2.45, 4.3, 0.22], [-2.05, 0, 0.22, 5.1], [2.05, 0, 0.22, 5.1]].forEach(([x, y, w, h]) => {
      const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.18), frameMat);
      f.position.set(x, y, 0.06); f.castShadow = true; winGroup.add(f);
    });
    // diagonal boards nailed across, like the reference
    [[-0.25, 0.35], [0.1, -0.4], [-0.05, 1.05]].forEach(([y, rz], i) => {
      const board = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.42, 0.1), frameMat);
      board.position.set(0, y, 0.14); board.rotation.z = rz + (i === 2 ? 0.5 : 0);
      board.castShadow = true; winGroup.add(board);
    });
    winGroup.position.set(-6.2, 4.1, -8.9);
    scene.add(winGroup);

    /* -------- MAFIA ONLINE poster (back wall, centre-left) -------- */
    const poster = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 2.65), new THREE.MeshStandardMaterial({ map: posterTexture(), roughness: 0.95 }));
    poster.position.set(-2.9, 4.2, -8.92); poster.rotation.z = 0.02;
    scene.add(poster);

    /* -------- SUPER NOVA graffiti (back wall, right — main branding) -------- */
    const snTex = superNovaWallTexture();
    const sn = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 3.5), new THREE.MeshBasicMaterial({ map: snTex, transparent: true }));
    sn.position.set(3.6, 4.5, -8.9);
    scene.add(sn);
    const snGlow = new THREE.PointLight(0xff1a1a, 6, 8, 1.5);
    snGlow.position.set(3.6, 4.4, -7.2);
    scene.add(snGlow);

    /* -------- blood handprint decals -------- */
    const hpTex = handprintTexture();
    [[0.2, 3.4, -8.93, 0], [-1.2, 2.2, -8.93, 0.4], [8.4, 3.2, -8.93, -0.3]].forEach(([x, y, z, rz]) => {
      const hp = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.85), new THREE.MeshBasicMaterial({ map: hpTex, transparent: true }));
      hp.position.set(x, y, z); hp.rotation.z = rz; scene.add(hp);
    });
    [-9.93, 9.93].forEach((x, i) => {
      const hp = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: hpTex, transparent: true }));
      hp.position.set(x, 3.1, i === 0 ? -2.5 : 1.5); hp.rotation.y = i === 0 ? Math.PI / 2 : -Math.PI / 2; hp.rotation.z = 0.3;
      scene.add(hp);
    });

    /* -------- shelf with old books + candle (back wall, far left) -------- */
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.09, 0.4), frameMat);
    shelf.position.set(-8.6, 3.5, -8.75); scene.add(shelf);
    [[-8.95, 0.32, 0x3a0d0d], [-8.78, 0.28, 0x1c1c1e]].forEach(([x, h, col]) => {
      const book = new THREE.Mesh(new THREE.BoxGeometry(0.14, h as number, 0.24), new THREE.MeshStandardMaterial({ color: col as number, roughness: 0.9 }));
      book.position.set(x as number, 3.55 + (h as number) / 2, -8.75); book.rotation.z = 0.08; scene.add(book);
    });
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.22, 8), new THREE.MeshStandardMaterial({ color: 0xe8dcc0 }));
    candle.position.set(-8.2, 3.66, -8.75); scene.add(candle);
    const candleLight = new THREE.PointLight(0xff9944, 3, 4, 1.6);
    candleLight.position.set(-8.2, 3.95, -8.4); scene.add(candleLight);

    /* -------- crates + lanterns (front corners, like the reference) -------- */
    const crateTex = crateTexture();
    const crateMat = new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.9 });
    [[-7.9, 5.6, 0.35], [7.9, 5.6, -0.3], [8.3, -5.8, 0.5]].forEach(([x, z, ry]) => {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), crateMat);
      crate.position.set(x, 0.75, z); crate.rotation.y = ry; crate.castShadow = true; crate.receiveShadow = true;
      scene.add(crate);
      const lan = makeLantern();
      lan.position.set(x, 1.72, z); scene.add(lan);
    });

    /* -------- scattered papers + tipped red cup -------- */
    const paperTex = paperTexture();
    [[-3.4, 4.6, 0.5], [-4.2, 3.6, 1.2], [3.6, 5.2, -0.7]].forEach(([x, z, ry]) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), new THREE.MeshStandardMaterial({ map: paperTex, roughness: 1 }));
      p.rotation.x = -Math.PI / 2; p.rotation.z = ry; p.position.set(x, 0.015, z);
      scene.add(p);
    });
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.22, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0x8c1414, roughness: 0.5, side: THREE.DoubleSide }));
    cup.position.set(-2.4, 0.1, 4.4); cup.rotation.z = Math.PI / 2.2; cup.castShadow = true; scene.add(cup);

    /* -------- hanging red lamp over the table -------- */
    const lampGroup = new THREE.Group();
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.9, 6), new THREE.MeshStandardMaterial({ color: 0x0a0a0a }));
    cord.position.y = 0.95; lampGroup.add(cord);
    const dome = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.85, 0.7, 24, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.45, metalness: 0.6, side: THREE.DoubleSide }));
    dome.castShadow = true; lampGroup.add(dome);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), new THREE.MeshBasicMaterial({ color: 0xff7a4d }));
    bulb.position.y = -0.32; lampGroup.add(bulb);
    const bulbGlow = new THREE.PointLight(0xff4d2e, 9, 10, 1.5);
    bulbGlow.position.y = -0.45; lampGroup.add(bulbGlow);
    lampGroup.position.set(0, 6.4, 0);
    scene.add(lampGroup);

    /* ====================== LARGE CIRCULAR TABLE (r = 4.3) ====================== */
    const TABLE_R = 4.3;
    const table = new THREE.Group();
    const topTex = tableTopTexture();
    const tableTop = new THREE.Mesh(
      new THREE.CylinderGeometry(TABLE_R, TABLE_R, 0.26, 72),
      new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.58, metalness: 0.06 }),
    );
    tableTop.position.y = 1.0; tableTop.castShadow = true; tableTop.receiveShadow = true;
    table.add(tableTop);

    const sideTex = woodTexture('#3a2412', 5);
    const tableSide = new THREE.Mesh(
      new THREE.CylinderGeometry(TABLE_R - 0.02, TABLE_R - 0.25, 0.88, 72, 1, true),
      new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.85 }),
    );
    tableSide.position.y = 0.52; tableSide.castShadow = true;
    table.add(tableSide);

    // SUPER NOVA COMMUNITY medallion at the table centre — rotates
    // continuously around the table axis (group rotation.y in the loop)
    const decalGroup = new THREE.Group();
    const decal = new THREE.Mesh(new THREE.CircleGeometry(3.15, 72), new THREE.MeshPhysicalMaterial({ map: tableMedallionTexture(), roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.4, envMapIntensity: 0.4 }));
    decal.rotation.x = -Math.PI / 2; decal.position.y = 1.135;
    decalGroup.add(decal);
    table.add(decalGroup);

    // dark red rim ring
    const rim = new THREE.Mesh(new THREE.TorusGeometry(TABLE_R, 0.06, 10, 96), new THREE.MeshStandardMaterial({ color: 0x3a0a0a, roughness: 0.6 }));
    rim.rotation.x = Math.PI / 2; rim.position.y = 1.08; table.add(rim);

    // metallic chain around the table side (shared geometry, ~60 links)
    const chainMat = new THREE.MeshStandardMaterial({ color: 0x8a8f94, roughness: 0.35, metalness: 0.85 });
    const linkGeo = new THREE.TorusGeometry(0.09, 0.028, 8, 12);
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      const link = new THREE.Mesh(linkGeo, chainMat);
      link.position.set(Math.cos(a) * (TABLE_R - 0.09), 0.74, Math.sin(a) * (TABLE_R - 0.09));
      link.rotation.y = a + Math.PI / 2;
      link.rotation.x = i % 2 ? Math.PI / 2 : 0;
      table.add(link);
    }

    // table centre is intentionally clear — no centrepiece object

    // red underglow: emissive strip + point light beneath the table
    const underGlowStrip = new THREE.Mesh(new THREE.TorusGeometry(TABLE_R - 0.4, 0.05, 8, 88),
      new THREE.MeshStandardMaterial({ color: 0x2a0505, emissive: 0xff1a1a, emissiveIntensity: 2.4 }));
    underGlowStrip.rotation.x = Math.PI / 2; underGlowStrip.position.y = 0.18;
    table.add(underGlowStrip);
    const underLight = new THREE.PointLight(0xff1a1a, 12, 9, 1.5);
    underLight.position.set(0, 0.35, 0);
    table.add(underLight);

    // pedestal base
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.2, 0.5, 24), new THREE.MeshStandardMaterial({ color: 0x140e0a, roughness: 0.9 }));
    pedestal.position.y = 0.22; pedestal.castShadow = true; table.add(pedestal);
    scene.add(table);

    /* -------- table props: cards, chips, dice (gameplay props) -------- */
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const card = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.02, 0.47), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xd8d2c2 : 0xf1f5f9, roughness: 0.6 }));
      card.position.set(Math.cos(a) * 3.4, 1.15, Math.sin(a) * 3.4);
      card.rotation.y = a + Math.PI / 2 + (Math.random() - 0.5) * 0.8;
      card.castShadow = true; scene.add(card);
      const chip = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.04, 14), new THREE.MeshStandardMaterial({ color: [0x991b1b, 0x7f1d1d, 0x555555, 0x8a8a8a][i % 4], roughness: 0.6 }));
      chip.position.set(Math.cos(a + 0.5) * 3.0, 1.16, Math.sin(a + 0.5) * 3.0);
      scene.add(chip);
    }
    [[1.9, -1.5], [-1.8, 1.6]].forEach(([x, z]) => {
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.5 }));
      d.position.set(x, 1.25, z);
      d.rotation.set(Math.random(), Math.random(), Math.random());
      d.castShadow = true; scene.add(d);
    });

    /* ========================== 10 CHAIRS + CHARACTERS ========================== */
    const R = 5.75;
    const seatPos: { x: number; z: number; a: number }[] = [];
    const orderedChars: THREE.Group[] = [];
    for (let seat = 0; seat < SEAT_COUNT; seat++) {
      const a = seatAngle(seat);
      const x = Math.cos(a) * R;
      const z = Math.sin(a) * R;
      seatPos.push({ x, z, a });
      const chair = makeChair(seat);
      chair.position.set(x, 0, z);
      chair.rotation.y = Math.atan2(-x, -z);
      // slight damage tilt on a couple of chairs
      if (seat === 2 || seat === 7) chair.rotation.z = seat === 2 ? 0.03 : -0.025;
      scene.add(chair);
      const char = makeCharacter(seat);
      char.position.set(x * 0.965, 0, z * 0.965);
      char.rotation.y = Math.atan2(-x, -z);
      scene.add(char);
      orderedChars.push(char);
    }

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2(-10, -10);
    renderer.domElement.addEventListener('pointermove', (e) => {
      const r = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    });

    const clock = new THREE.Clock();
    let raf = 0;
    let disposed = false;

    const updatePrivateLabels = () => {
      const { meId: mid, privateProfile: prof } = stateRef.current;
      orderedChars.forEach((g, seat) => {
        if (!g) return;
        const { label, labelTex, labelCanvas } = g.userData;
        if (!label || !labelTex || !labelCanvas) return;
        const isMine = !!mid && !!prof && prof.playerId === mid && prof.seat === seat;
        label.visible = isMine && !!prof;
        if (isMine && prof) drawPrivateLabel(labelCanvas, labelTex, prof);
      });
    };
    updatePrivateLabels();
    const labelTimer = setInterval(updatePrivateLabels, 350);

    const applyPlayers = () => {
      const { players: pls, turnIndex: ti, speaking: spk } = stateRef.current;
      orderedChars.forEach((g, seat) => {
        if (!g) return;
        const p = pls[seat] ?? null;
        const { ring, torso, tag, tagTex, tagCanvas } = g.userData;
        if (!ring || !torso?.material?.color || !tag || !tagTex || !tagCanvas) return;
        if (p) {
          // real player: coloured suit tint + live name/avatar tag + turn ring
          g.visible = true;
          const isTurn = pls[ti]?.id === p.id && !p.bankrupt;
          ring.visible = isTurn;
          torso.material.color.copy(new THREE.Color(SEAT_LOOK[seat % SEAT_LOOK.length].suit).lerp(new THREE.Color(p.color), 0.12));
          const key = `R|${p.name}|${p.avatar}|${p.color}|${p.connected}`;
          if (g.userData.tagKey !== key) {
            g.userData.tagKey = key;
            drawNameTag(tagCanvas, tagTex, { name: p.name, avatar: p.avatar, color: p.color, connected: p.connected, isBot: false });
          }
          const s = spk?.has(p.id) ? 1.045 : 1;
          g.scale.set(s, s, s);
        } else {
          // empty seat: clearly-labelled BOT stand-in (visual only — it never
          // joins the game state, takes turns, or affects multiplayer sync;
          // it disappears the moment a real player takes the seat)
          g.visible = true;
          ring.visible = false;
          torso.material.color.setHex(0x3f3f46);
          const key = 'BOT';
          if (g.userData.tagKey !== key) {
            g.userData.tagKey = key;
            drawNameTag(tagCanvas, tagTex, { name: 'BOT', avatar: 'tophat', color: '#71717a', connected: false, isBot: true });
          }
          g.scale.set(1, 1, 1);
        }
      });
    };
    applyPlayers();
    const playerTimer = setInterval(applyPlayers, 450);

    /* -------- fog motes / ash -------- */
    const moteGeo = new THREE.BufferGeometry();
    const motePos = new Float32Array(400 * 3);
    for (let i = 0; i < 400; i++) {
      motePos[i * 3] = (Math.random() - 0.5) * 13;
      motePos[i * 3 + 1] = Math.random() * 4 + 0.3;
      motePos[i * 3 + 2] = (Math.random() - 0.5) * 13;
    }
    moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
    const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({ color: 0xff4444, size: 0.03, transparent: true, opacity: 0.35 }));
    scene.add(motes);

    function resize() {
      if (!mount.clientWidth || !mount.clientHeight) return;
      const w = mount.clientWidth, h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    function animate() {
      raf = requestAnimationFrame(animate);
      if (disposed) return;
      const t = clock.getElapsedTime();
      lampSpot.intensity = 185 + Math.sin(t * 1.7) * 10 + Math.sin(t * 11) * 4;
      bulbGlow.intensity = 8.5 + Math.sin(t * 7) * 1.2;
      underLight.intensity = 9.5 + Math.sin(t * 2.2) * 1.5;
      motes.rotation.y = t * 0.02;
      // medallion: smooth, continuous infinite rotation (one rev ≈ 35 s)
      decalGroup.rotation.y = t * 0.18;
      orderedChars.forEach((g, seat) => {
        if (!g || !g.visible) return;
        const u = g.userData;
        const { torsoG, headG, ring, jawG, lids, armPivots, elbowPivots } = u;
        if (!torsoG || !headG || !ring || !jawG || !lids || !armPivots || !elbowPivots) return;
        if (!armPivots[0] || !armPivots[1] || !elbowPivots[0] || !elbowPivots[1]) return;
        const talking = stateRef.current.speaking?.has(stateRef.current.players[seat]?.id ?? '') ?? false;
        const amp = talking ? 2.4 : 1; // speaking players bob more, like real talkers
        const ph = t * (1.1 + seat * 0.07) + seat;

        // breathing through the chest, carried up into the head
        torsoG.position.y = u.baseTorsoY + Math.sin(ph) * 0.012 * amp;
        headG.position.y = u.baseHeadY + (Math.sin(ph) * 0.008 + Math.sin(ph * 0.7) * 0.004) * amp;

        // heads track whoever holds the turn; idle sway otherwise
        const active = (stateRef.current.turnIndex ?? 0) % SEAT_COUNT;
        let want = Math.sin(ph * 0.35) * 0.12;
        if (active !== seat) {
          const s0 = seatPos[seat];
          const s1 = seatPos[active];
          if (s0 && s1) {
            const yaw = Math.atan2(-s0.x, -s0.z);
            const dir = Math.atan2(s1.x - s0.x, s1.z - s0.z);
            let d = dir - yaw;
            while (d > Math.PI) d -= Math.PI * 2;
            while (d < -Math.PI) d += Math.PI * 2;
            want += Math.max(-1.05, Math.min(1.05, d)) * 0.75;
          }
        }
        headG.rotation.y += (want - headG.rotation.y) * 0.04;
        headG.rotation.x = Math.sin(ph * 0.42) * 0.05 + (talking ? Math.sin(t * 5 + seat) * 0.03 : 0);

        // blink: short lid squeeze every few seconds, staggered per seat
        if (u.lidClose === 0 && t > u.blinkNext) {
          u.lidClose = t;
          u.blinkNext = t + 2 + Math.random() * 4.5;
        }
        let close = 0;
        if (u.lidClose > 0) {
          const bp = (t - u.lidClose) / 0.13;
          if (bp >= 1) u.lidClose = 0;
          else close = Math.sin(Math.PI * bp);
        }
        lids.forEach((l: THREE.Mesh) => { l.rotation.x = -1 + close * 1.9; });

        // jaw works while the player talks, resting otherwise
        const jawWant = talking ? 0.09 + Math.abs(Math.sin(t * 9 + seat)) * 0.11 : 0;
        jawG.rotation.x += (jawWant - jawG.rotation.x) * 0.3;

        // gesturing hand on the active speaker, lazy sway on everyone else
        const gest = talking ? 0.5 + 0.5 * Math.sin(t * 2.1 + seat * 1.3) : 0;
        armPivots[0].rotation.x = Math.sin(t * 0.55 + seat * 1.7) * 0.05;
        elbowPivots[0].rotation.x = Math.sin(t * 0.5 + seat * 2.1) * 0.04;
        armPivots[1].rotation.x = Math.sin(t * 0.5 + seat) * 0.05 - 0.55 * gest;
        elbowPivots[1].rotation.x = 0.5 * gest;

        if (ring.visible) ring.rotation.z = t * 1.5;
      });
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(orderedChars.filter(Boolean) as THREE.Object3D[], true);
      let hIdx = -1;
      if (hits.length) {
        let o: THREE.Object3D | null = hits[0].object;
        while (o) {
          const idx = orderedChars.indexOf(o as THREE.Group);
          if (idx !== -1) { hIdx = idx; break; }
          o = o.parent;
        }
      }
      renderer.domElement.style.cursor = hIdx >= 0 ? 'pointer' : 'grab';
      const v = viewRef.current;
      if (v === 'mine') {
        const { meId: mid } = stateRef.current;
        const idx = stateRef.current.players.findIndex(p => p.id === mid);
        if (idx >= 0) {
          const s = seatPos[idx];
          camera.position.lerp(new THREE.Vector3(s.x * 1.05 + Math.cos(seatAngle(idx)) * 0.5, 1.95, s.z * 1.05 + Math.sin(seatAngle(idx)) * 0.5), 0.05);
          controls.target.lerp(new THREE.Vector3(s.x * 0.9, 1.2, s.z * 0.9), 0.08);
        }
      } else if (v === 'top') {
        camera.position.lerp(new THREE.Vector3(0, 9, 0.01), 0.05);
        controls.target.lerp(new THREE.Vector3(0, 1, 0), 0.08);
      }
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      clearInterval(labelTimer);
      clearInterval(playerTimer);
      ro.disconnect();
      controls.dispose();
      scene.traverse(o => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Sprite || o instanceof THREE.Points) {
          o.geometry?.dispose?.();
          const m: any = o.material;
          if (Array.isArray(m)) m.forEach(x => x.dispose?.());
          else m?.dispose?.();
          if (m?.map) m.map.dispose?.();
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  if (webglFailed) {
    return (
      <div className="mafia-3d-wrap">
        <TableSeats players={players} meId={meId} privateProfile={privateProfile} turnIndex={turnIndex} speaking={speaking} />
        <p className="mafia-3d-note">3D unavailable on this device — showing the classic top-down table.</p>
      </div>
    );
  }

  const role = privateProfile?.role ? SECRET_ROLES[privateProfile.role] : null;
  const inGame = phase === 'playing';

  return (
    <div className="mafia-3d-wrap">
      <div ref={mountRef} className="mafia-3d-canvas" aria-label="Interactive 3D Mafia table — drag to orbit, scroll to zoom" />

      <div className="mafia-hud-top">
        <div className="mafia-count">
          <span className="mafia-count-ico">👥</span>
          <span><b>{players.length}/{SEAT_COUNT}</b><br /><small>PLAYERS</small></span>
        </div>
        <div className="mafia-badge">
          <span>🪩</span><span><b>MAFIA</b><br /><small>SUPER NOVA</small></span>
        </div>
        <div className="mafia-timer">
          <span>⏱ <b>{timer}</b></span>
          <small>ROUND #{inGame ? '1' : '0'}</small>
        </div>
        <div className="mafia-icons">
          <button className="mafia-icon-btn" title="Settings" onClick={() => setView('overview')}>⚙️</button>
          <button className="mafia-icon-btn" title="Voice" onClick={() => setView('mine')}>🔊</button>
          <button className="mafia-icon-btn" title="Fullscreen" onClick={goFullscreen}>⛶</button>
          <button className="mafia-icon-btn mafia-exit" title="Leave" onClick={() => void onLeave?.()}>🚪</button>
        </div>
      </div>

      <div className="mafia-crown-card">
        <span className="mafia-crown-ico">👑</span>
        <span><b>MAFIA</b><br /><small>ONLINE</small></span>
      </div>

      <div className="mafia-3d-controls">
        <button className={`btn btn-ghost !py-1 !px-2.5 text-[11px] ${view === 'overview' ? '!border-red-500/60 !text-red-300' : ''}`} onClick={() => setView('overview')}>🧟 Overview</button>
        <button className={`btn btn-ghost !py-1 !px-2.5 text-[11px] ${view === 'mine' ? '!border-red-500/60 !text-red-300' : ''}`} onClick={() => setView('mine')}>🪑 My Chair</button>
        <button className={`btn btn-ghost !py-1 !px-2.5 text-[11px] ${view === 'top' ? '!border-red-500/60 !text-red-300' : ''}`} onClick={() => setView('top')}>⬇️ Top</button>
        <span className="mafia-3d-hint">drag · orbit · scroll · zoom</span>
      </div>

      <div className="mafia-welcome">
        <span className="mafia-welcome-hat">🎙️</span>
        <span>
          <b>Welcome to SUPER NOVA Mafia!</b>
          <small>{inGame ? 'Good luck... and watch your back!' : 'The game will start soon...'}</small>
        </span>
      </div>

      <div className="mafia-your-role" role="status">
        <small>Your Role</small>
        {role ? (
          <>
            <span className="mafia-your-role-ico" style={{ color: role.color }}>{role.emoji}</span>
            <b style={{ color: role.color }}>{role.label}</b>
            <p>{role.hint}.<br />Find the Mafia!</p>
          </>
        ) : (
          <>
            <span className="mafia-your-role-ico">🧟</span>
            <b>Waiting…</b>
            <p>Your secret role appears privately above your zombie-mafia character.</p>
          </>
        )}
        <span className="mafia-3d-lock">🔒 only you see this</span>
      </div>
    </div>
  );
}
