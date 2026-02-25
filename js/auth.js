import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { Utils } from './utils.js';

export const AuthService = {
    async login(auth, email, password) {
        try {
            await signInWithEmailAndPassword(auth, email, password);
            document.getElementById('auth-error').classList.add('hidden');
        } catch (error) {
            document.getElementById('auth-error').textContent = 'Email ou senha inválidos.';
            document.getElementById('auth-error').classList.remove('hidden');
        }
    },

    async register(auth, db, userData) {
        const { name, email, password } = userData;
        
        if (password.length < 6) {
            Utils.showNotification('A senha deve ter pelo menos 6 caracteres.', 'error');
            return;
        }

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            await setDoc(doc(db, "users", user.uid), {
                name,
                email,
                uid: user.uid,
                status: 'pending',
                role: 'user',
                createdAt: new Date().toISOString()
            });

            Utils.showNotification('Conta criada! Aguarde aprovação.', 'success');
            return true;
        } catch (error) {
            Utils.showNotification(error.code === 'auth/email-already-in-use' 
                ? 'Email já em uso.' 
                : 'Erro ao criar conta.', 'error');
            return false;
        }
    },

    logout(auth) {
        signOut(auth);
    },

    async resetPassword(auth) {
        const email = prompt("Digite seu email:");
        if (email) {
            try {
                await sendPasswordResetEmail(auth, email);
                Utils.showNotification("Email de redefinição enviado!", "success");
            } catch {
                Utils.showNotification("Erro ao enviar email.", "error");
            }
        }
    },

    async reauthenticate(user, password) {
        // Lógica de reautenticação
    }
};
