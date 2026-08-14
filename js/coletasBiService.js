// js/coletasBiService.js - Serviço de BI e Relatórios Analíticos
import { showNotification, escapeHTML } from './utils.js';

// ============================================================
// FUNÇÃO AUXILIAR: LIMPAR CARACTERES ESPECIAIS
// ============================================================
function limparTexto(texto) {
    if (typeof texto !== 'string') return texto;
    return texto
        .normalize('NFD').replace(/[\u0300-\u036f]/g, "") // Remove acentos
        .replace(/[ºª°]/g, '.') // Substitui indicadores ordinais
        .replace(/[&]/g, 'e') // Substitui & por e
        .replace(/[^\x20-\x7E]/g, '') // Remove lixo oculto
        .trim();
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
                <p class="text-slate-600 font-bold">Processando motor analítico...</p>
            </div>
        `;

        try {
            let dadosCache = await getCachedData(coletaId);
            let coletaData, dicionario, respostas, orgaosUnicos;

            if (dadosCache) {
                ({ coletaData, dicionario, respostas, orgaosUnicos } = dadosCache);
                window._dadosBiCache = { coletaData, dicionario, respostas, orgaosUnicos, coletaId };
                this.renderizarPainelBiCompleto('todos', 'todos');
                return;
            }

            const { doc, getDoc, collection, getDocs, query, where } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
            
            const coletaSnap = await getDoc(doc(db, "formularios_coleta", coletaId));
            if (!coletaSnap.exists()) {
                container.innerHTML = `<p class="text-red-500 font-bold p-6">Coleta não encontrada no banco de dados.</p>`;
                return;
            }
            coletaData = coletaSnap.data();
            dicionario = coletaData.dicionarioDeCampos || [];

            const q = query(collection(db, "respostas_coleta"), where("coletaId", "==", coletaId));
            const respostasSnap = await getDocs(q);

            respostas = [];
            respostasSnap.forEach(rDoc => respostas.push({ id: rDoc.id, ...rDoc.data() }));

            orgaosUnicos = [...new Set(respostas.map(r => r.orgaoOrigem || 'Desconhecido'))].sort();

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

        // Salva os filtros globais na janela para as exportações individuais usarem
        window._filtrosAtuaisBi = { orgao: orgaoFiltro, periodo: periodoFiltro };

        let respostasFiltradas = this._aplicarFiltros(respostas, orgaoFiltro, periodoFiltro);

        let html = `
            <div class="space-y-6 animate-fade-in bg-slate-50 p-4 sm:p-6 rounded-3xl border border-slate-200">
                
                <!-- BARRA DE FERRAMENTAS PROFISSIONAL -->
                <div class="bg-white p-5 rounded-2xl border shadow-sm grid grid-cols-1 lg:grid-cols-4 gap-4 items-end">
                    
                    <div class="w-full">
                        <label class="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Filtrar por Órgão:</label>
                        <select id="filtro-orgao-bi" onchange="ColetasBiService.renderizarPainelBiCompleto(this.value, document.getElementById('filtro-periodo-bi').value)" class="w-full p-2.5 border border-slate-300 rounded-lg font-medium text-sm text-slate-700 bg-white outline-none focus:border-blue-500">
                            <option value="todos">Todos os Órgãos (${respostas.length})</option>
                            ${orgaosUnicos.map(o => `<option value="${o}" ${orgaoFiltro === o ? 'selected' : ''}>${o}</option>`).join('')}
                        </select>
                    </div>
                    
                    <div class="w-full">
                        <label class="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Período:</label>
                        <select id="filtro-periodo-bi" onchange="ColetasBiService.renderizarPainelBiCompleto(document.getElementById('filtro-orgao-bi').value, this.value)" class="w-full p-2.5 border border-slate-300 rounded-lg font-medium text-sm text-slate-700 bg-white outline-none focus:border-blue-500">
                            <option value="todos" ${periodoFiltro === 'todos' ? 'selected' : ''}>Todo o Histórico</option>
                            <option value="hoje" ${periodoFiltro === 'hoje' ? 'selected' : ''}>Apenas Hoje</option>
                            <option value="semana" ${periodoFiltro === 'semana' ? 'selected' : ''}>Últimos 7 dias</option>
                            <option value="mes" ${periodoFiltro === 'mes' ? 'selected' : ''}>Últimos 30 dias</option>
                        </select>
                    </div>

                    <div class="w-full">
                        <label class="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Favoritos Salvos:</label>
                        <select id="filtro-favoritos" onchange="ColetasBiService.carregarFiltroFavorito(this.value)" class="w-full p-2.5 border border-slate-300 rounded-lg font-medium text-sm text-slate-700 bg-white outline-none focus:border-blue-500">
                            <option value="">Selecione uma visão...</option>
                            ${this._carregarFiltrosFavoritos().map(f => `<option value="${f.nome}">${f.nome}</option>`).join('')}
                        </select>
                    </div>
                    
                    <div class="flex flex-wrap gap-2 w-full lg:justify-end mt-2 lg:mt-0">
                        <button onclick="ColetasBiService.salvarFiltroComoFavorito()" class="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 font-bold px-4 py-2.5 rounded-lg transition text-xs flex-1 text-center">
                            Salvar Filtro
                        </button>
                        <button onclick="ColetasBiService.abrirModalExportacao()" class="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-lg shadow transition text-xs flex-1 text-center">
                            Exportação Geral
                        </button>
                        <button onclick="window.print()" class="bg-slate-800 hover:bg-slate-900 text-white font-bold px-4 py-2.5 rounded-lg transition text-xs">
                            Imprimir Painel
                        </button>
                    </div>
                </div>
        `;

        // RESUMO GERAL
        html += `
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <p class="text-[10px] uppercase font-bold text-slate-400">Total de Envios</p>
                        <p class="text-2xl font-black text-slate-800">${respostasFiltradas.length}</p>
                    </div>
                    <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <p class="text-[10px] uppercase font-bold text-slate-400">Órgãos Envolvidos</p>
                        <p class="text-2xl font-black text-slate-800">${new Set(respostasFiltradas.map(r => r.orgaoOrigem)).size}</p>
                    </div>
                    <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <p class="text-[10px] uppercase font-bold text-slate-400">Última Atualização</p>
                        <p class="text-sm mt-1 font-black text-slate-800">${respostasFiltradas.length > 0 ? new Date(respostasFiltradas[0].timestamp).toLocaleDateString('pt-BR') : '--'}</p>
                    </div>
                    <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <p class="text-[10px] uppercase font-bold text-slate-400">Média de Envios / Órgão</p>
                        <p class="text-2xl font-black text-slate-800">${respostasFiltradas.length > 0 && orgaosUnicos.length > 0 ? (respostasFiltradas.length / orgaosUnicos.length).toFixed(1) : '0'}</p>
                    </div>
                </div>
        `;

        // ============================================================
        // CARDS DE DETALHAMENTO DAS PERGUNTAS
        // ============================================================
        html += `
            <div>
                <h4 class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 border-b border-slate-200 pb-2">Métricas Individuais</h4>
                <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        `;

        dicionario.forEach(campo => {
            const valores = respostasFiltradas
                .map(r => r.dados?.[campo.id]?.resposta)
                .filter(v => v !== undefined && v !== null && v !== '' && v !== '--');

            const metricas = campo.metricasBi || this._getMetricasPadrao(campo.tipo);

            // NUMÉRICOS
            if (campo.tipo === 'numero' || campo.tipo === 'numero_abrangente') {
                const numeros = valores.map(Number).filter(n => !isNaN(n));
                if (numeros.length === 0) {
                    html += this._renderCardSemDados(campo);
                    return;
                }

                const soma = numeros.reduce((a, b) => a + b, 0);
                const media = (soma / numeros.length).toFixed(1);
                const desvioPadrao = Math.sqrt(numeros.reduce((acc, n) => acc + Math.pow(n - media, 2), 0) / numeros.length).toFixed(1);

                let metricasHtml = '';
                if (metricas.includes('soma')) metricasHtml += `<div class="bg-blue-50 p-2 rounded-lg text-center"><p class="text-lg font-black text-blue-700">${soma.toLocaleString('pt-BR')}</p><p class="text-[9px] font-bold text-blue-500 uppercase">Soma</p></div>`;
                if (metricas.includes('media')) metricasHtml += `<div class="bg-slate-50 p-2 rounded-lg text-center border border-slate-100"><p class="text-lg font-black text-slate-700">${media}</p><p class="text-[9px] font-bold text-slate-500 uppercase">Média</p></div>`;
                if (metricas.includes('desvio')) metricasHtml += `<div class="bg-slate-50 p-2 rounded-lg text-center border border-slate-100"><p class="text-lg font-black text-slate-700">${desvioPadrao}</p><p class="text-[9px] font-bold text-slate-500 uppercase">Desvio P.</p></div>`;

                html += `
                    <div onclick="ColetasBiService.detalharPorOrgao('${campo.id}')" class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm cursor-pointer hover:border-blue-400 transition relative group">
                        <div class="absolute top-0 left-0 w-1 h-full bg-blue-500 opacity-0 group-hover:opacity-100 transition"></div>
                        <p class="text-[11px] font-bold text-slate-500 uppercase tracking-wide truncate pr-4">${escapeHTML(campo.label)}</p>
                        <div class="mt-3 grid grid-cols-2 gap-2">${metricasHtml}</div>
                        <p class="text-[9px] text-slate-400 mt-3 text-right group-hover:text-blue-500">Clique para detalhar</p>
                    </div>
                `;
            }

            // SELEÇÃO
            else if (['selecao', 'multipla_escolha', 'booleano'].includes(campo.tipo)) {
                const contagem = {};
                valores.forEach(val => contagem[val] = (contagem[val] || 0) + 1);
                const total = valores.length;
                
                const distribuicaoHtml = Object.entries(contagem)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3)
                    .map(([key, qtd]) => {
                        const perc = total > 0 ? ((qtd / total) * 100).toFixed(0) : 0;
                        return `<div class="flex justify-between text-xs text-slate-600 border-b border-slate-50 pb-1 mb-1"><span class="truncate pr-2">${escapeHTML(key)}</span><span class="font-bold">${perc}%</span></div>`;
                    }).join('');

                html += `
                    <div onclick="ColetasBiService.detalharPorOrgao('${campo.id}')" class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm cursor-pointer hover:border-emerald-400 transition relative group flex flex-col justify-between">
                        <div class="absolute top-0 left-0 w-1 h-full bg-emerald-500 opacity-0 group-hover:opacity-100 transition"></div>
                        <div>
                            <p class="text-[11px] font-bold text-slate-500 uppercase tracking-wide truncate pr-4 mb-3">${escapeHTML(campo.label)}</p>
                            ${distribuicaoHtml || '<p class="text-xs text-slate-400">Sem dados</p>'}
                        </div>
                        <p class="text-[9px] text-slate-400 mt-3 text-right group-hover:text-emerald-500">Clique para detalhar</p>
                    </div>
                `;
            }

            // TEXTO
            else {
                html += `
                    <div onclick="ColetasBiService.detalharPorOrgao('${campo.id}')" class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm cursor-pointer hover:border-slate-400 transition relative group">
                        <div class="absolute top-0 left-0 w-1 h-full bg-slate-500 opacity-0 group-hover:opacity-100 transition"></div>
                        <p class="text-[11px] font-bold text-slate-500 uppercase tracking-wide truncate pr-4">${escapeHTML(campo.label)}</p>
                        <div class="mt-3">
                            <p class="text-2xl font-black text-slate-700">${valores.length}</p>
                            <p class="text-[9px] font-bold text-slate-400 uppercase">Respostas Registradas</p>
                        </div>
                        <p class="text-[9px] text-slate-400 mt-3 text-right group-hover:text-slate-600">Clique para detalhar</p>
                    </div>
                `;
            }
        });
        html += `</div></div>`;

        // DIV DE DETALHES INJETÁVEL
        html += `<div id="bi-detalhes-dinamicos" class="hidden bg-white p-6 rounded-2xl border border-slate-200 shadow-sm mt-4"></div>`;

        // ============================================================
        // TABELA CONSOLIDADA GERAL
        // ============================================================
        const camposNumericos = dicionario.filter(c => c.tipo === 'numero' || c.tipo === 'numero_abrangente');
        if (camposNumericos.length > 0) {
            html += `
                <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mt-6">
                    <div class="p-4 bg-slate-50 border-b border-slate-200 font-bold text-slate-700 text-sm uppercase flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <span>Tabela Consolidada Analítica</span>
                        <div class="flex gap-2 w-full sm:w-auto">
                            <button onclick="ColetasBiService.exportarTabelaConsolidada('excel')" class="flex-1 sm:flex-none text-xs bg-white border border-slate-300 hover:bg-emerald-50 text-emerald-700 font-bold px-4 py-2 rounded-lg transition shadow-sm">Baixar Excel</button>
                            <button onclick="ColetasBiService.exportarTabelaConsolidada('pdf')" class="flex-1 sm:flex-none text-xs bg-white border border-slate-300 hover:bg-blue-50 text-blue-700 font-bold px-4 py-2 rounded-lg transition shadow-sm">Baixar PDF</button>
                        </div>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-left border-collapse text-sm">
                            <thead class="bg-slate-100 text-slate-600 text-[10px] uppercase tracking-wider border-b border-slate-200">
                                <tr>
                                    <th class="p-3">Órgão Origem</th>
                                    <th class="p-3 text-center">Submissões</th>
            `;
            camposNumericos.forEach(c => html += `<th class="p-3 text-right">${escapeHTML(c.label)}</th>`);
            html += `</tr></thead><tbody class="divide-y divide-slate-100">`;

            const orgaosParaMostrar = orgaoFiltro === 'todos' ? orgaosUnicos : [orgaoFiltro];
            orgaosParaMostrar.forEach(orgao => {
                const enviosDoOrgao = respostasFiltradas.filter(r => (r.orgaoOrigem || 'Desconhecido') === orgao);
                if (enviosDoOrgao.length === 0) return;

                html += `<tr class="hover:bg-slate-50 transition">
                            <td class="p-3 font-semibold text-slate-700 whitespace-nowrap">${escapeHTML(orgao)}</td>
                            <td class="p-3 text-center font-bold text-blue-600">${enviosDoOrgao.length}</td>`;

                camposNumericos.forEach(c => {
                    let somaOrgao = 0;
                    enviosDoOrgao.forEach(r => somaOrgao += Number(r.dados?.[c.id]?.resposta) || 0);
                    html += `<td class="p-3 text-right text-slate-600">${somaOrgao.toLocaleString('pt-BR')}</td>`;
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
                <div class="p-4 bg-slate-50 border-b border-slate-200 font-bold text-slate-700 text-sm uppercase flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <span>Histórico Detalhado de Respostas</span>
                        <span class="text-xs text-slate-500 font-normal ml-2 block sm:inline-block">${respostasFiltradas.length} registros</span>
                    </div>
                    <div class="flex gap-2 w-full sm:w-auto">
                        <button onclick="ColetasBiService.exportarHistorico('excel')" class="flex-1 sm:flex-none text-xs bg-white border border-slate-300 hover:bg-emerald-50 text-emerald-700 font-bold px-4 py-2 rounded-lg transition shadow-sm">Baixar Excel</button>
                        <button onclick="ColetasBiService.exportarHistorico('pdf')" class="flex-1 sm:flex-none text-xs bg-white border border-slate-300 hover:bg-blue-50 text-blue-700 font-bold px-4 py-2 rounded-lg transition shadow-sm">Baixar PDF</button>
                    </div>
                </div>
                <div class="overflow-x-auto max-h-96">
                    <table class="w-full text-left border-collapse text-sm">
                        <thead class="bg-slate-100 text-slate-600 text-[10px] uppercase tracking-wider border-b border-slate-200 sticky top-0">
                            <tr>
                                <th class="p-3">Data / Hora</th>
                                <th class="p-3">Órgão</th>
                                <th class="p-3">Responsável</th>
        `;
        
        dicionario.forEach(c => {
            html += `<th class="p-3">${escapeHTML(c.label)}</th>`;
        });

        html += `</tr></thead><tbody class="divide-y divide-slate-100">`;

        respostasFiltradas.slice(0, 50).forEach(r => {
            const dataFormatada = r.timestamp ? new Date(r.timestamp).toLocaleString('pt-BR') : '--';
            html += `
                <tr class="hover:bg-slate-50 transition">
                    <td class="p-3 text-xs text-slate-500 whitespace-nowrap">${dataFormatada}</td>
                    <td class="p-3 font-semibold text-slate-700">${escapeHTML(r.orgaoOrigem || 'Desconhecido')}</td>
                    <td class="p-3 text-slate-600">${escapeHTML(r.responsavel || '--')}</td>
            `;

            dicionario.forEach(c => {
                const respostaItem = r.dados && r.dados[c.id] ? r.dados[c.id].resposta : '--';
                html += `<td class="p-3 text-slate-700">${escapeHTML(String(respostaItem))}</td>`;
            });

            html += `</tr>`;
        });

        if (respostasFiltradas.length > 50) {
            html += `<tr><td colspan="${dicionario.length + 3}" class="p-3 text-center text-xs text-slate-400 italic bg-slate-50">Exibindo os 50 registros mais recentes na tela. Para ver todos, use os botões de exportação acima.</td></tr>`;
        }

        html += `</tbody></table></div></div>`;

        // AUTO-REFRESH
        html += `
            <div class="flex justify-end gap-3 mt-6">
                <button onclick="ColetasBiService.iniciarAutoRefresh()" class="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold px-4 py-2 rounded-lg text-xs transition">
                    Iniciar Auto-Refresh (5min)
                </button>
                <button onclick="ColetasBiService.pararAutoRefresh()" class="bg-red-50 border border-red-200 hover:bg-red-100 text-red-600 font-bold px-4 py-2 rounded-lg text-xs transition hidden" id="btn-parar-refresh">
                    Parar Auto-Refresh
                </button>
            </div>
        </div>`;

        container.innerHTML = html;
        container.scrollIntoView({ behavior: 'smooth' });
    },

    // ============================================================
    // MÉTODOS AUXILIARES E DETALHAMENTO
    // ============================================================
    _getMetricasPadrao(tipo) {
        if (tipo === 'numero' || tipo === 'numero_abrangente') return ['soma', 'media'];
        if (['selecao', 'multipla_escolha', 'booleano'].includes(tipo)) return ['total', 'distribuicao'];
        return ['total'];
    },

    _renderCardSemDados(campo) {
        return `
            <div class="bg-slate-50 p-5 rounded-xl border border-slate-200 shadow-sm opacity-60">
                <p class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">${escapeHTML(campo.label)}</p>
                <p class="text-2xl font-black text-slate-300 mt-3">--</p>
                <span class="text-[9px] text-slate-400 mt-1 uppercase">Aguardando Dados</span>
            </div>
        `;
    },

    _aplicarFiltros(respostas, orgaoFiltro, periodoFiltro) {
        let filtradas = [...respostas];
        if (orgaoFiltro !== 'todos') filtradas = filtradas.filter(r => r.orgaoOrigem === orgaoFiltro);

        if (periodoFiltro !== 'todos') {
            const agora = new Date();
            let dataLimite = new Date();
            if (periodoFiltro === 'hoje') dataLimite = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
            else if (periodoFiltro === 'semana') dataLimite.setDate(agora.getDate() - 7);
            else if (periodoFiltro === 'mes') dataLimite.setMonth(agora.getMonth() - 1);

            filtradas = filtradas.filter(r => {
                if (!r.timestamp) return false;
                return new Date(r.timestamp) >= dataLimite;
            });
        }
        return filtradas;
    },

    detalharPorOrgao(campoId) {
        const { respostas, dicionario } = window._dadosBiCache || {};
        const campo = dicionario.find(c => c.id === campoId);
        const div = document.getElementById('bi-detalhes-dinamicos');
        
        const agrupado = {};
        respostas.forEach(r => {
            const org = r.orgaoOrigem || 'Desconhecido';
            const val = r.dados?.[campoId]?.resposta;
            if (!agrupado[org]) agrupado[org] = [];
            if (val !== undefined && val !== null && val !== '') agrupado[org].push(val);
        });

        div.classList.remove('hidden');
        
        let conteudoHtml = `<div class="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
                                <h4 class="font-bold text-lg text-slate-700">Detalhes: ${escapeHTML(campo.label)}</h4>
                                <button onclick="document.getElementById('bi-detalhes-dinamicos').classList.add('hidden')" class="text-slate-400 hover:text-red-500 font-bold text-sm transition">FECHAR</button>
                            </div>`;

        if (campo.tipo === 'numero' || campo.tipo === 'numero_abrangente') {
            conteudoHtml += `<div class="grid grid-cols-2 md:grid-cols-4 gap-3">`;
            Object.entries(agrupado).forEach(([org, valores]) => {
                const nums = valores.map(Number).filter(n => !isNaN(n));
                const soma = nums.reduce((a, b) => a + b, 0);
                if (soma > 0) {
                    conteudoHtml += `
                        <div class="p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <p class="text-[10px] uppercase font-bold text-slate-500 truncate" title="${escapeHTML(org)}">${escapeHTML(org)}</p>
                            <p class="text-xl font-black text-blue-600 mt-1">${soma.toLocaleString('pt-BR')}</p>
                        </div>
                    `;
                }
            });
            conteudoHtml += `</div>`;
        } else {
            conteudoHtml += `<div class="grid grid-cols-1 md:grid-cols-2 gap-4">`;
            Object.entries(agrupado).forEach(([org, valores]) => {
                if (valores.length > 0) {
                    const exibicao = [...new Set(valores)].slice(0, 5).map(v => escapeHTML(String(v))).join(', ');
                    conteudoHtml += `
                        <div class="p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <p class="text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200 pb-1 mb-2">${escapeHTML(org)}</p>
                            <p class="text-xs text-slate-700 leading-relaxed">${exibicao}${valores.length > 5 ? '...' : ''}</p>
                        </div>
                    `;
                }
            });
            conteudoHtml += `</div>`;
        }
        
        div.innerHTML = conteudoHtml;
        div.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },

    // ============================================================
    // FAVORITOS
    // ============================================================
    _carregarFiltrosFavoritos() {
        try { return JSON.parse(localStorage.getItem('sigep_filtros_favoritos') || '[]'); } catch { return []; }
    },

    salvarFiltroComoFavorito() {
        const orgao = document.getElementById('filtro-orgao-bi')?.value || 'todos';
        const periodo = document.getElementById('filtro-periodo-bi')?.value || 'todos';
        const nome = prompt('Nome para identificar esta visão:', `Visão ${new Date().toLocaleDateString()}`);
        if (nome) {
            const favoritos = this._carregarFiltrosFavoritos();
            favoritos.push({ nome: limparTexto(nome), orgao, periodo });
            localStorage.setItem('sigep_filtros_favoritos', JSON.stringify(favoritos));
            this.renderizarPainelBiCompleto(orgao, periodo);
            showNotification(`Filtro salvo com sucesso!`, "success");
        }
    },

    carregarFiltroFavorito(nome) {
        if (!nome) return;
        const filtro = this._carregarFiltrosFavoritos().find(f => f.nome === nome);
        if (filtro) {
            document.getElementById('filtro-orgao-bi').value = filtro.orgao;
            document.getElementById('filtro-periodo-bi').value = filtro.periodo;
            this.renderizarPainelBiCompleto(filtro.orgao, filtro.periodo);
        }
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
            }
        }, intervalo);

        document.getElementById('btn-parar-refresh')?.classList.remove('hidden');
        showNotification("Atualização automática ativada.", "info");
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
    // EXPORTAÇÕES INDIVIDUAIS (BOTÕES DAS TABELAS)
    // ============================================================
    
    async exportarTabelaConsolidada(formato) {
        const { coletaData, dicionario, respostas, orgaosUnicos } = window._dadosBiCache || {};
        const { orgao, periodo } = window._filtrosAtuaisBi || { orgao: 'todos', periodo: 'todos' };
        const respostasFiltradas = this._aplicarFiltros(respostas, orgao, periodo);
        
        const camposNumericos = dicionario.filter(c => c.tipo === 'numero' || c.tipo === 'numero_abrangente');
        if (camposNumericos.length === 0) return showNotification("Não há campos numéricos para consolidar.", "warning");

        const orgaosParaMostrar = orgao === 'todos' ? orgaosUnicos : [orgao];
        const head = ['Órgão / Origem', 'Total Envios', ...camposNumericos.map(c => limparTexto(c.label))];
        
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
            await this._gerarExcelSimples(head, body, 'Consolidado_Orgao', coletaData.nomeDaColeta);
        } else if (formato === 'pdf') {
            this._gerarPdfSimples(head, body, 'Matriz Consolidada por Orgao', coletaData.nomeDaColeta);
        }
    },

    async exportarHistorico(formato) {
        const { coletaData, dicionario, respostas } = window._dadosBiCache || {};
        const { orgao, periodo } = window._filtrosAtuaisBi || { orgao: 'todos', periodo: 'todos' };
        const respostasFiltradas = this._aplicarFiltros(respostas, orgao, periodo);

        if (respostasFiltradas.length === 0) return showNotification("Não há dados para exportar.", "warning");

        const head = ["Data / Hora", "Órgão", "Responsável", ...dicionario.map(c => limparTexto(c.label))];
        
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
            await this._gerarExcelSimples(head, body, 'Historico_Detalhado', coletaData.nomeDaColeta);
        } else if (formato === 'pdf') {
            this._gerarPdfSimples(head, body, 'Historico Detalhado de Respostas', coletaData.nomeDaColeta);
        }
    },

    // ============================================================
    // GERADORES BASE (EXCEL E PDF)
    // ============================================================
    
    async _gerarExcelSimples(head, body, nomeAba, nomeColeta) {
        try {
            showNotification("Gerando arquivo Excel...", "info");
            // Importação correta (MJS) que resolve o erro "Biblioteca não carregada"
            const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs');
            const workbook = XLSX.utils.book_new();
            
            const wsData = [
                [`Relatório: ${nomeAba.replace(/_/g, ' ')} - ${limparTexto(nomeColeta)}`],
                [`Gerado em: ${new Date().toLocaleString('pt-BR')}`],
                [],
                head,
                ...body
            ];
            
            const ws = XLSX.utils.aoa_to_sheet(wsData);
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
            
            showNotification("Download do Excel concluído.", "success");
        } catch (err) {
            console.error(err);
            showNotification("Erro ao gerar Excel. Verifique a conexão.", "error");
        }
    },

    _gerarPdfSimples(head, body, titulo, nomeColeta) {
        try {
            showNotification("Gerando arquivo PDF...", "info");
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF('landscape');
            const primaryColor = [30, 58, 138];
            
            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            doc.text(limparTexto(`${titulo.toUpperCase()} - ${nomeColeta.toUpperCase()}`), 14, 20);
            
            doc.setFont("helvetica", "normal");
            doc.setFontSize(9);
            doc.setTextColor(100);
            doc.text(`Emitido em: ${new Date().toLocaleString('pt-BR')} | Total de Registros: ${body.length}`, 14, 26);
            doc.setTextColor(0);

            let fontSizeMatrix = 8;
            if (head.length > 8) fontSizeMatrix = 7;
            if (head.length > 12) fontSizeMatrix = 6;
            if (head.length > 18) fontSizeMatrix = 5;

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
                    doc.text(`Página ${data.pageNumber} / ${pageCount}`, 14, doc.internal.pageSize.height - 10);
                }
            });

            doc.save(`${titulo.replace(/\s+/g, '_')}_${limparTexto(nomeColeta).replace(/\s+/g, '_')}.pdf`);
            showNotification("Download do PDF concluído.", "success");
        } catch (err) {
            console.error(err);
            showNotification("Erro ao gerar PDF.", "error");
        }
    },

    // ============================================================
    // EXPORTAÇÃO PROFISSIONAL (MODAL DE EXPORTAÇÃO GERAL)
    // ============================================================
    abrirModalExportacao() {
        let modal = document.getElementById('modal-config-exportacao');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'modal-config-exportacao';
            modal.className = 'fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-4 animate-fade-in backdrop-blur-sm';
            modal.innerHTML = `
                <div class="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
                    <div class="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                        <h3 class="text-lg font-black text-slate-800 uppercase tracking-wider">Configurar Exportação</h3>
                        <button onclick="document.getElementById('modal-config-exportacao').classList.add('hidden')" class="text-slate-400 hover:text-red-500 font-bold text-xl transition">&times;</button>
                    </div>
                    
                    <div class="p-6 space-y-5">
                        <div class="space-y-3">
                            <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Opções do Relatório PDF</p>
                            
                            <label class="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer hover:border-blue-300 transition">
                                <input type="checkbox" id="pdf-chk-indicadores" checked class="h-5 w-5 rounded text-blue-600 focus:ring-blue-500">
                                <span class="text-sm font-bold text-slate-700">Incluir Tabela de Indicadores (Soma, Média)</span>
                            </label>
                            
                            <label class="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer hover:border-blue-300 transition">
                                <input type="checkbox" id="pdf-chk-distribuicao" checked class="h-5 w-5 rounded text-blue-600 focus:ring-blue-500">
                                <span class="text-sm font-bold text-slate-700">Incluir Distribuição de Respostas (Categorias)</span>
                            </label>
                            
                            <label class="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer hover:border-blue-300 transition">
                                <input type="checkbox" id="pdf-chk-consolidado" checked class="h-5 w-5 rounded text-blue-600 focus:ring-blue-500">
                                <span class="text-sm font-bold text-slate-700">Incluir Tabela Consolidada por Órgão</span>
                            </label>
                            
                            <label class="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer hover:border-blue-300 transition">
                                <input type="checkbox" id="pdf-chk-historico" checked class="h-5 w-5 rounded text-blue-600 focus:ring-blue-500">
                                <span class="text-sm font-bold text-slate-700">Incluir Log Completo de Registros</span>
                            </label>
                        </div>
                    </div>
                    
                    <div class="p-6 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row gap-3">
                        <button onclick="ColetasBiService.exportarParaExcel()" class="w-full sm:w-1/3 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition text-xs text-center">Baixar Planilha</button>
                        <button onclick="ColetasBiService.gerarPDF()" class="w-full sm:w-2/3 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow transition text-xs text-center">Gerar Relatório PDF</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }
        modal.classList.remove('hidden');
    },

    async gerarPDF() {
        document.getElementById('modal-config-exportacao').classList.add('hidden');
        showNotification("Processando documento PDF...", "info");

        const { coletaData, respostas, dicionario } = window._dadosBiCache || {};
        if (!respostas || respostas.length === 0) return showNotification("Ausência de registros.", "error");

        const chkInd = document.getElementById('pdf-chk-indicadores')?.checked;
        const chkDist = document.getElementById('pdf-chk-distribuicao')?.checked;
        const chkCons = document.getElementById('pdf-chk-consolidado')?.checked;
        const chkHist = document.getElementById('pdf-chk-historico')?.checked;

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape');
        const primaryColor = [30, 58, 138];

        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.text(limparTexto(`RELATÓRIO DE INTELIGÊNCIA: ${coletaData.nomeDaColeta}`).toUpperCase(), 14, 20);
        
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.text(`Emitido em: ${new Date().toLocaleString('pt-BR')} | Fontes Analisadas: ${new Set(respostas.map(r => r.orgaoOrigem)).size} Órgãos | Amostra: ${respostas.length} Registros`, 14, 26);
        doc.setTextColor(0);

        let yPos = 35;

        if (chkInd) {
            const camposNum = dicionario.filter(c => c.tipo === 'numero' || c.tipo === 'numero_abrangente');
            if (camposNum.length > 0) {
                doc.setFont("helvetica", "bold");
                doc.setFontSize(11);
                doc.text("1. ESTATÍSTICAS NUMÉRICAS CONSOLIDADAS", 14, yPos);
                yPos += 5;

                const bodyInd = camposNum.map(c => {
                    const nums = respostas.map(r => Number(r.dados?.[c.id]?.resposta)).filter(n => !isNaN(n) && n !== 0);
                    if (nums.length === 0) return [limparTexto(c.label), "0", "0", "0"];
                    const soma = nums.reduce((a, b) => a + b, 0);
                    const media = (soma / nums.length).toFixed(1);
                    const variancia = nums.reduce((acc, n) => acc + Math.pow(n - media, 2), 0) / nums.length;
                    const desvio = Math.sqrt(variancia).toFixed(1);
                    return [limparTexto(c.label), soma.toLocaleString('pt-BR'), media, desvio];
                });

                doc.autoTable({
                    startY: yPos,
                    head: [['Métrica Analisada', 'Volume Consolidado', 'Média Geral', 'Desvio Padrão']],
                    body: bodyInd,
                    theme: 'striped',
                    styles: { fontSize: 8, cellPadding: 3, textColor: [40, 40, 40] },
                    headStyles: { fillColor: primaryColor, textColor: 255, fontStyle: 'bold' },
                    alternateRowStyles: { fillColor: [248, 250, 252] }
                });
                yPos = doc.lastAutoTable.finalY + 12;
            }
        }

        if (chkDist) {
            const camposSel = dicionario.filter(c => ['selecao', 'multipla_escolha', 'booleano'].includes(c.tipo));
            if (camposSel.length > 0) {
                if (yPos > 150) { doc.addPage(); yPos = 20; }
                
                doc.setFont("helvetica", "bold");
                doc.setFontSize(11);
                doc.text("2. DISTRIBUIÇÃO DE RESPOSTAS CATEGÓRICAS", 14, yPos);
                yPos += 5;

                const bodyDist = [];
                camposSel.forEach(c => {
                    const contagem = {};
                    respostas.forEach(r => {
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
                        head: [['Categoria', 'Amostra Válida', 'Detalhamento de Frequência']],
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

        if (chkCons) {
            const camposNum = dicionario.filter(c => c.tipo === 'numero' || c.tipo === 'numero_abrangente');
            if (camposNum.length > 0) {
                if (yPos > 150) { doc.addPage(); yPos = 20; }

                doc.setFont("helvetica", "bold");
                doc.setFontSize(11);
                doc.text("3. MATRIZ CONSOLIDADA POR ÓRGÃO (SOMAS)", 14, yPos);
                yPos += 5;

                const orgaos = [...new Set(respostas.map(r => r.orgaoOrigem || 'Desconhecido'))].sort();
                const headCons = [['Órgão de Origem', 'Registros', ...camposNum.map(c => limparTexto(c.label))]];
                
                const bodyCons = orgaos.map(org => {
                    const rOrg = respostas.filter(r => (r.orgaoOrigem || 'Desconhecido') === org);
                    return [
                        limparTexto(org),
                        rOrg.length.toString(),
                        ...camposNum.map(c => {
                            const sum = rOrg.reduce((a, b) => a + (Number(b.dados?.[c.id]?.resposta) || 0), 0);
                            return sum.toLocaleString('pt-BR');
                        })
                    ];
                });

                const colCount = headCons[0].length;
                let fontSizeMatrix = 8;
                if (colCount > 8) fontSizeMatrix = 7;
                if (colCount > 12) fontSizeMatrix = 6;
                if (colCount > 18) fontSizeMatrix = 5;

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

        if (chkHist) {
            doc.addPage();
            doc.setFont("helvetica", "bold");
            doc.setFontSize(11);
            doc.text("4. LOG DETALHADO DE REGISTROS", 14, 20);

            const headHist = [["Data/Hora", "Origem", "Responsável", ...dicionario.map(c => limparTexto(c.label))]];
            const bodyHist = respostas.map(r => [
                r.timestamp ? new Date(r.timestamp).toLocaleString('pt-BR') : '--',
                limparTexto(r.orgaoOrigem || '--'),
                limparTexto(r.responsavel || '--'),
                ...dicionario.map(c => {
                    const val = r.dados?.[c.id]?.resposta;
                    return val !== undefined && val !== '' ? limparTexto(String(val)) : '--';
                })
            ]);

            const colCount = headHist[0].length;
            let fontSizeHist = 7;
            if (colCount > 10) fontSizeHist = 6;
            if (colCount > 15) fontSizeHist = 5;
            if (colCount > 20) fontSizeHist = 4.5;

            doc.autoTable({
                startY: 25,
                head: headHist,
                body: bodyHist,
                theme: 'grid',
                styles: { fontSize: fontSizeHist, cellPadding: 1, textColor: [40, 40, 40] },
                headStyles: { fillColor: primaryColor, textColor: 255, fontStyle: 'bold' },
                didDrawPage: function(data) {
                    const pageCount = doc.internal.getNumberOfPages();
                    doc.setFontSize(7);
                    doc.setTextColor(150);
                    doc.text(`Página ${data.pageNumber} / ${pageCount}`, 14, doc.internal.pageSize.height - 10);
                }
            });
        }

        doc.save(`SIGEP_BI_${limparTexto(coletaData.nomeDaColeta).replace(/\s+/g, '_')}.pdf`);
        showNotification("Download do Relatório concluído.", "success");
    },

    async exportarParaExcel() {
        // Função geral de exportação para Excel que lê as seleções do Modal de Exportação.
        document.getElementById('modal-config-exportacao')?.classList.add('hidden');
        showNotification("Gerando arquivo Excel...", "info");

        const { coletaData, respostas, dicionario } = window._dadosBiCache || {};
        if (!respostas || respostas.length === 0) return showNotification("Base de dados vazia.", "error");

        try {
            // Importação correta em módulo ES6 para resolver erro "Biblioteca não carregada"
            const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs');

            const workbook = XLSX.utils.book_new();
            
            // DADOS BRUTOS (SEMPRE INCLUÍDO NO EXCEL)
            const wsData = [
                [`Relatório Estratégico - ${limparTexto(coletaData.nomeDaColeta)}`],
                [`Emissão: ${new Date().toLocaleString('pt-BR')}`],
                [],
                ['Data/Hora', 'Órgão de Origem', 'Responsável', ...dicionario.map(c => limparTexto(c.label))]
            ];
            respostas.forEach(r => {
                wsData.push([
                    r.timestamp ? new Date(r.timestamp).toLocaleString('pt-BR') : '--',
                    limparTexto(r.orgaoOrigem || '--'),
                    limparTexto(r.responsavel || '--'),
                    ...dicionario.map(c => limparTexto(r.dados?.[c.id]?.resposta || '--'))
                ]);
            });
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            XLSX.utils.book_append_sheet(workbook, ws, 'Base Bruta');

            // CONSOLIDADO POR ÓRGÃO
            const camposNum = dicionario.filter(c => c.tipo === 'numero' || c.tipo === 'numero_abrangente');
            if (camposNum.length > 0) {
                const orgaos = [...new Set(respostas.map(r => r.orgaoOrigem || 'Desconhecido'))];
                const resumoData = [
                    ['MATRIZ CONSOLIDADA POR ÓRGÃO'], [],
                    ['Órgão', 'Volume de Envios', ...camposNum.map(c => limparTexto(c.label))]
                ];
                orgaos.forEach(org => {
                    const envios = respostas.filter(r => (r.orgaoOrigem || 'Desconhecido') === org);
                    resumoData.push([
                        limparTexto(org),
                        envios.length,
                        ...camposNum.map(c => envios.reduce((acc, r) => acc + (Number(r.dados?.[c.id]?.resposta) || 0), 0))
                    ]);
                });
                const wsResumo = XLSX.utils.aoa_to_sheet(resumoData);
                XLSX.utils.book_append_sheet(workbook, wsResumo, 'Consolidado');
            }
            
            const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
            const blob = new Blob([wbout], { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Matriz_${limparTexto(coletaData.nomeDaColeta).replace(/\s+/g, '_')}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 100);
            
            showNotification("Download da planilha concluído.", "success");
        } catch (err) {
            console.error(err);
            showNotification("Falha ao processar arquivo Excel.", "error");
        }
    }
};

window.ColetasBiService = ColetasBiService;
