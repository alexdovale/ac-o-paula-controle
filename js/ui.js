// js/ui.js - CORE VISUAL E MOTOR DE RENDERIZAÇÃO (PADRÃO SIGEP)

import { escapeHTML, normalizeText, showNotification } from './utils.js';
import { PautaService } from './pauta.js';
import { PainelGeralService } from './painelGeralService.js';

export const UIService = {
    showScreen(screenName) {
        // Telas de entrada
        document.getElementById('loading-container')?.classList.toggle('hidden', screenName !== 'loading');
        document.getElementById('login-container')?.classList.toggle('hidden', screenName !== 'login');
        
        // 🚀 NOVAS TELAS ADICIONADAS: Seleção de Modo e Atendimento Externo
        document.getElementById('modo-selection-screen')?.classList.toggle('hidden', screenName !== 'modoSelection');
        document.getElementById('atendimento-externo-container')?.classList.toggle('hidden', screenName !== 'atendimentoExterno');
        
        // Telas principais do sistema
        document.getElementById('pauta-selection-container')?.classList.toggle('hidden', screenName !== 'pautaSelection');
        document.getElementById('app-container')?.classList.toggle('hidden', screenName !== 'app');
        document.getElementById('dashboard-container')?.classList.toggle('hidden', screenName !== 'dashboard');
        document.getElementById('recepcao-central-container')?.classList.toggle('hidden', screenName !== 'recepcaoCentral');
        document.getElementById('admin-container')?.classList.toggle('hidden', screenName !== 'admin');


        // Só grava o último acesso se não for tela de carregamento ou login
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

    // ============================================================
    // FUNÇÕES AUXILIARES PARA CARDS COMPACTOS
    // ============================================================
    
    formatarDataHoraCompacta(data) {
        if (!data) return '—';
        const d = data.toDate ? data.toDate() : new Date(data);
        if (isNaN(d.getTime())) return '—';
        return `${d.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'})} ${d.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}`;
    },

    getUnidadeOrigem(assisted, app) {
        // Prioridade: 1. unidadeNome do assistido, 2. unidadeId, 3. da pauta atual, 4. padrão
        const unidade = assisted.unidadeNome || assisted.unidadeId || app?.currentPautaData?.unidadeNome || 'Sem unidade';
        return unidade.length > 22 ? unidade.slice(0, 19) + '…' : unidade;
    },

    mascararCPF(cpf) {
        if (!cpf || cpf.length < 11) return cpf || '';
        const numeros = cpf.replace(/\D/g, '');
        if (numeros.length < 11) return cpf;
        return numeros.slice(0, 3) + '.***.***-' + numeros.slice(-2);
    },

    getStatusIcone(status) {
        const icones = {
            'aguardando': '⏳',
            'emAtendimento': '👩‍💻',
            'atendido': '✅',
            'faltoso': '🚫',
            'aguardandoDistribuicao': '⚖️',
            'aguardandoCorrecao': '🔧',
            'pauta': '📋'
        };
        return icones[status] || '📋';
    },

    renderPautaFilters(containerId, activeFilter, onFilterChange, app) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        const isPeriodo = activeFilter === 'periodo';
        
        const dateFiltersHTML = `
            <div id="periodo-filters-container" class="flex flex-wrap gap-4 mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200 ${isPeriodo ? '' : 'hidden'}">
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
        
        container.innerHTML = `
            <div class="flex flex-col items-center mb-6">
                <div class="w-full max-w-sm relative">
                    <label for="main-pauta-filter" class="block text-xs font-bold text-gray-500 uppercase mb-1.5 ml-1 text-center w-full">Filtro de Exibição</label>
                    <div class="relative">
                        <select id="main-pauta-filter" class="w-full p-3 pl-4 pr-10 appearance-none border border-gray-300 rounded-xl text-sm bg-white shadow-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 font-semibold outline-none transition cursor-pointer text-gray-700">
                            <option value="all" ${activeFilter === 'all' ? 'selected' : ''}>📋 Mostrar Todas as Pautas</option>
                            <option value="active" ${activeFilter === 'active' ? 'selected' : ''}>✅ Pautas com prazo</option>
                            <option value="expired" ${activeFilter === 'expired' ? 'selected' : ''}>🔒 Pautas expiradas</option>
                            <option value="my" ${activeFilter === 'my' ? 'selected' : ''}>👑 Criadas por mim</option>
                            <option value="shared" ${activeFilter === 'shared' ? 'selected' : ''}>🤝 Compartilhadas</option>
                            <option value="periodo" ${activeFilter === 'periodo' ? 'selected' : ''}>📅 Filtrar por Período / Tipo</option>
                        </select>
                        <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-500">
                            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                        </div>
                    </div>
                </div>
            </div>
            ${dateFiltersHTML}
        `;
        
        const filterSelect = document.getElementById('main-pauta-filter');
        const periodoContainer = document.getElementById('periodo-filters-container');
        
        if (filterSelect) {
            filterSelect.addEventListener('change', (e) => {
                const val = e.target.value;
                if (val === 'periodo') {
                    periodoContainer.classList.remove('hidden');
                } else {
                    periodoContainer.classList.add('hidden');
                }
                onFilterChange(val);
            });
        }
        
        const btnAplicar = document.getElementById('aplicar-filtro-periodo');
        if (btnAplicar) {
            btnAplicar.addEventListener('click', () => {
                if (app && typeof app.loadPautasWithFilter === 'function') {
                    app.loadPautasWithFilter();
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
    
        // ⭐ CORREÇÃO: Verificar se os elementos existem antes de manipular classList
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
        
        // ⭐ TRAVA EXCLUSIVA DE ENTRADA: Oculta o botão Chamar Próximo de fábrica para o perfil de Apoio ⭐
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
        const unidadeOrigem = this.getUnidadeOrigem(item, window.app);

        const numAgendamento = item.numeroAgendamento || item.numAgendamento || item.assistedManualNumAgendamento || '';

        const card = document.createElement('div');
        card.className = 'assisted-card relative bg-white rounded-lg shadow-sm border mb-2';
        card.setAttribute('data-id', item.id);
        
        card.innerHTML = `
            <div class="p-2.5">
                <div class="flex items-start justify-between gap-2 mb-0.5">
                    <span class="font-bold text-slate-800 text-sm truncate flex-1">${escapeHTML(item.name || '').toUpperCase()}</span>
                    <span class="text-[8px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full" title="${unidadeOrigem}">🏢 ${unidadeOrigem}</span>
                </div>
                
                <div class="flex flex-wrap items-center gap-1.5 text-[9px] text-slate-500 mb-1.5">
                    ${numAgendamento ? `<span class="text-blue-600 font-mono">#${escapeHTML(numAgendamento)}</span>` : ''}
                    <span>📅 ${item.scheduledTime || '--:--'}</span>
                    <span>📋 ${escapeHTML(item.subject || 'Sem assunto')}</span>
                </div>
                
                <div class="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                    <div class="flex gap-1">
                        <button data-id="${item.id}" class="check-in-btn bg-green-600 text-white font-bold py-1 px-2 rounded text-[9px] shadow-sm hover:bg-green-700">Chegada</button>
                        <button data-id="${item.id}" class="faltou-btn bg-yellow-500 text-white font-bold py-1 px-2 rounded text-[9px] shadow-sm hover:bg-yellow-600">Faltou</button>
                    </div>
                    <div class="flex gap-1">
                        <button data-id="${item.id}" class="edit-assisted-btn text-slate-400 hover:text-blue-500 text-[9px] px-1">✏️</button>
                        ${canDelete && isOwner ? `<button data-id="${item.id}" class="delete-btn text-slate-300 hover:text-red-500 text-[9px] px-1">🗑️</button>` : ''}
                    </div>
                </div>
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
            const canEditPriority = currentUserRole !== 'apoio';
            const canAttend = currentUserRole !== 'apoio';
            const canDelete = currentUserRole === 'admin' || currentUserRole === 'superadmin';
            const numAgendamento = item.numAgendamento || item.numeroAgendamento || item.assistedManualNumAgendamento || '';
            
            const unidadeOrigem = this.getUnidadeOrigem(item, window.app);
            
            const card = document.createElement('div');
            const priorityClass = PautaService.getPriorityClass(item.priority);
            card.className = `assisted-card relative bg-white rounded-lg shadow-sm ${priorityClass} mb-2 group transition-all duration-200 hover:shadow-md`;
            card.setAttribute('data-id', item.id);

            let timeInfoHtml = `<span class="text-[9px] text-slate-400">⏳ Aguardando</span>`;
            if (item.arrivalTime) {
                try {
                    const arrivalDate = new Date(item.arrivalTime);
                    if (!isNaN(arrivalDate)) {
                        const horaChegada = arrivalDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                        const scheduledTimeSeguro = item.scheduledTime || '--:--';
                        if (item.type === 'agendamento' && scheduledTimeSeguro !== '--:--') {
                            timeInfoHtml = `<span class="text-[9px] text-amber-600">📅 ${scheduledTimeSeguro} | 🚪 ${horaChegada}</span>`;
                        } else {
                            timeInfoHtml = `<span class="text-[9px] text-green-600">🚪 ${horaChegada}</span>`;
                        }
                    }
                } catch (e) { console.warn(e); }
            }

            const numeroOrdem = index + 1;
            const nomeSeguro = item.name || 'Nome não informado';
            const assuntoSeguro = item.subject || 'Assunto não informado';

            const atenderButton = canAttend
                ? `<button data-id="${item.id}" data-name="${escapeHTML(nomeSeguro)}" class="${currentPautaData?.useDelegationFlow ? 'select-collaborator-btn' : 'attend-directly-from-aguardando-btn'} bg-blue-600 text-white font-bold py-1.5 px-2 rounded text-[10px] shadow-sm hover:bg-blue-700 transition">Atender</button>`
                : '';

            card.innerHTML = `
                <div class="p-2.5">
                    <div class="flex items-start justify-between gap-2 mb-0.5">
                        <div class="flex items-center gap-1.5 flex-1 min-w-0">
                            <span class="font-bold text-slate-800 text-sm truncate">
                                ${numeroOrdem}. ${escapeHTML(nomeSeguro)}
                            </span>
                            ${item.priority === 'URGENTE' ? `<span class="text-[8px] font-black bg-red-100 text-red-700 px-1 py-0.5 rounded-full">🚨</span>` : ''}
                        </div>
                        <span class="text-[8px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full whitespace-nowrap shadow-sm" title="${unidadeOrigem}">
                            🏢 ${unidadeOrigem}
                        </span>
                    </div>
                    
                    <div class="flex flex-wrap items-center gap-1.5 mb-1">
                        <p class="text-[9px] text-slate-500 truncate flex-1">${escapeHTML(assuntoSeguro)}</p>
                        ${numAgendamento ? `<span class="text-[8px] font-mono bg-blue-50 text-blue-600 px-1 py-0.5 rounded">#${escapeHTML(numAgendamento)}</span>` : ''}
                    </div>
                    
                    <div class="flex flex-wrap items-center gap-1.5 text-[9px] text-slate-400 mb-1.5">
                        <span class="flex items-center gap-0.5">📅 ${this.formatarDataHoraCompacta(item.createdAt || item.dataCriacao)}</span>
                        <span class="w-0.5 h-0.5 rounded-full bg-slate-300"></span>
                        ${timeInfoHtml}
                        ${item.room ? `<span class="w-0.5 h-0.5 rounded-full bg-slate-300"></span><span class="text-purple-500">🚪 ${escapeHTML(item.room)}</span>` : ''}
                    </div>
                    
                    <div class="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                        <div class="flex gap-1">
                            ${atenderButton}
                            <button data-id="${item.id}" class="priority-btn text-[9px] font-bold ${item.priority === 'URGENTE' ? 'bg-orange-100 text-orange-700' : 'bg-red-50 text-red-600'} px-2 py-1 rounded hover:bg-opacity-80">⚡</button>
                        </div>
                        <div class="flex gap-1">
                            <button data-id="${item.id}" class="quick-action-toggle text-slate-400 hover:text-blue-500 text-[9px] px-1">⋮</button>
                            ${canDelete ? `<button data-id="${item.id}" class="delete-btn text-slate-300 hover:text-red-500 text-[9px] px-1">🗑️</button>` : ''}
                        </div>
                    </div>
                    
                    <div id="quick-menu-${item.id}" class="quick-menu hidden absolute right-2 bottom-12 bg-white rounded-lg shadow-xl border z-30 py-1 min-w-[120px]">
                        <button data-id="${item.id}" data-tipo="reagendar" class="quick-action-item w-full text-left px-3 py-1.5 text-[10px] hover:bg-amber-50">🔄 Reagendar</button>
                        <button data-id="${item.id}" data-tipo="agendar" class="quick-action-item w-full text-left px-3 py-1.5 text-[10px] hover:bg-emerald-50">📅 Agendar</button>
                        <button data-id="${item.id}" data-tipo="consulta" class="quick-action-item w-full text-left px-3 py-1.5 text-[10px] hover:bg-purple-50">🔍 Consulta</button>
                        <button data-id="${item.id}" class="edit-assisted-btn quick-action-item w-full text-left px-3 py-1.5 text-[10px] hover:bg-gray-50">✏️ Editar</button>
                        <button data-id="${item.id}" class="view-details-btn quick-action-item w-full text-left px-3 py-1.5 text-[10px] hover:bg-gray-50">👁️ Detalhes</button>
                    </div>
                </div>
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
            
            const unidadeOrigem = this.getUnidadeOrigem(item, window.app);
            
            const isDelegated = !!(item.assignedCollaborator && item.assignedCollaborator.name);
            const delegateBtnClass = isDelegated ? 'bg-indigo-300 cursor-not-allowed' : 'bg-indigo-500 hover:bg-indigo-600';
            
            const card = document.createElement('div');
            card.className = `assisted-card relative bg-white rounded-lg shadow-sm border-l-4 border-l-purple-400 mb-2`;
            card.setAttribute('data-id', item.id);
            
            const startTime = item.inAttendanceTime ? 
                new Date(item.inAttendanceTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
            
            const atendenteNome = this.getAttendantName(item);
            const numAgendamento = item.numAgendamento || item.numeroAgendamento || item.assistedManualNumAgendamento || '';

            card.innerHTML = `
                <div class="p-2.5">
                    <div class="flex items-start justify-between gap-2 mb-0.5">
                        <span class="font-bold text-slate-800 text-sm truncate flex-1">
                            ${index + 1}. ${escapeHTML(item.name || '')}
                        </span>
                        <span class="text-[8px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full" title="${unidadeOrigem}">
                            🏢 ${unidadeOrigem}
                        </span>
                    </div>
                    
                    <div class="flex flex-wrap items-center gap-1.5 text-[9px] text-slate-500 mb-1">
                        <span>👤 ${escapeHTML(atendenteNome)}</span>
                        <span class="w-0.5 h-0.5 rounded-full bg-slate-300"></span>
                        <span>⏱️ ${startTime}</span>
                        ${numAgendamento ? `<span class="w-0.5 h-0.5 rounded-full bg-slate-300"></span><span class="text-blue-500">#${escapeHTML(numAgendamento)}</span>` : ''}
                    </div>
                    
                    <p class="text-[9px] text-slate-400 truncate mb-2">${escapeHTML(item.subject || 'Sem assunto')}</p>
                    
                    <div class="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                        <div class="flex gap-1">
                            ${canDelegateOrFinalize ? `
                                <button data-id="${item.id}" class="select-collaborator-btn ${delegateBtnClass} text-white font-bold py-1 px-2 rounded text-[9px] shadow-sm" ${canDelegateOrFinalize && !isDelegated ? '' : 'disabled'}>
                                    Delegar
                                </button>
                                <button data-id="${item.id}" class="attend-directly-from-aguardando-btn bg-green-600 text-white font-bold py-1 px-2 rounded text-[9px] shadow-sm hover:bg-green-700">
                                    Finalizar
                                </button>
                            ` : ''}
                        </div>
                        <div class="flex gap-1">
                            <button data-id="${item.id}" class="view-details-btn text-indigo-500 text-[9px] px-1">👁️</button>
                            ${canDelete ? `<button data-id="${item.id}" class="delete-btn text-slate-300 hover:text-red-500 text-[9px] px-1">🗑️</button>` : ''}
                        </div>
                    </div>
                </div>
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
            const unidadeOrigem = this.getUnidadeOrigem(item, window.app);

            const card = document.createElement('div');
            card.className = 'assisted-card relative bg-white rounded-lg shadow-sm border mb-2';
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
                <div class="p-2.5">
                    <div class="flex items-start justify-between gap-2 mb-0.5">
                        <span class="font-bold text-slate-800 text-sm truncate flex-1">${escapeHTML(item.name || '')}</span>
                        <span class="text-[8px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full" title="${unidadeOrigem}">🏢 ${unidadeOrigem}</span>
                        <button data-id="${item.id}" class="toggle-confirmed-atendido w-5 h-5 rounded-full border flex items-center justify-center ${confirmButton} text-[8px]" ${canToggleConfirmed ? '' : 'disabled'}>✓</button>
                    </div>
                    
                    <div class="flex flex-wrap items-center gap-1.5 text-[9px] text-slate-500 mb-1">
                        ${numAgendamento ? `<span class="text-blue-600">#${escapeHTML(numAgendamento)}</span>` : ''}
                        <span>📋 ${escapeHTML(item.subject || 'Sem assunto')}</span>
                    </div>
                    
                    <div class="flex flex-wrap items-center gap-2 text-[9px] text-slate-400 mb-1.5">
                        <span>📅 ${item.scheduledTime || '---'}</span>
                        <span class="w-0.5 h-0.5 rounded-full bg-slate-300"></span>
                        <span>🚪 ${arrivalT}</span>
                        <span class="w-0.5 h-0.5 rounded-full bg-slate-300"></span>
                        <span>✅ ${attendedT}</span>
                    </div>
                    
                    <div class="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                        <span class="text-[9px] text-gray-500">👤 ${escapeHTML(atendenteNome)}</span>
                        <div class="flex gap-1">
                            <button data-id="${item.id}" class="manage-demands-btn text-blue-500 text-[9px] px-1" ${canManageDemandsOrEditAttendant ? '' : 'disabled'}>📋</button>
                            <button data-id="${item.id}" class="edit-assisted-btn text-slate-400 text-[9px] px-1">✏️</button>
                            <button data-id="${item.id}" class="edit-attendant-btn text-green-600 text-[9px] px-1">👤</button>
                            <button data-id="${item.id}" class="delete-btn text-slate-300 hover:text-red-500 text-[9px] px-1" ${canDelete ? '' : 'disabled'}>🗑️</button>
                        </div>
                    </div>
                    ${this._getStandardizedFooterHtml(item)}
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

        container.innerHTML = '';
        items.forEach(item => {
            const currentUserRole = window.app?.currentUser?.role;
            const canDelete = currentUserRole === 'admin' || currentUserRole === 'superadmin';
            const canRevert = currentUserRole === 'user' || currentUserRole === 'admin' || currentUserRole === 'superadmin';
            const canToggleConfirmed = currentUserRole === 'user' || currentUserRole === 'admin' || currentUserRole === 'superadmin';
            const unidadeOrigem = this.getUnidadeOrigem(item, window.app);
            const numAgendamento = item.numAgendamento || item.numeroAgendamento || item.assistedManualNumAgendamento || '';

            const card = document.createElement('div');
            const isConfirmed = item.isConfirmed || false;

            card.className = 'assisted-card relative bg-white rounded-lg shadow-sm border mb-2 opacity-90';
            card.setAttribute('data-id', item.id);

            const confirmButtonClass = isConfirmed 
                ? 'bg-green-500 border-green-500 text-white' 
                : 'bg-slate-100 text-slate-300';

            card.innerHTML = `
                <div class="p-2.5">
                    <div class="flex items-start justify-between gap-2 mb-0.5">
                        <div class="flex items-center gap-1.5 flex-1 min-w-0">
                            <span class="font-bold text-slate-800 text-sm truncate">${escapeHTML(item.name || '').toUpperCase()}</span>
                            <span class="text-[8px] font-black text-purple-600 bg-purple-50 px-1 py-0.5 rounded">🚫</span>
                        </div>
                        <span class="text-[8px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full" title="${unidadeOrigem}">🏢 ${unidadeOrigem}</span>
                        <button data-id="${item.id}" class="toggle-confirmed-faltoso w-5 h-5 rounded-full border flex items-center justify-center ${confirmButtonClass} text-[8px]" ${canToggleConfirmed ? '' : 'disabled'}>✓</button>
                    </div>
                    
                    <div class="flex flex-wrap items-center gap-1.5 text-[9px] text-slate-500 mb-1">
                        ${numAgendamento ? `<span class="text-blue-600">#${escapeHTML(numAgendamento)}</span>` : ''}
                        <span>📋 ${escapeHTML(item.subject || 'Sem assunto')}</span>
                    </div>
                    
                    <div class="flex flex-wrap items-center gap-2 text-[9px] text-slate-400 mb-1.5">
                        <span>📅 ${item.scheduledTime || '---'}</span>
                        <span class="w-0.5 h-0.5 rounded-full bg-slate-300"></span>
                        <span>⚠️ ${item.lastActionTimestamp ? new Date(item.lastActionTimestamp).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'}) : '--:--'}</span>
                    </div>
                    
                    <div class="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                        <span class="text-[8px] text-gray-400 italic">${isConfirmed ? '✓ Lançado no Verde' : '⏳ Pendente'}</span>
                        <div class="flex gap-1">
                            <button data-id="${item.id}" class="edit-assisted-btn text-slate-400 text-[9px] px-1">✏️</button>
                            <button data-id="${item.id}" class="return-to-pauta-from-faltoso-btn text-orange-500 text-[9px] px-1" ${canRevert ? '' : 'disabled'}>↩️</button>
                            <button data-id="${item.id}" class="delete-btn text-slate-300 hover:text-red-500 text-[9px] px-1" ${canDelete ? '' : 'disabled'}>🗑️</button>
                        </div>
                    </div>
                    ${this._getStandardizedFooterHtml(item)}
                </div>
            `;
            container.appendChild(card);
        });
    },
    
    // ⭐ PERFIL APOIO: Oculta visualmente os botões administrativos no card de Distribuição ⭐
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
                const unidadeOrigem = this.getUnidadeOrigem(item, window.app);
                const numAgendamento = item.numAgendamento || item.numeroAgendamento || item.assistedManualNumAgendamento || '';

                const card = document.createElement('div');
                card.className = 'assisted-card relative bg-white p-3 rounded-lg shadow-sm border border-cyan-200 mb-2';
                card.setAttribute('data-id', item.id);
                
                const linkExterno = `${baseUrl}/atendimento_externo.html?pautaId=${pautaId}&assistidoId=${item.id}&colab=${encodeURIComponent(userName)}&token=${item.delegationToken || ''}`;

                const numeroOrdem = index + 1;
                const badgeStatus = item.status === 'aguardandoCorrecao' 
                    ? `<span class="absolute top-1 left-1 bg-amber-100 text-amber-700 text-[8px] font-black px-1.5 py-0.5 rounded">P/ Avaliação</span>` 
                    : `<span class="absolute top-1 left-1 bg-blue-100 text-blue-700 text-[8px] font-black px-1.5 py-0.5 rounded">P/ Assinatura</span>`;

                const actionControlsHtml = canManageDistribution
                    ? `<div class="flex gap-1 mt-2">
                            <button onclick="window.open('${linkExterno}', '_blank')" class="flex-1 bg-cyan-600 text-white font-bold py-1 px-2 rounded text-[9px] shadow-sm hover:bg-cyan-700">Abrir</button>
                            <button data-id="${item.id}" class="delegate-finalization-btn flex-1 bg-green-600 text-white font-bold py-1 px-2 rounded text-[9px] shadow-sm hover:bg-green-700">Concluir</button>
                            <button data-id="${item.id}" class="return-to-aguardando-from-dist-btn flex-1 bg-slate-100 text-slate-600 border font-bold py-1 px-2 rounded text-[9px]">↩️</button>
                       </div>`
                    : `<button data-id="${item.id}" class="view-details-btn text-indigo-500 text-[9px] font-bold w-full border p-1 rounded mt-1">👁️ Detalhes</button>`;

                card.innerHTML = `
                    ${badgeStatus}
                    <div class="pl-16">
                        <div class="flex items-start justify-between gap-2 mb-0.5">
                            <span class="font-bold text-slate-800 text-sm">${numeroOrdem}. ${escapeHTML(item.name || '')}</span>
                            <span class="text-[8px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full" title="${unidadeOrigem}">🏢 ${unidadeOrigem}</span>
                        </div>
                        
                        <div class="flex flex-wrap items-center gap-1.5 text-[9px] text-slate-500 mb-1">
                            ${numAgendamento ? `<span class="text-blue-600">#${escapeHTML(numAgendamento)}</span>` : ''}
                            <span>📋 ${escapeHTML(item.subject || 'Sem assunto')}</span>
                        </div>
                        
                        ${item.numeroProcesso ? `<span class="text-[8px] text-blue-600 font-mono">📄 ${escapeHTML(item.numeroProcesso)}</span>` : ''}
                        
                        ${actionControlsHtml}
                    </div>
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
                    this.showExpiredPautaModal(pauta, app);
                    return;
                }
                app.loadPauta(pauta.id, pauta.name, pauta.type);
            };

            container.appendChild(card);
        });
    }
};
