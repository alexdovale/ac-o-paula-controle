import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, query, where, getDoc, getDocs, writeBatch, arrayUnion, arrayRemove, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { firebaseConfig } from './config.js';
import { AuthService } from './auth.js';
import { PautaService } from './pauta.js';
import { UIService } from './ui.js';
import CollaboratorService from './colaboradores.js';         
import { ModalService } from './modal.js?v=20260313';
import { NotesService } from './notes.js?v=20260313';
import { StatisticsService } from './estatisticas.js?v=20260313';
import { PDFService } from './pdfService.js?v=novo_pdf_v2';
import { EmailService } from './emailService.js?v=20260313';
import { escapeHTML, showNotification, normalizeText, copyToClipboard, formatTime, playSound } from './utils.js?v=20260313';
import { setupDetailsModal, openDetailsModal } from './detalhes.js';
import { DashboardService } from './dashboardService.js';
import { subjectTree, flatSubjects } from './assuntos.js';
import { showConfirmModal } from './confirmModal.js';
import { logAction, loadUsersList, cleanupOldData, approveUser, updateUserRole, deleteUser, loadAuditLogs, exportAuditLogsPDF, loadDashboardData, populateUserFilter } from './admin.js';
import { parsePautaCSV } from './csvHandler.js';
import { getChecklistHTML } from './checklist.js';
import { PainelGeralService } from './painelGeralService.js'; 

class SIGEPApp { 
    constructor() {
        this.db = null;
        this.auth = null;
        this.currentUser = null;
        this.currentPauta = null;
        this.currentPautaData = null;
        this.allAssisted = [];
        this.colaboradores = [];
        this.currentUserName = '';
        this.currentPautaOwnerId = null;
        this.isPautaClosed = false;
        this.customRoomsList = [];
        this.unsubscribeFromAttendances = null;
        this.unsubscribeFromCollaborators = null;
        this.currentPautaFilter = 'all';
        this.monitorInterval = null; 
        
        this.init();
    }

    async init() {
        try {
            const app = initializeApp(firebaseConfig);
            this.db = getFirestore(app);
            this.auth = getAuth(app);

            DashboardService.init(this);

            await this.setupOfflinePersistence();
            this.setupEventListeners();
            this.setupAuthListener();
            
            setupDetailsModal({ db: this.db });
            this.loadExternalModalsContent();
            
        } catch (error) {
            console.error("Erro na inicialização:", error);
            showNotification("Erro ao iniciar o sistema SIGEP", "error");
        }
    }

    async loadExternalModalsContent() {
        const modalsToLoad = [
            { selector: '#policy-content', url: './politica.html' },
            { selector: '#manual-modal .scrollable-content', url: './manual.html' },
            { selector: '#terms-modal .scrollable-content', url: './termos.html' }
        ];

        for (const item of modalsToLoad) {
            try {
                const response = await fetch(item.url);
                if (response.ok) {
                    const html = await response.text();
                    const container = document.querySelector(item.selector);
                    if (container) {
                        container.innerHTML = html; 
                    }
                } else {
                    console.warn(`Arquivo não encontrado (local): ${item.url}. Usando os textos padrão embutidos.`);
                }
            } catch (error) {
                console.error(`Erro ao tentar buscar ${item.url}:`, error);
            }
        }
    }

    setupOfflinePersistence() {
        try {
            enableIndexedDbPersistence(this.db, { synchronizeTabs: true }).catch((err) => {
                if (err.code == 'failed-precondition') {
                    console.warn('⚠️ Persistência desativada: Múltiplas abas abertas.');
                    showNotification('Múltiplas abas detectadas. Feche outras abas para evitar erros no modo offline.', 'warning');
                } else if (err.code == 'unimplemented') {
                    console.warn('⚠️ Navegador não suporta persistência offline.');
                } else {
                    console.error('⚠️ Falha de integridade ou corrupção no cache local IndexedDB. Forçando inicialização estritamente online.', err.message);
                }
            });
        } catch (e) {
            console.log("Erro ao ativar persistência:", e);
        }
    
        window.addEventListener('offline', () => {
            document.getElementById('offline-indicator').classList.remove('hidden');
        });
    
        window.addEventListener('online', () => {
            document.getElementById('offline-indicator').classList.add('hidden');
            showNotification("Conexão restabelecida!", "success");
            playSound('notification');
        });
    }

    setupAuthListener() {
        onAuthStateChanged(this.auth, async (user) => {
            if (user) {
                await AuthService.handleAuthState(this, user);
                await this.loadUserPreferences(); 
                this.applyRoleBasedUI(); 
                
                const lastPautaId = localStorage.getItem('lastPautaId');
                const lastPautaName = localStorage.getItem('lastPautaName');
                const lastPautaType = localStorage.getItem('lastPautaType');

                if (lastPautaId) {
                    console.log("🔄 Restaurando sessão anterior SIGEP: ", lastPautaName);
                    this.loadPauta(lastPautaId, lastPautaName || 'Pauta', lastPautaType || 'agendamento');
                } else {
                    this.showPautaSelectionScreen();
                }

            } else {
                UIService.showScreen('login');
                document.getElementById('admin-panel-btn')?.classList.add('hidden');
                document.getElementById('admin-btn-main')?.classList.add('hidden');
            }
        });
    }

    setupEventListeners() {
        document.getElementById('login-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            AuthService.login(this);
        });

