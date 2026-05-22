import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc, collection, getDocs, query, arrayUnion, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { firebaseConfig } from './config.js';
import { documentsData } from './detalhes.js'; 
import { PDFService } from './pdfService.js';
import { EmailService } from './emailService.js'; 

const escapeHTML = (str) => {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
});

export const AtendimentoExternoService = {
    pautaId: null,
    assistidoId: null,
    colaboradorNome: null,
    fluxoSelecionado: null,
    assistidoData: null, 
    todosColaboradores: [],
    colaboradorAtual: null,
    isProcessing: false, 
    todosAtendimentosPauta: [], 
    demandasAdicionaisLocais: [], 
    unsubscribeDashboard: null,

    async init() {
        console.log("⚡ Atendimento Externo Inicializado (Real-time Mode - SIGEP)");

        const searchLimpa = window.location.search.replace(/&amp;/g, '&');
        const urlParams = new URLSearchParams(searchLimpa);
        
        this.pautaId = urlParams.get('pautaId') || urlParams.get('amp;pautaId');
        this.assistidoId = urlParams.get('assistidoId') || urlParams.get('amp;assistidoId'); 
        const tokenRecebido = urlParams.get('token') || urlParams.get('amp;token');
        this.colaboradorNome = urlParams.get('colab') || urlParams.get('amp;colab');
        const telaAtual = urlParams.get('view') || urlParams.get('amp;view'); 

        if (!this.pautaId || !this.colaboradorNome) {
            this.showError("Link Incompleto", "Faltam parâmetros de Pauta ou Colaborador na URL.");
            return;
        }

        try {
            if (!auth.currentUser) {
                await signInAnonymously(auth);
            }
            
            await this.carregarColaboradoresGerais();

            if (!this.colaboradorAtual) {
                this.showError("Acesso Negado", "Seu nome não foi encontrado na lista de colaboradores desta pauta.");
                return;
            }

            if (telaAtual === 'dashboard') {
                const sessionKey = `sigep_session_${this.pautaId}_${this.colaboradorNome}`;
                if (!sessionStorage.getItem(sessionKey) && !localStorage.getItem(sessionKey)) {
                    this.renderizarTelaLoginColaborador();
                    return;
                }
                this.renderizarDashboardUnificado();
                return;
            }

            if (!this.assistidoId) {
                this.showError("Link Inválido", "Nenhum processo foi especificado.");
                return;
            }

            const pautaRef = doc(db, "pautas", this.pautaId);
            const pautaDoc = await getDoc(pautaRef);
            if (!pautaDoc.exists()) {
                this.showError("Pauta não localizada", "A pauta informada não existe mais no sistema.");
                return;
            }

            const docRef = doc(db, "pautas", this.pautaId, "attendances", this.assistidoId);
            const docSnap = await getDoc(docRef);

            if (!docSnap.exists()) {
                this.showError("Processo não encontrado", "Este assistido não está mais na pauta ou o link está quebrado.");
                return;
            }

            const assistido = docSnap.data();
            this.assistidoData = assistido;

            this.demandasAdicionaisLocais = (assistido.demandas && assistido.demandas.descricoes) ? [...assistido.demandas.descricoes] : [];

            if (assistido.delegationToken && assistido.delegationToken !== tokenRecebido) {
                this.showError("Acesso Seguro Necessário", "O token de segurança é inválido ou expirou.");
                return;
            }

            this.renderizarInterface(assistido, pautaDoc.data());
            this.setupListeners();

        } catch (error) {
            console.error("Erro geral na inicialização:", error);
            this.showError("Conexão Perdida", "Falha ao conectar com o banco de dados principal.");
        }
    },

    atualizarIndicadorDeStatus(pautaData, statusAtual, colaboradorNome) {
        const badge = document.getElementById('status-indicator');
        if (!badge) return;

        const isDelegacaoAtiva = pautaData?.useDelegationFlow === true;

        if (isDelegacaoAtiva) {
            // Modo Delegação: Badge mostra nome fixo
            badge.textContent = `👤 ${colaboradorNome}`;
            badge.className = "absolute top-4 right-4 bg-blue-600 text-white text-[9px] font-black px-2 py-1 rounded-full shadow-lg border border-blue-400 uppercase tracking-widest z-20";
            badge.classList.remove('hidden', 'animate-pulse');
        } else {
            // Modo Finalização Direta: Toggle Livre/Ocupado
            const estaLivre = statusAtual === 'disponivel';
            badge.textContent = estaLivre ? "🟢 LIVRE" : "🔴 OCUPADO";
            badge.className = `absolute top-4 right-4 ${estaLivre ? 'bg-emerald-500' : 'bg-red-500'} text-white text-[9px] font-black px-2 py-1 rounded-full shadow-lg border ${estaLivre ? 'border-emerald-400' : 'border-red-400'} uppercase tracking-widest z-20 ${estaLivre ? 'animate-pulse' : ''}`;
            badge.classList.remove('hidden');
        }
    },

    async carregarColaboradoresGerais() {
        try {
            const snap = await getDocs(collection(db, "pautas", this.pautaId, "collaborators"));
            this.todosColaboradores = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            this.colaboradorAtual = this.todosColaboradores.find(c => c.nome === this.colaboradorNome);
        } catch (error) {
            this.todosColaboradores = [];
        }
    },

    setupRealtimeListenerDashboard() {
        if (this.unsubscribeDashboard) this.unsubscribeDashboard();
        
        const q = query(collection(db, "pautas", this.pautaId, "attendances"));
        this.unsubscribeDashboard = onSnapshot(q, (snap) => {
            this.todosAtendimentosPauta = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            
            if (document.getElementById('lista-dashboard-conteudo')) {
                this.atualizarListasDoDashboard();
            }
        }, (error) => {
            console.error("Erro no realtime dashboard:", error);
        });
    },

    renderizarTelaLoginColaborador() {
        let corpo = document.querySelector('.w-full.max-w-2xl') || document.querySelector('.w-full.max-w-4xl');
        if (!corpo) corpo = document.body;
        
        corpo.className = "w-full max-w-md mx-auto my-10 px-4 animate-fade-in";
        
        corpo.innerHTML = `
            <div class="bg-white p-8 rounded-3xl shadow-2xl border border-gray-100">
                <div class="flex justify-center mb-6">
                    <div class="bg-indigo-50 p-5 rounded-full border-4 border-indigo-100">
                        <span class="text-5xl">🔒</span>
                    </div>
                </div>
                <h2 class="text-2xl font-black text-center text-slate-800 mb-2 uppercase tracking-widest">Acesso Restrito</h2>
                <p class="text-center text-sm text-slate-500 mb-6 leading-relaxed">Olá, <strong class="text-indigo-600">${escapeHTML(this.colaboradorNome)}</strong>! Confirme sua identidade para acessar sua mesa de trabalho do SIGEP.</p>
                
                <form id="form-login-colaborador" class="space-y-5">
                    <div id="login-error-msg" class="hidden bg-red-50 text-red-700 p-4 rounded-xl text-xs font-bold border border-red-200 text-center shadow-inner leading-relaxed"></div>
                    
                    <div>
                        <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 pl-1">E-mail Institucional</label>
                        <input type="email" id="login-colab-email" class="w-full p-4 border border-slate-300 rounded-xl bg-slate-50 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all shadow-sm" required placeholder="Seu e-mail cadastrado">
                    </div>
                    
                    <div>
                        <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 pl-1">Matrícula / ID (Senha)</label>
                        <input type="password" id="login-colab-matricula" class="w-full p-4 border border-slate-300 rounded-xl bg-slate-50 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all shadow-sm" required placeholder="Digite sua matrícula">
                    </div>
                    
                    <div class="flex items-center pt-2">
                        <input type="checkbox" id="lembrar-login-colab" class="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer">
                        <label for="lembrar-login-colab" class="ml-2 block text-xs text-gray-600 font-semibold cursor-pointer">Lembrar meu acesso neste dispositivo</label>
                    </div>

                    <button type="submit" class="w-full bg-slate-800 hover:bg-slate-900 text-white font-black py-4 rounded-xl shadow-lg hover:shadow-xl transition-all text-sm uppercase tracking-widest mt-2">
                        Acessar Minha Mesa
                    </button>
                </form>
                <p class="text-center text-[10px] text-gray-400 mt-6 font-semibold">SIGEP - Sistema de Gerenciamento de Pauta</p>
            </div>
        `;

        document.getElementById('form-login-colaborador').onsubmit = (e) => {
            e.preventDefault();
            const inputEmail = document.getElementById('login-colab-email').value.trim().toLowerCase();
            const inputMatricula = document.getElementById('login-colab-matricula').value.trim();
            const errorMsg = document.getElementById('login-error-msg');

            const realEmail = (this.colaboradorAtual?.email || '').trim().toLowerCase();
            const realMatricula = (this.colaboradorAtual?.identificador || '').trim();

            if (!realEmail || !realMatricula) {
                errorMsg.innerHTML = "Seu cadastro está incompleto!<br><br>Peça ao administrador da pauta para preencher seu E-mail e Matrícula no botão 'Colaboradores'.";
                errorMsg.classList.remove('hidden');
                return;
            }

            if (inputEmail === realEmail && inputMatricula === realMatricula) {
                const sessionKey = `sigep_session_${this.pautaId}_${this.colaboradorNome}`;
                const lembrar = document.getElementById('lembrar-login-colab').checked;
                
                if (lembrar) {
                    localStorage.setItem(sessionKey, 'true'); 
                } else {
                    sessionStorage.setItem(sessionKey, 'true'); 
                }
                
                this.renderizarDashboardUnificado();
            } else {
                errorMsg.textContent = "E-mail ou Matrícula incorretos. Tente novamente.";
                errorMsg.classList.remove('hidden');
            }
        };
    },

    renderizarInterface(assistido, pautaData) {
        if (this.unsubscribeDashboard) {
            this.unsubscribeDashboard();
            this.unsubscribeDashboard = null;
        }

        // Renderiza o badge de status logo na inicialização
        this.atualizarIndicadorDeStatus(pautaData, this.colaboradorAtual?.status, this.colaboradorNome);

        const url = new URL(window.location.href);
        url.searchParams.delete('view');
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
                            if (this.colaboradorAtual && this.colaboradorAtual.id) {
                                const colabDocRef = doc(db, "pautas", this.pautaId, "collaborators", this.colaboradorAtual.id);
                                await updateDoc(colabDocRef, { status: 'disponivel', currentAttendance: null });
                                this.atualizarIndicadorDeStatus(pautaData, 'disponivel', this.colaboradorNome);
                            }
                        } catch (e) { console.error(e); }
                        this.renderizarDashboardUnificado();
                    };
                }, 100);
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

    _gerarTokenSeguro() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID().substring(0, 8);
        }
        return Math.random().toString(36).substring(2, 10) + Date.now().toString(36).substring(4);
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
                
                // Em fluxo direto (finalizando), tentamos já deixar o colaborador livre caso exista
                if (this.colaboradorAtual && this.colaboradorAtual.id) {
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
                
                if (this.colaboradorAtual && this.colaboradorAtual.id) {
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

                if (this.colaboradorAtual && this.colaboradorAtual.id) {
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

                if (this.colaboradorAtual && this.colaboradorAtual.id) {
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

                if (this.colaboradorAtual && this.colaboradorAtual.id) {
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

                if (this.colaboradorAtual && this.colaboradorAtual.id) {
                    const colabDocRef = doc(db, "pautas", pautaIdSeguro, "collaborators", this.colaboradorAtual.id);
                    await updateDoc(colabDocRef, { status: 'disponivel', currentAttendance: null }).catch(e => {});
                }

                tituloSucesso = "Pausa Registrada";
                subtituloSucesso = "O assistido foi mandado de volta à fila de espera.";
            }

            if (colaboradorDestinoObj && colaboradorDestinoObj.email) {
                console.log(`✉️ Disparando e-mail para: ${colaboradorDestinoObj.email}`);
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

            this.renderizarDashboardUnificado();

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
                    PDFService.generatePlanilhaGastosPDF(this.assistidoData.name || 'Assistido', this.assistidoData.documentChecklist.expenseData);
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
    },

    renderizarDashboardUnificado() {
        if (!this.unsubscribeDashboard) {
            this.setupRealtimeListenerDashboard();
        }

        const corpo = document.querySelector('.w-full.max-w-2xl') || document.querySelector('.w-full.max-w-4xl') || document.body;
        
        const url = new URL(window.location.href);
        url.searchParams.set('view', 'dashboard');
        url.searchParams.delete('assistidoId'); 
        window.history.pushState({}, '', url);

        const isDefensor = this.colaboradorAtual?.cargo?.toLowerCase().includes('defensor');
        const tituloPainel = isDefensor ? 'Mesa do Defensor' : 'Mesa de Trabalho';
        const subtituloPainel = `${escapeHTML(this.colaboradorNome)} • ${escapeHTML(this.colaboradorAtual?.cargo || 'Membro')}`;

        const prefs = JSON.parse(localStorage.getItem('dashboard_prefs')) || { mode: 'tabs', color: 'slate' };
        const colorMap = {
            'slate': 'bg-slate-800', 'indigo': 'bg-indigo-700', 'emerald': 'bg-emerald-700', 'rose': 'bg-rose-700', 'blue': 'bg-blue-700'
        };
        const headerColorClass = colorMap[prefs.color] || colorMap['slate'];

        corpo.className = "w-full max-w-4xl mx-auto my-4 transition-all animate-fade-in"; 
        
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
                    
                    <div class="flex gap-2 relative mt-4 sm:mt-0 w-full sm:w-auto justify-end">
                        <button id="btn-install-pwa" class="hidden bg-white/20 hover:bg-white/30 text-white p-2 sm:px-4 sm:py-2 rounded-lg transition font-bold text-xs shadow-sm flex items-center gap-2" title="Instalar no Celular/PC">
                            <span>📱</span><span class="hidden sm:inline">Instalar App</span>
                        </button>
                        <button id="btn-dash-settings" class="bg-white/20 hover:bg-white/30 text-white p-2 rounded-lg transition shadow-sm" title="Configurações da Mesa">
                            ⚙️
                        </button>
                        
                        <div id="dash-settings-menu" class="hidden absolute top-full right-0 mt-2 w-64 bg-white rounded-xl shadow-2xl border p-4 z-[999] origin-top-right">
                            <h4 class="text-[10px] font-black uppercase text-gray-400 mb-2 tracking-widest border-b pb-1">Layout da Tela</h4>
                            <div class="flex gap-2 mb-5 bg-gray-50 p-1.5 rounded-lg border">
                                <button data-mode="tabs" class="mode-btn flex-1 py-2 text-xs font-bold rounded shadow-sm transition-all ${prefs.mode === 'tabs' ? 'bg-white text-gray-800 border' : 'text-gray-400 hover:bg-gray-100'}">Abas</button>
                                <button data-mode="list" class="mode-btn flex-1 py-2 text-xs font-bold rounded shadow-sm transition-all ${prefs.mode === 'list' ? 'bg-white text-gray-800 border' : 'text-gray-400 hover:bg-gray-100'}">Tudo na Tela</button>
                            </div>
                            
                            <h4 class="text-[10px] font-black uppercase text-gray-400 mb-2 tracking-widest border-b pb-1">Cor do Cabeçalho</h4>
                            <div class="flex gap-2 justify-between px-1">
                                <button data-color="slate" class="color-btn w-6 h-6 rounded-full bg-slate-800 ring-offset-2 transition-transform hover:scale-110 ${prefs.color === 'slate' ? 'ring-2 ring-slate-800 scale-110 shadow-md' : ''}"></button>
                                <button data-color="blue" class="color-btn w-6 h-6 rounded-full bg-blue-700 ring-offset-2 transition-transform hover:scale-110 ${prefs.color === 'blue' ? 'ring-2 ring-blue-700 scale-110 shadow-md' : ''}"></button>
                                <button data-color="indigo" class="color-btn w-6 h-6 rounded-full bg-indigo-700 ring-offset-2 transition-transform hover:scale-110 ${prefs.color === 'indigo' ? 'ring-2 ring-indigo-700 scale-110 shadow-md' : ''}"></button>
                                <button data-color="emerald" class="color-btn w-6 h-6 rounded-full bg-emerald-700 ring-offset-2 transition-transform hover:scale-110 ${prefs.color === 'emerald' ? 'ring-2 ring-emerald-700 scale-110 shadow-md' : ''}"></button>
                                <button data-color="rose" class="color-btn w-6 h-6 rounded-full bg-rose-700 ring-offset-2 transition-transform hover:scale-110 ${prefs.color === 'rose' ? 'ring-2 ring-rose-700 scale-110 shadow-md' : ''}"></button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div id="dash-body" class="bg-slate-50 p-4 sm:p-6 rounded-b-2xl shadow-lg border border-slate-300 min-h-[500px] transition-colors duration-500">
                <div id="wrapper-busca-historico" class="hidden mb-4 animate-fade-in">
                    <input type="text" id="input-busca-local" class="w-full p-3 border border-slate-300 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner font-sans" placeholder="🔍 Digite o nome do assistido ou assunto para buscar no seu histórico...">
                </div>

                <div id="tabs-container-wrapper" class="bg-white p-3 rounded-xl shadow-sm border border-slate-200 mb-6 ${prefs.mode === 'list' ? 'hidden' : ''}">
                    <div id="tabs-dashboard" class="flex gap-2 overflow-x-auto custom-scrollbar"></div>
                </div>
                
                <div id="lista-dashboard-conteudo" class="${prefs.mode === 'list' ? 'space-y-8' : 'space-y-3 sm:space-y-4'}">
                    <div class="flex justify-center py-20"><div class="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-800"></div></div>
                </div>
            </div>
        `;

        if (deferredPrompt) {
            const installBtn = document.getElementById('btn-install-pwa');
            installBtn.classList.remove('hidden');
            installBtn.addEventListener('click', async () => {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                if (outcome === 'accepted') {
                    installBtn.classList.add('hidden');
                }
                deferredPrompt = null;
            });
        }

        const btnSettings = document.getElementById('btn-dash-settings');
        const menuSettings = document.getElementById('dash-settings-menu');
        
        btnSettings.addEventListener('click', (e) => {
            e.stopPropagation();
            menuSettings.classList.toggle('hidden');
        });
        document.addEventListener('click', (e) => {
            if (!menuSettings.contains(e.target) && !btnSettings.contains(e.target)) {
                menuSettings.classList.add('hidden');
            }
        });

        document.querySelectorAll('.color-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const c = e.target.dataset.color;
                prefs.color = c;
                localStorage.setItem('dashboard_prefs', JSON.stringify(prefs));
                
                document.getElementById('header-bg').className = `${colorMap[c]} p-6 sm:p-8 rounded-t-2xl shadow-xl flex items-center justify-between relative overflow-visible border-b border-white/10 transition-colors duration-500`;
                
                document.querySelectorAll('.color-btn').forEach(b => {
                    b.className = b.className.replace(/ring-2 ring-\w+-700 ring-\w+-800 scale-110 shadow-md/g, '').trim();
                });
                e.target.classList.add('ring-2', `ring-${c === 'slate' ? 'slate-800' : c+'-700'}`, 'scale-110', 'shadow-md');
            });
        });

        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const m = e.target.dataset.mode;
                prefs.mode = m;
                localStorage.setItem('dashboard_prefs', JSON.stringify(prefs));
                menuSettings.classList.add('hidden');
                this.atualizarListasDoDashboard(); 
            });
        });

        if (this.todosAtendimentosPauta && this.todosAtendimentosPauta.length > 0) {
            this.atualizarListasDoDashboard();
        }
    },

    atualizarListasDoDashboard() {
        const container = document.getElementById('lista-dashboard-conteudo');
        const tabsDiv = document.getElementById('tabs-dashboard');
        const wrapperBusca = document.getElementById('wrapper-busca-historico');
        
        if (!container) return;

        const isDefensor = this.colaboradorAtual?.cargo?.toLowerCase().includes('defensor');
        const prefs = JSON.parse(localStorage.getItem('dashboard_prefs')) || { mode: 'tabs', color: 'slate' };
        const baseUrl = window.location.href.substring(0, window.location.href.indexOf('?'));

        const desenharCard = (item, isCardAberto) => {
            const notas = item.notasRevisao ? `<div class="mt-3 bg-yellow-50 p-3 rounded-lg text-xs text-yellow-900 border border-yellow-300 font-semibold shadow-sm leading-snug">⚠️ <b>Nota Anexada:</b> ${escapeHTML(item.notasRevisao)}</div>` : '';
            const numProcessoHtml = item.numeroProcesso ? `<span class="inline-flex items-center px-2 py-1 rounded bg-slate-100 text-slate-700 font-mono text-[10px] font-bold border border-slate-300 mt-2">Nº CNP: ${escapeHTML(item.numeroProcesso)}</span>` : '';
            const bannerTransf = item.historicoTransferencia ? `<div class="mt-3 bg-orange-50 p-2.5 rounded-lg text-[11px] text-orange-900 border border-orange-300 font-bold flex items-start gap-1 shadow-sm leading-snug"><span class="text-sm">🔄</span> <span>${escapeHTML(item.historicoTransferencia)}</span></div>` : '';
            
            const temUrgencia = item.priority === 'URGENTE';
            const motivoUrgencia = item.priorityReason ? `<div class="mt-1 text-[10px] font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-200 w-max truncate">🚨 ${escapeHTML(item.priorityReason)}</div>` : '';
            const badgeUrgencia = temUrgencia ? `<span class="bg-red-600 text-white text-[9px] font-black px-2 py-0.5 rounded border border-red-700 uppercase tracking-widest shadow-sm animate-pulse">🚨 PRIORIDADE</span>` : '';

            let badgeTopo = '';
            let borderClasseUrgencia = temUrgencia ? 'border-l-[6px] border-l-red-500' : '';
            let bgColorCard = 'bg-white border-slate-200 hover:border-slate-400';
            
            if (item.status === 'aguardandoCorrecao') {
                badgeTopo = `<span class="bg-amber-100 text-amber-800 text-[9px] font-black px-2 py-0.5 rounded border border-amber-300 uppercase tracking-widest shadow-sm">Avaliação</span>`;
                bgColorCard = 'bg-amber-50/30 border-amber-200 hover:border-amber-400';
            }
            else if (item.status === 'aguardandoDistribuicao') {
                badgeTopo = `<span class="bg-cyan-100 text-cyan-800 text-[9px] font-black px-2 py-0.5 rounded border border-cyan-300 uppercase tracking-widest shadow-sm">Assinatura</span>`;
                bgColorCard = 'bg-cyan-50/30 border-cyan-200 hover:border-cyan-400';
            }
            else if (item.status === 'emAtendimento') {
                badgeTopo = `<span class="bg-indigo-100 text-indigo-800 text-[9px] font-black px-2 py-0.5 rounded border border-indigo-300 uppercase tracking-widest shadow-sm">Na Mesa</span>`;
            }
            else if (item.status === 'atendido') {
                badgeTopo = `<span class="bg-emerald-100 text-emerald-800 text-[9px] font-black px-2 py-0.5 rounded border border-emerald-300 uppercase tracking-widest shadow-sm">Protocolado</span>`;
            }
            else if (item.status === 'aguardandoNumero') {
                badgeTopo = `<span class="bg-amber-100 text-amber-800 text-[9px] font-black px-2 py-0.5 rounded border border-amber-300 uppercase tracking-widest shadow-sm">Aguardando CNP</span>`;
                bgColorCard = 'bg-amber-50/20 border-amber-200';
            }

            if (isCardAberto && item.status !== 'atendido' && item.status !== 'aguardandoNumero') {
                const linkIndividual = `${baseUrl}?pautaId=${this.pautaId}&assistidoId=${item.id}&colab=${encodeURIComponent(this.colaboradorNome)}&token=${item.delegationToken || ''}`;
                return `
                    <div class="border-2 ${borderClasseUrgencia} ${bgColorCard} p-5 rounded-2xl shadow-sm hover:shadow-lg transition-all relative group flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-3">
                        <div class="flex-grow w-full sm:w-auto min-w-0">
                            <div class="flex items-center gap-2 mb-2 flex-wrap">
                                ${badgeTopo}
                                ${badgeUrgencia}
                                ${item.enviadoPor ? `<span class="text-[9px] text-slate-500 font-bold uppercase">Via: ${escapeHTML(item.enviadoPor)}</span>` : ''}
                            </div>
                            <h3 class="font-black text-slate-800 text-lg w-full truncate">${escapeHTML(item.name)}</h3>
                            <p class="text-xs font-semibold text-slate-500 mt-1 uppercase tracking-wide truncate">${escapeHTML(item.subject || 'Assunto não informado')}</p>
                            ${motivoUrgencia}
                            ${numProcessoHtml}
                            ${notas}
                            ${bannerTransf}
                        </div>
                        <div class="shrink-0 w-full sm:w-auto mt-2 sm:mt-0">
                            <a href="${linkIndividual}" class="block text-center w-full sm:w-40 bg-slate-800 hover:bg-slate-900 text-white font-black py-3 px-4 rounded-xl text-[10px] transition-colors shadow uppercase tracking-widest ring-offset-2 ring-slate-800 group-hover:ring-2">
                                ABRIR PEÇA
                            </a>
                        </div>
                    </div>
                `;
            } else {
                const horaStr = item.attendedAt ? new Date(item.attendedAt).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : '';
                
                const linkManualCard = item.linkVerdeManualmente || item.linkVerde || `https://verde.defensoria.rj.def.br/#/atendimento/pesquisa?termo=${encodeURIComponent(item.numeroProcesso || item.name)}`;
                
                // Sempre permite abrir os detalhes mesmo que finalizado, mantendo o botão
                const linkIndividualDetalhes = `${baseUrl}?pautaId=${this.pautaId}&assistidoId=${item.id}&colab=${encodeURIComponent(this.colaboradorNome)}&token=${item.delegationToken || ''}`;
                
                const atalhoVerdeCard = isDefensor ? `
                    <a href="${linkManualCard}" target="_blank" class="mt-2 inline-flex items-center gap-1 text-[10px] font-black text-emerald-600 hover:text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded shadow-sm uppercase tracking-wider transition active:scale-95">
                        <span>⚖️</span> Abrir Link no Verde
                    </a>` : '';

                const labelStatusFinal = item.status === 'aguardandoNumero' 
                    ? `<span class="bg-amber-100 text-amber-800 text-[10px] font-black px-2.5 py-1 rounded border border-amber-300 uppercase tracking-widest shadow-sm inline-flex items-center gap-1"><span>⏳</span> Sem CNP</span>`
                    : `<span class="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2.5 py-1 rounded border border-emerald-300 uppercase tracking-widest shadow-sm inline-flex items-center gap-1"><span>✅</span> Finalizado</span>`;

                return `
                    <div class="border ${borderClasseUrgencia} border-slate-200 bg-white p-4 rounded-xl shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3">
                        <div class="min-w-0 flex-1 w-full">
                            <div class="mb-1 flex gap-1.5 flex-wrap">${badgeTopo} ${badgeUrgencia}</div>
                            <h3 class="font-black text-slate-800 text-sm truncate">${escapeHTML(item.name)}</h3>
                            <p class="text-[10px] font-bold text-slate-400 mt-0.5 uppercase tracking-wide truncate">${escapeHTML(item.subject)}</p>
                            ${motivoUrgencia}
                            ${numProcessoHtml}
                            <div class="flex gap-2">
                                ${atalhoVerdeCard}
                                <a href="${linkIndividualDetalhes}" class="mt-2 inline-flex items-center gap-1 text-[10px] font-black text-slate-600 hover:text-slate-800 bg-slate-100 border border-slate-300 px-2 py-0.5 rounded shadow-sm uppercase tracking-wider transition active:scale-95">
                                    <span>👁️</span> Revisar Detalhes
                                </a>
                            </div>
                        </div>
                        <div class="shrink-0 text-right w-full sm:w-auto mt-2 sm:mt-0 flex sm:flex-col justify-between sm:justify-start items-center sm:items-end">
                            ${labelStatusFinal}
                            <p class="text-[9px] text-slate-400 font-bold mt-1.5">${horaStr}</p>
                        </div>
                    </div>
                `;
            }
        };

        if (isDefensor) {
            const pendentes = this.todosAtendimentosPauta.filter(a => 
                ((a.status === 'aguardandoDistribuicao' || a.status === 'aguardandoCorrecao') && a.defensorResponsavel === this.colaboradorNome) ||
                (a.status === 'emAtendimento' && a.assignedCollaborator?.name === this.colaboradorNome)
            );
            const distribuidos = this.todosAtendimentosPauta.filter(a => (a.status === 'atendido' || a.status === 'aguardandoNumero') && (a.defensorResponsavel === this.colaboradorNome || a.attendedBy === this.colaboradorNome));
            const meuHistoricoCompleto = this.todosAtendimentosPauta.filter(a => a.defensorResponsavel === this.colaboradorNome || a.attendedBy === this.colaboradorNome || (Array.isArray(a.history) && a.history.some(h => h.by === this.colaboradorNome)));

            if (prefs.mode === 'list') {
                container.innerHTML = pendentes.map(item => desenharCard(item, true)).join('') + distribuidos.map(item => desenharCard(item, false)).join('');
                if (tabsDiv) tabsDiv.parentElement.classList.add('hidden');
            } else {
                if (tabsDiv) tabsDiv.parentElement.classList.remove('hidden');
                const abaAtivaId = document.querySelector('.mode-btn-active')?.id || 'tab-pendentes';
                
                tabsDiv.innerHTML = `
                    <button id="tab-pendentes" class="tab-btn flex-1 py-3 px-2 text-xs font-black uppercase tracking-widest rounded-lg transition whitespace-nowrap ${abaAtivaId === 'tab-pendentes' ? 'bg-slate-800 text-white shadow mode-btn-active' : 'bg-white text-slate-500 hover:text-slate-800 hover:bg-slate-100'}">Fazer / Assinar / Corrigir <span class="bg-slate-200 text-slate-700 ml-2 px-2 py-0.5 rounded text-[10px]">${pendentes.length}</span></button>
                    <button id="tab-assinados" class="tab-btn flex-1 py-3 px-2 text-xs font-black uppercase tracking-widest rounded-lg transition whitespace-nowrap ${abaAtivaId === 'tab-assinados' ? 'bg-emerald-600 text-white shadow mode-btn-active' : 'bg-white text-slate-500 hover:text-slate-800 hover:bg-slate-100'}">Distribuições (Equipe) <span class="bg-slate-200 text-slate-700 ml-2 px-2 py-0.5 rounded text-[10px]">${distribuidos.length}</span></button>
                    <button id="tab-historico-busca" class="tab-btn flex-1 py-3 px-2 text-xs font-black uppercase tracking-widest rounded-lg transition whitespace-nowrap ${abaAtivaId === 'tab-historico-busca' ? 'bg-indigo-600 text-white shadow mode-btn-active' : 'bg-white text-indigo-500 hover:bg-indigo-50'}">🔍 Buscar Tudo</button>
                `;

                const renderDefensorList = (lista, isAberto) => {
                    if (lista.length === 0) {
                        container.innerHTML = `<div class="text-center py-16 opacity-50"><span class="text-5xl mb-4 block">🙌</span><p class="text-base font-black uppercase tracking-widest text-slate-500">MESA LIMPA.</p></div>`;
                        return;
                    }
                    container.innerHTML = lista.map(item => desenharCard(item, isAberto)).join('');
                };

                const limparEstilosAbas = () => {
                    wrapperBusca.classList.add('hidden');
                    document.querySelectorAll('.tab-btn').forEach(btn => {
                        btn.className = btn.className.replace(/bg-slate-800|bg-emerald-600|bg-indigo-600|text-white|shadow|mode-btn-active/g, '').trim();
                        btn.classList.add('bg-white', 'text-slate-500', 'hover:text-slate-800', 'hover:bg-slate-100', 'tab-btn');
                    });
                };

                document.getElementById('tab-pendentes').onclick = () => { limparEstilosAbas(); document.getElementById('tab-pendentes').classList.add('bg-slate-800', 'text-white', 'shadow', 'mode-btn-active'); renderDefensorList(pendentes, true); };
                document.getElementById('tab-assinados').onclick = () => { limparEstilosAbas(); document.getElementById('tab-assinados').classList.add('bg-emerald-600', 'text-white', 'shadow', 'mode-btn-active'); renderDefensorList(distribuidos, false); };
                document.getElementById('tab-historico-busca').onclick = () => {
                    limparEstilosAbas(); wrapperBusca.classList.remove('hidden'); document.getElementById('tab-historico-busca').classList.add('bg-indigo-600', 'text-white', 'shadow', 'mode-btn-active');
                    renderDefensorList(meuHistoricoCompleto, true);
                    document.getElementById('input-busca-local').oninput = (e) => {
                        const termo = e.target.value.toLowerCase().trim();
                        renderDefensorList(meuHistoricoCompleto.filter(i => (i.name && i.name.toLowerCase().includes(termo)) || (i.subject && i.subject.toLowerCase().includes(termo)) || (i.numeroProcesso && i.numeroProcesso.includes(termo))), true);
                    };
                };

                if (abaAtivaId === 'tab-assinados') renderDefensorList(distribuidos, false);
                else if (abaAtivaId === 'tab-historico-busca') { wrapperBusca.classList.remove('hidden'); renderDefensorList(meuHistoricoCompleto, true); }
                else renderDefensorList(pendentes, true);
            }

        } else {
            const emAndamento = this.todosAtendimentosPauta.filter(a => a.status === 'emAtendimento' && a.assignedCollaborator?.name === this.colaboradorNome);
            const enviados = this.todosAtendimentosPauta.filter(a => (a.status === 'aguardandoDistribuicao' || a.status === 'aguardandoCorrecao') && a.enviadoPor === this.colaboradorNome);
            const finalizados = this.todosAtendimentosPauta.filter(a => 
                (a.status === 'atendido' && a.attendedBy === this.colaboradorNome) || 
                (a.status === 'atendido' && a.enviadoPor === this.colaboradorNome) ||
                (a.status === 'aguardandoNumero' && a.attendedBy === this.colaboradorNome) || 
                (a.status === 'aguardandoNumero' && a.enviadoPor === this.colaboradorNome)
            );
            const meuHistoricoCompleto = this.todosAtendimentosPauta.filter(a => a.enviadoPor === this.colaboradorNome || a.attendedBy === this.colaboradorNome || a.assignedCollaborator?.name === this.colaboradorNome || (Array.isArray(a.history) && a.history.some(h => h.by === this.colaboradorNome)));

            if (prefs.mode === 'list') {
                container.innerHTML = emAndamento.map(item => desenharCard(item, true)).join('') + enviados.map(item => desenharCard(item, true)).join('') + finalizados.map(item => desenharCard(item, false)).join('');
                if (tabsDiv) tabsDiv.parentElement.classList.add('hidden');
            } else {
                if (tabsDiv) tabsDiv.parentElement.classList.remove('hidden');
                const abaAtivaId = document.querySelector('.mode-btn-active')?.id || 'tab-em-mesa';

                tabsDiv.innerHTML = `
                    <button id="tab-em-mesa" class="tab-btn flex-1 py-3 px-1 text-[10px] sm:text-xs font-black uppercase tracking-widest rounded-lg transition whitespace-nowrap ${abaAtivaId === 'tab-em-mesa' ? 'bg-slate-800 text-white shadow mode-btn-active' : 'bg-white text-slate-500 hover:text-slate-800 hover:bg-slate-100'}">Fazer/Corrigir <span class="bg-slate-200 text-slate-700 ml-1 px-1.5 py-0.5 rounded text-[9px]">${emAndamento.length}</span></button>
                    <button id="tab-enviados" class="tab-btn flex-1 py-3 px-1 text-[10px] sm:text-xs font-black uppercase tracking-widest rounded-lg transition whitespace-nowrap ${abaAtivaId === 'tab-enviados' ? 'bg-indigo-600 text-white shadow mode-btn-active' : 'bg-white text-slate-500 hover:text-slate-800 hover:bg-slate-100'}">No Defensor <span class="bg-slate-200 text-slate-700 ml-1 px-1.5 py-0.5 rounded text-[9px]">${enviados.length}</span></button>
                    <button id="tab-finalizados" class="tab-btn flex-1 py-3 px-1 text-[10px] sm:text-xs font-black uppercase tracking-widest rounded-lg transition whitespace-nowrap ${abaAtivaId === 'tab-finalizados' ? 'bg-emerald-600 text-white shadow mode-btn-active' : 'bg-white text-slate-500 hover:text-slate-800 hover:bg-slate-100'}">Concluídos <span class="bg-slate-200 text-slate-700 ml-1 px-1.5 py-0.5 rounded text-[9px]">${finalizados.length}</span></button>
                    <button id="tab-historico-busca" class="tab-btn flex-1 py-3 px-1 text-[10px] sm:text-xs font-black uppercase tracking-widest rounded-lg transition whitespace-nowrap ${abaAtivaId === 'tab-historico-busca' ? 'bg-indigo-600 text-white shadow mode-btn-active' : 'bg-white text-indigo-500 hover:bg-indigo-50'}">🔍 Buscar</button>
                `;

                const renderServidorList = (lista, isAberto, isEmptyAviso) => {
                    if (lista.length === 0) {
                        container.innerHTML = `<div class="text-center py-16 opacity-50"><span class="text-5xl mb-4 block">📭</span><p class="text-sm font-black uppercase tracking-widest text-slate-500">${isEmptyAviso}</p></div>`;
                        return;
                    }
                    container.innerHTML = lista.map(item => desenharCard(item, isAberto)).join('');
                };

                const resetTabs = () => {
                    wrapperBusca.classList.add('hidden');
                    document.querySelectorAll('.tab-btn').forEach(btn => {
                        btn.className = btn.className.replace(/bg-slate-800|bg-emerald-600|bg-indigo-600|text-white|shadow|mode-btn-active/g, '').trim();
                        btn.classList.add('bg-white', 'text-slate-500', 'hover:text-slate-800', 'hover:bg-slate-100', 'tab-btn');
                    });
                };

                document.getElementById('tab-em-mesa').onclick = () => { resetTabs(); document.getElementById('tab-em-mesa').classList.add('bg-slate-800', 'text-white', 'shadow', 'mode-btn-active'); renderServidorList(emAndamento, true, "Sua mesa está limpa."); };
                document.getElementById('tab-enviados').onclick = () => { resetTabs(); document.getElementById('tab-enviados').classList.add('bg-indigo-600', 'text-white', 'shadow', 'mode-btn-active'); renderServidorList(enviados, true, "Nenhum documento seu no Defensor."); };
                document.getElementById('tab-finalizados').onclick = () => { resetTabs(); document.getElementById('tab-finalizados').classList.add('bg-emerald-600', 'text-white', 'shadow', 'mode-btn-active'); renderServidorList(finalizados, false, "Você ainda não finalizou nada hoje."); };
                document.getElementById('tab-historico-busca').onclick = () => {
                    resetTabs(); wrapperBusca.classList.remove('hidden'); document.getElementById('tab-historico-busca').classList.add('bg-indigo-600', 'text-white', 'shadow', 'mode-btn-active');
                    renderServidorList(meuHistoricoCompleto, true, "Nenhum histórico encontrado.");
                    document.getElementById('input-busca-local').oninput = (e) => {
                        const termo = e.target.value.toLowerCase().trim();
                        renderServidorList(meuHistoricoCompleto.filter(i => (i.name && i.name.toLowerCase().includes(termo)) || (i.subject && i.subject.toLowerCase().includes(termo)) || (i.numeroProcesso && i.numeroProcesso.includes(termo))), true, "Nada encontrado.");
                    };
                };

                if (abaAtivaId === 'tab-enviados') renderServidorList(enviados, true, "Nenhum documento seu no Defensor.");
                else if (abaAtivaId === 'tab-finalizados') renderServidorList(finalizados, false, "Você ainda não finalizou nada hoje.");
                else if (abaAtivaId === 'tab-historico-busca') { wrapperBusca.classList.remove('hidden'); renderServidorList(meuHistoricoCompleto, true, "Nenhum histórico encontrado."); }
                else renderServidorList(emAndamento, true, "Sua mesa está limpa.");
            }
        }
    },

    showError(titulo, message) {
        let corpo = document.querySelector('.w-full.max-w-2xl') || document.querySelector('.w-full.max-w-4xl');
        if (!corpo) corpo = document.body;

        corpo.innerHTML = `
            <div class="w-full max-w-2xl mx-auto my-4">
                <div class="bg-red-600 p-8 rounded-t-3xl shadow-xl flex flex-col items-center justify-center relative overflow-hidden">
                    <div class="absolute top-0 right-0 w-32 h-32 bg-white opacity-20 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
                    <div class="bg-white p-3 rounded-2xl shadow-sm mb-4 relative z-10">
                        <img src="https://raw.githubusercontent.com/alexdovale/ac-o-paula-controle/main/imagem.png" alt="Logo" class="h-12 w-auto object-contain">
                    </div>
                    <h1 class="text-white font-black text-3xl uppercase tracking-widest relative z-10">ACESSO NEGADO</h1>
                </div>
                <div class="p-10 text-center bg-white rounded-b-3xl shadow-xl border-x border-b border-gray-200">
                    <span class="text-6xl block mb-6 drop-shadow-md">🔒</span>
                    <h2 class="text-xl font-black text-gray-800 uppercase tracking-wide mb-3">${titulo}</h2>
                    <p class="text-gray-500 font-semibold leading-relaxed">${message}</p>
                </div>
            </div>
        `;
    }
};
