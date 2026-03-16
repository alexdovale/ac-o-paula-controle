/**
 * estatisticas.js - SIGAP
 * Versão COMPLETA com 3 tipos de PDF
 * 
 * Funcionalidades:
 * ✅ Estatísticas por colaborador (baseado no cadastro)
 * ✅ Estatísticas por equipe (baseado no cadastro)
 * ✅ Inclui colaboradores que não atenderam (mostra 0)
 * ✅ PDF Resumo (estatísticas completas)
 * ✅ PDF por Equipe (detalhado com atendimentos individuais)
 * ✅ PDF por Grupo (visão geral - apenas total do grupo e lista de membros)
 */

// ========================================================
// STATISTICS SERVICE - Objeto com todas as funções de estatísticas
// ========================================================

export const StatisticsService = {
    
    /* ========================================================
       1. FUNÇÕES AUXILIARES
       ======================================================== */
    
    /**
     * 1.1 Carrega a lista de colaboradores do sistema
     * @returns {Array} - Lista de colaboradores
     */
    carregarColaboradores() {
        let colaboradores = [];
        
        // Tenta carregar do window.app (se existir)
        if (window.app && window.app.colaboradores) {
            colaboradores = window.app.colaboradores;
            console.log("📋 Estatísticas: Colaboradores carregados do window.app:", colaboradores.length);
        } 
        // Tenta carregar do localStorage
        else {
            const stored = localStorage.getItem('sigap_colaboradores');
            if (stored) {
                try {
                    colaboradores = JSON.parse(stored);
                    console.log("📋 Estatísticas: Colaboradores carregados do localStorage:", colaboradores.length);
                } catch (e) {
                    console.error("Erro ao carregar colaboradores:", e);
                }
            }
        }
        
        return colaboradores;
    },

    /**
     * 1.2 Calcula diferença em minutos entre duas datas
     */
    getTimeDifferenceInMinutes(startTimeISO, endTimeISO) {
        if (!startTimeISO || !endTimeISO) return null;
        const start = new Date(startTimeISO);
        const end = new Date(endTimeISO);
        if (isNaN(start) || isNaN(end)) return null;
        return Math.round((end - start) / 60000);
    },

    /* ========================================================
       2. FUNÇÃO PRINCIPAL - RENDERIZAR MODAL
       ======================================================== */

    /**
     * 2.1 Renderiza o modal de estatísticas
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

        // ===== CARREGAR COLABORADORES DO CADASTRO =====
        const colaboradoresCadastro = this.carregarColaboradores();
        
        // Filtrar dados
        const atendidos = allAssisted.filter(a => a.status === 'atendido');
        const faltosos = allAssisted.filter(a => a.status === 'faltoso');

        // ===== PROCESSAR DADOS DOS ATENDIMENTOS =====
        
        // Mapear atendimentos por colaborador (usando nome como chave)
        const atendimentosPorColaborador = {};
        
        atendidos.forEach(a => {
            // Extrair nome do atendente
            let nomeAtendente = 'Não informado';
            if (a.attendant) {
                if (typeof a.attendant === 'object') {
                    nomeAtendente = a.attendant.nome || a.attendant.name || 'Não informado';
                } else {
                    nomeAtendente = String(a.attendant);
                }
            }
            
            // Contabilizar atendimento
            if (!atendimentosPorColaborador[nomeAtendente]) {
                atendimentosPorColaborador[nomeAtendente] = 0;
            }
            atendimentosPorColaborador[nomeAtendente]++;
        });

        // ===== COMBINAR COM CADASTRO DE COLABORADORES =====
        
        // Criar mapa de colaboradores por nome (para busca rápida)
        const mapaColaboradores = {};
        colaboradoresCadastro.forEach(col => {
            mapaColaboradores[col.nome] = col;
        });
        
        // Lista completa de colaboradores (do cadastro)
        const todosColaboradores = colaboradoresCadastro.map(col => ({
            nome: col.nome,
            cargo: col.cargo || 'Sem cargo',
            equipe: col.equipe ? `Equipe ${col.equipe}` : 'Equipe Não Definida',
            atendimentos: atendimentosPorColaborador[col.nome] || 0
        }));
        
        // Adicionar colaboradores que apareceram nos atendimentos mas não estão no cadastro
        Object.keys(atendimentosPorColaborador).forEach(nome => {
            if (!mapaColaboradores[nome]) {
                todosColaboradores.push({
                    nome: nome,
                    cargo: 'Não cadastrado',
                    equipe: 'Equipe Não Definida',
                    atendimentos: atendimentosPorColaborador[nome]
                });
            }
        });

        // ===== AGRUPAR POR EQUIPE =====
        
        // Primeiro, coletar todas as equipes do cadastro
        const equipesCadastro = {};
        colaboradoresCadastro.forEach(col => {
            const nomeEquipe = col.equipe ? `Equipe ${col.equipe}` : 'Equipe Não Definida';
            if (!equipesCadastro[nomeEquipe]) {
                equipesCadastro[nomeEquipe] = {
                    nome: nomeEquipe,
                    total: 0,
                    colaboradores: []
                };
            }
        });
        
        // Adicionar equipe padrão para colaboradores não cadastrados
        if (!equipesCadastro['Equipe Não Definida']) {
            equipesCadastro['Equipe Não Definida'] = {
                nome: 'Equipe Não Definida',
                total: 0,
                colaboradores: []
            };
        }
        
        // Preencher com dados dos colaboradores
        todosColaboradores.forEach(col => {
            const nomeEquipe = col.equipe;
            if (equipesCadastro[nomeEquipe]) {
                equipesCadastro[nomeEquipe].colaboradores.push(col);
                equipesCadastro[nomeEquipe].total += col.atendimentos;
            } else {
                // Se a equipe não existe no cadastro, criar
                if (!equipesCadastro[nomeEquipe]) {
                    equipesCadastro[nomeEquipe] = {
                        nome: nomeEquipe,
                        total: 0,
                        colaboradores: []
                    };
                }
                equipesCadastro[nomeEquipe].colaboradores.push(col);
                equipesCadastro[nomeEquipe].total += col.atendimentos;
            }
        });

        // Ordenar equipes por nome
        const equipesOrdenadas = Object.values(equipesCadastro).sort((a, b) => 
            a.nome.localeCompare(b.nome)
        );

        // Ordenar colaboradores por nome dentro de cada equipe
        equipesOrdenadas.forEach(equipe => {
            equipe.colaboradores.sort((a, b) => a.nome.localeCompare(b.nome));
        });

        // ===== ESTATÍSTICAS POR ASSUNTO =====
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

        // ===== ESTATÍSTICAS POR HORÁRIO =====
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

        // ===== CÁLCULO DE TEMPOS MÉDIOS =====
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

        // ===== HTML DOS COLABORADORES =====
        
        // Lista de colaboradores (todos, com atendimentos)
        const colaboradoresHTML = `
            <div class="bg-white p-3 md:p-4 rounded-lg border">
                <h3 class="text-base md:text-lg font-semibold text-gray-800 mb-2">Atendimentos por Colaborador</h3>
                <div class="max-h-[40vh] overflow-y-auto">
                    <table class="w-full text-xs md:text-sm text-left">
                        <thead class="text-[10px] md:text-xs text-gray-700 uppercase bg-gray-100 sticky top-0">
                            <tr>
                                <th class="px-2 md:px-4 py-1 md:py-2">Colaborador</th>
                                <th class="px-2 md:px-4 py-1 md:py-2">Cargo</th>
                                <th class="px-2 md:px-4 py-1 md:py-2">Equipe</th>
                                <th class="px-2 md:px-4 py-1 md:py-2 text-right">Atend.</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${todosColaboradores.map(col => `
                                <tr class="border-b hover:bg-gray-50">
                                    <td class="px-2 md:px-4 py-1 md:py-2 font-medium">${col.nome}</td>
                                    <td class="px-2 md:px-4 py-1 md:py-2 text-xs">${col.cargo}</td>
                                    <td class="px-2 md:px-4 py-1 md:py-2 text-xs">${col.equipe}</td>
                                    <td class="px-2 md:px-4 py-1 md:py-2 text-right font-bold ${col.atendimentos > 0 ? 'text-green-600' : 'text-gray-400'}">${col.atendimentos}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                        <tfoot class="bg-gray-100 font-bold">
                            <tr>
                                <td colspan="3" class="px-2 md:px-4 py-1 md:py-2">TOTAL</td>
                                <td class="px-2 md:px-4 py-1 md:py-2 text-right">${atendidos.length}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        `;

        // HTML das equipes
        const equipesHTML = `
            <div class="bg-white p-3 md:p-4 rounded-lg border">
                <h3 class="text-base md:text-lg font-semibold text-gray-800 mb-2">Atendimentos por Equipe</h3>
                <div class="max-h-[40vh] overflow-y-auto">
                    ${equipesOrdenadas.map(equipe => `
                        <div class="mb-4 border rounded-lg overflow-hidden">
                            <div class="bg-gray-100 px-3 py-2 font-bold flex justify-between items-center">
                                <span>${equipe.nome}</span>
                                <span class="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs">Total: ${equipe.total}</span>
                            </div>
                            <table class="w-full text-xs">
                                <tbody>
                                    ${equipe.colaboradores.map(col => `
                                        <tr class="border-b">
                                            <td class="px-3 py-1">${col.nome}</td>
                                            <td class="px-3 py-1 text-xs text-gray-600">${col.cargo}</td>
                                            <td class="px-3 py-1 text-right font-bold ${col.atendimentos > 0 ? 'text-green-600' : 'text-gray-400'}">${col.atendimentos}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        // ===== HTML DOS BOTÕES (AGORA COM 3 BOTÕES) =====
        const botoesExportacaoHTML = `
            <div class="bg-white p-3 md:p-4 rounded-lg border mt-4">
                <h3 class="text-base md:text-lg font-semibold text-gray-800 mb-3">Exportar Relatórios</h3>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <button id="export-stats-pdf-btn" class="bg-blue-600 text-white font-bold py-2 px-3 rounded-lg hover:bg-blue-700 text-xs md:text-sm transition-colors">
                        📊 PDF Resumo
                    </button>
                    <button id="export-equipes-pdf-btn" class="bg-purple-600 text-white font-bold py-2 px-3 rounded-lg hover:bg-purple-700 text-xs md:text-sm transition-colors">
                        👥 PDF por Equipe (Detalhado)
                    </button>
                    <button id="export-grupos-pdf-btn" class="bg-green-600 text-white font-bold py-2 px-3 rounded-lg hover:bg-green-700 text-xs md:text-sm transition-colors">
                        📋 PDF por Grupo (Visão Geral)
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
                
                ${colaboradoresHTML}
                ${equipesHTML}
            </div>
        </div>
        `;
        
        content.innerHTML = html;

        // Configurar botões de exportar PDF
        this.configurarBotoesPDF(pautaName, {
            agendadosCount: allAssisted.length,
            atendidosCount: atendidos.length,
            faltososCount: faltosos.length,
            avgTimeDirect,
            avgTimeDelegated,
            useDelegationFlow,
            todosColaboradores,
            equipesOrdenadas,
            statsBySubject,
            statsByScheduledTime: sortedScheduledTimes.map(time => ({ time, count: statsByScheduledTime[time] })),
            statsByTime: sortedTimes.map(time => ({ time, count: statsByTime[time] })),
            statsByTimeFaltosos: sortedTimesFaltosos.map(time => ({ time, count: statsByTimeFaltosos[time] }))
        });
    },

    /* ========================================================
       3. CONFIGURAÇÃO DOS BOTÕES PDF
       ======================================================== */

    /**
     * 3.1 Configura os botões de exportação PDF
     */
    configurarBotoesPDF(pautaName, dados) {
        // Botão PDF Resumo
        const exportBtn = document.getElementById('export-stats-pdf-btn');
        if (exportBtn) {
            const newExportBtn = exportBtn.cloneNode(true);
            exportBtn.parentNode.replaceChild(newExportBtn, exportBtn);
            
            newExportBtn.addEventListener('click', () => {
                newExportBtn.textContent = 'Gerando PDF Resumo...';
                newExportBtn.disabled = true;

                this.exportStatisticsToPDF(pautaName, dados).finally(() => {
                    newExportBtn.textContent = '📊 PDF Resumo';
                    newExportBtn.disabled = false;
                });
            });
        }

        // Botão PDF por Equipe (Detalhado)
        const exportEquipesBtn = document.getElementById('export-equipes-pdf-btn');
        if (exportEquipesBtn) {
            const newEquipesBtn = exportEquipesBtn.cloneNode(true);
            exportEquipesBtn.parentNode.replaceChild(newEquipesBtn, exportEquipesBtn);
            
            newEquipesBtn.addEventListener('click', () => {
                newEquipesBtn.textContent = 'Gerando PDF por Equipe...';
                newEquipesBtn.disabled = true;

                this.exportEquipesPDF(pautaName, dados).finally(() => {
                    newEquipesBtn.textContent = '👥 PDF por Equipe (Detalhado)';
                    newEquipesBtn.disabled = false;
                });
            });
        }

        // Botão PDF por Grupo (Visão Geral) - NOVO
        const exportGruposBtn = document.getElementById('export-grupos-pdf-btn');
        if (exportGruposBtn) {
            const newGruposBtn = exportGruposBtn.cloneNode(true);
            exportGruposBtn.parentNode.replaceChild(newGruposBtn, exportGruposBtn);
            
            newGruposBtn.addEventListener('click', () => {
                newGruposBtn.textContent = 'Gerando PDF por Grupo...';
                newGruposBtn.disabled = true;

                this.exportGruposPDF(pautaName, dados).finally(() => {
                    newGruposBtn.textContent = '📋 PDF por Grupo (Visão Geral)';
                    newGruposBtn.disabled = false;
                });
            });
        }
    },

    /* ========================================================
       4. FUNÇÕES DE EXPORTAÇÃO PDF
       ======================================================== */

    /**
     * 4.1 Exporta PDF Resumo (visual original)
     */
    async exportStatisticsToPDF(pautaName, dados) {
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
            doc.text(String(dados.atendidosCount || 0), startX + (colWidth - 10)/2, yPos + 15, { align: 'center' });
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
            doc.text(String(dados.faltososCount || 0), startX + (colWidth - 10)/2, yPos + 15, { align: 'center' });
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
            const tempoMedio = dados.avgTimeDirect || 0;
            doc.text(tempoMedio + ' min', startX + (colWidth - 10)/2, yPos + 15, { align: 'center' });
            doc.setFontSize(10);
            doc.setTextColor(0);
            doc.text("Tempo Médio", startX + (colWidth - 10)/2, yPos + 35, { align: 'center' });
            
            yPos += 70;
        }

        // ===== 2. ATENDIMENTOS POR COLABORADOR =====
        if (exportCollaborators && dados.todosColaboradores && dados.todosColaboradores.length > 0) {
            addSectionTitle("Atendimentos por Colaborador");
            
            const colaboradoresTable = dados.todosColaboradores.map(col => [
                col.nome,
                col.cargo,
                col.equipe,
                col.atendimentos.toString()
            ]);
            
            doc.autoTable({
                startY: yPos,
                head: [['Colaborador', 'Cargo', 'Equipe', 'Atend.']],
                body: colaboradoresTable,
                theme: 'grid',
                headStyles: { fillColor: [75, 85, 99], textColor: '#FFFFFF' },
                styles: { fontSize: 8 },
                margin: { left: margin, right: margin }
            });
            
            yPos = doc.lastAutoTable.finalY + 20;
        }

        // ===== 3. ATENDIMENTOS POR EQUIPE =====
        if (exportCollaborators && dados.equipesOrdenadas && dados.equipesOrdenadas.length > 0) {
            if (yPos > pageHeight - 100) { doc.addPage(); yPos = margin + 30; }
            addSectionTitle("Atendimentos por Equipe");
            
            const equipesTable = dados.equipesOrdenadas.map(equipe => [
                equipe.nome,
                equipe.total.toString(),
                equipe.colaboradores.length.toString()
            ]);
            
            doc.autoTable({
                startY: yPos,
                head: [['Equipe', 'Total', 'Membros']],
                body: equipesTable,
                theme: 'grid',
                headStyles: { fillColor: [22, 163, 74], textColor: '#FFFFFF' },
                styles: { fontSize: 9 },
                margin: { left: margin, right: margin }
            });
            
            yPos = doc.lastAutoTable.finalY + 20;
        }

        // ===== 4. AGENDADOS POR HORÁRIO =====
        if (exportScheduledTime && dados.statsByScheduledTime && dados.statsByScheduledTime.length > 0) {
            if (yPos > pageHeight - 100) { doc.addPage(); yPos = margin + 30; }
            addSectionTitle("Agendados por Horário");
            
            doc.autoTable({
                startY: yPos,
                head: [['Horário', 'Quantidade']],
                body: dados.statsByScheduledTime.map(item => [item.time, item.count]),
                foot: [['Total', dados.agendadosCount || 0]],
                theme: 'grid',
                headStyles: { fillColor: [22, 163, 74], textColor: '#FFFFFF' },
                footStyles: { fillColor: [240, 240, 240], fontStyle: 'bold' },
                styles: { fontSize: 9 },
                margin: { left: margin, right: margin }
            });
            
            yPos = doc.lastAutoTable.finalY + 20;
        }

        // ===== 5. ATENDIMENTOS POR HORÁRIO =====
        if (exportTimes && dados.statsByTime && dados.statsByTime.length > 0) {
            if (yPos > pageHeight - 100) { doc.addPage(); yPos = margin + 30; }
            addSectionTitle("Atendimentos por Horário (Chegada)");
            
            doc.autoTable({
                startY: yPos,
                head: [['Horário', 'Quantidade']],
                body: dados.statsByTime.map(item => [item.time, item.count]),
                foot: [['Total', dados.atendidosCount || 0]],
                theme: 'grid',
                headStyles: { fillColor: [22, 163, 74], textColor: '#FFFFFF' },
                footStyles: { fillColor: [240, 240, 240], fontStyle: 'bold' },
                styles: { fontSize: 9 },
                margin: { left: margin, right: margin }
            });
            
            yPos = doc.lastAutoTable.finalY + 20;
        }

        // ===== 6. FALTOSOS POR HORÁRIO =====
        if (exportAbsenteesTime && dados.statsByTimeFaltosos && dados.statsByTimeFaltosos.length > 0) {
            if (yPos > pageHeight - 100) { doc.addPage(); yPos = margin + 30; }
            addSectionTitle("Faltosos por Horário");
            
            doc.autoTable({
                startY: yPos,
                head: [['Horário', 'Quantidade']],
                body: dados.statsByTimeFaltosos.map(item => [item.time, item.count]),
                foot: [['Total', dados.faltososCount || 0]],
                theme: 'grid',
                headStyles: { fillColor: [220, 38, 38], textColor: '#FFFFFF' },
                footStyles: { fillColor: [255, 240, 240], fontStyle: 'bold' },
                styles: { fontSize: 9 },
                margin: { left: margin, right: margin }
            });
            
            yPos = doc.lastAutoTable.finalY + 20;
        }

        // ===== 7. DEMANDAS POR ASSUNTO =====
        if (exportSubjects && dados.statsBySubject && Object.keys(dados.statsBySubject).length > 0) {
            if (yPos > pageHeight - 100) { doc.addPage(); yPos = margin + 30; }
            addSectionTitle("Demandas por Assunto");
            
            const subjects = Object.entries(dados.statsBySubject)
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
    },

    /**
     * 4.2 Exporta PDF por Equipe (detalhado)
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
        doc.text(`RELATÓRIO DETALHADO POR EQUIPE - ${pautaName}`, margin, yPos);
        yPos += 20;
        
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, margin, yPos);
        yPos += 20;
        
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text(`Total de Atendimentos: ${dados.atendidosCount}`, margin, yPos);
        yPos += 25;

        // Listar todas as equipes
        dados.equipesOrdenadas.forEach((equipe) => {
            if (yPos > pageHeight - 150) {
                doc.addPage();
                yPos = margin + 30;
            }

            // Título da equipe
            doc.setFontSize(14);
            doc.setTextColor(0, 102, 204);
            doc.setFont("helvetica", "bold");
            doc.text(`${equipe.nome} - TOTAL: ${equipe.total} atendimentos`, margin, yPos);
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

            equipe.colaboradores.forEach((col) => {
                if (yPos > pageHeight - 40) {
                    doc.addPage();
                    yPos = margin + 30;
                    
                    // Repetir título na nova página
                    doc.setFontSize(12);
                    doc.setTextColor(0, 102, 204);
                    doc.setFont("helvetica", "bold");
                    doc.text(`${equipe.nome} (continuação)`, margin, yPos);
                    yPos += 20;
                    
                    doc.setFontSize(9);
                }
                
                doc.text(col.nome, margin + 10, yPos);
                doc.text(col.cargo, margin + 200, yPos);
                
                doc.setFont("helvetica", "bold");
                doc.setTextColor(col.atendimentos > 0 ? 22 : 150, col.atendimentos > 0 ? 163 : 150, col.atendimentos > 0 ? 74 : 150);
                doc.text(col.atendimentos.toString(), pageWidth - margin - 50, yPos);
                
                doc.setFont("helvetica", "normal");
                doc.setTextColor(60, 60, 60);
                
                yPos += 15;
            });

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

        doc.save(`equipe_detalhada_${pautaName.replace(/\s+/g, '_')}.pdf`);
    },

    /* ========================================================
       5. PDF POR GRUPO - VISÃO GERAL (NOVO)
       ======================================================== */

    /**
     * 5.1 Exporta PDF por Grupo (visão geral - apenas total do grupo e lista de membros)
     */
    async exportGruposPDF(pautaName, dados) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 40;
        let yPos = margin + 30;

        // ===== TÍTULO =====
        doc.setFontSize(20);
        doc.setTextColor(22, 163, 74);
        doc.setFont("helvetica", "bold");
        doc.text("RELATÓRIO DE ATENDIMENTOS POR GRUPO", pageWidth / 2, yPos, { align: "center" });
        yPos += 20;
        
        doc.setFontSize(12);
        doc.setTextColor(80, 80, 80);
        doc.setFont("helvetica", "normal");
        doc.text(`Pauta: ${pautaName}`, margin, yPos);
        yPos += 15;
        
        doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, margin, yPos);
        yPos += 25;

        // ===== TOTAL GERAL =====
        doc.setFontSize(14);
        doc.setTextColor(0, 0, 0);
        doc.setFont("helvetica", "bold");
        doc.text(`TOTAL GERAL DE ATENDIMENTOS: ${dados.atendidosCount}`, margin, yPos);
        yPos += 20;

        // ===== LINHA SEPARADORA =====
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, yPos - 5, pageWidth - margin, yPos - 5);
        yPos += 10;

        // ===== LISTAR CADA GRUPO =====
        dados.equipesOrdenadas.forEach((equipe, index) => {
            // Verificar espaço na página
            if (yPos > pageHeight - 100) {
                doc.addPage();
                yPos = margin + 30;
            }

            // Título do Grupo com fundo cinza claro
            doc.setFillColor(240, 240, 240);
            doc.rect(margin, yPos - 12, pageWidth - (margin * 2), 25, 'F');
            
            doc.setFontSize(16);
            doc.setTextColor(0, 102, 204);
            doc.setFont("helvetica", "bold");
            doc.text(`${equipe.nome}`, margin + 10, yPos);
            yPos += 15;
            
            doc.setFontSize(14);
            doc.setTextColor(22, 163, 74);
            doc.text(`Total de Atendimentos: ${equipe.total}`, margin + 10, yPos);
            yPos += 20;

            // Lista de Membros
            doc.setFontSize(11);
            doc.setTextColor(60, 60, 60);
            doc.setFont("helvetica", "bold");
            doc.text("Membros:", margin + 10, yPos);
            yPos += 12;
            
            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);
            
            // Ordenar membros por nome
            const membrosOrdenados = [...equipe.colaboradores].sort((a, b) => a.nome.localeCompare(b.nome));
            
            membrosOrdenados.forEach((membro) => {
                if (yPos > pageHeight - 40) {
                    doc.addPage();
                    yPos = margin + 30;
                    
                    // Repetir título do grupo na nova página
                    doc.setFontSize(14);
                    doc.setTextColor(0, 102, 204);
                    doc.setFont("helvetica", "bold");
                    doc.text(`${equipe.nome} (continuação)`, margin, yPos);
                    yPos += 15;
                    
                    doc.setFontSize(10);
                    doc.setFont("helvetica", "normal");
                }
                
                doc.text(`• ${membro.nome}`, margin + 20, yPos);
                yPos += 12;
            });

            yPos += 15; // Espaço extra entre grupos
        });

        // ===== RODAPÉ COM TOTAL =====
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

        doc.save(`grupos_${pautaName.replace(/\s+/g, '_')}.pdf`);
    }
};

// ========================================================
// FUNÇÕES AVULSAS (para compatibilidade)
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