        document.getElementById('register-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            AuthService.register(this);
        });

        document.getElementById('forgot-password-link')?.addEventListener('click', (e) => {
            e.preventDefault();
            AuthService.resetPassword(this.auth);
        });

        document.getElementById('login-tab-btn')?.addEventListener('click', () => {
            UIService.toggleAuthTabs('login');
        });

        document.getElementById('register-tab-btn')?.addEventListener('click', () => {
            UIService.toggleAuthTabs('register');
        });

        document.querySelectorAll('#logout-btn-main, #logout-btn-app').forEach(btn => {
            if (btn) btn.addEventListener('click', () => AuthService.logout(this.auth));
        });

        document.getElementById('call-next-assisted-btn')?.addEventListener('click', () => {
            PautaService.callNextAssisted(this);
        });

        document.getElementById('view-dashboard-btn')?.addEventListener('click', () => {
            DashboardService.showDashboardScreen();
        });

        document.getElementById('dashboard-back-to-pautas-btn')?.addEventListener('click', () => {
            this.showPautaSelectionScreen();
        });        

        const pautaSettingsToggle = document.getElementById('pauta-settings-toggle');
        const pautaSettingsPanel = document.getElementById('pauta-settings-panel');
        const toggleEmAtendimento = document.getElementById('toggle-em-atendimento');
        const toggleDistribuicao = document.getElementById('toggle-distribuicao');
        const toggleFaltosos = document.getElementById('toggle-faltosos');

        if (pautaSettingsToggle && pautaSettingsPanel) {
            pautaSettingsToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                pautaSettingsPanel.classList.toggle('hidden');
                if (!pautaSettingsPanel.classList.contains('hidden')) {
                    this.loadColumnPreferences();
                }
            });

            document.addEventListener('click', (e) => {
                if (pautaSettingsPanel && !pautaSettingsPanel.contains(e.target) && !pautaSettingsToggle.contains(e.target)) {
                    pautaSettingsPanel.classList.add('hidden');
                }
            });
        }

        toggleEmAtendimento?.addEventListener('change', () => this.saveColumnPreferences());
        toggleDistribuicao?.addEventListener('change', () => this.saveColumnPreferences());
        toggleFaltosos?.addEventListener('change', () => this.saveColumnPreferences());

        document.getElementById('btn-manage-rooms')?.addEventListener('click', () => {
            const listContainer = document.getElementById('manage-rooms-list');
            if (!listContainer) return;
            
            listContainer.innerHTML = '';
            
            if (this.currentPautaData?.type === 'multisala' && this.customRoomsList && this.customRoomsList.length > 0) {
                this.customRoomsList.forEach((room) => {
                    const div = document.createElement('div');
                    div.className = "flex gap-2 items-center mb-3 bg-gray-50 p-2 rounded-lg border";
                    div.innerHTML = `
                        <span class="text-gray-500">🏢</span>
                        <input type="text" class="room-edit-input flex-1 p-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none" data-original="${escapeHTML(room)}" value="${escapeHTML(room)}">
                    `;
                    listContainer.appendChild(div);
                });
            } else {
                listContainer.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">Nenhuma sala configurada ou a pauta não é Multi-Salas.</p>';
            }
            
            document.getElementById('manage-rooms-modal')?.classList.remove('hidden');
        });

        document.getElementById('cancel-manage-rooms-btn')?.addEventListener('click', () => {
            document.getElementById('manage-rooms-modal')?.classList.add('hidden');
        });

        document.getElementById('save-manage-rooms-btn')?.addEventListener('click', async () => {
            const inputs = document.querySelectorAll('.room-edit-input');
            const newRoomsList = [];
            const roomChanges = []; 
            
            inputs.forEach(input => {
                const newName = input.value.trim();
                const oldName = input.dataset.original;
                if (newName) {
                    newRoomsList.push(newName);
                    if (newName !== oldName) {
                        roomChanges.push({ oldName, newName });
                    }
                }
            });

            if (newRoomsList.length === 0 && inputs.length > 0) {
                showNotification("A lista de salas não pode ficar vazia.", "error");
                return;
            }

            try {
                const pautaRef = doc(this.db, "pautas", this.currentPauta.id);
                await updateDoc(pautaRef, {
                    customRooms: newRoomsList,
                    rooms: newRoomsList
                });
                
                this.customRoomsList = newRoomsList;
                if (this.currentPautaData) {
                    this.currentPautaData.customRooms = newRoomsList;
                    this.currentPautaData.rooms = newRoomsList;
                }

                if (roomChanges.length > 0) {
                    const batch = writeBatch(this.db);
                    let hasChanges = false;
                    
                    this.allAssisted.forEach(assisted => {
                        if (assisted.room) {
                            const change = roomChanges.find(c => c.oldName === assisted.room);
                            if (change) {
                                const attRef = doc(this.db, "pautas", this.currentPauta.id, "attendances", assisted.id);
                                batch.update(attRef, { room: change.newName });
                                hasChanges = true;
                            }
                        }
                    });
                    
                    if (hasChanges) await batch.commit();
                }

                document.getElementById('manage-rooms-modal')?.classList.add('hidden');
                showNotification("Salas updated com sucesso!", "success");
                
                if (typeof UIService.renderAssistedLists === 'function') {
                    UIService.renderAssistedLists(this);
                }
                if (typeof PautaService.populateRoomSelects === 'function') {
                    PautaService.populateRoomSelects(this);
                }
                
            } catch (error) {
                console.error("Erro ao salvar salas:", error);
                showNotification("Erro ao atualizar salas.", "error");
            }
        });

        document.getElementById('aguardando-list')?.addEventListener('input', (e) => {
            if (e.target.classList.contains('room-search-input')) {
                const query = e.target.value.toLowerCase();
                const roomContainer = e.target.closest('.room-group-container'); 
                if (roomContainer) {
                    const cards = roomContainer.querySelectorAll('.assisted-card'); 
                    cards.forEach(card => {
                        const text = card.textContent.toLowerCase();
                        card.style.display = text.includes(query) ? '' : 'none';
                    });
                }
            }
        });

        document.getElementById('btn-metrica-atendidos')?.addEventListener('click', () => {
             const atendidos = (this.allAssisted || []).filter(a => a.status === 'atendido');
             PDFService.generateAtendidosPDF(atendidos, this.currentPauta?.name || 'Pauta');
        });

        document.getElementById('btn-gerar-ata-social')?.addEventListener('click', () => {
            if (!this.currentPauta) {
                showNotification("Nenhuma pauta selecionada!", "error");
                return;
            }
            const totalAtendidos = this.allAssisted.filter(a => a.status === 'atendido').length;
            document.getElementById('ata-acao-nome').value = this.currentPauta?.name || '';
            document.getElementById('ata-data').value = new Date().toISOString().split('T')[0];
            document.getElementById('ata-total').value = totalAtendidos;
            document.getElementById('ata-endereco').value = '';
            document.getElementById('ata-orgao').value = '';
            document.getElementById('ata-social-modal').classList.remove('hidden');
        });
        
        document.getElementById('confirm-ata-modal-btn')?.addEventListener('click', () => {
            const acaoNome = document.getElementById('ata-acao-nome')?.value.trim();
            const endereco = document.getElementById('ata-endereco')?.value.trim();
            const dataAcao = document.getElementById('ata-data')?.value;
            const orgaoNome = document.getElementById('ata-orgao')?.value.trim();
            const totalManual = document.getElementById('ata-total')?.value;
            
            if (!acaoNome || !endereco || !dataAcao || !orgaoNome || !totalManual || totalManual < 0) {
                showNotification("Preencha todos os campos corretamente.", "error");
                return;
            }
            
            const atendidos = this.allAssisted.filter(a => a.status === 'atendido');
            const dadosExtras = { acao: acaoNome, endereco: endereco, data: dataAcao, orgao: orgaoNome, totalAtendimentos: totalManual };
            
            document.getElementById('ata-social-modal').classList.add('hidden');
            
            if (confirm("Deseja VISUALIZAR a Ata antes de baixar?")) {
                PDFService.previewAtaAcaoSocial(this.currentPauta?.name, this.colaboradores, atendidos, dadosExtras);
            } else {
                PDFService.generateAtaAcaoSocial(this.currentPauta?.name, this.colaboradores, atendidos, dadosExtras);
            }
        });
        
        document.getElementById('cancel-ata-modal-btn')?.addEventListener('click', () => {
            document.getElementById('ata-social-modal').classList.add('hidden');
        });
        
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.quick-action-toggle') && !e.target.closest('.quick-menu-box')) {
                document.querySelectorAll('.quick-menu-box').forEach(menu => {
                    menu.classList.add('hidden');
                });
            }
        });

        document.querySelectorAll('input[name="is-scheduled"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const wrapper = document.getElementById('scheduled-time-wrapper');
                if (e.target.value === 'yes') wrapper.classList.remove('hidden');
                else wrapper.classList.add('hidden');
            });
        });

        document.querySelectorAll('input[name="has-arrived"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const wrapper = document.getElementById('arrival-time-wrapper');
                if (e.target.value === 'yes') {
                    wrapper.classList.remove('hidden');
                    document.getElementById('arrival-time').value = new Date().toTimeString().slice(0, 5);
                } else {
                    wrapper.classList.add('hidden');
                }
            });
        });

        document.getElementById('tab-agendamento')?.addEventListener('click', () => {
            document.getElementById('scheduled-time-wrapper').classList.add('hidden');
            document.getElementById('arrival-time-wrapper').classList.add('hidden');
            document.querySelector('input[name="is-scheduled"][value="no"]').checked = true;
            document.querySelector('input[name="has-arrived"][value="no"]').checked = true;
        });

        document.getElementById('tab-avulso')?.addEventListener('click', () => {
            document.querySelector('input[name="has-arrived"][value="yes"]').checked = true;
            document.getElementById('arrival-time-wrapper').classList.remove('hidden');
            document.getElementById('arrival-time').value = new Date().toTimeString().slice(0, 5);
            document.getElementById('scheduled-time-wrapper').classList.add('hidden');
        });

        document.getElementById('create-pauta-btn')?.addEventListener('click', () => {
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
                    this.renderCustomRooms();
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
                    this.renderCustomRooms();
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
                this.renderCustomRooms();
            }
        });

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

        document.getElementById('confirm-create-pauta-final-btn')?.addEventListener('click', async () => {
            const pautaName = document.getElementById('create-pauta-name-input').value.trim();
            const pautaType = document.getElementById('create-pauta-modal').dataset.pautaType;
            const orgaoId = document.getElementById('select-orgao-integracao').value; 
            const user = this.auth.currentUser;
            
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
                    ordemAtendimento: document.querySelector('input[name="ordemAtendimento"]:checked')?.value || 'padrao',
                    useDelegationFlow: document.querySelector('input[name="useDelegationFlow"]:checked')?.value === 'true',
                    useDistributionFlow: document.getElementById('check-use-distribution')?.checked || false
                };

                if (pautaType === 'multisala') {
                    novaPautaData.customRooms = this.customRoomsList;
                    novaPautaData.rooms = this.customRoomsList; 
                }

                const pautaRef = await addDoc(collection(this.db, "pautas"), novaPautaData);
        
                if (orgaoId) {
                    showNotification("Sincronizando com base de dados Solar/Verde...", "info");
                    const { ApiIntegration } = await import('./apiIntegration.js');
                    const assistidosOficiais = await ApiIntegration.buscarDadosPautaOficial(orgaoId);
                    
                    for (const ast of assistidosOficiais) {
                        await PautaService.addAssistedManual(this, {
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
                
                this.showPautaSelectionScreen();
                
            } catch (error) {
                console.error("Erro ao criar pauta:", error);
                showNotification("Erro ao criar pauta.", "error");
            }
        });

        document.getElementById('back-to-pautas-btn')?.addEventListener('click', () => {
            if (this.unsubscribeFromAttendances) this.unsubscribeFromAttendances();
            if (this.unsubscribeFromCollaborators) this.unsubscribeFromCollaborators();
            
            this.currentPauta = null;
            this.allAssisted = [];
            this.colaboradores = [];
            
            localStorage.removeItem('lastPautaId');
            localStorage.removeItem('lastPautaName');
            localStorage.removeItem('lastPautaType');

            if (this.monitorInterval) { clearInterval(this.monitorInterval); this.monitorInterval = null; }
            
            // Limpeza de botões órfãos ao sair
            document.querySelectorAll('[id^="btn-colabs-disponiveis-"]').forEach(btn => btn.remove());

            UIService.showScreen('pautaSelection');
            if (this.auth?.currentUser) {
                this.showPautaSelectionScreen();
            }
        });

        document.getElementById('tab-agendamento')?.addEventListener('click', () => {
            UIService.switchTab('agendamento', this);
        });
        
        document.getElementById('tab-avulso')?.addEventListener('click', () => {
            UIService.switchTab('avulso', this);
        });

        document.getElementById('actions-toggle')?.addEventListener('click', UIService.toggleActionsPanel);

        document.getElementById('btn-painel-geral-externo')?.addEventListener('click', () => {
            if (typeof PainelGeralService !== 'undefined') {
                PainelGeralService.abrirPainel(this);
                const actionsPanel = document.getElementById('actions-panel');
                if (actionsPanel) {
                    actionsPanel.classList.add('opacity-0', 'scale-95', 'pointer-events-none');
                    document.getElementById('actions-arrow')?.classList.remove('rotate-180');
                }
            } else {
                showNotification("Módulo do painel não carregado.", "error");
            }
        });
        
        document.getElementById('share-pauta-btn')?.addEventListener('click', () => {
            const modal = document.getElementById('share-modal');
            if (modal) {
                const toggle = document.getElementById('share-toggle');
                const maskCheck = document.getElementById('mask-names-check');
                
                if (this.currentPautaData) {
                    toggle.checked = this.currentPautaData.isPublic || false;
                    maskCheck.checked = this.currentPautaData.maskNames || false;
                    
                    const statusText = document.getElementById('share-status-text');
                    const linkContainer = document.getElementById('share-link-container');
                    
                    statusText.textContent = toggle.checked ? "Público" : "Privado";
                    
                    if (toggle.checked) {
                        linkContainer.classList.remove('hidden');
                        const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
                        const link = `${baseUrl}/acompanhamento.html?id=${this.currentPauta.id}`;
                        document.getElementById('share-link-input').value = link;
                        document.getElementById('open-external-btn').href = link;
                    } else {
                        linkContainer.classList.add('hidden');
                    }
                }
                modal.classList.remove('hidden');
            }
        });

        document.getElementById('share-toggle')?.addEventListener('change', async (e) => {
            const isPublic = e.target.checked;
            const statusText = document.getElementById('share-status-text');
            const linkContainer = document.getElementById('share-link-container');
            
            statusText.textContent = isPublic ? "Público" : "Privado";
            
            if (isPublic) {
                linkContainer.classList.remove('hidden');
                const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
                const link = `${baseUrl}/acompanhamento.html?id=${this.currentPauta.id}`;
                document.getElementById('share-link-input').value = link;
                document.getElementById('open-external-btn').href = link;
            } else {
                linkContainer.classList.add('hidden');
            }
            
            try {
                const pautaRef = doc(this.db, "pautas", this.currentPauta.id);
                await updateDoc(pautaRef, { isPublic: isPublic });
                this.currentPautaData.isPublic = isPublic;
                showNotification(isPublic ? "Link público ativado." : "Link público desativado.", "success");
            } catch (error) {
                console.error(error);
                showNotification("Erro ao atualizar status.", "error");
            }
        });

        document.getElementById('copy-share-link-btn')?.addEventListener('click', () => {
            const input = document.getElementById('share-link-input');
            input.select();
            navigator.clipboard.writeText(input.value);
            showNotification("Link copiado!", "info");
        });

        document.getElementById('mask-names-check')?.addEventListener('change', async (e) => {
            const mask = e.target.checked;
            try {
                const pautaRef = doc(this.db, "pautas", this.currentPauta.id);
                await updateDoc(pautaRef, { maskNames: mask });
                this.currentPautaData.maskNames = mask;
                showNotification("Configuração de privacidade updated.", "success");
            } catch (error) {
                showNotification("Erro ao salvar configuração.", "error");
            }
        });

        document.getElementById('view-stats-btn')?.addEventListener('click', () => {
            const modal = document.getElementById('statistics-modal');
            if (!modal) {
                showNotification("Modal de estatísticas não encontrado", "error");
                return;
            }
            if (this.allAssisted && this.currentPauta?.name) {
                if (typeof StatisticsService?.showModal === 'function') {
                    StatisticsService.showModal(this.allAssisted, this.currentPautaData?.useDelegationFlow, this.currentPauta.name);
                } else {
                    showNotification("Erro ao carregar estatísticas", "error");
                }
            } else {
                showNotification("Carregue uma pauta primeiro", "info");
            }
        });

        document.getElementById('edit-pauta-name-btn')?.addEventListener('click', () => {
            document.getElementById('edit-pauta-name-input').value = this.currentPauta?.name || '';
            document.getElementById('edit-pauta-modal').classList.remove('hidden');
        });

        document.getElementById('edit-pauta-config-btn')?.addEventListener('click', () => {
            if (!this.currentPautaData) return;
            
            const typeRadios = document.querySelectorAll('input[name="edit-pauta-type"]');
            typeRadios.forEach(radio => {
                if (radio.value === this.currentPautaData.type) {
                    radio.checked = true;
                }
            });
            
            const ordemRadios = document.querySelectorAll('input[name="edit-ordem"]');
            ordemRadios.forEach(radio => {
                if (radio.value === this.currentPautaData.ordemAtendimento) {
                    radio.checked = true;
                }
            });
            
            const delegationRadios = document.querySelectorAll('input[name="edit-delegation"]');
            delegationRadios.forEach(radio => {
                const value = radio.value === 'true' ? true : false;
                if (value === this.currentPautaData.useDelegationFlow) {
                    radio.checked = true;
                }
            });
            
            const distCheck = document.getElementById('edit-use-distribution');
            if (distCheck) {
                distCheck.checked = this.currentPautaData.useDistributionFlow || false;
            }
            
            document.getElementById('edit-pauta-config-modal').classList.remove('hidden');
        });

        document.getElementById('confirm-edit-pauta-config-btn')?.addEventListener('click', async () => {
            const newType = document.querySelector('input[name="edit-pauta-type"]:checked')?.value;
            const newOrdem = document.querySelector('input[name="edit-ordem"]:checked')?.value;
            const newDelegation = document.querySelector('input[name="edit-delegation"]:checked')?.value === 'true';
            const newDistribution = document.getElementById('edit-use-distribution')?.checked || false;
            
            if (!newType || !newOrdem) {
                showNotification("Selecione todas as opções", "error");
                return;
            }
            
            try {
                const pautaRef = doc(this.db, "pautas", this.currentPauta.id);
                await updateDoc(pautaRef, {
                    type: newType,
                    ordemAtendimento: newOrdem,
                    useDelegationFlow: newDelegation,
                    useDistributionFlow: newDistribution
                });
                
                this.currentPautaData.type = newType;
                this.currentPautaData.ordemAtendimento = newOrdem;
                this.currentPautaData.useDelegationFlow = newDelegation;
                this.currentPautaData.useDistributionFlow = newDistribution;
                
                this.loadColumnPreferences();
                
                showNotification("Configurações atualizadas com sucesso!", "success");
                document.getElementById('edit-pauta-config-modal').classList.add('hidden');
                
            } catch (error) {
                console.error("Erro ao atualizar configurações:", error);
                showNotification("Erro ao atualizar configurações", "error");
            }
        });

        document.getElementById('edit-pauta-config-modal')?.querySelector('#cancel-edit-pauta-config-btn')?.addEventListener('click', () => {
            document.getElementById('edit-pauta-config-modal').classList.add('hidden');
        });

        document.getElementById('manage-members-btn')?.addEventListener('click', async () => {
            if (typeof ModalService?.openMembersModal === 'function') {
                await ModalService.openMembersModal(this);
            } else {
                showNotification("Erro ao abrir gerenciar membros", "error");
            }
        });

        document.getElementById('manage-collaborators-btn')?.addEventListener('click', () => {
            CollaboratorService.openModal(this);
        });

        document.getElementById('close-pauta-btn')?.addEventListener('click', () => {
            document.getElementById('close-modal-title').textContent = 'Fechar Pauta';
            document.getElementById('close-modal-message').textContent = 'Para fechar esta pauta, confirme sua senha. Nenhum membro poderá fazer alterações até que você a reabra.';
            document.getElementById('close-pauta-password').value = '';
            document.getElementById('confirm-close-pauta-btn').textContent = 'Confirmar';
            document.getElementById('close-pauta-modal').classList.remove('hidden');
        });

        document.getElementById('reopen-pauta-btn')?.addEventListener('click', () => {
            document.getElementById('close-modal-title').textContent = 'Reabrir Pauta';
            document.getElementById('close-modal-message').textContent = 'Para reabrir esta pauta, confirme sua senha.';
            document.getElementById('close-pauta-password').value = '';
            document.getElementById('confirm-close-pauta-btn').textContent = 'Reabrir';
            document.getElementById('close-pauta-modal').classList.remove('hidden');
        });

        document.getElementById('confirm-close-pauta-btn')?.addEventListener('click', async () => {
            const password = document.getElementById('close-pauta-password')?.value;
            const errorDiv = document.getElementById('close-auth-error');
            if (errorDiv) errorDiv.classList.add('hidden');

            const isReopen = document.getElementById('confirm-close-pauta-btn')?.textContent.includes('Reabrir');
            const user = this.auth.currentUser;
            
            if (!user || user.uid !== this.currentPautaOwnerId) {
                showNotification("Você não tem permissão para esta ação.", "error");
                document.getElementById('close-pauta-modal')?.classList.add('hidden');
                return;
            }

            try {
                const credential = EmailAuthProvider.credential(user.email, password);
                await reauthenticateWithCredential(user, credential);
                
                const pautaRef = doc(this.db, "pautas", this.currentPauta.id);
                await updateDoc(pautaRef, { isClosed: !isReopen });
                
                this.isPautaClosed = !isReopen;
                UIService.togglePautaLock(this);

                showNotification(`Pauta ${isReopen ? 'reaberta' : 'fechada'} com sucesso.`, 'success', 5000);
                document.getElementById('close-pauta-modal')?.classList.add('hidden');
                
            } catch (error) {
                if (errorDiv) {
                    errorDiv.textContent = 'Senha incorreta. Tente novamente.';
                    errorDiv.classList.remove('hidden');
                }
                showNotification("Falha na autenticação.", "error");
            }
        });

        document.getElementById('cancel-close-pauta-btn')?.addEventListener('click', () => {
            document.getElementById('close-pauta-modal')?.classList.add('hidden');
        });

        document.getElementById('reset-all-btn')?.addEventListener('click', () => {
            document.getElementById('reset-confirm-modal').classList.remove('hidden');
        });

        NotesService.setup();

        document.getElementById('add-assisted-btn')?.addEventListener('click', () => {
            if (typeof PautaService.addAssisted === 'function') {
                PautaService.addAssisted(this);
            } else {
                showNotification("Esta ação requer atualização no código do serviço de pauta.", "warning");
                const modalAdd = document.getElementById('add-assisted-modal');
                if (modalAdd) {
                    modalAdd.classList.remove('hidden');
                }
            }
        });

        document.getElementById('file-upload')?.addEventListener('change', (e) => {
            PautaService.handleCSVUpload(e, this);
        });

        document.getElementById('toggle-faltosos-btn')?.addEventListener('click', UIService.toggleFaltosos);

        ['pauta-search', 'aguardando-search', 'em-atendimento-search', 'atendidos-search', 'faltosos-search'].forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('input', () => {
                    UIService.renderAssistedLists(this);
                });
            }
        });

        document.getElementById('download-pdf-btn')?.addEventListener('click', () => {
            const atendidosArray = (this.allAssisted || []).filter(a => a.status === 'atendido');
            const nomePauta = this.currentPauta?.name || 'Pauta';
            PDFService.generateAtendidosPDF(atendidosArray, nomePauta);
        });

        document.getElementById('download-faltosos-pdf-btn')?.addEventListener('click', () => {
            const faltososArray = (this.allAssisted || []).filter(a => a.status === 'faltoso');
            if (faltososArray.length === 0) {
                showNotification("Nenhum assistido faltoso registrado para emitir o relatório.", "info");
                return;
            }
            const nomePauta = this.currentPauta?.name || 'Pauta';
            PDFService.generateFaltososPDF(faltososArray, nomePauta);
        });

        document.getElementById('download-collaborators-pdf-modal')?.addEventListener('click', () => {
            const nomePauta = this.currentPauta?.name || 'Pauta';
            const listaAtendimentos = this.allAssisted || [];
            PDFService.generateCollaboratorsPDF(this.colaboradores, listaAtendimentos, nomePauta);
        });

        document.getElementById('clear-collaborators-list-modal')?.addEventListener('click', () => {
            CollaboratorService.clearAll(this);
        });

        document.getElementById('format-help-link')?.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('format-help-modal').classList.remove('hidden');
        });

        document.getElementById('privacy-policy-link')?.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('privacy-policy-modal').classList.remove('hidden');
        });

        UIService.setupFooterModals();
        this.setupSubjectsAutocomplete();

        document.body.addEventListener('click', (e) => {
            PautaService.handleCardActions(e, this);
        });

        document.getElementById('collaborator-form-modal')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nome = document.getElementById('collaborator-name-modal')?.value.trim();
            if (!nome) {
                showNotification("Nome obrigatório", "error");
                return;
            }
            const data = {
                nome: nome,
                cargo: document.getElementById('collaborator-role-modal')?.value,
                equipe: document.getElementById('collaborator-team-modal')?.value,
                email: document.getElementById('collaborator-email-modal')?.value || '',
                telefone: document.getElementById('collaborator-phone-modal')?.value || '',
                transporte: document.querySelector('input[name="transporte-colaborador"]:checked')?.value || 'Meios Próprios'
            };
            await CollaboratorService.saveCollaborator(this, data);
        });
        
        document.querySelectorAll('[id^="cancel-"], [id^="close"]').forEach(btn => {
            if (btn) {
                btn.addEventListener('click', (e) => {
                    const modal = e.target.closest('.fixed');
                    if (modal) modal.classList.add('hidden');
                });
            }
        });

        document.querySelectorAll('.p-chip').forEach(chip => {
            chip.addEventListener('click', function(e) {
                e.preventDefault();
                this.classList.toggle('selected');
            });
        });

        document.getElementById('confirm-priority-reason-btn')?.addEventListener('click', async () => {
            const selectedChips = Array.from(document.querySelectorAll('.p-chip.selected'))
                                       .map(chip => chip.dataset.value);
            const customReason = document.getElementById('priority-reason-input')?.value.trim() || '';
            
            let finalReason = selectedChips.join(', ');
            if (customReason) {
                finalReason = finalReason ? `${finalReason} | Obs: ${customReason}` : customReason;
            }

            if (!finalReason) { 
                showNotification("Selecione uma categoria ou descreva o motivo.", "error"); 
                return; 
            }

            if (!window.assistedIdToHandle) {
                showNotification("ID do assistido não encontrado.", "error");
                return;
            }

            await PautaService.updateStatus(
                this.db,
                this.currentPauta.id,
                window.assistedIdToHandle,
                { priority: 'URGENTE', priorityReason: finalReason },
                this.currentUserName
            );

            document.querySelectorAll('.p-chip').forEach(c => c.classList.remove('selected'));
            document.getElementById('priority-reason-input').value = '';
            document.getElementById('priority-reason-modal')?.classList.add('hidden');
            showNotification("Prioridade Ativada!", "success");
        });

        document.getElementById('cancel-priority-reason-btn')?.addEventListener('click', () => {
            document.getElementById('priority-reason-modal')?.classList.add('hidden');
        });

        document.getElementById('back-to-action-selection-btn')?.addEventListener('click', () => {
            if (typeof window.switchToActionSelectionView === 'function') {
                window.switchToActionSelectionView();
            }
        });
        
        document.getElementById('save-checklist-btn')?.addEventListener('click', async () => {
            const assistedId = window.assistedIdToHandle || window.currentAssistedId;
            if (!assistedId) {
                showNotification("Erro: assistido não identificado", "error");
                return;
            }
            
            const container = document.getElementById('checklist-container');
            const checkedItems = Array.from(container.querySelectorAll('.doc-checkbox:checked')).map(cb => ({
                id: cb.id,
                text: cb.closest('label').querySelector('span').textContent,
                type: document.querySelector(`input[name="type-${cb.id}"]:checked`)?.value || 'Físico'
            }));

            const checklistData = {
                action: window.currentChecklistAction, 
                checkedIds: checkedItems.map(item => item.id),
                docTypes: checkedItems.reduce((acc, item) => { acc[item.id] = item.type; return acc; }, {}),
                reuData: window.getReuDataFromForm ? window.getReuDataFromForm() : {},
                expenseData: window.getExpenseDataFromForm ? window.getExpenseDataFromForm() : {}
            };

            try {
                await updateDoc(doc(this.db, "pautas", this.currentPauta.id, "attendances", assistedId), {
                    documentChecklist: checklistData,
                    documentState: 'saved'
                });
                showNotification("Checklist salvo com sucesso!", "success");
            } catch (error) {
                console.error("Erro ao salvar:", error);
                showNotification("Erro ao salvar checklist", "error");
            }
        });

        document.getElementById('close-assisted-details-modal-btn')?.addEventListener('click', () => {
            document.getElementById('assisted-details-modal').classList.add('hidden');
        });
        
        document.getElementById('print-checklist-btn')?.addEventListener('click', async () => {
            const { handlePdf } = await import('./detalhes.js');
            if (typeof handlePdf === 'function') {
                await handlePdf();
            } else {
                showNotification("Erro: Motor de emissão do checklist não carregado.", "error");
            }
        });
        
        document.getElementById('reset-checklist-btn')?.addEventListener('click', () => {
            if (confirm("Deseja mudar de assunto? Isso apagará o checklist atual.")) {
                if (typeof window.switchToActionSelectionView === 'function') {
                    window.switchToActionSelectionView();
                }
            }
        });
        
        function getReuDataFromForm() {
            return {
                checkReuUnico: document.getElementById('check-reu-unico')?.checked || false,
                nome: document.getElementById('nome-reu')?.value || '',
                cpf: document.getElementById('cpf-reu')?.value || '',
                telefone: document.getElementById('telefone-reu')?.value || '',
                cep: document.getElementById('cep-reu')?.value || '',
                rua: document.getElementById('rua-reu')?.value || '',
                numero: document.getElementById('numero-reu')?.value || '',
                complemento: document.getElementById('complemento-reu')?.value || '',
                bairro: document.getElementById('bairro-reu')?.value || '',
                cidade: document.getElementById('cidade-reu')?.value || '',
                uf: document.getElementById('estado-reu')?.value || '',
                referencia: document.getElementById('referencia-reu')?.value || '',
                empresa: document.getElementById('empresa-reu')?.value || '',
                rua_comercial: document.getElementById('rua-comercial-reu')?.value || '',
                numero_comercial: document.getElementById('numero-comercial-reu')?.value || '',
                bairro_comercial: document.getElementById('bairro-comercial-reu')?.value || '',
                cidade_comercial: document.getElementById('cidade-comercial-reu')?.value || '',
                uf_comercial: document.getElementById('estado-comercial-reu')?.value || '',
                cep_comercial: document.getElementById('cep-comercial-reu')?.value || ''
            };
        }

        function getExpenseDataFromForm() {
            return {
                checkExibirGastos: document.getElementById('check-exibir-gastos')?.checked ?? true,
                moradia: document.getElementById('expense-moradia')?.value || '',
                alimentacao: document.getElementById('expense-alimentacao')?.value || '',
                educacao: document.getElementById('expense-educacao')?.value || '',
                saude: document.getElementById('expense-saude')?.value || '',
                vestuario: document.getElementById('expense-vestuario')?.value || '',
                lazer: document.getElementById('expense-lazer')?.value || '',
                outras: document.getElementById('expense-outras')?.value || ''
            };
        }

        document.getElementById('confirm-attendant-btn')?.addEventListener('click', async () => {
            const select = document.getElementById('attendant-select');
            const attendantName = select?.value;
            const nomeFinal = attendantName || null;
            const useDist = this.currentPautaData?.useDistributionFlow === true;
            const novoStatus = useDist ? 'aguardandoDistribuicao' : 'atendido';

            let attendantData = nomeFinal;
            if (nomeFinal) {
                const selectedCollab = this.colaboradores?.find(c => c.nome === nomeFinal);
                if (selectedCollab) {
                    attendantData = { nome: selectedCollab.nome, cargo: selectedCollab.cargo, equipe: selectedCollab.equipe };
                }
            }

            const mapaProdutividadeBI = {};
            const servidorResponsavel = this.currentUserName || "Servidor";
            if (novoStatus === 'atendido') {
                mapaProdutividadeBI[servidorResponsavel] = 1; 
                if (nomeFinal) mapaProdutividadeBI[nomeFinal] = 1;
            }

            await PautaService.updateStatus(
                this.db,
                this.currentPauta.id,
                window.assistedIdToHandle,
                { 
                    status: novoStatus, 
                    attendant: attendantData, 
                    enviadoPor: servidorResponsavel,
                    attendedBy: nomeFinal,
                    trabalhosPorUsuario: novoStatus === 'atendido' ? mapaProdutividadeBI : null,
                    attendedTime: new Date().toISOString() 
                },
                this.currentUserName
            );
            
            document.getElementById('attendant-modal')?.classList.add('hidden');
            showNotification(novoStatus === 'atendido' ? "Atendimento finalizado!" : "Enviado para Distribuição ⚖️", "success");
        });

        document.getElementById('cancel-attendant-btn')?.addEventListener('click', () => {
            document.getElementById('attendant-modal')?.classList.add('hidden');
        });

        document.getElementById('confirm-edit-attendant-btn')?.addEventListener('click', async () => {
            const select = document.getElementById('edit-attendant-select');
            const attendantName = select?.value;
            
            if (!attendantName) {
                showNotification("Selecione um profissional", "error");
                return;
            }
            
            const selectedCollab = this.colaboradores?.find(c => c.nome === attendantName);
            let attendantData = selectedCollab ? 
                { nome: selectedCollab.nome, cargo: selectedCollab.cargo, equipe: selectedCollab.equipe } : 
                attendantName;

            await PautaService.updateStatus(
                this.db,
                this.currentPauta.id,
                window.assistedIdToHandle,
                { attendant: attendantData },
                this.currentUserName
            );
            
            document.getElementById('edit-attendant-modal')?.classList.add('hidden');
            showNotification("Atendente atualizado com sucesso!", "success");
        });

        document.getElementById('cancel-edit-attendant-btn')?.addEventListener('click', () => {
            document.getElementById('edit-attendant-modal')?.classList.add('hidden');
        });

        document.getElementById('confirm-select-collaborator-btn')?.addEventListener('click', async () => {
            const collaboratorId = window.selectedCollaboratorId;
            const collaboratorName = window.selectedCollaboratorName || null;
            const acoesRapidas = ['reagendar', 'agendar', 'consulta', 'outros'];
            const isAcaoRapida = acoesRapidas.includes(window.assistedTipoAcao);

            if (!isAcaoRapida && collaboratorId === undefined) { 
                showNotification("Selecione um colaborador ou 'Não atribuir'.", "warning");
                return;
            }

            const isSilentMode = document.getElementById('toggle-silent-mode')?.checked || false;

            const idAssistidoAtual = window.assistedIdToHandle;
            const nomeAssistidoAtual = window.assistedNameToHandle;

            if (isAcaoRapida) {
                const tipoDescricao = window.assistedTipoDescricao || window.assistedTipoAcao || 'Ação rápida';
                const atendenteFinal = collaboratorName || this.currentUserName;

                await PautaService.updateStatus(
                    this.db,
                    this.currentPauta.id,
                    idAssistidoAtual,
                    {
                        status: 'atendido',
                        attendedBy: atendenteFinal,
                        enviadoPor: this.currentUserName || 'Sistema',
                        attendedAt: new Date().toISOString(),
                        inAttendanceTime: new Date().toISOString(),
                        isConfirmed: false,
                        finalizadoPeloColaborador: true,
                        distributionStatus: 'completed',
                        tipoAcaoRapida: tipoDescricao,
                        assignedCollaborator: collaboratorName ? { id: collaboratorId, name: collaboratorName } : null
                    },
                    this.currentUserName
                );
                showNotification(`${nomeAssistidoAtual} marcado como atendido por ${atendenteFinal} (${tipoDescricao}).`, "success");
            } else if (window.assistedTipoAcao === 'atender_direto') {
                const atendenteFinal = collaboratorName || this.currentUserName;
                await PautaService.finishAttendance(this, idAssistidoAtual, atendenteFinal, []);
                showNotification(`${nomeAssistidoAtual} marcado como atendido por ${atendenteFinal}.`, "success");
            } else { 
                let collaboratorData = null;
                let emailDestino = null;
                
                const novoToken = Math.random().toString(36).substring(2, 10) + Date.now().toString(36).substring(4);

                if (collaboratorName) {
                    const selectedCollab = this.colaboradores?.find(c => c.nome === collaboratorName);
                    emailDestino = selectedCollab?.email || null;
                    
                    collaboratorData = { id: collaboratorId, name: collaboratorName, email: emailDestino };
                }

                const updatePayload = {
                    status: 'emAtendimento',
                    assignedCollaborator: collaboratorData,
                    enviadoPor: this.currentUserName || 'Sistema',
                    inAttendanceTime: new Date().toISOString()
                };

                if (collaboratorName && !isSilentMode) {
                    updatePayload.delegationToken = novoToken; 
                }

                await PautaService.updateStatus(
                    this.db,
                    this.currentPauta.id,
                    idAssistidoAtual, 
                    updatePayload,
                    this.currentUserName
                );
                
                if (emailDestino && !isSilentMode) {
                    showNotification("Disparando notificação para o e-mail cadastrado...", "info");
                    try {
                        await EmailService.sendDelegationEmail(
                            emailDestino, 
                            collaboratorName, 
                            nomeAssistidoAtual, 
                            this.currentUserName,
                            this.currentPauta.id, 
                            idAssistidoAtual, 
                            novoToken 
                        );
                    } catch(e) {
                        console.error("Erro no envio auto:", e);
                    }
                } else if (emailDestino && isSilentMode) {
                    showNotification(`Card movido para ${collaboratorName} silenciosamente.`, "info");
                } else {
                    showNotification(`${nomeAssistidoAtual} delegado com sucesso.`, "success"); 
                }
            }
            
            document.getElementById('select-collaborator-modal')?.classList.add('hidden');
            window.assistedIdToHandle = null;
            window.assistedNameToHandle = null;
            window.assistedTipoAcao = null;
            window.assistedTipoDescricao = null;
            window.selectedCollaboratorId = undefined;
            window.selectedCollaboratorName = undefined;
        });

        document.getElementById('cancel-select-collaborator-btn')?.addEventListener('click', () => {
            document.getElementById('select-collaborator-modal')?.classList.add('hidden');
            window.selectedCollaboratorId = undefined;
            window.selectedCollaboratorName = undefined;
            window.assistedTipoAcao = null;
            window.assistedTipoDescricao = null;
        });

        document.getElementById('confirm-arrival-btn')?.addEventListener('click', async () => {
            const time = document.getElementById('arrival-time-input')?.value;
            if (!time) {
                showNotification("Informe o horário", "error");
                return;
            }
            const [hours, minutes] = time.split(':');
            const arrivalDate = new Date();
            arrivalDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

            const roomSelect = document.getElementById('arrival-room-select');
            const room = roomSelect && !roomSelect.classList.contains('hidden') ? roomSelect.value : null;

            await PautaService.updateStatus(
                this.db,
                this.currentPauta.id,
                window.assistedIdToHandle,
                { status: 'aguardando', arrivalTime: arrivalDate.toISOString(), checkInOrder: Date.now(), room: room },
                this.currentUserName
            );

            document.getElementById('arrival-modal')?.classList.add('hidden');
            showNotification("Chegada registrada com sucesso!", "success");
        });

        document.getElementById('cancel-arrival-btn')?.addEventListener('click', () => {
            document.getElementById('arrival-modal')?.classList.add('hidden');
        });

        document.getElementById('confirm-edit-assisted-btn')?.addEventListener('click', async () => {
            const name = document.getElementById('edit-assisted-name')?.value.trim();
            if (!name) {
                showNotification("O nome não pode ficar em branco.", "error");
                return;
            }
            
            const updatedData = {
                name: name,
                cpf: document.getElementById('edit-assisted-cpf')?.value.trim() || '',
                numAgendamento: document.getElementById('edit-assisted-num-agendamento')?.value.trim() || '',
                subject: document.getElementById('edit-assisted-subject')?.value.trim() || '',
                scheduledTime: document.getElementById('edit-scheduled-time')?.value || null,
            };
            
            const roomSelect = document.getElementById('edit-room-select');
            if (roomSelect && !roomSelect.parentElement.classList.contains('hidden')) {
                updatedData.room = roomSelect.value || null;
            }
            
            await PautaService.updateStatus(
                this.db,
                this.currentPauta.id,
                window.assistedIdToHandle,
                updatedData,
                this.currentUserName
            );
            
            document.getElementById('edit-assisted-modal')?.classList.add('hidden');
            showNotification("Dados atualizados com sucesso!", "success");
        });

        document.getElementById('cancel-edit-assisted-btn')?.addEventListener('click', () => {
            document.getElementById('edit-assisted-modal')?.classList.add('hidden');
        });

        document.getElementById('demands-modal-add-demand-btn')?.addEventListener('click', () => {
            const input = document.getElementById('demands-modal-new-demand-input');
            const text = input?.value.trim();
            if (text) {
                const container = document.getElementById('demands-modal-list-container');
                if (container) {
                    if (container.querySelector('p.text-gray-500')) {
                        container.innerHTML = '';
                    }
                    const li = document.createElement('li');
                    li.className = 'flex justify-between items-center p-2 bg-white rounded-md';
                    li.innerHTML = `<span>${escapeHTML(text)}</span><button class="remove-demand-item-btn text-red-500 text-xs">Remover</button>`;
                    container.appendChild(li);
                    input.value = '';
                    input.focus();
                }
            }
        });

        document.getElementById('demands-modal-list-container')?.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-demand-item-btn')) {
                const li = e.target.closest('li');
                if (li) li.remove();
                
                const container = document.getElementById('demands-modal-list-container');
                if (container && container.children.length === 0) {
                    container.innerHTML = '<p class="text-gray-500 text-center">Nenhuma demanda adicional.</p>';
                }
            }
        });

        document.getElementById('save-demands-btn')?.addEventListener('click', async () => {
            const container = document.getElementById('demands-modal-list-container');
            const items = container?.querySelectorAll('li') || [];
            const descricoes = Array.from(items).map(li => li.querySelector('span')?.textContent || '');
            
            await PautaService.updateStatus(
                this.db,
                this.currentPauta.id,
                window.assistedIdToHandle,
                { demandas: { quantidade: descricoes.length, descricoes: descricoes } },
                this.currentUserName
            );
            
            showNotification("Demandas salvas com sucesso!", "success");
            document.getElementById('demands-modal')?.classList.add('hidden');
        });

        document.getElementById('cancel-demands-btn')?.addEventListener('click', () => {
            document.getElementById('demands-modal')?.classList.add('hidden');
        });

        document.getElementById('close-demands-modal-btn')?.addEventListener('click', () => {
            document.getElementById('demands-modal')?.classList.add('hidden');
        });

        document.getElementById('confirm-reset-btn')?.addEventListener('click', async () => {
            const attendanceCollectionRef = collection(this.db, "pautas", this.currentPauta.id, "attendances");
            const snapshot = await getDocs(attendanceCollectionRef);
            
            if (snapshot.empty) {
                showNotification("A pauta já está vazia.", "info");
                document.getElementById('reset-confirm-modal')?.classList.add('hidden');
                return;
            }
            
            const batch = writeBatch(this.db);
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            
            showNotification("Pauta zerada com sucesso.", "success");
            document.getElementById('reset-confirm-modal')?.classList.add('hidden');
        });

        document.getElementById('cancel-reset-btn')?.addEventListener('click', () => {
            document.getElementById('reset-confirm-modal')?.classList.add('hidden');
        });

        document.getElementById('confirm-edit-pauta-btn')?.addEventListener('click', async () => {
            const newName = document.getElementById('edit-pauta-name-input')?.value.trim();
            if (newName && this.currentPauta?.id) {
                await updateDoc(doc(this.db, "pautas", this.currentPauta.id), { name: newName });
                document.getElementById('pauta-title').textContent = newName;
                showNotification("Nome da pauta atualizado.", "success");
                document.getElementById('edit-pauta-modal')?.classList.add('hidden');
            } else {
                showNotification("O nome não pode ser vazio.", "error");
            }
        });

        document.getElementById('cancel-edit-pauta-btn')?.addEventListener('click', () => {
            document.getElementById('edit-pauta-modal')?.classList.add('hidden');
        });

        document.getElementById('send-delegate-email-btn')?.addEventListener('click', async () => {
            const emailInput = document.getElementById('collaborator-email-input');
            const emailDestino = emailInput?.value.trim();
            
            if (!emailDestino) {
                showNotification("Por favor, insira o e-mail.", "error");
                return;
            }

            const btn = document.getElementById('send-delegate-email-btn');
            if (btn) { btn.disabled = true; btn.textContent = "Enviando..."; }

            let nomeColega = window.collaboratorNameForDelegation;
            if (!nomeColega || nomeColega === "Não informado" || nomeColega === "undefined") {
                nomeColega = "Colega Colaborador";
            }

            const idAssistidoAtual = window.assistedIdForDelegation;
            const novoToken = Math.random().toString(36).substring(2, 10) + Date.now().toString(36).substring(4);

            try {
                const docRef = doc(this.db, "pautas", this.currentPauta.id, "attendances", idAssistidoAtual);
                await updateDoc(docRef, { delegationToken: novoToken });

                await EmailService.sendDelegationEmail(
                    emailDestino, 
                    nomeColega, 
                    window.assistedNameForDelegation, 
                    this.currentUserName,
                    this.currentPauta.id, 
                    idAssistidoAtual, 
                    novoToken
                );

                document.getElementById('delegate-email-modal')?.classList.add('hidden');
                if (emailInput) emailInput.value = '';
                showNotification("E-mail enviado e acesso liberado!", "success");
            } catch (error) {
                showNotification("Falha no envio do e-mail.", "error");
            } finally {
                if (btn) { btn.disabled = false; btn.textContent = "Enviar E-mail"; }
            }
        });

        document.getElementById('cancel-delegate-email-btn')?.addEventListener('click', () => {
            document.getElementById('delegate-email-modal')?.classList.add('hidden');
        });

        document.body.addEventListener('click', async (e) => {
            if (e.target.classList.contains('remove-member-btn')) {
                const email = e.target.dataset.email;
                if (confirm(`Remover ${email} da pauta?`)) {
                    try {
                        const usersRef = collection(this.db, "users");
                        const q = query(usersRef, where("email", "==", email));
                        const querySnapshot = await getDocs(q);
                        
                        if (!querySnapshot.empty) {
                            const userId = querySnapshot.docs[0].id;
                            const pautaRef = doc(this.db, "pautas", this.currentPauta.id);
                            await updateDoc(pautaRef, { members: arrayRemove(userId), memberEmails: arrayRemove(email) });
                            showNotification(`Membro ${email} removido`, "success");
                            if (typeof ModalService?.openMembersModal === 'function') {
                                await ModalService.openMembersModal(this);
                            }
                        }
                    } catch (error) {
                        showNotification("Erro ao remover membro", "error");
                    }
                }
            }
        });
        
        document.getElementById('open-user-preferences-btn')?.addEventListener('click', () => {
            this.openUserPreferencesModal();
        });

        document.getElementById('cancel-user-preferences-btn')?.addEventListener('click', () => {
            document.getElementById('user-preferences-modal').classList.add('hidden');
        });

        document.getElementById('save-user-preferences-btn')?.addEventListener('click', async () => {
            await this.saveUserPreferences();
        });

        const adminModal = document.getElementById('admin-modal');
        const adminPanelBtnMain = document.getElementById('admin-btn-main'); 
        const adminPanelBtnPautaSelection = document.getElementById('admin-panel-btn'); 

        if (adminPanelBtnPautaSelection && adminModal) {
            adminPanelBtnPautaSelection.addEventListener('click', () => {
                adminModal.classList.remove('hidden');
                this.setupAdminPanel(); 
            });
        }
        
        if (adminPanelBtnMain && adminModal) {
            adminPanelBtnMain.addEventListener('click', () => {
                adminModal.classList.remove('hidden');
                this.setupAdminPanel();
            });
        }

        document.addEventListener('click', (e) => {
            const adminModal = document.getElementById('admin-modal');
            const adminPanelToggle = document.getElementById('pauta-settings-toggle'); 
            const adminActionsToggle = document.getElementById('actions-toggle');     
            const adminPanelBtn = document.getElementById('admin-panel-btn');         
            const adminBtnMain = document.getElementById('admin-btn-main');           

            if ((adminModal && adminModal.contains(e.target)) ||
                (adminPanelToggle && adminPanelToggle.contains(e.target)) ||
                (adminActionsToggle && adminActionsToggle.contains(e.target)) ||
                (adminPanelBtn && adminPanelBtn.contains(e.target)) ||
                (adminBtnMain && adminBtnMain.contains(e.target))) {
                return; 
            }

            const actionsPanel = document.getElementById('actions-panel');
            const pautaSettingsPanel = document.getElementById('pauta-settings-panel');

            if (actionsPanel && !actionsPanel.classList.contains('hidden') && !actionsPanel.contains(e.target) && !document.getElementById('actions-toggle')?.contains(e.target)) {
                actionsPanel.classList.add('opacity-0', 'scale-95', 'pointer-events-none');
                document.getElementById('actions-arrow')?.classList.remove('rotate-180');
            }
            if (pautaSettingsPanel && !pautaSettingsPanel.classList.contains('hidden') && pautaSettingsToggle && !pautaSettingsToggle.contains(e.target)) {
                 pautaSettingsPanel.classList.add('hidden');
                 const pautaSettingsArrow = document.getElementById('pauta-settings-arrow'); 
                 if (pautaSettingsArrow) pautaSettingsArrow.classList.remove('rotate-180');
            }

            if (adminModal && !adminModal.classList.contains('hidden')) {
                adminModal.classList.add('hidden');
                const adminArrow = document.getElementById('actions-arrow'); 
                if (adminArrow) adminArrow.classList.remove('rotate-180');
            }
        });

        this.setupAdminPanel();
    }

    async loadUserPreferences() {
        if (!this.auth?.currentUser || !this.db) {
            this.userPreferences = this.getDefaultNotificationPreferences(); 
            return;
        }

        const userDocRef = doc(this.db, "users", this.auth.currentUser.uid);
        try {
            const docSnap = await getDoc(userDocRef);
            if (docSnap.exists()) {
                const userData = docSnap.data();
                this.userPreferences = userData.preferences || this.getDefaultNotificationPreferences(); 
            } else {
                this.userPreferences = this.getDefaultNotificationPreferences(); 
            }
        } catch (error) {
            this.userPreferences = this.getDefaultNotificationPreferences();
            showNotification("Erro ao carregar suas preferências.", "error");
        }
        this.applyUserPreferences(); 
    }

    async saveUserPreferences() {
        if (!this.auth?.currentUser || !this.db) {
            showNotification("Você precisa estar logado para salvar preferências.", "error");
            return;
        }

        this.userPreferences = {
            enableSoundsSuccess: document.getElementById('pref-enable-sounds-success')?.checked || false,
            enableSoundsError: document.getElementById('pref-enable-sounds-error')?.checked || false,
            enableSoundsInfo: document.getElementById('pref-enable-sounds-info')?.checked || false,
            enableSoundsWarning: document.getElementById('pref-enable-sounds-warning')?.checked || false,
            showToastsSuccess: document.getElementById('pref-show-toasts-success')?.checked || false,
            showToastsError: document.getElementById('pref-show-toasts-error')?.checked || false,
            showToastsInfo: document.getElementById('pref-show-toasts-info')?.checked || false,
            showToastsWarning: document.getElementById('pref-show-toasts-warning')?.checked || false,
        };

        const userDocRef = doc(this.db, "users", this.auth.currentUser.uid);
        try {
            await updateDoc(userDocRef, {
                preferences: this.userPreferences,
                lastPreferenceUpdate: new Date().toISOString()
            }, { merge: true });
            
            this.applyUserPreferences();
            document.getElementById('user-preferences-modal').classList.add('hidden');
            showNotification("Preferências salvas com sucesso!", 'success');
        } catch (error) {
            showNotification("Erro ao salvar suas preferências.", "error");
        }
    }

    async openUserPreferencesModal() {
        if (!this.auth?.currentUser) {
            showNotification("Você precisa estar logado para ver suas preferências.", "error");
            return;
        }

        const nameInput = document.getElementById('pref-user-name');
        if (nameInput) nameInput.value = this.currentUserName || 'Não informado';
        
        const emailInput = document.getElementById('pref-user-email');
        if (emailInput) emailInput.value = this.auth.currentUser.email || 'Não informado';

        await this.loadUserPreferences(); 

        const setChecked = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.checked = value;
        };

        setChecked('pref-enable-sounds-success', this.userPreferences.enableSoundsSuccess || false);
        setChecked('pref-enable-sounds-error', this.userPreferences.enableSoundsError || false);
        setChecked('pref-enable-sounds-info', this.userPreferences.enableSoundsInfo || false);
        setChecked('pref-enable-sounds-warning', this.userPreferences.enableSoundsWarning || false);

        setChecked('pref-show-toasts-success', this.userPreferences.showToastsSuccess || false);
        setChecked('pref-show-toasts-error', this.userPreferences.showToastsError || false);
        setChecked('pref-show-toasts-info', this.userPreferences.showToastsInfo || false);
        setChecked('pref-show-toasts-warning', this.userPreferences.showToastsWarning || false);

        document.getElementById('user-preferences-modal')?.classList.remove('hidden');
    }

    applyUserPreferences() {
        console.log("⚙️ Aplicando preferências do usuário no SIGEP:", this.userPreferences);
    }

    getDefaultNotificationPreferences() {
        return {
            enableSoundsSuccess: true, enableSoundsError: true, enableSoundsInfo: true, enableSoundsWarning: true,
            showToastsSuccess: true, showToastsError: true, showToastsInfo: true, showToastsWarning: true,
        };
    }

    saveColumnPreferences() {
        const preferences = {
            showEmAtendimento: document.getElementById('toggle-em-atendimento')?.checked || false,
            showDistribuicao: document.getElementById('toggle-distribuicao')?.checked || false,
            showFaltosos: document.getElementById('toggle-faltosos')?.checked || false,
        };
        localStorage.setItem('sigap_column_preferences', JSON.stringify(preferences));
        this.applyColumnPreferences(preferences);
    }

    loadColumnPreferences() {
        const savedPreferences = localStorage.getItem('sigap_column_preferences');
        let preferences = { showEmAtendimento: true, showDistribuicao: true, showFaltosos: false };
        if (savedPreferences) preferences = JSON.parse(savedPreferences);

        const chkEmAtendimento = document.getElementById('toggle-em-atendimento');
        const chkDistribuicao = document.getElementById('toggle-distribuicao');
        const chkFaltosos = document.getElementById('toggle-faltosos');
        
        if(chkEmAtendimento) chkEmAtendimento.checked = preferences.showEmAtendimento;
        if(chkDistribuicao) chkDistribuicao.checked = preferences.showDistribuicao;
        if(chkFaltosos) chkFaltosos.checked = preferences.showFaltosos;
        
        this.applyColumnPreferences(preferences);
    }

    applyColumnPreferences(preferences) {
        const pautaType = this.currentPautaData?.type;
        const useDelegationFlow = this.currentPautaData?.useDelegationFlow;
        const useDistributionFlow = this.currentPautaData?.useDistributionFlow;

        const emAtendimentoColumn = document.getElementById('em-atendimento-column');
        const distribuicaoColumn = document.getElementById('distribuicao-column');
        const faltososColumn = document.getElementById('faltosos-column');

        if (emAtendimentoColumn) {
            if (useDelegationFlow && preferences.showEmAtendimento) emAtendimentoColumn.classList.remove('hidden');
            else emAtendimentoColumn.classList.add('hidden');
        }

        if (distribuicaoColumn) {
            if (useDistributionFlow && preferences.showDistribuicao) distribuicaoColumn.classList.remove('hidden');
            else distribuicaoColumn.classList.add('hidden');
        }
        
        if (faltososColumn) {
            const pautaColumn = document.getElementById('pauta-column');
            if (pautaType === 'agendamento' && preferences.showFaltosos && pautaColumn && !pautaColumn.classList.contains('hidden')) {
                 faltososColumn.classList.remove('hidden');
            } else {
                return;
            }
        }
    }

    renderCustomRooms() {
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
    }

    setupSubjectsAutocomplete() {
        const datalist = document.getElementById('subjects-list');
        if (!datalist) return;
        flatSubjects.forEach(subject => {
            const option = document.createElement('option');
            option.value = subject.value;
            datalist.appendChild(option);
        });

        const subjectInput = document.getElementById('assisted-subject');
        const descriptionBox = document.getElementById('subject-description');
        
        if (subjectInput) {
            subjectInput.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase();
                const filtered = flatSubjects.filter(item =>
                    item.value.toLowerCase().includes(query) || item.description.toLowerCase().includes(query)
                );
                datalist.innerHTML = '';
                filtered.forEach(subject => {
                    const option = document.createElement('option');
                    option.value = subject.value;
                    datalist.appendChild(option);
                });
            });

            subjectInput.addEventListener('change', () => {
                const value = subjectInput.value;
                let selectedText = value.includes(' > ') ? value.split(' > ').pop() : value;
                subjectInput.value = selectedText;

                const found = flatSubjects.find(s => s.value === value || s.value.split(' > ').pop() === selectedText);
                if (found?.description && descriptionBox) {
                    descriptionBox.textContent = found.description;
                    descriptionBox.classList.remove('hidden');
                } else if (descriptionBox) {
                    descriptionBox.classList.add('hidden');
                }
            });
        }

        document.getElementById('subject-info-btn')?.addEventListener('click', () => {
            const value = subjectInput?.value || '';
            const found = flatSubjects.find(s => s.value === value || s.value.split(' > ').pop() === value);
            if (found?.description && descriptionBox) {
                descriptionBox.textContent = found.description;
                descriptionBox.classList.toggle('hidden');
            } else if (descriptionBox) {
                descriptionBox.textContent = 'Selecione um assunto válido.';
                descriptionBox.classList.remove('hidden');
            }
        });
    }

    setupAdminPanel() {
        const adminModal = document.getElementById('admin-modal');
        if (adminModal) {
            loadUsersList(this.db);
            populateUserFilter(this.db);
        }

        document.getElementById('max-admin-btn')?.addEventListener('click', () => {
            const windowEl = document.getElementById('admin-window');
            if (windowEl) {
                windowEl.classList.toggle('max-w-4xl');
                windowEl.classList.toggle('max-w-none');
                windowEl.classList.toggle('rounded-lg');
            }
        });

        document.getElementById('min-admin-btn')?.addEventListener('click', () => {
            document.getElementById('admin-content-area')?.classList.toggle('hidden');
        });

        document.getElementById('close-admin-modal-btn')?.addEventListener('click', () => {
            if (adminModal) adminModal.classList.add('hidden');
        });

        document.getElementById('cleanup-old-data-btn')?.addEventListener('click', () => {
            cleanupOldData(this.db);
        });

        document.getElementById('view-audit-logs-btn')?.addEventListener('click', async () => {
            const btn = document.getElementById('view-audit-logs-btn');
            const originalText = btn.textContent;
            btn.textContent = "Carregando...";
            btn.disabled = true;
            try {
                await loadAuditLogs(this.db);
            } catch (error) {
                showNotification("Erro ao carregar logs de auditoria", "error");
            } finally {
                btn.textContent = originalText;
                btn.disabled = false;
            }
        });

        document.getElementById('export-audit-pdf-btn')?.addEventListener('click', () => {
            exportAuditLogsPDF(this.db);
        });

        document.getElementById('btn-load-dashboard')?.addEventListener('click', () => {
            loadDashboardData(this.db);
        });
    }

    async loadPauta(pautaId, pautaName, pautaType) {
        try {
            const pautaDoc = await getDoc(doc(this.db, "pautas", pautaId));
            if (pautaDoc.exists()) {
                const pautaData = pautaDoc.data();
                if (pautaData.createdAt) {
                    const creationDate = new Date(pautaData.createdAt);
                    const expirationDate = new Date(creationDate);
                    expirationDate.setDate(creationDate.getDate() + 7);
                    if (new Date() > expirationDate) {
                        showNotification("Esta pauta expirou e não pode mais ser acessada.", "error");
                        return;
                    }
                }
            }
        } catch (error) {
            console.error("Erro ao verificar expiração:", error);
        }

        this.currentPauta = { id: pautaId, name: pautaName, type: pautaType };
        document.getElementById('pauta-title').textContent = pautaName;

        localStorage.setItem('lastPautaId', pautaId);
        localStorage.setItem('lastPautaName', pautaName);
        localStorage.setItem('lastPautaType', pautaType);

        try {
            const pautaDoc = await getDoc(doc(this.db, "pautas", pautaId));
            if (pautaDoc.exists()) {
                this.currentPautaData = pautaDoc.data();
                this.currentPautaOwnerId = this.currentPautaData.owner;
                this.isPautaClosed = this.currentPautaData.isClosed || false;
                
                if (this.currentPautaData.type === 'multisala' && this.currentPautaData.customRooms) {
                    this.customRoomsList = this.currentPautaData.customRooms;
                } else if (this.currentPautaData.type === 'multisala' && this.currentPautaData.rooms) {
                    this.customRoomsList = this.currentPautaData.rooms;
                } else {
                    this.customRoomsList = [];
                }

                UIService.togglePautaLock(this);
                this.loadColumnPreferences();
                this.applyRoleBasedUI();
                
                const btnManageRooms = document.getElementById('btn-manage-rooms');
                if (btnManageRooms) {
                    if (this.currentPautaData.type === 'multisala') {
                        btnManageRooms.classList.remove('hidden');
                    } else {
                        btnManageRooms.classList.add('hidden');
                    }
                }

                if (typeof PautaService.populateRoomSelects === 'function') {
                    PautaService.populateRoomSelects(this);
                }
            }

            this.setupRealtimeListener(pautaId);
            
            if (typeof CollaboratorService?.setupListener === 'function') {
                CollaboratorService.setupListener(this, pautaId);
            }
            
            this.iniciarMonitorEnvelopes();

            UIService.showScreen('app');
        } catch (error) {
            console.error("Erro ao carregar pauta:", error);
            showNotification("Erro ao carregar pauta", "error");
        }
    }

    iniciarMonitorEnvelopes() {
        if (this.monitorInterval) clearInterval(this.monitorInterval);
        
        const verificarDisponibilidade = () => {
            // REMOVIDA A RESTRIÇÃO: !this.currentPautaData?.useDelegationFlow
            if (!this.colaboradores || this.colaboradores.length === 0) return;

            const colabsAtivos = this.colaboradores.filter(c => c.presente === true);
            
            const colabsLivres = colabsAtivos.filter(c => {
                const casosOcupando = this.allAssisted.filter(a => {
                    const emAtendimentoNormal = a.status === 'emAtendimento' && a.assignedCollaborator?.name === c.nome;
                    const pendenteAssinatura = (a.status === 'aguardandoDistribuicao' || a.status === 'aguardandoCorrecao') && a.defensorResponsavel === c.nome;
                    return emAtendimentoNormal || pendenteAssinatura;
                });
                return casosOcupando.length === 0;
            });

            const headerActions = document.querySelector('.relative.flex.items-center.w-full.sm\\:w-auto.justify-end');
            if (!headerActions) return;

            // ID ÚNICO POR PAUTA
            const btnId = `btn-colabs-disponiveis-${this.currentPauta.id}`;
            
            // Remover botões órfãos de outras pautas
            document.querySelectorAll('[id^="btn-colabs-disponiveis-"]').forEach(btn => {
                if (btn.id !== btnId) btn.remove();
            });

            let btnEnvelope = document.getElementById(btnId);

            if (colabsLivres.length > 0) {
                if (!btnEnvelope) {
                    btnEnvelope = document.createElement('button');
                    btnEnvelope.id = btnId;
                    btnEnvelope.onclick = () => {
                        const nomes = colabsLivres.map(c => `• ${c.nome} (${c.cargo || 'Membro'})`).join('\n');
                        showNotification(`Equipe livre no momento na pauta ${this.currentPauta.name}:\n\n${nomes}`);
                    };
                    headerActions.insertBefore(btnEnvelope, headerActions.firstChild);
                }
                
                btnEnvelope.className = 'mr-3 flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 font-black rounded-lg transition-colors border border-emerald-300 shadow-sm animate-pulse cursor-pointer shrink-0';
                btnEnvelope.title = `${colabsLivres.length} Colaborador(es) Livre(s)`;
                btnEnvelope.innerHTML = `<span class="text-sm">✉️</span> <span class="text-xs tracking-wider">${colabsLivres.length} LIVRE(S)</span>`;
            } else {
                if (btnEnvelope) btnEnvelope.remove();
            }
        };

        verificarDisponibilidade();
        this.monitorInterval = setInterval(verificarDisponibilidade, 2500);
    }

    async showPautaSelectionScreen() {
        if (this.monitorInterval) { clearInterval(this.monitorInterval); this.monitorInterval = null; }
        // Limpeza de botões órfãos ao sair
        document.querySelectorAll('[id^="btn-colabs-disponiveis-"]').forEach(btn => btn.remove());
        
        UIService.showScreen('pautaSelection');
        this.currentPautaFilter = this.currentPautaFilter || 'all';
        UIService.renderPautaFilters('filters-container', this.currentPautaFilter, async (filter) => {
            this.currentPautaFilter = filter;
            await this.loadPautasWithFilter();
        }, this);
        await this.loadPautasWithFilter();
        this.loadColumnPreferences();
    }

    async loadPautasWithFilter() {
        const user = this.auth.currentUser;
        if (!user) return;
        const pautasList = document.getElementById('pautas-list');
        if (!pautasList) return;
        pautasList.innerHTML = '<p class="col-span-full text-center py-8">Carregando pautas SIGEP...</p>';
    
        try {
            const q = query(
                collection(this.db, "pautas"),
                where("members", "array-contains", user.uid)
            );
            const snapshot = await getDocs(q);
            let pautas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            const filtrosAdicionais = {};
            if (this.currentPautaFilter === 'periodo') {
                filtrosAdicionais.dataInicial = document.getElementById('filter-data-inicial')?.value;
                filtrosAdicionais.dataFinal = document.getElementById('filter-data-final')?.value;
                filtrosAdicionais.tipo = document.getElementById('filter-tipo-pauta')?.value;
            }
            
            const filteredPautas = PautaService.filterPautas(pautas, this.currentPautaFilter, user.uid, user.email, filtrosAdicionais);
            
            UIService.renderPautaCards(filteredPautas, user.uid, user.email, this);
            
        } catch (error) {
            console.error("Erro ao carregar pautas:", error);
            if (pautasList) pautasList.innerHTML = '<p class="col-span-full text-center text-red-500">Erro ao carregar pautas</p>';
        }
    }

    async deletePauta(pautaId, pautaName) {
        if (!this.db || !this.auth) return;
        try {
            const success = await PautaService.deletePauta(this.db, this.auth, pautaId, pautaName, this.currentUserName || 'Sistema');
            if (success) {
                playSound('success');
                await this.loadPautasWithFilter();
            }
        } catch (error) {
            showNotification("Erro ao deletar pauta: " + error.message, "error");
        }
    }

    refreshAssistedList() {
        if (!this.unsubscribeFromAttendances) this.loadAssistedList();
    }
    
    async loadAssistedList() {
        if (!this.currentPauta?.id) return;
        try {
            const attendanceRef = collection(this.db, "pautas", this.currentPauta.id, "attendances");
            const snapshot = await getDocs(attendanceRef);
            this.allAssisted = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            UIService.renderAssistedLists(this);
            setTimeout(() => { if (typeof PautaService.injectRoomSearches === 'function') PautaService.injectRoomSearches(this); }, 150);
        } catch (error) {}
    }

    setupRealtimeListener(pautaId) {
        if (this.unsubscribeFromAttendances) this.unsubscribeFromAttendances();
        const attendanceRef = collection(this.db, "pautas", pautaId, "attendances");
        this.unsubscribeFromAttendances = onSnapshot(attendanceRef, (snapshot) => {
            this.allAssisted = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            UIService.renderAssistedLists(this);
            setTimeout(() => { if (typeof PautaService.injectRoomSearches === 'function') PautaService.injectRoomSearches(this); }, 150);
        }, (error) => {
            showNotification("Erro ao carregar dados", "error");
        });
    }

    applyRoleBasedUI() {
        const currentUser = this.currentUser;
        const currentUserRole = currentUser?.role; 
        const isAuthenticated = this.auth?.currentUser != null;
        const isUserApproved = currentUser?.status === 'approved'; 
        const isApoio = currentUserRole === 'apoio'; 
        
        const adminPanelBtnMain = document.getElementById('admin-btn-main');
        const adminPanelBtnPautaSelection = document.getElementById('admin-panel-btn');
        const canAccessAdminPanel = (currentUserRole === 'admin' || currentUserRole === 'superadmin') && isAuthenticated && isUserApproved;
        
        if (adminPanelBtnMain) adminPanelBtnMain.classList.toggle('hidden', !canAccessAdminPanel);
        if (adminPanelBtnPautaSelection) adminPanelBtnPautaSelection.classList.toggle('hidden', !canAccessAdminPanel);

        const closePautaBtn = document.getElementById('close-pauta-btn');
        const reopenPautaBtn = document.getElementById('reopen-pauta-btn');
        const resetAllBtn = document.getElementById('reset-all-btn');
        const manageMembersBtn = document.getElementById('manage-members-btn');
        const manageCollaboratorsBtn = document.getElementById('manage-collaborators-btn');
        const viewStatsBtn = document.getElementById('view-stats-btn');

        const canManagePauta = (isUserApproved && (currentUserRole === 'user' || currentUserRole === 'apoio')) || currentUserRole === 'admin' || currentUserRole === 'superadmin';
        
        if (closePautaBtn) closePautaBtn.classList.toggle('hidden', !canManagePauta);
        if (reopenPautaBtn) reopenPautaBtn.classList.toggle('hidden', !canManagePauta);
        if (resetAllBtn) resetAllBtn.classList.toggle('hidden', !canManagePauta);
        if (manageMembersBtn) manageMembersBtn.classList.toggle('hidden', !canManagePauta);
        if (manageCollaboratorsBtn) manageCollaboratorsBtn.classList.toggle('hidden', !canManagePauta);
        if (viewStatsBtn) viewStatsBtn.classList.toggle('hidden', !canAccessAdminPanel);

        const callNextBtn = document.getElementById('call-next-assisted-btn');
        if (callNextBtn) {
            if (isApoio || !isAuthenticated) {
                callNextBtn.classList.add('hidden');
            } else {
                callNextBtn.classList.remove('hidden');
            }
        }

        const addAssistedBtn = document.getElementById('add-assisted-btn');
        const fileUpload = document.getElementById('file-upload');
        const btnSyncVerde = document.getElementById('btn-sync-verde');

        if (addAssistedBtn) addAssistedBtn.disabled = !isAuthenticated; 
        if (fileUpload) fileUpload.disabled = isApoio;
        if (btnSyncVerde) btnSyncVerde.disabled = isApoio;

        const btnMonitor = document.getElementById('btn-painel-geral-externo');
        if (btnMonitor) {
            const liberadoApoio = this.currentPautaData?.liberarPainelGeralApoio === true;
            if (isApoio && !liberadoApoio) { 
                btnMonitor.classList.add('hidden');
            } else {
                btnMonitor.classList.remove('hidden');
            }
        }
        
        if (typeof UIService !== 'undefined' && typeof UIService.renderAssistedLists === 'function') {
            UIService.renderAssistedLists(this); 
        }
    }
}

