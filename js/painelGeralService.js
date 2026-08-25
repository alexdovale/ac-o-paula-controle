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
            modal.className = 'fixed inset-0 bg-slate-900 bg-opacity-60 flex items-center justify-center z-[100] p-0 sm:p-4 transition-opacity backdrop-blur-sm';
            
            modal.innerHTML = `
                <div class="bg-white shadow-2xl w-full max-w-7xl flex flex-col h-full sm:h-auto sm:rounded-xl sm:max-h-[95vh]" style="max-height: 100vh;">
                    
                    <!-- CABEÇALHO DO PAINEL E BARRA DE BUSCA -->
                    <div class="flex flex-col sm:flex-row justify-between items-center p-3 sm:p-4 border-b border-slate-200 bg-slate-50 shrink-0 sm:rounded-t-xl gap-3">
                        <h2 class="text-base sm:text-lg font-black text-slate-800 flex items-center gap-2 tracking-tight whitespace-nowrap">
                            <span class="text-emerald-600 text-xl">📊</span> Monitor da Equipe
                        </h2>
                        
                        <!-- CAMPO DE BUSCA -->
                        <div class="relative w-full sm:max-w-md">
                            <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                            </span>
                            <input type="search" id="busca-painel-monitor" placeholder="Buscar assistido, assunto ou processo..." class="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm font-medium transition-all shadow-sm bg-white">
                        </div>

                        <button id="close-painel-geral-modal-btn" class="hidden sm:block text-slate-400 hover:text-red-500 text-3xl p-1 leading-none transition-colors">&times;</button>
                        
                        <!-- Botão fechar (Mobile) -->
                        <button id="close-painel-geral-mobile-btn" class="sm:hidden absolute top-2 right-2 bg-slate-200 text-slate-600 rounded-full w-8 h-8 flex items-center justify-center font-bold text-xl">&times;</button>
                    </div>
                    
                    <!-- CORPO DO PAINEL -->
                    <div id="painel-monitor-body" class="flex-grow overflow-y-auto p-4 sm:p-6 bg-slate-100 scrollable-content transition-opacity duration-300">
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
            document.getElementById('close-painel-geral-mobile-btn').onclick = closeActions;

            // Fechar ao clicar fora do modal
            modal.onclick = (e) => {
                if (e.target === modal) closeActions();
            };

            // LÓGICA DA BARRA DE PESQUISA EM TEMPO REAL
            const searchInput = document.getElementById('busca-painel-monitor');
            searchInput.addEventListener('input', (e) => {
                const term = e.target.value.toLowerCase().trim();
                const cards = document.querySelectorAll('.searchable-card');
                
                cards.forEach(card => {
                    const textContent = card.textContent.toLowerCase();
                    if (textContent.includes(term)) {
                        card.style.display = '';
                    } else {
                        card.style.display = 'none';
                    }
                });
            });
        }

        modal.classList.remove('hidden');
        document.getElementById('busca-painel-monitor').value = ''; // Limpa a busca ao abrir
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
                if (col.classList.contains('hidden') && toggleId) {
                    const chk = document.getElementById(toggleId);
                    if (chk) {
                        chk.checked = true;
                        if (app && typeof app.saveColumnPreferences === 'function') {
                            app.saveColumnPreferences();
                        }
                    }
                }
                
                col.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
                
                col.classList.add('ring-4', 'ring-emerald-400', 'transition-all', 'duration-500');
                setTimeout(() => {
                    col.classList.remove('ring-4', 'ring-emerald-400');
                }, 1500);
            }
        }, 300);
    },

    // ========================================================
    // 4. PROCESSAMENTO DE DADOS E RENDERIZAÇÃO
    // ========================================================
    atualizarConteudo(app) {
        const conteudo = document.getElementById('painel-monitor-conteudo');
        if (!conteudo) return;

        const todos = app.allAssisted || [];
        const colaboradoresDb = app.colaboradores || [];
        
        // 🚀 OTIMIZAÇÃO DE PERFORMANCE: Apenas 1 loop em toda a lista (Reduz re-leituras)
        const emMesa = [];
        const distrib = [];
        const correcao = [];
        const finalizados = [];

        todos.forEach(a => {
            if (a.status === 'emAtendimento' && a.delegationToken) emMesa.push(a);
            else if (a.status === 'aguardandoDistribuicao') distrib.push(a);
            else if (a.status === 'aguardandoCorrecao') correcao.push(a);
            else if (a.status === 'atendido' && a.finalizadoPeloColaborador) finalizados.push(a);
        });

        const defensores = colaboradoresDb.filter(c => c.cargo?.toLowerCase().includes('defensor'));
        const servidores = colaboradoresDb.filter(c => !c.cargo?.toLowerCase().includes('defensor'));

        const getBadges = (a) => {
            let badges = '';
            if (a.numeroProcesso) {
                badges += `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-slate-100 text-slate-600 border border-slate-200 mt-1" title="Nº do Processo">📄 ${escapeHTML(a.numeroProcesso)}</span>`;
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
                detalhesHtml = `<div class="mt-2 space-y-1.5 pt-2 border-t border-slate-100">`;
                
                stats.distrib.forEach(a => {
                    detalhesHtml += `
                        <div class="searchable-card flex justify-between items-start text-xs bg-slate-50 hover:bg-white p-2.5 rounded-lg border border-slate-200 transition-colors shadow-sm">
                            <div class="flex flex-col gap-0.5">
                                <span class="font-bold text-slate-800">${escapeHTML(a.name)}</span>
                                <span class="text-[10px] text-slate-500 truncate max-w-[180px]">${escapeHTML(a.subject || 'S/ Assunto')}</span>
                                <div class="flex flex-wrap gap-1">${getBadges(a)}</div>
                            </div>
                            <span class="bg-cyan-50 text-cyan-700 px-2 py-1 rounded-md text-[8px] font-black uppercase tracking-wider border border-cyan-200 shrink-0">Assinar</span>
                        </div>`;
                });

                stats.correcao.forEach(a => {
                    detalhesHtml += `
                        <div class="searchable-card flex justify-between items-start text-xs bg-slate-50 hover:bg-white p-2.5 rounded-lg border border-slate-200 transition-colors shadow-sm">
                            <div class="flex flex-col gap-0.5">
                                <span class="font-bold text-slate-800">${escapeHTML(a.name)}</span>
                                <span class="text-[10px] text-slate-500 truncate max-w-[180px]">${escapeHTML(a.subject || 'S/ Assunto')}</span>
                                ${a.enviadoPor ? `<span class="text-[9px] font-semibold text-amber-600 mt-0.5">De: ${escapeHTML(a.enviadoPor)}</span>` : ''}
                                <div class="flex flex-wrap gap-1">${getBadges(a)}</div>
                            </div>
                            <span class="bg-amber-50 text-amber-700 px-2 py-1 rounded-md text-[8px] font-black uppercase tracking-wider border border-amber-200 shrink-0">Avaliar</span>
                        </div>`;
                });
                detalhesHtml += `</div>`;
            }

            const presenca = stats.dataObj.presente ? '<span class="text-green-500 ml-1 text-xs" title="Presente">●</span>' : '<span class="text-slate-300 ml-1 text-xs" title="Ausente">●</span>';
            const emailExibição = stats.dataObj.email ? `<p class="text-[10px] font-mono text-slate-500 lowercase mt-0.5">${escapeHTML(stats.dataObj.email)}</p>` : '';

            // searchabe-card garante que o container pai (do defensor inteiro) seja buscado se o nome dele bater
            defensoresHtml += `
                <div class="searchable-card bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm hover:shadow-md transition-shadow">
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                        <div>
                            <h3 class="font-bold text-slate-800 text-sm flex items-center">👨‍⚖️ ${escapeHTML(def)} ${presenca}</h3>
                            <p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Defensor(a) ${stats.dataObj.equipe ? '- Eq. ' + stats.dataObj.equipe : ''}</p>
                            ${emailExibição}
                        </div>
                        ${statusVisual}
                    </div>
                    ${detalhesHtml}
                </div>
            `;
        });
        if(!defensoresHtml) defensoresHtml = '<p class="text-sm text-slate-400 italic text-center py-4 bg-slate-50 rounded-lg border border-dashed border-slate-300">Nenhum defensor cadastrado.</p>';

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
                detalhesHtml = `<div class="mt-2 space-y-1.5 pt-2 border-t border-slate-100">`;
                stats.mesa.forEach(a => {
                    const hora = a.inAttendanceTime ? new Date(a.inAttendanceTime).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : '';
                    detalhesHtml += `
                        <div class="searchable-card flex justify-between items-start text-xs bg-slate-50 hover:bg-white p-2.5 rounded-lg border border-slate-200 transition-colors shadow-sm">
                            <div class="flex flex-col gap-0.5">
                                <span class="font-bold text-slate-800">${escapeHTML(a.name)}</span>
                                <span class="text-[10px] text-slate-500 truncate max-w-[180px]">${escapeHTML(a.subject || 'S/ Assunto')}</span>
                                <div class="flex flex-wrap gap-1">${getBadges(a)}</div>
                            </div>
                            <span class="text-[9px] font-black tracking-widest text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md border border-indigo-100 shadow-sm shrink-0">${hora}</span>
                        </div>`;
                });
                detalhesHtml += `</div>`;
            }

            const presenca = stats.dataObj.presente ? '<span class="text-green-500 ml-1 text-xs" title="Presente">●</span>' : '<span class="text-slate-300 ml-1 text-xs" title="Ausente">●</span>';
            const emailExibição = stats.dataObj.email ? `<p class="text-[10px] font-mono text-slate-500 lowercase mt-0.5">${escapeHTML(stats.dataObj.email)}</p>` : '';

            servidoresHtml += `
                <div class="searchable-card bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm hover:shadow-md transition-shadow">
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                        <div>
                            <h3 class="font-bold text-slate-800 text-sm flex items-center">🧑‍💻 ${escapeHTML(serv)} ${presenca}</h3>
                            <p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">${escapeHTML(stats.dataObj.cargo)} ${stats.dataObj.equipe ? '- Eq. ' + stats.dataObj.equipe : ''}</p>
                            ${emailExibição}
                        </div>
                        ${statusVisual}
                    </div>
                    ${detalhesHtml}
                </div>
            `;
        });
        if(!servidoresHtml) servidoresHtml = '<p class="text-sm text-slate-400 italic text-center py-4 bg-slate-50 rounded-lg border border-dashed border-slate-300">Nenhum servidor cadastrado.</p>';

        // PROCESSA FINALIZADOS
        const finalizadosOrdenados = finalizados.sort((a, b) => new Date(b.attendedAt || 0) - new Date(a.attendedAt || 0));
        let finalizadosHtml = '';
        
        if (finalizadosOrdenados.length === 0) {
            finalizadosHtml = '<p class="text-sm text-slate-400 italic text-center py-4 bg-slate-50 rounded-lg border border-dashed border-slate-300">Nenhum protocolo finalizado hoje.</p>';
        } else {
            finalizadosHtml = `<div class="space-y-1.5">`;
            finalizadosHtml += finalizadosOrdenados.map(a => {
                const hora = a.attendedAt ? new Date(a.attendedAt).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : '--:--';
                return `
                    <div class="searchable-card flex justify-between items-center bg-white p-2.5 rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-all">
                        <div class="flex flex-col truncate pr-2">
                            <span class="font-bold text-xs text-slate-800 truncate">${escapeHTML(a.name)}</span>
                            <span class="text-[9px] text-slate-500 truncate">${escapeHTML(a.subject || 'S/ Assunto')}</span>
                            <div class="flex flex-wrap gap-1">${getBadges(a)}</div>
                            ${a.attendedBy ? `<span class="text-[9px] text-emerald-600 font-bold mt-0.5 uppercase tracking-wider">✅ Por: ${escapeHTML(a.attendedBy)}</span>` : ''}
                        </div>
                        <div class="flex flex-col items-end shrink-0">
                            <span class="text-[9px] font-black text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200 uppercase tracking-widest shadow-sm">Protocolado</span>
                            <span class="text-[10px] font-bold text-slate-400 mt-1">${hora}</span>
                        </div>
                    </div>
                `;
            }).join('');
            finalizadosHtml += `</div>`;
        }

        // ====================================================
        // MONTAGEM DO HTML (AGORA COM ANTI-PISCO E SCROLL FIXO)
        // ====================================================
        
        // Estilo injetado na primeira renderização para as barras de rolagem finas
        const styleId = 'painel-monitor-styles';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.innerHTML = `
                .monitor-scroll::-webkit-scrollbar { width: 4px; }
                .monitor-scroll::-webkit-scrollbar-track { background: transparent; }
                .monitor-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
                .monitor-scroll:hover::-webkit-scrollbar-thumb { background: #94a3b8; }
                @keyframes fade-in-suave { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
                .anim-fade-suave { animation: fade-in-suave 0.3s ease-out forwards; }
            `;
            document.head.appendChild(style);
        }

        conteudo.innerHTML = `
            <div class="anim-fade-suave">
                <!-- CARDS DE MÉTRICAS -->
                <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
                    <button data-target="em-atendimento-column" data-toggle="toggle-em-atendimento" class="card-metrica bg-white hover:bg-indigo-50 rounded-xl border border-slate-200 hover:border-indigo-300 p-5 text-center shadow-sm hover:shadow-md transition-all relative overflow-hidden flex flex-col items-center justify-center cursor-pointer group">
                        <div class="absolute top-0 left-0 w-1.5 h-full bg-indigo-500 group-hover:w-2 transition-all"></div>
                        <p class="text-[10px] font-bold text-slate-400 group-hover:text-indigo-600 uppercase tracking-widest mb-1 pl-1 transition-colors">Em Mesa <span class="text-indigo-400 ml-1">↗</span></p>
                        <p class="text-4xl font-black text-slate-700 group-hover:text-indigo-700 pl-1 transition-colors tracking-tighter">${emMesa.length}</p>
                    </button>
                    
                    <button data-target="distribuicao-column" data-toggle="toggle-distribuicao" class="card-metrica bg-white hover:bg-cyan-50 rounded-xl border border-slate-200 hover:border-cyan-300 p-5 text-center shadow-sm hover:shadow-md transition-all relative overflow-hidden flex flex-col items-center justify-center cursor-pointer group">
                        <div class="absolute top-0 left-0 w-1.5 h-full bg-cyan-500 group-hover:w-2 transition-all"></div>
                        <p class="text-[10px] font-bold text-slate-400 group-hover:text-cyan-600 uppercase tracking-widest mb-1 pl-1 transition-colors">Assinaturas <span class="text-cyan-400 ml-1">↗</span></p>
                        <p class="text-4xl font-black text-slate-700 group-hover:text-cyan-700 pl-1 transition-colors tracking-tighter">${distrib.length}</p>
                    </button>

                    <button data-target="distribuicao-column" data-toggle="toggle-distribuicao" class="card-metrica bg-white hover:bg-amber-50 rounded-xl border border-slate-200 hover:border-amber-300 p-5 text-center shadow-sm hover:shadow-md transition-all relative overflow-hidden flex flex-col items-center justify-center cursor-pointer group">
                        <div class="absolute top-0 left-0 w-1.5 h-full bg-amber-500 group-hover:w-2 transition-all"></div>
                        <p class="text-[10px] font-bold text-slate-400 group-hover:text-amber-600 uppercase tracking-widest mb-1 pl-1 transition-colors">Avaliações <span class="text-amber-400 ml-1">↗</span></p>
                        <p class="text-4xl font-black text-slate-700 group-hover:text-amber-700 pl-1 transition-colors tracking-tighter">${correcao.length}</p>
                    </button>

                    <button data-target="atendidos-column" class="card-metrica bg-white hover:bg-emerald-50 rounded-xl border border-slate-200 hover:border-emerald-300 p-5 text-center shadow-sm hover:shadow-md transition-all relative overflow-hidden flex flex-col items-center justify-center cursor-pointer group">
                        <div class="absolute top-0 left-0 w-1.5 h-full bg-emerald-500 group-hover:w-2 transition-all"></div>
                        <p class="text-[10px] font-bold text-slate-400 group-hover:text-emerald-600 uppercase tracking-widest mb-1 pl-1 transition-colors">Protocolados <span class="text-emerald-400 ml-1">↗</span></p>
                        <p class="text-4xl font-black text-slate-700 group-hover:text-emerald-700 pl-1 transition-colors tracking-tighter">${finalizados.length}</p>
                    </button>
                </div>

                <!-- COLUNAS COM SCROLL INTELIGENTE -->
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 items-start">
                    
                    <!-- COLUNA SERVIDORES -->
                    <div class="flex flex-col bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-sm max-h-[60vh]">
                        <div class="flex items-center justify-between mb-3 border-b border-slate-100 pb-3 shrink-0">
                            <h3 class="font-black text-sm text-slate-800 flex items-center gap-2 uppercase tracking-wide">
                                <span>🧑‍💻</span> Servidores
                            </h3>
                            <span class="bg-slate-100 text-slate-600 text-[10px] px-2.5 py-1 rounded-md font-black border border-slate-200">${servidores.length}</span>
                        </div>
                        <!-- Scroll apenas na lista -->
                        <div class="space-y-3 overflow-y-auto pr-1 monitor-scroll pb-2">
                            ${servidoresHtml}
                        </div>
                    </div>

                    <!-- COLUNA DEFENSORES -->
                    <div class="flex flex-col bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-sm max-h-[60vh]">
                        <div class="flex items-center justify-between mb-3 border-b border-slate-100 pb-3 shrink-0">
                            <h3 class="font-black text-sm text-slate-800 flex items-center gap-2 uppercase tracking-wide">
                                <span>👨‍⚖️</span> Defensores
                            </h3>
                            <span class="bg-slate-100 text-slate-600 text-[10px] px-2.5 py-1 rounded-md font-black border border-slate-200">${defensores.length}</span>
                        </div>
                        <!-- Scroll apenas na lista -->
                        <div class="space-y-3 overflow-y-auto pr-1 monitor-scroll pb-2">
                            ${defensoresHtml}
                        </div>
                    </div>

                    <!-- COLUNA ÚLTIMOS CONCLUÍDOS -->
                    <div class="flex flex-col bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-sm max-h-[60vh] bg-emerald-50/30">
                        <div class="flex items-center justify-between mb-3 border-b border-emerald-100 pb-3 shrink-0">
                            <h3 class="font-black text-sm text-emerald-800 flex items-center gap-2 uppercase tracking-wide">
                                <span>✅</span> Últimos Concluídos
                            </h3>
                        </div>
                        <!-- Scroll apenas na lista -->
                        <div class="overflow-y-auto pr-1 monitor-scroll pb-2">
                            ${finalizadosHtml}
                        </div>
                    </div>

                </div>
            </div>
        `;

        // Re-aplica a lógica de cliques dos cards de métricas
        document.querySelectorAll('.card-metrica').forEach(card => {
            card.onclick = () => {
                const targetId = card.getAttribute('data-target');
                const toggleId = card.getAttribute('data-toggle');
                this.irParaColuna(app, targetId, toggleId);
            };
        });

        // Re-aplica filtro da barra de busca que foi salva
        const searchInput = document.getElementById('busca-painel-monitor');
        if (searchInput && searchInput.value) {
            searchInput.dispatchEvent(new Event('input'));
        }
    }
};
