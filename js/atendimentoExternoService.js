// js/atendimentoExternoService.js - DASHBOARD JUDICIAL (BLINDAGEM TOTAL ANTI-ERROS NO IOS)

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc, collection, getDocs, query, arrayUnion } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
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

    async init() {
        console.log("⚡ Atendimento Externo Inicializado (Premium Mode - SIGEP)");

        const urlParams = new URLSearchParams(window.location.search);
        this.pautaId = urlParams.get('pautaId');
        this.assistidoId = urlParams.get('assistidoId'); 
        const tokenRecebido = urlParams.get('token');
        this.colaboradorNome = urlParams.get('colab') || "Colaborador";
        
        const telaAtual = urlParams.get('view'); 

        if (!this.pautaId || !this.colaboradorNome) {
            this.showError("Link Incompleto", "Faltam parâmetros de Pauta ou Colaborador na URL.");
            return;
        }

        try {
            if (!auth.currentUser) {
                await signInAnonymously(auth);
            }
            
            await this.carregarColaboradoresGerais();

            if (telaAtual === 'dashboard' || !this.assistidoId) {
                this.renderizarDashboardUnificado();
                return;
            }

            const pautaRef = doc(db, "pautas", this.pautaId);
            const pautaSnap = await getDoc(pautaRef);
            if (!pautaSnap.exists()) {
                this.showError("Pauta não localizada", "A pauta informada não existe mais no sistema.");
                return;
            }

            const docRef = doc(db, "pautas", this.pautaId, "attendances", this.assistidoId);
            const docSnap = await getDoc(docRef);

            if (!docSnap.exists()) {
                this.showError("Processo não encontrado", "Este assistido não está mais na pauta.");
                return;
            }

            const assistido = docSnap.data();
            this.assistidoData = assistido;

            this.demandasAdicionaisLocais = (assistido.demandas && assistido.demandas.descricoes) ? [...assistido.demandas.descricoes] : [];

            if (assistido.delegationToken && assistido.delegationToken !== tokenRecebido) {
                this.showError("Acesso Seguro Necessário", "O token de segurança é inválido ou expirou.");
                return;
            }

            if (assistido.status === 'atendido') {
                this.showError("Protocolo Fechado", "Este atendimento já foi finalizado e protocolado.");
                return;
            }

            this.renderizarInterface(assistido, pautaSnap.data());
            this.setupListeners();

        } catch (error) {
            console.error("Erro geral na inicialização:", error);
            this.showError("Conexão Perdida", "Falha ao conectar com o banco de dados principal.");
        }
    },

    async carregarColaboradoresGerais() {
        try {
            const snap = await getDocs(collection(db, "pautas", this.pautaId, "collaborators"));
            this.todosColaboradores = snap.docs.map(d => d.data());
            this.colaboradorAtual = this.todosColaboradores.find(c => c.nome === this.colaboradorNome);
        } catch (error) {
            console.error("Erro ao carregar lista da equipe", error);
            this.todosColaboradores = [];
        }
    },

    renderizarInterface(assistido, pautaData) {
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

        document.getElementById('assistido-nome').className = 'text-white font-black text-xl sm:text-2xl truncate relative z-10';
        document.getElementById('assistido-nome').textContent = assistido.name || 'Nome não informado';
        
        document.getElementById('assistido-assunto').className = 'text-blue-200 text-xs sm:text-sm font-semibold mt-1 uppercase tracking-wider relative z-10';
        document.getElementById('assistido-assunto').textContent = assistido.subject || 'Assunto não informado';
        
        const areaColaborador = document.getElementById('area-colaborador');
        areaColaborador.classList.remove('hidden');

        if (assistido.historicoTransferencia && !document.getElementById('banner-transferencia')) {
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

        if (!document.getElementById('btn-atalho-painel')) {
            const isDefensor = this.colaboradorAtual?.cargo?.toLowerCase().includes('defensor');
            const tituloBotao = isDefensor ? 'Ver Minhas Assinaturas Pendentes' : 'Ir para Meus Atendimentos';
            const btnHtml = `
                <button id="btn-atalho-painel" class="w-full bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 font-bold py-3.5 px-4 rounded-xl shadow-sm transition-all text-xs flex items-center justify-center gap-2 mb-6 uppercase tracking-wider">
                    <span>${isDefensor ? '⚖️' : '📊'}</span> ${tituloBotao}
                </button>
            `;
            areaColaborador.insertAdjacentHTML('afterbegin', btnHtml);
            document.getElementById('btn-atalho-painel').onclick = () => this.renderizarDashboardUnificado();
        }

        this.renderizarHistorico(assistido);
        this.renderizarAbaEncerramentoDinamica(assistido, pautaData);
    },

    renderizarAbaEncerramentoDinamica(assistido, pautaData) {
        const aba = document.getElementById('aba-encerramento');
        if (!aba) return;

        const isDefensor = this.colaboradorAtual?.cargo?.toLowerCase().includes('defensor');
        const showDistribuicao = pautaData.useDistributionFlow && !isDefensor;

        let optionsHtml = `<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">`;

        optionsHtml += `
            <button id="btn-opt-direto" class="fluxo-opt-btn bg-emerald-50 border-2 border-emerald-400 ring-2 ring-emerald-100 p-4 rounded-xl text-left transition-all hover:shadow-md group">
                <span class="block text-xl mb-1 group-hover:scale-110 transition-transform origin-left">✅</span>
                <span class="block font-bold text-slate-800">Finalizar Protocolo</span>
                <span class="block text-[10px] text-slate-500 mt-1 uppercase tracking-wider">Concluir atendimento definitivo</span>
            </button>
        `;

        if (showDistribuicao) {
            optionsHtml += `
                <button id="btn-opt-dist" class="fluxo-opt-btn bg-white border border-slate-200 p-4 rounded-xl text-left transition-all hover:bg-slate-50 hover:border-cyan-300 group">
                    <span class="block text-xl mb-1 group-hover:scale-110 transition-transform origin-left">⚖️</span>
                    <span class="block font-bold text-slate-800">Distribuir (Assinatura)</span>
                    <span class="block text-[10px] text-slate-500 mt-1 uppercase tracking-wider">Enviar para Defensor(a)</span>
                </button>
                <button id="btn-opt-correcao" class="fluxo-opt-btn bg-white border border-slate-200 p-4 rounded-xl text-left transition-all hover:bg-slate-50 hover:border-amber-300 group">
                    <span class="block text-xl mb-1 group-hover:scale-110 transition-transform origin-left">📝</span>
                    <span class="block font-bold text-slate-800">Pedir Avaliação</span>
                    <span class="block text-[10px] text-slate-500 mt-1 uppercase tracking-wider">Dúvidas ou revisão de petição</span>
                </button>
            `;
        }

        if (isDefensor) {
            optionsHtml += `
                <button id="btn-opt-devolver" class="fluxo-opt-btn bg-white border border-slate-200 p-4 rounded-xl text-left transition-all hover:bg-slate-50 hover:border-orange-300 group">
                    <span class="block text-xl mb-1 group-hover:scale-110 transition-transform origin-left">🔙</span>
                    <span class="block font-bold text-slate-800">Devolver (Com Erro)</span>
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
                <label class="block text-[10px] font-black text-indigo-700 uppercase tracking-widest mb-2 flex items-center gap-1"><span>📋</span> Acumular Demandas Resolvidas (Múltiplos Casos)</label>
                <div class="flex gap-2 mb-3">
                    <input type="text" id="input-nova-demanda-externo" class="flex-grow p-2.5 border border-indigo-300 rounded-lg text-xs outline-none bg-white focus:ring-2 focus:ring-indigo-500" placeholder="Ex: Regulamentação de Guarda...">
                    <button type="button" id="btn-add-demanda-externo" class="bg-indigo-600 text-white font-bold px-4 py-2 rounded-lg text-xs hover:bg-indigo-700 transition shadow-sm uppercase tracking-wider">Somar</button>
                </div>
                <div id="container-lista-demandas-externo" class="space-y-1.5 max-h-36 overflow-y-auto pr-1"></div>
            </div>

            <div id="config-numero-processo" class="bg-slate-50 p-5 rounded-xl border border-slate-200 mb-6 transition-all shadow-inner">
                <label class="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1"><span>📄</span> Nº Processo / Protocolo (Opcional)</label>
                <input type="text" id="input-numero-caso" value="${assistido.numeroProcesso || ''}" class="w-full p-3.5 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-mono placeholder:font-sans" placeholder="Ex: 0001234-56.2026.8.19.0021">
            </div>

            <div id="config-distribuicao" class="hidden bg-cyan-50 p-5 rounded-xl border border-cyan-200 mb-6 shadow-inner">
                <label class="block text-[10px] font-black text-cyan-700 uppercase tracking-widest mb-2">Selecione o Defensor(a)</label>
                <select id="select-defensor-distribuicao" class="w-full p-3.5 border border-cyan-300 rounded-lg text-sm bg-white mb-4 outline-none focus:ring-2 focus:ring-cyan-500 font-semibold text-slate-700 cursor-pointer"></select>
                <label class="block text-[10px] font-black text-cyan-700 uppercase tracking-widest mb-2">Nota Interna (Opcional)</label>
                <textarea id="notas-distribuicao-dinamico" rows="2" class="w-full p-3.5 border border-cyan-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-cyan-500 resize-none" placeholder="Ex: Peça inicial finalizada."></textarea>
            </div>

            <div id="config-correcao" class="hidden bg-amber-50 p-5 rounded-xl border border-amber-200 mb-6 shadow-inner">
                <label class="block text-[10px] font-black text-amber-700 uppercase tracking-widest mb-2">Defensor(a) Avaliador</label>
                <select id="select-defensor-correcao" class="w-full p-3.5 border border-amber-300 rounded-lg text-sm bg-white mb-4 outline-none focus:ring-2 focus:ring-amber-500 font-semibold text-slate-700 cursor-pointer"></select>
                <label class="block text-[10px] font-black text-amber-700 uppercase tracking-widest mb-2">Qual a dúvida?</label>
                <textarea id="notas-correcao-dinamico" rows="2" class="w-full p-3.5 border border-amber-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-amber-500 resize-none" placeholder="Ex: Favor conferir se cabe pedido de liminar..."></textarea>
            </div>

            <div id="config-devolver" class="hidden bg-orange-50 p-5 rounded-xl border border-orange-200 mb-6 shadow-inner">
                <label class="block text-[10px] font-black text-orange-700 uppercase tracking-widest mb-2">Devolver para qual Servidor(a)?</label>
                <select id="select-servidor-devolver" class="w-full p-3.5 border border-orange-300 rounded-lg text-sm bg-white mb-4 outline-none focus:ring-2 focus:ring-orange-500 font-semibold text-slate-700 cursor-pointer"></select>
                <label class="block text-[10px] font-black text-orange-700 uppercase tracking-widest mb-2">Motivo / Correção Exigida</label>
                <textarea id="notas-devolver-dinamico" rows="2" class="w-full p-3.5 border border-orange-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-orange-500 resize-none" placeholder="Ex: Faltou qualificar a testemunha. Corrigir."></textarea>
            </div>

            <div id="config-transferencia" class="hidden bg-indigo-50 p-5 rounded-xl border border-indigo-200 mb-6 shadow-inner">
                <label class="block text-[10px] font-black text-indigo-700 uppercase tracking-widest mb-2">Colega de Destino</label>
                <select id="select-transferir-colega" class="w-full p-3.5 border border-indigo-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-700 cursor-pointer"></select>
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
            const docRef = doc(db, "pautas", pautaIdSeguro, "attendances", assistidoIdSeguro);
            const novoToken = this._gerarTokenSeguro();
            const timestampIso = new Date().toISOString();

            if (this.fluxoSelecionado === 'direto') {
                await updateDoc(docRef, {
                    status: numProcessoSeguro ? 'atendido' : 'aguardandoNumero',
                    attendedBy: colabSeguro,
                    attendedAt: timestampIso,
                    finalizadoPeloColaborador: !!numProcessoSeguro,
                    numeroProcesso: numProcessoSeguro,
                    demandas: objetoDemandasFinal, 
                    history: arrayUnion({
                        action: numProcessoSeguro ? 'APROVADO_E_DISTRIBUIDO' : 'APROVADO_AGUARDANDO_NUMERO',
                        by: colabSeguro,
                        msg: numProcessoSeguro ? `Nº Processo: ${numProcessoSeguro}` : 'Aprovado e protocolado internamente',
                        at: timestampIso
                    })
                });
                tituloSucesso = "Atendimento Finalizado!";
                subtituloSucesso = numProcessoSeguro ? "Processo distribuído e salvo." : "Atendimento encerrado sem número de processo.";
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
                        msg: nota || `Avaliação de petição solicitada ao Defensor(a) ${def}`,
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
                    historicoTransferencia: `Devolvido (Correção) por ${colabSeguro}. Msg: ${nota}`,
                    demandas: objetoDemandasFinal,
                    history: arrayUnion({
                        action: 'DEVOLVIDO_COM_ERRO',
                        by: colabSeguro,
                        msg: nota || `Retornado para correção na mesa do Servidor(a) ${serv}`,
                        at: timestampIso
                    })
                });
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
                tituloSucesso = "Pausa Registrada";
                subtituloSucesso = "O assistido foi mandado de volta à fila de espera.";
            }

            if (colaboradorDestinoObj && colaboradorDestinoObj.email) {
                console.log(`✉️ Iniciando disparo de e-mail para: ${colaboradorDestinoObj.email}`);
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

            try {
                const q = query(collection(db, "pautas", pautaIdSeguro, "attendances"));
                const snap = await getDocs(q);
                this.todosAtendimentosPauta = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            } catch (err) {
                console.warn("Falha silenciosa ao sincronizar cache local pós-envio:", err);
            }

            const isDefensor = this.colaboradorAtual?.cargo?.toLowerCase().includes('defensor');
            const textoBotaoVoltar = isDefensor ? '⚖️ Voltar ao Painel Judicial' : '📊 Voltar à Minha Mesa';

            let areaColaborador = document.getElementById('area-colaborador');
            if (!areaColaborador) {
                areaColaborador = document.querySelector('.w-full.max-w-2xl') || document.querySelector('.w-full.max-w-4xl') || document.body;
            }

            areaColaborador.innerHTML = `
                <div class="text-center p-8 sm:p-12 bg-emerald-50 rounded-2xl border-2 border-emerald-200 shadow-lg mt-6 animate-fade-in">
                    <div class="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center text-4xl text-white mx-auto shadow-md mb-6">✓</div>
                    <h2 class="text-2xl font-black text-emerald-800 uppercase tracking-widest">${tituloSucesso}</h2>
                    <p class="text-emerald-600 mt-2 font-medium">${subtituloSucesso}</p>
                    <div id="btn-voltar-container" class="mt-8"></div>
                </div>
            `;

            const btnVoltar = document.createElement('button');
            btnVoltar.className = "bg-slate-800 hover:bg-slate-900 text-white font-bold py-4 px-8 rounded-xl shadow transition w-full sm:w-auto uppercase text-xs tracking-widest";
            btnVoltar.innerText = textoBotaoVoltar;
            btnVoltar.onclick = () => this.renderizarDashboardUnificado();
            document.getElementById('btn-voltar-container').appendChild(btnVoltar);

            const headerBg = document.getElementById('header-bg');
            if (headerBg) {
                headerBg.classList.replace('bg-slate-800', 'bg-emerald-600');
                const circuloAzul = headerBg.querySelector('.bg-blue-500');
                if (circuloAzul) circuloAzul.remove(); 
            }

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

    // ⭐ CORRIGIDO: RENDERIZANDO A PLANILHA DE GASTOS NA TELA E ATIVANDO O BOTÃO PDF ⭐
    renderizarHistorico(assistido) {
        const lista = document.getElementById('lista-historico');
        if (!lista) return;

        if (!assistido.documentChecklist || !assistido.documentChecklist.action) {
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

        if (chk.checkedIds && chk.checkedIds.length > 0) {
            html += `<h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 pl-1">Documentos em Posse</h4><ul class="space-y-2 mb-8">`;
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

        if (chk.reuData && chk.reuData.checkReuUnico) {
            const reu = chk.reuData;
            html += `
                <div class="bg-rose-50 p-4 rounded-xl mb-6 border border-rose-200 shadow-sm relative overflow-hidden">
                    <div class="absolute top-0 left-0 w-1 h-full bg-rose-500"></div>
                    <h4 class="text-[10px] font-black text-rose-700 uppercase tracking-widest mb-3 pl-1 flex items-center gap-1"><span>👤</span> Dados do Pólo Passivo</h4>
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

        // DESENHANDO A PLANILHA DE GASTOS
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

        lista.innerHTML = html;
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

    async renderizarDashboardUnificado() {
        const corpo = document.querySelector('.w-full.max-w-2xl') || document.querySelector('.w-full.max-w-4xl');
        if (!corpo) return;

        const url = new URL(window.location.href);
        url.searchParams.set('view', 'dashboard');
        url.searchParams.delete('assistidoId'); 
        window.history.pushState({}, '', url);

        const isDefensor = this.colaboradorAtual?.cargo?.toLowerCase().includes('defensor');
        const tituloPainel = isDefensor ? 'Painel Judicial' : 'Minha Mesa de Trabalho';
        const subtituloPainel = isDefensor ? 'Fluxo de Assinaturas e Petições' : 'Atendimentos Repassados a Você';

        corpo.className = "w-full max-w-4xl mx-auto my-4"; 
        corpo.innerHTML = `
            <div id="header-bg" class="bg-slate-800 p-6 sm:p-8 rounded-t-2xl shadow-xl flex items-center justify-between relative overflow-hidden border-b border-slate-700">
                <div class="absolute top-0 right-0 w-64 h-64 bg-${isDefensor ? 'cyan' : 'indigo'}-500 opacity-20 rounded-full blur-3xl -mr-10 -mt-20 pointer-events-none"></div>
                <div class="flex items-center gap-4 relative z-10">
                    <div class="bg-white/10 p-2.5 rounded-xl border border-white/20 shadow-inner flex-shrink-0">
                        <img src="https://raw.githubusercontent.com/alexdovale/ac-o-paula-controle/main/imagem.png" alt="Logo" class="h-10 w-auto object-contain">
                    </div>
                    <div>
                        <h1 class="text-white font-black text-xl sm:text-2xl uppercase tracking-widest flex items-center gap-2">
                            ${tituloPainel}
                        </h1>
                        <p class="text-slate-300 text-xs sm:text-sm font-semibold mt-1 tracking-wide">${subtituloPainel}</p>
                    </div>
                </div>
            </div>
            
            <div class="bg-slate-50 p-4 sm:p-6 rounded-b-2xl shadow-lg border border-slate-300 min-h-[500px]">
                <div id="wrapper-busca-historico" class="hidden mb-4 animate-fade-in">
                    <input type="text" id="input-busca-local" class="w-full p-3 border border-slate-300 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner font-sans" placeholder="🔍 Digite o nome do assistido ou assunto para buscar no seu histórico...">
                </div>

                <div class="bg-white p-3 rounded-xl shadow-sm border border-slate-200 mb-6">
                    <div id="tabs-dashboard" class="flex gap-2 overflow-x-auto custom-scrollbar"></div>
                </div>
                <div id="lista-dashboard-conteudo" class="space-y-3 sm:space-y-4">
                    <div class="flex justify-center py-20"><div class="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-800"></div></div>
                </div>
            </div>
        `;

        try {
            const q = query(collection(db, "pautas", this.pautaId, "attendances"));
            const snap = await getDocs(q);
            this.todosAtendimentosPauta = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            
            const baseUrl = window.location.href.substring(0, window.location.href.indexOf('?'));

            const desenharCard = (item, isCardAberto) => {
                const notas = item.notasRevisao ? `<div class="mt-3 bg-yellow-50 p-3 rounded-lg text-xs text-yellow-900 border border-yellow-300 font-semibold shadow-sm leading-snug">⚠️ <b>Nota Anexada:</b> ${escapeHTML(item.notasRevisao)}</div>` : '';
                const numProcessoHtml = item.numeroProcesso ? `<span class="inline-flex items-center px-2 py-1 rounded bg-slate-100 text-slate-700 font-mono text-[10px] font-bold border border-slate-300 mt-2">Nº ${escapeHTML(item.numeroProcesso)}</span>` : '';
                const bannerTransf = item.historicoTransferencia ? `<div class="mt-3 bg-orange-50 p-2.5 rounded-lg text-[11px] text-orange-900 border border-orange-300 font-bold flex items-start gap-1 shadow-sm leading-snug"><span class="text-sm">🔄</span> <span>${escapeHTML(item.historicoTransferencia)}</span></div>` : '';
                
                let badgeTopo = '';
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

                if (isCardAberto) {
                    const linkIndividual = `${baseUrl}?pautaId=${this.pautaId}&assistidoId=${item.id}&colab=${encodeURIComponent(this.colaboradorNome)}&token=${item.delegationToken || ''}`;
                    return `
                        <div class="border-2 ${bgColorCard} p-5 rounded-2xl shadow-sm hover:shadow-lg transition-all relative group flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div class="flex-grow w-full sm:w-auto">
                                <div class="flex items-center gap-2 mb-2">
                                    ${badgeTopo}
                                    ${item.enviadoPor ? `<span class="text-[9px] text-slate-500 font-bold uppercase">Via: ${escapeHTML(item.enviadoPor)}</span>` : ''}
                                </div>
                                <h3 class="font-black text-slate-800 text-lg w-full truncate">${escapeHTML(item.name)}</h3>
                                <p class="text-xs font-semibold text-slate-500 mt-1 uppercase tracking-wide">${escapeHTML(item.subject || 'Assunto não informado')}</p>
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
                    return `
                        <div class="border border-emerald-200 bg-white p-4 rounded-xl shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                            <div>
                                <div class="mb-1">${badgeTopo}</div>
                                <h3 class="font-black text-slate-800 text-sm truncate">${escapeHTML(item.name)}</h3>
                                <p class="text-[10px] font-bold text-slate-400 mt-0.5 uppercase tracking-wide">${escapeHTML(item.subject)}</p>
                                ${numProcessoHtml}
                            </div>
                            <div class="shrink-0 text-right">
                                <span class="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2.5 py-1 rounded border border-emerald-300 uppercase tracking-widest shadow-sm inline-flex items-center gap-1"><span>✅</span> Finalizado</span>
                                <p class="text-[9px] text-slate-400 font-bold mt-1.5">${horaStr}</p>
                            </div>
                        </div>
                    `;
                }
            };

            const container = document.getElementById('lista-dashboard-conteudo');
            const tabsDiv = document.getElementById('tabs-dashboard');
            const wrapperBusca = document.getElementById('wrapper-busca-historico');

            if (isDefensor) {
                const pendentes = this.todosAtendimentosPauta.filter(a => (a.status === 'aguardandoDistribuicao' || a.status === 'aguardandoCorrecao') && a.defensorResponsavel === this.colaboradorNome);
                const finalizados = this.todosAtendimentosPauta.filter(a => a.status === 'atendido' && a.attendedBy === this.colaboradorNome);
                
                const meuHistoricoCompleto = this.todosAtendimentosPauta.filter(a => 
                    a.defensorResponsavel === this.colaboradorNome || 
                    a.attendedBy === this.colaboradorNome ||
                    (Array.isArray(a.history) && a.history.some(h => h.by === this.colaboradorNome))
                );

                tabsDiv.innerHTML = `
                    <button id="tab-pendentes" class="flex-1 py-3 px-2 text-xs font-black uppercase tracking-widest bg-slate-800 text-white rounded-lg shadow transition whitespace-nowrap">Aguardando Avaliação <span class="bg-white/20 text-white ml-2 px-2 py-0.5 rounded text-[10px]">${pendentes.length}</span></button>
                    <button id="tab-assinados" class="flex-1 py-3 px-2 text-xs font-black uppercase tracking-widest bg-white text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition whitespace-nowrap">Já Protocolados <span class="bg-slate-200 text-slate-700 ml-2 px-2 py-0.5 rounded text-[10px]">${finalizados.length}</span></button>
                    <button id="tab-historico-busca" class="flex-1 py-3 px-2 text-xs font-black uppercase tracking-widest bg-white text-indigo-500 hover:bg-indigo-50 rounded-lg transition whitespace-nowrap">🔍 Buscar Tudo</button>
                `;

                const renderDefensorList = (lista, isAberto) => {
                    if (lista.length === 0) {
                        container.innerHTML = `<div class="text-center py-16 opacity-50"><span class="text-5xl mb-4 block">🙌</span><p class="text-base font-black uppercase tracking-widest text-slate-500">NENHUM PROCESSO LOCALIZADO.</p></div>`;
                        return;
                    }
                    container.innerHTML = lista.map(item => desenharCard(item, isAberto)).join('');
                };

                const btnPend = document.getElementById('tab-pendentes');
                const btnAssi = document.getElementById('tab-assinados');
                const btnHist = document.getElementById('tab-historico-busca');

                const limparEstilosAbas = () => {
                    wrapperBusca.classList.add('hidden');
                    btnPend.className = "flex-1 py-3 px-2 text-xs font-black uppercase tracking-widest bg-white text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition whitespace-nowrap";
                    btnAssi.className = "flex-1 py-3 px-2 text-xs font-black uppercase tracking-widest bg-white text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition whitespace-nowrap";
                    btnHist.className = "flex-1 py-3 px-2 text-xs font-black uppercase tracking-widest bg-white text-indigo-500 hover:bg-indigo-50 rounded-lg transition whitespace-nowrap";
                };

                btnPend.onclick = () => {
                    limparEstilosAbas();
                    btnPend.className = "flex-1 py-3 px-2 text-xs font-black uppercase tracking-widest bg-slate-800 text-white rounded-lg shadow transition whitespace-nowrap";
                    renderDefensorList(pendentes, true);
                };
                btnAssi.onclick = () => {
                    limparEstilosAbas();
                    btnAssi.className = "flex-1 py-3 px-2 text-xs font-black uppercase tracking-widest bg-emerald-600 text-white rounded-lg shadow transition whitespace-nowrap";
                    renderDefensorList(finalizados, false);
                };
                btnHist.onclick = () => {
                    limparEstilosAbas();
                    wrapperBusca.classList.remove('hidden');
                    btnHist.className = "flex-1 py-3 px-2 text-xs font-black uppercase tracking-widest bg-indigo-600 text-white rounded-lg shadow transition whitespace-nowrap";
                    renderDefensorList(meuHistoricoCompleto, true);
                    
                    document.getElementById('input-busca-local').oninput = (e) => {
                        const termo = e.target.value.toLowerCase().trim();
                        const filtrados = meuHistoricoCompleto.filter(i => 
                            (i.name && i.name.toLowerCase().includes(termo)) || 
                            (i.subject && i.subject.toLowerCase().includes(termo)) ||
                            (i.numeroProcesso && i.numeroProcesso.includes(termo))
                        );
                        renderDefensorList(filtrados, true);
                    };
                };

                renderDefensorList(pendentes, true);

            } else {
                const emAndamento = this.todosAtendimentosPauta.filter(a => a.status === 'emAtendimento' && a.assignedCollaborator?.name === this.colaboradorNome);
                const enviados = this.todosAtendimentosPauta.filter(a => (a.status === 'aguardandoDistribuicao' || a.status === 'aguardandoCorrecao') && a.enviadoPor === this.colaboradorNome);
                const finalizados = this.todosAtendimentosPauta.filter(a => a.status === 'atendido' && a.attendedBy === this.colaboradorNome);
                
                const meuHistoricoCompleto = this.todosAtendimentosPauta.filter(a => 
                    a.enviadoPor === this.colaboradorNome || 
                    a.attendedBy === this.colaboradorNome || 
                    a.assignedCollaborator?.name === this.colaboradorNome ||
                    (Array.isArray(a.history) && a.history.some(h => h.by === this.colaboradorNome))
                );

                tabsDiv.innerHTML = `
                    <button id="tab-em-mesa" class="flex-1 py-3 px-1 text-[10px] sm:text-xs font-black uppercase tracking-widest bg-slate-800 text-white rounded-lg shadow transition whitespace-nowrap">Em Mesa <span class="bg-white/20 text-white ml-1 px-1.5 py-0.5 rounded text-[9px]">${emAndamento.length}</span></button>
                    <button id="tab-enviados" class="flex-1 py-3 px-1 text-[10px] sm:text-xs font-black uppercase tracking-widest bg-white text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition whitespace-nowrap">No Defensor <span class="bg-slate-200 text-slate-700 ml-1 px-1.5 py-0.5 rounded text-[9px]">${enviados.length}</span></button>
                    <button id="tab-finalizados" class="flex-1 py-3 px-1 text-[10px] sm:text-xs font-black uppercase tracking-widest bg-white text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition whitespace-nowrap">Concluídos <span class="bg-slate-200 text-slate-700 ml-1 px-1.5 py-0.5 rounded text-[9px]">${finalizados.length}</span></button>
                    <button id="tab-historico-busca" class="flex-1 py-3 px-1 text-[10px] sm:text-xs font-black uppercase tracking-widest bg-white text-indigo-500 hover:bg-indigo-50 rounded-lg transition whitespace-nowrap">🔍 Buscar</button>
                `;

                const renderServidorList = (lista, isAberto, isEmptyAviso) => {
                    if (lista.length === 0) {
                        container.innerHTML = `<div class="text-center py-16 opacity-50"><span class="text-5xl mb-4 block">📭</span><p class="text-sm font-black uppercase tracking-widest text-slate-500">${isEmptyAviso}</p></div>`;
                        return;
                    }
                    container.innerHTML = lista.map(item => desenharCard(item, isAberto)).join('');
                };

                const btnMesa = document.getElementById('tab-em-mesa');
                const btnEnv = document.getElementById('tab-enviados');
                const btnFin = document.getElementById('tab-finalizados');
                const btnHist = document.getElementById('tab-historico-busca');

                const resetTabs = () => {
                    wrapperBusca.classList.add('hidden');
                    [btnMesa, btnEnv, btnFin, btnHist].forEach(b => b.className = "flex-1 py-3 px-1 text-[10px] sm:text-xs font-black uppercase tracking-widest bg-white text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition whitespace-nowrap");
                };

                btnMesa.onclick = () => {
                    resetTabs();
                    btnMesa.className = "flex-1 py-3 px-1 text-[10px] sm:text-xs font-black uppercase tracking-widest bg-slate-800 text-white rounded-lg shadow transition whitespace-nowrap";
                    renderServidorList(emAndamento, true, "Sua mesa está limpa.");
                };
                btnEnv.onclick = () => {
                    resetTabs();
                    btnEnv.className = "flex-1 py-3 px-1 text-[10px] sm:text-xs font-black uppercase tracking-widest bg-indigo-600 text-white rounded-lg shadow transition whitespace-nowrap";
                    renderServidorList(enviados, true, "Nenhum documento seu no Defensor.");
                };
                btnFin.onclick = () => {
                    resetTabs();
                    btnFin.className = "flex-1 py-3 px-1 text-[10px] sm:text-xs font-black uppercase tracking-widest bg-emerald-600 text-white rounded-lg shadow transition whitespace-nowrap";
                    renderServidorList(finalizados, false, "Você ainda não finalizou nada hoje.");
                };
                btnHist.onclick = () => {
                    resetTabs();
                    wrapperBusca.classList.remove('hidden');
                    btnHist.className = "flex-1 py-3 px-1 text-[10px] sm:text-xs font-black uppercase tracking-widest bg-indigo-600 text-white rounded-lg shadow transition whitespace-nowrap";
                    renderServidorList(meuHistoricoCompleto, true, "Nenhum histórico encontrado.");

                    document.getElementById('input-busca-local').oninput = (e) => {
                        const termo = e.target.value.toLowerCase().trim();
                        const filtrados = meuHistoricoCompleto.filter(i => 
                            (i.name && i.name.toLowerCase().includes(termo)) || 
                            (i.subject && i.subject.toLowerCase().includes(termo)) ||
                            (i.numeroProcesso && i.numeroProcesso.includes(termo))
                        );
                        renderServidorList(filtrados, true, "Nenhum processo corresponde aos termos.");
                    };
                };

                renderServidorList(emAndamento, true, "Sua mesa está limpa.");
            }

        } catch (error) {
            console.error(error);
            document.getElementById('lista-dashboard-conteudo').innerHTML = `<p class="text-red-500 text-sm text-center font-bold">Erro ao carregar os processos. O servidor pode estar offline.</p>`;
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
