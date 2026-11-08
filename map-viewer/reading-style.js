// Styles belong to the generated standalone document; all paint comes from its
// captured theme. No reader OS appearance or viewer chrome is shipped here.
export const READING_CSS = `
html,body{margin:0;height:100%;overflow:hidden}body{font-family:var(--reading-font,system-ui),sans-serif;color:var(--ink);background:var(--bg)}
*{box-sizing:border-box}button,a{-webkit-tap-highlight-color:transparent}button{font:inherit}a{color:var(--link)}button:focus-visible,a:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
#avagahana-reading{height:100dvh;display:flex;flex-direction:column;overflow:hidden;background:var(--bg)}
.reading-scroll{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;scroll-padding-top:72px}
.reading-intro,.reading-content{max-width:980px;margin:auto;padding:32px clamp(20px,5vw,60px)}
.reading-intro h1{font-size:clamp(30px,4.6vw,48px);line-height:1.12;letter-spacing:-1px;margin:20px 0}
.reading-intro .reading-prose{font-size:20px;line-height:1.6}.reading-map,.reading-section-kind{font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--muted)}
.reading-nav{position:sticky;top:0;z-index:2;height:46px;padding:0 8px;background:var(--frame-bg);color:var(--frame-ink);border-bottom:1px solid var(--border)}
.reading-nav-wrap{position:relative;height:100%;max-width:980px;margin:auto}.reading-nav-row{height:100%;display:flex;gap:2px;align-items:stretch;overflow-x:auto;scrollbar-width:none;overscroll-behavior-x:contain}
.reading-nav-row::-webkit-scrollbar{display:none}.reading-nav a{flex:none;display:flex;align-items:center;gap:8px;position:relative;padding:0 12px;white-space:nowrap;font-size:14px;color:var(--frame-muted);text-decoration:none}
.reading-nav a[aria-current]{color:var(--frame-ink);font-weight:600}.reading-nav a[aria-current]:after{content:'';height:2px;background:var(--frame-accent);position:absolute;bottom:0;left:12px;right:12px}
.reading-nav a span{font-size:12px;font-weight:400}.reading-nav button{position:absolute;top:10px;z-index:2;width:26px;height:26px;border:1px solid var(--frame-edge);border-radius:50%;background:var(--frame-bg);color:var(--frame-ink);padding:0;font-size:21px;line-height:20px}
.reading-nav button[hidden]{display:none}.reading-nav .reading-left{left:0}.reading-nav .reading-right{right:0}.reading-nav-wrap:before,.reading-nav-wrap:after{position:absolute;top:0;bottom:0;width:34px;z-index:1;pointer-events:none}
.reading-nav-wrap.has-left:before{content:'';left:0;background:linear-gradient(to right,var(--frame-bg),transparent)}.reading-nav-wrap.has-right:after{content:'';right:0;background:linear-gradient(to left,var(--frame-bg),transparent)}
.reading-content{padding-top:10px;padding-bottom:32px}section.reading-section{margin:38px 0 60px}h2{font-size:28px;line-height:1.2;letter-spacing:-.5px;margin:10px 0 20px}h3{font-size:19px;margin:24px 0 12px}
.reading-prose{max-width:70ch;font-size:17px;line-height:1.7}.reading-prose p{margin:12px 0}.reading-prose h4{font-size:17px;margin:22px 0 8px}.reading-prose li{margin:6px 0}.reading-prose code{font-size:.9em;overflow-wrap:anywhere}
.reading-prose .mmv-md-h4{font-size:1.18em;margin:24px 0 8px}.reading-prose .mmv-md-h5{font-size:1em;margin:20px 0 6px}.reading-prose .mmv-md-h6{font-size:.92em;margin:18px 0 6px;font-weight:600;opacity:.75}
.reading-prose .mmv-md-list .mmv-md-list{margin:4px 0}.reading-prose li.mmv-md-task{list-style:none;margin-left:-22px}.reading-prose .mmv-md-task input{margin:0 4px 0 0;accent-color:var(--accent)}
.reading-prose .mmv-md-quote{margin:14px 0;padding:1px 0 1px 14px;border-left:3px solid var(--accent);opacity:.85}.reading-prose .mmv-md-rule{border:0;border-top:1px solid currentColor;opacity:.25;margin:22px 0}
.reading-prose .mmv-md-pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:.88em;padding:10px;border:1px solid color-mix(in srgb,currentColor 20%,transparent);border-radius:4px}
.reading-prose .mmv-md-table{margin:14px 0;max-width:100%;overflow-x:auto}.reading-prose .mmv-md-table table{border-collapse:collapse;font-size:.92em}.reading-prose .mmv-md-table th,.reading-prose .mmv-md-table td{padding:5px 10px;border:1px solid color-mix(in srgb,currentColor 20%,transparent);text-align:left;vertical-align:top}.reading-prose .mmv-md-table .mmv-md-center{text-align:center}.reading-prose .mmv-md-table .mmv-md-right{text-align:right}
figure{margin:26px 0}.reading-board{position:relative;width:100%;overflow:hidden;background:var(--bg);border:1px solid var(--border);min-height:160px}.reading-board img{display:block;width:100%;height:100%;object-fit:contain;transform-origin:center;user-select:none;-webkit-user-drag:none}
.reading-board.is-panning{cursor:grab;touch-action:none}.reading-board.is-dragging{cursor:grabbing}.reading-figure-foot{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;margin-top:9px}figcaption{font-size:13px;line-height:1.5;color:var(--muted)}
.reading-controls{display:flex;gap:3px;align-items:center}.reading-controls[hidden]{display:none}.reading-controls button{min-width:32px;min-height:30px;padding:3px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--ink);font-size:14px}.reading-controls button[aria-pressed=true]{background:var(--active);color:var(--active-ink)}.reading-controls button:disabled{opacity:.45}.reading-zoom{min-width:40px;text-align:center;color:var(--muted);font-size:12px}
.reading-notes{margin-top:28px;padding-top:6px;border-top:1px solid var(--border)}.reading-notes-head{font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin:8px 0 4px}.reading-note{margin:18px 0}.reading-note h3{margin:0;font-size:17px;display:flex;gap:10px;align-items:baseline}
.reading-num{flex:none;display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--accent);color:var(--bg);font-size:12px;font-weight:700;transform:translateY(-1px)}
.reading-note-again p{margin:2px 0 0 32px;color:var(--muted);font-size:15px}
.reading-ic{width:1.1em;height:1.1em;flex:none}
.mmv-evidence.mmv-evidence-fold{margin:8px 0 0;padding:0;background:none;border:0}
.mmv-evidence-fold>summary{display:inline-flex;align-items:center;gap:6px;cursor:pointer;list-style:none;font-size:13px;font-weight:400;color:var(--muted);padding:3px 10px 3px 8px;border:1px solid var(--border);border-radius:14px;user-select:none}
.mmv-evidence-fold>summary::-webkit-details-marker{display:none}
.mmv-evidence-fold>summary:hover{color:var(--ink);border-color:var(--muted)}
.mmv-evidence-fold>summary .mmv-inline-ic{width:1.1em;height:1.1em}
.mmv-evidence-count:before{content:'· '}
.mmv-evidence-fold>summary:after{content:'▸';font-size:11px}.mmv-evidence-fold[open]>summary:after{content:'▾'}
.mmv-evidence-fold[open]{padding:10px 14px 4px;margin-top:10px;background:var(--surface);border:1px solid var(--border);border-radius:6px}
.mmv-evidence-fold[open]>summary{border:0;padding:0 0 4px;color:var(--ink)}
.mmv-evidence-fold .mmv-evidence-source{margin:6px 0}.mmv-evidence-fold .mmv-evidence-meta{font-size:12px}
.reading-key{display:grid;grid-template-columns:auto 1fr;gap:10px 12px;align-items:center;margin-top:26px;padding:14px 16px;border:1px solid var(--border);border-radius:8px;font-size:15px;line-height:1.5;color:var(--muted)}
.reading-key-ic{display:grid;place-items:center}.reading-key-ic svg{width:22px;height:22px}
.reading-sources ul{list-style:none;padding:0;font-size:15px}.reading-sources li{display:flex;flex-wrap:wrap;gap:4px 12px;padding:10px 0;border-bottom:1px solid var(--border)}.reading-sources li span,.reading-muted{color:var(--muted)}.reading-sources small{flex-basis:100%}
.reading-nav{display:flex;align-items:center;gap:8px}.reading-nav-wrap{flex:1;min-width:0}
.reading-nav .reading-evidence-all{position:static;flex:none;width:auto;height:32px;border-radius:16px;padding:0 12px;display:inline-flex;align-items:center;gap:6px;font-size:13px;line-height:1;border:1px solid var(--border);background:var(--bg);color:var(--ink)}
.reading-nav .reading-evidence-all[aria-pressed=true]{background:var(--active);color:var(--active-ink);border-color:var(--active)}
.reading-nav .reading-evidence-all[hidden]{display:none}
.reading-nav .reading-evidence-all svg{width:1.1em;height:1.1em}
.reading-section figure{width:min(1500px,calc(100vw - 48px),max(100%,var(--picture-width,0px)));position:relative;left:50%;transform:translateX(-50%)}
.reading-footer .reading-save{text-decoration:underline;margin-right:auto}
@media print{.reading-evidence-all{display:none!important}}.reading-steps{font-size:16px;line-height:1.7;padding-left:25px;max-width:72ch}.reading-steps li{margin:10px 0;padding-left:5px}.reading-warning{color:var(--warn)}
.mmv-evidence{font-size:14px;line-height:1.6;margin:18px 0;padding:16px;background:var(--surface);border:1px solid var(--border)}.mmv-evidence-head{font-weight:600}.mmv-evidence-source{margin:14px 0}.mmv-evidence-meta,.mmv-muted{color:var(--muted)}.mmv-evidence-ref{margin:10px 0}.mmv-evidence-hash{display:block;overflow-wrap:anywhere}.mmv-evidence-support p{margin:5px 0}.mmv-evidence a{overflow-wrap:anywhere}
.reading-footer{flex:none;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:4px 16px;padding:4px 12px;border-top:1px solid var(--border);background:var(--frame-bg);color:var(--frame-muted);font-size:12px;line-height:1.4}
.reading-footer a{display:inline-flex;align-items:center;gap:5px;color:inherit;text-decoration:none}.reading-footer img{height:1.2em;width:auto}.reading-footer time{white-space:nowrap}
@media(max-width:540px){.reading-intro,.reading-content{padding-left:20px;padding-right:20px}.reading-intro .reading-prose{font-size:18px}h2{font-size:24px}.reading-figure-foot{align-items:flex-start}.reading-controls button{min-width:40px;min-height:40px}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
`;
