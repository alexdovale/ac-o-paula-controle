// js/ui.js
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
     * Formata o horário de agendamento para exibição
     */
    formatScheduledTime(assisted) {
        if (!assisted || assisted.type !== 'agendamento') return null;
        if (!assisted.scheduledTime) return null;
        
        // Se já estiver no formato HH:MM
        if (assisted.scheduledTime.match(/^\d{2}:\d{2}$/)) {
            return assisted.scheduledTime;
        }
        
        try {
            const date = new Date(assisted.scheduledTime);
            if (!isNaN(date.getTime())) {
                return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            }
        } catch (e) {}
        
        return assisted.scheduledTime;
    },

    /**
     * Renderiza o badge de horário agendado
     */
    renderScheduledTimeBadge(assisted) {
        const scheduledTime = this.formatScheduledTime(assisted);
        if (!scheduledTime) return '';
        
        return `
            <span class="inline-flex items-center gap-1 text-[10px] md:text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full ml-1 md:ml-2" title="Horário agendado">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                ${scheduledTime}
            </span>
        `;
    },

    /**
     * Renderiza badge de prioridade
     */
    renderPriorityBadge(priority) {
        if (!priority || priority === 'N/A') return '';
        
        const priorityStyles = {
            'URGENTE': 'bg-red-500 text-white',
            'Máxima': 'bg-orange-500 text-white',
            'Média': 'bg-yellow-500 text-white',
            'Mínima': 'bg-green-500 text-white'
        };
        
        const style = priorityStyles[priority] || 'bg-gray-500 text-white';
        
        return `
            <span class="inline-flex items-center gap-1 text-[10px] md:text-xs ${style} px-1.5 py-0.5 rounded-full ml-1 md:ml-2" title="Prioridade">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                ${priority}
            </span>
        `;
    },

    renderPautaFilters(containerId, activeFilter, onFilterChange, app) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
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
                        <button id="aplicar-filtro-periodo" class="bg-green-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-green-700 transition shadow-md">Aplicar Filtros</button>
                    </div>
                </div>`;
        }
        
        container.innerHTML = `
            <div class="flex flex-wrap gap-2 mb-4 justify-center">
                <button class="filter-btn px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeFilter === 'all' ? 'bg-green-600 text-white shadow-md' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}" data-filter="all">📋 Todas</button>
                <button class="filter-btn px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeFilter === 'active' ? 'bg-green-600 text-white shadow-md' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}" data-filter="active">✅ Pautas com prazo</button>
                <button class="filter-btn px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeFilter === 'expired' ? 'bg-green-600 text-white shadow-md' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}" data-filter="expired">🔒 Pautas expiradas</button>
                <button class="filter-btn px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeFilter === 'my' ? 'bg-green-600 text-white shadow-md' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}" data-filter="my">👑 Criadas por mim</button>
                <button class="filter-btn px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeFilter === 'shared' ? 'bg-green-600 text-white shadow-md' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}" data-filter="shared">🤝 Compartilhadas</button>
                <button class="filter-btn px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeFilter === 'periodo' ? 'bg-green-600 text-white shadow-md' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}" data-filter="periodo">📅 Período</button>
            </div>
            ${dateFiltersHTML}`;
        
        document.querySelectorAll('.filter-btn').forEach(btn => btn.addEventListener('click', () => onFilterChange(btn.dataset.filter)));
        document.getElementById('aplicar-filtro-periodo')?.addEventListener('click', () => app.loadPautasWithFilter?.());
    },

    toggleAuthTabs(tab) {
        const loginTab = document.getElementById('login-tab-btn');
        const registerTab = document.getElementById('register-tab-btn');
        const loginForm = document.getElementById('login-form');
        const registerForm = document.getElementById('register-form');

        if (tab === 'login') {
            loginTab.classList.add('border-green-600', 'text-green-600');
            registerTab.classList.remove('border-green-600', 'text-green-600');
            loginForm.classList.remove('hidden');
            registerForm.classList.add('hidden');
        } else {
            registerTab.classList.add('border-green-600', 'text-green-600');
            loginTab.classList.remove('border-green-600', 'text-green-600');
            registerForm.classList.remove('hidden');
            loginForm.classList.add('hidden');
        }
    },

    switchTab(tabName, app) {
        const tabAgendamento = document.getElementById('tab-agendamento');
        const tabAvulso = document.getElementById('tab-avulso');
        const formContainer = document.getElementById('form-agendamento');
        const emAtendimentoColumn = document.getElementById('em-atendimento-column');

        formContainer.classList.remove('hidden');

        if (tabName === 'agendamento') {
            tabAgendamento.classList.add('tab-active');
            tabAvulso.classList.remove('tab-active');
            document.getElementById('is-scheduled-container').classList.remove('hidden');
            document.getElementById('pauta-column').classList.remove('hidden');
            this.showAgendamentoForm();
        } else {
            tabAvulso.classList.add('tab-active');
            tabAgendamento.classList.remove('tab-active');
            document.getElementById('is-scheduled-container').classList.add('hidden');
            document.getElementById('pauta-column').classList.add('hidden');
            this.showAvulsoForm(app);
        }
        
        if (app.currentPautaData?.useDelegationFlow) {
            emAtendimentoColumn?.classList.remove('hidden');
        } else {
            emAtendimentoColumn?.classList.add('hidden');
        }
        
        this.renderAssistedLists(app);
    },

    showAgendamentoForm() {
        document.querySelector('input[name="is-scheduled"][value="no"]').checked = true;
        document.querySelector('input[name="has-arrived"][value="no"]').checked = true;
        document.getElementById('scheduled-time-wrapper').classList.add('hidden');
        document.getElementById('arrival-time-wrapper').classList.add('hidden');
    },

    showAvulsoForm(app) {
        document.querySelector('input[name="has-arrived"][value="yes"]').checked = true;
        document.getElementById('arrival-time-wrapper').classList.remove('hidden');
        document.getElementById('arrival-time').value = new Date().toTimeString().slice(0, 5);
    },

    togglePautaLock(app) {
        const isClosed = app.isPautaClosed;
        const ids = ['form-agendamento', 'file-upload', 'add-assisted-btn', 'tab-avulso', 'tab-agendamento'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.classList.toggle('pointer-events-none', isClosed);
                el.classList.toggle('opacity-50', isClosed);
            }
        });
        
        if (isClosed) {
            document.getElementById('closed-pauta-alert')?.classList.remove('hidden');
            document.getElementById('close-pauta-btn')?.classList.add('hidden');
            document.getElementById('reopen-pauta-btn')?.classList.remove('hidden');
        } else {
            document.getElementById('closed-pauta-alert')?.classList.add('hidden');
            document.getElementById('reopen-pauta-btn')?.classList.add('hidden');
        }
    },

    toggleFaltosos() {
        const btn = document.getElementById('toggle-faltosos-btn');
        const pautaCol = document.getElementById('pauta-column');
        const faltosoCol = document.getElementById('faltosos-column');

        pautaCol.classList.toggle('hidden');
        faltosoCol.classList.toggle('hidden');
        btn.textContent = faltosoCol.classList.contains('hidden') ? 'Ver Faltosos' : 'Ver Pauta';
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
        if (!app) return;
        
        const allAssisted = app.allAssisted || [];
        const currentPautaData = app.currentPautaData;
        const colaboradores = app.colaboradores || [];

        const useDist = currentPautaData?.useDistributionFlow || false;
        document.getElementById('distribuicao-column')?.classList.toggle('hidden', !useDist);

        if (allAssisted.length === 0) {
            this.clearContainers();
            this.renderEmptyMessages();
            this.updateCounters({});
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
            emAtendimento: allAssisted.filter(a => ['emAtendimento', 'emRevisao', 'aguardandoCorrecao', 'aguardandoNumero'].includes(a.status) && a.type === currentMode && this.searchFilter(a, searchTerms.emAtendimento)),
            atendidos: allAssisted.filter(a => a.status === 'atendido' && a.type === currentMode && this.searchFilter(a, searchTerms.atendidos)),
            faltosos: allAssisted.filter(a => a.status === 'faltoso' && a.type === 'agendamento' && this.searchFilter(a, searchTerms.faltosos)),
            distribuicao: allAssisted.filter(a => a.status === 'aguardandoDistribuicao' && this.searchFilter(a, searchTerms.distribuicao))
        };

        lists.pauta.sort((a, b) => (a.scheduledTime || '23:59').localeCompare(b.scheduledTime || '23:59'));
        lists.atendidos.sort((a, b) => new Date(b.attendedAt || b.attendedTime) - new Date(a.attendedAt || a.attendedTime));
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

    searchFilter(assisted, term) {
        if (!term) return true;
        const name = normalizeText(assisted.name || '');
        const subject = normalizeText(assisted.subject || '');
        const collab = normalizeText(assisted.assignedCollaborator?.name || '');
        return name.includes(term) || subject.includes(term) || collab.includes(term);
    },

    updateCounters(lists) {
        const ids = ['pauta', 'aguardando', 'em-atendimento', 'atendidos', 'faltosos', 'distribuicao'];
        ids.forEach(id => {
            const el = document.getElementById(`${id}-count`);
            const key = id.replace(/-([a-z])/g, g => g[1].toUpperCase());
            if (el) el.textContent = lists[key]?.length || 0;
        });
    },

    clearContainers() {
        ['pauta-list', 'aguardando-list', 'em-atendimento-list', 'atendidos-list', 'faltosos-list', 'distribuicao-list'].forEach(id => { 
            const el = document.getElementById(id); if (el) el.innerHTML = ''; 
        });
    },

    renderEmptyMessages() {
        ['pauta-list', 'aguardando-list', 'atendidos-list'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '<p class="text-gray-400 text-center p-4 text-xs">Nenhum registro</p>';
        });
    },

    renderPautaColumn(items) {
        const container = document.getElementById('pauta-list');
        if (container) items.forEach(item => container.appendChild(this.createPautaCard(item)));
    },

    createPautaCard(item) {
        const card = document.createElement('div');
        card.className = 'relative bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-3';
        
        const scheduledBadge = this.renderScheduledTimeBadge(item);
        
        card.innerHTML = `
            <button data-id="${item.id}" class="delete-btn absolute top-3 right-3 text-gray-300 hover:text-red-500">🗑️</button>
            <div class="flex items-center flex-wrap pr-6">
                <p class="font-bold text-xl text-gray-800 leading-tight">${escapeHTML(item.name || '').toUpperCase()}</p>
                ${scheduledBadge}
            </div>
            <div class="mt-2 space-y-0.5 text-sm text-gray-700">
                <p>Assunto: <span class="font-bold uppercase">${escapeHTML(item.subject || 'Não informado')}</span></p>
                <p>Agendado: <span class="font-bold">${item.scheduledTime || '--:--'}</span></p>
            </div>
            <div class="mt-4 grid grid-cols-2 gap-2">
                <button data-id="${item.id}" class="check-in-btn bg-green-500 text-white font-bold py-2.5 rounded-lg text-xs">Marcar Chegada</button>
                <button data-id="${item.id}" class="faltou-btn bg-yellow-500 text-white font-bold py-2.5 rounded-lg text-xs">Faltou</button>
                <button data-id="${item.id}" class="edit-assisted-btn col-span-2 bg-slate-500 text-white font-bold py-2.5 rounded-lg text-xs">Editar Dados</button>
            </div>
            <!-- Botão Voltar para Pauta (quando aplicável) -->
            <button data-id="${item.id}" class="return-to-pauta-btn w-full mt-2 bg-gray-200 text-gray-700 font-bold py-2 rounded-lg text-xs hover:bg-gray-300">← Voltar para Pauta</button>
        `;
        return card;
    },

    renderAguardandoColumn(items, currentPautaData, colaboradores) {
        const container = document.getElementById('aguardando-list');
        if (!container) return;
        
        if (currentPautaData?.type === 'multisala' && currentPautaData.rooms?.length > 0) {
            currentPautaData.rooms.forEach(roomName => {
                const peopleInRoom = items.filter(a => a.room === roomName);
                if (peopleInRoom.length > 0) {
                    const header = document.createElement('div');
                    header.className = "bg-blue-50 text-blue-800 font-black px-3 py-1.5 rounded mt-4 mb-2 text-[10px] uppercase flex justify-between";
                    header.innerHTML = `<span>🏢 ${escapeHTML(roomName)}</span> <span>${peopleInRoom.length}</span>`;
                    container.appendChild(header);
                    peopleInRoom.forEach((item, index) => container.appendChild(this.createAguardandoCard(item, currentPautaData, index)));
                }
            });
        } else {
            items.forEach((item, index) => container.appendChild(this.createAguardandoCard(item, currentPautaData, index)));
        }
    },

    createAguardandoCard(item, currentPautaData, index) {
        const card = document.createElement('div');
        const priorityClass = PautaService.getPriorityClass(item.priority);
        card.className = `relative bg-white p-4 rounded-lg shadow-sm ${priorityClass} mb-2 group`;
        card.setAttribute('data-id', item.id);
        
        const atenderButton = currentPautaData?.useDelegationFlow
            ? `<button data-id="${item.id}" class="select-collaborator-btn bg-blue-500 text-white font-semibold py-2 rounded-lg text-sm w-full">Atender</button>`
            : `<button data-id="${item.id}" class="attend-directly-from-aguardando-btn bg-blue-500 text-white font-semibold py-2 rounded-lg text-sm w-full">Atender</button>`;

        const scheduledBadge = this.renderScheduledTimeBadge(item);
        const priorityBadge = this.renderPriorityBadge(item.priority);

        card.innerHTML = `
            <div class="absolute -left-2 -top-2 w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-bold text-sm shadow-lg border-2 border-white">${index + 1}</div>
            <button data-id="${item.id}" class="delete-btn absolute top-2 right-2 text-gray-300 hover:text-red-600">🗑️</button>
            <div class="flex items-center flex-wrap pr-6">
                <p class="font-bold text-lg text-gray-800 mb-1">${escapeHTML(item.name)}</p>
                ${scheduledBadge}
                ${priorityBadge}
            </div>
            <p class="text-xs text-gray-600">Assunto: <strong>${escapeHTML(item.subject)}</strong></p>
            <div class="mt-4 grid grid-cols-2 gap-2">
                ${atenderButton}
                <button data-id="${item.id}" class="priority-btn bg-red-500 text-white font-semibold py-2 rounded-lg text-xs">Prioridade</button>
            </div>
            <button data-id="${item.id}" class="view-details-btn text-indigo-500 text-[11px] font-bold mt-2 w-full text-center underline">Ver Detalhes</button>
            <!-- Botão Voltar para Aguardando -->
            <button data-id="${item.id}" class="return-to-aguardando-btn w-full mt-2 bg-gray-200 text-gray-700 font-bold py-1.5 rounded-lg text-[10px] hover:bg-gray-300">← Voltar p/ Aguardando</button>
        `;
        return card;
    },

    renderEmAtendimentoColumn(items, currentPautaData, pautaId, userName) {
        const container = document.getElementById('em-atendimento-list');
        if (container) items.forEach((item, index) => container.appendChild(this.createEmAtendimentoCard(item, pautaId, userName, index)));
    },

    createEmAtendimentoCard(item, pautaId, userName, index) {
        const card = document.createElement('div');
        card.className = `relative bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-3`;
        
        const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
        const linkDireto = `${baseUrl}/atendimento_externo.html?pautaId=${pautaId}&assistidoId=${item.id}&collaboratorName=${encodeURIComponent(userName)}`;

        const scheduledBadge = this.renderScheduledTimeBadge(item);

        let statusLabel = '';
        let returnButton = '';
        
        if (item.status === 'emRevisao') {
            statusLabel = `<span class="bg-purple-100 text-purple-800 text-[10px] font-bold px-2 py-0.5 rounded border border-purple-200">🔍 Em Revisão (Defensor)</span>`;
            returnButton = `<button data-id="${item.id}" class="return-from-revisao-btn w-full mt-2 bg-gray-200 text-gray-700 font-bold py-2 rounded-lg text-xs hover:bg-gray-300">← Voltar p/ Aguardando</button>`;
        } else if (item.status === 'aguardandoCorrecao') {
            statusLabel = `<span class="bg-red-100 text-red-800 text-[10px] font-bold px-2 py-0.5 rounded border border-red-200">✏️ Corrigir: ${escapeHTML(item.reviewMotivoDevolucao || '')}</span>`;
            returnButton = `<button data-id="${item.id}" class="return-from-aguardando-correcao-btn w-full mt-2 bg-gray-200 text-gray-700 font-bold py-2 rounded-lg text-xs hover:bg-gray-300">← Voltar p/ Aguardando</button>`;
        } else if (item.status === 'aguardandoNumero') {
            statusLabel = `<span class="bg-indigo-100 text-indigo-800 text-[10px] font-bold px-2 py-0.5 rounded border border-indigo-200">⏳ Aguardando Processo</span>`;
            returnButton = `<button data-id="${item.id}" class="return-from-aguardando-numero-btn w-full mt-2 bg-gray-200 text-gray-700 font-bold py-2 rounded-lg text-xs hover:bg-gray-300">← Voltar p/ Aguardando</button>`;
        } else {
            // emAtendimento normal
            returnButton = `<button data-id="${item.id}" class="return-to-aguardando-from-emAtendimento-btn w-full mt-2 bg-gray-200 text-gray-700 font-bold py-2 rounded-lg text-xs hover:bg-gray-300">← Voltar p/ Aguardando</button>`;
        }

        card.innerHTML = `
            <button data-id="${item.id}" class="delete-btn absolute top-2 right-2 text-gray-300 hover:text-red-500">🗑️</button>

            <div class="flex items-center flex-wrap pr-6">
                <p class="font-bold text-xl text-gray-800">${index + 1}. ${escapeHTML(item.name || '')}</p>
                ${scheduledBadge}
            </div>
            <p class="text-xs mt-1">Assunto: <strong>${escapeHTML(item.subject || 'Não informado')}</strong></p>
            <p class="text-xs">Colaborador: ${escapeHTML(item.assignedCollaborator?.name || 'Não atribuído')}</p>
            
            <div class="mt-2">${statusLabel}</div>

            <div class="mt-4 flex flex-col gap-2">
                <button onclick="window.open('${linkDireto}', '_blank')" class="bg-blue-600 text-white font-bold py-3 rounded-lg text-sm shadow-md hover:bg-blue-700">
                    Abrir Painel de Atendimento
                </button>
                ${returnButton}
            </div>
        `;
        return card;
    },

    renderAtendidosColumn(items) {
        const container = document.getElementById('atendidos-list');
        if (container) items.forEach(item => container.appendChild(this.createAtendidoCard(item)));
    },

    createAtendidoCard(item) {
        const card = document.createElement('div');
        card.className = 'relative bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-4';
        
        const scheduledBadge = this.renderScheduledTimeBadge(item);
        
        card.innerHTML = `
            <div class="flex items-center flex-wrap">
                <p class="font-bold text-lg text-gray-800">${escapeHTML(item.name || '')}</p>
                ${scheduledBadge}
            </div>
            <p class="text-xs mt-1 text-gray-700">Assunto: <b>${escapeHTML(item.subject || 'Não informado')}</b></p>
            ${item.processNumber ? `<p class="text-[10px] font-mono text-indigo-600 mt-1 bg-indigo-50 px-2 rounded w-fit">Processo Nº ${item.processNumber}</p>` : ''}
            
            <div class="flex justify-between items-center text-[10px] mt-4 pt-3 border-t">
                <button data-id="${item.id}" class="manage-demands-btn text-blue-500 font-bold">Demandas</button>
                <button data-id="${item.id}" class="return-from-atendido-btn bg-orange-500 text-white px-3 py-1 rounded font-bold uppercase">Voltar</button>
            </div>
        `;
        return card;
    },

    renderFaltososColumn(items) {
        const container = document.getElementById('faltosos-list');
        if (container) items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'relative bg-red-50 p-4 rounded-lg border border-red-100 mb-2 opacity-80';
            
            const scheduledBadge = this.renderScheduledTimeBadge(item);
            
            card.innerHTML = `
                <div class="flex items-center flex-wrap">
                    <p class="font-bold text-gray-700 text-sm">${escapeHTML(item.name)}</p>
                    ${scheduledBadge}
                </div>
                <button data-id="${item.id}" class="return-to-pauta-from-faltoso-btn mt-2 w-full bg-white text-red-500 border border-red-200 py-1 rounded text-[9px] font-bold uppercase">← Voltar p/ Pauta</button>
            `;
            container.appendChild(card);
        });
    },

    renderDistribuicaoColumn(items, pautaId, userName) {
        const container = document.getElementById('distribuicao-list');
        if (container) items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'relative bg-cyan-50 p-4 rounded-lg border border-cyan-200 mb-2';
            const link = `./atendimento_externo.html?pautaId=${pautaId}&assistidoId=${item.id}&collaboratorName=${encodeURIComponent(userName)}`;
            
            const scheduledBadge = this.renderScheduledTimeBadge(item);
            
            card.innerHTML = `
                <div class="flex items-center flex-wrap">
                    <p class="font-bold text-gray-800 text-sm">${escapeHTML(item.name)}</p>
                    ${scheduledBadge}
                </div>
                <p class="text-[10px] text-cyan-700 font-bold uppercase mt-1">⚖️ Aguardando Distribuição</p>
                <div class="flex gap-2 mt-3">
                    <button onclick="window.open('${link}', '_blank')" class="flex-1 bg-cyan-600 text-white text-[10px] font-bold py-2 rounded uppercase hover:bg-cyan-700">Protocolar Processo</button>
                    <button data-id="${item.id}" class="return-to-aguardando-from-dist-btn flex-1 bg-gray-200 text-gray-700 text-[10px] font-bold py-2 rounded hover:bg-gray-300">← Voltar</button>
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
                    const c = document.getElementById(id);
                    if (c) c.onclick = () => modal.classList.add('hidden');
                });
            }
        };
        bindModal('privacy-btn-footer', 'privacy-policy-modal', ['close-policy-modal-btn-x', 'close-policy-modal-btn']);
        bindModal('manual-btn-footer', 'manual-modal', ['close-manual-modal-x', 'close-manual-modal-btn']);
        bindModal('terms-btn-footer', 'terms-modal', ['close-terms-modal-x', 'close-terms-modal-btn']);
    }
};
