/**
 * estatisticas.js - SIGAP
 * Versão CORRIGIDA - Mostra todos os membros das equipes
 * 
 * Funcionalidades:
 * ✅ Puxa colaboradores do localStorage (onde o colaboradores.js salva)
 * ✅ Mostra TODOS os membros de cada equipe
 * ✅ Total de atendimentos por equipe
 * ✅ 3 tipos de PDF
 */

// ========================================================
// STATISTICS SERVICE
// ========================================================

export const StatisticsService = {
    
    /* ========================================================
       1. CARREGAR COLABORADORES DO LOCALSTORAGE
       ======================================================== */
    
    /**
     * Carrega colaboradores do localStorage (onde o colaboradores.js salva)
     */
    carregarColaboradores() {
        try {
            const stored = localStorage.getItem('sigap_colaboradores');
            if (stored) {
                const colaboradores = JSON.parse(stored);
                console.log(`📊 Carregados ${colaboradores.length} colaboradores do localStorage`);
                return colaboradores;
            }
        } catch (e) {
            console.error("Erro ao carregar colaboradores:", e);
        }
        
        // Tentar do window.app como fallback
        if (window.app && window.app.colaboradores) {
            console.log(`📊 Carregados ${window.app.colaboradores.length} colaboradores do window.app`);
            return window.app.colaboradores;
        }
        
        console.log("📊 Nenhum colaborador encontrado");
        return [];
    },

    /**
     * Calcula diferença em minutos
     */
    getTimeDifferenceInMinutes(startTimeISO, endTimeISO) {
        if (!startTimeISO || !endTimeISO) return null;
        const start = new Date(startTimeISO);
        const end = new Date(endTimeISO);
        if (isNaN(start) || isNaN(end)) return null;
        return Math.round((end - start) / 60000);
    },

    /* ========================================================
       2. RENDERIZAR MODAL
       ======================================================== */

    showModal(allAssisted, useDelegationFlow, pautaName) {
        const modal = document.getElementById('statistics-modal');
        if (!modal) return;

        modal.classList.remove('hidden');
        
        const closeBtn = document.getElementById('close-statistics-modal-btn');
        if (closeBtn) closeBtn.onclick = () => modal.classList.add('hidden');

        const titleEl = modal.querySelector('h2');
        if (titleEl) titleEl.innerHTML = `<span class="text-green-600">📊</span> Estatísticas - ${pautaName}`;

        const content = document.getElementById('statistics-content');
        if (!content) return;

        content.innerHTML = `<div class="flex items-center justify-center h-full"><p class="text-gray-600">Carregando...</p></div>`;

        // ===== CARREGAR COLABORADORES =====
        const colaboradores = this.carregarColaboradores();
        
        // ===== PROCESSAR ATENDIMENTOS =====
        const atendidos = allAssisted.filter(a => a.status === 'atendido') || [];
        const faltosos = allAssisted.filter(a => a.status === 'faltoso') || [];
        
        // Mapear atendimentos por nome do colaborador
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

        // ===== AGRUPAR COLABORADORES POR EQUIPE =====
        const equipes = {};
        
        // Adicionar todos os colaboradores cadastrados
        colaboradores.forEach(col => {
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

        // Adicionar atendentes não cadastrados
        Object.entries(atendimentosPorNome).forEach(([nome, count]) => {
            if (!colaboradores.some(c => c.nome === nome) && nome !== 'Não informado') {
                if (!equipes['Não Cadastrado']) {
                    equipes['Não Cadastrado'] = {
                        nome: 'Não Cadastrado',
                        total: 0,
                        membros: []
                    };
                }
                equipes['Não Cadastrado'].membros.push({
                    nome: nome,
                    cargo: 'Não cadastrado',
                    atendimentos: count
                });
                equipes['Não Cadastrado'].total += count;
            }
        });

        // Ordenar equipes
        const equipesOrdenadas = Object.values(equipes).sort((a, b) => {
            if (a.nome === 'CRC') return -1;
            if (b.nome === 'CRC') return 1;
            if (a.nome === 'Não Cadastrado') return 1;
            if (b.nome === 'Não Cadastrado') return -1;
            
            const aNum = a.nome.match(/Equipe (\d+)/);
            const bNum = b.nome.match(/Equipe (\d+)/);
            if (aNum && bNum) return parseInt(aNum[1]) - parseInt(bNum[1]);
            if (aNum) return -1;
            if (bNum) return 1;
            
            return a.nome.localeCompare(b.nome);
        });

        // Ordenar membros por nome
        equipesOrdenadas.forEach(equipe => {
            equipe.membros.sort((a, b) => a.nome.localeCompare(b.nome));
        });

        // ===== ESTATÍSTICAS POR ASSUNTO =====
        const statsBySubject = {};
        allAssisted.forEach(a => {
            const demandas = (a.subject ? [a.subject] : []).concat(a.demandas?.descricoes || []);
            demandas.forEach(demanda => {
                if (!statsBySubject[demanda]) {
                    statsBySubject[demanda] = { total: 0, atendidos: 0, faltosos: 0 };
                }
                statsBySubject[demanda].total++;
                if (a.status === 'atendido') statsBySubject[demanda].atendidos++;
                else if (a.status === 'faltoso') statsBySubject[demanda].faltosos++;
            });
        });

        // ===== HORÁRIOS =====
        const statsByTime = {};
        atendidos.filter(a => a.scheduledTime).forEach(a => {
            statsByTime[a.scheduledTime] = (statsByTime[a.scheduledTime] || 0) + 1;
        });
        const sortedTimes = Object.keys(statsByTime).sort();

        const statsByScheduledTime = {};
        allAssisted.filter(a => a.scheduledTime).forEach(a => {
            statsByScheduledTime[a.scheduledTime] = (statsByScheduledTime[a.scheduledTime] || 0) + 1;
        });
        const sortedScheduledTimes = Object.keys(statsByScheduledTime).sort();

        // ===== TEMPO MÉDIO =====
        let totalMinutes = 0, count = 0;
        atendidos.forEach(a => {
            const minutes = this.getTimeDifferenceInMinutes(a.arrivalTime, a.attendedTime);
            if (minutes !== null) {
                totalMinutes += minutes;
                count++;
            }
        });
        const avgTime = count > 0 ? Math.round(totalMinutes / count) : 0;

        // ===== GERAR HTML DAS EQUIPES =====
        const equipesHTML = equipesOrdenadas.map(equipe => `
            <div class="mb-4 border rounded-lg overflow-hidden">
                <div class="bg-gray-100 px-3 py-2 font-bold flex justify-between items-center">
                    <span>${equipe.nome}</span>
                    <span class="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs">
                        Total: ${equipe.total}
                    </span>
                </div>
                <div class="p-2">
                    <p class="text-xs text-gray-500 mb-1">Membros (${equipe.membros.length}):</p>
                    <div class="grid grid-cols-1 gap-1">
                        ${equipe.membros.map(m => `
                            <div class="text-xs flex justify-between items-center border-b py-1">
                                <span>• ${m.nome}</span>
                                <span class="${m.atendimentos > 0 ? 'text-green-600 font-bold' : 'text-gray-400'}">
                                    ${m.atendimentos}
                                </span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `).join('');

        // ===== BOTÕES =====
        const botoesHTML = `
            <div class="bg-white p-3 rounded-lg border mt-4">
                <h3 class="text-sm font-bold mb-3">Exportar Relatórios</h3>
                <div class="grid grid-cols-1 gap-2">
                    <button id="export-equipes-pdf-btn" class="bg-purple-600 text-white font-bold py-2 px-3 rounded-lg hover:bg-purple-700 text-sm">
                        👥 PDF por Equipe
                    </button>
                </div>
            </div>
        `;

        // ===== HTML FINAL =====
        content.innerHTML = `
        <div class="p-2 grid grid-cols-1 lg:grid-cols-5 gap-3 h-full overflow-hidden">
            <div class="lg:col-span-2 space-y-3 overflow-y-auto pr-2">
                <div class="bg-white p-3 rounded-lg border">
                    <h3 class="text-sm font-bold mb-2">Resumo</h3>
                    <div class="grid grid-cols-2 gap-2 text-center">
                        <div class="bg-green-100 p-2 rounded">
                            <p class="text-xl font-bold text-green-700">${atendidos.length}</p>
                            <p class="text-xs">Atendidos</p>
                        </div>
                        <div class="bg-red-100 p-2 rounded">
                            <p class="text-xl font-bold text-red-700">${faltosos.length}</p>
                            <p class="text-xs">Faltosos</p>
                        </div>
                        <div class="bg-blue-100 p-2 rounded col-span-2">
                            <p class="text-xl font-bold text-blue-700">${avgTime} min</p>
                            <p class="text-xs">Tempo Médio</p>
                        </div>
                    </div>
                </div>
                
                ${botoesHTML}
            </div>

            <div class="lg:col-span-3 overflow-y-auto">
                <div class="bg-white p-3 rounded-lg border">
                    <h3 class="text-sm font-bold mb-2">Equipes</h3>
                    ${equipesHTML || '<p class="text-gray-400 text-center py-4">Nenhum colaborador cadastrado</p>'}
                </div>
            </div>
        </div>
        `;

        // Configurar botão PDF
        const btn = document.getElementById('export-equipes-pdf-btn');
        if (btn) {
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            newBtn.addEventListener('click', () => {
                newBtn.textContent = 'Gerando...';
                newBtn.disabled = true;
                this.exportEquipesPDF(pautaName, { equipesOrdenadas, atendidosCount: atendidos.length }).finally(() => {
                    newBtn.textContent = '👥 PDF por Equipe';
                    newBtn.disabled = false;
                });
            });
        }
    },

    /* ========================================================
       3. PDF POR EQUIPE
       ======================================================== */

    async exportEquipesPDF(pautaName, dados) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 20;
        let y = 30;

        doc.setFontSize(18);
        doc.setTextColor(22, 163, 74);
        doc.setFont("helvetica", "bold");
        doc.text("RELATÓRIO DE EQUIPES", pageWidth / 2, y, { align: "center" });
        y += 10;
        
        doc.setFontSize(10);
        doc.setTextColor(80);
        doc.text(`Pauta: ${pautaName}`, margin, y);
        y += 6;
        doc.text(`Gerado: ${new Date().toLocaleString('pt-BR')}`, margin, y);
        y += 6;
        doc.text(`Total de Atendimentos: ${dados.atendidosCount || 0}`, margin, y);
        y += 15;

        dados.equipesOrdenadas.forEach(equipe => {
            if (y > pageHeight - 50) {
                doc.addPage();
                y = 20;
            }

            doc.setFontSize(14);
            doc.setTextColor(0, 102, 204);
            doc.setFont("helvetica", "bold");
            doc.text(equipe.nome, margin, y);
            y += 8;
            
            doc.setFontSize(12);
            doc.setTextColor(22, 163, 74);
            doc.text(`Total de Atendimentos: ${equipe.total}`, margin + 5, y);
            y += 8;
            
            doc.setFontSize(10);
            doc.setTextColor(60);
            doc.setFont("helvetica", "bold");
            doc.text("Membros:", margin + 5, y);
            y += 6;
            
            doc.setFont("helvetica", "normal");
            doc.setFontSize(9);
            
            equipe.membros.forEach(membro => {
                if (y > pageHeight - 20) {
                    doc.addPage();
                    y = 20;
                }
                doc.text(`• ${membro.nome}`, margin + 10, y);
                y += 5;
            });
            
            y += 10;
        });

        doc.save(`equipes_${pautaName.replace(/\s+/g, '_')}.pdf`);
    }
};

// ========================================================
// EXPORTAÇÕES
// ========================================================

export default StatisticsService;
export { StatisticsService };
window.StatisticsService = StatisticsService;

console.log("✅ estatisticas.js carregado - versão corrigida");