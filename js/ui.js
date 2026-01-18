// js/ui.js - CONTROLE DE INTERFACE

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

export const togglePautaLockUI = (isClosed, currentPautaOwnerId, currentUserUid) => {
    const isOwner = currentUserUid === currentPautaOwnerId;
    const alert = document.getElementById('closed-pauta-alert');
    if (alert) alert.classList.toggle('hidden', !isClosed);

    // Bloquear interações em cards
    const actionButtons = document.querySelectorAll('.check-in-btn, .priority-btn, .delete-btn, .edit-assisted-btn');
    actionButtons.forEach(btn => btn.disabled = isClosed);

    const closeBtn = document.getElementById('close-pauta-btn');
    const reopenBtn = document.getElementById('reopen-pauta-btn');
    
    if (closeBtn && reopenBtn) {
        closeBtn.classList.toggle('hidden', isClosed || !isOwner);
        reopenBtn.classList.toggle('hidden', !isClosed || !isOwner);
    }
};

export const switchTabUI = (tabName, pautaData) => {
    const tabs = {
        agendamento: document.getElementById('tab-agendamento'),
        avulso: document.getElementById('tab-avulso')
    };

    if(tabName === 'agendamento') {
        tabs.agendamento.classList.add('tab-active');
        tabs.avulso.classList.remove('tab-active');
        document.getElementById('pauta-column').classList.remove('hidden');
    } else {
        tabs.avulso.classList.add('tab-active');
        tabs.agendamento.classList.remove('tab-active');
        document.getElementById('pauta-column').classList.add('hidden');
    }
};
