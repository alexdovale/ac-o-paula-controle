import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, where, writeBatch, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { Utils } from './utils.js';

export const PautaService = {
    currentListeners: new Map(),

    setupAttendancesListener(db, pautaId, callback) {
        if (this.currentListeners.has(pautaId)) {
            this.currentListeners.get(pautaId)();
        }

        const attendanceRef = collection(db, "pautas", pautaId, "attendances");
        const unsubscribe = onSnapshot(attendanceRef, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(data);
        });

        this.currentListeners.set(pautaId, unsubscribe);
        return unsubscribe;
    },

    async addAssisted(db, pautaId, data, userName) {
        const payload = {
            ...data,
            lastActionBy: userName,
            lastActionTimestamp: new Date().toISOString(),
            createdAt: new Date().toISOString()
        };

        const attendanceRef = collection(db, "pautas", pautaId, "attendances");
        await addDoc(attendanceRef, payload);
        Utils.showNotification("Assistido adicionado!");
    },

    async updateStatus(db, pautaId, assistedId, updates, userName) {
        const docRef = doc(db, "pautas", pautaId, "attendances", assistedId);
        await updateDoc(docRef, {
            ...updates,
            lastActionBy: userName,
            lastActionTimestamp: new Date().toISOString()
        });
    },

    async deleteAssisted(db, pautaId, assistedId) {
        const docRef = doc(db, "pautas", pautaId, "attendances", assistedId);
        await deleteDoc(docRef);
        Utils.showNotification("Registro apagado.");
    },

    async reorderQueue(db, pautaId, items) {
        const batch = writeBatch(db);
        items.forEach((item, index) => {
            const docRef = doc(db, "pautas", pautaId, "attendances", item.id);
            batch.update(docRef, { manualIndex: index });
        });
        await batch.commit();
    },

    async handleCSVUpload(event, app) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const { parsePautaCSV } = await import('./csvHandler.js');
            const assistidos = await parsePautaCSV(file);
            
            for (const assistido of assistidos) {
                await this.addAssisted(app.db, app.currentPauta.id, assistido, app.currentUser.displayName);
            }
            
            Utils.showNotification(`${assistidos.length} registros importados!`);
        } catch (error) {
            Utils.showNotification(error.message, "error");
        } finally {
            event.target.value = '';
        }
    },

    calculatePriority(assisted) {
        // Lógica de cálculo de prioridade
        if (!assisted || assisted.status !== 'aguardando') return 'N/A';
        if (assisted.priority === 'URGENTE') return 'URGENTE';
        if (assisted.type === 'avulso') return 'Média';
        // ... resto da lógica
    },

    sortAguardando(list, orderType) {
        // Lógica de ordenação da fila
        return [...list].sort((a, b) => {
            if (orderType === 'manual') return (a.manualIndex || 0) - (b.manualIndex || 0);
            // ... resto da lógica
        });
    },

    getPriorityClass(priority) {
        return {
            'URGENTE': 'priority-urgente',
            'Máxima': 'priority-maxima',
            'Média': 'priority-media',
            'Mínima': 'priority-minima'
        }[priority] || '';
    }
};
