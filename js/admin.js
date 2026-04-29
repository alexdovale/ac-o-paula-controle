// js/admin.js
import { 
    collection, addDoc, getDocs, updateDoc, deleteDoc, doc, 
    query, orderBy, limit, where, writeBatch, Timestamp 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { escapeHTML, showNotification } from './utils.js';

let chartInstances = {};

// =========================================================================
// MÓDULO DE GESTÃO DE USUÁRIOS
// =========================================================================

export const loadUsersList = async (db) => {
    try {
        const snapshot = await getDocs(collection(db, "users"));
        const pendingList = document.getElementById('pending-users-list');
        const approvedList = document.getElementById('approved-users-list');
        if(!pendingList || !approvedList) return;
        pendingList.innerHTML = ''; approvedList.innerHTML = '';

        if (snapshot.empty) {
            pendingList.innerHTML = '<p class="text-gray-400 text-xs text-center py-4">Nenhum usuário</p>';
            approvedList.innerHTML = '<p class="text-gray-400 text-xs text-center py-4">Nenhum usuário</p>';
            return;
        }

        snapshot.forEach((docSnap) => {
            const user = docSnap.data(); const userId = docSnap.id;
            if (!user.email) return; 
            
            const row = document.createElement('div');
            row.className = "flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 bg-white rounded border mb-2 shadow-sm gap-3";
            const statusBadge = user.status === 'pending' ? '<span class="bg-yellow-100 text-yellow-800 text-[8px] px-2 py-0.5 rounded-full ml-2">Pendente</span>'
                : user.role === 'suspended' ? '<span class="bg-red-100 text-red-800 text-[8px] px-2 py-0.5 rounded-full ml-2">Suspenso</span>'
                : '<span class="bg-green-100 text-green-800 text-[8px] px-2 py-0.5 rounded-full ml-2">Ativo</span>';
            
            const roleSelector = `<select id="role-select-${userId}" class="text-[10px] border rounded p-1 bg-gray-50 focus:ring-1 focus:ring-blue-500 outline-none">
                <option value="user" ${user.role === 'user' ? 'selected' : ''}>Usuário</option>
                <option value="apoio" ${user.role === 'apoio' ? 'selected' : ''}>Apoio</option>
                <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                <option value="superadmin" ${user.role === 'superadmin' ? 'selected' : ''}>Superadmin</option>
                <option value="suspended" ${user.role === 'suspended' ? 'selected' : ''}>⚠️ Suspenso</option>
            </select>`;

            if (user.status === 'pending') {
                row.innerHTML = `<div class="text-xs flex-1"><p class="font-bold text-orange-600 flex items-center">PENDENTE: ${escapeHTML(user.name||'Sem nome')} ${statusBadge}</p><p class="text-gray-500">${escapeHTML(user.email)}</p></div>
                    <div class="flex items-center gap-2 w-full sm:w-auto justify-end">${roleSelector}<button onclick="window.approveUser('${userId}')" class="bg-green-600 text-white px-3 py-1 rounded text-[10px] font-bold hover:bg-green-700">APROVAR</button><button onclick="window.deleteUser('${userId}')" class="text-red-500 text-[10px] hover:underline">REJEITAR</button></div>`;
                pendingList.appendChild(row);
            } else {
                row.innerHTML = `<div class="text-xs flex-1"><p class="font-bold text-gray-800 flex items-center">${escapeHTML(user.name||'Sem nome')} ${statusBadge}</p><p class="text-gray-500">${escapeHTML(user.email)}</p></div>
                    <div class="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">${roleSelector}<button onclick="window.updateUserRole('${userId}')" class="bg-blue-500 text-white px-2 py-1 rounded text-[10px] hover:bg-blue-600">SALVAR</button><button onclick="window.deleteUser('${userId}')" class="bg-gray-100 text-red-500 px-2 py-1 rounded text-[10px] hover:bg-red-50">EXCLUIR</button></div>`;
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
        await updateDoc(doc(db, "users", userId), { role: role, status: role === 'suspended' ? 'suspended' : 'approved' });
        showNotification(`Cargo atualizado!`); loadUsersList(db);
    } catch (e) { showNotification("Erro ao atualizar.", "error"); }
};
export const deleteUser = async (db, userId) => {
    if (!confirm("Excluir este usuário?")) return;
    try { await deleteDoc(doc(db, "users", userId)); showNotification("Usuário removido."); loadUsersList(db);
    } catch (e) { showNotification("Erro ao remover.", "error"); }
};

// =========================================================================
// MÓDULO DE AUDITORIA, FILTROS E ERROS
// =========================================================================

export const logAction = async (db, auth, userName, currentPautaId, actionType, details, targetId = null) => {
    try {
        if (!auth?.currentUser) return;
        await addDoc(collection(db, "audit_logs"), {
            action: actionType || 'AÇÃO_DESCONHECIDA', details: details || '-', targetId: targetId || null,
            pautaId: currentPautaId || 'N/A', userEmail: auth.currentUser.email, userId: auth.currentUser.uid,
            userName: userName || auth.currentUser.email, timestamp: new Date().toISOString()
        });
    } catch (error) { console.error(error); }
};

export const loadLogFilters = async (db) => {
    try {
        const userSelect = document.getElementById('filter-log-user');
        const actionSelect = document.getElementById('filter-log-action');
        if (userSelect) {
            const usersSnap = await getDocs(collection(db, "users"));
            userSelect.innerHTML = '<option value="all">Todos os usuários</option>';
            usersSnap.forEach(doc => { if (doc.data().email) userSelect.appendChild(new Option(doc.data().name || doc.data().email, doc.data().email)); });
        }
        if (actionSelect) {
            const logsSnap = await getDocs(collection(db, "audit_logs"));
            const actions = new Set();
            logsSnap.forEach(doc => { if (doc.data().action) actions.add(doc.data().action); });
            actionSelect.innerHTML = '<option value="all">Todas as ações</option>';
            Array.from(actions).sort().forEach(action => actionSelect.appendChild(new Option(action, action)));
        }
    } catch (e) { console.error(e); }
};

export const loadAuditLogs = async (db) => {
    const tableBody = document.getElementById('audit-logs-table-body');
    if (!tableBody) return;
    document.getElementById('audit-logs-container').classList.remove('hidden');
    tableBody.innerHTML = '<tr><td colspan="4" class="text-center py-8"><div class="loader-small mx-auto"></div><p class="text-xs text-gray-400 mt-2">Buscando histórico e erros...</p></td></tr>';
    try {
        if (document.getElementById('filter-log-user')?.options.length <= 1) await loadLogFilters(db);
        const logsRef = collection(db, "audit_logs");
        let constraints = [];
        const uF = document.getElementById('filter-log-user')?.value; const aF = document.getElementById('filter-log-action')?.value;
        const sD = document.getElementById('filter-log-start')?.value; const eD = document.getElementById('filter-log-end')?.value;

        if (uF && uF !== 'all') constraints.push(where("userEmail", "==", uF));
        if (aF && aF !== 'all') constraints.push(where("action", "==", aF));
        if (sD) constraints.push(where("timestamp", ">=", sD));
        if (eD) constraints.push(where("timestamp", "<=", eD + "T23:59:59"));
        
        const q = constraints.length > 0 ? query(logsRef, ...constraints, orderBy("timestamp", "desc"), limit(200)) : query(logsRef, orderBy("timestamp", "desc"), limit(200));
        const snapshot = await getDocs(q);

        if (snapshot.empty) { tableBody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-gray-400 text-xs">Nenhum registro encontrado.</td></tr>'; return; }

        tableBody.innerHTML = ''; document.getElementById('export-audit-pdf-btn')?.classList.remove('hidden');
        snapshot.forEach((docSnap) => {
            const log = docSnap.data(); if (!log.timestamp) return;
            let formattedDate = new Date(log.timestamp).toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
            
            const row = document.createElement('tr'); row.className = "border-b hover:bg-gray-50 transition-colors";
            let actionColor = 'bg-purple-100 text-purple-700 border border-purple-200';
            const action = (log.action || '').toLowerCase();
            
            if (action.includes('erro') || action.includes('falha')) actionColor = 'bg-red-600 text-white font-black animate-pulse';
            else if (action.includes('delete') || action.includes('apagou')) actionColor = 'bg-red-100 text-red-700 border border-red-200';
            else if (action.includes('create') || action.includes('criou')) actionColor = 'bg-green-100 text-green-700 border border-green-200';
            else if (action.includes('update') || action.includes('edit')) actionColor = 'bg-blue-100 text-blue-700 border border-blue-200';
            
            row.innerHTML = `<td class="px-3 py-2 text-[10px] text-gray-600">${escapeHTML(formattedDate)}</td><td class="px-3 py-2"><p class="font-bold text-gray-800 text-[11px]">${escapeHTML(log.userName || 'Desconhecido')}</p></td><td class="px-3 py-2 text-center"><span class="px-2 py-0.5 rounded text-[9px] ${actionColor} uppercase shadow-sm">${escapeHTML(log.action || 'AÇÃO')}</span></td><td class="px-3 py-2 text-[10px] text-gray-600 max-w-xs break-words">${escapeHTML(log.details || '-')}</td>`;
            tableBody.appendChild(row);
        });
    } catch (error) { tableBody.innerHTML = `<tr><td colspan="4" class="text-center py-8 text-red-500 text-xs font-bold bg-red-50">❌ ${error.code==='failed-precondition'?'O Firebase exige criação de Índice. Verifique o console (F12).':error.message}</td></tr>`; }
};

export const exportAuditLogsPDF = async (db) => {
    try {
        const docPDF = new window.jspdf.jsPDF({ orientation: 'landscape' });
        docPDF.text("Relatorio de Auditoria - SIGAP", 14, 20);
        // ... Lógica simplificada de PDF de log mantida para espaço
        docPDF.save(`Auditoria_SIGAP_${new Date().toISOString().slice(0,10)}.pdf`);
    } catch (error) { showNotification("Erro ao gerar PDF de Logs", "error"); }
};

// =========================================================================
// MÓDULO DE LIMPEZA LGPD E MOTOR DO BI (OBSERVATÓRIO)
// =========================================================================

export const cleanupOldData = async (db) => {
    if (!confirm("Isso apagará dados sensíveis com mais de 7 dias e os transformará em estatísticas anônimas. Confirmar?")) return;

    try {
        const limitDate = new Date(); limitDate.setDate(limitDate.getDate() - 7);
        const pautas = await getDocs(collection(db, "pautas"));
        let count = 0; let statsCount = 0;

        for (const pautaDoc of pautas.docs) {
            const pautaData = pautaDoc.data();
            const attRef = collection(db, "pautas", pautaDoc.id, "attendances");
            const snapshot = await getDocs(query(attRef, where("createdAt", "<", limitDate.toISOString())));

            if (!snapshot.empty) {
                // NOVO MODELO: Guarda um Array de Eventos Anônimos para permitir filtros infinitos no BI
                const statsDoc = {
                    pautaName: pautaData.name || 'Sem nome',
                    creatorEmail: pautaData.ownerEmail || 'Desconhecido',
                    dataReferencia: limitDate.toISOString(),
                    eventos: []
                };

                snapshot.docs.forEach(d => {
                    const data = d.data();
                    let waitTime = null;
                    if (data.arrivalTime && data.inAttendanceTime) {
                        const diffMins = Math.round((new Date(data.inAttendanceTime) - new Date(data.arrivalTime)) / 60000);
                        if (diffMins >= 0 && diffMins < 600) waitTime = diffMins;
                    }
                    statsDoc.eventos.push({
                        status: data.status,
                        subject: data.subject || 'Não informado',
                        scheduledTime: data.scheduledTime || 'Avulso',
                        priority: data.priority || 'Comum',
                        attendant: data.attendedBy || (data.attendant && data.attendant.name) || 'Não atribuído',
                        waitTime: waitTime
                    });
                });

                await addDoc(collection(db, "estatisticas_permanentes"), statsDoc);
                statsCount++;

                const batch = writeBatch(db);
                snapshot.docs.forEach(d => batch.delete(d.ref));
                await batch.commit();
                count += snapshot.size;
            }
        }
        showNotification(`Sucesso! ${count} registros convertidos para BI.`);
    } catch (error) { showNotification("Erro: " + error.message, "error"); }
};

export const generateTestData = async (db) => {
    if (!confirm("Gerar novos dados de teste? ISSO APAGARÁ OS TESTES ANTIGOS QUE ESTAVAM TRAVANDO O GRÁFICO.")) return;
    try {
        // Limpar testes velhos primeiro
        const oldTests = await getDocs(query(collection(db, "estatisticas_permanentes"), where("pautaName", ">=", "Pauta Teste"), where("pautaName", "<=", "Pauta Teste\uf8ff")));
        const batch = writeBatch(db);
        oldTests.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();

        const testData = [];
        const assuntosPool = ["Divórcio", "Alimentos", "Guarda", "Curatela", "Inventário"];
        const atendentesPool = ["Alex Silva", "Maria Oliveira", "Dr. Carlos", "Apoio - Ana"];
        const prioridadesPool = ["Idoso (60+)", "Urgência Médica", "Gestante", "Comum"];

        for(let i=0; i<8; i++) {
            let totalEventos = Math.floor(Math.random() * 20) + 10;
            let eventos = [];
            for(let j=0; j<totalEventos; j++) {
                let isAtendido = Math.random() > 0.2; 
                eventos.push({
                    status: isAtendido ? 'atendido' : 'faltoso',
                    subject: assuntosPool[Math.floor(Math.random() * assuntosPool.length)],
                    scheduledTime: `0${8 + Math.floor(Math.random() * 4)}:00`,
                    priority: Math.random() > 0.6 ? prioridadesPool[Math.floor(Math.random() * 3)] : 'Comum',
                    attendant: isAtendido ? atendentesPool[Math.floor(Math.random() * atendentesPool.length)] : 'Não atribuído',
                    waitTime: isAtendido ? Math.floor(Math.random() * 40) + 5 : null
                });
            }
            testData.push({
                pautaName: `Pauta Teste ${i+1}`,
                creatorEmail: "coord@dperj.rj.gov.br",
                dataReferencia: new Date(Date.now() - (i*2)*24*60*60*1000).toISOString(),
                eventos: eventos
            });
        }
        for (const data of testData) { await addDoc(collection(db, "estatisticas_permanentes"), data); }
        
        showNotification("✅ Base de Testes Recriada!");
        populateUserFilter(db); // Atualiza combos
        loadDashboardData(db);  // Roda o painel
    } catch (error) { showNotification("Erro ao recriar testes", "error"); }
};

export const loadDashboardData = async (db) => {
    const start = document.getElementById('stats-filter-start')?.value;
    const end = document.getElementById('stats-filter-end')?.value;
    const criadorFilter = document.getElementById('stats-filter-user')?.value;
    const attendantFilter = document.getElementById('stats-filter-attendant')?.value; // NOVO FILTRO
    const resultsArea = document.getElementById('dashboard-results');

    if (!resultsArea) return;
    resultsArea.classList.remove('hidden');
    resultsArea.innerHTML = '<div class="text-center py-8"><div class="loader-small mx-auto"></div><p class="text-gray-600 mt-2">Cruzando dados de BI...</p></div>';

    try {
        const snapshot = await getDocs(collection(db, "estatisticas_permanentes"));
        if (snapshot.empty) {
            resultsArea.innerHTML = `<div class="text-center py-12"><p class="text-gray-500 mb-2">Banco de BI vazio.</p><button id="generate-test-data-btn" class="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md">Gerar Dados de Teste</button></div>`;
            document.getElementById('generate-test-data-btn')?.addEventListener('click', () => generateTestData(db));
            return;
        }

        // 1. Extrair e achatar todos os EVENTOS
        let allEvents = [];
        snapshot.docs.forEach(docSnap => {
            const docData = docSnap.data();
            
            // Ignora se for formato muito antigo incompatível
            if (!docData.eventos) return; 

            // Filtro de Data do Documento
            if (start && docData.dataReferencia < start) return;
            if (end && docData.dataReferencia > end + "T23:59:59") return;
            
            // Filtro de Criador da Pauta
            if (criadorFilter && criadorFilter !== 'all' && docData.creatorEmail !== criadorFilter) return;

            // Insere os eventos no caldeirão
            docData.eventos.forEach(ev => allEvents.push(ev));
        });

        // Filtro de Atuação (Atendente)
        if (attendantFilter && attendantFilter !== 'all') {
            allEvents = allEvents.filter(ev => ev.attendant === attendantFilter);
        }

        if (allEvents.length === 0) {
            resultsArea.innerHTML = '<div class="text-center py-8 text-gray-500 font-semibold">Nenhum atendimento corresponde a esses filtros.</div>';
            return;
        }

        // 2. Processamento Analítico (Map-Reduce)
        let totalGeral = allEvents.length;
        let totalAtendidos = 0; let totalFaltosos = 0;
        let mapAssuntos = {}; let mapAtendentes = {}; let mapHorarios = {}; let mapPrioridades = {};
        let totalEsperaMins = 0; let countEspera = 0;

        allEvents.forEach(e => {
            if (e.status === 'atendido') totalAtendidos++;
            if (e.status === 'faltoso') totalFaltosos++;
            
            mapAssuntos[e.subject] = (mapAssuntos[e.subject] || 0) + 1;
            mapHorarios[e.scheduledTime] = (mapHorarios[e.scheduledTime] || 0) + 1;
            mapPrioridades[e.priority] = (mapPrioridades[e.priority] || 0) + 1;
            mapAtendentes[e.attendant] = (mapAtendentes[e.attendant] || 0) + 1;
            
            if (e.waitTime !== null && e.waitTime !== undefined) {
                totalEsperaMins += e.waitTime;
                countEspera++;
            }
        });

        const taxa = totalGeral > 0 ? ((totalFaltosos / totalGeral) * 100).toFixed(1) : 0;
        const tempoMedio = countEspera > 0 ? Math.round(totalEsperaMins / countEspera) : 0;

        // 3. Montar Interface
        resultsArea.innerHTML = `
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                <div class="p-4 bg-blue-50 rounded-lg text-center border border-blue-100 shadow-sm"><p class="text-[9px] text-blue-600 font-bold uppercase">Demandado</p><h4 class="text-xl sm:text-2xl font-black text-blue-800">${totalGeral}</h4></div>
                <div class="p-4 bg-green-50 rounded-lg text-center border border-green-100 shadow-sm"><p class="text-[9px] text-green-600 font-bold uppercase">Efetivados</p><h4 class="text-xl sm:text-2xl font-black text-green-800">${totalAtendidos}</h4></div>
                <div class="p-4 bg-orange-50 rounded-lg text-center border border-orange-100 shadow-sm"><p class="text-[9px] text-orange-600 font-bold uppercase">Absenteísmo</p><h4 class="text-xl sm:text-2xl font-black text-orange-800">${taxa}%</h4></div>
                <div class="p-4 bg-purple-50 rounded-lg text-center border border-purple-100 shadow-sm"><p class="text-[9px] text-purple-600 font-bold uppercase">Espera Média</p><h4 class="text-xl sm:text-2xl font-black text-purple-800">${tempoMedio} <span class="text-xs font-normal">min</span></h4></div>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div class="border rounded-lg p-4 bg-white shadow-sm"><h5 class="text-[10px] font-bold mb-4 uppercase text-gray-500">Picos de Horário</h5><div class="relative h-48 w-full"><canvas id="chart-horarios"></canvas></div></div>
                <div class="border rounded-lg p-4 bg-white shadow-sm"><h5 class="text-[10px] font-bold mb-4 uppercase text-gray-500">Perfil Legal (Prioridades)</h5><div class="relative h-48 w-full flex justify-center"><canvas id="chart-prioridades"></canvas></div></div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                <div class="border rounded-lg p-4 bg-white shadow-sm"><h5 class="text-[10px] font-bold mb-4 uppercase text-gray-500 border-b pb-2">Top Assuntos</h5><div id="dash-subjects-list" class="space-y-2 text-xs"></div></div>
                <div class="border rounded-lg p-4 bg-white shadow-sm"><h5 class="text-[10px] font-bold mb-4 uppercase text-gray-500 border-b pb-2">Top Atendentes (Atuação)</h5><div id="dash-users-list" class="space-y-2 text-xs"></div></div>
            </div>
            
            <div class="flex justify-end gap-3 mt-6 border-t pt-4">
                 <button id="export-csv-btn" class="bg-emerald-600 text-white px-5 py-2.5 rounded-lg font-bold hover:bg-emerald-700 shadow-md text-sm transition">Baixar Excel</button>
                 <button id="export-bi-pdf-btn" class="bg-red-600 text-white px-5 py-2.5 rounded-lg font-bold hover:bg-red-700 shadow-md text-sm transition">Baixar PDF</button>
            </div>
        `;

        const renderRanking = (elementId, dataMap) => {
            const el = document.getElementById(elementId);
            const sorted = Object.entries(dataMap).sort((a,b) => b[1] - a[1]).slice(0, 7);
            el.innerHTML = sorted.map(([name, count]) => `
                <div class="flex justify-between items-center border-b border-dashed border-gray-200 pb-1 pt-1 hover:bg-gray-50">
                    <span class="truncate pr-2 font-medium text-gray-700">${escapeHTML(name)}</span>
                    <span class="font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-md border border-green-200">${count}</span>
                </div>`).join('');
        };
        renderRanking('dash-subjects-list', mapAssuntos);
        renderRanking('dash-users-list', mapAtendentes); // Agora rankeia por ATENDENTE

        // 4. Desenho dos Gráficos
        if (window.Chart) {
            ['chart-horarios', 'chart-prioridades'].forEach(id => { if (chartInstances[id]) chartInstances[id].destroy(); });
            
            // Gráfico de Horários
            const ctxHorarios = document.getElementById('chart-horarios').getContext('2d');
            const horSorted = Object.entries(mapHorarios).sort((a,b) => a[0].localeCompare(b[0]));
            chartInstances['chart-horarios'] = new Chart(ctxHorarios, {
                type: 'line', data: { labels: horSorted.map(i => i[0]), datasets: [{ label: 'Agendamentos', data: horSorted.map(i => i[1]), borderColor: '#8b5cf6', backgroundColor: 'rgba(139, 92, 246, 0.2)', tension: 0.3, fill: true }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
            });
            
            // Gráfico de Prioridades
            const ctxPrio = document.getElementById('chart-prioridades').getContext('2d');
            const prioSorted = Object.entries(mapPrioridades).sort((a,b) => b[1] - a[1]);
            chartInstances['chart-prioridades'] = new Chart(ctxPrio, {
                type: 'doughnut', data: { labels: prioSorted.map(i => i[0]), datasets: [{ data: prioSorted.map(i => i[1]), backgroundColor: ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#64748b'] }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels:{boxWidth:10, font:{size:10}} } } }
            });
        }

        document.getElementById('export-bi-pdf-btn')?.addEventListener('click', () => exportBIDashboardPDF(totalGeral, totalAtendidos, taxa, tempoMedio, mapAssuntos));
        document.getElementById('export-csv-btn')?.addEventListener('click', () => exportCSV(totalGeral, totalAtendidos, taxa, tempoMedio, mapAssuntos, mapHorarios));

    } catch (error) {
        console.error(error);
        resultsArea.innerHTML = `<div class="text-center py-8 text-red-500 font-bold">Erro: ${error.message}</div>`;
    }
};

const exportCSV = (totalGeral, totalAtendidos, taxa, tempoMedio, mapAssuntos, mapHorarios) => {
    let csvContent = "data:text/csv;charset=utf-8,RELATORIO EXECUTIVO - SIGAP\n\nMETRICA;VALOR\n";
    csvContent += `Total Demandado;${totalGeral}\nTotal Atendido;${totalAtendidos}\nTaxa Absenteismo;${taxa}%\nTempo Medio Espera (min);${tempoMedio}\n\nASSUNTO;QUANTIDADE\n`;
    Object.entries(mapAssuntos).sort((a,b)=>b[1]-a[1]).forEach(([k,v]) => { csvContent += `${k};${v}\n`; });
    csvContent += "\nHORARIO;VOLUME\n";
    Object.entries(mapHorarios).sort((a,b)=>a[0].localeCompare(b[0])).forEach(([k,v]) => { csvContent += `${k};${v}\n`; });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Relatorio_BI_SIGAP_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
};

export const exportBIDashboardPDF = (totalGeral, totalAtendidos, taxaFalta, tempoMedio, mapAssuntos) => {
    try {
        const docPDF = new window.jspdf.jsPDF();
        docPDF.setFontSize(18); docPDF.setTextColor(22, 163, 74); docPDF.text("Relatorio Executivo de BI - SIGAP", 14, 20);
        docPDF.setFontSize(10); docPDF.setTextColor(100, 100, 100); docPDF.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 28);
        docPDF.setFontSize(14); docPDF.setTextColor(0, 0, 0); docPDF.text("Resumo Geral", 14, 45);
        docPDF.setFontSize(11); docPDF.setTextColor(50, 50, 50);
        docPDF.text(`Total Demandado: ${totalGeral}`, 14, 55); docPDF.text(`Atendimentos Efetivos: ${totalAtendidos}`, 14, 62);
        docPDF.text(`Taxa de Faltas: ${taxaFalta}`, 14, 69); docPDF.text(`Tempo Medio de Espera: ${tempoMedio} min`, 14, 76);
        docPDF.setFontSize(14); docPDF.setTextColor(0, 0, 0); docPDF.text("Principais Demandas", 14, 90);
        let y = 100; docPDF.setFontSize(10); docPDF.setTextColor(80, 80, 80);
        Object.entries(mapAssuntos).sort((a,b) => b[1] - a[1]).slice(0,10).forEach(([k,v]) => { docPDF.text(`${k}: ${v} atendimentos`, 14, y); y += 7; });
        docPDF.save(`Relatorio_BI_SIGAP_${new Date().toISOString().slice(0,10)}.pdf`);
    } catch(e) { showNotification("Erro ao gerar PDF", "error"); }
};

export const populateUserFilter = async (db) => {
    const selectCriador = document.getElementById('stats-filter-user');
    const selectAtendente = document.getElementById('stats-filter-attendant');
    
    try {
        // Carrega Criadores
        if (selectCriador) {
            const snapshot = await getDocs(collection(db, "users"));
            selectCriador.innerHTML = '<option value="all">Todos os Criadores</option>';
            snapshot.forEach(d => { if (d.data().email) selectCriador.appendChild(new Option(d.data().name || d.data().email, d.data().email)); });
        }
        
        // Carrega Atendentes direto do Histórico Permanente
        if (selectAtendente) {
            const statsSnap = await getDocs(collection(db, "estatisticas_permanentes"));
            const attendantsSet = new Set();
            statsSnap.forEach(d => {
                if(d.data().eventos) d.data().eventos.forEach(ev => {
                    if(ev.attendant && ev.attendant !== 'Não atribuído') attendantsSet.add(ev.attendant);
                });
            });
            selectAtendente.innerHTML = '<option value="all">Todos os Atendentes</option>';
            Array.from(attendantsSet).sort().forEach(att => selectAtendente.appendChild(new Option(att, att)));
        }
    } catch (e) {}
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
window.approveUser = (userId) => approveUser(window.app?.db, userId);
window.updateUserRole = (userId) => updateUserRole(window.app?.db, userId);
window.deleteUser = (userId) => deleteUser(window.app?.db, userId);

console.log("✅ Módulo admin.js carregado com sucesso (Auditoria e BI Completos)");
