// js/ui.js - CORE VISUAL E MOTOR DE RENDERIZAÇÃO (PADRÃO SIGEP)

import { escapeHTML, normalizeText, showNotification } from './utils.js';
import { PautaService } from './pauta.js';
import { PainelGeralService } from './painelGeralService.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// INJEÇÃO DE CORREÇÕES GLOBAIS PARA MOBILE (Agilidade de Toque e Modais)
if (typeof document !== 'undefined' && !document.getElementById('sigep-ui-fixes')) {
    const style = document.createElement('style');
    style.id = 'sigep-ui-fixes';
    style.innerHTML = `
        /* Remove o delay de 300ms ao clicar em botões no celular, deixando super ágil */
        button, a, select, .touch-manipulation { touch-action: manipulation !important; }
        
        /* Corrige o vazamento do modal de confirmar chegada no celular */
        #arrival-modal .bg-white { width: 92% !important; max-width: 400px !important; padding: 1.5rem !important; box-sizing: border-box; overflow: hidden; }
        #arrival-time-input, #arrival-room-select, #arrival-time { width: 100% !important; box-sizing: border-box !important; }
    `;
    document.head.appendChild(style);
}

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
        btnNaoAtribuir.className = "collaborator-item w-full text-left p-3 mb-3 bg-white border border-slate-200 rounded-xl hover:border-slate-400 hover:bg-slate-50 transition-all flex items-center gap-3 shadow-sm";
        btnNaoAtribuir.dataset.nome = 'nao atribuir';
        btnNaoAtribuir.innerHTML = `
            <div class="w-10 h-10 rounded border border-dashed border-slate-300 flex items-center justify-center text-slate-400 flex-shrink-0 bg-slate-50">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </div>
            <div class="overflow-hidden">
                <div class="font-bold text-slate-800 text-sm">Não atribuir a nenhum profissional</div>
                <div class="text-[10px] text-slate-500 font-medium mt-0.5">O atendimento será livre</div>
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
            const msg = document.createElement('div');
            msg.className = 'text-center text-slate-400 py-6 text-sm flex flex-col items-center gap-2';
            msg.innerHTML = `
                <div class="text-slate-300 mb-1"><svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
                <span class="font-bold text-slate-500">Nenhum colaborador carregado.</span>
                <span class="text-xs">Verifique a aba <b>Ações → Colaboradores</b> no painel.</span>
            `;
            container.appendChild(msg);
        } else {
            colabs.forEach(c => {
                try {
                    const btn = document.createElement('button');
                    btn.className = "collaborator-item w-full text-left p-3 mb-2 bg-white border border-slate-200 rounded-lg hover:border-blue-500 hover:shadow-md transition-all flex items-center gap-3";
                    
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
                        <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-100 to-indigo-100 text-blue-700 font-bold flex items-center justify-center text-sm flex-shrink-0 border border-blue-200 uppercase">${escapeHTML(iniciais)}</div>
                        <div class="overflow-hidden w-full">
                            <div class="font-bold text-slate-800 text-sm truncate">${escapeHTML(nomeSeguro)}</div>
                            <div class="text-[10px] text-slate-500 font-medium tracking-wide mt-0.5">
                                ${escapeHTML(c.cargo || 'Membro')} ${c.equipe ? `<span class="mx-1 text-slate-300">•</span> Eq: ${escapeHTML(c.equipe)}` : ''}
                            </div>
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
                const items = container.querySelectorAll('.collaborator-item');
                items.forEach(item => {
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
            b.classList.remove('border-blue-500', 'ring-2', 'ring-blue-100', 'bg-blue-50/30');
            b.classList.add('border-slate-200');
        });
        btnSelecionado.classList.add('border-blue-500', 'ring-2', 'ring-blue-100', 'bg-blue-50/30');
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
            <div id="periodo-filters-container" class="flex flex-wrap gap-4 mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200 ${isPeriodo ? '' : 'hidden'} animate-fade-in">
                <div class="flex-1 min-w-[150px]">
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Data Inicial</label>
                    <input type="date" id="filter-data-inicial" class="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none">
                </div>
                <div class="flex-1 min-w-[150px]">
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Data Final</label>
                    <input type="date" id="filter-data-final" class="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none">
                </div>
                ${isEventoMode ? `
                <div class="flex-1 min-w-[200px]">
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Tipo de Evento</label>
                    <select id="filter-tipo-pauta" class="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none">
                        <option value="todos">Todos os Tipos</option>
                        <option value="mutirao">Mutirão</option>
                        <option value="plantao">Plantão</option>
                        <option value="acao_social">Ação Social</option>
                    </select>
                </div>` : ''}
                <div class="flex items-end">
                    <button id="aplicar-filtro-periodo" class="bg-green-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-green-700 transition shadow-md w-full sm:w-auto">
                        Aplicar Filtro
                    </button>
                </div>
            </div>
        `;

        const unidadesOptions = `<option value="todas">Carregando unidades...</option>`;

        const unidadesFiltersHTML = !isEventoMode ? `
            <div id="unidades-filters-container" class="flex flex-wrap gap-4 mt-4 p-4 bg-indigo-50 rounded-lg border border-indigo-100 ${isUnidades ? '' : 'hidden'} animate-fade-in">
                <div class="flex-1 min-w-[250px]">
                    <label class="block text-xs font-bold text-indigo-800 uppercase mb-1">Selecione a Origem / Unidade</label>
                    <select id="filter-unidade-select" class="w-full p-2 border border-indigo-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                        ${unidadesOptions}
                    </select>
                </div>
                <div class="flex-1 min-w-[200px]">
                    <label class="block text-xs font-bold text-indigo-800 uppercase mb-1">Status da Pauta</label>
                    <select id="filter-unidade-status" class="w-full p-2 border border-indigo-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                        <option value="ativas">Ativas (não expiradas)</option>
                        <option value="todas">Todas (incluindo expiradas)</option>
                        <option value="expiradas">Apenas Expiradas</option>
                    </select>
                </div>
                <div class="flex items-end">
                    <button id="aplicar-filtro-unidades" class="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-indigo-700 transition shadow-md w-full sm:w-auto">
                        Buscar Pautas
                    </button>
                </div>
            </div>
        ` : '';

        container.innerHTML = `
            <div class="flex flex-col items-center mb-6">
                <div class="w-full max-w-sm relative group">
                    <label for="main-pauta-filter" class="block text-xs font-bold text-gray-500 uppercase mb-1.5 ml-1 text-center w-full">Filtro de Exibição</label>
                    <div class="relative">
                        <select id="main-pauta-filter" class="w-full p-3 pl-4 pr-10 appearance-none border-2 border-gray-200 hover:border-green-400 rounded-xl text-sm bg-white shadow-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 font-bold outline-none transition-all cursor-pointer text-gray-700">
                            <option value="all" ${activeFilter === 'all' ? 'selected' : ''}> Mostrar Todas as Pautas</option>
                            <option value="active" ${activeFilter === 'active' ? 'selected' : ''}> Pautas ativas (com prazo)</option>
                            <option value="expired" ${activeFilter === 'expired' ? 'selected' : ''}> Pautas expiradas</option>
                            <option value="my" ${activeFilter === 'my' ? 'selected' : ''}> Criadas por mim</option>
                            <option value="shared" ${activeFilter === 'shared' ? 'selected' : ''}> Compartilhadas comigo</option>
                            ${hasUnidadesVinculadas && !isEventoMode ? `<option value="unidades" ${activeFilter === 'unidades' ? 'selected' : ''}> Filtrar por Origem / Unidade</option>` : ''}
                            <option value="periodo" ${activeFilter === 'periodo' ? 'selected' : ''}> Filtrar por Período${isEventoMode ? ' / Tipo' : ''}</option>
                        </select>
                        <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-green-600 group-hover:text-green-700">
                            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"></path></svg>
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
                            html += `</optgroup>`;
                            html += `<optgroup label=" Todas as Unidades do Sistema">`;
                        }
                        allUnidades.forEach(nome => {
                            html += `<option value="${escapeHTML(nome)}"> ${escapeHTML(nome)}</option>`;
                        });
                        if (userUnidades.length > 0) {
                            html += `</optgroup>`;
                        }
                        selectUnidade.innerHTML = html;
                    }).catch(err => {
                        console.error("Erro ao carregar unidades do sistema:", err);
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

        if (!isEventoMode) {
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
        const emAtendimentoColumn = document.getElementById('em-atendimento-column');
        const formContainer = document.getElementById('form-agendamento');

        formContainer.classList.remove('hidden');

        if (app.currentPautaData?.useDelegationFlow) {
            emAtendimentoColumn?.classList.remove('hidden');
        } else {
            emAtendimentoColumn?.classList.add('hidden');
        }

        if (tabName === 'agendamento') {
            tabAgendamento.classList.add('tab-active');
            tabAvulso.classList.remove('tab-active', 'text-gray-500', 'hover:text-gray-700');
            isScheduledContainer.classList.remove('hidden');
            if (formTitle) formTitle.textContent = "Adicionar Novo Agendamento";
            this.showAgendamentoForm();
        } else {
            tabAvulso.classList.add('tab-active');
            tabAgendamento.classList.remove('tab-active');
            tabAgendamento.classList.add('text-gray-500', 'hover:text-gray-700');
            isScheduledContainer.classList.add('hidden');
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

        const searchTerms = this.getSearchTerms();

        let rawAguardando = allAssisted.filter(a => a.status === 'aguardando');
        let rawEmAtendimento = allAssisted.filter(a => a.status === 'emAtendimento');
        let rawAtendidos = allAssisted.filter(a => a.status === 'atendido');
        let rawFaltosos = allAssisted.filter(a => a.status === 'faltoso');
        let rawPauta = allAssisted.filter(a => a.status === 'pauta');
        let rawDistribuicao = allAssisted.filter(a => (a.status === 'aguardandoDistribuicao' || a.status === 'aguardandoCorrecao' || a.status === 'aguardandoNumero'));

        rawPauta.sort((a, b) => (a.scheduledTime || '23:59').localeCompare(b.scheduledTime || '23:59'));
        if (currentPautaData?.ordemAtendimento) {
            rawAguardando = PautaService.sortAguardando(rawAguardando, currentPautaData.ordemAtendimento);
        }
        rawEmAtendimento.sort((a, b) => new Date(a.inAttendanceTime) - new Date(b.inAttendanceTime));
        rawAtendidos.sort((a, b) => (a.scheduledTime || '23:59').localeCompare(b.scheduledTime || '23:59'));
        rawFaltosos.sort((a, b) => (a.scheduledTime || '23:59').localeCompare(b.scheduledTime || '23:59'));

        rawAguardando.forEach((a, i) => a.absoluteOrder = i + 1);
        rawEmAtendimento.forEach((a, i) => a.absoluteOrder = i + 1);

        const lists = {
            pauta: rawPauta.filter(a => this.searchFilter(a, searchTerms.pauta)),
            aguardando: rawAguardando.filter(a => this.searchFilter(a, searchTerms.aguardando)),
            emAtendimento: rawEmAtendimento.filter(a => this.searchFilter(a, searchTerms.emAtendimento)),
            atendidos: rawAtendidos.filter(a => this.searchFilter(a, searchTerms.atendidos)),
            faltosos: rawFaltosos.filter(a => this.searchFilter(a, searchTerms.faltosos)),
            distribuicao: rawDistribuicao.filter(a => this.searchFilter(a, searchTerms.distribuicao))
        };

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
            <div class="mt-3 pt-2 border-t border-slate-100 flex justify-end">
                <p class="text-[10px] text-slate-400 italic">Última ação por: <b class="text-slate-500">${lastActionBy}</b> às ${lastActionDate}</p>
            </div>
        `;
    },

    _getDocWorkflowBadgeHtml(status) {
        if (!status || status === 'Pendente') return '';
        
        const cfg = {
            'Assistido Orientado': { icon: '🗣️', color: 'bg-sky-50 text-sky-700 border-sky-200' },
            'Preenchendo Dados': { icon: '✍️', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
            'Documentação Recebida': { icon: '📂', color: 'bg-teal-50 text-teal-700 border-teal-200' },
            'Falta Digitalizar': { icon: '🖨️', color: 'bg-amber-50 text-amber-700 border-amber-200' },
            'Digitalizado': { icon: '💻', color: 'bg-purple-50 text-purple-700 border-purple-200' },
            'Inserido no Verde/CNP': { icon: '✅', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
        };

        const style = cfg[status] || { icon: '📌', color: 'bg-slate-50 text-slate-700 border-slate-200' };

        return `
            <div class="flex justify-center mt-2 w-full">
                <span class="inline-flex items-center gap-1.5 ${style.color} px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wide border shadow-sm uppercase cursor-default">
                    ${style.icon} ${escapeHTML(status)}
                </span>
            </div>
        `;
    },

    _getActionButtonsHtml(item) {
        return `
            <div class="absolute top-2 right-2 flex items-center z-10">
                <div class="relative">
                    <button data-id="${item.id}" class="quick-action-toggle text-slate-400 hover:text-slate-700 p-1.5 rounded-md hover:bg-slate-100 transition-colors border border-transparent hover:border-slate-200" title="Opções">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M3 9.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>
                        </svg>
                    </button>
                    <div id="quick-menu-${item.id}" class="quick-menu hidden absolute right-0 mt-1 w-48 bg-white rounded-xl shadow-lg border border-slate-200 z-30 py-1.5 overflow-hidden" role="menu">
                        <div class="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 mb-1 bg-slate-50">Ações Rápidas</div>
                        <button data-id="${item.id}" data-tipo="reagendar" class="quick-action-item w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg> Reagendar
                        </button>
                        <button data-id="${item.id}" data-tipo="agendar" class="quick-action-item w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 flex items-center gap-2 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> Agendar
                        </button>
                        <button data-id="${item.id}" data-tipo="consulta" class="quick-action-item w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-purple-50 hover:text-purple-700 flex items-center gap-2 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Consulta
                        </button>
                        <button data-id="${item.id}" data-tipo="outros" class="quick-action-item w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-100 flex items-center gap-2 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> Outros
                        </button>
                        
                        <div class="h-px bg-slate-100 my-1 mx-3"></div>
                        <button data-id="${item.id}" class="update-doc-status-btn w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-blue-50 flex items-center gap-2 transition-colors font-bold text-blue-700">
                            <span class="w-4 h-4 flex items-center justify-center">📑</span> Mudar Status Triagem
                        </button>
                        <div class="h-px bg-slate-100 my-1 mx-3"></div>

                        <button data-id="${item.id}" class="edit-assisted-btn quick-action-item w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-100 flex items-center gap-2 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Editar Dados
                        </button>
                        <button data-id="${item.id}" class="view-details-btn quick-action-item w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-100 flex items-center gap-2 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> Ver Detalhes
                        </button>
                    </div>
                </div>
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
        const nomeSeguro = item.name || '';
        const docWorkflowBadge = this._getDocWorkflowBadgeHtml(item.docWorkflowStatus);

        const card = document.createElement('div');
        card.className = 'assisted-card relative bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-3';
        card.setAttribute('data-id', item.id);

        const timeInfoHtml = `
            <div class="flex justify-center w-full mb-2">
                <div class="inline-flex items-center gap-1.5 bg-blue-50/80 border border-blue-100 text-blue-800 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    <span>Agendado:</span> <span class="text-blue-900">${item.scheduledTime || '--:--'}</span>
                </div>
            </div>
        `;

        const badgeAgendamentoHtml = numAgendamento ? `
            <div class="flex justify-center mt-2 mb-2 w-full">
                <span class="inline-flex items-center gap-1 bg-slate-100 text-slate-600 px-2.5 py-1 rounded text-[10px] font-bold tracking-wide border border-slate-200 shadow-sm">
                    Nº DO AGEND.: <span class="text-blue-700 text-xs ml-1">${escapeHTML(numAgendamento)}</span>
                </span>
            </div>
        ` : '';

        card.innerHTML = `
            ${canDelete ? `
            <button data-id="${item.id}" class="delete-btn absolute top-2 left-2 text-slate-300 hover:text-red-500 transition-colors bg-white rounded-full z-10" ${isOwner ? '' : 'disabled'} title="Excluir">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M11 1.5v1h3.5a.5.5 0 0 1 0 1h-.538l-.853 10.66A2 2 0 0 1 11.115 16h-6.23a2 2 0 0 1-1.994-1.84L2.038 3.5H1.5a.5.5 0 0 1 0-1H5v-1A1.5 1.5 0 0 1 6.5 0h3A1.5 1.5 0 0 1 11 1.5Zm-5 0v1h4v-1a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5ZM4.5 5.029l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06Zm3 0l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06Zm3 .5a.5.5 0 0 0-1 0v8.5a.5.5 0 0 0 1 0v-8.5Z"/>
                </svg>
            </button>` : ''}

            ${this._getActionButtonsHtml(item)}

            <div class="pt-2 text-center">
                <p class="font-bold text-lg text-slate-800 leading-tight uppercase mb-2 px-6">${escapeHTML(nomeSeguro)}</p>
                <p class="text-xs text-slate-600 mb-3">Assunto: <strong class="uppercase text-slate-800">${escapeHTML(item.subject || 'Não informado')}</strong></p>
                
                <div class="flex flex-col items-center justify-center w-full mb-3 gap-0">
                    ${timeInfoHtml}
                    ${badgeAgendamentoHtml}
                    ${docWorkflowBadge}
                </div>

                <div class="mt-4 space-y-2">
                    <div class="grid grid-cols-2 gap-2">
                        <button data-id="${item.id}" class="check-in-btn bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-lg text-xs transition active:scale-95 shadow-sm uppercase tracking-wide">
                            Marcar Chegada
                        </button>
                        <button data-id="${item.id}" class="faltou-btn bg-amber-500 hover:bg-amber-600 text-white font-bold py-2.5 rounded-lg text-xs transition active:scale-95 shadow-sm uppercase tracking-wide" ${canEdit ? '' : 'disabled'}>
                            Faltou
                        </button>
                    </div>
                    <button data-id="${item.id}" class="edit-assisted-btn w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-lg text-xs transition active:scale-95 shadow-sm uppercase tracking-wide border border-slate-200" ${canEdit ? '' : 'disabled'}>
                        Editar Dados
                    </button>
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
                roomGroup.className = "mb-4 border border-slate-200 rounded-lg overflow-hidden bg-slate-50 room-group-container shadow-sm";

                roomGroup.innerHTML = `
                    <div class="bg-blue-100 p-2 border-b border-blue-200 flex flex-col gap-2">
                        <div class="flex justify-between items-center px-1">
                            <h4 class="font-bold text-blue-800 text-xs uppercase tracking-wider flex items-center gap-1">
                                <span>🏢</span> ${escapeHTML(roomName)}
                            </h4>
                            <span class="bg-blue-200 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded-full">${peopleInRoom.length}</span>
                        </div>
                        <input type="search" placeholder="Pesquisar nesta sala..." class="room-search-input w-full p-1.5 text-xs border border-blue-200 rounded outline-none focus:ring-2 focus:ring-blue-50 bg-white">
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
            const docWorkflowBadge = this._getDocWorkflowBadgeHtml(item.docWorkflowStatus);

            const card = document.createElement('div');
            const priorityClass = PautaService.getPriorityClass(item.priority);
            const attendBtnClass = currentPautaData?.useDelegationFlow ? 'select-collaborator-btn' : 'attend-directly-from-aguardando-btn';

            card.className = `assisted-card relative bg-white p-4 rounded-lg shadow-sm ${priorityClass} mb-2 group transition-all duration-200`;
            card.setAttribute('data-id', item.id);

            let docStatusHtml = '';
            if (item.selectedAction) {
                let statusColor = 'bg-slate-100 text-slate-600';
                let statusText = '📋 Selecionado';
                let statusIcon = '📋';

                if (item.documentState === 'filling') {
                    statusColor = 'bg-amber-100 text-amber-700 animate-pulse';
                    statusText = '✏️ Preenchendo';
                    statusIcon = '✏️';
                } else if (item.documentState === 'saved') {
                    statusColor = 'bg-emerald-100 text-emerald-700 font-bold';
                    statusText = '✅ Salvo';
                    statusIcon = '✅';
                } else if (item.documentState === 'pdf') {
                    statusColor = 'bg-purple-100 text-purple-700 font-bold';
                    statusText = '📄 PDF Emitido';
                    statusIcon = '📄';
                }

                docStatusHtml = `
                    <div class="mt-2 flex flex-col gap-1 items-center justify-center w-full">
                        <span class="text-[10px] font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 truncate flex items-center gap-1">
                            <span>📂</span>
                            <span>${escapeHTML(item.selectedAction)}</span>
                        </span>
                        <span class="${statusColor} text-[9px] px-2 py-0.5 rounded-full w-max border border-current opacity-80 flex items-center gap-1">
                            <span>${statusIcon}</span>
                            <span>${statusText}</span>
                        </span>
                    </div>`;
            }

            const nomeSeguro = item.name || 'Nome não informado';
            const assuntoSeguro = item.subject || 'Não informado';
            const scheduledTimeSeguro = item.scheduledTime || '--:--';
            const priorityReasonSeguro = item.priorityReason || '';

            let roomDropdownHtml = '';
            if (currentPautaData?.type === 'multisala') {
                const availableRooms = currentPautaData.rooms || currentPautaData.customRooms || [];

                if (availableRooms.length > 0 && canEditPriority) {
                    const options = availableRooms.map(r => `<option value="${escapeHTML(r)}" ${item.room === r ? 'selected' : ''}>${escapeHTML(r)}</option>`).join('');
                    roomDropdownHtml = `
                        <div class="flex flex-col items-center justify-center w-full mt-2">
                            <label class="text-[8px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Mudar Sala</label>
                            <select class="change-room-select bg-purple-50 hover:bg-purple-100 text-purple-700 text-[10px] px-2 py-1 rounded-md font-bold border border-purple-200 outline-none cursor-pointer focus:ring-1 focus:ring-purple-500 max-w-[130px] truncate transition-colors shadow-sm" title="Mudar Sala do Assistido">
                                <option value="" ${!item.room ? 'selected' : ''}>Sem Sala</option>
                                ${options}
                            </select>
                        </div>
                    `;
                } else if (item.room) {
                    roomDropdownHtml = `
                        <div class="flex flex-col items-center justify-center w-full mt-2">
                            <label class="text-[8px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Sala Atual</label>
                            <span class="bg-purple-50 text-purple-700 text-[10px] px-2 py-1 rounded-md font-bold border border-purple-200 shadow-sm">${escapeHTML(item.room)}</span>
                        </div>
                    `;
                }
            }

            let timeInfoHtml = `
                <div class="inline-flex items-center justify-center gap-1.5 bg-blue-50/80 border border-blue-100 text-blue-800 px-3 py-1.5 rounded-lg text-xs shadow-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-600"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>
                    <span>Chegada: <span class="font-bold">--:--</span></span>
                </div>
            `;
            if (item.arrivalTime) {
                try {
                    const arrivalDate = new Date(item.arrivalTime);
                    if (!isNaN(arrivalDate)) {
                        const horaChegada = arrivalDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                        if (item.type === 'agendamento' && scheduledTimeSeguro !== '--:--') {
                            timeInfoHtml = `
                                <div class="inline-flex items-center justify-center flex-wrap gap-2 bg-blue-50/80 border border-blue-100 text-blue-800 px-3 py-1.5 rounded-lg text-xs shadow-sm">
                                    <div class="flex items-center gap-1">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-600"><path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h5"/><path d="M17.5 17.5 16 16.3V14"/><circle cx="16" cy="16" r="6"/></svg>
                                        <span>Agendado: <span class="font-semibold">${escapeHTML(scheduledTimeSeguro)}</span></span>
                                    </div>
                                    <div class="w-px h-3.5 bg-blue-200"></div>
                                    <div class="flex items-center gap-1">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-600"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>
                                        <span>Chegou: <span class="font-bold">${horaChegada}</span></span>
                                    </div>
                                </div>
                            `;
                        } else {
                            timeInfoHtml = `
                                <div class="inline-flex items-center justify-center gap-1.5 bg-blue-50/80 border border-blue-100 text-blue-800 px-3 py-1.5 rounded-lg text-xs shadow-sm">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-600"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>
                                    <span>Chegada: <span class="font-bold">${horaChegada}</span></span>
                                </div>
                            `;
                        }
                    }
                } catch (e) {
                    console.warn("Erro ao formatar data:", e);
                }
            }

            const numeroOrdem = item.absoluteOrder || (index + 1);
            const numeroBadge = `
                <div class="absolute -left-2 -top-2 w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-bold text-sm shadow-lg border-2 border-white z-20">
                    ${numeroOrdem}
                </div>
            `;

            const badgeAgendamentoHtml = numAgendamento ? `
                <div class="flex justify-center mt-2 mb-2 w-full">
                    <span class="inline-flex items-center gap-1 bg-slate-100 text-slate-600 px-2.5 py-1 rounded text-[10px] font-bold tracking-wide border border-slate-200 shadow-sm">
                        Nº DO AGEND.: <span class="text-blue-700 text-xs ml-1">${escapeHTML(numAgendamento)}</span>
                    </span>
                </div>
            ` : '';

            const atenderButton = canAttend
                ? `<button data-id="${item.id}" data-name="${escapeHTML(nomeSeguro)}" class="${attendBtnClass} bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-2.5 rounded-lg text-xs uppercase shadow-sm flex items-center justify-center gap-1.5 w-full border border-blue-700 transition-all active:scale-95 tracking-wide">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                      <path d="M12.5 16a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm1.679-4.493-1.335 2.226a.75.75 0 0 1-1.174.144l-.774-.773a.5.5 0 0 1 .708-.708l.547.548 1.17-1.951a.5.5 0 1 1 .858.514ZM11 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM8 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm.256 7a4.474 4.474 0 0 1-.229-1.004H3c.001-.246.154-.986.832-1.664C4.484 10.68 5.711 10 8 10c.26 0 .507.009.74.025.226-.341.496-.65.804-.918C9.077 9.038 8.564 9 8 9c-5 0-6 3-6 4s1 1 1 1h5.256Z"/>
                    </svg>
                    Atender
                   </button>`
                : '';

            card.innerHTML = `
                ${numeroBadge}
                ${this._getActionButtonsHtml(item)}
                
                ${canDelete ? `
                <button data-id="${item.id}" class="delete-btn absolute top-2 left-8 text-slate-300 hover:text-red-500 p-1 rounded-full transition-colors z-10" title="Deletar">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M11 1.5v1h3.5a.5.5 0 0 1 0 1h-.538l-.853 10.66A2 2 0 0 1 11.115 16h-6.23a2 2 0 0 1-1.994-1.84L2.038 3.5H1.5a.5.5 0 0 1 0-1H5v-1A1.5 1.5 0 0 1 6.5 0h3A1.5 1.5 0 0 1 11 1.5Zm-5 0v1h4v-1a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5ZM4.5 5.029l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06Zm3 0l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06Zm3 .5a.5.5 0 0 0-1 0v8.5a.5.5 0 0 0 1 0v-8.5Z"/>
                    </svg>
                </button>` : ''}
                
                <div class="text-center pt-2">
                    ${item.priority === 'URGENTE' ? `<div class="mb-2 text-[10px] font-black text-red-600 uppercase flex items-center justify-center gap-1">🚨 ${escapeHTML(priorityReasonSeguro)}</div>` : ''}

                    <p class="font-bold text-lg text-slate-800 leading-tight uppercase mb-2 px-6">${escapeHTML(nomeSeguro)}</p>

                    <p class="text-xs text-slate-600 mb-3">Assunto: <strong class="uppercase text-slate-800">${escapeHTML(assuntoSeguro)}</strong></p>
                    
                    <div class="flex flex-col items-center justify-center w-full mb-3 gap-0 mt-3">
                        ${timeInfoHtml}
                        ${badgeAgendamentoHtml}
                        ${roomDropdownHtml ? `<div class="mt-2">${roomDropdownHtml}</div>` : ''}
                        ${docWorkflowBadge}
                    </div>
                    
                    ${docStatusHtml}
                    
                    <div class="mt-4 grid grid-cols-2 gap-2">
                        ${atenderButton}
                        <button data-id="${item.id}" class="priority-btn ${item.priority === 'URGENTE' ? 'bg-orange-600 hover:bg-orange-700' : 'bg-red-500 hover:bg-red-600'} text-white font-bold py-2.5 rounded-lg text-xs uppercase tracking-wide transition active:scale-95 shadow-sm ${atenderButton ? '' : 'col-span-2'}" ${canEditPriority ? '' : 'disabled'}>
                            ${item.priority === 'URGENTE' ? 'Urgência' : 'Prioridade'}
                        </button>
                        <button data-id="${item.id}" class="return-to-pauta-btn col-span-2 bg-slate-100 text-slate-700 font-bold py-2 rounded-lg text-[10px] hover:bg-slate-200 transition-colors uppercase tracking-wide border border-slate-200 shadow-sm mt-1">Voltar para Pauta</button>
                    </div>
                    <button data-id="${item.id}" class="view-details-btn text-indigo-600 hover:text-indigo-800 text-[11px] font-bold mt-2 text-center underline block w-full">Ver Detalhes do Caso</button>
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
            const docWorkflowBadge = this._getDocWorkflowBadgeHtml(item.docWorkflowStatus);

            const card = document.createElement('div');
            card.className = `assisted-card relative bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-3`;
            card.setAttribute('data-id', item.id);

            const startTime = item.inAttendanceTime ?
                new Date(item.inAttendanceTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';

            const atendenteNome = this.getAttendantName(item);
            const numAgendamento = item.numAgendamento || item.numeroAgendamento || item.assistedManualNumAgendamento || '';

            const historicoTransferenciaHtml = item.historicoTransferencia
                ? `<div class="mt-2 bg-orange-50 border border-orange-200 text-orange-800 text-[10px] p-2 rounded-lg flex items-center justify-center gap-1 font-medium shadow-sm mb-2 text-center w-full">
                       <span class="text-xs">🔄</span>
                       <span>${escapeHTML(item.historicoTransferencia)}</span>
                   </div>`
                : '';

            let docStatusHtml = '';
            if (item.selectedAction) {
                let statusColor = 'bg-slate-100 text-slate-600';
                let statusText = '📋 Selecionado';
                let statusIcon = '📋';

                if (item.documentState === 'filling') {
                    statusColor = 'bg-amber-100 text-amber-700 animate-pulse';
                    statusText = '✏️ Preenchendo';
                    statusIcon = '✏️';
                } else if (item.documentState === 'saved') {
                    statusColor = 'bg-emerald-100 text-emerald-700 font-bold';
                    statusText = '✅ Salvo';
                    statusIcon = '✅';
                } else if (item.documentState === 'pdf') {
                    statusColor = 'bg-purple-100 text-purple-700 font-bold';
                    statusText = '📄 PDF Emitido';
                    statusIcon = '📄';
                }

                docStatusHtml = `
                    <div class="mt-3 mb-2 flex flex-col gap-1 items-center justify-center w-full">
                        <span class="text-[10px] font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 truncate flex items-center gap-1">
                            <span>📂</span>
                            <span>${escapeHTML(item.selectedAction)}</span>
                        </span>
                        <span class="${statusColor} text-[9px] px-2 py-0.5 rounded-full w-max border border-current opacity-80 flex items-center gap-1">
                            <span>${statusIcon}</span>
                            <span>${statusText}</span>
                        </span>
                    </div>`;
            }

            const timeInfoHtml = `
                <div class="inline-flex items-center justify-center gap-2 bg-blue-50/80 border border-blue-100 text-blue-800 px-2.5 py-1 rounded text-[11px] shadow-sm w-max mx-auto">
                    <div class="flex items-center gap-1">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-600"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        <span>Início: <span class="font-bold">${startTime}</span></span>
                    </div>
                </div>
            `;

            const badgeAgendamentoHtml = numAgendamento ? `
                <div class="flex justify-center mt-2 mb-2 w-full">
                    <span class="text-xs text-blue-700 font-bold bg-blue-50 px-2.5 py-0.5 rounded border border-blue-100 w-max tracking-wide shadow-sm mx-auto">
                        📅 Nº do Agend.: ${escapeHTML(numAgendamento)}
                    </span>
                </div>
            ` : '';

            const buttonsContainerHtml = canDelegateOrFinalize
                ? `<div class="mt-4 flex flex-col gap-2">
                        <div class="grid grid-cols-2 gap-2">
                            <button id="btn-delegar-card" data-id="${item.id}" data-name="${escapeHTML(item.name || '')}" data-collaborator-name="${escapeHTML(atendenteNome)}" class="select-collaborator-btn ${delegateBtnClass} text-white font-bold py-2.5 rounded-lg text-xs shadow-sm transition active:scale-95 uppercase tracking-wide" ${canDelegate ? '' : 'disabled'}>
                                Delegar
                            </button>
                            <button data-id="${item.id}" class="attend-directly-from-aguardando-btn bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-lg text-xs shadow-sm transition active:scale-95 uppercase tracking-wide">
                                Finalizar / Avançar
                            </button>
                        </div>
                        <button data-id="${item.id}" class="return-to-aguardando-from-emAtendimento-btn bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 rounded-lg text-xs border border-slate-200 shadow-sm transition active:scale-95 uppercase tracking-wide">
                            Mover para Fila
                        </button>
                        <button data-id="${item.id}" class="view-details-btn text-indigo-600 hover:text-indigo-800 text-[11px] font-bold mt-1 text-center underline w-full">
                            Ver Detalhes do Caso
                        </button>
                   </div>`
                : `<div class="mt-4 flex flex-col gap-2">
                        <button data-id="${item.id}" class="view-details-btn text-indigo-600 hover:text-indigo-800 text-xs font-bold mt-1 text-center border p-2 rounded-lg bg-slate-50 hover:bg-slate-100">
                            👁️ Ver Detalhes / Checklist
                        </button>
                   </div>`;

            const numeroOrdem = item.absoluteOrder || (index + 1);

            card.innerHTML = `
                <div class="absolute -left-2 -top-2 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm shadow-lg border-2 border-white z-20">
                    ${numeroOrdem}
                </div>

                ${canDelete ? `
                <button data-id="${item.id}" class="delete-btn absolute top-2 right-2 text-slate-300 hover:text-red-500">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M11 1.5v1h3.5a.5.5 0 0 1 0 1h-.538l-.853 10.66A2 2 0 0 1 11.115 16h-6.23a2 2 0 0 1-1.994-1.84L2.038 3.5H1.5a.5.5 0 0 1 0-1H5v-1A1.5 1.5 0 0 1 6.5 0h3A1.5 1.5 0 0 1 11 1.5Zm-5 0v1h4v-1a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5ZM4.5 5.029l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06Zm3 0l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06Zm3 .5a.5.5 0 0 0-1 0v8.5a.5.5 0 0 0 1 0v-8.5Z"/>
                    </svg>
                </button>` : ''}

                <div class="text-center pt-2">
                    <p class="font-bold text-lg text-slate-800 leading-tight uppercase px-4 mb-2">${escapeHTML(item.name || '')}</p>
                    <p class="text-xs text-slate-600 mb-1">Assunto: <strong class="uppercase text-slate-800">${escapeHTML(item.subject || 'Não informado')}</strong></p>
                    <p class="text-xs text-slate-600 mb-3">Colaborador: <strong class="text-slate-800">${escapeHTML(atendenteNome)}</strong></p>
                    
                    <div class="flex flex-col items-center justify-center w-full mb-3 gap-0">
                        ${timeInfoHtml}
                        ${badgeAgendamentoHtml}
                        ${docWorkflowBadge}
                    </div>

                    ${historicoTransferenciaHtml}
                    ${docStatusHtml}
                </div>

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
            const docWorkflowBadge = this._getDocWorkflowBadgeHtml(item.docWorkflowStatus);

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
                ? 'bg-emerald-500 border-emerald-500 text-white'
                : 'bg-slate-100 text-slate-300 border-slate-200';

            const timeInfoHtml = `
                <div class="inline-flex items-center justify-center flex-wrap gap-2 bg-blue-50/80 border border-blue-100 text-blue-800 px-3 py-1.5 rounded-lg text-[11px] shadow-sm w-max mx-auto">
                    ${item.scheduledTime && item.scheduledTime !== '--:--' ? `
                    <div class="flex items-center gap-1">
                        <span class="text-slate-600">Agendado:</span><span class="font-semibold">${escapeHTML(item.scheduledTime)}</span>
                    </div>
                    <div class="w-px h-3.5 bg-blue-200"></div>` : ''}
                    ${arrivalT !== 'N/A' ? `
                    <div class="flex items-center gap-1">
                        <span class="text-slate-600">Chegou:</span><span class="font-semibold">${arrivalT}</span>
                    </div>
                    <div class="w-px h-3.5 bg-blue-200"></div>` : ''}
                    <div class="flex items-center gap-1">
                        <span class="text-emerald-700">Fim:</span><span class="font-bold text-emerald-800">${attendedT}</span>
                    </div>
                </div>
            `;

            const badgeAgendamentoHtml = numAgendamento ? `
                <div class="flex justify-center mt-2 mb-2 w-full">
                    <span class="inline-flex items-center gap-1 bg-slate-100 text-slate-600 px-2.5 py-1 rounded text-[10px] font-bold tracking-wide border border-slate-200 shadow-sm">
                        Nº DO AGEND.: <span class="text-blue-700 text-xs ml-1">${escapeHTML(numAgendamento)}</span>
                    </span>
                </div>
            ` : '';

            card.innerHTML = `
                <div class="absolute top-3 right-3 z-10">
                    <button data-id="${item.id}" class="toggle-confirmed-atendido w-7 h-7 rounded-full border flex items-center justify-center ${confirmButton} shadow-sm transition-all" ${canToggleConfirmed ? '' : 'disabled'} title="Verde">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M12.736 3.97a.733.733 0 0 1 1.047 0c.286.289.29.756.01.105L7.882 12.5a.733.733 0 0 1-1.065.04L3.257 8.375a.733.733 0 0 1 1.064-.04l2.254 2.255Z"/>
                        </svg>
                    </button>
                </div>

                <div class="text-center pt-2">
                    <p class="font-bold text-lg text-slate-800 leading-tight uppercase px-8 mb-2">${escapeHTML(item.name || '')}</p>
                    <p class="text-xs text-slate-600 mb-3">Assunto: <strong class="uppercase text-slate-800">${escapeHTML(item.subject || 'Não informado')}</strong></p>

                    ${item.tipoAcaoRapida ? (() => {
                        const acaoCfg = {
                            'Reagendamento':       { icon: '🔄', bg: '#fffbeb', border: '#f59e0b', text: '#92400e', label: 'REAGENDADO' },
                            'Agendamento':         { icon: '📅', bg: '#ecfdf5', border: '#10b981', text: '#065f46', label: 'AGENDADO' },
                            'Consulta Processual': { icon: '🔍', bg: '#f5f3ff', border: '#8b5cf6', text: '#4c1d95', label: 'CONSULTA' },
                            'Outros Assuntos':     { icon: '⚙️', bg: '#f0f9ff', border: '#0ea5e9', text: '#0c4a6e', label: 'OUTROS' }
                        }[item.tipoAcaoRapida] || { icon: '⚡', bg: '#f0fdf4', border: '#22c55e', text: '#14532d', label: item.tipoAcaoRapida };
                        return `<div class="mt-2 mb-3 flex justify-center w-full">
                            <span style="background:${acaoCfg.bg};border:1px solid ${acaoCfg.border};color:${acaoCfg.text}" class="inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-md shadow-sm">
                                ${acaoCfg.icon} ${acaoCfg.label}
                            </span>
                        </div>`;
                    })() : ''}

                    <div class="flex flex-col items-center justify-center w-full mb-3 gap-0">
                        ${timeInfoHtml}
                        ${badgeAgendamentoHtml}
                        ${docWorkflowBadge}
                    </div>
                </div>

                <div class="flex flex-col items-center text-[10px] md:text-xs mb-4 pt-3 border-t border-slate-100">
                    <p class="text-slate-500 mb-3">Atendido por: <b class="text-slate-800 uppercase">${escapeHTML(atendenteNome)}</b></p>
                    
                    <div class="flex flex-wrap justify-center gap-2 w-full px-2">
                        <button data-id="${item.id}" class="manage-demands-btn flex-1 min-w-[70px] bg-slate-100 text-blue-600 font-bold py-2 rounded-lg hover:bg-blue-50 transition border border-slate-200 shadow-sm" ${canManageDemandsOrEditAttendant ? '' : 'disabled'}>Demandas</button>
                        <button data-id="${item.id}" class="edit-assisted-btn flex-1 min-w-[70px] bg-slate-100 text-slate-600 font-bold py-2 rounded-lg hover:bg-slate-200 transition border border-slate-200 shadow-sm" ${canManageDemandsOrEditAttendant ? '' : 'disabled'}>Dados</button>
                        <button data-id="${item.id}" class="edit-attendant-btn flex-1 min-w-[70px] bg-slate-100 text-emerald-600 font-bold py-2 rounded-lg hover:bg-emerald-50 transition border border-slate-200 shadow-sm" ${canManageDemandsOrEditAttendant ? '' : 'disabled'}>Atendente</button>
                        ${canDelete ? `<button data-id="${item.id}" class="delete-btn flex-1 min-w-[70px] bg-red-50 text-red-600 font-bold py-2 rounded-lg hover:bg-red-100 transition border border-red-100 shadow-sm">Deletar</button>` : ''}
                    </div>
                </div>

                ${item.arquivoPdfConteudo ? `
                    <a href="${item.arquivoPdfConteudo}" download="${item.nomeArquivoPdf || 'protocolo.pdf'}" class="mb-4 flex items-center justify-center gap-2 w-full bg-blue-50 text-blue-700 font-bold py-2.5 rounded-lg text-[10px] uppercase border border-blue-200 hover:bg-blue-100 transition shadow-sm">
                        📄 Baixar Protocolo
                    </a>
                ` : ''}

                <div class="pt-3 border-t border-slate-100">
                    <button data-id="${item.id}" class="return-from-atendido-btn w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-2.5 rounded-lg text-[10px] uppercase shadow-md active:scale-95 transition-all" ${canRevert ? '' : 'disabled'}>
                        Mover de Volta para Fila
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
            const docWorkflowBadge = this._getDocWorkflowBadgeHtml(item.docWorkflowStatus);

            const card = document.createElement('div');
            const isConfirmed = item.isConfirmed || false;

            card.className = 'assisted-card relative bg-red-50 p-4 rounded-lg shadow-sm border border-red-100 mb-4 opacity-90';
            card.setAttribute('data-id', item.id);

            const confirmButtonClass = isConfirmed
                ? 'bg-emerald-500 border-emerald-500 text-white'
                : 'bg-white text-slate-300 border-slate-200';

            const timeInfoHtml = `
                <div class="inline-flex items-center justify-center flex-wrap gap-2 bg-blue-50/80 border border-blue-100 text-blue-800 px-3 py-1.5 rounded-lg text-[11px] shadow-sm w-max mx-auto">
                    <div class="flex items-center gap-1">
                        <span class="text-slate-600">Agendado:</span><span class="font-semibold">${item.scheduledTime || '--:--'}</span>
                    </div>
                    <div class="w-px h-3.5 bg-blue-200"></div>
                    <div class="flex items-center gap-1">
                        <span class="text-red-700">Faltou às:</span><span class="font-bold text-red-800">${item.lastActionTimestamp ? new Date(item.lastActionTimestamp).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : '--:--'}</span>
                    </div>
                </div>
            `;

            const badgeAgendamentoHtml = numAgendamento ? `
                <div class="flex justify-center mt-2 mb-2 w-full">
                    <span class="inline-flex items-center gap-1 bg-white text-slate-600 px-2.5 py-1 rounded text-[10px] font-bold tracking-wide border border-red-200 shadow-sm">
                        Nº DO AGEND.: <span class="text-blue-700 text-xs ml-1">${escapeHTML(numAgendamento)}</span>
                    </span>
                </div>
            ` : '';

            card.innerHTML = `
                <div class="absolute top-3 right-3 z-10">
                    <button data-id="${item.id}" class="toggle-confirmed-faltoso w-7 h-7 rounded-full border flex items-center justify-center ${confirmButtonClass} shadow-sm transition-all" ${canToggleConfirmed ? '' : 'disabled'} title="Lançar falta no Verde">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M12.736 3.97a.733.733 0 0 1 1.047 0c.286.289.29.756.01.105L7.882 12.5a.733.733 0 0 1-1.065.04L3.257 8.375a.733.733 0 0 1 1.064-.04l2.254 2.255Z"/>
                        </svg>
                    </button>
                </div>

                <div class="text-center pt-2">
                    <p class="font-bold text-lg text-slate-800 leading-tight uppercase px-8 mb-2">${escapeHTML(item.name || '')}</p>
                    <span class="text-[9px] font-black text-red-700 bg-red-100 px-2 py-1 rounded-md border border-red-200 inline-block uppercase tracking-wider shadow-sm mb-1">🚫 Faltoso</span>
                    
                    <p class="text-xs text-slate-700 mt-2 mb-2">Assunto: <strong class="uppercase text-slate-800">${escapeHTML(item.subject || 'Não informado')}</strong></p>

                    <div class="flex flex-col items-center justify-center w-full mb-3 gap-0 mt-3">
                        ${timeInfoHtml}
                        ${badgeAgendamentoHtml}
                        ${docWorkflowBadge}
                    </div>
                </div>

                <div class="flex flex-col items-center text-[10px] md:text-xs mb-4 pt-2 border-t border-red-100 w-full">
                    <p class="text-slate-500 italic mb-3">Status Verde: <span class="${isConfirmed ? 'text-emerald-600' : 'text-amber-600'} font-bold">${isConfirmed ? 'Lançado no Verde' : 'Pendente de Lançamento'}</span></p>
                    
                    <div class="flex justify-center gap-2 w-full px-2">
                        <button data-id="${item.id}" class="edit-assisted-btn flex-1 bg-white text-slate-600 font-bold py-2 rounded-lg hover:bg-slate-50 transition border border-red-200 shadow-sm" ${canRevert ? '' : 'disabled'}>Editar Dados</button>
                        ${canDelete ? `<button data-id="${item.id}" class="delete-btn flex-1 bg-white text-red-600 font-bold py-2 rounded-lg hover:bg-red-50 transition border border-red-200 shadow-sm">Deletar Faltoso</button>` : ''}
                    </div>
                </div>

                <div class="pt-3 border-t border-red-100">
                    <button data-id="${item.id}" class="return-to-pauta-from-faltoso-btn w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-2.5 rounded-lg text-[10px] uppercase shadow-md active:scale-95 transition-all" ${canRevert ? '' : 'disabled'}>
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
                    <button onclick="navigator.clipboard.writeText('${linkPainel}'); window.showNotification('Link do painel copiado!', 'success');" class="w-full bg-cyan-600 text-white text-[11px] font-bold py-2 rounded-lg hover:bg-cyan-700 uppercase shadow-sm flex items-center justify-center gap-1 transition-colors">
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
                const docWorkflowBadge = this._getDocWorkflowBadgeHtml(item.docWorkflowStatus);

                const card = document.createElement('div');
                card.className = 'assisted-card relative bg-white p-4 rounded-xl shadow-sm border border-cyan-200 mb-3';
                card.setAttribute('data-id', item.id);

                const linkExterno = `${baseUrl}/atendimento_externo.html?pautaId=${pautaId}&assistidoId=${item.id}&colab=${encodeURIComponent(userName)}&token=${item.delegationToken || ''}`;

                const numeroOrdem = item.absoluteOrder || (index + 1);
                const numeroBadge = `
                    <div class="absolute -left-2 -top-2 w-8 h-8 bg-cyan-600 text-white rounded-full flex items-center justify-center font-bold text-sm shadow-lg border-2 border-white z-20">
                        ${numeroOrdem}
                    </div>
                `;

                const badgeStatus = item.status === 'aguardandoCorrecao'
                    ? `<span class="absolute top-2 right-2 bg-amber-100 text-amber-700 text-[9px] font-black px-2 py-1 rounded-md uppercase border border-amber-200 shadow-sm">P/ Avaliação</span>`
                    : `<span class="absolute top-2 right-2 bg-blue-100 text-blue-700 text-[9px] font-black px-2 py-1 rounded-md uppercase border border-blue-200 shadow-sm">P/ Assinatura</span>`;

                const timeInfoHtml = `
                    <div class="inline-flex items-center justify-center gap-2 bg-blue-50/80 border border-blue-100 text-blue-800 px-2.5 py-1 rounded text-[11px] shadow-sm w-max mx-auto">
                        <div class="flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-600"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                            <span>Agendado: <span class="font-semibold">${item.scheduledTime || '--:--'}</span></span>
                        </div>
                    </div>
                `;

                const badgeAgendamentoHtml = numAgendamento ? `
                    <div class="flex justify-center mt-2 mb-2 w-full">
                        <span class="inline-flex items-center gap-1 bg-slate-100 text-slate-600 px-2.5 py-1 rounded text-[10px] font-bold tracking-wide border border-slate-200 shadow-sm mx-auto">
                            Nº DO AGEND.: <span class="text-blue-700 text-xs ml-1">${escapeHTML(numAgendamento)}</span>
                        </span>
                    </div>
                ` : '';

                const historicoTransferenciaHtml = item.historicoTransferencia
                    ? `<div class="mt-2 bg-orange-50 border border-orange-200 text-orange-800 text-[10px] p-2 rounded-lg flex items-center justify-center gap-1 font-medium shadow-sm mb-2 text-center w-full">
                           <span class="text-xs">🔄</span>
                           <span>${escapeHTML(item.historicoTransferencia)}</span>
                       </div>`
                    : '';

                let docStatusHtml = '';
                if (item.selectedAction) {
                    let statusColor = 'bg-slate-100 text-slate-600';
                    let statusText = '📋 Selecionado';
                    let statusIcon = '📋';

                    if (item.documentState === 'filling') {
                        statusColor = 'bg-amber-100 text-amber-700 animate-pulse';
                        statusText = '✏️ Preenchendo';
                        statusIcon = '✏️';
                    } else if (item.documentState === 'saved') {
                        statusColor = 'bg-emerald-100 text-emerald-700 font-bold';
                        statusText = '✅ Salvo';
                        statusIcon = '✅';
                    } else if (item.documentState === 'pdf') {
                        statusColor = 'bg-purple-100 text-purple-700 font-bold';
                        statusText = '📄 PDF Emitido';
                        statusIcon = '📄';
                    }

                    docStatusHtml = `
                        <div class="mt-3 mb-2 flex flex-col gap-1 items-center justify-center w-full">
                            <span class="text-[10px] font-bold text-cyan-800 bg-cyan-50 px-2 py-0.5 rounded border border-cyan-100 truncate flex items-center gap-1">
                                <span>📂</span>
                                <span>${escapeHTML(item.selectedAction)}</span>
                            </span>
                            <span class="${statusColor} text-[9px] px-2 py-0.5 rounded-full w-max border border-current opacity-80 flex items-center gap-1">
                                <span>${statusIcon}</span>
                                <span>${statusText}</span>
                            </span>
                        </div>`;
                }

                const deleteBtnHtml = canDelete ? `
                    <button data-id="${item.id}" class="delete-btn absolute top-2 left-8 text-slate-300 hover:text-red-500 transition-colors bg-white rounded-full z-10">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M11 1.5v1h3.5a.5.5 0 0 1 0 1h-.538l-.853 10.66A2 2 0 0 1 11.115 16h-6.23a2 2 0 0 1-1.994-1.84L2.038 3.5H1.5a.5.5 0 0 1 0-1H5v-1A1.5 1.5 0 0 1 6.5 0h3A1.5 1.5 0 0 1 11 1.5Zm-5 0v1h4v-1a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5ZM4.5 5.029l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06Zm3 0l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06Zm3 .5a.5.5 0 0 0-1 0v8.5a.5.5 0 0 0 1 0v-8.5Z"/>
                        </svg>
                    </button>` : '';

                const actionControlsHtml = canManageDistribution
                    ? `<div class="mt-4 flex flex-col gap-2">
                            <div class="grid grid-cols-2 gap-2">
                                <button onclick="window.open('${linkExterno}', '_blank')" class="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2.5 rounded-lg text-xs shadow-sm transition active:scale-95 uppercase tracking-wide">
                                    Abrir Link
                                </button>
                                <button data-id="${item.id}" class="delegate-finalization-btn bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-lg text-xs shadow-sm transition active:scale-95 uppercase tracking-wide">
                                    Concluir
                                </button>
                            </div>
                            <button data-id="${item.id}" class="return-to-aguardando-from-dist-btn w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-lg text-xs shadow-sm transition active:scale-95 uppercase tracking-wide border border-slate-200">
                                Reverter para Fila
                            </button>
                       </div>`
                    : `<div class="mt-4">
                            <button data-id="${item.id}" class="view-details-btn text-indigo-600 hover:text-indigo-800 text-xs font-bold w-full border border-slate-200 p-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors uppercase tracking-wide">
                                👁️ Ver Detalhes / Checklist
                            </button>
                       </div>`;

                card.innerHTML = `
                    ${numeroBadge}
                    ${badgeStatus}
                    ${deleteBtnHtml}

                    <div class="text-center pt-2">
                        <p class="font-bold text-lg text-slate-800 leading-tight uppercase px-4 mb-2 mt-4">${escapeHTML(item.name || '')}</p>

                        <div class="text-xs text-slate-600 space-y-1 mb-2">
                            <p>Assunto: <strong class="uppercase text-slate-800">${escapeHTML(item.subject || 'Não informado')}</strong></p>
                            ${item.numeroProcesso ? `<p class="text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded-md inline-block mt-1 border border-blue-100">Nº Proc: ${escapeHTML(item.numeroProcesso)}</p>` : ''}
                        </div>
                        
                        <div class="flex flex-col items-center justify-center w-full mb-3 gap-0 mt-3">
                            ${timeInfoHtml}
                            ${badgeAgendamentoHtml}
                            ${docWorkflowBadge}
                        </div>
                    </div>

                    ${historicoTransferenciaHtml}
                    ${docStatusHtml}

                    ${item.notasRevisao ? `
                        <div class="mt-3 bg-yellow-50 text-yellow-800 text-[11px] p-3 rounded-lg border border-yellow-200 shadow-sm leading-snug">
                            <span class="font-black text-yellow-900 block mb-1">⚠️ NOTA PARA O DEFENSOR:</span>
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
                            <span class="text-lg"></span> Abrir Estatísticas e PDFs
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
                    window.showNotification("Módulo de estatísticas não carregado.", "error");
                }
            } catch (error) {
                console.error(error);
                window.showNotification("Erro ao buscar dados arquivados.", "error");
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
            const isEvento = pauta.modo === 'evento'
                || pauta.type === 'evento'
                || pauta.modoCriacao === 'evento'
                || pauta.isEvento
                || ['mutirao', 'mutirão', 'plantao', 'acao_social'].includes(String(pauta.tipo || pauta.type || '').toLowerCase());

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

            let originHtml = '';
            if (isEvento) {
                const tipoLabel = {
                    'mutirao': 'Mutirão',
                    'mutirão': ' Mutirão',
                    'plantao': ' Plantão',
                    'acao_social': ' Ação Social'
                }[String(pauta.tipo || '').toLowerCase()] || ' Evento';
                originHtml = `<h2 class="text-sm font-bold text-amber-600 uppercase tracking-wide flex items-center gap-1"><span></span> ${tipoLabel}</h2>`;
            } else {
                const nomeUnidade = pauta.unidadeNome || pauta.origin || pauta.orgao;
                originHtml = nomeUnidade
                    ? `<h2 class="text-sm font-bold text-indigo-700 uppercase tracking-wide flex items-center gap-1"><span></span> ${escapeHTML(nomeUnidade)}</h2>`
                    : `<h2 class="text-sm font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1"><span> </span> Pauta Normal</h2>`;
            }

            card.innerHTML = `
                <!-- Conteúdo Principal -->
                <div class="p-5">
                    <div class="flex justify-between items-start">
                        ${originHtml}
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

            card.onclick = async () => {
                if (isExpired) {
                    this.showExpiredPautaModal(pauta, app);
                    return;
                }
                if (app.router) {
                    await app.router.navigate('app', {
                        pautaId:   pauta.id,
                        pautaName: pauta.name,
                        pautaType: pauta.type  || 'agendamento',
                        pautaTipo: pauta.tipo  || pauta.type || 'normal'
                    }, false);
                } else {
                    app.loadPauta(pauta.id, pauta.name, pauta.type);
                }
            };

            container.appendChild(card);
        });
    },

    applyPopoutMode() {
        const urlParams = new URLSearchParams(window.location.search);
        const popoutCol = urlParams.get('popout');
        
        if (popoutCol) {
            document.body.classList.add('is-popout');
            document.title = `SIGEP - Monitor de Fila: ${popoutCol.toUpperCase()}`;

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
                container.classList.add('column-wrapper-base');
                
                const headerFlex = countBadge.parentElement; 
                
                const btnGroup = document.createElement('div');
                btnGroup.className = 'flex items-center gap-1 ml-auto pl-2 flex-shrink-0';
                btnGroup.innerHTML = `
                    <button class="btn-maximize bg-slate-200 hover:bg-slate-300 text-slate-700 p-1.5 rounded-md transition-colors shadow-sm" title="Maximizar na Tela Atual">
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M5.828 10.172a.5.5 0 0 0-.707 0l-4.096 4.096V11.5a.5.5 0 0 0-1 0v3.975a.5.5 0 0 0 .5.5H4.5a.5.5 0 0 0 0-1H1.732l4.096-4.096a.5.5 0 0 0 0-.707zm4.344-4.344a.5.5 0 0 0 .707 0l4.096-4.096V4.5a.5.5 0 1 0 1 0V.525a.5.5 0 0 0-.5-.5H11.5a.5.5 0 0 0 0 1h2.768l-4.096 4.096a.5.5 0 0 0 0 .707z"/></svg>
                    </button>
                    <button class="btn-popout bg-blue-100 hover:bg-blue-200 text-blue-700 p-1.5 rounded-md transition-colors shadow-sm" title="Desencaixar (Arraste para Monitor 2)">
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M1.5 13A1.5 1.5 0 0 0 3 14.5h8a1.5 1.5 0 0 0 1.5-1.5V9a.5.5 0 0 0-1 0v4a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V5a.5.5 0 0 1 .5-.5h4a.5.5 0 0 0 0-1H3A1.5 1.5 0 0 0 1.5 5v8zm7-11a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-1 0V2.5H9a.5.5 0 0 1-.5-.5z"/><path fill-rule="evenodd" d="M14.354 1.646a.5.5 0 0 1 0 .708l-8 8a.5.5 0 0 1-.708-.708l8-8a.5.5 0 0 1 .708 0z"/></svg>
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