window.showNotification = showNotification;
window.openDetailsModal = openDetailsModal;

window.switchToChecklistView = function() {
    document.getElementById('document-action-selection')?.classList.add('hidden');
    document.getElementById('document-checklist-view')?.classList.remove('hidden');
    document.getElementById('document-checklist-view-header')?.classList.remove('hidden');
    document.getElementById('checklist-search-container')?.classList.remove('hidden');
};

window.switchToActionSelectionView = function() {
    document.getElementById('document-checklist-view')?.classList.add('hidden');
    document.getElementById('document-action-selection')?.classList.remove('hidden');
    document.getElementById('document-checklist-view-header')?.classList.add('hidden');
    document.getElementById('checklist-search-container')?.classList.add('hidden');
};

window.sortColaboradores = function(criterio) {
    if (typeof CollaboratorService !== 'undefined' && typeof CollaboratorService.sortColaboradores === 'function') {
        CollaboratorService.sortColaboradores(window.app, criterio);
    } else {
        if (!window.app || !window.app.colaboradores) return;
        
        window._sortColabDir = window._sortColabDir === 'asc' ? 'desc' : 'asc';
        const direction = window._sortColabDir === 'asc' ? 1 : -1;
        
        window.app.colaboradores.sort((a, b) => {
            let valA = (a[criterio] || '').toString().toLowerCase();
            let valB = (b[criterio] || '').toString().toLowerCase();
            if (valA < valB) return -1 * direction;
            if (valA > valB) return 1 * direction;
            return 0;
        });
        
        if (typeof CollaboratorService !== 'undefined' && typeof CollaboratorService.renderModalList === 'function') {
            CollaboratorService.renderModalList(window.app);
        } else if (typeof CollaboratorService !== 'undefined' && typeof CollaboratorService.updateList === 'function') {
            CollaboratorService.updateList(window.app);
        }
    }
};

