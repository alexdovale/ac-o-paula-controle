// js/admin.js
import { 
    collection, 
    addDoc, 
    getDocs, 
    updateDoc, 
    deleteDoc, 
    doc, 
    query, 
    orderBy, 
    limit, 
    where, 
    writeBatch 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
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
 * Carrega a lista de usuários para o Painel Admin
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
        row.className = "flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 bg-gray-50 rounded-lg border gap-3 mb-2";
        
        row.innerHTML = `
            <div>
                <p class="font-bold text-gray-800">${escapeHTML(user.name)}</p>
                <p class="text-xs text-gray-500">${escapeHTML(user.email)}</p>
                <p class="text-[10px] font-bold uppercase text-blue-600">Cargo: ${user.role || 'user'}</p>
            </div>
            <div class="flex items-center gap-2">
                ${user.status === 'pending' ? 
                    `<select id="role-select-${userId}" class="text-xs border rounded p-1">
                        <option value="user">Usuário</option>
                        <option value="admin">Admin</option>
                    </select>
                     <button onclick="window.approveUserWithRole('${userId}')" class="bg-green-500 text-white text-xs px-3 py-1 rounded hover:bg-green-600">Aprovar</button>` :
                    `<button onclick="window.deleteUser('${userId}')" class="text-red-500 hover:text-red-700 text-xs font-bold uppercase p-1">Excluir</button>`
                }
            </div>
        `;
        user.status === 'pending' ? pendingList.appendChild(row) : approvedList.appendChild(row);
    });
};

/**
 * Atualiza os contadores estatísticos do Painel Admin
 */
export const updateAdminStats = async (db) => {
    try {
        const pautasSnap = await getDocs(collection(db, "pautas"));
        const usersSnap = await getDocs(collection(db, "users"));
        
        const totalPautasEl = document.getElementById('stats-total-pautas');
        const totalUsersEl = document.getElementById('stats-total-users');

        if(totalPautasEl) totalPautasEl.textContent = pautasSnap.size;
        if(totalUsersEl) totalUsersEl.textContent = usersSnap.size;
    } catch (error) {
        console.error("Erro ao carregar estatísticas admin:", error);
    }
};

/**
 * GERA O RELATÓRIO DE AUDITORIA EM PDF
 */
export const generateAuditReportPDF = async (db) => {
    const { jsPDF } = window.jspdf;
    if (!jsPDF) return showNotification("Erro: Biblioteca PDF não carregada.", "error");

    showNotification("Gerando relatório de atividades...", "info");

    try {
        const logsRef = collection(db, "audit_logs");
        const q = query(logsRef, orderBy("timestamp", "desc"), limit(100)); // Pega os últimos 100 logs
        const snapshot = await getDocs(q);

        const docPDF = new jsPDF({ orientation: 'l', unit: 'pt', format: 'a4' });

        docPDF.setFontSize(18);
        docPDF.text("Relatório de Auditoria e Atividades - SIGAP", 14, 25);
        
        docPDF.setFontSize(10);
        docPDF.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 40);

        const tableColumn = ["Data/Hora", "Usuário", "E-mail", "Ação", "Detalhes"];
        const tableRows = snapshot.docs.map(d => {
            const log = d.data();
            return [
                new Date(log.timestamp).toLocaleString('pt-BR'),
                log.userName || 'N/A',
                log.userEmail || 'N/A',
                log.action,
                log.details
            ];
        });

        docPDF.autoTable(tableColumn, tableRows, { 
            startY: 50,
            styles: { fontSize: 7 },
            headStyles: { fillColor: [126, 34, 206] }, // Roxo Auditoria
            columnStyles: {
                4: { cellWidth: 300 } // Dá mais espaço para os detalhes
            }
        });

        docPDF.save(`auditoria_sigap_${new Date().toISOString().slice(0,10)}.pdf`);
    } catch (error) {
        console.error(error);
        showNotification("Erro ao gerar PDF de auditoria.", "error");
    }
};

/**
 * Executa a limpeza LGPD (Apaga atendimentos com mais de 7 dias)
 */
export const cleanupOldData = async (db) => {
    if (!confirm("Isso apagará permanentemente atendimentos com mais de 7 dias de TODAS as pautas. Deseja continuar?")) return;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const limitDate = sevenDaysAgo.toISOString();

    try {
        const pautasSnapshot = await getDocs(collection(db, "pautas"));
        let deletedCount = 0;

        for (const pautaDoc of pautasSnapshot.docs) {
            const q = query(collection(db, "pautas", pautaDoc.id, "attendances"), where("createdAt", "<", limitDate));
            const oldDocs = await getDocs(q);
            
            if (!oldDocs.empty) {
                const batch = writeBatch(db);
                oldDocs.forEach(d => { batch.delete(d.ref); deletedCount++; });
                await batch.commit();
            }
        }
        showNotification(`Limpeza concluída! ${deletedCount} registros antigos removidos.`);
    } catch (error) {
        console.error(error);
        showNotification("Erro na limpeza automática.", "error");
    }
};
