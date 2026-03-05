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
        if (!auth?.currentUser) return;
        
        await addDoc(collection(db, "audit_logs"), {
            action: actionType,
            details: details,
            targetId: targetId || null,
            pautaId: currentPautaId || 'N/A',
            userEmail: auth.currentUser.email,
            userId: auth.currentUser.uid,
            userName: userName || auth.currentUser.email || 'Desconhecido',
            timestamp: new Date().toISOString()
        });
    } catch (error) { 
        console.error("Erro ao registrar log:", error); 
    }
};

/**
 * Carrega Usuários Pendentes e Aprovados com Seletor de Cargos
 */
export const loadUsersList = async (db) => {
    try {
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
                        <p class="font-bold text-orange-600">PENDENTE: ${escapeHTML(user.name || '')}</p>
                        <p class="text-gray-500">${escapeHTML(user.email || '')}</p>
                    </div>
                    <div class="flex items-center gap-2 w-full sm:w-auto justify-end">
                        ${roleSelector}
                        <button onclick="window.approveUser('${userId}')" class="bg-green-600 text-white px-3 py-1 rounded text-[10px] font-bold hover:bg-green-700 transition">APROVAR</button>
                        <button onclick="window.deleteUser('${userId}')" class="text-red-500 text-[10px] hover:underline">REJEITAR</button>
                    </div>`;
                pendingList.appendChild(row);
            } else {
                row.innerHTML = `
                    <div class="text-xs">
                        <p class="font-bold text-gray-800">${escapeHTML(user.name || '')}</p>
                        <p class="text-gray-500">${escapeHTML(user.email || '')}</p>
                    </div>
                    <div class="flex items-center gap-2 w-full sm:w-auto justify-end">
                        ${roleSelector}
                        <button onclick="window.updateUserRole('${userId}')" class="bg-blue-500 text-white px-2 py-1 rounded text-[10px] hover:bg-blue-600 transition" title="Salvar Alteração de Cargo">SALVAR</button>
                        <button onclick="window.deleteUser('${userId}')" class="bg-gray-100 text-red-500 px-2 py-1 rounded text-[10px] hover:bg-red-50 transition" title="Excluir Usuário">EXCLUIR</button>
                    </div>`;
                approvedList.appendChild(row);
            }
        });
    } catch (error) {
        console.error("Erro ao carregar usuários:", error);
        showNotification("Erro ao carregar lista de usuários", "error");
    }
};

/**
 * Ações de Usuários (Aprovar, Atualizar, Deletar)
 */
export const approveUser = async (db, userId) => {
    try {
        const roleSelect = document.getElementById(`role-select-${userId}`);
        const role = roleSelect ? roleSelect.value : 'user';
        
        await updateDoc(doc(db, "users", userId), { 
            status: 'approved', 
            role: role, 
            approvedAt: new Date().toISOString() 
        });
        showNotification("Usuário aprovado com sucesso!"); 
        loadUsersList(db);
    } catch (e) { 
        console.error(e);
        showNotification("Erro ao aprovar usuário.", "error"); 
    }
};

export const updateUserRole = async (db, userId) => {
    try {
        const roleSelect = document.getElementById(`role-select-${userId}`);
        const role = roleSelect ? roleSelect.value : 'user';
        
        await updateDoc(doc(db, "users", userId), { role: role });
        showNotification("Cargo atualizado com sucesso!"); 
        loadUsersList(db);
    } catch (e) { 
        console.error(e);
        showNotification("Erro ao atualizar cargo.", "error"); 
    }
};

export const deleteUser = async (db, userId) => {
    if (!confirm("Tem certeza que deseja excluir este usuário?")) return;
    
    try {
        await deleteDoc(doc(db, "users", userId));
        showNotification("Usuário removido com sucesso."); 
        loadUsersList(db);
    } catch (e) { 
        console.error(e);
        showNotification("Erro ao remover usuário.", "error"); 
    }
};

// Tornar funções globais para acesso via onclick
window.approveUser = (userId) => approveUser(window.app.db, userId);
window.updateUserRole = (userId) => updateUserRole(window.app.db, userId);
window.deleteUser = (userId) => deleteUser(window.app.db, userId);

/**
 * ATUALIZA ESTATÍSTICAS DO PAINEL (Resumo de pautas ativas)
 */
export const updateAdminStats = async (db) => {
    try {
        const pautasAtivas = await getDocs(collection(db, "pautas"));
        const statsElement = document.getElementById('stats-total-pautas');
        if(statsElement) statsElement.textContent = pautasAtivas.size;
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
                pautaName: pautaData.name || 'Sem nome',
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
    const start = document.getElementById('stats-filter-start')?.value;
    const end = document.getElementById('stats-filter-end')?.value;
    const userFilter = document.getElementById('stats-filter-user')?.value;
    const resultsArea = document.getElementById('dashboard-results');

    if (!resultsArea) return;
    resultsArea.classList.remove('hidden');
    showNotification("Analisando dados históricos...");

    try {
        const snapshot = await getDocs(collection(db, "estatisticas_permanentes"));
        let filteredData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        // Filtro de Data
        if (start) {
            filteredData = filteredData.filter(d => d.dataReferencia && d.dataReferencia >= start);
        }
        if (end) {
            filteredData = filteredData.filter(d => d.dataReferencia && d.dataReferencia <= end + "T23:59:59");
        }
        
        // Filtro por Criador
        if (userFilter && userFilter !== 'all') {
            filteredData = filteredData.filter(d => d.creatorEmail === userFilter);
        }

        // Consolidação dos Cálculos
        let totalGeral = 0;
        let totalAtendidos = 0;
        let totalFaltosos = 0;
        let mapAssuntos = {};
        let mapUsers = {};

        filteredData.forEach(d => {
            totalGeral += d.total || 0;
            totalAtendidos += d.atendidos || 0;
            totalFaltosos += d.faltosos || 0;
            
            // Soma assuntos entre documentos
            if (d.assuntos) {
                for (let [key, val] of Object.entries(d.assuntos)) {
                    mapAssuntos[key] = (mapAssuntos[key] || 0) + val;
                }
            }

            // Soma produtividade por usuário
            const userKey = d.creatorEmail || 'Desconhecido';
            mapUsers[userKey] = (mapUsers[userKey] || 0) + (d.atendidos || 0);
        });

        // Atualização da Interface (Cards Superiores)
        const dashTotalGeral = document.getElementById('dash-total-geral');
        const dashTotalAtendidos = document.getElementById('dash-total-atendidos');
        const dashTaxaFalta = document.getElementById('dash-taxa-falta');
        
        if (dashTotalGeral) dashTotalGeral.textContent = totalGeral;
        if (dashTotalAtendidos) dashTotalAtendidos.textContent = totalAtendidos;
        
        const taxa = totalGeral > 0 ? ((totalFaltosos / totalGeral) * 100).toFixed(1) : 0;
        if (dashTaxaFalta) dashTaxaFalta.textContent = taxa + "%";

        // Renderização de Listas (Ranking)
        const renderRanking = (elementId, dataMap) => {
            const el = document.getElementById(elementId);
            if (!el) return;
            
            const sorted = Object.entries(dataMap).sort((a,b) => b[1] - a[1]).slice(0, 5);
            
            if (sorted.length === 0) {
                el.innerHTML = '<p class="text-center text-gray-400 py-4 text-xs">Sem dados para o filtro.</p>';
                return;
            }

            el.innerHTML = sorted.map(([name, count]) => `
                <div class="flex justify-between items-center border-b pb-1 text-xs">
                    <span class="truncate pr-2" title="${escapeHTML(name)}">${escapeHTML(name)}</span>
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
            const user = d.data();
            if (user.email) {
                const option = document.createElement('option');
                option.value = user.email;
                option.textContent = user.name || user.email;
                select.appendChild(option);
            }
        });
    } catch (e) { 
        console.error("Erro ao carregar filtro de usuários:", e); 
    }
};

