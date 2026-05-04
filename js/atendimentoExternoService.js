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
            decodedToken = jwtDecode(token);
            
            if (decodedToken.exp * 1000 < Date.now()) { 
                this.showError("Link de atendimento expirado. Solicite um novo link.");
                return;
            }
            
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

            document.getElementById('assistido-nome').textContent = assistidoData.name || 'Nome Indisponível';
            document.getElementById('assistido-assunto').textContent = assistidoData.subject || 'Assunto Indisponível';

            if (pautaData.useDistributionFlow) {
                document.getElementById('btn-fluxo-dist').classList.remove('hidden');
            }
            if (pautaData.useReviewFlow) {
                document.getElementById('btn-fluxo-rev').classList.remove('hidden');
                
                const qColabs = query(collection(db, "pautas", pautaId, "collaborators"), where("cargo", "==", "Defensor(a)"));
                const colabsSnap = await getDocs(qColabs);
                const selectDefensor = document.getElementById('select-defensor');
                selectDefensor.innerHTML = '<option value="">-- Selecione --</option>'; 
                colabsSnap.forEach(d => {
                    const opt = document.createElement('option');
                    opt.value = d.data().nome; 
                    opt.textContent = d.data().nome; 
                    selectDefensor.appendChild(opt);
                });
            }

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

            this.renderHistory(assistidoData.history || []);
            this.setupListeners();

        } catch (error) {
            console.error("Erro ao carregar dados do atendimento externo:", error);
            this.showError("Erro ao carregar dados do atendimento. Verifique o link ou sua conexão.");
        }
    },

    /**
     * Configura os eventos de clique (listeners) da interface.
     */
    setupListeners() {
        document.getElementById('tab-btn-encerramento').addEventListener('click', () => this.mudarAba('encerramento'));
        document.getElementById('tab-btn-historico').addEventListener('click', () => this.mudarAba('historico'));

        const btnDireto = document.getElementById('btn-fluxo-direto');
        const btnDist = document.getElementById('btn-fluxo-dist');
        const btnRev = document.getElementById('btn-fluxo-rev');

        if(btnDireto) btnDireto.addEventListener('click', () => this.escolherFluxo('direto'));
        if(btnDist) btnDist.addEventListener('click', () => this.escolherFluxo('distribuicao'));
        if(btnRev) btnRev.addEventListener('click', () => this.escolherFluxo('revisao'));

        const btnFinalizar = document.getElementById('btn-finalizar');
        const btnAprovar = document.getElementById('btn-aprovar');
        const btnDevolver = document.getElementById('btn-devolver');

        if(btnFinalizar) btnFinalizar.addEventListener('click', () => this.handleFinalizar());
        if(btnAprovar) btnAprovar.addEventListener('click', () => this.handleAprovar());
        if(btnDevolver) btnDevolver.addEventListener('click', () => this.handleDevolver());
        
        this.escolherFluxo('direto');
    },

    /**
     * Alterna a visualização entre a aba de Encerramento e o Histórico.
     */
    mudarAba(aba) {
        const btnEncerramento = document.getElementById('tab-btn-encerramento');
        const btnHistorico = document.getElementById('tab-btn-historico');
        const abaEncerramento = document.getElementById('aba-encerramento');
        const abaHistorico = document.getElementById('aba-historico');

        if (aba === 'encerramento') {
            abaEncerramento.classList.remove('hidden');
            abaHistorico.classList.add('hidden');
            
            btnEncerramento.classList.add('tab-active');
            btnEncerramento.classList.remove('text-gray-400');
            
            btnHistorico.classList.remove('tab-active');
            btnHistorico.classList.add('text-gray-400');
        } else {
            abaHistorico.classList.remove('hidden');
            abaEncerramento.classList.add('hidden');
            
            btnHistorico.classList.add('tab-active');
            btnHistorico.classList.remove('text-gray-400');
            
            btnEncerramento.classList.remove('tab-active');
            btnEncerramento.classList.add('text-gray-400');
        }
    },

    /**
     * Gerencia qual opção de encerramento o colaborador clicou.
     */
    escolherFluxo(fluxo) {
        fluxoEscolhido = fluxo;
        
        const botoes = {
            'direto': document.getElementById('btn-fluxo-direto'),
            'distribuicao': document.getElementById('btn-fluxo-dist'),
            'revisao': document.getElementById('btn-fluxo-rev')
        };

        Object.values(botoes).forEach(btn => {
            if(btn) {
                btn.classList.remove('ring-2', 'ring-blue-500', 'bg-blue-50');
                btn.classList.add('border-gray-200');
            }
        });

        if (botoes[fluxo]) {
            botoes[fluxo].classList.remove('border-gray-200');
            botoes[fluxo].classList.add('ring-2', 'ring-blue-500', 'bg-blue-50');
        }

        const configRev = document.getElementById('config-revisao');
        if (configRev) {
            if (fluxo === 'revisao') {
                configRev.classList.remove('hidden');
            } else {
                configRev.classList.add('hidden');
            }
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
                sentBy: collaboratorName, 
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
            by: collaboratorName, 
            at: new Date().toISOString()
        });

        try {
            await updateDoc(doc(db, "pautas", pautaId, "attendances", assistidoId), updates);
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
                by: collaboratorName, 
                at: new Date().toISOString()
            })
        };

        try {
            await updateDoc(doc(db, "pautas", pautaId, "attendances", assistidoId), updates);
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
                by: collaboratorName, 
                at: new Date().toISOString()
            })
        };
        
        try {
            await updateDoc(doc(db, "pautas", pautaId, "attendances", assistidoId), updates);
            alert("Processo devolvido para correção.");
            window.close();
        } catch (error) {
            console.error("Erro ao devolver processo:", error);
            alert("Erro ao devolver processo. Verifique sua conexão.");
        }
    },

    /**
     * Renderiza o histórico de ações do assistido.
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
