import {
    collection, doc, onSnapshot, updateDoc, setDoc, getDocs, query, where, addDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showNotification, playSound, escapeHTML, normalizeText } from './utils.js';
import { PautaService } from './pauta.js';
import { PautaConfigService } from './pautaConfig.js';
import { RecepcaoConfigService } from './recepcaoConfig.js';
import { flatSubjects } from './assuntos.js';
import { logAction } from './admin.js';

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

// ─── HELPERS ───────────────────────────────────────────────────────────────────

function statusLabel(status) {
    const map = {
        pauta:                     { txt: 'Na Pauta',     cor: 'bg-slate-100 text-slate-600' },
        aguardando:                { txt: 'Aguardando',   cor: 'bg-amber-100 text-amber-700' },
        emAtendimento:             { txt: 'Em Atendimento', cor: 'bg-blue-100 text-blue-700' },
        aguardandoDistribuicao: { txt: 'Distribuição', cor: 'bg-cyan-100 text-cyan-700' },
        atendido:                  { txt: 'Atendido',     cor: 'bg-green-100 text-green-700' },
        faltoso:                   { txt: 'Faltoso',      cor: 'bg-red-100 text-red-700' },
    };
    return map[status] || { txt: status, cor: 'bg-gray-100 text-gray-600' };
}

function contadores(assistidos) {
    return {
        total:        assistidos.length,
        naPauta:      assistidos.filter(a => a.status === 'pauta').length,
        aguardando:   assistidos.filter(a => a.status === 'aguardando').length,
        emAtendimento:assistidos.filter(a => a.status === 'emAtendimento').length,
        atendidos:    assistidos.filter(a => a.status === 'atendido').length,
        faltosos:     assistidos.filter(a => a.status === 'faltoso').length,
        distribuicao: assistidos.filter(a => a.status === 'aguardandoDistribuicao').length,
    };
}

function colaboradoresStatus(colaboradores) {
    const livres  = colaboradores.filter(c => c.status === 'disponivel' || !c.status);
    const ocupados = colaboradores.filter(c => c.status === 'ocupado');
    return { livres, ocupados };
}

function renderVerificacoesBadge(a) {
    const docs = a.verifications || a.documentos || a.verificacoes || a.customFields?.verifications;
    if (!docs) return '';
    
    let htmlLista = '';
    
    if (Array.isArray(docs)) {
        const itens = docs.map(d => typeof d === 'string' ? d : (d.nome || d.name || d.label || 'Doc'));
        if(itens.length === 0) return '';
        htmlLista = itens.map(i => `<span class="inline-block bg-slate-100 text-slate-600 border border-slate-200 text-[9px] px-1.5 py-0.5 rounded mr-1 mb-1 shadow-sm">📄 ${escapeHTML(i)}</span>`).join('');
    } 
    else if (typeof docs === 'object') {
        const keys = Object.keys(docs);
        if(keys.length === 0) return '';
        htmlLista = keys.map(k => {
            const checked = docs[k];
            return `<span class="inline-block ${checked ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-600 border-red-200'} border text-[9px] px-1.5 py-0.5 rounded mr-1 mb-1 shadow-sm">
                ${checked ? '✔️' : '❌'} ${escapeHTML(k)}
            </span>`;
        }).join('');
    }
    
    return htmlLista ? `<div class="mt-1.5 flex flex-wrap gap-0.5">${htmlLista}</div>` : '';
}

// ─── SERVIÇO PRINCIPAL ─────────────────────────────────────────────────────────

