/*
 * The Senate seating chart: a central circle with a fan of seating bars
 * (one per clue), based on Senate_Seating_Idea.png.
 *
 * Coordinates are SVG user units centered on the circle (y points down,
 * angles go clockwise from +x). The chart's container is moved and scaled
 * so that one unit equals `s` screen pixels.
 */
window.SenateChart = (function () {
  'use strict';

  // Proportions measured from the sketch.
  const R_HUB = 150;        // center circle
  const R_IN = 250;         // inner end of the seating bars
  const R_OUT = 700;        // outer end of the seating bars
  const FAN_START = 191.4;  // leading edge of the first (top-left) bar, in degrees
  const FAN_SPAN = 202.8;   // first bar's leading edge to last bar's trailing edge
  const BAR_GAP_RATIO = 13 / 8; // bar width : gap width

  const NS = 'http://www.w3.org/2000/svg';
  const rad = d => (d * Math.PI) / 180;

  /** Bar width, step between bars and each bar's center angle for `n` bars. */
  function fan(n) {
    const gap = FAN_SPAN / (n * BAR_GAP_RATIO + (n - 1));
    const width = gap * BAR_GAP_RATIO;
    const step = width + gap;
    const centers = Array.from({ length: n }, (_, k) => FAN_START - width / 2 - k * step);
    return { width, step, centers };
  }

  /** A bar pointing along +x, `width` degrees wide. */
  function barPath(width) {
    const h = rad(width / 2);
    const p = (r, a) => `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
    return `M ${p(R_IN, -h)} L ${p(R_OUT, -h)} A ${R_OUT} ${R_OUT} 0 0 1 ${p(R_OUT, h)} ` +
           `L ${p(R_IN, h)} A ${R_IN} ${R_IN} 0 0 0 ${p(R_IN, -h)} Z`;
  }

  /**
   * Draw `n` bars into the <g> and return the bar elements (index 0 = clue 1).
   * With `append`, existing bars are kept (used while one round's bars hand off
   * to the next round's during a spin).
   */
  function build(group, n, append) {
    const { width, centers } = fan(n);
    if (!append) group.innerHTML = '';
    const d = barPath(width);
    return centers.map((angle, i) => {
      const seat = document.createElementNS(NS, 'g');
      seat.setAttribute('class', 'seat');
      seat.setAttribute('transform', `rotate(${angle.toFixed(3)})`);
      seat.style.setProperty('--i', i);
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('class', 'bar');
      path.setAttribute('d', d);
      seat.appendChild(path);
      group.appendChild(seat);
      return seat;
    });
  }

  /** Rotation (deg) that brings bar `index` to point straight left (180°). */
  function rotationFor(index, n) {
    return 180 - fan(n).centers[index];
  }

  /** Each bar's center angle (deg, before the fan's rotation) for `n` bars. */
  function centers(n) {
    return fan(n).centers;
  }

  /**
   * Where the chart sits for a screen.
   *  title: whole chart centered inside `slot` (a DOMRect).
   *  play:  circle on the right, the active bar pointing left across the
   *         middle of the screen, starting just right of the guess panel.
   * Returns { cx, cy, s } in pixels (plus minCardW in play mode).
   */
  function layout(mode, W, H, opts) {
    if (mode === 'title') {
      const slot = opts.slot;
      const top = Math.min(-R_HUB, -R_OUT * Math.sin(rad(FAN_START - 180)));
      const boxW = 2 * R_OUT + 40, boxH = R_OUT - top + 20;
      const s = Math.max(0.05, Math.min(slot.width / boxW, slot.height / boxH));
      return {
        cx: slot.left + slot.width / 2,
        cy: slot.top + (slot.height - boxH * s) / 2 + (-top + 10) * s,
        s,
      };
    }

    const wide = opts.wide;
    let s, cx;
    if (wide) {
      // Bars sized close to a clue card: about a third of the screen width, capped
      // so the whole circle fits to the right and the chart fits vertically. Any
      // spare width is split evenly on either side of the chart.
      const xOuter = opts.panelRight + 24;
      const right = W - 24;
      s = Math.min((0.34 * W) / (R_OUT - R_IN), (right - xOuter) / (R_OUT + R_HUB), (0.55 * H) / (2 * R_HUB));
      const spare = Math.max(0, right - R_HUB * s - (xOuter + R_OUT * s));
      cx = xOuter + R_OUT * s + spare / 2;
    } else {
      // Phones: circle at the right edge (it may run slightly off), bars toward the left.
      s = 0.88 * (W - 10) / (R_OUT + 0.55 * R_HUB);
      cx = W - 0.55 * R_HUB * s;
    }
    const cy = wide
      ? opts.top + (H - opts.top) * 0.58
      : opts.top + (H - opts.top - opts.panelHeight) * 0.8;
    return { cx, cy, s, minCardW: wide ? 280 : 210 };
  }

  /**
   * Horizontal span for a clue card of height `h` (px) so it fits inside the
   * active bar (which points straight left from the circle).
   */
  function fitCard(L, h, n) {
    const t = Math.tan(rad(fan(n).width / 2));
    const left = L.cx - (R_OUT - 14) * L.s;
    const rMin = Math.max(R_IN + 12, (h / 2 + 6) / (t * L.s));
    const width = Math.max(L.minCardW, (R_OUT - 14 - rMin) * L.s);
    return { left, width };
  }

  /** Half the active bar's thickness (px) at screen x. */
  function barHalfAt(L, x, n) {
    return Math.tan(rad(fan(n).width / 2)) * (L.cx - x);
  }

  /**
   * clip-path for a clue card under the active bar, in the card's own pixels.
   * `progress` 0 = the bar's outline (a card larger than its bar stays hidden
   * under it); 1 = fully open. Both shapes have the same 8 points, so CSS
   * animates between them as a wipe from the bar's outer end toward the circle,
   * in step with the bar's own wipe.
   */
  function barClip(L, card, n, progress) {
    const { left, width: w, height: h } = card;
    const mid = h / 2, m = 30;
    const a = x => barHalfAt(L, left + x, n);
    const pts = progress
      ? (() => {
          const xe = Math.max(L.cx - R_IN * L.s - left, w + m);
          return [[-m, -m], [xe, -m], [xe, mid - a(xe)], [xe, mid - a(xe)],
                  [xe, mid + a(xe)], [xe, mid + a(xe)], [xe, h + m], [-m, h + m]];
        })()
      : [[0, -m], [0, -m], [0, mid - a(0)], [w, mid - a(w)],
         [w, mid + a(w)], [0, mid + a(0)], [0, h + m], [0, h + m]];
    return `polygon(${pts.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(', ')})`;
  }

  return { build, rotationFor, centers, layout, fitCard, barClip, barHalfAt, R_HUB };
})();
