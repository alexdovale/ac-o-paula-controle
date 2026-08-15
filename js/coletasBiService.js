// js/coletasBiService.js - Serviço de BI e Relatórios Avançado para Coletas
import { showNotification, escapeHTML } from './utils.js';

// ============================================================
// FUNÇÃO AUXILIAR: LIMPAR CARACTERES ESPECIAIS
// ============================================================
function limparTexto(texto) {
    if (typeof texto !== 'string') return texto;
    return texto
        .normalize('NFD').replace(/[\u0300-\u036f]/g, "")
        .replace(/[ºª°]/g, '')
        .replace(/[&]/g, 'e')
        .replace(/[^\x00-\x7F]/g, "");
}

// ============================================================
// FUNÇÃO AUXILIAR: CACHE DE DADOS
// ============================================================
const CACHE_KEY = 'sigep_bi_cache';
const CACHE_DURATION = 5 * 60 * 1000;

async function getCachedData(coletaId) {
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            const data = JSON.parse(cached);
            if (Date.now() - data.timestamp < CACHE_DURATION && data.coletaId === coletaId) {
                return data.payload;
            }
        }
    } catch (e) { /* Ignora erro de cache */ }
    return null;
}

async function setCachedData(coletaId, payload) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
            coletaId,
            payload,
            timestamp: Date.now()
        }));
    } catch (e) { /* Ignora erro de cache */ }
}