export const RecepcaoCentralService = {

    // ── INICIALIZAÇÃO ──────────────────────────────────────────────────────────

    async init(app) {
        this._app = app;
        this._filtroTipo = this._filtroTipo || 'todos';

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
            <div class="max-w-7xl mx-auto px-4 py-12 text-center">
                <div class="bg-amber-50 border border-amber-200 rounded-2xl p-8">
                    <span class="text-6xl block mb-4">🔒</span>
                    <h3 class="text-xl font-bold text-amber-800 mb-2">Acesso Restrito</h3>
                    <p class="text-amber-600">Você não tem permissão para acessar nenhuma recepção no momento.</p>
                    <button id="rc-voltar-sem-permissao" class="mt-6 bg-slate-700 text-white px-6 py-2 rounded-lg hover:bg-slate-800 transition">
                        Voltar
                    </button>
                </div>
            </div>
        `;

        document.getElementById('rc-voltar-sem-permissao')?.addEventListener('click', () => this.fechar());
    },

    _renderSelectorRecepcoes(recepcoes) {
        const container = document.getElementById('recepcao-central-container');
        if (!container) return;
    
        container.innerHTML = `
            <div class="max-w-7xl mx-auto px-4 py-8">
                
                <div class="flex justify-center mb-4">
                    <div class="bg-[#0d1117] border border-slate-700 rounded-2xl p-3 shadow-md">
                        <img src="https://firebasestorage.googleapis.com/v0/b/pauta-ce162.firebasestorage.app/o/logo_sigep.png?alt=media&token=b067528b-df81-4fbf-bc22-0d2b01acbbe6" alt="Logo SIGEP" class="h-10 w-auto object-contain">
                    </div>
                </div>
    
                ${RecepcaoConfigService.renderSelectorRecepcoes(recepcoes)}
                
                <div class="max-w-4xl mx-auto mt-12 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                    <h4 class="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-5">📖 Guia de Tipos de Recepção</h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div class="flex items-start gap-3">
                            <span class="bg-slate-800 text-white text-lg px-2.5 py-1 rounded-lg shrink-0">🏛️</span>
                            <div>
                                <p class="font-bold text-slate-800 text-sm">Central</p>
                                <p class="text-xs text-slate-500 mt-0.5 leading-snug">Painel principal. Permite visualizar e gerenciar pessoas de <b>todas</b> as filas e áreas vinculadas à recepção.</p>
                            </div>
                        </div>
                        <div class="flex items-start gap-3">
                            <span class="bg-amber-50 text-amber-600 text-lg px-2.5 py-1 rounded-lg border border-amber-200 shrink-0">⚖️</span>
                            <div>
                                <p class="font-bold text-slate-800 text-sm">Especializada</p>
                                <p class="text-xs text-slate-500 mt-0.5 leading-snug">Focada em um assunto específico (ex: Família). Exibe apenas a fila e os casos da sua própria área.</p>
                            </div>
                        </div>
                    </div>
                </div>
    
                <div class="mt-8 flex justify-center">
                    <button id="rc-voltar-selector" class="bg-slate-600 text-white font-bold px-6 py-2.5 rounded-xl hover:bg-slate-700 transition shadow-sm">
                        ← Voltar para o Início
                    </button>
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

        container.innerHTML = `
            <div class="flex justify-center items-center h-64">
                <div class="text-center">
                    <div class="loader-small mx-auto mb-4"></div>
                    <p class="text-slate-500">Carregando histórico de pautas da recepção...</p>
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

    // ── RENDER TELA PRINCIPAL ─────────────────────────────────────────────────

    _renderTelaComContexto() {
        const container = document.getElementById('recepcao-central-container');
        if (!container) return;

        const contexto = RecepcaoConfigService.getContextoRecepcao(this._recepcaoAtual);

        container.innerHTML = `
            <div class="recepcao-central-wrap max-w-7xl mx-auto px-2 sm:px-4 py-4 animate-fade-in">

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
                            <span>🔄</span> Trocar Recepção
                        </button>
                    </div>
                </div>

                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
                    <div>
                        <h2 class="text-2xl font-black text-slate-800 tracking-tight">🏛️ Painel de Atendimento</h2>
                        <p class="text-sm text-slate-500 mt-0.5">Exibindo Histórico Contínuo da Recepção</p>
                        <div class="flex items-center gap-2 mt-2 flex-wrap">
                            <span class="text-xs text-slate-400 font-bold uppercase tracking-wider">Filtrar por tipo:</span>
                            ${['todos','agendamento','avulso','multisala', 'mutirao', 'plantao', 'acao_social'].map(t => `
                                <button class="rc-filtro-tipo text-xs px-3 py-1 rounded-full border font-bold transition
                                    ${(this._filtroTipo || 'todos') === t
                                        ? 'bg-slate-800 text-white border-slate-800'
                                        : 'bg-white text-slate-600 border-slate-300 hover:border-slate-500'}"
                                    data-tipo="${t}">
                                    ${t === 'todos' ? '🔀 Todos'
                                    : t === 'agendamento' ? '📅 Agendamento'
                                    : t === 'avulso' ? '🚶 Avulso'
                                    : t === 'multisala' ? '🏢 Multi-Sala'
                                    : t === 'mutirao' ? '👥 Mutirão'
                                    : t === 'plantao' ? '🚨 Plantão'
                                    : '❤️ Ação Social'}
                                </button>
                            `).join('')}
                        </div>
                    </div>
                    <div class="flex gap-2 w-full sm:w-auto flex-wrap">
                        
                        <button id="rc-btn-configurar-tv" class="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-lg transition text-sm shadow" title="Configurar e Abrir Painel da TV">
                            📺 Configurar Painel da TV
                        </button>

                        <button id="rc-btn-busca-global" class="flex-1 sm:flex-none flex items-center gap-2 bg-white border border-slate-300 text-slate-700 font-semibold px-4 py-2 rounded-lg hover:bg-slate-50 transition text-sm shadow-sm">
                            🔍 Busca Global
                        </button>
                        <button id="rc-btn-atualizar" class="flex items-center gap-2 bg-white border border-slate-300 text-slate-600 px-3 py-2 rounded-lg hover:bg-slate-50 transition shadow-sm" title="Recarregar pautas">
                            🔄
                        </button>
                        <button id="rc-btn-fechar" class="flex items-center gap-2 bg-slate-800 text-white font-bold px-4 py-2 rounded-lg hover:bg-slate-900 transition text-sm shadow">
                            ← Voltar
                        </button>
                    </div>
                </div>

                <div id="rc-busca-global-wrap" class="hidden mb-4 animate-fade-in">
                    <div class="relative">
                        <input type="search" id="rc-input-busca" placeholder="Digite nome ou nº de agendamento para buscar em todas as pautas..."
                            class="w-full bg-white border border-slate-300 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 shadow-sm">
                        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">🔍</span>
                    </div>
                    <div id="rc-resultados-busca" class="mt-3 space-y-2 max-h-96 overflow-y-auto"></div>
                </div>

                <div id="rc-sumario" class="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6"></div>

                <div id="rc-grade-pautas" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4"></div>

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
                    <p class="font-black text-slate-500 uppercase tracking-widest text-sm">Nenhuma pauta encontrada no histórico.</p>
                    <p class="text-xs text-slate-400 mt-2">Verifique os filtros selecionados acima.</p>
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

        const salaBadge = pauta.sala
            ? `<span class="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">🏠 ${escapeHTML(pauta.sala)}</span>`
            : '';

        const dataPautaStr = pauta.dataAtuacao || pauta.data || pauta.createdAt 
            ? new Date(pauta.dataAtuacao || pauta.data || pauta.createdAt).toLocaleDateString('pt-BR') 
            : '';

        const aguardando = PautaService.sortAguardando(
            assistidos.filter(a => a.status === 'aguardando'),
            pauta.ordemAtendimento
        );

        const listaNomes = aguardando.length === 0
            ? `<p class="text-[11px] text-slate-400 italic px-1">Nenhum na fila de espera no momento.</p>`
            : aguardando.slice(0, 5).map((a, i) => `
                <div class="flex items-center gap-2 py-1 border-b border-slate-100 last:border-0">
                    <span class="text-[10px] font-black text-amber-500 w-4 shrink-0">${i + 1}.</span>
                    <span class="text-xs font-semibold text-slate-700 truncate flex-1">
                        ${escapeHTML(a.name)} 
                        ${a.numAgendamento ? `<span class="text-[9px] text-slate-400 font-mono ml-1">#${a.numAgendamento}</span>` : ''}
                    </span>
                    <span class="text-[9px] text-slate-400 shrink-0">${a.scheduledTime || ''}</span>
                </div>
            `).join('')
            + (aguardando.length > 5
                ? `<p class="text-[10px] text-slate-400 text-center pt-1">+${aguardando.length - 5} mais na fila</p>`
                : '');

        return `
            <div id="rc-card-${pauta.id}" class="bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col" data-pauta-id="${pauta.id}">

                <div class="bg-slate-800 px-5 py-4 flex justify-between items-start gap-2">
                    <div class="min-w-0">
                        <h3 class="text-white font-black text-base truncate">${escapeHTML(pauta.name)}</h3>
                        <div class="flex items-center gap-2 mt-1">
                            <p class="text-slate-400 text-[10px] uppercase tracking-wider">${pauta.type || 'agendamento'} ${dataPautaStr ? ` · ${dataPautaStr}` : ''}</p>
                            ${salaBadge}
                        </div>
                    </div>
                    <span class="text-white/60 text-xs font-mono shrink-0">${porcentagem}%</span>
                </div>

                <div class="h-1.5 bg-slate-100">
                    <div class="h-full bg-green-500 transition-all duration-500" style="width:${porcentagem}%"></div>
                </div>

                <div class="grid grid-cols-4 divide-x divide-slate-100 border-b border-slate-100">
                    <div class="text-center py-3">
                        <div class="text-xl font-black text-slate-600">${c.naPauta}</div>
                        <div class="text-[9px] text-slate-400 uppercase font-bold">Agendados</div>
                    </div>
                    <div class="text-center py-3">
                        <div class="text-xl font-black text-amber-600">${c.aguardando}</div>
                        <div class="text-[9px] text-slate-400 uppercase font-bold">Aguardando</div>
                    </div>
                    <div class="text-center py-3">
                        <div class="text-xl font-black text-blue-600">${c.emAtendimento}</div>
                        <div class="text-[9px] text-slate-400 uppercase font-bold">Atendendo</div>
                    </div>
                    <div class="text-center py-3">
                        <div class="text-xl font-black text-green-600">${c.atendidos}</div>
                        <div class="text-[9px] text-slate-400 uppercase font-bold">Atendidos</div>
                    </div>
                </div>

                <div class="px-5 pt-3 pb-2 border-b border-slate-100">
                    <p class="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">📋 Fila de Espera</p>
                    <div class="space-y-0">
                        ${listaNomes}
                    </div>
                </div>

                <div class="px-5 py-3 flex items-center gap-3 border-b border-slate-100">
                    <div class="flex items-center gap-1.5">
                        <span class="w-2 h-2 rounded-full bg-green-500"></span>
                        <span class="text-xs font-bold text-green-700">${livres.length} livres</span>
                    </div>
                    <div class="flex items-center gap-1.5">
                        <span class="w-2 h-2 rounded-full bg-red-500"></span>
                        <span class="text-xs font-bold text-red-600">${ocupados.length} ocupados</span>
                    </div>
                    ${c.distribuicao > 0
                        ? `<div class="ml-auto"><span class="bg-cyan-100 text-cyan-700 text-[10px] font-black px-2 py-0.5 rounded border border-cyan-200">⚖️ ${c.distribuicao} dist.</span></div>`
                        : ''}
                </div>

                <div class="px-5 py-3 flex gap-2 mt-auto">
                    <button class="rc-btn-checkin flex-1 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 font-bold text-xs py-2 rounded-lg transition" data-pauta-id="${pauta.id}">
                        ✅ Check-in
                    </button>
                    <button class="rc-btn-chamar flex-1 bg-green-50 hover:bg-green-100 border border-green-200 text-green-800 font-bold text-xs py-2 rounded-lg transition" data-pauta-id="${pauta.id}">
                        📣 Chamar
                    </button>
                    <button class="rc-btn-acomp bg-slate-600 hover:bg-slate-700 text-white font-bold text-xs px-3 py-2 rounded-lg transition" data-pauta-id="${pauta.id}" title="Acompanhamento público desta pauta">
                        🔗
                    </button>
                    <button class="rc-btn-abrir flex-1 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs py-2 rounded-lg transition" data-pauta-id="${pauta.id}">
                        Abrir →
                    </button>
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

        el.innerHTML = `
            <div class="bg-white border border-slate-200 rounded-xl p-4 text-center shadow-sm">
                <div class="text-2xl font-black text-slate-600">${totalNaPauta}</div>
                <div class="text-[10px] text-slate-500 font-bold uppercase mt-1">Agendados</div>
            </div>
            <div class="bg-white border border-slate-200 rounded-xl p-4 text-center shadow-sm">
                <div class="text-2xl font-black text-amber-600">${totalAg}</div>
                <div class="text-[10px] text-slate-500 font-bold uppercase mt-1">Aguardando</div>
            </div>
            <div class="bg-white border border-slate-200 rounded-xl p-4 text-center shadow-sm">
                <div class="text-2xl font-black text-blue-600">${totalEm}</div>
                <div class="text-[10px] text-slate-500 font-bold uppercase mt-1">Em Atendimento</div>
            </div>
            <div class="bg-white border border-slate-200 rounded-xl p-4 text-center shadow-sm">
                <div class="text-2xl font-black text-green-600">${totalAt}</div>
                <div class="text-[10px] text-slate-500 font-bold uppercase mt-1">Atendidos</div>
            </div>
            <div class="bg-white border border-slate-200 rounded-xl p-4 text-center shadow-sm">
                <div class="text-2xl font-black text-cyan-600">${totalDist}</div>
                <div class="text-[10px] text-slate-500 font-bold uppercase mt-1">Distribuição</div>
            </div>
        `;
    },

    // ── PAINEL DE FOCO (VISÃO DETALHADA DA PAUTA) ──────────────────────────────

    _abrirFoco(pautaId) {
        estado.pautaFocadaId = pautaId;
        estado.modoVisao     = 'foco';

        document.getElementById('rc-grade-pautas').classList.add('hidden');
        document.getElementById('rc-sumario').classList.add('hidden');
        const foco = document.getElementById('rc-painel-foco');
        foco.classList.remove('hidden');

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

        const naPautaList = assistidos.filter(a => a.status === 'pauta');
        const aguardando = PautaService.sortAguardando(
            assistidos.filter(a => a.status === 'aguardando'),
            pauta.ordemAtendimento
        );

        foco.innerHTML = `
            <div class="bg-white border border-slate-200 rounded-2xl shadow overflow-hidden">

                <div class="bg-slate-800 px-6 py-5 flex justify-between items-center flex-wrap gap-4">
                    <div>
                        <button id="rc-btn-voltar-grade" class="text-slate-400 hover:text-white text-xs font-bold mb-2 block transition">← Voltar à grade geral</button>
                        <h3 class="text-white font-black text-xl">${escapeHTML(pauta.name)}</h3>
                        <p class="text-slate-400 text-xs mt-0.5">${c.atendidos} atendidos · ${c.total} total na pauta</p>
                    </div>
                    <div class="flex gap-2">
                        <button id="rc-foco-btn-add-assistido" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition shadow flex items-center gap-2">
                            <span>➕</span> Adicionar Assistido
                        </button>
                        <button id="rc-foco-btn-acomp" class="bg-slate-600 hover:bg-slate-500 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition" title="Acompanhamento público desta pauta">
                            🔗 Tela Externa
                        </button>
                        <button id="rc-foco-btn-chamar" class="bg-green-600 hover:bg-green-700 text-white font-black px-5 py-2.5 rounded-xl text-sm transition shadow flex items-center gap-2">
                            <span>📣</span> Chamar Próximo
                        </button>
                    </div>
                </div>

                <div class="p-4 bg-slate-50 border-b border-slate-200">
                    <input type="search" id="rc-foco-input-busca" placeholder="🔍 Pesquisar por Nome, CPF, Assunto ou Nº Agendamento..." class="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 shadow-sm">
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-3 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">

                    <!-- Coluna 1: Agendados / Na Pauta -->
                    <div class="p-5 flex flex-col">
                        <h4 class="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">📅 Agendados (${naPautaList.length})</h4>
                        <div class="space-y-2 max-h-[32rem] overflow-y-auto pr-1 rc-coluna-agendados">
                            ${naPautaList.length === 0
                                ? `<p class="text-xs text-slate-400 text-center py-6">Nenhum agendado no momento.</p>`
                                : naPautaList.map((a, i) => `
                                    <div class="rc-assistido-card flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 hover:border-slate-300 transition" data-busca="${normalizeText(a.name + ' ' + (a.cpf || '') + ' ' + (a.numAgendamento || '') + ' ' + (a.subject || ''))}">
                                        <div class="min-w-0 flex-1">
                                            <p class="font-bold text-slate-800 text-sm truncate">
                                                ${escapeHTML(a.name)} 
                                                ${a.numAgendamento ? `<span class="text-xs text-slate-400 font-mono ml-1">#${a.numAgendamento}</span>` : ''}
                                            </p>
                                            <p class="text-[10px] text-slate-500 truncate mt-0.5">
                                                ${a.scheduledTime ? `<span class="text-slate-600 font-bold">⏰ ${a.scheduledTime}</span> · ` : ''}
                                                📝 ${escapeHTML(a.subject || 'Sem assunto')}
                                            </p>
                                            ${a.priority ? `<span class="inline-block mt-1 bg-red-100 text-red-700 border border-red-200 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider">🚨 Prioridade: ${escapeHTML(a.priorityReason || a.priority)}</span>` : ''}
                                            ${renderVerificacoesBadge(a)}
                                        </div>
                                        <button class="rc-foco-checkin shrink-0 text-[10px] bg-amber-500 hover:bg-amber-600 text-white font-bold px-2 py-1.5 mt-1 rounded-lg transition shadow-sm"
                                            data-id="${a.id}" data-pauta="${pautaId}">Fazer Check-in</button>
                                    </div>
                                `).join('')
                            }
                        </div>
                    </div>

                    <!-- Coluna 2: Fila de Espera -->
                    <div class="p-5 flex flex-col">
                        <h4 class="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">⏳ Fila de Espera (${aguardando.length})</h4>
                        <div class="space-y-2 max-h-[32rem] overflow-y-auto pr-1 rc-coluna-aguardando">
                            ${aguardando.length === 0
                                ? `<p class="text-xs text-slate-400 text-center py-6">Fila vazia.</p>`
                                : aguardando.map((a, i) => `
                                    <div class="rc-assistido-card flex flex-col bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5" data-busca="${normalizeText(a.name + ' ' + (a.cpf || '') + ' ' + (a.numAgendamento || '') + ' ' + (a.subject || ''))}">
                                        <div class="flex items-start gap-3">
                                            <span class="w-6 h-6 mt-1 rounded-full bg-amber-500 text-white text-[10px] font-black flex items-center justify-center shrink-0">${i + 1}</span>
                                            <div class="min-w-0 flex-1">
                                                <p class="font-bold text-slate-800 text-sm truncate">
                                                    ${escapeHTML(a.name)} 
                                                    ${a.numAgendamento ? `<span class="text-xs text-slate-400 font-mono ml-1">#${a.numAgendamento}</span>` : ''}
                                                </p>
                                                <p class="text-[10px] text-slate-500 truncate mt-0.5">
                                                    ${a.scheduledTime ? `<span class="text-amber-600 font-bold">⏰ ${a.scheduledTime}</span> · ` : ''}
                                                    📝 ${escapeHTML(a.subject || 'Sem assunto')}
                                                </p>
                                                ${a.priority ? `<span class="inline-block mt-1 bg-red-100 text-red-700 border border-red-200 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider">🚨 Prioridade: ${escapeHTML(a.priorityReason || a.priority)}</span>` : ''}
                                                ${renderVerificacoesBadge(a)}
                                            </div>
                                        </div>

                                        <!-- BOTÕES DE AÇÃO NA FILA -->
                                        <div class="mt-2 pt-2 border-t border-amber-200/60 flex flex-wrap gap-2 items-center justify-between">
                                            <div class="flex items-center gap-1.5">
                                                <button class="rc-foco-abrir-prioridade text-[9px] font-bold px-2 py-1 rounded bg-white text-slate-600 border border-slate-200 hover:bg-slate-100 shadow-sm transition" data-id="${a.id}" data-pauta="${pautaId}">
                                                    ⭐️ Definir Prioridade
                                                </button>
                                                ${(a.priority || a.priorityReason) ? `<button class="rc-foco-remover-prioridade text-[9px] font-bold px-2 py-1 rounded bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 shadow-sm transition" data-id="${a.id}" data-pauta="${pautaId}">❌ Remover</button>` : ''}
                                            </div>
                                        </div>

                                        <div class="flex justify-between items-center mt-2 pt-2 border-t border-amber-200">
                                            <button class="rc-foco-voltar shrink-0 text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-300 font-bold px-2 py-1 rounded transition shadow-sm"
                                                data-id="${a.id}" data-pauta="${pautaId}" data-destino="pauta">Desfazer Check-in</button>
                                            <button class="rc-foco-chamar-individual shrink-0 text-[10px] bg-green-500 hover:bg-green-600 text-white font-bold px-3 py-1 rounded transition shadow-sm"
                                                data-id="${a.id}" data-pauta="${pautaId}">📣 Chamar</button>
                                        </div>
                                    </div>
                                `).join('')
                            }
                        </div>
                    </div>

                    <!-- Coluna 3: Atendimento e Equipe -->
                    <div class="flex flex-col divide-y divide-slate-100">
                        <div class="p-5 flex-1">
                            <h4 class="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">👩‍💻 Em Atendimento (${c.emAtendimento})</h4>
                            <div class="space-y-2 max-h-64 overflow-y-auto pr-1 rc-coluna-atendimento">
                                ${assistidos.filter(a => a.status === 'emAtendimento').length === 0
                                    ? `<p class="text-xs text-slate-400 text-center py-6">Ninguém em atendimento.</p>`
                                    : assistidos.filter(a => a.status === 'emAtendimento').map(a => `
                                        <div class="rc-assistido-card bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 flex flex-col" data-busca="${normalizeText(a.name + ' ' + (a.cpf || '') + ' ' + (a.numAgendamento || '') + ' ' + (a.subject || ''))}">
                                            <div class="flex items-start gap-3">
                                                <span class="text-lg mt-1 shrink-0">💬</span>
                                                <div class="min-w-0 flex-1">
                                                    <p class="font-bold text-slate-800 text-sm truncate">${escapeHTML(a.name)} ${a.numAgendamento ? `<span class="text-xs text-slate-400 font-mono ml-1">#${a.numAgendamento}</span>` : ''}</p>
                                                    <p class="text-[10px] text-slate-500 truncate mt-0.5">
                                                        ${a.scheduledTime ? `<span class="text-blue-600 font-bold">⏰ ${a.scheduledTime}</span> · ` : ''}
                                                        📝 ${escapeHTML(a.subject || 'Sem assunto')}
                                                    </p>
                                                    <div class="mt-1">
                                                        <span class="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-bold inline-flex items-center gap-1 border border-blue-200">
                                                            🧑‍💻 Atendente: ${escapeHTML(a.assignedCollaborator?.name || a.attendant || 'Não atribuído')}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                             <div class="flex justify-end gap-2 mt-2 pt-2 border-t border-blue-200">
                                                 <button class="rc-foco-voltar shrink-0 text-[10px] bg-white hover:bg-blue-100 text-blue-600 border border-blue-300 font-bold px-2 py-1 rounded transition shadow-sm"
                                                     data-id="${a.id}" data-pauta="${pautaId}" data-destino="aguardando">Voltar p/ Fila</button>
                                             </div>
                                        </div>
                                    `).join('')
                                }
                            </div>
                        </div>
                        <div class="p-5 flex-1">
                            <h4 class="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">👥 Equipe do Dia</h4>
                            <div class="space-y-2 max-h-48 overflow-y-auto pr-1">
                                ${colaboradores.length === 0
                                    ? `<p class="text-xs text-slate-400 text-center py-6">Nenhum colaborador online.</p>`
                                    : colaboradores.map(col => {
                                        const livre = col.status === 'disponivel' || !col.status;
                                        return `
                                            <div class="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2">
                                                <span class="w-2 h-2 rounded-full ${livre ? 'bg-green-500' : 'bg-red-500'} shrink-0"></span>
                                                <div class="min-w-0">
                                                    <p class="font-bold text-slate-800 text-xs truncate">${escapeHTML(col.nome)}</p>
                                                    <p class="text-[10px] text-slate-400">${escapeHTML(col.cargo || '')}</p>
                                                </div>
                                                <span class="ml-auto text-[9px] font-black uppercase px-2 py-0.5 rounded ${livre ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}">${livre ? 'Livre' : 'Ocupado'}</span>
                                            </div>
                                        `;
                                    }).join('')
                                }
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        `;

        document.getElementById('rc-btn-voltar-grade')?.addEventListener('click', () => this._fecharFoco());

        document.getElementById('rc-foco-btn-chamar')?.addEventListener('click', async () => {
            await this._chamarProximo(pautaId);
        });

        document.getElementById('rc-foco-btn-acomp')?.addEventListener('click', () => {
            window.open(`?painel=true&pautas=${pautaId}`, '_blank');
        });

        document.getElementById('rc-foco-btn-add-assistido')?.addEventListener('click', () => {
            this._abrirModalAdicionarAssistido(pautaId, pauta.name);
        });

        // PESQUISA INTERNA NA TELA DE FOCO
        document.getElementById('rc-foco-input-busca')?.addEventListener('input', (e) => {
            const termo = normalizeText(e.target.value.trim());
            foco.querySelectorAll('.rc-assistido-card').forEach(card => {
                const buscaTexto = card.dataset.busca || '';
                if (!termo || buscaTexto.includes(termo)) {
                    card.style.display = '';
                } else {
                    card.style.display = 'none';
                }
            });
        });

        foco.querySelectorAll('.rc-foco-checkin').forEach(btn => {
            btn.addEventListener('click', () => {
                this._abrirModalCheckinComHorario(pautaId, btn.dataset.id);
            });
        });
        
        foco.querySelectorAll('.rc-foco-chamar-individual').forEach(btn => {
            btn.addEventListener('click', () => {
                this._chamarAssistidoEspecifico(pautaId, btn.dataset.id);
            });
        });

        foco.querySelectorAll('.rc-foco-voltar').forEach(btn => {
            btn.addEventListener('click', () => {
                this._voltarStatusAssistido(pautaId, btn.dataset.id, btn.dataset.destino);
            });
        });

        foco.querySelectorAll('.rc-foco-abrir-prioridade').forEach(btn => {
            btn.addEventListener('click', () => {
                this._abrirModalDefinirPrioridade(btn.dataset.pauta, btn.dataset.id);
            });
        });

        foco.querySelectorAll('.rc-foco-remover-prioridade').forEach(btn => {
            btn.addEventListener('click', async () => {
                if(confirm("Remover urgência?")) {
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
        const existing = document.getElementById('rc-modal-prioridade');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'rc-modal-prioridade';
        modal.className = 'fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[250] p-4 backdrop-blur-sm animate-fade-in';
        modal.innerHTML = `
            <div class="bg-white p-5 sm:p-8 rounded-xl shadow-2xl w-full max-w-md border-t-8 border-red-600 max-h-[95vh] overflow-y-auto" onclick="event.stopPropagation()">
                <h2 class="text-xl sm:text-2xl font-bold mb-2 text-gray-800">Prioridade Legal</h2>
                <p class="mb-4 sm:mb-6 text-xs sm:text-sm text-gray-500">Selecione uma ou mais categorias:</p>
                
                <div id="rc-priority-types-grid" class="grid grid-cols-2 gap-2 mb-4 sm:mb-6">
                    <button type="button" data-value="Idoso (60+)" class="rc-p-chip border border-gray-200 rounded-lg py-2.5 px-2 text-[10px] sm:text-xs font-semibold hover:bg-red-50 hover:border-red-200 transition focus:outline-none">👴 Idoso (60+)</button>
                    <button type="button" data-value="Idoso (80+)" class="rc-p-chip border border-gray-200 rounded-lg py-2.5 px-2 text-[10px] sm:text-xs font-semibold hover:bg-red-50 hover:border-red-200 transition focus:outline-none">🎖️ Idoso (80+)</button>
                    <button type="button" data-value="Deficiência (PCD)" class="rc-p-chip border border-gray-200 rounded-lg py-2.5 px-2 text-[10px] sm:text-xs font-semibold hover:bg-red-50 hover:border-red-200 transition focus:outline-none">♿ Deficiência</button>
                    <button type="button" data-value="Autismo (TEA)" class="rc-p-chip border border-gray-200 rounded-lg py-2.5 px-2 text-[10px] sm:text-xs font-semibold hover:bg-red-50 hover:border-red-200 transition focus:outline-none">🧩 Autismo</button>
                    <button type="button" data-value="Gestante" class="rc-p-chip border border-gray-200 rounded-lg py-2.5 px-2 text-[10px] sm:text-xs font-semibold hover:bg-red-50 hover:border-red-200 transition focus:outline-none">🤰 Gestante</button>
                    <button type="button" data-value="Criança de Colo" class="rc-p-chip border border-gray-200 rounded-lg py-2.5 px-2 text-[10px] sm:text-xs font-semibold hover:bg-red-50 hover:border-red-200 transition focus:outline-none">👶 Colo</button>
                    <button type="button" data-value="Obesidade" class="rc-p-chip border border-gray-200 rounded-lg py-2.5 px-2 text-[10px] sm:text-xs font-semibold hover:bg-red-50 hover:border-red-200 transition focus:outline-none">⚖️ Obesidade</button>
                    <button type="button" data-value="Urgência Médica" class="rc-p-chip border border-gray-200 rounded-lg py-2.5 px-2 text-[10px] sm:text-xs font-semibold hover:bg-red-50 hover:border-red-200 transition focus:outline-none">🚑 Médica</button>
                </div>
        
                <label class="block text-[10px] sm:text-xs font-bold text-gray-400 uppercase mb-1">Outros / Observações:</label>
                <textarea id="rc-priority-reason-input" placeholder="Ex: Prazo vencendo..." class="w-full p-3 border border-gray-300 rounded-lg mb-6 h-20 text-sm sm:text-base outline-none focus:ring-2 focus:ring-red-500"></textarea>
                
                <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 sm:space-x-4">
                    <button id="rc-cancel-priority-btn" class="w-full sm:w-auto bg-gray-200 text-gray-700 font-bold py-2.5 px-6 rounded-lg hover:bg-gray-400 transition">Cancelar</button>
                    <button id="rc-confirm-priority-btn" class="w-full sm:w-auto bg-red-600 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-red-700 transition shadow-lg">Confirmar Prioridade</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const style = document.createElement('style');
        style.innerHTML = `
            .rc-p-chip.selected {
                background-color: #fef2f2 !important; 
                border-color: #f87171 !important; 
                color: #b91c1c !important; 
                box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
            }
        `;
        modal.appendChild(style);

        modal.querySelectorAll('.rc-p-chip').forEach(chip => {
            chip.addEventListener('click', function(e) {
                e.preventDefault();
                this.classList.toggle('selected');
            });
        });

        const closeModal = () => modal.remove();
        document.getElementById('rc-cancel-priority-btn').onclick = closeModal;
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

        document.getElementById('rc-confirm-priority-btn').addEventListener('click', async () => {
            const selectedChips = Array.from(modal.querySelectorAll('.rc-p-chip.selected')).map(chip => chip.dataset.value);
            const customReason = document.getElementById('rc-priority-reason-input').value.trim();
            
            let finalReason = selectedChips.join(', ');
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

            closeModal();
            showNotification("Prioridade Ativada!", "success");
        });
    },

    // ── ADICIONAR ASSISTIDO (NOVO MODAL) ───────────────────────────────────────

    _abrirModalAdicionarAssistido(pautaId, pautaNome) {
        const existing = document.getElementById('rc-modal-add-assistido');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'rc-modal-add-assistido';
        modal.className = 'fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[200] p-4 backdrop-blur-sm animate-fade-in';
        
        let assuntosDatalistHtml = '';
        if (flatSubjects && flatSubjects.length > 0) {
            assuntosDatalistHtml = `
                <datalist id="rc-lista-assuntos">
                    ${flatSubjects.map(s => `<option value="${escapeHTML(s.value)}">${escapeHTML(s.description || '')}</option>`).join('')}
                </datalist>
            `;
        }
        
        modal.innerHTML = `
            ${assuntosDatalistHtml}
            <div class="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col">
                <div class="bg-emerald-700 px-6 py-4 flex justify-between items-center shrink-0">
                    <div>
                        <h3 class="text-white font-black text-lg flex items-center gap-2">➕ Adicionar Assistido</h3>
                        <p class="text-emerald-100 text-[10px] uppercase tracking-wider mt-0.5">Pauta: ${escapeHTML(pautaNome)}</p>
                    </div>
                    <button id="rc-modal-add-close" class="text-emerald-200 hover:text-white text-3xl font-bold leading-none transition-colors">&times;</button>
                </div>
                
                <form id="rc-form-add-assistido" class="p-6 space-y-4 overflow-y-auto max-h-[80vh]">
                    <div>
                        <label class="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Nome Completo <span class="text-red-500">*</span></label>
                        <input type="text" id="rc-add-nome" required class="w-full p-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Digite o nome completo">
                    </div>
                    
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">CPF (Opcional)</label>
                            <input type="text" id="rc-add-cpf" class="w-full p-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="000.000.000-00">
                        </div>
                        <div>
                            <label class="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Nº Agendamento</label>
                            <input type="text" id="rc-add-agendamento" class="w-full p-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-mono" placeholder="#12345">
                        </div>
                    </div>

                    <div>
                        <label class="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Assunto / Motivo (Opcional)</label>
                        <input type="text" id="rc-add-assunto" list="rc-lista-assuntos" class="w-full p-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Ex: Divórcio, Pensão, etc.">
                    </div>

                    <div>
                        <label class="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Prioridade</label>
                        <select id="rc-add-prioridade" class="w-full p-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white">
                            <option value="">Nenhuma</option>
                            <option value="URGENTE" class="font-bold text-red-600">🚨 URGENTE</option>
                            <option value="Máxima">🔴 Máxima</option>
                            <option value="Média">🟡 Média</option>
                            <option value="Mínima">🔵 Mínima</option>
                        </select>
                    </div>

                    <div class="pt-2">
                        <label class="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Ação Imediata</label>
                        <div class="grid grid-cols-2 gap-3">
                            <label class="cursor-pointer bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center gap-2 hover:bg-slate-100 transition">
                                <input type="radio" name="rc_add_status" value="pauta" checked class="w-4 h-4 text-emerald-600 focus:ring-emerald-500">
                                <div class="text-sm font-bold text-slate-700">Apenas Agendar</div>
                            </label>
                            <label class="cursor-pointer bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2 hover:bg-amber-100 transition">
                                <input type="radio" name="rc_add_status" value="aguardando" class="w-4 h-4 text-emerald-600 focus:ring-emerald-500">
                                <div class="text-sm font-bold text-amber-800">Fazer Check-in</div>
                            </label>
                        </div>
                    </div>

                    <div class="pt-4 flex gap-3">
                        <button type="button" id="rc-btn-add-cancelar" class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl transition text-sm">Cancelar</button>
                        <button type="submit" id="rc-btn-add-salvar" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl transition text-sm shadow">Salvar Assistido</button>
                    </div>
                </form>
            </div>
        `;

        document.body.appendChild(modal);

        const closeModal = () => modal.remove();
        document.getElementById('rc-modal-add-close').onclick = closeModal;
        document.getElementById('rc-btn-add-cancelar').onclick = closeModal;
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

        document.getElementById('rc-form-add-assistido').onsubmit = async (e) => {
            e.preventDefault();
            
            const btn = document.getElementById('rc-btn-add-salvar');
            btn.disabled = true;
            btn.innerHTML = '<span class="animate-pulse">Salvando...</span>';

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
                priority: prioridadeSelecionada || null
            };

            const app = this._app;
            const sucesso = await PautaService.addAssistedProgrammatic(
                app.db, 
                pautaId, 
                assistedData, 
                app.currentUserName || 'Recepção Central'
            );

            if (sucesso) {
                closeModal();
                if (isAguardando) {
                    playSound('notification');
                }
            } else {
                btn.disabled = false;
                btn.innerHTML = 'Tentar Novamente';
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
                    if (matchNome || matchNum) {
                        encontrados.push({ pauta, assistido: a });
                    }
                }
            }

            if (encontrados.length === 0) {
                resultados.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">Nenhum resultado encontrado.</p>`;
                return;
            }

            resultados.innerHTML = encontrados.map(({ pauta, assistido: a }) => {
                const sl           = statusLabel(a.status);
                const podeCheckin = a.status === 'pauta';
                return `
                    <div class="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm">
                        <div class="min-w-0 flex-1">
                            <p class="font-black text-slate-800 text-sm truncate">
                                ${escapeHTML(a.name)} 
                            </p>
                            <p class="text-[10px] text-slate-500 truncate">
                                ${a.numAgendamento ? `<span class="font-mono text-slate-400 mr-1">#${a.numAgendamento}</span>` : ''}
                                ${a.scheduledTime ? `⏰ ${a.scheduledTime} · ` : ''}
                                ${escapeHTML(pauta.name)} · ${escapeHTML(a.subject || '')}
                                ${a.assignedCollaborator?.name || a.attendant ? ` · 🧑‍💻 ${escapeHTML(a.assignedCollaborator?.name || a.attendant)}` : ''}
                            </p>
                        </div>
                        <span class="text-[10px] font-black px-2 py-0.5 rounded ${sl.cor}">${sl.txt}</span>
                        ${podeCheckin ? `
                            <button class="rc-busca-checkin bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-black px-3 py-1.5 rounded-lg transition"
                                data-pauta="${pauta.id}" data-id="${a.id}">
                                Check-in
                            </button>
                        ` : ''}
                    </div>
                `;
            }).join('');

            resultados.querySelectorAll('.rc-busca-checkin').forEach(btn => {
                btn.addEventListener('click', () => {
                    this._abrirModalCheckinComHorario(btn.dataset.pauta, btn.dataset.id);
                    input.value        = '';
                    resultados.innerHTML = '';
                    document.getElementById('rc-busca-global-wrap').classList.add('hidden');
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
        const existing = document.getElementById('rc-modal-checkin-horario');
        if (existing) existing.remove();

        const pauta = estado.pautasHoje.find(p => p.id === pautaId);
        const assistidos = estado.assistidosPorPauta[pautaId] || [];
        const assistido = assistidos.find(a => a.id === assistidoId);
        if (!assistido) return;

        const horaAtual = new Date().toTimeString().slice(0, 5);

        const modal = document.createElement('div');
        modal.id = 'rc-modal-checkin-horario';
        modal.className = 'fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[250] p-4 backdrop-blur-sm animate-fade-in';
        modal.innerHTML = `
            <div class="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden p-6 space-y-4">
                <div class="flex justify-between items-center border-b pb-3">
                    <h3 class="font-black text-slate-800 text-base">Check-in: ${escapeHTML(assistido.name)}</h3>
                    <button id="rc-checkin-close" class="text-slate-400 hover:text-red-500 text-2xl">&times;</button>
                </div>
                <div>
                    <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Horário de Chegada</label>
                    <input type="time" id="rc-input-hora-chegada" value="${horaAtual}" class="w-full p-3 border border-slate-300 rounded-xl font-bold text-base outline-none focus:ring-2 focus:ring-amber-500">
                    <p class="text-[10px] text-slate-400 mt-1">O sistema calculará automaticamente se houve atraso em relação ao horário agendado.</p>
                </div>
                <div class="flex gap-2 pt-2">
                    <button type="button" id="rc-checkin-cancel" class="flex-1 bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl text-xs">Cancelar</button>
                    <button type="button" id="rc-checkin-confirm" class="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold py-2.5 rounded-xl text-xs shadow">Confirmar Check-in</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const closeModal = () => modal.remove();
        document.getElementById('rc-checkin-close').onclick = closeModal;
        document.getElementById('rc-checkin-cancel').onclick = closeModal;

        document.getElementById('rc-checkin-confirm').onclick = async () => {
            const horaStr = document.getElementById('rc-input-hora-chegada').value;
            closeModal();
            await this._marcarChegadaComDados(pautaId, assistidoId, horaStr);
        };
    },

    async _voltarStatusAssistido(pautaId, assistidoId, destino) {
        const app = this._app;
        const msg = destino === 'pauta' ? 'Assistido retornado para Agendados.' : 'Assistido retornado para Fila de Espera.';
        
        let updates = { status: destino };
        
        if (destino === 'pauta') {
            updates.arrivalTime = null;
            updates.checkInOrder = null;
        } else if (destino === 'aguardando') {
            updates.assignedCollaborator = null;
            updates.inAttendanceTime = null;
        }

        await PautaService.updateStatus(
            app.db,
            pautaId,
            assistidoId,
            updates,
            app.currentUserName
        );
        showNotification(msg, "info");
    },

    async _chamarAssistidoEspecifico(pautaId, assistidoId) {
        const pauta = estado.pautasHoje.find(p => p.id === pautaId);
        if (!pauta) return;

        const assistidos = estado.assistidosPorPauta[pautaId] || [];
        const assistido = assistidos.find(a => a.id === assistidoId);
        
        if (!assistido) return;

        const colaboradores = estado.colaboradoresPorPauta[pautaId] || [];
        
        if(colaboradores.length > 0) {
           this._abrirModalSeletorColaborador(pautaId, assistido, colaboradores, pauta);
        } else {
             await this._executarChamado(pautaId, assistido, pauta, null);
        }
    },

    async _chamarProximo(pautaId) {
        const app   = this._app;
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
        
        if(colaboradores.length > 0) {
           this._abrirModalSeletorColaborador(pautaId, proximo, colaboradores, pauta);
        } else {
             await this._executarChamado(pautaId, proximo, pauta, null);
        }
    },
    
    _abrirModalSeletorColaborador(pautaId, assistido, colaboradores, pauta) {
        const existing = document.getElementById('rc-modal-seletor-colaborador');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'rc-modal-seletor-colaborador';
        modal.className = 'fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[200] p-4 backdrop-blur-sm animate-fade-in';
        
        let colaboradoresOptions = '<option value="">Sem atribuição direta</option>';
        
        const colabOrdenados = [...colaboradores].sort((a,b) => {
            const aLivre = a.status === 'disponivel' || !a.status;
            const bLivre = b.status === 'disponivel' || !b.status;
            if (aLivre === bLivre) return (a.nome || '').localeCompare(b.nome || '');
            return aLivre ? -1 : 1;
        });

        colabOrdenados.forEach(c => {
             const livre = c.status === 'disponivel' || !c.status;
             const statusTxt = livre ? '(Livre)' : '(Ocupado)';
             colaboradoresOptions += `<option value="${c.id}" data-nome="${escapeHTML(c.nome)}">${escapeHTML(c.nome)} - ${escapeHTML(c.cargo || 'Membro')} ${statusTxt}</option>`;
        });

        modal.innerHTML = `
            <div class="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col">
                <div class="bg-indigo-700 px-6 py-4 flex justify-between items-center shrink-0">
                    <div>
                        <h3 class="text-white font-black text-lg flex items-center gap-2">📣 Direcionar Atendimento</h3>
                        <p class="text-indigo-100 text-[10px] uppercase tracking-wider mt-0.5">Assistido: ${escapeHTML(assistido.name)}</p>
                    </div>
                    <button id="rc-modal-colaborador-close" class="text-indigo-200 hover:text-white text-3xl font-bold leading-none transition-colors">&times;</button>
                </div>
                
                <div class="p-6 space-y-4">
                    <div>
                        <label class="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Para qual mesa / colaborador?</label>
                        <select id="rc-select-colaborador-destino" class="w-full p-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                            ${colaboradoresOptions}
                        </select>
                        <p class="text-[10px] text-slate-400 mt-2">Você pode deixar em branco para apenas chamar no painel sem direcionar a uma mesa específica.</p>
                    </div>

                    <div class="pt-4 flex gap-3">
                        <button type="button" id="rc-btn-colaborador-cancelar" class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl transition text-sm">Cancelar</button>
                        <button type="button" id="rc-btn-colaborador-confirmar" class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition text-sm shadow">Confirmar Chamada</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const closeModal = () => modal.remove();
        document.getElementById('rc-modal-colaborador-close').onclick = closeModal;
        document.getElementById('rc-btn-colaborador-cancelar').onclick = closeModal;
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

        document.getElementById('rc-btn-colaborador-confirmar').onclick = async () => {
            const select = document.getElementById('rc-select-colaborador-destino');
            const colaboradorId = select.value;
            let colaboradorObj = null;
            
            if(colaboradorId) {
                const opt = select.options[select.selectedIndex];
                colaboradorObj = {
                    id: colaboradorId,
                    name: opt.getAttribute('data-nome')
                };
            }
            
            closeModal();
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

         if(colaboradorDestinoObj) {
             updates.assignedCollaborator = {
                 id: colaboradorDestinoObj.id,
                 name: colaboradorDestinoObj.name
             };
         }

         await PautaService.updateStatus(
             app.db,
             pautaId,
             assistido.id,
             updates,
             app.currentUserName
         );
         
         if(colaboradorDestinoObj && colaboradorDestinoObj.id) {
             try {
                const colabDocRef = doc(app.db, "pautas", pautaId, "collaborators", colaboradorDestinoObj.id);
                await updateDoc(colabDocRef, {
                    status: 'ocupado',
                    currentAttendance: assistido.id
                });
             } catch(e) {
                 console.warn("Aviso: Falha ao atualizar status do colaborador para ocupado.", e);
             }
         }

         showNotification(`📣 Chamado: ${assistido.name}`, "success");
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
            await setDoc(painelRef, {
                atual: chamado,
                historico: historico
            }, { merge: true });
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

        document.getElementById('rc-btn-busca-global')?.addEventListener('click', () => {
            const wrap = document.getElementById('rc-busca-global-wrap');
            wrap.classList.toggle('hidden');
            if (!wrap.classList.contains('hidden')) {
                document.getElementById('rc-input-busca')?.focus();
                this._setupBuscaGlobal();
            }
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
            } else if (btn.classList.contains('rc-btn-acomp')) {
                window.open(`?painel=true&pautas=${pautaId}`, '_blank');
            } else if (btn.classList.contains('rc-btn-abrir')) {
                this._abrirFoco(pautaId);
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
        const modoAtual = cacheConfig.modo || recepcao.modoVisualizacao || 'fila';
        const videoAtual = cacheConfig.video !== undefined ? cacheConfig.video : (recepcao.videoUrl || '');
        const somAtual = cacheConfig.som !== undefined ? cacheConfig.som : true;

        const existing = document.getElementById('rc-modal-config-tv');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'rc-modal-config-tv';
        modal.className = 'fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[200] p-4 backdrop-blur-sm animate-fade-in';
        
        modal.innerHTML = `
            <div class="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
                <div class="bg-slate-800 px-6 py-5 flex justify-between items-center shrink-0">
                    <div>
                        <h3 class="text-white font-black text-xl flex items-center gap-2">⚙️ Configurar Painel da TV</h3>
                        <p class="text-slate-400 text-sm mt-0.5">${escapeHTML(recepcao.nome || 'Recepção Central')}</p>
                    </div>
                    <button id="rc-modal-tv-close" class="text-slate-400 hover:text-white text-3xl font-bold leading-none transition-colors">&times;</button>
                </div>
                
                <div class="p-6 overflow-y-auto flex-1 space-y-6 bg-slate-50">
                    
                    <div>
                        <label class="block text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Modo de Visualização</label>
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <label class="tv-modo-card cursor-pointer bg-white border-2 border-slate-200 rounded-xl p-4 text-center hover:border-indigo-300 transition-all flex flex-col items-center gap-2 ${modoAtual === 'fila' ? 'border-indigo-600 bg-indigo-50/30 ring-1 ring-indigo-600' : ''}">
                                <input type="radio" name="tv_modo" value="fila" class="hidden" ${modoAtual === 'fila' ? 'checked' : ''}>
                                <span class="text-3xl">📋</span>
                                <div>
                                    <p class="font-bold text-slate-800">Fila (Lista)</p>
                                    <p class="text-[10px] text-slate-500 mt-1">Cards com fila e chamados</p>
                                </div>
                            </label>
                            <label class="tv-modo-card cursor-pointer bg-white border-2 border-slate-200 rounded-xl p-4 text-center hover:border-indigo-300 transition-all flex flex-col items-center gap-2 ${modoAtual === 'tv' ? 'border-indigo-600 bg-indigo-50/30 ring-1 ring-indigo-600' : ''}">
                                <input type="radio" name="tv_modo" value="tv" class="hidden" ${modoAtual === 'tv' ? 'checked' : ''}>
                                <span class="text-3xl">📺</span>
                                <div>
                                    <p class="font-bold text-slate-800">TV Chamados</p>
                                    <p class="text-[10px] text-slate-500 mt-1">Painel verde com histórico</p>
                                </div>
                            </label>
                            <label class="tv-modo-card cursor-pointer bg-white border-2 border-slate-200 rounded-xl p-4 text-center hover:border-indigo-300 transition-all flex flex-col items-center gap-2 ${modoAtual === 'video' ? 'border-indigo-600 bg-indigo-50/30 ring-1 ring-indigo-600' : ''}">
                                <input type="radio" name="tv_modo" value="video" class="hidden" ${modoAtual === 'video' ? 'checked' : ''}>
                                <span class="text-3xl">🎬</span>
                                <div>
                                    <p class="font-bold text-slate-800">TV + Vídeo</p>
                                    <p class="text-[10px] text-slate-500 mt-1">Vídeo + banner de chamado</p>
                                </div>
                            </label>
                        </div>
                    </div>

                    <div>
                        <label class="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Link do YouTube ou Vídeo</label>
                        <input type="text" id="tv_video_url" value="${escapeHTML(videoAtual)}"
                            class="w-full bg-white border-2 border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all text-slate-700 font-mono"
                            placeholder="https://www.youtube.com/watch?v=...">
                        <p class="text-[10px] text-slate-400 mt-1.5 font-medium">Funciona com links do YouTube, Shorts, Lives ou arquivos .mp4</p>
                    </div>

                    <div>
                        <label class="block text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Som ao Chamar Próximo</label>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <label class="tv-som-card cursor-pointer bg-white border-2 border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3 hover:border-slate-300 transition-all ${somAtual === true ? 'border-slate-600 bg-slate-50' : ''}">
                                <input type="radio" name="tv_som" value="1" class="w-4 h-4 text-indigo-600 focus:ring-indigo-500" ${somAtual === true ? 'checked' : ''}>
                                <div>
                                    <p class="font-bold text-slate-800 text-sm flex items-center gap-1.5">🔔 Ativado</p>
                                    <p class="text-[10px] text-slate-500">Toca ding-dong ao chamar</p>
                                </div>
                            </label>
                            <label class="tv-som-card cursor-pointer bg-white border-2 border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3 hover:border-slate-300 transition-all ${somAtual === false ? 'border-slate-600 bg-slate-50' : ''}">
                                <input type="radio" name="tv_som" value="0" class="w-4 h-4 text-indigo-600 focus:ring-indigo-500" ${somAtual === false ? 'checked' : ''}>
                                <div>
                                    <p class="font-bold text-slate-800 text-sm flex items-center gap-1.5">🔇 Desligado</p>
                                    <p class="text-[10px] text-slate-500">Sem som automático</p>
                                </div>
                            </label>
                        </div>
                    </div>

                    <div class="bg-slate-100/80 border border-slate-200 rounded-xl p-4">
                        <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Pré-Visualização do Link Gerado</label>
                        <textarea id="tv_preview_link" readonly class="w-full bg-transparent border-0 text-[11px] text-slate-500 font-mono resize-none focus:ring-0 p-0 h-12 outline-none"></textarea>
                    </div>

                </div>

                <div class="bg-white border-t border-slate-200 px-6 py-4 flex flex-col sm:flex-row gap-3 shrink-0">
                    <button id="rc-btn-tv-cancelar" class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl transition text-sm">
                        Cancelar
                    </button>
                    <button id="rc-btn-tv-abrir" class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition text-sm shadow flex items-center justify-center gap-2">
                        📺 Abrir Painel
                    </button>
                    <button id="rc-btn-tv-salvar" class="flex-1 bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 rounded-xl transition text-sm shadow flex items-center justify-center gap-2">
                        💾 Salvar e Copiar Link
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const updatePreview = () => {
            const modo = document.querySelector('input[name="tv_modo"]:checked').value;
            const video = encodeURIComponent(document.getElementById('tv_video_url').value.trim());
            const som = document.querySelector('input[name="tv_som"]:checked').value;
            
            const ids  = estado.pautasHoje.map(p => p.id).join(',');
            const nome = encodeURIComponent(recepcao.nome || this._unidadeAtual?.nome || 'Recepção');
            
            let baseUrl = window.location.href.split('?')[0];
            const link = `${baseUrl}?painel=true&pautas=${ids}&nome=${nome}&modo=${modo}&video=${video}&som=${som}`;
            
            document.getElementById('tv_preview_link').value = link;
            return { link, modo, video, som };
        };

        modal.querySelectorAll('input[name="tv_modo"]').forEach(radio => {
            radio.addEventListener('change', () => {
                modal.querySelectorAll('.tv-modo-card').forEach(card => {
                    card.classList.remove('border-indigo-600', 'bg-indigo-50/30', 'ring-1', 'ring-indigo-600');
                });
                radio.closest('.tv-modo-card').classList.add('border-indigo-600', 'bg-indigo-50/30', 'ring-1', 'ring-indigo-600');
                updatePreview();
            });
        });

        modal.querySelectorAll('input[name="tv_som"]').forEach(radio => {
            radio.addEventListener('change', () => {
                modal.querySelectorAll('.tv-som-card').forEach(card => {
                    card.classList.remove('border-slate-600', 'bg-slate-50');
                });
                radio.closest('.tv-som-card').classList.add('border-slate-600', 'bg-slate-50');
                updatePreview();
            });
        });

        document.getElementById('tv_video_url').addEventListener('input', updatePreview);

        updatePreview();

        const closeModal = () => modal.remove();
        document.getElementById('rc-modal-tv-close').onclick = closeModal;
        document.getElementById('rc-btn-tv-cancelar').onclick = closeModal;
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

        const saveConfig = async () => {
            const data = updatePreview();
            const configToSave = { modo: data.modo, video: decodeURIComponent(data.video), som: data.som === '1' };
            
            localStorage.setItem(`sigep_tv_config_${recepcao.id}`, JSON.stringify(configToSave));

            try {
                await updateDoc(doc(this._app.db, "recepcoes", recepcao.id), {
                    modoVisualizacao: configToSave.modo,
                    videoUrl: configToSave.video
                });
            } catch(e) { }

            return data.link;
        };

        document.getElementById('rc-btn-tv-abrir').addEventListener('click', async () => {
            const link = await saveConfig();
            window.open(link, '_blank');
            closeModal();
        });

        document.getElementById('rc-btn-tv-salvar').addEventListener('click', async () => {
            const link = await saveConfig();
            navigator.clipboard.writeText(link).then(() => {
                showNotification("Configuração salva e Link copiado com sucesso!", "success");
                closeModal();
            }).catch(() => showNotification("Erro ao copiar o link.", "error"));
        });
    },

    // ── MODAL CHECK-IN ─────────────────────────────────────────────────────────

    _abrirModalCheckin(pautaId) {
        const pauta = estado.pautasHoje.find(p => p.id === pautaId);
        if (!pauta) return;

        const assistidos = estado.assistidosPorPauta[pautaId] || [];
        const naPauta    = assistidos.filter(a => a.status === 'pauta');

        const existing = document.getElementById('rc-modal-checkin');
        if (existing) existing.remove();

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
                                        <p class="font-bold text-slate-800 text-sm">${escapeHTML(a.name)} ${a.numAgendamento ? `<span class="text-xs text-slate-400 font-mono ml-1">#${a.numAgendamento}</span>` : ''}</p>
                                        <p class="text-[10px] text-slate-500">${a.scheduledTime ? `⏰ ${a.scheduledTime} · ` : ''}${escapeHTML(a.subject || '')}</p>
                                    </div>
                                    <button class="rc-modal-checkin-btn bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition"
                                        data-id="${a.id}" data-nome="${escapeHTML(a.name)}">
                                        Registrar
                                    </button>
                                </div>
                            `).join('')
                        }
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('rc-modal-checkin-close').onclick = () => modal.remove();
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

        document.getElementById('rc-modal-busca').addEventListener('input', (e) => {
            const t = normalizeText(e.target.value);
            modal.querySelectorAll('.rc-modal-checkin-btn').forEach(btn => {
                const linha = btn.closest('div.flex');
                const nome  = normalizeText(btn.dataset.nome);
                linha.style.display = nome.includes(t) ? '' : 'none';
            });
        });

        modal.querySelectorAll('.rc-modal-checkin-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                modal.remove();
                this._abrirModalCheckinComHorario(pautaId, btn.dataset.id);
            });
        });
    },

    // ── FECHAR ─────────────────────────────────────────────────────────────────

    fechar() {
        this._cancelarListeners();
        const app = this._app;
        if (app && app.router) {
            app.router.navigate('pauta-selection');
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
