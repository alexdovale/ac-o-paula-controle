import {
    collection, doc, onSnapshot, updateDoc, setDoc, getDocs, query, where
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showNotification, playSound, escapeHTML, normalizeText } from './utils.js';
import { PautaService } from './pauta.js';
import { PautaConfigService } from './pautaConfig.js';
import { RecepcaoConfigService } from './recepcaoConfig.js';
import { logAction } from './admin.js';

// ─── ESTADO INTERNO ────────────────────────────────────────────────────────────

const estado = {
    pautasHoje:            [],
    assistidosPorPauta:    {},
    colaboradoresPorPauta: {},
    unsubscribers:         [],
    pautaFocadaId:         null,
    modoVisao:             'grade',
    termoBusca:            '',
    recepcaoAtual:         null,
    unidadeAtual:          null,
    recepcoesDisponiveis:  [],
};

// ─── HELPERS ───────────────────────────────────────────────────────────────────

function statusLabel(status) {
    const map = {
        pauta:                  { txt: 'Na Pauta',       cor: 'bg-slate-100 text-slate-600'  },
        aguardando:             { txt: 'Aguardando',     cor: 'bg-amber-100 text-amber-700'  },
        emAtendimento:          { txt: 'Em Atendimento', cor: 'bg-blue-100 text-blue-700'    },
        aguardandoDistribuicao: { txt: 'Distribuição',   cor: 'bg-cyan-100 text-cyan-700'    },
        atendido:               { txt: 'Atendido',       cor: 'bg-green-100 text-green-700'  },
        faltoso:                { txt: 'Faltoso',        cor: 'bg-red-100 text-red-700'      },
    };
    return map[status] || { txt: status, cor: 'bg-gray-100 text-gray-600' };
}

function contadores(assistidos) {
    return {
        total:         assistidos.length,
        aguardando:    assistidos.filter(a => a.status === 'aguardando').length,
        emAtendimento: assistidos.filter(a => a.status === 'emAtendimento').length,
        atendidos:     assistidos.filter(a => a.status === 'atendido').length,
        faltosos:      assistidos.filter(a => a.status === 'faltoso').length,
        distribuicao:  assistidos.filter(a => a.status === 'aguardandoDistribuicao').length,
    };
}

function colaboradoresStatus(colaboradores) {
    return {
        livres:  colaboradores.filter(c => c.status === 'disponivel' || !c.status),
        ocupados: colaboradores.filter(c => c.status === 'ocupado'),
    };
}

function renderVerificacoesBadge(a) {
    const docs = a.verifications || a.documentos || a.verificacoes || a.customFields?.verifications;
    if (!docs) return '';
    let htmlLista = '';
    if (Array.isArray(docs)) {
        const itens = docs.map(d => typeof d === 'string' ? d : (d.nome || d.name || d.label || 'Doc'));
        if (!itens.length) return '';
        htmlLista = itens.map(i => `<span class="inline-block bg-slate-100 text-slate-600 border border-slate-200 text-[9px] px-1.5 py-0.5 rounded mr-1 mb-1 shadow-sm">📄 ${escapeHTML(i)}</span>`).join('');
    } else if (typeof docs === 'object') {
        const keys = Object.keys(docs);
        if (!keys.length) return '';
        htmlLista = keys.map(k => {
            const checked = docs[k];
            return `<span class="inline-block ${checked ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-600 border-red-200'} border text-[9px] px-1.5 py-0.5 rounded mr-1 mb-1 shadow-sm">${checked ? '✔️' : '❌'} ${escapeHTML(k)}</span>`;
        }).join('');
    }
    return htmlLista ? `<div class="mt-1.5 flex flex-wrap gap-0.5">${htmlLista}</div>` : '';
}

// ─── SERVIÇO PRINCIPAL ─────────────────────────────────────────────────────────

