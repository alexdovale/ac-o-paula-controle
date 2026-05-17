// js/painelGeralService.js - MONITOR DE PRODUTIVIDADE (DASHBOARD PROFISSIONAL)

import { escapeHTML } from './utils.js';

export const PainelGeralService = {
    // ========================================================
    // 1. INJEÇÃO DO BOTÃO NO MENU DE AÇÕES
    // ========================================================
    injetarBotao(app) {
        const modal = document.getElementById('painel-geral-externo-modal');
        if (modal && !modal.classList.contains('hidden')) {
            this.atualizarConteudo(app);
        }
    },

    // ========================================================
    // 2. CONSTRUÇÃO DO MODAL CENTRAL (ESTILO DASHBOARD)
    // ========================================================
    abrirPainel(app) {
        let modal = document.getElementById('painel-geral-externo-modal');
        
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'painel-geral-externo-modal';
            // Fundo escuro com desfoque elegante (backdrop-blur)
            modal.className = 'fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-2 sm:p-6 transition-all duration-300 opacity-100';
            
            modal.innerHTML = `
                <div class="bg-white shadow-2xl w-full max-w-7xl flex flex-col h-full sm:h-auto sm:rounded-2xl sm:max-h-[92vh] overflow-hidden transform scale-100 border border-slate-300">
                    
                    <div class="flex justify-between items-center p-4 sm:p-6 bg-slate-800 text-white shrink-0 relative overflow-hidden">
                        <div class="absolute top-0 right-0 w-64 h-64 bg-emerald-500 opacity-10 rounded-full blur-3xl -mr-10 -mt-20 pointer-events-none"></div>
                        
                        <div class="flex items-center gap-4 relative z-10">
                            <div class="p-2.5 bg-white/10 rounded-xl backdrop-blur-md border border-white/10 shadow-inner">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-400"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
                            </div>
                            <div>
                                <h2 class="text-lg sm:text-2xl font-bold tracking-wide">Monitor de Produtividade</h2>
                                <p class="text-[10px] sm:text-xs font-medium text-slate-300 mt-1">Acompanhamento em tempo real do fluxo externo</p>
                            </div>
                        </div>
                        <button id="close-painel-geral-modal-btn" class="relative z-10 text-slate-400 hover:text-white bg-slate-700/50 hover:bg-slate-700 rounded-lg p-2 transition-all w-10 h-10 flex items-center justify-center font-bold text-xl border border-transparent hover:border-slate-600 shadow-sm">&times;</button>
                    </div>
                    
                    <div id="painel-monitor-body" class="flex-grow overflow-y-auto p-4 sm:p-6 bg-slate-50/80 scrollable-content">
                        <div id="painel-monitor-conteudo" class="space-y-6">
                            <div class="flex justify-center py-20">
                                <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);

            const closeActions = () => { modal.classList.add('hidden'); };
            document.getElementById('close-painel-geral-modal-btn').onclick = closeActions;

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
        
        const emMesa = todos.filter(a => a.status === 'emAtendimento' && a.delegationToken); 
        const distrib = todos.filter(a => a.status === 'aguardandoDistribuicao');
        const correcao = todos.filter(a => a.status === 'aguardandoCorrecao');
        const finalizados = todos.filter(a => a.status === 'atendido' && a.finalizadoPeloColaborador);

        const defensores = colaboradoresDb.filter(c => c.cargo?.toLowerCase().includes('defensor'));
        const servidores = colaboradoresDb.filter(c => !c.cargo?.toLowerCase().includes('defensor'));

        // Função auxiliar para criar as Tags (Badges) de Processo/Agendamento
        const getBadges = (a) => {
            let badges = '';
            if (a.numeroProcesso) {
                badges += `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-slate-100 text-slate-600 border border-slate-200 mt-1" title="Nº do Processo">📄 ${escapeHTML(a.numeroProcesso)}</span>`;
            }
            if (a.numeroAgendamento) {
                badges += `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-indigo-50 text-indigo-600 border border-indigo-100 mt-1" title="Nº do Agendamento">📅 ${escapeHTML(a.numeroAgendamento)}</span>`;
            }
            return badges;
        };

        // ====================================================
        // GERAÇÃO DE HTML: DEFENSORES
        // ====================================================
        const countDefensores = {};
        defensores.forEach(d => { 
            countDefensores[d.nome] = { distrib: [], correcao: [], dataObj: d }; 
        });

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
                ? `<span class="bg-emerald-50 text-emerald-600 px-2 py-1 rounded-lg border border-emerald-100 shadow-sm font-bold text-[10px] flex items-center gap-1.5"><span class="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span> Livre</span>`
                : `<div class="flex gap-2">
                     ${stats.distrib.length > 0 ? `<span class="bg-cyan-50 text-cyan-700 px-2.5 py-1 rounded-lg text-[10px] font-bold shadow-sm border border-cyan-100">${stats.distrib.length} Assinatura(s)</span>` : ''}
                     ${stats.correcao.length > 0 ? `<span class="bg-amber-50 text-amber-700 px-2.5 py-1 rounded-lg text-[10px] font-bold shadow-sm border border-amber-100">${stats.correcao.length} Avaliação(ões)</span>` : ''}
                   </div>`;

            let detalhesHtml = '';
            if (!isLivre) {
                detalhesHtml = `<div class="mt-3 grid grid-cols-1 gap-2 pt-3 border-t border-slate-100">`;
                
                stats.distrib.forEach(a => {
                    detalhesHtml += `
                        <div class="flex justify-between items-start text-xs bg-white p-2.5 rounded-lg border border-slate-200 shadow-sm hover:border-cyan-300 transition-colors">
                            <div class="flex flex-col gap-0.5">
                                <span class="font-bold text-slate-800">${escapeHTML(a.name)}</span>
                                <span class="text-[10px] text-slate-500 truncate max-w-[200px]">${escapeHTML(a.subject || 'S/ Assunto')}</span>
                                <div class="flex flex-wrap gap-1">
                                    ${getBadges(a)}
                                </div>
                            </div>
                            <span class="bg-cyan-50 text-cyan-700 px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider border border-cyan-100 shrink-0">Assinar</span>
                        </div>`;
                });

                stats.correcao.forEach(a => {
                    detalhesHtml += `
                        <div class="flex justify-between items-start text-xs bg-white p-2.5 rounded-lg border border-slate-200 shadow-sm hover:border-amber-300 transition-colors">
                            <div class="flex flex-col gap-0.5">
                                <span class="font-bold text-slate-800">${escapeHTML(a.name)}</span>
                                <span class="text-[10px] text-slate-500 truncate max-w-[200px]">${escapeHTML(a.subject || 'S/ Assunto')}</span>
                                ${a.enviadoPor ? `<span class="text-[9px] font-semibold text-amber-600 mt-1">De: ${escapeHTML(a.enviadoPor)}</span>` : ''}
                                <div class="flex flex-wrap gap-1">
                                    ${getBadges(a)}
                                </div>
                            </div>
                            <span class="bg-amber-50 text-amber-700 px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider border border-amber-100 shrink-0">Avaliar</span>
                        </div>`;
                });
                detalhesHtml += `</div>`;
            }

            const presença = stats.dataObj.presente ? '<span class="text-green-500 ml-1 text-xs" title="Presente">●</span>' : '<span class="text-slate-300 ml-1 text-xs" title="Ausente">●</span>';

            defensoresHtml += `
                <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                        <div>
                            <h3 class="font-black text-slate-800 text-sm flex items-center">👨‍⚖️ ${escapeHTML(def)} ${presença}</h3>
                            <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Defensor(a) ${stats.dataObj.equipe ? '- Eq. ' + stats.dataObj.equipe : ''}</p>
                        </div>
                        ${statusVisual}
                    </div>
                    ${detalhesHtml}
                </div>
            `;
        });
        if(!defensoresHtml) defensoresHtml = '<p class="text-sm text-slate-400 italic text-center py-6 bg-white rounded-xl border border-dashed border-slate-300">Nenhum defensor cadastrado.</p>';

        // ====================================================
        // GERAÇÃO DE HTML: SERVIDORES
        // ====================================================
        const countServidores = {};
        servidores.forEach(s => { countServidores[s.nome] = { mesa: [], dataObj: s }; });

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
                ? `<span class="bg-emerald-50 text-emerald-600 px-2 py-1 rounded-lg border border-emerald-100 shadow-sm font-bold text-[10px] flex items-center gap-1.5"><span class="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span> Livre</span>`
                : `<span class="bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-lg text-[10px] font-bold border border-indigo-100 shadow-sm">⏳ ${stats.mesa.length} Em Mesa</span>`;

            let detalhesHtml = '';
            if (!isLivre) {
                detalhesHtml = `<div class="mt-3 grid grid-cols-1 gap-2 pt-3 border-t border-slate-100">`;
                stats.mesa.forEach(a => {
                    const hora = a.inAttendanceTime ? new Date(a.inAttendanceTime).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : '';
                    detalhesHtml += `
                        <div class="flex justify-between items-start text-xs bg-white p-2.5 rounded-lg border border-slate-200 shadow-sm hover:border-indigo-300 transition-colors">
                            <div class="flex flex-col gap-0.5">
                                <span class="font-bold text-slate-800">${escapeHTML(a.name)}</span>
                                <span class="text-[10px] text-slate-500 truncate max-w-[200px]">${escapeHTML(a.subject || 'S/ Assunto')}</span>
                                <div class="flex flex-wrap gap-1">
                                    ${getBadges(a)}
                                </div>
                            </div>
                            <span class="text-[9px] font-black text-indigo-500 bg-indigo-50 px-1.5 py-1 rounded border border-indigo-100 shrink-0">${hora}</span>
                        </div>`;
                });
                detalhesHtml += `</div>`;
            }

            const presença = stats.dataObj.presente ? '<span class="text-green-500 ml-1 text-xs" title="Presente">●</span>' : '<span class="text-slate-300 ml-1 text-xs" title="Ausente">●</span>';

            servidoresHtml += `
                <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                        <div>
                            <h3 class="font-black text-slate-800 text-sm flex items-center">🧑‍💻 ${escapeHTML(serv)} ${presença}</h3>
                            <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">${escapeHTML(stats.dataObj.cargo)} ${stats.dataObj.equipe ? '- Eq. ' + stats.dataObj.equipe : ''}</p>
                        </div>
                        ${statusVisual}
                    </div>
                    ${detalhesHtml}
                </div>
            `;
        });
        if(!servidoresHtml) servidoresHtml = '<p class="text-sm text-slate-400 italic text-center py-6 bg-white rounded-xl border border-dashed border-slate-300">Nenhum servidor cadastrado.</p>';

        // ====================================================
        // GERAÇÃO DE HTML: FINALIZADOS
        // ====================================================
        const finalizadosOrdenados = finalizados.sort((a, b) => new Date(b.attendedAt || 0) - new Date(a.attendedAt || 0));
        let finalizadosHtml = '';
        
        if (finalizadosOrdenados.length === 0) {
            finalizadosHtml = '<p class="text-sm text-slate-400 italic text-center py-6 bg-white rounded-xl border border-dashed border-slate-300">Nenhum protocolo finalizado hoje.</p>';
        } else {
            finalizadosHtml = `<div class="bg-white border border-slate-200 rounded-xl shadow-sm p-3 space-y-2">`;
            finalizadosHtml += finalizadosOrdenados.map(a => {
                const hora = a.attendedAt ? new Date(a.attendedAt).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : '--:--';
                return `
                    <div class="flex justify-between items-center p-3 border border-slate-100 bg-slate-50/50 hover:bg-slate-100 rounded-lg transition-colors">
                        <div class="flex flex-col truncate pr-3">
                            <span class="font-bold text-xs text-slate-800 truncate">${escapeHTML(a.name)}</span>
                            <span class="text-[10px] text-slate-500 truncate">${escapeHTML(a.subject || 'S/ Assunto')}</span>
                            <div class="flex flex-wrap gap-1">
                                ${getBadges(a)}
                            </div>
                            ${a.attendedBy ? `<span class="text-[9px] text-emerald-600 font-bold mt-1">Por: ${escapeHTML(a.attendedBy)}</span>` : ''}
                        </div>
                        <div class="flex flex-col items-end shrink-0">
                            <span class="text-[9px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200 uppercase tracking-wider shadow-sm">Protocolado</span>
                            <span class="text-[10px] font-bold text-slate-400 mt-1.5">${hora}</span>
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
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm relative overflow-hidden">
                    <div class="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                    <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 pl-2">Em Mesa</p>
                    <p class="text-3xl font-black text-slate-800 pl-2">${emMesa.length}</p>
                </div>
                <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm relative overflow-hidden">
                    <div class="absolute top-0 left-0 w-1 h-full bg-cyan-500"></div>
                    <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 pl-2">Assinaturas</p>
                    <p class="text-3xl font-black text-slate-800 pl-2">${distrib.length}</p>
                </div>
                <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm relative overflow-hidden">
                    <div class="absolute top-0 left-0 w-1 h-full bg-amber-500"></div>
                    <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 pl-2">Avaliações</p>
                    <p class="text-3xl font-black text-slate-800 pl-2">${correcao.length}</p>
                </div>
                <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm relative overflow-hidden">
                    <div class="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
                    <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 pl-2">Protocolados</p>
                    <p class="text-3xl font-black text-slate-800 pl-2">${finalizados.length}</p>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                <div class="flex flex-col h-full">
                    <div class="flex items-center justify-between mb-4 px-1">
                        <h3 class="font-black text-sm text-slate-700 uppercase tracking-widest flex items-center gap-2">
                            <span class="text-indigo-500">🧑‍💻</span> Servidores
                        </h3>
                        <span class="bg-slate-200 text-slate-600 text-[10px] px-2 py-0.5 rounded-full font-bold">${servidores.length}</span>
                    </div>
                    <div class="space-y-4">
                        ${servidoresHtml}
                    </div>
                </div>

                <div class="flex flex-col h-full">
                    <div class="flex items-center justify-between mb-4 px-1">
                        <h3 class="font-black text-sm text-slate-700 uppercase tracking-widest flex items-center gap-2">
                            <span class="text-cyan-500">👨‍⚖️</span> Defensores
                        </h3>
                        <span class="bg-slate-200 text-slate-600 text-[10px] px-2 py-0.5 rounded-full font-bold">${defensores.length}</span>
                    </div>
                    <div class="space-y-4">
                        ${defensoresHtml}
                    </div>
                </div>

                <div class="flex flex-col h-full">
                    <div class="flex items-center justify-between mb-4 px-1">
                        <h3 class="font-black text-sm text-slate-700 uppercase tracking-widest flex items-center gap-2">
                            <span class="text-emerald-500">✅</span> Concluídos
                        </h3>
                    </div>
                    <div>
                        ${finalizadosHtml}
                    </div>
                </div>
            </div>
        `;
    }
};
