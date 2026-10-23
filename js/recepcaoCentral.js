// js/recepcaoCentral.js - DASHBOARD EXECUTIVO (UI REFINADA + MULTI-TENANT)

import {
    collection, doc, onSnapshot, updateDoc, setDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showNotification, playSound, escapeHTML, normalizeText } from './utils.js';
import { PautaService } from './pauta.js';
import { PautaConfigService } from './pautaConfig.js';
import { RecepcaoConfigService } from './recepcaoConfig.js';
import { flatSubjects } from './assuntos.js';

// ─── ESTADO INTERNO ────────────────────────────────────────────────────────────

const estado = {
    pautasHoje: [],
    assistidosPorPauta: {},
    colaboradoresPorPauta: {},
    unsubscribers: [],
    pautaFocadaId: null,
    modoVisao: 'grade',
    termoBusca: '',
    recepcaoAtual: null,
    unidadeAtual: null,
    recepcoesDisponiveis: [],
};

const LOGO_URL = "https://firebasestorage.googleapis.com/v0/b/pauta-ce162.firebasestorage.app/o/logo_sigep.png?alt=media&token=b067528b-df81-4fbf-bc22-0d2b01acbbe6";

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

function injetarEstilos() {
    if (document.getElementById('rc-styles')) return;
    const style = document.createElement('style');
    style.id = 'rc-styles';
    style.textContent = CSS;
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

const ico = (name, size = 16, extra = '') =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}><path d="${ICONS[name] || ''}"/></svg>`;

// ─── HELPERS ───────────────────────────────────────────────────────────────────

function statusLabel(status) {
    const map = {
        pauta:                  { txt: 'Agendado',     cor: 'rc-badge' },
        aguardando:             { txt: 'Aguardando',   cor: 'rc-badge rc-badge--warn' },
        emAtendimento:          { txt: 'Atendendo',    cor: 'rc-badge rc-badge--info' },
        aguardandoDistribuicao: { txt: 'Distribuição', cor: 'rc-badge rc-badge--cyan' },
        atendido:               { txt: 'Finalizado',   cor: 'rc-badge rc-badge--ok' },
        faltoso:                { txt: 'Faltou',       cor: 'rc-badge rc-badge--danger' },
    };
    return map[status] || { txt: status, cor: 'rc-badge' };
}

function contadores(assistidos) {
    return {
        total:         assistidos.length,
        naPauta:       assistidos.filter(a => a.status === 'pauta').length,
        aguardando:    assistidos.filter(a => a.status === 'aguardando').length,
        emAtendimento: assistidos.filter(a => a.status === 'emAtendimento').length,
        atendidos:     assistidos.filter(a => a.status === 'atendido').length,
        faltosos:      assistidos.filter(a => a.status === 'faltoso').length,
        distribuicao:  assistidos.filter(a => a.status === 'aguardandoDistribuicao').length,
    };
}

function colaboradoresStatus(colaboradores) {
    const livres   = colaboradores.filter(c => c.status === 'disponivel' || !c.status);
    const ocupados = colaboradores.filter(c => c.status === 'ocupado');
    return { livres, ocupados };
}

function renderVerificacoesBadge(a) {
    const docs = a.verifications || a.documentos || a.verificacoes || a.customFields?.verifications;
    if (!docs) return '';

    let htmlLista = '';

    if (Array.isArray(docs)) {
        const itens = docs.map(d => typeof d === 'string' ? d : (d.nome || d.name || d.label || 'Doc'));
        if (itens.length === 0) return '';
        htmlLista = itens.map(i => `<span class="rc-badge">${escapeHTML(i)}</span>`).join('');
    } else if (typeof docs === 'object') {
        const keys = Object.keys(docs);
        if (keys.length === 0) return '';
        htmlLista = keys.map(k => `<span class="rc-badge ${docs[k] ? 'rc-badge--ok' : 'rc-badge--danger'}">${docs[k] ? '✓' : '✗'} ${escapeHTML(k)}</span>`).join('');
    }

    return htmlLista ? `<div class="flex flex-wrap gap-1 mt-2">${htmlLista}</div>` : '';
}

// Cria um modal padronizado. Fecha com ESC, clique fora ou [data-rc-close].
function criarModal({ id, titulo, subtitulo = '', corpo, rodape = '', largura = '448px', z = 200 }) {
    document.getElementById(id)?.remove();

    const backdrop = document.createElement('div');
    backdrop.id = id;
    backdrop.className = 'rc-wrap rc-backdrop';
    backdrop.style.zIndex = z;
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.innerHTML = `
        <div class="rc-modal" style="max-width:${largura}">
            <div class="rc-modal-head">
                <div>
                    <h3>${titulo}</h3>
                    ${subtitulo ? `<p>${subtitulo}</p>` : ''}
                </div>
                <button type="button" class="rc-btn rc-btn--ghost rc-btn--icon" data-rc-close aria-label="Fechar">${ico('x', 18)}</button>
            </div>
            ${corpo}
            ${rodape}
        </div>
    `;
    document.body.appendChild(backdrop);

    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const close = () => { document.removeEventListener('keydown', onKey); backdrop.remove(); };
    document.addEventListener('keydown', onKey);
    backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });
    backdrop.querySelectorAll('[data-rc-close]').forEach(b => b.addEventListener('click', close));

    return { modal: backdrop, close };
}

function htmlLogo(altura = 28) {
    return `<div class="rounded-xl flex items-center justify-center shrink-0" style="background:#0d1117;padding:10px 12px;border:1px solid #1f2937">
        <img src="${LOGO_URL}" alt="SIGEP" style="height:${altura}px;width:auto" class="object-contain">
    </div>`;
}

// ─── SERVIÇO PRINCIPAL ─────────────────────────────────────────────────────────

export const RecepcaoCentralService = {

    // ── INICIALIZAÇÃO ──────────────────────────────────────────────────────────

    async init(app) {
        this._app = app;
        this._filtroTipo = this._filtroTipo || 'todos';
        injetarEstilos();

        await this._carregarRecepcoesDoUsuario();
        await this._mostrarSelectorRecepcoes();
    },

    async _carregarRecepcoesDoUsuario() {
        const app = this._app;
        estado.recepcoesDisponiveis = await RecepcaoConfigService.buscarRecepcoesDoUsuario(
            app.db,
            app.currentUser.uid,
            app.currentUser.role
        );
        return estado.recepcoesDisponiveis;
    },

    // ─── SELETOR DE RECEPÇÃO ──────────────────────────────────────────────────

    async _mostrarSelectorRecepcoes() {
        const recepcoes = estado.recepcoesDisponiveis;

        if (recepcoes.length === 0) {
            this._renderSemPermissao();
            return;
        }

        if (recepcoes.length === 1) {
            this._recepcaoAtual = recepcoes[0];
            await this._carregarPautasPorRecepcao();
        } else {
            this._renderSelectorRecepcoes(recepcoes);
        }
    },

    _renderSemPermissao() {
        const container = document.getElementById('recepcao-central-container');
        if (!container) return;

        container.innerHTML = `
            <div class="rc-wrap max-w-lg mx-auto px-4 py-20">
                <div class="rc-surface text-center" style="padding:40px 32px">
                    <div class="mx-auto mb-5 flex items-center justify-center rounded-full" style="width:56px;height:56px;background:var(--rc-warn-soft);color:var(--rc-warn)">${ico('lock', 26)}</div>
                    <h3 class="text-lg font-extrabold mb-1">Acesso restrito</h3>
                    <p class="text-sm" style="color:var(--rc-muted)">Você não tem permissão para acessar nenhuma recepção no momento.</p>
                    <button id="rc-voltar-sem-permissao" class="rc-btn rc-btn--dark rc-btn--block mt-7">Voltar ao início</button>
                </div>
            </div>
        `;

        document.getElementById('rc-voltar-sem-permissao')?.addEventListener('click', () => this.fechar());
    },

    _renderSelectorRecepcoes(recepcoes) {
        const container = document.getElementById('recepcao-central-container');
        if (!container) return;

        container.innerHTML = `
            <div class="rc-wrap max-w-5xl mx-auto px-4 py-14">
                <div class="flex justify-center mb-7">${htmlLogo(34)}</div>

                <div class="text-center mb-10">
                    <h2 class="text-3xl font-extrabold tracking-tight">Selecione sua recepção</h2>
                    <p class="mt-2 text-sm" style="color:var(--rc-muted)">Escolha qual área ou fluxo você irá operar agora.</p>
                </div>

                ${RecepcaoConfigService.renderSelectorRecepcoes(recepcoes)}

                <div class="mt-12 flex justify-center">
                    <button id="rc-voltar-selector" class="rc-btn">${ico('back', 16)} Voltar ao painel principal</button>
                </div>
            </div>
        `;

        document.querySelectorAll('.rc-selector-recepcao').forEach(btn => {
            btn.addEventListener('click', async () => {
                const recepcaoId = btn.dataset.recepcaoId;
                const recepcaoEncontrada = recepcoes.find(r => r.id === recepcaoId);

                if (recepcaoEncontrada) {
                    this._recepcaoAtual = recepcaoEncontrada;
                    await this._carregarPautasPorRecepcao();
                }
            });
        });

        RecepcaoConfigService.initSelectorEventos();

        document.getElementById('rc-voltar-selector')?.addEventListener('click', () => this.fechar());
    },

    // ── CARREGAR PAUTAS POR RECEPÇÃO ───────────────────────────────────────────

    async _carregarPautasPorRecepcao() {
        const app = this._app;

        this._mostrarLoading();

        let pautas = await PautaConfigService.buscarPautasHoje(
            app.db,
            app.currentUser.uid,
            app.currentUser.email,
            app.currentUser.role
        );

        pautas.sort((a, b) => {
            const dataA = new Date(a.dataAtuacao || a.data || a.createdAt || 0).getTime();
            const dataB = new Date(b.dataAtuacao || b.data || b.createdAt || 0).getTime();
            return dataB - dataA;
        });

        if (this._filtroTipo && this._filtroTipo !== 'todos') {
            pautas = pautas.filter(p =>
                (p.tipo || p.type || '').toLowerCase() === this._filtroTipo.toLowerCase()
            );
        }

        if (this._recepcaoAtual) {
            const pautasFiltradasPorRecepcao = RecepcaoConfigService.filtrarPautasPorRecepcao(pautas, this._recepcaoAtual);
            if (pautasFiltradasPorRecepcao.length > 0) {
                pautas = pautasFiltradasPorRecepcao;
            }
        }

        estado.pautasHoje = pautas;

        await this._iniciarListeners();
        this._renderTelaComContexto();
    },

    _mostrarLoading() {
        const container = document.getElementById('recepcao-central-container');
        if (!container) return;
        injetarEstilos();

        container.innerHTML = `
            <div class="rc-wrap max-w-[1400px] mx-auto px-4 sm:px-6 py-6" aria-busy="true">
                <div class="rc-skeleton" style="height:56px;width:320px;margin-bottom:28px"></div>
                <div class="rc-skeleton" style="height:52px;margin-bottom:24px"></div>
                <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    <div class="rc-skeleton" style="height:340px"></div>
                    <div class="rc-skeleton" style="height:340px"></div>
                    <div class="rc-skeleton hidden xl:block" style="height:340px"></div>
                </div>
            </div>
        `;
    },

    async _iniciarListeners() {
        const app = this._app;

        this._cancelarListeners();

        for (const pauta of estado.pautasHoje) {
            const refAt  = collection(app.db, "pautas", pauta.id, "attendances");
            const unsubAt = onSnapshot(refAt, (snap) => {
                estado.assistidosPorPauta[pauta.id] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                if (estado.modoVisao === 'grade') {
                    this._atualizarCardPauta(pauta.id);
                } else if (estado.pautaFocadaId === pauta.id) {
                    this._renderFoco(pauta.id);
                }
                this._atualizarPainelPublicoUltimoChamado(pauta.id);
            });

            const refCo  = collection(app.db, "pautas", pauta.id, "collaborators");
            const unsubCo = onSnapshot(refCo, (snap) => {
                estado.colaboradoresPorPauta[pauta.id] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                if (estado.modoVisao === 'grade') {
                    this._atualizarCardPauta(pauta.id);
                } else if (estado.pautaFocadaId === pauta.id) {
                    this._renderFoco(pauta.id);
                }
            });

            estado.unsubscribers.push(unsubAt, unsubCo);
        }
    },

    _cancelarListeners() {
        estado.unsubscribers.forEach(u => u && u());
        estado.unsubscribers = [];
    },

    // ── RENDER TELA PRINCIPAL ──────────────────────────────────────────────────

    _renderTelaComContexto() {
        const container = document.getElementById('recepcao-central-container');
        if (!container) return;

        const contexto = RecepcaoConfigService.getContextoRecepcao(this._recepcaoAtual);

        const tipos = [
            ['todos', 'Todos'], ['agendamento', 'Agendamento'], ['avulso', 'Avulso'],
            ['multisala', 'Multi-sala'], ['mutirao', 'Mutirão'], ['plantao', 'Plantão'], ['acao_social', 'Ação social'],
        ];
        const filtroAtual = this._filtroTipo || 'todos';

        container.innerHTML = `
            <div class="rc-wrap max-w-[1400px] mx-auto px-4 sm:px-6 py-6">

                <!-- Cabeçalho -->
                <div id="rc-header" class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div class="flex items-center gap-4 min-w-0">
                        <button id="rc-btn-voltar-home" class="rc-btn rc-btn--icon shrink-0" title="Voltar ao início" aria-label="Voltar ao início">${ico('back', 18)}</button>
                        ${htmlLogo(24)}
                        <div class="min-w-0">
                            <h1 class="text-xl sm:text-2xl font-extrabold tracking-tight leading-tight truncate">${contexto.titulo}</h1>
                            <p class="text-sm truncate" style="color:var(--rc-muted)">${contexto.subtitulo}</p>
                        </div>
                    </div>

                    <div class="flex items-center gap-2">
                        <button id="rc-trocar-recepcao" class="rc-btn flex-1 sm:flex-none">${ico('swap', 15)} Trocar setor</button>
                        <button id="rc-btn-configurar-tv" class="rc-btn rc-btn--primary flex-1 sm:flex-none">${ico('tv', 15)} Painel TV</button>
                    </div>
                </div>

                <!-- Busca global -->
                <div id="rc-busca-wrap" class="rc-surface flex items-center gap-3 mb-5" style="padding:4px 6px 4px 16px">
                    <span style="color:var(--rc-faint)">${ico('search', 18)}</span>
                    <input type="search" id="rc-input-busca" autocomplete="off"
                        placeholder="Buscar assistido por nome, CPF ou nº de agendamento em todas as pautas"
                        class="w-full bg-transparent border-none outline-none text-[15px] py-3" style="color:var(--rc-text)">
                </div>

                <div id="rc-resultados-busca" class="mb-6 space-y-2 max-h-96 rc-scroll empty:hidden"></div>

                <!-- Resumo -->
                <div id="rc-sumario" class="flex flex-wrap items-center gap-2 mb-6"></div>

                <!-- Filtros -->
                <div id="rc-filtros" class="flex items-center justify-between gap-3 mb-5">
                    <div class="rc-seg">
                        ${tipos.map(([v, l]) => `
                            <button class="rc-filtro-tipo ${filtroAtual === v ? 'is-active' : ''}" data-tipo="${v}">${l}</button>
                        `).join('')}
                    </div>
                    <button id="rc-btn-atualizar" class="rc-btn rc-btn--ghost rc-btn--sm shrink-0" title="Recarregar pautas">${ico('refresh', 14)} Atualizar</button>
                </div>

                <!-- Grade -->
                <div id="rc-grade-pautas" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5"></div>

                <!-- Painel foco -->
                <div id="rc-painel-foco" class="hidden"></div>
            </div>
        `;

        this._renderGrade();
        this._renderSumario();
        this._setupInteracoes();
        this._setupBuscaGlobal();

        document.getElementById('rc-trocar-recepcao')?.addEventListener('click', async () => {
            this._cancelarListeners();
            await this._carregarRecepcoesDoUsuario();
            await this._mostrarSelectorRecepcoes();
        });

        document.getElementById('rc-btn-voltar-home')?.addEventListener('click', () => this.fechar());
    },

    // ── GRADE DE PAUTAS ────────────────────────────────────────────────────────

    _renderGrade() {
        const grade = document.getElementById('rc-grade-pautas');
        if (!grade) return;

        if (estado.pautasHoje.length === 0) {
            grade.innerHTML = `
                <div class="col-span-full rc-empty">
                    <div class="mx-auto mb-3 flex items-center justify-center rounded-full" style="width:48px;height:48px;background:#f1f5f9;color:var(--rc-faint)">${ico('folder', 22)}</div>
                    <p class="font-bold" style="color:var(--rc-text)">Nenhuma pauta ativa encontrada</p>
                    <p class="text-sm mt-1" style="color:var(--rc-muted)">Verifique os filtros selecionados ou crie uma nova pauta no sistema principal.</p>
                </div>
            `;
            return;
        }

        grade.innerHTML = estado.pautasHoje.map(p => this._htmlCardPauta(p)).join('');
    },

    _htmlCardPauta(pauta) {
        const assistidos    = estado.assistidosPorPauta[pauta.id] || [];
        const colaboradores = estado.colaboradoresPorPauta[pauta.id] || [];
        const c = contadores(assistidos);
        const { livres, ocupados } = colaboradoresStatus(colaboradores);

        const porcentagem = c.total > 0 ? Math.round((c.atendidos / c.total) * 100) : 0;

        const aguardando = PautaService.sortAguardando(
            assistidos.filter(a => a.status === 'aguardando'),
            pauta.ordemAtendimento
        );

        const listaNomes = aguardando.length === 0
            ? `<div class="text-center text-xs italic py-5 rounded-lg" style="color:var(--rc-faint);background:#fafbfc;border:1px dashed var(--rc-line)">Fila vazia no momento</div>`
            : aguardando.slice(0, 4).map((a, i) => `
                <div class="flex items-center gap-3 py-1.5">
                    <span class="rc-rank" style="width:22px;height:22px;font-size:10.5px">${i + 1}</span>
                    <p class="text-[13px] font-semibold truncate flex-1 min-w-0">${escapeHTML(a.name)}</p>
                    ${a.priority ? `<span class="rc-dot" style="background:var(--rc-danger)" title="Prioridade"></span>` : ''}
                    <span class="text-[11px] tabular-nums shrink-0" style="color:var(--rc-faint)">${a.scheduledTime || '—'}</span>
                </div>
            `).join('')
            + (aguardando.length > 4
                ? `<div class="text-[11px] font-semibold text-center pt-2 mt-1" style="color:var(--rc-brand);border-top:1px solid var(--rc-line-soft)">+${aguardando.length - 4} na fila</div>`
                : '');

        const concluida = porcentagem === 100;

        return `
            <div id="rc-card-${pauta.id}" class="rc-surface rc-pauta" data-pauta-id="${pauta.id}">

                <div style="padding:18px 20px 14px">
                    <div class="flex justify-between items-start gap-3">
                        <div class="min-w-0">
                            <h3 class="font-extrabold text-[17px] leading-snug tracking-tight truncate">${escapeHTML(pauta.name)}</h3>
                            <p class="rc-eyebrow mt-1">${escapeHTML(pauta.type || 'agendamento')}${pauta.sala ? ` · ${escapeHTML(pauta.sala)}` : ''}</p>
                        </div>
                        <span class="rc-badge ${concluida ? 'rc-badge--ok' : ''} shrink-0 tabular-nums">${porcentagem}%</span>
                    </div>
                </div>

                <div style="padding:0 20px"><div class="rc-progress"><span style="width:${porcentagem}%"></span></div></div>

                <div class="flex mt-3" style="border-top:1px solid var(--rc-line-soft);border-bottom:1px solid var(--rc-line-soft)">
                    <div class="rc-metric"><b>${c.naPauta}</b><span>Agenda</span></div>
                    <div class="rc-metric"><b style="color:var(--rc-warn)">${c.aguardando}</b><span>Fila</span></div>
                    <div class="rc-metric"><b style="color:var(--rc-info)">${c.emAtendimento}</b><span>Mesa</span></div>
                    <div class="rc-metric"><b style="color:var(--rc-ok)">${c.atendidos}</b><span>Feitos</span></div>
                </div>

                <div class="flex-1" style="padding:16px 20px">
                    <p class="rc-eyebrow mb-2">Próximos da fila</p>
                    ${listaNomes}
                </div>

                <div class="flex items-center justify-between" style="padding:10px 20px;background:#fafbfc;border-top:1px solid var(--rc-line-soft)">
                    <div class="flex items-center gap-4 text-xs font-semibold" style="color:var(--rc-muted)">
                        <span class="flex items-center gap-1.5" title="Colaboradores livres"><span class="rc-dot" style="background:var(--rc-ok)"></span>${livres.length} livres</span>
                        <span class="flex items-center gap-1.5" title="Colaboradores ocupados"><span class="rc-dot" style="background:var(--rc-danger)"></span>${ocupados.length} ocupados</span>
                    </div>
                    ${c.distribuicao > 0 ? `<span class="rc-badge rc-badge--cyan">${c.distribuicao} p/ assinar</span>` : ''}
                </div>

                <div class="flex gap-2" style="padding:14px 16px 16px">
                    <button class="rc-btn rc-btn--dark flex-1 rc-btn-abrir" data-pauta-id="${pauta.id}">Abrir painel ${ico('arrow', 15)}</button>
                    <button class="rc-btn rc-btn--icon rc-btn-checkin" data-pauta-id="${pauta.id}" title="Check-in rápido" aria-label="Check-in rápido">${ico('check', 17)}</button>
                    <button class="rc-btn rc-btn--icon rc-btn-chamar" data-pauta-id="${pauta.id}" title="Chamar próximo" aria-label="Chamar próximo">${ico('megaphone', 17)}</button>
                    <button class="rc-btn rc-btn--icon rc-btn-tv-individual" data-pauta-id="${pauta.id}" title="Painel TV isolado" aria-label="Painel TV isolado">${ico('tv', 17)}</button>
                </div>
            </div>
        `;
    },

    _atualizarCardPauta(pautaId) {
        const card = document.getElementById(`rc-card-${pautaId}`);
        if (!card) return;
        const pauta = estado.pautasHoje.find(p => p.id === pautaId);
        if (!pauta) return;
        card.outerHTML = this._htmlCardPauta(pauta);
        this._renderSumario();
    },

    // ── SUMÁRIO GERAL ──────────────────────────────────────────────────────────

    _renderSumario() {
        const el = document.getElementById('rc-sumario');
        if (!el) return;

        let totalAg = 0, totalAt = 0, totalEm = 0, totalDist = 0, totalNaPauta = 0;
        for (const assistidos of Object.values(estado.assistidosPorPauta)) {
            const c = contadores(assistidos);
            totalNaPauta += c.naPauta;
            totalAg   += c.aguardando;
            totalAt   += c.atendidos;
            totalEm   += c.emAtendimento;
            totalDist += c.distribuicao;
        }

        const pill = (num, label, cor) => `
            <div class="rc-pill"><span class="rc-dot" style="background:${cor}"></span><b>${num}</b>${label}</div>
        `;

        el.innerHTML = `
            ${pill(totalNaPauta, 'Agendados', '#cbd5e1')}
            ${pill(totalAg, 'Em fila', '#f59e0b')}
            ${pill(totalEm, 'Nas mesas', '#2563eb')}
            ${pill(totalAt, 'Concluídos', '#10b981')}
            ${totalDist > 0 ? pill(totalDist, 'Para assinar', '#06b6d4') : ''}
        `;
    },

    // ── PAINEL DE FOCO (KANBAN) ────────────────────────────────────────────────

    _alternarVisibilidadeGrade(mostrar) {
        ['rc-grade-pautas', 'rc-sumario', 'rc-header', 'rc-filtros', 'rc-busca-wrap', 'rc-resultados-busca'].forEach(id => {
            document.getElementById(id)?.classList.toggle('hidden', !mostrar);
        });
        document.getElementById('rc-painel-foco')?.classList.toggle('hidden', mostrar);
    },

    _abrirFoco(pautaId) {
        estado.pautaFocadaId = pautaId;
        estado.modoVisao     = 'foco';
        this._alternarVisibilidadeGrade(false);
        this._renderFoco(pautaId);
    },

    _fecharFoco() {
        estado.pautaFocadaId = null;
        estado.modoVisao     = 'grade';
        this._alternarVisibilidadeGrade(true);
    },

    // Card de assistido reutilizado nas 3 colunas
    _htmlAssistidoCard(a, pautaId, tipo, posicao = 0) {
        const busca = normalizeText(a.name + ' ' + (a.cpf || '') + ' ' + (a.numAgendamento || '') + ' ' + (a.subject || ''));
        const num = a.numAgendamento ? `<span class="rc-badge rc-badge--mono shrink-0">#${escapeHTML(String(a.numAgendamento))}</span>` : '';
        const hora = a.scheduledTime
            ? `<span class="font-semibold tabular-nums" style="color:${tipo === 'fila' ? 'var(--rc-warn)' : 'var(--rc-text)'}">${a.scheduledTime}</span> · `
            : '';
        const prio = a.priority
            ? `<span class="rc-badge rc-badge--danger mt-2">${ico('star', 11)} ${escapeHTML(a.priorityReason || a.priority)}</span>`
            : '';

        let acoes = '';
        if (tipo === 'agendado') {
            acoes = `
                <div class="rc-person-actions">
                    <button class="rc-btn rc-btn--warn rc-btn--sm rc-btn--block rc-foco-checkin" data-id="${a.id}" data-pauta="${pautaId}">${ico('check', 14)} Fazer check-in</button>
                </div>`;
        } else if (tipo === 'fila') {
            acoes = `
                <div class="rc-person-actions">
                    <div class="flex gap-1">
                        <button class="rc-btn rc-btn--ghost rc-btn--sm rc-btn--icon rc-foco-abrir-prioridade" style="width:30px;height:30px" title="Definir prioridade" aria-label="Definir prioridade" data-id="${a.id}" data-pauta="${pautaId}">${ico('star', 15)}</button>
                        ${(a.priority || a.priorityReason) ? `<button class="rc-btn rc-btn--ghost rc-btn--sm rc-btn--icon rc-foco-remover-prioridade" style="width:30px;height:30px;color:var(--rc-danger)" title="Remover prioridade" aria-label="Remover prioridade" data-id="${a.id}" data-pauta="${pautaId}">${ico('x', 15)}</button>` : ''}
                    </div>
                    <div class="flex gap-1.5">
                        <button class="rc-btn rc-btn--ghost rc-btn--sm rc-foco-voltar" data-id="${a.id}" data-pauta="${pautaId}" data-destino="pauta">${ico('undo', 13)} Desfazer</button>
                        <button class="rc-btn rc-btn--ok rc-btn--sm rc-foco-chamar-individual" data-id="${a.id}" data-pauta="${pautaId}">${ico('megaphone', 13)} Chamar</button>
                    </div>
                </div>`;
        } else if (tipo === 'mesa') {
            acoes = `
                <div class="rc-person-actions" style="justify-content:flex-end">
                    <button class="rc-btn rc-btn--ghost rc-btn--sm rc-foco-voltar" data-id="${a.id}" data-pauta="${pautaId}" data-destino="aguardando">${ico('undo', 13)} Voltar p/ fila</button>
                </div>`;
        }

        const colab = tipo === 'mesa'
            ? `<span class="rc-badge rc-badge--info mt-2">${ico('user', 11)} ${escapeHTML(a.assignedCollaborator?.name || a.attendant || 'Mesa não atribuída')}</span>`
            : '';

        const corpo = `
            <div class="flex justify-between items-start gap-2">
                <p class="font-bold text-sm leading-snug ${tipo === 'fila' ? 'truncate' : ''}">${escapeHTML(a.name)}</p>
                ${num}
            </div>
            <p class="text-xs mt-0.5 truncate" style="color:var(--rc-muted)">${tipo === 'mesa' ? '' : hora}${escapeHTML(a.subject || 'Sem assunto')}</p>
            ${prio}${colab}
            ${tipo !== 'mesa' ? renderVerificacoesBadge(a) : ''}
        `;

        return `
            <div class="rc-person ${a.priority ? 'rc-person--prio' : ''} rc-assistido-card" data-busca="${busca}">
                ${tipo === 'fila'
                    ? `<div class="flex gap-3"><div class="rc-rank">${posicao}</div><div class="flex-1 min-w-0">${corpo}</div></div>`
                    : corpo}
                ${acoes}
            </div>
        `;
    },

    _renderFoco(pautaId) {
        const foco = document.getElementById('rc-painel-foco');
        if (!foco || estado.modoVisao !== 'foco') return;

        const pauta = estado.pautasHoje.find(p => p.id === pautaId);
        if (!pauta) return;

        const assistidos    = estado.assistidosPorPauta[pautaId] || [];
        const colaboradores = estado.colaboradoresPorPauta[pautaId] || [];
        const c = contadores(assistidos);

        const naPautaList = assistidos.filter(a => a.status === 'pauta');
        const aguardando = PautaService.sortAguardando(
            assistidos.filter(a => a.status === 'aguardando'),
            pauta.ordemAtendimento
        );
        const emAtendimentoList = assistidos.filter(a => a.status === 'emAtendimento');

        const vazio = (txt) => `<p class="text-xs text-center py-10 font-medium" style="color:var(--rc-faint)">${txt}</p>`;
        const colHead = (cor, titulo, qtd) => `
            <div class="rc-col-head">
                <h4 class="rc-col-title"><span class="rc-dot" style="background:${cor}"></span>${titulo}</h4>
                <span class="rc-count">${qtd}</span>
            </div>`;

        // Preserva a busca digitada durante re-renderizações em tempo real
        const termoAnterior = document.getElementById('rc-foco-input-busca')?.value || '';

        foco.innerHTML = `
            <div class="rc-surface overflow-hidden flex flex-col" style="height:calc(100vh - 48px);min-height:600px">

                <div class="flex flex-wrap items-center justify-between gap-4 shrink-0" style="padding:14px 20px;border-bottom:1px solid var(--rc-line)">
                    <div class="flex items-center gap-3 min-w-0">
                        <button id="rc-btn-voltar-grade" class="rc-btn rc-btn--icon shrink-0" aria-label="Voltar para as pautas">${ico('back', 18)}</button>
                        <div class="min-w-0">
                            <h3 class="font-extrabold text-lg leading-tight truncate">${escapeHTML(pauta.name)}</h3>
                            <p class="text-xs mt-0.5 flex gap-3" style="color:var(--rc-muted)">
                                <span>Total <b style="color:var(--rc-text)">${c.total}</b></span>
                                <span>Concluídos <b style="color:var(--rc-ok)">${c.atendidos}</b></span>
                                ${c.faltosos ? `<span>Faltas <b style="color:var(--rc-danger)">${c.faltosos}</b></span>` : ''}
                            </p>
                        </div>
                    </div>

                    <div class="relative flex-1" style="min-width:220px;max-width:420px">
                        <span class="absolute" style="left:12px;top:50%;transform:translateY(-50%);color:var(--rc-faint)">${ico('search', 16)}</span>
                        <input type="search" id="rc-foco-input-busca" value="${escapeHTML(termoAnterior)}" placeholder="Pesquisar nesta pauta" class="rc-input" style="padding-left:36px">
                    </div>

                    <div class="flex gap-2 shrink-0">
                        <button id="rc-foco-btn-add-assistido" class="rc-btn">${ico('plus', 15)} Adicionar</button>
                        <button id="rc-foco-btn-chamar" class="rc-btn rc-btn--ok">${ico('megaphone', 15)} Chamar próximo</button>
                    </div>
                </div>

                <div class="flex-1 grid grid-cols-1 lg:grid-cols-3 overflow-hidden" style="min-height:0">

                    <div class="rc-col" style="border-right:1px solid var(--rc-line)">
                        ${colHead('#cbd5e1', 'Agendados', naPautaList.length)}
                        <div class="p-3 flex-1 rc-scroll space-y-2">
                            ${naPautaList.length === 0 ? vazio('Nenhum agendado.') : ''}
                            ${naPautaList.map(a => this._htmlAssistidoCard(a, pautaId, 'agendado')).join('')}
                        </div>
                    </div>

                    <div class="rc-col" style="border-right:1px solid var(--rc-line)">
                        ${colHead('#f59e0b', 'Em fila', aguardando.length)}
                        <div class="p-3 flex-1 rc-scroll space-y-2">
                            ${aguardando.length === 0 ? vazio('Fila vazia.') : ''}
                            ${aguardando.map((a, i) => this._htmlAssistidoCard(a, pautaId, 'fila', i + 1)).join('')}
                        </div>
                    </div>

                    <div class="rc-col">
                        ${colHead('#2563eb', 'Nas mesas', emAtendimentoList.length)}
                        <div class="p-3 flex-1 rc-scroll space-y-2">
                            ${emAtendimentoList.length === 0 ? vazio('Ninguém em atendimento.') : ''}
                            ${emAtendimentoList.map(a => this._htmlAssistidoCard(a, pautaId, 'mesa')).join('')}
                        </div>

                        <div class="shrink-0" style="height:132px;border-top:1px solid var(--rc-line);background:var(--rc-surface);display:flex;flex-direction:column">
                            <div class="flex justify-between items-center" style="padding:8px 16px;border-bottom:1px solid var(--rc-line-soft)">
                                <span class="rc-eyebrow">Equipe online</span>
                                <span class="rc-count">${colaboradores.length}</span>
                            </div>
                            <div class="flex-1 rc-scroll flex flex-wrap gap-1.5 items-start content-start" style="padding:10px 12px">
                                ${colaboradores.length === 0 ? `<p class="text-xs w-full text-center mt-2" style="color:var(--rc-faint)">Nenhum colaborador</p>` : ''}
                                ${colaboradores.map(col => {
                                    const livre = col.status === 'disponivel' || !col.status;
                                    const nome = col.nome || 'Sem nome';
                                    return `<span class="rc-badge" title="${escapeHTML(nome)} — ${livre ? 'livre' : 'ocupado'}">
                                        <span class="rc-dot" style="width:6px;height:6px;background:${livre ? 'var(--rc-ok)' : 'var(--rc-danger)'}"></span>
                                        ${escapeHTML(nome.split(' ')[0])}
                                    </span>`;
                                }).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const aplicarFiltro = (valor) => {
            const termo = normalizeText((valor || '').trim());
            foco.querySelectorAll('.rc-assistido-card').forEach(card => {
                card.style.display = (!termo || (card.dataset.busca || '').includes(termo)) ? '' : 'none';
            });
        };
        if (termoAnterior) aplicarFiltro(termoAnterior);

        document.getElementById('rc-btn-voltar-grade')?.addEventListener('click', () => this._fecharFoco());
        document.getElementById('rc-foco-btn-chamar')?.addEventListener('click', () => this._chamarProximo(pautaId));
        document.getElementById('rc-foco-btn-add-assistido')?.addEventListener('click', () => {
            this._abrirModalAdicionarAssistido(pautaId, pauta.name);
        });
        document.getElementById('rc-foco-input-busca')?.addEventListener('input', (e) => aplicarFiltro(e.target.value));

        foco.querySelectorAll('.rc-foco-checkin').forEach(btn => {
            btn.addEventListener('click', () => this._abrirModalCheckinComHorario(pautaId, btn.dataset.id));
        });
        foco.querySelectorAll('.rc-foco-chamar-individual').forEach(btn => {
            btn.addEventListener('click', () => this._chamarAssistidoEspecifico(pautaId, btn.dataset.id));
        });
        foco.querySelectorAll('.rc-foco-voltar').forEach(btn => {
            btn.addEventListener('click', () => this._voltarStatusAssistido(pautaId, btn.dataset.id, btn.dataset.destino));
        });
        foco.querySelectorAll('.rc-foco-abrir-prioridade').forEach(btn => {
            btn.addEventListener('click', () => this._abrirModalDefinirPrioridade(btn.dataset.pauta, btn.dataset.id));
        });
        foco.querySelectorAll('.rc-foco-remover-prioridade').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (confirm("Remover prioridade deste assistido?")) {
                    await PautaService.updateStatus(
                        this._app.db,
                        btn.dataset.pauta,
                        btn.dataset.id,
                        { priority: null, priorityReason: null },
                        this._app.currentUserName
                    );
                    showNotification("Prioridade removida", "info");
                }
            });
        });
    },

    // ── MODAL DEFINIR PRIORIDADE ───────────────────────────────────────────────

    _abrirModalDefinirPrioridade(pautaId, assistidoId) {
        const categorias = [
            'Idoso (60+)', 'Idoso (80+)', 'Deficiência (PCD)', 'Autismo (TEA)',
            'Gestante', 'Criança de Colo', 'Obesidade', 'Urgência Médica',
        ];

        const { modal, close } = criarModal({
            id: 'rc-modal-prioridade',
            titulo: 'Prioridade legal',
            subtitulo: 'Selecione uma ou mais categorias.',
            z: 250,
            corpo: `
                <div class="rc-modal-body">
                    <div class="grid grid-cols-2 gap-2.5 mb-5">
                        ${categorias.map(cat => `<button type="button" data-value="${cat}" class="rc-chip">${cat}</button>`).join('')}
                    </div>
                    <label class="rc-label" for="rc-priority-reason-input">Outros / observações</label>
                    <textarea id="rc-priority-reason-input" placeholder="Ex.: prazo vencendo hoje" class="rc-input" style="height:84px;resize:none"></textarea>
                </div>`,
            rodape: `
                <div class="rc-modal-foot">
                    <button type="button" class="rc-btn" data-rc-close>Cancelar</button>
                    <button type="button" id="rc-confirm-priority-btn" class="rc-btn rc-btn--danger">Confirmar prioridade</button>
                </div>`,
        });

        modal.querySelectorAll('.rc-chip').forEach(chip => {
            chip.addEventListener('click', () => chip.classList.toggle('selected'));
        });

        document.getElementById('rc-confirm-priority-btn').addEventListener('click', async () => {
            const selecionadas = Array.from(modal.querySelectorAll('.rc-chip.selected')).map(chip => chip.dataset.value);
            const customReason = document.getElementById('rc-priority-reason-input').value.trim();

            let finalReason = selecionadas.join(', ');
            if (customReason) {
                finalReason = finalReason ? `${finalReason} | Obs: ${customReason}` : customReason;
            }

            if (!finalReason) {
                showNotification("Selecione uma categoria ou descreva o motivo.", "error");
                return;
            }

            await PautaService.updateStatus(
                this._app.db, pautaId, assistidoId,
                { priority: 'URGENTE', priorityReason: finalReason },
                this._app.currentUserName
            );

            close();
            showNotification("Prioridade ativada!", "success");
        });
    },

    // ── ADICIONAR ASSISTIDO ────────────────────────────────────────────────────

    _abrirModalAdicionarAssistido(pautaId, pautaNome) {
        const datalist = (flatSubjects && flatSubjects.length > 0)
            ? `<datalist id="rc-lista-assuntos">
                   ${flatSubjects.map(s => `<option value="${escapeHTML(s.value)}">${escapeHTML(s.description || '')}</option>`).join('')}
               </datalist>`
            : '';

        const { modal, close } = criarModal({
            id: 'rc-modal-add-assistido',
            titulo: 'Novo atendimento',
            subtitulo: escapeHTML(pautaNome),
            corpo: `
                ${datalist}
                <form id="rc-form-add-assistido" class="flex flex-col min-h-0 flex-1">
                    <div class="rc-modal-body space-y-4">
                        <div>
                            <label class="rc-label" for="rc-add-nome">Nome completo <span style="color:var(--rc-danger)">*</span></label>
                            <input type="text" id="rc-add-nome" required class="rc-input" placeholder="Ex.: Maria da Silva" autocomplete="off">
                        </div>
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="rc-label" for="rc-add-cpf">CPF</label>
                                <input type="text" id="rc-add-cpf" class="rc-input" placeholder="000.000.000-00" inputmode="numeric">
                            </div>
                            <div>
                                <label class="rc-label" for="rc-add-agendamento">Nº agendamento</label>
                                <input type="text" id="rc-add-agendamento" class="rc-input" style="font-family:ui-monospace,monospace" placeholder="12345">
                            </div>
                        </div>
                        <div>
                            <label class="rc-label" for="rc-add-assunto">Assunto</label>
                            <input type="text" id="rc-add-assunto" list="rc-lista-assuntos" class="rc-input" placeholder="Ex.: Divórcio, pensão…">
                        </div>
                        <div>
                            <label class="rc-label" for="rc-add-prioridade">Prioridade</label>
                            <select id="rc-add-prioridade" class="rc-input">
                                <option value="">Nenhuma</option>
                                <option value="URGENTE">Urgente / legal</option>
                                <option value="Máxima">Máxima</option>
                                <option value="Média">Média</option>
                            </select>
                        </div>
                        <div>
                            <span class="rc-label">Ação inicial</span>
                            <div class="grid grid-cols-2 gap-3" id="rc-add-status-grupo">
                                <label class="rc-option is-selected">
                                    <input type="radio" name="rc_add_status" value="pauta" checked> Apenas agendar
                                </label>
                                <label class="rc-option">
                                    <input type="radio" name="rc_add_status" value="aguardando"> Fazer check-in
                                </label>
                            </div>
                        </div>
                    </div>
                    <div class="rc-modal-foot">
                        <button type="button" class="rc-btn" data-rc-close style="flex:.6">Cancelar</button>
                        <button type="submit" id="rc-btn-add-salvar" class="rc-btn rc-btn--primary" style="flex:1.4">Salvar assistido</button>
                    </div>
                </form>`,
        });

        document.getElementById('rc-add-nome')?.focus();

        modal.querySelectorAll('input[name="rc_add_status"]').forEach(radio => {
            radio.addEventListener('change', () => {
                modal.querySelectorAll('#rc-add-status-grupo .rc-option').forEach(o => o.classList.remove('is-selected'));
                radio.closest('.rc-option').classList.add('is-selected');
            });
        });

        document.getElementById('rc-form-add-assistido').onsubmit = async (e) => {
            e.preventDefault();

            const btn = document.getElementById('rc-btn-add-salvar');
            btn.disabled = true;
            btn.textContent = 'Salvando…';

            const statusEscolhido = document.querySelector('input[name="rc_add_status"]:checked').value;
            const isAguardando = statusEscolhido === 'aguardando';
            const prioridadeSelecionada = document.getElementById('rc-add-prioridade').value;

            const assistedData = {
                name: document.getElementById('rc-add-nome').value.trim(),
                cpf: document.getElementById('rc-add-cpf').value.trim(),
                numAgendamento: document.getElementById('rc-add-agendamento').value.trim(),
                subject: document.getElementById('rc-add-assunto').value.trim(),
                status: statusEscolhido,
                type: 'avulso',
                arrivalTime: isAguardando ? new Date().toISOString() : null,
                checkInOrder: isAguardando ? Date.now() : null,
                priority: prioridadeSelecionada || null,
                // 🔒 GARANTIA DE INJEÇÃO DO ÓRGÃO (MULTI-TENANT)
                orgaoId: this._app.currentUser?.orgaoId || 'padrao_dprj'
            };

            const app = this._app;
            const sucesso = await PautaService.addAssistedProgrammatic(
                app.db,
                pautaId,
                assistedData,
                app.currentUserName || 'Recepção Central'
            );

            if (sucesso) {
                close();
                if (isAguardando) playSound('notification');
            } else {
                btn.disabled = false;
                btn.textContent = 'Tentar novamente';
            }
        };
    },

    // ── BUSCA GLOBAL ───────────────────────────────────────────────────────────

    _setupBuscaGlobal() {
        const input = document.getElementById('rc-input-busca');
        if (!input) return;

        input.addEventListener('input', () => {
            const termo      = normalizeText(input.value.trim());
            const resultados = document.getElementById('rc-resultados-busca');
            if (!resultados) return;

            if (!termo) {
                resultados.innerHTML = '';
                return;
            }

            const encontrados = [];
            for (const pauta of estado.pautasHoje) {
                const assistidos = estado.assistidosPorPauta[pauta.id] || [];
                for (const a of assistidos) {
                    const matchNome = normalizeText(a.name || '').includes(termo);
                    const matchNum  = (a.numAgendamento || '').includes(input.value.trim());
                    const matchCpf  = (a.cpf || '').includes(input.value.trim());
                    if (matchNome || matchNum || matchCpf) {
                        encontrados.push({ pauta, assistido: a });
                    }
                }
            }

            if (encontrados.length === 0) {
                resultados.innerHTML = `<p class="text-sm font-medium py-4 px-2" style="color:var(--rc-muted)">Nenhum resultado para "${escapeHTML(input.value)}".</p>`;
                return;
            }

            resultados.innerHTML = encontrados.map(({ pauta, assistido: a }) => {
                const sl = statusLabel(a.status);
                const podeCheckin = a.status === 'pauta';
                return `
                    <div class="rc-surface flex items-center gap-4" style="padding:12px 16px">
                        <div class="min-w-0 flex-1">
                            <div class="flex items-center gap-2 mb-0.5">
                                <p class="font-bold truncate">${escapeHTML(a.name)}</p>
                                ${a.numAgendamento ? `<span class="rc-badge rc-badge--mono shrink-0">#${escapeHTML(String(a.numAgendamento))}</span>` : ''}
                            </div>
                            <p class="text-xs truncate" style="color:var(--rc-muted)">
                                <span class="font-semibold" style="color:var(--rc-brand)">${escapeHTML(pauta.name)}</span>
                                ${a.scheduledTime ? ` · ${a.scheduledTime}` : ''}${escapeHTML(a.subject ? ` · ${a.subject}` : '')}
                            </p>
                        </div>
                        <div class="flex items-center gap-3 shrink-0">
                            <span class="${sl.cor}">${sl.txt}</span>
                            ${podeCheckin ? `<button class="rc-btn rc-btn--warn rc-btn--sm rc-busca-checkin" data-pauta="${pauta.id}" data-id="${a.id}">${ico('check', 14)} Check-in</button>` : ''}
                        </div>
                    </div>
                `;
            }).join('');

            resultados.querySelectorAll('.rc-busca-checkin').forEach(btn => {
                btn.addEventListener('click', () => {
                    this._abrirModalCheckinComHorario(btn.dataset.pauta, btn.dataset.id);
                    input.value = '';
                    resultados.innerHTML = '';
                });
            });
        });
    },

    // ── AÇÕES ──────────────────────────────────────────────────────────────────

    async _marcarChegadaComDados(pautaId, assistidoId, horarioStr) {
        const app = this._app;

        let arrivalTimeISO = new Date().toISOString();
        if (horarioStr) {
            const [h, m] = horarioStr.split(':');
            const d = new Date();
            d.setHours(parseInt(h), parseInt(m), 0, 0);
            arrivalTimeISO = d.toISOString();
        }

        await PautaService.updateStatus(
            app.db,
            pautaId,
            assistidoId,
            {
                status:       'aguardando',
                arrivalTime:  arrivalTimeISO,
                checkInOrder: Date.now(),
            },
            app.currentUserName
        );
        showNotification("Chegada registrada!", "success");
        playSound('notification');
    },

    _abrirModalCheckinComHorario(pautaId, assistidoId) {
        const assistidos = estado.assistidosPorPauta[pautaId] || [];
        const assistido = assistidos.find(a => a.id === assistidoId);
        if (!assistido) return;

        const horaAtual = new Date().toTimeString().slice(0, 5);

        const { close } = criarModal({
            id: 'rc-modal-checkin-horario',
            titulo: 'Confirmar check-in',
            subtitulo: escapeHTML(assistido.name),
            largura: '380px',
            z: 250,
            corpo: `
                <div class="rc-modal-body">
                    <label class="rc-label text-center" for="rc-input-hora-chegada">Horário de chegada</label>
                    <input type="time" id="rc-input-hora-chegada" value="${horaAtual}" class="rc-input text-center" style="font-size:26px;font-weight:800;padding:14px">
                </div>`,
            rodape: `
                <div class="rc-modal-foot">
                    <button type="button" class="rc-btn" data-rc-close>Cancelar</button>
                    <button type="button" id="rc-checkin-confirm" class="rc-btn rc-btn--primary">Confirmar</button>
                </div>`,
        });

        document.getElementById('rc-checkin-confirm').onclick = async () => {
            const horaStr = document.getElementById('rc-input-hora-chegada').value;
            close();
            await this._marcarChegadaComDados(pautaId, assistidoId, horaStr);
        };
    },

    async _voltarStatusAssistido(pautaId, assistidoId, destino) {
        const app = this._app;
        const msg = destino === 'pauta' ? 'Assistido retornado para Agendados.' : 'Assistido retornado para a fila de espera.';

        let updates = { status: destino };

        if (destino === 'pauta') {
            updates.arrivalTime = null;
            updates.checkInOrder = null;
        } else if (destino === 'aguardando') {
            updates.assignedCollaborator = null;
            updates.inAttendanceTime = null;
        }

        await PautaService.updateStatus(app.db, pautaId, assistidoId, updates, app.currentUserName);
        showNotification(msg, "info");
    },

    async _chamarAssistidoEspecifico(pautaId, assistidoId) {
        const pauta = estado.pautasHoje.find(p => p.id === pautaId);
        if (!pauta) return;

        const assistidos = estado.assistidosPorPauta[pautaId] || [];
        const assistido = assistidos.find(a => a.id === assistidoId);
        if (!assistido) return;

        const colaboradores = estado.colaboradoresPorPauta[pautaId] || [];

        if (colaboradores.length > 0) {
            this._abrirModalSeletorColaborador(pautaId, assistido, colaboradores, pauta);
        } else {
            await this._executarChamado(pautaId, assistido, pauta, null);
        }
    },

    async _chamarProximo(pautaId) {
        const pauta = estado.pautasHoje.find(p => p.id === pautaId);
        if (!pauta) return;

        const aguardando = PautaService.sortAguardando(
            (estado.assistidosPorPauta[pautaId] || []).filter(a => a.status === 'aguardando'),
            pauta.ordemAtendimento
        );

        if (aguardando.length === 0) {
            showNotification("Fila vazia nesta pauta.", "info");
            return;
        }

        const proximo = aguardando[0];
        const colaboradores = estado.colaboradoresPorPauta[pautaId] || [];

        if (colaboradores.length > 0) {
            this._abrirModalSeletorColaborador(pautaId, proximo, colaboradores, pauta);
        } else {
            await this._executarChamado(pautaId, proximo, pauta, null);
        }
    },

    _abrirModalSeletorColaborador(pautaId, assistido, colaboradores, pauta) {
        let opcoes = '<option value="">Chamada livre (sem mesa específica)</option>';

        const ordenados = [...colaboradores].sort((a, b) => {
            const aLivre = a.status === 'disponivel' || !a.status;
            const bLivre = b.status === 'disponivel' || !b.status;
            if (aLivre === bLivre) return (a.nome || '').localeCompare(b.nome || '');
            return aLivre ? -1 : 1;
        });

        ordenados.forEach(c => {
            const livre = c.status === 'disponivel' || !c.status;
            opcoes += `<option value="${c.id}" data-nome="${escapeHTML(c.nome)}">${escapeHTML(c.nome)} — ${escapeHTML(c.cargo || 'Membro')} (${livre ? 'livre' : 'ocupado'})</option>`;
        });

        const { close } = criarModal({
            id: 'rc-modal-seletor-colaborador',
            titulo: 'Direcionar chamada',
            subtitulo: escapeHTML(assistido.name),
            corpo: `
                <div class="rc-modal-body">
                    <label class="rc-label" for="rc-select-colaborador-destino">Para qual mesa / colaborador?</label>
                    <select id="rc-select-colaborador-destino" class="rc-input">${opcoes}</select>
                    <p class="text-xs mt-2" style="color:var(--rc-muted)">Em "Chamada livre", o assistido é anunciado na TV sem direcionamento a uma mesa.</p>
                </div>`,
            rodape: `
                <div class="rc-modal-foot">
                    <button type="button" class="rc-btn" data-rc-close style="flex:.6">Cancelar</button>
                    <button type="button" id="rc-btn-colaborador-confirmar" class="rc-btn rc-btn--primary" style="flex:1.4">${ico('megaphone', 15)} Confirmar chamada</button>
                </div>`,
        });

        document.getElementById('rc-btn-colaborador-confirmar').onclick = async () => {
            const select = document.getElementById('rc-select-colaborador-destino');
            const colaboradorId = select.value;
            let colaboradorObj = null;

            if (colaboradorId) {
                const opt = select.options[select.selectedIndex];
                colaboradorObj = { id: colaboradorId, name: opt.getAttribute('data-nome') };
            }

            close();
            await this._executarChamado(pautaId, assistido, pauta, colaboradorObj);
        };
    },

    async _executarChamado(pautaId, assistido, pauta, colaboradorDestinoObj) {
        const app = this._app;
        this._registrarUltimoChamado(pautaId, assistido, pauta.name);

        const updates = {
            status: 'emAtendimento',
            inAttendanceTime: new Date().toISOString()
        };

        if (colaboradorDestinoObj) {
            updates.assignedCollaborator = {
                id: colaboradorDestinoObj.id,
                name: colaboradorDestinoObj.name
            };
        }

        await PautaService.updateStatus(app.db, pautaId, assistido.id, updates, app.currentUserName);

        if (colaboradorDestinoObj && colaboradorDestinoObj.id) {
            try {
                const colabDocRef = doc(app.db, "pautas", pautaId, "collaborators", colaboradorDestinoObj.id);
                await updateDoc(colabDocRef, {
                    status: 'ocupado',
                    currentAttendance: assistido.id
                });
            } catch (e) {
                console.warn("Aviso: falha ao atualizar status do colaborador para ocupado.", e);
            }
        }

        showNotification(`Chamado: ${assistido.name}`, "success");
        playSound('chime');
    },

    async _registrarUltimoChamado(pautaId, assistido, pautaNome) {
        const pauta = estado.pautasHoje.find(p => p.id === pautaId);

        const chamado = {
            nome:      assistido.name,
            assunto:   assistido.subject || '',
            local:     pautaNome,
            pautaNome: pautaNome,
            sala:      pauta?.sala || assistido.room || '',
            pautaId,
            hora:      new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            timestamp: Date.now(),
        };

        const chave = `sigep_chamados_${pautaId}`;
        let historico = [];
        try { historico = JSON.parse(localStorage.getItem(chave)) || []; } catch { historico = []; }
        historico.unshift(chamado);
        if (historico.length > 5) historico = historico.slice(0, 5);
        localStorage.setItem(chave, JSON.stringify(historico));

        localStorage.setItem('sigep_ultimo_chamado_global', JSON.stringify(chamado));

        try {
            const painelRef = doc(this._app.db, "pautas", pautaId, "painel", "ultimoChamado");
            await setDoc(painelRef, { atual: chamado, historico: historico }, { merge: true });
        } catch (error) {
            console.error("Erro ao atualizar último chamado no Firebase:", error);
        }

        window.dispatchEvent(new CustomEvent('sigep:chamado', { detail: chamado }));
    },

    _atualizarPainelPublicoUltimoChamado(pautaId) {
        const assistidos = estado.assistidosPorPauta[pautaId] || [];
        const recemChamados = assistidos.filter(a =>
            a.status === 'emAtendimento' &&
            a.inAttendanceTime &&
            (Date.now() - new Date(a.inAttendanceTime).getTime()) < 10000
        );

        if (recemChamados.length > 0) {
            const pauta = estado.pautasHoje.find(p => p.id === pautaId);
            if (pauta) {
                this._registrarUltimoChamado(pautaId, recemChamados[0], pauta.name);
            }
        }
    },

    // ── INTERAÇÕES ─────────────────────────────────────────────────────────────

    _setupInteracoes() {
        document.getElementById('rc-btn-fechar')?.addEventListener('click', () => this.fechar());

        document.getElementById('rc-btn-atualizar')?.addEventListener('click', async () => {
            this._cancelarListeners();
            await this._carregarPautasPorRecepcao();
            showNotification("Dados atualizados!", "info");
        });

        document.getElementById('rc-btn-configurar-tv')?.addEventListener('click', () => {
            if (estado.pautasHoje.length === 0) {
                showNotification("Nenhuma pauta ativa nesta recepção.", "warning");
                return;
            }
            this._abrirModalConfigTV();
        });

        document.getElementById('rc-grade-pautas')?.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-pauta-id]');
            if (!btn) return;
            const pautaId = btn.dataset.pautaId;

            if (btn.classList.contains('rc-btn-checkin')) {
                this._abrirModalCheckin(pautaId);
            } else if (btn.classList.contains('rc-btn-chamar')) {
                this._chamarProximo(pautaId);
            } else if (btn.classList.contains('rc-btn-abrir')) {
                this._abrirFoco(pautaId);
            } else if (btn.classList.contains('rc-btn-tv-individual')) {
                const pauta = estado.pautasHoje.find(p => p.id === pautaId);
                const nomeTV = encodeURIComponent(pauta ? pauta.name : 'Painel de Atendimento');
                const baseUrl = window.location.href.split('?')[0];
                const urlIsolada = `${baseUrl}?painel=true&pautas=${pautaId}&nome=${nomeTV}&modo=fila&som=1`;
                window.open(urlIsolada, '_blank');
            }
        });

        document.querySelectorAll('.rc-filtro-tipo').forEach(btn => {
            btn.addEventListener('click', async () => {
                this._filtroTipo = btn.dataset.tipo;
                this._cancelarListeners();
                await this._carregarPautasPorRecepcao();
            });
        });
    },

    // ── MODAL DE CONFIGURAÇÃO DA TV ────────────────────────────────────────────

    _abrirModalConfigTV() {
        const recepcao = this._recepcaoAtual;
        if (!recepcao) return;

        const cacheConfig = JSON.parse(localStorage.getItem(`sigep_tv_config_${recepcao.id}`) || '{}');
        const modoAtual  = cacheConfig.modo || recepcao.modoVisualizacao || 'fila';
        const videoAtual = cacheConfig.video !== undefined ? cacheConfig.video : (recepcao.videoUrl || '');
        const somAtual   = cacheConfig.som !== undefined ? cacheConfig.som : true;

        const modos = [
            ['fila',  'list',      'Lista (fila)', 'Cards e acompanhamento'],
            ['tv',    'tv',        'TV padrão',    'Painel com histórico'],
            ['video', 'megaphone', 'TV + vídeo',   'Institucional e chamados'],
        ];

        const { modal, close } = criarModal({
            id: 'rc-modal-config-tv',
            titulo: 'Configurar TV / painel',
            subtitulo: escapeHTML(recepcao.nome || 'Recepção Central'),
            largura: '640px',
            corpo: `
                <div class="rc-modal-body space-y-6">
                    <div>
                        <span class="rc-label">Modo de visualização</span>
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            ${modos.map(([v, ic, t, d]) => `
                                <label class="rc-option tv-modo-card ${modoAtual === v ? 'is-selected' : ''}" style="flex-direction:column;text-align:center;padding:16px 10px">
                                    <input type="radio" name="tv_modo" value="${v}" class="hidden" ${modoAtual === v ? 'checked' : ''}>
                                    <span style="color:var(--rc-brand)">${ico(ic, 24)}</span>
                                    <span>${t}<br><span class="text-[11px] font-medium" style="color:var(--rc-muted)">${d}</span></span>
                                </label>`).join('')}
                        </div>
                    </div>

                    <div>
                        <label class="rc-label" for="tv_video_url">Link do YouTube (modo vídeo)</label>
                        <input type="text" id="tv_video_url" value="${escapeHTML(videoAtual)}" class="rc-input" style="font-family:ui-monospace,monospace;font-size:13px" placeholder="https://www.youtube.com/watch?v=…">
                    </div>

                    <div>
                        <span class="rc-label">Aviso sonoro</span>
                        <div class="grid grid-cols-2 gap-3">
                            <label class="rc-option tv-som-card ${somAtual === true ? 'is-selected' : ''}">
                                <input type="radio" name="tv_som" value="1" ${somAtual === true ? 'checked' : ''}> Ativado
                            </label>
                            <label class="rc-option tv-som-card ${somAtual === false ? 'is-selected' : ''}">
                                <input type="radio" name="tv_som" value="0" ${somAtual === false ? 'checked' : ''}> Silencioso
                            </label>
                        </div>
                    </div>

                    <div class="rounded-xl" style="padding:14px;background:var(--rc-brand-soft);border:1px solid #c7d2fe">
                        <span class="rc-label" style="color:var(--rc-brand)">Link gerado (copie para a Smart TV)</span>
                        <textarea id="tv_preview_link" readonly class="w-full bg-transparent border-0 resize-none outline-none text-xs" style="font-family:ui-monospace,monospace;color:var(--rc-brand);height:48px"></textarea>
                    </div>
                </div>`,
            rodape: `
                <div class="rc-modal-foot flex-col sm:flex-row">
                    <button id="rc-btn-tv-cancelar" class="rc-btn" data-rc-close>Cancelar</button>
                    <button id="rc-btn-tv-salvar" class="rc-btn rc-btn--dark">Copiar link</button>
                    <button id="rc-btn-tv-abrir" class="rc-btn rc-btn--primary">${ico('tv', 15)} Abrir painel</button>
                </div>`,
        });

        const updatePreview = () => {
            const modo  = modal.querySelector('input[name="tv_modo"]:checked').value;
            const video = encodeURIComponent(document.getElementById('tv_video_url').value.trim());
            const som   = modal.querySelector('input[name="tv_som"]:checked').value;

            const ids  = estado.pautasHoje.map(p => p.id).join(',');
            const nome = encodeURIComponent(recepcao.nome || this._unidadeAtual?.nome || 'Recepção');

            const baseUrl = window.location.href.split('?')[0];
            const link = `${baseUrl}?painel=true&pautas=${ids}&nome=${nome}&modo=${modo}&video=${video}&som=${som}`;

            document.getElementById('tv_preview_link').value = link;
            return { link, modo, video, som };
        };

        const ligarGrupo = (name, cardClass) => {
            modal.querySelectorAll(`input[name="${name}"]`).forEach(radio => {
                radio.addEventListener('change', () => {
                    modal.querySelectorAll(`.${cardClass}`).forEach(c => c.classList.remove('is-selected'));
                    radio.closest(`.${cardClass}`).classList.add('is-selected');
                    updatePreview();
                });
            });
        };
        ligarGrupo('tv_modo', 'tv-modo-card');
        ligarGrupo('tv_som', 'tv-som-card');

        document.getElementById('tv_video_url').addEventListener('input', updatePreview);
        updatePreview();

        const saveConfig = async () => {
            const data = updatePreview();
            const configToSave = { modo: data.modo, video: decodeURIComponent(data.video), som: data.som === '1' };

            localStorage.setItem(`sigep_tv_config_${recepcao.id}`, JSON.stringify(configToSave));

            try {
                await updateDoc(doc(this._app.db, "recepcoes", recepcao.id), {
                    modoVisualizacao: configToSave.modo,
                    videoUrl: configToSave.video
                });
            } catch (e) { /* configuração local já salva */ }

            return data.link;
        };

        document.getElementById('rc-btn-tv-abrir').addEventListener('click', async () => {
            const link = await saveConfig();
            window.open(link, '_blank');
            close();
        });

        document.getElementById('rc-btn-tv-salvar').addEventListener('click', async () => {
            const link = await saveConfig();
            navigator.clipboard.writeText(link).then(() => {
                showNotification("Configuração salva e link copiado!", "success");
                close();
            }).catch(() => showNotification("Erro ao copiar o link.", "error"));
        });
    },

    // ── MODAL CHECK-IN RÁPIDO ──────────────────────────────────────────────────

    _abrirModalCheckin(pautaId) {
        const pauta = estado.pautasHoje.find(p => p.id === pautaId);
        if (!pauta) return;

        const assistidos = estado.assistidosPorPauta[pautaId] || [];
        const naPauta    = assistidos.filter(a => a.status === 'pauta');

        const lista = naPauta.length === 0
            ? `<div class="text-center py-10">
                   <div class="mx-auto mb-3 flex items-center justify-center rounded-full" style="width:44px;height:44px;background:var(--rc-ok-soft);color:var(--rc-ok)">${ico('check', 22)}</div>
                   <p class="text-sm font-semibold" style="color:var(--rc-muted)">Todos os agendados já chegaram.</p>
               </div>`
            : naPauta.map(a => `
                <div class="rc-person flex items-center justify-between gap-3 rc-linha" data-nome="${normalizeText(a.name)}">
                    <div class="min-w-0 flex-1">
                        <p class="font-bold text-sm truncate">${escapeHTML(a.name)}</p>
                        <p class="text-xs truncate mt-0.5" style="color:var(--rc-muted)">
                            ${a.numAgendamento ? `<span class="rc-badge rc-badge--mono mr-1">#${escapeHTML(String(a.numAgendamento))}</span>` : ''}
                            ${a.scheduledTime ? `<b class="tabular-nums" style="color:var(--rc-warn)">${a.scheduledTime}</b> · ` : ''}${escapeHTML(a.subject || 'Sem assunto')}
                        </p>
                    </div>
                    <button class="rc-btn rc-btn--warn rc-btn--sm rc-modal-checkin-btn shrink-0" data-id="${a.id}">Check-in</button>
                </div>`).join('');

        const { modal, close } = criarModal({
            id: 'rc-modal-checkin',
            titulo: 'Check-in rápido',
            subtitulo: escapeHTML(pauta.name),
            corpo: `
                <div style="padding:14px 24px;border-bottom:1px solid var(--rc-line)">
                    <div class="relative">
                        <span class="absolute" style="left:12px;top:50%;transform:translateY(-50%);color:var(--rc-faint)">${ico('search', 16)}</span>
                        <input type="search" id="rc-modal-busca" placeholder="Buscar assistido nesta pauta" class="rc-input" style="padding-left:36px" autocomplete="off">
                    </div>
                </div>
                <div class="rc-modal-body space-y-2" id="rc-modal-lista" style="padding:14px 20px">${lista}</div>`,
        });

        document.getElementById('rc-modal-busca')?.focus();

        document.getElementById('rc-modal-busca').addEventListener('input', (e) => {
            const t = normalizeText(e.target.value);
            modal.querySelectorAll('.rc-linha').forEach(l => {
                l.style.display = (l.dataset.nome || '').includes(t) ? '' : 'none';
            });
        });

        modal.querySelectorAll('.rc-modal-checkin-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                close();
                this._abrirModalCheckinComHorario(pautaId, btn.dataset.id);
            });
        });
    },

    // ── FECHAR ─────────────────────────────────────────────────────────────────

    fechar() {
        this._cancelarListeners();
        const app = this._app;
        if (app && app.router) {
            app.router.navigate('pautas');
        } else if (app && typeof app.showPautaSelectionScreen === 'function') {
            app.showPautaSelectionScreen();
        }
    },

    // ── ABRIR (chamado pelo main.js) ───────────────────────────────────────────

    async abrir(app) {
        const container = document.getElementById('recepcao-central-container');
        if (!container) {
            console.error("Container #recepcao-central-container não encontrado no index.html");
            return;
        }

        const { UIService } = await import('./ui.js');
        UIService.showScreen('recepcaoCentral');

        await this.init(app);
    }
};

export const RecepçãoCentralService = RecepcaoCentralService;
export default RecepcaoCentralService;
