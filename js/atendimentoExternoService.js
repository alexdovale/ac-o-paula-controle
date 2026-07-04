
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    getFirestore, doc, getDoc, updateDoc, collection,
    getDocs, query, arrayUnion, onSnapshot
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { firebaseConfig } from './config.js';
import { documentsData } from './detalhes.js';
import { PDFService } from './pdfService.js';
import { EmailService } from './emailService.js';
import { showNotification, playSound, escapeHTML } from './utils.js';

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const statusMap = {
    pauta:                  { cor: 'bg-slate-100 text-slate-600 border-slate-200',    txt: 'Na Pauta' },
    aguardando:             { cor: 'bg-amber-100 text-amber-700 border-amber-200',    txt: 'Aguardando' },
    emAtendimento:          { cor: 'bg-blue-100 text-blue-700 border-blue-200',       txt: 'Em Atendimento' },
    aguardandoDistribuicao: { cor: 'bg-cyan-100 text-cyan-700 border-cyan-200',       txt: 'Com Defensor' },
    aguardandoCorrecao:     { cor: 'bg-orange-100 text-orange-700 border-orange-200', txt: 'Avaliação' },
    atendido:               { cor: 'bg-green-100 text-green-700 border-green-200',    txt: 'Atendido' },
    aguardandoNumero:       { cor: 'bg-amber-100 text-amber-700 border-amber-200',    txt: 'Aguard. CNP' },
    faltoso:                { cor: 'bg-red-100 text-red-700 border-red-200',          txt: 'Faltoso' },
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
    unsubscribesPautasExtras: [],   // listeners das outras pautas do colaborador
    abaAtual: 'minha-mesa',         // 'minha-mesa' | 'sem-atribuicao' | 'pauta-dia'
    modoVisualizacao: 'dashboard',  // 'dashboard' | 'abas'
    pautasDoDia: [],                // todas as pautas do colaborador hoje
    atendimentosPorPauta: {},       // { [pautaId]: [assistidos] } para a aba Pauta do Dia

    // ─── INIT ─────────────────────────────────────────────────────────────────

    async init() {
        console.log("⚡ Atendimento Externo Inicializado (SIGEP Unificado)");

        const searchLimpa = window.location.search.replace(/&amp;/g, '&');
        const urlParams = new URLSearchParams(searchLimpa);

        this.pautaId        = urlParams.get('pautaId')   || urlParams.get('amp;pautaId');
        this.assistidoId    = urlParams.get('assistidoId') || urlParams.get('amp;assistidoId');
        this.colaboradorNome = urlParams.get('colab')    || urlParams.get('amp;colab');
        this.colaboradorId  = urlParams.get('colabId')   || urlParams.get('amp;colabId') || '';
        const tokenRecebido = urlParams.get('token')     || urlParams.get('amp;token');
        const telaAtual     = urlParams.get('view')      || urlParams.get('amp;view');
        const modo          = urlParams.get('modo')      || urlParams.get('amp;modo');

        this.modoVisualizacao = (modo === 'abas') ? 'abas' : 'dashboard';

        if (!this.pautaId || !this.colaboradorNome) {
            this.showError("Link Incompleto", "Faltam parâmetros de Pauta ou Colaborador na URL.");
            return;
        }

        try {
            if (!auth.currentUser) await signInAnonymously(auth);

            await this.carregarColaboradoresGerais();

            if (!this.colaboradorAtual) {
                this.showError("Acesso Negado", "Seu nome não foi encontrado na lista de colaboradores desta pauta.");
                return;
            }

            // Atendimento individual (peça específica)
            if (this.assistidoId && !telaAtual) {
                await this.iniciarAtendimentoIndividual(tokenRecebido);
                return;
            }

            // Verificar sessão
            const sessionKey = `sigep_session_${this.pautaId}_${this.colaboradorNome}`;
            const temSessao = sessionStorage.getItem(sessionKey) || localStorage.getItem(sessionKey);

            if (!temSessao && this.modoVisualizacao === 'dashboard') {
                this.renderizarTelaLoginColaborador();
                return;
            }

            await this.iniciarDashboardUnificado();

        } catch (error) {
            console.error("Erro na inicialização:", error);
            this.showError("Conexão Perdida", "Falha ao conectar com o banco de dados.");
        }
    },

    // ─── ATENDIMENTO INDIVIDUAL ───────────────────────────────────────────────

    async iniciarAtendimentoIndividual(tokenRecebido) {
        const pautaDoc = await getDoc(doc(db, "pautas", this.pautaId));
        if (!pautaDoc.exists()) {
            this.showError("Pauta não localizada", "A pauta informada não existe mais no sistema.");
            return;
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

        this.renderizarInterface(assistido, pautaDoc.data());
        this.setupListeners();
        this.atualizarIndicadorDeStatus(pautaDoc.data(), this.colaboradorAtual?.status, this.colaboradorNome);
    },

    // ─── DASHBOARD UNIFICADO ──────────────────────────────────────────────────

    async iniciarDashboardUnificado() {
        this._cancelarListeners();
        this.setupRealtimeListenerPauta();
        this.renderizarContainerDashboard();

        if (this.modoVisualizacao === 'abas') {
            this.setupAbasNavegacao();
            // Pré-carrega pautas do dia para a aba "Pauta do Dia"
            this._carregarTodasPautasDoColaborador();
        } else {
            this.atualizarListasDoDashboard();
        }
    },

    _cancelarListeners() {
        if (this.unsubscribeDashboard) { this.unsubscribeDashboard(); this.unsubscribeDashboard = null; }
        this.unsubscribesPautasExtras.forEach(u => u && u());
        this.unsubscribesPautasExtras = [];
    },

    setupRealtimeListenerPauta() {
        this._cancelarListeners();
        this.unsubscribeDashboard = onSnapshot(
            collection(db, "pautas", this.pautaId, "attendances"),
            (snap) => {
                this.todosAtendimentosPauta = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                this.atendimentosPorPauta[this.pautaId] = this.todosAtendimentosPauta;
                if (this.modoVisualizacao === 'abas') {
                    this.renderizarAbaAtual();
                } else {
                    this.atualizarListasDoDashboard();
                }
            },
            (error) => console.error("Erro no realtime:", error)
        );
    },

    // ─── CARREGAR TODAS AS PAUTAS DO COLABORADOR HOJE ─────────────────────────
    // MELHORIA 3: busca não só a pauta atual, mas todas onde o colaborador está

    async _carregarTodasPautasDoColaborador() {
        const hoje = new Date().toISOString().split('T')[0];

        try {
            const pautasSnap = await getDocs(collection(db, "pautas"));
            const pautasHoje = pautasSnap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(p => {
                    const dataOp = p.dataOperacao || (p.createdAt || '').split('T')[0];
                    return dataOp === hoje && !p.isClosed;
                });

            const resultado = [];
            for (const pauta of pautasHoje) {
                if (pauta.id === this.pautaId) {
                    // Já temos listener ativo para esta
                    resultado.push(pauta);
                    continue;
                }
                try {
                    const colabsSnap = await getDocs(collection(db, "pautas", pauta.id, "collaborators"));
                    const estaNessa = colabsSnap.docs.some(c => c.data().nome === this.colaboradorNome);
                    if (estaNessa) {
                        resultado.push(pauta);
                        // Listener real-time para esta pauta extra
                        const unsub = onSnapshot(
                            collection(db, "pautas", pauta.id, "attendances"),
                            (snap) => {
                                this.atendimentosPorPauta[pauta.id] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                                if (this.abaAtual === 'pauta-dia') this.renderizarAbaAtual();
                            }
                        );
                        this.unsubscribesPautasExtras.push(unsub);
                    }
                } catch { /* pauta sem colaboradores */ }
            }

            this.pautasDoDia = resultado;

            // Atualiza a aba se já estiver aberta
            if (this.abaAtual === 'pauta-dia') this.renderizarAbaAtual();

        } catch (err) {
            console.error("Erro ao buscar pautas do colaborador:", err);
        }
    },

    // ─── CONTAINER PRINCIPAL ──────────────────────────────────────────────────

    renderizarContainerDashboard() {
        const corpo = document.querySelector('.w-full.max-w-2xl') || document.querySelector('.w-full.max-w-4xl') || document.body;

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
                        <span id="badge-status-header" class="bg-white/20 text-white/80 text-[10px] font-black px-3 py-1.5 rounded-full shadow-sm uppercase tracking-wider">⏳</span>
                        
                        ${this.modoVisualizacao === 'abas' ? `
                        <button id="btn-voltar-dashboard" class="bg-white/20 hover:bg-white/30 text-white text-[10px] font-bold px-3 py-2 rounded-lg transition" title="Voltar ao modo Mesa">
                            ← Mesa
                        </button>` : `
                        <button id="btn-ir-abas" class="bg-white/20 hover:bg-white/30 text-white text-[10px] font-bold px-3 py-2 rounded-lg transition" title="Ver pauta completa">
                            📋 Pauta
                        </button>`}

                        <button id="btn-install-pwa" class="hidden bg-white/20 hover:bg-white/30 text-white p-2 sm:px-4 sm:py-2 rounded-lg transition font-bold text-xs shadow-sm flex items-center gap-2">
                            <span>📱</span><span class="hidden sm:inline">Instalar App</span>
                        </button>
                        <button id="btn-dash-settings" class="bg-white/20 hover:bg-white/30 text-white p-2 rounded-lg transition shadow-sm">⚙️</button>

                        <div id="dash-settings-menu" class="hidden absolute top-full right-0 mt-2 w-64 bg-white rounded-xl shadow-2xl border p-4 z-[999] origin-top-right">
                            <h4 class="text-[10px] font-black uppercase text-gray-400 mb-2 tracking-widest border-b pb-1">Layout da Tela</h4>
                            <div class="flex gap-2 mb-5 bg-gray-50 p-1.5 rounded-lg border">
                                <button data-mode="tabs" class="mode-btn flex-1 py-2 text-xs font-bold rounded transition-all ${prefs.mode === 'tabs' ? 'bg-white text-gray-800 border shadow-sm' : 'text-gray-400 hover:bg-gray-100'}">Abas</button>
                                <button data-mode="list" class="mode-btn flex-1 py-2 text-xs font-bold rounded transition-all ${prefs.mode === 'list' ? 'bg-white text-gray-800 border shadow-sm' : 'text-gray-400 hover:bg-gray-100'}">Tudo na Tela</button>
                            </div>
                            <h4 class="text-[10px] font-black uppercase text-gray-400 mb-2 tracking-widest border-b pb-1">Cor do Cabeçalho</h4>
                            <div class="flex gap-2 justify-between px-1">
                                ${['slate','blue','indigo','emerald','rose'].map(c => `
                                    <button data-color="${c}" class="color-btn w-6 h-6 rounded-full bg-${c === 'slate' ? 'slate-800' : c+'-700'} ring-offset-2 transition-transform hover:scale-110 ${prefs.color === c ? 'ring-2 ring-offset-2 scale-110 shadow-md' : ''}"></button>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div id="dash-body" class="bg-slate-50 p-4 sm:p-6 rounded-b-2xl shadow-lg border border-slate-300 min-h-[500px] transition-colors duration-500">
                ${this.modoVisualizacao === 'abas' ? this._htmlAbasNavegacao() : this._htmlDashboardTradicional()}
            </div>
        `;

        this._setupHeaderInteracoes(colorMap, prefs);
        this.atualizarBadgeHeader();

        // PWA
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

        // MELHORIA 4: botão de alternar modo
        document.getElementById('btn-voltar-dashboard')?.addEventListener('click', () => {
            this.modoVisualizacao = 'dashboard';
            this._cancelarListeners();
            this.iniciarDashboardUnificado();
        });
        document.getElementById('btn-ir-abas')?.addEventListener('click', () => {
            this.modoVisualizacao = 'abas';
            this._cancelarListeners();
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
            <div class="mb-4 border-b border-slate-200">
                <div class="flex gap-1 sm:gap-2 overflow-x-auto">
                    <button id="btn-tab-minha-mesa" class="tab-principal-btn shrink-0 px-4 py-3 text-xs font-black uppercase tracking-widest rounded-t-lg transition-all bg-amber-600 text-white shadow-md">
                        🖥️ Minha Mesa
                    </button>
                    <button id="btn-tab-sem-atribuicao" class="tab-principal-btn shrink-0 px-4 py-3 text-xs font-black uppercase tracking-widest rounded-t-lg transition-all bg-slate-100 text-slate-600 hover:bg-slate-200">
                        👥 Sem Atribuição
                    </button>
                    <button id="btn-tab-pauta-dia" class="tab-principal-btn shrink-0 px-4 py-3 text-xs font-black uppercase tracking-widest rounded-t-lg transition-all bg-slate-100 text-slate-600 hover:bg-slate-200">
                        📋 Pauta do Dia
                    </button>
                </div>
            </div>
            <div id="painel-atendimento-container" class="min-h-[400px]">
                <div class="flex justify-center py-20"><div class="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-800"></div></div>
            </div>
        `;
    },

    _htmlDashboardTradicional() {
        return `
            <div id="wrapper-busca-historico" class="hidden mb-4 animate-fade-in">
                <input type="text" id="input-busca-local" class="w-full p-3 border border-slate-300 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner font-sans" placeholder="🔍 Digite o nome do assistido ou assunto para buscar...">
            </div>
            <div id="tabs-container-wrapper" class="bg-white p-3 rounded-xl shadow-sm border border-slate-200 mb-6">
                <div id="tabs-dashboard" class="flex gap-2 overflow-x-auto custom-scrollbar"></div>
            </div>
            <div id="lista-dashboard-conteudo" class="space-y-3 sm:space-y-4">
                <div class="flex justify-center py-20"><div class="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-800"></div></div>
            </div>
        `;
    },

    // ─── ABAS ─────────────────────────────────────────────────────────────────

    setupAbasNavegacao() {
        const abas = [
            { id: 'minha-mesa',      btnId: 'btn-tab-minha-mesa',      cor: 'bg-amber-600' },
            { id: 'sem-atribuicao',  btnId: 'btn-tab-sem-atribuicao',  cor: 'bg-blue-600' },
            { id: 'pauta-dia',       btnId: 'btn-tab-pauta-dia',       cor: 'bg-slate-700' },
        ];

        const ativarAba = (abaId) => {
            this.abaAtual = abaId;
            abas.forEach(aba => {
                const btn = document.getElementById(aba.btnId);
                if (!btn) return;
                if (aba.id === abaId) {
                    btn.className = `tab-principal-btn shrink-0 px-4 py-3 text-xs font-black uppercase tracking-widest rounded-t-lg transition-all ${aba.cor} text-white shadow-md`;
                } else {
                    btn.className = 'tab-principal-btn shrink-0 px-4 py-3 text-xs font-black uppercase tracking-widest rounded-t-lg transition-all bg-slate-100 text-slate-600 hover:bg-slate-200';
                }
            });
            this.renderizarAbaAtual();
        };

        document.getElementById('btn-tab-minha-mesa')?.addEventListener('click', () => ativarAba('minha-mesa'));
        document.getElementById('btn-tab-sem-atribuicao')?.addEventListener('click', () => ativarAba('sem-atribuicao'));
        document.getElementById('btn-tab-pauta-dia')?.addEventListener('click', () => ativarAba('pauta-dia'));

        this.renderizarAbaAtual();
    },

    renderizarAbaAtual() {
        const container = document.getElementById('painel-atendimento-container');
        if (!container) return;

        if (this.abaAtual === 'minha-mesa')     this._renderMinhaMesa(container);
        else if (this.abaAtual === 'sem-atribuicao') this._renderSemAtribuicao(container);
        else if (this.abaAtual === 'pauta-dia')  this._renderPautaDia(container);

        this._setupAcoesCards();
    },

    // ── ABA 1: MINHA MESA ─────────────────────────────────────────────────────

    _renderMinhaMesa(container) {
        const meusCasos = this.todosAtendimentosPauta.filter(a =>
            a.status === 'emAtendimento' &&
            a.assignedCollaborator?.name === this.colaboradorNome
        );

        if (meusCasos.length === 0) {
            container.innerHTML = `
                <div class="text-center py-16 bg-white rounded-xl border border-slate-200">
                    <span class="text-5xl block mb-4">🖥️</span>
                    <p class="font-black text-slate-500 uppercase tracking-widest text-sm">Mesa limpa. Nenhum caso atribuído a você.</p>
                    <p class="text-xs text-slate-400 mt-2">Veja a aba <strong>Sem Atribuição</strong> para puxar casos.</p>
                </div>`;
            return;
        }

        container.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            ${meusCasos.map(a => this._htmlCardAba(a, 'mesa')).join('')}
        </div>`;
    },

    // ── ABA 2: SEM ATRIBUIÇÃO ─────────────────────────────────────────────────

    _renderSemAtribuicao(container) {
        const semDono = this.todosAtendimentosPauta.filter(a =>
            a.status === 'emAtendimento' &&
            (!a.assignedCollaborator || !a.assignedCollaborator.name)
        );

        if (semDono.length === 0) {
            container.innerHTML = `
                <div class="text-center py-16 bg-white rounded-xl border border-slate-200">
                    <span class="text-5xl block mb-4">✅</span>
                    <p class="font-black text-slate-500 uppercase tracking-widest text-sm">Nenhum caso aguardando atribuição.</p>
                </div>`;
            return;
        }

        container.innerHTML = `
            <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 text-sm text-blue-700 font-semibold">
                👇 Clique em <strong>"Puxar para mim"</strong> para assumir um caso. Ele irá para sua mesa automaticamente.
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                ${semDono.map(a => this._htmlCardAba(a, 'puxar')).join('')}
            </div>`;
    },

    // ── ABA 3: PAUTA DO DIA (MELHORIA 1 + 3) ─────────────────────────────────

    _renderPautaDia(container) {
        if (this.pautasDoDia.length === 0) {
            container.innerHTML = `
                <div class="text-center py-16 bg-white rounded-xl border border-slate-200">
                    <span class="text-5xl block mb-4">📋</span>
                    <p class="font-black text-slate-500 uppercase tracking-widest text-sm">Carregando pautas do dia...</p>
                </div>`;
            return;
        }

        let html = '';

        for (const pauta of this.pautasDoDia) {
            const assistidos = this.atendimentosPorPauta[pauta.id] || [];

            // Contadores
            const total     = assistidos.length;
            const aguardando = assistidos.filter(a => a.status === 'aguardando').length;
            const atendendo  = assistidos.filter(a => a.status === 'emAtendimento').length;
            const atendidos  = assistidos.filter(a => a.status === 'atendido').length;
            const faltosos   = assistidos.filter(a => a.status === 'faltoso').length;
            const dist       = assistidos.filter(a => a.status === 'aguardandoDistribuicao').length;
            const porcentagem = total > 0 ? Math.round((atendidos / total) * 100) : 0;

            // MELHORIA 1: Sumário por pauta
            html += `
                <div class="mb-8">
                    <!-- Header da pauta -->
                    <div class="flex items-center justify-between mb-3">
                        <div>
                            <h3 class="font-black text-slate-800 text-base">${escapeHTML(pauta.name)}</h3>
                            <p class="text-[10px] text-slate-400 uppercase tracking-wider">${pauta.type || 'agendamento'} · ${total} registros</p>
                        </div>
                        <span class="text-sm font-black text-slate-500">${porcentagem}%</span>
                    </div>

                    <!-- Barra de progresso -->
                    <div class="h-1.5 bg-slate-100 rounded-full mb-3">
                        <div class="h-full bg-green-500 rounded-full transition-all" style="width:${porcentagem}%"></div>
                    </div>

                    <!-- Sumário compacto -->
                    <div class="grid grid-cols-4 sm:grid-cols-5 gap-2 mb-4">
                        <div class="bg-amber-50 border border-amber-200 rounded-lg p-2 text-center">
                            <div class="text-lg font-black text-amber-600">${aguardando}</div>
                            <div class="text-[9px] text-amber-500 font-bold uppercase">Aguard.</div>
                        </div>
                        <div class="bg-blue-50 border border-blue-200 rounded-lg p-2 text-center">
                            <div class="text-lg font-black text-blue-600">${atendendo}</div>
                            <div class="text-[9px] text-blue-500 font-bold uppercase">Atend.</div>
                        </div>
                        <div class="bg-green-50 border border-green-200 rounded-lg p-2 text-center">
                            <div class="text-lg font-black text-green-600">${atendidos}</div>
                            <div class="text-[9px] text-green-500 font-bold uppercase">Prontos</div>
                        </div>
                        <div class="bg-red-50 border border-red-200 rounded-lg p-2 text-center">
                            <div class="text-lg font-black text-red-500">${faltosos}</div>
                            <div class="text-[9px] text-red-400 font-bold uppercase">Faltosos</div>
                        </div>
                        ${dist > 0 ? `
                        <div class="bg-cyan-50 border border-cyan-200 rounded-lg p-2 text-center">
                            <div class="text-lg font-black text-cyan-600">${dist}</div>
                            <div class="text-[9px] text-cyan-500 font-bold uppercase">Distrib.</div>
                        </div>` : ''}
                    </div>

                    <!-- Cards agrupados por status -->
                    ${this._htmlGrupoStatus('⏳ Aguardando', assistidos.filter(a => a.status === 'aguardando'), 'geral', pauta.id)}
                    ${this._htmlGrupoStatus('👩‍💻 Em Atendimento', assistidos.filter(a => a.status === 'emAtendimento'), 'geral', pauta.id)}
                    ${dist > 0 ? this._htmlGrupoStatus('⚖️ Distribuição', assistidos.filter(a => a.status === 'aguardandoDistribuicao'), 'geral', pauta.id) : ''}
                    ${this._htmlGrupoStatus('✅ Atendidos', assistidos.filter(a => a.status === 'atendido'), 'geral', pauta.id)}
                </div>
                <hr class="border-slate-200 mb-6">
            `;
        }

        container.innerHTML = html;
    },

    _htmlGrupoStatus(titulo, lista, modo, pautaId) {
        if (lista.length === 0) return '';
        return `
            <details class="mb-3" open="${lista.length <= 5}">
                <summary class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 cursor-pointer select-none">
                    ${titulo} (${lista.length})
                </summary>
                <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mt-2">
                    ${lista.map(a => this._htmlCardAba(a, modo, pautaId)).join('')}
                </div>
            </details>
        `;
    },

    // ── CARD DAS ABAS ─────────────────────────────────────────────────────────

    _htmlCardAba(assistido, modo, pautaIdOverride = null) {
        const pid = pautaIdOverride || this.pautaId;
        const st = statusMap[assistido.status] || { cor: 'bg-gray-100 text-gray-600 border-gray-200', txt: assistido.status };
        const donoLabel = assistido.assignedCollaborator?.name
            ? `👤 ${escapeHTML(assistido.assignedCollaborator.name)}`
            : '⚠️ Sem dono';
        const badgeUrgencia = assistido.priority === 'URGENTE'
            ? `<span class="bg-red-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded animate-pulse">🚨</span>`
            : '';
        const baseUrl = window.location.href.split('?')[0];
        const linkIndividual = `${baseUrl}?pautaId=${pid}&assistidoId=${assistido.id}&colab=${encodeURIComponent(this.colaboradorNome)}&token=${assistido.delegationToken || ''}`;

        let botoesHtml = '';
        if (modo === 'puxar') {
            botoesHtml = `
                <button class="btn-puxar-caso w-full mt-3 bg-amber-500 hover:bg-amber-600 text-white font-black text-xs py-2 rounded-lg transition shadow-sm"
                    data-pauta-id="${pid}" data-assistido-id="${assistido.id}">
                    👇 Puxar para mim
                </button>`;
        } else if (modo === 'mesa') {
            botoesHtml = `
                <div class="flex gap-2 mt-3">
                    <a href="${linkIndividual}" class="flex-1 bg-green-600 hover:bg-green-700 text-white font-black text-xs py-2 rounded-lg transition text-center">📋 Atender</a>
                    <button class="btn-devolver-caso flex-1 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-black text-xs py-2 rounded-lg transition"
                        data-pauta-id="${pid}" data-assistido-id="${assistido.id}">Devolver</button>
                </div>`;
        } else {
            botoesHtml = `
                <a href="${linkIndividual}" class="block w-full mt-3 bg-slate-700 hover:bg-slate-800 text-white font-black text-xs py-2 rounded-lg transition text-center">🔍 Ver Detalhes</a>`;
        }

        return `
            <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col hover:border-amber-300 transition-colors">
                <div class="flex justify-between items-start mb-2 gap-2">
                    <h4 class="font-bold text-slate-800 text-sm truncate flex-1 flex items-center gap-1">
                        ${escapeHTML(assistido.name)} ${badgeUrgencia}
                    </h4>
                    <span class="text-[9px] font-black uppercase px-2 py-1 rounded border ${st.cor} shrink-0">${st.txt}</span>
                </div>
                <div class="bg-slate-50 p-2 rounded border border-slate-100 flex-grow text-xs text-slate-600 space-y-1">
                    <p class="truncate">📄 ${escapeHTML(assistido.subject || 'Assunto não informado')}</p>
                    ${modo === 'geral' ? `<p class="${assistido.assignedCollaborator ? 'text-blue-600' : 'text-red-500'} font-bold">${donoLabel}</p>` : ''}
                    ${assistido.scheduledTime ? `<p class="text-slate-400">🕐 ${assistido.scheduledTime}</p>` : ''}
                    ${assistido.numeroProcesso ? `<p class="font-mono text-slate-400">CNP: ${escapeHTML(assistido.numeroProcesso)}</p>` : ''}
                </div>
                ${botoesHtml}
            </div>`;
    },

    _setupAcoesCards() {
        // Puxar para mim
        document.querySelectorAll('.btn-puxar-caso').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const b = e.currentTarget;
                b.disabled = true;
                b.textContent = 'Puxando...';
                await this.puxarParaMim(b.dataset.pautaId, b.dataset.assistidoId);
            });
        });

        // Devolver para fila
        document.querySelectorAll('.btn-devolver-caso').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const b = e.currentTarget;
                await this.devolverParaFila(b.dataset.pautaId, b.dataset.assistidoId);
            });
        });
    },

    // ─── PUXAR PARA MIM (MELHORIA 2) ───────────────────────────────────────────

    async puxarParaMim(pautaId, assistidoId) {
        // MELHORIA 2: verifica se já tem caso em andamento
        const casosEmAndamento = this.todosAtendimentosPauta.filter(a =>
            a.status === 'emAtendimento' &&
            a.assignedCollaborator?.name === this.colaboradorNome
        );

        if (casosEmAndamento.length >= 3) {
            const continuar = confirm(
                `Você já tem ${casosEmAndamento.length} caso(s) em andamento na sua mesa.\n\nDeseja puxar mais este caso mesmo assim?`
            );
            if (!continuar) return;
        }

        try {
            await updateDoc(doc(db, "pautas", pautaId, "attendances", assistidoId), {
                assignedCollaborator: {
                    id: this.colaboradorId || this.colaboradorAtual?.id || '',
                    name: this.colaboradorNome
                },
                inAttendanceTime: new Date().toISOString(),
                history: arrayUnion({
                    action: 'PUXADO_PARA_MESA',
                    by: this.colaboradorNome,
                    msg: `Caso assumido por ${this.colaboradorNome}`,
                    at: new Date().toISOString()
                })
            });

            if (this.colaboradorAtual?.id) {
                await updateDoc(doc(db, "pautas", pautaId, "collaborators", this.colaboradorAtual.id), {
                    status: 'ocupado',
                    currentAttendance: assistidoId
                }).catch(() => {});
            }

            // Muda para a aba Minha Mesa automaticamente
            this.abaAtual = 'minha-mesa';
            document.getElementById('btn-tab-minha-mesa')?.click();

            if (typeof showNotification === 'function') {
                showNotification("Caso puxado para a sua mesa!", "success");
            }

        } catch (error) {
            console.error("Erro ao puxar caso:", error);
            if (typeof showNotification === 'function') {
                showNotification("Erro ao atribuir caso.", "error");
            } else {
                alert("Erro ao atribuir caso. Tente novamente.");
            }
        }
    },

    async devolverParaFila(pautaId, assistidoId) {
        if (!confirm("Devolver este caso para a fila Sem Atribuição? Outros colaboradores poderão assumí-lo.")) return;

        try {
            await updateDoc(doc(db, "pautas", pautaId, "attendances", assistidoId), {
                assignedCollaborator: null,
                inAttendanceTime: null,
                history: arrayUnion({
                    action: 'DEVOLVIDO_PARA_FILA',
                    by: this.colaboradorNome,
                    msg: `Devolvido para a fila por ${this.colaboradorNome}`,
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
            if (typeof showNotification === 'function') {
                showNotification("Erro ao devolver caso.", "error");
            } else {
                alert("Erro ao devolver caso.");
            }
        }
    },

    // ─── DASHBOARD TRADICIONAL (preservado do código original) ────────────────

    atualizarListasDoDashboard() {
        const container = document.getElementById('lista-dashboard-conteudo');
        const tabsDiv   = document.getElementById('tabs-dashboard');
        const wrapperBusca = document.getElementById('wrapper-busca-historico');
        if (!container) return;

        const isDefensor = this.colaboradorAtual?.cargo?.toLowerCase().includes('defensor');
        const prefs = JSON.parse(localStorage.getItem('dashboard_prefs')) || { mode: 'tabs', color: 'slate' };
        const baseUrl = window.location.href.split('?')[0];

        const desenharCard = (item, isAberto) => {
            const st = statusMap[item.status] || { cor: 'bg-gray-100 text-gray-600 border-gray-200', txt: item.status };
            const notas = item.notasRevisao ? `<div class="mt-2 bg-yellow-50 p-2 rounded text-xs text-yellow-900 border border-yellow-200">⚠️ ${escapeHTML(item.notasRevisao)}</div>` : '';
            const numCNP = item.numeroProcesso ? `<span class="font-mono text-[10px] bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">CNP: ${escapeHTML(item.numeroProcesso)}</span>` : '';
            const urgencia = item.priority === 'URGENTE' ? 'border-l-[4px] border-l-red-500' : '';
            const link = `${baseUrl}?pautaId=${this.pautaId}&assistidoId=${item.id}&colab=${encodeURIComponent(this.colaboradorNome)}&token=${item.delegationToken || ''}`;

            if (isAberto && item.status !== 'atendido' && item.status !== 'aguardandoNumero') {
                return `
                    <div class="border-2 ${urgencia} bg-white border-slate-200 p-4 rounded-xl shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3">
                        <div class="min-w-0 flex-1">
                            <h3 class="font-black text-slate-800 text-base truncate">${escapeHTML(item.name)}</h3>
                            <p class="text-xs text-slate-500 truncate mt-0.5">${escapeHTML(item.subject || '')}</p>
                            ${numCNP} ${notas}
                        </div>
                        <a href="${link}" class="shrink-0 bg-slate-800 hover:bg-slate-900 text-white font-black py-2.5 px-5 rounded-xl text-[10px] uppercase tracking-widest transition">ABRIR</a>
                    </div>`;
            }

            const hora = item.attendedAt ? new Date(item.attendedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
            return `
                <div class="border ${urgencia} border-slate-200 bg-white p-3 rounded-xl shadow-sm flex justify-between items-center gap-3 mb-2">
                    <div class="min-w-0 flex-1">
                        <h3 class="font-black text-slate-800 text-sm truncate">${escapeHTML(item.name)}</h3>
                        <p class="text-[10px] text-slate-400 truncate">${escapeHTML(item.subject || '')}</p>
                        ${numCNP}
                    </div>
                    <div class="shrink-0 text-right">
                        <span class="text-[9px] font-black px-2 py-1 rounded border ${st.cor}">${st.txt}</span>
                        <p class="text-[9px] text-slate-400 mt-1">${hora}</p>
                    </div>
                </div>`;
        };

        const renderLista = (lista, isAberto, aviso) => {
            if (lista.length === 0) {
                container.innerHTML = `<div class="text-center py-16 opacity-50"><span class="text-5xl mb-4 block">📭</span><p class="text-sm font-black uppercase tracking-widest text-slate-500">${aviso}</p></div>`;
                return;
            }
            container.innerHTML = lista.map(i => desenharCard(i, isAberto)).join('');
        };

        const resetTabs = () => {
            if (wrapperBusca) wrapperBusca.classList.add('hidden');
            document.querySelectorAll('.tab-btn').forEach(b => {
                b.className = b.className.replace(/bg-slate-800|bg-emerald-600|bg-indigo-600|text-white|shadow|mode-btn-active/g, '').trim();
                b.classList.add('bg-white', 'text-slate-500', 'hover:bg-slate-100', 'tab-btn');
            });
        };

        if (isDefensor) {
            const pendentes   = this.todosAtendimentosPauta.filter(a => ((a.status === 'aguardandoDistribuicao' || a.status === 'aguardandoCorrecao') && a.defensorResponsavel === this.colaboradorNome) || (a.status === 'emAtendimento' && a.assignedCollaborator?.name === this.colaboradorNome));
            const distribuidos = this.todosAtendimentosPauta.filter(a => (a.status === 'atendido' || a.status === 'aguardandoNumero') && (a.defensorResponsavel === this.colaboradorNome || a.attendedBy === this.colaboradorNome));
            const historico    = this.todosAtendimentosPauta.filter(a => a.defensorResponsavel === this.colaboradorNome || a.attendedBy === this.colaboradorNome || (Array.isArray(a.history) && a.history.some(h => h.by === this.colaboradorNome)));

            if (prefs.mode === 'list') {
                container.innerHTML = pendentes.map(item => desenharCard(item, true)).join('') + distribuidos.map(item => desenharCard(item, false)).join('');
                if (tabsDiv) tabsDiv.parentElement.classList.add('hidden');
            } else {
                if (tabsDiv) tabsDiv.parentElement.classList.remove('hidden');
                const abaAtivaId = document.querySelector('.mode-btn-active')?.id || 'tab-pendentes';
                
                tabsDiv.innerHTML = `
                    <button id="tab-pendentes" class="tab-btn flex-1 py-2 px-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition bg-slate-800 text-white shadow mode-btn-active">Fazer / Assinar <span class="ml-1 bg-white/20 px-1.5 py-0.5 rounded text-[9px]">${pendentes.length}</span></button>
                    <button id="tab-assinados" class="tab-btn flex-1 py-2 px-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition bg-white text-slate-500 hover:bg-slate-100">Distribuídos <span class="ml-1 bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded text-[9px]">${distribuidos.length}</span></button>
                    <button id="tab-historico-busca" class="tab-btn flex-1 py-2 px-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition bg-white text-indigo-500 hover:bg-indigo-50">🔍 Buscar</button>
                `;

                document.getElementById('tab-pendentes')?.addEventListener('click', () => { resetTabs(); document.getElementById('tab-pendentes').classList.add('bg-slate-800','text-white','shadow','mode-btn-active'); renderLista(pendentes, true, 'Mesa limpa.'); });
                document.getElementById('tab-assinados')?.addEventListener('click', () => { resetTabs(); document.getElementById('tab-assinados').classList.add('bg-emerald-600','text-white','shadow','mode-btn-active'); renderLista(distribuidos, false, 'Nenhuma distribuição.'); });
                document.getElementById('tab-historico-busca')?.addEventListener('click', () => {
                    resetTabs(); wrapperBusca?.classList.remove('hidden'); document.getElementById('tab-historico-busca').classList.add('bg-indigo-600','text-white','shadow','mode-btn-active');
                    renderLista(historico, true, 'Sem histórico.');
                    document.getElementById('input-busca-local')?.addEventListener('input', e => {
                        const t = e.target.value.toLowerCase();
                        renderLista(historico.filter(i => (i.name||'').toLowerCase().includes(t) || (i.subject||'').toLowerCase().includes(t) || (i.numeroProcesso||'').includes(t)), true, 'Nada encontrado.');
                    });
                });

                renderLista(pendentes, true, 'Mesa limpa.');
            }

        } else {
            const emAndamento = this.todosAtendimentosPauta.filter(a => a.status === 'emAtendimento' && a.assignedCollaborator?.name === this.colaboradorNome);
            const enviados    = this.todosAtendimentosPauta.filter(a => (a.status === 'aguardandoDistribuicao' || a.status === 'aguardandoCorrecao') && a.enviadoPor === this.colaboradorNome);
            const finalizados = this.todosAtendimentosPauta.filter(a => (a.status === 'atendido' || a.status === 'aguardandoNumero') && (a.attendedBy === this.colaboradorNome || a.enviadoPor === this.colaboradorNome));
            const historico   = this.todosAtendimentosPauta.filter(a => a.enviadoPor === this.colaboradorNome || a.attendedBy === this.colaboradorNome || a.assignedCollaborator?.name === this.colaboradorNome || (Array.isArray(a.history) && a.history.some(h => h.by === this.colaboradorNome)));

            if (prefs.mode === 'list') {
                container.innerHTML = emAndamento.map(item => desenharCard(item, true)).join('') + enviados.map(item => desenharCard(item, true)).join('') + finalizados.map(item => desenharCard(item, false)).join('');
                if (tabsDiv) tabsDiv.parentElement.classList.add('hidden');
            } else {
                if (tabsDiv) tabsDiv.parentElement.classList.remove('hidden');
                const abaAtivaId = document.querySelector('.mode-btn-active')?.id || 'tab-em-mesa';

                tabsDiv.innerHTML = `
                    <button id="tab-em-mesa" class="tab-btn flex-1 py-2 px-1 text-[10px] font-black uppercase tracking-widest rounded-lg transition bg-slate-800 text-white shadow mode-btn-active">Fazer <span class="ml-1 bg-white/20 px-1.5 py-0.5 rounded text-[9px]">${emAndamento.length}</span></button>
                    <button id="tab-enviados" class="tab-btn flex-1 py-2 px-1 text-[10px] font-black uppercase tracking-widest rounded-lg transition bg-white text-slate-500 hover:bg-slate-100">No Defensor <span class="ml-1 bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded text-[9px]">${enviados.length}</span></button>
                    <button id="tab-finalizados" class="tab-btn flex-1 py-2 px-1 text-[10px] font-black uppercase tracking-widest rounded-lg transition bg-white text-slate-500 hover:bg-slate-100">Prontos <span class="ml-1 bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded text-[9px]">${finalizados.length}</span></button>
                    <button id="tab-historico-busca" class="tab-btn flex-1 py-2 px-1 text-[10px] font-black uppercase tracking-widest rounded-lg transition bg-white text-indigo-500 hover:bg-indigo-50">🔍</button>
                `;

                document.getElementById('tab-em-mesa')?.addEventListener('click',    () => { resetTabs(); document.getElementById('tab-em-mesa').classList.add('bg-slate-800','text-white','shadow','mode-btn-active'); renderLista(emAndamento, true, 'Mesa limpa.'); });
                document.getElementById('tab-enviados')?.addEventListener('click',   () => { resetTabs(); document.getElementById('tab-enviados').classList.add('bg-indigo-600','text-white','shadow','mode-btn-active'); renderLista(enviados, true, 'Nada no Defensor.'); });
                document.getElementById('tab-finalizados')?.addEventListener('click',() => { resetTabs(); document.getElementById('tab-finalizados').classList.add('bg-emerald-600','text-white','shadow','mode-btn-active'); renderLista(finalizados, false, 'Nada finalizado.'); });
                document.getElementById('tab-historico-busca')?.addEventListener('click', () => {
                    resetTabs(); wrapperBusca?.classList.remove('hidden'); document.getElementById('tab-historico-busca').classList.add('bg-indigo-600','text-white','shadow','mode-btn-active');
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

    // ─── MÉTODOS AUXILIARES ───────────────────────────────────────────────────

    async carregarColaboradoresGerais() {
        try {
            const snap = await getDocs(collection(db, "pautas", this.pautaId, "collaborators"));
            this.todosColaboradores = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            this.colaboradorAtual = this.todosColaboradores.find(c => c.nome === this.colaboradorNome);
        } catch { this.todosColaboradores = []; }
    },

    atualizarBadgeHeader() {
        const badge = document.getElementById('badge-status-header');
        if (!badge) return;
        const livre = this.colaboradorAtual?.status === 'disponivel' || !this.colaboradorAtual?.status;
        badge.textContent = livre ? "🟢 LIVRE" : "🔴 OCUPADO";
        badge.className = `bg-white/20 ${livre ? 'text-emerald-300' : 'text-red-300'} text-[10px] font-black px-3 py-1.5 rounded-full shadow-sm uppercase tracking-wider`;
    },

    atualizarIndicadorDeStatus(pautaData, statusAtual, colaboradorNome) {
        const badge = document.getElementById('status-indicator');
        if (!badge) return;
        if (pautaData?.useDelegationFlow) {
            badge.textContent = `👤 ${colaboradorNome}`;
            badge.className = "absolute top-4 right-4 bg-blue-600 text-white text-[9px] font-black px-2 py-1 rounded-full shadow-lg border border-blue-400 uppercase tracking-widest z-20";
        } else {
            const livre = statusAtual === 'disponivel';
            badge.textContent = livre ? "🟢 LIVRE" : "🔴 OCUPADO";
            badge.className = `absolute top-4 right-4 ${livre ? 'bg-emerald-500 border-emerald-400 animate-pulse' : 'bg-red-500 border-red-400'} text-white text-[9px] font-black px-2 py-1 rounded-full shadow-lg border uppercase tracking-widest z-20`;
        }
        badge.classList.remove('hidden');
    },

    _gerarTokenSeguro() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID().substring(0, 8);
        }
        return Math.random().toString(36).substring(2, 10) + Date.now().toString(36).substring(4);
    },

    renderizarTelaLoginColaborador() {
        const corpo = document.querySelector('.w-full.max-w-6xl') || document.querySelector('.w-full.max-w-2xl') || document.body;
        corpo.className = "w-full max-w-md mx-auto my-10 px-4 animate-fade-in";
        corpo.innerHTML = `
            <div class="bg-white p-8 rounded-3xl shadow-2xl border border-gray-100">
                <div class="flex justify-center mb-6"><div class="bg-indigo-50 p-5 rounded-full border-4 border-indigo-100"><span class="text-5xl">🔒</span></div></div>
                <h2 class="text-2xl font-black text-center text-slate-800 mb-2 uppercase tracking-widest">Acesso Restrito</h2>
                <p class="text-center text-sm text-slate-500 mb-6">Olá, <strong class="text-indigo-600">${escapeHTML(this.colaboradorNome)}</strong>! Confirme sua identidade.</p>
                <form id="form-login-colaborador" class="space-y-4">
                    <div id="login-error-msg" class="hidden bg-red-50 text-red-700 p-4 rounded-xl text-xs font-bold border border-red-200 text-center"></div>
                    <div>
                        <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">E-mail Institucional</label>
                        <input type="email" id="login-colab-email" class="w-full p-4 border border-slate-300 rounded-xl bg-slate-50 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" required placeholder="Seu e-mail cadastrado">
                    </div>
                    <div>
                        <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Matrícula / ID</label>
                        <input type="password" id="login-colab-matricula" class="w-full p-4 border border-slate-300 rounded-xl bg-slate-50 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" required placeholder="Sua matrícula">
                    </div>
                    <div class="flex items-center gap-2">
                        <input type="checkbox" id="lembrar-login-colab" class="w-4 h-4 text-indigo-600 rounded">
                        <label for="lembrar-login-colab" class="text-xs text-gray-600 font-semibold cursor-pointer">Lembrar neste dispositivo</label>
                    </div>
                    <button type="submit" class="w-full bg-slate-800 hover:bg-slate-900 text-white font-black py-4 rounded-xl shadow-lg transition text-sm uppercase tracking-widest">Acessar Minha Mesa</button>
                </form>
            </div>
        `;

        document.getElementById('form-login-colaborador').onsubmit = (e) => {
            e.preventDefault();
            const email = document.getElementById('login-colab-email').value.trim().toLowerCase();
            const mat   = document.getElementById('login-colab-matricula').value.trim();
            const err   = document.getElementById('login-error-msg');
            const realEmail = (this.colaboradorAtual?.email || '').trim().toLowerCase();
            const realMat   = (this.colaboradorAtual?.identificador || '').trim();

            if (!realEmail || !realMat) {
                err.innerHTML = "Cadastro incompleto! Peça ao admin para preencher E-mail e Matrícula nos Colaboradores.";
                err.classList.remove('hidden');
                return;
            }

            if (email === realEmail && mat === realMat) {
                const key = `sigep_session_${this.pautaId}_${this.colaboradorNome}`;
                document.getElementById('lembrar-login-colab').checked
                    ? localStorage.setItem(key, 'true')
                    : sessionStorage.setItem(key, 'true');
                this.iniciarDashboardUnificado();
            } else {
                err.textContent = "E-mail ou Matrícula incorretos.";
                err.classList.remove('hidden');
            }
        };
    },

    showError(titulo, message) {
        const corpo = document.querySelector('.w-full.max-w-6xl') || document.querySelector('.w-full.max-w-2xl') || document.body;
        corpo.innerHTML = `
            <div class="w-full max-w-2xl mx-auto my-4">
                <div class="bg-red-600 p-8 rounded-t-3xl shadow-xl flex flex-col items-center justify-center">
                    <div class="bg-white p-3 rounded-2xl mb-4"><img src="https://raw.githubusercontent.com/alexdovale/ac-o-paula-controle/main/imagem.png" alt="Logo" class="h-12 w-auto"></div>
                    <h1 class="text-white font-black text-3xl uppercase tracking-widest">ACESSO NEGADO</h1>
                </div>
                <div class="p-10 text-center bg-white rounded-b-3xl shadow-xl border border-gray-200">
                    <span class="text-6xl block mb-6">🔒</span>
                    <h2 class="text-xl font-black text-gray-800 uppercase tracking-wide mb-3">${titulo}</h2>
                    <p class="text-gray-500 font-semibold">${message}</p>
                </div>
            </div>`;
    },

    // ─── RENDERIZAÇÃO DA INTERFACE INDIVIDUAL (preservado) ────────────────────

    renderizarInterface(assistido, pautaData) {
        // Remove listener do dashboard se existir
        if (this.unsubscribeDashboard) {
            this.unsubscribeDashboard();
            this.unsubscribeDashboard = null;
        }

        this.atualizarIndicadorDeStatus(pautaData, this.colaboradorAtual?.status, this.colaboradorNome);

        const url = new URL(window.location.href);
        url.searchParams.delete('view');
        url.searchParams.delete('modo');
        window.history.pushState({}, '', url);

        const headerBg = document.getElementById('header-bg');
        if (headerBg && !document.getElementById('logo-header-main')) {
            const textosWrapper = document.createElement('div');
            textosWrapper.className = "overflow-hidden w-full";
            while (headerBg.firstChild) textosWrapper.appendChild(headerBg.firstChild);
            
            headerBg.className = 'bg-slate-800 p-5 sm:p-6 rounded-t-2xl shadow-lg flex items-center gap-4 relative overflow-hidden';
            headerBg.innerHTML = `
                <div class="absolute top-0 right-0 w-48 h-48 bg-blue-500 opacity-10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
                <div id="logo-header-main" class="bg-white/10 p-2 rounded-xl border border-white/20 shadow-inner flex-shrink-0 relative z-10">
                    <img src="https://raw.githubusercontent.com/alexdovale/ac-o-paula-controle/main/imagem.png" alt="Logo" class="h-10 w-auto object-contain drop-shadow-md">
                </div>
            `;
            headerBg.appendChild(textosWrapper);
        }

        // Criar estrutura da interface individual (similar ao original)
        // Por brevidade, assumimos que o HTML da interface individual já existe no DOM
        // ou será injetado. O código original tem essa estrutura.
        
        document.getElementById('assistido-nome').textContent = assistido.name || 'Nome não informado';
        document.getElementById('assistido-assunto').textContent = assistido.subject || 'Assunto não informado';
        
        const areaColaborador = document.getElementById('area-colaborador');
        areaColaborador.classList.remove('hidden');

        document.getElementById('banner-transferencia')?.remove();
        document.getElementById('banner-atendido-trava')?.remove();
        document.getElementById('btn-marcar-livre')?.remove();

        if (assistido.historicoTransferencia) {
            const bannerHtml = `
                <div id="banner-transferencia" class="w-full bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl shadow-sm mb-6 flex items-start gap-3 relative overflow-hidden">
                    <div class="absolute left-0 top-0 bottom-0 w-1 bg-amber-500"></div>
                    <span class="text-xl pl-1">🔄</span>
                    <div>
                        <p class="text-[10px] font-black uppercase tracking-widest text-amber-500 mb-0.5">Última Movimentação</p>
                        <p class="text-xs font-semibold leading-relaxed">${escapeHTML(assistido.historicoTransferencia)}</p>
                    </div>
                </div>
            `;
            areaColaborador.insertAdjacentHTML('afterbegin', bannerHtml);
        }

        this.renderHistorico(assistido);

        if (assistido.status === 'atendido') {
            const abaEncerramento = document.getElementById('aba-encerramento');
            if (abaEncerramento) {
                abaEncerramento.innerHTML = `
                    <div id="banner-atendido-trava" class="text-center p-8 bg-emerald-50 rounded-2xl border-2 border-emerald-200 shadow-sm animate-fade-in mt-2 mb-6">
                        <div class="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center text-3xl text-white mx-auto shadow-sm mb-4">✓</div>
                        <h2 class="text-xl font-black text-emerald-800 uppercase tracking-wider">Protocolo Encerrado</h2>
                    </div>

                    <button id="btn-marcar-livre" class="w-full bg-slate-800 hover:bg-slate-900 text-white font-black py-4 rounded-xl shadow-lg hover:shadow-xl transition-all text-sm uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95">
                        <span>👋</span> ESTOU LIVRE / IR PARA MESA
                    </button>
                `;

                setTimeout(() => {
                    document.getElementById('btn-marcar-livre').onclick = async () => {
                        try {
                            if (this.colaboradorAtual && this.colaboradorAtual.id && this.colaboradorAtual.id !== 'manual') {
                                const colabDocRef = doc(db, "pautas", this.pautaId, "collaborators", this.colaboradorAtual.id);
                                await updateDoc(colabDocRef, { status: 'disponivel', currentAttendance: null });
                                this.atualizarIndicadorDeStatus(pautaData, 'disponivel', this.colaboradorNome);
                            }
                        } catch (e) { console.error(e); }
                        this.iniciarDashboardUnificado();
                    };
                }, 100);
            }
            if (headerBg) {
                headerBg.className = 'bg-emerald-600 p-5 sm:p-6 rounded-t-2xl shadow-lg flex items-center gap-4 relative overflow-hidden transition-colors duration-500';
            }
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
                <div class="bg-slate-900 text-white p-5 rounded-xl border border-slate-700 shadow-xl mb-6 animate-fade-in flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div class="min-w-0 flex-1">
                        <h4 class="text-[10px] font-black uppercase text-emerald-400 tracking-widest mb-1">Link de Acesso Manual - Verde</h4>
                        <p class="text-xs font-bold text-slate-300 truncate">Clique ao lado para abrir o procedimento/caso não processual:</p>
                        ${cnpManual ? `<span class="inline-block mt-2 font-mono font-bold text-[11px] bg-slate-800 border border-slate-700 text-slate-200 px-2.5 py-1 rounded">Nº CNP: ${escapeHTML(cnpManual)}</span>` : '<span class="inline-block mt-2 text-[10px] bg-amber-500/20 text-amber-400 font-bold px-2 py-0.5 rounded border border-amber-500/30 uppercase tracking-wider">Procedimento sem CNP cadastrado</span>'}
                    </div>
                    <div class="flex gap-2 w-full sm:w-auto shrink-0">
                        ${cnpManual ? `
                        <button type="button" onclick="navigator.clipboard.writeText('${cnpManual}'); alert('Nº CNP copiado com sucesso!');" class="flex-1 sm:flex-none bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 px-4 rounded-lg text-xs uppercase tracking-wider transition border border-slate-700 active:scale-95">
                            📋 Copiar CNP
                        </button>` : ''}
                        <a href="${linkManualVerde}" target="_blank" class="text-center flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2.5 px-5 rounded-lg text-xs uppercase tracking-widest transition shadow-md active:scale-95 flex items-center justify-center gap-1.5">
                            <span>⚖️</span> Abrir Link do Verde
                        </a>
                    </div>
                </div>
            `;
        }

        optionsHtml += `<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">`;
        const textoConcluir = isDefensor ? "Concluir e Distribuir" : "Finalizar Protocolo";

        optionsHtml += `
            <button id="btn-opt-direto" class="fluxo-opt-btn bg-emerald-50 border-2 border-emerald-400 ring-2 ring-emerald-100 p-4 rounded-xl text-left transition-all hover:shadow-md group">
                <span class="block text-xl mb-1 group-hover:scale-110 transition-transform origin-left">✅</span>
                <span class="block font-bold text-slate-800">${textoConcluir}</span>
                <span class="block text-[10px] text-slate-500 mt-1 uppercase tracking-wider">Encerrar atendimento definitivo</span>
            </button>
        `;

        if (showDistribuicao) {
            optionsHtml += `
                <button id="btn-opt-dist" class="fluxo-opt-btn bg-white border border-slate-200 p-4 rounded-xl text-left transition-all hover:bg-slate-50 hover:border-cyan-300 group">
                    <span class="block text-xl mb-1 group-hover:scale-110 transition-transform origin-left">⚖️</span>
                    <span class="block font-bold text-slate-800">Enviar para Assinatura</span>
                    <span class="block text-[10px] text-slate-500 mt-1 uppercase tracking-wider">Encaminhar para Defensor(a)</span>
                </button>
                <button id="btn-opt-correcao" class="fluxo-opt-btn bg-white border border-slate-200 p-4 rounded-xl text-left transition-all hover:bg-slate-50 hover:border-amber-300 group">
                    <span class="block text-xl mb-1 group-hover:scale-110 transition-transform origin-left">📝</span>
                    <span class="block font-bold text-slate-800">Pedir Avaliação</span>
                    <span class="block text-[10px] text-slate-500 mt-1 uppercase tracking-wider">Dúvidas ou revisão da petição</span>
                </button>
            `;
        }

        if (isDefensor) {
            optionsHtml += `
                <button id="btn-opt-devolver" class="fluxo-opt-btn bg-white border border-slate-200 p-4 rounded-xl text-left transition-all hover:bg-slate-50 hover:border-orange-300 group">
                    <span class="block text-xl mb-1 group-hover:scale-110 transition-transform origin-left">🔙</span>
                    <span class="block font-bold text-slate-800">Devolver p/ Correção</span>
                    <span class="block text-[10px] text-slate-500 mt-1 uppercase tracking-wider">Retornar à mesa do Servidor</span>
                </button>
            `;
        }

        optionsHtml += `
            <button id="btn-opt-transferir" class="fluxo-opt-btn bg-white border border-slate-200 p-4 rounded-xl text-left transition-all hover:bg-slate-50 hover:border-indigo-300 group">
                <span class="block text-xl mb-1 group-hover:scale-110 transition-transform origin-left">🔄</span>
                <span class="block font-bold text-slate-800">Transferir Caso</span>
                <span class="block text-[10px] text-slate-500 mt-1 uppercase tracking-wider">Passar a vez para colega</span>
            </button>
            <button id="btn-opt-pausar" class="fluxo-opt-btn bg-white border border-slate-200 p-4 rounded-xl text-left transition-all hover:bg-slate-50 hover:border-slate-300 group">
                <span class="block text-xl mb-1 group-hover:scale-110 transition-transform origin-left">⏸️</span>
                <span class="block font-bold text-slate-800">Pausar Atendimento</span>
                <span class="block text-[10px] text-slate-500 mt-1 uppercase tracking-wider">Voltar para Fila Geral</span>
            </button>
        </div>`;

        optionsHtml += `
            <div id="secao-demandas-adicionais-externo" class="bg-indigo-50 p-5 rounded-xl border border-indigo-200 mb-6 shadow-inner">
                <label class="block text-[10px] font-black text-indigo-700 uppercase tracking-widest mb-2 flex items-center gap-1"><span>📋</span> Acumular Demandas Resolvidas</label>
                <div class="flex gap-2 mb-3">
                    <input type="text" id="input-nova-demanda-externo" class="flex-grow p-2.5 border border-indigo-300 rounded-lg text-xs outline-none bg-white focus:ring-2 focus:ring-indigo-500" placeholder="Ex: Regulamentação de Guarda...">
                    <button type="button" id="btn-add-demanda-externo" class="bg-indigo-600 text-white font-bold px-4 py-2 rounded-lg text-xs hover:bg-indigo-700 transition shadow-sm uppercase tracking-wider">Somar</button>
                </div>
                <div id="container-lista-demandas-externo" class="space-y-1.5 max-h-36 overflow-y-auto pr-1"></div>
            </div>

            <div id="config-numero-processo" class="bg-slate-50 p-5 rounded-xl border border-slate-200 mb-6 transition-all shadow-inner space-y-4">
                <div>
                    <label class="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1"><span>📄</span> Nº Processo / Protocolo CNP (Opcional)</label>
                    <input type="text" id="input-numero-caso" value="${assistido.numeroProcesso || ''}" class="w-full p-3.5 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-mono placeholder:font-sans" placeholder="Ex: 1045239">
                </div>
                <div>
                    <label class="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1"><span>🔗</span> Link Direto do Procedimento no Verde (Manual)</label>
                    <input type="url" id="input-link-verde-manual" value="${assistido.linkVerdeManualmente || ''}" class="w-full p-3.5 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-mono placeholder:font-sans text-blue-600 underline" placeholder="https://verde.defensoria.rj.def.br/#/atendimento/...">
                </div>
            </div>

            <div id="config-distribuicao" class="hidden bg-cyan-50 p-5 rounded-xl border border-cyan-200 mb-6 shadow-inner">
                <label class="block text-[10px] font-black text-cyan-700 uppercase tracking-widest mb-2">Selecione o Defensor(a)</label>
                <select id="select-defensor-distribuicao" class="w-full p-3.5 border border-gray-300 rounded-lg text-sm bg-white mb-4 outline-none focus:ring-2 focus:ring-cyan-500 font-semibold text-slate-700 cursor-pointer"></select>
                <label class="block text-[10px] font-black text-cyan-700 uppercase tracking-widest mb-2">Nota Interna (Opcional)</label>
                <textarea id="notas-distribuicao-dinamico" rows="2" class="w-full p-3.5 border border-cyan-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-cyan-500 resize-none" placeholder="Ex: Peça inicial finalizada."></textarea>
            </div>

            <div id="config-correcao" class="hidden bg-amber-50 p-5 rounded-xl border border-amber-200 mb-6 shadow-inner">
                <label class="block text-[10px] font-black text-amber-700 uppercase tracking-widest mb-2">Defensor(a) Avaliador</label>
                <select id="select-defensor-correcao" class="w-full p-3.5 border border-gray-300 rounded-lg text-sm bg-white mb-4 outline-none focus:ring-2 focus:ring-amber-500 font-semibold text-slate-700 cursor-pointer"></select>
                <label class="block text-[10px] font-black text-amber-700 uppercase tracking-widest mb-2">Qual a dúvida?</label>
                <textarea id="notas-correcao-dinamico" rows="2" class="w-full p-3.5 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-amber-500 resize-none" placeholder="Ex: Favor conferir se cabe pedido de liminar..."></textarea>
            </div>

            <div id="config-devolver" class="hidden bg-orange-50 p-5 rounded-xl border border-orange-200 mb-6 shadow-inner">
                <label class="block text-[10px] font-black text-orange-700 uppercase tracking-widest mb-2">Devolver para qual Servidor(a)?</label>
                <select id="select-servidor-devolver" class="w-full p-3.5 border border-gray-300 rounded-lg text-sm bg-white mb-4 outline-none focus:ring-2 focus:ring-orange-500 font-semibold text-slate-700 cursor-pointer"></select>
                <label class="block text-[10px] font-black text-orange-700 uppercase tracking-widest mb-2">Motivo / Correção Exigida</label>
                <textarea id="notas-devolver-dinamico" rows="2" class="w-full p-3.5 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-orange-500 resize-none" placeholder="Ex: Faltou qualificar a testemunha. Favor corrigir."></textarea>
            </div>

            <div id="config-transferencia" class="hidden bg-indigo-50 p-5 rounded-xl border border-indigo-200 mb-6 shadow-inner">
                <label class="block text-[10px] font-black text-indigo-700 uppercase tracking-widest mb-2">Colega de Destino</label>
                <select id="select-transferir-colega" class="w-full p-3.5 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-700 cursor-pointer"></select>
            </div>

            <button id="btn-finalizar-dinamico" class="w-full bg-slate-800 hover:bg-slate-900 text-white font-black py-4 rounded-xl shadow-lg hover:shadow-xl transition-all text-sm uppercase tracking-widest">
                EXECUTAR AÇÃO
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
                b.className = 'fluxo-opt-btn bg-white border border-slate-200 p-4 rounded-xl text-left transition-all hover:bg-slate-50 group';
            });
            const coresAvas = {
                'direto': 'bg-emerald-50 border-2 border-emerald-400 ring-2 ring-emerald-100',
                'distribuicao': 'bg-cyan-50 border-2 border-cyan-400 ring-2 ring-cyan-100',
                'correcao': 'bg-amber-50 border-2 border-amber-400 ring-2 ring-amber-100',
                'devolver': 'bg-orange-50 border-2 border-orange-400 ring-2 ring-orange-100',
                'transferir': 'bg-indigo-50 border-2 border-indigo-400 ring-2 ring-indigo-100',
                'pausar': 'bg-slate-100 border-2 border-slate-400 ring-2 ring-slate-200'
            };
            btnClicado.className = `fluxo-opt-btn ${coresAvas[fluxo]} p-4 rounded-xl text-left transition-all shadow-md group`;

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
            container.innerHTML = `<p class="text-[11px] text-gray-400 italic font-semibold text-center py-2 bg-white rounded border border-dashed border-indigo-200">Nenhum caso extra somado.</p>`;
            return;
        }

        this.demandasAdicionaisLocais.forEach((dem, index) => {
            const div = document.createElement('div');
            div.className = "flex justify-between items-center bg-white border border-indigo-100 p-2 rounded-lg shadow-sm text-xs";
            div.innerHTML = `
                <span class="font-bold text-slate-700">⚖️ ${escapeHTML(dem)}</span>
                <button type="button" class="text-[10px] font-bold text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-2 py-0.5 rounded transition" data-index="${index}">Remover</button>
            `;
            div.querySelector('button').onclick = () => this.removerDemandaFluxoExterno(index);
            container.appendChild(div);
        });
    },

    povoarSelectsDinamicos() {
        const defensores = this.todosColaboradores.filter(c => c.cargo?.toLowerCase().includes('defensor'));
        const servidores = this.todosColaboradores.filter(c => !c.cargo?.toLowerCase().includes('defensor'));
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

        preencher('select-defensor-distribuicao', defensores, '--- ESCOLHA NA LISTA ---');
        preencher('select-defensor-correcao', defensores, '--- ESCOLHA NA LISTA ---');
        preencher('select-transferir-colega', todosMenosEu, '--- ESCOLHA O COLEGA ---');
        
        const enviadoPorInicial = this.assistidoData?.enviadoPor || '';
        preencher('select-servidor-devolver', servidores, '--- ESCOLHA O SERVIDOR ---', enviadoPorInicial);
    },

    async finalizarProcesso() {
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

            if (this.fluxoSelecionado === 'direto') {
                const enviadoPorServidor = this.assistidoData?.enviadoPor || null;
                
                const mapaProdutividadeBI = {};
                if (enviadoPorServidor) {
                    mapaProdutividadeBI[enviadoPorServidor] = 1; 
                }
                mapaProdutividadeBI[colabSeguro] = 1; 

                let statusDestinoFinal = 'aguardandoNumero';
                if (numProcessoSeguro || !temDistribuicaoAtiva) {
                    statusDestinoFinal = 'atendido';
                }

                await updateDoc(docRef, {
                    status: statusDestinoFinal,
                    attendedBy: colabSeguro,                    
                    enviadoPor: enviadoPorServidor,               
                    trabalhosPorUsuario: mapaProdutividadeBI,      
                    creatorEmail: enviadoPorServidor ? null : (this.colaboradorAtual?.email || null), 
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
                
                if (this.colaboradorAtual && this.colaboradorAtual.id && this.colaboradorAtual.id !== 'manual') {
                    const colabDocRef = doc(db, "pautas", pautaIdSeguro, "collaborators", this.colaboradorAtual.id);
                    await updateDoc(colabDocRef, {
                        status: 'disponivel',
                        currentAttendance: null
                    }).catch(e => console.warn("Erro ao atualizar status do colaborador para disponível", e));
                }

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
                    btnFinalizar.textContent = "EXECUTAR AÇÃO"; 
                    return; 
                }
                
                colaboradorDestinoObj = this.todosColaboradores.find(c => c.nome === def);

                await updateDoc(docRef, {
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
                
                if (this.colaboradorAtual && this.colaboradorAtual.id && this.colaboradorAtual.id !== 'manual') {
                    const colabDocRef = doc(db, "pautas", pautaIdSeguro, "collaborators", this.colaboradorAtual.id);
                    await updateDoc(colabDocRef, { status: 'disponivel', currentAttendance: null }).catch(e => {});
                }

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
                    btnFinalizar.textContent = "EXECUTAR AÇÃO"; 
                    return; 
                }
                
                colaboradorDestinoObj = this.todosColaboradores.find(c => c.nome === def);

                await updateDoc(docRef, { 
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

                if (this.colaboradorAtual && this.colaboradorAtual.id && this.colaboradorAtual.id !== 'manual') {
                    const colabDocRef = doc(db, "pautas", pautaIdSeguro, "collaborators", this.colaboradorAtual.id);
                    await updateDoc(colabDocRef, { status: 'disponivel', currentAttendance: null }).catch(e => {});
                }

                tituloSucesso = "Enviado p/ Avaliação!";
                subtituloSucesso = `O Defensor(a) ${def} avaliará a dúvida inserida.`;
            }
            else if (this.fluxoSelecionado === 'devolver') {
                const serv = document.getElementById('select-servidor-devolver')?.value || '';
                const nota = document.getElementById('notas-devolver-dinamico')?.value || '';
                if (!serv) { 
                    alert("Selecione o servidor de destino."); 
                    this.isProcessing = false;
                    btnFinalizar.disabled = false; 
                    btnFinalizar.textContent = "EXECUTAR AÇÃO"; 
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
                        msg: nota || `Retornado para correção na mesa do Servidor(a) ${serv}`,
                        at: timestampIso
                    })
                });

                if (this.colaboradorAtual && this.colaboradorAtual.id && this.colaboradorAtual.id !== 'manual') {
                    const colabDocRef = doc(db, "pautas", pautaIdSeguro, "collaborators", this.colaboradorAtual.id);
                    await updateDoc(colabDocRef, { status: 'disponivel', currentAttendance: null }).catch(e => {});
                }

                tituloSucesso = "Processo Devolvido!";
                subtituloSucesso = `O servidor ${serv} deve corrigir o documento.`;
            }
            else if (this.fluxoSelecionado === 'transferir') {
                const colega = document.getElementById('select-transferir-colega')?.value || '';
                if (!colega) { 
                    alert("Selecione um colega."); 
                    this.isProcessing = false;
                    btnFinalizar.disabled = false; 
                    btnFinalizar.textContent = "EXECUTAR AÇÃO"; 
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

                if (this.colaboradorAtual && this.colaboradorAtual.id && this.colaboradorAtual.id !== 'manual') {
                    const colabDocRef = doc(db, "pautas", pautaIdSeguro, "collaborators", this.colaboradorAtual.id);
                    await updateDoc(colabDocRef, { status: 'disponivel', currentAttendance: null }).catch(e => {});
                }

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
                        msg: 'Atendimento pausado pelo colaborador. Retornado para a fila de espera geral.',
                        at: timestampIso
                    })
                });

                if (this.colaboradorAtual && this.colaboradorAtual.id && this.colaboradorAtual.id !== 'manual') {
                    const colabDocRef = doc(db, "pautas", pautaIdSeguro, "collaborators", this.colaboradorAtual.id);
                    await updateDoc(colabDocRef, { status: 'disponivel', currentAttendance: null }).catch(e => {});
                }

                tituloSucesso = "Pausa Registrada";
                subtituloSucesso = "O assistido foi mandado de volta à fila de espera.";
            }

            if (colaboradorDestinoObj && colaboradorDestinoObj.email) {
                console.log(`✉️ Disparando e-mail para: ${colaboradorDestinoObj.email}`);
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
            
            this.iniciarDashboardUnificado();

        } catch (error) {
            console.error("Erro no processamento:", error);
            alert(`Erro ao salvar no banco de dados. Motivo: ${error.message}`);
            if (btnFinalizar) {
                btnFinalizar.disabled = false;
                btnFinalizar.textContent = "EXECUTAR AÇÃO";
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
            lista.innerHTML = `<div class="text-center py-10 opacity-50"><span class="text-4xl block mb-2">📭</span><p class="text-sm font-bold text-slate-500">Nenhum checklist de documentos registrado na recepção.</p></div>`;
            return;
        }

        const chk = assistido.documentChecklist;
        const baseDeDados = documentsData || window.documentsData || {};
        const actionData = baseDeDados[chk.action];
        const actionTitle = actionData ? actionData.title : chk.action.replace(/_/g, ' ').toUpperCase();
        
        let html = `
            <div class="bg-indigo-50 p-4 rounded-xl mb-6 border border-indigo-100 shadow-sm relative overflow-hidden">
                <div class="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                <p class="text-[10px] text-indigo-400 font-black uppercase tracking-widest mb-1 pl-1">Ação Selecionada na Recepção:</p>
                <p class="text-sm font-black text-indigo-800 uppercase pl-1">${actionTitle}</p>
            </div>
        `;

        if (chk.socioData) {
            const s = chk.socioData;
            let temSocio = false;
            let socioHtml = '';
            
            if (s.ocupacao && s.ocupacao.trim() !== '' && s.ocupacao !== 'Selecione a ocupação') {
                socioHtml += `<div class="flex justify-between items-center py-1.5 border-b border-gray-100"><span class="text-[10px] font-black text-gray-400 uppercase">OCUPAÇÃO</span><span class="text-xs font-bold text-gray-700">${escapeHTML(s.ocupacao)}</span></div>`;
                temSocio = true;
            }
            if (s.profissao && s.profissao.trim() !== '') {
                socioHtml += `<div class="flex justify-between items-center py-1.5 border-b border-gray-100"><span class="text-[10px] font-black text-gray-400 uppercase">PROFISSÃO</span><span class="text-xs font-bold text-gray-700">${escapeHTML(s.profissao)}</span></div>`;
                temSocio = true;
            }
            if (s.estadoCivil && s.estadoCivil.trim() !== '' && s.estadoCivil !== 'Selecione') {
                socioHtml += `<div class="flex justify-between items-center py-1.5 border-b border-gray-100"><span class="text-[10px] font-black text-gray-400 uppercase">ESTADO CIVIL</span><span class="text-xs font-bold text-gray-700">${escapeHTML(s.estadoCivil)}</span></div>`;
                temSocio = true;
            }
            if (s.ganhos && s.ganhos.trim() !== '' && s.ganhos !== 'R$ 0,00') {
                socioHtml += `<div class="flex justify-between items-center py-1.5 border-b border-gray-100"><span class="text-[10px] font-black text-gray-400 uppercase">RENDA FAMILIAR</span><span class="text-xs font-bold text-gray-700">${escapeHTML(s.ganhos)}</span></div>`;
                temSocio = true;
            }
            if (s.fonteRenda && s.fonteRenda.trim() !== '') {
                socioHtml += `<div class="flex justify-between items-center py-1.5 border-b border-gray-100"><span class="text-[10px] font-black text-gray-400 uppercase">FONTE DE RENDA</span><span class="text-xs font-bold text-gray-700">${escapeHTML(s.fonteRenda)}</span></div>`;
                temSocio = true;
            }
            
            if (temSocio) {
                html += `
                    <div class="bg-gray-50 p-4 rounded-xl mb-6 border border-gray-200 shadow-sm relative overflow-hidden">
                        <div class="absolute top-0 left-0 w-1 h-full bg-gray-500"></div>
                        <h4 class="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-3 pl-1 flex items-center gap-1">
                            <span>📋</span> PERFIL SOCIOECONÔMICO
                        </h4>
                        <div class="space-y-1">
                            ${socioHtml}
                        </div>
                    </div>
                `;
            }
        }

        if (chk.checkedIds && chk.checkedIds.length > 0) {
            html += `<h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 pl-1">📄 DOCUMENTOS EM POSSE</h4><ul class="space-y-2 mb-8">`;
            
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
                    <li class="text-xs bg-white border border-slate-200 p-3 rounded-lg flex justify-between items-center shadow-sm">
                        <span class="font-bold text-slate-700 pr-2">📄 ${docName}</span> 
                        <span class="font-black text-[9px] uppercase tracking-widest ${tipo === 'Físico' ? 'text-amber-600 bg-amber-50 border-amber-200' : 'text-emerald-600 bg-emerald-50 border-emerald-200'} px-2 py-1 rounded shadow-sm border">${tipo}</span>
                    </li>
                `;
            });
            html += `</ul>`;
        }

        if (assistido.demandas && assistido.demandas.descricoes && assistido.demandas.descricoes.length > 0) {
            html += `
                <div class="bg-violet-50 p-4 rounded-xl mb-6 border border-violet-200 shadow-sm relative overflow-hidden">
                    <div class="absolute top-0 left-0 w-1 h-full bg-violet-500"></div>
                    <h4 class="text-[10px] font-black text-violet-700 uppercase tracking-widest mb-3 pl-1 flex items-center gap-1">
                        <span>⚖️</span> DEMANDAS ACUMULADAS
                    </h4>
                    <ul class="space-y-2">
                        ${assistido.demandas.descricoes.map(dem => `<li class="text-xs bg-white p-2 rounded-lg border border-violet-100 shadow-sm flex items-center gap-2"><span class="text-violet-600">•</span> ${escapeHTML(dem)}</li>`).join('')}
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
                    gastosHtml += `<div class="flex justify-between text-xs mb-1.5"><span class="text-emerald-700 font-bold uppercase tracking-wider">${c.label}</span><span class="font-black text-emerald-900">${g[c.id]}</span></div>`;
                    const num = parseFloat(String(g[c.id]).replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
                    totalGastos += num;
                }
            });

            if (totalGastos > 0) {
                const totalFormatado = totalGastos.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                
                html += `
                    <div class="bg-emerald-50 p-5 rounded-xl mb-6 border border-emerald-200 shadow-sm relative overflow-hidden">
                        <div class="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
                        <h4 class="text-[10px] font-black text-emerald-800 uppercase tracking-widest mb-4 pl-1 flex items-center gap-1">
                            <span>💰</span> PLANILHA DE GASTOS
                        </h4>
                        <div class="pl-1 space-y-1 mb-4">
                            ${gastosHtml}
                        </div>
                        <div class="flex justify-between font-black text-emerald-900 border-t-2 border-emerald-200 pt-3 mt-2 pl-1 text-sm">
                            <span class="uppercase tracking-widest">TOTAL</span>
                            <span>${totalFormatado}</span>
                        </div>
                        
                        <button id="btn-baixar-planilha" class="mt-5 w-full bg-white border-2 border-emerald-300 text-emerald-700 font-black py-3 rounded-xl text-xs hover:bg-emerald-100 transition shadow-sm flex items-center justify-center gap-2 uppercase tracking-widest active:scale-95">
                            <span>📄</span> Baixar Planilha PDF
                        </button>
                    </div>
                `;
            }
        }

        if (chk.reuData && chk.reuData.checkReuUnico) {
            const reu = chk.reuData;
            html += `
                <div class="bg-rose-50 p-4 rounded-xl mb-6 border border-rose-200 shadow-sm relative overflow-hidden">
                    <div class="absolute top-0 left-0 w-1 h-full bg-rose-500"></div>
                    <h4 class="text-[10px] font-black text-rose-700 uppercase tracking-widest mb-3 pl-1 flex items-center gap-1"><span>👤</span> DADOS DO PÓLO PASSIVO (RÉU)</h4>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-4 text-xs text-slate-700 pl-1">
                        ${reu.nome ? `<p><b class="text-rose-900 font-black">Nome:</b> ${reu.nome}</p>` : ''}
                        ${reu.cpf ? `<p><b class="text-rose-900 font-black">CPF:</b> ${reu.cpf}</p>` : ''}
                        ${reu.telefone ? `<p><b class="text-rose-900 font-black">Tel:</b> ${reu.telefone}</p>` : ''}
                        ${reu.cep ? `<p class="sm:col-span-2 pt-2 border-t border-rose-100"><b class="text-rose-900 font-black block mb-1">Residência:</b> ${reu.rua}, ${reu.numero} ${reu.complemento ? ' - '+reu.complemento : ''} - ${reu.bairro}, ${reu.cidade}/${reu.uf} (CEP: ${reu.cep})</p>` : ''}
                        ${reu.empresa ? `<p class="sm:col-span-2 pt-2 border-t border-rose-100"><b class="text-rose-900 font-black block mb-1">Trabalho:</b> ${reu.empresa} - ${reu.rua_comercial}, ${reu.numero_comercial} - ${reu.cidade_comercial}/${reu.uf_comercial}</p>` : ''}
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

        setTimeout(() => {
            const btnBaixarPlanilha = document.getElementById('btn-baixar-planilha');
            if (btnBaixarPlanilha && this.assistidoData && this.assistidoData.documentChecklist?.expenseData) {
                btnBaixarPlanilha.onclick = () => {
                    if (typeof PDFService !== 'undefined' && PDFService.generatePlanilhaGastosPDF) {
                        PDFService.generatePlanilhaGastosPDF(this.assistidoData.name || 'Assistido', this.assistidoData.documentChecklist.expenseData);
                    }
                };
            }
        }, 300);
    },

    switchTab(tab) {
        const btnEncerramento = document.getElementById('tab-btn-encerramento');
        const btnHistorico = document.getElementById('tab-btn-historico');
        const abaEncerramento = document.getElementById('aba-encerramento');
        const abaHistorico = document.getElementById('aba-historico');

        if (tab === 'encerramento') {
            btnEncerramento.className = "flex-1 py-3 text-center font-black text-[11px] uppercase tracking-widest text-slate-800 border-b-2 border-slate-800 transition-colors";
            btnHistorico.className = "flex-1 py-3 text-center font-bold text-[11px] uppercase tracking-widest text-slate-400 border-b-2 border-transparent hover:text-slate-600 transition-colors";
            abaEncerramento.classList.remove('hidden');
            abaHistorico.classList.add('hidden');
        } else {
            btnHistorico.className = "flex-1 py-3 text-center font-black text-[11px] uppercase tracking-widest text-indigo-600 border-b-2 border-indigo-600 transition-colors";
            btnEncerramento.className = "flex-1 py-3 text-center font-bold text-[11px] uppercase tracking-widest text-slate-400 border-b-2 border-transparent hover:text-slate-600 transition-colors";
            abaHistorico.classList.remove('hidden');
            abaEncerramento.classList.add('hidden');
        }
    }
};

export default AtendimentoExternoService;
window.AtendimentoExternoService = AtendimentoExternoService;