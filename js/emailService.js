// js/emailService.js

// Importa as funções necessárias do Firebase Functions, App e Auth
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js"; // <-- ADICIONADO: Importação do Auth
import { firebaseConfig } from './config.js'; 
import { showNotification } from './utils.js'; 

const firebaseApp = window.app?.firebaseApp || initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp); // <-- ADICIONADO: Força o Firebase a carregar a sessão ativa
const functions = getFunctions(firebaseApp);

const generateExternalAccessJwt = httpsCallable(functions, 'generateExternalAccessJwt');

export const EmailService = {
    async sendDelegationEmail(emailDestino, nomeColaborador, nomeAssistido, quemDelegou, pautaId, assistedId) {
        if (!emailDestino || !pautaId || !assistedId) {
            showNotification("Dados incompletos para enviar o email de delegação.", "error");
            throw new Error("Missing email, pautaId, or assistedId for delegation email.");
        }

        // <-- ADICIONADO: Trava para garantir que o frontend sabe que você está logado
        if (!auth.currentUser) {
            console.error("Tentativa de gerar link sem usuário logado no frontend.");
            showNotification("Sessão não identificada. Por favor, atualize a página ou faça login novamente.", "error");
            throw new Error("Usuário não autenticado no frontend.");
        }

        // 1. Gerar o JWT via Cloud Function
        let token;
        try {
            const result = await generateExternalAccessJwt({ pautaId, assistedId, collaboratorName: nomeColaborador });
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

        // 2. Construir o URL com o token
        const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
        const urlFinal = `${baseUrl}/atendimento_externo.html?token=${token}`; 

        // 3. Preparar os dados para o EmailJS
        const templateParams = {
            to_email: emailDestino,
            to_name: nomeColaborador,
            from_name: quemDelegou,
            assisted_name: nomeAssistido,
            delegation_link: urlFinal
        };

        // 4. Enviar o email via EmailJS
        try {
            // ATENÇÃO: Lembre-se de substituir 'YOUR_SERVICE_ID' e 'YOUR_TEMPLATE_ID' 
            // pelas suas chaves reais do painel do EmailJS antes de testar!
            await emailjs.send('YOUR_SERVICE_ID', 'YOUR_TEMPLATE_ID', templateParams);
            showNotification(`Link de delegação enviado para ${emailDestino}.`, "success");
            console.log("Email de delegação enviado:", urlFinal);
            return true;
        } catch (error) {
            console.error("Erro ao enviar e-mail de delegação:", error);
            showNotification("Falha no envio do e-mail de delegação. Verifique as configurações do EmailJS.", "error");
            throw error;
        }
    }
};
