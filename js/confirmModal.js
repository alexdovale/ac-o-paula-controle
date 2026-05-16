// js/confirmModal.js - SISTEMA DE CONFIRMAÇÃO (MODERNIZADO)

let confirmCallback = null;

/**
 * Configura os "escutadores" de clique do modal de confirmação
 */
export function setupConfirmModal() {
    const confirmModal = document.getElementById('confirm-modal');
    const confirmActionBtn = document.getElementById('confirm-action');
    const cancelActionBtn = document.getElementById('cancel-action');
    
    if (!confirmModal || !confirmActionBtn || !cancelActionBtn) {
        console.warn("Elementos do modal de confirmação não encontrados");
        return;
    }

    // Ação ao Confirmar
    confirmActionBtn.addEventListener('click', () => {
        if (confirmCallback) {
            confirmCallback();
        }
        fecharModal(confirmModal);
    });

    // Ação ao Cancelar
    cancelActionBtn.addEventListener('click', () => {
        fecharModal(confirmModal);
    });

    // Fechar ao clicar fora do modal (fundo escuro)
    confirmModal.addEventListener('click', (e) => {
        if (e.target === confirmModal) {
            fecharModal(confirmModal);
        }
    });
}

/**
 * Mostra o modal de confirmação com opções dinâmicas
 * @param {Function} callback - Função que será executada se o usuário clicar em Confirmar
 * @param {string} message - A pergunta/mensagem principal
 * @param {string} title - Título da janela (Opcional, padrão: "Confirmação")
 * @param {string} confirmBtnText - Texto do botão (Opcional, padrão: "Confirmar")
 * @param {string} confirmBtnColor - Cor do botão: 'red', 'blue', 'green', etc (Opcional, padrão: 'red')
 */
export function showConfirmModal(callback, message, title = "Confirmação", confirmBtnText = "Confirmar", confirmBtnColor = "red") {
    const confirmModal = document.getElementById('confirm-modal');
    const modalText = document.getElementById('modal-text');
    const confirmActionBtn = document.getElementById('confirm-action');
    const modalTitle = confirmModal?.querySelector('h2');
    
    if (!confirmModal || !modalText || !confirmActionBtn) {
        console.error("Erro: HTML do modal de confirmação não encontrado.");
        return;
    }
    
    // Atualiza os textos
    if (modalTitle) modalTitle.innerHTML = title;
    modalText.innerHTML = message;
    confirmActionBtn.textContent = confirmBtnText;

    // Reseta as cores do botão e aplica a cor solicitada
    confirmActionBtn.className = `w-full sm:w-auto text-white font-bold py-2.5 px-6 rounded-lg transition-colors shadow-sm bg-${confirmBtnColor}-600 hover:bg-${confirmBtnColor}-700`;

    // Salva a função que será executada
    confirmCallback = callback;
    
    // Animação de entrada
    confirmModal.classList.remove('hidden');
    
    // Foca no botão cancelar por segurança (evita clique duplo acidental no enter)
    setTimeout(() => {
        document.getElementById('cancel-action')?.focus();
    }, 100);
}

// Função auxiliar para fechamento com animação
function fecharModal(modal) {
    // Esvazia a função de memória para não disparar duplicado
    confirmCallback = null;
    modal.classList.add('hidden');
}
