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
 * Toca um som de notificação.
 * @param {string} type - Tipo de som ('notification', 'success', 'error', 'chime').
 */
export function playSound(type = 'notification') {
    let audioPath = '';
    switch (type) {
        case 'success':
            audioPath = './assets/sounds/success.mp3'; 
            break;
        case 'error':
            audioPath = './assets/sounds/error.mp3';   
            break;
        case 'chime': 
            audioPath = './assets/sounds/chime.mp3';   
            break;
        case 'notification':
        default:
            audioPath = './assets/sounds/notification.mp3'; 
            break;
    }

    const audio = new Audio(audioPath);
    audio.volume = 0.5; // Ajuste o volume se necessário
    audio.play().catch(e => console.warn("Falha ao reproduzir som (pode necessitar de interação prévia do usuário):", e));
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
    });
};

/**
 * Exibe uma notificação estilo toast, totalmente responsiva.
 * @param {string} message - A mensagem a ser exibida.
 * @param {'success'|'error'|'info'|'warning'} type - O tipo da notificação (afeta a cor).
 * @param {number} [duration=5000] - Duração em milissegundos. Padrão 5000ms.
 * @param {Array<Object>} [actions] - Array de ações { label: string, callback: Function }.
 */
export function showNotification(message, type = 'info', duration = 5000, actions = []) {
    let notificationContainer = document.getElementById('notification-container');
    
    if (!notificationContainer) {
        notificationContainer = document.createElement('div');
        notificationContainer.id = 'notification-container';
        // No mobile fica 100% da largura na parte de baixo, no desktop fica no canto inferior direito
        notificationContainer.className = 'fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 z-[9999] flex flex-col items-end space-y-2 pointer-events-none';
        document.body.appendChild(notificationContainer);
    }

    const notification = document.createElement('div');
    // Layout flexível: coluna no celular (texto em cima, botões embaixo) e linha no desktop
    notification.className = 'w-full sm:w-auto max-w-sm p-4 rounded-lg shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between text-white transition-all duration-300 transform translate-x-full opacity-0 pointer-events-auto gap-3';

    let bgColor = '';
    let textColorClass = '';
    
    switch (type) {
        case 'success':
            bgColor = 'bg-green-600';
            textColorClass = 'text-green-700';
            if (actions.length === 0) playSound('success'); 
            break;
        case 'error':
            bgColor = 'bg-red-600';
            textColorClass = 'text-red-700';
            if (actions.length === 0) playSound('error'); 
            break;
        case 'warning':
            bgColor = 'bg-orange-500';
            textColorClass = 'text-orange-700';
            if (actions.length === 0) playSound('notification'); 
            break;
        case 'info':
        default:
            bgColor = 'bg-blue-600';
            textColorClass = 'text-blue-700';
            if (actions.length === 0) playSound('notification'); 
            break;
    }

    notification.classList.add(bgColor);

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

    // Força reflow para garantir que a animação CSS ocorra
    void notification.offsetWidth;
    notification.classList.remove('translate-x-full', 'opacity-0');
    notification.classList.add('translate-x-0', 'opacity-100');

    // Se não houver botões de ação, desaparece automaticamente após a duração
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
