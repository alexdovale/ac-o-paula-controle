// js/rcDesign.js - DESIGN SYSTEM COMPARTILHADO DA RECEPÇÃO (CSS + ÍCONES)

// ─── DESIGN SYSTEM (CSS INJETADO UMA ÚNICA VEZ) ────────────────────────────────

const CSS = `
.rc-wrap{
    --rc-bg:#f6f7f9; --rc-surface:#fff; --rc-line:#e5e7eb; --rc-line-soft:#f0f1f4;
    --rc-text:#0f172a; --rc-muted:#64748b; --rc-faint:#94a3b8;
    --rc-brand:#1e3a8a; --rc-brand-soft:#eef2ff;
    --rc-ok:#059669; --rc-ok-soft:#ecfdf5;
    --rc-warn:#b45309; --rc-warn-soft:#fffbeb;
    --rc-info:#1d4ed8; --rc-info-soft:#eff6ff;
    --rc-danger:#be123c; --rc-danger-soft:#fff1f2;
    font-feature-settings:"tnum" 1,"cv11" 1; color:var(--rc-text);
}
.rc-wrap *{box-sizing:border-box}
.rc-surface{background:var(--rc-surface);border:1px solid var(--rc-line);border-radius:14px}
.rc-eyebrow{font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--rc-faint)}
.rc-label{display:block;font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--rc-muted);margin-bottom:6px}

/* Botões */
.rc-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;font-size:13px;font-weight:600;
    padding:9px 14px;border-radius:10px;border:1px solid var(--rc-line);background:var(--rc-surface);color:var(--rc-text);
    cursor:pointer;transition:background .15s,border-color .15s,box-shadow .15s,transform .05s;white-space:nowrap}
.rc-btn:hover{background:#f8fafc;border-color:#cbd5e1}
.rc-btn:active{transform:translateY(1px)}
.rc-btn:focus-visible,.rc-input:focus-visible,.rc-chip:focus-visible{outline:2px solid var(--rc-brand);outline-offset:2px}
.rc-btn:disabled{opacity:.6;cursor:not-allowed}
.rc-btn--primary{background:var(--rc-brand);border-color:var(--rc-brand);color:#fff}
.rc-btn--primary:hover{background:#172f72;border-color:#172f72}
.rc-btn--dark{background:#0f172a;border-color:#0f172a;color:#fff}
.rc-btn--dark:hover{background:#1e293b;border-color:#1e293b}
.rc-btn--ok{background:var(--rc-ok);border-color:var(--rc-ok);color:#fff}
.rc-btn--ok:hover{background:#047857;border-color:#047857}
.rc-btn--warn{background:var(--rc-warn-soft);border-color:#fcd34d;color:var(--rc-warn)}
.rc-btn--warn:hover{background:#fef3c7;border-color:#f59e0b}
.rc-btn--danger{background:var(--rc-danger);border-color:var(--rc-danger);color:#fff}
.rc-btn--danger:hover{background:#9f1239;border-color:#9f1239}
.rc-btn--ghost{border-color:transparent;background:transparent;color:var(--rc-muted)}
.rc-btn--ghost:hover{background:#f1f5f9;color:var(--rc-text);border-color:transparent}
.rc-btn--sm{padding:6px 10px;font-size:12px;border-radius:8px}
.rc-btn--icon{padding:0;width:36px;height:36px}
.rc-btn--block{width:100%}

/* Inputs */
.rc-input{width:100%;background:var(--rc-surface);border:1px solid var(--rc-line);border-radius:10px;padding:10px 12px;
    font-size:14px;color:var(--rc-text);transition:border-color .15s,box-shadow .15s}
.rc-input:focus{outline:none;border-color:var(--rc-brand);box-shadow:0 0 0 3px rgba(30,58,138,.12)}
.rc-input::placeholder{color:var(--rc-faint)}

/* Badges e dots */
.rc-badge{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;border:1px solid var(--rc-line);background:#f8fafc;color:var(--rc-muted)}
.rc-badge--ok{background:var(--rc-ok-soft);color:var(--rc-ok);border-color:#a7f3d0}
.rc-badge--warn{background:var(--rc-warn-soft);color:var(--rc-warn);border-color:#fde68a}
.rc-badge--info{background:var(--rc-info-soft);color:var(--rc-info);border-color:#bfdbfe}
.rc-badge--danger{background:var(--rc-danger-soft);color:var(--rc-danger);border-color:#fecdd3}
.rc-badge--cyan{background:#ecfeff;color:#0e7490;border-color:#a5f3fc}
.rc-badge--mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10.5px;font-weight:500}
.rc-dot{width:8px;height:8px;border-radius:999px;display:inline-block;flex-shrink:0}

/* Cards de pauta */
.rc-pauta{display:flex;flex-direction:column;transition:box-shadow .2s,border-color .2s}
.rc-pauta:hover{border-color:#cbd5e1;box-shadow:0 8px 24px -12px rgba(15,23,42,.18)}
.rc-progress{height:4px;background:var(--rc-line-soft);border-radius:999px;overflow:hidden}
.rc-progress>span{display:block;height:100%;background:var(--rc-brand);border-radius:999px;transition:width .6s ease}
.rc-metric{flex:1;text-align:center;padding:12px 4px}
.rc-metric+.rc-metric{border-left:1px solid var(--rc-line-soft)}
.rc-metric b{display:block;font-size:20px;font-weight:800;line-height:1}
.rc-metric span{display:block;margin-top:5px;font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--rc-faint)}

/* Pílulas */
.rc-pill{display:inline-flex;align-items:center;gap:8px;padding:7px 14px;border-radius:999px;background:var(--rc-surface);border:1px solid var(--rc-line);font-size:12px;color:var(--rc-muted);font-weight:600}
.rc-pill b{font-size:14px;color:var(--rc-text);font-weight:800}

/* Segmentado (filtros) */
.rc-seg{display:inline-flex;gap:2px;padding:3px;background:#eceff3;border-radius:11px;overflow-x:auto;max-width:100%}
.rc-seg button{border:0;background:transparent;font-size:12.5px;font-weight:600;color:var(--rc-muted);padding:7px 13px;border-radius:8px;cursor:pointer;white-space:nowrap;transition:all .15s}
.rc-seg button:hover{color:var(--rc-text)}
.rc-seg button.is-active{background:var(--rc-surface);color:var(--rc-text);box-shadow:0 1px 2px rgba(15,23,42,.1)}

/* Kanban */
.rc-col{display:flex;flex-direction:column;min-height:0;background:var(--rc-bg)}
.rc-col-head{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:var(--rc-surface);border-bottom:1px solid var(--rc-line)}
.rc-col-title{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--rc-muted)}
.rc-count{font-size:11px;font-weight:700;padding:1px 8px;border-radius:999px;background:#eceff3;color:var(--rc-muted)}
.rc-person{background:var(--rc-surface);border:1px solid var(--rc-line);border-radius:12px;padding:12px;transition:border-color .15s,box-shadow .15s}
.rc-person:hover{border-color:#cbd5e1;box-shadow:0 2px 8px -4px rgba(15,23,42,.15)}
.rc-person--prio{border-color:#fecdd3;background:linear-gradient(0deg,#fff,#fff 60%,#fff7f8)}
.rc-person-actions{display:flex;justify-content:space-between;align-items:center;gap:6px;margin-top:10px;padding-top:10px;border-top:1px solid var(--rc-line-soft)}
.rc-rank{width:24px;height:24px;border-radius:8px;background:var(--rc-warn-soft);color:var(--rc-warn);font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0}

/* Modais */
.rc-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.55);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:16px;animation:rcFade .15s ease}
.rc-modal{background:var(--rc-surface);width:100%;border-radius:18px;box-shadow:0 24px 60px -12px rgba(15,23,42,.4);display:flex;flex-direction:column;max-height:92vh;overflow:hidden;animation:rcPop .18s ease;color:var(--rc-text)}
.rc-modal-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:20px 24px 16px;border-bottom:1px solid var(--rc-line)}
.rc-modal-head h3{font-size:17px;font-weight:800;letter-spacing:-.01em;line-height:1.2}
.rc-modal-head p{font-size:12.5px;color:var(--rc-muted);margin-top:3px}
.rc-modal-body{padding:20px 24px;overflow-y:auto;flex:1;background:#fbfbfc}
.rc-modal-foot{display:flex;gap:10px;padding:16px 24px;border-top:1px solid var(--rc-line);background:var(--rc-surface)}
.rc-modal-foot>*{flex:1}
.rc-option{display:flex;align-items:center;gap:10px;padding:12px;border:1px solid var(--rc-line);border-radius:12px;background:var(--rc-surface);cursor:pointer;transition:all .15s;font-size:13px;font-weight:600}
.rc-option:hover{border-color:#cbd5e1}
.rc-option.is-selected{border-color:var(--rc-brand);background:var(--rc-brand-soft);box-shadow:0 0 0 1px var(--rc-brand)}
.rc-chip{border:1px solid var(--rc-line);background:var(--rc-surface);border-radius:10px;padding:10px 8px;font-size:12.5px;font-weight:600;color:var(--rc-muted);cursor:pointer;transition:all .15s}
.rc-chip:hover{border-color:#fda4af}
.rc-chip.selected{background:var(--rc-danger-soft);border-color:#f43f5e;color:var(--rc-danger)}

/* Utilitários */
.rc-skeleton{background:linear-gradient(90deg,#eceff3 25%,#f6f7f9 37%,#eceff3 63%);background-size:400% 100%;animation:rcShimmer 1.3s ease infinite;border-radius:14px}
.rc-empty{text-align:center;padding:56px 24px;border:1px dashed #cbd5e1;border-radius:16px;background:#fff}
.rc-scroll{overflow-y:auto;scrollbar-width:thin}
@keyframes rcFade{from{opacity:0}to{opacity:1}}
@keyframes rcPop{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}
@keyframes rcShimmer{0%{background-position:100% 50%}100%{background-position:0 50%}}
@media (prefers-reduced-motion:reduce){.rc-wrap *,.rc-backdrop,.rc-modal{animation:none!important;transition:none!important}}
`;


