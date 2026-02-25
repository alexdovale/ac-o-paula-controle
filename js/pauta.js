// js/pauta.js
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, where, writeBatch, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showNotification, normalizeText, escapeHTML } from './utils.js';

export const PautaService = {
    currentListeners: new Map(),

    setupAttendancesListener(db, pautaId, callback) {
        if (this.currentListeners.has(pautaId)) {
            this.currentListeners.get(pautaId)();
        }

        const attendanceRef = collection(db, "pautas", pautaId, "attendances");
        const unsubscribe = onSnapshot(attendanceRef, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(data);
        });

        this.currentListeners.set(pautaId, unsubscribe);
        return unsubscribe;
    },

    async addAssisted(app) {
        const name = document.getElementById('assisted-name').value.trim();
        if (!name) {
            showNotification("O nome é obrigatório.", "error");
            return;
        }

        const currentMode = document.getElementById('tab-agendamento').classList.contains('tab-active') ? 'agendamento' : 'avulso';
        let isScheduled, hasArrived, scheduledTimeValue;

        if (currentMode === 'agendamento') {
            isScheduled = document.querySelector('input[name="is-scheduled"]:checked').value === 'yes';
            hasArrived = document.querySelector('input[name="has-arrived"]:checked').value === 'yes';
            scheduledTimeValue = isScheduled ? document.getElementById('scheduled-time').value : null;

            if (isScheduled && !scheduledTimeValue && !hasArrived) {
                showNotification("Por favor, informe o horário agendado.", "error");
                return;
            }
        } else {
            isScheduled = false;
            hasArrived = true;
            scheduledTimeValue = null;
        }

        let arrivalDate = null;
        if (hasArrived) {
            const timeInput = document.getElementById('arrival-time').value;
            const [hours, minutes] = timeInput.split(':');
            arrivalDate = new Date();
            arrivalDate.setHours(hours, minutes);
        }

        let assignedRoom = null;
        if (currentMode !== 'agendamento' && app.currentPautaData?.type === 'multisala') {
            assignedRoom = document.getElementById('manual-room-select').value;
        }

        const newAssisted = {
            name,
            cpf: document.getElementById('assisted-cpf').value.trim(),
            subject: document.getElementById('assisted-subject').value.trim(),
            type: currentMode,
            status: hasArrived ? 'aguardando' : 'pauta',
            scheduledTime: scheduledTimeValue,
            arrivalTime: hasArrived ? arrivalDate.toISOString() : null,
            assignedCollaborator: null,
            inAttendanceTime: null,
            finalizadoPeloColaborador: false,
            isConfirmed: false,
            confirmationDetails: null,
            room: assignedRoom,
            indexManual: app.allAssisted.length,
            createdAt: new Date().toISOString(),
            lastActionBy: app.currentUserName,
            lastActionTimestamp: new Date().toISOString()
        };

        try {
            const attendanceRef = collection(app.db, "pautas", app.currentPauta.id, "attendances");
            await addDoc(attendanceRef, newAssisted);
            showNotification("Assistido adicionado!");
            document.getElementById('form-agendamento').reset();
            document.getElementById('scheduled-time-wrapper').classList.add('hidden');
            document.getElementById('arrival-time-wrapper').classList.add('hidden');
        } catch (error) {
            console.error("Erro ao adicionar:", error);
            showNotification("Erro ao adicionar assistido", "error");
        }
    },

    async updateStatus(db, pautaId, assistedId, updates, userName) {
        const docRef = doc(db, "pautas", pautaId, "attendances", assistedId);
        await updateDoc(docRef, {
            ...updates,
            lastActionBy: userName,
            lastActionTimestamp: new Date().toISOString()
        });
    },

    async deleteAssisted(db, pautaId, assistedId) {
        const docRef = doc(db, "pautas", pautaId, "attendances", assistedId);
        await deleteDoc(docRef);
        showNotification("Registro apagado.");
    },

    async reorderQueue(db, pautaId, items) {
        const batch = writeBatch(db);
        items.forEach((item, index) => {
            const docRef = doc(db, "pautas", pautaId, "attendances", item.id);
            batch.update(docRef, { manualIndex: index });
        });
        await batch.commit();
        showNotification("Fila reordenada!");
    },

    async handleCSVUpload(event, app) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const { parsePautaCSV } = await import('./csvHandler.js');
            const assistidos = await parsePautaCSV(file);

            for (const assistido of assistidos) {
                const newAssisted = {
                    ...assistido,
                    type: 'agendamento',
                    status: 'pauta',
                    createdAt: new Date().toISOString(),
                    lastActionBy: app.currentUserName,
                    lastActionTimestamp: new Date().toISOString()
                };
                
                const attendanceRef = collection(app.db, "pautas", app.currentPauta.id, "attendances");
                await addDoc(attendanceRef, newAssisted);
            }

            showNotification(`${assistidos.length} registros importados!`);
        } catch (error) {
            showNotification(error.message || "Erro ao importar", "error");
        } finally {
            event.target.value = '';
        }
    },

    getPriorityLevel(assisted) {
        if (!assisted || assisted.status !== 'aguardando') return 'N/A';
        if (assisted.priority === 'URGENTE') return 'URGENTE';

        if (assisted.type === 'avulso') return 'Média';

        if (!assisted.scheduledTime || !assisted.arrivalTime) return 'Média';

        const scheduled = new Date(`1970-01-01T${assisted.scheduledTime}`);
        const arrival = new Date(assisted.arrivalTime);
        const arrivalTime = new Date(`1970-01-01T${arrival.toTimeString().slice(0, 5)}`);

        const diffMinutes = (arrivalTime - scheduled) / (1000 * 60);

        if (diffMinutes <= 0) return 'Máxima';
        if (diffMinutes <= 20) return 'Média';
        return 'Mínima';
    },

    sortAguardando(list, orderType) {
        if (orderType === 'manual') {
            return [...list].sort((a, b) => (a.manualIndex || 0) - (b.manualIndex || 0));
        }
        
        if (orderType === 'chegada') {
            return [...list].sort((a, b) => (a.checkInOrder || 0) - (b.checkInOrder || 0));
        }

        // Padrão: prioridade + horário
        return [...list].sort((a, b) => {
            // Primeiro: prioridade urgente
            if (a.priority === 'URGENTE' && b.priority !== 'URGENTE') return -1;
            if (b.priority === 'URGENTE' && a.priority !== 'URGENTE') return 1;

            // Depois: horário virtual
            const getVirtualTime = (item) => {
                if (item.type === 'avulso') return item.checkInOrder || 0;
                if (!item.scheduledTime) return 0;

                const scheduled = new Date(`1970-01-01T${item.scheduledTime}`).getTime();
                if (!item.arrivalTime) return scheduled;

                const arrival = new Date(item.arrivalTime);
                const arrivalHour = new Date(`1970-01-01T${arrival.getHours()}:${arrival.getMinutes()}`).getTime();
                const diff = (arrivalHour - scheduled) / 60000;

                if (diff > 30) return scheduled + (45 * 60 * 1000);
                if (diff > 0) return scheduled + (15 * 60 * 1000);
                return scheduled;
            };

            const timeA = getVirtualTime(a);
            const timeB = getVirtualTime(b);

            if (timeA !== timeB) return timeA - timeB;

            // Desempate: ordem de chegada
            return (a.checkInOrder || 0) - (b.checkInOrder || 0);
        });
    },

    getPriorityClass(priority) {
        return {
            'URGENTE': 'priority-urgente',
            'Máxima': 'priority-maxima',
            'Média': 'priority-media',
            'Mínima': 'priority-minima'
        }[priority] || '';
    },

    setupManualSort(app) {
        const el = document.getElementById('aguardando-list');
        if (!el) return;

        if (app.currentPautaData?.ordemAtendimento === 'manual' && !app.isPautaClosed) {
            if (window.sortableAguardando) window.sortableAguardando.destroy();

            window.sortableAguardando = new Sortable(el, {
                animation: 300,
                ghostClass: 'opacity-20',
                chosenClass: 'ring-2',
                dragClass: 'scale-95',
                handle: '.relative',
                filter: 'button, svg, p, span',
                preventOnFilter: false,
                onEnd: async function () {
                    const items = el.querySelectorAll('[data-id]');
                    const batch = writeBatch(app.db);
                    
                    items.forEach((item, index) => {
                        const docId = item.getAttribute('data-id');
                        const docRef = doc(app.db, "pautas", app.currentPauta.id, "attendances", docId);
                        batch.update(docRef, { manualIndex: index });
                    });

                    try {
                        await batch.commit();
                        showNotification("Fila Reordenada!");
                    } catch (e) {
                        console.error(e);
                    }
                }
            });
        }
    },

    showPautaSelectionScreen(app) {
        localStorage.removeItem('lastPautaId');
        localStorage.removeItem('lastPautaType');

        const pautasList = document.getElementById('pautas-list');
        pautasList.innerHTML = '<p class="col-span-full text-center">Carregando pautas...</p>';

        const q = query(collection(app.db, "pautas"), where("members", "array-contains", app.auth.currentUser.uid));

        onSnapshot(q, (snapshot) => {
            pautasList.innerHTML = '';
            const fragment = document.createDocumentFragment();
            const now = new Date();

            if (snapshot.empty) {
                pautasList.innerHTML = '<p class="col-span-full text-center text-gray-500">Nenhuma pauta encontrada. Crie uma para começar.</p>';
                return;
            }

            snapshot.docs.forEach((docSnap) => {
                const pauta = docSnap.data();
                let isExpired = false;
                if (pauta.createdAt) {
                    const creationDate = new Date(pauta.createdAt);
                    const expirationDate = new Date(creationDate);
                    expirationDate.setDate(creationDate.getDate() + 7);
                    if (now > expirationDate) {
                        isExpired = true;
                    }
                }
                const card = this.createPautaCard(docSnap, isExpired, app);
                fragment.appendChild(card);
            });
            pautasList.appendChild(fragment);
        });

        const { UIService } = require('./ui.js');
        UIService.showScreen('pautaSelection');
    },

    createPautaCard(docSnap, isExpired, app) {
        const pauta = docSnap.data();
        const card = document.createElement('div');
        card.className = "relative bg-white p-6 rounded-lg shadow-md flex flex-col justify-between h-full";

        if (isExpired) {
            card.classList.add('opacity-60', 'bg-gray-100', 'cursor-not-allowed');
        } else {
            card.classList.add('hover:shadow-xl', 'transition-shadow', 'cursor-pointer');
        }

        const deleteButton = document.createElement('button');
        deleteButton.className = "absolute top-3 right-3 p-1 rounded-full text-gray-400 hover:text-red-600 transition-colors";
        deleteButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>`;

        deleteButton.addEventListener('click', async (event) => {
            event.stopPropagation();
            if (confirm(`Tem certeza que deseja apagar a pauta "${pauta.name}"?`)) {
                await deleteDoc(doc(app.db, "pautas", docSnap.id));
                showNotification("Pauta excluída!");
            }
        });

        card.appendChild(deleteButton);

        const creationDate = pauta.createdAt ? new Date(pauta.createdAt) : new Date();
        const expirationDate = new Date(creationDate);
        expirationDate.setDate(creationDate.getDate() + 7);

        card.innerHTML += `
            <div>
                <h3 class="font-bold text-xl mb-2">${escapeHTML(pauta.name)}</h3>
                <p class="text-gray-600">Membros: ${pauta.memberEmails?.length || 1}</p>
            </div>
            <div class="mt-4 pt-2 border-t border-gray-200">
                <p class="text-xs text-gray-500">Criada em: <strong>${creationDate.toLocaleDateString('pt-BR')}</strong></p>
                <p class="text-xs ${isExpired ? 'text-gray-500' : 'text-red-600'}">
                    ${isExpired ? 'Expirou em:' : 'Será eliminada em:'} <strong>${expirationDate.toLocaleDateString('pt-BR')}</strong>
                </p>
            </div>
        `;

        if (!isExpired) {
            card.addEventListener('click', () => {
                app.loadPauta(docSnap.id, pauta.name, pauta.type);
            });
        }

        return card;
    },

    handleCardActions(e, app) {
        const button = e.target.closest('button');
        if (!button) return;

        const id = button.dataset.id;
        if (!id) return;

        // Check-in
        if (button.classList.contains('check-in-btn')) {
            const { ModalService } = require('./modal.js');
            ModalService.openArrivalModal(id, app);
        }

        // Faltou
        if (button.classList.contains('faltou-btn')) {
            this.updateStatus(app.db, app.currentPauta.id, id, { status: 'faltoso' }, app.currentUserName);
        }

        // Voltar para pauta
        if (button.classList.contains('return-to-pauta-btn')) {
            this.updateStatus(app.db, app.currentPauta.id, id, {
                status: 'pauta',
                arrivalTime: null,
                priority: null,
                assignedCollaborator: null,
                inAttendanceTime: null,
                room: null
            }, app.currentUserName);
        }

        // Deletar
        if (button.classList.contains('delete-btn')) {
            if (confirm("Tem certeza?")) {
                this.deleteAssisted(app.db, app.currentPauta.id, id);
            }
        }

        // Prioridade
        if (button.classList.contains('priority-btn')) {
            const assisted = app.allAssisted.find(a => a.id === id);
            if (assisted?.priority === 'URGENTE') {
                if (confirm("Remover urgência?")) {
                    this.updateStatus(app.db, app.currentPauta.id, id, {
                        priority: null,
                        priorityReason: null
                    }, app.currentUserName);
                }
            } else {
                const { ModalService } = require('./modal.js');
                ModalService.openPriorityModal(id);
            }
        }

        // Editar assistido
        if (button.classList.contains('edit-assisted-btn')) {
            const assisted = app.allAssisted.find(a => a.id === id);
            if (assisted) {
                document.getElementById('edit-assisted-name').value = assisted.name;
                document.getElementById('edit-assisted-cpf').value = assisted.cpf || '';
                document.getElementById('edit-assisted-subject').value = assisted.subject;
                document.getElementById('edit-scheduled-time').value = assisted.scheduledTime || '';
                window.assistedIdToHandle = id;
                document.getElementById('edit-assisted-modal').classList.remove('hidden');
            }
        }

        // Ver detalhes
        if (button.classList.contains('view-details-btn')) {
            const { openDetailsModal } = require('./detalhes.js');
            openDetailsModal({
                assistedId: id,
                pautaId: app.currentPauta.id,
                allAssisted: app.allAssisted
            });
        }
    }
};
