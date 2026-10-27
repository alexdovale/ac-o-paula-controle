import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    getFirestore, doc, getDoc, updateDoc, collection,
    getDocs, arrayUnion, onSnapshot, query, where
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { firebaseConfig } from './config.js';
import { documentsData } from './detalhes.js';
import { EmailService } from './emailService.js';
import { showNotification, playSound, escapeHTML } from './utils.js';

import { ico } from './icons.js';

// ─── HELPERS DE STATUS (CORES SUAVES) ────────────────────────────────────────

const statusMap = {
    pauta:                  { cor: 'bg-slate-100 text-slate-600 border-slate-200',    txt: 'Na Pauta' },
    aguardando:             { cor: 'bg-amber-50 text-amber-700 border-amber-200',     txt: 'Aguardando' },
    emAtendimento:          { cor: 'bg-blue-50 text-blue-700 border-blue-200',        txt: 'Em Atendimento' },
    aguardandoDistribuicao: { cor: 'bg-cyan-50 text-cyan-700 border-cyan-200',        txt: 'Com Defensor' },
    aguardandoCorrecao:     { cor: 'bg-orange-50 text-orange-700 border-orange-200',  txt: 'Avaliação' },
    atendido:               { cor: 'bg-emerald-50 text-emerald-700 border-emerald-200',txt: 'Atendido' },
    aguardandoNumero:       { cor: 'bg-indigo-50 text-indigo-700 border-indigo-200',  txt: 'Aguard. CNP' },
    faltoso:                { cor: 'bg-red-50 text-red-700 border-red-200',           txt: 'Faltoso' },
};

// ─── FIREBASE ─────────────────────────────────────────────────────────────────

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
});

// ─── SERVIÇO PRINCIPAL ────────────────────────────────────────────────────────

