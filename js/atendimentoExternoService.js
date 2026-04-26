// js/atendimentoExternoService.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, doc, getDoc, updateDoc, collection, query, where, getDocs, arrayUnion } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { firebaseConfig } from './config.js'; // Sua configuração do Firebase
import { jwtDecode } from 'https://cdn.jsdelivr.net/npm/jwt-decode@4.0.0/build/esm/index.min.js'; // Importa jwt-decode

// Inicializa o Firebase app e Firestore para esta página externa
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Variáveis de estado global para o atendimento externo
let pautaId = null;
let assistidoId = null;
let collaboratorName = null;
let fluxoEscolhido = 'direto'; // Padrão
let pautaData = null; // Para armazenar os dados da pauta

export const AtendimentoExternoService = {

    /**
     * Inicializa o painel de atendimento externo.
     * Deve ser chamado ao carregar o atendimento_externo.html.
     */
    async init() {
        console.log("⚡ AtendimentoExternoService inicializado.");

        const params = new URLSearchParams(window.location.search);
        const token = params.get('token'); // <<--- PEGA O TOKEN AQUI DA URL

        if (!token) {
            this.showError("Link de atendimento inválido: Token de segurança não fornecido.");
            return;
        }

        let decodedToken;
        try {
            // Decodifica o token localmente (não valida a assinatura aqui no frontend,
            // mas extrai o payload e verifica a expiração).
            // A validação da assinatura REAL ocorre na Cloud Function e DEVE
            // ser garantida pelas Firestore Security Rules no acesso aos dados.
            decodedToken = jwtDecode(token);
            
            // Valida a expiração do token (em segundos, jwtDecode retorna em segundos)
            if (decodedToken.exp * 1000 < Date.now()) { // Multiplica por 1000 para ms
                this.showError("Link de atendimento expirado. Solicite um novo link.");
                return;
            }
            
            // Extrai os dados essenciais do payload do token
            pautaId = decodedToken.pautaId;
            assistidoId = decodedToken.assistidoId;
            collaboratorName = decodedToken.collaboratorName;
            
            if (!pautaId || !assistidoId || !collaboratorName) {
                this.showError("Token de segurança incompleto ou inválido. Faltam dados essenciais.");
                return;
            }

            console.log("✅ Token JWT decodificado e válido na página externa:", decodedToken);

        } catch (error) {
            console.error("Erro ao decodificar/validar token JWT no cliente:", error);
            this.showError("Token de segurança inválido. O link pode ter sido adulterado, expirou ou está malformado.");
            return;
        }

        // Continuar com o carregamento dos dados se o token for válido e decodificado
        try {
            const pautaSnap = await getDoc(doc(db, "pautas", pautaId));
            if (!pautaSnap.exists()) {
                this.showError("Pauta não encontrada (ID no token inválido).");
                return;
            }
            pautaData = pautaSnap.data();

            const assistidoSnap = await getDoc(doc(db, "pautas", pautaId, "attendances", assistidoId));
            if (!assistidoSnap.exists()) {
                this.showError("Assistido não encontrado na pauta (ID no token inválido).");
                return;
            }
            const assistidoData = assistidoSnap.data();

            // Preenche o cabeçalho da UI
            document.getElementById('assistido-nome').textContent = assistidoData.name || 'Nome Indisponível';
            document.getElementById('assistido-assunto').textContent = assistidoData.subject || 'Assunto Indisponível';

            // Configura a visibilidade dos botões de fluxo com base na configuração da pauta
            // (Assumindo que pautaData.useDistributionFlow e pautaData.useReviewFlow existem)
            if (pautaData.useDistributionFlow) {
                document.getElementById('btn-fluxo-dist').classList.remove('hidden');
            }
            if (pautaData.useReviewFlow) {
                document.getElementById('btn-fluxo-rev').classList.remove('hidden');
                
                // Carrega defensores no Select
                const qColabs = query(collection(db, "pautas", pautaId, "collaborators"), where("cargo", "==", "Defensor(a)"));
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

            // Ajusta a interface com base no status do assistido
            if (assistidoData.status === 'emRevisao') {
                document.getElementById('header-bg').className = "bg-purple-600 p-5 text-white";
                document.getElementById('area-colaborador').classList.add('hidden');
                document.getElementById('area-defensor').classList.remove('hidden');
                const inputMotivo = document.getElementById('input-motivo');
                if (inputMotivo) inputMotivo.value = '';

            } else if (assistidoData.status === 'aguardandoCorrecao') {
                document.getElementById('header-bg').className = "bg-red-600 p-5 text-white";
                document.getElementById('area-colaborador').classList.remove('hidden');
                document.getElementById('area-defensor').classList.add('hidden');
                alert(`ATENÇÃO: Este processo foi devolvido. Motivo: ${assistidoData.reviewMotivoDevolucao || 'Motivo não especificado.'}`);
            } else {
                document.getElementById('area-colaborador').classList.remove('hidden');
            }

            // Renderiza Histórico
            this.renderHistory(assistidoData.history || []);

            // Configura os listeners dos botões após o init
            this.setupListeners();

        } catch (error) {
            console.error("Erro ao carregar dados do atendimento externo:", error);
            this.showError("Erro ao carregar dados do atendimento. Verifique o link ou sua conexão.");
        }
    },

    // ... (restante dos métodos: setupListeners, mudarAba, escolherFluxo, handleFinalizar, handleAprovar, handleDevolver, renderHistory, showError) ...

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
                sentBy: collaboratorName, // Usa o nome do token
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
            by: collaboratorName, // Usa o nome do token
            at: new Date().toISOString()
        });

        try {
            await updateDoc(doc(db, "pautas", pId, "attendances", assistidoId), updates);
            alert("Processo encaminhado com sucesso!");
            window.close();
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
                by: collaboratorName, // Usa o nome do token
                at: new Date().toISOString()
            })
        };

        try {
            await updateDoc(doc(db, "pautas", pId, "attendances", assistidoId), updates);
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
                by: collaboratorName, // Usa o nome do token
                at: new Date().toISOString()
            })
        };
        
        try {
            await updateDoc(doc(db, "pautas", pId, "attendances", assistidoId), updates);
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
        histCont.innerHTML = '';

        if (history && history.length > 0) {
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
