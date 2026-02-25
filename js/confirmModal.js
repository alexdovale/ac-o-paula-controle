// js/confirmModal.js

let confirmCallback = null;

/**
 * Configura o modal de confirmação
 */
export function setupConfirmModal() {
    const confirmModal = document.getElementById('confirm-modal');
    const confirmActionBtn = document.getElementById('confirm-action');
    const cancelActionBtn = document.getElementById('cancel-action');
    const modalText = document.getElementById('modal-text');
    
    if (!confirmModal || !confirmActionBtn || !cancelActionBtn) {
        console.warn("Elementos do modal de confirmação não encontrados");
        return;
    }

    // Confirmar ação
    confirmActionBtn.addEventListener('click', () => {
        if (confirmCallback) {
            confirmCallback();
        }
        confirmModal.classList.add('hidden');
        confirmCallback = null;
    });

    // Cancelar ação
    cancelActionBtn.addEventListener('click', () => {
        confirmModal.classList.add('hidden');
        confirmCallback = null;
    });

    // Fechar ao clicar fora
    confirmModal.addEventListener('click', (e) => {
        if (e.target === confirmModal) {
            confirmModal.classList.add('hidden');
            confirmCallback = null;
        }
    });
}

/**
 * Mostra o modal de confirmação
 * @param {Function} callback - Função a ser executada ao confirmar
 * @param {string} message - Mensagem a ser exibida
 */
export function showConfirmModal(callback, message) {
    const confirmModal = document.getElementById('confirm-modal');
    const modalText = document.getElementById('modal-text');
    
    if (!confirmModal || !modalText) {
        console.error("Modal de confirmação não encontrado");
        return;
    }
    
    modalText.innerHTML = message;
    confirmModal.classList.remove('hidden');
    confirmCallback = callback;
}
