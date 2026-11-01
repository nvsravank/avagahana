// Contract checks for WO-30: viewer.contents() and its event, the default view's label
// "Overview", the themes' frame colours, and the return mark drawn as an icon.
import { mount, checkTheme } from '../index.js';
import defaultTheme from '../themes/default/theme.js';

// The website gallery's jump lists as it built them before WO-30: from the file's
// headings (sravannerella.com gallery.astro jumps()). viewer.contents() must list the same.
const anchorOf = (h) => h.toLowerCase().trim().replace(/[^\w\- ]/g, '').replace(/ /g, '-');
const RESERVED = /^(relations|perspective|joins|classes|details|notes|icons|node icons|scenario|deployment|plays over)\b/i;
function galleryJumps(text) {
  const lines = text.split('\n');
  const title = (lines.find((l) => /^# /.test(l)) || '# Map').slice(2).trim();
  const first = lines.findIndex((l) => l.startsWith('```mermaid'));
  const kind = (i) => (lines[i + 1] || '').trim().split(/\s/)[0];
  const out = { diagrams: [], views: [], deployments: [], scenarios: [] };
  out.diagrams.push({ label: title, seq: kind(first) === 'sequenceDiagram' ? 'main' : null });
  let part = null, partLabel = title, inWalkthrough = false;
  const viewsOf = new Map();
  lines.forEach((l, i) => {
    const h = l.match(/^#{2,6}\s+(.+)$/);
    if (!h) return;
    const head = h[1].trim();
    // a walkthrough's stops are not views, deployments or scenarios of the file
    if (/^##\s/.test(l)) inWalkthrough = /^walkthrough\s*:/i.test(head);
    if (inWalkthrough) return;
    const next = lines.slice(i + 1).find((x) => x.trim());
    if (!RESERVED.test(head) && next?.startsWith('```mermaid')) {
      part = anchorOf(head);
      partLabel = head;
      out.diagrams.push({ label: head, seq: kind(lines.indexOf(next, i)) === 'sequenceDiagram' ? part : null });
      return;
    }
    let m;
    if ((m = head.match(/^(perspective|joins):\s*(.+)$/i))) {
      if (!viewsOf.has(part)) viewsOf.set(part, { label: partLabel, views: [] });
      viewsOf.get(part).views.push({ label: m[2].trim(), view: m[2].trim() });
    } else if ((m = head.match(/^deployment:\s*(.+)$/i))) m[1].split(',').forEach((env) => out.deployments.push({ label: env.trim(), env: env.trim() }));
    else if ((m = head.match(/^scenario:\s*([^|]+)/i))) out.scenarios.push({ label: m[1].trim(), seq: `${part || anchorOf(title)}-scenario-${anchorOf(m[1].trim())}` });
  });
  const several = viewsOf.size > 1;
  for (const [, { label, views }] of viewsOf) {
    for (const v of [{ label: 'Overview', view: null }, ...views]) out.views.push({ label: several ? `${label} · ${v.label}` : v.label, view: v.view });
  }
  return out;
}
// The same four lists from viewer.contents()
function fromContents(list) {
  const viewParts = new Set(list.filter((x) => x.kind === 'view' || x.kind === 'join').map((x) => x.part));
  const named = (x) => (viewParts.size > 1 ? `${x.diagram} · ${x.label}` : x.label);
  return {
    diagrams: list.filter((x) => x.kind === 'diagram' || x.kind === 'sequence').map((x) => ({ label: x.label, seq: x.kind === 'sequence' ? x.state.seq : null })),
    views: list.filter((x) => x.kind === 'view' || x.kind === 'join').map((x) => ({ label: named(x), view: x.state.view })),
    deployments: list.filter((x) => x.kind === 'deployment').map((x) => ({ label: x.label, env: x.state.env })),
    scenarios: list.filter((x) => x.kind === 'scenario').map((x) => ({ label: x.label, seq: x.state.seq })),
  };
}

const EXAMPLES = ['garden', 'shapes', 'slow-checkout', 'shop-plan', 'job-race', 'order-states', 'sales-warehouse', 'shop-layers', 'tools', 'cache-miss'];

export async function testContents(check) {
  const host = document.createElement('div');
  host.style.cssText = 'width:900px;height:600px;position:relative';
  document.body.appendChild(host);
  const v = mount(host, { storageKey: null });
  const got = [];
  v.on('contents', (list) => got.push(list));

  // ---- the same lists the gallery built from headings, for every example ----
  for (const name of EXAMPLES) {
    const text = await fetch(`../../examples/maps/${name}.md`).then((r) => r.text());
    await v.load(text, `${name}.md`);
    const want = galleryJumps(text);
    const have = fromContents(v.contents());
    for (const k of Object.keys(want)) check(`contents: ${name} ${k} match the gallery's`, JSON.stringify(have[k]) === JSON.stringify(want[k]), `${JSON.stringify(have[k])} vs ${JSON.stringify(want[k])}`);
  }
  await v.load(await fetch('../../examples/maps/shop-layers.md').then((r) => r.text()), 'shop-layers.md');
  const list = v.contents();
  check('contents: the first diagram is marked first, and only it', list.filter((x) => x.first).length === 1 && list.find((x) => x.kind !== 'walkthrough').first && list.find((x) => x.kind !== 'walkthrough').part === null);
  check('contents: each entry has kind, label, part and state', list.every((x) => typeof x.kind === 'string' && typeof x.label === 'string' && 'part' in x && x.state && typeof x.state === 'object'));
  check('contents: join views are kind join', list.some((x) => x.kind === 'join' && x.label === 'Paid amount per line'), JSON.stringify(list.filter((x) => x.kind === 'join')));
  check('contents: a copy each call', v.contents() !== v.contents() && JSON.stringify(v.contents()) === JSON.stringify(list));
  check('contents: the event fired for each map', got.length === EXAMPLES.length + 1, got.length);

  // ---- each state opens what it names ----
  const shop = list;
  const lifecycle = shop.find((x) => x.kind === 'diagram' && x.label === 'Order lifecycle');
  v.setState(lifecycle.state);
  check('contents: a diagram\'s state opens it', v.state.part === lifecycle.part, JSON.stringify(v.state));
  const join = shop.find((x) => x.kind === 'join');
  v.setState(join.state);
  check('contents: a join view\'s state opens it', v.state.part === join.part && v.state.view === join.state.view, JSON.stringify(v.state));
  const scenario = shop.find((x) => x.kind === 'scenario');
  v.setState(scenario.state);
  check('contents: a scenario\'s state plays it from step 1', v.state.seq === scenario.state.seq && v.state.step === 1, JSON.stringify(v.state));
  const overview = shop.find((x) => x.kind === 'view' && x.part === join.part && x.state.view === null);
  v.setState(overview.state);
  check('contents: the default view\'s state stops the play and opens it', !v.state.seq && v.state.part === join.part && v.state.view === null, JSON.stringify(v.state));

  // ---- walkthroughs: listed first; a stop opens its item; the side panel moves with it ----
  const walk = v.contents().find((x) => x.kind === 'walkthrough');
  check('walkthrough: listed first, with its stop count and the state that opens stop 1', walk && walk.label === 'Payments for the security team' && walk.stops === 5 && walk.state.walkthrough === walk.label && walk.state.stop === 1 && JSON.stringify(v.contents()[0]) === JSON.stringify(walk), JSON.stringify(walk));
  const panel = host.querySelector('[data-mmv=stopPanel]');
  const q = (name) => host.querySelector(`[data-mmv=${name}]`);
  v.setState({ walkthrough: walk.label, stop: 3 });
  check('walkthrough: stop 3 opens its item (the Order lifecycle diagram)', v.state.walkthrough === walk.label && v.state.stop === 3 && v.state.part === lifecycle.part, JSON.stringify(v.state));
  check('walkthrough: the panel shows the stop, its count and its note', !panel.hidden && q('stopTitle').textContent === 'Order lifecycle' && q('stopCount').textContent === 'Stop 3 of 5' && q('stopKind').textContent === 'Diagram' && /tried again/.test(q('stopNote').textContent), `${q('stopTitle').textContent} | ${q('stopCount').textContent}`);
  check('walkthrough: no Next on the last stop, no Previous on the first', (() => { v.setState({ walkthrough: walk.label, stop: 5 }); const last = q('stopNext').hidden && !q('stopPrev').hidden; v.setState({ walkthrough: walk.label, stop: 1 }); const first = q('stopPrev').hidden && !q('stopNext').hidden; v.setState({ walkthrough: walk.label, stop: 3 }); return last && first; })());
  q('stopNext').click();
  check('walkthrough: Next moves to stop 4 (the scenario), which plays from step 1', v.state.stop === 4 && v.state.seq === scenario.state.seq && q('stopCount').textContent === 'Stop 4 of 5', JSON.stringify(v.state));
  q('stopPrev').click();
  q('stopPrev').click();
  check('walkthrough: Previous moves back, and stop 2 opens its perspective', v.state.stop === 2 && v.state.view === 'Checkout (synchronous)' && !q('stopPrev').hidden && !q('stopNext').hidden, JSON.stringify(v.state));
  v.setState({ mode: 'list' });
  check('walkthrough: exploring inside the stop (another mode) stays on it', v.state.stop === 2 && q('stopOff').hidden, JSON.stringify(v.state));
  v.setState({ mode: 'boxes' });
  v.setState({ part: lifecycle.part });
  check('walkthrough: opening another stop\'s place moves to that stop', v.state.stop === 3 && q('stopOff').hidden && q('stopCount').textContent === 'Stop 3 of 5', JSON.stringify(v.state));
  v.setState({ part: null, view: 'Events (asynchronous)' });
  check('walkthrough: opening a place that is no stop is off the path; the stop stays', v.state.stop === 3 && !q('stopOff').hidden && q('stopBack').textContent === 'Return to stop 3', JSON.stringify(v.state));
  q('stopBack').click();
  check('walkthrough: Return opens the stop again', v.state.stop === 3 && v.state.part === lifecycle.part && q('stopOff').hidden, JSON.stringify(v.state));
  v.setState({ part: null, view: 'Events (asynchronous)' });
  q('stopPrev').click();
  check('walkthrough: off the path, Previous goes on from the stop', v.state.stop === 2 && v.state.view === 'Checkout (synchronous)' && q('stopOff').hidden, JSON.stringify(v.state));
  q('stopMin').click();
  check('walkthrough: minimised to a small route icon, no name or place; the panel hides', panel.hidden && !q('stopTab').hidden && !!q('stopTab').querySelector('svg') && q('stopTab').textContent.trim() === '');
  q('stopTab').click();
  check('walkthrough: the tab opens the panel again', !panel.hidden && q('stopTab').hidden);
  v.setState({ walkthrough: null });
  check('walkthrough: closing it hides the panel and the state key', !('walkthrough' in v.state) && panel.hidden && q('stopTab').hidden, JSON.stringify(v.state));

  // ---- the picker: the whole map, walks first, rows that open and close ----
  v.setState({ part: null, view: null });
  const vm = q('viewMenu');
  const heads = [...vm.querySelectorAll('.mmv-menu-head')].map((x) => x.textContent);
  const rows = [...vm.querySelectorAll(':scope > .mmv-vm-row > .mmv-vm-line .mmv-vm-label')].map((x) => x.textContent);
  check('picker: Walks, then Diagrams; every diagram, the first as Overview', JSON.stringify(heads) === '["Walks","Diagrams"]' && rows[0] === walk.label && rows[1] === 'Overview' && rows.includes('Order lifecycle') && rows.includes('Checkout'), JSON.stringify([heads, rows]));
  const lifeKey = `[data-key="d:${lifecycle.part}"]`;
  check('picker: a diagram not shown starts closed', !vm.querySelector(`${lifeKey} .mmv-vm-kids`));
  vm.querySelector(`${lifeKey} .mmv-vm-twist`).click();
  const lifeKids = [...vm.querySelectorAll(`${lifeKey} .mmv-vm-kids .mmv-vm-label`)].map((x) => x.textContent);
  check('picker: its twist opens it, listing its scenarios', lifeKids.includes('Soft decline, then paid'), JSON.stringify(lifeKids));
  [...vm.querySelectorAll(`${lifeKey} .mmv-vm-kids .mmv-menu-item`)].find((b) => b.textContent.startsWith('Soft decline')).click();
  check('picker: a scenario plays from it', v.state.seq === scenario.state.seq, JSON.stringify(v.state));
  vm.querySelector(`[data-key="w:${walk.label}"] .mmv-vm-twist`).click();
  [...vm.querySelectorAll(`[data-key="w:${walk.label}"] .mmv-vm-kids .mmv-menu-item`)].find((b) => b.textContent.startsWith('3.')).click();
  check('picker: a stop opens the walkthrough there', v.state.walkthrough === walk.label && v.state.stop === 3 && vm.querySelector(`[data-key="w:${walk.label}"] .mmv-vm-kids .is-on`)?.textContent.startsWith('3.'), JSON.stringify(v.state));
  v.setState({ walkthrough: null });

  // ---- live reload: the event only when the list changes ----
  const shopText = await fetch('../../examples/maps/shop-layers.md').then((r) => r.text());
  const n = got.length;
  await v.load(shopText, 'shop-layers.md');
  check('contents: a reload with the same list fires no event', got.length === n);
  await v.load(shopText.replace('## Perspective: Events (asynchronous)', '## Perspective: Events and returns'), 'shop-layers.md');
  check('contents: a reload that changes the list fires it', got.length === n + 1 && got.at(-1).some((x) => /Events and returns/.test(x.label)), JSON.stringify(got.at(-1)?.map((x) => x.label)));

  // ---- unlinked diagrams are listed, marked, and open ----
  await v.load('# Lost\n```mermaid\nflowchart LR\n  a[A] --> b[B]\n```\n## Far away\n```mermaid\nflowchart LR\n  c[C] --> d[D]\n```\n', 'lost.md');
  const lost = v.contents().find((x) => x.label === 'Far away');
  check('contents: an unreachable diagram is listed as unlinked', lost?.unlinked === true, JSON.stringify(v.contents()));
  v.setState(lost.state);
  check('contents: an unlinked diagram\'s state opens it', v.state.part === 'far-away', JSON.stringify(v.state));

  // ---- per viewer: a second viewer has its own list ----
  const host2 = document.createElement('div');
  host2.style.cssText = 'width:600px;height:400px;position:relative';
  document.body.appendChild(host2);
  const w = mount(host2, { storageKey: null });
  await w.load(await fetch('../../examples/maps/garden.md').then((r) => r.text()), 'garden.md');
  check('contents: each viewer lists its own map', w.contents()[0].label === 'Community garden' && v.contents()[0].label === 'Lost');

  // ---- the default view is shown as "Overview"; the name stays "Relations" ----
  await v.load(await fetch('../../examples/maps/c4-shop.md').then((r) => r.text()), 'c4-shop.md');
  const pill = () => host.querySelector('[data-mmv=viewName]').textContent;
  check('Overview: the view picker shows the default view as Overview', pill() === 'Overview', pill());
  check('Overview: the menu lists it so', [...host.querySelectorAll('[data-mmv=viewMenu] .mmv-menu-item')].some((b) => b.textContent === 'Overview'));
  check('Overview: viewer.views keeps the name Relations', v.views[0] === 'Relations', JSON.stringify(v.views));
  v.setState({ view: 'Data flow' });
  v.setState({ view: 'Overview' });
  check('Overview: setState takes the label too', v.state.view === null && pill() === 'Overview', JSON.stringify(v.state));
  v.setState({ view: 'Data flow' });
  v.setState({ view: 'Relations' });
  check('Overview: setState still takes the name', v.state.view === null);

  // ---- the theme event for a host frame ----
  const looks = [];
  v.on('theme', (t) => looks.push(t));
  host.querySelector('.mmv [data-pref=appearance] [data-v=light]').click();
  host.querySelector('.mmv [data-pref=appearance] [data-v=dark]').click();
  check('theme event: a change of appearance reports theme and appearance', looks.at(-1)?.id === 'default' && looks.at(-1)?.appearance === 'dark', JSON.stringify(looks));

  // ---- the return mark: drawn, never the text glyph ----
  await v.load(await fetch('../../examples/maps/job-race.md').then((r) => r.text()), 'job-race.md');
  v.setState({ seq: 'main', step: 2 });
  const back = [...host.querySelectorAll('.mmv-seq-badge')].find((g) => g.querySelector('path.mmv-ret'));
  check('return mark: a return\'s badge has its number and the drawn mark', back?.querySelector('text').textContent === '1', back?.outerHTML.slice(0, 200));
  check('return mark: no U+21A9 anywhere in the viewer', !host.textContent.includes('\u21A9') && !host.innerHTML.includes('\u21A9'));
  check('return mark: the timeline chip draws it', [...host.querySelectorAll('.mmv-tl-tick')].some((t) => t.querySelector('svg.mmv-ret') && t.textContent === '1'));

  // ---- frame colours ----
  const dt = checkTheme(defaultTheme);
  const fr = dt.theme.appearances.light.frame;
  check('frame: the built-in theme has the website colours', fr.bg === '#ffffff' && fr.accent === '#5f7b00' && dt.theme.appearances.dark.frame.bg === '#1e1714', JSON.stringify(fr));
  check('frame: the built-in colours pass contrast', !dt.problems.some((p) => p.code === 'contrast-frame'), JSON.stringify(dt.problems));
  const plain = checkTheme({ id: 'plain-frame', appearances: { light: { bg: '#ffffff', ink: '#111111', category: ['#225588'] } } });
  check('frame: a theme without one gets one, quietly', plain.ok && plain.theme.appearances.light.frame.ink === '#111111' && !plain.problems.some((p) => /frame/.test(p.message)), JSON.stringify(plain.problems));
  const poor = checkTheme({ id: 'poor-frame', appearances: { light: { bg: '#ffffff', ink: '#111111', category: ['#225588'], frame: { bg: '#ffffff', ink: '#eeeeee' } } } });
  check('frame: low frame contrast is a warning', poor.ok && poor.problems.some((p) => p.code === 'contrast-frame'));
  check('frame: the variables reach the page', getComputedStyle(host.querySelector('.mmv')).getPropertyValue('--mmv-frame-bg').trim() === '#1e1714');

  w.destroy();
  host2.remove();
  v.destroy();
  host.remove();
}
