// js/auth.js
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail, reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showNotification } from './utils.js'; // Corrigido: importação específica

export const AuthService = {
    async login(app) {
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const errorDiv = document.getElementById('auth-error');
        
        try {
            await signInWithEmailAndPassword(app.auth, email, password);
            errorDiv.classList.add('hidden');
        } catch (error) {
            console.error("Login failed:", error);
            errorDiv.textContent = 'Email ou senha inválidos.';
            errorDiv.classList.remove('hidden');
        }
    },

    async register(app) {
        const name = document.getElementById('register-name').value;
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        const errorDiv = document.getElementById('auth-error');

        if (password.length < 6) {
            errorDiv.textContent = 'A senha deve ter pelo menos 6 caracteres.';
            errorDiv.classList.remove('hidden');
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

            errorDiv.classList.add('hidden');
            showNotification('Conta criada! Aguarde aprovação.', 'success'); // Agora funciona!
            
            // Mudar para aba de login
            document.getElementById('login-tab-btn').click();

        } catch (error) {
            console.error("Registration failed:", error);
            errorDiv.textContent = error.code === 'auth/email-already-in-use' 
                ? 'Este email já está em uso.' 
                : 'Ocorreu um erro ao criar a conta.';
            errorDiv.classList.remove('hidden');
        }
    },

    logout(auth) {
        signOut(auth).catch(error => {
            console.error("Logout error", error);
            showNotification("Erro ao sair.", "error");
        });
    },

    async resetPassword(auth) {
        const email = prompt("Digite seu email para redefinir a senha:");
        if (email) {
            try {
                await sendPasswordResetEmail(auth, email);
                showNotification("Email de redefinição enviado!", "success");
            } catch (error) {
                console.error("Password reset error:", error);
                showNotification("Erro ao enviar email.", "error");
            }
        }
    },

    async handleAuthState(app, user) {
        try {
            const userDocRef = doc(app.db, "users", user.uid);
            const userDoc = await getDoc(userDocRef);

            if (userDoc.exists()) {
                const userData = userDoc.data();
                app.currentUserName = userData.name || user.email;

                // Mostrar botão admin se for admin/superadmin
                const btnAdmin = document.getElementById('admin-panel-btn');
                if (btnAdmin) {
                    const isAdmin = userData.role === 'admin' || userData.role === 'superadmin';
                    btnAdmin.classList.toggle('hidden', !isAdmin);
                }

                if (userData.status === 'approved') {
                    // Usuário aprovado - carregar última pauta ou mostrar seleção
                    const lastPautaId = localStorage.getItem('lastPautaId');
                    
                    if (lastPautaId) {
                        try {
                            const pautaRef = doc(app.db, "pautas", lastPautaId);
                            const pautaSnap = await getDoc(pautaRef);
                            
                            if (pautaSnap.exists() && pautaSnap.data().members.includes(user.uid)) {
                                await app.loadPauta(lastPautaId, pautaSnap.data().name, pautaSnap.data().type);
                                return;
                            }
                        } catch (e) {
                            console.warn("Erro ao carregar última pauta:", e);
                        }
                    }
                    
                    // Se não carregou a última pauta, mostra seleção
                    const { PautaService } = await import('./pauta.js');
                    PautaService.showPautaSelectionScreen(app);
                    
                } else {
                    // Usuário pendente
                    document.getElementById('loading-container').classList.remove('hidden');
                    document.getElementById('login-container').classList.add('hidden');
                    
                    const loadingText = document.getElementById('loading-text');
                    loadingText.innerHTML = `
                        <div class="text-center">
                            <p class="text-xl font-bold text-orange-600">Acesso Pendente</p>
                            <p class="mt-2 text-gray-600">Olá, <b>${app.currentUserName}</b>!</p>
                            <p class="text-sm text-gray-500">Sua conta foi criada, mas um administrador precisa aprová-la para você acessar o sistema.</p>
                            <button onclick="app.auth.signOut()" class="mt-6 bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300">Sair / Trocar de Conta</button>
                        </div>
                    `;
                    document.querySelector('.loader').style.display = 'none';
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

    async reauthenticate(user, password) {
        const credential = EmailAuthProvider.credential(user.email, password);
        return await reauthenticateWithCredential(user, credential);
    }
};
