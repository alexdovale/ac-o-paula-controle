// js/recepcaoCentral.js - DASHBOARD EXECUTIVO (UI REFINADA + MULTI-TENANT)

import {
    collection, doc, onSnapshot, updateDoc, setDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showNotification, playSound, escapeHTML, normalizeText } from './utils.js';
import { PautaService } from './pauta.js';
import { PautaConfigService } from './pautaConfig.js';
import { RecepcaoConfigService } from './recepcaoConfig.js';
import { flatSubjects } from './assuntos.js';
import { injetarEstilos, ico } from './rcDesign.js';

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

    _chamadosRegistrados: new Set(),

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

        this._abrirModalChamada(pautaId, assistido, colaboradores, pauta);
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

        this._abrirModalChamada(pautaId, proximo, colaboradores, pauta);
    },

    _abrirModalChamada(pautaId, assistido, colaboradores, pauta) {
        const ROTULOS = ['Sala', 'Recepção', 'Vara', 'Guichê', 'Mesa', 'Balcão'];
        const chave = `sigep_local_chamada_${pautaId}`;
        let salvo = null;
        try { salvo = JSON.parse(localStorage.getItem(chave)); } catch { salvo = null; }

        const rotuloInicial = salvo?.rotulo || 'Sala';
        const ehPadrao = ROTULOS.includes(rotuloInicial);
        const valorInicial = salvo?.valor ?? (pauta?.sala || '');

        const ordenados = [...colaboradores].sort((a, b) => {
            const aLivre = a.status === 'disponivel' || !a.status;
            const bLivre = b.status === 'disponivel' || !b.status;
            if (aLivre === bLivre) return (a.nome || '').localeCompare(b.nome || '');
            return aLivre ? -1 : 1;
        });
        const opcoesColab = ordenados.map(c => {
            const livre = c.status === 'disponivel' || !c.status;
            return `<option value="${c.id}" data-nome="${escapeHTML(c.nome)}">${escapeHTML(c.nome)} — ${escapeHTML(c.cargo || 'Membro')} (${livre ? 'livre' : 'ocupado'})</option>`;
        }).join('');

        const { close } = criarModal({
            id: 'rc-modal-chamada',
            titulo: 'Chamar assistido',
            subtitulo: escapeHTML(assistido.name),
            corpo: `
                <div class="rc-modal-body space-y-4">
                    <div class="grid grid-cols-5 gap-3">
                        <div class="col-span-2">
                            <label class="rc-label" for="rc-chamada-rotulo">Tipo de local</label>
                            <select id="rc-chamada-rotulo" class="rc-input">
                                ${ROTULOS.map(r => `<option value="${r}" ${ehPadrao && r === rotuloInicial ? 'selected' : ''}>${r}</option>`).join('')}
                                <option value="__outro" ${ehPadrao ? '' : 'selected'}>Outro…</option>
                            </select>
                        </div>
                        <div class="col-span-3">
                            <label class="rc-label" for="rc-chamada-valor">Número / nome</label>
                            <input type="text" id="rc-chamada-valor" class="rc-input" value="${escapeHTML(valorInicial)}" placeholder="Ex.: 3, DD, 2ª Vara" autocomplete="off">
                        </div>
                    </div>
                    <div id="rc-chamada-outro-wrap" class="${ehPadrao ? 'hidden' : ''}">
                        <label class="rc-label" for="rc-chamada-outro">Nome do tipo de local</label>
                        <input type="text" id="rc-chamada-outro" class="rc-input" value="${ehPadrao ? '' : escapeHTML(rotuloInicial)}" placeholder="Ex.: Cartório, Gabinete">
                    </div>

                    <div class="rounded-xl text-center" style="padding:14px;background:#fff;border:1px dashed var(--rc-line)">
                        <p class="rc-eyebrow mb-1">Aparecerá na TV</p>
                        <p id="rc-chamada-preview" class="text-lg font-extrabold"></p>
                    </div>

                    ${colaboradores.length > 0 ? `
                    <div>
                        <label class="rc-label" for="rc-select-colaborador-destino">Colaborador (opcional)</label>
                        <select id="rc-select-colaborador-destino" class="rc-input">
                            <option value="">Sem colaborador específico</option>
                            ${opcoesColab}
                        </select>
                    </div>` : ''}
                </div>`,
            rodape: `
                <div class="rc-modal-foot">
                    <button type="button" class="rc-btn" data-rc-close style="flex:.6">Cancelar</button>
                    <button type="button" id="rc-btn-chamada-confirmar" class="rc-btn rc-btn--ok" style="flex:1.4">${ico('megaphone', 15)} Chamar</button>
                </div>`,
        });

        const selRotulo = document.getElementById('rc-chamada-rotulo');
        const inpValor  = document.getElementById('rc-chamada-valor');
        const inpOutro  = document.getElementById('rc-chamada-outro');
        const lerLocal = () => {
            const rotulo = selRotulo.value === '__outro' ? inpOutro.value.trim() : selRotulo.value;
            return { rotulo, valor: inpValor.value.trim() };
        };
        const atualizarPreview = () => {
            document.getElementById('rc-chamada-outro-wrap').classList.toggle('hidden', selRotulo.value !== '__outro');
            const { rotulo, valor } = lerLocal();
            document.getElementById('rc-chamada-preview').textContent = [rotulo, valor].filter(Boolean).join(' ') || '—';
        };
        [selRotulo, inpValor, inpOutro].forEach(el => el.addEventListener('input', atualizarPreview));
        selRotulo.addEventListener('change', atualizarPreview);
        atualizarPreview();
        inpValor.focus();
        inpValor.select();

        const confirmar = async () => {
            const local = lerLocal();
            try { localStorage.setItem(chave, JSON.stringify(local)); } catch { /* ignora */ }

            const select = document.getElementById('rc-select-colaborador-destino');
            let colaboradorObj = null;
            if (select && select.value) {
                const opt = select.options[select.selectedIndex];
                colaboradorObj = { id: select.value, name: opt.getAttribute('data-nome') };
            }
            close();
            await this._executarChamado(pautaId, assistido, pauta, colaboradorObj, local);
        };
        document.getElementById('rc-btn-chamada-confirmar').onclick = confirmar;
        inpValor.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); confirmar(); } });
    },

    async _executarChamado(pautaId, assistido, pauta, colaboradorDestinoObj, local = null) {
        const app = this._app;
        const inAttendanceTime = new Date().toISOString();

        const updates = { status: 'emAtendimento', inAttendanceTime };
        if (local && (local.rotulo || local.valor)) updates.localChamada = { rotulo: local.rotulo || '', valor: local.valor || '' };
        if (colaboradorDestinoObj) {
            updates.assignedCollaborator = { id: colaboradorDestinoObj.id, name: colaboradorDestinoObj.name };
        }

        // Marca como já registrado: evita que o listener republique o chamado (e a TV toque de novo)
        this._chamadosRegistrados.add(`${assistido.id}:${inAttendanceTime}`);
        this._registrarUltimoChamado(pautaId, assistido, pauta.name, updates.localChamada || null);

        await PautaService.updateStatus(app.db, pautaId, assistido.id, updates, app.currentUserName);

        if (colaboradorDestinoObj && colaboradorDestinoObj.id) {
            try {
                await updateDoc(doc(app.db, "pautas", pautaId, "collaborators", colaboradorDestinoObj.id), {
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

    async _registrarUltimoChamado(pautaId, assistido, pautaNome, local = null) {
        const pauta = estado.pautasHoje.find(p => p.id === pautaId);
        const loc = local || assistido.localChamada || null;
        const rotulo = loc?.rotulo || '';
        const valor  = loc ? (loc.valor || '') : (pauta?.sala || assistido.room || '');

        const chamado = {
            nome:        assistido.name,
            assunto:     assistido.subject || '',
            local:       pautaNome,
            pautaNome:   pautaNome,
            sala:        valor,
            rotuloLocal: rotulo,
            localTexto:  [rotulo, valor].filter(Boolean).join(' '),
            pautaId,
            hora:        new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            timestamp:   Date.now(),
        };

        const chave = `sigep_chamados_${pautaId}`;
        let historico = [];
        try { historico = JSON.parse(localStorage.getItem(chave)) || []; } catch { historico = []; }
        historico.unshift(chamado);
        if (historico.length > 5) historico = historico.slice(0, 5);
        localStorage.setItem(chave, JSON.stringify(historico));
        localStorage.setItem('sigep_ultimo_chamado_global', JSON.stringify(chamado));

        try {
            await setDoc(doc(this._app.db, "pautas", pautaId, "painel", "ultimoChamado"),
                { atual: chamado, historico }, { merge: true });
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
            (Date.now() - new Date(a.inAttendanceTime).getTime()) < 10000 &&
            !this._chamadosRegistrados.has(`${a.id}:${a.inAttendanceTime}`)
        );

        if (recemChamados.length > 0) {
            const pauta = estado.pautasHoje.find(p => p.id === pautaId);
            if (pauta) {
                const a = recemChamados[0];
                this._chamadosRegistrados.add(`${a.id}:${a.inAttendanceTime}`);
                this._registrarUltimoChamado(pautaId, a, pauta.name);
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

                    <div>
                        <span class="rc-label">Logo do painel público</span>
                        <div class="flex items-center gap-4 rc-surface" style="padding:14px">
                            <div id="tv-logo-preview" class="flex items-center justify-center shrink-0" style="width:150px;height:64px;border-radius:10px;background:#f8fafc;border:1px dashed var(--rc-line);overflow:hidden"></div>
                            <div class="flex-1 min-w-0">
                                <div class="flex flex-wrap gap-2">
                                    <button type="button" id="tv-logo-enviar" class="rc-btn rc-btn--sm">Enviar imagem</button>
                                    <button type="button" id="tv-logo-remover" class="rc-btn rc-btn--ghost rc-btn--sm">Usar logo padrão</button>
                                    <input type="file" id="tv-logo-file" accept="image/png,image/jpeg,image/webp,image/svg+xml" class="hidden">
                                </div>
                                <p class="text-xs mt-2" style="color:var(--rc-muted)">PNG, JPG, WebP ou SVG. A marca "Tecnologia SIGEP" continua aparecendo abaixo da logo do órgão.</p>
                            </div>
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

        // ── Logo do painel público ────────────────────────────────────────────
        let logoAtual = recepcao.logoPainel || '';
        const desenharPreview = () => {
            const box = document.getElementById('tv-logo-preview');
            box.replaceChildren();
            if (logoAtual) {
                const img = document.createElement('img');
                img.src = logoAtual; img.alt = 'Logo do órgão';
                img.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain';
                box.appendChild(img);
            } else {
                const t = document.createElement('span');
                t.className = 'text-xs font-semibold'; t.style.color = 'var(--rc-faint)'; t.textContent = 'Logo SIGEP (padrão)';
                box.appendChild(t);
            }
        };
        desenharPreview();

        const reduzirImagem = (file) => new Promise((resolve, reject) => {
            if (!/^image\//.test(file.type)) return reject(new Error('Arquivo não é uma imagem.'));
            if (file.size > 5 * 1024 * 1024) return reject(new Error('Imagem maior que 5 MB.'));
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
            reader.onload = () => {
                if (file.type === 'image/svg+xml') {
                    return reader.result.length > 400000 ? reject(new Error('SVG muito grande.')) : resolve(reader.result);
                }
                const img = new Image();
                img.onerror = () => reject(new Error('Imagem inválida.'));
                img.onload = () => {
                    const escala = Math.min(1, 160 / img.height, 480 / img.width);
                    const c = document.createElement('canvas');
                    c.width = Math.max(1, Math.round(img.width * escala));
                    c.height = Math.max(1, Math.round(img.height * escala));
                    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                    const out = c.toDataURL('image/png');
                    out.length > 500000 ? reject(new Error('Imagem complexa demais. Use uma versão mais simples.')) : resolve(out);
                };
                img.src = reader.result;
            };
            reader.readAsDataURL(file);
        });

        document.getElementById('tv-logo-enviar').addEventListener('click', () => document.getElementById('tv-logo-file').click());
        document.getElementById('tv-logo-file').addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try { logoAtual = await reduzirImagem(file); desenharPreview(); }
            catch (err) { showNotification(err.message || 'Não foi possível usar esta imagem.', 'error'); }
            e.target.value = '';
        });
        document.getElementById('tv-logo-remover').addEventListener('click', () => { logoAtual = ''; desenharPreview(); });

        const saveConfig = async () => {
            const data = updatePreview();
            const configToSave = { modo: data.modo, video: decodeURIComponent(data.video), som: data.som === '1' };

            localStorage.setItem(`sigep_tv_config_${recepcao.id}`, JSON.stringify(configToSave));

            try {
                await updateDoc(doc(this._app.db, "recepcoes", recepcao.id), {
                    modoVisualizacao: configToSave.modo,
                    videoUrl: configToSave.video,
                    logoPainel: logoAtual || null
                });
                recepcao.logoPainel = logoAtual || '';
            } catch (e) { /* configuração local já salva */ }

            // O painel público lê a logo de pautas/{id}/painel/config (mesmo local do "último chamado")
            const orgaoId = this._app.currentUser?.orgaoId || null;
            await Promise.all(estado.pautasHoje.map(p =>
                setDoc(doc(this._app.db, "pautas", p.id, "painel", "config"),
                    { logoUrl: logoAtual || '', orgaoId, atualizadoEm: new Date().toISOString() }, { merge: true })
                    .catch(err => console.warn('Falha ao salvar logo do painel:', err))
            ));

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
