// js/painelGeralService.js - MONITOR DE PRODUTIVIDADE (PADRÃO SIGAP)

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
    // 2. CONSTRUÇÃO DO MODAL (PADRÃO DO SISTEMA)
    // ========================================================
    abrirPainel(app) {
        let modal = document.getElementById('painel-geral-externo-modal');
        
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'painel-geral-externo-modal';
            // Mesmas classes de fundo e z-index dos outros modais do sistema
            modal.className = 'fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-[100] p-0 sm:p-4 transition-opacity';
            
            modal.innerHTML = `
                <div class="bg-white shadow-2xl w-full max-w-7xl flex flex-col h-full sm:h-auto sm:rounded-xl sm:max-h-[95vh]" style="max-height: 100vh;">
                    
                    <div class="flex justify-between items-center p-3 sm:p-4 border-b bg-gray-50 shrink-0 sm:rounded-t-xl">
                        <h2 class="text-base sm:text-lg font-bold text-gray-800 flex items-center gap-2">
                            <span class="text-emerald-600">📊</span> Monitor da Equipe
                        </h2>
                        <button id="close-painel-geral-modal-btn" class="text-gray-400 hover:text-red-500 text-3xl p-1 leading-none">&times;</button>
                    </div>
                    
                    <div id="painel-monitor-body" class="flex-grow overflow-y-auto p-4 sm:p-6 bg-white scrollable-content">
                        <div id="painel-monitor-conteudo" class="space-y-6">
                            <div class="flex justify-center py-10">
                                <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600"></div>
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

    fecharPainel() {
        const modal = document.getElementById('painel-geral-externo-modal');
        if (modal) modal.classList.add('hidden');
    },

    // ========================================================
    // 3. NAVEGAÇÃO RÁPIDA (IR PARA A TABELA)
    // ========================================================
    irParaColuna(app, targetId, toggleId) {
        this.fecharPainel();
        
        setTimeout(() => {
            const col = document.getElementById(targetId);
            if (col) {
                // Se a coluna estiver oculta, ativa a visualização nas preferências
                if (col.classList.contains('hidden') && toggleId) {
                    const chk = document.getElementById(toggleId);
                    if (chk) {
                        chk.checked = true;
                        if (app && typeof app.saveColumnPreferences === 'function') {
                            app.saveColumnPreferences();
                        }
                    }
                }
                
                // Rola a tela até a coluna
                col.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
                
                // Pisca a coluna para destacar
                col.classList.add('ring-4', 'ring-emerald-400', 'transition-all', 'duration-500');
                setTimeout(() => {
                    col.classList.remove('ring-4', 'ring-emerald-400');
                }, 1500);
            }
        }, 300); // Aguarda o modal fechar para evitar lag
    },

    // ========================================================
    // 4. PROCESSAMENTO DE DADOS E RENDERIZAÇÃO
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

        const getBadges = (a) => {
            let badges = '';
            if (a.numeroProcesso) {
                badges += `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-gray-100 text-gray-600 border border-gray-200 mt-1" title="Nº do Processo">📄 ${escapeHTML(a.numeroProcesso)}</span>`;
            }
            if (a.numeroAgendamento) {
                badges += `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-blue-50 text-blue-600 border border-blue-100 mt-1" title="Nº do Agendamento">📅 ${escapeHTML(a.numeroAgendamento)}</span>`;
            }
            return badges;
        };

        // PROCESSA DEFENSORES
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
                ? `<span class="bg-emerald-100 text-emerald-700 px-2 py-1 rounded border border-emerald-200 shadow-sm font-bold text-[10px] flex items-center gap-1.5"><span class="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span> Livre</span>`
                : `<div class="flex gap-1.5">
                     ${stats.distrib.length > 0 ? `<span class="bg-cyan-100 text-cyan-800 px-2 py-1 rounded text-[9px] font-bold border border-cyan-200 shadow-sm">${stats.distrib.length} Assinatura(s)</span>` : ''}
                     ${stats.correcao.length > 0 ? `<span class="bg-amber-100 text-amber-800 px-2 py-1 rounded text-[9px] font-bold border border-amber-200 shadow-sm">${stats.correcao.length} Avaliação(ões)</span>` : ''}
                   </div>`;

            let detalhesHtml = '';
            if (!isLivre) {
                detalhesHtml = `<div class="mt-2 space-y-1 pt-2 border-t border-gray-100">`;
                
                stats.distrib.forEach(a => {
                    detalhesHtml += `
                        <div class="flex justify-between items-start text-xs bg-gray-50 p-2 rounded border border-gray-200">
                            <div class="flex flex-col gap-0.5">
                                <span class="font-bold text-gray-800">${escapeHTML(a.name)}</span>
                                <span class="text-[10px] text-gray-500 truncate max-w-[180px]">${escapeHTML(a.subject || 'S/ Assunto')}</span>
                                <div class="flex flex-wrap gap-1">${getBadges(a)}</div>
                            </div>
                            <span class="bg-cyan-50 text-cyan-700 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border border-cyan-100 shrink-0">Assinar</span>
                        </div>`;
                });

                stats.correcao.forEach(a => {
                    detalhesHtml += `
                        <div class="flex justify-between items-start text-xs bg-gray-50 p-2 rounded border border-gray-200">
                            <div class="flex flex-col gap-0.5">
                                <span class="font-bold text-gray-800">${escapeHTML(a.name)}</span>
                                <span class="text-[10px] text-gray-500 truncate max-w-[180px]">${escapeHTML(a.subject || 'S/ Assunto')}</span>
                                ${a.enviadoPor ? `<span class="text-[9px] font-semibold text-amber-600 mt-0.5">De: ${escapeHTML(a.enviadoPor)}</span>` : ''}
                                <div class="flex flex-wrap gap-1">${getBadges(a)}</div>
                            </div>
                            <span class="bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border border-amber-100 shrink-0">Avaliar</span>
                        </div>`;
                });
                detalhesHtml += `</div>`;
            }

            const presença = stats.dataObj.presente ? '<span class="text-green-500 ml-1 text-xs" title="Presente">●</span>' : '<span class="text-gray-300 ml-1 text-xs" title="Ausente">●</span>';

            defensoresHtml += `
                <div class="bg-white border border-gray-200 rounded-lg p-3 shadow-sm hover:shadow transition-shadow">
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                        <div>
                            <h3 class="font-bold text-gray-800 text-sm flex items-center">👨‍⚖️ ${escapeHTML(def)} ${presença}</h3>
                            <p class="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Defensor(a) ${stats.dataObj.equipe ? '- Eq. ' + stats.dataObj.equipe : ''}</p>
                        </div>
                        ${statusVisual}
                    </div>
                    ${detalhesHtml}
                </div>
            `;
        });
        if(!defensoresHtml) defensoresHtml = '<p class="text-sm text-gray-400 italic text-center py-4 bg-gray-50 rounded-lg border border-dashed border-gray-300">Nenhum defensor cadastrado.</p>';

        // PROCESSA SERVIDORES
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
                ? `<span class="bg-emerald-100 text-emerald-700 px-2 py-1 rounded border border-emerald-200 shadow-sm font-bold text-[10px] flex items-center gap-1.5"><span class="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span> Livre</span>`
                : `<span class="bg-indigo-100 text-indigo-700 px-2 py-1 rounded text-[10px] font-bold border border-indigo-200 shadow-sm">⏳ ${stats.mesa.length} Em Mesa</span>`;

            let detalhesHtml = '';
            if (!isLivre) {
                detalhesHtml = `<div class="mt-2 space-y-1 pt-2 border-t border-gray-100">`;
                stats.mesa.forEach(a => {
                    const hora = a.inAttendanceTime ? new Date(a.inAttendanceTime).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : '';
                    detalhesHtml += `
                        <div class="flex justify-between items-start text-xs bg-gray-50 p-2 rounded border border-gray-200">
                            <div class="flex flex-col gap-0.5">
                                <span class="font-bold text-gray-800">${escapeHTML(a.name)}</span>
                                <span class="text-[10px] text-gray-500 truncate max-w-[180px]">${escapeHTML(a.subject || 'S/ Assunto')}</span>
                                <div class="flex flex-wrap gap-1">${getBadges(a)}</div>
                            </div>
                            <span class="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 shrink-0">${hora}</span>
                        </div>`;
                });
                detalhesHtml += `</div>`;
            }

            const presença = stats.dataObj.presente ? '<span class="text-green-500 ml-1 text-xs" title="Presente">●</span>' : '<span class="text-gray-300 ml-1 text-xs" title="Ausente">●</span>';

            servidoresHtml += `
                <div class="bg-white border border-gray-200 rounded-lg p-3 shadow-sm hover:shadow transition-shadow">
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                        <div>
                            <h3 class="font-bold text-gray-800 text-sm flex items-center">🧑‍💻 ${escapeHTML(serv)} ${presença}</h3>
                            <p class="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">${escapeHTML(stats.dataObj.cargo)} ${stats.dataObj.equipe ? '- Eq. ' + stats.dataObj.equipe : ''}</p>
                        </div>
                        ${statusVisual}
                    </div>
                    ${detalhesHtml}
                </div>
            `;
        });
        if(!servidoresHtml) servidoresHtml = '<p class="text-sm text-gray-400 italic text-center py-4 bg-gray-50 rounded-lg border border-dashed border-gray-300">Nenhum servidor cadastrado.</p>';

        // PROCESSA FINALIZADOS
        const finalizadosOrdenados = finalizados.sort((a, b) => new Date(b.attendedAt || 0) - new Date(a.attendedAt || 0));
        let finalizadosHtml = '';
        
        if (finalizadosOrdenados.length === 0) {
            finalizadosHtml = '<p class="text-sm text-gray-400 italic text-center py-4 bg-gray-50 rounded-lg border border-dashed border-gray-300">Nenhum protocolo finalizado hoje.</p>';
        } else {
            finalizadosHtml = `<div class="bg-white border border-gray-200 rounded-lg shadow-sm p-2 space-y-1">`;
            finalizadosHtml += finalizadosOrdenados.map(a => {
                const hora = a.attendedAt ? new Date(a.attendedAt).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : '--:--';
                return `
                    <div class="flex justify-between items-center p-2 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                        <div class="flex flex-col truncate pr-2">
                            <span class="font-bold text-xs text-gray-800 truncate">${escapeHTML(a.name)}</span>
                            <span class="text-[9px] text-gray-500 truncate">${escapeHTML(a.subject || 'S/ Assunto')}</span>
                            <div class="flex flex-wrap gap-1">${getBadges(a)}</div>
                            ${a.attendedBy ? `<span class="text-[9px] text-emerald-600 font-bold mt-0.5">Por: ${escapeHTML(a.attendedBy)}</span>` : ''}
                        </div>
                        <div class="flex flex-col items-end shrink-0">
                            <span class="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-200 uppercase tracking-wider">Protocolado</span>
                            <span class="text-[10px] font-bold text-gray-400 mt-1">${hora}</span>
                        </div>
                    </div>
                `;
            }).join('');
            finalizadosHtml += `</div>`;
        }

        // ====================================================
        // MONTAGEM DO HTML COM OS CARDS CLICÁVEIS (IR P/ TABELA)
        // ====================================================
        conteudo.innerHTML = `
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
                <button data-target="em-atendimento-column" data-toggle="toggle-em-atendimento" class="card-metrica bg-white hover:bg-indigo-50 rounded-lg border border-gray-200 hover:border-indigo-300 p-4 text-center shadow-sm hover:shadow-md transition-all relative overflow-hidden flex flex-col items-center justify-center cursor-pointer group">
                    <div class="absolute top-0 left-0 w-1 h-full bg-indigo-500 group-hover:w-1.5 transition-all"></div>
                    <p class="text-[10px] font-bold text-gray-400 group-hover:text-indigo-600 uppercase tracking-widest mb-1 pl-1 transition-colors">Em Mesa <span class="text-indigo-400 ml-1">↗</span></p>
                    <p class="text-3xl font-black text-gray-700 group-hover:text-indigo-700 pl-1 transition-colors">${emMesa.length}</p>
                </button>
                
                <button data-target="distribuicao-column" data-toggle="toggle-distribuicao" class="card-metrica bg-white hover:bg-cyan-50 rounded-lg border border-gray-200 hover:border-cyan-300 p-4 text-center shadow-sm hover:shadow-md transition-all relative overflow-hidden flex flex-col items-center justify-center cursor-pointer group">
                    <div class="absolute top-0 left-0 w-1 h-full bg-cyan-500 group-hover:w-1.5 transition-all"></div>
                    <p class="text-[10px] font-bold text-gray-400 group-hover:text-cyan-600 uppercase tracking-widest mb-1 pl-1 transition-colors">Assinaturas <span class="text-cyan-400 ml-1">↗</span></p>
                    <p class="text-3xl font-black text-gray-700 group-hover:text-cyan-700 pl-1 transition-colors">${distrib.length}</p>
                </button>

                <button data-target="distribuicao-column" data-toggle="toggle-distribuicao" class="card-metrica bg-white hover:bg-amber-50 rounded-lg border border-gray-200 hover:border-amber-300 p-4 text-center shadow-sm hover:shadow-md transition-all relative overflow-hidden flex flex-col items-center justify-center cursor-pointer group">
                    <div class="absolute top-0 left-0 w-1 h-full bg-amber-500 group-hover:w-1.5 transition-all"></div>
                    <p class="text-[10px] font-bold text-gray-400 group-hover:text-amber-600 uppercase tracking-widest mb-1 pl-1 transition-colors">Avaliações <span class="text-amber-400 ml-1">↗</span></p>
                    <p class="text-3xl font-black text-gray-700 group-hover:text-amber-700 pl-1 transition-colors">${correcao.length}</p>
                </button>

                <button data-target="atendidos-column" class="card-metrica bg-white hover:bg-emerald-50 rounded-lg border border-gray-200 hover:border-emerald-300 p-4 text-center shadow-sm hover:shadow-md transition-all relative overflow-hidden flex flex-col items-center justify-center cursor-pointer group">
                    <div class="absolute top-0 left-0 w-1 h-full bg-emerald-500 group-hover:w-1.5 transition-all"></div>
                    <p class="text-[10px] font-bold text-gray-400 group-hover:text-emerald-600 uppercase tracking-widest mb-1 pl-1 transition-colors">Protocolados <span class="text-emerald-400 ml-1">↗</span></p>
                    <p class="text-3xl font-black text-gray-700 group-hover:text-emerald-700 pl-1 transition-colors">${finalizados.length}</p>
                </button>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                <div class="flex flex-col h-full bg-gray-50 p-3 sm:p-4 rounded-xl border border-gray-200">
                    <div class="flex items-center justify-between mb-4 border-b border-gray-200 pb-2">
                        <h3 class="font-bold text-sm text-gray-700 flex items-center gap-2">
                            <span>🧑‍💻</span> Servidores
                        </h3>
                        <span class="bg-gray-200 text-gray-600 text-[10px] px-2 py-0.5 rounded font-bold">${servidores.length}</span>
                    </div>
                    <div class="space-y-3">
                        ${servidoresHtml}
                    </div>
                </div>

                <div class="flex flex-col h-full bg-gray-50 p-3 sm:p-4 rounded-xl border border-gray-200">
                    <div class="flex items-center justify-between mb-4 border-b border-gray-200 pb-2">
                        <h3 class="font-bold text-sm text-gray-700 flex items-center gap-2">
                            <span>👨‍⚖️</span> Defensores
                        </h3>
                        <span class="bg-gray-200 text-gray-600 text-[10px] px-2 py-0.5 rounded font-bold">${defensores.length}</span>
                    </div>
                    <div class="space-y-3">
                        ${defensoresHtml}
                    </div>
                </div>

                <div class="flex flex-col h-full bg-gray-50 p-3 sm:p-4 rounded-xl border border-gray-200">
                    <div class="flex items-center justify-between mb-4 border-b border-gray-200 pb-2">
                        <h3 class="font-bold text-sm text-gray-700 flex items-center gap-2">
                            <span>✅</span> Últimos Concluídos
                        </h3>
                    </div>
                    <div>
                        ${finalizadosHtml}
                    </div>
                </div>
            </div>
        `;

        // Ativa o clique dos botões para "Ir Para Tabela"
        document.querySelectorAll('.card-metrica').forEach(card => {
            card.onclick = () => {
                const targetId = card.getAttribute('data-target');
                const toggleId = card.getAttribute('data-toggle');
                this.irParaColuna(app, targetId, toggleId);
            };
        });
    }
};
