// js/painelPublico.js - PAINEL PÚBLICO (FILA · TV · TV + VÍDEO) · UI PROFISSIONAL

import { doc, getDoc, onSnapshot, collection } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const LOGO = "https://firebasestorage.googleapis.com/v0/b/pauta-ce162.firebasestorage.app/o/logo_sigep.png?alt=media&token=b067528b-df81-4fbf-bc22-0d2b01acbbe6";

const ICONS = {
    list:  'M4 6h16M4 12h16M4 18h7',
    tv:    'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
    video: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z',
    on:    'M11 5L6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13',
    off:   'M11 5L6 9H2v6h4l5 4V5zM22 9l-6 6M16 9l6 6',
    play:  'M8 5v14l11-7z',
};
const svg = (n, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[n]}"/></svg>`;

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
:root{--bg:#f3f4f6;--surface:#fff;--line:#e2e5ea;--soft:#f1f3f6;--text:#0f172a;--muted:#64748b;--faint:#94a3b8;--navy:#0b1220;--navy2:#111a2e;--amber:#f59e0b;--ok:#16a34a;--ok2:#15803d;--info:#2563eb;
--fs-xs:clamp(10px,1vw,12px);--fs-sm:clamp(12px,1.2vw,14px);--fs-md:clamp(14px,1.5vw,17px);--fs-lg:clamp(17px,2vw,24px);--fs-xl:clamp(22px,2.8vw,34px);--fs-hero:clamp(36px,5.5vw,72px)}
*{box-sizing:border-box}
html,body{height:100%;margin:0}
body{font-family:'Inter',system-ui,sans-serif;background:var(--bg);color:var(--text);font-feature-settings:"tnum" 1,"cv11" 1;-webkit-font-smoothing:antialiased;overflow:hidden}
.hidden{display:none!important}
::-webkit-scrollbar{width:6px}::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:9px}
button{font-family:inherit}

/* Desbloqueio de áudio / carregamento */
#unlock-audio-overlay{position:fixed;inset:0;z-index:10000;background:var(--navy);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;text-align:center;padding:24px;transition:opacity .5s}
#unlock-audio-overlay h1{font-size:var(--fs-xl);font-weight:800;letter-spacing:-.02em;margin:8px 0 0}
#unlock-audio-overlay p{max-width:460px;color:#94a3b8;font-size:var(--fs-md);line-height:1.5;margin:0}
#btn-unlock-audio{display:flex;align-items:center;gap:10px;background:var(--ok);color:#fff;border:0;border-radius:12px;padding:16px 32px;font-size:var(--fs-md);font-weight:700;cursor:pointer;margin-top:10px}
#btn-unlock-audio:hover{background:var(--ok2)}
#loading{position:fixed;inset:0;z-index:50;background:var(--bg);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px}
.spinner{width:40px;height:40px;border-radius:50%;border:3px solid var(--line);border-top-color:var(--navy);animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.eyebrow{font-size:var(--fs-xs);font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--faint)}

