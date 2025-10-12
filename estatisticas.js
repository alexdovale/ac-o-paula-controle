/**
 * estatisticas.js - Versão Módulo Corrigida
 * Este arquivo deve ser importado pelo seu script principal.
 */

function makeModalInteractive(modal) {
    if (!modal || modal.classList.contains('interactive-modal-init')) {
        return;
    }
    modal.classList.add('interactive-modal-init', 'bg-white');

    const content = document.getElementById('statistics-content');
    if (!content) {
        console.error("#statistics-content não encontrado.");
        return;
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

    content.style.flexGrow = '1';
    content.style.overflow = 'hidden';
    content.style.padding = '0';
    content.classList.add('bg-gray-50');

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
        const isMinimized = modal.classList.toggle('minimized');
        if (isMinimized) {
            originalState.height = modal.style.height;
            content.style.display = 'none';
            modal.style.height = header.offsetHeight + 'px';
            modal.style.resize = 'none';
        } else {
            content.style.display = 'block';
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

    modal.innerHTML = '';

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

    // NOVO: Cálculo detalhado para a tabela de demandas
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
    <div class="grid grid-cols-1 lg:grid-cols-5 gap-4 h-full p-4 overflow-hidden">
        <div class="lg:col-span-2 flex flex-col gap-4 overflow-y-auto">
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
        <div class="lg:col-span-3 flex flex-col gap-4 overflow-y-auto">
            <div class="bg-white p-4 rounded-lg border">
                <h3 class="text-lg font-semibold text-gray-800 mb-2">Demandas por Assunto</h3>
                 <div class="overflow-y-auto">
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
                    </table>
                </div>
            </div>
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
        </div>
    </div>
    `;
    content.innerHTML = html;

    document.getElementById('export-stats-pdf-btn').addEventListener('click', () => {
        exportStatisticsToPDF(pautaName, {
            atendidosCount: atendidos.length,
            faltososCount: faltosos.length,
            avgTimeDirect,
            avgTimeDelegated,
            useDelegationFlow,
            statsByCollaborator,
            statsBySubject, // Passando os novos dados detalhados
            statsByTime: sortedTimes.map(time => ({ time, count: statsByTime[time] })),
            statsByTimeFaltosos: sortedTimesFaltosos.map(time => ({ time, count: statsByTimeFaltosos[time] }))
        });
    });
}


async function exportStatisticsToPDF(pautaName, statsData) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    let yPos = 15;

    // ALTERADO: Lógica do título para quebrar linha se necessário
    const title = `Estatísticas - ${pautaName}`;
    const splitTitle = doc.splitTextToSize(title, 180); // 180mm = Largura da página A4 menos margens
    doc.setFontSize(18);
    doc.text(splitTitle, 14, yPos);
    yPos += doc.getTextDimensions(splitTitle).h + 5; // Pula o espaço ocupado pelo título

    doc.setFontSize(12);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, yPos);
    yPos += 15;

    const addSection = (title, startY) => {
        if (startY > 250) {
            doc.addPage();
            startY = 20;
        }
        doc.setFontSize(14);
        doc.text(title, 14, startY);
        return startY + 8;
    };

    if (document.getElementById('export-general').checked) {
        yPos = addSection("Resumo Geral", yPos);
        doc.setFontSize(12);
        let summaryText = `- Total de Atendidos: ${statsData.atendidosCount}\n- Total de Faltosos: ${statsData.faltososCount}\n- Tempo Médio (direto): ${statsData.avgTimeDirect} min`;
        if (statsData.useDelegationFlow) {
            summaryText += `\n- Tempo Médio (com delegação): ${statsData.avgTimeDelegated} min`;
        }
        const splitText = doc.splitTextToSize(summaryText, 180);
        doc.text(splitText, 14, yPos);
        yPos += doc.getTextDimensions(splitText).h + 10;
    }

    if (document.getElementById('export-subjects').checked && Object.keys(statsData.statsBySubject).length > 0) {
        yPos = addSection("Demandas por Assunto", yPos);
        const totalDemands = Object.values(statsData.statsBySubject).reduce((sum, data) => sum + data.total, 0);
        doc.autoTable({
            startY: yPos,
            // ALTERADO: Novas colunas no PDF
            head: [['Assunto/Demanda', 'Total', 'Atendidos', 'Faltosos', '% do Total']],
            body: Object.entries(statsData.statsBySubject)
                .sort(([, a], [, b]) => b.total - a.total)
                .map(([subject, data]) => [
                    subject,
                    data.total,
                    data.atendidos,
                    data.faltosos,
                    totalDemands > 0 ? ((data.total / totalDemands) * 100).toFixed(1) + '%' : '0%'
                ]),
            theme: 'striped',
            didDrawPage: (data) => {
                yPos = data.cursor.y;
            }
        });
        yPos = doc.autoTable.previous.finalY + 10;
    }

    if (document.getElementById('export-collaborators').checked && Object.keys(statsData.statsByCollaborator).length > 0) {
        yPos = addSection("Atendimentos por Colaborador", yPos);
        doc.autoTable({
            startY: yPos,
            head: [['Colaborador', 'Atendimentos']],
            body: Object.entries(statsData.statsByCollaborator).sort(([, a], [, b]) => b - a),
            theme: 'striped',
            didDrawPage: (data) => {
                yPos = data.cursor.y;
            }
        });
        yPos = doc.autoTable.previous.finalY + 10;
    }

    // ALTERADO: Função agora aceita um total para o rodapé
    const addTableToPdf = (title, data, headStyles, checkboxId, total) => {
        if (document.getElementById(checkboxId).checked && data.length > 0) {
            yPos = addSection(title, yPos);
            doc.autoTable({
                startY: yPos,
                head: [['Horário', 'Quantidade']],
                body: data.map(item => [item.time, item.count]),
                // NOVO: Adiciona o rodapé com o total
                foot: [['Total', total]],
                theme: 'striped',
                headStyles: headStyles || {},
                footStyles: { fontStyle: 'bold', fillColor: headStyles.fillColor ? headStyles.fillColor : [240, 240, 240] },
                didDrawPage: (data) => {
                    yPos = data.cursor.y;
                }
            });
            yPos = doc.autoTable.previous.finalY + 10;
        }
    };

    // ALTERADO: Passando os totais para as funções
    addTableToPdf("Atendimentos por Horário", statsData.statsByTime, {}, 'export-times', statsData.atendidosCount);
    addTableToPdf("Faltosos por Horário", statsData.statsByTimeFaltosos, {
        fillColor: [220, 38, 38]
    }, 'export-absentees-time', statsData.faltososCount);

    doc.save(`estatisticas_${pautaName.replace(/\s+/g, '_')}.pdf`);
}
