// js/colaboradores.js - VERSÃO MOBILE + FILTRO ATA E ORDENAÇÃO AVANÇADA (SIGEP)
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
        const idLimpo = identificador.trim().split('/').pop();
        if (!idLimpo || idLimpo.length < 3) return;

        try {
            const masterRef = doc(app.db, "colaboradores_gerais", idLimpo);
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
                showNotification("Dados recuperados da base master! ✅", "success");
            }
        } catch (e) {
            console.error("Erro ao buscar master:", e);
        }
    },

    // ========================================================
    // 2. ORDENAÇÃO DA LISTA (Defensor > Servidor > Outros)
    // ========================================================
    ordenarColaboradores(colaboradores) {
        if (this.ordemAtual === 'nome') {
            return [...colaboradores].sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
        } else {
            return [...colaboradores].sort((a, b) => {
                const grupoA = a.equipe || '';
                const grupoB = b.equipe || '';
                if (grupoA !== grupoB) return grupoA.localeCompare(grupoB);
                
                const getCargoWeight = (cargo) => {
                    const c = (cargo || '').toLowerCase();
                    if (c.includes('defensor')) return 1;
                    if (c.includes('servidor')) return 2;
                    return 3;
                };

                const weightA = getCargoWeight(a.cargo);
                const weightB = getCargoWeight(b.cargo);
                
                if (weightA !== weightB) return weightA - weightB; 
                return (a.nome || '').localeCompare(b.nome || ''); 
            });
        }
    },

    filtrarParaAta(colaboradores) {
        return colaboradores.filter(colab => this.gruposPermitidosAta.includes(colab.equipe || ''));
    },

    toggleOrdem() {
        this.ordemAtual = this.ordemAtual === 'grupo' ? 'nome' : 'grupo';
        const btn = document.getElementById('toggle-order-btn');
        if (btn) btn.textContent = this.ordemAtual === 'grupo' ? '📁 Ordenar por Grupo' : '🔤 Ordenar por Nome';
        if (window.app) this.renderTable(window.app);
    },

    // ========================================================
    // 3. GESTÃO DE DADOS DA ATA SOCIAL (PERSISTÊNCIA)
    // ========================================================
    
    /**
     * Salva os dados do formulário da Ata no documento da Pauta
     */
    async saveAtaData(app) {
        if (!app?.currentPauta?.id) {
            showNotification("Selecione uma pauta primeiro", "error");
            return;
        }

        const data = {
            ataAcaoNome: document.getElementById('ata-acao-nome').value.trim(),
            ataEndereco: document.getElementById('ata-endereco').value.trim(),
            ataData: document.getElementById('ata-data').value,
            ataTotalManual: document.getElementById('ata-total').value,
            ataOrgao: document.getElementById('ata-orgao').value.trim(),
            ataLastUpdate: new Date().toISOString()
        };

        try {
            const pautaRef = doc(app.db, "pautas", app.currentPauta.id);
            await updateDoc(pautaRef, data);
            
            // Atualiza o estado local para evitar recarregamento
            if (app.currentPautaData) {
                Object.assign(app.currentPautaData, data);
            }

            showNotification("Dados da Ata salvos com sucesso!", "success");
        } catch (error) {
            console.error("Erro ao salvar dados da ata:", error);
            showNotification("Erro ao salvar dados no banco.", "error");
        }
    },

    /**
     * Carrega os dados salvos da pauta para os campos do modal
     */
    async loadAtaData(app) {
        if (!app?.currentPauta?.id) return;

        try {
            // Primeiro tenta usar os dados que já estão na memória do app
            let data = app.currentPautaData;
            
            // Se não estiverem lá, busca no banco por segurança
            if (!data || !data.ataOrgao) {
                const pautaDoc = await getDoc(doc(app.db, "pautas", app.currentPauta.id));
                if (pautaDoc.exists()) data = pautaDoc.data();
            }

            if (data) {
                if (data.ataAcaoNome) document.getElementById('ata-acao-nome').value = data.ataAcaoNome;
                if (data.ataEndereco) document.getElementById('ata-endereco').value = data.ataEndereco;
                if (data.ataData) document.getElementById('ata-data').value = data.ataData;
                if (data.ataTotalManual) document.getElementById('ata-total').value = data.ataTotalManual;
                if (data.ataOrgao) document.getElementById('ata-orgao').value = data.ataOrgao;
            }
        } catch (error) {
            console.error("Erro ao carregar dados da ata:", error);
        }
    },

    // ========================================================
    // 4. FLUXO DE REVISÃO E UI (MOBILE)
    // ========================================================
    openModal(app) {
        const modal = document.getElementById('collaborators-modal');
        if (!modal) return;

        modal.classList.remove('hidden');
        this.resetForm();
        this.updateTeamSelect();
        this.configurarLogicaCargo();
        this.adicionarBotaoOrdenacao();
        
        if (app?.currentPauta?.id) {
            this.setupListener(app, app.currentPauta.id);
        }
    },

    adicionarBotaoOrdenacao() {
        if (document.getElementById('toggle-order-btn')) return;
        const container = document.querySelector('#collaborators-list-table-modal');
        if (!container) return;
        
        const btn = document.createElement('button');
        btn.id = 'toggle-order-btn';
        btn.className = 'w-full md:w-auto bg-gray-200 hover:bg-gray-300 text-gray-800 px-3 py-2 rounded text-sm mb-4 transition';
        btn.textContent = this.ordemAtual === 'grupo' ? '📁 Ordenar por Grupo' : '🔤 Ordenar por Nome';
        btn.onclick = () => this.toggleOrdem();
        container.prepend(btn);
    },

    configurarLogicaCargo() {
        const cargoSelect = document.getElementById('collaborator-role-modal');
        const labelIdentificador = document.getElementById('label-identificador-modal');
        if (cargoSelect && labelIdentificador) {
            labelIdentificador.textContent = (cargoSelect.value === "Defensor(a)") ? "Matrícula" : "ID";
            cargoSelect.onchange = () => {
                labelIdentificador.textContent = (cargoSelect.value === "Defensor(a)") ? "Matrícula" : "ID";
            };
        }
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
                if (novo?.trim()) {
                    const opt = new Option(novo, novo, true, true);
                    select.add(opt, select.firstChild);
                    if (!this.gruposPermitidosAta.includes(novo)) this.gruposPermitidosAta.push(novo);
                } else { select.value = '1'; }
            }
        };
    },

    // ========================================================
    // 5. PERSISTÊNCIA (PAUTA + MASTER)
    // ========================================================
    async saveCollaborator(app) {
        if (!app?.currentPauta?.id) return;

        const data = {
            nome: document.getElementById('collaborator-name-modal')?.value.trim(),
            cargo: document.getElementById('collaborator-role-modal')?.value,
            identificador: document.getElementById('collaborator-identificador-modal')?.value.trim(),
            equipe: document.getElementById('collaborator-team-modal')?.value,
            telefone: document.getElementById('collaborator-phone-modal')?.value.trim(),
            email: document.getElementById('collaborator-email-modal')?.value.trim(),
            transporte: document.querySelector('input[name="transporte-colaborador"]:checked')?.value || 'Meios Próprios',
            tipo_id: (document.getElementById('collaborator-role-modal')?.value === "Defensor(a)") ? "Matrícula" : "ID",
            updatedAt: new Date().toISOString()
        };

        if (!data.nome || !data.identificador) {
            showNotification("Preencha Nome e Matrícula/ID", "error");
            return;
        }

        try {
            const colRef = collection(app.db, "pautas", app.currentPauta.id, "collaborators");
            if (this.editId) {
                await updateDoc(doc(colRef, this.editId), data);
            } else {
                await addDoc(colRef, { ...data, presente: false, horario: '--:--' });
            }
            // Salva na Base Master para auto-preenchimento futuro
            await setDoc(doc(app.db, "colaboradores_gerais", data.identificador), data, { merge: true });
            
            showNotification("Dados salvos com sucesso!", "success");
            this.resetForm();
        } catch (error) {
            showNotification("Erro ao salvar.", "error");
        }
    },

    // ========================================================
    // 6. RENDERIZAÇÃO E EVENTOS
    // ========================================================
    setupListener(app, pautaId) {
        if (this.currentListener) this.currentListener();
        const ref = collection(app.db, "pautas", pautaId, "collaborators");
        this.currentListener = onSnapshot(ref, (snapshot) => {
            app.colaboradores = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            this.renderTable(app);
        });
    },

    renderTable(app) {
        const tbody = document.querySelector('#collaborators-list-table-modal tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        let selfT = 0, compT = 0;
        const ordenados = this.ordenarColaboradores(app.colaboradores || []);
        let ultimoGrupo = '';

        ordenados.forEach(colab => {
            if (colab.transporte === 'Meios Próprios') selfT++; else compT++;
            
            if (this.ordemAtual === 'grupo' && ultimoGrupo !== colab.equipe) {
                ultimoGrupo = colab.equipe;
                tbody.innerHTML += `<tr class="bg-gray-100"><td colspan="5" class="p-2 font-bold text-gray-600 text-xs uppercase">📁 Equipe ${escapeHTML(ultimoGrupo)}</td></tr>`;
            }

            const isDef = colab.cargo === 'Defensor(a)';
            const row = document.createElement('tr');
            row.className = "border-b hover:bg-gray-50 transition";
            row.innerHTML = `
                <td class="p-3">
                    <div class="font-bold ${isDef ? 'text-blue-700' : 'text-gray-800'}">${escapeHTML(colab.nome)}</div>
                    <div class="text-[10px] text-gray-400 uppercase">${colab.tipo_id}: ${colab.identificador}</div>
                </td>
                <td class="p-3 text-center">
                    <input type="checkbox" class="checkin-checkbox w-6 h-6" data-id="${colab.id}" ${colab.presente ? 'checked' : ''}>
                </td>
                <td class="p-3 hidden md:table-cell text-xs">${escapeHTML(colab.cargo)}</td>
                <td class="p-3 text-center text-xs">${colab.horario || '--:--'}</td>
                <td class="p-3 text-center">
                    <button onclick="CollaboratorService.editCollaborator(window.app, '${colab.id}')" class="text-blue-500 p-1">✏️</button>
                    <button onclick="CollaboratorService.deleteCollaborator(window.app, '${colab.id}')" class="text-red-500 p-1">🗑️</button>
                </td>
            `;
            tbody.appendChild(row);
        });

        document.getElementById('total-participants-count').textContent = app.colaboradores.length;
        document.getElementById('self-transport-count').textContent = selfT;
        document.getElementById('company-transport-count').textContent = compT;
        this.addEventListeners(app);
    },

    addEventListeners(app) {
        document.querySelectorAll('.checkin-checkbox').forEach(cb => {
            cb.onchange = async (e) => {
                const id = e.target.dataset.id;
                const pres = e.target.checked;
                const hor = pres ? new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
                await updateDoc(doc(app.db, "pautas", app.currentPauta.id, "collaborators", id), { presente: pres, horario: hor });
            };
        });

        // Event listener para o botão de SALVAR DADOS da Ata
        const btnSaveAta = document.getElementById('save-ata-data-btn');
        if (btnSaveAta) {
            btnSaveAta.onclick = () => this.saveAtaData(app);
        }
    },

    async editCollaborator(app, id) {
        const snap = await getDoc(doc(app.db, "pautas", app.currentPauta.id, "collaborators", id));
        if (snap.exists()) {
            const c = snap.data();
            this.editId = id;
            document.getElementById('collaborator-name-modal').value = c.nome;
            document.getElementById('collaborator-role-modal').value = c.cargo;
            document.getElementById('collaborator-identificador-modal').value = c.identificador;
            document.getElementById('collaborator-team-modal').value = c.equipe;
            document.getElementById('add-collaborator-btn-modal').textContent = "Atualizar Membro";
            this.configurarLogicaCargo();
        }
    },

    async deleteCollaborator(app, id) {
        if (confirm("Remover este membro?")) {
            await deleteDoc(doc(app.db, "pautas", app.currentPauta.id, "collaborators", id));
            showNotification("Membro removido!");
        }
    },

    gerarAta(app) {
        const filtrados = this.filtrarParaAta(app.colaboradores);
        if (filtrados.length === 0) return null;

        let html = `<div style="font-family: sans-serif;"><h3>LISTA DE PRESENÇA - SIGEP</h3><table border="1" style="width:100%; border-collapse: collapse;">`;
        html += `<thead><tr><th>Nome</th><th>Cargo</th><th>Equipe</th><th>Horário</th></tr></thead><tbody>`;
        
        this.ordenarColaboradores(filtrados).forEach(c => {
            html += `<tr><td>${c.nome}</td><td>${c.cargo}</td><td>${c.equipe}</td><td>${c.horario}</td></tr>`;
        });
        
        html += `</tbody></table><p style="font-size:10px; text-align:center;">Gerado automaticamente pelo SIGEP</p></div>`;
        return html;
    },

    resetForm() {
        document.getElementById('collaborator-form-modal')?.reset();
        this.editId = null;
        document.getElementById('add-collaborator-btn-modal').textContent = "Salvar Membro";
        this.configurarLogicaCargo();
    }
};

export default CollaboratorService;
window.CollaboratorService = CollaboratorService;
