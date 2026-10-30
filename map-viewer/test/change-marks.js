// Contract checks for WO-31: one sparkle, only the topmost new thing marked, a small
// sparkle on diagram icons and the expand button, clearing a new thing in one go,
// contents() `changed`, and the `since`, `sinceLabel` and `marks` options.
import { mount } from '../index.js';

const BEFORE = `# Marks

\`\`\`mermaid
flowchart LR
  subgraph sys [System]
    subgraph svc [Service]
      subgraph core [Core]
        a[Alpha]
        b[Beta]
        c[Gamma]
      end
    end
    ext[External]
  end
  a --> b
  b --> ext
  click ext "#detail"
\`\`\`

## Detail

\`\`\`mermaid
flowchart LR
  d1[One] --> d2[Two]
\`\`\`
`;

// three levels down: a new box with two nodes and arrows, a changed label, a removal,
// a change in a linked diagram and a whole new linked diagram
const AFTER = BEFORE
  .replace('        a[Alpha]', '        a[Alpha two]')
  .replace('        c[Gamma]\n', '        subgraph extra [Extra]\n          x1[X one]\n          x2[X two]\n        end\n')
  .replace('  a --> b\n', '  a --> b\n  x1 --> x2\n  x1 --> a\n')
  .replace('  click ext "#detail"', '  click ext "#detail"\n  click b "#fresh"')
  .replace('d1[One]', 'd1[One and a half]')
  + `
## Fresh

\`\`\`mermaid
flowchart LR
  f1[New one] --> f2[New two]
\`\`\`
`;

