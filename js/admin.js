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
        
        // Template do Seletor de Cargos
        const roleSelector = `
            <select id="role-select-${userId}" class="text-[10px] border rounded p-1 bg-gray-50 focus:ring-1 focus:ring-blue-500 outline-none">
                <option value="user" ${user.role === 'user' ? 'selected' : ''}>Usuário</option>
                <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                <option value="superadmin" ${user.role === 'superadmin' ? 'selected' : ''}>Superadmin</option>
            </select>
        `;

        if (user.status === 'pending') {
            // Layout para Pendentes
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
            // Layout para Aprovados
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
 * APROVAR USUÁRIO COM O CARGO SELECIONADO
 */
export const approveUser = async (db, userId, role) => {
    try {
        const userRef = doc(db, "users", userId);
        await updateDoc(userRef, {
            status: 'approved',
            role: role,
            approvedAt: new Date().toISOString()
        });
        showNotification("Usuário aprovado com sucesso!");
        loadUsersList(db);
    } catch (error) {
        console.error("Erro ao aprovar:", error);
        showNotification("Erro ao aprovar usuário.", "error");
    }
};

/**
 * ATUALIZAR APENAS O CARGO DE UM USUÁRIO JÁ APROVADO
 */
export const updateUserRole = async (db, userId, role) => {
    try {
        const userRef = doc(db, "users", userId);
        await updateDoc(userRef, { role: role });
        showNotification("Cargo atualizado com sucesso!");
        loadUsersList(db);
    } catch (error) {
        console.error("Erro ao atualizar cargo:", error);
        showNotification("Erro ao atualizar cargo.", "error");
    }
};

/**
 * EXCLUIR USUÁRIO PERMANENTEMENTE
 */
export const deleteUser = async (db, userId) => {
    try {
        const userRef = doc(db, "users", userId);
        await deleteDoc(userRef);
        showNotification("Usuário removido permanentemente.");
        loadUsersList(db);
    } catch (error) {
        console.error("Erro ao deletar:", error);
        showNotification("Erro ao remover usuário.", "error");
    }
};

/**
 * ATUALIZA ESTATÍSTICAS (Soma Pautas Ativas + Histórico Permanente)
 */
export const updateAdminStats = async (db) => {
    const pautasAtivas = await getDocs(collection(db, "pautas"));
    const historico = await getDocs(collection(db, "estatisticas_permanentes"));
    
    const totalPautas = pautasAtivas.size + historico.size;
    
    if(document.getElementById('stats-total-pautas')) 
        document.getElementById('stats-total-pautas').textContent = totalPautas;
    
    const container = document.getElementById('permanent-stats-container');
    if(container) {
        container.innerHTML = '<h4 class="font-bold text-xs uppercase mb-2">Histórico de Pautas Eliminadas</h4>';
        historico.forEach(docSnap => {
            const data = docSnap.data();
            container.innerHTML += `
                <div class="text-[10px] p-2 border-b flex justify-between">
                    <span>${data.nomePauta}</span>
                    <span class="font-bold text-green-600">${data.totalAtendidos} atendidos</span>
                </div>`;
        });
    }
};

/**
 * GERA PDF CUSTOMIZADO DO PAINEL ADMIN
 */
export const generateCustomAdminPDF = async (db, columns) => {
    const { jsPDF } = window.jspdf;
    const docPDF = new jsPDF({ orientation: 'l' });
    
    const snapshot = await getDocs(collection(db, "pautas"));
    const historico = await getDocs(collection(db, "estatisticas_permanentes"));
    
    docPDF.setFontSize(16);
    docPDF.text("Relatório Gerencial Customizado - SIGAP", 14, 20);

    const head = [];
    const body = [];

    const headerRow = [];
    if(columns.includes('nome')) headerRow.push('Pauta');
    if(columns.includes('criador')) headerRow.push('Responsável');
    if(columns.includes('data')) headerRow.push('Data');
    if(columns.includes('atendidos')) headerRow.push('Atendidos');
    head.push(headerRow);

    const todas = [
        ...snapshot.docs.map(d => ({...d.data(), status: 'Ativa'})),
        ...historico.docs.map(d => ({...d.data(), status: 'Eliminada (Histórico)'}))
    ];

    todas.forEach(p => {
        const row = [];
        if(columns.includes('nome')) row.push(p.name || p.nomePauta);
        if(columns.includes('criador')) row.push(p.ownerName || p.criador || 'N/A');
        if(columns.includes('data')) row.push(new Date(p.createdAt || p.dataCriacao).toLocaleDateString());
        if(columns.includes('atendidos')) row.push(p.totalAtendidos || 'Ativa');
        body.push(row);
    });

    docPDF.autoTable({ head, body, startY: 30, theme: 'striped', headStyles: { fillColor: [22, 101, 52] } });
    docPDF.save("relatorio_gerencial_sigap.pdf");
};

/**
 * LIMPEZA LGPD COM SALVAMENTO DE ESTATÍSTICA PERMANENTE
 */
export const cleanupOldData = async (db) => {
    if (!confirm("Deseja executar a limpeza? Dados de atendimentos serão apagados, mas a estatística será salva.")) return;

    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() - 7);
    const pautas = await getDocs(collection(db, "pautas"));
    let count = 0;

    for (const pautaDoc of pautas.docs) {
        const pautaData = pautaDoc.data();
        const attRef = collection(db, "pautas", pautaDoc.id, "attendances");
        const q = query(attRef, where("createdAt", "<", limitDate.toISOString()));
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
            const atendidos = snapshot.docs.filter(d => d.data().status === 'atendido').length;
            
            await addDoc(collection(db, "estatisticas_permanentes"), {
                nomePauta: pautaData.name,
                criador: pautaData.ownerName || pautaData.ownerEmail,
                dataCriacao: pautaData.createdAt,
                totalAtendidos: atendidos,
                pautaId: pautaDoc.id,
                limpezaExecutadaEm: new Date().toISOString()
            });

            const batch = writeBatch(db);
            snapshot.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();
            count += snapshot.size;
        }
    }
    showNotification(`${count} registros limpos. Estatísticas salvas no histórico.`);
};

