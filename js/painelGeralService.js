// js/painelGeralService.js - MONITOR DE PRODUTIVIDADE (MODAL PADRONIZADO E DETALHADO)

import { escapeHTML } from './utils.js';

export const PainelGeralService = {
    // ========================================================
    // 1. INJEÇÃO DO BOTÃO NO MENU DE AÇÕES
    // ========================================================
    injetarBotao(app) {
        // A injeção e o controle de permissão continuam no main.js e ui.js,
        // Mas podemos manter a lógica de atualização em tempo real aqui
        const modal = document.getElementById('painel-geral-externo-modal');
        if (modal && !modal.classList.contains('hidden')) {
            this.atualizarConteudo(app);
        }
    },

    // ========================================================
    // 2. CONSTRUÇÃO DO MODAL CENTRAL
    // ========================================================
    abrirPainel(app) {
        let modal = document.getElementById('painel-geral-externo-modal');
        
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'painel-geral-externo-modal';
            // Usa as mesmas classes dos outros modais grandes do sistema (z-50, fundo preto translúcido, etc)
            modal.className = 'fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-[100] p-2 sm:p-4 transition-opacity';
            
            modal.innerHTML = `
                <div class="bg-white shadow-2xl w-full max-w-5xl flex flex-col h-full sm:h-auto sm:rounded-xl sm:max-h-[95vh]" style="max-height: 100vh;">
                    
                    <div class="flex justify-between items-center p-3 sm:p-5 border-b bg-emerald-50 shrink-0 sm:rounded-t-xl">
                        <div class="flex items-center gap-3">
                            <span class="text-2xl sm:text-3xl text-emerald-600 bg-white p-2 rounded-lg shadow-sm">📊</span>
                            <div>
                                <h2 class="text-base sm:text-xl font-black text-emerald-800 uppercase tracking-wide">Monitor de Produtividade</h2>
                                <p class="text-[10px] sm:text-xs font-semibold text-emerald-600 mt-0.5">Visão Geral da Equipe e Atendimentos</p>
                            </div>
                        </div>
                        <button id="close-painel-geral-modal-btn" class="text-emerald-300 hover:text-emerald-600 bg-white hover:bg-emerald-100 rounded-lg p-2 transition-colors text-2xl font-bold leading-none w-10 h-10 flex items-center justify-center shadow-sm">&times;</button>
                    </div>
                    
                    <div id="painel-monitor-body" class="flex-grow overflow-y-auto p-3 sm:p-6 bg-slate-50 scrollable-content">
                        <div id="painel-monitor-conteudo" class="space-y-6">
                            <div class="flex justify-center py-10">
                                <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600"></div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="p-3 sm:p-4 border-t bg-white shrink-0 sm:rounded-b-xl flex justify-end">
                        <button id="btn-fechar-painel-baixo" class="w-full sm:w-auto bg-gray-200 text-gray-800 font-bold py-2.5 px-6 rounded-lg hover:bg-gray-300 transition-colors">Fechar Painel</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);

            // Fechamento pelo X ou Botão Fechar
            const closeActions = () => {
                modal.classList.add('hidden');
            };
            document.getElementById('close-painel-geral-modal-btn').onclick = closeActions;
            document.getElementById('btn-fechar-painel-baixo').onclick = closeActions;

            // Fechamento clicando fora do modal (no fundo escuro)
            modal.onclick = (e) => {
                if (e.target === modal) closeActions();
            };
        }

        modal.classList.remove('hidden');
        this.atualizarConteudo(app);
    },

    // ========================================================
    // 3. PROCESSAMENTO DE DADOS (CRUZAMENTO DE TABELAS)
    // ========================================================
    atualizarConteudo(app) {
        const conteudo = document.getElementById('painel-monitor-conteudo');
        if (!conteudo) return;

        const todos = app.allAssisted || [];
        const colaboradoresDb = app.colaboradores || [];
        
        // Filtros de demandas externas
        const emMesa = todos.filter(a => a.status === 'emAtendimento' && a.delegationToken); 
        const distrib = todos.filter(a => a.status === 'aguardandoDistribuicao');
        const correcao = todos.filter(a => a.status === 'aguardandoCorrecao');
        const finalizados = todos.filter(a => a.status === 'atendido' && a.finalizadoPeloColaborador);

        // Agrupamento dos colaboradores cadastrados
        const defensores = colaboradoresDb.filter(c => c.cargo?.toLowerCase().includes('defensor'));
        const servidores = colaboradoresDb.filter(c => !c.cargo?.toLowerCase().includes('defensor'));

        // ====================================================
        // GERAÇÃO DE HTML: DEFENSORES
        // ====================================================
        const countDefensores = {};
        // Inicializa com TODOS os defensores cadastrados
        defensores.forEach(d => { 
            countDefensores[d.nome] = { distrib: [], correcao: [], dataObj: d }; 
        });

        // Adiciona as demandas para quem tem
        [...distrib, ...correcao].forEach(a => {
            const def = a.defensorResponsavel || 'Não Atribuído';
            if(!countDefensores[def]) countDefensores[def] = { distrib: [], correcao: [], dataObj: { nome: def, cargo: 'Defensor(a)' } };
            
            if(a.status === 'aguardandoDistribuicao') countDefensores[def].distrib.push(a);
            if(a.status === 'aguardandoCorrecao') countDefensores[def].correcao.push(a);
        });

        let defensoresHtml = '';
        Object.keys(countDefensores).sort().forEach(def => {
            const stats = countDefensores[def];
            const isLivre = stats.distrib.length === 0 && stats.correcao.length === 0;
            
            let statusVisual = isLivre 
                ? `<span class="bg-emerald-100 text-emerald-700 px-3 py-1 rounded border border-emerald-200 shadow-sm font-black text-[10px] flex items-center gap-1.5"><span class="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span> TOTALMENTE LIVRE</span>`
                : `<div class="flex gap-2">
                     ${stats.distrib.length > 0 ? `<span class="bg-cyan-100 text-cyan-800 px-2.5 py-1 rounded text-[10px] font-black shadow-sm border border-cyan-200">${stats.distrib.length} Assinatura(s)</span>` : ''}
                     ${stats.correcao.length > 0 ? `<span class="bg-amber-100 text-amber-800 px-2.5 py-1 rounded text-[10px] font-black shadow-sm border border-amber-200">${stats.correcao.length} Correção(ões)</span>` : ''}
                   </div>`;

            // Detalhamento das peças (abre uma lista dentro do card)
            let detalhesHtml = '';
            if (!isLivre) {
                detalhesHtml = `<div class="mt-3 space-y-1.5 border-t border-blue-100 pt-3 pl-2 sm:pl-4">`;
                
                stats.distrib.forEach(a => {
                    detalhesHtml += `
                        <div class="flex justify-between items-center text-xs bg-white p-2 rounded border border-cyan-100">
                            <div class="flex flex-col">
                                <span class="font-bold text-gray-800">${escapeHTML(a.name)}</span>
                                <span class="text-[9px] text-gray-500">${escapeHTML(a.subject || 'S/ Assunto')}</span>
                            </div>
                            <span class="bg-cyan-50 text-cyan-600 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase">Assinar</span>
                        </div>`;
                });

                stats.correcao.forEach(a => {
                    detalhesHtml += `
                        <div class="flex justify-between items-center text-xs bg-white p-2 rounded border border-amber-100">
                            <div class="flex flex-col">
                                <span class="font-bold text-gray-800">${escapeHTML(a.name)}</span>
                                <span class="text-[9px] text-gray-500">${escapeHTML(a.subject || 'S/ Assunto')}</span>
                                ${a.enviadoPor ? `<span class="text-[9px] font-semibold text-amber-500">De: ${escapeHTML(a.enviadoPor)}</span>` : ''}
                            </div>
                            <span class="bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase">Corrigir</span>
                        </div>`;
                });
                detalhesHtml += `</div>`;
            }

            const presença = stats.dataObj.presente ? '<span class="text-green-500 ml-1" title="Presente">●</span>' : '<span class="text-gray-300 ml-1" title="Ausente">●</span>';

            defensoresHtml += `
                <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4 shadow-sm hover:shadow transition-shadow">
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                        <div>
                            <h3 class="font-black text-blue-900 text-sm flex items-center">👨‍⚖️ ${escapeHTML(def)} ${presença}</h3>
                            <p class="text-[10px] font-semibold text-blue-600 uppercase mt-0.5">Defensor(a) ${stats.dataObj.equipe ? '- Equipe ' + stats.dataObj.equipe : ''}</p>
                        </div>
                        ${statusVisual}
                    </div>
                    ${detalhesHtml}
                </div>
            `;
        });
        if(!defensoresHtml) defensoresHtml = '<p class="text-sm text-gray-400 italic text-center py-4 bg-white rounded-lg border border-dashed">Nenhum defensor cadastrado na pauta.</p>';

        // ====================================================
        // GERAÇÃO DE HTML: SERVIDORES
        // ====================================================
        const countServidores = {};
        // Inicializa com TODOS os servidores cadastrados
        servidores.forEach(s => { 
            countServidores[s.nome] = { mesa: [], dataObj: s }; 
        });

        emMesa.forEach(a => {
            const serv = a.assignedCollaborator?.name || 'Não Atribuído';
            if(!countServidores[serv]) countServidores[serv] = { mesa: [], dataObj: { nome: serv, cargo: 'Servidor' } };
            countServidores[serv].mesa.push(a);
        });

        let servidoresHtml = '';
        Object.keys(countServidores).sort().forEach(serv => {
            const stats = countServidores[serv];
            const isLivre = stats.mesa.length === 0;
            
            let statusVisual = isLivre 
                ? `<span class="bg-emerald-100 text-emerald-700 px-3 py-1 rounded border border-emerald-200 shadow-sm font-black text-[10px] flex items-center gap-1.5"><span class="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span> LIVRE</span>`
                : `<span class="bg-indigo-100 text-indigo-800 px-2.5 py-1 rounded text-[10px] font-black shadow-sm border border-indigo-200">⏳ ${stats.mesa.length} Em Mesa</span>`;

            // Detalhamento
            let detalhesHtml = '';
            if (!isLivre) {
                detalhesHtml = `<div class="mt-3 space-y-1.5 border-t border-purple-100 pt-3 pl-2 sm:pl-4">`;
                stats.mesa.forEach(a => {
                    const hora = a.inAttendanceTime ? new Date(a.inAttendanceTime).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : '';
                    detalhesHtml += `
                        <div class="flex justify-between items-center text-xs bg-white p-2 rounded border border-purple-100">
                            <div class="flex flex-col">
                                <span class="font-bold text-gray-800">${escapeHTML(a.name)}</span>
                                <span class="text-[9px] text-gray-500">${escapeHTML(a.subject || 'S/ Assunto')}</span>
                            </div>
                            <span class="text-[9px] font-black text-purple-400 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-100">${hora}</span>
                        </div>`;
                });
                detalhesHtml += `</div>`;
            }

            const presença = stats.dataObj.presente ? '<span class="text-green-500 ml-1" title="Presente">●</span>' : '<span class="text-gray-300 ml-1" title="Ausente">●</span>';

            servidoresHtml += `
                <div class="bg-purple-50 border border-purple-200 rounded-lg p-3 sm:p-4 shadow-sm hover:shadow transition-shadow">
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                        <div>
                            <h3 class="font-black text-purple-900 text-sm flex items-center">🧑‍💻 ${escapeHTML(serv)} ${presença}</h3>
                            <p class="text-[10px] font-semibold text-purple-600 uppercase mt-0.5">${escapeHTML(stats.dataObj.cargo)} ${stats.dataObj.equipe ? '- Equipe ' + stats.dataObj.equipe : ''}</p>
                        </div>
                        ${statusVisual}
                    </div>
                    ${detalhesHtml}
                </div>
            `;
        });
        if(!servidoresHtml) servidoresHtml = '<p class="text-sm text-gray-400 italic text-center py-4 bg-white rounded-lg border border-dashed">Nenhum servidor cadastrado na pauta.</p>';

        // ====================================================
        // GERAÇÃO DE HTML: FINALIZADOS
        // ====================================================
        const finalizadosOrdenados = finalizados.sort((a, b) => new Date(b.attendedAt || 0) - new Date(a.attendedAt || 0));
        let finalizadosHtml = '';
        
        if (finalizadosOrdenados.length === 0) {
            finalizadosHtml = '<p class="text-sm text-gray-400 italic text-center py-4 bg-white rounded-lg border border-dashed">Nenhum atendimento finalizado pelo fluxo externo.</p>';
        } else {
            finalizadosHtml = `<div class="bg-white border border-green-200 rounded-lg overflow-hidden shadow-sm p-2 space-y-1">`;
            finalizadosHtml += finalizadosOrdenados.map(a => {
                const hora = a.attendedAt ? new Date(a.attendedAt).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : '--:--';
                return `
                    <div class="flex justify-between items-center py-2 px-2 border-b border-green-50 last:border-0 hover:bg-green-50 rounded transition-colors">
                        <div class="flex flex-col truncate pr-3">
                            <span class="font-bold text-xs text-gray-800 truncate">${escapeHTML(a.name)}</span>
                            <span class="text-[9px] text-gray-500 truncate">${escapeHTML(a.subject || 'S/ Assunto')}</span>
                            ${a.attendedBy ? `<span class="text-[9px] text-green-600 font-bold mt-0.5">Por: ${escapeHTML(a.attendedBy)}</span>` : ''}
                        </div>
                        <div class="flex flex-col items-end shrink-0">
                            <span class="text-[9px] font-black text-green-700 bg-green-100 px-1.5 py-0.5 rounded border border-green-200 uppercase">Protocolado</span>
                            <span class="text-[9px] font-bold text-gray-400 mt-1">${hora}</span>
                        </div>
                    </div>
                `;
            }).join('');
            finalizadosHtml += `</div>`;
        }

        // ====================================================
        // RENDERIZAÇÃO FINAL NO MODAL
        // ====================================================
        conteudo.innerHTML = `
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4">
                <div class="bg-white rounded-xl border border-gray-200 p-4 text-center shadow-sm relative overflow-hidden flex flex-col items-center justify-center">
                    <div class="absolute top-0 left-0 w-full h-1 bg-purple-500"></div>
                    <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Mesa Servidor</p>
                    <p class="text-3xl font-black text-purple-600">${emMesa.length}</p>
                </div>
                <div class="bg-white rounded-xl border border-gray-200 p-4 text-center shadow-sm relative overflow-hidden flex flex-col items-center justify-center">
                    <div class="absolute top-0 left-0 w-full h-1 bg-cyan-500"></div>
                    <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">P/ Assinatura</p>
                    <p class="text-3xl font-black text-cyan-600">${distrib.length}</p>
                </div>
                <div class="bg-white rounded-xl border border-gray-200 p-4 text-center shadow-sm relative overflow-hidden flex flex-col items-center justify-center">
                    <div class="absolute top-0 left-0 w-full h-1 bg-amber-500"></div>
                    <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">P/ Avaliação</p>
                    <p class="text-3xl font-black text-amber-500">${correcao.length}</p>
                </div>
                <div class="bg-white rounded-xl border border-gray-200 p-4 text-center shadow-sm relative overflow-hidden flex flex-col items-center justify-center">
                    <div class="absolute top-0 left-0 w-full h-1 bg-green-500"></div>
                    <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Concluídos</p>
                    <p class="text-3xl font-black text-green-600">${finalizados.length}</p>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div class="flex flex-col h-full bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                    <h3 class="font-black text-sm text-purple-700 uppercase tracking-widest mb-4 pb-2 border-b border-purple-100 flex items-center gap-2">
                        <span>🧑‍💻</span> Servidores
                    </h3>
                    <div class="space-y-3">
                        ${servidoresHtml}
                    </div>
                </div>

                <div class="flex flex-col h-full bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                    <h3 class="font-black text-sm text-blue-700 uppercase tracking-widest mb-4 pb-2 border-b border-blue-100 flex items-center gap-2">
                        <span>👨‍⚖️</span> Defensores
                    </h3>
                    <div class="space-y-3">
                        ${defensoresHtml}
                    </div>
                </div>

                <div class="flex flex-col h-full bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                    <h3 class="font-black text-sm text-green-700 uppercase tracking-widest mb-4 pb-2 border-b border-green-100 flex items-center gap-2">
                        <span>✅</span> Últimos Concluídos
                    </h3>
                    <div>
                        ${finalizadosHtml}
                    </div>
                </div>
            </div>
        `;
    }
};
