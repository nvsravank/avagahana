// stage.js — the drawing surface: pan, zoom, fit, semantic-zoom level and
// pointer input. Knows nothing about mind maps. Sizes come from the mount root,
// never the window. Wheel and drag updates are applied once per animation frame.
import { MIN_LABEL_PX } from './paint.js';

export const MIN_ZOOM = 0.4;
const MAX_ZOOM = 4;
// level-of-detail key: changes only when some label size crosses the bar threshold
const lodKey = (k, sizes) => sizes.map((size) => (size * k >= MIN_LABEL_PX ? 1 : Math.round(k * 20) / 20)).join(',');

// v: viewer internals. handlers: {onLod(), onClick(target, event), onBackground()}
export function createStage(v, handlers) {
  const { S, $ } = v;
  const svg = $.canvas;
  let frame = 0;
  let pendingZoom = null;   // {factor, cx, cy} accumulated between frames

  // drawn: the drawing was just made at this zoom, so no redraw for its level of detail
  function applyView(drawn = false) {
    const vw = S.view;
    $.viewport.setAttribute('transform', `translate(${vw.x},${vw.y}) scale(${vw.k})`);
    const key = lodKey(vw.k, v.diagram().detailSizes || [20, 16, 14]);
    if (drawn) S.lodKey = key;
    if (key !== S.lodKey) {
      const first = S.lodKey == null;
      S.lodKey = key;
      if (!first && S.layout && S.mode !== 'list') handlers.onLod();
    }
  }
  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (pendingZoom) {
        const z = pendingZoom;
        pendingZoom = null;
        zoomAt(z.factor, z.cx, z.cy);
      } else applyView();
    });
  }

  function zoomToRead(n) {
    const p = S.layout?.pos.get(n);
    if (!p) return;
    const { w, h } = v.size();
    const k = Math.max(S.view.k, (MIN_LABEL_PX / v.nodeGeom(n).type.size) * 1.15);
    S.userMoved = true;
    S.view = { k, x: w / 2 - p.x * k, y: h / 2 - p.y * k };
    applyView();
  }
  // quiet: set the camera only; the caller draws and applies it
  function fitView(levelsOnly, quiet = false) {
    if (!S.layout) return;
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    for (const [n, p] of S.layout.pos) {
      if (levelsOnly && v.relDepth(n) > 2) continue;
      x0 = Math.min(x0, p.x - p.w / 2); x1 = Math.max(x1, p.x + p.w / 2);
      y0 = Math.min(y0, p.y - p.h / 2); y1 = Math.max(y1, p.y + p.h / 2);
    }
    S.lastFit = levelsOnly ? 'levels' : 'all';
    S.userMoved = false;
    const { w: W, h: H } = v.size();
    if (W < 120 || H < 120) return;   // not laid out yet; the resize observer refits
    const pad = S.thumb ? 8 : Math.min(70, W / 10);
    const k = Math.min(1.4, (W - pad * 2) / Math.max(1, x1 - x0), (H - pad * 2) / Math.max(1, y1 - y0));
    if (k < MIN_ZOOM && !S.thumb) {   // a thumbnail fits whatever it takes
      // too big to fit at a readable size: open on the centre at minimum zoom (the
      // drawing's middle when the root is not drawn, as a box diagram's top is not)
      const r = S.layout.pos.get(v.viewRoot()) || { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
      S.view = { k: MIN_ZOOM, x: W / 2 - r.x * MIN_ZOOM, y: H / 2 - r.y * MIN_ZOOM };
    } else S.view = { k, x: W / 2 - ((x0 + x1) / 2) * k, y: H / 2 - ((y0 + y1) / 2) * k };
    if (!quiet) applyView();
  }
  function zoomAt(factor, cx, cy) {
    S.userMoved = true;
    handlers.onUserMove?.();
    const vw = S.view;
    const k = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, vw.k * factor));
    const f = k / vw.k;
    S.view = { k, x: cx - (cx - vw.x) * f, y: cy - (cy - vw.y) * f };
    applyView();
  }
  function zoomCentre(factor) { const { w, h } = v.size(); zoomAt(factor, w / 2, h / 2); }
  function centerOn(n) {
    const p = S.layout?.pos.get(n);
    if (!p) return;
    const { w, h } = v.size();
    S.view.x = w / 2 - p.x * S.view.k;
    S.view.y = h / 2 - p.y * S.view.k;
    applyView();
  }

  const local = (e) => { const r = svg.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

  // scroll always zooms around the pointer; drag the canvas to pan
  function onWheel(e) {
    e.preventDefault();
    handlers.onUserMove?.();
    const rate = e.ctrlKey ? 0.01 : e.deltaMode !== 0 ? 0.05 : 0.002;
    const [cx, cy] = local(e);
    const factor = Math.exp(-e.deltaY * rate);
    pendingZoom = pendingZoom ? { factor: pendingZoom.factor * factor, cx, cy } : { factor, cx, cy };
    schedule();
  }
  let drag = null;
  function onDown(e) {
    if (e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, vx: S.view.x, vy: S.view.y, moved: false, id: e.pointerId };
  }
  function onMove(e) {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) > 4) {
      drag.moved = true;
      svg.classList.add('is-panning');
      svg.setPointerCapture(drag.id);
    }
    if (drag.moved) { S.userMoved = true; handlers.onUserMove?.(); S.view.x = drag.vx + dx; S.view.y = drag.vy + dy; schedule(); }
  }
  function onUp(e) {
    const d = drag;
    drag = null;
    svg.classList.remove('is-panning');
    if (!d || d.moved) return;
    handlers.onClick(e.target, e);
  }
  svg.addEventListener('wheel', onWheel, { passive: false });
  svg.addEventListener('pointerdown', onDown);
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerup', onUp);
  svg.addEventListener('pointercancel', () => { drag = null; svg.classList.remove('is-panning'); });

  return {
    applyView, fitView, zoomAt, zoomCentre, centerOn, zoomToRead,
    dragging: () => !!drag,
    destroy() { if (frame) cancelAnimationFrame(frame); },
  };
}
