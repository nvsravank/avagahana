// player.js — plays a sequence (diagrams/sequence) step by step: over the box diagram
// view it is linked to (`## Plays over`), or as its own lifelines.
//
// Over a view: every box and arrow goes grey (the theme's roles.idle / idleLine); a
// step brings its boxes back in colour and draws its messages over the view's own
// arrows (a reply runs back along its call's arrow) in the call or reply colour; steps
// played stay in colour at 60%. The view's own arrow labels give way: an arrow the
// sequence uses is laid out with room for two lines (the layout's playLabel), the
// latest call along it ("3 place order") and under it the latest return ("3 ok", with the return mark),
// each shown once the play reaches it. A dot runs from sender to
// receiver; the camera frames the step's boxes. A reader's pan or zoom pauses the play;
// play or a step goes on and the camera follows again. Closed boxes a step needs open
// (and stay open). As lifelines the scene marks the rows (diagrams/sequence/scene.js)
// and the camera follows the row: it starts close and pulls back only when a step's line
// would not fit (limits.js), and moves only when the step would leave the view. A zoom the
// reader chose stays, until the fit button or the next play.
//
// The step bar: a timeline (a tick per step, a bracket per block: loop, alt, opt, par),
// back, play / pause, forward, stop (closes), the count, and a switch between the view
// and the lifelines. The side panel: the step's blocks, each message (who calls or
// replies to whom, its note, the note and icons of the arrow it runs on), its notes.
//
// v: the viewer's internals (S, $, root, ...); h: hooks into the viewer (viewer.js),
// with stepSeconds() and setStepSeconds(s): the time a step shows while playing (the
// speed control on the step bar; options.sequenceStepSeconds is where it starts).
import { uiSvg, putNumber, RETURN_W } from './chrome.js';
import { svgEl } from './paint.js';
import { playState, openCalls } from './diagrams/sequence/scene.js';
import { stepZoom, stepSpan } from './diagrams/sequence/limits.js';
import { CAPTION } from './diagrams/sequence/parse.js';
import { measure } from './measure.js';

const DOT_MS = 650;     // the dot's run
const CAM_MS = 480;     // the camera's move
const WAIT_W = 6;       // the bar on a waiting box's edge
const LINE = 20;        // between the centres of an arrow's two label lines (the layout's two lines)

