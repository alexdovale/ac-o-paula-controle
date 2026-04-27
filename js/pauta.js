// js/pauta.js - VERSÃO CONSOLIDADA E ORGANIZADA
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, where, getDocs, getDoc, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showNotification, normalizeText, escapeHTML, playSound } from './utils.js';
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

    /**
     * NOVO: Adiciona um novo assistido à pauta.
     */
    async addAssisted(db, pautaId, assistedData, userName) {
        if (!pautaId || !assistedData || !userName) {
            showNotification("Dados incompletos para adicionar assistido.", "error");
            return false;
        }

        try {
            // Garante que o status padrão seja 'pauta' se não for fornecido
            const newAssisted = {
                ...assistedData,
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
                window.app && window.app.auth, // Assume que 'app' e 'auth' estão no escopo global ou em 'window.app'
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

    /**
     * ATUALIZADA: updateStatus com Notificação Interativa e Lógica de Fila
     */
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
            
            // Lógica de checkInOrder para ordenação precisa
            if (updates.status === 'aguardando') {
                if (!updates.checkInOrder) {
                    finalUpdates.checkInOrder = Date.now(); 
                }
                if (updates.arrivalTime) {
                    const arrivalDate = new Date(updates.arrivalTime);
                    finalUpdates.arrivalTime = isNaN(arrivalDate.getTime()) ? null : arrivalDate.toISOString();
                }
            } else if (updates.status === 'pauta') {
                finalUpdates.checkInOrder = null;
                finalUpdates.arrivalTime = null;
            } else {
                if (!updates.checkInOrder && currentData.checkInOrder) {
                    finalUpdates.checkInOrder = currentData.checkInOrder;
                }
            }
            
            await updateDoc(docRef, finalUpdates);
            
            const action = updates.status ? `Status alterado para: ${updates.status}` : 'Dados atualizados';
            await logAction(db, window.app?.auth, userName || 'Sistema', pautaId, 'UPDATE_ASSISTED', `${action} - ${currentData.name || 'Assistido'}`, assistedId);
            
            // ⭐ NOTIFICAÇÃO INTERATIVA PARA FILA DE ESPERA
            if (updates.status === 'aguardando' && currentData.status !== 'aguardando') {
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
                showNotification(action, "success");
            }
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
     * Identifica o próximo assistido da fila 'aguardando' e abre o modal de seleção/finalização.
     */
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

        // Ordena a lista para encontrar o "próximo"
        const orderedList = this.sortAguardando(aguardandoList, app.currentPautaData.ordemAtendimento);
        const nextAssisted = orderedList[0];

        if (!nextAssisted) {
            showNotification("Não foi possível identificar o próximo assistido.", "error");
            return;
        }

        // Define as variáveis globais para o modal de seleção de colaborador/finalização
        window.assistedIdToHandle = nextAssisted.id;
        window.assistedNameToHandle = nextAssisted.name || '';
        
        // Determina o tipo de ação para o modal.
        // Se usar fluxo de delegação, a ação será 'delegar'.
        // Se não usar, a ação será 'atender_direto'.
        // Isso será usado para ajustar o comportamento do modal de seleção.
        window.assistedTipoAcao = app.currentPautaData?.useDelegationFlow ? 'delegar' : 'atender_direto';
        
        // Preenche o nome do assistido no modal
        const assistedToAttendNameEl = document.getElementById('assisted-to-attend-name');
        if (assistedToAttendNameEl) {
            assistedToAttendNameEl.textContent = nextAssisted.name;
        }

        // Preenche a lista de colaboradores no modal de seleção
        if (typeof PautaService.preencherListaColaboradoresModal === 'function') { // Use PautaService aqui
            PautaService.preencherListaColaboradoresModal(app);
        } else {
            console.error("preencherListaColaboradoresModal não encontrada. Verifique o pauta.js.");
        }

        // Abre o modal de seleção de colaborador/finalização
        const selectCollaboratorModal = document.getElementById('select-collaborator-modal');
        if (selectCollaboratorModal) {
            selectCollaboratorModal.classList.remove('hidden');
            showNotification(`Próximo: "${nextAssisted.name}". Selecione o atendente.`, "info");
            playSound('chime'); // Avisa que o próximo foi identificado/chamado para o modal
        } else {
            console.error("Modal 'select-collaborator-modal' não encontrado.");
            showNotification("Erro ao abrir seleção de atendente. Tente novamente.", "error");
        }
        
        // Não é necessário logar a ação AQUI, pois o log será feito quando o modal for confirmado.
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
                // ⭐ Melhoria: Garante que a última ação seja registrada na reordenação
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

    /**
     * Apaga uma pauta completa (com todos os subdocumentos)
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

    /**
     * Filtra pautas por tipo (para a tela de seleção)
     */
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

    /**
     * Processa upload de arquivo CSV
     */
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
                // Reutilizando a nova função addAssisted
                const added = await this.addAssisted(
                    app.db,
                    app.currentPauta.id,
                    { ...assistido, type: 'agendamento' }, // CSVs geralmente são agendamentos
                    app.currentUserName || 'Sistema'
                );
                if (added) successCount++;
            }

            await logAction( // Este log agora é redundante se cada addAssisted já loga, considere remover.
                app.db,
                app.auth,
                app.currentUserName || 'Sistema',
                app.currentPauta.id,
                'IMPORT_CSV',
                `Importou ${successCount} de ${assistidos.length} registros via CSV`,
                null // Não há um assistido específico para este log global de importação
            );

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
            const arrivalTime = new Date(`1970-01-01T${arrival.getHours().toString().padStart(2,'0')}:${arrival.getMinutes().toString().padStart(2,'0')}`).getTime();
            const diff = arrivalTime - scheduled; // Diferença em minutos (chegada - agendado)

            if (diff <= 0) return 'Máxima';
            if (diff <= 20) return 'Média';
            return 'Mínima';
        } catch (e) {
            return 'Média';
        }
    },

    /**
     * Ordena lista de aguardando conforme regras
     * 
     * Prioridade de ordenação:
     * 1. URGENTE (sempre primeiro)
     * 2. Horário virtual:
     *    - Adiantado: usa horário de chegada.
     *    - Pontual: usa horário agendado.
     *    - Atrasado: usa horário de chegada.
     * 3. Desempate por "lateness":
     *    - Não atrasado (adiantado/pontual) vem antes de atrasado (mesmo horário virtual).
     * 4. Desempate final: ordem de marcação de chegada (checkInOrder) – quem marcou primeiro fica na frente.
     */
    sortAguardando(list, orderType) {
        if (!list || !list.length) return [];
        
        if (orderType === 'manual') {
            return [...list].sort((a, b) => (a.manualIndex || 0) - (b.manualIndex || 0));
        }
        
        if (orderType === 'chegada') {
            return [...list].sort((a, b) => (a.checkInOrder || 0) - (b.checkInOrder || 0));
        }

        // Função auxiliar para obter tempo virtual e se é atrasado
        const getVirtual = (item) => {
            // Avulso: usa checkInOrder como tempo base, e não é considerado atrasado para este desempate.
            if (item.type === 'avulso') {
                return { time: item.checkInOrder || 0, isLate: false };
            }
            
            // Agendamento
            if (item.type === 'agendamento' && item.scheduledTime) {
                try {
                    const scheduled = new Date(`1970-01-01T${item.scheduledTime}`).getTime();
                    // Se não tem arrivalTime, ainda não chegou -> considera pontual com horário agendado
                    if (!item.arrivalTime) {
                        return { time: scheduled, isLate: false };
                    }
                    const arrival = new Date(item.arrivalTime);
                    // Pega apenas hora e minuto da chegada na data de referência 1970-01-01
                    const arrivalHour = new Date(`1970-01-01T${arrival.getHours().toString().padStart(2,'0')}:${arrival.getMinutes().toString().padStart(2,'0')}`).getTime();
                    const diff = arrivalHour - scheduled; // Diferença em minutos (chegada - agendado)

                    if (diff < 0) { // Chegou adiantado
                        return { time: arrivalHour, isLate: false }; // Tempo virtual é o tempo de chegada (menor = primeiro)
                    } else if (diff === 0) { // Chegou pontual
                        return { time: scheduled, isLate: false }; // Tempo virtual é o tempo agendado
                    } else { // Chegou atrasado (diff > 0)
                        return { time: arrivalHour, isLate: true }; // Tempo virtual é o tempo de chegada, e marca como atrasado
                    }
                } catch(e) {
                    console.error("Erro ao calcular virtualTime para agendamento:", e, "para item:", item);
                    // Fallback para checkInOrder em caso de erro no cálculo do agendamento
                    return { time: item.checkInOrder || 0, isLate: false }; 
                }
            }
            // Fallback para qualquer outro tipo não tratado ou dados incompletos
            return { time: item.checkInOrder || 0, isLate: false };
        };
        
        return [...list].sort((a, b) => {
            // 1. Prioridade URGENTE
            if (a.priority === 'URGENTE' && b.priority !== 'URGENTE') return -1;
            if (b.priority === 'URGENTE' && a.priority !== 'URGENTE') return 1;
            
            const va = getVirtual(a);
            const vb = getVirtual(b);
            
            // 2. Comparar tempo virtual (agora adiantados terão um tempo menor que pontuais/atrasados)
            if (va.time !== vb.time) return va.time - vb.time;
            
            // 3. Desempate: Se mesmo tempo virtual, priorizar quem não está atrasado
            // (Isso lida com o caso de atrasados vs. pontuais com o mesmo virtualTime de chegada/agendamento)
            if (va.isLate !== vb.isLate) {
                return va.isLate ? 1 : -1; // Quem é isLate vem depois
            }
            
            // 4. Desempate final: ordem de marcação de chegada (checkInOrder)
            // (Isso lida com casos onde tudo acima é igual, ex: vários pontuais marcados em sequência)
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
     * Configura ordenação manual com SortableJS (adaptado para mobile)
     */
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
                        // ⭐ Melhoria: Garante que a última ação seja registrada na reordenação por drag & drop
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

    /**
     * Preenche o select com os nomes dos colaboradores (responsivo)
     */
    preencherSelectColaboradores(app, selectId = 'attendant-select') {
        const select = document.getElementById(selectId);
        if (!select) {
            console.error(`Select ${selectId} não encontrado`);
            return;
        }
        
        const valorAnterior = select.value;
        
        while (select.options.length > 1) {
            select.remove(1);
        }
        
        if (app.colaboradores && app.colaboradores.length > 0) {
            console.log("Preenchendo select com", app.colaboradores.length, "colaboradores");
            
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
            console.log("Nenhum colaborador encontrado");
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

    /**
     * Preenche a lista de colaboradores no modal de seleção com busca
     */
    preencherListaColaboradoresModal(app) {
        const container = document.getElementById('collaborator-selection-list');
        const searchInput = document.getElementById('collaborator-search-input');
        
        if (!container) {
            console.error("Container collaborator-selection-list não encontrado");
            return;
        }
        
        if (searchInput) {
            searchInput.value = '';
        }
        
        window.selectedCollaboratorId = undefined;
        window.selectedCollaboratorName = undefined;
        
        if (!app.colaboradores || app.colaboradores.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-center py-4">Nenhum colaborador cadastrado.</p>';
            return;
        }
        
        const colaboradoresOrdenados = [...app.colaboradores].sort((a, b) => 
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
                optionNaoAtribuir.className = "p-3 border rounded-lg bg-gray-50 hover:bg-gray-100 cursor-pointer transition-all mb-2";
                optionNaoAtribuir.setAttribute('data-colaborador-id', 'null');
                optionNaoAtribuir.setAttribute('data-colaborador-nome', '');
                optionNaoAtribuir.setAttribute('role', 'option');
                optionNaoAtribuir.setAttribute('tabindex', '0');
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
                        div.classList.remove('bg-blue-100', 'border-blue-500');
                        div.setAttribute('aria-selected', 'false');
                    });
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
                msg.className = "text-gray-500 text-center py-4 text-sm";
                msg.textContent = "Nenhum colaborador encontrado com este filtro.";
                container.appendChild(msg);
                return;
            }
            
            colaboradoresFiltrados.forEach(collab => {
                const div = document.createElement('div');
                div.className = "p-3 border rounded-lg hover:bg-blue-50 cursor-pointer transition-all mb-2";
                div.setAttribute('data-colaborador-id', collab.id || collab.nome);
                div.setAttribute('data-colaborador-nome', collab.nome);
                div.setAttribute('role', 'option');
                div.setAttribute('tabindex', '0');
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
                    document.querySelectorAll('#collaborator-selection-list > div').forEach(div => {
                        div.classList.remove('bg-blue-100', 'border-blue-500');
                        div.setAttribute('aria-selected', 'false');
                    });
                    div.classList.add('bg-blue-100', 'border-blue-500', 'border-2');
                    div.setAttribute('aria-selected', 'true');
                    
                    window.selectedCollaboratorId = collab.id || collab.nome;
                    window.selectedCollaboratorName = collab.nome;
                });
                
                div.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        // Aqui, use 'div.click()' para simular o clique no próprio elemento
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

    /**
     * Exibe tela de seleção de pautas (responsiva com filtros)
     */
    showPautaSelectionScreen(app) {
        if (!app || !app.auth || !app.auth.currentUser) {
            showNotification("Usuário não autenticado", "error");
            return;
        }

        localStorage.removeItem('lastPautaId');
        localStorage.removeItem('lastPautaType');

        UIService.renderPautaFilters('filters-container', app.currentPautaFilter || 'all', async (filter) => {
            app.currentPautaFilter = filter;
            await this.loadPautasWithFilter(app);
        }, app);

        this.loadPautasWithFilter(app);

        UIService.showScreen('pautaSelection');
    },

    /**
     * Carrega pautas com filtro aplicado
     */
    async loadPautasWithFilter(app) {
        const user = app.auth.currentUser;
        if (!user) return;
        
        const pautasList = document.getElementById('pautas-list');
        if (!pautasList) return;
        
        pautasList.innerHTML = '<p class="col-span-full text-center py-8">Carregando pautas...</p>';

        try {
            const q = query(
                collection(app.db, "pautas"),
                where("members", "array-contains", user.uid)
            );
            
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
            
            const filteredPautas = this.filterPautas(
                pautas, 
                app.currentPautaFilter || 'all', 
                user.uid, 
                user.email,
                filtrosAdicionais
            );
            
            this.renderPautaCards(filteredPautas, user.uid, user.email, app);
            
        } catch (error) {
            console.error("Erro ao carregar pautas:", error);
            pautasList.innerHTML = '<p class="col-span-full text-center text-red-500">Erro ao carregar pautas</p>';
        }
    },

    /**
     * Renderiza cards de pauta na tela de seleção
     */
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
                
                if (now > expirationDate) {
                    isExpired = true;
                }
            }
            
            const expiracaoTexto = isExpired ? 'Expirou em:' : 'Será eliminada em:';
            const expiredClass = isExpired ? 'opacity-60 bg-gray-100' : '';
            
            return `
            <div class="relative bg-white p-6 rounded-lg shadow-md flex flex-col justify-between h-full ${expiredClass} ${!isExpired ? 'hover:shadow-xl transition-shadow cursor-pointer' : 'cursor-not-allowed'}" 
                 ${!isExpired ? `onclick="window.app.loadPauta('${pauta.id}', '${escapeHTML(pauta.name)}', '${pauta.type}')"` 
                              : `onclick="showNotification('🔒 Esta pauta expirou e não pode ser acessada', 'error')"`}
                 role="${!isExpired ? 'button' : 'presentation'}"
                 tabindex="${!isExpired ? '0' : '-1'}"
                 aria-label="${!isExpired ? `Abrir pauta ${pauta.name}` : `Pauta expirada ${pauta.name}`}">
                
                ${isOwner ? `
                <button onclick="event.stopPropagation(); window.app.deletePauta('${pauta.id}', '${escapeHTML(pauta.name)}')" 
                        class="absolute top-3 right-3 p-1 rounded-full text-gray-400 hover:text-red-600 transition-colors z-10"
                        title="Excluir pauta"
                        aria-label="Excluir pauta ${pauta.name}">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1  0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                </button>
                ` : ''}
                
                <h3 class="font-bold text-xl text-gray-800 mb-2 pr-8" title="${escapeHTML(pauta.name)}">
                    ${escapeHTML(pauta.name)}
                </h3>
                
                <p class="text-sm text-gray-600 mb-4">
                    Membros: <span class="font-semibold">${(pauta.memberEmails && pauta.memberEmails.length) || 1}</span>
                </p>
                
                <div class="mt-4 pt-2 border-t border-gray-200">
                    <p class="text-xs text-gray-500">
                        Criada em: <span class="font-bold">${dataCriacao}</span>
                    </p>
                    <p class="text-xs ${isExpired ? 'text-gray-500' : 'text-red-600'}">
                        ${expiracaoTexto} <span class="font-bold">${dataExpiracao}</span>
                    </p>
                </div>
                
                ${isOwner ? '<span class="absolute bottom-3 left-3 text-[10px] text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Criador</span>' : ''}
            </div>
            `;
        }).join('');
    },

    /**
     * Cria card de pauta (legado, manter para compatibilidade)
     */
    createPautaCard(docSnap, isExpired, app) {
        const pauta = docSnap.data();
        const card = document.createElement('div');
        card.className = "relative bg-white p-4 md:p-6 rounded-lg shadow-md flex flex-col justify-between h-full";

        if (isExpired) {
            card.classList.add('opacity-60', 'bg-gray-100', 'cursor-not-allowed');
        } else {
            card.classList.add('hover:shadow-xl', 'transition-shadow', 'cursor-pointer');
        }

        const deleteButton = document.createElement('button');
        deleteButton.className = "absolute top-2 right-2 md:top-3 md:right-3 p-1 rounded-full text-gray-400 hover:text-red-600 transition-colors";
        deleteButton.setAttribute('aria-label', 'Excluir pauta');
        deleteButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 md:h-5 md:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>`;

        deleteButton.addEventListener('click', async (event) => {
            event.stopPropagation();
            if (confirm(`Tem certeza que deseja apagar a pauta "${pauta.name}"?`)) {
                try {
                    await deleteDoc(doc(app.db, "pautas", docSnap.id));
                    
                    await logAction(
                        app.db,
                        app.auth,
                        app.currentUserName || 'Sistema',
                        docSnap.id,
                        'DELETE_PAUTA',
                        `Apagou a pauta "${pauta.name}"`,
                        docSnap.id
                    );
                    
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
            card.addEventListener('click', () => {
                app.loadPauta(docSnap.id, pauta.name, pauta.type);
            });
        }

        return card;
    },

    /**
     * Manipula ações dos cards (cliques em botões) - VERSÃO OTIMIZADA
     */
    handleCardActions(e, app) {
        const button = e.target.closest('button');
        if (!button) return;

        const id = button.dataset.id;
        if (!id) return;

        console.log("Botão clicado:", button.className, "ID:", id);

        const isMobile = this.isMobileDevice();

        // ================================================
        // AÇÕES RÁPIDAS (MENU)
        // ================================================
        
        // Toggle do menu de ações rápidas
        if (button.classList.contains('quick-action-toggle')) {
            e.stopPropagation();
            const menuId = `quick-menu-${id}`;
            const menu = document.getElementById(menuId);
            
            if (!menu) {
                console.warn(`Menu ${menuId} não encontrado`);
                return;
            }
            
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

        // Clique em uma ação rápida
        if (button.classList.contains('quick-action-item')) {
            e.stopPropagation();
            
            const actionKey = `${id}-${button.dataset.tipo}`;
            if (!this.canPerformAction(actionKey)) {
                console.log("Ação ignorada (cooldown)");
                return;
            }
            
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
                if (toggle) {
                    toggle.setAttribute('aria-expanded', 'false');
                }
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
            if (nameElement) {
                nameElement.textContent = assisted.name || '';
            }
            
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

        // ================================================
        // AÇÕES DE ATENDIMENTO
        // ================================================
        
        // Check-in (Marcar Chegada)
        if (button.classList.contains('check-in-btn')) {
            console.log("Abrindo modal de chegada para:", id);
            window.assistedIdToHandle = id;
            const modal = document.getElementById('arrival-modal');
            if (modal) {
                document.getElementById('arrival-time-input').value = new Date().toTimeString().slice(0,5);
                
                if (isMobile) {
                    const timeInput = document.getElementById('arrival-time-input');
                    timeInput.setAttribute('pattern', '[0-9]{2}:[0-9]{2}');
                }
                
                modal.classList.remove('hidden');
            }
        }

        // Faltou
        if (button.classList.contains('faltou-btn')) {
            console.log("Marcando como faltoso:", id);
            this.updateStatus(app.db, app.currentPauta.id, id, { status: 'faltoso' }, app.currentUserName);
        }

        // Voltar para pauta
        if (button.classList.contains('return-to-pauta-btn')) {
            console.log("Voltando para pauta:", id);
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

        // Voltar de faltoso para pauta
        if (button.classList.contains('return-to-pauta-from-faltoso-btn')) {
            console.log("Revertendo faltoso para pauta:", id);
            this.updateStatus(app.db, app.currentPauta.id, id, {
                status: 'pauta'
            }, app.currentUserName);
        }

        // Voltar para aguardando
        if (button.classList.contains('return-to-aguardando-btn')) {
            console.log("Voltando para aguardando:", id);
            this.updateStatus(app.db, app.currentPauta.id, id, {
                status: 'aguardando',
                attendant: null,
                attendedTime: null
            }, app.currentUserName);
        }

        // Voltar de em atendimento para aguardando (quando tem delegação)
        if (button.classList.contains('return-to-aguardando-from-emAtendimento-btn')) {
            console.log("Voltando de em atendimento para aguardando:", id);
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

        // Voltar de distribuição para aguardando
        if (button.classList.contains('return-to-aguardando-from-dist-btn')) {
            console.log("Voltando de distribuição para aguardando:", id);
            this.updateStatus(app.db, app.currentPauta.id, id, {
                status: 'aguardando',
                distributionStatus: null
            }, app.currentUserName);
        }

        // Deletar
        if (button.classList.contains('delete-btn')) {
            console.log("Deletando:", id);
            if (confirm("Tem certeza?")) {
                this.deleteAssisted(app.db, app.currentPauta.id, id, app.currentUserName);
            }
        }

        // Prioridade
        if (button.classList.contains('priority-btn')) {
            console.log("Prioridade:", id);
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

        // Atender (com delegação) - Selecionar colaborador para delegar
        if (button.classList.contains('select-collaborator-btn')) {
            console.log("Selecionando colaborador para delegar atendimento:", id);
            const assisted = app.allAssisted && app.allAssisted.find(a => a.id === id);
            if (!assisted) {
                showNotification("Erro: Assistido não encontrado", "error");
                return;
            }
            
            window.assistedIdToHandle = id;
            window.assistedNameToHandle = assisted.name || '';
            window.assistedTipoAcao = 'delegar';
            document.getElementById('assisted-to-attend-name').textContent = assisted.name || '';
            
            this.preencherListaColaboradoresModal(app);
            
            const modal = document.getElementById('select-collaborator-modal');
            if (modal) {
                modal.classList.remove('hidden');
                
                const confirmBtn = document.getElementById('confirm-select-collaborator');
                if (confirmBtn) {
                    const newConfirmBtn = confirmBtn.cloneNode(true);
                    if (confirmBtn.parentNode) {
                        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
                    }
                    
                    newConfirmBtn.addEventListener('click', async () => {
                        if (window.selectedCollaboratorId && window.selectedCollaboratorId !== 'null') {
                            await this.delegateAttendance(
                                app, 
                                window.assistedIdToHandle, 
                                window.selectedCollaboratorName, 
                                window.selectedCollaboratorId
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

        // Atender (direto) - Modal de atendimento direto
        if (button.classList.contains('attend-directly-from-aguardando-btn')) {
            console.log("Atendendo diretamente:", id);
            window.assistedIdToHandle = id;
            
            this.preencherSelectColaboradores(app, 'attendant-select');
            
            const modal = document.getElementById('attendant-modal');
            if (modal) {
                modal.classList.remove('hidden');
                
                const confirmBtn = document.getElementById('confirm-attendant');
                if (confirmBtn) {
                    const newConfirmBtn = confirmBtn.cloneNode(true);
                    if (confirmBtn.parentNode) {
                        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
                    }
                    
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

        // Delegar finalização (para colaboradores)
        if (button.classList.contains('delegate-finalization-btn')) {
            console.log("Delegando finalização:", id);
            const assisted = app.allAssisted && app.allAssisted.find(a => a.id === id);
            if (!assisted) {
                showNotification("Erro: Assistido não encontrado", "error");
                return;
            }
            
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
                    if (confirmBtn.parentNode) {
                        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
                    }
                    
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

        // Editar assistido
        if (button.classList.contains('edit-assisted-btn')) {
            console.log("Editando assistido:", id);
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

        // Editar atendente
        if (button.classList.contains('edit-attendant-btn')) {
            console.log("Editando atendente:", id);
            const assisted = app.allAssisted && app.allAssisted.find(a => a.id === id);
            if (assisted) {
                this.preencherSelectColaboradores(app, 'edit-attendant-select');
                
                const select = document.getElementById('edit-attendant-select');
                if (select && assisted.attendedBy) {
                    let nomeAtendente = '';
                    if (typeof assisted.attendedBy === 'object') {
                        nomeAtendente = assisted.attendedBy.nome || '';
                    } else {
                        nomeAtendente = assisted.attendedBy;
                    }
                    
                    const options = Array.from(select.options).map(opt => opt.value);
                    if (options.includes(nomeAtendente)) {
                        select.value = nomeAtendente;
                    }
                }
                
                window.assistedIdToHandle = id;
                if (document.getElementById('edit-attendant-modal')) document.getElementById('edit-attendant-modal').classList.remove('hidden');
            }
        }

        // Gerenciar demandas
        if (button.classList.contains('manage-demands-btn')) {
            console.log("Gerenciando demandas:", id);
            const assisted = app.allAssisted && app.allAssisted.find(a => a.id === id);
            if (assisted) {
                window.assistedIdToHandle = id;
                document.getElementById('demands-assisted-name-modal').textContent = assisted.name || '';
                
                const infoDiv = document.createElement('div');
                infoDiv.className = "mb-4 p-3 bg-gray-50 rounded-lg text-sm";
                
                let infoHtml = '';
                if (assisted.attendedBy) {
                    infoHtml += `<p><span class="font-semibold">Atendido por:</span> ${assisted.attendedBy}</p>`;
                }
                if (assisted.delegatedBy) {
                    infoHtml += `<p><span class="font-semibold">Delegado por:</span> ${assisted.delegatedBy}`;
                    if (assisted.assignedCollaborator) {
                        infoHtml += ` para ${assisted.assignedCollaborator.name}`;
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
                    if (demandsListContainer) {
                        modal.insertBefore(infoDiv, demandsListContainer);
                    }
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
                            li.innerHTML = `
                                <span>${escapeHTML(demand)}</span>
                                <button class="remove-demand-item-btn text-red-500 text-[10px] md:text-xs">Remover</button>
                            `;
                            container.appendChild(li);
                        });
                    }
                }
                if (document.getElementById('demands-modal')) document.getElementById('demands-modal').classList.remove('hidden');
            }
        }

        // Ver detalhes
        if (button.classList.contains('view-details-btn')) {
            console.log("Ver detalhes:", id);
            
            if (window.openDetailsModal) {
                window.openDetailsModal({
                    assistedId: id,
                    pautaId: app.currentPauta && app.currentPauta.id,
                    allAssisted: app.allAssisted
                });
            } else {
                console.error("openDetailsModal não encontrado");
                showNotification("Erro ao abrir detalhes", "error");
            }
        }

        // Voltar de atendido para em atendimento/aguardando
        if (button.classList.contains('return-from-atendido-btn')) {
            console.log("Revertendo atendido:", id);
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

        // Confirmar atendido
        if (button.classList.contains('toggle-confirmed-atendido') || button.classList.contains('toggle-confirmed-faltoso')) {
            console.log("Toggle confirmado:", id);
            const currentAssisted = app.allAssisted && app.allAssisted.find(a => a.id === id);
            const newConfirmedState = !(currentAssisted && (currentAssisted.isConfirmed || false));

            this.updateStatus(app.db, app.currentPauta.id, id, {
                isConfirmed: newConfirmedState,
                confirmationDetails: newConfirmedState ? { 
                    confirmedBy: app.currentUserName, 
                    confirmedAt: new Date().toISOString() 
                } : null
            }, app.currentUserName);
            
            showNotification(`Status de Marcado Presença no Verde atualizado para ${newConfirmedState ? 'Confirmado' : 'Não Confirmado'}.`, 'info');
        }
    },

    /**
     * Atualiza a lista de assistidos (para refresh após salvar/gerar PDF)
     */
    refreshAssistedList(app) {
        if (!app || !app.currentPauta || !app.currentPauta.id) return;
        
        if (app.unsubscribeFromAttendances) {
            console.log("🔄 Lista de assistidos será atualizada pelo listener");
        } else {
            this.loadAssistedList(app);
        }
    },
    
    /**
     * Carrega a lista de assistidos manualmente
     */
    async loadAssistedList(app) {
        if (!app || !app.currentPauta || !app.currentPauta.id) return;
        
        try {
            const attendanceRef = collection(app.db, "pautas", app.currentPauta.id, "attendances");
            const snapshot = await getDocs(attendanceRef);
            app.allAssisted = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            UIService.renderAssistedLists(app);
            console.log("✅ Lista de assistidos atualizada manualmente");
        } catch (error) {
            console.error("Erro ao carregar lista:", error);
        }
    },
};
