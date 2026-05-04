// js/emailService.js

// Importa as funções necessárias do Firebase Functions, App e Auth
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js"; 
import { firebaseConfig } from './config.js'; 
import { showNotification } from './utils.js'; 

// Inicialização do Firebase e Auth
const firebaseApp = window.app?.firebaseApp || initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp); 
const functions = getFunctions(firebaseApp);

// Referência para a Cloud Function que gera o JWT
const generateExternalAccessJwt = httpsCallable(functions, 'generateExternalAccessJwt');

export const EmailService = {
    /**
     * Envia um email com o link de delegação para o atendimento externo.
     */
    async sendDelegationEmail(emailDestino, nomeColaborador, nomeAssistido, quemDelegou, pautaId, assistedId) {
        // Validação básica no frontend
        if (!emailDestino || !pautaId || !assistedId) {
            showNotification("Dados incompletos para enviar o email de delegação.", "error");
            throw new Error("Missing email, pautaId, or assistedId for delegation email.");
        }

        // Garante que existe um usuário logado (necessário para o SDK do Firebase anexar o token)
        if (!auth.currentUser) {
            console.error("Tentativa de gerar link sem usuário logado.");
            showNotification("Sessão não identificada. Faça login novamente.", "error");
            throw new Error("Usuário não autenticado no frontend.");
        }

        let token;
        try {
            // 🕵️ Montagem do pacote para o backend (AJUSTADO: assistedId e collaboratorName)
            const payload = { 
                pautaId: pautaId, 
                assistedId: assistedId, // Nome exato esperado pelo seu functions/index.js
                collaboratorName: nomeColaborador 
            };

            console.log("🕵️ DADOS INDO PARA A NUVEM:", payload);

            // Chama a Cloud Function para gerar o JWT
            const result = await generateExternalAccessJwt(payload);
            token = result.data.token; 

            if (!token) {
                throw new Error("Token de segurança não foi gerado pela Cloud Function.");
            }
            showNotification("Token de segurança gerado com sucesso.", "info");
        } catch (error) {
            console.error("Erro ao gerar token de acesso externo:", error);
            const errorMessage = error.details?.message || error.message || "Erro desconhecido.";
            showNotification(`Falha ao gerar link seguro: ${errorMessage}`, "error");
            throw error; 
        }

        // 2. Construir o URL final com o token gerado
        const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
        const urlFinal = `${baseUrl}/atendimento_externo.html?token=${token}`; 

        // 3. Preparar os dados para o seu Template do EmailJS (template_jslp9ny)
        const templateParams = {
            to_email: emailDestino,
            to_name: nomeColaborador,
            from_name: quemDelegou,
            assisted_name: nomeAssistido,
            delegation_link: urlFinal
        };

        // 4. Enviar o email via EmailJS (usando seu service_r1nxe6a)
        try {
            await emailjs.send('service_r1nxe6a', 'template_jslp9ny', templateParams);
            showNotification(`Link de delegação enviado para ${emailDestino}.`, "success");
            console.log("Email de delegação enviado com sucesso!");
            return true;
        } catch (error) {
            console.error("Erro ao disparar e-mail via EmailJS:", error);
            showNotification("Falha no envio do e-mail. Verifique as configurações do EmailJS.", "error");
            throw error;
        }
    }
};
