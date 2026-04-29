import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail, reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showNotification } from './utils.js';
import { PautaService } from './pauta.js';

export const AuthService = {
    /**
     * Realiza login do usuário
     */
    async login(app) {
        const email = document.getElementById('login-email')?.value;
        const password = document.getElementById('login-password')?.value;
        const errorDiv = document.getElementById('auth-error');
        
        if (!email || !password) {
            if (errorDiv) {
                errorDiv.textContent = 'Preencha email e senha.';
                errorDiv.classList.remove('hidden');
            }
            return;
        }

        try {
            await signInWithEmailAndPassword(app.auth, email, password);
            if (errorDiv) errorDiv.classList.add('hidden');
        } catch (error) {
            console.error("Login failed:", error);
            if (errorDiv) {
                let mensagem = 'Email ou senha inválidos.';
                if (error.code === 'auth/user-not-found') mensagem = 'Usuário não encontrado.';
                if (error.code === 'auth/wrong-password') mensagem = 'Senha incorreta.';
                if (error.code === 'auth/too-many-requests') mensagem = 'Muitas tentativas. Tente novamente mais tarde.';
                
                errorDiv.textContent = mensagem;
                errorDiv.classList.remove('hidden');
            }
        }
    },

    /**
     * Registra um novo usuário
     */
    async register(app) {
        const name = document.getElementById('register-name')?.value;
        const email = document.getElementById('register-email')?.value;
        const password = document.getElementById('register-password')?.value;
        const errorDiv = document.getElementById('auth-error');

        if (!name || !email || !password) {
            if (errorDiv) {
                errorDiv.textContent = 'Preencha todos os campos.';
                errorDiv.classList.remove('hidden');
            }
            return;
        }

        if (password.length < 6) {
            if (errorDiv) {
                errorDiv.textContent = 'A senha deve ter pelo menos 6 caracteres.';
                errorDiv.classList.remove('hidden');
            }
            return;
        }

        try {
            const userCredential = await createUserWithEmailAndPassword(app.auth, email, password);
            const user = userCredential.user;

            await setDoc(doc(app.db, "users", user.uid), {
                name: name,
                email: email,
                uid: user.uid,
                status: 'pending',
                role: 'user',
                createdAt: new Date().toISOString()
            });

            if (errorDiv) errorDiv.classList.add('hidden');
            showNotification('Conta criada! Aguarde aprovação do administrador.', 'success');
            
            // Mudar para aba de login
            const loginTabBtn = document.getElementById('login-tab-btn');
            if (loginTabBtn) loginTabBtn.click();

        } catch (error) {
            console.error("Registration failed:", error);
            if (errorDiv) {
                let mensagem = 'Ocorreu um erro ao criar a conta.';
                if (error.code === 'auth/email-already-in-use') {
                    mensagem = 'Este email já está em uso.';
                } else if (error.code === 'auth/invalid-email') {
                    mensagem = 'Email inválido.';
                }
                errorDiv.textContent = mensagem;
                errorDiv.classList.remove('hidden');
            }
        }
    },

    /**
     * Faz logout do usuário
     */
    logout(auth) {
        signOut(auth).catch(error => {
            console.error("Logout error", error);
            showNotification("Erro ao sair.", "error");
        });
    },

    /**
     * Envia email para redefinir senha
     */
    async resetPassword(auth) {
        const email = prompt("Digite seu email para redefinir a senha:");
        if (!email) return;
        
        try {
            await sendPasswordResetEmail(auth, email);
            showNotification("Email de redefinição enviado!", "success");
        } catch (error) {
            console.error("Password reset error:", error);
            let mensagem = "Erro ao enviar email.";
            if (error.code === 'auth/user-not-found') {
                mensagem = "Usuário não encontrado.";
            }
            showNotification(mensagem, "error");
        }
    },

    /**
     * Processa o estado de autenticação do usuário
     */
    async handleAuthState(app, user) {
        try {
            const userDocRef = doc(app.db, "users", user.uid);
            const userDoc = await getDoc(userDocRef);

            if (userDoc.exists()) {
                const userData = userDoc.data();
                
                app.currentUser = userData;
                app.currentUserName = userData.name || user.email;

                // Mostrar botão admin azul central se for admin/superadmin
                const btnAdmin = document.getElementById('admin-panel-btn');
                const isAdmin = userData.role === 'admin' || userData.role === 'superadmin';
                
                if (btnAdmin) btnAdmin.classList.toggle('hidden', !isAdmin);
                
                // Força o botão amarelo (duplicado no HTML) a ficar sempre oculto
                const btnAdminMain = document.getElementById('admin-btn-main');
                if (btnAdminMain) btnAdminMain.classList.add('hidden');

                if (userData.status === 'approved') {
                    // Usuário aprovado - carregar última pauta ou mostrar seleção
                    const lastPautaId = localStorage.getItem('lastPautaId');
                    
                    if (lastPautaId) {
                        try {
                            const pautaRef = doc(app.db, "pautas", lastPautaId);
                            const pautaSnap = await getDoc(pautaRef);
                            
                            if (pautaSnap.exists() && pautaSnap.data().members?.includes(user.uid)) {
                                await app.loadPauta(lastPautaId, pautaSnap.data().name, pautaSnap.data().type);
                                return;
                            }
                        } catch (e) {
                            console.warn("Erro ao carregar última pauta:", e);
                        }
                    }
                    
                    // Se não carregou a última pauta, mostra seleção
                    PautaService.showPautaSelectionScreen(app);
                    
                } else {
                    // Usuário pendente
                    const loadingContainer = document.getElementById('loading-container');
                    const loginContainer = document.getElementById('login-container');
                    const loader = document.querySelector('.loader');
                    
                    if (loadingContainer) loadingContainer.classList.remove('hidden');
                    if (loginContainer) loginContainer.classList.add('hidden');
                    
                    const loadingText = document.getElementById('loading-text');
                    if (loadingText) {
                        loadingText.innerHTML = `
                            <div class="text-center">
                                <p class="text-xl font-bold text-orange-600">Acesso Pendente</p>
                                <p class="mt-2 text-gray-600">Olá, <b>${app.currentUserName}</b>!</p>
                                <p class="text-sm text-gray-500">Sua conta foi criada, mas um administrador precisa aprová-la para você acessar o sistema.</p>
                                <button onclick="app.auth.signOut()" class="mt-6 bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300">Sair / Trocar de Conta</button>
                            </div>
                        `;
                    }
                    if (loader) loader.style.display = 'none';
                }
            } else {
                showNotification("Erro ao localizar seu perfil.", "error");
                signOut(app.auth);
            }
        } catch (error) {
            console.error("Erro ao verificar estado do usuário:", error);
            showNotification("Erro de conexão.", "error");
        }
    },

    /**
     * Reautentica o usuário com a senha (para operações sensíveis)
     */
    async reauthenticate(user, password) {
        try {
            const credential = EmailAuthProvider.credential(user.email, password);
            return await reauthenticateWithCredential(user, credential);
        } catch (error) {
            console.error("Erro na reautenticação:", error);
            showNotification("Falha na autenticação.", "error");
            throw error;
        }
    },

    /**
     * Verifica se o usuário está logado
     */
    isAuthenticated() {
        return !!this.currentUser;
    },

    /**
     * Retorna o usuário atual
     */
    getCurrentUser() {
        return this.currentUser;
    }
};