window.app = new SIGEPApp(); 

setTimeout(() => {
    if (window.app && typeof window.app.deletePauta === 'function') {
        window.app.deletePauta = window.app.deletePauta.bind(window.app);
    }
}, 500);

document.addEventListener('blur', async (e) => {
    if (e.target.id === 'cep-reu') {
        const cep = e.target.value.replace(/\D/g, '');
        if (cep.length === 8) {
            try {
                const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
                const data = await response.json();
                if (!data.erro) {
                    document.getElementById('rua-reu').value = data.logradouro || '';
                    document.getElementById('bairro-reu').value = data.bairro || '';
                    document.getElementById('cidade-reu').value = data.localidade || '';
                    document.getElementById('estado-reu').value = data.uf || '';
                } else {
                    showNotification("CEP não encontrado", "error");
                }
            } catch (error) {
                showNotification("Erro ao buscar CEP", "error");
            }
        }
    }
}, true);

document.addEventListener('DOMContentLoaded', function() {
    const toggleBtn = document.getElementById('toggle-logic-btn-padrao');
    const content = document.getElementById('logic-explanation-padrao-content');
    
    if (toggleBtn && content) {
        toggleBtn.addEventListener('click', function(e) {
            e.preventDefault();
            content.classList.toggle('hidden');
            if (content.classList.contains('hidden')) {
                toggleBtn.textContent = 'Por que esta ordem é a mais justa? (Clique para expandir)';
            } else {
                toggleBtn.textContent = 'Por que esta ordem é a mais justa? (Clique para recolher)';
            }
        });
    }
});
            return 0;
        });
        
        if (typeof CollaboratorService !== 'undefined' && typeof CollaboratorService.renderModalList === 'function') {
            CollaboratorService.renderModalList(window.app);
        } else if (typeof CollaboratorService !== 'undefined' && typeof CollaboratorService.updateList === 'function') {
            CollaboratorService.updateList(window.app);
        }
    }
};

