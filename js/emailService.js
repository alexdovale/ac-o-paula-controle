import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { firebaseConfig } from './config.js';
import { showNotification } from './utils.js';

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const functions = getFunctions(firebaseApp);

const generateExternalAccessJwt = httpsCallable(functions, 'generateExternalAccessJwt');

export const EmailService = {
    async sendDelegationEmail(emailDestino, nomeColaborador, nomeAssistido, quemDelegou, pautaId, assistedId) {
        // Log de Depuração - Se algum desses for undefined no console, o erro é no pauta.js
        console.log("🚀 Enviando para Cloud Function:", { pautaId, assistedId, nomeColaborador });

        try {
            // O BACKEND ESPERA EXATAMENTE ESTES NOMES:
            const result = await generateExternalAccessJwt({ 
                pautaId: pautaId, 
                assistedId: assistedId, 
                collaboratorName: nomeColaborador 
            });

            const token = result.data.token;
            const baseUrl = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '');
            const urlFinal = `${baseUrl}/atendimento_externo.html?token=${token}`;

            const templateParams = {
                to_email: emailDestino,
                to_name: nomeColaborador,
                from_name: quemDelegou,
                assisted_name: nomeAssistido,
                delegation_link: urlFinal
            };

            await emailjs.send('service_r1nxe6a', 'template_jslp9ny', templateParams);
            showNotification("E-mail enviado com sucesso!", "success");
            return true;
        } catch (error) {
            console.error("❌ Erro detalhado:", error);
            showNotification("Erro nos dados enviados. Verifique o console.", "error");
            throw error;
        }
    }
};
window.EmailService = EmailService;
