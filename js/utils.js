// js/utils.js - UTILITÁRIOS E UI PREMIUM (SIGAP)

/**
 * Prevenção contra ataques XSS
 */
export const escapeHTML = (str) => {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

/**
 * Toca sons do sistema respeitando as preferências do usuário
 */
export function playSound(type = 'notification') {
    const preferenceKey = `enableSounds${type.charAt(0).toUpperCase() + type.slice(1)}`;
    const finalPreferenceKey = (type === 'chime' || type === 'notification' || type === 'info') 
        ? 'enableSoundsInfo' 
        : preferenceKey;

    if (window.app?.userPreferences && window.app.userPreferences[finalPreferenceKey] === false) {
        return; 
    }

    const sounds = {
        'success': './assets/sounds/success.mp3',
        'error': './assets/sounds/error.mp3',
        'chime': './assets/sounds/chime.mp3',
        'info': './assets/sounds/chime.mp3',
        'warning': './assets/sounds/notification.mp3',
        'notification': './assets/sounds/notification.mp3'
    };

    const audio = new Audio(sounds[type] || sounds['notification']);
    audio.volume = 0.4; // Volume um pouco mais suave e elegante
    audio.play().catch(() => { /* Ignora erros silenciados pelo navegador */ });
}

/**
 * Animação de saída da notificação
 */
const closeNotification = (notification) => {
    notification.classList.remove('translate-x-0', 'opacity-100', 'scale-100');
    notification.classList.add('translate-x-10', 'opacity-0', 'scale-95');
    notification.addEventListener('transitionend', () => {
        if (notification.parentElement) notification.remove();
    }, { once: true });
};

/**
 * Sistema de Notificações Toast Premium (Glassmorphism e SVGs)
 */
export function showNotification(message, type = 'info', duration = 4000, actions = []) {
    const preferenceKey = `showToasts${type.charAt(0).toUpperCase() + type.slice(1)}`;
    if (window.app?.userPreferences && window.app.userPreferences[preferenceKey] === false) {
        return; 
    }

    let container = document.getElementById('notification-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'notification-container';
        // Posicionamento superior direito no Desktop, inferior no Mobile
        container.className = 'fixed bottom-4 left-4 right-4 sm:bottom-auto sm:top-6 sm:left-auto sm:right-6 z-[9999] flex flex-col sm:items-end space-y-3 pointer-events-none';
        document.body.appendChild(container);
    }

    const notification = document.createElement('div');
    // Design moderno com Backdrop Blur (Fundo de vidro)
    notification.className = 'w-full sm:w-[350px] p-4 rounded-xl shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between text-slate-800 bg-white/90 backdrop-blur-md border transition-all duration-400 ease-[cubic-bezier(0.23,1,0.32,1)] transform sm:translate-x-10 translate-y-10 sm:translate-y-0 opacity-0 scale-95 pointer-events-auto gap-3';

    let iconSvg = '';
    let iconColor = '';
    let borderColor = '';

    switch (type) {
        case 'success':
            iconColor = 'text-emerald-500 bg-emerald-100';
            borderColor = 'border-emerald-200';
            iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>`;
            break;
        case 'error':
            iconColor = 'text-rose-500 bg-rose-100';
            borderColor = 'border-rose-200';
            iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>`;
            break;
        case 'warning':
            iconColor = 'text-amber-500 bg-amber-100';
            borderColor = 'border-amber-200';
            iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>`;
            break;
        case 'info':
        default:
            iconColor = 'text-indigo-500 bg-indigo-100';
            borderColor = 'border-indigo-200';
            iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`;
            break;
    }

    notification.classList.add(borderColor);
    playSound(type);

    // Estrutura Interna da Notificação
    notification.innerHTML = `
        <div class="flex items-start gap-3 w-full">
            <div class="shrink-0 p-1.5 rounded-full ${iconColor} mt-0.5">
                ${iconSvg}
            </div>
            <div class="flex flex-col flex-grow pt-1">
                <p class="text-sm font-semibold text-slate-800 leading-tight">${message}</p>
            </div>
        </div>
    `;

    // Botões de Ação Personalizados
    if (actions && actions.length > 0) {
        const actionsContainer = document.createElement('div');
        actionsContainer.className = 'flex flex-wrap gap-2 w-full justify-end mt-2 pt-2 border-t border-slate-100';
        
        actions.forEach(action => {
            const btn = document.createElement('button');
            btn.className = `px-3 py-1.5 bg-slate-100 text-slate-700 rounded font-bold text-[10px] hover:bg-slate-200 transition-colors uppercase tracking-wider`;
            btn.textContent = action.label;
            
            btn.addEventListener('click', () => {
                if (typeof action.callback === 'function') action.callback();
                closeNotification(notification);
            });
            actionsContainer.appendChild(btn);
        });
        notification.appendChild(actionsContainer);
    }

    container.appendChild(notification);

    // Dispara animação fluida
    requestAnimationFrame(() => {
        notification.classList.remove('sm:translate-x-10', 'translate-y-10', 'opacity-0', 'scale-95');
        notification.classList.add('translate-x-0', 'translate-y-0', 'opacity-100', 'scale-100');
    });

    if (!actions || actions.length === 0) {
        setTimeout(() => closeNotification(notification), duration);
    }
}

// ==========================================
// FORMATADORES E HELPERS
// ==========================================

export const formatTime = (timeStamp) => {
    if (!timeStamp) return 'N/A';
    let date = timeStamp?.seconds ? new Date(timeStamp.seconds * 1000) : new Date(timeStamp);
    if (isNaN(date)) return 'N/A';
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

export const normalizeText = (str) => {
    if (!str) return '';
    return String(str).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
};

export const copyToClipboard = async (text, successMsg = 'Texto copiado!') => {
    try {
        await navigator.clipboard.writeText(text);
        showNotification(successMsg, 'success');
    } catch (err) {
        console.error('Erro ao copiar:', err);
        showNotification('Erro ao copiar texto.', 'error');
    }
};

export const formatCPF = (cpf) => {
    if (!cpf) return '';
    const numeros = String(cpf).replace(/\D/g, '');
    if (numeros.length !== 11) return cpf;
    return numeros.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
};

export const isValidEmail = (email) => {
    if (!email) return false;
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(String(email).toLowerCase());
};

export const debounce = (func, wait) => {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
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
    // Adiciona compensação de fuso para não dar erro de "dia anterior"
    const userTimezoneOffset = d.getTimezoneOffset() * 60000;
    const adjustedDate = new Date(d.getTime() + userTimezoneOffset);
    return isNaN(adjustedDate) ? '' : adjustedDate.toLocaleDateString('pt-BR');
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
    return String(str).toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
};

export const unformat = (value) => {
    if (!value) return '';
    return String(value).replace(/[^\d]/g, '');
};

export const isEmpty = (obj) => {
    return !obj || (Object.keys(obj).length === 0 && obj.constructor === Object);
};

export const groupBy = (array, key) => {
    if (!array || !Array.isArray(array)) return {};
    return array.reduce((result, item) => {
        const groupKey = item[key] || 'Outros';
        if (!result[groupKey]) result[groupKey] = [];
        result[groupKey].push(item);
        return result;
    }, {});
};

export const sortByDate = (array, dateField = 'createdAt', ascending = false) => {
    if (!array || !Array.isArray(array)) return [];
    return [...array].sort((a, b) => {
        const dateA = new Date(a[dateField] || 0).getTime();
        const dateB = new Date(b[dateField] || 0).getTime();
        return ascending ? dateA - dateB : dateB - dateA;
    });
};
