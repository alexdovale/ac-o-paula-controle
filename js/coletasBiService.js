// js/coletasBiService.js - Serviço de BI e Relatórios Avançado para Coletas
import { showNotification, escapeHTML } from './utils.js';

export const ColetasBiService = {
    async abrirResultados(db, coletaId) {
        const container = document.getElementById('container-construtor-coleta');
        if (!container) return;

        container.classList.remove('hidden');
        container.innerHTML = `
            <div class="p-12 text-center animate-pulse space-y-3">
                <div class="w-10 h-10 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mx-auto"></div>
                <p class="text-emerald-700 font-bold">Processando motor analítico de BI...</p>
            </div>
        `;

        try {
            const { doc, getDoc, collection, getDocs, query, where } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
            
            const coletaSnap = await getDoc(doc(db, "formularios_coleta", coletaId));
            if (!coletaSnap.exists()) {
                container.innerHTML = `<p class="text-red-500 font-bold p-6">Coleta não encontrada.</p>`;
                return;
            }
            const coletaData = coletaSnap.data();
            const dicionario = coletaData.dicionarioDeCampos || [];

            const q = query(collection(db, "respostas_coleta"), where("coletaId", "==", coletaId));
            const respostasSnap = await getDocs(q);

            const respostas = [];
            respostasSnap.forEach(rDoc => respostas.push({ id: rDoc.id, ...rDoc.data() }));

            const orgaosUnicos = [...new Set(respostas.map(r => r.orgaoOrigem || 'Desconhecido'))];

            window._dadosBiCache = { coletaData, dicionario, respostas, orgaosUnicos, coletaId };
            this.renderizarPainelBiCompleto('todos', 'todos');

        } catch (err) {
            console.error(err);
            container.innerHTML = `<p class="text-red-500 font-bold p-6">Erro ao gerar painel de resultados.</p>`;
        }
    },

    renderizarPainelBiCompleto(orgaoFiltro = 'todos', periodoFiltro = 'todos') {
        const { coletaData, dicionario, respostas, orgaosUnicos } = window._dadosBiCache || {};
        const container = document.getElementById('container-construtor-coleta');
        if (!container) return;

        // 1. FILTROS ROBUSTOS
        let respostasFiltradas = respostas.filter(r => {
            const matchOrgao = (orgaoFiltro === 'todos' || (r.orgaoOrigem === orgaoFiltro));
            return matchOrgao;
        });

        let html = `
            <div class="space-y-6 animate-fade-in bg-slate-50 p-4 sm:p-6 rounded-3xl border border-slate-200">
                
                <!-- BARRA DE FERRAMENTAS ROBUSTA -->
                <div class="bg-white p-6 rounded-2xl border shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label class="text-[10px] font-bold text-slate-400 uppercase mb-1 block">🏢 Filtrar por Órgão:</label>
                        <select id="filtro-orgao-bi" onchange="ColetasBiService.renderizarPainelBiCompleto(this.value, document.getElementById('filtro-periodo-bi').value)" class="w-full p-3 border rounded-xl font-bold text-sm bg-white outline-none">
                            <option value="todos">Todos os Órgãos (${respostas.length} envios)</option>
                            ${orgaosUnicos.map(o => `<option value="${o}" ${orgaoFiltro === o ? 'selected' : ''}>${o}</option>`).join('')}
                        </select>
                    </div>
                    
                    <div>
                        <label class="text-[10px] font-bold text-slate-400 uppercase mb-1 block">📅 Período:</label>
                        <select id="filtro-periodo-bi" onchange="ColetasBiService.renderizarPainelBiCompleto(document.getElementById('filtro-orgao-bi').value, this.value)" class="w-full p-3 border rounded-xl font-bold text-sm bg-white outline-none">
                            <option value="todos">Todos os períodos</option>
                            <option value="hoje">Hoje</option>
                            <option value="semana">Última semana</option>
                            <option value="mes">Último mês</option>
                        </select>
                    </div>
                    
                    <div class="flex gap-2">
                        <button onclick="ColetasBiService.abrirModalExportacao()" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold p-3 rounded-xl shadow-lg transition text-sm">
                            ⚙️ Exportar Relatório
                        </button>
                        <button onclick="window.print()" class="bg-slate-800 hover:bg-slate-900 text-white font-bold p-3 rounded-xl transition text-sm">
                            🖨️
                        </button>
                    </div>
                </div>

                <!-- INDICADORES GERAIS -->
                <div class="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                        <p class="text-[10px] uppercase font-black text-slate-400">Total de Envios</p>
                        <p class="text-3xl font-black text-indigo-600">${respostasFiltradas.length}</p>
                    </div>
                    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                        <p class="text-[10px] uppercase font-black text-slate-400">Órgãos Participantes</p>
                        <p class="text-3xl font-black text-emerald-600">${new Set(respostasFiltradas.map(r => r.orgaoOrigem)).size}</p>
                    </div>
                    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                        <p class="text-[10px] uppercase font-black text-slate-400">Último Envio</p>
                        <p class="text-sm font-black text-slate-700">${respostasFiltradas.length > 0 ? new Date(respostasFiltradas[0].timestamp).toLocaleDateString('pt-BR') : '--'}</p>
                    </div>
                    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                        <p class="text-[10px] uppercase font-black text-slate-400">Média por Órgão</p>
                        <p class="text-3xl font-black text-amber-600">${respostasFiltradas.length > 0 && orgaosUnicos.length > 0 ? (respostasFiltradas.length / orgaosUnicos.length).toFixed(1) : '0'}</p>
                    </div>
                </div>
        `;

        if (respostasFiltradas.length === 0) {
            html += `
                <div class="bg-white p-12 text-center rounded-2xl border shadow-sm">
                    <p class="text-slate-400 font-bold">Nenhum dado encontrado para o filtro selecionado.</p>
                </div>
            </div>`;
            container.innerHTML = html;
            return;
        }

        // 1. CARDS DE KPIS CLICÁVEIS PARA CAMPOS NUMÉRICOS
        const camposNumericos = dicionario.filter(c => c.tipo === 'numero');
        if (camposNumericos.length > 0) {
            html += `
                <div>
                    <h4 class="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">📈 Cards de Métricas (Clique para detalhar por órgão)</h4>
                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            `;
            camposNumericos.forEach(campo => {
                let somaTotal = 0;
                respostasFiltradas.forEach(r => {
                    if (r.dados && r.dados[campo.id]) {
                        somaTotal += Number(r.dados[campo.id].resposta) || 0;
                    }
                });

                html += `
                    <div onclick="ColetasBiService.detalharPorOrgao('${campo.id}')" class="bg-white p-5 rounded-2xl border border-indigo-100 shadow-sm cursor-pointer hover:border-indigo-500 hover:shadow-md transition-all relative overflow-hidden group">
                        <div class="absolute top-0 left-0 w-1.5 h-full bg-indigo-500"></div>
                        <p class="text-[11px] font-bold text-slate-500 uppercase tracking-wider group-hover:text-indigo-600 transition">${escapeHTML(campo.label)}</p>
                        <p class="text-3xl font-black text-indigo-600 mt-3">${somaTotal.toLocaleString('pt-BR')}</p>
                        <span class="text-[10px] text-slate-400 mt-1 font-medium flex items-center gap-1">
                            📊 ${respostasFiltradas.length} submissões
                            <span class="text-indigo-400 text-[8px] ml-auto">Clique para detalhar</span>
                        </span>
                    </div>
                `;
            });
            html += `</div></div>`;
        }

        // DIV ONDE APARECEM OS DETALHES CLICADOS
        html += `
            <div id="bi-detalhes-dinamicos" class="hidden bg-white p-6 rounded-2xl border shadow-sm"></div>
        `;

        // 2. AGRUPAMENTO INTELIGENTE PARA OPÇÕES / MÚLTIPLA ESCOLHA
        const camposSelecao = dicionario.filter(c => c.tipo === 'selecao' || c.tipo === 'multipla_escolha' || c.tipo === 'booleano');
        if (camposSelecao.length > 0) {
            html += `
                <div>
                    <h4 class="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">🧩 Distribuição de Respostas</h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            `;
            
            camposSelecao.forEach(campo => {
                const contagemOpcoes = {};
                respostasFiltradas.forEach(r => {
                    if (r.dados && r.dados[campo.id]) {
                        const val = r.dados[campo.id].resposta;
                        if (val && val !== '--') {
                            contagemOpcoes[val] = (contagemOpcoes[val] || 0) + 1;
                        }
                    }
                });

                const totalRespostasCampo = Object.values(contagemOpcoes).reduce((a, b) => a + b, 0);

                html += `
                    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                        <p class="text-xs font-black text-slate-800 uppercase border-b pb-2 mb-3">${escapeHTML(campo.label)}</p>
                        <div class="space-y-2 max-h-44 overflow-y-auto pr-1">
                `;

                if (Object.keys(contagemOpcoes).length === 0) {
                    html += `<p class="text-xs text-slate-400 italic">Nenhuma resposta registrada ainda.</p>`;
                } else {
                    for (const [opcao, qtd] of Object.entries(contagemOpcoes)) {
                        const percentual = totalRespostasCampo > 0 ? ((qtd / totalRespostasCampo) * 100).toFixed(1) : 0;
                        html += `
                            <div>
                                <div class="flex justify-between text-xs font-bold text-slate-700 mb-1">
                                    <span>${escapeHTML(opcao)}</span>
                                    <span class="text-indigo-600">${qtd} (${percentual}%)</span>
                                </div>
                                <div class="w-full bg-slate-100 rounded-full h-2">
                                    <div class="bg-indigo-500 h-2 rounded-full" style="width: ${percentual}%"></div>
                                </div>
                            </div>
                        `;
                    }
                }

                html += `</div></div>`;
            });
            html += `</div></div>`;
        }

        // 3. TABELA CONSOLIDADA POR ÓRGÃO
        html += `
            <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <div class="p-4 bg-slate-50 border-b border-slate-200 font-black text-slate-700 text-sm uppercase flex justify-between items-center">
                    <span>📊 Tabela Consolidada por Órgão</span>
                    <span class="text-xs text-slate-500 font-medium">${respostasFiltradas.length} envios • ${orgaosUnicos.filter(o => orgaoFiltro === 'todos' || o === orgaoFiltro).length} órgãos</span>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse text-sm">
                        <thead class="bg-slate-100 text-slate-600 text-xs uppercase border-b border-slate-200">
                            <tr>
                                <th class="p-3.5">Órgão / Origem</th>
                                <th class="p-3.5 text-center">Total Envios</th>
        `;
        
        camposNumericos.forEach(c => {
            html += `<th class="p-3.5 text-right">${escapeHTML(c.label)}</th>`;
        });

        html += `</tr></thead><tbody class="divide-y divide-slate-100">`;

        const orgaosParaMostrar = orgaoFiltro === 'todos' ? orgaosUnicos : [orgaoFiltro];
        orgaosParaMostrar.forEach(orgao => {
            const enviosDoOrgao = respostas.filter(r => (r.orgaoOrigem || 'Desconhecido') === orgao);
            if (enviosDoOrgao.length === 0) return;

            html += `
                <tr class="hover:bg-slate-50/80 transition">
                    <td class="p-3.5 font-bold text-slate-800">${escapeHTML(orgao)}</td>
                    <td class="p-3.5 text-center font-bold text-indigo-600">${enviosDoOrgao.length}</td>
            `;

            camposNumericos.forEach(c => {
                let somaOrgao = 0;
                enviosDoOrgao.forEach(r => {
                    if (r.dados && r.dados[c.id]) somaOrgao += Number(r.dados[c.id].resposta) || 0;
                });
                html += `<td class="p-3.5 text-right font-semibold text-slate-700">${somaOrgao.toLocaleString('pt-BR')}</td>`;
            });

            html += `</tr>`;
        });

        html += `</tbody></table></div></div>`;

        // 4. HISTÓRICO DETALHADO DE RESPOSTAS
        html += `
            <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <div class="p-4 bg-slate-50 border-b border-slate-200 font-black text-slate-700 text-sm uppercase flex justify-between items-center">
                    <span>📋 Histórico Detalhado de Respostas</span>
                    <span class="text-xs text-slate-500 font-medium">${respostasFiltradas.length} registros</span>
                </div>
                <div class="overflow-x-auto max-h-96">
                    <table class="w-full text-left border-collapse text-sm">
                        <thead class="bg-slate-100 text-slate-600 text-xs uppercase border-b border-slate-200 sticky top-0">
                            <tr>
                                <th class="p-3.5">Data / Hora</th>
                                <th class="p-3.5">Órgão</th>
                                <th class="p-3.5">Responsável</th>
        `;
        
        dicionario.forEach(c => {
            html += `<th class="p-3.5">${escapeHTML(c.label)}</th>`;
        });

        html += `</tr></thead><tbody class="divide-y divide-slate-100">`;

        respostasFiltradas.slice(0, 50).forEach(r => {
            const dataFormatada = r.timestamp ? new Date(r.timestamp).toLocaleString('pt-BR') : '--';
            html += `
                <tr class="hover:bg-slate-50/80 transition">
                    <td class="p-3.5 text-xs text-slate-500 font-medium whitespace-nowrap">${dataFormatada}</td>
                    <td class="p-3.5 font-bold text-slate-800">${escapeHTML(r.orgaoOrigem || 'Desconhecido')}</td>
                    <td class="p-3.5 text-slate-600">${escapeHTML(r.responsavel || '--')}</td>
            `;

            dicionario.forEach(c => {
                const respostaItem = r.dados && r.dados[c.id] ? r.dados[c.id].resposta : '--';
                html += `<td class="p-3.5 font-semibold text-slate-700">${escapeHTML(String(respostaItem))}</td>`;
            });

            html += `</tr>`;
        });

        if (respostasFiltradas.length > 50) {
            html += `<tr><td colspan="${dicionario.length + 3}" class="p-3.5 text-center text-xs text-slate-400 italic">Exibindo os 50 registros mais recentes</td></tr>`;
        }

        html += `</tbody></table></div></div></div>`;
        container.innerHTML = html;
        container.scrollIntoView({ behavior: 'smooth' });
    },

    // Detalhar ao clicar no Card
    detalharPorOrgao(campoId) {
        const { respostas, dicionario } = window._dadosBiCache || {};
        if (!respostas) return;
        
        const campo = dicionario.find(c => c.id === campoId);
        if (!campo) return;
        
        const div = document.getElementById('bi-detalhes-dinamicos');
        if (!div) return;
        
        const agrupado = respostas.reduce((acc, r) => {
            const org = r.orgaoOrigem || 'Desconhecido';
            const valor = Number(r.dados?.[campoId]?.resposta) || 0;
            acc[org] = (acc[org] || 0) + valor;
            return acc;
        }, {});

        // Ordenar por valor decrescente
        const sorted = Object.entries(agrupado).sort((a, b) => b[1] - a[1]);
        const total = sorted.reduce((sum, [, val]) => sum + val, 0);

        div.classList.remove('hidden');
        div.innerHTML = `
            <div class="flex justify-between items-center mb-4">
                <h4 class="font-black text-lg text-slate-800">📊 Detalhamento: ${escapeHTML(campo.label)}</h4>
                <button onclick="document.getElementById('bi-detalhes-dinamicos').classList.add('hidden')" class="text-red-500 font-bold text-xs bg-red-50 px-3 py-1.5 rounded-lg hover:bg-red-100 transition">
                    ✕ Fechar
                </button>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                ${sorted.map(([org, val]) => `
                    <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <p class="text-[10px] uppercase font-bold text-slate-400">${escapeHTML(org)}</p>
                        <p class="text-xl font-black text-indigo-600">${val.toLocaleString('pt-BR')}</p>
                        <span class="text-[9px] text-slate-400">${total > 0 ? ((val / total) * 100).toFixed(1) : 0}% do total</span>
                    </div>
                `).join('')}
            </div>
            <div class="mt-4 pt-4 border-t border-slate-200 flex justify-between text-xs text-slate-500">
                <span>Total geral: <strong class="text-slate-800">${total.toLocaleString('pt-BR')}</strong></span>
                <span>${sorted.length} órgãos participantes</span>
            </div>
        `;
        
        div.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },

    // ============================================================
    // ABRIR MODAL DE EXPORTAÇÃO CUSTOMIZADA
    // ============================================================
    abrirModalExportacao() {
        // Verifica se o modal já existe
        let modal = document.getElementById('modal-config-pdf');
        if (modal) {
            modal.classList.remove('hidden');
            return;
        }

        // Cria o modal
        modal = document.createElement('div');
        modal.id = 'modal-config-pdf';
        modal.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-fade-in';
        modal.innerHTML = `
            <div class="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl border border-slate-200">
                <div class="flex justify-between items-center mb-6">
                    <h3 class="text-xl font-black text-slate-800">⚙️ Configurar Exportação PDF</h3>
                    <button onclick="ColetasBiService.fecharModalExportacao()" class="text-slate-400 hover:text-slate-600 text-2xl transition">×</button>
                </div>
                
                <div class="space-y-4">
                    <div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <p class="text-xs font-bold text-slate-400 uppercase mb-3">Selecione as seções do relatório:</p>
                        
                        <label class="flex items-center gap-3 p-2 hover:bg-white rounded-lg transition cursor-pointer">
                            <input type="checkbox" id="pdf-incluir-kpis" checked class="h-5 w-5 text-emerald-600 rounded">
                            <span class="text-sm font-medium">📈 Cards de Métricas (KPIs)</span>
                        </label>
                        
                        <label class="flex items-center gap-3 p-2 hover:bg-white rounded-lg transition cursor-pointer">
                            <input type="checkbox" id="pdf-incluir-distribuicao" checked class="h-5 w-5 text-emerald-600 rounded">
                            <span class="text-sm font-medium">🧩 Distribuição de Respostas</span>
                        </label>
                        
                        <label class="flex items-center gap-3 p-2 hover:bg-white rounded-lg transition cursor-pointer">
                            <input type="checkbox" id="pdf-incluir-tabela-orgao" checked class="h-5 w-5 text-emerald-600 rounded">
                            <span class="text-sm font-medium">📊 Tabela Consolidada por Órgão</span>
                        </label>
                        
                        <label class="flex items-center gap-3 p-2 hover:bg-white rounded-lg transition cursor-pointer">
                            <input type="checkbox" id="pdf-incluir-historico" checked class="h-5 w-5 text-emerald-600 rounded">
                            <span class="text-sm font-medium">📋 Histórico Detalhado</span>
                        </label>
                    </div>
                    
                    <div class="bg-amber-50 p-4 rounded-xl border border-amber-200">
                        <p class="text-xs text-amber-700 font-medium">💡 O PDF será gerado apenas com as seções selecionadas acima, na ordem em que aparecem.</p>
                        <p class="text-[10px] text-amber-600 mt-1">📌 Tabelas com muitas colunas usarão fonte reduzida para caber na página.</p>
                    </div>
                    
                    <div class="grid grid-cols-2 gap-3 pt-4">
                        <button onclick="ColetasBiService.fecharModalExportacao()" class="p-3 border border-slate-300 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition">
                            Cancelar
                        </button>
                        <button onclick="ColetasBiService.executarExportacaoCustomizada()" class="p-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition shadow-lg">
                            📄 Gerar PDF
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },

    fecharModalExportacao() {
        const modal = document.getElementById('modal-config-pdf');
        if (modal) modal.classList.add('hidden');
    },

    // ============================================================
    // EXPORTAÇÃO CUSTOMIZADA - VERSÃO OTIMIZADA COM TABELAS
    // ============================================================
    async executarExportacaoCustomizada() {
        const { coletaData, respostas, dicionario } = window._dadosBiCache || {};
        if (!respostas || respostas.length === 0) {
            showNotification("Sem dados para exportar.", "error");
            return;
        }

        // Lê as configurações do modal
        const incluirKpis = document.getElementById('pdf-incluir-kpis')?.checked !== false;
        const incluirDistribuicao = document.getElementById('pdf-incluir-distribuicao')?.checked !== false;
        const incluirTabelaOrg = document.getElementById('pdf-incluir-tabela-orgao')?.checked !== false;
        const incluirHist = document.getElementById('pdf-incluir-historico')?.checked !== false;

        // Fecha o modal
        this.fecharModalExportacao();

        // Verifica se pelo menos uma seção foi selecionada
        if (!incluirKpis && !incluirDistribuicao && !incluirTabelaOrg && !incluirHist) {
            showNotification("Selecione pelo menos uma seção para exportar.", "warning");
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape'); // Paisagem para caber mais colunas
        
        // ===== CABEÇALHO DO RELATÓRIO =====
        doc.setFont("helvetica", "bold");
        doc.setFontSize(18);
        doc.text(`RELATÓRIO ANALÍTICO - ${coletaData.nomeDaColeta.toUpperCase()}`, 14, 18);
        
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text(`Data de Emissão: ${new Date().toLocaleString('pt-BR')}`, 14, 25);
        doc.text(`Total de Registros: ${respostas.length} | Órgãos: ${new Set(respostas.map(r => r.orgaoOrigem)).size}`, 14, 32);

        let yPos = 40;
        const margemEsquerda = 14;

        // ============================================================
        // SEÇÃO 1: KPIs (Resumo de Indicadores)
        // ============================================================
        if (incluirKpis) {
            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            doc.text("📈 RESUMO DE INDICADORES ACUMULADOS", margemEsquerda, yPos);
            yPos += 7;

            const camposNumericos = dicionario.filter(c => c.tipo === 'numero');
            
            if (camposNumericos.length > 0) {
                const dataKpi = camposNumericos.map(c => {
                    const soma = respostas.reduce((acc, r) => acc + (Number(r.dados?.[c.id]?.resposta) || 0), 0);
                    return [c.label, soma.toLocaleString('pt-BR')];
                });

                doc.autoTable({
                    startY: yPos,
                    head: [['📊 Métrica', 'Total Acumulado']],
                    body: dataKpi,
                    styles: { fontSize: 10, cellPadding: 3 },
                    headStyles: { 
                        fillColor: [79, 70, 229], // Indigo
                        textColor: [255, 255, 255],
                        fontStyle: 'bold'
                    },
                    columnStyles: {
                        0: { cellWidth: 100 },
                        1: { cellWidth: 80, halign: 'right', fontStyle: 'bold' }
                    }
                });
                yPos = doc.lastAutoTable.finalY + 15;
            } else {
                doc.setFont("helvetica", "italic");
                doc.setFontSize(9);
                doc.text("Nenhum campo numérico encontrado para exibir KPIs.", margemEsquerda, yPos + 5);
                yPos += 15;
            }
        }

        // ============================================================
        // SEÇÃO 2: DISTRIBUIÇÃO DE RESPOSTAS
        // ============================================================
        if (incluirDistribuicao) {
            const camposSelecao = dicionario.filter(c => c.tipo === 'selecao' || c.tipo === 'multipla_escolha' || c.tipo === 'booleano');
            
            if (camposSelecao.length > 0) {
                // Verifica se precisa de nova página
                if (yPos > 170) {
                    doc.addPage();
                    yPos = 20;
                }

                doc.setFont("helvetica", "bold");
                doc.setFontSize(14);
                doc.text("🧩 DISTRIBUIÇÃO DE RESPOSTAS", margemEsquerda, yPos);
                yPos += 7;

                // Organiza em grid de 2 colunas
                const colunas = 2;
                const larguraColuna = 130;
                
                camposSelecao.forEach((campo, index) => {
                    const contagemOpcoes = {};
                    respostas.forEach(r => {
                        if (r.dados && r.dados[campo.id]) {
                            const val = r.dados[campo.id].resposta;
                            if (val && val !== '--') {
                                contagemOpcoes[val] = (contagemOpcoes[val] || 0) + 1;
                            }
                        }
                    });

                    const totalRespostasCampo = Object.values(contagemOpcoes).reduce((a, b) => a + b, 0);
                    const col = index % colunas;
                    const row = Math.floor(index / colunas);
                    const xPos = margemEsquerda + (col * larguraColuna);
                    const yPosAtual = yPos + (row * 45);

                    // Verifica se cabe na página
                    if (yPosAtual > 180) {
                        doc.addPage();
                        yPos = 20;
                        const newY = yPos + 7;
                        doc.setFont("helvetica", "bold");
                        doc.setFontSize(14);
                        doc.text("🧩 DISTRIBUIÇÃO DE RESPOSTAS (continuação)", margemEsquerda, yPos);
                        this._desenharDistribuicaoNoPDF(doc, campo, contagemOpcoes, totalRespostasCampo, margemEsquerda + (col * larguraColuna), newY + 7);
                    } else {
                        this._desenharDistribuicaoNoPDF(doc, campo, contagemOpcoes, totalRespostasCampo, xPos, yPosAtual);
                    }
                });

                const totalRows = Math.ceil(camposSelecao.length / colunas);
                yPos += (totalRows * 45) + 10;
            }
        }

        // ============================================================
        // SEÇÃO 3: TABELA CONSOLIDADA POR ÓRGÃO
        // ============================================================
        if (incluirTabelaOrg) {
            // Verifica se precisa de nova página
            if (yPos > 170) {
                doc.addPage();
                yPos = 20;
            }

            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            doc.text("📊 TABELA CONSOLIDADA POR ÓRGÃO", margemEsquerda, yPos);
            yPos += 7;

            const orgaos = [...new Set(respostas.map(r => r.orgaoOrigem || 'Desconhecido'))];
            const camposNumericos = dicionario.filter(c => c.tipo === 'numero');
            
            // Monta cabeçalho
            const head = [['🏢 Órgão', '📋 Total Envios', ...camposNumericos.map(c => c.label)]];
            
            // Monta corpo
            const body = orgaos.map(orgao => {
                const envios = respostas.filter(r => (r.orgaoOrigem || 'Desconhecido') === orgao);
                return [
                    orgao, 
                    envios.length.toString(),
                    ...camposNumericos.map(c => {
                        const soma = envios.reduce((acc, r) => acc + (Number(r.dados?.[c.id]?.resposta) || 0), 0);
                        return soma.toLocaleString('pt-BR');
                    })
                ];
            });

            // Determina tamanho da fonte baseado no número de colunas
            const totalColunas = 2 + camposNumericos.length;
            let tamanhoFonte = 9;
            if (totalColunas > 10) tamanhoFonte = 7;
            if (totalColunas > 15) tamanhoFonte = 6;
            if (totalColunas > 20) tamanhoFonte = 5;

            doc.autoTable({
                startY: yPos,
                head: head,
                body: body,
                styles: { 
                    fontSize: tamanhoFonte, 
                    cellPadding: 1.5 
                },
                headStyles: { 
                    fillColor: [16, 185, 129], // Emerald
                    textColor: [255, 255, 255],
                    fontStyle: 'bold'
                },
                columnStyles: {
                    0: { cellWidth: 40, fontStyle: 'bold' },
                    1: { cellWidth: 25, halign: 'center', fontStyle: 'bold' }
                },
                didDrawPage: function(data) {
                    // Adiciona rodapé com número da página
                    const pageCount = doc.internal.getNumberOfPages();
                    doc.setFontSize(7);
                    doc.text(`Página ${data.pageNumber} de ${pageCount}`, 14, doc.internal.pageSize.height - 10);
                }
            });
            yPos = doc.lastAutoTable.finalY + 15;
        }

        // ============================================================
        // SEÇÃO 4: HISTÓRICO DETALHADO (NOVA PÁGINA)
        // ============================================================
        if (incluirHist) {
            // Adiciona nova página para o histórico
            doc.addPage();
            
            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            doc.text("📋 HISTÓRICO DETALHADO DE RESPOSTAS", margemEsquerda, 18);
            
            doc.setFont("helvetica", "normal");
            doc.setFontSize(9);
            doc.text(`Total de ${respostas.length} registros encontrados.`, margemEsquerda, 25);

            const head = [["🕐 Data/Hora", "🏢 Órgão", "👤 Responsável", ...dicionario.map(c => c.label)]];
            
            const body = respostas.slice(0, 200).map(r => [
                r.timestamp ? new Date(r.timestamp).toLocaleString('pt-BR') : '--',
                r.orgaoOrigem || '--',
                r.responsavel || '--',
                ...dicionario.map(c => r.dados?.[c.id]?.resposta || '--')
            ]);

            // Determina tamanho da fonte baseado no número de colunas
            const totalColunasHist = 3 + dicionario.length;
            let tamanhoFonteHist = 8;
            if (totalColunasHist > 10) tamanhoFonteHist = 6;
            if (totalColunasHist > 15) tamanhoFonteHist = 5;
            if (totalColunasHist > 20) tamanhoFonteHist = 4.5;

            doc.autoTable({
                startY: 30,
                head: head,
                body: body,
                styles: { 
                    fontSize: tamanhoFonteHist, 
                    cellPadding: 1 
                },
                headStyles: { 
                    fillColor: [51, 65, 85], // Slate
                    textColor: [255, 255, 255],
                    fontStyle: 'bold'
                },
                didDrawPage: function(data) {
                    const pageCount = doc.internal.getNumberOfPages();
                    doc.setFontSize(7);
                    doc.text(`Página ${data.pageNumber} de ${pageCount}`, 14, doc.internal.pageSize.height - 10);
                }
            });

            // Adiciona observação se houver mais registros
            if (respostas.length > 200) {
                const finalY = doc.lastAutoTable.finalY + 5;
                doc.setFont("helvetica", "italic");
                doc.setFontSize(8);
                doc.text(`* Exibindo os 200 registros mais recentes de um total de ${respostas.length}.`, margemEsquerda, finalY);
            }
        }

        // ===== FINALIZA =====
        doc.save(`Relatorio_BI_${coletaData.nomeDaColeta.replace(/\s+/g, '_')}.pdf`);
        showNotification("📄 Relatório PDF gerado com sucesso!", "success");
    },

    // ============================================================
    // MÉTODO AUXILIAR: DESENHAR DISTRIBUIÇÃO NO PDF
    // ============================================================
    _desenharDistribuicaoNoPDF(doc, campo, contagemOpcoes, totalRespostasCampo, xPos, yPos) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.text(campo.label.substring(0, 28), xPos, yPos);
        
        let yAtual = yPos + 5;
        const entries = Object.entries(contagemOpcoes);
        
        if (entries.length === 0) {
            doc.setFont("helvetica", "italic");
            doc.setFontSize(7);
            doc.text("Sem respostas registradas", xPos, yAtual + 4);
            return;
        }

        const maxItems = 6;
        const itemsToShow = entries.slice(0, maxItems);
        
        itemsToShow.forEach(([opcao, qtd]) => {
            const percentual = totalRespostasCampo > 0 ? ((qtd / totalRespostasCampo) * 100).toFixed(1) : 0;
            doc.setFont("helvetica", "normal");
            doc.setFontSize(7);
            doc.text(`${opcao.substring(0, 22)}: ${qtd} (${percentual}%)`, xPos, yAtual);
            yAtual += 4;
        });

        if (entries.length > maxItems) {
            doc.setFont("helvetica", "italic");
            doc.setFontSize(6);
            doc.text(`+ ${entries.length - maxItems} outras opções...`, xPos, yAtual + 2);
        }
    }
};

window.ColetasBiService = ColetasBiService;
