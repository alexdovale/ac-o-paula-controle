// js/admin.js
import { 
    collection, addDoc, getDocs, updateDoc, deleteDoc, doc, 
    query, orderBy, limit, where, writeBatch 
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
 * Ações de Usuários (Aprovar, Atualizar, Deletar)
 */
export const approveUser = async (db, userId, role) => {
    try {
        await updateDoc(doc(db, "users", userId), { status: 'approved', role: role, approvedAt: new Date().toISOString() });
        showNotification("Usuário aprovado!"); loadUsersList(db);
    } catch (e) { showNotification("Erro ao aprovar.", "error"); }
};

export const updateUserRole = async (db, userId, role) => {
    try {
        await updateDoc(doc(db, "users", userId), { role: role });
        showNotification("Cargo atualizado!"); loadUsersList(db);
    } catch (e) { showNotification("Erro ao atualizar cargo.", "error"); }
};

export const deleteUser = async (db, userId) => {
    try {
        await deleteDoc(doc(db, "users", userId));
        showNotification("Usuário removido."); loadUsersList(db);
    } catch (e) { showNotification("Erro ao remover.", "error"); }
};

/**
 * ATUALIZA ESTATÍSTICAS DO PAINEL (Resumo de pautas ativas)
 */
export const updateAdminStats = async (db) => {
    try {
        const pautasAtivas = await getDocs(collection(db, "pautas"));
        if(document.getElementById('stats-total-pautas')) 
            document.getElementById('stats-total-pautas').textContent = pautasAtivas.size;
    } catch (e) { console.error(e); }
};

/**
 * LIMPEZA LGPD COM SALVAMENTO DE BI (Observatório)
 */
export const cleanupOldData = async (db) => {
    if (!confirm("Isso apagará dados sensíveis de assistidos com mais de 7 dias. Os números de produtividade serão salvos anonimamente. Confirmar?")) return;

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
            // CRIAR RESUMO AGREGADO (Sem nomes ou CPFs)
            const stats = {
                pautaName: pautaData.name,
                creatorEmail: pautaData.ownerEmail || 'Desconhecido',
                dataReferencia: limitDate.toISOString(),
                total: snapshot.size,
                atendidos: snapshot.docs.filter(d => d.data().status === 'atendido').length,
                faltosos: snapshot.docs.filter(d => d.data().status === 'faltoso').length,
                assuntos: {}
            };

            // Contabiliza assuntos de forma anônima
            snapshot.docs.forEach(d => {
                const sub = d.data().subject || 'Não informado';
                stats.assuntos[sub] = (stats.assuntos[sub] || 0) + 1;
            });

            // SALVA NO HISTÓRICO PERMANENTE
            await addDoc(collection(db, "estatisticas_permanentes"), stats);

            // APAGA OS REGISTROS ORIGINAIS
            const batch = writeBatch(db);
            snapshot.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();
            count += snapshot.size;
        }
    }
    showNotification(`Sucesso! ${count} registros sensíveis limpos e métricas salvas.`);
};

/**
 * CARREGA O DASHBOARD DE BI (OBSERVATÓRIO)
 */
export const loadDashboardData = async (db) => {
    const start = document.getElementById('stats-filter-start').value;
    const end = document.getElementById('stats-filter-end').value;
    const userFilter = document.getElementById('stats-filter-user').value;
    const resultsArea = document.getElementById('dashboard-results');

    if (!resultsArea) return;
    resultsArea.classList.remove('hidden');
    showNotification("Analisando dados históricos...");

    try {
        const snapshot = await getDocs(collection(db, "estatisticas_permanentes"));
        let filteredData = snapshot.docs.map(d => d.data());

        // Filtro de Data
        if (start) filteredData = filteredData.filter(d => d.dataReferencia >= start);
        if (end) filteredData = filteredData.filter(d => d.dataReferencia <= end + "T23:59:59");
        
        // Filtro por Criador
        if (userFilter !== 'all') filteredData = filteredData.filter(d => d.creatorEmail === userFilter);

        // Consolidação dos Cálculos
        let totalGeral = 0;
        let totalAtendidos = 0;
        let totalFaltosos = 0;
        let mapAssuntos = {};
        let mapUsers = {};

        filteredData.forEach(d => {
            totalGeral += d.total;
            totalAtendidos += d.atendidos;
            totalFaltosos += d.faltosos;
            
            // Soma assuntos entre documentos
            for (let [key, val] of Object.entries(d.assuntos || {})) {
                mapAssuntos[key] = (mapAssuntos[key] || 0) + val;
            }

            // Soma produtividade por usuário
            const userKey = d.creatorEmail;
            mapUsers[userKey] = (mapUsers[userKey] || 0) + d.atendidos;
        });

        // Atualização da Interface (Cards Superiores)
        document.getElementById('dash-total-geral').textContent = totalGeral;
        document.getElementById('dash-total-atendidos').textContent = totalAtendidos;
        const taxa = totalGeral > 0 ? ((totalFaltosos / totalGeral) * 100).toFixed(1) : 0;
        document.getElementById('dash-taxa-falta').textContent = taxa + "%";

        // Renderização de Listas (Ranking)
        const renderRanking = (elementId, dataMap) => {
            const el = document.getElementById(elementId);
            if (!el) return;
            const sorted = Object.entries(dataMap).sort((a,b) => b[1] - a[1]).slice(0, 5);
            
            if (sorted.length === 0) {
                el.innerHTML = '<p class="text-center text-gray-400 py-4">Sem dados para o filtro.</p>';
                return;
            }

            el.innerHTML = sorted.map(([name, count]) => `
                <div class="flex justify-between items-center border-b pb-1">
                    <span class="truncate pr-2" title="${name}">${name}</span>
                    <span class="font-bold text-green-700">${count}</span>
                </div>
            `).join('');
        };

        renderRanking('dash-subjects-list', mapAssuntos);
        renderRanking('dash-users-list', mapUsers);

    } catch (error) {
        console.error("Dashboard Error:", error);
        showNotification("Erro ao processar dados.", "error");
    }
};

/**
 * ALIMENTA O FILTRO DE USUÁRIOS DO DASHBOARD
 */
export const populateUserFilter = async (db) => {
    const select = document.getElementById('stats-filter-user');
    if (!select) return;
    try {
        const snapshot = await getDocs(collection(db, "users"));
        select.innerHTML = '<option value="all">Todos os Usuários</option>';
        snapshot.forEach(d => {
            const u = d.data();
            if (u.email) select.innerHTML += `<option value="${u.email}">${escapeHTML(u.name)}</option>`;
        });
    } catch (e) { console.error(e); }
};

/**
 * BUSCA E EXIBE OS LOGS DE AUDITORIA
 */
export const loadAuditLogs = async (db) => {
    const logsContainer = document.getElementById('audit-logs-container');
    const tableBody = document.getElementById('audit-logs-table-body');
    const pdfBtn = document.getElementById('export-audit-pdf-btn');
    
    if (!logsContainer || !tableBody) return;

    logsContainer.classList.remove('hidden');
    tableBody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-gray-400">Carregando histórico...</td></tr>';

    try {
        const logsRef = collection(db, "audit_logs");
        const q = query(logsRef, orderBy("timestamp", "desc"), limit(100));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            tableBody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-gray-400 text-xs">Nenhum registro encontrado.</td></tr>';
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
        tableBody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-red-500">Erro ao carregar registros.</td></tr>';
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
