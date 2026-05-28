// js/ui.js - CORE VISUAL E MOTOR DE RENDERIZAÇÃO (PADRÃO SIGEP)

import { escapeHTML, normalizeText, showNotification } from './utils.js';
import { PautaService } from './pauta.js';
import { PainelGeralService } from './painelGeralService.js';

export const UIService = {
    showScreen(screenName) {
        document.getElementById('loading-container')?.classList.toggle('hidden', screenName !== 'loading');
        document.getElementById('login-container')?.classList.toggle('hidden', screenName !== 'login');
        document.getElementById('modo-selection-screen')?.classList.toggle('hidden', screenName !== 'modoSelection');
        document.getElementById('atendimento-externo-container')?.classList.toggle('hidden', screenName !== 'atendimentoExterno');
        document.getElementById('pauta-selection-container')?.classList.toggle('hidden', screenName !== 'pautaSelection');
        document.getElementById('app-container')?.classList.toggle('hidden', screenName !== 'app');
        document.getElementById('dashboard-container')?.classList.toggle('hidden', screenName !== 'dashboard');
        document.getElementById('recepcao-central-container')?.classList.toggle('hidden', screenName !== 'recepcaoCentral');
        document.getElementById('admin-container')?.classList.toggle('hidden', screenName !== 'admin');

        if (screenName !== 'loading' && screenName !== 'login') {
            localStorage.setItem('lastScreen', screenName);
        }
    },

    isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    },

    closeAllQuickMenus(exceptId = null) {
        document.querySelectorAll('.quick-menu').forEach(menu => {
            if (menu.id !== exceptId) {
                menu.classList.add('hidden');
                const toggleId = menu.id.replace('quick-menu-', 'quick-toggle-');
                const toggle = document.getElementById(toggleId);
                if (toggle) {
                    toggle.setAttribute('aria-expanded', 'false');
                    toggle.setAttribute('aria-label', 'Abrir menu rápido');
                }
            }
        });
    },

    canPerformAction(actionKey) {
        if (this._actionTimeouts && this._actionTimeouts[actionKey]) return false;
        this._actionTimeouts = this._actionTimeouts || {};
        this._actionTimeouts[actionKey] = true;
        setTimeout(() => delete this._actionTimeouts[actionKey], 800);
        return true;
    },

    getAttendantName(item) {
        if (!item) return 'Não informado';
        
        if (item.attendedBy) {
            const name = typeof item.attendedBy === 'object' ? (item.attendedBy.nome || item.attendedBy.name) : item.attendedBy;
            if (name) return String(name).trim();
        }

        if (item.assignedCollaborator && item.assignedCollaborator.name) {
            return String(item.assignedCollaborator.name).trim();
        }
        
        if (item.attendant) {
            const name = typeof item.attendant === 'object' ? (item.attendant.nome || item.attendant.name) : item.attendant;
            if (name) return String(name).trim();
        }
        
        return 'Não informado';
    },

    preencherSelectColaboradores(app, selectId) {
        const select = document.getElementById(selectId);
        if (!select) return;
        const currentVal = select.value;
        select.innerHTML = '<option value="">-- Selecione um profissional --</option>';
        if (app.colaboradores && app.colaboradores.length > 0) {
            app.colaboradores.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.nome;
                opt.textContent = `${c.nome} (${c.cargo})`;
                select.appendChild(opt);
            });
        }
        if (currentVal) select.value = currentVal;
    },

    preencherListaColaboradoresModal(app) {
        if (window.CollaboratorService && typeof window.CollaboratorService.renderModalList === 'function') {
            window.CollaboratorService.renderModalList(app);
        } else if (app.colaboradores) {
            const container = document.getElementById('collaborator-selection-list');
            if (container) {
                container.innerHTML = '';
                app.colaboradores.forEach(c => {
                    const btn = document.createElement('button');
                    btn.className = "w-full text-left p-3 mb-2 bg-white border border-gray-200 rounded-lg hover:bg-blue-50 transition shadow-sm font-semibold text-gray-700";
                    btn.innerHTML = `<span class="text-blue-600 mr-2">👤</span> ${escapeHTML(c.nome)} <span class="text-xs text-gray-400 font-normal ml-1">- ${escapeHTML(c.cargo)}</span>`;
                    btn.onclick = () => {
                        window.selectedCollaboratorId = c.id || c.nome;
                        window.selectedCollaboratorName = c.nome;
                        document.getElementById('confirm-select-collaborator-btn')?.click();
                    };
                    container.appendChild(btn);
                });
            }
        }
    },

    renderPautaFilters(containerId, activeFilter, onFilterChange, app) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        const isPeriodo = activeFilter === 'periodo';
        const isUnidades = activeFilter === 'unidades';
        
        // Obter unidades vinculadas do usuário atual (campo CORRETO: unidades)
        const userUnidades = app.currentUser?.unidades || [];
        const hasUnidadesVinculadas = userUnidades.length > 0;
        
        const dateFiltersHTML = `...`; // (mantém o mesmo)
        
        const unidadesFiltersHTML = `
            <div id="unidades-filters-container" class="flex flex-wrap gap-4 mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200 ${isUnidades ? '' : 'hidden'}">
                <div class="flex-1 min-w-[250px]">
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Selecione a Unidade</label>
                    <select id="filter-unidade-select" class="w-full p-2 border border-gray-300 rounded-lg text-sm">
                        <option value="todas">Todas as unidades vinculadas</option>
                        ${userUnidades.map(unidade => `<option value="${escapeHTML(unidade.unidadeNome)}">${escapeHTML(unidade.unidadeNome)}</option>`).join('')}
                    </select>
                </div>
                <div class="flex-1 min-w-[200px]">
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Status da Pauta</label>
                    <select id="filter-unidade-status" class="w-full p-2 border border-gray-300 rounded-lg text-sm">
                        <option value="todas">Todas</option>
                        <option value="ativas">Ativas (não expiradas)</option>
                        <option value="expiradas">Expiradas</option>
                    </select>
                </div>
                <div class="flex items-end">
                    <button id="aplicar-filtro-unidades" class="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-indigo-700 transition shadow-md">
                        Aplicar Filtro
                    </button>
                </div>
            </div>
        `;
        
        container.innerHTML = `
            <div class="flex flex-col items-center mb-6">
                <div class="w-full max-w-sm relative">
                    <label for="main-pauta-filter" class="block text-xs font-bold text-gray-500 uppercase mb-1.5 ml-1 text-center w-full">Filtro de Exibição</label>
                    <div class="relative">
                        <select id="main-pauta-filter" class="w-full p-3 pl-4 pr-10 appearance-none border border-gray-300 rounded-xl text-sm bg-white shadow-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 font-semibold outline-none transition cursor-pointer text-gray-700">
                            <option value="all" ${activeFilter === 'all' ? 'selected' : ''}> Mostrar Todas as Pautas</option>
                            <option value="active" ${activeFilter === 'active' ? 'selected' : ''}> Pautas com prazo</option>
                            <option value="expired" ${activeFilter === 'expired' ? 'selected' : ''}> Pautas expiradas</option>
                            <option value="my" ${activeFilter === 'my' ? 'selected' : ''}> Criadas por mim</option>
                            <option value="shared" ${activeFilter === 'shared' ? 'selected' : ''}> Compartilhadas</option>
                            ${hasUnidadesVinculadas ? `<option value="unidades" ${activeFilter === 'unidades' ? 'selected' : ''}> Minhas Unidades Vinculadas</option>` : ''}
                            <option value="periodo" ${activeFilter === 'periodo' ? 'selected' : ''}> Filtrar por Período / Tipo</option>
                        </select>
                        <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-500">
                            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                        </div>
                    </div>
                </div>
            </div>
            ${dateFiltersHTML}
            ${hasUnidadesVinculadas ? unidadesFiltersHTML : ''}
        `;
        
        const filterSelect = document.getElementById('main-pauta-filter');
        const periodoContainer = document.getElementById('periodo-filters-container');
        const unidadesContainer = document.getElementById('unidades-filters-container');
        
        if (filterSelect) {
            filterSelect.addEventListener('change', (e) => {
                const val = e.target.value;
                
                // Esconder todos os containers de filtro
                if (periodoContainer) periodoContainer.classList.add('hidden');
                if (unidadesContainer) unidadesContainer.classList.add('hidden');
                
                // Mostrar o container apropriado
                if (val === 'periodo' && periodoContainer) {
                    periodoContainer.classList.remove('hidden');
                } else if (val === 'unidades' && unidadesContainer) {
                    unidadesContainer.classList.remove('hidden');
                }
                
                onFilterChange(val);
            });
        }
        
        const btnAplicarPeriodo = document.getElementById('aplicar-filtro-periodo');
        if (btnAplicarPeriodo) {
            btnAplicarPeriodo.addEventListener('click', () => {
                if (app && typeof app.loadPautasWithFilter === 'function') {
                    const dataInicial = document.getElementById('filter-data-inicial')?.value;
                    const dataFinal = document.getElementById('filter-data-final')?.value;
                    const tipoPauta = document.getElementById('filter-tipo-pauta')?.value;
                    app.loadPautasWithFilter({ tipo: 'periodo', dataInicial, dataFinal, tipoPauta });
                }
            });
        }
        
        const btnAplicarUnidades = document.getElementById('aplicar-filtro-unidades');
        if (btnAplicarUnidades) {
            btnAplicarUnidades.addEventListener('click', () => {
                if (app && typeof app.loadPautasWithFilter === 'function') {
                    const unidadeSelecionada = document.getElementById('filter-unidade-select')?.value;
                    const statusUnidade = document.getElementById('filter-unidade-status')?.value;
                    app.loadPautasWithFilter({ 
                        tipo: 'unidades', 
                        unidade: unidadeSelecionada,
                        status: statusUnidade
                    });
                }
            });
        }
    },

    togglePautaLock(app) {
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
                    element.querySelectorAll('input, button, a, select, textarea').forEach(el => el.disabled = true);
                } else {
                    element.classList.remove('pointer-events-none', 'opacity-50');
                    element.querySelectorAll('input, button, a, select, textarea').forEach(el => el.disabled = false);
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
        
        const cardActionButtons = document.querySelectorAll('.assisted-card button:not(.quick-action-toggle), .assisted-card select');
        cardActionButtons.forEach(btn => {
            btn.disabled = isClosed;
        });
    
        const closedAlert = document.getElementById('closed-pauta-alert');
        const closeBtn = document.getElementById('close-pauta-btn');
        const reopenBtn = document.getElementById('reopen-pauta-btn');
        
        if (closedAlert) {
            if (isClosed) {
                closedAlert.classList.remove('hidden');
            } else {
                closedAlert.classList.add('hidden');
            }
        }
        
        if (closeBtn) {
            if (isClosed) {
                closeBtn.classList.add('hidden');
            } else {
                closeBtn.classList.remove('hidden');
            }
        }
        
        if (reopenBtn) {
            if (isClosed) {
                reopenBtn.classList.remove('hidden');
            } else {
                reopenBtn.classList.add('hidden');
            }
        }
    
        const isOwner = app.auth?.currentUser?.uid === app.currentPautaOwnerId;
        if (!isOwner) {
            if (closeBtn) closeBtn.classList.add('hidden');
            if (reopenBtn) reopenBtn.classList.add('hidden');
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

    renderAssistedLists(app) {
        if (!app) return;
        
        if (typeof PainelGeralService !== 'undefined') {
            const painelModal = document.getElementById('painel-geral-externo-modal'); 
            if (painelModal && !painelModal.classList.contains('hidden')) {
                PainelGeralService.atualizarConteudo(app);
            }
        }

        const allAssisted = app.allAssisted || [];
        const currentPautaData = app.currentPautaData;
        const colaboradores = app.colaboradores || [];

        if (allAssisted.length === 0) {
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
            if (distribuicaoList) distribuicaoList.innerHTML = '<p class="text-gray-400 text-center p-4 text-xs">Nenhum aguardando distribuição/correção</p>';
            
            this.updateCounters({ pauta: 0, aguardando: 0, emAtendimento: 0, atendidos: 0, faltosos: 0, distribuicao: 0 });
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
            distribuicao: allAssisted.filter(a => (a.status === 'aguardandoDistribuicao' || a.status === 'aguardandoCorrecao' || a.status === 'aguardandoNumero') && this.searchFilter(a, searchTerms.distribuicao))
        };

        lists.pauta.sort((a, b) => (a.scheduledTime || '23:59').localeCompare(b.scheduledTime || '23:59'));
        lists.atendidos.sort((a, b) => new Date(b.attendedAt || b.lastActionTimestamp) - new Date(a.attendedAt || a.lastActionTimestamp)); 
        lists.faltosos.sort((a, b) => (a.scheduledTime || '00:00').localeCompare(b.scheduledTime || '00:00')); 
        lists.emAtendimento.sort((a, b) => new Date(a.inAttendanceTime) - new Date(b.inAttendanceTime)); 
        
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
        
        const callNextBtn = document.getElementById('call-next-assisted-btn');
        const isApoio = app.currentUser?.role === 'apoio';
        if (callNextBtn) {
            if (currentPautaData?.type === 'multisala' || isApoio) {
                callNextBtn.classList.add('hidden');
            } else {
                callNextBtn.classList.remove('hidden');
            }
        }
        
        setTimeout(() => { if (typeof PautaService.setupManualSort === 'function') PautaService.setupManualSort(app); }, 100); 
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
        
        const termLower = normalizeText(term);

        const arrivalTimeFormatted = assisted.arrivalTime ? 
            new Date(assisted.arrivalTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
        
        const attendedTimeFormatted = assisted.attendedAt ? 
            new Date(assisted.attendedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';

        const inAttendanceTimeFormatted = assisted.inAttendanceTime ? 
            new Date(assisted.inAttendanceTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';

        const attendantName = this.getAttendantName(assisted);
        const demandsText = assisted.demandas?.descricoes ? assisted.demandas.descricoes.join(' ') : '';
        
        const searchableString = normalizeText(`
            ${assisted.numeroAgendamento || assisted.assistedManualNumAgendamento || ''}
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
        const containers = ['pauta-list', 'aguardando-list', 'em-atendimento-list', 'atendidos-list', 'faltosos-list', 'distribuicao-list'];
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

        const numAgendamento = item.numeroAgendamento || item.numAgendamento || item.assistedManualNumAgendamento || '';

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

            <p class="font-bold text-lg text-gray-800 leading-tight pr-6">${escapeHTML(item.name || '').toUpperCase()}</p>
            
            <div class="mt-2 space-y-0.5 text-xs text-gray-700">
                ${numAgendamento ? `<p class="text-blue-700 font-bold mb-1 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 w-max">📅 Nº Agend.: ${escapeHTML(numAgendamento)}</p>` : ''}
                <p>Assunto: <span class="font-bold uppercase text-slate-700">${escapeHTML(item.subject || 'Não informado')}</span></p>
                <p>Agendado: <span class="font-bold text-slate-800">${item.scheduledTime || '--:--'}</span></p>
            </div>

            <div class="mt-4 space-y-2">
                <div class="grid grid-cols-2 gap-2">
                    <button data-id="${item.id}" class="check-in-btn bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 rounded-lg text-xs transition active:scale-95 shadow-sm uppercase tracking-wide">
                        Marcar Chegada
                    </button>
                    <button data-id="${item.id}" class="faltou-btn bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2.5 rounded-lg text-xs transition active:scale-95 shadow-sm uppercase tracking-wide" ${canEdit ? '' : 'disabled'}>
                        Faltou
                    </button>
                </div>
                <button data-id="${item.id}" class="edit-assisted-btn w-full bg-slate-500 hover:bg-slate-600 text-white font-bold py-2.5 rounded-lg text-xs transition active:scale-95 shadow-sm uppercase tracking-wide" ${canEdit ? '' : 'disabled'}>
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
            container.innerHTML = '<p class="text-gray-400 text-center p-4 text-xs">Nenhum agendamento aguardando</p>';
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
            const numAgendamento = item.numAgendamento || item.numeroAgendamento || item.assistedManualNumAgendamento || '';

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

            let roomDropdownHtml = '';
            if (currentPautaData?.type === 'multisala') {
                const availableRooms = currentPautaData.rooms || currentPautaData.customRooms || [];
                
                if (availableRooms.length > 0 && canEditPriority) { 
                    const options = availableRooms.map(r => `<option value="${escapeHTML(r)}" ${item.room === r ? 'selected' : ''}>${escapeHTML(r)}</option>`).join('');
                    roomDropdownHtml = `
                        <div class="ml-auto flex flex-col items-end">
                            <label class="text-[8px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Mudar Sala</label>
                            <select class="change-room-select bg-purple-50 hover:bg-purple-100 text-purple-700 text-[10px] px-2 py-1 rounded-md font-bold border border-purple-200 outline-none cursor-pointer focus:ring-1 focus:ring-purple-500 max-w-[130px] truncate transition-colors shadow-sm" title="Mudar Sala do Assistido">
                                <option value="" ${!item.room ? 'selected' : ''}>Sem Sala</option>
                                ${options}
                            </select>
                        </div>
                    `;
                } else if (item.room) {
                    roomDropdownHtml = `
                        <div class="ml-auto flex flex-col items-end">
                            <label class="text-[8px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Sala Atual</label>
                            <span class="bg-purple-50 text-purple-700 text-[10px] px-2 py-1 rounded-md font-bold border border-purple-200 shadow-sm">${escapeHTML(item.room)}</span>
                        </div>
                    `;
                }
            }

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

            const atenderButton = canAttend
                ? `<button data-id="${item.id}" data-name="${escapeHTML(nomeSeguro)}" class="${currentPautaData?.useDelegationFlow ? 'select-collaborator-btn' : 'attend-directly-from-aguardando-btn'} bg-blue-600 text-white font-bold py-2 rounded-lg hover:bg-blue-700 text-xs shadow-sm uppercase tracking-wide">Atender</button>`
                : '';

            const actionButtonsHTML = `
                <div class="absolute top-2 right-10 flex items-center">
                    <div class="relative">
                        <button data-id="${item.id}" class="quick-action-toggle text-gray-400 hover:text-blue-600 p-1 rounded-full transition-colors" title="Opções de atendimento" aria-expanded="false" aria-controls="quick-menu-${item.id}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
                                <path d="M3 9.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>
                            </svg>
                        </button>
                        <div id="quick-menu-${item.id}" class="quick-menu hidden absolute right-0 mt-1 w-40 bg-white rounded-lg shadow-xl border border-gray-200 z-30 py-1" role="menu" aria-orientation="vertical" aria-labelledby="quick-toggle-${item.id}">
                            <button data-id="${item.id}" data-tipo="reagendar" class="quick-action-item w-full text-left px-3 py-2 text-xs hover:bg-amber-50 hover:text-amber-700 flex items-center gap-2" role="menuitem"><span>🔄</span> Reagendar</button>
                            <button data-id="${item.id}" data-tipo="agendar" class="quick-action-item w-full text-left px-3 py-2 text-xs hover:bg-emerald-50 hover:text-emerald-700 flex items-center gap-2" role="menuitem"><span>📅</span> Agendar</button>
                            <button data-id="${item.id}" data-tipo="consulta" class="quick-action-item w-full text-left px-3 py-2 text-xs hover:bg-purple-50 hover:text-purple-700 flex items-center gap-2" role="menuitem"><span>🔍</span> Consulta</button>
                            <button data-id="${item.id}" data-tipo="outros" class="quick-action-item w-full text-left px-3 py-2 text-xs hover:bg-gray-50 hover:text-gray-700 flex items-center gap-2" role="menuitem"><span>⚙️</span> Outros</button>
                            <button data-id="${item.id}" class="edit-assisted-btn quick-action-item w-full text-left px-3 py-2 text-xs hover:bg-gray-50 hover:text-gray-700 flex items-center gap-2" role="menuitem"><span>✏️</span> Editar Assistido</button>
                            <button data-id="${item.id}" class="view-details-btn quick-action-item w-full text-left px-3 py-2 text-xs hover:bg-gray-50 hover:text-gray-700 flex items-center gap-2" role="menuitem"><span>👁️</span> Ver Detalhes</button>
                        </div>
                    </div>
                </div>
            `;

            card.innerHTML = `
                ${numeroBadge}
                ${canAttend ? actionButtonsHTML : ''} 
                ${canDelete ? `
                <button data-id="${item.id}" class="delete-btn absolute top-2 right-2 text-gray-300 hover:text-red-500 p-1 rounded-full transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M11 1.5v1h3.5a.5.5 0 0 1 0 1h-.538l-.853 10.66A2 2 0 0 1 11.115 16h-6.23a2 2 0 0 1-1.994-1.84L2.038 3.5H1.5a.5.5 0 0 1 0-1H5v-1A1.5 1.5 0 0 1 6.5 0h3A1.5 1.5 0 0 1 11 1.5Zm-5 0v1h4v-1a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5ZM4.5 5.029l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06Zm3 0l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06Zm3 .5a.5.5 0 0 0-1 0v8.5a.5.5 0 0 0 1 0v-8.5Z"/>
                    </svg>
                </button>` : ''}
                <div class="flex flex-col h-full">
                    ${item.priority === 'URGENTE' ? `<div class="mb-1 text-[10px] font-black text-red-600 uppercase flex items-center gap-1">🚨 ${escapeHTML(priorityReasonSeguro)}</div>` : ''}
                    <p class="font-bold text-lg text-gray-800 leading-tight mb-1 truncate pr-14">${escapeHTML(nomeSeguro)}</p>
                    
                    ${numAgendamento ? `<p class="text-xs text-blue-700 font-bold mb-1.5 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 w-max tracking-wide shadow-sm">📅 Nº Agend.: ${escapeHTML(numAgendamento)}</p>` : ''}
                    
                    <p class="text-xs text-gray-600 mb-2">Assunto: <strong>${escapeHTML(assuntoSeguro)}</strong></p>
                    <div class="flex items-end justify-between w-full mb-2 gap-2">
                        <div class="flex flex-wrap items-center gap-2">
                            ${timeInfoHtml}
                        </div>
                        ${roomDropdownHtml}
                    </div>
                    ${docStatusHtml}
                    <div class="mt-4 grid grid-cols-2 gap-2">
                        ${atenderButton ? atenderButton : ''}
                        <button data-id="${item.id}" class="priority-btn ${item.priority === 'URGENTE' ? 'bg-orange-600' : 'bg-red-500'} text-white font-semibold py-2 rounded-lg text-xs uppercase shadow-sm ${atenderButton ? '' : 'col-span-2'}" ${canEditPriority ? '' : 'disabled'}>${item.priority === 'URGENTE' ? 'Urgência' : 'Prioridade'}</button>
                        <button data-id="${item.id}" class="return-to-pauta-btn col-span-2 bg-gray-200 text-gray-700 font-bold py-1.5 rounded-lg text-[10px] hover:bg-gray-300 transition-colors uppercase tracking-wide">Voltar para Pauta</button>
                    </div>
                    <button data-id="${item.id}" class="view-details-btn text-indigo-500 hover:text-indigo-700 text-[11px] font-bold mt-2 text-center underline">Ver Detalhes</button>
                </div>
                ${this._getStandardizedFooterHtml(item)}
            `;
            
            const roomSelect = card.querySelector('.change-room-select');
            if (roomSelect) {
                roomSelect.addEventListener('change', (e) => {
                    const newRoom = e.target.value || null;
                    if (window.app && window.app.db && window.app.currentPauta) {
                        PautaService.updateStatus(
                            window.app.db,
                            window.app.currentPauta.id,
                            item.id,
                            { room: newRoom },
                            window.app.currentUserName || 'Sistema'
                        );
                    }
                });
            }
            
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

            const isDelegated = !!(item.assignedCollaborator && item.assignedCollaborator.name);
            const canDelegate = canDelegateOrFinalize && !isDelegated;
            const delegateBtnClass = isDelegated ? 'bg-indigo-300 cursor-not-allowed' : 'bg-indigo-500 hover:bg-indigo-600';

            const card = document.createElement('div');
            card.className = `assisted-card relative bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-3`;
            card.setAttribute('data-id', item.id);
            
            const startTime = item.inAttendanceTime ? 
                new Date(item.inAttendanceTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
            
            const atendenteNome = this.getAttendantName(item);
            const numAgendamento = item.numAgendamento || item.numeroAgendamento || item.assistedManualNumAgendamento || '';

            const historicoTransferenciaHtml = item.historicoTransferencia 
                ? `<div class="mt-2 bg-orange-50 border border-orange-200 text-orange-800 text-[10px] p-2 rounded flex items-center gap-1 font-medium shadow-sm">
                       <span class="text-xs">🔄</span> 
                       <span>${escapeHTML(item.historicoTransferencia)}</span>
                   </div>` 
                : '';

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

            const buttonsContainerHtml = canDelegateOrFinalize 
                ? `<div class="mt-4 flex flex-col gap-2">
                        <div class="grid grid-cols-2 gap-2">
                            <button id="btn-delegar-card" data-id="${item.id}" data-name="${escapeHTML(item.name || '')}" data-collaborator-name="${escapeHTML(atendenteNome)}" class="select-collaborator-btn ${delegateBtnClass} text-white font-bold py-2 rounded-lg text-xs shadow-sm transition active:scale-95 uppercase tracking-wide" ${canDelegate ? '' : 'disabled'}>
                                Delegar
                            </button>
                            <button data-id="${item.id}" class="attend-directly-from-aguardando-btn bg-green-600 text-white font-bold py-2 rounded-lg text-xs shadow-sm transition active:scale-95 uppercase tracking-wide">
                                Finalizar / Avançar
                            </button>
                        </div>
                        <button data-id="${item.id}" class="return-to-aguardando-from-emAtendimento-btn bg-slate-400 hover:bg-slate-500 text-white font-bold py-2 rounded-lg text-xs shadow-sm transition active:scale-95 uppercase tracking-wide">
                            Mover para Fila
                        </button>
                        <button data-id="${item.id}" class="view-details-btn text-indigo-500 hover:text-indigo-700 text-[11px] font-bold mt-1 text-center underline w-full">
                            Ver Detalhes
                        </button>
                   </div>`
                : `<div class="mt-4 flex flex-col gap-2">
                        <button data-id="${item.id}" class="view-details-btn text-indigo-500 hover:text-indigo-700 text-xs font-bold mt-1 text-center border p-2 rounded-lg bg-gray-50 hover:bg-gray-100">
                            👁️ Ver Detalhes / Checklist
                        </button>
                   </div>`;

            card.innerHTML = `
                ${canDelete ? `
                <button data-id="${item.id}" class="delete-btn absolute top-2 right-2 text-gray-300 hover:text-red-500">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M11 1.5v1h3.5a.5.5 0 0 1 0 1h-.538l-.853 10.66A2 2 0 0 1 11.115 16h-6.23a2 2 0 0 1-1.994-1.84L2.038 3.5H1.5a.5.5 0 0 1 0-1H5v-1A1.5 1.5 0 0 1 6.5 0h3A1.5 1.5 0 0 1 11 1.5Zm-5 0v1h4v-1a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5ZM4.5 5.029l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06Zm3 0l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06Zm3 .5a.5.5 0 0 0-1 0v8.5a.5.5 0 0 0 1 0v-8.5Z"/>
                    </svg>
                </button>` : ''}

                <p class="font-bold text-lg text-gray-800 leading-tight">${index + 1}. ${escapeHTML(item.name || '')}</p>
                ${numAgendamento ? `<p class="text-xs text-blue-700 font-bold mt-1 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 w-max tracking-wide shadow-sm">📅 Nº Agend.: ${escapeHTML(numAgendamento)}</p>` : ''}
                <p class="text-xs text-gray-600 mt-1">Assunto: <strong>${escapeHTML(item.subject || 'Não informado')}</strong></p>
                <p class="text-xs text-gray-600 mt-1">Colaborador: ${escapeHTML(atendenteNome)}</p>
                <p class="text-xs text-gray-400 mt-1">Início do Tempo: ${startTime}</p>

                ${historicoTransferenciaHtml}
                ${docStatusHtml}
                ${buttonsContainerHtml}

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
            const attendedT = item.attendedAt ? 
                new Date(item.attendedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
            
            const atendenteNome = this.getAttendantName(item);
            const numAgendamento = item.numAgendamento || item.numeroAgendamento || item.assistedManualNumAgendamento || '';

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
                
                ${numAgendamento ? `<p class="text-xs md:text-sm mt-1 text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded border border-blue-100 w-max tracking-wide">Nº Agend.: ${escapeHTML(numAgendamento)}</p>` : ''}
                <p class="text-xs md:text-sm mt-1 text-gray-700">Assunto: <b>${escapeHTML(item.subject || 'Não informado')}</b></p>
                
                ${item.tipoAcaoRapida ? (() => {
                    const acaoCfg = {
                        'Reagendamento':       { icon: '🔄', bg: '#fffbeb', border: '#f59e0b', text: '#92400e', label: 'REAGENDADO' },
                        'Agendamento':         { icon: '📅', bg: '#ecfdf5', border: '#10b981', text: '#065f46', label: 'AGENDADO' },
                        'Consulta Processual': { icon: '🔍', bg: '#f5f3ff', border: '#8b5cf6', text: '#4c1d95', label: 'CONSULTA' },
                        'Outros Assuntos':     { icon: '⚙️', bg: '#f0f9ff', border: '#0ea5e9', text: '#0c4a6e', label: 'OUTROS' }
                    }[item.tipoAcaoRapida] || { icon: '⚡', bg: '#f0fdf4', border: '#22c55e', text: '#14532d', label: item.tipoAcaoRapida };
                    return `<div class="mt-1 mb-2">
                        <span style="background:${acaoCfg.bg};border:1.5px solid ${acaoCfg.border};color:${acaoCfg.text}" class="inline-flex items-center gap-1 text-[10px] md:text-xs font-black px-2 py-1 rounded-lg">
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
                    <a href="${item.arquivoPdfConteudo}" download="${item.nomeArquivoPdf || 'protocolo.pdf'}" class="mb-4 flex items-center justify-center gap-2 w-full bg-blue-50 text-blue-600 font-bold py-2 rounded-lg md:py-2.5 md:rounded-xl text-[8px] md:text-[10px] uppercase border border-blue-100 hover:bg-blue-100 transition">
                        📄 Baixar Protocolo
                    </a>
                ` : ''}

                <div class="pt-3 border-t">
                    <div class="flex flex-col sm:flex-row justify-between items-center gap-2 md:gap-3">
                        <p class="text-[7px] md:text-[9px] text-gray-400 uppercase italic">Última: ${escapeHTML(item.lastActionBy || 'Sistema')}</p>
                        <button data-id="${item.id}" class="return-from-atendido-btn w-full sm:w-auto bg-orange-500 text-white font-black py-2 md:py-3 px-4 md:px-8 rounded-lg md:rounded-xl text-[8px] md:text-[10px] uppercase shadow-md active:scale-95 transition-all" ${canRevert ? '' : 'disabled'}>
                            Mover de Volta
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
            const numAgendamento = item.numAgendamento || item.numeroAgendamento || item.assistedManualNumAgendamento || '';

            const card = document.createElement('div');
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
                
                ${numAgendamento ? `<p class="text-xs md:text-sm mt-2 text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded border border-blue-100 w-max tracking-wide">Nº Agend.: ${escapeHTML(numAgendamento)}</p>` : ''}
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

        const columnHeader = container.parentElement?.querySelector('h2');
        if (columnHeader && columnHeader.innerHTML.includes('Distribuição')) {
            columnHeader.innerHTML = columnHeader.innerHTML.replace('Distribuição', 'Distribuição / Assinatura');
        }

        if (items.length === 0) {
            container.innerHTML = '<p class="text-gray-400 text-center p-4 text-xs">Nenhum aguardando distribuição/correção</p>';
            return;
        }

        container.innerHTML = '';

        const groups = {};
        items.forEach(item => {
            const defensor = item.defensorResponsavel || 'Não Atribuído';
            if (!groups[defensor]) groups[defensor] = [];
            groups[defensor].push(item);
        });

        const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/'));

        Object.keys(groups).forEach(defensor => {
            const groupDiv = document.createElement('div');
            groupDiv.className = "mb-4 border border-cyan-200 rounded-lg overflow-hidden bg-cyan-50 shadow-sm";

            const linkPainel = `${baseUrl}/atendimento_externo.html?pautaId=${pautaId}&colab=${encodeURIComponent(defensor)}`;

            const headerHtml = `
                <div class="bg-cyan-100 p-3 border-b border-cyan-200 flex flex-col gap-2">
                    <div class="flex justify-between items-center px-1">
                        <h4 class="font-black text-cyan-800 text-sm uppercase tracking-wider flex items-center gap-1">
                            <span>👨‍⚖️</span> ${escapeHTML(defensor)}
                        </h4>
                        <span class="bg-cyan-200 text-cyan-800 text-xs font-bold px-2.5 py-0.5 rounded-full shadow-sm">${groups[defensor].length}</span>
                    </div>
                    <button onclick="navigator.clipboard.writeText('${linkPainel}'); showNotification('Link do painel copiado!', 'success');" class="w-full bg-cyan-600 text-white text-[11px] font-bold py-2 rounded-lg hover:bg-cyan-700 uppercase shadow-sm flex items-center justify-center gap-1 transition-colors">
                        <span>📋</span> Copiar Link do Painel
                    </button>
                </div>
                <div class="p-3 space-y-3 room-cards-wrapper"></div>
            `;
            groupDiv.innerHTML = headerHtml;
            const cardsWrapper = groupDiv.querySelector('.room-cards-wrapper');

            groups[defensor].forEach((item, index) => {
                const currentUserRole = window.app?.currentUser?.role;
                const canManageDistribution = currentUserRole !== 'apoio';
                const canDelete = currentUserRole === 'admin' || currentUserRole === 'superadmin';
                const numAgendamento = item.numAgendamento || item.numeroAgendamento || item.assistedManualNumAgendamento || '';

                const card = document.createElement('div');
                card.className = 'assisted-card relative bg-white p-4 rounded-xl shadow-sm border border-cyan-200 mb-3';
                card.setAttribute('data-id', item.id);
                
                const linkExterno = `${baseUrl}/atendimento_externo.html?pautaId=${pautaId}&assistidoId=${item.id}&colab=${encodeURIComponent(userName)}&token=${item.delegationToken || ''}`;

                const numeroOrdem = index + 1;
                const numeroBadge = `
                    <div class="absolute -left-2 -top-2 w-8 h-8 bg-cyan-600 text-white rounded-full flex items-center justify-center font-bold text-sm shadow-lg border-2 border-white z-20">
                        ${numeroOrdem}
                    </div>
                `;

                const badgeStatus = item.status === 'aguardandoCorrecao' 
                    ? `<span class="absolute top-2 left-8 bg-amber-100 text-amber-700 text-[9px] font-black px-2 py-0.5 rounded uppercase border border-amber-200 shadow-sm">P/ Avaliação</span>` 
                    : `<span class="absolute top-2 left-8 bg-blue-100 text-blue-700 text-[9px] font-black px-2 py-0.5 rounded uppercase border border-blue-200 shadow-sm">P/ Assinatura</span>`;

                const historicoTransferenciaHtml = item.historicoTransferencia 
                    ? `<div class="mt-2 bg-orange-50 border border-orange-200 text-orange-800 text-[10px] p-2 rounded flex items-center gap-1 font-medium shadow-sm">
                           <span class="text-xs">🔄</span> 
                           <span>${escapeHTML(item.historicoTransferencia)}</span>
                       </div>` 
                    : '';

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
                            <span class="text-[10px] font-bold text-cyan-800 bg-cyan-50 px-2 py-0.5 rounded border border-cyan-100 truncate flex items-center gap-1">
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

                const deleteBtnHtml = canDelete ? `
                    <button data-id="${item.id}" class="delete-btn absolute top-3 right-3 text-gray-300 hover:text-red-500 transition-colors z-10">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M11 1.5v1h3.5a.5.5 0 0 1 0 1h-.538l-.853 10.66A2 2 0 0 1 11.115 16h-6.23a2 2 0 0 1-1.994-1.84L2.038 3.5H1.5a.5.5 0 0 1 0-1H5v-1A1.5 1.5 0 0 1 6.5 0h3A1.5 1.5 0 0 1 11 1.5Zm-5 0v1h4v-1a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5ZM4.5 5.029l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06Zm3 0l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06Zm3 .5a.5.5 0 0 0-1 0v8.5a.5.5 0 0 0 1 0v-8.5Z"/>
                        </svg>
                    </button>` : '';

                const actionControlsHtml = canManageDistribution
                    ? `<div class="mt-4 flex flex-col gap-2">
                            <div class="grid grid-cols-2 gap-2">
                                <button onclick="window.open('${linkExterno}', '_blank')" class="w-full bg-cyan-600 text-white font-bold py-2.5 rounded-lg text-xs shadow-sm hover:bg-cyan-700 transition active:scale-95 uppercase tracking-wide">
                                    Abrir Link
                                </button>
                                <button data-id="${item.id}" class="delegate-finalization-btn bg-green-600 text-white font-bold py-2 rounded-lg text-xs shadow-sm hover:bg-green-700 transition active:scale-95 uppercase tracking-wide">
                                    Concluir Protocolo
                                </button>
                            </div>
                            <button data-id="${item.id}" class="return-to-aguardando-from-dist-btn w-full bg-slate-100 text-slate-600 border border-slate-200 font-bold py-2 rounded-lg text-xs shadow-sm hover:bg-slate-200 transition active:scale-95 uppercase tracking-wide">
                                Reverter para Fila
                            </button>
                       </div>`
                    : `<div class="mt-4">
                            <button data-id="${item.id}" class="view-details-btn text-indigo-500 hover:text-indigo-700 text-xs font-bold w-full border p-2 rounded-lg bg-gray-50 hover:bg-gray-100">
                                👁️ Ver Detalhes / Checklist
                            </button>
                       </div>`;

                card.innerHTML = `
                    ${numeroBadge}
                    ${badgeStatus}
                    ${deleteBtnHtml}
                    
                    <div class="pr-8 pt-4">
                        <p class="font-bold text-lg text-gray-800 leading-tight">${escapeHTML(item.name || '')}</p>
                    </div>

                    <div class="mt-2 space-y-1">
                        ${numAgendamento ? `<p class="text-xs text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded border border-blue-100 w-max tracking-wide shadow-sm">📅 Nº Agend.: ${escapeHTML(numAgendamento)}</p>` : ''}
                        <p class="text-xs text-gray-600">Assunto: <strong>${escapeHTML(item.subject || 'Não informado')}</strong></p>
                        ${item.numeroProcesso ? `<p class="text-xs text-blue-700 font-bold">Nº Proc: ${escapeHTML(item.numeroProcesso)}</p>` : ''}
                    </div>

                    ${historicoTransferenciaHtml}
                    ${docStatusHtml}
                    
                    ${item.notasRevisao ? `
                        <div class="mt-3 bg-yellow-50 text-yellow-800 text-[11px] p-2.5 rounded-lg border border-yellow-200 shadow-sm leading-snug">
                            <span class="font-black text-yellow-900 block mb-0.5">⚠️ NOTA PARA O DEFENSOR:</span> 
                            ${escapeHTML(item.notasRevisao)}
                        </div>` 
                    : ''}
                    
                    ${actionControlsHtml}
                    
                    ${this._getStandardizedFooterHtml(item)}
                `;
                cardsWrapper.appendChild(card);
            });

            container.appendChild(groupDiv);
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
        
        this.renderFormatHelpModal();
    },

    renderFormatHelpModal() {
        const modal = document.getElementById('format-help-modal');
        if (!modal) return;

        modal.innerHTML = `
            <div class="bg-white p-5 sm:p-8 rounded-xl shadow-xl w-full max-w-2xl relative flex flex-col" style="max-height: 95vh;" onclick="event.stopPropagation()">
                <div class="flex-shrink-0 mb-4 pr-8">
                    <button id="close-format-help-x" class="absolute top-3 right-3 sm:top-4 sm:right-4 text-gray-400 hover:text-gray-600 text-3xl leading-none">&times;</button>
                    <h2 class="text-xl sm:text-2xl font-bold leading-tight text-gray-800">Como Preparar sua Pauta para Importação</h2>
                </div>
                <div class="flex-grow overflow-y-auto scrollable-content pr-2 sm:pr-4 text-gray-700">
                    <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-2 gap-2">
                         <p class="font-semibold text-sm">O arquivo deve seguir o formato abaixo, com 4 ou 5 colunas, nesta ordem:</p>
                         <button id="copy-format-btn" class="bg-gray-200 text-gray-800 text-xs font-semibold py-1.5 px-3 rounded-lg hover:bg-gray-300 w-full sm:w-auto transition-colors">Copiar Formato</button>
                    </div>
                    <div class="bg-gray-100 p-3 sm:p-4 rounded-lg text-xs sm:text-sm mb-6 overflow-x-auto border border-gray-200">
                        <code id="format-text-code" class="whitespace-nowrap font-mono">Nº Agend(opcional);Nome Completo do Assistido;HH:MM;Matéria do Assunto;CPF(opcional)</code>
                    </div>

                    <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-2 gap-2">
                        <h3 class="text-base sm:text-lg font-bold">Exemplo:</h3>
                        <button id="copy-example-btn" class="bg-gray-200 text-gray-800 text-xs font-semibold py-1.5 px-3 rounded-lg hover:bg-gray-300 w-full sm:w-auto transition-colors">Copiar Exemplo</button>
                    </div>
                    <pre class="bg-gray-100 p-3 sm:p-4 rounded-lg text-xs sm:text-sm overflow-x-auto mb-6 border border-gray-200"><code id="example-text-code" class="whitespace-pre-wrap word-break font-mono">12345;Maria Joaquina de Amaral Pereira;09:00;Divórcio Consensual;111.222.333-44
;João da Silva;09:30;Ação de Alimentos;
67890;Fulano de Tal;10:00;Curatela;444.555.666-77</code></pre>

                    <ul class="list-disc list-inside space-y-2 text-sm mb-6">
                        <li>A primeira linha (cabeçalho) é <strong>opcional</strong>. O sistema a ignorará se presente.</li>
                        <li>O campo <strong>Nº Agend</strong> é opcional. Se não houver, deixe o espaço em branco.</li>
                        <li>O campo <strong>CPF</strong> é opcional. Se não houver CPF, deixe o espaço em branco.</li>
                        <li>O <strong>horário</strong> deve estar no formato <strong>HH:MM</strong> (Ex: 09:00, 14:30).</li>
                        <li>Save o arquivo com a extensão <strong>.csv</strong>.</li>
                    </ul>

                    <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-2 gap-2 pt-4 border-t border-gray-200">
                        <h3 class="text-base sm:text-lg font-bold">Prompt para IA (Ex: ChatGPT, Gemini):</h3>
                        <button id="copy-prompt-btn" class="bg-gray-200 text-gray-800 text-xs font-semibold py-1.5 px-3 rounded-lg hover:bg-gray-300 w-full sm:w-auto transition-colors">Copiar Prompt</button>
                    </div>
                    <p class="text-xs sm:text-sm mb-2">Se sua pauta está em um PDF, copie o texto abaixo e cole junto com o conteúdo do seu PDF em uma IA para formatá-lo corretamente.</p>
                    <pre class="bg-gray-100 p-3 sm:p-4 rounded-lg text-xs sm:text-sm overflow-x-auto border border-gray-200"><code id="prompt-text-code" class="whitespace-pre-wrap word-break font-mono">Olá! Por favor, converta o conteúdo do arquivo PDF que estou enviando para o formato CSV, usando ponto e vírgula (;) como separador. O resultado deve seguir este padrão:

Nº Agend(opcional);Nome Completo do Assistido;HH:MM;Matéria do Assunto;CPF(opcional)

Por favor, me entregue o texto pronto para que eu possa salvar em um arquivo .csv.</code></pre>
                </div>
            </div>
        `;

        const closeModals = () => modal.classList.add('hidden');
        document.getElementById('close-format-help-x')?.addEventListener('click', closeModals);

        const setupCopy = (btnId, codeId) => {
            const btn = document.getElementById(btnId);
            const codeEl = document.getElementById(codeId);
            if (btn && codeEl) {
                btn.addEventListener('click', () => {
                    navigator.clipboard.writeText(codeEl.textContent);
                    const originalHtml = btn.innerHTML;
                    btn.innerHTML = `✅ Copiado!`;
                    
                    btn.classList.remove('bg-gray-200', 'text-gray-800');
                    btn.classList.add('bg-green-500', 'text-white');

                    if (window.showNotification) window.showNotification("Texto copiado para a área de transferência!", "success");
                    
                    setTimeout(() => {
                        btn.innerHTML = originalHtml;
                        btn.classList.remove('bg-green-500', 'text-white');
                        btn.classList.add('bg-gray-200', 'text-gray-800');
                    }, 2000);
                });
            }
        };

        setupCopy('copy-format-btn', 'format-text-code');
        setupCopy('copy-example-btn', 'example-text-code');
        setupCopy('copy-prompt-btn', 'prompt-text-code');
    },

    showExpiredPautaModal(pauta, app) {
        const existing = document.getElementById('expired-pauta-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'expired-pauta-modal';
        modal.className = 'fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm transition-opacity';
        modal.innerHTML = `
            <div class="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden transform scale-100 transition-transform">
                <div class="p-6 text-center">
                    <div class="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                    </div>
                    <h3 class="text-xl font-bold text-slate-800 mb-2">Pauta Fechada / Expirada</h3>
                    <p class="text-sm text-slate-500 mb-6 leading-relaxed">
                        A pauta <b class="text-slate-700">${escapeHTML(pauta.name)}</b> atingiu o limite de tempo e foi bloqueada.<br><br>
                        Você não pode mais alterá-la, mas o banco de dados está a salvo. O que deseja fazer?
                    </p>
                    <div class="flex flex-col gap-3">
                        <button id="expired-stats-btn" class="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2">
                            <span class="text-lg">📊</span> Abrir Estatísticas e PDFs
                        </button>
                        <button id="expired-cancel-btn" class="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-4 rounded-xl transition-colors">
                            Voltar
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('expired-cancel-btn').onclick = () => modal.remove();

        document.getElementById('expired-stats-btn').onclick = async () => {
            const btn = document.getElementById('expired-stats-btn');
            btn.innerHTML = '<span class="animate-spin text-lg">⏳</span> Buscando Arquivo...';
            btn.disabled = true;
            
            try {
                const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
                const snapshot = await getDocs(collection(app.db, "pautas", pauta.id, "attendances"));
                const allAssisted = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                
                modal.remove();
                
                if (window.StatisticsService && typeof window.StatisticsService.showModal === 'function') {
                    window.StatisticsService.showModal(allAssisted, pauta.useDelegationFlow, pauta.name);
                } else {
                    showNotification("Módulo de estatísticas não carregado.", "error");
                }
            } catch (error) {
                console.error(error);
                showNotification("Erro ao buscar dados arquivados.", "error");
                modal.remove();
            }
        };
    },

    // ⭐ NOVO MÉTODO: renderPautaCards com layout reorganizado conforme template fornecido ⭐
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
                isExpired = new Date() > expirationDate;
            }

            const card = document.createElement('div');
            card.className = `relative bg-white rounded-xl shadow-md overflow-hidden border border-gray-200 transition-all ${isExpired ? 'opacity-60 grayscale-[0.5] cursor-not-allowed' : 'cursor-pointer hover:shadow-lg'} ${isClosed ? 'opacity-60' : ''}`;
            
            card.innerHTML = `
                <!-- Conteúdo Principal -->
                <div class="p-5">
                    <div class="flex justify-between items-start">
                        <h2 class="text-sm font-bold text-indigo-700 uppercase tracking-wide">
                            ${escapeHTML(pauta.unidadeNome || 'Unidade não definida')}
                        </h2>
                        ${isOwner ? `
                        <button class="delete-pauta-btn text-gray-400 hover:text-red-500 transition-colors z-20">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                        ` : ''}
                    </div>

                    <p class="text-gray-700 font-medium mt-2 break-words">${escapeHTML(pauta.name)}</p>
                    <p class="text-sm text-gray-500 mt-1">Membros: ${pauta.members ? pauta.members.length : 1}</p>

                    <div class="mt-4">
                        ${isOwner ? 
                            `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                                Criador
                            </span>` : 
                            `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
                                Compartilhada
                            </span>`
                        }
                    </div>
                </div>

                <!-- Rodapé com Metadados -->
                <div class="bg-gray-50 px-5 py-3 border-t border-gray-100 grid grid-cols-2 gap-4">
                    <div>
                        <p class="text-[10px] text-gray-400 uppercase font-bold">Criada em</p>
                        <p class="text-xs text-gray-600">${dataCriacaoStr}</p>
                    </div>
                    <div>
                        <p class="text-[10px] ${isExpired ? 'text-red-500' : 'text-orange-500'} uppercase font-bold">Eliminação (7 dias)</p>
                        <p class="text-xs text-gray-600">${dataExpiracaoStr}</p>
                    </div>
                </div>
            `;

            card.querySelector('.delete-pauta-btn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                app.deletePauta(pauta.id, pauta.name);
            });

            card.onclick = () => {
                if (isExpired) {
                    this.showExpiredPautaModal(pauta, app);
                    return;
                }
                app.loadPauta(pauta.id, pauta.name, pauta.type);
            };

            container.appendChild(card);
        });
    }

}; // Fim do objeto UIService