export const RecepçãoCentralService = {

    // ── INICIALIZAÇÃO ──────────────────────────────────────────────────────────

    async init(app) {
        this._app = app;
        this._filtroTipo = this._filtroTipo || 'todos';

        const role = app.currentUser?.role;
        if (!['apoio', 'admin', 'superadmin'].includes(role)) {
            showNotification("Acesso restrito à Recepção Central.", "warning");
            return;
        }

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
            this._unidadeAtual  = { id: recepcoes[0].unidadeId, nome: recepcoes[0].unidadeNome };
            await this._carregarPautasPorRecepcao();
        } else {
            this._renderSelectorRecepcoes(recepcoes);
        }
    },

    _renderSemPermissao() {
        const container = document.getElementById('recepcao-central-container');
        if (!container) return;
        container.innerHTML = `
            <div class="max-w-7xl mx-auto px-4 py-12 text-center">
                <div class="bg-amber-50 border border-amber-200 rounded-2xl p-8">
                    <span class="text-6xl block mb-4">🔒</span>
                    <h3 class="text-xl font-bold text-amber-800 mb-2">Acesso Restrito</h3>
                    <p class="text-amber-600">Você não tem permissão para acessar nenhuma recepção.</p>
                    <button id="rc-voltar-sem-permissao" class="mt-6 bg-slate-700 text-white px-6 py-2 rounded-lg hover:bg-slate-800 transition">Voltar</button>
                </div>
            </div>`;
        document.getElementById('rc-voltar-sem-permissao')?.addEventListener('click', () => this.fechar());
    },

    _renderSelectorRecepcoes(recepcoes) {
        const container = document.getElementById('recepcao-central-container');
        if (!container) return;
        container.innerHTML = `
            <div class="max-w-7xl mx-auto px-4 py-8">
                <div class="flex justify-center mb-4">
                    <div class="bg-[#0d1117] border border-slate-700 rounded-2xl p-3 shadow-md">
                        <img src="https://raw.githubusercontent.com/alexdovale/ac-o-paula-controle/main/imagem.png" alt="Logo SIGEP" class="h-10 w-auto object-contain">
                    </div>
                </div>
                ${RecepcaoConfigService.renderSelectorRecepcoes(recepcoes)}
                <div class="mt-8 flex justify-center">
                    <button id="rc-voltar-selector" class="bg-slate-600 text-white font-bold px-6 py-2.5 rounded-xl hover:bg-slate-700 transition shadow-sm">← Voltar para o Início</button>
                </div>
            </div>`;

        document.querySelectorAll('.rc-selector-recepcao').forEach(btn => {
            btn.addEventListener('click', async () => {
                const recepcaoEncontrada = recepcoes.find(r => r.id === btn.dataset.recepcaoId);
                if (recepcaoEncontrada) {
                    this._recepcaoAtual = recepcaoEncontrada;
                    this._unidadeAtual  = { id: recepcaoEncontrada.unidadeId, nome: recepcaoEncontrada.unidadeNome };
                    await this._carregarPautasPorRecepcao();
                }
            });
        });

        document.getElementById('rc-voltar-selector')?.addEventListener('click', () => this.fechar());
    },

    // ── CARREGAR PAUTAS ────────────────────────────────────────────────────────

    async _carregarPautasPorRecepcao() {
        const app = this._app;
        this._mostrarLoading();

        let pautas = await PautaConfigService.buscarPautasHoje(
            app.db, app.currentUser.uid, app.currentUser.email, app.currentUser.role
        );

        const hoje = new Date().toISOString().slice(0, 10);
        pautas = pautas.filter(p => {
            const data = p.dataAtuacao || p.data || p.createdAt || '';
            return !data || data.slice(0, 10) === hoje;
        });

        if (this._filtroTipo && this._filtroTipo !== 'todos') {
            pautas = pautas.filter(p =>
                (p.tipo || p.type || '').toLowerCase() === this._filtroTipo.toLowerCase()
            );
        }

        if (this._recepcaoAtual && this._recepcaoAtual.tipo !== 'central' && !this._recepcaoAtual.verTudo) {
            pautas = RecepcaoConfigService.filtrarPautasPorRecepcao(pautas, this._recepcaoAtual);
        }

        estado.pautasHoje = pautas;
        await this._iniciarListeners();
        this._renderTelaComContexto();
    },

    _mostrarLoading() {
        const container = document.getElementById('recepcao-central-container');
        if (!container) return;
        container.innerHTML = `
            <div class="flex justify-center items-center h-64">
                <div class="text-center">
                    <div class="loader-small mx-auto mb-4"></div>
                    <p class="text-slate-500">Carregando pautas da recepção...</p>
                </div>
            </div>`;
    },

    async _iniciarListeners() {
        const app = this._app;
        this._cancelarListeners();

        for (const pauta of estado.pautasHoje) {
            const unsubAt = onSnapshot(collection(app.db, "pautas", pauta.id, "attendances"), (snap) => {
                estado.assistidosPorPauta[pauta.id] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                if (estado.modoVisao === 'grade') this._atualizarCardPauta(pauta.id);
                else if (estado.pautaFocadaId === pauta.id) this._renderFoco(pauta.id);
                this._atualizarPainelPublicoUltimoChamado(pauta.id);
            });
            const unsubCo = onSnapshot(collection(app.db, "pautas", pauta.id, "collaborators"), (snap) => {
                estado.colaboradoresPorPauta[pauta.id] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                if (estado.modoVisao === 'grade') this._atualizarCardPauta(pauta.id);
                else if (estado.pautaFocadaId === pauta.id) this._renderFoco(pauta.id);
            });
            estado.unsubscribers.push(unsubAt, unsubCo);
        }
    },

    _cancelarListeners() {
        estado.unsubscribers.forEach(u => u && u());
        estado.unsubscribers = [];
    },

    // ── RENDER TELA PRINCIPAL ─────────────────────────────────────────────────

    _renderTelaComContexto() {
        const container = document.getElementById('recepcao-central-container');
        if (!container) return;

        const contexto = RecepcaoConfigService.getContextoRecepcao(this._recepcaoAtual);
        const rec = this._recepcaoAtual || {};

        // Indicadores do modo configurado
        const MODOS = { fila: '📋 Fila', tv: '📺 TV Chamados', video: '🎬 TV + Vídeo' };
        const modoLabel = MODOS[rec.modoVisualizacao || 'fila'];
        const somLabel  = rec.somPadrao !== false ? '🔔 Com som' : '🔇 Sem som';
        const temVideo  = !!rec.videoUrl;

        container.innerHTML = `
            <div class="recepcao-central-wrap max-w-7xl mx-auto px-2 sm:px-4 py-4">

                <!-- Header da Recepção -->
                <div class="mb-4 ${contexto.cor} rounded-2xl p-4 shadow-lg">
                    <div class="flex items-center justify-between flex-wrap gap-3">
                        <div class="flex items-center gap-3">
                            <span class="text-3xl">${contexto.icone}</span>
                            <div>
                                <p class="text-xs text-white/60 font-bold uppercase tracking-wider">Recepção Atual</p>
                                <p class="font-black text-white text-lg">${contexto.titulo}</p>
                                <p class="text-sm text-white/70">${contexto.subtitulo}</p>
                            </div>
                        </div>
                        <button id="rc-trocar-recepcao" class="bg-white/20 hover:bg-white/30 text-white text-sm font-bold px-4 py-2 rounded-xl transition flex items-center gap-2">
                            🔄 Trocar Recepção
                        </button>
                    </div>
                </div>

                <!-- Barra de ações -->
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
                    <div>
                        <h2 class="text-2xl font-black text-slate-800 tracking-tight">🏛️ Painel de Atendimento</h2>
                        <p class="text-sm text-slate-500 mt-0.5">Pautas ativas — <span id="rc-data-hoje">${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</span></p>
                        <div class="flex items-center gap-2 mt-2 flex-wrap">
                            <span class="text-xs text-slate-400 font-bold uppercase tracking-wider">Tipo:</span>
                            ${['todos','agendamento','avulso','multisala','mutirao','plantao','acao_social'].map(t => `
                                <button class="rc-filtro-tipo text-xs px-3 py-1 rounded-full border font-bold transition
                                    ${(this._filtroTipo || 'todos') === t ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-500'}"
                                    data-tipo="${t}">
                                    ${t==='todos'?'🔀 Todos':t==='agendamento'?'📅 Agend.':t==='avulso'?'🚶 Avulso':t==='multisala'?'🏢 Multi-Sala':t==='mutirao'?'👥 Mutirão':t==='plantao'?'🚨 Plantão':'❤️ Ação Social'}
                                </button>`).join('')}
                        </div>
                    </div>

                    <div class="flex gap-2 w-full sm:w-auto flex-wrap">
                        <!-- Botão de configurar painel (abre a modal) -->
                        <button id="rc-btn-config-painel"
                            class="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-white border-2 border-indigo-300 text-indigo-700 font-bold px-4 py-2 rounded-xl transition hover:bg-indigo-50 text-sm shadow-sm"
                            title="Configurar como o painel será exibido na TV">
                            ⚙️ Configurar Painel
                        </button>

                        <button id="rc-btn-busca-global" class="flex-1 sm:flex-none flex items-center gap-2 bg-white border border-slate-300 text-slate-700 font-semibold px-4 py-2 rounded-lg hover:bg-slate-50 transition text-sm shadow-sm">
                            🔍 Busca Global
                        </button>
                        <button id="rc-btn-atualizar" class="flex items-center gap-2 bg-white border border-slate-300 text-slate-600 px-3 py-2 rounded-lg hover:bg-slate-50 transition shadow-sm" title="Recarregar">🔄</button>
                        <button id="rc-btn-fechar" class="flex items-center gap-2 bg-slate-800 text-white font-bold px-4 py-2 rounded-lg hover:bg-slate-900 transition text-sm shadow">← Voltar</button>
                    </div>
                </div>

                <!-- Indicador do modo configurado -->
                <div id="rc-indicador-config" class="mb-4 flex flex-wrap items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-600">
                    <span class="text-slate-400 uppercase tracking-wider font-black">Painel configurado:</span>
                    <span id="rc-badge-modo" class="px-3 py-1 rounded-full bg-slate-800 text-white">${modoLabel}</span>
                    <span id="rc-badge-som"  class="px-3 py-1 rounded-full ${rec.somPadrao !== false ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-slate-200 text-slate-500'}">${somLabel}</span>
                    ${temVideo ? `<span class="px-3 py-1 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">🎬 Vídeo configurado</span>` : ''}
                    <button id="rc-btn-abrir-painel" class="ml-auto flex items-center gap-2 bg-indigo-700 hover:bg-indigo-800 text-white font-bold px-4 py-2 rounded-lg transition text-xs shadow">
                        📺 Abrir Painel
                    </button>
                    <button id="rc-btn-copiar-link" class="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-bold px-4 py-2 rounded-lg transition text-xs shadow-sm">
                        🔗 Copiar Link
                    </button>
                </div>

                <!-- Busca global -->
                <div id="rc-busca-global-wrap" class="hidden mb-4">
                    <div class="relative">
                        <input type="search" id="rc-input-busca" placeholder="Buscar nome ou nº de agendamento em todas as pautas..."
                            class="w-full bg-white border border-slate-300 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 shadow-sm">
                        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">🔍</span>
                    </div>
                    <div id="rc-resultados-busca" class="mt-3 space-y-2 max-h-96 overflow-y-auto"></div>
                </div>

                <!-- Sumário -->
                <div id="rc-sumario" class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6"></div>

                <!-- Grade de pautas -->
                <div id="rc-grade-pautas" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4"></div>

                <!-- Painel de foco -->
                <div id="rc-painel-foco" class="hidden"></div>

            </div>
        `;

        this._renderGrade();
        this._renderSumario();
        this._setupInteracoes();

        document.getElementById('rc-trocar-recepcao')?.addEventListener('click', async () => {
            this._cancelarListeners();
            await this._carregarRecepcoesDoUsuario();
            await this._mostrarSelectorRecepcoes();
        });
    },

    // ── GRADE DE PAUTAS ────────────────────────────────────────────────────────

    _renderGrade() {
        const grade = document.getElementById('rc-grade-pautas');
        if (!grade) return;

        if (estado.pautasHoje.length === 0) {
            grade.innerHTML = `
                <div class="col-span-full text-center py-16 opacity-60">
                    <span class="text-5xl block mb-4">📋</span>
                    <p class="font-black text-slate-500 uppercase tracking-widest text-sm">Nenhuma pauta ativa para esta recepção.</p>
                    <p class="text-xs text-slate-400 mt-2">Selecione outra recepção ou crie uma nova pauta.</p>
                </div>`;
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
        const salaBadge = pauta.sala ? `<span class="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">🏠 ${escapeHTML(pauta.sala)}</span>` : '';

        const aguardando = PautaService.sortAguardando(
            assistidos.filter(a => a.status === 'aguardando'), pauta.ordemAtendimento
        );
        const listaNomes = aguardando.length === 0
            ? `<p class="text-[11px] text-slate-400 italic px-1">Nenhum na fila agora.</p>`
            : aguardando.slice(0, 5).map((a, i) => `
                <div class="flex items-center gap-2 py-1 border-b border-slate-100 last:border-0">
                    <span class="text-[10px] font-black text-amber-500 w-4 shrink-0">${i + 1}.</span>
                    <span class="text-xs font-semibold text-slate-700 truncate flex-1">
                        ${escapeHTML(a.name)}${a.numAgendamento ? `<span class="text-[9px] text-slate-400 font-mono ml-1">#${a.numAgendamento}</span>` : ''}
                    </span>
                    <span class="text-[9px] text-slate-400 shrink-0">${a.scheduledTime || ''}</span>
                </div>`).join('')
            + (aguardando.length > 5 ? `<p class="text-[10px] text-slate-400 text-center pt-1">+${aguardando.length - 5} mais na fila</p>` : '');

        return `
            <div id="rc-card-${pauta.id}" class="bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col" data-pauta-id="${pauta.id}">
                <div class="bg-slate-800 px-5 py-4 flex justify-between items-start gap-2">
                    <div class="min-w-0">
                        <h3 class="text-white font-black text-base truncate">${escapeHTML(pauta.name)}</h3>
                        <div class="flex items-center gap-2 mt-1">
                            <p class="text-slate-400 text-[10px] uppercase tracking-wider">${pauta.type || 'agendamento'}</p>
                            ${salaBadge}
                        </div>
                    </div>
                    <span class="text-white/60 text-xs font-mono shrink-0">${porcentagem}%</span>
                </div>
                <div class="h-1.5 bg-slate-100">
                    <div class="h-full bg-green-500 transition-all duration-500" style="width:${porcentagem}%"></div>
                </div>
                <div class="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
                    <div class="text-center py-3"><div class="text-xl font-black text-amber-600">${c.aguardando}</div><div class="text-[10px] text-slate-400 uppercase font-bold">Aguardando</div></div>
                    <div class="text-center py-3"><div class="text-xl font-black text-blue-600">${c.emAtendimento}</div><div class="text-[10px] text-slate-400 uppercase font-bold">Atendendo</div></div>
                    <div class="text-center py-3"><div class="text-xl font-black text-green-600">${c.atendidos}</div><div class="text-[10px] text-slate-400 uppercase font-bold">Atendidos</div></div>
                </div>
                <div class="px-5 pt-3 pb-2 border-b border-slate-100">
                    <p class="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">📋 Fila de Espera</p>
                    <div class="space-y-0">${listaNomes}</div>
                </div>
                <div class="px-5 py-3 flex items-center gap-3 border-b border-slate-100">
                    <div class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-green-500"></span><span class="text-xs font-bold text-green-700">${livres.length} livres</span></div>
                    <div class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-red-500"></span><span class="text-xs font-bold text-red-600">${ocupados.length} ocupados</span></div>
                    ${c.distribuicao > 0 ? `<div class="ml-auto"><span class="bg-cyan-100 text-cyan-700 text-[10px] font-black px-2 py-0.5 rounded border border-cyan-200">⚖️ ${c.distribuicao} dist.</span></div>` : ''}
                </div>
                <div class="px-5 py-3 flex gap-2 mt-auto">
                    <button class="rc-btn-checkin flex-1 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 font-bold text-xs py-2 rounded-lg transition" data-pauta-id="${pauta.id}">✅ Check-in</button>
                    <button class="rc-btn-chamar flex-1 bg-green-50 hover:bg-green-100 border border-green-200 text-green-800 font-bold text-xs py-2 rounded-lg transition" data-pauta-id="${pauta.id}">📣 Chamar</button>
                    <button class="rc-btn-acomp bg-slate-600 hover:bg-slate-700 text-white font-bold text-xs px-3 py-2 rounded-lg transition" data-pauta-id="${pauta.id}" title="Acompanhamento público">🔗</button>
                    <button class="rc-btn-abrir flex-1 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs py-2 rounded-lg transition" data-pauta-id="${pauta.id}">Abrir →</button>
                </div>
            </div>`;
    },

    _atualizarCardPauta(pautaId) {
        const card = document.getElementById(`rc-card-${pautaId}`);
        if (!card) return;
        const pauta = estado.pautasHoje.find(p => p.id === pautaId);
        if (!pauta) return;
        card.outerHTML = this._htmlCardPauta(pauta);
        this._renderSumario();
    },

    // ── SUMÁRIO ────────────────────────────────────────────────────────────────

    _renderSumario() {
        const el = document.getElementById('rc-sumario');
        if (!el) return;
        let totalAg = 0, totalAt = 0, totalEm = 0, totalDist = 0;
        for (const assistidos of Object.values(estado.assistidosPorPauta)) {
            const c = contadores(assistidos);
            totalAg += c.aguardando; totalAt += c.atendidos; totalEm += c.emAtendimento; totalDist += c.distribuicao;
        }
        el.innerHTML = `
            <div class="bg-white border border-slate-200 rounded-xl p-4 text-center shadow-sm"><div class="text-2xl font-black text-amber-600">${totalAg}</div><div class="text-xs text-slate-500 font-bold uppercase mt-1">Aguardando</div></div>
            <div class="bg-white border border-slate-200 rounded-xl p-4 text-center shadow-sm"><div class="text-2xl font-black text-blue-600">${totalEm}</div><div class="text-xs text-slate-500 font-bold uppercase mt-1">Em Atendimento</div></div>
            <div class="bg-white border border-slate-200 rounded-xl p-4 text-center shadow-sm"><div class="text-2xl font-black text-green-600">${totalAt}</div><div class="text-xs text-slate-500 font-bold uppercase mt-1">Atendidos</div></div>
            <div class="bg-white border border-slate-200 rounded-xl p-4 text-center shadow-sm"><div class="text-2xl font-black text-cyan-600">${totalDist}</div><div class="text-xs text-slate-500 font-bold uppercase mt-1">Distribuição</div></div>`;
    },

    // ══════════════════════════════════════════════════════════════════════════
    //  MODAL DE CONFIGURAÇÃO DO PAINEL  ← NOVO
    //  Aparece ao clicar em "⚙️ Configurar Painel"
    //  Salva modoVisualizacao, videoUrl e somPadrao no Firestore da recepção
    // ══════════════════════════════════════════════════════════════════════════

    _abrirModalConfigPainel() {
        const rec = this._recepcaoAtual || {};
        const modoAtual  = rec.modoVisualizacao || 'fila';
        const videoAtual = rec.videoUrl || '';
        const somAtual   = rec.somPadrao !== false;

        // Remove modal anterior se existir
        document.getElementById('rc-modal-config-painel')?.remove();

        const modal = document.createElement('div');
        modal.id        = 'rc-modal-config-painel';
        modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[300] p-4';
        modal.innerHTML = `
            <div class="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">

                <!-- Header -->
                <div class="bg-slate-800 px-6 py-4 flex justify-between items-center">
                    <div>
                        <h3 class="text-white font-black text-lg">⚙️ Configurar Painel da TV</h3>
                        <p class="text-slate-400 text-xs mt-0.5">${escapeHTML(rec.nome || 'Recepção')}</p>
                    </div>
                    <button id="rc-config-fechar" class="text-slate-400 hover:text-white text-2xl font-bold leading-none">×</button>
                </div>

                <div class="p-6 space-y-6">

                    <!-- MODO DE VISUALIZAÇÃO -->
                    <div>
                        <label class="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Modo de Visualização</label>
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">

                            <label id="cfg-label-fila" class="flex flex-col items-center gap-2 p-3 border-2 rounded-xl cursor-pointer transition-all
                                ${modoAtual === 'fila' ? 'border-slate-800 bg-slate-50' : 'border-slate-200 bg-white hover:border-slate-400'}">
                                <input type="radio" name="cfg-modo" value="fila" ${modoAtual === 'fila' ? 'checked' : ''} class="sr-only">
                                <span class="text-2xl">📋</span>
                                <span class="text-xs font-black text-slate-800 text-center">Fila (Lista)</span>
                                <span class="text-[9px] text-slate-400 text-center">Cards com fila e chamados</span>
                            </label>

                            <label id="cfg-label-tv" class="flex flex-col items-center gap-2 p-3 border-2 rounded-xl cursor-pointer transition-all
                                ${modoAtual === 'tv' ? 'border-green-600 bg-green-50' : 'border-slate-200 bg-white hover:border-green-400'}">
                                <input type="radio" name="cfg-modo" value="tv" ${modoAtual === 'tv' ? 'checked' : ''} class="sr-only">
                                <span class="text-2xl">📺</span>
                                <span class="text-xs font-black text-slate-800 text-center">TV Chamados</span>
                                <span class="text-[9px] text-slate-400 text-center">Painel verde com histórico</span>
                            </label>

                            <label id="cfg-label-video" class="flex flex-col items-center gap-2 p-3 border-2 rounded-xl cursor-pointer transition-all
                                ${modoAtual === 'video' ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 bg-white hover:border-indigo-400'}">
                                <input type="radio" name="cfg-modo" value="video" ${modoAtual === 'video' ? 'checked' : ''} class="sr-only">
                                <span class="text-2xl">🎬</span>
                                <span class="text-xs font-black text-slate-800 text-center">TV + Vídeo</span>
                                <span class="text-[9px] text-slate-400 text-center">Vídeo + banner de chamado</span>
                            </label>

                        </div>
                    </div>

                    <!-- LINK DO VÍDEO (visível só se modo = video) -->
                    <div id="cfg-video-wrap" class="${modoAtual !== 'video' ? 'hidden' : ''}">
                        <label class="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                            Link do YouTube ou Vídeo
                        </label>
                        <input type="text" id="cfg-video-input" value="${escapeHTML(videoAtual)}"
                            class="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                            placeholder="https://www.youtube.com/watch?v=...">
                        <p class="text-[10px] text-slate-400 mt-1">Funciona com links do YouTube, Shorts, Lives ou arquivos .mp4</p>
                    </div>

                    <!-- SOM -->
                    <div>
                        <label class="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Som ao Chamar Próximo</label>
                        <div class="flex gap-3">
                            <label id="cfg-label-som-ativo" class="flex items-center gap-3 flex-1 p-3 border-2 rounded-xl cursor-pointer transition-all
                                ${somAtual ? 'border-green-500 bg-green-50' : 'border-slate-200 bg-white hover:border-green-400'}">
                                <input type="radio" name="cfg-som" value="ativo" ${somAtual ? 'checked' : ''} class="w-4 h-4 text-green-600">
                                <div>
                                    <p class="text-xs font-black text-slate-800">🔔 Ativado</p>
                                    <p class="text-[10px] text-slate-400 mt-0.5">Toca ding-dong ao chamar</p>
                                </div>
                            </label>
                            <label id="cfg-label-som-mudo" class="flex items-center gap-3 flex-1 p-3 border-2 rounded-xl cursor-pointer transition-all
                                ${!somAtual ? 'border-slate-500 bg-slate-50' : 'border-slate-200 bg-white hover:border-slate-400'}">
                                <input type="radio" name="cfg-som" value="mudo" ${!somAtual ? 'checked' : ''} class="w-4 h-4 text-slate-600">
                                <div>
                                    <p class="text-xs font-black text-slate-800">🔇 Desligado</p>
                                    <p class="text-[10px] text-slate-400 mt-0.5">Sem som automático</p>
                                </div>
                            </label>
                        </div>
                    </div>

                    <!-- PREVIEW DO LINK -->
                    <div class="bg-slate-50 border border-slate-200 rounded-xl p-3">
                        <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Pré-visualização do Link Gerado</p>
                        <p id="cfg-link-preview" class="text-[10px] font-mono text-slate-500 break-all leading-relaxed">—</p>
                    </div>

                </div>

                <!-- Rodapé -->
                <div class="px-6 pb-6 flex gap-3">
                    <button id="rc-config-cancelar" class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl transition text-sm">Cancelar</button>
                    <button id="rc-config-abrir"
                        class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3 rounded-xl transition text-sm shadow flex items-center justify-center gap-2">
                        📺 Abrir Painel
                    </button>
                    <button id="rc-config-salvar-copiar"
                        class="flex-1 bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 rounded-xl transition text-sm flex items-center justify-center gap-2">
                        💾 Salvar e Copiar Link
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // ── Fechar ──
        const fechar = () => modal.remove();
        document.getElementById('rc-config-fechar')?.addEventListener('click', fechar);
        document.getElementById('rc-config-cancelar')?.addEventListener('click', fechar);
        modal.addEventListener('click', e => { if (e.target === modal) fechar(); });

        // ── Troca de modo: mostra/esconde campo de vídeo + atualiza bordas ──
        const atualizarUI = () => {
            const modoSel = modal.querySelector('input[name="cfg-modo"]:checked')?.value || 'fila';
            const somSel  = modal.querySelector('input[name="cfg-som"]:checked')?.value || 'ativo';

            // Bordas dos modos
            document.getElementById('cfg-label-fila')?.classList.toggle('border-slate-800', modoSel === 'fila');
            document.getElementById('cfg-label-fila')?.classList.toggle('bg-slate-50',    modoSel === 'fila');
            document.getElementById('cfg-label-tv')?.classList.toggle('border-green-600', modoSel === 'tv');
            document.getElementById('cfg-label-tv')?.classList.toggle('bg-green-50',      modoSel === 'tv');
            document.getElementById('cfg-label-video')?.classList.toggle('border-indigo-600', modoSel === 'video');
            document.getElementById('cfg-label-video')?.classList.toggle('bg-indigo-50',      modoSel === 'video');

            // Campo de vídeo
            const videoWrap = document.getElementById('cfg-video-wrap');
            if (videoWrap) videoWrap.classList.toggle('hidden', modoSel !== 'video');

            // Bordas do som
            document.getElementById('cfg-label-som-ativo')?.classList.toggle('border-green-500', somSel === 'ativo');
            document.getElementById('cfg-label-som-ativo')?.classList.toggle('bg-green-50',      somSel === 'ativo');
            document.getElementById('cfg-label-som-mudo')?.classList.toggle('border-slate-500', somSel === 'mudo');
            document.getElementById('cfg-label-som-mudo')?.classList.toggle('bg-slate-50',      somSel === 'mudo');

            // Preview do link
            document.getElementById('cfg-link-preview').textContent = this._gerarUrl(modoSel, document.getElementById('cfg-video-input')?.value || '', somSel === 'ativo');
        };

        modal.querySelectorAll('input[name="cfg-modo"], input[name="cfg-som"]').forEach(r => r.addEventListener('change', atualizarUI));
        document.getElementById('cfg-video-input')?.addEventListener('input', atualizarUI);
        atualizarUI(); // inicializa preview

        // ── Salvar no Firestore ──
        const salvarFirestore = async () => {
            if (!this._recepcaoAtual?.id) return;
            const modo   = modal.querySelector('input[name="cfg-modo"]:checked')?.value || 'fila';
            const video  = document.getElementById('cfg-video-input')?.value.trim() || '';
            const som    = modal.querySelector('input[name="cfg-som"]:checked')?.value === 'ativo';

            if (modo === 'video' && !video) {
                showNotification("Informe o link do vídeo para o modo TV + Vídeo.", "error");
                return null;
            }

            try {
                await RecepcaoConfigService.atualizarRecepcao(this._app.db, this._recepcaoAtual.id, {
                    modoVisualizacao: modo,
                    videoUrl:         video,
                    somPadrao:        som,
                });
                // Atualiza cache local
                this._recepcaoAtual.modoVisualizacao = modo;
                this._recepcaoAtual.videoUrl         = video;
                this._recepcaoAtual.somPadrao        = som;
                return { modo, video, som };
            } catch(e) {
                showNotification("Erro ao salvar configuração.", "error");
                return null;
            }
        };

        // ── Botão: Abrir Painel ──
        document.getElementById('rc-config-abrir')?.addEventListener('click', async () => {
            const cfg = await salvarFirestore();
            if (!cfg) return;
            fechar();
            this._atualizarIndicadorConfig();
            window.open(this._gerarUrl(cfg.modo, cfg.video, cfg.som), '_blank');
        });

        // ── Botão: Salvar e Copiar Link ──
        document.getElementById('rc-config-salvar-copiar')?.addEventListener('click', async () => {
            const cfg = await salvarFirestore();
            if (!cfg) return;
            const link = this._gerarUrl(cfg.modo, cfg.video, cfg.som);
            navigator.clipboard.writeText(link)
                .then(() => showNotification("Configuração salva e link copiado!", "success"))
                .catch(()  => showNotification("Configuração salva. Erro ao copiar link.", "warning"));
            fechar();
            this._atualizarIndicadorConfig();
        });
    },

    // ── Gera a URL com todos os parâmetros ─────────────────────────────────────
    _gerarUrl(modo, video, som) {
        const ids  = estado.pautasHoje.map(p => p.id).join(',');
        const nome = encodeURIComponent(this._recepcaoAtual?.nome || this._unidadeAtual?.nome || 'Recepção');
        const videoEnc = encodeURIComponent(video || '');
        const somParam = som ? '1' : '0';

        let base = window.location.href;
        if (base.includes('?')) base = base.split('?')[0];
        if (base.endsWith('index.html')) base = base.replace('index.html', '');
        if (!base.endsWith('/')) base += '/';

        return `${base}acompanhamento-recepcao.html?pautas=${ids}&nome=${nome}&modo=${modo}&video=${videoEnc}&som=${somParam}`;
    },

    // ── Atualiza o indicador de configuração na tela ────────────────────────────
    _atualizarIndicadorConfig() {
        const rec = this._recepcaoAtual || {};
        const MODOS = { fila: '📋 Fila', tv: '📺 TV Chamados', video: '🎬 TV + Vídeo' };
        const badgeModo = document.getElementById('rc-badge-modo');
        const badgeSom  = document.getElementById('rc-badge-som');
        if (badgeModo) badgeModo.textContent = MODOS[rec.modoVisualizacao || 'fila'];
        if (badgeSom) {
            badgeSom.textContent = rec.somPadrao !== false ? '🔔 Com som' : '🔇 Sem som';
            badgeSom.className   = `px-3 py-1 rounded-full ${rec.somPadrao !== false ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-slate-200 text-slate-500'}`;
        }
    },

    // ── PAINEL DE FOCO ─────────────────────────────────────────────────────────

    _abrirFoco(pautaId) {
        estado.pautaFocadaId = pautaId;
        estado.modoVisao     = 'foco';
        document.getElementById('rc-grade-pautas').classList.add('hidden');
        document.getElementById('rc-sumario').classList.add('hidden');
        document.getElementById('rc-painel-foco').classList.remove('hidden');
        this._renderFoco(pautaId);
    },

    _fecharFoco() {
        estado.pautaFocadaId = null;
        estado.modoVisao     = 'grade';
        document.getElementById('rc-grade-pautas').classList.remove('hidden');
        document.getElementById('rc-sumario').classList.remove('hidden');
        document.getElementById('rc-painel-foco').classList.add('hidden');
    },

    _renderFoco(pautaId) {
        const foco = document.getElementById('rc-painel-foco');
        if (!foco || estado.modoVisao !== 'foco') return;

        const pauta = estado.pautasHoje.find(p => p.id === pautaId);
        if (!pauta) return;

        const assistidos    = estado.assistidosPorPauta[pautaId] || [];
        const colaboradores = estado.colaboradoresPorPauta[pautaId] || [];
        const c = contadores(assistidos);
        const { livres, ocupados } = colaboradoresStatus(colaboradores);
        const aguardando = PautaService.sortAguardando(assistidos.filter(a => a.status === 'aguardando'), pauta.ordemAtendimento);

        foco.innerHTML = `
            <div class="bg-white border border-slate-200 rounded-2xl shadow overflow-hidden">
                <div class="bg-slate-800 px-6 py-5 flex justify-between items-center">
                    <div>
                        <button id="rc-btn-voltar-grade" class="text-slate-400 hover:text-white text-xs font-bold mb-2 block transition">← Voltar à grade</button>
                        <h3 class="text-white font-black text-xl">${escapeHTML(pauta.name)}</h3>
                        <p class="text-slate-400 text-xs mt-0.5">${c.atendidos} atendidos · ${c.total} total</p>
                    </div>
                    <div class="flex gap-2">
                        <button id="rc-foco-btn-acomp" class="bg-slate-600 hover:bg-slate-500 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition">🔗 Externo</button>
                        <button id="rc-foco-btn-chamar" class="bg-green-600 hover:bg-green-700 text-white font-black px-5 py-2.5 rounded-xl text-sm transition shadow">📣 Chamar Próximo</button>
                    </div>
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-3 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
                    <div class="p-5">
                        <h4 class="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">⏳ Fila de Espera (${aguardando.length})</h4>
                        <div class="space-y-2 max-h-96 overflow-y-auto pr-1">
                            ${aguardando.length === 0 ? `<p class="text-xs text-slate-400 text-center py-6">Fila vazia.</p>`
                            : aguardando.map((a, i) => `
                                <div class="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                                    <span class="w-6 h-6 mt-1 rounded-full bg-amber-500 text-white text-[10px] font-black flex items-center justify-center shrink-0">${i + 1}</span>
                                    <div class="min-w-0 flex-1">
                                        <p class="font-bold text-slate-800 text-sm truncate">${escapeHTML(a.name)}${a.numAgendamento ? `<span class="text-xs text-slate-400 font-mono ml-1">#${a.numAgendamento}</span>` : ''}</p>
                                        <p class="text-[10px] text-slate-500 truncate mt-0.5">${a.scheduledTime ? `<span class="text-amber-600 font-bold">⏰ ${a.scheduledTime}</span> · ` : ''}📝 ${escapeHTML(a.subject || 'Sem assunto')}</p>
                                        ${renderVerificacoesBadge(a)}
                                    </div>
                                    <button class="rc-foco-checkin shrink-0 text-[10px] bg-amber-500 hover:bg-amber-600 text-white font-bold px-2 py-1.5 mt-1 rounded-lg transition" data-id="${a.id}" data-pauta="${pautaId}">Check-in</button>
                                </div>`).join('')}
                        </div>
                    </div>

                    <div class="p-5">
                        <h4 class="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">👩‍💻 Em Atendimento (${c.emAtendimento})</h4>
                        <div class="space-y-2 max-h-96 overflow-y-auto pr-1">
                            ${assistidos.filter(a => a.status === 'emAtendimento').length === 0 ? `<p class="text-xs text-slate-400 text-center py-6">Ninguém em atendimento.</p>`
                            : assistidos.filter(a => a.status === 'emAtendimento').map(a => `
                                <div class="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 flex items-start gap-3">
                                    <span class="text-lg mt-1 shrink-0">💬</span>
                                    <div class="min-w-0 flex-1">
                                        <p class="font-bold text-slate-800 text-sm truncate">${escapeHTML(a.name)}${a.numAgendamento ? `<span class="text-xs text-slate-400 font-mono ml-1">#${a.numAgendamento}</span>` : ''}</p>
                                        <p class="text-[10px] text-slate-500 truncate mt-0.5">${a.scheduledTime ? `<span class="text-blue-600 font-bold">⏰ ${a.scheduledTime}</span> · ` : ''}📝 ${escapeHTML(a.subject || 'Sem assunto')}</p>
                                        <div class="mt-1"><span class="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-bold inline-flex items-center gap-1 border border-blue-200">🧑‍💻 ${escapeHTML(a.assignedCollaborator?.name || a.attendant || 'Não atribuído')}</span></div>
                                        ${renderVerificacoesBadge(a)}
                                    </div>
                                </div>`).join('')}
                        </div>
                    </div>

                    <div class="p-5">
                        <h4 class="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">👥 Equipe do Dia</h4>
                        <div class="space-y-2 max-h-96 overflow-y-auto pr-1">
                            ${colaboradores.length === 0 ? `<p class="text-xs text-slate-400 text-center py-6">Nenhum colaborador.</p>`
                            : colaboradores.map(col => {
                                const livre = col.status === 'disponivel' || !col.status;
                                return `<div class="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2">
                                    <span class="w-2 h-2 rounded-full ${livre ? 'bg-green-500' : 'bg-red-500'} shrink-0"></span>
                                    <div class="min-w-0"><p class="font-bold text-slate-800 text-xs truncate">${escapeHTML(col.nome)}</p><p class="text-[10px] text-slate-400">${escapeHTML(col.cargo || '')}</p></div>
                                    <span class="ml-auto text-[9px] font-black uppercase px-2 py-0.5 rounded ${livre ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}">${livre ? 'Livre' : 'Ocupado'}</span>
                                </div>`;
                            }).join('')}
                        </div>
                    </div>
                </div>
            </div>`;

        document.getElementById('rc-btn-voltar-grade')?.addEventListener('click', () => this._fecharFoco());
        document.getElementById('rc-foco-btn-chamar')?.addEventListener('click', async () => await this._chamarProximo(pautaId));
        document.getElementById('rc-foco-btn-acomp')?.addEventListener('click', () => window.open(`acompanhamento.html?id=${pautaId}`, '_blank'));
        foco.querySelectorAll('.rc-foco-checkin').forEach(btn => {
            btn.addEventListener('click', () => this._marcarChegada(pautaId, btn.dataset.id));
        });
    },

    // ── BUSCA GLOBAL ───────────────────────────────────────────────────────────

    _setupBuscaGlobal() {
        const input = document.getElementById('rc-input-busca');
        if (!input) return;
        input.addEventListener('input', () => {
            const termo      = normalizeText(input.value.trim());
            const resultados = document.getElementById('rc-resultados-busca');
            if (!resultados) return;
            if (!termo) { resultados.innerHTML = ''; return; }

            const encontrados = [];
            for (const pauta of estado.pautasHoje) {
                for (const a of (estado.assistidosPorPauta[pauta.id] || [])) {
                    if (normalizeText(a.name || '').includes(termo) || (a.numAgendamento || '').includes(input.value.trim())) {
                        encontrados.push({ pauta, assistido: a });
                    }
                }
            }

            if (encontrados.length === 0) {
                resultados.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">Nenhum resultado encontrado.</p>`;
                return;
            }

            resultados.innerHTML = encontrados.map(({ pauta, assistido: a }) => {
                const sl = statusLabel(a.status);
                return `
                    <div class="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm">
                        <div class="min-w-0 flex-1">
                            <p class="font-black text-slate-800 text-sm truncate">${escapeHTML(a.name)}</p>
                            <p class="text-[10px] text-slate-500 truncate">
                                ${a.numAgendamento ? `<span class="font-mono text-slate-400 mr-1">#${a.numAgendamento}</span>` : ''}
                                ${a.scheduledTime ? `⏰ ${a.scheduledTime} · ` : ''}
                                ${escapeHTML(pauta.name)} · ${escapeHTML(a.subject || '')}
                            </p>
                        </div>
                        <span class="text-[10px] font-black px-2 py-0.5 rounded ${sl.cor}">${sl.txt}</span>
                        ${a.status === 'pauta' ? `
                            <button class="rc-busca-checkin bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-black px-3 py-1.5 rounded-lg transition"
                                data-pauta="${pauta.id}" data-id="${a.id}">Check-in</button>` : ''}
                    </div>`;
            }).join('');

            resultados.querySelectorAll('.rc-busca-checkin').forEach(btn => {
                btn.addEventListener('click', () => {
                    this._marcarChegada(btn.dataset.pauta, btn.dataset.id);
                    input.value = '';
                    resultados.innerHTML = '';
                    document.getElementById('rc-busca-global-wrap').classList.add('hidden');
                });
            });
        });
    },

    // ── AÇÕES ──────────────────────────────────────────────────────────────────

    async _marcarChegada(pautaId, assistidoId) {
        await PautaService.updateStatus(this._app.db, pautaId, assistidoId, {
            status: 'aguardando', arrivalTime: new Date().toISOString(), checkInOrder: Date.now(),
        }, this._app.currentUserName);
        showNotification("Chegada registrada!", "success");
        playSound('notification');
    },

    async _chamarProximo(pautaId) {
        const pauta = estado.pautasHoje.find(p => p.id === pautaId);
        if (!pauta) return;
        const aguardando = PautaService.sortAguardando(
            (estado.assistidosPorPauta[pautaId] || []).filter(a => a.status === 'aguardando'),
            pauta.ordemAtendimento
        );
        if (aguardando.length === 0) { showNotification("Fila vazia nesta pauta.", "info"); return; }
        const proximo = aguardando[0];
        this._registrarUltimoChamado(pautaId, proximo, pauta.name);
        await PautaService.updateStatus(this._app.db, pautaId, proximo.id, {
            status: 'emAtendimento', inAttendanceTime: new Date().toISOString()
        }, this._app.currentUserName);
        showNotification(`📣 Chamado: ${proximo.name}`, "success");
        playSound('chime');
    },

    async _registrarUltimoChamado(pautaId, assistido, pautaNome) {
        const pauta = estado.pautasHoje.find(p => p.id === pautaId);
        const chamado = {
            nome: assistido.name, assunto: assistido.subject || '', local: pautaNome,
            pautaNome, sala: pauta?.sala || assistido.room || '', pautaId,
            hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
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
            await setDoc(doc(this._app.db, "pautas", pautaId, "painel", "ultimoChamado"), {
                atual: chamado, historico
            }, { merge: true });
        } catch(e) { console.error("Erro ao salvar chamado no Firebase:", e); }
        window.dispatchEvent(new CustomEvent('sigep:chamado', { detail: chamado }));
    },

    _atualizarPainelPublicoUltimoChamado(pautaId) {
        const recemChamados = (estado.assistidosPorPauta[pautaId] || []).filter(a =>
            a.status === 'emAtendimento' && a.inAttendanceTime &&
            (Date.now() - new Date(a.inAttendanceTime).getTime()) < 10000
        );
        if (recemChamados.length > 0) {
            const pauta = estado.pautasHoje.find(p => p.id === pautaId);
            if (pauta) this._registrarUltimoChamado(pautaId, recemChamados[0], pauta.name);
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

        document.getElementById('rc-btn-busca-global')?.addEventListener('click', () => {
            const wrap = document.getElementById('rc-busca-global-wrap');
            wrap.classList.toggle('hidden');
            if (!wrap.classList.contains('hidden')) {
                document.getElementById('rc-input-busca')?.focus();
                this._setupBuscaGlobal();
            }
        });

        // Botão de configurar painel → abre a modal
        document.getElementById('rc-btn-config-painel')?.addEventListener('click', () => {
            this._abrirModalConfigPainel();
        });

        // Abrir painel (via indicador rápido)
        document.getElementById('rc-btn-abrir-painel')?.addEventListener('click', () => {
            const rec = this._recepcaoAtual || {};
            window.open(this._gerarUrl(rec.modoVisualizacao || 'fila', rec.videoUrl || '', rec.somPadrao !== false), '_blank');
        });

        // Copiar link (via indicador rápido)
        document.getElementById('rc-btn-copiar-link')?.addEventListener('click', () => {
            const rec  = this._recepcaoAtual || {};
            const link = this._gerarUrl(rec.modoVisualizacao || 'fila', rec.videoUrl || '', rec.somPadrao !== false);
            navigator.clipboard.writeText(link)
                .then(() => showNotification("Link copiado!", "success"))
                .catch(()  => showNotification("Erro ao copiar o link.", "error"));
        });

        // Cliques na grade
        document.getElementById('rc-grade-pautas')?.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-pauta-id]');
            if (!btn) return;
            const pautaId = btn.dataset.pautaId;
            if      (btn.classList.contains('rc-btn-checkin')) this._abrirModalCheckin(pautaId);
            else if (btn.classList.contains('rc-btn-chamar'))  this._chamarProximo(pautaId);
            else if (btn.classList.contains('rc-btn-acomp'))   window.open(`acompanhamento.html?id=${pautaId}`, '_blank');
            else if (btn.classList.contains('rc-btn-abrir'))   this._abrirFoco(pautaId);
        });

        // Filtro por tipo
        document.querySelectorAll('.rc-filtro-tipo').forEach(btn => {
            btn.addEventListener('click', async () => {
                this._filtroTipo = btn.dataset.tipo;
                this._cancelarListeners();
                await this._carregarPautasPorRecepcao();
            });
        });
    },

    // ── MODAL CHECK-IN ─────────────────────────────────────────────────────────

    _abrirModalCheckin(pautaId) {
        const pauta = estado.pautasHoje.find(p => p.id === pautaId);
        if (!pauta) return;
        const naPauta = (estado.assistidosPorPauta[pautaId] || []).filter(a => a.status === 'pauta');

        document.getElementById('rc-modal-checkin')?.remove();

        const modal = document.createElement('div');
        modal.id        = 'rc-modal-checkin';
        modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-[200] p-4';
        modal.innerHTML = `
            <div class="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
                <div class="bg-slate-800 px-6 py-4 flex justify-between items-center">
                    <h3 class="text-white font-black">Check-in — ${escapeHTML(pauta.name)}</h3>
                    <button id="rc-modal-checkin-close" class="text-slate-400 hover:text-white text-2xl font-bold leading-none">×</button>
                </div>
                <div class="p-5">
                    <input type="search" id="rc-modal-busca" placeholder="Buscar pelo nome..."
                        class="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-amber-400">
                    <div id="rc-modal-lista" class="space-y-2 max-h-72 overflow-y-auto">
                        ${naPauta.length === 0
                            ? `<p class="text-center text-slate-400 py-6 text-sm">Todos já fizeram check-in.</p>`
                            : naPauta.map(a => `
                                <div class="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                                    <div>
                                        <p class="font-bold text-slate-800 text-sm">${escapeHTML(a.name)}${a.numAgendamento ? `<span class="text-xs text-slate-400 font-mono ml-1">#${a.numAgendamento}</span>` : ''}</p>
                                        <p class="text-[10px] text-slate-500">${a.scheduledTime ? `⏰ ${a.scheduledTime} · ` : ''}${escapeHTML(a.subject || '')}</p>
                                    </div>
                                    <button class="rc-modal-checkin-btn bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition"
                                        data-id="${a.id}" data-nome="${escapeHTML(a.name)}">Registrar</button>
                                </div>`).join('')}
                    </div>
                </div>
            </div>`;

        document.body.appendChild(modal);
        document.getElementById('rc-modal-checkin-close').onclick = () => modal.remove();
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

        document.getElementById('rc-modal-busca').addEventListener('input', e => {
            const t = normalizeText(e.target.value);
            modal.querySelectorAll('.rc-modal-checkin-btn').forEach(btn => {
                btn.closest('div.flex').style.display = normalizeText(btn.dataset.nome).includes(t) ? '' : 'none';
            });
        });

        modal.querySelectorAll('.rc-modal-checkin-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                btn.disabled = true; btn.textContent = '...';
                await this._marcarChegada(pautaId, btn.dataset.id);
                btn.closest('div.flex').remove();
            });
        });
    },

    // ── FECHAR / ABRIR ─────────────────────────────────────────────────────────

    fechar() {
        this._cancelarListeners();
        const container = document.getElementById('recepcao-central-container');
        if (container) container.innerHTML = '';
        if (typeof this._app.showPautaSelectionScreen === 'function') this._app.showPautaSelectionScreen();
    },

    async abrir(app) {
        const container = document.getElementById('recepcao-central-container');
        if (!container) { console.error("Container #recepcao-central-container não encontrado."); return; }
        const { UIService } = await import('./ui.js');
        UIService.showScreen('recepcaoCentral');
        await this.init(app);
    }
};

export default RecepçãoCentralService;