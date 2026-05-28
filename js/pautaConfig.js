// js/pautaConfig.js
import { collection, addDoc, updateDoc, doc, getDoc, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showNotification, playSound, escapeHTML } from './utils.js';
import { logAction } from './admin.js';
import { PautaService } from './pauta.js';

const TEMPLATES_KEY = 'sigep_pauta_templates';
const DEFAULTS = { ordemAtendimento: 'padrao', useDelegationFlow: false, useDistributionFlow: false, type: 'agendamento', tipo: 'normal' };

async function verificarNomeDuplicadoHoje(db, nome, userId) {
    const hoje = new Date().toISOString().split('T')[0];
    const snap = await getDocs(collection(db, "pautas"));
    return snap.docs.some(d => {
        const data = d.data();
        return (data.createdAt || '').startsWith(hoje) && 
               (data.name || '').toLowerCase().trim() === nome.toLowerCase().trim() && 
               (data.owner === userId || (data.members && data.members.includes(userId)));
    });
}

export const PautaConfigService = {
    init(app) {
        this._app = app;
    },

    _setupEventListeners() {
        const app = this._app;

        document.getElementById('create-pauta-btn')?.addEventListener('click', () => {
            this._abrirModalTipo();
        });

        document.getElementById('cancel-pauta-type-btn')?.addEventListener('click', () => {
            document.getElementById('pauta-type-modal').classList.add('hidden');
        });

        document.querySelectorAll('.pauta-type-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const type = e.currentTarget.dataset.type;
                document.getElementById('pauta-type-modal').classList.add('hidden');
                this._abrirModalCriacao(type);
            });
        });

        document.getElementById('add-custom-room-btn')?.addEventListener('click', (e) => {
            e.preventDefault();
            const input = document.getElementById('custom-room-input');
            const name = input.value.trim();
            if (!name) return;
            if (!app.customRoomsList.includes(name)) {
                app.customRoomsList.push(name);
                this._renderCustomRooms();
                input.value = '';
                input.focus();
            } else {
                showNotification("Este local já foi adicionado.", "error");
            }
        });

        document.getElementById('custom-rooms-list')?.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-room-btn')) {
                app.customRoomsList.splice(e.target.dataset.index, 1);
                this._renderCustomRooms();
            }
        });

        document.getElementById('cancel-create-pauta-btn')?.addEventListener('click', () => {
            document.getElementById('create-pauta-modal').classList.add('hidden');
        });

        document.getElementById('next-to-ordem-btn')?.addEventListener('click', () => {
            const unidade = document.getElementById('create-pauta-unidade-select')?.value;
            const dataOp = document.getElementById('create-pauta-date-input')?.value;
            const name = document.getElementById('create-pauta-name-input').value.trim();
            
            if (!unidade) { showNotification("Selecione a Unidade Vinculada.", "error"); return; }
            if (!name) { showNotification("O nome da pauta não pode ser vazio.", "error"); return; }
            if (!dataOp) { showNotification("A Data de Operação é obrigatória.", "error"); return; }
            
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

        document.getElementById('confirm-create-pauta-final-btn')?.addEventListener('click', async () => {
            await this.criarPauta();
        });

        document.getElementById('btn-salvar-template')?.addEventListener('click', () => {
            this._salvarComoTemplate();
        });

        document.getElementById('select-template-pauta')?.addEventListener('change', (e) => {
            if (e.target.value) this._carregarTemplate(e.target.value);
        });

        document.getElementById('edit-pauta-name-btn')?.addEventListener('click', () => {
            document.getElementById('edit-pauta-name-input').value = app.currentPauta?.name || '';
            document.getElementById('edit-pauta-modal').classList.remove('hidden');
        });

        document.getElementById('edit-pauta-config-btn')?.addEventListener('click', () => {
            if (!app.currentPautaData) return;
            this._preencherFormEdicao(app.currentPautaData);
            document.getElementById('edit-pauta-config-modal').classList.remove('hidden');
        });

        document.getElementById('confirm-edit-pauta-config-btn')?.addEventListener('click', async () => {
            await this.salvarEdicaoConfig();
        });
    },

    // ── MODAIS ─────────────────────────────────────────────────────────────────

    _abrirModalTipo() {
        document.getElementById('pauta-type-modal').classList.remove('hidden');
    },

    _abrirModalCriacao(type) {
        const app = this._app;
        
        let createModal = document.getElementById('create-pauta-modal');
        if (!createModal) {
            if (app && typeof app.abrirModalCriarPauta === 'function') {
                app.tipoPautaSelecionado = type; 
                app.abrirModalCriarPauta(); 
                createModal = document.getElementById('create-pauta-modal'); 
            }
        }

        if (!createModal) {
            console.error("Modal 'create-pauta-modal' não foi encontrado ou gerado.");
            return; 
        }

        createModal.dataset.pautaType = type;

        const roomConfig = document.getElementById('room-config-container');
        if (roomConfig) {
            if (type === 'multisala') {
                roomConfig.classList.remove('hidden');
                app.customRoomsList = [];
                this._renderCustomRooms();
            } else {
                roomConfig.classList.add('hidden');
            }
        }

        // 1. Injetar Unidade (Antes do nome)
        this._injetarSeletorUnidade();

        // 2. Injetar Campo de Data (Depois do nome)
        this._injetarCampoData();

        // 3. Injetar Modo Evento/Normal (Depois da data)
        this._adicionarSelectorModo();

        createModal.classList.remove('hidden');
    },

    _renderCustomRooms() {
        const app = this._app;
        const list = document.getElementById('custom-rooms-list');
        if (!list) return;

        if (!app.customRoomsList || app.customRoomsList.length === 0) {
            list.innerHTML = `<p class="text-xs text-gray-400 italic text-center py-2">Nenhum local adicionado.</p>`;
            return;
        }

        list.innerHTML = app.customRoomsList.map((room, i) => `
            <div class="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm shadow-sm">
                <span class="font-semibold text-slate-700">🏢 ${room}</span>
                <button class="remove-room-btn text-red-500 hover:text-red-700 text-xs font-bold" data-index="${i}">Remover</button>
            </div>
        `).join('');
    },

    async _injetarSeletorUnidade() {
        const app = this._app;
        let unidadeContainer = document.getElementById('pauta-unidade-container');
        
        if (!unidadeContainer) {
            const nameInput = document.getElementById('create-pauta-name-input');
            if (!nameInput) return;

            unidadeContainer = document.createElement('div');
            unidadeContainer.id = 'pauta-unidade-container';
            unidadeContainer.className = 'mb-4';
            unidadeContainer.innerHTML = `
                <label class="block text-sm font-medium text-gray-700 mb-1">🏢 Unidade Vinculada <span class="text-red-500">*</span></label>
                <select id="create-pauta-unidade-select" class="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm">
                    <option value="">Carregando unidades...</option>
                </select>
                <p class="text-[10px] text-gray-500 mt-1">Selecione o local onde esta pauta ocorrerá.</p>
            `;
            nameInput.parentNode.insertBefore(unidadeContainer, nameInput);
        }

        const select = document.getElementById('create-pauta-unidade-select');
        
        try {
            const authUser = app.auth.currentUser;
            if (!authUser) return;

            const userDoc = await getDoc(doc(app.db, "users", authUser.uid));
            const userData = userDoc.exists() ? userDoc.data() : null;

            const snap = await getDocs(collection(app.db, "estrutura_unidades"));
            const todasUnidades = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            let userUnits = [];
            
            if (userData?.role === 'superadmin') {
                userUnits = todasUnidades; 
            } else if (userData?.unidades && userData.unidades.length > 0) {
                const linkedIds = userData.unidades.map(u => u.unidadeId || u.id);
                userUnits = todasUnidades.filter(u => linkedIds.includes(u.id));
            }

            if (userUnits.length === 0) {
                select.innerHTML = '<option value="">Nenhuma unidade vinculada ao seu usuário</option>';
            } else {
                select.innerHTML = '<option value="">— Selecione a Unidade —</option>' +
                    userUnits.map(u => `<option value="${u.id}" data-nome="${escapeHTML(u.nome)}">${escapeHTML(u.nome)}</option>`).join('');
            }
        } catch (err) {
            console.error("Erro ao carregar unidades:", err);
            select.innerHTML = '<option value="">Erro ao carregar unidades</option>';
        }
    },

    // INJETA O CAMPO DE DATA SE ELE NÃO EXISTIR NO HTML ORIGINAL
    _injetarCampoData() {
        let dateInput = document.getElementById('create-pauta-date-input');
        
        if (!dateInput) {
            const nameInput = document.getElementById('create-pauta-name-input');
            if (nameInput) {
                const dateContainer = document.createElement('div');
                dateContainer.id = 'pauta-data-container';
                dateContainer.className = 'mb-4 mt-4';
                dateContainer.innerHTML = `
                    <label class="block text-sm font-medium text-gray-700 mb-1">📅 Data de Operação <span class="text-red-500">*</span></label>
                    <input type="date" id="create-pauta-date-input" class="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm">
                `;
                // Insere logo abaixo do nome da pauta
                nameInput.parentNode.insertBefore(dateContainer, nameInput.nextSibling);
                dateInput = document.getElementById('create-pauta-date-input');
            }
        }

        // Preenche com a data de hoje por padrão
        if (dateInput && !dateInput.value) {
            dateInput.value = new Date().toISOString().split('T')[0];
        }
    },

    _adicionarSelectorModo() {
        // Correção de segurança para evitar o erro de Optional Chaining (?.)
        const app = this._app;
        const modoAtual = (app && app.currentMode) ? app.currentMode : 'normal';
        
        let modoContainer = document.getElementById('pauta-modo-container');
        
        if (!modoContainer) {
            const dateInput = document.getElementById('create-pauta-date-input');
            const nameInput = document.getElementById('create-pauta-name-input');
            const pai = (dateInput && dateInput.parentNode) ? dateInput.parentNode : (nameInput ? nameInput.parentNode : null);
            
            if (!pai) return;
            
            modoContainer = document.createElement('div');
            modoContainer.id = 'pauta-modo-container';
            modoContainer.className = 'mb-4 sm:mb-6 mt-4';
            
            if (dateInput) {
                dateInput.insertAdjacentElement('afterend', modoContainer);
            } else {
                pai.appendChild(modoContainer);
            }
        }

        if (modoAtual === 'normal') {
            modoContainer.innerHTML = `<input type="hidden" name="pauta-modo" value="normal">`;
        } else {
            modoContainer.innerHTML = `
                <label class="block text-sm font-medium text-gray-700 mb-2">📋 Tipo de Evento</label>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <label class="flex items-center gap-2 p-2 border rounded-lg cursor-pointer hover:bg-gray-50 transition">
                        <input type="radio" name="pauta-modo" value="mutirao" class="w-4 h-4 text-green-600" checked>
                        <div>
                            <span class="text-sm font-bold">🤝 Mutirão</span>
                            <p class="text-[9px] text-gray-500">Evento concentrado</p>
                        </div>
                    </label>
                    <label class="flex items-center gap-2 p-2 border rounded-lg cursor-pointer hover:bg-gray-50 transition">
                        <input type="radio" name="pauta-modo" value="plantao" class="w-4 h-4 text-green-600">
                        <div>
                            <span class="text-sm font-bold">🚨 Plantão</span>
                            <p class="text-[9px] text-gray-500">Atendimento emergencial</p>
                        </div>
                    </label>
                    <label class="flex items-center gap-2 p-2 border rounded-lg cursor-pointer hover:bg-gray-50 transition">
                        <input type="radio" name="pauta-modo" value="acao_social" class="w-4 h-4 text-green-600">
                        <div>
                            <span class="text-sm font-bold">❤️ Ação Social</span>
                            <p class="text-[9px] text-gray-500">Atividade comunitária</p>
                        </div>
                    </label>
                </div>
                <p class="text-[10px] text-amber-600 mt-2">⚠️ Modos Mutirão, Plantão e Ação Social NÃO terão acesso à Recepção Central</p>
            `;
        }
    },

    _preencherFormEdicao(pautaData) {
        document.querySelectorAll('input[name="edit-pauta-type"]').forEach(r => {
            r.checked = r.value === pautaData.type;
        });
        document.querySelectorAll('input[name="edit-ordem"]').forEach(r => {
            r.checked = r.value === pautaData.ordemAtendimento;
        });
        document.querySelectorAll('input[name="edit-delegation"]').forEach(r => {
            r.checked = (r.value === 'true') === pautaData.useDelegationFlow;
        });
        const distCheck = document.getElementById('edit-use-distribution');
        if (distCheck) distCheck.checked = pautaData.useDistributionFlow || false;

        const dateInput = document.getElementById('edit-pauta-date-input');
        if (dateInput && pautaData.dataOperacao) {
            dateInput.value = pautaData.dataOperacao;
        }
    },

    // ── CRIAÇÃO ────────────────────────────────────────────────────────────────

    async criarPauta() {
        const app = this._app;
        const user = app.auth.currentUser;
    
        const pautaName = document.getElementById('create-pauta-name-input').value.trim();
        const pautaType = document.getElementById('create-pauta-modal').dataset.pautaType;
        const orgaoId   = document.getElementById('select-orgao-integracao')?.value || '';
        const dataOp    = document.getElementById('create-pauta-date-input')?.value;
        
        const unidadeSelect = document.getElementById('create-pauta-unidade-select');
        const unidadeId = unidadeSelect ? unidadeSelect.value : null;
        const unidadeNome = (unidadeSelect && unidadeId) ? unidadeSelect.options[unidadeSelect.selectedIndex].dataset.nome : null;

        const tipoSelecionado = document.querySelector('input[name="pauta-modo"]:checked')?.value 
                             || document.querySelector('input[name="pauta-modo"][type="hidden"]')?.value 
                             || 'normal';
    
        if (!unidadeId) {
            showNotification("Por favor, selecione uma Unidade Vinculada.", "error");
            return;
        }

        if (!pautaName) {
            showNotification("O nome da pauta não pode ser vazio.", "error");
            return;
        }

        if (!dataOp) {
            showNotification("A Data de Operação é obrigatória.", "error");
            return;
        }
    
        const duplicado = await verificarNomeDuplicadoHoje(app.db, pautaName, user.uid);
        if (duplicado) {
            const continuar = confirm(`Já existe uma pauta chamada "${pautaName}" criada hoje. Deseja criar mesmo assim?`);
            if (!continuar) return;
        }
    
        try {
            const novaPautaData = {
                name: pautaName,
                unidadeId: unidadeId,
                unidadeNome: unidadeNome,
                type: pautaType || DEFAULTS.type,
                tipo: tipoSelecionado, 
                owner: user.uid,
                members: [user.uid],
                memberEmails: [user.email],
                isClosed: false,
                createdAt: new Date().toISOString(),
                dataOperacao: dataOp,
                ordemAtendimento: document.querySelector('input[name="ordemAtendimento"]:checked')?.value || DEFAULTS.ordemAtendimento,
                useDelegationFlow: document.querySelector('input[name="useDelegationFlow"]:checked')?.value === 'true',
                useDistributionFlow: document.getElementById('check-use-distribution')?.checked || false,
            };
    
            if (pautaType === 'multisala') {
                novaPautaData.customRooms = app.customRoomsList;
                novaPautaData.rooms = app.customRoomsList;
            }
    
            const pautaRef = await addDoc(collection(app.db, "pautas"), novaPautaData);
    
            await logAction(
                app.db, app.auth,
                app.currentUserName,
                pautaRef.id,
                'CREATE_PAUTA',
                `Criou pauta "${pautaName}" (${pautaType}) em ${unidadeNome} para ${dataOp} - Tipo: ${tipoSelecionado}`
            );
    
            if (orgaoId) {
                showNotification("Sincronizando com base de dados Solar/Verde...", "info");
                const { ApiIntegration } = await import('./api_integration.js');
                const assistidosOficiais = await ApiIntegration.buscarDadosPautaOficial(orgaoId);
                for (const ast of assistidosOficiais) {
                    await PautaService.addAssistedManual(app, {
                        ...ast,
                        status: 'pauta',
                        externalId: `INT-${orgaoId}-${Date.now()}-${Math.random()}`
                    });
                }
                showNotification(`Integração concluída: ${assistidosOficiais.length} assistidos importados.`, 'success');
            } else {
                showNotification("Pauta criada com sucesso!", 'success');
                playSound('success');
            }
    
            this._limparFormCriacao();
            app.showPautaSelectionScreen();
    
        } catch (error) {
            console.error("Erro ao criar pauta:", error);
            showNotification("Erro ao criar pauta: " + error.message, "error");
        }
    },

    _limparFormCriacao() {
        document.getElementById('create-pauta-name-input').value = '';
        const orgaoInput = document.getElementById('select-orgao-integracao');
        if (orgaoInput) orgaoInput.value = '';
        document.getElementById('delegation-flow-modal').classList.add('hidden');
        document.getElementById('create-pauta-modal').classList.add('hidden');
        document.getElementById('ordem-atendimento-modal').classList.add('hidden');
    },

    // ── EDIÇÃO ─────────────────────────────────────────────────────────────────

    async salvarEdicaoConfig() {
        const app = this._app;

        const newType       = document.querySelector('input[name="edit-pauta-type"]:checked')?.value;
        const newOrdem      = document.querySelector('input[name="edit-ordem"]:checked')?.value;
        const newDelegation = document.querySelector('input[name="edit-delegation"]:checked')?.value === 'true';
        const newDist       = document.getElementById('edit-use-distribution')?.checked || false;
        const newDate       = document.getElementById('edit-pauta-date-input')?.value || '';

        if (!newType || !newOrdem) {
            showNotification("Selecione todas as opções.", "error");
            return;
        }

        try {
            const updates = {
                type: newType,
                ordemAtendimento: newOrdem,
                useDelegationFlow: newDelegation,
                useDistributionFlow: newDist,
            };
            if (newDate) updates.dataOperacao = newDate;

            await updateDoc(doc(app.db, "pautas", app.currentPauta.id), updates);

            Object.assign(app.currentPautaData, updates);

            if (typeof app.loadColumnPreferences === 'function') app.loadColumnPreferences();

            await logAction(
                app.db, app.auth,
                app.currentUserName,
                app.currentPauta.id,
                'EDIT_PAUTA_CONFIG',
                `Editou configurações: tipo=${newType}, ordem=${newOrdem}, delegação=${newDelegation}, distribuição=${newDist}`
            );

            showNotification("Configurações atualizadas com sucesso!", "success");
            document.getElementById('edit-pauta-config-modal').classList.add('hidden');

        } catch (error) {
            console.error("Erro ao salvar configurações:", error);
            showNotification("Erro ao salvar configurações.", "error");
        }
    },

    // ── TEMPLATES ──────────────────────────────────────────────────────────────

    _salvarComoTemplate() {
        const nome = prompt("Nome do template:");
        if (!nome || !nome.trim()) return;

        const tipoSelecionado = document.querySelector('input[name="pauta-modo"]:checked')?.value 
                             || document.querySelector('input[name="pauta-modo"][type="hidden"]')?.value 
                             || DEFAULTS.tipo;

        const template = {
            id: Date.now().toString(),
            nome: nome.trim(),
            tipo: tipoSelecionado, 
            type: document.getElementById('create-pauta-modal')?.dataset.pautaType || DEFAULTS.type,
            ordemAtendimento: document.querySelector('input[name="ordemAtendimento"]:checked')?.value || DEFAULTS.ordemAtendimento,
            useDelegationFlow: document.querySelector('input[name="useDelegationFlow"]:checked')?.value === 'true',
            useDistributionFlow: document.getElementById('check-use-distribution')?.checked || false,
        };

        const templates = lerTemplates();
        templates.push(template);
        salvarTemplates(templates);
        this._renderTemplatesSelect();
        showNotification(`Template "${nome}" salvo!`, "success");
    },

    _carregarTemplate(id) {
        const templates = lerTemplates();
        const t = templates.find(t => t.id === id);
        if (!t) return;

        const createModal = document.getElementById('create-pauta-modal');
        if (createModal) createModal.dataset.pautaType = t.type;

        const modoRadios = document.querySelectorAll('input[name="pauta-modo"]');
        modoRadios.forEach(radio => {
            if (radio.type === 'radio') {
                radio.checked = radio.value === t.tipo;
            } else if (radio.type === 'hidden') {
                radio.value = t.tipo;
            }
        });

        document.querySelectorAll('input[name="ordemAtendimento"]').forEach(r => {
            r.checked = r.value === t.ordemAtendimento;
        });

        document.querySelectorAll('input[name="useDelegationFlow"]').forEach(r => {
            r.checked = (r.value === 'true') === t.useDelegationFlow;
        });

        const distCheck = document.getElementById('check-use-distribution');
        if (distCheck) distCheck.checked = t.useDistributionFlow;

        showNotification(`Template "${t.nome}" carregado!`, "info");
    },

    _renderTemplatesSelect() {
        const select = document.getElementById('select-template-pauta');
        if (!select) return;

        const templates = lerTemplates();
        select.innerHTML = `<option value="">— Carregar Template —</option>`;
        templates.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = `${t.nome} (${t.tipo === 'normal' ? '🏛️' : t.tipo === 'mutirao' ? '🤝' : t.tipo === 'plantao' ? '🚨' : '❤️'} ${t.tipo || 'normal'})`;
            select.appendChild(opt);
        });
    },

    // ── CRIAÇÃO EM LOTE ────────────────────────────────────────────────────────

    async criarPautasEmLote(lista) {
        const app = this._app;
        const user = app.auth.currentUser;

        if (!lista || lista.length === 0) {
            showNotification("Nenhuma pauta para criar.", "error");
            return;
        }

        let criadas = 0;
        for (const item of lista) {
            try {
                const novaPauta = {
                    name: item.name,
                    type: item.type || DEFAULTS.type,
                    tipo: item.tipo || DEFAULTS.tipo, 
                    owner: user.uid,
                    members: [user.uid],
                    memberEmails: [user.email],
                    isClosed: false,
                    createdAt: new Date().toISOString(),
                    dataOperacao: item.dataOperacao || new Date().toISOString().split('T')[0],
                    ordemAtendimento: item.ordemAtendimento || DEFAULTS.ordemAtendimento,
                    useDelegationFlow: item.useDelegationFlow || false,
                    useDistributionFlow: item.useDistributionFlow || false,
                };

                const ref = await addDoc(collection(app.db, "pautas"), novaPauta);
                await logAction(
                    app.db, app.auth,
                    app.currentUserName,
                    ref.id,
                    'CREATE_PAUTA_LOTE',
                    `Criou pauta em lote: "${item.name}" para ${novaPauta.dataOperacao} - Tipo: ${novaPauta.tipo}`
                );
                criadas++;
            } catch (err) {
                console.error(`Erro ao criar pauta "${item.name}":`, err);
            }
        }

        showNotification(`${criadas} de ${lista.length} pautas criadas com sucesso!`, criadas === lista.length ? 'success' : 'warning');
        playSound('success');
        app.showPautaSelectionScreen();
    },

    // ── BUSCAR PAUTAS DO DIA ───────────────────────────────────────────────────

    async buscarPautasHoje(db, userId, userEmail, role) {
        const hoje = new Date().toISOString().split('T')[0];

        try {
            const snap = await getDocs(collection(db, "pautas"));
            return snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(p => {
                    if (!p.tipo) p.tipo = DEFAULTS.tipo;
                    
                    const dataOp = p.dataOperacao || (p.createdAt || '').split('T')[0];
                    const ehHoje = dataOp === hoje;
                    const isAdmin = role === 'admin' || role === 'superadmin';
                    const isMember = p.owner === userId
                        || (p.members && p.members.includes(userId))
                        || (p.memberEmails && p.memberEmails.includes(userEmail));
                    return ehHoje && (isAdmin || isMember);
                });
        } catch (err) {
            console.error("Erro ao buscar pautas de hoje:", err);
            return [];
        }
    },

    async buscarPautasDoColaboradorHoje(db, colaboradorNome) {
        const hoje = new Date().toISOString().split('T')[0];

        try {
            const pautasSnap = await getDocs(collection(db, "pautas"));
            const pautasHoje = pautasSnap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(p => {
                    if (!p.tipo) p.tipo = DEFAULTS.tipo;
                    const dataOp = p.dataOperacao || (p.createdAt || '').split('T')[0];
                    return dataOp === hoje && !p.isClosed;
                });

            const resultado = [];
            for (const pauta of pautasHoje) {
                try {
                    const colabsSnap = await getDocs(
                        collection(db, "pautas", pauta.id, "collaborators")
                    );
                    const estaNessa = colabsSnap.docs.some(
                        c => c.data().nome === colaboradorNome
                    );
                    if (estaNessa) resultado.push(pauta);
                } catch {
                    // pauta sem subcoleção de colaboradores — ignora
                }
            }

            return resultado;
        } catch (err) {
            console.error("Erro ao buscar pautas do colaborador:", err);
            return [];
        }
    }
};

export default PautaConfigService;
