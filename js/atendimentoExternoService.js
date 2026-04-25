// js/atendimentoExternoService.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, doc, getDoc, updateDoc, collection, query, where, getDocs, arrayUnion } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
// Você precisará importar sua configuração do Firebase aqui, como './config.js'
// Ou ter um mecanismo para que 'app' seja inicializado externamente e passado para o serviço.
// Por simplicidade AGORA, vamos manter a inicialização aqui, mas é algo a revisar.
import { firebaseConfig } from './config.js'; // Assumindo que config.js está no mesmo nível

// Inicializa o Firebase app e Firestore para esta página externa
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Variáveis de estado global para o atendimento externo
let pautaId = null;
let assistidoId = null;
let myName = null;
let fluxoEscolhido = 'direto'; // Padrão

export const AtendimentoExternoService = {

    /**
     * Inicializa o painel de atendimento externo.
     * Deve ser chamado ao carregar o atendimento_externo.html.
     */
    async init() {
        console.log("⚡ AtendimentoExternoService inicializado.");

        const params = new URLSearchParams(window.location.search);
        pId = params.get('pautaId');
        aId = params.get('assistidoId');
        myName = params.get('collaboratorName');
        // ⭐ FUTURO: Precisaremos de um token de segurança aqui. Por enquanto, só os IDs. ⭐

        if (!pId || !aId || !myName) {
            this.showError("Link de atendimento inválido ou incompleto.");
            return;
        }

        try {
            const pautaSnap = await getDoc(doc(db, "pautas", pId));
            if (!pautaSnap.exists()) {
                this.showError("Pauta não encontrada.");
                return;
            }
            const pautaData = pautaSnap.data();

            const assistidoSnap = await getDoc(doc(db, "pautas", pId, "attendances", aId));
            if (!assistidoSnap.exists()) {
                this.showError("Assistido não encontrado na pauta.");
                return;
            }
            const assistidoData = assistidoSnap.data();

            // Preenche o cabeçalho
            document.getElementById('assistido-nome').textContent = assistidoData.name || 'Nome Indisponível';
            document.getElementById('assistido-assunto').textContent = assistidoData.subject || 'Assunto Indisponível';

            // Configura a visibilidade dos botões de fluxo com base na configuração da pauta
            // ⭐ MELHORIA: Essas configurações (useDistributionFlow, useReviewFlow) devem vir
            // do documento da pauta, para não depender de lógicas externas.
            if (pautaData.useDistributionFlow) { // Assumindo que essa prop existe na pauta
                document.getElementById('btn-fluxo-dist').classList.remove('hidden');
            }
            if (pautaData.useReviewFlow) { // Assumindo que essa prop existe na pauta
                document.getElementById('btn-fluxo-rev').classList.remove('hidden');
                
                // Carrega defensores no Select (apenas defensores desta pauta)
                // ⭐ MELHORIA: A lista de colaboradores deve ser filtrada por pauta/função
                const qColabs = query(collection(db, "pautas", pId, "collaborators"), where("cargo", "==", "Defensor(a)"));
                const colabsSnap = await getDocs(qColabs);
                const selectDefensor = document.getElementById('select-defensor');
                selectDefensor.innerHTML = '<option value="">-- Selecione --</option>'; // Opção padrão
                colabsSnap.forEach(d => {
                    const opt = document.createElement('option');
                    opt.value = d.data().nome; 
                    opt.textContent = d.data().nome; 
                    selectDefensor.appendChild(opt);
                });
            }

            // MÁGICA: Ajusta a interface com base no status do assistido
            if (assistidoData.status === 'emRevisao') {
                document.getElementById('header-bg').className = "bg-purple-600 p-5 text-white";
                document.getElementById('area-colaborador').classList.add('hidden');
                document.getElementById('area-defensor').classList.remove('hidden');
                // Limpa o input de motivo ao iniciar, para nova revisão
                const inputMotivo = document.getElementById('input-motivo');
                if (inputMotivo) inputMotivo.value = '';

            } else if (assistidoData.status === 'aguardandoCorrecao') {
                document.getElementById('header-bg').className = "bg-red-600 p-5 text-white";
                document.getElementById('area-colaborador').classList.remove('hidden');
                document.getElementById('area-defensor').classList.add('hidden');
                alert(`ATENÇÃO: Este processo foi devolvido. Motivo: ${assistidoData.reviewMotivoDevolucao || 'Motivo não especificado.'}`);
            } else {
                // Estado padrão: painel do colaborador visível
                document.getElementById('area-colaborador').classList.remove('hidden');
            }

            // Renderiza Histórico
            this.renderHistory(assistidoData.history || []);

            // Configura os listeners dos botões após o init
            this.setupListeners();

        } catch (error) {
            console.error("Erro ao inicializar atendimento externo:", error);
            this.showError("Erro ao carregar os dados do atendimento. Tente novamente.");
        }
    },

    /**
     * Configura os listeners para os botões do painel externo.
     */
    setupListeners() {
        // Lógica de Abas
        document.getElementById('tab-btn-encerramento').onclick = () => this.mudarAba('encerramento');
        document.getElementById('tab-btn-historico').onclick = () => this.mudarAba('historico');

        // Lógica de Botões de Fluxo do Colaborador
        document.getElementById('btn-fluxo-direto').onclick = () => this.escolherFluxo('direto');
        document.getElementById('btn-fluxo-dist').onclick = () => this.escolherFluxo('distribuicao');
        document.getElementById('btn-fluxo-rev').onclick = () => this.escolherFluxo('revisao');

        // AÇÕES DO COLABORADOR
        document.getElementById('btn-finalizar').onclick = () => this.handleFinalizar();

        // AÇÕES DO DEFENSOR
        document.getElementById('btn-aprovar').onclick = () => this.handleAprovar();
        document.getElementById('btn-devolver').onclick = () => this.handleDevolver();
    },

    /**
     * Altera a aba visível no painel.
     * @param {string} aba - O ID da aba a ser mostrada ('encerramento' ou 'historico').
     */
    mudarAba(aba) {
        document.getElementById('aba-encerramento').classList.add('hidden');
        document.getElementById('aba-historico').classList.add('hidden');
        document.getElementById('tab-btn-encerramento').className = "flex-1 p-3 text-[10px] uppercase text-gray-400 font-bold";
        document.getElementById('tab-btn-historico').className = "flex-1 p-3 text-[10px] uppercase text-gray-400 font-bold";
        
        document.getElementById(`aba-${aba}`).classList.remove('hidden');
        document.getElementById(`tab-btn-${aba}`).classList.add('tab-active'); // Adiciona a classe tab-active
    },

    /**
     * Escolhe o fluxo de finalização do assistido.
     * @param {string} fluxo - O fluxo escolhido ('direto', 'distribuicao', 'revisao').
     */
    escolherFluxo(fluxo) {
        fluxoEscolhido = fluxo;
        document.getElementById('config-revisao').classList.toggle('hidden', fluxo !== 'revisao');
        
        // Remove classes de ativo de todos os botões
        document.getElementById('btn-fluxo-direto').classList.remove('border-green-500', 'bg-green-50');
        document.getElementById('btn-fluxo-dist').classList.remove('border-cyan-500', 'bg-cyan-50');
        document.getElementById('btn-fluxo-rev').classList.remove('border-purple-500', 'bg-purple-50');

        // Adiciona classes de ativo ao botão selecionado
        document.getElementById('btn-fluxo-direto').classList.add('border-gray-200'); // Garante estilo padrão
        document.getElementById('btn-fluxo-dist').classList.add('border-gray-200');
        document.getElementById('btn-fluxo-rev').classList.add('border-gray-200');

        if (fluxo === 'direto') {
            document.getElementById('btn-fluxo-direto').classList.add('border-green-500', 'bg-green-50');
        } else if (fluxo === 'distribuicao') {
            document.getElementById('btn-fluxo-dist').classList.add('border-cyan-500', 'bg-cyan-50');
        } else if (fluxo === 'revisao') {
            document.getElementById('btn-fluxo-rev').classList.add('border-purple-500', 'bg-purple-50');
        }
    },

    /**
     * Manipula a ação de finalizar/encaminhar do colaborador.
     */
    async handleFinalizar() {
        const updates = {};
        
        if (fluxoEscolhido === 'direto') {
            updates.status = 'atendido';
        } else if (fluxoEscolhido === 'distribuicao') {
            updates.status = 'aguardandoDistribuicao';
        } else if (fluxoEscolhido === 'revisao') {
            updates.status = 'emRevisao';
            updates.reviewData = {
                sentBy: myName,
                defensor: document.getElementById('select-defensor').value,
                notes: document.getElementById('notas-revisao').value
            };
            if (!updates.reviewData.defensor) {
                alert("Selecione um defensor responsável para revisão.");
                return;
            }
        }
        
        updates.history = arrayUnion({
            action: `MARCADO COMO ${updates.status.toUpperCase()}`,
            by: myName,
            at: new Date().toISOString()
        });

        try {
            await updateDoc(doc(db, "pautas", pId, "attendances", aId), updates);
            alert("Processo encaminhado com sucesso!");
            window.close(); // Fecha a janela após sucesso
        } catch (error) {
            console.error("Erro ao finalizar processo:", error);
            alert("Erro ao finalizar processo. Verifique sua conexão.");
        }
    },

    /**
     * Manipula a ação de aprovar do defensor.
     */
    async handleAprovar() {
        const numero = document.getElementById('input-processo').value;
        const status = numero ? 'distribuido' : 'aguardandoNumero';
        
        const updates = {
            status: status,
            processNumber: numero || null,
            history: arrayUnion({
                action: numero ? 'APROVADO_E_DISTRIBUIDO' : 'APROVADO_SEM_NUMERO',
                by: myName,
                at: new Date().toISOString()
            })
        };

        try {
            await updateDoc(doc(db, "pautas", pId, "attendances", aId), updates);
            alert("Aprovado com sucesso!");
            window.close();
        } catch (error) {
            console.error("Erro ao aprovar processo:", error);
            alert("Erro ao aprovar processo. Verifique sua conexão.");
        }
    },

    /**
     * Manipula a ação de devolver do defensor.
     */
    async handleDevolver() {
        const motivo = document.getElementById('input-motivo').value;
        if (!motivo) return alert("Descreva o motivo da devolução!");

        const updates = {
            status: 'aguardandoCorrecao',
            reviewMotivoDevolucao: motivo,
            history: arrayUnion({
                action: 'DEVOLVIDO_PARA_CORRECAO',
                msg: motivo,
                by: myName,
                at: new Date().toISOString()
            })
        };
        
        try {
            await updateDoc(doc(db, "pautas", pId, "attendances", aId), updates);
            alert("Processo devolvido para correção.");
            window.close();
        } catch (error) {
            console.error("Erro ao devolver processo:", error);
            alert("Erro ao devolver processo. Verifique sua conexão.");
        }
    },

    /**
     * Renderiza o histórico de ações do assistido.
     * @param {Array} history - Array de objetos de histórico.
     */
    renderHistory(history) {
        const histCont = document.getElementById('lista-historico');
        if (!histCont) return;
        histCont.innerHTML = ''; // Limpa antes de renderizar

        if (history && history.length > 0) {
            // Inverte para mostrar os mais recentes primeiro
            [...history].reverse().forEach(h => {
                histCont.innerHTML += `
                    <div class="bg-gray-50 border p-3 rounded-lg text-xs">
                        <b class="text-blue-600">${h.action}</b>
                        <p class="text-[9px] text-gray-500 mb-1">${new Date(h.at).toLocaleString('pt-BR')}</p>
                        ${h.msg ? `<p class="italic text-gray-700">"${h.msg}"</p>` : ''}
                    </div>`;
            });
        } else {
            histCont.innerHTML = "<p class='text-xs text-gray-400'>Nenhum histórico registrado.</p>";
        }
    },

    /**
     * Exibe uma mensagem de erro e desabilita a interface.
     * @param {string} message - A mensagem de erro.
     */
    showError(message) {
        document.getElementById('assistido-nome').textContent = "ERRO!";
        document.getElementById('assistido-assunto').textContent = message;
        document.getElementById('header-bg').className = "bg-red-600 p-5 text-white";
        
        // Esconde todas as áreas de interação
        document.getElementById('aba-encerramento').classList.add('hidden');
        document.getElementById('aba-historico').classList.add('hidden');
        document.getElementById('tab-btn-encerramento').classList.add('hidden');
        document.getElementById('tab-btn-historico').classList.add('hidden');
    }
};

// Auto-inicializa o serviço quando o script é carregado
document.addEventListener('DOMContentLoaded', () => {
    AtendimentoExternoService.init();
});