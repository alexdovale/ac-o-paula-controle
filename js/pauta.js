// js/pauta.js
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, where, getDocs, getDoc, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showNotification, normalizeText, escapeHTML } from './utils.js';
import { UIService } from './ui.js';

export const PautaService = {
    currentListeners: new Map(),

    /**
     * Configura listener em tempo real para atendimentos
     */
    setupAttendancesListener(db, pautaId, callback) {
        if (this.currentListeners.has(pautaId)) {
            this.currentListeners.get(pautaId)();
        }

        const attendanceRef = collection(db, "pautas", pautaId, "attendances");
        const unsubscribe = onSnapshot(attendanceRef, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(data);
        }, (error) => {
            console.error("Erro no listener:", error);
            showNotification("Erro ao carregar dados em tempo real", "error");
        });

        this.currentListeners.set(pautaId, unsubscribe);
        return unsubscribe;
    },

    /**
     * Adiciona um novo assistido
     */
    async addAssisted(app) {
        console.log("=== addAssisted iniciado ===");
        
        // Verificar se app existe
        if (!app) {
            console.error("App não definido");
            showNotification("Erro interno: app não definido", "error");
            return;
        }

        // Verificar se há uma pauta selecionada
        if (!app.currentPauta?.id) {
            console.error("Nenhuma pauta selecionada");
            showNotification("Selecione uma pauta primeiro", "error");
            return;
        }

        // Pegar elementos do DOM
        const nameInput = document.getElementById('assisted-name');
        const cpfInput = document.getElementById('assisted-cpf');
        const subjectInput = document.getElementById('assisted-subject');
        
        console.log("Elementos encontrados:", {
            nameInput: !!nameInput,
            cpfInput: !!cpfInput,
            subjectInput: !!subjectInput
        });

        if (!nameInput) {
            showNotification("Campo de nome não encontrado", "error");
            return;
        }
        
        const name = nameInput.value.trim();
        if (!name) {
            showNotification("O nome é obrigatório.", "error");
            return;
        }

        // Determinar modo atual (agendado ou avulso)
        const tabAgendamento = document.getElementById('tab-agendamento');
        const currentMode = tabAgendamento?.classList.contains('tab-active') ? 'agendamento' : 'avulso';
        console.log("Modo atual:", currentMode);
        
        let isScheduled, hasArrived, scheduledTimeValue;

        if (currentMode === 'agendamento') {
            const scheduledRadio = document.querySelector('input[name="is-scheduled"]:checked');
            const arrivedRadio = document.querySelector('input[name="has-arrived"]:checked');
            
            isScheduled = scheduledRadio?.value === 'yes';
            hasArrived = arrivedRadio?.value === 'yes';
            scheduledTimeValue = isScheduled ? document.getElementById('scheduled-time')?.value : null;

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
            const timeInput = document.getElementById('arrival-time')?.value;
            if (timeInput) {
                const [hours, minutes] = timeInput.split(':');
                arrivalDate = new Date();
                arrivalDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
                console.log("Data de chegada:", arrivalDate);
            }
        }

        // Determinar sala para atendimentos avulsos em pautas multisala
        let assignedRoom = null;
        if (currentMode === 'avulso' && app.currentPautaData?.type === 'multisala') {
            assignedRoom = document.getElementById('manual-room-select')?.value;
            console.log("Sala atribuída:", assignedRoom);
        }

        // Criar objeto do assistido
        const newAssisted = {
            name: name,
            cpf: cpfInput?.value.trim() || '',
            subject: subjectInput?.value.trim() || 'Não informado',
            type: currentMode,
            status: hasArrived ? 'aguardando' : 'pauta',
            scheduledTime: scheduledTimeValue,
            arrivalTime: hasArrived && arrivalDate ? arrivalDate.toISOString() : null,
            assignedCollaborator: null,
            inAttendanceTime: null,
            finalizadoPeloColaborador: false,
            isConfirmed: false,
            confirmationDetails: null,
            room: assignedRoom,
            manualIndex: Date.now(),
            createdAt: new Date().toISOString(),
            lastActionBy: app.currentUserName || 'Sistema',
            lastActionTimestamp: new Date().toISOString()
        };

        console.log("Novo assistido a ser salvo:", newAssisted);

        try {
            console.log("Tentando salvar no Firestore...");
            console.log("Pauta ID:", app.currentPauta.id);
            
            const attendanceRef = collection(app.db, "pautas", app.currentPauta.id, "attendances");
            const docRef = await addDoc(attendanceRef, newAssisted);
            
            console.log("Documento criado com sucesso! ID:", docRef.id);
            showNotification("Assistido adicionado com sucesso!");
            
            // Limpar formulário
            if (nameInput) nameInput.value = '';
            if (cpfInput) cpfInput.value = '';
            if (subjectInput) subjectInput.value = '';
            
            // Esconder wrappers
            document.getElementById('scheduled-time-wrapper')?.classList.add('hidden');
            document.getElementById('arrival-time-wrapper')?.classList.add('hidden');
            
            // Focar no campo nome para nova entrada
            nameInput.focus();
            
        } catch (error) {
            console.error("Erro detalhado ao adicionar:", error);
            console.error("Código do erro:", error.code);
            console.error("Mensagem:", error.message);
            
            let mensagem = "Erro ao adicionar assistido";
            if (error.code === 'permission-denied') {
                mensagem = "Permissão negada. Verifique as regras do Firestore.";
            } else if (error.code === 'unavailable') {
                mensagem = "Serviço indisponível. Verifique sua conexão.";
            } else if (error.message) {
                mensagem = error.message;
            }
            
            showNotification(mensagem, "error");
        }
        
        console.log("=== addAssisted finalizado ===");
    },

    /**
     * Atualiza status de um assistido
     */
    async updateStatus(db, pautaId, assistedId, updates, userName) {
        if (!pautaId || !assistedId) return;
        
        try {
            const docRef = doc(db, "pautas", pautaId, "attendances", assistedId);
            await updateDoc(docRef, {
                ...updates,
                lastActionBy: userName || 'Sistema',
                lastActionTimestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error("Erro ao atualizar status:", error);
            showNotification("Erro ao atualizar", "error");
        }
    },

    /**
     * Remove um assistido
     */
    async deleteAssisted(db, pautaId, assistedId) {
        if (!pautaId || !assistedId) return;
        
        try {
            const docRef = doc(db, "pautas", pautaId, "attendances", assistedId);
            await deleteDoc(docRef);
            showNotification("Registro apagado.");
        } catch (error) {
            console.error("Erro ao deletar:", error);
            showNotification("Erro ao deletar", "error");
        }
    },

    /**
     * Reordena a fila manualmente
     */
    async reorderQueue(db, pautaId, items) {
        if (!pautaId || !items?.length) return;
        
        try {
            const batch = writeBatch(db);
            items.forEach((item, index) => {
                const docRef = doc(db, "pautas", pautaId, "attendances", item.id);
                batch.update(docRef, { manualIndex: index });
            });
            await batch.commit();
            showNotification("Fila reordenada!");
        } catch (error) {
            console.error("Erro ao reordenar:", error);
            showNotification("Erro ao reordenar", "error");
        }
    },

    /**
     * Processa upload de arquivo CSV
     */
    async handleCSVUpload(event, app) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const { parsePautaCSV } = await import('./csvHandler.js');
            const assistidos = await parsePautaCSV(file);

            if (!app.currentPauta?.id) {
                showNotification("Nenhuma pauta selecionada", "error");
                return;
            }

            let successCount = 0;
            for (const assistido of assistidos) {
                try {
                    const newAssisted = {
                        ...assistido,
                        type: 'agendamento',
                        status: 'pauta',
                        createdAt: new Date().toISOString(),
                        lastActionBy: app.currentUserName || 'Sistema',
                        lastActionTimestamp: new Date().toISOString()
                    };
                    
                    const attendanceRef = collection(app.db, "pautas", app.currentPauta.id, "attendances");
                    await addDoc(attendanceRef, newAssisted);
                    successCount++;
                } catch (e) {
                    console.error("Erro ao importar item:", e);
                }
            }

            showNotification(`${successCount} de ${assistidos.length} registros importados!`);
        } catch (error) {
            showNotification(error.message || "Erro ao importar", "error");
        } finally {
            event.target.value = '';
        }
    },

    /**
     * Calcula nível de prioridade
     */
    getPriorityLevel(assisted) {
        if (!assisted || assisted.status !== 'aguardando') return 'N/A';
        if (assisted.priority === 'URGENTE') return 'URGENTE';

        if (assisted.type === 'avulso') return 'Média';

        if (!assisted.scheduledTime || !assisted.arrivalTime) return 'Média';

        try {
            const scheduled = new Date(`1970-01-01T${assisted.scheduledTime}`);
            const arrival = new Date(assisted.arrivalTime);
            const arrivalTime = new Date(`1970-01-01T${arrival.toTimeString().slice(0, 5)}`);

            const diffMinutes = (arrivalTime - scheduled) / (1000 * 60);

            if (diffMinutes <= 0) return 'Máxima';
            if (diffMinutes <= 20) return 'Média';
            return 'Mínima';
        } catch (e) {
            return 'Média';
        }
    },

    /**
     * Ordena lista de aguardando conforme regras
     */
    sortAguardando(list, orderType) {
        if (!list?.length) return [];
        
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

                try {
                    const scheduled = new Date(`1970-01-01T${item.scheduledTime}`).getTime();
                    if (!item.arrivalTime) return scheduled;

                    const arrival = new Date(item.arrivalTime);
                    const arrivalHour = new Date(`1970-01-01T${arrival.getHours()}:${arrival.getMinutes()}`).getTime();
                    const diff = (arrivalHour - scheduled) / 60000;

                    if (diff > 30) return scheduled + (45 * 60 * 1000);
                    if (diff > 0) return scheduled + (15 * 60 * 1000);
                    return scheduled;
                } catch (e) {
                    return 0;
                }
            };

            const timeA = getVirtualTime(a);
            const timeB = getVirtualTime(b);

            if (timeA !== timeB) return timeA - timeB;

            // Desempate: ordem de chegada
            return (a.checkInOrder || 0) - (b.checkInOrder || 0);
        });
    },

    /**
     * Retorna classe CSS para prioridade
     */
    getPriorityClass(priority) {
        return {
            'URGENTE': 'priority-urgente',
            'Máxima': 'priority-maxima',
            'Média': 'priority-media',
            'Mínima': 'priority-minima'
        }[priority] || '';
    },

    /**
     * Configura ordenação manual com SortableJS
     */
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
                    if (!items.length) return;
                    
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
                        console.error("Erro ao reordenar:", e);
                        showNotification("Erro ao reordenar", "error");
                    }
                }
            });
        }
    },

    /**
     * Exibe tela de seleção de pautas
     */
    showPautaSelectionScreen(app) {
        if (!app?.auth?.currentUser) {
            showNotification("Usuário não autenticado", "error");
            return;
        }

        localStorage.removeItem('lastPautaId');
        localStorage.removeItem('lastPautaType');

        const pautasList = document.getElementById('pautas-list');
        if (!pautasList) return;
        
        pautasList.innerHTML = '<p class="col-span-full text-center">Carregando pautas...</p>';

        const q = query(
            collection(app.db, "pautas"), 
            where("members", "array-contains", app.auth.currentUser.uid)
        );

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
        }, (error) => {
            console.error("Erro ao buscar pautas:", error);
            pautasList.innerHTML = '<p class="col-span-full text-center text-red-500">Erro ao carregar pautas</p>';
        });

        UIService.showScreen('pautaSelection');
    },

    /**
     * Cria card de pauta
     */
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
                try {
                    await deleteDoc(doc(app.db, "pautas", docSnap.id));
                    showNotification("Pauta excluída!");
                } catch (error) {
                    console.error("Erro ao excluir pauta:", error);
                    showNotification("Erro ao excluir pauta", "error");
                }
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

    /**
     * Manipula ações dos cards (cliques em botões)
     */
    handleCardActions(e, app) {
        const button = e.target.closest('button');
        if (!button) return;

        const id = button.dataset.id;
        if (!id) return;

        // Check-in
        if (button.classList.contains('check-in-btn')) {
            const { ModalService } = window;
            if (ModalService?.openArrivalModal) {
                ModalService.openArrivalModal(id, app);
            }
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

        // Voltar de faltoso para pauta
        if (button.classList.contains('return-to-pauta-from-faltoso-btn')) {
            this.updateStatus(app.db, app.currentPauta.id, id, {
                status: 'pauta'
            }, app.currentUserName);
        }

        // Voltar para aguardando
        if (button.classList.contains('return-to-aguardando-btn')) {
            this.updateStatus(app.db, app.currentPauta.id, id, {
                status: 'aguardando',
                attendant: null,
                attendedTime: null
            }, app.currentUserName);
        }

        // Voltar de em atendimento para aguardando
        if (button.classList.contains('return-to-aguardando-from-emAtendimento-btn')) {
            this.updateStatus(app.db, app.currentPauta.id, id, {
                status: 'aguardando',
                assignedCollaborator: null,
                inAttendanceTime: null
            }, app.currentUserName);
        }

        // Voltar de distribuição para aguardando
        if (button.classList.contains('return-to-aguardando-from-dist-btn')) {
            this.updateStatus(app.db, app.currentPauta.id, id, {
                status: 'aguardando',
                distributionStatus: null
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
            const assisted = app.allAssisted?.find(a => a.id === id);
            if (assisted?.priority === 'URGENTE') {
                if (confirm("Remover urgência?")) {
                    this.updateStatus(app.db, app.currentPauta.id, id, {
                        priority: null,
                        priorityReason: null
                    }, app.currentUserName);
                }
            } else {
                const { ModalService } = window;
                if (ModalService?.openPriorityModal) {
                    ModalService.openPriorityModal(id);
                }
            }
        }

        // Atender (com delegação)
        if (button.classList.contains('select-collaborator-btn')) {
            const assisted = app.allAssisted?.find(a => a.id === id);
            const { ModalService } = window;
            if (ModalService?.openSelectCollaboratorModal) {
                ModalService.openSelectCollaboratorModal(id, assisted?.name || '', app.colaboradores);
            }
        }

        // Atender (direto)
        if (button.classList.contains('attend-directly-from-aguardando-btn')) {
            const { ModalService } = window;
            if (ModalService?.openAttendantModal) {
                ModalService.openAttendantModal(id, app.colaboradores);
            }
        }

        // Delegar finalização
        if (button.classList.contains('delegate-finalization-btn')) {
            const assisted = app.allAssisted?.find(a => a.id === id);
            const { ModalService } = window;
            if (ModalService?.openDelegateEmailModal) {
                ModalService.openDelegateEmailModal(id, assisted?.name || '', assisted?.assignedCollaborator?.name);
            }
        }

        // Editar assistido
        if (button.classList.contains('edit-assisted-btn')) {
            const assisted = app.allAssisted?.find(a => a.id === id);
            if (assisted) {
                document.getElementById('edit-assisted-name').value = assisted.name || '';
                document.getElementById('edit-assisted-cpf').value = assisted.cpf || '';
                document.getElementById('edit-assisted-subject').value = assisted.subject || '';
                document.getElementById('edit-scheduled-time').value = assisted.scheduledTime || '';
                window.assistedIdToHandle = id;
                document.getElementById('edit-assisted-modal')?.classList.remove('hidden');
            }
        }

        // Editar atendente
        if (button.classList.contains('edit-attendant-btn')) {
            const assisted = app.allAssisted?.find(a => a.id === id);
            if (assisted) {
                document.getElementById('edit-attendant-name').value = assisted.attendant || '';
                window.assistedIdToHandle = id;
                document.getElementById('edit-attendant-modal')?.classList.remove('hidden');
            }
        }

        // Gerenciar demandas
        if (button.classList.contains('manage-demands-btn')) {
            const { ModalService } = window;
            if (ModalService?.openDemandsModal) {
                ModalService.openDemandsModal(id, app.allAssisted);
            }
        }

        // Ver detalhes
        if (button.classList.contains('view-details-btn')) {
            const { openDetailsModal } = window;
            if (openDetailsModal) {
                openDetailsModal({
                    assistedId: id,
                    pautaId: app.currentPauta?.id,
                    allAssisted: app.allAssisted
                });
            }
        }

        // Voltar de atendido para em atendimento/aguardando
        if (button.classList.contains('return-from-atendido-btn')) {
            const currentAssisted = app.allAssisted?.find(a => a.id === id);
            let updateData = {
                status: 'aguardando',
                attendant: null,
                attendedTime: null,
                finalizadoPeloColaborador: false,
                isConfirmed: false,
                confirmationDetails: null
            };

            if (app.currentPautaData?.useDelegationFlow) {
                updateData.status = 'emAtendimento';
                updateData.attendant = currentAssisted?.attendant;
            }
            
            this.updateStatus(app.db, app.currentPauta.id, id, updateData, app.currentUserName);
        }

        // Confirmar atendido
        if (button.classList.contains('toggle-confirmed-atendido') || button.classList.contains('toggle-confirmed-faltoso')) {
            const currentAssisted = app.allAssisted?.find(a => a.id === id);
            const newConfirmedState = !(currentAssisted?.isConfirmed || false);

            this.updateStatus(app.db, app.currentPauta.id, id, {
                isConfirmed: newConfirmedState,
                confirmationDetails: newConfirmedState ? { 
                    confirmedBy: app.currentUserName, 
                    confirmedAt: new Date().toISOString() 
                } : null
            }, app.currentUserName);
        }
    }
};
