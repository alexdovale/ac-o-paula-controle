// js/colaboradores.js
import { 
    collection, 
    onSnapshot, 
    addDoc, 
    doc, 
    updateDoc, 
    deleteDoc, 
    getDocs, 
    writeBatch,
    getDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { escapeHTML, showNotification } from './utils.js';

export const CollaboratorService = {
    currentListener: null,
    editId: null,

    /**
     * Configura listener para colaboradores
     */
    setupListener(app, pautaId) {
        if (!pautaId || !app?.db) return;
        
        console.log("Configurando listener de colaboradores para pauta:", pautaId);
        
        if (this.currentListener) {
            this.currentListener();
        }
        
        const ref = collection(app.db, "pautas", pautaId, "collaborators");
        this.currentListener = onSnapshot(ref, (snapshot) => {
            const lista = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            console.log("Colaboradores carregados:", lista.length);
            app.colaboradores = lista;
            this.renderTable(app);
        }, (error) => {
            console.error("Erro no listener de colaboradores:", error);
        });
    },

    /**
     * Renderiza tabela de colaboradores
     */
    renderTable(app) {
        const tbody = document.querySelector('#collaborators-list-table-modal tbody');
        if (!tbody) return;

        tbody.innerHTML = '';
        let selfT = 0, compT = 0;

        app.colaboradores.forEach(colab => {
            if (colab.transporte === 'Meios Próprios') selfT++; 
            else if (colab.transporte === 'Com a Empresa') compT++;
            
            const row = document.createElement('tr');
            row.className = "border-b hover:bg-gray-50 transition-colors";
            row.innerHTML = `
                <td class="p-3 font-bold text-gray-800">${escapeHTML(colab.nome)}</td>
                <td class="p-3 text-center">
                    <input type="checkbox" class="checkin-checkbox w-5 h-5 text-green-600 rounded" 
                           data-id="${colab.id}" ${colab.presente ? 'checked' : ''}>
                </td>
                <td class="p-3 text-[10px]">
                    <b>${escapeHTML(colab.cargo || 'N/A')}</b><br>
                    <span class="text-blue-600 font-black uppercase">EQP ${escapeHTML(colab.equipe || 'N/A')}</span>
                </td>
                <td class="p-3 font-mono text-[10px] text-gray-400">${colab.horario || '--:--'}</td>
                <td class="p-3 text-center flex justify-center gap-3">
                    <button class="edit-collaborator-btn text-blue-400 text-lg" data-id="${colab.id}" title="Editar">✏️</button>
                    <button class="delete-collaborator-btn text-red-300 text-lg" data-id="${colab.id}" title="Excluir">🗑️</button>
                </td>
            `;
            tbody.appendChild(row);
        });

        document.getElementById('total-participants-count').textContent = app.colaboradores.length;
        document.getElementById('self-transport-count').textContent = selfT;
        document.getElementById('company-transport-count').textContent = compT;

        this.addEventListenersToTable(app);
    },

    /**
     * Adiciona event listeners à tabela
     */
    addEventListenersToTable(app) {
        document.querySelectorAll('#collaborators-modal .checkin-checkbox').forEach(checkbox => {
            checkbox.onchange = async (e) => {
                const docId = e.target.dataset.id;
                const presente = e.target.checked;
                const horario = presente ? new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
                await this.togglePresence(app, docId, presente);
            };
        });

        document.querySelectorAll('#collaborators-modal .edit-collaborator-btn').forEach(btn => {
            btn.onclick = async (e) => {
                const docId = e.currentTarget.dataset.id;
                await this.editCollaborator(app, docId);
            };
        });

        document.querySelectorAll('#collaborators-modal .delete-collaborator-btn').forEach(btn => {
            btn.onclick = (e) => {
                const docId = e.currentTarget.dataset.id;
                if (confirm("Remover este membro?")) {
                    this.deleteCollaborator(app, docId);
                }
            };
        });
    },

    /**
     * Abre modal de colaboradores
     */
    openModal(app) {
        const modal = document.getElementById('collaborators-modal');
        if (modal) {
            modal.classList.remove('hidden');
            this.resetForm();
        }
    },

    /**
     * Reseta formulário
     */
    resetForm() {
        const form = document.getElementById('collaborator-form-modal');
        if (form) form.reset();
        this.editId = null;
        const btn = document.getElementById('add-collaborator-btn-modal');
        if (btn) btn.textContent = "Salvar Membro";
    },

    /**
     * Salva colaborador
     */
    async saveCollaborator(app, data) {
        if (!app.currentPauta?.id) {
            showNotification("Nenhuma pauta selecionada", "error");
            return;
        }

        try {
            const ref = collection(app.db, "pautas", app.currentPauta.id, "collaborators");
            
            if (this.editId) {
                await updateDoc(doc(ref, this.editId), data);
                showNotification("Membro atualizado!");
            } else {
                await addDoc(ref, { ...data, presente: false, horario: '--:--' });
                showNotification("Membro adicionado!");
            }
            
            this.resetForm();
        } catch (error) {
            console.error("Erro ao salvar:", error);
            showNotification("Erro ao salvar membro", "error");
        }
    },

    /**
     * Alterna presença
     */
    async togglePresence(app, id, presente) {
        try {
            const ref = doc(app.db, "pautas", app.currentPauta.id, "collaborators", id);
            const horario = presente ? new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
            await updateDoc(ref, { presente, horario });
        } catch (error) {
            console.error("Erro ao marcar presença:", error);
        }
    },

    /**
     * Edita colaborador
     */
    async editCollaborator(app, id) {
        try {
            const ref = doc(app.db, "pautas", app.currentPauta.id, "collaborators", id);
            const snap = await getDoc(ref);
            
            if (snap.exists()) {
                const c = snap.data();
                this.editId = id;
                
                document.getElementById('collaborator-name-modal').value = c.nome || '';
                document.getElementById('collaborator-role-modal').value = c.cargo || 'Defensor(a)';
                document.getElementById('collaborator-team-modal').value = c.equipe || '1';
                document.getElementById('collaborator-phone-modal').value = c.telefone || '';
                document.getElementById('collaborator-email-modal').value = c.email || '';
                
                const rTransp = document.querySelector(`input[name="transporte-colaborador"][value="${c.transporte || 'Meios Próprios'}"]`);
                if (rTransp) rTransp.checked = true;

                document.getElementById('add-collaborator-btn-modal').textContent = "Atualizar Membro";
            }
        } catch (error) {
            console.error("Erro ao editar:", error);
        }
    },

    /**
     * Deleta colaborador
     */
    async deleteCollaborator(app, id) {
        try {
            const ref = doc(app.db, "pautas", app.currentPauta.id, "collaborators", id);
            await deleteDoc(ref);
            showNotification("Membro removido!");
        } catch (error) {
            console.error("Erro ao deletar:", error);
        }
    },

    /**
     * Limpa todos os colaboradores
     */
    async clearAll(app) {
        if (!confirm("Tem certeza que deseja apagar TODOS os membros?")) return;
        
        try {
            const ref = collection(app.db, "pautas", app.currentPauta.id, "collaborators");
            const snapshot = await getDocs(ref);
            
            if (snapshot.empty) return;

            const batch = writeBatch(app.db);
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            
            showNotification("Lista limpa!");
        } catch (error) {
            console.error("Erro ao limpar lista:", error);
        }
    }
};
