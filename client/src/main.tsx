import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

/**
 * Compatibility shim: CanvasRenderingContext2D.roundRect is missing on
 * Safari < 16 and older WebViews — the 3D name tags / voice badges use it.
 * Polyfill it once at startup so older iOS/Android browsers don't crash.
 */
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (
    this: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number | DOMPointInit | (number | DOMPointInit)[],
  ): void {
    const radii = Array.isArray(r) ? r : [r, r, r, r];
    const [tl, tr, br, bl] = radii.map((v) => {
      const n = typeof v === 'number' ? v : v?.x ?? 0;
      return Math.min(n, w / 2, h / 2);
    });
    this.beginPath();
    this.moveTo(x + tl!, y);
    this.lineTo(x + w - tr!, y);
    this.arcTo(x + w, y, x + w, y + tr!, tr!);
    this.lineTo(x + w, y + h - br!);
    this.arcTo(x + w, y + h, x + w - br!, y + h, br!);
    this.lineTo(x + bl!, y + h);
    this.arcTo(x, y + h, x, y + h - bl!, bl!);
    this.lineTo(x, y + tl!);
    this.arcTo(x, y, x + tl!, y, tl!);
    this.closePath();
  };
}

const root = document.getElementById('root');
if (!root) throw new Error('#root element is missing from index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
