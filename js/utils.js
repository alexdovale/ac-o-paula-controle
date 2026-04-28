// js/utils.js
// Funções genéricas (escapeHTML, formatação de data, PDF, notificações, etc.)

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
 * Toca um som de notificação baseado nas preferências do usuário.
 * @param {string} type - Tipo de som ('notification', 'success', 'error', 'chime', 'info', 'warning').
 */
export function playSound(type = 'notification') {
    // ⭐ Verificação de Preferências
    const preferenceKey = `enableSounds${type.charAt(0).toUpperCase() + type.slice(1)}`;
    const finalPreferenceKey = (type === 'chime' || type === 'notification' || type === 'info') 
        ? 'enableSoundsInfo' 
        : preferenceKey;

    if (window.app && window.app.userPreferences && window.app.userPreferences[finalPreferenceKey] === false) {
        return; // Não toca o som se desativado
    }

    let audioPath = '';
    switch (type) {
        case 'success':
            audioPath = './assets/sounds/success.mp3'; 
            break;
        case 'error':
            audioPath = './assets/sounds/error.mp3';   
            break;
        case 'chime': 
        case 'info':
            audioPath = './assets/sounds/chime.mp3';   
            break;
        case 'warning':
        case 'notification':
        default:
            audioPath = './assets/sounds/notification.mp3'; 
            break;
    }

    const audio = new Audio(audioPath);
    audio.volume = 0.5;
    audio.play().catch(e => console.warn(`Falha ao reproduzir som '${type}':`, e));
}

/**
 * Fechar a notificação com animação
 * @param {HTMLElement} notification - O elemento da notificação
 */
const closeNotification = (notification) => {
    notification.classList.remove('translate-x-0', 'opacity-100');
    notification.classList.add('translate-x-full', 'opacity-0');
    notification.addEventListener('transitionend', () => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, { once: true });
};

/**
 * Exibe uma notificação estilo toast, totalmente responsiva, respeitando as preferências.
 * @param {string} message - A mensagem a ser exibida.
 * @param {'success'|'error'|'info'|'warning'} type - O tipo da notificação (afeta a cor).
 * @param {number} [duration=5000] - Duração em milissegundos. Padrão 5000ms.
 * @param {Array<Object>} [actions] - Array de ações { label: string, callback: Function }.
 */
export function showNotification(message, type = 'info', duration = 5000, actions = []) {
    // ⭐ Verificação de Preferências para o Toast
    const preferenceKey = `showToasts${type.charAt(0).toUpperCase() + type.slice(1)}`;
    if (window.app && window.app.userPreferences && window.app.userPreferences[preferenceKey] === false) {
        return; // Aborta a exibição se o usuário desativou nas configs
    }

    let notificationContainer = document.getElementById('notification-container');
    
    if (!notificationContainer) {
        notificationContainer = document.createElement('div');
        notificationContainer.id = 'notification-container';
        notificationContainer.className = 'fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 z-[9999] flex flex-col items-end space-y-2 pointer-events-none';
        document.body.appendChild(notificationContainer);
    }

    const notification = document.createElement('div');
    notification.className = 'w-full sm:w-auto max-w-sm p-4 rounded-lg shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between text-white transition-all duration-300 transform translate-x-full opacity-0 pointer-events-auto gap-3';

    let bgColor = '';
    let textColorClass = '';
    
    switch (type) {
        case 'success':
            bgColor = 'bg-green-600';
            textColorClass = 'text-green-700';
            break;
        case 'error':
            bgColor = 'bg-red-600';
            textColorClass = 'text-red-700';
            break;
        case 'warning':
            bgColor = 'bg-orange-500';
            textColorClass = 'text-orange-700';
            break;
        case 'info':
        default:
            bgColor = 'bg-blue-600';
            textColorClass = 'text-blue-700';
            break;
    }

    notification.classList.add(bgColor);
    
    // Toca o som (a função playSound já faz a própria verificação de preferência de som)
    playSound(type);

    // Texto da Mensagem
    const msgElement = document.createElement('p');
    msgElement.className = 'text-sm font-medium leading-tight flex-grow';
    msgElement.textContent = message;
    notification.appendChild(msgElement);

    // Botões de Ação
    if (actions && actions.length > 0) {
        const actionsContainer = document.createElement('div');
        actionsContainer.className = 'flex flex-wrap gap-2 w-full sm:w-auto justify-end sm:flex-shrink-0 mt-2 sm:mt-0 border-t border-white/20 sm:border-none pt-2 sm:pt-0';
        
        actions.forEach(action => {
            const btn = document.createElement('button');
            btn.className = `px-3 py-1.5 bg-white ${textColorClass} rounded-md font-bold text-xs hover:bg-gray-100 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-${bgColor.split('-')[1]}-600 uppercase tracking-wide`;
            btn.textContent = action.label;
            
            btn.addEventListener('click', () => {
                if (typeof action.callback === 'function') {
                    action.callback();
                }
                closeNotification(notification);
            });
            
            actionsContainer.appendChild(btn);
        });
        
        notification.appendChild(actionsContainer);
    }

    notificationContainer.appendChild(notification);

    // Força reflow
    void notification.offsetWidth;
    notification.classList.remove('translate-x-full', 'opacity-0');
    notification.classList.add('translate-x-0', 'opacity-100');

    // Auto-close apenas se não houver botões
    if (!actions || actions.length === 0) {
        setTimeout(() => {
            closeNotification(notification);
        }, duration);
    }
}

