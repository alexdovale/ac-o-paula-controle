/**
 * estatisticas.js - Versão Simplificada com modal padrão
 */

// ========================================================
// STATISTICS SERVICE - Objeto com todas as funções de estatísticas
// ========================================================

export const StatisticsService = {
    /**
     * Calcula diferença em minutos entre duas datas
     */
    getTimeDifferenceInMinutes(startTimeISO, endTimeISO) {
        if (!startTimeISO || !endTimeISO) return null;
        const start = new Date(startTimeISO);
        const end = new Date(endTimeISO);
        if (isNaN(start) || isNaN(end)) return null;
        return Math.round((end - start) / 60000);
    },

    /**
     * Renderiza o modal de estatísticas (versão simplificada)
     */
    showModal(allAssisted, useDelegationFlow, pautaName) {
        const modal = document.getElementById('statistics-modal');

        if (!modal) {
            console.error("Elemento do modal de estatísticas '#statistics-modal' não encontrado.");
            return;
        }
        
        // Mostrar modal
        modal.classList.remove('hidden');
        
        // Configurar botão de fechar
        const closeBtn = document.getElementById('close-statistics-modal-btn');
        if (closeBtn) {
            closeBtn.onclick = () => modal.classList.add('hidden');
        }

        // Atualizar título
        const titleEl = modal.querySelector('h2');
        if (titleEl) {
            titleEl.innerHTML = `<span class="text-green-600">📊</span> Estatísticas - ${pautaName}`;
        }

        const content = document.getElementById('statistics-content');
        if (!content) {
            console.error("Elemento statistics-content não encontrado");
            return;
        }

        // Mostrar loading
        content.innerHTML = `<div class="flex items-center justify-center h-full"><p class="text-gray-600">Calculando estatísticas...</p></div>`;

        // Filtrar dados
        const atendidos = allAssisted.filter(a => a.status === 'atendido');
        const faltosos = allAssisted.filter(a => a.status === 'faltoso');

        // Estatísticas por grupo/colaborador
        const statsByGroup = atendidos.reduce((acc, a) => {
            const attendantIsObject = typeof a.attendant === 'object' && a.attendant !== null;
            const attendantName = attendantIsObject ? a.attendant.nome : (a.attendant || 'Não informado');
            
            const groupName = attendantIsObject && a.attendant.equipe ? `Equipe ${a.attendant.equipe}` : 'Equipe Não Definida';

            if (!acc[groupName]) {
                acc[groupName] = { collaborators: {}, total: 0 };
            }

            const safeAttendantName = attendantName || 'Não informado';
            acc[groupName].collaborators[safeAttendantName] = (acc[groupName].collaborators[safeAttendantName] || 0) + 1;
            acc[groupName].total++;
            
            return acc;
        }, {});
        
        // Colaboradores flat (sem agrupamento)
        const statsByCollaboratorFlat = {};
        Object.values(statsByGroup).forEach(groupData => {
            Object.entries(groupData.collaborators).forEach(([name, count]) => {
                statsByCollaboratorFlat[name] = count;
            });
        });
        const sortedFlatCollaborators = Object.entries(statsByCollaboratorFlat).sort(([, a], [, b]) => b - a);
        
        // HTML da lista de colaboradores
        const collaboratorsFlatHTML = sortedFlatCollaborators.length > 0 ? `
            <div class="bg-white p-3 md:p-4 rounded-lg border">
                <h3 class="text-base md:text-lg font-semibold text-gray-800 mb-2">Atendimentos por Colaborador</h3>
                <div class="max-h-[30vh] overflow-y-auto">
                    <table class="w-full text-xs md:text-sm text-left">
                        <thead class="text-[10px] md:text-xs text-gray-700 uppercase bg-gray-100 sticky top-0">
                            <tr>
                                <th class="px-2 md:px-4 py-1 md:py-2">Colaborador</th>
                                <th class="px-2 md:px-4 py-1 md:py-2 text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${sortedFlatCollaborators.map(([name, count]) => `
                                <tr class="border-b">
                                    <td class="px-2 md:px-4 py-1 md:py-2 font-medium text-xs md:text-sm">${name}</td>
                                    <td class="px-2 md:px-4 py-1 md:py-2 text-right text-xs md:text-sm">${count}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        ` : '';
        
        // Estatísticas por assunto
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

        // Estatísticas por horário
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

        const statsByScheduledTime = allAssisted.filter(a => a.scheduledTime).reduce((acc, a) => {
            acc[a.scheduledTime] = (acc[a.scheduledTime] || 0) + 1;
            return acc;
        }, {});
        const sortedScheduledTimes = Object.keys(statsByScheduledTime).sort();

        // Cálculo de tempos médios
        let totalDelegatedMinutes = 0, delegatedCount = 0;
        let totalDirectMinutes = 0, directCount = 0;

        atendidos.forEach(a => {
            const minutes = this.getTimeDifferenceInMinutes(a.arrivalTime, a.attendedTime);
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
            <div class="bg-indigo-100 p-2 md:p-3 rounded-lg text-center border border-indigo-200">
                <p class="text-xl md:text-2xl font-bold text-indigo-700">${avgTimeDelegated} min</p>
                <p class="text-[8px] md:text-xs text-gray-600 mt-1">Tempo Médio (delegação)</p>
            </div>` : '';

        // HTML por equipe
        const collaboratorsHTML = Object.entries(statsByGroup).sort(([,a],[,b]) => b.total - a.total).map(([groupName, groupData]) => {
            const collaboratorsRows = Object.entries(groupData.collaborators).sort(([,a],[,b]) => b-a).map(([name, count]) => `
                <tr class="border-b">
                    <td class="px-2 md:px-4 py-1 md:py-2 font-medium text-xs md:text-sm pl-2 md:pl-8">${name}</td>
                    <td class="px-2 md:px-4 py-1 md:py-2 text-right text-xs md:text-sm">${count}</td>
                </tr>
            `).join('');

            return `
                <div class="mb-3 md:mb-4">
                    <div class="bg-gray-100 px-2 md:px-4 py-1 md:py-2 rounded-t-lg font-bold text-xs md:text-sm flex justify-between">
                        <span>${groupName}</span>
                        <span>Total: ${groupData.total}</span>
                    </div>
                    <table class="w-full text-xs md:text-sm text-left border-x border-b rounded-b-lg">
                        <tbody>
                            ${collaboratorsRows}
                        </tbody>
                    </table>
                </div>
            `;
        }).join('');

        // HTML completo do conteúdo
        const html = `
        <div id="statistics-content-wrapper" class="grid grid-cols-1 lg:grid-cols-5 gap-3 md:gap-4 h-full p-2 md:p-4 overflow-hidden">
            <div class="lg:col-span-2 flex flex-col gap-3 md:gap-4 overflow-y-auto pr-1 md:pr-2">
                <div class="bg-white p-3 md:p-4 rounded-lg border">
                    <h3 class="text-base md:text-lg font-semibold text-gray-800 mb-2 md:mb-3">Resumo Geral</h3>
                    <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 md:gap-3 text-center summary-cards">
                        <div class="bg-green-100 p-2 md:p-3 rounded-lg border border-green-200">
                            <p class="text-xl md:text-2xl font-bold text-green-700">${atendidos.length}</p>
                            <p class="text-[9px] md:text-xs text-gray-600 mt-1">Atendidos</p>
                        </div>
                        <div class="bg-red-100 p-2 md:p-3 rounded-lg border border-red-200">
                            <p class="text-xl md:text-2xl font-bold text-red-700">${faltosos.length}</p>
                            <p class="text-[9px] md:text-xs text-gray-600 mt-1">Faltosos</p>
                        </div>
                        <div class="bg-blue-100 p-2 md:p-3 rounded-lg border border-blue-200">
                            <p class="text-xl md:text-2xl font-bold text-blue-700">${avgTimeDirect} min</p>
                            <p class="text-[9px] md:text-xs text-gray-600 mt-1">Tempo Médio</p>
                        </div>
                        ${delegationHTML}
                    </div>
                </div>
                
                <div class="bg-white p-3 md:p-4 rounded-lg border">
                    <h3 class="text-base md:text-lg font-semibold text-gray-800 mb-2 md:mb-3">Exportar Relatório</h3>
                    <div class="grid grid-cols-2 gap-2 md:space-y-2 text-xs md:text-sm">
                        <label class="flex items-center"><input type="checkbox" id="export-general" class="mr-1 md:mr-2 h-3 w-3 md:h-4 md:w-4 rounded" checked> Resumo</label>
                        <label class="flex items-center"><input type="checkbox" id="export-collaborators" class="mr-1 md:mr-2 h-3 w-3 md:h-4 md:w-4 rounded" checked> Colaboradores</label>
                        <label class="flex items-center"><input type="checkbox" id="export-subjects" class="mr-1 md:mr-2 h-3 w-3 md:h-4 md:w-4 rounded" checked> Assuntos</label>
                        <label class="flex items-center"><input type="checkbox" id="export-scheduled-time" class="mr-1 md:mr-2 h-3 w-3 md:h-4 md:w-4 rounded" checked> Agendados</label>
                        <label class="flex items-center"><input type="checkbox" id="export-times" class="mr-1 md:mr-2 h-3 w-3 md:h-4 md:w-4 rounded" checked> Atendimentos</label>
                        <label class="flex items-center"><input type="checkbox" id="export-absentees-time" class="mr-1 md:mr-2 h-3 w-3 md:h-4 md:w-4 rounded" checked> Faltosos</label>
                    </div>
                    <div class="mt-3 md:mt-4">
                        <button id="export-stats-pdf-btn" class="w-full bg-blue-600 text-white font-bold py-2 md:py-2.5 px-3 md:px-4 rounded-lg hover:bg-blue-700 text-xs md:text-sm transition-colors">
                            Gerar PDF
                        </button>
                    </div>
                </div>

                ${sortedScheduledTimes.length > 0 ? `
                <div class="bg-white p-3 md:p-4 rounded-lg border">
                    <h3 class="text-sm md:text-md font-semibold text-gray-800 mb-2">Agendados por Horário</h3>
                    <div class="max-h-32 md:max-h-40 overflow-y-auto">
                        <table class="w-full text-xs md:text-sm">
                            <thead class="text-[9px] md:text-xs text-gray-700 uppercase bg-gray-100 sticky top-0">
                                <tr><th class="px-2 md:px-4 py-1">Horário</th><th class="px-2 md:px-4 py-1 text-right">Qtd</th></tr>
                            </thead>
                            <tbody>
                                ${sortedScheduledTimes.map(time => `
                                    <tr class="border-b">
                                        <td class="px-2 md:px-4 py-1">${time}</td>
                                        <td class="px-2 md:px-4 py-1 text-right">${statsByScheduledTime[time]}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                            <tfoot class="bg-gray-100 font-bold">
                                <tr><td class="px-2 md:px-4 py-1">Total</td><td class="px-2 md:px-4 py-1 text-right">${allAssisted.length}</td></tr>
                            </tfoot>
                        </table>
                    </div>
                </div>` : ''}

                ${sortedTimes.length > 0 ? `
                <div class="bg-white p-3 md:p-4 rounded-lg border">
                    <h3 class="text-sm md:text-md font-semibold text-gray-800 mb-2">Atendimentos (Chegada)</h3>
                    <div class="max-h-32 md:max-h-40 overflow-y-auto">
                        <table class="w-full text-xs md:text-sm">
                            <thead class="text-[9px] md:text-xs text-gray-700 uppercase bg-gray-100 sticky top-0">
                                <tr><th class="px-2 md:px-4 py-1">Horário</th><th class="px-2 md:px-4 py-1 text-right">Qtd</th></tr>
                            </thead>
                            <tbody>
                                ${sortedTimes.map(time => `
                                    <tr class="border-b">
                                        <td class="px-2 md:px-4 py-1">${time}</td>
                                        <td class="px-2 md:px-4 py-1 text-right">${statsByTime[time]}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                            <tfoot class="bg-gray-100 font-bold">
                                <tr><td class="px-2 md:px-4 py-1">Total</td><td class="px-2 md:px-4 py-1 text-right">${atendidos.length}</td></tr>
                            </tfoot>
                        </table>
                    </div>
                </div>` : ''}

                ${sortedTimesFaltosos.length > 0 ? `
                <div class="bg-white p-3 md:p-4 rounded-lg border">
                    <h3 class="text-sm md:text-md font-semibold text-red-800 mb-2">Faltosos por Horário</h3>
                    <div class="max-h-32 md:max-h-40 overflow-y-auto">
                        <table class="w-full text-xs md:text-sm">
                            <thead class="text-[9px] md:text-xs text-red-700 uppercase bg-red-100 sticky top-0">
                                <tr><th class="px-2 md:px-4 py-1">Horário</th><th class="px-2 md:px-4 py-1 text-right">Qtd</th></tr>
                            </thead>
                            <tbody>
                                ${sortedTimesFaltosos.map(time => `
                                    <tr class="border-b">
                                        <td class="px-2 md:px-4 py-1">${time}</td>
                                        <td class="px-2 md:px-4 py-1 text-right">${statsByTimeFaltosos[time]}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                            <tfoot class="bg-red-100 font-bold">
                                <tr><td class="px-2 md:px-4 py-1">Total</td><td class="px-2 md:px-4 py-1 text-right">${faltosos.length}</td></tr>
                            </tfoot>
                        </table>
                    </div>
                </div>` : ''}
            </div>

            <div class="lg:col-span-3 flex flex-col gap-3 md:gap-4 overflow-y-auto pr-1 md:pr-2">
                <div class="bg-white p-3 md:p-4 rounded-lg border">
                    <h3 class="text-base md:text-lg font-semibold text-gray-800 mb-2">Demandas por Assunto</h3>
                    <div class="max-h-[40vh] md:max-h-[50vh] overflow-y-auto">
                        <table class="w-full text-xs md:text-sm">
                            <thead class="text-[9px] md:text-xs text-gray-700 uppercase bg-gray-100 sticky top-0">
                                <tr>
                                    <th class="px-1 md:px-4 py-1">Assunto</th>
                                    <th class="px-1 md:px-4 py-1 text-center">Total</th>
                                    <th class="px-1 md:px-4 py-1 text-center text-green-600">Atend.</th>
                                    <th class="px-1 md:px-4 py-1 text-center text-red-600">Falt.</th>
                                    <th class="px-1 md:px-4 py-1 text-right">%</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${Object.entries(statsBySubject).sort(([,a],[,b]) => b.total - a.total).map(([subject, data]) => `
                                    <tr class="border-b">
                                        <td class="px-1 md:px-4 py-1 font-medium text-[10px] md:text-sm">${subject.length > 20 ? subject.substring(0,20)+'...' : subject}</td>
                                        <td class="px-1 md:px-4 py-1 text-center font-bold">${data.total}</td>
                                        <td class="px-1 md:px-4 py-1 text-center text-green-600">${data.atendidos}</td>
                                        <td class="px-1 md:px-4 py-1 text-center text-red-600">${data.faltosos}</td>
                                        <td class="px-1 md:px-4 py-1 text-right">${totalDemandasGeral > 0 ? ((data.total / totalDemandasGeral) * 100).toFixed(1) : 0}%</td>
                                    </tr>`).join('')}
                            </tbody>
                            <tfoot class="bg-gray-100 font-bold">
                                <tr>
                                    <td class="px-1 md:px-4 py-1">Total</td>
                                    <td class="px-1 md:px-4 py-1 text-center">${totalDemandasGeral}</td>
                                    <td class="px-1 md:px-4 py-1 text-center text-green-600">${totalDemandasAtendidos}</td>
                                    <td class="px-1 md:px-4 py-1 text-center text-red-600">${totalDemandasFaltosos}</td>
                                    <td class="px-1 md:px-4 py-1 text-right">100%</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
                
                ${collaboratorsFlatHTML}
                
                <div class="bg-white p-3 md:p-4 rounded-lg border">
                    <h3 class="text-base md:text-lg font-semibold text-gray-800 mb-2">Atendimentos por Equipe</h3>
                    <div class="max-h-[30vh] overflow-y-auto">
                        ${collaboratorsHTML}
                    </div>
                </div>
            </div>
        </div>
        `;
        
        content.innerHTML = html;

        // Configurar botão de exportar PDF
        const exportBtn = document.getElementById('export-stats-pdf-btn');
        if (exportBtn) {
            // Remover listener anterior para evitar duplicação
            const newExportBtn = exportBtn.cloneNode(true);
            exportBtn.parentNode.replaceChild(newExportBtn, exportBtn);
            
            newExportBtn.addEventListener('click', () => {
                newExportBtn.textContent = 'Gerando PDF...';
                newExportBtn.disabled = true;

                this.exportStatisticsToPDF(pautaName, {
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
                    newExportBtn.textContent = 'Gerar PDF';
                    newExportBtn.disabled = false;
                });
            });
        }
    },

    /**
     * Exporta estatísticas para PDF
     */
    async exportStatisticsToPDF(pautaName, statsData) {
        const { jsPDF } = window.jspdf;
        
        // Verificar checkboxes (se não existirem, considerar marcados)
        const exportGeneral = document.getElementById('export-general')?.checked ?? true;
        const exportCollaborators = document.getElementById('export-collaborators')?.checked ?? true;
        const exportSubjects = document.getElementById('export-subjects')?.checked ?? true;
        const exportScheduledTime = document.getElementById('export-scheduled-time')?.checked ?? true;
        const exportTimes = document.getElementById('export-times')?.checked ?? true;
        const exportAbsenteesTime = document.getElementById('export-absentees-time')?.checked ?? true;
        
        const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 40;
        let yPos = margin + 30;

        const FONT_NORMAL = 'Helvetica';
        const FONT_BOLD = 'Helvetica-Bold';
        const COLOR_PRIMARY = '#2B3A55';
        const COLOR_GREEN = '#27ae60';
        const COLOR_RED = '#c0392b';
        const COLOR_BLUE = '#2980b9';

        const addSectionTitle = (title) => {
            if (yPos > pageHeight - 100) { 
                doc.addPage();
                yPos = margin + 30;
            }
            doc.setFont(FONT_BOLD, 'normal');
            doc.setFontSize(14);
            doc.setTextColor(COLOR_PRIMARY);
            doc.text(title, margin, yPos);
            yPos += 25;
        };

        // ================================================
        // 1. RESUMO GERAL
        // ================================================
        if (exportGeneral) {
            addSectionTitle("Resumo Geral");
            
            const colWidth = (pageWidth - margin * 2) / 3;
            let startX = margin;
            
            // Atendidos
            doc.setFillColor(220, 255, 220);
            doc.roundedRect(startX, yPos - 15, colWidth - 10, 60, 5, 5, 'F');
            doc.setFont(FONT_BOLD, 'normal');
            doc.setFontSize(24);
            doc.setTextColor(COLOR_GREEN);
            doc.text(String(statsData.atendidosCount || 0), startX + (colWidth - 10)/2, yPos + 15, { align: 'center' });
            doc.setFontSize(10);
            doc.setTextColor(0);
            doc.text("Atendidos", startX + (colWidth - 10)/2, yPos + 35, { align: 'center' });
            
            // Faltosos
            startX += colWidth;
            doc.setFillColor(255, 220, 220);
            doc.roundedRect(startX, yPos - 15, colWidth - 10, 60, 5, 5, 'F');
            doc.setFont(FONT_BOLD, 'normal');
            doc.setFontSize(24);
            doc.setTextColor(COLOR_RED);
            doc.text(String(statsData.faltososCount || 0), startX + (colWidth - 10)/2, yPos + 15, { align: 'center' });
            doc.setFontSize(10);
            doc.setTextColor(0);
            doc.text("Faltosos", startX + (colWidth - 10)/2, yPos + 35, { align: 'center' });
            
            // Tempo Médio
            startX += colWidth;
            doc.setFillColor(220, 235, 255);
            doc.roundedRect(startX, yPos - 15, colWidth - 10, 60, 5, 5, 'F');
            doc.setFont(FONT_BOLD, 'normal');
            doc.setFontSize(24);
            doc.setTextColor(COLOR_BLUE);
            const tempoMedio = statsData.avgTimeDirect || 0;
            doc.text(tempoMedio + ' min', startX + (colWidth - 10)/2, yPos + 15, { align: 'center' });
            doc.setFontSize(10);
            doc.setTextColor(0);
            doc.text("Tempo Médio", startX + (colWidth - 10)/2, yPos + 35, { align: 'center' });
            
            yPos += 70;
        }

        // ================================================
        // 2. ATENDIMENTOS POR COLABORADOR
        // ================================================
        if (exportCollaborators && statsData.statsByGroup && Object.keys(statsData.statsByGroup).length > 0) {
            addSectionTitle("Atendimentos por Colaborador");
            
            const colaboradores = [];
            Object.entries(statsData.statsByGroup).forEach(([grupo, data]) => {
                Object.entries(data.collaborators || {}).forEach(([nome, count]) => {
                    colaboradores.push([nome, count]);
                });
            });
            
            colaboradores.sort((a, b) => b[1] - a[1]);
            
            doc.autoTable({
                startY: yPos,
                head: [['Colaborador', 'Total']],
                body: colaboradores.slice(0, 15),
                theme: 'grid',
                headStyles: { fillColor: [75, 85, 99], textColor: '#FFFFFF' },
                styles: { fontSize: 9 },
                margin: { left: margin, right: margin }
            });
            
            yPos = doc.lastAutoTable.finalY + 20;
        }

        // ================================================
        // 3. AGENDADOS POR HORÁRIO
        // ================================================
        if (exportScheduledTime && statsData.statsByScheduledTime && statsData.statsByScheduledTime.length > 0) {
            if (yPos > pageHeight - 100) { doc.addPage(); yPos = margin + 30; }
            addSectionTitle("Agendados por Horário");
            
            doc.autoTable({
                startY: yPos,
                head: [['Horário', 'Quantidade']],
                body: statsData.statsByScheduledTime.map(item => [item.time, item.count]),
                foot: [['Total', statsData.agendadosCount || 0]],
                theme: 'grid',
                headStyles: { fillColor: [22, 163, 74], textColor: '#FFFFFF' },
                footStyles: { fillColor: [240, 240, 240], fontStyle: 'bold' },
                styles: { fontSize: 9 },
                margin: { left: margin, right: margin }
            });
            
            yPos = doc.lastAutoTable.finalY + 20;
        }

        // ================================================
        // 4. ATENDIMENTOS POR HORÁRIO (CHEGADA)
        // ================================================
        if (exportTimes && statsData.statsByTime && statsData.statsByTime.length > 0) {
            if (yPos > pageHeight - 100) { doc.addPage(); yPos = margin + 30; }
            addSectionTitle("Atendimentos por Horário (Chegada)");
            
            doc.autoTable({
                startY: yPos,
                head: [['Horário', 'Quantidade']],
                body: statsData.statsByTime.map(item => [item.time, item.count]),
                foot: [['Total', statsData.atendidosCount || 0]],
                theme: 'grid',
                headStyles: { fillColor: [22, 163, 74], textColor: '#FFFFFF' },
                footStyles: { fillColor: [240, 240, 240], fontStyle: 'bold' },
                styles: { fontSize: 9 },
                margin: { left: margin, right: margin }
            });
            
            yPos = doc.lastAutoTable.finalY + 20;
        }

        // ================================================
        // 5. FALTOSOS POR HORÁRIO
        // ================================================
        if (exportAbsenteesTime && statsData.statsByTimeFaltosos && statsData.statsByTimeFaltosos.length > 0) {
            if (yPos > pageHeight - 100) { doc.addPage(); yPos = margin + 30; }
            addSectionTitle("Faltosos por Horário");
            
            doc.autoTable({
                startY: yPos,
                head: [['Horário', 'Quantidade']],
                body: statsData.statsByTimeFaltosos.map(item => [item.time, item.count]),
                foot: [['Total', statsData.faltososCount || 0]],
                theme: 'grid',
                headStyles: { fillColor: [220, 38, 38], textColor: '#FFFFFF' },
                footStyles: { fillColor: [255, 240, 240], fontStyle: 'bold' },
                styles: { fontSize: 9 },
                margin: { left: margin, right: margin }
            });
            
            yPos = doc.lastAutoTable.finalY + 20;
        }

        // ================================================
        // 6. DEMANDAS POR ASSUNTO
        // ================================================
        if (exportSubjects && statsData.statsBySubject && Object.keys(statsData.statsBySubject).length > 0) {
            if (yPos > pageHeight - 100) { doc.addPage(); yPos = margin + 30; }
            addSectionTitle("Demandas por Assunto");
            
            const subjects = Object.entries(statsData.statsBySubject)
                .sort(([,a], [,b]) => b.total - a.total)
                .map(([name, data]) => [
                    name,
                    data.total || 0,
                    data.atendidos || 0,
                    data.faltosos || 0
                ]);
            
            const totalGeral = subjects.reduce((acc, row) => acc + row[1], 0);
            const totalAtendidos = subjects.reduce((acc, row) => acc + row[2], 0);
            const totalFaltosos = subjects.reduce((acc, row) => acc + row[3], 0);
            
            doc.autoTable({
                startY: yPos,
                head: [['Assunto', 'Total', 'Atendidos', 'Faltosos']],
                body: subjects.slice(0, 20),
                foot: [['TOTAL GERAL', totalGeral, totalAtendidos, totalFaltosos]],
                theme: 'grid',
                headStyles: { fillColor: [75, 85, 99], textColor: '#FFFFFF' },
                footStyles: { fillColor: [240, 240, 240], fontStyle: 'bold' },
                styles: { fontSize: 8 },
                columnStyles: { 0: { cellWidth: 180 } },
                margin: { left: margin, right: margin }
            });
        }

        // ================================================
        // RODAPÉ COM DATA
        // ================================================
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(
                `Gerado em: ${new Date().toLocaleString('pt-BR')} - Página ${i} de ${pageCount}`,
                margin,
                pageHeight - 20
            );
        }

        doc.save(`estatisticas_${pautaName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.pdf`);
    }
};

// ========================================================
// FUNÇÕES AVULSAS (para compatibilidade com código antigo)
// ========================================================

/**
 * @deprecated Use StatisticsService.showModal() instead
 */
export const renderStatisticsModal = (allAssisted, useDelegationFlow, pautaName) => {
    return StatisticsService.showModal(allAssisted, useDelegationFlow, pautaName);
};

/**
 * @deprecated Use StatisticsService.exportStatisticsToPDF() instead
 */
export const exportStatisticsToPDF = (pautaName, statsData) => {
    return StatisticsService.exportStatisticsToPDF(pautaName, statsData);
};