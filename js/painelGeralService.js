// js/painelGeralService.js

import { escapeHTML } from './utils.js';

export const PainelGeralService = {
    
    // Injeta o botão no menu de Ações da Pauta e atualiza o painel se já estiver aberto
    injetarBotao(app) {
        const actionsPanel = document.getElementById('actions-panel');
        
        // Verifica permissões
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

        // Se o botão não existe, cria
        if (actionsPanel && !btn) {
            btn = document.createElement('button');
            btn.id = 'btn-painel-geral-externo';
            btn.className = "w-full bg-indigo-50 text-indigo-700 font-bold py-2.5 px-4 rounded-lg hover:bg-indigo-100 transition-colors flex items-center justify-center gap-2 mt-4 border border-indigo-200 shadow-sm uppercase tracking-wide text-[11px]";
            btn.innerHTML = `<span>📊</span> Monitor de Produtividade`;
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

        // Se o painel flutuante já estiver na tela, atualiza os dados em tempo real
        const painel = document.getElementById('painel-flutuante-monitor');
        if (painel && !painel.classList.contains('hidden')) {
            this.atualizarConteudo(app);
        }
    },

    abrirPainel(app) {
        let painel = document.getElementById('painel-flutuante-monitor');
        
        // Se não existir, constrói a estrutura da janela flutuante
        if (!painel) {
            painel = document.createElement('div');
            painel.id = 'painel-flutuante-monitor';
            // Estilos da janela: Fixa, Z-index alto, sombra, cantos arredondados. Inicia no canto inferior direito.
            painel.className = 'fixed bottom-6 right-6 w-80 sm:w-96 bg-white rounded-xl shadow-2xl flex flex-col z-[200] border border-gray-300 overflow-hidden';
            painel.style.maxHeight = '85vh';
            
            painel.innerHTML = `
                <div id="painel-monitor-header" class="bg-indigo-700 p-3 flex justify-between items-center text-white cursor-move select-none shrink-0 relative overflow-hidden">
                    <div class="absolute top-0 right-0 w-20 h-20 bg-white opacity-10 rounded-full -mr-5 -mt-5 pointer-events-none"></div>
                    <div class="flex items-center gap-2 relative z-10">
                        <span class="text-lg">📡</span>
                        <h2 class="font-black text-sm uppercase tracking-wide">Monitor de Equipe</h2>
                    </div>
                    <div class="flex items-center gap-1 relative z-10">
                        <button id="btn-minimizar-monitor" class="w-6 h-6 flex items-center justify-center hover:bg-white/20 rounded transition-colors text-white font-bold" title="Minimizar">_</button>
                        <button id="btn-fechar-monitor" class="w-6 h-6 flex items-center justify-center hover:bg-red-500 rounded transition-colors text-white font-bold" title="Fechar">&times;</button>
                    </div>
                </div>
                
                <div id="painel-monitor-body" class="flex-grow overflow-y-auto bg-gray-50 flex flex-col custom-scrollbar">
                    <div id="painel-monitor-conteudo" class="p-3">
                        <p class="text-center text-xs text-gray-500 py-4">Carregando dados em tempo real...</p>
                    </div>
                </div>
            `;
            document.body.appendChild(painel);

            // Funcionalidades dos botões de controle
            document.getElementById('btn-fechar-monitor').onclick = () => this.fecharPainel();
            
            document.getElementById('btn-minimizar-monitor').onclick = () => {
                const body = document.getElementById('painel-monitor-body');
                const btnMini = document.getElementById('btn-minimizar-monitor');
                if (body.classList.contains('hidden')) {
                    body.classList.remove('hidden');
                    btnMini.textContent = '_';
                } else {
                    body.classList.add('hidden');
                    btnMini.textContent = '□';
                }
            };

            // Aplica a lógica de arrastar a janela (Drag & Drop)
            this.tornarArrastavel(painel, document.getElementById('painel-monitor-header'));
        }

        painel.classList.remove('hidden');
        this.atualizarConteudo(app);
    },

    fecharPainel() {
        const painel = document.getElementById('painel-flutuante-monitor');
        if (painel) {
            painel.classList.add('hidden');
        }
    },

    atualizarConteudo(app) {
        const conteudo = document.getElementById('painel-monitor-conteudo');
        if (!conteudo) return;

        const todos = app.allAssisted || [];
        const colaboradoresDb = app.colaboradores || [];
        
        // Separa os dados de demanda
        const emMesa = todos.filter(a => a.status === 'emAtendimento' && a.delegationToken); 
        const distrib = todos.filter(a => a.status === 'aguardandoDistribuicao');
        const correcao = todos.filter(a => a.status === 'aguardandoCorrecao');
        const finalizados = todos.filter(a => a.status === 'atendido' && a.finalizadoPeloColaborador); 

        // Separa os colaboradores
        const defensores = colaboradoresDb.filter(c => c.cargo?.toLowerCase().includes('defensor'));
        const servidores = colaboradoresDb.filter(c => !c.cargo?.toLowerCase().includes('defensor'));

        // ==========================================
        // 1. PROCESSA DEFENSORES
        // ==========================================
        const countDefensores = {};
        defensores.forEach(d => {
            countDefensores[d.nome] = { distrib: 0, correcao: 0 };
        });

        // Garante que se tiver uma demanda pra um defensor que foi removido da lista, ele apareça
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
            
            let statusVisual = '';
            if (total === 0) {
                statusVisual = `<span class="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[9px] font-black border border-emerald-200">✅ LIVRE</span>`;
            } else {
                statusVisual = `<div class="flex gap-1 flex-col items-end">`;
                if(stats.distrib > 0) statusVisual += `<span class="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[9px] font-black border border-blue-200">${stats.distrib} p/ Assinar</span>`;
                if(stats.correcao > 0) statusVisual += `<span class="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[9px] font-black border border-amber-200">${stats.correcao} p/ Avaliar</span>`;
                statusVisual += `</div>`;
            }

            defensoresHtml += `
                <div class="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                    <span class="font-bold text-gray-800 text-xs truncate max-w-[150px]">👨‍⚖️ ${escapeHTML(def)}</span>
                    ${statusVisual}
                </div>
            `;
        });
        if(!defensoresHtml) defensoresHtml = '<p class="text-xs text-gray-400 italic">Nenhum defensor cadastrado ou ativo.</p>';

        // ==========================================
        // 2. PROCESSA SERVIDORES
        // ==========================================
        const countServidores = {};
        servidores.forEach(s => {
            countServidores[s.nome] = 0;
        });

        emMesa.forEach(a => {
            const serv = a.assignedCollaborator?.name || 'Não Atribuído';
            if(countServidores[serv] === undefined) countServidores[serv] = 0;
            countServidores[serv]++;
        });

        let servidoresHtml = '';
        Object.keys(countServidores).sort().forEach(serv => {
            const qtd = countServidores[serv];
            
            let statusVisual = '';
            if (qtd === 0) {
                statusVisual = `<span class="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[9px] font-black border border-emerald-200">✅ LIVRE</span>`;
            } else {
                statusVisual = `<span class="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-[9px] font-black border border-purple-200">⏳ ${qtd} Em Mesa</span>`;
            }

            servidoresHtml += `
                <div class="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                    <span class="font-bold text-gray-800 text-xs truncate max-w-[150px]">🧑‍💻 ${escapeHTML(serv)}</span>
                    ${statusVisual}
                </div>
            `;
        });
        if(!servidoresHtml) servidoresHtml = '<p class="text-xs text-gray-400 italic">Nenhum servidor cadastrado ou ativo.</p>';

        // ==========================================
        // MONTAGEM DO HTML FINAL
        // ==========================================
        conteudo.innerHTML = `
            <div class="grid grid-cols-4 gap-2 mb-4">
                <div class="bg-white rounded border border-purple-100 p-2 text-center shadow-sm">
                    <p class="text-[9px] font-bold text-gray-400 uppercase">Mesa</p>
                    <p class="text-sm font-black text-purple-600">${emMesa.length}</p>
                </div>
                <div class="bg-white rounded border border-blue-100 p-2 text-center shadow-sm">
                    <p class="text-[9px] font-bold text-gray-400 uppercase">Assinar</p>
                    <p class="text-sm font-black text-blue-600">${distrib.length}</p>
                </div>
                <div class="bg-white rounded border border-amber-100 p-2 text-center shadow-sm">
                    <p class="text-[9px] font-bold text-gray-400 uppercase">Avaliar</p>
                    <p class="text-sm font-black text-amber-600">${correcao.length}</p>
                </div>
                <div class="bg-white rounded border border-green-100 p-2 text-center shadow-sm">
                    <p class="text-[9px] font-bold text-gray-400 uppercase">Concluído</p>
                    <p class="text-sm font-black text-green-600">${finalizados.length}</p>
                </div>
            </div>

            <div class="bg-white border border-gray-200 rounded-xl shadow-sm mb-3 overflow-hidden">
                <div class="bg-gray-100 p-2 border-b border-gray-200">
                    <h3 class="font-black text-[10px] text-gray-600 uppercase tracking-widest">Status: Servidores</h3>
                </div>
                <div class="p-2">
                    ${servidoresHtml}
                </div>
            </div>

            <div class="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div class="bg-gray-100 p-2 border-b border-gray-200">
                    <h3 class="font-black text-[10px] text-gray-600 uppercase tracking-widest">Status: Defensores</h3>
                </div>
                <div class="p-2">
                    ${defensoresHtml}
                </div>
            </div>
        `;
    },

    // Lógica para tornar a div arrastável pela tela
    tornarArrastavel(elementoPainel, elementoCabecalho) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

        elementoCabecalho.onmousedown = arrastarMouseDown;
        // Suporte para touch no celular
        elementoCabecalho.ontouchstart = arrastarTouchStart;

        function arrastarMouseDown(e) {
            e = e || window.event;
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = pararArrastar;
            document.onmousemove = arrastarElemento;
        }

        function arrastarTouchStart(e) {
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

            // Desativa bottom/right para que top/left controlem o posicionamento
            elementoPainel.style.bottom = "auto";
            elementoPainel.style.right = "auto";
            
            // Define os novos limites garantindo que não saia da tela
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
            
            elementoPainel.style.top = (elementoPainel.offsetTop - pos2) + "px";
            elementoPainel.style.left = (elementoPainel.offsetLeft - pos1) + "px";
        }

        function pararArrastar() {
            document.onmouseup = null;
            document.onmousemove = null;
            document.ontouchend = null;
            document.ontouchmove = null;
        }
    }
};
