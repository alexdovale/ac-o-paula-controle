
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut, 
    sendPasswordResetEmail,
    multiFactor,
    PhoneAuthProvider,
    PhoneMultiFactorGenerator,
    RecaptchaVerifier,
    TotpMultiFactorGenerator,
    TotpSecret
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showNotification } from './utils.js';
import { UIService } from './ui.js';

export const AuthService = {
    
    async login(app) {
        const emailInput = document.getElementById('login-email');
        const passwordInput = document.getElementById('login-password');
        const btn = document.getElementById('login-btn');
        
        if (!emailInput || !passwordInput) return;
        
        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!email || !password) {
            return showNotification("Preencha todos os campos para entrar.", "warning");
        }

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<span class="animate-spin inline-block mr-2">↻</span> Entrando...`;
        }
        
        try {
            await signInWithEmailAndPassword(app.auth, email, password);
            // O redirecionamento é feito automaticamente pelo listener onAuthStateChanged no main.js
        } catch (error) {
            // Intercepta o erro se a conta exigir 2FA (MFA)
            if (error.code === 'auth/multi-factor-auth-required') {
                await this.handleMfaLogin(error, app);
            } else {
                console.error("Login erro:", error);
                showNotification(this.getErrorMessage(error.code), "error");
            }
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Entrar';
            }
        }
    },

    // Novo fluxo: Intercepta o login quando o 2FA está ativo
    async handleMfaLogin(error, app) {
        const resolver = multiFactor(app.auth).getResolver(error);
        
        // Verifica se há métodos MFA disponíveis para este utilizador
        if (resolver.hints.length === 0) {
            showNotification("Erro no 2FA: Nenhum método de verificação encontrado.", "error");
            return;
        }

        // Procura por TOTP (Google Authenticator / Authy) como método preferencial
        const totpHint = resolver.hints.find(hint => hint.factorId === TotpMultiFactorGenerator.FACTOR_ID);

        if (totpHint) {
            // O utilizador já cadastrou TOTP antes, então pede o código.
            const codigo = await this.showMfaCodePrompt("Verificação em 2 Fatores", "Abra seu aplicativo autenticador e digite o código de 6 dígitos.");
            if (!codigo) {
                showNotification("Login cancelado.", "warning");
                return;
            }

            try {
                const multiFactorAssertion = TotpMultiFactorGenerator.assertionForSignIn(totpHint.uid, codigo);
                await resolver.resolveSignIn(multiFactorAssertion);
                showNotification("Login confirmado com sucesso!", "success");
            } catch (mfaError) {
                console.error("Erro no MFA:", mfaError);
                showNotification("Código inválido. Tente novamente.", "error");
                await this.logout(app.auth);
            }
        } else {
             // Caso caia num cenário onde tem MFA mas não é TOTP, avisa o utilizador
             showNotification("Método MFA atual não suportado por esta interface. Contate o administrador.", "error");
             await this.logout(app.auth);
        }
    },

    // Modal para pedir os 6 dígitos do 2FA
    showMfaCodePrompt(title, message) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[9999] px-4 opacity-0 transition-opacity duration-300';
            
            const modal = document.createElement('div');
            modal.className = 'bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl transform scale-95 transition-all duration-300 text-center';
            
            modal.innerHTML = `
                <div class="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                </div>
                <h3 class="text-xl font-bold text-slate-800 mb-2">${title}</h3>
                <p class="text-sm text-slate-600 mb-5 leading-relaxed">${message}</p>
                <input type="text" id="mfa-code-input" class="w-full px-4 py-3 text-center text-2xl tracking-[0.5em] font-mono rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 mb-6 outline-none transition-all shadow-sm" placeholder="------" maxlength="6" autocomplete="one-time-code">
                <div class="flex gap-3 justify-center">
                    <button id="mfa-cancel" class="px-5 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors text-sm font-bold w-full">Cancelar</button>
                    <button id="mfa-confirm" class="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors text-sm font-bold shadow-md w-full">Verificar</button>
                </div>
            `;

            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            requestAnimationFrame(() => {
                overlay.classList.remove('opacity-0');
                modal.classList.remove('scale-95');
            });

            const input = modal.querySelector('#mfa-code-input');
            const btnCancel = modal.querySelector('#mfa-cancel');
            const btnConfirm = modal.querySelector('#mfa-confirm');

            // Formata input para apenas números
            input.addEventListener('input', (e) => {
                e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 6);
            });

            setTimeout(() => input.focus(), 150);

            const closeModal = (value) => {
                overlay.classList.add('opacity-0');
                modal.classList.add('scale-95');
                setTimeout(() => overlay.remove(), 300);
                resolve(value);
            };

            btnCancel.addEventListener('click', () => closeModal(null));
            btnConfirm.addEventListener('click', () => closeModal(input.value.trim()));
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') closeModal(input.value.trim());
            });
        });
    },

    // Modal de SETUP (Enrolment) do 2FA - Exibe o QR Code
    async setupMFA(app, user) {
        try {
            // Gera um segredo TOTP para o utilizador autenticado
            const multiFactorSession = await multiFactor(user).getSession();
            const totpSecret = await TotpMultiFactorGenerator.generateSecret(multiFactorSession);
            
            // Vai buscar o nome do órgão (se existir) para colocar no Google Authenticator
            let orgaoId = 'SIGEP';
            try {
                const userDoc = await getDoc(doc(app.db, "users", user.uid));
                if (userDoc.exists() && userDoc.data().orgaoId) {
                    orgaoId = userDoc.data().orgaoId;
                }
            } catch (e) {}

            // Gera a URI para o QR Code
            const qrUri = totpSecret.generateQrCodeUrl(user.email, orgaoId);

            // Abre o modal interativo para o utilizador ler o código
            const codigo = await this.showMfaSetupPrompt(qrUri, totpSecret.secretKey);
            
            if (!codigo) {
                showNotification("Configuração do 2FA cancelada.", "warning");
                return false;
            }

            // O utilizador leu o QR Code e digitou os 6 números. Vamos finalizar a configuração:
            const multiFactorAssertion = TotpMultiFactorGenerator.assertionForEnrollment(totpSecret, codigo);
            
            // Ativa o 2FA definitivamente na conta Firebase
            await multiFactor(user).enroll(multiFactorAssertion, 'Google Authenticator');
            
            showNotification("Segurança 2FA ativada com sucesso!", "success");
            return true;

        } catch (error) {
            console.error("Erro ao configurar MFA:", error);
            showNotification("Falha ao configurar a Autenticação em 2 Fatores.", "error");
            return false;
        }
    },

    showMfaSetupPrompt(qrUri, textSecret) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 opacity-0 transition-opacity duration-300';
            
            const modal = document.createElement('div');
            modal.className = 'bg-white rounded-2xl w-full max-w-lg shadow-2xl transform scale-95 transition-all duration-300 flex flex-col max-h-[90vh] overflow-hidden';
            
            modal.innerHTML = `
                <div class="bg-indigo-600 px-6 py-4 flex justify-between items-center shrink-0">
                    <h3 class="text-white font-bold text-lg flex items-center gap-2">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                        Proteja sua Conta (2FA)
                    </h3>
                </div>
                
                <div class="p-6 overflow-y-auto bg-slate-50 space-y-6">
                    <div class="text-center">
                        <p class="text-sm text-slate-600 font-medium">Baixe o <b>Google Authenticator</b> ou <b>Authy</b> no seu celular e escaneie o código abaixo:</p>
                    </div>

                    <div class="flex justify-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm mx-auto w-fit">
                        <div id="mfa-qrcode" class="p-2 bg-white"></div>
                    </div>

                    <div class="text-center">
                        <p class="text-xs text-slate-500 mb-1">Não consegue escanear? Digite o código manualmente no app:</p>
                        <code class="bg-slate-200 px-3 py-1.5 rounded font-mono text-xs text-slate-800 font-bold select-all">${textSecret}</code>
                    </div>

                    <div class="pt-4 border-t border-slate-200">
                        <label class="block text-sm font-bold text-slate-700 mb-2 text-center">Digite o código de 6 dígitos gerado no app:</label>
                        <input type="text" id="mfa-setup-code" class="w-full sm:w-2/3 mx-auto block px-4 py-3 text-center text-2xl tracking-[0.5em] font-mono rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all shadow-sm" placeholder="------" maxlength="6" autocomplete="one-time-code">
                    </div>
                </div>

                <div class="p-4 bg-white border-t border-slate-200 flex justify-end gap-3 shrink-0">
                    <button id="mfa-setup-cancel" class="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors text-sm">Pular por enquanto</button>
                    <button id="mfa-setup-confirm" class="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors shadow-md text-sm">Ativar Segurança</button>
                </div>
            `;

            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            // Gera o QR Code visual recorrendo à biblioteca externa no index.html
            const qrcodeContainer = modal.querySelector('#mfa-qrcode');
            new QRCode(qrcodeContainer, {
                text: qrUri,
                width: 180,
                height: 180,
                colorDark : "#000000",
                colorLight : "#ffffff",
                correctLevel : QRCode.CorrectLevel.M
            });

            requestAnimationFrame(() => {
                overlay.classList.remove('opacity-0');
                modal.classList.remove('scale-95');
            });

            const input = modal.querySelector('#mfa-setup-code');
            const btnCancel = modal.querySelector('#mfa-setup-cancel');
            const btnConfirm = modal.querySelector('#mfa-setup-confirm');

            input.addEventListener('input', (e) => {
                e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 6);
            });

            const closeModal = (value) => {
                overlay.classList.add('opacity-0');
                modal.classList.add('scale-95');
                setTimeout(() => overlay.remove(), 300);
                resolve(value);
            };

            btnCancel.addEventListener('click', () => closeModal(null));
            btnConfirm.addEventListener('click', () => closeModal(input.value.trim()));
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') closeModal(input.value.trim());
            });
        });
    },

    async register(app) {
        const nameInput = document.getElementById('register-name');
        const emailInput = document.getElementById('register-email');
        const passwordInput = document.getElementById('register-password');
        const btn = document.getElementById('register-btn');

        if (!nameInput || !emailInput || !passwordInput) return;
        
        const nome = nameInput.value.trim();
        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!nome || !email || !password) {
            return showNotification("Preencha todos os campos.", "warning");
        }
        if (password.length < 6) {
            return showNotification("A senha deve ter no mínimo 6 caracteres.", "warning");
        }

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<span class="animate-spin inline-block mr-2">↻</span> Criando conta...`;
        }

        try {
            // Criação da conta no Authentication
            const userCredential = await createUserWithEmailAndPassword(app.auth, email, password);
            const user = userCredential.user;

            // 🛡️ SEGURANÇA (Hardcoded Role Assignment):
            // O payload é construído no servidor forçando 'user' e 'pending'. 
            // Invasores não conseguem forjar requisições via console do navegador com {role: 'admin'}
            await setDoc(doc(app.db, "users", user.uid), {
                nome: nome,
                email: email,
                role: 'user',        // Perfil restrito obrigatório
                status: 'pending',   // Bloqueado até aprovação de admin
                createdAt: new Date().toISOString()
            });

            showNotification("Conta criada com sucesso! Aguarde a aprovação do administrador.", "success", 5000);
            
            // Força o logout imediatamente, pois o utilizador ainda é 'pending'
            await this.logout(app.auth); 
            
            if (typeof UIService.toggleAuthTabs === 'function') {
                UIService.toggleAuthTabs('login');
            }
            
            // Limpa formulário
            nameInput.value = '';
            emailInput.value = '';
            passwordInput.value = '';

        } catch (error) {
            console.error("Erro no registro:", error);
            showNotification(this.getErrorMessage(error.code), "error");
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Criar Conta';
            }
        }
    },

    async handleAuthState(app, user) {
        try {
            // 🚀 PERFORMANCE OTIMIZADA: Apenas uma leitura direta e objetiva no Firestore
            const userDoc = await getDoc(doc(app.db, "users", user.uid));
            
            if (userDoc.exists()) {
                const userData = userDoc.data();
                
                // Valida o status do cadastro (Default Deny/Acesso Pendente)
                if (userData.status === 'pending') {
                    showNotification("Sua conta está em análise e aguarda aprovação de um Administrador.", "warning", 6000);
                    await this.logout(app.auth);
                    return;
                }
                
                if (userData.status === 'rejected') {
                    showNotification("Seu acesso ao sistema foi recusado.", "error", 6000);
                    await this.logout(app.auth);
                    return;
                }

                // ==========================================
                // 🔥 NOVA LÓGICA: VERIFICA OBRIGATORIEDADE DE 2FA
                // ==========================================
                const enrolledMfaFactors = multiFactor(user).enrolledFactors;
                const hasMfa = enrolledMfaFactors.length > 0;
                
                // Se o admin exigiu 2FA (no admin.js) e o utilizador ainda não ativou
                if (userData.permissoesDetalhadas?.exigir_2fa === true && !hasMfa) {
                    showNotification("Seu administrador exige que ative a verificação em 2 fatores.", "warning");
                    
                    const configurado = await this.setupMFA(app, user);
                    
                    if (!configurado) {
                        // Se o admin exige, mas o utilizador cancelou o modal do QR Code, bloqueia a entrada.
                        showNotification("Acesso negado: Deve configurar o 2FA para entrar no sistema.", "error");
                        await this.logout(app.auth);
                        return;
                    }
                }

                // Acesso Aprovado - Configura a Sessão Local
                app.currentUser = { uid: user.uid, email: user.email, ...userData };
                app.currentUserName = userData.nome || user.email.split('@')[0];
                
            } else {
                // Cenário raro: o utilizador foi criado no Firebase Console, mas não possui doc no Firestore.
                console.warn("Perfil Firestore não encontrado. Criando base de restrição (pending).");
                await setDoc(doc(app.db, "users", user.uid), {
                    nome: user.email.split('@')[0],
                    email: user.email,
                    role: 'user',
                    status: 'pending',
                    createdAt: new Date().toISOString()
                });
                
                showNotification("Perfil estruturado no banco, aguardando aprovação.", "info");
                await this.logout(app.auth);
            }
        } catch (error) {
            console.error("Auth state error:", error);
            showNotification("Erro ao validar o seu perfil de acesso.", "error");
        }
    },

    async logout(auth) {
        try {
            await signOut(auth);
            
            // Limpa dados em cache do localStorage para evitar fantasmas na troca de contas
            localStorage.removeItem('sigep_current_mode');
            localStorage.removeItem('sigep_unidade_ativa');
            localStorage.removeItem('sigep_app_state');
            localStorage.removeItem('lastPautaId');
            
        } catch (error) {
            console.error("Erro ao deslogar:", error);
        }
    },

    async resetPassword(auth) {
        const loginEmailInput = document.getElementById('login-email');
        let emailValue = loginEmailInput ? loginEmailInput.value.trim() : '';

        // Se o email não estiver no input de login, abre um modal interativo no lugar do prompt nativo
        if (!emailValue) {
            emailValue = await this.showCustomPrompt(
                "Redefinir Senha", 
                "Digite o seu e-mail cadastrado. Enviaremos um link seguro para a criação de uma nova senha."
            );
        }

        if (!emailValue) return; // Utilizador cancelou ou deixou em branco

        try {
            await sendPasswordResetEmail(auth, emailValue);
            showNotification("E-mail de recuperação enviado! Verifique sua caixa de entrada e spam.", "success");
        } catch (error) {
            console.error("Erro ao resetar senha:", error);
            showNotification(this.getErrorMessage(error.code), "error");
        }
    },

    showCustomPrompt(title, message) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[9999] px-4 opacity-0 transition-opacity duration-300';
            
            const modal = document.createElement('div');
            modal.className = 'bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl transform scale-95 transition-all duration-300';
            
            modal.innerHTML = `
                <div class="flex items-center gap-3 mb-3 text-indigo-600">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path></svg>
                    <h3 class="text-xl font-bold text-slate-800">${title}</h3>
                </div>
                <p class="text-sm text-slate-600 mb-5 leading-relaxed">${message}</p>
                <input type="email" id="prompt-input" class="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 mb-6 outline-none transition-all shadow-sm" placeholder="seu@email.com" autocomplete="email">
                <div class="flex gap-3 justify-end">
                    <button id="prompt-cancel" class="px-5 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors text-sm font-bold">Cancelar</button>
                    <button id="prompt-confirm" class="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors text-sm font-bold shadow-md">Enviar Link</button>
                </div>
            `;

            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            // Animação de entrada
            requestAnimationFrame(() => {
                overlay.classList.remove('opacity-0');
                modal.classList.remove('scale-95');
            });

            const input = modal.querySelector('#prompt-input');
            const btnCancel = modal.querySelector('#prompt-cancel');
            const btnConfirm = modal.querySelector('#prompt-confirm');

            setTimeout(() => input.focus(), 150);

            const closeModal = (value) => {
                overlay.classList.add('opacity-0');
                modal.classList.add('scale-95');
                setTimeout(() => overlay.remove(), 300);
                resolve(value);
            };

            btnCancel.addEventListener('click', () => closeModal(null));
            btnConfirm.addEventListener('click', () => closeModal(input.value.trim()));
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') closeModal(input.value.trim());
            });
        });
    },

    setupEvents(app) {
        document.getElementById('login-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.login(app);
        });

        document.getElementById('register-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.register(app);
        });

        document.getElementById('forgot-password-link')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.resetPassword(app.auth);
        });

        document.getElementById('login-tab-btn')?.addEventListener('click', () => {
            if (typeof UIService.toggleAuthTabs === 'function') UIService.toggleAuthTabs('login');
        });

        document.getElementById('register-tab-btn')?.addEventListener('click', () => {
            if (typeof UIService.toggleAuthTabs === 'function') UIService.toggleAuthTabs('register');
        });

        document.querySelectorAll('#logout-btn-main, #logout-btn-app, .logout-action').forEach(btn => {
            if (btn) btn.addEventListener('click', () => this.logout(app.auth));
        });

        // Evento do novo link da tela de login para o 2FA
        document.getElementById('info-2fa-login-link')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.showCustomPrompt(
                "Autenticação em 2 Fatores (2FA)",
                "Para aceder com o seu 2FA ou configurar a aplicação de autenticação, insira o seu e-mail e senha normalmente e clique em 'Entrar'. O sistema solicitará o código de segurança no passo seguinte."
            ).then(() => {
                document.getElementById('login-email')?.focus();
            });
        });
    },

    getErrorMessage(errorCode) {
        switch (errorCode) {
            case 'auth/invalid-email': return 'O e-mail digitado não é válido.';
            case 'auth/user-disabled': return 'Este utilizador foi desativado por um administrador.';
            case 'auth/user-not-found': return 'Não encontrámos uma conta registada com este e-mail.';
            case 'auth/wrong-password': return 'Senha incorreta. Tente novamente.';
            case 'auth/email-already-in-use': return 'Este e-mail já está a ser utilizado por outra conta.';
            case 'auth/weak-password': return 'A senha informada é muito fraca (use no mínimo 6 caracteres).';
            case 'auth/invalid-credential': return 'E-mail ou senha incorretos.';
            case 'auth/too-many-requests': return 'Demasiadas tentativas falhadas. Tente novamente mais tarde.';
            case 'auth/network-request-failed': return 'Erro de ligação. Verifique a sua internet.';
            default: return `Ocorreu um erro na autenticação (${errorCode}).`;
        }
    }
};

