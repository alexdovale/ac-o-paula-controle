// ui.js
import { escapeHTML, normalizeText, showNotification } from './utils.js';
import { PautaService } from './pauta.js';

export const UIService = {
    showScreen(screenName) {
        document.getElementById('loading-container').classList.toggle('hidden', screenName !== 'loading');
        document.getElementById('login-container').classList.toggle('hidden', screenName !== 'login');
        document.getElementById('pauta-selection-container').classList.toggle('hidden', screenName !== 'pautaSelection');
        document.getElementById('app-container').classList.toggle('hidden', screenName !== 'app');
    },

    /**
     * Renderiza os botões de filtro na tela de seleção de pautas
     */
    renderPautaFilters(containerId, activeFilter, onFilterChange, app) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.error(`Container ${containerId} não encontrado`);
            return;
        }
        
        // Verificar se os elementos de filtro de data já existem
        let dateFiltersHTML = '';
        if (activeFilter === 'periodo') {
            dateFiltersHTML = `
                <div class="flex flex-wrap gap-4 mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div class="flex-1 min-w-[200px]">
                        <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Data Inicial</label>
                        <input type="date" id="filter-data-inicial" class="w-full p-2 border border-gray-300 rounded-lg text-sm">
                    </div>
                    <div class="flex-1 min-w-[200px]">
                        <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Data Final</label>
                        <input type="date" id="filter-data-final" class="w-full p-2 border border-gray-300 rounded-lg text-sm">
                    </div>
                    <div class="flex-1 min-w-[200px]">
                        <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Tipo de Pauta</label>
                        <select id="filter-tipo-pauta" class="w-full p-2 border border-gray-300 rounded-lg text-sm">
                            <option value="todos">Todos os tipos</option>
                            <option value="agendado">Agendado</option>
                            <option value="avulso">Avulso</option>
                            <option value="multisala">Multi-Salas</option>
                        </select>
                    </div>
                    <div class="flex items-end">
                        <button id="aplicar-filtro-periodo" class="bg-green-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-green-700 transition shadow-md">
                            Aplicar Filtros
                        </button>
                    </div>
                </div>
            `;
        }
        
        container.innerHTML = `
            <div class="flex flex-wrap gap-2 mb-4 justify-center">
                <button class="filter-btn px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeFilter === 'all' ? 'bg-green-600 text-white shadow-md' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}" data-filter="all">
                    📋 Todas
                </button>
                <button class="filter-btn px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeFilter === 'active' ? 'bg-green-600 text-white shadow-md' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}" data-filter="active">
                    ✅ Pautas com prazo
                </button>
                <button class="filter-btn px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeFilter === 'expired' ? 'bg-green-600 text-white shadow-md' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}" data-filter="expired">
                    🔒 Pautas expiradas
                </button>
                <button class="filter-btn px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeFilter === 'my' ? 'bg-green-600 text-white shadow-md' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}" data-filter="my">
                    👑 Criadas por mim
                </button>
                <button class="filter-btn px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeFilter === 'shared' ? 'bg-green-600 text-white shadow-md' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}" data-filter="shared">
                    🤝 Compartilhadas
                </button>
                <button class="filter-btn px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeFilter === 'periodo' ? 'bg-green-600 text-white shadow-md' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}" data-filter="periodo">
                    📅 Período
                </button>
            </div>
            ${dateFiltersHTML}
        `;
        
        // Adicionar eventos aos botões
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const filter = btn.dataset.filter;
                onFilterChange(filter);
            });
        });
        
        // Adicionar evento ao botão de aplicar filtro de período
        const btnAplicar = document.getElementById('aplicar-filtro-periodo');
        if (btnAplicar) {
            btnAplicar.addEventListener('click', () => {
                if (app && typeof app.loadPautasWithFilter === 'function') {
                    app.loadPautasWithFilter();
                }
            });
        }
    },

    toggleAuthTabs(tab) {
        const loginTab = document.getElementById('login-tab-btn');
        const registerTab = document.getElementById('register-tab-btn');
        const loginForm = document.getElementById('login-form');
        const registerForm = document.getElementById('register-form');

        if (tab === 'login') {
            loginTab.classList.add('border-green-600', 'text-green-600');
            loginTab.classList.remove('text-gray-500');
            registerTab.classList.remove('border-green-600', 'text-green-600');
            registerTab.classList.add('text-gray-500');
            loginForm.classList.remove('hidden');
            registerForm.classList.add('hidden');
        } else {
            registerTab.classList.add('border-green-600', 'text-green-600');
            registerTab.classList.remove('text-gray-500');
            loginTab.classList.remove('border-green-600', 'text-green-600');
            loginTab.classList.add('text-gray-500');
            registerForm.classList.remove('hidden');
            loginForm.classList.add('hidden');
        }
    },

    switchTab(tabName, app) {
        const tabAgendamento = document.getElementById('tab-agendamento');
        const tabAvulso = document.getElementById('tab-avulso');
        const isScheduledContainer = document.getElementById('is-scheduled-container');
        const formTitle = document.getElementById('form-title');
        const pautaColumn = document.getElementById('pauta-column');
        const emAtendimentoColumn = document.getElementById('em-atendimento-column');
        const formContainer = document.getElementById('form-agendamento');

        formContainer.classList.remove('hidden');

        if (tabName === 'agendamento') {
            tabAgendamento.classList.add('tab-active');
            tabAvulso.classList.remove('tab-active', 'text-gray-500', 'hover:text-gray-700');
            isScheduledContainer.classList.remove('hidden');
            pautaColumn.classList.remove('hidden');
            if (app.currentPautaData?.useDelegationFlow) {
                emAtendimentoColumn.classList.remove('hidden');
            } else {
                emAtendimentoColumn.classList.add('hidden');
            }
            formTitle.textContent = "Adicionar Novo Agendamento";
            this.showAgendamentoForm();
        } else {
            tabAvulso.classList.add('tab-active');
            tabAgendamento.classList.remove('tab-active');
            tabAgendamento.classList.add('text-gray-500', 'hover:text-gray-700');
            isScheduledContainer.classList.add('hidden');
            pautaColumn.classList.add('hidden');
            if (app.currentPautaData?.useDelegationFlow) {
                emAtendimentoColumn.classList.remove('hidden');
            } else {
                emAtendimentoColumn.classList.add('hidden');
            }
            formTitle.textContent = "Adicionar Atendimento Avulso";
            this.showAvulsoForm(app);
        }
        this.renderAssistedLists(app);
    },

    showAgendamentoForm() {
        document.querySelector('input[name="is-scheduled"][value="no"]').checked = true;
        document.querySelector('input[name="has-arrived"][value="no"]').checked = true;
        document.getElementById('scheduled-time-wrapper').classList.add('hidden');
        document.getElementById('arrival-time-wrapper').classList.add('hidden');
        document.getElementById('manual-room-wrapper').classList.add('hidden');
    },

    showAvulsoForm(app) {
        document.querySelector('input[name="has-arrived"][value="yes"]').checked = true;
        document.getElementById('scheduled-time-wrapper').classList.add('hidden');
        document.getElementById('arrival-time-wrapper').classList.remove('hidden');
        document.getElementById('arrival-time').value = new Date().toTimeString().slice(0, 5);

        const manualRoomWrapper = document.getElementById('manual-room-wrapper');
        const manualRoomSelect = document.getElementById('manual-room-select');
        
        if (app.currentPautaData?.type === 'multisala' && app.currentPautaData.rooms) {
            manualRoomWrapper.classList.remove('hidden');
            manualRoomSelect.innerHTML = '';
            app.currentPautaData.rooms.forEach(room => {
                const opt = document.createElement('option');
                opt.value = room;
                opt.textContent = room;
                manualRoomSelect.appendChild(opt);
            });
        } else {
            manualRoomWrapper.classList.add('hidden');
        }
    },

    togglePautaLock(app) {
        const isOwner = app.auth?.currentUser?.uid === app.currentPautaOwnerId;
        const isClosed = app.isPautaClosed;

        const buttonsToDisable = [
            'form-agendamento', 'file-upload', 'add-assisted-btn',
            'download-pdf-btn', 'toggle-faltosos-btn', 'tab-avulso', 'tab-agendamento'
        ];

        buttonsToDisable.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                if (isClosed) {
                    element.classList.add('pointer-events-none', 'opacity-50');
                    element.querySelectorAll('input, button, a, textarea').forEach(el => el.disabled = true);
                } else {
                    element.classList.remove('pointer-events-none', 'opacity-50');
                    element.querySelectorAll('input, button, a, textarea').forEach(el => el.disabled = false);
                }
            }
        });

        const actionPanelButtons = document.querySelectorAll('#actions-panel button');
        actionPanelButtons.forEach(btn => {
            if (btn.id === 'reopen-pauta-btn') {
                btn.disabled = false;
            } else {
                btn.disabled = isClosed;
            }
        });
        
        const actionButtons = document.querySelectorAll('.check-in-btn, .delegate-finalization-btn, .attend-directly-btn, .faltou-btn, .return-to-pauta-btn, .delete-btn, .priority-btn, .edit-assisted-btn, .edit-attendant-btn, .return-to-aguardando-btn, .manage-demands-btn, .toggle-confirmed-atendido, .toggle-confirmed-faltoso');
        actionButtons.forEach(btn => {
            btn.disabled = isClosed;
        });

        if (isClosed) {
            document.getElementById('closed-pauta-alert').classList.remove('hidden');
            document.getElementById('close-pauta-btn').classList.add('hidden');
            document.getElementById('reopen-pauta-btn').classList.remove('hidden');
        } else {
            document.getElementById('closed-pauta-alert').classList.add('hidden');
            document.getElementById('close-pauta-btn').classList.remove('hidden');
            document.getElementById('reopen-pauta-btn').classList.add('hidden');
        }

        if (!isOwner) {
            document.getElementById('close-pauta-btn').classList.add('hidden');
            document.getElementById('reopen-pauta-btn').classList.add('hidden');
        }
    },

    toggleFaltosos() {
        const btn = document.getElementById('toggle-faltosos-btn');
        const pautaColumn = document.getElementById('pauta-column');
        const faltososColumn = document.getElementById('faltosos-column');

        pautaColumn.classList.toggle('hidden');
        faltososColumn.classList.toggle('hidden');

        if (faltososColumn.classList.contains('hidden')) {
            btn.textContent = 'Ver Faltosos';
            btn.classList.remove('bg-blue-600');
            btn.classList.add('bg-purple-600');
        } else {
            btn.textContent = 'Ver Pauta';
            btn.classList.remove('bg-purple-600');
            btn.classList.add('bg-blue-600');
        }
    },

    toggleActionsPanel() {
        const panel = document.getElementById('actions-panel');
        const arrow = document.getElementById('actions-arrow');
        
        panel.classList.toggle('opacity-0');
        panel.classList.toggle('scale-95');
        panel.classList.toggle('pointer-events-none');
        arrow.classList.toggle('rotate-180');
    },

    renderAssistedLists(app) {
        console.log("🎨 renderAssistedLists chamado");
        
        if (!app) {
            console.error("App não definido");
            return;
        }
        
        const allAssisted = app.allAssisted || [];
        const currentPautaData = app.currentPautaData;
        const colaboradores = app.colaboradores || [];

        console.log("allAssisted:", allAssisted.length, "itens");

        if (allAssisted.length === 0) {
            console.log("Nenhum assistido encontrado");
            this.clearContainers();
            
            const pautaList = document.getElementById('pauta-list');
            const aguardandoList = document.getElementById('aguardando-list');
            const atendidosList = document.getElementById('atendidos-list');
            
            if (pautaList) pautaList.innerHTML = '<p class="text-gray-400 text-center p-4 text-xs">Nenhum agendamento</p>';
            if (aguardandoList) aguardandoList.innerHTML = '<p class="text-gray-400 text-center p-4 text-xs">Ninguém aguardando</p>';
            if (atendidosList) atendidosList.innerHTML = '<p class="text-gray-400 text-center p-4 text-xs">Nenhum atendido</p>';
            
            this.updateCounters({
                pauta: 0, aguardando: 0, emAtendimento: 0, atendidos: 0, faltosos: 0, distribuicao: 0
            });
            return;
        }

        allAssisted.forEach(a => {
            if (a.status === 'aguardando' && a.priority !== 'URGENTE') {
                a.priority = PautaService.getPriorityLevel(a);
            }
        });

        const tabAgendamento = document.getElementById('tab-agendamento');
        const currentMode = tabAgendamento?.classList.contains('tab-active') ? 'agendamento' : 'avulso';
        const searchTerms = this.getSearchTerms();

        const lists = {
            pauta: allAssisted.filter(a => a.status === 'pauta' && a.type === 'agendamento' && this.searchFilter(a, searchTerms.pauta)),
            aguardando: allAssisted.filter(a => a.status === 'aguardando' && a.type === currentMode && this.searchFilter(a, searchTerms.aguardando)),
            emAtendimento: allAssisted.filter(a => a.status === 'emAtendimento' && a.type === currentMode && this.searchFilter(a, searchTerms.emAtendimento)),
            atendidos: allAssisted.filter(a => a.status === 'atendido' && a.type === currentMode && this.searchFilter(a, searchTerms.atendidos)),
            faltosos: allAssisted.filter(a => a.status === 'faltoso' && a.type === 'agendamento' && this.searchFilter(a, searchTerms.faltosos)),
            distribuicao: allAssisted.filter(a => a.status === 'aguardandoDistribuicao' && this.searchFilter(a, searchTerms.distribuicao))
        };

        console.log("Listas filtradas:", {
            pauta: lists.pauta.length,
            aguardando: lists.aguardando.length,
            emAtendimento: lists.emAtendimento.length,
            atendidos: lists.atendidos.length,
            faltosos: lists.faltosos.length,
            distribuicao: lists.distribuicao.length
        });

        lists.pauta.sort((a, b) => (a.scheduledTime || '23:59').localeCompare(b.scheduledTime || '23:59'));
        lists.atendidos.sort((a, b) => new Date(b.attendedTime) - new Date(a.attendedTime));
        lists.faltosos.sort((a, b) => (a.scheduledTime || '00:00').localeCompare(b.scheduledTime || '00:00'));
        lists.emAtendimento.sort((a, b) => new Date(b.inAttendanceTime) - new Date(a.inAttendanceTime));
        
        if (currentPautaData?.ordemAtendimento) {
            lists.aguardando = PautaService.sortAguardando(lists.aguardando, currentPautaData.ordemAtendimento);
        }

        this.updateCounters(lists);
        this.clearContainers();

        console.log("Renderizando colunas...");
        this.renderPautaColumn(lists.pauta);
        this.renderAguardandoColumn(lists.aguardando, currentPautaData, colaboradores);
        this.renderEmAtendimentoColumn(lists.emAtendimento, currentPautaData, app.currentPauta?.id, app.currentUserName);
        this.renderAtendidosColumn(lists.atendidos);
        this.renderFaltososColumn(lists.faltosos);
        this.renderDistribuicaoColumn(lists.distribuicao, app.currentPauta?.id, app.currentUserName);

        this.togglePautaLock(app);
        setTimeout(() => PautaService.setupManualSort(app), 100);
        
        console.log("✅ Renderização concluída");
    },

    getSearchTerms() {
        return {
            pauta: normalizeText(document.getElementById('pauta-search')?.value || ''),
            aguardando: normalizeText(document.getElementById('aguardando-search')?.value || ''),
            emAtendimento: normalizeText(document.getElementById('em-atendimento-search')?.value || ''),
            atendidos: normalizeText(document.getElementById('atendidos-search')?.value || ''),
            faltosos: normalizeText(document.getElementById('faltosos-search')?.value || ''),
            distribuicao: normalizeText(document.getElementById('distribuicao-search')?.value || '')
        };
    },

    searchFilter(assisted, term) {
        if (!term) return true;
        
        const arrivalTimeFormatted = assisted.arrivalTime ? 
            new Date(assisted.arrivalTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
        
        const attendantName = (typeof assisted.attendant === 'object' && assisted.attendant !== null) 
                              ? assisted.attendant.name || assisted.attendant.nome || '' 
                              : assisted.attendant || '';

        return normalizeText(assisted.name).includes(term) ||
               (assisted.cpf && normalizeText(assisted.cpf).includes(term)) ||
               normalizeText(assisted.subject).includes(term) ||
               (assisted.scheduledTime && assisted.scheduledTime.includes(term)) ||
               (arrivalTimeFormatted && arrivalTimeFormatted.includes(term)) ||
               (attendantName && normalizeText(attendantName).includes(term)) ||
               (assisted.assignedCollaborator?.name && normalizeText(assisted.assignedCollaborator.name).includes(term));
    },

    updateCounters(lists) {
        const pautaCount = document.getElementById('pauta-count');
        const aguardandoCount = document.getElementById('aguardando-count');
        const emAtendimentoCount = document.getElementById('em-atendimento-count');
        const atendidosCount = document.getElementById('atendidos-count');
        const faltososCount = document.getElementById('faltosos-count');
        const distribuicaoCount = document.getElementById('distribuicao-count');
        
        if (pautaCount) pautaCount.textContent = lists.pauta.length;
        if (aguardandoCount) aguardandoCount.textContent = lists.aguardando.length;
        if (emAtendimentoCount) emAtendimentoCount.textContent = lists.emAtendimento.length;
        if (atendidosCount) atendidosCount.textContent = lists.atendidos.length;
        if (faltososCount) faltososCount.textContent = lists.faltosos.length;
        if (distribuicaoCount) distribuicaoCount.textContent = lists.distribuicao.length;
    },

    clearContainers() {
        const containers = [
            'pauta-list', 'aguardando-list', 'em-atendimento-list', 
            'atendidos-list', 'faltosos-list', 'distribuicao-list'
        ];
        containers.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '';
        });
    },

    renderPautaColumn(items) {
        const container = document.getElementById('pauta-list');
        if (!container) return;

        if (items.length === 0) {
            container.innerHTML = '<p class="text-gray-400 text-center p-4 text-xs">Nenhum agendamento</p>';
            return;
        }

        items.forEach(item => {
            container.appendChild(this.createPautaCard(item));
        });
    },

    createPautaCard(item) {
        const card = document.createElement('div');
        card.className = 'relative bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-3';
        
        card.innerHTML = `
            <button data-id="${item.id}" class="delete-btn absolute top-3 right-3 text-gray-300 hover:text-red-500 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M11 1.5v1h3.5a.5.5 0 0 1 0 1h-.538l-.853 10.66A2 2 0 0 1 11.115 16h-6.23a2 2 0 0 1-1.994-1.84L2.038 3.5H1.5a.5.5 0 0 1 0-1H5v-1A1.5 1.5 0 0 1 6.5 0h3A1.5 1.5 0 0 1 11 1.5Zm-5 0v1h4v-1a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5ZM4.5 5.029l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06Zm3 0l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06Zm3 .5a.5.5 0 0 0-1 0v8.5a.5.5 0 0 0 1 0v-8.5Z"/>
                </svg>
            </button>

            <p class="font-bold text-xl text-gray-800 leading-tight pr-6">${escapeHTML(item.name || '').toUpperCase()}</p>
            
            <div class="mt-2 space-y-0.5 text-sm text-gray-700">
                <p>Assunto: <span class="font-bold uppercase">${escapeHTML(item.subject || 'Não informado')}</span></p>
                <p>Agendado: <span class="font-bold">${item.scheduledTime || '--:--'}</span></p>
            </div>

            <div class="mt-4 space-y-2">
                <div class="grid grid-cols-2 gap-2">
                    <button data-id="${item.id}" class="check-in-btn bg-green-500 hover:bg-green-600 text-white font-bold py-2.5 rounded-lg text-xs transition active:scale-95 shadow-sm">
                        Marcar Chegada
                    </button>
                    <button data-id="${item.id}" class="faltou-btn bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2.5 rounded-lg text-xs transition active:scale-95 shadow-sm">
                        Faltou
                    </button>
                </div>
                <button data-id="${item.id}" class="edit-assisted-btn w-full bg-slate-500 hover:bg-slate-600 text-white font-bold py-2.5 rounded-lg text-xs transition active:scale-95 shadow-sm">
                    Editar Dados
                </button>
            </div>

            ${item.lastActionBy ? `
                <div class="mt-3 pt-2 border-t border-gray-50 flex justify-end">
                    <p class="text-[10px] text-gray-400 italic">Última ação por: <b>${escapeHTML(item.lastActionBy)}</b></p>
                </div>
            ` : ''}
        `;
        return card;
    },

    renderAguardandoColumn(items, currentPautaData, colaboradores) {
        const container = document.getElementById('aguardando-list');
        if (!container) return;

        if (items.length === 0) {
            container.innerHTML = '<p class="text-gray-400 text-center p-4 text-xs">Ninguém aguardando</p>';
            return;
        }

        console.log("Renderizando aguardando:", items.length);
        container.innerHTML = '';

        if (currentPautaData?.type === 'multisala' && currentPautaData.rooms?.length > 0) {
            currentPautaData.rooms.forEach(roomName => {
                const peopleInRoom = items.filter(a => a.room === roomName);
                if (peopleInRoom.length === 0) return;
                
                const roomHeader = document.createElement('div');
                roomHeader.className = "bg-blue-50 text-blue-800 font-black px-3 py-1.5 rounded mt-4 mb-2 text-[10px] uppercase flex justify-between border border-blue-100";
                roomHeader.innerHTML = `<span>🏢 ${escapeHTML(roomName)}</span> <span>${peopleInRoom.length}</span>`;
                container.appendChild(roomHeader);
                
                peopleInRoom.forEach((item, index) => {
                    const card = this.createAguardandoCard(item, currentPautaData, colaboradores, index);
                    if (card) container.appendChild(card);
                });
            });
        } else {
            items.forEach((item, index) => {
                const card = this.createAguardandoCard(item, currentPautaData, colaboradores, index);
                if (card) container.appendChild(card);
            });
        }
    },

    createAguardandoCard(item, currentPautaData, colaboradores, index) {
        try {
            if (!item || !item.id) return null;

            const card = document.createElement('div');
            const priorityClass = PautaService.getPriorityClass(item.priority);
            card.className = `relative bg-white p-4 rounded-lg shadow-sm ${priorityClass} mb-2 group transition-all duration-200`;
            card.setAttribute('data-id', item.id);

            // === INDICADORES DE STATUS DO DOCUMENTO (RESPONSIVO) ===
            let docStatusHtml = '';
            if (item.selectedAction) {
                let statusColor = 'bg-gray-100 text-gray-600';
                let statusText = 'Selecionado';
                let statusIcon = '📋';
                
                if (item.documentState === 'filling') { 
                    statusColor = 'bg-amber-100 text-amber-700 animate-pulse'; 
                    statusText = 'Preenchendo'; 
                    statusIcon = '✏️';
                } else if (item.documentState === 'saved') { 
                    statusColor = 'bg-green-100 text-green-700 font-bold'; 
                    statusText = 'Salvo'; 
                    statusIcon = '✅';
                } else if (item.documentState === 'pdf') { 
                    statusColor = 'bg-purple-100 text-purple-700 font-bold'; 
                    statusText = 'PDF'; 
                    statusIcon = '📄';
                }

                docStatusHtml = `
                    <div class="mt-2 flex flex-col gap-1">
                        <span class="text-[10px] font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 truncate flex items-center gap-1">
                            <span>📂</span> 
                            <span class="hidden xs:inline">${escapeHTML(item.selectedAction)}</span>
                            <span class="xs:hidden">${escapeHTML(item.selectedAction).substring(0, 15)}${item.selectedAction.length > 15 ? '...' : ''}</span>
                        </span>
                        <span class="${statusColor} text-[9px] px-2 py-0.5 rounded-full w-max border border-current opacity-80 flex items-center gap-1">
                            <span>${statusIcon}</span>
                            <span class="hidden xs:inline">${statusText}</span>
                        </span>
                    </div>`;
            }

            // Tratar valores com fallbacks seguros
            const nomeSeguro = item.name || 'Nome não informado';
            const assuntoSeguro = item.subject || 'Assunto não informado';
            const scheduledTimeSeguro = item.scheduledTime || '--:--';
            const priorityReasonSeguro = item.priorityReason || '';

            // Tratar arrivalTime
            let arrivalText = 'Chegada: --:--';
            if (item.arrivalTime) {
                try {
                    const arrivalDate = new Date(item.arrivalTime);
                    if (!isNaN(arrivalDate)) {
                        const horaChegada = arrivalDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                        if (item.type === 'agendamento' && scheduledTimeSeguro !== '--:--') {
                            arrivalText = `Agendado: ${escapeHTML(scheduledTimeSeguro)} | Chegou: ${horaChegada}`;
                        } else {
                            arrivalText = `Chegada: ${horaChegada}`;
                        }
                    }
                } catch (e) {
                    console.warn("Erro ao formatar data:", e);
                }
            }

            const atenderButton = currentPautaData?.useDelegationFlow
                ? `<button data-id="${item.id}" data-name="${escapeHTML(nomeSeguro)}" class="select-collaborator-btn bg-blue-500 text-white font-semibold py-2 rounded-lg hover:bg-blue-600 text-sm w-full">Atender</button>`
                : `<button data-id="${item.id}" data-name="${escapeHTML(nomeSeguro)}" class="attend-directly-from-aguardando-btn bg-blue-500 text-white font-semibold py-2 rounded-lg hover:bg-blue-600 text-sm w-full">Atender</button>`;

            card.innerHTML = `
                <button data-id="${item.id}" class="delete-btn absolute top-2 right-2 text-gray-300 hover:text-red-600 p-1 rounded-full transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M11 1.5v1h3.5a.5.5 0 0 1 0 1h-.538l-.853 10.66A2 2 0 0 1 11.115 16h-6.23a2 2 0 0 1-1.994-1.84L2.038 3.5H1.5a.5.5 0 0 1 0-1H5v-1A1.5 1.5 0 0 1 6.5 0h3A1.5 1.5 0 0 1 11 1.5Zm-5 0v1h4v-1a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5ZM4.5 5.029l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06Zm3 0l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06Zm3 .5a.5.5 0 0 0-1 0v8.5a.5.5 0 0 0 1 0v-8.5Z"/>
                    </svg>
                </button>
                <div class="flex flex-col h-full">
                    ${item.priority === 'URGENTE' ? `<div class="mb-1 text-[10px] font-black text-red-600 uppercase flex items-center gap-1">🚨 ${escapeHTML(priorityReasonSeguro)}</div>` : ''}
                    <p class="font-bold text-lg text-gray-800 leading-tight mb-1">${escapeHTML(nomeSeguro)}</p>
                    <p class="text-xs text-gray-600 mb-2">Assunto: <strong>${escapeHTML(assuntoSeguro)}</strong></p>
                    <div class="flex flex-wrap gap-2 mb-1">
                        <span class="bg-gray-100 text-gray-600 text-[10px] px-2 py-0.5 rounded font-medium">${arrivalText}</span>
                        ${item.room ? `<span class="bg-blue-50 text-blue-700 text-[10px] px-2 py-0.5 rounded font-bold border border-blue-100">${escapeHTML(item.room)}</span>` : ''}
                    </div>
                    ${docStatusHtml}
                    <div class="mt-4 grid grid-cols-2 gap-2">
                        ${atenderButton}
                        <button data-id="${item.id}" class="priority-btn ${item.priority === 'URGENTE' ? 'bg-orange-600' : 'bg-red-500'} text-white font-semibold py-2 rounded-lg text-xs">${item.priority === 'URGENTE' ? 'Urgente' : 'Prioridade'}</button>
                        <button data-id="${item.id}" class="return-to-pauta-btn col-span-2 bg-gray-200 text-gray-700 font-semibold py-1.5 rounded-lg text-[10px] hover:bg-gray-300 transition-colors uppercase">Voltar</button>
                    </div>
                    <button data-id="${item.id}" class="view-details-btn text-indigo-500 hover:text-indigo-700 text-[11px] font-bold mt-2 text-center underline">Ver Detalhes</button>
                </div>`;
            
            return card;
        } catch (error) {
            console.error("Erro ao criar card de aguardando:", error, item);
            return null;
        }
    },

    renderEmAtendimentoColumn(items, currentPautaData, pautaId, userName) {
        const container = document.getElementById('em-atendimento-list');
        if (!container) return;

        if (items.length === 0) {
            container.innerHTML = '<p class="text-gray-400 text-center p-4 text-xs">Ninguém em atendimento</p>';
            return;
        }

        items.forEach((item, index) => {
            const card = this.createEmAtendimentoCard(item, currentPautaData, pautaId, userName, index);
            if (card) container.appendChild(card);
        });
    },

    createEmAtendimentoCard(item, currentPautaData, pautaId, userName, index) {
        try {
            const card = document.createElement('div');
            card.className = `relative bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-3`;
            
            const startTime = item.inAttendanceTime ? 
                new Date(item.inAttendanceTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
            
            const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
            const linkDireto = `${baseUrl}/atendimento_externo.html?pautaId=${pautaId}&assistidoId=${item.id}&collaboratorName=${encodeURIComponent(userName)}`;

            card.innerHTML = `
                <button data-id="${item.id}" class="delete-btn absolute top-2 right-2 text-gray-300 hover:text-red-500">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M11 1.5v1h3.5a.5.5 0 0 1 0 1h-.538l-.853 10.66A2 2 0 0 1 11.115 16h-6.23a2 2 0 0 1-1.994-1.84L2.038 3.5H1.5a.5.5 0 0 1 0-1H5v-1A1.5 1.5 0 0 1 6.5 0h3A1.5 1.5 0 0 1 11 1.5Zm-5 0v1h4v-1a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5ZM4.5 5.029l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06Zm3 0l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06Zm3 .5a.5.5 0 0 0-1 0v8.5a.5.5 0 0 0 1 0v-8.5Z"/>
                    </svg>
                </button>

                <p class="font-bold text-xl md:text-2xl text-gray-800">${index + 1}. ${escapeHTML(item.name || '')}</p>
                <p class="text-xs md:text-sm mt-1">Assunto: <strong>${escapeHTML(item.subject || 'Não informado')}</strong></p>
                <p class="text-xs md:text-sm">Colaborador: ${escapeHTML(item.assignedCollaborator?.name || 'Não atribuído')}</p>
                <p class="text-xs md:text-sm text-gray-400">Início: ${startTime}</p>

                <div class="mt-4 flex flex-col gap-2">
                    <div class="grid grid-cols-2 gap-2">
                        <button data-id="${item.id}" data-name="${escapeHTML(item.name || '')}" data-collaborator-name="${escapeHTML(item.assignedCollaborator?.name || 'Não informado')}" class="delegate-finalization-btn bg-indigo-500 text-white font-bold py-2 md:py-3 rounded-lg md:rounded-xl text-xs md:text-sm shadow-md transition active:scale-95">
                            Delegar
                        </button>
                        <button onclick="window.open('${linkDireto}', '_blank')" class="bg-green-500 text-white font-bold py-2 md:py-3 rounded-lg md:rounded-xl text-xs md:text-sm shadow-md transition active:scale-95">
                            Finalizar
                        </button>
                    </div>
                    <button data-id="${item.id}" class="return-to-aguardando-from-emAtendimento-btn bg-slate-400 text-white font-bold py-2 rounded-lg text-xs md:text-sm shadow-md transition active:scale-95">
                        Voltar p/ Aguardando
                    </button>
                </div>

                ${item.lastActionBy ? `<p class="text-[8px] md:text-[10px] text-gray-400 mt-4 text-right uppercase">Última ação: <b>${escapeHTML(item.lastActionBy)}</b></p>` : ''}
            `;
            return card;
        } catch (error) {
            console.error("Erro ao criar card de em atendimento:", error, item);
            return null;
        }
    },

    renderAtendidosColumn(items) {
        const container = document.getElementById('atendidos-list');
        if (!container) return;

        if (items.length === 0) {
            container.innerHTML = '<p class="text-gray-400 text-center p-4 text-xs">Nenhum atendido</p>';
            return;
        }

        container.innerHTML = '';
        items.forEach(item => {
            if (!item) return;
            const card = this.createAtendidoCard(item);
            if (card) container.appendChild(card);
        });
    },

    createAtendidoCard(item) {
        try {
            const card = document.createElement('div');
            card.className = 'relative bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-4';
            
            const arrivalT = item.arrivalTime ? 
                new Date(item.arrivalTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'N/A';
            const attendedT = item.attendedTime ? 
                new Date(item.attendedTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
            
            let atendenteNome = 'Não informado';
            if (item.attendant) {
                if (typeof item.attendant === 'object') {
                    atendenteNome = item.attendant.nome || item.attendant.name || 'Não informado';
                } else {
                    atendenteNome = item.attendant;
                }
            }

            // Indicador de confirmação (responsivo)
            const confirmButton = item.isConfirmed 
                ? 'bg-green-500 border-green-500 text-white' 
                : 'bg-slate-100 text-slate-300';

            card.innerHTML = `
                <div class="flex justify-between items-start">
                    <p class="font-bold text-lg md:text-xl text-gray-800">${escapeHTML(item.name || '')}</p>
                    <button data-id="${item.id}" class="toggle-confirmed-atendido w-6 h-6 md:w-7 md:h-7 rounded-full border border-gray-200 flex items-center justify-center ${confirmButton} shadow-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M12.736 3.97a.733.733 0 0 1 1.047 0c.286.289.29.756.01.105L7.882 12.5a.733.733 0 0 1-1.065.04L3.257 8.375a.733.733 0 0 1 1.064-.04l2.254 2.255Z"/>
                        </svg>
                    </button>
                </div>
                
                <p class="text-xs md:text-sm mt-1 text-gray-700">Assunto: <b>${escapeHTML(item.subject || 'Não informado')}</b></p>
                
                <div class="grid grid-cols-3 gap-1 md:gap-2 text-center border-t border-b py-2 md:py-3 my-2 md:my-3 text-[8px] md:text-[10px] text-gray-400 uppercase font-bold tracking-wider">
                    <div>Agendado:<br><span class="text-gray-600">${item.scheduledTime || 'N/A'}</span></div>
                    <div>Chegou:<br><span class="text-gray-600">${arrivalT}</span></div>
                    <div>Finalizado:<br><span class="text-gray-600">${attendedT}</span></div>
                </div>

                <div class="flex justify-between items-center text-[10px] md:text-xs mb-4">
                    <p class="text-gray-500">Por: <b class="text-gray-800">${escapeHTML(atendenteNome)}</b></p>
                    <div class="grid grid-cols-2 gap-x-2 md:gap-x-4 gap-y-1 md:gap-y-2 text-right">
                        <button data-id="${item.id}" class="manage-demands-btn text-blue-500 font-bold hover:underline">Demandas</button>
                        <button data-id="${item.id}" class="edit-assisted-btn text-slate-400 font-bold hover:underline">Dados</button>
                        <button data-id="${item.id}" class="edit-attendant-btn text-green-600 font-bold hover:underline">Atendente</button>
                        <button data-id="${item.id}" class="delete-btn text-red-500 font-bold hover:underline">Deletar</button>
                    </div>
                </div>

                ${item.arquivoPdfConteudo ? `
                    <a href="${item.arquivoPdfConteudo}" download="${item.nomeArquivoPdf || 'protocolo.pdf'}" 
                       class="mb-4 flex items-center justify-center gap-2 w-full bg-blue-50 text-blue-600 font-bold py-2 rounded-lg md:py-2.5 md:rounded-xl text-[8px] md:text-[10px] uppercase border border-blue-100 hover:bg-blue-100 transition">
                       📄 Baixar Protocolo
                    </a>
                ` : ''}

                <div class="pt-3 border-t">
                    <div class="flex flex-col sm:flex-row justify-between items-center gap-2 md:gap-3">
                        <p class="text-[7px] md:text-[9px] text-gray-400 uppercase italic">Última: ${escapeHTML(item.lastActionBy || 'Sistema')}</p>
                        <button data-id="${item.id}" class="return-from-atendido-btn w-full sm:w-auto bg-orange-500 text-white font-black py-2 md:py-3 px-4 md:px-8 rounded-lg md:rounded-xl text-[8px] md:text-[10px] uppercase shadow-md active:scale-95 transition-all">
                            Voltar
                        </button>
                    </div>
                </div>
            `;
            return card;
        } catch (error) {
            console.error("Erro ao criar card de atendido:", error, item);
            return null;
        }
    },

    renderFaltososColumn(items) {
        const container = document.getElementById('faltosos-list');
        if (!container) return;

        if (items.length === 0) {
            container.innerHTML = '<p class="text-gray-400 text-center p-4 text-xs">Nenhum faltoso</p>';
            return;
        }

        items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'relative bg-red-50 p-4 rounded-lg shadow-sm border border-red-100 mb-2 opacity-80';
            card.innerHTML = `
                <p class="font-bold text-gray-700 text-sm">${escapeHTML(item.name || '')}</p>
                <p class="text-[9px] text-red-400 uppercase font-bold">Faltoso</p>
                <button data-id="${item.id}" class="return-to-pauta-from-faltoso-btn mt-2 w-full bg-white text-red-500 border border-red-200 py-1 rounded text-[9px] font-bold uppercase hover:bg-red-50 transition">Voltar p/ Pauta</button>
            `;
            container.appendChild(card);
        });
    },

    renderDistribuicaoColumn(items, pautaId, userName) {
        const container = document.getElementById('distribuicao-list');
        if (!container) return;

        if (items.length === 0) {
            container.innerHTML = '<p class="text-gray-400 text-center p-4 text-xs">Nenhum aguardando distribuição</p>';
            return;
        }

        items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'relative bg-cyan-50 p-4 rounded-lg shadow-sm border border-cyan-200 mb-2';
            const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
            const linkExterno = `${baseUrl}/atendimento_externo.html?pautaId=${pautaId}&assistidoId=${item.id}&collaboratorName=${encodeURIComponent(userName)}`;

            card.innerHTML = `
                <p class="font-bold text-gray-800 text-sm">${escapeHTML(item.name || '')}</p>
                <p class="text-[10px] text-cyan-700 font-bold uppercase mt-1">⚖️ Aguardando Distribuição</p>
                <div class="mt-3 space-y-2">
                    <button onclick="window.open('${linkExterno}', '_blank')" class="w-full bg-cyan-600 text-white text-[10px] font-bold py-2 rounded hover:bg-cyan-700 uppercase shadow-sm">Painel de Protocolo</button>
                    <button data-id="${item.id}" class="return-to-aguardando-from-dist-btn w-full bg-white text-gray-400 border border-gray-200 text-[9px] py-1 rounded uppercase">Reverter</button>
                </div>
            `;
            container.appendChild(card);
        });
    },

    setupFooterModals() {
        const bindModal = (btnId, modalId, closeIds) => {
            const btn = document.getElementById(btnId);
            const modal = document.getElementById(modalId);
            
            if (btn && modal) {
                btn.onclick = () => modal.classList.remove('hidden');
                
                closeIds.forEach(id => {
                    const closeBtn = document.getElementById(id);
                    if (closeBtn) closeBtn.onclick = () => modal.classList.add('hidden');
                });

                modal.onclick = (e) => {
                    if (e.target === modal) modal.classList.add('hidden');
                };
            }
        };

        bindModal('privacy-btn-footer', 'privacy-policy-modal', ['close-policy-modal-btn-x', 'close-policy-modal-btn']);
        bindModal('manual-btn-footer', 'manual-modal', ['close-manual-modal-x', 'close-manual-modal-btn']);
        bindModal('terms-btn-footer', 'terms-modal', ['close-terms-modal-x', 'close-terms-modal-btn']);
    }
};
