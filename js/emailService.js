import { showNotification } from './utils.js';

export const EmailService = {
    async sendDelegationEmail(emailDestino, nomeColaborador, nomeAssistido, quemDelegou, pautaId, assistedId) {
        
        // Verificação pré-vôo: garante que nada chegue undefined
        if (!emailDestino || !pautaId || !assistedId || !nomeColaborador) {
            console.error("❌ Erro: Dados insuficientes para delegação.", { pautaId, assistedId, nomeColaborador });
            showNotification("Dados incompletos para enviar o e-mail.", "error");
            return false;
        }

        // 1. Montagem da URL Direta (Substituindo o JWT problemático por parâmetros diretos)
        const baseUrl = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '');
        
        // Passamos pautaId e assistidoId diretamente na URL
        const urlFinal = `${baseUrl}/atendimento_externo.html?pautaId=${pautaId}&assistidoId=${assistedId}&collaboratorName=${encodeURIComponent(nomeColaborador)}`;

        console.log("🔗 Link de delegação gerado:", urlFinal);

        // 2. Parâmetros para o EmailJS (mantendo suas credenciais originais)
        const templateParams = {
            to_email: emailDestino,
            to_name: nomeColaborador,
            from_name: quemDelegou,
            assisted_name: nomeAssistido,
            delegation_link: urlFinal
        };

        try {
            // Tenta enviar usando a biblioteca global do EmailJS inserida no HTML
            if (typeof emailjs !== 'undefined') {
                await emailjs.send('service_r1nxe6a', 'template_jslp9ny', templateParams);
                showNotification("E-mail enviado com sucesso via EmailJS!", "success");
                return true;
            } else {
                throw new Error("Biblioteca EmailJS não foi carregada no HTML.");
            }
        } catch (error) {
            console.warn("⚠️ Falha no EmailJS (Limites ou Erro de API). Ativando plano B...", error);

            // Fallback (Plano B): Se o EmailJS falhar, copia pro WhatsApp ou abre o programa de e-mail do PC
            const mensagem = `Olá ${nomeColaborador},\n\nO(a) assistido(a) *${nomeAssistido}* foi delegado(a) para você por ${quemDelegou}.\n\nAcesse o link abaixo para visualizar e finalizar o atendimento:\n${urlFinal}`;

            try {
                // Tenta copiar para a área de transferência do usuário (Ideal para WhatsApp)
                await navigator.clipboard.writeText(mensagem);
                showNotification("EmailJS falhou, mas o Link foi COPIADO! Cole no WhatsApp do colaborador.", "info", 7000);
            } catch (clipErr) {
                // Fallback final: Abre o Outlook/Mail nativo
                window.location.href = `mailto:${emailDestino}?subject=Atendimento Delegado: ${encodeURIComponent(nomeAssistido)}&body=${encodeURIComponent(mensagem)}`;
                showNotification("Abrindo seu programa de e-mail padrão...", "info");
            }
            
            // Retorna true porque apesar de o EmailJS falhar, a delegação foi feita pelo plano B
            return true; 
        }
    }
};

window.EmailService = EmailService;
