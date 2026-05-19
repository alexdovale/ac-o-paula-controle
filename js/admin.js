// js/admin.js - MÓDULO DE AUDITORIA, SEGURANÇA E REGISTROS DO BI (SIGEP)



import { 

    collection, addDoc, getDocs, updateDoc, deleteDoc, doc, 

    query, orderBy, limit, where, writeBatch, Timestamp 

} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { escapeHTML, showNotification } from './utils.js';



/**

 * Grava uma ação no log de auditoria

 */

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

    } catch (error) { 

        console.error("❌ Erro ao registrar log:", error); 

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



        if (snapshot.empty) {

            pendingList.innerHTML = '<p class="text-gray-400 text-xs text-center py-4">Nenhum usuário encontrado</p>';

            approvedList.innerHTML = '<p class="text-gray-400 text-xs text-center py-4">Nenhum usuário encontrado</p>';

            return;

        }



        snapshot.forEach((docSnap) => {

            try {

                const user = docSnap.data();

                const userId = docSnap.id;

                

                if (!user.email) return; 

                

                const row = document.createElement('div');

                row.className = "flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 bg-white rounded border mb-2 shadow-sm gap-3";

                

                const statusBadge = user.status === 'pending' 

                    ? '<span class="bg-yellow-100 text-yellow-800 text-[8px] px-2 py-0.5 rounded-full ml-2">Pendente</span>'

                    : user.role === 'suspended'

                    ? '<span class="bg-red-100 text-red-800 text-[8px] px-2 py-0.5 rounded-full ml-2">Suspenso</span>'

                    : '<span class="bg-green-100 text-green-800 text-[8px] px-2 py-0.5 rounded-full ml-2">Ativo</span>';

                

                const roleSelector = `

                    <select id="role-select-${userId}" class="text-[10px] border rounded p-1 bg-gray-50 focus:ring-1 focus:ring-blue-500 outline-none">

                        <option value="user" ${user.role === 'user' ? 'selected' : ''}>Usuário</option>

                        <option value="apoio" ${user.role === 'apoio' ? 'selected' : ''}>Apoio</option>

                        <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>

                        <option value="superadmin" ${user.role === 'superadmin' ? 'selected' : ''}>Superadmin</option>

                        <option value="suspended" ${user.role === 'suspended' ? 'selected' : ''}>⚠️ Suspenso</option>

                    </select>

                `;



                if (user.status === 'pending') {

                    row.innerHTML = `

                        <div class="text-xs flex-1">

                            <p class="font-bold text-orange-600 flex items-center">PENDENTE: ${escapeHTML(user.name || 'Sem nome')} ${statusBadge}</p>

                            <p class="text-gray-500">${escapeHTML(user.email)}</p>

                        </div>

                        <div class="flex items-center gap-2 w-full sm:w-auto justify-end">

                            ${roleSelector}

                            <button onclick="window.approveUser('${userId}')" class="bg-green-600 text-white px-3 py-1 rounded text-[10px] font-bold hover:bg-green-700 transition">APROVAR</button>

                            <button onclick="window.deleteUser('${userId}')" class="text-red-500 text-[10px] hover:underline">REJEITAR</button>

                        </div>`;

                    pendingList.appendChild(row);

                } else {

                    row.innerHTML = `

                        <div class="text-xs flex-1">

                            <p class="font-bold text-gray-800 flex items-center">${escapeHTML(user.name || 'Sem nome')} ${statusBadge}</p>

                            <p class="text-gray-500">${escapeHTML(user.email)}</p>

                        </div>

                        <div class="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">

                            ${roleSelector}

                            <button onclick="window.updateUserRole('${userId}')" class="bg-blue-500 text-white px-2 py-1 rounded text-[10px] hover:bg-blue-600 transition">SALVAR</button>

                            <button onclick="window.deleteUser('${userId}')" class="bg-gray-100 text-red-500 px-2 py-1 rounded text-[10px] hover:bg-red-50 transition">EXCLUIR</button>

                        </div>`;

                    approvedList.appendChild(row);

                }

            } catch (rowError) { console.error(rowError); }

        });

    } catch (error) {

        showNotification("Erro ao carregar lista de usuários", "error");

    }

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

        await updateDoc(doc(db, "users", userId), { role: role, status: role === 'suspended' ? 'suspended' : 'approved' });

        showNotification(`Cargo atualizado!`); loadUsersList(db);

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





// =========================================================================

