// js/emailService.js

import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js"; 
import { firebaseConfig } from './config.js'; 
import { showNotification } from './utils.js'; 

const firebaseApp = window.app?.firebaseApp || initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp); 
const functions = getFunctions(firebaseApp);

const generateExternalAccessJwt = httpsCallable(functions, 'generateExternalAccessJwt');

export const EmailService = {
    async sendDelegationEmail(emailDestino, nomeColaborador, nomeAssistido, quemDelegou, pautaId, assistedId) {
        if (!emailDestino || !pautaId || !assistedId) {
            showNotification("Dados incompletos para enviar o email de delegação.", "error");
            throw new Error("Missing email, pautaId, or assistedId for delegation email.");
        }

        if (!auth.currentUser) {
            showNotification("Sessão expirada. Refaça o login.", "error");
            throw new Error("Usuário não autenticado.");
        }

        let token;
        try {
            // Chamada corrigida para o backend
            const result = await generateExternalAccessJwt({ 
                pautaId: pautaId, 
                assistedId: assistedId, 
                collaboratorName: nomeColaborador 
            });
            
            token = result.data.token; 
            if (!token) throw new Error("Token não gerado.");
            
        } catch (error) {
            console.error("Erro na Cloud Function:", error);
            showNotification("Erro ao gerar link seguro.", "error");
            throw error; 
        }

        const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
        const urlFinal = `${baseUrl}/atendimento_externo.html?token=${token}`; 

        const templateParams = {
            to_email: emailDestino,
            to_name: nomeColaborador,
            from_name: quemDelegou,
            assisted_name: nomeAssistido,
            delegation_link: urlFinal
        };

        try {
            // 🚀 IDs OFICIAIS APLICADOS:
            await emailjs.send('service_r1nxe6a', 'template_jslp9ny', templateParams);
            
            showNotification(`E-mail enviado para ${emailDestino}!`, "success");
            return true;
        } catch (error) {
            console.error("Erro no EmailJS:", error);
            showNotification("Falha ao disparar e-mail via EmailJS.", "error");
            throw error;
        }
    }
};
