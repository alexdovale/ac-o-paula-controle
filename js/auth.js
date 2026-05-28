import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut, 
    sendPasswordResetEmail, 
    reauthenticateWithCredential, 
    EmailAuthProvider 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showNotification, playSound } from './utils.js';
import { PautaService } from './pauta.js';
import { UIService } from './ui.js';

export const AuthService = {
    /**
     * Realiza login do usuário com tratamento para novos códigos do Firebase
     */
    async login(app) {
        const email = document.getElementById('login-email')?.value.trim();
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
            console.error("Login failed:", error.code);
            if (errorDiv) {
                let mensagem = 'Email ou senha inválidos.';
                
                // NOVO: Tratamento para o código unificado do Firebase
                if (error.code === 'auth/invalid-credential') {
                    mensagem = 'E-mail ou senha incorretos.';
                } else if (error.code === 'auth/user-not-found') {
                    mensagem = 'Usuário não encontrado.';
                } else if (error.code === 'auth/wrong-password') {
                    mensagem = 'Senha incorreta.';
                } else if (error.code === 'auth/too-many-requests') {
                    mensagem = 'Muitas tentativas falhas. Tente novamente mais tarde.';
                } else if (error.code === 'auth/network-request-failed') {
                    mensagem = 'Erro de rede. Verifique sua conexão.';
                }
                
                errorDiv.textContent = mensagem;
                errorDiv.classList.remove('hidden');
                playSound('error');
            }
        }
    },

    /**
     * Registra um novo usuário e cria documento no Firestore
     */
    async register(app) {
        const name = document.getElementById('register-name')?.value.trim();
        const email = document.getElementById('register-email')?.value.trim();
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

            // Cria o perfil inicial como 'pending'
            await setDoc(doc(app.db, "users", user.uid), {
                name: name,
                email: email,
                uid: user.uid,
                status: 'pending',
                role: 'user',
                createdAt: new Date().toISOString(),
                preferences: {
                    enableSoundsSuccess: true,
                    enableSoundsError: true,
                    showToastsSuccess: true,
                    showToastsError: true
                }
            });

            if (errorDiv) errorDiv.classList.add('hidden');
            showNotification('Conta criada! Aguarde aprovação do administrador.', 'success');
            
            // Retorna para a aba de login
            const loginTabBtn = document.getElementById('login-tab-btn');
            if (loginTabBtn) loginTabBtn.click();

        } catch (error) {
            console.error("Registration error:", error.code);
            if (errorDiv) {
                let mensagem = 'Erro ao criar conta.';
                if (error.code === 'auth/email-already-in-use') mensagem = 'Este email já está em uso.';
                if (error.code === 'auth/invalid-email') mensagem = 'Email inválido.';
                
                errorDiv.textContent = mensagem;
                errorDiv.classList.remove('hidden');
            }
        }
    },

    /**
     * Faz logout limpando estados
     */
    async logout(auth) {
        try {
            await signOut(auth);
            localStorage.removeItem('lastPautaId');
            localStorage.removeItem('lastPautaType');
        } catch (error) {
            console.error("Logout error", error);
            showNotification("Erro ao sair.", "error");
        }
    },

    /**
     * Envia email de recuperação
     */
    async resetPassword(auth) {
        const email = prompt("Digite seu email para redefinir a senha:");
        if (!email) return;
        
        try {
            await sendPasswordResetEmail(auth, email);
            showNotification("Email de redefinição enviado!", "success");
        } catch (error) {
            console.error("Reset error:", error.code);
            showNotification("Erro ao enviar email de recuperação.", "error");
        }
    },

    /**
     * Gerencia o que o usuário vê baseado no Firestore (Aprovado/Pendente)
     */
    async handleAuthState(app, user) {
        try {
            // --- INÍCIO DA MIGRAÇÃO TEMPORÁRIA ---
            const oldRef = doc(app.db, "users", user.uid);
            const newRef = doc(app.db, "usuarios", user.uid);
            
            const newSnap = await getDoc(newRef);
            
            if (!newSnap.exists()) {
                const oldSnap = await getDoc(oldRef);
                if (oldSnap.exists()) {
                    await setDoc(newRef, oldSnap.data());
                    console.log("Migração de documento concluída para: usuarios/" + user.uid);
                }
            }
            // --- FIM DA MIGRAÇÃO TEMPORÁRIA ---

            // Passa a ler da coleção 'usuarios' para refletir a migração
            const userDocRef = doc(app.db, "usuarios", user.uid);
            const userDoc = await getDoc(userDocRef);

            if (userDoc.exists()) {
                const userData = userDoc.data();
                app.currentUser = userData;
                app.currentUserName = userData.name || user.email;

                // Interface administrativa
                const isAdmin = userData.role === 'admin' || userData.role === 'superadmin';
                document.getElementById('admin-panel-btn')?.classList.toggle('hidden', !isAdmin);

                if (userData.status === 'approved') {
                    // FLUXO USUÁRIO APROVADO
                    const lastPautaId = localStorage.getItem('lastPautaId');
                    
                    if (lastPautaId) {
                        const pautaSnap = await getDoc(doc(app.db, "pautas", lastPautaId));
                        if (pautaSnap.exists() && pautaSnap.data().members?.includes(user.uid)) {
                            await app.loadPauta(lastPautaId, pautaSnap.data().name, pautaSnap.data().type);
                            return;
                        }
                    }
                    app.showPautaSelectionScreen();
                } else {
                    // FLUXO USUÁRIO PENDENTE
                    UIService.showScreen('loading');
                    const loadingText = document.getElementById('loading-text');
                    if (loadingText) {
                        loadingText.innerHTML = `
                            <div class="text-center p-4">
                                <p class="text-xl font-bold text-orange-600">Acesso Pendente</p>
                                <p class="mt-2 text-gray-600">Olá, <b>${app.currentUserName}</b>!</p>
                                <p class="text-xs text-gray-500 mt-2">Sua conta aguarda aprovação de um administrador para liberar o acesso ao SIGEP.</p>
                                <button id="btn-logout-pending" class="mt-6 bg-gray-200 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-300 font-bold transition">
                                    Sair / Trocar de Conta
                                </button>
                            </div>
                        `;
                        // Adiciona o listener ao botão criado dinamicamente
                        document.getElementById('btn-logout-pending')?.addEventListener('click', () => this.logout(app.auth));
                    }
                    const loader = document.querySelector('.loader');
                    if (loader) loader.style.display = 'none';
                }
            } else {
                // Se o documento não existe no Firestore, força logout
                console.warn("Perfil Firestore não encontrado.");
                this.logout(app.auth);
            }
        } catch (error) {
            console.error("Auth state error:", error);
            showNotification("Erro ao validar seu perfil.", "error");
        }
    }
};
