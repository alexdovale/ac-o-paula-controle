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
     * Renderiza os botões de filtro na tela de seleção de pautas
     */
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
                        <button id="aplicar-filtro-periodo" class="bg-green-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-green-700 transition shadow-md">
                            Aplicar Filtros
                        </button>
                    </div>
                </div>`;
        }
        
        container.innerHTML = `
            <div class="flex flex-wrap gap-2 mb-4 justify-center">
                <button class="filter-btn px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeFilter === 'all' ? 'bg-green-600 text-white shadow-md' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}" data-filter="all">📋 Todas</button>
                <button class="filter-btn px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeFilter === 'active' ? 'bg-green-600 text-white shadow-md' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}" data-filter="active">✅ Prazo OK</button>
                <button class="filter-btn px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeFilter === 'expired' ? 'bg-green-600 text-white shadow-md' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}" data-filter="expired">🔒 Expiradas</button>
                <button class="filter-btn px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeFilter === 'my' ? 'bg-green-600 text-white shadow-md' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}" data-filter="my">👑 Minhas</button>
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

    /**
     * Controle de Visibilidade das Colunas
     */
    updateColumnVisibility(app) {
        const data = app.currentPautaData;
        if (!data) return;

        const useReview = data.useReviewFlow || false;
        const useDist = data.useDistributionFlow || false;

        document.getElementById('em-revisao-column')?.classList.toggle('hidden', !useReview);
        document.getElementById('aguardando-numero-column')?.classList.toggle('hidden', !useReview);
        document.getElementById('aguardando-correcao-column')?.classList.toggle('hidden', !useReview);
        document.getElementById('distribuido-column')?.classList.toggle('hidden', !useReview);
        document.getElementById('distribuicao-column')?.classList.toggle('hidden', useReview || !useDist);
        document.getElementById('review-stats-summary')?.classList.toggle('hidden', !useReview);
    },

    togglePautaLock(app) {
        const isClosed = app.isPautaClosed;
        const buttonsToDisable = ['form-agendamento', 'file-upload', 'add-assisted-btn', 'download-pdf-btn', 'toggle-faltosos-btn', 'tab-avulso', 'tab-agendamento'];

        buttonsToDisable.forEach(id => {
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

    /**
     * RENDERIZAÇÃO PRINCIPAL
     */
    renderAssistedLists(app) {
        if (!app) return;
        const allAssisted = app.allAssisted || [];
        const currentPautaData = app.currentPautaData;
        const colaboradores = app.colaboradores || [];

        this.updateColumnVisibility(app);
        this.clearContainers();

        if (allAssisted.length === 0) {
            this.renderEmptyMessages();
            this.updateCounters({});
            return;
        }

        const tabAgendamento = document.getElementById('tab-agendamento');
        const currentMode = tabAgendamento?.classList.contains('tab-active') ? 'agendamento' : 'avulso';
        const searchTerms = this.getSearchTerms();

        const lists = {
            pauta: allAssisted.filter(a => a.status === 'pauta' && this.searchFilter(a, searchTerms.pauta)),
            aguardando: allAssisted.filter(a => a.status === 'aguardando' && this.searchFilter(a, searchTerms.aguardando)),
            emAtendimento: allAssisted.filter(a => a.status === 'emAtendimento' && this.searchFilter(a, searchTerms.emAtendimento)),
            emRevisao: allAssisted.filter(a => a.status === 'emRevisao' && this.searchFilter(a, searchTerms.emRevisao)),
            aguardandoNumero: allAssisted.filter(a => a.status === 'aguardandoNumero' && this.searchFilter(a, searchTerms.aguardandoNumero)),
            aguardandoCorrecao: allAssisted.filter(a => a.status === 'aguardandoCorrecao' && this.searchFilter(a, searchTerms.aguardandoCorrecao)),
            distribuido: allAssisted.filter(a => a.status === 'distribuido' && this.searchFilter(a, searchTerms.distribuido)),
            atendidos: allAssisted.filter(a => a.status === 'atendido' && this.searchFilter(a, searchTerms.atendidos)),
            faltosos: allAssisted.filter(a => a.status === 'faltoso' && this.searchFilter(a, searchTerms.faltosos)),
            distribuicao: allAssisted.filter(a => a.status === 'aguardandoDistribuicao' && this.searchFilter(a, searchTerms.distribuicao))
        };

        this.updateCounters(lists);
        this.updateReviewStats(allAssisted);

        // Renderização detalhada por coluna (preservando sua lógica original)
        this.renderPautaColumn(lists.pauta);
        this.renderAguardandoColumn(lists.aguardando, currentPautaData, colaboradores);
        this.renderEmAtendimentoColumn(lists.emAtendimento, currentPautaData, app.currentPauta?.id, app.currentUserName);
        this.renderAtendidosColumn(lists.atendidos);
        this.renderFaltososColumn(lists.faltosos);
        this.renderDistribuicaoColumn(lists.distribuicao, app.currentPauta?.id, app.currentUserName);
        
        // Renderizar Colunas de Revisão (Novas)
        this.renderReviewColumns(lists, app);

        this.togglePautaLock(app);
        setTimeout(() => PautaService.setupManualSort(app), 100);
    },

    // --- RENDERIZADORES ESPECÍFICOS DE COLUNA (RESTORED) ---

    renderPautaColumn(items) {
        const container = document.getElementById('pauta-list');
        if (container) items.forEach(item => container.appendChild(this.createPautaCard(item)));
    },

    createPautaCard(item) {
        const card = document.createElement('div');
        card.className = 'relative bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-3';
        card.innerHTML = `
            <button data-id="${item.id}" class="delete-btn absolute top-3 right-3 text-gray-300 hover:text-red-500">🗑️</button>
            <p class="font-bold text-xl text-gray-800 uppercase pr-6">${escapeHTML(item.name)}</p>
            <div class="mt-2 text-sm text-gray-700">
                <p>Assunto: <span class="font-bold uppercase">${escapeHTML(item.subject)}</span></p>
                <p>Agendado: <span class="font-bold">${item.scheduledTime || '--:--'}</span></p>
            </div>
            <div class="mt-4 grid grid-cols-2 gap-2">
                <button data-id="${item.id}" class="check-in-btn bg-green-500 text-white font-bold py-2 rounded text-xs">Chegada</button>
                <button data-id="${item.id}" class="faltou-btn bg-yellow-500 text-white font-bold py-2 rounded text-xs">Faltou</button>
                <button data-id="${item.id}" class="edit-assisted-btn col-span-2 bg-slate-500 text-white font-bold py-2 rounded text-xs">Editar Dados</button>
            </div>`;
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
                    peopleInRoom.forEach((item, index) => container.appendChild(this.createAguardandoCard(item, currentPautaData, colaboradores, index)));
                }
            });
        } else {
            items.forEach((item, index) => container.appendChild(this.createAguardandoCard(item, currentPautaData, colaboradores, index)));
        }
    },

    createAguardandoCard(item, currentPautaData, colaboradores, index) {
        const card = document.createElement('div');
        const priorityClass = PautaService.getPriorityClass(item.priority);
        card.className = `relative bg-white p-4 rounded-lg shadow-sm ${priorityClass} mb-2`;
        card.setAttribute('data-id', item.id);
        
        card.innerHTML = `
            <div class="absolute -left-2 -top-2 w-7 h-7 bg-green-600 text-white rounded-full flex items-center justify-center font-bold text-xs border-2 border-white shadow">${index + 1}</div>
            <button data-id="${item.id}" class="quick-action-toggle absolute top-2 right-10 text-gray-400">⚙️</button>
            <button data-id="${item.id}" class="delete-btn absolute top-2 right-2 text-gray-300">🗑️</button>
            <p class="font-bold text-lg text-gray-800 mb-1">${escapeHTML(item.name)}</p>
            <p class="text-xs text-gray-600">Assunto: <strong>${escapeHTML(item.subject)}</strong></p>
            <div class="mt-4 grid grid-cols-2 gap-2">
                <button data-id="${item.id}" class="select-collaborator-btn bg-blue-500 text-white font-bold py-2 rounded text-xs">Atender</button>
                <button data-id="${item.id}" class="priority-btn bg-red-500 text-white font-bold py-2 rounded text-xs">Prioridade</button>
            </div>
            <button data-id="${item.id}" class="view-details-btn text-indigo-500 text-[11px] font-bold mt-2 w-full text-center underline">Ver Detalhes</button>`;
        return card;
    },

    renderEmAtendimentoColumn(items, currentPautaData, pautaId, userName) {
        const container = document.getElementById('em-atendimento-list');
        if (container) items.forEach((item, index) => container.appendChild(this.createEmAtendimentoCard(item, pautaId, userName, index)));
    },

    createEmAtendimentoCard(item, pautaId, userName, index) {
        const card = document.createElement('div');
        card.className = 'relative bg-white p-4 rounded-xl border border-gray-100 mb-3';
        const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
        const link = `${baseUrl}/atendimento_externo.html?pautaId=${pautaId}&assistidoId=${item.id}&collaboratorName=${encodeURIComponent(userName)}`;
        
        card.innerHTML = `
            <p class="font-bold text-xl text-gray-800">${index + 1}. ${escapeHTML(item.name)}</p>
            <p class="text-xs mt-1">Colaborador: ${escapeHTML(item.assignedCollaborator?.name || 'Não atribuído')}</p>
            <div class="mt-4 grid grid-cols-2 gap-2">
                <button data-id="${item.id}" class="delegate-finalization-btn bg-indigo-500 text-white font-bold py-2 rounded text-xs">Delegar</button>
                <button onclick="window.open('${link}', '_blank')" class="bg-green-500 text-white font-bold py-2 rounded text-xs">Finalizar</button>
            </div>`;
        return card;
    },

    renderAtendidosColumn(items) {
        const container = document.getElementById('atendidos-list');
        if (container) items.forEach(item => container.appendChild(this.createAtendidoCard(item)));
    },

    createAtendidoCard(item) {
        const card = document.createElement('div');
        card.className = 'relative bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-4';
        
        const isConfirmed = item.isConfirmed ? 'bg-green-500 border-green-500 text-white' : 'bg-slate-100 text-slate-300';
        
        card.innerHTML = `
            <div class="flex justify-between items-start">
                <p class="font-bold text-lg text-gray-800">${escapeHTML(item.name)}</p>
                <button data-id="${item.id}" class="toggle-confirmed-atendido w-6 h-6 rounded-full border ${isConfirmed}">✓</button>
            </div>
            <p class="text-xs mt-1">Assunto: <b>${escapeHTML(item.subject)}</b></p>
            ${item.processNumber ? `<p class="text-[10px] font-mono text-blue-600 mt-1 bg-blue-50 px-2 rounded w-fit">Nº ${item.processNumber}</p>` : ''}
            <div class="flex justify-between items-center text-[10px] mt-4 pt-3 border-t">
                <button data-id="${item.id}" class="manage-demands-btn text-blue-500 font-bold">Demandas</button>
                <button data-id="${item.id}" class="return-from-atendido-btn bg-orange-500 text-white px-4 py-1 rounded font-bold uppercase">Voltar</button>
            </div>`;
        return card;
    },

    renderFaltososColumn(items) {
        const container = document.getElementById('faltosos-list');
        if (container) items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'relative bg-red-50 p-4 rounded-lg border border-red-100 mb-2 opacity-80';
            card.innerHTML = `<p class="font-bold text-gray-700 text-sm">${escapeHTML(item.name)}</p><button data-id="${item.id}" class="return-to-pauta-from-faltoso-btn mt-2 w-full bg-white text-red-500 border py-1 rounded text-[9px] font-bold uppercase">Voltar p/ Pauta</button>`;
            container.appendChild(card);
        });
    },

    renderDistribuicaoColumn(items, pautaId, userName) {
        const container = document.getElementById('distribuicao-list');
        if (container) items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'relative bg-cyan-50 p-4 rounded-lg border border-cyan-200 mb-2';
            card.innerHTML = `
                <p class="font-bold text-gray-800 text-sm">${escapeHTML(item.name)}</p>
                <button onclick="window.open('./atendimento_externo.html?pautaId=${pautaId}&assistidoId=${item.id}&collaboratorName=${encodeURIComponent(userName)}', '_blank')" class="w-full bg-cyan-600 text-white text-[10px] font-bold py-2 rounded mt-3 uppercase">Painel de Protocolo</button>`;
            container.appendChild(card);
        });
    },

    /**
     * NOVOS RENDERIZADORES DE REVISÃO
     */
    renderReviewColumns(lists, app) {
        const isDefensor = app.currentUserCargo === 'Defensor(a)';

        // Em Revisão
        const revCont = document.getElementById('em-revisao-list');
        if (revCont) lists.emRevisao.forEach(item => {
            const card = document.createElement('div');
            card.className = "bg-white p-3 rounded-lg shadow-sm mb-2 border-l-4 border-purple-500";
            card.innerHTML = `
                <p class="font-bold text-sm text-gray-800">${escapeHTML(item.name)}</p>
                <p class="text-[10px] text-gray-400 uppercase">Enviado por: ${escapeHTML(item.reviewData?.sentBy || '---')}</p>
                ${isDefensor ? `<button onclick="window.app.abrirModalRevisaoDefensor('${item.id}')" class="mt-2 w-full bg-purple-600 text-white font-bold py-1.5 rounded text-[10px] uppercase">Revisar</button>` : ''}`;
            revCont.appendChild(card);
        });

        // Aguardando Correção
        const corCont = document.getElementById('aguardando-correcao-list');
        if (corCont) lists.aguardandoCorrecao.forEach(item => {
            const card = document.createElement('div');
            card.className = "bg-white p-3 rounded-lg shadow-sm mb-2 border-l-4 border-red-500";
            card.innerHTML = `
                <p class="font-bold text-sm text-gray-800">${escapeHTML(item.name)}</p>
                <div class="mt-1 p-2 bg-red-50 text-[10px] text-red-600 italic rounded">⚠️ ${escapeHTML(item.reviewMotivoDevolucao)}</div>
                <button onclick="window.app.abrirModalReenviar('${item.id}')" class="mt-2 w-full bg-red-600 text-white font-bold py-1.5 rounded text-[10px] uppercase">Corrigir e Reenviar</button>`;
            corCont.appendChild(card);
        });

        // Aguardando Número e Distribuídos seguem lógica similar...
        this.renderGenericColumn('aguardando-numero-list', lists.aguardandoNumero, 'border-indigo-500');
        this.renderGenericColumn('distribuido-list', lists.distribuido, 'border-teal-500');
    },

    renderGenericColumn(id, items, borderColor) {
        const cont = document.getElementById(id);
        if (cont) items.forEach(item => {
            const card = document.createElement('div');
            card.className = `bg-white p-3 rounded-lg shadow-sm mb-2 border-l-4 ${borderColor}`;
            card.innerHTML = `<p class="font-bold text-sm text-gray-800">${escapeHTML(item.name)}</p>${item.processNumber ? `<p class="text-[10px] font-mono text-blue-600">Nº ${item.processNumber}</p>` : ''}`;
            cont.appendChild(card);
        });
    },

    updateReviewStats(all) {
        const panel = document.getElementById('review-stats-summary');
        if (!panel) return;
        const rev = all.filter(a => a.status === 'emRevisao').length;
        const num = all.filter(a => a.status === 'aguardandoNumero').length;
        const cor = all.filter(a => a.status === 'aguardandoCorrecao').length;
        panel.innerHTML = `
            <div class="flex flex-wrap gap-3 bg-white p-3 rounded-lg border border-purple-100 shadow-sm mb-4">
                <span class="text-[10px] font-black text-purple-600 uppercase">🔍 Revisão: ${rev}</span>
                <span class="text-[10px] font-black text-indigo-600 uppercase">⏳ Aguard. Nº: ${num}</span>
                <span class="text-[10px] font-black text-orange-600 uppercase">✏️ Correção: ${cor}</span>
            </div>`;
    },

    // --- AUXILIARES ---

    getSearchTerms() {
        return {
            pauta: normalizeText(document.getElementById('pauta-search')?.value || ''),
            aguardando: normalizeText(document.getElementById('aguardando-search')?.value || ''),
            emAtendimento: normalizeText(document.getElementById('em-atendimento-search')?.value || ''),
            atendidos: normalizeText(document.getElementById('atendidos-search')?.value || ''),
            faltosos: normalizeText(document.getElementById('faltosos-search')?.value || ''),
            distribuicao: normalizeText(document.getElementById('distribuicao-search')?.value || ''),
            emRevisao: normalizeText(document.getElementById('em-revisao-search')?.value || ''),
            aguardandoNumero: normalizeText(document.getElementById('aguardando-numero-search')?.value || ''),
            aguardandoCorrecao: normalizeText(document.getElementById('aguardando-correcao-search')?.value || ''),
            distribuido: normalizeText(document.getElementById('distribuido-search')?.value || '')
        };
    },

    searchFilter(assisted, term) {
        if (!term) return true;
        return normalizeText(assisted.name || '').includes(term) || normalizeText(assisted.subject || '').includes(term);
    },

    clearContainers() {
        const ids = ['pauta-list', 'aguardando-list', 'em-atendimento-list', 'atendidos-list', 'faltosos-list', 'distribuicao-list', 'em-revisao-list', 'aguardando-numero-list', 'aguardando-correcao-list', 'distribuido-list'];
        ids.forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; });
    },

    renderEmptyMessages() {
        ['pauta-list', 'aguardando-list', 'atendidos-list'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '<p class="text-gray-400 text-center p-4 text-xs">Nenhum registro</p>';
        });
    },

    updateCounters(lists) {
        const keys = ['pauta', 'aguardando', 'em-atendimento', 'atendidos', 'faltosos', 'distribuicao', 'em-revisao', 'aguardando-numero', 'aguardando-correcao', 'distribuido'];
        keys.forEach(k => {
            const el = document.getElementById(`${k}-count`);
            if (el) el.textContent = lists[k.replace(/-([a-z])/g, g => g[1].toUpperCase())]?.length || 0;
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
            }
        };
        bindModal('privacy-btn-footer', 'privacy-policy-modal', ['close-policy-modal-btn-x', 'close-policy-modal-btn']);
        bindModal('manual-btn-footer', 'manual-modal', ['close-manual-modal-x', 'close-manual-modal-btn']);
        bindModal('terms-btn-footer', 'terms-modal', ['close-terms-modal-x', 'close-terms-modal-btn']);
    }
};
