import { collection, addDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { escapeHTML } from './utils.js'; // ✅ Importa apenas a função que precisa

export const ModalService = {
    openPautaTypeModal(app) {
        document.getElementById('pauta-type-modal').classList.remove('hidden');
        
        document.querySelectorAll('.pauta-type-btn').forEach(btn => {
            btn.onclick = (e) => {
                const type = e.currentTarget.dataset.type;
                document.getElementById('pauta-type-modal').classList.add('hidden');
                this.openCreatePautaModal(type);
            };
        });
    },

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

    renderCustomRooms() {
        const list = document.getElementById('custom-rooms-list');
        const noRoomsMsg = document.getElementById('no-rooms-msg');
        list.innerHTML = '';

        if (window.customRoomsList.length === 0) {
            noRoomsMsg.classList.remove('hidden');
        } else {
            noRoomsMsg.classList.add('hidden');
            window.customRoomsList.forEach((room, index) => {
                const li = document.createElement('li');
                li.className = "flex justify-between items-center bg-white border p-2 rounded";
                li.innerHTML = `
                    <span>🏢 ${escapeHTML(room)}</span> <!-- ✅ Agora funciona -->
                    <button class="remove-room-btn text-red-500" data-index="${index}">Remover</button>
                `;
                list.appendChild(li);
            });
        }
    },

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

    openPriorityModal(assistedId) {
        window.assistedIdToHandle = assistedId;
        document.getElementById('priority-reason-modal').classList.remove('hidden');
        
        // Reset selected chips
        document.querySelectorAll('.p-chip').forEach(c => c.classList.remove('selected'));
        document.getElementById('priority-reason-input').value = '';
    },

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

    openAttendantModal(assistedId, colaboradores) {
        window.assistedIdToHandle = assistedId;
        document.getElementById('attendant-name').value = '';
        
        const datalist = document.getElementById('collaborators-list');
        datalist.innerHTML = '';
        colaboradores.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.nome;
            datalist.appendChild(opt);
        });
        
        document.getElementById('attendant-modal').classList.remove('hidden');
    },

    openSelectCollaboratorModal(assistedId, assistedName, colaboradores) {
        window.assistedIdToHandle = assistedId;
        window.assistedNameToHandle = assistedName;
        document.getElementById('assisted-to-attend-name').textContent = assistedName;
        
        const list = document.getElementById('collaborator-selection-list');
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
        
        document.getElementById('select-collaborator-modal').classList.remove('hidden');
    },

    openDemandsModal(assistedId, allAssisted) {
        const assisted = allAssisted.find(a => a.id === assistedId);
        if (!assisted) return;

        window.assistedIdToHandle = assistedId;
        document.getElementById('demands-assisted-name-modal').textContent = assisted.name;
        
        const container = document.getElementById('demands-modal-list-container');
        container.innerHTML = '';

        const demands = assisted.demandas?.descricoes || [];
        if (demands.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-center">Nenhuma demanda adicional.</p>';
        } else {
            demands.forEach(demand => {
                const li = document.createElement('li');
                li.className = 'flex justify-between items-center p-2 bg-white rounded-md';
                li.innerHTML = `
                    <span>${escapeHTML(demand)}</span> <!-- ✅ Agora funciona -->
                    <button class="remove-demand-item-btn text-red-500 text-xs">Remover</button>
                `;
                container.appendChild(li);
            });
        }
        
        document.getElementById('demands-modal').classList.remove('hidden');
    },

    closeAllModals() {
        document.querySelectorAll('.fixed.inset-0').forEach(modal => {
            modal.classList.add('hidden');
        });
    }
};
