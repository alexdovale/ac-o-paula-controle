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
    modal.classList.add('interactive-modal-init');

    const content = document.getElementById('statistics-content');
    if (!content) {
        console.error("#statistics-content não encontrado. Não é possível tornar o modal interativo.");
        return;
    }
    
    Object.assign(modal.style, {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '80vw',
        height: '80vh',
        maxWidth: '1200px',
        maxHeight: '90vh',
        resize: 'both',
        overflow: 'hidden',
        border: '1px solid #ccc',
        boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
        borderRadius: '8px',
        minWidth: '400px',
        minHeight: '300px',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'white'
    });
    
    // Evita criar cabeçalho duplicado
    if (document.getElementById('statistics-modal-header')) {
        return;
    }
    
    const header = document.createElement('div');
    header.id = 'statistics-modal-header';
    Object.assign(header.style, {
        backgroundColor: '#f1f1f1',
        padding: '10px 15px',
        cursor: 'move',
        borderBottom: '1px solid #ddd',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTopLeftRadius: '8px',
        borderTopRightRadius: '8px'
    });
    
    const title = document.createElement('span');
    title.textContent = 'Estatísticas da Pauta';
    title.style.fontWeight = 'bold';
    title.style.color = '#333';

    const buttons = document.createElement('div');
    
    const minBtn = document.createElement('button');
    minBtn.innerHTML = '&#95;'; // Underscore
    minBtn.title = 'Minimizar';

    const maxBtn = document.createElement('button');
    maxBtn.innerHTML = '&#9723;'; // Square
    maxBtn.title = 'Maximizar/Restaurar';

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;'; // 'X'
    closeBtn.title = 'Fechar';

    [minBtn, maxBtn, closeBtn].forEach(btn => {
        Object.assign(btn.style, {
            background: 'none',
            border: 'none',
            fontSize: '18px',
            cursor: 'pointer',
            marginLeft: '10px',
            fontWeight: 'bold',
            lineHeight: '1',
            color: '#555'
        });
    });

    buttons.append(minBtn, maxBtn, closeBtn);
    header.append(title, buttons);

    content.style.flexGrow = '1';
    content.style.overflowY = 'auto';
    content.style.padding = '20px';

    modal.prepend(header);

    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    let originalState = {};
    let isMinimized = false;

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
            Object.assign(modal.style, { width: '100vw', height: '100vh', top: '0px', left: '0px', transform: 'none' });
            modal.classList.add('maximized');
            maxBtn.innerHTML = '&#10064;';
        }
    };
    
    minBtn.onclick = () => {
        isMinimized = !isMinimized;
        if (isMinimized) {
            content.style.display = 'none';
            modal.style.height = header.offsetHeight + 'px';
            modal.style.resize = 'none';
        } else {
            content.style.display = 'block';
            modal.style.height = originalState.height || '80vh';
            modal.style.resize = 'both';
        }
    };
}


// Armazena as instâncias dos gráficos para que possam ser destruídas antes de recriar
let chartInstances = {};

/**
 * Destrói todas as instâncias de gráficos ativas para evitar conflitos de renderização.
 */
function destroyCharts() {
    Object.values(chartInstances).forEach(chart => {
        if (chart) chart.destroy();
    });
    chartInstances = {};
}

/**
 * Calcula a diferença de tempo em minutos entre duas datas ISO.
 */
function getTimeDifferenceInMinutes(startTimeISO, endTimeISO) {
    if (!startTimeISO || !endTimeISO) return null;
    const start = new Date(startTimeISO);
    const end = new Date(endTimeISO);
    if (isNaN(start) || isNaN(end)) return null;
    return Math.round((end - start) / 60000);
}

/**
 * Função principal que calcula e renderiza as estatísticas no modal.
 */
