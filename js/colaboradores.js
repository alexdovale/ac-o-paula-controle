// js/colaboradores.js - VERSÃO MOBILE + FILTRO ATA (Defensores, Servidores, Coordenadores, CRC)
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
    ordemAtual: 'grupo',
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
                
                document.getElementById('collaborator-name-modal').value = dados.nome || '';
                document.getElementById('collaborator-role-modal').value = dados.cargo || 'Defensor(a)';
                document.getElementById('collaborator-team-modal').value = dados.equipe || '1';
                document.getElementById('collaborator-phone-modal').value = dados.telefone || '';
                document.getElementById('collaborator-email-modal').value = dados.email || '';
                
                const rTransp = document.querySelector(`input[name="transporte-colaborador"][value="${dados.transporte || 'Meios Próprios'}"]`);
                if (rTransp) rTransp.checked = true;

                this.configurarLogicaCargo();
                showNotification("Dados recuperados da base master! ✅");
            }
        } catch (e) {
            console.error("Erro ao buscar na base master:", e);
        }
    },

    // ========================================================
    // 2. ORDENAÇÃO DA LISTA
    // ========================================================
    ordenarColaboradores(colaboradores) {
        if (this.ordemAtual === 'nome') {
            return [...colaboradores].sort((a, b) => {
                return (a.nome || '').localeCompare(b.nome || '');
            });
        } else {
            return [...colaboradores].sort((a, b) => {
                const grupoA = a.equipe || '';
                const grupoB = b.equipe || '';
                if (grupoA !== grupoB) {
                    return grupoA.localeCompare(grupoB);
                }
                
                const isDefensorA = (a.cargo === 'Defensor(a)') ? 0 : 1;
                const isDefensorB = (b.cargo === 'Defensor(a)') ? 0 : 1;
                if (isDefensorA !== isDefensorB) {
                    return isDefensorA - isDefensorB;
                }
                
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
        this.configurarEventoBusca(app);
        
        this.adicionarBotaoOrdenacao();
        
        if (app && app.currentPauta && app.currentPauta.id) {
            this.setupListener(app, app.currentPauta.id);
        }
        
        // Ajustar para mobile: scroll suave
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

    configurarEventoBusca(app) {
        const inputId = document.getElementById('collaborator-identificador-modal');
        if (!inputId) return;

        inputId.onblur = () => {
            if (!this.editId && inputId.value) {
                this.buscarColaboradorMaster(app, inputId.value);
            }
        };
    },

    configurarLogicaCargo() {
        const cargoSelect = document.getElementById('collaborator-role-modal');
        const labelIdentificador = document.getElementById('label-identificador-modal');
        
        if (!cargoSelect || !labelIdentificador) return;

        const atualizarLabel = () => {
            labelIdentificador.textContent = (cargoSelect.value === "Defensor(a)") ? "Matrícula" : "ID";
        };

        cargoSelect.onchange = atualizarLabel;
        atualizarLabel();
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
                    select.add(opt, select.firstChild);
                    select.value = novo;
                    // Adicionar aos permitidos para aparecer na ata
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
        if (!app.currentPauta?.id) {
            showNotification("Nenhuma pauta selecionada", "error");
            return;
        }

        const nome = document.getElementById('collaborator-name-modal').value;
        const cargo = document.getElementById('collaborator-role-modal').value;
        const identificador = document.getElementById('collaborator-identificador-modal').value;
        const equipe = document.getElementById('collaborator-team-modal').value;
        const telefone = document.getElementById('collaborator-phone-modal')?.value || '';
        const email = document.getElementById('collaborator-email-modal')?.value || '';
        const transporte = document.querySelector('input[name="transporte-colaborador"]:checked')?.value;

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
        if (!pautaId || !app?.db) return;
        
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
            const labelTipo = colab.tipo_id || (isDefensor ? 'Matrícula' : 'ID');
            
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
        if (totalSpan) totalSpan.textContent = app.colaboradores?.length || 0;
        
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
        if (!app.colaboradores || app.colaboradores.length === 0) {
            showNotification("Nenhum colaborador cadastrado", "error");
            return null;
        }

        // Aplicar filtro: apenas grupos permitidos
        const colaboradoresFiltrados = this.filtrarParaAta(app.colaboradores);
        
        if (colaboradoresFiltrados.length === 0) {
            showNotification("Nenhum colaborador dos grupos permitidos (Defensores, Servidores, Coordenadores, CRC)", "error");
            return null;
        }

        // Ordenar por grupo e nome
        const ordenados = [...colaboradoresFiltrados].sort((a, b) => {
            const grupoA = a.equipe || '';
            const grupoB = b.equipe || '';
            if (grupoA !== grupoB) return grupoA.localeCompare(grupoB);
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
                            <th style="border: 1px solid #ddd; padding: 8px; text-align: center;">Horário</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        let ultimoGrupo = '';
        ordenados.forEach(colab => {
            const grupoAtual = colab.equipe || 'Sem Grupo';
            if (ultimoGrupo !== grupoAtual) {
                ataHTML += `
                    <tr style="background-color: #e5e7eb;">
                        <td colspan="5" style="border: 1px solid #ddd; padding: 6px; font-weight: bold;">
                            📁 ${escapeHTML(grupoAtual)}
                        </td>
                    </tr>
                `;
                ultimoGrupo = grupoAtual;
            }

            ataHTML += `
                <tr>
                    <td style="border: 1px solid #ddd; padding: 6px;">${escapeHTML(colab.nome || '')}</td>
                    <td style="border: 1px solid #ddd; padding: 6px;">${escapeHTML(colab.cargo || '')}</td>
                    <td style="border: 1px solid #ddd; padding: 6px;">${escapeHTML(colab.equipe || '')}</td>
                    <td style="border: 1px solid #ddd; padding: 6px; text-align: center;">
                        ${colab.presente ? '✓' : ''}
                    </td>
                    <td style="border: 1px solid #ddd; padding: 6px; text-align: center;">${colab.horario || '--:--'}</td>
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
                await this.togglePresence(app, docId, presente);
            };
        });

        document.querySelectorAll('#collaborators-modal .edit-collaborator-btn').forEach(btn => {
            btn.onclick = async (e) => {
                const docId = e.currentTarget.dataset.id;
                await this.editCollaborator(app, docId);
            };
        });

        document.querySelectorAll('#collaborators-modal .delete-collaborator-btn').forEach(btn => {
            btn.onclick = (e) => {
                const docId = e.currentTarget.dataset.id;
                if (confirm("Remover este membro?")) {
                    this.deleteCollaborator(app, docId);
                }
            };
        });
    },

    async togglePresence(app, id, presente) {
        try {
            const ref = doc(app.db, "pautas", app.currentPauta.id, "collaborators", id);
            const horario = presente ? new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
            await updateDoc(ref, { presente, horario });
        } catch (error) {
            console.error("Erro ao marcar presença:", error);
        }
    },

    async editCollaborator(app, id) {
        try {
            const ref = doc(app.db, "pautas", app.currentPauta.id, "collaborators", id);
            const snap = await getDoc(ref);
            
            if (snap.exists()) {
                const c = snap.data();
                this.editId = id;
                
                document.getElementById('collaborator-name-modal').value = c.nome || '';
                document.getElementById('collaborator-role-modal').value = c.cargo || 'Defensor(a)';
                document.getElementById('collaborator-identificador-modal').value = c.identificador || '';
                document.getElementById('collaborator-team-modal').value = c.equipe || '1';
                document.getElementById('collaborator-phone-modal').value = c.telefone || '';
                document.getElementById('collaborator-email-modal').value = c.email || '';
                
                const rTransp = document.querySelector(`input[name="transporte-colaborador"][value="${c.transporte || 'Meios Próprios'}"]`);
                if (rTransp) rTransp.checked = true;

                this.configurarLogicaCargo();
                document.getElementById('add-collaborator-btn-modal').textContent = "Atualizar Membro";
            }
        } catch (error) {
            console.error("Erro ao editar:", error);
        }
    },

    async deleteCollaborator(app, id) {
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
        
        this.configurarLogicaCargo();
    }
};

// ========================================================
// EXPORTAÇÕES
// ========================================================
export default CollaboratorService;
export { CollaboratorService };
window.CollaboratorService = CollaboratorService;

console.log("✅ colaboradores.js carregado (Mobile + Filtro ATA: Defensores, Servidores, Coordenadores, CRC)!");