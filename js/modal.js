// js/modal.js
import { collection, addDoc, doc, getDoc, updateDoc, arrayUnion, arrayRemove, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { escapeHTML, showNotification } from './utils.js';

export const ModalService = {
    /**
     * Abre o modal de seleção de tipo de pauta
     */
    openPautaTypeModal() {
        document.getElementById('pauta-type-modal').classList.remove('hidden');
        
        document.querySelectorAll('.pauta-type-btn').forEach(btn => {
            btn.onclick = (e) => {
                const type = e.currentTarget.dataset.type;
                document.getElementById('pauta-type-modal').classList.add('hidden');
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
                li.className = "flex justify-between items-center bg-white border p-2 rounded";
                li.innerHTML = `
                    <span>🏢 ${escapeHTML(room)}</span>
                    <button class="remove-room-btn text-red-500" data-index="${index}">Remover</button>
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
        
        toggle.checked = app.currentPauta.isPublic || false;
        maskCheck.checked = app.currentPauta.maskNames || false;
        
        this.updateShareUI(app);
        modal.classList.remove('hidden');
    },

    /**
     * Atualiza a interface do modal de compartilhamento
     */
    updateShareUI(app) {
        const isPublic = app.currentPauta?.isPublic || false;
        const statusText = document.getElementById('share-status-text');
        const linkContainer = document.getElementById('share-link-container');
        
        statusText.textContent = isPublic ? "Público" : "Privado";
        
        if (isPublic) {
            linkContainer.classList.remove('hidden');
            const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
            const link = `${baseUrl}/acompanhamento.html?id=${app.currentPauta.id}`;
            document.getElementById('share-link-input').value = link;
            document.getElementById('open-external-btn').href = link;
        } else {
            linkContainer.classList.add('hidden');
        }
    },

    /**
     * Abre o modal de prioridade
     */
    openPriorityModal(assistedId) {
        window.assistedIdToHandle = assistedId;
        document.getElementById('priority-reason-modal').classList.remove('hidden');
        
        // Reset selected chips
        document.querySelectorAll('.p-chip').forEach(c => c.classList.remove('selected'));
        document.getElementById('priority-reason-input').value = '';
    },

    /**
     * Abre o modal de chegada
     */
    openArrivalModal(assistedId, app) {
        window.assistedIdToHandle = assistedId;
        const modal = document.getElementById('arrival-modal');
        document.getElementById('arrival-time-input').value = new Date().toTimeString().slice(0,5);
        
        const roomContainer = document.getElementById('arrival-room-container');
        const roomSelect = document.getElementById('arrival-room-select');
        
        if (app.currentPauta?.type === 'multisala' && app.currentPauta.rooms) {
            roomContainer.classList.remove('hidden');
            roomSelect.innerHTML = '';
            app.currentPauta.rooms.forEach(room => {
                const opt = document.createElement('option');
                opt.value = room;
                opt.textContent = room;
                roomSelect.appendChild(opt);
            });
        } else {
            roomContainer.classList.add('hidden');
        }
        
        modal.classList.remove('hidden');
    },

    /**
     * Abre o modal de atendente (finalizar atendimento)
     */
    openAttendantModal(assistedId, colaboradores) {
        window.assistedIdToHandle = assistedId;
        document.getElementById('attendant-name').value = '';
        
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
        document.getElementById('assisted-to-attend-name').textContent = assistedName;
        
        const list = document.getElementById('collaborator-selection-list');
        if (!list) return;
        
        list.innerHTML = '';

        // Opção "Não atribuir"
        const noAssign = document.createElement('label');
        noAssign.className = 'flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50';
        noAssign.innerHTML = `
            <input type="radio" name="selectedCollaborator" value="null" data-name="Não atribuído" class="h-5 w-5" checked>
            <span class="ml-3 font-semibold">Não atribuir</span>
        `;
        list.appendChild(noAssign);

        if (colaboradores.length === 0) {
            list.innerHTML += '<p class="text-gray-500 text-center mt-2">Nenhum colaborador cadastrado.</p>';
        } else {
            colaboradores.forEach(c => {
                const label = document.createElement('label');
                label.className = 'flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50';
                label.innerHTML = `
                    <input type="radio" name="selectedCollaborator" value="${c.id}" data-name="${c.nome}" class="h-5 w-5">
                    <span class="ml-3 font-semibold">${c.nome}</span>
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
        document.getElementById('demands-assisted-name-modal').textContent = assisted.name;
        
        const container = document.getElementById('demands-modal-list-container');
        if (!container) return;
        
        container.innerHTML = '';

        const demands = assisted.demandas?.descricoes || [];
        if (demands.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-center">Nenhuma demanda adicional.</p>';
        } else {
            demands.forEach(demand => {
                const li = document.createElement('li');
                li.className = 'flex justify-between items-center p-2 bg-white rounded-md';
                li.innerHTML = `
                    <span>${escapeHTML(demand)}</span>
                    <button class="remove-demand-item-btn text-red-500 text-xs">Remover</button>
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
            console.error("Modal de membros não encontrado");
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
                        memberEl.className = 'flex justify-between items-center bg-gray-100 p-2 rounded';
                        memberEl.innerHTML = `
                            <span>${email} ${isOwner ? '<span class="text-xs text-yellow-600 font-bold">(dono)</span>' : ''}</span>
                            ${!isOwner ? `<button data-email="${email}" class="remove-member-btn text-red-500 hover:text-red-700 text-sm font-semibold">Remover</button>` : ''}
                        `;
                        container.appendChild(memberEl);
                    });
                } else {
                    container.innerHTML = '<p class="text-gray-500 text-center">Nenhum membro na pauta. Convide alguém!</p>';
                }
            }
        } catch (error) {
            console.error("Erro ao carregar membros:", error);
            showNotification("Erro ao carregar membros", "error");
        }

        // Listener para o botão de convidar
        if (inviteBtn) {
            inviteBtn.onclick = async () => {
                const email = inviteInput?.value.trim().toLowerCase();
                if (!email) {
                    if (statusDiv) statusDiv.textContent = 'Por favor, insira um email.';
                    return;
                }
                
                if (statusDiv) statusDiv.textContent = 'Verificando...';
                
                try {
                    const usersRef = collection(app.db, "users");
                    const q = query(usersRef, where("email", "==", email));
                    const querySnapshot = await getDocs(q);
                    
                    if (querySnapshot.empty) {
                        if (statusDiv) statusDiv.textContent = 'Usuário não encontrado.';
                        return;
                    }
                    
                    const userDoc = querySnapshot.docs[0];
                    const pautaRef = doc(app.db, "pautas", app.currentPauta.id);

                    await updateDoc(pautaRef, {
                        members: arrayUnion(userDoc.id),
                        memberEmails: arrayUnion(email)
                    });
                    
                    if (statusDiv) statusDiv.textContent = `Usuário ${email} convidado!`;
                    if (inviteInput) inviteInput.value = '';
                    
                    // Recarregar a lista
                    this.openMembersModal(app);
                    
                } catch (error) {
                    console.error("Erro ao convidar:", error);
                    if (statusDiv) statusDiv.textContent = 'Erro ao convidar usuário.';
                }
            };
        }
    },

    /**
     * Abre o modal de editar nome da pauta
     */
    openEditPautaModal(app) {
        document.getElementById('edit-pauta-name-input').value = app.currentPauta?.name || '';
        document.getElementById('edit-pauta-modal').classList.remove('hidden');
    },

    /**
     * Abre o modal de fechar pauta
     */
    openClosePautaModal(app) {
        document.getElementById('close-modal-title').textContent = 'Fechar Pauta';
        document.getElementById('close-modal-message').textContent = 'Para fechar esta pauta, confirme sua senha. Nenhum membro poderá fazer alterações até que você a reabra.';
        document.getElementById('close-pauta-password').value = '';
        document.getElementById('confirm-close-pauta-btn').textContent = 'Confirmar';
        document.getElementById('close-pauta-modal').classList.remove('hidden');
    },

    /**
     * Abre o modal de reabrir pauta
     */
    openReopenPautaModal(app) {
        document.getElementById('close-modal-title').textContent = 'Reabrir Pauta';
        document.getElementById('close-modal-message').textContent = 'Para reabrir esta pauta, confirme sua senha.';
        document.getElementById('close-pauta-password').value = '';
        document.getElementById('confirm-close-pauta-btn').textContent = 'Reabrir';
        document.getElementById('close-pauta-modal').classList.remove('hidden');
    },

    /**
     * Abre o modal de zerar pauta
     */
    openResetPautaModal(app) {
        document.getElementById('reset-confirm-modal').classList.remove('hidden');
    },

    /**
     * Fecha todos os modais
     */
    closeAllModals() {
        document.querySelectorAll('.fixed.inset-0').forEach(modal => {
            modal.classList.add('hidden');
        });
    }
};
