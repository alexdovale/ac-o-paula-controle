import { showNotification } from './utils.js?v=20260313';

export const RecepcaoCentralService = {
    app: null,
    pautasAtivas: [],

    async abrir(appInstance) {
        this.app = appInstance;
        
        // Esconde as outras telas e exibe a recepção central
        const uiElements = ['login-container', 'pauta-selection-container', 'app-container', 'dashboard-container'];
        uiElements.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });
        
        const recepcaoContainer = document.getElementById('recepcao-central-container');
        if (recepcaoContainer) recepcaoContainer.classList.remove('hidden');

        await this.carregarDados();
    },

    async carregarDados() {
        const container = document.getElementById('recepcao-central-container');
        if (!container) return;

        container.innerHTML = `<div class="flex justify-center mt-10"><div class="animate-spin h-8 w-8 border-4 border-amber-600 border-t-transparent rounded-full"></div></div>`;

        try {
            // Reutiliza a busca de pautas do PautaConfigService
            const { PautaConfigService } = await import('./pautaConfig.js');
            this.pautasAtivas = await PautaConfigService.buscarPautasHoje();
            
            // Filtra pautas que estão fechadas
            this.pautasAtivas = this.pautasAtivas.filter(p => !p.isClosed);
            this.renderizarGrade();
        } catch (error) {
            console.error("Erro ao carregar dados da recepção", error);
            container.innerHTML = `<p class="text-red-500 text-center mt-10">Erro ao carregar os dados da recepção.</p>`;
        }
    },

    renderizarGrade() {
        const container = document.getElementById('recepcao-central-container');
        
        let html = `
            <div class="flex items-center justify-between mb-6">
                <h1 class="text-2xl font-bold text-gray-800">🏛️ Recepção Central</h1>
                <button id="btn-voltar-selecao" class="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-bold hover:bg-gray-300 transition shadow">
                    ⬅ Voltar
                </button>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        `;

        if (this.pautasAtivas.length === 0) {
            html += `<div class="col-span-full text-center text-gray-500 py-8 bg-white rounded-lg shadow border border-gray-100">Nenhuma pauta ativa registrada para hoje.</div>`;
        } else {
            this.pautasAtivas.forEach(pauta => {
                const locaisStr = pauta.rooms ? pauta.rooms.join(', ') : 'Padrão';
                const localBase = pauta.rooms ? pauta.rooms[0] : 'Recepção';

                html += `
                    <div class="bg-white rounded-xl shadow border border-gray-200 p-5 flex flex-col hover:border-amber-400 transition">
                        <div class="flex justify-between items-start mb-4">
                            <h2 class="text-lg font-bold text-gray-800 truncate pr-2" title="${pauta.name}">${pauta.name}</h2>
                            <span class="bg-blue-100 text-blue-800 text-[10px] font-black px-2 py-1 rounded uppercase tracking-wide">${pauta.type}</span>
                        </div>
                        <p class="text-xs text-gray-500 mb-6 flex-grow bg-gray-50 p-2 rounded border border-gray-100">Locais: ${locaisStr}</p>
                        
                        <div class="flex gap-2 mt-auto">
                            <button class="btn-chamar-proximo flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold py-2.5 px-3 rounded-lg text-sm transition shadow-md" 
                                data-pauta-id="${pauta.id}" 
                                data-pauta-salas="${localBase}">
                                📣 Chamar Próximo
                            </button>
                        </div>
                    </div>
                `;
            });
        }

        html += `</div>`;
        container.innerHTML = html;

        // Listener para voltar à seleção de pautas
        document.getElementById('btn-voltar-selecao')?.addEventListener('click', () => {
            document.getElementById('recepcao-central-container').classList.add('hidden');
            this.app.showPautaSelectionScreen();
        });

        // Listeners dos botões de chamada
        document.querySelectorAll('.btn-chamar-proximo').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const pautaId = e.currentTarget.dataset.pautaId;
                const salaPadrao = e.currentTarget.dataset.pautaSalas;
                await this.fluxoChamarProximo(pautaId, salaPadrao);
            });
        });
    },

    async fluxoChamarProximo(pautaId, localSugerido) {
        const nomeAssistido = prompt("Nome do assistido a ser chamado:") || "Assistido Não Identificado";
        const localAtendimento = prompt("Local de atendimento:", localSugerido) || localSugerido;

        const horaAtual = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        
        const chamado = {
            nome: nomeAssistido,
            local: localAtendimento,
            hora: horaAtual,
            pautaId: pautaId
        };

        // Salva globalmente para as TVs/celulares lerem via localStorage
        localStorage.setItem('sigep_ultimo_chamado_global', JSON.stringify(chamado));
        
        // Mantém um histórico das chamadas recentes por pauta
        const chaveHistorico = `sigep_chamados_${pautaId}`;
        let historico = [];
        try {
            historico = JSON.parse(localStorage.getItem(chaveHistorico)) || [];
        } catch(e) {}
        
        historico.unshift(chamado);
        if(historico.length > 10) historico.pop(); // Limita o histórico a 10 chamadas
        localStorage.setItem(chaveHistorico, JSON.stringify(historico));

        // Dispara o evento de atualização local para sincronia imediata
        window.dispatchEvent(new Event('sigep:chamado'));

        if (this.app) {
            showNotification(`Chamado: ${nomeAssistido} para ${localAtendimento}`, 'success');
        }
    }
};