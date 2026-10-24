
// js/pauta.js - VERSÃO COM CORREÇÃO DO MENU RÁPIDO E RETORNO DE ATENDIDOS
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, where, getDocs, getDoc, writeBatch, increment, setDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showNotification, normalizeText, escapeHTML, playSound } from './utils.js';
import { UIService } from './ui.js';
import { logAction } from './admin.js';
import { EmailService } from './emailService.js';

export const PautaService = {
    currentListeners: new Map(),
    actionCooldown: new Map(),

    getDestinoRetorno(app) {
        if (app.currentPautaData?.useDelegationFlow === true) {
            return 'emAtendimento';
        }
        if (app.currentPautaData?.useDistributionFlow === true) {
            return 'aguardandoDistribuicao';
        }
        return 'atendido';
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

    actionAttendDirectly(app, id, assisted) {
        const useDist = app.currentPautaData?.useDistributionFlow === true;
        const useDelegation = app.currentPautaData?.useDelegationFlow === true;
        const timestampIso = new Date().toISOString();

        if (useDist) {
            this.updateStatus(app.db, app.currentPauta.id, id, {
                status: 'aguardandoDistribuicao', distributionStatus: 'pending', inAttendanceTime: timestampIso
            }, app.currentUserName);
            showNotification(`Caso de ${assisted.name} encaminhado para Fila de Distribuição! ⚖️`, "success");
        } else if (!useDelegation) {
            this.finishAttendance(app, id, app.currentUserName, []);
        } else {
            if (app.currentPautaData?.useTvPanel !== false) {
                this.abrirModalChamadaTV(app, assisted, app.currentPautaData || app.currentPauta, 'delegar');
            } else {
                this._abrirModalClassico(app, assisted, 'delegar');
            }
        }
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

    injectRoomSearches(app) { },

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
        if (!app || !app.currentPauta || !app.currentPauta.id) {
            showNotification("Selecione uma pauta primeiro", "error");
            playSound('error');
            return;
        }

        const nameInput = document.getElementById('assisted-name');
        const name = nameInput?.value.trim();
        if (!name) {
            showNotification("Nome do assistido é obrigatório", "error");
            playSound('error');
            return;
        }

        const cpfInput = document.getElementById('assisted-cpf');
        const cpf = cpfInput?.value.trim() || '';
        const numAgendamento = document.getElementById('assisted-num-agendamento')?.value.trim() || '';
        const subjectInput = document.getElementById('assisted-subject');
        const subject = subjectInput?.value.trim() || '';

        const isScheduledRadio = document.querySelector('input[name="is-scheduled"]:checked');
        const isScheduled = isScheduledRadio && isScheduledRadio.value === 'yes';
        let scheduledTime = null;
        if (isScheduled) {
            scheduledTime = document.getElementById('scheduled-time')?.value || null;
        }

        const hasArrivedRadio = document.querySelector('input[name="has-arrived"]:checked');
        const hasArrived = hasArrivedRadio ? hasArrivedRadio.value : 'no';

        let arrivalTime = null;
        let room = null;
        let status = 'pauta';

        if (hasArrived === 'yes') {
            const timeStr = document.getElementById('arrival-time')?.value;
            if (timeStr) {
                const [hours, minutes] = timeStr.split(':');
                const arrivalDate = new Date();
                arrivalDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
                arrivalTime = arrivalDate.toISOString();
            }
            const roomSelect = document.getElementById('manual-room-select');
            if (roomSelect && !roomSelect.classList.contains('hidden')) {
                room = roomSelect.value || null;
            }
            status = 'aguardando';
        }

        const assistedData = {
            name: name,
            cpf: cpf,
            numAgendamento: numAgendamento,
            subject: subject,
            status: status,
            type: 'agendamento',
            createdAt: new Date().toISOString(),
            createdBy: app.currentUserName || app.auth.currentUser?.email,
            scheduledTime: scheduledTime,
            arrivalTime: arrivalTime,
            room: room,
            checkInOrder: hasArrived === 'yes' ? Date.now() : null,
            priority: null,
            priorityReason: null,
            lastActionBy: app.currentUserName || 'Sistema',
            lastActionTimestamp: new Date().toISOString()
        };

        const tabAgendamento = document.getElementById('tab-agendamento');
        if (tabAgendamento && !tabAgendamento.classList.contains('tab-active')) {
            assistedData.type = 'avulso';
        }

        try {
            const attendanceRef = collection(app.db, "pautas", app.currentPauta.id, "attendances");
            const docRef = await addDoc(attendanceRef, assistedData);

            await logAction(
                app.db,
                app.auth,
                app.currentUserName || 'Sistema',
                app.currentPauta.id,
                'ADD_ASSISTED',
                `Adicionou assistido: ${name}`,
                docRef.id
            );

            const mensagem = status === 'aguardando' 
                ? `"${name}" adicionado à fila de aguardando!` 
                : `"${name}" adicionado à pauta. Registre a chegada quando o assistido chegar.`;
            showNotification(mensagem, 'success');
            playSound('notification');

            if(nameInput) nameInput.value = '';
            if(cpfInput) cpfInput.value = '';
            document.getElementById('assisted-num-agendamento').value = '';
            if(subjectInput) subjectInput.value = '';
            document.getElementById('scheduled-time').value = '';
            document.getElementById('arrival-time').value = '';
            const roomSelect = document.getElementById('manual-room-select');
            if (roomSelect) roomSelect.value = '';

            if (document.getElementById('scheduled-time-wrapper')) document.getElementById('scheduled-time-wrapper').classList.add('hidden');
            if (document.getElementById('arrival-time-wrapper')) document.getElementById('arrival-time-wrapper').classList.add('hidden');

            if(nameInput) nameInput.focus();

        } catch (error) {
            console.error(error);
            showNotification("Erro ao adicionar assistido", "error");
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
                distributionHistory: assistedData.distributionHistory || []
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
                const currentAssisted = window.app?.allAssisted?.find(a => a.id === assistedId) || { name: 'Assistido' };
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
                                        assistedId, pautaId, allAssisted: window.app?.allAssisted, db: window.app?.db
                                    });
                                }
                            }
                        }
                    ]
                );
            } else {
                const action = updates.status ? `Status alterado para: ${updates.status}` : 'Dados atualizados';
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
        if (!assistedId || (!collaboratorName && collaboratorId !== 'null')) {
            showNotification("Selecione um colaborador!", "error");
            return false;
        }

        try {
            const assisted = app.allAssisted.find(a => a.id === assistedId);

            if (!assisted) {
                showNotification("Erro: Assistido não encontrado no sistema.", "error");
                return false;
            }

            if (collaboratorId === 'null') {
                await this.updateStatus(app.db, app.currentPauta.id, assistedId, {
                    assignedCollaborator: null,
                    delegatedBy: null,
                    delegatedAt: null,
                    delegationToken: null
                }, app.currentUserName);
                
                showNotification("Atribuição removida. O card não está mais delegado a ninguém.", "info");
                return true;
            }

            const colab = app.colaboradores.find(c => c.id === collaboratorId || c.nome === collaboratorName);

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
                console.warn("⚠️ Colaborador sem e-mail cadastrado. Status atualizado apenas no painel.");
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

            let eAtrasado = false;
            const tolerancia = app.currentPautaData?.toleranciaAtraso || app.currentPautaData?.tolerancia || 15;

            if (assisted.type === 'agendamento' && assisted.scheduledTime && assisted.arrivalTime) {
                const [h, m] = assisted.scheduledTime.split(':').map(Number);
                const schedDate = new Date();
                schedDate.setHours(h, m, 0, 0);
                const arrDate = new Date(assisted.arrivalTime);
                
                eAtrasado = arrDate > new Date(schedDate.getTime() + tolerancia * 60000); 
            }

            try {
                await updateDoc(doc(app.db, "pautas", app.currentPauta.id), {
                    [`stats.${eAtrasado ? 'atrasados' : 'pontuais'}`]: increment(1)
                });
                
                if (!app.currentPautaData.stats) app.currentPautaData.stats = { pontuais: 0, atrasados: 0 };
                if (eAtrasado) app.currentPautaData.stats.atrasados++;
                else app.currentPautaData.stats.pontuais++;
            } catch (e) {
                console.warn("Aviso: Falha ao salvar contador de estatísticas.", e);
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

            if (assisted.assignedCollaborator && assisted.assignedCollaborator.id && assisted.assignedCollaborator.id !== 'manual') {
                try {
                    const colabDocRef = doc(app.db, "pautas", app.currentPauta.id, "collaborators", assisted.assignedCollaborator.id);
                    await updateDoc(colabDocRef, {
                        status: 'disponivel',
                        currentAttendance: null
                    });
                } catch (e) {
                    console.warn("Aviso: Não foi possível atualizar o status do colaborador.", e);
                }
            }

            const quemAtendeu = attendedBy || app.currentUserName;
            const quemDelegou = assisted.delegatedBy ? ` (delegado por ${assisted.delegatedBy})` : '';
            
            showNotification(`Atendimento finalizado com sucesso!`, "success");
            
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

    // ── GERAÇÃO DO NOVO MODAL DE TV E LOCAL ──
    abrirModalChamadaTV(app, assisted, pauta, tipoAcao) {
        document.getElementById('modal-chamada-tv-global')?.remove();

        const ROTULOS = ['Sala', 'Recepção', 'Vara', 'Guichê', 'Mesa', 'Balcão'];
        const pautaId = pauta.id || app.currentPauta?.id;
        const pautaName = pauta.name || pauta.nome || app.currentPauta?.name || 'Pauta';
        const chave = `sigep_local_chamada_${pautaId}`;
        let salvo = null;
        try { salvo = JSON.parse(localStorage.getItem(chave)); } catch (e) { salvo = null; }

        const rotuloInicial = salvo?.rotulo || 'Sala';
        const ehPadrao = ROTULOS.includes(rotuloInicial);
        const valorInicial = salvo?.valor ?? (pauta.sala || '');

        const colaboradores = app.colaboradores || [];
        const ordenados = [...colaboradores].sort((a, b) => {
            const aLivre = a.status === 'disponivel' || !a.status;
            const bLivre = b.status === 'disponivel' || !b.status;
            if (aLivre === bLivre) return (a.nome || '').localeCompare(b.nome || '');
            return aLivre ? -1 : 1;
        });

        let opcoesColab = `<option value="">Ninguém (Apenas registrar chamada e local na TV)</option>`;
        opcoesColab += ordenados.map(c => {
            const livre = c.status === 'disponivel' || !c.status;
            return `<option value="${c.id}" data-nome="${escapeHTML(c.nome)}">${escapeHTML(c.nome)} — ${escapeHTML(c.cargo || 'Membro')} (${livre ? 'livre' : 'ocupado'})</option>`;
        }).join('');

        const modal = document.createElement('div');
        modal.id = 'modal-chamada-tv-global';
        modal.className = 'fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[99999] flex items-center justify-center p-4';
        modal.innerHTML = `
            <div class="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div class="flex justify-between items-center px-6 py-4 border-b border-slate-200">
                    <div>
                        <h3 class="font-extrabold text-lg text-slate-800">Definir Local e Delegar</h3>
                        <p class="text-sm font-semibold text-blue-600 mt-0.5">${escapeHTML(assisted.name)}</p>
                    </div>
                    <button id="btn-fechar-chamada-tv" class="text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 w-8 h-8 rounded-full flex items-center justify-center transition-colors">✕</button>
                </div>
                
                <div class="p-6 overflow-y-auto space-y-5 flex-1">
                    <div class="grid grid-cols-5 gap-3">
                        <div class="col-span-2">
                            <label class="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Tipo de Local</label>
                            <select id="tv-chamada-rotulo" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all">
                                ${ROTULOS.map(r => `<option value="${r}" ${ehPadrao && r === rotuloInicial ? 'selected' : ''}>${r}</option>`).join('')}
                                <option value="__outro" ${!ehPadrao ? 'selected' : ''}>Outro...</option>
                            </select>
                        </div>
                        <div class="col-span-3">
                            <label class="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Número / Nome</label>
                            <input type="text" id="tv-chamada-valor" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none" value="${escapeHTML(valorInicial)}" placeholder="Ex: DD, 1">
                        </div>
                    </div>
                    
                    <div id="tv-chamada-outro-wrap" class="${ehPadrao ? 'hidden' : ''}">
                        <label class="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Nome do tipo de local</label>
                        <input type="text" id="tv-chamada-outro" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none" value="${ehPadrao ? '' : escapeHTML(rotuloInicial)}" placeholder="Ex: Gabinete">
                    </div>

                    <div class="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
                        <p class="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1">Aparecerá na TV assim:</p>
                        <p id="tv-chamada-preview" class="text-xl font-black text-blue-700"></p>
                    </div>
                    
                    <div>
                        <label class="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Atribuir a um colaborador (Opcional)</label>
                        <select id="tv-chamada-colaborador" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none">
                            ${opcoesColab}
                        </select>
                        <p class="text-xs text-slate-400 mt-2">Ao escolher um colaborador, o atendimento será delegado a ele automaticamente.</p>
                    </div>
                </div>

                <div class="px-6 py-4 bg-slate-50 border-t border-slate-200 flex gap-3">
                    <button id="btn-cancelar-chamada-tv" class="flex-1 bg-white border border-slate-300 text-slate-700 font-bold text-sm py-3 rounded-xl hover:bg-slate-100 transition-colors">Cancelar</button>
                    <button id="btn-confirmar-chamada-tv" class="flex-[1.5] bg-blue-600 text-white font-bold text-sm py-3 rounded-xl hover:bg-blue-700 shadow-md shadow-blue-600/20 transition-all flex justify-center items-center gap-2">
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"/></svg>
                        Chamar na TV
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const selRotulo = modal.querySelector('#tv-chamada-rotulo');
        const inpValor  = modal.querySelector('#tv-chamada-valor');
        const inpOutro  = modal.querySelector('#tv-chamada-outro');
        const preview   = modal.querySelector('#tv-chamada-preview');

        const atualizarPreview = () => {
            modal.querySelector('#tv-chamada-outro-wrap').classList.toggle('hidden', selRotulo.value !== '__outro');
            const rotulo = selRotulo.value === '__outro' ? inpOutro.value.trim() : selRotulo.value;
            const valor = inpValor.value.trim();
            preview.textContent = [rotulo, valor].filter(Boolean).join(' ') || '—';
        };

        [selRotulo, inpValor, inpOutro].forEach(el => el.addEventListener('input', atualizarPreview));
        selRotulo.addEventListener('change', atualizarPreview);
        atualizarPreview();
        inpValor.focus();

        const close = () => modal.remove();
        modal.querySelector('#btn-fechar-chamada-tv').onclick = close;
        modal.querySelector('#btn-cancelar-chamada-tv').onclick = close;

        modal.querySelector('#btn-confirmar-chamada-tv').onclick = async () => {
            const rotulo = selRotulo.value === '__outro' ? inpOutro.value.trim() : selRotulo.value;
            const valor = inpValor.value.trim();
            try { localStorage.setItem(chave, JSON.stringify({ rotulo, valor })); } catch (e) {}

            const selColab = modal.querySelector('#tv-chamada-colaborador');
            const colabId = selColab.value;
            const colabNome = colabId ? selColab.options[selColab.selectedIndex].dataset.nome : null;

            close();

            const inAttendanceTime = new Date().toISOString();
            
            if (colabId) {
                await this.delegateAttendance(app, assisted.id, colabNome, colabId);
                await this.updateStatus(app.db, pautaId, assisted.id, {
                    localChamada: { rotulo, valor }
                }, app.currentUserName);
            } else {
                await this.updateStatus(app.db, pautaId, assisted.id, {
                    status: 'emAtendimento',
                    inAttendanceTime,
                    localChamada: { rotulo, valor }
                }, app.currentUserName);
            }

            const chamado = {
                nome: assisted.name,
                assunto: assisted.subject || '',
                local: pautaName,
                pautaNome: pautaName,
                sala: valor,
                rotuloLocal: rotulo,
                localTexto: [rotulo, valor].filter(Boolean).join(' '),
                pautaId: pautaId,
                hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                timestamp: Date.now(),
            };

            try {
                const painelRef = doc(app.db, "pautas", pautaId, "painel", "ultimoChamado");
                await setDoc(painelRef, { atual: chamado }, { merge: true });
                if (typeof playSound === 'function') playSound('chime');
                showNotification(`Pronto! ${assisted.name} chamado na TV.`, "success");
            } catch (error) {
                console.error("Erro ao atualizar TV:", error);
                showNotification("Aviso: Status atualizado, mas houve falha ao enviar o nome para a TV.", "warning");
            }
        };
    },

    // Abertura Condicional do Modal Clássico
    _abrirModalClassico(app, assisted, tipoAcao) {
        if (typeof PainelGeralService !== 'undefined' && typeof PainelGeralService.chamarAssistido === 'function') {
            PainelGeralService.chamarAssistido(assisted, app.currentPauta?.name || 'Recepção');
        }
        
        window.assistedIdToHandle = assisted.id;
        window.assistedNameToHandle = assisted.name || '';
        window.assistedTipoAcao = tipoAcao;
        
        const nameElement = document.getElementById('assisted-to-attend-name');
        if (nameElement) nameElement.textContent = assisted.name || '';
        
        const modal = document.getElementById('select-collaborator-modal');
        if (modal) {
            modal.classList.remove('hidden');
            setTimeout(() => {
                const searchInput = document.getElementById('collaborator-search-input');
                if (searchInput) {
                    searchInput.value = '';
                    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                }
                
                if (typeof UIService !== 'undefined' && typeof UIService.preencherListaColaboradoresModal === 'function') {
                    UIService.preencherListaColaboradoresModal(app);
                }
                
                if (searchInput) searchInput.focus();
            }, 150);
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

        const statsDaPauta = app.currentPautaData?.stats || { pontuais: 0, atrasados: 0 };
        const tolerancia = app.currentPautaData?.toleranciaAtraso || app.currentPautaData?.tolerancia || 15;
        
        const orderedList = this.sortAguardando(aguardandoList, app.currentPautaData.ordemAtendimento, statsDaPauta, tolerancia);
        const nextAssisted = orderedList[0];

        if (!nextAssisted) {
            showNotification("Não foi possível identificar o próximo assistido.", "error");
            return;
        }
        
        const usaDelegação = app.currentPautaData?.useDelegationFlow === true;
        const usaDistribuição = app.currentPautaData?.useDistributionFlow === true;

        let tipoAcao = 'atender_direto';
        if (usaDelegação) {
            tipoAcao = 'delegar';
        } else if (usaDistribuição) {
            tipoAcao = 'distribuicao';
        }

        if (app.currentPautaData?.useTvPanel !== false) {
            this.abrirModalChamadaTV(app, nextAssisted, app.currentPautaData || app.currentPauta, tipoAcao);
        } else {
            this._abrirModalClassico(app, nextAssisted, tipoAcao);
        }
    },

    actionAttendDirectly(app, id, assisted) {
        const useDist = app.currentPautaData?.useDistributionFlow === true;
        const useDelegation = app.currentPautaData?.useDelegationFlow === true;
        const timestampIso = new Date().toISOString();

        if (useDist) {
            this.updateStatus(app.db, app.currentPauta.id, id, {
                status: 'aguardandoDistribuicao', distributionStatus: 'pending', inAttendanceTime: timestampIso
            }, app.currentUserName);
            showNotification(`Caso de ${assisted.name} encaminhado para Fila de Distribuição! ⚖️`, "success");
        } else {
            const tipoAcao = useDelegation ? 'delegar' : 'atender_direto';
            
            if (app.currentPautaData?.useTvPanel !== false) {
                this.abrirModalChamadaTV(app, assisted, app.currentPautaData || app.currentPauta, tipoAcao);
            } else {
                this._abrirModalClassico(app, assisted, tipoAcao);
            }
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
            const isSuperAdminGlobal = userData?.role === 'superadmin';
            const isAdminDoOrgao = userData?.role === 'admin' && userData?.orgaoId === pautaData.orgaoId;
                        
            if (pautaData.owner !== user.uid && !isSuperAdminGlobal && !isAdminDoOrgao) {
                showNotification("Acesso restrito: Você não tem permissão para apagar pautas deste órgão.", "error");
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
                if (filtrosAdicionais.dataInicial) {
                    const dataInicial = new Date(filtrosAdicionais.dataInicial);
                    pautasFiltradas = pautasFiltradas.filter(p => {
                        if (!p.createdAt) return true;
                        return new Date(p.createdAt) >= dataInicial;
                    });
                }
                
                if (filtrosAdicionais.dataFinal) {
                    const dataFinal = new Date(filtrosAdicionais.dataFinal);
                    dataFinal.setHours(23, 59, 59, 999);
                    pautasFiltradas = pautasFiltradas.filter(p => {
                        if (!p.createdAt) return true;
                        return new Date(p.createdAt) <= dataFinal;
                    });
                }
                
                if (filtrosAdicionais.tipo && filtrosAdicionais.tipo !== 'todos') {
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
        if (assisted.priority === 'RETORNO_RAPIDO') return 'RETORNO_RAPIDO';

        if (assisted.type === 'agendamento' && assisted.scheduledTime && assisted.arrivalTime) {
            try {
                const [h, m] = assisted.scheduledTime.split(':').map(Number);
                const agendado = new Date();
                agendado.setHours(h, m, 0, 0);

                const chegada = new Date(assisted.arrivalTime);
                const diffMinutos = (chegada - agendado) / (1000 * 60);

                if (diffMinutos <= 5) return 'Máxima'; 
                if (diffMinutos <= 15) return 'Média';
                return 'Mínima';
            } catch (e) {
                return 'Média';
            }
        }

        return 'Média';
    },

    getPriorityClass(priority) {
        const classes = {
            'URGENTE': 'priority-urgente', 
            'RETORNO_RAPIDO': 'priority-retorno', 
            'Máxima': 'priority-maxima',   
            'Média': 'priority-media',     
            'Mínima': 'priority-minima'    
        };
        return classes[priority] || '';
    },

    sortAguardando(list, orderType, stats = { pontuais: 0, atrasados: 0 }, toleranciaMinutos = 15) {
        if (!list || !list.length) return [];

        const agora = Date.now();
        const TOLERANCIA_MINUTOS = parseInt(toleranciaMinutos) || 15;
        const TEMPO_ESPERA_ALERTA_MS = 45 * 60 * 1000; 

        const getTempoChegada = (item) => {
            if (item.arrivalTime) {
                return new Date(item.arrivalTime).getTime();
            }
            return item.checkInOrder || agora;
        };

        const getPriorityWeight = (p) => {
            if (p === 'URGENTE') return 3;
            if (p === 'RETORNO_RAPIDO') return 2;
            return 1;
        };

        const isAtrasado = (item) => {
            if (item.type !== 'agendamento' || !item.scheduledTime || !item.arrivalTime) return false;
            
            const [h, m] = item.scheduledTime.split(':').map(Number);
            const arrDate = new Date(item.arrivalTime);
            
            const schedDate = new Date(arrDate);
            schedDate.setHours(h, m, 0, 0);

            return arrDate > new Date(schedDate.getTime() + TOLERANCIA_MINUTOS * 60000);
        };

        const isEsperandoMuito = (item) => {
            return (agora - getTempoChegada(item)) > TEMPO_ESPERA_ALERTA_MS;
        };

        const getHoraParaOrdenacao = (item) => {
            if (item.type === 'avulso' || !item.scheduledTime) {
                if (item.arrivalTime) {
                    const dataArr = new Date(item.arrivalTime);
                    if (!isNaN(dataArr)) {
                        return dataArr.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                    }
                }
                return '23:59'; 
            }

            if (isAtrasado(item)) {
                const dataArr = new Date(item.arrivalTime);
                return dataArr.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            }

            return item.scheduledTime;
        };

        list.forEach(item => {
            item._alertaAtraso = isAtrasado(item);
            item._alertaEspera = isEsperandoMuito(item);
        });

        if (orderType === 'manual') return [...list].sort((a, b) => (a.manualIndex || 0) - (b.manualIndex || 0));

        if (orderType === 'chegada') {
            return [...list].sort((a, b) => {
                const wA = getPriorityWeight(a.priority);
                const wB = getPriorityWeight(b.priority);
                if (wA !== wB) return wB - wA; 
                return getTempoChegada(a) - getTempoChegada(b);
            });
        }

        return [...list].sort((a, b) => {
            const wA = getPriorityWeight(a.priority);
            const wB = getPriorityWeight(b.priority);
            if (wA !== wB) return wB - wA; 

            if (orderType === 'proporcional') {
                const atrasadoA = isAtrasado(a);
                const atrasadoB = isAtrasado(b);
                if (atrasadoA !== atrasadoB) {
                    const deveChamarAtrasado = (stats.pontuais % 3 === 0) && stats.pontuais > 0;
                    return deveChamarAtrasado ? (atrasadoA ? -1 : 1) : (atrasadoA ? 1 : -1);
                }
            }

            if (orderType === 'aging') {
                const esperaA = agora - getTempoChegada(a);
                const esperaB = agora - getTempoChegada(b);
                if (esperaA > 3600000) return -1;
                if (esperaB > 3600000) return 1;
            }

            if (orderType === 'fim_turno') {
                const isTardeA = parseInt((a.scheduledTime || '09:00').split(':')[0]) >= 13;
                const isTardeB = parseInt((b.scheduledTime || '09:00').split(':')[0]) >= 13;
                if (isTardeA !== isTardeB) return isTardeA ? 1 : -1;
            }

            if (orderType === 'flexivel_alerta' || orderType === 'flexivel' || orderType === 'padrao') {
                const atrasadoA = isAtrasado(a);
                const atrasadoB = isAtrasado(b);

                if (!atrasadoA && atrasadoB) return -1; 
                if (atrasadoA && !atrasadoB) return 1;  

                const horaA = getHoraParaOrdenacao(a);
                const horaB = getHoraParaOrdenacao(b);
                
                if (horaA === horaB) {
                    return getTempoChegada(a) - getTempoChegada(b);
                }
                return horaA.localeCompare(horaB);
            }

            return (a.scheduledTime || '').localeCompare(b.scheduledTime || '') || (getTempoChegada(a) - getTempoChegada(b));
        });
    },

    setupManualSort(app) {
        const el = document.getElementById('aguardando-list');
        if (!el) return;

        if (app.currentPautaData && app.currentPautaData.ordemAtendimento === 'manual' && !app.isPautaClosed) {
            if (window.sortableAguardando) window.sortableAguardando.destroy();

            const isMobile = this.isMobileDevice();
            
            window.sortableAguardando = new Sortable(el, {
                animation: isMobile ? 200 : 300,
                delay: isMobile ? 250 : 0,
                delayOnTouchOnly: true,
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

    preencherSelectColaboradores(app, selectId) {
        const select = document.getElementById(selectId);
        if (!select) return;
        
        const valorAtual = select.value;
        select.innerHTML = '<option value="">Selecione um profissional...</option>';
        
        const optNaoAtribuir = document.createElement('option');
        optNaoAtribuir.value = "null";
        optNaoAtribuir.textContent = "🚫 Não Atribuir a ninguém";
        select.appendChild(optNaoAtribuir);
        
        const colaboradores = app.colaboradores || [];
        
        colaboradores.forEach(colab => {
            const opt = document.createElement('option');
            opt.value = colab.nome;
            const statusText = colab.presente ? ' (Online)' : '';
            opt.textContent = `${colab.nome} - ${colab.cargo || 'Membro'}${statusText}`;
            select.appendChild(opt);
        });
        
        if (valorAtual) select.value = valorAtual;
    },

    // ============================================================
    // 🛠️ MÓDULO DE AÇÕES DO CARD (REFATORADO COM ACTION MAP)
    // ============================================================

    handleCardActions(e, app) {
        const button = e.target.closest('button');
        if (!button) return;

        const id = button.dataset.id;
        if (!id) return;

        const currentUserRole = app.currentUser?.role;
        const isApoio = currentUserRole === 'apoio';

        const acoesProibidasApoio = [
            'return-to-pauta-btn', 'return-to-pauta-from-faltoso-btn', 'return-to-aguardando-btn', 
            'return-to-aguardando-from-emAtendimento-btn', 'return-to-aguardando-from-dist-btn', 
            'return-from-atendido-btn', 'delete-btn', 'select-collaborator-btn',
            'attend-directly-from-aguardando-btn', 'delegate-finalization-btn', 'edit-assisted-btn', 
            'edit-attendant-btn', 'manage-demands-btn', 'toggle-confirmed-atendido', 
            'toggle-confirmed-faltoso', 'update-doc-status-btn', 'cancel-pauta-btn'
        ];

        const acaoAtual = acoesProibidasApoio.find(classe => button.classList.contains(classe));
        if (isApoio && acaoAtual) {
            showNotification("Acesso restrito: Seu perfil de Apoio não tem permissão para esta ação administrativa.", "warning");
            playSound('warning');
            return;
        }

        if (button.classList.contains('quick-action-toggle')) {
            return this.handleMenuToggle(e, button, id);
        }

        const assisted = app.allAssisted && app.allAssisted.find(a => a.id === id);
        if (!assisted) return; 

        if (button.classList.contains('quick-action-item') && !button.classList.contains('update-doc-status-btn')) {
            return this.handleQuickActionItem(app, button, id, assisted);
        }

        // MAPA DE AÇÕES ATUALIZADO COM AS NOVAS FUNÇÕES
        const actionMap = {
            'update-doc-status-btn': () => this.actionUpdateDocStatus(button, id, assisted),
            'check-in-btn': () => this.actionCheckIn(id),
            'faltou-btn': () => this.updateStatus(app.db, app.currentPauta.id, id, { status: 'faltoso' }, app.currentUserName),
            'toggle-confirmed-atendido': () => this.actionToggleConfirmed(app, id, assisted),
            'toggle-confirmed-faltoso': () => this.actionToggleConfirmed(app, id, assisted),
            'return-to-pauta-btn': () => this.actionReturnToPauta(app, id),
            'return-to-pauta-from-faltoso-btn': () => this.updateStatus(app.db, app.currentPauta.id, id, { status: 'pauta' }, app.currentUserName),
            'return-to-aguardando-btn': () => this.updateStatus(app.db, app.currentPauta.id, id, { status: 'aguardando', attendant: null, attendedTime: null }, app.currentUserName),
            'return-to-aguardando-from-emAtendimento-btn': () => this.actionReturnToAguardandoFromAtendimento(app, id, assisted),
            'return-to-aguardando-from-dist-btn': () => this.updateStatus(app.db, app.currentPauta.id, id, { status: 'aguardando', distributionStatus: null }, app.currentUserName),
            'delete-btn': () => { if (confirm("Tem certeza?")) this.deleteAssisted(app.db, app.currentPauta.id, id, app.currentUserName); },
            'set-retorno-rapido-btn': () => this.actionSetRetornoRapido(app, id, assisted),
            'priority-btn': () => this.actionTogglePriority(app, id, assisted),
            'select-collaborator-btn': () => this.actionSelectCollaborator(app, id, assisted),
            'attend-directly-from-aguardando-btn': () => this.actionAttendDirectly(app, id, assisted),
            'delegate-finalization-btn': () => this.actionDelegateFinalization(id, assisted),
            'edit-assisted-btn': () => this.actionEditAssisted(app, id, assisted),
            'edit-attendant-btn': () => this.actionEditAttendant(app, id, assisted),
            'manage-demands-btn': () => this.actionManageDemands(id, assisted),
            'view-details-btn': () => { if (window.openDetailsModal) window.openDetailsModal({ assistedId: id, pautaId: app.currentPauta?.id, allAssisted: app.allAssisted, db: app.db }); },
            'return-from-atendido-btn': () => this.actionReturnFromAtendido(app, id, assisted),
            
            // --- NOVAS AÇÕES DE TV E RECHAMADA ---
            'chamar-distribuicao-tv-btn': () => {
                this.abrirModalChamadaTV(app, assisted, app.currentPautaData || app.currentPauta, 'distribuicao');
            },
            'rechamar-tv-btn': async () => {
                const localSalvo = localStorage.getItem(`sigep_tv_local_${app.currentPauta.id}`) || assisted.localChamada?.valor || 'Atendimento';
                const pautaName = app.currentPauta?.name || 'Pauta';
                
                const chamado = {
                    nome: assisted.name,
                    assunto: assisted.subject || '',
                    local: pautaName,
                    pautaNome: pautaName,
                    sala: localSalvo,
                    rotuloLocal: assisted.localChamada?.rotulo || 'Guichê',
                    localTexto: `${assisted.localChamada?.rotulo || 'Guichê'} ${localSalvo}`,
                    pautaId: app.currentPauta.id,
                    hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                    timestamp: Date.now(),
                };

                try {
                    const painelRef = doc(app.db, "pautas", app.currentPauta.id, "painel", "ultimoChamado");
                    await setDoc(painelRef, { atual: chamado }, { merge: true });
                    if (typeof playSound === 'function') playSound('chime');
                    showNotification(`📢 Alerta emitido na TV para ${assisted.name}!`, "success");
                } catch (error) {
                    console.error("Erro ao emitir alerta na TV:", error);
                    showNotification("Erro ao acionar a TV.", "error");
                }
            },

            // --- AÇÕES EXTRA ---
            'cancel-pauta-btn': () => {
                if (confirm("Tem certeza que deseja retirar este assistido da pauta?\n\nEle sairá da fila e NÃO constará como faltoso. Use isso para desistências ou erros.")) {
                    this.updateStatus(app.db, app.currentPauta.id, id, { status: 'cancelado' }, app.currentUserName);
                }
            },
            'toggle-extrapauta-btn': () => {
                const novoEstado = !assisted.isExtraPauta;
                this.updateStatus(app.db, app.currentPauta.id, id, { isExtraPauta: novoEstado }, app.currentUserName);
                showNotification(novoEstado ? "Selo Extra-Pauta adicionado!" : "Selo Extra-Pauta removido.", "info");
            }
        };

        const activeActionKey = Object.keys(actionMap).find(key => button.classList.contains(key));
        
        if (activeActionKey) {
            if (['update-doc-status-btn', 'toggle-confirmed-atendido', 'toggle-confirmed-faltoso', 'toggle-extrapauta-btn', 'cancel-pauta-btn'].includes(activeActionKey)) {
                e.stopPropagation();
            }
            actionMap[activeActionKey]();
        }
    },

    handleMenuToggle(e, button, id) {
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
    },

    handleQuickActionItem(app, button, id, assisted) {
        const actionKey = `${id}-${button.dataset.tipo}`;
        if (!this.canPerformAction(actionKey)) return;
        
        const tipoAcao = button.dataset.tipo;
        const menu = document.getElementById(`quick-menu-${id}`);
        if (menu) {
            menu.classList.add('hidden');
            const toggle = document.getElementById(`quick-toggle-${id}`);
            if (toggle) toggle.setAttribute('aria-expanded', 'false');
        }
        
        const tipoMap = { 'reagendar': 'Reagendamento', 'agendar': 'Agendamento', 'consulta': 'Consulta Processual', 'outros': 'Outros Assuntos' };
        const tipoDescricao = tipoMap[tipoAcao] || tipoAcao;
        
        window.assistedIdToHandle = id;
        window.assistedNameToHandle = assisted.name || '';
        window.assistedTipoAcao = tipoAcao;
        window.assistedTipoDescricao = tipoDescricao;
        
        showNotification(`${tipoDescricao} para ${assisted.name}`, "info");
        
        if (app.currentPautaData?.useTvPanel !== false) {
            this.abrirModalChamadaTV(app, assisted, app.currentPautaData || app.currentPauta, tipoAcao);
        } else {
            this._abrirModalClassico(app, assisted, tipoAcao);
        }
    },

    actionUpdateDocStatus(button, id, assisted) {
        const menu = document.getElementById(`quick-menu-${id}`);
        if (menu) {
            menu.classList.add('hidden');
            const toggle = document.getElementById(`quick-toggle-${id}`);
            if (toggle) toggle.setAttribute('aria-expanded', 'false');
        }

        window.assistedIdToHandle = id;
        const statusAtual = assisted.docWorkflowStatus || 'Pendente';
        const containerButtons = document.getElementById('doc-status-buttons-container');
        const checklistContainer = document.getElementById('doc-status-checklist-container');
        const modalStatus = document.getElementById('doc-status-modal');
        
        if (containerButtons && modalStatus) {
            const etapas = [
                { val: 'Pendente', icon: '⚪' }, { val: 'Assistido Orientado', icon: '🗣️' },
                { val: 'Preenchendo Dados', icon: '✍️' }, { val: 'Documentação Recebida', icon: '📂' },
                { val: 'Falta Digitalizar', icon: '🖨️' }, { val: 'Digitalizado', icon: '💻' },
                { val: 'Inserido no Verde/CNP', icon: '✅' }
            ];

            let botoesHtml = '';
            etapas.forEach(etapa => {
                const isSelected = (statusAtual === etapa.val) || (!assisted.docWorkflowStatus && etapa.val === 'Pendente');
                const cssClass = isSelected ? 'bg-blue-600 text-white border-blue-700 shadow-md transform scale-[1.02]' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50';
                botoesHtml += `<button class="doc-etapa-btn w-full text-left px-4 py-3 rounded-xl border transition-all text-sm font-bold ${cssClass}" data-etapa="${etapa.val}">${etapa.icon} ${etapa.val}</button>`;
            });

            containerButtons.innerHTML = botoesHtml;

            if (checklistContainer) {
                const textoLimpo = (assisted.subject || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const regrasDocumentos = {
                    "divorcio": { gatilhos: ["divorcio", "separacao", "dissolucao", "casamento"], docs: [{ nome: "Certidão de Casamento", obrigatorio: true }, { nome: "Certidão de Nascimento dos filhos (se houver)", obrigatorio: false }, { nome: "Relação de Bens (Documentos de imóveis, carros)", obrigatorio: false }] },
                    "alimentos": { gatilhos: ["alimento", "pensao", "revisao", "exoneracao", "guarda"], docs: [{ nome: "Certidão de Nascimento do(s) menor(es)", obrigatorio: true }, { nome: "Comprovantes de despesas (escola, farmácia)", obrigatorio: false }] },
                    "saude": { gatilhos: ["saude", "medicamento", "cirurgia", "internacao", "vaga", "sus"], docs: [{ nome: "Laudo Médico atualizado (com CID)", obrigatorio: true }, { nome: "Receituário / Negativa do SUS", obrigatorio: true }] }
                };
                
                let docsDinamicos = [];
                for (const chave in regrasDocumentos) {
                    if (regrasDocumentos[chave].gatilhos.some(palavra => textoLimpo.includes(palavra))) {
                        docsDinamicos = regrasDocumentos[chave].docs; break;
                    }
                }

                const renderCheck = (doc) => `
                    <label class="flex items-start gap-2 cursor-pointer group mb-1.5">
                        <input type="checkbox" class="mt-0.5 w-4 h-4 ${doc.obrigatorio ? 'text-blue-600' : 'text-slate-400'} border-slate-300 rounded focus:ring-blue-500 transition-colors">
                        <span class="text-[11px] md:text-xs ${doc.obrigatorio ? 'font-semibold text-slate-700' : 'text-slate-500 italic'} leading-tight group-hover:text-blue-700 transition-colors">
                            ${escapeHTML(doc.nome)} ${!doc.obrigatorio ? `<span class="text-[9px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded ml-1 font-normal border border-slate-200">Facultativo</span>` : ''}
                        </span>
                    </label>`;

                let checkHtml = `<p class="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">Conferência de Documentos</p>`;
                checkHtml += renderCheck({nome: "Identidade (RG/CNH) e CPF", obrigatorio: true});
                checkHtml += renderCheck({nome: "Comprovante de Residência atualizado", obrigatorio: true});
                checkHtml += renderCheck({nome: "Comprovante de Renda", obrigatorio: true});
                docsDinamicos.forEach(d => checkHtml += renderCheck(d));
                checkHtml += `<div class="mt-3 pt-2 border-t border-slate-100"></div>`;
                checkHtml += renderCheck({nome: "Declaração de Imposto de Renda", obrigatorio: false});
                checkHtml += renderCheck({nome: "Afirmação de Hipossuficiência", obrigatorio: false});
                
                checklistContainer.innerHTML = checkHtml;
                checklistContainer.classList.remove('hidden');
            }
            modalStatus.classList.remove('hidden');
        }
    },

    actionCheckIn(id) {
        window.assistedIdToHandle = id;
        const modal = document.getElementById('arrival-modal');
        if (modal) {
            document.getElementById('arrival-time-input').value = new Date().toTimeString().slice(0,5);
            modal.classList.remove('hidden');
        }
    },

    actionToggleConfirmed(app, id, assisted) {
        const novoEstado = !assisted.isConfirmed;
        this.updateStatus(app.db, app.currentPauta.id, id, { isConfirmed: novoEstado }, app.currentUserName);
    },

    actionReturnToPauta(app, id) {
        this.updateStatus(app.db, app.currentPauta.id, id, {
            status: 'pauta', arrivalTime: null, priority: null, assignedCollaborator: null,
            inAttendanceTime: null, room: null, distributionStatus: null
        }, app.currentUserName);
    },

    actionReturnToAguardandoFromAtendimento(app, id, assisted) {
        this.updateStatus(app.db, app.currentPauta.id, id, {
            status: 'aguardando', assignedCollaborator: null, delegatedBy: null,
            delegatedAt: null, inAttendanceTime: null, distributionStatus: null
        }, app.currentUserName);
        
        if (assisted?.assignedCollaborator?.id && assisted.assignedCollaborator.id !== 'manual') {
            try {
                const colabDocRef = doc(app.db, "pautas", app.currentPauta.id, "collaborators", assisted.assignedCollaborator.id);
                updateDoc(colabDocRef, { status: 'disponivel', currentAttendance: null });
            } catch (e) {
                console.warn("Aviso: Falha ao resetar status do colaborador.", e);
            }
        }
        if (assisted && assisted.assignedCollaborator) {
            showNotification(`Delegação para ${assisted.assignedCollaborator.name} removida`, "info");
        }
    },

    actionSetRetornoRapido(app, id, assisted) {
        const motivo = prompt("Qual o motivo da pausa na pauta?\n(Ex: Foi tirar xerox, Aguardando a 2ª parte chegar, etc)");
        if (motivo === null) return; 
        
        const razaoSalva = motivo.trim() === "" ? "Aguardando Retorno" : motivo.trim();
        this.updateStatus(app.db, app.currentPauta.id, id, {
            status: 'pausado', priority: 'RETORNO_RAPIDO', priorityReason: razaoSalva,
            assignedCollaborator: null, delegatedBy: null, delegatedAt: null,
            inAttendanceTime: null, distributionStatus: null
        }, app.currentUserName);
        
        showNotification(`Assistido pausado: ${razaoSalva}`, "info");
    },

    actionTogglePriority(app, id, assisted) {
        if (assisted && (assisted.priority === 'URGENTE' || assisted.priority === 'RETORNO_RAPIDO')) {
            if (confirm("Remover a marcação especial desta pessoa?")) {
                this.updateStatus(app.db, app.currentPauta.id, id, { priority: null, priorityReason: null, status: 'aguardando' }, app.currentUserName);
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
    },

    actionSelectCollaborator(app, id, assisted) {
        if (app.currentPautaData?.useTvPanel !== false) {
            this.abrirModalChamadaTV(app, assisted, app.currentPautaData || app.currentPauta, 'delegar');
        } else {
            this._abrirModalClassico(app, assisted, 'delegar');
        }
    },

    actionDelegateFinalization(id, assisted) {
        window.assistedIdToHandle = id;
        const processInput = document.getElementById('dist-process-number');
        if (processInput) processInput.value = assisted.numeroProcesso || '';
        
        const modal = document.getElementById('distribution-finish-modal');
        if (modal) {
            modal.classList.remove('hidden');
            document.getElementById('confirm-dist-finish-btn').onclick = async () => {
                const cnpDigitado = processInput.value.trim();
                const timestampIso = new Date().toISOString();
                
                const servidorResponsavel = assisted.enviadoPor || window.app.currentUserName || "Servidor";
                const defensorResponsavel = assisted.attendedBy || assisted.defensorResponsavel || window.app.currentUserName || "Defensor";

                const mapaProdutividadeBI = {};
                mapaProdutividadeBI[servidorResponsavel] = 1;
                mapaProdutividadeBI[defensorResponsavel] = 1;

                await updateDoc(doc(window.app.db, "pautas", window.app.currentPauta.id, "attendances", id), {
                    status: 'atendido', numeroProcesso: cnpDigitado, trabalhosPorUsuario: mapaProdutividadeBI,
                    finalizadoPeloColaborador: true, distributionStatus: 'completed', attendedAt: timestampIso
                });
                
                modal.classList.add('hidden');
                showNotification("Distribuição concluída e faturamento do BI gravado! ✅", "success");
            };
        }
    },

    actionEditAssisted(app, id, assisted) {
        document.getElementById('edit-assisted-name').value = assisted.name || '';
        document.getElementById('edit-assisted-cpf').value = assisted.cpf || '';
        document.getElementById('edit-assisted-num-agendamento').value = assisted.numAgendamento || '';
        document.getElementById('edit-assisted-subject').value = assisted.subject || '';
        document.getElementById('edit-scheduled-time').value = assisted.scheduledTime || '';
        
        const roomSelect = document.getElementById('edit-room-select');
        if (roomSelect && assisted.room && app.currentPautaData?.type === 'multisala') {
            roomSelect.value = assisted.room;
        }
        
        window.assistedIdToHandle = id;
        if (document.getElementById('edit-assisted-modal')) document.getElementById('edit-assisted-modal').classList.remove('hidden');
    },

    actionEditAttendant(app, id, assisted) {
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
    },

    actionManageDemands(id, assisted) {
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
        
        if (atendenteNome !== 'Não informado') infoHtml += `<p><span class="font-semibold">Atendido por:</span> ${escapeHTML(atendenteNome)}</p>`;
        if (assisted.delegatedBy) {
            infoHtml += `<p><span class="font-semibold">Delegado por:</span> ${escapeHTML(assisted.delegatedBy)}`;
            if (atendenteNome !== 'Não informado' && atendenteNome !== assisted.delegatedBy) infoHtml += ` para ${escapeHTML(atendenteNome)}`;
            infoHtml += `</p>`;
        }
        if (assisted.demandas?.descricoes?.length > 0) infoHtml += `<p><span class="font-semibold">Demandas registradas:</span> ${assisted.demandas.descricoes.length}</p>`;
        
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
    },

    actionReturnFromAtendido(app, id, assisted) {
        const useDist = app.currentPautaData?.useDistributionFlow === true;
        const statusDestino = this.getDestinoRetorno(app);
        
        let updateData = {
            status: statusDestino, 
            attendedBy: null, 
            attendedAt: null,
            finalizadoPeloColaborador: false, 
            distributionStatus: useDist ? (statusDestino === 'emAtendimento' ? 'distributed' : 'pending') : null
        };

        this.updateStatus(app.db, app.currentPauta.id, id, updateData, app.currentUserName);
        
        if (assisted?.assignedCollaborator?.id && assisted.assignedCollaborator.id !== 'manual') {
            try {
                const colabDocRef = doc(app.db, "pautas", app.currentPauta.id, "collaborators", assisted.assignedCollaborator.id);
                updateDoc(colabDocRef, { status: 'disponivel', currentAttendance: null });
            } catch (e) {
                console.warn("Aviso: Falha ao resetar status do colaborador.", e);
            }
        }
        showNotification(`Atendimento retornado para: ${statusDestino === 'emAtendimento' ? 'Em Atendimento' : 'Aguardando'}`, "info");
    }
};

// --- FUNÇÃO DE PROTEÇÃO INDIVIDUAL DO PAINEL DA TV ---
window.abrirPainelTvProtegido = async function(app, pautaId) {
    try {
        const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
        const pautaDoc = await getDoc(doc(app.db, "pautas", pautaId));
        
        if (!pautaDoc.exists()) {
            window.open(`painel_tv.html?pautas=${pautaId}`, '_blank');
            return;
        }

        const data = pautaDoc.data();
        const tokenExigido = data.tvToken;

        if (!tokenExigido) {
            window.open(`painel_tv.html?pautas=${pautaId}`, '_blank');
            return;
        }

        abrirModalSenhaPainel(pautaId, tokenExigido);
    } catch (e) {
        console.error("Erro ao verificar senha do painel:", e);
        window.open(`painel_tv.html?pautas=${pautaId}`, '_blank');
    }
};

function abrirModalSenhaPainel(pautaId, tokenCorreto) {
    document.getElementById('modal-senha-painel-tv')?.remove();

    const modal = document.createElement('div');
    modal.id = 'modal-senha-painel-tv';
    modal.className = 'fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[99999] flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm text-center">
            <div class="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center mx-auto mb-3">
                <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
            </div>
            <h3 class="font-extrabold text-base text-slate-800 mb-1">Painel Protegido</h3>
            <p class="text-xs text-slate-500 mb-4">Esta pauta exige a senha/token configurada para abrir o painel da TV.</p>
            
            <input type="password" id="input-senha-painel" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-center text-lg font-mono tracking-widest outline-none focus:ring-2 focus:ring-blue-500 mb-3" placeholder="••••">
            
            <div class="flex gap-2">
                <button id="btn-cancelar-senha" class="flex-1 bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl text-xs">Cancelar</button>
                <button id="btn-entrar-senha" class="flex-1 bg-blue-600 text-white font-bold py-2.5 rounded-xl text-xs shadow-md">Aceder Painel</button>
            </div>
            <p id="erro-senha-painel" class="text-[11px] text-red-500 font-semibold mt-2 hidden">Senha incorreta!</p>
        </div>
    `;
    document.body.appendChild(modal);

    const input = document.getElementById('input-senha-painel');
    const erro = document.getElementById('erro-senha-painel');
    input.focus();

    const validar = () => {
        if (input.value.trim() === tokenCorreto) {
            modal.remove();
            window.open(`painel_tv.html?pautas=${pautaId}`, '_blank');
        } else {
            erro.classList.remove('hidden');
            input.value = '';
            input.focus();
        }
    };

    document.getElementById('btn-entrar-senha').onclick = validar;
    document.getElementById('btn-cancelar-senha').onclick = () => modal.remove();
    input.onkeypress = (e) => { if (e.key === 'Enter') validar(); };
}

export default PautaService;

