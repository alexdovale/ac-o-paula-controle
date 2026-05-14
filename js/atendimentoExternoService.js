// js/atendimentoExternoService.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { firebaseConfig } from './config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export const AtendimentoExternoService = {
    pautaId: null,
    assistidoId: null,
    colaboradorNome: null,
    fluxoSelecionado: null,

    async init() {
        console.log("⚡ Atendimento Externo inicializado (Com Histórico e Defensores)");

        // 1. Pega as informações da URL
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
            // 2. Faz o Login Anônimo Silencioso (Para as Regras de Segurança aprovarem)
            await signInAnonymously(auth);

            // 3. Busca os dados da PAUTA (Para saber se usa Distribuição)
            const pautaRef = doc(db, "pautas", this.pautaId);
            const pautaSnap = await getDoc(pautaRef);
            if (!pautaSnap.exists()) {
                this.showError("Erro", "A pauta informada não existe mais.");
                return;
            }
            const pautaData = pautaSnap.data();

            // 4. Busca os dados do ASSISTIDO
            const docRef = doc(db, "pautas", this.pautaId, "attendances", this.assistidoId);
            const docSnap = await getDoc(docRef);

            if (!docSnap.exists()) {
                this.showError("Não encontrado", "Este assistido não existe mais na pauta.");
                return;
            }

            const assistido = docSnap.data();

            // 5. Validação de Segurança
            if (assistido.delegationToken !== tokenRecebido) {
                this.showError("Acesso Negado", "Token de segurança inválido ou expirado. O link pode ter sido alterado.");
                return;
            }

            if (assistido.status === 'atendido' || assistido.status === 'aguardandoDistribuicao') {
                this.showError("Atendimento Concluído", "Este atendimento já foi finalizado anteriormente.");
                return;
            }

            // 6. Se passou na segurança, libera a interface!
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
        
        // Exibe o painel do colaborador
        document.getElementById('area-colaborador').classList.remove('hidden');

        // Configura a exibição do botão de Distribuição com base nas regras da Pauta
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
                // Filtra apenas quem for Defensor
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

        if (!assistido.documentChecklist || !assistido.documentChecklist.checkedIds || assistido.documentChecklist.checkedIds.length === 0) {
            lista.innerHTML = `
                <div class="text-center py-8">
                    <span class="text-3xl">📭</span>
                    <p class="text-xs text-gray-500 mt-2">Nenhum documento ou checklist registrado para este assistido.</p>
                </div>
            `;
            return;
        }

        const chk = assistido.documentChecklist;
        
        // Nome da Ação escolhida
        let html = `
            <div class="bg-blue-50 p-4 rounded-xl mb-4 border border-blue-100">
                <p class="text-[10px] text-blue-500 font-bold uppercase mb-1">Ação Selecionada:</p>
                <p class="text-sm font-bold text-blue-800">${chk.action || 'Não especificada'}</p>
            </div>
        `;

        // Lista de documentos
        html += `<h4 class="text-[10px] font-bold text-gray-400 uppercase mb-3">Documentos Coletados / Analisados</h4><ul class="space-y-2">`;
        
        chk.checkedIds.forEach(id => {
            const tipo = chk.docTypes && chk.docTypes[id] ? chk.docTypes[id] : 'Físico';
            const nomeFormatado = id.replace(/-/g, ' ').toUpperCase();
            
            html += `
                <li class="text-xs bg-white border p-3 rounded-lg flex justify-between items-center shadow-sm">
                    <span class="font-semibold text-gray-700">📄 ${nomeFormatado}</span> 
                    <span class="font-bold text-[10px] ${tipo === 'Físico' ? 'text-amber-600 bg-amber-50' : 'text-emerald-600 bg-emerald-50'} px-2 py-1 rounded border">
                        ${tipo}
                    </span>
                </li>
            `;
        });
        
        html += `</ul>`;
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
        // Listeners das Abas
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
        
        // Limpa os estilos dos botões
        const botoes = [document.getElementById('btn-fluxo-direto'), document.getElementById('btn-fluxo-dist')];
        botoes.forEach(b => {
            if(b) {
                b.classList.remove('ring-4', 'ring-blue-400', 'bg-blue-50');
                b.classList.add('border-gray-200');
            }
        });

        // Destaque azul no botão clicado
        botaoClicado.classList.remove('border-gray-200');
        botaoClicado.classList.add('ring-4', 'ring-blue-400', 'bg-blue-50');

        // Mostra a caixa do defensor se for distribuição
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

        // Regras para Distribuição vs Direto
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

            // Sucesso!
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