// MÓDULO DE AUDITORIA, FILTROS E ERROS

// =========================================================================



export const loadLogFilters = async (db) => {

    try {

        const userSelect = document.getElementById('filter-log-user');

        const actionSelect = document.getElementById('filter-log-action');

        

        if (userSelect) {

            const usersSnap = await getDocs(collection(db, "users"));

            userSelect.innerHTML = '<option value="all">Todos os usuários</option>';

            usersSnap.forEach(doc => {

                const user = doc.data();

                if (user.email) {

                    const option = document.createElement('option');

                    option.value = user.email;

                    option.textContent = user.name || user.email;

                    userSelect.appendChild(option);

                }

            });

        }

        

        if (actionSelect) {

            const logsSnap = await getDocs(collection(db, "audit_logs"));

            const actions = new Set();

            logsSnap.forEach(doc => {

                const action = doc.data().action;

                if (action) actions.add(action);

            });

            

            actionSelect.innerHTML = '<option value="all">Todas as ações</option>';

            Array.from(actions).sort().forEach(action => {

                const option = document.createElement('option');

                option.value = action;

                option.textContent = action;

                actionSelect.appendChild(option);

            });

        }

    } catch (error) {

        console.error("Erro ao carregar filtros de log:", error);

    }

};



export const loadAuditLogs = async (db) => {

    const logsContainer = document.getElementById('audit-logs-container');

    const tableBody = document.getElementById('audit-logs-table-body');

    const pdfBtn = document.getElementById('export-audit-pdf-btn');

    const filterSection = document.getElementById('audit-filters-section');

    

    if (!logsContainer || !tableBody) return;



    if (filterSection) filterSection.classList.remove('hidden');

    logsContainer.classList.remove('hidden');

    tableBody.innerHTML = '<tr><td colspan="4" class="text-center py-8"><div class="loader-small mx-auto"></div><p class="text-xs text-gray-400 mt-2">Buscando histórico e erros...</p></td></tr>';

    

    if (pdfBtn) pdfBtn.classList.add('hidden');



    try {

        if (document.getElementById('filter-log-user')?.options.length <= 1) {

            await loadLogFilters(db);

        }



        const logsRef = collection(db, "audit_logs");

        

        const userFilter = document.getElementById('filter-log-user')?.value;

        const actionFilter = document.getElementById('filter-log-action')?.value;

        const startDate = document.getElementById('filter-log-start')?.value;

        const endDate = document.getElementById('filter-log-end')?.value;



        const q = query(logsRef, orderBy("timestamp", "desc"), limit(1500));

        const snapshot = await getDocs(q);



        let filteredLogs = [];



        snapshot.forEach((docSnap) => {

            const log = docSnap.data();

            if (!log.timestamp) return;



            if (userFilter && userFilter !== 'all' && log.userEmail !== userFilter) return;

            if (actionFilter && actionFilter !== 'all' && log.action !== actionFilter) return;

            if (startDate && log.timestamp < startDate) return;

            if (endDate && log.timestamp > endDate + "T23:59:59") return;



            filteredLogs.push(log);

        });



        if (filteredLogs.length === 0) {

            tableBody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-gray-400 text-xs">Nenhum registro encontrado para estes filtros.</td></tr>';

            return;

        }



        tableBody.innerHTML = '';

        if (pdfBtn) pdfBtn.classList.remove('hidden');



        filteredLogs.slice(0, 200).forEach((log) => {

            let formattedDate = 'Data inválida';

            try {

                const date = new Date(log.timestamp);

                if (!isNaN(date.getTime())) {

                    formattedDate = date.toLocaleString('pt-BR', {

                        day: '2-digit', month: '2-digit', year: 'numeric',

                        hour: '2-digit', minute: '2-digit', second: '2-digit'

                    });

                }

            } catch (e) {}

            

            const row = document.createElement('tr');

            card.className = "border-b hover:bg-gray-50 transition-colors";

            

            let actionColor = 'bg-purple-100 text-purple-700 border border-purple-200';

            const action = (log.action || '').toLowerCase();

            

            if (action.includes('erro') || action.includes('error') || action.includes('falha')) {

                actionColor = 'bg-red-600 text-white border border-red-700 font-black animate-pulse';

            } else if (action.includes('delete') || action.includes('apagou') || action.includes('remove')) {

                actionColor = 'bg-red-100 text-red-700 border border-red-200';

            } else if (action.includes('create') || action.includes('criou') || action.includes('add')) {

                actionColor = 'bg-green-100 text-green-700 border border-green-200';

            } else if (action.includes('update') || action.includes('edit') || action.includes('atualiz')) {

                actionColor = 'bg-blue-100 text-blue-700 border border-blue-200';

            }

            

            const safeUserName = escapeHTML(log.userName || log.userEmail || 'Desconhecido');

            const safeAction = escapeHTML(log.action || 'AÇÃO');

            const safeDetails = escapeHTML(log.details || '-');

            const pautaInfo = log.pautaId && log.pautaId !== 'N/A' ? `<br><span class="text-[8px] text-gray-400">Pauta: ${escapeHTML(log.pautaId.substring(0,8))}</span>` : '';

            

            row.innerHTML = `

                <td class="px-3 py-2 whitespace-nowrap text-[10px] text-gray-600">${escapeHTML(formattedDate)}</td>

                <td class="px-3 py-2">

                    <p class="font-bold text-gray-800 text-[11px]">${safeUserName}</p>

                </td>

                <td class="px-3 py-2 text-center">

                    <span class="px-2 py-0.5 rounded text-[9px] ${actionColor} uppercase shadow-sm">${safeAction}</span>

                </td>

                <td class="px-3 py-2 text-[10px] text-gray-600 max-w-xs break-words">

                    ${safeDetails} ${pautaInfo}

                </td>

            `;

            tableBody.appendChild(row);

        });



    } catch (error) {

        console.error("❌ Erro detalhado ao carregar logs:", error);

        let errorMessage = "Erro ao carregar registros.";

        if (error.code === 'permission-denied') errorMessage = "Permissão negada. Você precisa ser admin.";

        tableBody.innerHTML = `<tr><td colspan="4" class="text-center py-8 text-red-500 text-xs font-bold border border-red-200 bg-red-50">❌ ${errorMessage}</td></tr>`;

    }

};



