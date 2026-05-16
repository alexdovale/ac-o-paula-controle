// js/colaboradores.js - EQUIPE E PRESENÇA (OTIMIZADO PARA MOBILE E PREMIUM)

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
        if (btn) {
            btn.innerHTML = this.ordemAtual === 'grupo' 
                ? '<span class="mr-2">📁</span> Ordenar por Grupo' 
                : '<span class="mr-2">🔤</span> Ordenar por Nome';
        }
        if (window.app) this.renderTable(window.app);
    },

    // ========================================================
    // 3. GESTÃO DE DADOS DA ATA SOCIAL (PERSISTÊNCIA)
    // ========================================================
    async saveAtaData(app) {
        if (!app?.currentPauta?.id) {
            showNotification("Selecione uma pauta primeiro", "error");
            return;
        }

        const btnSave = document.getElementById('save-ata-data-btn');
        if (btnSave) btnSave.disabled = true;

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
            
            if (app.currentPautaData) {
                app.currentPautaData = { ...app.currentPautaData, ...data };
            }

            showNotification("Dados da Ata salvos com sucesso! 💾", "success");
        } catch (error) {
            console.error("Erro ao salvar dados da ata:", error);
            showNotification("Erro ao salvar dados no banco.", "error");
        } finally {
            if (btnSave) btnSave.disabled = false;
        }
    },

    async loadAtaData(app) {
        if (!app?.currentPauta?.id) return;

        try {
            const pautaDoc = await getDoc(doc(app.db, "pautas", app.currentPauta.id));
            if (pautaDoc.exists()) {
                const data = pautaDoc.data();
                
                if (data.ataAcaoNome) document.getElementById('ata-acao-nome').value = data.ataAcaoNome;
                else document.getElementById('ata-acao-nome').value = app.currentPauta.name || '';
                
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
        // Estilo botão de filtro premium
        btn.className = 'w-full md:w-auto bg-white hover:bg-slate-50 text-slate-700 font-bold px-4 py-3 md:py-2 rounded-xl text-sm mb-4 transition-colors border border-slate-200 shadow-sm flex items-center justify-center';
        btn.innerHTML = this.ordemAtual === 'grupo' ? '<span class="mr-2">📁</span> Ordenar por Grupo' : '<span class="mr-2">🔤</span> Ordenar por Nome';
        btn.onclick = () => this.toggleOrdem();
        container.parentElement.insertBefore(btn, container);
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
            nome: document.getElementById('collaborator-name-modal')?.value?.trim() || '',
            cargo: document.getElementById('collaborator-role-modal')?.value || '',
            identificador: document.getElementById('collaborator-identificador-modal')?.value?.trim() || '',
            equipe: document.getElementById('collaborator-team-modal')?.value || '',
            telefone: document.getElementById('collaborator-phone-modal')?.value?.trim() || '',
            email: document.getElementById('collaborator-email-modal')?.value?.trim() || '',
            transporte: document.querySelector('input[name="transporte-colaborador"]:checked')?.value || 'Meios Próprios',
            tipo_id: (document.getElementById('collaborator-role-modal')?.value === "Defensor(a)") ? "Matrícula" : "ID",
            updatedAt: new Date().toISOString()
        };

        if (!data.nome || !data.identificador) {
            showNotification("Preencha Nome e Matrícula/ID", "warning");
            return;
        }

        try {
            const colRef = collection(app.db, "pautas", app.currentPauta.id, "collaborators");
            if (this.editId) {
                await updateDoc(doc(colRef, this.editId), data);
            } else {
                await addDoc(colRef, { ...data, presente: false, horario: '--:--' });
            }
            
            await setDoc(doc(app.db, "colaboradores_gerais", data.identificador), data, { merge: true });
            
            showNotification("Membro atualizado/salvo com sucesso!", "success");
            this.resetForm();
        } catch (error) {
            showNotification("Erro ao salvar no banco de dados.", "error");
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
            
            // Agrupador visual moderno e elegante
            if (this.ordemAtual === 'grupo' && ultimoGrupo !== colab.equipe) {
                ultimoGrupo = colab.equipe;
                tbody.innerHTML += `
                    <tr class="bg-violet-50/50 border-b border-violet-100">
                        <td colspan="5" class="p-3 font-black text-violet-800 text-[10px] sm:text-xs uppercase tracking-widest flex items-center gap-2">
                            <span>📁</span> Equipe ${escapeHTML(ultimoGrupo)}
                        </td>
                    </tr>
                `;
            }

            const isDef = colab.cargo === 'Defensor(a)';
            const statusCheckbox = colab.presente 
                ? `<div class="relative inline-block w-12 mr-2 align-middle select-none transition duration-200 ease-in">
                       <input type="checkbox" name="toggle" id="toggle-${colab.id}" class="checkin-checkbox toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer" checked data-id="${colab.id}"/>
                       <label for="toggle-${colab.id}" class="toggle-label block overflow-hidden h-6 rounded-full bg-emerald-500 cursor-pointer shadow-inner"></label>
                   </div>`
                : `<div class="relative inline-block w-12 mr-2 align-middle select-none transition duration-200 ease-in">
                       <input type="checkbox" name="toggle" id="toggle-${colab.id}" class="checkin-checkbox toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer" data-id="${colab.id}"/>
                       <label for="toggle-${colab.id}" class="toggle-label block overflow-hidden h-6 rounded-full bg-slate-300 cursor-pointer shadow-inner"></label>
                   </div>`;

            const row = document.createElement('tr');
            row.className = "border-b hover:bg-slate-50 transition-colors duration-150";
            
            // Solução para Mobile: Exibir o cargo embaixo do nome caso a coluna principal suma (md:hidden)
            row.innerHTML = `
                <td class="p-3">
                    <div class="font-bold text-sm text-slate-800 truncate max-w-[140px] sm:max-w-xs">${escapeHTML(colab.nome)}</div>
                    <div class="text-[9px] sm:text-[10px] text-slate-500 uppercase mt-0.5 tracking-wider">${colab.tipo_id}: ${colab.identificador}</div>
                    <div class="text-[10px] font-black uppercase mt-1 md:hidden ${isDef ? 'text-blue-500' : 'text-slate-400'}">${escapeHTML(colab.cargo)}</div>
                </td>
                <td class="p-3 text-center align-middle">
                    ${statusCheckbox}
                </td>
                <td class="p-3 hidden md:table-cell text-xs font-semibold text-slate-600">${escapeHTML(colab.cargo)}</td>
                <td class="p-3 text-center text-xs font-black text-slate-400">${colab.horario || '--:--'}</td>
                <td class="p-3 text-center flex justify-center gap-2 mt-1 sm:mt-2">
                    <button onclick="CollaboratorService.editCollaborator(window.app, '${colab.id}')" class="text-blue-600 hover:text-white hover:bg-blue-500 bg-blue-50 p-2 sm:p-1.5 rounded-lg transition-colors shadow-sm" title="Editar">✏️</button>
                    <button onclick="CollaboratorService.deleteCollaborator(window.app, '${colab.id}')" class="text-red-500 hover:text-white hover:bg-red-500 bg-red-50 p-2 sm:p-1.5 rounded-lg transition-colors shadow-sm" title="Excluir">🗑️</button>
                </td>
            `;
            tbody.appendChild(row);
        });

        if (!document.getElementById('toggle-css-colaboradores')) {
            const style = document.createElement('style');
            style.id = 'toggle-css-colaboradores';
            style.innerHTML = `
                .toggle-checkbox:checked { right: 0; border-color: #10b981; }
                .toggle-checkbox:checked + .toggle-label { background-color: #10b981; }
                .toggle-checkbox { right: 0; z-index: 1; border-color: #cbd5e1; transition: all 0.2s ease; }
            `;
            document.head.appendChild(style);
        }

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
                
                const label = e.target.nextElementSibling;
                if(pres) {
                    label.classList.replace('bg-slate-300', 'bg-emerald-500');
                } else {
                    label.classList.replace('bg-emerald-500', 'bg-slate-300');
                }

                await updateDoc(doc(app.db, "pautas", app.currentPauta.id, "collaborators", id), { presente: pres, horario: hor });
            };
        });

        const btnSaveAta = document.getElementById('save-ata-data-btn');
        if (btnSaveAta) {
            btnSaveAta.onclick = null; 
            btnSaveAta.onclick = (e) => {
                e.preventDefault();
                this.saveAtaData(app);
            };
        }

        const btnOpenAtaModal = document.getElementById('btn-gerar-ata-social');
        if (btnOpenAtaModal) {
            const oldHandler = btnOpenAtaModal.onclick;
            btnOpenAtaModal.onclick = (e) => {
                this.loadAtaData(app);
                const modal = document.getElementById('ata-social-modal');
                if (modal) modal.classList.remove('hidden');
                if (oldHandler) oldHandler(e);
            };
        }

        const btnBuscarMaster = document.getElementById('buscar-master-btn');
        if (btnBuscarMaster) {
            btnBuscarMaster.onclick = () => {
                const identificador = document.getElementById('collaborator-identificador-modal')?.value;
                if(identificador) this.buscarColaboradorMaster(app, identificador);
            };
        }
    },

    async editCollaborator(app, id) {
        const snap = await getDoc(doc(app.db, "pautas", app.currentPauta.id, "collaborators", id));
        if (snap.exists()) {
            const c = snap.data();
            this.editId = id;
            document.getElementById('collaborator-name-modal').value = c.nome || '';
            document.getElementById('collaborator-role-modal').value = c.cargo || '';
            document.getElementById('collaborator-identificador-modal').value = c.identificador || '';
            document.getElementById('collaborator-team-modal').value = c.equipe || '';
            
            const phoneInput = document.getElementById('collaborator-phone-modal');
            if (phoneInput) phoneInput.value = c.telefone || '';
            
            const emailInput = document.getElementById('collaborator-email-modal');
            if (emailInput) emailInput.value = c.email || '';

            const btnSubmit = document.getElementById('add-collaborator-btn-modal');
            if (btnSubmit) {
                btnSubmit.innerHTML = "💾 Atualizar Cadastro";
                btnSubmit.className = "w-full bg-violet-600 text-white font-black py-4 rounded-xl hover:bg-violet-700 transition shadow-lg uppercase tracking-widest text-sm";
            }
            this.configurarLogicaCargo();
            
            document.getElementById('collaborators-modal').querySelector('.scrollable-content').scrollTo({ top: 0, behavior: 'smooth' });
        }
    },

    async deleteCollaborator(app, id) {
        if (confirm("Remover este membro da equipe atual?")) {
            await deleteDoc(doc(app.db, "pautas", app.currentPauta.id, "collaborators", id));
            showNotification("Membro removido da pauta!", "success");
        }
    },

    gerarAta(app) {
        const filtrados = this.filtrarParaAta(app.colaboradores);
        if (filtrados.length === 0) return null;

        let html = `<div style="font-family: sans-serif;"><h3>LISTA DE PRESENÇA - SIGAP</h3><table border="1" style="width:100%; border-collapse: collapse;">`;
        html += `<thead><tr><th>Nome</th><th>Cargo</th><th>Equipe</th><th>Horário</th></tr></thead><tbody>`;
        
        this.ordenarColaboradores(filtrados).forEach(c => {
            html += `<tr><td>${c.nome}</td><td>${c.cargo}</td><td>${c.equipe}</td><td>${c.horario}</td></tr>`;
        });
        
        html += `</tbody></table><p style="font-size:10px; text-align:center;">Gerado automaticamente pelo SIGAP</p></div>`;
        return html;
    },

    resetForm() {
        document.getElementById('collaborator-form-modal')?.reset();
        this.editId = null;
        const btnSubmit = document.getElementById('add-collaborator-btn-modal');
        if (btnSubmit) {
            btnSubmit.innerHTML = "➕ Adicionar à Equipe";
            btnSubmit.className = "w-full bg-emerald-600 text-white font-black py-4 rounded-xl hover:bg-emerald-700 transition shadow-lg uppercase tracking-widest text-sm";
        }
        this.configurarLogicaCargo();
    }
};

export default CollaboratorService;
window.CollaboratorService = CollaboratorService;
