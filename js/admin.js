// js/admin.js
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { escapeHTML, showNotification } from './utils.js';

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
                    `<button onclick="window.approveUserWithRole('${userId}')" class="bg-green-500 text-white text-xs px-3 py-1 rounded">Aprovar</button>` :
                    `<button onclick="window.deleteUser('${userId}')" class="text-red-500 hover:text-red-700">Excluir</button>`
                }
            </div>
        `;
        user.status === 'pending' ? pendingList.appendChild(row) : approvedList.appendChild(row);
    });
};
