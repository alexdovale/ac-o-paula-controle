// js/pauta.js
import { collection, onSnapshot, doc, updateDoc, deleteDoc, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/**
 * CALCULA O NÍVEL DE PRIORIDADE (Lógica original preservada)
 */
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

/**
 * SALVA PAUTA IMPORTADA (CSV)
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
            isConfirmed: false,
            confirmationDetails: null
        });
    });
    return await batch.commit();
};

/**
 * LISTENER DE ATENDIMENTOS
 */
export const setupAttendancesListener = (db, pautaId, callback) => {
    const colRef = collection(db, "pautas", pautaId, "attendances");
    return onSnapshot(colRef, (snapshot) => {
        const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        callback(data);
    });
};
