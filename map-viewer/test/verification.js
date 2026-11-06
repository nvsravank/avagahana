import { mount } from '../index.js';
import { parseMap } from '../model/map.js';
import { renderEvidence } from '../evidence.js';
import { evidenceUrl, azureGitUrl, sourceUrl } from '../model/provenance.js';
const SHA = '1234567890abcdef1234567890abcdef12345678';
const refs = `- Source: [Service](#revision-app-reviewed)
  - File: src/checkout.py
  - Lines: 4-12
  - Supports: Creates the order before requesting payment.

- Source: [Service](#revision-app-reviewed)
  - File: src/payments.py
  - Lines: 20-30
  - Supports: Leaves failed payments available for retry.`;
export const PROVENANCE = `# Source review

\`\`\`mermaid
flowchart LR
  app[Checkout] order@-->|creates| db[Orders]
\`\`\`

## Node icons

- app : verified
- order : verified
- db : inferred

## Details

### <a id="app"></a>Checkout

Coordinates order creation and payment.

#### Evidence

${refs}

### <a id="order"></a>Creates order

#### Evidence

${refs}

### <a id="db"></a>Orders

Reasoned from the schema.

#### Evidence

The Orders component is inferred from the schema.

## Sources

### Repository: app

- Name: Shop service
- URL: https://github.com/example/shop

Checkout source.

#### Revision: app-reviewed

- Branch: main
- Commit: ${SHA}
- Reviewed: 2026-11-03

#### Revision: app-before

- Commit: abcdef1234567890abcdef1234567890abcdef12

### Repository: contracts

- Name: Event contracts
- URL: https://gitlab.com/example/contracts

#### Revision: contracts-reviewed

- Branch: release/2.4
- Commit: 9876543210abcdef9876543210abcdef98765432

### Repository: handbook

- Name: Operations handbook
- Version control: none
- Reviewed: 2026-11-03

Local review checklist.
`;
export async function testVerification(check, wait) {
  const model = parseMap(PROVENANCE, 'review.md');
  check('provenance: Markdown sources do not change valid Mermaid', !model.problems.length, JSON.stringify(model.problems));
  check('verification: mark without Evidence warns but retains the mark', parseMap(PROVENANCE.replace('#### Evidence', '#### Explanation'), 'missing.md').problems.some((p) => p.code === 'verification-pair'));
  const textOnly = parseMap(PROVENANCE.replace('- app : verified\n', ''), 'text-only.md');
  check('verification: Evidence without mark warns but retains text', textOnly.problems.some((p) => p.code === 'verification-pair') && !!textOnly.byId.app.note.evidence);
  check('provenance: multiple revisions and non-Git sources', model.sources.repositories.length === 3 && model.sources.repositories[0].revisions.length === 2 && model.sources.repositories[2].vcs === 'none');
  const evidence = model.byId.app.note.evidence;
  check('provenance: two files share one inspected revision', evidence.refs.length === 2 && evidence.refs.every((r) => r.target.revision.commit === SHA));
  {
    const az = `https://tfs.example.test/tfs/Coll/Proj/_git/repo`;
    const good = [`${az}?path=/src/a.py&version=GC${SHA}`, `${az}?path=%2Fsrc%2Fa.py&version=GC${SHA}&line=4&lineEnd=12&lineStartColumn=1&lineEndColumn=1&lineStyle=plain&_a=contents`, `https://dev.azure.com/org/proj/_git/repo?version=GC${SHA}&path=/a`];
    const bad = [`${az}?path=/a&version=GBmain`, `${az}?path=/a&version=GB${SHA}`, `${az}?path=/a&version=GT${SHA}`, `${az}?path=/a`, `${az}?version=GC${SHA}`, `${az}?path=/a&version=GC${'0'.repeat(40)}`,
      `${az}?path=/a&version=GC${SHA}&version=GBmain`, `${az}?path=/a&version=GC${SHA}&token=abc`, `${az}?path=/a&version=GC${SHA}&_a=history`, `${az}?path=/a&version=GC${SHA}#x`, `${az}?path=/a;x=1&version=GC${SHA}`,
      `https://user:pw@tfs.example.test/_git/repo?path=/a&version=GC${SHA}`, `https://tfs.example.test/a/b?path=/a&version=GC${SHA}`, `https://tfs.example.test/x/_git/../r?path=/a&version=GC${SHA}`, `ftp://tfs.example.test/_git/r?path=/a&version=GC${SHA}`];
    check('provenance: Azure Repos links pinned by version=GC and the captured commit are accepted', good.every((u) => azureGitUrl(u, SHA)), good.filter((u) => !azureGitUrl(u, SHA)));
    check('provenance: branch, tag, other-commit, conflicting and extra selectors are rejected', bad.every((u) => !azureGitUrl(u, SHA)), bad.filter((u) => azureGitUrl(u, SHA)));
    check('provenance: a query link needs a captured commit, and repository URLs stay query-free', !azureGitUrl(good[0], undefined) && !sourceUrl(good[0]) && !sourceUrl(good[0], true));
    const withUrl = (url) => parseMap(PROVENANCE.replace('  - Lines: 4-12\n', `  - Lines: 4-12\n  - URL: ${url}\n`), 'review.md');
    const pinned = withUrl(good[1]);
    check('provenance: a pinned query link is the citation', evidenceUrl(pinned.byId.app.note.evidence.refs[0]) === good[1] && !pinned.problems.some((p) => p.code === 'evidence-syntax'));
    const branch = withUrl(bad[0]);
    check('provenance: a branch link is an error and not a citation', branch.problems.some((p) => p.code === 'evidence-syntax') && !branch.byId.app.note.evidence.refs[0].url);
    // one quiet explanation per source, none where every file links
    const unknown = parseMap(PROVENANCE.replace('https://github.com/example/shop', 'https://git.example.test/shop'), 'review.md');
    const box = document.createElement('div');
    renderEvidence(unknown.byId.app.note, box, {});
    check('evidence: one missing-link line per source, files and claims still shown', box.querySelectorAll('.mmv-evidence-nolink').length === 1 && box.textContent.includes('src/checkout.py') && box.textContent.includes('src/payments.py') && box.textContent.includes('Leaves failed payments') && box.querySelector('.mmv-evidence-nolink').textContent === 'No revision web link available for this source.', box.innerHTML);
    const mixed = parseMap(PROVENANCE.replace('https://github.com/example/shop', 'https://git.example.test/shop').replace('  - Lines: 4-12\n', `  - Lines: 4-12\n  - URL: ${good[1]}\n`), 'review.md');
    const box2 = document.createElement('div');
    renderEvidence(mixed.byId.app.note, box2, {});
    check('evidence: a source with some links says which files lack one', box2.querySelectorAll('a').length === 1 && box2.querySelectorAll('.mmv-evidence-nolink').length === 1 && box2.querySelector('.mmv-evidence-nolink').textContent.startsWith('Files shown without a link'), box2.innerHTML);
    const linked = document.createElement('div');
    renderEvidence(model.byId.app.note, linked, {});
    check('evidence: no missing-link line where every file links', !linked.querySelector('.mmv-evidence-nolink'), linked.innerHTML);
  }
  check('provenance: file links are commit-pinned', evidenceUrl(evidence.refs[0]) === `https://github.com/example/shop/blob/${SHA}/src/checkout.py#L4-L12`);
  for (const [url, expected] of [['https://gitlab.com/team/shop', `https://gitlab.com/team/shop/-/blob/${SHA}/src/checkout.py#L4-12`], ['https://bitbucket.org/team/shop', `https://bitbucket.org/team/shop/src/${SHA}/src/checkout.py#lines-4:12`], ['https://git.example.test/team/shop', null]]) {
    const parsed = parseMap(PROVENANCE.replace('https://github.com/example/shop', url), 'review.md');
    check(`provenance: pinned links for ${url}`, evidenceUrl(parsed.byId.app.note.evidence.refs[0]) === expected);
  }
  for (const text of [PROVENANCE.replace('https://github.com/example/shop', 'https://secret@example.com/shop'), PROVENANCE.replace('Lines: 4-12', 'Lines: 12-4'), PROVENANCE.replace('File: src/checkout.py', 'File: ../private.txt'), PROVENANCE.replace('#revision-app-reviewed', '#revision-missing')]) check('provenance: invalid identity or reference has a diagnostic', parseMap(text, 'bad.md').problems.length > 0);
  const host = document.getElementById('a');
  const viewer = mount(host, { storageKey: null });
  const q = (selector) => host.querySelector(selector);
  const mark = () => q('.mmv-node[data-id="app"] [data-trust]');
  const click = (e) => e.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await viewer.load(PROVENANCE, 'review.md');
  await wait(50);
  check('verification: neutral toolbar icon follows Info', q('[data-mmv=infoBtn]').nextElementSibling === q('[data-mmv=verificationBtn]') && !!q('[data-mmv=verificationBtn] svg'));
  const geometry = () => JSON.stringify([...host.querySelectorAll('.mmv-node,.mmv-frame,.mmv-note-ic,.mmv-flow-label,.mmv-rel-label')].map((e) => [e.getAttribute('class'), e.getAttribute('transform'), e.getAttribute('x'), e.getAttribute('y'), e.querySelector(':scope > .mmv-shape')?.getAttribute('d')]));
  const shownGeometry = geometry();
  const position = (e) => e.getBoundingClientRect();
  check('verification: node trust mark follows its note on the right', position(mark()).left >= position(q('.mmv-node[data-id=app] [data-note]')).right);
  const edgeMark = q('[data-trust-arrow]');
  const edgeNote = q('.mmv-flow-note');
  check('verification: arrow trust mark follows its note on the right', position(edgeMark).left >= position(edgeNote).right);
  const toolbarButton = q('[data-mmv=verificationBtn]').getBoundingClientRect();
  const toolbarIcon = q('[data-mmv=verificationBtn] svg').getBoundingClientRect();
  check('verification: toolbar seal is centered inside a square button', toolbarButton.width === toolbarButton.height && Math.abs(toolbarButton.left + toolbarButton.width / 2 - toolbarIcon.left - toolbarIcon.width / 2) < 0.1 && Math.abs(toolbarButton.top + toolbarButton.height / 2 - toolbarIcon.top - toolbarIcon.height / 2) < 0.1);
  check('verification: marks start shown', getComputedStyle(mark()).visibility !== 'hidden');
  mark().dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  check('verification: hover alone does not open evidence', q('.mmv-evidence-popup').hidden);
  click(mark()); mark().focus();
  check('verification: trust focus does not use the browser auto-filled ring', getComputedStyle(mark()).outlineStyle !== 'auto' && getComputedStyle(mark()).backgroundColor === 'rgba(0, 0, 0, 0)');
  check('verification: click shows only the claim evidence, grouped by source', !q('.mmv-evidence-popup').hidden && q('.mmv-evidence-popup').querySelectorAll('.mmv-evidence-source').length === 1 && q('.mmv-evidence-popup').querySelectorAll('.mmv-evidence-ref').length === 2 && !q('.mmv-evidence-popup').textContent.includes('Coordinates order creation'));
  check('verification: mark does not select or drill into its node', !viewer.state.node && !viewer.state.focus && !viewer.state.page);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check('verification: Escape closes popup and returns focus', q('.mmv-evidence-popup').hidden && document.activeElement === mark());
  mark().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  check('verification: keyboard activation opens popup', !q('.mmv-evidence-popup').hidden);
  click(mark());
  check('verification: clicking same mark closes popup', q('.mmv-evidence-popup').hidden);
  const arrow = q('[data-trust-arrow]'); click(arrow);
  check('verification: arrow mark opens its own evidence', q('.mmv-evidence-popup .mmv-evidence-ref') && !q('.mmv-evidence-popup').hidden);
  q('[data-mmv=verificationBtn]').click(); await wait(40);
  const panel = q('[data-mmv=verificationPanel]');
  check('verification: legend includes only trust categories used in this file', panel.querySelectorAll('.mmv-trust-legend .mmv-legend-row').length === 2 && !panel.querySelector('.mmv-trust-legend').textContent.includes('Hypothesis'));
  check('verification: central list includes non-Git source and full commits', panel.textContent.includes('Not Git-backed') && panel.textContent.includes(SHA));
  check('verification: only the source list scrolls within available panel height', panel.querySelector('.mmv-source-list').scrollHeight > panel.querySelector('.mmv-source-list').clientHeight && panel.querySelector('.mmv-source-list').getBoundingClientRect().bottom <= panel.getBoundingClientRect().bottom + 1);
  q('[data-mmv=sourcesCollapse]').click(); await wait(20);
  check('verification: collapse all leaves repository name summaries', [...panel.querySelectorAll('.mmv-source')].every((d) => !d.open));
  q('[data-mmv=sourcesExpand]').click(); await wait(20);
  check('verification: expand all opens every repository', [...panel.querySelectorAll('.mmv-source')].every((d) => d.open));
  q('[data-mmv=trustMarksHide]').click(); await wait(30);
  check('verification: toggling Hide preserves all label and note positions', geometry() === shownGeometry);
  check('verification: Hide removes drawing marks', getComputedStyle(mark()).visibility === 'hidden');
  viewer.setState({ page: 'app' }); await wait(100);
  check('verification: hidden diagram marks keep node-page evidence and icons', !!q('.mmv-page .mmv-evidence-mark svg') && q('.mmv-page .mmv-evidence').textContent.includes('src/payments.py'));
  check('verification: evidence precedes note and every diagram', q('.mmv-page-body').children[1]?.classList.contains('mmv-evidence') && q('.mmv-page').textContent.split('Creates the order before requesting payment.').length === 2);
  viewer.setState({ page: null, mode: 'list' }); await wait(40);
  const note = q('.mmv-lnote-head'); if (note) note.click(); await wait(30);
  check('verification: list notes still contain evidence while marks hidden', !!q('.mmv-lnote-body .mmv-evidence'));
  const html = await viewer.snapshot();
  const payload = JSON.parse(/<script type="application\/json" id="avagahana-data">([^]*?)<\/script>/.exec(html)[1]);
  check('verification: HTML captures hidden preference without rewriting Markdown', payload.options.prefs.trustMarks === false && payload.options.text === PROVENANCE);
  viewer.setPrefs({ trustMarks: true });
  viewer.setState({ mode: 'boxes' }); await wait(30);
  check('verification: explicit runtime preference shows marks again', getComputedStyle(mark()).visibility !== 'hidden');
  const svg = await viewer.export({ format: 'svg' });
  check('verification: SVG is static without evidence navigation', !new DOMParser().parseFromString(svg.data, 'image/svg+xml').querySelector('a') && !svg.data.includes(`/blob/${SHA}/`));
  viewer.setPrefs({ trustMarks: false });
  const hidden = await viewer.export({ format: 'svg' });
  check('verification: hidden marks are absent from SVG', !hidden.data.includes('data-trust='));
  const exportedLabel = (data) => [...new DOMParser().parseFromString(data, 'image/svg+xml').querySelectorAll('text')].find((e) => e.textContent === 'creates')?.getAttribute('x');
  check('verification: hidden SVG keeps the same arrow label position', exportedLabel(svg.data) != null && exportedLabel(svg.data) === exportedLabel(hidden.data));
  viewer.setPrefs({ look: 'poster', trustMarks: true }); await wait(30);
  check('verification: Poster draws exactly one trailing mark per marked node', host.querySelectorAll('.mmv-node[data-id=app] [data-trust]').length === 1);
  viewer.destroy();
  const hiddenViewer = mount(host, { storageKey: null, prefs: { trustMarks: false } }); await hiddenViewer.load(PROVENANCE, 'review.md'); await wait(30);
  check('verification: mount preference opens with marks hidden', getComputedStyle(mark()).visibility === 'hidden');
  check('verification: initially hidden reserves the same geometry as shown', geometry() === shownGeometry);
  hiddenViewer.destroy();
  const plain = '# Plain\n\n```mermaid\nflowchart LR\n  a[Idea] --> b[Question]\n```\n';
  const plainViewer = mount(host, { storageKey: null }); await plainViewer.load(plain, 'plain.md'); await wait(30);
  check('verification: no marks or evidence means no toolbar button', q('[data-mmv=verificationBtn]').hidden);
  await plainViewer.load(PROVENANCE.replace('- app : verified\n', '').replace('- order : verified\n', '').replace('- db : inferred\n', ''), 'notes-only.md'); await wait(30);
  check('verification: text-only claims still expose the toolbar', !q('[data-mmv=verificationBtn]').hidden);
  check('verification: missing-mark authoring problems are viewer warnings', plainViewer.problems.filter((p) => p.code === 'map-verification-pair').every((p) => p.level === 'warning'));
  plainViewer.destroy();
}