function renderStatisticsModal(allAssisted, useDelegationFlow, pautaName) {
    const modal = document.getElementById('statistics-modal');
    const content = document.getElementById('statistics-content');

    if (!modal || !content) {
        console.error("Elementos do modal de estatísticas não encontrados no DOM.");
        return;
    }
    
    makeModalInteractive(modal);
    
    const modalTitle = modal.querySelector('#statistics-modal-header span');
    if (modalTitle) {
        modalTitle.textContent = `Estatísticas - ${pautaName}`;
    }

    destroyCharts();
    content.innerHTML = `<div class="text-center p-8"><p class="text-gray-600">Calculando estatísticas...</p></div>`;
    modal.classList.remove('hidden');

    const atendidos = allAssisted.filter(a => a.status === 'atendido');
    const faltosos = allAssisted.filter(a => a.status === 'faltoso');

    const statsByCollaborator = atendidos.reduce((acc, a) => {
        const collaborator = a.attendant || 'Não informado';
        acc[collaborator] = (acc[collaborator] || 0) + 1;
        return acc;
    }, {});

    const statsBySubject = atendidos.reduce((acc, a) => {
        const mainSubject = a.subject || 'Não informado';
        acc[mainSubject] = (acc[mainSubject] || 0) + 1;
        if (a.demandas && a.demandas.descricoes) {
            a.demandas.descricoes.forEach(demanda => {
                acc[demanda] = (acc[demanda] || 0) + 1;
            });
        }
        return acc;
    }, {});

    const statsByTime = atendidos
        .filter(a => a.scheduledTime)
        .reduce((acc, a) => {
            acc[a.scheduledTime] = (acc[a.scheduledTime] || 0) + 1;
            return acc;
        }, {});
    const sortedTimes = Object.keys(statsByTime).sort();
    
    const statsByTimeFaltosos = faltosos
        .filter(a => a.scheduledTime)
        .reduce((acc, a) => {
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
        <div class="bg-indigo-50 p-3 rounded-lg text-center">
            <p class="text-2xl font-bold text-indigo-700">${avgTimeDelegated} min</p>
            <p class="text-sm text-gray-600 mt-1">Tempo Médio (delegação)</p>
        </div>` : '';

    const html = `
        <div class="space-y-6">
            <div>
                <h3 class="text-lg font-semibold text-gray-800 mb-2">Resumo Geral</h3>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                    <div class="bg-green-50 p-3 rounded-lg"><p class="text-2xl font-bold text-green-700">${atendidos.length}</p><p class="text-sm text-gray-600 mt-1">Atendidos</p></div>
                    <div class="bg-red-50 p-3 rounded-lg"><p class="text-2xl font-bold text-red-700">${faltosos.length}</p><p class="text-sm text-gray-600 mt-1">Faltosos</p></div>
                    <div class="bg-blue-50 p-3 rounded-lg"><p class="text-2xl font-bold text-blue-700">${avgTimeDirect} min</p><p class="text-sm text-gray-600 mt-1">Tempo Médio (direto)</p></div>
                    ${delegationHTML}
                </div>
            </div>
            
            <div class="bg-gray-100 p-4 rounded-lg">
                <h3 class="text-lg font-semibold text-gray-800 mb-3">Exportar para PDF</h3>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                    <label class="flex items-center"><input type="checkbox" id="export-general" class="mr-2" checked> Resumo</label>
                    <label class="flex items-center"><input type="checkbox" id="export-collaborators" class="mr-2" checked> Por Colaborador</label>
                    <label class="flex items-center"><input type="checkbox" id="export-subjects" class="mr-2" checked> Por Assunto</label>
                    <label class="flex items-center"><input type="checkbox" id="export-times" class="mr-2" checked> Atend. por Horário</label>
                    <label class="flex items-center"><input type="checkbox" id="export-absentees-time" class="mr-2" checked> Faltosos por Horário</label>
                </div>
                <div class="mt-4 text-right">
                    <button id="export-stats-pdf-btn" class="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 text-sm">Gerar PDF</button>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                    <h3 class="text-lg font-semibold text-gray-800 mb-2">Atendimentos por Colaborador</h3>
                    <canvas id="collaboratorChart"></canvas>
                </div>
                <div>
                    <h3 class="text-lg font-semibold text-gray-800 mb-2">Demandas por Assunto</h3>
                    <canvas id="subjectChart"></canvas>
                </div>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                ${sortedTimes.length > 0 ? `
                <div>
                    <h3 class="text-lg font-semibold text-gray-800 mb-2">Atendimentos por Horário</h3>
                    <div class="max-h-64 overflow-y-auto bg-gray-50 p-3 rounded-lg border">
                        <table class="w-full text-sm text-left">
                            <thead class="text-xs text-gray-700 uppercase bg-gray-100"><tr><th class="px-4 py-2">Horário</th><th class="px-4 py-2">Quantidade</th></tr></thead>
                            <tbody>
                                ${sortedTimes.map(time => `<tr class="border-b"><td class="px-4 py-2 font-medium">${time}</td><td class="px-4 py-2">${statsByTime[time]}</td></tr>`).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>` : '<div></div>'}

                ${sortedTimesFaltosos.length > 0 ? `
                <div>
                    <h3 class="text-lg font-semibold text-gray-800 mb-2">Faltosos por Horário</h3>
                    <div class="max-h-64 overflow-y-auto bg-red-50 p-3 rounded-lg border border-red-200">
                        <table class="w-full text-sm text-left">
                            <thead class="text-xs text-red-700 uppercase bg-red-100"><tr><th class="px-4 py-2">Horário</th><th class="px-4 py-2">Quantidade</th></tr></thead>
                            <tbody>
                                ${sortedTimesFaltosos.map(time => `<tr class="border-b border-red-200"><td class="px-4 py-2 font-medium">${time}</td><td class="px-4 py-2">${statsByTimeFaltosos[time]}</td></tr>`).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>` : ''}
            </div>
        </div>
    `;
    content.innerHTML = html;

    try {
        if (Object.keys(statsByCollaborator).length > 0) {
            const ctxCollaborator = document.getElementById('collaboratorChart').getContext('2d');
            chartInstances.collaboratorChart = new Chart(ctxCollaborator, {
                type: 'doughnut',
                data: { labels: Object.keys(statsByCollaborator), datasets: [{ label: 'Atendimentos', data: Object.values(statsByCollaborator), backgroundColor: ['#22c55e', '#3b82f6', '#f97316', '#8b5cf6', '#ec4899', '#6b7280'], hoverOffset: 4 }] },
                options: { responsive: true, maintainAspectRatio: true }
            });
        }
        if (Object.keys(statsBySubject).length > 0) {
            const ctxSubject = document.getElementById('subjectChart').getContext('2d');
            chartInstances.subjectChart = new Chart(ctxSubject, {
                type: 'bar',
                data: { labels: Object.keys(statsBySubject), datasets: [{ label: 'Nº de Demandas', data: Object.values(statsBySubject), backgroundColor: '#3b82f6' }] },
                options: { indexAxis: 'y', responsive: true, maintainAspectRatio: true }
            });
        }
    } catch (e) {
        console.error("Erro ao renderizar gráficos:", e);
        content.innerHTML += `<p class="text-red-500 text-center mt-4">Ocorreu um erro ao gerar os gráficos.</p>`;
    }
    
    document.getElementById('export-stats-pdf-btn').addEventListener('click', () => {
        const dataToExport = {
            atendidosCount: atendidos.length, faltososCount: faltosos.length,
            avgTimeDirect, avgTimeDelegated, useDelegationFlow,
            statsByCollaborator, statsBySubject,
            statsByTime: sortedTimes.map(time => ({ time, count: statsByTime[time] })),
            statsByTimeFaltosos: sortedTimesFaltosos.map(time => ({ time, count: statsByTimeFaltosos[time] }))
        };
        exportStatisticsToPDF(pautaName, dataToExport);
    });
}

/**
 * Gera e baixa um arquivo PDF com as estatísticas selecionadas.
 */
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
        if (startY + 16 > doc.internal.pageSize.getHeight() - 20) {
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
            const imgData = canvas.toDataURL('image/png');
            const imgWidth = 180;
            const imgHeight = canvas.height * imgWidth / canvas.width;
            if (yPos + imgHeight > doc.internal.pageSize.getHeight() - 20) {
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
        
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 14;
        const maxWidth = pageWidth - (margin * 2);
        const splitText = doc.splitTextToSize(summaryText, maxWidth);
        
        doc.text(splitText, margin, yPos);
        
        const textHeight = doc.getTextDimensions(splitText).h;
        yPos += textHeight + 10;
    }
    
    addChart('collaboratorChart', 'Atendimentos por Colaborador');
    addChart('subjectChart', 'Demandas por Assunto');

    if (document.getElementById('export-times').checked && statsData.statsByTime.length > 0) {
        yPos = addSection("Atendimentos por Horário", yPos);
        doc.autoTable({
            startY: yPos,
            head: [['Horário', 'Quantidade']],
            body: statsData.statsByTime.map(item => [item.time, item.count]),
            theme: 'striped',
            didDrawPage: (data) => { yPos = data.cursor.y; }
        });
        yPos = doc.autoTable.previous.finalY + 10;
    }
    
    if (document.getElementById('export-absentees-time').checked && statsData.statsByTimeFaltosos.length > 0) {
        yPos = addSection("Faltosos por Horário", yPos);
        doc.autoTable({
            startY: yPos,
            head: [['Horário', 'Quantidade']],
            body: statsData.statsByTimeFaltosos.map(item => [item.time, item.count]),
            theme: 'striped',
            headStyles: { fillColor: [220, 38, 38] }, // Red header
            didDrawPage: (data) => { yPos = data.cursor.y; }
        });
        yPos = doc.autoTable.previous.finalY;
    }

    doc.save(`estatisticas_${pautaName.replace(/\s+/g, '_')}.pdf`);
}

