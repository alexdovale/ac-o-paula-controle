// js/emailService.js

import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { firebaseConfig } from './config.js';
import { showNotification } from './utils.js';

// Inicialização do Firebase
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const functions = getFunctions(firebaseApp);

// Referência para a Cloud Function
const generateExternalAccessJwt = httpsCallable(functions, 'generateExternalAccessJwt');

export const EmailService = {
    /**
     * Envia um e-mail de delegação gerando um link seguro via JWT.
     */
    async sendDelegationEmail(emailDestino, nomeColaborador, nomeAssistido, quemDelegou, pautaId, assistedId) {
        
        // Log de Depuração para conferir os dados antes do envio
        console.log("🚀 Enviando para Cloud Function:", { 
            pautaId, 
            assistedId, 
            nomeColaborador 
        });

        // Validação básica no frontend para evitar chamadas desnecessárias
        if (!emailDestino || !pautaId || !assistedId || !nomeColaborador) {
            showNotification("Dados insuficientes para gerar o link. Verifique os campos.", "error");
            console.error("❌ Erro: Campos obrigatórios ausentes.");
            return false;
        }

        try {
            // Chamada à Cloud Function - Mapeando os nomes das chaves para o Backend
            const result = await generateExternalAccessJwt({ 
                pautaId: pautaId, 
                assistedId: assistedId, 
                collaboratorName: nomeColaborador // O backend espera 'collaboratorName'
            });

            // Extração do Token gerado
            const token = result.data.token;
            
            // Construção da URL de atendimento externo
            const baseUrl = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '');
            const urlFinal = `${baseUrl}/atendimento_externo.html?token=${token}`;

            // Parâmetros para o EmailJS
            const templateParams = {
                to_email: emailDestino,
                to_name: nomeColaborador,
                from_name: quemDelegou,
                assisted_name: nomeAssistido,
                delegation_link: urlFinal
            };

            // Disparo do e-mail via EmailJS
            // Nota: Os IDs de serviço e template já estão com os seus valores reais fornecidos
            await emailjs.send('service_r1nxe6a', 'template_jslp9ny', templateParams);
            
            showNotification("E-mail enviado com sucesso!", "success");
            console.log("✅ Delegação concluída com sucesso para:", emailDestino);
            
            return true;

        } catch (error) {
            // Tratamento de erros (incluindo erros retornados pela Cloud Function)
            console.error("❌ Erro detalhado no EmailService:", error);
            
            const msgErro = error.details?.message || error.message || "Erro desconhecido.";
            showNotification(`Falha: ${msgErro}`, "error");
            
            throw error;
        }
    }
};

// Exporta para o escopo global para facilitar o acesso por outros scripts legados
window.EmailService = EmailService;
