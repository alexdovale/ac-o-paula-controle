// js/pauta.js
import { 
    collection, 
    onSnapshot, 
    doc, 
    updateDoc, 
    deleteDoc, 
    writeBatch, 
    addDoc, 
    query, 
    orderBy 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { normalizeText } from './utils.js';

/**
 * 1. ESCUTA ATENDIMENTOS EM TEMPO REAL
 */
export const setupAttendancesListener = (db, pautaId, callback) => {
    const colRef = collection(db, "pautas", pautaId, "attendances");
    // Ordenamos inicialmente por índice manual ou criação
    return onSnapshot(colRef, (snapshot) => {
        const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        callback(data);
    });
};

/**
 * 2. CÁLCULO DE PRIORIDADE (Lógica Original de 20 Minutos)
 */
export const getPriorityLevel = (assisted) => {
    if (!assisted || assisted.status !== 'aguardando') return 'N/A';
    
    // Se foi marcado manualmente como URGENTE
    if (assisted.priority === 'URGENTE') return 'URGENTE';

    // Atendimentos avulsos são sempre Média
    if (assisted.type === 'avulso') return 'Média';

    // Se for agendado mas não tiver horário de chegada registrado ainda
    if (!assisted.scheduledTime || !assisted.arrivalTime) return 'Média';

    const scheduled = new Date(`1970-01-01T${assisted.scheduledTime}`);
    const arrival = new Date(assisted.arrivalTime);
    const arrivalTimeOnly = new Date(`1970-01-01T${arrival.toTimeString().slice(0, 5)}`);

    // Diferença em minutos entre chegada e agendamento
    const diffMinutes = (arrivalTimeOnly - scheduled) / (1000 * 60);

    if (diffMinutes <= 0) return 'Máxima';      // Chegou adiantado ou no horário
    if (diffMinutes <= 20) return 'Média';     // Atraso tolerável até 20 min
    return 'Mínima';                           // Atraso superior a 20 min
};

/**
 * 3. FILTRO DE BUSCA INTELIGENTE
 */
export const searchFilter = (assisted, term) => {
    if (!term) return true;
    const normTerm = normalizeText(term);
    
    const arrivalTime = assisted.arrivalTime ? 
        new Date(assisted.arrivalTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
    
    const attendant = (typeof assisted.attendant === 'object') ? 
        (assisted.attendant.nome || assisted.attendant.name || '') : (assisted.attendant || '');

    return normalizeText(assisted.name).includes(normTerm) ||
           (assisted.cpf && normalizeText(assisted.cpf).includes(normTerm)) ||
           normalizeText(assisted.subject).includes(normTerm) ||
           (assisted.scheduledTime && assisted.scheduledTime.includes(normTerm)) ||
           (arrivalTime && arrivalTime.includes(normTerm)) ||
           (attendant && normalizeText(attendant).includes(normTerm));
};

/**
 * 4. ADICIONAR NOVO ASSISTIDO
 */
export const addAssisted = async (db, pautaId, data) => {
    const colRef = collection(db, "pautas", pautaId, "attendances");
    return await addDoc(colRef, {
        ...data,
        createdAt: new Date().toISOString()
    });
};

/**
 * 5. ATUALIZAR STATUS OU DADOS
 */
export const updateAttendance = async (db, pautaId, assistedId, newData) => {
    const docRef = doc(db, "pautas", pautaId, "attendances", assistedId);
    return await updateDoc(docRef, {
        ...newData,
        lastActionTimestamp: new Date().toISOString()
    });
};

/**
 * 6. EXCLUIR ASSISTIDO
 */
export const deleteAttendance = async (db, pautaId, assistedId) => {
    const docRef = doc(db, "pautas", pautaId, "attendances", assistedId);
    return await deleteDoc(docRef);
};

/**
 * 7. LÓGICA DE MOVIMENTAÇÃO MANUAL NA FILA (Setas)
 */
export const moveInQueueLogic = async (db, pautaId, list, id, direction) => {
    const currentIndex = list.findIndex(item => item.id === id);
    if (currentIndex === -1) return;

    let newList = [...list];

    if (direction === 'up' && currentIndex > 0) {
        [newList[currentIndex - 1], newList[currentIndex]] = [newList[currentIndex], newList[currentIndex - 1]];
    } else if (direction === 'down' && currentIndex < newList.length - 1) {
        [newList[currentIndex], newList[currentIndex + 1]] = [newList[currentIndex + 1], newList[currentIndex]];
    } else if (direction === 'top') {
        const [movedItem] = newList.splice(currentIndex, 1);
        newList.unshift(movedItem);
    }

    const batch = writeBatch(db);
    newList.forEach((item, index) => {
        const ref = doc(db, "pautas", pautaId, "attendances", item.id);
        batch.update(ref, { manualIndex: index });
    });
    return await batch.commit();
};

/**
 * 8. SALVAMENTO EM LOTE (Importação CSV)
 */
export const saveImportedPauta = async (db, pautaId, data, userName) => {
    const batch = writeBatch(db);
    data.forEach(item => {
        const ref = doc(collection(db, "pautas", pautaId, "attendances"));
        batch.set(ref, {
            ...item,
            status: 'pauta',
            type: 'agendamento',
            createdAt: new Date().toISOString(),
            lastActionBy: userName,
            documentState: null, // Reset do estado do checklist
            isConfirmed: false
        });
    });
    return await batch.commit();
};
