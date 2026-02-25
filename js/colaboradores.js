// js/colaboradores.js
import { 
    collection, 
    onSnapshot, 
    addDoc, 
    doc, 
    updateDoc, 
    deleteDoc, 
    getDocs, 
    writeBatch 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { escapeHTML, showNotification } from './utils.js';

// Variável para armazenar a lista atual
let colaboradores = [];
let currentListener = null;

// ========================================================
// COLLABORATOR SERVICE - Objeto com todas as funções
// ========================================================

export const CollaboratorService = {
    /**
     * Escuta mudanças na lista de colaboradores da pauta em tempo real
     */
    setupListener(app, pautaId) {
        if (!pautaId) return;
        
        if (currentListener) currentListener();
        
        const collaboratorsCollectionRef = collection(app.db, "pautas", pautaId, "collaborators");
        
        currentListener = onSnapshot(collaboratorsCollectionRef, (snapshot) => {
            colaboradores = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Ordena por nome antes de devolver para a interface
            colaboradores.sort((a, b) => a.nome.localeCompare(b.nome));
            this.renderTable(colaboradores);
        }, (error) => {
            console.error("Erro no listener de colaboradores:", error);
        });
    },

    /**
     * Renderiza a lista de colaboradores na tabela
     */
    renderTable(lista) {
        const tableBody = document.querySelector('#collaborators-list-table-modal tbody');
        if (!tableBody) return;
        
        tableBody.innerHTML = '';
        let selfT = 0, compT = 0;

        lista.forEach((colab) => {
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
            tableBody.appendChild(row);
        });

        // Atualiza contadores
        this.updateCounters(lista.length, selfT, compT);
        
        // Adiciona event listeners aos novos botões
        this.addEventListenersToTable();
    },

    /**
     * Atualiza os contadores de estatísticas
     */
    updateCounters(total, selfT, compT) {
        const elTotal = document.getElementById('total-participants-count');
        const elSelf = document.getElementById('self-transport-count');
        const elComp = document.getElementById('company-transport-count');
        
        if (elTotal) elTotal.textContent = total;
        if (elSelf) elSelf.textContent = selfT;
        if (elComp) elComp.textContent = compT;
    },

    /**
     * Adiciona event listeners aos botões da tabela
     */
    addEventListenersToTable() {
        // Checkboxes de presença
        document.querySelectorAll('#collaborators-modal .checkin-checkbox').forEach(checkbox => {
            checkbox.removeEventListener('change', this.handlePresenceChange);
            checkbox.addEventListener('change', this.handlePresenceChange.bind(this));
        });

        // Botões de editar
        document.querySelectorAll('#collaborators-modal .edit-collaborator-btn').forEach(btn => {
            btn.removeEventListener('click', this.handleEdit);
            btn.addEventListener('click', this.handleEdit.bind(this));
        });

        // Botões de deletar
        document.querySelectorAll('#collaborators-modal .delete-collaborator-btn').forEach(btn => {
            btn.removeEventListener('click', this.handleDelete);
            btn.addEventListener('click', this.handleDelete.bind(this));
        });
    },

    /**
     * Handler para mudança de presença
     */
    async handlePresenceChange(e) {
        const docId = e.target.dataset.id;
        const presente = e.target.checked;
        const horario = presente ? new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
        
        const app = window.app; // Assume que app está global
        if (app && app.currentPauta) {
            await this.togglePresence(app, docId, presente);
        }
    },

    /**
     * Handler para editar colaborador
     */
    async handleEdit(e) {
        const docId = e.currentTarget.dataset.id;
        const app = window.app;
        if (app && app.currentPauta) {
            await this.editCollaborator(app, docId);
        }
    },

    /**
     * Handler para deletar colaborador
     */
    handleDelete(e) {
        const docId = e.currentTarget.dataset.id;
        if (confirm("Remover este membro?")) {
            const app = window.app;
            if (app && app.currentPauta) {
                this.deleteCollaborator(app, docId);
            }
        }
    },

    /**
     * Abre o modal de colaboradores
     */
    openModal(app) {
        const modal = document.getElementById('collaborators-modal');
        if (modal) {
            modal.classList.remove('hidden');
            this.resetForm();
        }
    },

    /**
     * Reseta o formulário de colaborador
     */
    resetForm() {
        const form = document.getElementById('collaborator-form-modal');
        if (form) form.reset();
        
        const btn = document.getElementById('add-collaborator-btn-modal');
        if (btn) btn.textContent = "Salvar Membro";
        
        this.editId = null;
    },

    /**
     * Salva ou Atualiza um colaborador
     */
    async saveCollaborator(app, data, editId = null) {
        if (!app.currentPauta) return;
        
        const collaboratorsCollectionRef = collection(app.db, "pautas", app.currentPauta.id, "collaborators");

        try {
            if (editId) {
                // Modo Edição
                const collaboratorRef = doc(collaboratorsCollectionRef, editId);
                await updateDoc(collaboratorRef, data);
                showNotification("Membro atualizado!");
            } else {
                // Modo Novo Registro
                await addDoc(collaboratorsCollectionRef, {
                    ...data,
                    presente: false,
                    horario: '--:--'
                });
                showNotification("Membro adicionado!");
            }
            this.resetForm();
        } catch (error) {
            console.error("Erro ao salvar:", error);
            showNotification("Erro ao salvar membro", "error");
        }
    },

    /**
     * Altera apenas o status de presença de um colaborador
     */
    async togglePresence(app, collabId, isPresent) {
        if (!app.currentPauta) return;
        
        try {
            const collaboratorRef = doc(app.db, "pautas", app.currentPauta.id, "collaborators", collabId);
            const horario = isPresent ? new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
            
            await updateDoc(collaboratorRef, { 
                presente: isPresent, 
                horario: horario 
            });
        } catch (error) {
            console.error("Erro ao marcar presença:", error);
        }
    },

    /**
     * Carrega dados de um colaborador para edição
     */
    async editCollaborator(app, collabId) {
        if (!app.currentPauta) return;
        
        try {
            const collaboratorRef = doc(app.db, "pautas", app.currentPauta.id, "collaborators", collabId);
            const snap = await getDoc(collaboratorRef);
            
            if (snap.exists()) {
                const c = snap.data();
                this.editId = collabId;
                
                document.getElementById('collaborator-name-modal').value = c.nome || '';
                document.getElementById('collaborator-role-modal').value = c.cargo || 'Defensor(a)';
                document.getElementById('collaborator-team-modal').value = c.equipe || '1';
                document.getElementById('collaborator-phone-modal').value = c.telefone || '';
                document.getElementById('collaborator-email-modal').value = c.email || '';
                
                const rTransp = document.querySelector(`input[name="transporte-colaborador"][value="${c.transporte || 'Meios Próprios'}"]`);
                if (rTransp) rTransp.checked = true;

                document.getElementById('add-collaborator-btn-modal').textContent = "Atualizar Membro";
                
                // Scroll para o formulário
                document.querySelector('#collaborators-modal .overflow-y-auto')?.scrollTo({ top: 0, behavior: 'smooth' });
            }
        } catch (error) {
            console.error("Erro ao carregar para edição:", error);
            showNotification("Erro ao carregar dados", "error");
        }
    },

    /**
     * Exclui um colaborador da lista
     */
    async deleteCollaborator(app, collabId) {
        if (!app.currentPauta) return;
        
        try {
            const collaboratorRef = doc(app.db, "pautas", app.currentPauta.id, "collaborators", collabId);
            await deleteDoc(collaboratorRef);
            showNotification("Membro removido!");
        } catch (error) {
            console.error("Erro ao remover:", error);
            showNotification("Erro ao remover membro", "error");
        }
    },

    /**
     * Limpa toda a lista de presença de uma pauta (Batch)
     */
    async clearAll(app) {
        if (!app.currentPauta) return;
        
        if (!confirm("Tem certeza que deseja apagar TODOS os membros da lista?")) return;
        
        try {
            const collaboratorsCollectionRef = collection(app.db, "pautas", app.currentPauta.id, "collaborators");
            const snapshot = await getDocs(collaboratorsCollectionRef);
            
            if (snapshot.empty) {
                showNotification("Lista já está vazia", "info");
                return;
            }

            const batch = writeBatch(app.db);
            snapshot.docs.forEach(d => {
                batch.delete(d.ref);
            });
            
            await batch.commit();
            showNotification("Lista limpa com sucesso!");
        } catch (error) {
            console.error("Erro ao limpar lista:", error);
            showNotification("Erro ao limpar lista", "error");
        }
    },

    /**
     * Ordena colaboradores por critério
     */
    sort(criterio, lista = colaboradores) {
        const pesos = { "Defensor(a)": 1, "Servidor(a)": 2, "CRC": 3, "Residente": 4, "Estagiário(a)": 5 };
        
        const sortedList = [...lista].sort((a, b) => {
            if (criterio === 'nome') {
                return a.nome.localeCompare(b.nome);
            }
            if (criterio === 'equipe') {
                if (a.equipe !== b.equipe) return a.equipe - b.equipe;
                const pA = pesos[a.cargo] || 99;
                const pB = pesos[b.cargo] || 99;
                return pA !== pB ? pA - pB : a.nome.localeCompare(b.nome);
            }
            return 0;
        });
        
        this.renderTable(sortedList);
        return sortedList;
    },

    /**
     * Obtém a lista atual de colaboradores
     */
    getList() {
        return [...colaboradores];
    }
};

// ========================================================
// FUNÇÕES AVULSAS (para compatibilidade com código antigo)
// ========================================================

/**
 * @deprecated Use CollaboratorService.setupListener() instead
 */
export function setupCollaboratorsListener(app, pautaId) {
    return CollaboratorService.setupListener(app, pautaId);
}

/**
 * @deprecated Use CollaboratorService.renderTable() instead
 */
export function renderColaboradores(lista) {
    return CollaboratorService.renderTable(lista);
}

/**
 * @deprecated Use CollaboratorService.resetForm() instead
 */
export function resetCollaboratorForm() {
    return CollaboratorService.resetForm();
}

/**
 * @deprecated Use CollaboratorService.sort() instead
 */
export function sortColaboradores(criterio, lista) {
    return CollaboratorService.sort(criterio, lista);
}

/**
 * @deprecated Use CollaboratorService.saveCollaborator() instead
 */
export const saveCollaboratorData = async (db, pautaId, data, editId = null) => {
    const app = window.app;
    if (app) {
        return CollaboratorService.saveCollaborator(app, data, editId);
    }
};

/**
 * @deprecated Use CollaboratorService.togglePresence() instead
 */
export const toggleCollaboratorPresence = async (db, pautaId, collabId, isPresent) => {
    const app = window.app;
    if (app) {
        return CollaboratorService.togglePresence(app, collabId, isPresent);
    }
};

/**
 * @deprecated Use CollaboratorService.deleteCollaborator() instead
 */
export const deleteCollaborator = async (db, pautaId, collabId) => {
    const app = window.app;
    if (app) {
        return CollaboratorService.deleteCollaborator(app, collabId);
    }
};

/**
 * @deprecated Use CollaboratorService.clearAll() instead
 */
export const clearCollaborators = async (db, pautaId) => {
    const app = window.app;
    if (app) {
        return CollaboratorService.clearAll(app);
    }
};
