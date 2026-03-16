/**
 * estatisticas.js - VERSÃO INTEGRADA COMPLETA
 * Integração total com o cadastro de colaboradores.
 */

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
     * Busca a lista oficial de colaboradores cadastrados
     */
    getRegisteredCollaborators() {
        let lista = [];
        // Tenta buscar do estado global do app
        if (window.app && window.app.colaboradores) {
            lista = window.app.colaboradores;
        } 
        // Backup: busca do localStorage (onde o CollaboratorService salva)
        else {
            const stored = localStorage.getItem('sigap_colaboradores');
            if (stored) {
                try { lista = JSON.parse(stored); } catch (e) { console.error(e); }
            }
        }
        return lista;
    },

    /**
     * Renderiza o modal de estatísticas cruzando com colaboradores
     */
    showModal(allAssisted, useDelegationFlow, pautaName) {
        const modal = document.getElementById('statistics-modal');
        if (!modal) return;
        
        modal.classList.remove('hidden');
        const content = document.getElementById('statistics-content');
        
        // 1. Obter colaboradores cadastrados
        const colaboradoresCadastrados = this.getRegisteredCollaborators();
        
        // 2. Processar Atendimentos
        const atendidos = allAssisted.filter(a => a.status === 'atendido');
        const faltosos = allAssisted.filter(a => a.status === 'faltoso');

        // 3. Agrupar por Equipe baseando-se no CADASTRO
        const statsByGroup = {};

        // Inicializa com todos do cadastro para garantir que quem não atendeu apareça
        colaboradoresCadastrados.forEach(col => {
            const equipe = col.equipe || 'Sem Equipe';
            if (!statsByGroup[equipe]) {
                statsByGroup[equipe] = { colaboradores: {}, total: 0 };
            }
            if (!statsByGroup[equipe].colaboradores[col.nome]) {
                statsByGroup[equipe].colaboradores[col.nome] = {
                    nome: col.nome,
                    cargo: col.cargo,
                    atendimentos: 0,
                    tempoTotal: 0
                };
            }
        });

        // Adiciona os dados dos atendimentos realizados
        atendidos.forEach(a => {
            const nomeColab = a.colaboradorResponsavel || 'Não Identificado';
            const equipeColab = a.equipeResponsavel || 'Sem Equipe';
            
            if (!statsByGroup[equipeColab]) {
                statsByGroup[equipeColab] = { colaboradores: {}, total: 0 };
            }

            if (!statsByGroup[equipeColab].colaboradores[nomeColab]) {
                statsByGroup[equipeColab].colaboradores[nomeColab] = {
                    nome: nomeColab,
                    cargo: 'Não Cadastrado',
                    atendimentos: 0,
                    tempoTotal: 0
                };
            }

            const colabStats = statsByGroup[equipeColab].colaboradores[nomeColab];
            colabStats.atendimentos++;
            statsByGroup[equipeColab].total++;

            const duracao = this.getTimeDifferenceInMinutes(a.horaInicioAtendimento, a.horaFimAtendimento);
            if (duracao) colabStats.tempoTotal += duracao;
        });

        // 4. Gerar HTML da Tabela
        let html = `
            <div class="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div class="bg-blue-50 p-4 rounded-lg border border-blue-200 shadow-sm">
                    <p class="text-blue-800 text-sm font-semibold uppercase">Total Geral</p>
                    <p class="text-3xl font-bold text-blue-900">${allAssisted.length}</p>
                </div>
                <div class="bg-green-50 p-4 rounded-lg border border-green-200 shadow-sm">
                    <p class="text-green-800 text-sm font-semibold uppercase">Atendidos</p>
                    <p class="text-3xl font-bold text-green-900">${atendidos.length}</p>
                </div>
                <div class="bg-red-50 p-4 rounded-lg border border-red-200 shadow-sm">
                    <p class="text-red-800 text-sm font-semibold uppercase">Faltosos</p>
                    <p class="text-3xl font-bold text-red-900">${faltosos.length}</p>
                </div>
            </div>
            
            <div class="overflow-x-auto">
                <table class="min-w-full bg-white border border-gray-200">
                    <thead class="bg-gray-100">
                        <tr>
                            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Equipe / Colaborador</th>
                            <th class="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Cargo</th>
                            <th class="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Atendimentos</th>
                            <th class="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Média Tempo</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200">
        `;

        Object.keys(statsByGroup).sort().forEach(equipe => {
            html += `<tr class="bg-gray-50"><td colspan="4" class="px-4 py-2 font-bold text-gray-700">${equipe}</td></tr>`;
            
            const colaboradores = Object.values(statsByGroup[equipe].colaboradores);
            colaboradores.forEach(c => {
                const media = c.atendimentos > 0 ? Math.round(c.tempoTotal / c.atendimentos) + ' min' : '-';
                html += `
                    <tr>
                        <td class="px-6 py-2 text-sm text-gray-600">${c.nome}</td>
                        <td class="px-4 py-2 text-sm text-center text-gray-500">${c.cargo}</td>
                        <td class="px-4 py-2 text-sm text-center font-semibold ${c.atendimentos === 0 ? 'text-gray-300' : 'text-gray-700'}">${c.atendimentos}</td>
                        <td class="px-4 py-2 text-sm text-center text-gray-500">${media}</td>
                    </tr>
                `;
            });
        });

        html += `</tbody></table></div>`;
        content.innerHTML = html;

        // Botão PDF
        const pdfBtn = document.getElementById('export-pdf-btn');
        if (pdfBtn) {
            pdfBtn.onclick = () => this.exportStatisticsToPDF(pautaName, statsByGroup, atendidos.length, faltosos.length);
        }
    },

    /**
     * Exportação para PDF (Requer jsPDF e autoTable)
     */
    exportStatisticsToPDF(pautaName, statsData, totalAtendidos, totalFaltosos) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        doc.setFontSize(18);
        doc.text(`Relatório de Produtividade - ${pautaName}`, 14, 20);
        
        const tableBody = [];
        Object.keys(statsData).forEach(equipe => {
            tableBody.push([{ content: equipe, colSpan: 3, styles: { fillColor: [240, 240, 240], fontStyle: 'bold' } }]);
            
            Object.values(statsData[equipe].colaboradores).forEach(c => {
                tableBody.push([
                    c.nome,
                    c.cargo,
                    c.atendimentos.toString()
                ]);
            });
        });

        doc.autoTable({
            startY: 30,
            head: [['Colaborador', 'Cargo', 'Atendimentos']],
            body: tableBody,
            theme: 'grid'
        });

        doc.save(`Estatisticas_${pautaName}.pdf`);
    }
};

// Exportações para manter compatibilidade com o restante do sistema
export const renderStatisticsModal = (allAssisted, useDelegationFlow, pautaName) => {
    return StatisticsService.showModal(allAssisted, useDelegationFlow, pautaName);
};

export const exportStatisticsToPDF = (pautaName, statsData) => {
    return StatisticsService.exportStatisticsToPDF(pautaName, statsData);
};
