// js/pauta.js - VERSÃO COMPLETA E ATUALIZADA (Com integração Verde/Solar Mock)
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, where, getDocs, getDoc, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showNotification, normalizeText, escapeHTML } from './utils.js';
import { UIService } from './ui.js';
import { logAction } from './admin.js';

export const PautaService = {
    currentListeners: new Map(),
    actionCooldown: new Map(),

    isMobileDevice() {
        return window.innerWidth <= 768;
    },

    closeAllQuickMenus(excludeMenuId = null) {
        document.querySelectorAll('[id^="quick-menu-"]').forEach(menu => {
            if (excludeMenuId === null || menu.id !== excludeMenuId) {
                menu.classList.add('hidden');
                const toggleId = menu.id.replace('quick-menu', 'quick-toggle');
                const toggle = document.getElementById(toggleId);
                if (toggle) toggle.setAttribute('aria-expanded', 'false');
            }
        });
    },

    canPerformAction(actionId, cooldownMs = 500) {
        const lastAction = this.actionCooldown.get(actionId);
        const now = Date.now();
        if (lastAction && now - lastAction < cooldownMs) return false;
        this.actionCooldown.set(actionId, now);
        return true;
    },

    /**
     * MÉTODO NOVO: Adiciona assistido manualmente ou via API (Evita duplicados por externalId)
     */
    async addAssistedManual(app, data) {
        if (!app.currentPauta) return;

        const attendanceRef = collection(app.db, "pautas", app.currentPauta.id, "attendances");
        
        // Verifica se já existe esse ID externo para não duplicar na pauta
        if (data.externalId) {
            const q = query(attendanceRef, where("externalId", "==", data.externalId));
            const snapshot = await getDocs(q);
            if (!snapshot.empty) return; // Já existe, ignora
        }

        return await addDoc(attendanceRef, {
            ...data,
            createdAt: new Date().toISOString(),
            lastActionBy: app.currentUserName || 'Integração',
            lastActionTimestamp: new Date().toISOString()
        });
    },

    /**
     * Adiciona um novo assistido pelo formulário
     */
    async addAssisted(app) {
        if (!app || !app.currentPauta || !app.currentPauta.id) {
            showNotification("Selecione uma pauta primeiro", "error");
            return;
        }

        const nameInput = document.getElementById('assisted-name');
        const cpfInput = document.getElementById('assisted-cpf');
        const subjectInput = document.getElementById('assisted-subject');
        
        const name = nameInput?.value.trim();
        if (!name) {
            showNotification("O nome é obrigatório.", "error");
            return;
        }

        const tabAgendamento = document.getElementById('tab-agendamento');
        const currentMode = (tabAgendamento && tabAgendamento.classList.contains('tab-active')) ? 'agendamento' : 'avulso';
        
        let isScheduled = false, hasArrived = (currentMode === 'avulso'), scheduledTimeValue = null;

        if (currentMode === 'agendamento') {
            const scheduledRadio = document.querySelector('input[name="is-scheduled"]:checked');
            const arrivedRadio = document.querySelector('input[name="has-arrived"]:checked');
            isScheduled = (scheduledRadio?.value === 'yes');
            hasArrived = (arrivedRadio?.value === 'yes');
            scheduledTimeValue = (isScheduled) ? document.getElementById('scheduled-time')?.value : null;
        }

        let arrivalDate = null;
        if (hasArrived) {
            const timeInput = document.getElementById('arrival-time');
            if (timeInput?.value) {
                const [hours, minutes] = timeInput.value.split(':');
                arrivalDate = new Date();
                arrivalDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
            }
        }

        const newAssisted = {
            name: name,
            cpf: cpfInput?.value.trim() || '',
            subject: subjectInput?.value.trim() || 'Não informado',
            type: currentMode,
            status: hasArrived ? 'aguardando' : 'pauta',
            scheduledTime: scheduledTimeValue,
            arrivalTime: hasArrived && arrivalDate ? arrivalDate.toISOString() : null,
            checkInOrder: hasArrived && arrivalDate ? arrivalDate.getTime() : null, 
            assignedCollaborator: null,
            room: (currentMode === 'avulso') ? document.getElementById('manual-room-select')?.value : null,
            manualIndex: Date.now()
        };

        await this.addAssistedManual(app, newAssisted);
        showNotification("Assistido adicionado com sucesso!");
        if (nameInput) nameInput.value = '';
        nameInput?.focus();
    },

    /**
     * Atualiza status de um assistido
     */
    async updateStatus(db, pautaId, assistedId, updates, userName) {
        if (!pautaId || !assistedId) return;
        try {
            const docRef = doc(db, "pautas", pautaId, "attendances", assistedId);
            const finalUpdates = { 
                ...updates,
                lastActionBy: userName || 'Sistema',
                lastActionTimestamp: new Date().toISOString()
            };

            if (updates.status === 'aguardando' && !updates.checkInOrder) {
                finalUpdates.checkInOrder = Date.now();
            }

            await updateDoc(docRef, finalUpdates);
        } catch (error) {
            console.error("Erro ao atualizar status:", error);
        }
    },

    /**
     * MODIFICADO: Deletar Pauta (Suporte para integração real/mock)
     */
    async deletePauta(db, auth, pautaId, pautaName, userName) {
        if (!confirm(`Apagar a pauta "${pautaName}" permanentemente?`)) return false;

        try {
            const pautaRef = doc(db, "pautas", pautaId);
            const attendanceRef = collection(db, "pautas", pautaId, "attendances");
            const attendanceSnapshot = await getDocs(attendanceRef);
            
            const batch = writeBatch(db);
            attendanceSnapshot.docs.forEach(doc => batch.delete(doc.ref));
            batch.delete(pautaRef);
            await batch.commit();
            
            showNotification("Pauta apagada!");
            return true;
        } catch (error) {
            showNotification("Erro ao apagar: " + error.message, "error");
            return false;
        }
    },

    filterPautas(pautas, filterType, currentUserId, currentUserEmail, filtrosAdicionais = {}) {
        if (!pautas || !Array.isArray(pautas)) return [];
        let pautasFiltradas = [...pautas];
        const now = new Date();
        
        switch(filterType) {
            case 'my': pautasFiltradas = pautasFiltradas.filter(p => p.owner === currentUserId); break;
            case 'shared': pautasFiltradas = pautasFiltradas.filter(p => p.owner !== currentUserId); break;
            case 'all': default: break;
        }
        return pautasFiltradas;
    },

    sortAguardando(list, orderType) {
        if (!list || !list.length) return [];
        if (orderType === 'manual') return [...list].sort((a, b) => (a.manualIndex || 0) - (b.manualIndex || 0));
        if (orderType === 'chegada') return [...list].sort((a, b) => (a.checkInOrder || 0) - (b.checkInOrder || 0));

        return [...list].sort((a, b) => {
            if (a.priority === 'URGENTE' && b.priority !== 'URGENTE') return -1;
            if (b.priority === 'URGENTE' && a.priority !== 'URGENTE') return 1;
            return (a.checkInOrder || 0) - (b.checkInOrder || 0);
        });
    },

    /**
     * Manipula cliques nos botões dos cards
     */
    handleCardActions(e, app) {
        const button = e.target.closest('button');
        if (!button) return;
        const id = button.dataset.id;
        if (!id) return;

        if (button.classList.contains('check-in-btn')) {
            window.assistedIdToHandle = id;
            document.getElementById('arrival-modal')?.classList.remove('hidden');
        }

        if (button.classList.contains('delete-btn')) {
            if (confirm("Excluir registro?")) this.deleteAssisted(app.db, app.currentPauta.id, id, app.currentUserName);
        }

        if (button.classList.contains('priority-btn')) {
            window.assistedIdToHandle = id;
            document.getElementById('priority-reason-modal')?.classList.remove('hidden');
        }
    },

    async deleteAssisted(db, pautaId, assistedId, userName) {
        await deleteDoc(doc(db, "pautas", pautaId, "attendances", assistedId));
        showNotification("Registro removido");
    },

    preencherSelectColaboradores(app, selectId = 'attendant-select') {
        const select = document.getElementById(selectId);
        if (!select) return;
        select.innerHTML = '<option value="">-- Selecione --</option>';
        app.colaboradores.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.nome;
            opt.textContent = `${c.nome} (${c.cargo || 'Equipe'})`;
            select.appendChild(opt);
        });
    }
};
