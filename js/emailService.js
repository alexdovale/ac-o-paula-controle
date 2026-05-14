// js/emailService.js
export const EmailService = {
    // SUAS CREDENCIAIS DO EMAILJS
    publicKey: 'aGL-Q2UJcD2tDpUKq',
    serviceId: 'service_r1nxe6a',
    templateId: 'template_jslp9ny',

    // Função que baixa o EmailJS sozinho se estiver na tela do celular
    async loadEmailJSLibrary() {
        if (typeof window.emailjs !== 'undefined') return;
        console.log("Baixando biblioteca de E-mail...");
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = "https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js";
            script.onload = () => {
                window.emailjs.init(this.publicKey);
                resolve();
            };
            script.onerror = reject;
            document.head.appendChild(script);
        });
    },

    async sendDelegationEmail(toEmail, toName, assistedName, senderName, pautaId, assistidoId, delegationToken) {
        try {
            await this.loadEmailJSLibrary(); // Garante que a biblioteca existe

            const baseUrl = window.location.href.substring(0, window.location.href.indexOf('?')) || window.location.href.substring(0, window.location.href.lastIndexOf('/'));
            const safeBaseUrl = baseUrl.endsWith('.html') ? baseUrl : `${baseUrl}/atendimento_externo.html`;
            
            // Link de segurança completo
            const delegationLink = `${safeBaseUrl}?pautaId=${pautaId}&assistidoId=${assistidoId}&colab=${encodeURIComponent(toName)}&token=${delegationToken}`;
            
            console.log("🔗 Link gerado:", delegationLink);

            const templateParams = {
                to_email: toEmail,
                to_name: toName,
                sender_name: senderName,
                assisted_name: assistedName,
                link_atendimento: delegationLink
            };

            await window.emailjs.send(this.serviceId, this.templateId, templateParams);
            return true;

        } catch (error) {
            console.warn("⚠️ Falha no EmailJS. Ativando plano B...");
            
            // PLANO B: MENSAGEM DO WHATSAPP
            const baseUrl = window.location.href.substring(0, window.location.href.indexOf('?')) || window.location.href.substring(0, window.location.href.lastIndexOf('/'));
            const safeBaseUrl = baseUrl.endsWith('.html') ? baseUrl : `${baseUrl}/atendimento_externo.html`;
            const delegationLink = `${safeBaseUrl}?pautaId=${pautaId}&assistidoId=${assistidoId}&colab=${encodeURIComponent(toName)}&token=${delegationToken}`;
            
            const msg = `Olá ${toName},\n\nO(a) assistido(a) *${assistedName}* foi delegado(a) para você.\n\nAcesse o link seguro abaixo para finalizar o atendimento:\n${delegationLink}`;
            
            const textarea = document.createElement('textarea');
            textarea.value = msg;
            document.body.appendChild(textarea);
            textarea.select();
            
            try {
                document.execCommand('copy');
                if (window.showNotification) {
                    window.showNotification("Erro no e-mail. Link e mensagem copiados para a área de transferência! (Cole no WhatsApp)", "warning", 6000);
                } else {
                    alert("Erro no e-mail. Link copiado! Cole no WhatsApp do colega.");
                }
            } catch (err) {
                console.error("Erro ao copiar:", err);
            }
            
            document.body.removeChild(textarea);
            return false;
        }
    }
};

window.EmailService = EmailService;
