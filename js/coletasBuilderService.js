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
        const avisos = coletaData.avisos || [];
        const formatoNumeracao = coletaData.formatoNumeracao || 'numero';
        const urlSheets = coletaData.urlSincronizacaoSheets || '';
        const statusFormulario = coletaData.status || 'aberto';
        const dataInicio = coletaData.dataInicio || '';
        const dataFim = coletaData.dataFim || '';

        setTimeout(() => this._monitorarAtividadeLinks(coletaId, links), 500);

        const opcoesCamposHtml = campos.map((c, index) => `
            <label class="campo-checkbox flex items-center gap-2 text-sm text-slate-700 bg-white p-2 border border-slate-200 rounded-lg cursor-pointer hover:bg-blue-50 transition">
                <input type="checkbox" name="campos_link" value="${c.id}" class="h-4 w-4 text-blue-600 rounded border-slate-300">
                <span class="truncate font-medium campo-texto" title="${escapeHTML(c.label)}">${this.formatarPrefixo(index + 1, formatoNumeracao)} ${escapeHTML(c.label)}</span>
            </label>
        `).join('');

        return `
            <div class="space-y-6 animate-fade-in pb-10">
                <!-- CABEÇALHO COM LOGO -->
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-800 p-6 rounded-2xl shadow-sm gap-4">
                    <div class="flex items-center gap-4">
                        <img src="https://firebasestorage.googleapis.com/v0/b/pauta-ce162.firebasestorage.app/o/logo_sigep.png?alt=media&token=b067528b-df81-4fbf-bc22-0d2b01acbbe6" class="h-10 w-auto grayscale brightness-200 opacity-90" alt="SIGEP">
                        <div>
                            <span class="text-[10px] font-bold uppercase tracking-widest text-slate-400">Configuração de Formulário</span>
                            <h3 class="text-xl font-black text-white mt-1">${escapeHTML(coletaData.nomeDaColeta)}</h3>
                        </div>
                    </div>
                    <div class="flex flex-wrap gap-2 w-full md:w-auto justify-end">
                        <button type="button" onclick="ColetasBuilderService.abrirModalCompartilhamento('${coletaId}')" class="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-lg text-xs transition shadow-sm">
                            Compartilhar Acesso / Pauta
                        </button>
                        <button type="button" onclick="ColetasBuilderService.limparRespostas('${coletaId}')" class="bg-slate-700 hover:bg-slate-600 text-white font-bold px-4 py-2.5 rounded-lg text-xs transition border border-slate-600">
                            Zerar Base
                        </button>
                        <button type="button" onclick="ColetasBuilderService.apagarColeta('${coletaId}')" class="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2.5 rounded-lg text-xs transition shadow-sm">
                            Excluir Form
                        </button>
                    </div>
                </div>

                <!-- BLOCO 0: STATUS E VALIDADE DO FORMULÁRIO -->
                <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                    <h3 class="text-lg font-black text-slate-800 border-b border-slate-100 pb-4 mb-5">Controle de Validade e Acesso</h3>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
                        <div>
                            <label class="block text-xs font-bold text-slate-500 uppercase mb-2">Status Operacional</label>
                            <select id="config-status-form" class="w-full p-3 border border-slate-300 rounded-xl text-sm font-bold text-slate-700 bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none">
                                <option value="aberto" ${statusFormulario === 'aberto' ? 'selected' : ''}>Aberto (Aceitando Respostas)</option>
                                <option value="fechado" ${statusFormulario === 'fechado' ? 'selected' : ''}>Fechado (Bloqueado)</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-500 uppercase mb-2">Data de Abertura (Opcional)</label>
                            <input type="date" id="config-data-inicio" value="${dataInicio}" class="w-full p-3 border border-slate-300 rounded-xl text-sm bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-500 uppercase mb-2">Data Limite / Encerramento (Opcional)</label>
                            <input type="date" id="config-data-fim" value="${dataFim}" class="w-full p-3 border border-slate-300 rounded-xl text-sm bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none">
                        </div>
                    </div>
                    <div class="mt-5 flex justify-end">
                        <button type="button" onclick="ColetasBuilderService.salvarStatusEValidade('${coletaId}')" class="bg-slate-800 hover:bg-slate-900 text-white font-bold px-6 py-3 rounded-xl text-sm transition shadow-sm">
                            Salvar Regras de Acesso
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

                    ${campos.length > 5 ? `
                        <div class="mb-4">
                            <input type="text" onkeyup="ColetasBuilderService.filtrarLista(this.value, 'lista-campos-dicionario', '.campo-card', '.campo-card-texto')" placeholder="Pesquisar perguntas configuradas..." class="w-full p-3 border border-slate-300 rounded-xl text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition">
                        </div>
                    ` : ''}
                    
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
                                <div class="campo-card bg-white border border-slate-200 p-4 rounded-xl flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 hover:border-blue-300 transition shadow-sm">
                                    <div class="flex items-start gap-4 w-full">
                                        <span class="font-black text-slate-500 text-xs bg-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-200 shrink-0 mt-0.5">${this.formatarPrefixo(index + 1, formatoNumeracao)}</span>
                                        <div class="w-full space-y-1">
                                            <p class="campo-card-texto font-bold text-slate-800 text-sm leading-snug">${escapeHTML(c.label)}</p>
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
                                <select id="novo-campo-tipo" onchange="ColetasBuilderService.atualizarDicaExemplo(this.value, 'dica-novo-campo', 'container-opcoes-extras')" class="w-full md:w-1/3 p-3.5 border border-slate-300 rounded-xl text-sm bg-white font-medium focus:ring-2 focus:ring-blue-500 outline-none">
                                    <option value="numero">Número Estatístico (Somas Gerais)</option>
                                    <option value="numero_idade">Idade (Apenas Números Inteiros)</option>
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
                            
                            <div id="dica-novo-campo" class="text-xs text-blue-800 bg-blue-50 p-4 rounded-xl border border-blue-100 font-medium leading-relaxed">
                                <span class="font-black text-blue-700 uppercase tracking-widest text-[10px]">COMO FUNCIONA:</span> <br>
                                Apenas números (aceita decimais). Ideal para quantidades (Ex: Qtd de Atendimentos, Renda). O BI calculará Soma, Média e Desvio.
                            </div>

                            <div id="container-opcoes-extras" class="hidden mt-1">
                                <label class="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Opções de Resposta (separadas por vírgula)</label>
                                <input type="text" id="novo-campo-opcoes" placeholder="Ex: Fundamental, Medio, Superior" class="w-full p-3.5 border border-slate-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none">
                            </div>
                        </div>
                    </div>
                </div>

                <!-- BLOCO 2: GERAÇÃO DE LINKS E PERMISSÕES -->
                <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                    
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-100 pb-4 mb-5 gap-4">
                        <h3 class="text-lg font-black text-slate-800">2. Distribuição, Acesso e Monitoramento</h3>
                        ${links.length > 0 ? `
                            <div class="flex gap-2 w-full sm:w-auto">
                                <button type="button" onclick="ColetasBuilderService.abrirCaixaMensagens('${coletaId}')" class="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold px-4 py-2 rounded-lg border border-blue-200 transition">
                                    Caixa de Entrada
                                </button>
                                <button type="button" onclick="ColetasBuilderService.abrirModalAviso('${coletaId}', 'todos')" class="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold px-4 py-2 rounded-lg border border-indigo-200 transition">
                                    Enviar Comunicado Global
                                </button>
                                <button type="button" onclick="ColetasBuilderService.apagarTodosLinks('${coletaId}')" class="text-xs text-red-600 font-bold hover:underline px-2">
                                    Revogar Todos
                                </button>
                            </div>
                        ` : ''}
                    </div>

                    <!-- CENTRAL DE COMUNICADOS ATIVOS -->
                    ${avisos.length > 0 ? `
                        <div class="mb-6 bg-amber-50 p-4 rounded-xl border border-amber-200">
                            <h4 class="text-[10px] font-black text-amber-800 uppercase tracking-widest mb-3">Comunicados Ativos</h4>
                            <div class="space-y-2">
                                ${avisos.map(aviso => `
                                    <div class="flex justify-between items-center bg-white p-3 rounded-lg border border-amber-100 shadow-sm">
                                        <div class="truncate pr-4">
                                            <span class="text-[10px] font-bold text-amber-600 uppercase bg-amber-100 px-2 py-0.5 rounded mr-2">Para: ${aviso.orgaoAlvo === 'todos' ? 'TODOS' : escapeHTML(aviso.orgaoAlvo)}</span>
                                            <span class="text-xs font-medium text-slate-700">${escapeHTML(aviso.mensagem)}</span>
                                        </div>
                                        <button onclick="ColetasBuilderService.apagarAviso('${coletaId}', '${aviso.id}')" class="text-[10px] text-red-500 font-bold uppercase hover:underline whitespace-nowrap">Excluir</button>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                    
                    <div class="space-y-4 mb-8 max-h-[400px] overflow-y-auto pr-2">
                        ${links.length === 0 ? '<p class="text-sm text-slate-400 italic bg-slate-50 p-4 rounded-xl text-center">Nenhum link gerado no momento.</p>' : 
                            links.map((l, index) => `
                                <div class="bg-white border border-slate-200 p-5 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-sm hover:border-blue-300 transition">
                                    <div class="w-full">
                                        <div class="flex items-center gap-2 mb-1">
                                            <p class="font-black text-slate-800 text-sm uppercase">${escapeHTML(l.orgao)}</p>
                                            ${l.requerSenha ? '<span class="text-[10px] bg-slate-100 text-slate-500 font-bold px-1.5 py-0.5 rounded border border-slate-200">Com Senha</span>' : ''}
                                        </div>
                                        
                                        <!-- MONITORAMENTO EM TEMPO REAL -->
                                        <div class="flex items-center gap-2 mt-2">
                                            <div class="h-2 w-2 rounded-full bg-slate-300" id="status-dot-${index}"></div>
                                            <span id="status-text-${index}" class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Verificando atividade...</span>
                                        </div>

                                        <p class="text-[10px] text-slate-400 font-medium mt-1">Escopo de Permissão: ${l.camposHabilitados.length} Campos Liberados</p>
                                    </div>
                                    <div class="flex flex-wrap w-full md:w-auto gap-2 mt-3 md:mt-0">
                                        <button type="button" onclick="ColetasBuilderService.abrirModalAviso('${coletaId}', '${escapeHTML(l.orgao)}')" class="w-full sm:w-auto bg-white hover:bg-amber-50 text-amber-600 border border-amber-200 font-bold px-3 py-2 rounded-lg text-xs transition">
                                            Aviso
                                        </button>
                                        <button type="button" onclick="ColetasBuilderService.copiarLink('${l.token}')" class="w-full sm:w-auto bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 font-bold px-3 py-2 rounded-lg text-xs transition">
                                            Copiar URL
                                        </button>
                                        <button type="button" onclick="ColetasBuilderService.abrirModalEditarLink('${coletaId}', ${index})" class="w-full sm:w-auto bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold px-3 py-2 rounded-lg text-xs transition">
                                            Editar
                                        </button>
                                        <button type="button" onclick="ColetasBuilderService.removerLink('${coletaId}', ${index})" class="w-full sm:w-auto bg-white hover:bg-red-50 text-red-600 border border-red-200 px-3 py-2 rounded-lg text-xs font-bold transition">
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

                        <div class="bg-white p-5 rounded-xl border border-slate-200 mb-5">
                            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-100 pb-3 mb-3 gap-3">
                                <label class="block text-xs font-bold text-slate-700 uppercase">Escopo de Preenchimento (Permissões):</label>
                                <div class="flex items-center gap-3 w-full sm:w-auto">
                                    <input type="text" onkeyup="ColetasBuilderService.filtrarLista(this.value, 'container-opcoes-campos', '.campo-checkbox', '.campo-texto')" placeholder="Pesquisar..." class="p-2 border border-slate-300 rounded-lg text-xs outline-none focus:border-blue-500 w-full sm:w-48">
                                    <label class="flex items-center gap-1.5 cursor-pointer text-xs font-bold text-blue-700 whitespace-nowrap">
                                        <input type="checkbox" onchange="ColetasBuilderService.toggleSelectAll(this.checked, 'container-opcoes-campos')" class="rounded border-blue-300 text-blue-600 focus:ring-blue-500"> 
                                        Selecionar Visíveis
                                    </label>
                                </div>
                            </div>
                            ${campos.length === 0 ? '<p class="text-xs text-red-500 font-medium">Configure as perguntas no Bloco 1 primeiro.</p>' : `
                                <div id="container-opcoes-campos" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-60 overflow-y-auto pr-2">
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
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-100 pb-4 mb-5 gap-4">
                        <h3 class="text-lg font-black text-slate-800">3. Sincronização Externa (Google Sheets)</h3>
                        <button type="button" onclick="ColetasBuilderService.abrirModalAjudaSheets()" class="w-full sm:w-auto text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold px-4 py-2 rounded-lg border border-blue-200 transition uppercase tracking-wide">
                            Guia de Integração e Script
                        </button>
                    </div>
                    
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

            <!-- MODAL CAIXA DE ENTRADA (MENSAGENS DOS ÓRGÃOS) -->
            <div id="modal-caixa-entrada" class="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 hidden p-4 animate-fade-in backdrop-blur-sm">
                <div class="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 flex flex-col max-h-[90vh]">
                    <div class="flex justify-between items-center mb-5 border-b border-slate-100 pb-4">
                        <div>
                            <h3 class="text-lg font-black text-slate-800 uppercase tracking-wide">Caixa de Entrada</h3>
                            <p class="text-xs text-slate-500 font-medium mt-1">Dúvidas e mensagens enviadas pelos órgãos parceiros.</p>
                        </div>
                        <button onclick="document.getElementById('modal-caixa-entrada').classList.add('hidden')" class="text-slate-400 hover:text-red-500 font-bold text-xl transition">&times;</button>
                    </div>
                    
                    <div id="lista-caixa-entrada" class="space-y-3 overflow-y-auto pr-2 mb-4 flex-1">
                        <div class="p-8 text-center text-slate-400 font-bold animate-pulse">Carregando mensagens...</div>
                    </div>

                    <div class="pt-4 border-t border-slate-100">
                        <button onclick="document.getElementById('modal-caixa-entrada').classList.add('hidden')" class="w-full sm:w-auto bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-bold py-2.5 px-6 rounded-lg transition uppercase text-xs tracking-wider float-right">Fechar Caixa</button>
                    </div>
                </div>
            </div>

            <!-- MODAL AVISOS / COMUNICADOS -->
            <div id="modal-comunicado" class="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 hidden p-4 animate-fade-in backdrop-blur-sm">
                <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
                    <div class="flex justify-between items-center mb-5 border-b border-slate-100 pb-4">
                        <h3 class="text-lg font-black text-slate-800 uppercase tracking-wide">Enviar Comunicado</h3>
                        <button onclick="document.getElementById('modal-comunicado').classList.add('hidden')" class="text-slate-400 hover:text-red-500 font-bold text-xl transition">&times;</button>
                    </div>
                    <div class="space-y-4">
                        <p class="text-sm text-slate-600 font-medium">O destinatário verá esta mensagem em formato de Pop-up na próxima vez que abrir o formulário.</p>
                        <div>
                            <label class="block text-xs font-bold text-slate-500 uppercase mb-1.5">Destinatário</label>
                            <input type="text" id="aviso-orgao-alvo" disabled class="w-full p-3 bg-slate-100 border border-slate-200 rounded-xl text-sm font-bold text-slate-700">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-500 uppercase mb-1.5">Mensagem do Comunicado</label>
                            <textarea id="aviso-mensagem" rows="4" placeholder="Digite o aviso (ex: Prazo de fechamento alterado para o dia 30...)" class="w-full p-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-y"></textarea>
                        </div>
                        <div class="flex flex-col sm:flex-row gap-3 pt-3">
                            <button onclick="document.getElementById('modal-comunicado').classList.add('hidden')" class="flex-1 p-3 border border-slate-300 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition text-sm">Cancelar</button>
                            <button onclick="ColetasBuilderService.salvarAviso('${coletaId}')" class="flex-1 p-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-sm transition text-sm">Publicar Aviso</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- MODAIS DIVERSOS (INVISÍVEIS POR PADRÃO) -->
            <div id="modal-editar-campo" class="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 hidden p-4 animate-fade-in backdrop-blur-sm"></div>
            <div id="modal-config-metricas" class="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 hidden p-4 animate-fade-in backdrop-blur-sm"></div>
            <div id="modal-compartilhamento" class="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 hidden p-4 animate-fade-in backdrop-blur-sm"></div>
            <div id="modal-ajuda-sheets" class="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 hidden p-4 animate-fade-in backdrop-blur-sm"></div>
            
            <!-- MODAL DE EDIÇÃO DE LINK -->
            <div id="modal-editar-link" class="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 hidden p-4 animate-fade-in backdrop-blur-sm"></div>
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

    atualizarDicaExemplo(tipo, containerDicaId, containerOpcoesId) {
        const dicas = {
            'numero': 'Apenas números (aceita decimais). Ideal para quantidades (Ex: Qtd de Atendimentos, Renda). O BI calculará Soma, Média e Desvio.',
            'numero_idade': 'Apenas números inteiros. Específico para IDADES. O BI focará em calcular a Média e a Frequência (Quantas pessoas de cada idade).',
            'texto_curto': 'Respostas diretas de 1 linha. Ideal para: Nome, Cidade, Profissão, CPF.',
            'texto_longo': 'Textos longos com quebra de linha. Ideal para: Observações, Resumo do caso, Pareceres.',
            'data': 'Abre um calendário interativo para o usuário. Ideal para: Data de Nascimento, Data de Agendamento.',
            'booleano': 'Cria uma escolha rápida, binária e obrigatória entre "Sim" e "Não".',
            'selecao': 'Menu Dropdown (Lista suspensa). Ideal quando há MUITAS opções (Ex: Estados do Brasil, Cidades, Bairros).',
            'multipla_escolha': 'Mostra todas as opções na tela como bolhas marcáveis. Ideal para POUCAS opções (Ex: Gênero, Escolaridade).'
        };

        const elDica = document.getElementById(containerDicaId);
        if (elDica) {
            elDica.innerHTML = `<span class="font-black text-blue-700 uppercase tracking-widest text-[10px]">COMO FUNCIONA:</span> <br> ${dicas[tipo] || ''}`;
        }

        const containerOpcoes = document.getElementById(containerOpcoesId);
        if (containerOpcoes) {
            if (tipo === 'selecao' || tipo === 'multipla_escolha') {
                containerOpcoes.classList.remove('hidden');
            } else {
                containerOpcoes.classList.add('hidden');
            }
        }
    },

    // ============================================================
    // CAIXA DE ENTRADA (MENSAGENS DOS ÓRGÃOS)
    // ============================================================
    async abrirCaixaMensagens(coletaId) {
        document.getElementById('modal-caixa-entrada').classList.remove('hidden');
        const containerLista = document.getElementById('lista-caixa-entrada');
        
        try {
            const db = window.app.db;
            const q = query(collection(db, "respostas_coleta"), where("coletaId", "==", coletaId));
            const snap = await getDocs(q);
            
            let mensagens = [];
            snap.forEach(doc => {
                const r = doc.data();
                if (r.isMensagemSuporte) {
                    mensagens.push({ id: doc.id, ...r });
                }
            });

            mensagens.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            if (mensagens.length === 0) {
                containerLista.innerHTML = `<p class="text-sm text-slate-400 italic text-center p-8 bg-slate-50 rounded-xl">Caixa de entrada vazia. Nenhuma mensagem recebida.</p>`;
                return;
            }

            containerLista.innerHTML = mensagens.map(m => `
                <div class="bg-white border border-slate-200 p-4 rounded-xl shadow-sm hover:border-blue-300 transition">
                    <div class="flex justify-between items-start mb-2">
                        <div>
                            <span class="font-black text-slate-800 text-sm uppercase">${escapeHTML(m.orgaoOrigem)}</span>
                            <span class="text-xs text-slate-500 ml-2">(${escapeHTML(m.responsavel)})</span>
                        </div>
                        <div class="flex flex-col items-end">
                            <span class="text-[10px] font-bold text-slate-400">${new Date(m.timestamp).toLocaleString('pt-BR')}</span>
                            <button onclick="ColetasBuilderService.excluirMensagem('${m.id}', this)" class="text-[10px] text-red-500 font-bold hover:underline mt-1 uppercase">Excluir</button>
                        </div>
                    </div>
                    <div class="bg-slate-50 p-3 rounded-lg border border-slate-100 mt-2">
                        <p class="text-sm text-slate-700 whitespace-pre-wrap">${escapeHTML(m.textoMensagem)}</p>
                    </div>
                </div>
            `).join('');

        } catch (e) {
            console.error(e);
            containerLista.innerHTML = `<p class="text-red-500 font-bold text-center">Erro ao carregar mensagens.</p>`;
        }
    },

    async excluirMensagem(msgId, btnElement) {
        if (!confirm("Deseja realmente apagar esta mensagem da Caixa de Entrada?")) return;
        try {
            const db = window.app.db;
            await deleteDoc(doc(db, "respostas_coleta", msgId));
            
            const card = btnElement.closest('.bg-white');
            if (card) card.remove();
            
            showNotification("Mensagem apagada.", "success");
            
            const containerLista = document.getElementById('lista-caixa-entrada');
            if (containerLista.children.length === 0) {
                containerLista.innerHTML = `<p class="text-sm text-slate-400 italic text-center p-8 bg-slate-50 rounded-xl">Caixa de entrada vazia.</p>`;
            }
        } catch (e) {
            console.error(e);
            showNotification("Erro ao excluir mensagem.", "error");
        }
    },

    // ============================================================
    // MONITORAMENTO EM TEMPO REAL
    // ============================================================
    async _monitorarAtividadeLinks(coletaId, links) {
        if (links.length === 0) return;
        
        try {
            const db = window.app.db;
            const q = query(collection(db, "respostas_coleta"), where("coletaId", "==", coletaId));
            const snap = await getDocs(q);
            
            const atividadeOrgao = {};
            snap.forEach(doc => {
                const r = doc.data();
                if (r.isMensagemSuporte) return;

                const org = r.orgaoOrigem;
                if (org && r.timestamp) {
                    const dataAtual = new Date(r.timestamp);
                    if (!atividadeOrgao[org]) {
                        atividadeOrgao[org] = { maxData: dataAtual, count: 1 };
                    } else {
                        atividadeOrgao[org].count += 1;
                        if (dataAtual > atividadeOrgao[org].maxData) {
                            atividadeOrgao[org].maxData = dataAtual;
                        }
                    }
                }
            });

            const agora = new Date();

            links.forEach((l, index) => {
                const statusDot = document.getElementById(`status-dot-${index}`);
                const statusText = document.getElementById(`status-text-${index}`);
                if (!statusDot || !statusText) return;

                const atv = atividadeOrgao[l.orgao];
                if (!atv) {
                    statusDot.className = 'h-2.5 w-2.5 rounded-full bg-slate-300';
                    statusText.textContent = 'Sem registros (Pendente)';
                    statusText.className = 'text-[10px] font-bold text-slate-500 uppercase tracking-wider';
                } else {
                    const diffDias = Math.floor((agora - atv.maxData) / (1000 * 60 * 60 * 24));
                    const dataStr = atv.maxData.toLocaleDateString('pt-BR');
                    
                    if (diffDias <= 2) {
                        statusDot.className = 'h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse';
                        statusText.textContent = `Ativo (Último: ${dataStr}) • ${atv.count} Envios`;
                        statusText.className = 'text-[10px] font-bold text-emerald-600 uppercase tracking-wider';
                    } else if (diffDias <= 7) {
                        statusDot.className = 'h-2.5 w-2.5 rounded-full bg-amber-500';
                        statusText.textContent = `Ocioso (Último: ${dataStr}) • ${atv.count} Envios`;
                        statusText.className = 'text-[10px] font-bold text-amber-600 uppercase tracking-wider';
                    } else {
                        statusDot.className = 'h-2.5 w-2.5 rounded-full bg-red-500';
                        statusText.textContent = `Inativo há ${diffDias} dias • ${atv.count} Envios`;
                        statusText.className = 'text-[10px] font-bold text-red-600 uppercase tracking-wider';
                    }
                }
            });

        } catch (e) {
            console.error("Erro no monitoramento de atividade:", e);
        }
    },

    // ============================================================
    // AVISOS E COMUNICADOS
    // ============================================================
    abrirModalAviso(coletaId, orgaoAlvo) {
        document.getElementById('aviso-orgao-alvo').value = orgaoAlvo;
        document.getElementById('aviso-mensagem').value = '';
        document.getElementById('modal-comunicado').classList.remove('hidden');
    },

    async salvarAviso(coletaId) {
        const orgaoAlvo = document.getElementById('aviso-orgao-alvo').value;
        const mensagem = document.getElementById('aviso-mensagem').value.trim();

        if (!mensagem) return showNotification("A mensagem não pode estar vazia.", "warning");

        try {
            const db = window.app.db;
            const docRef = doc(db, "formularios_coleta", coletaId);
            const snap = await getDoc(docRef);
            if (!snap.exists()) return;

            let avisos = snap.data().avisos || [];
            avisos.push({
                id: 'aviso_' + Date.now(),
                orgaoAlvo: orgaoAlvo,
                mensagem: mensagem,
                dataStr: new Date().toLocaleDateString('pt-BR')
            });

            await updateDoc(docRef, { avisos });
            document.getElementById('modal-comunicado').classList.add('hidden');
            showNotification("Comunicado publicado. O órgão será notificado.", "success");
            window.abrirConstrutor(coletaId);
        } catch (e) {
            console.error(e);
            showNotification("Erro ao publicar comunicado.", "error");
        }
    },

    async apagarAviso(coletaId, avisoId) {
        if (!confirm("Deseja apagar este comunicado?")) return;
        try {
            const db = window.app.db;
            const docRef = doc(db, "formularios_coleta", coletaId);
            const snap = await getDoc(docRef);
            if (!snap.exists()) return;

            let avisos = snap.data().avisos || [];
            avisos = avisos.filter(a => a.id !== avisoId);

            await updateDoc(docRef, { avisos });
            showNotification("Comunicado removido.", "info");
            window.abrirConstrutor(coletaId);
        } catch (e) {
            console.error(e);
            showNotification("Erro ao excluir comunicado.", "error");
        }
    },

    // ============================================================
    // DEMAIS FUNÇÕES DO BUILDER...
    // ============================================================
    filtrarLista(texto, containerId, containerClass, textClass) {
        const termo = limparTexto(texto).toLowerCase();
        const container = document.getElementById(containerId);
        if(!container) return;

        const itens = container.querySelectorAll(containerClass);
        itens.forEach(item => {
            const spanTexto = item.querySelector(textClass);
            if(spanTexto) {
                const textoItem = limparTexto(spanTexto.textContent).toLowerCase();
                item.style.display = textoItem.includes(termo) ? '' : 'none';
            }
        });
    },

    toggleSelectAll(checked, containerId) {
        const container = document.getElementById(containerId);
        if(!container) return;
        const checkboxes = container.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(cb => {
            if(cb.closest('label').style.display !== 'none') {
                cb.checked = checked;
            }
        });
    },

    async salvarStatusEValidade(coletaId) {
        try {
            const status = document.getElementById('config-status-form').value;
            const dataInicio = document.getElementById('config-data-inicio').value;
            const dataFim = document.getElementById('config-data-fim').value;

            const db = window.app.db;
            await updateDoc(doc(db, "formularios_coleta", coletaId), { 
                status: status,
                dataInicio: dataInicio,
                dataFim: dataFim
            });
            showNotification("Regras operacionais atualizadas.", "success");
        } catch (e) {
            console.error(e);
            showNotification("Erro ao atualizar status.", "error");
        }
    },

    abrirModalCompartilhamento(coletaId) {
        let modal = document.getElementById('modal-compartilhamento');
        if (modal) modal.classList.remove('hidden');
    },

    async adicionarCompartilhamento(coletaId) {
        const alvo = document.getElementById('input-compartilhar-alvo').value.trim().toLowerCase();
        if (!alvo) return showNotification("Informe um e-mail ou Pauta válida.", "warning");

        try {
            const db = window.app.db;
            const docRef = doc(db, "formularios_coleta", coletaId);
            const snap = await getDoc(docRef);
            if (!snap.exists()) return;

            let comp = snap.data().compartilhadoCom || [];
            if (!comp.includes(alvo)) {
                comp.push(alvo);
                await updateDoc(docRef, { compartilhadoCom: comp });
                showNotification("Acesso concedido.", "success");
                window.abrirConstrutor(coletaId);
            } else {
                showNotification("Usuário já possui acesso.", "info");
            }
        } catch (e) {
            console.error(e);
            showNotification("Erro ao conceder acesso.", "error");
        }
    },

    async removerCompartilhamento(coletaId, alvo) {
        if (!confirm(`Remover acesso de ${alvo}?`)) return;
        try {
            const db = window.app.db;
            const docRef = doc(db, "formularios_coleta", coletaId);
            const snap = await getDoc(docRef);
            if (!snap.exists()) return;

            let comp = snap.data().compartilhadoCom || [];
            comp = comp.filter(e => e !== alvo);
            await updateDoc(docRef, { compartilhadoCom: comp });
            
            showNotification("Acesso removido.", "info");
            window.abrirConstrutor(coletaId);
        } catch (e) {
            console.error(e);
            showNotification("Erro ao remover acesso.", "error");
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

            this._campoEditandoIndex = index;
            this._coletaIdEditando = coletaId;

            let modal = document.getElementById('modal-editar-campo');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'modal-editar-campo';
                modal.className = 'fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-4 animate-fade-in backdrop-blur-sm';
                document.body.appendChild(modal);
            }

            const isOpcoesRequired = ['selecao', 'multipla_escolha'].includes(campo.tipo);
            const opcoesStr = (campo.opcoes || []).join(', ');

            modal.innerHTML = `
                <div class="bg-white rounded-2xl max-w-lg w-full shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
                    <div class="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50">
                        <h3 class="text-lg font-black text-slate-800 uppercase tracking-wide">Editar Pergunta</h3>
                        <button onclick="document.getElementById('modal-editar-campo').classList.add('hidden')" class="text-slate-400 hover:text-red-500 font-bold text-xl transition">&times;</button>
                    </div>
                    
                    <div class="p-6 space-y-5 overflow-y-auto">
                        <div>
                            <label class="block text-xs font-bold text-slate-500 uppercase mb-1.5">Enunciado da Pergunta</label>
                            <input type="text" id="edit-campo-label" value="${escapeHTML(campo.label)}" class="w-full p-3.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium">
                        </div>
                        
                        <div>
                            <label class="block text-xs font-bold text-slate-500 uppercase mb-1.5">Tipo Estrutural</label>
                            <select id="edit-campo-tipo" onchange="ColetasBuilderService.atualizarDicaExemplo(this.value, 'dica-edit-campo', 'edit-container-opcoes')" class="w-full p-3.5 border border-slate-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none font-medium">
                                <option value="numero" ${campo.tipo === 'numero' ? 'selected' : ''}>Número Estatístico (Somas Gerais)</option>
                                <option value="numero_idade" ${campo.tipo === 'numero_idade' ? 'selected' : ''}>Idade (Apenas Números Inteiros)</option>
                                <option value="texto_curto" ${campo.tipo === 'texto_curto' ? 'selected' : ''}>Texto Curto (1 linha)</option>
                                <option value="texto_longo" ${campo.tipo === 'texto_longo' ? 'selected' : ''}>Parágrafo (Várias linhas)</option>
                                <option value="data" ${campo.tipo === 'data' ? 'selected' : ''}>Data</option>
                                <option value="booleano" ${campo.tipo === 'booleano' ? 'selected' : ''}>Sim / Não</option>
                                <option value="selecao" ${campo.tipo === 'selecao' ? 'selected' : ''}>Lista Suspensa (Dropdown)</option>
                                <option value="multipla_escolha" ${campo.tipo === 'multipla_escolha' ? 'selected' : ''}>Múltipla Escolha (Bolhas)</option>
                            </select>
                        </div>
                        
                        <!-- CAIXA DE DICAS AUTOMÁTICA -->
                        <div id="dica-edit-campo" class="text-xs text-blue-800 bg-blue-50 p-4 rounded-xl border border-blue-100 font-medium leading-relaxed"></div>

                        <div id="edit-container-opcoes" class="${isOpcoesRequired ? '' : 'hidden'}">
                            <label class="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Opções de Resposta (separadas por vírgula)</label>
                            <input type="text" id="edit-campo-opcoes" value="${escapeHTML(opcoesStr)}" placeholder="Ex: Fundamental, Médio, Superior" class="w-full p-3.5 border border-slate-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none font-medium">
                        </div>
                    </div>
                    
                    <div class="flex flex-col sm:flex-row gap-3 p-6 mt-auto border-t border-slate-100 bg-slate-50">
                        <button onclick="document.getElementById('modal-editar-campo').classList.add('hidden')" class="flex-1 p-3.5 border border-slate-300 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition text-sm">Cancelar</button>
                        <button onclick="ColetasBuilderService.salvarEdicaoCampo()" class="flex-1 p-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-sm transition text-sm">Salvar Alterações</button>
                    </div>
                </div>
            `;
            modal.classList.remove('hidden');
            
            // Dispara logo de cara para mostrar a dica correta ao abrir
            this.atualizarDicaExemplo(campo.tipo, 'dica-edit-campo', 'edit-container-opcoes');

        } catch (e) {
            console.error(e);
            showNotification("Falha ao abrir modal de edição.", "error");
        }
    },

    async salvarEdicaoCampo() {
        const index = this._campoEditandoIndex;
        const coletaId = this._coletaIdEditando;
        
        if (index === null || !coletaId) return;

        const labelInput = document.getElementById('edit-campo-label').value;
        const tipoInput = document.getElementById('edit-campo-tipo').value;
        const opcoesInput = document.getElementById('edit-campo-opcoes').value;

        const labelLimpo = limparTexto(labelInput);
        if (!labelLimpo) return showNotification("Operação cancelada. Enunciado inválido.", "error");

        let novasOpcoes = [];
        if (tipoInput === 'selecao' || tipoInput === 'multipla_escolha') {
            novasOpcoes = opcoesInput.split(',').map(o => limparTexto(o)).filter(o => o !== '');
            if (novasOpcoes.length === 0) return showNotification("Preencha as opções separadas por vírgula.", "warning");
        }

        try {
            const db = window.app.db;
            const docRef = doc(db, "formularios_coleta", coletaId);
            const snap = await getDoc(docRef);
            if (!snap.exists()) return;

            let campos = snap.data().dicionarioDeCampos || [];
            if (!campos[index]) return;

            campos[index] = {
                ...campos[index],
                label: labelLimpo,
                tipo: tipoInput,
                opcoes: novasOpcoes
            };

            await updateDoc(docRef, { dicionarioDeCampos: campos });
            
            document.getElementById('modal-editar-campo').classList.add('hidden');
            showNotification("Campo atualizado com sucesso.", "success");
            window.abrirConstrutor(coletaId);
        } catch (e) {
            console.error(e);
            showNotification("Erro ao atualizar campo.", "error");
        }
    },

    initEventos(db, coletaId, coletaData) {
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
            
            const checkboxes = document.querySelectorAll('#container-opcoes-campos input[name="campos_link"]:checked');
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
            await updateDoc(doc(db, "formularios_coleta", coletaId), { urlSincronizacaoSheets: urlPlanilha.trim() });
            showNotification("Integração habilitada.", "success");
            window.abrirConstrutor(coletaId);
        } catch (e) { console.error(e); showNotification("Erro ao salvar.", "error"); }
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
        } catch (e) { console.error(e); showNotification("Falha na reordenação.", "error"); }
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
        } catch (e) { console.error(e); }
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
        } catch (e) { console.error(e); }
    },

    async apagarTodasPerguntas(coletaId) {
        if (!confirm("Ação destrutiva: Deseja apagar todas as perguntas configuradas?")) return;
        try {
            const db = window.app.db;
            await updateDoc(doc(db, "formularios_coleta", coletaId), { dicionarioDeCampos: [] });
            showNotification("Estrutura redefinida.", "success");
            window.abrirConstrutor(coletaId);
        } catch (e) { console.error(e); }
    },

    async importarJsonLivre(coletaId, coletaData) {
        const jsonInput = prompt("Cole o JSON com a estrutura do dicionário de dados:");
        if (!jsonInput) return;

        try {
            const novasPerguntas = JSON.parse(jsonInput);
            if (!Array.isArray(novasPerguntas)) return showNotification("Falha de validação: JSON deve conter uma lista.", "error");

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
        } catch (e) { console.error(e); showNotification("Falha de sintaxe no JSON.", "error"); }
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
        } catch (e) { console.error(e); }
    },

    async apagarTodosLinks(coletaId) {
        if (!confirm("Ação destrutiva: Todos os órgãos parceiros perderão o acesso ao formulário. Prosseguir?")) return;
        try {
            const db = window.app.db;
            await updateDoc(doc(db, "formularios_coleta", coletaId), { linksExternos: [] });
            showNotification("Todos os acessos foram revogados.", "success");
            window.abrirConstrutor(coletaId);
        } catch (e) { console.error(e); }
    },

    async limparRespostas(coletaId) {
        if (!confirm("Ação destrutiva irreversível: Todos os registros de BI desta coleta serão deletados. Continuar?")) return;
        try {
            const db = window.app.db;
            const q = query(collection(db, "respostas_coleta"), where("coletaId", "==", coletaId));
            const snapshot = await getDocs(q);

            if (snapshot.empty) return showNotification("A base já se encontra vazia.", "info");

            const batch = writeBatch(db);
            snapshot.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();

            showNotification("Base de dados zerada.", "success");
            window.verResultados(coletaId);
        } catch (e) { console.error(e); }
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
        } catch (e) { console.error(e); }
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
    },

    abrirModalAjudaSheets() {
        const modal = document.getElementById('modal-ajuda-sheets');
        if (modal) modal.classList.remove('hidden');
    },

    fecharModalAjudaSheets() {
        const modal = document.getElementById('modal-ajuda-sheets');
        if (modal) modal.classList.add('hidden');
    },

    copiarScriptSheets() {
        const codigo = document.getElementById('codigo-script-sheets').innerText;
        navigator.clipboard.writeText(codigo).then(() => {
            showNotification("Script copiado para a área de transferência.", "success");
        }).catch(() => { showNotification("Falha ao copiar o script. Copie manualmente.", "error"); });
    }
};

window.ColetasBuilderService = ColetasBuilderService;
