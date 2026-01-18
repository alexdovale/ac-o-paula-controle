// js/pauta.js - REGRA DE NEGÓCIOS E FILAS

import { collection, onSnapshot, doc, updateDoc, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

export const setupAttendancesListener = (db, pautaId, callback) => {
    const q = collection(db, "pautas", pautaId, "attendances");
    return onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        callback(data);
    });
};

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
        batch.update(doc(db, "pautas", pautaId, "attendances", item.id), { manualIndex: index });
    });
    await batch.commit();
};
