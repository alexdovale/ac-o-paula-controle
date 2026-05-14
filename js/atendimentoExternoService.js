// js/atendimentoExternoService.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { firebaseConfig } from './config.js';
import { documentsData } from './detalhes.js'; // Importa a base de dados de documentos para traduzir os IDs

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export const AtendimentoExternoService = {
    pautaId: null,
    assistidoId: null,
    colaboradorNome: null,
    fluxoSelecionado: null,

    async init() {
        console.log("⚡ Atendimento Externo inicializado (Com Histórico Completo e Defensores)");

        const urlParams = new URLSearchParams(window.location.search);
        this.pautaId = urlParams.get('pautaId');
        this.assistidoId = urlParams.get('assistidoId');
        const tokenRecebido = urlParams.get('token');
        this.colaboradorNome = urlParams.get('colab') || "Colaborador";

        if (!this.pautaId || !this.assistidoId || !tokenRecebido) {
            this.showError("Link Incompleto", "O link acessado está faltando informações importantes.");
            return;
        }

        try {
            // 1. Faz o Login Anônimo Silencioso
            await signInAnonymously(auth);

            // 2. Busca os dados da PAUTA para regras de distribuição
            const pautaRef = doc(db, "pautas", this.pautaId);
            const pautaSnap = await getDoc(pautaRef);
            if (!pautaSnap.exists()) {
                this.showError("Erro", "A pauta informada não existe mais.");
                return;
            }
            const pautaData = pautaSnap.data();

            // 3. Busca os dados do ASSISTIDO
            const docRef = doc(db, "pautas", this.pautaId, "attendances", this.assistidoId);
            const docSnap = await getDoc(docRef);

            if (!docSnap.exists()) {
                this.showError("Não encontrado", "Este assistido não existe mais na pauta.");
                return;
            }

            const assistido = docSnap.data();

            // 4. Validação de Segurança Exata
            if (assistido.delegationToken !== tokenRecebido) {
                this.showError("Acesso Negado", "Token de segurança inválido ou expirado. O link pode ter sido alterado.");
                return;
            }

            if (assistido.status === 'atendido' || assistido.status === 'aguardandoDistribuicao') {
                this.showError("Atendimento Concluído", "Este atendimento já foi finalizado anteriormente.");
                return;
            }

            // 5. Renderiza a Interface
            this.renderizarInterface(assistido, pautaData);
            this.setupListeners();

        } catch (error) {
            console.error("Erro ao carregar dados:", error);
            this.showError("Erro no Servidor", "Falha ao conectar com o banco de dados.");
        }
    },

    renderizarInterface(assistido, pautaData) {
        document.getElementById('assistido-nome').textContent = assistido.name || 'Nome não informado';
        document.getElementById('assistido-assunto').textContent = assistido.subject || 'Assunto não informado';
        
        document.getElementById('area-colaborador').classList.remove('hidden');

        // Controla a visibilidade da fila de Distribuição
        if (pautaData.useDistributionFlow) {
            document.getElementById('btn-fluxo-dist').classList.remove('hidden');
            this.carregarDefensores();
        } else {
            document.getElementById('btn-fluxo-dist').classList.add('hidden');
        }

        this.renderizarHistorico(assistido);
    },

    async carregarDefensores() {
        try {
            const snap = await getDocs(collection(db, "pautas", this.pautaId, "collaborators"));
            const select = document.getElementById('select-defensor');
            if (!select) return;

            select.innerHTML = '<option value="">-- Selecione o Defensor --</option>';
            let count = 0;

            snap.docs.forEach(doc => {
                const c = doc.data();
                if (c.cargo === 'Defensor(a)' || c.cargo === 'Defensor') {
                    const opt = document.createElement('option');
                    opt.value = c.nome;
                    const equipeStr = c.equipe ? ` (Equipe ${c.equipe})` : '';
                    opt.textContent = `${c.nome}${equipeStr}`;
                    select.appendChild(opt);
                    count++;
                }
            });

            if (count === 0) {
                select.innerHTML = '<option value="">Nenhum Defensor cadastrado nesta pauta.</option>';
            }
        } catch (error) {
            console.error("Erro ao carregar defensores", error);
        }
    },

    renderizarHistorico(assistido) {
        const lista = document.getElementById('lista-historico');
        if (!lista) return;

        if (!assistido.documentChecklist || !assistido.documentChecklist.action) {
            lista.innerHTML = `
                <div class="text-center py-8">
                    <span class="text-3xl">📭</span>
                    <p class="text-sm font-bold text-gray-700 mt-3">Nenhum checklist registrado.</p>
                    <p class="text-xs text-gray-500 mt-1">O atendimento anterior não salvou documentos ou planilhas.</p>
                </div>
            `;
            return;
        }

        const chk = assistido.documentChecklist;
        const actionData = documentsData[chk.action];
        const actionTitle = actionData ? actionData.title : chk.action;
        
        let html = `
            <div class="bg-blue-50 p-4 rounded-xl mb-4 border border-blue-100">
                <p class="text-[10px] text-blue-500 font-bold uppercase mb-1">Ação Analisada:</p>
                <p class="text-sm font-black text-blue-800 uppercase">${actionTitle}</p>
            </div>
        `;

        // ==========================================
        // 1. LISTA DE DOCUMENTOS
        // ==========================================
        if (chk.checkedIds && chk.checkedIds.length > 0) {
            html += `<h4 class="text-[10px] font-bold text-gray-400 uppercase mb-3">Documentos Coletados</h4><ul class="space-y-2 mb-6">`;
            
            chk.checkedIds.forEach(id => {
                // Ignora IDs que são do Réu ou de Gastos, focando só nos docs base
                if (id.startsWith('reu-') || id.startsWith('gasto-')) return;

                let docName = id;
                // Traduz o ID "doc-acao-secao-index" para o texto real do documento
                if (actionData && id.startsWith('doc-')) {
                    const parts = id.split('-');
                    if (parts.length >= 4) {
                        const sIdx = parseInt(parts[2]);
                        const dIdx = parseInt(parts[3]);
                        const docObj = actionData.sections[sIdx]?.docs[dIdx];
                        if (docObj) {
                            docName = typeof docObj === 'string' ? docObj : docObj.text;
                        }
                    }
                }

                const tipo = chk.docTypes && chk.docTypes[id] ? chk.docTypes[id] : 'Físico';
                
                html += `
                    <li class="text-xs bg-white border p-3 rounded-lg flex justify-between items-center shadow-sm">
                        <span class="font-semibold text-gray-700 pr-2">📄 ${docName}</span> 
                        <span class="font-bold text-[9px] uppercase tracking-wider ${tipo === 'Físico' ? 'text-amber-600 bg-amber-50' : 'text-emerald-600 bg-emerald-50'} px-2 py-1 rounded border">
                            ${tipo}
                        </span>
                    </li>
                `;
            });
            html += `</ul>`;
        }

        // ==========================================
        // 2. DADOS DO RÉU
        // ==========================================
        if (chk.reuData && chk.reuData.checkReuUnico) {
            const reu = chk.reuData;
            html += `
                <div class="bg-red-50 p-4 rounded-xl mb-6 border border-red-200 shadow-sm">
                    <h4 class="text-[10px] font-black text-red-700 uppercase mb-3 flex items-center gap-1">
                        <span>👤</span> Dados da Parte Contrária (Réu)
                    </h4>
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

        // ==========================================
        // 3. PLANILHA DE GASTOS
        // ==========================================
        if (chk.expenseData && chk.expenseData.checkExibirGastos) {
            const gastos = chk.expenseData;
            const categorias = [
                { id: 'moradia', label: 'Moradia' },
                { id: 'alimentacao', label: 'Alimentação' },
                { id: 'educacao', label: 'Educação' },
                { id: 'saude', label: 'Saúde' },
                { id: 'vestuario', label: 'Vestuário' },
                { id: 'lazer', label: 'Lazer' },
                { id: 'outras', label: 'Outras' }
            ];

            let temGasto = false;
            let gastosHtml = `
                <div class="bg-green-50 p-4 rounded-xl mb-4 border border-green-200 shadow-sm">
                    <h4 class="text-[10px] font-black text-green-800 uppercase mb-3 flex items-center gap-1">
                        <span>💰</span> Planilha de Gastos Mensais
                    </h4>
                    <table class="w-full text-xs text-left">
            `;

            categorias.forEach(cat => {
                if (gastos[cat.id] && gastos[cat.id] !== 'R$ 0,00' && gastos[cat.id].trim() !== '') {
                    temGasto = true;
                    gastosHtml += `
                        <tr class="border-b border-green-100 last:border-0">
                            <td class="py-2 font-semibold text-gray-600">${cat.label}</td>
                            <td class="py-2 font-bold text-green-700 text-right">${gastos[cat.id]}</td>
                        </tr>
                    `;
                }
            });

            gastosHtml += `</table></div>`;
            if (temGasto) html += gastosHtml;
        }

        lista.innerHTML = html;
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

    setupListeners() {
        document.getElementById('tab-btn-encerramento')?.addEventListener('click', () => this.switchTab('encerramento'));
        document.getElementById('tab-btn-historico')?.addEventListener('click', () => this.switchTab('historico'));

        const btnDireto = document.getElementById('btn-fluxo-direto');
        const btnDist = document.getElementById('btn-fluxo-dist');
        const btnFinalizar = document.getElementById('btn-finalizar');

        if(btnDireto) btnDireto.onclick = () => this.selecionarFluxo('direto', btnDireto);
        if(btnDist) btnDist.onclick = () => this.selecionarFluxo('distribuicao', btnDist);

        if(btnFinalizar) {
            btnFinalizar.onclick = () => this.finalizarProcesso();
        }
    },

    selecionarFluxo(tipo, botaoClicado) {
        this.fluxoSelecionado = tipo;
        
        const botoes = [document.getElementById('btn-fluxo-direto'), document.getElementById('btn-fluxo-dist')];
        botoes.forEach(b => {
            if(b) {
                b.classList.remove('ring-4', 'ring-blue-400', 'bg-blue-50');
                b.classList.add('border-gray-200');
            }
        });

        botaoClicado.classList.remove('border-gray-200');
        botaoClicado.classList.add('ring-4', 'ring-blue-400', 'bg-blue-50');

        const configRevisao = document.getElementById('config-revisao');
        if (configRevisao) {
            if (tipo === 'distribuicao') {
                configRevisao.classList.remove('hidden');
            } else {
                configRevisao.classList.add('hidden');
            }
        }
    },

    async finalizarProcesso() {
        if (!this.fluxoSelecionado) {
            alert("Selecione como deseja finalizar (Finalizar Atendimento ou Distribuição).");
            return;
        }

        let updateData = {
            attendedAt: new Date().toISOString(),
            attendedTime: new Date().toISOString(),
            attendedBy: this.colaboradorNome,
            finalizadoPeloColaborador: true
        };

        if (this.fluxoSelecionado === 'direto') {
            updateData.status = 'atendido';
            updateData.distributionStatus = 'completed';
        } else if (this.fluxoSelecionado === 'distribuicao') {
            const defensor = document.getElementById('select-defensor')?.value;
            const notas = document.getElementById('notas-revisao')?.value;
            
            if (!defensor) {
                alert("Por favor, selecione um Defensor(a) Responsável.");
                return;
            }

            updateData.status = 'aguardandoDistribuicao';
            updateData.distributionStatus = 'pending';
            updateData.defensorResponsavel = defensor;
            updateData.notasRevisao = notas || '';
        }

        const btnFinalizar = document.getElementById('btn-finalizar');
        btnFinalizar.disabled = true;
        btnFinalizar.textContent = "Salvando...";

        try {
            const docRef = doc(db, "pautas", this.pautaId, "attendances", this.assistidoId);
            await updateDoc(docRef, updateData);

            document.getElementById('area-colaborador').innerHTML = `
                <div class="text-center p-8 bg-green-50 rounded-xl border border-green-200 shadow-sm mt-8">
                    <span class="text-5xl">✅</span>
                    <h2 class="text-2xl font-bold text-green-800 mt-4">Atendimento Concluído!</h2>
                    <p class="text-green-600 mt-2 font-medium">Muito obrigado! Você já pode fechar esta aba.</p>
                </div>
            `;
            document.getElementById('header-bg').className = "bg-green-600 p-5 text-white";

        } catch (error) {
            console.error("Erro ao salvar no banco:", error);
            alert("Erro ao salvar os dados no servidor. Verifique a internet e tente novamente.");
            btnFinalizar.disabled = false;
            btnFinalizar.textContent = "Confirmar e Seguir";
        }
    },

    showError(titulo, mensagem) {
        const corpo = document.querySelector('.w-full.max-w-2xl');
        if (corpo) {
            corpo.innerHTML = `
                <div class="bg-red-600 p-6 text-white text-center">
                    <span class="text-5xl">❌</span>
                    <h1 class="font-black text-2xl uppercase mt-4">ERRO!</h1>
                </div>
                <div class="p-8 text-center bg-white">
                    <h2 class="text-xl font-bold text-gray-800">${titulo}</h2>
                    <p class="text-gray-600 mt-4">${mensagem}</p>
                </div>
            `;
        }
    }
};
