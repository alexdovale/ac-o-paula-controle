import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendEmailVerification, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, writeBatch, getDoc, setDoc, query, where, getDocs, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Variáveis Globais
let db, auth, allAssisted = [], currentPautaId = null, unsubscribeFromAttendances = () => {}, currentUserName = '', currentPautaOwnerId = null;
let assistedIdToHandle = null;
let currentChecklistAction = null;

const loadingContainer = document.getElementById('loading-container');
const loginContainer = document.getElementById('login-container');
const pautaSelectionContainer = document.getElementById('pauta-selection-container');
const appContainer = document.getElementById('app-container');
const loadingText = document.getElementById('loading-text');

const normalizeText = (str) => {
    if (!str) return '';
    return str.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
};

const getPriorityClass = (priority) => ({'URGENTE':'priority-urgente','Máxima':'priority-maxima','Média':'priority-media','Mínima':'priority-minima'}[priority]||'');

const getUpdatePayload = (data) => {
    return {
        ...data,
        lastActionBy: currentUserName,
        lastActionTimestamp: new Date().toISOString()
    };
};

const getPriorityLevel = (assisted) => {
    if (!assisted || assisted.status !== 'aguardando') return 'N/A';
    if (assisted.priority === 'URGENTE') return 'URGENTE';

    if (assisted.type === 'avulso') return 'Média';

    if (!assisted.scheduledTime || !assisted.arrivalTime) return 'Média';

    const scheduled = new Date(`1970-01-01T${assisted.scheduledTime}`);
    const arrival = new Date(assisted.arrivalTime);
    const arrivalTime = new Date(`1970-01-01T${arrival.toTimeString().slice(0, 5)}`);

    const diffMinutes = (arrivalTime - scheduled) / (1000 * 60);

    if (diffMinutes <= 0) return 'Máxima'; 
    if (diffMinutes <= 20) return 'Média';
    return 'Mínima';
};

