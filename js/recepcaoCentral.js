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
        pauta:                  { txt: 'Agendado',    cor: 'bg-slate-100 text-slate-600 border-slate-200' },
        aguardando:             { txt: 'Aguardando',  cor: 'bg-amber-50 text-amber-600 border-amber-200' },
        emAtendimento:          { txt: 'Atendendo',   cor: 'bg-blue-50 text-blue-600 border-blue-200' },
        aguardandoDistribuicao: { txt: 'Distribuição',cor: 'bg-cyan-50 text-cyan-600 border-cyan-200' },
        atendido:               { txt: 'Finalizado',  cor: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
        faltoso:                { txt: 'Faltou',      cor: 'bg-red-50 text-red-600 border-red-200' },
    };
    return map[status] || { txt: status, cor: 'bg-gray-50 text-gray-500 border-gray-200' };
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
        htmlLista = itens.map(i => `<span class="inline-block bg-slate-50 text-slate-500 border border-slate-200 text-[9px] px-1.5 py-0.5 rounded mr-1 mb-1">📄 ${escapeHTML(i)}</span>`).join('');
    } 
    else if (typeof docs === 'object') {
        const keys = Object.keys(docs);
        if(keys.length === 0) return '';
        htmlLista = keys.map(k => {
            const checked = docs[k];
            return `<span class="inline-block ${checked ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-rose-50 text-rose-500 border-rose-200'} border text-[9px] px-1.5 py-0.5 rounded mr-1 mb-1">
                ${checked ? '✓' : '✗'} ${escapeHTML(k)}
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
                <div class="bg-amber-50 border border-amber-200 rounded-3xl p-10 max-w-md mx-auto shadow-sm">
                    <span class="text-6xl block mb-4">🔒</span>
                    <h3 class="text-xl font-bold text-amber-800 mb-2">Acesso Restrito</h3>
                    <p class="text-amber-600 text-sm">Você não tem permissão para acessar nenhuma recepção no momento.</p>
                    <button id="rc-voltar-sem-permissao" class="mt-8 bg-slate-800 text-white px-8 py-3 rounded-xl hover:bg-slate-900 transition font-bold w-full">
                        Voltar ao Início
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
            <div class="max-w-5xl mx-auto px-4 py-12">
                <div class="text-center mb-10">
                    <h2 class="text-3xl font-black text-slate-800 tracking-tight">Selecione sua Recepção</h2>
                    <p class="text-slate-500 mt-2">Escolha qual área ou fluxo você irá operar agora.</p>
                </div>
                
                ${RecepcaoConfigService.renderSelectorRecepcoes(recepcoes)}
                
                <div class="mt-12 flex justify-center">
                    <button id="rc-voltar-selector" class="bg-white border border-slate-300 text-slate-600 font-bold px-8 py-3 rounded-xl hover:bg-slate-50 hover:text-slate-800 transition shadow-sm flex items-center gap-2">
                        ← Voltar para o Painel Principal
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
            <div class="flex justify-center items-center h-[60vh]">
                <div class="text-center animate-pulse">
                    <div class="w-12 h-12 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4"></div>
                    <p class="text-slate-500 font-medium">Carregando painel de recepção...</p>
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

    // ── RENDER TELA PRINCIPAL (DESIGN MODERNO) ────────────────────────────────

    _renderTelaComContexto() {
        const container = document.getElementById('recepcao-central-container');
        if (!container) return;

        const contexto = RecepcaoConfigService.getContextoRecepcao(this._recepcaoAtual);

        container.innerHTML = `
            <div class="recepcao-central-wrap max-w-[1400px] mx-auto px-4 sm:px-6 py-6 animate-fade-in">

                <!-- Header Superior Minimalista -->
                <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 rounded-xl flex items-center justify-center text-2xl bg-white border border-slate-200 shadow-sm shrink-0">
                            ${contexto.icone}
                        </div>
                        <div>
                            <h1 class="text-2xl font-black text-slate-800 tracking-tight leading-none">${contexto.titulo}</h1>
                            <p class="text-sm text-slate-500 font-medium mt-1">${contexto.subtitulo}</p>
                        </div>
                    </div>
                    
                    <div class="flex items-center gap-3 w-full sm:w-auto">
                        <button id="rc-trocar-recepcao" class="bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-bold px-4 py-2.5 rounded-xl transition shadow-sm flex items-center gap-2 flex-1 sm:flex-none justify-center">
                            🔄 Trocar Setor
                        </button>
                        <button id="rc-btn-configurar-tv" class="bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 text-indigo-700 text-sm font-bold px-4 py-2.5 rounded-xl transition flex items-center gap-2 flex-1 sm:flex-none justify-center">
                            📺 Painel TV
                        </button>
                    </div>
                </div>

                <!-- Busca Global em Destaque -->
                <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-2 pl-4 mb-8 flex items-center gap-3 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-all">
                    <span class="text-slate-400 text-lg">🔍</span>
                    <input type="search" id="rc-input-busca" placeholder="Buscar assistido por nome, CPF ou nº de agendamento em todas as pautas..." 
                        class="w-full bg-transparent border-none text-slate-700 placeholder-slate-400 text-base focus:ring-0 py-2 outline-none">
                </div>
                
                <!-- Container de Resultados da Busca -->
                <div id="rc-resultados-busca" class="mb-8 space-y-2 max-h-96 overflow-y-auto empty:hidden"></div>

                <!-- Resumo em Pílulas (Pills) -->
                <div id="rc-sumario" class="flex flex-wrap items-center gap-3 mb-8"></div>

                <!-- Filtros Tipo Tabs -->
                <div class="flex items-center gap-2 overflow-x-auto pb-4 mb-4 scrollbar-hide">
                    <span class="text-xs font-bold text-slate-400 uppercase tracking-widest mr-2 shrink-0">Filtrar:</span>
                    ${['todos','agendamento','avulso','multisala', 'mutirao', 'plantao', 'acao_social'].map(t => `
                        <button class="rc-filtro-tipo shrink-0 text-xs font-bold px-4 py-2 rounded-full transition-all border
                            ${(this._filtroTipo || 'todos') === t
                                ? 'bg-slate-800 text-white border-slate-800 shadow-md'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'}"
                            data-tipo="${t}">
                            ${t === 'todos' ? 'Todos'
                            : t === 'agendamento' ? 'Agendamento'
                            : t === 'avulso' ? 'Avulso'
                            : t === 'multisala' ? 'Multi-Sala'
                            : t === 'mutirao' ? 'Mutirão'
                            : t === 'plantao' ? 'Plantão'
                            : 'Ação Social'}
                        </button>
                    `).join('')}
                    <button id="rc-btn-atualizar" class="shrink-0 bg-white border border-slate-200 text-slate-500 hover:text-indigo-600 px-3 py-2 rounded-full transition shadow-sm ml-auto" title="Recarregar pautas">
                        🔄 Atualizar
                    </button>
                </div>

                <!-- Grade de Pautas -->
                <div id="rc-grade-pautas" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5"></div>

                <!-- Painel Foco (Oculto inicialmente) -->
                <div id="rc-painel-foco" class="hidden"></div>

            </div>
        `;

        this._renderGrade();
        this._renderSumario();
        this._setupInteracoes();
        this._setupBuscaGlobal(); // Já ativa a busca global direto no input principal

        document.getElementById('rc-trocar-recepcao')?.addEventListener('click', async () => {
            this._cancelarListeners();
            await this._carregarRecepcoesDoUsuario();
            await this._mostrarSelectorRecepcoes();
        });
    },

    // ── GRADE DE PAUTAS (CARDS MODERNOS) ───────────────────────────────────────

    _renderGrade() {
        const grade = document.getElementById('rc-grade-pautas');
        if (!grade) return;

        if (estado.pautasHoje.length === 0) {
            grade.innerHTML = `
                <div class="col-span-full text-center py-20 bg-slate-50 rounded-3xl border border-dashed border-slate-300">
                    <span class="text-4xl block mb-3 opacity-50">📂</span>
                    <p class="font-bold text-slate-500 text-lg">Nenhuma pauta ativa encontrada</p>
                    <p class="text-sm text-slate-400 mt-1">Verifique os filtros selecionados ou crie uma nova pauta no sistema principal.</p>
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

        const dataPautaStr = pauta.dataAtuacao || pauta.data || pauta.createdAt 
            ? new Date(pauta.dataAtuacao || pauta.data || pauta.createdAt).toLocaleDateString('pt-BR') 
            : '';

        const aguardando = PautaService.sortAguardando(
            assistidos.filter(a => a.status === 'aguardando'),
            pauta.ordemAtendimento
        );

        const listaNomes = aguardando.length === 0
            ? `<div class="py-4 text-center text-[11px] text-slate-400 bg-slate-50/50 rounded-lg border border-slate-100 italic">Fila vazia no momento.</div>`
            : aguardando.slice(0, 4).map((a, i) => `
                <div class="flex items-center gap-3 py-1.5 group">
                    <span class="w-5 h-5 rounded bg-slate-100 text-slate-500 flex items-center justify-center text-[10px] font-bold shrink-0">${i + 1}</span>
                    <div class="min-w-0 flex-1">
                        <p class="text-xs font-bold text-slate-700 truncate group-hover:text-indigo-600 transition-colors">${escapeHTML(a.name)}</p>
                    </div>
                    <span class="text-[10px] font-medium text-slate-400 bg-white border border-slate-200 px-1.5 py-0.5 rounded shrink-0">${a.scheduledTime || '---'}</span>
                </div>
            `).join('')
            + (aguardando.length > 4
                ? `<div class="text-[10px] font-bold text-indigo-600 text-center pt-2 mt-1 border-t border-slate-100">+${aguardando.length - 4} aguardando</div>`
                : '');

        return `
            <div id="rc-card-${pauta.id}" class="bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-lg transition-all duration-300 flex flex-col" data-pauta-id="${pauta.id}">
                
                <!-- Cabeçalho do Card -->
                <div class="p-5 border-b border-slate-100">
                    <div class="flex justify-between items-start mb-1 gap-2">
                        <h3 class="font-black text-slate-800 text-lg leading-tight tracking-tight truncate flex-1">${escapeHTML(pauta.name)}</h3>
                        <div class="shrink-0 flex items-center justify-center w-9 h-9 rounded-full ${porcentagem === 100 ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-600'} font-bold text-[10px]">
                            ${porcentagem}%
                        </div>
                    </div>
                    <p class="text-xs font-bold text-indigo-500 uppercase tracking-wider">${pauta.type || 'agendamento'} ${pauta.sala ? ` • ${escapeHTML(pauta.sala)}` : ''}</p>
                </div>

                <!-- Barrinha fina de progresso -->
                <div class="h-1 w-full bg-slate-100">
                    <div class="h-full bg-indigo-500 transition-all duration-700" style="width:${porcentagem}%"></div>
                </div>

                <!-- Métricas Horizontais Minimalistas -->
                <div class="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                    <div class="flex flex-col">
                        <span class="text-xl font-black text-slate-700 leading-none">${c.naPauta}</span>
                        <span class="text-[9px] font-bold text-slate-400 uppercase mt-1">Agenda</span>
                    </div>
                    <div class="w-px h-6 bg-slate-200"></div>
                    <div class="flex flex-col">
                        <span class="text-xl font-black text-amber-500 leading-none">${c.aguardando}</span>
                        <span class="text-[9px] font-bold text-amber-600/70 uppercase mt-1">Fila</span>
                    </div>
                    <div class="w-px h-6 bg-slate-200"></div>
                    <div class="flex flex-col">
                        <span class="text-xl font-black text-blue-500 leading-none">${c.emAtendimento}</span>
                        <span class="text-[9px] font-bold text-blue-600/70 uppercase mt-1">Mesa</span>
                    </div>
                    <div class="w-px h-6 bg-slate-200"></div>
                    <div class="flex flex-col">
                        <span class="text-xl font-black text-emerald-500 leading-none">${c.atendidos}</span>
                        <span class="text-[9px] font-bold text-emerald-600/70 uppercase mt-1">Feitos</span>
                    </div>
                </div>

                <!-- Preview da Fila -->
                <div class="px-5 py-4 flex-1">
                    <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Próximos da Fila</p>
                    <div class="space-y-1">
                        ${listaNomes}
                    </div>
                </div>

                <!-- Equipe -->
                <div class="px-5 py-3 flex items-center justify-between bg-slate-50 border-t border-slate-100">
                    <div class="flex items-center gap-3">
                        <div class="flex items-center gap-1.5" title="Livres">
                            <div class="w-2 h-2 rounded-full bg-emerald-500"></div>
                            <span class="text-xs font-bold text-slate-600">${livres.length}</span>
                        </div>
                        <div class="flex items-center gap-1.5" title="Ocupados">
                            <div class="w-2 h-2 rounded-full bg-rose-500"></div>
                            <span class="text-xs font-bold text-slate-600">${ocupados.length}</span>
                        </div>
                    </div>
                    ${c.distribuicao > 0 ? `<span class="bg-cyan-100 text-cyan-700 text-[9px] font-bold px-2 py-1 rounded-md">⚖️ ${c.distribuicao} p/ Assin.</span>` : ''}
                </div>

                <!-- Botões de Ação Inferiores -->
                <div class="p-4 grid grid-cols-5 gap-2 bg-white border-t border-slate-100 rounded-b-2xl">
                    <button class="rc-btn-abrir col-span-3 bg-slate-800 hover:bg-slate-900 text-white font-bold text-sm py-2.5 rounded-xl transition shadow-sm flex items-center justify-center gap-2" data-pauta-id="${pauta.id}">
                        Abrir Painel <span class="text-lg leading-none">→</span>
                    </button>
                    <button class="rc-btn-checkin col-span-1 bg-white border border-slate-200 hover:border-amber-400 hover:bg-amber-50 text-amber-600 font-bold py-2.5 rounded-xl transition flex items-center justify-center" data-pauta-id="${pauta.id}" title="Fazer Check-in rápido">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </button>
                    <button class="rc-btn-chamar col-span-1 bg-white border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50 text-emerald-600 font-bold py-2.5 rounded-xl transition flex items-center justify-center" data-pauta-id="${pauta.id}" title="Chamar Próximo">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" /></svg>
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

    // ── SUMÁRIO GERAL (PILLS MODERNOS) ─────────────────────────────────────────

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

        const pill = (num, label, cor, border) => `
            <div class="flex items-center gap-2 bg-white px-4 py-2 rounded-full border border-slate-200 shadow-sm shrink-0">
                <span class="w-2.5 h-2.5 rounded-full ${cor}"></span>
                <span class="text-sm font-black text-slate-700">${num}</span>
                <span class="text-xs font-bold text-slate-400 uppercase tracking-wide">${label}</span>
            </div>
        `;

        el.innerHTML = `
            ${pill(totalNaPauta, 'Agendados', 'bg-slate-300')}
            ${pill(totalAg, 'Em Fila', 'bg-amber-400')}
            ${pill(totalEm, 'Mesas', 'bg-blue-500')}
            ${pill(totalAt, 'Concluídos', 'bg-emerald-500')}
            ${totalDist > 0 ? pill(totalDist, 'P/ Assinar', 'bg-cyan-400') : ''}
        `;
    },

    // ── PAINEL DE FOCO (KANBAN CLEAN) ──────────────────────────────────────────

    _abrirFoco(pautaId) {
        estado.pautaFocadaId = pautaId;
        estado.modoVisao     = 'foco';

        document.getElementById('rc-grade-pautas').classList.add('hidden');
        document.getElementById('rc-sumario').classList.add('hidden');
        document.querySelector('.recepcao-central-wrap > div.flex.mb-8').classList.add('hidden'); // esconde input de busca da main
        document.querySelector('.recepcao-central-wrap > div.overflow-x-auto').classList.add('hidden'); // esconde abas de filtro

        const foco = document.getElementById('rc-painel-foco');
        foco.classList.remove('hidden');

        this._renderFoco(pautaId);
    },

    _fecharFoco() {
        estado.pautaFocadaId = null;
        estado.modoVisao     = 'grade';
        
        document.getElementById('rc-grade-pautas').classList.remove('hidden');
        document.getElementById('rc-sumario').classList.remove('hidden');
        document.querySelector('.recepcao-central-wrap > div.flex.mb-8').classList.remove('hidden');
        document.querySelector('.recepcao-central-wrap > div.overflow-x-auto').classList.remove('hidden');
        
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
        const emAtendimentoList = assistidos.filter(a => a.status === 'emAtendimento');

        foco.innerHTML = `
            <div class="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[80vh] min-h-[600px] animate-fade-in">

                <!-- Header do Foco -->
                <div class="bg-white px-6 py-4 flex justify-between items-center border-b border-slate-200 shrink-0 gap-4">
                    <div class="flex items-center gap-4">
                        <button id="rc-btn-voltar-grade" class="w-10 h-10 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-500 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        </button>
                        <div>
                            <h3 class="text-slate-800 font-black text-xl leading-tight">${escapeHTML(pauta.name)}</h3>
                            <div class="flex gap-3 mt-1">
                                <span class="text-slate-400 text-xs font-medium">📋 Total: ${c.total}</span>
                                <span class="text-emerald-500 text-xs font-bold">✓ Feitos: ${c.atendidos}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="flex flex-1 max-w-md mx-4">
                        <div class="relative w-full">
                            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
                            <input type="search" id="rc-foco-input-busca" placeholder="Pesquisar nesta pauta..." class="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all">
                        </div>
                    </div>

                    <div class="flex gap-2 shrink-0">
                        <button id="rc-foco-btn-add-assistido" class="bg-slate-800 hover:bg-slate-900 text-white font-bold px-4 py-2 rounded-xl text-sm transition shadow-sm flex items-center gap-1.5">
                            ➕ Adicionar
                        </button>
                        <button id="rc-foco-btn-chamar" class="bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-4 py-2 rounded-xl text-sm transition shadow-sm flex items-center gap-1.5">
                            📣 Chamar Próximo
                        </button>
                    </div>
                </div>

                <!-- Colunas Kanban -->
                <div class="flex-1 grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-slate-100 overflow-hidden bg-slate-50/50">

                    <!-- Coluna 1: Agendados -->
                    <div class="flex flex-col h-full overflow-hidden">
                        <div class="px-5 py-3 border-b border-slate-100 bg-white/80 backdrop-blur shrink-0 flex justify-between items-center">
                            <h4 class="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                                <div class="w-2 h-2 rounded-full bg-slate-300"></div> Agendados
                            </h4>
                            <span class="bg-slate-100 text-slate-600 text-[10px] font-black px-2 py-0.5 rounded-md">${naPautaList.length}</span>
                        </div>
                        <div class="p-3 flex-1 overflow-y-auto space-y-2 rc-coluna-agendados">
                            ${naPautaList.length === 0 ? `<p class="text-xs text-slate-400 text-center py-10 font-medium">Nenhum agendado.</p>` : ''}
                            ${naPautaList.map(a => `
                                <div class="rc-assistido-card bg-white border border-slate-200 rounded-xl p-3 shadow-sm hover:border-indigo-300 transition-colors group" data-busca="${normalizeText(a.name + ' ' + (a.cpf || '') + ' ' + (a.numAgendamento || '') + ' ' + (a.subject || ''))}">
                                    <div class="flex justify-between items-start mb-2">
                                        <p class="font-bold text-slate-700 text-sm leading-snug pr-2">${escapeHTML(a.name)}</p>
                                        ${a.numAgendamento ? `<span class="bg-slate-50 text-slate-500 border border-slate-100 text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0">#${a.numAgendamento}</span>` : ''}
                                    </div>
                                    <p class="text-[11px] text-slate-500 mb-2 truncate">
                                        ${a.scheduledTime ? `<span class="font-bold text-slate-700">⏰ ${a.scheduledTime}</span> · ` : ''} ${escapeHTML(a.subject || 'Sem assunto')}
                                    </p>
                                    ${a.priority ? `<span class="inline-block mb-2 bg-rose-50 text-rose-600 border border-rose-100 px-2 py-0.5 rounded text-[9px] font-bold uppercase">🚨 ${escapeHTML(a.priorityReason || a.priority)}</span>` : ''}
                                    ${renderVerificacoesBadge(a)}
                                    <div class="mt-2 pt-2 border-t border-slate-100 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button class="rc-foco-checkin w-full bg-amber-100 hover:bg-amber-200 text-amber-700 font-bold py-1.5 rounded-lg text-xs transition" data-id="${a.id}" data-pauta="${pautaId}">Fazer Check-in</button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <!-- Coluna 2: Fila -->
                    <div class="flex flex-col h-full overflow-hidden border-l-4 border-l-amber-400 lg:border-l-0">
                        <div class="px-5 py-3 border-b border-slate-100 bg-white/80 backdrop-blur shrink-0 flex justify-between items-center">
                            <h4 class="text-xs font-bold text-amber-600 uppercase tracking-widest flex items-center gap-1.5">
                                <div class="w-2 h-2 rounded-full bg-amber-400"></div> Em Fila
                            </h4>
                            <span class="bg-amber-100 text-amber-700 text-[10px] font-black px-2 py-0.5 rounded-md">${aguardando.length}</span>
                        </div>
                        <div class="p-3 flex-1 overflow-y-auto space-y-2 rc-coluna-aguardando">
                            ${aguardando.length === 0 ? `<p class="text-xs text-slate-400 text-center py-10 font-medium">Fila vazia.</p>` : ''}
                            ${aguardando.map((a, i) => `
                                <div class="rc-assistido-card bg-white border ${a.priority ? 'border-rose-200 bg-rose-50/30' : 'border-slate-200'} rounded-xl p-3 shadow-sm hover:border-amber-300 transition-colors group flex flex-col" data-busca="${normalizeText(a.name + ' ' + (a.cpf || '') + ' ' + (a.numAgendamento || '') + ' ' + (a.subject || ''))}">
                                    <div class="flex gap-3">
                                        <div class="w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-[10px] font-black flex items-center justify-center shrink-0 border border-amber-200">${i + 1}</div>
                                        <div class="flex-1 min-w-0">
                                            <div class="flex justify-between items-start">
                                                <p class="font-bold text-slate-800 text-sm leading-snug truncate pr-2">${escapeHTML(a.name)}</p>
                                                ${a.numAgendamento ? `<span class="bg-slate-50 text-slate-500 border border-slate-100 text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0">#${a.numAgendamento}</span>` : ''}
                                            </div>
                                            <p class="text-[11px] text-slate-500 mt-0.5 truncate">
                                                ${a.scheduledTime ? `<span class="font-bold text-amber-600">⏰ ${a.scheduledTime}</span> · ` : ''} ${escapeHTML(a.subject || 'Sem assunto')}
                                            </p>
                                            ${a.priority ? `<span class="inline-block mt-1.5 bg-rose-100 text-rose-700 border border-rose-200 px-2 py-0.5 rounded text-[9px] font-bold uppercase">🚨 Prioridade: ${escapeHTML(a.priorityReason || a.priority)}</span>` : ''}
                                            ${renderVerificacoesBadge(a)}
                                        </div>
                                    </div>
                                    <div class="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                                        <div class="flex gap-1">
                                            <button class="rc-foco-abrir-prioridade w-7 h-7 rounded bg-slate-100 text-slate-500 hover:text-amber-600 flex items-center justify-center transition" title="Definir Prioridade" data-id="${a.id}" data-pauta="${pautaId}">⭐</button>
                                            ${(a.priority || a.priorityReason) ? `<button class="rc-foco-remover-prioridade w-7 h-7 rounded bg-rose-50 text-rose-500 hover:text-rose-700 flex items-center justify-center transition" title="Remover Prioridade" data-id="${a.id}" data-pauta="${pautaId}">✖</button>` : ''}
                                        </div>
                                        <div class="flex gap-2">
                                            <button class="rc-foco-voltar text-[10px] text-slate-500 hover:text-slate-800 font-bold px-2 py-1" data-id="${a.id}" data-pauta="${pautaId}" data-destino="pauta">Desfazer Check-in</button>
                                            <button class="rc-foco-chamar-individual text-[11px] bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-3 py-1.5 rounded-lg transition shadow-sm" data-id="${a.id}" data-pauta="${pautaId}">📣 Chamar</button>
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <!-- Coluna 3: Mesas -->
                    <div class="flex flex-col h-full overflow-hidden border-l-4 border-l-blue-400 lg:border-l-0">
                        <div class="px-5 py-3 border-b border-slate-100 bg-white/80 backdrop-blur shrink-0 flex justify-between items-center">
                            <h4 class="text-xs font-bold text-blue-600 uppercase tracking-widest flex items-center gap-1.5">
                                <div class="w-2 h-2 rounded-full bg-blue-500"></div> Nas Mesas
                            </h4>
                            <span class="bg-blue-100 text-blue-700 text-[10px] font-black px-2 py-0.5 rounded-md">${emAtendimentoList.length}</span>
                        </div>
                        <div class="p-3 flex-1 overflow-y-auto space-y-2 rc-coluna-atendimento">
                            ${emAtendimentoList.length === 0 ? `<p class="text-xs text-slate-400 text-center py-10 font-medium">Ninguém em atendimento.</p>` : ''}
                            ${emAtendimentoList.map(a => `
                                <div class="rc-assistido-card bg-white border border-blue-200 rounded-xl p-3 shadow-sm hover:border-blue-400 transition-colors group flex flex-col" data-busca="${normalizeText(a.name + ' ' + (a.cpf || '') + ' ' + (a.numAgendamento || '') + ' ' + (a.subject || ''))}">
                                    <div class="flex justify-between items-start mb-2">
                                        <p class="font-bold text-slate-800 text-sm leading-snug pr-2">${escapeHTML(a.name)}</p>
                                        ${a.numAgendamento ? `<span class="bg-slate-50 text-slate-500 border border-slate-100 text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0">#${a.numAgendamento}</span>` : ''}
                                    </div>
                                    <p class="text-[11px] text-slate-500 mb-2 truncate">
                                        📝 ${escapeHTML(a.subject || 'Sem assunto')}
                                    </p>
                                    <div class="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 border border-blue-100 text-[10px] font-bold px-2 py-1 rounded-md w-max mt-auto">
                                        <span>🧑‍💻</span> ${escapeHTML(a.assignedCollaborator?.name || a.attendant || 'Mesa não atribuída')}
                                    </div>
                                    <div class="mt-2 pt-2 border-t border-slate-100 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button class="rc-foco-voltar text-[10px] text-slate-500 hover:text-blue-600 font-bold px-2 py-1" data-id="${a.id}" data-pauta="${pautaId}" data-destino="aguardando">← Voltar p/ Fila</button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                        
                        <!-- Mini Painel de Equipe Embaixo -->
                        <div class="h-32 border-t border-slate-200 bg-slate-50 flex flex-col shrink-0">
                            <div class="px-4 py-2 border-b border-slate-200 bg-white flex justify-between items-center">
                                <span class="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Equipe Online</span>
                                <span class="text-[10px] font-bold text-slate-400">${colaboradores.length}</span>
                            </div>
                            <div class="flex-1 p-2 overflow-y-auto flex flex-wrap gap-1.5 items-start content-start">
                                ${colaboradores.length === 0 ? `<p class="text-[10px] text-slate-400 w-full text-center mt-2">Vazio</p>` : ''}
                                ${colaboradores.map(col => {
                                    const livre = col.status === 'disponivel' || !col.status;
                                    return `
                                        <div class="flex items-center gap-1.5 px-2 py-1 bg-white border border-slate-200 rounded text-[10px]">
                                            <div class="w-1.5 h-1.5 rounded-full ${livre ? 'bg-emerald-500' : 'bg-rose-500'}"></div>
                                            <span class="font-bold text-slate-700 truncate max-w-[80px]" title="${escapeHTML(col.nome)}">${escapeHTML(col.nome.split(' ')[0])}</span>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        `;

        // Refaz os event listeners do foco
        document.getElementById('rc-btn-voltar-grade')?.addEventListener('click', () => this._fecharFoco());

        document.getElementById('rc-foco-btn-chamar')?.addEventListener('click', async () => {
            await this._chamarProximo(pautaId);
        });

        document.getElementById('rc-foco-btn-add-assistido')?.addEventListener('click', () => {
            this._abrirModalAdicionarAssistido(pautaId, pauta.name);
        });

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
            <div class="bg-white p-5 sm:p-8 rounded-xl shadow-2xl w-full max-w-md border-t-8 border-rose-500 max-h-[95vh] overflow-y-auto" onclick="event.stopPropagation()">
                <h2 class="text-xl sm:text-2xl font-black mb-2 text-slate-800">Prioridade Legal</h2>
                <p class="mb-4 sm:mb-6 text-xs sm:text-sm text-slate-500">Selecione uma ou mais categorias:</p>
                
                <div id="rc-priority-types-grid" class="grid grid-cols-2 gap-3 mb-4 sm:mb-6">
                    <button type="button" data-value="Idoso (60+)" class="rc-p-chip bg-white border border-slate-200 rounded-xl py-3 px-2 text-xs font-bold text-slate-600 hover:border-rose-300 transition focus:outline-none">👴 Idoso (60+)</button>
                    <button type="button" data-value="Idoso (80+)" class="rc-p-chip bg-white border border-slate-200 rounded-xl py-3 px-2 text-xs font-bold text-slate-600 hover:border-rose-300 transition focus:outline-none">🎖️ Idoso (80+)</button>
                    <button type="button" data-value="Deficiência (PCD)" class="rc-p-chip bg-white border border-slate-200 rounded-xl py-3 px-2 text-xs font-bold text-slate-600 hover:border-rose-300 transition focus:outline-none">♿ Deficiência</button>
                    <button type="button" data-value="Autismo (TEA)" class="rc-p-chip bg-white border border-slate-200 rounded-xl py-3 px-2 text-xs font-bold text-slate-600 hover:border-rose-300 transition focus:outline-none">🧩 Autismo</button>
                    <button type="button" data-value="Gestante" class="rc-p-chip bg-white border border-slate-200 rounded-xl py-3 px-2 text-xs font-bold text-slate-600 hover:border-rose-300 transition focus:outline-none">🤰 Gestante</button>
                    <button type="button" data-value="Criança de Colo" class="rc-p-chip bg-white border border-slate-200 rounded-xl py-3 px-2 text-xs font-bold text-slate-600 hover:border-rose-300 transition focus:outline-none">👶 Colo</button>
                    <button type="button" data-value="Obesidade" class="rc-p-chip bg-white border border-slate-200 rounded-xl py-3 px-2 text-xs font-bold text-slate-600 hover:border-rose-300 transition focus:outline-none">⚖️ Obesidade</button>
                    <button type="button" data-value="Urgência Médica" class="rc-p-chip bg-white border border-slate-200 rounded-xl py-3 px-2 text-xs font-bold text-slate-600 hover:border-rose-300 transition focus:outline-none">🚑 Médica</button>
                </div>
        
                <label class="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Outros / Observações:</label>
                <textarea id="rc-priority-reason-input" placeholder="Ex: Prazo vencendo hoje..." class="w-full p-4 border border-slate-200 rounded-xl mb-6 h-20 text-sm outline-none focus:ring-2 focus:ring-rose-500 bg-slate-50"></textarea>
                
                <div class="flex gap-3">
                    <button id="rc-cancel-priority-btn" class="flex-1 bg-white border border-slate-200 text-slate-600 font-bold py-3 rounded-xl hover:bg-slate-50 transition">Cancelar</button>
                    <button id="rc-confirm-priority-btn" class="flex-1 bg-rose-600 text-white font-bold py-3 rounded-xl hover:bg-rose-700 transition shadow-sm">Confirmar</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const style = document.createElement('style');
        style.innerHTML = `
            .rc-p-chip.selected {
                background-color: #fff1f2 !important; 
                border-color: #f43f5e !important; 
                color: #be123c !important; 
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
            <div class="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col">
                <div class="bg-emerald-600 px-6 py-5 flex justify-between items-center shrink-0">
                    <div>
                        <h3 class="text-white font-black text-xl">Novo Atendimento</h3>
                        <p class="text-emerald-100 text-xs mt-0.5 opacity-90">${escapeHTML(pautaNome)}</p>
                    </div>
                    <button id="rc-modal-add-close" class="text-emerald-200 hover:text-white text-3xl font-bold leading-none transition-colors">&times;</button>
                </div>
                
                <form id="rc-form-add-assistido" class="p-6 space-y-5 overflow-y-auto max-h-[80vh] bg-slate-50">
                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Nome Completo <span class="text-rose-500">*</span></label>
                        <input type="text" id="rc-add-nome" required class="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Ex: Maria da Silva">
                    </div>
                    
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">CPF</label>
                            <input type="text" id="rc-add-cpf" class="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="000.000.000-00">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Nº Agendamento</label>
                            <input type="text" id="rc-add-agendamento" class="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-mono" placeholder="#12345">
                        </div>
                    </div>

                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Assunto</label>
                        <input type="text" id="rc-add-assunto" list="rc-lista-assuntos" class="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Ex: Divórcio, Pensão...">
                    </div>

                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Prioridade</label>
                        <select id="rc-add-prioridade" class="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                            <option value="">Nenhuma</option>
                            <option value="URGENTE">🚨 Urgente / Legal</option>
                            <option value="Máxima">🔴 Máxima</option>
                            <option value="Média">🟡 Média</option>
                        </select>
                    </div>

                    <div class="pt-2">
                        <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Ação Inicial</label>
                        <div class="grid grid-cols-2 gap-3">
                            <label class="cursor-pointer bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-2 hover:border-slate-300 transition">
                                <input type="radio" name="rc_add_status" value="pauta" checked class="w-4 h-4 text-emerald-600 focus:ring-emerald-500">
                                <div class="text-sm font-bold text-slate-700">Apenas Agendar</div>
                            </label>
                            <label class="cursor-pointer bg-white border border-amber-200 rounded-xl p-3 flex items-center gap-2 hover:border-amber-400 transition ring-1 ring-amber-100">
                                <input type="radio" name="rc_add_status" value="aguardando" class="w-4 h-4 text-amber-500 focus:ring-amber-500">
                                <div class="text-sm font-bold text-amber-700">Fazer Check-in</div>
                            </label>
                        </div>
                    </div>

                    <div class="pt-4 flex gap-3">
                        <button type="button" id="rc-btn-add-cancelar" class="w-1/3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold py-3 rounded-xl transition text-sm">Cancelar</button>
                        <button type="submit" id="rc-btn-add-salvar" class="w-2/3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl transition text-sm shadow-sm">Salvar Assistido</button>
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
                    const matchCpf  = (a.cpf || '').includes(input.value.trim());
                    if (matchNome || matchNum || matchCpf) {
                        encontrados.push({ pauta, assistido: a });
                    }
                }
            }

            if (encontrados.length === 0) {
                resultados.innerHTML = `<p class="text-sm text-slate-500 font-medium py-4 px-2">Nenhum resultado encontrado para "${escapeHTML(input.value)}".</p>`;
                return;
            }

            resultados.innerHTML = encontrados.map(({ pauta, assistido: a }) => {
                const sl            = statusLabel(a.status);
                const podeCheckin = a.status === 'pauta';
                return `
                    <div class="bg-white border border-slate-200 hover:border-indigo-300 rounded-xl px-5 py-3 flex items-center gap-4 transition-colors">
                        <div class="min-w-0 flex-1">
                            <div class="flex items-center gap-2 mb-1">
                                <p class="font-black text-slate-800 text-base truncate">${escapeHTML(a.name)}</p>
                                ${a.numAgendamento ? `<span class="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded text-[10px] font-mono shrink-0 border border-slate-200">#${a.numAgendamento}</span>` : ''}
                            </div>
                            <p class="text-xs text-slate-500 truncate flex items-center gap-1.5">
                                <span class="font-bold text-indigo-600">${escapeHTML(pauta.name)}</span>
                                <span class="text-slate-300">•</span>
                                ${a.scheduledTime ? `⏰ ${a.scheduledTime}` : ''}
                                ${escapeHTML(a.subject ? ` • ${a.subject}` : '')}
                            </p>
                        </div>
                        <div class="flex flex-col items-end gap-2 shrink-0">
                            <span class="text-[10px] font-bold px-2.5 py-1 rounded-md border ${sl.cor}">${sl.txt}</span>
                            ${podeCheckin ? `
                                <button class="rc-busca-checkin bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold px-4 py-1.5 rounded-lg transition shadow-sm"
                                    data-pauta="${pauta.id}" data-id="${a.id}">
                                    Check-in
                                </button>
                            ` : ''}
                        </div>
                    </div>
                `;
            }).join('');

            resultados.querySelectorAll('.rc-busca-checkin').forEach(btn => {
                btn.addEventListener('click', () => {
                    this._abrirModalCheckinComHorario(btn.dataset.pauta, btn.dataset.id);
                    input.value        = '';
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
            <div class="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden p-8 space-y-6">
                <div class="text-center">
                    <div class="w-16 h-16 bg-amber-100 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">⏱️</div>
                    <h3 class="font-black text-slate-800 text-lg leading-tight">Confirmar Check-in</h3>
                    <p class="text-slate-500 text-sm mt-1 font-medium">${escapeHTML(assistido.name)}</p>
                </div>
                
                <div class="bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 text-center">Horário de Chegada</label>
                    <input type="time" id="rc-input-hora-chegada" value="${horaAtual}" class="w-full p-3 bg-white border border-slate-200 rounded-xl font-black text-xl text-center text-slate-700 outline-none focus:ring-2 focus:ring-amber-500 transition-all">
                </div>
                
                <div class="flex gap-3 pt-2">
                    <button type="button" id="rc-checkin-cancel" class="flex-1 bg-white border border-slate-200 text-slate-600 font-bold py-3 rounded-xl text-sm hover:bg-slate-50 transition">Cancelar</button>
                    <button type="button" id="rc-checkin-confirm" class="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 rounded-xl text-sm shadow-sm transition">Confirmar</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const closeModal = () => modal.remove();
        document.getElementById('rc-checkin-cancel').onclick = closeModal;
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

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
        
        let colaboradoresOptions = '<option value="">Chamada Livre (Sem mesa específica)</option>';
        
        const colabOrdenados = [...colaboradores].sort((a,b) => {
            const aLivre = a.status === 'disponivel' || !a.status;
            const bLivre = b.status === 'disponivel' || !b.status;
            if (aLivre === bLivre) return (a.nome || '').localeCompare(b.nome || '');
            return aLivre ? -1 : 1;
        });

        colabOrdenados.forEach(c => {
             const livre = c.status === 'disponivel' || !c.status;
             const statusTxt = livre ? '(🟢 Livre)' : '(🔴 Ocupado)';
             colaboradoresOptions += `<option value="${c.id}" data-nome="${escapeHTML(c.nome)}">${escapeHTML(c.nome)} - ${escapeHTML(c.cargo || 'Membro')} ${statusTxt}</option>`;
        });

        modal.innerHTML = `
            <div class="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col">
                <div class="bg-indigo-600 px-6 py-5 flex justify-between items-center shrink-0">
                    <div>
                        <h3 class="text-white font-black text-xl flex items-center gap-2">📣 Direcionar Chamada</h3>
                        <p class="text-indigo-100 text-xs mt-0.5 opacity-90">${escapeHTML(assistido.name)}</p>
                    </div>
                    <button id="rc-modal-colaborador-close" class="text-indigo-200 hover:text-white text-3xl font-bold leading-none transition-colors">&times;</button>
                </div>
                
                <div class="p-6 space-y-6 bg-slate-50">
                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Para qual mesa / colaborador?</label>
                        <select id="rc-select-colaborador-destino" class="w-full p-4 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm">
                            ${colaboradoresOptions}
                        </select>
                        <p class="text-[10px] text-slate-400 mt-2 font-medium">Deixe em "Chamada Livre" para apenas anunciar na TV sem direcionar a uma mesa específica.</p>
                    </div>

                    <div class="flex gap-3">
                        <button type="button" id="rc-btn-colaborador-cancelar" class="w-1/3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold py-3 rounded-xl transition text-sm">Cancelar</button>
                        <button type="button" id="rc-btn-colaborador-confirmar" class="w-2/3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition text-sm shadow-sm">Confirmar Chamada</button>
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
            <div class="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
                <div class="bg-slate-800 px-6 py-5 flex justify-between items-center shrink-0">
                    <div>
                        <h3 class="text-white font-black text-xl flex items-center gap-2">📺 Configurar TV / Painel</h3>
                        <p class="text-slate-400 text-xs mt-0.5 tracking-wider uppercase">${escapeHTML(recepcao.nome || 'Recepção Central')}</p>
                    </div>
                    <button id="rc-modal-tv-close" class="text-slate-400 hover:text-white text-3xl font-bold leading-none transition-colors">&times;</button>
                </div>
                
                <div class="p-6 overflow-y-auto flex-1 space-y-6 bg-slate-50">
                    
                    <div>
                        <label class="block text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Modo de Visualização</label>
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <label class="tv-modo-card cursor-pointer bg-white border border-slate-200 rounded-xl p-4 text-center hover:border-indigo-300 transition-all flex flex-col items-center gap-2 ${modoAtual === 'fila' ? 'border-indigo-500 bg-indigo-50/50 ring-1 ring-indigo-500' : ''}">
                                <input type="radio" name="tv_modo" value="fila" class="hidden" ${modoAtual === 'fila' ? 'checked' : ''}>
                                <span class="text-3xl">📋</span>
                                <div>
                                    <p class="font-bold text-slate-800">Lista (Fila)</p>
                                    <p class="text-[10px] text-slate-500 mt-1">Cards e acompanhamento</p>
                                </div>
                            </label>
                            <label class="tv-modo-card cursor-pointer bg-white border border-slate-200 rounded-xl p-4 text-center hover:border-indigo-300 transition-all flex flex-col items-center gap-2 ${modoAtual === 'tv' ? 'border-indigo-500 bg-indigo-50/50 ring-1 ring-indigo-500' : ''}">
                                <input type="radio" name="tv_modo" value="tv" class="hidden" ${modoAtual === 'tv' ? 'checked' : ''}>
                                <span class="text-3xl">🟩</span>
                                <div>
                                    <p class="font-bold text-slate-800">TV Padrão</p>
                                    <p class="text-[10px] text-slate-500 mt-1">Painel com histórico</p>
                                </div>
                            </label>
                            <label class="tv-modo-card cursor-pointer bg-white border border-slate-200 rounded-xl p-4 text-center hover:border-indigo-300 transition-all flex flex-col items-center gap-2 ${modoAtual === 'video' ? 'border-indigo-500 bg-indigo-50/50 ring-1 ring-indigo-500' : ''}">
                                <input type="radio" name="tv_modo" value="video" class="hidden" ${modoAtual === 'video' ? 'checked' : ''}>
                                <span class="text-3xl">🎬</span>
                                <div>
                                    <p class="font-bold text-slate-800">TV + Vídeo</p>
                                    <p class="text-[10px] text-slate-500 mt-1">Institucional e chamados</p>
                                </div>
                            </label>
                        </div>
                    </div>

                    <div>
                        <label class="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Link do YouTube (Para Modo Vídeo)</label>
                        <input type="text" id="tv_video_url" value="${escapeHTML(videoAtual)}"
                            class="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-slate-700 font-mono shadow-sm"
                            placeholder="https://www.youtube.com/watch?v=...">
                    </div>

                    <div>
                        <label class="block text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Aviso Sonoro (Campainha)</label>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <label class="tv-som-card cursor-pointer bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3 hover:border-indigo-300 transition-all ${somAtual === true ? 'border-indigo-500 bg-indigo-50/50' : ''}">
                                <input type="radio" name="tv_som" value="1" class="w-4 h-4 text-indigo-600 focus:ring-indigo-500" ${somAtual === true ? 'checked' : ''}>
                                <div>
                                    <p class="font-bold text-slate-800 text-sm flex items-center gap-1.5">🔔 Ativado</p>
                                </div>
                            </label>
                            <label class="tv-som-card cursor-pointer bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3 hover:border-indigo-300 transition-all ${somAtual === false ? 'border-indigo-500 bg-indigo-50/50' : ''}">
                                <input type="radio" name="tv_som" value="0" class="w-4 h-4 text-indigo-600 focus:ring-indigo-500" ${somAtual === false ? 'checked' : ''}>
                                <div>
                                    <p class="font-bold text-slate-800 text-sm flex items-center gap-1.5">🔇 Silencioso</p>
                                </div>
                            </label>
                        </div>
                    </div>

                    <div class="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 mt-2">
                        <label class="block text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2">Link Gerado (Copie para a Smart TV)</label>
                        <textarea id="tv_preview_link" readonly class="w-full bg-transparent border-0 text-xs text-indigo-700 font-mono resize-none focus:ring-0 p-0 h-10 outline-none"></textarea>
                    </div>

                </div>

                <div class="bg-white border-t border-slate-200 px-6 py-5 flex flex-col sm:flex-row gap-3 shrink-0">
                    <button id="rc-btn-tv-cancelar" class="flex-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold py-3 rounded-xl transition text-sm">
                        Cancelar
                    </button>
                    <button id="rc-btn-tv-salvar" class="flex-1 bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 rounded-xl transition text-sm shadow flex items-center justify-center gap-2">
                        📋 Copiar Link
                    </button>
                    <button id="rc-btn-tv-abrir" class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition text-sm shadow flex items-center justify-center gap-2">
                        📺 Abrir Painel
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
                    card.classList.remove('border-indigo-500', 'bg-indigo-50/50', 'ring-1', 'ring-indigo-500');
                });
                radio.closest('.tv-modo-card').classList.add('border-indigo-500', 'bg-indigo-50/50', 'ring-1', 'ring-indigo-500');
                updatePreview();
            });
        });

        modal.querySelectorAll('input[name="tv_som"]').forEach(radio => {
            radio.addEventListener('change', () => {
                modal.querySelectorAll('.tv-som-card').forEach(card => {
                    card.classList.remove('border-indigo-500', 'bg-indigo-50/50');
                });
                radio.closest('.tv-som-card').classList.add('border-indigo-500', 'bg-indigo-50/50');
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

    // ── MODAL CHECK-IN (RÁPIDO) ────────────────────────────────────────────────

    _abrirModalCheckin(pautaId) {
        const pauta = estado.pautasHoje.find(p => p.id === pautaId);
        if (!pauta) return;

        const assistidos = estado.assistidosPorPauta[pautaId] || [];
        const naPauta    = assistidos.filter(a => a.status === 'pauta');

        const existing = document.getElementById('rc-modal-checkin');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id        = 'rc-modal-checkin';
        modal.className = 'fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[200] p-4 backdrop-blur-sm animate-fade-in';
        modal.innerHTML = `
            <div class="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                <div class="bg-amber-500 px-6 py-5 flex justify-between items-center shrink-0">
                    <div>
                        <h3 class="text-white font-black text-lg flex items-center gap-2">✅ Check-in Rápido</h3>
                        <p class="text-amber-100 text-xs mt-0.5 opacity-90">${escapeHTML(pauta.name)}</p>
                    </div>
                    <button id="rc-modal-checkin-close" class="text-amber-200 hover:text-white text-3xl font-bold leading-none transition-colors">&times;</button>
                </div>
                
                <div class="p-6 pb-2 shrink-0 bg-slate-50 border-b border-slate-100">
                    <div class="relative">
                        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
                        <input type="search" id="rc-modal-busca" placeholder="Buscar assistido nesta pauta..."
                            class="w-full bg-white border border-slate-300 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm transition-all">
                    </div>
                </div>

                <div id="rc-modal-lista" class="p-4 space-y-2 overflow-y-auto flex-1 bg-slate-50">
                    ${naPauta.length === 0
                        ? `<div class="text-center py-10 opacity-60">
                               <span class="text-4xl block mb-2">🎉</span>
                               <p class="text-sm font-bold text-slate-600">Todos os agendados já chegaram!</p>
                           </div>`
                        : naPauta.map(a => `
                            <div class="flex items-center justify-between bg-white border border-slate-200 hover:border-amber-300 rounded-xl p-3 transition-colors shadow-sm gap-3">
                                <div class="min-w-0 flex-1">
                                    <p class="font-bold text-slate-800 text-sm truncate">${escapeHTML(a.name)}</p>
                                    <p class="text-[10px] text-slate-500 truncate mt-0.5">
                                        ${a.numAgendamento ? `<span class="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono mr-1">#${a.numAgendamento}</span>` : ''}
                                        ${a.scheduledTime ? `<span class="font-bold text-amber-600">⏰ ${a.scheduledTime}</span> · ` : ''} 
                                        ${escapeHTML(a.subject || 'Sem assunto')}
                                    </p>
                                </div>
                                <button class="rc-modal-checkin-btn shrink-0 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs px-4 py-2 rounded-lg transition shadow-sm"
                                    data-id="${a.id}" data-nome="${escapeHTML(a.name)}">
                                    Check-in
                                </button>
                            </div>
                        `).join('')
                    }
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('rc-modal-checkin-close').onclick = () => modal.remove();
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

        document.getElementById('rc-modal-busca').addEventListener('input', (e) => {
            const t = normalizeText(e.target.value);
            modal.querySelectorAll('.rc-modal-checkin-btn').forEach(btn => {
                const linha = btn.closest('.flex');
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
