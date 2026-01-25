// js/admin.js
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, orderBy, limit, where, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { escapeHTML, showNotification } from './utils.js';

/**
 * Grava uma ação no log de auditoria do sistema
 */
export const logAction = async (db, auth, userName, currentPautaId, actionType, details, targetId = null) => {
    try {
        if (!auth.currentUser) return;
        await addDoc(collection(db, "audit_logs"), {
            action: actionType,
            details: details,
            targetId: targetId,
            pautaId: currentPautaId || 'N/A',
            userEmail: auth.currentUser.email,
            userId: auth.currentUser.uid,
            userName: userName || 'Desconhecido',
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent
        });
    } catch (error) {
        console.error("Falha ao gravar log:", error);
    }
};

/**
 * Carrega a lista de usuários (Pendentes e Aprovados) para o Painel Admin
 */
export const loadUsersList = async (db) => {
    const snapshot = await getDocs(collection(db, "users"));
    const pendingList = document.getElementById('pending-users-list');
    const approvedList = document.getElementById('approved-users-list');
    
    if(!pendingList || !approvedList) return;

    pendingList.innerHTML = '';
    approvedList.innerHTML = '';

    snapshot.forEach((docSnap) => {
        const user = docSnap.data();
        const userId = docSnap.id;
        const row = document.createElement('div');
        row.className = "flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 bg-gray-50 rounded-lg border gap-3";
        
        row.innerHTML = `
            <div>
                <p class="font-bold text-gray-800">${escapeHTML(user.name)}</p>
                <p class="text-xs text-gray-500">${escapeHTML(user.email)}</p>
                <p class="text-[10px] font-bold uppercase text-blue-600">Cargo: ${user.role || 'user'}</p>
            </div>
            <div class="flex items-center gap-2">
                ${user.status === 'pending' ? 
                    `<select id="role-select-${userId}" class="text-xs border rounded p-1"><option value="user">Usuário</option><option value="admin">Admin</option></select>
                     <button onclick="window.approveUserWithRole('${userId}')" class="bg-green-500 text-white text-xs px-3 py-1 rounded">Aprovar</button>` :
                    `<button onclick="window.deleteUser('${userId}')" class="text-red-500 hover:text-red-700">Excluir</button>`
                }
            </div>
        `;
        user.status === 'pending' ? pendingList.appendChild(row) : approvedList.appendChild(row);
    });
};

/**
 * Executa a limpeza LGPD (Apaga dados com mais de 7 dias)
 */
export const cleanupOldData = async (db) => {
    if (!confirm("Isso apagará permanentemente atendimentos com mais de 7 dias. Continuar?")) return;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const limitDate = sevenDaysAgo.toISOString();

    const pautasSnapshot = await getDocs(collection(db, "pautas"));
    let deletedCount = 0;

    for (const pautaDoc of pautasSnapshot.docs) {
        const q = query(collection(db, "pautas", pautaDoc.id, "attendances"), where("createdAt", "<", limitDate));
        const oldDocs = await getDocs(q);
        const batch = writeBatch(db);
        oldDocs.forEach(d => { batch.delete(d.ref); deletedCount++; });
        await batch.commit();
    }
    showNotification(`Limpeza concluída: ${deletedCount} registros removidos.`);
};
