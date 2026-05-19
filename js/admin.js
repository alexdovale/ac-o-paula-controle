// js/admin.js - MÓDULO DE AUDITORIA, SEGURANÇA E REGISTROS DO BI (SIGEP)

import { 
    collection, addDoc, getDocs, updateDoc, deleteDoc, doc, 
    query, orderBy, limit, where, writeBatch 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { escapeHTML, showNotification } from './utils.js';

// --- LOG DE AUDITORIA ---
export const logAction = async (db, auth, userName, currentPautaId, actionType, details, targetId = null) => {
    try {
        if (!auth?.currentUser) return;
        const logData = {
            action: actionType || 'AÇÃO_DESCONHECIDA',
            details: details || 'Sem detalhes',
            targetId: targetId || null,
            pautaId: currentPautaId || 'N/A',
            userEmail: auth.currentUser.email || 'email@desconhecido',
            userId: auth.currentUser.uid || 'uid_desconhecido',
            userName: userName || auth.currentUser.email || 'Desconhecido',
            timestamp: new Date().toISOString()
        };
        await addDoc(collection(db, "audit_logs"), logData);
    } catch (error) { console.error("❌ Erro log:", error); }
};

// --- GESTÃO DE USUÁRIOS ---
export const loadUsersList = async (db) => {
    try {
        const snapshot = await getDocs(collection(db, "users"));
        const pendingList = document.getElementById('pending-users-list');
        const approvedList = document.getElementById('approved-users-list');
        if(!pendingList || !approvedList) return;
        pendingList.innerHTML = ''; approvedList.innerHTML = '';

        snapshot.forEach((docSnap) => {
            const user = docSnap.data();
            const userId = docSnap.id;
            if (!user.email) return; 
            
            const row = document.createElement('div');
            row.className = "flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 bg-white rounded border mb-2 shadow-sm gap-3";
            
            const roleSelector = `
                <select id="role-select-${userId}" class="text-[10px] border rounded p-1 bg-gray-50 focus:ring-1 focus:ring-blue-500 outline-none">
                    <option value="user" ${user.role === 'user' ? 'selected' : ''}>Usuário</option>
                    <option value="apoio" ${user.role === 'apoio' ? 'selected' : ''}>Apoio</option>
                    <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                    <option value="suspended" ${user.role === 'suspended' ? 'selected' : ''}>⚠️ Suspenso</option>
                </select>
            `;

            if (user.status === 'pending') {
                row.innerHTML = `<div class="text-xs flex-1"><p class="font-bold text-orange-600">PENDENTE: ${escapeHTML(user.name || 'Sem nome')}</p><p class="text-gray-500">${escapeHTML(user.email)}</p></div>
                                 <div class="flex items-center gap-2"><button onclick="window.approveUser('${userId}')" class="bg-green-600 text-white px-3 py-1 rounded text-[10px] font-bold">APROVAR</button></div>`;
                pendingList.appendChild(row);
            } else {
                row.innerHTML = `<div class="text-xs flex-1"><p class="font-bold text-gray-800">${escapeHTML(user.name || 'Sem nome')}</p><p class="text-gray-500">${escapeHTML(user.email)}</p></div>
                                 <div class="flex items-center gap-2">${roleSelector}<button onclick="window.updateUserRole('${userId}')" class="bg-blue-500 text-white px-2 py-1 rounded text-[10px]">SALVAR</button></div>`;
                approvedList.appendChild(row);
            }
        });
    } catch (error) { showNotification("Erro ao carregar usuários", "error"); }
};

export const approveUser = async (db, userId) => {
    try {
        const role = document.getElementById(`role-select-${userId}`)?.value || 'user';
        await updateDoc(doc(db, "users", userId), { status: 'approved', role: role, approvedAt: new Date().toISOString() });
        showNotification("Usuário aprovado!"); loadUsersList(db);
    } catch (e) { showNotification("Erro ao aprovar.", "error"); }
};

export const updateUserRole = async (db, userId) => {
    try {
        const role = document.getElementById(`role-select-${userId}`)?.value || 'user';
        await updateDoc(doc(db, "users", userId), { role: role });
        showNotification("Cargo atualizado!"); loadUsersList(db);
    } catch (e) { showNotification("Erro ao atualizar.", "error"); }
};

export const deleteUser = async (db, userId) => {
    if (!confirm("Excluir este usuário?")) return;
    try {
        await deleteDoc(doc(db, "users", userId));
        showNotification("Usuário removido."); loadUsersList(db);
    } catch (e) { showNotification("Erro ao remover.", "error"); }
};

window.approveUser = (userId) => approveUser(window.app?.db, userId);
window.updateUserRole = (userId) => updateUserRole(window.app?.db, userId);
window.deleteUser = (userId) => deleteUser(window.app?.db, userId);

// --- BI E AUDITORIA ---
export const loadAuditLogs = async (db) => {
    const tableBody = document.getElementById('audit-logs-table-body');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="4" class="text-center py-8">Carregando logs...</td></tr>';
    
    try {
        const logsRef = collection(db, "audit_logs");
        const q = query(logsRef, orderBy("timestamp", "desc"), limit(100));
        const snapshot = await getDocs(q);
        
        tableBody.innerHTML = '';
        snapshot.forEach(docSnap => {
            const log = docSnap.data();
            const row = document.createElement('tr');
            row.innerHTML = `<td class="p-2 text-[10px]">${new Date(log.timestamp).toLocaleString()}</td>
                             <td class="p-2 text-[10px]">${escapeHTML(log.userName)}</td>
                             <td class="p-2 text-[10px]">${escapeHTML(log.action)}</td>
                             <td class="p-2 text-[10px]">${escapeHTML(log.details)}</td>`;
            tableBody.appendChild(row);
        });
    } catch (e) { tableBody.innerHTML = '<tr><td colspan="4">Erro ao carregar.</td></tr>'; }
};

export const loadDashboardData = async (db) => {
    const resultsArea = document.getElementById('dashboard-results');
    if (!resultsArea) return;
    resultsArea.innerHTML = '<div class="text-center py-8">Processando BI...</div>';

    try {
        const snapshot = await getDocs(collection(db, "estatisticas_permanentes"));
        if (snapshot.empty) {
            resultsArea.innerHTML = `<div class="text-center py-12"><button id="btn-test-bi" class="bg-indigo-600 text-white px-6 py-3 rounded-lg">Inserir Dados Fictícios</button></div>`;
            document.getElementById('btn-test-bi')?.addEventListener('click', () => generateTestData(db));
            return;
        }
        
        let rawData = snapshot.docs.map(d => d.data());
        let mapAssuntos = {}, mapAtendentes = {};

        rawData.forEach(d => {
            if (d.assuntos) for (let [k, v] of Object.entries(d.assuntos)) mapAssuntos[k] = (mapAssuntos[k] || 0) + v;
            if (d.atendentes) for (let [k, v] of Object.entries(d.atendentes)) mapAtendentes[k] = (mapAtendentes[k] || 0) + v;
        });

        const atendentesSelect = document.getElementById('stats-filter-attendant');
        if (atendentesSelect && atendentesSelect.options.length <= 1) {
            Object.keys(mapAtendentes).sort().forEach(nome => atendentesUnicos(nome, atendentesSelect));
        }

        resultsArea.innerHTML = `
            <div class="grid grid-cols-2 gap-4">
                <div class="bg-white p-4 border rounded-xl"><h5 class="text-xs font-bold text-gray-500 uppercase">Top Assuntos</h5><div id="dash-subjects-list" class="mt-2"></div></div>
                <div class="bg-white p-4 border rounded-xl"><h5 class="text-xs font-bold text-gray-500 uppercase">Top Atendentes</h5><div id="dash-users-list" class="mt-2"></div></div>
            </div>
        `;
        
        const renderRank = (id, map) => {
            const container = document.getElementById(id);
            const sorted = Object.entries(map).sort((a,b) => b[1] - a[1]).slice(0, 5);
            container.innerHTML = sorted.map(([k, v]) => `<div class="flex justify-between p-1 border-b text-xs"><span>${escapeHTML(k)}</span><b>${v}</b></div>`).join('');
        };
        renderRank('dash-subjects-list', mapAssuntos);
        renderRank('dash-users-list', mapAtendentes);

    } catch (e) { resultsArea.innerHTML = `<p class="text-red-500">Erro: ${e.message}</p>`; }
};

function atendentesUnicos(nome, select) {
    if(!Array.from(select.options).find(o => o.value === nome)) {
        select.appendChild(new Option(nome, nome));
    }
}

export const cleanupOldData = async (db) => {
    if (!confirm("Confirmar arquivamento de dados de 7+ dias?")) return;
    try {
        const limitDate = new Date(); limitDate.setDate(limitDate.getDate() - 7);
        const pautas = await getDocs(collection(db, "pautas"));
        
        for (const pautaDoc of pautas.docs) {
            const snapshot = await getDocs(query(collection(db, "pautas", pautaDoc.id, "attendances"), where("createdAt", "<", limitDate.toISOString())));
            if (!snapshot.empty) {
                const stats = { pautaName: pautaDoc.data().name, dataReferencia: limitDate.toISOString(), total: snapshot.size, atendidos: 0, faltosos: 0, assuntos: {}, atendentes: {} };
                snapshot.docs.forEach(d => {
                    const data = d.data();
                    if(data.status === 'atendido') stats.atendidos++;
                    if(data.status === 'faltoso') stats.faltosos++;
                    stats.assuntos[data.subject || 'N/A'] = (stats.assuntos[data.subject || 'N/A'] || 0) + 1;
                    const nome = data.attendedBy || data.assignedCollaborator?.name || 'Não atribuído';
                    stats.atendentes[nome] = (stats.atendentes[nome] || 0) + 1;
                });
                await addDoc(collection(db, "estatisticas_permanentes"), stats);
                const batch = writeBatch(db);
                snapshot.docs.forEach(d => batch.delete(d.ref));
                await batch.commit();
            }
        }
        showNotification("Limpeza concluída!");
    } catch (e) { showNotification("Erro na limpeza", "error"); }
};

export const generateTestData = async (db) => {
    if (!confirm("Gerar dados de teste?")) return;
    const atendentesPool = ["Dra. Roberta Santos", "Dr. Marcos Alencar", "Dra. Clarice Lisboa"];
    const stats = { pautaName: "Teste BI", dataReferencia: new Date().toISOString(), total: 10, atendidos: 8, faltosos: 2, assuntos: {"Alimentos": 5}, atendentes: {} };
    atendentesPool.forEach(nome => stats.atendentes[nome] = Math.floor(Math.random() * 5));
    await addDoc(collection(db, "estatisticas_permanentes"), stats);
    loadDashboardData(db);
};

// Listeners
document.getElementById('btn-load-dashboard')?.addEventListener('click', () => loadDashboardData(window.app?.db));
