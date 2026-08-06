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
    LOGO_URL: 'https://firebasestorage.googleapis.com/v0/b/pauta-ce162.firebasestorage.app/o/logo_defensoria%20(1)%20(1).png?alt=media&token=7a4eeaf6-9a96-40b2-8b38-27651627bba7',
    ataAutoSaveTimer: null,

    async exportarPDFCustomizado(app) {
        const checks = document.querySelectorAll('.pdf-col-selector:checked');
        const camposEscolhidos = Array.from(checks).map(el => el.value);
        
        if (camposEscolhidos.length === 0) {
            showNotification("Selecione pelo menos um campo para o PDF", "warning");
            return;
        }

        await window.PDFService.generateCollaboratorsPDF({
            colaboradores: app.colaboradores, 
            pautaNome: app.currentPauta.name, 
            colunas: camposEscolhidos
        });
    },

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

        const confirmBtn = document.getElementById('confirm-export-pdf-btn');
        if (confirmBtn) {
            confirmBtn.onclick = async () => {
                const checks = document.querySelectorAll('#pdf-field-selector-modal .pdf-col-selector:checked');
                const camposEscolhidos = Array.from(checks).map(el => el.value);
                
                if (camposEscolhidos.length === 0) {
                    showNotification("Selecione pelo menos um campo para o PDF", "warning");
                    return;
                }

                await window.PDFService.generateCollaboratorsPDF({
                    colaboradores: app.colaboradores, 
                    pautaNome: app.currentPauta.name, 
                    colunas: camposEscolhidos
                });
                
                modal.classList.add('hidden');
            };
        }
    },

    // ⭐ MODAL COMPLETO DE BUSCA NA BASE MASTER (O MAIS GARANTIDO) ⭐
    async abrirModalListagemMaster(app) {
        let modal = document.getElementById('master-list-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'master-list-modal';
            modal.className = 'fixed inset-0 bg-black bg-opacity-70 z-[9999] flex items-center justify-center hidden backdrop-blur-sm';
            modal.innerHTML = `
                <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden flex flex-col h-[85vh]">
                    <div class="bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-5 flex justify-between items-center shrink-0">
                        <h3 class="text-white font-black text-xl flex items-center gap-2">
                            <span>👥</span> Base Geral de Colaboradores
                        </h3>
                        <button onclick="document.getElementById('master-list-modal').classList.add('hidden')" class="text-white hover:text-violet-200 text-3xl font-bold leading-none transition-colors">&times;</button>
                    </div>
                    
                    <div class="p-5 bg-slate-50 border-b border-slate-200 shrink-0">
                        <div class="relative">
                            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <svg class="h-5 w-5 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                                    <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd" />
                                </svg>
                            </div>
                            <input type="text" id="search-master-list" placeholder="Pesquisar por Nome, Matrícula ou Cargo..." class="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-violet-200 focus:outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-500/20 text-slate-700 font-medium transition-all">
                        </div>
                        <p class="text-xs text-slate-500 mt-2 ml-1">Mostrando todos os registros do banco de dados.</p>
                    </div>
                    
                    <div class="overflow-y-auto p-2 sm:p-5 flex-1 bg-white" id="master-list-container">
                        <div class="flex flex-col items-center justify-center h-full text-slate-400">
                            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-600 mb-4"></div>
                            <p class="font-medium">Carregando colaboradores...</p>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            // Filtro em tempo real inteligente
            document.getElementById('search-master-list').addEventListener('input', (e) => {
                const termo = e.target.value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const itens = document.querySelectorAll('.master-item-row');
                
                itens.forEach(item => {
                    // Pega o texto e remove acentos para busca flexível
                    const texto = item.getAttribute('data-search').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    if (texto.includes(termo)) {
                        item.style.display = 'flex';
                    } else {
                        item.style.display = 'none';
                    }
                });
            });
        }

        modal.classList.remove('hidden');
        document.getElementById('search-master-list').value = ''; // limpa busca
        const container = document.getElementById('master-list-container');
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full text-slate-400">
                <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-600 mb-4"></div>
                <p class="font-medium">Carregando colaboradores da nuvem...</p>
            </div>
        `;

        try {
            const querySnapshot = await getDocs(collection(app.db, "colaboradores_gerais"));
            if (querySnapshot.empty) {
                container.innerHTML = `
                    <div class="flex flex-col items-center justify-center h-full text-slate-400">
                        <span class="text-4xl mb-2">📭</span>
                        <p class="text-center font-medium">Nenhum colaborador cadastrado na base de dados.</p>
                    </div>
                `;
                return;
            }

            // Converter para array para ordenar
            const colaboradoresMaster = [];
            querySnapshot.forEach((docSnap) => {
                colaboradoresMaster.push({ id: docSnap.id, ...docSnap.data() });
            });

            // Ordena alfabeticamente
            colaboradoresMaster.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

            let listaHtml = [];
            colaboradoresMaster.forEach((dados) => {
                const tipoId = dados.tipo_id || 'ID';
                const cargo = dados.cargo || 'Membro';
                const equipeStr = dados.equipe ? ` • Eq. ${dados.equipe}` : '';
                const searchString = `${dados.nome} ${dados.id} ${cargo} ${dados.equipe || ''}`;
                
                listaHtml.push(`
                    <div class="master-item-row flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 mb-3 border border-slate-200 hover:border-violet-300 hover:bg-violet-50 hover:shadow-md rounded-xl cursor-pointer transition-all duration-200 group" 
                         data-id="${dados.id}"
                         data-search="${escapeHTML(searchString)}">
                        
                        <div class="flex-1 mb-3 sm:mb-0">
                            <div class="font-black text-slate-800 text-lg group-hover:text-violet-700 transition-colors">${escapeHTML(dados.nome || 'Sem Nome')}</div>
                            <div class="text-sm font-semibold text-slate-500 mt-1 flex flex-wrap gap-2 items-center">
                                <span class="bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">${escapeHTML(cargo)}</span>
                                <span>${tipoId}: <strong class="text-slate-700">${dados.id}</strong></span>
                                <span class="text-slate-400">${escapeHTML(equipeStr)}</span>
                            </div>
                        </div>
                        
                        <button class="w-full sm:w-auto bg-white border-2 border-violet-200 text-violet-700 hover:bg-violet-600 hover:border-violet-600 hover:text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-sm flex items-center justify-center gap-2">
                            <span>Preencher</span>
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                        </button>
                    </div>
                `);
            });

            container.innerHTML = listaHtml.join('');

            // Adiciona evento de clique para preencher o formulário
            container.querySelectorAll('.master-item-row').forEach(row => {
                row.onclick = async () => {
                    const id = row.dataset.id;
                    modal.classList.add('hidden');
                    
                    const inputIdentificador = document.getElementById('collaborator-identificador-modal');
                    if (inputIdentificador) {
                        inputIdentificador.value = id;
                        await this.buscarColaboradorMaster(app, id);
                    }
                };
            });

            // Foca no campo de busca ao abrir
            setTimeout(() => {
                document.getElementById('search-master-list').focus();
            }, 100);

        } catch (error) {
            console.error("Erro ao listar master:", error);
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center h-full text-red-500">
                    <span class="text-4xl mb-2">⚠️</span>
                    <p class="text-center font-bold">Erro ao carregar dados do banco.</p>
                </div>
            `;
        }
    },

    async buscarColaboradorMaster(app, identificador) {
        const idLimpo = identificador.trim().split('/').pop();
        if (!idLimpo) return;

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
                showNotification(`Dados de ${dados.nome} preenchidos! ✅`, "success");
            } else {
                showNotification(`Matrícula/ID ${idLimpo} não encontrada na base geral.`, "warning");
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

    async autoSaveAtaData(app) {
        if (!app?.currentPauta?.id) return;

        if (this.ataAutoSaveTimer) {
            clearTimeout(this.ataAutoSaveTimer);
            this.ataAutoSaveTimer = null;
        }

        const data = {
            ataAcaoNome: document.getElementById('ata-acao-nome')?.value?.trim() || '',
            ataEndereco: document.getElementById('ata-endereco')?.value?.trim() || '',
            ataData: document.getElementById('ata-data')?.value || '',
            ataTotalManual: document.getElementById('ata-total')?.value || '', 
            ataOrgao: document.getElementById('ata-orgao')?.value?.trim() || '',
            ataLogoURL: this.LOGO_URL,
            ataLastUpdate: new Date().toISOString()
        };

        try {
            const pautaRef = doc(app.db, "pautas", app.currentPauta.id);
            await updateDoc(pautaRef, data);
            
            if (app.currentPautaData) {
                app.currentPautaData = { ...app.currentPautaData, ...data };
            }

            const indicator = document.getElementById('ata-save-indicator');
            if (indicator) {
                indicator.textContent = '💾 Salvo';
                indicator.className = 'text-green-600 text-xs font-semibold';
                setTimeout(() => {
                    indicator.textContent = '';
                }, 2000);
            }

        } catch (error) {
            console.error("Erro ao salvar dados da ata:", error);
            const indicator = document.getElementById('ata-save-indicator');
            if (indicator) {
                indicator.textContent = '⚠️ Erro ao salvar';
                indicator.className = 'text-red-600 text-xs font-semibold';
            }
        }
    },

    triggerAutoSave(app) {
        if (!app?.currentPauta?.id) return;

        if (this.ataAutoSaveTimer) {
            clearTimeout(this.ataAutoSaveTimer);
        }

        const indicator = document.getElementById('ata-save-indicator');
        if (indicator) {
            indicator.textContent = '💾 Salvando...';
            indicator.className = 'text-amber-600 text-xs font-semibold';
        }

        this.ataAutoSaveTimer = setTimeout(() => {
            this.autoSaveAtaData(app);
        }, 1000);
    },

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
            ataLogoURL: this.LOGO_URL,
            ataLastUpdate: new Date().toISOString()
        };

        try {
            const pautaRef = doc(app.db, "pautas", app.currentPauta.id);
            await updateDoc(pautaRef, data);
            
            if (app.currentPautaData) {
                app.currentPautaData = { ...app.currentPautaData, ...data };
            }

            this.atualizarLogoAta();
            showNotification("Dados da ata salvos com sucesso! 💾", "success");
            const modal = document.getElementById('ata-social-modal');
            if (modal) modal.classList.add('hidden');
        } catch (error) {
            console.error("Erro ao salvar dados da ata:", error);
            showNotification("Erro ao salvar dados no banco.", "error");
        } finally {
            if (btnSave) btnSave.disabled = false;
        }
    },

    atualizarLogoAta() {
        const logoImg = document.getElementById('logo-ata-social');
        if (logoImg) {
            logoImg.src = this.LOGO_URL;
            logoImg.onerror = function() {
                console.warn('Erro ao carregar logo, usando fallback');
                this.style.display = 'none';
                const fallback = document.getElementById('logo-fallback-ata');
                if (fallback) fallback.style.display = 'block';
            };
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

                this.atualizarLogoAta();
            }
        } catch (error) {
            console.error("Erro ao carregar dados da ata:", error);
        }
    },

    configurarAutoSaveAta(app) {
        const campos = ['ata-acao-nome', 'ata-endereco', 'ata-data', 'ata-total', 'ata-orgao'];
        
        campos.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.removeEventListener('input', this._boundAutoSave);
                el.removeEventListener('change', this._boundAutoSave);
                
                el.addEventListener('input', () => this.triggerAutoSave(app));
                el.addEventListener('change', () => this.triggerAutoSave(app));
            }
        });

        const btnSave = document.getElementById('save-ata-data-btn');
        if (btnSave) {
            btnSave.removeEventListener('click', btnSave.onclickBackup);
            const handler = (e) => {
                e.preventDefault();
                this.saveAtaData(app);
            };
            btnSave.addEventListener('click', handler);
            btnSave.onclickBackup = handler;
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
            
            // Atualiza a master database sempre que salva/edita
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
                    </td>
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

        const btnOpenAtaModal = document.getElementById('btn-gerar-ata-social');
        if (btnOpenAtaModal) {
            btnOpenAtaModal.onclick = () => {
                this.loadAtaData(app);
                const modal = document.getElementById('ata-social-modal');
                if (modal) modal.classList.remove('hidden');
                
                setTimeout(() => {
                    this.configurarAutoSaveAta(app);
                    this.atualizarLogoAta();
                }, 100);
            };
        }

        // ⭐ QUANDO CLICA EM BUSCAR, ABRE O MODAL COM A LISTA DE TODOS ⭐
        const btnBuscarMaster = document.getElementById('buscar-master-btn');
        if (btnBuscarMaster) {
            // Remove comportamento anterior e garante que abra o modal
            const clone = btnBuscarMaster.cloneNode(true);
            btnBuscarMaster.parentNode.replaceChild(clone, btnBuscarMaster);
            
            clone.onclick = (e) => {
                e.preventDefault();
                this.abrirModalListagemMaster(app);
            };
        }

        // O botão listar-master-btn se existir, faz a mesma coisa
        const btnListarMaster = document.getElementById('listar-master-btn');
        if (btnListarMaster) {
            btnListarMaster.onclick = (e) => {
                e.preventDefault();
                this.abrirModalListagemMaster(app);
            };
        }

        const modal = document.getElementById('ata-social-modal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.add('hidden');
                }
            });
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

        let html = `
            <div style="font-family: sans-serif; max-width: 100%;">
                <div style="text-align: center; margin-bottom: 20px; padding: 10px; border-bottom: 3px solid #1a56db;">
                    <img src="${this.LOGO_URL}" alt="Logo Defensoria" style="max-height: 80px; width: auto; margin: 0 auto; display: block;" onerror="this.style.display='none'">
                    <h3 style="margin-top: 10px; color: #1a56db;">LISTA DE PRESENÇA - SIGEP</h3>
                    <p style="font-size: 12px; color: #666;">Sistema Integrado de Gestão de Pautas</p>
                </div>
                <table border="1" style="width:100%; border-collapse: collapse; font-size: 12px;">
                    <thead>
                        <tr style="background-color: #1a56db; color: white;">
                            <th style="padding: 8px;">Nome</th>
                            <th style="padding: 8px;">Cargo</th>
                            <th style="padding: 8px;">Equipe</th>
                            <th style="padding: 8px;">Horário</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        this.ordenarColaboradores(filtrados).forEach(c => {
            html += `<tr>
                <td style="padding: 6px;">${escapeHTML(c.nome)}</td>
                <td style="padding: 6px;">${escapeHTML(c.cargo)}</td>
                <td style="padding: 6px;">${escapeHTML(c.equipe)}</td>
                <td style="padding: 6px; text-align: center;">${c.horario || '--:--'}</td>
            </tr>`;
        });
        
        html += `
                    </tbody>
                </table>
                <div style="margin-top: 15px; font-size: 10px; text-align: center; color: #888; border-top: 1px solid #ddd; padding-top: 10px;">
                    <p>Gerado automaticamente pelo SIGEP em ${new Date().toLocaleString('pt-BR')}</p>
                </div>
            </div>
        `;
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

