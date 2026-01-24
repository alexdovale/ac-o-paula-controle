// js/emailService.js
import { emailJsConfig } from './config.js';

/**
 * Envia o link de finalização para um colaborador via e-mail
 */
export const sendDelegationEmail = async (params) => {
    const { 
        toEmail, 
        assistedName, 
        collaboratorName, 
        pautaId, 
        assistedId, 
        senderName, 
        senderEmail 
    } = params;

    // Gera o link dinâmico
    const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
    const externalLink = `${baseUrl}/atendimento_externo.html?pautaId=${pautaId}&assistidoId=${assistedId}&collaboratorName=${encodeURIComponent(collaboratorName)}`;

    return emailjs.send(
        emailJsConfig.serviceId,
        emailJsConfig.templates.delegacao,
        {
            to_email: toEmail,
            assisted_name: assistedName,
            collaborator_name: collaboratorName,
            finalization_link: externalLink,
            name: senderName,
            email: senderEmail
        }
    );
};

/**
 * Envia as anotações da pauta por e-mail
 */
export const sendNotesByEmail = async (notes, senderName, senderEmail) => {
    if (!notes) return;

    return emailjs.send(
        emailJsConfig.serviceId,
        emailJsConfig.templates.anotacoes,
        {
            message: notes,
            email_to: senderEmail, // Geralmente envia para o próprio usuário
            name: senderName,
            email: senderEmail
        }
    );
};
