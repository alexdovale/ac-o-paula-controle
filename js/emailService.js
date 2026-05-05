// js/emailService.js

import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { firebaseConfig } from './config.js';
import { showNotification } from './utils.js';

// Inicialização robusta do Firebase
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const functions = getFunctions(firebaseApp);

const generateExternalAccessJwt = httpsCallable(functions, 'generateExternalAccessJwt');

export const EmailService = {
    async sendDelegationEmail(emailDestino, nomeColaborador, nomeAssistido, quemDelegou, pautaId, assistedId) {
        
        // Verificação pré-vôo: garante que nada chegue undefined na nuvem
        if (!emailDestino || !pautaId || !assistedId || !nomeColaborador) {
            console.error("❌ Erro: Dados insuficientes.", { pautaId, assistedId, nomeColaborador });
            showNotification("Dados incompletos no formulário.", "error");
            return false;
        }

        // 1. Gerar o JWT via Cloud Function
        let token;
        try {
            // MAPEAMENTO CRÍTICO: O backend exige 'collaboratorName' e 'assistedId'
            const dadosParaEnvio = { 
                pautaId: pautaId, 
                assistedId: assistedId, // Verifique se no pauta.js você está passando o ID correto
                collaboratorName: nomeColaborador 
            };

            console.log("🚀 Enviando para Cloud Function:", dadosParaEnvio);

            const result = await generateExternalAccessJwt(dadosParaEnvio);
            token = result.data.token; 
            
            if (!token) throw new Error("Token não retornado pelo servidor.");

        } catch (error) {
            console.error("❌ Erro na geração do Token:", error);
            const msg = error.details?.message || error.message || "Erro de comunicação.";
            showNotification(`Falha ao gerar link: ${msg}`, "error");
            throw error; 
        }

        // 2. Montagem da URL e Envio via EmailJS
        const baseUrl = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '');
        const urlFinal = `${baseUrl}/atendimento_externo.html?token=${token}`; 

        const templateParams = {
            to_email: emailDestino,
            to_name: nomeColaborador,
            from_name: quemDelegou,
            assisted_name: nomeAssistido,
            delegation_link: urlFinal
        };

        try {
            // Utilizando suas credenciais de produção do EmailJS
            await emailjs.send('service_r1nxe6a', 'template_jslp9ny', templateParams);
            showNotification("E-mail enviado com sucesso!", "success");
            return true;
        } catch (error) {
            console.error("❌ Erro no EmailJS:", error);
            showNotification("O link foi gerado, mas o e-mail falhou.", "error");
            throw error;
        }
    }
};

window.EmailService = EmailService;
