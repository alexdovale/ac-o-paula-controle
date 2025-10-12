/**
 * estatisticas.js
 * * Este script lida com o cálculo e a exibição de estatísticas para a pauta,
 * incluindo a geração de gráficos e a exportação para PDF.
 * * COMO INTEGRAR:
 * 1. Adicione as bibliotecas Chart.js e jsPDF ao seu `index.html` (antes do script principal):
 * <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
 * <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
 * <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.23/jspdf.plugin.autotable.min.js"></script>
 * * 2. Adicione este arquivo `estatisticas.js` ao seu `index.html` (também antes do script principal):
 * <script src="estatisticas.js"></script>
 * * 3. No seu `script type="module"` principal em `index.html`, encontre a função `showStatisticsModal`
 * e substitua seu conteúdo pela chamada da nova função, passando os dados necessários.
 * * // Exemplo de como modificar a função existente em index.html:
 * const showStatisticsModal = () => {
 * // Chama a função do arquivo estatisticas.js
 * renderStatisticsModal(
 * allAssisted, 
 * currentPautaData?.useDelegationFlow, 
 * document.getElementById('pauta-title').textContent
 * );
 * };
 * * // O evento de clique no botão "view-stats-btn" já está configurado para chamar `showStatisticsModal`,
 * // então nenhuma outra alteração de evento é necessária.
 */

/**
 * Adiciona funcionalidades de janela (arrastar, redimensionar, minimizar, maximizar, fechar) a um elemento modal.
 * @param {HTMLElement} modal - O elemento do modal a ser tornado interativo.
 */
function makeModalInteractive(modal) {
    if (!modal || modal.classList.contains('interactive-modal-init')) {
        return; // Já inicializado ou modal não encontrado
    }
    modal.classList.add('interactive-modal-init', 'bg-white');

    const content = document.getElementById('statistics-content');
    if (!content) {
        console.error("#statistics-content não encontrado.");
        return;
    }

    Object.assign(modal.style, {
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)', width: '90vw', height: '90vh',
        maxWidth: '1400px', maxHeight: '95vh', resize: 'both',
        overflow: 'hidden', border: '1px solid #ddd',
        boxShadow: '0 5px 25px rgba(0,0,0,0.2)', borderRadius: '12px',
        minWidth: '600px', minHeight: '500px', display: 'flex',
        flexDirection: 'column'
    });
    
    if (document.getElementById('statistics-modal-header')) {
        return;
    }
    
    const header = document.createElement('div');
    header.id = 'statistics-modal-header';
    Object.assign(header.style, {
        backgroundColor: '#f7f7f7', padding: '10px 15px', cursor: 'move',
        borderBottom: '1px solid #ddd', display: 'flex',
        justifyContent: 'space-between', alignItems: 'center',
        borderTopLeftRadius: '12px', borderTopRightRadius: '12px'
    });
    
    const title = document.createElement('span');
    title.textContent = 'Estatísticas da Pauta';
    title.style.fontWeight = 'bold';
    title.style.color = '#333';

    const buttons = document.createElement('div');
    const minBtn = document.createElement('button');
    minBtn.innerHTML = '&#95;'; minBtn.title = 'Minimizar';
    const maxBtn = document.createElement('button');
    maxBtn.innerHTML = '&#9723;'; maxBtn.title = 'Maximizar/Restaurar';
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;'; closeBtn.title = 'Fechar';

    [minBtn, maxBtn, closeBtn].forEach(btn => {
        Object.assign(btn.style, {
            background: 'none', border: 'none', fontSize: '18px',
            cursor: 'pointer', marginLeft: '10px', fontWeight: 'bold',
            lineHeight: '1', color: '#555'
        });
    });

    buttons.append(minBtn, maxBtn, closeBtn);
    header.append(title, buttons);

    content.style.flexGrow = '1';
    content.style.overflow = 'hidden'; // O conteúdo interno terá scroll
    content.style.padding = '0';
    content.classList.add('bg-gray-50');

    modal.prepend(header);

    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    let originalState = {};

    header.onmousedown = function(e) {
        if (e.target.tagName === 'BUTTON') return;
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    };

    function elementDrag(e) {
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        modal.style.top = (modal.offsetTop - pos2) + "px";
        modal.style.left = (modal.offsetLeft - pos1) + "px";
        modal.style.transform = 'none';
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
    }

    closeBtn.onclick = () => modal.classList.add('hidden');

    maxBtn.onclick = () => {
        if (modal.classList.contains('maximized')) {
            Object.assign(modal.style, originalState);
            modal.classList.remove('maximized');
            maxBtn.innerHTML = '&#9723;';
        } else {
            originalState = { width: modal.style.width, height: modal.style.height, top: modal.style.top, left: modal.style.left, transform: modal.style.transform };
            Object.assign(modal.style, { width: '100vw', height: '100vh', top: '0px', left: '0px', transform: 'none', borderRadius: '0' });
            modal.classList.add('maximized');
            maxBtn.innerHTML = '&#10064;';
        }
    };
    
    minBtn.onclick = () => {
        const isMinimized = modal.classList.toggle('minimized');
        if (isMinimized) {
            originalState.height = modal.style.height;
            content.style.display = 'none';
            modal.style.height = header.offsetHeight + 'px';
            modal.style.resize = 'none';
        } else {
            content.style.display = 'block';
            modal.style.height = originalState.height || '90vh';
            modal.style.resize = 'both';
        }
    };
}

