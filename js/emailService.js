// js/emailService.js

import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { firebaseConfig } from './config.js';
import { showNotification } from './utils.js';

// Inicialização
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const functions = getFunctions(firebaseApp);

const generateExternalAccessJwt = httpsCallable(functions, 'generateExternalAccessJwt');

export const EmailService = {
    async sendDelegationEmail(emailDestino, nomeColaborador, nomeAssistido, quemDelegou, pautaId, assistedId) {
        
        // Validação de segurança básica no frontend
        if (!emailDestino || !pautaId || !assistedId || !nomeColaborador) {
            console.error("❌ Campos ausentes:", { emailDestino, pautaId, assistedId, nomeColaborador });
            showNotification("Dados incompletos para enviar o link.", "error");
            return false;
        }

        // 1. Gerar o JWT via Cloud Function
        let token;
        try {
            // 👇 AQUI ESTÁ O INCREMENTO QUE VOCÊ CITOU:
            const dadosParaEnvio = { 
                pautaId: pautaId, 
                assistedId: assistedId, 
                collaboratorName: nomeColaborador // Mapeando para o nome que o backend exige
            };

            console.log("🚀 Enviando dados corrigidos para a Nuvem:", dadosParaEnvio);

            const result = await generateExternalAccessJwt(dadosParaEnvio);
            
            token = result.data.token; 
            
            if (!token) {
                throw new Error("Token de segurança não foi gerado pela Cloud Function.");
            }
            
            console.log("✅ Token gerado com sucesso!");

        } catch (error) {
            console.error("❌ Erro ao gerar token:", error);
            const errorMessage = error.details?.message || error.message || "Erro desconhecido.";
            showNotification(`Falha ao gerar link seguro: ${errorMessage}`, "error");
            throw error; 
        }

        // 2. Construir o URL com o token
        const baseUrl = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '');
        const urlFinal = `${baseUrl}/atendimento_externo.html?token=${token}`; 

        // 3. Preparar e enviar via EmailJS
        const templateParams = {
            to_email: emailDestino,
            to_name: nomeColaborador,
            from_name: quemDelegou,
            assisted_name: nomeAssistido,
            delegation_link: urlFinal
        };

        try {
            // Usando seus IDs reais: service_r1nxe6a e template_jslp9ny
            await emailjs.send('service_r1nxe6a', 'template_jslp9ny', templateParams);
            showNotification("E-mail de delegação enviado!", "success");
            return true;
        } catch (error) {
            console.error("❌ Erro EmailJS:", error);
            showNotification("Falha no envio do e-mail.", "error");
            throw error;
        }
    }
};

window.EmailService = EmailService;
