/**
 * estatisticas.js
 * * Este script lida com o cálculo e a exibição de estatísticas para a pauta,
 * incluindo a geração de gráficos e a exportação para PDF.
 * * COMO INTEGRAR:
 * 1. Adicione a biblioteca Chart.js ao seu `index.html` (antes do script principal):
 * <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
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

// Armazena as instâncias dos gráficos para que possam ser destruídas antes de recriar
let chartInstances = {};

/**
 * Destrói todas as instâncias de gráficos ativas para evitar conflitos de renderização.
 */
function destroyCharts() {
    Object.values(chartInstances).forEach(chart => {
        if (chart) {
            chart.destroy();
        }
    });
    chartInstances = {};
}

/**
 * Calcula a diferença de tempo em minutos entre duas datas ISO.
 * @param {string} startTimeISO - A data/hora de início em formato ISO.
 * @param {string} endTimeISO - A data/hora de fim em formato ISO.
 * @returns {number|null} A diferença em minutos ou null se os tempos forem inválidos.
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
 * @param {Array} allAssisted - O array com todos os registros de assistidos da pauta.
 * @param {boolean} useDelegationFlow - Indica se a pauta utiliza o fluxo de delegação.
 * @param {string} pautaName - O nome da pauta atual para usar nos títulos.
 */
