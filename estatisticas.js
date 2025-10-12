/**
 * estatisticas.js - Versão Módulo Corrigida e com PDF Melhorado
 * Este arquivo deve ser importado pelo seu script principal.
 * Requer: jspdf, jspdf-autotable, chart.js
 */

function makeModalInteractive(modal) {
    if (!modal || modal.classList.contains('interactive-modal-init')) {
        return;
    }
    modal.classList.add('interactive-modal-init', 'bg-white');

    const content = document.getElementById('statistics-content');
    if (!content) {
        // Se o conteúdo não existir no HTML, cria-o.
        // Isso é crucial para a primeira inicialização.
        const newContent = document.createElement('div');
        newContent.id = 'statistics-content';
        modal.appendChild(newContent);
    }


    Object.assign(modal.style, {
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)', width: '90vw', height: '90vh',
        maxWidth: '1400px', maxHeight: '95vh', resize: 'both',
        overflow: 'hidden', border: '1px solid #ddd',
        boxShadow: '0 5px 25px rgba(0,0,0,0.2)', borderRadius: '12px',
        minWidth: '600px', minHeight: '500px', display: 'flex',
        flexDirection: 'column',
        padding: '0'
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
    minBtn.innerHTML = '&#95;';
    minBtn.title = 'Minimizar';
    const maxBtn = document.createElement('button');
    maxBtn.innerHTML = '&#9723;';
    maxBtn.title = 'Maximizar/Restaurar';
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    closeBtn.title = 'Fechar';

    [minBtn, maxBtn, closeBtn].forEach(btn => {
        Object.assign(btn.style, {
            background: 'none', border: 'none', fontSize: '18px',
            cursor: 'pointer', marginLeft: '10px', fontWeight: 'bold',
            lineHeight: '1', color: '#555'
        });
    });

    buttons.append(minBtn, maxBtn, closeBtn);
    header.append(title, buttons);

    const contentDiv = document.getElementById('statistics-content');
    if (contentDiv) {
        contentDiv.style.flexGrow = '1';
        contentDiv.style.overflow = 'hidden';
        contentDiv.style.padding = '0';
        contentDiv.classList.add('bg-gray-50');
    }
    
    modal.prepend(header);

    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    let originalState = {};

    header.onmousedown = function (e) {
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

    closeBtn.onclick = () => modal.style.display = 'none';

    maxBtn.onclick = () => {
        if (modal.classList.contains('maximized')) {
            Object.assign(modal.style, originalState);
            modal.classList.remove('maximized');
            maxBtn.innerHTML = '&#9723;';
        } else {
            originalState = {
                width: modal.style.width, height: modal.style.height, top: modal.style.top, left: modal.style.left, transform: modal.style.transform
            };
            Object.assign(modal.style, {
                width: '100vw', height: '100vh', top: '0px', left: '0px', transform: 'none', borderRadius: '0'
            });
            modal.classList.add('maximized');
            maxBtn.innerHTML = '&#10064;';
        }
    };

    minBtn.onclick = () => {
        const contentDiv = document.getElementById('statistics-content');
        const isMinimized = modal.classList.toggle('minimized');
        if (isMinimized) {
            originalState.height = modal.style.height;
            if(contentDiv) contentDiv.style.display = 'none';
            modal.style.height = header.offsetHeight + 'px';
            modal.style.resize = 'none';
        } else {
            if(contentDiv) contentDiv.style.display = 'block';
            modal.style.height = originalState.height || '90vh';
            modal.style.resize = 'both';
        }
    };
}

function getTimeDifferenceInMinutes(startTimeISO, endTimeISO) {
    if (!startTimeISO || !endTimeISO) return null;
    const start = new Date(startTimeISO);
    const end = new Date(endTimeISO);
    if (isNaN(start) || isNaN(end)) return null;
    return Math.round((end - start) / 60000);
}

// FUNÇÃO PRINCIPAL QUE SERÁ USADA PELO SEU SCRIPT
export function renderStatisticsModal(allAssisted, useDelegationFlow, pautaName) {
    const modal = document.getElementById('statistics-modal');

    if (!modal) {
        console.error("Elemento do modal de estatísticas '#statistics-modal' não encontrado.");
        return;
    }

    // --- INÍCIO DA CORREÇÃO ---
    let content = document.getElementById('statistics-content');
    
    // Garante que o modal seja interativo e tenha a estrutura base na primeira chamada.
    makeModalInteractive(modal);
    
    // Atribui a referência a 'content' novamente, caso tenha sido criada por makeModalInteractive
    if (!content) {
        content = document.getElementById('statistics-content');
    }

    // Garante que o estado visual está correto ao reabrir.
    if (modal.classList.contains('minimized')) {
        modal.classList.remove('minimized');
        modal.style.resize = 'both';
    }
    if (content) {
        content.style.display = 'block'; // Garante que o conteúdo é visível
    }
    // --- FIM DA CORREÇÃO ---

    const modalTitle = modal.querySelector('#statistics-modal-header span');
    if (modalTitle) modalTitle.textContent = `Estatísticas - ${pautaName}`;

    if (content) {
        content.innerHTML = `<div class="flex items-center justify-center h-full"><p class="text-gray-600">Calculando estatísticas...</p></div>`;
    }
    
    modal.style.display = 'flex';
    modal.classList.remove('hidden');

    const atendidos = allAssisted.filter(a => a.status === 'atendido');
    const faltosos = allAssisted.filter(a => a.status === 'faltoso');

    const statsByGroup = atendidos.reduce((acc, a) => {
        const attendantIsObject = typeof a.attendant === 'object' && a.attendant !== null;
        const attendantName = attendantIsObject ? a.attendant.nome : (a.attendant || 'Não informado');
        const groupName = attendantIsObject && a.attendant.equipe ? `Equipe ${a.attendant.equipe}` : 'Sem Grupo';

        if (!acc[groupName]) {
            acc[groupName] = { collaborators: {}, total: 0 };
        }

        const safeAttendantName = attendantName || 'Não informado';
        acc[groupName].collaborators[safeAttendantName] = (acc[groupName].collaborators[safeAttendantName] || 0) + 1;
        acc[groupName].total++;
        
        return acc;
    }, {});
    
    const statsBySubject = allAssisted.reduce((acc, a) => {
        const demandasDoAssistido = (a.subject ? [a.subject] : []).concat(a.demandas?.descricoes || []);
        demandasDoAssistido.forEach(demanda => {
            if (!acc[demanda]) {
                acc[demanda] = { total: 0, atendidos: 0, faltosos: 0 };
            }
            acc[demanda].total++;
            if (a.status === 'atendido') {
                acc[demanda].atendidos++;
            } else if (a.status === 'faltoso') {
                acc[demanda].faltosos++;
            }
        });
        return acc;
    }, {});

    const totalDemandasGeral = Object.values(statsBySubject).reduce((sum, data) => sum + data.total, 0);
    const totalDemandasAtendidos = Object.values(statsBySubject).reduce((sum, data) => sum + data.atendidos, 0);
    const totalDemandasFaltosos = Object.values(statsBySubject).reduce((sum, data) => sum + data.faltosos, 0);

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

    const collaboratorsHTML = Object.entries(statsByGroup).sort(([,a],[,b]) => b.total - a.total).map(([groupName, groupData]) => {
        const collaboratorsRows = Object.entries(groupData.collaborators).sort(([,a],[,b]) => b-a).map(([name, count]) => `
            <tr class="border-b">
                <td class="px-4 py-2 font-medium pl-8">${name}</td>
                <td class="px-4 py-2 text-right">${count}</td>
            </tr>
        `).join('');

        return `
            <table class="w-full text-sm text-left mb-4">
                <thead class="text-xs text-gray-700 uppercase bg-gray-200">
                    <tr>
                        <th class="px-4 py-2">${groupName}</th>
                        <th class="px-4 py-2 text-right font-bold">Total: ${groupData.total}</th>
                    </tr>
                </thead>
                <tbody>
                    ${collaboratorsRows}
                </tbody>
            </table>
        `;
    }).join('');

    const html = `
    <div class="grid grid-cols-1 lg:grid-cols-5 gap-4 h-full p-4 overflow-hidden">
        <div class="lg:col-span-2 flex flex-col gap-4 overflow-y-auto pr-2">
            <div class="bg-white p-4 rounded-lg border">
                <h3 class="text-lg font-semibold text-gray-800 mb-3">Resumo Geral</h3>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 text-center">
                    <div class="bg-green-100 p-3 rounded-lg border border-green-200"><p class="text-2xl font-bold text-green-700">${atendidos.length}</p><p class="text-xs text-gray-600 mt-1">Atendidos</p></div>
                    <div class="bg-red-100 p-3 rounded-lg border border-red-200"><p class="text-2xl font-bold text-red-700">${faltosos.length}</p><p class="text-xs text-gray-600 mt-1">Faltosos</p></div>
                    <div class="bg-blue-100 p-3 rounded-lg border border-blue-200"><p class="text-2xl font-bold text-blue-700">${avgTimeDirect} min</p><p class="text-xs text-gray-600 mt-1">Tempo Médio (direto)</p></div>
                    ${delegationHTML}
                </div>
            </div>
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
            ${sortedTimes.length > 0 ? `
            <div class="bg-white p-4 rounded-lg border">
                <h3 class="text-md font-semibold text-gray-800 mb-2">Atendimentos por Horário</h3>
                <div class="max-h-40 overflow-y-auto">
                    <table class="w-full text-sm text-left">
                        <thead class="text-xs text-gray-700 uppercase bg-gray-100 sticky top-0"><tr><th class="px-4 py-2">Horário</th><th class="px-4 py-2 text-right">Qtd</th></tr></thead>
                        <tbody>${sortedTimes.map(time => `<tr class="border-b"><td class="px-4 py-2 font-medium">${time}</td><td class="px-4 py-2 text-right">${statsByTime[time]}</td></tr>`).join('')}</tbody>
                        <tfoot><tr class="bg-gray-100"><td class="px-4 py-2 font-bold">Total</td><td class="px-4 py-2 text-right font-bold">${atendidos.length}</td></tr></tfoot>
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
                        <tfoot><tr class="bg-red-100"><td class="px-4 py-2 font-bold text-red-800">Total</td><td class="px-4 py-2 text-right font-bold text-red-800">${faltosos.length}</td></tr></tfoot>
                    </table>
                </div>
            </div>` : ''}
        </div>
        <div class="lg:col-span-3 flex flex-col gap-4 overflow-y-auto pr-2">
            <div class="bg-white p-4 rounded-lg border">
                <h3 class="text-lg font-semibold text-gray-800 mb-2">Demandas por Assunto</h3>
                 <div class="max-h-[50vh] overflow-y-auto">
                    <table class="w-full text-sm text-left">
                        <thead class="text-xs text-gray-700 uppercase bg-gray-100 sticky top-0">
                            <tr>
                                <th class="px-4 py-2">Assunto/Demanda</th>
                                <th class="px-4 py-2 text-center">Total</th>
                                <th class="px-4 py-2 text-center text-green-600">Atendidos</th>
                                <th class="px-4 py-2 text-center text-red-600">Faltosos</th>
                                <th class="px-4 py-2 text-right">%</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${Object.entries(statsBySubject).sort(([,a],[,b]) => b.total - a.total).map(([subject, data]) => `
                                <tr class="border-b">
                                    <td class="px-4 py-2 font-medium">${subject}</td>
                                    <td class="px-4 py-2 text-center font-bold">${data.total}</td>
                                    <td class="px-4 py-2 text-center text-green-600">${data.atendidos}</td>
                                    <td class="px-4 py-2 text-center text-red-600">${data.faltosos}</td>
                                    <td class="px-4 py-2 text-right">${totalDemandasGeral > 0 ? ((data.total / totalDemandasGeral) * 100).toFixed(1) : 0}%</td>
                                </tr>`).join('')}
                        </tbody>
                        <tfoot class="bg-gray-100 font-bold">
                            <tr class="border-t-2">
                                <td class="px-4 py-2">Total</td>
                                <td class="px-4 py-2 text-center">${totalDemandasGeral}</td>
                                <td class="px-4 py-2 text-center text-green-600">${totalDemandasAtendidos}</td>
                                <td class="px-4 py-2 text-center text-red-600">${totalDemandasFaltosos}</td>
                                <td class="px-4 py-2 text-right">100%</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
            <div class="bg-white p-4 rounded-lg border">
                <h3 class="text-lg font-semibold text-gray-800 mb-2">Atendimentos por Colaborador</h3>
                <div class="max-h-[30vh] overflow-y-auto">
                    ${collaboratorsHTML}
                </div>
            </div>
        </div>
    </div>
    `;
    if(content) content.innerHTML = html;

    const exportBtn = document.getElementById('export-stats-pdf-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            exportBtn.textContent = 'Gerando PDF...';
            exportBtn.disabled = true;

            exportStatisticsToPDF(pautaName, {
                atendidosCount: atendidos.length,
                faltososCount: faltosos.length,
                avgTimeDirect,
                avgTimeDelegated,
                useDelegationFlow,
                statsByGroup,
                statsBySubject,
                statsByTime: sortedTimes.map(time => ({ time, count: statsByTime[time] })),
                statsByTimeFaltosos: sortedTimesFaltosos.map(time => ({ time, count: statsByTimeFaltosos[time] }))
            }).finally(() => {
                exportBtn.textContent = 'Gerar PDF';
                exportBtn.disabled = false;
            });
        });
    }
}

