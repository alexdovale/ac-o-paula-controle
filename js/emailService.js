// js/emailService.js - VERSÃO CORRIGIDA
import { emailJsConfig } from './config.js';
import { showNotification } from './utils.js'; // ✅ Importação correta

export const EmailService = {
    async sendDelegationEmail(to, collaboratorName, assistedName, senderName, pautaId, assistedId) {
        const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
        const link = `${baseUrl}/atendimento_externo.html?pautaId=${pautaId}&assistidoId=${assistedId}&collaboratorName=${encodeURIComponent(senderName)}`;

        try {
            await emailjs.send(emailJsConfig.serviceId, "template_jslp9ny", {
                to_email: to,
                to_name: collaboratorName || "Colega",
                assisted_name: assistedName,
                sender_name: senderName,
                link_atendimento: link
            });
            showNotification("E-mail enviado!");
            return true;
        } catch (error) {
            console.error("Erro e-mail:", error);
            showNotification("Falha no envio.", "error");
            return false;
        }
    },

    async sendNotesByEmail(notes, userName, userEmail) {
        try {
            await emailjs.send(emailJsConfig.serviceId, "template_notes", {
                to_email: userEmail,
                user_name: userName,
                notes: notes
            });
            showNotification("Anotações enviadas!", "success");
            return true;
        } catch (error) {
            console.error("Erro ao enviar notas:", error);
            showNotification("Erro ao enviar notas.", "error");
            return false;
        }
    }
};
