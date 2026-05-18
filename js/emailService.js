// js/emailService.js - MOTOR DE DISPARO DE E-MAILS (SIGEP)

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

            // ⭐ BLINDAGEM: Se alguma variável vier nula do banco, injetamos um texto padrão
            // para evitar o erro "One or more dynamic variables are corrupted" no EmailJS
            const templateParams = {
                to_email: toEmail,
                to_name: toName || 'Colaborador(a)',
                sender_name: senderName || 'Equipe SIGEP',
                assisted_name: assistedName || 'Assistido(a)',
                link_atendimento: delegationLink,
                system_name: 'SIGEP' // Variável de apoio para o Remetente
            };

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
