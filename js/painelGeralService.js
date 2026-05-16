// js/painelGeralService.js

import { escapeHTML } from './utils.js';

export const PainelGeralService = {
    
    // 1. Injeta o botão no menu de Ações da Pauta
    injetarBotao(app) {
        const actionsPanel = document.getElementById('actions-panel');
        if (!actionsPanel) return;

        const role = window.app?.currentUser?.role || 'user';
        const isOwner = window.app?.auth?.currentUser?.uid === app.currentPautaOwnerId;
        const isOperador = isOwner || ['admin', 'superadmin', 'user'].includes(role);
        
        // Verifica se o painel foi liberado nas configurações da pauta (para o papel 'apoio')
        const liberadoApoio = app.currentPautaData?.liberarPainelGeralApoio === true; 

        // Só exibe se for operador OU se for apoio e o dono tiver liberado explicitamente
        const canView = isOperador || (role === 'apoio' && liberadoApoio);

        let btn = document.getElementById('btn-painel-geral-externo');
        
        if (!canView) {
            if (btn) btn.remove();
            return;
        }

        if (!btn) {
            btn = document.createElement('button');
            btn.id = 'btn-painel-geral-externo';
            btn.className = "w-full bg-indigo-50 text-indigo-700 font-bold py-2.5 px-4 rounded-lg hover:bg-indigo-100 transition-colors flex items-center justify-center gap-2 mt-4 border border-indigo-200 shadow-sm uppercase tracking-wide text-[11px]";
            btn.innerHTML = `<span>📊</span> Status do Atend. Externo`;
            btn.onclick = () => {
                this.abrirPainel(app);
                
                // Fecha o menu de ações ao clicar
                if (!actionsPanel.classList.contains('opacity-0')) {
                    actionsPanel.classList.add('opacity-0', 'scale-95', 'pointer-events-none');
                    document.getElementById('actions-arrow')?.classList.remove('rotate-180');
                }
            };
            actionsPanel.appendChild(btn);
        }
    },

    // 2. Abre o Modal e calcula os detalhes
    abrirPainel(app) {
        let modal = document.getElementById('painel-geral-externo-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'painel-geral-externo-modal';
            modal.className = 'fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-2 sm:p-4 backdrop-blur-sm transition-opacity';
            document.body.appendChild(modal);
        }

        const todos = app.allAssisted || [];
        
        // --- FILTROS ---
        const emMesa = todos.filter(a => a.status === 'emAtendimento' && a.delegationToken); 
        const distrib = todos.filter(a => a.status === 'aguardandoDistribuicao');
        const correcao = todos.filter(a => a.status === 'aguardandoCorrecao');
        const finalizados = todos.filter(a => a.status === 'atendido' && a.finalizadoPeloColaborador); 

        // --- GERAÇÃO DE HTML DETALHADO: SERVIDORES (EM MESA) ---
        const servidoresStats = {};
        emMesa.forEach(a => {
            const serv = a.assignedCollaborator?.name || 'Não Atribuído';
            if(!servidoresStats[serv]) servidoresStats[serv] = [];
            servidoresStats[serv].push(a);
        });

        let servidoresHtml = '';
        Object.keys(servidoresStats).forEach(serv => {
            let listaAssistidos = servidoresStats[serv].map(a => {
                const hora = a.inAttendanceTime ? new Date(a.inAttendanceTime).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : '--:--';
                return `
                    <div class="flex justify-between items-center py-2 border-b border-purple-100 last:border-0">
                        <div class="truncate pr-2">
                            <p class="font-bold text-xs text-gray-800 truncate">${escapeHTML(a.name)}</p>
                            <p class="text-[10px] text-gray-500 truncate">${escapeHTML(a.subject || 'S/ Assunto')}</p>
                        </div>
                        <div class="text-right flex-shrink-0">
                            <p class="text-[9px] font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200 uppercase">Em Mesa</p>
                            <p class="text-[9px] text-gray-400 mt-0.5">Desde ${hora}</p>
                        </div>
                    </div>
                `;
            }).join('');

            servidoresHtml += `
                <div class="mb-3 bg-white border border-purple-200 rounded-lg overflow-hidden shadow-sm">
                    <div class="bg-purple-100 p-2 flex justify-between items-center">
                        <span class="font-black text-purple-900 text-xs">🧑‍💻 ${escapeHTML(serv)}</span>
                        <span class="bg-purple-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full">${servidoresStats[serv].length}</span>
                    </div>
                    <div class="p-2 bg-white">
                        ${listaAssistidos}
                    </div>
                </div>
            `;
        });
        if(!servidoresHtml) servidoresHtml = '<p class="text-xs text-gray-500 italic p-3 text-center bg-gray-50 rounded-lg border border-dashed">Nenhuma demanda em mesa.</p>';

        // --- GERAÇÃO DE HTML DETALHADO: DEFENSORES (CORREÇÃO E ASSINATURA) ---
        const defensoresStats = {};
        [...distrib, ...correcao].forEach(a => {
            const def = a.defensorResponsavel || 'Não Atribuído';
            if(!defensoresStats[def]) defensoresStats[def] = [];
            defensoresStats[def].push(a);
        });

        let defensoresHtml = '';
        Object.keys(defensoresStats).forEach(def => {
            let listaAssistidos = defensoresStats[def].map(a => {
                const isCorrecao = a.status === 'aguardandoCorrecao';
                const badgeText = isCorrecao ? 'P/ Avaliar' : 'P/ Assinar';
                const badgeClass = isCorrecao ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-blue-700 bg-blue-50 border-blue-200';
                
                return `
                    <div class="flex justify-between items-center py-2 border-b border-blue-100 last:border-0">
                        <div class="truncate pr-2">
                            <p class="font-bold text-xs text-gray-800 truncate">${escapeHTML(a.name)}</p>
                            <p class="text-[10px] text-gray-500 truncate">${escapeHTML(a.subject || 'S/ Assunto')}</p>
                            ${a.enviadoPor ? `<p class="text-[9px] text-blue-400 mt-0.5 font-bold">Enviado por: ${escapeHTML(a.enviadoPor)}</p>` : ''}
                        </div>
                        <div class="text-right flex-shrink-0">
                            <p class="text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase ${badgeClass}">${badgeText}</p>
                        </div>
                    </div>
                `;
            }).join('');

            defensoresHtml += `
                <div class="mb-3 bg-white border border-blue-200 rounded-lg overflow-hidden shadow-sm">
                    <div class="bg-blue-100 p-2 flex justify-between items-center">
                        <span class="font-black text-blue-900 text-xs">👨‍⚖️ ${escapeHTML(def)}</span>
                        <span class="bg-blue-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full">${defensoresStats[def].length}</span>
                    </div>
                    <div class="p-2 bg-white">
                        ${listaAssistidos}
                    </div>
                </div>
            `;
        });
        if(!defensoresHtml) defensoresHtml = '<p class="text-xs text-gray-500 italic p-3 text-center bg-gray-50 rounded-lg border border-dashed">Nenhum caso com defensores.</p>';

        // --- GERAÇÃO DE HTML DETALHADO: FINALIZADOS ---
        // Ordena do mais recente para o mais antigo
        const finalizadosOrdenados = finalizados.sort((a, b) => new Date(b.attendedAt || 0) - new Date(a.attendedAt || 0));
        let finalizadosHtml = '';
        
        if (finalizadosOrdenados.length === 0) {
            finalizadosHtml = '<p class="text-xs text-gray-500 italic p-3 text-center bg-gray-50 rounded-lg border border-dashed">Nenhum atendimento finalizado ainda.</p>';
        } else {
            finalizadosHtml = `<div class="bg-white border border-green-200 rounded-lg overflow-hidden shadow-sm p-2">`;
            finalizadosHtml += finalizadosOrdenados.map(a => {
                const hora = a.attendedAt ? new Date(a.attendedAt).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : '--:--';
                return `
                    <div class="flex justify-between items-center py-2 border-b border-green-100 last:border-0">
                        <div class="truncate pr-2">
                            <p class="font-bold text-xs text-gray-800 truncate">${escapeHTML(a.name)}</p>
                            <p class="text-[10px] text-gray-500 truncate">${escapeHTML(a.subject || 'S/ Assunto')}</p>
                            ${a.attendedBy ? `<p class="text-[9px] text-green-600 mt-0.5 font-bold">Por: ${escapeHTML(a.attendedBy)}</p>` : ''}
                        </div>
                        <div class="text-right flex-shrink-0">
                            <p class="text-[9px] font-bold text-green-700 bg-green-50 px-1.5 py-0.5 rounded border border-green-200 uppercase">Protocolado</p>
                            <p class="text-[9px] font-black text-gray-400 mt-0.5">às ${hora}</p>
                        </div>
                    </div>
                `;
            }).join('');
            finalizadosHtml += `</div>`;
        }

        // --- MONTA O MODAL ---
        modal.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col transform transition-all scale-100 animate-fade-in-up max-h-[95vh] h-[90vh]">
                
                <div class="bg-indigo-600 p-4 sm:p-5 flex justify-between items-center text-white relative overflow-hidden shrink-0">
                    <div class="absolute top-0 right-0 w-32 h-32 bg-white opacity-5 rounded-full -mr-10 -mt-10 pointer-events-none"></div>
                    <div class="relative z-10">
                        <h2 class="font-black text-lg sm:text-xl flex items-center gap-2 tracking-wide"><span>📊</span> Detalhamento do Atendimento Externo</h2>
                        <p class="text-indigo-200 text-[10px] sm:text-xs mt-1 font-medium">Controle de produtividade e andamento de processos</p>
                    </div>
                    <button id="close-painel-geral" class="relative z-10 text-indigo-200 hover:text-white hover:rotate-90 transition-all text-3xl font-light leading-none">&times;</button>
                </div>
                
                <div class="p-3 sm:p-5 bg-gray-100 overflow-y-auto custom-scrollbar flex-grow">
                    
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
                        <div class="bg-white p-3 rounded-xl border border-purple-100 text-center shadow-sm relative overflow-hidden">
                            <div class="absolute top-0 left-0 w-full h-1 bg-purple-500"></div>
                            <p class="text-xl sm:text-2xl font-black text-purple-600 mt-1">${emMesa.length}</p>
                            <p class="text-[8px] sm:text-[9px] text-gray-500 font-bold uppercase tracking-wider mt-1">Em Mesa</p>
                        </div>
                        <div class="bg-white p-3 rounded-xl border border-blue-100 text-center shadow-sm relative overflow-hidden">
                            <div class="absolute top-0 left-0 w-full h-1 bg-blue-500"></div>
                            <p class="text-xl sm:text-2xl font-black text-blue-600 mt-1">${distrib.length}</p>
                            <p class="text-[8px] sm:text-[9px] text-gray-500 font-bold uppercase tracking-wider mt-1">P/ Assinar</p>
                        </div>
                        <div class="bg-white p-3 rounded-xl border border-amber-100 text-center shadow-sm relative overflow-hidden">
                            <div class="absolute top-0 left-0 w-full h-1 bg-amber-500"></div>
                            <p class="text-xl sm:text-2xl font-black text-amber-600 mt-1">${correcao.length}</p>
                            <p class="text-[8px] sm:text-[9px] text-gray-500 font-bold uppercase tracking-wider mt-1">P/ Avaliar</p>
                        </div>
                        <div class="bg-white p-3 rounded-xl border border-green-100 text-center shadow-sm relative overflow-hidden">
                            <div class="absolute top-0 left-0 w-full h-1 bg-green-500"></div>
                            <p class="text-xl sm:text-2xl font-black text-green-600 mt-1">${finalizados.length}</p>
                            <p class="text-[8px] sm:text-[9px] text-gray-500 font-bold uppercase tracking-wider mt-1">Protocolados</p>
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 h-auto">
                        
                        <div class="flex flex-col h-full max-h-[60vh]">
                            <h3 class="font-black text-[10px] text-purple-600 uppercase tracking-widest mb-2 flex items-center gap-1"><span class="text-sm">⏳</span> Com Servidores</h3>
                            <div class="overflow-y-auto pr-1 pb-4 custom-scrollbar">
                                ${servidoresHtml}
                            </div>
                        </div>

                        <div class="flex flex-col h-full max-h-[60vh]">
                            <h3 class="font-black text-[10px] text-blue-600 uppercase tracking-widest mb-2 flex items-center gap-1"><span class="text-sm">👨‍⚖️</span> Com Defensores</h3>
                            <div class="overflow-y-auto pr-1 pb-4 custom-scrollbar">
                                ${defensoresHtml}
                            </div>
                        </div>

                        <div class="flex flex-col h-full max-h-[60vh]">
                            <h3 class="font-black text-[10px] text-green-600 uppercase tracking-widest mb-2 flex items-center gap-1"><span class="text-sm">✅</span> Concluídos</h3>
                            <div class="overflow-y-auto pr-1 pb-4 custom-scrollbar">
                                ${finalizadosHtml}
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        `;

        modal.classList.remove('hidden');

        document.getElementById('close-painel-geral').onclick = () => {
            modal.classList.add('hidden');
        };

        modal.onclick = (e) => {
            if (e.target === modal) modal.classList.add('hidden');
        };
    }
};
