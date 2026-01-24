// js/ui.js

/**
 * Controla a visibilidade das telas principais
 */
export const showScreen = (screenName) => {
    const screens = {
        loading: document.getElementById('loading-container'),
        login: document.getElementById('login-container'),
        pautaSelection: document.getElementById('pauta-selection-container'),
        app: document.getElementById('app-container')
    };

    Object.keys(screens).forEach(key => {
        if (screens[key]) {
            screens[key].classList.toggle('hidden', key !== screenName);
        }
    });
};

/**
 * Controla o bloqueio da pauta (Modo Leitura)
 */
export const togglePautaLockUI = (isClosed, currentPautaOwnerId, currentUserUid) => {
    const isOwner = currentUserUid === currentPautaOwnerId;
    
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

    const actionButtons = document.querySelectorAll('.check-in-btn, .delegate-finalization-btn, .attend-directly-btn, .faltou-btn, .return-to-pauta-btn, .delete-btn, .priority-btn, .edit-assisted-btn, .edit-attendant-btn, .return-to-aguardando-btn, .manage-demands-btn, .toggle-confirmed-atendido, .toggle-confirmed-faltoso');
    actionButtons.forEach(btn => btn.disabled = isClosed);

    const closedAlert = document.getElementById('closed-pauta-alert');
    if (closedAlert) closedAlert.classList.toggle('hidden', !isClosed);

    const closePautaBtn = document.getElementById('close-pauta-btn');
    const reopenPautaBtn = document.getElementById('reopen-pauta-btn');

    if (closePautaBtn && reopenPautaBtn) {
        if (isClosed) {
            closePautaBtn.classList.add('hidden');
            reopenPautaBtn.classList.toggle('hidden', !isOwner);
        } else {
            closePautaBtn.classList.toggle('hidden', !isOwner);
            reopenPautaBtn.classList.add('hidden');
        }
    }
};

/**
 * Controla a troca de abas (Agendado vs Avulso)
 */
export const switchTabUI = (tabName, currentPautaData) => {
    const els = {
        tabAgendamento: document.getElementById('tab-agendamento'),
        tabAvulso: document.getElementById('tab-avulso'),
        pautaColumn: document.getElementById('pauta-column'),
        emAtendimentoColumn: document.getElementById('em-atendimento-column'),
        isScheduledContainer: document.getElementById('is-scheduled-container'),
        formTitle: document.getElementById('form-title'),
        scheduledTimeWrapper: document.getElementById('scheduled-time-wrapper'),
        arrivalTimeWrapper: document.getElementById('arrival-time-wrapper'),
        manualRoomWrapper: document.getElementById('manual-room-wrapper'),
        manualRoomSelect: document.getElementById('manual-room-select')
    };

    if (tabName === 'agendamento') {
        els.tabAgendamento.classList.add('tab-active');
        els.tabAvulso.classList.remove('tab-active');
        els.isScheduledContainer.classList.remove('hidden');
        els.pautaColumn.classList.remove('hidden');
        els.formTitle.textContent = "Adicionar Novo Agendamento";
        
        document.querySelector('input[name="is-scheduled"][value="no"]').checked = true;
        document.querySelector('input[name="has-arrived"][value="no"]').checked = true;
        els.scheduledTimeWrapper.classList.add('hidden');
        els.arrivalTimeWrapper.classList.add('hidden');
        els.manualRoomWrapper.classList.add('hidden');
    } else {
        els.tabAvulso.classList.add('tab-active');
        els.tabAgendamento.classList.remove('tab-active');
        els.isScheduledContainer.classList.add('hidden');
        els.pautaColumn.classList.add('hidden');
        els.formTitle.textContent = "Adicionar Atendimento Avulso";

        document.querySelector('input[name="is-scheduled"][value="no"]').checked = true;
        document.querySelector('input[name="has-arrived"][value="yes"]').checked = true;
        els.scheduledTimeWrapper.classList.add('hidden');
        els.arrivalTimeWrapper.classList.remove('hidden');
        document.getElementById('arrival-time').value = new Date().toTimeString().slice(0, 5);

        // Lógica para Multi-salas em atendimento avulso
        if (currentPautaData?.type === 'multisala' && currentPautaData.rooms) {
            els.manualRoomWrapper.classList.remove('hidden');
            els.manualRoomSelect.innerHTML = '';
            currentPautaData.rooms.forEach(room => {
                const opt = document.createElement('option');
                opt.value = room;
                opt.textContent = room;
                els.manualRoomSelect.appendChild(opt);
            });
        }
    }
    
    if (currentPautaData?.useDelegationFlow) {
        els.emAtendimentoColumn.classList.remove('hidden');
    } else {
        els.emAtendimentoColumn.classList.add('hidden');
    }
};
