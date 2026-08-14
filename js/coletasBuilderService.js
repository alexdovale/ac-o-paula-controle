// js/coletasBuilderService.js - Construtor Avançado: Padrão Corporativo
import { doc, updateDoc, deleteDoc, collection, getDocs, query, where, writeBatch, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showNotification, escapeHTML } from './utils.js';

function limparTexto(texto) {
    if (typeof texto !== 'string') return texto;
    return texto
        .normalize('NFD').replace(/[\u0300-\u036f]/g, "")
        .replace(/[ºª°]/g, '.')
        .replace(/[&]/g, 'e')
        .replace(/[^\x20-\x7E]/g, '')
        .trim();
}

export const ColetasBuilderService = {
    
    renderConstrutorHTML(coletaData, coletaId) {
        const campos = coletaData.dicionarioDeCampos || [];
        const links = coletaData.linksExternos || [];
        const formatoNumeracao = coletaData.formatoNumeracao || 'numero';
        const urlSheets = coletaData.urlSincronizacaoSheets || '';

        const opcoesCamposHtml = campos.map((c, index) => `
            <label class="flex items-center gap-2 text-sm text-slate-700 bg-white p-2 border border-slate-200 rounded-lg cursor-pointer hover:bg-blue-50 transition">
                <input type="checkbox" name="campos_link" value="${c.id}" class="h-4 w-4 text-blue-600 rounded border-slate-300">
                <span class="truncate font-medium" title="${escapeHTML(c.label)}">${this.formatarPrefixo(index + 1, formatoNumeracao)} ${escapeHTML(c.label)}</span>
            </label>
        `).join('');

        return `
            <div class="space-y-6 animate-fade-in pb-10">
                <!-- CABEÇALHO -->
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-800 p-6 rounded-2xl shadow-sm gap-4">
                    <div>
                        <span class="text-[10px] font-bold uppercase tracking-widest text-slate-400">Configuração de Formulário</span>
                        <h3 class="text-xl font-black text-white mt-1">${escapeHTML(coletaData.nomeDaColeta)}</h3>
                    </div>
                    <div class="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                        <button type="button" onclick="ColetasBuilderService.limparRespostas('${coletaId}')" class="w-full sm:w-auto bg-slate-700 hover:bg-slate-600 text-white font-bold px-4 py-2.5 rounded-lg text-xs transition border border-slate-600">
                            Zerar Base de Dados
                        </button>
                        <button type="button" onclick="ColetasBuilderService.apagarColeta('${coletaId}')" class="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2.5 rounded-lg text-xs transition shadow-sm">
                            Excluir Formulário
                        </button>
                    </div>
                </div>

                <!-- BLOCO 1: ESTRUTURA DO FORMULÁRIO -->
                <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                    
                    <div class="flex flex-col lg:flex-row justify-between items-start lg:items-center border-b border-slate-100 pb-4 mb-5 gap-4">
                        <div class="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full lg:w-auto">
                            <h3 class="text-lg font-black text-slate-800">1. Estrutura de Perguntas</h3>
                            <select id="select-formato-num" onchange="ColetasBuilderService.mudarFormatoNum('${coletaId}', this.value)" class="w-full sm:w-auto text-xs font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-blue-500">
                                <option value="numero" ${formatoNumeracao === 'numero' ? 'selected' : ''}>Numeração: 1, 2, 3...</option>
                                <option value="romano" ${formatoNumeracao === 'romano' ? 'selected' : ''}>Numeração: I, II, III...</option>
                                <option value="letra" ${formatoNumeracao === 'letra' ? 'selected' : ''}>Numeração: A, B, C...</option>
                            </select>
                        </div>
                        <div class="flex gap-2 w-full lg:w-auto justify-end">
                            <button type="button" onclick="ColetasBuilderService.importarJsonLivre('${coletaId}', ${JSON.stringify(coletaData).replace(/"/g, '&quot;')})" class="text-xs bg-slate-100 text-slate-700 hover:bg-slate-200 font-bold px-4 py-2 rounded-lg border border-slate-200 transition">
                                Importar JSON
                            </button>
                            ${campos.length > 0 ? `
                                <button type="button" onclick="ColetasBuilderService.apagarTodasPerguntas('${coletaId}')" class="text-xs text-red-600 font-bold hover:underline px-2">
                                    Apagar Tudo
                                </button>
                            ` : ''}
                        </div>
                    </div>
                    
                    <div id="lista-campos-dicionario" class="space-y-3 mb-8 max-h-[400px] overflow-y-auto pr-2">
                        ${campos.length === 0 ? '<p class="text-sm text-slate-400 italic bg-slate-50 p-4 rounded-xl text-center">Nenhuma pergunta configurada.</p>' : 
                            campos.map((c, index) => {
                                const tipoDisplay = c.tipo.replace('_', ' ');
                                let metricasDisplay = '';
                                if (c.metricasBi && c.metricasBi.length > 0) {
                                    const metricasLabels = { soma: 'Soma', media: 'Média', desvio: 'Desvio', frequencia: 'Frequência', total: 'Total', distribuicao: 'Distribuição' };
                                    metricasDisplay = c.metricasBi.map(m => metricasLabels[m] || m).join(', ');
                                }
                                
                                return `
                                <div class="bg-white border border-slate-200 p-4 rounded-xl flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 hover:border-blue-300 transition shadow-sm">
                                    <div class="flex items-start gap-4 w-full">
                                        <span class="font-black text-slate-500 text-xs bg-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-200 shrink-0 mt-0.5">${this.formatarPrefixo(index + 1, formatoNumeracao)}</span>
                                        <div class="w-full space-y-1">
                                            <p class="font-bold text-slate-800 text-sm leading-snug">${escapeHTML(c.label)}</p>
                                            <div class="flex flex-wrap gap-2 mt-2">
                                                <span class="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold border border-blue-100 uppercase tracking-wide">TIPO: ${tipoDisplay}</span>
                                                ${c.opcoes?.length ? `<span class="bg-slate-50 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold border border-slate-200 truncate max-w-[200px]">OPÇÕES: ${escapeHTML(c.opcoes.join(', '))}</span>` : ''}
                                                ${metricasDisplay ? `<span class="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-[10px] font-bold border border-indigo-100 uppercase tracking-wide">BI: ${metricasDisplay}</span>` : ''}
                                                ${c.envioIndividual ? `<span class="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-bold border border-emerald-100 uppercase tracking-wide">MODO RÁPIDO</span>` : ''}
                                            </div>
                                        </div>
                                    </div>
                                    <div class="flex flex-wrap items-center gap-2 w-full xl:w-auto xl:justify-end border-t xl:border-t-0 border-slate-100 pt-3 xl:pt-0">
                                        <div class="flex gap-1 mr-2">
                                            ${index > 0 ? `<button type="button" onclick="ColetasBuilderService.moverCampo('${coletaId}', ${index}, ${index - 1})" class="bg-slate-50 hover:bg-slate-200 text-slate-600 border border-slate-200 px-2.5 py-1.5 rounded text-xs font-bold transition">Subir</button>` : ''}
                                            ${index < campos.length - 1 ? `<button type="button" onclick="ColetasBuilderService.moverCampo('${coletaId}', ${index}, ${index + 1})" class="bg-slate-50 hover:bg-slate-200 text-slate-600 border border-slate-200 px-2.5 py-1.5 rounded text-xs font-bold transition">Descer</button>` : ''}
                                        </div>
                                        <button type="button" onclick="ColetasBuilderService.toggleEnvioIndividual('${coletaId}', ${index})" class="bg-white hover:bg-emerald-50 ${c.envioIndividual ? 'text-emerald-700 border-emerald-300' : 'text-slate-600 border-slate-200'} border px-3 py-1.5 rounded-lg text-xs font-bold transition">Rápido: ${c.envioIndividual ? 'ON' : 'OFF'}</button>
                                        <button type="button" onclick="ColetasBuilderService.abrirModalEditarCampo('${coletaId}', ${index})" class="bg-white hover:bg-blue-50 text-blue-600 border border-blue-200 px-3 py-1.5 rounded-lg text-xs font-bold transition">Editar</button>
                                        <button type="button" onclick="ColetasBuilderService.abrirModalConfigMetricas('${coletaId}', ${index})" class="bg-white hover:bg-indigo-50 text-indigo-600 border border-indigo-200 px-3 py-1.5 rounded-lg text-xs font-bold transition">Métricas</button>
                                        <button type="button" onclick="ColetasBuilderService.removerCampo('${coletaId}', ${index})" class="bg-white hover:bg-red-50 text-red-600 border border-red-200 px-3 py-1.5 rounded-lg text-xs font-bold transition ml-auto xl:ml-0">Remover</button>
                                    </div>
                                </div>
                            `}).join('')}
                    </div>

                    <!-- ADICIONAR NOVA PERGUNTA -->
                    <div class="bg-slate-50 p-6 rounded-xl border border-slate-200">
                        <h4 class="text-sm font-black text-slate-700 uppercase tracking-wide mb-4">Nova Pergunta</h4>
                        <div class="flex flex-col gap-4">
                            <input type="text" id="novo-campo-label" placeholder="Enunciado da pergunta (Ex: Número de Atendimentos)" class="w-full p-3.5 border border-slate-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                            
                            <div class="flex flex-col md:flex-row gap-3 items-center">
                                <select id="novo-campo-tipo" class="w-full md:w-1/3 p-3.5 border border-slate-300 rounded-xl text-sm bg-white font-medium focus:ring-2 focus:ring-blue-500 outline-none">
                                    <option value="numero">Número Estatístico</option>
                                    <option value="texto_curto">Texto Curto (1 linha)</option>
                                    <option value="texto_longo">Parágrafo (Várias linhas)</option>
                                    <option value="data">Data</option>
                                    <option value="booleano">Sim / Não</option>
                                    <option value="selecao">Lista Suspensa (Dropdown)</option>
                                    <option value="multipla_escolha">Múltipla Escolha (Bolhas)</option>
                                </select>
                                
                                <label class="w-full md:w-1/3 flex items-center justify-center gap-2 p-3.5 bg-white border border-slate-300 rounded-xl cursor-pointer hover:bg-slate-50 transition">
                                    <input type="checkbox" id="novo-campo-individual" class="w-4 h-4 text-blue-600 rounded">
                                    <span class="text-xs font-bold text-slate-700 uppercase">Modo Envio Rápido</span>
                                </label>

                                <button type="button" id="btn-add-campo" class="w-full md:w-1/3 bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-3.5 rounded-xl text-sm transition shadow-sm">
                                    Adicionar ao Formulário
                                </button>
                            </div>

                            <div id="container-opcoes-extras" class="hidden mt-1">
                                <label class="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Opções de Resposta (separadas por vírgula)</label>
                                <input type="text" id="novo-campo-opcoes" placeholder="Ex: Fundamental, Medio, Superior" class="w-full p-3.5 border border-slate-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none">
                            </div>
                        </div>
                    </div>
                </div>

                <!-- BLOCO 2: GERAÇÃO DE LINKS -->
                <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-100 pb-4 mb-5 gap-4">
                        <h3 class="text-lg font-black text-slate-800">2. Distribuição e Acesso</h3>
                        ${links.length > 0 ? `
                            <button type="button" onclick="ColetasBuilderService.apagarTodosLinks('${coletaId}')" class="text-xs text-red-600 font-bold hover:underline">
                                Revogar Todos os Links
                            </button>
                        ` : ''}
                    </div>
                    
                    <div class="space-y-3 mb-8 max-h-[300px] overflow-y-auto pr-2">
                        ${links.length === 0 ? '<p class="text-sm text-slate-400 italic bg-slate-50 p-4 rounded-xl text-center">Nenhum link gerado no momento.</p>' : 
                            links.map((l, index) => `
                                <div class="bg-white border border-slate-200 p-4 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-sm hover:border-blue-300 transition">
                                    <div class="w-full">
                                        <p class="font-black text-slate-700 text-sm uppercase">${escapeHTML(l.orgao)}</p>
                                        <div class="flex flex-wrap gap-2 mt-2">
                                            <span class="px-2 py-0.5 rounded text-[10px] font-bold border ${l.requerSenha ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'} uppercase tracking-wide">
                                                ${l.requerSenha ? 'Acesso Restrito' : 'Acesso Público'}
                                            </span>
                                            <span class="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold border border-slate-200 uppercase tracking-wide">
                                                Permissões: ${l.camposHabilitados.length} Campos
                                            </span>
                                        </div>
                                    </div>
                                    <div class="flex flex-wrap w-full md:w-auto gap-2 mt-2 md:mt-0">
                                        <button type="button" onclick="ColetasBuilderService.copiarLink('${l.token}')" class="w-full sm:w-auto bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 font-bold px-4 py-2 rounded-lg text-xs transition">
                                            Copiar URL
                                        </button>
                                        <button type="button" onclick="ColetasBuilderService.removerLink('${coletaId}', ${index})" class="w-full sm:w-auto bg-white hover:bg-red-50 text-red-600 border border-red-200 px-4 py-2 rounded-lg text-xs font-bold transition">
                                            Revogar
                                        </button>
                                    </div>
                                </div>
                            `).join('')}
                    </div>

                    <div class="bg-slate-50 p-6 rounded-xl border border-slate-200">
                        <h4 class="text-sm font-black text-slate-700 uppercase tracking-wide mb-4">Gerar Novo Acesso</h4>
                        
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                                <label class="block text-xs font-bold text-slate-500 uppercase mb-1.5">Identificação do Destinatário</label>
                                <input type="text" id="novo-link-orgao" placeholder="Nome do Órgão ou Pessoa" class="w-full p-3.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                            </div>
                            <div>
                                <div class="flex items-center justify-between mb-1.5">
                                    <label class="text-xs font-bold text-slate-500 uppercase">Proteção por Senha</label>
                                    <label class="flex items-center gap-1.5 cursor-pointer text-xs font-bold text-slate-600">
                                        <input type="checkbox" id="novo-link-requer-senha" checked class="rounded border-slate-300 text-blue-600 focus:ring-blue-500"> 
                                        Habilitar
                                    </label>
                                </div>
                                <input type="password" id="novo-link-senha" placeholder="Definir senha de acesso" class="w-full p-3.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                            </div>
                        </div>

                        <div class="bg-white p-4 rounded-xl border border-slate-200 mb-5">
                            <label class="block text-xs font-bold text-slate-700 uppercase mb-3">Escopo de Preenchimento (Permissões):</label>
                            ${campos.length === 0 ? '<p class="text-xs text-red-500 font-medium">Configure as perguntas no Bloco 1 primeiro.</p>' : `
                                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    ${opcoesCamposHtml}
                                </div>
                            `}
                        </div>

                        <button type="button" id="btn-gerar-link" class="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3.5 rounded-xl text-sm shadow-sm transition">
                            Gerar Link de Acesso
                        </button>
                    </div>
                </div>

                <!-- BLOCO 3: INTEGRAÇÃO GOOGLE SHEETS / LOOKER STUDIO -->
                <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                    <h3 class="text-lg font-black text-slate-800 border-b border-slate-100 pb-4 mb-5">3. Sincronização Externa (Google Sheets)</h3>
                    
                    <div class="space-y-4 max-w-3xl">
                        <div>
                            <label class="block text-xs font-bold text-slate-500 uppercase mb-1.5">URL do Web App (Apps Script):</label>
                            <input type="text" id="input-url-sheets" 
                                   value="${escapeHTML(urlSheets)}" 
                                   placeholder="Cole a URL do script gerado no Google Sheets..." 
                                   class="w-full p-3.5 border border-slate-300 rounded-xl text-sm outline-none bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 transition">
                        </div>
                        
                        <div class="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                            <button type="button" 
                                    onclick="ColetasBuilderService.atualizarConfigIntegracao('${coletaId}', document.getElementById('input-url-sheets').value)" 
                                    class="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-3.5 rounded-xl text-sm shadow-sm transition">
                                Salvar Configuração de Integração
                            </button>
                            <p class="text-[11px] text-slate-500 leading-relaxed max-w-md">
                                A sincronização enviará uma cópia exata de cada submissão para a sua planilha, alimentando diretamente seu painel do Looker Studio.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- MODAL DE CONFIGURAÇÃO DE MÉTRICAS BI -->
            <div id="modal-config-metricas" class="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 hidden p-4 animate-fade-in backdrop-blur-sm">
                <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
                    <div class="flex justify-between items-center mb-5 border-b border-slate-100 pb-4">
                        <h3 class="text-lg font-black text-slate-800 uppercase tracking-wide">Métricas Analíticas</h3>
                        <button onclick="ColetasBuilderService.fecharModalConfigMetricas()" class="text-slate-400 hover:text-red-500 font-bold text-xl transition">&times;</button>
                    </div>
                    
                    <div class="space-y-5">
                        <p class="text-sm text-slate-600 font-medium">Selecione os indicadores que devem ser processados para este campo no BI:</p>
                        
                        <div class="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3" id="container-metricas-opcoes">
                            <!-- As opções serão preenchidas dinamicamente -->
                        </div>
                        
                        <div class="flex flex-col sm:flex-row gap-3 pt-2">
                            <button onclick="ColetasBuilderService.fecharModalConfigMetricas()" class="flex-1 p-3 border border-slate-300 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition">
                                Cancelar
                            </button>
                            <button onclick="ColetasBuilderService.salvarConfigMetricas()" class="flex-1 p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-sm transition">
                                Salvar Métricas
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    formatarPrefixo(num, tipo) {
        if (tipo === 'romano') {
            const romanos = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX"];
            return romanos[num] || num + '.';
        }
        if (tipo === 'letra') {
            const letras = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
            return (letras[num - 1] || num) + ')';
        }
        return num + '.';
    },

    // ============================================================
    // CONFIGURAÇÃO DE MÉTRICAS BI
    // ============================================================
    _campoEditandoIndex: null,
    _coletaIdEditando: null,

    abrirModalConfigMetricas(coletaId, index) {
        const db = window.app.db;
        const docRef = doc(db, "formularios_coleta", coletaId);
        
        getDoc(docRef).then((snap) => {
            if (!snap.exists()) return;
            const campos = snap.data().dicionarioDeCampos || [];
            const campo = campos[index];
            if (!campo) return;

            this._campoEditandoIndex = index;
            this._coletaIdEditando = coletaId;

            const container = document.getElementById('container-metricas-opcoes');
            const metricasAtuais = campo.metricasBi || [];

            let opcoesDisponiveis = [];
            
            if (campo.tipo === 'numero' || campo.tipo === 'numero_abrangente') {
                opcoesDisponiveis = [
                    { id: 'soma', label: 'Soma Consolidada', default: true },
                    { id: 'media', label: 'Média Geral', default: true },
                    { id: 'desvio', label: 'Desvio Padrão', default: false },
                    { id: 'frequencia', label: 'Frequência Específica', default: false }
                ];
            } else if (['selecao', 'multipla_escolha', 'booleano'].includes(campo.tipo)) {
                opcoesDisponiveis = [
                    { id: 'distribuicao', label: 'Distribuição Percentual', default: true },
                    { id: 'total', label: 'Contagem de Respostas', default: true }
                ];
            } else {
                opcoesDisponiveis = [
                    { id: 'total', label: 'Total Registrado', default: true },
                    { id: 'ultima', label: 'Exibição de Exemplos', default: false }
                ];
            }

            const metricasParaUsar = metricasAtuais.length > 0 ? metricasAtuais : 
                opcoesDisponiveis.filter(o => o.default).map(o => o.id);

            container.innerHTML = opcoesDisponiveis.map(op => `
                <label class="flex items-center gap-3 p-2 hover:bg-white rounded-lg transition cursor-pointer border border-transparent hover:border-slate-200">
                    <input type="checkbox" name="metrica_bi" value="${op.id}" 
                           ${metricasParaUsar.includes(op.id) ? 'checked' : ''} 
                           class="h-5 w-5 text-blue-600 rounded border-slate-300 focus:ring-blue-500">
                    <span class="text-sm font-bold text-slate-700">${op.label}</span>
                </label>
            `).join('');

            document.getElementById('modal-config-metricas').classList.remove('hidden');
        });
    },

    fecharModalConfigMetricas() {
        document.getElementById('modal-config-metricas').classList.add('hidden');
        this._campoEditandoIndex = null;
        this._coletaIdEditando = null;
    },

    async salvarConfigMetricas() {
        const index = this._campoEditandoIndex;
        const coletaId = this._coletaIdEditando;
        
        if (index === null || !coletaId) {
            showNotification("Erro interno de identificação.", "error");
            return;
        }

        const checkboxes = document.querySelectorAll('#container-metricas-opcoes input[type="checkbox"]:checked');
        const metricasSelecionadas = Array.from(checkboxes).map(cb => cb.value);

        if (metricasSelecionadas.length === 0) {
            showNotification("Selecione pelo menos uma métrica.", "warning");
            return;
        }

        try {
            const db = window.app.db;
            const docRef = doc(db, "formularios_coleta", coletaId);
            const snap = await getDoc(docRef);
            if (!snap.exists()) return;

            const campos = snap.data().dicionarioDeCampos || [];
            campos[index] = {
                ...campos[index],
                metricasBi: metricasSelecionadas
            };

            await updateDoc(docRef, { dicionarioDeCampos: campos });
            
            this.fecharModalConfigMetricas();
            showNotification("Métricas configuradas com sucesso.", "success");
            window.abrirConstrutor(coletaId);
        } catch (e) {
            console.error(e);
            showNotification("Erro ao salvar configuração.", "error");
        }
    },

    // ============================================================
    // MÉTODOS DE AÇÕES DO CONSTRUTOR
    // ============================================================
    initEventos(db, coletaId, coletaData) {
        const selectTipo = document.getElementById('novo-campo-tipo');
        const containerOpcoes = document.getElementById('container-opcoes-extras');
        if (selectTipo && containerOpcoes) {
            selectTipo.addEventListener('change', (e) => {
                if (e.target.value === 'selecao' || e.target.value === 'multipla_escolha') {
                    containerOpcoes.classList.remove('hidden');
                } else {
                    containerOpcoes.classList.add('hidden');
                }
            });
        }

        const checkRequerSenha = document.getElementById('novo-link-requer-senha');
        const inputSenha = document.getElementById('novo-link-senha');
        if (checkRequerSenha && inputSenha) {
            checkRequerSenha.addEventListener('change', (e) => {
                inputSenha.disabled = !e.target.checked;
                inputSenha.classList.toggle('bg-slate-100', !e.target.checked);
                if (!e.target.checked) inputSenha.value = '';
            });
        }

        document.getElementById('btn-add-campo')?.addEventListener('click', async () => {
            const label = limparTexto(document.getElementById('novo-campo-label').value);
            const tipo = document.getElementById('novo-campo-tipo').value;
            const opcoesString = document.getElementById('novo-campo-opcoes')?.value;
            const envioIndividual = document.getElementById('novo-campo-individual')?.checked || false;
            
            if (!label) return showNotification("Informe o enunciado da pergunta.", "error");

            const novoCampo = {
                id: 'c_' + Math.random().toString(36).substring(2, 8),
                label,
                tipo,
                envioIndividual
            };

            if (tipo === 'selecao' || tipo === 'multipla_escolha') {
                if (!opcoesString) return showNotification("Preencha as opções separadas por vírgula.", "warning");
                novoCampo.opcoes = opcoesString.split(',').map(o => limparTexto(o)).filter(o => o !== '');
            }

            const camposAtuais = coletaData.dicionarioDeCampos || [];
            camposAtuais.push(novoCampo);

            await updateDoc(doc(db, "formularios_coleta", coletaId), { dicionarioDeCampos: camposAtuais });
            showNotification("Pergunta cadastrada com sucesso.", "success");
            window.abrirConstrutor(coletaId); 
        });

        document.getElementById('btn-gerar-link')?.addEventListener('click', async () => {
            const orgao = limparTexto(document.getElementById('novo-link-orgao').value);
            const requerSenha = document.getElementById('novo-link-requer-senha').checked;
            const senha = document.getElementById('novo-link-senha').value.trim();
            
            const checkboxes = document.querySelectorAll('input[name="campos_link"]:checked');
            const camposHabilitados = Array.from(checkboxes).map(cb => cb.value);

            if (!orgao) return showNotification("Informe a identificação do destinatário.", "error");
            if (requerSenha && !senha) return showNotification("A senha de acesso é obrigatória.", "error");
            if (camposHabilitados.length === 0) return showNotification("Selecione os campos permitidos para preenchimento.", "error");

            const token = Math.random().toString(36).substring(2, 12);
            const novoLink = {
                orgao, token, requerSenha,
                senha: requerSenha ? senha : null,
                camposHabilitados
            };

            const linksAtuais = coletaData.linksExternos || [];
            linksAtuais.push(novoLink);

            await updateDoc(doc(db, "formularios_coleta", coletaId), { linksExternos: linksAtuais });
            showNotification("Link gerado e pronto para distribuição.", "success");
            window.abrirConstrutor(coletaId);
        });
    },

    async atualizarConfigIntegracao(coletaId, urlPlanilha) {
        try {
            const db = window.app.db;
            await updateDoc(doc(db, "formularios_coleta", coletaId), { 
                urlSincronizacaoSheets: urlPlanilha.trim() 
            });
            showNotification("Integração habilitada.", "success");
            window.abrirConstrutor(coletaId);
        } catch (e) {
            console.error(e);
            showNotification("Erro de comunicação ao salvar.", "error");
        }
    },

    async mudarFormatoNum(coletaId, novoFormato) {
        try {
            const db = window.app.db;
            await updateDoc(doc(db, "formularios_coleta", coletaId), { formatoNumeracao: novoFormato });
            window.abrirConstrutor(coletaId);
        } catch (e) { console.error(e); }
    },

    async moverCampo(coletaId, indexOrigem, indexDestino) {
        try {
            const db = window.app.db;
            const docRef = doc(db, "formularios_coleta", coletaId);
            const freshSnap = await getDoc(docRef);
            if (!freshSnap.exists()) return;

            let campos = freshSnap.data().dicionarioDeCampos || [];
            const [removido] = campos.splice(indexOrigem, 1);
            campos.splice(indexDestino, 0, removido);

            await updateDoc(docRef, { dicionarioDeCampos: campos });
            window.abrirConstrutor(coletaId);
        } catch (e) {
            console.error(e);
            showNotification("Falha na reordenação.", "error");
        }
    },

    async toggleEnvioIndividual(coletaId, index) {
        try {
            const db = window.app.db;
            const docRef = doc(db, "formularios_coleta", coletaId);
            const freshSnap = await getDoc(docRef);
            if (!freshSnap.exists()) return;

            let campos = freshSnap.data().dicionarioDeCampos || [];
            campos[index].envioIndividual = !campos[index].envioIndividual;

            await updateDoc(docRef, { dicionarioDeCampos: campos });
            showNotification(`Modo Envio Rápido ${campos[index].envioIndividual ? 'ativado' : 'desativado'}.`, "success");
            window.abrirConstrutor(coletaId);
        } catch (e) {
            console.error(e);
            showNotification("Falha ao alterar modo de envio.", "error");
        }
    },

    async abrirModalEditarCampo(coletaId, index) {
        try {
            const db = window.app.db;
            const docRef = doc(db, "formularios_coleta", coletaId);
            const freshSnap = await getDoc(docRef);
            if (!freshSnap.exists()) return;

            let campos = freshSnap.data().dicionarioDeCampos || [];
            const campo = campos[index];
            if (!campo) return;

            const novoLabel = prompt("Editar Enunciado da Pergunta:", campo.label);
            if (novoLabel === null) return;
            const labelLimpo = limparTexto(novoLabel);
            if (!labelLimpo) return showNotification("Operação cancelada. Enunciado inválido.", "error");

            const tiposValidos = "numero, texto_curto, texto_longo, data, booleano, selecao, multipla_escolha";
            const novoTipo = prompt(`Editar Tipo Estrutural:\n(${tiposValidos})`, campo.tipo);
            if (novoTipo === null) return;
            const tipoLimpo = novoTipo.trim();

            let novasOpcoes = campo.opcoes || [];
            if (tipoLimpo === 'selecao' || tipoLimpo === 'multipla_escolha') {
                const opcoesStr = prompt("Editar Opções (separadas por vírgula):", (campo.opcoes || []).join(', '));
                if (opcoesStr !== null) {
                    novasOpcoes = opcoesStr.split(',').map(o => limparTexto(o)).filter(o => o !== '');
                }
            }

            campos[index] = {
                ...campo,
                label: labelLimpo,
                tipo: tipoLimpo,
                opcoes: novasOpcoes
            };

            await updateDoc(docRef, { dicionarioDeCampos: campos });
            showNotification("Campo atualizado.", "success");
            window.abrirConstrutor(coletaId);
        } catch (e) {
            console.error(e);
            showNotification("Falha ao editar registro.", "error");
        }
    },

    async removerCampo(coletaId, index) {
        if (!confirm("Confirma a exclusão permanente deste campo?")) return;
        try {
            const db = window.app.db;
            const docRef = doc(db, "formularios_coleta", coletaId);
            const freshSnap = await getDoc(docRef);
            if (!freshSnap.exists()) return;

            let campos = freshSnap.data().dicionarioDeCampos || [];
            campos.splice(index, 1);

            await updateDoc(docRef, { dicionarioDeCampos: campos });
            showNotification("Campo excluído.", "info");
            window.abrirConstrutor(coletaId);
        } catch (e) {
            console.error(e);
            showNotification("Falha de exclusão.", "error");
        }
    },

    async apagarTodasPerguntas(coletaId) {
        if (!confirm("Ação destrutiva: Deseja apagar todas as perguntas configuradas?")) return;
        try {
            const db = window.app.db;
            await updateDoc(doc(db, "formularios_coleta", coletaId), { dicionarioDeCampos: [] });
            showNotification("Estrutura redefinida.", "success");
            window.abrirConstrutor(coletaId);
        } catch (e) {
            console.error(e);
            showNotification("Falha no processamento.", "error");
        }
    },

    async importarJsonLivre(coletaId, coletaData) {
        const jsonInput = prompt("Cole o JSON com a estrutura do dicionário de dados:");
        if (!jsonInput) return;

        try {
            const novasPerguntas = JSON.parse(jsonInput);
            if (!Array.isArray(novasPerguntas)) {
                return showNotification("Falha de validação: JSON deve conter uma lista.", "error");
            }

            const db = window.app.db;
            const docRef = doc(db, "formularios_coleta", coletaId);
            const camposAtuais = coletaData.dicionarioDeCampos || [];
            
            const formatadas = novasPerguntas.map(p => ({
                id: p.id || 'c_' + Math.random().toString(36).substring(2, 8),
                label: limparTexto(p.label || p.pergunta || 'Campo Não Nomeado'),
                tipo: p.tipo || 'numero',
                opcoes: (p.opcoes || []).map(o => limparTexto(o)),
                metricasBi: p.metricasBi || [],
                envioIndividual: p.envioIndividual || false
            }));

            const listaFinal = [...camposAtuais, ...formatadas];
            await updateDoc(docRef, { dicionarioDeCampos: listaFinal });
            showNotification(`Importação concluída. ${formatadas.length} campos inseridos.`, "success");
            window.abrirConstrutor(coletaId);
        } catch (e) {
            console.error(e);
            showNotification("Falha de sintaxe no JSON.", "error");
        }
    },

    async removerLink(coletaId, index) {
        if (!confirm("O destinatário perderá imediatamente o acesso. Confirmar revogação?")) return;
        try {
            const db = window.app.db;
            const docRef = doc(db, "formularios_coleta", coletaId);
            const freshSnap = await getDoc(docRef);
            if (!freshSnap.exists()) return;

            let links = freshSnap.data().linksExternos || [];
            links.splice(index, 1);

            await updateDoc(docRef, { linksExternos: links });
            showNotification("Acesso revogado.", "success");
            window.abrirConstrutor(coletaId);
        } catch (e) {
            console.error(e);
            showNotification("Falha de rede.", "error");
        }
    },

    async apagarTodosLinks(coletaId) {
        if (!confirm("Ação destrutiva: Todos os órgãos parceiros perderão o acesso ao formulário. Prosseguir?")) return;
        try {
            const db = window.app.db;
            await updateDoc(doc(db, "formularios_coleta", coletaId), { linksExternos: [] });
            showNotification("Todos os acessos foram revogados.", "success");
            window.abrirConstrutor(coletaId);
        } catch (e) {
            console.error(e);
            showNotification("Falha no processamento.", "error");
        }
    },

    async limparRespostas(coletaId) {
        if (!confirm("Ação destrutiva irreversível: Todos os registros de BI desta coleta serão deletados. Continuar?")) return;
        try {
            const db = window.app.db;
            const q = query(collection(db, "respostas_coleta"), where("coletaId", "==", coletaId));
            const snapshot = await getDocs(q);

            if (snapshot.empty) {
                showNotification("A base já se encontra vazia.", "info");
                return;
            }

            const batch = writeBatch(db);
            snapshot.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();

            showNotification("Base de dados zerada.", "success");
            window.verResultados(coletaId);
        } catch (e) {
            console.error(e);
            showNotification("Erro ao processar exclusão em massa.", "error");
        }
    },

    async apagarColeta(coletaId) {
        if (!confirm("Ação destrutiva irreversível: O formulário e todos os dados coletados serão deletados. Confirmar exclusão do projeto?")) return;
        try {
            const db = window.app.db;
            const q = query(collection(db, "respostas_coleta"), where("coletaId", "==", coletaId));
            const snapRespostas = await getDocs(q);
            const batch = writeBatch(db);
            snapRespostas.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();

            await deleteDoc(doc(db, "formularios_coleta", coletaId));
            
            document.getElementById('container-construtor-coleta').classList.add('hidden');
            window.app.listarColetas();
            showNotification("Projeto excluído da base.", "success");
        } catch (e) {
            console.error(e);
            showNotification("Erro na comunicação com o servidor.", "error");
        }
    },

    copiarLink(token) {
        let baseUrl = window.location.href.split('?')[0].replace('index.html', '');
        const link = `${baseUrl}coleta.html?token=${token}`;
        navigator.clipboard.writeText(link).then(() => {
            showNotification("URL copiada.", "success");
        }).catch(() => {
            const textArea = document.createElement('textarea');
            textArea.value = link;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            showNotification("URL copiada.", "success");
        });
    }
};

window.ColetasBuilderService = ColetasBuilderService;
