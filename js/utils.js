// js/utils.js
// Funções genéricas (escapeHTML, formatação de data, PDF, etc.)

/**
 * Prevenção contra ataques XSS
 * @param {string} str - String a ser escapada
 * @returns {string} String escapada
 */
export const escapeHTML = (str) => {
    if (!str) return '';
    return String(str).replace(/[&<>'"]/g, tag => ({
        '&': '&amp;', 
        '<': '&lt;', 
        '>': '&gt;', 
        "'": '&#39;', 
        '"': '&quot;'
    }[tag]));
};

/**
 * Notificações visuais toast
 * @param {string} message - Mensagem a ser exibida
 * @param {string} type - Tipo da notificação (success, error, info)
 */
export const showNotification = (message, type = 'success') => {
    const colors = { 
        info: 'blue', 
        error: 'red', 
        success: 'green' 
    };
    
    const notification = document.createElement('div');
    notification.className = `fixed top-5 right-5 bg-${colors[type]}-500 text-white py-3 px-6 rounded-lg shadow-lg z-[100] transition-transform transform translate-x-full`;
    notification.textContent = message;
    document.body.appendChild(notification);

    // Animação de entrada
    requestAnimationFrame(() => notification.classList.remove('translate-x-full'));

    // Auto-remover após 3 segundos
    setTimeout(() => {
        notification.classList.add('translate-x-full');
        notification.addEventListener('transitionend', () => notification.remove());
    }, 3000);
};

/**
 * Formatação de horários (HH:mm)
 * @param {Object|string} timeStamp - Timestamp do Firebase ou string ISO
 * @returns {string} Horário formatado ou 'N/A'
 */
export const formatTime = (timeStamp) => {
    if (!timeStamp) return 'N/A';
    
    let date;
    if (timeStamp.seconds) {
        // É um Timestamp do Firebase
        date = new Date(timeStamp.seconds * 1000);
    } else {
        // É uma string ISO
        date = new Date(timeStamp);
    }
    
    if (isNaN(date)) return 'N/A';
    
    return date.toLocaleTimeString('pt-BR', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
};

/**
 * Normalizar texto para busca (remove acentos, espaços e converte para minúsculas)
 * @param {string} str - Texto a ser normalizado
 * @returns {string} Texto normalizado
 */
export const normalizeText = (str) => {
    if (!str) return '';
    return str.toString()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Remove acentos
        .toLowerCase()
        .trim();
};

/**
 * Copiar texto para o clipboard
 * @param {string} text - Texto a ser copiado
 * @param {string} successMsg - Mensagem de sucesso
 */
export const copyToClipboard = (text, successMsg) => {
    navigator.clipboard.writeText(text).then(() => {
        showNotification(successMsg, 'info');
    }).catch(() => {
        showNotification('Erro ao copiar', 'error');
    });
};

/**
 * Formatar CPF (___.___.___-__)
 * @param {string} cpf - CPF sem formatação
 * @returns {string} CPF formatado
 */
export const formatCPF = (cpf) => {
    if (!cpf) return '';
    const numeros = cpf.replace(/\D/g, '');
    return numeros.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
};

/**
 * Validar se é um email válido
 * @param {string} email - Email a ser validado
 * @returns {boolean} True se for válido
 */
export const isValidEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
};

/**
 * Debounce para evitar chamadas excessivas
 * @param {Function} func - Função a ser executada
 * @param {number} wait - Tempo de espera em ms
 * @returns {Function} Função com debounce
 */
export const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

/**
 * Gerar ID único simples
 * @returns {string} ID único
 */
export const generateId = () => {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

/**
 * Truncar texto com limite de caracteres
 * @param {string} text - Texto a ser truncado
 * @param {number} limit - Limite de caracteres
 * @returns {string} Texto truncado
 */
export const truncateText = (text, limit = 50) => {
    if (!text) return '';
    if (text.length <= limit) return text;
    return text.substring(0, limit) + '...';
};

/**
 * Converter data para formato brasileiro
 * @param {string|Date} date - Data a ser formatada
 * @returns {string} Data no formato dd/mm/aaaa
 */
export const formatDateBR = (date) => {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('pt-BR');
};

/**
 * Calcular diferença em minutos entre duas datas
 * @param {string|Date} start - Data inicial
 * @param {string|Date} end - Data final
 * @returns {number} Diferença em minutos
 */
export const diffInMinutes = (start, end) => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (isNaN(startDate) || isNaN(endDate)) return 0;
    return Math.round((endDate - startDate) / (1000 * 60));
};
