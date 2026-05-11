/**
 * estatisticas.js - Versão Completa e Corrigida
 * Funcionalidades:
 * - PDF por Equipe (MOSTRA TODOS + QUEBRA DE PÁGINA AUTOMÁTICA)
 * - Visual "Verde SIGAP" unificado com Logo
 * - Tabelas inteligentes para não sobrepor textos
 */

export const StatisticsService = {
    getTimeDifferenceInMinutes(startTimeISO, endTimeISO) {
        if (!startTimeISO || !endTimeISO) return null;
        const start = new Date(startTimeISO);
        const end = new Date(endTimeISO);
        if (isNaN(start) || isNaN(end)) return null;
        return Math.round((end - start) / 60000);
    },

    showModal(allAssisted, useDelegationFlow, pautaName) {
        const modal = document.getElementById('statistics-modal');
        if (!modal) return;
        
        modal.classList.remove('hidden');
        
        const closeBtn = document.getElementById('close-statistics-modal-btn');
        if (closeBtn) closeBtn.onclick = () => modal.classList.add('hidden');

        const titleEl = modal.querySelector('h2');
        if (titleEl) {
            titleEl.innerHTML = `<span class="text-blue-600 mr-2">📊</span> Estatísticas - <span class="text-gray-700">${pautaName}</span>`;
        }

        const content = document.getElementById('statistics-content');
        if (!content) return;

        content.innerHTML = `<div class="flex items-center justify-center h-64"><p class="text-gray-500 font-medium animate-pulse">Calculando estatísticas...</p></div>`;

        const atendidos = allAssisted.filter(a => a.status === 'atendido');
        const faltosos = allAssisted.filter(a => a.status === 'faltoso');

        // BUSCAR DADOS DOS COLABORADORES DO SISTEMA
        let todosColaboradores = [];
        if (window.app && window.app.colaboradores) {
            todosColaboradores = window.app.colaboradores;
        } else {
            const stored = localStorage.getItem('sigap_colaboradores');
            if (stored) {
                try { todosColaboradores = JSON.parse(stored); } catch (e) {}
            }
        }
        
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

        const statsByGroup = {};
        
        Object.keys(colaboradoresPorEquipe).forEach(equipe => {
            statsByGroup[equipe] = { 
                collaborators: {}, 
                total: 0,
                atendimentos: [],
                todosColaboradores: colaboradoresPorEquipe[equipe]
            };
        });
        
        if (!statsByGroup['Equipe Não Definida']) {
            statsByGroup['Equipe Não Definida'] = { 
                collaborators: {}, total: 0, atendimentos: [], todosColaboradores: []
            };
        }
        
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
            
            if (!groupName || groupName === 'Equipe undefined') {
                groupName = mapaNomeParaEquipe[attendantName] || 'Equipe Não Definida';
            }

            if (!statsByGroup[groupName]) {
                statsByGroup[groupName] = { collaborators: {}, total: 0, atendimentos: [], todosColaboradores: [] };
            }

            const safeAttendantName = attendantName || 'Não informado';
            statsByGroup[groupName].collaborators[safeAttendantName] = (statsByGroup[groupName].collaborators[safeAttendantName] || 0) + 1;
            statsByGroup[groupName].total++;
            
            statsByGroup[groupName].atendimentos.push({
                nome: a.name || 'Não informado',
                assunto: a.subject || 'Sem assunto',
                atendente: safeAttendantName,
                horario: a.attendedTime ? new Date(a.attendedTime.seconds ? a.attendedTime.seconds * 1000 : a.attendedTime).toLocaleString('pt-BR') : 'Não finalizado'
            });
        });
        
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
        
        const totalGeral = atendidos.length;
        
        const statsBySubject = allAssisted.reduce((acc, a) => {
            const demandasDoAssistido = (a.subject ? [a.subject] : []).concat(a.demandas?.descricoes || []);
            demandasDoAssistido.forEach(demanda => {
                if (!acc[demanda]) acc[demanda] = { total: 0, atendidos: 0, faltosos: 0 };
                acc[demanda].total++;
                if (a.status === 'atendido') acc[demanda].atendidos++;
                else if (a.status === 'faltoso') acc[demanda].faltosos++;
            });
            return acc;
        }, {});

        const totalDemandasGeral = Object.values(statsBySubject).reduce((sum, data) => sum + data.total, 0);

        const statsByAcaoRapida = {};
        atendidos.forEach(a => {
            if (a.tipoAcaoRapida) {
                statsByAcaoRapida[a.tipoAcaoRapida] = (statsByAcaoRapida[a.tipoAcaoRapida] || 0) + 1;
            }
        });
        const totalAcoesRapidas = Object.values(statsByAcaoRapida).reduce((s, v) => s + v, 0);
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

        const statsByScheduledTime = allAssisted.filter(a => a.scheduledTime).reduce((acc, a) => {
            acc[a.scheduledTime] = (acc[a.scheduledTime] || 0) + 1;
            return acc;
        }, {});
        const sortedScheduledTimes = Object.keys(statsByScheduledTime).sort();

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

        const groupsHTML = sortedGroups.map(({groupName, total, collaborators, todosColaboradores}, index) => {
            const colaboradoresCompletos = [];
            todosColaboradores.forEach(col => {
                const atendimentos = collaborators.find(c => c.name === col.nome)?.count || 0;
                colaboradoresCompletos.push({ nome: col.nome, atendimentos: atendimentos, cargo: col.cargo });
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

        const botoesExportacaoHTML = `
            <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm mt-4">
                <h3 class="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <span class="text-indigo-500">🖨️</span> Exportar Relatórios
                </h3>
                <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <button id="export-stats-pdf-btn" class="flex flex-col items-center justify-center gap-1.5 w-full bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-200 font-bold py-3 px-2 rounded-xl text-xs transition-all shadow-sm">
                        <span class="text-blue-500 text-lg">📊</span> Resumo Geral
                    </button>
                    <button id="export-equipes-pdf-btn" class="flex flex-col items-center justify-center gap-1.5 w-full bg-slate-50 hover:bg-purple-50 text-slate-700 hover:text-purple-700 border border-slate-200 hover:border-purple-200 font-bold py-3 px-2 rounded-xl text-xs transition-all shadow-sm">
                        <span class="text-purple-500 text-lg">👥</span> Por Equipe
                    </button>
                    <button id="export-grupo-pdf-btn" class="flex flex-col items-center justify-center gap-1.5 w-full bg-slate-50 hover:bg-green-50 text-slate-700 hover:text-green-700 border border-slate-200 hover:border-green-200 font-bold py-3 px-2 rounded-xl text-xs transition-all shadow-sm">
                        <span class="text-green-500 text-lg">📋</span> Só Grupos
                    </button>
                    <button id="export-stats-detalhado-btn" class="flex flex-col items-center justify-center gap-1.5 w-full bg-slate-50 hover:bg-orange-50 text-slate-700 hover:text-orange-700 border border-slate-200 hover:border-orange-200 font-bold py-3 px-2 rounded-xl text-xs transition-all shadow-sm">
                        <span class="text-orange-500 text-lg">📖</span> Detalhado
                    </button>
                </div>
                
                <div class="mt-5 pt-4 border-t border-slate-100">
                    <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Configurar Relatório Resumo Geral:</p>
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

        const html = `
        <div id="statistics-content-wrapper" class="grid grid-cols-1 xl:grid-cols-5 gap-5 h-full p-2 md:p-5 overflow-hidden bg-slate-50/30">
            <!-- Coluna Esquerda -->
            <div class="xl:col-span-2 flex flex-col gap-4 overflow-y-auto pr-1 md:pr-2 custom-scrollbar">
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

                this.exportEquipesPDF(pautaName, { statsByGroup, sortedGroups, totalGeral }).finally(() => {
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

                this.exportGrupoPDF(pautaName, { sortedGroups, totalGeral }).finally(() => {
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

                this.exportDetailedStatisticsPDF(pautaName, { totalGeral, sortedGroups }).finally(() => {
                    exportDetalhadoBtn.innerHTML = originalHtml;
                    exportDetalhadoBtn.disabled = false;
                });
            });
        }
    },

    // =========================================================================
    // EXPORTAÇÃO COMPLETA POR EQUIPE (RESOLVE O PROBLEMA DA IMAGEM E DAS QUEBRAS)
    // =========================================================================
    async exportEquipesPDF(pautaName, dados) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 40;

        const logoUrl = "https://raw.githubusercontent.com/alexdovale/calculo-mensuracao-codoc/main/logo.png";
        try { doc.addImage(logoUrl, 'PNG', margin, margin, 140, 33); } catch(e) {}

        let yPos = margin + 50;

        doc.setFontSize(16);
        doc.setTextColor(22, 163, 74);
        doc.setFont("helvetica", "bold");
        doc.text(`RELATÓRIO COMPLETO POR EQUIPE - ${pautaName}`, margin, yPos);
        yPos += 18;
        
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.setFont("helvetica", "normal");
        doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, margin, yPos);
        yPos += 14;
        doc.setFont("helvetica", "bold");
        doc.text(`Total de Atendimentos: ${dados.totalGeral}`, margin, yPos);
        yPos += 20;

        dados.sortedGroups.forEach(({groupName, total, todosColaboradores, collaborators}) => {
            let body = [];
            if (todosColaboradores && todosColaboradores.length > 0) {
                const cols = [...todosColaboradores].sort((a, b) => a.nome.localeCompare(b.nome));
                body = cols.map(col => {
                    const count = collaborators.find(c => c.name === col.nome)?.count || 0;
                    return [col.nome, col.cargo || '-', count];
                });
            } else {
                body = [['Nenhum colaborador nesta equipe', '-', '-']];
            }

            doc.autoTable({
                startY: yPos,
                head: [
                    [{ content: `${groupName.toUpperCase()} - TOTAL: ${total} atendimentos | Membros: ${todosColaboradores.length}`, colSpan: 3, styles: { fillColor: [240, 253, 244], textColor: [21, 128, 61], fontStyle: 'bold', halign: 'center', fontSize: 10 } }],
                    ['Colaborador', 'Cargo', 'Atendimentos']
                ],
                body: body,
                theme: 'grid',
                headStyles: { fillColor: [22, 163, 74], textColor: [255, 255, 255], fontStyle: 'bold' },
                styles: { fontSize: 9, cellPadding: 5, valign: 'middle' },
                columnStyles: {
                    0: { halign: 'left', cellWidth: 260, fontStyle: 'bold', textColor: [60, 60, 60] },
                    1: { halign: 'left', cellWidth: 140 },
                    2: { halign: 'center', cellWidth: 80, fontStyle: 'bold' }
                },
                margin: { left: margin, right: margin, bottom: 40 },
                didParseCell: function(data) {
                    if (data.section === 'body' && data.column.index === 2) {
                        if (data.cell.raw === 0 || data.cell.raw === '-') {
                            data.cell.styles.textColor = [150, 150, 150];
                        } else {
                            data.cell.styles.textColor = [22, 163, 74];
                        }
                    }
                }
            });
            yPos = doc.lastAutoTable.finalY + 15;
        });

        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.setFont("helvetica", "normal");
            doc.text(`SIGAP - Sistema de Gerenciamento de Pauta | Página ${i} de ${pageCount}`, margin, pageHeight - 20);
        }

        doc.save(`equipe_completa_${pautaName.replace(/\s+/g, '_')}.pdf`);
    },

    // =========================================================================
    // EXPORTAÇÃO GRUPO (APENAS LISTA DE MEMBROS)
    // =========================================================================
    async exportGrupoPDF(pautaName, dados) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 40;

        const logoUrl = "https://raw.githubusercontent.com/alexdovale/calculo-mensuracao-codoc/main/logo.png";
        try { doc.addImage(logoUrl, 'PNG', margin, margin, 140, 33); } catch(e) {}

        let yPos = margin + 50;

        doc.setFontSize(16);
        doc.setTextColor(22, 163, 74);
        doc.setFont("helvetica", "bold");
        doc.text(`RELATÓRIO DE GRUPOS - ${pautaName}`, margin, yPos);
        yPos += 18;
        
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.setFont("helvetica", "normal");
        doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, margin, yPos);
        yPos += 14;
        doc.setFont("helvetica", "bold");
        doc.text(`Total de Atendimentos: ${dados.totalGeral}`, margin, yPos);
        yPos += 20;

        dados.sortedGroups.forEach(({groupName, total, todosColaboradores}) => {
            let body = [];
            if (todosColaboradores && todosColaboradores.length > 0) {
                const cols = [...todosColaboradores].sort((a, b) => a.nome.localeCompare(b.nome));
                body = cols.map(c => [c.nome, c.cargo || '-']);
            } else {
                body = [['Nenhum colaborador cadastrado nesta equipe', '-']];
            }

            doc.autoTable({
                startY: yPos,
                head: [
                    [{ content: `${groupName.toUpperCase()} - TOTAL: ${total} atendimentos | Membros: ${todosColaboradores.length}`, colSpan: 2, styles: { fillColor: [240, 253, 244], textColor: [21, 128, 61], fontStyle: 'bold', halign: 'center', fontSize: 10 } }],
                    ['Membro da Equipe', 'Cargo']
                ],
                body: body,
                theme: 'grid',
                headStyles: { fillColor: [22, 163, 74], textColor: [255, 255, 255], fontStyle: 'bold' },
                styles: { fontSize: 9, cellPadding: 5, valign: 'middle' },
                columnStyles: {
                    0: { halign: 'left', fontStyle: 'bold', textColor: [60, 60, 60] },
                    1: { halign: 'left' }
                },
                margin: { left: margin, right: margin, bottom: 40 }
            });
            yPos = doc.lastAutoTable.finalY + 15;
        });

        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.setFont("helvetica", "normal");
            doc.text(`SIGAP - Sistema de Gerenciamento de Pauta | Página ${i} de ${pageCount}`, margin, pageHeight - 20);
        }

        doc.save(`grupo_${pautaName.replace(/\s+/g, '_')}.pdf`);
    },

    // =========================================================================
    // EXPORTAÇÃO DETALHADA (LISTA DE ASSISTIDOS POR EQUIPE)
    // =========================================================================
    async exportDetailedStatisticsPDF(pautaName, detalhesData) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 40;

        const logoUrl = "https://raw.githubusercontent.com/alexdovale/calculo-mensuracao-codoc/main/logo.png";
        try { doc.addImage(logoUrl, 'PNG', margin, margin, 140, 33); } catch(e) {}

        let yPos = margin + 50;

        doc.setFontSize(16);
        doc.setTextColor(22, 163, 74);
        doc.setFont("helvetica", "bold");
        doc.text(`LISTA DE ASSISTIDOS POR EQUIPE - ${pautaName}`, margin, yPos);
        yPos += 18;
        
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.setFont("helvetica", "normal");
        doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, margin, yPos);
        yPos += 14;
        doc.setFont("helvetica", "bold");
        doc.text(`Total de Atendimentos: ${detalhesData.totalGeral}`, margin, yPos);
        yPos += 20;

        detalhesData.sortedGroups.forEach(({groupName, total, atendimentos}) => {
            let body = [];
            if (atendimentos && atendimentos.length > 0) {
                body = atendimentos.map((att, idx) => [
                    idx + 1,
                    att.nome,
                    att.assunto,
                    att.atendente,
                    att.horario !== 'Não finalizado' ? att.horario : '---'
                ]);
            } else {
                body = [['-', 'Nenhum atendimento registrado', '-', '-', '-']];
            }

            doc.autoTable({
                startY: yPos,
                head: [
                    [{ content: `${groupName.toUpperCase()} (${total} ATENDIMENTOS)`, colSpan: 5, styles: { fillColor: [240, 253, 244], textColor: [21, 128, 61], fontStyle: 'bold', halign: 'center', fontSize: 10 } }],
                    ['#', 'Assistido', 'Assunto', 'Atendente', 'Horário']
                ],
                body: body,
                theme: 'grid',
                headStyles: { fillColor: [22, 163, 74], textColor: [255, 255, 255], fontStyle: 'bold' },
                styles: { fontSize: 8, cellPadding: 4, valign: 'middle' },
                columnStyles: { 
                    0: { cellWidth: 25, halign: 'center' },
                    1: { cellWidth: 130, fontStyle: 'bold' },
                    2: { cellWidth: 'auto' },
                    3: { cellWidth: 100 },
                    4: { cellWidth: 60, halign: 'center' }
                },
                margin: { left: margin, right: margin, bottom: 40 }
            });
            yPos = doc.lastAutoTable.finalY + 15;
        });

        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.setFont("helvetica", "normal");
            doc.text(`SIGAP - Sistema de Gerenciamento de Pauta | Página ${i} de ${pageCount}`, margin, pageHeight - 20);
        }

        doc.save(`detalhado_${pautaName.replace(/\s+/g, '_')}.pdf`);
    },

    // =========================================================================
    // EXPORTAÇÃO RESUMO GERAL
    // =========================================================================
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
        
        const logoUrl = "https://raw.githubusercontent.com/alexdovale/calculo-mensuracao-codoc/main/logo.png";
        try { doc.addImage(logoUrl, 'PNG', margin, margin, 140, 33); } catch(e) {}
        
        let yPos = margin + 50;

        doc.setFontSize(16);
        doc.setTextColor(22, 163, 74);
        doc.setFont("helvetica", "bold");
        doc.text(`RESUMO GERAL ESTATÍSTICO - ${pautaName}`, margin, yPos);
        yPos += 20;

        const addSectionTitle = (title) => {
            if (yPos > pageHeight - 100) { 
                doc.addPage();
                yPos = margin + 30;
            }
            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            doc.setTextColor(43, 58, 85);
            doc.text(title, margin, yPos);
            yPos += 20;
        };

        if (exportGeneral) {
            addSectionTitle("Resumo Geral");
            
            const colWidth = (pageWidth - margin * 2) / 3;
            let startX = margin;
            
            doc.setFillColor(240, 253, 244);
            doc.roundedRect(startX, yPos - 15, colWidth - 10, 60, 5, 5, 'F');
            doc.setFont("helvetica", "bold");
            doc.setFontSize(24);
            doc.setTextColor(22, 163, 74);
            doc.text(String(statsData.atendidosCount || 0), startX + (colWidth - 10)/2, yPos + 15, { align: 'center' });
            doc.setFontSize(10);
            doc.setTextColor(0);
            doc.text("Atendidos", startX + (colWidth - 10)/2, yPos + 35, { align: 'center' });
            
            startX += colWidth;
            doc.setFillColor(254, 242, 242);
            doc.roundedRect(startX, yPos - 15, colWidth - 10, 60, 5, 5, 'F');
            doc.setFont("helvetica", "bold");
            doc.setFontSize(24);
            doc.setTextColor(220, 38, 38);
            doc.text(String(statsData.faltososCount || 0), startX + (colWidth - 10)/2, yPos + 15, { align: 'center' });
            doc.setFontSize(10);
            doc.setTextColor(0);
            doc.text("Faltosos", startX + (colWidth - 10)/2, yPos + 35, { align: 'center' });
            
            startX += colWidth;
            doc.setFillColor(239, 246, 255);
            doc.roundedRect(startX, yPos - 15, colWidth - 10, 60, 5, 5, 'F');
            doc.setFont("helvetica", "bold");
            doc.setFontSize(24);
            doc.setTextColor(37, 99, 235);
            const tempoMedio = statsData.avgTimeDirect || 0;
            doc.text(tempoMedio + ' min', startX + (colWidth - 10)/2, yPos + 15, { align: 'center' });
            doc.setFontSize(10);
            doc.setTextColor(0);
            doc.text("Tempo Médio", startX + (colWidth - 10)/2, yPos + 35, { align: 'center' });
            
            yPos += 70;
        }

        if (statsData.statsByAcaoRapida && statsData.totalAcoesRapidas > 0) {
            if (yPos > pageHeight - 80) { doc.addPage(); yPos = margin + 30; }
            addSectionTitle("Ações Rápidas");
            
            const acoesRows = Object.entries(statsData.statsByAcaoRapida)
                .sort(([,a],[,b]) => b - a)
                .map(([tipo, qtd]) => [tipo, qtd]);
            
            doc.autoTable({
                startY: yPos,
                head: [['Tipo de Ação', 'Total']],
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
            doc.setFont("helvetica", "normal");
            doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')} - Página ${i} de ${pageCount}`, margin, pageHeight - 20);
        }

        doc.save(`resumo_${pautaName.replace(/\s+/g, '_')}.pdf`);
    }
};

export const renderStatisticsModal = (allAssisted, useDelegationFlow, pautaName) => {
    return StatisticsService.showModal(allAssisted, useDelegationFlow, pautaName);
};

export const exportStatisticsToPDF = (pautaName, statsData) => {
    return StatisticsService.exportStatisticsToPDF(pautaName, statsData);
};

window.StatisticsService = StatisticsService;

console.log("✅ estatisticas.js carregado com sucesso (Tabelas automáticas sem sobreposição e com quebra de página)!");
