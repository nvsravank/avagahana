// list.js — a sequence's List mode: its steps, numbered as on the arrows, under their
// blocks; a click plays from that step (the shared list.js hands over to this).
import { uiSvg, putNumber } from '../../chrome.js';
import { playState } from './scene.js';

// A sequence's list: its steps, numbered as on the arrows, each under the blocks it is
// in (a block's caption once, where it starts); while it plays, the step shown and those
// before are marked.
export function buildSequenceRows(seq, byId, step) {
  const name = (id) => byId[id]?.plain || id;
  const play = playState(seq, step);
  const rows = [];
  let shown = [];
  seq.steps.forEach((st, k) => {
    // the blocks this step is in that the row before was not
    const caps = st.repeat ? st.captions.slice(0, -1) : st.captions;
    caps.forEach((c, d) => { if (shown[d] !== c) rows.push({ kind: 'block', text: c, depth: d }); });
    shown = caps.slice();
    const state = play ? (k === step ? ' is-now' : k < step ? ' is-past' : '') : '';
    if (st.repeat) { rows.push({ kind: 'step', step: k, depth: caps.length, cls: `mmv-lstep is-repeat${state}`, num: '↻', text: st.captions.at(-1) }); return; }
    for (const m of st.msgs) {
      rows.push({
        kind: 'step', step: k, depth: caps.length, cls: `mmv-lstep${m.reply ? ' is-reply' : ''}${state}`, num: String(m.num), ...(m.back ? { back: true } : {}),
        text: m.self ? `${name(m.from)}, to itself` : `${name(m.from)} ${m.reply ? '⇠' : '→'} ${name(m.to)}`, label: m.label || null, note: !!m.note,
      });
    }
    for (const n of st.notes) rows.push({ kind: 'note', step: k, depth: caps.length, text: n.text });
  });
  return rows;
}
export function renderSequenceList(v, on) {
  const inner = document.createElement('div');
  inner.className = 'mmv-list-inner mmv-lseq';
  for (const r of buildSequenceRows(v.S.map.sequence, v.S.map.byId, v.S.play?.step)) {
    const row = document.createElement(r.kind === 'step' ? 'button' : 'div');
    row.className = r.kind === 'block' ? 'mmv-lblock' : r.kind === 'note' ? 'mmv-lseq-note' : r.cls;
    row.style.paddingLeft = `${10 + r.depth * 22}px`;
    if (r.kind === 'step') {
      row.append(putNumber(Object.assign(document.createElement('span'), { className: `mmv-seq-chip mmv-seq-${r.cls.includes('is-reply') ? 'reply is-reply' : 'call'}` }), r.num, r.back), ` ${r.text}`);
      if (r.label) row.appendChild(Object.assign(document.createElement('span'), { className: 'mmv-lrel-label', textContent: ` · ${r.label}` }));
      if (r.note) row.insertAdjacentHTML('beforeend', `<span class="mmv-lnote-ic" title="Has details">${uiSvg('note', 14)}</span>`);
      row.title = `Step ${r.step + 1}: play from here`;
      row.addEventListener('click', () => { row.blur(); on.step(r.step); });
    } else row.textContent = r.text;
    inner.appendChild(row);
  }
  v.$.list.replaceChildren(inner);
}