/* Controles que aparecem ao mover o mouse */
#area-controles{position:fixed;inset:0;z-index:9999;pointer-events:none}
#controles-wrap{opacity:0;transition:opacity .4s;pointer-events:none}
#area-controles.ativo #controles-wrap{opacity:1}
#area-controles.ativo #controles-wrap>*{pointer-events:auto}
.glass{background:rgba(255,255,255,.95);border:1px solid var(--line);border-radius:14px;box-shadow:0 10px 34px -10px rgba(15,23,42,.35);backdrop-filter:blur(10px)}
#seletor-modo{position:absolute;bottom:22px;left:50%;transform:translateX(-50%);display:flex;gap:4px;padding:5px}
.btn-modo{display:flex;align-items:center;gap:8px;padding:9px 16px;border:0;border-radius:10px;background:transparent;color:var(--muted);font-size:12px;font-weight:600;cursor:pointer}
.btn-modo:hover{background:var(--soft);color:var(--text)}
.btn-modo.ativo{background:var(--navy);color:#fff}
#btn-som-fixo{position:absolute;top:20px;right:20px;display:flex;align-items:center;gap:8px;padding:9px 14px;font-size:12px;font-weight:600;color:var(--muted);cursor:pointer}
#btn-som-fixo.on{color:var(--ok2);border-color:#86efac;background:#f0fdf4}
#zoom-controls{position:absolute;bottom:22px;right:20px;display:flex;align-items:center;gap:6px;padding:6px}
#zoom-controls button{width:32px;height:32px;border:0;border-radius:8px;background:var(--soft);font-weight:800;font-size:16px;cursor:pointer}
#zoom-level{min-width:46px;text-align:center;font-size:12px;font-weight:700;color:var(--muted)}

/* ========== FILA ========== */
#modo-fila{height:100%;overflow-y:auto;flex-direction:column}
.topbar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px;background:var(--surface);border-bottom:1px solid var(--line);padding:12px clamp(16px,2.4vw,36px)}
.brand{display:flex;align-items:center;gap:16px;min-width:0}
.lg{display:inline-flex;flex-direction:column;align-items:center;gap:5px}
.lg-box{display:flex;align-items:center;justify-content:center;background:var(--navy);border-radius:10px;padding:8px 12px}
.lg-box img{height:var(--lg-h,30px);max-width:min(var(--lg-w,420px),60vw);width:auto;object-fit:contain;display:block}
.lg.custom .lg-box{background:#fff;border:1px solid var(--line)}
.lg-credit{font-size:clamp(9px,.9vw,12px);font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:var(--faint);white-space:nowrap}
.brand-txt{padding-left:16px;border-left:1px solid var(--line)}
.brand-txt h1{margin:0;font-size:var(--fs-md);font-weight:700;letter-spacing:-.01em}
.brand-txt h2{margin:2px 0 0;font-size:var(--fs-sm);font-weight:500;color:var(--muted)}
.metrics{display:flex;align-items:stretch;flex-wrap:wrap}
.metric{padding:2px clamp(14px,2vw,28px);border-left:1px solid var(--line)}
.metric small{display:block;font-size:var(--fs-xs);font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--faint)}
.metric b{display:block;margin-top:3px;font-size:var(--fs-xl);font-weight:700;line-height:1;letter-spacing:-.02em}
.tools{padding-left:clamp(14px,2vw,28px);border-left:1px solid var(--line)}
.live{display:flex;align-items:center;gap:7px;font-size:var(--fs-xs);font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.dot{width:7px;height:7px;border-radius:50%;background:#22c55e}
.clock{font-size:var(--fs-sm);font-weight:600;line-height:1.25}
.page{display:flex;flex-direction:column;gap:clamp(12px,1.4vw,20px);padding:clamp(12px,1.8vw,28px) clamp(16px,2.4vw,36px);max-width:1760px;margin:0 auto;width:100%;min-height:calc(100% - 70px)}
.call{display:grid;grid-template-columns:minmax(0,1fr) auto;background:var(--navy);color:#fff;border-radius:12px;overflow:hidden;border:1px solid #1e293b}
.call-main{padding:clamp(18px,2.4vw,34px) clamp(22px,3vw,48px);min-width:0}
.call-label{display:flex;align-items:center;gap:12px;font-size:var(--fs-xs);font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:#94a3b8}
.call-label::before{content:"";width:28px;height:2px;background:var(--amber)}
.call-name{margin:12px 0 0;font-size:clamp(40px,7vw,96px);font-weight:900;letter-spacing:-.025em;line-height:1.05;text-transform:uppercase;overflow-wrap:anywhere}
.call-info{display:flex;border-left:1px solid rgba(255,255,255,.1)}
.call-field{padding:clamp(18px,2.4vw,34px) clamp(18px,2.4vw,40px);display:flex;flex-direction:column;justify-content:center;min-width:clamp(120px,14vw,220px);max-width:clamp(180px,26vw,420px)}
.call-field+.call-field{border-left:1px solid rgba(255,255,255,.1)}
.call-field small{font-size:var(--fs-xs);font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#64748b}
.call-field b{margin-top:8px;font-size:var(--fs-xl);font-weight:800;line-height:1.2;overflow-wrap:anywhere}
.anim-in{animation:enter .5s cubic-bezier(.22,1,.36,1)}
@keyframes enter{from{opacity:.2;transform:translateY(-8px)}to{opacity:1;transform:none}}
.cols{display:grid;grid-template-columns:minmax(320px,1fr) minmax(0,1.7fr);gap:clamp(12px,1.4vw,20px);flex:1;min-height:380px}
.panel{display:flex;flex-direction:column;min-height:0;background:var(--surface);border:1px solid var(--line);border-radius:12px;overflow:hidden}
.panel-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 20px;border-bottom:1px solid var(--line)}
.panel-head h3{margin:0;font-size:var(--fs-sm);font-weight:700;letter-spacing:.1em;text-transform:uppercase}
.panel-head span{font-size:var(--fs-xs);font-weight:600;color:var(--muted);background:var(--soft);padding:3px 10px;border-radius:6px}
.th,.row{display:grid;align-items:center;gap:14px;padding:0 20px}
.th{padding-top:9px;padding-bottom:9px;background:#f8fafc;border-bottom:1px solid var(--line);font-size:var(--fs-xs);font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--faint)}
.g-fila{grid-template-columns:clamp(44px,4vw,64px) minmax(0,1fr) clamp(80px,8vw,120px) clamp(100px,10vw,140px)}
.g-atend{grid-template-columns:minmax(0,1.5fr) minmax(0,1fr) clamp(80px,8vw,120px)}
.g-atend>*,.g-fila>*{min-width:0}
.panel-body{flex:1;overflow-y:auto}
.group-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 20px;background:#f8fafc;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.panel-body>.group-head:first-child{border-top:0}
.group-head b{display:flex;align-items:center;gap:10px;min-width:0;font-size:var(--fs-sm);font-weight:700;letter-spacing:.05em;text-transform:uppercase}
.group-head b::before{content:"";width:8px;height:8px;border-radius:2px;background:var(--u);flex-shrink:0}
.group-head b span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.group-head small{font-size:var(--fs-xs);color:var(--muted);white-space:nowrap}
.row{min-height:clamp(60px,6vw,88px);padding-top:8px;padding-bottom:8px;border-bottom:1px solid var(--soft);animation:fade .3s ease-out both}
@keyframes fade{from{opacity:0}to{opacity:1}}
.row.next{background:linear-gradient(90deg,#fffbeb,#fff 60%)}
.pos{font-size:clamp(16px,1.8vw,24px);font-weight:800;color:var(--faint)}
.row.next .pos{color:#b45309}.row.prio .pos{color:#be123c}
.nome{margin:0;min-width:0;font-weight:800;text-transform:uppercase;letter-spacing:.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:clamp(20px,2.4vw,34px)}
.g-atend .nome{font-size:clamp(20px,2.4vw,34px)}
.sub{margin:3px 0 0;font-size:var(--fs-xs);font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.num{font-size:clamp(14px,1.5vw,20px);font-weight:600;color:var(--muted);white-space:nowrap}
.g-atend .num:last-child{text-align:right}
.tag{justify-self:end;font-size:var(--fs-xs);font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:3px 9px;border-radius:5px;white-space:nowrap}
.tag.prio{color:#9f1239;background:#fff1f2;border:1px solid #fecdd3}
.tag.sala{justify-self:start;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;max-width:100%;white-space:normal;overflow-wrap:anywhere;line-height:1.2;font-size:clamp(12px,1.4vw,19px);padding:5px 10px;color:#334155;background:var(--soft);border:1px solid var(--line)}
.next-flag{margin:3px 0 0;font-size:var(--fs-xs);font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#b45309}
.empty{padding:48px 16px;text-align:center;color:var(--faint);font-size:var(--fs-sm);font-weight:500}

/* ========== TV ========== */
#modo-tv{position:fixed;inset:0;height:100dvh;display:grid;grid-template-columns:minmax(0,3fr) minmax(300px,2fr);background:var(--navy);overflow:hidden}
#destaque{position:relative;display:grid;grid-template-rows:auto minmax(0,1fr) auto;row-gap:2.5vh;align-items:center;justify-items:center;text-align:center;color:#fff;padding:5vh 4vw;min-width:0;min-height:0;background:linear-gradient(160deg,#16a34a,#14532d)}
#destaque::before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at 30% 10%,rgba(255,255,255,.14),transparent 55%);pointer-events:none}
#destaque>*{position:relative}
.tv-label{font-size:clamp(14px,2vw,32px);font-weight:600;letter-spacing:.3em;text-transform:uppercase;opacity:.85}
#uc-nome-tv{width:100%;height:100%;display:flex;align-items:center;justify-content:center;overflow:hidden;font-size:9rem;font-weight:900;line-height:1.05;letter-spacing:-.02em;text-transform:uppercase;overflow-wrap:anywhere;text-wrap:balance;text-shadow:0 4px 24px rgba(0,0,0,.25)}
.tv-local{display:flex;flex-direction:column;align-items:center;gap:1.2vh;max-width:100%}
#uc-local-tv{max-width:100%;font-size:5rem;font-weight:900;line-height:1.05;letter-spacing:-.02em;text-transform:uppercase;background:rgba(255,255,255,.14);border:2px solid rgba(255,255,255,.3);border-radius:22px;padding:.2em .7em;overflow-wrap:anywhere}
#destaque.flash{animation:flash .7s ease 3}
@keyframes flash{50%{filter:brightness(1.25)}}
#lateral{display:flex;flex-direction:column;background:#fff;min-width:0;min-height:0}
#lateral h3{margin:0;padding:clamp(18px,2.4vw,36px) 24px 14px;text-align:center;font-size:clamp(14px,1.6vw,24px);font-weight:800;letter-spacing:.2em;text-transform:uppercase;color:var(--ok2)}
.hist-head{display:flex;justify-content:space-between;margin:0 24px 6px;padding-bottom:8px;border-bottom:2px solid var(--soft);font-size:var(--fs-xs);font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--faint)}
.hist-list{flex:1;min-height:0;overflow:hidden;padding:8px 20px;display:flex;flex-direction:column;gap:10px}
.item-hist{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:clamp(10px,1.4vw,18px) clamp(12px,1.6vw,20px);border-radius:14px;background:var(--bg);border:1px solid var(--line);animation:inleft .4s ease-out both}
@keyframes inleft{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:none}}
.item-hist span:first-child{flex:1;min-width:0;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;font-size:clamp(20px,2.6vw,38px);font-weight:800;line-height:1.15;text-transform:uppercase;color:#1e293b}
.item-hist span:last-child{white-space:nowrap;font-size:clamp(16px,2vw,30px);font-weight:900;color:var(--ok2)}
.tv-foot{display:flex;flex-direction:column;align-items:center;gap:6px;padding:clamp(14px,2vw,26px);background:var(--navy);color:#fff}
.tv-clock{font-size:clamp(18px,2.2vw,34px);font-weight:800;letter-spacing:.06em}
.tv-rec{font-size:var(--fs-xs);font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:#94a3b8;text-align:center}

/* ========== TV + VÍDEO ========== */
#modo-video{position:fixed;inset:0;height:100dvh;display:flex;background:#000}
#coluna-midia{flex:1;min-width:0;display:flex;flex-direction:column;background:#000}
#video-container{flex:1 1 0;min-height:60vh;position:relative;overflow:hidden;pointer-events:none}
#video-placeholder{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:var(--navy);color:#64748b;text-align:center;padding:24px}
#video-placeholder b{color:#fff;font-size:var(--fs-lg);font-weight:700}
#video-embed{position:absolute;inset:0}
#video-embed iframe{position:absolute;top:-10%;left:-10%;width:120%;height:120%;border:0}
#video-embed video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
#banner-chamado{flex:0 0 auto;max-height:40vh;overflow:hidden;display:flex;align-items:center;justify-content:space-between;gap:28px;background:linear-gradient(90deg,#16a34a,#14532d);color:#fff;padding:clamp(12px,2vh,28px) clamp(24px,3.4vw,64px);border-top:4px solid #86efac}
#banner-chamado .b-main{flex:1;min-width:0}
#banner-chamado small{display:block;font-size:clamp(13px,1.5vw,24px);font-weight:700;letter-spacing:.2em;text-transform:uppercase;opacity:.85}
#banner-label-local{font-size:clamp(10px,1vw,15px)!important;letter-spacing:.1em!important;line-height:1.2}
#banner-nome{display:block;max-height:17vh;overflow:hidden;margin-top:4px;font-size:6rem;font-weight:900;line-height:1.05;letter-spacing:-.02em;text-transform:uppercase;overflow-wrap:anywhere}
.b-local{flex:0 0 auto;min-width:16vw;max-width:34%;text-align:right;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.3);border-radius:18px;padding:clamp(10px,1.6vh,22px) clamp(16px,2vw,32px)}
#banner-local{display:block;margin-top:4px;font-size:3rem;font-weight:900;line-height:1.05;text-transform:uppercase;overflow-wrap:normal;word-break:normal}
.banner-anim{animation:flash .7s ease 3}
#faixa-video{width:clamp(300px,30vw,460px);flex-shrink:0;display:flex;flex-direction:column;min-height:0;background:#fff;border-left:1px solid var(--line)}
.fv-head{padding:20px;border-bottom:1px solid var(--line);background:#f8fafc;flex-shrink:0}
.fv-logo{display:flex;justify-content:center;margin-bottom:12px}
.fv-rec{margin:0 0 14px;text-align:center;font-size:var(--fs-xs);font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.fv-stats{display:flex;gap:10px}
.fv-stat{flex:1;background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px;text-align:center}
.fv-stat b{display:block;font-size:clamp(22px,3vw,30px);font-weight:800;line-height:1}
.fv-stat span{display:block;margin-top:4px;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--faint)}
#video-ultimo-chamado{flex-shrink:0;padding:14px 20px;background:#f0fdf4;border-bottom:3px solid #4ade80}
#video-ultimo-chamado small{display:block;font-size:10px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--ok)}
#video-uc-nome{margin:6px 0 0;font-size:clamp(20px,2.4vw,34px);font-weight:800;color:#064e3b;text-transform:uppercase;line-height:1.15;overflow-wrap:anywhere}
#video-uc-local{display:inline-block;margin-top:8px;font-size:clamp(14px,1.4vw,20px);font-weight:700;color:var(--ok2);background:#dcfce7;padding:4px 10px;border-radius:6px;text-transform:uppercase}
.fv-title{padding:16px 20px 6px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);flex-shrink:0}
#lista-historico-video{flex:1;min-height:0;overflow-y:auto;padding:4px 20px 16px;display:flex;flex-direction:column;gap:8px}
.fv-item{display:flex;justify-content:space-between;align-items:center;gap:8px;background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px 12px}
.fv-item span:first-child{flex:1;min-width:0;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;font-size:clamp(15px,1.5vw,22px);font-weight:800;line-height:1.15;text-transform:uppercase}
.fv-item span:last-child{flex-shrink:0;font-size:clamp(12px,1.2vw,16px);font-weight:800;color:#047857;background:#ecfdf5;padding:4px 9px;border-radius:6px}
.fv-foot{flex-shrink:0;padding:16px 20px;border-top:1px solid var(--line);background:#f8fafc;text-align:center}
.fv-foot .tv-clock{font-size:clamp(16px,1.8vw,22px);color:var(--text)}

@media (max-width:900px){.call{grid-template-columns:1fr}.call-info{border-left:0;border-top:1px solid rgba(255,255,255,.1)}.call-field{flex:1;max-width:none}.cols{grid-template-columns:1fr}.tools,.metric{border-left:0}#modo-tv{grid-template-columns:1fr;grid-template-rows:3fr 2fr}#modo-video{flex-direction:column}#faixa-video{width:100%;max-height:40%}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
`;

// ── Helpers de "local" (rótulo configurável + valor) ───────────────────────────
const ARTIGO = { 'sala': 'à', 'recepção': 'à', 'recepcao': 'à', 'vara': 'à', 'mesa': 'à', 'guichê': 'ao', 'guiche': 'ao', 'balcão': 'ao', 'balcao': 'ao', 'gabinete': 'ao', 'cartório': 'ao', 'cartorio': 'ao' };

function localDe(c) {
    // Dados novos (enviados pela Recepção Central com rótulo escolhido)
    if (c && c.rotuloLocal !== undefined) {
        const valor = c.sala || '';
        const rotulo = c.rotuloLocal || (valor ? 'Local' : '');
        return { rotulo: rotulo || 'Local', valor: valor || c.local || '—' };
    }
    // Dados antigos
    return { rotulo: c?.sala ? 'Sala' : 'Local', valor: c?.sala || c?.local || '—' };
}
function textoLocal(c) {
    const { rotulo, valor } = localDe(c);
    return valor.toLowerCase().startsWith(rotulo.toLowerCase()) ? valor : `${rotulo} ${valor}`.trim();
}
function fraseVoz(c) {
    const { rotulo, valor } = localDe(c);
    const texto = textoLocal(c);
    const art = ARTIGO[rotulo.toLowerCase()];
    const destino = (art && valor !== '—') ? `${art} ${texto}` : `para ${valor !== '—' ? texto : 'a recepção'}`;
    return `Atenção, assistido ${c.nome}. Por favor, dirija-se ${destino}.`;
}

export const PainelPublicoService = {
    async init(app) {
        const params = new URLSearchParams(window.location.search);
        const pautasParam = params.get('pautas');
        const recepcaoNome = params.get('nome') || 'Recepção Geral';
        let initialModo = params.get('modo') || 'fila';
        if (!['fila', 'tv', 'video'].includes(initialModo)) initialModo = 'fila';
        const videoUrl = params.get('video') || '';
        const somParam = params.get('som');

        document.body.innerHTML = '';
        document.body.className = '';
        const style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);

        document.body.innerHTML = `
            <div id="unlock-audio-overlay">
                <div class="lg" data-slot style="--lg-h:64px"></div>
                <h1>Painel de Atendimento</h1>
                <p>Para que os alertas sonoros e a chamada por voz funcionem, o navegador exige uma interação. Clique abaixo para iniciar.</p>
                <button id="btn-unlock-audio">${svg('play', 18)} Iniciar painel e ativar som</button>
            </div>

            <div id="loading" class="hidden"><div class="spinner"></div><p class="eyebrow">Conectando ao SIGEP</p></div>

            <div id="area-controles"><div id="controles-wrap">
                <div id="seletor-modo" class="glass">
                    <button class="btn-modo" id="btn-modo-fila">${svg('list', 16)} Fila</button>
                    <button class="btn-modo" id="btn-modo-tv">${svg('tv', 16)} TV chamados</button>
                    <button class="btn-modo" id="btn-modo-video">${svg('video', 16)} TV + vídeo</button>
                </div>
                <button id="btn-som-fixo" class="glass"><span id="icone-som-fixo"></span><span id="texto-som-fixo">Som desativado</span></button>
                <div id="zoom-controls" class="glass">
                    <button id="btn-zoom-out" aria-label="Diminuir">−</button><span id="zoom-level">100%</span><button id="btn-zoom-in" aria-label="Aumentar">+</button>
                </div>
            </div></div>

            <!-- FILA -->
            <div id="modo-fila" class="hidden">
                <header class="topbar">
                    <div class="brand">
                        <div class="lg" data-slot style="--lg-h:clamp(40px,5vw,72px)"></div>
                        <div class="brand-txt"><h1>Painel de Atendimento</h1><h2 id="recepcao-nome-fila">—</h2></div>
                    </div>
                    <div class="metrics">
                        <div class="metric"><small>Aguardando</small><b id="g-aguardando">0</b></div>
                        <div class="metric"><small>Em atendimento</small><b id="g-atendendo">0</b></div>
                        <div class="tools"><div class="live"><span class="dot"></span>Tempo real</div><div id="data-hora-fila" class="clock"></div></div>
                    </div>
                </header>
                <main class="page">
                    <div id="ultimo-chamado-wrap" class="hidden">
                        <div id="ultimo-chamado-card" class="call">
                            <div class="call-main"><div class="call-label">Chamada atual</div><h2 id="uc-nome-fila" class="call-name">—</h2></div>
                            <div class="call-info">
                                <div class="call-field"><small>Pauta</small><b id="uc-pauta-fila">—</b></div>
                                <div class="call-field"><small>Local</small><b id="uc-local-fila">—</b></div>
                                <div class="call-field"><small>Horário</small><b id="uc-hora-fila">—</b></div>
                            </div>
                        </div>
                    </div>
                    <div class="cols">
                        <section class="panel">
                            <div class="panel-head"><h3>Em atendimento</h3><span id="n-atend">0</span></div>
                            <div class="th g-atend"><span>Assistido</span><span>Local</span><span style="text-align:right">Tempo</span></div>
                            <div id="lista-atendimento" class="panel-body"></div>
                        </section>
                        <section class="panel">
                            <div class="panel-head"><h3>Fila de espera</h3><span id="n-espera">0</span></div>
                            <div class="th g-fila"><span>Nº</span><span>Assistido</span><span>Espera</span><span></span></div>
                            <div id="lista-espera" class="panel-body"></div>
                        </section>
                    </div>
                </main>
            </div>

            <!-- TV -->
            <div id="modo-tv" class="hidden">
                <div id="destaque">
                    <div class="tv-label">Chamando</div>
                    <div id="uc-nome-tv">AGUARDANDO…</div>
                    <div class="tv-local"><div class="tv-label" id="label-local-tv">Dirija-se a</div><div id="uc-local-tv">—</div></div>
                </div>
                <aside id="lateral">
                    <h3>Últimos chamados</h3>
                    <div class="hist-head"><span>Nome</span><span>Local</span></div>
                    <div id="lista-historico-tv" class="hist-list"></div>
                    <div class="tv-foot">
                        <div class="lg" data-slot style="--lg-h:clamp(44px,6vw,90px)"></div>
                        <div id="data-hora-tv" class="tv-clock"></div>
                        <div id="recepcao-nome-tv" class="tv-rec">Recepção</div>
                    </div>
                </aside>
            </div>

            <!-- TV + VÍDEO -->
            <div id="modo-video" class="hidden">
                <div id="coluna-midia">
                    <div id="video-container">
                        <div id="video-placeholder">${svg('video', 56)}<b>Tela de mídia</b><span>Nenhum vídeo configurado. Informe um link do YouTube nas configurações do painel.</span></div>
                        <div id="video-embed" class="hidden"></div>
                    </div>
                    <div id="banner-chamado">
                        <div class="b-main"><small>Chamando</small><span id="banner-nome">AGUARDANDO…</span></div>
                        <div class="b-local"><small id="banner-label-local">Dirija-se a</small><span id="banner-local">—</span></div>
                    </div>
                </div>
                <aside id="faixa-video">
                    <div class="fv-head">
                        <div class="fv-logo"><div class="lg" data-slot style="--lg-h:48px"></div></div>
                        <p id="recepcao-nome-video" class="fv-rec">Recepção</p>
                        <div class="fv-stats">
                            <div class="fv-stat"><b id="video-g-aguardando" style="color:#d97706">0</b><span>Na fila</span></div>
                            <div class="fv-stat"><b id="video-g-atendendo" style="color:var(--info)">0</b><span>Em atendimento</span></div>
                        </div>
                    </div>
                    <div id="video-ultimo-chamado" class="hidden"><small>Último chamado</small><p id="video-uc-nome">—</p><span id="video-uc-local">—</span></div>
                    <div class="fv-title">Histórico recente</div>
                    <div id="lista-historico-video"></div>
                    <div class="fv-foot"><div id="data-hora-video" class="tv-clock"></div></div>
                </aside>
            </div>
        `;

        const $ = (id) => document.getElementById(id);

        // ── Logo do órgão (com a marca SIGEP sempre visível abaixo) ───────────
        const urlOk = (u) => /^(data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,|https:\/\/)/i.test(u || '');
        this._aplicarLogo = (url) => {
            const custom = urlOk(url);
            document.querySelectorAll('[data-slot]').forEach(slot => {
                slot.className = 'lg' + (custom ? ' custom' : '');
                slot.replaceChildren();
                const box = document.createElement('span'); box.className = 'lg-box';
                const img = document.createElement('img');
                img.alt = custom ? 'Logo do órgão' : 'SIGEP';
                img.src = custom ? url : LOGO;
                box.appendChild(img); slot.appendChild(box);
                if (custom) { const c = document.createElement('span'); c.className = 'lg-credit'; c.textContent = 'Tecnologia SIGEP'; slot.appendChild(c); }
            });
        };
        this._aplicarLogo('');

        // ── Áudio e voz ────────────────────────────────────────────────────────
        let somAtivo = false, audioCtx = null;
        const garantirAudioCtx = () => {
            audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') audioCtx.resume();
            return audioCtx;
        };
        const atualizarSom = () => {
            $('icone-som-fixo').innerHTML = svg(somAtivo ? 'on' : 'off', 16);
            $('texto-som-fixo').textContent = somAtivo ? 'Som ativado' : 'Som desativado';
            $('btn-som-fixo').classList.toggle('on', somAtivo);
        };
        atualizarSom();

        this._tocarSomEDizer = (chamado) => {
            if (!somAtivo) return;
            try {
                const ctx = garantirAudioCtx();
                [[659, 0, .4], [523, .4, .6]].forEach(([f, i, d]) => {
                    const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + i;
                    o.type = 'sine'; o.frequency.setValueAtTime(f, t);
                    g.gain.setValueAtTime(.5, t); g.gain.exponentialRampToValueAtTime(.001, t + d);
                    o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + d);
                });
                if ('speechSynthesis' in window && chamado?.nome) {
                    window.speechSynthesis.cancel();
                    setTimeout(() => {
                        const m = new SpeechSynthesisUtterance(fraseVoz(chamado));
                        m.lang = 'pt-BR'; m.rate = .85; m.pitch = 1; m.volume = 1;
                        window.speechSynthesis.speak(m);
                    }, 1200);
                }
            } catch (e) { console.error('Erro no som:', e); }
        };

        $('btn-som-fixo').addEventListener('click', () => {
            if (!somAtivo) { try { garantirAudioCtx(); somAtivo = true; atualizarSom(); } catch (e) { /* ignora */ } }
            else { somAtivo = false; atualizarSom(); window.speechSynthesis?.cancel(); }
        });

        // ── Controles que somem sozinhos ──────────────────────────────────────
        let tCtrl;
        const mostrar = () => {
            $('area-controles').classList.add('ativo');
            document.body.style.cursor = 'default';
            clearTimeout(tCtrl);
            tCtrl = setTimeout(() => { $('area-controles').classList.remove('ativo'); document.body.style.cursor = 'none'; }, 3000);
        };
        document.addEventListener('mousemove', mostrar);
        document.addEventListener('click', mostrar);

        // ── Ajuste automático de texto (TV e banner) ──────────────────────────
        const ajustar = (el, max, min) => {
            let size = max; el.style.fontSize = size + 'px';
            while ((el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) && size > min) { size -= 3; el.style.fontSize = size + 'px'; }
        };
        this._ajustarTV = () => {
            const vh = window.innerHeight, vw = window.innerWidth;
            if (!$('modo-tv').classList.contains('hidden')) {
                ajustar($('uc-nome-tv'), Math.min(vh * .30, vw * .12), 40);
                const l = $('uc-local-tv'); let s = Math.min(vh * .15, vw * .07); l.style.fontSize = s + 'px';
                while (l.scrollWidth > l.parentElement.clientWidth + 1 && s > 18) { s -= 3; l.style.fontSize = s + 'px'; }
            }
            if (!$('modo-video').classList.contains('hidden')) {
                ajustar($('banner-nome'), Math.min(vh * .12, vw * .06), 26);
                const bl = $('banner-local'); let s = Math.min(vh * .07, vw * .035); bl.style.fontSize = s + 'px';
                while ((bl.scrollWidth > bl.parentElement.clientWidth - 30 || bl.scrollHeight > vh * .16) && s > 16) { s -= 3; bl.style.fontSize = s + 'px'; }
            }
        };
        window.addEventListener('resize', () => this._ajustarTV());

        // ── Modos ─────────────────────────────────────────────────────────────
        window.zoomAtual = 1;
        let modoAtual = initialModo;
        const aplicarModo = (modo) => {
            modoAtual = modo;
            const url = new URL(window.location); url.searchParams.set('modo', modo); window.history.replaceState({}, '', url);
            ['fila', 'tv', 'video'].forEach(m => {
                const el = $(`modo-${m}`);
                el.classList.toggle('hidden', m !== modo);
                if (m === 'fila') el.style.display = m === modo ? 'flex' : 'none';
                $(`btn-modo-${m}`).classList.toggle('ativo', m === modo);
            });
            $('zoom-controls').style.display = modo === 'fila' ? 'flex' : 'none';
            document.body.style.zoom = modo === 'fila' ? window.zoomAtual : 1;
            document.body.style.background = modo === 'fila' ? '#f3f4f6' : '#0b1220';
            if (modo === 'video') iniciarVideo();
            this._ajustarTV();
        };
        ['fila', 'tv', 'video'].forEach(m => $(`btn-modo-${m}`).addEventListener('click', () => aplicarModo(m)));

        const mudarZoom = (d) => {
            window.zoomAtual = Math.max(.4, Math.min(2.5, window.zoomAtual + d));
            if (modoAtual === 'fila') document.body.style.zoom = window.zoomAtual;
            $('zoom-level').textContent = Math.round(window.zoomAtual * 100) + '%';
        };
        $('btn-zoom-in').addEventListener('click', () => mudarZoom(.1));
        $('btn-zoom-out').addEventListener('click', () => mudarZoom(-.1));

        // ── Vídeo ─────────────────────────────────────────────────────────────
        let videoCarregado = false;
        function iniciarVideo() {
            if (videoCarregado || !videoUrl) return;
            videoCarregado = true;
            $('video-placeholder').classList.add('hidden');
            const box = $('video-embed'); box.classList.remove('hidden');
            const m = videoUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|live\/|shorts\/))([A-Za-z0-9_-]{11})/);
            box.innerHTML = m
                ? `<iframe src="https://www.youtube.com/embed/${m[1]}?autoplay=1&mute=1&loop=1&playlist=${m[1]}&controls=0&disablekb=1&fs=0&modestbranding=1&rel=0&iv_load_policy=3" allow="autoplay; encrypted-media"></iframe>`
                : `<video src="${videoUrl}" autoplay muted loop playsinline></video>`;
        }

        // ── Início (exige clique para liberar áudio; com som=0 inicia direto) ──
        const iniciar = (comSom) => {
            if (comSom) {
                garantirAudioCtx(); somAtivo = true;
                if ('speechSynthesis' in window) { const v = new SpeechSynthesisUtterance(''); v.volume = 0; window.speechSynthesis.speak(v); }
            }
            atualizarSom();
            const ov = $('unlock-audio-overlay');
            if (ov) { ov.style.opacity = '0'; setTimeout(() => ov.remove(), 500); }
            $('loading').classList.remove('hidden');
            this._conectarFirebase(app, pautasParam, recepcaoNome, initialModo, aplicarModo);
        };
        $('btn-unlock-audio').addEventListener('click', () => iniciar(somParam !== '0' && somParam !== 'false'));
        if (somParam === '0' || somParam === 'false') iniciar(false);
    },

    // ── PIN de acesso (opcional): o hash fica em pautas/{id}/painel/config.tvPinHash ──
    async _verificarPin(db, ids) {
        if (!window.crypto?.subtle) return true;
        const sha = async (t) => {
            const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('sigep-tv:' + t));
            return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
        };
        let hash = '', pid = '';
        for (const id of ids) {
            try {
                const s = await getDoc(doc(db, 'pautas', id, 'painel', 'config'));
                const h = s.exists() ? (s.data().tvPinHash || '') : '';
                if (h) { hash = h; pid = id; break; }
            } catch (e) { /* sem leitura: segue sem PIN */ }
        }
        if (!hash) return true;
        const chave = `sigep_tv_pin_${pid}`;
        if (localStorage.getItem(chave) === hash) return true;

        return new Promise((resolve) => {
            const ov = document.createElement('div');
            ov.style.cssText = 'position:fixed;inset:0;z-index:10001;background:#0b1220;display:flex;align-items:center;justify-content:center;padding:24px;font-family:Inter,system-ui,sans-serif';
            ov.innerHTML = `
                <div style="background:#111a2e;border:1px solid #1e293b;border-radius:18px;padding:36px 32px;max-width:400px;width:100%;text-align:center;color:#fff">
                    <h2 style="margin:0 0 6px;font-size:22px;font-weight:800">Painel protegido</h2>
                    <p style="margin:0 0 20px;font-size:14px;color:#94a3b8">Digite o PIN de acesso para visualizar o painel.</p>
                    <input id="pin-in" type="password" inputmode="numeric" maxlength="12" autocomplete="off" placeholder="••••" style="width:100%;box-sizing:border-box;background:#1e293b;border:1px solid #334155;border-radius:12px;padding:14px;text-align:center;font-size:26px;letter-spacing:.25em;color:#fff;outline:none;margin-bottom:14px">
                    <button id="pin-ok" style="width:100%;background:#16a34a;color:#fff;font-weight:700;font-size:15px;padding:14px;border:0;border-radius:12px;cursor:pointer">Desbloquear</button>
                    <p id="pin-err" style="display:none;margin:12px 0 0;color:#f87171;font-size:13px;font-weight:600">PIN incorreto. Tente novamente.</p>
                </div>`;
            document.body.appendChild(ov);
            const inp = ov.querySelector('#pin-in'), err = ov.querySelector('#pin-err');
            setTimeout(() => inp.focus(), 100);
            const tentar = async () => {
                if ((await sha(inp.value.trim())) === hash) {
                    localStorage.setItem(chave, hash);
                    ov.remove(); resolve(true);
                } else { err.style.display = 'block'; inp.value = ''; inp.focus(); }
            };
            ov.querySelector('#pin-ok').addEventListener('click', tentar);
            inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') tentar(); });
        });
    },

    async _conectarFirebase(app, pautasParam, recepcaoNome, initialModo, aplicarModo) {
        const $ = (id) => document.getElementById(id);
        const db = app.db;
        const estado = { pautas: {}, assistidos: {}, ultimoChamado: null, historico: [] };

        // Histórico persistente: sobrevive a recarregar a página / reiniciar a TV
        const chaveHist = `sigep_painel_hist_${pautasParam}`;
        try {
            const salvo = JSON.parse(localStorage.getItem(chaveHist) || 'null');
            if (salvo) { estado.ultimoChamado = salvo.ultimo || null; estado.historico = Array.isArray(salvo.historico) ? salvo.historico.slice(0, 7) : []; }
        } catch (e) { /* ignora cache inválido */ }
        const salvarHist = () => {
            try { localStorage.setItem(chaveHist, JSON.stringify({ ultimo: estado.ultimoChamado, historico: estado.historico })); } catch (e) { /* ignora */ }
        };
        const PALETA = ['#1e3a8a', '#0f766e', '#6d28d9', '#9a3412', '#334155', '#155e75', '#854d0e', '#9d174d'];
        const corPor = {}; let prox = 0;
        const cor = (k) => (corPor[k] ??= PALETA[prox++ % PALETA.length]);
        const esc = (s) => String(s ?? '').replace(/[&<>'"]/g, t => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[t]));
        const vazio = (t) => `<div class="empty">${t}</div>`;
        const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };

        const duracao = (ini) => {
            const t = typeof ini === 'number' ? ini : Date.parse(ini);
            if (!t) return '—';
            const m = Math.max(0, Math.floor((Date.now() - t) / 60000));
            return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
        };

        const tick = () => {
            const d = new Date();
            set('data-hora-fila', d.toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ' ·'));
            const hms = d.toLocaleTimeString('pt-BR');
            set('data-hora-tv', hms); set('data-hora-video', hms);
        };
        setInterval(tick, 1000); tick();

        function renderPainel() {
            const atendendo = []; const grupos = {}; let total = 0;
            for (const pid in estado.assistidos) {
                const nm = estado.pautas[pid]?.name || 'Geral', sl = estado.pautas[pid]?.sala || '';
                const fila = [];
                (estado.assistidos[pid] || []).forEach(a => {
                    const p = { ...a, nm, sl, pid };
                    if (a.status === 'aguardando') fila.push(p); else if (a.status === 'emAtendimento') atendendo.push(p);
                });
                if (fila.length) {
                    fila.sort((a, b) => (b.priority === 'URGENTE') - (a.priority === 'URGENTE') || (a.checkInOrder || 0) - (b.checkInOrder || 0));
                    fila.forEach((p, i) => p.ordem = i + 1);
                    grupos[pid] = { nm, sl, pessoas: fila }; total += fila.length;
                }
            }
            set('g-aguardando', total); set('n-espera', total); set('video-g-aguardando', total);
            set('g-atendendo', atendendo.length); set('n-atend', atendendo.length); set('video-g-atendendo', atendendo.length);
            atendendo.sort((a, b) => new Date(b.inAttendanceTime || 0) - new Date(a.inAttendanceTime || 0));

            $('lista-atendimento').innerHTML = atendendo.length ? atendendo.map(a => {
                const loc = a.localChamada ? [a.localChamada.rotulo, a.localChamada.valor].filter(Boolean).join(' ') : (a.sl ? `Sala ${a.sl}` : '');
                return `<div class="row g-atend"><div style="min-width:0"><p class="nome">${esc(a.name)}</p><p class="sub">${esc(a.nm)}</p></div>
                    <span>${loc ? `<span class="tag sala">${esc(loc)}</span>` : '<span class="num">—</span>'}</span>
                    <span class="num" style="text-align:right">${duracao(a.inAttendanceTime)}</span></div>`;
            }).join('') : vazio('Nenhum atendimento em andamento');

            if (!total) { $('lista-espera').innerHTML = vazio('Fila vazia'); return; }
            const ordem = Object.keys(grupos).sort((a, b) => grupos[a].nm.localeCompare(grupos[b].nm));
            $('lista-espera').innerHTML = ordem.map(k => {
                const g = grupos[k];
                return `<div class="group-head" style="--u:${cor(k)}"><b><span>${esc(g.nm)}</span></b><small>${g.sl ? `Sala ${esc(g.sl)} · ` : ''}${g.pessoas.length} aguardando</small></div>` +
                    g.pessoas.map((a, i) => {
                        const prio = a.priority === 'URGENTE';
                        return `<div class="row g-fila ${i === 0 ? 'next' : ''} ${prio ? 'prio' : ''}">
                            <span class="pos">${String(a.ordem).padStart(2, '0')}</span>
                            <div style="min-width:0"><p class="nome">${esc(a.name)}</p>${i === 0 ? '<p class="next-flag">Próximo</p>' : ''}</div>
                            <span class="num">${duracao(a.arrivalTime || a.checkInOrder)}</span>
                            ${prio ? '<span class="tag prio">Prioridade</span>' : '<span></span>'}</div>`;
                    }).join('');
            }).join('');
        }
        setInterval(renderPainel, 30000);

        const renderHistoricos = () => {
            $('lista-historico-tv').innerHTML = estado.historico.length
                ? estado.historico.slice(0, 5).map(h => `<div class="item-hist"><span>${esc(h.nome)}</span><span>${esc(textoLocal(h))}</span></div>`).join('')
                : vazio('Nenhum chamado recente');
            $('lista-historico-video').innerHTML = estado.historico.length
                ? estado.historico.slice(0, 7).map(h => `<div class="fv-item"><span>${esc(h.nome)}</span><span>${esc(textoLocal(h))}</span></div>`).join('')
                : vazio('Nenhum chamado recente');
        };

        const reanimar = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

        function renderChamado(c) {
            renderHistoricos();
            if (!c) return;
            const { rotulo, valor } = localDe(c);
            const nomeUp = (c.nome || '').toUpperCase();

            // Fila
            $('ultimo-chamado-wrap').classList.remove('hidden');
            set('uc-nome-fila', nomeUp);
            set('uc-pauta-fila', c.pautaNome || c.local || '—');
            set('uc-local-fila', textoLocal(c));
            set('uc-hora-fila', c.hora || '');
            reanimar($('ultimo-chamado-card'), 'anim-in');

            // TV
            set('uc-nome-tv', nomeUp);
            set('uc-local-tv', valor);
            set('label-local-tv', rotulo);
            reanimar($('destaque'), 'flash');

            // TV + vídeo
            $('video-ultimo-chamado').classList.remove('hidden');
            set('video-uc-nome', nomeUp); set('video-uc-local', textoLocal(c));
            set('banner-nome', nomeUp); set('banner-local', valor); set('banner-label-local', rotulo);
            reanimar($('banner-chamado'), 'banner-anim');

            PainelPublicoService._ajustarTV();
        }

        if (!pautasParam) {
            $('loading').innerHTML = `<div style="background:#fff;border:1px solid var(--line);border-radius:16px;padding:32px;max-width:400px;text-align:center"><h2 style="margin:0 0 8px;font-size:var(--fs-lg);font-weight:800">Link incompleto</h2><p style="margin:0;color:var(--muted);font-size:var(--fs-sm)">Abra este painel a partir da Recepção Central para carregar as pautas.</p></div>`;
            return;
        }

        const idsPautas = pautasParam.split(',').map(s => s.trim()).filter(Boolean);
        await PainelPublicoService._verificarPin(db, idsPautas);

        const nomeRec = decodeURIComponent(recepcaoNome);
        set('recepcao-nome-fila', nomeRec); set('recepcao-nome-tv', nomeRec); set('recepcao-nome-video', nomeRec);
        $('loading').classList.add('hidden');
        aplicarModo(initialModo);
        renderChamado(estado.ultimoChamado);

        const logos = {};
        const primeiro = {};
        idsPautas.forEach(pid => {
            onSnapshot(doc(db, "pautas", pid, "painel", "config"), (s) => {
                logos[pid] = s.exists() ? (s.data().logoUrl || '') : '';
                PainelPublicoService._aplicarLogo(Object.values(logos).find(Boolean) || '');
            });
            onSnapshot(doc(db, "pautas", pid), (s) => { if (!s.exists()) return; estado.pautas[pid] = { id: pid, ...s.data() }; renderPainel(); });
            onSnapshot(collection(db, "pautas", pid, "attendances"), (s) => { estado.assistidos[pid] = s.docs.map(d => ({ id: d.id, ...d.data() })); renderPainel(); });
            onSnapshot(doc(db, "pautas", pid, "painel", "ultimoChamado"), (s) => {
                if (!s.exists() || !s.data().atual) { primeiro[pid] = true; return; }
                const d = s.data().atual;
                const ehPrimeiro = !primeiro[pid]; primeiro[pid] = true;
                if ((d.timestamp || 0) <= (estado.ultimoChamado?.timestamp || 0)) return;

                // Se o operador escolheu o local na chamada (rotuloLocal presente), ele tem prioridade sobre a sala padrão da pauta
                const escolhido = d.rotuloLocal !== undefined;
                const novo = { ...d, pautaNome: estado.pautas[pid]?.name || d.local || '', sala: escolhido ? d.sala : (estado.pautas[pid]?.sala || d.sala || '') };

                if (estado.ultimoChamado) { estado.historico.unshift(estado.ultimoChamado); if (estado.historico.length > 7) estado.historico.pop(); }
                estado.ultimoChamado = novo;
                salvarHist();
                renderChamado(novo);
                // O primeiro retorno do banco é só o estado atual: não toca som nem voz ao abrir/recarregar
                if (!ehPrimeiro) PainelPublicoService._tocarSomEDizer(novo);
            });
        });
    }
};
