// Substitua a função inteira por esta versão:
function renderStatisticsModal(allAssisted, useDelegationFlow, pautaName) {
    const modal = document.getElementById('statistics-modal');
    
    if (!modal) {
        console.error("Elemento do modal de estatísticas '#statistics-modal' não encontrado.");
        return;
    }

    // ADICIONADO: Limpa o conteúdo interno do modal para evitar duplicidade.
    modal.innerHTML = ''; 

    // ADICIONADO: Cria dinamicamente o container de conteúdo que o resto do script espera.
    const content = document.createElement('div');
    content.id = 'statistics-content';
    modal.appendChild(content);

    makeModalInteractive(modal);
    
    const modalTitle = modal.querySelector('#statistics-modal-header span');
    if (modalTitle) modalTitle.textContent = `Estatísticas - ${pautaName}`;

    content.innerHTML = `<div class="flex items-center justify-center h-full"><p class="text-gray-600">Calculando estatísticas...</p></div>`;
    modal.style.display = 'flex';
    modal.classList.remove('hidden');

    const atendidos = allAssisted.filter(a => a.status === 'atendido');
    const faltosos = allAssisted.filter(a => a.status === 'faltoso');

    const statsByCollaborator = atendidos.reduce((acc, a) => {
        acc[a.attendant || 'Não informado'] = (acc[a.attendant || 'Não informado'] || 0) + 1;
        return acc;
    }, {});

    const statsBySubject = atendidos.reduce((acc, a) => {
        (a.subject ? [a.subject] : []).concat(a.demandas?.descricoes || []).forEach(demanda => {
            acc[demanda] = (acc[demanda] || 0) + 1;
        });
        return acc;
    }, {});
    
    const totalDemandas = Object.values(statsBySubject).reduce((sum, count) => sum + count, 0);

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

    const html = `
    <div class="grid grid-cols-1 lg:grid-cols-4 gap-4 h-full p-4 overflow-hidden">
        <div class="lg:col-span-1 flex flex-col gap-4 overflow-y-auto">
            <div class="bg-white p-4 rounded-lg border">
                <h3 class="text-lg font-semibold text-gray-800 mb-3">Resumo Geral</h3>
                <div class="grid grid-cols-2 gap-3 text-center">
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
                    </table>
                </div>
            </div>` : ''}
        </div>
        <div class="lg:col-span-3 flex flex-col gap-4 overflow-y-auto">
            <div class="bg-white p-4 rounded-lg border">
                <h3 class="text-lg font-semibold text-gray-800 mb-2">Atendimentos por Colaborador</h3>
                <div class="overflow-y-auto">
                    <table class="w-full text-sm text-left">
                        <thead class="text-xs text-gray-700 uppercase bg-gray-100 sticky top-0">
                            <tr>
                                <th class="px-4 py-2">Colaborador</th>
                                <th class="px-4 py-2 text-right">Atendimentos</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${Object.entries(statsByCollaborator).sort(([,a],[,b]) => b-a).map(([name, count]) => `
                                <tr class="border-b">
                                    <td class="px-4 py-2 font-medium">${name}</td>
                                    <td class="px-4 py-2 text-right">${count}</td>
                                </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            <div class="bg-white p-4 rounded-lg border">
                <h3 class="text-lg font-semibold text-gray-800 mb-2">Demandas por Assunto</h3>
                 <div class="overflow-y-auto">
                    <table class="w-full text-sm text-left">
                        <thead class="text-xs text-gray-700 uppercase bg-gray-100 sticky top-0">
                            <tr>
                                <th class="px-4 py-2">Assunto/Demanda</th>
                                <th class="px-4 py-2 text-right">Total Atendido</th>
                                <th class="px-4 py-2 text-right">% do Total</th>
                            </tr>
                        </thead>
                        <tbody>
                             ${Object.entries(statsBySubject).sort(([,a],[,b]) => b-a).map(([subject, count]) => `
                                <tr class="border-b">
                                    <td class="px-4 py-2 font-medium">${subject}</td>
                                    <td class="px-4 py-2 text-right">${count}</td>
                                    <td class="px-4 py-2 text-right">${totalDemandas > 0 ? ((count / totalDemandas) * 100).toFixed(1) : 0}%</td>
                                </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
    `;
    content.innerHTML = html;
    
    document.getElementById('export-stats-pdf-btn').addEventListener('click', () => {
        exportStatisticsToPDF(pautaName, {
            atendidosCount: atendidos.length, faltososCount: faltosos.length,
            avgTimeDirect, avgTimeDelegated, useDelegationFlow,
            statsByCollaborator, statsBySubject,
            statsByTime: sortedTimes.map(time => ({ time, count: statsByTime[time] })),
            statsByTimeFaltosos: sortedTimesFaltosos.map(time => ({ time, count: statsByTimeFaltosos[time] }))
        });
    });
}