let chartInstances = {};

function destroyCharts() {
    Object.values(chartInstances).forEach(chart => {
        if (chart) chart.destroy();
    });
    chartInstances = {};
}

function getTimeDifferenceInMinutes(startTimeISO, endTimeISO) {
    if (!startTimeISO || !endTimeISO) return null;
    const start = new Date(startTimeISO);
    const end = new Date(endTimeISO);
    if (isNaN(start) || isNaN(end)) return null;
    return Math.round((end - start) / 60000);
}

function renderStatisticsModal(allAssisted, useDelegationFlow, pautaName) {
    const modal = document.getElementById('statistics-modal');
    const content = document.getElementById('statistics-content');

    if (!modal || !content) {
        console.error("Elementos do modal de estatísticas não encontrados.");
        return;
    }
    
    makeModalInteractive(modal);
    
    const modalTitle = modal.querySelector('#statistics-modal-header span');
    if (modalTitle) modalTitle.textContent = `Estatísticas - ${pautaName}`;

    destroyCharts();
    content.innerHTML = `<div class="flex items-center justify-center h-full"><p class="text-gray-600">Calculando estatísticas...</p></div>`;
    modal.classList.remove('hidden');

    const atendidos = allAssisted.filter(a => a.status === 'atendido');
    const faltosos = allAssisted.filter(a => a.status === 'faltoso');

    const statsByCollaborator = atendidos.reduce((acc, a) => {
        acc[a.attendant || 'Não informado'] = (acc[a.attendant || 'Não informado'] || 0) + 1;
        return acc;
    }, {});

    const statsBySubject = atendidos.reduce((acc, a) => {
        acc[a.subject || 'Não informado'] = (acc[a.subject || 'Não informado'] || 0) + 1;
        if (a.demandas && a.demandas.descricoes) {
            a.demandas.descricoes.forEach(demanda => {
                acc[demanda] = (acc[demanda] || 0) + 1;
            });
        }
        return acc;
    }, {});

    const statsByTime = atendidos.filter(a => a.scheduledTime).reduce((acc, a) => {
        acc[a.scheduledTime] = (acc[a.scheduledTime] || 0) + 1;
        return acc;
    }, {});
    const sortedTimes = Object.keys(statsByTime).sort();
    
    const statsByTimeFaltosos = faltosos.filter(a => a.scheduledTime).reduce((acc, a) => {
        acc[a.scheduledTime] = (acc[a.scheduledTime] || 0) + 1;
        return acc;
    }, {});
    const sortedTimesFaltosos = Object.keys(statsByTimeFaltosos).sort();

    let totalDelegatedMinutes = 0, delegatedCount = 0;
    let totalDirectMinutes = 0, directCount = 0;
    
    atendidos.forEach(a => {
        const minutes = getTimeDifferenceInMinutes(a.arrivalTime, a.attendedTime);
        if (minutes !== null) {
            if (useDelegationFlow && a.inAttendanceTime) {
                totalDelegatedMinutes += minutes;
                delegatedCount++;
            } else {
                totalDirectMinutes += minutes;
                directCount++;
            }
        }
    });

    const avgTimeDelegated = delegatedCount > 0 ? Math.round(totalDelegatedMinutes / delegatedCount) : 0;
    const avgTimeDirect = directCount > 0 ? Math.round(totalDirectMinutes / directCount) : 0;

    const delegationHTML = useDelegationFlow ? `
        <div class="bg-indigo-100 p-3 rounded-lg text-center border border-indigo-200">
            <p class="text-2xl font-bold text-indigo-700">${avgTimeDelegated} min</p>
            <p class="text-xs text-gray-600 mt-1">Tempo Médio (delegação)</p>
        </div>` : '';

    const html = `
    <div class="grid grid-cols-1 lg:grid-cols-4 gap-4 h-full p-4 overflow-hidden">
        <!-- Coluna da Sidebar -->
        <div class="lg:col-span-1 flex flex-col gap-4 overflow-y-auto">
            <!-- Resumo -->
            <div class="bg-white p-4 rounded-lg border">
                <h3 class="text-lg font-semibold text-gray-800 mb-3">Resumo Geral</h3>
                <div class="grid grid-cols-2 gap-3 text-center">
                    <div class="bg-green-100 p-3 rounded-lg border border-green-200"><p class="text-2xl font-bold text-green-700">${atendidos.length}</p><p class="text-xs text-gray-600 mt-1">Atendidos</p></div>
                    <div class="bg-red-100 p-3 rounded-lg border border-red-200"><p class="text-2xl font-bold text-red-700">${faltosos.length}</p><p class="text-xs text-gray-600 mt-1">Faltosos</p></div>
                    <div class="bg-blue-100 p-3 rounded-lg border border-blue-200"><p class="text-2xl font-bold text-blue-700">${avgTimeDirect} min</p><p class="text-xs text-gray-600 mt-1">Tempo Médio (direto)</p></div>
                    ${delegationHTML}
                </div>
            </div>
            <!-- Exportar -->
            <div class="bg-white p-4 rounded-lg border">
                <h3 class="text-lg font-semibold text-gray-800 mb-3">Exportar Relatório</h3>
                <div class="space-y-2 text-sm">
                    <label class="flex items-center"><input type="checkbox" id="export-general" class="mr-2 h-4 w-4 rounded" checked> Resumo</label>
                    <label class="flex items-center"><input type="checkbox" id="export-collaborators" class="mr-2 h-4 w-4 rounded" checked> Por Colaborador</label>
                    <label class="flex items-center"><input type="checkbox" id="export-subjects" class="mr-2 h-4 w-4 rounded" checked> Por Assunto</label>
                    <label class="flex items-center"><input type="checkbox" id="export-times" class="mr-2 h-4 w-4 rounded" checked> Atend. por Horário</label>
                    <label class="flex items-center"><input type="checkbox" id="export-absentees-time" class="mr-2 h-4 w-4 rounded" checked> Faltosos por Horário</label>
                </div>
                <div class="mt-4">
                    <button id="export-stats-pdf-btn" class="w-full bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 text-sm transition-colors">Gerar PDF</button>
                </div>
            </div>
             <!-- Tabelas -->
            ${sortedTimes.length > 0 ? `
            <div class="bg-white p-4 rounded-lg border">
                <h3 class="text-md font-semibold text-gray-800 mb-2">Atendimentos por Horário</h3>
                <div class="max-h-40 overflow-y-auto">
                    <table class="w-full text-sm text-left">
                        <thead class="text-xs text-gray-700 uppercase bg-gray-100 sticky top-0"><tr><th class="px-4 py-2">Horário</th><th class="px-4 py-2 text-right">Qtd</th></tr></thead>
                        <tbody>${sortedTimes.map(time => `<tr class="border-b"><td class="px-4 py-2 font-medium">${time}</td><td class="px-4 py-2 text-right">${statsByTime[time]}</td></tr>`).join('')}</tbody>
                    </table>
                </div>
            </div>` : ''}
            ${sortedTimesFaltosos.length > 0 ? `
            <div class="bg-white p-4 rounded-lg border">
                <h3 class="text-md font-semibold text-red-800 mb-2">Faltosos por Horário</h3>
                <div class="max-h-40 overflow-y-auto">
                    <table class="w-full text-sm text-left">
                        <thead class="text-xs text-red-700 uppercase bg-red-100 sticky top-0"><tr><th class="px-4 py-2">Horário</th><th class="px-4 py-2 text-right">Qtd</th></tr></thead>
                        <tbody>${sortedTimesFaltosos.map(time => `<tr class="border-b"><td class="px-4 py-2 font-medium">${time}</td><td class="px-4 py-2 text-right">${statsByTimeFaltosos[time]}</td></tr>`).join('')}</tbody>
                    </table>
                </div>
            </div>` : ''}
        </div>
        <!-- Coluna Principal com Gráficos -->
        <div class="lg:col-span-3 flex flex-col gap-4 overflow-y-auto">
            <div class="bg-white p-4 rounded-lg border flex-1 flex flex-col">
                <h3 class="text-lg font-semibold text-gray-800 mb-2">Atendimentos por Colaborador</h3>
                <div class="relative flex-grow min-h-[300px]"><canvas id="collaboratorChart"></canvas></div>
            </div>
            <div class="bg-white p-4 rounded-lg border flex-1 flex flex-col">
                <h3 class="text-lg font-semibold text-gray-800 mb-2">Demandas por Assunto</h3>
                <div class="relative flex-grow min-h-[300px]"><canvas id="subjectChart"></canvas></div>
            </div>
        </div>
    </div>
    `;
    content.innerHTML = html;

    try {
        if (Object.keys(statsByCollaborator).length > 0) {
            const ctxCollaborator = document.getElementById('collaboratorChart').getContext('2d');
            chartInstances.collaboratorChart = new Chart(ctxCollaborator, {
                type: 'doughnut',
                data: { labels: Object.keys(statsByCollaborator), datasets: [{ data: Object.values(statsByCollaborator), backgroundColor: ['#22c55e', '#3b82f6', '#f97316', '#8b5cf6', '#ec4899', '#6b7280', '#f59e0b', '#10b981'], hoverOffset: 4 }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
            });
        }
        if (Object.keys(statsBySubject).length > 0) {
            const ctxSubject = document.getElementById('subjectChart').getContext('2d');
            chartInstances.subjectChart = new Chart(ctxSubject, {
                type: 'bar',
                data: { labels: Object.keys(statsBySubject), datasets: [{ label: 'Nº de Demandas', data: Object.values(statsBySubject), backgroundColor: '#3b82f6' }] },
                options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } } }
            });
        }
    } catch (e) {
        console.error("Erro ao renderizar gráficos:", e);
    }
    
    document.getElementById('export-stats-pdf-btn').addEventListener('click', () => {
        exportStatisticsToPDF(pautaName, {
            atendidosCount: atendidos.length, faltososCount: faltosos.length,
            avgTimeDirect, avgTimeDelegated, useDelegationFlow,
            statsByCollaborator, statsBySubject,
            statsByTime: sortedTimes.map(time => ({ time, count: statsByTime[time] })),
            statsByTimeFaltosos: sortedTimesFaltosos.map(time => ({ time, count: statsByTimeFaltosos[time] }))
        });
    });
}

