// js/emailService.js - VERSÃO COMPLETA CORRIGIDA
import { emailJsConfig } from './config.js';
import { showNotification } from './utils.js';

export const EmailService = {
    /**
     * Envia e-mail de delegação para um colaborador finalizar o atendimento
     * @param {string} to - Email do destinatário
     * @param {string} collaboratorName - Nome do colaborador
     * @param {string} assistedName - Nome do assistido
     * @param {string} senderName - Nome de quem enviou
     * @param {string} pautaId - ID da pauta
     * @param {string} assistedId - ID do assistido
     * @returns {Promise<boolean>} - Sucesso ou falha
     */
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
            showNotification("E-mail enviado com sucesso!");
            return true;
        } catch (error) {
            console.error("Erro ao enviar e-mail:", error);
            showNotification("Falha no envio do e-mail.", "error");
            return false;
        }
    },

    /**
     * Envia as anotações da pauta por e-mail (backup)
     * @param {string} notes - Texto das anotações
     * @param {string} userName - Nome do usuário
     * @param {string} userEmail - Email do usuário
     * @returns {Promise<boolean>} - Sucesso ou falha
     */
    async sendNotesByEmail(notes, userName, userEmail) {
        if (!notes || !userEmail) {
            showNotification("Não há anotações ou email para enviar.", "error");
            return false;
        }

        try {
            await emailjs.send(emailJsConfig.serviceId, "template_notes", {
                to_email: userEmail,
                user_name: userName,
                notes: notes,
                date: new Date().toLocaleString('pt-BR')
            });
            showNotification("Anotações enviadas para seu e-mail!", "success");
            return true;
        } catch (error) {
            console.error("Erro ao enviar anotações:", error);
            showNotification("Erro ao enviar anotações.", "error");
            return false;
        }
    }
};
