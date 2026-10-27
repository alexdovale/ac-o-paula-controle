import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    getFirestore, doc, getDoc, updateDoc, collection,
    getDocs, arrayUnion, onSnapshot, query, where
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { firebaseConfig } from './config.js';
import { documentsData } from './detalhes.js';
import { PDFService } from './pdfService.js';
import { EmailService } from './emailService.js';
import { showNotification, playSound, escapeHTML } from './utils.js';
import { ico } from './icons.js';

// ─── HELPERS DE STATUS E CORES ────────────────────────────────────────────────

const statusMap = {
    pauta:                  { cor: 'text-slate-600 border-slate-200 bg-slate-50',    txt: 'Na Pauta' },
    aguardando:             { cor: 'text-amber-700 border-amber-200 bg-amber-50',     txt: 'Espera' },
    emAtendimento:          { cor: 'text-blue-700 border-blue-200 bg-blue-50',        txt: 'Atendendo' },
    aguardandoDistribuicao: { cor: 'text-cyan-700 border-cyan-200 bg-cyan-50',        txt: 'No Defensor' },
    aguardandoCorrecao:     { cor: 'text-orange-700 border-orange-200 bg-orange-50',  txt: 'Avaliação' },
    atendido:               { cor: 'text-emerald-700 border-emerald-200 bg-emerald-50',txt: 'Concluído' },
    aguardandoNumero:       { cor: 'text-indigo-700 border-indigo-200 bg-indigo-50',  txt: 'Aguard. CNP' },
    faltoso:                { cor: 'text-red-700 border-red-200 bg-red-50',           txt: 'Faltoso' },
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ─── SERVIÇO PRINCIPAL ────────────────────────────────────────────────────────

export const AtendimentoExternoService = {

    pautaId: null,
    pautaNome: 'Pauta',
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
    unsubscribeAssistido: null,
    pautaCompletaAberta: false,
    _gruposPautaEstado: {},
    _assinaturaAssistido: '',

    // ─── INIT ─────────────────────────────────────────────────────────────────

    async init() {
        console.log("Mesa Digital V4 Inicializada (4 Colunas + Histórico Rico)");

        const urlParams = new URLSearchParams(window.location.search.replace(/&amp;/g, '&'));
        this.pautaId       = urlParams.get('pautaId') || urlParams.get('pid');
        this.assistidoId   = urlParams.get('assistidoId') || urlParams.get('aid');
        const tokenRecebido= urlParams.get('token');

        if (!this.pautaId) {
            this.showError("Link Incompleto", "Falta o identificador da pauta na URL.");
            return;
        }

        try {
            // Aguarda o Firebase restaurar a sessão (evita falso 'Sessão expirada' no reload)
            if (typeof auth.authStateReady === 'function') await auth.authStateReady();
            const user = auth.currentUser;
            if (!user) {
                this.showError("Acesso Negado", "Sessão expirada. Volte e faça login novamente no painel principal.");
                return;
            }

            const pautaDoc = await getDoc(doc(db, "pautas", this.pautaId));
            if (!pautaDoc.exists()) {
                this.showError("Pauta não localizada", "A pauta informada não existe mais no sistema.");
                return;
            }
            const pautaData = pautaDoc.data();
            this.pautaNome = pautaData.name || 'Pauta';
            this.pautaTipo = pautaData.type || 'agendamento';
            this.pautaFechada = pautaData.fechada === true;

            const colabRef = collection(db, "pautas", this.pautaId, "collaborators");
            const q = query(colabRef, where("email", "==", user.email));
            const snap = await getDocs(q);

            if (snap.empty) {
                this.showError("Acesso Negado", "O seu usuário não está vinculado como colaborador desta pauta.");
                return;
            }

            this.colaboradorAtual = { id: snap.docs[0].id, ...snap.docs[0].data() };
            this.colaboradorNome = this.colaboradorAtual.nome;
            this.colaboradorId = this.colaboradorAtual.id;

            await this.carregarColaboradoresGerais();

            if (this.assistidoId) {
                await this.iniciarAtendimentoIndividual(tokenRecebido, pautaData);
                return;
            }

            this._ajustarGrelhaKanban();
            await this.iniciarDashboardKanban();

        } catch (error) {
            console.error("Erro na inicialização:", error);
            this.showError("Conexão Perdida", "Falha ao conectar com o banco de dados.");
        }
    },

    // ─── LÓGICA DE DADOS (DASHBOARD) ──────────────────────────────────────────

    async iniciarDashboardKanban() {
        this._cancelarListeners();
        
        this.unsubscribePauta = onSnapshot(doc(db, "pautas", this.pautaId), (snap) => {
            if (snap.exists()) {
                const fechou = snap.data().fechada === true;
                if (fechou !== this.pautaFechada) {
                    this.pautaFechada = fechou;
                    this.renderizarKanban();
                }
            }
        });

        let primeiraCarga = true;
        this.unsubscribeDashboard = onSnapshot(
            collection(db, "pautas", this.pautaId, "attendances"),
            (snap) => {
                this.todosAtendimentosPauta = snap.docs.map(d => ({ id: d.id, ...d.data() }));

                // Avisa (som + toast) quando alguém novo entra na fila, exceto na carga inicial
                if (!primeiraCarga) {
                    snap.docChanges().forEach(change => {
                        if (change.type === 'added' && change.doc.data().status === 'aguardando') {
                            if (typeof showNotification === 'function') showNotification(`Novo assistido na fila: ${change.doc.data().name}`, "info");
                            if (typeof playSound === 'function') playSound();
                        }
                    });
                }
                primeiraCarga = false;

                this.atualizarBadgeHeader();
                this.renderizarKanban();
                if (this.pautaCompletaAberta) this._renderizarPautaCompleta();
            },
            (error) => console.error("Erro no realtime:", error)
        );

        this.prepararFiltroKanban();
        this._ligarCliqueNosCards();
    },

    async iniciarAtendimentoIndividual(tokenRecebido, pautaData) {
        this._cancelarListeners();

        this.unsubscribePauta = onSnapshot(doc(db, "pautas", this.pautaId), (snap) => {
            if(snap.exists()) {
                this.pautaFechada = snap.data().fechada === true;
                if(this.pautaFechada) this.renderizarSplitScreen(this.assistidoData, pautaData);
            }
        });

        const docSnap = await getDoc(doc(db, "pautas", this.pautaId, "attendances", this.assistidoId));
        if (!docSnap.exists()) {
            this.showError("Processo não encontrado", "Este assistido não está mais na pauta.");
            return;
        }

        const assistido = { id: docSnap.id, ...docSnap.data() };
        this.assistidoData = assistido;
        this.demandasAdicionaisLocais = assistido.demandas?.descricoes ? [...assistido.demandas.descricoes] : [];

        if (assistido.delegationToken && assistido.delegationToken !== tokenRecebido) {
            this.showError("Acesso Seguro", "O token de segurança é inválido ou expirou.");
            return;
        }

        this.renderizarSplitScreen(assistido, pautaData);
        this.atualizarBadgeHeader();
        this._assinaturaAssistido = this._assinaturaDados(assistido);
        this._escutarAssistido(pautaData);
        this.setupListeners();
    },

    // Mantém nome, assunto, checklist e histórico sincronizados enquanto o atendimento está aberto.
    // Não redesenha o painel de ações (para não apagar o que o colaborador está digitando).
    _assinaturaDados(a) {
        return JSON.stringify([a.name, a.subject, a.status, a.documentChecklist || null, a.demandas?.descricoes || null, a.historicoTransferencia || null]);
    },

    _escutarAssistido(pautaData) {
        if (this.unsubscribeAssistido) { this.unsubscribeAssistido(); this.unsubscribeAssistido = null; }
        this.unsubscribeAssistido = onSnapshot(
            doc(db, "pautas", this.pautaId, "attendances", this.assistidoId),
            (snap) => {
                if (!snap.exists() || !this.assistidoId) return;
                const novo = snap.data();
                const statusAnterior = this.assistidoData?.status;
                const assinatura = this._assinaturaDados(novo);
                if (assinatura === this._assinaturaAssistido) return;
                this._assinaturaAssistido = assinatura;
                this.assistidoData = { id: snap.id, ...novo };

                const nomeEl = document.getElementById('assistido-nome');
                const assuntoEl = document.getElementById('assistido-assunto');
                if (nomeEl) nomeEl.textContent = novo.name || 'Assistido';
                if (assuntoEl) assuntoEl.textContent = novo.subject || 'Sem assunto';

                // Se o status mudou (ex.: outro colaborador concluiu), refaz a tela inteira
                if (statusAnterior !== novo.status && !this.isProcessing) {
                    this.renderizarSplitScreen(this.assistidoData, pautaData);
                } else {
                    this._renderizarLadoEsquerdo(this.assistidoData);
                }
            },
            (error) => console.error("Erro no realtime do assistido:", error)
        );
    },

    _cancelarListeners() {
        if (this.unsubscribeDashboard) { this.unsubscribeDashboard(); this.unsubscribeDashboard = null; }
        if (this.unsubscribePauta) { this.unsubscribePauta(); this.unsubscribePauta = null; }
        if (this.unsubscribeAssistido) { this.unsubscribeAssistido(); this.unsubscribeAssistido = null; }
    },

    async carregarColaboradoresGerais() {
        try {
            const snap = await getDocs(collection(db, "pautas", this.pautaId, "collaborators"));
            this.todosColaboradores = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch { this.todosColaboradores = []; }
    },

    _gerarTokenSeguro() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID().substring(0, 8);
        return Math.random().toString(36).substring(2, 10) + Date.now().toString(36).substring(4);
    },

    showError(titulo, message) {
        const shell = document.getElementById('shell-atendimento');
        if (shell) shell.classList.add('hidden');
        
        const wrapper = document.getElementById('main-wrapper');
        wrapper.innerHTML = `
            <div class="w-full max-w-lg mx-auto my-auto animate-fade-in mt-10">
                <div class="bg-red-600 p-6 rounded-t-3xl shadow-xl flex flex-col items-center justify-center">
                    <h1 class="text-white font-black text-2xl uppercase tracking-widest text-center">Acesso Negado</h1>
                </div>
                <div class="p-8 text-center bg-white rounded-b-3xl shadow-xl border border-gray-200">
                    <span class="text-6xl block mb-6 text-red-400">${ico('lock', 'w-16 h-16 inline-block')}</span>
                    <h2 class="text-lg font-black text-gray-800 uppercase tracking-wide mb-2">${titulo}</h2>
                    <p class="text-gray-500 font-semibold text-sm">${message}</p>
                    <button onclick="window.location.href = window.location.pathname" class="mt-8 w-full bg-slate-800 text-white font-black px-6 py-4 rounded-xl hover:bg-slate-900 transition-colors uppercase tracking-widest text-sm shadow-md active:scale-95">VOLTAR AO PORTAL</button>
                </div>
            </div>`;
    },

    atualizarBadgeHeader() {
        const badge = document.getElementById('status-indicator');
        if (!badge) return;

        const isNaTelaIndividual = !!this.assistidoId;
        const meusCasos = this.todosAtendimentosPauta.filter(a =>
            a.status === 'emAtendimento' && a.assignedCollaborator?.name === this.colaboradorNome
        );

        const livre = meusCasos.length === 0 && !isNaTelaIndividual;

        badge.innerHTML = livre 
            ? `<span class="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span> <span class="hidden sm:inline">LIVRE</span>`
            : `<span class="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span> <span class="hidden sm:inline">OCUPADO</span>`;
        
        badge.className = `bg-white border ${livre ? 'text-emerald-700 border-emerald-200' : 'text-amber-700 border-amber-200'} text-[9px] sm:text-[10px] font-black px-3 sm:px-4 py-2 rounded-lg shadow-sm uppercase tracking-widest flex items-center gap-2 transition-colors`;

        if (this.colaboradorAtual?.id && this.colaboradorAtual.id !== 'manual') {
            const novoStatus = livre ? 'disponivel' : 'ocupado';
            if (this.colaboradorAtual.status !== novoStatus) {
                this.colaboradorAtual.status = novoStatus; 
                updateDoc(doc(db, "pautas", this.pautaId, "collaborators", this.colaboradorAtual.id), { status: novoStatus }).catch(()=>{});
            }
        }
    },

    // ─── RENDERIZAÇÃO: KANBAN COM 4 COLUNAS ───────────────────────────────────

    _ajustarGrelhaKanban() {
        // Altera a grid do HTML para suportar 4 colunas em vez de 3
        const grid = document.querySelector('#view-dashboard .grid');
        if (grid) {
            grid.className = 'grid grid-cols-1 lg:grid-cols-4 gap-4 flex-1 min-h-0 pb-2';
            
            // Injeta a 4ª coluna HTML se ela não existir
            if (!document.getElementById('kanban-pauta-geral')) {
                const col4 = document.createElement('div');
                col4.className = "bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden h-full max-h-[60vh] lg:max-h-full";
                col4.innerHTML = `
                    <div class="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center shrink-0">
                        <h3 class="font-black text-slate-700 uppercase tracking-widest text-[11px] flex items-center gap-2">📋 Pauta Geral</h3>
                        <div class="flex items-center gap-2">
                            <button id="btn-pauta-completa" class="bg-slate-800 hover:bg-slate-900 text-white font-black text-[9px] uppercase tracking-widest px-3 py-1.5 rounded-lg transition active:scale-95">Ver completa</button>
                            <span id="count-pauta-geral" class="bg-slate-200 text-slate-600 px-2.5 py-1 rounded-lg text-[10px] font-black">0</span>
                        </div>
                    </div>
                    <div id="kanban-pauta-geral" class="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar bg-slate-50/50"></div>
                `;
                grid.appendChild(col4);
                col4.querySelector('#btn-pauta-completa').onclick = () => this.abrirPautaCompleta();
            }

            // Altera o título da 3ª coluna para "Meus Concluídos"
            const titleCol3 = document.querySelector('#kanban-auditoria')?.previousElementSibling?.querySelector('h3');
            if (titleCol3) titleCol3.innerHTML = '✅ Meus Concluídos';
        }
    },

    // O index.html liga no botão um listener que recarrega a lista de pautas. Recriamos o botão
    // para que, dentro de um atendimento, "Voltar" leve à Mesa (kanban) e não à lista de pautas.
    _configurarBotaoVoltar(modo) {
        if (this._modoVoltar === modo) return;
        const antigo = document.getElementById('btn-voltar-portal');
        if (!antigo) return;
        const btn = antigo.cloneNode(true);
        antigo.replaceWith(btn);
        const spans = btn.querySelectorAll('span');
        if (modo === 'mesa') {
            if (spans[0]) spans[0].textContent = 'Voltar à Mesa';
            if (spans[1]) spans[1].textContent = 'Voltar';
            btn.title = 'Voltar à Mesa de Trabalho';
            btn.onclick = () => {
                if (this.unsubscribeAssistido) { this.unsubscribeAssistido(); this.unsubscribeAssistido = null; }
                this.assistidoId = null;
                this.assistidoData = null;
                this.renderizarKanban();
            };
        } else {
            if (spans[0]) spans[0].textContent = 'Voltar às Pautas';
            if (spans[1]) spans[1].textContent = 'Voltar';
            btn.title = 'Voltar ao Portal de Pautas';
            btn.onclick = () => { window.location.href = window.location.pathname; };
        }
        this._modoVoltar = modo;
    },

    renderizarKanban() {
        this._configurarBotaoVoltar('portal');
        document.getElementById('view-dashboard').classList.remove('hidden');
        document.getElementById('view-dashboard').classList.add('flex');
        document.getElementById('view-atendimento').classList.add('hidden');
        document.getElementById('view-atendimento').classList.remove('flex');
        
        const url = new URL(window.location.href);
        if (url.searchParams.has('assistidoId')) {
            url.searchParams.delete('assistidoId');
            window.history.pushState({}, '', url);
        }

        // 1. FILA DE ESPERA
        const espera = this.todosAtendimentosPauta.filter(a => a.status === 'aguardando');
        
        // 2. MINHA MESA (Atendendo agora)
        const mesa = this.todosAtendimentosPauta.filter(a => a.status === 'emAtendimento' && a.assignedCollaborator?.name === this.colaboradorNome);
        
        // 3. MEUS CONCLUÍDOS (O que eu fiz)
        const meusConcluidos = this.todosAtendimentosPauta.filter(a => {
            const isDone = ['atendido', 'aguardandoNumero', 'aguardandoDistribuicao', 'aguardandoCorrecao'].includes(a.status);
            return isDone && (a.enviadoPor === this.colaboradorNome || a.attendedBy === this.colaboradorNome);
        });

        // 4. PAUTA GERAL (Tudo o resto: atendendo por outros, concluído por outros, etc.)
        const pautaGeral = this.todosAtendimentosPauta.filter(a => {
            const isMine = (a.status === 'emAtendimento' && a.assignedCollaborator?.name === this.colaboradorNome) || 
                           (['atendido', 'aguardandoNumero', 'aguardandoDistribuicao', 'aguardandoCorrecao'].includes(a.status) && (a.enviadoPor === this.colaboradorNome || a.attendedBy === this.colaboradorNome));
            const isEspera = a.status === 'aguardando';
            return !isMine && !isEspera && a.status !== 'faltoso';
        });

        espera.sort((a,b) => (a.checkInOrder || 0) - (b.checkInOrder || 0));
        mesa.sort((a,b) => new Date(b.inAttendanceTime || 0) - new Date(a.inAttendanceTime || 0));
        meusConcluidos.sort((a,b) => new Date(b.attendedAt || b.inAttendanceTime || 0) - new Date(a.attendedAt || a.inAttendanceTime || 0));
        pautaGeral.sort((a,b) => new Date(b.attendedAt || b.inAttendanceTime || 0) - new Date(a.attendedAt || a.inAttendanceTime || 0));

        this._injetarCardsColuna('kanban-espera', 'count-espera', espera, 'puxar', 'Ninguém na fila.');
        this._injetarCardsColuna('kanban-mesa', 'count-mesa', mesa, 'mesa', 'Sua mesa está limpa.');
        this._injetarCardsColuna('kanban-auditoria', 'count-auditoria', meusConcluidos, 'auditoria', 'Nenhum concluído por você.');
        this._injetarCardsColuna('kanban-pauta-geral', 'count-pauta-geral', pautaGeral, 'auditoria', 'Sem outros casos em andamento.');

        this._setupAcoesCards();
        this._aplicarFiltroKanban();
    },

    // Clicar em qualquer ponto do card (fora de botões/links) abre o histórico do checklist
    _ligarCliqueNosCards() {
        if (this._cliqueCardsPronto) return;
        this._cliqueCardsPronto = true;
        document.addEventListener('click', (e) => {
            if (e.target.closest('a, button, input, select, textarea')) return;
            const card = e.target.closest('.kanban-card[data-assistido-id]');
            if (card) this.abrirHistoricoRapido(card.dataset.assistidoId);
        });
    },

    // Abas Encerramento / Histórico da tela individual (se existirem no HTML)
    setupListeners() {
        document.getElementById('tab-btn-encerramento')?.addEventListener('click', () => this.switchTab('encerramento'));
        document.getElementById('tab-btn-historico')?.addEventListener('click', () => this.switchTab('historico'));
    },

    switchTab(tab) {
        const btnEnc = document.getElementById('tab-btn-encerramento');
        const btnHis = document.getElementById('tab-btn-historico');
        const abaEnc = document.getElementById('aba-encerramento');
        const abaHis = document.getElementById('aba-historico');
        if (!abaEnc || !abaHis) return;
        const ativo = 'flex-1 py-3.5 text-center font-black text-[11px] uppercase tracking-widest border-b-2 transition-colors';
        const inativo = 'flex-1 py-3.5 text-center font-bold text-[11px] uppercase tracking-widest text-slate-400 border-b-2 border-transparent hover:text-slate-600 transition-colors';
        if (tab === 'encerramento') {
            if (btnEnc) btnEnc.className = `${ativo} text-slate-800 border-slate-800`;
            if (btnHis) btnHis.className = inativo;
            abaEnc.classList.remove('hidden'); abaHis.classList.add('hidden');
        } else {
            if (btnHis) btnHis.className = `${ativo} text-indigo-600 border-indigo-600`;
            if (btnEnc) btnEnc.className = inativo;
            abaHis.classList.remove('hidden'); abaEnc.classList.add('hidden');
        }
    },

    _aplicarFiltroKanban() {
        const searchInput = document.getElementById('kanban-search');
        const termo = (searchInput?.value || '').toLowerCase().trim();
        document.querySelectorAll('#view-dashboard .kanban-card').forEach(card => {
            card.style.display = !termo || card.textContent.toLowerCase().includes(termo) ? '' : 'none';
        });
    },

    prepararFiltroKanban() {
        const searchInput = document.getElementById('kanban-search');
        if (!searchInput || searchInput.dataset.filtroPronto) return;
        searchInput.dataset.filtroPronto = '1';
        searchInput.addEventListener('input', () => this._aplicarFiltroKanban());
    },

    _injetarCardsColuna(colunaId, countId, lista, modo, msgVazio) {
        const container = document.getElementById(colunaId);
        const count = document.getElementById(countId);
        if (!container || !count) return;

        count.textContent = lista.length;

        if (lista.length === 0) {
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center py-10 opacity-60">
                    <span class="text-3xl text-slate-300 mb-2">${ico('inbox')}</span>
                    <p class="text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">${msgVazio}</p>
                </div>
            `;
            return;
        }
        container.innerHTML = lista.map(item => this._htmlCardKanban(item, modo)).join('');
    },

    _htmlCardKanban(assistido, modo) {
        const st = statusMap[assistido.status] || { cor: 'text-slate-600 border-slate-200 bg-slate-50', txt: assistido.status };
        const urgencia = assistido.priority === 'URGENTE' ? 'border-l-[4px] border-l-red-500' : '';
        const badgeUrgencia = assistido.priority === 'URGENTE' ? `<span class="text-red-500 shrink-0 animate-pulse">${ico('alertCircle', 'w-4 h-4')}</span>` : '';
        
        const baseUrl = window.location.href.split('?')[0];
        const linkIndividual = `${baseUrl}?pautaId=${this.pautaId}&assistidoId=${assistido.id}`;

        const donoLabel = assistido.assignedCollaborator?.name ? `Com ${escapeHTML(assistido.assignedCollaborator.name.split(' ')[0])}` : 
                          (assistido.attendedBy ? `Por ${escapeHTML(assistido.attendedBy.split(' ')[0])}` : '');

        let botoesHtml = '';
        if (this.pautaFechada) {
            botoesHtml = `<div class="mt-3 text-center py-2 bg-slate-100 rounded-lg text-[9px] font-black text-slate-400 uppercase tracking-widest">Pauta Encerrada</div>`;
            if (modo === 'auditoria') {
                botoesHtml = `<a href="${linkIndividual}" class="block mt-3 bg-slate-800 hover:bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest py-2 rounded-lg transition shadow-sm text-center active:scale-95">Auditar / Histórico</a>`;
            }
        } else {
            if (modo === 'puxar') {
                botoesHtml = `<a href="${linkIndividual}" class="block mt-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-[10px] uppercase tracking-widest py-2.5 rounded-xl transition shadow-sm text-center active:scale-95">Atender</a>`;
            } else if (modo === 'mesa') {
                botoesHtml = `
                    <div class="flex gap-2 mt-3">
                        <a href="${linkIndividual}" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] uppercase tracking-widest py-2.5 rounded-xl transition shadow-sm text-center active:scale-95">Abrir</a>
                        <button class="btn-devolver-caso flex-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-black text-[10px] uppercase tracking-widest py-2.5 rounded-xl transition shadow-sm active:scale-95" data-pauta-id="${this.pautaId}" data-assistido-id="${assistido.id}">Devolver</button>
                    </div>`;
            } else {
                botoesHtml = `<button class="btn-auditar-nativo block w-full mt-3 bg-slate-800 hover:bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest py-2 rounded-lg transition shadow-sm text-center active:scale-95" data-assistido-id="${assistido.id}" data-assistido-nome="${escapeHTML(assistido.name)}">Histórico Rápido</button>`;
            }
        }

        return `
            <div class="kanban-card cursor-pointer bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col hover:shadow-md transition-shadow ${urgencia}" data-assistido-id="${assistido.id}" title="Ver histórico do checklist">
                <div class="flex justify-between items-start mb-2 gap-2">
                    <h4 class="font-black text-slate-800 text-sm leading-tight line-clamp-2">${escapeHTML(assistido.name)}</h4>
                    ${badgeUrgencia}
                </div>
                <div class="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 mb-3 truncate">
                    <span class="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0"></span> ${escapeHTML(assistido.subject || 'Sem assunto')}
                </div>
                <div class="flex justify-between items-center mt-auto pt-2 border-t border-slate-100">
                    <span class="text-[9px] font-black px-2 py-1 rounded-md border ${st.cor} uppercase tracking-widest">${st.txt}</span>
                    <span class="font-bold text-[9px] text-slate-400 uppercase truncate max-w-[80px] text-right">${donoLabel}</span>
                </div>
                ${botoesHtml}
            </div>
        `;
    },

    _setupAcoesCards() {
        document.querySelectorAll('.btn-devolver-caso:not([data-bound])').forEach(btn => {
            btn.dataset.bound = '1';
            btn.addEventListener('click', async (e) => {
                const b = e.currentTarget;
                if (!confirm("Devolver este caso para a Fila de Espera?")) return;

                try {
                    await updateDoc(doc(db, "pautas", b.dataset.pautaId, "attendances", b.dataset.assistidoId), {
                        status: 'aguardando', assignedCollaborator: null, inAttendanceTime: null,
                        history: arrayUnion({ action: 'DEVOLVIDO_PARA_FILA', by: this.colaboradorNome, msg: `Devolvido para a fila por ${this.colaboradorNome}`, at: new Date().toISOString() })
                    });
                    if (this.colaboradorAtual?.id) {
                        await updateDoc(doc(db, "pautas", this.pautaId, "collaborators", this.colaboradorAtual.id), { status: 'disponivel', currentAttendance: null }).catch(() => {});
                    }
                    if (typeof showNotification === 'function') showNotification("Caso devolvido.", "info");
                } catch (error) {
                    console.error(error);
                    alert("Erro ao devolver caso.");
                }
            });
        });

        document.querySelectorAll('.btn-auditar-nativo:not([data-bound])').forEach(btn => {
            btn.dataset.bound = '1';
            btn.addEventListener('click', (e) => this.abrirHistoricoRapido(e.currentTarget.dataset.assistidoId));
        });
    },

    // ─── OVERLAYS (histórico rápido e pauta completa) ─────────────────────────

    _criarOverlay(id, titulo, larguraMax = 'max-w-3xl') {
        document.getElementById(id)?.remove();
        const el = document.createElement('div');
        el.id = id;
        el.className = 'fixed inset-0 z-[9999] bg-slate-900/60 flex items-stretch sm:items-center justify-center sm:p-6';
        el.innerHTML = `
            <div class="bg-slate-50 w-full ${larguraMax} sm:rounded-3xl shadow-2xl flex flex-col max-h-full overflow-hidden">
                <div class="flex items-center justify-between gap-3 px-5 py-4 bg-white border-b border-slate-200 shrink-0">
                    <h3 class="font-black text-slate-800 text-sm sm:text-base leading-tight truncate">${titulo}</h3>
                    <button data-fechar class="shrink-0 bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-[10px] uppercase tracking-widest px-4 py-2 rounded-lg active:scale-95">Fechar</button>
                </div>
                <div data-corpo class="flex-1 overflow-y-auto p-4 sm:p-5 custom-scrollbar"></div>
            </div>`;
        document.body.appendChild(el);

        const fechar = () => this._fecharOverlay(id);
        el.querySelector('[data-fechar]').onclick = fechar;
        el.addEventListener('click', (e) => { if (e.target === el) fechar(); });
        if (!this._escOverlayPronto) {
            this._escOverlayPronto = true;
            document.addEventListener('keydown', (e) => {
                if (e.key !== 'Escape') return;
                ['overlay-linha-tempo', 'overlay-historico-rapido', 'overlay-pauta-completa'].forEach(i => { if (document.getElementById(i)) this._fecharOverlay(i); });
            });
        }
        return el.querySelector('[data-corpo]');
    },

    _fecharOverlay(id) {
        document.getElementById(id)?.remove();
        if (id === 'overlay-pauta-completa') this.pautaCompletaAberta = false;
    },

    // Histórico do assistido (checklist, documentos, perfil, gastos...) direto do card, sem depender de módulo externo
    abrirHistoricoRapido(assistidoId) {
        const assistido = this.todosAtendimentosPauta.find(a => a.id === assistidoId);
        if (!assistido) { alert("Assistido não encontrado na pauta."); return; }

        const corpo = this._criarOverlay('overlay-historico-rapido', `Histórico • ${escapeHTML(assistido.name || 'Assistido')}`);
        this._renderizarLadoEsquerdo({ ...assistido, id: assistido.id }, corpo, { botoes: false });

        const btn = document.createElement('button');
        btn.className = 'w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white font-black text-[10px] uppercase tracking-widest py-3 rounded-xl active:scale-95';
        btn.textContent = 'Linha do tempo completa';
        btn.onclick = () => {
            if (typeof window.abrirMonitoramento === 'function') window.abrirMonitoramento(this.pautaId, assistido.id, assistido.name);
            else this.abrirLinhaDoTempo(assistido);
        };
        corpo.appendChild(btn);
    },

    // Linha do tempo nativa, montada a partir de assistido.history
    abrirLinhaDoTempo(assistido) {
        const rotulos = {
            APROVADO_E_CONCLUIDO: 'Concluído', APROVADO_AGUARDANDO_NUMERO: 'Aguardando CNP',
            ENVIADO_PARA_REVISAO: 'Enviado ao defensor', ENVIADO_PARA_CORRECAO: 'Enviado para avaliação',
            DEVOLVIDO_COM_ERRO: 'Devolvido para correção', TRANSFERENCIA_DE_CASO: 'Transferido',
            ATENDIMENTO_PAUSADO: 'Atendimento pausado', DEVOLVIDO_PARA_FILA: 'Devolvido para a fila'
        };
        const eventos = (Array.isArray(assistido.history) ? [...assistido.history] : [])
            .sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0));

        const corpo = this._criarOverlay('overlay-linha-tempo', `Linha do tempo • ${escapeHTML(assistido.name || 'Assistido')}`, 'max-w-xl');
        if (eventos.length === 0) {
            corpo.innerHTML = `<div class="text-center py-16 bg-white rounded-2xl border border-slate-200"><p class="text-xs font-bold uppercase tracking-widest text-slate-500">Nenhuma movimentação registrada.</p></div>`;
            return;
        }
        corpo.innerHTML = `<ol class="relative border-l-2 border-slate-200 ml-3 space-y-5">${eventos.map(ev => {
            const quando = ev.at ? new Date(ev.at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
            return `<li class="ml-5">
                <span class="absolute -left-[7px] w-3 h-3 rounded-full bg-blue-500 border-2 border-white"></span>
                <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <div class="flex justify-between items-start gap-3">
                        <p class="text-xs font-black text-slate-800">${escapeHTML(rotulos[ev.action] || String(ev.action || 'Movimentação').replace(/_/g, ' '))}</p>
                        <span class="text-[10px] font-bold text-slate-400 shrink-0">${quando}</span>
                    </div>
                    ${ev.msg ? `<p class="text-xs text-slate-600 mt-1.5 leading-relaxed">${escapeHTML(ev.msg)}</p>` : ''}
                    ${ev.by ? `<p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-2">por ${escapeHTML(ev.by)}</p>` : ''}
                </div>
            </li>`;
        }).join('')}</ol>`;
    },

    // ─── PAUTA COMPLETA (visível para todos os colaboradores) ─────────────────

    abrirPautaCompleta() {
        this.pautaCompletaAberta = true;
        this._criarOverlay('overlay-pauta-completa', escapeHTML(this.pautaNome), 'max-w-6xl');
        this._renderizarPautaCompleta();
    },

    _renderizarPautaCompleta() {
        const corpo = document.querySelector('#overlay-pauta-completa [data-corpo]');
        if (!corpo) { this.pautaCompletaAberta = false; return; }

        // Guarda quais grupos o usuário abriu/fechou para não perder ao atualizar ao vivo
        corpo.querySelectorAll('details[data-grupo]').forEach(d => { this._gruposPautaEstado[d.dataset.grupo] = d.open; });
        const scrollTop = corpo.scrollTop;

        const todos = this.todosAtendimentosPauta;
        const por = (...status) => todos.filter(a => status.includes(a.status));
        const espera = por('aguardando');
        const atendendo = por('emAtendimento');
        const revisao = por('aguardandoDistribuicao', 'aguardandoCorrecao');
        const concluidos = por('atendido', 'aguardandoNumero');
        const faltosos = por('faltoso');
        const total = todos.length;
        const pct = total > 0 ? Math.round((concluidos.length / total) * 100) : 0;

        if (total === 0) {
            corpo.innerHTML = `<div class="text-center py-20 bg-white rounded-2xl border border-slate-200"><p class="font-black text-slate-700 uppercase tracking-widest text-sm">Pauta vazia</p><p class="text-xs text-slate-500 mt-2">Ainda não há assistidos nesta pauta.</p></div>`;
            return;
        }

        const kpi = (n, label, cor) => `
            <div class="bg-${cor}-50 border border-${cor}-100 rounded-2xl p-4 text-center shadow-sm">
                <div class="text-2xl font-black text-${cor}-600">${n}</div>
                <div class="text-[9px] text-${cor}-600 font-bold uppercase tracking-wider mt-1">${label}</div>
            </div>`;

        const grupo = (titulo, lista, abertoPadrao) => {
            if (lista.length === 0) return '';
            const aberto = this._gruposPautaEstado[titulo] ?? (abertoPadrao ?? lista.length <= 8);
            return `
                <details data-grupo="${titulo}" ${aberto ? 'open' : ''} class="mb-4 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <summary class="p-4 bg-slate-50 text-[11px] font-black text-slate-700 uppercase tracking-widest cursor-pointer select-none flex justify-between items-center hover:bg-slate-100">
                        <span>${titulo} <span class="bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full ml-2">${lista.length}</span></span>
                    </summary>
                    <div class="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        ${lista.map(a => this._htmlCardKanban(a, 'auditoria')).join('')}
                    </div>
                </details>`;
        };

        corpo.innerHTML = `
            <div class="flex items-center justify-between mb-3 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                <div>
                    <p class="font-black text-slate-800 text-sm">${total} ${total === 1 ? 'assistido' : 'assistidos'} na pauta</p>
                    <p class="text-[10px] text-slate-500 uppercase tracking-wider mt-1">${escapeHTML(this.pautaTipo)}${this.pautaFechada ? ' • encerrada' : ''}</p>
                </div>
                <span class="text-sm font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-100">${pct}% concluído</span>
            </div>
            <div class="h-2 bg-slate-200 rounded-full mb-5 overflow-hidden"><div class="h-full bg-emerald-500" style="width:${pct}%"></div></div>
            <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
                ${kpi(espera.length, 'Espera', 'amber')}
                ${kpi(atendendo.length, 'Atendendo', 'blue')}
                ${kpi(revisao.length, 'Com defensor / avaliação', 'cyan')}
                ${kpi(concluidos.length, 'Concluídos', 'emerald')}
                ${kpi(faltosos.length, 'Faltosos', 'red')}
            </div>
            ${grupo('Aguardando', espera.sort((a,b) => (a.checkInOrder || 0) - (b.checkInOrder || 0)))}
            ${grupo('Em atendimento', atendendo)}
            ${grupo('Com defensor / avaliação', revisao)}
            ${grupo('Concluídos', concluidos, false)}
            ${grupo('Faltosos', faltosos, false)}
        `;

        this._setupAcoesCards();
        corpo.scrollTop = scrollTop;
    },

    // ─── RENDERIZAÇÃO: SPLIT-SCREEN (ATENDIMENTO INDIVIDUAL + HISTÓRICO ORIGINAL) 

    renderizarSplitScreen(assistido, pautaData) {
        document.getElementById('view-dashboard').classList.add('hidden');
        document.getElementById('view-dashboard').classList.remove('flex');
        document.getElementById('view-atendimento').classList.remove('hidden');
        document.getElementById('view-atendimento').classList.add('flex');

        const baseUrl = window.location.href.split('?')[0];
        window.history.pushState({}, '', `${baseUrl}?pautaId=${this.pautaId}&assistidoId=${assistido.id}`);

        document.getElementById('assistido-nome').textContent = assistido.name || 'Assistido';
        document.getElementById('assistido-assunto').textContent = assistido.subject || 'Sem assunto';
        
        this._configurarBotaoVoltar('mesa');

        this._renderizarLadoEsquerdo(assistido);

        if (this.pautaFechada) {
            this._renderizarPainelFechado();
        } else if (['atendido', 'aguardandoNumero'].includes(assistido.status)) {
            this._renderizarPainelFinalizado(assistido);
        } else {
            this._renderizarPainelAcoes(assistido, pautaData);
        }
    },

    _renderizarLadoEsquerdo(assistido, container = document.getElementById('aba-historico'), opcoes = {}) {
        const mostrarBotoes = opcoes.botoes !== false;
        if (!container) return;
        let html = '';

        // 1. AVISO DE TRANSFERÊNCIA (SE HOUVER)
        if (assistido.historicoTransferencia) {
            html += `
                <div class="w-full bg-blue-50 border border-blue-200 p-4 rounded-xl shadow-sm mb-6 flex items-start gap-4 relative overflow-hidden">
                    <div class="absolute left-0 top-0 bottom-0 w-1.5 bg-blue-500"></div>
                    <div class="bg-blue-100 p-2 rounded-lg shrink-0 text-blue-600">${ico('refresh', 'w-5 h-5')}</div>
                    <div>
                        <p class="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-1">Última Movimentação</p>
                        <p class="text-xs font-bold leading-relaxed text-slate-700">${escapeHTML(assistido.historicoTransferencia)}</p>
                    </div>
                </div>`;
        }

        // 2. BOTÕES NO TOPO (Editar checklist só aparece se o módulo original estiver carregado)
        const temDetalhes = typeof window.openDetailsModal === 'function';
        if (mostrarBotoes) html += `
            <div class="grid grid-cols-1 ${temDetalhes ? 'sm:grid-cols-2' : ''} gap-4 mb-6">
                ${temDetalhes ? `
                <button id="btn-nativ-docs" class="bg-indigo-600 hover:bg-indigo-700 text-white p-4 rounded-2xl shadow-sm border border-indigo-500 flex flex-col items-center justify-center gap-2 transition-transform active:scale-95 group">
                    <span class="text-2xl text-indigo-200 group-hover:text-white transition-colors">${ico('folder', 'w-8 h-8')}</span>
                    <span class="font-black uppercase tracking-widest text-[10px] text-center">Editar Checklist (Original)</span>
                </button>` : ''}
                <button id="btn-nativ-time" class="bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-2xl shadow-sm border border-blue-500 flex flex-col items-center justify-center gap-2 transition-transform active:scale-95 group">
                    <span class="text-2xl text-blue-200 group-hover:text-white transition-colors">${ico('clock', 'w-8 h-8')}</span>
                    <span class="font-black uppercase tracking-widest text-[10px] text-center">Linha do Tempo Completa</span>
                </button>
            </div>
        `;

        // 3. INJEÇÃO DO HISTÓRICO ORIGINAL DA RECEPÇÃO
        const chk = assistido.documentChecklist || {};
        const baseDeDados = documentsData || window.documentsData || {};
        
        if (!chk.action) {
            html += `<div class="text-center py-10 bg-slate-50 border border-slate-200 rounded-2xl"><span class="text-4xl block mb-2 text-slate-300">${ico('inbox')}</span><p class="text-xs font-bold uppercase tracking-widest text-slate-500">Nenhum checklist da recepção registado.</p></div>`;
        } else {
            const actionData = baseDeDados[chk.action];
            const actionTitle = actionData ? actionData.title : chk.action.replace(/_/g, ' ').toUpperCase();
            
            html += `
                <div class="bg-slate-900 p-5 rounded-2xl mb-6 shadow-md relative overflow-hidden">
                    <p class="text-[10px] text-blue-400 font-black uppercase tracking-widest mb-1.5">Ação Selecionada na Recepção</p>
                    <p class="text-base font-black text-white uppercase leading-tight">${actionTitle}</p>
                </div>`;

            // PERFIL SOCIOECONÔMICO
            if (chk.socioData) {
                const s = chk.socioData;
                let socioHtml = '';
                const addLinha = (label, val) => {
                    if (val && val.trim() !== '' && val !== 'Selecione' && val !== 'R$ 0,00' && !val.includes('Selecione')) {
                        socioHtml += `<div class="flex justify-between items-center py-2 border-b border-slate-100"><span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">${label}</span><span class="text-xs font-bold text-slate-700 text-right w-2/3 break-words">${escapeHTML(val)}</span></div>`;
                    }
                };
                addLinha('Ocupação', s.ocupacao); addLinha('Profissão', s.profissao); addLinha('Estado Civil', s.estadoCivil); addLinha('Renda', s.ganhos); addLinha('Fonte Renda', s.fonteRenda);
                
                if (socioHtml) {
                    html += `
                        <div class="bg-white p-5 rounded-2xl mb-6 border border-slate-200 shadow-sm">
                            <h4 class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-1.5">${ico('user', 'w-3.5 h-3.5')} PERFIL SOCIOECONÔMICO</h4>
                            <div class="space-y-1">${socioHtml}</div>
                        </div>`;
                }
            }

            // LISTA DE DOCUMENTOS
            if (chk.checkedIds && chk.checkedIds.length > 0) {
                html += `<div class="bg-white p-5 rounded-2xl mb-6 border border-slate-200 shadow-sm">
                         <h4 class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-1.5">${ico('fileText', 'w-3.5 h-3.5')} DOCUMENTOS RECOLHIDOS</h4>
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
                    const tipoClass = tipo === 'Físico' ? 'text-amber-700 bg-amber-100 border-amber-200' : 'text-blue-700 bg-blue-100 border-blue-200';
                    html += `
                        <li class="text-xs bg-slate-50 border border-slate-100 p-3 rounded-xl flex justify-between items-center">
                            <span class="font-bold text-slate-700 pr-2 flex items-center gap-2">${ico('checkCircle', 'w-4 h-4 text-emerald-500 shrink-0')} ${docName}</span> 
                            <span class="font-black text-[9px] uppercase tracking-widest ${tipoClass} px-2.5 py-1 rounded-lg border shrink-0">${tipo}</span>
                        </li>`;
                });
                html += `</ul></div>`;
            }
            
            // DEMANDAS ACUMULADAS
            if (assistido.demandas && assistido.demandas.descricoes && assistido.demandas.descricoes.length > 0) {
                html += `
                    <div class="bg-violet-50 p-5 rounded-2xl mb-6 border border-violet-200 shadow-sm relative overflow-hidden">
                        <div class="absolute top-0 left-0 w-1 h-full bg-violet-500"></div>
                        <h4 class="text-[10px] font-black text-violet-800 uppercase tracking-widest mb-3 pl-1 flex items-center gap-1">
                            <span>${ico('scale', 'w-3.5 h-3.5')}</span> DEMANDAS ACUMULADAS
                        </h4>
                        <ul class="space-y-2">
                            ${assistido.demandas.descricoes.map(dem => `<li class="text-xs bg-white p-3 rounded-xl border border-violet-100 shadow-sm flex items-center gap-2 font-medium text-slate-700"><span class="text-violet-500 font-black">•</span> ${escapeHTML(dem)}</li>`).join('')}
                        </ul>
                    </div>
                `;
            }

            // PLANILHA DE GASTOS
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
                        <div class="bg-emerald-50 p-5 rounded-2xl mb-6 border border-emerald-200 shadow-sm">
                            <h4 class="text-[10px] font-black text-emerald-800 uppercase tracking-widest mb-4 flex items-center gap-1.5">
                                <span>${ico('coins', 'w-3.5 h-3.5')}</span> PLANILHA DE GASTOS
                            </h4>
                            <div class="space-y-1 mb-4">
                                ${gastosHtml}
                            </div>
                            <div class="flex justify-between font-black text-emerald-950 border-t-2 border-emerald-200 pt-4 mt-2 text-sm items-center">
                                <span class="uppercase tracking-widest">TOTAL</span>
                                <span class="bg-white px-3 py-1 rounded-lg shadow-sm border border-emerald-300 text-lg">${totalFormatado}</span>
                            </div>
                            <button data-baixar-planilha class="mt-5 w-full bg-white border border-emerald-300 text-emerald-700 font-black py-3 rounded-xl text-xs hover:bg-emerald-100 transition-colors shadow-sm flex items-center justify-center gap-2 uppercase tracking-widest active:scale-95">
                                ${ico('fileText', 'w-4 h-4')} Baixar planilha PDF
                            </button>
                        </div>
                    `;
                }
            }

            // DADOS DO RÉU
            if (chk.reuData && chk.reuData.checkReuUnico) {
                const reu = chk.reuData;
                html += `
                    <div class="bg-rose-50 p-5 rounded-2xl mb-6 border border-rose-200 shadow-sm">
                        <h4 class="text-[10px] font-black text-rose-800 uppercase tracking-widest mb-4 flex items-center gap-1.5"><span>${ico('user', 'w-3.5 h-3.5')}</span> POLO PASSIVO (RÉU)</h4>
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
        }
        
        container.innerHTML = html;

        const btnPlanilha = container.querySelector('[data-baixar-planilha]');
        if (btnPlanilha) {
            btnPlanilha.onclick = () => {
                const gerar = PDFService?.generatePlanilhaGastosPDF || window.PDFService?.generatePlanilhaGastosPDF;
                const dono = PDFService?.generatePlanilhaGastosPDF ? PDFService : window.PDFService;
                if (typeof gerar === 'function') gerar.call(dono, assistido.name || 'Assistido', assistido.documentChecklist.expenseData);
                else alert("Módulo de PDF não carregado.");
            };
        }

        if (!mostrarBotoes) return;

        // VINCULANDO AÇÕES AOS BOTÕES NATIVOS (DETALHES.JS E MONITORAMENTO.JS)
        setTimeout(() => {
            const btnDocs = container.querySelector('#btn-nativ-docs');
            const btnTime = container.querySelector('#btn-nativ-time');
            
            if (btnDocs) {
                btnDocs.addEventListener('click', () => {
                    if (typeof window.openDetailsModal === 'function') {
                        window.openDetailsModal({ assistedId: assistido.id, pautaId: this.pautaId, allAssisted: this.todosAtendimentosPauta, db: db });
                    } else if (window.openDetailsModal) {
                        window.openDetailsModal(assistido, this.pautaId);
                    } else {
                        alert("Módulo de Detalhes Original não carregado na página.");
                    }
                });
            }

            if (btnTime) {
                btnTime.addEventListener('click', () => {
                    if (window.abrirMonitoramento) window.abrirMonitoramento(this.pautaId, assistido.id, assistido.name);
                    else this.abrirLinhaDoTempo(assistido);
                });
            }
        }, 100);
    },

    _renderizarPainelFechado() {
        const aba = document.getElementById('aba-encerramento');
        aba.innerHTML = `
            <div class="text-center p-6 bg-red-50 rounded-2xl border border-red-200 shadow-sm mt-4 mb-6">
                <div class="w-14 h-14 bg-red-500 rounded-full flex items-center justify-center text-white mx-auto shadow-sm mb-4">${ico('lock', 'w-6 h-6')}</div>
                <h2 class="text-lg font-black text-red-800 uppercase tracking-wider mb-2">Pauta Fechada</h2>
                <p class="text-xs font-bold text-red-700 leading-relaxed">O Coordenador fechou a pauta. Você está em modo somente leitura. Nenhuma ação pode ser executada neste assistido.</p>
            </div>
            <button onclick="document.getElementById('btn-voltar-portal').click()" class="w-full bg-slate-800 hover:bg-slate-900 text-white font-black py-4 rounded-xl shadow-md transition-all text-xs uppercase tracking-widest active:scale-95">Voltar para a Mesa</button>
        `;
    },

    _renderizarPainelFinalizado(assistido) {
        const aba = document.getElementById('aba-encerramento');
        aba.innerHTML = `
            <div class="text-center p-6 bg-emerald-50 rounded-2xl border border-emerald-200 shadow-sm mt-4 mb-6">
                <div class="w-14 h-14 bg-emerald-500 rounded-full flex items-center justify-center text-white mx-auto shadow-sm mb-4">${ico('check', 'w-8 h-8')}</div>
                <h2 class="text-lg font-black text-emerald-800 uppercase tracking-wider mb-2">Protocolo Concluído</h2>
                <p class="text-xs font-bold text-emerald-700 leading-relaxed">Atendimento salvo por <b>${escapeHTML(assistido.attendedBy || 'Servidor')}</b>.</p>
                ${assistido.numeroProcesso ? `<div class="mt-4 pt-3 border-t border-emerald-200"><span class="bg-white px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-900 font-mono text-sm font-black shadow-sm">CNP: ${escapeHTML(assistido.numeroProcesso)}</span></div>` : ''}
            </div>
            <button onclick="document.getElementById('btn-voltar-portal').click()" class="w-full bg-slate-800 hover:bg-slate-900 text-white font-black py-4 rounded-xl shadow-md transition-all text-xs uppercase tracking-widest mb-3 active:scale-95">Voltar para a Mesa</button>
        `;
    },

    _renderizarPainelAcoes(assistido, pautaData) {
        const aba = document.getElementById('aba-encerramento');
        const isDefensor = this.colaboradorAtual?.cargo?.toLowerCase().includes('defensor');
        const showDistribuicao = pautaData.useDistributionFlow && !isDefensor;

        let html = `
            <div class="grid grid-cols-1 gap-3 mb-6">
                <button id="btn-opt-direto" class="fluxo-opt-btn bg-emerald-50 border border-emerald-300 ring-2 ring-emerald-100 p-4 rounded-2xl text-left transition-all shadow-md group">
                    <span class="block text-emerald-600 mb-1">${ico('checkCircle', 'w-7 h-7')}</span>
                    <span class="block font-black text-slate-800 text-sm mt-2">${isDefensor ? "Concluir / Assinar" : "Finalizar Protocolo"}</span>
                    <span class="block text-[10px] text-slate-500 mt-1 uppercase tracking-wider font-bold">Encerrar o caso</span>
                </button>
        `;

        if (showDistribuicao) {
            html += `
                <button id="btn-opt-dist" class="fluxo-opt-btn bg-white border border-slate-200 p-4 rounded-2xl text-left transition-all hover:bg-blue-50 hover:border-blue-300 group">
                    <span class="block text-blue-600 mb-1">${ico('send', 'w-7 h-7')}</span>
                    <span class="block font-black text-slate-800 text-sm mt-2">Enviar ao Defensor</span>
                    <span class="block text-[10px] text-slate-500 mt-1 uppercase tracking-wider font-bold">Encaminhar petição</span>
                </button>
                <button id="btn-opt-correcao" class="fluxo-opt-btn bg-white border border-slate-200 p-4 rounded-2xl text-left transition-all hover:bg-amber-50 hover:border-amber-300 group">
                    <span class="block text-amber-600 mb-1">${ico('helpCircle', 'w-7 h-7')}</span>
                    <span class="block font-black text-slate-800 text-sm mt-2">Pedir Avaliação</span>
                    <span class="block text-[10px] text-slate-500 mt-1 uppercase tracking-wider font-bold">Dúvidas com defensor</span>
                </button>
            `;
        }

        if (isDefensor) {
            html += `
                <button id="btn-opt-devolver" class="fluxo-opt-btn bg-white border border-slate-200 p-4 rounded-2xl text-left transition-all hover:bg-orange-50 hover:border-orange-300 group">
                    <span class="block text-orange-600 mb-1">${ico('arrowLeft', 'w-7 h-7')}</span>
                    <span class="block font-black text-slate-800 text-sm mt-2">Devolver c/ Erro</span>
                    <span class="block text-[10px] text-slate-500 mt-1 uppercase tracking-wider font-bold">Retornar ao servidor</span>
                </button>
            `;
        }

        html += `
            <div class="grid grid-cols-2 gap-3">
                <button id="btn-opt-transferir" class="fluxo-opt-btn bg-white border border-slate-200 p-4 rounded-2xl text-left transition-all hover:bg-indigo-50 hover:border-indigo-300 group">
                    <span class="block text-indigo-600 mb-1">${ico('refresh', 'w-5 h-5')}</span>
                    <span class="block font-black text-slate-800 text-[11px] uppercase mt-2">Transferir</span>
                </button>
                <button id="btn-opt-pausar" class="fluxo-opt-btn bg-white border border-slate-200 p-4 rounded-2xl text-left transition-all hover:bg-slate-100 hover:border-slate-300 group">
                    <span class="block text-slate-600 mb-1">${ico('pause', 'w-5 h-5')}</span>
                    <span class="block font-black text-slate-800 text-[11px] uppercase mt-2">Pausar</span>
                </button>
            </div>
        </div>`;

        html += `
            <div id="secao-demandas-adicionais-externo" class="bg-indigo-50 p-5 rounded-2xl border border-indigo-100 mb-6 shadow-sm">
                <label class="block text-[10px] font-black text-indigo-800 uppercase tracking-widest mb-3 flex items-center gap-1.5"><span>${ico('clipboard', 'w-3.5 h-3.5')}</span> Demandas Adicionais (Estatística)</label>
                <div class="flex gap-2 mb-3">
                    <input type="text" id="input-nova-demanda-externo" class="flex-grow p-3 border border-indigo-200 rounded-xl text-xs outline-none bg-white focus:ring-2 focus:ring-indigo-500 font-medium" placeholder="Ex: Divórcio, Alimentos...">
                    <button type="button" id="btn-add-demanda-externo" class="bg-indigo-600 text-white font-bold px-4 py-3 rounded-xl text-[10px] hover:bg-indigo-700 transition-colors shadow-sm uppercase tracking-wider shrink-0">Adicionar</button>
                </div>
                <div id="container-lista-demandas-externo" class="space-y-1.5 max-h-32 overflow-y-auto pr-1 custom-scrollbar"></div>
            </div>

            <div id="config-numero-processo" class="bg-white p-5 rounded-2xl border border-slate-200 mb-6 shadow-sm space-y-4">
                <div>
                    <label class="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5"><span>${ico('fileText', 'w-3.5 h-3.5')}</span> Nº CNP / Processo (Opcional)</label>
                    <input type="text" id="input-numero-caso" value="${assistido.numeroProcesso || ''}" class="w-full p-3 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none font-mono placeholder:font-sans" placeholder="Ex: 1045239">
                </div>
            </div>

            <div id="config-distribuicao" class="hidden bg-white p-5 rounded-2xl border border-slate-200 mb-6 shadow-sm space-y-4">
                <div>
                    <label class="block text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1.5">Defensor(a)</label>
                    <select id="select-defensor-distribuicao" class="w-full p-3 border border-slate-200 rounded-xl text-xs bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700"></select>
                </div>
                <div>
                    <label class="block text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1.5">Nota Interna</label>
                    <textarea id="notas-distribuicao-dinamico" rows="2" class="w-full p-3 border border-slate-200 rounded-xl text-xs bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 resize-none"></textarea>
                </div>
            </div>

            <div id="config-correcao" class="hidden bg-white p-5 rounded-2xl border border-slate-200 mb-6 shadow-sm space-y-4">
                <div>
                    <label class="block text-[10px] font-black text-amber-500 uppercase tracking-widest mb-1.5">Defensor(a) Avaliador</label>
                    <select id="select-defensor-correcao" class="w-full p-3 border border-slate-200 rounded-xl text-xs bg-slate-50 outline-none focus:ring-2 focus:ring-amber-500 font-bold text-slate-700"></select>
                </div>
                <div>
                    <label class="block text-[10px] font-black text-amber-500 uppercase tracking-widest mb-1.5">Dúvida</label>
                    <textarea id="notas-correcao-dinamico" rows="2" class="w-full p-3 border border-slate-200 rounded-xl text-xs bg-slate-50 outline-none focus:ring-2 focus:ring-amber-500 resize-none"></textarea>
                </div>
            </div>

            <div id="config-devolver" class="hidden bg-white p-5 rounded-2xl border border-slate-200 mb-6 shadow-sm space-y-4">
                <div>
                    <label class="block text-[10px] font-black text-orange-500 uppercase tracking-widest mb-1.5">Devolver para</label>
                    <select id="select-servidor-devolver" class="w-full p-3 border border-slate-200 rounded-xl text-xs bg-slate-50 outline-none focus:ring-2 focus:ring-orange-500 font-bold text-slate-700"></select>
                </div>
                <div>
                    <label class="block text-[10px] font-black text-orange-500 uppercase tracking-widest mb-1.5">Motivo</label>
                    <textarea id="notas-devolver-dinamico" rows="2" class="w-full p-3 border border-slate-200 rounded-xl text-xs bg-slate-50 outline-none focus:ring-2 focus:ring-orange-500 resize-none"></textarea>
                </div>
            </div>

            <div id="config-transferencia" class="hidden bg-white p-5 rounded-2xl border border-slate-200 mb-6 shadow-sm space-y-4">
                <div>
                    <label class="block text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-1.5">Transferir para</label>
                    <select id="select-transferir-colega" class="w-full p-3 border border-slate-200 rounded-xl text-xs bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-700"></select>
                </div>
            </div>

            <button id="btn-finalizar-dinamico" class="w-full bg-slate-900 hover:bg-black text-white font-black py-4 rounded-2xl shadow-lg transition-all text-xs uppercase tracking-widest active:scale-95 flex justify-center items-center gap-2 mt-auto mb-2">
                EXECUTAR AÇÃO ${ico('arrowRight', 'w-4 h-4')}
            </button>
        `;

        aba.innerHTML = html;
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
            'pausar': null
        };

        const setAtivo = (btnClicado, fluxo) => {
            this.fluxoSelecionado = fluxo;
            botoesFluxo.forEach(b => b.className = 'fluxo-opt-btn bg-white border border-slate-200 p-4 rounded-2xl text-left transition-all hover:shadow-md group');
            const coresAvas = {
                'direto': 'bg-emerald-50 border border-emerald-300 ring-2 ring-emerald-100 shadow-md',
                'distribuicao': 'bg-blue-50 border border-blue-300 ring-2 ring-blue-100 shadow-md',
                'correcao': 'bg-amber-50 border border-amber-300 ring-2 ring-amber-100 shadow-md',
                'devolver': 'bg-orange-50 border border-orange-300 ring-2 ring-orange-100 shadow-md',
                'transferir': 'bg-indigo-50 border border-indigo-300 ring-2 ring-indigo-100 shadow-md',
                'pausar': 'bg-slate-100 border border-slate-400 ring-2 ring-slate-200 shadow-md'
            };
            btnClicado.className = `fluxo-opt-btn ${coresAvas[fluxo]} p-4 rounded-2xl text-left transition-all shadow-md group`;

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
            container.innerHTML = `<p class="text-[10px] text-indigo-400 font-medium text-center py-3 bg-white/50 rounded-xl border border-dashed border-indigo-200">Nenhum caso extra somado.</p>`;
            return;
        }

        this.demandasAdicionaisLocais.forEach((dem, index) => {
            const div = document.createElement('div');
            div.className = "flex justify-between items-center bg-white border border-indigo-100 p-2.5 rounded-xl shadow-sm text-xs";
            div.innerHTML = `
                <span class="font-bold text-slate-700 flex items-center gap-1.5">${ico('scale', 'w-3 h-3 text-indigo-400')} ${escapeHTML(dem)}</span>
                <button type="button" class="text-[9px] font-bold text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-2 py-1 rounded-lg transition-colors" data-index="${index}">Remover</button>
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

        const numProcessoSeguro = document.getElementById('input-numero-caso')?.value.trim() || '';
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
                if (enviadoPorColaborador) mapaProdutividadeBI[enviadoPorColaborador] = 1; 
                mapaProdutividadeBI[colabSeguro] = 1; 

                let statusDestinoFinal = 'aguardandoNumero';
                if (numProcessoSeguro || !temDistribuicaoAtiva) statusDestinoFinal = 'atendido';

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
            
            document.getElementById('btn-voltar-portal').click();

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
    }
};

export default AtendimentoExternoService;
window.AtendimentoExternoService = AtendimentoExternoService;
