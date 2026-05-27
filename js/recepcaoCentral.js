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
    pautasHoje: [],              // [{id, name, type, ...pautaData}]
    assistidosPorPauta: {},      // { [pautaId]: [assistidos] }
    colaboradoresPorPauta: {},   // { [pautaId]: [colaboradores] }
    unsubscribers: [],           // listeners ativos
    pautaFocadaId: null,         // pauta selecionada no modo de navegação
    modoVisao: 'grade',          // 'grade' | 'foco'
    termoBusca: '',
    recepcaoAtual: null,
    unidadeAtual: null,
    recepcoesDisponiveis: [],
};

// ─── HELPERS ───────────────────────────────────────────────────────────────────

function statusLabel(status) {
    const map = {
        pauta:                  { txt: 'Na Pauta',     cor: 'bg-slate-100 text-slate-600' },
        aguardando:             { txt: 'Aguardando',   cor: 'bg-amber-100 text-amber-700' },
        emAtendimento:          { txt: 'Em Atendimento', cor: 'bg-blue-100 text-blue-700' },
        aguardandoDistribuicao: { txt: 'Distribuição', cor: 'bg-cyan-100 text-cyan-700' },
        atendido:               { txt: 'Atendido',     cor: 'bg-green-100 text-green-700' },
        faltoso:                { txt: 'Faltoso',      cor: 'bg-red-100 text-red-700' },
    };
    return map[status] || { txt: status, cor: 'bg-gray-100 text-gray-600' };
}

