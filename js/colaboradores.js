// js/colaboradores.js
import { 
    collection, 
    onSnapshot, 
    addDoc, 
    doc, 
    updateDoc, 
    deleteDoc, 
    getDocs, 
    writeBatch 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/**
 * Escuta mudanças na lista de colaboradores da pauta em tempo real
 */
export function setupCollaboratorsListener(db, pautaId, callback) {
    if (!pautaId) return;
    
    const collaboratorsCollectionRef = collection(db, "pautas", pautaId, "collaborators");
    
    return onSnapshot(collaboratorsCollectionRef, (snapshot) => {
        const lista = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Ordena por nome antes de devolver para a interface
        lista.sort((a, b) => a.nome.localeCompare(b.nome)); 
        callback(lista);
    }, (error) => {
        console.error("Erro no listener de colaboradores:", error);
    });
}

/**
 * Salva ou Atualiza um colaborador
 */
export const saveCollaboratorData = async (db, pautaId, data, editId = null) => {
    const collaboratorsCollectionRef = collection(db, "pautas", pautaId, "collaborators");

    if (editId) {
        // Modo Edição
        const collaboratorRef = doc(collaboratorsCollectionRef, editId);
        return await updateDoc(collaboratorRef, data);
    } else {
        // Modo Novo Registro
        return await addDoc(collaboratorsCollectionRef, {
            ...data,
            presente: false,
            horario: '--:--'
        });
    }
};

/**
 * Altera apenas o status de presença de um colaborador
 */
export const toggleCollaboratorPresence = async (db, pautaId, collabId, isPresent) => {
    const collaboratorRef = doc(db, "pautas", pautaId, "collaborators", collabId);
    const horario = isPresent ? new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
    
    return await updateDoc(collaboratorRef, { 
        presente: isPresent, 
        horario: horario 
    });
};

/**
 * Exclui um colaborador da lista
 */
export const deleteCollaborator = async (db, pautaId, collabId) => {
    const collaboratorRef = doc(db, "pautas", pautaId, "collaborators", collabId);
    return await deleteDoc(collaboratorRef);
};

/**
 * Limpa toda a lista de presença de uma pauta (Batch)
 */
export const clearCollaborators = async (db, pautaId) => {
    const collaboratorsCollectionRef = collection(db, "pautas", pautaId, "collaborators");
    const snapshot = await getDocs(collaboratorsCollectionRef);
    
    if (snapshot.empty) return;

    const batch = writeBatch(db);
    snapshot.docs.forEach(d => {
        batch.delete(d.ref);
    });
    
    return await batch.commit();
};
