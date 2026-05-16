// js/reviewFlow.js - GERENCIADOR DE FLUXO DE REVISÃO (MODERNIZADO)

import { doc, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showNotification } from './utils.js';

export const ReviewFlowService = {
    
    /**
     * 1. Colaborador envia para Revisão (Mesa do Defensor)
     */
    async sendToReview(app, assistedId, defensorNome, notas = "") {
        if (!app?.currentPauta?.id || !assistedId || !defensorNome) {
            showNotification("Dados insuficientes para enviar à revisão.", "error");
            return false;
        }

        try {
            const ref = doc(app.db, "pautas", app.currentPauta.id, "attendances", assistedId);
            
            await updateDoc(ref, {
                status: 'aguardandoDistribuicao', // Ajustado para o status que as colunas do seu SIGAP lêem
                flowType: 'revisao',
                defensorResponsavel: defensorNome, // Facilita o filtro nas colunas
                notasRevisao: notas, // Para exibir a tag amarela "NOTA PARA O DEFENSOR"
                reviewData: {
                    sentBy: app.currentUserName || 'Sistema',
                    sentAt: new Date().toISOString(),
                    defensor: defensorNome,
                    notes: notas
                },
                history: arrayUnion({
                    action: 'ENVIADO_PARA_REVISAO',
                    by: app.currentUserName || 'Sistema',
                    msg: notas || 'Enviado sem notas adicionais',
                    at: new Date().toISOString()
                })
            });
            
            showNotification("Enviado para a mesa do Defensor com sucesso! ⚖️", "success");
            return true;
        } catch (error) {
            console.error("Erro ao enviar para revisão:", error);
            showNotification("Erro de conexão ao enviar para o Defensor.", "error");
            return false;
        }
    },

    /**
     * 2. Defensor devolve para Correção (Volta para o Servidor)
     */
    async returnForCorrection(app, assistedId, motivo = "Correção necessária") {
        if (!app?.currentPauta?.id || !assistedId) {
            showNotification("Dados insuficientes para devolver.", "error");
            return false;
        }

        try {
            const ref = doc(app.db, "pautas", app.currentPauta.id, "attendances", assistedId);
            
            await updateDoc(ref, {
                status: 'aguardandoCorrecao',
                notasRevisao: motivo, // Sobrescreve as notas com o motivo do erro
                reviewMotivoDevolucao: motivo,
                history: arrayUnion({
                    action: 'DEVOLVIDO_PARA_CORRECAO',
                    by: app.currentUserName || 'Sistema',
                    msg: `Motivo: ${motivo}`,
                    at: new Date().toISOString()
                })
            });
            
            showNotification("Processo devolvido para correção! ⚠️", "warning");
            return true;
        } catch (error) {
            console.error("Erro ao devolver para correção:", error);
            showNotification("Erro de conexão ao devolver processo.", "error");
            return false;
        }
    },

    /**
     * 3. Defensor Aprova e/ou Insere Número do Processo
     */
    async approveReview(app, assistedId, processNumber = null) {
        if (!app?.currentPauta?.id || !assistedId) {
            showNotification("Erro na identificação do processo.", "error");
            return false;
        }

        try {
            const ref = doc(app.db, "pautas", app.currentPauta.id, "attendances", assistedId);
            // Se tem número, finaliza (atendido). Se não, fica pendente aguardando número.
            const novoStatus = processNumber ? 'atendido' : 'aguardandoNumero'; 
            
            const updates = {
                status: novoStatus,
                attendedBy: app.currentUserName || 'Sistema', // Registra quem finalizou
                attendedAt: new Date().toISOString(),         // Registra a hora da finalização
                finalizadoPeloColaborador: !!processNumber,   // Marca como finalizado para os gráficos
                history: arrayUnion({
                    action: processNumber ? 'APROVADO_E_DISTRIBUIDO' : 'APROVADO_AGUARDANDO_NUMERO',
                    by: app.currentUserName || 'Sistema',
                    msg: processNumber ? `Nº ${processNumber}` : 'Aprovado internamente',
                    at: new Date().toISOString()
                })
            };

            // Salva o número do processo se foi digitado
            if (processNumber) {
                updates.numeroProcesso = processNumber;
            }

            await updateDoc(ref, updates);
            
            if (processNumber) {
                showNotification("Distribuído e Finalizado com sucesso! ✅", "success");
            } else {
                showNotification("Aprovado! Aguardando inserir o número do processo.", "info");
            }
            return true;
            
        } catch (error) {
            console.error("Erro ao aprovar revisão:", error);
            showNotification("Erro ao tentar aprovar o documento.", "error");
            return false;
        }
    }
};