export const ColetasBiService = {
    // ============================================================
    // INICIALIZAÇÃO E CARREGAMENTO DE DADOS
    // ============================================================
    async abrirResultados(db, coletaId) {
        const container = document.getElementById('container-construtor-coleta');
        if (!container) return;

        container.classList.remove('hidden');
        container.innerHTML = `
            <div class="p-12 text-center animate-pulse space-y-3">
                <div class="w-10 h-10 border-4 border-slate-300 border-t-blue-600 rounded-full animate-spin mx-auto"></div>
                <p class="text-slate-600 font-bold">Processando motor analítico de BI...</p>
            </div>
        `;

        try {
            let dadosCache = await getCachedData(coletaId);
            let coletaData, dicionario, respostas, orgaosUnicos;

            if (dadosCache) {
                ({ coletaData, dicionario, respostas, orgaosUnicos } = dadosCache);
                window._dadosBiCache = { coletaData, dicionario, respostas, orgaosUnicos, coletaId };
                this.renderizarPainelBiCompleto('todos', 'todos');
                showNotification("Dados carregados do cache!", "info");
                return;
            }

            const { doc, getDoc, collection, getDocs, query, where } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
            
            const coletaSnap = await getDoc(doc(db, "formularios_coleta", coletaId));
            if (!coletaSnap.exists()) {
                container.innerHTML = `<p class="text-red-500 font-bold p-6">Coleta não encontrada.</p>`;
                return;
            }
            coletaData = coletaSnap.data();
            dicionario = coletaData.dicionarioDeCampos || [];

            const q = query(collection(db, "respostas_coleta"), where("coletaId", "==", coletaId));
            const respostasSnap = await getDocs(q);

            respostas = [];
            respostasSnap.forEach(rDoc => respostas.push({ id: rDoc.id, ...rDoc.data() }));

            orgaosUnicos = [...new Set(respostas.map(r => r.orgaoOrigem || 'Desconhecido'))];

            window._dadosBiCache = { coletaData, dicionario, respostas, orgaosUnicos, coletaId };
            
            await setCachedData(coletaId, { coletaData, dicionario, respostas, orgaosUnicos });

            this.renderizarPainelBiCompleto('todos', 'todos');

        } catch (err) {
            console.error(err);
            container.innerHTML = `<p class="text-red-500 font-bold p-6">Erro ao gerar painel de resultados.</p>`;
        }
    },

    // ============================================================
    // RENDERIZAÇÃO DO PAINEL COMPLETO
    // ============================================================
    renderizarPainelBiCompleto(orgaoFiltro = 'todos', periodoFiltro = 'todos') {
        const { coletaData, dicionario, respostas, orgaosUnicos } = window._dadosBiCache || {};
        const container = document.getElementById('container-construtor-coleta');
        if (!container) return;

        // Salva os filtros atuais para serem usados pelas exportações individuais
        window._filtrosAtuaisBi = { orgao: orgaoFiltro, periodo: periodoFiltro };

        let respostasFiltradas = this._aplicarFiltros(respostas, orgaoFiltro, periodoFiltro);

        let html = `
            <div class="space-y-6 animate-fade-in bg-slate-50 p-4 sm:p-6 rounded-3xl border border-slate-200">
                
                <!-- BARRA DE FERRAMENTAS -->
                <div class="bg-white p-6 rounded-2xl border shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div>
                        <label class="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Filtrar por Órgão:</label>
                        <select id="filtro-orgao-bi" onchange="ColetasBiService.renderizarPainelBiCompleto(this.value, document.getElementById('filtro-periodo-bi').value)" class="w-full p-2.5 border border-slate-300 rounded-lg font-bold text-sm bg-white outline-none">
                            <option value="todos">Todos os Órgãos (${respostas.length} envios)</option>
                            ${orgaosUnicos.map(o => `<option value="${o}" ${orgaoFiltro === o ? 'selected' : ''}>${o}</option>`).join('')}
                        </select>
                    </div>
                    
                    <div>
                        <label class="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Período:</label>
                        <select id="filtro-periodo-bi" onchange="ColetasBiService.renderizarPainelBiCompleto(document.getElementById('filtro-orgao-bi').value, this.value)" class="w-full p-2.5 border border-slate-300 rounded-lg font-bold text-sm bg-white outline-none">
                            <option value="todos" ${periodoFiltro === 'todos' ? 'selected' : ''}>Todos os períodos</option>
                            <option value="hoje" ${periodoFiltro === 'hoje' ? 'selected' : ''}>Hoje</option>
                            <option value="semana" ${periodoFiltro === 'semana' ? 'selected' : ''}>Última semana</option>
                            <option value="mes" ${periodoFiltro === 'mes' ? 'selected' : ''}>Último mês</option>
                        </select>
                    </div>

                    <div>
                        <label class="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Favoritos:</label>
                        <select id="filtro-favoritos" onchange="ColetasBiService.carregarFiltroFavorito(this.value)" class="w-full p-2.5 border border-slate-300 rounded-lg font-bold text-sm bg-white outline-none">
                            <option value="">Selecione um favorito...</option>
                            ${this._carregarFiltrosFavoritos().map(f => `<option value="${f.nome}">${f.nome}</option>`).join('')}
                        </select>
                    </div>
                    
                    <div class="flex flex-wrap gap-2 w-full mt-2 md:mt-0 lg:justify-end">
                        <button onclick="ColetasBiService.salvarFiltroComoFavorito()" class="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 font-bold px-3 py-2.5 rounded-lg transition text-xs flex-1 text-center">
                            Salvar Filtro
                        </button>
                        <button onclick="ColetasBiService.abrirModalExportacao()" class="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-2.5 rounded-lg shadow-sm transition text-xs flex-1 text-center">
                            Exportação Geral
                        </button>
                        <button onclick="window.print()" class="bg-slate-800 hover:bg-slate-900 text-white font-bold px-3 py-2.5 rounded-lg transition text-xs flex-1 text-center">
                            Imprimir Painel
                        </button>
                        <button onclick="ColetasBiService.gerarInsights()" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-2.5 rounded-lg transition text-xs flex-1 text-center" title="Insights Automáticos">
                            Insights
                        </button>
                    </div>
                </div>
        `;

        // COMPARAÇÃO ENTRE PERÍODOS
        if (periodoFiltro !== 'todos' && respostasFiltradas.length > 0) {
            const variacao = this._calcularVariacaoPeriodo(respostas, periodoFiltro);
            html += `
                <div class="bg-slate-100 p-5 rounded-2xl border border-slate-200">
                    <p class="text-xs font-bold text-slate-600 uppercase tracking-wide">Comparação com período anterior</p>
                    <div class="grid grid-cols-3 gap-4 mt-3">
                        <div>
                            <span class="text-xs text-slate-500">Período atual</span>
                            <p class="text-xl font-black text-blue-700">${respostasFiltradas.length} envios</p>
                        </div>
                        <div>
                            <span class="text-xs text-slate-500">Período anterior</span>
                            <p class="text-xl font-black text-slate-600">${variacao.anterior} envios</p>
                        </div>
                        <div>
                            <span class="text-xs text-slate-500">Variação</span>
                            <p class="text-xl font-black ${variacao.percentual >= 0 ? 'text-emerald-600' : 'text-red-600'}">
                                ${variacao.percentual > 0 ? 'Aumento de' : variacao.percentual < 0 ? 'Queda de' : 'Estável em'} ${Math.abs(variacao.percentual)}%
                            </p>
                        </div>
                    </div>
                </div>
            `;
        }

        // INDICADORES GERAIS
        html += `
                <div class="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                        <p class="text-[10px] uppercase font-bold text-slate-500">Total de Envios</p>
                        <p class="text-3xl font-black text-blue-700">${respostasFiltradas.length}</p>
                    </div>
                    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                        <p class="text-[10px] uppercase font-bold text-slate-500">Órgãos Participantes</p>
                        <p class="text-3xl font-black text-emerald-600">${new Set(respostasFiltradas.map(r => r.orgaoOrigem)).size}</p>
                    </div>
                    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                        <p class="text-[10px] uppercase font-bold text-slate-500">Último Envio</p>
                        <p class="text-sm mt-2 font-black text-slate-800">${respostasFiltradas.length > 0 ? new Date(respostasFiltradas[0].timestamp).toLocaleDateString('pt-BR') : '--'}</p>
                    </div>
                    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                        <p class="text-[10px] uppercase font-bold text-slate-500">Média por Órgão</p>
                        <p class="text-3xl font-black text-indigo-600">${respostasFiltradas.length > 0 && orgaosUnicos.length > 0 ? (respostasFiltradas.length / orgaosUnicos.length).toFixed(1) : '0'}</p>
                    </div>
                </div>
        `;

        // ============================================================
        // CARDS PARA TODAS AS PERGUNTAS (RESPEITANDO CONFIGURAÇÕES)
        // ============================================================
        html += `
            <div>
                <h4 class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 border-b border-slate-200 pb-2">Métricas Individuais (Clique para detalhar)</h4>
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        `;

        dicionario.forEach(campo => {
            const valores = respostasFiltradas
                .map(r => r.dados?.[campo.id]?.resposta)
                .filter(v => v !== undefined && v !== null && v !== '' && v !== '--');

            const metricas = campo.metricasBi || this._getMetricasPadrao(campo.tipo);

            // ============================================================
            // CARD PARA CAMPOS NUMÉRICOS
            // ============================================================
            if (campo.tipo === 'numero' || campo.tipo === 'numero_abrangente') {
                const numeros = valores.map(Number).filter(n => !isNaN(n));
                
                if (numeros.length === 0) {
                    html += this._renderCardSemDados(campo);
                    return;
                }

                const soma = numeros.reduce((a, b) => a + b, 0);
                const media = (soma / numeros.length).toFixed(1);
                const variancia = numeros.reduce((acc, n) => acc + Math.pow(n - media, 2), 0) / numeros.length;
                const desvioPadrao = Math.sqrt(variancia).toFixed(1);

                const contagemNumerica = {};
                numeros.forEach(num => {
                    contagemNumerica[num] = (contagemNumerica[num] || 0) + 1;
                });
                const chavesOrdenadas = Object.keys(contagemNumerica).sort((a, b) => Number(a) - Number(b));
                const frequenciaLista = chavesOrdenadas.map(num => 
                    `${num}: ${contagemNumerica[num]}x`
                ).join(' | ');

                let metricasHtml = '';
                let colunas = 0;

                if (metricas.includes('soma')) {
                    metricasHtml += `
                        <div class="bg-blue-50 border border-blue-100 p-2 rounded-xl text-center">
                            <p class="text-lg font-black text-blue-700">${soma.toLocaleString('pt-BR')}</p>
                            <p class="text-[8px] font-bold text-blue-500 uppercase">Soma</p>
                        </div>
                    `;
                    colunas++;
                }

                if (metricas.includes('media')) {
                    metricasHtml += `
                        <div class="bg-slate-50 border border-slate-200 p-2 rounded-xl text-center">
                            <p class="text-lg font-black text-slate-700">${media}</p>
                            <p class="text-[8px] font-bold text-slate-500 uppercase">Média</p>
                        </div>
                    `;
                    colunas++;
                }

                if (metricas.includes('desvio')) {
                    metricasHtml += `
                        <div class="bg-slate-50 border border-slate-200 p-2 rounded-xl text-center">
                            <p class="text-lg font-black text-slate-700">${desvioPadrao}</p>
                            <p class="text-[8px] font-bold text-slate-500 uppercase">Desvio</p>
                        </div>
                    `;
                    colunas++;
                }

                const gridCols = colunas > 0 ? `grid-cols-${colunas}` : 'grid-cols-1';

                html += `
                    <div onclick="ColetasBiService.detalharPorOrgao('${campo.id}')" class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm cursor-pointer hover:border-blue-400 hover:shadow-md transition-all relative overflow-hidden group">
                        <div class="absolute top-0 left-0 w-1.5 h-full bg-blue-500 opacity-0 group-hover:opacity-100 transition"></div>
                        <p class="text-[10px] font-bold text-slate-500 uppercase tracking-wider group-hover:text-blue-600 transition truncate">${escapeHTML(campo.label)}</p>
                        <div class="mt-3 grid ${gridCols} gap-2 text-center">
                            ${metricasHtml}
                        </div>
                        ${metricas.includes('frequencia') && chavesOrdenadas.length > 0 ? `
                            <div class="mt-2 text-[10px] text-slate-500 truncate">
                                Frequência: ${frequenciaLista}
                            </div>
                        ` : ''}
                        <span class="text-[10px] text-slate-400 mt-2 font-medium flex items-center gap-1">
                            Respostas Válidas: ${numeros.length}
                            <span class="text-blue-500 text-[8px] ml-auto uppercase font-bold">Detalhar</span>
                        </span>
                    </div>
                `;
            }

            // ============================================================
            // CARD PARA SELEÇÃO / MÚLTIPLA ESCOLHA / BOOLEANO
            // ============================================================
            else if (['selecao', 'multipla_escolha', 'booleano'].includes(campo.tipo)) {
                const contagem = {};
                valores.forEach(val => {
                    contagem[val] = (contagem[val] || 0) + 1;
                });

                const entries = Object.entries(contagem).sort((a, b) => b[1] - a[1]);
                const total = valores.length;
                const distribuicao = entries.map(([key, qtd]) => 
                    `${key}: ${qtd}`
                ).join(' | ');

                let metricasHtml = '';

                if (metricas.includes('total')) {
                    metricasHtml += `
                        <div class="flex justify-between text-xs border-b border-slate-50 pb-1 mb-1">
                            <span class="text-slate-500">Total respostas:</span>
                            <span class="font-bold text-indigo-600">${total}</span>
                        </div>
                    `;
                }

                if (metricas.includes('distribuicao')) {
                    metricasHtml += `
                        <div class="flex justify-between text-xs border-b border-slate-50 pb-1 mb-1">
                            <span class="text-slate-500">Distribuição:</span>
                            <span class="font-bold text-slate-700 truncate max-w-[150px]">${escapeHTML(distribuicao)}</span>
                        </div>
                        <div class="flex justify-between text-xs">
                            <span class="text-slate-500">Opções disponíveis:</span>
                            <span class="font-bold text-slate-700">${entries.length}</span>
                        </div>
                    `;
                }

                html += `
                    <div onclick="ColetasBiService.detalharPorOrgao('${campo.id}')" class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm cursor-pointer hover:border-emerald-400 hover:shadow-md transition-all relative overflow-hidden group">
                        <div class="absolute top-0 left-0 w-1.5 h-full bg-emerald-500 opacity-0 group-hover:opacity-100 transition"></div>
                        <p class="text-[10px] font-bold text-slate-500 uppercase tracking-wider group-hover:text-emerald-600 transition truncate mb-3">${escapeHTML(campo.label)}</p>
                        <div class="space-y-1">
                            ${metricasHtml}
                        </div>
                        <span class="text-[10px] text-slate-400 mt-2 font-medium flex items-center gap-1">
                            Opções Válidas: ${entries.length}
                            <span class="text-emerald-500 text-[8px] ml-auto uppercase font-bold">Detalhar</span>
                        </span>
                    </div>
                `;
            }

            // ============================================================
            // CARD PARA TEXTOS
            // ============================================================
            else {
                const totalRespostas = valores.length;
                const ultimaResposta = valores.length > 0 ? String(valores[valores.length - 1]).substring(0, 25) : '--';
                const primeirasRespostas = valores.slice(0, 3).map(v => String(v).substring(0, 20)).join(', ');

                let metricasHtml = '';

                if (metricas.includes('total')) {
                    metricasHtml += `
                        <div class="flex justify-between text-xs border-b border-slate-50 pb-1 mb-1">
                            <span class="text-slate-500">Total respostas:</span>
                            <span class="font-bold text-slate-800">${totalRespostas}</span>
                        </div>
                    `;
                }

                if (metricas.includes('ultima') && totalRespostas > 0) {
                    metricasHtml += `
                        <div class="flex justify-between text-xs border-b border-slate-50 pb-1 mb-1">
                            <span class="text-slate-500">Última resposta:</span>
                            <span class="font-bold text-slate-700 truncate max-w-[120px]">${escapeHTML(ultimaResposta)}</span>
                        </div>
                        <div class="flex justify-between text-xs">
                            <span class="text-slate-500">Exemplos:</span>
                            <span class="font-medium text-slate-600 truncate max-w-[120px]">${escapeHTML(primeirasRespostas)}</span>
                        </div>
                    `;
                }

                html += `
                    <div onclick="ColetasBiService.detalharPorOrgao('${campo.id}')" class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm cursor-pointer hover:border-slate-400 hover:shadow-md transition-all relative overflow-hidden group">
                        <div class="absolute top-0 left-0 w-1.5 h-full bg-slate-500 opacity-0 group-hover:opacity-100 transition"></div>
                        <p class="text-[10px] font-bold text-slate-500 uppercase tracking-wider group-hover:text-slate-800 transition truncate mb-3">${escapeHTML(campo.label)}</p>
                        <div class="space-y-1">
                            ${metricasHtml || `<p class="text-xs text-slate-400 italic">Sem métricas configuradas</p>`}
                        </div>
                        <span class="text-[10px] text-slate-400 mt-2 font-medium flex items-center gap-1">
                            Registros: ${totalRespostas}
                            <span class="text-slate-600 text-[8px] ml-auto uppercase font-bold">Detalhar</span>
                        </span>
                    </div>
                `;
            }
        });

        html += `</div></div>`;

        // DIV DE DETALHES
        html += `
            <div id="bi-detalhes-dinamicos" class="hidden bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"></div>
        `;

        // ============================================================
        // TABELA CONSOLIDADA POR ÓRGÃO
        // ============================================================
        const camposNumericos = dicionario.filter(c => 
            c.tipo === 'numero' || 
            c.tipo === 'numero_abrangente'
        );
        
        if (camposNumericos.length > 0) {
            html += `
                <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mt-6">
                    <div class="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                            <span class="font-bold text-slate-700 text-sm uppercase">Tabela Consolidada Analítica</span>
                            <span class="text-xs text-slate-500 font-medium ml-2 block sm:inline-block">${respostasFiltradas.length} envios • ${orgaosUnicos.filter(o => orgaoFiltro === 'todos' || o === orgaoFiltro).length} órgãos</span>
                        </div>
                        <!-- BOTÕES DE EXPORTAÇÃO ESPECÍFICOS DESTA TABELA -->
                        <div class="flex gap-2 w-full sm:w-auto">
                            <button onclick="ColetasBiService.exportarTabelaConsolidada('excel')" class="flex-1 sm:flex-none text-xs bg-white border border-slate-300 hover:bg-emerald-50 text-emerald-700 font-bold px-4 py-2 rounded-lg transition shadow-sm">Baixar Excel</button>
                            <button onclick="ColetasBiService.exportarTabelaConsolidada('pdf')" class="flex-1 sm:flex-none text-xs bg-white border border-slate-300 hover:bg-blue-50 text-blue-700 font-bold px-4 py-2 rounded-lg transition shadow-sm">Baixar PDF</button>
                        </div>
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
                    <tr class="hover:bg-slate-50 transition">
                        <td class="p-3.5 font-bold text-slate-700 whitespace-nowrap">${escapeHTML(orgao)}</td>
                        <td class="p-3.5 text-center font-bold text-blue-600">${enviosDoOrgao.length}</td>
                `;

                camposNumericos.forEach(c => {
                    let somaOrgao = 0;
                    enviosDoOrgao.forEach(r => {
                        if (r.dados && r.dados[c.id]) somaOrgao += Number(r.dados[c.id].resposta) || 0;
                    });
                    html += `<td class="p-3.5 text-right font-medium text-slate-600">${somaOrgao.toLocaleString('pt-BR')}</td>`;
                });

                html += `</tr>`;
            });

            html += `</tbody></table></div></div>`;
        }

        // ============================================================
        // HISTÓRICO DETALHADO
        // ============================================================
        html += `
            <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mt-6">
                <div class="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <span class="font-bold text-slate-700 text-sm uppercase">Histórico Detalhado de Respostas</span>
                        <span class="text-xs text-slate-500 font-medium ml-2 block sm:inline-block">${respostasFiltradas.length} registros</span>
                    </div>
                    <!-- BOTÕES DE EXPORTAÇÃO ESPECÍFICOS DESTA TABELA -->
                    <div class="flex gap-2 w-full sm:w-auto">
                        <button onclick="ColetasBiService.exportarHistorico('excel')" class="flex-1 sm:flex-none text-xs bg-white border border-slate-300 hover:bg-emerald-50 text-emerald-700 font-bold px-4 py-2 rounded-lg transition shadow-sm">Baixar Excel</button>
                        <button onclick="ColetasBiService.exportarHistorico('pdf')" class="flex-1 sm:flex-none text-xs bg-white border border-slate-300 hover:bg-blue-50 text-blue-700 font-bold px-4 py-2 rounded-lg transition shadow-sm">Baixar PDF</button>
                    </div>
                </div>
                <div class="overflow-x-auto max-h-96">
                    <table class="w-full text-left border-collapse text-sm">
                        <thead class="bg-slate-100 text-slate-600 text-[10px] uppercase tracking-wider border-b border-slate-200 sticky top-0">
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
                <tr class="hover:bg-slate-50 transition">
                    <td class="p-3.5 text-xs text-slate-500 font-medium whitespace-nowrap">${dataFormatada}</td>
                    <td class="p-3.5 font-bold text-slate-700">${escapeHTML(r.orgaoOrigem || 'Desconhecido')}</td>
                    <td class="p-3.5 text-slate-600">${escapeHTML(r.responsavel || '--')}</td>
            `;

            dicionario.forEach(c => {
                const respostaItem = r.dados && r.dados[c.id] ? r.dados[c.id].resposta : '--';
                html += `<td class="p-3.5 font-medium text-slate-700">${escapeHTML(String(respostaItem))}</td>`;
            });

            html += `</tr>`;
        });

        if (respostasFiltradas.length > 50) {
            html += `<tr><td colspan="${dicionario.length + 3}" class="p-4 text-center text-xs text-slate-500 italic bg-slate-50">Exibindo os 50 registros mais recentes na tela. Para ver todos, use os botões de exportação.</td></tr>`;
        }

        html += `</tbody></table></div></div>`;

        // AUTO-REFRESH
        html += `
            <div class="flex justify-end gap-3 mt-6">
                <button onclick="ColetasBiService.iniciarAutoRefresh()" class="text-xs bg-slate-100 border border-slate-300 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2.5 rounded-lg transition">
                    Iniciar Auto-Refresh (5min)
                </button>
                <button onclick="ColetasBiService.pararAutoRefresh()" class="text-xs bg-red-50 border border-red-200 hover:bg-red-100 text-red-600 font-bold px-4 py-2.5 rounded-lg transition hidden" id="btn-parar-refresh">
                    Parar Auto-Refresh
                </button>
            </div>
        </div>`;

        container.innerHTML = html;
        container.scrollIntoView({ behavior: 'smooth' });
    },

    // ============================================================
    // MÉTODOS AUXILIARES
    // ============================================================
    _getMetricasPadrao(tipo) {
        if (tipo === 'numero' || tipo === 'numero_abrangente') {
            return ['soma', 'media'];
        }
        if (['selecao', 'multipla_escolha', 'booleano'].includes(tipo)) {
            return ['total', 'distribuicao'];
        }
        return ['total'];
    },

    _renderCardSemDados(campo) {
        return `
            <div class="bg-slate-50 p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden opacity-70">
                <div class="absolute top-0 left-0 w-1.5 h-full bg-slate-300"></div>
                <p class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">${escapeHTML(campo.label)}</p>
                <p class="text-2xl font-black text-slate-400 mt-3">--</p>
                <span class="text-[9px] text-slate-400 mt-1 uppercase font-bold">Aguardando Dados</span>
            </div>
        `;
    },

    _aplicarFiltros(respostas, orgaoFiltro, periodoFiltro) {
        let filtradas = [...respostas];

        if (orgaoFiltro !== 'todos') {
            filtradas = filtradas.filter(r => r.orgaoOrigem === orgaoFiltro);
        }

        if (periodoFiltro !== 'todos') {
            const agora = new Date();
            let dataLimite = new Date();
            
            if (periodoFiltro === 'hoje') {
                dataLimite = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
            } else if (periodoFiltro === 'semana') {
                dataLimite.setDate(agora.getDate() - 7);
            } else if (periodoFiltro === 'mes') {
                dataLimite.setMonth(agora.getMonth() - 1);
            }

            filtradas = filtradas.filter(r => {
                if (!r.timestamp) return false;
                const data = new Date(r.timestamp);
                return data >= dataLimite;
            });
        }

        return filtradas;
    },

    _calcularVariacaoPeriodo(respostas, periodoFiltro) {
        const agora = new Date();
        let dataAtual = new Date();
        let dataAnterior = new Date();

        if (periodoFiltro === 'semana') {
            dataAtual.setDate(agora.getDate() - 7);
            dataAnterior.setDate(agora.getDate() - 14);
        } else if (periodoFiltro === 'mes') {
            dataAtual.setMonth(agora.getMonth() - 1);
            dataAnterior.setMonth(agora.getMonth() - 2);
        }

        const atual = respostas.filter(r => {
            if (!r.timestamp) return false;
            const data = new Date(r.timestamp);
            return data >= dataAtual;
        });

        const anterior = respostas.filter(r => {
            if (!r.timestamp) return false;
            const data = new Date(r.timestamp);
            return data >= dataAnterior && data < dataAtual;
        });

        const perc = atual.length > 0 && anterior.length > 0 
            ? ((atual.length - anterior.length) / anterior.length * 100)
            : 0;

        return {
            atual: atual.length,
            anterior: anterior.length,
            percentual: Math.round(perc)
        };
    },

    // ============================================================
    // FILTROS FAVORITOS
    // ============================================================
    _carregarFiltrosFavoritos() {
        try {
            return JSON.parse(localStorage.getItem('sigep_filtros_favoritos') || '[]');
        } catch { return []; }
    },

    salvarFiltroComoFavorito() {
        const orgao = document.getElementById('filtro-orgao-bi')?.value || 'todos';
        const periodo = document.getElementById('filtro-periodo-bi')?.value || 'todos';
        const nome = prompt('Nome para identificar este filtro favorito:', `Visão Analítica ${new Date().toLocaleDateString('pt-BR')}`);
        
        if (nome) {
            const favoritos = this._carregarFiltrosFavoritos();
            favoritos.push({ nome: limparTexto(nome), orgao, periodo });
            localStorage.setItem('sigep_filtros_favoritos', JSON.stringify(favoritos));
            this._atualizarSelectFavoritos();
            showNotification(`Filtro "${nome}" salvo com sucesso.`, "success");
        }
    },

    carregarFiltroFavorito(nome) {
        if (!nome) return;
        const favoritos = this._carregarFiltrosFavoritos();
        const filtro = favoritos.find(f => f.nome === nome);
        if (filtro) {
            document.getElementById('filtro-orgao-bi').value = filtro.orgao;
            document.getElementById('filtro-periodo-bi').value = filtro.periodo;
            this.renderizarPainelBiCompleto(filtro.orgao, filtro.periodo);
        }
    },

    _atualizarSelectFavoritos() {
        const select = document.getElementById('filtro-favoritos');
        if (!select) return;
        const favoritos = this._carregarFiltrosFavoritos();
        const valorAtual = select.value;
        select.innerHTML = `
            <option value="">Selecione uma visão...</option>
            ${favoritos.map(f => `<option value="${f.nome}" ${f.nome === valorAtual ? 'selected' : ''}>${f.nome}</option>`).join('')}
        `;
    },

    // ============================================================
    // AUTO-REFRESH
    // ============================================================
    iniciarAutoRefresh(intervalo = 300000) {
        if (this._refreshInterval) clearInterval(this._refreshInterval);
        
        this._refreshInterval = setInterval(() => {
            const coletaId = window._dadosBiCache?.coletaId;
            if (coletaId) {
                this.abrirResultados(window.app.db, coletaId);
                showNotification("Dados do painel atualizados automaticamente.", "info");
            }
        }, intervalo);

        document.getElementById('btn-parar-refresh')?.classList.remove('hidden');
        showNotification("Atualização automática ativada (5 minutos).", "info");
    },

    pararAutoRefresh() {
        if (this._refreshInterval) {
            clearInterval(this._refreshInterval);
            this._refreshInterval = null;
        }
        document.getElementById('btn-parar-refresh')?.classList.add('hidden');
        showNotification("Atualização automática desativada.", "info");
    },

    // ============================================================
    // INSIGHTS AUTOMÁTICOS
    // ============================================================
    gerarInsights() {
        const { respostas, dicionario } = window._dadosBiCache || {};
        if (!respostas || respostas.length === 0) {
            showNotification("Amostra insuficiente para processamento de insights.", "error");
            return;
        }

        let insights = [];
        const totalRespostas = respostas.length;
        const orgaos = new Set(respostas.map(r => r.orgaoOrigem));

        dicionario.forEach(campo => {
            const valores = respostas
                .map(r => r.dados?.[campo.id]?.resposta)
                .filter(v => v !== undefined && v !== null && v !== '' && v !== '--');

            if (valores.length === 0) {
                insights.push(`Atenção - ${campo.label}: Nenhuma resposta registrada no período analisado.`);
                return;
            }

            if (campo.tipo === 'numero' || campo.tipo === 'numero_abrangente') {
                const numeros = valores.map(Number).filter(n => !isNaN(n) && n > 0);
                if (numeros.length > 0) {
                    const soma = numeros.reduce((a, b) => a + b, 0);
                    const media = soma / numeros.length;
                    const max = Math.max(...numeros);
                    const min = Math.min(...numeros);
                    
                    const contagem = {};
                    numeros.forEach(n => contagem[n] = (contagem[n] || 0) + 1);
                    const maisFrequente = Object.entries(contagem).sort((a, b) => b[1] - a[1])[0];
                    
                    insights.push(`Analítico - ${campo.label}: Volume de ${soma.toLocaleString('pt-BR')} com média de ${media.toFixed(1)}. O valor ${maisFrequente[0]} ocorreu ${maisFrequente[1]} vez(es).`);
                    
                    if (max > media * 2) {
                        insights.push(`Alerta de Discrepância - ${campo.label}: O pico registrado (${max}) é mais de 2x superior à média global (${media.toFixed(1)}).`);
                    }
                }
            }

            if (['selecao', 'multipla_escolha', 'booleano'].includes(campo.tipo)) {
                const contagem = {};
                valores.forEach(val => {
                    contagem[val] = (contagem[val] || 0) + 1;
                });

                const entries = Object.entries(contagem).sort((a, b) => b[1] - a[1]);
                if (entries.length > 0) {
                    const max = entries[0];
                    const min = entries[entries.length - 1];
                    
                    const distribuicao = entries.map(([key, qtd]) => `${key}: ${qtd}`).join(', ');
                    insights.push(`Perfil - ${campo.label}: Distribuição atual -> ${distribuicao}`);
                    
                    if (max[1] > totalRespostas * 0.5) {
                        insights.push(`Tendência - ${campo.label}: A categoria "${max[0]}" tem predominância clara, representando ${Math.round(max[1]/totalRespostas*100)}% da amostra.`);
                    }
                    if (min[1] < totalRespostas * 0.1 && entries.length > 1) {
                        insights.push(`Baixa Relevância - ${campo.label}: A categoria "${min[0]}" teve adesão residual de apenas ${Math.round(min[1]/totalRespostas*100)}%.`);
                    }
                }
            }
        });

        if (orgaos.size > 1) {
            insights.push(`Escopo: Cobertura identificada em ${orgaos.size} unidades/órgãos distintos.`);
        }
        if (totalRespostas < 3) {
            insights.push(`Confiabilidade: Baixo volume de dados (${totalRespostas}). A margem de erro das projeções é alta.`);
        }

        if (insights.length === 0) {
            insights.push("Nenhuma anomalia ou tendência forte detectada nos dados atuais.");
        }

        this._mostrarModalInsights(insights);
    },

    _mostrarModalInsights(insights) {
        const modal = document.createElement('div');
        modal.id = 'modal-insights';
        modal.className = 'fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-4 animate-fade-in backdrop-blur-sm';
        modal.innerHTML = `
            <div class="bg-white rounded-2xl max-w-lg w-full p-8 shadow-2xl border border-slate-200">
                <div class="flex justify-between items-center mb-5 border-b border-slate-100 pb-4">
                    <h3 class="text-lg font-black text-slate-800 uppercase tracking-wide">Processamento de Insights</h3>
                    <button onclick="this.closest('#modal-insights').remove()" class="text-slate-400 hover:text-red-500 font-bold text-2xl transition">&times;</button>
                </div>
                
                <div class="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                    ${insights.map((insight, i) => `
                        <div class="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-start gap-3">
                            <span class="text-slate-400 font-black pt-0.5">•</span>
                            <p class="text-sm text-slate-700 font-medium leading-relaxed">${escapeHTML(insight)}</p>
                        </div>
                    `).join('')}
                </div>
                
                <div class="mt-6 flex flex-col sm:flex-row gap-3 pt-2">
                    <button onclick="this.closest('#modal-insights').remove()" class="w-full sm:w-1/2 bg-white border border-slate-300 text-slate-700 font-bold py-3 rounded-xl hover:bg-slate-50 transition">
                        Fechar Painel
                    </button>
                    <button onclick="ColetasBiService.exportarInsights()" class="w-full sm:w-1/2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl shadow transition">
                        Exportar Análise (.txt)
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },

    exportarInsights() {
        const modal = document.getElementById('modal-insights');
        if (modal) {
            const insights = modal.querySelectorAll('.p-4 > p');
            let texto = `RELATÓRIO DE INTELIGÊNCIA ARTIFICIAL E INSIGHTS\nGerado em: ${new Date().toLocaleString('pt-BR')}\n${'='.repeat(60)}\n\n`;
            insights.forEach(el => {
                texto += el.textContent.trim() + '\n\n';
            });
            
            const blob = new Blob([texto], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Insights_Analiticos_${new Date().toISOString().slice(0,10)}.txt`;
            a.click();
            URL.revokeObjectURL(url);
            
            showNotification("Documento de texto exportado com sucesso.", "success");
        }
    },

    // ============================================================
    // DETALHAR POR ÓRGÃO
    // ============================================================
    detalharPorOrgao(campoId) {
        const { respostas, dicionario } = window._dadosBiCache || {};
        if (!respostas) return;
        
        const campo = dicionario.find(c => c.id === campoId);
        if (!campo) return;
        
        const div = document.getElementById('bi-detalhes-dinamicos');
        if (!div) return;
        
        // NUMÉRICO
        if (campo.tipo === 'numero' || campo.tipo === 'numero_abrangente') {
            const agrupado = {};
            const contagemGlobal = {};
            
            respostas.forEach(r => {
                const org = r.orgaoOrigem || 'Desconhecido';
                const valor = Number(r.dados?.[campoId]?.resposta) || 0;
                
                if (!agrupado[org]) agrupado[org] = [];
                agrupado[org].push(valor);
                
                if (valor > 0) {
                    contagemGlobal[valor] = (contagemGlobal[valor] || 0) + 1;
                }
            });

            const totals = Object.entries(agrupado).map(([org, valores]) => {
                const soma = valores.reduce((a, b) => a + b, 0);
                const media = valores.length > 0 ? (soma / valores.length).toFixed(1) : 0;
                const variancia = valores.length > 0 ? valores.reduce((acc, n) => acc + Math.pow(n - media, 2), 0) / valores.length : 0;
                const desvio = Math.sqrt(variancia).toFixed(1);
                return { org, soma, media, desvio, count: valores.length, valores };
            }).sort((a, b) => b.soma - a.soma);

            const totalGeral = totals.reduce((sum, t) => sum + t.soma, 0);
            const freqList = Object.entries(contagemGlobal)
                .sort((a, b) => Number(a[0]) - Number(b[0]))
                .map(([val, qtd]) => `${val}: ${qtd}x`)
                .join(' | ');

            div.classList.remove('hidden');
            div.innerHTML = `
                <div class="flex justify-between items-center mb-5 border-b border-slate-100 pb-3">
                    <h4 class="font-black text-base text-slate-800 uppercase tracking-wide">Detalhamento: ${escapeHTML(campo.label)}</h4>
                    <button onclick="document.getElementById('bi-detalhes-dinamicos').classList.add('hidden')" class="text-slate-500 hover:text-red-600 font-bold text-xs bg-slate-100 px-3 py-1.5 rounded-lg transition uppercase">
                        Fechar Painel
                    </button>
                </div>
                
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                    <div class="p-4 bg-blue-50 rounded-xl border border-blue-200">
                        <p class="text-[10px] uppercase font-bold text-blue-600">Soma Consolidada</p>
                        <p class="text-2xl font-black text-blue-800 mt-1">${totalGeral.toLocaleString('pt-BR')}</p>
                    </div>
                    <div class="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                        <p class="text-[10px] uppercase font-bold text-emerald-600">Média Geral</p>
                        <p class="text-2xl font-black text-emerald-800 mt-1">${(totalGeral / respostas.length).toFixed(1)}</p>
                    </div>
                    <div class="p-4 bg-slate-50 rounded-xl border border-slate-200">
                        <p class="text-[10px] uppercase font-bold text-slate-500">Distribuição Frequente</p>
                        <p class="text-sm font-bold text-slate-700 mt-2 truncate">${freqList || '--'}</p>
                    </div>
                    <div class="p-4 bg-slate-50 rounded-xl border border-slate-200">
                        <p class="text-[10px] uppercase font-bold text-slate-500">Amostra Processada</p>
                        <p class="text-2xl font-black text-slate-800 mt-1">${respostas.length}</p>
                    </div>
                </div>
                
                <div class="overflow-x-auto border border-slate-200 rounded-xl">
                    <table class="w-full text-left border-collapse text-sm">
                        <thead class="bg-slate-100 text-slate-600 text-xs uppercase border-b border-slate-200">
                            <tr>
                                <th class="p-3">Unidade de Origem</th>
                                <th class="p-3 text-center">Registros</th>
                                <th class="p-3 text-right">Volume (Soma)</th>
                                <th class="p-3 text-center">Média</th>
                                <th class="p-3 text-center">Desvio P.</th>
                                <th class="p-3 text-right">Participação (%)</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">
                            ${totals.map(t => `
                                <tr class="hover:bg-slate-50 transition">
                                    <td class="p-3 font-bold text-slate-700">${escapeHTML(t.org)}</td>
                                    <td class="p-3 text-center font-bold text-blue-600">${t.count}</td>
                                    <td class="p-3 text-right font-black text-slate-800">${t.soma.toLocaleString('pt-BR')}</td>
                                    <td class="p-3 text-center font-medium text-emerald-600">${t.media}</td>
                                    <td class="p-3 text-center font-medium text-slate-500">${t.desvio}</td>
                                    <td class="p-3 text-right font-bold text-slate-700">${totalGeral > 0 ? ((t.soma / totalGeral) * 100).toFixed(1) : 0}%</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } 
        
        // SELEÇÃO
        else if (['selecao', 'multipla_escolha', 'booleano'].includes(campo.tipo)) {
            const agrupado = {};
            respostas.forEach(r => {
                const org = r.orgaoOrigem || 'Desconhecido';
                const val = r.dados?.[campoId]?.resposta || 'Não respondeu';
                if (!agrupado[org]) agrupado[org] = {};
                agrupado[org][val] = (agrupado[org][val] || 0) + 1;
            });

            const orgaos = Object.keys(agrupado);
            const todasOpcoes = new Set();
            Object.values(agrupado).forEach(obj => {
                Object.keys(obj).forEach(k => todasOpcoes.add(k));
            });
            const opcoesOrdenadas = [...todasOpcoes].sort();

            const totaisOpcao = {};
            opcoesOrdenadas.forEach(op => {
                totaisOpcao[op] = 0;
                orgaos.forEach(org => {
                    totaisOpcao[op] += agrupado[org][op] || 0;
                });
            });

            div.classList.remove('hidden');
            div.innerHTML = `
                <div class="flex justify-between items-center mb-5 border-b border-slate-100 pb-3">
                    <h4 class="font-black text-base text-slate-800 uppercase tracking-wide">Detalhamento Categórico: ${escapeHTML(campo.label)}</h4>
                    <button onclick="document.getElementById('bi-detalhes-dinamicos').classList.add('hidden')" class="text-slate-500 hover:text-red-600 font-bold text-xs bg-slate-100 px-3 py-1.5 rounded-lg transition uppercase">
                        Fechar Painel
                    </button>
                </div>
                
                <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-5">
                    ${opcoesOrdenadas.map(op => `
                        <div class="p-4 bg-slate-50 rounded-xl border border-slate-200">
                            <p class="text-[10px] uppercase font-bold text-slate-500 truncate" title="${escapeHTML(String(op))}">${escapeHTML(String(op))}</p>
                            <p class="text-2xl font-black text-blue-600 mt-1">${totaisOpcao[op]}</p>
                        </div>
                    `).join('')}
                </div>
                
                <div class="overflow-x-auto border border-slate-200 rounded-xl">
                    <table class="w-full text-left border-collapse text-sm">
                        <thead class="bg-slate-100 text-slate-600 text-xs uppercase border-b border-slate-200">
                            <tr>
                                <th class="p-3">Órgão de Origem</th>
                                ${opcoesOrdenadas.map(op => `<th class="p-3 text-center">${escapeHTML(String(op))}</th>`).join('')}
                                <th class="p-3 text-center bg-slate-200">Total Validado</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">
                            ${orgaos.map(org => {
                                const total = opcoesOrdenadas.reduce((sum, op) => sum + (agrupado[org][op] || 0), 0);
                                return `
                                    <tr class="hover:bg-slate-50 transition">
                                        <td class="p-3 font-bold text-slate-700">${escapeHTML(org)}</td>
                                        ${opcoesOrdenadas.map(op => `
                                            <td class="p-3 text-center font-bold ${agrupado[org][op] > 0 ? 'text-blue-600' : 'text-slate-300'}">
                                                ${agrupado[org][op] || 0}
                                            </td>
                                        `).join('')}
                                        <td class="p-3 text-center font-black text-slate-800 bg-slate-50">${total}</td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } 
        
        // TEXTO
        else {
            const agrupado = {};
            respostas.forEach(r => {
                const org = r.orgaoOrigem || 'Desconhecido';
                const val = r.dados?.[campoId]?.resposta || '--';
                if (!agrupado[org]) agrupado[org] = [];
                agrupado[org].push(String(val));
            });

            div.classList.remove('hidden');
            div.innerHTML = `
                <div class="flex justify-between items-center mb-5 border-b border-slate-100 pb-3">
                    <h4 class="font-black text-base text-slate-800 uppercase tracking-wide">Logs Textuais: ${escapeHTML(campo.label)}</h4>
                    <button onclick="document.getElementById('bi-detalhes-dinamicos').classList.add('hidden')" class="text-slate-500 hover:text-red-600 font-bold text-xs bg-slate-100 px-3 py-1.5 rounded-lg transition uppercase">
                        Fechar Painel
                    </button>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    ${Object.entries(agrupado).map(([org, respostasLista]) => `
                        <div class="p-5 bg-slate-50 rounded-xl border border-slate-200">
                            <p class="text-xs font-black text-slate-600 uppercase border-b border-slate-200 pb-2 mb-3">${escapeHTML(org)}</p>
                            <div class="space-y-2 max-h-48 overflow-y-auto pr-1">
                                ${respostasLista.slice(0, 10).map(val => `
                                    <div class="p-2 bg-white border border-slate-100 rounded text-xs text-slate-700">
                                        ${escapeHTML(String(val))}
                                    </div>
                                `).join('')}
                                ${respostasLista.length > 10 ? `<p class="text-[10px] text-slate-500 font-bold mt-2 pt-2 border-t border-slate-200">+ ${respostasLista.length - 10} registros adicionais ocultos</p>` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }
        
        div.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },

    // ============================================================
    // EXPORTAÇÕES INDIVIDUAIS (BOTÕES DAS TABELAS)
    // ============================================================
    async exportarTabelaConsolidada(formato) {
        const { coletaData, dicionario, respostas, orgaosUnicos } = window._dadosBiCache || {};
        const { orgao, periodo } = window._filtrosAtuaisBi || { orgao: 'todos', periodo: 'todos' };
        const respostasFiltradas = this._aplicarFiltros(respostas, orgao, periodo);
        
        const camposNumericos = dicionario.filter(c => c.tipo === 'numero' || c.tipo === 'numero_abrangente');
        if (camposNumericos.length === 0) return showNotification("Não existem campos compatíveis para matriz consolidada.", "warning");

        const orgaosParaMostrar = orgao === 'todos' ? orgaosUnicos : [orgao];
        const head = ['Órgão de Origem', 'Total de Envios', ...camposNumericos.map(c => limparTexto(c.label))];
        
        const body = orgaosParaMostrar.map(org => {
            const enviosDoOrgao = respostasFiltradas.filter(r => (r.orgaoOrigem || 'Desconhecido') === org);
            if (enviosDoOrgao.length === 0) return null;

            return [
                limparTexto(org),
                enviosDoOrgao.length.toString(),
                ...camposNumericos.map(c => {
                    let soma = 0;
                    enviosDoOrgao.forEach(r => {
                        if (r.dados && r.dados[c.id]) soma += Number(r.dados[c.id].resposta) || 0;
                    });
                    return soma.toLocaleString('pt-BR');
                })
            ];
        }).filter(row => row !== null);

        if (formato === 'excel') {
            await this._gerarExcelSimples(head, body, 'Matriz_Consolidada', coletaData.nomeDaColeta);
        } else if (formato === 'pdf') {
            this._gerarPdfSimples(head, body, 'Matriz Consolidada por Orgao', coletaData.nomeDaColeta);
        }
    },

    async exportarHistorico(formato) {
        const { coletaData, dicionario, respostas } = window._dadosBiCache || {};
        const { orgao, periodo } = window._filtrosAtuaisBi || { orgao: 'todos', periodo: 'todos' };
        const respostasFiltradas = this._aplicarFiltros(respostas, orgao, periodo);

        if (respostasFiltradas.length === 0) return showNotification("Ausência de registros para exportar.", "warning");

        const head = ["Data do Registro", "Unidade Responsável", "Operador", ...dicionario.map(c => limparTexto(c.label))];
        
        const body = respostasFiltradas.map(r => [
            r.timestamp ? new Date(r.timestamp).toLocaleString('pt-BR') : '--',
            limparTexto(r.orgaoOrigem || '--'),
            limparTexto(r.responsavel || '--'),
            ...dicionario.map(c => {
                const val = r.dados?.[c.id]?.resposta;
                return val !== undefined && val !== '' ? limparTexto(String(val)) : '--';
            })
        ]);

        if (formato === 'excel') {
            await this._gerarExcelSimples(head, body, 'Log_Detalhado', coletaData.nomeDaColeta);
        } else if (formato === 'pdf') {
            this._gerarPdfSimples(head, body, 'Log Detalhado de Respostas', coletaData.nomeDaColeta);
        }
    },

    // ============================================================
    // GERADORES BASE (EXCEL E PDF - CHAMADAS INDIVIDUAIS)
    // ============================================================
    async _gerarExcelSimples(head, body, nomeAba, nomeColeta) {
        try {
            showNotification("Compilando arquivo Excel...", "info");
            
            // IMPORTAÇÃO CORRIGIDA (.mjs) PARA NÃO CAUSAR O BUG DO SHEETJS
            const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs');
            const workbook = XLSX.utils.book_new();
            
            const wsData = [
                [`Relatório Corporativo: ${nomeAba.replace(/_/g, ' ')} - ${limparTexto(nomeColeta)}`],
                [`Gerado eletronicamente em: ${new Date().toLocaleString('pt-BR')}`],
                [],
                head,
                ...body
            ];
            
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            
            // Ajusta tamanho das colunas grosseiramente
            const colWidths = wsData[3].map((_, idx) => ({ wch: 15 }));
            ws['!cols'] = colWidths;
            
            XLSX.utils.book_append_sheet(workbook, ws, nomeAba.substring(0, 31));
            
            const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
            const blob = new Blob([wbout], { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${nomeAba}_${limparTexto(nomeColeta).replace(/\s+/g, '_')}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 100);
            
            showNotification("Download corporativo concluído.", "success");
        } catch (err) {
            console.error(err);
            showNotification("Erro ao compilar documento Excel.", "error");
        }
    },

    _gerarPdfSimples(head, body, titulo, nomeColeta) {
        try {
            showNotification("Processando motor de PDF...", "info");
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF('landscape');
            const primaryColor = [15, 23, 42]; // Slate-900
            
            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            doc.text(limparTexto(`${titulo.toUpperCase()}`), 14, 20);
            
            doc.setFont("helvetica", "normal");
            doc.setFontSize(9);
            doc.setTextColor(100);
            doc.text(`Projeto: ${limparTexto(nomeColeta)} | Emissão: ${new Date().toLocaleString('pt-BR')} | Total Registros: ${body.length}`, 14, 26);
            doc.setTextColor(0);

            // Ajusta fonte baseado no volume de colunas do body[0]
            let fontSizeMatrix = 8;
            if (head.length > 8) fontSizeMatrix = 7;
            if (head.length > 12) fontSizeMatrix = 6;
            if (head.length > 16) fontSizeMatrix = 5;
            if (head.length > 20) fontSizeMatrix = 4;

            doc.autoTable({
                startY: 32,
                head: [head],
                body: body,
                theme: 'striped',
                styles: { fontSize: fontSizeMatrix, cellPadding: 2, textColor: [40, 40, 40] },
                headStyles: { fillColor: primaryColor, textColor: 255, fontStyle: 'bold' },
                alternateRowStyles: { fillColor: [248, 250, 252] },
                didDrawPage: function(data) {
                    const pageCount = doc.internal.getNumberOfPages();
                    doc.setFontSize(7);
                    doc.setTextColor(150);
                    doc.text(`Identificador de Página: ${data.pageNumber} / ${pageCount}`, 14, doc.internal.pageSize.height - 10);
                }
            });

            doc.save(`${titulo.replace(/\s+/g, '_')}_${limparTexto(nomeColeta).replace(/\s+/g, '_')}.pdf`);
            showNotification("Arquivo PDF liberado para salvamento.", "success");
        } catch (err) {
            console.error(err);
            showNotification("Falha no renderizador de PDF.", "error");
        }
    },

    // ============================================================
    // MODAL DE EXPORTAÇÃO (GERAL)
    // ============================================================
    abrirModalExportacao() {
        let modal = document.getElementById('modal-config-exportacao');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'modal-config-exportacao';
            modal.className = 'fixed inset-0 bg-slate-900/70 flex items-center justify-center z-50 p-4 animate-fade-in backdrop-blur-sm';
            modal.innerHTML = `
                <div class="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
                    <div class="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                        <h3 class="text-lg font-black text-slate-800 uppercase tracking-wider">Painel de Exportação</h3>
                        <button onclick="document.getElementById('modal-config-exportacao').classList.add('hidden')" class="text-slate-400 hover:text-red-600 font-bold text-xl transition">&times;</button>
                    </div>
                    
                    <div class="p-6 space-y-6">
                        <div class="space-y-4">
                            <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-100 pb-2">Seleção de Módulos (PDF)</p>
                            
                            <label class="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200 cursor-pointer hover:border-blue-400 transition">
                                <input type="checkbox" id="pdf-chk-indicadores" checked class="h-5 w-5 rounded text-blue-600 focus:ring-blue-500 border-slate-300">
                                <span class="text-sm font-bold text-slate-700">Métricas e Indicadores</span>
                            </label>
                            
                            <label class="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200 cursor-pointer hover:border-blue-400 transition">
                                <input type="checkbox" id="pdf-chk-distribuicao" checked class="h-5 w-5 rounded text-blue-600 focus:ring-blue-500 border-slate-300">
                                <span class="text-sm font-bold text-slate-700">Distribuição Categórica</span>
                            </label>
                            
                            <label class="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200 cursor-pointer hover:border-blue-400 transition">
                                <input type="checkbox" id="pdf-chk-consolidado" checked class="h-5 w-5 rounded text-blue-600 focus:ring-blue-500 border-slate-300">
                                <span class="text-sm font-bold text-slate-700">Matriz Consolidada</span>
                            </label>
                            
                            <label class="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200 cursor-pointer hover:border-blue-400 transition">
                                <input type="checkbox" id="pdf-chk-historico" checked class="h-5 w-5 rounded text-blue-600 focus:ring-blue-500 border-slate-300">
                                <span class="text-sm font-bold text-slate-700">Log Detalhado</span>
                            </label>
                        </div>
                        <p class="text-[10px] text-slate-400 mt-2 font-medium">Nota: A exportação via Excel compilará todas as abas automaticamente.</p>
                    </div>
                    
                    <div class="p-6 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row gap-3">
                        <button onclick="ColetasBiService.exportarParaExcel()" class="w-full sm:w-1/2 px-4 py-3 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold rounded-xl transition text-sm text-center shadow-sm">Baixar Planilha</button>
                        <button onclick="ColetasBiService.gerarPDF()" class="w-full sm:w-1/2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition text-sm text-center">Gerar Relatório PDF</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }
        modal.classList.remove('hidden');
    },

    async gerarPDF() {
        document.getElementById('modal-config-exportacao').classList.add('hidden');
        showNotification("Inicializando renderização do PDF corporativo...", "info");

        const { coletaData, respostas, dicionario } = window._dadosBiCache || {};
        const { orgao, periodo } = window._filtrosAtuaisBi || { orgao: 'todos', periodo: 'todos' };
        const respostasFiltradas = this._aplicarFiltros(respostas, orgao, periodo);

        if (!respostasFiltradas || respostasFiltradas.length === 0) return showNotification("Ausência de registros para compilar.", "error");

        const chkInd = document.getElementById('pdf-chk-indicadores')?.checked;
        const chkDist = document.getElementById('pdf-chk-distribuicao')?.checked;
        const chkCons = document.getElementById('pdf-chk-consolidado')?.checked;
        const chkHist = document.getElementById('pdf-chk-historico')?.checked;

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape');
        const primaryColor = [15, 23, 42]; // Slate-900

        // ================= HEADER GERAL =================
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.text(limparTexto(`RELATÓRIO DE INTELIGÊNCIA: ${coletaData.nomeDaColeta}`).toUpperCase(), 14, 20);
        
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.text(`Data Base: ${new Date().toLocaleString('pt-BR')} | Escopo: ${new Set(respostasFiltradas.map(r => r.orgaoOrigem)).size} Órgãos | Amostra Tratada: ${respostasFiltradas.length}`, 14, 26);
        doc.setTextColor(0);

        let yPos = 35;

        // ================= 1. INDICADORES (NÚMEROS) =================
        if (chkInd) {
            const camposNum = dicionario.filter(c => c.tipo === 'numero' || c.tipo === 'numero_abrangente');
            if (camposNum.length > 0) {
                doc.setFont("helvetica", "bold");
                doc.setFontSize(11);
                doc.text("1. MATRIZ DE INDICADORES QUANTITATIVOS", 14, yPos);
                yPos += 5;

                const bodyInd = camposNum.map(c => {
                    const nums = respostasFiltradas.map(r => Number(r.dados?.[c.id]?.resposta)).filter(n => !isNaN(n) && n !== 0);
                    if (nums.length === 0) return [limparTexto(c.label), "0", "0", "0"];
                    const soma = nums.reduce((a, b) => a + b, 0);
                    const media = (soma / nums.length).toFixed(1);
                    const variancia = nums.reduce((acc, n) => acc + Math.pow(n - media, 2), 0) / nums.length;
                    const desvio = Math.sqrt(variancia).toFixed(1);
                    return [limparTexto(c.label), soma.toLocaleString('pt-BR'), media, desvio];
                });

                doc.autoTable({
                    startY: yPos,
                    head: [['Variável Analisada', 'Volume Cumulativo', 'Média Padronizada', 'Desvio Analítico']],
                    body: bodyInd,
                    theme: 'striped',
                    styles: { fontSize: 8, cellPadding: 3, textColor: [40, 40, 40] },
                    headStyles: { fillColor: primaryColor, textColor: 255, fontStyle: 'bold' },
                    alternateRowStyles: { fillColor: [248, 250, 252] }
                });
                yPos = doc.lastAutoTable.finalY + 12;
            }
        }

        // ================= 2. DISTRIBUIÇÃO (CATEGORIAS) =================
        if (chkDist) {
            const camposSel = dicionario.filter(c => ['selecao', 'multipla_escolha', 'booleano'].includes(c.tipo));
            if (camposSel.length > 0) {
                if (yPos > 150) { doc.addPage(); yPos = 20; }
                
                doc.setFont("helvetica", "bold");
                doc.setFontSize(11);
                doc.text("2. DISTRIBUIÇÃO DE VARIÁVEIS CATEGÓRICAS", 14, yPos);
                yPos += 5;

                const bodyDist = [];
                camposSel.forEach(c => {
                    const contagem = {};
                    respostasFiltradas.forEach(r => {
                        const v = r.dados?.[c.id]?.resposta;
                        if (v && v !== '--') contagem[v] = (contagem[v] || 0) + 1;
                    });
                    const total = Object.values(contagem).reduce((a, b) => a + b, 0);
                    const distString = Object.entries(contagem)
                        .sort((a, b) => b[1] - a[1])
                        .map(([k, q]) => `${limparTexto(k)}: ${q} (${((q/total)*100).toFixed(1)}%)`)
                        .join('  |  ');
                    
                    if (total > 0) bodyDist.push([limparTexto(c.label), total.toString(), distString]);
                });

                if (bodyDist.length > 0) {
                    doc.autoTable({
                        startY: yPos,
                        head: [['Dimensão de Análise', 'Amostra Válida', 'Mapeamento de Frequência']],
                        body: bodyDist,
                        theme: 'striped',
                        styles: { fontSize: 8, cellPadding: 3, textColor: [40, 40, 40] },
                        headStyles: { fillColor: primaryColor, textColor: 255, fontStyle: 'bold' },
                        alternateRowStyles: { fillColor: [248, 250, 252] }
                    });
                    yPos = doc.lastAutoTable.finalY + 12;
                }
            }
        }

        // ================= 3. CONSOLIDADO POR ÓRGÃO =================
        if (chkCons) {
            const camposNum = dicionario.filter(c => c.tipo === 'numero' || c.tipo === 'numero_abrangente');
            if (camposNum.length > 0) {
                if (yPos > 150) { doc.addPage(); yPos = 20; }

                doc.setFont("helvetica", "bold");
                doc.setFontSize(11);
                doc.text("3. MATRIZ ESTRUTURAL POR ORIGEM (SOMAS)", 14, yPos);
                yPos += 5;

                // Respeitar os filtros atuais na hora de montar a tabela do relatório geral
                const orgaosParaMostrar = orgao === 'todos' ? [...new Set(respostasFiltradas.map(r => r.orgaoOrigem || 'Desconhecido'))].sort() : [orgao];
                
                const headCons = [['Unidade Operacional', 'Registros', ...camposNum.map(c => limparTexto(c.label))]];
                
                const bodyCons = orgaosParaMostrar.map(org => {
                    const rOrg = respostasFiltradas.filter(r => (r.orgaoOrigem || 'Desconhecido') === org);
                    return [
                        limparTexto(org),
                        rOrg.length.toString(),
                        ...camposNum.map(c => {
                            const sum = rOrg.reduce((a, b) => a + (Number(b.dados?.[c.id]?.resposta) || 0), 0);
                            return sum.toLocaleString('pt-BR');
                        })
                    ];
                });

                let fontSizeMatrix = 8;
                if (headCons[0].length > 8) fontSizeMatrix = 7;
                if (headCons[0].length > 12) fontSizeMatrix = 6;
                if (headCons[0].length > 18) fontSizeMatrix = 5;

                doc.autoTable({
                    startY: yPos,
                    head: headCons,
                    body: bodyCons,
                    theme: 'striped',
                    styles: { fontSize: fontSizeMatrix, cellPadding: 2, textColor: [40, 40, 40] },
                    headStyles: { fillColor: primaryColor, textColor: 255, fontStyle: 'bold' },
                    alternateRowStyles: { fillColor: [248, 250, 252] }
                });
                yPos = doc.lastAutoTable.finalY + 12;
            }
        }

        // ================= 4. HISTÓRICO DETALHADO =================
        if (chkHist) {
            doc.addPage();
            doc.setFont("helvetica", "bold");
            doc.setFontSize(11);
            doc.text("4. LOG INTEGRAL DE REGISTROS", 14, 20);

            const headHist = [["Data do Registro", "Unidade Associada", "Operador", ...dicionario.map(c => limparTexto(c.label))]];
            const bodyHist = respostasFiltradas.map(r => [
                r.timestamp ? new Date(r.timestamp).toLocaleString('pt-BR') : '--',
                limparTexto(r.orgaoOrigem || '--'),
                limparTexto(r.responsavel || '--'),
                ...dicionario.map(c => {
                    const val = r.dados?.[c.id]?.resposta;
                    return val !== undefined && val !== '' ? limparTexto(String(val)) : '--';
                })
            ]);

            let fontSizeHist = 7;
            if (headHist[0].length > 10) fontSizeHist = 6;
            if (headHist[0].length > 15) fontSizeHist = 5;
            if (headHist[0].length > 20) fontSizeHist = 4.5;

            doc.autoTable({
                startY: 25,
                head: headHist,
                body: bodyHist,
                theme: 'grid',
                styles: { fontSize: fontSizeHist, cellPadding: 1.5, textColor: [40, 40, 40] },
                headStyles: { fillColor: [100, 116, 139], textColor: 255, fontStyle: 'bold' },
                didDrawPage: function(data) {
                    const pageCount = doc.internal.getNumberOfPages();
                    doc.setFontSize(7);
                    doc.setTextColor(150);
                    doc.text(`Identificador de Página: ${data.pageNumber} / ${pageCount}`, 14, doc.internal.pageSize.height - 10);
                }
            });
        }

        doc.save(`SIGEP_Corporativo_${limparTexto(coletaData.nomeDaColeta).replace(/\s+/g, '_')}.pdf`);
        showNotification("Processo de PDF concluído e enviado ao browser.", "success");
    },

    async exportarParaExcel() {
        document.getElementById('modal-config-exportacao')?.classList.add('hidden');
        showNotification("Inicializando motor de planilha corporativa...", "info");

        const { coletaData, respostas, dicionario } = window._dadosBiCache || {};
        const { orgao, periodo } = window._filtrosAtuaisBi || { orgao: 'todos', periodo: 'todos' };
        const respostasFiltradas = this._aplicarFiltros(respostas, orgao, periodo);

        if (!respostasFiltradas || respostasFiltradas.length === 0) return showNotification("Ausência de dados no filtro.", "error");

        try {
            // Importação corrigida (XLSX.MJS) 
            const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs');
            const workbook = XLSX.utils.book_new();
            
            // DADOS BRUTOS
            const wsData = [
                [`Data Warehouse - ${limparTexto(coletaData.nomeDaColeta)}`],
                [`Snapshot: ${new Date().toLocaleString('pt-BR')}`],
                [],
                ['Timestamp', 'Unidade', 'Operador', ...dicionario.map(c => limparTexto(c.label))]
            ];
            respostasFiltradas.forEach(r => {
                wsData.push([
                    r.timestamp ? new Date(r.timestamp).toLocaleString('pt-BR') : '--',
                    limparTexto(r.orgaoOrigem || '--'),
                    limparTexto(r.responsavel || '--'),
                    ...dicionario.map(c => limparTexto(r.dados?.[c.id]?.resposta || '--'))
                ]);
            });
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            XLSX.utils.book_append_sheet(workbook, ws, 'Data_Warehouse');

            // CONSOLIDADO
            const camposNum = dicionario.filter(c => c.tipo === 'numero' || c.tipo === 'numero_abrangente');
            if (camposNum.length > 0) {
                const orgaosParaMostrar = orgao === 'todos' ? [...new Set(respostasFiltradas.map(r => r.orgaoOrigem || 'Desconhecido'))] : [orgao];
                const resumoData = [
                    ['MATRIZ ESTRUTURAL DE NEGÓCIO'], [],
                    ['Unidade', 'Transações', ...camposNum.map(c => limparTexto(c.label))]
                ];
                orgaosParaMostrar.forEach(org => {
                    const envios = respostasFiltradas.filter(r => (r.orgaoOrigem || 'Desconhecido') === org);
                    resumoData.push([
                        limparTexto(org),
                        envios.length,
                        ...camposNum.map(c => envios.reduce((acc, r) => acc + (Number(r.dados?.[c.id]?.resposta) || 0), 0))
                    ]);
                });
                const wsResumo = XLSX.utils.aoa_to_sheet(resumoData);
                XLSX.utils.book_append_sheet(workbook, wsResumo, 'Matriz_Consolidada');
            }
            
            const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
            const blob = new Blob([wbout], { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Data_Export_${limparTexto(coletaData.nomeDaColeta).replace(/\s+/g, '_')}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 100);
            
            showNotification("Pacote de dados Excel gerado.", "success");
        } catch (err) {
            console.error(err);
            showNotification("A engine do Excel encontrou uma falha.", "error");
        }
    }
};

window.ColetasBiService = ColetasBiService;
