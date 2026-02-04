// js/admin.js
import { 
    collection, addDoc, getDocs, updateDoc, deleteDoc, doc, 
    query, orderBy, limit, where, writeBatch, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { escapeHTML, showNotification } from './utils.js';

/**
 * Grava uma ação no log de auditoria
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
            timestamp: new Date().toISOString()
        });
    } catch (error) { console.error("Erro log:", error); }
};

/**
 * Carrega Usuários Pendentes e Aprovados com Seletor de Cargos
 */
export const loadUsersList = async (db) => {
    const snapshot = await getDocs(collection(db, "users"));
    const pendingList = document.getElementById('pending-users-list');
    const approvedList = document.getElementById('approved-users-list');
    if(!pendingList || !approvedList) return;

    pendingList.innerHTML = ''; approvedList.innerHTML = '';

    snapshot.forEach((docSnap) => {
        const user = docSnap.data();
        const userId = docSnap.id;
        const row = document.createElement('div');
        row.className = "flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 bg-white rounded border mb-2 shadow-sm gap-3";
        
        const roleSelector = `
            <select id="role-select-${userId}" class="text-[10px] border rounded p-1 bg-gray-50 focus:ring-1 focus:ring-blue-500 outline-none">
                <option value="user" ${user.role === 'user' ? 'selected' : ''}>Usuário</option>
                <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                <option value="superadmin" ${user.role === 'superadmin' ? 'selected' : ''}>Superadmin</option>
            </select>
        `;

        if (user.status === 'pending') {
            row.innerHTML = `
                <div class="text-xs">
                    <p class="font-bold text-orange-600">PENDENTE: ${escapeHTML(user.name)}</p>
                    <p class="text-gray-500">${escapeHTML(user.email)}</p>
                </div>
                <div class="flex items-center gap-2 w-full sm:w-auto justify-end">
                    ${roleSelector}
                    <button onclick="window.approveUserWithRole('${userId}')" class="bg-green-600 text-white px-3 py-1 rounded text-[10px] font-bold hover:bg-green-700 transition">APROVAR</button>
                    <button onclick="window.deleteUser('${userId}')" class="text-red-500 text-[10px] hover:underline">REJEITAR</button>
                </div>`;
            pendingList.appendChild(row);
        } else {
            row.innerHTML = `
                <div class="text-xs">
                    <p class="font-bold text-gray-800">${escapeHTML(user.name)}</p>
                    <p class="text-gray-500">${escapeHTML(user.email)}</p>
                </div>
                <div class="flex items-center gap-2 w-full sm:w-auto justify-end">
                    ${roleSelector}
                    <button onclick="window.updateUserRole('${userId}')" class="bg-blue-500 text-white px-2 py-1 rounded text-[10px] hover:bg-blue-600 transition" title="Salvar Alteração de Cargo">SALVAR</button>
                    <button onclick="window.deleteUser('${userId}')" class="bg-gray-100 text-red-500 px-2 py-1 rounded text-[10px] hover:bg-red-50 transition" title="Excluir Usuário">EXCLUIR</button>
                </div>`;
            approvedList.appendChild(row);
        }
    });
};

/**
 * APROVAR USUÁRIO
 */
export const approveUser = async (db, userId, role) => {
    try {
        const userRef = doc(db, "users", userId);
        await updateDoc(userRef, { status: 'approved', role: role, approvedAt: new Date().toISOString() });
        showNotification("Usuário aprovado!");
        loadUsersList(db);
    } catch (error) { showNotification("Erro ao aprovar.", "error"); }
};

/**
 * ATUALIZAR CARGO
 */
export const updateUserRole = async (db, userId, role) => {
    try {
        const userRef = doc(db, "users", userId);
        await updateDoc(userRef, { role: role });
        showNotification("Cargo atualizado!");
        loadUsersList(db);
    } catch (error) { showNotification("Erro ao atualizar cargo.", "error"); }
};

/**
 * EXCLUIR USUÁRIO
 */
export const deleteUser = async (db, userId) => {
    try {
        const userRef = doc(db, "users", userId);
        await deleteDoc(userRef);
        showNotification("Usuário removido.");
        loadUsersList(db);
    } catch (error) { showNotification("Erro ao remover.", "error"); }
};

/**
 * ATUALIZA ESTATÍSTICAS
 */
export const updateAdminStats = async (db) => {
    const pautasAtivas = await getDocs(collection(db, "pautas"));
    const historico = await getDocs(collection(db, "estatisticas_permanentes"));
    const totalPautas = pautasAtivas.size + historico.size;
    if(document.getElementById('stats-total-pautas')) document.getElementById('stats-total-pautas').textContent = totalPautas;
};

/**
 * LIMPEZA LGPD
 */
export const cleanupOldData = async (db) => {
    if (!confirm("Deseja executar a limpeza?")) return;
    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() - 7);
    const pautas = await getDocs(collection(db, "pautas"));
    let count = 0;

    for (const pautaDoc of pautas.docs) {
        const attRef = collection(db, "pautas", pautaDoc.id, "attendances");
        const q = query(attRef, where("createdAt", "<", limitDate.toISOString()));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
            const batch = writeBatch(db);
            snapshot.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();
            count += snapshot.size;
        }
    }
    showNotification(`${count} registros limpos.`);
};

