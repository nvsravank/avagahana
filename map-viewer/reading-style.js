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
figure{margin:26px 0}.reading-board{position:relative;width:100%;overflow:hidden;background:var(--bg);border:1px solid var(--border);min-height:160px}.reading-board img{display:block;width:100%;height:100%;object-fit:contain;transform-origin:center;user-select:none;-webkit-user-drag:none}
.reading-board.is-panning{cursor:grab;touch-action:none}.reading-board.is-dragging{cursor:grabbing}.reading-figure-foot{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;margin-top:9px}figcaption{font-size:13px;line-height:1.5;color:var(--muted)}
.reading-controls{display:flex;gap:3px;align-items:center}.reading-controls[hidden]{display:none}.reading-controls button{min-width:32px;min-height:30px;padding:3px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--ink);font-size:14px}.reading-controls button[aria-pressed=true]{background:var(--active);color:var(--active-ink)}.reading-controls button:disabled{opacity:.45}.reading-zoom{min-width:40px;text-align:center;color:var(--muted);font-size:12px}
.reading-notes{margin-top:25px;padding-left:18px;border-left:3px solid var(--accent)}.reading-note{margin:18px 0}.reading-note h3{margin:0;font-size:17px}.reading-steps{font-size:16px;line-height:1.7;padding-left:25px;max-width:72ch}.reading-steps li{margin:10px 0;padding-left:5px}.reading-warning{color:var(--warn)}
.mmv-evidence{font-size:14px;line-height:1.6;margin:18px 0;padding:16px;background:var(--surface);border:1px solid var(--border)}.mmv-evidence-head{font-weight:600}.mmv-evidence-source{margin:14px 0}.mmv-evidence-meta,.mmv-muted{color:var(--muted)}.mmv-evidence-ref{margin:10px 0}.mmv-evidence-hash{display:block;overflow-wrap:anywhere}.mmv-evidence-support p{margin:5px 0}.mmv-evidence a{overflow-wrap:anywhere}
.reading-footer{flex:none;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:4px 16px;padding:4px 12px;border-top:1px solid var(--border);background:var(--frame-bg);color:var(--frame-muted);font-size:12px;line-height:1.4}
.reading-footer a{display:inline-flex;align-items:center;gap:5px;color:inherit;text-decoration:none}.reading-footer img{height:1.2em;width:auto}.reading-footer time{white-space:nowrap}
@media(max-width:540px){.reading-intro,.reading-content{padding-left:20px;padding-right:20px}.reading-intro .reading-prose{font-size:18px}h2{font-size:24px}.reading-figure-foot{align-items:flex-start}.reading-controls button{min-width:40px;min-height:40px}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
`;