const CSS_EXTRA = `
/* Seletor de recepções */
.rc-sel-card{position:relative;display:flex;gap:12px;align-items:flex-start;width:100%;text-align:left;padding:14px 14px 14px 18px;
    background:var(--rc-surface);border:1px solid var(--rc-line);border-radius:14px;cursor:pointer;overflow:hidden;
    transition:border-color .15s,box-shadow .15s,transform .1s}
.rc-sel-card::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--c,#64748b)}
.rc-sel-card:hover{border-color:var(--c,#64748b);box-shadow:0 8px 22px -12px rgba(15,23,42,.25);transform:translateY(-1px)}
.rc-sel-card:focus-visible{outline:2px solid var(--rc-brand);outline-offset:2px}
.rc-tile{width:42px;height:42px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:21px;flex-shrink:0;background:var(--tint,#f1f5f9);border:1px solid var(--line,#e2e8f0)}
.rc-group-toggle{width:100%;display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:transparent;border:0;border-bottom:1px solid var(--rc-line);cursor:pointer;color:var(--rc-muted)}
.rc-group-toggle:hover{color:var(--rc-text)}
.rc-group-toggle .rc-chevron{transition:transform .2s}

/* Tabela admin */
.rc-table{width:100%;border-collapse:collapse;text-align:left}
.rc-table th{padding:10px 14px;font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--rc-faint);background:#fafbfc;border-bottom:1px solid var(--rc-line)}
.rc-table td{padding:12px 14px;border-bottom:1px solid var(--rc-line-soft);vertical-align:middle}
.rc-table tbody tr:hover{background:#fafbfc}
.rc-table tbody tr:last-child td{border-bottom:0}

/* Formulário */
.rc-form-section{padding-top:20px;margin-top:4px;border-top:1px solid var(--rc-line)}
.rc-tag{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;padding:4px 6px 4px 10px;border-radius:999px;background:var(--rc-brand-soft);color:var(--rc-brand);border:1px solid #c7d2fe}
.rc-tag button{border:0;background:transparent;color:inherit;opacity:.6;cursor:pointer;width:18px;height:18px;border-radius:999px;display:flex;align-items:center;justify-content:center}
.rc-tag button:hover{opacity:1;background:rgba(190,18,60,.12);color:var(--rc-danger)}
.rc-swatch{width:30px;height:30px;border-radius:999px;border:2px solid #fff;box-shadow:0 0 0 1px var(--rc-line);cursor:pointer;transition:transform .12s,box-shadow .12s}
.rc-swatch:hover{transform:scale(1.1)}
.rc-swatch.is-selected{box-shadow:0 0 0 2px var(--rc-text)}
.rc-icon-opt{width:44px;height:44px;font-size:21px;border-radius:11px;border:1px solid var(--rc-line);background:var(--rc-surface);cursor:pointer;transition:all .12s}
.rc-icon-opt:hover{border-color:#cbd5e1;background:#f8fafc}
.rc-icon-opt.is-selected{border-color:var(--rc-brand);background:var(--rc-brand-soft);box-shadow:0 0 0 1px var(--rc-brand)}
.rc-unit-list{max-height:232px;overflow-y:auto;border:1px solid var(--rc-line);border-radius:12px;background:#fafbfc;padding:6px;scrollbar-width:thin}
.rc-unit-item{display:flex;gap:10px;align-items:flex-start;padding:9px 10px;border-radius:9px;cursor:pointer;border:1px solid transparent}
.rc-unit-item:hover{background:var(--rc-brand-soft);border-color:#c7d2fe}
.rc-callout{display:flex;gap:12px;align-items:flex-start;padding:12px 14px;border-radius:12px;background:var(--rc-warn-soft);border:1px solid #fde68a}
`;

