import { showNotification } from './utils.js';

// 👇 COLOQUE SUA CHAVE PÚBLICA DO EMAILJS AQUI DENTRO DAS ASPAS 👇
const EMAILJS_PUBLIC_KEY = "aGL-Q2UJcD2tDpUKq"; 

export const EmailService = {
    async sendDelegationEmail(emailDestino, nomeColaborador, nomeAssistido, quemDelegou, pautaId, assistedId, tokenSeguranca) {
        
        if (!emailDestino || !pautaId || !assistedId || !nomeColaborador || !tokenSeguranca) {
            console.error("❌ Erro: Dados insuficientes para delegação.");
            showNotification("Dados incompletos para gerar link seguro.", "error");
            return false;
        }

        const baseUrl = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '');
        
        // 🔒 Link Seguro com Token
        const urlFinal = `${baseUrl}/atendimento_externo.html?pautaId=${pautaId}&assistidoId=${assistedId}&token=${tokenSeguranca}&colab=${encodeURIComponent(nomeColaborador)}`;

        const templateParams = {
            to_email: emailDestino,
            to_name: nomeColaborador,
            from_name: quemDelegou,
            assisted_name: nomeAssistido,
            delegation_link: urlFinal
        };

        try {
            if (typeof emailjs !== 'undefined') {
                // A CHAVE PÚBLICA AGORA É ENVIADA COMO 4º PARÂMETRO PARA AUTORIZAR O ENVIO
                await emailjs.send('service_r1nxe6a', 'template_jslp9ny', templateParams, EMAILJS_PUBLIC_KEY);
                showNotification("E-mail seguro enviado com sucesso!", "success");
                return true;
            } else {
                throw new Error("EmailJS não carregado no HTML.");
            }
        } catch (error) {
            console.warn("⚠️ EmailJS falhou. Gerando cópia segura...", error.message || error);

            const mensagem = `Olá ${nomeColaborador},\n\nO(a) assistido(a) *${nomeAssistido}* foi delegado(a) para você.\n\nAcesse o link seguro abaixo para finalizar o atendimento:\n${urlFinal}`;

            try {
                // Fallback 1: Copia para a área de transferência
                await navigator.clipboard.writeText(mensagem);
                showNotification("Link Seguro COPIADO! Cole no WhatsApp do colaborador.", "info", 7000);
            } catch (clipErr) {
                // Fallback 2: Tenta abrir o app de email padrão da máquina
                window.location.href = `mailto:${emailDestino}?subject=Atendimento Delegado&body=${encodeURIComponent(mensagem)}`;
            }
            return true; 
        }
    }
};

window.EmailService = EmailService;
