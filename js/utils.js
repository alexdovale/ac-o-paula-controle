// js/utils.js - utils.js: Funções genéricas (escapeHTML, formatação de data, PDF).


// Prevenção contra ataques XSS
export const escapeHTML = (str) => {
    if (!str) return '';
    return String(str).replace(/[&<>'"]/g, tag => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag]));
};

// Notificações visuais
export const showNotification = (message, type = 'success') => {
    const colors = { info: 'blue', error: 'red', success: 'green' };
    const notification = document.createElement('div');
    notification.className = `fixed top-5 right-5 bg-${colors[type]}-500 text-white py-3 px-6 rounded-lg shadow-lg z-[100] transition-transform transform translate-x-full`;
    notification.textContent = message;
    document.body.appendChild(notification);

    requestAnimationFrame(() => notification.classList.remove('translate-x-full'));

    setTimeout(() => {
        notification.classList.add('translate-x-full');
        notification.addEventListener('transitionend', () => notification.remove());
    }, 3000);
};

// Formatação de horários (HH:mm)
export const formatTime = (timeStamp) => {
    if (!timeStamp) return 'N/A';
    let date = (timeStamp.seconds) ? new Date(timeStamp.seconds * 1000) : new Date(timeStamp);
    if (isNaN(date)) return 'N/A';
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

// Normalizar texto para busca (remove acentos e espaços)
export const normalizeText = (str) => {
    if (!str) return '';
    return str.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
};

// Copiar para o clipboard
export const copyToClipboard = (text, successMsg) => {
    navigator.clipboard.writeText(text).then(() => {
        showNotification(successMsg, 'info');
    }).catch(() => {
        showNotification('Erro ao copiar', 'error');
    });
};
