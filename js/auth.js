import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut, 
    sendPasswordResetEmail 
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
            console.error("Login erro:", error);
            showNotification(this.getErrorMessage(error.code), "error");
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Entrar';
            }
        }
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
            
            // Força o logout imediatamente, pois o usuário ainda é 'pending'
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

                // Acesso Aprovado - Configura a Sessão Local
                app.currentUser = { uid: user.uid, email: user.email, ...userData };
                app.currentUserName = userData.nome || user.email.split('@')[0];
                
            } else {
                // Cenário raro: o usuário foi criado no Firebase Console, mas não possui doc correspondente no Firestore.
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
            showNotification("Erro ao validar seu perfil de acesso.", "error");
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

        if (!emailValue) return; // Usuário cancelou ou deixou em branco

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
    },

    getErrorMessage(errorCode) {
        switch (errorCode) {
            case 'auth/invalid-email': return 'O e-mail digitado não é válido.';
            case 'auth/user-disabled': return 'Este usuário foi desativado por um administrador.';
            case 'auth/user-not-found': return 'Não encontramos uma conta cadastrada com este e-mail.';
            case 'auth/wrong-password': return 'Senha incorreta. Tente novamente.';
            case 'auth/email-already-in-use': return 'Este e-mail já está sendo utilizado por outra conta.';
            case 'auth/weak-password': return 'A senha informada é muito fraca (use no mínimo 6 caracteres).';
            case 'auth/invalid-credential': return 'E-mail ou senha incorretos.';
            case 'auth/too-many-requests': return 'Muitas tentativas falhas. Tente novamente mais tarde.';
            case 'auth/network-request-failed': return 'Erro de conexão. Verifique sua internet.';
            default: return `Ocorreu um erro na autenticação (${errorCode}).`;
        }
    }
};