function renderStatisticsModal(allAssisted, useDelegationFlow, pautaName) {
    const modal = document.getElementById('statistics-modal');
    const content = document.getElementById('statistics-content');

    if (!modal || !content) {
        console.error("Elementos do modal de estatísticas não encontrados no DOM.");
        return;
    }

    // Limpa gráficos anteriores e exibe o estado de carregamento
    destroyCharts();
    content.innerHTML = `<div class="text-center p-8"><p class="text-gray-600">Calculando estatísticas...</p></div>`;
    modal.classList.remove('hidden');

    // --- 1. CÁLCULOS ---
    const atendidos = allAssisted.filter(a => a.status === 'atendido');
    const faltosos = allAssisted.filter(a => a.status === 'faltoso');

    // Estatísticas por colaborador
    const statsByCollaborator = atendidos.reduce((acc, a) => {
        const collaborator = a.attendant || 'Não informado';
        acc[collaborator] = (acc[collaborator] || 0) + 1;
        return acc;
    }, {});

    // Estatísticas por assunto (principal + demandas adicionais)
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

    // Estatísticas por horário agendado (apenas para atendidos que tinham horário)
    const statsByTime = atendidos
        .filter(a => a.scheduledTime)
        .reduce((acc, a) => {
            acc[a.scheduledTime] = (acc[a.scheduledTime] || 0) + 1;
            return acc;
        }, {});
    const sortedTimes = Object.keys(statsByTime).sort();

    // Cálculo de tempo médio de atendimento
    let totalDelegatedMinutes = 0, delegatedCount = 0;
    let totalDirectMinutes = 0, directCount = 0;
    
    atendidos.forEach(a => {
        const minutes = getTimeDifferenceInMinutes(a.arrivalTime, a.attendedTime);
        if (minutes !== null) {
            // Se `inAttendanceTime` existe, passou pela delegação
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

    // --- 2. RENDERIZAÇÃO DO HTML ---
    const delegationHTML = useDelegationFlow ? `
        <div class="bg-indigo-50 p-3 rounded-lg text-center">
            <p class="text-2xl font-bold text-indigo-700">${avgTimeDelegated} min</p>
            <p class="text-sm text-gray-600 mt-1">Tempo Médio (com delegação)</p>
        </div>` : '';

    const html = `
        <div class="space-y-6">
            <!-- Resumo Geral -->
            <div>
                <h3 class="text-lg font-semibold text-gray-800 mb-2">Resumo Geral</h3>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                    <div class="bg-green-50 p-3 rounded-lg"><p class="text-2xl font-bold text-green-700">${atendidos.length}</p><p class="text-sm text-gray-600 mt-1">Atendidos</p></div>
                    <div class="bg-red-50 p-3 rounded-lg"><p class="text-2xl font-bold text-red-700">${faltosos.length}</p><p class="text-sm text-gray-600 mt-1">Faltosos</p></div>
                    <div class="bg-blue-50 p-3 rounded-lg"><p class="text-2xl font-bold text-blue-700">${avgTimeDirect} min</p><p class="text-sm text-gray-600 mt-1">Tempo Médio (direto)</p></div>
                    ${delegationHTML}
                </div>
            </div>
            
            <!-- Opções de Exportação -->
            <div class="bg-gray-100 p-4 rounded-lg">
                <h3 class="text-lg font-semibold text-gray-800 mb-3">Exportar para PDF</h3>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                    <label class="flex items-center"><input type="checkbox" id="export-general" class="mr-2" checked> Resumo</label>
                    <label class="flex items-center"><input type="checkbox" id="export-collaborators" class="mr-2" checked> Atend. por Colaborador</label>
                    <label class="flex items-center"><input type="checkbox" id="export-subjects" class="mr-2" checked> Demandas por Assunto</label>
                    <label class="flex items-center"><input type="checkbox" id="export-times" class="mr-2" checked> Atend. por Horário</label>
                </div>
                <div class="mt-4 text-right">
                    <button id="export-stats-pdf-btn" class="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 text-sm">Gerar PDF</button>
                </div>
            </div>

            <!-- Gráficos e Tabelas -->
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
            
            ${sortedTimes.length > 0 ? `
            <div>
                <h3 class="text-lg font-semibold text-gray-800 mb-2">Atendimentos por Horário Agendado</h3>
                <div class="max-h-64 overflow-y-auto bg-gray-50 p-3 rounded-lg border">
                    <table class="w-full text-sm text-left">
                        <thead class="text-xs text-gray-700 uppercase bg-gray-100"><tr><th class="px-4 py-2">Horário</th><th class="px-4 py-2">Quantidade</th></tr></thead>
                        <tbody>
                            ${sortedTimes.map(time => `
                            <tr class="border-b"><td class="px-4 py-2 font-medium">${time}</td><td class="px-4 py-2">${statsByTime[time]}</td></tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>` : ''}
        </div>
    `;
    content.innerHTML = html;

    // --- 3. CRIAÇÃO DOS GRÁFICOS ---
    try {
        if (Object.keys(statsByCollaborator).length > 0) {
            const ctxCollaborator = document.getElementById('collaboratorChart').getContext('2d');
            chartInstances.collaboratorChart = new Chart(ctxCollaborator, {
                type: 'doughnut',
                data: {
                    labels: Object.keys(statsByCollaborator),
                    datasets: [{
                        label: 'Atendimentos',
                        data: Object.values(statsByCollaborator),
                        backgroundColor: ['#22c55e', '#3b82f6', '#f97316', '#8b5cf6', '#ec4899', '#6b7280'],
                        hoverOffset: 4
                    }]
                },
                options: { responsive: true, maintainAspectRatio: true }
            });
        }

        if (Object.keys(statsBySubject).length > 0) {
            const ctxSubject = document.getElementById('subjectChart').getContext('2d');
            chartInstances.subjectChart = new Chart(ctxSubject, {
                type: 'bar',
                data: {
                    labels: Object.keys(statsBySubject),
                    datasets: [{
                        label: 'Nº de Demandas',
                        data: Object.values(statsBySubject),
                        backgroundColor: '#3b82f6'
                    }]
                },
                options: { indexAxis: 'y', responsive: true, maintainAspectRatio: true }
            });
        }
    } catch (e) {
        console.error("Erro ao renderizar gráficos:", e);
        content.innerHTML += `<p class="text-red-500 text-center mt-4">Ocorreu um erro ao gerar os gráficos.</p>`;
    }
    
    // --- 4. EVENT LISTENER PARA EXPORTAÇÃO ---
    document.getElementById('export-stats-pdf-btn').addEventListener('click', () => {
        const dataToExport = {
            atendidosCount: atendidos.length,
            faltososCount: faltosos.length,
            avgTimeDirect,
            avgTimeDelegated,
            useDelegationFlow,
            statsByCollaborator,
            statsBySubject,
            statsByTime: sortedTimes.map(time => ({ time, count: statsByTime[time] }))
        };
        exportStatisticsToPDF(pautaName, dataToExport);
    });
}

/**
 * Gera e baixa um arquivo PDF com as estatísticas selecionadas.
 * @param {string} pautaName - O nome da pauta para o título do PDF.
 * @param {object} statsData - Um objeto contendo todos os dados calculados.
 */
async function exportStatisticsToPDF(pautaName, statsData) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    let yPos = 20;

    // Título do Documento
    doc.setFontSize(18);
    doc.text(`Estatísticas - ${pautaName}`, 14, yPos);
    yPos += 10;
    doc.setFontSize(12);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, yPos);
    yPos += 15;
    
    // Funções auxiliares para adicionar conteúdo
    const addSection = (title) => {
        doc.setFontSize(14);
        doc.text(title, 14, yPos);
        yPos += 8;
    };
    const addChart = (chartId, title) => {
        if (chartInstances[chartId]) {
            addSection(title);
            const canvas = document.getElementById(chartId);
            const imgData = canvas.toDataURL('image/png');
            // A largura da imagem no PDF pode precisar de ajuste
            const imgWidth = 180;
            const imgHeight = canvas.height * imgWidth / canvas.width;
            doc.addImage(imgData, 'PNG', 14, yPos, imgWidth, imgHeight);
            yPos += imgHeight + 10;
        }
    };

    // Adiciona seções com base nos checkboxes
    if (document.getElementById('export-general').checked) {
        addSection("Resumo Geral");
        doc.setFontSize(12);
        let summaryText = `- Total de Atendidos: ${statsData.atendidosCount}\n- Total de Faltosos: ${statsData.faltososCount}\n- Tempo Médio (direto): ${statsData.avgTimeDirect} min`;
        if (statsData.useDelegationFlow) {
            summaryText += `\n- Tempo Médio (com delegação): ${statsData.avgTimeDelegated} min`;
        }
        doc.text(summaryText, 14, yPos);
        yPos += 30;
    }
    
    if (document.getElementById('export-collaborators').checked) {
        addChart('collaboratorChart', 'Atendimentos por Colaborador');
    }

    if (document.getElementById('export-subjects').checked) {
        addChart('subjectChart', 'Demandas por Assunto');
    }

    if (document.getElementById('export-times').checked && statsData.statsByTime.length > 0) {
        addSection("Atendimentos por Horário Agendado");
        doc.autoTable({
            startY: yPos,
            head: [['Horário', 'Quantidade']],
            body: statsData.statsByTime.map(item => [item.time, item.count]),
        });
    }

    doc.save(`estatisticas_${pautaName.replace(/\s+/g, '_')}.pdf`);
}
