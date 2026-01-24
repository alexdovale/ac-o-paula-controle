// js/pauta.js
import { 
    collection, 
    onSnapshot, 
    doc, 
    updateDoc, 
    deleteDoc, 
    writeBatch, 
    addDoc 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/**
 * Escuta mudanças nos atendimentos em tempo real.
 */
export const setupAttendancesListener = (db, pautaId, callback) => {
    const colRef = collection(db, "pautas", pautaId, "attendances");
    return onSnapshot(colRef, (snapshot) => {
        const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        callback(data);
    });
};

/**
 * Atualiza o status de um assistido (ex: pauta -> aguardando).
 */
export const updateAttendanceStatus = async (db, pautaId, assistidoId, newData) => {
    const docRef = doc(db, "pautas", pautaId, "attendances", assistidoId);
    return await updateDoc(docRef, {
        ...newData,
        lastActionTimestamp: new Date().toISOString()
    });
};

/**
 * Exclui um assistido permanentemente.
 */
export const deleteAttendance = async (db, pautaId, assistidoId) => {
    const docRef = doc(db, "pautas", pautaId, "attendances", assistidoId);
    return await deleteDoc(docRef);
};

/**
 * Lógica de movimentação manual na fila (Setas ou Drag and Drop).
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
 * Salva múltiplos assistidos vindos da importação CSV.
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
            lastActionBy: userName
        });
    });
    return await batch.commit();
};
