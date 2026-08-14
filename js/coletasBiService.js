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
            respostasSnap.forEach(rDoc => respostas.push(rDoc.data()));

            const orgaosUnicos = [...new Set(respostas.map(r => r.orgaoOrigem || 'Desconhecido'))];

            window._dadosBiCache = { coletaData, dicionario, respostas, orgaosUnicos, coletaId };
            this.renderizarPainelBiCompleto('todos');

        } catch (err) {
            console.error(err);
            container.innerHTML = `<p class="text-red-500 font-bold p-6">Erro ao gerar painel de resultados.</p>`;
        }
    },

    renderizarPainelBiCompleto(orgaoFiltro) {
        const { coletaData, dicionario, respostas, orgaosUnicos } = window._dadosBiCache || {};
        const container = document.getElementById('container-construtor-coleta');
        if (!container) return;

        const respostasFiltradas = orgaoFiltro === 'todos' ? respostas : respostas.filter(r => (r.orgaoOrigem || 'Desconhecido') === orgaoFiltro);

        let html = `
            <div class="space-y-8 animate-fade-in bg-slate-100 p-4 sm:p-6 rounded-3xl border border-slate-200">
                
                <!-- TOPO DE CONTROLE E FILTROS -->
                <div class="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-6 rounded-2xl border shadow-sm">
                    <div>
                        <span class="text-[10px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">Painel Analítico Inteligente</span>
                        <h3 class="text-xl sm:text-2xl font-black text-slate-800 mt-2">${escapeHTML(coletaData.nomeDaColeta)}</h3>
                    </div>
                    
                    <div class="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                        <div class="flex flex-col">
                            <label class="text-[10px] font-bold text-slate-400 uppercase mb-1">Filtrar por Órgão:</label>
                            <select id="filtro-orgao-bi" onchange="ColetasBiService.renderizarPainelBiCompleto(this.value)" class="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none cursor-pointer">
                                <option value="todos">🏢 Todos os Órgãos (${respostas.length} envios totais)</option>
                                ${orgaosUnicos.map(o => `<option value="${o}" ${orgaoFiltro === o ? 'selected' : ''}>${o}</option>`).join('')}
                            </select>
                        </div>
                        
                        <div class="flex items-end h-full pt-4">
                            <button onclick="ColetasBiService.gerarPdfBi()" class="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition shadow flex items-center gap-1.5 h-[38px]">
                                📄 Exportar Relatório PDF
                            </button>
                        </div>
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

        // 1. CARDS DE KPIS PARA CAMPOS NUMÉRICOS
        const camposNumericos = dicionario.filter(c => c.tipo === 'numero');
        if (camposNumericos.length > 0) {
            html += `
                <div>
                    <h4 class="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">📈 Indicadores Numéricos Acumulados</h4>
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
                    <div class="bg-white p-5 rounded-2xl border border-indigo-100 shadow-sm flex flex-col justify-between relative overflow-hidden">
                        <div class="absolute top-0 left-0 w-1.5 h-full bg-indigo-500"></div>
                        <p class="text-[11px] font-bold text-slate-500 uppercase tracking-wider">${escapeHTML(campo.label)}</p>
                        <p class="text-3xl font-black text-indigo-600 mt-3">${somaTotal.toLocaleString('pt-BR')}</p>
                        <span class="text-[10px] text-slate-400 mt-1 font-medium">Soma de ${respostasFiltradas.length} submissões</span>
                    </div>
                `;
            });
            html += `</div></div>`;
        }

        // 2. AGRUPAMENTO INTELIGENTE PARA OPÇÕES / MÚLTIPLA ESCOLHA
        const camposSelecao = dicionario.filter(c => c.tipo === 'selecao' || c.tipo === 'multipla_escolha' || c.tipo === 'booleano');
        if (camposSelecao.length > 0) {
            html += `
                <div>
                    <h4 class="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">🧩 Distribuição de Respostas (Categorias e Escolhas)</h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            `;
            
            camposSelecao.forEach(campo => {
                // Conta a frequência de cada resposta dada pelos órgãos
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
                    <span class="text-xs text-slate-500 font-medium">Cruzamento de métricas numéricas</span>
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

        orgaosUnicos.forEach(orgao => {
            const enviosDoOrgao = respostas.filter(r => (r.orgaoOrigem || 'Desconhecido') === orgao);
            if (orgaoFiltro !== 'todos' && orgaoFiltro !== orgao) return;

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
                <div class="p-4 bg-slate-50 border-b border-slate-200 font-black text-slate-700 text-sm uppercase">
                    📋 Histórico Detalhado de Respostas Individuais (${respostasFiltradas.length} registros)
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

        respostasFiltradas.forEach(r => {
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

        html += `</tbody></table></div></div></div>`;
        container.innerHTML = html;
        container.scrollIntoView({ behavior: 'smooth' });
    },

    gerarPdfBi() {
        const { coletaData, respostas } = window._dadosBiCache || {};
        if (!respostas || respostas.length === 0) return showNotification("Sem dados para exportar.", "error");

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape');

        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.text(`Relatorio Consolidado de BI - ${coletaData.nomeDaColeta}`, 14, 15);
        
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')} | Total de Registros: ${respostas.length}`, 14, 22);

        const colunas = ["Data/Hora", "Órgão", "Responsável"];
        const dicionario = coletaData.dicionarioDeCampos || [];
        dicionario.forEach(c => colunas.push(c.label));

        const linhas = respostas.map(r => {
            const linha = [
                r.timestamp ? new Date(r.timestamp).toLocaleString('pt-BR') : '--',
                r.orgaoOrigem || '--',
                r.responsavel || '--'
            ];
            dicionario.forEach(c => {
                linha.push(r.dados && r.dados[c.id] ? r.dados[c.id].resposta : '--');
            });
            return linha;
        });

        doc.autoTable({
            head: [colunas],
            body: linhas,
            startY: 28,
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [16, 185, 129] }
        });

        doc.save(`Relatorio_BI_${coletaData.nomeDaColeta.replace(/\s+/g, '_')}.pdf`);
        showNotification("Relatório PDF gerado com sucesso!", "success");
    }
};

window.ColetasBiService = ColetasBiService;
