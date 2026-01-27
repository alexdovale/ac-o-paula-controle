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
 * Escuta mudanças nos atendimentos em tempo real para uma pauta específica.
 */
export const setupAttendancesListener = (db, pautaId, callback) => {
    if (!pautaId) return;
    const colRef = collection(db, "pautas", pautaId, "attendances");
    return onSnapshot(colRef, (snapshot) => {
        const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        callback(data);
    }, (error) => {
        console.error("Erro no listener de atendimentos:", error);
    });
};

/**
 * Atualiza dados de um atendimento (ex: mudar de pauta para aguardando).
 */
export const updateAttendanceStatus = async (db, pautaId, assistidoId, newData) => {
    if (!pautaId || !assistidoId) return;
    const docRef = doc(db, "pautas", pautaId, "attendances", assistidoId);
    return await updateDoc(docRef, {
        ...newData,
        lastActionTimestamp: new Date().toISOString()
    });
};

/**
 * Exclui um assistido da pauta.
 */
export const deleteAttendance = async (db, pautaId, assistidoId) => {
    if (!pautaId || !assistidoId) return;
    const docRef = doc(db, "pautas", pautaId, "attendances", assistidoId);
    return await deleteDoc(docRef);
};

/**
 * Salva a lista de assistidos vinda da importação de um arquivo CSV.
 */
export const saveImportedPauta = async (db, pautaId, data, userName) => {
    if (!pautaId || !data || data.length === 0) return;

    const batch = writeBatch(db);
    const collectionRef = collection(db, "pautas", pautaId, "attendances");

    data.forEach(item => {
        const newDocRef = doc(collectionRef);
        batch.set(newDocRef, {
            name: item.name,
            scheduledTime: item.scheduledTime,
            subject: item.subject,
            cpf: item.cpf || null,
            status: 'pauta',
            type: 'agendamento',
            createdAt: new Date().toISOString(),
            lastActionBy: userName || 'Sistema',
            isConfirmed: false,
            confirmationDetails: null
        });
    });

    return await batch.commit();
};

/**
 * Lógica para reordenar a fila manualmente (Setas ou Drag and Drop).
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
