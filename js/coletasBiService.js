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
// FUNÇÃO AUXILIAR: CACHE DE DADOS (IndexedDB / localStorage)
// ============================================================
const CACHE_KEY = 'sigep_bi_cache';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

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
                <div class="w-10 h-10 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mx-auto"></div>
                <p class="text-emerald-700 font-bold">Processando motor analítico de BI...</p>
            </div>
        `;

        try {
            // Tenta carregar do cache
            let dadosCache = await getCachedData(coletaId);
            let coletaData, dicionario, respostas, orgaosUnicos;

            if (dadosCache) {
                ({ coletaData, dicionario, respostas, orgaosUnicos } = dadosCache);
                window._dadosBiCache = { coletaData, dicionario, respostas, orgaosUnicos, coletaId };
                this.renderizarPainelBiCompleto('todos', 'todos');
                showNotification("📦 Dados carregados do cache!", "info");
                return;
            }

            // Carrega do Firebase
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
            
            // Salva no cache
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

        // Aplica filtros
        let respostasFiltradas = this._aplicarFiltros(respostas, orgaoFiltro, periodoFiltro);

        let html = `
            <div class="space-y-6 animate-fade-in bg-slate-50 p-4 sm:p-6 rounded-3xl border border-slate-200">
                
                <!-- BARRA DE FERRAMENTAS ROBUSTA -->
                <div class="bg-white p-6 rounded-2xl border shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4">
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
                            <option value="todos" ${periodoFiltro === 'todos' ? 'selected' : ''}>Todos os períodos</option>
                            <option value="hoje" ${periodoFiltro === 'hoje' ? 'selected' : ''}>Hoje</option>
                            <option value="semana" ${periodoFiltro === 'semana' ? 'selected' : ''}>Última semana</option>
                            <option value="mes" ${periodoFiltro === 'mes' ? 'selected' : ''}>Último mês</option>
                        </select>
                    </div>

                    <div>
                        <label class="text-[10px] font-bold text-slate-400 uppercase mb-1 block">⭐ Favoritos:</label>
                        <select id="filtro-favoritos" onchange="ColetasBiService.carregarFiltroFavorito(this.value)" class="w-full p-3 border rounded-xl font-bold text-sm bg-white outline-none">
                            <option value="">Selecione um favorito...</option>
                            ${this._carregarFiltrosFavoritos().map(f => `<option value="${f.nome}">⭐ ${f.nome}</option>`).join('')}
                        </select>
                    </div>
                    
                    <div class="flex gap-2 items-end">
                        <button onclick="ColetasBiService.salvarFiltroComoFavorito()" class="bg-amber-500 hover:bg-amber-600 text-white font-bold p-2 rounded-xl transition text-xs flex-1 h-[42px]">
                            ⭐ Salvar
                        </button>
                        <button onclick="ColetasBiService.abrirModalExportacao()" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold p-3 rounded-xl shadow-lg transition text-sm h-[42px]">
                            ⚙️ Exportar
                        </button>
                        <button onclick="window.print()" class="bg-slate-800 hover:bg-slate-900 text-white font-bold p-3 rounded-xl transition text-sm h-[42px]">
                            🖨️
                        </button>
                        <button onclick="ColetasBiService.gerarInsights()" class="bg-purple-600 hover:bg-purple-700 text-white font-bold p-3 rounded-xl transition text-sm h-[42px]" title="Insights Automáticos">
                            💡
                        </button>
                    </div>
                </div>
        `;

        // COMPARAÇÃO ENTRE PERÍODOS (se filtrado)
        if (periodoFiltro !== 'todos' && respostasFiltradas.length > 0) {
            const variacao = this._calcularVariacaoPeriodo(respostas, periodoFiltro);
            html += `
                <div class="bg-amber-50 p-4 rounded-2xl border border-amber-200">
                    <p class="text-xs font-bold text-amber-700">📊 Comparação com período anterior</p>
                    <div class="grid grid-cols-3 gap-4 mt-2">
                        <div>
                            <span class="text-xs text-slate-500">Período atual</span>
                            <p class="text-lg font-black text-indigo-600">${respostasFiltradas.length} envios</p>
                        </div>
                        <div>
                            <span class="text-xs text-slate-500">Período anterior</span>
                            <p class="text-lg font-black text-slate-600">${variacao.anterior} envios</p>
                        </div>
                        <div>
                            <span class="text-xs text-slate-500">Variação</span>
                            <p class="text-lg font-black ${variacao.percentual >= 0 ? 'text-emerald-600' : 'text-red-600'}">
                                ${variacao.percentual > 0 ? '↑' : variacao.percentual < 0 ? '↓' : '→'} ${Math.abs(variacao.percentual)}%
                            </p>
                        </div>
                    </div>
                </div>
            `;
        }

        // INDICADORES GERAIS
        html += `
                <div class="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm card-hover">
                        <p class="text-[10px] uppercase font-black text-slate-400">Total de Envios</p>
                        <p class="text-3xl font-black text-indigo-600">${respostasFiltradas.length}</p>
                    </div>
                    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm card-hover">
                        <p class="text-[10px] uppercase font-black text-slate-400">Órgãos Participantes</p>
                        <p class="text-3xl font-black text-emerald-600">${new Set(respostasFiltradas.map(r => r.orgaoOrigem)).size}</p>
                    </div>
                    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm card-hover">
                        <p class="text-[10px] uppercase font-black text-slate-400">Último Envio</p>
                        <p class="text-sm font-black text-slate-700">${respostasFiltradas.length > 0 ? new Date(respostasFiltradas[0].timestamp).toLocaleDateString('pt-BR') : '--'}</p>
                    </div>
                    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm card-hover">
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
        // 1. CARDS DE ESTATÍSTICAS HÍBRIDAS
        // ============================================================
        let kpiHtml = `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">`;
        let frequenciasHtml = `<div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">`;
        let temFrequenciaNumerica = false;

        dicionario.forEach(campo => {
            const valores = respostasFiltradas
                .map(r => r.dados?.[campo.id]?.resposta)
                .filter(v => v !== undefined && v !== null && v !== '--');

            if (valores.length === 0) return;

            // Campo numérico ou idade
            if (campo.tipo === 'numero' || campo.label.toLowerCase().includes('idade')) {
                const numeros = valores.map(Number);
                const soma = numeros.reduce((a, b) => a + b, 0);
                const media = (soma / numeros.length).toFixed(1);
                const variancia = numeros.reduce((acc, n) => acc + Math.pow(n - media, 2), 0) / numeros.length;
                const desvioPadrao = Math.sqrt(variancia).toFixed(1);

                kpiHtml += `
                    <div onclick="ColetasBiService.detalharPorOrgao('${campo.id}')" class="bg-white p-5 rounded-2xl border border-indigo-100 shadow-sm cursor-pointer hover:border-indigo-500 hover:shadow-md transition-all relative overflow-hidden group card-hover">
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

                // Frequência numérica
                const contagemNumerica = {};
                numeros.forEach(num => {
                    contagemNumerica[num] = (contagemNumerica[num] || 0) + 1;
                });

                const chavesOrdenadas = Object.keys(contagemNumerica).sort((a, b) => Number(a) - Number(b));

                if (chavesOrdenadas.length > 0 && chavesOrdenadas.length <= 20) {
                    temFrequenciaNumerica = true;
                    const canvasId = `grafico_${campo.id}`;
                    frequenciasHtml += `
                        <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                            <p class="text-xs font-black text-slate-800 uppercase border-b pb-2 mb-3">📊 Frequência por ${escapeHTML(campo.label)}</p>
                            <canvas id="${canvasId}" height="150"></canvas>
                            <div class="space-y-2 max-h-44 overflow-y-auto pr-1 mt-3">
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
                    
                    // Renderizar gráfico
                    setTimeout(() => {
                        this._renderizarGrafico(canvasId, contagemNumerica);
                    }, 100);
                }
            }
        });

        html += kpiHtml + `</div>`;

        // ============================================================
        // 2. ALTERNATIVAS (Seleção / Booleano / Múltipla Escolha)
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

                const canvasId = `grafico_cat_${campo.id}`;
                html += `
                    <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <p class="text-xs font-black text-slate-800 uppercase border-b pb-2 mb-3">🧩 ${escapeHTML(campo.label)}</p>
                        ${Object.keys(contagem).length > 0 ? `<canvas id="${canvasId}" height="120"></canvas>` : ''}
                        <div class="space-y-3 max-h-44 overflow-y-auto pr-1 mt-3">
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

                // Renderizar gráfico de barras
                if (Object.keys(contagem).length > 0) {
                    setTimeout(() => {
                        this._renderizarGrafico(canvasId, contagem, 'bar');
                    }, 100);
                }
            });

            if (temFrequenciaNumerica) html += frequenciasHtml;
            html += `</div>`;
        }

        // DIV DE DETALHES
        html += `
            <div id="bi-detalhes-dinamicos" class="hidden bg-white p-6 rounded-2xl border shadow-sm"></div>
        `;

        // ============================================================
        // 3. TABELA CONSOLIDADA POR ÓRGÃO
        // ============================================================
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

        // ============================================================
        // 4. HISTÓRICO DETALHADO
        // ============================================================
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

        html += `</tbody></table></div></div>`;

        // BOTÃO DE AUTO-REFRESH (oculto)
        html += `
            <div class="flex justify-end gap-2">
                <button onclick="ColetasBiService.iniciarAutoRefresh()" class="text-xs bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold px-3 py-1.5 rounded-lg transition">
                    🔄 Auto-Refresh (5min)
                </button>
                <button onclick="ColetasBiService.pararAutoRefresh()" class="text-xs bg-red-100 hover:bg-red-200 text-red-600 font-bold px-3 py-1.5 rounded-lg transition hidden" id="btn-parar-refresh">
                    ⏹ Parar Refresh
                </button>
            </div>
        </div>`;

        container.innerHTML = html;
        container.scrollIntoView({ behavior: 'smooth' });

        // Carrega gráficos já renderizados
        this._renderizarTodosGraficos();
    },

    // ============================================================
    // MÉTODOS AUXILIARES DE FILTRO
    // ============================================================
    _aplicarFiltros(respostas, orgaoFiltro, periodoFiltro) {
        let filtradas = [...respostas];

        // Filtro por órgão
        if (orgaoFiltro !== 'todos') {
            filtradas = filtradas.filter(r => r.orgaoOrigem === orgaoFiltro);
        }

        // Filtro por período
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
        const nome = prompt('⭐ Nome do filtro favorito:', `Filtro ${new Date().toLocaleDateString()}`);
        
        if (nome) {
            const favoritos = this._carregarFiltrosFavoritos();
            favoritos.push({ nome, orgao, periodo });
            localStorage.setItem('sigep_filtros_favoritos', JSON.stringify(favoritos));
            this._atualizarSelectFavoritos();
            showNotification(`⭐ Filtro "${nome}" salvo!`, "success");
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
            <option value="">Selecione um favorito...</option>
            ${favoritos.map(f => `<option value="${f.nome}" ${f.nome === valorAtual ? 'selected' : ''}>⭐ ${f.nome}</option>`).join('')}
        `;
    },

    // ============================================================
    // GRÁFICOS COM CHART.JS
    // ============================================================
    _renderizarGrafico(canvasId, dados, tipo = 'bar') {
        const canvas = document.getElementById(canvasId);
        if (!canvas || typeof Chart === 'undefined') return;

        const ctx = canvas.getContext('2d');
        const labels = Object.keys(dados);
        const values = Object.values(dados);

        // Destroi gráfico anterior se existir
        if (canvas._chart) {
            canvas._chart.destroy();
        }

        const cores = [
            'rgba(99, 102, 241, 0.8)',
            'rgba(16, 185, 129, 0.8)',
            'rgba(245, 158, 11, 0.8)',
            'rgba(239, 68, 68, 0.8)',
            'rgba(139, 92, 246, 0.8)',
            'rgba(236, 72, 153, 0.8)'
        ];

        canvas._chart = new Chart(ctx, {
            type: tipo === 'bar' ? 'bar' : 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Frequência',
                    data: values,
                    backgroundColor: cores.slice(0, labels.length),
                    borderColor: cores.slice(0, labels.length).map(c => c.replace('0.8', '1')),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { font: { size: 9 } }
                    },
                    x: {
                        ticks: { 
                            font: { size: 8 },
                            maxRotation: 45,
                            minRotation: 0
                        }
                    }
                }
            }
        });
    },

    _renderizarTodosGraficos() {
        // Os gráficos são renderizados individualmente após cada card
    },

    // ============================================================
    // AUTO-REFRESH
    // ============================================================
    iniciarAutoRefresh(intervalo = 300000) { // 5 minutos
        if (this._refreshInterval) clearInterval(this._refreshInterval);
        
        this._refreshInterval = setInterval(() => {
            const coletaId = window._dadosBiCache?.coletaId;
            if (coletaId) {
                this.abrirResultados(window.app.db, coletaId);
                showNotification("🔄 Dados atualizados automaticamente!", "info");
            }
        }, intervalo);

        document.getElementById('btn-parar-refresh')?.classList.remove('hidden');
        showNotification("🔄 Auto-Refresh ativado (5 minutos)", "info");
    },

    pararAutoRefresh() {
        if (this._refreshInterval) {
            clearInterval(this._refreshInterval);
            this._refreshInterval = null;
        }
        document.getElementById('btn-parar-refresh')?.classList.add('hidden');
        showNotification("⏹ Auto-Refresh desativado", "info");
    },

    // ============================================================
    // INSIGHTS AUTOMÁTICOS
    // ============================================================
    gerarInsights() {
        const { respostas, dicionario } = window._dadosBiCache || {};
        if (!respostas || respostas.length === 0) {
            showNotification("Sem dados para gerar insights.", "error");
            return;
        }

        let insights = [];
        const totalRespostas = respostas.length;
        const orgaos = new Set(respostas.map(r => r.orgaoOrigem));

        // Análise de tendências numéricas
        dicionario.forEach(campo => {
            if (campo.tipo === 'numero' || campo.label.toLowerCase().includes('idade')) {
                const valores = respostas
                    .map(r => Number(r.dados?.[campo.id]?.resposta))
                    .filter(n => !isNaN(n) && n > 0);
                
                if (valores.length > 0) {
                    const soma = valores.reduce((a, b) => a + b, 0);
                    const media = soma / valores.length;
                    const max = Math.max(...valores);
                    const min = Math.min(...valores);
                    
                    if (max > media * 2) {
                        insights.push(`🔴 ${campo.label}: Valor máximo (${max}) é 2x maior que a média (${media.toFixed(1)})`);
                    }
                    if (min < media * 0.3 && min > 0) {
                        insights.push(`🟢 ${campo.label}: Valor mínimo (${min}) é 70% menor que a média (${media.toFixed(1)})`);
                    }
                    if (valores.length === totalRespostas) {
                        insights.push(`✅ ${campo.label}: Todos os ${totalRespostas} órgãos responderam`);
                    }
                }
            }

            // Análise de alternativas
            if (['selecao', 'multipla_escolha', 'booleano'].includes(campo.tipo)) {
                const contagem = {};
                respostas.forEach(r => {
                    const val = r.dados?.[campo.id]?.resposta;
                    if (val && val !== '--') contagem[val] = (contagem[val] || 0) + 1;
                });

                const entries = Object.entries(contagem);
                if (entries.length > 0) {
                    const max = entries.reduce((a, b) => a[1] > b[1] ? a : b);
                    const min = entries.reduce((a, b) => a[1] < b[1] ? a : b);
                    
                    if (max[1] > totalRespostas * 0.5) {
                        insights.push(`📊 ${campo.label}: "${max[0]}" foi escolhido por ${Math.round(max[1]/totalRespostas*100)}% dos órgãos`);
                    }
                    if (min[1] < totalRespostas * 0.1 && entries.length > 1) {
                        insights.push(`⚠️ ${campo.label}: "${min[0]}" teve apenas ${min[1]} escolha(s) (${Math.round(min[1]/totalRespostas*100)}%)`);
                    }
                }
            }
        });

        // Insights gerais
        if (orgaos.size > 1) {
            insights.push(`🏢 ${orgaos.size} órgãos participaram da coleta`);
        }
        if (totalRespostas < 3) {
            insights.push(`📉 Poucos registros (${totalRespostas}). Considere ampliar a divulgação.`);
        }

        if (insights.length === 0) {
            insights.push("✅ Nenhum insight relevante encontrado. Os dados estão equilibrados.");
        }

        this._mostrarModalInsights(insights);
    },

    _mostrarModalInsights(insights) {
        const modal = document.createElement('div');
        modal.id = 'modal-insights';
        modal.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-fade-in';
        modal.innerHTML = `
            <div class="bg-white rounded-3xl max-w-lg w-full p-8 shadow-2xl border border-slate-200">
                <div class="flex justify-between items-center mb-6">
                    <h3 class="text-xl font-black text-slate-800">💡 Insights Automáticos</h3>
                    <button onclick="this.closest('#modal-insights').remove()" class="text-slate-400 hover:text-slate-600 text-2xl transition">×</button>
                </div>
                
                <div class="space-y-3 max-h-96 overflow-y-auto pr-2">
                    ${insights.map((insight, i) => `
                        <div class="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-start gap-3">
                            <span class="text-xl">${insight.match(/^.{1,2}/)?.[0] || '📌'}</span>
                            <p class="text-sm text-slate-700 font-medium">${insight.substring(2)}</p>
                        </div>
                    `).join('')}
                </div>
                
                <div class="mt-6 flex gap-3">
                    <button onclick="this.closest('#modal-insights').remove()" class="w-full bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-3 rounded-xl transition">
                        Fechar
                    </button>
                    <button onclick="ColetasBiService.exportarInsights()" class="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-xl transition shadow-lg">
                        📄 Exportar Insights
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },

    exportarInsights() {
        const modal = document.getElementById('modal-insights');
        if (modal) {
            const insights = modal.querySelectorAll('.p-4');
            let texto = `INSIGHTS - ${new Date().toLocaleString()}\n${'='.repeat(50)}\n\n`;
            insights.forEach(el => {
                texto += el.textContent.trim() + '\n';
            });
            
            // Criar blob e download
            const blob = new Blob([texto], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `insights_${new Date().toISOString().slice(0,10)}.txt`;
            a.click();
            URL.revokeObjectURL(url);
            
            showNotification("📄 Insights exportados!", "success");
        }
    },

    // ============================================================
    // DETALHAR POR ÓRGÃO (Cards Clicáveis)
    // ============================================================
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
    // EXPORTAÇÃO PARA EXCEL
    // ============================================================
    async exportarParaExcel() {
        const { coletaData, respostas, dicionario } = window._dadosBiCache || {};
        if (!respostas || respostas.length === 0) {
            showNotification("Sem dados para exportar.", "error");
            return;
        }

        try {
            const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js');
            
            const workbook = XLSX.utils.book_new();
            
            // Dados da planilha
            const wsData = [
                [`Relatório BI - ${coletaData.nomeDaColeta}`],
                [`Gerado em: ${new Date().toLocaleString()}`],
                [],
                ['Data/Hora', 'Órgão', 'Responsável', ...dicionario.map(c => c.label)]
            ];
            
            respostas.forEach(r => {
                wsData.push([
                    r.timestamp ? new Date(r.timestamp).toLocaleString() : '--',
                    r.orgaoOrigem || '--',
                    r.responsavel || '--',
                    ...dicionario.map(c => r.dados?.[c.id]?.resposta || '--')
                ]);
            });
            
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            
            // Ajustar largura das colunas
            const colWidths = wsData[0].map((_, idx) => ({
                wch: Math.max(...wsData.map(row => String(row[idx] || '').length)) + 2
            }));
            ws['!cols'] = colWidths;
            
            XLSX.utils.book_append_sheet(workbook, ws, 'Dados');
            
            // Criar segunda planilha com estatísticas
            const statsData = [
                ['ESTATÍSTICAS POR CAMPO'],
                [],
                ['Campo', 'Tipo', 'Total', 'Média', 'Mínimo', 'Máximo']
            ];
            
            dicionario.forEach(campo => {
                if (campo.tipo === 'numero') {
                    const valores = respostas
                        .map(r => Number(r.dados?.[campo.id]?.resposta))
                        .filter(n => !isNaN(n) && n > 0);
                    
                    if (valores.length > 0) {
                        const soma = valores.reduce((a, b) => a + b, 0);
                        const media = soma / valores.length;
                        statsData.push([
                            campo.label,
                            campo.tipo,
                            soma,
                            media.toFixed(2),
                            Math.min(...valores),
                            Math.max(...valores)
                        ]);
                    }
                }
            });
            
            const wsStats = XLSX.utils.aoa_to_sheet(statsData);
            XLSX.utils.book_append_sheet(workbook, wsStats, 'Estatísticas');
            
            // Gerar arquivo
            const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
            const blob = new Blob([wbout], { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Relatorio_BI_${coletaData.nomeDaColeta.replace(/\s+/g, '_')}.xlsx`;
            a.click();
            URL.revokeObjectURL(url);
            
            showNotification("📊 Relatório Excel gerado com sucesso!", "success");
        } catch (err) {
            console.error(err);
            showNotification("Erro ao gerar Excel. Verifique a conexão.", "error");
        }
    },

    // ============================================================
    // ABRIR MODAL DE EXPORTAÇÃO
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
                    <h3 class="text-xl font-black text-slate-800">⚙️ Exportar Relatório</h3>
                    <button onclick="ColetasBiService.fecharModalExportacao()" class="text-slate-400 hover:text-slate-600 text-2xl transition">×</button>
                </div>
                
                <div class="space-y-4">
                    <div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <p class="text-xs font-bold text-slate-400 uppercase mb-3">Selecione o formato:</p>
                        
                        <div class="grid grid-cols-2 gap-3">
                            <button onclick="ColetasBiService.gerarPDF()" class="p-4 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold transition shadow-lg flex items-center justify-center gap-2">
                                📄 PDF
                            </button>
                            <button onclick="ColetasBiService.exportarParaExcel()" class="p-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold transition shadow-lg flex items-center justify-center gap-2">
                                📊 Excel
                            </button>
                        </div>
                    </div>
                    
                    <div class="bg-amber-50 p-4 rounded-xl border border-amber-200">
                        <p class="text-xs text-amber-700 font-medium">💡 Escolha o formato desejado para exportar os dados.</p>
                    </div>
                    
                    <button onclick="ColetasBiService.fecharModalExportacao()" class="w-full p-3 border border-slate-300 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition">
                        Cancelar
                    </button>
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
    // EXPORTAÇÃO PARA PDF (Versão Final)
    // ============================================================
    async gerarPDF() {
        this.fecharModalExportacao();
        await this.executarExportacaoCustomizada();
    },

    async executarExportacaoCustomizada() {
        const { coletaData, respostas, dicionario } = window._dadosBiCache || {};
        if (!respostas || respostas.length === 0) {
            showNotification("Sem dados para exportar.", "error");
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

        // ===== SEÇÃO 1: ESTATÍSTICAS =====
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
                headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255] }
            });
            yPos = doc.lastAutoTable.finalY + 12;
        }

        // ===== SEÇÃO 2: FREQUÊNCIA =====
        if (yPos > 170) { doc.addPage(); yPos = 20; }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text("2. FREQUÊNCIA DE RESPOSTAS", margemEsquerda, yPos);
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
                head: [['Pergunta', 'Alternativa / Valor', 'Quantidade', 'Porcentagem']],
                body: dadosFrequencia,
                styles: { fontSize: 8, cellPadding: 2 },
                headStyles: { fillColor: [99, 102, 241], textColor: [255, 255, 255] }
            });
            yPos = doc.lastAutoTable.finalY + 12;
        }

        // ===== SEÇÃO 3: TABELA POR ÓRGÃO =====
        if (yPos > 170) { doc.addPage(); yPos = 20; }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text("3. TABELA CONSOLIDADA POR ÓRGÃO", margemEsquerda, yPos);
        yPos += 7;

        const orgaos = [...new Set(respostas.map(r => r.orgaoOrigem || 'Desconhecido'))];
        
        const head = [['Órgão', 'Envios', ...camposNumericos.map(c => limparTexto(c.label))]];
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

        // ===== SEÇÃO 4: HISTÓRICO =====
        doc.addPage();
        
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text("4. HISTÓRICO DETALHADO", margemEsquerda, 18);
        
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.text(`Total de ${respostas.length} registros.`, margemEsquerda, 25);

        const headHist = ["Data/Hora", "Órgão", "Responsável", ...dicionario.map(c => limparTexto(c.label))];
        const bodyHist = respostas.slice(0, 200).map(r => [
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
            head: [headHist],
            body: bodyHist,
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

        doc.save(`Relatorio_Analitico_${coletaData.nomeDaColeta.replace(/\s+/g, '_')}.pdf`);
        showNotification("📄 Relatório PDF gerado com sucesso!", "success");
    }
};

window.ColetasBiService = ColetasBiService;
