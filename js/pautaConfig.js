import { collection, addDoc, updateDoc, doc, getDocs, query, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showNotification, escapeHTML } from './utils.js?v=20260313';
import { PautaService } from './pauta.js';

export const PautaConfigService = {
    app: null,
    customRoomsList: [],
    templates: [],

    init(appInstance) {
        this.app = appInstance;
        this.carregarTemplatesLocal();
        this._setupEventListeners();
    },

    _setupEventListeners() {
        // --- FLUXO DE CRIAÇÃO ---
        document.getElementById('create-pauta-btn')?.addEventListener('click', () => {
            this.iniciarFluxoCriacao();
            document.getElementById('pauta-type-modal').classList.remove('hidden');
        });

        document.getElementById('cancel-pauta-type-btn')?.addEventListener('click', () => {
            document.getElementById('pauta-type-modal').classList.add('hidden');
        });

        document.querySelectorAll('.pauta-type-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const type = e.currentTarget.dataset.type;
                document.getElementById('pauta-type-modal').classList.add('hidden');
                
                const createModal = document.getElementById('create-pauta-modal');
                createModal.dataset.pautaType = type;
                
                const roomConfig = document.getElementById('room-config-container');
                if (type === 'multisala') {
                    roomConfig.classList.remove('hidden');
                    this.customRoomsList = [];
                    this._renderCustomRooms();
                } else {
                    roomConfig.classList.add('hidden');
                }
                
                createModal.classList.remove('hidden');
            });
        });

        document.getElementById('add-custom-room-btn')?.addEventListener('click', (e) => {
            e.preventDefault();
            const input = document.getElementById('custom-room-input');
            const name = input.value.trim();
            if (name) {
                if (!this.customRoomsList.includes(name)) {
                    this.customRoomsList.push(name);
                    this._renderCustomRooms();
                    input.value = '';
                    input.focus();
                } else {
                    showNotification("Este local já foi adicionado.", "error");
                }
            }
        });

        document.getElementById('custom-rooms-list')?.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-room-btn')) {
                const index = e.target.dataset.index;
                this.customRoomsList.splice(index, 1);
                this._renderCustomRooms();
            }
        });

        // --- TEMPLATES ---
        document.getElementById('btn-salvar-template')?.addEventListener('click', () => this.salvarTemplateAtual());
        
        document.getElementById('select-template-pauta')?.addEventListener('change', (e) => {
            if(e.target.value) this.aplicarTemplate(e.target.value);
        });

        // --- FLUXO DE ETAPAS ---
        document.getElementById('cancel-create-pauta-btn')?.addEventListener('click', () => {
            document.getElementById('create-pauta-modal').classList.add('hidden');
        });

        document.getElementById('next-to-ordem-btn')?.addEventListener('click', () => {
            const pautaName = document.getElementById('create-pauta-name-input').value.trim();
            if (!pautaName) {
                showNotification("O nome da pauta não pode ser vazio.", "error");
                return;
            }
            document.getElementById('create-pauta-modal').classList.add('hidden');
            document.getElementById('ordem-atendimento-modal').classList.remove('hidden');
        });

        document.getElementById('cancel-ordem-btn')?.addEventListener('click', () => {
            document.getElementById('ordem-atendimento-modal').classList.add('hidden');
            document.getElementById('create-pauta-modal').classList.remove('hidden');
        });

        document.getElementById('next-to-delegation-btn')?.addEventListener('click', () => {
            document.getElementById('ordem-atendimento-modal').classList.add('hidden');
            document.getElementById('delegation-flow-modal').classList.remove('hidden');
        });

        document.getElementById('cancel-delegation-flow-btn')?.addEventListener('click', () => {
            document.getElementById('delegation-flow-modal').classList.add('hidden');
            document.getElementById('ordem-atendimento-modal').classList.remove('hidden');
        });

        // --- CONFIRMAÇÃO FINAL DE CRIAÇÃO ---
        document.getElementById('confirm-create-pauta-final-btn')?.addEventListener('click', async () => {
            const pautaName = document.getElementById('create-pauta-name-input').value.trim();
            const pautaType = document.getElementById('create-pauta-modal').dataset.pautaType;
            const orgaoId = document.getElementById('select-orgao-integracao').value; 
            const dataInput = document.getElementById('create-pauta-date-input');
            const user = this.app.auth.currentUser;
            
            if (!pautaName) {
                showNotification("O nome da pauta não pode ser vazio.", "error");
                return;
            }
        
            try {
                const novaPautaData = {
                    name: pautaName,
                    type: pautaType,
                    owner: user.uid,
                    members: [user.uid],
                    memberEmails: [user.email],
                    isClosed: false,
                    createdAt: new Date().toISOString(),
                    data: dataInput ? dataInput.value : new Date().toISOString().split('T')[0],
                    ordemAtendimento: document.querySelector('input[name="ordemAtendimento"]:checked')?.value || 'padrao',
                    useDelegationFlow: document.querySelector('input[name="useDelegationFlow"]:checked')?.value === 'true',
                    useDistributionFlow: document.getElementById('check-use-distribution')?.checked || false
                };

                if (pautaType === 'multisala') {
                    novaPautaData.customRooms = this.customRoomsList;
                    novaPautaData.rooms = this.customRoomsList; 
                }

                await addDoc(collection(this.app.db, "pautas"), novaPautaData);
        
                if (orgaoId) {
                    showNotification("Sincronizando com base de dados Solar/Verde...", "info");
                    const { ApiIntegration } = await import('./apiIntegration.js');
                    const assistidosOficiais = await ApiIntegration.buscarDadosPautaOficial(orgaoId);
                    
                    for (const ast of assistidosOficiais) {
                        await PautaService.addAssistedManual(this.app, {
                            ...ast,
                            status: 'pauta',
                            externalId: `INT-${orgaoId}-${Date.now()}-${Math.random()}` 
                        });
                    }
                    showNotification(`Integração concluída: ${assistidosOficiais.length} assistidos importados.`, 'success');
                } else {
                    showNotification("Pauta criada com sucesso!", 'success');
                }
        
                document.getElementById('create-pauta-name-input').value = '';
                document.getElementById('select-orgao-integracao').value = '';
                document.getElementById('delegation-flow-modal').classList.add('hidden');
                
                this.app.showPautaSelectionScreen();
                
            } catch (error) {
                console.error("Erro ao criar pauta:", error);
                showNotification("Erro ao criar pauta.", "error");
            }
        });

        // --- FLUXO DE EDIÇÃO ---
        document.getElementById('edit-pauta-name-btn')?.addEventListener('click', () => {
            document.getElementById('edit-pauta-name-input').value = this.app.currentPauta?.name || '';
            document.getElementById('edit-pauta-modal').classList.remove('hidden');
        });

        document.getElementById('edit-pauta-config-btn')?.addEventListener('click', () => {
            if (!this.app.currentPautaData) return;
            
            const typeRadios = document.querySelectorAll('input[name="edit-pauta-type"]');
            typeRadios.forEach(radio => {
                if (radio.value === this.app.currentPautaData.type) {
                    radio.checked = true;
                }
            });
            
            const ordemRadios = document.querySelectorAll('input[name="edit-ordem"]');
            ordemRadios.forEach(radio => {
                if (radio.value === this.app.currentPautaData.ordemAtendimento) {
                    radio.checked = true;
                }
            });
            
            const delegationRadios = document.querySelectorAll('input[name="edit-delegation"]');
            delegationRadios.forEach(radio => {
                const value = radio.value === 'true';
                if (value === this.app.currentPautaData.useDelegationFlow) {
                    radio.checked = true;
                }
            });
            
            const distCheck = document.getElementById('edit-use-distribution');
            if (distCheck) {
                distCheck.checked = this.app.currentPautaData.useDistributionFlow || false;
            }

            const dataInput = document.getElementById('edit-pauta-date-input');
            if (dataInput) {
                dataInput.value = this.app.currentPautaData.data || new Date().toISOString().split('T')[0];
            }
            
            document.getElementById('edit-pauta-config-modal').classList.remove('hidden');
        });

        document.getElementById('confirm-edit-pauta-config-btn')?.addEventListener('click', async () => {
            const newType = document.querySelector('input[name="edit-pauta-type"]:checked')?.value;
            const newOrdem = document.querySelector('input[name="edit-ordem"]:checked')?.value;
            const newDelegation = document.querySelector('input[name="edit-delegation"]:checked')?.value === 'true';
            const newDistribution = document.getElementById('edit-use-distribution')?.checked || false;
            const novaData = document.getElementById('edit-pauta-date-input')?.value;
            
            if (!newType || !newOrdem) {
                showNotification("Selecione todas as opções", "error");
                return;
            }
            
            try {
                const pautaRef = doc(this.app.db, "pautas", this.app.currentPauta.id);
                await updateDoc(pautaRef, {
                    type: newType,
                    ordemAtendimento: newOrdem,
                    useDelegationFlow: newDelegation,
                    useDistributionFlow: newDistribution,
                    data: novaData
                });
                
                this.app.currentPautaData.type = newType;
                this.app.currentPautaData.ordemAtendimento = newOrdem;
                this.app.currentPautaData.useDelegationFlow = newDelegation;
                this.app.currentPautaData.useDistributionFlow = newDistribution;
                this.app.currentPautaData.data = novaData;
                
                this.app.loadColumnPreferences();
                
                showNotification("Configurações atualizadas com sucesso!", "success");
                document.getElementById('edit-pauta-config-modal').classList.add('hidden');
                
            } catch (error) {
                console.error("Erro ao atualizar configurações:", error);
                showNotification("Erro ao atualizar configurações", "error");
            }
        });
    },

    iniciarFluxoCriacao() {
        const dataInput = document.getElementById('create-pauta-date-input');
        if(dataInput) dataInput.value = new Date().toISOString().split('T')[0];
    },

    _renderCustomRooms() {
        const list = document.getElementById('custom-rooms-list');
        const noRoomsMsg = document.getElementById('no-rooms-msg');
        if (!list || !noRoomsMsg) return;
        
        list.innerHTML = '';

        if (this.customRoomsList.length === 0) {
            noRoomsMsg.classList.remove('hidden');
        } else {
            noRoomsMsg.classList.add('hidden');
            this.customRoomsList.forEach((room, index) => {
                const li = document.createElement('li');
                li.className = "flex justify-between items-center bg-white border p-2 rounded";
                li.innerHTML = `<span>🏢 ${escapeHTML(room)}</span><button class="remove-room-btn text-red-500" data-index="${index}">Remover</button>`;
                list.appendChild(li);
            });
        }
    },

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
            salas: [...this.customRoomsList]
        };

        this.templates.push(novoTemplate);
        localStorage.setItem('sigep_pauta_templates', JSON.stringify(this.templates));
        this.atualizarSelectTemplates();
        
        const btnSalvar = document.getElementById('btn-salvar-template');
        if (btnSalvar) {
            const textoOriginal = btnSalvar.innerHTML;
            btnSalvar.innerHTML = '💾 Salvo!';
            setTimeout(() => btnSalvar.innerHTML = textoOriginal, 2000);
        }
    },

    aplicarTemplate(templateId) {
        const template = this.templates.find(t => t.id === templateId);
        if (template) {
            this.customRoomsList = [...template.salas];
            this._renderCustomRooms();
        }
    },

    async buscarPautasHoje() {
        const dataHoje = new Date().toISOString().split('T')[0];
        try {
            const q = query(
                collection(this.app.db, "pautas"),
                where("data", "==", dataHoje)
            );
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Erro ao buscar pautas", error);
            return [];
        }
    }
};