export const exportAuditLogsPDF = async (db) => {

    showNotification("Gerando PDF da Auditoria...", "info");

    try {

        const { jsPDF } = window.jspdf;

        const docPDF = new jsPDF({ orientation: 'landscape' });

        const logsRef = collection(db, "audit_logs");

        

        const userFilter = document.getElementById('filter-log-user')?.value;

        const actionFilter = document.getElementById('filter-log-action')?.value;

        const startDate = document.getElementById('filter-log-start')?.value;

        const endDate = document.getElementById('filter-log-end')?.value;



        const q = query(logsRef, orderBy("timestamp", "desc"), limit(1500));

        const snapshot = await getDocs(q);



        let filteredLogs = [];

        snapshot.forEach((docSnap) => {

            const log = docSnap.data();

            if (!log.timestamp) return;

            if (userFilter && userFilter !== 'all' && log.userEmail !== userFilter) return;

            if (actionFilter && actionFilter !== 'all' && log.action !== actionFilter) return;

            if (startDate && log.timestamp < startDate) return;

            if (endDate && log.timestamp > endDate + "T23:59:59") return;

            filteredLogs.push(log);

        });



        if (filteredLogs.length === 0) {

            showNotification("Nenhum log para exportar nestas datas.", "warning");

            return;

        }



        docPDF.setFontSize(18); docPDF.setTextColor(126, 34, 206);

        docPDF.text("Relatorio de Auditoria, Erros e Seguranca - SIGAP", 14, 20);

        

        docPDF.setFontSize(10); docPDF.setTextColor(100, 100, 100);

        docPDF.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 28);

        docPDF.text(`Total de registros exportados: ${filteredLogs.length}`, 14, 34);

        

        let yOffset = 40;

        const head = [['Data/Hora', 'Usuario', 'Acao', 'Detalhes']];

        const body = [];



        filteredLogs.forEach(log => {

            let dateStr = log.timestamp ? new Date(log.timestamp).toLocaleString('pt-BR') : 'Invalida';

            body.push([dateStr, `${log.userName || log.userEmail || 'Desconhecido'}`, log.action || '-', log.details || '-']);

        });



        docPDF.autoTable({

            head: head, body: body, startY: yOffset + 5, theme: 'striped',

            headStyles: { fillColor: [126, 34, 206], fontSize: 8, halign: 'center' },

            styles: { fontSize: 7, cellPadding: 2 },

            columnStyles: { 0: { cellWidth: 45 }, 1: { cellWidth: 55 }, 2: { cellWidth: 45 }, 3: { cellWidth: 'auto' } }

        });



        docPDF.save(`Auditoria_SIGAP_${new Date().toISOString().slice(0,10)}.pdf`);

        showNotification("PDF gerado com sucesso!");

    } catch (error) { showNotification("Erro ao gerar PDF.", "error"); }

};



