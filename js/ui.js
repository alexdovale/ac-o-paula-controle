// js/ui.js - CORE VISUAL E MOTOR DE RENDERIZAÇÃO (REVISADO)

import { escapeHTML, normalizeText, showNotification } from './utils.js';
import { PautaService } from './pauta.js';
import { PainelGeralService } from './painelGeralService.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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
        const container = document.getElementById('collaborator-selection-list') || document.getElementById('collaborators-list-container');
        const searchInput = document.getElementById('collaborator-search-input');
        
        if (!container) return;
        container.innerHTML = '';
        window.selectedCollaboratorId = null;
        window.selectedCollaboratorName = null;
        
        const btnNaoAtribuir = document.createElement('button');
        btnNaoAtribuir.className = "collaborator-item w-full text-left p-4 mb-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all active:scale-95 shadow-sm flex items-center gap-3";
        btnNaoAtribuir.dataset.nome = 'nao atribuir';
        btnNaoAtribuir.innerHTML = `
            <div class="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 text-xl flex-shrink-0 border border-slate-200">🚫</div>
            <div class="overflow-hidden">
                <div class="font-semibold text-slate-800 truncate">Não atribuir</div>
                <div class="text-xs text-slate-500 truncate">Atender sem atribuir a nenhum colaborador</div>
            </div>
        `;
        btnNaoAtribuir.onclick = (e) => {
            e.stopPropagation();
            window.selectedCollaboratorId = 'null';
            window.selectedCollaboratorName = null;
            this.destacarSelecao(container, btnNaoAtribuir);
        };
        container.appendChild(btnNaoAtribuir);

        const colabs = app?.colaboradores || window.app?.colaboradores || [];

        if (colabs.length === 0) {
            container.innerHTML += this._getEmptyStateHtml(
                `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>`,
                'Nenhum colaborador carregado.<br><span class="text-xs font-normal">Acesse a gestão para adicionar membros.</span>'
            );
        } else {
            colabs.forEach(c => {
                try {
                    const btn = document.createElement('button');
                    btn.className = "collaborator-item w-full text-left p-4 mb-2 bg-white border border-slate-200 rounded-xl hover:border-blue-500 transition-all active:scale-95 shadow-sm flex items-center gap-3";
                    
                    const rawNome = typeof c.nome === 'object' ? (c.nome.nome || c.nome.name || '') : (c.nome || '');
                    const nomeSeguro = String(rawNome).trim() || 'Nome não informado';
                    
                    btn.dataset.nome = nomeSeguro.toLowerCase();
                    btn.dataset.id = c.id || '';
                    
                    let iniciais = '??';
                    const parts = nomeSeguro.split(/\s+/).filter(Boolean);
                    if (parts.length >= 2) {
                        iniciais = (parts[0][0] + parts[parts.length-1][0]).toUpperCase();
                    } else if (parts.length === 1 && parts[0].length >= 1) {
                        iniciais = parts[0].substring(0, 2).toUpperCase();
                    }
                    
                    btn.innerHTML = `
                        <div class="w-10 h-10 rounded-full bg-blue-50 text-blue-600 font-bold border border-blue-200 flex items-center justify-center text-sm flex-shrink-0">${escapeHTML(iniciais)}</div>
                        <div class="overflow-hidden w-full">
                            <div class="font-semibold text-slate-800 truncate pr-2">${escapeHTML(nomeSeguro)}</div>
                            <div class="text-xs text-slate-500 truncate">${escapeHTML(c.cargo || 'Membro')} | Equipe ${escapeHTML(c.equipe || 'N/A')}</div>
                        </div>
                    `;
                    
                    btn.onclick = (e) => {
                        e.stopPropagation();
                        window.selectedCollaboratorId = c.id || c.nome; 
                        window.selectedCollaboratorName = nomeSeguro;
                        this.destacarSelecao(container, btn);
                    };
                    container.appendChild(btn);
                } catch (err) {}
            });
        }

        if (searchInput) {
            const applyFilter = (term) => {
                const t = (term || '').toLowerCase().trim();
                container.querySelectorAll('.collaborator-item').forEach(item => {
                    const nome = (item.dataset.nome || '').toLowerCase();
                    item.style.display = (!t || nome.includes(t)) ? 'flex' : 'none';
                });
            };
            const newSearchInput = searchInput.cloneNode(true);
            if(searchInput.parentNode) searchInput.parentNode.replaceChild(newSearchInput, searchInput);
            newSearchInput.addEventListener('input', (e) => applyFilter(e.target.value));
            newSearchInput.value = ''; 
            applyFilter(''); 
        }
    },

    destacarSelecao(container, btnSelecionado) {
        if (!container || !btnSelecionado) return;
        container.querySelectorAll('.collaborator-item').forEach(b => {
            b.classList.remove('border-blue-500', 'ring-1', 'ring-blue-200');
            b.classList.add('border-slate-200');
        });
        btnSelecionado.classList.add('border-blue-500', 'ring-1', 'ring-blue-200');
        btnSelecionado.classList.remove('border-slate-200');
    },

    renderPautaFilters(containerId, activeFilter, onFilterChange, app) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const isPeriodo = activeFilter === 'periodo';
        const isUnidades = activeFilter === 'unidades';
        const isAdmin = app.currentUser?.role === 'admin' || app.currentUser?.role === 'superadmin';
        const userUnidades = app.currentUser?.unidades || [];
        const hasUnidadesVinculadas = userUnidades.length > 0 || isAdmin;
        const isEventoMode = app?.currentMode === 'evento';

        const dateFiltersHTML = `
            <div id="periodo-filters-container" class="flex flex-wrap gap-4 mt-4 p-4 bg-slate-50 rounded-xl border border-slate-200 ${isPeriodo ? '' : 'hidden'} animate-fade-in">
                <div class="flex-1 min-w-[150px]">
                    <label class="block text-xs font-semibold text-slate-500 uppercase mb-1">Data Inicial</label>
                    <input type="date" id="filter-data-inicial" class="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-700">
                </div>
                <div class="flex-1 min-w-[150px]">
                    <label class="block text-xs font-semibold text-slate-500 uppercase mb-1">Data Final</label>
                    <input type="date" id="filter-data-final" class="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-700">
                </div>
                ${isEventoMode ? `
                <div class="flex-1 min-w-[200px]">
                    <label class="block text-xs font-semibold text-slate-500 uppercase mb-1">Tipo de Evento</label>
                    <select id="filter-tipo-pauta" class="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-700">
                        <option value="todos">Todos os Tipos</option>
                        <option value="mutirao">Mutirão</option>
                        <option value="plantao">Plantão</option>
                        <option value="acao_social">Ação Social</option>
                    </select>
                </div>` : ''}
                <div class="flex items-end">
                    <button id="aplicar-filtro-periodo" class="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 active:scale-95 transition-all shadow-sm w-full sm:w-auto">
                        Aplicar Filtro
                    </button>
                </div>
            </div>
        `;

        const unidadesOptions = `<option value="todas">Carregando unidades...</option>`;
        const unidadesFiltersHTML = !isEventoMode ? `
            <div id="unidades-filters-container" class="flex flex-wrap gap-4 mt-4 p-4 bg-slate-50 rounded-xl border border-slate-200 ${isUnidades ? '' : 'hidden'} animate-fade-in">
                <div class="flex-1 min-w-[250px]">
                    <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Selecione a Origem / Unidade</label>
                    <select id="filter-unidade-select" class="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-700">
                        ${unidadesOptions}
                    </select>
                </div>
                <div class="flex-1 min-w-[200px]">
                    <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Status da Pauta</label>
                    <select id="filter-unidade-status" class="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-700">
                        <option value="ativas">Ativas (não expiradas)</option>
                        <option value="todas">Todas (incluindo expiradas)</option>
                        <option value="expiradas">Apenas Expiradas</option>
                    </select>
                </div>
                <div class="flex items-end">
                    <button id="aplicar-filtro-unidades" class="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 active:scale-95 transition-all shadow-sm w-full sm:w-auto">
                        Buscar Pautas
                    </button>
                </div>
            </div>
        ` : '';

        container.innerHTML = `
            <div class="flex flex-col items-start mb-2">
                <div class="w-full sm:w-80 relative group">
                    <div class="relative">
                        <select id="main-pauta-filter" class="w-full p-2.5 pl-4 pr-10 appearance-none border border-slate-300 hover:border-blue-400 rounded-lg text-sm bg-white shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium outline-none transition-all cursor-pointer text-slate-700">
                            <option value="all" ${activeFilter === 'all' ? 'selected' : ''}> Mostrar Todas as Pautas</option>
                            <option value="active" ${activeFilter === 'active' ? 'selected' : ''}> Pautas ativas (com prazo)</option>
                            <option value="expired" ${activeFilter === 'expired' ? 'selected' : ''}> Pautas expiradas</option>
                            <option value="my" ${activeFilter === 'my' ? 'selected' : ''}> Criadas por mim</option>
                            <option value="shared" ${activeFilter === 'shared' ? 'selected' : ''}> Compartilhadas comigo</option>
                            ${hasUnidadesVinculadas && !isEventoMode ? `<option value="unidades" ${activeFilter === 'unidades' ? 'selected' : ''}> Filtrar por Origem / Unidade</option>` : ''}
                            <option value="periodo" ${activeFilter === 'periodo' ? 'selected' : ''}> Filtrar por Período${isEventoMode ? ' / Tipo' : ''}</option>
                        </select>
                        <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                        </div>
                    </div>
                </div>
            </div>
            ${dateFiltersHTML}
            ${unidadesFiltersHTML}
        `;

        if (!isEventoMode) {
            const selectUnidade = document.getElementById('filter-unidade-select');
            if (selectUnidade) {
                if (isAdmin) {
                    getDocs(collection(app.db, "unidades")).then(snap => {
                        const allUnidades = snap.docs.map(d => d.data().nome).filter(Boolean).sort();
                        let html = `<option value="todas"> Todas as Unidades (Visão Admin)</option>`;
                        if (userUnidades.length > 0) {
                            html += `<optgroup label=" Minhas Unidades Vinculadas">`;
                            userUnidades.forEach(u => {
                                const nome = u.unidadeNome || u.nome || u.name || (typeof u === 'string' ? u : '');
                                if (nome) html += `<option value="${escapeHTML(nome)}"> ${escapeHTML(nome)}</option>`;
                            });
                            html += `</optgroup><optgroup label=" Todas as Unidades do Sistema">`;
                        }
                        allUnidades.forEach(nome => {
                            html += `<option value="${escapeHTML(nome)}"> ${escapeHTML(nome)}</option>`;
                        });
                        if (userUnidades.length > 0) html += `</optgroup>`;
                        selectUnidade.innerHTML = html;
                    }).catch(err => {
                        selectUnidade.innerHTML = `<option value="todas"> Todas as Unidades (Visão Admin)</option>`;
                    });
                } else {
                    const opcoesUser = userUnidades.map(u => {
                        const nome = u.unidadeNome || u.nome || u.name || (typeof u === 'string' ? u : '');
                        return `<option value="${escapeHTML(nome)}">📍 ${escapeHTML(nome)}</option>`;
                    }).join('');
                    selectUnidade.innerHTML = `<option value="todas">🌍 Todas as origens</option>` + opcoesUser;
                }
            }
        }

        const filterSelect = document.getElementById('main-pauta-filter');
        const periodoContainer = document.getElementById('periodo-filters-container');
        const unidadesContainer = document.getElementById('unidades-filters-container');

        if (filterSelect) {
            filterSelect.addEventListener('change', (e) => {
                const val = e.target.value;
                if (periodoContainer) periodoContainer.classList.add('hidden');
                if (unidadesContainer) unidadesContainer.classList.add('hidden');

                if (val === 'periodo' && periodoContainer) periodoContainer.classList.remove('hidden');
                else if (val === 'unidades' && unidadesContainer) unidadesContainer.classList.remove('hidden');

                onFilterChange(val);
            });
        }

        document.getElementById('aplicar-filtro-periodo')?.addEventListener('click', () => {
            if (app && typeof app.loadPautasWithFilter === 'function') {
                const dataInicial = document.getElementById('filter-data-inicial')?.value;
                const dataFinal = document.getElementById('filter-data-final')?.value;
                const tipoPauta = document.getElementById('filter-tipo-pauta')?.value;
                app.loadPautasWithFilter({ tipo: 'periodo', dataInicial, dataFinal, tipoPauta });
            }
        });

        if (!isEventoMode) {
            document.getElementById('aplicar-filtro-unidades')?.addEventListener('click', () => {
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

        document.querySelectorAll('#actions-panel button').forEach(btn => {
            if (btn.id === 'reopen-pauta-btn') btn.disabled = false;
            else btn.disabled = isClosed;
        });

        document.querySelectorAll('.assisted-card button:not(.quick-action-toggle), .assisted-card select').forEach(btn => {
            btn.disabled = isClosed;
        });

        const closedAlert = document.getElementById('closed-pauta-alert');
        const closeBtn = document.getElementById('close-pauta-btn');
        const reopenBtn = document.getElementById('reopen-pauta-btn');

        if (closedAlert) isClosed ? closedAlert.classList.remove('hidden') : closedAlert.classList.add('hidden');
        if (closeBtn) isClosed ? closeBtn.classList.add('hidden') : closeBtn.classList.remove('hidden');
        if (reopenBtn) isClosed ? reopenBtn.classList.remove('hidden') : reopenBtn.classList.add('hidden');

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
            btn.classList.remove('bg-slate-600', 'text-white');
            btn.classList.add('bg-white', 'border', 'border-slate-300', 'text-slate-700');
        } else {
            btn.textContent = 'Voltar para Pauta';
            btn.classList.remove('bg-white', 'border', 'border-slate-300', 'text-slate-700');
            btn.classList.add('bg-slate-600', 'text-white');
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
            loginTab.classList.add('border-blue-600', 'text-blue-600');
            loginTab.classList.remove('text-slate-500');
            registerTab.classList.remove('border-blue-600', 'text-blue-600');
            registerTab.classList.add('text-slate-500');
            loginForm.classList.remove('hidden');
            registerForm.classList.add('hidden');
        } else {
            registerTab.classList.add('border-blue-600', 'text-blue-600');
            registerTab.classList.remove('text-slate-500');
            loginTab.classList.remove('border-blue-600', 'text-blue-600');
            loginTab.classList.add('text-slate-500');
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
            tabAvulso.classList.remove('tab-active', 'text-slate-500', 'hover:text-slate-700');
            isScheduledContainer.classList.remove('hidden');
            pautaColumn.classList.remove('hidden');
            if (app.currentPautaData?.useDelegationFlow) emAtendimentoColumn.classList.remove('hidden');
            else emAtendimentoColumn.classList.add('hidden');
            if (formTitle) formTitle.textContent = "Adicionar Novo Agendamento";
            this.showAgendamentoForm();
        } else {
            tabAvulso.classList.add('tab-active');
            tabAgendamento.classList.remove('tab-active');
            tabAgendamento.classList.add('text-slate-500', 'hover:text-slate-700');
            isScheduledContainer.classList.add('hidden');
            pautaColumn.classList.add('hidden');
            if (app.currentPautaData?.useDelegationFlow) emAtendimentoColumn.classList.remove('hidden');
            else emAtendimentoColumn.classList.add('hidden');
            if (formTitle) formTitle.textContent = "Adicionar Atendimento Avulso";
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

    _getEmptyStateHtml(svgIcon, textMessage) {
        return `
            <div class="flex flex-col items-center justify-center py-10 opacity-60">
                <div class="text-slate-400 w-12 h-12 mb-3">
                    ${svgIcon}
                </div>
                <p class="text-slate-500 font-medium text-sm text-center px-4">${textMessage}</p>
            </div>
        `;
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

        const svgPauta = `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>`;
        const svgAguardando = `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`;
        const svgEmAtendimento = `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>`;
        const svgAtendidos = `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>`;
        const svgFaltosos = `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M22 10.5h-6m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" /></svg>`;
        const svgDist = `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971z" /></svg>`;

        if (allAssisted.length === 0) {
            this.clearContainers();

            const pautaList = document.getElementById('pauta-list');
            const aguardandoList = document.getElementById('aguardando-list');
            const atendidosList = document.getElementById('atendidos-list');
            const emAtendimentoList = document.getElementById('em-atendimento-list');
            const faltososList = document.getElementById('faltosos-list');
            const distribuicaoList = document.getElementById('distribuicao-list');

            if (pautaList) pautaList.innerHTML = this._getEmptyStateHtml(svgPauta, 'Nenhum agendamento na pauta');
            if (aguardandoList) aguardandoList.innerHTML = this._getEmptyStateHtml(svgAguardando, 'Fila de espera vazia');
            if (emAtendimentoList) emAtendimentoList.innerHTML = this._getEmptyStateHtml(svgEmAtendimento, 'Ninguém em atendimento');
            if (atendidosList) atendidosList.innerHTML = this._getEmptyStateHtml(svgAtendidos, 'Nenhum atendimento finalizado');
            if (faltososList) faltososList.innerHTML = this._getEmptyStateHtml(svgFaltosos, 'Nenhum assistido faltou hoje');
            if (distribuicaoList) distribuicaoList.innerHTML = this._getEmptyStateHtml(svgDist, 'Nenhum processo aguardando assinatura');

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

        setTimeout(() => { 
            if (typeof PautaService.setupManualSort === 'function') PautaService.setupManualSort(app); 
            this.setupColumnControls(app); 
            this.applyPopoutMode(); 
        }, 100);
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
        const arrivalTimeFormatted = assisted.arrivalTime ? new Date(assisted.arrivalTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
        const attendedTimeFormatted = assisted.attendedAt ? new Date(assisted.attendedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
        const inAttendanceTimeFormatted = assisted.inAttendanceTime ? new Date(assisted.inAttendanceTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
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
            <div class="mt-3 pt-3 border-t border-slate-100 flex justify-end">
                <p class="text-[10px] text-slate-400">Última ação por: <span class="font-medium text-slate-500">${lastActionBy}</span> às ${lastActionDate}</p>
            </div>
        `;
    },

    renderPautaColumn(items) {
        const container = document.getElementById('pauta-list');
        if (!container) return;

        if (items.length === 0) {
            container.innerHTML = this._getEmptyStateHtml(
                `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>`,
                'Nenhum agendamento na pauta'
            );
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
        card.className = 'assisted-card relative bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-3 hover:shadow-md transition-shadow group';
        card.setAttribute('data-id', item.id);

        card.innerHTML = `
            ${canDelete ? `
            <button data-id="${item.id}" class="delete-btn absolute top-3 right-3 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100" ${isOwner ? '' : 'disabled'} title="Excluir (apenas criador)">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
            </button>` : ''}

            <p class="font-semibold text-sm text-slate-800 leading-tight pr-6 mb-2">${escapeHTML(item.name || '')}</p>

            ${numAgendamento ? `<span class="inline-flex items-center gap-1 bg-slate-100 text-slate-600 border border-slate-200 px-2 py-1 rounded text-[10px] font-medium w-max mb-2">📅 Nº Agend.: ${escapeHTML(numAgendamento)}</span>` : ''}
            
            <div class="space-y-1 text-xs text-slate-600">
                <p>Assunto: <span class="font-medium text-slate-700">${escapeHTML(item.subject || 'Não informado')}</span></p>
                <p>Agendado: <span class="font-medium text-slate-700">${item.scheduledTime || '--:--'}</span></p>
            </div>

            <div class="mt-4 space-y-2">
                <div class="grid grid-cols-2 gap-2">
                    <button data-id="${item.id}" class="check-in-btn bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg text-xs transition-all active:scale-95 shadow-sm w-full">
                        Marcar Chegada
                    </button>
                    <button data-id="${item.id}" class="faltou-btn bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium py-2 rounded-lg text-xs transition-all active:scale-95 shadow-sm w-full" ${canEdit ? '' : 'disabled'}>
                        Faltou
                    </button>
                </div>
                <button data-id="${item.id}" class="edit-assisted-btn w-full text-blue-600 hover:text-blue-700 hover:bg-blue-50 font-medium py-1.5 rounded-lg text-xs transition-all active:scale-95" ${canEdit ? '' : 'disabled'}>
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
            container.innerHTML = this._getEmptyStateHtml(
                `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`,
                'Fila de espera vazia'
            );
            return;
        }

        container.innerHTML = '';

        if (currentPautaData?.type === 'multisala' && currentPautaData.rooms?.length > 0) {
            currentPautaData.rooms.forEach(roomName => {
                const peopleInRoom = items.filter(a => a.room === roomName);
                if (peopleInRoom.length === 0) return;

                const roomGroup = document.createElement('div');
                roomGroup.className = "mb-4 border border-slate-200 rounded-xl overflow-hidden bg-slate-50 room-group-container shadow-sm";

                // CORES ORIGINAIS RESTAURADAS PARA AS SALAS (AZUL)
                roomGroup.innerHTML = `
                    <div class="bg-blue-50 p-3 border-b border-blue-200 flex flex-col gap-2">
                        <div class="flex justify-between items-center">
                            <h4 class="font-semibold text-blue-800 text-xs flex items-center gap-1.5 uppercase">
                                <span>🏢</span> ${escapeHTML(roomName)}
                            </h4>
                            <span class="bg-blue-200 text-blue-800 border border-blue-300 text-[10px] font-bold px-2 py-0.5 rounded-full">${peopleInRoom.length}</span>
                        </div>
                        <input type="search" placeholder="Pesquisar nesta sala..." class="room-search-input w-full p-1.5 text-xs border border-blue-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                    </div>
                    <div class="p-2 space-y-2 room-cards-wrapper bg-slate-50"></div>
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
                roomGroupNoRoom.className = "mb-4 border border-red-200 rounded-xl overflow-hidden bg-red-50 room-group-container shadow-sm";

                // CORES ORIGINAIS RESTAURADAS PARA SEM SALA (VERMELHO)
                roomGroupNoRoom.innerHTML = `
                    <div class="bg-red-50 p-3 border-b border-red-200 flex flex-col gap-2">
                        <div class="flex justify-between items-center">
                            <h4 class="font-semibold text-red-800 text-xs flex items-center gap-1.5 uppercase">
                                <span>⚠️</span> Sem Sala Definida
                            </h4>
                            <span class="bg-red-200 text-red-800 border border-red-300 text-[10px] font-bold px-2 py-0.5 rounded-full">${peopleNoRoom.length}</span>
                        </div>
                        <input type="search" placeholder="Pesquisar sem sala..." class="room-search-input w-full p-1.5 text-xs border border-red-200 rounded-lg outline-none focus:ring-2 focus:ring-red-500 bg-white">
                    </div>
                    <div class="p-2 space-y-2 room-cards-wrapper bg-slate-50"></div>
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
            
            let alertaClass = 'border-slate-200';
            if (item._alertaAtraso) {
                alertaClass = 'card-alerta-atrasado'; 
            } else if (item._alertaEspera) {
                alertaClass = 'card-alerta-espera'; 
            }

            // COR DA BORDA DE PRIORIDADE RESTAURADA
            const priorityClass = PautaService.getPriorityClass(item.priority) || '';
            
            // Adicionado border-y e border-r para que a borda esquerda espessa do priorityClass não seja sobrescrita pelo border padrão
            card.className = `assisted-card relative bg-white p-4 rounded-xl shadow-sm border-y border-r ${priorityClass} ${alertaClass} mb-2 group transition-shadow hover:shadow-md`;
            card.setAttribute('data-id', item.id);

            let docStatusHtml = '';
            if (item.selectedAction) {
                let statusColor = 'bg-slate-100 text-slate-600 border-slate-200';
                let statusText = 'Selecionado';
                let statusIcon = '📋';

                if (item.documentState === 'filling') {
                    statusColor = 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse';
                    statusText = 'Preenchendo';
                    statusIcon = '✏️';
                } else if (item.documentState === 'saved') {
                    statusColor = 'bg-green-50 text-green-700 border-green-200 font-medium';
                    statusText = 'Salvo';
                    statusIcon = '✅';
                } else if (item.documentState === 'pdf') {
                    statusColor = 'bg-purple-50 text-purple-700 border-purple-200 font-medium';
                    statusText = 'PDF Emitido';
                    statusIcon = '📄';
                }

                docStatusHtml = `
                    <div class="mt-2 flex flex-col gap-1.5">
                        <span class="text-[10px] font-medium text-slate-600 bg-slate-50 px-2 py-1 rounded border border-slate-200 truncate flex items-center gap-1 w-max">
                            <span>📂</span>
                            <span class="hidden xs:inline">${escapeHTML(item.selectedAction)}</span>
                            <span class="xs:hidden">${escapeHTML(item.selectedAction).substring(0, 15)}${item.selectedAction.length > 15 ? '...' : ''}</span>
                        </span>
                        <span class="${statusColor} text-[10px] px-2 py-1 rounded w-max border flex items-center gap-1">
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
                            <label class="text-[9px] font-semibold text-slate-500 mb-0.5">SALA</label>
                            <select class="change-room-select bg-slate-50 hover:bg-slate-100 text-slate-700 text-[10px] px-2 py-1 rounded-md font-medium border border-slate-200 outline-none cursor-pointer focus:ring-1 focus:ring-blue-500 max-w-[130px] truncate transition-colors shadow-sm" title="Mudar Sala do Assistido">
                                <option value="" ${!item.room ? 'selected' : ''}>Sem Sala</option>
                                ${options}
                            </select>
                        </div>
                    `;
                } else if (item.room) {
                    roomDropdownHtml = `
                        <div class="ml-auto flex flex-col items-end">
                            <label class="text-[9px] font-semibold text-slate-500 mb-0.5">SALA</label>
                            <span class="bg-slate-50 text-slate-700 text-[10px] px-2 py-1 rounded-md font-medium border border-slate-200 shadow-sm">${escapeHTML(item.room)}</span>
                        </div>
                    `;
                }
            }

            let timeInfoHtml = `<span class="bg-slate-100 text-slate-600 border border-slate-200 text-[10px] px-2 py-1 rounded font-medium">Chegada: --:--</span>`;
            if (item.arrivalTime) {
                try {
                    const arrivalDate = new Date(item.arrivalTime);
                    if (!isNaN(arrivalDate)) {
                        const horaChegada = arrivalDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                        if (item.type === 'agendamento' && scheduledTimeSeguro !== '--:--') {
                            timeInfoHtml = `
                                <div class="inline-flex items-center gap-2 bg-slate-50 border border-slate-200 text-slate-700 px-2.5 py-1 rounded text-[10px] shadow-sm w-max">
                                    <div class="flex items-center gap-1">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-slate-400"><path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h5"/><path d="M17.5 17.5 16 16.3V14"/><circle cx="16" cy="16" r="6"/></svg>
                                        <span>Agenda: <span class="font-semibold">${escapeHTML(scheduledTimeSeguro)}</span></span>
                                    </div>
                                    <div class="w-px h-3 bg-slate-300"></div>
                                    <div class="flex items-center gap-1">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-slate-400"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>
                                        <span>Chegou: <span class="font-semibold text-blue-600">${horaChegada}</span></span>
                                    </div>
                                </div>
                            `;
                        } else {
                            timeInfoHtml = `
                                <div class="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 text-slate-700 px-2.5 py-1 rounded text-[10px] shadow-sm w-max">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-slate-400"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>
                                    <span>Chegada: <span class="font-semibold">${horaChegada}</span></span>
                                </div>
                            `;
                        }
                    }
                } catch (e) {}
            }

            const numeroOrdem = index + 1;
            const numeroBadge = `
                <div class="absolute -left-2 -top-2 w-7 h-7 bg-white text-slate-600 rounded-full flex items-center justify-center font-bold text-xs shadow-sm border border-slate-200 z-20">
                    ${numeroOrdem}
                </div>
            `;

            const atenderButton = canAttend
                ? `<button data-id="${item.id}" data-name="${escapeHTML(nomeSeguro)}" class="${currentPautaData?.useDelegationFlow ? 'select-collaborator-btn' : 'attend-directly-from-aguardando-btn'} bg-blue-600 text-white font-medium py-2 px-3 rounded-lg hover:bg-blue-700 active:scale-95 text-xs shadow-sm transition-all w-full">Atender</button>`
                : '';

            const actionButtonsHTML = `
                <div class="absolute top-2 right-10 flex items-center">
                    <div class="relative">
                        <button data-id="${item.id}" class="quick-action-toggle text-slate-400 hover:text-blue-600 p-1 rounded-md hover:bg-slate-50 transition-colors" title="Opções">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
                                <path d="M3 9.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>
                            </svg>
                        </button>
                        <div id="quick-menu-${item.id}" class="quick-menu hidden absolute right-0 mt-1 w-44 bg-white rounded-xl shadow-lg border border-slate-200 z-30 py-1" role="menu">
                            <button data-id="${item.id}" data-tipo="reagendar" class="quick-action-item w-full text-left px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-50 hover:text-blue-600 flex items-center gap-2 transition-colors"><span>🔄</span> Reagendar</button>
                            <button data-id="${item.id}" data-tipo="agendar" class="quick-action-item w-full text-left px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-50 hover:text-blue-600 flex items-center gap-2 transition-colors"><span>📅</span> Agendar</button>
                            <button data-id="${item.id}" data-tipo="consulta" class="quick-action-item w-full text-left px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-50 hover:text-blue-600 flex items-center gap-2 transition-colors"><span>🔍</span> Consulta</button>
                            <button data-id="${item.id}" data-tipo="outros" class="quick-action-item w-full text-left px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-50 hover:text-blue-600 flex items-center gap-2 transition-colors"><span>⚙️</span> Outros</button>
                            <div class="h-px bg-slate-100 my-1 mx-2"></div>
                            <button data-id="${item.id}" class="edit-assisted-btn quick-action-item w-full text-left px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-50 hover:text-blue-600 flex items-center gap-2 transition-colors"><span>✏️</span> Editar Assistido</button>
                            <button data-id="${item.id}" class="view-details-btn quick-action-item w-full text-left px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-50 hover:text-blue-600 flex items-center gap-2 transition-colors"><span>👁️</span> Ver Detalhes</button>
                        </div>
                    </div>
                </div>
            `;

            card.innerHTML = `
                ${numeroBadge}
                ${canAttend ? actionButtonsHTML : ''}
                ${canDelete ? `
                <button data-id="${item.id}" class="delete-btn absolute top-2 right-2 text-slate-300 hover:text-red-500 p-1 rounded-md hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                </button>` : ''}
                
                <div class="flex flex-col h-full">
                    ${item.priority === 'URGENTE' ? `<div class="mb-1.5 text-[10px] font-bold text-red-600 flex items-center gap-1 bg-red-50 px-2 py-0.5 rounded border border-red-100 w-max">🚨 ${escapeHTML(priorityReasonSeguro)}</div>` : ''}
                    
                    <p class="font-semibold text-sm text-slate-800 leading-tight mb-2 truncate pr-14">${escapeHTML(nomeSeguro)}</p>

                    ${numAgendamento ? `<span class="inline-flex items-center gap-1 bg-slate-100 text-slate-600 border border-slate-200 px-2 py-1 rounded text-[10px] font-medium w-max mb-2">📅 Nº Agend.: ${escapeHTML(numAgendamento)}</span>` : ''}

                    <p class="text-xs text-slate-600 mb-3">Assunto: <span class="font-medium text-slate-700">${escapeHTML(assuntoSeguro)}</span></p>
                    
                    <div class="flex items-end justify-between w-full mb-3 gap-2">
                        <div class="flex flex-wrap items-center gap-2">
                            ${timeInfoHtml}
                        </div>
                        ${roomDropdownHtml}
                    </div>
                    
                    ${docStatusHtml}
                    
                    <div class="mt-4 flex flex-col gap-2">
                        <div class="flex gap-2">
                            ${atenderButton}
                            <button data-id="${item.id}" class="priority-btn ${item.priority === 'URGENTE' ? 'bg-orange-50 text-orange-600 border border-orange-200 hover:bg-orange-100' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'} font-medium py-2 px-3 rounded-lg text-xs shadow-sm transition-all active:scale-95 ${atenderButton ? 'w-auto' : 'w-full'}" ${canEditPriority ? '' : 'disabled'}>
                                ${item.priority === 'URGENTE' ? 'Urgência' : 'Prioridade'}
                            </button>
                        </div>
                        <button data-id="${item.id}" class="return-to-pauta-btn w-full bg-white border border-slate-200 text-slate-600 font-medium py-2 rounded-lg text-xs hover:bg-slate-50 transition-all active:scale-95 shadow-sm">
                            Voltar para Pauta
                        </button>
                    </div>
                    <button data-id="${item.id}" class="view-details-btn text-blue-600 hover:text-blue-700 hover:bg-blue-50 text-xs font-medium mt-3 text-center transition-colors py-1.5 rounded-lg w-full">Ver Detalhes</button>
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
            container.innerHTML = this._getEmptyStateHtml(
                `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>`,
                'Ninguém em atendimento'
            );
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
            const delegateBtnClass = isDelegated ? 'bg-indigo-50 border-indigo-200 text-indigo-400 cursor-not-allowed' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 active:scale-95';

            const card = document.createElement('div');
            card.className = `assisted-card relative bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-3 hover:shadow-md transition-shadow group`;
            card.setAttribute('data-id', item.id);

            const startTime = item.inAttendanceTime ?
                new Date(item.inAttendanceTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';

            const atendenteNome = this.getAttendantName(item);
            const numAgendamento = item.numAgendamento || item.numeroAgendamento || item.assistedManualNumAgendamento || '';

            const historicoTransferenciaHtml = item.historicoTransferencia
                ? `<div class="mt-3 bg-orange-50 border border-orange-200 text-orange-700 text-[10px] p-2 rounded-lg flex items-center gap-1.5 font-medium shadow-sm">
                       <span class="text-xs">🔄</span>
                       <span>${escapeHTML(item.historicoTransferencia)}</span>
                   </div>`
                : '';

            let docStatusHtml = '';
            if (item.selectedAction) {
                let statusColor = 'bg-slate-100 text-slate-600 border-slate-200';
                let statusText = 'Selecionado';
                let statusIcon = '📋';

                if (item.documentState === 'filling') {
                    statusColor = 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse';
                    statusText = 'Preenchendo';
                    statusIcon = '✏️';
                } else if (item.documentState === 'saved') {
                    statusColor = 'bg-green-50 text-green-700 border-green-200 font-medium';
                    statusText = 'Salvo';
                    statusIcon = '✅';
                } else if (item.documentState === 'pdf') {
                    statusColor = 'bg-purple-50 text-purple-700 border-purple-200 font-medium';
                    statusText = 'PDF Emitido';
                    statusIcon = '📄';
                }

                docStatusHtml = `
                    <div class="mt-3 flex flex-col gap-1.5">
                        <span class="text-[10px] font-medium text-slate-600 bg-slate-50 px-2 py-1 rounded border border-slate-200 truncate flex items-center gap-1 w-max">
                            <span>📂</span>
                            <span class="hidden xs:inline">${escapeHTML(item.selectedAction)}</span>
                            <span class="xs:hidden">${escapeHTML(item.selectedAction).substring(0, 15)}${item.selectedAction.length > 15 ? '...' : ''}</span>
                        </span>
                        <span class="${statusColor} text-[10px] px-2 py-1 rounded w-max border flex items-center gap-1">
                            <span>${statusIcon}</span>
                            <span class="hidden xs:inline">${statusText}</span>
                        </span>
                    </div>`;
            }

            const buttonsContainerHtml = canDelegateOrFinalize
                ? `<div class="mt-4 flex flex-col gap-2">
                        <div class="grid grid-cols-2 gap-2">
                            <button id="btn-delegar-card" data-id="${item.id}" data-name="${escapeHTML(item.name || '')}" data-collaborator-name="${escapeHTML(atendenteNome)}" class="select-collaborator-btn ${delegateBtnClass} border font-medium py-2 rounded-lg text-xs shadow-sm transition-all" ${canDelegate ? '' : 'disabled'}>
                                Delegar
                            </button>
                            <button data-id="${item.id}" class="attend-directly-from-aguardando-btn bg-blue-600 text-white font-medium py-2 rounded-lg text-xs shadow-sm transition-all active:scale-95 hover:bg-blue-700">
                                Finalizar
                            </button>
                        </div>
                        <button data-id="${item.id}" class="return-to-aguardando-from-emAtendimento-btn bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium py-2 rounded-lg text-xs shadow-sm transition-all active:scale-95">
                            Voltar para Fila
                        </button>
                        <button data-id="${item.id}" class="view-details-btn text-blue-600 hover:text-blue-700 hover:bg-blue-50 text-xs font-medium mt-2 text-center transition-colors py-1.5 rounded-lg w-full">
                            Ver Detalhes
                        </button>
                   </div>`
                : `<div class="mt-4">
                        <button data-id="${item.id}" class="view-details-btn text-blue-600 hover:text-blue-700 hover:bg-blue-50 text-xs font-medium w-full border border-blue-100 py-2 rounded-lg transition-colors">
                            👁️ Ver Detalhes / Checklist
                        </button>
                   </div>`;

            const numeroOrdem = index + 1;
            const numeroBadge = `
                <div class="absolute -left-2 -top-2 w-7 h-7 bg-white text-slate-600 rounded-full flex items-center justify-center font-bold text-xs shadow-sm border border-slate-200 z-20">
                    ${numeroOrdem}
                </div>
            `;

            card.innerHTML = `
                ${numeroBadge}
                ${canDelete ? `
                <button data-id="${item.id}" class="delete-btn absolute top-2 right-2 text-slate-300 hover:text-red-500 p-1 rounded-md hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                </button>` : ''}
                
                <div class="pr-8">
                    ${item.priority === 'URGENTE' ? `<div class="mb-1.5 text-[10px] font-bold text-red-600 flex items-center gap-1 bg-red-50 px-2 py-0.5 rounded border border-red-100 w-max">🚨 ${escapeHTML(item.priorityReason || '')}</div>` : ''}
                    <p class="font-semibold text-sm text-slate-800 leading-tight mb-2 truncate">${escapeHTML(item.name || '')}</p>
                </div>

                ${numAgendamento ? `<span class="inline-flex items-center gap-1 bg-slate-100 text-slate-600 border border-slate-200 px-2 py-1 rounded text-[10px] font-medium w-max mb-2">📅 Nº Agend.: ${escapeHTML(numAgendamento)}</span>` : ''}
                
                <div class="space-y-1.5 text-xs text-slate-600">
                    <p>Assunto: <span class="font-medium text-slate-700">${escapeHTML(item.subject || 'Não informado')}</span></p>
                    <p>Colaborador: <span class="font-medium text-blue-600">${escapeHTML(atendenteNome)}</span></p>
                    <div class="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 text-slate-500 px-2 py-1 rounded text-[10px] w-max mt-1">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        Início: <span class="font-medium">${startTime}</span>
                    </div>
                </div>

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
            container.innerHTML = this._getEmptyStateHtml(
                `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>`,
                'Nenhum atendimento finalizado'
            );
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
            card.className = 'assisted-card relative bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-3 hover:shadow-md transition-shadow group';
            card.setAttribute('data-id', item.id);

            const arrivalT = item.arrivalTime ?
                new Date(item.arrivalTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'N/A';
            const attendedT = item.attendedAt ?
                new Date(item.attendedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';

            const atendenteNome = this.getAttendantName(item);
            const numAgendamento = item.numAgendamento || item.numeroAgendamento || item.assistedManualNumAgendamento || '';

            const confirmButton = item.isConfirmed
                ? 'bg-green-100 border-green-200 text-green-600'
                : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-100';

            card.innerHTML = `
                <div class="flex justify-between items-start mb-2">
                    <p class="font-semibold text-sm text-slate-800 leading-tight pr-2">${escapeHTML(item.name || '')}</p>
                    <button data-id="${item.id}" class="toggle-confirmed-atendido w-7 h-7 rounded-full border flex items-center justify-center ${confirmButton} transition-all active:scale-95 flex-shrink-0" ${canToggleConfirmed ? '' : 'disabled'} title="Status">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M12.736 3.97a.733.733 0 0 1 1.047 0c.286.289.29.756.01.105L7.882 12.5a.733.733 0 0 1-1.065.04L3.257 8.375a.733.733 0 0 1 1.064-.04l2.254 2.255Z"/>
                        </svg>
                    </button>
                </div>

                ${numAgendamento ? `<span class="inline-flex items-center gap-1 bg-slate-100 text-slate-600 border border-slate-200 px-2 py-1 rounded text-[10px] font-medium w-max mb-2">📅 Nº Agend.: ${escapeHTML(numAgendamento)}</span>` : ''}
                
                <p class="text-xs text-slate-600 mb-2">Assunto: <span class="font-medium text-slate-700">${escapeHTML(item.subject || 'Não informado')}</span></p>

                ${item.tipoAcaoRapida ? (() => {
                    const acaoCfg = {
                        'Reagendamento':       { icon: '🔄', bg: '#fef3c7', border: '#fde68a', text: '#92400e', label: 'REAGENDADO' },
                        'Agendamento':         { icon: '📅', bg: '#ecfdf5', border: '#d1fae5', text: '#065f46', label: 'AGENDADO' },
                        'Consulta Processual': { icon: '🔍', bg: '#f3e8ff', border: '#ede9fe', text: '#5b21b6', label: 'CONSULTA' },
                        'Outros Assuntos':     { icon: '⚙️', bg: '#f0f9ff', border: '#e0f2fe', text: '#0369a1', label: 'OUTROS' }
                    }[item.tipoAcaoRapida] || { icon: '⚡', bg: '#f8fafc', border: '#dcfce3', text: '#166534', label: item.tipoAcaoRapida };
                    return `<div class="mb-3">
                        <span style="background:${acaoCfg.bg};border:1px solid ${acaoCfg.border};color:${acaoCfg.text}" class="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-lg">
                            ${acaoCfg.icon} ${acaoCfg.label}
                        </span>
                    </div>`;
                })() : ''}

                <div class="grid grid-cols-3 gap-2 text-center border-t border-b border-slate-100 py-2.5 my-3 text-[10px] text-slate-500 font-medium">
                    <div>Agenda<br><span class="text-slate-800 font-semibold">${item.scheduledTime || 'N/A'}</span></div>
                    <div class="border-l border-r border-slate-100">Chegou<br><span class="text-slate-800 font-semibold">${arrivalT}</span></div>
                    <div>Fim<br><span class="text-slate-800 font-semibold">${attendedT}</span></div>
                </div>

                <div class="flex flex-col gap-2 mb-4">
                    <p class="text-xs text-slate-500">Por: <span class="text-slate-800 font-medium">${escapeHTML(atendenteNome)}</span></p>
                    <div class="flex flex-wrap gap-x-3 gap-y-2">
                        <button data-id="${item.id}" class="manage-demands-btn text-blue-600 text-xs font-medium hover:text-blue-700 transition-colors" ${canManageDemandsOrEditAttendant ? '' : 'disabled'}>Demandas</button>
                        <button data-id="${item.id}" class="edit-assisted-btn text-slate-500 text-xs font-medium hover:text-slate-700 transition-colors" ${canManageDemandsOrEditAttendant ? '' : 'disabled'}>Dados</button>
                        <button data-id="${item.id}" class="edit-attendant-btn text-emerald-600 text-xs font-medium hover:text-emerald-700 transition-colors" ${canManageDemandsOrEditAttendant ? '' : 'disabled'}>Atendente</button>
                        <button data-id="${item.id}" class="delete-btn text-red-500 text-xs font-medium hover:text-red-700 transition-colors" ${canDelete ? '' : 'disabled'}>Deletar</button>
                    </div>
                </div>

                ${item.arquivoPdfConteudo ? `
                    <a href="${item.arquivoPdfConteudo}" download="${item.nomeArquivoPdf || 'protocolo.pdf'}" class="mb-4 flex items-center justify-center gap-2 w-full bg-blue-50 text-blue-600 font-medium py-2 rounded-lg text-xs border border-blue-100 hover:bg-blue-100 transition-colors">
                        📄 Baixar Protocolo
                    </a>
                ` : ''}

                <div class="pt-3 border-t border-slate-100">
                    <button data-id="${item.id}" class="return-from-atendido-btn w-full bg-white border border-slate-200 text-slate-600 font-medium py-2 rounded-lg text-xs shadow-sm hover:bg-slate-50 transition-all active:scale-95" ${canRevert ? '' : 'disabled'}>
                        Mover de Volta
                    </button>
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
            container.innerHTML = this._getEmptyStateHtml(
                `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M22 10.5h-6m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" /></svg>`,
                'Nenhum assistido faltou hoje'
            );
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

            card.className = 'assisted-card relative bg-white p-4 rounded-xl shadow-sm border border-red-200 mb-3 group hover:shadow-md transition-shadow';
            card.setAttribute('data-id', item.id);

            const confirmButtonClass = isConfirmed
                ? 'bg-green-100 border-green-200 text-green-600'
                : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-100';

            card.innerHTML = `
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <p class="font-semibold text-sm text-slate-800 leading-tight">${escapeHTML(item.name || '')}</p>
                        <span class="inline-flex items-center gap-1 text-[10px] font-medium text-red-600 bg-red-50 border border-red-100 px-2 py-0.5 rounded mt-1.5">🚫 Faltoso</span>
                    </div>

                    <button data-id="${item.id}" class="toggle-confirmed-faltoso w-7 h-7 rounded-full border flex items-center justify-center ${confirmButtonClass} shadow-sm transition-all active:scale-95 flex-shrink-0" ${canToggleConfirmed ? '' : 'disabled'} title="Lançar falta no Verde">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M12.736 3.97a.733.733 0 0 1 1.047 0c.286.289.29.756.01.105L7.882 12.5a.733.733 0 0 1-1.065.04L3.257 8.375a.733.733 0 0 1 1.064-.04l2.254 2.255Z"/>
                        </svg>
                    </button>
                </div>

                ${numAgendamento ? `<span class="inline-flex items-center gap-1 bg-slate-100 text-slate-600 border border-slate-200 px-2 py-1 rounded text-[10px] font-medium w-max mb-2 mt-1">📅 Nº Agend.: ${escapeHTML(numAgendamento)}</span>` : ''}
                
                <p class="text-xs text-slate-600 mb-2">Assunto: <span class="font-medium text-slate-700">${escapeHTML(item.subject || 'Não informado')}</span></p>

                <div class="grid grid-cols-2 gap-2 text-center border-t border-b border-slate-100 py-2.5 my-3 text-[10px] text-slate-500 font-medium">
                    <div class="border-r border-slate-100">Agendado<br><span class="text-slate-800 font-semibold">${item.scheduledTime || '---'}</span></div>
                    <div>Marcado às<br><span class="text-slate-800 font-semibold">${item.lastActionTimestamp ? new Date(item.lastActionTimestamp).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : '--:--'}</span></div>
                </div>

                <div class="flex flex-col gap-2 mb-3 text-xs">
                    <p class="text-slate-500">Status: <span class="${isConfirmed ? 'text-green-600' : 'text-amber-600'} font-medium">${isConfirmed ? 'Lançado no Verde' : 'Pendente no Verde'}</span></p>
                    <div class="flex gap-3">
                        <button data-id="${item.id}" class="edit-assisted-btn text-blue-600 font-medium hover:text-blue-700 transition-colors" ${canRevert ? '' : 'disabled'}>Dados</button>
                        <button data-id="${item.id}" class="delete-btn text-red-500 font-medium hover:text-red-700 transition-colors" ${canDelete ? '' : 'disabled'}>Deletar</button>
                    </div>
                </div>

                <div class="pt-3 border-t border-slate-100">
                    <button data-id="${item.id}" class="return-to-pauta-from-faltoso-btn w-full bg-white border border-slate-200 text-slate-600 font-medium py-2 px-4 rounded-lg text-xs shadow-sm hover:bg-slate-50 transition-all active:scale-95" ${canRevert ? '' : 'disabled'}>
                        Reativar Assistido
                    </button>
                </div>

                ${this._getStandardizedFooterHtml(item)}
            `;
            container.appendChild(card);
        });
    },

    renderDistribuicaoColumn(items, pautaId, userName) {
        const container = document.getElementById('distribuicao-list');
        if (!container) return;

        const columnHeader = container.parentElement?.querySelector('h3');
        if (columnHeader && columnHeader.innerHTML.includes('Distribuição')) {
            columnHeader.innerHTML = columnHeader.innerHTML.replace('Distribuição', 'Distribuição / Assinatura');
        }

        if (items.length === 0) {
            container.innerHTML = this._getEmptyStateHtml(
                `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971z" /></svg>`,
                'Nenhum processo aguardando assinatura'
            );
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
            groupDiv.className = "mb-4 border border-cyan-200 rounded-xl overflow-hidden bg-cyan-50 shadow-sm";

            const linkPainel = `${baseUrl}/atendimento_externo.html?pautaId=${pautaId}&colab=${encodeURIComponent(defensor)}`;

            const headerHtml = `
                <div class="bg-white p-3 border-b border-cyan-200 flex flex-col gap-2">
                    <div class="flex justify-between items-center px-1">
                        <h4 class="font-semibold text-cyan-800 text-xs flex items-center gap-1.5">
                            <span>👨‍⚖️</span> ${escapeHTML(defensor)}
                        </h4>
                        <span class="bg-cyan-100 text-cyan-800 border border-cyan-200 text-[10px] font-semibold px-2 py-0.5 rounded-full">${groups[defensor].length}</span>
                    </div>
                    <button onclick="navigator.clipboard.writeText('${linkPainel}'); window.showNotification('Link do painel copiado!', 'success');" class="w-full bg-cyan-50 border border-cyan-200 text-cyan-700 hover:bg-cyan-100 active:scale-95 text-xs font-medium py-1.5 rounded-lg shadow-sm flex items-center justify-center gap-1.5 transition-all">
                        <span>📋</span> Copiar Link
                    </button>
                </div>
                <div class="p-2 space-y-2 room-cards-wrapper"></div>
            `;
            groupDiv.innerHTML = headerHtml;
            const cardsWrapper = groupDiv.querySelector('.room-cards-wrapper');

            groups[defensor].forEach((item, index) => {
                const currentUserRole = window.app?.currentUser?.role;
                const canManageDistribution = currentUserRole !== 'apoio';
                const canDelete = currentUserRole === 'admin' || currentUserRole === 'superadmin';
                const numAgendamento = item.numAgendamento || item.numeroAgendamento || item.assistedManualNumAgendamento || '';

                const card = document.createElement('div');
                card.className = 'assisted-card relative bg-white p-4 rounded-xl shadow-sm border border-slate-200 hover:border-cyan-300 transition-colors group';
                card.setAttribute('data-id', item.id);

                const linkExterno = `${baseUrl}/atendimento_externo.html?pautaId=${pautaId}&assistidoId=${item.id}&colab=${encodeURIComponent(userName)}&token=${item.delegationToken || ''}`;

                const numeroOrdem = index + 1;
                const numeroBadge = `
                    <div class="absolute -left-2 -top-2 w-7 h-7 bg-white text-cyan-700 rounded-full flex items-center justify-center font-bold text-xs shadow-sm border border-cyan-200 z-20">
                        ${numeroOrdem}
                    </div>
                `;

                const badgeStatus = item.status === 'aguardandoCorrecao'
                    ? `<span class="inline-flex bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-medium px-2 py-0.5 rounded mb-2">Para Avaliação</span>`
                    : `<span class="inline-flex bg-cyan-50 text-cyan-700 border border-cyan-200 text-[10px] font-medium px-2 py-0.5 rounded mb-2">Para Assinatura</span>`;

                const historicoTransferenciaHtml = item.historicoTransferencia
                    ? `<div class="mt-2.5 bg-orange-50 border border-orange-200 text-orange-700 text-[10px] p-2 rounded-lg flex items-center gap-1.5 font-medium shadow-sm">
                           <span class="text-xs">🔄</span>
                           <span>${escapeHTML(item.historicoTransferencia)}</span>
                       </div>`
                    : '';

                let docStatusHtml = '';
                if (item.selectedAction) {
                    let statusColor = 'bg-slate-100 text-slate-600 border-slate-200';
                    let statusText = 'Selecionado';
                    let statusIcon = '📋';

                    if (item.documentState === 'filling') {
                        statusColor = 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse';
                        statusText = 'Preenchendo';
                        statusIcon = '✏️';
                    } else if (item.documentState === 'saved') {
                        statusColor = 'bg-green-50 text-green-700 border-green-200 font-medium';
                        statusText = 'Salvo';
                        statusIcon = '✅';
                    } else if (item.documentState === 'pdf') {
                        statusColor = 'bg-purple-50 text-purple-700 border-purple-200 font-medium';
                        statusText = 'PDF Emitido';
                        statusIcon = '📄';
                    }

                    docStatusHtml = `
                        <div class="mt-2.5 flex flex-col gap-1.5">
                            <span class="text-[10px] font-medium text-cyan-700 bg-cyan-50 px-2 py-1 rounded border border-cyan-200 truncate flex items-center gap-1 w-max">
                                <span>📂</span>
                                <span class="hidden xs:inline">${escapeHTML(item.selectedAction)}</span>
                                <span class="xs:hidden">${escapeHTML(item.selectedAction).substring(0, 15)}${item.selectedAction.length > 15 ? '...' : ''}</span>
                            </span>
                            <span class="${statusColor} text-[10px] px-2 py-1 rounded w-max border flex items-center gap-1">
                                <span>${statusIcon}</span>
                                <span class="hidden xs:inline">${statusText}</span>
                            </span>
                        </div>`;
                }

                const deleteBtnHtml = canDelete ? `
                    <button data-id="${item.id}" class="delete-btn absolute top-3 right-3 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 z-10">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>` : '';

                const actionControlsHtml = canManageDistribution
                    ? `<div class="mt-4 flex flex-col gap-2">
                            <div class="grid grid-cols-2 gap-2">
                                <button onclick="window.open('${linkExterno}', '_blank')" class="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-medium py-2 rounded-lg text-xs shadow-sm transition-all active:scale-95">
                                    Abrir Link
                                </button>
                                <button data-id="${item.id}" class="delegate-finalization-btn bg-green-600 hover:bg-green-700 text-white font-medium py-2 rounded-lg text-xs shadow-sm transition-all active:scale-95">
                                    Concluir
                                </button>
                            </div>
                            <button data-id="${item.id}" class="return-to-aguardando-from-dist-btn w-full bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium py-2 rounded-lg text-xs shadow-sm transition-all active:scale-95">
                                Reverter para Fila
                            </button>
                       </div>`
                    : `<div class="mt-4">
                            <button data-id="${item.id}" class="view-details-btn text-blue-600 hover:text-blue-700 hover:bg-blue-50 text-xs font-medium w-full border border-blue-100 py-2 rounded-lg transition-colors">
                                👁️ Ver Detalhes / Checklist
                            </button>
                       </div>`;

                card.innerHTML = `
                    ${numeroBadge}
                    ${deleteBtnHtml}

                    <div class="pr-8 pl-1">
                        ${badgeStatus}
                        <p class="font-semibold text-sm text-slate-800 leading-tight mb-2">${escapeHTML(item.name || '')}</p>
                    </div>

                    ${numAgendamento ? `<span class="inline-flex items-center gap-1 bg-slate-100 text-slate-600 border border-slate-200 px-2 py-1 rounded text-[10px] font-medium w-max mb-2">📅 Nº Agend.: ${escapeHTML(numAgendamento)}</span>` : ''}
                    
                    <div class="space-y-1 text-xs text-slate-600 mt-1">
                        <p>Assunto: <span class="font-medium text-slate-700">${escapeHTML(item.subject || 'Não informado')}</span></p>
                        ${item.numeroProcesso ? `<p class="text-blue-600 font-medium">Nº Proc: ${escapeHTML(item.numeroProcesso)}</p>` : ''}
                    </div>

                    ${historicoTransferenciaHtml}
                    ${docStatusHtml}

                    ${item.notasRevisao ? `
                        <div class="mt-3 bg-amber-50 text-amber-800 text-[11px] p-3 rounded-lg border border-amber-200 shadow-sm leading-relaxed">
                            <span class="font-semibold text-amber-900 block mb-1">⚠️ NOTA PARA O DEFENSOR:</span>
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
            <div class="bg-white p-5 sm:p-8 rounded-2xl shadow-xl w-full max-w-2xl relative flex flex-col border border-slate-100" style="max-height: 95vh;" onclick="event.stopPropagation()">
                <div class="flex-shrink-0 mb-5 pr-8 border-b border-slate-100 pb-4">
                    <button id="close-format-help-x" class="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-2xl leading-none transition-colors">&times;</button>
                    <h2 class="text-xl font-bold leading-tight text-slate-800">Preparar Pauta (Importação)</h2>
                </div>
                <div class="flex-grow overflow-y-auto scrollable-content pr-2 sm:pr-4 text-slate-600">
                    <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-3 gap-2">
                         <p class="font-medium text-sm text-slate-700">O arquivo deve seguir este formato (4 ou 5 colunas):</p>
                         <button id="copy-format-btn" class="bg-white border border-slate-200 text-slate-600 text-xs font-medium py-1.5 px-3 rounded-lg hover:bg-slate-50 w-full sm:w-auto transition-colors shadow-sm active:scale-95">Copiar Formato</button>
                    </div>
                    <div class="bg-slate-50 p-3 sm:p-4 rounded-xl text-xs sm:text-sm mb-6 overflow-x-auto border border-slate-200">
                        <code id="format-text-code" class="whitespace-nowrap font-mono text-slate-700">Nº Agend(opcional);Nome Completo do Assistido;HH:MM;Matéria do Assunto;CPF(opcional)</code>
                    </div>

                    <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-3 gap-2">
                        <h3 class="text-sm font-bold text-slate-800">Exemplo prático:</h3>
                        <button id="copy-example-btn" class="bg-white border border-slate-200 text-slate-600 text-xs font-medium py-1.5 px-3 rounded-lg hover:bg-slate-50 w-full sm:w-auto transition-colors shadow-sm active:scale-95">Copiar Exemplo</button>
                    </div>
                    <pre class="bg-slate-50 p-3 sm:p-4 rounded-xl text-xs sm:text-sm overflow-x-auto mb-6 border border-slate-200 text-slate-700"><code id="example-text-code" class="whitespace-pre-wrap word-break font-mono">12345;Maria Joaquina de Amaral Pereira;09:00;Divórcio Consensual;111.222.333-44

;João da Silva;09:30;Ação de Alimentos;

67890;Fulano de Tal;10:00;Curatela;444.555.666-77</code></pre>

                    <ul class="list-disc list-inside space-y-2 text-sm mb-6 text-slate-600">
                        <li>A primeira linha (cabeçalho) é <strong>opcional</strong>. O sistema a ignorará se presente.</li>
                        <li>O campo <strong>Nº Agend</strong> é opcional. Deixe em branco se não houver.</li>
                        <li>O campo <strong>CPF</strong> é opcional.</li>
                        <li>O <strong>horário</strong> deve estar no formato <strong>HH:MM</strong> (Ex: 09:00, 14:30).</li>
                        <li>Salve o arquivo com a extensão <strong>.csv</strong>.</li>
                    </ul>

                    <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-3 gap-2 pt-5 border-t border-slate-100">
                        <h3 class="text-sm font-bold text-slate-800">Prompt para IA (ChatGPT, Claude, etc):</h3>
                        <button id="copy-prompt-btn" class="bg-white border border-slate-200 text-slate-600 text-xs font-medium py-1.5 px-3 rounded-lg hover:bg-slate-50 w-full sm:w-auto transition-colors shadow-sm active:scale-95">Copiar Prompt</button>
                    </div>
                    <p class="text-xs sm:text-sm mb-3 text-slate-600">Copie o texto abaixo e cole junto com sua pauta em PDF na IA para formatar automaticamente.</p>
                    <pre class="bg-slate-50 p-3 sm:p-4 rounded-xl text-xs sm:text-sm overflow-x-auto border border-slate-200 text-slate-700"><code id="prompt-text-code" class="whitespace-pre-wrap word-break font-mono">Olá! Por favor, converta o conteúdo do arquivo PDF que estou enviando para o formato CSV, usando ponto e vírgula (;) como separador. O resultado deve seguir este padrão:

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

                    btn.classList.remove('bg-white', 'text-slate-600', 'border-slate-200');
                    btn.classList.add('bg-green-500', 'text-white', 'border-green-500');

                    if (window.showNotification) window.showNotification("Texto copiado para a área de transferência!", "success");

                    setTimeout(() => {
                        btn.innerHTML = originalHtml;
                        btn.classList.remove('bg-green-500', 'text-white', 'border-green-500');
                        btn.classList.add('bg-white', 'text-slate-600', 'border-slate-200');
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
        modal.className = 'fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm transition-opacity';
        modal.innerHTML = `
            <div class="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden transform scale-100 transition-transform border border-slate-100">
                <div class="p-6 text-center">
                    <div class="w-14 h-14 bg-amber-50 border border-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                    </div>
                    <h3 class="text-lg font-bold text-slate-800 mb-2">Pauta Fechada / Expirada</h3>
                    <p class="text-sm text-slate-500 mb-6 leading-relaxed">
                        A pauta <b class="text-slate-700">${escapeHTML(pauta.name)}</b> atingiu o limite de tempo e foi bloqueada.<br><br>
                        Você não pode mais alterá-la, mas os dados estão a salvo. O que deseja fazer?
                    </p>
                    <div class="flex flex-col gap-2">
                        <button id="expired-stats-btn" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors shadow-sm flex items-center justify-center gap-2 active:scale-95">
                            Abrir Estatísticas / PDFs
                        </button>
                        <button id="expired-cancel-btn" class="w-full bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-medium py-2.5 px-4 rounded-lg transition-colors shadow-sm active:scale-95">
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
            btn.innerHTML = '<svg class="animate-spin h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Buscando Arquivo...';
            btn.disabled = true;

            try {
                const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
                const snapshot = await getDocs(collection(app.db, "pautas", pauta.id, "attendances"));
                const allAssisted = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                modal.remove();

                if (window.StatisticsService && typeof window.StatisticsService.showModal === 'function') {
                    window.StatisticsService.showModal(allAssisted, pauta.useDelegationFlow, pauta.name);
                } else {
                    window.showNotification("Módulo de estatísticas não carregado.", "error");
                }
            } catch (error) {
                console.error(error);
                window.showNotification("Erro ao buscar dados arquivados.", "error");
                modal.remove();
            }
        };
    },

    applyPopoutMode() {
        const urlParams = new URLSearchParams(window.location.search);
        const popoutCol = urlParams.get('popout');
        
        if (popoutCol) {
            document.body.classList.add('is-popout');
            document.title = `SIGEP - Monitor: ${popoutCol.toUpperCase()}`;

            setTimeout(() => {
                const cols = [
                    document.getElementById('pauta-column'),
                    document.getElementById('aguardando-count')?.closest('.bg-white.rounded-lg.shadow-md.flex.flex-col'),
                    document.getElementById('em-atendimento-column'),
                    document.getElementById('distribuicao-column'),
                    document.getElementById('atendidos-column'),
                    document.getElementById('faltosos-column')
                ];
                
                const names = ['pauta', 'aguardando', 'em-atendimento', 'distribuicao', 'atendidos', 'faltosos'];
                
                cols.forEach((col, index) => {
                    if (col) {
                        col.classList.add('column-wrapper-base');
                        if (names[index] === popoutCol) {
                            col.classList.add('popout-active');
                            col.classList.remove('hidden');
                        }
                    }
                });
            }, 300);
        }
    },

    setupColumnControls(app) {
        if (document.body.classList.contains('is-popout')) return;

        const columns = [
            { colId: 'pauta-column', titleId: 'pauta-count', popoutId: 'pauta' },
            { colId: document.getElementById('aguardando-count')?.closest('.bg-white.rounded-lg.shadow-md.flex.flex-col'), titleId: 'aguardando-count', popoutId: 'aguardando' },
            { colId: 'em-atendimento-column', titleId: 'em-atendimento-count', popoutId: 'em-atendimento' },
            { colId: 'distribuicao-column', titleId: 'distribuicao-count', popoutId: 'distribuicao' },
            { colId: 'atendidos-column', titleId: 'atendidos-count', popoutId: 'atendidos' },
            { colId: 'faltosos-column', titleId: 'faltosos-count', popoutId: 'faltosos' }
        ];

        columns.forEach(col => {
            const container = typeof col.colId === 'string' ? document.getElementById(col.colId) : col.colId;
            const countBadge = document.getElementById(col.titleId);
            
            if (container && countBadge && !container.hasAttribute('data-controls-added')) {
                container.setAttribute('data-controls-added', 'true');
                
                container.classList.add('border', 'border-slate-200', 'shadow-sm');
                
                const headerFlex = countBadge.parentElement; 
                
                const btnGroup = document.createElement('div');
                btnGroup.className = 'flex items-center gap-1 ml-auto pl-2 flex-shrink-0';
                btnGroup.innerHTML = `
                    <button class="btn-maximize bg-white hover:bg-slate-100 border border-slate-200 text-slate-500 hover:text-slate-700 p-1.5 rounded-lg transition-colors shadow-sm active:scale-95" title="Expandir">
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                    </button>
                    <button class="btn-popout bg-white hover:bg-slate-100 border border-slate-200 text-blue-600 hover:text-blue-700 p-1.5 rounded-lg transition-colors shadow-sm active:scale-95" title="Monitor Secundário">
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                    </button>
                `;

                headerFlex.appendChild(btnGroup);

                btnGroup.querySelector('.btn-maximize').onclick = (e) => {
                    e.stopPropagation();
                    const isMax = container.classList.contains('column-maximized');
                    
                    document.querySelectorAll('.column-maximized').forEach(el => el.classList.remove('column-maximized'));
                    
                    if (!isMax) {
                        container.classList.add('column-maximized');
                        document.body.style.overflow = 'hidden'; 
                    } else {
                        container.classList.remove('column-maximized');
                        document.body.style.overflow = '';
                    }
                };

                btnGroup.querySelector('.btn-popout').onclick = (e) => {
                    e.stopPropagation();
                    const url = new URL(window.location.href);
                    url.searchParams.set('popout', col.popoutId);
                    window.open(url.toString(), '_blank', 'width=1200,height=800,left=150,top=100');
                };
            }
        });
    }
}; // Fim do objeto UIService
