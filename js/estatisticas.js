/**
 * estatisticas.js - SIGAP
 * Versão COMPLETA E CORRIGIDA - Mostra todas as equipes com seus membros
 * 
 * Funcionalidades:
 * ✅ Carrega colaboradores do localStorage (onde o colaboradores.js salva)
 * ✅ Agrupa por equipe corretamente
 * ✅ Mostra TODOS os membros da equipe
 * ✅ Mostra total de atendimentos por equipe
 * ✅ 3 tipos de PDF
 */

// ========================================================
// STATISTICS SERVICE
// ========================================================

export const StatisticsService = {
    
    /* ========================================================
       1. CARREGAR COLABORADORES
       ======================================================== */
    
    carregarColaboradores() {
        try {
            // Tenta carregar do localStorage
            const stored = localStorage.getItem('sigap_colaboradores');
            if (stored) {
                const colaboradores = JSON.parse(stored);
                console.log(`📊 Carregados ${colaboradores.length} colaboradores do localStorage`);
                return colaboradores;
            }
        } catch (e) {
            console.error("Erro ao carregar colaboradores:", e);
        }
        
        // Se não encontrou, retorna array vazio
        console.log("📊 Nenhum colaborador encontrado");
        return [];
    },

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
        console.log("📊 showModal iniciado");
        
        const modal = document.getElementById('statistics-modal');
        if (!modal) {
            console.error("Modal não encontrado");
            return;
        }

        // Mostrar modal
        modal.classList.remove('hidden');
        
        // Botão fechar
        const closeBtn = document.getElementById('close-statistics-modal-btn');
        if (closeBtn) {
            closeBtn.onclick = () => modal.classList.add('hidden');
        }

        // Título
        const titleEl = modal.querySelector('h2');
        if (titleEl) {
            titleEl.innerHTML = `<span class="text-green-600">📊</span> Estatísticas - ${pautaName}`;
        }

        const content = document.getElementById('statistics-content');
        if (!content) {
            console.error("Content não encontrado");
            return;
        }

        // Mostrar loading
        content.innerHTML = `<div class="flex items-center justify-center h-full"><p class="text-gray-600">Carregando...</p></div>`;

        // ===== 1. CARREGAR COLABORADORES =====
        const colaboradores = this.carregarColaboradores();
        console.log("📋 Colaboradores carregados:", colaboradores);

        // ===== 2. PROCESSAR ATENDIMENTOS =====
        const atendidos = allAssisted.filter(a => a.status === 'atendido') || [];
        const faltosos = allAssisted.filter(a => a.status === 'faltoso') || [];
        
        console.log(`📊 Atendidos: ${atendidos.length}, Faltosos: ${faltosos.length}`);

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

        // ===== 3. CRIAR MAPA DE EQUIPES =====
        const equipesMap = {};

        // Adicionar todos os colaboradores
        colaboradores.forEach(col => {
            // Determinar nome da equipe
            let nomeEquipe = 'Equipe Não Definida';
            if (col.equipe) {
                if (col.equipe === 'CRC' || col.equipe.toString().toUpperCase() === 'CRC') {
                    nomeEquipe = 'CRC';
                } else {
                    nomeEquipe = `Equipe ${col.equipe}`;
                }
            }
            
            if (!equipesMap[nomeEquipe]) {
                equipesMap[nomeEquipe] = {
                    nome: nomeEquipe,
                    total: 0,
                    membros: []
                };
            }
            
            const atendimentos = atendimentosPorNome[col.nome] || 0;
            equipesMap[nomeEquipe].membros.push({
                nome: col.nome,
                cargo: col.cargo || 'Sem cargo',
                atendimentos: atendimentos
            });
            equipesMap[nomeEquipe].total += atendimentos;
        });

        // Adicionar atendentes não cadastrados
        Object.entries(atendimentosPorNome).forEach(([nome, count]) => {
            if (!colaboradores.some(c => c.nome === nome) && nome !== 'Não informado') {
                if (!equipesMap['Não Cadastrado']) {
                    equipesMap['Não Cadastrado'] = {
                        nome: 'Não Cadastrado',
                        total: 0,
                        membros: []
                    };
                }
                equipesMap['Não Cadastrado'].membros.push({
                    nome: nome,
                    cargo: 'Não cadastrado',
                    atendimentos: count
                });
                equipesMap['Não Cadastrado'].total += count;
            }
        });

        console.log("📊 Equipes formadas:", equipesMap);

        // ===== 4. ORDENAR EQUIPES =====
        const equipesOrdenadas = Object.values(equipesMap).sort((a, b) => {
            // CRC sempre primeiro
            if (a.nome === 'CRC') return -1;
            if (b.nome === 'CRC') return 1;
            
            // Não Cadastrado por último
            if (a.nome === 'Não Cadastrado') return 1;
            if (b.nome === 'Não Cadastrado') return -1;
            
            // Equipes numéricas em ordem crescente
            const aNum = a.nome.match(/\d+/);
            const bNum = b.nome.match(/\d+/);
            if (aNum && bNum) {
                return parseInt(aNum[0]) - parseInt(bNum[0]);
            }
            if (aNum) return -1;
            if (bNum) return 1;
            
            // Resto em ordem alfabética
            return a.nome.localeCompare(b.nome);
        });

        // Ordenar membros por nome
        equipesOrdenadas.forEach(equipe => {
            equipe.membros.sort((a, b) => a.nome.localeCompare(b.nome));
        });

        // ===== 5. ESTATÍSTICAS POR ASSUNTO =====
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

        // ===== 6. HORÁRIOS =====
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

        // ===== 7. TEMPO MÉDIO =====
        let totalMinutes = 0, count = 0;
        atendidos.forEach(a => {
            const minutes = this.getTimeDifferenceInMinutes(a.arrivalTime, a.attendedTime);
            if (minutes !== null) {
                totalMinutes += minutes;
                count++;
            }
        });
        const avgTime = count > 0 ? Math.round(totalMinutes / count) : 0;

        // ===== 8. GERAR HTML DAS EQUIPES =====
        let equipesHTML = '';
        
        if (equipesOrdenadas.length === 0) {
            equipesHTML = '<p class="text-gray-400 text-center py-4">Nenhuma equipe encontrada</p>';
        } else {
            equipesOrdenadas.forEach(equipe => {
                equipesHTML += `
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
        }

        // ===== 9. BOTÕES =====
        const botoesHTML = `
            <div class="bg-white p-3 rounded-lg border mt-4">
                <h3 class="text-sm font-bold mb-3">Exportar Relatórios</h3>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <button id="export-stats-pdf-btn" class="bg-blue-600 text-white font-bold py-2 px-3 rounded-lg hover:bg-blue-700 text-xs">
                        📊 PDF Resumo
                    </button>
                    <button id="export-equipes-pdf-btn" class="bg-purple-600 text-white font-bold py-2 px-3 rounded-lg hover:bg-purple-700 text-xs">
                        👥 PDF por Equipe
                    </button>
                    <button id="export-grupos-pdf-btn" class="bg-green-600 text-white font-bold py-2 px-3 rounded-lg hover:bg-green-700 text-xs">
                        📋 PDF por Grupo
                    </button>
                </div>
            </div>
        `;

        // ===== 10. HTML FINAL =====
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

                ${sortedScheduledTimes.length > 0 ? `
                <div class="bg-white p-3 rounded-lg border">
                    <h3 class="text-sm font-bold mb-2">Agendados</h3>
                    <div class="max-h-32 overflow-y-auto">
                        <table class="w-full text-xs">
                            ${sortedScheduledTimes.map(time => `
                                <tr><td>${time}</td><td class="text-right">${statsByScheduledTime[time]}</td></tr>
                            `).join('')}
                        </table>
                    </div>
                </div>` : ''}
            </div>

            <div class="lg:col-span-3 overflow-y-auto">
                <div class="bg-white p-3 rounded-lg border">
                    <h3 class="text-sm font-bold mb-2">Equipes</h3>
                    ${equipesHTML}
                </div>
            </div>
        </div>
        `;

        // ===== 11. CONFIGURAR BOTÕES PDF =====
        this.configurarBotoesPDF(pautaName, {
            atendidosCount: atendidos.length,
            faltososCount: faltosos.length,
            avgTime,
            equipesOrdenadas,
            statsBySubject,
            statsByScheduledTime: sortedScheduledTimes.map(time => ({ time, count: statsByScheduledTime[time] })),
            statsByTime: sortedTimes.map(time => ({ time, count: statsByTime[time] }))
        });
    },

    /* ========================================================
       3. CONFIGURAR BOTÕES PDF
       ======================================================== */

    configurarBotoesPDF(pautaName, dados) {
        // PDF Resumo
        const btnResumo = document.getElementById('export-stats-pdf-btn');
        if (btnResumo) {
            const newBtn = btnResumo.cloneNode(true);
            btnResumo.parentNode.replaceChild(newBtn, btnResumo);
            newBtn.addEventListener('click', () => {
                newBtn.disabled = true;
                newBtn.textContent = 'Gerando...';
                this.exportStatisticsToPDF(pautaName, dados).finally(() => {
                    newBtn.disabled = false;
                    newBtn.textContent = '📊 PDF Resumo';
                });
            });
        }

        // PDF por Equipe
        const btnEquipes = document.getElementById('export-equipes-pdf-btn');
        if (btnEquipes) {
            const newBtn = btnEquipes.cloneNode(true);
            btnEquipes.parentNode.replaceChild(newBtn, btnEquipes);
            newBtn.addEventListener('click', () => {
                newBtn.disabled = true;
                newBtn.textContent = 'Gerando...';
                this.exportEquipesPDF(pautaName, dados).finally(() => {
                    newBtn.disabled = false;
                    newBtn.textContent = '👥 PDF por Equipe';
                });
            });
        }

        // PDF por Grupo
        const btnGrupos = document.getElementById('export-grupos-pdf-btn');
        if (btnGrupos) {
            const newBtn = btnGrupos.cloneNode(true);
            btnGrupos.parentNode.replaceChild(newBtn, btnGrupos);
            newBtn.addEventListener('click', () => {
                newBtn.disabled = true;
                newBtn.textContent = 'Gerando...';
                this.exportGruposPDF(pautaName, dados).finally(() => {
                    newBtn.disabled = false;
                    newBtn.textContent = '📋 PDF por Grupo';
                });
            });
        }
    },

    /* ========================================================
       4. PDF POR GRUPO
       ======================================================== */

    async exportGruposPDF(pautaName, dados) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 20;
        let y = 30;

        doc.setFontSize(18);
        doc.setTextColor(22, 163, 74);
        doc.setFont("helvetica", "bold");
        doc.text("RELATÓRIO DE GRUPOS", pageWidth / 2, y, { align: "center" });
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
            if (y > 250) {
                doc.addPage();
                y = 20;
            }

            doc.setFontSize(14);
            doc.setTextColor(0, 102, 204);
            doc.text(equipe.nome, margin, y);
            y += 8;
            
            doc.setFontSize(12);
            doc.setTextColor(22, 163, 74);
            doc.text(`Total: ${equipe.total}`, margin + 5, y);
            y += 8;
            
            doc.setFontSize(10);
            doc.text("Membros:", margin + 5, y);
            y += 6;
            
            doc.setFontSize(9);
            equipe.membros.forEach(m => {
                if (y > 270) {
                    doc.addPage();
                    y = 20;
                }
                doc.text(`• ${m.nome}`, margin + 10, y);
                y += 5;
            });
            
            y += 10;
        });

        doc.save(`grupos_${pautaName.replace(/\s+/g, '_')}.pdf`);
    },

    /* ========================================================
       5. PDF POR EQUIPE
       ======================================================== */

    async exportEquipesPDF(pautaName, dados) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
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
            if (y > 250) {
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
            doc.setFont("helvetica", "bold");
            doc.text("Membros:", margin + 5, y);
            y += 6;
            
            doc.setFont("helvetica", "normal");
            doc.setFontSize(9);
            
            equipe.membros.forEach(m => {
                if (y > 270) {
                    doc.addPage();
                    y = 20;
                }
                doc.text(`• ${m.nome} (${m.cargo})`, margin + 10, y);
                y += 5;
            });
            
            y += 10;
        });

        doc.save(`equipes_${pautaName.replace(/\s+/g, '_')}.pdf`);
    },

    /* ========================================================
       6. PDF RESUMO
       ======================================================== */

    async exportStatisticsToPDF(pautaName, dados) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const margin = 20;
        let y = 30;

        doc.setFontSize(18);
        doc.setTextColor(22, 163, 74);
        doc.setFont("helvetica", "bold");
        doc.text("RELATÓRIO ESTATÍSTICO", doc.internal.pageSize.getWidth() / 2, y, { align: "center" });
        y += 10;
        
        doc.setFontSize(10);
        doc.setTextColor(80);
        doc.text(`Pauta: ${pautaName}`, margin, y);
        y += 6;
        doc.text(`Gerado: ${new Date().toLocaleString('pt-BR')}`, margin, y);
        y += 6;
        doc.text(`Atendidos: ${dados.atendidosCount}`, margin, y);
        y += 6;
        doc.text(`Faltosos: ${dados.faltososCount}`, margin, y);
        y += 6;
        doc.text(`Tempo Médio: ${dados.avgTime} min`, margin, y);
        y += 15;

        doc.save(`resumo_${pautaName.replace(/\s+/g, '_')}.pdf`);
    }
};

// ========================================================
// EXPORTAÇÕES
// ========================================================

export default StatisticsService;
export { StatisticsService };
window.StatisticsService = StatisticsService;

console.log("✅ estatisticas.js carregado com sucesso!");