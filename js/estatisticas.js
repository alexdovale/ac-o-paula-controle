/**
 * estatisticas.js - Versão Completa com PDF por Equipe baseado no cadastro
 * Funcionalidades:
 * - PDF por Equipe mostra TODOS os colaboradores da equipe (cadastro)
 * - Inclui quem não atendeu (mostra 0 atendimentos)
 * - Baseado nos dados de colaboradores da gestão
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

        // ===== BUSCAR DADOS DOS COLABORADORES DO SISTEMA =====
        // Tenta obter a lista de colaboradores do armazenamento global
        let todosColaboradores = [];
        
        // Verificar se existe no window.app
        if (window.app && window.app.colaboradores) {
            todosColaboradores = window.app.colaboradores;
        } 
        // Verificar se existe no localStorage
        else {
            const stored = localStorage.getItem('sigap_colaboradores');
            if (stored) {
                try {
                    todosColaboradores = JSON.parse(stored);
                } catch (e) {
                    console.error("Erro ao parsear colaboradores:", e);
                }
            }
        }
        
        console.log("📋 Colaboradores carregados:", todosColaboradores.length);

        // Organizar colaboradores por equipe
        const colaboradoresPorEquipe = {};
        
        todosColaboradores.forEach(col => {
            const equipe = col.equipe ? `Equipe ${col.equipe}` : 'Equipe Não Definida';
            
            if (!colaboradoresPorEquipe[equipe]) {
                colaboradoresPorEquipe[equipe] = [];
            }
            
            colaboradoresPorEquipe[equipe].push({
                nome: col.nome || 'Nome não informado',
                cargo: col.cargo || 'Sem cargo',
                id: col.id
            });
        });

        // Estatísticas por equipe baseadas nos atendimentos
        const statsByGroup = {};
        
        // Inicializar com todas as equipes do cadastro
        Object.keys(colaboradoresPorEquipe).forEach(equipe => {
            statsByGroup[equipe] = { 
                collaborators: {}, 
                total: 0,
                atendimentos: [],
                todosColaboradores: colaboradoresPorEquipe[equipe] // Guarda lista completa
            };
        });
        
        // Adicionar equipe padrão para atendimentos sem equipe definida
        if (!statsByGroup['Equipe Não Definida']) {
            statsByGroup['Equipe Não Definida'] = { 
                collaborators: {}, 
                total: 0,
                atendimentos: [],
                todosColaboradores: []
            };
        }
        
        // Preencher com dados reais de atendimentos
        atendidos.forEach(a => {
            const attendantIsObject = typeof a.attendant === 'object' && a.attendant !== null;
            const attendantName = attendantIsObject ? a.attendant.nome : (a.attendant || 'Não informado');
            
            const groupName = attendantIsObject && a.attendant.equipe ? `Equipe ${a.attendant.equipe}` : 'Equipe Não Definida';

            if (!statsByGroup[groupName]) {
                statsByGroup[groupName] = { 
                    collaborators: {}, 
                    total: 0,
                    atendimentos: [],
                    todosColaboradores: []
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
                total: statsByGroup[groupName]?.total || 0,
                collaborators: statsByGroup[groupName]?.collaborators ? 
                    Object.entries(statsByGroup[groupName].collaborators)
                        .sort(([, a], [, b]) => b - a)
                        .map(([name, count]) => ({ name, count })) : [],
                todosColaboradores: statsByGroup[groupName]?.todosColaboradores || [],
                atendimentos: statsByGroup[groupName]?.atendimentos || []
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
        const groupsHTML = sortedGroups.map(({groupName, total, collaborators, todosColaboradores}, index) => {
            // Combinar colaboradores que atenderam com os que não atenderam
            const colaboradoresCompletos = [];
            
            // Primeiro, adicionar todos os colaboradores da equipe (do cadastro)
            todosColaboradores.forEach(col => {
                const atendimentos = collaborators.find(c => c.name === col.nome)?.count || 0;
                colaboradoresCompletos.push({
                    nome: col.nome,
                    atendimentos: atendimentos,
                    cargo: col.cargo
                });
            });
            
            // Ordenar por quantidade de atendimentos (decrescente)
            colaboradoresCompletos.sort((a, b) => b.atendimentos - a.atendimentos);
            
            const collaboratorsRows = colaboradoresCompletos.map(({nome, atendimentos, cargo}) => `
                <tr class="border-b collaborator-row group-${index}">
                    <td class="px-2 md:px-4 py-1 md:py-2 font-medium text-xs md:text-sm pl-2 md:pl-8">${nome}</td>
                    <td class="px-2 md:px-4 py-1 md:py-2 text-xs text-gray-600">${cargo || '-'}</td>
                    <td class="px-2 md:px-4 py-1 md:py-2 text-right text-xs md:text-sm font-bold ${atendimentos > 0 ? 'text-green-600' : 'text-gray-400'}">${atendimentos}</td>
                </tr>
            `).join('');

            const hasCollaborators = colaboradoresCompletos.length > 0;

            return `
                <div class="mb-3 md:mb-4 border rounded-lg overflow-hidden group-container" data-group-index="${index}">
                    <div class="bg-gray-100 px-2 md:px-4 py-2 font-bold text-xs md:text-sm flex justify-between items-center">
                        <div class="flex items-center gap-2">
                            <span>👥 ${groupName}</span>
                            <span class="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-[10px] md:text-xs">Total: ${total}</span>
                            <span class="bg-purple-100 text-purple-800 px-2 py-1 rounded-full text-[10px] md:text-xs">Membros: ${todosColaboradores.length}</span>
                        </div>
                        ${hasCollaborators ? `
                            <button class="toggle-details-btn text-xs bg-white px-2 py-1 rounded border hover:bg-gray-50" data-group-index="${index}">
                                🔽 Ocultar detalhes
                            </button>
                        ` : ''}
                    </div>
                    ${hasCollaborators ? `
                        <table class="w-full text-xs md:text-sm text-left collaborators-table" data-group-index="${index}">
                            <thead class="text-[9px] text-gray-500 uppercase bg-gray-50">
                                <tr>
                                    <th class="px-2 md:px-4 py-1 pl-8">Colaborador</th>
                                    <th class="px-2 md:px-4 py-1">Cargo</th>
                                    <th class="px-2 md:px-4 py-1 text-right">Atend.</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${collaboratorsRows}
                            </tbody>
                        </table>
                    ` : `
                        <div class="p-2 text-xs text-gray-500 italic">Nenhum colaborador cadastrado nesta equipe</div>
                    `}
                </div>
            `;
        }).join('');

        // HTML dos botões de exportação
        const botoesExportacaoHTML = `
            <div class="bg-white p-3 md:p-4 rounded-lg border mt-4">
                <h3 class="text-base md:text-lg font-semibold text-gray-800 mb-3">Exportar Relatórios</h3>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <button id="export-stats-pdf-btn" class="bg-blue-600 text-white font-bold py-2 px-3 rounded-lg hover:bg-blue-700 text-xs md:text-sm transition-colors">
                        📊 PDF Resumo
                    </button>
                    <button id="export-equipes-pdf-btn" class="bg-purple-600 text-white font-bold py-2 px-3 rounded-lg hover:bg-purple-700 text-xs md:text-sm transition-colors">
                        👥 PDF por Equipe (Completo)
                    </button>
                    <button id="export-stats-detalhado-btn" class="bg-green-600 text-white font-bold py-2 px-3 rounded-lg hover:bg-green-700 text-xs md:text-sm transition-colors">
                        📋 PDF Detalhado
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
                    if (table) {
                        table.style.display = isShowing ? 'none' : 'table';
                    }
                });
                
                document.querySelectorAll('.toggle-details-btn').forEach(btn => {
                    if (btn) {
                        btn.textContent = isShowing ? '🔽 Mostrar detalhes' : '🔽 Ocultar detalhes';
                    }
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
                    newExportBtn.textContent = '📊 PDF Resumo';
                    newExportBtn.disabled = false;
                });
            });
        }

        // Botão para PDF por Equipe (NOVO - com todos os colaboradores)
        const exportEquipesBtn = document.getElementById('export-equipes-pdf-btn');
        if (exportEquipesBtn) {
            const newEquipesBtn = exportEquipesBtn.cloneNode(true);
            exportEquipesBtn.parentNode.replaceChild(newEquipesBtn, exportEquipesBtn);
            
            newEquipesBtn.addEventListener('click', () => {
                newEquipesBtn.textContent = 'Gerando PDF por Equipe...';
                newEquipesBtn.disabled = true;

                this.exportEquipesPDF(pautaName, {
                    statsByGroup,
                    sortedGroups,
                    totalGeral
                }).finally(() => {
                    newEquipesBtn.textContent = '👥 PDF por Equipe (Completo)';
                    newEquipesBtn.disabled = false;
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
                    newDetalhadoBtn.textContent = '📋 PDF Detalhado';
                    newDetalhadoBtn.disabled = false;
                });
            });
        }
    },

    /**
     * Exporta PDF por Equipe - MOSTRA TODOS OS COLABORADORES DO CADASTRO
     */
    async exportEquipesPDF(pautaName, dados) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 40;
        let yPos = margin + 30;

        // Título
        doc.setFontSize(18);
        doc.setTextColor(22, 163, 74);
        doc.setFont("helvetica", "bold");
        doc.text(`RELATÓRIO COMPLETO POR EQUIPE - ${pautaName}`, margin, yPos);
        yPos += 20;
        
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, margin, yPos);
        yPos += 20;
        
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text(`Total de Atendimentos: ${dados.totalGeral}`, margin, yPos);
        yPos += 25;

        // Listar todas as equipes com TODOS os colaboradores
        dados.sortedGroups.forEach(({groupName, total, todosColaboradores, collaborators}) => {
            if (yPos > pageHeight - 150) {
                doc.addPage();
                yPos = margin + 30;
            }

            // Título da equipe
            doc.setFontSize(14);
            doc.setTextColor(0, 102, 204);
            doc.setFont("helvetica", "bold");
            doc.text(`${groupName} - TOTAL: ${total} atendimentos | Membros: ${todosColaboradores.length}`, margin, yPos);
            yPos += 20;

            // Cabeçalho da tabela
            doc.setFillColor(240, 240, 240);
            doc.rect(margin, yPos - 12, pageWidth - (margin * 2), 20, 'F');
            
            doc.setFontSize(10);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(60, 60, 60);
            doc.text("Colaborador", margin + 10, yPos);
            doc.text("Cargo", margin + 200, yPos);
            doc.text("Atendimentos", pageWidth - margin - 80, yPos);
            yPos += 15;

            // Lista de colaboradores
            doc.setFontSize(9);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(60, 60, 60);

            if (todosColaboradores && todosColaboradores.length > 0) {
                // Ordenar por nome
                const colaboradoresOrdenados = [...todosColaboradores].sort((a, b) => a.nome.localeCompare(b.nome));
                
                colaboradoresOrdenados.forEach((col) => {
                    if (yPos > pageHeight - 40) {
                        doc.addPage();
                        yPos = margin + 30;
                        
                        // Repetir título na nova página
                        doc.setFontSize(12);
                        doc.setTextColor(0, 102, 204);
                        doc.setFont("helvetica", "bold");
                        doc.text(`${groupName} (continuação)`, margin, yPos);
                        yPos += 20;
                        
                        doc.setFontSize(9);
                    }
                    
                    // Verificar quantos atendimentos este colaborador fez
                    const atendimentos = collaborators.find(c => c.name === col.nome)?.count || 0;
                    
                    doc.text(col.nome, margin + 10, yPos);
                    doc.text(col.cargo || '-', margin + 200, yPos);
                    
                    doc.setFont("helvetica", "bold");
                    doc.setTextColor(atendimentos > 0 ? 22 : 150, atendimentos > 0 ? 163 : 150, atendimentos > 0 ? 74 : 150);
                    doc.text(atendimentos.toString(), pageWidth - margin - 50, yPos);
                    
                    doc.setFont("helvetica", "normal");
                    doc.setTextColor(60, 60, 60);
                    
                    yPos += 15;
                });
            } else {
                doc.text("Nenhum colaborador cadastrado nesta equipe", margin + 10, yPos);
                yPos += 15;
            }

            yPos += 15;
        });

        // Rodapé
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(
                `Página ${i} de ${pageCount}`,
                pageWidth - margin - 50,
                pageHeight - 20
            );
        }

        doc.save(`equipe_completa_${pautaName.replace(/\s+/g, '_')}.pdf`);
    },

    /**
     * Exporta estatísticas detalhadas (lista de assistidos por equipe)
     */
    async exportDetailedStatisticsPDF(pautaName, detalhesData) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 40;
        let yPos = margin + 30;

        // Título
        doc.setFontSize(18);
        doc.setTextColor(22, 163, 74);
        doc.setFont("helvetica", "bold");
        doc.text(`LISTA DE ASSISTIDOS POR EQUIPE - ${pautaName}`, margin, yPos);
        yPos += 20;
        
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, margin, yPos);
        yPos += 20;
        
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text(`Total de Atendimentos: ${detalhesData.totalGeral}`, margin, yPos);
        yPos += 25;

        // Listar cada equipe com seus assistidos
        detalhesData.sortedGroups.forEach(({groupName, total, atendimentos}) => {
            if (yPos > pageHeight - 100) {
                doc.addPage();
                yPos = margin + 30;
            }

            // Título da equipe
            doc.setFontSize(14);
            doc.setTextColor(0, 102, 204);
            doc.setFont("helvetica", "bold");
            doc.text(`${groupName} (${total} atendimentos)`, margin, yPos);
            yPos += 20;

            // Listar assistidos
            doc.setFontSize(9);
            doc.setTextColor(60, 60, 60);
            doc.setFont("helvetica", "normal");

            if (atendimentos && atendimentos.length > 0) {
                atendimentos.forEach((att, index) => {
                    if (yPos > pageHeight - 60) {
                        doc.addPage();
                        yPos = margin + 30;
                        
                        // Repetir título da equipe na nova página
                        doc.setFontSize(12);
                        doc.setTextColor(0, 102, 204);
                        doc.setFont("helvetica", "bold");
                        doc.text(`${groupName} (continuação)`, margin, yPos);
                        yPos += 20;
                        doc.setFontSize(9);
                    }

                    doc.text(`${index + 1}. ${att.nome}`, margin + 10, yPos);
                    yPos += 12;
                    
                    doc.text(`   Assunto: ${att.assunto}`, margin + 15, yPos);
                    yPos += 12;
                    
                    doc.text(`   Atendente: ${att.atendente}`, margin + 15, yPos);
                    yPos += 12;
                    
                    if (att.horario && att.horario !== 'Não finalizado') {
                        doc.text(`   Horário: ${att.horario}`, margin + 15, yPos);
                        yPos += 12;
                    }
                    
                    yPos += 5;
                });
            } else {
                doc.text(`   Nenhum atendimento registrado para esta equipe.`, margin + 10, yPos);
                yPos += 20;
            }

            yPos += 10;
        });

        // Rodapé
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(
                `Página ${i} de ${pageCount}`,
                pageWidth - margin - 50,
                pageHeight - 20
            );
        }

        doc.save(`detalhado_${pautaName.replace(/\s+/g, '_')}.pdf`);
    },

    /**
     * Exporta estatísticas para PDF - VERSÃO ORIGINAL
     */
    async exportStatisticsToPDF(pautaName, statsData) {
        const { jsPDF } = window.jspdf;
        
        // Verificar checkboxes
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

        const addSectionTitle = (title) => {
            if (yPos > pageHeight - 100) { 
                doc.addPage();
                yPos = margin + 30;
            }
            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            doc.setTextColor(43, 58, 85);
            doc.text(title, margin, yPos);
            yPos += 25;
        };

        // ===== 1. RESUMO GERAL =====
        if (exportGeneral) {
            addSectionTitle("Resumo Geral");
            
            const colWidth = (pageWidth - margin * 2) / 3;
            let startX = margin;
            
            // Atendidos
            doc.setFillColor(220, 255, 220);
            doc.roundedRect(startX, yPos - 15, colWidth - 10, 60, 5, 5, 'F');
            doc.setFont("helvetica", "bold");
            doc.setFontSize(24);
            doc.setTextColor(39, 174, 96);
            doc.text(String(statsData.atendidosCount || 0), startX + (colWidth - 10)/2, yPos + 15, { align: 'center' });
            doc.setFontSize(10);
            doc.setTextColor(0);
            doc.text("Atendidos", startX + (colWidth - 10)/2, yPos + 35, { align: 'center' });
            
            // Faltosos
            startX += colWidth;
            doc.setFillColor(255, 220, 220);
            doc.roundedRect(startX, yPos - 15, colWidth - 10, 60, 5, 5, 'F');
            doc.setFont("helvetica", "bold");
            doc.setFontSize(24);
            doc.setTextColor(192, 57, 43);
            doc.text(String(statsData.faltososCount || 0), startX + (colWidth - 10)/2, yPos + 15, { align: 'center' });
            doc.setFontSize(10);
            doc.setTextColor(0);
            doc.text("Faltosos", startX + (colWidth - 10)/2, yPos + 35, { align: 'center' });
            
            // Tempo Médio
            startX += colWidth;
            doc.setFillColor(220, 235, 255);
            doc.roundedRect(startX, yPos - 15, colWidth - 10, 60, 5, 5, 'F');
            doc.setFont("helvetica", "bold");
            doc.setFontSize(24);
            doc.setTextColor(41, 128, 185);
            const tempoMedio = statsData.avgTimeDirect || 0;
            doc.text(tempoMedio + ' min', startX + (colWidth - 10)/2, yPos + 15, { align: 'center' });
            doc.setFontSize(10);
            doc.setTextColor(0);
            doc.text("Tempo Médio", startX + (colWidth - 10)/2, yPos + 35, { align: 'center' });
            
            yPos += 70;
        }

        // ===== 2. ATENDIMENTOS POR COLABORADOR =====
        if (exportCollaborators && statsData.statsByGroup) {
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
                body: colaboradores,
                theme: 'grid',
                headStyles: { fillColor: [75, 85, 99], textColor: '#FFFFFF' },
                styles: { fontSize: 9 },
                margin: { left: margin, right: margin }
            });
            
            yPos = doc.lastAutoTable.finalY + 20;
        }

        // ===== 3. ATENDIMENTOS POR EQUIPE =====
        if (exportCollaborators && statsData.statsByGroup) {
            if (yPos > pageHeight - 100) { doc.addPage(); yPos = margin + 30; }
            addSectionTitle("Atendimentos por Equipe");
            
            const equipes = Object.entries(statsData.statsByGroup).map(([nome, data]) => [nome, data.total]);
            equipes.sort((a, b) => b[1] - a[1]);
            
            doc.autoTable({
                startY: yPos,
                head: [['Equipe', 'Total']],
                body: equipes,
                theme: 'grid',
                headStyles: { fillColor: [22, 163, 74], textColor: '#FFFFFF' },
                styles: { fontSize: 9 },
                margin: { left: margin, right: margin }
            });
            
            yPos = doc.lastAutoTable.finalY + 20;
        }

        // ===== 4. AGENDADOS POR HORÁRIO =====
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

        // ===== 5. ATENDIMENTOS POR HORÁRIO =====
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

        // ===== 6. FALTOSOS POR HORÁRIO =====
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

        // ===== 7. DEMANDAS POR ASSUNTO =====
        if (exportSubjects && statsData.statsBySubject && Object.keys(statsData.statsBySubject).length > 0) {
            if (yPos > pageHeight - 100) { doc.addPage(); yPos = margin + 30; }
            addSectionTitle("Demandas por Assunto");
            
            const subjects = Object.entries(statsData.statsBySubject)
                .sort(([,a], [,b]) => b.total - a.total)
                .map(([name, data]) => [
                    name.length > 30 ? name.substring(0, 27) + '...' : name,
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
                body: subjects,
                foot: [['TOTAL GERAL', totalGeral, totalAtendidos, totalFaltosos]],
                theme: 'grid',
                headStyles: { fillColor: [75, 85, 99], textColor: '#FFFFFF' },
                footStyles: { fillColor: [240, 240, 240], fontStyle: 'bold' },
                styles: { fontSize: 8 },
                columnStyles: { 0: { cellWidth: 180 } },
                margin: { left: margin, right: margin }
            });
        }

        // Rodapé
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

        doc.save(`resumo_${pautaName.replace(/\s+/g, '_')}.pdf`);
    }
};

// ========================================================
// FUNÇÕES AVULSAS
// ========================================================

export const renderStatisticsModal = (allAssisted, useDelegationFlow, pautaName) => {
    return StatisticsService.showModal(allAssisted, useDelegationFlow, pautaName);
};

export const exportStatisticsToPDF = (pautaName, statsData) => {
    return StatisticsService.exportStatisticsToPDF(pautaName, statsData);
};

// Tornar global
window.StatisticsService = StatisticsService;

console.log("✅ estatisticas.js carregado com sucesso!");
