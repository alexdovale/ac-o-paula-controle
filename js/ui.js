import { Utils } from './utils.js';
import { PautaService } from './pauta.js';
import { CollaboratorService } from './colaboradores.js';

export const UIService = {
    showScreen(screenName) {
        document.getElementById('loading-container').classList.toggle('hidden', screenName !== 'loading');
        document.getElementById('login-container').classList.toggle('hidden', screenName !== 'login');
        document.getElementById('pauta-selection-container').classList.toggle('hidden', screenName !== 'pautaSelection');
        document.getElementById('app-container').classList.toggle('hidden', screenName !== 'app');
    },

    switchTab(tabName, app) {
        const tabAgendamento = document.getElementById('tab-agendamento');
        const tabAvulso = document.getElementById('tab-avulso');
        const formTitle = document.getElementById('form-title');
        const pautaColumn = document.getElementById('pauta-column');

        if (tabName === 'agendamento') {
            tabAgendamento.classList.add('tab-active');
            tabAvulso.classList.remove('tab-active');
            pautaColumn.classList.remove('hidden');
            formTitle.textContent = "Adicionar Novo Agendamento";
            this.showAgendamentoForm();
        } else {
            tabAvulso.classList.add('tab-active');
            tabAgendamento.classList.remove('tab-active');
            pautaColumn.classList.add('hidden');
            formTitle.textContent = "Adicionar Atendimento Avulso";
            this.showAvulsoForm(app);
        }
        
        app.renderLists();
    },

    showAgendamentoForm() {
        document.getElementById('is-scheduled-container').classList.remove('hidden');
        document.querySelector('input[name="is-scheduled"][value="no"]').checked = true;
        document.querySelector('input[name="has-arrived"][value="no"]').checked = true;
        document.getElementById('scheduled-time-wrapper').classList.add('hidden');
        document.getElementById('arrival-time-wrapper').classList.add('hidden');
        document.getElementById('manual-room-wrapper').classList.add('hidden');
    },

    showAvulsoForm(app) {
        document.getElementById('is-scheduled-container').classList.add('hidden');
        document.querySelector('input[name="has-arrived"][value="yes"]').checked = true;
        document.getElementById('scheduled-time-wrapper').classList.add('hidden');
        document.getElementById('arrival-time-wrapper').classList.remove('hidden');
        document.getElementById('arrival-time').value = new Date().toTimeString().slice(0, 5);

        const manualRoomWrapper = document.getElementById('manual-room-wrapper');
        const manualRoomSelect = document.getElementById('manual-room-select');
        
        if (app.currentPauta?.type === 'multisala' && app.currentPauta.rooms) {
            manualRoomWrapper.classList.remove('hidden');
            manualRoomSelect.innerHTML = '';
            app.currentPauta.rooms.forEach(room => {
                const opt = document.createElement('option');
                opt.value = room;
                opt.textContent = room;
                manualRoomSelect.appendChild(opt);
            });
        } else {
            manualRoomWrapper.classList.add('hidden');
        }
    },

    toggleFaltosos() {
        const btn = document.getElementById('toggle-faltosos-btn');
        const pautaColumn = document.getElementById('pauta-column');
        const faltososColumn = document.getElementById('faltosos-column');

        pautaColumn.classList.toggle('hidden');
        faltososColumn.classList.toggle('hidden');

        btn.textContent = faltososColumn.classList.contains('hidden') ? 'Ver Faltosos' : 'Ver Pauta';
        btn.classList.toggle('bg-purple-600');
        btn.classList.toggle('bg-blue-600');
    },

    toggleActionsPanel() {
        const panel = document.getElementById('actions-panel');
        const arrow = document.getElementById('actions-arrow');
        
        panel.classList.toggle('opacity-0');
        panel.classList.toggle('scale-95');
        panel.classList.toggle('pointer-events-none');
        arrow.classList.toggle('rotate-180');
    },

    renderAssistedLists(allAssisted, currentPauta, colaboradores) {
        // Recalcular prioridades
        allAssisted.forEach(a => {
            if (a.status === 'aguardando' && a.priority !== 'URGENTE') {
                a.priority = PautaService.calculatePriority(a);
            }
        });

        // Filtrar por modo atual
        const currentMode = document.getElementById('tab-agendamento').classList.contains('tab-active') 
            ? 'agendamento' : 'avulso';

        // Filtrar por status
        const lists = {
            pauta: allAssisted.filter(a => a.status === 'pauta' && a.type === 'agendamento'),
            aguardando: allAssisted.filter(a => a.status === 'aguardando' && a.type === currentMode),
            emAtendimento: allAssisted.filter(a => a.status === 'emAtendimento' && a.type === currentMode),
            atendidos: allAssisted.filter(a => a.status === 'atendido' && a.type === currentMode),
            faltosos: allAssisted.filter(a => a.status === 'faltoso' && a.type === 'agendamento'),
            distribuicao: allAssisted.filter(a => a.status === 'aguardandoDistribuicao')
        };

        // Aplicar busca
        const searchTerms = this.getSearchTerms();
        Object.keys(lists).forEach(key => {
            lists[key] = lists[key].filter(a => 
                this.searchFilter(a, searchTerms[key] || '')
            );
        });

        // Ordenar
        lists.pauta.sort((a, b) => (a.scheduledTime || '23:59').localeCompare(b.scheduledTime || '23:59'));
        lists.aguardando = PautaService.sortAguardando(lists.aguardando, currentPauta?.ordemAtendimento);
        lists.atendidos.sort((a, b) => new Date(b.attendedTime) - new Date(a.attendedTime));
        lists.emAtendimento.sort((a, b) => new Date(b.inAttendanceTime) - new Date(a.inAttendanceTime));

        // Atualizar contadores
        this.updateCounters(lists);

        // Renderizar colunas
        this.renderPautaColumn(lists.pauta);
        this.renderAguardandoColumn(lists.aguardando, currentPauta);
        this.renderEmAtendimentoColumn(lists.emAtendimento, currentPauta, colaboradores);
        this.renderAtendidosColumn(lists.atendidos);
        this.renderFaltososColumn(lists.faltosos);
        this.renderDistribuicaoColumn(lists.distribuicao);
    },

    renderPautaColumn(items) {
        const container = document.getElementById('pauta-list');
        container.innerHTML = '';
        
        if (items.length === 0) {
            container.innerHTML = '<p class="text-gray-400 text-center p-4">Nenhum agendamento</p>';
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
            <button data-id="${item.id}" class="delete-btn absolute top-3 right-3 text-gray-300 hover:text-red-500">
                <svg width="18" height="18" viewBox="0 0 16 16"><path d="M11 1.5v1h3.5a.5.5 0 0 1 0 1h-.538l-.853 10.66A2 2 0 0 1 11.115 16h-6.23a2 2 0 0 1-1.994-1.84L2.038 3.5H1.5a.5.5 0 0 1 0-1H5v-1A1.5 1.5 0 0 1 6.5 0h3A1.5 1.5 0 0 1 11 1.5Z"/></svg>
            </button>
            <p class="font-bold text-xl text-gray-800">${Utils.escapeHTML(item.name)}</p>
            <div class="mt-2 text-sm">
                <p>Assunto: <span class="font-bold">${Utils.escapeHTML(item.subject)}</span></p>
                <p>Agendado: <span class="font-bold">${item.scheduledTime || '--:--'}</span></p>
            </div>
            <div class="mt-4 grid grid-cols-2 gap-2">
                <button data-id="${item.id}" class="check-in-btn bg-green-500 text-white py-2 rounded-lg text-xs">Marcar Chegada</button>
                <button data-id="${item.id}" class="faltou-btn bg-yellow-500 text-white py-2 rounded-lg text-xs">Faltou</button>
                <button data-id="${item.id}" class="edit-assisted-btn col-span-2 bg-slate-500 text-white py-2 rounded-lg text-xs">Editar Dados</button>
            </div>
        `;
        return card;
    },

    renderAguardandoColumn(items, currentPauta) {
        const container = document.getElementById('aguardando-list');
        container.innerHTML = '';

        if (items.length === 0) {
            container.innerHTML = '<p class="text-gray-400 text-center p-4">Ninguém aguardando</p>';
            return;
        }

        if (currentPauta?.type === 'multisala' && currentPauta.rooms?.length) {
            currentPauta.rooms.forEach(room => {
                const roomItems = items.filter(i => i.room === room);
                if (roomItems.length) {
                    const header = document.createElement('div');
                    header.className = "bg-blue-50 text-blue-800 font-bold px-3 py-1.5 rounded mt-4 mb-2 text-[10px] flex justify-between";
                    header.innerHTML = `<span>🏢 ${Utils.escapeHTML(room)}</span> <span>${roomItems.length}</span>`;
                    container.appendChild(header);
                    
                    roomItems.forEach(item => {
                        container.appendChild(this.createAguardandoCard(item, currentPauta));
                    });
                }
            });
        } else {
            items.forEach(item => {
                container.appendChild(this.createAguardandoCard(item, currentPauta));
            });
        }
    },

    createAguardandoCard(item, currentPauta) {
        const card = document.createElement('div');
        card.className = `relative bg-white p-4 rounded-lg shadow-sm ${PautaService.getPriorityClass(item.priority)} mb-2`;
        card.setAttribute('data-id', item.id);

        const arrival = item.type === 'agendamento' && item.scheduledTime
            ? `Agendado: ${item.scheduledTime} | Chegou: ${new Date(item.arrivalTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
            : `Chegada: ${new Date(item.arrivalTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

        const atenderButton = currentPauta?.useDelegationFlow
            ? `<button data-id="${item.id}" data-name="${Utils.escapeHTML(item.name)}" class="select-collaborator-btn bg-blue-500 text-white py-2 rounded-lg text-sm w-full">Atender</button>`
            : `<button data-id="${item.id}" data-name="${Utils.escapeHTML(item.name)}" class="attend-directly-from-aguardando-btn bg-blue-500 text-white py-2 rounded-lg text-sm w-full">Atender</button>`;

        card.innerHTML = `
            <button data-id="${item.id}" class="delete-btn absolute top-2 right-2 text-gray-300 hover:text-red-600">
                <svg width="16" height="16" viewBox="0 0 16 16"><path d="M11 1.5v1h3.5a.5.5 0 0 1 0 1h-.538l-.853 10.66A2 2 0 0 1 11.115 16h-6.23a2 2 0 0 1-1.994-1.84L2.038 3.5H1.5a.5.5 0 0 1 0-1H5v-1A1.5 1.5 0 0 1 6.5 0h3A1.5 1.5 0 0 1 11 1.5Z"/></svg>
            </button>
            ${item.priority === 'URGENTE' ? `<div class="text-[10px] font-black text-red-600">🚨 ${Utils.escapeHTML(item.priorityReason)}</div>` : ''}
            <p class="font-bold text-lg text-gray-800">${Utils.escapeHTML(item.name)}</p>
            <p class="text-xs text-gray-600">Assunto: <strong>${Utils.escapeHTML(item.subject)}</strong></p>
            <div class="text-[10px] text-gray-500 mt-1">${arrival}</div>
            <div class="mt-3 grid grid-cols-2 gap-2">
                ${atenderButton}
                <button data-id="${item.id}" class="priority-btn ${item.priority === 'URGENTE' ? 'bg-orange-600' : 'bg-red-500'} text-white py-2 rounded-lg text-xs">Prioridade</button>
                <button data-id="${item.id}" class="return-to-pauta-btn col-span-2 bg-gray-200 text-gray-700 py-1.5 rounded-lg text-[10px]">Voltar</button>
            </div>
            <button data-id="${item.id}" class="view-details-btn text-indigo-500 text-[11px] font-bold mt-2 text-center underline w-full">Ver Detalhes</button>
        `;
        return card;
    },

    // Continuar com as outras colunas...
    // (emAtendimento, atendidos, faltosos, distribuicao)

    updateCounters(lists) {
        document.getElementById('pauta-count').textContent = lists.pauta.length;
        document.getElementById('aguardando-count').textContent = lists.aguardando.length;
        document.getElementById('em-atendimento-count').textContent = lists.emAtendimento.length;
        document.getElementById('atendidos-count').textContent = lists.atendidos.length;
        document.getElementById('faltosos-count').textContent = lists.faltosos.length;
        if (document.getElementById('distribuicao-count')) {
            document.getElementById('distribuicao-count').textContent = lists.distribuicao.length;
        }
    },

    searchFilter(assisted, term) {
        if (!term) return true;
        const normalizedTerm = Utils.normalizeText(term);
        return Utils.normalizeText(assisted.name).includes(normalizedTerm) ||
               (assisted.cpf && Utils.normalizeText(assisted.cpf).includes(normalizedTerm)) ||
               Utils.normalizeText(assisted.subject).includes(normalizedTerm);
    },

    getSearchTerms() {
        return {
            pauta: Utils.normalizeText(document.getElementById('pauta-search').value),
            aguardando: Utils.normalizeText(document.getElementById('aguardando-search').value),
            emAtendimento: Utils.normalizeText(document.getElementById('em-atendimento-search').value),
            atendidos: Utils.normalizeText(document.getElementById('atendidos-search').value),
            faltosos: Utils.normalizeText(document.getElementById('faltosos-search').value),
            distribuicao: Utils.normalizeText(document.getElementById('distribuicao-search').value)
        };
    },

    setupSearchListeners(callback) {
        ['pauta-search', 'aguardando-search', 'em-atendimento-search', 'atendidos-search', 'faltosos-search'].forEach(id => {
            document.getElementById(id).addEventListener('input', callback);
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
