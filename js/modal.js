// js/modal.js (MODERNIZADO - PADRÃO PREMIUM SIGAP)

import { collection, addDoc, doc, getDoc, updateDoc, arrayUnion, arrayRemove, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { escapeHTML, showNotification } from './utils.js';

export const ModalService = {
    /**
     * Abre o modal de seleção de tipo de pauta
     */
    openPautaTypeModal() {
        const modal = document.getElementById('pauta-type-modal');
        if(modal) modal.classList.remove('hidden');
        
        document.querySelectorAll('.pauta-type-btn').forEach(btn => {
            btn.onclick = (e) => {
                const type = e.currentTarget.dataset.type;
                if(modal) modal.classList.add('hidden');
                this.openCreatePautaModal(type);
            };
        });
    },

    /**
     * Abre o modal de criação de pauta
     */
    openCreatePautaModal(type) {
        const modal = document.getElementById('create-pauta-modal');
        modal.dataset.pautaType = type;
        
        const roomConfig = document.getElementById('room-config-container');
        if (type === 'multisala') {
            roomConfig.classList.remove('hidden');
            window.customRoomsList = [];
            this.renderCustomRooms();
        } else {
            roomConfig.classList.add('hidden');
        }
        
        modal.classList.remove('hidden');
    },

    /**
     * Renderiza a lista de salas personalizadas
     */
    renderCustomRooms() {
        const list = document.getElementById('custom-rooms-list');
        const noRoomsMsg = document.getElementById('no-rooms-msg');
        if (!list || !noRoomsMsg) return;
        
        list.innerHTML = '';

        if (window.customRoomsList.length === 0) {
            noRoomsMsg.classList.remove('hidden');
        } else {
            noRoomsMsg.classList.add('hidden');
            window.customRoomsList.forEach((room, index) => {
                const li = document.createElement('li');
                // Estilo moderno
                li.className = "flex justify-between items-center bg-white border border-slate-200 p-2.5 rounded-lg shadow-sm mb-2";
                li.innerHTML = `
                    <span class="font-semibold text-slate-700">🏢 ${escapeHTML(room)}</span>
                    <button class="remove-room-btn text-red-500 hover:text-red-700 bg-red-50 px-2 py-1 rounded text-xs font-bold transition-colors" data-index="${index}">Remover</button>
                `;
                list.appendChild(li);
            });
        }
    },

    /**
     * Abre o modal de compartilhamento externo
     */
    openShareModal(app) {
        if (!app.currentPauta) return;
        
        const modal = document.getElementById('share-modal');
        const toggle = document.getElementById('share-toggle');
        const maskCheck = document.getElementById('mask-names-check');
        
        if (toggle) toggle.checked = app.currentPauta.isPublic || false;
        if (maskCheck) maskCheck.checked = app.currentPauta.maskNames || false;
        
        this.updateShareUI(app);
        if (modal) modal.classList.remove('hidden');
    },

    /**
     * Atualiza a interface do modal de compartilhamento
     */
    updateShareUI(app) {
        const isPublic = app.currentPauta?.isPublic || false;
        const statusText = document.getElementById('share-status-text');
        const linkContainer = document.getElementById('share-link-container');
        
        if (statusText) statusText.textContent = isPublic ? "Acesso Público" : "Acesso Restrito";
        
        if (isPublic) {
            if (linkContainer) linkContainer.classList.remove('hidden');
            const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
            const link = `${baseUrl}/acompanhamento.html?id=${app.currentPauta.id}`;
            const linkInput = document.getElementById('share-link-input');
            if (linkInput) linkInput.value = link;
            
            const btnExt = document.getElementById('open-external-btn');
            if (btnExt) btnExt.href = link;
        } else {
            if (linkContainer) linkContainer.classList.add('hidden');
        }
    },

    /**
     * Abre o modal de prioridade
     */
    openPriorityModal(assistedId) {
        window.assistedIdToHandle = assistedId;
        const modal = document.getElementById('priority-reason-modal');
        if (modal) modal.classList.remove('hidden');
        
        document.querySelectorAll('.p-chip').forEach(c => c.classList.remove('selected'));
        const input = document.getElementById('priority-reason-input');
        if (input) input.value = '';
    },

    /**
     * Abre o modal de chegada
     */
    openArrivalModal(assistedId, app) {
        window.assistedIdToHandle = assistedId;
        const modal = document.getElementById('arrival-modal');
        
        const timeInput = document.getElementById('arrival-time-input');
        if (timeInput) timeInput.value = new Date().toTimeString().slice(0,5);
        
        const roomContainer = document.getElementById('arrival-room-container');
        const roomSelect = document.getElementById('arrival-room-select');
        
        if (app.currentPauta?.type === 'multisala' && app.currentPauta.rooms) {
            if (roomContainer) roomContainer.classList.remove('hidden');
            if (roomSelect) {
                roomSelect.innerHTML = '';
                app.currentPauta.rooms.forEach(room => {
                    const opt = document.createElement('option');
                    opt.value = room;
                    opt.textContent = room;
                    roomSelect.appendChild(opt);
                });
            }
        } else {
            if (roomContainer) roomContainer.classList.add('hidden');
        }
        
        if (modal) modal.classList.remove('hidden');
    },

    /**
     * Abre o modal de atendente (finalizar atendimento)
     */
    openAttendantModal(assistedId, colaboradores) {
        window.assistedIdToHandle = assistedId;
        
        const inputName = document.getElementById('attendant-name');
        if (inputName) inputName.value = '';
        
        const datalist = document.getElementById('collaborators-list');
        if (datalist) {
            datalist.innerHTML = '';
            colaboradores.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.nome;
                datalist.appendChild(opt);
            });
        }
        
        document.getElementById('attendant-modal')?.classList.remove('hidden');
    },

    /**
     * Abre o modal de seleção de colaborador
     */
    openSelectCollaboratorModal(assistedId, assistedName, colaboradores) {
        window.assistedIdToHandle = assistedId;
        window.assistedNameToHandle = assistedName;
        
        const nameLabel = document.getElementById('assisted-to-attend-name');
        if (nameLabel) nameLabel.textContent = assistedName;
        
        const list = document.getElementById('collaborator-selection-list');
        if (!list) return;
        
        list.innerHTML = '';

        const noAssign = document.createElement('label');
        noAssign.className = 'flex items-center p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors shadow-sm mb-2';
        noAssign.innerHTML = `
            <input type="radio" name="selectedCollaborator" value="null" data-name="Não atribuído" class="h-5 w-5 text-blue-600 focus:ring-blue-500" checked>
            <span class="ml-3 font-semibold text-slate-700">🚫 Manter na Fila Geral (Não Atribuir)</span>
        `;
        list.appendChild(noAssign);

        if (colaboradores.length === 0) {
            list.innerHTML += '<p class="text-slate-400 text-center mt-4 text-sm italic">Nenhum colaborador cadastrado na pauta.</p>';
        } else {
            colaboradores.forEach(c => {
                const isDef = (c.cargo || '').toLowerCase().includes('defensor');
                const label = document.createElement('label');
                label.className = 'flex items-center p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors shadow-sm mb-2';
                label.innerHTML = `
                    <input type="radio" name="selectedCollaborator" value="${c.id}" data-name="${c.nome}" class="h-5 w-5 text-blue-600 focus:ring-blue-500">
                    <div class="ml-3 flex flex-col">
                        <span class="font-bold text-slate-800">${escapeHTML(c.nome)}</span>
                        <span class="text-[10px] uppercase font-bold tracking-wider ${isDef ? 'text-blue-500' : 'text-slate-400'}">${escapeHTML(c.cargo)}</span>
                    </div>
                `;
                list.appendChild(label);
            });
        }
        
        document.getElementById('select-collaborator-modal')?.classList.remove('hidden');
    },

    /**
     * Abre o modal de demandas
     */
    openDemandsModal(assistedId, allAssisted) {
        const assisted = allAssisted.find(a => a.id === assistedId);
        if (!assisted) return;

        window.assistedIdToHandle = assistedId;
        const nameLabel = document.getElementById('demands-assisted-name-modal');
        if (nameLabel) nameLabel.textContent = assisted.name;
        
        const container = document.getElementById('demands-modal-list-container');
        if (!container) return;
        
        container.innerHTML = '';

        const demands = assisted.demandas?.descricoes || [];
        if (demands.length === 0) {
            container.innerHTML = '<p class="text-slate-400 text-center text-sm italic p-2">Nenhuma demanda adicional registrada.</p>';
        } else {
            demands.forEach(demand => {
                const li = document.createElement('li');
                li.className = 'flex justify-between items-center p-3 bg-white border border-slate-200 rounded-lg shadow-sm mb-2';
                li.innerHTML = `
                    <span class="text-sm font-medium text-slate-700">${escapeHTML(demand)}</span>
                    <button class="remove-demand-item-btn text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-1.5 rounded transition">🗑️</button>
                `;
                container.appendChild(li);
            });
        }
        
        document.getElementById('demands-modal')?.classList.remove('hidden');
    },

    /**
     * Abre o modal de gerenciar membros (Compartilhar)
     */
    async openMembersModal(app) {
        console.log("openMembersModal chamado");
        
        if (!app.currentPauta?.id) {
            showNotification("Nenhuma pauta selecionada", "error");
            return;
        }
        
        const modal = document.getElementById('members-modal');
        const container = document.getElementById('members-list-container');
        const statusDiv = document.getElementById('invite-status');
        const inviteInput = document.getElementById('invite-email-input');
        const inviteBtn = document.getElementById('invite-member-btn');
        
        if (!modal || !container) {
            showNotification("Modal de membros não encontrado", "error");
            return;
        }
        
        modal.classList.remove('hidden');
        if (statusDiv) statusDiv.textContent = '';
        if (inviteInput) inviteInput.value = '';
        
        try {
            const pautaRef = doc(app.db, "pautas", app.currentPauta.id);
            const pautaSnap = await getDoc(pautaRef);
            
            if (pautaSnap.exists()) {
                const pautaData = pautaSnap.data();
                container.innerHTML = '';
                
                if (pautaData.memberEmails && pautaData.memberEmails.length > 0) {
                    pautaData.memberEmails.forEach(email => {
                        const isOwner = pautaData.ownerEmail === email;
                        const memberEl = document.createElement('div');
                        memberEl.className = 'flex justify-between items-center bg-slate-50 border border-slate-200 p-3 rounded-lg shadow-sm mb-2';
                        memberEl.innerHTML = `
                            <div class="flex items-center gap-2">
                                <span class="bg-indigo-100 text-indigo-600 p-1.5 rounded-full text-xs">👤</span>
                                <span class="font-medium text-slate-700">${email} ${isOwner ? '<span class="text-[10px] text-amber-600 font-black uppercase ml-1 bg-amber-50 px-1 rounded border border-amber-200">Dono</span>' : ''}</span>
                            </div>
                            ${!isOwner ? `<button data-email="${email}" class="remove-member-btn text-red-500 hover:text-white hover:bg-red-500 px-2 py-1 text-xs rounded transition-colors font-bold border border-red-200">Remover</button>` : ''}
                        `;
                        container.appendChild(memberEl);
                    });
                } else {
                    container.innerHTML = '<p class="text-slate-400 text-center italic mt-2">Nenhum membro convidado.</p>';
                }
            }
        } catch (error) {
            console.error("Erro ao carregar membros:", error);
            showNotification("Erro ao carregar membros", "error");
        }

        if (inviteBtn) {
            inviteBtn.onclick = async () => {
                const email = inviteInput?.value.trim().toLowerCase();
                if (!email) {
                    if (statusDiv) statusDiv.innerHTML = '<span class="text-red-500 text-xs font-bold">Por favor, insira um email.</span>';
                    return;
                }
                
                if (statusDiv) statusDiv.innerHTML = '<span class="text-indigo-500 text-xs font-bold animate-pulse">Verificando...</span>';
                
                try {
                    const usersRef = collection(app.db, "users");
                    const q = query(usersRef, where("email", "==", email));
                    const querySnapshot = await getDocs(q);
                    
                    if (querySnapshot.empty) {
                        if (statusDiv) statusDiv.innerHTML = '<span class="text-red-500 text-xs font-bold">Usuário não encontrado no sistema.</span>';
                        return;
                    }
                    
                    const userDoc = querySnapshot.docs[0];
                    const pautaRef = doc(app.db, "pautas", app.currentPauta.id);

                    await updateDoc(pautaRef, {
                        members: arrayUnion(userDoc.id),
                        memberEmails: arrayUnion(email)
                    });
                    
                    if (statusDiv) statusDiv.innerHTML = `<span class="text-green-600 text-xs font-bold">✅ Usuário adicionado!</span>`;
                    if (inviteInput) inviteInput.value = '';
                    
                    this.openMembersModal(app);
                    
                } catch (error) {
                    console.error("Erro ao convidar:", error);
                    if (statusDiv) statusDiv.innerHTML = '<span class="text-red-500 text-xs font-bold">Erro de conexão ao convidar.</span>';
                }
            };
        }
    },

    /**
     * Abre o modal de editar nome da pauta
     */
    openEditPautaModal(app) {
        const input = document.getElementById('edit-pauta-name-input');
        if (input) input.value = app.currentPauta?.name || '';
        document.getElementById('edit-pauta-modal')?.classList.remove('hidden');
    },

    /**
     * Abre o modal de fechar pauta
     */
    openClosePautaModal(app) {
        const title = document.getElementById('close-modal-title');
        const msg = document.getElementById('close-modal-message');
        const pass = document.getElementById('close-pauta-password');
        const btn = document.getElementById('confirm-close-pauta-btn');

        if (title) title.textContent = 'Fechar Pauta';
        if (msg) msg.textContent = 'Confirme sua senha. Nenhum membro poderá fazer alterações até que você a reabra.';
        if (pass) pass.value = '';
        if (btn) btn.textContent = 'Confirmar Fechamento';
        
        document.getElementById('close-pauta-modal')?.classList.remove('hidden');
    },

    /**
     * Abre o modal de reabrir pauta
     */
    openReopenPautaModal(app) {
        const title = document.getElementById('close-modal-title');
        const msg = document.getElementById('close-modal-message');
        const pass = document.getElementById('close-pauta-password');
        const btn = document.getElementById('confirm-close-pauta-btn');

        if (title) title.textContent = 'Reabrir Pauta';
        if (msg) msg.textContent = 'Confirme sua senha para destravar a pauta para a equipe.';
        if (pass) pass.value = '';
        if (btn) btn.textContent = 'Reabrir Pauta';
        
        document.getElementById('close-pauta-modal')?.classList.remove('hidden');
    },

    /**
     * Abre o modal de zerar pauta
     */
    openResetPautaModal(app) {
        document.getElementById('reset-confirm-modal')?.classList.remove('hidden');
    },

    /**
     * Utilitário global: Fecha todos os modais
     */
    closeAllModals() {
        document.querySelectorAll('.fixed.inset-0').forEach(modal => {
            modal.classList.add('hidden');
        });
    }
};
