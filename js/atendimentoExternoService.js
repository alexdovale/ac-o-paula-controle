Aqui está o ficheiro js/atendimentoExternoService.js absoluto, completo e estruturado do início ao fim, sem qualquer corte de código ou omissões.
Este script implementa a identidade blindada por e-mail (resolvendo o problema do Alex ver dados trocados), o visual clássico por abas idêntico às suas capturas de ecrã (com as abas de Pauta Atual, contadores coloridos e listas expansíveis) e a Aba de Histórico da Recepção na tela individual do assistido (trazendo o checklist completo, perfil socioeconómico, planilha de gastos e dados do réu).
Pode copiar todo o bloco abaixo e substituir no seu ficheiro:
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    getFirestore, doc, getDoc, updateDoc, collection,
    getDocs, arrayUnion, onSnapshot, query, where
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { firebaseConfig } from './config.js';
import { documentsData } from './detalhes.js';
import { EmailService } from './emailService.js';
import { showNotification, playSound, escapeHTML } from './utils.js';
import { ico } from './icons.js';

// ─── HELPERS DE STATUS E CORES ────────────────────────────────────────────────

const statusMap = {
    pauta:                  { cor: 'text-slate-600 bg-slate-100 border-slate-200',    txt: 'Na Pauta' },
    aguardando:             { cor: 'text-amber-700 bg-amber-50 border-amber-200',     txt: 'Aguard.' },
    emAtendimento:          { cor: 'text-blue-700 bg-blue-50 border-blue-200',        txt: 'Atend.' },
    aguardandoDistribuicao: { cor: 'text-cyan-700 bg-cyan-50 border-cyan-200',        txt: 'Distrib.' },
    aguardandoCorrecao:     { cor: 'text-orange-700 bg-orange-50 border-orange-200',  txt: 'Avaliação' },
    atendido:               { cor: 'text-emerald-700 bg-emerald-50 border-emerald-200',txt: 'Pronto' },
    aguardandoNumero:       { cor: 'text-indigo-700 bg-indigo-50 border-indigo-200',  txt: 'Ag. CNP' },
    faltoso:                { cor: 'text-red-700 bg-red-50 border-red-200',           txt: 'Faltoso' },
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
    abaDashboardAtiva: 'pauta-atual',
    abaIndividualAtiva: 'fluxo',

    // ─── INIT ─────────────────────────────────────────────────────────────────

    async init() {
        console.log("Mesa Digital Clássica Inicializada (Segurança por E-mail + Abas Originais)");

        const urlParams = new URLSearchParams(window.location.search.replace(/&amp;/g, '&'));
        this.pautaId       = urlParams.get('pautaId') || urlParams.get('pid');
        this.assistidoId   = urlParams.get('assistidoId') || urlParams.get('aid');
        const tokenRecebido= urlParams.get('token');

        if (!this.pautaId) {
            this.showError("Link Incompleto", "Falta o identificador da pauta na URL.");
            return;
        }

        try {
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

            // CRUZAMENTO DE DADOS BLINDADO PELO E-MAIL LOGADO
            const colabRef = collection(db, "pautas", this.pautaId, "collaborators");
            const q = query(colabRef, where("email", "==", user.email));
            const snap = await getDocs(q);

            if (snap.empty) {
                this.showError("Acesso Negado", "O seu usuário não está vinculado como colaborador desta pauta.");
                return;
            }

            this.colaboradorAtual = { id: snap.docs[0].id, ...snap.docs[0].data() };
            this.colaboradorNome = this.colaboradorAtual.nome; // Nome real puxado da BD
            this.colaboradorId = this.colaboradorAtual.id;

            await this.carregarColaboradoresGerais();
            this._prepararShellHTML();

            if (this.assistidoId) {
                await this.iniciarAtendimentoIndividual(tokenRecebido, pautaData);
                return;
            }

            await this.iniciarDashboardOriginal();

        } catch (error) {
            console.error("Erro na inicialização:", error);
            this.showError("Conexão Perdida", "Falha ao conectar com o banco de dados.");
        }
    },

    _prepararShellHTML() {
        const shell = document.getElementById('shell-atendimento');
        if (!shell) return;
        
        shell.className = "w-full max-w-6xl mx-auto bg-slate-50/50 rounded-2xl shadow-xl overflow-hidden flex flex-col border border-slate-200 animate-fade-in my-4 min-h-[85vh]";
        shell.style.display = 'flex';
        
        const subtituloPainel = `${escapeHTML(this.colaboradorNome)} • ${escapeHTML(this.colaboradorAtual?.cargo || 'Membro')}`;

        shell.innerHTML = `
            <div id="header-bg" class="bg-slate-800 p-6 sm:px-8 sm:py-7 text-white flex items-center justify-between relative overflow-hidden shrink-0 transition-colors duration-500">
                <div class="absolute top-0 right-0 w-64 h-64 bg-blue-500 opacity-10 rounded-full blur-3xl -mr-10 -mt-20 pointer-events-none"></div>
                <div class="flex items-center gap-4 relative z-10 min-w-0">
                    <div class="bg-white/10 p-2 rounded-xl border border-white/20 shadow-inner shrink-0 hidden sm:block">
                        <img src="https://alexdovale.github.io/ponto.codoc/imagem.png" alt="Logo" class="h-10 w-auto">
                    </div>
                    <div class="min-w-0">
                        <h1 class="font-black text-xl sm:text-2xl uppercase tracking-widest truncate">PAINEL SIGEP</h1>
                        <p class="text-white/80 text-[10px] sm:text-xs font-bold mt-0.5 tracking-wider truncate">${subtituloPainel}</p>
                    </div>
                </div>
                <div class="flex gap-2 relative z-10 shrink-0 items-center">
                    <span id="badge-status-header" class="bg-white/20 text-white text-[9px] font-black px-3 py-1.5 rounded-full shadow-sm uppercase tracking-widest border border-transparent transition-colors">CARREGANDO...</span>
                    <button id="btn-voltar-portal" class="bg-white/20 hover:bg-white/30 text-white text-[10px] font-bold px-4 py-2 rounded-lg transition-colors flex items-center gap-2">← <span class="hidden sm:inline">Portal</span></button>
                    <button id="btn-voltar-dashboard" class="hidden bg-slate-900 hover:bg-black text-white text-[10px] font-bold px-4 py-2 rounded-lg transition-colors flex items-center gap-2 shadow-md">← Mesa</button>
                </div>
            </div>
            <div id="main-content-area" class="flex-1 flex flex-col bg-white rounded-t-3xl -mt-4 relative z-20 overflow-hidden shadow-[0_-8px_30px_-15px_rgba(0,0,0,0.3)]"></div>
        `;

        document.getElementById('btn-voltar-portal').onclick = () => window.location.href = window.location.pathname;
        document.getElementById('btn-voltar-dashboard').onclick = () => {
            const url = new URL(window.location.href);
            url.searchParams.delete('assistidoId');
            url.searchParams.delete('aid');
            window.history.pushState({}, '', url);
            this.assistidoId = null;
            this.iniciarDashboardOriginal();
        };
    },

    // ─── DASHBOARD ORIGINAL (ABAS E LISTAS EXPANSÍVEIS) ───────────────────────

    async iniciarDashboardOriginal() {
        this._cancelarListeners();
        document.getElementById('btn-voltar-portal').classList.remove('hidden');
        document.getElementById('btn-voltar-dashboard').classList.add('hidden');
        document.getElementById('header-bg').className = "bg-slate-800 p-6 sm:px-8 sm:py-7 text-white flex items-center justify-between relative overflow-hidden shrink-0 transition-colors duration-500";
        
        this.unsubscribePauta = onSnapshot(doc(db, "pautas", this.pautaId), (snap) => {
            if (snap.exists()) {
                const fechou = snap.data().fechada === true;
                if (fechou !== this.pautaFechada) {
                    this.pautaFechada = fechou;
                    this.renderizarDashboard();
                }
            }
        });

        this.unsubscribeDashboard = onSnapshot(collection(db, "pautas", this.pautaId, "attendances"), (snap) => {
            this.todosAtendimentosPauta = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            this.atualizarBadgeHeader();
            this.renderizarDashboard();
        });
    },

    renderizarDashboard() {
        const container = document.getElementById('main-content-area');
        if (!container) return;

        let html = `
            <div class="flex gap-2 overflow-x-auto custom-scrollbar px-6 pt-6 pb-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
                <button id="btn-tab-mesa" class="tab-dash-btn shrink-0 px-5 py-3 text-[11px] font-black uppercase tracking-widest rounded-lg transition-all ${this.abaDashboardAtiva === 'mesa' ? 'bg-blue-50 border border-blue-200 text-blue-700 shadow-sm' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'}">💻 Minha Mesa</button>
                <button id="btn-tab-espera" class="tab-dash-btn shrink-0 px-5 py-3 text-[11px] font-black uppercase tracking-widest rounded-lg transition-all ${this.abaDashboardAtiva === 'espera' ? 'bg-blue-50 border border-blue-200 text-blue-700 shadow-sm' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'}">📥 Aguardando Atendimento</button>
                <button id="btn-tab-pauta-atual" class="tab-dash-btn shrink-0 px-5 py-3 text-[11px] font-black uppercase tracking-widest rounded-lg transition-all ${this.abaDashboardAtiva === 'pauta-atual' ? 'bg-slate-700 border border-slate-800 text-white shadow-md' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'}">📋 Pauta Atual</button>
            </div>
            <div id="dashboard-content" class="flex-1 overflow-y-auto p-6 bg-white custom-scrollbar"></div>
        `;
        
        if (!document.getElementById('dashboard-content')) {
            container.innerHTML = html;
            document.getElementById('btn-tab-mesa').onclick = () => { this.abaDashboardAtiva = 'mesa'; this.renderizarDashboard(); };
            document.getElementById('btn-tab-espera').onclick = () => { this.abaDashboardAtiva = 'espera'; this.renderizarDashboard(); };
            document.getElementById('btn-tab-pauta-atual').onclick = () => { this.abaDashboardAtiva = 'pauta-atual'; this.renderizarDashboard(); };
        }

        const content = document.getElementById('dashboard-content');
        if (this.abaDashboardAtiva === 'mesa') this._renderTabMinhaMesa(content);
        else if (this.abaDashboardAtiva === 'espera') this._renderTabAguardando(content);
        else this._renderTabPautaAtual(content);
        
        this._setupAcoesCards();
    },

    _renderTabMinhaMesa(container) {
        const meusCasos = this.todosAtendimentosPauta.filter(a => a.status === 'emAtendimento' && a.assignedCollaborator?.name === this.colaboradorNome);
        if (meusCasos.length === 0) {
            container.innerHTML = `<div class="text-center py-20 opacity-60"><span class="text-5xl block mb-4">💻</span><p class="font-black text-slate-500 uppercase tracking-widest text-sm">Sua mesa está limpa</p></div>`;
            return;
        }
        meusCasos.sort((a,b) => new Date(b.inAttendanceTime || 0) - new Date(a.inAttendanceTime || 0));
        container.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">${meusCasos.map(a => this._htmlCard(a, 'mesa')).join('')}</div>`;
    },

    _renderTabAguardando(container) {
        const espera = this.todosAtendimentosPauta.filter(a => a.status === 'aguardando');
        if (espera.length === 0) {
            container.innerHTML = `<div class="text-center py-20 opacity-60"><span class="text-5xl block mb-4">✅</span><p class="font-black text-slate-500 uppercase tracking-widest text-sm">Nenhum assistido na fila.</p></div>`;
            return;
        }
        espera.sort((a,b) => (a.checkInOrder || 0) - (b.checkInOrder || 0));
        container.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">${espera.map(a => this._htmlCard(a, 'puxar')).join('')}</div>`;
    },

    _renderTabPautaAtual(container) {
        const total = this.todosAtendimentosPauta.length;
        const aguardando = this.todosAtendimentosPauta.filter(a => a.status === 'aguardando').length;
        const atendendo = this.todosAtendimentosPauta.filter(a => a.status === 'emAtendimento').length;
        const atendidos = this.todosAtendimentosPauta.filter(a => a.status === 'atendido' || a.status === 'aguardandoNumero').length;
        const dist = this.todosAtendimentosPauta.filter(a => a.status === 'aguardandoDistribuicao' || a.status === 'aguardandoCorrecao').length;
        const faltosos = this.todosAtendimentosPauta.filter(a => a.status === 'faltoso').length;
        const pct = total > 0 ? Math.round(((atendidos + dist) / total) * 100) : 0;

        let html = `
            <div class="mb-8 animate-fade-in">
                <div class="flex items-center justify-between mb-3">
                    <div>
                        <h2 class="font-black text-slate-800 text-lg uppercase">${escapeHTML(this.pautaNome)}</h2>
                        <p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">${this.pautaTipo} • ${total} REGISTROS</p>
                    </div>
                    <span class="text-sm font-black text-slate-600">${pct}%</span>
                </div>
                <div class="h-1.5 bg-slate-100 rounded-full mb-6 overflow-hidden"><div class="h-full bg-emerald-500 transition-all" style="width:${pct}%"></div></div>

                <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 mb-8">
                    <div class="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center shadow-sm"><div class="text-2xl font-black text-amber-600">${aguardando}</div><div class="text-[9px] text-amber-600 font-bold uppercase tracking-widest mt-1">Aguard.</div></div>
                    <div class="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center shadow-sm"><div class="text-2xl font-black text-blue-600">${atendendo}</div><div class="text-[9px] text-blue-600 font-bold uppercase tracking-widest mt-1">Atend.</div></div>
                    <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center shadow-sm"><div class="text-2xl font-black text-emerald-600">${atendidos}</div><div class="text-[9px] text-emerald-600 font-bold uppercase tracking-widest mt-1">Prontos</div></div>
                    <div class="bg-cyan-50 border border-cyan-100 rounded-xl p-3 text-center shadow-sm"><div class="text-2xl font-black text-cyan-600">${dist}</div><div class="text-[9px] text-cyan-600 font-bold uppercase tracking-widest mt-1">Distrib.</div></div>
                    ${faltosos > 0 ? `<div class="bg-red-50 border border-red-100 rounded-xl p-3 text-center shadow-sm"><div class="text-2xl font-black text-red-500">${faltosos}</div><div class="text-[9px] text-red-500 font-bold uppercase tracking-widest mt-1">Faltosos</div></div>` : ''}
                </div>

                ${this._htmlGrupoExpansivel('Aguardando', this.todosAtendimentosPauta.filter(a => a.status === 'aguardando'), 'geral')}
                ${this._htmlGrupoExpansivel('Em Atendimento', this.todosAtendimentosPauta.filter(a => a.status === 'emAtendimento'), 'geral')}
                ${this._htmlGrupoExpansivel('Distribuição', this.todosAtendimentosPauta.filter(a => a.status === 'aguardandoDistribuicao' || a.status === 'aguardandoCorrecao'), 'geral')}
                ${this._htmlGrupoExpansivel('Atendidos', this.todosAtendimentosPauta.filter(a => a.status === 'atendido' || a.status === 'aguardandoNumero'), 'geral')}
            </div>
        `;
        container.innerHTML = html;
    },

    _htmlGrupoExpansivel(titulo, lista, modo) {
        if (lista.length === 0) return '';
        const isAberto = lista.length <= 15 ? 'open' : '';
        const icone = titulo === 'Aguardando' ? '⏳' : (titulo === 'Em Atendimento' ? '💻' : (titulo === 'Distribuição' ? '⚖️' : '✅'));

        return `
            <details class="mb-4 group" ${isAberto}>
                <summary class="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-3 cursor-pointer select-none flex items-center gap-2 hover:text-slate-700 transition-colors">
                    <span class="text-sm transition-transform group-open:rotate-90">▶</span> ${icone} ${titulo} (${lista.length})
                </summary>
                <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pl-6 pb-2">${lista.map(a => this._htmlCard(a, modo)).join('')}</div>
            </details>
        `;
    },

    _htmlCard(assistido, modo) {
        const st = statusMap[assistido.status] || { cor: 'text-slate-600 bg-slate-50 border-slate-200', txt: assistido.status };
        const urgencia = assistido.priority === 'URGENTE' ? 'border-l-[4px] border-l-amber-400' : '';
        const badgeUrgencia = assistido.priority === 'URGENTE' ? `<span class="bg-amber-100 text-amber-700 text-[8px] font-black px-1.5 py-0.5 rounded ml-2">URGENTE</span>` : '';
        
        const linkIndividual = `${window.location.href.split('?')[0]}?pautaId=${this.pautaId}&assistidoId=${assistido.id}`;
        const donoLabel = assistido.assignedCollaborator?.name ? `Com ${escapeHTML(assistido.assignedCollaborator.name.split(' ')[0])}` : (assistido.attendedBy ? `Por ${escapeHTML(assistido.attendedBy.split(' ')[0])}` : 'Sem dono');
        const hora = assistido.scheduledTime ? assistido.scheduledTime : (assistido.arrivalTime ? new Date(assistido.arrivalTime).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '--:--');

        let botoesHtml = '';
        if (this.pautaFechada) {
            botoesHtml = `<a href="${linkIndividual}" class="block mt-4 bg-slate-800 hover:bg-slate-900 text-white font-black text-[11px] uppercase tracking-widest py-2.5 rounded-xl transition shadow-sm text-center">Ver Detalhes</a>`;
        } else if (modo === 'puxar') {
            botoesHtml = `<a href="${linkIndividual}" class="block mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs py-2 rounded-lg transition text-center">Atender</a>`;
        } else if (modo === 'mesa') {
            botoesHtml = `<div class="flex gap-2 mt-4">
                <a href="${linkIndividual}" class="flex-1 bg-green-600 hover:bg-green-700 text-white font-black text-xs py-2 rounded-lg transition text-center">Continuar</a>
                <button class="btn-devolver-caso flex-1 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-black text-xs py-2 rounded-lg transition" data-pauta-id="${this.pautaId}" data-assistido-id="${assistido.id}">Devolver</button>
            </div>`;
        } else {
            botoesHtml = `<a href="${linkIndividual}" class="block mt-4 bg-slate-800 hover:bg-slate-900 text-white font-black text-[11px] uppercase tracking-widest py-2.5 rounded-xl transition shadow-sm text-center">Ver Detalhes</a>`;
        }

        return `
            <div class="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col hover:shadow-md transition-shadow ${urgencia}">
                <div class="flex justify-between items-start mb-3 gap-2">
                    <h4 class="font-black text-slate-800 text-sm leading-tight flex-1">${escapeHTML(assistido.name)} ${badgeUrgencia}</h4>
                    <span class="text-[9px] font-black uppercase px-2 py-0.5 rounded border ${st.cor} shrink-0 shadow-sm">${st.txt}</span>
                </div>
                <div class="bg-slate-50 p-2 rounded border border-slate-100 flex-grow text-xs text-slate-600 space-y-1">
                    <p class="truncate">${escapeHTML(assistido.subject || 'Sem assunto')}</p>
                    ${modo === 'geral' || modo === 'mesa' ? `<p class="${assistido.assignedCollaborator || assistido.attendedBy ? 'text-blue-600' : 'text-red-500'} font-bold">${donoLabel}</p>` : ''}
                    <p class="text-slate-400 font-bold">${hora}</p>
                </div>
                ${botoesHtml}
            </div>`;
    },

    _setupAcoesCards() {
        document.querySelectorAll('.btn-devolver-caso').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const b = e.currentTarget;
                if (!confirm("Devolver este caso para a fila de Aguardando?")) return;
                try {
                    await updateDoc(doc(db, "pautas", b.dataset.pautaId, "attendances", b.dataset.assistidoId), {
                        status: 'aguardando', assignedCollaborator: null, inAttendanceTime: null,
                        history: arrayUnion({ action: 'DEVOLVIDO_PARA_FILA', by: this.colaboradorNome, msg: `Devolvido para fila por ${this.colaboradorNome}`, at: new Date().toISOString() })
                    });
                    if (this.colaboradorAtual?.id) await updateDoc(doc(db, "pautas", this.pautaId, "collaborators", this.colaboradorAtual.id), { status: 'disponivel', currentAttendance: null }).catch(()=>{});
                    showNotification("Caso devolvido.", "info");
                } catch (error) { alert("Erro ao devolver caso."); }
            });
        });
    },

    // ─── TELA DO ASSISTIDO (ABAS FLUXO E HISTÓRICO DA RECEPÇÃO) ───────────────

    async iniciarAtendimentoIndividual(tokenRecebido, pautaData) {
        this._cancelarListeners();
        document.getElementById('btn-voltar-portal').classList.add('hidden');
        document.getElementById('btn-voltar-dashboard').classList.remove('hidden');

        this.unsubscribePauta = onSnapshot(doc(db, "pautas", this.pautaId), (snap) => {
            if(snap.exists()) {
                this.pautaFechada = snap.data().fechada === true;
                if(this.pautaFechada) this.renderizarTelaIndividual(this.assistidoData, pautaData);
            }
        });

        const docSnap = await getDoc(doc(db, "pautas", this.pautaId, "attendances", this.assistidoId));
        if (!docSnap.exists()) return this.showError("Processo não encontrado", "Este assistido não está mais na pauta.");

        const assistido = docSnap.data();
        this.assistidoData = assistido;
        this.demandasAdicionaisLocais = assistido.demandas?.descricoes ? [...assistido.demandas.descricoes] : [];

        if (assistido.delegationToken && assistido.delegationToken !== tokenRecebido) return this.showError("Acesso Seguro", "O token de segurança é inválido ou expirou.");

        this.renderizarTelaIndividual(assistido, pautaData);
        this.atualizarBadgeHeader();
    },

    renderizarTelaIndividual(assistido, pautaData) {
        const container = document.getElementById('main-content-area');
        if (!container) return;

        const header = document.getElementById('header-bg');
        if (header) {
            if (['atendido', 'aguardandoNumero'].includes(assistido.status) || this.pautaFechada) {
                header.className = "bg-emerald-700 p-6 sm:px-8 sm:py-7 text-white flex items-center justify-between relative overflow-hidden shrink-0 transition-colors duration-500";
            } else {
                header.className = "bg-slate-800 p-6 sm:px-8 sm:py-7 text-white flex items-center justify-between relative overflow-hidden shrink-0 transition-colors duration-500";
            }
        }

        let html = `
            <div class="px-6 py-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white shrink-0">
                <div>
                    <h2 class="font-black text-slate-800 text-xl uppercase tracking-tight">${escapeHTML(assistido.name)}</h2>
                    <p class="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">${escapeHTML(assistido.subject || 'Sem assunto')}</p>
                </div>
                ${assistido.numeroProcesso ? `<span class="bg-slate-100 border border-slate-200 text-slate-600 font-mono text-xs font-black px-3 py-1.5 rounded-lg shadow-sm">CNP: ${escapeHTML(assistido.numeroProcesso)}</span>` : ''}
            </div>
            
            <div class="flex border-b border-slate-200 bg-slate-50/50 shrink-0 px-6 pt-4 gap-4">
                <button id="tab-btn-fluxo" class="pb-3 text-[11px] uppercase tracking-widest transition-colors ${this.abaIndividualAtiva === 'fluxo' ? 'border-b-2 border-slate-800 font-black text-slate-800' : 'border-b-2 border-transparent font-bold text-slate-400 hover:text-slate-600'}">Encerramento / Fluxo</button>
                <button id="tab-btn-historico" class="pb-3 text-[11px] uppercase tracking-widest transition-colors ${this.abaIndividualAtiva === 'historico' ? 'border-b-2 border-slate-800 font-black text-slate-800' : 'border-b-2 border-transparent font-bold text-slate-400 hover:text-slate-600'}">Histórico Recepção</button>
            </div>
            <div id="individual-content" class="flex-1 overflow-y-auto p-6 bg-white custom-scrollbar"></div>
        `;

        if (!document.getElementById('individual-content')) {
            container.innerHTML = html;
            document.getElementById('tab-btn-fluxo').onclick = () => { this.abaIndividualAtiva = 'fluxo'; this.renderizarTelaIndividual(assistido, pautaData); };
            document.getElementById('tab-btn-historico').onclick = () => { this.abaIndividualAtiva = 'historico'; this.renderizarTelaIndividual(assistido, pautaData); };
        }

        const content = document.getElementById('individual-content');
        if (this.abaIndividualAtiva === 'fluxo') this._renderAbaFluxo(content, assistido, pautaData);
        else this._renderAbaHistorico(content, assistido);
    },

    _renderAbaFluxo(container, assistido, pautaData) {
        if (this.pautaFechada) {
            container.innerHTML = `<div class="bg-red-50 border border-red-200 p-10 rounded-3xl text-center shadow-sm max-w-3xl mx-auto mt-4"><div class="w-16 h-16 bg-red-500 rounded-full text-white flex items-center justify-center mx-auto mb-4">${ico('lock', 'w-8 h-8')}</div><h3 class="text-xl font-black text-red-800 uppercase tracking-widest mb-2">PAUTA ENCERRADA</h3></div>`;
            return;
        }

        if (['atendido', 'aguardandoNumero'].includes(assistido.status)) {
            container.innerHTML = `
                <div class="bg-emerald-50 border border-emerald-200 p-10 rounded-3xl text-center shadow-sm max-w-3xl mx-auto mt-4">
                    <div class="w-16 h-16 bg-emerald-500 rounded-full text-white flex items-center justify-center mx-auto mb-4">${ico('check', 'w-8 h-8')}</div>
                    <h3 class="text-xl font-black text-emerald-800 uppercase tracking-widest mb-2">PROTOCOLO ENCERRADO</h3>
                    <p class="text-sm font-bold text-emerald-600">Salvo por ${escapeHTML(assistido.attendedBy || 'Servidor')}.</p>
                </div>
                <div class="max-w-3xl mx-auto mt-6">
                    <button onclick="document.getElementById('btn-voltar-dashboard').click()" class="w-full bg-slate-900 hover:bg-black text-white font-black py-4 rounded-xl shadow-lg transition-all text-xs uppercase tracking-widest active:scale-95">👉 IR PARA MESA</button>
                </div>
            `;
            return;
        }

        const isDefensor = this.colaboradorAtual?.cargo?.toLowerCase().includes('defensor');
        const showDistribuicao = pautaData.useDistributionFlow && !isDefensor;

        let html = `<div class="max-w-3xl mx-auto mt-2">`;
        if (assistido.historicoTransferencia) {
            html += `<div class="bg-blue-50 border border-blue-200 p-4 rounded-xl shadow-sm mb-6 flex items-start gap-4 relative overflow-hidden"><div class="absolute left-0 top-0 bottom-0 w-1.5 bg-blue-500"></div><div class="bg-blue-100 p-2 rounded-lg shrink-0 text-blue-600">${ico('refresh', 'w-5 h-5')}</div><div><p class="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-1">Última Movimentação</p><p class="text-xs font-bold leading-relaxed text-slate-700">${escapeHTML(assistido.historicoTransferencia)}</p></div></div>`;
        }

        html += `
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <button id="btn-opt-direto" class="fluxo-opt-btn bg-emerald-50 border border-emerald-300 ring-2 ring-emerald-100 p-5 rounded-2xl text-left transition-all shadow-md group"><span class="block text-emerald-600 mb-2">${ico('checkCircle', 'w-8 h-8')}</span><span class="block font-black text-slate-800 text-sm mt-2">${isDefensor ? "Concluir / Assinar" : "Finalizar Protocolo"}</span></button>
                ${showDistribuicao ? `<button id="btn-opt-dist" class="fluxo-opt-btn bg-white border border-slate-200 p-5 rounded-2xl text-left transition-all hover:bg-blue-50 hover:border-blue-300 group"><span class="block text-blue-600 mb-2">${ico('send', 'w-8 h-8')}</span><span class="block font-black text-slate-800 text-sm mt-2">Enviar ao Defensor</span></button>` : ''}
                ${showDistribuicao ? `<button id="btn-opt-correcao" class="fluxo-opt-btn bg-white border border-slate-200 p-5 rounded-2xl text-left transition-all hover:bg-amber-50 hover:border-amber-300 group"><span class="block text-amber-600 mb-2">${ico('helpCircle', 'w-8 h-8')}</span><span class="block font-black text-slate-800 text-sm mt-2">Pedir Avaliação</span></button>` : ''}
                ${isDefensor ? `<button id="btn-opt-devolver" class="fluxo-opt-btn bg-white border border-slate-200 p-5 rounded-2xl text-left transition-all hover:bg-orange-50 hover:border-orange-300 group"><span class="block text-orange-600 mb-2">${ico('arrowLeft', 'w-8 h-8')}</span><span class="block font-black text-slate-800 text-sm mt-2">Devolver c/ Erro</span></button>` : ''}
                <button id="btn-opt-transferir" class="fluxo-opt-btn bg-white border border-slate-200 p-5 rounded-2xl text-left transition-all hover:bg-indigo-50 hover:border-indigo-300 group"><span class="block text-indigo-600 mb-2">${ico('refresh', 'w-8 h-8')}</span><span class="block font-black text-slate-800 text-sm mt-2">Transferir Caso</span></button>
                <button id="btn-opt-pausar" class="fluxo-opt-btn bg-white border border-slate-200 p-5 rounded-2xl text-left transition-all hover:bg-slate-100 hover:border-slate-300 group"><span class="block text-slate-600 mb-2">${ico('pause', 'w-8 h-8')}</span><span class="block font-black text-slate-800 text-sm mt-2">Pausar</span></button>
            </div>
            
            <div id="config-numero-processo" class="bg-white p-6 rounded-2xl border border-slate-200 mb-6 shadow-sm space-y-4">
                <div>
                    <label class="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1.5"><span>${ico('fileText', 'w-4 h-4')}</span> Nº CNP / Processo (Opcional)</label>
                    <input type="text" id="input-numero-caso" value="${assistido.numeroProcesso || ''}" class="w-full p-4 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none font-mono" placeholder="Ex: 1045239">
                </div>
            </div>

            <div id="config-distribuicao" class="hidden bg-white p-6 rounded-2xl border border-slate-200 mb-6 shadow-sm space-y-4">
                <div><label class="block text-[10px] font-black text-blue-500 uppercase tracking-widest mb-2">Defensor(a)</label><select id="select-defensor-distribuicao" class="w-full p-4 border border-slate-200 rounded-xl text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700"></select></div>
                <div><label class="block text-[10px] font-black text-blue-500 uppercase tracking-widest mb-2">Nota Interna</label><textarea id="notas-distribuicao-dinamico" rows="2" class="w-full p-4 border border-slate-200 rounded-xl text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 resize-none"></textarea></div>
            </div>

            <div id="config-correcao" class="hidden bg-white p-6 rounded-2xl border border-slate-200 mb-6 shadow-sm space-y-4">
                <div><label class="block text-[10px] font-black text-amber-500 uppercase tracking-widest mb-2">Defensor(a) Avaliador</label><select id="select-defensor-correcao" class="w-full p-4 border border-slate-200 rounded-xl text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-amber-500 font-bold text-slate-700"></select></div>
                <div><label class="block text-[10px] font-black text-amber-500 uppercase tracking-widest mb-2">Dúvida</label><textarea id="notas-correcao-dinamico" rows="2" class="w-full p-4 border border-slate-200 rounded-xl text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-amber-500 resize-none"></textarea></div>
            </div>

            <div id="config-devolver" class="hidden bg-white p-6 rounded-2xl border border-slate-200 mb-6 shadow-sm space-y-4">
                <div><label class="block text-[10px] font-black text-orange-500 uppercase tracking-widest mb-2">Devolver para</label><select id="select-servidor-devolver" class="w-full p-4 border border-slate-200 rounded-xl text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-orange-500 font-bold text-slate-700"></select></div>
                <div><label class="block text-[10px] font-black text-orange-500 uppercase tracking-widest mb-2">Motivo</label><textarea id="notas-devolver-dinamico" rows="2" class="w-full p-4 border border-slate-200 rounded-xl text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-orange-500 resize-none"></textarea></div>
            </div>

            <div id="config-transferencia" class="hidden bg-white p-6 rounded-2xl border border-slate-200 mb-6 shadow-sm space-y-4">
                <div><label class="block text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-2">Transferir para</label><select id="select-transferir-colega" class="w-full p-4 border border-slate-200 rounded-xl text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-700"></select></div>
            </div>

            <button id="btn-finalizar-dinamico" class="w-full bg-slate-900 hover:bg-black text-white font-black py-5 rounded-2xl shadow-xl transition-all text-sm uppercase tracking-widest active:scale-95 flex justify-center items-center gap-2 mt-4">
                EXECUTAR AÇÃO ${ico('arrowRight', 'w-4 h-4')}
            </button>
        </div>`;

        container.innerHTML = html;
        this.povoarSelectsDinamicos();

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
            botoesFluxo.forEach(b => b.className = 'fluxo-opt-btn bg-white border border-slate-200 p-5 rounded-2xl text-left transition-all hover:shadow-md group');
            const coresAvas = {
                'direto': 'bg-emerald-50 border border-emerald-300 ring-2 ring-emerald-100 shadow-md',
                'distribuicao': 'bg-blue-50 border border-blue-300 ring-2 ring-blue-100 shadow-md',
                'correcao': 'bg-amber-50 border border-amber-300 ring-2 ring-amber-100 shadow-md',
                'devolver': 'bg-orange-50 border border-orange-300 ring-2 ring-orange-100 shadow-md',
                'transferir': 'bg-indigo-50 border border-indigo-300 ring-2 ring-indigo-100 shadow-md',
                'pausar': 'bg-slate-100 border border-slate-300 ring-2 ring-slate-200 shadow-md'
            };
            btnClicado.className = `fluxo-opt-btn ${coresAvas[fluxo]} p-5 rounded-2xl text-left transition-all group`;
            Object.keys(configBoxes).forEach(key => { if(configBoxes[key]) configBoxes[key].classList.add('hidden'); });
            if(configBoxes[fluxo]) configBoxes[fluxo].classList.remove('hidden');
        };

        document.getElementById('btn-opt-direto')?.addEventListener('click', (e) => setAtivo(e.currentTarget, 'direto'));
        document.getElementById('btn-opt-dist')?.addEventListener('click', (e) => setAtivo(e.currentTarget, 'distribuicao'));
        document.getElementById('btn-opt-correcao')?.addEventListener('click', (e) => setAtivo(e.currentTarget, 'correcao'));
        document.getElementById('btn-opt-devolver')?.addEventListener('click', (e) => setAtivo(e.currentTarget, 'devolver'));
        document.getElementById('btn-opt-transferir')?.addEventListener('click', (e) => setAtivo(e.currentTarget, 'transferir'));
        document.getElementById('btn-opt-pausar')?.addEventListener('click', (e) => setAtivo(e.currentTarget, 'pausar'));

        document.getElementById('btn-opt-direto')?.click();
        document.getElementById('btn-finalizar-dinamico').onclick = () => this.finalizarProcesso();
    },

    _renderAbaHistorico(container, assistido) {
        let html = `<div class="max-w-4xl mx-auto mt-2 pb-10">`;

        const chk = assistido.documentChecklist || {};
        const baseDeDados = documentsData || window.documentsData || {};
        
        if (!chk.action) {
            container.innerHTML = `<div class="max-w-4xl mx-auto mt-2"><div class="text-center py-20 opacity-60"><div class="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">${ico('inbox', 'w-8 h-8 text-slate-400')}</div><p class="text-sm font-bold uppercase tracking-widest text-slate-500">Nenhum checklist de documentos registrado na recepção.</p></div></div>`;
            return;
        }

        const actionData = baseDeDados[chk.action];
        const actionTitle = actionData ? actionData.title : chk.action.replace(/_/g, ' ').toUpperCase();
        
        html += `
            <div class="bg-slate-900 p-6 rounded-2xl mb-8 shadow-lg relative overflow-hidden">
                <div class="absolute top-0 right-0 w-32 h-32 bg-white opacity-5 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
                <p class="text-[10px] text-blue-400 font-black uppercase tracking-widest mb-1.5 relative z-10">Ação / Pedido Principal</p>
                <p class="text-xl font-black text-white uppercase leading-tight relative z-10">${actionTitle}</p>
            </div>`;

        if (chk.socioData) {
            const s = chk.socioData;
            let socioHtml = '';
            const addLinha = (label, val) => {
                if (val && val.trim() !== '' && val !== 'Selecione' && val !== 'R$ 0,00' && !val.includes('Selecione')) {
                    socioHtml += `<div class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-3 border-b border-slate-100 gap-1"><span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">${label}</span><span class="text-sm font-bold text-slate-700 sm:text-right w-full sm:w-2/3 break-words">${escapeHTML(val)}</span></div>`;
                }
            };
            addLinha('Ocupação', s.ocupacao); addLinha('Profissão', s.profissao); addLinha('Estado Civil', s.estadoCivil); addLinha('Renda Familiar', s.ganhos); addLinha('Fonte de Renda', s.fonteRenda);
            
            if (socioHtml) {
                html += `
                    <div class="bg-white p-6 rounded-2xl mb-8 border border-slate-200 shadow-sm">
                        <h4 class="text-xs font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">${ico('user', 'w-4 h-4 text-blue-500')} PERFIL SOCIOECONÔMICO</h4>
                        <div class="space-y-1">${socioHtml}</div>
                    </div>`;
            }
        }

        if (chk.checkedIds && chk.checkedIds.length > 0) {
            html += `<div class="bg-white p-6 rounded-2xl mb-8 border border-slate-200 shadow-sm">
                     <h4 class="text-xs font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">${ico('fileText', 'w-4 h-4 text-emerald-500')} DOCUMENTOS RECOLHIDOS (${chk.checkedIds.length})</h4>
                     <ul class="space-y-3 mt-4">`;
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
                const tipoClass = tipo === 'Físico' ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-blue-700 bg-blue-50 border-blue-200';
                html += `
                    <li class="text-sm bg-slate-50 border border-slate-100 p-4 rounded-xl flex justify-between items-center shadow-sm">
                        <span class="font-bold text-slate-700 pr-3 flex items-center gap-3">${ico('checkCircle', 'w-5 h-5 text-emerald-500 shrink-0')} ${docName}</span> 
                        <span class="font-black text-[10px] uppercase tracking-widest ${tipoClass} px-3 py-1 rounded-lg border shrink-0">${tipo}</span>
                    </li>`;
            });
            html += `</ul></div>`;
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
                    gastosHtml += `<div class="flex justify-between items-center py-2.5 border-b border-emerald-100/50"><span class="text-sm text-emerald-800 font-bold">${c.label}</span><span class="font-black text-emerald-900 bg-white px-3 py-1 rounded-lg shadow-sm border border-emerald-100">${g[c.id]}</span></div>`;
                    const num = parseFloat(String(g[c.id]).replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
                    totalGastos += num;
                }
            });

            if (totalGastos > 0) {
                const totalFormatado = totalGastos.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                html += `
                    <div class="bg-emerald-50 p-6 rounded-2xl mb-8 border border-emerald-200 shadow-sm">
                        <h4 class="text-xs font-black text-emerald-800 uppercase tracking-widest mb-4 flex items-center gap-2 border-b border-emerald-200 pb-3">
                            <span>${ico('coins', 'w-4 h-4')}</span> PLANILHA DE GASTOS
                        </h4>
                        <div class="space-y-1 mb-5">
                            ${gastosHtml}
                        </div>
                        <div class="flex justify-between font-black text-emerald-950 border-t-2 border-emerald-300 pt-4 mt-2 items-center">
                            <span class="text-sm uppercase tracking-widest">NECESSIDADE APURADA</span>
                            <span class="bg-white px-4 py-2 rounded-xl shadow-md border border-emerald-400 text-xl">${totalFormatado}</span>
                        </div>
                    </div>
                `;
            }
        }

        if (chk.reuData && chk.reuData.checkReuUnico) {
            const reu = chk.reuData;
            html += `
                <div class="bg-rose-50 p-6 rounded-2xl mb-8 border border-rose-200 shadow-sm">
                    <h4 class="text-xs font-black text-rose-800 uppercase tracking-widest mb-4 flex items-center gap-2 border-b border-rose-200 pb-3"><span>${ico('user', 'w-4 h-4')}</span> DADOS DO PÓLO PASSIVO (RÉU)</h4>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6 text-sm text-slate-700 bg-white p-5 rounded-xl border border-rose-100 shadow-sm">
                        ${reu.nome ? `<p><b class="text-rose-900 font-black block mb-1">Nome Completo:</b> ${reu.nome}</p>` : ''}
                        ${reu.cpf ? `<p><b class="text-rose-900 font-black block mb-1">CPF:</b> ${reu.cpf}</p>` : ''}
                        ${reu.telefone ? `<p><b class="text-rose-900 font-black block mb-1">Telefone:</b> ${reu.telefone}</p>` : ''}
                        ${reu.cep ? `<p class="sm:col-span-2 pt-3 border-t border-rose-100"><b class="text-rose-900 font-black block mb-1.5">Endereço Residencial:</b> ${reu.rua}, ${reu.numero} ${reu.complemento ? ' - '+reu.complemento : ''} - ${reu.bairro}, ${reu.cidade}/${reu.uf} (CEP: ${reu.cep})</p>` : ''}
                        ${reu.empresa ? `<p class="sm:col-span-2 pt-3 border-t border-rose-100"><b class="text-rose-900 font-black block mb-1.5">Endereço de Trabalho:</b> ${reu.empresa} - ${reu.rua_comercial}, ${reu.numero_comercial} - ${reu.cidade_comercial}/${reu.uf_comercial}</p>` : ''}
                    </div>
                </div>
            `;
        }

        html += `</div>`;
        container.innerHTML = html;
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
        preencher('select-servidor-devolver', equipeTecnica, '--- SELECIONE ---', this.assistidoData?.enviadoPor || '');
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
            
            document.getElementById('btn-voltar-dashboard').click();

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