// =========================================================================

// MÓDULO DE LIMPEZA E BI (OBSERVATÓRIO)

// =========================================================================



export const cleanupOldData = async (db) => {

    if (!confirm("Isso apagará dados com mais de 7 dias e gerará estatísticas. Confirmar?")) return;



    try {

        const limitDate = new Date();

        limitDate.setDate(limitDate.getDate() - 7);

        

        const pautas = await getDocs(collection(db, "pautas"));

        let count = 0; let statsCount = 0;



        for (const pautaDoc of pautas.docs) {

            const pautaData = pautaDoc.data();

            const attRef = collection(db, "pautas", pautaDoc.id, "attendances");

            const q = query(attRef, where("createdAt", "<", limitDate.toISOString()));

            const snapshot = await getDocs(q);



            if (!snapshot.empty) {

                const stats = {

                    pautaName: pautaData.name || 'Sem nome',

                    creatorEmail: pautaData.ownerEmail || pautaData.memberEmails?.[0] || 'Desconhecido',

                    dataReferencia: limitDate.toISOString(),

                    diaSemana: limitDate.getDay(),

                    total: snapshot.size,

                    atendidos: snapshot.docs.filter(d => d.data().status === 'atendido').length,

                    faltosos: snapshot.docs.filter(d => d.data().status === 'faltoso').length,

                    assuntos: {}, atendentes: {} // Armazena contagem estruturada de atendentes

                };



                snapshot.docs.forEach(d => {

                    const data = d.data();

                    const sub = data.subject || 'Não informado';

                    stats.assuntos[sub] = (stats.assuntos[sub] || 0) + 1;

                    

                    // Extrai e armazena os profissionais que canetaram os atendimentos no BI permanente

                    let profissionalNome = 'Não atribuído';

                    if (data.attendedBy) {

                        profissionalNome = typeof data.attendedBy === 'object' ? (data.attendedBy.nome || data.attendedBy.name) : data.attendedBy;

                    } else if (data.attendant) {

                        profissionalNome = typeof data.attendant === 'object' ? (data.attendant.nome || data.attendant.name) : data.attendant;

                    } else if (data.assignedCollaborator?.name) {

                        profissionalNome = data.assignedCollaborator.name;

                    }

                    if (profissionalNome) {

                        stats.atendentes[profissionalNome] = (stats.atendentes[profissionalNome] || 0) + 1;

                    }

                });



                await addDoc(collection(db, "estatisticas_permanentes"), stats);

                statsCount++;



                const batch = writeBatch(db);

                snapshot.docs.forEach(d => batch.delete(d.ref));

                await batch.commit();

                count += snapshot.size;

            }

        }

        showNotification(`Sucesso! ${count} limpos e ${statsCount} stats salvas.`);

        loadDashboardData(db);

    } catch (error) { showNotification("Erro: " + error.message, "error"); }

};



export const generateTestData = async (db) => {

    if (!confirm("Gerar dados de teste simulados para o BI sem misturar com dados de produção?")) return;

    try {

        const testData = [];

        const assuntosPool = ["ALIMENTOS PARA FILHOS", "DIVÓRCIO LITIGIOSO - SEM BENS", "DIVÓRCIO CONSENSUAL", "CURATELA", "URGÊNCIA MÉDICA"];

        const atendentesPool = ["Dra. Roberta Santos", "Dr. Marcos Alencar", "Dra. Clarice Lisboa", "Dr. Alex do Vale"];



        for(let i=0; i<6; i++) {

            let totalCasos = Math.floor(Math.random() * 40) + 30;

            let atendidos = Math.floor(totalCasos * 0.85);

            

            const localAssuntos = {};

            const localAtendentes = {};



            for(let j=0; j<totalCasos; j++) {

                const ass = assuntosPool[Math.floor(Math.random() * assuntosPool.length)];

                localAssuntos[ass] = (localAssuntos[ass] || 0) + 1;



                const atb = atendentesPool[Math.floor(Math.random() * atendentesPool.length)];

                localAtendentes[atb] = (localAtendentes[atb] || 0) + 1;

            }

            

            testData.push({

                pautaName: `Pauta Simulada de Mutirão ${i+1}`,

                creatorEmail: i % 2 === 0 ? "alex.silva@defensoria.rj.def.br" : "mariana.xavier@defensoria.rj.def.br",

                dataReferencia: new Date(Date.now() - (i*3)*24*60*60*1000).toISOString(),

                diaSemana: i + 1,

                total: totalCasos,

                atendidos: atendidos,

                faltosos: totalCasos - atendidos,

                assuntos: localAssuntos,

                atendentes: localAtendentes

            });

        }

        

        for (const data of testData) { await addDoc(collection(db, "estatisticas_permanentes"), data); }

        showNotification("✅ Dados simulados criados! Atualizando gráficos...");

        await loadDashboardData(db);

    } catch (error) { showNotification("Erro ao gerar dados", "error"); }

};