export function createPlayer(v, h) {
  const { S, $ } = v;
  const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let timer = 0;
  let camAnim = 0;
  let camTimer = 0;
  let camRun = 0;
  let follow = true;   // false after the reader moved the camera, until the next step or play

  // S.play: {seq, step, playing}; seq: the sequence diagram's anchor (null: the first)
  const seqMap = () => (S.play ? h.mapFor(S.play.seq) : null);
  const seq = () => seqMap()?.sequence || null;
  const onMap = () => !!S.play && S.map !== seqMap();

  // ---------- open, step, close ----------
  function open(key, { step = 0, play = true } = {}) {
    const m = h.mapFor(key);
    if (!m?.sequence?.steps.length) return;
    stopTimer();
    S.play = { seq: key, step: Math.max(0, Math.min(step, m.sequence.steps.length - 1)), playing: false };
    v.root.classList.add('is-playing');
    follow = true;
    S.readerZoom = false;
    buildTimeline();
    $.stepBar.hidden = false;
    $.seqPanel.hidden = false;
    if (onMap()) h.relayout();   // room for the messages' labels: the boxes glide apart
    show(true);
    h.played?.(key);
    if (play) start();
    h.changed();
  }
  // redraw: false when the caller draws next (another view or diagram)
  function close(redraw = true) {
    if (!S.play) return;
    stopTimer();
    camStop();
    const was = onMap();
    S.play = null;
    v.root.classList.remove('is-playing');
    $.stepBar.hidden = true;
    $.seqPanel.hidden = true;
    $.play.replaceChildren();
    $.playDots.replaceChildren();
    for (const g of marked()) g.classList.remove('is-idle', 'is-past', 'is-now', 'is-waiting');
    if (redraw) { if (was) h.relayout(); else h.redraw(); }   // the view's own labels come back
    h.changed();
  }
  function go(step) {
    if (!S.play) return;
    const n = seq().steps.length;
    S.play.step = Math.max(0, Math.min(step, n - 1));
    follow = true;
    show(true);
    h.changed();
  }
  function start() {
    if (!S.play) return;
    if (S.play.step >= seq().steps.length - 1) go(0);
    S.play.playing = true;
    follow = true;
    timer = setInterval(() => {
      if (!S.play || S.play.step >= seq().steps.length - 1) { pause(); return; }
      go(S.play.step + 1);
    }, h.stepSeconds() * 1000);
    controls();
    h.changed();
  }
  function pause() {
    stopTimer();
    if (S.play) S.play.playing = false;
    controls();
  }
  function stopTimer() { clearInterval(timer); timer = 0; }
  // the reader moved the camera: the play waits for them
  function userMoved() {
    if (!S.play) return;
    follow = false;
    camStop();
    if (S.play.playing) pause();
  }

  // ---------- one step ----------
  function show(animate) {
    if (!S.play) return;
    const steps = seq().steps;
    const step = steps[S.play.step];
    if (onMap()) {
      // what the step needs drawn: closed boxes round its participants open (and stay open)
      const need = new Set(step.msgs.flatMap((m) => [m.from, m.to]));
      if (h.reveal([...need])) { h.redraw(); }
      decorate(animate);
    } else h.redraw();   // lifelines: the scene marks the rows
    controls();
    panel();
    camera(animate);
  }

  // every drawn box and frame, for the grey / past / now classes
  const marked = () => [...$.frames.children, ...$.nodes.children];

  // After every draw (a redraw replaces the drawing): the classes and the overlay again.
  // dots: run the step's dots (a new step), not on a redraw for the zoom level
  function decorate(dots = false) {
    $.play.replaceChildren();
    if (!S.play || !onMap()) { $.playDots.replaceChildren(); return; }
    const st = playState(seq(), S.play.step);
    for (const g of marked()) {
      g.classList.remove('is-idle', 'is-past', 'is-now');
      g.classList.add(st.who.get(g.dataset.id) || 'is-idle');
    }
    // who is waiting on an unanswered call (WO-52): a bar on the box's left edge
    const { waiting } = openCalls(seq(), S.play.step);
    for (const g of marked()) g.classList.toggle('is-waiting', waiting.has(g.dataset.id));
    for (const id of waiting) {
      const p = h.posOf(id);
      if (p) svgEl('rect', { class: 'mmv-wait', x: p.x - p.w / 2, y: p.y - p.h / 2 + 3, width: Math.max(WAIT_W, 4 / S.view.k), height: p.h - 6, 'data-for': id }, $.play);
    }
    // the messages played so far, then the step's: over the view's arrows; each arrow's
    // label lines hold the latest call and the latest return along it
    const steps = seq().steps;
    const drawn = [];
    const lines = new Map();   // arrow key -> {fwd, back}: {m, state}
    const selfs = new Map();   // box id -> its latest message to itself: {m, state, now}
    const lastStep = Math.min(S.play.step, steps.length - 1);
    for (let k = 0; k <= lastStep; k++) {
      const s = steps[k];
      if (s.repeat && k !== lastStep) continue;
      for (const m of s.msgs) {
        const now = k === lastStep;
        // to itself: drawn last, the latest per box, clear of the arrows and their labels
        if (m.self) { selfs.set(m.from, { m, state: now ? 'is-now' : 'is-past', now: now && !s.repeat }); continue; }
        const d = drawMessage(m, now ? 'is-now' : 'is-past', now && !s.repeat);
        if (!d) continue;
        drawn.push(d);
        if (!d.key) continue;
        if (!lines.has(d.key)) lines.set(d.key, {});
        lines.get(d.key)[d.forward ? 'fwd' : 'back'] = { m, state: now ? 'is-now' : 'is-past' };
      }
    }
    const ways = arrowWays();
    for (const [key, at] of lines) drawLines(key, at, ways.get(key));
    for (const x of selfs.values()) { const d = drawSelf(x.m, x.state); if (d && x.now) drawn.push({ ...d, now: true }); }
    if (dots) {
      $.playDots.replaceChildren();
      if (!steps[lastStep].repeat && !reduceMotion()) for (const d of drawn) if (d.now) runDot(d);
    }
  }

  // which ways the whole sequence runs along each arrow: Map(key -> {fwd, back}), so a
  // call keeps the upper line while its return is still to come
  function arrowWays() {
    const out = new Map();
    for (const s of seq().steps) {
      for (const m of s.msgs) {
        if (m.self) continue;
        const a = h.arrowFor(m.from, m.to, m.connectionId);
        if (!a) continue;
        if (!out.has(a.key)) out.set(a.key, {});
        out.get(a.key)[a.forward ? 'fwd' : 'back'] = true;
      }
    }
    return out;
  }

  // What the layout makes room for on a relation of the view (its playLabel): the
  // longest message each way along it, relative to the relation's own direction.
  let labelCache = null;
  function labelOf(r) {
    if (!S.play) return null;
    if (labelCache?.seq !== seq() || labelCache.rels !== S.map.relations) {
      const by = new Map();
      for (const s of seq().steps) {
        if (s.repeat) continue;
        for (const m of s.msgs) {
          if (m.self) continue;
          const rel = h.relationFor(m.from, m.to, m.connectionId);
          if (!rel) continue;
          if (!by.has(rel)) by.set(rel, { fwd: null, back: null });
          const way = rel.from === m.from ? 'fwd' : 'back';
          const text = m.label || ' ';
          if ((by.get(rel)[way]?.length || 0) < text.length) by.get(rel)[way] = text;
        }
      }
      labelCache = { seq: seq(), rels: S.map.relations, by };
    }
    return labelCache.by.get(r) || null;
  }

  // one message over the view: its arrow (its number and label go on its label lines,
  // drawLines; a message to itself is drawSelf's)
  function drawMessage(m, state, now) {
    const tint = m.reply ? 'reply' : 'call';
    const g = svgEl('g', { class: `mmv-play-msg mmv-seq-${tint} ${state}` }, $.play);
    const a = h.arrowFor(m.from, m.to, m.connectionId);
    if (!a) return null;
    const paths = (a.paths || [a.d]).map((d) => svgEl('path', { class: `mmv-play-path${m.line === 'dotted' ? ' is-dotted' : ''}`, d }, g));
    const path = paths[0];
    // the arrow head where the message goes: the end of a call along its arrow, the
    // start of a reply that runs back along it
    for (const p of paths) p.setAttribute(a.forward ? 'marker-end' : 'marker-start', h.marker(m.head === 'cross' ? 'cross' : 'arrow', tint));
    return { g, path, len: path.getTotalLength(), forward: a.forward, key: a.key, now };
  }
  // a message's badge: its number, and room for the return mark (chrome.js) on a return
  const badgeW = (m) => Math.max(18, String(m.num).length * 6.5 + 8 + (m.back ? RETURN_W : 0));   // paint.js badge
  // An arrow's label where the layout made room for it, on a card: the call on the upper
  // line, its return on the lower (one line when the sequence runs only one way).
  function drawLines(key, at, ways = {}) {
    const place = h.labelAt(key);
    if (!place) return;
    const both = ways.fwd && ways.back;
    const font = v.font();
    const parts = [['fwd', both ? -LINE / 2 : 0], ['back', both ? LINE / 2 : 0]].filter(([w]) => at[w]).map(([w, dy]) => {
      const { m, state } = at[w];
      const num = String(m.num);
      const bw = badgeW(m);
      const tw = m.label ? measure(m.label, 12, 600, false, font) : 0;
      return { m, state, num, bw, dy, w: bw + (tw ? tw + 5 : 0) };
    });
    const width = Math.max(...parts.map((p) => p.w));
    const x0 = place.x - width / 2;
    const card = svgEl('g', { class: 'mmv-play-lines' }, $.play);
    svgEl('rect', { class: 'mmv-play-card', x: x0 - 5, y: place.y - (both ? LINE / 2 : 0) - 12, width: width + 10, height: (both ? LINE : 0) + 24, rx: 6 }, card);
    for (const p of parts) {
      const tint = p.m.reply ? 'reply' : 'call';
      const g = svgEl('g', { class: `mmv-play-line mmv-seq-${tint} ${p.state}` }, card);
      const y = place.y + p.dy;
      h.painter.badge({ x: x0 + p.bw / 2, y, text: p.num, back: !!p.m.back, reply: !!p.m.back || p.m.reply }, tint, g);
      if (p.m.label) label(g, x0 + p.bw + 5, y + 4, p.m.label, 'start');
    }
  }
  // A message to itself: a loop round one of its box's top corners (the circle's centre
  // on it), the one with less in the way
  // (arrows, their label cards, other boxes), its number and label on a card beside it.
  const R = 13;
  function drawSelf(m, state) {
    const p = h.posOf(m.from);
    if (!p) return null;
    const tint = m.reply ? 'reply' : 'call';
    const num = String(m.num);
    const bw = badgeW(m);
    const tw = m.label ? measure(m.label, 12, 600, false, v.font()) : 0;
    const cardW = bw + (tw ? tw + 5 : 0) + 10;
    const o = obstacles(p);
    let best = null;
    for (const [sx, sy] of [[1, -1], [-1, -1]]) {   // a top corner: right, else left
      // the circle's centre on the box's corner: three quarters of it outside
      const X = p.x + (sx * p.w) / 2;
      const Y = p.y + (sy * p.h) / 2;
      // the card beside the loop, past the corner, level with the loop's top
      const cy = Y + sy * R;
      const cx0 = sx > 0 ? X + R + 6 : X - R - 6 - cardW;
      const boxes = [{ l: X - R, t: Y - R, r: X + R, b: Y + R }, { l: cx0, t: cy - 12, r: cx0 + cardW, b: cy + 12 }];
      const cost = boxes.reduce((t, b) => t + o.cost(b), 0) + (sx < 0 ? 0.25 : 0);   // ties: the right
      if (!best || cost < best.cost) best = { cost, sx, sy, X, Y, cx0, cy };
    }
    const { sx, sy, X, Y, cx0, cy } = best;
    const g = svgEl('g', { class: `mmv-play-msg mmv-seq-${tint} ${state}` }, $.play);
    // out of the box's top edge, round the corner outside, into its side; the arc stops
    // 40° short and a straight step finishes it, so the head turns in with the curve
    const f = Math.PI / 2 - sx * (40 * Math.PI / 180);
    const P = [X + R * Math.cos(f), Y + R * Math.sin(f)];
    svgEl('path', { class: 'mmv-play-path', d: `M${X - sx * R},${Y} A${R},${R} 0 1 ${sx * sy < 0 ? 1 : 0} ${P[0]},${P[1]} L${X},${Y - sy * R}`, 'marker-end': h.marker('arrow', tint) }, g);
    const card = svgEl('g', { class: 'mmv-play-lines' }, $.play);
    svgEl('rect', { class: 'mmv-play-card', x: cx0, y: cy - 12, width: cardW, height: 24, rx: 6 }, card);
    const lg = svgEl('g', { class: `mmv-play-line mmv-seq-${tint} ${state}` }, card);
    h.painter.badge({ x: cx0 + 5 + bw / 2, y: cy, text: num, back: !!m.back, reply: false }, tint, lg);
    if (m.label) label(lg, cx0 + 5 + bw + 5, cy + 4, m.label, 'start');
    return { self: true, g, p };
  }
  // What a self-message's loop and card should keep clear of: the view's arrows (points
  // along them), the label cards drawn so far and the other boxes. -> {cost(box)}
  function obstacles(own) {
    const pts = [];
    for (const path of v.$.rels.querySelectorAll('.mmv-flow')) {
      const len = path.getTotalLength();
      for (let d = 0; d <= len; d += 6) { const q = path.getPointAtLength(d); pts.push([q.x, q.y]); }
    }
    const rects = [...$.play.querySelectorAll('.mmv-play-card')].map((e) => {
      const x = +e.getAttribute('x');
      const y = +e.getAttribute('y');
      return { l: x, t: y, r: x + +e.getAttribute('width'), b: y + +e.getAttribute('height') };
    });
    for (const q of S.layout.pos.values()) {
      if (q === own || q.frame) continue;
      rects.push({ l: q.x - q.w / 2, t: q.y - q.h / 2, r: q.x + q.w / 2, b: q.y + q.h / 2 });
    }
    const hit = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
    return {
      cost: (b) => pts.filter(([x, y]) => x > b.l && x < b.r && y > b.t && y < b.b).length + rects.filter((x) => hit(x, b)).length * 20,
    };
  }
  function label(g, x, y, text, anchor) {
    svgEl('text', { class: 'mmv-play-label', x, y, 'text-anchor': anchor, 'font-size': 12 }, g).textContent = text;
  }

  function runDot(d) {
    if (d.self) {
      d.g.classList.add('is-pulse');
      return;
    }
    const dot = svgEl('circle', { class: 'mmv-play-dot', r: 6 }, $.playDots);
    dot.classList.add(...d.g.classList);
    const t0 = performance.now();
    const tick = (now) => {
      if (!dot.isConnected) return;
      const k = Math.max(0, Math.min(1, (now - t0) / DOT_MS));
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      const p = d.path.getPointAtLength((d.forward ? e : 1 - e) * d.len);
      dot.setAttribute('cx', p.x);
      dot.setAttribute('cy', p.y);
      if (k < 1) requestAnimationFrame(tick); else dot.remove();
    };
    requestAnimationFrame(tick);
  }

  // ---------- camera ----------
  function camera(animate) {
    if (!follow || !S.layout) return;
    const steps = seq().steps;
    const { w, h: H } = v.size();
    const { top: under, right, bottom } = clearArea();
    const left = v.fitInset?.() || 0;   // a walkthrough's panel
    // as lifelines the names pinned along the top take room too
    const top = onMap() ? under : under + 34;
    const cw = w - right - left;
    const ch = Math.max(120, H - top - bottom);
    let to;
    if (onMap()) {
      const ids = steps[S.play.step].msgs.flatMap((m) => [m.from, m.to]);
      const ps = ids.map((id) => h.posOf(id)).filter(Boolean);
      if (!ps.length) return;
      const box = bounds(ps);
      const pad = Math.min(60, cw / 8);
      const fitAll = fitK(bounds([...S.layout.pos.values()]), cw, ch, 20);
      const want = fitK(box, cw, ch, pad);
      // no further in than needed, never past easy reading, never further out than all
      const k = Math.max(Math.min(want, 1.15), Math.min(fitAll, 1.15));
      to = { k, x: left + cw / 2 - ((box.x0 + box.x1) / 2) * k, y: top + ch / 2 - ((box.y0 + box.y1) / 2) * k };
    } else to = lifelinesView(steps, left, cw, top, ch);
    glideTo(to, animate && !reduceMotion());
  }
  // lifelines: the reader's zoom or the growing one; the view stays put while the step's
  // rows and lines are in it, else centres on them
  function lifelinesView(steps, left, cw, top, ch) {
    const L = S.layout;
    const pad = Math.min(20, cw / 16);
    const k = S.readerZoom ? S.view.k : stepZoom(L, steps, S.play.step, cw - pad * 2);
    const span = stepSpan(L, steps, S.play.step) || { x0: (left - S.view.x) / k, x1: (left + cw - S.view.x) / k };   // nothing drawn: stay
    const y0 = L.stepY[S.play.step] - 30;
    const y1 = Math.max(y0 + 60, L.stepY[S.play.step + 1] ?? L.bottom);
    const same = Math.abs(S.view.k - k) < 0.001;
    const inX = same && span.x0 * k + S.view.x >= left + pad && span.x1 * k + S.view.x <= left + cw - pad;
    const inY = same && y0 * k + S.view.y >= top && y1 * k + S.view.y <= top + ch;
    return {
      k,
      x: inX ? S.view.x : left + cw / 2 - ((span.x0 + span.x1) / 2) * k,
      y: inY ? S.view.y : top + ch / 2 - ((y0 + y1) / 2) * k,
    };
  }
  // the clear area: under the top controls, left of the side panel (wide) or above it
  // and the step bar (narrow)
  function clearArea() {
    const top = 56;
    if (!S.play) return { top, right: 0, bottom: 24 };
    const H = v.size().h;
    const right = wide() && !$.seqPanel.hidden ? $.seqPanel.offsetWidth + 14 : 0;
    const bottom = wide() ? $.stepBar.offsetHeight + 24 : H - ($.seqPanel.hidden ? $.stepBar.offsetTop : $.seqPanel.offsetTop) + 8;
    return { top, right, bottom };
  }
  const wide = () => v.size().w >= 720;
  const bounds = (ps) => ps.reduce((b, p) => ({
    x0: Math.min(b.x0, p.x - p.w / 2), x1: Math.max(b.x1, p.x + p.w / 2), y0: Math.min(b.y0, p.y - p.h / 2), y1: Math.max(b.y1, p.y + p.h / 2),
  }), { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity });
  const fitK = (b, w, H, pad) => Math.min((w - pad * 2) / Math.max(1, b.x1 - b.x0), (H - pad * 2) / Math.max(1, b.y1 - b.y0));
  // The camera glides to `to`. A frame's time can be a little before t0 (k is held at
  // 0, never run backwards past the start); a page given few or no frames (hidden, or a
  // test's virtual time) still arrives, by a timer just after the glide's end.
  function glideTo(to, animate) {
    camStop();
    if (!animate) { S.view = to; h.applyView(); return; }
    const from = { ...S.view };
    const t0 = performance.now();
    const run = camRun;
    const tick = (now) => {
      if (run !== camRun) return;
      const k = Math.max(0, Math.min(1, (now - t0) / CAM_MS));
      const e = 1 - (1 - k) ** 3;
      S.view = { k: from.k + (to.k - from.k) * e, x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
      h.applyView();
      if (k < 1) camAnim = requestAnimationFrame(tick);
      else camStop();
    };
    camAnim = requestAnimationFrame(tick);
    camTimer = setTimeout(() => tick(t0 + CAM_MS), CAM_MS + 150);
  }
  // a glide stops: a new one, the reader moving the camera, the play closing
  function camStop() {
    cancelAnimationFrame(camAnim);
    clearTimeout(camTimer);
    camRun++;
  }

  // ---------- the step bar ----------
  const btn = (name, icon, title, fn) => {
    const b = Object.assign(document.createElement('button'), { title, innerHTML: uiSvg(icon) });
    b.setAttribute('aria-label', title);
    b.dataset.act = name;
    b.addEventListener('click', () => { b.blur(); fn(); });
    return b;
  };
  const ctl = {
    back: btn('back', 'stepBack', 'Step back (←)', () => { pause(); go(S.play.step - 1); }),
    play: btn('play', 'play', 'Play (space)', () => (S.play.playing ? pause() : start())),
    fwd: btn('fwd', 'stepFwd', 'Step forward (→)', () => { pause(); go(S.play.step + 1); }),
    stop: btn('stop', 'stop', 'Stop (Esc)', () => close()),
  };
  $.stepCtl.append(ctl.back, ctl.play, ctl.fwd, ctl.stop);
  $.stepSwitch.addEventListener('click', () => { $.stepSwitch.blur(); h.switchView(); });
  // speed: right is faster; the slider's seven places are 5 to 2 seconds a step
  const secondsAt = (k) => 5 - k * 0.5;
  function speedUi() {
    const sec = h.stepSeconds();
    $.speed.value = String((5 - sec) / 0.5);
    const text = `${sec} seconds a step`;
    $.speed.setAttribute('aria-valuetext', text);
    $.speed.closest('label').title = `Speed: ${text}`;
  }
  $.speed.addEventListener('input', () => {
    h.setStepSeconds(secondsAt(Number($.speed.value)));
    speedUi();
    // playing: the next step comes at the new speed
    if (S.play?.playing) { stopTimer(); start(); }
  });

  function controls() {
    if (!S.play) return;
    const n = seq().steps.length;
    const playing = S.play.playing;
    ctl.play.innerHTML = uiSvg(playing ? 'pause' : 'play');
    ctl.play.title = playing ? 'Pause (space)' : 'Play (space)';
    ctl.play.setAttribute('aria-label', ctl.play.title);
    ctl.back.disabled = S.play.step <= 0;
    ctl.fwd.disabled = S.play.step >= n - 1;
    // the long count, and a short one for a narrow step bar (the CSS shows one)
    $.stepCount.innerHTML = `<span class="mmv-count-long">Step ${S.play.step + 1} of ${n}</span><span class="mmv-count-short">${S.play.step + 1}/${n}</span>`;
    speedUi();
    // on a narrow screen the side panel sits on the step bar
    v.root.style.setProperty('--mmv-stepbar-h', `${$.stepBar.offsetHeight}px`);
    const target = seqMap().playsOver?.[0];
    $.stepSwitch.hidden = onMap() ? false : !target;
    $.stepSwitch.innerHTML = `${uiSvg(onMap() ? 'lifelines' : 'onMap')}<span>${onMap() ? 'Lifelines' : 'On the map'}</span>`;
    $.stepSwitch.title = onMap() ? 'The same sequence as lifelines' : `Play over "${target?.viewLabel || target?.view}"`;
    for (const t of $.timeline.querySelectorAll('[data-step]')) {
      const k = Number(t.dataset.step);
      t.classList.toggle('is-now', k === S.play.step);
      t.classList.toggle('is-past', k < S.play.step);
    }
    for (const b of $.timeline.querySelectorAll('[data-from]')) {
      b.classList.toggle('is-now', Number(b.dataset.from) <= S.play.step && S.play.step <= Number(b.dataset.to));
      // too narrow for its word: a block with a symbol (loop ↻, parallel ⇉) shows only that
      b.classList.remove('is-tight');
      if (b.scrollWidth > b.clientWidth) b.classList.add('is-tight');
    }
  }

  // a tick per step (a loop's repeat step a turning arrow); a bracket over each block
  function buildTimeline() {
    const s = seq();
    const n = s.steps.length;
    $.timeline.replaceChildren();
    $.timeline.style.setProperty('--steps', n);
    const rows = [];   // bracket rows, so brackets that overlap sit one above the other
    const groups = [...s.groups].sort((a, b) => (b.to - b.from) - (a.to - a.from));
    for (const g of groups) {
      let r = 0;
      while ((rows[r] || []).some((x) => !(g.to < x.from || g.from > x.to))) r++;
      (rows[r] ||= []).push(g);
      const word = CAPTION[g.kind] || g.kind;
      const b = Object.assign(document.createElement('div'), { className: `mmv-tl-bracket is-${g.kind}`, title: [word, g.label].filter(Boolean).join(': ') });
      b.dataset.from = g.from;
      b.dataset.to = g.to;
      b.style.gridColumn = `${g.from + 1} / ${g.to + 2}`;
      b.style.gridRow = String(r + 1);
      b.appendChild(Object.assign(document.createElement('span'), { className: 'mmv-tl-word', textContent: word }));
      $.timeline.appendChild(b);
    }
    $.timeline.style.setProperty('--rows', rows.length);
    s.steps.forEach((st, k) => {
      const t = Object.assign(document.createElement('button'), { className: `mmv-tl-tick${st.repeat ? ' is-repeat' : ''}` });
      t.dataset.step = k;
      t.style.gridColumn = String(k + 1);
      t.style.gridRow = String(rows.length + 1);
      const first = st.msgs[0];
      t.title = st.repeat ? st.captions.at(-1) : `${k + 1}. ${st.msgs.map((m) => m.label || `${m.from} to ${m.to}`).join(', ')}`;
      t.setAttribute('aria-label', `Step ${k + 1}: ${t.title}`);
      if (st.repeat) t.textContent = '↻';
      else if (first) putNumber(t, first.num, first.back);
      if (!st.repeat && first?.reply) t.classList.add('is-reply');
      t.addEventListener('click', () => { t.blur(); pause(); go(k); });
      $.timeline.appendChild(t);
    });
  }

  // ---------- the side panel ----------
  function panel() {
    const s = seq();
    const step = s.steps[S.play.step];
    const p = $.seqPanel;
    p.replaceChildren();
    const el = (tag, cls, text, parent = p) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      parent.appendChild(e);
      return e;
    };
    el('div', 'mmv-seq-head', `${seqMap().title} · step ${S.play.step + 1} of ${s.steps.length}`);
    for (const c of step.captions) el('div', 'mmv-seq-cap', c);
    const name = (id) => seqMap().byId[id]?.plain || id;
    if (step.repeat) {
      el('p', 'mmv-seq-who', `Back to the start of the loop: messages ${[...new Set(step.msgs.map((m) => m.num))].join(', ')} again.`);
    } else {
      for (const m of step.msgs) {
        const box = el('div', 'mmv-seq-msg-row');
        const tint = m.reply ? 'reply' : 'call';
        putNumber(el('span', `mmv-seq-chip mmv-seq-${tint}${m.back || m.reply ? ' is-reply' : ''}`, null, box), m.num, m.back);
        el('strong', 'mmv-seq-label', m.label || (m.self ? 'to itself' : ''), box);
        // a scenario (model/scenarios.js) says how it moves: a state moves to the next, a table joins one
        const verb = seqMap()?.scenarioVerb;
        el('div', 'mmv-seq-who', m.self ? `${name(m.from)}, to itself` : `${name(m.from)} ${verb || (m.reply ? 'replies to' : m.head === 'async' ? 'tells' : 'calls')} ${name(m.to)}`);
        if (m.note) {
          const body = el('div', 'mmv-note-body mmv-seq-note-body');
          h.renderNote(m.note.body, body);
        }
        // the arrow it runs on, in the view: its note and icons (trust marks)
        const r = onMap() || seqMap().playsOver?.length ? h.relationFor(m.from, m.to, m.connectionId) : null;
        if (r && (r.note || r.icons?.length)) {
          const a = el('div', 'mmv-seq-arrow');
          const head = el('div', 'mmv-seq-arrow-head', null, a);
          head.innerHTML = (r.icons || []).map((c) => h.iconHtml(c)).join('');
          head.appendChild(Object.assign(document.createElement('span'), { textContent: `The arrow: ${r.label || `${name(r.from)} to ${name(r.to)}`}` }));
          if (r.note) h.renderNote(r.note.body, el('div', 'mmv-note-body', null, a));
        }
      }
    }
    for (const n of step.notes) el('div', 'mmv-seq-notes', n.text);
  }

  // ---------- keys ----------
  function key(e) {
    if (!S.play) return false;
    if (e.key === 'ArrowRight') { pause(); go(S.play.step + 1); return true; }
    if (e.key === 'ArrowLeft') { pause(); go(S.play.step - 1); return true; }
    if (e.key === ' ') { if (S.play.playing) pause(); else start(); return true; }
    if (e.key === 'Escape') { close(); return true; }
    return false;
  }

  return {
    open, close, go, start, pause, key, userMoved, decorate, labelOf, clearArea,
    isOn: () => !!S.play,
    onMap,
    // the state out: seq ('main' for the first diagram) and step from 1
    state: () => (S.play ? { seq: S.play.seq || 'main', step: S.play.step + 1 } : { seq: null, step: null }),
    refresh: () => { if (S.play) { buildTimeline(); show(false); } },
  };
}
