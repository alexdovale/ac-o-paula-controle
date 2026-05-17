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
                // ⭐ Correção 1: Inicializa explicitamente na biblioteca global assim que carrega
                window.emailjs.init(this.publicKey);
                resolve();
            };
            script.onerror = reject;
            document.head.appendChild(script);
        });
    },

    async sendDelegationEmail(toEmail, toName, assistedName, senderName, pautaId, assistidoId, delegationToken) {
        if (!toEmail || !toEmail.includes('@')) {
            console.error("❌ Envio cancelado: E-mail inválido ou ausente.");
            if (window.showNotification) {
                window.showNotification(`O colaborador ${toName} não possui e-mail válido cadastrado no sistema!`, "warning", 6000);
            } else {
                alert(`Erro: O colaborador ${toName} está sem e-mail cadastrado no banco.`);
            }
            return false;
        }

        try {
            await this.loadEmailJSLibrary(); // Garante que a biblioteca existe e está inicializada

            let baseUrl = window.location.origin + window.location.pathname;
            if (!baseUrl.endsWith('atendimento_externo.html')) {
                const ultimoSlash = baseUrl.lastIndexOf('/');
                baseUrl = baseUrl.substring(0, ultimoSlash + 1) + 'atendimento_externo.html';
            }

            const delegationLink = `${baseUrl}?pautaId=${pautaId}&assistidoId=${assistidoId}&colab=${encodeURIComponent(toName)}&token=${delegationToken}`;
            
            console.log("🔗 Link gerado para e-mail:", delegationLink);

            const templateParams = {
                to_email: toEmail,
                to_name: toName,
                sender_name: senderName,
                assisted_name: assistedName,
                link_atendimento: delegationLink
            };

            // ⭐ Correção 2: Passa a publicKey como o 4º parâmetro para blindar contra qualquer falha de escopo
            await window.emailjs.send(this.serviceId, this.templateId, templateParams, this.publicKey);
            console.log(`✅ Notificação entregue com sucesso para o e-mail: ${toEmail}`);
            return true;

        } catch (error) {
            console.error("❌ Falha crítica no servidor EmailJS:", error);
            
            if (window.showNotification) {
                window.showNotification(`Falha técnica no EmailJS ao notificar ${toName}. Verifique as credenciais ou limite de cotas.`, "error", 7000);
            } else {
                alert(`⚠️ O servidor de e-mail falhou ao enviar a notificação para ${toName}.`);
            }
            
            return false;
        }
    }
};

window.EmailService = EmailService;
