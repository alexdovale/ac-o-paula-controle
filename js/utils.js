// js/utils.js
// Funções genéricas (escapeHTML, formatação de data, PDF, etc.)

/**
 * Prevenção contra ataques XSS
 * @param {string} str - String a ser escapada
 * @returns {string} String escapada
 */
export const escapeHTML = (str) => {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
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
    setTimeout(() => {
        notification.classList.remove('translate-x-full');
    }, 10);

    // Auto-remover após 3 segundos
    setTimeout(() => {
        notification.classList.add('translate-x-full');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
};

/**
 * Toca um som de notificação.
 * @param {string} type - Tipo de som ('notification', 'success', 'error', 'chime').
 */
export function playSound(type = 'notification') {
    let audioPath = '';
    switch (type) {
        case 'success':
            audioPath = './assets/sounds/success.mp3'; // Crie este arquivo
            break;
        case 'error':
            audioPath = './assets/sounds/error.mp3';   // Crie este arquivo
            break;
        case 'chime': // Para quando alguém é chamado
            audioPath = './assets/sounds/chime.mp3';   // Crie este arquivo
            break;
        case 'notification':
        default:
            audioPath = './assets/sounds/notification.mp3'; // Crie este arquivo
            break;
    }

    const audio = new Audio(audioPath);
    audio.volume = 0.5; // Ajuste o volume se necessário
    audio.play().catch(e => console.warn("Falha ao reproduzir som:", e));
}

export const formatTime = (timeStamp) => {
    if (!timeStamp) return 'N/A';
    
    let date;
    if (timeStamp?.seconds) {
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
    return String(str)
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
export const copyToClipboard = async (text, successMsg = 'Copiado!') => {
    try {
        await navigator.clipboard.writeText(text);
        showNotification(successMsg, 'info');
    } catch (err) {
        console.error('Erro ao copiar:', err);
        showNotification('Erro ao copiar', 'error');
    }
};

/**
 * Formatar CPF (___.___.___-__)
 * @param {string} cpf - CPF sem formatação
 * @returns {string} CPF formatado
 */
export const formatCPF = (cpf) => {
    if (!cpf) return '';
    const numeros = String(cpf).replace(/\D/g, '');
    if (numeros.length !== 11) return cpf;
    return numeros.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
};

/**
 * Validar se é um email válido
 * @param {string} email - Email a ser validado
 * @returns {boolean} True se for válido
 */
export const isValidEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(String(email).toLowerCase());
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
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
};

/**
 * Truncar texto com limite de caracteres
 * @param {string} text - Texto a ser truncado
 * @param {number} limit - Limite de caracteres
 * @returns {string} Texto truncado
 */
export const truncateText = (text, limit = 50) => {
    if (!text) return '';
    const str = String(text);
    if (str.length <= limit) return str;
    return str.substring(0, limit) + '...';
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

/**
 * Obter cor baseada no status de prioridade
 * @param {string} priority - Prioridade do atendimento
 * @returns {string} Classe CSS da prioridade
 */
export const getPriorityColor = (priority) => {
    const colors = {
        'URGENTE': 'red',
        'Máxima': 'green',
        'Média': 'orange',
        'Mínima': 'gray'
    };
    return colors[priority] || 'gray';
};

/**
 * Capitalizar primeira letra de cada palavra
 * @param {string} str - Texto a ser capitalizado
 * @returns {string} Texto capitalizado
 */
export const capitalize = (str) => {
    if (!str) return '';
    return String(str).replace(/\b\w/g, l => l.toUpperCase());
};

/**
 * Remover caracteres especiais de CPF/CNPJ
 * @param {string} value - Valor com formatação
 * @returns {string} Valor sem formatação
 */
export const unformat = (value) => {
    if (!value) return '';
    return String(value).replace(/[^\d]/g, '');
};

/**
 * Verificar se objeto está vazio
 * @param {Object} obj - Objeto a ser verificado
 * @returns {boolean} True se estiver vazio
 */
export const isEmpty = (obj) => {
    return obj && Object.keys(obj).length === 0 && obj.constructor === Object;
};

/**
 * Agrupar array por chave
 * @param {Array} array - Array a ser agrupado
 * @param {string} key - Chave para agrupamento
 * @returns {Object} Objeto agrupado
 */
export const groupBy = (array, key) => {
    return array.reduce((result, item) => {
        const groupKey = item[key];
        if (!result[groupKey]) {
            result[groupKey] = [];
        }
        result[groupKey].push(item);
        return result;
    }, {});
};

/**
 * Ordenar array por data
 * @param {Array} array - Array a ser ordenado
 * @param {string} dateField - Campo de data
 * @param {boolean} ascending - Ordem crescente?
 * @returns {Array} Array ordenado
 */
export const sortByDate = (array, dateField = 'createdAt', ascending = false) => {
    return [...array].sort((a, b) => {
        const dateA = new Date(a[dateField] || 0);
        const dateB = new Date(b[dateField] || 0);
        return ascending ? dateA - dateB : dateB - dateA;
    });
};