const renderAssistedList = () => {
    allAssisted.forEach(a => {
        if (a.status === 'aguardando' && a.priority !== 'URGENTE') {
            a.priority = getPriorityLevel(a);
        }
    });

    const pautaList = document.getElementById('pauta-list');
    const aguardandoList = document.getElementById('aguardando-list');
    const atendidosList = document.getElementById('atendidos-list');
    const faltososList = document.getElementById('faltosos-list');
    [pautaList, aguardandoList, atendidosList, faltososList].forEach(el => el.innerHTML = '');

    const currentMode = document.getElementById('tab-agendamento').classList.contains('tab-active') ? 'agendamento' : 'avulso';
    
    const pautaSearchTerm = normalizeText(document.getElementById('pauta-search').value);
    const aguardandoSearchTerm = normalizeText(document.getElementById('aguardando-search').value);
    const atendidosSearchTerm = normalizeText(document.getElementById('atendidos-search').value);
    const faltososSearchTerm = normalizeText(document.getElementById('faltosos-search').value);
    
    const searchFilter = (assisted, term) => !term || normalizeText(assisted.name).includes(term) || (assisted.cpf && normalizeText(assisted.cpf).includes(term)) || normalizeText(assisted.subject).includes(term);

    const pauta = allAssisted.filter(a => a.status === 'pauta' && a.type === 'agendamento' && searchFilter(a, pautaSearchTerm));
    const aguardando = allAssisted.filter(a => a.status === 'aguardando' && a.type === currentMode && searchFilter(a, aguardandoSearchTerm));
    const atendidos = allAssisted.filter(a => a.status === 'atendido' && a.type === currentMode && searchFilter(a, atendidosSearchTerm));
    const faltosos = allAssisted.filter(a => a.status === 'faltoso' && a.type === 'agendamento' && searchFilter(a, faltososSearchTerm));

    pauta.sort((a, b) => (a.scheduledTime || '23:59').localeCompare(b.scheduledTime || '23:59'));
    atendidos.sort((a, b) => new Date(b.attendedTime) - new Date(a.attendedTime));
    faltosos.sort((a, b) => (a.scheduledTime || '00:00').localeCompare(b.scheduledTime || '00:00'));
    
    aguardando.sort((a, b) => {
        const order = { 'URGENTE': 0, 'Máxima': 1, 'Média': 2, 'Mínima': 3 };
        const priorityDiff = order[a.priority] - order[b.priority];
        if (priorityDiff !== 0) return priorityDiff;

        if (a.priority === 'Máxima' && a.type === 'agendamento') {
            const scheduledA = a.scheduledTime || '23:59';
            const scheduledB = b.scheduledTime || '23:59';
            if (scheduledA.localeCompare(scheduledB) !== 0) return scheduledA.localeCompare(scheduledB);
        }

        const arrivalA = a.arrivalTime ? new Date(a.arrivalTime).getTime() : Infinity;
        const arrivalB = b.arrivalTime ? new Date(b.arrivalTime).getTime() : Infinity;
        if (arrivalA !== arrivalB) return arrivalA - arrivalB;
        
        return (a.createdAt || 0) - (b.createdAt || 0);
    });
    
    document.getElementById('pauta-count').textContent = pauta.length;
    document.getElementById('aguardando-count').textContent = aguardando.length;
    document.getElementById('faltosos-count').textContent = faltosos.length;
    document.getElementById('atendidos-count').textContent = atendidos.length;

    const render = (el, data, generator) => {
        if(data.length === 0) el.innerHTML = `<p class="text-gray-500 text-center p-4">Nenhum resultado.</p>`;
        else data.forEach((item, index) => el.appendChild(generator(item, index)));
    };
    
    render(pautaList, pauta, a => {
        const card = document.createElement('div');
        card.className = 'relative bg-gray-50 p-4 rounded-lg shadow-sm border';
        card.innerHTML = `
            <button data-id="${a.id}" class="delete-btn absolute top-2 right-2 text-gray-400 hover:text-red-600 p-1 rounded-full"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-trash3-fill" viewBox="0 0 16 16"><path d="M11 1.5v1h3.5a.5.5 0 0 1 0 1h-.538l-.853 10.66A2 2 0 0 1 11.115 16h-6.23a2 2 0 0 1-1.994-1.84L2.038 3.5H1.5a.5.5 0 0 1 0-1H5v-1A1.5 1.5 0 0 1 6.5 0h3A1.5 1.5 0 0 1 11 1.5Zm-5 0v1h4v-1a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5ZM4.5 5.029l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06Zm3 0l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06Zm3 .5a.5.5 0 0 0-1 0v8.5a.5.5 0 0 0 1 0v-8.5Z"/></svg></button>
            <p class="font-bold text-lg">${a.name}</p>
            ${a.cpf ? `<p class="text-sm text-gray-500">CPF: <strong>${a.cpf}</strong></p>` : ''}
            <p>Assunto: <strong>${a.subject}</strong></p>
            <p>Agendado: <strong>${a.scheduledTime}</strong></p>
            <div class="mt-3 grid grid-cols-2 gap-2 text-sm">
                <button data-id="${a.id}" class="check-in-btn bg-green-500 text-white font-semibold py-2 px-3 rounded-lg hover:bg-green-600">Marcar Chegada</button>
                <button data-id="${a.id}" class="faltou-btn bg-yellow-500 text-white font-semibold py-2 px-3 rounded-lg hover:bg-yellow-600">Faltou</button>
                <button data-id="${a.id}" class="edit-assisted-btn col-span-2 bg-gray-500 text-white font-semibold py-2 px-3 rounded-lg hover:bg-gray-600">Editar Dados</button>
            </div>
            ${a.lastActionBy ? `<div class="text-xs text-right text-gray-400 mt-2 pt-2 border-t">Última ação por: <strong>${a.lastActionBy}</strong></div>` : ''}
        `;
        return card;
    });
    
    render(aguardandoList, aguardando, (a, index) => {
        const card = document.createElement('div');
        card.className = `relative bg-white p-4 rounded-lg shadow-sm ${getPriorityClass(a.priority)}`;
        const arrival = a.type === 'agendamento' && a.scheduledTime ? `Agendado: ${a.scheduledTime} | Chegou: ${new Date(a.arrivalTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : `Chegada: ${new Date(a.arrivalTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
        const returnToPautaBtn = a.type === 'agendamento' ? `<button data-id="${a.id}" class="return-to-pauta-btn w-full bg-gray-400 text-white font-semibold py-1 rounded-lg hover:bg-gray-500 text-xs mt-1">Voltar p/ Pauta</button>` : '';
        card.innerHTML = `
            <button data-id="${a.id}" class="delete-btn absolute top-2 right-2 text-gray-400 hover:text-red-600 p-1 rounded-full"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-trash3-fill" viewBox="0 0 16 16"><path d="M11 1.5v1h3.5a.5.5 0 0 1 0 1h-.538l-.853 10.66A2 2 0 0 1 11.115 16h-6.23a2 2 0 0 1-1.994-1.84L2.038 3.5H1.5a.5.5 0 0 1 0-1H5v-1A1.5 1.5 0 0 1 6.5 0h3A1.5 1.5 0 0 1 11 1.5Zm-5 0v1h4v-1a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5ZM4.5 5.029l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06Zm3 0l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06Zm3 .5a.5.5 0 0 0-1 0v8.5a.5.5 0 0 0 1 0v-8.5Z"/></svg></button>
            <div class="flex justify-between items-start">
                <div>
                    <p class="font-bold text-lg">${index + 1}. ${a.name}</p>
                    <p class="text-sm">Assunto: <strong>${a.subject}</strong></p>
                    <p class="text-sm text-gray-500">${arrival}</p>
                    <button data-id="${a.id}" class="view-details-btn text-indigo-600 hover:text-indigo-800 text-sm hover:underline font-semibold py-1">Ver Detalhes</button>
                </div>
            </div>
            <div class="mt-3 grid grid-cols-2 lg:grid-cols-3 gap-2">
                <button data-id="${a.id}" class="attend-btn bg-blue-500 text-white font-semibold py-2 rounded-lg hover:bg-blue-600 text-sm">Atender</button>
                ${a.priority !== 'URGENTE' ? `<button data-id="${a.id}" class="priority-btn bg-red-500 text-white font-semibold py-2 rounded-lg hover:bg-red-600 text-sm">Prioridade</button>` : ''}
                <button data-id="${a.id}" class="edit-assisted-btn bg-gray-500 text-white font-semibold py-2 rounded-lg hover:bg-gray-600 text-sm">Editar</button>
            </div>
            ${returnToPautaBtn ? `<div class="mt-2">${returnToPautaBtn}</div>` : ''}
            ${a.lastActionBy ? `<div class="text-xs text-right text-gray-400 mt-2 pt-2 border-t">Última ação por: <strong>${a.lastActionBy}</strong></div>` : ''}
            `;
        return card;
    });
    
    render(atendidosList, atendidos, a => {
        const card = document.createElement('div');
        card.className = 'relative bg-green-50 p-4 rounded-lg shadow-sm border-green-200';
        const totalAssuntos = 1 + (a.demandas?.quantidade ? Number(a.demandas.quantidade) : 0);
        const demandasInfo = a.demandas?.descricoes?.length > 0 ? `<div class="mt-2 text-xs bg-gray-100 p-2 rounded"><strong class="text-gray-700">Demandas Adicionais (${a.demandas.quantidade || 0}):</strong><ul class="list-disc list-inside pl-2 text-gray-600">${a.demandas.descricoes.map(d => `<li>${d}</li>`).join('')}</ul></div>` : '';
        card.innerHTML = `
            <div class="flex justify-between items-start">
                <p class="font-bold text-lg">${a.name} ${totalAssuntos > 1 ? `<span class="text-sm font-medium text-green-600">(${totalAssuntos} assuntos)</span>` : ''}</p>
            </div>
            <div class="card-details mt-2 space-y-2">
                ${a.cpf ? `<p class="text-sm">CPF: <strong>${a.cpf}</strong></p>` : ''}
                <p class="text-sm">Assunto Principal: <strong>${a.subject}</strong></p>
                <div class="text-xs text-gray-600 grid grid-cols-3 gap-2 text-center border-y py-2">
                    <div><strong>Agendado:</strong><br>${a.scheduledTime || 'N/A'}</div>
                    <div><strong>Chegou:</strong><br>${a.arrivalTime ? new Date(a.arrivalTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'N/A'}</div>
                    <div><strong>Finalizado:</strong><br>${a.attendedTime ? new Date(a.attendedTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'N/A'}</div>
                </div>
                ${demandasInfo}
                <div class="flex justify-between items-center mt-2">
                    <p class="text-sm">Por: <strong>${a.attendant || 'Não informado'}</strong></p>
                    <div class="flex items-center gap-1 flex-wrap">
                        <button data-id="${a.id}" class="manage-demands-btn text-blue-600 hover:text-blue-800 font-semibold text-xs py-1 px-2 rounded hover:bg-blue-100">Demandas</button>
                        <button data-id="${a.id}" class="edit-assisted-btn text-gray-600 hover:text-gray-800 font-semibold text-xs py-1 px-2 rounded hover:bg-gray-100">Dados</button>
                        <button data-id="${a.id}" class="edit-attendant-btn text-green-600 hover:text-green-800 font-semibold text-xs py-1 px-2 rounded hover:bg-green-100">Atendente</button>
                        <button data-id="${a.id}" class="delete-btn text-red-600 hover:text-red-800 font-semibold text-xs py-1 px-2 rounded hover:bg-red-100">Deletar</button>
                    </div>
                </div>
                <div class="mt-2 pt-2 border-t flex justify-between items-center">
                    ${a.lastActionBy ? `<p class="text-xs text-gray-500">Última ação por: <strong>${a.lastActionBy}</strong></p>` : '<div></div>'}
                    <button data-id="${a.id}" class="return-to-aguardando-btn bg-yellow-500 text-white font-semibold py-1 px-3 rounded-lg hover:bg-yellow-600 text-xs">Voltar p/ Aguardando</button>
                </div>
            </div>
            <div class="text-right mt-1">
                 <button class="toggle-details-btn text-gray-500 hover:text-gray-800 p-1">
                     <svg class="pointer-events-none" style="transform: rotate(180deg);" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/></svg>
                 </button>
            </div>`;
        return card;
    });

    render(faltososList, faltosos, a => {
        const card = document.createElement('div');
        card.className = 'relative bg-red-50 p-4 rounded-lg shadow-sm border-red-200';
        card.innerHTML = `
            <button data-id="${a.id}" class="delete-btn absolute top-2 right-2 text-gray-400 hover:text-red-600 p-1 rounded-full"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-trash3-fill" viewBox="0 0 16 16"><path d="M11 1.5v1h3.5a.5.5 0 0 1 0 1h-.538l-.853 10.66A2 2 0 0 1 11.115 16h-6.23a2 2 0 0 1-1.994-1.84L2.038 3.5H1.5a.5.5 0 0 1 0-1H5v-1A1.5 1.5 0 0 1 6.5 0h3A1.5 1.5 0 0 1 11 1.5zM6 6.5a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0v-6a.5.5 0 0 1 .5-.5zm3 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0v-6a.5.5 0 0 1 .5-.5zm-5 1a.5.5 0 0 0 0 1h6a.5.5 0 0 0 0-1h-6z"/></svg></button>
            <p class="font-bold text-lg">${a.name}</p>
            <div class="mt-2 space-y-2">
                ${a.cpf ? `<p class="text-sm">CPF: <strong>${a.cpf}</strong></p>` : ''}
                <p class="text-sm">Assunto: <strong>${a.subject}</strong></p>
                <p class="text-sm">Agendado: <strong>${a.scheduledTime}</strong></p>
                <div class="mt-3">
                    <button data-id="${a.id}" class="return-to-pauta-from-faltoso-btn w-full bg-gray-500 text-white font-semibold py-1 rounded-lg hover:bg-gray-600 text-xs">Reverter para Pauta</button>
                </div>
            </div>
            ${a.lastActionBy ? `<div class="text-xs text-right text-gray-400 mt-2 pt-2 border-t">Última ação por: <strong>${a.lastActionBy}</strong></div>` : ''}
        `;
        return card;
    });
};

const showNotification = (message, type = 'success') => {
    const colors = { info: 'blue', error: 'red', success: 'green' };
    const notification = document.createElement('div');
    notification.className = `fixed top-5 right-5 bg-${colors[type]}-500 text-white py-3 px-6 rounded-lg shadow-lg z-[100] transition-transform transform translate-x-full`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    requestAnimationFrame(() => {
        notification.classList.remove('translate-x-full');
    });

    setTimeout(() => {
        notification.classList.add('translate-x-full');
        notification.addEventListener('transitionend', () => notification.remove());
    }, 3000);
};

const setupRealtimeListener = (pautaId) => {
    if (unsubscribeFromAttendances) unsubscribeFromAttendances();
    const attendanceCollectionRef = collection(db, "pautas", pautaId, "attendances");
    unsubscribeFromAttendances = onSnapshot(attendanceCollectionRef, (snapshot) => {
        allAssisted = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderAssistedList();
    }, (error) => console.error("Erro no listener do Firestore: ", error));
};

const loadPauta = async (pautaId, pautaName) => {
    currentPautaId = pautaId;
    document.getElementById('pauta-title').textContent = pautaName;
    const pautaDoc = await getDoc(doc(db, "pautas", pautaId));
    if (pautaDoc.exists()) {
        const pautaData = pautaDoc.data();
        currentPautaOwnerId = pautaData.owner;
        if (pautaData.owner === auth.currentUser.uid) {
            document.getElementById('edit-pauta-name-btn').classList.remove('hidden');
        } else {
            document.getElementById('edit-pauta-name-btn').classList.add('hidden');
        }
    }
    setupRealtimeListener(pautaId);
    showScreen('app');
};

 /**
 * Exclui uma pauta do Firestore.
 * Em uma aplicação real, seria ideal ter um modal de confirmação customizado
 * antes de executar a exclusão.
 * @param {string} pautaId - O ID do documento da pauta a ser excluída.
 */
const deletePauta = async (pautaId) => {
    try {
        // As funções 'doc' e 'deleteDoc' devem ser importadas do Firestore.
        await deleteDoc(doc(db, "pautas", pautaId));
        // A UI será atualizada automaticamente pelo onSnapshot.
    } catch (error) {
        console.error("Erro ao excluir a pauta:", error);
        // Aqui, seria bom notificar o usuário sobre o erro com um componente de UI.
    }
};

/**
 * Cria um elemento de card para uma pauta específica.
 * Esta função previne vulnerabilidades de Cross-Site Scripting (XSS)
 * ao usar `textContent` em vez de `innerHTML` para dados dinâmicos.
 * @param {import("firebase/firestore").QueryDocumentSnapshot} docSnap - O snapshot do documento da pauta.
 * @returns {HTMLDivElement} O elemento do card da pauta.
 */
const createPautaCard = (docSnap) => {
    const pauta = docSnap.data();
    const card = document.createElement('div');
    card.className = "relative bg-white p-6 rounded-lg shadow-md hover:shadow-xl transition-shadow cursor-pointer flex flex-col justify-between h-full";

    // --- Botão de Excluir ---
    const deleteButton = document.createElement('button');
    deleteButton.className = "absolute top-3 right-3 p-1 rounded-full text-gray-400 hover:bg-red-100 hover:text-red-600 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500";
    deleteButton.setAttribute('aria-label', 'Excluir pauta');
    // SVG do ícone de lixeira
    deleteButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>`;

    deleteButton.addEventListener('click', (event) => {
        event.stopPropagation(); // Impede que o clique no botão ative o clique no card
        deletePauta(docSnap.id);
    });

    card.appendChild(deleteButton); // Adiciona o botão ao card

    // --- Cálculo de Datas ---
    const creationDate = pauta.createdAt?.toDate ? pauta.createdAt.toDate() : new Date();
    const expirationDate = new Date(creationDate);
    expirationDate.setDate(creationDate.getDate() + 7); // Adiciona 7 dias para a data de expiração

    const formattedCreationDate = creationDate.toLocaleDateString('pt-BR');
    const formattedExpirationDate = expirationDate.toLocaleDateString('pt-BR');

    // --- Criação de Elementos (Seguro contra XSS) ---
    const contentDiv = document.createElement('div');

    const title = document.createElement('h3');
    title.className = "font-bold text-xl mb-2";
    title.textContent = pauta.name; // Usar textContent é crucial para segurança

    const members = document.createElement('p');
    members.className = "text-gray-600";
    members.textContent = `Membros: ${pauta.memberEmails?.length || 1}`;

    contentDiv.appendChild(title);
    contentDiv.appendChild(members);

    const footerDiv = document.createElement('div');
    footerDiv.className = "mt-4 pt-2 border-t border-gray-200";

    const createdP = document.createElement('p');
    createdP.className = "text-xs text-gray-500";
    createdP.innerHTML = `Criada em: <strong>${formattedCreationDate}</strong>`;

    const expiresP = document.createElement('p');
    expiresP.className = "text-xs text-red-600";
    expiresP.innerHTML = `Será eliminada em: <strong>${formattedExpirationDate}</strong>`;

    footerDiv.appendChild(createdP);
    footerDiv.appendChild(expiresP);

    card.appendChild(contentDiv);
    card.appendChild(footerDiv);

    // Adiciona o evento de clique para carregar a pauta selecionada
    card.addEventListener('click', () => loadPauta(docSnap.id, pauta.name));
    return card;
};


/**
 * Exibe a tela de seleção de pautas, buscando e renderizando as pautas do usuário.
 * @param {string} userId - O ID do usuário logado.
 */
const showPautaSelectionScreen = (userId) => {
    const pautasList = document.getElementById('pautas-list');
    pautasList.innerHTML = '<p class="col-span-full text-center">Carregando pautas...</p>';

    const q = query(collection(db, "pautas"), where("members", "array-contains", userId));

    // 'onSnapshot' ouve por atualizações em tempo real.
    onSnapshot(q, (snapshot) => {
        pautasList.innerHTML = ''; // Limpa a lista antes de adicionar os novos itens

        if (snapshot.empty) {
            pautasList.innerHTML = '<p class="col-span-full text-center text-gray-500">Você ainda não tem pautas. Crie uma para começar.</p>';
            return;
        }

        // Usar um DocumentFragment melhora a performance ao adicionar muitos elementos ao DOM
        const fragment = document.createDocumentFragment();
        snapshot.docs.forEach((docSnap) => {
            const card = createPautaCard(docSnap);
            fragment.appendChild(card);
        });
        pautasList.appendChild(fragment);

    }, (error) => { // Adicionado tratamento de erro para a consulta
        console.error("Erro ao buscar pautas:", error);
        pautasList.innerHTML = '<p class="col-span-full text-center text-red-500">Ocorreu um erro ao carregar as pautas. Tente novamente mais tarde.</p>';
    });

    showScreen('pautaSelection');
};




const handleAuthState = () => {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists() && userDoc.data().status === 'approved') {
                currentUserName = userDoc.data().name || user.email;
                showPautaSelectionScreen(user.uid);
            } else {
                 loadingText.innerHTML = 'Sua conta está pendente de aprovação. <br> Por favor, aguarde.';
                 document.querySelector('.loader').style.display = 'none';
            }
        } else {
            showScreen('login');
        }
    });
};

const showScreen = (screenName) => {
    loadingContainer.classList.toggle('hidden', screenName !== 'loading');
    loginContainer.classList.toggle('hidden', screenName !== 'login');
    pautaSelectionContainer.classList.toggle('hidden', screenName !== 'pautaSelection');
    appContainer.classList.toggle('hidden', screenName !== 'app');
};

const switchTab = (tabName) => {
    const tabAgendamento = document.getElementById('tab-agendamento');
    const tabAvulso = document.getElementById('tab-avulso');
    const isScheduledContainer = document.getElementById('is-scheduled-container');
    const formTitle = document.getElementById('form-title');
    const pautaColumn = document.getElementById('pauta-column');

    if (tabName === 'agendamento') {
        tabAgendamento.classList.add('tab-active');
        tabAvulso.classList.remove('tab-active', 'text-gray-500', 'hover:text-gray-700');
        isScheduledContainer.classList.remove('hidden');
        pautaColumn.classList.remove('hidden');
        formTitle.textContent = "Adicionar Novo Agendamento";
    } else { // avulso
        tabAvulso.classList.add('tab-active');
        tabAgendamento.classList.remove('tab-active');
        tabAgendamento.classList.add('text-gray-500', 'hover:text-gray-700');
        isScheduledContainer.classList.add('hidden');
        pautaColumn.classList.add('hidden');
        formTitle.textContent = "Adicionar Atendimento Avulso";
        
        document.querySelector('input[name="is-scheduled"][value="no"]').checked = true;
        document.querySelector('input[name="has-arrived"][value="yes"]').checked = true;
        document.getElementById('scheduled-time-wrapper').classList.add('hidden');
        document.getElementById('arrival-time-wrapper').classList.remove('hidden');
    }
    renderAssistedList();
};

const main = () => {
    try {
        const firebaseConfig = { apiKey: "AIzaSyCrLwXmkxgeVoB8TwRI7pplCVQETGK0zkE", authDomain: "pauta-ce162.firebaseapp.com", projectId: "pauta-ce162", storageBucket: "pauta-ce162.appspot.com", messagingSenderId: "87113750208", appId: "1:87113750208:web:4abba0024f4d4af699bf25" };
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        handleAuthState();
    } catch (error) {
        console.error("Erro ao inicializar o Firebase: ", error);
        loadingText.textContent = 'Erro na configuração do Firebase.';
    }
};

const copyToClipboard = (text, message) => {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
        document.execCommand('copy');
        showNotification(message, 'info');
    } catch (err) {
        showNotification('Erro ao copiar.', 'error');
    }
    document.body.removeChild(textArea);
};

const setupModalClosers = () => {
    document.querySelectorAll('.fixed.inset-0').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
            }
        });
    });
};

document.addEventListener('DOMContentLoaded', () => {
    main();
    setupModalClosers();
    
    // --- LÓGICA DE LOGIN/CADASTRO ---
    const loginTabBtn = document.getElementById('login-tab-btn');
    const registerTabBtn = document.getElementById('register-tab-btn');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    
    loginTabBtn.addEventListener('click', () => {
        loginTabBtn.classList.add('border-green-600', 'text-green-600');
        loginTabBtn.classList.remove('text-gray-500');
        registerTabBtn.classList.remove('border-green-600', 'text-green-600');
        registerTabBtn.classList.add('text-gray-500');
        loginForm.classList.remove('hidden');
        registerForm.classList.add('hidden');
    });

    registerTabBtn.addEventListener('click', () => {
        registerTabBtn.classList.add('border-green-600', 'text-green-600');
        registerTabBtn.classList.remove('text-gray-500');
        loginTabBtn.classList.remove('border-green-600', 'text-green-600');
        loginTabBtn.classList.add('text-gray-500');
        registerForm.classList.remove('hidden');
        loginForm.classList.add('hidden');
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const errorDiv = document.getElementById('auth-error');
        try {
            await signInWithEmailAndPassword(auth, email, password);
            errorDiv.classList.add('hidden');
        } catch (error) {
            console.error("Login failed:", error);
            errorDiv.textContent = 'Email ou senha inválidos.';
            errorDiv.classList.remove('hidden');
        }
    });

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('register-name').value;
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        const errorDiv = document.getElementById('auth-error');

        if (password.length < 6) {
            errorDiv.textContent = 'A senha deve ter pelo menos 6 caracteres.';
            errorDiv.classList.remove('hidden');
            return;
        }

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            await setDoc(doc(db, "users", user.uid), {
                name: name,
                email: email,
                uid: user.uid,
                status: 'approved',
                createdAt: new Date().toISOString()
            });
            
            errorDiv.classList.add('hidden');
            showNotification('Conta criada com sucesso! Agora você pode fazer o login.', 'success');
            loginTabBtn.click();
            
        } catch (error) {
            console.error("Registration failed:", error);
            errorDiv.textContent = error.code === 'auth/email-already-in-use' ? 'Este email já está em uso.' : 'Ocorreu um erro ao criar a conta.';
            errorDiv.classList.remove('hidden');
        }
    });

    document.getElementById('forgot-password-link').addEventListener('click', (e) => {
        e.preventDefault();
        const email = prompt("Por favor, digite seu email para redefinir a senha:");
        if (email) {
            sendPasswordResetEmail(auth, email)
                .then(() => showNotification("Email de redefinição de senha enviado!", "success"))
                .catch((error) => {
                    console.error("Password reset error:", error);
                    showNotification("Erro ao enviar email. Verifique se o email está correto.", "error");
                });
        }
    });

    document.getElementById('create-pauta-btn').addEventListener('click', () => {
        document.getElementById('create-pauta-modal').classList.remove('hidden');
    });
    document.getElementById('cancel-create-pauta-btn').addEventListener('click', () => {
        document.getElementById('create-pauta-modal').classList.add('hidden');
    });
    document.getElementById('confirm-create-pauta-btn').addEventListener('click', async () => {
        const pautaName = document.getElementById('create-pauta-name-input').value.trim();
        if (!pautaName) {
            showNotification("O nome da pauta não pode ser vazio.", "error");
            return;
        }
        const user = auth.currentUser;
        if (!user) {
             showNotification("Você precisa estar logado para criar uma pauta.", "error");
            return;
        }
        try {
            await addDoc(collection(db, "pautas"), {
                name: pautaName,
                owner: user.uid,
                ownerEmail: user.email,
                members: [user.uid],
                memberEmails: [user.email],
                createdAt: new Date().toISOString()
            });
            showNotification("Pauta criada com sucesso!");
            document.getElementById('create-pauta-name-input').value = '';
            document.getElementById('create-pauta-modal').classList.add('hidden');
        } catch (error) {
            console.error("Error creating pauta:", error);
            showNotification("Erro ao criar pauta.", "error");
        }
    });

    // --- LÓGICA DE EVENTOS GERAIS E MODAIS ---
    
    document.getElementById('privacy-policy-link').addEventListener('click', e => {
        e.preventDefault();
        document.getElementById('privacy-policy-modal').classList.remove('hidden');
    });

    const privacyModal = document.getElementById('privacy-policy-modal');
    if (privacyModal) {
        const closePolicyModal = () => privacyModal.classList.add('hidden');
        privacyModal.querySelector('#close-policy-modal-btn-x')?.addEventListener('click', closePolicyModal);
        privacyModal.querySelector('#close-policy-modal-btn')?.addEventListener('click', closePolicyModal);
    }

    document.getElementById('pauta-selection-container').addEventListener('click', async (e) => {
        const deleteBtn = e.target.closest('.delete-pauta-btn');
        if (!deleteBtn) return;
        
        e.stopPropagation(); 
        const pautaId = deleteBtn.dataset.pautaId;
        const pautaName = deleteBtn.dataset.pautaName;

        if (confirm(`Tem certeza que deseja apagar a pauta "${pautaName}" e todos os seus dados? Esta ação não pode ser desfeita.`)) {
            try {
                loadingText.textContent = `Apagando pauta "${pautaName}"...`;
                showScreen('loading');

                const attendanceCollectionRef = collection(db, "pautas", pautaId, "attendances");
                const attendanceSnapshot = await getDocs(attendanceCollectionRef);
                
                if (!attendanceSnapshot.empty) {
                    const batch = writeBatch(db);
                    attendanceSnapshot.docs.forEach(doc => {
                        batch.delete(doc.ref);
                    });
                    await batch.commit(); 
                }
                
                await deleteDoc(doc(db, "pautas", pautaId));
                
                showNotification(`Pauta "${pautaName}" apagada com sucesso.`);
                showScreen('pautaSelection');
            } catch (error) {
                console.error("Error deleting pauta:", error);
                showNotification("Erro ao apagar a pauta.", "error");
                showScreen('pautaSelection');
            }
        }
    });

    document.getElementById('format-help-link').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('format-help-modal').classList.remove('hidden');
    });
    
    document.getElementById('format-help-modal').addEventListener('click', e => {
        const buttonId = e.target.id;
        if (buttonId === 'copy-csv-format-btn') {
            const text = document.getElementById('csv-format-code').innerText;
            copyToClipboard(text, 'Formato copiado!');
        } else if (buttonId === 'copy-csv-example-btn') {
            const text = document.getElementById('csv-example-code').innerText;
            copyToClipboard(text, 'Exemplo copiado!');
        } else if (buttonId === 'copy-ai-prompt-btn') {
            const text = document.getElementById('ai-prompt-code').innerText;
            copyToClipboard(text, 'Prompt para IA copiado!');
        }
    });

    document.getElementById('tab-agendamento').addEventListener('click', () => switchTab('agendamento'));
    document.getElementById('tab-avulso').addEventListener('click', () => switchTab('avulso'));

    const handleLogout = () => {
        signOut(auth).catch(error => {
            console.error("Logout error", error);
            showNotification("Erro ao tentar sair.", "error");
        });
    };
    document.getElementById('logout-btn-main').addEventListener('click', handleLogout);
    document.getElementById('logout-btn-app').addEventListener('click', handleLogout);

    ['pauta-search', 'aguardando-search', 'atendidos-search', 'faltosos-search'].forEach(id => {
        document.getElementById(id).addEventListener('input', renderAssistedList);
    });

    document.getElementById('file-upload').addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target.result;
            let lines = text.split(/\r\n|\n|\r/).filter(line => line.trim() !== '');
            if (lines.length === 0) {
                showNotification("Arquivo vazio ou em formato inválido.", "error");
                return;
            }

            const firstLineParts = lines[0].split(';');
            if (firstLineParts.length >= 3) {
                 const potentialTime = firstLineParts[1].trim();
                 if (!/^\d{1,2}:\d{2}$/.test(potentialTime)) {
                    lines.shift();
                 }
            }
           
            if (lines.length === 0) {
                showNotification("O arquivo CSV contém apenas um cabeçalho ou está vazio.", "error");
                return;
            }

            try {
                const batch = writeBatch(db);
                const collectionRef = collection(db, "pautas", currentPautaId, "attendances");
                let processedCount = 0;
                
                lines.forEach(line => {
                    const parts = line.split(';').map(item => item.trim());
                     if (parts.length >= 3) {
                        const name = parts[0];
                        const scheduledTime = parts[1];
                        const subject = parts[2];
                        const cpf = parts.length > 3 ? parts[3] : '';

                        if (name && subject && scheduledTime && /^\d{1,2}:\d{2}$/.test(scheduledTime)) {
                            const newDocRef = doc(collectionRef);
                            batch.set(newDocRef, getUpdatePayload({
                                name,
                                cpf: cpf || null,
                                subject,
                                scheduledTime,
                                status: 'pauta',
                                type: 'agendamento',
                                createdAt: new Date().toISOString()
                            }));
                            processedCount++;
                        }
                    }
                });

                if (processedCount > 0) {
                    await batch.commit();
                    const skippedCount = lines.length - processedCount;
                    showNotification(`${processedCount} registros adicionados.` + (skippedCount > 0 ? ` ${skippedCount} linhas foram ignoradas.` : ''));
                } else {
                    showNotification("Nenhum registro válido encontrado no arquivo. Verifique o formato (Nome;HH:MM;Assunto;CPF).", "error");
                }
            } catch (err) {
                console.error("Erro ao carregar pauta:", err);
                showNotification("Erro ao processar o arquivo.", "error");
            }
        };
        reader.readAsText(file);
        event.target.value = ''; 
    });

    document.getElementById('download-pdf-btn').addEventListener('click', () => {
        const { jsPDF } = window.jspdf;
        const docPDF = new jsPDF();
        
        const pautaName = document.getElementById('pauta-title').textContent;
        const currentMode = document.getElementById('tab-agendamento').classList.contains('tab-active') ? 'agendamento' : 'avulso';
        const atendidos = allAssisted
            .filter(a => a.status === 'atendido' && a.type === currentMode)
            .sort((a, b) => new Date(a.attendedTime) - new Date(b.attendedTime));

        if (atendidos.length === 0) {
            showNotification("Não há atendidos para gerar o relatório.", "info");
            return;
        }

        docPDF.setFontSize(18);
        docPDF.text(`Relatório de Atendidos - ${pautaName}`, 14, 22);
        docPDF.setFontSize(11);
        docPDF.setTextColor(100);

        const totalSubjects = atendidos.reduce((acc, a) => acc + 1 + (a.demandas?.quantidade || 0), 0);
        docPDF.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 14, 30);
        docPDF.text(`Total de Atendidos: ${atendidos.length}`, 14, 36);
        docPDF.text(`Total de Assuntos: ${totalSubjects}`, 100, 36);


        const tableColumn = ["#", "Nome", "CPF", "Assunto Principal", "Atendente", "Finalizado", "Duração"];
        const tableRows = [];

        atendidos.forEach((item, index) => {
            let duration = 'N/A';
            if (item.arrivalTime && item.attendedTime) {
                const diffMs = new Date(item.attendedTime) - new Date(item.arrivalTime);
                const diffMins = Math.round(diffMs / 60000);
                 if (!isNaN(diffMins) && diffMins >= 0) {
                    duration = `${diffMins} min`;
                }
            }
            
            const cleanString = (str) => String(str || '').replace(/"/g, '');

            const rowData = [
                index + 1,
                cleanString(item.name),
                cleanString(item.cpf),
                cleanString(item.subject),
                cleanString(item.attendant) || 'N/A',
                new Date(item.attendedTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                duration
            ];
            tableRows.push(rowData);
        });

        docPDF.autoTable(tableColumn, tableRows, { startY: 42 });
        docPDF.save(`relatorio_${pautaName.replace(/\s/g, '_')}_${new Date().toISOString().slice(0,10)}.pdf`);
    });

    document.getElementById('toggle-faltosos-btn').addEventListener('click', (e) => {
        const btn = e.currentTarget;
        const pautaColumn = document.getElementById('pauta-column');
        const faltososColumn = document.getElementById('faltosos-column');

        pautaColumn.classList.toggle('hidden');
        faltososColumn.classList.toggle('hidden');
        
        if (faltososColumn.classList.contains('hidden')) {
            btn.textContent = 'Ver Faltosos';
            btn.classList.replace('bg-blue-600', 'bg-purple-600');
            btn.classList.replace('hover:bg-blue-700', 'hover:bg-purple-700');
        } else {
            btn.textContent = 'Ver Pauta';
            btn.classList.replace('bg-purple-600', 'bg-blue-600');
            btn.classList.replace('hover:bg-purple-700', 'hover:bg-blue-700');
        }
    });
    
    document.getElementById('toggle-logic-btn').addEventListener('click', (e) => {
        const explanationDiv = document.getElementById('logic-explanation');
        const isHidden = explanationDiv.classList.toggle('hidden');
        e.target.textContent = isHidden ? 'Por que esta ordem é justa? (Clique para expandir)' : 'Ocultar explicação';
    });

    document.querySelectorAll('input[name="is-scheduled"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            document.getElementById('scheduled-time-wrapper').classList.toggle('hidden', e.target.value === 'no');
        });
    });
     document.querySelectorAll('input[name="has-arrived"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const wrapper = document.getElementById('arrival-time-wrapper');
            wrapper.classList.toggle('hidden', e.target.value === 'no');
            if (e.target.value === 'yes') {
                 document.getElementById('arrival-time').value = new Date().toTimeString().slice(0, 5);
            }
        });
    });
    
    const showMembersModal = async () => {
        if (!currentPautaId) return;
        const modal = document.getElementById('members-modal');
        const container = document.getElementById('members-list-container');
        container.innerHTML = 'Carregando...';
        modal.classList.remove('hidden');

        const pautaRef = doc(db, "pautas", currentPautaId);
        const pautaSnap = await getDoc(pautaRef);
        if (pautaSnap.exists()) {
            const pautaData = pautaSnap.data();
            currentPautaOwnerId = pautaData.owner;
            container.innerHTML = '';
            pautaData.memberEmails.forEach(email => {
                const isOwner = pautaData.ownerEmail === email;
                const memberEl = document.createElement('div');
                memberEl.className = 'flex justify-between items-center bg-gray-100 p-2 rounded';
                memberEl.innerHTML = `
                    <span>${email} ${isOwner ? '<span class="text-xs text-yellow-600 font-bold">(dono)</span>' : ''}</span>
                    ${!isOwner ? `<button data-email="${email}" class="remove-member-btn text-red-500 hover:text-red-700 text-sm font-semibold">Remover</button>` : ''}
                `;
                container.appendChild(memberEl);
            });
        }
    };
    
    const showDemandsModal = (assistedId) => {
        const modal = document.getElementById('demands-modal');
        const assisted = allAssisted.find(a => a.id === assistedId);
        if (!assisted) return;

        document.getElementById('demands-assisted-name-modal').textContent = assisted.name;
        const demandsListContainer = document.getElementById('demands-list-container');
        demandsListContainer.innerHTML = ''; 

        const demands = assisted.demandas?.descricoes || [];
        if (demands.length === 0) {
            demandsListContainer.innerHTML = '<p class="text-gray-500 text-center">Nenhuma demanda adicional.</p>';
        } else {
            demands.forEach(demandText => {
                const li = document.createElement('li');
                li.className = 'flex justify-between items-center p-2 bg-white rounded-md';
                li.textContent = demandText;
                const removeBtn = document.createElement('button');
                removeBtn.className = 'remove-demand-item-btn text-red-500 hover:text-red-700 text-xs';
                removeBtn.textContent = 'Remover';
                li.appendChild(removeBtn);
                demandsListContainer.appendChild(li);
            });
        }
        modal.classList.remove('hidden');
    };

    document.body.addEventListener('click', async (e) => {
        const button = e.target.closest('button');
        if (!button) return;

        const id = button.dataset.id;
        const collectionRef = currentPautaId ? collection(db, "pautas", currentPautaId, "attendances") : null;
        
        if (id && collectionRef) {
            const docRef = doc(collectionRef, id);
            if (button.classList.contains('check-in-btn')) { assistedIdToHandle = id; document.getElementById('arrival-modal').classList.remove('hidden'); document.getElementById('arrival-time-input').value = new Date().toTimeString().slice(0,5); }
            if (button.classList.contains('attend-btn')) { assistedIdToHandle = id; document.getElementById('attendant-modal').classList.remove('hidden'); }
            if (button.classList.contains('faltou-btn')) { await updateDoc(docRef, getUpdatePayload({ status: 'faltoso' })); showNotification("Marcado como faltoso."); }
            if (button.classList.contains('return-to-pauta-btn')) { await updateDoc(docRef, getUpdatePayload({ status: 'pauta', arrivalTime: null, priority: null })); showNotification("Retornado para a pauta."); }
            if (button.classList.contains('return-to-pauta-from-faltoso-btn')) { await updateDoc(docRef, getUpdatePayload({ status: 'pauta' })); showNotification("Revertido para a pauta."); }
            if (button.classList.contains('return-to-aguardando-btn')) { await updateDoc(docRef, getUpdatePayload({ status: 'aguardando', attendant: null, attendedTime: null })); showNotification("Retornado para aguardando."); }
            if (button.classList.contains('delete-btn')) { if(confirm("Tem certeza que deseja apagar este registro permanentemente?")) { await deleteDoc(docRef); showNotification("Registro apagado."); }}
            if (button.classList.contains('priority-btn')) { assistedIdToHandle = id; document.getElementById('priority-reason-modal').classList.remove('hidden'); }
            if (button.classList.contains('edit-assisted-btn')) { 
                assistedIdToHandle = id; 
                const assisted = allAssisted.find(a => a.id === id); 
                if(assisted){ 
                    document.getElementById('edit-assisted-name').value = assisted.name; 
                    document.getElementById('edit-assisted-cpf').value = assisted.cpf || ''; 
                    document.getElementById('edit-assisted-subject').value = assisted.subject; 
                    document.getElementById('edit-scheduled-time').value = assisted.scheduledTime || '';
                    document.getElementById('edit-assisted-modal').classList.remove('hidden');
                } 
            }
            if (button.classList.contains('edit-attendant-btn')) {
                assistedIdToHandle = id;
                const assisted = allAssisted.find(a => a.id === id);
                if (assisted) {
                    document.getElementById('edit-attendant-name').value = assisted.attendant || '';
                    document.getElementById('edit-attendant-modal').classList.remove('hidden');
                }
            }
            if (button.classList.contains('view-details-btn')) {
                assistedIdToHandle = id;
                const assisted = allAssisted.find(a => a.id === id);
                if (assisted) {
                    document.getElementById('documents-assisted-name').textContent = assisted.name;
                    document.getElementById('document-checklist-view').classList.add('hidden');
                    document.getElementById('document-action-selection').classList.remove('hidden');
                    document.getElementById('documents-modal').classList.remove('hidden');
                }
            }
            if (button.classList.contains('manage-demands-btn')) {
                assistedIdToHandle = id;
                showDemandsModal(id);
            }
        }

        if (button.id === 'back-to-pautas-btn') {
            if (unsubscribeFromAttendances) unsubscribeFromAttendances();
            currentPautaId = null;
            allAssisted = [];
            showPautaSelectionScreen(auth.currentUser.uid);
        }
        if (button.id === 'reset-all-btn') {
            document.getElementById('reset-confirm-modal').classList.remove('hidden');
        }
        if (button.id === 'edit-pauta-name-btn') {
            const currentName = document.getElementById('pauta-title').textContent;
            document.getElementById('edit-pauta-name-input').value = currentName;
            document.getElementById('edit-pauta-modal').classList.remove('hidden');
        }
        if (button.id === 'manage-members-btn') {
            await showMembersModal();
        }

        if (button.id === 'add-assisted-btn') {
            const name = document.getElementById('assisted-name').value.trim();
            if (!name) { showNotification("O nome é obrigatório.", "error"); return; }
            
            const currentMode = document.getElementById('tab-agendamento').classList.contains('tab-active') ? 'agendamento' : 'avulso';
            let isScheduled, hasArrived, scheduledTimeValue;

            if (currentMode === 'agendamento') {
                isScheduled = document.querySelector('input[name="is-scheduled"]:checked').value === 'yes';
                hasArrived = document.querySelector('input[name="has-arrived"]:checked').value === 'yes';
                scheduledTimeValue = isScheduled ? document.getElementById('scheduled-time').value : null;
            } else { 
                isScheduled = false;
                hasArrived = true;
                scheduledTimeValue = null;
            }

            let arrivalDate = null;
            if (hasArrived) {
                const timeInput = document.getElementById('arrival-time').value;
                const [hours, minutes] = timeInput.split(':');
                arrivalDate = new Date();
                arrivalDate.setHours(hours, minutes, 0, 0);
            }
            
            const newAssisted = getUpdatePayload({
                name,
                cpf: document.getElementById('assisted-cpf').value.trim(),
                subject: document.getElementById('assisted-subject').value.trim(),
                type: currentMode,
                status: hasArrived ? 'aguardando' : 'pauta',
                scheduledTime: scheduledTimeValue,
                arrivalTime: hasArrived ? arrivalDate.toISOString() : null,
                createdAt: new Date().toISOString()
            });

            await addDoc(collectionRef, newAssisted);
            showNotification("Assistido adicionado com sucesso!");
            document.getElementById('form-agendamento').reset();
            document.getElementById('scheduled-time-wrapper').classList.add('hidden');
            document.getElementById('arrival-time-wrapper').classList.add('hidden');
        }

        if (button.id === 'confirm-arrival-btn') {
            const arrivalTimeInput = document.getElementById('arrival-time-input').value;
            if (!arrivalTimeInput) { showNotification("Por favor, informe o horário.", "error"); return; }
            const [hours, minutes] = arrivalTimeInput.split(':');
            const arrivalDate = new Date();
            arrivalDate.setHours(hours, minutes, 0, 0);

            await updateDoc(doc(collectionRef, assistedIdToHandle), getUpdatePayload({ status: 'aguardando', arrivalTime: arrivalDate.toISOString() }));
            button.closest('.fixed').classList.add('hidden');
        }
        if (button.id === 'confirm-attendant-btn') {
            const attendantName = document.getElementById('attendant-name').value.trim();
            await updateDoc(doc(collectionRef, assistedIdToHandle), getUpdatePayload({ status: 'atendido', attendant: attendantName, attendedTime: new Date().toISOString() }));
            button.closest('.fixed').classList.add('hidden');
        }
        if (button.id === 'confirm-priority-reason-btn') {
            const reason = document.getElementById('priority-reason-input').value.trim();
            if (!reason) { showNotification("O motivo é obrigatório.", "error"); return; }
            await updateDoc(doc(collectionRef, assistedIdToHandle), getUpdatePayload({ priority: 'URGENTE', priorityReason: reason }));
            button.closest('.fixed').classList.add('hidden');
        }
        if (button.id === 'confirm-edit-assisted-btn') {
            const name = document.getElementById('edit-assisted-name').value.trim();
            if (!name) { showNotification("O nome não pode ficar em branco.", "error"); return; }
            const updatedData = {
                name,
                cpf: document.getElementById('edit-assisted-cpf').value.trim(),
                subject: document.getElementById('edit-assisted-subject').value.trim(),
                scheduledTime: document.getElementById('edit-scheduled-time').value || null,
            };
            await updateDoc(doc(collectionRef, assistedIdToHandle), getUpdatePayload(updatedData));
            button.closest('.fixed').classList.add('hidden');
        }
        if (button.id === 'confirm-edit-attendant-btn') {
            const attendantName = document.getElementById('edit-attendant-name').value.trim();
            await updateDoc(doc(collectionRef, assistedIdToHandle), getUpdatePayload({ attendant: attendantName }));
            button.closest('.fixed').classList.add('hidden');
        }
        if (button.id === 'confirm-reset-btn') {
            const attendanceCollectionRef = collection(db, "pautas", currentPautaId, "attendances");
            const snapshot = await getDocs(attendanceCollectionRef);
            if(snapshot.empty) {
                showNotification("A pauta já está vazia.", "info");
                button.closest('.fixed').classList.add('hidden');
                return;
            }
            const batch = writeBatch(db);
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            showNotification("Pauta zerada com sucesso.", "success");
            button.closest('.fixed').classList.add('hidden');
        }
        if (button.id === 'confirm-edit-pauta-btn') {
            const newName = document.getElementById('edit-pauta-name-input').value.trim();
            if (newName && currentPautaId) {
                await updateDoc(doc(db, "pautas", currentPautaId), { name: newName });
                document.getElementById('pauta-title').textContent = newName;
                showNotification("Nome da pauta atualizado.");
                button.closest('.fixed').classList.add('hidden');
            } else {
                showNotification("O nome não pode ser vazio.", "error");
            }
        }
        if(button.id === 'invite-member-btn') {
            const email = document.getElementById('invite-email-input').value.trim().toLowerCase();
            const statusDiv = document.getElementById('invite-status');
            if (!email) { statusDiv.textContent = 'Por favor, insira um email.'; return; }
            
            statusDiv.textContent = 'Verificando...';
            const usersRef = collection(db, "users");
            const q = query(usersRef, where("email", "==", email));
            const querySnapshot = await getDocs(q);
            
            if (querySnapshot.empty) {
                statusDiv.textContent = 'Usuário não encontrado.';
                return;
            }
            
            const userDoc = querySnapshot.docs[0];
            const pautaRef = doc(db, "pautas", currentPautaId);

            await updateDoc(pautaRef, {
                members: arrayUnion(userDoc.id),
                memberEmails: arrayUnion(email)
            });
            
            statusDiv.textContent = `Usuário ${email} convidado!`;
            document.getElementById('invite-email-input').value = '';
            await showMembersModal();
        }
        if(button.classList.contains('remove-member-btn')) {
            const email = button.dataset.email;
            if (confirm(`Tem certeza que deseja remover ${email}?`)) {
                const usersRef = collection(db, "users");
                const q = query(usersRef, where("email", "==", email));
                const querySnapshot = await getDocs(q);
                if (!querySnapshot.empty) {
                    const userId = querySnapshot.docs[0].id;
                    const pautaRef = doc(db, "pautas", currentPautaId);
                    await updateDoc(pautaRef, {
                        members: arrayRemove(userId),
                        memberEmails: arrayRemove(email)
                    });
                    showNotification(`Membro ${email} removido.`);
                    await showMembersModal();
                }
            }
        }
        
        if (button.id === 'add-demand-btn') {
            const input = document.getElementById('new-demand-input');
            const text = input.value.trim();
            if(text) {
                const demandsListContainer = document.getElementById('demands-list-container');
                if(demandsListContainer.querySelector('p')) {
                    demandsListContainer.innerHTML = '';
                }
                const li = document.createElement('li');
                li.className = 'flex justify-between items-center p-2 bg-white rounded-md text-sm';
                li.textContent = text;
                const removeBtn = document.createElement('button');
                removeBtn.className = 'remove-demand-item-btn text-red-500 hover:text-red-700 text-xs font-semibold ml-2';
                removeBtn.textContent = 'Remover';
                li.appendChild(removeBtn);
                demandsListContainer.appendChild(li);
                input.value = '';
            }
        }
        if (button.classList.contains('remove-demand-item-btn')) {
            const li = button.parentElement;
            li.remove();
            const demandsListContainer = document.getElementById('demands-list-container');
            if (demandsListContainer.children.length === 0) {
                 demandsListContainer.innerHTML = '<p class="text-gray-500 text-center">Nenhuma demanda adicional.</p>';
            }
        }
        if (button.id === 'save-demands-btn') {
            const demandsListContainer = document.getElementById('demands-list-container');
            const items = demandsListContainer.querySelectorAll('li');
            const descricoes = Array.from(items).map(li => li.firstChild.textContent);
            const demandsData = {
                quantidade: descricoes.length,
                descricoes: descricoes
            };
            const docRef = doc(collectionRef, assistedIdToHandle);
            await updateDoc(docRef, getUpdatePayload({ demandas: demandsData }));
            showNotification("Demandas salvas com sucesso!");
            document.getElementById('demands-modal').classList.add('hidden');
        }

        if (button.id.startsWith('cancel-') || button.id.startsWith('close-')) {
            button.closest('.fixed').classList.add('hidden');
        }
        if (button.id === 'close-documents-modal-btn' || button.id === 'cancel-checklist-btn') {
             document.getElementById('documents-modal').classList.add('hidden');
        }

        if (button.classList.contains('toggle-details-btn')) {
            const card = button.closest('div.p-4');
            const details = card.querySelector('.card-details');
            const icon = button.querySelector('svg');
            details.classList.toggle('hidden');
            icon.style.transform = details.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
        }
    });

    const documentsData = {
        alimentos_fixacao: {
            title: 'Ação de Alimentos (Fixação)',
            sections: [
                { title: 'Do Representante Legal:', docs: ['ID e CPF', 'Comprovante de residência', 'Certidão de nascimento/casamento', 'Comprovante de renda', 'Dados bancários'] },
                { title: 'Do Filho(a):', docs: ['Certidão de Nascimento', 'Comprovantes de despesas (escola, saúde)'] },
                { title: 'Sobre o Réu:', docs: ['Endereço completo', 'Local de trabalho (se souber)'] }
            ]
        },
        alimentos_oferta: {
            title: 'Oferta de Alimentos',
            sections: [
                { title: 'Do Ofertante:', docs: ['ID e CPF', 'Comprovante de residência', 'Comprovante de renda'] },
                { title: 'Do Filho(a):', docs: ['Certidão de Nascimento'] },
                { title: 'Sobre o Representante Legal:', docs: ['Nome e endereço completo', 'Dados bancários (se souber)'] }
            ]
        },
        alimentos_exoneracao: {
            title: 'Exoneração de Alimentos',
            sections: [
                { title: 'Do Requerente (quem paga):', docs: ['ID e CPF', 'Comprovante de residência', 'Sentença que fixou os alimentos'] },
                { title: 'Do Filho(a) (maior de idade):', docs: ['Nome e endereço completo', 'Comprovante de que não estuda mais ou pode se sustentar (se houver)'] }
            ]
        },
        alimentos_revisional: {
            title: 'Revisional de Alimentos',
            sections: [
                { title: 'Do Requerente:', docs: ['ID e CPF', 'Comprovante de residência', 'Sentença que fixou os alimentos', 'Prova da mudança da situação financeira (desemprego, nova prole, etc.)'] },
                { title: 'Da Outra Parte:', docs: ['Nome e endereço completo'] }
            ]
        },
        divorcio_litigioso: {
            title: 'Divórcio Litigioso',
            sections: [
                { title: 'Do Requerente:', docs: ['ID e CPF', 'Comprovante de residência', 'Certidão de Casamento atualizada'] },
                { title: 'Dos Filhos (se houver):', docs: ['Certidão de Nascimento dos filhos'] },
                { title: 'Dos Bens (se houver):', docs: ['Documentos de propriedade de imóveis, veículos, etc.'] },
                { title: 'Do Cônjuge:', docs: ['Endereço completo para citação'] }
            ]
        },
        divorcio_consensual: {
            title: 'Divórcio Consensual',
            sections: [
                { title: 'De Ambos os Cônjuges:', docs: ['ID e CPF de ambos', 'Comprovante de residência de ambos', 'Certidão de Casamento atualizada', 'Pacto antenupcial (se houver)'] },
                { title: 'Acordo:', docs: ['Definição sobre partilha de bens', 'Definição sobre pensão (se houver)', 'Definição sobre guarda dos filhos (se houver)'] }
            ]
        },
        guarda_visitas: {
            title: 'Guarda e Regul. de Visitas',
            sections: [
                { title: 'Do Requerente:', docs: ['ID e CPF', 'Comprovante de residência'] },
                { title: 'Do Filho(a):', docs: ['Certidão de Nascimento'] },
                { title: 'Da Outra Parte:', docs: ['Nome e endereço completo'] }
            ]
        },
        paternidade: {
            title: 'Investigação de Paternidade',
            sections: [
                { title: 'Do Representante Legal:', docs: ['ID e CPF', 'Comprovante de residência'] },
                { title: 'Do Filho(a):', docs: ['Certidão de Nascimento'] },
                { title: 'Do Suposto Pai:', docs: ['Nome e endereço completo', 'Qualquer prova que indique a paternidade (fotos, mensagens, etc.)'] }
            ]
        },
        uniao_estavel: {
            title: 'União Estável (Rec./Diss.)',
            sections: [
                { title: 'De Ambos os Companheiros:', docs: ['ID e CPF de ambos', 'Comprovante de residência'] },
                { title: 'Provas da União:', docs: ['Fotos do casal', 'Declaração de testemunhas', 'Contas conjuntas', 'Filhos em comum (Certidão de Nascimento)'] }
            ]
        }
    };

    const actionSelectionView = document.getElementById('document-action-selection');
    const checklistView = document.getElementById('document-checklist-view');
    const checklistContainer = document.getElementById('checklist-container');
    const checklistTitle = document.getElementById('checklist-title');

    actionSelectionView.addEventListener('click', (e) => {
        const actionButton = e.target.closest('button[data-action]');
        if (!actionButton) return;

        const actionKey = actionButton.dataset.action;
        currentChecklistAction = actionKey;
        const data = documentsData[actionKey];
        const assisted = allAssisted.find(a => a.id === assistedIdToHandle);
        const savedChecklist = assisted?.documentChecklist;

        checklistTitle.textContent = data.title;
        checklistContainer.innerHTML = '';

        data.sections.forEach((section, sectionIndex) => {
            const sectionDiv = document.createElement('div');
            const sectionTitleEl = document.createElement('h4');
            sectionTitleEl.className = 'font-bold text-md text-gray-700 mb-2 mt-3 border-b pb-1';
            sectionTitleEl.textContent = section.title;
            sectionDiv.appendChild(sectionTitleEl);

            const list = document.createElement('ul');
            list.className = 'space-y-2';
            section.docs.forEach((docText, docIndex) => {
                const listItem = document.createElement('li');
                const label = document.createElement('label');
                label.className = 'flex items-center text-gray-800 cursor-pointer';
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                const checkboxId = `doc-${actionKey}-${sectionIndex}-${docIndex}`;
                checkbox.id = checkboxId;
                checkbox.className = 'h-5 w-5 rounded border-gray-300 text-green-600 focus:ring-green-500 mr-3';
                
                if(savedChecklist && savedChecklist.action === actionKey && savedChecklist.checkedIds?.includes(checkboxId)){
                    checkbox.checked = true;
                }

                label.appendChild(checkbox);
                label.appendChild(document.createTextNode(docText));
                listItem.appendChild(label);
                list.appendChild(listItem);
            });
            sectionDiv.appendChild(list);
            checklistContainer.appendChild(sectionDiv);
        });

        actionSelectionView.classList.add('hidden');
        checklistView.classList.remove('hidden');
        checklistView.classList.add('flex');
    });

    document.getElementById('back-to-action-selection-btn').addEventListener('click', () => {
        checklistView.classList.add('hidden');
        checklistView.classList.remove('flex');
        actionSelectionView.classList.remove('hidden');
    });

    document.getElementById('save-checklist-btn').addEventListener('click', async () => {
        if (!assistedIdToHandle || !currentChecklistAction) return;

        const checkedCheckboxes = checklistContainer.querySelectorAll('input[type="checkbox"]:checked');
        const checkedIds = Array.from(checkedCheckboxes).map(cb => cb.id);

        const checklistData = {
            action: currentChecklistAction,
            checkedIds: checkedIds
        };

        try {
            const docRef = doc(db, "pautas", currentPautaId, "attendances", assistedIdToHandle);
            await updateDoc(docRef, getUpdatePayload({ documentChecklist: checklistData }));
            showNotification("Checklist salvo com sucesso!", "success");
            document.getElementById('documents-modal').classList.add('hidden');
        } catch (error) {
            console.error("Erro ao salvar o checklist: ", error);
            showNotification("Erro ao salvar o checklist.", "error");
        }
    });

    document.getElementById('checklist-search').addEventListener('input', (e) => {
        const searchTerm = normalizeText(e.target.value);
        const allDocs = checklistContainer.querySelectorAll('li');
        allDocs.forEach(li => {
            const labelText = normalizeText(li.textContent);
            if (labelText.includes(searchTerm)) {
                li.style.display = 'block';
            } else {
                li.style.display = 'none';
            }
        });
    });

});
