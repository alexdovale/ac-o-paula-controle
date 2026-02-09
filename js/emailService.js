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

    // --- CONSTRUÇÃO SEGURA DO LINK ---
    // Pega o endereço base do site (ex: https://alexdovale.github.io/ac-o-paula-controle/)
    const pathParts = window.location.pathname.split('/');
    pathParts.pop(); // Remove o 'index.html'
    const baseUrl = window.location.origin + pathParts.join('/') + '/';
    
    // Verifique se o seu arquivo se chama 'atendimento_externo.html' ou 'colaborador.html'
    // Mude o nome abaixo se necessário:
    const fileName = 'atendimento_externo.html'; 

    const externalLink = `${baseUrl}${fileName}?pautaId=${pautaId}&assistidoId=${assistedId}&collaboratorName=${encodeURIComponent(collaboratorName || '')}`;

    console.log("Link gerado:", externalLink); // Para você conferir no console (F12)

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
            email_to: senderEmail,
            name: senderName,
            email: senderEmail
        }
    );
};