window.app = new SIGEPApp(); 

setTimeout(() => {
    if (window.app && typeof window.app.deletePauta === 'function') {
        window.app.deletePauta = window.app.deletePauta.bind(window.app);
    }
}, 500);

document.addEventListener('blur', async (e) => {
    if (e.target.id === 'cep-reu') {
        const cep = e.target.value.replace(/\D/g, '');
        if (cep.length === 8) {
            try {
                const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
                const data = await response.json();
                if (!data.erro) {
                    document.getElementById('rua-reu').value = data.logradouro || '';
                    document.getElementById('bairro-reu').value = data.bairro || '';
                    document.getElementById('cidade-reu').value = data.localidade || '';
                    document.getElementById('estado-reu').value = data.uf || '';
                } else {
                    showNotification("CEP não encontrado", "error");
                }
            } catch (error) {
                showNotification("Erro ao buscar CEP", "error");
            }
        }
    }
}, true);

document.addEventListener('DOMContentLoaded', function() {
    const toggleBtn = document.getElementById('toggle-logic-btn-padrao');
    const content = document.getElementById('logic-explanation-padrao-content');
    
    if (toggleBtn && content) {
        toggleBtn.addEventListener('click', function(e) {
            e.preventDefault();
            content.classList.toggle('hidden');
            if (content.classList.contains('hidden')) {
                toggleBtn.textContent = 'Por que esta ordem é a mais justa? (Clique para expandir)';
            } else {
                toggleBtn.textContent = 'Por que esta ordem é a mais justa? (Clique para recolher)';
            }
        });
    }
});
