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
 * Carrega Usuários Pendentes e Aprovados
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
        row.className = "flex justify-between items-center p-3 bg-gray-50 rounded border mb-2";
        row.innerHTML = `
            <div class="text-xs">
                <p class="font-bold">${escapeHTML(user.name)}</p>
                <p class="text-gray-500">${escapeHTML(user.email)}</p>
            </div>
            <div class="flex gap-2">
                ${user.status === 'pending' ? 
                `<button onclick="window.approveUserWithRole('${userId}')" class="bg-green-500 text-white px-2 py-1 rounded text-[10px]">APROVAR</button>` : 
                `<button onclick="window.deleteUser('${userId}')" class="text-red-500 text-[10px]">EXCLUIR</button>`}
            </div>`;
        user.status === 'pending' ? pendingList.appendChild(row) : approvedList.appendChild(row);
    });
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
    
    // Lista o histórico simples no painel
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
 * @param {Array} columns - Ex: ['nome', 'data', 'criador', 'atendidos']
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

    // Define Cabeçalhos baseados na escolha
    const headerRow = [];
    if(columns.includes('nome')) headerRow.push('Pauta');
    if(columns.includes('criador')) headerRow.push('Responsável');
    if(columns.includes('data')) headerRow.push('Data');
    if(columns.includes('atendidos')) headerRow.push('Atendidos');
    head.push(headerRow);

    // Junta Pautas Ativas e Histórico
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
            // ANTES DE APAGAR: Salva o resumo na coleção permanente
            const atendidos = snapshot.docs.filter(d => d.data().status === 'atendido').length;
            
            await addDoc(collection(db, "estatisticas_permanentes"), {
                nomePauta: pautaData.name,
                criador: pautaData.ownerName || pautaData.ownerEmail,
                dataCriacao: pautaData.createdAt,
                totalAtendidos: atendidos,
                pautaId: pautaDoc.id,
                limpezaExecutadaEm: new Date().toISOString()
            });

            // AGORA APAGA OS ATENDIMENTOS
            const batch = writeBatch(db);
            snapshot.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();
            count += snapshot.size;
        }
    }
    showNotification(`${count} registros limpos. Estatísticas salvas no histórico.`);
};
