// js/pauta.js - VERSÃO COMPLETA E ATUALIZADA (com todas as funções originais e melhorias para compatibilidade)
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, where, getDocs, getDoc, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showNotification, normalizeText, escapeHTML } from './utils.js';
import { UIService } from './ui.js';
import { logAction } from './admin.js';

export const PautaService = {
    currentListeners: new Map(),
    
    // Mapa para controle de cooldown de ações
    actionCooldown: new Map(),

    /**
     * Utilitário para verificar se é mobile
     */
    isMobileDevice() {
        return window.innerWidth <= 768;
    },

    /**
     * Utilitário para fechar todos os menus rápidos
     */
    closeAllQuickMenus(excludeMenuId = null) {
        document.querySelectorAll('[id^="quick-menu-"]').forEach(menu => {
            if (excludeMenuId === null || menu.id !== excludeMenuId) {
                menu.classList.add('hidden');
                
                // Atualizar botão toggle correspondente
                const toggleId = menu.id.replace('quick-menu', 'quick-toggle');
                const toggle = document.getElementById(toggleId);
                if (toggle) {
                    toggle.setAttribute('aria-expanded', 'false');
                }
            }
        });
    },

    /**
     * Utilitário para verificar cooldown de ações
     */
    canPerformAction(actionId, cooldownMs = 500) {
        const lastAction = this.actionCooldown.get(actionId);
        const now = Date.now();
        
        if (lastAction && now - lastAction < cooldownMs) {
            return false;
        }
        
        this.actionCooldown.set(actionId, now);
        return true;
    },

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
        
        if (!app) {
            console.error("App não definido");
            showNotification("Erro interno: app não definido", "error");
            return;
        }

        if (!app.currentPauta || !app.currentPauta.id) { 
            console.error("Nenhuma pauta selecionada");
            showNotification("Selecione uma pauta primeiro", "error");
            return;
        }

        const nameInput = document.getElementById('assisted-name');
        const cpfInput = document.getElementById('assisted-cpf');
        const subjectInput = document.getElementById('assisted-subject');
        
        if (!nameInput) {
            showNotification("Campo de nome não encontrado", "error");
            return;
        }
        
        const name = nameInput.value.trim();
        if (!name) {
            showNotification("O nome é obrigatório.", "error");
            return;
        }

        const tabAgendamento = document.getElementById('tab-agendamento');
        const currentMode = (tabAgendamento && tabAgendamento.classList.contains('tab-active')) ? 'agendamento' : 'avulso'; 
        
        let isScheduled, hasArrived, scheduledTimeValue;

        if (currentMode === 'agendamento') {
            const scheduledRadio = document.querySelector('input[name="is-scheduled"]:checked');
            const arrivedRadio = document.querySelector('input[name="has-arrived"]:checked');
            
            isScheduled = (scheduledRadio && scheduledRadio.value === 'yes'); 
            hasArrived = (arrivedRadio && arrivedRadio.value === 'yes'); 
            scheduledTimeValue = (isScheduled && document.getElementById('scheduled-time')) ? document.getElementById('scheduled-time').value : null; 
            
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
            const timeInput = document.getElementById('arrival-time');
            if (timeInput && timeInput.value) { 
                const [hours, minutes] = timeInput.value.split(':');
                arrivalDate = new Date();
                arrivalDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
            }
        }

        let assignedRoom = null;
        if (currentMode === 'avulso' && app.currentPautaData && app.currentPautaData.type === 'multisala') { 
            const manualRoomSelect = document.getElementById('manual-room-select');
            assignedRoom = (manualRoomSelect && manualRoomSelect.value) ? manualRoomSelect.value : null; 
        }

        const newAssisted = {
            name: name,
            cpf: (cpfInput && cpfInput.value.trim()) || '', 
            subject: (subjectInput && subjectInput.value.trim()) || 'Não informado', 
            type: currentMode,
            status: hasArrived ? 'aguardando' : 'pauta',
            scheduledTime: scheduledTimeValue,
            arrivalTime: hasArrived && arrivalDate ? arrivalDate.toISOString() : null,
            checkInOrder: hasArrived && arrivalDate ? arrivalDate.getTime() : null,
            assignedCollaborator: null,
            delegatedBy: null,
            delegatedAt: null,
            inAttendanceTime: null,
            attendedBy: null,
            attendedAt: null,
            finalizadoPeloColaborador: false,
            isConfirmed: false,
            confirmationDetails: null,
            room: assignedRoom,
            manualIndex: Date.now(),
            createdAt: new Date().toISOString(),
            lastActionBy: app.currentUserName || 'Sistema',
            lastActionTimestamp: new Date().toISOString(),
            distributionStatus: null,
            distributionHistory: []
        };

        try {
            const attendanceRef = collection(app.db, "pautas", app.currentPauta.id, "attendances");
            const docRef = await addDoc(attendanceRef, newAssisted);
            
            await logAction(
                app.db,
                app.auth,
                app.currentUserName || 'Sistema',
                app.currentPauta.id,
                'ADD_ASSISTED',
                `Adicionou assistido: ${name}`,
                docRef.id
            );
            
            showNotification("Assistido adicionado com sucesso!");
            
            if (nameInput) nameInput.value = '';
            if (cpfInput) cpfInput.value = '';
            if (subjectInput) subjectInput.value = '';
            
            if (document.getElementById('scheduled-time-wrapper')) document.getElementById('scheduled-time-wrapper').classList.add('hidden'); 
            if (document.getElementById('arrival-time-wrapper')) document.getElementById('arrival-time-wrapper').classList.add('hidden'); 
            
            nameInput.focus();
            
        } catch (error) {
            console.error("Erro detalhado ao adicionar:", error);
            
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
    },

    /**
     * Atualiza status de um assistido - CENTRALIZA O REGISTRO DE ÚLTIMA AÇÃO
     */
    async updateStatus(db, pautaId, assistedId, updates, userName) {
        if (!pautaId || !assistedId) return;
        
        try {
            const docRef = doc(db, "pautas", pautaId, "attendances", assistedId);
            const docSnap = await getDoc(docRef);
            const currentData = docSnap.exists() ? docSnap.data() : {};
            
            // ⭐ PADRONIZAÇÃO: Toda atualização grava quem fez e quando
            const finalUpdates = { 
                ...updates,
                lastActionBy: userName || 'Sistema',
                lastActionTimestamp: new Date().toISOString()
            };
            
            if (updates.status === 'aguardando' && updates.arrivalTime) {
                const arrivalDate = new Date(updates.arrivalTime);
                if (!isNaN(arrivalDate.getTime())) {
                    finalUpdates.checkInOrder = arrivalDate.getTime();
                } else if (!currentData.checkInOrder) {
                    finalUpdates.checkInOrder = Date.now();
                }
            } 
            else if (updates.status === 'aguardando' && !currentData.checkInOrder) {
                finalUpdates.checkInOrder = Date.now();
            }
            
            await updateDoc(docRef, finalUpdates);
            
            const action = updates.status ? `Status alterado para: ${updates.status}` : 'Dados atualizados';
            await logAction(
                db,
                window.app && window.app.auth, 
                userName || 'Sistema',
                pautaId,
                'UPDATE_ASSISTED',
                `${action} - ${currentData.name || 'Assistido'}`,
                assistedId
            );
            
        } catch (error) {
            console.error("Erro ao atualizar status:", error);
            showNotification("Erro ao atualizar", "error");
        }
    },

    /**
     * Delegar atendimento para um colaborador
     */
    async delegateAttendance(app, assistedId, collaboratorName, collaboratorId) {
        if (!app || !app.currentPauta || !app.currentPauta.id || !assistedId || !collaboratorName) { 
            showNotification("Dados incompletos para delegação", "error");
            return false;
        }

        try {
            const assisted = app.allAssisted && app.allAssisted.find(a => a.id === assistedId); 
            if (!assisted) {
                showNotification("Assistido não encontrado", "error");
                return false;
            }

            const updates = {
                assignedCollaborator: {
                    id: collaboratorId,
                    name: collaboratorName,
                    delegatedBy: app.currentUserName,
                    delegatedAt: new Date().toISOString()
                },
                delegatedBy: app.currentUserName,
                delegatedAt: new Date().toISOString(),
                status: (app.currentPautaData && app.currentPautaData.useDelegationFlow) ? 'emAtendimento' : 'aguardando', 
                distributionStatus: 'distributed'
            };

            const distributionHistory = assisted.distributionHistory || [];
            distributionHistory.push({
                type: 'delegation',
                from: app.currentUserName,
                to: collaboratorName,
                timestamp: new Date().toISOString(),
                action: 'delegated'
            });
            updates.distributionHistory = distributionHistory;

            await this.updateStatus(
                app.db, 
                app.currentPauta.id, 
                assistedId, 
                updates, 
                app.currentUserName
            );

            showNotification(`Atendimento delegado para ${collaboratorName}`, "success");
            
            await logAction(
                app.db,
                app.auth,
                app.currentUserName,
                app.currentPauta.id,
                'DELEGATE_ATTENDANCE',
                `Delegou atendimento de ${assisted.name} para ${collaboratorName}`,
                assistedId
            );

            return true;
        } catch (error) {
            console.error("Erro ao delegar atendimento:", error);
            showNotification("Erro ao delegar atendimento", "error");
            return false;
        }
    },

    /**
     * Finalizar atendimento (marcar como atendido)
     */
    async finishAttendance(app, assistedId, attendedBy, demands = []) {
        if (!app || !app.currentPauta || !app.currentPauta.id || !assistedId) { 
            showNotification("Dados incompletos para finalizar atendimento", "error");
            return false;
        }

        try {
            const assisted = app.allAssisted && app.allAssisted.find(a => a.id === assistedId); 
            if (!assisted) {
                showNotification("Assistido não encontrado", "error");
                return false;
            }

            const updates = {
                status: 'atendido',
                attendedBy: attendedBy || app.currentUserName,
                attendedAt: new Date().toISOString(),
                inAttendanceTime: new Date().toISOString(),
                finalizadoPeloColaborador: true,
                distributionStatus: 'completed'
            };

            if (assisted.assignedCollaborator) {
                updates.finalizedBy = app.currentUserName;
                updates.finalizedAt = new Date().toISOString();
            }

            if (demands && demands.length > 0) {
                updates.demandas = {
                    descricoes: demands,
                    registeredBy: app.currentUserName,
                    registeredAt: new Date().toISOString()
                };
            }

            const distributionHistory = assisted.distributionHistory || [];
            distributionHistory.push({
                type: 'attendance',
                attendedBy: attendedBy || app.currentUserName,
                timestamp: new Date().toISOString(),
                action: 'completed',
                demands: demands.length > 0 ? demands : []
            });
            updates.distributionHistory = distributionHistory;

            await this.updateStatus(
                app.db, 
                app.currentPauta.id, 
                assistedId, 
                updates, 
                app.currentUserName
            );

            const quemAtendeu = attendedBy || app.currentUserName;
            const quemDelegou = assisted.delegatedBy ? ` (delegado por ${assisted.delegatedBy})` : '';
            
            showNotification(`Atendimento finalizado por ${quemAtendeu}${quemDelegou}`, "success");
            
            await logAction(
                app.db,
                app.auth,
                app.currentUserName,
                app.currentPauta.id,
                'FINISH_ATTENDANCE',
                `Finalizou atendimento de ${assisted.name}. Atendido por: ${quemAtendeu}${quemDelegou}. Demandas: ${demands.length}`,
                assistedId
            );

            return true;
        } catch (error) {
            console.error("Erro ao finalizar atendimento:", error);
            showNotification("Erro ao finalizar atendimento", "error");
            return false;
        }
    },

    /**
     * Chamar Próximo Assistido
     */
    async callNextAssisted(app) {
        if (!app || !app.currentPauta || !app.currentPauta.id) return;
        
        const aguardandoList = app.allAssisted.filter(a => a.status === 'aguardando');
        if (aguardandoList.length === 0) {
            showNotification("A fila de aguardando está vazia.", "info");
            return;
        }
        
        const orderedList = this.sortAguardando(aguardandoList, app.currentPautaData?.ordemAtendimento);
        const nextAssisted = orderedList[0];
        if (!nextAssisted) return;

        window.assistedIdToHandle = nextAssisted.id;
        window.assistedNameToHandle = nextAssisted.name || '';
        window.assistedTipoAcao = app.currentPautaData?.useDelegationFlow ? 'delegar' : 'atender_direto';

        const nameElement = document.getElementById('assisted-to-attend-name');
        if (nameElement) nameElement.textContent = nextAssisted.name;

        const modal = document.getElementById('select-collaborator-modal');
        if (modal) {
            modal.classList.remove('hidden');
            showNotification(`Próximo: "${nextAssisted.name}". Selecione o atendente.`, "info");
            
            setTimeout(() => {
                if (typeof UIService.preencherListaColaboradoresModal === 'function') {
                    UIService.preencherListaColaboradoresModal(app);
                } else {
                    this.preencherListaColaboradoresModal(app);
                }
                const searchInput = document.getElementById('collaborator-search-input');
                if (searchInput) searchInput.focus();
            }, 150);
        }
    },

    /**
     * Remove um assistido
     */
    async deleteAssisted(db, pautaId, assistedId, userName) {
        if (!pautaId || !assistedId) return;
        
        try {
            const docRef = doc(db, "pautas", pautaId, "attendances", assistedId);
            const docSnap = await getDoc(docRef);
            const assistedData = docSnap.exists() ? docSnap.data() : { name: 'Desconhecido' };
            
            await deleteDoc(docRef);
            
            await logAction(
                db,
                window.app && window.app.auth, 
                userName || 'Sistema',
                pautaId,
                'DELETE_ASSISTED',
                `Removeu assistido: ${assistedData.name}`,
                assistedId
            );
            
            showNotification("Registro apagado.");
        } catch (error) {
            console.error("Erro ao deletar:", error);
            showNotification("Erro ao deletar", "error");
        }
    },

    /**
     * Reordena a fila manualmente
     */
    async reorderQueue(db, pautaId, items, userName) {
        if (!pautaId || !items || !items.length) return; 
        
        try {
            const batch = writeBatch(db);
            items.forEach((item, index) => {
                const docRef = doc(db, "pautas", pautaId, "attendances", item.id);
                batch.update(docRef, { 
                    manualIndex: index,
                    lastActionBy: userName || 'Sistema',
                    lastActionTimestamp: new Date().toISOString()
                });
            });
            await batch.commit();
            
            await logAction(
                db,
                window.app && window.app.auth, 
                userName || 'Sistema',
                pautaId,
                'REORDER_QUEUE',
                'Fila reordenada manualmente'
            );
            
            showNotification("Fila reordenada!");
        } catch (error) {
            console.error("Erro ao reordenar:", error);
            showNotification("Erro ao reordenar", "error");
        }
    },

    /**
     * Apaga uma pauta completa
     */
    async deletePauta(db, auth, pautaId, pautaName, userName) {
        if (!confirm(`Tem certeza que deseja apagar a pauta "${pautaName}"?\n\nEsta ação não pode ser desfeita!`)) {
            return false;
        }

        try {
            const pautaRef = doc(db, "pautas", pautaId);
            const pautaDoc = await getDoc(pautaRef);
            
            if (!pautaDoc.exists()) {
                showNotification("Pauta não encontrada", "error");
                return false;
            }

            const pautaData = pautaDoc.data();
            const user = auth.currentUser;
            
            if (!user) return false;
            
            const userDoc = await getDoc(doc(db, "users", user.uid));
            const userData = userDoc.data();
            const isAdmin = (userData && userData.role === 'admin') || (userData && userData.role === 'superadmin'); 
            
            if (pautaData.owner !== user.uid && !isAdmin) {
                showNotification("Você não tem permissão para apagar esta pauta", "error");
                return false;
            }

            const attendanceRef = collection(db, "pautas", pautaId, "attendances");
            const attendanceSnapshot = await getDocs(attendanceRef);
            
            const batch = writeBatch(db);
            attendanceSnapshot.docs.forEach(doc => batch.delete(doc.ref));
            batch.delete(pautaRef);
            await batch.commit();
            
            await logAction(
                db, auth, userName || (user && user.email), pautaId, 'DELETE_PAUTA',
                `Apagou a pauta "${pautaName}"`, pautaId
            );
            
            showNotification("Pauta apagada com sucesso!");
            return true;
        } catch (error) {
            showNotification("Erro ao apagar pauta: " + error.message, "error");
            return false;
        }
    },

    filterPautas(pautas, filterType, currentUserId, currentUserEmail, filtrosAdicionais = {}) {
        if (!pautas || !Array.isArray(pautas)) return [];
        
        const now = new Date();
        let pautasFiltradas = [...pautas];
        
        switch(filterType) {
            case 'my':
                pautasFiltradas = pautasFiltradas.filter(p => p.owner === currentUserId);
                break;
            case 'shared':
                pautasFiltradas = pautasFiltradas.filter(p => 
                    p.owner !== currentUserId && 
                    ((p.members && p.members.includes(currentUserId)) || (p.memberEmails && p.memberEmails.includes(currentUserEmail))) 
                );
                break;
            case 'active':
                pautasFiltradas = pautasFiltradas.filter(p => {
                    if (!p.createdAt) return true;
                    const creationDate = new Date(p.createdAt);
                    const expirationDate = new Date(creationDate);
                    expirationDate.setDate(creationDate.getDate() + 7);
                    return now <= expirationDate;
                });
                break;
            case 'expired':
                pautasFiltradas = pautasFiltradas.filter(p => {
                    if (!p.createdAt) return false;
                    const creationDate = new Date(p.createdAt);
                    const expirationDate = new Date(creationDate);
                    expirationDate.setDate(creationDate.getDate() + 7);
                    return now > expirationDate;
                });
                break;
            case 'periodo':
                const filterDataInicial = document.getElementById('filter-data-inicial');
                if (filtrosAdicionais.dataInicial && filterDataInicial) { 
                    const dataInicial = new Date(filtrosAdicionais.dataInicial);
                    pautasFiltradas = pautasFiltradas.filter(p => {
                        if (!p.createdAt) return true;
                        return new Date(p.createdAt) >= dataInicial;
                    });
                }
                const filterDataFinal = document.getElementById('filter-data-final');
                if (filtrosAdicionais.dataFinal && filterDataFinal) { 
                    const dataFinal = new Date(filtrosAdicionais.dataFinal);
                    dataFinal.setHours(23, 59, 59, 999);
                    pautasFiltradas = pautasFiltradas.filter(p => {
                        if (!p.createdAt) return true;
                        return new Date(p.createdAt) <= dataFinal;
                    });
                }
                const filterTipoPauta = document.getElementById('filter-tipo-pauta');
                if (filtrosAdicionais.tipo && filtrosAdicionais.tipo !== 'todos' && filterTipoPauta) { 
                    pautasFiltradas = pautasFiltradas.filter(p => p.type === filtrosAdicionais.tipo);
                }
                break;
        }
        
        return pautasFiltradas;
    },

    async handleCSVUpload(event, app) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const { parsePautaCSV } = await import('./csvHandler.js');
            const assistidos = await parsePautaCSV(file);

            if (!app.currentPauta || !app.currentPauta.id) {
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
                        lastActionTimestamp: new Date().toISOString(),
                        distributionHistory: []
                    };
                    const attendanceRef = collection(app.db, "pautas", app.currentPauta.id, "attendances");
                    await addDoc(attendanceRef, newAssisted);
                    successCount++;
                } catch (e) {
                    console.error("Erro ao importar item:", e);
                }
            }

            await logAction(app.db, app.auth, app.currentUserName || 'Sistema', app.currentPauta.id, 'IMPORT_CSV', `Importou ${successCount} registros via CSV`);
            showNotification(`${successCount} de ${assistidos.length} registros importados!`);
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

    sortAguardando(list, orderType) {
        if (!list || !list.length) return []; 
        if (orderType === 'manual') return [...list].sort((a, b) => (a.manualIndex || 0) - (b.manualIndex || 0));
        if (orderType === 'chegada') return [...list].sort((a, b) => (a.checkInOrder || 0) - (b.checkInOrder || 0));

        return [...list].sort((a, b) => {
            if (a.priority === 'URGENTE' && b.priority !== 'URGENTE') return -1;
            if (b.priority === 'URGENTE' && a.priority !== 'URGENTE') return 1;

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
                } catch (e) { return 0; }
            };

            const timeA = getVirtualTime(a);
            const timeB = getVirtualTime(b);
            if (timeA !== timeB) return timeA - timeB;
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

        if (app.currentPautaData && app.currentPautaData.ordemAtendimento === 'manual' && !app.isPautaClosed) { 
            if (window.sortableAguardando) window.sortableAguardando.destroy();

            const isMobile = this.isMobileDevice();
            
            window.sortableAguardando = new Sortable(el, {
                animation: isMobile ? 200 : 300,
                ghostClass: 'opacity-20',
                chosenClass: 'ring-2',
                dragClass: 'scale-95',
                handle: '.relative',
                filter: 'button, svg, p, span',
                preventOnFilter: false,
                forceFallback: isMobile,
                fallbackClass: 'sortable-fallback',
                fallbackOnBody: true,
                onEnd: async function () {
                    const items = el.querySelectorAll('[data-id]');
                    if (!items.length) return;
                    
                    const batch = writeBatch(app.db);
                    items.forEach((item, index) => {
                        const docId = item.getAttribute('data-id');
                        const docRef = doc(app.db, "pautas", app.currentPauta.id, "attendances", docId);
                        batch.update(docRef, { 
                            manualIndex: index,
                            lastActionBy: app.currentUserName || 'Sistema',
                            lastActionTimestamp: new Date().toISOString()
                        });
                    });

                    try {
                        await batch.commit();
                        showNotification("Fila Reordenada!");
                    } catch (e) {
                        showNotification("Erro ao reordenar", "error");
                    }
                }
            });
        }
    },

    preencherSelectColaboradores(app, selectId = 'attendant-select') {
        const select = document.getElementById(selectId);
        if (!select) return;
        
        const valorAnterior = select.value;
        while (select.options.length > 1) select.remove(1);
        
        if (app.colaboradores && app.colaboradores.length > 0) {
            const colaboradoresOrdenados = [...app.colaboradores].sort((a, b) => a.nome.localeCompare(b.nome));
            colaboradoresOrdenados.forEach(c => {
                const option = document.createElement('option');
                option.value = c.nome;
                option.textContent = c.nome + (c.cargo ? ` (${c.cargo})` : '');
                select.appendChild(option);
            });
            if (valorAnterior) {
                const options = Array.from(select.options).map(opt => opt.value);
                if (options.includes(valorAnterior)) select.value = valorAnterior;
            }
        } else {
            const option = document.createElement('option');
            option.value = "";
            option.textContent = "Nenhum colaborador cadastrado";
            option.disabled = true;
            select.appendChild(option);
        }
        
        if (this.isMobileDevice()) select.style.fontSize = '16px';
    },

    /**
     * BLINDAGEM EXTREMA PARA O MODAL DE COLABORADORES (FALLBACK)
     * Essa função garante que nunca vai quebrar, suportando vários IDs de tela.
     */
    preencherListaColaboradoresModal(app) {
        // Suporta tanto o ID novo de ui.js quanto o antigo de pauta.js
        const container = document.getElementById('collaborator-selection-list') || document.getElementById('collaborators-list-container');
        const searchInput = document.getElementById('collaborator-search-input');
        
        if (!container) return;
        
        if (searchInput) searchInput.value = '';
        container.innerHTML = '';
        
        window.selectedCollaboratorId = null;
        window.selectedCollaboratorName = null;
        
        // 1. Botão Não Atribuir
        const btnNaoAtribuir = document.createElement('div');
        btnNaoAtribuir.className = "collaborator-item p-3 border rounded-lg hover:bg-blue-50 cursor-pointer transition-all mb-2 flex items-center gap-3";
        btnNaoAtribuir.dataset.nome = 'nao atribuir';
        btnNaoAtribuir.innerHTML = `
            <div class="w-8 h-8 rounded-full bg-gray-400 flex items-center justify-center text-white text-xs flex-shrink-0">🚫</div>
            <div class="overflow-hidden">
                <p class="font-bold text-gray-800 truncate">Não atribuir</p>
                <p class="text-[10px] text-gray-500 truncate">Atender sem atribuir a nenhum colaborador</p>
            </div>
        `;
        btnNaoAtribuir.addEventListener('click', () => {
            container.querySelectorAll('.collaborator-item').forEach(d => d.classList.remove('bg-blue-100', 'border-blue-500', 'border-2'));
            btnNaoAtribuir.classList.add('bg-blue-100', 'border-blue-500', 'border-2');
            window.selectedCollaboratorId = 'null';
            window.selectedCollaboratorName = null;
        });
        container.appendChild(btnNaoAtribuir);
        
        // 2. Renderiza lista com Try/Catch e suporte a falhas
        const colabs = app?.colaboradores || window.app?.colaboradores || [];
        if (colabs.length === 0) {
            container.innerHTML += '<p class="text-gray-500 text-center py-4 text-sm">Nenhum colaborador carregado.</p>';
        } else {
            const ordenados = [...colabs].sort((a,b) => String(a.nome||'').localeCompare(String(b.nome||'')));
            ordenados.forEach(collab => {
                try {
                    const rawNome = typeof collab.nome === 'object' ? (collab.nome.nome || collab.nome.name || '') : (collab.nome || '');
                    const nomeSeguro = String(rawNome).trim() || 'Nome não informado';

                    const div = document.createElement('div');
                    div.className = "collaborator-item p-3 border rounded-lg hover:bg-blue-50 cursor-pointer transition-all mb-2 flex items-center gap-3";
                    div.dataset.nome = nomeSeguro.toLowerCase();

                    let iniciais = '??';
                    const parts = nomeSeguro.split(/\s+/).filter(Boolean);
                    if (parts.length >= 2) iniciais = (parts[0][0] + parts[parts.length-1][0]).toUpperCase();
                    else if (parts.length === 1 && parts[0].length >= 1) iniciais = parts[0].substring(0,2).toUpperCase();

                    div.innerHTML = `
                        <div class="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">${escapeHTML(iniciais)}</div>
                        <div class="overflow-hidden">
                            <p class="font-bold text-gray-800 truncate pr-2">${escapeHTML(nomeSeguro)}</p>
                            <p class="text-[10px] text-gray-500 truncate">${escapeHTML(collab.cargo || 'Membro')} | Eq. ${escapeHTML(collab.equipe || 'N/A')}</p>
                        </div>
                    `;
                    
                    div.addEventListener('click', () => {
                        container.querySelectorAll('.collaborator-item').forEach(d => d.classList.remove('bg-blue-100', 'border-blue-500', 'border-2'));
                        div.classList.add('bg-blue-100', 'border-blue-500', 'border-2');
                        window.selectedCollaboratorId = collab.id || collab.nome;
                        window.selectedCollaboratorName = nomeSeguro;
                    });
                    container.appendChild(div);
                } catch(e) {}
            });
        }
        
        // 3. Aplica pesquisa ultra-robusta
        if (searchInput) {
            const applyFilter = (term) => {
                const t = (term || '').toLowerCase().trim();
                container.querySelectorAll('.collaborator-item').forEach(item => {
                    const nome = (item.dataset.nome || '').toLowerCase();
                    item.style.display = (!t || nome.includes(t)) ? 'flex' : 'none';
                });
            };
            searchInput.oninput = (e) => applyFilter(e.target.value);
            applyFilter(''); // Garante que tudo inicia visível
        }
    },

    showPautaSelectionScreen(app) {
        if (!app || !app.auth || !app.auth.currentUser) return;
        localStorage.removeItem('lastPautaId');
        localStorage.removeItem('lastPautaType');
        UIService.renderPautaFilters('filters-container', app.currentPautaFilter || 'all', async (filter) => {
            app.currentPautaFilter = filter;
            await this.loadPautasWithFilter(app);
        }, app);
        this.loadPautasWithFilter(app);
        UIService.showScreen('pautaSelection');
    },

    async loadPautasWithFilter(app) {
        const user = app.auth.currentUser;
        if (!user) return;
        const pautasList = document.getElementById('pautas-list');
        if (!pautasList) return;
        pautasList.innerHTML = '<p class="col-span-full text-center py-8">Carregando pautas...</p>';

        try {
            const q = query(collection(app.db, "pautas"), where("members", "array-contains", user.uid));
            const snapshot = await getDocs(q);
            let pautas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            const filtrosAdicionais = {};
            if (app.currentPautaFilter === 'periodo') {
                const filterDataInicial = document.getElementById('filter-data-inicial');
                filtrosAdicionais.dataInicial = filterDataInicial ? filterDataInicial.value : null; 
                const filterDataFinal = document.getElementById('filter-data-final');
                filtrosAdicionais.dataFinal = filterDataFinal ? filterDataFinal.value : null; 
                const filterTipoPauta = document.getElementById('filter-tipo-pauta');
                filtrosAdicionais.tipo = filterTipoPauta ? filterTipoPauta.value : null; 
            }
            
            const filteredPautas = this.filterPautas(pautas, app.currentPautaFilter || 'all', user.uid, user.email, filtrosAdicionais);
            this.renderPautaCards(filteredPautas, user.uid, user.email, app);
        } catch (error) {
            pautasList.innerHTML = '<p class="col-span-full text-center text-red-500">Erro ao carregar pautas</p>';
        }
    },

    renderPautaCards(pautas, currentUserId, currentUserEmail, app) {
        const container = document.getElementById('pautas-list');
        if (!container) return;
        if (pautas.length === 0) {
            container.innerHTML = '<div class="col-span-full text-center py-12 bg-gray-50 rounded-lg"><p class="text-gray-500">Nenhuma pauta encontrada com este filtro.</p></div>';
            return;
        }

        const now = new Date();
        container.innerHTML = pautas.map(pauta => {
            const isOwner = pauta.owner === currentUserId;
            let isExpired = false;
            let dataCriacao = 'Desconhecida';
            let dataExpiracao = 'Desconhecida';
            
            if (pauta.createdAt) {
                const creationDate = new Date(pauta.createdAt);
                dataCriacao = creationDate.toLocaleDateString('pt-BR');
                const expirationDate = new Date(creationDate);
                expirationDate.setDate(creationDate.getDate() + 7);
                dataExpiracao = expirationDate.toLocaleDateString('pt-BR');
                if (now > expirationDate) isExpired = true;
            }
            
            const expiracaoTexto = isExpired ? 'Expirou em:' : 'Será eliminada em:';
            const expiredClass = isExpired ? 'opacity-60 bg-gray-100' : '';
            
            return `
            <div class="relative bg-white p-6 rounded-lg shadow-md flex flex-col justify-between h-full ${expiredClass} ${!isExpired ? 'hover:shadow-xl transition-shadow cursor-pointer' : 'cursor-not-allowed'}" 
                 ${!isExpired ? `onclick="window.app.loadPauta('${pauta.id}', '${escapeHTML(pauta.name)}', '${pauta.type}')"` : `onclick="showNotification('🔒 Esta pauta expirou e não pode ser acessada', 'error')"`}
                 role="${!isExpired ? 'button' : 'presentation'}" tabindex="${!isExpired ? '0' : '-1'}">
                
                ${isOwner ? `
                <button onclick="event.stopPropagation(); window.app.deletePauta('${pauta.id}', '${escapeHTML(pauta.name)}')" 
                        class="absolute top-3 right-3 p-1 rounded-full text-gray-400 hover:text-red-600 transition-colors z-10" title="Excluir pauta">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                </button>
                ` : ''}
                
                <h3 class="font-bold text-xl text-gray-800 mb-2 pr-8" title="${escapeHTML(pauta.name)}">${escapeHTML(pauta.name)}</h3>
                <p class="text-sm text-gray-600 mb-4">Membros: <span class="font-semibold">${(pauta.memberEmails && pauta.memberEmails.length) || 1}</span></p>
                
                <div class="mt-4 pt-2 border-t border-gray-200">
                    <p class="text-xs text-gray-500">Criada em: <span class="font-bold">${dataCriacao}</span></p>
                    <p class="text-xs ${isExpired ? 'text-gray-500' : 'text-red-600'}">${expiracaoTexto} <span class="font-bold">${dataExpiracao}</span></p>
                </div>
                ${isOwner ? '<span class="absolute bottom-3 left-3 text-[10px] text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Criador</span>' : ''}
            </div>
            `;
        }).join('');
    },

    createPautaCard(docSnap, isExpired, app) {
        const pauta = docSnap.data();
        const card = document.createElement('div');
        card.className = "relative bg-white p-4 md:p-6 rounded-lg shadow-md flex flex-col justify-between h-full";

        if (isExpired) card.classList.add('opacity-60', 'bg-gray-100', 'cursor-not-allowed');
        else card.classList.add('hover:shadow-xl', 'transition-shadow', 'cursor-pointer');

        const deleteButton = document.createElement('button');
        deleteButton.className = "absolute top-2 right-2 md:top-3 md:right-3 p-1 rounded-full text-gray-400 hover:text-red-600 transition-colors";
        deleteButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 md:h-5 md:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>`;

        deleteButton.addEventListener('click', async (event) => {
            event.stopPropagation();
            if (confirm(`Tem certeza que deseja apagar a pauta "${pauta.name}"?`)) {
                try {
                    await deleteDoc(doc(app.db, "pautas", docSnap.id));
                    showNotification("Pauta excluída!");
                } catch (error) {
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
                <h3 class="font-bold text-lg md:text-xl mb-1 md:mb-2 pr-6">${escapeHTML(pauta.name)}</h3>
                <p class="text-xs md:text-sm text-gray-600">Membros: ${(pauta.memberEmails && pauta.memberEmails.length) || 1}</p>
            </div>
            <div class="mt-3 md:mt-4 pt-2 border-t border-gray-200">
                <p class="text-[10px] md:text-xs text-gray-500">Criada em: <strong>${creationDate.toLocaleDateString('pt-BR')}</strong></p>
                <p class="text-[10px] md:text-xs ${isExpired ? 'text-gray-500' : 'text-red-600'}">
                    ${isExpired ? 'Expirou em:' : 'Será eliminada em:'} <strong>${expirationDate.toLocaleDateString('pt-BR')}</strong>
                </p>
            </div>
        `;
        if (!isExpired) {
            card.addEventListener('click', () => app.loadPauta(docSnap.id, pauta.name, pauta.type));
        }
        return card;
    },

    /**
     * Manipula ações dos cards - REESTRUTURADO PARA EVITAR BUG DE TELA BRANCA
     */
    handleCardActions(e, app) {
        const button = e.target.closest('button');
        if (!button) return;

        const id = button.dataset.id;
        if (!id) return;

        const isMobile = this.isMobileDevice();

        // Toggle do menu de ações rápidas
        if (button.classList.contains('quick-action-toggle')) {
            e.stopPropagation();
            const menuId = `quick-menu-${id}`;
            const menu = document.getElementById(menuId);
            if (!menu) return;
            this.closeAllQuickMenus(menuId);
            const isHidden = menu.classList.contains('hidden');
            menu.classList.toggle('hidden');
            button.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
            if (!menu.classList.contains('hidden')) {
                setTimeout(() => {
                    const clickOutsideHandler = (e) => {
                        if (!menu.contains(e.target) && !button.contains(e.target)) {
                            menu.classList.add('hidden');
                            button.setAttribute('aria-expanded', 'false');
                            document.removeEventListener('click', clickOutsideHandler);
                        }
                    };
                    document.addEventListener('click', clickOutsideHandler);
                }, 0);
            }
        }

        // Clique em uma ação rápida do menu
        if (button.classList.contains('quick-action-item')) {
            e.stopPropagation();
            const actionKey = `${id}-${button.dataset.tipo}`;
            if (!this.canPerformAction(actionKey)) return;
            
            const tipoAcao = button.dataset.tipo;
            const assisted = app.allAssisted && app.allAssisted.find(a => a.id === id); 
            if (!assisted) return;
            
            const menu = document.getElementById(`quick-menu-${id}`);
            if (menu) menu.classList.add('hidden');
            
            const tipoDescricao = {
                'reagendar': 'Reagendamento', 'agendar': 'Agendamento',
                'consulta': 'Consulta Processual', 'outros': 'Outros Assuntos'
            }[tipoAcao] || tipoAcao;
            
            window.assistedIdToHandle = id;
            window.assistedNameToHandle = assisted.name || '';
            window.assistedTipoAcao = tipoAcao;
            window.assistedTipoDescricao = tipoDescricao;
            
            const nameElement = document.getElementById('assisted-to-attend-name');
            if (nameElement) nameElement.textContent = assisted.name || '';
            
            showNotification(`${tipoDescricao} para ${assisted.name}`, "info");
            
            const modal = document.getElementById('select-collaborator-modal');
            if (modal) {
                modal.classList.remove('hidden');
                
                // ⭐ SOLUÇÃO DE ESPERA E FALLBACK (Aqui acontece a mágica do modal)
                setTimeout(() => {
                    if (typeof UIService.preencherListaColaboradoresModal === 'function') {
                        UIService.preencherListaColaboradoresModal(app);
                    } else {
                        this.preencherListaColaboradoresModal(app);
                    }
                    const firstInput = modal.querySelector('input, button, [tabindex="0"]');
                    if (firstInput) firstInput.focus();
                }, 150);
            }
        }

        if (button.classList.contains('check-in-btn')) {
            window.assistedIdToHandle = id;
            const modal = document.getElementById('arrival-modal');
            if (modal) {
                document.getElementById('arrival-time-input').value = new Date().toTimeString().slice(0,5);
                if (isMobile) document.getElementById('arrival-time-input').setAttribute('pattern', '[0-9]{2}:[0-9]{2}');
                modal.classList.remove('hidden');
            }
        }

        if (button.classList.contains('faltou-btn')) {
            this.updateStatus(app.db, app.currentPauta.id, id, { status: 'faltoso' }, app.currentUserName);
        }

        if (button.classList.contains('return-to-pauta-btn')) {
            this.updateStatus(app.db, app.currentPauta.id, id, {
                status: 'pauta', arrivalTime: null, priority: null,
                assignedCollaborator: null, inAttendanceTime: null, room: null, distributionStatus: null
            }, app.currentUserName);
        }

        if (button.classList.contains('return-to-pauta-from-faltoso-btn')) {
            this.updateStatus(app.db, app.currentPauta.id, id, { status: 'pauta' }, app.currentUserName);
        }

        if (button.classList.contains('return-to-aguardando-btn')) {
            this.updateStatus(app.db, app.currentPauta.id, id, {
                status: 'aguardando', attendant: null, attendedTime: null
            }, app.currentUserName);
        }

        if (button.classList.contains('return-to-aguardando-from-emAtendimento-btn')) {
            const assisted = app.allAssisted && app.allAssisted.find(a => a.id === id); 
            this.updateStatus(app.db, app.currentPauta.id, id, {
                status: 'aguardando', assignedCollaborator: null, delegatedBy: null,
                delegatedAt: null, inAttendanceTime: null, distributionStatus: null
            }, app.currentUserName);
            if (assisted && assisted.assignedCollaborator) { 
                showNotification(`Delegação para ${assisted.assignedCollaborator.name} removida`, "info");
            }
        }

        if (button.classList.contains('return-to-aguardando-from-dist-btn')) {
            this.updateStatus(app.db, app.currentPauta.id, id, { status: 'aguardando', distributionStatus: null }, app.currentUserName);
        }

        if (button.classList.contains('delete-btn')) {
            if (confirm("Tem certeza?")) this.deleteAssisted(app.db, app.currentPauta.id, id, app.currentUserName);
        }

        if (button.classList.contains('priority-btn')) {
            const assisted = app.allAssisted && app.allAssisted.find(a => a.id === id); 
            if (assisted && assisted.priority === 'URGENTE') { 
                if (confirm("Remover urgência?")) {
                    this.updateStatus(app.db, app.currentPauta.id, id, { priority: null, priorityReason: null }, app.currentUserName);
                }
            } else {
                window.assistedIdToHandle = id;
                const modal = document.getElementById('priority-reason-modal');
                if (modal) {
                    document.querySelectorAll('.p-chip').forEach(c => c.classList.remove('selected'));
                    document.getElementById('priority-reason-input').value = '';
                    modal.classList.remove('hidden');
                }
            }
        }

        // Atender com delegação na tela Aguardando
        if (button.classList.contains('select-collaborator-btn')) {
            const assisted = app.allAssisted && app.allAssisted.find(a => a.id === id); 
            if (!assisted) return;
            
            window.assistedIdToHandle = id;
            window.assistedNameToHandle = assisted.name || '';
            window.assistedTipoAcao = 'delegar';
            document.getElementById('assisted-to-attend-name').textContent = assisted.name || '';
            
            const modal = document.getElementById('select-collaborator-modal');
            if (modal) {
                modal.classList.remove('hidden');
                
                // ⭐ SOLUÇÃO DE ESPERA E FALLBACK 
                setTimeout(() => {
                    if (typeof UIService.preencherListaColaboradoresModal === 'function') {
                        UIService.preencherListaColaboradoresModal(app);
                    } else {
                        this.preencherListaColaboradoresModal(app);
                    }
                    const searchInput = document.getElementById('collaborator-search-input');
                    if (searchInput) searchInput.focus();
                }, 150);
                
                const confirmBtn = document.getElementById('confirm-select-collaborator');
                if (confirmBtn) {
                    const newConfirmBtn = confirmBtn.cloneNode(true);
                    if (confirmBtn.parentNode) confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
                    newConfirmBtn.addEventListener('click', async () => {
                        if (window.selectedCollaboratorId && window.selectedCollaboratorId !== 'null') {
                            await this.delegateAttendance(
                                app, window.assistedIdToHandle, window.selectedCollaboratorName, window.selectedCollaboratorId
                            );
                            modal.classList.add('hidden');
                        } else if (window.selectedCollaboratorId === 'null') {
                            if (document.getElementById('attendant-modal')) document.getElementById('attendant-modal').classList.remove('hidden'); 
                            this.preencherSelectColaboradores(app, 'attendant-select');
                            modal.classList.add('hidden');
                        } else {
                            showNotification("Selecione um colaborador", "warning");
                        }
                    });
                }
            }
        }

        if (button.classList.contains('attend-directly-from-aguardando-btn')) {
            window.assistedIdToHandle = id;
            this.preencherSelectColaboradores(app, 'attendant-select');
            const modal = document.getElementById('attendant-modal');
            if (modal) {
                modal.classList.remove('hidden');
                const confirmBtn = document.getElementById('confirm-attendant');
                if (confirmBtn) {
                    const newConfirmBtn = confirmBtn.cloneNode(true);
                    if (confirmBtn.parentNode) confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
                    newConfirmBtn.addEventListener('click', async () => {
                        const attendant = document.getElementById('attendant-select').value;
                        if (attendant) {
                            await this.finishAttendance(app, window.assistedIdToHandle, attendant, []);
                            modal.classList.add('hidden');
                        } else {
                            showNotification("Selecione um atendente", "warning");
                        }
                    });
                }
            }
        }

        if (button.classList.contains('delegate-finalization-btn')) {
            const assisted = app.allAssisted && app.allAssisted.find(a => a.id === id); 
            if (!assisted) return;
            window.assistedIdForDelegation = id;
            window.assistedNameForDelegation = assisted.name || '';
            window.collaboratorNameForDelegation = (assisted.assignedCollaborator && assisted.assignedCollaborator.name) || ''; 
            document.getElementById('delegate-assisted-name').textContent = assisted.name || '';
            
            const modal = document.getElementById('delegate-email-modal');
            if (modal) {
                modal.classList.remove('hidden');
                const confirmBtn = document.getElementById('confirm-delegate-email');
                if (confirmBtn) {
                    const newConfirmBtn = confirmBtn.cloneNode(true);
                    if (confirmBtn.parentNode) confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
                    newConfirmBtn.addEventListener('click', async () => {
                        const email = document.getElementById('delegate-email').value;
                        if (email) {
                            showNotification(`Notificação enviada para ${email}`, "success");
                            modal.classList.add('hidden');
                        } else {
                            showNotification("Informe um email", "warning");
                        }
                    });
                }
            }
        }

        if (button.classList.contains('edit-assisted-btn')) {
            const assisted = app.allAssisted && app.allAssisted.find(a => a.id === id); 
            if (assisted) {
                document.getElementById('edit-assisted-name').value = assisted.name || '';
                document.getElementById('edit-assisted-cpf').value = assisted.cpf || '';
                document.getElementById('edit-assisted-subject').value = assisted.subject || '';
                document.getElementById('edit-scheduled-time').value = assisted.scheduledTime || '';
                window.assistedIdToHandle = id;
                if (document.getElementById('edit-assisted-modal')) document.getElementById('edit-assisted-modal').classList.remove('hidden'); 
            }
        }

        if (button.classList.contains('edit-attendant-btn')) {
            const assisted = app.allAssisted && app.allAssisted.find(a => a.id === id); 
            if (assisted) {
                this.preencherSelectColaboradores(app, 'edit-attendant-select');
                const select = document.getElementById('edit-attendant-select');
                if (select && assisted.attendedBy) {
                    let nomeAtendente = typeof assisted.attendedBy === 'object' ? assisted.attendedBy.nome || '' : assisted.attendedBy;
                    if (Array.from(select.options).map(opt => opt.value).includes(nomeAtendente)) {
                        select.value = nomeAtendente;
                    }
                }
                window.assistedIdToHandle = id;
                if (document.getElementById('edit-attendant-modal')) document.getElementById('edit-attendant-modal').classList.remove('hidden'); 
            }
        }

        if (button.classList.contains('manage-demands-btn')) {
            const assisted = app.allAssisted && app.allAssisted.find(a => a.id === id); 
            if (assisted) {
                window.assistedIdToHandle = id;
                document.getElementById('demands-assisted-name-modal').textContent = assisted.name || '';
                const infoDiv = document.createElement('div');
                infoDiv.className = "mb-4 p-3 bg-gray-50 rounded-lg text-sm";
                let infoHtml = '';
                if (assisted.attendedBy) infoHtml += `<p><span class="font-semibold">Atendido por:</span> ${assisted.attendedBy}</p>`;
                if (assisted.delegatedBy) {
                    infoHtml += `<p><span class="font-semibold">Delegado por:</span> ${assisted.delegatedBy}`;
                    if (assisted.assignedCollaborator) infoHtml += ` para ${assisted.assignedCollaborator.name}`;
                    infoHtml += `</p>`;
                }
                if (assisted.demandas && assisted.demandas.descricoes && assisted.demandas.descricoes.length > 0) { 
                    infoHtml += `<p><span class="font-semibold">Demandas registradas:</span> ${assisted.demandas.descricoes.length}</p>`;
                }
                
                if (infoHtml) {
                    infoDiv.innerHTML = infoHtml;
                    const modal = document.getElementById('demands-modal');
                    const existingInfo = modal.querySelector('.attendance-info');
                    if (existingInfo) existingInfo.remove();
                    infoDiv.classList.add('attendance-info');
                    const demandsListContainer = modal.querySelector('.demands-list-container');
                    if (demandsListContainer) modal.insertBefore(infoDiv, demandsListContainer);
                }
                
                const container = document.getElementById('demands-modal-list-container');
                if (container) {
                    container.innerHTML = '';
                    const demands = (assisted.demandas && assisted.demandas.descricoes) || []; 
                    if (demands.length === 0) {
                        container.innerHTML = '<p class="text-gray-500 text-center">Nenhuma demanda adicional.</p>';
                    } else {
                        demands.forEach(demand => {
                            const li = document.createElement('li');
                            li.className = 'flex justify-between items-center p-2 bg-white rounded-md text-xs md:text-sm';
                            li.innerHTML = `<span>${escapeHTML(demand)}</span><button class="remove-demand-item-btn text-red-500 text-[10px] md:text-xs">Remover</button>`;
                            container.appendChild(li);
                        });
                    }
                }
                if (document.getElementById('demands-modal')) document.getElementById('demands-modal').classList.remove('hidden'); 
            }
        }

        if (button.classList.contains('view-details-btn')) {
            if (window.openDetailsModal) {
                window.openDetailsModal({
                    assistedId: id,
                    pautaId: app.currentPauta && app.currentPauta.id, 
                    allAssisted: app.allAssisted
                });
            } else {
                showNotification("Erro ao abrir detalhes", "error");
            }
        }

        if (button.classList.contains('return-from-atendido-btn')) {
            const currentAssisted = app.allAssisted && app.allAssisted.find(a => a.id === id); 
            let updateData = {
                status: 'aguardando', attendant: null, attendedTime: null, attendedBy: null, attendedAt: null,
                finalizadoPeloColaborador: false, isConfirmed: false, confirmationDetails: null, distributionStatus: 'pending'
            };
            if (currentAssisted && currentAssisted.assignedCollaborator) { 
                updateData.status = 'emAtendimento';
                updateData.attendant = currentAssisted.assignedCollaborator.name;
                updateData.distributionStatus = 'distributed';
            }
            this.updateStatus(app.db, app.currentPauta.id, id, updateData, app.currentUserName);
        }

        if (button.classList.contains('toggle-confirmed-atendido') || button.classList.contains('toggle-confirmed-faltoso')) {
            const currentAssisted = app.allAssisted && app.allAssisted.find(a => a.id === id); 
            const newConfirmedState = !(currentAssisted && (currentAssisted.isConfirmed || false)); 

            this.updateStatus(app.db, app.currentPauta.id, id, {
                isConfirmed: newConfirmedState,
                confirmationDetails: newConfirmedState ? { confirmedBy: app.currentUserName, confirmedAt: new Date().toISOString() } : null
            }, app.currentUserName);
            showNotification(`Status atualizado para ${newConfirmedState ? 'Confirmado' : 'Não Confirmado'}.`, 'info');
        }
    },

    refreshAssistedList(app) {
        if (!app || !app.currentPauta || !app.currentPauta.id) return; 
        if (app.unsubscribeFromAttendances) {
            console.log("🔄 Lista de assistidos será atualizada pelo listener");
        } else {
            this.loadAssistedList(app);
        }
    },
    
    async loadAssistedList(app) {
        if (!app || !app.currentPauta || !app.currentPauta.id) return; 
        try {
            const attendanceRef = collection(app.db, "pautas", app.currentPauta.id, "attendances");
            const snapshot = await getDocs(attendanceRef);
            app.allAssisted = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            UIService.renderAssistedLists(app);
        } catch (error) {
            console.error("Erro ao carregar lista:", error);
        }
    },
};
