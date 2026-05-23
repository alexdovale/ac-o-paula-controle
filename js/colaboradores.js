// js/colaboradores.js - EQUIPE E PRESENÇA (OTIMIZADO E BLINDADO PARA SIGEP)

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

    // ⭐ FUNÇÃO DE EXPORTAR PDF PERSONALIZADO ⭐
    async exportarPDFCustomizado(app) {
        // 1. CAPTURA OS CHECKBOXES DA TELA
        const checks = document.querySelectorAll('.pdf-col-selector:checked');
        const camposEscolhidos = Array.from(checks).map(el => el.value);
        
        if (camposEscolhidos.length === 0) {
            showNotification("Selecione pelo menos um campo para o PDF", "warning");
            return;
        }

        // 2. CHAMA O PDF COM A LISTA FILTRADA (USANDO O FORMATO DE OBJETO)
        await window.PDFService.generateCollaboratorsPDF({
            colaboradores: app.colaboradores, 
            pautaNome: app.currentPauta.name, 
            colunas: camposEscolhidos
        });
    },

    // Abre modal de configuração do PDF
    abrirModalExportacaoPDF(app) {
        let modal = document.getElementById('export-pdf-config-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'export-pdf-config-modal';
            modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center hidden';
            modal.innerHTML = `
                <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
                    <div class="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-4 flex justify-between items-center">
                        <h3 class="text-white font-bold text-lg">📄 Configurar Exportação PDF</h3>
                        <button onclick="document.getElementById('export-pdf-config-modal').classList.add('hidden')" class="text-white hover:text-gray-200 text-2xl">&times;</button>
                    </div>
                    <div class="p-6">
                        <p class="text-sm text-slate-600 mb-4">Selecione os campos que deseja incluir no PDF:</p>
                        <div id="pdf-field-selector-modal" class="mb-6"></div>
                        <div class="flex gap-3">
                            <button id="confirm-export-pdf-btn" class="flex-1 bg-emerald-600 text-white font-bold py-3 rounded-xl hover:bg-emerald-700 transition">
                                Gerar PDF
                            </button>
                            <button onclick="document.getElementById('export-pdf-config-modal').classList.add('hidden')" class="flex-1 bg-slate-200 text-slate-700 font-bold py-3 rounded-xl hover:bg-slate-300 transition">
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        // Renderiza os checkboxes no modal
        const container = document.getElementById('pdf-field-selector-modal');
        if (container) {
            const campos = [
                { value: 'nome', label: 'Nome', default: true },
                { value: 'cargo', label: 'Cargo', default: true },
                { value: 'equipe', label: 'Equipe', default: true },
                { value: 'identificador', label: 'Matrícula/ID', default: false },
                { value: 'telefone', label: 'Telefone', default: false },
                { value: 'email', label: 'E-mail', default: false },
                { value: 'transporte', label: 'Transporte', default: false },
                { value: 'horario', label: 'Horário de Chegada', default: true }
            ];

            container.innerHTML = campos.map(campo => `
                <label class="flex items-center space-x-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer mb-2">
                    <input type="checkbox" 
                           class="pdf-col-selector w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500" 
                           value="${campo.value}" 
                           ${campo.default ? 'checked' : ''}>
                    <span class="text-sm text-slate-700 font-medium">${campo.label}</span>
                </label>
            `).join('');
        }

        // Configura o botão de confirmação
        const confirmBtn = document.getElementById('confirm-export-pdf-btn');
        if (confirmBtn) {
            confirmBtn.onclick = async () => {
                const checks = document.querySelectorAll('#pdf-field-selector-modal .pdf-col-selector:checked');
                const camposEscolhidos = Array.from(checks).map(el => el.value);
                
                if (camposEscolhidos.length === 0) {
                    showNotification("Selecione pelo menos um campo para o PDF", "warning");
                    return;
                }

                // -> MUDANÇA AQUI TAMBÉM: Enviando como um objeto {}
                await window.PDFService.generateCollaboratorsPDF({
                    colaboradores: app.colaboradores, 
                    pautaNome: app.currentPauta.name, 
                    colunas: camposEscolhidos
                });
                
                modal.classList.add('hidden');
            };
        }
    }, // <-- AQUI ESTÁ A VÍRGULA QUE FALTAVA!

    async buscarColaboradorMaster(app, identificador) {
        const idLimpo = identificador.trim().split('/').pop();
        if (!idLimpo || idLimpo.length < 3) return;

        try {
            const masterRef = doc(app.db, "colaboradores_gerais", idLimpo);
            const snap = await getDoc(masterRef);

            if (snap.exists()) {
                const dados = snap.data();
                
                const nomeEl = document.getElementById('collaborator-name-modal');
                if (nomeEl) nomeEl.value = dados.nome || '';
                
                const roleEl = document.getElementById('collaborator-role-modal');
                if (roleEl) roleEl.value = dados.cargo || 'Defensor(a)';
                
                const teamEl = document.getElementById('collaborator-team-modal');
                if (teamEl) teamEl.value = dados.equipe || '1';
                
                const phoneEl = document.getElementById('collaborator-phone-modal');
                if (phoneEl) phoneEl.value = dados.telefone || '';
                
                const emailEl = document.getElementById('collaborator-email-modal');
                if (emailEl) emailEl.value = dados.email || '';
                
                const rTransp = document.querySelector(`input[name="transporte-colaborador"][value="${dados.transporte || 'Meios Próprios'}"]`);
                if (rTransp) rTransp.checked = true;

                this.configurarLogicaCargo(); 
                showNotification("Dados recuperados da base master! ✅", "success");
            }
        } catch (e) {
            console.error("Erro ao buscar master:", e);
        }
    },

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

    copyDashboardLink(nomeColab) {
        if (!window.app || !window.app.currentPauta) return;
        let baseUrl = window.location.href.split('?')[0]; 
        baseUrl = baseUrl.substring(0, baseUrl.lastIndexOf('/')); 
        if(!baseUrl) baseUrl = window.location.origin; 
        
        const link = `${baseUrl}/atendimento_externo.html?pautaId=${window.app.currentPauta.id}&colab=${encodeURIComponent(nomeColab)}&view=dashboard`;
        
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(link).then(() => {
                showNotification(`Link da mesa de ${nomeColab} copiado!`, "success");
            }).catch(() => { prompt("Copie o link abaixo para enviar:", link); });
        } else {
            prompt("Copie o link abaixo para enviar ao colaborador:", link);
        }
    },

    // ⭐ ATA PERSISTENTE E FUNCIONAL ⭐
    async saveAtaData(app) {
        if (!app?.currentPauta?.id) {
            showNotification("Selecione uma pauta primeiro", "error");
            return;
        }

        const btnSave = document.getElementById('save-ata-data-btn');
        if (btnSave) btnSave.disabled = true;

        const data = {
            ataAcaoNome: document.getElementById('ata-acao-nome')?.value?.trim() || '',
            ataEndereco: document.getElementById('ata-endereco')?.value?.trim() || '',
            ataData: document.getElementById('ata-data')?.value || '',
            ataTotalManual: document.getElementById('ata-total')?.value || '',
            ataOrgao: document.getElementById('ata-orgao')?.value?.trim() || '',
            ataLastUpdate: new Date().toISOString()
        };

        try {
            const pautaRef = doc(app.db, "pautas", app.currentPauta.id);
            await updateDoc(pautaRef, data);
            
            if (app.currentPautaData) {
                app.currentPautaData = { ...app.currentPautaData, ...data };
            }

            showNotification("Dados do evento salvos com sucesso! 💾", "success");
            const modal = document.getElementById('ata-social-modal');
            if (modal) modal.classList.add('hidden');
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
                
                const acaoEl = document.getElementById('ata-acao-nome');
                if (acaoEl) acaoEl.value = data.ataAcaoNome || app.currentPauta.name || '';
                
                const endEl = document.getElementById('ata-endereco');
                if (endEl) endEl.value = data.ataEndereco || '';
                
                const dataEl = document.getElementById('ata-data');
                if (dataEl) dataEl.value = data.ataData || '';
                
                const totalEl = document.getElementById('ata-total');
                if (totalEl) totalEl.value = data.ataTotalManual || '';
                
                const orgaoEl = document.getElementById('ata-orgao');
                if (orgaoEl) orgaoEl.value = data.ataOrgao || '';
            }
        } catch (error) {
            console.error("Erro ao carregar dados da ata:", error);
        }
    },

    openModal(app) {
        const modal = document.getElementById('collaborators-modal');
        if (!modal) return;

        modal.classList.remove('hidden');
        this.resetForm();
        this.updateTeamSelect();
        this.configurarLogicaCargo();
        this.adicionarBotaoOrdenacao();
        this.adicionarBotaoExportacaoPDF(app);
        
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
        btn.className = 'w-full md:w-auto bg-white hover:bg-slate-50 text-slate-700 font-bold px-4 py-3 md:py-2 rounded-xl text-sm mb-4 transition-colors border border-slate-200 shadow-sm flex items-center justify-center';
        btn.innerHTML = this.ordemAtual === 'grupo' ? '<span class="mr-2">📁</span> Ordenar por Grupo' : '<span class="mr-2">🔤</span> Ordenar por Nome';
        btn.onclick = () => this.toggleOrdem();
        container.parentElement.insertBefore(btn, container);
    },

    adicionarBotaoExportacaoPDF(app) {
        const btnExistente = document.getElementById('export-pdf-custom-btn');
        if (btnExistente) btnExistente.remove();

        const modalHeader = document.querySelector('#collaborators-modal .bg-white .flex-between');
        if (!modalHeader) return;

        const btnExport = document.createElement('button');
        btnExport.id = 'export-pdf-custom-btn';
        btnExport.className = 'bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-lg transition-colors shadow-md flex items-center gap-2 text-sm';
        btnExport.innerHTML = '📄 Exportar PDF Personalizado';
        btnExport.onclick = () => this.abrirModalExportacaoPDF(app);
        
        modalHeader.appendChild(btnExport);
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
                const trGrupo = document.createElement('tr');
                trGrupo.innerHTML = `
                    <td colspan="5" class="bg-violet-50 p-3 border-y border-violet-200 text-left">
                        <div class="font-black text-violet-900 text-[10px] sm:text-xs uppercase tracking-widest flex items-center gap-2">
                            <span>📁</span> Equipe ${escapeHTML(ultimoGrupo)}
                        </div>
                    </table>
                `;
                tbody.appendChild(trGrupo);
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
                <td class="p-3 text-center flex justify-center gap-1.5 mt-1 sm:mt-2">
                    <button onclick="CollaboratorService.copyDashboardLink('${escapeHTML(colab.nome)}')" class="text-emerald-600 hover:text-white hover:bg-emerald-500 bg-emerald-50 p-2 sm:p-1.5 rounded-lg transition-colors shadow-sm" title="Copiar Link da Mesa Silenciosa">🔗</button>
                    <button onclick="CollaboratorService.editCollaborator(window.app, '${colab.id}')" class="text-blue-600 hover:text-white hover:bg-blue-500 bg-blue-50 p-2 sm:p-1.5 rounded-lg transition-colors shadow-sm" title="Editar">✏️</button>
                    <button onclick="CollaboratorService.deleteCollaborator(window.app, '${colab.id}')" class="text-red-500 hover:text-white hover:bg-red-500 bg-red-50 p-2 sm:p-1.5 rounded-lg transition-colors shadow-sm" title="Excluir">🗑️</button>
                </td>
            `;
            tbody.appendChild(row);
        });

        // Initialize Styles
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

        const totalParts = document.getElementById('total-participants-count');
        if (totalParts) totalParts.textContent = app.colaboradores.length;
        
        const selfCount = document.getElementById('self-transport-count');
        if (selfCount) selfCount.textContent = selfT;
        
        const compCount = document.getElementById('company-transport-count');
        if (compCount) compCount.textContent = compT;
        
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
            btnSaveAta.removeEventListener('click', btnSaveAta.onclickBackup);
            const handler = (e) => {
                e.preventDefault();
                this.saveAtaData(app);
            };
            btnSaveAta.addEventListener('click', handler);
            btnSaveAta.onclickBackup = handler;
        }

        const btnOpenAtaModal = document.getElementById('btn-gerar-ata-social');
        if (btnOpenAtaModal) {
            btnOpenAtaModal.onclick = () => {
                this.loadAtaData(app);
                const modal = document.getElementById('ata-social-modal');
                if (modal) modal.classList.remove('hidden');
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
            
            const n = document.getElementById('collaborator-name-modal');
            if (n) n.value = c.nome || '';
            
            const r = document.getElementById('collaborator-role-modal');
            if (r) r.value = c.cargo || '';
            
            const i = document.getElementById('collaborator-identificador-modal');
            if (i) i.value = c.identificador || '';
            
            const t = document.getElementById('collaborator-team-modal');
            if (t) t.value = c.equipe || '';
            
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
            
            const scrollArea = document.getElementById('collaborators-modal')?.querySelector('.scrollable-content');
            if (scrollArea) scrollArea.scrollTo({ top: 0, behavior: 'smooth' });
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

        let html = `<div style="font-family: sans-serif;"><h3>LISTA DE PRESENÇA - SIGEP</h3><table border="1" style="width:100%; border-collapse: collapse;">`;
        html += `<thead><tr><th>Nome</th><th>Cargo</th><th>Equipe</th><th>Horário</th></tr></thead><tbody>`;
        
        this.ordenarColaboradores(filtrados).forEach(c => {
            html += `<tr><td>${c.nome}</td><td>${c.cargo}</td><td>${c.equipe}</td><td>${c.horario}</td></tr>`;
        });
        
        html += `</tbody></table><p style="font-size:10px; text-align:center;">Gerado automaticamente pelo SIGEP</p></div>`;
        return html;
    },

    resetForm() {
        const form = document.getElementById('collaborator-form-modal');
        if (form) form.reset();
        
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
