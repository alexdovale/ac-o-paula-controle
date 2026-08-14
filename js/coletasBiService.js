// js/coletasBiService.js - Serviço de BI e Relatórios Avançado para Coletas
import { showNotification, escapeHTML } from './utils.js';

// ============================================================
// FUNÇÃO AUXILIAR: LIMPAR CARACTERES ESPECIAIS
// ============================================================
function limparTexto(texto) {
    if (typeof texto !== 'string') return texto;
    return texto
        .normalize('NFD').replace(/[\u0300-\u036f]/g, "") // Remove acentos
        .replace(/[ºª°]/g, '') // Remove símbolos que causam erro no PDF
        .replace(/[&]/g, 'e') // Substitui & por 'e'
        .replace(/[^\x00-\x7F]/g, ""); // Remove qualquer outro caractere não-ASCII
}

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

        // ============================================================
        // 1. PROCESSAMENTO DE MÉTRICAS NUMÉRICAS E IDADES (Híbrido)
        // ============================================================
        let kpiHtml = `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">`;
        let frequenciasHtml = `<div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">`;
        let temFrequenciaNumerica = false;

        dicionario.forEach(campo => {
            const valores = respostasFiltradas
                .map(r => r.dados?.[campo.id]?.resposta)
                .filter(v => v !== undefined && v !== null && v !== '--');

            if (valores.length === 0) return;

            // Se for campo numérico ou contiver "idade" no nome
            if (campo.tipo === 'numero' || campo.label.toLowerCase().includes('idade')) {
                const numeros = valores.map(Number);
                const soma = numeros.reduce((a, b) => a + b, 0);
                const media = (soma / numeros.length).toFixed(1);
                
                // Calcula o Desvio Padrão
                const variancia = numeros.reduce((acc, n) => acc + Math.pow(n - media, 2), 0) / numeros.length;
                const desvioPadrao = Math.sqrt(variancia).toFixed(1);

                // Card Principal de Estatística (Soma, Média e Desvio Padrão)
                kpiHtml += `
                    <div onclick="ColetasBiService.detalharPorOrgao('${campo.id}')" class="bg-white p-5 rounded-2xl border border-indigo-100 shadow-sm cursor-pointer hover:border-indigo-500 hover:shadow-md transition-all relative overflow-hidden group">
                        <div class="absolute top-0 left-0 w-1.5 h-full bg-indigo-500"></div>
                        <p class="text-[10px] font-black text-slate-400 uppercase tracking-wider group-hover:text-indigo-600 transition">${escapeHTML(campo.label)}</p>
                        <div class="mt-3 grid grid-cols-3 gap-2 text-center">
                            <div class="bg-indigo-50 p-2 rounded-xl">
                                <p class="text-xl font-black text-indigo-600">${soma.toLocaleString('pt-BR')}</p>
                                <p class="text-[8px] font-bold text-indigo-400 uppercase">Soma</p>
                            </div>
                            <div class="bg-emerald-50 p-2 rounded-xl">
                                <p class="text-xl font-black text-emerald-600">${media}</p>
                                <p class="text-[8px] font-bold text-emerald-400 uppercase">Média</p>
                            </div>
                            <div class="bg-amber-50 p-2 rounded-xl">
                                <p class="text-xl font-black text-amber-600">${desvioPadrao}</p>
                                <p class="text-[8px] font-bold text-amber-400 uppercase">Desvio P.</p>
                            </div>
                        </div>
                        <span class="text-[10px] text-slate-400 mt-2 font-medium flex items-center gap-1">
                            📊 ${respostasFiltradas.length} submissões
                            <span class="text-indigo-400 text-[8px] ml-auto">Clique para detalhar</span>
                        </span>
                    </div>
                `;

                // Tratamento Híbrido: Frequência (quantas vezes cada número foi escolhido)
                const contagemNumerica = {};
                numeros.forEach(num => {
                    contagemNumerica[num] = (contagemNumerica[num] || 0) + 1;
                });

                const chavesOrdenadas = Object.keys(contagemNumerica).sort((a, b) => Number(a) - Number(b));

                if (chavesOrdenadas.length > 0) {
                    temFrequenciaNumerica = true;
                    frequenciasHtml += `
                        <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                            <p class="text-xs font-black text-slate-800 uppercase border-b pb-2 mb-3">📊 Frequência por ${escapeHTML(campo.label)}</p>
                            <div class="space-y-2 max-h-44 overflow-y-auto pr-1">
                    `;
                    chavesOrdenadas.forEach(num => {
                        const qtd = contagemNumerica[num];
                        const percent = ((qtd / numeros.length) * 100).toFixed(0);
                        frequenciasHtml += `
                            <div>
                                <div class="flex justify-between text-xs font-bold text-slate-700 mb-1">
                                    <span>Valor ${num}:</span>
                                    <span class="text-indigo-600">${qtd} vez(es) (${percent}%)</span>
                                </div>
                                <div class="w-full bg-slate-100 rounded-full h-2">
                                    <div class="bg-indigo-500 h-2 rounded-full" style="width: ${percent}%"></div>
                                </div>
                            </div>
                        `;
                    });
                    frequenciasHtml += `</div></div>`;
                }
            }
        });

        html += kpiHtml + `</div>`;

        // ============================================================
        // 2. PROCESSAMENTO DE ALTERNATIVAS (Seleção / Booleano / Múltipla Escolha)
        // ============================================================
        const camposSelecao = dicionario.filter(c => ['selecao', 'multipla_escolha', 'booleano'].includes(c.tipo));
        
        if (camposSelecao.length > 0 || temFrequenciaNumerica) {
            if (!temFrequenciaNumerica) html += `<div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">`;
            
            camposSelecao.forEach(campo => {
                const contagem = {};
                respostasFiltradas.forEach(r => {
                    const val = r.dados?.[campo.id]?.resposta;
                    if (val && val !== '--') contagem[val] = (contagem[val] || 0) + 1;
                });

                html += `
                    <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <p class="text-xs font-black text-slate-800 uppercase border-b pb-2 mb-3">🧩 ${escapeHTML(campo.label)}</p>
                        <div class="space-y-3 max-h-44 overflow-y-auto pr-1">
                            ${Object.keys(contagem).length === 0 ? '<p class="text-xs text-slate-400 italic">Nenhuma resposta.</p>' : 
                                Object.entries(contagem).map(([key, count]) => {
                                    const percent = ((count / respostasFiltradas.length) * 100).toFixed(0);
                                    return `
                                        <div>
                                            <div class="flex justify-between text-xs mb-1">
                                                <span class="font-bold text-slate-600">${escapeHTML(key)}</span>
                                                <span class="font-black text-slate-800">${count} (${percent}%)</span>
                                            </div>
                                            <div class="w-full bg-slate-100 rounded-full h-2">
                                                <div class="bg-emerald-500 h-2 rounded-full" style="width: ${percent}%"></div>
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                        </div>
                    </div>
                `;
            });

            if (temFrequenciaNumerica) html += frequenciasHtml;
            html += `</div>`;
        }

        // DIV ONDE APARECEM OS DETALHES CLICADOS
        html += `
            <div id="bi-detalhes-dinamicos" class="hidden bg-white p-6 rounded-2xl border shadow-sm"></div>
        `;

        // 3. TABELA CONSOLIDADA POR ÓRGÃO
        const camposNumericos = dicionario.filter(c => c.tipo === 'numero' || c.label.toLowerCase().includes('idade'));
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
        let modal = document.getElementById('modal-config-pdf');
        if (modal) {
            modal.classList.remove('hidden');
            return;
        }

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
                            <span class="text-sm font-medium">📈 Estatísticas e KPIs</span>
                        </label>
                        
                        <label class="flex items-center gap-3 p-2 hover:bg-white rounded-lg transition cursor-pointer">
                            <input type="checkbox" id="pdf-incluir-distribuicao" checked class="h-5 w-5 text-emerald-600 rounded">
                            <span class="text-sm font-medium">🧩 Frequência de Respostas</span>
                        </label>
                        
                        <label class="flex items-center gap-3 p-2 hover:bg-white rounded-lg transition cursor-pointer">
                            <input type="checkbox" id="pdf-incluir-tabela-orgao" checked class="h-5 w-5 text-emerald-600 rounded">
                            <span class="text-sm font-medium">📊 Tabela por Órgão</span>
                        </label>
                        
                        <label class="flex items-center gap-3 p-2 hover:bg-white rounded-lg transition cursor-pointer">
                            <input type="checkbox" id="pdf-incluir-historico" checked class="h-5 w-5 text-emerald-600 rounded">
                            <span class="text-sm font-medium">📋 Histórico Detalhado</span>
                        </label>
                    </div>
                    
                    <div class="bg-amber-50 p-4 rounded-xl border border-amber-200">
                        <p class="text-xs text-amber-700 font-medium">💡 O PDF será gerado com estatísticas avançadas (Soma, Média, Desvio Padrão e Frequência).</p>
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
    // EXPORTAÇÃO CUSTOMIZADA - COM ESTATÍSTICAS AVANÇADAS
    // ============================================================
    async executarExportacaoCustomizada() {
        const { coletaData, respostas, dicionario } = window._dadosBiCache || {};
        if (!respostas || respostas.length === 0) {
            showNotification("Sem dados para exportar.", "error");
            return;
        }

        const incluirKpis = document.getElementById('pdf-incluir-kpis')?.checked !== false;
        const incluirDistribuicao = document.getElementById('pdf-incluir-distribuicao')?.checked !== false;
        const incluirTabelaOrg = document.getElementById('pdf-incluir-tabela-orgao')?.checked !== false;
        const incluirHist = document.getElementById('pdf-incluir-historico')?.checked !== false;

        this.fecharModalExportacao();

        if (!incluirKpis && !incluirDistribuicao && !incluirTabelaOrg && !incluirHist) {
            showNotification("Selecione pelo menos uma seção para exportar.", "warning");
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape');
        
        // ===== CABEÇALHO =====
        doc.setFont("helvetica", "bold");
        doc.setFontSize(18);
        doc.text(limparTexto(`RELATÓRIO ANALÍTICO - ${coletaData.nomeDaColeta.toUpperCase()}`), 14, 18);
        
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text(`Data de Emissão: ${new Date().toLocaleString('pt-BR')}`, 14, 25);
        doc.text(`Total de Registros: ${respostas.length} | Órgãos: ${new Set(respostas.map(r => r.orgaoOrigem)).size}`, 14, 32);

        let yPos = 40;
        const margemEsquerda = 14;

        // ============================================================
        // SEÇÃO 1: ESTATÍSTICAS E INDICADORES NUMÉRICOS
        // ============================================================
        if (incluirKpis) {
            if (yPos > 170) { doc.addPage(); yPos = 20; }

            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            doc.text("1. ESTATÍSTICAS E INDICADORES NUMÉRICOS", margemEsquerda, yPos);
            yPos += 7;

            const camposNumericos = dicionario.filter(c => c.tipo === 'numero' || c.label.toLowerCase().includes('idade'));
            
            if (camposNumericos.length > 0) {
                const dataKpi = camposNumericos.map(c => {
                    const numeros = respostas
                        .map(r => Number(r.dados?.[c.id]?.resposta))
                        .filter(n => !isNaN(n) && n !== 0);
                    
                    if (numeros.length === 0) return [limparTexto(c.label), "0", "0", "0"];
                    
                    const soma = numeros.reduce((a, b) => a + b, 0);
                    const media = (soma / numeros.length).toFixed(1);
                    const variancia = numeros.reduce((acc, n) => acc + Math.pow(n - media, 2), 0) / numeros.length;
                    const desvio = Math.sqrt(variancia).toFixed(1);

                    return [
                        limparTexto(c.label),
                        soma.toLocaleString('pt-BR'),
                        media,
                        desvio
                    ];
                });

                doc.autoTable({
                    startY: yPos,
                    head: [['Métrica / Campo', 'Soma Total', 'Média', 'Desvio Padrão']],
                    body: dataKpi,
                    styles: { fontSize: 9, cellPadding: 2.5 },
                    headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255] },
                    columnStyles: {
                        0: { cellWidth: 80 },
                        1: { cellWidth: 50, halign: 'right' },
                        2: { cellWidth: 40, halign: 'center' },
                        3: { cellWidth: 40, halign: 'center' }
                    }
                });
                yPos = doc.lastAutoTable.finalY + 12;
            } else {
                doc.setFont("helvetica", "italic");
                doc.setFontSize(9);
                doc.text("Nenhum campo numérico encontrado para exibir estatísticas.", margemEsquerda, yPos + 5);
                yPos += 15;
            }
        }

        // ============================================================
        // SEÇÃO 2: FREQUÊNCIA DE RESPOSTAS
        // ============================================================
        if (incluirDistribuicao) {
            if (yPos > 170) { doc.addPage(); yPos = 20; }

            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            doc.text("2. FREQUÊNCIA DE RESPOSTAS E ALTERNATIVAS", margemEsquerda, yPos);
            yPos += 7;

            const camposParaFrequencia = dicionario.filter(c => 
                ['selecao', 'multipla_escolha', 'booleano'].includes(c.tipo) || 
                c.tipo === 'numero' || 
                c.label.toLowerCase().includes('idade')
            );

            let dadosFrequencia = [];
            
            camposParaFrequencia.forEach(campo => {
                const contagem = {};
                respostas.forEach(r => {
                    const val = r.dados?.[campo.id]?.resposta;
                    if (val !== undefined && val !== null && val !== '' && val !== '--') {
                        contagem[val] = (contagem[val] || 0) + 1;
                    }
                });

                Object.entries(contagem).forEach(([opcao, qtd]) => {
                    const percent = ((qtd / respostas.length) * 100).toFixed(1);
                    dadosFrequencia.push([
                        limparTexto(campo.label),
                        limparTexto(String(opcao)),
                        String(qtd),
                        `${percent}%`
                    ]);
                });
            });

            if (dadosFrequencia.length > 0) {
                doc.autoTable({
                    startY: yPos,
                    head: [['Pergunta / Campo', 'Alternativa / Valor', 'Quantidade', 'Porcentagem']],
                    body: dadosFrequencia,
                    styles: { fontSize: 8, cellPadding: 2 },
                    headStyles: { fillColor: [99, 102, 241], textColor: [255, 255, 255] },
                    columnStyles: {
                        0: { cellWidth: 70 },
                        1: { cellWidth: 60 },
                        2: { cellWidth: 35, halign: 'center' },
                        3: { cellWidth: 35, halign: 'center' }
                    }
                });
                yPos = doc.lastAutoTable.finalY + 12;
            } else {
                doc.setFont("helvetica", "italic");
                doc.setFontSize(9);
                doc.text("Nenhum dado de frequência disponível.", margemEsquerda, yPos + 5);
                yPos += 15;
            }
        }

        // ============================================================
        // SEÇÃO 3: TABELA CONSOLIDADA POR ÓRGÃO
        // ============================================================
        if (incluirTabelaOrg) {
            if (yPos > 170) { doc.addPage(); yPos = 20; }

            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            doc.text("3. TABELA CONSOLIDADA POR ÓRGÃO", margemEsquerda, yPos);
            yPos += 7;

            const orgaos = [...new Set(respostas.map(r => r.orgaoOrigem || 'Desconhecido'))];
            const camposNumericos = dicionario.filter(c => c.tipo === 'numero' || c.label.toLowerCase().includes('idade'));
            
            const head = [['Órgão / Origem', 'Total Envios', ...camposNumericos.map(c => limparTexto(c.label))]];
            const body = orgaos.map(orgao => {
                const envios = respostas.filter(r => (r.orgaoOrigem || 'Desconhecido') === orgao);
                return [
                    limparTexto(orgao),
                    envios.length.toString(),
                    ...camposNumericos.map(c => {
                        const soma = envios.reduce((acc, r) => acc + (Number(r.dados?.[c.id]?.resposta) || 0), 0);
                        return soma.toLocaleString('pt-BR');
                    })
                ];
            });

            const totalColunas = 2 + camposNumericos.length;
            let tamanhoFonte = 9;
            if (totalColunas > 10) tamanhoFonte = 7;
            if (totalColunas > 15) tamanhoFonte = 6;
            if (totalColunas > 20) tamanhoFonte = 5;

            doc.autoTable({
                startY: yPos,
                head: head,
                body: body,
                styles: { fontSize: tamanhoFonte, cellPadding: 1.5 },
                headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255] },
                columnStyles: {
                    0: { cellWidth: 40, fontStyle: 'bold' },
                    1: { cellWidth: 25, halign: 'center', fontStyle: 'bold' }
                },
                didDrawPage: function(data) {
                    const pageCount = doc.internal.getNumberOfPages();
                    doc.setFontSize(7);
                    doc.text(`Página ${data.pageNumber} de ${pageCount}`, 14, doc.internal.pageSize.height - 10);
                }
            });
            yPos = doc.lastAutoTable.finalY + 12;
        }

        // ============================================================
        // SEÇÃO 4: HISTÓRICO DETALHADO
        // ============================================================
        if (incluirHist) {
            doc.addPage();
            
            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            doc.text("4. HISTÓRICO DETALHADO DE RESPOSTAS", margemEsquerda, 18);
            
            doc.setFont("helvetica", "normal");
            doc.setFontSize(9);
            doc.text(`Total de ${respostas.length} registros encontrados.`, margemEsquerda, 25);

            const head = [["Data/Hora", "Órgão", "Responsável", ...dicionario.map(c => limparTexto(c.label))]];
            
            const body = respostas.slice(0, 200).map(r => [
                r.timestamp ? new Date(r.timestamp).toLocaleString('pt-BR') : '--',
                limparTexto(r.orgaoOrigem || '--'),
                limparTexto(r.responsavel || '--'),
                ...dicionario.map(c => {
                    const val = r.dados?.[c.id]?.resposta;
                    return val !== undefined && val !== '' ? limparTexto(String(val)) : '--';
                })
            ]);

            const totalColunasHist = 3 + dicionario.length;
            let tamanhoFonteHist = 8;
            if (totalColunasHist > 10) tamanhoFonteHist = 6;
            if (totalColunasHist > 15) tamanhoFonteHist = 5;
            if (totalColunasHist > 20) tamanhoFonteHist = 4.5;

            doc.autoTable({
                startY: 30,
                head: head,
                body: body,
                styles: { fontSize: tamanhoFonteHist, cellPadding: 1 },
                headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255] },
                didDrawPage: function(data) {
                    const pageCount = doc.internal.getNumberOfPages();
                    doc.setFontSize(7);
                    doc.text(`Página ${data.pageNumber} de ${pageCount}`, 14, doc.internal.pageSize.height - 10);
                }
            });

            if (respostas.length > 200) {
                const finalY = doc.lastAutoTable.finalY + 5;
                doc.setFont("helvetica", "italic");
                doc.setFontSize(8);
                doc.text(`* Exibindo os 200 registros mais recentes de um total de ${respostas.length}.`, margemEsquerda, finalY);
            }
        }

        doc.save(`Relatorio_Analitico_${coletaData.nomeDaColeta.replace(/\s+/g, '_')}.pdf`);
        showNotification("📄 Relatório PDF analítico gerado com sucesso!", "success");
    },

    // ============================================================
    // MÉTODO AUXILIAR: DESENHAR DISTRIBUIÇÃO NO PDF
    // ============================================================
    _desenharDistribuicaoNoPDF(doc, campo, contagemOpcoes, totalRespostasCampo, xPos, yPos) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.text(limparTexto(campo.label.substring(0, 28)), xPos, yPos);
        
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
            doc.text(`${limparTexto(opcao.substring(0, 22))}: ${qtd} (${percentual}%)`, xPos, yAtual);
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
