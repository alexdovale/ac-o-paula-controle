// js/emailService.js

// Importa as funções necessárias do Firebase Functions e do app
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js"; // Para garantir que o app está inicializado
import { firebaseConfig } from './config.js'; // Sua configuração do Firebase
import { showNotification } from './utils.js'; // Para notificações

// Garante que o app do Firebase está inicializado. Se window.app já existe, usa ele.
// Caso contrário, inicializa um novo app (útil se este script for executado fora do contexto do main.js)
const firebaseApp = window.app?.firebaseApp || initializeApp(firebaseConfig);
const functions = getFunctions(firebaseApp);

// Cria a referência para a Cloud Function que gera o JWT
const generateExternalAccessJwt = httpsCallable(functions, 'generateExternalAccessJwt');

export const EmailService = {
    /**
     * Envia um email com o link de delegação para o atendimento externo.
     * Antes de enviar o email, solicita um JWT da Cloud Function.
     * @param {string} emailDestino - E-mail do destinatário.
     * @param {string} nomeColaborador - Nome do colaborador que receberá o link.
     * @param {string} nomeAssistido - Nome do assistido.
     * @param {string} quemDelegou - Nome do usuário que está delegando.
     * @param {string} pautaId - ID da pauta.
     * @param {string} assistedId - ID do assistido.
     */
    async sendDelegationEmail(emailDestino, nomeColaborador, nomeAssistido, quemDelegou, pautaId, assistedId) {
        if (!emailDestino || !pautaId || !assistedId) {
            showNotification("Dados incompletos para enviar o email de delegação.", "error");
            throw new Error("Missing email, pautaId, or assistedId for delegation email.");
        }

        // 1. Gerar o JWT via Cloud Function
        let token;
        try {
            // Chama a Cloud Function para gerar o JWT
            const result = await generateExternalAccessJwt({ pautaId, assistedId, collaboratorName: nomeColaborador });
            token = result.data.token; // O token virá no campo 'data.token' da resposta da CF
            if (!token) {
                throw new Error("Token de segurança não foi gerado pela Cloud Function.");
            }
            showNotification("Token de segurança gerado com sucesso.", "info");
        } catch (error) {
            console.error("Erro ao gerar token de acesso externo:", error);
            // Erros da Cloud Function vêm como HttpsError, então podemos extrair a mensagem
            const errorMessage = error.details?.message || error.message || "Erro desconhecido.";
            showNotification(`Falha ao gerar link seguro: ${errorMessage}`, "error");
            throw error; // Re-lança o erro para o chamador
        }

        // 2. Construir o URL com o token
        const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
        const urlFinal = `${baseUrl}/atendimento_externo.html?token=${token}`; // Inclui o token na URL

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
            // Certifique-se de que window.emailjs está carregado no index.html
            // e que 'YOUR_SERVICE_ID' e 'YOUR_TEMPLATE_ID' são seus IDs reais.
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
