// js/colaboradores.js - VERSÃO COM ORDENAÇÃO MANUAL
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
    ordemAtual: 'grupo', // 'grupo' ou 'nome'

    // ========================================================
    // 1. AUTO-PREENCHIMENTO (BUSCA NA BASE MASTER)
    // ========================================================
    async buscarColaboradorMaster(app, identificador) {
        if (!identificador || identificador.length < 3) return;

        try {
            const idBusca = identificador.replace(/\D/g, '');
            const masterRef = doc(app.db, "colaboradores_gerais", idBusca);
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
            // Ordena por nome (A-Z)
            return [...colaboradores].sort((a, b) => {
                return (a.nome || '').localeCompare(b.nome || '');
            });
        } else {
            // Ordena por grupo, com defensores primeiro dentro de cada grupo
            return [...colaboradores].sort((a, b) => {
                // Primeiro critério: grupo
                const grupoA = a.equipe || '';
                const grupoB = b.equipe || '';
                if (grupoA !== grupoB) {
                    return grupoA.localeCompare(grupoB);
                }
                
                // Mesmo grupo: defensores primeiro
                const isDefensorA = (a.cargo === 'Defensor(a)') ? 0 : 1;
                const isDefensorB = (b.cargo === 'Defensor(a)') ? 0 : 1;
                if (isDefensorA !== isDefensorB) {
                    return isDefensorA - isDefensorB;
                }
                
                // Depois ordena por nome
                return (a.nome || '').localeCompare(b.nome || '');
            });
        }
    },

    toggleOrdem() {
        this.ordemAtual = this.ordemAtual === 'grupo' ? 'nome' : 'grupo';
        const btn = document.getElementById('toggle-order-btn');
        if (btn) {
            btn.textContent = this.ordemAtual === 'grupo' ? '📁 Ordenar por Grupo' : '🔤 Ordenar por Nome';
        }
        // Re-renderizar com a nova ordem
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
            snap.forEach(doc => {
                const c = doc.data();
                select.innerHTML += `<option value="${escapeHTML(c.nome)}">${escapeHTML(c.nome)}</option>`;
            });
        } catch (e) {
            console.error("Erro ao carregar defensores:", e);
        }
    },

    // ========================================================
    // 4. CONFIGURAÇÃO DO MODAL E EVENTOS
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
        
        // Adicionar botão de ordenação se não existir
        this.adicionarBotaoOrdenacao();
        
        if (app && app.currentPauta && app.currentPauta.id) {
            this.setupListener(app, app.currentPauta.id);
        }
    },

    adicionarBotaoOrdenacao() {
        const container = document.querySelector('#collaborators-list-table-modal');
        if (!container) return;
        
        // Verifica se o botão já existe
        if (document.getElementById('toggle-order-btn')) return;
        
        const header = container.querySelector('.flex.justify-between') || container;
        const btn = document.createElement('button');
        btn.id = 'toggle-order-btn';
        btn.className = 'bg-gray-200 hover:bg-gray-300 text-gray-800 px-3 py-1 rounded text-sm mb-2';
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
            if (!this.editId) {
                this.buscarColaboradorMaster(app, inputId.value);
            }
        };
    },

    configurarLogicaCargo() {
        const cargoSelect = document.getElementById('collaborator-role-modal');
        const labelIdentificador = document.getElementById('label-identificador-modal');
        
        if (!cargoSelect || !labelIdentificador) return;

        const atualizarLabel = () => {
            labelIdentificador.textContent = (cargoSelect.value === "Defensor(a)") ? "ID" : "Matrícula";
        };

        cargoSelect.onchange = atualizarLabel;
        atualizarLabel();
    },

    updateTeamSelect(selectedValue = '1') {
        const select = document.getElementById('collaborator-team-modal');
        if (!select) return;

        const gruposPadrao = ['1', '2', '3', '4', 'CRC', 'Coordenadores'];
        let html = gruposPadrao.map(g => 
            `<option value="${g}" ${selectedValue === g ? 'selected' : ''}>${isNaN(g) ? g : 'Equipe ' + g}</option>`
        ).join('');
        
        html += `<option value="ADD_NEW">+ Adicionar outro...</option>`;
        select.innerHTML = html;

        select.onchange = (e) => {
            if (e.target.value === 'ADD_NEW') {
                const novo = prompt("Digite o nome do novo grupo/setor:");
                if (novo) {
                    const opt = new Option(novo, novo, true, true);
                    select.add(opt, select.firstChild);
                    select.value = novo;
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

        const data = {
            nome,
            cargo,
            identificador,
            tipo_id: (cargo === "Defensor(a)") ? "ID" : "Matrícula",
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
        const idUnico = data.identificador.replace(/\D/g, '');
        if (!idUnico) return;
        const masterRef = doc(app.db, "colaboradores_gerais", idUnico);
        await setDoc(masterRef, data, { merge: true });
    },

    // ========================================================
    // 6. LISTENER E TABELA (COM ORDENAÇÃO)
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

    renderTable(app) {
        const tbody = document.querySelector('#collaborators-list-table-modal tbody');
        if (!tbody) return;

        tbody.innerHTML = '';
        let selfT = 0, compT = 0;
        
        // Aplica a ordenação atual
        const colaboradoresOrdenados = this.ordenarColaboradores(app.colaboradores || []);
        
        let ultimoGrupo = '';

        colaboradoresOrdenados.forEach(colab => {
            if (colab.transporte === 'Meios Próprios') selfT++; 
            else if (colab.transporte === 'Com a Empresa') compT++;
            
            const grupoAtual = colab.equipe || 'Sem Grupo';
            
            // Adiciona separador de grupo se for ordenação por grupo e mudou de grupo
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
            
            // Destacar defensores
            const isDefensor = colab.cargo === 'Defensor(a)';
            const nomeClass = isDefensor ? 'font-bold text-blue-700' : 'font-bold text-gray-800';
            
            row.innerHTML = `
                <td class="p-3">
                    <div class="${nomeClass}">${escapeHTML(colab.nome || '')}</div>
                    <div class="text-[10px] text-gray-500 uppercase">${colab.tipo_id || 'ID'}: ${colab.identificador || ''}</div>
                </td>
                <td class="p-3 text-center">
                    <input type="checkbox" class="checkin-checkbox w-5 h-5" 
                           data-id="${colab.id}" ${colab.presente ? 'checked' : ''}>
                </td>
                <td class="p-3">
                    <span class="text-xs font-semibold">${escapeHTML(colab.cargo || 'N/A')}</span><br>
                    <span class="text-[10px] text-blue-600 font-bold">GRP: ${escapeHTML(colab.equipe || 'N/A')}</span>
                </td>
                <td class="p-3 text-center">${colab.horario || '--:--'}</td>
                <td class="p-3 text-center">
                    <button class="edit-collaborator-btn text-blue-500 mr-2" data-id="${colab.id}">✏️</button>
                    <button class="delete-collaborator-btn text-red-500" data-id="${colab.id}">🗑️</button>
                </td>
            `;
            tbody.appendChild(row);
        });

        // Atualizar contadores
        const totalSpan = document.getElementById('total-participants-count');
        if (totalSpan) totalSpan.textContent = app.colaboradores?.length || 0;
        
        const selfSpan = document.getElementById('self-transport-count');
        if (selfSpan) selfSpan.textContent = selfT;
        
        const compSpan = document.getElementById('company-transport-count');
        if (compSpan) compSpan.textContent = compT;

        this.addEventListeners(app);
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
        
        // NÃO limpar o campo identificador automaticamente - preservar o que foi digitado
        // Mas se for edição, será sobrescrito pelo editCollaborator
    }
};

// ========================================================
// EXPORTAÇÕES
// ========================================================
export default CollaboratorService;
export { CollaboratorService };
window.CollaboratorService = CollaboratorService;

console.log("✅ colaboradores.js carregado (com ordenação manual por grupo/nome)!");