// ⭐ ATUALIZADO: Filtro estruturado com contagem e seletor de Atendentes ativo em tempo real ⭐

export const loadDashboardData = async (db) => {

    const start = document.getElementById('stats-filter-start')?.value;

    const end = document.getElementById('stats-filter-end')?.value;

    const userFilter = document.getElementById('stats-filter-user')?.value;

    const attendantFilter = document.getElementById('stats-filter-attendant')?.value;

    const resultsArea = document.getElementById('dashboard-results');



    if (!resultsArea) return;

    

    resultsArea.classList.remove('hidden');

    resultsArea.innerHTML = '<div class="text-center py-8"><div class="loader-small mx-auto"></div><p class="text-gray-600 mt-2">Processando BI Avançado...</p></div>';



    try {

        const snapshot = await getDocs(collection(db, "estatisticas_permanentes"));

        

        if (snapshot.empty) {

            resultsArea.innerHTML = `

                <div class="text-center py-12 bg-white rounded-lg border shadow-sm">

                    <div class="text-5xl mb-4">📊</div>

                    <h3 class="text-xl font-bold text-gray-800 mb-2">Seu BI ainda está vazio!</h3>

                    <p class="text-gray-500 mb-6 text-sm max-w-lg mx-auto leading-relaxed">

                        O Painel de Inteligência (BI) constrói relatórios usando apenas o seu <b>histórico de longo prazo</b>.<br><br>

                        Quando uma Pauta fica velha, clique em <b>"Executar Limpeza Manual de 7 Dias"</b>.

                    </p>

                    <button id="generate-test-data-btn" class="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg text-sm font-bold shadow-md transition-all">

                        Inserir Dados Fictícios para Testar o BI

                    </button>

                </div>`;

            document.getElementById('generate-test-data-btn')?.addEventListener('click', () => generateTestData(db));

            return;

        }

        

        let rawData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));



        // Alimenta o filtro de atendentes caso esteja vazio

        if (document.getElementById('stats-filter-attendant')?.options.length <= 1) {

            populateAttendantFilter(rawData);

        }



        let filteredData = [...rawData];

        if (start) filteredData = filteredData.filter(d => d.dataReferencia && d.dataReferencia >= start);

        if (end) filteredData = filteredData.filter(d => d.dataReferencia && d.dataReferencia <= end + "T23:59:59");

        if (userFilter && userFilter !== 'all') filteredData = filteredData.filter(d => d.creatorEmail === userFilter);

        

        // Injeção do filtro dinâmico de atendentes na matriz de dados

        if (attendantFilter && attendantFilter !== 'all') {

            filteredData = filteredData.filter(d => d.atendentes && d.atendentes[attendantFilter] !== undefined);

        }



        if (filteredData.length === 0) {

            resultsArea.innerHTML = '<div class="text-center py-8 text-gray-500 font-semibold bg-white rounded-lg border">Nenhum dado encontrado para os filtros selecionados.</div>';

            return;

        }



        let totalGeral = 0; let totalAtendidos = 0; let totalFaltosos = 0;

        let mapAssuntos = {}; let mapUsers = {};



        filteredData.forEach(d => {

            // Se houver um atendente específico selecionado, calcula a volumetria isolada dele

            if (attendantFilter && attendantFilter !== 'all') {

                const prodAtendente = d.atendentes[attendantFilter] || 0;

                totalGeral += prodAtendente;

                totalAtendidos += prodAtendente;

            } else {

                totalGeral += d.total || 0; 

                totalAtendidos += d.atendidos || 0; 

                totalFaltosos += d.faltosos || 0;

            }

            

            if (d.assuntos) {

                for (let [k, v] of Object.entries(d.assuntos)) {

                    mapAssuntos[k] = (mapAssuntos[k] || 0) + v;

                }

            }

            

            if (d.atendentes) {

                for (let [k, v] of Object.entries(d.atendentes)) {

                    mapUsers[k] = (mapUsers[k] || 0) + v;

                }

            }

        });



        const taxa = totalGeral > 0 ? ((totalFaltosos / totalGeral) * 100).toFixed(1) : 0;



        resultsArea.innerHTML = `

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">

                <div class="p-4 bg-blue-50 rounded-lg text-center border border-blue-100 shadow-sm"><p class="text-[9px] text-blue-600 font-bold uppercase">Demandado</p><h4 class="text-xl sm:text-2xl font-black text-blue-800">${totalGeral}</h4></div>

                <div class="p-4 bg-green-50 rounded-lg text-center border border-green-100 shadow-sm"><p class="text-[9px] text-green-600 font-bold uppercase">Atendidos</p><h4 class="text-xl sm:text-2xl font-black text-green-800">${totalAtendidos}</h4></div>

                <div class="p-4 bg-orange-50 rounded-lg text-center border border-orange-100 shadow-sm"><p class="text-[9px] text-orange-600 font-bold uppercase">Absenteísmo</p><h4 class="text-xl sm:text-2xl font-black text-orange-800">${attendantFilter && attendantFilter !== 'all' ? '0.0' : taxa}%</h4></div>

            </div>

            

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">

                <div class="border rounded-lg p-4 bg-white shadow-sm"><h5 class="text-[10px] font-bold mb-4 uppercase text-gray-500 border-b pb-2">Top Assuntos</h5><div id="dash-subjects-list" class="space-y-2 text-xs"></div></div>

                <div class="border rounded-lg p-4 bg-white shadow-sm"><h5 class="text-[10px] font-bold mb-4 uppercase text-gray-500 border-b pb-2">Produtividade por Atendente</h5><div id="dash-users-list" class="space-y-2 text-xs"></div></div>

            </div>

            

            <div class="flex justify-end gap-3 mt-6 border-t pt-4">

                 <button id="export-csv-btn" class="bg-emerald-600 text-white px-5 py-2.5 rounded-lg font-bold hover:bg-emerald-700 shadow-md text-sm transition">Baixar Excel (CSV)</button>

                 <button id="export-bi-pdf-btn" class="bg-red-600 text-white px-5 py-2.5 rounded-lg font-bold hover:bg-red-700 shadow-md text-sm transition">Baixar PDF</button>

            </div>

        `;



        const renderRanking = (elementId, dataMap) => {

            const el = document.getElementById(elementId);

            const sorted = Object.entries(dataMap).sort((a,b) => b[1] - a[1]).slice(0, 5);

            if (sorted.length === 0) { el.innerHTML = '<p class="text-center text-gray-400 py-4 text-xs">Sem dados.</p>'; return; }

            el.innerHTML = sorted.map(([name, count]) => `

                <div class="flex justify-between items-center border-b border-dashed border-gray-200 pb-1 pt-1 hover:bg-gray-50">

                    <span class="truncate pr-2 font-medium text-gray-700">${escapeHTML(name)}</span>

                    <span class="font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-md border border-green-200">${count}</span>

                </div>

            `).join('');

        };

        renderRanking('dash-subjects-list', mapAssuntos);

        renderRanking('dash-users-list', mapUsers);



        document.getElementById('export-bi-pdf-btn')?.addEventListener('click', () => exportBIDashboardPDF(totalGeral, totalAtendidos, taxa, mapAssuntos));

        document.getElementById('export-csv-btn')?.addEventListener('click', () => exportCSV(totalGeral, totalAtendidos, taxa, mapAssuntos));



        showNotification("Painel Executivo atualizado!", "success");



    } catch (error) {

        resultsArea.innerHTML = `<div class="text-center py-8 text-red-500 font-bold">Erro: ${error.message}</div>`;

    }

};



