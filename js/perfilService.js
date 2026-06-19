// js/perfilService.js
import { doc, getDoc, updateDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword, updateEmail } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { showNotification } from './utils.js';

export const PerfilService = {
    async carregarDados(app) {
        if (!app.auth.currentUser) return;
        
        const uid = app.auth.currentUser.uid;
        
        // 1. Carregar dados do usuário
        document.getElementById('perfil-email').value = app.auth.currentUser.email || '';
        document.getElementById('perfil-senha-atual').value = '';
        document.getElementById('perfil-nova-senha').value = '';

        try {
            const userDoc = await getDoc(doc(app.db, "users", uid));
            if (userDoc.exists()) {
                const data = userDoc.data();
                document.getElementById('perfil-nome').value = data.nome || '';
                document.getElementById('perfil-role').value = data.role || 'Usuário';

                // Toggles de preferência
                const prefs = data.preferences || app.getDefaultNotificationPreferences();
                document.getElementById('perfil-som-success').checked = prefs.enableSoundsSuccess ?? true;
                document.getElementById('perfil-som-error').checked = prefs.enableSoundsError ?? true;
                document.getElementById('perfil-som-warning').checked = prefs.enableSoundsWarning ?? true;
                document.getElementById('perfil-som-info').checked = prefs.enableSoundsInfo ?? true;
                
                document.getElementById('perfil-toast-success').checked = prefs.showToastsSuccess ?? true;
                document.getElementById('perfil-toast-error').checked = prefs.showToastsError ?? true;
                document.getElementById('perfil-toast-warning').checked = prefs.showToastsWarning ?? true;
                document.getElementById('perfil-toast-info').checked = prefs.showToastsInfo ?? true;

                // 2. Carregar todas as Unidades disponíveis no sistema
                await this.carregarListaUnidades(app.db, data.unidades || []);
            }
        } catch (error) {
            console.error("Erro ao carregar perfil:", error);
            showNotification("Erro ao carregar seus dados.", "error");
        }

        this.setupEventos(app);
    },

    async carregarListaUnidades(db, unidadesDoUsuario) {
        const container = document.getElementById('perfil-unidades-list');
        container.innerHTML = '<p class="text-sm text-gray-500 text-center py-2">Carregando...</p>';

        try {
            // Ajuste o nome da collection para a que você usa ("orgaos", "unidades", etc)
            const orgaosSnap = await getDocs(collection(db, "orgaos")); 
            container.innerHTML = '';

            if (orgaosSnap.empty) {
                container.innerHTML = '<p class="text-sm text-gray-500">Nenhuma unidade cadastrada no sistema.</p>';
                return;
            }

            const arrayNomesUnidadesUsuario = unidadesDoUsuario.map(u => u.unidadeNome || u);

            orgaosSnap.forEach(docSnap => {
                const orgao = docSnap.data();
                const nome = orgao.nome || orgao.nomeUnidade;
                
                const isChecked = arrayNomesUnidadesUsuario.includes(nome) ? 'checked' : '';

                container.innerHTML += `
                    <label class="flex items-center p-2 hover:bg-gray-100 rounded cursor-pointer transition">
                        <input type="checkbox" value="${nome}" class="unidade-checkbox h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" ${isChecked}>
                        <span class="ml-2 text-sm text-gray-700 font-medium">${nome}</span>
                    </label>
                `;
            });
        } catch (e) {
            console.error("Erro ao buscar unidades:", e);
            container.innerHTML = '<p class="text-sm text-red-500">Erro ao carregar unidades.</p>';
        }
    },

    setupEventos(app) {
        // Remover eventos antigos para não duplicar se a tela for aberta 2 vezes
        const btnSalvar = document.getElementById('perfil-salvar-btn');
        const btnVoltar = document.getElementById('perfil-back-btn');
        
        const newBtnSalvar = btnSalvar.cloneNode(true);
        btnSalvar.parentNode.replaceChild(newBtnSalvar, btnSalvar);
        
        const newBtnVoltar = btnVoltar.cloneNode(true);
        btnVoltar.parentNode.replaceChild(newBtnVoltar, btnVoltar);

        newBtnVoltar.addEventListener('click', () => {
            // Volta para a tela anterior (Pautas ou Dashboard)
            app.router.navigate(app.ROUTES.PAUTA_SELECTION);
        });

        newBtnSalvar.addEventListener('click', async () => {
            const btn = newBtnSalvar;
            btn.innerHTML = '<div class="loader-small" style="width:20px;height:20px;border-width:2px;"></div> Salvando...';
            btn.disabled = true;

            await this.salvarDados(app);

            btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" /></svg> Salvar Todas as Alterações';
            btn.disabled = false;
        });
    },

    async salvarDados(app) {
        const user = app.auth.currentUser;
        if (!user) return;

        const nome = document.getElementById('perfil-nome').value.trim();
        const novoEmail = document.getElementById('perfil-email').value.trim();
        const novaSenha = document.getElementById('perfil-nova-senha').value;
        const senhaAtual = document.getElementById('perfil-senha-atual').value;

        // Se o e-mail mudou ou ele quer mudar a senha, a senha atual é OBRIGATÓRIA
        const emailMudou = novoEmail !== user.email;
        if ((emailMudou || novaSenha) && !senhaAtual) {
            showNotification("A senha atual é obrigatória para alterar e-mail ou senha.", "error");
            document.getElementById('perfil-senha-atual').focus();
            return;
        }

        try {
            // 1. REAUTENTICAÇÃO SE NECESSÁRIA (Firebase Auth)
            if (senhaAtual) {
                const cred = EmailAuthProvider.credential(user.email, senhaAtual);
                await reauthenticateWithCredential(user, cred);
                
                if (emailMudou) {
                    await updateEmail(user, novoEmail);
                }
                if (novaSenha) {
                    await updatePassword(user, novaSenha);
                }
                document.getElementById('perfil-senha-atual').value = ''; // limpa por segurança
                document.getElementById('perfil-nova-senha').value = '';
            }

            // 2. SALVAR UNIDADES SELECIONADAS
            const checkboxes = document.querySelectorAll('.unidade-checkbox:checked');
            const unidadesSelecionadas = Array.from(checkboxes).map(cb => { 
                return { unidadeNome: cb.value }; // Estrutura que o seu sistema usa
            });

            // 3. SALVAR PREFERÊNCIAS
            const prefs = {
                enableSoundsSuccess: document.getElementById('perfil-som-success').checked,
                enableSoundsError: document.getElementById('perfil-som-error').checked,
                enableSoundsWarning: document.getElementById('perfil-som-warning').checked,
                enableSoundsInfo: document.getElementById('perfil-som-info').checked,
                showToastsSuccess: document.getElementById('perfil-toast-success').checked,
                showToastsError: document.getElementById('perfil-toast-error').checked,
                showToastsWarning: document.getElementById('perfil-toast-warning').checked,
                showToastsInfo: document.getElementById('perfil-toast-info').checked,
            };

            // 4. ATUALIZAR O FIRESTORE
            const userRef = doc(app.db, "users", user.uid);
            await updateDoc(userRef, {
                nome: nome,
                email: novoEmail, // mantém sincronizado com o Auth
                unidades: unidadesSelecionadas,
                preferences: prefs
            });

            // Atualiza o objeto global do app para refletir na hora sem precisar recarregar a página
            app.currentUser.nome = nome;
            app.currentUser.unidades = unidadesSelecionadas;
            app.userPreferences = prefs;

            showNotification("Perfil atualizado com sucesso!", "success");

        } catch (error) {
            console.error(error);
            if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                showNotification("A senha atual informada está incorreta.", "error");
            } else if (error.code === 'auth/email-already-in-use') {
                showNotification("Este e-mail já está sendo usado por outra conta.", "error");
            } else {
                showNotification("Erro ao salvar: " + error.message, "error");
            }
        }
    }
};
