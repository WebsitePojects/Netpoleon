/*
 * Runs inside the handbook page before it is printed. For every figure it measures the callout
 * labels as rendered, places them beside the screenshot, draws the leader lines, and then
 * checks the drawing: no two leaders cross, no leader runs through another callout's label,
 * highlight or number, no labels overlap, and no page overflows. Every violation is reported in
 * window.__layout.errors and the build refuses to produce a PDF while any remain.
 *
 * Why the leaders cannot cross: callouts on one side are ordered the same way as their anchor
 * points, and every leader is two straight pieces — one from the anchor straight out to the
 * screenshot edge, one across the gap to its label. Pieces that start and end in the same order
 * on two parallel lines never intersect. The check below proves it for each figure anyway.
 */
(() => {
  const GAP = 24; // the strip between screenshot and labels that leaders cross
  const LABEL_GAP = 8; // space between neighbouring labels
  const BADGE_R = 7.5;
  const errors = [];

  function place(items, start, end) {
    // items: {ideal, size}; returns starts, in order, packed without overlap inside [start, end].
    const total = items.reduce((sum, item) => sum + item.size, 0) + LABEL_GAP * (items.length - 1);
    if (total > end - start + 0.5) return null;
    const pos = [];
    let cursor = start;
    for (const item of items) {
      const at = Math.max(item.ideal - item.size / 2, cursor);
      pos.push(at);
      cursor = at + item.size + LABEL_GAP;
    }
    let limit = end;
    for (let i = items.length - 1; i >= 0; i -= 1) {
      pos[i] = Math.min(pos[i], limit - items[i].size);
      limit = pos[i] - LABEL_GAP;
    }
    return pos;
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function segIntersects(a, b, c, d) {
    const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    const d1 = cross(c, d, a);
    const d2 = cross(c, d, b);
    const d3 = cross(a, b, c);
    const d4 = cross(a, b, d);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
      return true;
    }
    return false;
  }

  function segHitsRect(a, b, r) {
    const inside = (p) => p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;
    if (inside(a) || inside(b)) return true;
    const corners = [
      { x: r.x, y: r.y },
      { x: r.x + r.w, y: r.y },
      { x: r.x + r.w, y: r.y + r.h },
      { x: r.x, y: r.y + r.h },
    ];
    return corners.some((c, i) => segIntersects(a, b, c, corners[(i + 1) % 4]));
  }

  function segNearPoint(a, b, p, radius) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0, 1);
    const x = a.x + t * dx - p.x;
    const y = a.y + t * dy - p.y;
    return Math.hypot(x, y) < radius;
  }

  const rectsOverlap = (a, b) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const inflate = (r, by) => ({ x: r.x - by, y: r.y - by, w: r.w + 2 * by, h: r.h + 2 * by });

  function layoutFigure(fig) {
    const id = fig.dataset.id;
    const mode = fig.dataset.mode;
    const stage = fig.querySelector('.fig-stage');
    const img = stage.querySelector('img.shot');
    const W = stage.clientWidth;
    const cw = Number(fig.dataset.cw);
    const ch = Number(fig.dataset.ch);
    const anchors = JSON.parse(fig.dataset.anchors);
    const labels = [...stage.querySelectorAll('.note')];
    const notes = labels.map((el, i) => ({
      el,
      i,
      side: el.dataset.side || '',
      at: el.dataset.at || '',
      a: anchors[i],
    }));

    let imgW;
    let imgLeft;
    let scale;
    let imgTop;
    let stageH;
    const placed = [];

    if (mode === 'lr') {
      imgW = Math.min(Number(fig.dataset.display) || 400, cw);
      scale = imgW / cw;
      imgLeft = (W - imgW) / 2;
      const labelW = imgLeft - GAP;
      const imgH = ch * scale;
      for (const n of notes) {
        n.side = n.side || (n.a.x + n.a.width / 2 < cw / 2 ? 'left' : 'right');
        n.el.style.width = `${labelW}px`;
      }
      for (const n of notes) n.size = n.el.offsetHeight;
      // Labels may run past the screenshot's height; the stage grows to fit them.
      let needed = imgH;
      for (const side of ['left', 'right']) {
        const group = notes.filter((n) => n.side === side);
        const total =
          group.reduce((s, n) => s + n.size, 0) + LABEL_GAP * Math.max(0, group.length - 1);
        needed = Math.max(needed, total);
      }
      imgTop = (needed - imgH) / 2;
      stageH = needed;
      for (const side of ['left', 'right']) {
        const group = notes
          .filter((n) => n.side === side)
          .map((n) => {
            const a = n.a;
            const edge = n.at || side;
            const px =
              imgLeft +
              (edge === 'left' ? a.x : edge === 'right' ? a.x + a.width : a.x + a.width / 2) *
                scale;
            const py =
              imgTop +
              (edge === 'top' ? a.y : edge === 'bottom' ? a.y + a.height : a.y + a.height / 2) *
                scale;
            return { ...n, px, py, ideal: py };
          })
          .sort((p, q) => p.py - q.py || p.px - q.px);
        const pos = place(group, 0, stageH);
        if (!pos) {
          errors.push(`${id}: ${side} labels do not fit`);
          continue;
        }
        group.forEach((n, k) => {
          const x = side === 'left' ? 0 : W - labelW;
          const y = pos[k];
          const label = { x, y, w: labelW, h: n.size };
          const edgeX = side === 'left' ? imgLeft : imgLeft + imgW;
          const portX = side === 'left' ? labelW : W - labelW;
          const portY = clamp(n.py, y + 9, y + n.size - 9);
          placed.push({
            ...n,
            label,
            segs: [
              [
                { x: n.px, y: n.py },
                { x: edgeX, y: n.py },
              ],
              [
                { x: edgeX, y: n.py },
                { x: portX, y: portY },
              ],
            ],
          });
        });
      }
    } else {
      imgW = Math.min(Number(fig.dataset.display) || W, W);
      scale = imgW / cw;
      imgLeft = (W - imgW) / 2;
      const imgH = ch * scale;
      for (const n of notes) {
        n.side = n.side || (n.a.y + n.a.height / 2 < ch / 2 ? 'top' : 'bottom');
      }
      const bands = {};
      for (const side of ['top', 'bottom']) {
        const group = notes.filter((n) => n.side === side);
        const lw = group.length
          ? Math.min(190, (W - LABEL_GAP * (group.length - 1)) / group.length)
          : 0;
        for (const n of group) n.el.style.width = `${lw}px`;
        bands[side] = {
          group,
          lw,
          h: group.length ? Math.max(...group.map((n) => n.el.offsetHeight)) : 0,
        };
      }
      const topH = bands.top.h ? bands.top.h + GAP : 0;
      imgTop = topH;
      stageH = topH + imgH + (bands.bottom.h ? GAP + bands.bottom.h : 0);
      for (const side of ['top', 'bottom']) {
        const { group, lw } = bands[side];
        const items = group
          .map((n) => {
            const a = n.a;
            const edge = n.at || side;
            const px =
              imgLeft +
              (edge === 'left' ? a.x : edge === 'right' ? a.x + a.width : a.x + a.width / 2) *
                scale;
            const py =
              imgTop +
              (edge === 'top' ? a.y : edge === 'bottom' ? a.y + a.height : a.y + a.height / 2) *
                scale;
            return { ...n, px, py, ideal: px, size: lw, h: n.el.offsetHeight };
          })
          .sort((p, q) => p.px - q.px || p.py - q.py);
        const pos = place(items, 0, W);
        if (!pos) {
          errors.push(`${id}: ${side} labels do not fit`);
          continue;
        }
        items.forEach((n, k) => {
          const x = pos[k];
          const y = side === 'top' ? imgTop - GAP - n.h : imgTop + imgH + GAP;
          const label = { x, y, w: lw, h: n.h };
          const edgeY = side === 'top' ? imgTop : imgTop + imgH;
          const portY = side === 'top' ? imgTop - GAP : imgTop + imgH + GAP;
          const portX = clamp(n.px, x + 12, x + lw - 12);
          placed.push({
            ...n,
            label,
            segs: [
              [
                { x: n.px, y: n.py },
                { x: n.px, y: edgeY },
              ],
              [
                { x: n.px, y: edgeY },
                { x: portX, y: portY },
              ],
            ],
          });
        });
      }
    }

    stage.style.height = `${stageH}px`;
    img.style.left = `${imgLeft}px`;
    img.style.top = `${imgTop}px`;
    img.style.width = `${imgW}px`;

    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'leaders');
    svg.setAttribute('width', W);
    svg.setAttribute('height', stageH);
    const add = (tag, attrs) => {
      const el = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      svg.appendChild(el);
      return el;
    };

    // The number sits just outside the element, on its own leader, so it never hides content.
    const OUT = BADGE_R + 4;
    for (const p of placed) {
      const dir = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] }[p.side];
      // …but never outside the screenshot, where other leaders bend towards their labels.
      const imgH = ch * scale;
      p.bx = clamp(p.px + dir[0] * OUT, imgLeft + BADGE_R + 1, imgLeft + imgW - BADGE_R - 1);
      p.by = clamp(p.py + dir[1] * OUT, imgTop + BADGE_R + 1, imgTop + imgH - BADGE_R - 1);
    }
    for (const p of placed) {
      p.el.style.left = `${p.label.x}px`;
      p.el.style.top = `${p.label.y}px`;
      p.highlight = {
        x: imgLeft + p.a.x * scale - 3,
        y: imgTop + p.a.y * scale - 3,
        w: p.a.width * scale + 6,
        h: p.a.height * scale + 6,
      };
      add('rect', {
        x: p.highlight.x,
        y: p.highlight.y,
        width: p.highlight.w,
        height: p.highlight.h,
        rx: 5,
        class: 'hl',
      });
    }
    for (const p of placed) {
      const d = `M${p.segs[0][0].x},${p.segs[0][0].y} L${p.segs[0][1].x},${p.segs[0][1].y} L${p.segs[1][1].x},${p.segs[1][1].y}`;
      add('path', { d, class: 'halo' });
      add('path', { d, class: 'lead' });
    }
    for (const p of placed) {
      const end = p.segs[1][1];
      add('circle', { cx: end.x, cy: end.y, r: 2.6, class: 'port' });
      add('circle', { cx: p.px, cy: p.py, r: 2.4, class: 'port' });
      add('circle', { cx: p.bx, cy: p.by, r: BADGE_R, class: 'badge' });
      const t = add('text', { x: p.bx, y: p.by + 3.4, class: 'badge-n' });
      t.textContent = String(p.i + 1);
    }
    stage.appendChild(svg);

    // ── Verification ──────────────────────────────────────────────────────────────────────
    const name = (p) => `note ${p.i + 1}`;
    for (const p of placed) {
      if (
        p.label.x < -0.5 ||
        p.label.x + p.label.w > W + 0.5 ||
        p.label.y < -0.5 ||
        p.label.y + p.label.h > stageH + 0.5
      ) {
        errors.push(`${id}: ${name(p)} label leaves the figure`);
      }
      const imgRect = { x: imgLeft, y: imgTop, w: imgW, h: ch * scale };
      if (rectsOverlap(inflate(p.label, -1), imgRect))
        errors.push(`${id}: ${name(p)} label covers the screenshot`);
    }
    for (const p of placed) {
      for (const q of placed) {
        if (p === q) continue;
        if (p.i < q.i && rectsOverlap(p.label, q.label))
          errors.push(`${id}: labels ${p.i + 1} and ${q.i + 1} overlap`);
        if (p.i < q.i && Math.hypot(p.bx - q.bx, p.by - q.by) < BADGE_R * 2 + 1) {
          errors.push(`${id}: numbers ${p.i + 1} and ${q.i + 1} overlap`);
        }
        for (const [a, b] of p.segs) {
          for (const [c, d] of q.segs) {
            if (p.i < q.i && segIntersects(a, b, c, d))
              errors.push(`${id}: leaders ${p.i + 1} and ${q.i + 1} cross`);
          }
          if (segHitsRect(a, b, inflate(q.label, 1)))
            errors.push(`${id}: leader ${p.i + 1} runs through label ${q.i + 1}`);
          if (segNearPoint(a, b, { x: q.bx, y: q.by }, BADGE_R + 1))
            errors.push(`${id}: leader ${p.i + 1} runs over number ${q.i + 1}`);
        }
        const badge = { x: p.bx - BADGE_R, y: p.by - BADGE_R, w: BADGE_R * 2, h: BADGE_R * 2 };
        if (rectsOverlap(badge, q.label))
          errors.push(`${id}: number ${p.i + 1} covers label ${q.i + 1}`);
        if (rectsOverlap(badge, inflate(q.highlight, -1)))
          errors.push(`${id}: number ${p.i + 1} covers highlight ${q.i + 1}`);
        // Leaving its own element, a leader must not cut through another highlighted element,
        // unless one contains the other (a group around a button, say).
        const contains = (r, s) =>
          r.x <= s.x && r.y <= s.y && r.x + r.w >= s.x + s.w && r.y + r.h >= s.y + s.h;
        if (!contains(q.highlight, p.highlight) && !contains(p.highlight, q.highlight)) {
          const [a, b] = p.segs[0];
          if (segHitsRect(a, b, inflate(q.highlight, -1)))
            errors.push(`${id}: leader ${p.i + 1} crosses highlight ${q.i + 1}`);
        }
      }
    }
    return placed.length;
  }

  async function run() {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((im) =>
        im.complete
          ? null
          : new Promise((r) => {
              im.onload = r;
              im.onerror = r;
            }),
      ),
    );
    let callouts = 0;
    for (const fig of document.querySelectorAll('figure.fig')) callouts += layoutFigure(fig);
    for (const body of document.querySelectorAll('.page-body')) {
      if (body.scrollHeight > body.clientHeight + 1) {
        errors.push(
          `page ${body.closest('.page').dataset.page}: content overflows by ${body.scrollHeight - body.clientHeight}px`,
        );
      }
    }
    window.__layout = {
      errors: [...new Set(errors)],
      figures: document.querySelectorAll('figure.fig').length,
      callouts,
    };
  }
  run();
})();
