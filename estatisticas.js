/**
 * estatisticas.js - Versão Módulo Corrigida, com PDF Melhorado, Responsiva e Agendados por Horário
 * Este arquivo deve ser importado pelo seu script principal.
 * Requer: jspdf, jspdf-autotable, chart.js
 */

function makeModalInteractive(modal) {
    if (!modal || modal.classList.contains('interactive-modal-init')) {
        return;
    }
    modal.classList.add('interactive-modal-init', 'bg-white');

    // --- INÍCIO DA MELHORIA DE RESPONSIVIDADE ---
    // Estilos injetados para garantir que o modal e seu conteúdo se adaptem a diferentes tamanhos de tela.
    if (!document.getElementById('statistics-responsive-styles')) {
        const styleSheet = document.createElement("style");
        styleSheet.id = 'statistics-responsive-styles';
        styleSheet.innerHTML = `
            /* Estilos aprimorados para responsividade */
            
            /* Em telas de tablet e menores (abaixo de 1024px) */
            @media (max-width: 1024px) {
                /* O container principal do conteúdo passa a ser rolável */
                #statistics-content-wrapper {
                    overflow-y: auto !important;
                    display: flex;
                    flex-direction: column;
                }
                /* Desativa o scroll individual das colunas internas para evitar rolagem dupla */
                #statistics-content-wrapper > .lg\\:col-span-2,
                #statistics-content-wrapper > .lg\\:col-span-3 {
                    overflow-y: visible !important;
                }
            }

            /* Em telas de celular (abaixo de 768px) */
            @media (max-width: 768px) {
                /* O modal ocupa a tela inteira para uma melhor experiência mobile */
                #statistics-modal {
                    width: 100vw !important;
                    height: 100vh !important;
                    max-width: 100vw !important;
                    max-height: 100vh !important;
                    top: 0 !important;
                    left: 0 !important;
                    transform: none !important;
                    border-radius: 0 !important;
                    resize: none !important;
                    min-width: 0 !important;
                    min-height: 0 !important;
                }

                #statistics-content-wrapper {
                    padding: 8px !important;
                }

                /* Força os cards de resumo a terem no máximo 2 colunas */
                #statistics-content .summary-cards {
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                }

                /* Ajusta o tamanho das fontes para melhor leitura */
                #statistics-content h3 {
                    font-size: 1.125rem; /* text-lg */
                }
                #statistics-content .text-2xl {
                    font-size: 1.25rem; /* text-xl */
                }
                #statistics-content .text-xs {
                    font-size: 0.75rem; /* text-xs */
                }
                 /* Reduz o tamanho das tabelas para caber mais conteúdo na tela */
                #statistics-content .max-h-40 { max-height: 12rem !important; }
                #statistics-content .max-h-\\[30vh\\] { max-height: 35vh !important; }
                #statistics-content .max-h-\\[50vh\\] { max-height: 40vh !important; }
            }

            /* Ajustes finos para telas muito pequenas (abaixo de 480px) */
            @media (max-width: 480px) {
                /* Em telas bem pequenas, os cards de resumo ficam em coluna única */
                #statistics-content .summary-cards {
                    grid-template-columns: repeat(1, minmax(0, 1fr));
                }

                #statistics-content-wrapper {
                    padding: 4px !important;
                }
            }
        `;
        document.head.appendChild(styleSheet);
    }
    // --- FIM DA MELHORIA DE RESPONSIVIDADE ---

    const content = document.getElementById('statistics-content');
    if (!content) {
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
    return Math.round((end - end) / 60000);
}

// FUNÇÃO PRINCIPAL QUE SERÁ USADA PELO SEU SCRIP
export function renderStatisticsModal(allAssisted, useDelegationFlow, pautaName) {
    const modal = document.getElementById('statistics-modal');

    if (!modal) {
        console.error("Elemento do modal de estatísticas '#statistics-modal' não encontrado.");
        return;
    }
    
    let content = document.getElementById('statistics-content');
    
    makeModalInteractive(modal);
    
    if (!content) {
        content = document.getElementById('statistics-content');
    }

    if (modal.classList.contains('minimized')) {
        modal.classList.remove('minimized');
        modal.style.resize = 'both';
    }
    if (content) {
        content.style.display = 'block'; 
    }

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
        
        // MODIFICAÇÃO: Renomeia 'Sem Grupo' para 'Equipe Não Definida'
        const groupName = attendantIsObject && a.attendant.equipe ? `Equipe ${a.attendant.equipe}` : 'Equipe Não Definida';

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

    // NOVO: Cálculo de todos os agendados por horário
    const statsByScheduledTime = allAssisted.filter(a => a.scheduledTime).reduce((acc, a) => {
        acc[a.scheduledTime] = (acc[a.scheduledTime] || 0) + 1;
        return acc;
    }, {});
    const sortedScheduledTimes = Object.keys(statsByScheduledTime).sort();

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
    <div id="statistics-content-wrapper" class="grid grid-cols-1 lg:grid-cols-5 gap-4 h-full p-4 overflow-hidden">
        <div class="lg:col-span-2 flex flex-col gap-4 overflow-y-auto pr-2">
            <div class="bg-white p-4 rounded-lg border">
                <h3 class="text-lg font-semibold text-gray-800 mb-3">Resumo Geral</h3>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 text-center summary-cards">
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
                    <label class="flex items-center"><input type="checkbox" id="export-collaborators" class="mr-2 h-4 w-4 rounded" checked> **Por Colaborador/Equipe**</label>
                    <label class="flex items-center"><input type="checkbox" id="export-subjects" class="mr-2 h-4 w-4 rounded" checked> Por Assunto</label>
                    <label class="flex items-center"><input type="checkbox" id="export-scheduled-time" class="mr-2 h-4 w-4 rounded" checked> Agendados por Horário</label>
                    <label class="flex items-center"><input type="checkbox" id="export-times" class="mr-2 h-4 w-4 rounded" checked> Atend. por Horário</label>
                    <label class="flex items-center"><input type="checkbox" id="export-absentees-time" class="mr-2 h-4 w-4 rounded" checked> Faltosos por Horário</label>
                </div>
                <div class="mt-4">
                    <button id="export-stats-pdf-btn" class="w-full bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 text-sm transition-colors">Gerar PDF</button>
                </div>
            </div>
            ${sortedScheduledTimes.length > 0 ? `
            <div class="bg-white p-4 rounded-lg border">
                <h3 class="text-md font-semibold text-gray-800 mb-2">Agendados por Horário</h3>
                <div class="max-h-40 overflow-y-auto">
                    <table class="w-full text-sm text-left">
                        <thead class="text-xs text-gray-700 uppercase bg-gray-100 sticky top-0"><tr><th class="px-4 py-2">Horário</th><th class="px-4 py-2 text-right">Qtd</th></tr></thead>
                        <tbody>${sortedScheduledTimes.map(time => `<tr class="border-b"><td class="px-4 py-2 font-medium">${time}</td><td class="px-4 py-2 text-right">${statsByScheduledTime[time]}</td></tr>`).join('')}</tbody>
                        <tfoot><tr class="bg-gray-100"><td class="px-4 py-2 font-bold">Total</td><td class="px-4 py-2 text-right font-bold">${allAssisted.length}</td></tr></tfoot>
                    </table>
                </div>
            </div>` : ''}
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
                <h3 class="text-lg font-semibold text-gray-800 mb-2">Atendimentos por Equipe</h3>
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
                agendadosCount: allAssisted.length,
                atendidosCount: atendidos.length,
                faltososCount: faltosos.length,
                avgTimeDirect,
                avgTimeDelegated,
                useDelegationFlow,
                statsByGroup,
                statsBySubject,
                statsByScheduledTime: sortedScheduledTimes.map(time => ({ time, count: statsByScheduledTime[time] })),
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
            // Cabeçalho para todas as páginas
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
        // Aumentar o espaço de segurança antes de adicionar nova página
        if (yPos > pageHeight - 150) { 
            doc.addPage();
            yPos = margin + 30;
        }
        doc.setFont(FONT_BOLD, 'normal');
        doc.setFontSize(14);
        doc.setTextColor(COLOR_PRIMARY);
        doc.text(title, margin, yPos);
        yPos += 20;
    };
    
    /**
     * NOVA FUNÇÃO: Adiciona tabelas de tempo (Atendidos e Faltosos) lado a lado.
     * @param {object} doc - Instância do jsPDF.
     * @param {string} title - Título da seção.
     * @param {Array} dataAtendidos - Dados de atendidos.
     * @param {number} totalAtendidos - Total de atendidos.
     * @param {Array} dataFaltosos - Dados de faltosos.
     * @param {number} totalFaltosos - Total de faltosos.
     */
    const addHorizontalTimeTables = (doc, title, dataAtendidos, totalAtendidos, dataFaltosos, totalFaltosos) => {
        
        const spaceForTitle = 30;
        const totalSpaceNeeded = Math.max(
            dataAtendidos.length * 18 + 70, // Altura da tabela de Atendidos
            dataFaltosos.length * 18 + 70 // Altura da tabela de Faltosos
        ) + spaceForTitle;

        // Seção para quebra de página
        if (yPos + totalSpaceNeeded > pageHeight - margin) {
            doc.addPage();
            yPos = margin + 30;
        }

        // Título principal sobre as duas colunas
        addSectionTitle(title);
        yPos -= 5; // Ajuste de espaçamento

        const tableWidth = (pageWidth - margin * 3) / 2; // Margem no centro
        const startXLeft = margin;
        const startXRight = margin * 2 + tableWidth;

        // --- 1. Tabela de Atendidos por Horário (Esquerda) ---
        if (dataAtendidos.length > 0) {
            
            // Subtítulo
            doc.setFont(FONT_BOLD, 'normal');
            doc.setFontSize(12);
            doc.setTextColor(COLOR_GREEN);
            doc.text("Atendidos por Horário", startXLeft, yPos);
            yPos += 5; // Ajuste

            doc.autoTable({
                startY: yPos,
                startX: startXLeft,
                tableWidth: tableWidth,
                head: [['Horário', 'Quantidade']],
                body: dataAtendidos.map(item => [item.time, item.count]),
                foot: [['Total', totalAtendidos]],
                theme: 'grid',
                headStyles: { fillColor: COLOR_GREEN, textColor: '#FFFFFF', fontStyle: 'bold' },
                footStyles: { fillColor: [220, 255, 220], textColor: COLOR_TEXT, fontStyle: 'bold' },
                margin: { left: startXLeft, right: pageWidth - (startXLeft + tableWidth), top: yPos }
            });
        }
        
        // --- 2. Tabela de Faltosos por Horário (Direita) ---
        if (dataFaltosos.length > 0) {
            
            // Subtítulo
            doc.setFont(FONT_BOLD, 'normal');
            doc.setFontSize(12);
            doc.setTextColor(COLOR_RED);
            doc.text("Faltosos por Horário", startXRight, yPos);
            yPos += 5; // Ajuste
            
            doc.autoTable({
                startY: yPos,
                startX: startXRight,
                tableWidth: tableWidth,
                head: [['Horário', 'Quantidade']],
                body: dataFaltosos.map(item => [item.time, item.count]),
                foot: [['Total', totalFaltosos]],
                theme: 'grid',
                headStyles: { fillColor: COLOR_RED, textColor: '#FFFFFF', fontStyle: 'bold' },
                footStyles: { fillColor: [255, 220, 220], textColor: COLOR_TEXT, fontStyle: 'bold' },
                margin: { left: startXRight, right: pageWidth - (startXRight + tableWidth), top: yPos }
            });
        }

        // Atualiza o Y para a posição final da tabela mais baixa + 20pt de espaço
        const finalYLeft = dataAtendidos.length > 0 ? doc.autoTable.previous.finalY : yPos;
        const finalYRight = dataFaltosos.length > 0 ? doc.autoTable.previous.finalY : yPos;
        yPos = Math.max(finalYLeft, finalYRight) + 20; 
    };

    // --- CONSTRUÇÃO DO PDF ---
    yPos = margin + 30; 

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

    // SEÇÃO DE EXPORTAÇÃO: SOMENTE TABELAS (Equipe/Colaborador)
    if (document.getElementById('export-collaborators').checked && Object.keys(statsData.statsByGroup).length > 0) {
        const sortedGroups = Object.entries(statsData.statsByGroup).sort(([, a], [, b]) => b.total - a.total);

        for (const [groupName, groupData] of sortedGroups) {
            
            const totalColaboradores = Object.keys(groupData.collaborators).length; // Conta quantos colaboradores há neste grupo
            
            // NOVO TÍTULO COM AS DUAS INFORMAÇÕES SEPARADAS
            addSectionTitle(`Equipe/Grupo: ${groupName} | Colaboradores: ${totalColaboradores} | Total de Atendimentos: ${groupData.total}`);
            
            const sortedCollaborators = Object.entries(groupData.collaborators).sort(([, a], [, b]) => b - a);
            if (sortedCollaborators.length === 0) continue;

            // FORÇA O USO DE TABELA PARA TODOS OS CASOS (SEM GRÁFICO)
            doc.autoTable({
                startY: yPos,
                head: [['Colaborador', 'Nº de Atendimentos']],
                body: sortedCollaborators,
                theme: 'grid',
                headStyles: { fillColor: COLOR_SECONDARY, textColor: '#FFFFFF', fontStyle: 'bold' },
                didDrawPage: (data) => { 
                    // Redefine o Y após quebra de página
                    if(data.pageNumber > 1) yPos = margin + 30 
                },
                // Garante que o título do grupo (acima) não seja cortado
                margin: { top: yPos, bottom: margin + 20 } 
            });
            // Atualiza o Y para a posição final da tabela
            yPos = doc.autoTable.previous.finalY + 20; 
        }
    }
    // FIM DA SEÇÃO DE EXPORTAÇÃO
    
    // --- 3. EXECUTA AS TABELAS LADO A LADO ---
    if (document.getElementById('export-times').checked || document.getElementById('export-absentees-time').checked) {
        // Gera as duas tabelas lado a lado se pelo menos um dos checkboxes estiver marcado
        addHorizontalTimeTables(
            doc,
            "Atendimentos e Faltosos por Horário de Chegada",
            statsData.statsByTime, 
            statsData.atendidosCount,
            statsData.statsByTimeFaltosos, 
            statsData.faltososCount
        );
    }
    
    // Apenas para manter o último relatório de horário (Agendados)
    const addVerticalTable = (title, data, checkboxId, total, color) => {
        if (document.getElementById(checkboxId).checked && data.length > 0) {
            if (yPos > pageHeight - 150) { doc.addPage(); yPos = margin + 30; }
            addSectionTitle(title);
            doc.autoTable({
                startY: yPos,
                head: [['Horário', 'Quantidade']],
                body: data.map(item => [item.time, item.count]),
                foot: [['Total', total]],
                theme: 'grid',
                headStyles: { fillColor: color, textColor: '#FFFFFF', fontStyle: 'bold' },
                footStyles: { fillColor: [240, 240, 240], textColor: COLOR_TEXT, fontStyle: 'bold' },
                didDrawPage: (data) => { if(data.pageNumber > 1) yPos = margin + 30 },
                margin: { top: yPos, bottom: margin + 20 }
            });
            yPos = doc.autoTable.previous.finalY + 20;
        }
    };
    
    addVerticalTable("Agendados por Horário", statsData.statsByScheduledTime, 'export-scheduled-time', statsData.agendadosCount, COLOR_BLUE);


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
            didDrawPage: (data) => { if(data.pageNumber > 1) yPos = margin + 30 },
            margin: { top: yPos, bottom: margin + 20 }
        });
        yPos = doc.autoTable.previous.finalY + 20;
    }
    
    addHeaderAndFooter();
    doc.save(`estatisticas_${pautaName.replace(/\s+/g, '_')}.pdf`);
}