async function exportStatisticsToPDF(pautaName, statsData) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    let yPos = 20;

    doc.setFontSize(18);
    doc.text(`Estatísticas - ${pautaName}`, 14, yPos);
    yPos += 10;
    doc.setFontSize(12);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, yPos);
    yPos += 15;
    
    const addSection = (title, startY) => {
        if (startY > 250) {
             doc.addPage();
             startY = 20;
        }
        doc.setFontSize(14);
        doc.text(title, 14, startY);
        return startY + 8;
    };
    const addChart = (chartId, title) => {
        const checkboxId = chartId === 'collaboratorChart' ? 'export-collaborators' : 'export-subjects';
        if (chartInstances[chartId] && document.getElementById(checkboxId).checked) {
            yPos = addSection(title, yPos);
            const canvas = document.getElementById(chartId);
            const imgData = canvas.toDataURL('image/png', 1.0);
            const imgWidth = 180;
            const imgHeight = canvas.height * imgWidth / canvas.width;
            if (yPos + imgHeight > 280) {
                 doc.addPage();
                 yPos = 20;
            }
            doc.addImage(imgData, 'PNG', 14, yPos, imgWidth, imgHeight);
            yPos += imgHeight + 10;
        }
    };

    if (document.getElementById('export-general').checked) {
        yPos = addSection("Resumo Geral", yPos);
        doc.setFontSize(12);
        let summaryText = `- Total de Atendidos: ${statsData.atendidosCount}\n- Total de Faltosos: ${statsData.faltososCount}\n- Tempo Médio (direto): ${statsData.avgTimeDirect} min`;
        if (statsData.useDelegationFlow) {
            summaryText += `\n- Tempo Médio (com delegação): ${statsData.avgTimeDelegated} min`;
        }
        const splitText = doc.splitTextToSize(summaryText, 180);
        doc.text(splitText, 14, yPos);
        yPos += doc.getTextDimensions(splitText).h + 10;
    }
    
    addChart('collaboratorChart', 'Atendimentos por Colaborador');
    addChart('subjectChart', 'Demandas por Assunto');

    const addTableToPdf = (title, data, headStyles, checkboxId) => {
        if (document.getElementById(checkboxId).checked && data.length > 0) {
             yPos = addSection(title, yPos);
             doc.autoTable({
                 startY: yPos,
                 head: [['Horário', 'Quantidade']],
                 body: data.map(item => [item.time, item.count]),
                 theme: 'striped',
                 headStyles: headStyles || {},
                 didDrawPage: (data) => { yPos = data.cursor.y; }
             });
             yPos = doc.autoTable.previous.finalY + 10;
        }
    };
    
    addTableToPdf("Atendimentos por Horário", statsData.statsByTime, {}, 'export-times');
    addTableToPdf("Faltosos por Horário", statsData.statsByTimeFaltosos, { fillColor: [220, 38, 38] }, 'export-absentees-time');

    doc.save(`estatisticas_${pautaName.replace(/\s+/g, '_')}.pdf`);
}