/**
 * BUSCA E EXIBE OS LOGS DE AUDITORIA
 */
export const loadAuditLogs = async (db) => {
    const logsContainer = document.getElementById('audit-logs-container');
    const tableBody = document.getElementById('audit-logs-table-body');
    const pdfBtn = document.getElementById('export-audit-pdf-btn');
    
    if (!logsContainer || !tableBody) {
        console.error("Elementos de log não encontrados");
        return;
    }

    // Mostra o container e estado de carregamento
    logsContainer.classList.remove('hidden');
    tableBody.innerHTML = '<tr><td colspan="4" class="text-center py-8"><div class="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div><p class="text-xs text-gray-400 mt-2">Carregando histórico...</p></td></tr>';
    
    if (pdfBtn) pdfBtn.classList.add('hidden');

    try {
        const logsRef = collection(db, "audit_logs");
        const q = query(logsRef, orderBy("timestamp", "desc"), limit(100));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            tableBody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-gray-400 text-xs">Nenhum registro de auditoria encontrado.</td></tr>';
            return;
        }

        tableBody.innerHTML = '';
        if (pdfBtn) pdfBtn.classList.remove('hidden');

        snapshot.forEach((docSnap) => {
            const log = docSnap.data();
            
            // Formata a data corretamente
            let formattedDate = 'Data inválida';
            try {
                if (log.timestamp) {
                    const date = new Date(log.timestamp);
                    formattedDate = date.toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                    });
                }
            } catch (e) {
                console.error("Erro ao formatar data:", e);
            }
            
            const row = document.createElement('tr');
            row.className = "border-b hover:bg-gray-50 transition-colors";
            
            // Define a cor de fundo baseada no tipo de ação
            let actionColor = 'bg-purple-100 text-purple-700';
            if (log.action?.toLowerCase().includes('delete') || log.action?.toLowerCase().includes('excluir')) {
                actionColor = 'bg-red-100 text-red-700';
            } else if (log.action?.toLowerCase().includes('create') || log.action?.toLowerCase().includes('criar')) {
                actionColor = 'bg-green-100 text-green-700';
            } else if (log.action?.toLowerCase().includes('update') || log.action?.toLowerCase().includes('atualizar')) {
                actionColor = 'bg-blue-100 text-blue-700';
            }
            
            row.innerHTML = `
                <td class="px-3 py-2 whitespace-nowrap text-[10px] text-gray-600">${escapeHTML(formattedDate)}</td>
                <td class="px-3 py-2">
                    <p class="font-bold text-gray-800 text-[11px]">${escapeHTML(log.userName || log.userEmail || 'Desconhecido')}</p>
                    <p class="text-[9px] text-gray-400">${escapeHTML(log.userEmail || '')}</p>
                </td>
                <td class="px-3 py-2 text-center">
                    <span class="px-2 py-0.5 rounded-full text-[9px] font-bold ${actionColor} uppercase">
                        ${escapeHTML(log.action || 'AÇÃO')}
                    </span>
                </td>
                <td class="px-3 py-2 text-[10px] text-gray-600">
                    <div class="max-w-xs truncate" title="${escapeHTML(log.details || '')}">
                        ${escapeHTML(log.details || '-')}
                    </div>
                    ${log.pautaId && log.pautaId !== 'N/A' ? 
                        `<div class="text-[8px] text-gray-400 mt-1">Pauta: ${escapeHTML(log.pautaId.substring(0,8))}...</div>` : 
                        ''}
                </td>
            `;
            tableBody.appendChild(row);
        });
    } catch (error) {
        console.error("Erro ao carregar logs:", error);
        tableBody.innerHTML = `<tr><td colspan="4" class="text-center py-8 text-red-500 text-xs">
            Erro ao carregar registros: ${escapeHTML(error.message)}
        </td></tr>`;
    }
};

