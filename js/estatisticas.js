/**
 * estatisticas.js - Versão Completa com PDF Resumo Simples
 * Funcionalidades:
 * - Atendidos por equipe (todas as equipes)
 * - Atendidos por colaborador (quantidade individual)
 * - Total por equipe
 * - PDF simples sem formatação complexa
 * - Lista de assistidos por equipe (detalhado)
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
     * Renderiza o modal de estatísticas
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

        // ===== ESTRUTURAS PARA ATENDIDOS POR EQUIPE/COLABORADOR =====
        
        // Primeiro, vamos coletar TODAS as equipes existentes
        const todasEquipes = new Set();
        const todosColaboradores = new Set();
        
        allAssisted.forEach(a => {
            const attendantIsObject = typeof a.attendant === 'object' && a.attendant !== null;
            const groupName = attendantIsObject && a.attendant.equipe ? `Equipe ${a.attendant.equipe}` : 'Equipe Não Definida';
            todasEquipes.add(groupName);
            
            if (attendantIsObject && a.attendant.nome) {
                todosColaboradores.add(a.attendant.nome);
            } else if (a.attendant && typeof a.attendant === 'string') {
                todosColaboradores.add(a.attendant);
            }
        });
        
        // Estatísticas por equipe (agrupado)
        const statsByGroup = {};
        
        // Inicializar TODAS as equipes com zero
        todasEquipes.forEach(equipe => {
            statsByGroup[equipe] = { 
                collaborators: {}, 
                total: 0,
                atendimentos: []
            };
        });
        
        // Preencher com dados reais
        atendidos.forEach(a => {
            const attendantIsObject = typeof a.attendant === 'object' && a.attendant !== null;
            const attendantName = attendantIsObject ? a.attendant.nome : (a.attendant || 'Não informado');
            
            const groupName = attendantIsObject && a.attendant.equipe ? `Equipe ${a.attendant.equipe}` : 'Equipe Não Definida';

            if (!statsByGroup[groupName]) {
                statsByGroup[groupName] = { 
                    collaborators: {}, 
                    total: 0,
                    atendimentos: []
                };
            }

            const safeAttendantName = attendantName || 'Não informado';
            statsByGroup[groupName].collaborators[safeAttendantName] = (statsByGroup[groupName].collaborators[safeAttendantName] || 0) + 1;
            statsByGroup[groupName].total++;
            
            // Adicionar atendimento para lista detalhada
            statsByGroup[groupName].atendimentos.push({
                nome: a.name || 'Não informado',
                assunto: a.subject || 'Sem assunto',
                atendente: safeAttendantName,
                horario: a.attendedTime ? new Date(a.attendedTime.seconds * 1000).toLocaleString('pt-BR') : 'Não finalizado'
            });
        });
        
        // 2. Colaboradores flat (sem agrupamento)
        const statsByCollaboratorFlat = {};
        Object.values(statsByGroup).forEach(groupData => {
            Object.entries(groupData.collaborators).forEach(([name, count]) => {
                statsByCollaboratorFlat[name] = (statsByCollaboratorFlat[name] || 0) + count;
            });
        });
        
        // Ordenar colaboradores por quantidade (decrescente)
        const sortedFlatCollaborators = Object.entries(statsByCollaboratorFlat)
            .sort(([, a], [, b]) => b - a)
            .map(([name, count]) => ({ name, count }));
        
        // 3. Equipes ordenadas por nome
        const sortedGroups = Object.keys(statsByGroup)
            .sort()
            .map(groupName => ({
                groupName,
                total: statsByGroup[groupName].total,
                collaborators: Object.entries(statsByGroup[groupName].collaborators)
                    .sort(([, a], [, b]) => b - a)
                    .map(([name, count]) => ({ name, count })),
                atendimentos: statsByGroup[groupName].atendimentos
            }));
        
        // 4. Total geral
        const totalGeral = atendidos.length;
        
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

        // Estatísticas por horário (mantido para compatibilidade)
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

        // HTML para colaboradores flat
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
                            ${sortedFlatCollaborators.map(({name, count}) => `
                                <tr class="border-b">
                                    <td class="px-2 md:px-4 py-1 md:py-2 font-medium text-xs md:text-sm">${name}</td>
                                    <td class="px-2 md:px-4 py-1 md:py-2 text-right text-xs md:text-sm font-bold text-blue-600">${count}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                        <tfoot class="bg-gray-100 font-bold">
                            <tr>
                                <td class="px-2 md:px-4 py-1 md:py-2">TOTAL</td>
                                <td class="px-2 md:px-4 py-1 md:py-2 text-right">${totalGeral}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        ` : '';

        // HTML para equipes com controle de visualização
        const groupsHTML = sortedGroups.map(({groupName, total, collaborators}, index) => {
            const collaboratorsRows = collaborators.map(({name, count}) => `
                <tr class="border-b collaborator-row group-${index}">
                    <td class="px-2 md:px-4 py-1 md:py-2 font-medium text-xs md:text-sm pl-2 md:pl-8">${name}</td>
                    <td class="px-2 md:px-4 py-1 md:py-2 text-right text-xs md:text-sm font-bold text-green-600">${count}</td>
                </tr>
            `).join('');

            return `
                <div class="mb-3 md:mb-4 border rounded-lg overflow-hidden group-container" data-group-index="${index}">
                    <div class="bg-gray-100 px-2 md:px-4 py-2 font-bold text-xs md:text-sm flex justify-between items-center">
                        <div class="flex items-center gap-2">
                            <span>👥 ${groupName}</span>
                            <span class="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-[10px] md:text-xs">Total: ${total}</span>
                        </div>
                        <button class="toggle-details-btn text-xs bg-white px-2 py-1 rounded border hover:bg-gray-50" data-group-index="${index}">
                            🔽 Ocultar detalhes
                        </button>
                    </div>
                    <table class="w-full text-xs md:text-sm text-left collaborators-table" data-group-index="${index}">
                        <tbody>
                            ${collaboratorsRows}
                        </tbody>
                    </table>
                </div>
            `;
        }).join('');

        // HTML dos botões de exportação
        const botoesExportacaoHTML = `
            <div class="bg-white p-3 md:p-4 rounded-lg border mt-4">
                <h3 class="text-base md:text-lg font-semibold text-gray-800 mb-3">Exportar Relatórios</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <button id="export-stats-pdf-btn" class="bg-blue-600 text-white font-bold py-2 px-3 rounded-lg hover:bg-blue-700 text-xs md:text-sm transition-colors">
                        📊 PDF Resumo (Equipes/Colaboradores)
                    </button>
                    <button id="export-stats-detalhado-btn" class="bg-green-600 text-white font-bold py-2 px-3 rounded-lg hover:bg-green-700 text-xs md:text-sm transition-colors">
                        📋 PDF Detalhado (Lista de Assistidos)
                    </button>
                </div>
                <div class="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <label class="flex items-center"><input type="checkbox" id="export-general" class="mr-1 md:mr-2 h-3 w-3 md:h-4 md:w-4 rounded" checked> Resumo</label>
                    <label class="flex items-center"><input type="checkbox" id="export-collaborators" class="mr-1 md:mr-2 h-3 w-3 md:h-4 md:w-4 rounded" checked> Colaboradores</label>
                    <label class="flex items-center"><input type="checkbox" id="export-subjects" class="mr-1 md:mr-2 h-3 w-3 md:h-4 md:w-4 rounded" checked> Assuntos</label>
                    <label class="flex items-center"><input type="checkbox" id="export-scheduled-time" class="mr-1 md:mr-2 h-3 w-3 md:h-4 md:w-4 rounded" checked> Agendados</label>
                    <label class="flex items-center"><input type="checkbox" id="export-times" class="mr-1 md:mr-2 h-3 w-3 md:h-4 md:w-4 rounded" checked> Atendimentos</label>
                    <label class="flex items-center"><input type="checkbox" id="export-absentees-time" class="mr-1 md:mr-2 h-3 w-3 md:h-4 md:w-4 rounded" checked> Faltosos</label>
                </div>
            </div>
        `;

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
                
                ${botoesExportacaoHTML}

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
                    <div class="flex justify-between items-center mb-2">
                        <h3 class="text-base md:text-lg font-semibold text-gray-800">Atendimentos por Equipe</h3>
                        <button id="toggle-all-groups-btn" class="text-xs bg-gray-200 px-3 py-1 rounded-full hover:bg-gray-300">
                            🔽 Ocultar todos os detalhes
                        </button>
                    </div>
                    <div class="max-h-[40vh] overflow-y-auto" id="groups-container">
                        ${groupsHTML}
                    </div>
                </div>
            </div>
        </div>
        `;
        
        content.innerHTML = html;

        // Adicionar funcionalidade de ocultar/mostrar detalhes
        const toggleAllBtn = document.getElementById('toggle-all-groups-btn');
        if (toggleAllBtn) {
            toggleAllBtn.addEventListener('click', () => {
                const isShowing = toggleAllBtn.textContent.includes('Ocultar');
                
                document.querySelectorAll('.collaborators-table').forEach(table => {
                    table.style.display = isShowing ? 'none' : 'table';
                });
                
                document.querySelectorAll('.toggle-details-btn').forEach(btn => {
                    btn.textContent = isShowing ? '🔽 Mostrar detalhes' : '🔽 Ocultar detalhes';
                });
                
                toggleAllBtn.textContent = isShowing ? '🔽 Mostrar todos os detalhes' : '🔽 Ocultar todos os detalhes';
            });
        }
        
        // Botões individuais por equipe
        document.querySelectorAll('.toggle-details-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const groupIndex = btn.dataset.groupIndex;
                const table = document.querySelector(`.collaborators-table[data-group-index="${groupIndex}"]`);
                
                if (table) {
                    if (table.style.display === 'none') {
                        table.style.display = 'table';
                        btn.textContent = '🔽 Ocultar detalhes';
                    } else {
                        table.style.display = 'none';
                        btn.textContent = '🔽 Mostrar detalhes';
                    }
                }
            });
        });

        // Configurar botões de exportar PDF
        const exportBtn = document.getElementById('export-stats-pdf-btn');
        if (exportBtn) {
            const newExportBtn = exportBtn.cloneNode(true);
            exportBtn.parentNode.replaceChild(newExportBtn, exportBtn);
            
            newExportBtn.addEventListener('click', () => {
                newExportBtn.textContent = 'Gerando PDF Resumo...';
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
                    newExportBtn.textContent = '📊 PDF Resumo (Equipes/Colaboradores)';
                    newExportBtn.disabled = false;
                });
            });
        }

        // Botão para PDF Detalhado
        const exportDetalhadoBtn = document.getElementById('export-stats-detalhado-btn');
        if (exportDetalhadoBtn) {
            const newDetalhadoBtn = exportDetalhadoBtn.cloneNode(true);
            exportDetalhadoBtn.parentNode.replaceChild(newDetalhadoBtn, exportDetalhadoBtn);
            
            newDetalhadoBtn.addEventListener('click', () => {
                newDetalhadoBtn.textContent = 'Gerando PDF Detalhado...';
                newDetalhadoBtn.disabled = true;

                this.exportDetailedStatisticsPDF(pautaName, {
                    totalGeral,
                    sortedGroups
                }).finally(() => {
                    newDetalhadoBtn.textContent = '📋 PDF Detalhado (Lista de Assistidos)';
                    newDetalhadoBtn.disabled = false;
                });
            });
        }
    },

    /**
     * Exporta estatísticas detalhadas (lista de assistidos por equipe)
     */
    async exportDetailedStatisticsPDF(pautaName, detalhesData) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 15;
        let y = 20;

        // Título
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.text(`LISTA DE ASSISTIDOS POR EQUIPE - ${pautaName}`, margin, y);
        y += 10;
        
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, margin, y);
        y += 15;
        
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text(`Total de Atendimentos: ${detalhesData.totalGeral}`, margin, y);
        y += 15;

        // Listar cada equipe com seus assistidos
        detalhesData.sortedGroups.forEach(({groupName, total, atendimentos}) => {
            if (y > pageHeight - 40) {
                doc.addPage();
                y = 20;
            }

            // Título da equipe
            doc.setFontSize(12);
            doc.setFont("helvetica", "bold");
            doc.text(`${groupName} - ${total} atendimento(s)`, margin, y);
            y += 7;

            // Listar assistidos
            doc.setFontSize(9);
            doc.setFont("helvetica", "normal");

            if (atendimentos.length > 0) {
                atendimentos.forEach((att, index) => {
                    if (y > pageHeight - 20) {
                        doc.addPage();
                        y = 20;
                        
                        // Repetir título da equipe na nova página
                        doc.setFontSize(11);
                        doc.setFont("helvetica", "bold");
                        doc.text(`${groupName} (continuação)`, margin, y);
                        y += 7;
                        doc.setFontSize(9);
                    }

                    doc.text(`${index + 1}. ${att.nome}`, margin + 5, y);
                    y += 5;
                    
                    doc.text(`   Assunto: ${att.assunto}`, margin + 10, y);
                    y += 5;
                    
                    doc.text(`   Atendente: ${att.atendente}`, margin + 10, y);
                    y += 5;
                    
                    if (att.horario !== 'Não finalizado') {
                        doc.text(`   Horário: ${att.horario}`, margin + 10, y);
                        y += 5;
                    }
                    
                    y += 3;
                });
            } else {
                doc.text(`   Nenhum atendimento registrado para esta equipe.`, margin + 5, y);
                y += 7;
            }

            y += 5;
        });

        // Rodapé
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(100);
            doc.text(
                `Página ${i} de ${pageCount}`,
                pageWidth - margin - 20,
                pageHeight - 10
            );
        }

        doc.save(`detalhado_${pautaName.replace(/\s+/g, '_')}.pdf`);
    },

    /**
     * Exporta estatísticas para PDF - VERSÃO SIMPLES (sem formatação complexa)
     */
    async exportStatisticsToPDF(pautaName, statsData) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 15;
        let y = 20;

        // TÍTULO PRINCIPAL
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.text(`RELATÓRIO DE ATENDIMENTOS - ${pautaName}`, margin, y);
        y += 10;
        
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, margin, y);
        y += 15;

        // ===== 1. LISTA DE EQUIPES E COLABORADORES =====
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text("EQUIPES E COLABORADORES", margin, y);
        y += 10;

        // Verificar se temos dados de equipes
        if (statsData.statsByGroup && Object.keys(statsData.statsByGroup).length > 0) {
            
            // Ordenar equipes por nome
            const equipesOrdenadas = Object.keys(statsData.statsByGroup).sort();
            
            equipesOrdenadas.forEach((nomeEquipe) => {
                const equipe = statsData.statsByGroup[nomeEquipe];
                
                // Verificar espaço na página
                if (y > pageHeight - 50) {
                    doc.addPage();
                    y = 20;
                }
                
                // Nome da equipe e total
                doc.setFontSize(12);
                doc.setFont("helvetica", "bold");
                doc.text(`${nomeEquipe} - TOTAL: ${equipe.total || 0} atendimentos`, margin, y);
                y += 7;
                
                // Lista de colaboradores da equipe
                doc.setFontSize(10);
                doc.setFont("helvetica", "normal");
                
                if (equipe.collaborators && Object.keys(equipe.collaborators).length > 0) {
                    // Ordenar colaboradores por nome
                    const colaboradores = Object.keys(equipe.collaborators).sort();
                    
                    colaboradores.forEach((colab) => {
                        const quantidade = equipe.collaborators[colab];
                        doc.text(`   • ${colab}: ${quantidade} atendimento(s)`, margin + 5, y);
                        y += 5;
                    });
                } else {
                    doc.text(`   • Nenhum atendimento registrado para esta equipe`, margin + 5, y);
                    y += 5;
                }
                
                y += 5; // Espaço entre equipes
            });
            
        } else {
            doc.text("Nenhum dado de equipe encontrado.", margin + 5, y);
            y += 10;
        }

        // ===== 2. RESUMO GERAL =====
        if (y > pageHeight - 40) {
            doc.addPage();
            y = 20;
        }
        
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text("RESUMO GERAL", margin, y);
        y += 10;
        
        doc.setFontSize(11);
        doc.setFont("helvetica", "normal");
        doc.text(`Total de Atendimentos: ${statsData.atendidosCount || 0}`, margin + 5, y);
        y += 7;
        doc.text(`Total de Faltosos: ${statsData.faltososCount || 0}`, margin + 5, y);
        y += 7;
        doc.text(`Total de Agendamentos: ${statsData.agendadosCount || 0}`, margin + 5, y);
        y += 7;
        doc.text(`Total de Equipes: ${Object.keys(statsData.statsByGroup || {}).length}`, margin + 5, y);
        y += 7;
        
        // Total de colaboradores
        let totalColaboradores = 0;
        if (statsData.statsByGroup) {
            Object.values(statsData.statsByGroup).forEach(equipe => {
                totalColaboradores += Object.keys(equipe.collaborators || {}).length;
            });
        }
        doc.text(`Total de Colaboradores: ${totalColaboradores}`, margin + 5, y);
        y += 7;
        
        // Tempo médio (se disponível)
        if (statsData.avgTimeDirect) {
            doc.text(`Tempo Médio de Atendimento: ${statsData.avgTimeDirect} minutos`, margin + 5, y);
            y += 7;
        }

        // ===== 3. ASSUNTOS (DEMANDAS) =====
        if (statsData.statsBySubject && Object.keys(statsData.statsBySubject).length > 0) {
            if (y > pageHeight - 40) {
                doc.addPage();
                y = 20;
            }
            
            doc.setFontSize(14);
            doc.setFont("helvetica", "bold");
            doc.text("ASSUNTOS ATENDIDOS", margin, y);
            y += 10;
            
            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            
            // Ordenar assuntos por quantidade (decrescente)
            const assuntos = Object.entries(statsData.statsBySubject)
                .sort(([,a], [,b]) => b.total - a.total);
            
            assuntos.forEach(([assunto, dados]) => {
                if (y > pageHeight - 20) {
                    doc.addPage();
                    y = 20;
                }
                doc.text(`• ${assunto}: ${dados.total} (${dados.atendidos} atendidos, ${dados.faltosos} faltosos)`, margin + 5, y);
                y += 5;
            });
        }

        // ===== 4. AGENDADOS POR HORÁRIO (se selecionado) =====
        if (document.getElementById('export-scheduled-time')?.checked && 
            statsData.statsByScheduledTime && statsData.statsByScheduledTime.length > 0) {
            
            if (y > pageHeight - 40) {
                doc.addPage();
                y = 20;
            }
            
            doc.setFontSize(14);
            doc.setFont("helvetica", "bold");
            doc.text("AGENDADOS POR HORÁRIO", margin, y);
            y += 10;
            
            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            
            statsData.statsByScheduledTime.forEach(item => {
                if (y > pageHeight - 20) {
                    doc.addPage();
                    y = 20;
                }
                doc.text(`• ${item.time}: ${item.count} agendamento(s)`, margin + 5, y);
                y += 5;
            });
        }

        // ===== 5. ATENDIMENTOS POR HORÁRIO (se selecionado) =====
        if (document.getElementById('export-times')?.checked && 
            statsData.statsByTime && statsData.statsByTime.length > 0) {
            
            if (y > pageHeight - 40) {
                doc.addPage();
                y = 20;
            }
            
            doc.setFontSize(14);
            doc.setFont("helvetica", "bold");
            doc.text("ATENDIMENTOS POR HORÁRIO", margin, y);
            y += 10;
            
            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            
            statsData.statsByTime.forEach(item => {
                if (y > pageHeight - 20) {
                    doc.addPage();
                    y = 20;
                }
                doc.text(`• ${item.time}: ${item.count} atendimento(s)`, margin + 5, y);
                y += 5;
            });
        }

        // ===== 6. FALTOSOS POR HORÁRIO (se selecionado) =====
        if (document.getElementById('export-absentees-time')?.checked && 
            statsData.statsByTimeFaltosos && statsData.statsByTimeFaltosos.length > 0) {
            
            if (y > pageHeight - 40) {
                doc.addPage();
                y = 20;
            }
            
            doc.setFontSize(14);
            doc.setFont("helvetica", "bold");
            doc.text("FALTOSOS POR HORÁRIO", margin, y);
            y += 10;
            
            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            
            statsData.statsByTimeFaltosos.forEach(item => {
                if (y > pageHeight - 20) {
                    doc.addPage();
                    y = 20;
                }
                doc.text(`• ${item.time}: ${item.count} faltoso(s)`, margin + 5, y);
                y += 5;
            });
        }

        // RODAPÉ
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(100);
            doc.text(
                `Página ${i} de ${pageCount}`,
                pageWidth - margin - 20,
                pageHeight - 10
            );
        }

        // Salvar PDF
        doc.save(`resumo_equipes_${pautaName.replace(/\s+/g, '_')}.pdf`);
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

// Tornar global
window.StatisticsService = StatisticsService;

console.log("✅ estatisticas.js carregado com sucesso!");