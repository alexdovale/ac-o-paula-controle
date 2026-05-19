// js/pauta.js - VERSÃO COMPLETA E CONSOLIDADA (PADRÃO SIGAP)
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, where, getDocs, getDoc, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showNotification, normalizeText, escapeHTML, playSound } from './utils.js';
import { UIService } from './ui.js';
import { logAction } from './admin.js';
import { EmailService } from './emailService.js';

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

    setupAttendancesListener(db, pautaId, callback) {
        if (this.currentListeners.has(pautaId)) this.currentListeners.get(pautaId)();
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

    injectRoomSearches(app) {
        // Função mantida por segurança. A renderização das barras agora é feita nativamente pelo ui.js
    },

    populateRoomSelects(app) {
        const arrivalSelect = document.getElementById('arrival-room-select');
        const editSelect = document.getElementById('edit-room-select');
        const arrivalContainer = document.getElementById('arrival-room-container');
        
        const rooms = app.currentPautaData?.customRooms || app.currentPautaData?.rooms || [];

        if (app.currentPautaData?.type === 'multisala' && rooms.length > 0) {
            const optionsHtml = rooms.map(r => `<option value="${escapeHTML(r)}">${escapeHTML(r)}</option>`).join('');
            
            if (arrivalSelect) {
                arrivalSelect.innerHTML = optionsHtml;
                if (arrivalContainer) arrivalContainer.classList.remove('hidden');
            }
            if (editSelect) {
                editSelect.innerHTML = optionsHtml;
                if (editSelect.parentElement) editSelect.parentElement.classList.remove('hidden');
            }
        } else {
            if (arrivalContainer) arrivalContainer.classList.add('hidden');
            if (editSelect && editSelect.parentElement) editSelect.parentElement.classList.add('hidden');
        }
    },

    async addAssistedManual(app, assistedData) {
        return this.addAssistedProgrammatic(app.db, app.currentPauta.id, assistedData, app.currentUserName || 'Sistema');
    },

    async addAssisted(app) {
        if (!app) {
            showNotification("Erro interno: app não definido", "error");
            playSound('error');
            return;
        }

        if (!app.currentPauta || !app.currentPauta.id) {
            showNotification("Selecione uma pauta primeiro", "error");
            playSound('error');
            return;
        }

        const nameInput = document.getElementById('assisted-name');
        const cpfInput = document.getElementById('assisted-cpf');
        const subjectInput = document.getElementById('assisted-subject');
        
        if (!nameInput || !cpfInput || !subjectInput) { 
            showNotification("Erro interno: Campos de formulário não encontrados no HTML.", "error");
            playSound('error');
            return;
        }
        
        const name = nameInput.value.trim();
        const subject = subjectInput.value.trim(); 

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
                showNotification("Por favor, informe o horário agendado ou marque como 'já chegou'.", "error");
                playSound('error');
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
            } else {
                arrivalDate = new Date();
            }
        }

        let assignedRoom = null;
        if (currentMode === 'avulso' && app.currentPautaData && app.currentPautaData.type === 'multisala') {
            const manualRoomSelect = document.getElementById('manual-room-select');
            assignedRoom = (manualRoomSelect && manualRoomSelect.value) ? manualRoomSelect.value : null;
        }

        const newAssisted = {
            name: name || 'Assistido sem nome',
            cpf: (cpfInput && cpfInput.value.trim()) || '',
            subject: subject || 'Não informado',
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
                `Adicionou assistido: ${newAssisted.name}`,
                docRef.id
            );
            
            showNotification(`Assistido "${newAssisted.name}" adicionado com sucesso!`, 'success');
            playSound('notification');
            
            if (nameInput) nameInput.value = '';
            if (cpfInput) cpfInput.value = '';
            if (subjectInput) subjectInput.value = '';
            
            if (currentMode === 'agendamento') {
                if (document.getElementById('scheduled-time-wrapper')) document.getElementById('scheduled-time-wrapper').classList.add('hidden');
                if (document.getElementById('arrival-time-wrapper')) document.getElementById('arrival-time-wrapper').classList.add('hidden');
                document.querySelector('input[name="is-scheduled"][value="no"]').checked = true;
                document.querySelector('input[name="has-arrived"][value="no"]').checked = true;     
            } else {
                if (document.getElementById('arrival-time-wrapper')) document.getElementById('arrival-time-wrapper').classList.remove('hidden');
                document.getElementById('arrival-time').value = new Date().toTimeString().slice(0, 5);
            }
            
            nameInput.focus();
            
        } catch (error) {
            let mensagem = "Erro ao adicionar assistido. Verifique sua conexão e permissões.";
            if (error.code === 'permission-denied') {
                mensagem = "Permissão negada. Você não tem acesso para adicionar assistidos.";
            } else if (error.code === 'unavailable') {
                mensagem = "Serviço indisponível. Verifique sua conexão com a internet.";
            }
            showNotification(mensagem, "error");
            playSound('error');
        }
    },

    async addAssistedProgrammatic(db, pautaId, assistedData, userName) {
        if (!pautaId || !assistedData || !userName) {
            showNotification("Dados incompletos para adicionar assistido.", "error");
            return false;
        }

        try {
            const isMultisala = window.app && window.app.currentPautaData && window.app.currentPautaData.type === 'multisala';

            const newAssisted = {
                ...assistedData,
                room: isMultisala ? (assistedData.room || null) : null,
                status: assistedData.status || 'pauta', 
                createdAt: new Date().toISOString(),
                lastActionBy: userName,
                lastActionTimestamp: new Date().toISOString(),
                distributionHistory: []
            };

            const attendanceRef = collection(db, "pautas", pautaId, "attendances");
            const docRef = await addDoc(attendanceRef, newAssisted);

            await logAction(
                db,
                window.app && window.app.auth,
                userName,
                pautaId,
                'ADD_ASSISTED',
                `Adicionou assistido: ${assistedData.name || 'Novo Assistido'}`,
                docRef.id
            );

            showNotification(`Assistido "${assistedData.name || 'Novo Assistido'}" adicionado com sucesso!`, "success");
            return true;

        } catch (error) {
            console.error("Erro ao adicionar assistido:", error);
            showNotification("Erro ao adicionar assistido: " + error.message, "error");
            return false;
        }
    },

    async updateStatus(db, pautaId, assistedId, updates, userName) {
        if (!pautaId || !assistedId) return;
        
        try {
            const docRef = doc(db, "pautas", pautaId, "attendances", assistedId);
            const docSnap = await getDoc(docRef);
            const currentData = docSnap.exists() ? docSnap.data() : {};
            
            const finalUpdates = { 
                ...updates,
                lastActionBy: userName || 'Sistema',
                lastActionTimestamp: new Date().toISOString()
            };

            let novoNomeAtendente = undefined;
            if (updates.attendedBy !== undefined) {
                novoNomeAtendente = updates.attendedBy;
            } else if (updates.assignedCollaborator !== undefined) {
                novoNomeAtendente = updates.assignedCollaborator ? updates.assignedCollaborator.name : null;
            } else if (updates.attendant !== undefined) {
                novoNomeAtendente = updates.attendant;
            }

            if (novoNomeAtendente !== undefined) {
                if (novoNomeAtendente) {
                    const nomeStr = typeof novoNomeAtendente === 'object' ? (novoNomeAtendente.nome || novoNomeAtendente.name) : novoNomeAtendente;
                    finalUpdates.assignedCollaborator = { id: currentData.assignedCollaborator?.id || 'manual', name: nomeStr };
                    finalUpdates.attendant = nomeStr;
                    finalUpdates.attendedBy = nomeStr;
                } else {
                    finalUpdates.assignedCollaborator = null;
                    finalUpdates.attendant = null;
                    finalUpdates.attendedBy = null;
                }
            }

            const isMultisala = window.app && window.app.currentPautaData && window.app.currentPautaData.type === 'multisala';
            if (!isMultisala && finalUpdates.room !== undefined) {
                finalUpdates.room = null;
            }
            
            if (updates.status === 'aguardando') {
                if (!updates.checkInOrder) {
                    finalUpdates.checkInOrder = Date.now(); 
                } else {
                    finalUpdates.checkInOrder = updates.checkInOrder;
                }
                
                if (updates.arrivalTime) {
                    const arrivalDate = new Date(updates.arrivalTime);
                    if (isNaN(arrivalDate.getTime())) {
                        finalUpdates.arrivalTime = null;
                        showNotification("Data/Hora de chegada inválida. Campo limpo.", "warning");
                        playSound('warning');
                    } else {
                        finalUpdates.arrivalTime = arrivalDate.toISOString();
                    }
                } else if (currentData.arrivalTime && updates.arrivalTime === null) {
                    finalUpdates.arrivalTime = null;
                } else if (currentData.arrivalTime && !updates.arrivalTime) {
                    finalUpdates.arrivalTime = currentData.arrivalTime;
                }

            } else if (updates.status === 'pauta') {
                finalUpdates.checkInOrder = null;
                finalUpdates.arrivalTime = null;
            } else if (updates.status !== 'aguardando' && updates.status !== 'pauta') {
                 if (!updates.checkInOrder && currentData.checkInOrder) {
                     finalUpdates.checkInOrder = currentData.checkInOrder;
                 }
                 if (!updates.arrivalTime && currentData.arrivalTime) {
                     finalUpdates.arrivalTime = currentData.arrivalTime;
                 }
            }
            
            await updateDoc(docRef, finalUpdates);
            
            if (updates.isConfirmed !== undefined) {
                const textoConfirmacao = updates.isConfirmed ? "Confirmado" : "Não Confirmado";
                showNotification(`Status de Marcado Presença no Verde atualizado para ${textoConfirmacao}.`, 'info');
            } else if (updates.status === 'aguardando' && currentData.status !== 'aguardando') {
                const currentAssisted = window.app.allAssisted.find(a => a.id === assistedId) || { name: 'Assistido' };
                const name = currentAssisted.name || currentData.name;
                
                showNotification(
                    `"${name}" entrou na fila de espera!`,
                    'info',
                    10000,
                    [
                        {
                            label: "Chamar Próximo",
                            callback: () => {
                                if (window.app?.PautaService?.callNextAssisted) {
                                    window.app.PautaService.callNextAssisted(window.app);
                                }
                            }
                        },
                        {
                            label: "Ver Detalhes",
                            callback: () => {
                                if (window.openDetailsModal) {
                                    window.openDetailsModal({
                                        assistedId, pautaId, allAssisted: window.app.allAssisted, db: window.app.db
                                    });
                                }
                            }
                        }
                    ]
                );
            } else {
                const action = updates.status ? `Status alterado para: ${updates.status}` : 'Dados updated';
                showNotification(action, "success");
            }

            const logActionText = updates.status ? `Status alterado para: ${updates.status}` : 'Dados atualizados';
            await logAction(db, window.app?.auth, userName || 'Sistema', pautaId, 'UPDATE_ASSISTED', `${logActionText} - ${currentData.name || 'Assistido'}`, assistedId);
            
        } catch (error) {
            console.error("Erro ao atualizar status:", error);
            showNotification("Erro ao atualizar", "error");
        }
    },

    async delegateAttendance(app, assistedId, collaboratorName, collaboratorId) {
        if (!assistedId || !collaboratorName) {
            showNotification("Selecione um colaborador!", "error");
            return false;
        }

        try {
            const assisted = app.allAssisted.find(a => a.id === assistedId);
            const colab = app.colaboradores.find(c => c.id === collaboratorId || c.nome === collaboratorName);

            if (!assisted) {
                showNotification("Erro: Assistido não encontrado no sistema.", "error");
                return false;
            }

            const tokenSeguro = (typeof crypto !== 'undefined' && crypto.randomUUID) 
                ? crypto.randomUUID().substring(0, 8) 
                : Math.random().toString(36).substring(2, 10);

            await this.updateStatus(app.db, app.currentPauta.id, assistedId, {
                status: 'emAtendimento',
                assignedCollaborator: { id: collaboratorId || 'manual', name: collaboratorName },
                delegatedBy: app.currentUserName,
                delegatedAt: new Date().toISOString(),
                delegationToken: tokenSeguro 
            }, app.currentUserName);

            if (colab && colab.email) {
                showNotification(`Enviando e-mail para ${collaboratorName}...`, "info");
                
                await EmailService.sendDelegationEmail(
                    colab.email,          
                    collaboratorName,     
                    assisted.name,        
                    app.currentUserName,  
                    app.currentPauta.id,  
                    assistedId,           
                    tokenSeguro           
                );
            } else {
                console.warn("⚠️ Colaborador sem e-mail cadastrado. Status updated apenas no painel.");
                showNotification("Colaborador sem e-mail. Notificação digital não enviada.", "warning");
            }

            return true;
        } catch (error) {
            console.error("❌ Erro crítico na delegação:", error);
            showNotification("Falha ao delegar atendimento.", "error");
            return false;
        }
    },

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

    async callNextAssisted(app) {
        if (!app || !app.currentPauta || !app.currentPauta.id) {
            showNotification("Nenhuma pauta selecionada!", "error");
            return;
        }

        const aguardandoList = app.allAssisted.filter(a => a.status === 'aguardando');
        if (aguardandoList.length === 0) {
            showNotification("A fila de aguardando está vazia.", "info");
            return;
        }

        const orderedList = this.sortAguardando(aguardandoList, app.currentPautaData.ordemAtendimento);
        const nextAssisted = orderedList[0];

        if (!nextAssisted) {
            showNotification("Não foi possível identificar o próximo assistido.", "error");
            return;
        }

        window.assistedIdToHandle = nextAssisted.id;
        window.assistedNameToHandle = nextAssisted.name || '';
        
        window.assistedTipoAcao = app.currentPautaData?.useDelegationFlow ? 'delegar' : 'atender_direto';
        
        const nameElement = document.getElementById('assisted-to-attend-name');
        if (nameElement) {
            nameElement.textContent = nextAssisted.name;
        }

        if (typeof this.preencherListaColaboradoresModal === 'function') {
            this.preencherListaColaboradoresModal(app);
        }

        const selectCollaboratorModal = document.getElementById('select-collaborator-modal');
        if (selectCollaboratorModal) {
            selectCollaboratorModal.classList.remove('hidden');
            showNotification(`Próximo: "${nextAssisted.name}". Selecione o atendente.`, "info");
            playSound('chime');
            
            setTimeout(() => {
                const searchInput = document.getElementById('collaborator-search-input');
                if (searchInput) searchInput.focus();
            }, 100);
        }
    }, 

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
            
            showNotification("Fila Reordenada!");
        } catch (error) {
            console.error("Erro ao reordenar:", error);
            showNotification("Erro ao reordenar", "error");
        }
    },

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
            
            if (!user) {
                showNotification("Usuário não autenticado", "error");
                return false;
            }
            
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
            attendanceSnapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
            });
            
            batch.delete(pautaRef);
            await batch.commit();
            
            await logAction(
                db,
                auth,
                userName || (user && user.email),
                pautaId,
                'DELETE_PAUTA',
                `Apagou a pauta "${pautaName}"`,
                pautaId
            );
            
            showNotification("Pauta apagada com sucesso!");
            return true;
            
        } catch (error) {
            console.error("Erro ao apagar pauta:", error);
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
                
            case 'all':
            default:
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

            const isMultisala = app.currentPautaData?.type === 'multisala';

            let successCount = 0;
            for (const assistido of assistidos) {
                const assistedToSave = { ...assistido, type: 'agendamento' };
                if (!isMultisala) {
                    assistedToSave.room = null;
                }

                const added = await this.addAssistedProgrammatic(
                    app.db,
                    app.currentPauta.id,
                    assistedToSave, 
                    app.currentUserName || 'Sistema'
                );
                if (added) successCount++;
            }

            await logAction( 
                app.db,
                app.auth,
                app.currentUserName || 'Sistema',
                app.currentPauta.id,
                'IMPORT_CSV',
                `Importou ${successCount} de ${assistidos.length} registros via CSV`,
                null
            );

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

        if (assisted.type === 'agendamento' && assisted.scheduledTime && assisted.arrivalTime) {
            try {
                const [h, m] = assisted.scheduledTime.split(':').map(Number);
                const agendado = new Date();
                agendado.setHours(h, m, 0, 0);

                const chegada = new Date(assisted.arrivalTime);
                const diffMinutos = (chegada - agendado) / (1000 * 60);

                if (diffMinutos <= 5) return 'Máxima'; 
                if (diffMinutos <= 30) return 'Média'; 
                return 'Mínima'; 
            } catch (e) {
                return 'Média';
            }
        }

        return 'Média';
    },

    sortAguardando(list, orderType) {
        if (!list || !list.length) return [];
        
        if (orderType === 'manual') {
            return [...list].sort((a, b) => (a.manualIndex || 0) - (b.manualIndex || 0));
        }
        
        if (orderType === 'chegada') {
            return [...list].sort((a, b) => (a.checkInOrder || 0) - (b.checkInOrder || 0));
        }

        return [...list].sort((a, b) => {
            if (a.priority === 'URGENTE' && b.priority !== 'URGENTE') return -1;
            if (b.priority === 'URGENTE' && a.priority !== 'URGENTE') return 1;

            if (a.type === 'agendamento' && b.type === 'avulso') return -1;
            if (a.type === 'avulso' && b.type === 'agendamento') return 1;

            if (a.scheduledTime && b.scheduledTime) {
                if (a.scheduledTime !== b.scheduledTime) {
                    return a.scheduledTime.localeCompare(b.scheduledTime);
                }
            }

            const arrivalA = a.checkInOrder || 0;
            const arrivalB = b.checkInOrder || 0;
            
            return arrivalA - arrivalB;
        });
    },

    getPriorityClass(priority) {
        const classes = {
            'URGENTE': 'priority-urgente', 
            'Máxima': 'priority-maxima',   
            'Média': 'priority-media',     
            'Mínima': 'priority-minima'    
        };
        return classes[priority] || '';
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
                filter: 'button, svg, p, span, input', 
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
                        
                        await logAction(
                            app.db,
                            app.auth,
                            app.currentUserName || 'Sistema',
                            app.currentPauta.id,
                            'REORDER_QUEUE',
                            'Fila reordenada manualmente via drag & drop'
                        );
                        
                        showNotification("Fila Reordenada!");
                    } catch (e) {
                        console.error("Erro ao reordenar:", e);
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
        
        while (select.options.length > 1) {
            select.remove(1);
        }
        
        if (app.colaboradores && app.colaboradores.length > 0) {
            const colaboradoresOrdenados = [...app.colaboradores].sort((a, b) => 
                a.nome.localeCompare(b.nome)
            );
            
            colaboradoresOrdenados.forEach(c => {
                const option = document.createElement('option');
                option.value = c.nome;
                option.textContent = c.nome;
                if (c.cargo) {
                    option.textContent += ` (${c.cargo})`;
                }
                select.appendChild(option);
            });
            
            if (valorAnterior) {
                const options = Array.from(select.options).map(opt => opt.value);
                if (options.includes(valorAnterior)) {
                    select.value = valorAnterior;
                }
            }
        } else {
            const option = document.createElement('option');
            option.value = "";
            option.textContent = "Nenhum colaborador cadastrado";
            option.disabled = true;
            select.appendChild(option);
        }
        
        if (this.isMobileDevice()) {
            select.style.fontSize = '16px';
        }
    },

    preencherListaColaboradoresModal(app) {
        const container = document.getElementById('collaborator-selection-list');
        const searchInput = document.getElementById('collaborator-search-input');
        
        if (!container) return;
        
        if (searchInput) searchInput.value = '';
        
        window.selectedCollaboratorId = 'null';
        window.selectedCollaboratorName = null;
        
        const colaboradores = app.colaboradores || [];
        const colaboradoresOrdenados = [...colaboradores].sort((a, b) => 
            a.nome.localeCompare(b.nome)
        );
        
        const renderLista = (filtro = '') => {
            container.innerHTML = '';
            
            const filtroLower = filtro.toLowerCase().trim();
            
            const colaboradoresFiltrados = filtro 
                ? colaboradoresOrdenados.filter(c => 
                    c.nome.toLowerCase().includes(filtroLower) ||
                    (c.cargo && c.cargo.toLowerCase().includes(filtroLower)) ||
                    (c.equipe && c.equipe.toLowerCase().includes(filtroLower))
                  )
                : colaboradoresOrdenados;
            
            if (!filtro) {
                const optionNaoAtribuir = document.createElement('div');
                const isSelected = window.selectedCollaboratorId === 'null';
                
                optionNaoAtribuir.className = isSelected 
                    ? "p-3 border rounded-lg bg-blue-100 border-blue-500 border-2 cursor-pointer transition-all mb-2"
                    : "p-3 border rounded-lg bg-gray-50 hover:bg-gray-100 cursor-pointer transition-all mb-2";
                
                optionNaoAtribuir.setAttribute('data-colaborador-id', 'null');
                optionNaoAtribuir.setAttribute('data-colaborador-nome', '');
                optionNaoAtribuir.setAttribute('role', 'option');
                optionNaoAtribuir.setAttribute('tabindex', '0');
                optionNaoAtribuir.setAttribute('aria-selected', isSelected ? 'true' : 'false');
                optionNaoAtribuir.innerHTML = `
                    <div class="flex items-center gap-3">
                        <div class="w-5 h-5 rounded-full bg-gray-400 flex items-center justify-center text-white text-xs">🚫</div>
                        <div>
                            <p class="font-bold text-gray-700">Não atribuir</p>
                            <p class="text-xs text-gray-500">Atender sem atribuir a nenhum colaborador</p>
                        </div>
                    </div>
                `;
                
                optionNaoAtribuir.addEventListener('click', () => {
                    document.querySelectorAll('#collaborator-selection-list > div').forEach(div => {
                        div.classList.remove('bg-blue-100', 'border-blue-500', 'border-2');
                        if (div.getAttribute('data-colaborador-id') === 'null') {
                            div.classList.add('bg-gray-50');
                        }
                        div.setAttribute('aria-selected', 'false');
                    });
                    
                    optionNaoAtribuir.classList.remove('bg-gray-50');
                    optionNaoAtribuir.classList.add('bg-blue-100', 'border-blue-500', 'border-2');
                    optionNaoAtribuir.setAttribute('aria-selected', 'true');
                    
                    window.selectedCollaboratorId = 'null';
                    window.selectedCollaboratorName = null;
                });
                
                optionNaoAtribuir.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        optionNaoAtribuir.click();
                    }
                });
                
                container.appendChild(optionNaoAtribuir);
            }
            
            if (colaboradoresFiltrados.length === 0) {
                const msg = document.createElement('p');
                msg.className = "text-gray-500 text-center py-4 text-sm mt-2";
                msg.textContent = colaboradores.length === 0 
                    ? "Nenhum colaborador cadastrado no sistema." 
                    : "Nenhum colaborador encontrado com este filtro.";
                container.appendChild(msg);
                return;
            }
            
            colaboradoresFiltrados.forEach(collab => {
                const div = document.createElement('div');
                const isSelected = window.selectedCollaboratorId === (collab.id || collab.nome);
                
                div.className = isSelected 
                    ? "p-3 border rounded-lg bg-blue-100 border-blue-500 border-2 cursor-pointer transition-all mb-2"
                    : "p-3 border rounded-lg hover:bg-blue-50 cursor-pointer transition-all mb-2";
                div.setAttribute('data-colaborador-id', collab.id || collab.nome);
                div.setAttribute('data-colaborador-nome', collab.nome);
                div.setAttribute('role', 'option');
                div.setAttribute('tabindex', '0');
                div.setAttribute('aria-selected', isSelected ? 'true' : 'false');
                div.innerHTML = `
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-sm">
                            ${collab.nome.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <p class="font-bold text-gray-800">${escapeHTML(collab.nome)}</p>
                            <p class="text-xs text-gray-500">${escapeHTML(collab.cargo || 'Cargo não informado')} | Equipe ${collab.equipe || 'N/A'}</p>
                        </div>
                    </div>
                `;
                
                div.addEventListener('click', () => {
                    document.querySelectorAll('#collaborator-selection-list > div').forEach(d => {
                        d.classList.remove('bg-blue-100', 'border-blue-500', 'border-2');
                        if (d.getAttribute('data-colaborador-id') === 'null') {
                            d.classList.add('bg-gray-50');
                        }
                        d.setAttribute('aria-selected', 'false');
                    });
                    
                    div.classList.add('bg-blue-100', 'border-blue-500', 'border-2');
                    div.setAttribute('aria-selected', 'true');
                    
                    window.selectedCollaboratorId = collab.id || collab.nome;
                    window.selectedCollaboratorName = collab.nome;
                });
                
                div.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        div.click(); 
                    }
                });
                
                container.appendChild(div);
            });
        };
        
        renderLista();
        
        if (searchInput) {
            const novoSearchInput = searchInput.cloneNode(true);
            if (searchInput.parentNode) {
                searchInput.parentNode.replaceChild(novoSearchInput, searchInput);
            }
            
            novoSearchInput.addEventListener('input', (e) => {
                renderLista(e.target.value);
            });
            
            novoSearchInput.setAttribute('aria-label', 'Buscar colaboradores');
        }
    },

    // ⭐ SINCRO DE INTERFACE CORRIGIDO: Abre forçadamente as colunas ocultadas pelo cache do navegador ⭐
    loadColumnPreferences() {
        const savedPreferences = localStorage.getItem('sigap_column_preferences');
        let preferences = { showEmAtendimento: true, showDistribuicao: true, showFaltosos: false };
        if (savedPreferences) preferences = JSON.parse(savedPreferences);

        // Se a pauta exige os fluxos, anula o cache e força a exibição ativa
        if (this.currentPautaData?.useDelegationFlow === true) {
            preferences.showEmAtendimento = true;
        }
        if (this.currentPautaData?.useDistributionFlow === true) {
            preferences.showDistribuicao = true;
        }

        const chkEmAtendimento = document.getElementById('toggle-em-atendimento');
        const chkDistribuicao = document.getElementById('toggle-distribuicao');
        const chkFaltosos = document.getElementById('toggle-faltosos');
        
        if(chkEmAtendimento) chkEmAtendimento.checked = preferences.showEmAtendimento;
        if(chkDistribuicao) chkDistribuicao.checked = preferences.showDistribuicao;
        if(chkFaltosos) chkFaltosos.checked = preferences.showFaltosos;
        
        this.applyColumnPreferences(preferences);
    },

    applyColumnPreferences(preferences) {
        const pautaType = this.currentPautaData?.type;
        const useDelegationFlow = this.currentPautaData?.useDelegationFlow;
        const useDistributionFlow = this.currentPautaData?.useDistributionFlow;

        const emAtendimentoColumn = document.getElementById('em-atendimento-column');
        const distribuicaoColumn = document.getElementById('distribuicao-column');
        const faltososColumn = document.getElementById('faltosos-column');

        if (emAtendimentoColumn) {
            if (useDelegationFlow && preferences.showEmAtendimento) emAtendimentoColumn.classList.remove('hidden');
            else emAtendimentoColumn.classList.add('hidden');
        }

        if (distribuicaoColumn) {
            if (useDistributionFlow && preferences.showDistribuicao) distribuicaoColumn.classList.remove('hidden');
            else distribuicaoColumn.classList.add('hidden');
        }
        
        if (faltososColumn) {
            const pautaColumn = document.getElementById('pauta-column');
            if (pautaType === 'agendamento' && preferences.showFaltosos && pautaColumn && !pautaColumn.classList.contains('hidden')) {
                 faltososColumn.classList.remove('hidden');
            } else {
                 faltososColumn.classList.add('hidden');
            }
        }
    },

    handleCardActions(e, app) {
        const button = e.target.closest('button');
        if (!button) return;

        const id = button.dataset.id;
        if (!id) return;

        if (button.classList.contains('quick-action-toggle')) {
            e.stopPropagation();
            const menuId = `quick-menu-${id}`;
            const menu = document.getElementById(menuId);
            
            if (!menu) return;
            
            this.closeAllQuickMenus(menuId);
            
            const isHidden = menu.classList.contains('hidden');
            menu.classList.toggle('hidden');
            
            button.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
            button.setAttribute('aria-label', isHidden ? 'Fechar menu rápido' : 'Abrir menu rápido');
            
            if (!menu.classList.contains('hidden')) {
                setTimeout(() => {
                    const firstItem = menu.querySelector('.quick-action-item');
                    if (firstItem) firstItem.focus();
                }, 100);
                
                setTimeout(() => {
                    const clickOutsideHandler = (event) => {
                        if (!menu.contains(event.target) && !button.contains(event.target)) {
                            menu.classList.add('hidden');
                            button.setAttribute('aria-expanded', 'false');
                            document.removeEventListener('click', clickOutsideHandler);
                        }
                    };
                    document.addEventListener('click', clickOutsideHandler);
                }, 0);
            }
        }

        if (button.classList.contains('quick-action-item')) {
            e.stopPropagation();
            
            const actionKey = `${id}-${button.dataset.tipo}`;
            if (!this.canPerformAction(actionKey)) return;
            
            const tipoAcao = button.dataset.tipo;
            const assisted = app.allAssisted && app.allAssisted.find(a => a.id === id);
            
            if (!assisted) {
                showNotification("Erro: Assistido não encontrado", "error");
                return;
            }
            
            const menu = document.getElementById(`quick-menu-${id}`);
            if (menu) {
                menu.classList.add('hidden');
                const toggle = document.getElementById(`quick-toggle-${id}`);
                if (toggle) toggle.setAttribute('aria-expanded', 'false');
            }
            
            const tipoMap = {
                'reagendar': 'Reagendamento',
                'agendar': 'Agendamento',
                'consulta': 'Consulta Processual',
                'outros': 'Outros Assuntos'
            };
            
            const tipoDescricao = tipoMap[tipoAcao] || tipoAcao;
            
            window.assistedIdToHandle = id;
            window.assistedNameToHandle = assisted.name || '';
            window.assistedTipoAcao = tipoAcao;
            window.assistedTipoDescricao = tipoDescricao;
            
            const nameElement = document.getElementById('assisted-to-attend-name');
            if (nameElement) nameElement.textContent = assisted.name || '';
            
            showNotification(`${tipoDescricao} para ${assisted.name}`, "info");
            
            if (typeof this.preencherListaColaboradoresModal === 'function') {
                this.preencherListaColaboradoresModal(app);
            }
            
            const modal = document.getElementById('select-collaborator-modal');
            if (modal) {
                modal.classList.remove('hidden');
                setTimeout(() => {
                    const firstInput = modal.querySelector('input, button, [tabindex="0"]');
                    if (firstInput) firstInput.focus();
                }, 100);
            }
        }

        if (button.classList.contains('check-in-btn')) {
            window.assistedIdToHandle = id;
            const modal = document.getElementById('arrival-modal');
            if (modal) {
                document.getElementById('arrival-time-input').value = new Date().toTimeString().slice(0,5);
                modal.classList.remove('hidden');
            }
        }

        if (button.classList.contains('faltou-btn')) {
            this.updateStatus(app.db, app.currentPauta.id, id, { status: 'faltoso' }, app.currentUserName);
        }

        if (button.classList.contains('return-to-pauta-btn')) {
            this.updateStatus(app.db, app.currentPauta.id, id, {
                status: 'pauta',
                arrivalTime: null,
                priority: null,
                assignedCollaborator: null,
                inAttendanceTime: null,
                room: null,
                distributionStatus: null
            }, app.currentUserName);
        }

        if (button.classList.contains('return-to-pauta-from-faltoso-btn')) {
            this.updateStatus(app.db, app.currentPauta.id, id, {
                status: 'pauta'
            }, app.currentUserName);
        }

        if (button.classList.contains('return-to-aguardando-btn')) {
            this.updateStatus(app.db, app.currentPauta.id, id, {
                status: 'aguardando',
                attendant: null,
                attendedTime: null
            }, app.currentUserName);
        }

        if (button.classList.contains('return-to-aguardando-from-emAtendimento-btn')) {
            const assisted = app.allAssisted && app.allAssisted.find(a => a.id === id);
            this.updateStatus(app.db, app.currentPauta.id, id, {
                status: 'aguardando',
                assignedCollaborator: null,
                delegatedBy: null,
                delegatedAt: null,
                inAttendanceTime: null,
                distributionStatus: null
            }, app.currentUserName);
            
            if (assisted && assisted.assignedCollaborator) {
                showNotification(`Delegação para ${assisted.assignedCollaborator.name} removida`, "info");
            }
        }

        if (button.classList.contains('return-to-aguardando-from-dist-btn')) {
            this.updateStatus(app.db, app.currentPauta.id, id, {
                status: 'aguardando',
                distributionStatus: null
            }, app.currentUserName);
        }

        if (button.classList.contains('delete-btn')) {
            if (confirm("Tem certeza?")) {
                this.deleteAssisted(app.db, app.currentPauta.id, id, app.currentUserName);
            }
        }

        if (button.classList.contains('priority-btn')) {
            const assisted = app.allAssisted && app.allAssisted.find(a => a.id === id);
            if (assisted && assisted.priority === 'URGENTE') {
                if (confirm("Remover urgência?")) {
                    this.updateStatus(app.db, app.currentPauta.id, id, {
                        priority: null,
                        priorityReason: null
                    }, app.currentUserName);
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

        if (button.classList.contains('select-collaborator-btn')) {
            const assisted = app.allAssisted && app.allAssisted.find(a => a.id === id);
            if (!assisted) return;
            
            window.assistedIdToHandle = id;
            window.assistedNameToHandle = assisted.name || '';
            window.assistedTipoAcao = 'delegar';
            
            const nameElement = document.getElementById('assisted-to-attend-name');
            if (nameElement) {
                nameElement.textContent = assisted.name || '';
            }
            
            this.preencherListaColaboradoresModal(app);
            
            const modal = document.getElementById('select-collaborator-modal');
            if (modal) {
                modal.classList.remove('hidden');
                setTimeout(() => {
                    const searchInput = document.getElementById('collaborator-search-input');
                    if (searchInput) searchInput.focus();
                }, 100);
            }
        }

        if (button.classList.contains('attend-directly-from-aguardando-btn')) {
            const assisted = app.allAssisted && app.allAssisted.find(a => a.id === id);
            if (!assisted) return;
            
            window.assistedIdToHandle = id;
            window.assistedNameToHandle = assisted.name || '';
            window.assistedTipoAcao = 'atender_direto'; 
            
            const nameElement = document.getElementById('assisted-to-attend-name');
            if (nameElement) {
                nameElement.textContent = assisted.name || '';
            }
            
            this.preencherListaColaboradoresModal(app);
            
            const modal = document.getElementById('select-collaborator-modal');
            if (modal) {
                modal.classList.remove('hidden');
                setTimeout(() => {
                    const searchInput = document.getElementById('collaborator-search-input');
                    if (searchInput) searchInput.focus();
                }, 100);
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
            }
        }

        if (button.classList.contains('edit-assisted-btn')) {
            const assisted = app.allAssisted && app.allAssisted.find(a => a.id === id);
            if (assisted) {
                document.getElementById('edit-assisted-name').value = assisted.name || '';
                document.getElementById('edit-assisted-cpf').value = assisted.cpf || '';
                document.getElementById('edit-assisted-subject').value = assisted.subject || '';
                document.getElementById('edit-scheduled-time').value = assisted.scheduledTime || '';
                
                const roomSelect = document.getElementById('edit-room-select');
                if (roomSelect && assisted.room && app.currentPautaData?.type === 'multisala') {
                    roomSelect.value = assisted.room;
                }
                
                window.assistedIdToHandle = id;
                if (document.getElementById('edit-assisted-modal')) document.getElementById('edit-assisted-modal').classList.remove('hidden');
            }
        }

        if (button.classList.contains('edit-attendant-btn')) {
            const assisted = app.allAssisted && app.allAssisted.find(a => a.id === id);
            if (assisted) {
                this.preencherSelectColaboradores(app, 'edit-attendant-select');
                
                const select = document.getElementById('edit-attendant-select');
                if (select) {
                    let nomeAtendente = '';
                    if (assisted.attendedBy) {
                        nomeAtendente = typeof assisted.attendedBy === 'object' ? (assisted.attendedBy.nome || assisted.attendedBy.name) : assisted.attendedBy;
                    } else if (assisted.assignedCollaborator && assisted.assignedCollaborator.name) {
                        nomeAtendente = assisted.assignedCollaborator.name;
                    } else if (assisted.attendant) {
                        nomeAtendente = typeof assisted.attendant === 'object' ? (assisted.attendant.nome || assisted.attendant.name) : assisted.attendant;
                    }
                    const options = Array.from(select.options).map(opt => opt.value);
                    if (options.includes(nomeAtendente)) select.value = nomeAtendente;
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
                
                let atendenteNome = 'Não informado';
                if (assisted.attendedBy) {
                    atendenteNome = typeof assisted.attendedBy === 'object' ? (assisted.attendedBy.nome || assisted.attendedBy.name) : assisted.attendedBy;
                } else if (assisted.assignedCollaborator && assisted.assignedCollaborator.name) {
                    atendenteNome = assisted.assignedCollaborator.name;
                } else if (assisted.attendant) {
                    atendenteNome = typeof assisted.attendant === 'object' ? (assisted.attendant.nome || assisted.attendant.name) : assisted.attendant;
                }
                
                if (atendenteNome !== 'Não informado') {
                    infoHtml += `<p><span class="font-semibold">Atendido por:</span> ${escapeHTML(atendenteNome)}</p>`;
                }
                
                if (assisted.delegatedBy) {
                    infoHtml += `<p><span class="font-semibold">Delegado por:</span> ${escapeHTML(assisted.delegatedBy)}`;
                    if (atendenteNome !== 'Não informado' && atendenteNome !== assisted.delegatedBy) {
                        infoHtml += ` para ${escapeHTML(atendenteNome)}`;
                    }
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
                status: 'aguardando',
                attendant: null,
                attendedTime: null,
                attendedBy: null,
                attendedAt: null,
                finalizadoPeloColaborador: false,
                isConfirmed: false,
                confirmationDetails: null,
                distributionStatus: 'pending'
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
                confirmationDetails: newConfirmedState ? { 
                    confirmedBy: app.currentUserName, 
                    confirmedAt: new Date().toISOString() 
                } : null
            }, app.currentUserName);
        }
    }
};