/**
 * NOVA FUNÇÃO DE EXPORTAÇÃO PARA PDF
 * Gera um PDF com visual aprimorado, incluindo gráficos e layout profissional.
 * @param {string} pautaName - O nome da pauta para o título do relatório.
 * @param {object} statsData - Os dados estatísticos compilados.
 */
async function exportStatisticsToPDF(pautaName, statsData) {
    const { jsPDF } = window.jspdf;
    if (!window.Chart) {
        alert('A biblioteca Chart.js é necessária e não foi encontrada.');
        return;
    }

    // --- CONFIGURAÇÕES E ESTILOS ---
    const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;
    let yPos = 0;

    const FONT_NORMAL = 'Helvetica';
    const FONT_BOLD = 'Helvetica-Bold';
    const COLOR_PRIMARY = '#2B3A55';
    const COLOR_SECONDARY = '#4F709C';
    const COLOR_TEXT = '#333333';
    const COLOR_GRAY = '#7f8c8d';
    const COLOR_GREEN = '#27ae60';
    const COLOR_RED = '#c0392b';
    const COLOR_BLUE = '#2980b9';

    // --- FUNÇÕES AUXILIARES ---

    const addHeaderAndFooter = () => {
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            // Cabeçalho
            doc.setFont(FONT_BOLD, 'normal');
            doc.setFontSize(16);
            doc.setTextColor(COLOR_PRIMARY);
            const titleLines = doc.splitTextToSize(`Relatório de Estatísticas: ${pautaName}`, pageWidth - margin * 2);
            doc.text(titleLines, margin, margin - 10);
            
            // Linha do Cabeçalho
            doc.setDrawColor(COLOR_SECONDARY);
            doc.line(margin, margin + (titleLines.length * 12), pageWidth - margin, margin + (titleLines.length * 12));


            // Rodapé
            const footerText = `Página ${i} de ${pageCount}`;
            const generationDate = `Gerado em: ${new Date().toLocaleString('pt-BR')}`;
            doc.setFont(FONT_NORMAL, 'normal');
            doc.setFontSize(8);
            doc.setTextColor(COLOR_GRAY);
            doc.text(generationDate, margin, pageHeight - margin + 15);
            doc.text(footerText, pageWidth - margin - doc.getStringUnitWidth(footerText) * 8, pageHeight - margin + 15);
        }
    };

    const addSectionTitle = (title) => {
        if (yPos > pageHeight - 120) { // Verifica espaço para o título e algum conteúdo
            doc.addPage();
            yPos = margin + 20;
        }
        doc.setFont(FONT_BOLD, 'normal');
        doc.setFontSize(14);
        doc.setTextColor(COLOR_PRIMARY);
        doc.text(title, margin, yPos);
        yPos += 20;
    };

    // --- CONSTRUÇÃO DO PDF ---

    // 1. PÁGINA DE ROSTO / TÍTULO PRINCIPAL
    doc.setFont(FONT_BOLD, 'normal');
    doc.setFontSize(22);
    doc.setTextColor(COLOR_PRIMARY);
    const titleLines = doc.splitTextToSize(`Relatório de Estatísticas`, pageWidth - margin * 2);
    doc.text(titleLines, pageWidth / 2, 80, { align: 'center' });
    
    doc.setFont(FONT_NORMAL, 'normal');
    doc.setFontSize(16);
    doc.setTextColor(COLOR_SECONDARY);
    const pautaLines = doc.splitTextToSize(pautaName, pageWidth - margin * 2);
    doc.text(pautaLines, pageWidth / 2, 110, { align: 'center' });
    yPos = 160;

    // 2. SEÇÃO DE RESUMO GERAL
    if (document.getElementById('export-general').checked) {
        addSectionTitle("Resumo Geral");
        doc.setFont(FONT_NORMAL, 'normal');

        const summaryItems = [
            { label: 'Atendidos', value: statsData.atendidosCount, color: COLOR_GREEN },
            { label: 'Faltosos', value: statsData.faltososCount, color: COLOR_RED },
            { label: 'Tempo Médio (direto)', value: `${statsData.avgTimeDirect} min`, color: COLOR_BLUE },
        ];
        if(statsData.useDelegationFlow) {
            summaryItems.push({ label: 'Tempo Médio (delegação)', value: `${statsData.avgTimeDelegated} min`, color: '#8e44ad' });
        }

        const cardWidth = (pageWidth - margin * 2 - (summaryItems.length -1) * 10) / summaryItems.length;
        const cardHeight = 60;
        let currentX = margin;

        summaryItems.forEach(item => {
            doc.setDrawColor(item.color);
            doc.setFillColor(255, 255, 255);
            doc.roundedRect(currentX, yPos, cardWidth, cardHeight, 5, 5, 'FD');

            doc.setFont(FONT_BOLD, 'normal');
            doc.setFontSize(18);
            doc.setTextColor(item.color);
            doc.text(String(item.value), currentX + cardWidth / 2, yPos + 30, { align: 'center' });
            
            doc.setFont(FONT_NORMAL, 'normal');
            doc.setFontSize(10);
            doc.setTextColor(COLOR_TEXT);
            doc.text(item.label, currentX + cardWidth / 2, yPos + 50, { align: 'center' });

            currentX += cardWidth + 10;
        });
        yPos += cardHeight + 30;
    }

    // 3. GRÁFICOS DE ATENDIMENTOS POR GRUPO/COLABORADOR
    if (document.getElementById('export-collaborators').checked && Object.keys(statsData.statsByGroup).length > 0) {
        const sortedGroups = Object.entries(statsData.statsByGroup).sort(([, a], [, b]) => b.total - a.total);

        for (const [groupName, groupData] of sortedGroups) {
            if (yPos > pageHeight - 200) { // Pre-check for space
                doc.addPage();
                yPos = margin + 20;
            }
            
            addSectionTitle(`Grupo: ${groupName} (Total de Atendimentos: ${groupData.total})`);
            
            const sortedCollaborators = Object.entries(groupData.collaborators).sort(([, a], [, b]) => b - a);
            if (sortedCollaborators.length === 0) continue;

            const MAX_CHART_ITEMS = 15; // Limite para decidir entre gráfico e tabela

            if (sortedCollaborators.length > MAX_CHART_ITEMS) {
                // Renderiza como tabela se a lista for muito longa
                doc.autoTable({
                    startY: yPos,
                    head: [['Colaborador', 'Nº de Atendimentos']],
                    body: sortedCollaborators,
                    theme: 'grid',
                    headStyles: { fillColor: COLOR_SECONDARY, textColor: '#FFFFFF', fontStyle: 'bold' },
                    didDrawPage: (data) => yPos = data.cursor.y,
                    margin: { top: yPos, bottom: margin + 20 }
                });
                yPos = doc.autoTable.previous.finalY + 20;
            } else {
                // Renderiza como gráfico para listas menores
                const labels = sortedCollaborators.map(item => item[0]);
                const data = sortedCollaborators.map(item => item[1]);

                const canvas = document.createElement('canvas');
                canvas.width = 500;
                const chartHeight = Math.min(pageHeight / 2, Math.max(100, labels.length * 22 + 60)); // Altura ajustada e com limite
                canvas.height = chartHeight;
                const ctx = canvas.getContext('2d');

                const chart = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Atendimentos',
                            data: data,
                            backgroundColor: 'rgba(79, 112, 156, 0.8)',
                            borderColor: 'rgba(43, 58, 85, 1)',
                            borderWidth: 1
                        }]
                    },
                    options: {
                        indexAxis: 'y',
                        responsive: false,
                        animation: false,
                        plugins: {
                            legend: { display: false },
                            title: { display: false }
                        },
                        scales: { x: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } } }
                    }
                });
                
                await new Promise(resolve => setTimeout(resolve, 500));
                const imgData = canvas.toDataURL('image/png');
                
                if (yPos + chartHeight > pageHeight - margin) {
                    doc.addPage();
                    yPos = margin + 20;
                }

                const finalWidth = Math.min(canvas.width, pageWidth - margin * 2);
                const finalHeight = finalWidth / (canvas.width / canvas.height);

                doc.addImage(imgData, 'PNG', margin, yPos, finalWidth, finalHeight);
                yPos += finalHeight + 20;

                chart.destroy();
                canvas.remove();
            }
        }
    }


    // 4. TABELA DE DEMANDAS POR ASSUNTO
    if (document.getElementById('export-subjects').checked && Object.keys(statsData.statsBySubject).length > 0) {
        addSectionTitle("Demandas por Assunto");
        const totalDemands = Object.values(statsData.statsBySubject).reduce((sum, data) => sum + data.total, 0);
        const totalAtendidos = Object.values(statsData.statsBySubject).reduce((sum, data) => sum + data.atendidos, 0);
        const totalFaltosos = Object.values(statsData.statsBySubject).reduce((sum, data) => sum + data.faltosos, 0);

        doc.autoTable({
            startY: yPos,
            head: [['Assunto/Demanda', 'Total', 'Atendidos', 'Faltosos', '% do Total']],
            body: Object.entries(statsData.statsBySubject)
                .sort(([, a], [, b]) => b.total - a.total)
                .map(([subject, data]) => [
                    subject, data.total, data.atendidos, data.faltosos,
                    totalDemands > 0 ? ((data.total / totalDemands) * 100).toFixed(1) + '%' : '0%'
                ]),
            foot: [['Total Geral', totalDemands, totalAtendidos, totalFaltosos, '100%']],
            theme: 'grid',
            headStyles: { fillColor: COLOR_PRIMARY, textColor: '#FFFFFF', fontStyle: 'bold' },
            footStyles: { fillColor: [240, 240, 240], textColor: COLOR_TEXT, fontStyle: 'bold' },
            didDrawPage: (data) => yPos = data.cursor.y,
            margin: { top: yPos, bottom: margin + 20 }
        });
        yPos = doc.autoTable.previous.finalY + 20;
    }
    
    // 5. TABELAS POR HORÁRIO
    const addTimeTableToPdf = (title, data, checkboxId, total, color) => {
        if (document.getElementById(checkboxId).checked && data.length > 0) {
            addSectionTitle(title);
            doc.autoTable({
                startY: yPos,
                head: [['Horário', 'Quantidade']],
                body: data.map(item => [item.time, item.count]),
                foot: [['Total', total]],
                theme: 'grid',
                headStyles: { fillColor: color, textColor: '#FFFFFF', fontStyle: 'bold' },
                footStyles: { fillColor: [240, 240, 240], textColor: COLOR_TEXT, fontStyle: 'bold' },
                didDrawPage: (data) => yPos = data.cursor.y,
                margin: { top: yPos, bottom: margin + 20 }
            });
            yPos = doc.autoTable.previous.finalY + 20;
        }
    };
    
    addTimeTableToPdf("Atendimentos por Horário", statsData.statsByTime, 'export-times', statsData.atendidosCount, COLOR_GREEN);
    addTimeTableToPdf("Faltosos por Horário", statsData.statsByTimeFaltosos, 'export-absentees-time', statsData.faltososCount, COLOR_RED);

    // --- FINALIZAÇÃO ---
    addHeaderAndFooter();
    doc.save(`estatisticas_${pautaName.replace(/\s+/g, '_')}.pdf`);
}