export const AtendimentoExternoService = {

    // Estado
    pautaId: null,
    pautaNome: 'Pauta Atual',
    pautaTipo: '',
    pautaFechada: false, 
    assistidoId: null,
    colaboradorNome: null,
    colaboradorId: null,
    fluxoSelecionado: null,
    assistidoData: null,
    todosColaboradores: [],
    colaboradorAtual: null,
    isProcessing: false,
    todosAtendimentosPauta: [],
    demandasAdicionaisLocais: [],
    unsubscribeDashboard: null,
    unsubscribePauta: null,
    abaAtual: 'minha-mesa',         
    modoVisualizacao: 'dashboard',  

    // ─── INIT ─────────────────────────────────────────────────────────────────

    async init() {
        console.log("Mesa Digital Inicializada");

        const searchLimpa = window.location.search.replace(/&amp;/g, '&');
        const urlParams = new URLSearchParams(searchLimpa);

        this.pautaId       = urlParams.get('pautaId')    || urlParams.get('amp;pautaId');
        this.assistidoId   = urlParams.get('assistidoId') || urlParams.get('amp;assistidoId');
        const tokenRecebido= urlParams.get('token')      || urlParams.get('amp;token');
        const telaAtual    = urlParams.get('view')       || urlParams.get('amp;view');
        const modo         = urlParams.get('modo')       || urlParams.get('amp;modo');

        this.modoVisualizacao = (modo === 'abas') ? 'abas' : 'dashboard';

        if (!this.pautaId) {
            this.showError("Link Incompleto", "Falta o identificador da pauta na URL.");
            return;
        }

        try {
            // Verifica o usuário logado para segurança e identificação automática
            const user = auth.currentUser;
            if (!user) {
                this.showError("Acesso Negado", "Você não está logado no sistema.");
                return;
            }

            const pautaDoc = await getDoc(doc(db, "pautas", this.pautaId));
            if (!pautaDoc.exists()) {
                this.showError("Pauta não localizada", "A pauta informada não existe mais no sistema.");
                return;
            }
            const pautaData = pautaDoc.data();
            
            // VALIDAÇÃO: Regra dos 7 Dias (Igual ao main.js)
            if (pautaData.createdAt) {
                const dataCriacao = new Date(pautaData.createdAt);
                const dataExpiracao = new Date(dataCriacao);
                dataExpiracao.setDate(dataCriacao.getDate() + 7);
                if (new Date() > dataExpiracao) {
                    this.showError("Pauta Expirada", "Esta pauta expirou (prazo de 7 dias) e foi arquivada pelo sistema.");
                    return;
                }
            }

            this.pautaNome = pautaData.name || 'Pauta';
            this.pautaTipo = pautaData.type || 'agendamento';
            this.pautaFechada = pautaData.fechada === true;

            // Busca o Colaborador baseando-se no Email Autenticado (Adeus problema do colab= na URL)
            const colabRef = collection(db, "pautas", this.pautaId, "collaborators");
            const q = query(colabRef, where("email", "==", user.email));
            const snap = await getDocs(q);

            if (snap.empty) {
                this.showError("Acesso Negado", "O seu usuário não tem permissão para acessar esta pauta específica.");
                return;
            }

            this.colaboradorAtual = { id: snap.docs[0].id, ...snap.docs[0].data() };
            this.colaboradorNome = this.colaboradorAtual.nome;
            this.colaboradorId = this.colaboradorAtual.id;

            // Carrega toda a equipa para select de transferência
            await this.carregarColaboradoresGerais();

            // Roteamento de Tela
            if (this.assistidoId && !telaAtual) {
                await this.iniciarAtendimentoIndividual(tokenRecebido, pautaData);
                return;
            }

            await this.iniciarDashboardUnificado();

        } catch (error) {
            console.error("Erro na inicialização:", error);
            this.showError("Conexão Perdida", "Falha ao conectar com o banco de dados.");
        }
    },

    // ─── ATENDIMENTO INDIVIDUAL ───────────────────────────────────────────────

    async iniciarAtendimentoIndividual(tokenRecebido, pautaData) {
        if (!this.unsubscribePauta) {
            this.unsubscribePauta = onSnapshot(doc(db, "pautas", this.pautaId), (snap) => {
                if(snap.exists()) {
                    this.pautaFechada = snap.data().fechada === true;
                    if(this.pautaFechada) this.renderizarInterface(this.assistidoData, pautaData);
                }
            });
        }

        const docSnap = await getDoc(doc(db, "pautas", this.pautaId, "attendances", this.assistidoId));
        if (!docSnap.exists()) {
            this.showError("Processo não encontrado", "Este assistido não está mais na pauta ou o link está quebrado.");
            return;
        }

        const assistido = docSnap.data();
        this.assistidoData = assistido;
        this.demandasAdicionaisLocais = assistido.demandas?.descricoes ? [...assistido.demandas.descricoes] : [];

        if (assistido.delegationToken && assistido.delegationToken !== tokenRecebido) {
            this.showError("Acesso Seguro Necessário", "O token de segurança é inválido ou expirou.");
            return;
        }

        this.renderizarInterface(assistido, pautaData);
        this.setupListeners();
        this.atualizarBadgeHeader();
    },

    // ─── DASHBOARD UNIFICADO ──────────────────────────────────────────────────

    async iniciarDashboardUnificado() {
        this._cancelarListeners();
        
        // Listener da Pauta (Status Fechada/Aberta)
        this.unsubscribePauta = onSnapshot(doc(db, "pautas", this.pautaId), (snap) => {
            if (snap.exists()) {
                const fechou = snap.data().fechada === true;
                if (fechou !== this.pautaFechada) {
                    this.pautaFechada = fechou;
                    if (this.modoVisualizacao === 'abas') this.renderizarAbaAtual();
                    else this.atualizarListasDoDashboard();
                }
            }
        });

        this.setupRealtimeListenerAttendances();
        this.renderizarContainerDashboard();

        if (this.modoVisualizacao === 'abas') {
            this.setupAbasNavegacao();
        } else {
            this.atualizarListasDoDashboard();
        }
    },

    _cancelarListeners() {
        if (this.unsubscribeDashboard) { this.unsubscribeDashboard(); this.unsubscribeDashboard = null; }
        if (this.unsubscribePauta) { this.unsubscribePauta(); this.unsubscribePauta = null; }
    },

    setupRealtimeListenerAttendances() {
        let isInitialRender = true;

        this.unsubscribeDashboard = onSnapshot(
            collection(db, "pautas", this.pautaId, "attendances"),
            (snap) => {
                this.todosAtendimentosPauta = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                
                if (!isInitialRender) {
                    snap.docChanges().forEach(change => {
                        if (change.type === 'added') {
                            const novoCaso = change.doc.data();
                            if (novoCaso.status === 'aguardando') {
                                if (typeof showNotification === 'function') showNotification(`Novo assistido na fila: ${novoCaso.name}`, "info");
                                if (typeof playSound === 'function') playSound();
                            }
                        }
                    });
                }
                isInitialRender = false;

                this.atualizarBadgeHeader();

                if (this.modoVisualizacao === 'abas') this.renderizarAbaAtual();
                else this.atualizarListasDoDashboard();
            },
            (error) => console.error("Erro no realtime:", error)
        );
    },

    async carregarColaboradoresGerais() {
        try {
            const snap = await getDocs(collection(db, "pautas", this.pautaId, "collaborators"));
            this.todosColaboradores = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch { this.todosColaboradores = []; }
    },

    _gerarTokenSeguro() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID().substring(0, 8);
        }
        return Math.random().toString(36).substring(2, 10) + Date.now().toString(36).substring(4);
    },

    showError(titulo, message) {
        const corpo = document.querySelector('.w-full.max-w-6xl') || document.querySelector('.w-full.max-w-2xl') || document.body;
        corpo.innerHTML = `
            <div class="w-full max-w-2xl mx-auto my-4 mt-10">
                <div class="bg-red-600 p-8 rounded-t-3xl shadow-xl flex flex-col items-center justify-center">
                    <div class="bg-white p-3 rounded-2xl mb-4"><img src="https://raw.githubusercontent.com/alexdovale/ac-o-paula-controle/main/imagem.png" alt="Logo" class="h-12 w-auto"></div>
                    <h1 class="text-white font-black text-3xl uppercase tracking-widest text-center">ACESSO NEGADO</h1>
                </div>
                <div class="p-10 text-center bg-white rounded-b-3xl shadow-xl border border-gray-200">
                    <span class="text-6xl block mb-6 text-red-300">${ico('lock', 'w-14 h-14 inline-block')}</span>
                    <h2 class="text-xl font-black text-gray-800 uppercase tracking-wide mb-3">${titulo}</h2>
                    <p class="text-gray-500 font-semibold">${message}</p>
                    <button onclick="window.location.href = window.location.pathname" class="mt-8 bg-slate-800 text-white font-bold px-6 py-3 rounded-xl hover:bg-slate-900 transition-colors uppercase tracking-widest text-sm shadow-sm">VOLTAR</button>
                </div>
            </div>`;
    },

    // ─── MÉTODOS DE TELA E RENDERIZAÇÃO (Mantidos da Fase 3) ──────────────────

    renderizarContainerDashboard() {
        const corpo = document.querySelector('.w-full.max-w-6xl') || document.body;

        const url = new URL(window.location.href);
        url.searchParams.set('view', 'dashboard');
        if (this.modoVisualizacao === 'abas') url.searchParams.set('modo', 'abas');
        window.history.pushState({}, '', url);

        const isDefensor = this.colaboradorAtual?.cargo?.toLowerCase().includes('defensor');
        const tituloPainel = this.modoVisualizacao === 'abas' ? 'Painel SIGEP' : (isDefensor ? 'Mesa do Defensor' : 'Mesa de Trabalho');
        const subtituloPainel = `${escapeHTML(this.colaboradorNome)} • ${escapeHTML(this.colaboradorAtual?.cargo || 'Membro')}`;

        const prefs = JSON.parse(localStorage.getItem('dashboard_prefs')) || { mode: 'tabs', color: 'slate' };
        const colorMap = { slate: 'bg-slate-800', indigo: 'bg-indigo-700', emerald: 'bg-emerald-700', rose: 'bg-rose-700', blue: 'bg-blue-700' };
        const headerColorClass = colorMap[prefs.color] || colorMap.slate;

        corpo.className = "w-full max-w-6xl mx-auto my-4 transition-all animate-fade-in";
        corpo.innerHTML = `
            <div id="header-bg" class="${headerColorClass} p-6 sm:p-8 rounded-t-2xl shadow-xl flex items-center justify-between relative overflow-visible border-b border-white/10 transition-colors duration-500">
                <div class="absolute top-0 right-0 w-64 h-64 bg-white opacity-10 rounded-full blur-3xl -mr-10 -mt-20 pointer-events-none"></div>
                <div class="flex flex-col sm:flex-row items-start sm:items-center gap-4 relative z-10 w-full justify-between">
                    <div class="flex items-center gap-4">
                        <div class="bg-white/10 p-2.5 rounded-xl border border-white/20 shadow-inner flex-shrink-0">
                            <img src="https://raw.githubusercontent.com/alexdovale/ac-o-paula-controle/main/imagem.png" alt="Logo" class="h-10 w-auto object-contain">
                        </div>
                        <div>
                            <h1 class="text-white font-black text-xl sm:text-2xl uppercase tracking-widest flex items-center gap-2">
                                ${tituloPainel}
                            </h1>
                            <p class="text-white/80 text-xs sm:text-sm font-bold mt-1 tracking-wide">${subtituloPainel}</p>
                        </div>
                    </div>
                    <div class="flex gap-2 relative mt-4 sm:mt-0 w-full sm:w-auto justify-end items-center">
                        <span id="badge-status-header" class="bg-white/20 text-white/80 text-[10px] font-black px-3 py-1.5 rounded-full shadow-sm uppercase tracking-wider transition-colors duration-300">${ico('loader', 'w-3 h-3 animate-spin')}</span>
                        
                        ${this.modoVisualizacao === 'abas' ? `
                        <button id="btn-voltar-dashboard" class="bg-white/20 hover:bg-white/30 text-white text-[10px] font-bold px-3 py-2 rounded-lg transition" title="Voltar ao modo Mesa">
                            ← Voltar
                        </button>` : `
                        <button id="btn-ir-abas" class="bg-white/20 hover:bg-white/30 text-white text-[10px] font-bold px-3 py-2 rounded-lg transition" title="Ver pauta completa">
                            ${ico('clipboard', 'w-3 h-3')} Pauta Total
                        </button>`}

                        <button id="btn-install-pwa" class="hidden bg-white/20 hover:bg-white/30 text-white p-2 sm:px-4 sm:py-2 rounded-lg transition font-bold text-xs shadow-sm flex items-center gap-2">
                            <span>${ico('smartphone', 'w-3.5 h-3.5')}</span><span class="hidden sm:inline">Instalar App</span>
                        </button>
                        <button id="btn-dash-settings" class="bg-white/20 hover:bg-white/30 text-white p-2 rounded-lg transition shadow-sm">${ico('settings')}</button>

                        <div id="dash-settings-menu" class="hidden absolute top-full right-0 mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-slate-100 p-4 z-[999] origin-top-right">
                            <h4 class="text-[10px] font-black uppercase text-slate-400 mb-2 tracking-widest border-b border-slate-100 pb-1">Layout da Tela</h4>
                            <div class="flex gap-2 mb-5 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                                <button data-mode="tabs" class="mode-btn flex-1 py-2 text-xs font-bold rounded-lg transition-all ${prefs.mode === 'tabs' ? 'bg-white text-slate-800 border border-slate-200 shadow-sm' : 'text-slate-400 hover:bg-slate-200'}">Abas</button>
                                <button data-mode="list" class="mode-btn flex-1 py-2 text-xs font-bold rounded-lg transition-all ${prefs.mode === 'list' ? 'bg-white text-slate-800 border border-slate-200 shadow-sm' : 'text-slate-400 hover:bg-slate-200'}">Tudo na Tela</button>
                            </div>
                            <h4 class="text-[10px] font-black uppercase text-slate-400 mb-2 tracking-widest border-b border-slate-100 pb-1">Cor do Cabeçalho</h4>
                            <div class="flex gap-2 justify-between px-1">
                                ${['slate','blue','indigo','emerald','rose'].map(c => `
                                    <button data-color="${c}" class="color-btn w-6 h-6 rounded-full bg-${c === 'slate' ? 'slate-800' : c+'-700'} ring-offset-2 transition-transform hover:scale-110 ${prefs.color === c ? 'ring-2 ring-offset-2 scale-110 shadow-md' : ''}"></button>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div id="dash-body" class="bg-slate-50 p-4 sm:p-6 rounded-b-2xl shadow-lg border border-slate-200 min-h-[500px] transition-colors duration-500">
                ${this.modoVisualizacao === 'abas' ? this._htmlAbasNavegacao() : this._htmlDashboardTradicional()}
            </div>
        `;

        this._setupHeaderInteracoes(colorMap, prefs);
        this.atualizarBadgeHeader();

        if (deferredPrompt) {
            const btn = document.getElementById('btn-install-pwa');
            btn.classList.remove('hidden');
            btn.addEventListener('click', async () => {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                if (outcome === 'accepted') btn.classList.add('hidden');
                deferredPrompt = null;
            });
        }

        document.getElementById('btn-voltar-dashboard')?.addEventListener('click', () => {
            this.modoVisualizacao = 'dashboard';
            this.iniciarDashboardUnificado();
        });
        document.getElementById('btn-ir-abas')?.addEventListener('click', () => {
            this.modoVisualizacao = 'abas';
            this.iniciarDashboardUnificado();
        });
    },

    _setupHeaderInteracoes(colorMap, prefs) {
        const btnSettings = document.getElementById('btn-dash-settings');
        const menuSettings = document.getElementById('dash-settings-menu');

        btnSettings?.addEventListener('click', (e) => { e.stopPropagation(); menuSettings.classList.toggle('hidden'); });
        document.addEventListener('click', (e) => {
            if (menuSettings && !menuSettings.contains(e.target) && !btnSettings.contains(e.target)) {
                menuSettings.classList.add('hidden');
            }
        });

        document.querySelectorAll('.color-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const c = e.target.dataset.color;
                prefs.color = c;
                localStorage.setItem('dashboard_prefs', JSON.stringify(prefs));
                const hdr = document.getElementById('header-bg');
                if (hdr) hdr.className = `${colorMap[c]} p-6 sm:p-8 rounded-t-2xl shadow-xl flex items-center justify-between relative overflow-visible border-b border-white/10 transition-colors duration-500`;
            });
        });

        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                prefs.mode = e.target.dataset.mode;
                localStorage.setItem('dashboard_prefs', JSON.stringify(prefs));
                menuSettings?.classList.add('hidden');
                if (this.modoVisualizacao === 'abas') this.renderizarAbaAtual();
                else this.atualizarListasDoDashboard();
            });
        });
    },

    _htmlAbasNavegacao() {
        return `
            <div class="mb-5 border-b border-slate-200">
                <div class="flex gap-2 overflow-x-auto custom-scrollbar">
                    <button id="btn-tab-minha-mesa" class="tab-principal-btn shrink-0 px-5 py-3.5 text-xs font-black uppercase tracking-widest rounded-t-xl transition-all bg-blue-600 text-white shadow-sm">
                        ${ico('monitor', 'w-4 h-4 inline-block')} Minha Mesa
                    </button>
                    <button id="btn-tab-aguardando" class="tab-principal-btn shrink-0 px-5 py-3.5 text-xs font-bold uppercase tracking-widest rounded-t-xl transition-all bg-white border border-b-0 border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700">
                        Fila de Espera
                    </button>
                    <button id="btn-tab-pauta-atual" class="tab-principal-btn shrink-0 px-5 py-3.5 text-xs font-bold uppercase tracking-widest rounded-t-xl transition-all bg-white border border-b-0 border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700">
                        Auditoria da Pauta
                    </button>
                </div>
            </div>
            <div id="painel-atendimento-container" class="min-h-[400px]">
                <div class="flex justify-center py-20"><div class="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-400"></div></div>
            </div>
        `;
    },

    _htmlDashboardTradicional() {
        return `
            <div id="wrapper-busca-historico" class="hidden mb-5 animate-fade-in">
                <input type="text" id="input-busca-local" class="w-full p-4 border border-slate-200 rounded-2xl text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-500 shadow-sm transition-all" placeholder="Pesquisar assistido por nome ou assunto...">
            </div>
            <div id="tabs-container-wrapper" class="bg-white p-2 rounded-2xl shadow-sm border border-slate-200 mb-6">
                <div id="tabs-dashboard" class="flex gap-2 overflow-x-auto custom-scrollbar"></div>
            </div>
            <div id="lista-dashboard-conteudo" class="space-y-3 sm:space-y-4">
                <div class="flex justify-center py-20"><div class="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-400"></div></div>
            </div>
        `;
    },

    setupAbasNavegacao() {
        const abas = [
            { id: 'minha-mesa',  btnId: 'btn-tab-minha-mesa',  cor: 'bg-blue-600 border-transparent shadow-sm' },
            { id: 'aguardando',  btnId: 'btn-tab-aguardando',  cor: 'bg-emerald-600 border-transparent shadow-sm' },
            { id: 'pauta-atual', btnId: 'btn-tab-pauta-atual', cor: 'bg-slate-700 border-transparent shadow-sm' },
        ];

        const ativarAba = (abaId) => {
            this.abaAtual = abaId;
            abas.forEach(aba => {
                const btn = document.getElementById(aba.btnId);
                if (!btn) return;
                if (aba.id === abaId) {
                    btn.className = `tab-principal-btn shrink-0 px-5 py-3.5 text-xs font-black uppercase tracking-widest rounded-t-xl transition-all ${aba.cor} text-white`;
                } else {
                    btn.className = 'tab-principal-btn shrink-0 px-5 py-3.5 text-xs font-bold uppercase tracking-widest rounded-t-xl transition-all bg-white border border-b-0 border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700';
                }
            });
            this.renderizarAbaAtual();
        };

        document.getElementById('btn-tab-minha-mesa')?.addEventListener('click', () => ativarAba('minha-mesa'));
        document.getElementById('btn-tab-aguardando')?.addEventListener('click', () => ativarAba('aguardando'));
        document.getElementById('btn-tab-pauta-atual')?.addEventListener('click', () => ativarAba('pauta-atual'));

        this.renderizarAbaAtual();
    },

    renderizarAbaAtual() {
        const container = document.getElementById('painel-atendimento-container');
        if (!container) return;

        if (this.abaAtual === 'minha-mesa')      this._renderMinhaMesa(container);
        else if (this.abaAtual === 'aguardando') this._renderAguardando(container);
        else if (this.abaAtual === 'pauta-atual') this._renderPautaAtual(container);

        this._setupAcoesCards();
    },

    _renderMinhaMesa(container) {
        const meusCasos = this.todosAtendimentosPauta.filter(a =>
            a.status === 'emAtendimento' &&
            a.assignedCollaborator?.name === this.colaboradorNome
        );

        if (meusCasos.length === 0) {
            container.innerHTML = `
                <div class="text-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm animate-fade-in">
                    <span class="text-5xl block mb-4 text-slate-300">${ico('monitor', 'w-16 h-16 inline-block')}</span>
                    <p class="font-black text-slate-700 uppercase tracking-widest text-sm">Sua mesa está limpa</p>
                    <p class="text-xs text-slate-500 mt-2">Clique na aba <strong>Fila de Espera</strong> para iniciar novos casos.</p>
                </div>`;
            return;
        }

        container.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 animate-fade-in">
            ${meusCasos.map(a => this._htmlCardAba(a, 'mesa')).join('')}
        </div>`;
    },

    _renderAguardando(container) {
        const aguardando = this.todosAtendimentosPauta.filter(a => a.status === 'aguardando');

        if (aguardando.length === 0) {
            container.innerHTML = `
                <div class="text-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm animate-fade-in">
                    <span class="text-5xl block mb-4 text-emerald-300">${ico('checkCircle', 'w-16 h-16 inline-block')}</span>
                    <p class="font-black text-slate-700 uppercase tracking-widest text-sm">Nenhum assistido aguardando</p>
                </div>`;
            return;
        }

        container.innerHTML = `
            ${!this.pautaFechada ? `
            <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5 text-sm text-blue-800 font-semibold shadow-sm flex items-center gap-2">
                ${ico('info', 'w-5 h-5 shrink-0')} Os casos abaixo estão aguardando. Clique em "Atender" para abrir o processo.
            </div>` : `
            <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5 text-sm text-amber-800 font-semibold shadow-sm flex items-center gap-2">
                ${ico('alertCircle', 'w-5 h-5 shrink-0')} A pauta está encerrada. Não é possível iniciar novos atendimentos.
            </div>`}
            <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 animate-fade-in">
                ${aguardando.map(a => this._htmlCardAba(a, 'puxar')).join('')}
            </div>`;
    },

    _renderPautaAtual(container) {
        const isDefensor = this.colaboradorAtual?.cargo?.toLowerCase().includes('defensor') === true;
        
        const assistidos = isDefensor ? this.todosAtendimentosPauta : this.todosAtendimentosPauta.filter(a => 
            a.assignedCollaborator?.name === this.colaboradorNome || 
            a.enviadoPor === this.colaboradorNome || 
            a.attendedBy === this.colaboradorNome ||
            a.status === 'aguardando' 
        );

        if (assistidos.length === 0) {
            container.innerHTML = `
                <div class="text-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm animate-fade-in">
                    <span class="text-5xl block mb-4 text-slate-300">${ico('clipboard', 'w-16 h-16 inline-block')}</span>
                    <p class="font-black text-slate-700 uppercase tracking-widest text-sm">Auditoria Vazia</p>
                    <p class="text-xs text-slate-500 mt-2">Nenhum atendimento associado a você foi localizado.</p>
                </div>`;
            return;
        }

        const total      = assistidos.length;
        const aguardando = assistidos.filter(a => a.status === 'aguardando').length;
        const atendendo  = assistidos.filter(a => a.status === 'emAtendimento').length;
        const atendidos  = assistidos.filter(a => a.status === 'atendido').length;
        const faltosos   = assistidos.filter(a => a.status === 'faltoso').length;
        const dist       = assistidos.filter(a => a.status === 'aguardandoDistribuicao').length;
        const porcentagem = total > 0 ? Math.round((atendidos / total) * 100) : 0;

        let html = `
            <div class="mb-8 animate-fade-in">
                <div class="flex items-center justify-between mb-3 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                    <div>
                        <h3 class="font-black text-slate-800 text-sm sm:text-base">${escapeHTML(this.pautaNome)}</h3>
                        <p class="text-[10px] text-slate-500 uppercase tracking-wider mt-1">${this.pautaTipo} • ${isDefensor ? 'Visão Global (Defensor)' : 'Sua Visão (Servidor)'}</p>
                    </div>
                    <div class="text-right flex items-center gap-2">
                        <button id="btn-relatorio-pdf" class="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-widest shadow-sm transition-colors flex items-center gap-1">${ico('fileText', 'w-3 h-3')} PDF (Atendidos)</button>
                        <span class="text-sm font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-100">${porcentagem}% Concluído</span>
                    </div>
                </div>

                <div class="h-2 bg-slate-200 rounded-full mb-6 overflow-hidden">
                    <div class="h-full bg-emerald-500 transition-all duration-1000" style="width:${porcentagem}%"></div>
                </div>

                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                    <div class="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-center shadow-sm">
                        <div class="text-2xl font-black text-amber-600">${aguardando}</div>
                        <div class="text-[9px] text-amber-600 font-bold uppercase tracking-wider mt-1">Espera</div>
                    </div>
                    <div class="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-center shadow-sm">
                        <div class="text-2xl font-black text-blue-600">${atendendo}</div>
                        <div class="text-[9px] text-blue-600 font-bold uppercase tracking-wider mt-1">Atendendo</div>
                    </div>
                    <div class="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-center shadow-sm">
                        <div class="text-2xl font-black text-emerald-600">${atendidos}</div>
                        <div class="text-[9px] text-emerald-600 font-bold uppercase tracking-wider mt-1">Concluídos</div>
                    </div>
                    <div class="bg-cyan-50 border border-cyan-100 rounded-2xl p-4 text-center shadow-sm">
                        <div class="text-2xl font-black text-cyan-600">${dist}</div>
                        <div class="text-[9px] text-cyan-600 font-bold uppercase tracking-wider mt-1">Em Revisão</div>
                    </div>
                </div>

                ${this._htmlGrupoStatus('Aguardando', assistidos.filter(a => a.status === 'aguardando'), 'geral', this.pautaId)}
                ${this._htmlGrupoStatus('Em Atendimento', assistidos.filter(a => a.status === 'emAtendimento'), 'geral', this.pautaId)}
                ${dist > 0 ? this._htmlGrupoStatus('Distribuição / Correção', assistidos.filter(a => a.status === 'aguardandoDistribuicao' || a.status === 'aguardandoCorrecao'), 'geral', this.pautaId) : ''}
                ${this._htmlGrupoStatus('Atendidos', assistidos.filter(a => a.status === 'atendido' || a.status === 'aguardandoNumero'), 'geral', this.pautaId)}
            </div>
        `;

        container.innerHTML = html;

        // INJEÇÃO DA GERAÇÃO DE PDFS NATIVOS
        const btnPdfAtendidos = document.getElementById('btn-relatorio-pdf');
        if (btnPdfAtendidos) {
            btnPdfAtendidos.addEventListener('click', () => {
                if (window.PDFService && window.PDFService.generateAtendidosPDF) {
                    window.PDFService.generateAtendidosPDF(assistidos.filter(a => a.status === 'atendido'), this.pautaNome);
                } else {
                    alert("Módulo PDFService não encontrado.");
                }
            });
        }
    },

    _htmlGrupoStatus(titulo, lista, modo, pautaId) {
        if (lista.length === 0) return '';
        return `
            <details class="mb-4 group bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden" open="${lista.length <= 8}">
                <summary class="p-4 bg-slate-50 text-[11px] font-black text-slate-700 uppercase tracking-widest cursor-pointer select-none flex justify-between items-center hover:bg-slate-100 transition-colors">
                    <span>${titulo} <span class="bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full ml-2">${lista.length}</span></span>
                    <span class="text-slate-400 group-open:rotate-180 transition-transform">${ico('chevronDown')}</span>
                </summary>
                <div class="p-4 bg-white">
                    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        ${lista.map(a => this._htmlCardAba(a, modo, pautaId)).join('')}
                    </div>
                </div>
            </details>
        `;
    },

    _htmlCardAba(assistido, modo, pautaIdOverride = null) {
        const pid = pautaIdOverride || this.pautaId;
        const st = statusMap[assistido.status] || { cor: 'bg-gray-100 text-gray-600 border-gray-200', txt: assistido.status };
        const donoLabel = assistido.assignedCollaborator?.name
            ? `${escapeHTML(assistido.assignedCollaborator.name)}`
            : 'Sem dono';
        const badgeUrgencia = assistido.priority === 'URGENTE'
            ? `<span class="bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow-sm animate-pulse ml-2">${ico('alertCircle', 'w-3 h-3 inline-block')} Urgente</span>`
            : '';
        const baseUrl = window.location.href.split('?')[0];
        const linkIndividual = `${baseUrl}?pautaId=${pid}&assistidoId=${assistido.id}`;

        let botoesHtml = '';
        
        // FASE 3: TRAVA DE PAUTA ENCERRADA PARA OS BOTÕES DO CARD
        if (this.pautaFechada) {
            botoesHtml = `<div class="mt-4 text-center py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold text-slate-400 uppercase tracking-widest">Pauta Encerrada</div>`;
        } else {
            if (modo === 'puxar') {
                botoesHtml = `
                    <a href="${linkIndividual}" class="block w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2.5 rounded-xl transition text-center shadow-sm flex items-center justify-center gap-2">
                        ${ico('clipboard', 'w-3.5 h-3.5')} Iniciar Atendimento
                    </a>`;
            } else if (modo === 'mesa') {
                botoesHtml = `
                    <div class="flex gap-2 mt-4">
                        <a href="${linkIndividual}" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2.5 rounded-xl transition shadow-sm text-center flex items-center justify-center gap-1.5">${ico('clipboard', 'w-3.5 h-3.5')} Continuar</a>
                        <button class="btn-devolver-caso flex-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 font-bold text-xs py-2.5 rounded-xl transition shadow-sm"
                            data-pauta-id="${pid}" data-assistido-id="${assistido.id}">Devolver</button>
                    </div>`;
            } else {
                botoesHtml = `
                    <a href="${linkIndividual}" class="block w-full mt-4 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs py-2.5 rounded-xl transition shadow-sm text-center flex items-center justify-center gap-2">${ico('search', 'w-3.5 h-3.5')} Ver Detalhes</a>`;
            }
        }

        return `
            <div class="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col hover:shadow-md transition-shadow">
                <div class="flex justify-between items-start mb-3 gap-2">
                    <h4 class="font-bold text-slate-800 text-sm truncate flex-1 flex items-center">
                        ${escapeHTML(assistido.name)} ${badgeUrgencia}
                    </h4>
                </div>
                <div class="bg-slate-50 p-3 rounded-xl border border-slate-100 flex-grow text-xs text-slate-600 space-y-2">
                    <div class="flex items-center gap-2 text-slate-500">
                        <span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                        <p class="truncate font-medium">${escapeHTML(assistido.subject || 'Assunto não informado')}</p>
                    </div>
                    <div class="flex items-center justify-between border-t border-slate-100 pt-2 mt-2">
                        <span class="text-[9px] font-black uppercase px-2 py-1 rounded-lg border ${st.cor} shrink-0">${st.txt}</span>
                        ${modo === 'geral' || modo === 'mesa' ? `<span class="font-bold ${assistido.assignedCollaborator ? 'text-blue-600' : 'text-slate-400'} text-[10px] uppercase">${donoLabel}</span>` : ''}
                    </div>
                    ${assistido.numeroProcesso ? `<div class="mt-2 pt-2 border-t border-slate-100"><p class="font-mono text-[10px] font-bold text-slate-500 bg-white px-2 py-1 border border-slate-200 rounded-lg text-center">Nº ${escapeHTML(assistido.numeroProcesso)}</p></div>` : ''}
                </div>
                ${botoesHtml}
            </div>`;
    },

    _setupAcoesCards() {
        document.querySelectorAll('.btn-devolver-caso').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const b = e.currentTarget;
                await this.devolverParaFila(b.dataset.pautaId, b.dataset.assistidoId);
            });
        });
    },

    async devolverParaFila(pautaId, assistidoId) {
        if (!confirm("Devolver este caso para a fila de Espera? Outros colaboradores poderão assumi-lo.")) return;

        try {
            await updateDoc(doc(db, "pautas", pautaId, "attendances", assistidoId), {
                status: 'aguardando',
                assignedCollaborator: null,
                inAttendanceTime: null,
                history: arrayUnion({
                    action: 'DEVOLVIDO_PARA_FILA',
                    by: this.colaboradorNome,
                    msg: `Devolvido para a fila de Aguardando por ${this.colaboradorNome}`,
                    at: new Date().toISOString()
                })
            });

            if (this.colaboradorAtual?.id) {
                await updateDoc(doc(db, "pautas", pautaId, "collaborators", this.colaboradorAtual.id), {
                    status: 'disponivel',
                    currentAttendance: null
                }).catch(() => {});
            }

            if (typeof showNotification === 'function') {
                showNotification("Caso devolvido para a fila.", "info");
            }
        } catch (error) {
            console.error("Erro ao devolver caso:", error);
            if (typeof showNotification === 'function') showNotification("Erro ao devolver caso.", "error");
            else alert("Erro ao devolver caso.");
        }
    },

    atualizarBadgeHeader() {
        const badge = document.getElementById('badge-status-header');
        if (!badge) return;

        const urlParams = new URLSearchParams(window.location.search.replace(/&amp;/g, '&'));
        const isNaTelaIndividual = !!urlParams.get('assistidoId');

        const meusCasos = this.todosAtendimentosPauta.filter(a =>
            a.status === 'emAtendimento' &&
            a.assignedCollaborator?.name === this.colaboradorNome
        );

        const livre = meusCasos.length === 0 && !isNaTelaIndividual;

        badge.textContent = livre ? "LIVRE" : "OCUPADO";
        badge.className = `bg-white/20 ${livre ? 'text-emerald-300 border-emerald-400' : 'text-amber-300 border-amber-400'} text-[10px] font-black px-3 py-1.5 rounded-full shadow-sm border uppercase tracking-wider transition-colors duration-300 flex items-center gap-1.5`;

        if (this.colaboradorAtual?.id && this.colaboradorAtual.id !== 'manual') {
            const novoStatus = livre ? 'disponivel' : 'ocupado';
            if (this.colaboradorAtual.status !== novoStatus) {
                this.colaboradorAtual.status = novoStatus; 
                updateDoc(doc(db, "pautas", this.pautaId, "collaborators", this.colaboradorAtual.id), {
                    status: novoStatus
                }).catch(()=>{});
            }
        }
    },

    atualizarListasDoDashboard() {
        const container = document.getElementById('lista-dashboard-conteudo');
        const tabsDiv   = document.getElementById('tabs-dashboard');
        const wrapperBusca = document.getElementById('wrapper-busca-historico');
        if (!container) return;

        const isDefensor = this.colaboradorAtual?.cargo?.toLowerCase().includes('defensor') === true;
        const prefs = JSON.parse(localStorage.getItem('dashboard_prefs')) || { mode: 'tabs', color: 'slate' };
        const baseUrl = window.location.href.split('?')[0];

        const desenharCard = (item, isAberto) => {
            const st = statusMap[item.status] || { cor: 'bg-slate-100 text-slate-600 border-slate-200', txt: item.status };
            const notas = item.notasRevisao ? `<div class="mt-2 bg-orange-50 p-2.5 rounded-lg text-xs font-medium text-orange-800 border border-orange-200 flex items-start gap-2">${ico('alertCircle', 'w-4 h-4 shrink-0 mt-0.5')} <span>${escapeHTML(item.notasRevisao)}</span></div>` : '';
            const numCNP = item.numeroProcesso ? `<span class="font-mono font-bold text-[10px] bg-slate-100 border border-slate-200 px-2 py-1 rounded-lg text-slate-600 shadow-sm inline-block mt-2">Nº ${escapeHTML(item.numeroProcesso)}</span>` : '';
            const urgencia = item.priority === 'URGENTE' ? 'border-l-[4px] border-l-red-500' : '';
            const link = `${baseUrl}?pautaId=${this.pautaId}&assistidoId=${item.id}`;

            let botaoHtml = '';
            if (this.pautaFechada) {
                botaoHtml = `<span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">Fechada</span>`;
            } else {
                botaoHtml = `<a href="${link}" class="shrink-0 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded-xl text-[11px] uppercase tracking-widest transition shadow-sm text-center">Abrir</a>`;
            }

            if (isAberto) {
                return `
                    <div class="border ${urgencia} bg-white border-slate-200 p-5 rounded-2xl shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 hover:shadow-md transition-shadow">
                        <div class="min-w-0 flex-1">
                            <h3 class="font-black text-slate-800 text-base truncate flex items-center gap-2">${escapeHTML(item.name)} <span class="text-[9px] font-black px-2 py-0.5 rounded-md border ${st.cor} shrink-0">${st.txt}</span></h3>
                            <p class="text-xs text-slate-500 truncate mt-1 font-medium">${escapeHTML(item.subject || 'Sem assunto')}</p>
                            ${numCNP} ${notas}
                        </div>
                        ${botaoHtml}
                    </div>`;
            }

            const hora = item.attendedAt ? new Date(item.attendedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
            return `
                <div class="border ${urgencia} border-slate-200 bg-white p-4 rounded-xl shadow-sm flex justify-between items-center gap-3 mb-3 hover:shadow-md transition-shadow">
                    <div class="min-w-0 flex-1">
                        <h3 class="font-bold text-slate-800 text-sm truncate">${escapeHTML(item.name)}</h3>
                        <p class="text-[11px] font-medium text-slate-400 truncate mt-0.5">${escapeHTML(item.subject || '')}</p>
                        ${numCNP}
                    </div>
                    <div class="shrink-0 text-right flex flex-col items-end gap-1">
                        <span class="text-[9px] font-black px-2 py-1 rounded-md border ${st.cor}">${st.txt}</span>
                        ${hora ? `<p class="text-[10px] text-slate-400 font-bold bg-slate-50 px-2 py-0.5 rounded">${hora}</p>` : ''}
                    </div>
                </div>`;
        };

        const renderLista = (lista, isAberto, aviso) => {
            if (lista.length === 0) {
                container.innerHTML = `<div class="text-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm"><span class="text-5xl mb-4 block text-slate-300">${ico('inbox', 'w-16 h-16 inline-block')}</span><p class="text-sm font-bold uppercase tracking-widest text-slate-500">${aviso}</p></div>`;
                return;
            }
            container.innerHTML = lista.map(i => desenharCard(i, isAberto)).join('');
        };

        const resetTabs = () => {
            if (wrapperBusca) wrapperBusca.classList.add('hidden');
            document.querySelectorAll('.tab-btn').forEach(b => {
                b.className = b.className.replace(/bg-slate-800|bg-emerald-600|bg-indigo-600|bg-blue-600|text-white|shadow-md|mode-btn-active/g, '').trim();
                b.classList.add('bg-white', 'text-slate-500', 'hover:bg-slate-50', 'border', 'border-slate-200', 'tab-btn');
            });
        };

        if (isDefensor) {
            const pendentes    = this.todosAtendimentosPauta.filter(a => ((a.status === 'aguardandoDistribuicao' || a.status === 'aguardandoCorrecao') && a.defensorResponsavel === this.colaboradorNome) || (a.status === 'emAtendimento' && a.assignedCollaborator?.name === this.colaboradorNome));
            const distribuidos = this.todosAtendimentosPauta.filter(a => (a.status === 'atendido' || a.status === 'aguardandoNumero') && (a.defensorResponsavel === this.colaboradorNome || a.attendedBy === this.colaboradorNome));
            const historico    = this.todosAtendimentosPauta;

            if (prefs.mode === 'list') {
                container.innerHTML = pendentes.map(item => desenharCard(item, true)).join('') + distribuidos.map(item => desenharCard(item, true)).join('');
                if (tabsDiv) tabsDiv.parentElement.classList.add('hidden');
            } else {
                if (tabsDiv) tabsDiv.parentElement.classList.remove('hidden');
                
                tabsDiv.innerHTML = `
                    <button id="tab-pendentes" class="tab-btn flex-1 py-3 px-4 text-xs font-bold uppercase tracking-widest rounded-xl transition-all bg-slate-800 text-white shadow-md border-transparent mode-btn-active flex items-center justify-center gap-2">Pendente <span class="bg-white/20 px-2 py-0.5 rounded-lg text-[10px] font-black">${pendentes.length}</span></button>
                    <button id="tab-assinados" class="tab-btn flex-1 py-3 px-4 text-xs font-bold uppercase tracking-widest rounded-xl transition-all bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center justify-center gap-2">Finalizado <span class="bg-slate-100 border border-slate-200 text-slate-600 px-2 py-0.5 rounded-lg text-[10px] font-black">${distribuidos.length}</span></button>
                    <button id="tab-historico-busca" class="tab-btn flex-1 py-3 px-4 text-xs font-bold uppercase tracking-widest rounded-xl transition-all bg-white border border-slate-200 text-blue-600 hover:bg-blue-50 flex items-center justify-center gap-2">${ico('search', 'w-4 h-4')} Buscar / Auditar</button>
                `;

                document.getElementById('tab-pendentes')?.addEventListener('click', () => { resetTabs(); document.getElementById('tab-pendentes').classList.add('bg-slate-800','text-white','shadow-md','border-transparent','mode-btn-active'); renderLista(pendentes, true, 'Sua mesa está limpa.'); });
                document.getElementById('tab-assinados')?.addEventListener('click', () => { resetTabs(); document.getElementById('tab-assinados').classList.add('bg-emerald-600','text-white','shadow-md','border-transparent','mode-btn-active'); renderLista(distribuidos, true, 'Nenhum finalizado.'); });
                document.getElementById('tab-historico-busca')?.addEventListener('click', () => {
                    resetTabs(); wrapperBusca?.classList.remove('hidden'); document.getElementById('tab-historico-busca').classList.add('bg-blue-600','text-white','shadow-md','border-transparent','mode-btn-active');
                    renderLista(historico, true, 'Sem histórico.');
                    document.getElementById('input-busca-local')?.addEventListener('input', e => {
                        const t = e.target.value.toLowerCase();
                        renderLista(historico.filter(i => (i.name||'').toLowerCase().includes(t) || (i.subject||'').toLowerCase().includes(t) || (i.numeroProcesso||'').includes(t)), true, 'Nada encontrado.');
                    });
                });

                renderLista(pendentes, true, 'Sua mesa está limpa.');
            }

        } else {
            const emAndamento = this.todosAtendimentosPauta.filter(a => a.status === 'emAtendimento' && a.assignedCollaborator?.name === this.colaboradorNome);
            const enviados    = this.todosAtendimentosPauta.filter(a => (a.status === 'aguardandoDistribuicao' || a.status === 'aguardandoCorrecao') && a.enviadoPor === this.colaboradorNome);
            const finalizados = this.todosAtendimentosPauta.filter(a => (a.status === 'atendido' || a.status === 'aguardandoNumero') && (a.attendedBy === this.colaboradorNome || a.enviadoPor === this.colaboradorNome));
            const historico   = this.todosAtendimentosPauta.filter(a => a.enviadoPor === this.colaboradorNome || a.attendedBy === this.colaboradorNome || a.assignedCollaborator?.name === this.colaboradorNome || (Array.isArray(a.history) && a.history.some(h => h.by === this.colaboradorNome)));

            if (prefs.mode === 'list') {
                container.innerHTML = emAndamento.map(item => desenharCard(item, true)).join('') + enviados.map(item => desenharCard(item, true)).join('') + finalizados.map(item => desenharCard(item, true)).join('');
                if (tabsDiv) tabsDiv.parentElement.classList.add('hidden');
            } else {
                if (tabsDiv) tabsDiv.parentElement.classList.remove('hidden');

                tabsDiv.innerHTML = `
                    <button id="tab-em-mesa" class="tab-btn flex-1 py-3 px-2 text-[11px] sm:text-xs font-bold uppercase tracking-widest rounded-xl transition-all bg-slate-800 text-white shadow-md border-transparent mode-btn-active flex items-center justify-center gap-1.5">Fazer <span class="bg-white/20 px-2 py-0.5 rounded-lg text-[10px] font-black">${emAndamento.length}</span></button>
                    <button id="tab-enviados" class="tab-btn flex-1 py-3 px-2 text-[11px] sm:text-xs font-bold uppercase tracking-widest rounded-xl transition-all bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center justify-center gap-1.5">No Defensor <span class="bg-slate-100 border border-slate-200 text-slate-600 px-2 py-0.5 rounded-lg text-[10px] font-black">${enviados.length}</span></button>
                    <button id="tab-finalizados" class="tab-btn flex-1 py-3 px-2 text-[11px] sm:text-xs font-bold uppercase tracking-widest rounded-xl transition-all bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center justify-center gap-1.5">Prontos <span class="bg-slate-100 border border-slate-200 text-slate-600 px-2 py-0.5 rounded-lg text-[10px] font-black">${finalizados.length}</span></button>
                    <button id="tab-historico-busca" class="tab-btn shrink-0 py-3 px-4 text-xs font-bold uppercase tracking-widest rounded-xl transition-all bg-white border border-slate-200 text-blue-600 hover:bg-blue-50 flex items-center justify-center" title="Buscar">${ico('search', 'w-4 h-4')}</button>
                `;

                document.getElementById('tab-em-mesa')?.addEventListener('click',    () => { resetTabs(); document.getElementById('tab-em-mesa').classList.add('bg-slate-800','text-white','shadow-md','border-transparent','mode-btn-active'); renderLista(emAndamento, true, 'Mesa limpa.'); });
                document.getElementById('tab-enviados')?.addEventListener('click',   () => { resetTabs(); document.getElementById('tab-enviados').classList.add('bg-blue-600','text-white','shadow-md','border-transparent','mode-btn-active'); renderLista(enviados, true, 'Nada no Defensor.'); });
                document.getElementById('tab-finalizados')?.addEventListener('click',() => { resetTabs(); document.getElementById('tab-finalizados').classList.add('bg-emerald-600','text-white','shadow-md','border-transparent','mode-btn-active'); renderLista(finalizados, true, 'Nada finalizado.'); });
                document.getElementById('tab-historico-busca')?.addEventListener('click', () => {
                    resetTabs(); wrapperBusca?.classList.remove('hidden'); document.getElementById('tab-historico-busca').classList.add('bg-blue-600','text-white','shadow-md','border-transparent','mode-btn-active');
                    renderLista(historico, true, 'Sem histórico.');
                    document.getElementById('input-busca-local')?.addEventListener('input', e => {
                        const t = e.target.value.toLowerCase();
                        renderLista(historico.filter(i => (i.name||'').toLowerCase().includes(t) || (i.subject||'').toLowerCase().includes(t) || (i.numeroProcesso||'').includes(t)), true, 'Nada encontrado.');
                    });
                });

                renderLista(emAndamento, true, 'Mesa limpa.');
            }
        }
    },

    renderizarInterface(assistido, pautaData) {
        if (this.unsubscribeDashboard) {
            this.unsubscribeDashboard();
            this.unsubscribeDashboard = null;
        }

        const url = new URL(window.location.href);
        url.searchParams.delete('view');
        url.searchParams.delete('modo');
        window.history.pushState({}, '', url);

        const headerBg = document.getElementById('header-bg');
        if (headerBg && !document.getElementById('logo-header-main')) {
            const textosWrapper = document.createElement('div');
            textosWrapper.className = "flex flex-col overflow-hidden min-w-0";
            
            const nameEl = document.getElementById('assistido-nome');
            const assuntoEl = document.getElementById('assistido-assunto');
            if(nameEl) textosWrapper.appendChild(nameEl);
            if(assuntoEl) textosWrapper.appendChild(assuntoEl);
            
            headerBg.className = 'bg-slate-800 p-6 sm:p-8 rounded-t-2xl shadow-xl flex items-center justify-between relative overflow-hidden transition-colors duration-500 shrink-0';
            headerBg.innerHTML = `
                <div class="absolute top-0 right-0 w-64 h-64 bg-blue-500 opacity-10 rounded-full blur-3xl -mr-10 -mt-20 pointer-events-none"></div>
                <div class="flex items-center gap-4 relative z-10 min-w-0 w-full">
                    <button id="btn-voltar-dashboard-individual" class="shrink-0 bg-white/10 hover:bg-white/20 text-white p-2.5 rounded-xl transition-colors border border-white/20 shadow-inner" title="Voltar ao Painel">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
                    </button>
                    <div id="textos-container-header" class="min-w-0 flex-1"></div>
                </div>
            `;
            document.getElementById('textos-container-header').appendChild(textosWrapper);
            
            document.getElementById('btn-voltar-dashboard-individual').onclick = () => {
                const urlAtual = new URL(window.location.href);
                urlAtual.searchParams.delete('assistidoId');
                urlAtual.searchParams.delete('aid');
                window.location.href = urlAtual.toString();
            };
        }

        const nameEl = document.getElementById('assistido-nome');
        const assuntoEl = document.getElementById('assistido-assunto');
        if (nameEl) nameEl.textContent = assistido.name || 'Nome não informado';
        if (assuntoEl) assuntoEl.textContent = assistido.subject || 'Assunto não informado';
        
        const areaColaborador = document.getElementById('area-colaborador');
        if (areaColaborador) areaColaborador.classList.remove('hidden');

        document.getElementById('banner-transferencia')?.remove();
        document.getElementById('banner-atendido-trava')?.remove();
        document.getElementById('btn-marcar-livre')?.remove();

        if (assistido.historicoTransferencia && areaColaborador) {
            const bannerHtml = `
                <div id="banner-transferencia" class="w-full bg-blue-50 border border-blue-200 p-5 rounded-2xl shadow-sm mb-6 flex items-start gap-4 relative overflow-hidden animate-fade-in">
                    <div class="absolute left-0 top-0 bottom-0 w-1.5 bg-blue-500"></div>
                    <div class="bg-blue-100 p-2 rounded-lg shrink-0 text-blue-600 shadow-sm">${ico('refresh', 'w-5 h-5')}</div>
                    <div class="min-w-0">
                        <p class="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-1">Última Movimentação</p>
                        <p class="text-xs font-semibold leading-relaxed text-slate-700">${escapeHTML(assistido.historicoTransferencia)}</p>
                    </div>
                </div>
            `;
            areaColaborador.insertAdjacentHTML('afterbegin', bannerHtml);
        }

        this.renderHistorico(assistido);

        // FASE 3: TRAVA DE PAUTA ENCERRADA NA TELA INDIVIDUAL
        if (this.pautaFechada) {
            const abaEncerramento = document.getElementById('aba-encerramento');
            if (abaEncerramento) {
                abaEncerramento.innerHTML = `
                    <div id="banner-atendido-trava" class="text-center p-8 bg-amber-50 rounded-2xl border border-amber-200 shadow-sm animate-fade-in mt-4 mb-6">
                        <div class="w-16 h-16 bg-amber-500 rounded-full flex items-center justify-center text-white mx-auto shadow-sm mb-4">${ico('alertCircle', 'w-8 h-8')}</div>
                        <h2 class="text-xl font-black text-amber-800 uppercase tracking-wider mb-2">Pauta Encerrada</h2>
                        <p class="text-sm font-medium text-amber-700">Não é possível executar novas ações, transferências ou conclusão neste atendimento.</p>
                    </div>
                `;
            }
            if (headerBg) headerBg.className = 'bg-amber-600 p-6 sm:p-8 rounded-t-2xl shadow-lg flex items-center gap-4 relative overflow-hidden transition-colors duration-500 shrink-0';
            return;
        }

        if (assistido.status === 'atendido' || assistido.status === 'aguardandoNumero') {
            const abaEncerramento = document.getElementById('aba-encerramento');
            if (abaEncerramento) {
                abaEncerramento.innerHTML = `
                    <div id="banner-atendido-trava" class="text-center p-8 bg-emerald-50 rounded-2xl border border-emerald-200 shadow-sm animate-fade-in mt-4 mb-6">
                        <div class="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center text-white mx-auto shadow-sm mb-4">${ico('check', 'w-8 h-8')}</div>
                        <h2 class="text-xl font-black text-emerald-800 uppercase tracking-wider mb-2">Protocolo Finalizado</h2>
                        <p class="text-sm font-medium text-emerald-700">Este atendimento já foi concluído e salvo no banco de dados.</p>
                    </div>

                    <button id="btn-marcar-livre" class="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-4 rounded-xl shadow-md transition-all text-sm uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95">
                        Voltar para a Mesa
                    </button>
                `;

                setTimeout(() => {
                    document.getElementById('btn-marcar-livre').onclick = () => {
                        document.getElementById('btn-voltar-dashboard-individual')?.click();
                    };
                }, 100);
            }
            if (headerBg) headerBg.className = 'bg-emerald-600 p-6 sm:p-8 rounded-t-2xl shadow-lg flex items-center gap-4 relative overflow-hidden transition-colors duration-500 shrink-0';
        } else {
            this.renderizarAbaEncerramentoDinamica(assistido, pautaData);
        }
    },

    renderizarAbaEncerramentoDinamica(assistido, pautaData) {
        const aba = document.getElementById('aba-encerramento');
        if (!aba) return;

        const isDefensor = this.colaboradorAtual?.cargo?.toLowerCase().includes('defensor');
        const showDistribuicao = pautaData.useDistributionFlow && !isDefensor;

        let optionsHtml = ``;

        if (isDefensor) {
            const linkManualVerde = assistido.linkVerdeManualmente || assistido.linkVerde || `https://verde.defensoria.rj.def.br/#/atendimento/pesquisa?termo=${encodeURIComponent(assistido.numeroProcesso || assistido.name)}`;
            const cnpManual = assistido.numeroProcesso || null;

            optionsHtml += `
                <div class="bg-slate-50 p-5 rounded-2xl border border-slate-200 shadow-sm mb-6 animate-fade-in flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div class="min-w-0 flex-1">
                        <h4 class="text-[11px] font-black uppercase text-emerald-600 tracking-widest mb-1 flex items-center gap-1.5">${ico('link', 'w-3.5 h-3.5')} Acesso ao Verde (Manual)</h4>
                        <p class="text-xs font-medium text-slate-500 truncate mt-1">Abra o sistema Verde para conferir a petição:</p>
                        ${cnpManual ? `<span class="inline-block mt-2 font-mono font-bold text-[11px] bg-white border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg shadow-sm">Nº CNP: ${escapeHTML(cnpManual)}</span>` : '<span class="inline-block mt-2 text-[10px] bg-amber-50 text-amber-700 font-bold px-3 py-1.5 rounded-lg border border-amber-200 uppercase tracking-wider">Sem CNP Cadastrado</span>'}
                    </div>
                    <div class="flex gap-2 w-full sm:w-auto shrink-0 mt-3 sm:mt-0">
                        ${cnpManual ? `
                        <button type="button" onclick="navigator.clipboard.writeText('${cnpManual}'); alert('Nº CNP copiado com sucesso!');" class="flex-1 sm:flex-none bg-white hover:bg-slate-100 text-slate-700 font-bold py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider transition-colors border border-slate-300 shadow-sm active:scale-95">
                            Copiar CNP
                        </button>` : ''}
                        <a href="${linkManualVerde}" target="_blank" class="text-center flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-5 rounded-xl text-xs uppercase tracking-widest transition-colors shadow-sm active:scale-95 flex items-center justify-center gap-1.5">
                            Verde &nearr;
                        </a>
                    </div>
                </div>
            `;
        }

        optionsHtml += `<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">`;
        const textoConcluir = isDefensor ? "Concluir / Assinar" : "Finalizar Protocolo";

        optionsHtml += `
            <button id="btn-opt-direto" class="fluxo-opt-btn bg-white border border-slate-200 p-5 rounded-2xl text-left transition-all hover:shadow-md hover:border-emerald-300 group">
                <span class="block text-2xl mb-2 text-emerald-600 group-hover:scale-110 transition-transform origin-left">${ico('checkCircle', 'w-8 h-8')}</span>
                <span class="block font-black text-slate-800 text-sm">${textoConcluir}</span>
                <span class="block text-[10px] text-slate-500 mt-1 uppercase tracking-wider font-medium">Encerrar atendimento</span>
            </button>
        `;

        if (showDistribuicao) {
            optionsHtml += `
                <button id="btn-opt-dist" class="fluxo-opt-btn bg-white border border-slate-200 p-5 rounded-2xl text-left transition-all hover:shadow-md hover:border-blue-300 group">
                    <span class="block text-2xl mb-2 text-blue-600 group-hover:scale-110 transition-transform origin-left">${ico('send', 'w-8 h-8')}</span>
                    <span class="block font-black text-slate-800 text-sm">Enviar ao Defensor</span>
                    <span class="block text-[10px] text-slate-500 mt-1 uppercase tracking-wider font-medium">Encaminhar p/ assinatura</span>
                </button>
                <button id="btn-opt-correcao" class="fluxo-opt-btn bg-white border border-slate-200 p-5 rounded-2xl text-left transition-all hover:shadow-md hover:border-amber-300 group">
                    <span class="block text-2xl mb-2 text-amber-600 group-hover:scale-110 transition-transform origin-left">${ico('helpCircle', 'w-8 h-8')}</span>
                    <span class="block font-black text-slate-800 text-sm">Pedir Avaliação</span>
                    <span class="block text-[10px] text-slate-500 mt-1 uppercase tracking-wider font-medium">Dúvidas ou revisão</span>
                </button>
            `;
        }

        if (isDefensor) {
            optionsHtml += `
                <button id="btn-opt-devolver" class="fluxo-opt-btn bg-white border border-slate-200 p-5 rounded-2xl text-left transition-all hover:shadow-md hover:border-orange-300 group">
                    <span class="block text-2xl mb-2 text-orange-600 group-hover:scale-110 transition-transform origin-left">${ico('arrowLeft', 'w-8 h-8')}</span>
                    <span class="block font-black text-slate-800 text-sm">Devolver (Erro)</span>
                    <span class="block text-[10px] text-slate-500 mt-1 uppercase tracking-wider font-medium">Retornar ao servidor</span>
                </button>
            `;
        }

        optionsHtml += `
            <button id="btn-opt-transferir" class="fluxo-opt-btn bg-white border border-slate-200 p-5 rounded-2xl text-left transition-all hover:shadow-md hover:border-indigo-300 group">
                <span class="block text-2xl mb-2 text-indigo-600 group-hover:scale-110 transition-transform origin-left">${ico('refresh', 'w-8 h-8')}</span>
                <span class="block font-black text-slate-800 text-sm">Transferir Caso</span>
                <span class="block text-[10px] text-slate-500 mt-1 uppercase tracking-wider font-medium">Passar a vez p/ colega</span>
            </button>
            <button id="btn-opt-pausar" class="fluxo-opt-btn bg-white border border-slate-200 p-5 rounded-2xl text-left transition-all hover:shadow-md hover:border-slate-400 group">
                <span class="block text-2xl mb-2 text-slate-600 group-hover:scale-110 transition-transform origin-left">${ico('pause', 'w-8 h-8')}</span>
                <span class="block font-black text-slate-800 text-sm">Pausar</span>
                <span class="block text-[10px] text-slate-500 mt-1 uppercase tracking-wider font-medium">Voltar para Fila Geral</span>
            </button>
        </div>`;

        optionsHtml += `
            <div id="secao-demandas-adicionais-externo" class="bg-indigo-50 p-6 rounded-2xl border border-indigo-100 mb-6 shadow-sm">
                <label class="block text-xs font-black text-indigo-800 uppercase tracking-widest mb-3 flex items-center gap-1.5"><span>${ico('clipboard', 'w-4 h-4')}</span> Acumular Demandas Resolvidas</label>
                <div class="flex gap-2 mb-4">
                    <input type="text" id="input-nova-demanda-externo" class="flex-grow p-3 border border-indigo-200 rounded-xl text-sm outline-none bg-white focus:ring-2 focus:ring-indigo-500 font-medium" placeholder="Ex: Regulamentação de Guarda, Alimentos...">
                    <button type="button" id="btn-add-demanda-externo" class="bg-indigo-600 text-white font-bold px-5 py-3 rounded-xl text-xs hover:bg-indigo-700 transition-colors shadow-sm uppercase tracking-wider shrink-0">Adicionar</button>
                </div>
                <div id="container-lista-demandas-externo" class="space-y-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar"></div>
            </div>

            <div id="config-numero-processo" class="bg-white p-6 rounded-2xl border border-slate-200 mb-6 transition-all shadow-sm space-y-5">
                <div>
                    <label class="block text-xs font-black text-slate-600 uppercase tracking-widest mb-2 flex items-center gap-1.5"><span>${ico('fileText', 'w-4 h-4')}</span> Nº Processo / Protocolo CNP (Opcional)</label>
                    <input type="text" id="input-numero-caso" value="${assistido.numeroProcesso || ''}" class="w-full p-3.5 border border-slate-300 rounded-xl text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none transition-colors font-mono placeholder:font-sans" placeholder="Ex: 1045239">
                </div>
                <div>
                    <label class="block text-xs font-black text-slate-600 uppercase tracking-widest mb-2 flex items-center gap-1.5"><span>${ico('link', 'w-4 h-4')}</span> Link Direto (Opcional)</label>
                    <input type="url" id="input-link-verde-manual" value="${assistido.linkVerdeManualmente || ''}" class="w-full p-3.5 border border-slate-300 rounded-xl text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-colors text-blue-600 underline" placeholder="https://verde.defensoria.rj.def.br/...">
                </div>
            </div>

            <div id="config-distribuicao" class="hidden bg-blue-50 p-6 rounded-2xl border border-blue-100 mb-6 shadow-sm">
                <label class="block text-xs font-black text-blue-800 uppercase tracking-widest mb-2">Defensor(a) de Destino</label>
                <select id="select-defensor-distribuicao" class="w-full p-3.5 border border-blue-200 rounded-xl text-sm bg-white mb-5 outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700 cursor-pointer"></select>
                <label class="block text-xs font-black text-blue-800 uppercase tracking-widest mb-2">Nota Interna (Opcional)</label>
                <textarea id="notas-distribuicao-dinamico" rows="3" class="w-full p-3.5 border border-blue-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500 resize-none font-medium" placeholder="Ex: Petição inicial concluída e anexada no Verde."></textarea>
            </div>

            <div id="config-correcao" class="hidden bg-amber-50 p-6 rounded-2xl border border-amber-100 mb-6 shadow-sm">
                <label class="block text-xs font-black text-amber-800 uppercase tracking-widest mb-2">Defensor(a) Avaliador</label>
                <select id="select-defensor-correcao" class="w-full p-3.5 border border-amber-200 rounded-xl text-sm bg-white mb-5 outline-none focus:ring-2 focus:ring-amber-500 font-bold text-slate-700 cursor-pointer"></select>
                <label class="block text-xs font-black text-amber-800 uppercase tracking-widest mb-2">Qual a dúvida?</label>
                <textarea id="notas-correcao-dinamico" rows="3" class="w-full p-3.5 border border-amber-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-amber-500 resize-none font-medium" placeholder="Ex: Favor conferir se cabe pedido de liminar..."></textarea>
            </div>

            <div id="config-devolver" class="hidden bg-orange-50 p-6 rounded-2xl border border-orange-100 mb-6 shadow-sm">
                <label class="block text-xs font-black text-orange-800 uppercase tracking-widest mb-2">Devolver para</label>
                <select id="select-servidor-devolver" class="w-full p-3.5 border border-orange-200 rounded-xl text-sm bg-white mb-5 outline-none focus:ring-2 focus:ring-orange-500 font-bold text-slate-700 cursor-pointer"></select>
                <label class="block text-xs font-black text-orange-800 uppercase tracking-widest mb-2">Motivo / Correção Exigida</label>
                <textarea id="notas-devolver-dinamico" rows="3" class="w-full p-3.5 border border-orange-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-orange-500 resize-none font-medium" placeholder="Ex: Faltou qualificar a testemunha. Favor corrigir."></textarea>
            </div>

            <div id="config-transferencia" class="hidden bg-indigo-50 p-6 rounded-2xl border border-indigo-100 mb-6 shadow-sm">
                <label class="block text-xs font-black text-indigo-800 uppercase tracking-widest mb-2">Colega de Destino</label>
                <select id="select-transferir-colega" class="w-full p-3.5 border border-indigo-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-700 cursor-pointer"></select>
            </div>

            <button id="btn-finalizar-dinamico" class="w-full bg-slate-800 hover:bg-slate-900 text-white font-black py-4 rounded-xl shadow-md hover:shadow-lg transition-all text-sm uppercase tracking-widest active:scale-95 flex justify-center items-center gap-2">
                EXECUTAR AÇÃO ${ico('arrowRight', 'w-4 h-4')}
            </button>
        `;

        aba.innerHTML = optionsHtml;
        this.povoarSelectsDinamicos();
        this.atualizarListaDemandasInterfaceExterna();

        this.fluxoSelecionado = 'direto';
        const botoesFluxo = document.querySelectorAll('.fluxo-opt-btn');
        const configBoxes = {
            'direto': document.getElementById('config-numero-processo'),
            'distribuicao': document.getElementById('config-distribuicao'),
            'correcao': document.getElementById('config-correcao'),
            'devolver': document.getElementById('config-devolver'),
            'transferir': document.getElementById('config-transferencia'),
            'pausar': document.getElementById('config-numero-processo')
        };

        const setAtivo = (btnClicado, fluxo) => {
            this.fluxoSelecionado = fluxo;
            botoesFluxo.forEach(b => {
                b.className = 'fluxo-opt-btn bg-white border border-slate-200 p-5 rounded-2xl text-left transition-all hover:shadow-md group';
            });
            const coresAvas = {
                'direto': 'bg-emerald-50 border border-emerald-300 ring-2 ring-emerald-100 shadow-md',
                'distribuicao': 'bg-blue-50 border border-blue-300 ring-2 ring-blue-100 shadow-md',
                'correcao': 'bg-amber-50 border border-amber-300 ring-2 ring-amber-100 shadow-md',
                'devolver': 'bg-orange-50 border border-orange-300 ring-2 ring-orange-100 shadow-md',
                'transferir': 'bg-indigo-50 border border-indigo-300 ring-2 ring-indigo-100 shadow-md',
                'pausar': 'bg-slate-100 border border-slate-300 ring-2 ring-slate-200 shadow-md'
            };
            btnClicado.className = `fluxo-opt-btn ${coresAvas[fluxo]} p-5 rounded-2xl text-left transition-all group`;

            Object.keys(configBoxes).forEach(key => {
                if(configBoxes[key]) configBoxes[key].classList.add('hidden');
            });
            if(configBoxes[fluxo]) configBoxes[fluxo].classList.remove('hidden');
        };

        document.getElementById('btn-opt-direto')?.addEventListener('click', (e) => setAtivo(e.currentTarget, 'direto'));
        document.getElementById('btn-opt-dist')?.addEventListener('click', (e) => setAtivo(e.currentTarget, 'distribuicao'));
        document.getElementById('btn-opt-correcao')?.addEventListener('click', (e) => setAtivo(e.currentTarget, 'correcao'));
        document.getElementById('btn-opt-devolver')?.addEventListener('click', (e) => setAtivo(e.currentTarget, 'devolver'));
        document.getElementById('btn-opt-transferir')?.addEventListener('click', (e) => setAtivo(e.currentTarget, 'transferir'));
        document.getElementById('btn-opt-pausar')?.addEventListener('click', (e) => setAtivo(e.currentTarget, 'pausar'));

        // Ativa o primeiro por padrão com o estilo correto
        document.getElementById('btn-opt-direto')?.click();

        document.getElementById('btn-add-demanda-externo').onclick = () => this.adicionarNovaDemandaFluxoExterno();
        document.getElementById('btn-finalizar-dinamico').onclick = () => this.finalizarProcesso();
    },

    adicionarNovaDemandaFluxoExterno() {
        const input = document.getElementById('input-nova-demanda-externo');
        const text = input ? input.value.trim() : '';
        if (text) {
            this.demandasAdicionaisLocais.push(text);
            input.value = '';
            this.atualizarListaDemandasInterfaceExterna();
        }
    },

    removerDemandaFluxoExterno(index) {
        this.demandasAdicionaisLocais.splice(index, 1);
        this.atualizarListaDemandasInterfaceExterna();
    },

    atualizarListaDemandasInterfaceExterna() {
        const container = document.getElementById('container-lista-demandas-externo');
        if (!container) return;
        container.innerHTML = '';

        if (this.demandasAdicionaisLocais.length === 0) {
            container.innerHTML = `<p class="text-xs text-indigo-400 font-medium text-center py-4 bg-white/50 rounded-xl border border-dashed border-indigo-200">Nenhum caso extra somado.</p>`;
            return;
        }

        this.demandasAdicionaisLocais.forEach((dem, index) => {
            const div = document.createElement('div');
            div.className = "flex justify-between items-center bg-white border border-indigo-100 p-3 rounded-xl shadow-sm text-xs";
            div.innerHTML = `
                <span class="font-bold text-slate-700 flex items-center gap-2">${ico('scale', 'w-4 h-4 text-indigo-400')} ${escapeHTML(dem)}</span>
                <button type="button" class="text-[10px] font-bold text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors" data-index="${index}">Remover</button>
            `;
            div.querySelector('button').onclick = () => this.removerDemandaFluxoExterno(index);
            container.appendChild(div);
        });
    },

    povoarSelectsDinamicos() {
        const defensores = this.todosColaboradores.filter(c => c.cargo?.toLowerCase().includes('defensor'));
        const equipeTecnica = this.todosColaboradores.filter(c => !c.cargo?.toLowerCase().includes('defensor')); 
        const todosMenosEu = this.todosColaboradores.filter(c => c.nome !== this.colaboradorNome);

        const preencher = (idSelect, lista, defaultOpt, valueToSelect = null) => {
            const select = document.getElementById(idSelect);
            if (!select) return;
            select.innerHTML = `<option value="">${defaultOpt}</option>`;
            lista.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.nome;
                opt.textContent = `${c.nome} ${c.cargo ? '- '+c.cargo : ''}`;
                if (valueToSelect === c.nome) opt.selected = true;
                select.appendChild(opt);
            });
        };

        preencher('select-defensor-distribuicao', defensores, '--- SELECIONE ---');
        preencher('select-defensor-correcao', defensores, '--- SELECIONE ---');
        preencher('select-transferir-colega', todosMenosEu, '--- SELECIONE ---');
        
        const enviadoPorInicial = this.assistidoData?.enviadoPor || '';
        preencher('select-servidor-devolver', equipeTecnica, '--- SELECIONE ---', enviadoPorInicial);
    },

    async finalizarProcesso() {
        if (this.pautaFechada) {
            alert("Ação negada. A pauta foi fechada pelo administrador.");
            return;
        }

        if (!this.fluxoSelecionado || this.isProcessing) return;

        this.isProcessing = true;
        const btnFinalizar = document.getElementById('btn-finalizar-dinamico');
        btnFinalizar.disabled = true;
        btnFinalizar.innerHTML = '<span class="animate-pulse">PROCESSANDO...</span>';

        const inputNumeroCaso = document.getElementById('input-numero-caso');
        const numeroProcessoSalvo = inputNumeroCaso ? inputNumeroCaso.value.trim() : '';

        const inputLinkManual = document.getElementById('input-link-verde-manual');
        const linkManualSalvo = inputLinkManual ? inputLinkManual.value.trim() : '';

        const numProcessoSeguro = numeroProcessoSalvo || '';
        const colabSeguro = this.colaboradorNome || 'Sistema'; 
        const pautaIdSeguro = this.pautaId || '';
        const assistidoIdSeguro = this.assistidoId || '';

        let tituloSucesso = "Atendimento Atualizado!";
        let subtituloSucesso = "Ação registrada com sucesso.";
        
        let colaboradorDestinoObj = null;

        const objetoDemandasFinal = {
            quantidade: this.demandasAdicionaisLocais.length,
            descricoes: this.demandasAdicionaisLocais
        };

        try {
            const pautaDoc = await getDoc(doc(db, "pautas", pautaIdSeguro));
            const pautaConfigAtiva = pautaDoc.exists() ? pautaDoc.data() : { useDistributionFlow: false };
            const temDistribuicaoAtiva = pautaConfigAtiva.useDistributionFlow === true;

            const docRef = doc(db, "pautas", pautaIdSeguro, "attendances", assistidoIdSeguro);
            const novoToken = this._gerarTokenSeguro();
            const timestampIso = new Date().toISOString();

            const atualizacaoDeResponsavel = {
                assignedCollaborator: {
                    id: this.colaboradorId || this.colaboradorAtual?.id || '',
                    name: this.colaboradorNome
                }
            };

            if (this.fluxoSelecionado === 'direto') {
                const enviadoPorColaborador = this.assistidoData?.enviadoPor || null;
                
                const mapaProdutividadeBI = {};
                if (enviadoPorColaborador) {
                    mapaProdutividadeBI[enviadoPorColaborador] = 1; 
                }
                mapaProdutividadeBI[colabSeguro] = 1; 

                let statusDestinoFinal = 'aguardandoNumero';
                if (numProcessoSeguro || !temDistribuicaoAtiva) {
                    statusDestinoFinal = 'atendido';
                }

                await updateDoc(docRef, {
                    ...atualizacaoDeResponsavel,
                    status: statusDestinoFinal,
                    attendedBy: colabSeguro,                    
                    enviadoPor: enviadoPorColaborador,                
                    trabalhosPorUsuario: mapaProdutividadeBI,       
                    creatorEmail: enviadoPorColaborador ? null : (this.colaboradorAtual?.email || null), 
                    attendedAt: timestampIso,
                    finalizadoPeloColaborador: statusDestinoFinal === 'atendido',
                    numeroProcesso: numProcessoSeguro,
                    linkVerdeManualmente: linkManualSalvo || null,
                    demandas: objetoDemandasFinal, 
                    history: arrayUnion({
                        action: statusDestinoFinal === 'atendido' ? 'APROVADO_E_CONCLUIDO' : 'APROVADO_AGUARDANDO_NUMERO',
                        by: colabSeguro,
                        msg: numProcessoSeguro ? `Nº CNP: ${numProcessoSeguro}` : 'Aprovado e protocolado internamente',
                        at: timestampIso
                    })
                });

                tituloSucesso = "Atendimento Finalizado!";
                subtituloSucesso = statusDestinoFinal === 'atendido' ? "Processo concluído e salvo." : "Atendimento encerrado sem número de processo.";
            } 
            else if (this.fluxoSelecionado === 'distribuicao') {
                const def = document.getElementById('select-defensor-distribuicao')?.value || '';
                const nota = document.getElementById('notas-distribuicao-dinamico')?.value || '';
                if (!def) { 
                    alert("Obrigatório selecionar um Defensor."); 
                    this.isProcessing = false;
                    btnFinalizar.disabled = false; 
                    btnFinalizar.innerHTML = `EXECUTAR AÇÃO ${ico('arrowRight', 'w-4 h-4 inline-block')}`; 
                    return; 
                }
                
                colaboradorDestinoObj = this.todosColaboradores.find(c => c.nome === def);

                await updateDoc(docRef, {
                    ...atualizacaoDeResponsavel,
                    status: 'aguardandoDistribuicao',
                    defensorResponsavel: def,
                    notasRevisao: nota,
                    numeroProcesso: numProcessoSeguro,
                    linkVerdeManualmente: linkManualSalvo || null,
                    enviadoPor: colabSeguro, 
                    delegationToken: novoToken,
                    demandas: objetoDemandasFinal, 
                    history: arrayUnion({
                        action: 'ENVIADO_PARA_REVISAO',
                        by: colabSeguro,
                        msg: nota || `Enviado para assinatura do Defensor(a) ${def}`,
                        at: timestampIso
                    })
                });

                tituloSucesso = "Enviado à Distribuição!";
                subtituloSucesso = `O Defensor(a) ${def} já recebeu o documento.`;
            }
            else if (this.fluxoSelecionado === 'correcao') {
                const def = document.getElementById('select-defensor-correcao')?.value || '';
                const nota = document.getElementById('notas-correcao-dinamico')?.value || '';
                if (!def) { 
                    alert("Obrigatório selecionar um Defensor."); 
                    this.isProcessing = false;
                    btnFinalizar.disabled = false; 
                    btnFinalizar.innerHTML = `EXECUTAR AÇÃO ${ico('arrowRight', 'w-4 h-4 inline-block')}`; 
                    return; 
                }
                
                colaboradorDestinoObj = this.todosColaboradores.find(c => c.nome === def);

                await updateDoc(docRef, { 
                    ...atualizacaoDeResponsavel,
                    status: 'aguardandoCorrecao', 
                    defensorResponsavel: def, 
                    notasRevisao: nota, 
                    reviewMotivoDevolucao: nota,
                    enviadoPor: colabSeguro, 
                    delegationToken: novoToken,
                    demandas: objetoDemandasFinal,
                    history: arrayUnion({
                        action: 'ENVIADO_PARA_CORRECAO',
                        by: colabSeguro,
                        msg: nota || `Avaliação solicitada ao Defensor(a) ${def}`,
                        at: timestampIso
                    })
                });

                tituloSucesso = "Enviado p/ Avaliação!";
                subtituloSucesso = `O Defensor(a) ${def} avaliará a dúvida inserida.`;
            }
            else if (this.fluxoSelecionado === 'devolver') {
                const serv = document.getElementById('select-servidor-devolver')?.value || '';
                const nota = document.getElementById('notas-devolver-dinamico')?.value || '';
                if (!serv) { 
                    alert("Selecione o profissional de destino."); 
                    this.isProcessing = false;
                    btnFinalizar.disabled = false; 
                    btnFinalizar.innerHTML = `EXECUTAR AÇÃO ${ico('arrowRight', 'w-4 h-4 inline-block')}`; 
                    return; 
                }
                
                colaboradorDestinoObj = this.todosColaboradores.find(c => c.nome === serv);

                await updateDoc(docRef, {
                    status: 'emAtendimento', 
                    assignedCollaborator: { name: serv, email: colaboradorDestinoObj?.email || '' },
                    inAttendanceTime: timestampIso, 
                    delegationToken: novoToken,
                    historicoTransferencia: `Devolvido p/ Correção por ${colabSeguro}. Msg: ${nota}`,
                    demandas: objetoDemandasFinal,
                    history: arrayUnion({
                        action: 'DEVOLVIDO_COM_ERRO',
                        by: colabSeguro,
                        msg: nota || `Retornado para correção na mesa de ${serv}`,
                        at: timestampIso
                    })
                });

                tituloSucesso = "Processo Devolvido!";
                subtituloSucesso = `O colega ${serv} deve corrigir o documento.`;
            }
            else if (this.fluxoSelecionado === 'transferir') {
                const colega = document.getElementById('select-transferir-colega')?.value || '';
                if (!colega) { 
                    alert("Selecione um colega."); 
                    this.isProcessing = false;
                    btnFinalizar.disabled = false; 
                    btnFinalizar.innerHTML = `EXECUTAR AÇÃO ${ico('arrowRight', 'w-4 h-4 inline-block')}`; 
                    return; 
                }
                
                colaboradorDestinoObj = this.todosColaboradores.find(c => c.nome === colega);

                await updateDoc(docRef, {
                    status: 'emAtendimento', 
                    assignedCollaborator: { name: colega, email: colaboradorDestinoObj?.email || '' },
                    inAttendanceTime: timestampIso, 
                    delegationToken: novoToken,
                    historicoTransferencia: `Transferência de ${colabSeguro} para ${colega}.`,
                    demandas: objetoDemandasFinal,
                    history: arrayUnion({
                        action: 'TRANSFERENCIA_DE_CASO',
                        by: colabSeguro,
                        msg: `Caso repassado para a mesa do colega ${colega}`,
                        at: timestampIso
                    })
                });

                tituloSucesso = "Transferência Ativa!";
                subtituloSucesso = `Caso transferido com sucesso para ${colega}.`;
            } 
            else if (this.fluxoSelecionado === 'pausar') {
                await updateDoc(docRef, {
                    status: 'aguardando', 
                    assignedCollaborator: null,
                    delegatedBy: null,
                    delegatedAt: null,
                    inAttendanceTime: null,
                    distributionStatus: null,
                    demandas: objetoDemandasFinal,
                    history: arrayUnion({
                        action: 'ATENDIMENTO_PAUSADO',
                        by: colabSeguro,
                        msg: 'Atendimento pausado pelo colaborador. Retornado para a fila de Espera.',
                        at: timestampIso
                    })
                });

                tituloSucesso = "Pausa Registrada";
                subtituloSucesso = "O assistido foi mandado de volta à fila de espera.";
            }

            if (colaboradorDestinoObj && colaboradorDestinoObj.email) {
                if (typeof EmailService !== 'undefined' && EmailService.sendDelegationEmail) {
                    await EmailService.sendDelegationEmail(
                        colaboradorDestinoObj.email,
                        colaboradorDestinoObj.nome,
                        this.assistidoData?.name || "Assistido",
                        colabSeguro,
                        pautaIdSeguro,
                        assistidoIdSeguro,
                        novoToken
                    );
                }
            }

            if (typeof showNotification === 'function') {
                showNotification(tituloSucesso, "success");
            } else {
                alert(`${tituloSucesso}\n${subtituloSucesso}`);
            }
            
            document.getElementById('btn-voltar-dashboard-individual')?.click();

        } catch (error) {
            console.error("Erro no processamento:", error);
            alert(`Erro ao salvar no banco de dados. Motivo: ${error.message}`);
            if (btnFinalizar) {
                btnFinalizar.disabled = false;
                btnFinalizar.innerHTML = `EXECUTAR AÇÃO ${ico('arrowRight', 'w-4 h-4 inline-block')}`;
            }
        } finally {
            this.isProcessing = false; 
        }
    },

    renderHistorico(assistido) {
        const lista = document.getElementById('lista-historico');
        if (!lista) return;

        const temChecklist = assistido.documentChecklist && assistido.documentChecklist.action;
        
        if (!temChecklist) {
            lista.innerHTML = `<div class="text-center py-20 bg-white border border-slate-200 rounded-2xl shadow-sm"><span class="text-5xl block mb-4 text-slate-300">${ico('inbox', 'w-16 h-16 inline-block')}</span><p class="text-sm font-bold uppercase tracking-widest text-slate-500">Nenhum checklist registrado.</p></div>`;
            return;
        }

        const chk = assistido.documentChecklist;
        const baseDeDados = documentsData || window.documentsData || {};
        const actionData = baseDeDados[chk.action];
        const actionTitle = actionData ? actionData.title : chk.action.replace(/_/g, ' ').toUpperCase();
        
        let html = `
            <div class="bg-indigo-50 p-5 rounded-2xl mb-6 border border-indigo-200 shadow-sm relative overflow-hidden animate-fade-in">
                <div class="absolute top-0 left-0 w-1.5 h-full bg-indigo-500"></div>
                <p class="text-[10px] text-indigo-500 font-black uppercase tracking-widest mb-1.5 pl-1">Ação Selecionada na Recepção</p>
                <p class="text-lg font-black text-indigo-800 uppercase pl-1 leading-tight">${actionTitle}</p>
            </div>
        `;

        if (chk.socioData) {
            const s = chk.socioData;
            let temSocio = false;
            let socioHtml = '';
            
            if (s.ocupacao && s.ocupacao.trim() !== '' && s.ocupacao !== 'Selecione a ocupação') {
                socioHtml += `<div class="flex justify-between items-center py-2 border-b border-slate-100"><span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ocupação</span><span class="text-xs font-bold text-slate-700">${escapeHTML(s.ocupacao)}</span></div>`;
                temSocio = true;
            }
            if (s.profissao && s.profissao.trim() !== '') {
                socioHtml += `<div class="flex justify-between items-center py-2 border-b border-slate-100"><span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Profissão</span><span class="text-xs font-bold text-slate-700">${escapeHTML(s.profissao)}</span></div>`;
                temSocio = true;
            }
            if (s.estadoCivil && s.estadoCivil.trim() !== '' && s.estadoCivil !== 'Selecione') {
                socioHtml += `<div class="flex justify-between items-center py-2 border-b border-slate-100"><span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estado Civil</span><span class="text-xs font-bold text-slate-700">${escapeHTML(s.estadoCivil)}</span></div>`;
                temSocio = true;
            }
            if (s.ganhos && s.ganhos.trim() !== '' && s.ganhos !== 'R$ 0,00') {
                socioHtml += `<div class="flex justify-between items-center py-2 border-b border-slate-100"><span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Renda</span><span class="text-xs font-bold text-slate-700">${escapeHTML(s.ganhos)}</span></div>`;
                temSocio = true;
            }
            if (s.fonteRenda && s.fonteRenda.trim() !== '') {
                socioHtml += `<div class="flex justify-between items-center py-2 border-b border-slate-100"><span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fonte Renda</span><span class="text-xs font-bold text-slate-700">${escapeHTML(s.fonteRenda)}</span></div>`;
                temSocio = true;
            }
            
            if (temSocio) {
                html += `
                    <div class="bg-white p-5 rounded-2xl mb-6 border border-slate-200 shadow-sm animate-fade-in">
                        <h4 class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-1.5">
                            <span>${ico('clipboard', 'w-3.5 h-3.5')}</span> PERFIL SOCIOECONÔMICO
                        </h4>
                        <div class="space-y-1">
                            ${socioHtml}
                        </div>
                    </div>
                `;
            }
        }

        if (chk.checkedIds && chk.checkedIds.length > 0) {
            html += `<div class="bg-white p-5 rounded-2xl mb-6 border border-slate-200 shadow-sm animate-fade-in">
                     <h4 class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-1.5">${ico('fileText', 'w-3.5 h-3.5')} DOCUMENTOS EM POSSE</h4>
                     <ul class="space-y-2">`;
            
            chk.checkedIds.forEach(id => {
                if (id.startsWith('reu-') || id.startsWith('gasto-')) return;
                let docName = id.replace(/-/g, ' ').toUpperCase();
                if (actionData && id.startsWith('doc-')) {
                    const parts = id.split('-');
                    const dIdx = parseInt(parts.pop());
                    const sIdx = parseInt(parts.pop());
                    if (!isNaN(sIdx) && !isNaN(dIdx) && actionData.sections[sIdx]) {
                        const docObj = actionData.sections[sIdx].docs[dIdx];
                        if (docObj) docName = typeof docObj === 'string' ? docObj : docObj.text;
                    }
                }
                const tipo = chk.docTypes && chk.docTypes[id] ? chk.docTypes[id] : 'Físico';
                html += `
                    <li class="text-xs bg-slate-50 border border-slate-100 p-3.5 rounded-xl flex justify-between items-center shadow-sm">
                        <span class="font-bold text-slate-700 pr-2 flex items-center gap-2">${ico('checkCircle', 'w-4 h-4 text-emerald-500 shrink-0')} ${docName}</span> 
                        <span class="font-black text-[9px] uppercase tracking-widest ${tipo === 'Físico' ? 'text-amber-700 bg-amber-100 border-amber-200' : 'text-blue-700 bg-blue-100 border-blue-200'} px-2.5 py-1 rounded-lg border shrink-0">${tipo}</span>
                    </li>
                `;
            });
            html += `</ul></div>`;
        }

        if (assistido.demandas && assistido.demandas.descricoes && assistido.demandas.descricoes.length > 0) {
            html += `
                <div class="bg-violet-50 p-5 rounded-2xl mb-6 border border-violet-200 shadow-sm animate-fade-in">
                    <h4 class="text-[10px] font-black text-violet-800 uppercase tracking-widest mb-4 flex items-center gap-1.5">
                        <span>${ico('scale', 'w-3.5 h-3.5')}</span> DEMANDAS ACUMULADAS
                    </h4>
                    <ul class="space-y-2">
                        ${assistido.demandas.descricoes.map(dem => `<li class="text-xs bg-white p-3 rounded-xl border border-violet-100 shadow-sm flex items-center gap-2 font-medium text-slate-700"><span class="text-violet-500 font-black">•</span> ${escapeHTML(dem)}</li>`).join('')}
                    </ul>
                </div>
            `;
        }

        if (chk.expenseData && chk.expenseData.checkExibirGastos) {
            const g = chk.expenseData;
            const categorias = [
                { id: 'moradia', label: 'Moradia' }, { id: 'alimentacao', label: 'Alimentação' },
                { id: 'educacao', label: 'Educação' }, { id: 'saude', label: 'Saúde' },
                { id: 'vestuario', label: 'Vestuário' }, { id: 'lazer', label: 'Lazer' },
                { id: 'outras', label: 'Outras' }
            ];

            let totalGastos = 0;
            let gastosHtml = '';
            
            categorias.forEach(c => {
                if (g[c.id] && g[c.id] !== 'R$ 0,00') {
                    gastosHtml += `<div class="flex justify-between items-center text-xs py-2 border-b border-emerald-100/50"><span class="text-emerald-800 font-bold uppercase tracking-wider">${c.label}</span><span class="font-black text-emerald-900 bg-white px-2 py-0.5 rounded shadow-sm border border-emerald-100">${g[c.id]}</span></div>`;
                    const num = parseFloat(String(g[c.id]).replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
                    totalGastos += num;
                }
            });

            if (totalGastos > 0) {
                const totalFormatado = totalGastos.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                
                html += `
                    <div class="bg-emerald-50 p-5 rounded-2xl mb-6 border border-emerald-200 shadow-sm animate-fade-in">
                        <h4 class="text-[10px] font-black text-emerald-800 uppercase tracking-widest mb-4 flex items-center gap-1.5">
                            <span>${ico('coins', 'w-3.5 h-3.5')}</span> PLANILHA DE GASTOS
                        </h4>
                        <div class="space-y-1 mb-4">
                            ${gastosHtml}
                        </div>
                        <div class="flex justify-between font-black text-emerald-950 border-t-2 border-emerald-200 pt-4 mt-2 text-sm items-center">
                            <span class="uppercase tracking-widest">TOTAL DE GASTOS</span>
                            <span class="bg-white px-3 py-1 rounded-lg shadow-sm border border-emerald-300 text-lg">${totalFormatado}</span>
                        </div>
                        
                        <button id="btn-baixar-planilha" class="mt-5 w-full bg-white border border-emerald-300 text-emerald-700 font-black py-3 rounded-xl text-xs hover:bg-emerald-100 hover:border-emerald-400 transition-colors shadow-sm flex items-center justify-center gap-2 uppercase tracking-widest active:scale-95">
                            <span>${ico('fileText', 'w-4 h-4')}</span> Baixar Planilha PDF
                        </button>
                    </div>
                `;
            }
        }

        if (chk.reuData && chk.reuData.checkReuUnico) {
            const reu = chk.reuData;
            html += `
                <div class="bg-rose-50 p-5 rounded-2xl mb-6 border border-rose-200 shadow-sm animate-fade-in">
                    <h4 class="text-[10px] font-black text-rose-800 uppercase tracking-widest mb-4 flex items-center gap-1.5"><span>${ico('user', 'w-3.5 h-3.5')}</span> DADOS DO PÓLO PASSIVO (RÉU)</h4>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6 text-xs text-slate-700 bg-white p-4 rounded-xl border border-rose-100 shadow-sm">
                        ${reu.nome ? `<p><b class="text-rose-900 font-black block mb-1">Nome Completo:</b> ${reu.nome}</p>` : ''}
                        ${reu.cpf ? `<p><b class="text-rose-900 font-black block mb-1">CPF:</b> ${reu.cpf}</p>` : ''}
                        ${reu.telefone ? `<p><b class="text-rose-900 font-black block mb-1">Telefone:</b> ${reu.telefone}</p>` : ''}
                        ${reu.cep ? `<p class="sm:col-span-2 pt-3 border-t border-rose-100"><b class="text-rose-900 font-black block mb-1.5">Endereço Residencial:</b> ${reu.rua}, ${reu.numero} ${reu.complemento ? ' - '+reu.complemento : ''} - ${reu.bairro}, ${reu.cidade}/${reu.uf} (CEP: ${reu.cep})</p>` : ''}
                        ${reu.empresa ? `<p class="sm:col-span-2 pt-3 border-t border-rose-100"><b class="text-rose-900 font-black block mb-1.5">Endereço de Trabalho:</b> ${reu.empresa} - ${reu.rua_comercial}, ${reu.numero_comercial} - ${reu.cidade_comercial}/${reu.uf_comercial}</p>` : ''}
                    </div>
                </div>
            `;
        }

        lista.innerHTML = html;
        
        setTimeout(() => {
            const btnBaixarPlanilha = document.getElementById('btn-baixar-planilha');
            if (btnBaixarPlanilha && assistido && assistido.documentChecklist?.expenseData) {
                btnBaixarPlanilha.onclick = () => {
                    if (window.PDFService && typeof window.PDFService.generatePlanilhaGastosPDF === 'function') {
                        window.PDFService.generatePlanilhaGastosPDF(assistido.name || 'Assistido', assistido.documentChecklist.expenseData);
                    } else {
                        alert("Erro: Módulo de PDF não carregado.");
                    }
                };
            }
        }, 300);
    },

    setupListeners() {
        document.getElementById('tab-btn-encerramento')?.addEventListener('click', () => this.switchTab('encerramento'));
        document.getElementById('tab-btn-historico')?.addEventListener('click', () => this.switchTab('historico'));
    },

    switchTab(tab) {
        const btnEncerramento = document.getElementById('tab-btn-encerramento');
        const btnHistorico = document.getElementById('tab-btn-historico');
        const abaEncerramento = document.getElementById('aba-encerramento');
        const abaHistorico = document.getElementById('aba-historico');

        if (tab === 'encerramento') {
            btnEncerramento.className = "flex-1 py-3.5 text-center font-black text-[11px] uppercase tracking-widest text-slate-800 border-b-2 border-slate-800 transition-colors";
            btnHistorico.className = "flex-1 py-3.5 text-center font-bold text-[11px] uppercase tracking-widest text-slate-400 border-b-2 border-transparent hover:text-slate-600 transition-colors";
            abaEncerramento.classList.remove('hidden');
            abaHistorico.classList.add('hidden');
        } else {
            btnHistorico.className = "flex-1 py-3.5 text-center font-black text-[11px] uppercase tracking-widest text-indigo-600 border-b-2 border-indigo-600 transition-colors";
            btnEncerramento.className = "flex-1 py-3.5 text-center font-bold text-[11px] uppercase tracking-widest text-slate-400 border-b-2 border-transparent hover:text-slate-600 transition-colors";
            abaHistorico.classList.remove('hidden');
            abaEncerramento.classList.add('hidden');
        }
    }
};

export default AtendimentoExternoService;
window.AtendimentoExternoService = AtendimentoExternoService;