const exportCSV = (totalGeral, totalAtendidos, taxa, mapAssuntos) => {

    let csvContent = "data:text/csv;charset=utf-8,RELATORIO EXECUTIVO - SIGAP\n\nMETRICA;VALOR\n";

    csvContent += `Total Demandado;${totalGeral}\nTotal Atendido;${totalAtendidos}\nTaxa Absenteismo;${taxa}%\n\nASSUNTO;QUANTIDADE\n`;

    Object.entries(mapAssuntos).sort((a,b)=>b[1]-a[1]).forEach(([k,v]) => { csvContent += `${k};${v}\n`; });



    const encodedUri = encodeURI(csvContent);

    const link = document.createElement("a");

    link.setAttribute("href", encodedUri);

    link.setAttribute("download", `Relatorio_BI_SIGAP_${new Date().toISOString().slice(0,10)}.csv`);

    document.body.appendChild(link); link.click(); document.body.removeChild(link);

};



export const exportBIDashboardPDF = (totalGeral, totalAtendidos, taxaFalta, mapAssuntos) => {

    try {

        const docPDF = new window.jspdf.jsPDF();

        docPDF.setFontSize(18); docPDF.setTextColor(22, 163, 74); docPDF.text("Relatorio Executivo de BI - SIGAP", 14, 20);

        docPDF.setFontSize(10); docPDF.setTextColor(100, 100, 100); docPDF.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 28);

        docPDF.setFontSize(14); docPDF.setTextColor(0, 0, 0); docPDF.text("Resumo Geral", 14, 45);

        docPDF.setFontSize(11); docPDF.setTextColor(50, 50, 50);

        docPDF.text(`Total Demandado: ${totalGeral}`, 14, 55); docPDF.text(`Atendimentos Efetivos: ${totalAtendidos}`, 14, 62);

        docPDF.text(`Taxa de Faltas: ${taxaFalta}%`, 14, 69);

        docPDF.setFontSize(14); docPDF.setTextColor(0, 0, 0); docPDF.text("Principais Demandas", 14, 85);

        let y = 95; docPDF.setFontSize(10); docPDF.setTextColor(80, 80, 80);

        Object.entries(mapAssuntos).sort((a,b) => b[1] - a[1]).slice(0,10).forEach(([k,v]) => { docPDF.text(`${k}: ${v} atendimentos`, 14, y); y += 7; });

        docPDF.save(`Relatorio_BI_SIGAP_${new Date().toISOString().slice(0,10)}.pdf`);

    } catch(e) { showNotification("Erro ao gerar PDF", "error"); }

};



