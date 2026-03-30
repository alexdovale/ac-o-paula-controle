// js/reviewFlow.js
import { doc, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showNotification } from './utils.js';

export const ReviewFlowService = {
    // 1. Colaborador envia para Revisão
    async sendToReview(app, assistedId, defensorNome, notas) {
        const ref = doc(app.db, "pautas", app.currentPauta.id, "attendances", assistedId);
        await updateDoc(ref, {
            status: 'emRevisao',
            flowType: 'revisao',
            reviewData: {
                sentBy: app.currentUserName,
                sentAt: new Date().toISOString(),
                defensor: defensorNome,
                notes: notas
            },
            history: arrayUnion({
                action: 'ENVIADO_PARA_REVISAO',
                by: app.currentUserName,
                msg: notas,
                at: new Date().toISOString()
            })
        });
        showNotification("Enviado para revisão do Defensor!");
    },

    // 2. Defensor devolve para Correção
    async returnForCorrection(app, assistedId, motivo) {
        const ref = doc(app.db, "pautas", app.currentPauta.id, "attendances", assistedId);
        await updateDoc(ref, {
            status: 'aguardandoCorrecao',
            reviewMotivoDevolucao: motivo,
            history: arrayUnion({
                action: 'DEVOLVIDO_PARA_CORRECAO',
                by: app.currentUserName,
                msg: motivo,
                at: new Date().toISOString()
            })
        });
        showNotification("Devolvido para correção!");
    },

    // 3. Defensor Aprova (com ou sem número)
    async approveReview(app, assistedId, processNumber = null) {
        const ref = doc(app.db, "pautas", app.currentPauta.id, "attendances", assistedId);
        const status = processNumber ? 'distribuido' : 'aguardandoNumero';
        
        const updates = {
            status: status,
            history: arrayUnion({
                action: processNumber ? 'APROVADO_E_DISTRIBUIDO' : 'APROVADO_AGUARDANDO_NUMERO',
                by: app.currentUserName,
                at: new Date().toISOString()
            })
        };

        if (processNumber) updates.processNumber = processNumber;

        await updateDoc(ref, updates);
        showNotification(processNumber ? "Distribuído e Finalizado!" : "Aprovado! Aguardando inserção do número.");
    }
};
