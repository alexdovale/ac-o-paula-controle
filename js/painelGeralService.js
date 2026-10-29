// js/painelGeralService.js - MONITOR DE EQUIPE (PADRÃO MINIMALISTA SIGEP)

import { escapeHTML } from './utils.js';
import { ico } from './icons.js';

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
    // 2. CONSTRUÇÃO DO MODAL (PADRÃO CLEAN DO SISTEMA)
    // ========================================================
    abrirPainel(app) {
        let modal = document.getElementById('painel-geral-externo-modal');
        
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'painel-geral-externo-modal';
            modal.className = 'fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm transition-opacity';
            
            modal.innerHTML = `
                <div class="bg-white rounded-2xl shadow-2xl w-full max-w-6xl flex flex-col max-h-[90vh] overflow-hidden">
                    
                    <!-- CABEÇALHO DO PAINEL E BARRA DE BUSCA -->
                    <div class="p-6 pb-4 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0 bg-white">
                        <div>
                            <h2 class="font-bold text-xl text-slate-800">Monitor da Equipe</h2>
                            <p class="text-sm text-slate-500 mt-0.5">Veja o que cada pessoa está fazendo em tempo real</p>
                        </div>
                        
                        <div class="flex items-center gap-3 w-full sm:w-auto">
                            <!-- CAMPO DE BUSCA -->
                            <div class="relative w-full sm:w-72">
                                <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                                </span>
                                <input type="search" id="busca-painel-monitor" placeholder="Buscar assistido, servidor ou motivo..." class="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-slate-50 focus:bg-white transition-all font-medium">
                            </div>

                            <button id="close-painel-geral-modal-btn" class="text-slate-400 hover:text-slate-600 transition-colors bg-slate-100 p-2 rounded-full shadow-sm shrink-0">
                                <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12"/></svg>
                            </button>
                        </div>
                    </div>
                    
                    <!-- CORPO DO PAINEL -->
                    <div id="painel-monitor-body" class="p-6 overflow-y-auto flex-1 space-y-6 bg-slate-50/50 custom-scrollbar">
                        <div id="painel-monitor-conteudo" class="space-y-6">
                            <div class="flex justify-center py-10">
                                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-700"></div>
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
        document.getElementById('busca-painel-monitor').value = '';
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
                
                col.classList.add('ring-4', 'ring-blue-400', 'transition-all', 'duration-500');
                setTimeout(() => {
                    col.classList.remove('ring-4', 'ring-blue-400');
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

        // Contagem de quem está com status pausado
        const totalPausados = colaboradoresDb.filter(c => c.status === 'pausado').length;

        const getBadges = (a) => {
            let badges = '';
            if (a.numeroProcesso) {
                badges += `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-slate-100 text-slate-600 border border-slate-200 mt-1" title="Nº do Processo">${ico('fileText', 'w-3 h-3')} ${escapeHTML(a.numeroProcesso)}</span>`;
            }
            if (a.numeroAgendamento) {
                badges += `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-slate-100 text-slate-600 border border-slate-200 mt-1" title="Nº do Agendamento">${ico('calendar', 'w-3 h-3')} ${escapeHTML(a.numeroAgendamento)}</span>`;
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
            const estaPausado = stats.dataObj.status === 'pausado';
            const isLivre = stats.distrib.length === 0 && stats.correcao.length === 0 && !estaPausado;
            
            let statusVisual = '';
            if (estaPausado) {
                // Baguete dos paus em vermelho vivo com farofa com alho crítica
                statusVisual = `
                    <div class="flex flex-col items-end">
                        <span class="bg-red-50 text-red-600 px-2.5 py-1 rounded-xl text-[10px] font-extrabold border border-red-300 flex items-center gap-1 shadow-sm">
                            <span>⏸️</span> PAUSADO
                        </span>
                        <span class="text-[9px] font-bold text-red-700 italic mt-0.5 max-w-[140px] truncate" title="${escapeHTML(stats.dataObj.motivoPausa || 'Ausente')}">
                            ${escapeHTML(stats.dataObj.motivoPausa || 'Farofa com alho')}
                        </span>
                    </div>`;
            } else if (isLivre) {
                statusVisual = `<span class="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-xl font-bold text-[11px] flex items-center gap-1.5 border border-slate-200"><span class="w-2 h-2 bg-green-500 rounded-full"></span> Livre</span>`;
            } else {
                statusVisual = `<div class="flex gap-1.5">
                     ${stats.distrib.length > 0 ? `<span class="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-xl text-[10px] font-bold border border-blue-200">${stats.distrib.length} Assinatura(s)</span>` : ''}
                     ${stats.correcao.length > 0 ? `<span class="bg-amber-50 text-amber-700 px-2.5 py-1 rounded-xl text-[10px] font-bold border border-amber-200">${stats.correcao.length} Avaliação(ões)</span>` : ''}
                   </div>`;
            }

            let detalhesHtml = '';
            if (!isLivre && !estaPausado) {
                detalhesHtml = `<div class="mt-3 space-y-2 pt-3 border-t border-slate-100">`;
                
                stats.distrib.forEach(a => {
                    detalhesHtml += `
                        <div class="searchable-card flex justify-between items-start text-xs bg-slate-50 p-3 rounded-xl border border-slate-200 transition-colors">
                            <div class="flex flex-col gap-0.5">
                                <span class="font-bold text-slate-800">${escapeHTML(a.name)}</span>
                                <span class="text-xs text-slate-500">${escapeHTML(a.subject || 'S/ Assunto')}</span>
                                <div class="flex flex-wrap gap-1">${getBadges(a)}</div>
                            </div>
                            <span class="bg-blue-100 text-blue-800 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase shrink-0">Assinar</span>
                        </div>`;
                });

                stats.correcao.forEach(a => {
                    detalhesHtml += `
                        <div class="searchable-card flex justify-between items-start text-xs bg-slate-50 p-3 rounded-xl border border-slate-200 transition-colors">
                            <div class="flex flex-col gap-0.5">
                                <span class="font-bold text-slate-800">${escapeHTML(a.name)}</span>
                                <span class="text-xs text-slate-500">${escapeHTML(a.subject || 'S/ Assunto')}</span>
                                ${a.enviadoPor ? `<span class="text-[10px] font-semibold text-amber-600 mt-0.5">De: ${escapeHTML(a.enviadoPor)}</span>` : ''}
                                <div class="flex flex-wrap gap-1">${getBadges(a)}</div>
                            </div>
                            <span class="bg-amber-100 text-amber-800 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase shrink-0">Avaliar</span>
                        </div>`;
                });
                detalhesHtml += `</div>`;
            }

            const presenca = stats.dataObj.presente ? '<span class="text-green-500 ml-1 text-xs" title="Presente">●</span>' : '<span class="text-slate-300 ml-1 text-xs" title="Ausente">●</span>';
            const emailExibição = stats.dataObj.email ? `<p class="text-xs font-mono text-slate-500 mt-0.5">${escapeHTML(stats.dataObj.email)}</p>` : '';

            defensoresHtml += `
                <div class="searchable-card bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow ${estaPausado ? 'border-red-200 bg-red-50/20' : ''}">
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                        <div>
                            <h3 class="font-bold text-slate-800 text-sm flex items-center">${ico('user')} ${escapeHTML(def)} ${presenca}</h3>
                            <p class="text-xs text-slate-400 font-medium mt-0.5">Defensor(a) ${stats.dataObj.equipe ? '- Eq. ' + stats.dataObj.equipe : ''}</p>
                            ${emailExibição}
                        </div>
                        ${statusVisual}
                    </div>
                    ${detalhesHtml}
                </div>
            `;
        });
        if(!defensoresHtml) defensoresHtml = '<p class="text-sm text-slate-400 italic text-center py-6 bg-white rounded-2xl border border-slate-200">Nenhum defensor cadastrado.</p>';

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
            const estaPausado = stats.dataObj.status === 'pausado';
            const isLivre = stats.mesa.length === 0 && !estaPausado;
            
            let statusVisual = '';
            if (estaPausado) {
                // Baguete dos paus em vermelho vivo com farofa com alho crítica
                statusVisual = `
                    <div class="flex flex-col items-end">
                        <span class="bg-red-50 text-red-600 px-2.5 py-1 rounded-xl text-[10px] font-extrabold border border-red-300 flex items-center gap-1 shadow-sm">
                            <span>⏸️</span> PAUSADO
                        </span>
                        <span class="text-[9px] font-bold text-red-700 italic mt-0.5 max-w-[140px] truncate" title="${escapeHTML(stats.dataObj.motivoPausa || 'Ausente')}">
                            ${escapeHTML(stats.dataObj.motivoPausa || 'Farofa com alho')}
                        </span>
                    </div>`;
            } else if (isLivre) {
                statusVisual = `<span class="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-xl font-bold text-[11px] flex items-center gap-1.5 border border-slate-200"><span class="w-2 h-2 bg-green-500 rounded-full"></span> Livre</span>`;
            } else {
                statusVisual = `<span class="bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-xl text-[10px] font-bold border border-indigo-200">${stats.mesa.length} Em Mesa</span>`;
            }

            let detalhesHtml = '';
            if (!isLivre && !estaPausado) {
                detalhesHtml = `<div class="mt-3 space-y-2 pt-3 border-t border-slate-100">`;
                stats.mesa.forEach(a => {
                    const hora = a.inAttendanceTime ? new Date(a.inAttendanceTime).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : '';
                    detalhesHtml += `
                        <div class="searchable-card flex justify-between items-start text-xs bg-slate-50 p-3 rounded-xl border border-slate-200 transition-colors">
                            <div class="flex flex-col gap-0.5">
                                <span class="font-bold text-slate-800">${escapeHTML(a.name)}</span>
                                <span class="text-xs text-slate-500">${escapeHTML(a.subject || 'S/ Assunto')}</span>
                                <div class="flex flex-wrap gap-1">${getBadges(a)}</div>
                            </div>
                            <span class="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100 shrink-0">${hora}</span>
                        </div>`;
                });
                detalhesHtml += `</div>`;
            }

            const presenca = stats.dataObj.presente ? '<span class="text-green-500 ml-1 text-xs" title="Presente">●</span>' : '<span class="text-slate-300 ml-1 text-xs" title="Ausente">●</span>';
            const emailExibição = stats.dataObj.email ? `<p class="text-xs font-mono text-slate-500 mt-0.5">${escapeHTML(stats.dataObj.email)}</p>` : '';

            servidoresHtml += `
                <div class="searchable-card bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow ${estaPausado ? 'border-red-200 bg-red-50/20' : ''}">
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                        <div>
                            <h3 class="font-bold text-slate-800 text-sm flex items-center">${ico('user')} ${escapeHTML(serv)} ${presenca}</h3>
                            <p class="text-xs text-slate-400 font-medium mt-0.5">${escapeHTML(stats.dataObj.cargo)} ${stats.dataObj.equipe ? '- Eq. ' + stats.dataObj.equipe : ''}</p>
                            ${emailExibição}
                        </div>
                        ${statusVisual}
                    </div>
                    ${detalhesHtml}
                </div>
            `;
        });
        if(!servidoresHtml) servidoresHtml = '<p class="text-sm text-slate-400 italic text-center py-6 bg-white rounded-2xl border border-slate-200">Nenhum servidor cadastrado.</p>';

        // PROCESSA FINALIZADOS
        const finalizadosOrdenados = finalizados.sort((a, b) => new Date(b.attendedAt || 0) - new Date(a.attendedAt || 0));
        let finalizadosHtml = '';
        
        if (finalizadosOrdenados.length === 0) {
            finalizadosHtml = '<p class="text-sm text-slate-400 italic text-center py-6 bg-white rounded-2xl border border-slate-200">Nenhum protocolo finalizado hoje.</p>';
        } else {
            finalizadosHtml = `<div class="space-y-2">`;
            finalizadosHtml += finalizadosOrdenados.map(a => {
                const hora = a.attendedAt ? new Date(a.attendedAt).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : '--:--';
                return `
                    <div class="searchable-card flex justify-between items-center bg-white p-3 rounded-xl border border-slate-200 shadow-sm transition-all">
                        <div class="flex flex-col truncate pr-2">
                            <span class="font-bold text-xs text-slate-800 truncate">${escapeHTML(a.name)}</span>
                            <span class="text-xs text-slate-500 truncate">${escapeHTML(a.subject || 'S/ Assunto')}</span>
                            <div class="flex flex-wrap gap-1">${getBadges(a)}</div>
                            ${a.attendedBy ? `<span class="text-[10px] text-green-700 font-semibold mt-1">Por: ${escapeHTML(a.attendedBy)}</span>` : ''}
                        </div>
                        <div class="flex flex-col items-end shrink-0">
                            <span class="text-[10px] font-bold text-green-700 bg-green-50 px-2.5 py-1 rounded-lg border border-green-200">Protocolado</span>
                            <span class="text-xs text-slate-400 mt-1 font-medium">${hora}</span>
                        </div>
                    </div>
                `;
            }).join('');
            finalizadosHtml += `</div>`;
        }

        conteudo.innerHTML = `
            <!-- CARDS DE MÉTRICAS (PADRÃO SIMPLES E LIMPO) -->
            <div class="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
                <button data-target="em-atendimento-column" data-toggle="toggle-em-atendimento" class="card-metrica bg-white hover:bg-slate-50 rounded-2xl border border-slate-200 p-4 text-center shadow-sm hover:shadow transition-all flex flex-col items-center justify-center cursor-pointer group">
                    <p class="text-xs font-bold text-slate-400 group-hover:text-slate-600 uppercase tracking-wide mb-1">Em Mesa</p>
                    <p class="text-2xl font-black text-slate-800">${emMesa.length}</p>
                </button>
                
                <button data-target="distribuicao-column" data-toggle="toggle-distribuicao" class="card-metrica bg-white hover:bg-slate-50 rounded-2xl border border-slate-200 p-4 text-center shadow-sm hover:shadow transition-all flex flex-col items-center justify-center cursor-pointer group">
                    <p class="text-xs font-bold text-slate-400 group-hover:text-slate-600 uppercase tracking-wide mb-1">Assinaturas</p>
                    <p class="text-2xl font-black text-slate-800">${distrib.length}</p>
                </button>

                <button data-target="distribuicao-column" data-toggle="toggle-distribuicao" class="card-metrica bg-white hover:bg-slate-50 rounded-2xl border border-slate-200 p-4 text-center shadow-sm hover:shadow transition-all flex flex-col items-center justify-center cursor-pointer group">
                    <p class="text-xs font-bold text-slate-400 group-hover:text-slate-600 uppercase tracking-wide mb-1">Avaliações</p>
                    <p class="text-2xl font-black text-slate-800">${correcao.length}</p>
                </button>

                <!-- CARD MÉTRICO DE PAUSADOS COM BAGUETE EM VERMELHO VIVO -->
                <div class="card-metrica bg-red-50/50 rounded-2xl border border-red-200 p-4 text-center shadow-sm flex flex-col items-center justify-center">
                    <p class="text-xs font-extrabold text-red-600 uppercase tracking-wide mb-1 flex items-center gap-1"><span>⏸️</span> Pausas</p>
                    <p class="text-2xl font-black text-red-700">${totalPausados}</p>
                </div>

                <button data-target="atendidos-column" class="card-metrica bg-white hover:bg-slate-50 rounded-2xl border border-slate-200 p-4 text-center shadow-sm hover:shadow transition-all flex flex-col items-center justify-center cursor-pointer group">
                    <p class="text-xs font-bold text-slate-400 group-hover:text-slate-600 uppercase tracking-wide mb-1">Protocolados</p>
                    <p class="text-2xl font-black text-slate-800">${finalizados.length}</p>
                </button>
            </div>

            <!-- COLUNAS -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                
                <!-- SERVIDORES -->
                <div class="flex flex-col bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                    <div class="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                        <h3 class="font-bold text-slate-800 text-base">Servidores</h3>
                        <span class="bg-slate-100 text-slate-700 text-xs px-2.5 py-1 rounded-xl font-bold border border-slate-200">${servidores.length}</span>
                    </div>
                    <div class="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                        ${servidoresHtml}
                    </div>
                </div>

                <!-- DEFENSORES -->
                <div class="flex flex-col bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                    <div class="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                        <h3 class="font-bold text-slate-800 text-base">Defensores</h3>
                        <span class="bg-slate-100 text-slate-700 text-xs px-2.5 py-1 rounded-xl font-bold border border-slate-200">${defensores.length}</span>
                    </div>
                    <div class="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                        ${defensoresHtml}
                    </div>
                </div>

                <!-- CONCLUÍDOS -->
                <div class="flex flex-col bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                    <div class="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                        <h3 class="font-bold text-slate-800 text-base">Últimos Concluídos</h3>
                        <span class="bg-green-50 text-green-700 text-xs px-2.5 py-1 rounded-xl font-bold border border-green-200">${finalizados.length}</span>
                    </div>
                    <div class="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                        ${finalizadosHtml}
                    </div>
                </div>

            </div>
        `;

        document.querySelectorAll('.card-metrica[data-target]').forEach(card => {
            card.onclick = () => {
                const targetId = card.getAttribute('data-target');
                const toggleId = card.getAttribute('data-toggle');
                this.irParaColuna(app, targetId, toggleId);
            };
        });

        const searchInput = document.getElementById('busca-painel-monitor');
        if (searchInput && searchInput.value) {
            searchInput.dispatchEvent(new Event('input'));
        }
    }
};