/**
 * BUSCA E EXIBE OS LOGS DE AUDITORIA (Versão Corrigida)
 */
export const loadAuditLogs = async (db) => {
    const logsContainer = document.getElementById('audit-logs-container');
    const tableBody = document.getElementById('audit-logs-table-body');
    const noLogsMsg = document.getElementById('no-logs-msg');
    const pdfBtn = document.getElementById('export-audit-pdf-btn');
    
    if (!logsContainer || !tableBody) return;

    logsContainer.classList.remove('hidden');
    tableBody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-gray-400">Carregando histórico...</td></tr>';
    noLogsMsg.classList.add('hidden');

    try {
        const logsRef = collection(db, "audit_logs");
        const q = query(logsRef, orderBy("timestamp", "desc"), limit(100));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            tableBody.innerHTML = '';
            noLogsMsg.classList.remove('hidden');
            if (pdfBtn) pdfBtn.classList.add('hidden');
            return;
        }

        tableBody.innerHTML = '';
        if (pdfBtn) pdfBtn.classList.remove('hidden');

        snapshot.forEach((docSnap) => {
            const log = docSnap.data();
            const date = new Date(log.timestamp).toLocaleString('pt-BR');
            const row = document.createElement('tr');
            row.className = "border-b hover:bg-gray-50 transition-colors";
            row.innerHTML = `
                <td class="px-3 py-2 whitespace-nowrap text-[10px] text-gray-600">${date}</td>
                <td class="px-3 py-2">
                    <p class="font-bold text-gray-800 text-[11px]">${escapeHTML(log.userName)}</p>
                    <p class="text-[9px] text-gray-400">${escapeHTML(log.userEmail)}</p>
                </td>
                <td class="px-3 py-2 text-center">
                    <span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-purple-100 text-purple-700 uppercase">
                        ${escapeHTML(log.action)}
                    </span>
                </td>
                <td class="px-3 py-2 text-[10px] text-gray-600 italic">${escapeHTML(log.details)}</td>
            `;
            tableBody.appendChild(row);
        });
    } catch (error) {
        console.error("Erro log:", error);
        tableBody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-red-500">Erro ao carregar.</td></tr>';
    }
};

/**
 * GERA PDF DOS LOGS
 */
export const exportAuditLogsPDF = async (db) => {
    const { jsPDF } = window.jspdf;
    const docPDF = new jsPDF({ orientation: 'p' });

    const logsRef = collection(db, "audit_logs");
    const q = query(logsRef, orderBy("timestamp", "desc"), limit(200));
    const snapshot = await getDocs(q);

    if (snapshot.empty) return;

    docPDF.setFontSize(16);
    docPDF.setTextColor(126, 34, 206);
    docPDF.text("Relatório de Auditoria e Segurança - SIGAP", 14, 20);
    
    docPDF.setFontSize(10);
    docPDF.setTextColor(100);
    docPDF.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 28);

    const head = [['Data/Hora', 'Usuário', 'Ação', 'Detalhes']];
    const body = snapshot.docs.map(docSnap => {
        const log = docSnap.data();
        return [
            new Date(log.timestamp).toLocaleString('pt-BR'),
            `${log.userName}\n(${log.userEmail})`,
            log.action,
            log.details
        ];
    });

    docPDF.autoTable({
        head, body, startY: 35, theme: 'striped',
        headStyles: { fillColor: [126, 34, 206] },
        styles: { fontSize: 8 },
        columnStyles: { 0: { cellWidth: 35 }, 1: { cellWidth: 45 }, 2: { cellWidth: 30 } }
    });

    docPDF.save(`auditoria_sigap_${new Date().toISOString().slice(0,10)}.pdf`);
};
