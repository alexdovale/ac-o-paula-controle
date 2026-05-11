/**
 * estatisticas.js - Versão Completa e Corrigida
 * Funcionalidades:
 * - PDF por Equipe mostra TODOS os colaboradores da equipe (cadastro)
 * - Inclui quem não atendeu (mostra 0 atendimentos)
 * - Baseado nos dados de colaboradores da gestão
 * - PDF por Grupo (apenas total do grupo + lista de membros)
 * - Botão para ocultar/mostrar totais individuais
 * - CONTAGEM CORRIGIDA cruzando os dados do atendimento com o banco de colaboradores.
 * - VISUAL APRIMORADO E SEM REDUNDÂNCIAS
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
            titleEl.innerHTML = `<span class="text-blue-600 mr-2">📊</span> Estatísticas - <span class="text-gray-700">${pautaName}</span>`;
        }

        const content = document.getElementById('statistics-content');
        if (!content) {
            console.error("Elemento statistics-content não encontrado");
            return;
        }

        // Mostrar loading
        content.innerHTML = `<div class="flex items-center justify-center h-64"><p class="text-gray-500 font-medium animate-pulse">Calculando estatísticas...</p></div>`;

        // Filtrar dados
        const atendidos = allAssisted.filter(a => a.status === 'atendido');
        const faltosos = allAssisted.filter(a => a.status === 'faltoso');

        // ===== BUSCAR DADOS DOS COLABORADORES DO SISTEMA =====
        let todosColaboradores = [];
        
        if (window.app && window.app.colaboradores) {
            todosColaboradores = window.app.colaboradores;
        } else {
            const stored = localStorage.getItem('sigap_colaboradores');
            if (stored) {
                try {
                    todosColaboradores = JSON.parse(stored);
                } catch (e) {
                    console.error("Erro ao parsear colaboradores:", e);
                }
            }
        }
        
        // Organizar colaboradores por equipe e criar mapa de busca rápida
        const colaboradoresPorEquipe = {};
        const mapaNomeParaEquipe = {};
        
        todosColaboradores.forEach(col => {
            const equipe = col.equipe ? `Equipe ${col.equipe}` : 'Equipe Não Definida';
            const nomeNormalizado = col.nome.trim();
            
            mapaNomeParaEquipe[nomeNormalizado] = equipe;
            
            if (!colaboradoresPorEquipe[equipe]) {
                colaboradoresPorEquipe[equipe] = [];
            }
            
            colaboradoresPorEquipe[equipe].push({
                nome: nomeNormalizado,
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
        
        // Preencher com dados reais de atendimentos (CORRIGIDO)
        atendidos.forEach(a => {
            const rawAttendant = a.attendedBy || a.attendant;
            if (!rawAttendant) return;

            let attendantName = '';
            let groupName = '';

            if (typeof rawAttendant === 'object') {
                attendantName = (rawAttendant.nome || rawAttendant.name || '').trim();
                groupName = rawAttendant.equipe ? `Equipe ${rawAttendant.equipe}` : '';
            } else {
                attendantName = String(rawAttendant).trim();
            }
            
            // Cruzamento de dados: Se a equipe não veio no atendimento, busca no cadastro
            if (!groupName || groupName === 'Equipe undefined') {
                groupName = mapaNomeParaEquipe[attendantName] || 'Equipe Não Definida';
            }

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
                horario: a.attendedTime ? new Date(a.attendedTime.seconds ? a.attendedTime.seconds * 1000 : a.attendedTime).toLocaleString('pt-BR') : 'Não finalizado'
            });
        });
        
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

        // Estatísticas por tipo de ação rápida
        const statsByAcaoRapida = {};
        atendidos.forEach(a => {
            if (a.tipoAcaoRapida) {
                statsByAcaoRapida[a.tipoAcaoRapida] = (statsByAcaoRapida[a.tipoAcaoRapida] || 0) + 1;
            }
        });
        const totalAcoesRapidas = Object.values(statsByAcaoRapida).reduce((s, v) => s + v, 0);
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
            <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center">
                <span class="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mb-2 text-sm">⏱️</span>
                <p class="text-2xl font-black text-slate-800">${avgTimeDelegated} min</p>
                <p class="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1 text-center leading-tight">Média Delegação</p>
            </div>` : '';

        // HTML do bloco de ações rápidas
        const acoesRapidasCores = {
            'Reagendamento':       { icon: '🔄', bg: '#fffbeb', border: '#fcd34d', text: '#92400e' },
            'Agendamento':         { icon: '📅', bg: '#ecfdf5', border: '#6ee7b7', text: '#065f46' },
            'Consulta Processual': { icon: '🔍', bg: '#f5f3ff', border: '#c4b5fd', text: '#4c1d95' },
            'Outros Assuntos':     { icon: '⚙️', bg: '#f9fafb', border: '#d1d5db', text: '#374151' }
        };
        
        const acoesRapidasHTML = totalAcoesRapidas > 0 ? `
            <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <h3 class="text-base font-bold text-slate-800 mb-3 flex items-center gap-2">
                    <span class="text-blue-500">⚡</span> Ações Rápidas Utilizadas
                </h3>
                <div class="grid grid-cols-2 gap-3">
                    ${Object.entries(statsByAcaoRapida).sort(([,a],[,b]) => b-a).map(([tipo, qtd]) => {
                        const cfg = acoesRapidasCores[tipo] || { icon: '⚡', bg: '#eff6ff', border: '#93c5fd', text: '#1e40af' };
                        return `<div style="background:${cfg.bg}; border:1px solid ${cfg.border}; color:${cfg.text}" class="flex flex-col rounded-xl px-3 py-2.5">
                            <span class="text-[10px] font-bold uppercase tracking-wider opacity-80 mb-1">${cfg.icon} ${tipo}</span>
                            <span class="text-xl font-black">${qtd}</span>
                        </div>`;
                    }).join('')}
                </div>
                <div class="mt-3 pt-3 border-t border-slate-100 flex justify-between items-center text-xs text-slate-500">
                    <span class="font-medium">Total de ações ágeis</span>
                    <span class="font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">${totalAcoesRapidas}</span>
                </div>
            </div>
        ` : '';

        // HTML para equipes com controle de visualização
        const groupsHTML = sortedGroups.map(({groupName, total, collaborators, todosColaboradores}, index) => {
            const colaboradoresCompletos = [];
            
            todosColaboradores.forEach(col => {
                const atendimentos = collaborators.find(c => c.name === col.nome)?.count || 0;
                colaboradoresCompletos.push({
                    nome: col.nome,
                    atendimentos: atendimentos,
                    cargo: col.cargo
                });
            });
            
            colaboradoresCompletos.sort((a, b) => b.atendimentos - a.atendimentos);
            
            const collaboratorsRows = colaboradoresCompletos.map(({nome, atendimentos, cargo}) => `
                <tr class="border-b border-slate-50 collaborator-row group-${index} hover:bg-slate-50/50 transition-colors">
                    <td class="px-3 md:px-4 py-2.5 font-medium text-xs md:text-sm text-slate-700 pl-4 md:pl-6">${nome}</td>
                    <td class="px-3 md:px-4 py-2.5 text-[11px] md:text-xs text-slate-500">${cargo || '-'}</td>
                    <td class="px-3 md:px-4 py-2.5 text-right text-xs md:text-sm font-bold atendimento-valor-${index} ${atendimentos > 0 ? 'text-green-600' : 'text-slate-400'}">${atendimentos > 0 ? atendimentos : '-'}</td>
                </tr>
            `).join('');

            const hasCollaborators = colaboradoresCompletos.length > 0;

            return `
                <div class="mb-4 border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white group-container" data-group-index="${index}">
                    <div class="bg-slate-50/80 px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200">
                        <div class="flex items-center gap-3">
                            <span class="font-bold text-slate-800 text-sm flex items-center gap-2">
                                <span class="text-blue-500">👥</span> ${groupName}
                            </span>
                            <div class="flex gap-2">
                                <span class="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md text-[10px] font-bold border border-blue-200" title="Total de Atendimentos">Atend.: ${total}</span>
                                <span class="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-md text-[10px] font-bold border border-purple-200" title="Membros Cadastrados">Membros: ${todosColaboradores.length}</span>
                            </div>
                        </div>
                        <div class="flex gap-2">
                            <button class="hide-individual-btn text-[11px] font-medium text-slate-600 bg-white px-2.5 py-1.5 rounded-md border border-slate-200 hover:bg-slate-100 transition-colors shadow-sm" data-group-index="${index}">
                                Ocultar Atendimentos
                            </button>
                            ${hasCollaborators ? `
                                <button class="toggle-details-btn text-[11px] font-medium text-slate-600 bg-white px-2.5 py-1.5 rounded-md border border-slate-200 hover:bg-slate-100 transition-colors shadow-sm" data-group-index="${index}">
                                    Ocultar Lista
                                </button>
                            ` : ''}
                        </div>
                    </div>
                    ${hasCollaborators ? `
                        <table class="w-full text-left collaborators-table" data-group-index="${index}">
                            <thead class="text-[10px] text-slate-500 uppercase tracking-wider bg-white border-b border-slate-100">
                                <tr>
                                    <th class="px-3 md:px-4 py-2 font-semibold pl-4 md:pl-6">Colaborador</th>
                                    <th class="px-3 md:px-4 py-2 font-semibold">Cargo</th>
                                    <th class="px-3 md:px-4 py-2 font-semibold text-right atendimento-header-${index}">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${collaboratorsRows}
                            </tbody>
                        </table>
                    ` : `
                        <div class="p-4 text-xs text-slate-500 italic text-center bg-white">Nenhum colaborador cadastrado nesta equipe.</div>
                    `}
                </div>
            `;
        }).join('');

        // HTML dos botões de exportação (UI Premium)
        const botoesExportacaoHTML = `
            <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm mt-4">
                <h3 class="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <span class="text-indigo-500">🖨️</span> Exportar Relatórios
                </h3>
                <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <button id="export-stats-pdf-btn" class="flex flex-col items-center justify-center gap-1.5 w-full bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-200 font-bold py-3 px-2 rounded-xl text-xs transition-all shadow-sm">
                        <span class="text-blue-500 text-lg">📊</span> Resumo
                    </button>
                    <button id="export-equipes-pdf-btn" class="flex flex-col items-center justify-center gap-1.5 w-full bg-slate-50 hover:bg-purple-50 text-slate-700 hover:text-purple-700 border border-slate-200 hover:border-purple-200 font-bold py-3 px-2 rounded-xl text-xs transition-all shadow-sm">
                        <span class="text-purple-500 text-lg">👥</span> Equipes
                    </button>
                    <button id="export-grupo-pdf-btn" class="flex flex-col items-center justify-center gap-1.5 w-full bg-slate-50 hover:bg-green-50 text-slate-700 hover:text-green-700 border border-slate-200 hover:border-green-200 font-bold py-3 px-2 rounded-xl text-xs transition-all shadow-sm">
                        <span class="text-green-500 text-lg">📋</span> Grupos
                    </button>
                    <button id="export-stats-detalhado-btn" class="flex flex-col items-center justify-center gap-1.5 w-full bg-slate-50 hover:bg-orange-50 text-slate-700 hover:text-orange-700 border border-slate-200 hover:border-orange-200 font-bold py-3 px-2 rounded-xl text-xs transition-all shadow-sm">
                        <span class="text-orange-500 text-lg">📖</span> Detalhado
                    </button>
                </div>
                
                <div class="mt-5 pt-4 border-t border-slate-100">
                    <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Configurar Relatório Resumo:</p>
                    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 text-[11px] font-medium text-slate-600">
                        <label class="flex items-center gap-2 cursor-pointer hover:text-slate-900"><input type="checkbox" id="export-general" class="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" checked> Geral</label>
                        <label class="flex items-center gap-2 cursor-pointer hover:text-slate-900"><input type="checkbox" id="export-collaborators" class="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" checked> Equipes</label>
                        <label class="flex items-center gap-2 cursor-pointer hover:text-slate-900"><input type="checkbox" id="export-subjects" class="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" checked> Assuntos</label>
                        <label class="flex items-center gap-2 cursor-pointer hover:text-slate-900"><input type="checkbox" id="export-scheduled-time" class="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" checked> Agenda</label>
                        <label class="flex items-center gap-2 cursor-pointer hover:text-slate-900"><input type="checkbox" id="export-times" class="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" checked> Chegada</label>
                        <label class="flex items-center gap-2 cursor-pointer hover:text-slate-900"><input type="checkbox" id="export-absentees-time" class="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" checked> Faltosos</label>
                    </div>
                </div>
            </div>
        `;

        // HTML completo do conteúdo organizado
        const html = `
        <div id="statistics-content-wrapper" class="grid grid-cols-1 xl:grid-cols-5 gap-5 h-full p-2 md:p-5 overflow-hidden bg-slate-50/30">
            <!-- Coluna Esquerda -->
            <div class="xl:col-span-2 flex flex-col gap-4 overflow-y-auto pr-1 md:pr-2 custom-scrollbar">
                
                <!-- Cards Principais -->
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center">
                        <span class="w-8 h-8 rounded-full bg-green-50 text-green-600 flex items-center justify-center mb-2 text-sm">✅</span>
                        <p class="text-2xl font-black text-slate-800">${atendidos.length}</p>
                        <p class="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1 text-center">Atendidos</p>
                    </div>
                    <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center">
                        <span class="w-8 h-8 rounded-full bg-red-50 text-red-600 flex items-center justify-center mb-2 text-sm">🚫</span>
                        <p class="text-2xl font-black text-slate-800">${faltosos.length}</p>
                        <p class="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1 text-center">Faltosos</p>
                    </div>
                    <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center">
                        <span class="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-2 text-sm">⏱️</span>
                        <p class="text-2xl font-black text-slate-800">${avgTimeDirect} min</p>
                        <p class="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1 text-center">T. Médio</p>
                    </div>
                    ${totalAcoesRapidas > 0 ? `
                    <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center col-span-2 sm:col-span-1 sm:hidden">
                        <span class="w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mb-2 text-sm">⚡</span>
                        <p class="text-2xl font-black text-slate-800">${totalAcoesRapidas}</p>
                        <p class="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1 text-center leading-tight">Opções</p>
                    </div>` : ''}
                    ${delegationHTML}
                </div>
                
                ${acoesRapidasHTML}
                ${botoesExportacaoHTML}

                <!-- Tabelas de Horários -->
                ${sortedScheduledTimes.length > 0 ? `
                <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                    <h3 class="text-sm font-bold text-slate-800 mb-3 border-b border-slate-100 pb-2">📅 Agendados por Horário</h3>
                    <div class="max-h-40 overflow-y-auto custom-scrollbar">
                        <table class="w-full text-xs text-left">
                            <thead class="text-[10px] text-slate-500 uppercase bg-slate-50 sticky top-0">
                                <tr><th class="px-4 py-2 font-semibold">Horário</th><th class="px-4 py-2 font-semibold text-right">Qtd</th></tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                ${sortedScheduledTimes.map(time => `
                                    <tr class="hover:bg-slate-50/50">
                                        <td class="px-4 py-2 font-medium text-slate-700">${time}</td>
                                        <td class="px-4 py-2 text-right font-bold text-slate-600">${statsByScheduledTime[time]}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>` : ''}

                ${sortedTimes.length > 0 ? `
                <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                    <h3 class="text-sm font-bold text-slate-800 mb-3 border-b border-slate-100 pb-2">📍 Atendimentos (Chegada)</h3>
                    <div class="max-h-40 overflow-y-auto custom-scrollbar">
                        <table class="w-full text-xs text-left">
                            <thead class="text-[10px] text-slate-500 uppercase bg-slate-50 sticky top-0">
                                <tr><th class="px-4 py-2 font-semibold">Horário</th><th class="px-4 py-2 font-semibold text-right">Qtd</th></tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                ${sortedTimes.map(time => `
                                    <tr class="hover:bg-slate-50/50">
                                        <td class="px-4 py-2 font-medium text-slate-700">${time}</td>
                                        <td class="px-4 py-2 text-right font-bold text-green-600">${statsByTime[time]}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>` : ''}

                ${sortedTimesFaltosos.length > 0 ? `
                <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                    <h3 class="text-sm font-bold text-slate-800 mb-3 border-b border-slate-100 pb-2">🚫 Faltosos por Horário</h3>
                    <div class="max-h-40 overflow-y-auto custom-scrollbar">
                        <table class="w-full text-xs text-left">
                            <thead class="text-[10px] text-slate-500 uppercase bg-red-50 sticky top-0">
                                <tr><th class="px-4 py-2 font-semibold">Horário</th><th class="px-4 py-2 font-semibold text-right">Qtd</th></tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                ${sortedTimesFaltosos.map(time => `
                                    <tr class="hover:bg-red-50/30">
                                        <td class="px-4 py-2 font-medium text-slate-700">${time}</td>
                                        <td class="px-4 py-2 text-right font-bold text-red-600">${statsByTimeFaltosos[time]}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>` : ''}
            </div>

            <!-- Coluna Direita -->
            <div class="xl:col-span-3 flex flex-col gap-4 overflow-y-auto pr-1 md:pr-2 custom-scrollbar">
                
                <!-- Tabela de Assuntos -->
                <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[40vh] md:h-auto min-h-[300px]">
                    <h3 class="text-base font-bold text-slate-800 mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">
                        <span class="text-orange-500">🏷️</span> Demandas por Assunto
                    </h3>
                    <div class="flex-1 overflow-y-auto custom-scrollbar rounded-lg border border-slate-100">
                        <table class="w-full text-xs md:text-sm text-left">
                            <thead class="text-[10px] text-slate-500 uppercase bg-slate-50 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th class="px-4 py-3 font-bold">Assunto</th>
                                    <th class="px-3 py-3 font-bold text-center">Total</th>
                                    <th class="px-3 py-3 font-bold text-center text-green-600">Atend.</th>
                                    <th class="px-3 py-3 font-bold text-center text-red-600">Falt.</th>
                                    <th class="px-4 py-3 font-bold text-right">%</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                ${Object.entries(statsBySubject).sort(([,a],[,b]) => b.total - a.total).map(([subject, data]) => `
                                    <tr class="hover:bg-slate-50/50 transition-colors">
                                        <td class="px-4 py-2.5 font-medium text-slate-700">${subject}</td>
                                        <td class="px-3 py-2.5 text-center font-bold text-slate-800 bg-slate-50/50">${data.total}</td>
                                        <td class="px-3 py-2.5 text-center font-semibold text-green-600">${data.atendidos}</td>
                                        <td class="px-3 py-2.5 text-center font-semibold text-red-500">${data.faltosos}</td>
                                        <td class="px-4 py-2.5 text-right font-medium text-slate-500">${totalDemandasGeral > 0 ? ((data.total / totalDemandasGeral) * 100).toFixed(1) : 0}%</td>
                                    </tr>`).join('')}
                            </tbody>
                            <tfoot class="bg-slate-100 font-bold sticky bottom-0 z-10 shadow-[0_-2px_4px_rgba(0,0,0,0.02)]">
                                <tr>
                                    <td class="px-4 py-3 text-slate-800">TOTAL GERAL</td>
                                    <td class="px-3 py-3 text-center text-slate-800">${totalDemandasGeral}</td>
                                    <td class="px-3 py-3 text-center text-green-700">${totalDemandasAtendidos}</td>
                                    <td class="px-3 py-3 text-center text-red-700">${totalDemandasFaltosos}</td>
                                    <td class="px-4 py-3 text-right text-slate-800">100%</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
                
                <!-- Equipes -->
                <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex-1 flex flex-col min-h-[400px]">
                    <div class="flex flex-wrap justify-between items-center mb-4 gap-3 border-b border-slate-100 pb-3">
                        <h3 class="text-base font-bold text-slate-800 flex items-center gap-2">
                            <span class="text-teal-500">🏢</span> Atendimentos por Equipe
                        </h3>
                        <button id="toggle-all-groups-btn" class="text-[11px] font-semibold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg hover:bg-slate-200 transition-colors">
                            Ocultar todas as listas
                        </button>
                    </div>
                    <div class="flex-1 overflow-y-auto pr-2 custom-scrollbar" id="groups-container">
                        ${groupsHTML}
                    </div>
                </div>
            </div>
        </div>
        `;
        
        content.innerHTML = html;

        // ===== EVENT LISTENERS DOS BOTÕES =====
        
        document.querySelectorAll('.hide-individual-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const groupIndex = btn.dataset.groupIndex;
                const individuais = document.querySelectorAll(`.atendimento-valor-${groupIndex}`);
                const header = document.querySelector(`.atendimento-header-${groupIndex}`);
                
                const isHidden = btn.textContent.includes('Mostrar');
                
                individuais.forEach(el => {
                    if (isHidden) el.style.display = 'table-cell';
                    else el.style.display = 'none';
                });
                
                if (header) {
                    if (isHidden) header.style.display = 'table-cell';
                    else header.style.display = 'none';
                }
                
                btn.textContent = isHidden ? 'Ocultar Atendimentos' : 'Mostrar Atendimentos';
                btn.classList.toggle('bg-blue-50', !isHidden);
                btn.classList.toggle('text-blue-600', !isHidden);
            });
        });

        const toggleAllBtn = document.getElementById('toggle-all-groups-btn');
        if (toggleAllBtn) {
            toggleAllBtn.addEventListener('click', () => {
                const isShowing = toggleAllBtn.textContent.includes('Ocultar');
                
                document.querySelectorAll('.collaborators-table').forEach(table => {
                    if (table) table.style.display = isShowing ? 'none' : 'table';
                });
                
                document.querySelectorAll('.toggle-details-btn').forEach(btn => {
                    if (btn) btn.textContent = isShowing ? 'Mostrar Lista' : 'Ocultar Lista';
                });
                
                toggleAllBtn.textContent = isShowing ? 'Mostrar todas as listas' : 'Ocultar todas as listas';
            });
        }
        
        document.querySelectorAll('.toggle-details-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const groupIndex = btn.dataset.groupIndex;
                const table = document.querySelector(`.collaborators-table[data-group-index="${groupIndex}"]`);
                
                if (table) {
                    if (table.style.display === 'none') {
                        table.style.display = 'table';
                        btn.textContent = 'Ocultar Lista';
                    } else {
                        table.style.display = 'none';
                        btn.textContent = 'Mostrar Lista';
                    }
                }
            });
        });

        // Eventos dos Botões de PDF
        const exportBtn = document.getElementById('export-stats-pdf-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                const originalHtml = exportBtn.innerHTML;
                exportBtn.innerHTML = '<span class="animate-spin text-lg">⏳</span> Aguarde...';
                exportBtn.disabled = true;

                this.exportStatisticsToPDF(pautaName, {
                    agendadosCount: allAssisted.length,
                    atendidosCount: atendidos.length,
                    faltososCount: faltosos.length,
                    avgTimeDirect,
                    avgTimeDelegated,
                    useDelegationFlow,
                    statsByGroup,
                    statsBySubject,
                    statsByAcaoRapida,
                    totalAcoesRapidas,
                    statsByScheduledTime: sortedScheduledTimes.map(time => ({ time, count: statsByScheduledTime[time] })),
                    statsByTime: sortedTimes.map(time => ({ time, count: statsByTime[time] })),
                    statsByTimeFaltosos: sortedTimesFaltosos.map(time => ({ time, count: statsByTimeFaltosos[time] }))
                }).finally(() => {
                    exportBtn.innerHTML = originalHtml;
                    exportBtn.disabled = false;
                });
            });
        }

        const exportEquipesBtn = document.getElementById('export-equipes-pdf-btn');
        if (exportEquipesBtn) {
            exportEquipesBtn.addEventListener('click', () => {
                const originalHtml = exportEquipesBtn.innerHTML;
                exportEquipesBtn.innerHTML = '<span class="animate-spin text-lg">⏳</span> Aguarde...';
                exportEquipesBtn.disabled = true;

                this.exportEquipesPDF(pautaName, {
                    statsByGroup,
                    sortedGroups,
                    totalGeral
                }).finally(() => {
                    exportEquipesBtn.innerHTML = originalHtml;
                    exportEquipesBtn.disabled = false;
                });
            });
        }

        const exportGrupoBtn = document.getElementById('export-grupo-pdf-btn');
        if (exportGrupoBtn) {
            exportGrupoBtn.addEventListener('click', () => {
                const originalHtml = exportGrupoBtn.innerHTML;
                exportGrupoBtn.innerHTML = '<span class="animate-spin text-lg">⏳</span> Aguarde...';
                exportGrupoBtn.disabled = true;

                this.exportGrupoPDF(pautaName, {
                    sortedGroups,
                    totalGeral
                }).finally(() => {
                    exportGrupoBtn.innerHTML = originalHtml;
                    exportGrupoBtn.disabled = false;
                });
            });
        }

        const exportDetalhadoBtn = document.getElementById('export-stats-detalhado-btn');
        if (exportDetalhadoBtn) {
            exportDetalhadoBtn.addEventListener('click', () => {
                const originalHtml = exportDetalhadoBtn.innerHTML;
                exportDetalhadoBtn.innerHTML = '<span class="animate-spin text-lg">⏳</span> Aguarde...';
                exportDetalhadoBtn.disabled = true;

                this.exportDetailedStatisticsPDF(pautaName, {
                    totalGeral,
                    sortedGroups
                }).finally(() => {
                    exportDetalhadoBtn.innerHTML = originalHtml;
                    exportDetalhadoBtn.disabled = false;
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

            doc.setFontSize(14);
            doc.setTextColor(0, 102, 204);
            doc.setFont("helvetica", "bold");
            doc.text(`${groupName} - TOTAL: ${total} atendimentos | Membros: ${todosColaboradores.length}`, margin, yPos);
            yPos += 20;

            doc.setFillColor(240, 240, 240);
            doc.rect(margin, yPos - 12, pageWidth - (margin * 2), 20, 'F');
            
            doc.setFontSize(10);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(60, 60, 60);
            doc.text("Colaborador", margin + 10, yPos);
            doc.text("Cargo", margin + 200, yPos);
            doc.text("Atendimentos", pageWidth - margin - 80, yPos);
            yPos += 15;

            doc.setFontSize(9);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(60, 60, 60);

            if (todosColaboradores && todosColaboradores.length > 0) {
                const colaboradoresOrdenados = [...todosColaboradores].sort((a, b) => a.nome.localeCompare(b.nome));
                
                colaboradoresOrdenados.forEach((col) => {
                    if (yPos > pageHeight - 40) {
                        doc.addPage();
                        yPos = margin + 30;
                        
                        doc.setFontSize(12);
                        doc.setTextColor(0, 102, 204);
                        doc.setFont("helvetica", "bold");
                        doc.text(`${groupName} (continuação)`, margin, yPos);
                        yPos += 20;
                        
                        doc.setFontSize(9);
                    }
                    
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

        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(`Página ${i} de ${pageCount}`, pageWidth - margin - 50, pageHeight - 20);
        }

        doc.save(`equipe_completa_${pautaName.replace(/\s+/g, '_')}.pdf`);
    },

    /**
     * Exporta PDF por Grupo (apenas total e lista de membros, sem individuais)
     */
    async exportGrupoPDF(pautaName, dados) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 40;
        let yPos = margin + 30;

        doc.setFontSize(18);
        doc.setTextColor(22, 163, 74);
        doc.setFont("helvetica", "bold");
        doc.text(`RELATÓRIO DE GRUPOS - ${pautaName}`, pageWidth / 2, yPos, { align: "center" });
        yPos += 20;
        
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, margin, yPos);
        yPos += 20;
        
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text(`Total de Atendimentos: ${dados.totalGeral}`, margin, yPos);
        yPos += 25;

        dados.sortedGroups.forEach(({groupName, total, todosColaboradores}) => {
            if (yPos > pageHeight - 150) {
                doc.addPage();
                yPos = margin + 30;
            }

            doc.setFontSize(16);
            doc.setTextColor(0, 102, 204);
            doc.setFont("helvetica", "bold");
            doc.text(groupName, margin, yPos);
            yPos += 15;
            
            doc.setFontSize(14);
            doc.setTextColor(22, 163, 74);
            doc.text(`Total de Atendimentos: ${total}`, margin, yPos);
            yPos += 20;

            doc.setFontSize(11);
            doc.setTextColor(60, 60, 60);
            doc.setFont("helvetica", "bold");
            doc.text("Membros da equipe:", margin, yPos);
            yPos += 15;
            
            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);

            if (todosColaboradores && todosColaboradores.length > 0) {
                const membrosOrdenados = [...todosColaboradores].sort((a, b) => a.nome.localeCompare(b.nome));
                
                const col1X = margin + 10;
                const col2X = margin + 250;
                let col = 1;
                
                membrosOrdenados.forEach((membro) => {
                    if (yPos > pageHeight - 40) {
                        doc.addPage();
                        yPos = margin + 30;
                        
                        doc.setFontSize(14);
                        doc.setTextColor(0, 102, 204);
                        doc.setFont("helvetica", "bold");
                        doc.text(`${groupName} (continuação)`, margin, yPos);
                        yPos += 20;
                        
                        doc.setFontSize(10);
                        doc.setFont("helvetica", "normal");
                    }
                    
                    if (col === 1) {
                        doc.text(`• ${membro.nome}`, col1X, yPos);
                        col = 2;
                    } else {
                        doc.text(`• ${membro.nome}`, col2X, yPos);
                        col = 1;
                        yPos += 15;
                    }
                });
                
                if (col === 2) yPos += 15; 
            } else {
                doc.text("Nenhum colaborador cadastrado nesta equipe", margin + 10, yPos);
                yPos += 15;
            }

            yPos += 20;
        });

        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(`Página ${i} de ${pageCount}`, pageWidth - margin - 50, pageHeight - 20);
        }

        doc.save(`grupo_${pautaName.replace(/\s+/g, '_')}.pdf`);
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

        detalhesData.sortedGroups.forEach(({groupName, total, atendimentos}) => {
            if (yPos > pageHeight - 100) {
                doc.addPage();
                yPos = margin + 30;
            }

            doc.setFontSize(14);
            doc.setTextColor(0, 102, 204);
            doc.setFont("helvetica", "bold");
            doc.text(`${groupName} (${total} atendimentos)`, margin, yPos);
            yPos += 20;

            doc.setFontSize(9);
            doc.setTextColor(60, 60, 60);
            doc.setFont("helvetica", "normal");

            if (atendimentos && atendimentos.length > 0) {
                atendimentos.forEach((att, index) => {
                    if (yPos > pageHeight - 60) {
                        doc.addPage();
                        yPos = margin + 30;
                        
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

        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(`Página ${i} de ${pageCount}`, pageWidth - margin - 50, pageHeight - 20);
        }

        doc.save(`detalhado_${pautaName.replace(/\s+/g, '_')}.pdf`);
    },

    /**
     * Exporta estatísticas para PDF - Mantido original para consistência
     */
    async exportStatisticsToPDF(pautaName, statsData) {
        const { jsPDF } = window.jspdf;
        
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

        if (exportGeneral) {
            addSectionTitle("Resumo Geral");
            
            const colWidth = (pageWidth - margin * 2) / 3;
            let startX = margin;
            
            doc.setFillColor(220, 255, 220);
            doc.roundedRect(startX, yPos - 15, colWidth - 10, 60, 5, 5, 'F');
            doc.setFont("helvetica", "bold");
            doc.setFontSize(24);
            doc.setTextColor(39, 174, 96);
            doc.text(String(statsData.atendidosCount || 0), startX + (colWidth - 10)/2, yPos + 15, { align: 'center' });
            doc.setFontSize(10);
            doc.setTextColor(0);
            doc.text("Atendidos", startX + (colWidth - 10)/2, yPos + 35, { align: 'center' });
            
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

        if (statsData.statsByAcaoRapida && statsData.totalAcoesRapidas > 0) {
            if (yPos > pageHeight - 80) { doc.addPage(); yPos = margin + 30; }
            addSectionTitle("Acoes Rapidas");
            
            const acoesRows = Object.entries(statsData.statsByAcaoRapida)
                .sort(([,a],[,b]) => b - a)
                .map(([tipo, qtd]) => [tipo, qtd]);
            
            doc.autoTable({
                startY: yPos,
                head: [['Tipo de Acao', 'Total']],
                body: acoesRows,
                foot: [['TOTAL', statsData.totalAcoesRapidas]],
                theme: 'grid',
                headStyles: { fillColor: [99, 102, 241], textColor: '#FFFFFF' },
                footStyles: { fillColor: [240, 240, 240], fontStyle: 'bold' },
                styles: { fontSize: 9 },
                margin: { left: margin, right: margin }
            });
            
            yPos = doc.lastAutoTable.finalY + 20;
        }

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

console.log("✅ estatisticas.js carregado com sucesso! Contagem corrigida, redundância removida e UI modernizada.");
