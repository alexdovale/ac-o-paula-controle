export const PautaConfigService = {
    app: null,
    customRooms: [],
    templates: [],
    
    // Estado temporário durante a criação da pauta
    draftPauta: {
        tipo: '',
        salas: [],
        ordenacao: '',
        delegacao: '',
        nome: '',
        data: ''
    },

    init(appInstance) {
        this.app = appInstance;
        this.carregarTemplatesLocal();
        this._setupEventListeners();
    },

    _setupEventListeners() {
        // --- FLUXO DE CRIAÇÃO ---
        
        // 1. Abrir Modal de Criação
        document.getElementById('create-pauta-btn')?.addEventListener('click', () => {
            this.iniciarFluxoCriacao();
        });

        // 2. Seleção de Tipo
        document.querySelectorAll('.pauta-type-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.pauta-type-btn').forEach(b => b.classList.remove('ring-4', 'ring-green-500'));
                e.currentTarget.classList.add('ring-4', 'ring-green-500');
                this.draftPauta.tipo = e.currentTarget.dataset.type;
                
                // Avança para tela de salas/config após selecionar o tipo
                document.getElementById('pauta-type-step').classList.add('hidden');
                document.getElementById('pauta-rooms-step').classList.remove('hidden');
            });
        });

        document.getElementById('cancel-pauta-type-btn')?.addEventListener('click', () => this.fecharModais());

        // 3. Salas Customizadas e Templates
        document.getElementById('add-custom-room-btn')?.addEventListener('click', () => {
            const input = document.getElementById('custom-room-input');
            const roomName = input.value.trim();
            if (roomName) {
                this.customRooms.push(roomName);
                input.value = '';
                this._renderCustomRooms();
            }
        });

        document.getElementById('custom-rooms-list')?.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
                const index = e.target.closest('button').dataset.index;
                this.customRooms.splice(index, 1);
                this._renderCustomRooms();
            }
        });

        document.getElementById('btn-salvar-template')?.addEventListener('click', () => this.salvarTemplateAtual());
        
        document.getElementById('select-template-pauta')?.addEventListener('change', (e) => {
            if(e.target.value) this.aplicarTemplate(e.target.value);
        });

        document.getElementById('cancel-create-pauta-btn')?.addEventListener('click', () => this.fecharModais());
        
        document.getElementById('next-to-ordem-btn')?.addEventListener('click', () => {
            this.draftPauta.salas = this.customRooms;
            document.getElementById('pauta-rooms-step').classList.add('hidden');
            document.getElementById('pauta-ordem-step').classList.remove('hidden');
        });

        // 4. Ordenação
        document.getElementById('cancel-ordem-btn')?.addEventListener('click', () => this.fecharModais());
        
        document.getElementById('next-to-delegation-btn')?.addEventListener('click', () => {
            const ordemSelect = document.getElementById('ordem-select');
            this.draftPauta.ordenacao = ordemSelect ? ordemSelect.value : 'chegada';
            document.getElementById('pauta-ordem-step').classList.add('hidden');
            document.getElementById('pauta-delegation-step').classList.remove('hidden');
        });

        // 5. Delegação e Finalização
        document.getElementById('cancel-delegation-flow-btn')?.addEventListener('click', () => this.fecharModais());
        
        document.getElementById('confirm-create-pauta-final-btn')?.addEventListener('click', async () => {
            const delegacaoSelect = document.getElementById('delegation-select');
            const nomeInput = document.getElementById('pauta-nome-input');
            const dataInput = document.getElementById('create-pauta-date-input'); // Novo campo do HTML
            
            this.draftPauta.delegacao = delegacaoSelect ? delegacaoSelect.value : 'aberta';
            this.draftPauta.nome = nomeInput ? nomeInput.value.trim() : `Pauta ${new Date().toLocaleDateString()}`;
            this.draftPauta.data = dataInput ? dataInput.value : new Date().toISOString().split('T')[0];

            await this.salvarNovaPauta();
        });

        // --- FLUXO DE EDIÇÃO ---
        document.getElementById('edit-pauta-name-btn')?.addEventListener('click', () => {
            // Lógica para abrir modal de edição rápida de nome
            const pautaAtual = this.app.currentPauta;
            if(!pautaAtual) return;
            const novoNome = prompt("Digite o novo nome da pauta:", pautaAtual.nome);
            if(novoNome) this.atualizarPropriedadePauta(pautaAtual.id, 'nome', novoNome);
        });

        document.getElementById('edit-pauta-config-btn')?.addEventListener('click', () => {
            this.abrirModalEdicaoConfig();
        });

        document.getElementById('confirm-edit-pauta-config-btn')?.addEventListener('click', async () => {
            await this.salvarEdicaoConfig();
        });
    },

    iniciarFluxoCriacao() {
        this.draftPauta = { tipo: '', salas: [], ordenacao: '', delegacao: '', nome: '', data: new Date().toISOString().split('T')[0] };
        this.customRooms = [];
        this._renderCustomRooms();
        
        const dataInput = document.getElementById('create-pauta-date-input');
        if(dataInput) dataInput.value = this.draftPauta.data;

        // Reseta as views para o primeiro passo
        document.querySelectorAll('.pauta-step').forEach(el => el.classList.add('hidden'));
        document.getElementById('pauta-type-step').classList.remove('hidden');
        document.getElementById('create-pauta-modal').classList.remove('hidden');
    },

    _renderCustomRooms() {
        const list = document.getElementById('custom-rooms-list');
        if (!list) return;
        
        list.innerHTML = this.customRooms.map((room, index) => `
            <div class="flex items-center justify-between bg-gray-50 px-3 py-2 border rounded">
                <span class="text-sm text-gray-700">${room}</span>
                <button type="button" data-index="${index}" class="text-red-500 hover:text-red-700">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
        `).join('');
    },

    // Lógica de Templates
    carregarTemplatesLocal() {
        try {
            const salvos = localStorage.getItem('sigep_pauta_templates');
            if (salvos) {
                this.templates = JSON.parse(salvos);
                this.atualizarSelectTemplates();
            }
        } catch (e) {
            console.error('Erro ao carregar templates', e);
        }
    },

    atualizarSelectTemplates() {
        const select = document.getElementById('select-template-pauta');
        if (!select) return;
        
        select.innerHTML = '<option value="">— Carregar Template —</option>' + 
            this.templates.map(t => `<option value="${t.id}">${t.nome}</option>`).join('');
    },

    salvarTemplateAtual() {
        const nomeTemplate = prompt("Dê um nome para este template (ex: Plantão Cível):");
        if (!nomeTemplate) return;

        const novoTemplate = {
            id: Date.now().toString(),
            nome: nomeTemplate,
            salas: [...this.customRooms]
        };

        this.templates.push(novoTemplate);
        localStorage.setItem('sigep_pauta_templates', JSON.stringify(this.templates));
        this.atualizarSelectTemplates();
        
        const btnSalvar = document.getElementById('btn-salvar-template');
        const textoOriginal = btnSalvar.innerHTML;
        btnSalvar.innerHTML = '💾 Salvo!';
        setTimeout(() => btnSalvar.innerHTML = textoOriginal, 2000);
    },

    aplicarTemplate(templateId) {
        const template = this.templates.find(t => t.id === templateId);
        if (template) {
            this.customRooms = [...template.salas];
            this._renderCustomRooms();
        }
    },

    async salvarNovaPauta() {
        try {
            // Chamada ao main app ou banco de dados
            const novaPauta = await this.app.db.collection('pautas').add({
                ...this.draftPauta,
                criadoEm: new Date(),
                status: 'ativa',
                criadoPor: this.app.currentUser?.uid || 'sistema'
            });
            
            this.fecharModais();
            await this.buscarPautasHoje(); // Atualiza a lista
            this.app.uiService.showToast('Pauta criada com sucesso!', 'success');
        } catch (error) {
            console.error("Erro ao criar pauta", error);
            this.app.uiService.showToast('Erro ao criar pauta.', 'error');
        }
    },

    abrirModalEdicaoConfig() {
        const pautaAtual = this.app.currentPauta;
        if(!pautaAtual) return;

        const dataInput = document.getElementById('edit-pauta-date-input');
        if(dataInput) dataInput.value = pautaAtual.data || new Date().toISOString().split('T')[0];

        document.getElementById('edit-pauta-config-modal').classList.remove('hidden');
    },

    async salvarEdicaoConfig() {
        const pautaAtual = this.app.currentPauta;
        if(!pautaAtual) return;

        const dataInput = document.getElementById('edit-pauta-date-input');
        const novaData = dataInput ? dataInput.value : pautaAtual.data;

        await this.atualizarPropriedadePauta(pautaAtual.id, 'data', novaData);
        document.getElementById('edit-pauta-config-modal').classList.add('hidden');
    },

    async atualizarPropriedadePauta(pautaId, campo, valor) {
        try {
            await this.app.db.collection('pautas').doc(pautaId).update({ [campo]: valor });
            this.app.currentPauta[campo] = valor;
            this.app.uiService.showToast('Configuração atualizada!', 'success');
            // Re-renderizar o que for necessário na UI
            if(this.app.renderPautaDetails) this.app.renderPautaDetails();
        } catch (error) {
            console.error("Erro ao atualizar", error);
        }
    },

    async buscarPautasHoje() {
        // Exemplo genérico de busca por data, ajustável para seu esquema do Firestore/Supabase
        const dataHoje = new Date().toISOString().split('T')[0];
        try {
            const snapshot = await this.app.db.collection('pautas')
                .where('data', '==', dataHoje)
                .where('status', '==', 'ativa')
                .get();
                
            const pautas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            this.app.renderPautasSelection(pautas); // Chama método do main.js para renderizar os cards
        } catch (error) {
            console.error("Erro ao buscar pautas", error);
        }
    },

    fecharModais() {
        document.getElementById('create-pauta-modal')?.classList.add('hidden');
        document.getElementById('edit-pauta-config-modal')?.classList.add('hidden');
    }
};