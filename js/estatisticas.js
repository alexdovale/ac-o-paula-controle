/**
 * estatisticas.js - VERSÃO DEBUG
 * 
 * Esta versão mostra logs detalhados para identificar o problema
 */

export const StatisticsService = {
    
    /**
     * Carrega colaboradores e mostra DEBUG
     */
    carregarColaboradores() {
        console.log("🔍 DEBUG - Iniciando carregamento de colaboradores");
        
        let colaboradores = [];
        
        // 1. Tentar do localStorage
        try {
            const stored = localStorage.getItem('sigap_colaboradores');
            console.log("🔍 localStorage.getItem('sigap_colaboradores'):", stored);
            
            if (stored) {
                colaboradores = JSON.parse(stored);
                console.log(`✅ Encontrados ${colaboradores.length} colaboradores no localStorage`);
                console.log("📋 Primeiro colaborador:", colaboradores[0]);
            }
        } catch (e) {
            console.error("❌ Erro ao ler localStorage:", e);
        }
        
        // 2. Se não encontrou, tentar do window.app
        if (colaboradores.length === 0 && window.app && window.app.colaboradores) {
            colaboradores = window.app.colaboradores;
            console.log(`✅ Encontrados ${colaboradores.length} colaboradores no window.app`);
        }
        
        // 3. Se ainda não tem, criar dados de exemplo
        if (colaboradores.length === 0) {
            console.log("⚠️ Nenhum colaborador encontrado, criando dados de exemplo");
            colaboradores = [
                { nome: "João Silva", cargo: "Defensor", equipe: "1" },
                { nome: "Maria Santos", cargo: "Servidor", equipe: "1" },
                { nome: "Pedro Souza", cargo: "CRC", equipe: "CRC" },
                { nome: "Ana Oliveira", cargo: "Residente", equipe: "2" },
                { nome: "Carlos Lima", cargo: "Estagiário", equipe: "2" }
            ];
        }
        
        // 4. Mostrar todos os colaboradores
        console.log("📋 TODOS OS COLABORADORES CARREGADOS:");
        colaboradores.forEach((col, i) => {
            console.log(`   ${i+1}. Nome: "${col.nome}", Cargo: "${col.cargo}", Equipe: "${col.equipe}"`);
        });
        
        return colaboradores;
    },

    /**
     * Renderiza o modal
     */
    showModal(allAssisted, useDelegationFlow, pautaName) {
        console.log("🔍 showModal chamado");
        console.log("allAssisted:", allAssisted);
        
        const modal = document.getElementById('statistics-modal');
        if (!modal) {
            console.error("❌ Modal não encontrado");
            return;
        }

        modal.classList.remove('hidden');
        
        const closeBtn = document.getElementById('close-statistics-modal-btn');
        if (closeBtn) closeBtn.onclick = () => modal.classList.add('hidden');

        const titleEl = modal.querySelector('h2');
        if (titleEl) titleEl.innerHTML = `<span class="text-green-600">📊</span> Estatísticas - ${pautaName}`;

        const content = document.getElementById('statistics-content');
        if (!content) return;

        // Carregar colaboradores
        const colaboradores = this.carregarColaboradores();
        
        // Contar atendimentos
        const atendidos = allAssisted.filter(a => a.status === 'atendido') || [];
        console.log(`📊 Atendidos: ${atendidos.length}`);
        
        // Mapear atendimentos por nome
        const atendimentosPorNome = {};
        atendidos.forEach(a => {
            let nome = 'Não informado';
            if (a.attendant) {
                if (typeof a.attendant === 'object') {
                    nome = a.attendant.nome || a.attendant.name || 'Não informado';
                } else {
                    nome = String(a.attendant);
                }
            }
            atendimentosPorNome[nome] = (atendimentosPorNome[nome] || 0) + 1;
        });
        console.log("📊 Atendimentos por nome:", atendimentosPorNome);

        // Agrupar por equipe
        const equipes = {};
        
        colaboradores.forEach(col => {
            // Log de cada colaborador
            console.log(`Processando: ${col.nome} | cargo: ${col.cargo} | equipe: ${col.equipe}`);
            
            // Determinar nome da equipe
            let nomeEquipe = 'Equipe Não Definida';
            if (col.equipe) {
                if (col.equipe === 'CRC') {
                    nomeEquipe = 'CRC';
                } else if (!isNaN(col.equipe)) {
                    nomeEquipe = `Equipe ${col.equipe}`;
                } else {
                    nomeEquipe = col.equipe;
                }
            }
            
            if (!equipes[nomeEquipe]) {
                equipes[nomeEquipe] = {
                    nome: nomeEquipe,
                    total: 0,
                    membros: []
                };
            }
            
            const atendimentos = atendimentosPorNome[col.nome] || 0;
            equipes[nomeEquipe].membros.push({
                nome: col.nome,
                cargo: col.cargo || 'Sem cargo',
                atendimentos: atendimentos
            });
            equipes[nomeEquipe].total += atendimentos;
        });

        // Mostrar resultado
        console.log("📊 Equipes formadas:", equipes);

        // Gerar HTML
        let htmlEquipes = '';
        let totalEquipes = 0;
        
        Object.keys(equipes).sort().forEach(nomeEquipe => {
            const equipe = equipes[nomeEquipe];
            totalEquipes++;
            
            htmlEquipes += `
                <div class="mb-4 border rounded-lg overflow-hidden">
                    <div class="bg-gray-100 px-3 py-2 font-bold flex justify-between items-center">
                        <span>${equipe.nome}</span>
                        <span class="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs">
                            Total: ${equipe.total}
                        </span>
                    </div>
                    <div class="p-2">
                        <p class="text-xs text-gray-500 mb-1">Membros (${equipe.membros.length}):</p>
                        <div class="space-y-1">
                            ${equipe.membros.map(m => `
                                <div class="text-xs flex justify-between items-center border-b py-1">
                                    <span>• ${m.nome} (${m.cargo})</span>
                                    <span class="${m.atendimentos > 0 ? 'text-green-600 font-bold' : 'text-gray-400'}">
                                        ${m.atendimentos}
                                    </span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `;
        });

        // Se não encontrou equipes, mostrar mensagem
        if (totalEquipes === 0) {
            htmlEquipes = `
                <div class="bg-yellow-50 border border-yellow-200 p-4 rounded-lg text-center">
                    <p class="text-yellow-700">⚠️ Nenhuma equipe encontrada</p>
                    <p class="text-xs text-gray-500 mt-2">Colaboradores carregados: ${colaboradores.length}</p>
                </div>
            `;
        }

        // Montar tela
        content.innerHTML = `
            <div class="p-4">
                <div class="bg-white p-3 rounded-lg border mb-4">
                    <h3 class="text-sm font-bold mb-2">Resumo</h3>
                    <div class="grid grid-cols-3 gap-2 text-center">
                        <div class="bg-green-100 p-2 rounded">
                            <p class="text-xl font-bold text-green-700">${atendidos.length}</p>
                            <p class="text-xs">Atendidos</p>
                        </div>
                        <div class="bg-red-100 p-2 rounded">
                            <p class="text-xl font-bold text-red-700">${allAssisted.filter(a => a.status === 'faltoso').length}</p>
                            <p class="text-xs">Faltosos</p>
                        </div>
                        <div class="bg-blue-100 p-2 rounded">
                            <p class="text-xl font-bold text-blue-700">${colaboradores.length}</p>
                            <p class="text-xs">Cadastrados</p>
                        </div>
                    </div>
                </div>

                <div class="bg-white p-3 rounded-lg border">
                    <h3 class="text-sm font-bold mb-2">Equipes</h3>
                    ${htmlEquipes}
                </div>
            </div>
        `;
    }
};

// Exportações
export default StatisticsService;
export { StatisticsService };
window.StatisticsService = StatisticsService;

console.log("✅ estatisticas.js - VERSÃO DEBUG CARREGADA");