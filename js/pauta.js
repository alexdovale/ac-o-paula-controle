// js/pauta.js
import { collection, onSnapshot, doc, updateDoc, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { normalizeText } from './utils.js';

// CALCULA O NÍVEL DE PRIORIDADE (Lógica Original de 20 min)
export const getPriorityLevel = (assisted) => {
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

// FILTRO DE BUSCA (Nome, CPF, Assunto, Atendente)
export const searchFilter = (assisted, term) => {
    if (!term) return true;
    const normTerm = normalizeText(term);
    const arrivalTime = assisted.arrivalTime ? new Date(assisted.arrivalTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
    const attendant = (typeof assisted.attendant === 'object') ? assisted.attendant.nome || '' : assisted.attendant || '';

    return normalizeText(assisted.name).includes(normTerm) ||
           (assisted.cpf && normalizeText(assisted.cpf).includes(normTerm)) ||
           normalizeText(assisted.subject).includes(normTerm) ||
           (assisted.scheduledTime && assisted.scheduledTime.includes(normTerm)) ||
           (arrivalTime && arrivalTime.includes(normTerm)) ||
           (attendant && normalizeText(attendant).includes(normTerm));
};

export const setupAttendancesListener = (db, pautaId, callback) => {
    const colRef = collection(db, "pautas", pautaId, "attendances");
    return onSnapshot(colRef, (snapshot) => {
        const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        callback(data);
    });
};

export const saveImportedPauta = async (db, pautaId, data, userName) => {
    const batch = writeBatch(db);
    data.forEach(item => {
        const ref = doc(collection(db, "pautas", pautaId, "attendances"));
        batch.set(ref, {
            ...item, status: 'pauta', type: 'agendamento', createdAt: new Date().toISOString(),
            lastActionBy: userName, documentState: null
        });
    });
    return await batch.commit();
};
