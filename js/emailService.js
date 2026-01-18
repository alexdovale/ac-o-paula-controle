// js/emailService.js
import { emailJsConfig } from './config.js';

export const sendDelegationEmail = async (toEmail, assistedName, collaboratorName, link, senderName) => {
    return emailjs.send(
        emailJsConfig.serviceId,
        emailJsConfig.templates.delegacao,
        {
            to_email: toEmail,
            assisted_name: assistedName,
            collaborator_name: collaboratorName,
            finalization_link: link,
            sender_name: senderName
        }
    );
};

export const sendNotesEmail = async (notes, senderName, userEmail) => {
    if (!notes) return;
    return emailjs.send(
        emailJsConfig.serviceId,
        emailJsConfig.templates.anotacoes,
        {
            notes_content: notes,
            sender_name: senderName,
            reply_to: userEmail
        }
    );
};
