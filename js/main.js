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

class SIGAPApp {
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
            showNotification("Erro ao iniciar o sistema", "error");
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
                    console.warn(`Arquivo não encontrado: ${item.url}`);
                }
            } catch (error) {
                console.error(`Erro ao buscar ${item.url}:`, error);
            }
        }
    }

    setupOfflinePersistence() {
        try {
            enableIndexedDbPersistence(this.db, { synchronizeTabs: true }).catch((err) => {
                if (err.code == 'failed-precondition') {
                    console.warn('⚠️ Persistência desativada: Múltiplas abas abertas.');
                }
            });
        } catch (e) {
            console.log("Erro ao ativar persistência:", e);
        }
    
        window.addEventListener('offline', () => {
            document.getElementById('offline-indicator')?.classList.remove('hidden');
        });
    
        window.addEventListener('online', () => {
            document.getElementById('offline-indicator')?.classList.add('hidden');
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
            } else {
                UIService.showScreen('login');
                document.getElementById('admin-panel-btn')?.classList.add('hidden');
                document.getElementById('admin-btn-main')?.classList.add('hidden');
            }
        });
    }

    setupEventListeners() {
        // --- AUTH ---
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

        // --- DASHBOARD E PAUTAS ---
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
                this.customRoomsList.forEach((room, index) => {
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
                await updateDoc(pautaRef, { customRooms: newRoomsList, rooms: newRoomsList });
                
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
                showNotification("Salas atualizadas com sucesso!", "success");
                
                if (typeof UIService.renderAssistedLists === 'function') UIService.renderAssistedLists(this);
                if (typeof PautaService.populateRoomSelects === 'function') PautaService.populateRoomSelects(this);
                
            } catch (error) {
                console.error("Erro ao salvar salas:", error);
                showNotification("Erro ao atualizar salas.", "error");
            }
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
                // CAPTURA CORRETA DO FLUXO DE DELEGAÇÃO E DISTRIBUIÇÃO
                const useDelegationFlow = document.querySelector('input[name="useDelegationFlow"]:checked')?.value === 'true';
                const useDistributionFlow = document.getElementById('check-use-distribution')?.checked || false;

                const novaPautaData = {
                    name: pautaName,
                    type: pautaType,
                    owner: user.uid,
                    members: [user.uid],
                    memberEmails: [user.email],
                    isClosed: false,
                    createdAt: new Date().toISOString(),
                    ordemAtendimento: document.querySelector('input[name="ordemAtendimento"]:checked')?.value || 'padrao',
                    useDelegationFlow: useDelegationFlow,
                    useDistributionFlow: useDistributionFlow
                };

                if (pautaType === 'multisala') {
                    novaPautaData.customRooms = this.customRoomsList;
                    novaPautaData.rooms = this.customRoomsList;
                }

                const pautaRef = await addDoc(collection(this.db, "pautas"), novaPautaData);
        
                if (orgaoId) {
                    showNotification("Sincronizando com base de dados Solar/Verde...", "info");
                    if(typeof window.ApiIntegration !== 'undefined') {
                        const assistidosOficiais = await window.ApiIntegration.buscarDadosPautaOficial(orgaoId);
                        for (const ast of assistidosOficiais) {
                            await PautaService.addAssistedManual(this, {
                                ...ast,
                                status: 'pauta',
                                externalId: `INT-${orgaoId}-${Date.now()}-${Math.random()}` 
                            });
                        }
                        showNotification(`Integração concluída: ${assistidosOficiais.length} assistidos importados.`, 'success');
                    }
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
            UIService.showScreen('pautaSelection');
            if (this.auth?.currentUser) {
        document.getElementById('cancel-edit-pauta-btn')?.addEventListener('click', () => {
            document.getElementById('edit-pauta-modal')?.classList.add('hidden');
        });

        document.getElementById('send-delegate-email-btn')?.addEventListener('click', async () => {
            const emailInput = document.getElementById('collaborator-email-input');
            const emailDestino = emailInput?.value.trim();
            
            if (!emailDestino) {
                showNotification("Por favor, insira o e-mail ou deixe qualquer texto para gerar o link.", "error");
                return;
            }

            const btn = document.getElementById('send-delegate-email-btn');
            if (btn) { btn.disabled = true; btn.textContent = "Gerando Link Seguro..."; }

            let nomeColega = window.collaboratorNameForDelegation;
            if (!nomeColega || nomeColega === "Não informado" || nomeColega === "undefined") {
                nomeColega = "Colega Colaborador";
            }

            // GERA UM TOKEN DE SEGURANÇA ÚNICO SEM DEPENDER DO crypto.randomUUID
            const tokenSeguranca = Date.now().toString(36) + Math.random().toString(36).substring(2);

            try {
                // SALVA O TOKEN E O STATUS NO BANCO DE DADOS
                await updateDoc(doc(this.db, "pautas", this.currentPauta.id, "attendances", window.assistedIdForDelegation), {
                    status: 'emAtendimento',
                    assignedCollaborator: { email: emailDestino, name: nomeColega },
                    inAttendanceTime: new Date().toISOString(),
                    delegationToken: tokenSeguranca // <-- Salva a senha no Firestore
                });

                // ENVIA O EMAIL COM O TOKEN INCLUSO VIA EMAILJS
                await EmailService.sendDelegationEmail(
                    emailDestino, nomeColega, window.assistedNameForDelegation, this.currentUserName,
                    this.currentPauta.id, window.assistedIdForDelegation, tokenSeguranca
                );

                document.getElementById('delegate-email-modal')?.classList.add('hidden');
                if (emailInput) emailInput.value = '';
                
                showNotification(`Atendimento delegado com segurança para ${nomeColega}!`, "success");
            } catch (error) {
                console.error(error);
                showNotification("Erro ao delegar atendimento.", "error");
            } finally {
                if (btn) { btn.disabled = false; btn.textContent = "Enviar E-mail Seguro"; }
            }
        });

        document.getElementById('cancel-delegate-email-btn')?.addEventListener('click', () => {
            document.getElementById('delegate-email-modal')?.classList.add('hidden');
        });

        document.getElementById('tab-agendamento')?.addEventListener('click', () => { UIService.switchTab('agendamento', this); });
        document.getElementById('tab-avulso')?.addEventListener('click', () => { UIService.switchTab('avulso', this); });
        document.getElementById('actions-toggle')?.addEventListener('click', UIService.toggleActionsPanel);
        document.getElementById('toggle-faltosos-btn')?.addEventListener('click', UIService.toggleFaltosos);

        // Delegação centralizada de eventos dos botões de dentro dos cards para o UIService
        document.body.addEventListener('click', (e) => {
            if (e.target.closest('.assisted-card') || e.target.closest('.quick-action-toggle') || e.target.closest('.quick-menu')) {
                UIService.handleCardActions(e, this);
            }
        });

        NotesService.setup();
        UIService.setupFooterModals();
        this.setupSubjectsAutocomplete();
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
        console.log("⚙️ Aplicando preferências do usuário.");
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
            if (pautaType === 'agendado' && preferences.showFaltosos && pautaColumn && !pautaColumn.classList.contains('hidden')) {
                 faltososColumn.classList.remove('hidden');
            } else {
                faltososColumn.classList.add('hidden');
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
    }

    setupAdminPanel() {
        const btnAdmin = document.getElementById('admin-panel-btn');
        const adminModal = document.getElementById('admin-modal');
        if (btnAdmin && adminModal) {
            loadUsersList(this.db);
            populateUserFilter(this.db);
        }
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
            
            UIService.showScreen('app');
        } catch (error) {
            console.error("Erro ao carregar pauta:", error);
            showNotification("Erro ao carregar pauta", "error");
        }
    }

    async showPautaSelectionScreen() {
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
        pautasList.innerHTML = '<p class="col-span-full text-center py-8">Carregando pautas...</p>';
    
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
        } catch (error) {
            console.error("Erro ao carregar assistidos:", error);
        }
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

        const isApoio = currentUserRole === 'apoio'; 
        const addAssistedBtn = document.getElementById('add-assisted-btn');
        const fileUpload = document.getElementById('file-upload');
        const btnSyncVerde = document.getElementById('btn-sync-verde');

        if (addAssistedBtn) addAssistedBtn.disabled = !isAuthenticated; 
        if (fileUpload) fileUpload.disabled = isApoio;
        if (btnSyncVerde) btnSyncVerde.disabled = isApoio;
        
        if (typeof UIService !== 'undefined' && typeof UIService.renderAssistedLists === 'function') {
            UIService.renderAssistedLists(this); 
        }
    }
}

// ========================================================
// EXPORTS ADICIONAIS E GLOBAIS
// ========================================================
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

window.app = new SIGAPApp();

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

// Atraso seguro para o loadAtaData para não quebrar a tela de pautas
setTimeout(() => {
    try {
        if (window.CollaboratorService && typeof window.CollaboratorService.loadAtaData === 'function') {
            window.CollaboratorService.loadAtaData(window.app);
        }
    } catch (e) {
        console.warn("Erro silencioso ao carregar Ata Social:", e);
    }
}, 1000);
