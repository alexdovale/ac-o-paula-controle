// js/colaboradores.js - EQUIPES

import { collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

export const setupCollaboratorsListener = (db, pautaId, callback) => {
    const q = collection(db, "pautas", pautaId, "collaborators");
    return onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        callback(data);
    });
};

export const saveCollaboratorData = async (db, pautaId, data, editId = null) => {
    const colRef = collection(db, "pautas", pautaId, "collaborators");
    if (editId) {
        await updateDoc(doc(colRef, editId), data);
    } else {
        await addDoc(colRef, { ...data, presente: false, horario: '--:--' });
    }
};
