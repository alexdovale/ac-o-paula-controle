// js/atendimentoExternoService.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc, collection, getDocs, query } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { firebaseConfig } from './config.js';
import { documentsData } from './detalhes.js'; 
import { PDFService } from './pdfService.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// URL da Logo em formato RAW do GitHub
const LOGO_URL = "https://raw.githubusercontent.com/alexdovale/ac-o-paula-controle/main/imagem.png";

export const AtendimentoExternoService = {
    pautaId: null,
    assistidoId: null,
    colaboradorNome: null,
    fluxoSelecionado: null,
    assistidoData: null, 
    todosColaboradores: [],
    colaboradorAtual: null,

    async init() {
        const urlParams = new URLSearchParams(window.location.search);
        this.pautaId = urlParams.get('pautaId');
        this.assistidoId = urlParams.get('assistidoId'); 
        const tokenRecebido = urlParams.get('token');
        this.colaboradorNome = urlParams.get('colab') || "Colaborador";

        if (!this.pautaId || !this.colaboradorNome) {
            this.showError("Link Incompleto", "Faltam parâmetros na URL.");
            return;
        }

        try {
            await signInAnonymously(auth);
            await this.carregarColaboradoresGerais();

            // Agora QUALQUER colaborador tem seu próprio painel (não apenas o Defensor)
            if (!this.assistidoId) {
                this.renderizarDashboard();
                return;
            }

            if (!tokenRecebido) {
                this.showError("Acesso Negado", "Falta o token de segurança.");
                return;
            }

            const pautaRef = doc(db, "pautas", this.pautaId);
            const pautaSnap = await getDoc(pautaRef);
            const pautaData = pautaSnap.data();

            const docRef = doc(db, "pautas", this.pautaId, "attendances", this.assistidoId);
            const docSnap = await getDoc(docRef);

            if (!docSnap.exists()) {
                this.showError("Não encontrado", "Assistido não existe.");
                return;
            }

            const assistido = docSnap.data();
            this.assistidoData = assistido;

            if (assistido.delegationToken !== tokenRecebido) {
                this.showError("Acesso Negado", "Token inválido.");
                return;
            }

            if (assistido.status === 'atendido') {
                this.showError("Atendimento Concluído", "Atendimento já finalizado.");
                return;
            }

            this.renderizarInterface(assistido, pautaData);
            this.setupListeners();

        } catch (error) {
            console.error("Erro no init:", error);
            this.showError("Erro", "Falha de conexão. Tente novamente.");
        }
    },

    async carregarColaboradoresGerais() {
        try {
            const snap = await getDocs(collection(db, "pautas", this.pautaId, "collaborators"));
            this.todosColaboradores = snap.docs.map(d => d.data());
            this.colaboradorAtual = this.todosColaboradores.find(c => c.nome === this.colaboradorNome);
        } catch (e) { this.todosColaboradores = []; }
    },

    renderizarInterface(assistido, pautaData) {
        // ==== INJEÇÃO DINÂMICA DA LOGO NO CABEÇALHO ====
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
            logoDiv.innerHTML = `<img src="${LOGO_URL}" alt="Logo do Sistema" class="h-10 w-auto object-contain">`;
            
            headerBg.appendChild(logoDiv);
            headerBg.appendChild(textosWrapper);
        }

        document.getElementById('assistido-nome').textContent = assistido.name || '';
        document.getElementById('assistido-assunto').textContent = assistido.subject || '';
        
        const areaColab = document.getElementById('area-colaborador');
        if (areaColab) {
            areaColab.classList.remove('hidden');

            // ==== BANNER DE TRANSFERÊNCIA ====
            // Exibe o aviso se o atendimento foi transferido de um colega para o atual
            if (assistido.historicoTransferencia && !document.getElementById('banner-transferencia')) {
                const bannerHtml = `
                    <div id="banner-transferencia" class="w-full bg-orange-50 border border-orange-200 text-orange-800 px-4 py-3 rounded-xl shadow-sm mb-6 text-xs font-medium flex items-center gap-3">
                        <span class="text-lg">🔄</span>
                        <span>${assistido.historicoTransferencia}</span>
                    </div>
                `;
                areaColab.insertAdjacentHTML('afterbegin', bannerHtml);
            }
        }

        // INJEÇÃO DINÂMICA DA ABA "MEU PAINEL" PARA TODOS OS COLABORADORES
        const tabsContainer = document.getElementById('tab-btn-encerramento')?.parentElement;
        if (tabsContainer && !document.getElementById('tab-btn-painel')) {
            tabsContainer.insertAdjacentHTML('beforeend', `<button id="tab-btn-painel" class="flex-1 p-3 text-[10px] uppercase text-gray-400 font-bold border-b-2 border-transparent transition-colors">Meu Painel</button>`);
            
            document.getElementById('tab-btn-painel').addEventListener('click', () => {
                this.switchTab('painel');
                this.renderizarDashboardNaAba();
            });
        }

        const abaHistorico = document.getElementById('aba-historico');
        if (abaHistorico && !document.getElementById('aba-painel')) {
            abaHistorico.insertAdjacentHTML('afterend', `<div id="aba-painel" class="hidden"></div>`);
        }

        this.renderizarHistorico(assistido);
        this.renderizarAbaEncerramentoDinamica(assistido, pautaData);
    },

    renderizarAbaEncerramentoDinamica(assistido, pautaData) {
        const aba = document.getElementById('aba-encerramento');
        if (!aba) return;

        const isDefensor = this.colaboradorAtual?.cargo?.toLowerCase().includes('defensor');
        const showDistribuicao = pautaData.useDistributionFlow && !isDefensor;

        let optionsHtml = `
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                <button id="btn-opt-direto" class="fluxo-opt-btn ring-4 ring-blue-400 bg-blue-50 border-blue-200 p-4 rounded-xl text-left transition-all">
                    <span class="block text-lg mb-1">✅</span>
                    <span class="block font-bold text-gray-800">Finalizar Atendimento</span>
                </button>
        `;

        if (showDistribuicao) {
            optionsHtml += `
                <button id="btn-opt-dist" class="fluxo-opt-btn border-2 border-gray-200 p-4 rounded-xl text-left transition-all hover:bg-gray-50">
                    <span class="block text-lg mb-1">⚖️</span>
                    <span class="block font-bold text-gray-800">Fila de Distribuição</span>
                </button>
            `;
        }

        optionsHtml += `
                <button id="btn-opt-transferir" class="fluxo-opt-btn border-2 border-gray-200 p-4 rounded-xl text-left transition-all hover:bg-gray-50">
                    <span class="block text-lg mb-1">🔄</span>
                    <span class="block font-bold text-gray-800">Transferir Colega</span>
                </button>
                
                <button id="btn-opt-pausar" class="fluxo-opt-btn border-2 border-gray-200 p-4 rounded-xl text-left transition-all hover:bg-gray-50">
                    <span class="block text-lg mb-1">⏸️</span>
                    <span class="block font-bold text-gray-800">Pausar p/ Fila</span>
                </button>
            </div>

            <div id="config-distribuicao" class="hidden bg-gray-50 p-4 rounded-xl border border-gray-200 mb-6">
                <label class="block text-xs font-bold text-gray-500 uppercase mb-2">Defensor(a) Responsável</label>
                <select id="select-defensor-dinamico" class="w-full p-3 border border-gray-300 rounded-lg text-sm bg-white mb-3"><option value="">-- Selecione --</option></select>
                <label class="block text-xs font-bold text-gray-500 uppercase mb-2">Notas (Opcional)</label>
                <textarea id="notas-distribuicao-dinamico" rows="2" class="w-full p-3 border border-gray-300 rounded-lg text-sm bg-white"></textarea>
            </div>

            <div id="config-transferencia" class="hidden bg-orange-50 p-4 rounded-xl border border-orange-200 mb-6">
                <label class="block text-xs font-bold text-orange-700 uppercase mb-2">Transferir para:</label>
                <select id="select-transferir-colega" class="w-full p-3 border border-orange-300 rounded-lg text-sm bg-white mb-3"><option value="">-- Selecione --</option></select>
            </div>

            <button id="btn-finalizar-dinamico" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl shadow-md transition-colors text-sm uppercase">
                Confirmar e Seguir
            </button>
        `;

        aba.innerHTML = optionsHtml;
        this.povoarSelectsDinamicos();

        this.fluxoSelecionado = 'direto';
        const btnDireto = document.getElementById('btn-opt-direto');
        const btnDist = document.getElementById('btn-opt-dist');
        const btnTransf = document.getElementById('btn-opt-transferir');
        const btnPausar = document.getElementById('btn-opt-pausar');
        const configDist = document.getElementById('config-distribuicao');
        const configTransf = document.getElementById('config-transferencia');

        const todos = [btnDireto, btnDist, btnTransf, btnPausar].filter(Boolean);

        const setAtivo = (btn, fluxo) => {
            this.fluxoSelecionado = fluxo;
            todos.forEach(b => { b.className = "fluxo-opt-btn border-2 border-gray-200 p-4 rounded-xl text-left transition-all hover:bg-gray-50"; });
            btn.className = "fluxo-opt-btn ring-4 ring-blue-400 bg-blue-50 border-blue-200 p-4 rounded-xl text-left transition-all";
            configDist.classList.toggle('hidden', fluxo !== 'distribuicao');
            configTransf.classList.toggle('hidden', fluxo !== 'transferir');
        };

        if(btnDireto) btnDireto.onclick = () => setAtivo(btnDireto, 'direto');
        if(btnDist) btnDist.onclick = () => setAtivo(btnDist, 'distribuicao');
        if(btnTransf) btnTransf.onclick = () => setAtivo(btnTransf, 'transferir');
        if(btnPausar) btnPausar.onclick = () => setAtivo(btnPausar, 'pausar');

        document.getElementById('btn-finalizar-dinamico').onclick = () => this.finalizarProcesso();
    },

    povoarSelectsDinamicos() {
        const selectDef = document.getElementById('select-defensor-dinamico');
        const selectColab = document.getElementById('select-transferir-colega');

        if (selectDef) {
            this.todosColaboradores.filter(c => c.cargo?.toLowerCase().includes('defensor')).forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.nome; opt.textContent = c.nome;
                selectDef.appendChild(opt);
            });
        }
        if (selectColab) {
            this.todosColaboradores.filter(c => c.nome !== this.colaboradorNome).forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.nome; opt.textContent = c.nome;
                selectColab.appendChild(opt);
            });
        }
    },

    async finalizarProcesso() {
        if (!this.fluxoSelecionado) return;

        const btnFinalizar = document.getElementById('btn-finalizar-dinamico');
        btnFinalizar.disabled = true;
        btnFinalizar.textContent = "Salvando...";

        let updateData = {};
        let tSuc = "Atualizado!", subSuc = "Pode fechar a aba.";

        if (this.fluxoSelecionado === 'direto') {
            updateData = { status: 'atendido', attendedAt: new Date().toISOString(), attendedBy: this.colaboradorNome, distributionStatus: 'completed' };
            tSuc = "Atendimento Concluído!";
        } else if (this.fluxoSelecionado === 'distribuicao') {
            const def = document.getElementById('select-defensor-dinamico')?.value;
            if (!def) { alert("Selecione o Defensor!"); btnFinalizar.disabled = false; btnFinalizar.textContent = "Confirmar"; return; }
            updateData = { status: 'aguardandoDistribuicao', distributionStatus: 'pending', defensorResponsavel: def };
            tSuc = "Enviado para Assinatura!";
        } else if (this.fluxoSelecionado === 'transferir') {
            const col = document.getElementById('select-transferir-colega')?.value;
            if (!col) { alert("Selecione o Colega!"); btnFinalizar.disabled = false; btnFinalizar.textContent = "Confirmar"; return; }
            
            const emailDest = this.todosColaboradores.find(c => c.nome === col)?.email || null;
            const tk = Date.now().toString(36) + Math.random().toString(36).substring(2);
            updateData = { 
                status: 'emAtendimento', 
                assignedCollaborator: { name: col, email: emailDest }, 
                inAttendanceTime: new Date().toISOString(),
                delegationToken: tk,
                historicoTransferencia: `Transferido por ${this.colaboradorNome} para ${col}.`
            };
            tSuc = "Transferência Realizada!";
            
            if (emailDest) {
                try {
                    const { EmailService } = await import('./emailService.js');
                    await EmailService.sendDelegationEmail(emailDest, col, this.assistidoData?.name, this.colaboradorNome, this.pautaId, this.assistidoId, tk);
                } catch(e){}
            }
        } else if (this.fluxoSelecionado === 'pausar') {
            updateData = { status: 'aguardando', assignedCollaborator: null };
            tSuc = "Pausado e Devolvido!";
        }

        try {
            await signInAnonymously(auth);
            await updateDoc(doc(db, "pautas", this.pautaId, "attendances", this.assistidoId), updateData);
            
            // O botão voltar aponta para o Painel, seja você Defensor ou Servidor
            const dashboardUrl = `${window.location.href.split('?')[0]}?pautaId=${this.pautaId}&colab=${encodeURIComponent(this.colaboradorNome)}`;
            const botoesRetorno = `<a href="${dashboardUrl}" class="mt-6 inline-block text-sm text-green-700 underline font-bold">⬅️ Voltar ao Meu Painel</a>`;

            document.getElementById('aba-encerramento').innerHTML = `
                <div class="text-center p-8 bg-green-50 rounded-xl border border-green-200 shadow-sm mt-4">
                    <span class="text-5xl">✅</span>
                    <h2 class="text-2xl font-bold text-green-800 mt-4">${tSuc}</h2>
                    <p class="text-green-600 mt-2 font-medium">${subSuc}</p>
                    ${botoesRetorno}
                </div>
            `;
            
            const headerBg = document.getElementById('header-bg');
            if (headerBg) {
                headerBg.classList.remove('bg-blue-600', 'bg-indigo-600', 'bg-blue-500');
                headerBg.classList.add('bg-green-600', 'transition-colors');
            }

        } catch (error) {
            console.error("Erro ao salvar:", error);
            alert("Erro ao salvar. Verifique a internet e tente novamente.");
            btnFinalizar.disabled = false;
            btnFinalizar.textContent = "Confirmar e Seguir";
        }
    },

    renderizarHistorico(assistido) {
        const lista = document.getElementById('lista-historico');
        if (!lista) return;

        if (!assistido.documentChecklist || !assistido.documentChecklist.action) {
            lista.innerHTML = `<div class="text-center py-8">📭 Sem checklist</div>`;
            return;
        }

        const chk = assistido.documentChecklist;
        const actionData = (documentsData || window.documentsData || {})[chk.action];
        const actionTitle = actionData ? actionData.title : chk.action;
        
        let html = `<div class="bg-blue-50 p-4 rounded-xl mb-4 border border-blue-100 shadow-sm"><p class="text-[10px] text-blue-500 font-bold uppercase mb-1">Ação:</p><p class="text-sm font-black text-blue-800 uppercase">${actionTitle}</p></div>`;

        if (chk.checkedIds && chk.checkedIds.length > 0) {
            html += `<h4 class="text-[10px] font-bold text-gray-400 uppercase mb-3">Documentos</h4><ul class="space-y-2 mb-6">`;
            chk.checkedIds.forEach(id => {
                if (id.startsWith('reu-') || id.startsWith('gasto-')) return;
                let docName = id.replace(/-/g, ' ').toUpperCase();
                if (actionData && id.startsWith('doc-')) {
                    const parts = id.split('-');
                    const dIdx = parseInt(parts.pop()); const sIdx = parseInt(parts.pop());
                    if (actionData.sections[sIdx]?.docs[dIdx]) {
                        const docObj = actionData.sections[sIdx].docs[dIdx];
                        docName = typeof docObj === 'string' ? docObj : docObj.text;
                    }
                }
                const tipo = chk.docTypes && chk.docTypes[id] ? chk.docTypes[id] : 'Físico';
                html += `<li class="text-xs bg-white border p-3 rounded-lg flex justify-between shadow-sm"><span class="font-semibold text-gray-700 pr-2">📄 ${docName}</span><span class="font-bold text-[9px] uppercase border px-2 py-1 rounded ${tipo==='Físico'?'text-amber-600 bg-amber-50':'text-emerald-600 bg-emerald-50'}">${tipo}</span></li>`;
            });
            html += `</ul>`;
        }

        if (chk.reuData && chk.reuData.checkReuUnico) {
            html += `<div class="bg-red-50 p-4 rounded-xl mb-6 shadow-sm"><h4 class="text-[10px] font-black text-red-700 uppercase mb-2">👤 Parte Contrária</h4><p class="text-xs text-gray-700">${chk.reuData.nome || ''} - ${chk.reuData.cidade || ''}</p></div>`;
        }

        if (chk.expenseData && chk.expenseData.checkExibirGastos) {
            const gastos = chk.expenseData;
            let temGasto = false; let totalGastos = 0;
            let gastosHtml = `<div class="bg-green-50 p-4 rounded-xl mb-4 shadow-sm"><h4 class="text-[10px] font-black text-green-800 uppercase mb-2">💰 Planilha de Gastos</h4><table class="w-full text-xs text-left mb-3">`;

            ['moradia','alimentacao','educacao','saude','vestuario','lazer','outras'].forEach(cat => {
                if (gastos[cat] && String(gastos[cat]).trim() !== '' && gastos[cat] !== 'R$ 0,00') {
                    temGasto = true;
                    totalGastos += parseFloat(gastos[cat].replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
                    gastosHtml += `<tr class="border-b border-green-100"><td class="py-2 text-gray-600">${cat}</td><td class="py-2 font-bold text-green-700 text-right">${gastos[cat]}</td></tr>`;
                }
            });

            if (temGasto) {
                gastosHtml += `<tr class="border-t-2 border-green-200"><td class="py-2 font-black text-green-900">TOTAL</td><td class="py-2 font-black text-green-900 text-right text-sm">${totalGastos.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td></tr></table><button id="btn-baixar-planilha" class="mt-2 w-full bg-white border border-green-400 text-green-700 font-bold py-2.5 rounded-lg shadow-sm text-xs">📄 Baixar Planilha PDF</button></div>`;
                html += gastosHtml;
            }
        }
        lista.innerHTML = html;
    },

    switchTab(tab) {
        const btnEnc = document.getElementById('tab-btn-encerramento');
        const btnHist = document.getElementById('tab-btn-historico');
        const btnPainel = document.getElementById('tab-btn-painel');

        if(btnEnc) btnEnc.className = tab==='encerramento' ? "flex-1 p-3 text-[10px] uppercase font-bold text-blue-600 border-b-2 border-blue-600 transition-colors" : "flex-1 p-3 text-[10px] uppercase font-bold text-gray-400 border-b-2 border-transparent transition-colors";
        if(btnHist) btnHist.className = tab==='historico' ? "flex-1 p-3 text-[10px] uppercase font-bold text-green-600 border-b-2 border-green-600 transition-colors" : "flex-1 p-3 text-[10px] uppercase font-bold text-gray-400 border-b-2 border-transparent transition-colors";
        if(btnPainel) btnPainel.className = tab==='painel' ? "flex-1 p-3 text-[10px] uppercase font-bold text-indigo-600 border-b-2 border-indigo-600 transition-colors" : "flex-1 p-3 text-[10px] uppercase font-bold text-gray-400 border-b-2 border-transparent transition-colors";

        const abaEnc = document.getElementById('aba-encerramento');
        const abaHist = document.getElementById('aba-historico');
        const abaPainel = document.getElementById('aba-painel');

        if(abaEnc) abaEnc.classList.toggle('hidden', tab !== 'encerramento');
        if(abaHist) abaHist.classList.toggle('hidden', tab !== 'historico');
        if(abaPainel) abaPainel.classList.toggle('hidden', tab !== 'painel');
    },

    setupListeners() {
        document.getElementById('tab-btn-encerramento')?.addEventListener('click', () => this.switchTab('encerramento'));
        document.getElementById('tab-btn-historico')?.addEventListener('click', () => this.switchTab('historico'));

        setTimeout(() => {
            const btnBaixarPlanilha = document.getElementById('btn-baixar-planilha');
            if (btnBaixarPlanilha && this.assistidoData?.documentChecklist?.expenseData) {
                btnBaixarPlanilha.onclick = async () => {
                    btnBaixarPlanilha.textContent = "⏳ Gerando PDF...";
                    await PDFService.generatePlanilhaGastosPDF(this.assistidoData.name || 'Assistido', this.assistidoData.documentChecklist.expenseData);
                    btnBaixarPlanilha.textContent = "📄 Baixar Planilha PDF";
                };
            }
        }, 500);
    },

    async renderizarDashboardNaAba() {
        const abaPainel = document.getElementById('aba-painel');
        if (!abaPainel) return;

        const isDefensor = this.colaboradorAtual?.cargo?.toLowerCase().includes('defensor');
        const painelTitulo = isDefensor ? "💼 Meu Painel Judicial" : "💼 Meu Painel";
        const tabPendenteTexto = isDefensor ? "Pendentes" : "Meus Casos";
        const tabFinalizadoTexto = isDefensor ? "Protocolados" : "Finalizados";

        abaPainel.innerHTML = `
            <div class="bg-indigo-600 p-4 rounded-xl shadow flex items-center justify-between mb-4 mt-2">
                <div class="flex items-center gap-3">
                    <img src="${LOGO_URL}" alt="Logo" class="w-10 h-10 object-contain bg-white rounded-full p-1 shadow-sm">
                    <div>
                        <h1 class="text-white font-black text-sm uppercase">${painelTitulo}</h1>
                        <p class="text-indigo-200 text-[10px] mt-1">${this.colaboradorNome}</p>
                    </div>
                </div>
            </div>
            <div class="bg-white rounded-xl min-h-[300px] border border-gray-200">
                <div class="flex border-b border-gray-200 mb-4">
                    <button id="tab-painel-pendentes-aba" class="w-1/2 py-2 text-xs font-bold uppercase text-indigo-600 border-b-2 border-indigo-600 transition-colors">${tabPendenteTexto}</button>
                    <button id="tab-painel-assinados-aba" class="w-1/2 py-2 text-xs font-bold uppercase text-gray-400 border-b-2 border-transparent transition-colors">${tabFinalizadoTexto}</button>
                </div>
                <div id="lista-painel-conteudo-aba" class="space-y-3 p-3"><p class="text-center text-gray-400 text-xs">Carregando...</p></div>
            </div>`;

        try {
            const snap = await getDocs(query(collection(db, "pautas", this.pautaId, "attendances")));
            const todos = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            const pendentes = todos.filter(a => {
                if (isDefensor) return a.status === 'aguardandoDistribuicao' && a.defensorResponsavel === this.colaboradorNome;
                return a.status === 'emAtendimento' && a.assignedCollaborator?.name === this.colaboradorNome;
            });
            
            const assinados = todos.filter(a => {
                if (isDefensor) return a.status === 'atendido' && a.attendedBy === this.colaboradorNome;
                return ['atendido', 'aguardandoDistribuicao'].includes(a.status) && (a.attendedBy === this.colaboradorNome || a.lastActionBy === this.colaboradorNome);
            });

            const btnAcaoTexto = isDefensor ? "🔍 Abrir e Assinar" : "🔍 Abrir Atendimento";
            const txtConcluido = isDefensor ? "✅ Protocolado" : "✅ Finalizado";

            const renderLista = (lista, ehPendente) => {
                const container = document.getElementById('lista-painel-conteudo-aba');
                if (lista.length === 0) { container.innerHTML = `<div class="text-center py-6 opacity-60"><p class="text-xs font-bold text-gray-600">Sua mesa está limpa!</p></div>`; return; }

                let html = '';
                lista.forEach(item => {
                    if (ehPendente) {
                        const linkIndividual = `${window.location.href.split('?')[0]}?pautaId=${this.pautaId}&assistidoId=${item.id}&colab=${encodeURIComponent(this.colaboradorNome)}&token=${item.delegationToken}`;
                        html += `<div class="border border-indigo-100 bg-white p-3 rounded-xl shadow-sm mb-2"><h3 class="font-black text-gray-800 text-xs truncate">${item.name}</h3><a href="${linkIndividual}" class="mt-2 block text-center bg-indigo-50 text-indigo-700 font-bold py-1.5 rounded-lg text-[10px]">${btnAcaoTexto}</a></div>`;
                    } else {
                        html += `<div class="border border-green-100 bg-green-50 p-3 rounded-xl shadow-sm opacity-80 mb-2"><h3 class="font-black text-green-900 text-xs truncate">${item.name}</h3><p class="text-[9px] text-green-700 mt-1">${txtConcluido}</p></div>`;
                    }
                });
                container.innerHTML = html;
            };

            document.getElementById('tab-painel-pendentes-aba').onclick = (e) => { e.target.className="w-1/2 py-2 text-xs font-bold uppercase text-indigo-600 border-b-2 border-indigo-600 transition-colors"; document.getElementById('tab-painel-assinados-aba').className="w-1/2 py-2 text-xs font-bold uppercase text-gray-400 border-b-2 border-transparent transition-colors"; renderLista(pendentes, true); };
            document.getElementById('tab-painel-assinados-aba').onclick = (e) => { e.target.className="w-1/2 py-2 text-xs font-bold uppercase text-green-600 border-b-2 border-green-600 transition-colors"; document.getElementById('tab-painel-pendentes-aba').className="w-1/2 py-2 text-xs font-bold uppercase text-gray-400 border-b-2 border-transparent transition-colors"; renderLista(assinados, false); };
            renderLista(pendentes, true);

        } catch (error) { document.getElementById('lista-painel-conteudo-aba').innerHTML = `<p class="text-red-500 text-center text-xs">Erro ao carregar processos.</p>`; }
    },

    async renderizarDashboard() {
        const isDefensor = this.colaboradorAtual?.cargo?.toLowerCase().includes('defensor');
        const painelTitulo = isDefensor ? "💼 Meu Painel Judicial" : "💼 Meu Painel";
        const tabPendenteTexto = isDefensor ? "Pendentes" : "Meus Casos";
        const tabFinalizadoTexto = isDefensor ? "Protocolados" : "Finalizados";

        document.getElementById('assistido-nome').innerHTML = `${painelTitulo}<br><span class="text-sm font-normal">${this.colaboradorNome}</span>`;
        document.getElementById('assistido-assunto').classList.add('hidden');

        document.querySelector('.w-full.max-w-2xl').innerHTML = `
            <div id="header-bg" class="bg-indigo-600 p-5 rounded-t-2xl shadow flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <img src="${LOGO_URL}" alt="Logo" class="w-14 h-14 object-contain bg-white rounded-full p-1.5 shadow-md">
                    <div>
                        <h1 class="text-white font-black text-xl uppercase">${painelTitulo}</h1>
                        <p class="text-indigo-200 text-xs mt-1">Bem-vindo(a), ${this.colaboradorNome}</p>
                    </div>
                </div>
            </div>
            <div class="bg-white p-4 rounded-b-2xl shadow min-h-[400px]">
                <div class="flex border-b border-gray-200 mb-4">
                    <button id="tab-pendentes" class="w-1/2 py-3 text-xs font-bold uppercase text-indigo-600 border-b-2 border-indigo-600 transition-colors">${tabPendenteTexto}</button>
                    <button id="tab-assinados" class="w-1/2 py-3 text-xs font-bold uppercase text-gray-400 border-b-2 border-transparent transition-colors">${tabFinalizadoTexto}</button>
                </div>
                <div id="lista-dashboard-conteudo" class="space-y-3"><p class="text-center text-gray-400">Carregando...</p></div>
            </div>`;

        try {
            const snap = await getDocs(query(collection(db, "pautas", this.pautaId, "attendances")));
            const todos = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            const pendentes = todos.filter(a => {
                if (isDefensor) return a.status === 'aguardandoDistribuicao' && a.defensorResponsavel === this.colaboradorNome;
                return a.status === 'emAtendimento' && a.assignedCollaborator?.name === this.colaboradorNome;
            });
            
            const assinados = todos.filter(a => {
                if (isDefensor) return a.status === 'atendido' && a.attendedBy === this.colaboradorNome;
                return ['atendido', 'aguardandoDistribuicao'].includes(a.status) && (a.attendedBy === this.colaboradorNome || a.lastActionBy === this.colaboradorNome);
            });

            const btnAcaoTexto = isDefensor ? "🔍 Abrir e Assinar" : "🔍 Abrir Atendimento";
            const txtConcluido = isDefensor ? "✅ Protocolado" : "✅ Finalizado";

            const renderLista = (lista, ehPendente) => {
                const container = document.getElementById('lista-dashboard-conteudo');
                if (lista.length === 0) { container.innerHTML = `<div class="text-center py-10 opacity-60"><p class="text-sm font-bold text-gray-600">Sua mesa está limpa!</p></div>`; return; }

                let html = '';
                lista.forEach(item => {
                    if (ehPendente) {
                        const linkIndividual = `${window.location.href.split('?')[0]}?pautaId=${this.pautaId}&assistidoId=${item.id}&colab=${encodeURIComponent(this.colaboradorNome)}&token=${item.delegationToken}`;
                        html += `<div class="border border-indigo-100 bg-white p-4 rounded-xl shadow-sm"><h3 class="font-black text-gray-800 text-sm truncate">${item.name}</h3><a href="${linkIndividual}" class="mt-3 block text-center bg-indigo-50 text-indigo-700 font-bold py-2 rounded-lg text-xs">${btnAcaoTexto}</a></div>`;
                    } else {
                        html += `<div class="border border-green-100 bg-green-50 p-4 rounded-xl shadow-sm opacity-80"><h3 class="font-black text-green-900 text-sm truncate">${item.name}</h3><p class="text-xs text-green-700 mt-1">${txtConcluido}</p></div>`;
                    }
                });
                container.innerHTML = html;
            };

            document.getElementById('tab-pendentes').onclick = (e) => { e.target.className="w-1/2 py-3 text-xs font-bold uppercase text-indigo-600 border-b-2 border-indigo-600 transition-colors"; document.getElementById('tab-assinados').className="w-1/2 py-3 text-xs font-bold uppercase text-gray-400 border-b-2 border-transparent transition-colors"; renderLista(pendentes, true); };
            document.getElementById('tab-assinados').onclick = (e) => { e.target.className="w-1/2 py-3 text-xs font-bold uppercase text-green-600 border-b-2 border-green-600 transition-colors"; document.getElementById('tab-pendentes').className="w-1/2 py-3 text-xs font-bold uppercase text-gray-400 border-b-2 border-transparent transition-colors"; renderLista(assinados, false); };
            renderLista(pendentes, true);

        } catch (error) { document.getElementById('lista-dashboard-conteudo').innerHTML = `<p class="text-red-500 text-center">Erro ao carregar processos.</p>`; }
    },

    showError(titulo, mensagem) {
        document.querySelector('.w-full.max-w-2xl').innerHTML = `
            <div class="bg-red-600 p-5 rounded-t-2xl shadow flex items-center gap-4">
                <div class="bg-white p-1 rounded-lg shadow-sm flex-shrink-0">
                    <img src="${LOGO_URL}" alt="Logo do Sistema" class="h-10 w-auto object-contain">
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
};
