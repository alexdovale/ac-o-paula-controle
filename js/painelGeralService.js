// js/painelGeralService.js - MONITOR DE PRODUTIVIDADE (FLUTUANTE E ARRASTÁVEL)

import { escapeHTML } from './utils.js';

export const PainelGeralService = {
    // ========================================================
    // 1. INJEÇÃO DO BOTÃO NO MENU DE AÇÕES
    // ========================================================
    injetarBotao(app) {
        const actionsPanel = document.getElementById('actions-panel');
        
        // Verifica permissões (Operadores ou Apoio com liberação ativa)
        const role = window.app?.currentUser?.role || 'user';
        const isOwner = window.app?.auth?.currentUser?.uid === app.currentPautaOwnerId;
        const isOperador = isOwner || ['admin', 'superadmin', 'user'].includes(role);
        const liberadoApoio = app.currentPautaData?.liberarPainelGeralApoio === true; 
        const canView = isOperador || (role === 'apoio' && liberadoApoio);

        let btn = document.getElementById('btn-painel-geral-externo');
        
        if (!canView) {
            if (btn) btn.remove();
            this.fecharPainel();
            return;
        }

        // Cria o botão com visual padronizado do seu sistema
        if (actionsPanel && !btn) {
            btn = document.createElement('button');
            btn.id = 'btn-painel-geral-externo';
            btn.className = "w-full text-left px-3 py-2.5 sm:py-2 text-sm font-medium text-emerald-700 bg-emerald-100 rounded-lg hover:bg-emerald-200 transition-colors flex items-center gap-2 mt-2 shadow-sm whitespace-nowrap";
            btn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5 text-emerald-600"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
                <span>Monitor da Equipe</span>
            `;
            
            btn.onclick = () => {
                this.abrirPainel(app);
            };
            
            // Adiciona como o primeiro botão para ter destaque
            actionsPanel.insertBefore(btn, actionsPanel.firstChild);
        }

        // Atualiza os dados se o painel já estiver flutuando na tela
        const painel = document.getElementById('painel-flutuante-monitor');
        if (painel && !painel.classList.contains('hidden')) {
            this.atualizarConteudo(app);
        }
    },

    // ========================================================
    // 2. CONSTRUÇÃO DO MODAL FLUTUANTE
    // ========================================================
    abrirPainel(app) {
        let painel = document.getElementById('painel-flutuante-monitor');
        
        if (!painel) {
            painel = document.createElement('div');
            painel.id = 'painel-flutuante-monitor';
            // Layout moderno, fixo e arrastável
            painel.className = 'fixed bottom-4 right-4 sm:bottom-8 sm:right-8 w-80 sm:w-96 bg-white rounded-xl shadow-2xl flex flex-col z-[200] border border-gray-200 overflow-hidden transform transition-transform duration-300 ease-out translate-y-0';
            painel.style.maxHeight = '85vh';
            
            painel.innerHTML = `
                <div id="painel-monitor-header" class="bg-gradient-to-r from-emerald-600 to-teal-700 p-3 flex justify-between items-center text-white cursor-move select-none shrink-0 border-b border-emerald-800 shadow-md">
                    <div class="flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                        <h2 class="font-black text-xs uppercase tracking-widest">Produtividade</h2>
                    </div>
                    <div class="flex items-center gap-2">
                        <button id="btn-minimizar-monitor" class="w-6 h-6 flex items-center justify-center hover:bg-white/20 rounded transition-colors" title="Minimizar">
                           <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        </button>
                        <button id="btn-fechar-monitor" class="w-6 h-6 flex items-center justify-center hover:bg-red-500 rounded transition-colors" title="Fechar">
                           <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                </div>
                
                <div id="painel-monitor-body" class="flex-grow overflow-y-auto bg-slate-50 flex flex-col scrollable-content transition-all duration-300 origin-top">
                    <div id="painel-monitor-conteudo" class="p-3 space-y-4">
                        <div class="flex justify-center py-6">
                            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(painel);

            // Listeners dos botões de controle da janela
            document.getElementById('btn-fechar-monitor').onclick = () => this.fecharPainel();
            
            document.getElementById('btn-minimizar-monitor').onclick = () => {
                const body = document.getElementById('painel-monitor-body');
                const btnMini = document.getElementById('btn-minimizar-monitor');
                body.classList.toggle('hidden');
                
                if (body.classList.contains('hidden')) {
                    btnMini.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>';
                } else {
                    btnMini.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
                }
            };

            this.tornarArrastavel(painel, document.getElementById('painel-monitor-header'));
        }

        // Animação de entrada
        painel.classList.remove('hidden', 'translate-y-[120%]');
        this.atualizarConteudo(app);
    },

    fecharPainel() {
        const painel = document.getElementById('painel-flutuante-monitor');
        if (painel) {
            painel.classList.add('translate-y-[120%]');
            setTimeout(() => painel.classList.add('hidden'), 300);
        }
    },

    // ========================================================
    // 3. PROCESSAMENTO DE DADOS (CRUZAMENTO DE TABELAS)
    // ========================================================
    atualizarConteudo(app) {
        const conteudo = document.getElementById('painel-monitor-conteudo');
        if (!conteudo) return;

        const todos = app.allAssisted || [];
        const colaboradoresDb = app.colaboradores || [];
        
        // Filtros Atendimento Externo
        const emMesa = todos.filter(a => a.status === 'emAtendimento' && a.delegationToken); 
        const distrib = todos.filter(a => a.status === 'aguardandoDistribuicao');
        const correcao = todos.filter(a => a.status === 'aguardandoCorrecao');

        // Filtro de Colaboradores Base
        const defensores = colaboradoresDb.filter(c => c.cargo?.toLowerCase().includes('defensor'));
        const servidores = colaboradoresDb.filter(c => !c.cargo?.toLowerCase().includes('defensor'));

        // PROCESSA DEFENSORES
        const countDefensores = {};
        defensores.forEach(d => { countDefensores[d.nome] = { distrib: 0, correcao: 0 }; });

        [...distrib, ...correcao].forEach(a => {
            const def = a.defensorResponsavel || 'Não Atribuído';
            if(!countDefensores[def]) countDefensores[def] = { distrib: 0, correcao: 0 };
            
            if(a.status === 'aguardandoDistribuicao') countDefensores[def].distrib++;
            if(a.status === 'aguardandoCorrecao') countDefensores[def].correcao++;
        });

        let defensoresHtml = '';
        Object.keys(countDefensores).sort().forEach(def => {
            const stats = countDefensores[def];
            const total = stats.distrib + stats.correcao;
            
            let statusVisual = total === 0 
                ? `<span class="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-bold border border-emerald-200 shadow-sm flex items-center gap-1"><span class="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span> Livre</span>`
                : `<div class="flex flex-col items-end gap-1">
                     ${stats.distrib > 0 ? `<span class="bg-cyan-100 text-cyan-800 px-2 py-0.5 rounded text-[9px] font-bold shadow-sm">${stats.distrib} P/ Assinar</span>` : ''}
                     ${stats.correcao > 0 ? `<span class="bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-[9px] font-bold shadow-sm">${stats.correcao} P/ Avaliar</span>` : ''}
                   </div>`;

            defensoresHtml += `
                <div class="flex justify-between items-center py-2.5 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors px-1">
                    <span class="font-bold text-gray-700 text-xs truncate max-w-[140px]">${escapeHTML(def)}</span>
                    ${statusVisual}
                </div>
            `;
        });
        if(!defensoresHtml) defensoresHtml = '<p class="text-xs text-gray-400 italic text-center py-2">Sem defensores ativos.</p>';

        // PROCESSA SERVIDORES
        const countServidores = {};
        servidores.forEach(s => { countServidores[s.nome] = 0; });

        emMesa.forEach(a => {
            const serv = a.assignedCollaborator?.name || 'Não Atribuído';
            if(countServidores[serv] === undefined) countServidores[serv] = 0;
            countServidores[serv]++;
        });

        let servidoresHtml = '';
        Object.keys(countServidores).sort().forEach(serv => {
            const qtd = countServidores[serv];
            
            let statusVisual = qtd === 0 
                ? `<span class="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-bold border border-emerald-200 shadow-sm flex items-center gap-1"><span class="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span> Livre</span>`
                : `<span class="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-[10px] font-bold border border-indigo-200 shadow-sm">⏳ ${qtd} Em Mesa</span>`;

            servidoresHtml += `
                <div class="flex justify-between items-center py-2.5 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors px-1">
                    <span class="font-bold text-gray-700 text-xs truncate max-w-[140px]">${escapeHTML(serv)}</span>
                    ${statusVisual}
                </div>
            `;
        });
        if(!servidoresHtml) servidoresHtml = '<p class="text-xs text-gray-400 italic text-center py-2">Sem servidores ativos.</p>';

        // ========================================================
        // 4. RENDERIZAÇÃO
        // ========================================================
        conteudo.innerHTML = `
            <div class="grid grid-cols-3 gap-2">
                <div class="bg-white rounded-lg border border-gray-200 p-2 text-center shadow-sm flex flex-col justify-center items-center">
                    <p class="text-[9px] font-black text-gray-400 uppercase tracking-wider mb-0.5">Em Mesa</p>
                    <p class="text-lg font-black text-indigo-600 leading-none">${emMesa.length}</p>
                </div>
                <div class="bg-white rounded-lg border border-gray-200 p-2 text-center shadow-sm flex flex-col justify-center items-center">
                    <p class="text-[9px] font-black text-gray-400 uppercase tracking-wider mb-0.5">Assinar</p>
                    <p class="text-lg font-black text-cyan-600 leading-none">${distrib.length}</p>
                </div>
                <div class="bg-white rounded-lg border border-gray-200 p-2 text-center shadow-sm flex flex-col justify-center items-center">
                    <p class="text-[9px] font-black text-gray-400 uppercase tracking-wider mb-0.5">Avaliar</p>
                    <p class="text-lg font-black text-amber-500 leading-none">${correcao.length}</p>
                </div>
            </div>

            <div class="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div class="bg-indigo-50 px-3 py-2 border-b border-indigo-100 flex items-center justify-between">
                    <h3 class="font-black text-[10px] text-indigo-800 uppercase tracking-widest flex items-center gap-1"><span>🧑‍💻</span> Servidores</h3>
                    <span class="text-[9px] text-indigo-500 font-bold">${servidores.length} Ativos</span>
                </div>
                <div class="px-3 py-1">
                    ${servidoresHtml}
                </div>
            </div>

            <div class="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div class="bg-cyan-50 px-3 py-2 border-b border-cyan-100 flex items-center justify-between">
                    <h3 class="font-black text-[10px] text-cyan-800 uppercase tracking-widest flex items-center gap-1"><span>👨‍⚖️</span> Defensores</h3>
                    <span class="text-[9px] text-cyan-500 font-bold">${defensores.length} Ativos</span>
                </div>
                <div class="px-3 py-1">
                    ${defensoresHtml}
                </div>
            </div>
        `;
    },

    // ========================================================
    // 5. MOTOR DE DRAG & DROP NATIVO (Mobile e Desktop)
    // ========================================================
    tornarArrastavel(elementoPainel, elementoCabecalho) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

        elementoCabecalho.onmousedown = arrastarMouseDown;
        elementoCabecalho.ontouchstart = arrastarTouchStart;

        function arrastarMouseDown(e) {
            e = e || window.event;
            // Ignora o clique se for nos botões do header
            if (e.target.tagName.toLowerCase() === 'button' || e.target.closest('button')) return;
            
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = pararArrastar;
            document.onmousemove = arrastarElemento;
        }

        function arrastarTouchStart(e) {
            if (e.target.tagName.toLowerCase() === 'button' || e.target.closest('button')) return;
            pos3 = e.touches[0].clientX;
            pos4 = e.touches[0].clientY;
            document.ontouchend = pararArrastar;
            document.ontouchmove = arrastarElementoTouch;
        }

        function arrastarElemento(e) {
            e = e || window.event;
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;

            elementoPainel.style.bottom = "auto";
            elementoPainel.style.right = "auto";
            
            let newTop = elementoPainel.offsetTop - pos2;
            let newLeft = elementoPainel.offsetLeft - pos1;

            if(newTop < 0) newTop = 0;
            if(newLeft < 0) newLeft = 0;
            if(newTop + elementoPainel.offsetHeight > window.innerHeight) newTop = window.innerHeight - elementoPainel.offsetHeight;
            if(newLeft + elementoPainel.offsetWidth > window.innerWidth) newLeft = window.innerWidth - elementoPainel.offsetWidth;

            elementoPainel.style.top = newTop + "px";
            elementoPainel.style.left = newLeft + "px";
        }

        function arrastarElementoTouch(e) {
            pos1 = pos3 - e.touches[0].clientX;
            pos2 = pos4 - e.touches[0].clientY;
            pos3 = e.touches[0].clientX;
            pos4 = e.touches[0].clientY;

            elementoPainel.style.bottom = "auto";
            elementoPainel.style.right = "auto";
            
            let newTop = elementoPainel.offsetTop - pos2;
            let newLeft = elementoPainel.offsetLeft - pos1;

            if(newTop < 0) newTop = 0;
            if(newLeft < 0) newLeft = 0;
            if(newTop + elementoPainel.offsetHeight > window.innerHeight) newTop = window.innerHeight - elementoPainel.offsetHeight;
            if(newLeft + elementoPainel.offsetWidth > window.innerWidth) newLeft = window.innerWidth - elementoPainel.offsetWidth;

            elementoPainel.style.top = newTop + "px";
            elementoPainel.style.left = newLeft + "px";
        }

        function pararArrastar() {
            document.onmouseup = null;
            document.onmousemove = null;
            document.ontouchend = null;
            document.ontouchmove = null;
        }
    }
};