/**
 * GERA PDF DOS LOGS
 */
export const exportAuditLogsPDF = async (db) => {
    showNotification("Gerando PDF...", "info");
    
    try {
        const { jsPDF } = window.jspdf;
        const docPDF = new jsPDF({ orientation: 'landscape' });

        const logsRef = collection(db, "audit_logs");
        const q = query(logsRef, orderBy("timestamp", "desc"), limit(200));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            showNotification("Nenhum log para exportar", "info");
            return;
        }

        // Título
        docPDF.setFontSize(18);
        docPDF.setTextColor(126, 34, 206);
        docPDF.text("Relatório de Auditoria e Segurança - SIGAP", 14, 20);
        
        docPDF.setFontSize(10);
        docPDF.setTextColor(100, 100, 100);
        docPDF.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 28);
        docPDF.text(`Total de registros: ${snapshot.size}`, 14, 34);

        // Preparar dados para a tabela
        const head = [['Data/Hora', 'Usuário', 'Ação', 'Detalhes', 'Pauta ID']];
        const body = snapshot.docs.map(docSnap => {
            const log = docSnap.data();
            let dateStr = '';
            try {
                if (log.timestamp) {
                    dateStr = new Date(log.timestamp).toLocaleString('pt-BR');
                }
            } catch (e) {
                dateStr = 'Data inválida';
            }
            
            return [
                dateStr,
                `${log.userName || log.userEmail || 'Desconhecido'}`,
                log.action || '-',
                log.details || '-',
                log.pautaId || 'N/A'
            ];
        });

        docPDF.autoTable({
            head: head,
            body: body,
            startY: 40,
            theme: 'striped',
            headStyles: { 
                fillColor: [126, 34, 206],
                fontSize: 8,
                halign: 'center'
            },
            styles: { 
                fontSize: 7,
                cellPadding: 2
            },
            columnStyles: {
                0: { cellWidth: 35 },
                1: { cellWidth: 40 },
                2: { cellWidth: 30 },
                3: { cellWidth: 'auto' },
                4: { cellWidth: 30 }
            }
        });

        const filename = `auditoria_sigap_${new Date().toISOString().slice(0,10)}.pdf`;
        docPDF.save(filename);
        
        showNotification("PDF gerado com sucesso!");
        
    } catch (error) {
        console.error("Erro ao gerar PDF:", error);
        showNotification("Erro ao gerar PDF: " + error.message, "error");
    }
};

// Tornar funções globais para acesso via onclick
window.cleanupOldData = () => cleanupOldData(window.app.db);
window.loadAuditLogs = () => loadAuditLogs(window.app.db);
window.exportAuditLogsPDF = () => exportAuditLogsPDF(window.app.db);
window.loadDashboardData = () => loadDashboardData(window.app.db);
