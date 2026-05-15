// js/atendimentoExternoService.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc, collection, getDocs, query, where, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { firebaseConfig } from './config.js';
import { documentsData } from './detalhes.js'; 
import { PDFService } from './pdfService.js';

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
        console.log("⚡ Atendimento Externo inicializado (Dashboard + Transferências + Defensor Automático)");

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

            // MODO DASHBOARD DO DEFENSOR (Se não tiver assistidoId específico)
            if (!this.assistidoId) {
                this.renderizarDashboardDefensor();
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

    // ==========================================
    // CARREGAMENTO DE COLABORADORES
    // ==========================================
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

    // ==========================================
    // RENDERIZAÇÃO DA TELA DE ATENDIMENTO
    // ==========================================
    renderizarInterface(assistido, pautaData) {
        document.getElementById('assistido-nome').textContent = assistido.name || 'Nome não informado';
        document.getElementById('assistido-assunto').textContent = assistido.subject || 'Assunto não informado';
        
        document.getElementById('area-colaborador').classList.remove('hidden');

        this.renderizarHistorico(assistido);
        this.renderizarAbaEncerramentoDinamica(assistido, pautaData);
    },

    // INJETA OS BOTÕES DE FORMA DINÂMICA
    renderizarAbaEncerramentoDinamica(assistido, pautaData) {
        const aba = document.getElementById('aba-encerramento');
        if (!aba) return;

        // Regra de Negócio: Se a pessoa logada tiver "Defensor" no cargo, ocultamos a Distribuição.
        const isDefensor = this.colaboradorAtual?.cargo?.toLowerCase().includes('defensor');
        const showDistribuicao = pautaData.useDistributionFlow && !isDefensor;

        let optionsHtml = `
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                <button id="btn-opt-direto" class="fluxo-opt-btn ring-4 ring-blue-400 bg-blue-50 border-blue-200 p-4 rounded-xl text-left transition-all">
                    <span class="block text-lg mb-1">✅</span>
                    <span class="block font-bold text-gray-800">Finalizar Atendimento</span>
                    <span class="block text-xs text-gray-500 mt-1">Concluir e dar baixa na pauta.</span>
                </button>
        `;

        if (showDistribuicao) {
            optionsHtml += `
                <button id="btn-opt-dist" class="fluxo-opt-btn border-2 border-gray-200 p-4 rounded-xl text-left transition-all hover:bg-gray-50">
                    <span class="block text-lg mb-1">⚖️</span>
                    <span class="block font-bold text-gray-800">Fila de Distribuição</span>
                    <span class="block text-xs text-gray-500 mt-1">Enviar para Defensor(a) assinar.</span>
                </button>
            `;
        }

        optionsHtml += `
                <button id="btn-opt-transferir" class="fluxo-opt-btn border-2 border-gray-200 p-4 rounded-xl text-left transition-all hover:bg-gray-50">
                    <span class="block text-lg mb-1">🔄</span>
                    <span class="block font-bold text-gray-800">Transferir Colega</span>
                    <span class="block text-xs text-gray-500 mt-1">Passar a vez para outro membro.</span>
                </button>
                
                <button id="btn-opt-pausar" class="fluxo-opt-btn border-2 border-gray-200 p-4 rounded-xl text-left transition-all hover:bg-gray-50">
                    <span class="block text-lg mb-1">⏸️</span>
                    <span class="block font-bold text-gray-800">Pausar / Voltar p/ Fila</span>
                    <span class="block text-xs text-gray-500 mt-1">Devolver para os "Aguardando".</span>
                </button>
            </div>
        `;

        // Divulgação de Configurações Extra que ficam ocultas até clicar
        optionsHtml += `
            <div id="config-distribuicao" class="hidden bg-gray-50 p-4 rounded-xl border border-gray-200 mb-6">
                <label class="block text-xs font-bold text-gray-500 uppercase mb-2">Defensor(a) Responsável</label>
                <select id="select-defensor-dinamico" class="w-full p-3 border border-gray-300 rounded-lg text-sm bg-white mb-3">
                    <option value="">-- Selecione o Defensor --</option>
                </select>
                <label class="block text-xs font-bold text-gray-500 uppercase mb-2">Notas da Revisão (Opcional)</label>
                <textarea id="notas-distribuicao-dinamico" rows="2" class="w-full p-3 border border-gray-300 rounded-lg text-sm bg-white" placeholder="Ex: Falta assinar a página 2..."></textarea>
            </div>

            <div id="config-transferencia" class="hidden bg-orange-50 p-4 rounded-xl border border-orange-200 mb-6">
                <label class="block text-xs font-bold text-orange-700 uppercase mb-2">Transferir para qual colega?</label>
                <select id="select-transferir-colega" class="w-full p-3 border border-orange-300 rounded-lg text-sm bg-white mb-3">
                    <option value="">-- Selecione o Colega --</option>
                </select>
                <p class="text-[10px] text-orange-600 font-medium">⚠️ O sistema enviará um e-mail automaticamente (se houver e-mail cadastrado) para o colega assumir o link de segurança.</p>
            </div>

            <button id="btn-finalizar-dinamico" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl shadow-md transition-colors text-sm uppercase tracking-wide">
                Confirmar e Seguir
            </button>
        `;

        aba.innerHTML = optionsHtml;

        this.povoarSelectsDinamicos();

        // LOGICA DE CLIQUE NOS BOTÕES
        this.fluxoSelecionado = 'direto';
        const btnDireto = document.getElementById('btn-opt-direto');
        const btnDist = document.getElementById('btn-opt-dist');
        const btnTransf = document.getElementById('btn-opt-transferir');
        const btnPausar = document.getElementById('btn-opt-pausar');
        const configDist = document.getElementById('config-distribuicao');
        const configTransf = document.getElementById('config-transferencia');

        const todos = [btnDireto, btnDist, btnTransf, btnPausar].filter(Boolean);

        const setAtivo = (btnClicado, fluxo) => {
            this.fluxoSelecionado = fluxo;
            todos.forEach(b => {
                b.classList.remove('ring-4', 'ring-blue-400', 'bg-blue-50', 'border-blue-200');
                b.classList.add('border-gray-200');
            });
            btnClicado.classList.remove('border-gray-200');
            btnClicado.classList.add('ring-4', 'ring-blue-400', 'bg-blue-50', 'border-blue-200');

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
            const defensores = this.todosColaboradores.filter(c => c.cargo?.toLowerCase().includes('defensor'));
            defensores.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.nome;
                opt.textContent = `${c.nome} ${c.equipe ? '(EQP ' + c.equipe + ')' : ''}`;
                selectDef.appendChild(opt);
            });
        }

        if (selectColab) {
            // Filtra todos MENOS o próprio cara que está transferindo
            const colegas = this.todosColaboradores.filter(c => c.nome !== this.colaboradorNome);
            colegas.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.nome;
                opt.textContent = `${c.nome} - ${c.cargo || 'N/A'}`;
                selectColab.appendChild(opt);
            });
        }
    },

    // ==========================================
    // FINALIZADOR MASTER DE FLUXOS
    // ==========================================
    async finalizarProcesso() {
        if (!this.fluxoSelecionado) return;

        const btnFinalizar = document.getElementById('btn-finalizar-dinamico');
        btnFinalizar.disabled = true;
        btnFinalizar.textContent = "Processando...";

        let updateData = {};
        let tituloSucesso = "Atendimento Atualizado!";
        let subtituloSucesso = "Você já pode fechar esta aba ou voltar ao painel.";

        // 1. FINALIZAR DIRETO
        if (this.fluxoSelecionado === 'direto') {
            updateData = {
                status: 'atendido',
                attendedAt: new Date().toISOString(),
                attendedTime: new Date().toISOString(),
                attendedBy: this.colaboradorNome,
                finalizadoPeloColaborador: true,
                distributionStatus: 'completed'
            };
            tituloSucesso = "Atendimento Concluído!";
            subtituloSucesso = "O processo foi finalizado com sucesso.";
        } 
        
        // 2. FILA DE DISTRIBUIÇÃO
        else if (this.fluxoSelecionado === 'distribuicao') {
            const defensor = document.getElementById('select-defensor-dinamico')?.value;
            const notas = document.getElementById('notas-distribuicao-dinamico')?.value;
            if (!defensor) {
                alert("Selecione um Defensor!");
                btnFinalizar.disabled = false; btnFinalizar.textContent = "Confirmar e Seguir";
                return;
            }
            updateData = {
                status: 'aguardandoDistribuicao',
                distributionStatus: 'pending',
                defensorResponsavel: defensor,
                notasRevisao: notas || ''
            };
            tituloSucesso = "Enviado para Assinatura!";
            subtituloSucesso = `O Defensor ${defensor} recebeu o caso no Painel.`;
        } 
        
        // 3. TRANSFERÊNCIA
        else if (this.fluxoSelecionado === 'transferir') {
            const colegaSelecionado = document.getElementById('select-transferir-colega')?.value;
            if (!colegaSelecionado) {
                alert("Selecione o colega para quem deseja transferir!");
                btnFinalizar.disabled = false; btnFinalizar.textContent = "Confirmar e Seguir";
                return;
            }

            const colegaObj = this.todosColaboradores.find(c => c.nome === colegaSelecionado);
            const emailDestino = colegaObj?.email || null;
            const tokenSeguranca = Date.now().toString(36) + Math.random().toString(36).substring(2);

            updateData = {
                status: 'emAtendimento', 
                assignedCollaborator: { name: colegaSelecionado, email: emailDestino },
                inAttendanceTime: new Date().toISOString(),
                delegationToken: tokenSeguranca
            };
            tituloSucesso = "Transferência Realizada!";
            subtituloSucesso = `O atendimento foi repassado para ${colegaSelecionado}.`;

            // Tenta enviar e-mail se o colega tiver e-mail cadastrado
            if (emailDestino) {
                try {
                    const { EmailService } = await import('./emailService.js');
                    await EmailService.sendDelegationEmail(
                        emailDestino, colegaSelecionado, this.assistidoData?.name, 
                        this.colaboradorNome, this.pautaId, this.assistidoId, tokenSeguranca
                    );
                } catch(e) { console.warn("Email de transferência falhou silenciosamente", e); }
            }
        } 
        
        // 4. DEVOLVER PARA FILA (PAUSAR)
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
            subtituloSucesso = "O assistido retornou para a lista de Aguardando.";
        }

        try {
            const docRef = doc(db, "pautas", this.pautaId, "attendances", this.assistidoId);
            await updateDoc(docRef, updateData);

            // Montamos o HTML de sucesso
            const mensagemSucessoHtml = `
                <div class="text-center p-8 bg-green-50 rounded-xl border border-green-200 shadow-sm mt-8 animate-fade-in">
                    <span class="text-5xl">✅</span>
                    <h2 class="text-2xl font-bold text-green-800 mt-4">${tituloSucesso}</h2>
                    <p class="text-green-600 mt-2 font-medium">${subtituloSucesso}</p>
                    <button onclick="window.history.back()" class="mt-6 text-sm text-green-700 underline font-bold">⬅️ Voltar ao Painel</button>
                </div>
            `;

            // Tenta achar a área primária
            const areaColaborador = document.getElementById('area-colaborador');
            
            if (areaColaborador) {
                areaColaborador.innerHTML = mensagemSucessoHtml;
            } else {
                // Fallback: Se não achar, injeta no container principal da tela
                const containerPrincipal = document.querySelector('.w-full.max-w-2xl') || document.body;
                containerPrincipal.innerHTML = mensagemSucessoHtml;
            }

            // Validação de segurança também para o header
            const headerBg = document.getElementById('header-bg');
            if (headerBg) {
                headerBg.className = "bg-green-600 p-5 text-white transition-colors";
            }

        } catch (error) {
            console.error("Erro real ao salvar:", error);
            alert("Erro ao salvar. Verifique a internet e tente novamente.");
            btnFinalizar.disabled = false;
            btnFinalizar.textContent = "Confirmar e Seguir";
        }
    },

    // ==========================================
    // RENDERIZAÇÃO DO HISTÓRICO (INTOCADA)
    // ==========================================
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

        if (chk.expenseData && chk.expenseData.checkExibirGastos) {
            const gastos = chk.expenseData;
            const categorias = [
                { id: 'moradia', label: 'Moradia' }, { id: 'alimentacao', label: 'Alimentação' }, { id: 'educacao', label: 'Educação' },
                { id: 'saude', label: 'Saúde' }, { id: 'vestuario', label: 'Vestuário' }, { id: 'lazer', label: 'Lazer' }, { id: 'outras', label: 'Outras' }
            ];

            let temGasto = false;
            let totalGastos = 0;
            let gastosHtml = `<div class="bg-green-50 p-4 rounded-xl mb-4 border border-green-200 shadow-sm"><h4 class="text-[10px] font-black text-green-800 uppercase mb-3 flex items-center gap-1"><span>💰</span> Planilha de Gastos Mensais</h4><table class="w-full text-xs text-left mb-3">`;

            categorias.forEach(cat => {
                if (gastos[cat.id] && String(gastos[cat.id]).trim() !== '' && gastos[cat.id] !== 'R$ 0,00') {
                    temGasto = true;
                    const num = parseFloat(gastos[cat.id].replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
                    totalGastos += num;
                    gastosHtml += `<tr class="border-b border-green-100 last:border-0"><td class="py-2 font-semibold text-gray-600">${cat.label}</td><td class="py-2 font-bold text-green-700 text-right">${gastos[cat.id]}</td></tr>`;
                }
            });

            if (temGasto) {
                const totalFormatado = totalGastos.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                gastosHtml += `<tr class="border-t-2 border-green-200"><td class="py-2 font-black text-green-900 uppercase">Total</td><td class="py-2 font-black text-green-900 text-right text-sm">${totalFormatado}</td></tr></table><button id="btn-baixar-planilha" class="mt-2 w-full bg-white border border-green-400 text-green-700 font-bold py-2.5 rounded-lg hover:bg-green-100 transition shadow-sm text-xs flex items-center justify-center gap-2">📄 Baixar Planilha em PDF</button></div>`;
                html += gastosHtml;
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
    // DASHBOARD DO DEFENSOR
    // ==========================================
    async renderizarDashboardDefensor() {
        const headerText = document.getElementById('assistido-nome');
        if (headerText) headerText.innerHTML = `Painel do Defensor<br><span class="text-sm font-normal">${this.colaboradorNome}</span>`;
        document.getElementById('assistido-assunto').classList.add('hidden');

        // Cria a interface do Dashboard por cima do container principal
        const corpo = document.querySelector('.w-full.max-w-2xl');
        if (!corpo) return;

        // Limpa a tela original e injeta o Dashboard
        corpo.innerHTML = `
            <div id="header-bg" class="bg-indigo-600 p-5 rounded-t-2xl shadow flex items-center justify-between">
                <div>
                    <h1 class="text-white font-black text-xl uppercase tracking-wide">💼 Meu Painel Judicial</h1>
                    <p class="text-indigo-200 text-xs mt-1">Bem-vindo(a), ${this.colaboradorNome}</p>
                </div>
                <div class="bg-indigo-500 p-2 rounded-full text-white">⚖️</div>
            </div>
            
            <div class="bg-white p-4 rounded-b-2xl shadow min-h-[400px]">
                
                <div class="flex border-b border-gray-200 mb-4">
                    <button id="tab-pendentes" class="w-1/2 py-3 text-xs font-bold uppercase tracking-wider text-indigo-600 border-b-2 border-indigo-600">Aguardando Assinatura</button>
                    <button id="tab-assinados" class="w-1/2 py-3 text-xs font-bold uppercase tracking-wider text-gray-400 border-b-2 border-transparent hover:text-gray-600">Já Protocolados</button>
                </div>

                <div id="lista-dashboard-conteudo" class="space-y-3">
                    <p class="text-center text-gray-400 text-sm mt-10">Carregando seus casos...</p>
                </div>

            </div>
        `;

        // Busca dados em Tempo Real
        try {
            const q = query(collection(db, "pautas", this.pautaId, "attendances"));
            const snap = await getDocs(q);
            const todos = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            const pendentes = todos.filter(a => a.status === 'aguardandoDistribuicao' && a.defensorResponsavel === this.colaboradorNome);
            
            // Já finalizados hoje (status = atendido, attendedBy = nome)
            const assinados = todos.filter(a => a.status === 'atendido' && a.attendedBy === this.colaboradorNome);

            const renderLista = (lista, ehPendente) => {
                const container = document.getElementById('lista-dashboard-conteudo');
                if (lista.length === 0) {
                    container.innerHTML = `<div class="text-center py-10 opacity-60"><span class="text-4xl mb-2 block">🙌</span><p class="text-sm font-bold text-gray-600">Sua mesa está limpa!</p></div>`;
                    return;
                }

                let html = '';
                lista.forEach(item => {
                    const notas = item.notasRevisao ? `<div class="mt-2 bg-yellow-50 p-2 rounded text-[10px] text-yellow-800 border border-yellow-200 font-medium">⚠️ <b>Nota:</b> ${item.notasRevisao}</div>` : '';
                    
                    if (ehPendente) {
                        const baseUrl = window.location.href.substring(0, window.location.href.indexOf('?'));
                        // Gera o link individual MANTENDO O MESMO TOKEN para não quebrar a segurança
                        const linkIndividual = `${baseUrl}?pautaId=${this.pautaId}&assistidoId=${item.id}&colab=${encodeURIComponent(this.colaboradorNome)}&token=${item.delegationToken}`;
                        
                        html += `
                            <div class="border border-indigo-100 bg-white p-4 rounded-xl shadow-sm hover:shadow transition relative">
                                <span class="absolute top-3 right-3 bg-red-100 text-red-600 text-[9px] font-black px-2 py-0.5 rounded uppercase">Pendente</span>
                                <h3 class="font-black text-gray-800 text-sm w-3/4 truncate">${item.name}</h3>
                                <p class="text-xs text-gray-500 mt-1">${item.subject || 'Assunto não informado'}</p>
                                ${notas}
                                <a href="${linkIndividual}" class="mt-3 block text-center w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold py-2 rounded-lg text-xs transition border border-indigo-200">
                                    🔍 Abrir e Assinar
                                </a>
                            </div>
                        `;
                    } else {
                        const horaStr = item.attendedAt ? new Date(item.attendedAt).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : '';
                        html += `
                            <div class="border border-green-100 bg-green-50 p-4 rounded-xl shadow-sm opacity-80">
                                <div class="flex justify-between items-start">
                                    <h3 class="font-black text-green-900 text-sm truncate w-3/4">${item.name}</h3>
                                    <span class="text-lg">✅</span>
                                </div>
                                <p class="text-xs text-green-700 mt-1">Protocolado às ${horaStr}</p>
                            </div>
                        `;
                    }
                });
                container.innerHTML = html;
            };

            // Setup das abas do Dashboard
            const btnPendentes = document.getElementById('tab-pendentes');
            const btnAssinados = document.getElementById('tab-assinados');

            btnPendentes.onclick = () => {
                btnPendentes.className = "w-1/2 py-3 text-xs font-bold uppercase tracking-wider text-indigo-600 border-b-2 border-indigo-600";
                btnAssinados.className = "w-1/2 py-3 text-xs font-bold uppercase tracking-wider text-gray-400 border-b-2 border-transparent hover:text-gray-600";
                renderLista(pendentes, true);
            };

            btnAssinados.onclick = () => {
                btnAssinados.className = "w-1/2 py-3 text-xs font-bold uppercase tracking-wider text-green-600 border-b-2 border-green-600";
                btnPendentes.className = "w-1/2 py-3 text-xs font-bold uppercase tracking-wider text-gray-400 border-b-2 border-transparent hover:text-gray-600";
                renderLista(assinados, false);
            };

            // Inicia na aba pendentes
            renderLista(pendentes, true);

        } catch (error) {
            document.getElementById('lista-dashboard-conteudo').innerHTML = `<p class="text-red-500 text-sm text-center">Erro ao carregar processos.</p>`;
        }
    },

    showError(titulo, mensagem) {
        const corpo = document.querySelector('.w-full.max-w-2xl');
        if (corpo) {
            corpo.innerHTML = `
                <div class="bg-red-600 p-6 text-white text-center rounded-t-2xl">
                    <span class="text-5xl">❌</span>
                    <h1 class="font-black text-2xl uppercase mt-4">ERRO!</h1>
                </div>
                <div class="p-8 text-center bg-white rounded-b-2xl shadow">
                    <h2 class="text-xl font-bold text-gray-800">${titulo}</h2>
                    <p class="text-gray-600 mt-4">${mensagem}</p>
                </div>
            `;
        }
    }
};