export function injetarEstilos() {
    if (document.getElementById('rc-styles')) return;
    const style = document.createElement('style');
    style.id = 'rc-styles';
    style.textContent = CSS + CSS_EXTRA;
    document.head.appendChild(style);
}

// ─── ÍCONES (SVG INLINE, SEM EMOJIS) ───────────────────────────────────────────

const ICONS = {
    back:     'M10 19l-7-7m0 0l7-7m-7 7h18',
    arrow:    'M14 5l7 7m0 0l-7 7m7-7H3',
    search:   'M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z',
    check:    'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
    megaphone:'M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z',
    tv:       'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
    refresh:  'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
    plus:     'M12 4v16m8-8H4',
    swap:     'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4',
    star:     'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z',
    x:        'M6 18L18 6M6 6l12 12',
    lock:     'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4',
    clock:    'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
    user:     'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
    folder:   'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z',
    undo:     'M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6',
    scale:    'M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6-2l3 1m-3-1l-3 9a5.002 5.002 0 006.001 0M18 5l3 9m-3-9l-6 2m0-2v2m0 16V7m0 0L9 7',
    list:     'M4 6h16M4 12h16M4 18h7',
};

export const ico = (name, size = 16, extra = '') =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}><path d="${ICONS[name] || ''}"/></svg>`;

Object.assign(ICONS, {
    edit:'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
    link:'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1',
    trash:'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
    pin:'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z',
    chevron:'M19 9l-7 7-7-7',
    volume:'M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z',
    volumeOff:'M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l4-4m0 4l-4-4',
    building:'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
    video:'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z',
});

