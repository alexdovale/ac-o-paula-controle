// js/colaboradores.js - VERSÃO MOBILE + FILTRO ATA (Defensores, Servidores, Coordenadores, CRC) - COM LOGS DE DEBUG
import { 
    collection, 
    onSnapshot, 
    addDoc, 
    doc, 
    updateDoc, 
    deleteDoc, 
    getDocs, 
    writeBatch,
    getDoc,
    query,
    where,
    setDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { escapeHTML, showNotification } from './utils.js';

const CollaboratorService = {
    currentListener: null,
    editId: null,
    ordemAtual: 'grupo', // Pode ser 'grupo' ou 'nome'
    gruposPermitidosAta: ['1', '2', '3', '4', 'CRC', 'Coordenadores'],

    // ========================================================
    // 1. AUTO-PREENCHIMENTO (BUSCA NA BASE MASTER)
    // ========================================================
    async buscarColaboradorMaster(app, identificador) {
        if (!identificador || identificador.length < 3) return;

        try {
            const masterRef = doc(app.db, "colaboradores_gerais", identificador);
            const snap = await getDoc(masterRef);

            if (snap.exists()) {
                const dados = snap.data();
                
                const nameInput = document.getElementById('collaborator-name-modal');
                if (nameInput) nameInput.value = dados.nome || '';
                
                const roleSelect = document.getElementById('collaborator-role-modal');
                if (roleSelect) roleSelect.value = dados.cargo || 'Defensor(a)';
                
                const teamSelect = document.getElementById('collaborator-team-modal');
                if (teamSelect) teamSelect.value = dados.equipe || '1';
                
                const phoneInput = document.getElementById('collaborator-phone-modal');
                if (phoneInput) phoneInput.value = dados.telefone || '';
                
                const emailInput = document.getElementById('collaborator-email-modal');
                if (emailInput) emailInput.value = dados.email || '';
                
                const rTransp = document.querySelector(`input[name="transporte-colaborador"][value="${dados.transporte || 'Meios Próprios'}"]`);
                if (rTransp) rTransp.checked = true;

                this.configurarLogicaCargo(); // Reconfigura o label "Matrícula/ID"
                showNotification("Dados recuperados da base master! ✅");
            } else {
                showNotification("Nenhum colaborador encontrado na base master com este identificador.", "info");
            }
        } catch (e) {
            console.error("Erro ao buscar na base master:", e);
            showNotification("Erro ao buscar na base master.", "error");
        }
    },

    // ========================================================
    // 2. ORDENAÇÃO DA LISTA
    // A lógica de ordenação por 'grupo' já coloca "Defensor(a)" primeiro
    // ========================================================
    ordenarColaboradores(colaboradores) {
        if (this.ordemAtual === 'nome') {
            return [...colaboradores].sort((a, b) => {
                return (a.nome || '').localeCompare(b.nome || '');
            });
        } else { // this.ordemAtual === 'grupo'
            return [...colaboradores].sort((a, b) => {
                const grupoA = a.equipe || '';
                const grupoB = b.equipe || '';
                if (grupoA !== grupoB) {
                    return grupoA.localeCompare(grupoB); // 1. Ordena por equipe
                }
                
                // 2. Dentro da mesma equipe, coloca Defensor(a) primeiro
                const isDefensorA = (a.cargo === 'Defensor(a)') ? 0 : 1; // 0 para Defensor(a), 1 para outros
                const isDefensorB = (b.cargo === 'Defensor(a)') ? 0 : 1;
                if (isDefensorA !== isDefensorB) {
                    return isDefensorA - isDefensorB; 
                }
                
                // 3. Dentro da mesma equipe e mesmo tipo de cargo (defensor/não-defensor), ordena por nome
                return (a.nome || '').localeCompare(b.nome || ''); 
            });
        }
    },

    // ========================================================
    // 2.1 FILTRO PARA ATA (Apenas grupos permitidos)
    // ========================================================
    filtrarParaAta(colaboradores) {
        return colaboradores.filter(colab => {
            const equipe = colab.equipe || '';
            return this.gruposPermitidosAta.includes(equipe);
        });
    },

    toggleOrdem() {
        this.ordemAtual = this.ordemAtual === 'grupo' ? 'nome' : 'grupo';
        const btn = document.getElementById('toggle-order-btn');
        if (btn) {
            btn.textContent = this.ordemAtual === 'grupo' ? '📁 Ordenar por Grupo' : '🔤 Ordenar por Nome';
        }
        if (window.app && window.app.colaboradores) {
            this.renderTable(window.app);
        }
    },

    // ========================================================
    // 3. FLUXO DE REVISÃO - CARREGAR DEFENSORES
    // ========================================================
    async loadDefensores(app, selectId) {
        const select = document.getElementById(selectId);
        if (!select) return;

        try {
            if (!app || !app.currentPauta || !app.currentPauta.id) {
                console.error("App ou pauta não definidos para carregar defensores.");
                return;
            }
            const ref = collection(app.db, "pautas", app.currentPauta.id, "collaborators");
            const q = query(ref, where("cargo", "==", "Defensor(a)"));
            const snap = await getDocs(q);
            
            select.innerHTML = '<option value="">Selecione o Defensor...</option>';
            const defensores = [];
            snap.forEach(doc => {
                defensores.push({ id: doc.id, ...doc.data() });
            });
            
            defensores.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
            
            defensores.forEach(c => {
                select.innerHTML += `<option value="${escapeHTML(c.nome)}">${escapeHTML(c.nome)}</option>`;
            });
        } catch (e) {
            console.error("Erro ao carregar defensores:", e);
        }
    },

    // ========================================================
    // 4. CONFIGURAÇÃO DO MODAL E EVENTOS (VERSÃO MOBILE)
    // ========================================================
    openModal(app) {
        console.log("📋 Abrindo modal de colaboradores");
        
        const modal = document.getElementById('collaborators-modal');
        if (!modal) {
            showNotification("Erro: Modal não encontrado", "error");
            return;
        }

        modal.classList.remove('hidden');
        this.resetForm();
        this.updateTeamSelect();
        this.configurarLogicaCargo();
        
        // ⭐ CHAMADA PRINCIPAL PARA CONFIGURAR OS EVENTOS DE BUSCA ⭐
        this.configurarEventoBusca(app); 
        
        this.adicionarBotaoOrdenacao();
        
        if (app && app.currentPauta && app.currentPauta.id) {
            this.setupListener(app, app.currentPauta.id);
        }
        
        setTimeout(() => {
            modal.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    },

    adicionarBotaoOrdenacao() {
        const container = document.querySelector('#collaborators-list-table-modal');
        if (!container) return;
        
        if (document.getElementById('toggle-order-btn')) return;
        
        const header = container.querySelector('.flex.justify-between') || container;
        const btn = document.createElement('button');
        btn.id = 'toggle-order-btn';
        btn.className = 'w-full md:w-auto bg-gray-200 hover:bg-gray-300 text-gray-800 px-3 py-2 rounded text-sm mb-2';
        btn.textContent = this.ordemAtual === 'grupo' ? '📁 Ordenar por Grupo' : '🔤 Ordenar por Nome';
        btn.onclick = () => this.toggleOrdem();
        
        header.appendChild(btn);
    },

    closeModal() {
        const modal = document.getElementById('collaborators-modal');
        if (modal) modal.classList.add('hidden');
    },

    // ⭐ FUNÇÃO CONFIGURAR EVENTO DE BUSCA COM LOGS DE DEBUG ⭐
    configurarEventoBusca(app) {
        const inputIdentificador = document.getElementById('collaborator-identificador-modal');
        const buscarBtn = document.getElementById('buscar-master-btn');
    
        console.log("--- DEBUG: configurarEventoBusca ---");
        console.log("Elemento 'collaborator-identificador-modal' encontrado?", !!inputIdentificador, inputIdentificador);
        console.log("Elemento 'buscar-master-btn' encontrado?", !!buscarBtn, buscarBtn);

        if (inputIdentificador) {
            inputIdentificador.onblur = () => {
                console.log("Evento 'onblur' do campo identificador acionado.");
                if (!this.editId && inputIdentificador.value) {
                    this.buscarColaboradorMaster(app, inputIdentificador.value);
                }
            };
        }
    
        if (buscarBtn && inputIdentificador) { // Certifica-se de que ambos existem
            buscarBtn.onclick = () => {
                console.log("Botão 'Buscar no Banco' clicado."); // ⭐ Log quando o botão é clicado
                if (!this.editId && inputIdentificador.value) {
                    this.buscarColaboradorMaster(app, inputIdentificador.value);
                } else if (!inputIdentificador.value) {
                    showNotification("Por favor, digite o identificador para buscar.", "warning");
                }
            };
            console.log("Evento 'onclick' adicionado ao botão 'Buscar no Banco'.");
        } else {
            console.warn("AVISO: Não foi possível configurar eventos de busca. Verifique se os IDs dos elementos HTML estão corretos e se o HTML foi carregado antes do script.");
        }
        console.log("--- FIM DEBUG: configurarEventoBusca ---");
    },

    configurarLogicaCargo() {
        const cargoSelect = document.getElementById('collaborator-role-modal');
        const labelIdentificador = document.getElementById('label-identificador-modal');
        
        if (!cargoSelect || !labelIdentificador) return;

        const atualizarLabel = () => {
            labelIdentificador.textContent = (cargoSelect.value === "Defensor(a)") ? "Matrícula" : "ID";
        };

        cargoSelect.onchange = atualizarLabel;
        atualizarLabel(); // Chama na inicialização para garantir o label correto
    },

    updateTeamSelect(selectedValue = '1') {
        const select = document.getElementById('collaborator-team-modal');
        if (!select) return;

        let html = this.gruposPermitidosAta.map(g => 
            `<option value="${g}" ${selectedValue === g ? 'selected' : ''}>${isNaN(g) ? g : 'Equipe ' + g}</option>`
        ).join('');
        
        html += `<option value="ADD_NEW">+ Adicionar outro...</option>`;
        select.innerHTML = html;

        select.onchange = (e) => {
            if (e.target.value === 'ADD_NEW') {
                const novo = prompt("Digite o nome do novo grupo/setor:");
                if (novo && novo.trim()) {
                    const opt = new Option(novo, novo, true, true);
                    if (select.firstChild) {
                        select.add(opt, select.firstChild);
                    } else {
                        select.add(opt); 
                    }
                    select.value = novo;
                    if (!this.gruposPermitidosAta.includes(novo)) {
                        this.gruposPermitidosAta.push(novo);
                    }
                } else { select.value = '1'; }
            }
        };
    },

    // ========================================================
    // 5. SALVAR (PAUTA + MASTER)
    // ========================================================
    async saveCollaborator(app) {
        if (!app || !app.currentPauta || !app.currentPauta.id) {
            showNotification("Nenhuma pauta selecionada", "error");
            return;
        }

        const nameInput = document.getElementById('collaborator-name-modal');
        const nome = nameInput ? nameInput.value : '';

        const roleSelect = document.getElementById('collaborator-role-modal');
        const cargo = roleSelect ? roleSelect.value : '';

        const identificadorInput = document.getElementById('collaborator-identificador-modal');
        const identificador = identificadorInput ? identificadorInput.value : '';

        const teamSelect = document.getElementById('collaborator-team-modal');
        const equipe = teamSelect ? teamSelect.value : '';

        const phoneInput = document.getElementById('collaborator-phone-modal');
        const telefone = phoneInput ? phoneInput.value : '';

        const emailInput = document.getElementById('collaborator-email-modal');
        const email = emailInput ? emailInput.value : '';
        
        const transporteRadio = document.querySelector('input[name="transporte-colaborador"]:checked');
        const transporte = transporteRadio ? transporteRadio.value : '';

        if (!nome || !identificador) {
            showNotification("Preencha Nome e Matrícula/ID", "error");
            return;
        }

        const tipo_id = (cargo === "Defensor(a)") ? "Matrícula" : "ID"; 

        const data = {
            nome,
            cargo,
            identificador,
            tipo_id, 
            equipe,
            telefone,
            email,
            transporte,
            updatedAt: new Date()
        };

        try {
            const colRef = collection(app.db, "pautas", app.currentPauta.id, "collaborators");
            
            if (this.editId) {
                await updateDoc(doc(colRef, this.editId), data);
                showNotification("Membro atualizado!");
            } else {
                await addDoc(colRef, { ...data, presente: false, horario: '--:--' });
                showNotification("Membro adicionado!");
            }
            
            await this.salvarNaBaseMaster(app, data); 
            this.resetForm();
        } catch (error) {
            console.error("Erro ao salvar:", error);
            showNotification("Erro ao salvar membro", "error");
        }
    },

    async salvarNaBaseMaster(app, data) {
        const chave = data.identificador;
        if (!chave) return;
        const masterRef = doc(app.db, "colaboradores_gerais", chave);
        await setDoc(masterRef, data, { merge: true });
    },

    // ========================================================
    // 6. LISTENER E TABELA (COM ORDENAÇÃO E DESIGN MOBILE)
    // ========================================================
    setupListener(app, pautaId) {
        if (!pautaId || !app || !app.db) return; 
        
        console.log("📋 Configurando listener para pauta:", pautaId);
        
        if (this.currentListener) {
            this.currentListener();
        }
        
        const ref = collection(app.db, "pautas", pautaId, "collaborators");
        this.currentListener = onSnapshot(ref, (snapshot) => {
            const lista = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            app.colaboradores = lista;
            this.salvarNoLocalStorage(app);
            this.renderTable(app);
        }, (error) => {
            console.error("Erro no listener:", error);
        });
    },

    salvarNoLocalStorage(app) {
        try {
            if (app && app.colaboradores) { 
                localStorage.setItem('sigap_colaboradores', JSON.stringify(app.colaboradores));
            }
        } catch (e) {
            console.error("Erro ao salvar no localStorage:", e);
        }
    },

    // Renderização com design responsivo mobile
    renderTable(app) {
        const tbody = document.querySelector('#collaborators-list-table-modal tbody');
        if (!tbody) return;

        tbody.innerHTML = '';
        let selfT = 0, compT = 0;
        
        const colaboradoresOrdenados = this.ordenarColaboradores(app.colaboradores || []);
        
        let ultimoGrupo = '';

        colaboradoresOrdenados.forEach(colab => {
            if (colab.transporte === 'Meios Próprios') selfT++; 
            else if (colab.transporte === 'Com a Empresa') compT++;
            
            const grupoAtual = colab.equipe || 'Sem Grupo';
            
            if (this.ordemAtual === 'grupo' && ultimoGrupo !== grupoAtual) {
                ultimoGrupo = grupoAtual;
                const groupRow = document.createElement('tr');
                groupRow.className = 'bg-gray-100';
                groupRow.innerHTML = `
                    <td colspan="5" class="p-2 font-bold text-gray-700">
                        📁 ${escapeHTML(grupoAtual)}
                    </td>
                `;
                tbody.appendChild(groupRow);
            }
            
            const row = document.createElement('tr');
            row.className = "border-b hover:bg-gray-50 text-sm";
            
            const isDefensor = colab.cargo === 'Defensor(a)';
            const nomeClass = isDefensor ? 'font-bold text-blue-700' : 'font-bold text-gray-800';
            const labelTipo = colab.tipo_id || (isDefensor ? 'Matrícula' : 'ID'); // Usa tipo_id salvo, senão infere
            
            // Layout responsivo para mobile
            row.innerHTML = `
                <td class="p-2 md:p-3">
                    <div class="${nomeClass} text-sm md:text-base">${escapeHTML(colab.nome || '')}</div>
                    <div class="text-[9px] md:text-[10px] text-gray-500 uppercase">${labelTipo}: ${colab.identificador || ''}</div>
                    <div class="block md:hidden text-xs mt-1">
                        <span class="font-semibold">${escapeHTML(colab.cargo || 'N/A')}</span> | 
                        <span class="text-blue-600">GRP: ${escapeHTML(colab.equipe || 'N/A')}</span>
                    </div>
                </td>
                <td class="p-2 md:p-3 text-center">
                    <input type="checkbox" class="checkin-checkbox w-5 h-5 md:w-5 md:h-5" 
                           data-id="${colab.id}" ${colab.presente ? 'checked' : ''}>
                </td>
                <td class="p-2 md:p-3 hidden md:table-cell">
                    <span class="text-xs font-semibold">${escapeHTML(colab.cargo || 'N/A')}</span><br>
                    <span class="text-[10px] text-blue-600 font-bold">GRP: ${escapeHTML(colab.equipe || 'N/A')}</span>
                </td>
                <td class="p-2 md:p-3 text-center text-xs md:text-sm">${colab.horario || '--:--'}</td>
                <td class="p-2 md:p-3 text-center">
                    <button class="edit-collaborator-btn text-blue-500 mr-1 md:mr-2 text-sm md:text-base" data-id="${colab.id}">✏️</button>
                    <button class="delete-collaborator-btn text-red-500 text-sm md:text-base" data-id="${colab.id}">🗑️</button>
                </td>
            `;
            tbody.appendChild(row);
        });

        const totalSpan = document.getElementById('total-participants-count');
        if (totalSpan) totalSpan.textContent = (app.colaboradores && app.colaboradores.length) || 0; 
        
        const selfSpan = document.getElementById('self-transport-count');
        if (selfSpan) selfSpan.textContent = selfT;
        
        const compSpan = document.getElementById('company-transport-count');
        if (compSpan) compSpan.textContent = compT;

        this.addEventListeners(app);
    },

    // ========================================================
    // 7. GERAR ATA (APENAS GRUPOS PERMITIDOS)
    // ========================================================
    gerarAta(app) {
        if (!app || !app.colaboradores || app.colaboradores.length === 0) {
            showNotification("Nenhum colaborador cadastrado", "error");
            return null;
        }

        const colaboradoresFiltrados = this.filtrarParaAta(app.colaboradores);
        
        if (colaboradoresFiltrados.length === 0) {
            showNotification("Nenhum colaborador dos grupos permitidos (Defensores, Servidores, Coordenadores, CRC)", "error");
            return null;
        }

        const ordenados = [...colaboradoresFiltrados].sort((a, b) => {
            const grupoA = a.equipe || '';
            const grupoB = b.equipe || '';
            if (grupoA !== grupoB) return grupoA.localeCompare(grupoB);
            
            const isDefensorA = (a.cargo === 'Defensor(a)') ? 0 : 1;
            const isDefensorB = (b.cargo === 'Defensor(a)') ? 0 : 1;
            if (isDefensorA !== isDefensorB) {
                return isDefensorA - isDefensorB;
            }

            return (a.nome || '').localeCompare(b.nome || '');
        });

        let ataHTML = `
            <div style="font-family: Arial, sans-serif; max-width: 100%; overflow-x: auto;">
                <h3 style="text-align: center;">LISTA DE PRESENÇA</h3>
                <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                    <thead>
                        <tr style="background-color: #f3f4f6;">
                            <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Nome</th>
                            <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Cargo</th>
                            <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Equipe</th>
                            <th style="border: 1px solid #ddd; padding: 8px; text-align: center;">Presente</th>
                            <th style="1px solid #ddd; padding: 8px; text-align: center;">Horário</th>
                            <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Identificador</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        let ultimoGrupo = '';
        ordenados.forEach(colab => {
            const grupoAtual = colab.equipe || 'Sem Grupo';
            if (ultimoGrupo !== grupoAtual) {
                ultimoGrupo = grupoAtual;
                ataHTML += `
                    <tr style="background-color: #e5e7eb;">
                        <td colspan="6" style="border: 1px solid #ddd; padding: 6px; font-weight: bold;">
                            📁 ${escapeHTML(grupoAtual)}
                        </td>
                    </tr>
                `;
            }

            const identificadorText = colab.identificador ? `${colab.tipo_id || 'ID'}: ${colab.identificador}` : 'N/A';

            ataHTML += `
                <tr>
                    <td style="border: 1px solid #ddd; padding: 6px;">${escapeHTML(colab.nome || '')}</td>
                    <td style="border: 1px solid #ddd; padding: 6px;">${escapeHTML(colab.cargo || '')}</td>
                    <td style="border: 1px solid #ddd; padding: 6px;">${escapeHTML(colab.equipe || '')}</td>
                    <td style="border: 1px solid #ddd; padding: 6px; text-align: center;">
                        ${colab.presente ? '✓' : ''}
                    </td>
                    <td style="border: 1px solid #ddd; padding: 6px; text-align: center;">${colab.horario || '--:--'}</td>
                    <td style="border: 1px solid #ddd; padding: 6px; text-align: left;">${escapeHTML(identificadorText)}</td>
                </tr>
            `;
        });

        ataHTML += `
                    </tbody>
                </table>
                <p style="font-size: 10px; margin-top: 16px; text-align: center;">
                    Documento gerado automaticamente pelo SIGAP
                </p>
            </div>
        `;

        return ataHTML;
    },

    addEventListeners(app) {
        document.querySelectorAll('#collaborators-modal .checkin-checkbox').forEach(checkbox => {
            checkbox.onchange = async (e) => {
                const docId = e.target.dataset.id;
                const presente = e.target.checked;
                if (app && app.currentPauta && app.currentPauta.id) {
                    await this.togglePresence(app, docId, presente);
                }
            };
        });

        document.querySelectorAll('#collaborators-modal .edit-collaborator-btn').forEach(btn => {
            btn.onclick = async (e) => {
                const docId = e.currentTarget.dataset.id;
                if (app && app.currentPauta && app.currentPauta.id) {
                    await this.editCollaborator(app, docId);
                }
            };
        });

        document.querySelectorAll('#collaborators-modal .delete-collaborator-btn').forEach(btn => {
            btn.onclick = (e) => {
                const docId = e.currentTarget.dataset.id;
                if (confirm("Remover este membro?")) {
                    if (app && app.currentPauta && app.currentPauta.id) {
                        this.deleteCollaborator(app, docId);
                    }
                }
            };
        });
    },

    async togglePresence(app, id, presente) {
        if (!app || !app.currentPauta || !app.currentPauta.id) return;
        try {
            const ref = doc(app.db, "pautas", app.currentPauta.id, "collaborators", id);
            const horario = presente ? new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
            await updateDoc(ref, { presente, horario });
        } catch (error) {
            console.error("Erro ao marcar presença:", error);
        }
    },

    async editCollaborator(app, id) {
        if (!app || !app.currentPauta || !app.currentPauta.id) return;
        try {
            const ref = doc(app.db, "pautas", app.currentPauta.id, "collaborators", id);
            const snap = await getDoc(ref);
            
            if (snap.exists()) {
                const c = snap.data();
                this.editId = id;
                
                const nameInput = document.getElementById('collaborator-name-modal');
                if (nameInput) nameInput.value = c.nome || '';
                
                const roleSelect = document.getElementById('collaborator-role-modal');
                if (roleSelect) roleSelect.value = c.cargo || 'Defensor(a)';
                
                const identificadorInput = document.getElementById('collaborator-identificador-modal');
                if (identificadorInput) identificadorInput.value = c.identificador || '';
                
                const teamSelect = document.getElementById('collaborator-team-modal');
                if (teamSelect) teamSelect.value = c.equipe || '1';
                
                const phoneInput = document.getElementById('collaborator-phone-modal');
                if (phoneInput) phoneInput.value = c.telefone || '';
                
                const emailInput = document.getElementById('collaborator-email-modal');
                if (emailInput) emailInput.value = c.email || '';
                
                const rTransp = document.querySelector(`input[name="transporte-colaborador"][value="${c.transporte || 'Meios Próprios'}"]`);
                if (rTransp) rTransp.checked = true;

                this.configurarLogicaCargo(); // Reconfigura o label "Matrícula/ID"
                const addBtn = document.getElementById('add-collaborator-btn-modal');
                if (addBtn) addBtn.textContent = "Atualizar Membro";
            }
        } catch (error) {
            console.error("Erro ao editar:", error);
        }
    },

    async deleteCollaborator(app, id) {
        if (!app || !app.currentPauta || !app.currentPauta.id) return;
        try {
            const ref = doc(app.db, "pautas", app.currentPauta.id, "collaborators", id);
            await deleteDoc(ref);
            showNotification("Membro removido!");
        } catch (error) {
            console.error("Erro ao deletar:", error);
        }
    },

    async clearAll(app) {
        if (!confirm("Tem certeza que deseja apagar TODOS os membros?")) return;
        if (!app || !app.currentPauta || !app.currentPauta.id) return;
        
        try {
            const ref = collection(app.db, "pautas", app.currentPauta.id, "collaborators");
            const snapshot = await getDocs(ref);
            
            if (snapshot.empty) return;

            const batch = writeBatch(app.db);
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            
            showNotification("Lista limpa!");
        } catch (error) {
            console.error("Erro ao limpar lista:", error);
        }
    },

    resetForm() {
        const form = document.getElementById('collaborator-form-modal');
        if (form) form.reset();
        this.editId = null;
        
        const btn = document.getElementById('add-collaborator-btn-modal');
        if (btn) btn.textContent = "Salvar Membro";
        
        const teamSelect = document.getElementById('collaborator-team-modal');
        if (teamSelect) teamSelect.value = '1';
        
        const cargoSelect = document.getElementById('collaborator-role-modal');
        if (cargoSelect) cargoSelect.value = 'Defensor(a)';
        
        const transpDefault = document.querySelector('input[name="transporte-colaborador"][value="Meios Próprios"]');
        if (transpDefault) transpDefault.checked = true;
        
        this.configurarLogicaCargo(); // Garante que o label Matrícula/ID volte ao padrão ou ao do cargo inicial
    }
};

// ========================================================
// EXPORTAÇÕES
// ========================================================
export default CollaboratorService;
export { CollaboratorService };
window.CollaboratorService = CollaboratorService;

console.log("✅ colaboradores.js carregado (Mobile + Filtro ATA: Defensores, Servidores, Coordenadores, CRC)!");