export const formatTime = (timeStamp) => {
    if (!timeStamp) return 'N/A';
    let date;
    if (timeStamp?.seconds) {
        date = new Date(timeStamp.seconds * 1000);
    } else {
        date = new Date(timeStamp);
    }
    if (isNaN(date)) return 'N/A';
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

/**
 * Normalizar texto para busca
 */
export const normalizeText = (str) => {
    if (!str) return '';
    return String(str).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
};

/**
 * Copiar texto para o clipboard
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
 * Formatar CPF
 */
export const formatCPF = (cpf) => {
    if (!cpf) return '';
    const numeros = String(cpf).replace(/\D/g, '');
    if (numeros.length !== 11) return cpf;
    return numeros.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
};

/**
 * Validar email
 */
export const isValidEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(String(email).toLowerCase());
};

/**
 * Debounce
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

export const generateId = () => Date.now().toString(36) + Math.random().toString(36).substring(2);

export const truncateText = (text, limit = 50) => {
    if (!text) return '';
    const str = String(text);
    return str.length <= limit ? str : str.substring(0, limit) + '...';
};

export const formatDateBR = (date) => {
    if (!date) return '';
    const d = new Date(date);
    return isNaN(d) ? '' : d.toLocaleDateString('pt-BR');
};

export const diffInMinutes = (start, end) => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (isNaN(startDate) || isNaN(endDate)) return 0;
    return Math.round((endDate - startDate) / (1000 * 60));
};

export const getPriorityColor = (priority) => {
    const colors = { 'URGENTE': 'red', 'Máxima': 'green', 'Média': 'orange', 'Mínima': 'gray' };
    return colors[priority] || 'gray';
};

export const capitalize = (str) => {
    if (!str) return '';
    return String(str).replace(/\b\w/g, l => l.toUpperCase());
};

export const unformat = (value) => {
    if (!value) return '';
    return String(value).replace(/[^\d]/g, '');
};

export const isEmpty = (obj) => {
    return obj && Object.keys(obj).length === 0 && obj.constructor === Object;
};

export const groupBy = (array, key) => {
    return array.reduce((result, item) => {
        const groupKey = item[key];
        if (!result[groupKey]) result[groupKey] = [];
        result[groupKey].push(item);
        return result;
    }, {});
};

export const sortByDate = (array, dateField = 'createdAt', ascending = false) => {
    return [...array].sort((a, b) => {
        const dateA = new Date(a[dateField] || 0);
        const dateB = new Date(b[dateField] || 0);
        return ascending ? dateA - dateB : dateB - dateA;
    });
};
