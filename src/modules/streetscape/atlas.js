// Canvas atlases owned by the streetscape package.
//   ironAtlas : wrought-iron railing strips (tile along U), pierced masonry strip, two gate-leaf designs.   1024 x 2048
//   signAtlas : street-name plates, house numbers, heritage plaques, tourist finger plates, boulder lettering. 2048 x 2048
// Colour and coverage are painted on two canvases and combined into an RGBA DataTexture, so the RGB under transparent
// texels keeps the iron / stone colour (no dark fringes in the mip chain). Row 0 of the data is v = 0: atlas rectangles
// are plain pixel boxes [x, y, w, h] with y measured from the top of the canvas.
import * as THREE from 'three';

const CJK = '"Noto Sans CJK SC","Source Han Sans SC","PingFang SC","Microsoft YaHei","Heiti SC","SimHei","WenQuanYi Zen Hei","Droid Sans Fallback",sans-serif';
const KAI = '"STKaiti","KaiTi","Kaiti SC","AR PL UKai CN","Noto Serif CJK SC","Songti SC","SimSun","WenQuanYi Zen Hei",serif';
const LATIN = '"Helvetica Neue",Arial,"DejaVu Sans",sans-serif';

class Atlas {
  constructor(ctx, W, H, scale) {
    this.W = W; this.H = H; this.scale = scale; this.ctx = ctx;
    const a = ctx.tex.makeCanvas(Math.round(W * scale), Math.round(H * scale));
    const b = ctx.tex.makeCanvas(Math.round(W * scale), Math.round(H * scale));
    this.c = a; this.m = b;
    a.g.scale(scale, scale); b.g.scale(scale, scale);
    b.g.fillStyle = '#000'; b.g.fillRect(0, 0, W, H);
    a.g.fillStyle = '#1f2321'; a.g.fillRect(0, 0, W, H);
  }
  /** fn(g, ink) is called twice: once for colour (ink(c) = c) and once for coverage (ink(c) = white). */
  draw(fn) {
    for (const mask of [false, true]) {
      const g = mask ? this.m.g : this.c.g;
      g.save();
      fn(g, mask ? () => '#fff' : (c) => c, mask);
      g.restore();
    }
  }
  /** uv rectangle [u0, v0, u1, v1] of a pixel box, inset by `pad` pixels. */
  rect(x, y, w, h, pad = 1) { return [(x + pad) / this.W, (y + pad) / this.H, (x + w - pad) / this.W, (y + h - pad) / this.H]; }
  finish({ repeatU = false } = {}) {
    const w = this.c.canvas.width, h = this.c.canvas.height;
    const col = this.c.g.getImageData(0, 0, w, h).data, msk = this.m.g.getImageData(0, 0, w, h).data;
    const out = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h * 4; i += 4) { out[i] = col[i]; out[i + 1] = col[i + 1]; out[i + 2] = col[i + 2]; out[i + 3] = msk[i]; }
    const t = new THREE.DataTexture(out, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = repeatU ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
    t.anisotropy = Math.min(this.ctx.quality.anisotropy, this.ctx.renderer.capabilities.getMaxAnisotropy());
    t.needsUpdate = true;
    this.c.canvas.width = this.c.canvas.height = this.m.canvas.width = this.m.canvas.height = 1; // free the canvases
    return t;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// iron atlas
// ---------------------------------------------------------------------------------------------------------------------
export const RAIL_TILE = 0.96;      // metres of railing per U repeat (8 pickets at 12 cm)
const IW = 1024, IH = 2048;
// strips: [y, h] in pixels; each spans the full width and tiles along U
const STRIP = { spear: [8, 400], scroll: [424, 400], pierced: [844, 168] };
const GATE_Y = 1024, GATE_W = 512, GATE_H = 1024;

function bar(g, ink, mask, x, y, w, h, base, hi) {
  g.fillStyle = ink(base); g.fillRect(x, y, w, h);
  if (!mask && hi) { g.fillStyle = hi; g.fillRect(x + w * 0.2, y, w * 0.16, h); }
}
function hbar(g, ink, mask, x, y, w, h, base, hi) {
  g.fillStyle = ink(base); g.fillRect(x, y, w, h);
  if (!mask && hi) { g.fillStyle = hi; g.fillRect(x, y + h * 0.12, w, h * 0.16); }
}
function spearTip(g, ink, mask, x, yTip, hw, len, base, hi) {
  g.fillStyle = ink(base);
  g.beginPath();
  g.moveTo(x, yTip);
  g.bezierCurveTo(x + hw * 0.4, yTip + len * 0.35, x + hw * 1.25, yTip + len * 0.55, x + hw * 0.5, yTip + len);
  g.lineTo(x - hw * 0.5, yTip + len);
  g.bezierCurveTo(x - hw * 1.25, yTip + len * 0.55, x - hw * 0.4, yTip + len * 0.35, x, yTip);
  g.fill();
  if (!mask && hi) { g.strokeStyle = hi; g.lineWidth = hw * 0.22; g.beginPath(); g.moveTo(x - hw * 0.15, yTip + len * 0.25); g.lineTo(x - hw * 0.3, yTip + len * 0.9); g.stroke(); }
}
function ring(g, ink, mask, cx, cy, rx, ry, lw, base, hi) {
  g.strokeStyle = ink(base); g.lineWidth = lw;
  g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.stroke();
  if (!mask && hi) { g.strokeStyle = hi; g.lineWidth = lw * 0.3; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, Math.PI * 1.05, Math.PI * 1.6); g.stroke(); }
}
/** C-scroll: a spiral ending in a curl, drawn as a stroked path. dir = +1 opens to the right. */
function scroll(g, ink, mask, x, y, sx, sy, lw, base, flip = 1, turns = 1.35) {
  g.strokeStyle = ink(base); g.lineWidth = lw; g.lineCap = 'round';
  g.beginPath();
  const n = 26;
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = t * Math.PI * 2 * turns, r = 1 - 0.78 * t;
    const px = x + flip * (Math.cos(a) * r - 1) * sx, py = y - Math.sin(a) * r * sy;
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.stroke();
}

function drawRailStrips(A) {
  const PXM = IW / RAIL_TILE; // horizontal pixels per metre
  // ---- spear railing, black --------------------------------------------------------------------------------------
  {
    const [y0, h] = STRIP.spear, BASE = '#1d211f', HI = '#474d49';
    A.draw((g, ink, mask) => {
      if (!mask) { g.fillStyle = BASE; g.fillRect(0, y0 - 8, IW, h + 16); }
      const Y = (m) => y0 + (m / 0.95) * h; // metres from the top of the strip (0.95 m tall)
      const bw = 0.019 * PXM;
      for (let i = 0; i < 8; i++) {
        const x = (0.06 + 0.12 * i) * PXM;
        bar(g, ink, mask, x - bw / 2, Y(0.075), bw, Y(0.9) - Y(0.075), BASE, HI);
        spearTip(g, ink, mask, x, Y(0.0) + 2, 0.024 * PXM, Y(0.095) - Y(0), BASE, HI);
        // collar under the top rail
        g.fillStyle = ink(BASE); g.fillRect(x - bw * 0.95, Y(0.232), bw * 1.9, Y(0.252) - Y(0.232));
        // dog bar between pickets
        const xd = 0.12 * i * PXM, dw = bw * 0.8;
        for (const xx of i === 0 ? [xd, IW] : [xd]) {
          bar(g, ink, mask, xx - dw / 2, Y(0.63), dw, Y(0.9) - Y(0.63), BASE, HI);
          spearTip(g, ink, mask, xx, Y(0.565), 0.019 * PXM, Y(0.64) - Y(0.565), BASE, HI);
        }
      }
      hbar(g, ink, mask, 0, Y(0.195), IW, Y(0.232) - Y(0.195), BASE, HI);
      hbar(g, ink, mask, 0, Y(0.865), IW, Y(0.9) - Y(0.865), BASE, HI);
    });
  }
  // ---- ring-frieze railing, dark green -----------------------------------------------------------------------------
  {
    const [y0, h] = STRIP.scroll, BASE = '#22382a', HI = '#35503f';
    A.draw((g, ink, mask) => {
      if (!mask) { g.fillStyle = BASE; g.fillRect(0, y0 - 8, IW, h + 16); }
      const Y = (m) => y0 + (m / 0.95) * h;
      const bw = 0.019 * PXM, ry = (Y(0.3) - Y(0.19)) / 2 - 1;
      for (let i = 0; i < 8; i++) {
        const x = (0.06 + 0.12 * i) * PXM;
        bar(g, ink, mask, x - bw / 2, Y(0.3), bw, Y(0.9) - Y(0.3), BASE, HI);
        ring(g, ink, mask, x, (Y(0.19) + Y(0.3)) / 2, 0.047 * PXM, ry, 0.013 * PXM, BASE, HI);
        // finial: stem + ball, alternately tall and short
        const tall = i % 2 === 0, top = tall ? 0.03 : 0.085;
        bar(g, ink, mask, x - bw * 0.4, Y(top + 0.03), bw * 0.8, Y(0.16) - Y(top + 0.03), BASE, HI);
        if (tall) spearTip(g, ink, mask, x, Y(0.0) + 2, 0.022 * PXM, Y(0.085) - Y(0), BASE, HI);
        else { g.fillStyle = ink(BASE); g.beginPath(); g.ellipse(x, Y(top + 0.025), 0.02 * PXM, Y(0.025) - Y(0), 0, 0, 7); g.fill(); }
        // small circles on the bottom rail between the pickets
        const xc = 0.12 * i * PXM;
        for (const xx of i === 0 ? [xc, IW] : [xc]) ring(g, ink, mask, xx, Y(0.826), 0.034 * PXM, Y(0.034) - Y(0), 0.011 * PXM, BASE, HI);
      }
      hbar(g, ink, mask, 0, Y(0.155), IW, Y(0.19) - Y(0.155), BASE, HI);
      hbar(g, ink, mask, 0, Y(0.3), IW, Y(0.335) - Y(0.3), BASE, HI);
      hbar(g, ink, mask, 0, Y(0.865), IW, Y(0.9) - Y(0.865), BASE, HI);
    });
  }
  // ---- pierced masonry (古钱纹 open-work blocks), cement grey -----------------------------------------------------
  {
    const [y0, h] = STRIP.pierced, rand = A.ctx.rng.makeRng('streetscape:pierced');
    A.draw((g, ink, mask) => {
      g.fillStyle = ink('#a6a39a'); g.fillRect(0, y0, IW, h);
      if (!mask) {
        g.fillStyle = '#a6a39a'; g.fillRect(0, y0 - 8, IW, h + 16);
        for (let i = 0; i < 2600; i++) { // cement speckle + stains
          const v = rand(); g.fillStyle = v < 0.5 ? 'rgba(70,66,58,0.16)' : 'rgba(232,226,212,0.16)';
          g.fillRect(rand() * IW, y0 + rand() * h, 1 + rand() * 3, 1 + rand() * 2);
        }
        const gr = g.createLinearGradient(0, y0, 0, y0 + h);
        gr.addColorStop(0, 'rgba(60,62,52,0.05)'); gr.addColorStop(1, 'rgba(60,66,48,0.3)');
        g.fillStyle = gr; g.fillRect(0, y0, IW, h);
      }
      const cw = IW / 4, top = y0 + h * 0.07, ch = (h * 0.86) / 2;
      for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) {
        const cx = cw * (c + 0.5), cy = top + ch * (r + 0.5), rx = cw * 0.43, ry = ch * 0.43;
        // hole = disc minus a four-pointed star
        if (!mask) {   // recessed margin round the opening, then the dark reveal (the cut depth of the block)
          g.fillStyle = 'rgba(52,50,45,0.28)'; g.beginPath(); g.ellipse(cx, cy + 1, rx + 11, ry + 5, 0, 0, 7); g.fill();
          g.fillStyle = 'rgba(34,32,29,0.8)'; g.beginPath(); g.ellipse(cx, cy + 1, rx + 5, ry + 2.5, 0, 0, 7); g.fill();
        }
        g.fillStyle = mask ? '#000' : '#4a473f';
        g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, 7); g.fill();
        g.fillStyle = ink('#aeaba1');
        g.beginPath();
        const k = 0.2;
        g.moveTo(cx, cy - ry * 1.04);
        g.quadraticCurveTo(cx + rx * k, cy - ry * k, cx + rx * 1.04, cy);
        g.quadraticCurveTo(cx + rx * k, cy + ry * k, cx, cy + ry * 1.04);
        g.quadraticCurveTo(cx - rx * k, cy + ry * k, cx - rx * 1.04, cy);
        g.quadraticCurveTo(cx - rx * k, cy - ry * k, cx, cy - ry * 1.04);
        g.fill();
        if (!mask) { // the star's cut edges are in shade below-right, lit on the lower lip of the opening
          g.strokeStyle = 'rgba(40,38,34,0.55)'; g.lineWidth = 3;
          g.beginPath(); g.moveTo(cx + rx * 1.04, cy); g.quadraticCurveTo(cx + rx * k, cy + ry * k, cx, cy + ry * 1.04); g.quadraticCurveTo(cx - rx * k, cy + ry * k, cx - rx * 1.04, cy); g.stroke();
          g.strokeStyle = 'rgba(226,222,210,0.45)'; g.lineWidth = 2; g.beginPath(); g.ellipse(cx, cy + 1, rx + 6, ry + 3.5, 0, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); }
      }
      if (!mask) { // block joints
        g.fillStyle = 'rgba(74,70,62,0.5)';
        for (let c = 0; c <= 4; c++) g.fillRect(c * cw - 1.5, y0, 3, h);
        g.fillRect(0, top + ch - 1, IW, 2.5);
      }
    });
  }
}