export async function testChangeMarks(check, wait) {
  const host = document.getElementById('a');
  const q = (sel) => host.querySelector(sel);
  const marks = () => Object.fromEntries([...host.querySelectorAll('[data-mmv=nodes] .mmv-change:not(.mmv-spark), [data-mmv=frames] .mmv-change:not(.mmv-spark)')]
    .map((e) => [e.closest('[data-id]').dataset.id, e.getAttribute('class').replace('mmv-change is-', '')]));
  const sparkOn = (id) => !!q(`.mmv-node[data-id="${id}"] .mmv-inner-ic .mmv-spark, .mmv-frame[data-id="${id}"] .mmv-inner-ic .mmv-spark`);
  const entry = (v, part) => v.contents().find((x) => x.kind === 'diagram' && (x.part ?? null) === part);
  const key = 'avagahana-test-marks';
  localStorage.removeItem(`${key}-seen`);

  let v = mount(host, { storageKey: key });
  await v.load(BEFORE, 'marks.md');
  check('change marks fixture is valid', !v.problems.filter((p) => p.level === 'error').length, JSON.stringify(v.problems));
  await v.load(AFTER, 'marks.md');
  // everything open, so nothing hides a mark
  const openAll = async () => { for (let k = 0; k < 5 && q('.mmv-dot.is-closed'); k++) { q('[data-mmv=expandBtn]').click(); await wait(30); } };
  await openAll();
  let m = marks();
  check('a new box carries one sparkle; nothing inside it is marked', m.extra === 'new' && !m.x1 && !m.x2, JSON.stringify(m));
  check('a changed label is marked, and a removal marks its parent', m.a === 'changed' && m.core === 'changed', JSON.stringify(m));
  check('a new box\'s arrows are not marked (new with it)', !host.querySelector('[data-mmv=rels] .mmv-change'));
  check('one sparkle for new and changed: no pencil, no outlined sparkle', !host.querySelector('.mmv-change.is-inside, .mmv-lchange.is-inside')
    && [...host.querySelectorAll('.mmv-change use')].every((u) => /sparkle/.test(u.getAttribute('href'))));
  check('a diagram with a change has a small sparkle on its link icon', sparkOn('ext'), q('.mmv-node[data-id="ext"]')?.outerHTML.slice(0, 200));
  check('a whole new diagram has a small sparkle on its link icon', sparkOn('b'));
  check('contents() says which diagrams changed', entry(v, null)?.changed === true && entry(v, 'detail')?.changed === true && entry(v, 'fresh')?.changed === true,
    JSON.stringify(v.contents().map((x) => [x.part, x.changed])));
  q('[data-mmv=infoBtn]').click();
  await wait(50);
  const info = q('[data-mmv=infoPanel]').textContent;
  q('[data-mmv=infoBtn]').click();
  check('the info panel counts the new diagram apart', /1 new diagram/.test(info) && /Since you looked/.test(info), info.slice(0, 160));

  // a closed box hides the changes: no mark on it, the expand button says so
  let closed = null;
  for (let k = 0; k < 5 && !closed; k++) {
    q('[data-mmv=expandBtn]').click();
    await wait(30);
    if (q('.mmv-node[data-id="sys"], .mmv-node[data-id="svc"]')) closed = q('.mmv-node[data-id="sys"]') || q('.mmv-node[data-id="svc"]');
  }
  check('a closed box with a change inside has no mark of its own', !!closed && !closed.querySelector('.mmv-change'), closed?.outerHTML.slice(0, 160));
  check('the expand button has the small sparkle while closed boxes hide changes', q('[data-mmv=expandBtn]').classList.contains('has-marks'));
  await openAll();
  check('opened, the expand button\'s sparkle goes', !q('[data-mmv=expandBtn]').classList.contains('has-marks'));

  // the contents event fires when marks clear
  const lists = [];
  const off = v.on('contents', (list) => lists.push(list));
  // opening the whole new diagram clears it in one go
  v.setState({ part: 'fresh' });
  await wait(50);
  check('inside a whole new diagram nothing is marked', !host.querySelector('[data-mmv=nodes] .mmv-change, [data-mmv=rels] .mmv-change'));
  check('opening it clears it (contents changed false, the event fired)', entry(v, 'fresh')?.changed === false
    && lists.some((l) => l.find((x) => x.part === 'fresh')?.changed === false), JSON.stringify(lists.map((l) => l.find((x) => x.part === 'fresh')?.changed)));
  v.setState({ part: null });
  await openAll();
  await wait(900);   // the old drawing glides out first
  check('back in the first diagram, the new diagram\'s icon has no sparkle', !sparkOn('b') && sparkOn('ext'), JSON.stringify([sparkOn('b'), sparkOn('ext'), v.state.part, entry(v, 'fresh')?.changed]));
  // selecting the new box clears it and everything under it
  const mode = v.state.mode;
  v.setState({ mode: 'list' });
  await wait(30);
  q('.mmv-lrow[data-id="extra"]')?.click();
  await wait(30);
  v.setState({ mode });
  await wait(30);
  await openAll();
  m = marks();
  check('selecting a new box clears it and what is inside it', !m.extra && !m.x1 && !m.x2 && m.a === 'changed', JSON.stringify(m));
  check('selecting a new box leaves no sparkle on its arrows', !host.querySelector('[data-mmv=rels] .mmv-change'));
  off?.();
  v.destroy();

  // a new single node: selecting it clears its arrows too (they were new with it)
  {
    const solo = '# Solo\n\n```mermaid\nflowchart LR\n  a[Alpha] --> b[Beta]\n```\n';
    localStorage.removeItem(`${key}-seen`);
    const s = mount(host, { storageKey: key });
    await s.load(solo, 'solo.md');
    await s.load(solo.replace('  a[Alpha] --> b[Beta]\n', '  a[Alpha] --> b[Beta]\n  n[Newbie] --> b\n'), 'solo.md');
    await wait(30);
    const before = marks();
    const relMark = () => !!host.querySelector('[data-mmv=rels] .mmv-change');
    check('a new node carries the sparkle; its arrow does not', before.n === 'new' && !relMark(), JSON.stringify(before));
    const smode = s.state.mode;
    s.setState({ mode: 'list' });
    await wait(30);
    q('.mmv-lrow[data-id="n"]')?.click();
    await wait(30);
    s.setState({ mode: smode });
    await wait(30);
    check('selecting a new node clears it and its arrow', !marks().n && !relMark(), JSON.stringify(marks()));
    s.destroy();
  }

  // since: the same marks for every reader, nothing saved
  localStorage.removeItem(`${key}-seen`);
  for (const k of Object.keys(localStorage)) if (k.endsWith('-seen')) localStorage.removeItem(k);
  const runSince = async (storageKey) => {
    const s = mount(host, { storageKey, since: BEFORE, sinceLabel: 'version 1' });
    await s.load(AFTER, 'marks.md');
    await openAll();
    const got = marks();
    q('[data-mmv=infoBtn]').click();
    await wait(50);
    const info = q('[data-mmv=infoPanel]').textContent;
    s.destroy();
    return { got, info };
  };
  const one = await runSince('avagahana-test-since-1');
  const two = await runSince('avagahana-test-since-2');
  check('since gives the same marks to two fresh readers', JSON.stringify(one.got) === JSON.stringify(two.got) && one.got.extra === 'new' && one.got.a === 'changed', JSON.stringify([one.got, two.got]));
  check('since saves nothing', !Object.keys(localStorage).some((k) => k.endsWith('-seen')), Object.keys(localStorage).join());
  check('since: the info panel says "Since <label>"', /Since version 1/.test(one.info), one.info.slice(0, 120));
  {
    const s = mount(host, { storageKey: null, since: BEFORE });
    await s.load(AFTER, 'marks.md');
    q('[data-mmv=infoBtn]').click();
    await wait(50);
    check('since without a label: "Since the earlier version"', /Since the earlier version/.test(q('[data-mmv=infoPanel]').textContent));
    s.destroy();
  }
  {
    const s = mount(host, { storageKey: null, since: BEFORE, marks: false });
    await s.load(AFTER, 'marks.md');
    await openAll();
    check('marks: false shows no marks at all', !host.querySelector('.mmv-change') && !q('[data-mmv=infoBtn]').classList.contains('has-changes')
      && s.contents().every((x) => x.changed === false));
    s.destroy();
  }
  localStorage.removeItem(`${key}-seen`);
}