export const populateUserFilter = async (db) => {

    const select = document.getElementById('stats-filter-user');

    if (!select) return;

    try {

        const snapshot = await getDocs(collection(db, "users"));

        select.innerHTML = '<option value="all">Todos os Usuários</option>';

        snapshot.forEach(d => { if (d.data().email) select.appendChild(new Option(d.data().name || d.data().email, d.data().email)); });

    } catch (e) {}

};



// 🟢 NOVO: Alimenta o seletor de atendentes com base nos registros armazenados no histórico 🟢

const populateAttendantFilter = (rawData) => {

    const select = document.getElementById('stats-filter-attendant');

    if (!select) return;

    

    const atendentesUnicos = new Set();

    rawData.forEach(d => {

        if (d.atendentes) {

            Object.keys(d.atendentes).forEach(nome => {

                if (nome && nome !== 'Não informado' && nome !== 'Não atribuído') {

                    atendentesUnicos.add(nome);

                }

            });

        }

    });



    select.innerHTML = '<option value="all">Todos os Atendentes</option>';

    Array.from(atendentesUnicos).sort().forEach(nome => {

        select.appendChild(new Option(nome, nome));

    });

};



// Listeners dinâmicos

document.getElementById('filter-log-user')?.addEventListener('change', () => loadAuditLogs(window.app?.db));

document.getElementById('filter-log-action')?.addEventListener('change', () => loadAuditLogs(window.app?.db));

document.getElementById('filter-log-start')?.addEventListener('change', () => loadAuditLogs(window.app?.db));

document.getElementById('filter-log-end')?.addEventListener('change', () => loadAuditLogs(window.app?.db));



// Globais

window.cleanupOldData = () => cleanupOldData(window.app?.db);

window.loadDashboardData = () => loadDashboardData(window.app?.db);

window.populateUserFilter = () => populateUserFilter(window.app?.db);

window.generateTestData = () => generateTestData(window.app?.db);

window.loadAuditLogs = () => loadAuditLogs(window.app?.db);

window.exportAuditLogsPDF = () => exportAuditLogsPDF(window.app?.db);

console.log("✅ Módulo admin.js carregado com sucesso (Auditoria e BI Otimizados)");

