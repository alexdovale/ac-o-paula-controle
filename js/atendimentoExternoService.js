import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
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

// ─── SERVIÇO PRINCIPAL ────────────────────────────────────────────────────────

export const AtendimentoExternoService = {

    pautaId: null,
    assistidoId: null,
    colaboradorNome: null,
    colaboradorId: null,
    colaboradorSenha: localStorage.getItem('colabPass') || null,
    fluxoSelecionado: null,
    assistidoData: null,
    todosColaboradores: [],
    colaboradorAtual: null,
    isProcessing: false,
    isLoadingPautas: false,
    todosAtendimentosPauta: [],
    demandasAdicionaisLocais: [],
    unsubscribeDashboard: null,
    unsubscribesPautasExtras: [],   
    abaAtual: 'minha-mesa',         
    modoVisualizacao: 'dashboard',  
    pautasDoDia: [],                
    atendimentosPorPauta: {},
    _isRendering: false,

    _dbInstance: null,
    _authInstance: null,

    get db() { return this._dbInstance; },
    set db(val) { this._dbInstance = val; },

    get auth() { return this._authInstance; },
    set auth(val) { this._authInstance = val; },

    getEl(id) {
        return document.getElementById(`ext-${id}`) || document.getElementById(id) || document.getElementById(`btn-${id}`) || document.getElementById(`view-${id}`);
    },

    async garantirConexaoFirebase() {
        if (this._dbInstance && this._authInstance) return;
        let cfg = null;
        if (typeof firebaseConfig !== 'undefined' && firebaseConfig.projectId) cfg = firebaseConfig;
        else if (window.firebaseConfig && window.firebaseConfig.projectId) cfg = window.firebaseConfig;
        
        try {
            let appV11;
            const appsExistentes = getApps();
            const appIsolado = appsExistentes.find(a => a.name === "SIGEP_V11_ISOLADO") || initializeApp(cfg, "SIGEP_V11_ISOLADO");
            this._dbInstance = getFirestore(appIsolado);
            this._authInstance = getAuth(appIsolado);
            if (!this._authInstance.currentUser) await signInAnonymously(this._authInstance);
        } catch (error) { console.error("Firebase Init Error:", error); }
    },

    // ─── GESTÃO DE ACESSO E SEGURANÇA ──────────────────────────────────────────

    logout() {
        if (confirm("Tem certeza que deseja sair?")) {
            const sessionKey = `sigep_session_${this.pautaId}_${this.colaboradorNome}`;
            localStorage.removeItem(sessionKey);
            sessionStorage.removeItem(sessionKey);
            localStorage.removeItem('lastColabName');
            localStorage.removeItem('lastPautaId');
            localStorage.removeItem('colabPass');
            window.location.reload();
        }
    },

    alterarSenhaPrompt() {
        const nova = prompt("Digite a nova senha (mínimo 4 caracteres):");
        if (nova) {
            if (nova.length < 4) { 
                alert("Senha muito curta! Mínimo 4 caracteres."); 
                return; 
            }
            localStorage.setItem('colabPass', nova);
            this.colaboradorSenha = nova;
            alert("Senha alterada com sucesso!");
        }
    },

    // ─── DEBUG: VERIFICAR ID DA PAUTA ──────────────────────────────────────────

    verificarIdPauta() {
        console.log("🔍 ====== VERIFICANDO ID DA PAUTA ======");
        console.log("📌 pautaId atual:", this.pautaId);
        console.log("📌 colaboradorNome:", this.colaboradorNome);
        console.log("📌 colaboradorAtual:", this.colaboradorAtual);
        console.log("📌 URL atual:", window.location.href);
        
        const params = new URLSearchParams(window.location.search);
        console.log("📌 pautaId da URL:", params.get('pautaId'));
        console.log("📌 localStorage lastPautaId:", localStorage.getItem('lastPautaId'));
        
        return this.pautaId;
    },

    // ─── INIT ─────────────────────────────────────────────────────────────────

    async init() {
        await this.garantirConexaoFirebase();
        
        const params = new URLSearchParams(window.location.search);
        this.pautaId = params.get('pautaId') || localStorage.getItem('lastPautaId');
        this.colaboradorNome = params.get('colab') || localStorage.getItem('lastColabName');

        // 🔍 DEBUG: Verificar ID
        this.verificarIdPauta();

        if (!this.pautaId || !this.colaboradorNome) {
            this.showError("Link Incompleto", "Não foi possível identificar a pauta ou o usuário.");
            return;
        }

        localStorage.setItem('lastPautaId', this.pautaId);
        localStorage.setItem('lastColabName', this.colaboradorNome);

        this.renderizarContainerLayout();
        await this.carregarColaboradoresGerais();

        if (!this.colaboradorAtual) {
            this.showError("Acesso Negado", "Colaborador não cadastrado nesta pauta.");
            return;
        }

        // 🔥 SEMPRE LOGAR AUTOMATICAMENTE (NUNCA PEDE SENHA)
        console.log("✅ Sessão automática, carregando dashboard...");
        
        // 🔥 SALVA SESSÃO PERMANENTEMENTE (NUNCA EXPIRE)
        const sessionKey = `sigep_session_${this.pautaId}_${this.colaboradorNome}`;
        localStorage.setItem(sessionKey, 'true');
        sessionStorage.setItem(sessionKey, 'true');
        
        // 🔥 CARREGA O DASHBOARD DIRETO (SEM TELA DE LOGIN)
        await this.iniciarDashboardUnificado();
    },

    // ─── CARREGAMENTO DE DADOS ────────────────────────────────────────────────

    async carregarColaboradoresGerais() {
        try {
            const snap = await getDocs(collection(this.db, "pautas", this.pautaId, "collaborators"));
            this.todosColaboradores = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            this.colaboradorAtual = this.todosColaboradores.find(c => c.nome === this.colaboradorNome);
        } catch (e) { 
            console.error("Erro ao carregar colaboradores:", e); 
        }
    },

    async _carregarDadosIniciais() {
        try {
            console.log("🔄 Carregando dados iniciais da pauta:", this.pautaId);
            
            const snap = await getDocs(collection(this.db, "pautas", this.pautaId, "attendances"));
            this.todosAtendimentosPauta = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            this.atendimentosPorPauta[this.pautaId] = this.todosAtendimentosPauta;
            
            console.log(`✅ Carregados ${this.todosAtendimentosPauta.length} atendimentos da pauta`);
            console.log(`📊 Status:`, this.todosAtendimentosPauta.map(a => `${a.name}: ${a.status}`));
            
            await this.renderizarAbaAtual();
            
            return true;
        } catch (error) {
            console.error("❌ Erro ao carregar dados iniciais:", error);
            setTimeout(() => {
                console.log("🔄 Tentando recarregar dados...");
                this._carregarDadosIniciais();
            }, 2000);
            return false;
        }
    },

    async _carregarTodasPautasDoColaborador() {
        this.isLoadingPautas = true;
        if (this.abaAtual === 'pauta-dia') this.renderizarAbaAtual();

        const hoje = new Date().toISOString().split('T')[0];
        try {
            const pautasSnap = await getDocs(collection(this.db, "pautas"));
            const pautasHoje = pautasSnap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(p => {
                    const dataOp = p.dataOperacao || (p.createdAt || '').split('T')[0];
                    return dataOp === hoje && !p.isClosed;
                });

            const resultado = [];
            for (const pauta of pautasHoje) {
                if (pauta.id === this.pautaId) {
                    resultado.push(pauta);
                    continue;
                }
                try {
                    const colabsSnap = await getDocs(collection(this.db, "pautas", pauta.id, "collaborators"));
                    if (colabsSnap.docs.some(c => c.data().nome === this.colaboradorNome)) {
                        resultado.push(pauta);
                        const unsub = onSnapshot(
                            collection(this.db, "pautas", pauta.id, "attendances"),
                            (snap) => {
                                this.atendimentosPorPauta[pauta.id] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                                if (this.abaAtual === 'pauta-dia' && !this._isRendering) {
                                    this.renderizarAbaAtual();
                                }
                            }
                        );
                        this.unsubscribesPautasExtras.push(unsub);
                    }
                } catch {}
            }
            this.pautasDoDia = resultado;
        } catch (err) {
            console.warn("Regras de segurança podem ter bloqueado a leitura total de pautas.", err);
        } finally {
            this.isLoadingPautas = false;
            if (this.abaAtual === 'pauta-dia') this.renderizarAbaAtual();
        }
    },

    // ─── RENDERIZAÇÃO LAYOUT ──────────────────────────────────────────────────

    renderizarContainerLayout() {
        const parent = document.getElementById('atendimento-externo-container');
        if (!parent) return;

        parent.className = "w-full max-w-6xl mx-auto my-4 transition-all animate-fade-in flex flex-col border border-slate-200 bg-white rounded-2xl shadow-2xl overflow-hidden";
        
        if (!document.getElementById('view-dashboard')) {
            parent.innerHTML = `
                <!-- HEADER PRINCIPAL COM BOTÕES DIRETOS -->
                <div id="ext-header-bg" class="bg-slate-800 p-5 text-white flex justify-between items-center relative overflow-visible shrink-0" style="z-index: 9999;">
                    <div class="flex items-center gap-4 relative z-10 w-full">
                        <button id="ext-btn-voltar-dashboard" class="hidden shrink-0 bg-white/10 hover:bg-white/20 text-white p-2 rounded-lg transition-colors border border-white/20">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
                        </button>
                        <div class="flex flex-col overflow-hidden">
                            <h1 id="ext-assistido-nome" class="font-black text-xl uppercase truncate tracking-tight">PAINEL DE ATENDIMENTO</h1>
                            <p id="ext-assistido-assunto" class="text-xs text-blue-200 opacity-90 truncate mt-1 font-semibold uppercase tracking-wider">Carregando dados da sua sessão...</p>
                        </div>
                    </div>
                    
                    <!-- BOTÕES DIRETOS (SEM MENU) -->
                    <div class="flex items-center gap-2 shrink-0" style="z-index: 99999;">
                        
                        <!-- BOTÃO TROCAR SENHA -->
                        <button onclick="window.AtendimentoExternoService.alterarSenhaPrompt()" class="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg transition shadow-sm border border-indigo-500 flex items-center gap-1.5 text-xs font-bold uppercase">
                            🔑 Senha
                        </button>
                        
                        <!-- BOTÃO SAIR -->
                        <button onclick="window.AtendimentoExternoService.logout()" class="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg transition shadow-sm border border-red-500 flex items-center gap-1.5 text-xs font-bold uppercase">
                            🚪 Sair
                        </button>
                    </div>
                </div>

                <!-- VIEW 1: DASHBOARD -->
                <div id="view-dashboard" class="flex flex-col flex-1">
                    <div class="flex border-b bg-slate-50 select-none border-slate-200 font-semibold text-xs tracking-wider overflow-x-auto custom-scrollbar">
                        <button id="ext-btn-tab-minha-mesa" class="flex-1 p-4 text-center font-black uppercase text-white bg-amber-600 border-b-2 border-amber-600 transition-colors focus:outline-none whitespace-nowrap">💻 Minha Mesa</button>
                        <button id="ext-btn-tab-sem-atribuicao" class="flex-1 p-4 text-center font-bold uppercase text-slate-500 border-b-2 border-transparent hover:text-slate-700 hover:bg-slate-100 transition-colors focus:outline-none whitespace-nowrap">📥 Aguardando</button>
                        <button id="ext-btn-tab-pauta-dia" class="flex-1 p-4 text-center font-bold uppercase text-slate-500 border-b-2 border-transparent hover:text-slate-700 hover:bg-slate-100 transition-colors focus:outline-none whitespace-nowrap">📅 Pauta do Dia</button>
                    </div>
                    <div class="p-4 sm:p-6 bg-slate-50/50 flex-1">
                        <div id="painel-atendimento-container" class="w-full min-h-[300px]">
                            <div class="flex justify-center items-center py-20"><div class="animate-spin h-8 w-8 border-b-2 border-amber-600 rounded-full"></div></div>
                        </div>
                    </div>
                </div>

                <!-- VIEW 2: TELA INDIVIDUAL -->
                <div id="view-atendimento" class="hidden flex-col flex-1">
                    <div class="flex border-b bg-slate-50 select-none border-slate-200 font-semibold text-xs tracking-wider overflow-x-auto custom-scrollbar">
                        <button id="ext-tab-btn-recording" class="ext-sub-tab flex-1 p-4 text-center font-black uppercase text-slate-800 border-b-2 border-slate-800 transition-colors focus:outline-none whitespace-nowrap">Encerramento / Fluxo</button>
                        <button id="ext-tab-btn-historico" class="ext-tab-btn flex-1 p-4 text-center font-bold uppercase text-slate-400 border-b-2 border-transparent hover:text-slate-600 transition-colors focus:outline-none whitespace-nowrap">Histórico Recepção</button>
                    </div>
                    <div class="p-4 sm:p-6 bg-white flex-1">
                        <div id="aba-encerramento" class="space-y-6"></div>
                        <div id="aba-historico" class="hidden">
                            <div id="lista-historico" class="space-y-4"></div>
                        </div>
                    </div>
                </div>
            `;
            this.setupAbasNavegacaoInterna();
        }
    },

    setupAbasNavegacaoInterna() {
        const tabs = ['minha-mesa', 'sem-atribuicao', 'pauta-dia'];
        tabs.forEach(tab => {
            const btn = this.getEl(`btn-tab-${tab}`);
            if (btn) {
                btn.onclick = async (e) => {
                    if (this._isRendering) return;
                    this._isRendering = true;
                    
                    try {
                        tabs.forEach(t => {
                            const b = this.getEl(`btn-tab-${t}`);
                            if (b) b.className = 'flex-1 p-4 text-center font-bold uppercase text-slate-500 border-b-2 border-transparent hover:text-slate-700 hover:bg-slate-100 transition-colors focus:outline-none whitespace-nowrap';
                        });
                        e.currentTarget.className = 'flex-1 p-4 text-center font-black uppercase text-white bg-amber-600 border-b-2 border-amber-600 transition-colors focus:outline-none whitespace-nowrap';
                        this.abaAtual = tab;
                        
                        const container = this.getEl('painel-atendimento-container');
                        if (container) container.innerHTML = '<div class="flex justify-center items-center py-20"><div class="animate-spin h-8 w-8 border-b-2 border-amber-600 rounded-full"></div></div>';
                        
                        if (tab === 'pauta-dia') {
                            await this._carregarTodasPautasDoColaborador();
                        }
                        await this.renderizarAbaAtual();
                    } finally {
                        this._isRendering = false;
                    }
                };
            }
        });

        const btnVoltar = this.getEl('btn-voltar-dashboard') || document.getElementById('ext-btn-voltar-dashboard');
        if (btnVoltar) {
            btnVoltar.onclick = () => {
                this.iniciarDashboardUnificado();
            };
        }
    },

    async renderizarAbaAtual() {
        if (this._isRendering) return;
        this._isRendering = true;
        
        try {
            const container = this.getEl('painel-atendimento-container');
            if (!container) {
                console.warn("⚠️ Container não encontrado");
                return;
            }

            if (!this.todosAtendimentosPauta || this.todosAtendimentosPauta.length === 0) {
                console.warn("⚠️ Nenhum dado encontrado, tentando recarregar...");
                await this._carregarDadosIniciais();
                return;
            }

            console.log(`📋 Renderizando aba: ${this.abaAtual} com ${this.todosAtendimentosPauta.length} atendimentos`);

            if (this.abaAtual === 'minha-mesa') {
                this._renderMinhaMesa(container);
            } else if (this.abaAtual === 'sem-atribuicao') {
                this._renderSemAtribuicao(container);
            } else if (this.abaAtual === 'pauta-dia') {
                await this._carregarTodasPautasDoColaborador();
                this._renderPautaDia(container);
            }

            this._setupAcoesCards();
        } catch (error) {
            console.error("❌ Erro ao renderizar aba:", error);
            const container = this.getEl('painel-atendimento-container');
            if (container) {
                container.innerHTML = `
                    <div class="text-center py-16 bg-red-50 rounded-xl border border-red-200">
                        <span class="text-5xl block mb-4">⚠️</span>
                        <p class="font-black text-red-500 uppercase tracking-widest text-sm">Erro ao carregar dados</p>
                        <p class="text-xs text-slate-400 mt-2">Tente recarregar a página</p>
                        <button onclick="window.AtendimentoExternoService._carregarDadosIniciais()" class="mt-4 bg-red-600 text-white font-bold px-4 py-2 rounded-lg text-xs hover:bg-red-700 transition">
                            🔄 Tentar Novamente
                        </button>
                    </div>`;
            }
        } finally {
            this._isRendering = false;
        }
    },

    _renderMinhaMesa(container) {
        const meusCasos = this.todosAtendimentosPauta.filter(a =>
            a.assignedCollaborator?.name === this.colaboradorNome &&
            a.status === 'emAtendimento'
        );

        console.log(`💻 Minha mesa: ${meusCasos.length} casos`);

        if (meusCasos.length === 0) {
            container.innerHTML = `
                <div class="text-center py-16 bg-white rounded-xl border border-slate-200">
                    <span class="text-5xl block mb-4">🖥️</span>
                    <p class="font-black text-slate-500 uppercase tracking-widest text-sm">Mesa limpa. Nenhum caso em atendimento.</p>
                    <p class="text-xs text-slate-400 mt-2">Veja a aba <strong>Aguardando</strong> para puxar casos.</p>
                </div>`;
            return;
        }

        container.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            ${meusCasos.map(a => this._htmlCardAba(a, 'mesa')).join('')}
        </div>`;
    },

    _renderSemAtribuicao(container) {
        const semDono = this.todosAtendimentosPauta.filter(a =>
            a.status === 'aguardando' &&
            (!a.assignedCollaborator || !a.assignedCollaborator.name)
        );

        console.log(`📥 Aguardando: ${semDono.length} casos`);

        if (semDono.length === 0) {
            container.innerHTML = `
                <div class="text-center py-16 bg-white rounded-xl border border-slate-200">
                    <span class="text-5xl block mb-4">✅</span>
                    <p class="font-black text-slate-500 uppercase tracking-widest text-sm">Nenhum caso aguardando atribuição.</p>
                    <p class="text-xs text-slate-400 mt-2">Todos os casos já foram puxados ou estão em andamento.</p>
                </div>`;
            return;
        }

        container.innerHTML = `
            <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 text-sm text-blue-700 font-semibold">
                👇 Clique em <strong>"Puxar para mim"</strong> para assumir um caso. (${semDono.length} disponíveis)
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                ${semDono.map(a => this._htmlCardAba(a, 'puxar')).join('')}
            </div>`;
    },

    _renderPautaDia(container) {
        if (this.isLoadingPautas) {
            container.innerHTML = `
                <div class="flex flex-col justify-center items-center py-16 text-slate-500">
                    <div class="animate-spin h-10 w-10 border-b-4 border-amber-600 rounded-full mb-4"></div>
                    <p class="font-black uppercase tracking-widest text-sm">Buscando pautas ativas...</p>
                </div>`;
            return;
        }

        if (this.pautasDoDia.length === 0) {
            container.innerHTML = `
                <div class="text-center py-16 bg-white rounded-xl border border-slate-200">
                    <span class="text-5xl block mb-4">📋</span>
                    <p class="font-black text-slate-500 uppercase tracking-widest text-sm">Nenhuma pauta do dia encontrada.</p>
                </div>`;
            return;
        }

        let html = '';

        for (const pauta of this.pautasDoDia) {
            const assistidos = this.atendimentosPorPauta[pauta.id] || [];

            const total = assistidos.length;
            const naPauta = assistidos.filter(a => a.status === 'pauta').length;
            const aguardando = assistidos.filter(a => a.status === 'aguardando').length;
            const atendendo = assistidos.filter(a => a.status === 'emAtendimento').length;
            const atendidos = assistidos.filter(a => a.status === 'atendido').length;
            const faltosos = assistidos.filter(a => a.status === 'faltoso').length;
            const dist = assistidos.filter(a => a.status === 'aguardandoDistribuicao').length;
            const aguardandoNumero = assistidos.filter(a => a.status === 'aguardandoNumero').length;
            const porcentagem = total > 0 ? Math.round((atendidos / total) * 100) : 0;

            html += `
                <div class="mb-8 border p-4 bg-white rounded-2xl shadow-sm">
                    <div class="flex justify-between items-center mb-2">
                        <h4 class="font-black text-slate-800 uppercase text-sm">${escapeHTML(pauta.name)}</h4>
                        <span class="text-xs font-bold text-green-600">${porcentagem}% Concluído</span>
                    </div>
                    <div class="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mb-4">
                        <div class="bg-green-500 h-full" style="width: ${porcentagem}%"></div>
                    </div>
                    <div class="grid grid-cols-4 gap-2 text-center text-xs mb-4">
                        <div class="bg-slate-100 p-2 rounded-lg border border-slate-200 text-slate-700 font-bold">Na Pauta: ${naPauta}</div>
                        <div class="bg-amber-50 p-2 rounded-lg border border-amber-200 text-amber-700 font-bold">Aguardando: ${aguardando}</div>
                        <div class="bg-blue-50 p-2 rounded-lg border border-blue-200 text-blue-700 font-bold">Atendendo: ${atendendo}</div>
                        <div class="bg-green-50 p-2 rounded-lg border border-green-200 text-green-700 font-bold">Prontos: ${atendidos}</div>
                    </div>
                    
                    <div class="mt-4">
                        ${naPauta > 0 ? this._htmlGrupoStatus('📋 Na Pauta', assistidos.filter(a => a.status === 'pauta'), 'geral', pauta.id) : ''}
                        ${this._htmlGrupoStatus('⏳ Aguardando', assistidos.filter(a => a.status === 'aguardando'), 'geral', pauta.id)}
                        ${this._htmlGrupoStatus('👩‍💻 Em Atendimento', assistidos.filter(a => a.status === 'emAtendimento'), 'geral', pauta.id)}
                        ${dist > 0 ? this._htmlGrupoStatus('⚖️ Distribuição', assistidos.filter(a => a.status === 'aguardandoDistribuicao'), 'geral', pauta.id) : ''}
                        ${aguardandoNumero > 0 ? this._htmlGrupoStatus('📄 Aguard. CNP', assistidos.filter(a => a.status === 'aguardandoNumero'), 'geral', pauta.id) : ''}
                        ${this._htmlGrupoStatus('✅ Atendidos', assistidos.filter(a => a.status === 'atendido'), 'geral', pauta.id)}
                        ${faltosos > 0 ? this._htmlGrupoStatus('❌ Faltosos', assistidos.filter(a => a.status === 'faltoso'), 'geral', pauta.id) : ''}
                    </div>
                    
                    <button onclick="window.AtendimentoExternoService.mudarPautaFoco('${pauta.id}')" class="w-full mt-4 text-center bg-slate-800 hover:bg-slate-900 text-white font-bold py-2 rounded-xl text-xs transition">🔍 Abrir esta Pauta</button>
                </div>
            `;
        }

        container.innerHTML = html;
    },

    mudarPautaFoco(pautaId) {
        this.pautaId = pautaId;
        localStorage.setItem('lastPautaId', pautaId);
        this.abaAtual = 'minha-mesa';
        const tabMinhaMesa = this.getEl('btn-tab-minha-mesa');
        if (tabMinhaMesa) tabMinhaMesa.click();
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

    _htmlCardAba(assistido, modo, pautaIdOverride = null) {
        const pid = pautaIdOverride || this.pautaId;
        const st = statusMap[assistido.status] || { cor: 'bg-gray-100 text-gray-600 border-gray-200', txt: assistido.status };
        const donoLabel = assistido.assignedCollaborator?.name ? `👤 ${escapeHTML(assistido.assignedCollaborator.name)}` : '⚠️ Sem dono';
        const badgeUrgencia = assistido.priority === 'URGENTE' ? `<span class="bg-red-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded animate-pulse">🚨</span>` : '';

        let botoesHtml = '';
        if (modo === 'puxar') {
            botoesHtml = `<button class="btn-puxar-caso w-full mt-3 bg-amber-500 hover:bg-amber-600 text-white font-black text-xs py-2 rounded-lg transition shadow-sm" data-pauta-id="${pid}" data-assistido-id="${assistido.id}">👇 Puxar para mim</button>`;
        } else if (modo === 'mesa') {
            botoesHtml = `
                <div class="flex gap-2 mt-3">
                    <button onclick="window.AtendimentoExternoService.carregarAssistidoIndividual('${pid}', '${assistido.id}')" class="flex-1 bg-green-600 hover:bg-green-700 text-white font-black text-xs py-2 rounded-lg transition text-center flex items-center justify-center">📋 Atender</button>
                    <button class="btn-devolver-caso flex-1 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-black text-xs py-2 rounded-lg transition" data-pauta-id="${pid}" data-assistido-id="${assistido.id}">Devolver</button>
                </div>`;
        } else {
            botoesHtml = `<button onclick="window.AtendimentoExternoService.carregarAssistidoIndividual('${pid}', '${assistido.id}')" class="block w-full mt-3 bg-slate-700 hover:bg-slate-800 text-white font-black text-xs py-2 rounded-lg transition text-center">🔍 Ver Detalhes</button>`;
        }

        return `
            <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col hover:border-amber-300 transition-colors">
                <div class="flex justify-between items-start mb-2 gap-2">
                    <h4 class="font-bold text-slate-800 text-sm truncate flex-1 flex items-center gap-1">${escapeHTML(assistido.name)} ${badgeUrgencia}</h4>
                    <span class="text-[9px] font-black uppercase px-2 py-1 rounded border ${st.cor} shrink-0">${st.txt}</span>
                </div>
                <div class="bg-slate-50 p-2 rounded border border-slate-100 flex-grow text-xs text-slate-600 space-y-1">
                    <p class="truncate">📄 ${escapeHTML(assistido.subject || 'Assunto não informado')}</p>
                    ${modo === 'geral' ? `<p class="${assistido.assignedCollaborator ? 'text-blue-600' : 'text-red-500'} font-bold">${donoLabel}</p>` : ''}
                    ${assistido.numeroProcesso ? `<p class="font-mono text-slate-400">CNP: ${escapeHTML(assistido.numeroProcesso)}</p>` : ''}
                </div>
                ${botoesHtml}
            </div>`;
    },

    _setupAcoesCards() {
        document.querySelectorAll('.btn-puxar-caso').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const b = e.currentTarget;
                b.disabled = true;
                b.textContent = 'Puxando...';
                await this.puxarParaMim(b.dataset.pautaId, b.dataset.assistidoId);
            });
        });
        document.querySelectorAll('.btn-devolver-caso').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const b = e.currentTarget;
                await this.devolverParaFila(b.dataset.pautaId, b.dataset.assistidoId);
            });
        });
    },

    async puxarParaMim(pautaId, assistidoId) {
        try {
            await updateDoc(doc(this.db, "pautas", pautaId, "attendances", assistidoId), {
                assignedCollaborator: { id: this.colaboradorId || this.colaboradorAtual?.id || '', name: this.colaboradorNome },
                inAttendanceTime: new Date().toISOString(),
                status: 'emAtendimento',
                history: arrayUnion({ action: 'PUXADO_PARA_MESA', by: this.colaboradorNome, msg: `Caso assumido por ${this.colaboradorNome}`, at: new Date().toISOString() })
            });

            if (this.colaboradorAtual?.id) {
                await updateDoc(doc(this.db, "pautas", pautaId, "collaborators", this.colaboradorAtual.id), { status: 'ocupado', currentAttendance: assistidoId }).catch(() => {});
            }

            this.abaAtual = 'minha-mesa';
            this.getEl('btn-tab-minha-mesa')?.click();
            if (typeof showNotification === 'function') showNotification("Caso puxado para a sua mesa!", "success");
        } catch (error) {
            console.error("Erro ao puxar caso:", error);
            if (typeof showNotification === 'function') showNotification("Erro ao puxar caso.", "error");
        }
    },

    async devolverParaFila(pautaId, assistidoId) {
        if (!confirm("Devolver este caso para a fila?")) return;
        try {
            await updateDoc(doc(this.db, "pautas", pautaId, "attendances", assistidoId), {
                assignedCollaborator: null,
                inAttendanceTime: null,
                status: 'aguardando',
                history: arrayUnion({ action: 'DEVOLVIDO_PARA_FILA', by: this.colaboradorNome, msg: `Devolvido para a fila por ${this.colaboradorNome}`, at: new Date().toISOString() })
            });
            if (this.colaboradorAtual?.id) {
                await updateDoc(doc(this.db, "pautas", pautaId, "collaborators", this.colaboradorAtual.id), { status: 'disponivel', currentAttendance: null }).catch(() => {});
            }
        } catch (error) {
            console.error("Erro ao devolver caso:", error);
        }
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
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID().substring(0, 8);
        return Math.random().toString(36).substring(2, 10) + Date.now().toString(36).substring(4);
    },

    renderizarTelaLoginColaborador() {
        // 🔥 NUNCA MAIS USA A TELA DE LOGIN - SEMPRE LOGADO AUTOMATICAMENTE
        console.log("🚀 Login automático ativado!");
        this.iniciarDashboardUnificado();
    },

    showError(titulo, message) {
        const corpo = document.querySelector('.w-full.max-w-6xl') || document.querySelector('.w-full.max-w-2xl') || document.body;
        const fallback = document.getElementById('fallback-container');
        if (fallback) fallback.classList.add('hidden');
        
        corpo.innerHTML = `
            <div class="w-full max-w-2xl mx-auto my-4">
                <div class="bg-red-600 p-8 rounded-t-3xl shadow-xl flex flex-col items-center justify-center">
                    <div class="bg-white p-3 rounded-2xl mb-4"><img src="https://raw.githubusercontent.com/alexdovale/ac-o-paula-controle/main/imagem.png" alt="Logo" class="h-12 w-auto"></div>
                    <h1 class="text-white font-black text-3xl uppercase tracking-widest">ACESSO NEGADO / ERRO</h1>
                </div>
                <div class="p-10 text-center bg-white rounded-b-3xl shadow-xl border border-gray-200">
                    <span class="text-6xl block mb-6">⚠️</span>
                    <h2 class="text-xl font-black text-gray-800 uppercase tracking-wide mb-3">${titulo}</h2>
                    <p class="text-gray-500 font-semibold">${message}</p>
                    <button onclick="window.location.reload()" class="mt-8 bg-slate-800 text-white font-bold py-3 px-6 rounded-lg hover:bg-slate-700 transition">TENTAR NOVAMENTE</button>
                </div>
            </div>`;
    },

    // ─── DASHBOARD UNIFICADO ──────────────────────────────────────────────────

    async iniciarDashboardUnificado() {
        this.renderizarContainerLayout();

        const viewAtend = this.getEl('view-atendimento');
        const viewDash = this.getEl('view-dashboard');
        const btnVoltar = document.getElementById('ext-btn-voltar-dashboard') || document.getElementById('btn-voltar-dashboard');
        
        if (viewAtend) viewAtend.classList.add('hidden');
        if (viewDash) viewDash.classList.remove('hidden');
        if (btnVoltar) btnVoltar.classList.add('hidden');

        const labelSub = this.getEl('ext-assistido-assunto') || this.getEl('assistido-assunto');
        if (labelSub) labelSub.textContent = `Sessão Ativa • ${this.colaboradorNome}`;

        this._cancelarListeners();
        this.setupRealtimeListenerPauta();
        
        await this._carregarDadosIniciais();
        await this.renderizarAbaAtual();
    },

    async carregarSemAtribuicao() {
        this.abaAtual = 'sem-atribuicao';
        await this.renderizarAbaAtual();
    },

    async carregarPautaDoDia() {
        this.abaAtual = 'pauta-dia';
        await this._carregarTodasPautasDoColaborador();
        await this.renderizarAbaAtual();
    },

    _cancelarListeners() {
        if (this.unsubscribeDashboard) { 
            this.unsubscribeDashboard(); 
            this.unsubscribeDashboard = null; 
        }
        this.unsubscribesPautasExtras.forEach(u => u && u());
        this.unsubscribesPautasExtras = [];
    },

    setupRealtimeListenerPauta() {
        this._cancelarListeners();
        if (!this.pautaId || !this.db) return;

        console.log(`🔄 Iniciando listener da pauta: ${this.pautaId}`);

        this.unsubscribeDashboard = onSnapshot(
            collection(this.db, "pautas", this.pautaId, "attendances"),
            (snap) => {
                this.todosAtendimentosPauta = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                this.atendimentosPorPauta[this.pautaId] = this.todosAtendimentosPauta;
                
                console.log(`🔄 Atualizado em tempo real: ${this.todosAtendimentosPauta.length} atendimentos`);
                
                if (!this._isRendering) {
                    this.renderizarAbaAtual();
                }
            },
            (error) => {
                console.error("❌ Erro no realtime (Painel):", error);
                setTimeout(() => {
                    console.log("🔄 Tentando reconectar listener...");
                    this.setupRealtimeListenerPauta();
                }, 5000);
            }
        );
    },

    // ─── DEBUG COMPLETO ──────────────────────────────────────────────────────────

    debugCompleto() {
        console.log('🔍 ====== DEBUG COMPLETO ======');
        console.log('📌 pautaId:', this.pautaId);
        console.log('📌 colaboradorNome:', this.colaboradorNome);
        console.log('📌 colaboradorAtual:', this.colaboradorAtual);
        console.log('📌 Total atendimentos:', this.todosAtendimentosPauta?.length || 0);
        console.log('📌 Aba atual:', this.abaAtual);
        console.log('📌 Session:', sessionStorage.getItem(`sigep_session_${this.pautaId}_${this.colaboradorNome}`));
        console.log('📌 LocalStorage:', localStorage.getItem(`sigep_session_${this.pautaId}_${this.colaboradorNome}`));
        console.log('📌 Status dos atendimentos:');
        
        if (this.todosAtendimentosPauta) {
            const statusCount = {};
            this.todosAtendimentosPauta.forEach(a => {
                statusCount[a.status] = (statusCount[a.status] || 0) + 1;
            });
            console.log(statusCount);
            
            console.log('📌 Aguardando (sem dono):');
            const semDono = this.todosAtendimentosPauta.filter(a =>
                a.status === 'aguardando' &&
                (!a.assignedCollaborator || !a.assignedCollaborator.name)
            );
            console.log(semDono.map(a => `- ${a.name} (${a.status})`));
            
            console.log('📌 Meus casos:');
            const meus = this.todosAtendimentosPauta.filter(a =>
                a.assignedCollaborator?.name === this.colaboradorNome &&
                a.status === 'emAtendimento'
            );
            console.log(meus.map(a => `- ${a.name} (${a.status})`));
            
            console.log('📌 Na Pauta:');
            const naPauta = this.todosAtendimentosPauta.filter(a => a.status === 'pauta');
            console.log(naPauta.map(a => `- ${a.name} (${a.status})`));
        }
        
        return this.todosAtendimentosPauta;
    },

    // ─── BOTÃO ATENDER ─────────────────────────────────────────────────────────

    async carregarAssistidoIndividual(pautaId, assistidoId) {
        console.log("⚡ Botão ATENDER clicado!", {pautaId, assistidoId});
        
        const viewDash = this.getEl('view-dashboard');
        const viewAtend = this.getEl('view-atendimento');
        const btnVoltar = document.getElementById('ext-btn-voltar-dashboard') || document.getElementById('btn-voltar-dashboard');

        if (viewDash) viewDash.classList.add('hidden');
        if (viewAtend) viewAtend.classList.remove('hidden');
        if (btnVoltar) btnVoltar.classList.remove('hidden');

        try {
            const abaEncerramento = document.getElementById('aba-encerramento');
            if (abaEncerramento) {
                abaEncerramento.innerHTML = `<div class="flex flex-col items-center justify-center py-24"><div class="animate-spin rounded-full h-12 w-12 border-b-4 border-emerald-600"></div><p class="mt-4 font-black text-slate-400 tracking-widest text-sm uppercase">Buscando dados...</p></div>`;
            }

            await this.garantirConexaoFirebase();
            if (!this.db) throw new Error("Base de dados não inicializada.");

            this.pautaId = pautaId;
            this.assistidoId = assistidoId;

            const timeoutProm = new Promise((_, reject) => setTimeout(() => reject(new Error("O servidor demorou muito para responder.")), 8000));
            const fetchProm = Promise.all([
                getDoc(doc(this.db, "pautas", this.pautaId)),
                getDoc(doc(this.db, "pautas", this.pautaId, "attendances", this.assistidoId))
            ]);

            const [pautaDoc, docSnap] = await Promise.race([fetchProm, timeoutProm]);

            if (docSnap.exists() && pautaDoc.exists()) {
                const assistido = docSnap.data();
                this.assistidoData = assistido;
                this.demandasAdicionaisLocais = assistido.demandas?.descricoes ? [...assistido.demandas.descricoes] : [];
                
                const labelNome = this.getEl('ext-assistido-nome') || this.getEl('assistido-nome');
                const labelSub = this.getEl('ext-assistido-assunto') || this.getEl('assistido-assunto');
                if (labelNome) labelNome.textContent = assistido.name || 'Assistido';
                if (labelSub) labelSub.textContent = `Em atendimento • Pauta: ${pautaDoc.data().name}`;

                this.renderizarInterface(assistido, pautaDoc.data());
                this.setupListeners();
                this.atualizarIndicadorDeStatus(pautaDoc.data(), this.colaboradorAtual?.status, this.colaboradorNome);
            } else {
                this.showError("Processo Não Encontrado", "O ID do assistido não existe nesta pauta.");
            }

        } catch (error) {
            console.error("❌ Erro ao carregar Assistido:", error);
            this.showError("Erro de Conexão", error.message);
        }
    },

    // ─── RENDERIZAÇÃO DA INTERFACE INDIVIDUAL ─────────────────────────────────

    renderizarInterface(assistido, pautaData) {
        if (this.unsubscribeDashboard) {
            this.unsubscribeDashboard();
            this.unsubscribeDashboard = null;
        }

        const fallback = document.getElementById('fallback-container');
        if (fallback) fallback.classList.add('hidden');

        const headerBg = this.getEl('header-bg');
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

        const areaColaborador = document.getElementById('area-colaborador');
        if (areaColaborador) areaColaborador.classList.remove('hidden');

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
            if(areaColaborador) areaColaborador.insertAdjacentHTML('afterbegin', bannerHtml);
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
                                const colabDocRef = doc(this.db, "pautas", this.pautaId, "collaborators", this.colaboradorAtual.id);
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
            const pautaDoc = await getDoc(doc(this.db, "pautas", pautaIdSeguro));
            const pautaConfigAtiva = pautaDoc.exists() ? pautaDoc.data() : { useDistributionFlow: false };
            const temDistribuicaoAtiva = pautaConfigAtiva.useDistributionFlow === true;

            const docRef = doc(this.db, "pautas", pautaIdSeguro, "attendances", assistidoIdSeguro);
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
                    const colabDocRef = doc(this.db, "pautas", pautaIdSeguro, "collaborators", this.colaboradorAtual.id);
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
                    const colabDocRef = doc(this.db, "pautas", pautaIdSeguro, "collaborators", this.colaboradorAtual.id);
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
                    const colabDocRef = doc(this.db, "pautas", pautaIdSeguro, "collaborators", this.colaboradorAtual.id);
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
                    const colabDocRef = doc(this.db, "pautas", pautaIdSeguro, "collaborators", this.colaboradorAtual.id);
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
                    const colabDocRef = doc(this.db, "pautas", pautaIdSeguro, "collaborators", this.colaboradorAtual.id);
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
                    const colabDocRef = doc(this.db, "pautas", pautaIdSeguro, "collaborators", this.colaboradorAtual.id);
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
            const categories = [
                { id: 'moradia', label: 'Moradia' }, { id: 'alimentacao', label: 'Alimentação' },
                { id: 'educacao', label: 'Educação' }, { id: 'saude', label: 'Saúde' },
                { id: 'vestuario', label: 'Vestuário' }, { id: 'lazer', label: 'Lazer' },
                { id: 'outras', label: 'Outras' }
            ];

            let totalGastos = 0;
            let gastosHtml = '';
            
            categories.forEach(c => {
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
        document.getElementById('ext-tab-btn-recording')?.addEventListener('click', () => this.switchTab('encerramento'));
        document.getElementById('ext-tab-btn-historico')?.addEventListener('click', () => this.switchTab('historico'));

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
        const btnEncerramento = document.getElementById('ext-tab-btn-recording');
        const btnHistorico = document.getElementById('ext-tab-btn-historico');
        const abaEncerramento = document.getElementById('aba-encerramento');
        const abaHistorico = document.getElementById('aba-historico');

        if (tab === 'encerramento') {
            btnEncerramento.className = "flex-1 p-4 text-center font-black uppercase text-slate-800 border-b-2 border-slate-800 transition-colors focus:outline-none whitespace-nowrap";
            btnHistorico.className = "flex-1 p-4 text-center font-bold uppercase text-slate-400 border-b-2 border-transparent hover:text-slate-600 transition-colors focus:outline-none whitespace-nowrap";
            abaEncerramento.classList.remove('hidden');
            abaHistorico.classList.add('hidden');
        } else {
            btnHistorico.className = "flex-1 p-4 text-center font-black uppercase text-indigo-600 border-b-2 border-indigo-600 transition-colors focus:outline-none whitespace-nowrap";
            btnEncerramento.className = "flex-1 p-4 text-center font-bold uppercase text-slate-400 border-b-2 border-transparent hover:text-slate-600 transition-colors focus:outline-none whitespace-nowrap";
            abaHistorico.classList.remove('hidden');
            abaEncerramento.classList.add('hidden');
        }
    }
};

export default AtendimentoExternoService;
window.AtendimentoExternoService = AtendimentoExternoService;