function contadores(assistidos) {
    return {
        total:        assistidos.length,
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

// Helper para extrair e exibir as verificações de documentos do "Ver Detalhes"
function renderVerificacoesBadge(a) {
    const docs = a.verifications || a.documentos || a.verificacoes || a.customFields?.verifications;
    if (!docs) return '';
    
    let htmlLista = '';
    
    // Se for um array de documentos (Ex: ["RG", "CPF"])
    if (Array.isArray(docs)) {
        const itens = docs.map(d => typeof d === 'string' ? d : (d.nome || d.name || d.label || 'Doc'));
        if(itens.length === 0) return '';
        htmlLista = itens.map(i => `<span class="inline-block bg-slate-100 text-slate-600 border border-slate-200 text-[9px] px-1.5 py-0.5 rounded mr-1 mb-1 shadow-sm">📄 ${escapeHTML(i)}</span>`).join('');
    } 
    // Se for um objeto com chaves e booleanos (Ex: { rg: true, cpf: false })
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

export const RecepçãoCentralService = {

    // ── INICIALIZAÇÃO ──────────────────────────────────────────────────────────

    async init(app) {
        this._app = app;

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
                
                <!-- LOGO DO SIGEP -->
                <div class="flex justify-center mb-4">
                    <div class="bg-[#0d1117] border border-slate-700 rounded-2xl p-3 shadow-md">
                        <img src="https://raw.githubusercontent.com/alexdovale/ac-o-paula-controle/main/imagem.png" alt="Logo SIGEP" class="h-10 w-auto object-contain">
                    </div>
                </div>

                ${RecepcaoConfigService.renderSelectorRecepcoes(recepcoes)}
                
                <!-- GUIA DE TIPOS DE RECEPÇÃO -->
                <div class="max-w-4xl mx-auto mt-12 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                    <h4 class="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-5">📖 Guia de Tipos de Recepção</h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div class="flex items-start gap-3">
                            <span class="bg-slate-800 text-white text-lg px-2.5 py-1 rounded-lg shrink-0">🏛️</span>
                            <div>
                                <p class="font-bold text-slate-800 text-sm">Central</p>
                                <p class="text-xs text-slate-500 mt-0.5 leading-snug">Painel principal. Permite visualizar e gerenciar pessoas de <b>todas</b> as filas e áreas da unidade.</p>
                            </div>
                        </div>
                        <div class="flex items-start gap-3">
                            <span class="bg-amber-50 text-amber-600 text-lg px-2.5 py-1 rounded-lg border border-amber-200 shrink-0">⚖️</span>
                            <div>
                                <p class="font-bold text-slate-800 text-sm">Especializada</p>
                                <p class="text-xs text-slate-500 mt-0.5 leading-snug">Focada em um assunto específico (ex: Família). Exibe apenas a fila e os casos da sua própria área.</p>
                            </div>
                        </div>
                        <div class="flex items-start gap-3">
                            <span class="bg-blue-50 text-blue-600 text-lg px-2.5 py-1 rounded-lg border border-blue-200 shrink-0">📋</span>
                            <div>
                                <p class="font-bold text-slate-800 text-sm">Mista</p>
                                <p class="text-xs text-slate-500 mt-0.5 leading-snug">Ponto de atendimento que agrupa <b>duas ou mais</b> áreas diferentes no mesmo local e no mesmo painel.</p>
                            </div>
                        </div>
                        <div class="flex items-start gap-3">
                            <span class="bg-emerald-50 text-emerald-600 text-lg px-2.5 py-1 rounded-lg border border-emerald-200 shrink-0">🗂️</span>
                            <div>
                                <p class="font-bold text-slate-800 text-sm">Generalista</p>
                                <p class="text-xs text-slate-500 mt-0.5 leading-snug">Focada em triagem inicial. Serve para recepcionar casos novos, dar orientações e fazer encaminhamentos.</p>
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
                const recepcaoId      = btn.dataset.recepcaoId;
                const recepcaoEncontrada = estado.recepcoesDisponiveis.find(r => r.id === recepcaoId);

                if (recepcaoEncontrada) {
                    this._recepcaoAtual = recepcaoEncontrada;
                    this._unidadeAtual  = { id: recepcaoEncontrada.unidadeId, nome: recepcaoEncontrada.unidadeNome };
                    await this._carregarPautasPorRecepcao();
                }
            });
        });

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

        if (this._recepcaoAtual && this._recepcaoAtual.tipo !== 'central' && this._recepcaoAtual.verTudo !== true) {
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
            </div>
        `;
    },

    async _iniciarListeners() {
        const app = this._app;

        this._cancelarListeners();

        for (const pauta of estado.pautasHoje) {
            // Listener de assistidos
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

            // Listener de colaboradores
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
            <div class="recepcao-central-wrap max-w-7xl mx-auto px-2 sm:px-4 py-4">

                <!-- CONTEXTO DA RECEPÇÃO ATUAL -->
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

                <!-- CABEÇALHO PRINCIPAL -->
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
                    <div>
                        <h2 class="text-2xl font-black text-slate-800 tracking-tight">🏛️ Painel de Atendimento</h2>
                        <p class="text-sm text-slate-500 mt-0.5">Pautas ativas — <span id="rc-data-hoje">${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</span></p>
                    </div>
                    <div class="flex gap-2 w-full sm:w-auto flex-wrap">
                        
                        <!-- BOTÕES ADICIONADOS PARA A TV UNIFICADA -->
                        <button id="rc-btn-copiar-link" class="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-bold px-4 py-2 rounded-lg transition text-sm shadow-sm" title="Copiar link para enviar para a TV">
                            🔗 Copiar Link da TV
                        </button>
                        <button id="rc-btn-painel-geral" class="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-indigo-700 hover:bg-indigo-800 text-white font-bold px-4 py-2 rounded-lg transition text-sm shadow" title="Abrir painel unificado nesta máquina">
                            📺 Abrir Painel Aqui
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

                <!-- BUSCA GLOBAL -->
                <div id="rc-busca-global-wrap" class="hidden mb-4 animate-fade-in">
                    <div class="relative">
                        <input type="search" id="rc-input-busca" placeholder="Digite nome ou nº de agendamento para buscar em todas as pautas..."
                            class="w-full bg-white border border-slate-300 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 shadow-sm">
                        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">🔍</span>
                    </div>
                    <div id="rc-resultados-busca" class="mt-3 space-y-2 max-h-96 overflow-y-auto"></div>
                </div>

                <!-- SUMÁRIO GERAL -->
                <div id="rc-sumario" class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6"></div>

                <!-- GRADE DE PAUTAS -->
                <div id="rc-grade-pautas" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4"></div>

                <!-- PAINEL DE FOCO -->
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

        // Lista de pessoas aguardando (máx 5)
        const aguardando = PautaService.sortAguardando(
            assistidos.filter(a => a.status === 'aguardando'),
            pauta.ordemAtendimento
        );

        const listaNomes = aguardando.length === 0
            ? `<p class="text-[11px] text-slate-400 italic px-1">Nenhum na fila agora.</p>`
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

                <!-- Cabeçalho do card -->
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

                <!-- Barra de progresso -->
                <div class="h-1.5 bg-slate-100">
                    <div class="h-full bg-green-500 transition-all duration-500" style="width:${porcentagem}%"></div>
                </div>

                <!-- Contadores -->
                <div class="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
                    <div class="text-center py-3">
                        <div class="text-xl font-black text-amber-600">${c.aguardando}</div>
                        <div class="text-[10px] text-slate-400 uppercase font-bold">Aguardando</div>
                    </div>
                    <div class="text-center py-3">
                        <div class="text-xl font-black text-blue-600">${c.emAtendimento}</div>
                        <div class="text-[10px] text-slate-400 uppercase font-bold">Atendendo</div>
                    </div>
                    <div class="text-center py-3">
                        <div class="text-xl font-black text-green-600">${c.atendidos}</div>
                        <div class="text-[10px] text-slate-400 uppercase font-bold">Atendidos</div>
                    </div>
                </div>

                <!-- Fila de espera com nomes -->
                <div class="px-5 pt-3 pb-2 border-b border-slate-100">
                    <p class="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">📋 Fila de Espera</p>
                    <div class="space-y-0">
                        ${listaNomes}
                    </div>
                </div>

                <!-- Equipe -->
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

                <!-- Ações rápidas -->
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

        let totalAg = 0, totalAt = 0, totalEm = 0, totalDist = 0;
        for (const assistidos of Object.values(estado.assistidosPorPauta)) {
            const c = contadores(assistidos);
            totalAg   += c.aguardando;
            totalAt   += c.atendidos;
            totalEm   += c.emAtendimento;
            totalDist += c.distribuicao;
        }

        el.innerHTML = `
            <div class="bg-white border border-slate-200 rounded-xl p-4 text-center shadow-sm">
                <div class="text-2xl font-black text-amber-600">${totalAg}</div>
                <div class="text-xs text-slate-500 font-bold uppercase mt-1">Aguardando</div>
            </div>
            <div class="bg-white border border-slate-200 rounded-xl p-4 text-center shadow-sm">
                <div class="text-2xl font-black text-blue-600">${totalEm}</div>
                <div class="text-xs text-slate-500 font-bold uppercase mt-1">Em Atendimento</div>
            </div>
            <div class="bg-white border border-slate-200 rounded-xl p-4 text-center shadow-sm">
                <div class="text-2xl font-black text-green-600">${totalAt}</div>
                <div class="text-xs text-slate-500 font-bold uppercase mt-1">Atendidos</div>
            </div>
            <div class="bg-white border border-slate-200 rounded-xl p-4 text-center shadow-sm">
                <div class="text-2xl font-black text-cyan-600">${totalDist}</div>
                <div class="text-xs text-slate-500 font-bold uppercase mt-1">Distribuição</div>
            </div>
        `;
    },

    // ── PAINEL DE FOCO ─────────────────────────────────────────────────────────

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
        const { livres, ocupados } = colaboradoresStatus(colaboradores);

        const aguardando = PautaService.sortAguardando(
            assistidos.filter(a => a.status === 'aguardando'),
            pauta.ordemAtendimento
        );

        foco.innerHTML = `
            <div class="bg-white border border-slate-200 rounded-2xl shadow overflow-hidden">

                <!-- Header do foco -->
                <div class="bg-slate-800 px-6 py-5 flex justify-between items-center">
                    <div>
                        <button id="rc-btn-voltar-grade" class="text-slate-400 hover:text-white text-xs font-bold mb-2 block transition">← Voltar à grade</button>
                        <h3 class="text-white font-black text-xl">${escapeHTML(pauta.name)}</h3>
                        <p class="text-slate-400 text-xs mt-0.5">${c.atendidos} atendidos · ${c.total} total</p>
                    </div>
                    <div class="flex gap-2">
                        <button id="rc-foco-btn-acomp" class="bg-slate-600 hover:bg-slate-500 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition" title="Acompanhamento público desta pauta">
                            🔗 Externo
                        </button>
                        <button id="rc-foco-btn-chamar" class="bg-green-600 hover:bg-green-700 text-white font-black px-5 py-2.5 rounded-xl text-sm transition shadow">
                            📣 Chamar Próximo
                        </button>
                    </div>
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-3 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">

                    <!-- FILA DE ESPERA -->
                    <div class="p-5">
                        <h4 class="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">⏳ Fila de Espera (${aguardando.length})</h4>
                        <div class="space-y-2 max-h-96 overflow-y-auto pr-1">
                            ${aguardando.length === 0
                                ? `<p class="text-xs text-slate-400 text-center py-6">Fila vazia.</p>`
                                : aguardando.map((a, i) => `
                                    <div class="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                                        <span class="w-6 h-6 mt-1 rounded-full bg-amber-500 text-white text-[10px] font-black flex items-center justify-center shrink-0">${i + 1}</span>
                                        <div class="min-w-0 flex-1">
                                            <p class="font-bold text-slate-800 text-sm truncate">${escapeHTML(a.name)} ${a.numAgendamento ? `<span class="text-xs text-slate-400 font-mono ml-1">#${a.numAgendamento}</span>` : ''}</p>
                                            <p class="text-[10px] text-slate-500 truncate mt-0.5">
                                                ${a.scheduledTime ? `<span class="text-amber-600 font-bold">⏰ ${a.scheduledTime}</span> · ` : ''}
                                                📝 ${escapeHTML(a.subject || 'Sem assunto')}
                                            </p>
                                            ${renderVerificacoesBadge(a)}
                                        </div>
                                        <button class="rc-foco-checkin shrink-0 text-[10px] bg-amber-500 hover:bg-amber-600 text-white font-bold px-2 py-1.5 mt-1 rounded-lg transition"
                                            data-id="${a.id}" data-pauta="${pautaId}">Check-in</button>
                                    </div>
                                `).join('')
                            }
                        </div>
                    </div>

                    <!-- EM ATENDIMENTO -->
                    <div class="p-5">
                        <h4 class="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">👩‍💻 Em Atendimento (${c.emAtendimento})</h4>
                        <div class="space-y-2 max-h-96 overflow-y-auto pr-1">
                            ${assistidos.filter(a => a.status === 'emAtendimento').length === 0
                                ? `<p class="text-xs text-slate-400 text-center py-6">Ninguém em atendimento.</p>`
                                : assistidos.filter(a => a.status === 'emAtendimento').map(a => `
                                    <div class="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 flex items-start gap-3">
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
                                            ${renderVerificacoesBadge(a)}
                                        </div>
                                    </div>
                                `).join('')
                            }
                        </div>
                    </div>

                    <!-- EQUIPE -->
                    <div class="p-5">
                        <h4 class="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">👥 Equipe do Dia</h4>
                        <div class="space-y-2 max-h-96 overflow-y-auto pr-1">
                            ${colaboradores.length === 0
                                ? `<p class="text-xs text-slate-400 text-center py-6">Nenhum colaborador.</p>`
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
        `;

        document.getElementById('rc-btn-voltar-grade')?.addEventListener('click', () => this._fecharFoco());

        document.getElementById('rc-foco-btn-chamar')?.addEventListener('click', async () => {
            await this._chamarProximo(pautaId);
        });

        document.getElementById('rc-foco-btn-acomp')?.addEventListener('click', () => {
            window.open(`acompanhamento.html?id=${pautaId}`, '_blank');
        });

        foco.querySelectorAll('.rc-foco-checkin').forEach(btn => {
            btn.addEventListener('click', () => {
                this._marcarChegada(pautaId, btn.dataset.id);
            });
        });
    },

    // ── BUSCA GLOBAL ───────────────────────────────────────────────────────────

    _setupBuscaGlobal() {
        const input = document.getElementById('rc-input-busca');
        if (!input) return;

        input.addEventListener('input', () => {
            const termo     = normalizeText(input.value.trim());
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
                const sl          = statusLabel(a.status);
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
                    this._marcarChegada(btn.dataset.pauta, btn.dataset.id);
                    input.value        = '';
                    resultados.innerHTML = '';
                    document.getElementById('rc-busca-global-wrap').classList.add('hidden');
                });
            });
        });
    },

    // ── AÇÕES ──────────────────────────────────────────────────────────────────

    async _marcarChegada(pautaId, assistidoId) {
        const app = this._app;
        await PautaService.updateStatus(
            app.db,
            pautaId,
            assistidoId,
            {
                status:       'aguardando',
                arrivalTime:  new Date().toISOString(),
                checkInOrder: Date.now(),
            },
            app.currentUserName
        );
        showNotification("Chegada registrada!", "success");
        playSound('notification');
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
        this._registrarUltimoChamado(pautaId, proximo, pauta.name);

        await PautaService.updateStatus(
            app.db,
            pautaId,
            proximo.id,
            { status: 'emAtendimento', inAttendanceTime: new Date().toISOString() },
            app.currentUserName
        );

        showNotification(`📣 Chamado: ${proximo.name}`, "success");
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

        // Salva no localStorage por pauta (para acompanhamento.html individual na mesma aba)
        const chave = `sigep_chamados_${pautaId}`;
        let historico = [];
        try { historico = JSON.parse(localStorage.getItem(chave)) || []; } catch { historico = []; }
        historico.unshift(chamado);
        if (historico.length > 5) historico = historico.slice(0, 5);
        localStorage.setItem(chave, JSON.stringify(historico));

        // Salva global (para acompanhamento-recepcao.html na mesma máquina)
        localStorage.setItem('sigep_ultimo_chamado_global', JSON.stringify(chamado));

        // Salva diretamente no Firebase para o Painel Unificado (TV)
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
        // Fechar
        document.getElementById('rc-btn-fechar')?.addEventListener('click', () => this.fechar());

        // Atualizar
        document.getElementById('rc-btn-atualizar')?.addEventListener('click', async () => {
            this._cancelarListeners();
            await this._carregarPautasPorRecepcao();
            showNotification("Dados atualizados!", "info");
        });

        // Busca global
        document.getElementById('rc-btn-busca-global')?.addEventListener('click', () => {
            const wrap = document.getElementById('rc-busca-global-wrap');
            wrap.classList.toggle('hidden');
            if (!wrap.classList.contains('hidden')) {
                document.getElementById('rc-input-busca')?.focus();
                this._setupBuscaGlobal();
            }
        });

        // =======================================================================
        // NOVA LÓGICA DO PAINEL GERAL (UNIFICADO)
        // =======================================================================

        // 1. Abrir Painel Geral nesta máquina
        document.getElementById('rc-btn-painel-geral')?.addEventListener('click', () => {
            const ids  = estado.pautasHoje.map(p => p.id).join(',');
            const nome = encodeURIComponent(
                this._recepcaoAtual?.nome ||
                this._unidadeAtual?.nome ||
                'Recepção'
            );

            if (!ids) {
                showNotification("Nenhuma pauta ativa para exibir.", "info");
                return;
            }

            window.open(`acompanhamento-recepcao.html?pautas=${ids}&nome=${nome}`, '_blank');
        });

        // 2. Copiar Link para a TV
        document.getElementById('rc-btn-copiar-link')?.addEventListener('click', () => {
            const ids  = estado.pautasHoje.map(p => p.id).join(',');
            const nome = encodeURIComponent(
                this._recepcaoAtual?.nome ||
                this._unidadeAtual?.nome ||
                'Recepção'
            );

            if (!ids) {
                showNotification("Nenhuma pauta ativa para gerar o link.", "info");
                return;
            }

            // Pega a URL do sistema atual para montar o link absoluto
            let baseUrl = window.location.href;
            if (baseUrl.includes('?')) baseUrl = baseUrl.split('?')[0];
            if (baseUrl.endsWith('index.html')) baseUrl = baseUrl.replace('index.html', '');
            if (!baseUrl.endsWith('/')) baseUrl += '/';

            const linkCompleto = `${baseUrl}acompanhamento-recepcao.html?pautas=${ids}&nome=${nome}`;

            navigator.clipboard.writeText(linkCompleto).then(() => {
                showNotification("Link do Painel Unificado copiado!", "success");
            }).catch(err => {
                console.error('Erro ao copiar', err);
                showNotification("Erro ao copiar o link.", "error");
            });
        });
        // =======================================================================

        // Cliques na grade de cards
        document.getElementById('rc-grade-pautas')?.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-pauta-id]');
            if (!btn) return;
            const pautaId = btn.dataset.pautaId;

            if (btn.classList.contains('rc-btn-checkin')) {
                this._abrirModalCheckin(pautaId);
            } else if (btn.classList.contains('rc-btn-chamar')) {
                this._chamarProximo(pautaId);
            } else if (btn.classList.contains('rc-btn-acomp')) {
                window.open(`acompanhamento.html?id=${pautaId}`, '_blank');
            } else if (btn.classList.contains('rc-btn-abrir')) {
                this._abrirFoco(pautaId);
            }
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
                btn.disabled    = true;
                btn.textContent = '...';
                await this._marcarChegada(pautaId, btn.dataset.id);
                btn.closest('div.flex').remove();
            });
        });
    },

    // ── FECHAR ─────────────────────────────────────────────────────────────────

    fechar() {
        this._cancelarListeners();
        const container = document.getElementById('recepcao-central-container');
        if (container) container.innerHTML = '';

        const app = this._app;
        if (typeof app.showPautaSelectionScreen === 'function') {
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

export default RecepçãoCentralService;
