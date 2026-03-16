/**
 * estatisticas.js - VERSÃO INTEGRADA
 * Puxa dados de cadastro do colaboradores.js
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
     * Renderiza o modal de estatísticas integrando com o cadastro de colaboradores
     */
    showModal(allAssisted, useDelegationFlow, pautaName) {
        const modal = document.getElementById('statistics-modal');
        if (!modal) return;
        
        modal.classList.remove('hidden');
        
        const closeBtn = document.getElementById('close-statistics-modal-btn');
        if (closeBtn) closeBtn.onclick = () => modal.classList.add('hidden');

        const content = document.getElementById('statistics-content');
        if (!content) return;

        // 1. OBTER COLABORADORES DO CADASTRO (colaboradores.js)
        let todosColaboradores = [];
        if (window.app && window.app.colaboradores) {
            todosColaboradores = window.app.colaboradores;
        } else {
            const stored = localStorage.getItem('sigap_colaboradores');
            if (stored) {
                try { todosColaboradores = JSON.parse(stored); } catch (e) { console.error(e); }
            }
        }

        // 2. FILTRAR ATENDIMENTOS
        const atendidos = allAssisted.filter(a => a.status === 'atendido');
        const faltosos = allAssisted.filter(a => a.status === 'faltoso');

        // 3. CRUZAR DADOS: Mapear quem atendeu e quem é apenas do cadastro
        const statsByGroup = {};

        // Primeiro, preenche com TODOS os colaboradores cadastrados por equipe
        todosColaboradores.forEach(col => {
            const equipe = col.equipe ? `Equipe ${col.equipe}` : 'Equipe Não Definida';
            if (!statsByGroup[equipe]) statsByGroup[equipe] = { colaboradores: {}, total: 0 };
            
            statsByGroup[equipe].colaboradores[col.nome] = {
                nome: col.nome,
                cargo: col.cargo || 'Não informado',
                atendimentos: 0,
                tempoTotal: 0
            };
        });

        // Segundo, soma os atendimentos realizados no dia
        atendidos.forEach(a => {
            const nomeColab = a.colaboradorResponsavel;
            const equipeColab = a.equipeResponsavel || 'Equipe Não Definida';

            if (!statsByGroup[equipeColab]) {
                statsByGroup[equipeColab] = { colaboradores: {}, total: 0 };
            }

            if (!statsByGroup[equipeColab].colaboradores[nomeColab]) {
                statsByGroup[equipeColab].colaboradores[nomeColab] = {
                    nome: nomeColab,
                    cargo: 'Externo/Não Cadastrado',
                    atendimentos: 0,
                    tempoTotal: 0
                };
            }

            const colab = statsByGroup[equipeColab].colaboradores[nomeColab];
            colab.atendimentos++;
            statsByGroup[equipeColab].total++;

            const duracao = this.getTimeDifferenceInMinutes(a.horaInicioAtendimento, a.horaFimAtendimento);
            if (duracao) colab.tempoTotal += duracao;
        });

        // 4. RENDERIZAR TABELA
        let html = `
            <div class="grid grid-cols-3 gap-4 mb-6">
                <div class="p-4 bg-gray-50 rounded"><strong>Total:</strong> ${allAssisted.length}</div>
                <div class="p-4 bg-green-50 rounded text-green-700"><strong>Atendidos:</strong> ${atendidos.length}</div>
                <div class="p-4 bg-red-50 rounded text-red-700"><strong>Faltas:</strong> ${faltosos.length}</div>
            </div>
            <table class="w-full text-sm border-collapse">
                <thead>
                    <tr class="bg-gray-200">
                        <th class="p-2 border text-left">Equipe/Colaborador</th>
                        <th class="p-2 border text-center">Cargo</th>
                        <th class="p-2 border text-center">Qtd</th>
                        <th class="p-2 border text-center">Média</th>
                    </tr>
                </thead>
                <tbody>
        `;

        Object.keys(statsByGroup).sort().forEach(equipe => {
            html += `<tr class="bg-gray-100 font-bold"><td colspan="4" class="p-2 border">${equipe}</td></tr>`;
            
            Object.values(statsByGroup[equipe].colaboradores).forEach(c => {
                const media = c.atendimentos > 0 ? Math.round(c.tempoTotal / c.atendimentos) + 'm' : '-';
                html += `
                    <tr>
                        <td class="p-2 border pl-6">${c.nome}</td>
                        <td class="p-2 border text-center text-gray-500">${c.cargo}</td>
                        <td class="p-2 border text-center ${c.atendimentos === 0 ? 'text-gray-300' : ''}">${c.atendimentos}</td>
                        <td class="p-2 border text-center">${media}</td>
                    </tr>
                `;
            });
        });

        html += `</tbody></table>`;
        content.innerHTML = html;
    }
};

export const renderStatisticsModal = (allAssisted, useDelegationFlow, pautaName) => {
    return StatisticsService.showModal(allAssisted, useDelegationFlow, pautaName);
};
