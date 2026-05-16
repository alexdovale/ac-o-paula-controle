// js/atendimentoExternoService.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc, collection, getDocs, query, where, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { firebaseConfig } from './config.js';
import { documentsData } from './detalhes.js'; 
import { PDFService } from './pdfService.js';

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

    async init() {
        console.log("⚡ Atendimento Externo inicializado (Fluxo Correção + Dashboard Unificado)");

        const urlParams = new URLSearchParams(window.location.search);
        this.pautaId = urlParams.get('pautaId');
        this.assistidoId = urlParams.get('assistidoId'); 
        const tokenRecebido = urlParams.get('token');
        this.colaboradorNome = urlParams.get('colab') || "Colaborador";

        if (!this.pautaId || !this.colaboradorNome) {
            this.showError("Link Incompleto", "Faltam parâmetros de Pauta ou Colaborador na URL.");
            return;
        }

        try {
            await signInAnonymously(auth);

            // Carrega todos os colaboradores da pauta
            await this.carregarColaboradoresGerais();

            // SE NÃO TIVER ASSISTIDO NA URL, ABRE O PAINEL GERAL (DEFENSOR OU SERVIDOR)
            if (!this.assistidoId) {
                this.renderizarDashboardUnificado();
                return;
            }

            // MODO ATENDIMENTO INDIVIDUAL
            if (!tokenRecebido) {
                this.showError("Link Incompleto", "Falta o token de segurança para acessar o atendimento.");
                return;
            }

            const pautaRef = doc(db, "pautas", this.pautaId);
            const pautaSnap = await getDoc(pautaRef);
            if (!pautaSnap.exists()) {
                this.showError("Erro", "A pauta informada não existe mais.");
                return;
            }
            const pautaData = pautaSnap.data();

            const docRef = doc(db, "pautas", this.pautaId, "attendances", this.assistidoId);
            const docSnap = await getDoc(docRef);

            if (!docSnap.exists()) {
                this.showError("Não encontrado", "Este assistido não existe mais na pauta.");
                return;
            }

            const assistido = docSnap.data();
            this.assistidoData = assistido;

            if (assistido.delegationToken !== tokenRecebido) {
                this.showError("Acesso Negado", "Token de segurança inválido ou expirado. O caso pode ter sido transferido.");
                return;
            }

            if (assistido.status === 'atendido') {
                this.showError("Atendimento Concluído", "Este atendimento já foi finalizado anteriormente.");
                return;
            }

            this.renderizarInterface(assistido, pautaData);
            this.setupListeners();

        } catch (error) {
            console.error("Erro ao carregar dados:", error);
            this.showError("Erro no Servidor", "Falha ao conectar com o banco de dados.");
        }
    },

    async carregarColaboradoresGerais() {
        try {
            const snap = await getDocs(collection(db, "pautas", this.pautaId, "collaborators"));
            this.todosColaboradores = snap.docs.map(d => d.data());
            this.colaboradorAtual = this.todosColaboradores.find(c => c.nome === this.colaboradorNome);
        } catch (error) {
            console.error("Erro ao carregar colaboradores", error);
            this.todosColaboradores = [];
        }
    },

    renderizarInterface(assistido, pautaData) {
        // Injeção do Header
        const headerBg = document.getElementById('header-bg');
        if (headerBg && !document.getElementById('logo-header-main')) {
            const textosWrapper = document.createElement('div');
            textosWrapper.className = "overflow-hidden w-full";
            while (headerBg.firstChild) {
                textosWrapper.appendChild(headerBg.firstChild);
            }
            headerBg.classList.add('flex', 'items-center', 'gap-4');
            const logoDiv = document.createElement('div');
            logoDiv.id = 'logo-header-main';
            logoDiv.className = 'bg-white p-1 rounded-lg shadow-sm flex-shrink-0';
            logoDiv.innerHTML = '<img src="https://raw.githubusercontent.com/alexdovale/ac-o-paula-controle/main/imagem.png" alt="Logo do Sistema" class="h-10 w-auto object-contain">';
            headerBg.appendChild(logoDiv);
            headerBg.appendChild(textosWrapper);
        }

        document.getElementById('assistido-nome').textContent = assistido.name || 'Nome não informado';
        document.getElementById('assistido-assunto').textContent = assistido.subject || 'Assunto não informado';
        
        const areaColaborador = document.getElementById('area-colaborador');
        areaColaborador.classList.remove('hidden');

        // Banner de Histórico de Transferência / Retorno de Correção
        if (assistido.historicoTransferencia && !document.getElementById('banner-transferencia')) {
            const bannerHtml = `
                <div id="banner-transferencia" class="w-full bg-orange-50 border border-orange-200 text-orange-800 px-4 py-3 rounded-xl shadow-sm mb-6 text-xs font-medium flex items-center gap-3">
                    <span class="text-lg">🔄</span>
                    <span>${escapeHTML(assistido.historicoTransferencia)}</span>
                </div>
            `;
            areaColaborador.insertAdjacentHTML('afterbegin', bannerHtml);
        }

        // Atalho dinâmico para o Painel Judicial
        if (!document.getElementById('btn-atalho-painel')) {
            const isDefensor = this.colaboradorAtual?.cargo?.toLowerCase().includes('defensor');
            const tituloBotao = isDefensor ? '💼 Acessar Meu Painel Judicial' : '📊 Acessar Meus Atendimentos';
            const btnHtml = `
                <button id="btn-atalho-painel" class="w-full bg-indigo-50 border-2 border-indigo-200 text-indigo-700 hover:bg-indigo-100 font-black py-3 px-4 rounded-xl shadow-sm transition-colors text-xs flex items-center justify-center gap-2 mb-6 uppercase tracking-wider">
                    ${tituloBotao}
                </button>
            `;
            areaColaborador.insertAdjacentHTML('afterbegin', btnHtml);
            document.getElementById('btn-atalho-painel').onclick = () => {
                this.renderizarDashboardUnificado();
            };
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

        // 1. FINALIZAR (Para Servidor e Defensor)
        optionsHtml += `
            <button id="btn-opt-direto" class="fluxo-opt-btn ring-4 ring-blue-400 bg-blue-50 border-blue-200 p-4 rounded-xl text-left transition-all">
                <span class="block text-lg mb-1">✅</span>
                <span class="block font-bold text-gray-800">Finalizar Atendimento</span>
                <span class="block text-xs text-gray-500 mt-1">Concluir e dar baixa na pauta.</span>
            </button>
        `;

        if (showDistribuicao) {
            // 2 e 3. FLUXOS DO SERVIDOR PARA O DEFENSOR
            optionsHtml += `
                <button id="btn-opt-dist" class="fluxo-opt-btn border-2 border-gray-200 p-4 rounded-xl text-left transition-all hover:bg-gray-50">
                    <span class="block text-lg mb-1">⚖️</span>
                    <span class="block font-bold text-gray-800">Fila de Distribuição</span>
                    <span class="block text-xs text-gray-500 mt-1">Enviar para Defensor assinar.</span>
                </button>
                <button id="btn-opt-correcao" class="fluxo-opt-btn border-2 border-gray-200 p-4 rounded-xl text-left transition-all hover:bg-gray-50">
                    <span class="block text-lg mb-1">📝</span>
                    <span class="block font-bold text-gray-800">Pedir Correção</span>
                    <span class="block text-xs text-gray-500 mt-1">Defensor avalia a petição.</span>
                </button>
            `;
        }

        if (isDefensor) {
            // FLUXO DO DEFENSOR RETORNANDO
            optionsHtml += `
                <button id="btn-opt-devolver" class="fluxo-opt-btn border-2 border-gray-200 p-4 rounded-xl text-left transition-all hover:bg-gray-50">
                    <span class="block text-lg mb-1">🔙</span>
                    <span class="block font-bold text-gray-800">Devolver Corrigido</span>
                    <span class="block text-xs text-gray-500 mt-1">Retorna ao Servidor.</span>
                </button>
            `;
        }

        // TRANSFERIR E PAUSAR
        optionsHtml += `
            <button id="btn-opt-transferir" class="fluxo-opt-btn border-2 border-gray-200 p-4 rounded-xl text-left transition-all hover:bg-gray-50">
                <span class="block text-lg mb-1">🔄</span>
                <span class="block font-bold text-gray-800">Transferir Colega</span>
                <span class="block text-xs text-gray-500 mt-1">Passar a vez para outro membro.</span>
            </button>
            <button id="btn-opt-pausar" class="fluxo-opt-btn border-2 border-gray-200 p-4 rounded-xl text-left transition-all hover:bg-gray-50">
                <span class="block text-lg mb-1">⏸️</span>
                <span class="block font-bold text-gray-800">Pausar / Voltar p/ Fila</span>
                <span class="block text-xs text-gray-500 mt-1">Devolver para "Aguardando".</span>
            </button>
        </div>`;

        // ==== BLOCOS DE CONFIGURAÇÃO ====
        optionsHtml += `
            <div id="config-numero-processo" class="bg-gray-50 p-4 rounded-xl border border-gray-200 mb-6 transition-all">
                <label class="block text-xs font-bold text-gray-600 uppercase mb-2">Número do Processo / Caso (Opcional)</label>
                <input type="text" id="input-numero-caso" value="${assistido.numeroProcesso || ''}" class="w-full p-3 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all" placeholder="Ex: 0001234-56.2026.8.19.0021">
            </div>

            <div id="config-distribuicao" class="hidden bg-blue-50 p-4 rounded-xl border border-blue-200 mb-6">
                <label class="block text-xs font-bold text-blue-700 uppercase mb-2">Defensor(a) Responsável (Distribuição)</label>
                <select id="select-defensor-distribuicao" class="w-full p-3 border border-blue-300 rounded-lg text-sm bg-white mb-3"></select>
                <label class="block text-xs font-bold text-blue-700 uppercase mb-2">Notas (Opcional)</label>
                <textarea id="notas-distribuicao-dinamico" rows="2" class="w-full p-3 border border-blue-300 rounded-lg text-sm bg-white" placeholder="Ex: Peça pronta para assinatura."></textarea>
            </div>

            <div id="config-correcao" class="hidden bg-amber-50 p-4 rounded-xl border border-amber-200 mb-6">
                <label class="block text-xs font-bold text-amber-700 uppercase mb-2">Defensor(a) para Correção</label>
                <select id="select-defensor-correcao" class="w-full p-3 border border-amber-300 rounded-lg text-sm bg-white mb-3"></select>
                <label class="block text-xs font-bold text-amber-700 uppercase mb-2">Dúvida / Nota da Correção</label>
                <textarea id="notas-correcao-dinamico" rows="2" class="w-full p-3 border border-amber-300 rounded-lg text-sm bg-white" placeholder="Ex: Defensor, favor conferir o cálculo da pensão."></textarea>
            </div>

            <div id="config-devolver" class="hidden bg-emerald-50 p-4 rounded-xl border border-emerald-200 mb-6">
                <label class="block text-xs font-bold text-emerald-700 uppercase mb-2">Devolver para qual Servidor?</label>
                <select id="select-servidor-devolver" class="w-full p-3 border border-emerald-300 rounded-lg text-sm bg-white mb-3"></select>
                <label class="block text-xs font-bold text-emerald-700 uppercase mb-2">Orientações da Correção</label>
                <textarea id="notas-devolver-dinamico" rows="2" class="w-full p-3 border border-emerald-300 rounded-lg text-sm bg-white" placeholder="Ex: Corrigido. Já pode distribuir."></textarea>
            </div>

            <div id="config-transferencia" class="hidden bg-orange-50 p-4 rounded-xl border border-orange-200 mb-6">
                <label class="block text-xs font-bold text-orange-700 uppercase mb-2">Transferir para qual colega?</label>
                <select id="select-transferir-colega" class="w-full p-3 border border-orange-300 rounded-lg text-sm bg-white mb-3"></select>
            </div>

            <button id="btn-finalizar-dinamico" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl shadow-md transition-colors text-sm uppercase tracking-wide">
                Confirmar e Seguir
            </button>
        `;

        aba.innerHTML = optionsHtml;
        this.povoarSelectsDinamicos();

        this.fluxoSelecionado = 'direto';
        const btnDireto = document.getElementById('btn-opt-direto');
        const btnDist = document.getElementById('btn-opt-dist');
        const btnCorrecao = document.getElementById('btn-opt-correcao');
        const btnDevolver = document.getElementById('btn-opt-devolver');
        const btnTransf = document.getElementById('btn-opt-transferir');
        const btnPausar = document.getElementById('btn-opt-pausar');
        
        const configDist = document.getElementById('config-distribuicao');
        const configCorrecao = document.getElementById('config-correcao');
        const configDevolver = document.getElementById('config-devolver');
        const configTransf = document.getElementById('config-transferencia');
        const configProc = document.getElementById('config-numero-processo');

        const todos = [btnDireto, btnDist, btnCorrecao, btnDevolver, btnTransf, btnPausar].filter(Boolean);

        const setAtivo = (btnClicado, fluxo) => {
            this.fluxoSelecionado = fluxo;
            todos.forEach(b => {
                b.classList.remove('ring-4', 'ring-blue-400', 'bg-blue-50', 'border-blue-200');
                b.classList.add('border-gray-200');
            });
            btnClicado.classList.remove('border-gray-200');
            btnClicado.classList.add('ring-4', 'ring-blue-400', 'bg-blue-50', 'border-blue-200');

            if(configDist) configDist.classList.toggle('hidden', fluxo !== 'distribuicao');
            if(configCorrecao) configCorrecao.classList.toggle('hidden', fluxo !== 'correcao');
            if(configDevolver) configDevolver.classList.toggle('hidden', fluxo !== 'devolver');
            if(configTransf) configTransf.classList.toggle('hidden', fluxo !== 'transferir');
            if(configProc) configProc.classList.toggle('hidden', fluxo === 'pausar');
        };

        if(btnDireto) btnDireto.onclick = () => setAtivo(btnDireto, 'direto');
        if(btnDist) btnDist.onclick = () => setAtivo(btnDist, 'distribuicao');
        if(btnCorrecao) btnCorrecao.onclick = () => setAtivo(btnCorrecao, 'correcao');
        if(btnDevolver) btnDevolver.onclick = () => setAtivo(btnDevolver, 'devolver');
        if(btnTransf) btnTransf.onclick = () => setAtivo(btnTransf, 'transferir');
        if(btnPausar) btnPausar.onclick = () => setAtivo(btnPausar, 'pausar');

        document.getElementById('btn-finalizar-dinamico').onclick = () => this.finalizarProcesso();
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
                opt.textContent = `${c.nome} ${c.cargo ? ' - '+c.cargo : ''}`;
                if (valueToSelect === c.nome) opt.selected = true;
                select.appendChild(opt);
            });
        };

        preencher('select-defensor-distribuicao', defensores, '-- Selecione o Defensor --');
        preencher('select-defensor-correcao', defensores, '-- Selecione o Defensor para Avaliar --');
        preencher('select-transferir-colega', todosMenosEu, '-- Selecione o Colega --');
        
        // Auto-selecionar quem enviou a peça, caso exista
        const enviadoPorInicial = this.assistidoData?.enviadoPor || '';
        preencher('select-servidor-devolver', servidores, '-- Selecione o Servidor --', enviadoPorInicial);
    },

    async finalizarProcesso() {
        if (!this.fluxoSelecionado) return;

        const btnFinalizar = document.getElementById('btn-finalizar-dinamico');
        btnFinalizar.disabled = true;
        btnFinalizar.textContent = "Processando...";

        const inputNumeroCaso = document.getElementById('input-numero-caso');
        const numeroProcessoSalvo = inputNumeroCaso ? inputNumeroCaso.value.trim() : '';

        let updateData = {};
        let tituloSucesso = "Atendimento Atualizado!";
        let subtituloSucesso = "Ação registrada com sucesso.";

        if (this.fluxoSelecionado === 'direto') {
            updateData = {
                status: 'atendido',
                attendedAt: new Date().toISOString(),
                attendedTime: new Date().toISOString(),
                attendedBy: this.colaboradorNome,
                finalizadoPeloColaborador: true,
                distributionStatus: 'completed',
                numeroProcesso: numeroProcessoSalvo || ''
            };
            tituloSucesso = "Atendimento Concluído!";
            subtituloSucesso = "O processo foi finalizado com sucesso.";
        } 
        else if (this.fluxoSelecionado === 'distribuicao') {
            const defensor = document.getElementById('select-defensor-distribuicao')?.value;
            const notas = document.getElementById('notas-distribuicao-dinamico')?.value;
            if (!defensor) { alert("Selecione um Defensor!"); btnFinalizar.disabled = false; btnFinalizar.textContent = "Confirmar e Seguir"; return; }
            
            updateData = {
                status: 'aguardandoDistribuicao',
                defensorResponsavel: defensor,
                notasRevisao: notas || '',
                numeroProcesso: numeroProcessoSalvo || '',
                enviadoPor: this.colaboradorNome // Rastreio de quem enviou
            };
            tituloSucesso = "Enviado para Distribuição!";
            subtituloSucesso = `O Defensor ${defensor} recebeu a peça para assinar.`;
        }
        else if (this.fluxoSelecionado === 'correcao') {
            const defensor = document.getElementById('select-defensor-correcao')?.value;
            const notas = document.getElementById('notas-correcao-dinamico')?.value;
            if (!defensor) { alert("Selecione um Defensor!"); btnFinalizar.disabled = false; btnFinalizar.textContent = "Confirmar e Seguir"; return; }
            
            updateData = {
                status: 'aguardandoCorrecao', // Novo Status
                defensorResponsavel: defensor,
                notasRevisao: notas || '',
                numeroProcesso: numeroProcessoSalvo || '',
                enviadoPor: this.colaboradorNome // Rastreio de quem enviou
            };
            tituloSucesso = "Enviado para Correção!";
            subtituloSucesso = `O Defensor ${defensor} recebeu a peça para avaliação.`;
        }
        else if (this.fluxoSelecionado === 'devolver') {
            const servidor = document.getElementById('select-servidor-devolver')?.value;
            const notas = document.getElementById('notas-devolver-dinamico')?.value || 'Corrigido.';
            if (!servidor) { alert("Selecione o servidor que vai receber o retorno!"); btnFinalizar.disabled = false; btnFinalizar.textContent = "Confirmar e Seguir"; return; }
            
            const colegaObj = this.todosColaboradores.find(c => c.nome === servidor);
            const tokenSeguranca = Date.now().toString(36) + Math.random().toString(36).substring(2);

            updateData = {
                status: 'emAtendimento', // Volta para a mesa do servidor
                assignedCollaborator: { name: servidor, email: colegaObj?.email || null },
                inAttendanceTime: new Date().toISOString(), // Zera o tempo para o servidor
                delegationToken: tokenSeguranca,
                historicoTransferencia: `O Defensor ${this.colaboradorNome} devolveu após correção. Nota: ${notas}`,
                numeroProcesso: numeroProcessoSalvo || ''
            };
            tituloSucesso = "Devolvido ao Servidor!";
            subtituloSucesso = `O servidor ${servidor} recebeu o caso de volta.`;
        }
        else if (this.fluxoSelecionado === 'transferir') {
            const colegaSelecionado = document.getElementById('select-transferir-colega')?.value;
            if (!colegaSelecionado) { alert("Selecione o colega!"); btnFinalizar.disabled = false; btnFinalizar.textContent = "Confirmar e Seguir"; return; }

            const colegaObj = this.todosColaboradores.find(c => c.nome === colegaSelecionado);
            const tokenSeguranca = Date.now().toString(36) + Math.random().toString(36).substring(2);

            updateData = {
                status: 'emAtendimento', 
                assignedCollaborator: { name: colegaSelecionado, email: colegaObj?.email || null },
                inAttendanceTime: new Date().toISOString(), 
                delegationToken: tokenSeguranca,
                historicoTransferencia: `Transferência manual de ${this.colaboradorNome} para ${colegaSelecionado}.`,
                numeroProcesso: numeroProcessoSalvo || ''
            };
            tituloSucesso = "Transferência Realizada!";
            subtituloSucesso = `O atendimento foi repassado para ${colegaSelecionado}.`;
        } 
        else if (this.fluxoSelecionado === 'pausar') {
            updateData = {
                status: 'aguardando',
                assignedCollaborator: null,
                delegatedBy: null,
                delegatedAt: null,
                inAttendanceTime: null,
                distributionStatus: null
            };
            tituloSucesso = "Atendimento Pausado!";
            subtituloSucesso = "O assistido retornou para a fila geral.";
        }

        try {
            const docRef = doc(db, "pautas", this.pautaId, "attendances", this.assistidoId);
            await updateDoc(docRef, updateData);

            const isDefensor = this.colaboradorAtual?.cargo?.toLowerCase().includes('defensor');
            const textoBotaoVoltar = isDefensor ? '💼 Voltar ao Painel Judicial' : '📊 Voltar aos Meus Atendimentos';

            const mensagemSucessoHtml = `
                <div class="text-center p-8 bg-green-50 rounded-xl border border-green-200 shadow-sm mt-8 animate-fade-in">
                    <span class="text-5xl">✅</span>
                    <h2 class="text-2xl font-bold text-green-800 mt-4">${tituloSucesso}</h2>
                    <p class="text-green-600 mt-2 font-medium">${subtituloSucesso}</p>
                    <button id="btn-voltar-sucesso" class="mt-6 text-sm text-green-700 underline font-bold">${textoBotaoVoltar}</button>
                </div>
            `;

            const areaColaborador = document.getElementById('area-colaborador');
            if (areaColaborador) {
                areaColaborador.innerHTML = mensagemSucessoHtml;
            }

            const btnVoltar = document.getElementById('btn-voltar-sucesso');
            if (btnVoltar) {
                btnVoltar.onclick = () => {
                    this.renderizarDashboardUnificado(); 
                };
            }

            const headerBg = document.getElementById('header-bg');
            if (headerBg) {
                headerBg.classList.remove('bg-blue-600', 'bg-indigo-600', 'bg-blue-500');
                headerBg.classList.add('bg-green-600', 'transition-colors');
            }

        } catch (error) {
            console.error("Erro real ao salvar:", error);
            alert("Erro ao salvar. Verifique a internet e tente novamente.");
            btnFinalizar.disabled = false;
            btnFinalizar.textContent = "Confirmar e Seguir";
        }
    },

    renderizarHistorico(assistido) {
        const lista = document.getElementById('lista-historico');
        if (!lista) return;

        if (!assistido.documentChecklist || !assistido.documentChecklist.action) {
            lista.innerHTML = `<div class="text-center py-8"><span class="text-3xl">📭</span><p class="text-sm font-bold text-gray-700 mt-3">Nenhum checklist registrado.</p></div>`;
            return;
        }

        const chk = assistido.documentChecklist;
        const baseDeDados = documentsData || window.documentsData || {};
        const actionData = baseDeDados[chk.action];
        const actionTitle = actionData ? actionData.title : chk.action.replace(/_/g, ' ').toUpperCase();
        
        let html = `
            <div class="bg-blue-50 p-4 rounded-xl mb-4 border border-blue-100 shadow-sm">
                <p class="text-[10px] text-blue-500 font-bold uppercase mb-1">Ação Analisada:</p>
                <p class="text-sm font-black text-blue-800 uppercase">${actionTitle}</p>
            </div>
        `;

        if (chk.checkedIds && chk.checkedIds.length > 0) {
            html += `<h4 class="text-[10px] font-bold text-gray-400 uppercase mb-3">Documentos Coletados</h4><ul class="space-y-2 mb-6">`;
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
                    <li class="text-xs bg-white border border-gray-200 p-3 rounded-lg flex justify-between items-center shadow-sm">
                        <span class="font-semibold text-gray-700 pr-2">📄 ${docName}</span> 
                        <span class="font-bold text-[9px] uppercase tracking-wider ${tipo === 'Físico' ? 'text-amber-600 bg-amber-50 border-amber-200' : 'text-emerald-600 bg-emerald-50 border-emerald-200'} px-2 py-1 rounded border">${tipo}</span>
                    </li>
                `;
            });
            html += `</ul>`;
        }

        if (chk.reuData && chk.reuData.checkReuUnico) {
            const reu = chk.reuData;
            html += `
                <div class="bg-red-50 p-4 rounded-xl mb-6 border border-red-200 shadow-sm">
                    <h4 class="text-[10px] font-black text-red-700 uppercase mb-3 flex items-center gap-1"><span>👤</span> Dados da Parte Contrária (Réu)</h4>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4 text-xs text-gray-700">
                        ${reu.nome ? `<p><b class="text-gray-500">Nome:</b> ${reu.nome}</p>` : ''}
                        ${reu.cpf ? `<p><b class="text-gray-500">CPF:</b> ${reu.cpf}</p>` : ''}
                        ${reu.telefone ? `<p><b class="text-gray-500">Telefone:</b> ${reu.telefone}</p>` : ''}
                        ${reu.cep ? `<p class="sm:col-span-2"><b class="text-gray-500">Residência:</b> ${reu.rua}, ${reu.numero} ${reu.complemento ? ' - '+reu.complemento : ''} - ${reu.bairro}, ${reu.cidade}/${reu.uf} (CEP: ${reu.cep})</p>` : ''}
                        ${reu.empresa ? `<p class="sm:col-span-2 pt-2 border-t border-red-100"><b class="text-gray-500">Trabalho:</b> ${reu.empresa} - ${reu.rua_comercial}, ${reu.numero_comercial} - ${reu.cidade_comercial}/${reu.uf_comercial}</p>` : ''}
                    </div>
                </div>
            `;
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
            btnEncerramento.classList.add('tab-active');
            btnEncerramento.classList.remove('text-gray-400');
            btnHistorico.classList.remove('tab-active');
            btnHistorico.classList.add('text-gray-400');
            abaEncerramento.classList.remove('hidden');
            abaHistorico.classList.add('hidden');
        } else {
            btnHistorico.classList.add('tab-active');
            btnHistorico.classList.remove('text-gray-400');
            btnEncerramento.classList.remove('tab-active');
            btnEncerramento.classList.add('text-gray-400');
            abaHistorico.classList.remove('hidden');
            abaEncerramento.classList.add('hidden');
        }
    },

    // ==========================================
    // DASHBOARD UNIFICADO (DEFENSOR E SERVIDOR)
    // ==========================================
    async renderizarDashboardUnificado() {
        const corpo = document.querySelector('.w-full.max-w-2xl');
        if (!corpo) return;

        const isDefensor = this.colaboradorAtual?.cargo?.toLowerCase().includes('defensor');
        const tituloPainel = isDefensor ? 'Meu Painel Judicial' : 'Meus Atendimentos';
        const iconePainel = isDefensor ? '⚖️' : '🧑‍💻';

        // Cabeçalho da tela
        corpo.innerHTML = `
            <div id="header-bg" class="bg-indigo-600 p-5 rounded-t-2xl shadow flex items-center justify-between">
                <div class="flex items-center gap-4">
                    <div class="bg-white p-1 rounded-lg shadow-sm flex-shrink-0">
                        <img src="https://raw.githubusercontent.com/alexdovale/ac-o-paula-controle/main/imagem.png" alt="Logo do Sistema" class="h-10 w-auto object-contain">
                    </div>
                    <div>
                        <h1 class="text-white font-black text-lg sm:text-xl uppercase tracking-wide flex items-center gap-2">
                            ${iconePainel} ${tituloPainel}
                        </h1>
                        <p class="text-indigo-200 text-xs mt-1">Bem-vindo(a), ${this.colaboradorNome}</p>
                    </div>
                </div>
            </div>
            
            <div class="bg-white p-4 rounded-b-2xl shadow min-h-[400px]">
                <div id="tabs-dashboard" class="flex border-b border-gray-200 mb-4 overflow-x-auto custom-scrollbar"></div>
                <div id="lista-dashboard-conteudo" class="space-y-3">
                    <p class="text-center text-gray-400 text-sm mt-10"><span class="animate-spin text-xl block mb-2">⏳</span> Carregando processos...</p>
                </div>
            </div>
        `;

        try {
            const q = query(collection(db, "pautas", this.pautaId, "attendances"));
            const snap = await getDocs(q);
            const todos = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            const baseUrl = window.location.href.substring(0, window.location.href.indexOf('?'));

            // Função helper para desenhar o Card baseado no status
            const desenharCard = (item, isCardAberto) => {
                const notas = item.notasRevisao ? `<div class="mt-2 bg-yellow-50 p-2 rounded text-[10px] text-yellow-800 border border-yellow-200 font-medium">⚠️ <b>Nota:</b> ${escapeHTML(item.notasRevisao)}</div>` : '';
                const numProcessoHtml = item.numeroProcesso ? `<p class="text-[10px] text-blue-700 font-bold mt-1 tracking-wide">Nº Proc: ${escapeHTML(item.numeroProcesso)}</p>` : '';
                const bannerTransf = item.historicoTransferencia ? `<div class="mt-2 bg-orange-50 p-2 rounded text-[10px] text-orange-800 border border-orange-200 font-medium flex items-center gap-1"><span class="text-xs">🔄</span> ${escapeHTML(item.historicoTransferencia)}</div>` : '';
                
                let badgeTopo = '';
                if (item.status === 'aguardandoCorrecao') badgeTopo = `<span class="absolute top-3 right-3 bg-amber-100 text-amber-700 text-[9px] font-black px-2 py-0.5 rounded uppercase border border-amber-200 shadow-sm">Pendente Avaliação</span>`;
                else if (item.status === 'aguardandoDistribuicao') badgeTopo = `<span class="absolute top-3 right-3 bg-blue-100 text-blue-700 text-[9px] font-black px-2 py-0.5 rounded uppercase border border-blue-200 shadow-sm">Pendente Distribuição</span>`;
                else if (item.status === 'emAtendimento') badgeTopo = `<span class="absolute top-3 right-3 bg-purple-100 text-purple-700 text-[9px] font-black px-2 py-0.5 rounded uppercase border border-purple-200 shadow-sm">Em Minha Mesa</span>`;

                if (isCardAberto) {
                    const linkIndividual = `${baseUrl}?pautaId=${this.pautaId}&assistidoId=${item.id}&colab=${encodeURIComponent(this.colaboradorNome)}&token=${item.delegationToken || ''}`;
                    return `
                        <div class="border border-indigo-100 bg-white p-4 rounded-xl shadow-sm hover:shadow transition relative group">
                            ${badgeTopo}
                            <h3 class="font-black text-gray-800 text-sm w-3/4 truncate">${escapeHTML(item.name)}</h3>
                            <p class="text-xs text-gray-500 mt-1">${escapeHTML(item.subject || 'Assunto não informado')}</p>
                            ${numProcessoHtml}
                            ${notas}
                            ${bannerTransf}
                            <a href="${linkIndividual}" class="mt-3 block text-center w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold py-2.5 rounded-lg text-xs transition border border-indigo-200 group-hover:bg-indigo-600 group-hover:text-white uppercase tracking-wide">
                                🔍 Abrir Processo
                            </a>
                        </div>
                    `;
                } else {
                    const horaStr = item.attendedAt ? new Date(item.attendedAt).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : '';
                    return `
                        <div class="border border-green-200 bg-green-50 p-4 rounded-xl shadow-sm opacity-90">
                            <div class="flex justify-between items-start">
                                <h3 class="font-black text-green-900 text-sm truncate w-3/4">${escapeHTML(item.name)}</h3>
                                <span class="text-lg">✅</span>
                            </div>
                            <p class="text-xs text-green-700 mt-1">Concluído/Protocolado às ${horaStr}</p>
                            ${numProcessoHtml}
                        </div>
                    `;
                }
            };

            const container = document.getElementById('lista-dashboard-conteudo');
            const tabsDiv = document.getElementById('tabs-dashboard');

            if (isDefensor) {
                // LÓGICA DO PAINEL DO DEFENSOR
                const pendentes = todos.filter(a => (a.status === 'aguardandoDistribuicao' || a.status === 'aguardandoCorrecao') && a.defensorResponsavel === this.colaboradorNome);
                const finalizados = todos.filter(a => a.status === 'atendido' && a.attendedBy === this.colaboradorNome);

                tabsDiv.innerHTML = `
                    <button id="tab-pendentes" class="w-1/2 py-3 text-xs font-bold uppercase tracking-wider text-indigo-600 border-b-2 border-indigo-600 transition whitespace-nowrap">Aguardando Avaliação <span class="bg-indigo-100 text-indigo-700 ml-1 px-1.5 py-0.5 rounded-full text-[9px]">${pendentes.length}</span></button>
                    <button id="tab-assinados" class="w-1/2 py-3 text-xs font-bold uppercase tracking-wider text-gray-400 border-b-2 border-transparent hover:text-gray-600 transition whitespace-nowrap">Já Protocolados <span class="bg-gray-100 text-gray-500 ml-1 px-1.5 py-0.5 rounded-full text-[9px]">${finalizados.length}</span></button>
                `;

                const renderDefensorList = (lista, isAberto) => {
                    if (lista.length === 0) {
                        container.innerHTML = `<div class="text-center py-10 opacity-60"><span class="text-4xl mb-2 block">🙌</span><p class="text-sm font-bold text-gray-600">Sua mesa está limpa!</p></div>`;
                        return;
                    }
                    container.innerHTML = lista.map(item => desenharCard(item, isAberto)).join('');
                };

                const btnPend = document.getElementById('tab-pendentes');
                const btnAssi = document.getElementById('tab-assinados');

                btnPend.onclick = () => {
                    btnPend.className = "w-1/2 py-3 text-xs font-bold uppercase tracking-wider text-indigo-600 border-b-2 border-indigo-600 transition whitespace-nowrap";
                    btnAssi.className = "w-1/2 py-3 text-xs font-bold uppercase tracking-wider text-gray-400 border-b-2 border-transparent hover:text-gray-600 transition whitespace-nowrap";
                    renderDefensorList(pendentes, true);
                };
                btnAssi.onclick = () => {
                    btnAssi.className = "w-1/2 py-3 text-xs font-bold uppercase tracking-wider text-green-600 border-b-2 border-green-600 transition whitespace-nowrap";
                    btnPend.className = "w-1/2 py-3 text-xs font-bold uppercase tracking-wider text-gray-400 border-b-2 border-transparent hover:text-gray-600 transition whitespace-nowrap";
                    renderDefensorList(finalizados, false);
                };

                renderDefensorList(pendentes, true); // Abre minutas primeiro

            } else {
                // LÓGICA DO PAINEL DO SERVIDOR
                const emAndamento = todos.filter(a => a.status === 'emAtendimento' && a.assignedCollaborator?.name === this.colaboradorNome);
                const enviados = todos.filter(a => (a.status === 'aguardandoDistribuicao' || a.status === 'aguardandoCorrecao') && a.enviadoPor === this.colaboradorNome);
                const finalizados = todos.filter(a => a.status === 'atendido' && a.attendedBy === this.colaboradorNome);

                tabsDiv.innerHTML = `
                    <button id="tab-em-mesa" class="min-w-[33%] py-3 px-2 text-[11px] font-bold uppercase tracking-wider text-indigo-600 border-b-2 border-indigo-600 transition whitespace-nowrap">Em Mesa <span class="bg-indigo-100 text-indigo-700 px-1 rounded-full text-[9px]">${emAndamento.length}</span></button>
                    <button id="tab-enviados" class="min-w-[33%] py-3 px-2 text-[11px] font-bold uppercase tracking-wider text-gray-400 border-b-2 border-transparent hover:text-gray-600 transition whitespace-nowrap">No Defensor <span class="bg-gray-100 text-gray-500 px-1 rounded-full text-[9px]">${enviados.length}</span></button>
                    <button id="tab-finalizados" class="min-w-[33%] py-3 px-2 text-[11px] font-bold uppercase tracking-wider text-gray-400 border-b-2 border-transparent hover:text-gray-600 transition whitespace-nowrap">Concluídos <span class="bg-gray-100 text-gray-500 px-1 rounded-full text-[9px]">${finalizados.length}</span></button>
                `;

                const renderServidorList = (lista, isAberto, isEmptyAviso) => {
                    if (lista.length === 0) {
                        container.innerHTML = `<div class="text-center py-10 opacity-60"><span class="text-4xl mb-2 block">📭</span><p class="text-sm font-bold text-gray-600">${isEmptyAviso}</p></div>`;
                        return;
                    }
                    container.innerHTML = lista.map(item => desenharCard(item, isAberto)).join('');
                };

                const btnMesa = document.getElementById('tab-em-mesa');
                const btnEnv = document.getElementById('tab-enviados');
                const btnFin = document.getElementById('tab-finalizados');

                const resetTabs = () => {
                    [btnMesa, btnEnv, btnFin].forEach(b => b.className = "min-w-[33%] py-3 px-2 text-[11px] font-bold uppercase tracking-wider text-gray-400 border-b-2 border-transparent hover:text-gray-600 transition whitespace-nowrap");
                };

                btnMesa.onclick = () => {
                    resetTabs();
                    btnMesa.className = "min-w-[33%] py-3 px-2 text-[11px] font-bold uppercase tracking-wider text-indigo-600 border-b-2 border-indigo-600 transition whitespace-nowrap";
                    renderServidorList(emAndamento, true, "Nenhum caso na sua mesa no momento.");
                };
                btnEnv.onclick = () => {
                    resetTabs();
                    btnEnv.className = "min-w-[33%] py-3 px-2 text-[11px] font-bold uppercase tracking-wider text-blue-600 border-b-2 border-blue-600 transition whitespace-nowrap";
                    // Os casos enviados podem ser abertos pelo servidor caso ele queira rever ou puxar de volta (já que ele é o enviadoPor e tem o token)
                    renderServidorList(enviados, true, "Nenhum caso seu aguardando o Defensor.");
                };
                btnFin.onclick = () => {
                    resetTabs();
                    btnFin.className = "min-w-[33%] py-3 px-2 text-[11px] font-bold uppercase tracking-wider text-green-600 border-b-2 border-green-600 transition whitespace-nowrap";
                    renderServidorList(finalizados, false, "Você ainda não finalizou atendimentos hoje.");
                };

                renderServidorList(emAndamento, true, "Nenhum caso na sua mesa no momento.");
            }

        } catch (error) {
            document.getElementById('lista-dashboard-conteudo').innerHTML = `<p class="text-red-500 text-sm text-center">Erro ao carregar processos. Tente atualizar a página.</p>`;
        }
    },

    showError(titulo, mensagem) {
        const corpo = document.querySelector('.w-full.max-w-2xl');
        if (corpo) {
            corpo.innerHTML = `
                <div class="bg-red-600 p-5 rounded-t-2xl shadow flex items-center gap-4">
                    <div class="bg-white p-1 rounded-lg shadow-sm flex-shrink-0">
                        <img src="https://raw.githubusercontent.com/alexdovale/ac-o-paula-controle/main/imagem.png" alt="Logo do Sistema" class="h-10 w-auto object-contain">
                    </div>
                    <div>
                        <h1 class="text-white font-black text-xl uppercase tracking-wide">ERRO!</h1>
                    </div>
                </div>
                <div class="p-8 text-center bg-white rounded-b-2xl shadow">
                    <span class="text-5xl block mb-4">❌</span>
                    <h2 class="text-xl font-bold text-gray-800">${titulo}</h2>
                    <p class="text-gray-600 mt-2 font-medium">${mensagem}</p>
                </div>
            `;
        }
    }
};