/** One gate leaf in a 512 x 1024 cell: hinge stile at x = 0, meeting stile at x = 1; 2.15 m tall. */
function drawGateLeaf(A, x0, design) {
  const y0 = GATE_Y, W = GATE_W, H = GATE_H;
  const BASE = design === 0 ? '#1c201e' : '#22382a', HI = design === 0 ? '#474d49' : '#37523f';
  const Y = (m) => y0 + (m / 2.15) * H;               // metres from the top of the cell
  const topAt = (u) => 0.5 - 0.4 * Math.pow(u, 1.5);   // top rail height (m from the cell top): rises to the meeting stile
  A.draw((g, ink, mask) => {
    if (!mask) { g.fillStyle = BASE; g.fillRect(x0, y0, W, H); }
    g.save();
    g.beginPath(); g.rect(x0 + 1, y0 + 1, W - 2, H - 2); g.clip();
    const X = (u) => x0 + 4 + u * (W - 8);
    const stile = 20, railH = Y(0.06) - Y(0);
    const curve = (off, lw) => {
      g.strokeStyle = ink(BASE); g.lineWidth = lw; g.lineCap = 'butt';
      g.beginPath();
      for (let i = 0; i <= 24; i++) { const u = i / 24; const px = X(u), py = Y(topAt(u) + off); if (i === 0) g.moveTo(px, py); else g.lineTo(px, py); }
      g.stroke();
      if (!mask) {
        g.strokeStyle = HI; g.lineWidth = lw * 0.25;
        g.beginPath();
        for (let i = 0; i <= 24; i++) { const u = i / 24; const px = X(u), py = Y(topAt(u) + off) - lw * 0.2; if (i === 0) g.moveTo(px, py); else g.lineTo(px, py); }
        g.stroke();
      }
    };
    const nb = 9;
    // vertical bars with spear tips above the curved top rail
    for (let i = 1; i < nb; i++) {
      const u = i / nb, x = X(u), bw = 7;
      const yTop = Y(topAt(u) - 0.11);
      bar(g, ink, mask, x - bw / 2, yTop + 14, bw, Y(2.05) - yTop - 14, BASE, HI);
      spearTip(g, ink, mask, x, yTop - 12, 9, 40, BASE, HI);
    }
    // stiles
    bar(g, ink, mask, X(0) - 4, Y(topAt(0) - 0.04), stile, Y(2.1) - Y(topAt(0) - 0.04), BASE, HI);
    bar(g, ink, mask, X(1) + 4 - stile, Y(topAt(1) - 0.06), stile, Y(2.1) - Y(topAt(1) - 0.06), BASE, HI);
    g.fillStyle = ink(BASE); g.beginPath(); g.ellipse(X(1) + 4 - stile / 2, Y(topAt(1) - 0.09), stile * 0.62, 16, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(X(0) - 4 + stile / 2, Y(topAt(0) - 0.07), stile * 0.62, 16, 0, 0, 7); g.fill();
    curve(0, railH);
    curve(0.2, railH * 0.8);
    // rings between the two curved rails
    for (let i = 0; i < nb; i++) {
      const u = (i + 0.5) / nb;
      ring(g, ink, mask, X(u), Y(topAt(u) + 0.1), (W - 8) / nb * 0.3, Y(0.068) - Y(0), 6, BASE, HI);
    }
    hbar(g, ink, mask, x0, Y(2.04), W, Y(2.1) - Y(2.04), BASE, HI);
    if (design === 0) {
      // lock rail + C-scroll band + dog bars in the lower panel
      hbar(g, ink, mask, x0, Y(1.16), W, Y(1.21) - Y(1.16), BASE, HI);
      hbar(g, ink, mask, x0, Y(1.42), W, Y(1.455) - Y(1.42), BASE, HI);
      for (let i = 0; i < nb; i++) {
        const u = (i + 0.5) / nb, x = X(u);
        scroll(g, ink, mask, x + 2, Y(1.315), 11, Y(0.085) - Y(0), 6, BASE, i % 2 ? 1 : -1);
        bar(g, ink, mask, x - 3, Y(1.5), 6, Y(2.05) - Y(1.5), BASE, HI);
        spearTip(g, ink, mask, x, Y(1.455) + 2, 7, 26, BASE, HI);
      }
      // large scrolls flanking the centre of the upper panel
      scroll(g, ink, mask, X(0.5) + 6, Y(0.86), 62, Y(0.17) - Y(0), 9, BASE, 1, 1.5);
      scroll(g, ink, mask, X(0.5) - 6, Y(0.86), 62, Y(0.17) - Y(0), 9, BASE, -1, 1.5);
    } else {
      // shield medallion + solid riveted sheet below
      hbar(g, ink, mask, x0, Y(1.3), W, Y(1.35) - Y(1.3), BASE, HI);
      g.fillStyle = ink(BASE); g.fillRect(x0, Y(1.35), W, Y(2.05) - Y(1.35));
      if (!mask) {
        g.strokeStyle = HI; g.lineWidth = 3; g.strokeRect(X(0.08), Y(1.43), X(0.92) - X(0.08), Y(1.97) - Y(1.43));
        g.fillStyle = HI;
        for (let i = 0; i <= 6; i++) for (const yy of [1.39, 2.01]) { g.beginPath(); g.arc(X(0.06 + i * 0.147), Y(yy), 3.2, 0, 7); g.fill(); }
        g.strokeStyle = 'rgba(90,120,100,0.6)'; g.lineWidth = 2.5;
        g.beginPath(); g.moveTo(X(0.5), Y(1.5)); g.lineTo(X(0.78), Y(1.7)); g.lineTo(X(0.5), Y(1.9)); g.lineTo(X(0.22), Y(1.7)); g.closePath(); g.stroke();
      }
      const cx = X(0.5), cy = Y(0.86), rx = (W - 8) * 0.3, ry = Y(0.27) - Y(0);
      // shield
      g.fillStyle = ink(BASE);
      g.beginPath();
      g.moveTo(cx - rx, cy - ry);
      g.quadraticCurveTo(cx, cy - ry * 1.25, cx + rx, cy - ry);
      g.quadraticCurveTo(cx + rx * 1.05, cy + ry * 0.45, cx, cy + ry * 1.25);
      g.quadraticCurveTo(cx - rx * 1.05, cy + ry * 0.45, cx - rx, cy - ry);
      g.fill();
      if (!mask) {
        g.strokeStyle = HI; g.lineWidth = 4;
        g.beginPath();
        g.moveTo(cx - rx * 0.78, cy - ry * 0.78);
        g.quadraticCurveTo(cx, cy - ry * 0.98, cx + rx * 0.78, cy - ry * 0.78);
        g.quadraticCurveTo(cx + rx * 0.82, cy + ry * 0.35, cx, cy + ry * 0.98);
        g.quadraticCurveTo(cx - rx * 0.82, cy + ry * 0.35, cx - rx * 0.78, cy - ry * 0.78);
        g.stroke();
        g.lineWidth = 3; g.beginPath(); g.moveTo(cx, cy - ry * 0.6); g.lineTo(cx, cy + ry * 0.7); g.moveTo(cx - rx * 0.5, cy - ry * 0.15); g.lineTo(cx + rx * 0.5, cy - ry * 0.15); g.stroke();
      }
      scroll(g, ink, mask, cx + rx + 34, cy + ry * 0.2, 22, Y(0.12) - Y(0), 7, BASE, 1);
      scroll(g, ink, mask, cx - rx - 34, cy + ry * 0.2, 22, Y(0.12) - Y(0), 7, BASE, -1);
    }
    g.restore();
  });
}

export function buildIronAtlas(ctx) {
  const scale = ctx.quality.texSize >= 1024 ? 1 : 0.5;
  const A = new Atlas(ctx, IW, IH, scale);
  drawRailStrips(A);
  drawGateLeaf(A, 0, 0);
  drawGateLeaf(A, GATE_W, 1);
  const v = (y) => y / IH;
  return {
    texture: A.finish({ repeatU: true }),
    width: IW * scale, height: IH * scale,
    /** v range [top, bottom] of a tiling strip */
    strip: { spear: [v(STRIP.spear[0]), v(STRIP.spear[0] + STRIP.spear[1])], scroll: [v(STRIP.scroll[0]), v(STRIP.scroll[0] + STRIP.scroll[1])],
      pierced: [v(STRIP.pierced[0] + 1), v(STRIP.pierced[0] + STRIP.pierced[1] - 1)] },
    /** uv rect [u0, v0, u1, v1] of gate leaf design d (0 | 1): u0 = hinge side */
    gate: (d) => [(d * GATE_W + 2) / IW, (GATE_Y + 2) / IH, ((d + 1) * GATE_W - 2) / IW, (GATE_Y + GATE_H - 2) / IH],
    gateHeight: 2.15,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// sign atlas
// ---------------------------------------------------------------------------------------------------------------------
const SW = 2048, SH = 2048;

function fitText(g, text, maxW, size, weight, family, min = 8) {
  let s = size;
  do { g.font = `${weight} ${s}px ${family}`; if (g.measureText(text).width <= maxW) break; s -= 1; } while (s > min);
  return s;
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function spaced(g, text, cx, y, spacing) {
  let w = 0; for (const ch of text) w += g.measureText(ch).width + spacing; w -= spacing;
  let x = cx - w / 2;
  g.textAlign = 'left';
  for (const ch of text) { g.fillText(ch, x, y); x += g.measureText(ch).width + spacing; }
  g.textAlign = 'center';
}

/**
 * spec: { streets: [{id, name, pinyin, ends}], houses: [{key, street, number}], plaques: [{key, name?, address?}],
 *         tourist: [{key, name, en, dist, arrow: 'left'|'right'}] }
 * Returns { texture, street[id] = [rectA, rectB], house[key], plaque[key], tourist[key], boulder }.
 */
export function buildSignAtlas(ctx, spec) {
  const scale = ctx.quality.texSize >= 1024 ? 1 : 0.5;
  const A = new Atlas(ctx, SW, SH, scale);
  const out = { street: {}, house: {}, plaque: {}, tourist: {} };
  A.draw((g, ink, mask) => { if (!mask) { g.fillStyle = '#1f5fa8'; g.fillRect(0, 0, SW, 1262); } });

  // ---- street-name plates: 512 x 154 (1.0 x 0.3 m), two faces per street (direction characters swap) -------------------
  spec.streets.forEach((st, i) => {
    for (let f = 0; f < 2; f++) {
      const n = i * 2 + f, x = (n % 4) * 512, y = Math.floor(n / 4) * 160, w = 512, h = 154;
      const L = f === 0 ? st.ends[0] : st.ends[1], R = f === 0 ? st.ends[1] : st.ends[0];
      A.draw((g, ink, mask) => {
        g.fillStyle = ink('#1f5fa8'); g.fillRect(x, y, w, h);
        if (mask) return;
        const gr = g.createLinearGradient(0, y, 0, y + h);
        gr.addColorStop(0, 'rgba(255,255,255,0.10)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,30,0.16)');
        g.fillStyle = gr; g.fillRect(x, y, w, h);
        g.strokeStyle = '#f4f6f8'; g.lineWidth = 5; roundRect(g, x + 8, y + 8, w - 16, h - 16, 9); g.stroke();
        // lower band: white with blue pinyin
        g.fillStyle = '#f4f6f8'; g.fillRect(x + 10, y + 100, w - 20, h - 110);
        g.fillStyle = '#f4f6f8'; g.textAlign = 'center'; g.textBaseline = 'middle';
        const s = fitText(g, st.name, 300, 70, '700', CJK, 30);
        g.font = `700 ${s}px ${CJK}`;
        spaced(g, st.name, x + w / 2, y + 57, st.name.length > 4 ? 2 : 10);
        // direction characters + outward arrows
        g.font = `700 38px ${CJK}`;
        g.fillText(L, x + 58, y + 50); g.fillText(R, x + w - 58, y + 50);
        g.beginPath(); g.moveTo(x + 22, y + 82); g.lineTo(x + 40, y + 73); g.lineTo(x + 40, y + 79); g.lineTo(x + 92, y + 79); g.lineTo(x + 92, y + 85); g.lineTo(x + 40, y + 85); g.lineTo(x + 40, y + 91); g.closePath(); g.fill();
        g.beginPath(); g.moveTo(x + w - 22, y + 82); g.lineTo(x + w - 40, y + 73); g.lineTo(x + w - 40, y + 79); g.lineTo(x + w - 92, y + 79); g.lineTo(x + w - 92, y + 85); g.lineTo(x + w - 40, y + 85); g.lineTo(x + w - 40, y + 91); g.closePath(); g.fill();
        g.fillStyle = '#1f5fa8';
        const ps = fitText(g, st.pinyin, w - 90, 30, '700', LATIN, 12);
        g.font = `700 ${ps}px ${LATIN}`;
        spaced(g, st.pinyin, x + w / 2, y + 122, 3);
      });
      (out.street[st.id] || (out.street[st.id] = []))[f] = A.rect(x, y, w, h, 1.5);
    }
  });

  // ---- house-number plates: 126 x 86 px (0.30 x 0.20 m) ---------------------------------------------------------------
  spec.houses.forEach((hs, i) => {
    const x = (i % 15) * 132 + 3, y = 802 + Math.floor(i / 15) * 92, w = 126, h = 86;
    A.draw((g, ink, mask) => {
      g.fillStyle = ink('#1b56a0'); g.fillRect(x, y, w, h);
      if (mask) return;
      g.strokeStyle = '#f2f4f6'; g.lineWidth = 3; roundRect(g, x + 5, y + 5, w - 10, h - 10, 5); g.stroke();
      g.fillStyle = '#f2f4f6'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const s = fitText(g, hs.street, w - 26, 17, '700', CJK, 9);
      g.font = `700 ${s}px ${CJK}`; g.fillText(hs.street, x + w / 2, y + 22);
      g.fillRect(x + 14, y + 33, w - 28, 1.5);
      g.font = `700 40px ${LATIN}`;
      const nw = g.measureText(String(hs.number)).width;
      g.fillText(String(hs.number), x + w / 2 - 9, y + 58);
      g.font = `700 16px ${CJK}`; g.fillText('号', x + w / 2 - 9 + nw / 2 + 12, y + 64);
    });
    out.house[hs.key] = A.rect(x, y, w, h, 1.5);
  });

  // ---- heritage plaques: 224 x 300 px (0.36 x 0.48 m) ------------------------------------------------------------------
  spec.plaques.forEach((pl, i) => {
    const x = i * 230 + 3, y = 1266, w = 224, h = 296;
    A.draw((g, ink, mask) => {
      g.fillStyle = ink('#27221e'); g.fillRect(x, y, w, h);
      if (mask) return;
      const gr = g.createLinearGradient(x, y, x + w, y + h);
      gr.addColorStop(0, '#3a322a'); gr.addColorStop(0.5, '#27221e'); gr.addColorStop(1, '#1b1815');
      g.fillStyle = gr; g.fillRect(x, y, w, h);
      const GOLD = '#d2b46c';
      g.strokeStyle = GOLD; g.lineWidth = 3; g.strokeRect(x + 9, y + 9, w - 18, h - 18);
      g.lineWidth = 1; g.strokeRect(x + 15, y + 15, w - 30, h - 30);
      g.fillStyle = GOLD; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const [sx, sy] of [[20, 20], [w - 20, 20], [20, h - 20], [w - 20, h - 20]]) { g.beginPath(); g.arc(x + sx, y + sy, 3, 0, 7); g.fill(); }
      if (pl.name) {
        const s = fitText(g, pl.name, w - 50, 46, '700', KAI, 22);
        g.font = `700 ${s}px ${KAI}`; g.fillText(pl.name, x + w / 2, y + 72);
        g.fillRect(x + 40, y + 108, w - 80, 2);
        g.font = `700 21px ${CJK}`; g.fillText('优秀历史建筑', x + w / 2, y + 136);
        g.font = `500 17px ${CJK}`; g.fillText(pl.address || '', x + w / 2, y + 168);
        g.fillStyle = 'rgba(210,180,108,0.55)';
        for (let k = 0; k < 4; k++) g.fillRect(x + 34, y + 192 + k * 12, (w - 68) * (k === 3 ? 0.6 : 1), 2);
      } else {
        g.font = `700 29px ${CJK}`; g.fillText('优秀历史建筑', x + w / 2, y + 62);
        g.font = `600 11px ${LATIN}`; spaced(g, 'HERITAGE ARCHITECTURE', x + w / 2, y + 90, 1.5);
        g.fillRect(x + 40, y + 106, w - 80, 2);
        g.fillStyle = 'rgba(210,180,108,0.55)';
        for (let k = 0; k < 8; k++) g.fillRect(x + 34, y + 126 + k * 13, (w - 68) * (k === 7 ? 0.45 : 1), 2);
      }
      g.fillStyle = GOLD;
      g.font = `600 15px ${CJK}`; g.fillText('青岛市人民政府', x + w / 2, y + h - 38);
    });
    out.plaque[pl.key] = A.rect(x, y, w, h, 1.5);
  });

  // ---- brown tourist finger plates: 400 x 84 px (1.1 x 0.23 m) --------------------------------------------------------
  spec.tourist.forEach((tp, i) => {
    const x = (i % 5) * 406 + 3, y = 1570 + Math.floor(i / 5) * 88, w = 400, h = 84;
    A.draw((g, ink, mask) => {
      g.fillStyle = ink('#7a4a22'); g.fillRect(x, y, w, h);
      if (mask) return;
      g.strokeStyle = '#f6f1e6'; g.lineWidth = 3; roundRect(g, x + 5, y + 5, w - 10, h - 10, 6); g.stroke();
      g.fillStyle = '#f6f1e6';
      const right = tp.arrow === 'right', ax = right ? x + w - 22 : x + 22, d = right ? -1 : 1;
      g.beginPath(); g.moveTo(ax, y + h / 2); g.lineTo(ax + d * 26, y + h / 2 - 20); g.lineTo(ax + d * 26, y + h / 2 - 8); g.lineTo(ax + d * 56, y + h / 2 - 8);
      g.lineTo(ax + d * 56, y + h / 2 + 8); g.lineTo(ax + d * 26, y + h / 2 + 8); g.lineTo(ax + d * 26, y + h / 2 + 20); g.closePath(); g.fill();
      const tx0 = right ? x + 20 : x + 92, tw = w - 112;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const s = fitText(g, tp.name, tw - 70, 38, '700', CJK, 18);
      g.font = `700 ${s}px ${CJK}`; g.fillText(tp.name, tx0 + (tw - 62) / 2, y + 33);
      g.font = `600 13px ${LATIN}`; g.fillText(tp.en, tx0 + (tw - 62) / 2, y + 63);
      g.font = `700 19px ${LATIN}`; g.fillText(tp.dist, tx0 + tw - 30, y + 44);
    });
    out.tourist[tp.key] = A.rect(x, y, w, h, 1.5);
  });

  // ---- boulder lettering (coverage = glyphs only) -----------------------------------------------------------------------
  {
    const x = 4, y = 1926, w = 480, h = 118;
    A.draw((g, ink, mask) => {
      if (!mask) { g.fillStyle = '#b3261e'; g.fillRect(x - 4, y - 4, w + 8, h + 8); return; }
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `700 100px ${KAI}`;
      g.strokeStyle = '#fff'; g.lineWidth = 7; g.lineJoin = 'round';
      let cx = x + 84;
      for (const ch of '八大关') { g.strokeText(ch, cx, y + h / 2 + 4); g.fillText(ch, cx, y + h / 2 + 4); cx += 156; }
    });
    out.boulder = A.rect(x, y, w, h, 0.5);
  }
  out.texture = A.finish();
  return out;
}

/** Soft radial sprite (white, alpha in RGB for additive use). kind 'glow' has a hot core, 'pool' is a broad falloff. */
export function buildRadialTexture(ctx, kind) {
  const { canvas, g } = ctx.tex.makeCanvas(128, 128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  const stops = kind === 'glow'
    ? [[0, 1], [0.05, 0.95], [0.1, 0.55], [0.2, 0.26], [0.38, 0.11], [0.62, 0.035], [0.85, 0.008], [1, 0]]
    : [[0, 1], [0.12, 0.9], [0.3, 0.58], [0.5, 0.3], [0.7, 0.12], [0.88, 0.03], [1, 0]];
  for (const [p, a] of stops) { const v = Math.round(a * 255); gr.addColorStop(p, `rgb(${v},${v},${v})`); }
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = ctx.tex.canvasTexture(canvas, { srgb: true, wrap: false });
  t.repeat.set(1, 1);
  return t;
}
