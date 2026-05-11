// js/ui.js - VERSÃO COMPLETA E ATUALIZADA
import { escapeHTML, normalizeText, showNotification } from './utils.js';
import { PautaService } from './pauta.js';

export const UIService = {
    showScreen(screenName) {
        document.getElementById('loading-container').classList.toggle('hidden', screenName !== 'loading');
        document.getElementById('login-container').classList.toggle('hidden', screenName !== 'login');
        document.getElementById('pauta-selection-container').classList.toggle('hidden', screenName !== 'pautaSelection');
        document.getElementById('app-container').classList.toggle('hidden', screenName !== 'app');
        document.getElementById('dashboard-container').classList.toggle('hidden', screenName !== 'dashboard');
    },

    /**
     * Motor Unificado para capturar o nome do Atendente correto.
     * Resolve o problema de atualizações não refletirem na tela.
     */
    getAttendantName(item) {
        if (!item) return 'Não informado';
        
        // 1º Prioridade: attendedBy (Quem de fato atendeu na finalização)
        if (item.attendedBy) {
            const name = typeof item.attendedBy === 'object' ? (item.attendedBy.nome || item.attendedBy.name) : item.attendedBy;
            if (name) return String(name).trim();
        }

        // 2º Prioridade: assignedCollaborator (Quem foi delegado/editado)
        if (item.assignedCollaborator && item.assignedCollaborator.name) {
            return String(item.assignedCollaborator.name).trim();
        }
        
        // 3º Prioridade: attendant (Campo legado)
        if (item.attendant) {
            const name = typeof item.attendant === 'object' ? (item.attendant.nome || item.attendant.name) : item.attendant;
            if (name) return String(name).trim();
        }
        
        return 'Não informado';
    },

    renderPautaFilters(containerId, activeFilter, onFilterChange, app) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.error(`Container ${containerId} não encontrado`);
            return;
        }
        
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
        
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const filter = btn.dataset.filter;
                onFilterChange(filter);
            });
        });
        
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
            if(formTitle) formTitle.textContent = "Adicionar Novo Agendamento";
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
            if(formTitle) formTitle.textContent = "Adicionar Atendimento Avulso";
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
        
        const cardActionButtons = document.querySelectorAll('.assisted-card button:not(.quick-action-toggle)');
        cardActionButtons.forEach(btn => {
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

        if (allAssisted.length === 0) {
            console.log("Nenhum assistido encontrado");
            this.clearContainers();
            
            const pautaList = document.getElementById('pauta-list');
            const aguardandoList = document.getElementById('aguardando-list');
            const atendidosList = document.getElementById('atendidos-list');
            const emAtendimentoList = document.getElementById('em-atendimento-list');
            const faltososList = document.getElementById('faltosos-list'); 
            const distribuicaoList = document.getElementById('distribuicao-list'); 
            
            if (pautaList) pautaList.innerHTML = '<p class="text-gray-400 text-center p-4 text-xs">Nenhum agendamento</p>';
            if (aguardandoList) aguardandoList.innerHTML = '<p class="text-gray-400 text-center p-4 text-xs">Ninguém aguardando</p>';
            if (emAtendimentoList) emAtendimentoList.innerHTML = '<p class="text-gray-400 text-center p-4 text-xs">Ninguém em atendimento</p>';
            if (atendidosList) atendidosList.innerHTML = '<p class="text-gray-400 text-center p-4 text-xs">Nenhum atendido</p>';
            if (faltososList) faltososList.innerHTML = '<p class="text-gray-400 text-center p-4 text-xs">Nenhum faltoso</p>';
            if (distribuicaoList) distribuicaoList.innerHTML = '<p class="text-gray-400 text-center p-4 text-xs">Nenhum aguardando distribuição</p>';
            
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

        lists.pauta.sort((a, b) => (a.scheduledTime || '23:59').localeCompare(b.scheduledTime || '23:59'));
        lists.atendidos.sort((a, b) => new Date(b.attendedTime) - new Date(a.attendedTime)); 
        lists.faltosos.sort((a, b) => (a.scheduledTime || '00:00').localeCompare(b.scheduledTime || '00:00')); 
        lists.emAtendimento.sort((a, b) => new Date(b.inAttendanceTime) - new Date(a.inAttendanceTime)); 
        
        if (currentPautaData?.ordemAtendimento) {
            lists.aguardando = PautaService.sortAguardando(lists.aguardando, currentPautaData.ordemAtendimento);
        }

        this.updateCounters(lists);
        this.clearContainers();

        this.renderPautaColumn(lists.pauta);
        this.renderAguardandoColumn(lists.aguardando, currentPautaData, colaboradores);
        this.renderEmAtendimentoColumn(lists.emAtendimento, currentPautaData, app.currentPauta?.id, app.currentUserName);
        this.renderAtendidosColumn(lists.atendidos);
        this.renderFaltososColumn(lists.faltosos); 
        this.renderDistribuicaoColumn(lists.distribuicao, app.currentPauta?.id, app.currentUserName);

        this.togglePautaLock(app);
        setTimeout(() => PautaService.setupManualSort(app), 100); 
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

    // OMNI-SEARCH - Pesquisa Horário, Demandas, Salas e Atendentes dinamicamente!
    searchFilter(assisted, term) {
        if (!term) return true;
        
        const termLower = normalizeText(term);

        const arrivalTimeFormatted = assisted.arrivalTime ? 
            new Date(assisted.arrivalTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
        
        const attendedTimeFormatted = assisted.attendedTime ? 
            new Date(assisted.attendedTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';

        const inAttendanceTimeFormatted = assisted.inAttendanceTime ? 
            new Date(assisted.inAttendanceTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';

        // Pega o nome do atendente pelo motor unificado
        const attendantName = this.getAttendantName(assisted);

        const demandsText = assisted.demandas?.descricoes ? assisted.demandas.descricoes.join(' ') : '';
        
        const searchableString = normalizeText(`
            ${assisted.name || ''} 
            ${assisted.cpf || ''} 
            ${assisted.subject || ''} 
            ${assisted.scheduledTime || ''} 
            ${arrivalTimeFormatted} 
            ${attendedTimeFormatted}
            ${inAttendanceTimeFormatted}
            ${attendantName} 
            ${demandsText}
            ${assisted.room || ''}
            ${assisted.status || ''}
        `);

        return searchableString.includes(termLower);
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

    _getStandardizedFooterHtml(item) {
        const lastActionBy = escapeHTML(item.lastActionBy || 'Sistema');
        const lastActionDate = item.lastActionTimestamp ?
            new Date(item.lastActionTimestamp).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) :
            '--/-- --:--';
        return `
            <div class="mt-3 pt-2 border-t border-gray-100 flex justify-end">
                <p class="text-[10px] text-gray-400 italic">Última ação por: <b>${lastActionBy}</b> às ${lastActionDate}</p>
            </div>
        `;
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
        const currentUserRole = window.app?.currentUser?.role;
        const canDelete = currentUserRole === 'admin' || currentUserRole === 'superadmin';
        const canEdit = currentUserRole !== 'apoio'; 
        const isOwner = window.app?.auth?.currentUser?.uid === item.owner;

        const card = document.createElement('div');
        card.className = 'assisted-card relative bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-3';
        card.setAttribute('data-id', item.id);
        
        card.innerHTML = `
            ${canDelete ? `
            <button data-id="${item.id}" class="delete-btn absolute top-3 right-3 text-gray-300 hover:text-red-500 transition-colors" ${isOwner ? '' : 'disabled'} title="Excluir (apenas criador)">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M11 1.5v1h3.5a.5.5 0 0 1 0 1h-.538l-.853 10.66A2 2 0 0 1 11.115 16h-6.23a2 2 0 0 1-1.994-1.84L2.038 3.5H1.5a.5.5 0 0 1 0-1H5v-1A1.5 1.5 0 0 1 6.5 0h3A1.5 1.5 0 0 1 11 1.5Zm-5 0v1h4v-1a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5ZM4.5 5.029l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06Zm3 0l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06Zm3 .5a.5.5 0 0 0-1 0v8.5a.5.5 0 0 0 1 0v-8.5Z"/>
                </svg>
            </button>` : ''}

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
                    <button data-id="${item.id}" class="faltou-btn bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2.5 rounded-lg text-xs transition active:scale-95 shadow-sm" ${canEdit ? '' : 'disabled'}>
                        Faltou
                    </button>
                </div>
                <button data-id="${item.id}" class="edit-assisted-btn w-full bg-slate-500 hover:bg-slate-600 text-white font-bold py-2.5 rounded-lg text-xs transition active:scale-95 shadow-sm" ${canEdit ? '' : 'disabled'}>
                    Editar Dados
                </button>
            </div>

            ${this._getStandardizedFooterHtml(item)}
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

        container.innerHTML = '';

        if (currentPautaData?.type === 'multisala' && currentPautaData.rooms?.length > 0) {
            currentPautaData.rooms.forEach(roomName => {
                const peopleInRoom = items.filter(a => a.room === roomName);
                if (peopleInRoom.length === 0) return;
                
                const roomGroup = document.createElement('div');
                roomGroup.className = "mb-4 border border-gray-200 rounded-lg overflow-hidden bg-gray-50 room-group-container shadow-sm";
                
                roomGroup.innerHTML = `
                    <div class="bg-blue-100 p-2 border-b border-blue-200 flex flex-col gap-2">
                        <div class="flex justify-between items-center px-1">
                            <h4 class="font-bold text-blue-800 text-xs uppercase tracking-wider flex items-center gap-1">
                                <span>🏢</span> ${escapeHTML(roomName)}
                            </h4>
                            <span class="bg-blue-200 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded-full">${peopleInRoom.length}</span>
                        </div>
                        <input type="search" placeholder="Pesquisar nesta sala..." class="room-search-input w-full p-1.5 text-xs border border-blue-200 rounded outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                    </div>
                    <div class="p-2 space-y-2 room-cards-wrapper"></div>
                `;
                
                const cardsWrapper = roomGroup.querySelector('.room-cards-wrapper');
                
                peopleInRoom.forEach((item, index) => {
                    const card = this.createAguardandoCard(item, currentPautaData, colaboradores, index);
                    if (card) cardsWrapper.appendChild(card);
                });
                
                container.appendChild(roomGroup);
            });

            const peopleNoRoom = items.filter(a => !a.room || !currentPautaData.rooms.includes(a.room));
            if (peopleNoRoom.length > 0) {
                const roomGroupNoRoom = document.createElement('div');
                roomGroupNoRoom.className = "mb-4 border border-red-200 rounded-lg overflow-hidden bg-red-50 room-group-container shadow-sm";
                
                roomGroupNoRoom.innerHTML = `
                    <div class="bg-red-100 p-2 border-b border-red-200 flex flex-col gap-2">
                        <div class="flex justify-between items-center px-1">
                            <h4 class="font-bold text-red-800 text-xs uppercase tracking-wider flex items-center gap-1">
                                <span>⚠️</span> Sem Sala Definida
                            </h4>
                            <span class="bg-red-200 text-red-800 text-[10px] font-bold px-2 py-0.5 rounded-full">${peopleNoRoom.length}</span>
                        </div>
                        <input type="search" placeholder="Pesquisar sem sala..." class="room-search-input w-full p-1.5 text-xs border border-red-200 rounded outline-none focus:ring-2 focus:ring-red-500 bg-white">
                    </div>
                    <div class="p-2 space-y-2 room-cards-wrapper"></div>
                `;
                
                const cardsWrapperNoRoom = roomGroupNoRoom.querySelector('.room-cards-wrapper');
                peopleNoRoom.forEach((item, index) => {
                    const card = this.createAguardandoCard(item, currentPautaData, colaboradores, index);
                    if (card) cardsWrapperNoRoom.appendChild(card);
                });
                container.appendChild(roomGroupNoRoom);
            }

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

            const currentUserRole = window.app?.currentUser?.role;
            const canEditPriority = currentUserRole === 'apoio' || currentUserRole === 'user' || currentUserRole === 'admin' || currentUserRole === 'superadmin';
            const canAttend = currentUserRole !== 'apoio';
            const canDelete = currentUserRole === 'admin' || currentUserRole === 'superadmin';

            const card = document.createElement('div');
            const priorityClass = PautaService.getPriorityClass(item.priority);
            card.className = `assisted-card relative bg-white p-4 rounded-lg shadow-sm ${priorityClass} mb-2 group transition-all duration-200`;
            card.setAttribute('data-id', item.id);

            let docStatusHtml = '';
            if (item.selectedAction) {
                let statusColor = 'bg-gray-100 text-gray-600';
                let statusText = '📋 Selecionado';
                let statusIcon = '📋';
                
                if (item.documentState === 'filling') { 
                    statusColor = 'bg-amber-100 text-amber-700 animate-pulse'; 
                    statusText = '✏️ Preenchendo'; 
                    statusIcon = '✏️';
                } else if (item.documentState === 'saved') { 
                    statusColor = 'bg-green-100 text-green-700 font-bold'; 
                    statusText = '✅ Salvo'; 
                    statusIcon = '✅';
                } else if (item.documentState === 'pdf') { 
                    statusColor = 'bg-purple-100 text-purple-700 font-bold'; 
                    statusText = '📄 PDF Emitido'; 
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

            const nomeSeguro = item.name || 'Nome não informado';
            const assuntoSeguro = item.subject || 'Assunto não informado';
            const scheduledTimeSeguro = item.scheduledTime || '--:--';
            const priorityReasonSeguro = item.priorityReason || '';

            let timeInfoHtml = `<span class="bg-gray-100 text-gray-600 text-[10px] px-2 py-0.5 rounded font-medium">Chegada: --:--</span>`;
            if (item.arrivalTime) {
                try {
                    const arrivalDate = new Date(item.arrivalTime);
                    if (!isNaN(arrivalDate)) {
                        const horaChegada = arrivalDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                        if (item.type === 'agendamento' && scheduledTimeSeguro !== '--:--') {
                            timeInfoHtml = `
                                <div class="inline-flex items-center gap-2 bg-blue-50/80 border border-blue-100 text-blue-800 px-2 py-1 rounded text-[11px] shadow-sm w-max">
                                    <div class="flex items-center gap-1">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-600"><path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h5"/><path d="M17.5 17.5 16 16.3V14"/><circle cx="16" cy="16" r="6"/></svg>
                                        <span>Agendado: <span class="font-semibold">${escapeHTML(scheduledTimeSeguro)}</span></span>
                                    </div>
                                    <div class="w-px h-3 bg-blue-200"></div>
                                    <div class="flex items-center gap-1">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-600"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>
                                        <span>Chegou: <span class="font-bold">${horaChegada}</span></span>
                                    </div>
                                </div>
                            `;
                        } else {
                            timeInfoHtml = `
                                <div class="inline-flex items-center gap-1.5 bg-blue-50/80 border border-blue-100 text-blue-800 px-2.5 py-1 rounded text-[11px] shadow-sm w-max">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-600"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>
                                    <span>Chegada: <span class="font-bold">${horaChegada}</span></span>
                                </div>
                            `;
                        }
                    }
                } catch (e) {
                    console.warn("Erro ao formatar data:", e);
                }
            }

            const numeroOrdem = index + 1;
            const numeroBadge = `
                <div class="absolute -left-2 -top-2 w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-bold text-sm shadow-lg border-2 border-white z-20">
                    ${numeroOrdem}
                </div>
            `;

            const atenderButton = currentPautaData?.useDelegationFlow
                ? `<button data-id="${item.id}" data-name="${escapeHTML(nomeSeguro)}" class="select-collaborator-btn bg-blue-500 text-white font-semibold py-2 rounded-lg hover:bg-blue-600 text-sm w-full">Atender</button>`
                : `<button data-id="${item.id}" data-name="${escapeHTML(nomeSeguro)}" class="attend-directly-from-aguardando-btn bg-blue-500 text-white font-semibold py-2 rounded-lg hover:bg-blue-600 text-sm w-full">Atender</button>`;

            const actionButtonsHTML = `
                <div class="absolute top-2 right-10 flex items-center">
                    <div class="relative">
                        <button data-id="${item.id}" class="quick-action-toggle text-gray-400 hover:text-blue-600 p-1 rounded-full transition-colors" title="Opções de atendimento" aria-expanded="false" aria-controls="quick-menu-${item.id}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
                                <path d="M3 9.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>
                            </svg>
                        </button>
                        <div id="quick-menu-${item.id}" class="quick-menu hidden absolute right-0 mt-1 w-40 bg-white rounded-lg shadow-xl border border-gray-200 z-30 py-1" role="menu" aria-orientation="vertical" aria-labelledby="quick-toggle-${item.id}">
                            <button data-id="${item.id}" data-tipo="reagendar" class="quick-action-item w-full text-left px-3 py-2 text-xs hover:bg-amber-50 hover:text-amber-700 flex items-center gap-2" role="menuitem">
                                <span>🔄</span> Reagendar
                            </button>
                            <button data-id="${item.id}" data-tipo="agendar" class="quick-action-item w-full text-left px-3 py-2 text-xs hover:bg-emerald-50 hover:text-emerald-700 flex items-center gap-2" role="menuitem">
                                <span>📅</span> Agendar
                            </button>
                            <button data-id="${item.id}" data-tipo="consulta" class="quick-action-item w-full text-left px-3 py-2 text-xs hover:bg-purple-50 hover:text-purple-700 flex items-center gap-2" role="menuitem">
                                <span>🔍</span> Consulta
                            </button>
                            <button data-id="${item.id}" data-tipo="outros" class="quick-action-item w-full text-left px-3 py-2 text-xs hover:bg-gray-50 hover:text-gray-700 flex items-center gap-2" role="menuitem">
                                <span>⚙️</span> Outros
                            </button>
                            <button data-id="${item.id}" class="edit-assisted-btn quick-action-item w-full text-left px-3 py-2 text-xs hover:bg-gray-50 hover:text-gray-700 flex items-center gap-2" role="menuitem">
                                <span>✏️</span> Editar Assistido
                            </button>
                            <button data-id="${item.id}" class="view-details-btn quick-action-item w-full text-left px-3 py-2 text-xs hover:bg-gray-50 hover:text-gray-700 flex items-center gap-2" role="menuitem">
                                <span>👁️</span> Ver Detalhes
                            </button>
                        </div>
                    </div>
                </div>
            `;

            card.innerHTML = `
                ${numeroBadge}
                ${canAttend ? actionButtonsHTML : ''} 
                ${canDelete ? `
                <button data-id="${item.id}" class="delete-btn absolute top-2 right-2 text-gray-300 hover:text-red-600 p-1 rounded-full transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M11 1.5v1h3.5a.5.5 0 0 1 0 1h-.538l-.853 10.66A2 2 0 0 1 11.115 16h-6.23a2 2 0 0 1-1.994-1.84L2.038 3.5H1.5a.5.5 0 0 1 0-1H5v-1A1.5 1.5 0 0 1 6.5 0h3A1.5 1.5 0 0 1 11 1.5Zm-5 0v1h4v-1a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5ZM4.5 5.029l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06Zm3 0l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06Zm3 .5a.5.5 0 0 0-1 0v8.5a.5.5 0 0 0 1 0v-8.5Z"/>
                    </svg>
                </button>` : ''}
                <div class="flex flex-col h-full">
                    ${item.priority === 'URGENTE' ? `<div class="mb-1 text-[10px] font-black text-red-600 uppercase flex items-center gap-1">🚨 ${escapeHTML(priorityReasonSeguro)}</div>` : ''}
                    <p class="font-bold text-lg text-gray-800 leading-tight mb-1">${escapeHTML(nomeSeguro)}</p>
                    <p class="text-xs text-gray-600 mb-2">Assunto: <strong>${escapeHTML(assuntoSeguro)}</strong></p>
                    <div class="flex flex-wrap items-center gap-2 mb-2">
                        ${timeInfoHtml}
                        ${item.room && currentPautaData?.type === 'multisala' ? `<span class="bg-blue-50 text-blue-700 text-[10px] px-2 py-0.5 rounded font-bold border border-blue-100">${escapeHTML(item.room)}</span>` : ''}
                    </div>
                    ${docStatusHtml}
                    <div class="mt-4 grid grid-cols-2 gap-2">
                        ${canAttend ? atenderButton : '<button disabled class="w-full bg-gray-300 text-gray-700 font-semibold py-2 rounded-lg text-sm">Sem Permissão</button>'}
                        <button data-id="${item.id}" class="priority-btn ${item.priority === 'URGENTE' ? 'bg-orange-600' : 'bg-red-500'} text-white font-semibold py-2 rounded-lg text-xs" ${canEditPriority ? '' : 'disabled'}>${item.priority === 'URGENTE' ? 'Urgência' : 'Prioridade'}</button>
                        <button data-id="${item.id}" class="return-to-pauta-btn col-span-2 bg-gray-200 text-gray-700 font-semibold py-1.5 rounded-lg text-[10px] hover:bg-gray-300 transition-colors uppercase" ${canAttend ? '' : 'disabled'}>Voltar</button>
                    </div>
                    <button data-id="${item.id}" class="view-details-btn text-indigo-500 hover:text-indigo-700 text-[11px] font-bold mt-2 text-center underline">Ver Detalhes</button>
                </div>
                ${this._getStandardizedFooterHtml(item)}
            `;
            
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
            const currentUserRole = window.app?.currentUser?.role;
            const canDelegateOrFinalize = currentUserRole !== 'apoio';
            const canDelete = currentUserRole === 'admin' || currentUserRole === 'superadmin';

            const card = document.createElement('div');
            card.className = `assisted-card relative bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-3`;
            card.setAttribute('data-id', item.id);
            
            const startTime = item.inAttendanceTime ? 
                new Date(item.inAttendanceTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
            
            const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
            const linkDireto = `${baseUrl}/atendimento_externo.html?pautaId=${pautaId}&assistidoId=${item.id}&collaboratorName=${encodeURIComponent(userName)}`;

            const atendenteNome = this.getAttendantName(item);

            card.innerHTML = `
                ${canDelete ? `
                <button data-id="${item.id}" class="delete-btn absolute top-2 right-2 text-gray-300 hover:text-red-500">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M11 1.5v1h3.5a.5.5 0 0 1 0 1h-.538l-.853 10.66A2 2 0 0 1 11.115 16h-6.23a2 2 0 0 1-1.994-1.84L2.038 3.5H1.5a.5.5 0 0 1 0-1H5v-1A1.5 1.5 0 0 1 6.5 0h3A1.5 1.5 0 0 1 11 1.5Zm-5 0v1h4v-1a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5ZM4.5 5.029l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06Zm3 0l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06Zm3 .5a.5.5 0 0 0-1 0v8.5a.5.5 0 0 0 1 0v-8.5Z"/>
                    </svg>
                </button>` : ''}

                <p class="font-bold text-xl md:text-2xl text-gray-800">${index + 1}. ${escapeHTML(item.name || '')}</p>
                <p class="text-xs md:text-sm mt-1">Assunto: <strong>${escapeHTML(item.subject || 'Não informado')}</strong></p>
                <p class="text-xs md:text-sm">Colaborador: ${escapeHTML(atendenteNome)}</p>
                <p class="text-xs md:text-sm text-gray-400">Início: ${startTime}</p>

                <div class="mt-4 flex flex-col gap-2">
                    <div class="grid grid-cols-2 gap-2">
                        <button data-id="${item.id}" data-name="${escapeHTML(item.name || '')}" data-collaborator-name="${escapeHTML(atendenteNome)}" class="delegate-finalization-btn bg-indigo-500 text-white font-bold py-2 md:py-3 rounded-lg md:rounded-xl text-xs md:text-sm shadow-md transition active:scale-95" ${canDelegateOrFinalize ? '' : 'disabled'}>
                            Delegar
                        </button>
                        <button onclick="window.open('${linkDireto}', '_blank')" class="bg-green-500 text-white font-bold py-2 md:py-3 rounded-lg md:rounded-xl text-xs md:text-sm shadow-md transition active:scale-95" ${canDelegateOrFinalize ? '' : 'disabled'}>
                            Finalizar
                        </button>
                    </div>
                    <button data-id="${item.id}" class="return-to-aguardando-from-emAtendimento-btn bg-slate-400 text-white font-bold py-2 rounded-lg text-xs md:text-sm shadow-md transition active:scale-95" ${canDelegateOrFinalize ? '' : 'disabled'}>
                        Voltar p/ Aguardando
                    </button>
                </div>

                ${this._getStandardizedFooterHtml(item)}
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
            const currentUserRole = window.app?.currentUser?.role;
            const canManageDemandsOrEditAttendant = currentUserRole === 'user' || currentUserRole === 'admin' || currentUserRole === 'superadmin';
            const canDelete = currentUserRole === 'admin' || currentUserRole === 'superadmin';
            const canRevert = currentUserRole === 'user' || currentUserRole === 'admin' || currentUserRole === 'superadmin';
            const canToggleConfirmed = currentUserRole === 'user' || currentUserRole === 'admin' || currentUserRole === 'superadmin';

            const card = document.createElement('div');
            card.className = 'assisted-card relative bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-4';
            card.setAttribute('data-id', item.id);
            
            const arrivalT = item.arrivalTime ? 
                new Date(item.arrivalTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'N/A';
            const attendedT = item.attendedTime ? 
                new Date(item.attendedTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
            
            // UTILIZA O MOTOR DE NOME SINCRONIZADO
            const atendenteNome = this.getAttendantName(item);

            const confirmButton = item.isConfirmed 
                ? 'bg-green-500 border-green-500 text-white' 
                : 'bg-slate-100 text-slate-300';

            card.innerHTML = `
                <div class="flex justify-between items-start">
                    <p class="font-bold text-lg md:text-xl text-gray-800">${escapeHTML(item.name || '')}</p>
                    <button data-id="${item.id}" class="toggle-confirmed-atendido w-6 h-6 md:w-7 md:h-7 rounded-full border border-gray-200 flex items-center justify-center ${confirmButton} shadow-sm" ${canToggleConfirmed ? '' : 'disabled'}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M12.736 3.97a.733.733 0 0 1 1.047 0c.286.289.29.756.01.105L7.882 12.5a.733.733 0 0 1-1.065.04L3.257 8.375a.733.733 0 0 1 1.064-.04l2.254 2.255Z"/>
                        </svg>
                    </button>
                </div>
                
                <p class="text-xs md:text-sm mt-1 text-gray-700">Assunto: <b>${escapeHTML(item.subject || 'Não informado')}</b></p>
                
                ${item.tipoAcaoRapida ? (() => {
                    const acaoCfg = {
                        'Reagendamento':       { icon: '🔄', bg: '#fffbeb', border: '#f59e0b', text: '#92400e', label: 'REAGENDADO' },
                        'Agendamento':         { icon: '📅', bg: '#ecfdf5', border: '#10b981', text: '#065f46', label: 'AGENDADO' },
                        'Consulta Processual': { icon: '🔍', bg: '#f5f3ff', border: '#8b5cf6', text: '#4c1d95', label: 'CONSULTA' },
                        'Outros Assuntos':     { icon: '⚙️', bg: '#f0f9ff', border: '#0ea5e9', text: '#0c4a6e', label: 'OUTROS' }
                    }[item.tipoAcaoRapida] || { icon: '⚡', bg: '#f0fdf4', border: '#22c55e', text: '#14532d', label: item.tipoAcaoRapida };
                    return `<div class="mt-1 mb-2">
                        <span style="background:${acaoCfg.bg};border:1.5px solid ${acaoCfg.border};color:${acaoCfg.text}" 
                              class="inline-flex items-center gap-1 text-[10px] md:text-xs font-black px-2 py-1 rounded-lg">
                            ${acaoCfg.icon} ${acaoCfg.label}
                        </span>
                    </div>`;
                })() : ''}
                
                <div class="grid grid-cols-3 gap-1 md:gap-2 text-center border-t border-b py-2 md:py-3 my-2 md:my-3 text-[8px] md:text-[10px] text-gray-400 uppercase font-bold tracking-wider">
                    <div>Agendado:<br><span class="text-gray-600">${item.scheduledTime || 'N/A'}</span></div>
                    <div>Chegou:<br><span class="text-gray-600">${arrivalT}</span></div>
                    <div>Finalizado:<br><span class="text-gray-600">${attendedT}</span></div>
                </div>

                <div class="flex justify-between items-center text-[10px] md:text-xs mb-4">
                    <p class="text-gray-500">Por: <b class="text-gray-800">${escapeHTML(atendenteNome)}</b></p>
                    <div class="grid grid-cols-2 gap-x-2 md:gap-x-4 gap-y-1 md:gap-y-2 text-right">
                        <button data-id="${item.id}" class="manage-demands-btn text-blue-500 font-bold hover:underline" ${canManageDemandsOrEditAttendant ? '' : 'disabled'}>Demandas</button>
                        <button data-id="${item.id}" class="edit-assisted-btn text-slate-400 font-bold hover:underline" ${canManageDemandsOrEditAttendant ? '' : 'disabled'}>Dados</button>
                        <button data-id="${item.id}" class="edit-attendant-btn text-green-600 font-bold hover:underline" ${canManageDemandsOrEditAttendant ? '' : 'disabled'}>Atendente</button>
                        <button data-id="${item.id}" class="delete-btn text-red-500 font-bold hover:underline" ${canDelete ? '' : 'disabled'}>Deletar</button>
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
                        <button data-id="${item.id}" class="return-from-atendido-btn w-full sm:w-auto bg-orange-500 text-white font-black py-2 md:py-3 px-4 md:px-8 rounded-lg md:rounded-xl text-[8px] md:text-[10px] uppercase shadow-md active:scale-95 transition-all" ${canRevert ? '' : 'disabled'}>
                            Voltar
                        </button>
                    </div>
                </div>
                ${this._getStandardizedFooterHtml(item)}
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

        container.innerHTML = '';
        items.forEach(item => {
            const currentUserRole = window.app?.currentUser?.role;
            const canDelete = currentUserRole === 'admin' || currentUserRole === 'superadmin';
            const canRevert = currentUserRole === 'user' || currentUserRole === 'admin' || currentUserRole === 'superadmin';
            const canToggleConfirmed = currentUserRole === 'user' || currentUserRole === 'admin' || currentUserRole === 'superadmin';

            const card = document.createElement('div');
            const priorityClass = PautaService.getPriorityClass(PautaService.getPriorityLevel(item));
            const isConfirmed = item.isConfirmed || false;

            card.className = 'assisted-card relative bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-4 opacity-90';
            card.setAttribute('data-id', item.id);

            const confirmButtonClass = isConfirmed 
                ? 'bg-green-500 border-green-500 text-white' 
                : 'bg-slate-100 text-slate-300';

            card.innerHTML = `
                <div class="flex justify-between items-start">
                    <div>
                        <p class="font-bold text-lg md:text-xl text-gray-800 leading-tight">${escapeHTML(item.name || '').toUpperCase()}</p>
                        <span class="text-[9px] font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded mt-1 border border-purple-100 inline-block uppercase">🚫 Faltoso</span>
                    </div>
                    
                    <button data-id="${item.id}" class="toggle-confirmed-faltoso w-6 h-6 md:w-7 md:h-7 rounded-full border border-gray-200 flex items-center justify-center ${confirmButtonClass} shadow-sm transition-all" ${canToggleConfirmed ? '' : 'disabled'} title="Lançar falta no Verde">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M12.736 3.97a.733.733 0 0 1 1.047 0c.286.289.29.756.01.105L7.882 12.5a.733.733 0 0 1-1.065.04L3.257 8.375a.733.733 0 0 1 1.064-.04l2.254 2.255Z"/>
                        </svg>
                    </button>
                </div>
                
                <p class="text-xs md:text-sm mt-2 text-gray-700">Assunto: <b>${escapeHTML(item.subject || 'Não informado')}</b></p>
                
                <div class="grid grid-cols-2 gap-2 text-center border-t border-b py-2 my-3 text-[9px] md:text-[10px] text-gray-400 uppercase font-bold tracking-wider">
                    <div class="border-r">Agendado:<br><span class="text-gray-600">${item.scheduledTime || '---'}</span></div>
                    <div>Falta marcada às:<br><span class="text-gray-600">${item.lastActionTimestamp ? new Date(item.lastActionTimestamp).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : '--:--'}</span></div>
                </div>

                <div class="flex justify-between items-center text-[10px] md:text-xs mb-4">
                    <p class="text-gray-400 italic">Status: <span class="${isConfirmed ? 'text-green-600' : 'text-amber-600'} font-bold">${isConfirmed ? 'Lançado no Verde' : 'Pendente no Verde'}</span></p>
                    <div class="flex gap-3">
                        <button data-id="${item.id}" class="edit-assisted-btn text-slate-400 font-bold hover:underline" ${canRevert ? '' : 'disabled'}>Dados</button>
                        <button data-id="${item.id}" class="delete-btn text-red-500 font-bold hover:underline" ${canDelete ? '' : 'disabled'}>Deletar</button>
                    </div>
                </div>

                <div class="pt-3 border-t">
                    <div class="flex flex-col sm:flex-row justify-end items-center gap-2">
                        <button data-id="${item.id}" class="return-to-pauta-from-faltoso-btn w-full sm:w-auto bg-orange-500 text-white font-black py-2 px-6 rounded-lg text-[9px] md:text-[10px] uppercase shadow-md active:scale-95 transition-all" ${canRevert ? '' : 'disabled'}>
                            Reativar Assistido
                        </button>
                    </div>
                </div>

                ${this._getStandardizedFooterHtml(item)}
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
            const currentUserRole = window.app?.currentUser?.role;
            const canManageDistribution = currentUserRole === 'user' || currentUserRole === 'admin' || currentUserRole === 'superadmin';

            const card = document.createElement('div');
            card.className = 'assisted-card relative bg-cyan-50 p-4 rounded-lg shadow-sm border border-cyan-200 mb-2';
            card.setAttribute('data-id', item.id);
            const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
            const linkExterno = `${baseUrl}/atendimento_externo.html?pautaId=${pautaId}&assistidoId=${item.id}&collaboratorName=${encodeURIComponent(userName)}`;

            card.innerHTML = `
                <p class="font-bold text-gray-800 text-sm">${escapeHTML(item.name || '')}</p>
                <p class="text-[10px] text-cyan-700 font-bold uppercase mt-1">⚖️ Aguardando Distribuição</p>
                <div class="mt-3 space-y-2">
                    <button onclick="window.open('${linkExterno}', '_blank')" class="w-full bg-cyan-600 text-white text-[10px] font-bold py-2 rounded hover:bg-cyan-700 uppercase shadow-sm" ${canManageDistribution ? '' : 'disabled'}>Painel de Protocolo</button>
                    <button data-id="${item.id}" class="return-to-aguardando-from-dist-btn w-full bg-white text-gray-400 border border-gray-200 text-[9px] py-1 rounded uppercase" ${canManageDistribution ? '' : 'disabled'}>Reverter</button>
                </div>
                ${this._getStandardizedFooterHtml(item)}
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
    },

    renderPautaCards(pautas, userId, userEmail, app) {
        const container = document.getElementById('pautas-list');
        if (!container) return;

        if (!pautas || pautas.length === 0) {
            container.innerHTML = '<p class="col-span-full text-center py-8 text-gray-500 font-medium">Nenhuma pauta encontrada.</p>';
            return;
        }

        container.innerHTML = '';
        
        pautas.forEach(pauta => {
            const isOwner = pauta.owner === userId;
            const isClosed = pauta.isClosed;
            
            let dataCriacaoStr = '---';
            let dataExpiracaoStr = '';
            let isExpired = false;

            if (pauta.createdAt) {
                const creationDate = new Date(pauta.createdAt);
                dataCriacaoStr = creationDate.toLocaleDateString('pt-BR');
                
                const expirationDate = new Date(creationDate);
                expirationDate.setDate(creationDate.getDate() + 7);
                dataExpiracaoStr = expirationDate.toLocaleDateString('pt-BR');

                const now = new Date();
                isExpired = now > expirationDate;
            }

            const card = document.createElement('div');
            card.className = `relative bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all flex flex-col justify-between min-h-[220px] ${isExpired ? 'opacity-60 grayscale-[0.5] cursor-not-allowed' : 'cursor-pointer'} ${isClosed ? 'opacity-60' : ''}`;
            
            card.innerHTML = `
                ${isOwner ? `
                <button class="delete-pauta-btn absolute top-4 right-4 text-gray-300 hover:text-red-500 transition-colors z-20">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M11 1.5v1h3.5a.5.5 0 0 1 0 1h-.538l-.853 10.66A2 2 0 0 1 11.115 16h-6.23a2 2 0 0 1-1.994-1.84L2.038 3.5H1.5a.5.5 0 0 1 0-1H5v-1A1.5 1.5 0 0 1 6.5 0h3A1.5 1.5 0 0 1 11 1.5Zm-5 0v1h4v-1a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5ZM4.5 5.029l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06Zm3 0l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06Zm3 .5a.5.5 0 0 0-1 0v8.5a.5.5 0 0 0 1 0v-8.5Z"/>
                    </svg>
                </button>` : ''}

                <div>
                    <h3 class="font-bold text-xl text-gray-600 leading-tight uppercase mb-2 pr-8">
                        ${escapeHTML(pauta.name)}
                    </h3>
                    <p class="text-sm text-gray-500 mb-6">Membros: ${pauta.members ? pauta.members.length : 1}</p>
                </div>
                
                <div class="pt-4 border-t border-gray-100">
                    <p class="text-[10px] text-gray-400 uppercase font-bold">Criada em: ${dataCriacaoStr}</p>
                    
                    ${isExpired ? `
                        <p class="text-[10px] text-red-500 font-bold mt-1 flex items-center gap-1">
                            🚫 EXPIRADA EM: ${dataExpiracaoStr}
                        </p>
                    ` : `
                        <p class="text-[10px] text-amber-600 font-bold mt-1">
                            ELIMINAÇÃO EM: ${dataExpiracaoStr}
                        </p>
                    `}
                    
                    <div class="mt-3">
                        ${isOwner ? `
                            <span class="bg-green-50 text-green-600 text-[9px] font-black px-2 py-1 rounded border border-green-100 uppercase flex items-center w-max gap-1">
                                 Criador
                            </span>
                        ` : `
                            <span class="bg-blue-50 text-blue-600 text-[9px] font-black px-2 py-1 rounded border border-blue-100 uppercase flex items-center w-max gap-1">
                                 Compartilhada
                            </span>
                        `}
                    </div>
                </div>
            `;

            const deleteBtn = card.querySelector('.delete-pauta-btn');
            if (deleteBtn) {
                deleteBtn.onclick = (e) => {
                    e.stopPropagation();
                    app.deletePauta(pauta.id, pauta.name);
                };
            }

            card.onclick = () => {
                if (isExpired) {
                    showNotification('Pauta inacessível devido o prazo cumprido!', 'error');
                    return;
                }
                app.loadPauta(pauta.id, pauta.name, pauta.type);
            };

            container.appendChild(card);
        });
    },

    handleCardActions(e, app) {
        const button = e.target.closest('button');
        if (!button) return;

        const id = button.dataset.id;
        if (!id) return;

        const isMobile = this.isMobileDevice();

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
                if (isMobile) {
                    const timeInput = document.getElementById('arrival-time-input');
                    timeInput.setAttribute('pattern', '[0-9]{2}:[0-9]{2}');
                }
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
            if (nameElement) nameElement.textContent = assisted.name || '';
            
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
            if (nameElement) nameElement.textContent = assisted.name || '';
            
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
                    const nomeAtendente = this.getAttendantName(assisted);
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
                const atendenteNome = this.getAttendantName(assisted);
                
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
            
            showNotification(`Status de Marcado Presença no Verde atualizado para ${newConfirmedState ? 'Confirmado' : 'Não Confirmado'}.`, 'info');
        }
    }
};