/**
 * BUSCA E EXIBE OS LOGS DE AUDITORIA
 */
export const loadAuditLogs = async (db) => {
    const logsContainer = document.getElementById('audit-logs-container');
    const tableBody = document.getElementById('audit-logs-table-body');
    const noLogsMsg = document.getElementById('no-logs-msg');
    
    if (!logsContainer || !tableBody) return;

    // Mostra o container e limpa a tabela
    logsContainer.classList.remove('hidden');
    tableBody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-gray-400">Carregando histórico...</td></tr>';
    noLogsMsg.classList.add('hidden');

    try {
        // Busca os últimos 100 logs ordenados por data
        const logsRef = collection(db, "audit_logs");
        const q = query(logsRef, orderBy("timestamp", "desc"), limit(100));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            tableBody.innerHTML = '';
            noLogsMsg.classList.remove('hidden');
            return;
        }

        tableBody.innerHTML = '';
        snapshot.forEach((docSnap) => {
            const log = docSnap.data();
            const date = new Date(log.timestamp).toLocaleString('pt-BR');
            
            const row = document.createElement('tr');
            row.className = "border-b hover:bg-gray-50 transition-colors";
            row.innerHTML = `
                <td class="px-3 py-2 whitespace-nowrap text-gray-600">${date}</td>
                <td class="px-3 py-2">
                    <p class="font-bold text-gray-800">${escapeHTML(log.userName)}</p>
                    <p class="text-[10px] text-gray-400">${escapeHTML(log.userEmail)}</p>
                </td>
                <td class="px-3 py-2">
                    <span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-purple-100 text-purple-700 uppercase">
                        ${escapeHTML(log.action)}
                    </span>
                </td>
                <td class="px-3 py-2 text-gray-600 italic">${escapeHTML(log.details)}</td>
            `;
            tableBody.appendChild(row);
        });

    } catch (error) {
        console.error("Erro ao carregar logs:", error);
        tableBody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-red-500">Erro ao carregar logs. Verifique as permissões.</td></tr>';
    }
};

/**
 * GERA PDF DOS LOGS DE AUDITORIA
 */
export const exportAuditLogsPDF = async (db) => {
    const { jsPDF } = window.jspdf;
    const docPDF = new jsPDF({ orientation: 'p' });

    // Busca os logs (pegamos até 200 para o relatório)
    const logsRef = collection(db, "audit_logs");
    const q = query(logsRef, orderBy("timestamp", "desc"), limit(200));
    const snapshot = await getDocs(q);

    if (snapshot.empty) return;

    docPDF.setFontSize(16);
    docPDF.setTextColor(126, 34, 206); // Roxo do sistema
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
        head,
        body,
        startY: 35,
        theme: 'striped',
        headStyles: { fillColor: [126, 34, 206] },
        styles: { fontSize: 8 },
        columnStyles: { 0: { cellWidth: 35 }, 1: { cellWidth: 45 }, 2: { cellWidth: 30 } }
    });

    docPDF.save(`auditoria_sigap_${new Date().toISOString().slice(0,10)}.pdf`);
};

// Atualize a sua loadAuditLogs existente para mostrar o botão PDF:
export const loadAuditLogs = async (db) => {
    const container = document.getElementById('audit-logs-container');
    const tableBody = document.getElementById('audit-logs-table-body');
    const pdfBtn = document.getElementById('export-audit-pdf-btn');
    
    container.classList.remove('hidden');
    tableBody.innerHTML = '<tr><td colspan="4" class="text-center py-4">Carregando...</td></tr>';

    const logsRef = collection(db, "audit_logs");
    const q = query(logsRef, orderBy("timestamp", "desc"), limit(100));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
        tableBody.innerHTML = '<tr><td colspan="4" class="text-center py-4">Vazio</td></tr>';
        if (pdfBtn) pdfBtn.classList.add('hidden');
        return;
    }

    tableBody.innerHTML = '';
    if (pdfBtn) pdfBtn.classList.remove('hidden'); // Mostra o botão PDF

    snapshot.forEach(docSnap => {
        const log = docSnap.data();
        const row = document.createElement('tr');
        row.className = "border-b text-[11px]";
        row.innerHTML = `
            <td class="px-3 py-2 whitespace-nowrap">${new Date(log.timestamp).toLocaleString('pt-BR')}</td>
            <td class="px-3 py-2 font-bold">${escapeHTML(log.userName)}<br><span class="font-normal text-gray-400">${escapeHTML(log.userEmail)}</span></td>
            <td class="px-3 py-2 text-center"><span class="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full text-[9px] font-bold">${log.action}</span></td>
            <td class="px-3 py-2 italic text-gray-600">${escapeHTML(log.details)}</td>
        `;
        tableBody.appendChild(row);
    });
};
