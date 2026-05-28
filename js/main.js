// main.js - SIGEP APP PRINCIPAL (COMPLETO - SEM OPTIONAL CHAINING)

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/gstatic/firebasejs/11.6.1/firebase-auth.js";
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
import { 
    logAction, loadUsersList, cleanupOldData, approveUser, updateUserRole, 
    deleteUser, loadAuditLogs, exportAuditLogsPDF, loadDashboardData, 
    populateUserFilter, setupAdminSearch, abrirGerenciadorUnidades,
    abrirImportadorUnidades, abrirModalUsuariosPorUnidade, AdminService
} from './admin.js';
import { parsePautaCSV } from './csvHandler.js';
import { getChecklistHTML } from './checklist.js';
import { PainelGeralService } from './painelGeralService.js'; 

// IMPORTS DOS NOVOS MÓDULOS
import { PautaConfigService } from './pautaConfig.js';
import { RecepçãoCentralService } from './recepcaoCentral.js';
import { ImportadorOrgaosService } from './importadorOrgaos.js';
import { renderEstruturaAtual } from './estruturaAtual.js';
import { abrirModalNovaRecepcao } from './novaRecepcao.js';
import { abrirGerenciarUnidades as abrirGerenciarUnidadesUsuario } from './gerenciarUnidadesUsuario.js';

// 1. IMPORTAR E INJETAR OS MODAIS ANTES DE TUDO!
import { injetarModais } from './modais.js';
injetarModais();

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
        
        this.currentMode = localStorage.getItem('sigep_current_mode') || 'normal';
        
        this.init();
        console.log("SIGEPApp: init() foi chamado.");
    }

    async init() {
        console.log("SIGEPApp: Iniciando...");
        try {
            const app = initializeApp(firebaseConfig);
            this.db = getFirestore(app);
            this.auth = getAuth(app);
            
            console.log("Firebase inicializado:", !!this.db && !!this.auth);

            DashboardService.init(this);

            await this.setupOfflinePersistence();
            this.setupEventListeners();
            this.setupAuthListener();
            
            setupDetailsModal({ db: this.db });
            this.loadExternalModalsContent();
            
            PautaConfigService.init(this);
            this.setupModoListeners();
            
            window.app = this;
            
            if (AdminService && typeof AdminService.setupAdminEvents === 'function') {
                AdminService.setupAdminEvents(this);
            }
            console.log("SIGEPApp: Inicialização concluída com sucesso.");
        } catch (error) {
            console.error("SIGEPApp: ERRO NA INICIALIZAÇÃO", error)
            console.error("Erro na inicialização:", error);
            showNotification("Erro ao iniciar o sistema SIGEP", "error");
        }
    }

    // ============================================================
    // ADMIN EM TELA CHEIA (IGUAL DASHBOARD)
    // ============================================================
    
    showAdminScreen() {
        localStorage.setItem('sigep_active_screen', 'admin');
        UIService.showScreen('admin');
        this.renderAdminContent();
    }

    renderAdminContent() {
        const container = document.getElementById('admin-content');
        if (!container) return;
        
        container.innerHTML = `
            <div class="mb-6">
                <button id="btn-unidades-master" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2.5 rounded-xl transition shadow-md flex items-center gap-2 text-sm">
                    <span>🏢</span> Gerenciar Unidades / Órgãos
                </button>
            </div>
            
            <div class="mb-4 flex flex-wrap gap-4 items-center justify-between">
                <div id="search-pendentes" class="w-full sm:w-80"></div>
                <div id="page-size-pendentes"></div>
            </div>
            <div class="mb-8">
                <h3 class="text-lg font-bold text-amber-700 mb-3 border-b pb-2">⏳ Usuários Pendentes</h3>
                <div id="pending-users-list" class="space-y-2"></div>
                <div id="pagination-pendentes" class="mt-4"></div>
            </div>
            
            <div class="mt-8 mb-4 flex flex-wrap gap-4 items-center justify-between">
                <div id="search-usuarios" class="w-full sm:w-80"></div>
                <div id="page-size-usuarios"></div>
            </div>
            <div>
                <h3 class="text-lg font-bold text-slate-800 mb-3 border-b pb-2">👥 Usuários do Sistema</h3>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm border-collapse">
                        <thead class="bg-slate-100">
                            <tr><th class="p-3 text-left">Usuário</th><th class="p-3 text-left">E-mail</th><th class="p-3 text-center">Unidades</th><th class="p-3 text-center">Perfil</th><th class="p-3 text-center">Ações</th></tr></thead>
                            <tbody id="approved-users-list" class="divide-y divide-slate-100"></tbody>
                        </table>
                </div>
                <div id="pagination-usuarios" class="mt-4"></div>
            </div>
            
            <div class="mt-8 pt-4 border-t">
                <div class="flex flex-wrap gap-3 mb-4">
                    <button id="view-audit-logs-btn" class="bg-blue-600 text-white px-4 py-2 rounded-lg">🔍 Carregar Logs</button>
                    <button id="export-audit-pdf-btn" class="hidden bg-red-600 text-white px-4 py-2 rounded-lg">📄 Exportar PDF</button>
                    <button id="cleanup-old-data-btn" class="bg-amber-600 text-white px-4 py-2 rounded-lg">🗑️ Limpar Dados</button>
                    <button id="btn-load-dashboard" class="bg-emerald-600 text-white px-4 py-2 rounded-lg">📊 BI Dashboard</button>
                </div>
                
                <div class="mb-4 flex flex-wrap gap-4 items-center justify-between">
                    <div id="search-logs" class="w-full sm:w-80"></div>
                    <div id="page-size-logs"></div>
                </div>
                
                <div id="audit-filters-section" class="hidden grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
                    <select id="filter-log-user"><option value="all">Todos usuários</option></select>
                    <select id="filter-log-action"><option value="all">Todas ações</option></select>
                    <input type="date" id="filter-log-start">
                    <input type="date" id="filter-log-end">
                </div>
                <div id="audit-logs-container" class="hidden overflow-x-auto">
                    <div class="border rounded-xl overflow-hidden">
                        <table class="w-full text-sm">
                            <thead class="bg-slate-100"><tr><th class="p-3">Data/Hora</th><th>Usuário</th><th>Ação</th><th>Detalhes</th></tr></thead>
                            <tbody id="audit-logs-table-body"></tbody>
                        </table>
                    </div>
                </div>
                <div id="pagination-logs" class="mt-4"></div>
                <div id="dashboard-results" class="hidden mt-6"></div>
            </div>
        `;
        
        if (typeof setupAdminSearch === 'function') {
            setupAdminSearch();
        }
        
        if (typeof loadUsersList === 'function') {
            loadUsersList(this.db);
        }
        if (typeof populateUserFilter === 'function') {
            populateUserFilter(this.db);
        }
        this.setupAdminPanelEvents();   
    }

    setupAdminPanelEvents() {
        const btnUnidadesMaster = document.getElementById('btn-unidades-master');
        if (btnUnidadesMaster) {
            btnUnidadesMaster.addEventListener('click', () => {
                if (ImportadorOrgaosService && typeof ImportadorOrgaosService.abrirModalMaster === 'function') {
                    ImportadorOrgaosService.abrirModalMaster(this);
                } else if (typeof abrirGerenciadorUnidades === 'function') {
                    abrirGerenciadorUnidades(this.db);
                }
            });
        }
        
        const adminBackBtn = document.getElementById('admin-back-to-pautas-btn');
        if (adminBackBtn) {
            adminBackBtn.addEventListener('click', () => {
                this.showPautaSelectionScreen();
            });
        }
        
        const viewAuditBtn = document.getElementById('view-audit-logs-btn');
        if (viewAuditBtn) {
            viewAuditBtn.addEventListener('click', async () => {
                const btn = document.getElementById('view-audit-logs-btn');
                if (btn) {
                    btn.textContent = "Carregando...";
                    btn.disabled = true;
                }
                await loadAuditLogs(this.db);
                if (btn) {
                    btn.textContent = "🔍 Carregar Logs";
                    btn.disabled = false;
                }
            });
        }
        
        const cleanupBtn = document.getElementById('cleanup-old-data-btn');
        if (cleanupBtn) {
            cleanupBtn.addEventListener('click', () => {
                cleanupOldData(this.db);
            });
        }
        
        const loadDashboardBtn = document.getElementById('btn-load-dashboard');
        if (loadDashboardBtn) {
            loadDashboardBtn.addEventListener('click', () => {
                loadDashboardData(this.db);
            });
        }
        
        const exportAuditBtn = document.getElementById('export-audit-pdf-btn');
        if (exportAuditBtn) {
            exportAuditBtn.addEventListener('click', () => {
                exportAuditLogsPDF(this.db);
            });
        }
        
        const filterLogUser = document.getElementById('filter-log-user');
        if (filterLogUser) {
            filterLogUser.addEventListener('change', () => loadAuditLogs(this.db));
        }
        
        const filterLogAction = document.getElementById('filter-log-action');
        if (filterLogAction) {
            filterLogAction.addEventListener('change', () => loadAuditLogs(this.db));
        }
        
        const filterLogStart = document.getElementById('filter-log-start');
        if (filterLogStart) {
            filterLogStart.addEventListener('change', () => loadAuditLogs(this.db));
        }
        
        const filterLogEnd = document.getElementById('filter-log-end');
        if (filterLogEnd) {
            filterLogEnd.addEventListener('change', () => loadAuditLogs(this.db));
        }
    }

    // ============================================================
    // MÉTODO: setupModoListeners
    // ============================================================
    setupModoListeners() {
        const btnModoNormal = document.getElementById('btn-modo-normal');
        if (btnModoNormal) {
            btnModoNormal.addEventListener('click', async () => {
                this.currentMode = 'normal';
                localStorage.setItem('sigep_current_mode', 'normal');
                localStorage.setItem('sigep_active_screen', 'pauta-selection');
                localStorage.removeItem('sigep_app_state');
                await this.showPautaSelectionScreen();
                this.applyRoleBasedUI();
                showNotification('Modo Normal ativado - Atendimento regular', 'info', 3000);
            });
        }
    
        const btnModoEvento = document.getElementById('btn-modo-evento');
        if (btnModoEvento) {
            btnModoEvento.addEventListener('click', async () => {
                this.currentMode = 'evento';
                localStorage.setItem('sigep_current_mode', 'evento');
                localStorage.setItem('sigep_active_screen', 'pauta-selection');
                localStorage.removeItem('sigep_app_state');
                await this.showPautaSelectionScreen();
                this.applyRoleBasedUI();
                showNotification('Modo Evento ativado - Mutirão/Plantão/Ação Social', 'info', 3000);
            });
        }
    }

    // ============================================================
    // MÉTODO: voltarParaSelecaoModo
    // ============================================================
    voltarParaSelecaoModo() {
        if (this.unsubscribeFromAttendances) this.unsubscribeFromAttendances();
        if (this.unsubscribeFromCollaborators) this.unsubscribeFromCollaborators();
        
        this.currentPauta = null;
        this.allAssisted = [];
        this.colaboradores = [];
        
        if (this.monitorInterval) { 
            clearInterval(this.monitorInterval); 
            this.monitorInterval = null; 
        }
        
        const buttons = document.querySelectorAll('[id^="btn-colabs-disponiveis-"]');
        for (var i = 0; i < buttons.length; i++) {
            buttons[i].remove();
        }

        UIService.showScreen('modoSelection');
        this.applyRoleBasedUI();
        showNotification('Modo alterado com sucesso!', 'info', 2000);
    }

    // ============================================================
    // mostrarSeletorTipoEvento
    // ============================================================
    mostrarSeletorTipoEvento() {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
            modal.innerHTML = `
                <div class="bg-white rounded-xl p-6 max-w-md w-full mx-4">
                    <h3 class="text-lg font-bold mb-2"> Tipo de Evento</h3>
                    <p class="text-sm text-gray-600 mb-4">Selecione o tipo da pauta:</p>
                    <div class="space-y-3">
                        <button class="tipo-evento-btn w-full text-left p-3 border rounded-lg hover:bg-blue-50 transition" data-tipo="mutirao">
                            <div class="font-bold"> Mutirão</div>
                            <div class="text-xs text-gray-500">Evento concentrado com múltiplos atendimentos</div>
                        </button>
                        <button class="tipo-evento-btn w-full text-left p-3 border rounded-lg hover:bg-blue-50 transition" data-tipo="plantao">
                            <div class="font-bold"> Plantão</div>
                            <div class="text-xs text-gray-500">Atendimento emergencial contínuo</div>
                        </button>
                        <button class="tipo-evento-btn w-full text-left p-3 border rounded-lg hover:bg-blue-50 transition" data-tipo="acao_social">
                            <div class="font-bold"> Ação Social</div>
                            <div class="text-xs text-gray-500">Atividade comunitária externa</div>
                        </button>
                    </div>
                    <button id="cancel-tipo-evento" class="mt-4 w-full p-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition">Cancelar</button>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            const handleSelect = (tipo) => {
                modal.remove();
                resolve(tipo);
            };
            
            const tipoBtns = modal.querySelectorAll('.tipo-evento-btn');
            for (var i = 0; i < tipoBtns.length; i++) {
                tipoBtns[i].addEventListener('click', function() {
                    handleSelect(this.dataset.tipo);
                });
            }
            
            const cancelBtn = modal.querySelector('#cancel-tipo-evento');
            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => {
                    modal.remove();
                    resolve(null);
                });
            }
        });
    }

    // ============================================================
    // mostrarIndicadorModo
    // ============================================================
    mostrarIndicadorModo() {
        let indicador = document.getElementById('modo-indicador');
        
        if (!indicador) {
            indicador = document.createElement('div');
            indicador.id = 'modo-indicador';
            document.body.appendChild(indicador);
        }
        
        if (this.currentMode === 'normal') {
            indicador.textContent = 'Modo Normal';
            indicador.className = 'fixed top-4 right-4 z-50 px-4 py-2 rounded-full text-white font-bold shadow-lg bg-blue-600 transition-all duration-300';
        } else {
            indicador.textContent = 'Modo Evento';
            indicador.className = 'fixed top-4 right-4 z-50 px-4 py-2 rounded-full text-white font-bold shadow-lg bg-purple-600 transition-all duration-300';
        }
        
        indicador.style.display = 'block';
        indicador.style.opacity = '1';
        
        setTimeout(() => {
            indicador.style.opacity = '0';
            setTimeout(() => {
                if (indicador) indicador.style.display = 'none';
            }, 500);
        }, 3000);
    }

    // ============================================================
    // setupAuthListener
    // ============================================================
    setupAuthListener() {
        onAuthStateChanged(this.auth, async (user) => {
            if (user) {
                await AuthService.handleAuthState(this, user);
                await this.loadUserPreferences(); 
                this.applyRoleBasedUI(); 
                
                const telaAtiva = localStorage.getItem('sigep_active_screen');
                const pautaId   = localStorage.getItem('lastPautaId');
                const pautaNome = localStorage.getItem('lastPautaName');
                const pautaTipo = localStorage.getItem('lastPautaType');

                if (telaAtiva === 'app' && pautaId && pautaNome) {
                    await this.loadPauta(pautaId, pautaNome, pautaTipo);
                } else if (telaAtiva === 'pauta-selection') {
                    await this.showPautaSelectionScreen();
                } else if (telaAtiva === 'dashboard') {
                    DashboardService.showDashboardScreen();
                } else if (telaAtiva === 'recepcao-central') {
                    await RecepçãoCentralService.abrir(this);
                } else if (telaAtiva === 'admin') {
                    this.showAdminScreen();
                } else {
                    UIService.showScreen('modoSelection');
                }

            } else {
                UIService.showScreen('login');
                const adminPanelBtn = document.getElementById('admin-panel-btn');
                if (adminPanelBtn) adminPanelBtn.classList.add('hidden');
                const adminBtnMain = document.getElementById('admin-btn-main');
                if (adminBtnMain) adminBtnMain.classList.add('hidden');
            }
        });
    }

    // ============================================================
    // setupOfflinePersistence
    // ============================================================
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
            const offlineIndicator = document.getElementById('offline-indicator');
            if (offlineIndicator) offlineIndicator.classList.remove('hidden');
        });
    
        window.addEventListener('online', () => {
            const offlineIndicator = document.getElementById('offline-indicator');
            if (offlineIndicator) offlineIndicator.classList.add('hidden');
            showNotification("Conexão restabelecida!", "success");
            playSound('notification');
        });
    }

    // ============================================================
    // loadExternalModalsContent
    // ============================================================
    async loadExternalModalsContent() {
        const modalsToLoad = [
            { selector: '#policy-content', url: './politica.html' },
            { selector: '#manual-modal .scrollable-content', url: './manual.html' },
            { selector: '#terms-modal .scrollable-content', url: './termos.html' }
        ];

        for (var i = 0; i < modalsToLoad.length; i++) {
            const item = modalsToLoad[i];
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

    // ============================================================
    // setupEventListeners - COMPLETO (SEM OPTIONAL CHAINING)
    // ============================================================
    setupEventListeners() {
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => { 
                e.preventDefault(); 
                AuthService.login(this); 
            });
        }

        const registerForm = document.getElementById('register-form');
        if (registerForm) {
            registerForm.addEventListener('submit', (e) => { 
                e.preventDefault(); 
                AuthService.register(this); 
            });
        }

        const forgotPass = document.getElementById('forgot-password-link');
        if (forgotPass) {
            forgotPass.addEventListener('click', (e) => { 
                e.preventDefault(); 
                AuthService.resetPassword(this.auth); 
            });
        }

        const loginTab = document.getElementById('login-tab-btn');
        if (loginTab) {
            loginTab.addEventListener('click', () => UIService.toggleAuthTabs('login'));
        }

        const registerTab = document.getElementById('register-tab-btn');
        if (registerTab) {
            registerTab.addEventListener('click', () => UIService.toggleAuthTabs('register'));
        }

        const logoutBtns = document.querySelectorAll('#logout-btn-main, #logout-btn-app');
        for (var i = 0; i < logoutBtns.length; i++) {
            logoutBtns[i].addEventListener('click', () => AuthService.logout(this.auth));
        }

        const callNextBtn = document.getElementById('call-next-assisted-btn');
        if (callNextBtn) {
            callNextBtn.addEventListener('click', () => PautaService.callNextAssisted(this));
        }

        const viewDashBtn = document.getElementById('view-dashboard-btn');
        if (viewDashBtn) {
            viewDashBtn.addEventListener('click', () => DashboardService.showDashboardScreen());
        }

        const dashBackBtn = document.getElementById('dashboard-back-to-pautas-btn');
        if (dashBackBtn) {
            dashBackBtn.addEventListener('click', () => this.showPautaSelectionScreen());
        }

        const btnRecepcao = document.getElementById('btn-recepcao-central');
        if (btnRecepcao) {
            btnRecepcao.addEventListener('click', async () => await RecepçãoCentralService.abrir(this));
        }

        const btnModo = document.getElementById('btn-trocar-modo');
        if (btnModo) {
            btnModo.addEventListener('click', () => this.voltarParaSelecaoModo());
        }

        const btnModoApp = document.getElementById('btn-trocar-modo-app');
        if (btnModoApp) {
            btnModoApp.addEventListener('click', () => this.voltarParaSelecaoModo());
        }

        const createPautaBtn = document.getElementById('create-pauta-btn');
        if (createPautaBtn) {
            createPautaBtn.addEventListener('click', () => {
                const typeModal = document.getElementById('pauta-type-modal');
                if (typeModal) typeModal.classList.remove('hidden');
                else showNotification("Modal de tipo de pauta não encontrado.", "error");
            });
        }

        // Correção das referências para evitar erro de escopo
        const pautaSettingsPanel = document.getElementById('pauta-settings-panel');
        const pautaSettingsToggle = document.getElementById('pauta-settings-toggle');

        document.addEventListener('click', (e) => {
            if (pautaSettingsPanel && pautaSettingsToggle) {
                if (!pautaSettingsPanel.classList.contains('hidden') && 
                    !pautaSettingsPanel.contains(e.target) && 
                    !pautaSettingsToggle.contains(e.target)) {
                    pautaSettingsPanel.classList.add('hidden');
                }
            }
        });

        // Toggles de preferência corrigidos
        const toggleEmAtendimento = document.getElementById('toggle-em-atendimento');
        if (toggleEmAtendimento) {
            toggleEmAtendimento.addEventListener('change', () => this.saveColumnPreferences());
        }

        const toggleDistribuicao = document.getElementById('toggle-distribuicao');
        if (toggleDistribuicao) {
            toggleDistribuicao.addEventListener('change', () => this.saveColumnPreferences());
        }

        const toggleFaltosos = document.getElementById('toggle-faltosos');
        if (toggleFaltosos) {
            toggleFaltosos.addEventListener('change', () => this.saveColumnPreferences());
        }

        // Btn manage rooms
        const btnManageRooms = document.getElementById('btn-manage-rooms');
        if (btnManageRooms) {
            btnManageRooms.addEventListener('click', () => {
                const listContainer = document.getElementById('manage-rooms-list');
                if (!listContainer) return;
                
                listContainer.innerHTML = '';
                
                if (this.currentPautaData && this.currentPautaData.type === 'multisala' && this.customRoomsList && this.customRoomsList.length > 0) {
                    for (var r = 0; r < this.customRoomsList.length; r++) {
                        const room = this.customRoomsList[r];
                        const div = document.createElement('div');
                        div.className = "flex gap-2 items-center mb-3 bg-gray-50 p-2 rounded-lg border";
                        div.innerHTML = `
                            <span class="text-gray-500">🏢</span>
                            <input type="text" class="room-edit-input flex-1 p-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none" data-original="${escapeHTML(room)}" value="${escapeHTML(room)}">
                        `;
                        listContainer.appendChild(div);
                    }
                } else {
                    listContainer.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">Nenhuma sala configurada ou a pauta não é Multi-Salas.</p>';
                }
                
                const manageRoomsModal = document.getElementById('manage-rooms-modal');
                if (manageRoomsModal) manageRoomsModal.classList.remove('hidden');
            });
        }

        const cancelManageRoomsBtn = document.getElementById('cancel-manage-rooms-btn');
        if (cancelManageRoomsBtn) {
            cancelManageRoomsBtn.addEventListener('click', () => {
                const manageRoomsModal = document.getElementById('manage-rooms-modal');
                if (manageRoomsModal) manageRoomsModal.classList.add('hidden');
            });
        }

        const saveManageRoomsBtn = document.getElementById('save-manage-rooms-btn');
        if (saveManageRoomsBtn) {
            saveManageRoomsBtn.addEventListener('click', async () => {
                const inputs = document.querySelectorAll('.room-edit-input');
                const newRoomsList = [];
                const roomChanges = []; 
                
                for (var i2 = 0; i2 < inputs.length; i2++) {
                    const input = inputs[i2];
                    const newName = input.value.trim();
                    const oldName = input.dataset.original;
                    if (newName) {
                        newRoomsList.push(newName);
                        if (newName !== oldName) {
                            roomChanges.push({ oldName, newName });
                        }
                    }
                }

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
                        
                        for (var i3 = 0; i3 < this.allAssisted.length; i3++) {
                            const assisted = this.allAssisted[i3];
                            if (assisted.room) {
                                for (var c = 0; c < roomChanges.length; c++) {
                                    const change = roomChanges[c];
                                    if (change.oldName === assisted.room) {
                                        const attRef = doc(this.db, "pautas", this.currentPauta.id, "attendances", assisted.id);
                                        batch.update(attRef, { room: change.newName });
                                        hasChanges = true;
                                        break;
                                    }
                                }
                            }
                        }
                        
                        if (hasChanges) await batch.commit();
                    }

                    const manageRoomsModal = document.getElementById('manage-rooms-modal');
                    if (manageRoomsModal) manageRoomsModal.classList.add('hidden');
                    showNotification("Salas atualizadas com sucesso!", "success");
                    
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
        }

        const aguardandoList = document.getElementById('aguardando-list');
        if (aguardandoList) {
            aguardandoList.addEventListener('input', (e) => {
                if (e.target.classList.contains('room-search-input')) {
                    const query = e.target.value.toLowerCase();
                    const roomContainer = e.target.closest('.room-group-container'); 
                    if (roomContainer) {
                        const cards = roomContainer.querySelectorAll('.assisted-card'); 
                        for (var i4 = 0; i4 < cards.length; i4++) {
                            const card = cards[i4];
                            const text = card.textContent.toLowerCase();
                            card.style.display = text.includes(query) ? '' : 'none';
                        }
                    }
                }
            });
        }

        const btnMetricaAtendidos = document.getElementById('btn-metrica-atendidos');
        if (btnMetricaAtendidos) {
            btnMetricaAtendidos.addEventListener('click', () => {
                const atendidos = (this.allAssisted || []).filter(function(a) { return a.status === 'atendido'; });
                PDFService.generateAtendidosPDF(atendidos, this.currentPauta ? this.currentPauta.name : 'Pauta');
            });
        }

        const btnGerarAta = document.getElementById('btn-gerar-ata-social');
        if (btnGerarAta) {
            btnGerarAta.addEventListener('click', () => {
                if (!this.currentPauta) {
                    showNotification("Nenhuma pauta selecionada!", "error");
                    return;
                }
                const totalAtendidos = this.allAssisted.filter(function(a) { return a.status === 'atendido'; }).length;
                const ataNome = document.getElementById('ata-acao-nome');
                const ataData = document.getElementById('ata-data');
                const ataTotal = document.getElementById('ata-total');
                if (ataNome) ataNome.value = this.currentPauta.name || '';
                if (ataData) ataData.value = new Date().toISOString().split('T')[0];
                if (ataTotal) ataTotal.value = totalAtendidos;
                const ataEndereco = document.getElementById('ata-endereco');
                if (ataEndereco) ataEndereco.value = '';
                const ataOrgao = document.getElementById('ata-orgao');
                if (ataOrgao) ataOrgao.value = '';
                const ataModal = document.getElementById('ata-social-modal');
                if (ataModal) ataModal.classList.remove('hidden');
            });
        }
        
        const confirmAtaBtn = document.getElementById('confirm-ata-modal-btn');
        if (confirmAtaBtn) {
            confirmAtaBtn.addEventListener('click', () => {
                const acaoNome = document.getElementById('ata-acao-nome');
                const acaoNomeValue = acaoNome ? acaoNome.value.trim() : '';
                const endereco = document.getElementById('ata-endereco');
                const enderecoValue = endereco ? endereco.value.trim() : '';
                const dataAcao = document.getElementById('ata-data');
                const dataAcaoValue = dataAcao ? dataAcao.value : '';
                const orgaoNome = document.getElementById('ata-orgao');
                const orgaoNomeValue = orgaoNome ? orgaoNome.value.trim() : '';
                const totalManual = document.getElementById('ata-total');
                const totalManualValue = totalManual ? totalManual.value : '';
                
                if (!acaoNomeValue || !enderecoValue || !dataAcaoValue || !orgaoNomeValue || !totalManualValue || totalManualValue < 0) {
                    showNotification("Preencha todos os campos corretamente.", "error");
                    return;
                }
                
                const atendidos = this.allAssisted.filter(function(a) { return a.status === 'atendido'; });
                const dadosExtras = { 
                    acao: acaoNomeValue, 
                    endereco: enderecoValue, 
                    data: dataAcaoValue, 
                    orgao: orgaoNomeValue, 
                    totalAtendimentos: totalManualValue 
                };
                
                const ataModal = document.getElementById('ata-social-modal');
                if (ataModal) ataModal.classList.add('hidden');
                
                if (confirm("Deseja VISUALIZAR a Ata antes de baixar?")) {
                    PDFService.previewAtaAcaoSocial(this.currentPauta ? this.currentPauta.name : '', this.colaboradores, atendidos, dadosExtras);
                } else {
                    PDFService.generateAtaAcaoSocial(this.currentPauta ? this.currentPauta.name : '', this.colaboradores, atendidos, dadosExtras);
                }
            });
        }
        
        const cancelAtaBtn = document.getElementById('cancel-ata-modal-btn');
        if (cancelAtaBtn) {
            cancelAtaBtn.addEventListener('click', () => {
                const ataModal = document.getElementById('ata-social-modal');
                if (ataModal) ataModal.classList.add('hidden');
            });
        }
        
        document.addEventListener('click', (e) => {
            const quickToggle = e.target.closest('.quick-action-toggle');
            if (!quickToggle) {
                const quickMenus = document.querySelectorAll('.quick-menu-box');
                for (var i5 = 0; i5 < quickMenus.length; i5++) {
                    quickMenus[i5].classList.add('hidden');
                }
            }
        });

        const scheduledRadios = document.querySelectorAll('input[name="is-scheduled"]');
        for (var i6 = 0; i6 < scheduledRadios.length; i6++) {
            scheduledRadios[i6].addEventListener('change', (e) => {
                const wrapper = document.getElementById('scheduled-time-wrapper');
                if (wrapper) {
                    if (e.target.value === 'yes') wrapper.classList.remove('hidden');
                    else wrapper.classList.add('hidden');
                }
            });
        }

        const arrivalRadios = document.querySelectorAll('input[name="has-arrived"]');
        for (var i7 = 0; i7 < arrivalRadios.length; i7++) {
            arrivalRadios[i7].addEventListener('change', (e) => {
                const wrapper = document.getElementById('arrival-time-wrapper');
                if (wrapper) {
                    if (e.target.value === 'yes') {
                        wrapper.classList.remove('hidden');
                        const arrivalTime = document.getElementById('arrival-time');
                        if (arrivalTime) arrivalTime.value = new Date().toTimeString().slice(0, 5);
                    } else {
                        wrapper.classList.add('hidden');
                    }
                }
            });
        }

        const tabAgendamento = document.getElementById('tab-agendamento');
        if (tabAgendamento) {
            tabAgendamento.addEventListener('click', () => {
                const scheduledWrapper = document.getElementById('scheduled-time-wrapper');
                if (scheduledWrapper) scheduledWrapper.classList.add('hidden');
                const arrivalWrapper = document.getElementById('arrival-time-wrapper');
                if (arrivalWrapper) arrivalWrapper.classList.add('hidden');
                const scheduledNo = document.querySelector('input[name="is-scheduled"][value="no"]');
                if (scheduledNo) scheduledNo.checked = true;
                const arrivalNo = document.querySelector('input[name="has-arrived"][value="no"]');
                if (arrivalNo) arrivalNo.checked = true;
            });
        }

        const tabAvulso = document.getElementById('tab-avulso');
        if (tabAvulso) {
            tabAvulso.addEventListener('click', () => {
                const arrivalYes = document.querySelector('input[name="has-arrived"][value="yes"]');
                if (arrivalYes) arrivalYes.checked = true;
                const arrivalWrapper = document.getElementById('arrival-time-wrapper');
                if (arrivalWrapper) {
                    arrivalWrapper.classList.remove('hidden');
                    const arrivalTime = document.getElementById('arrival-time');
                    if (arrivalTime) arrivalTime.value = new Date().toTimeString().slice(0, 5);
                }
                const scheduledWrapper = document.getElementById('scheduled-time-wrapper');
                if (scheduledWrapper) scheduledWrapper.classList.add('hidden');
            });
        }

        const backToPautasBtn = document.getElementById('back-to-pautas-btn');
        if (backToPautasBtn) {
            backToPautasBtn.addEventListener('click', () => {
                if (this.unsubscribeFromAttendances) this.unsubscribeFromAttendances();
                if (this.unsubscribeFromCollaborators) this.unsubscribeFromCollaborators();
                
                this.currentPauta = null;
                this.allAssisted = [];
                this.colaboradores = [];
                
                localStorage.removeItem('lastPautaId');
                localStorage.removeItem('lastPautaName');
                localStorage.removeItem('lastPautaType');

                if (this.monitorInterval) { 
                    clearInterval(this.monitorInterval); 
                    this.monitorInterval = null; 
                }
                
                const buttons = document.querySelectorAll('[id^="btn-colabs-disponiveis-"]');
                for (var i8 = 0; i8 < buttons.length; i8++) {
                    buttons[i8].remove();
                }

                UIService.showScreen('pautaSelection');
                if (this.auth && this.auth.currentUser) {
                    this.showPautaSelectionScreen();
                }
            });
        }

        const tabAgendamento2 = document.getElementById('tab-agendamento');
        if (tabAgendamento2) {
            tabAgendamento2.addEventListener('click', () => {
                UIService.switchTab('agendamento', this);
            });
        }
        
        const tabAvulso2 = document.getElementById('tab-avulso');
        if (tabAvulso2) {
            tabAvulso2.addEventListener('click', () => {
                UIService.switchTab('avulso', this);
            });
        }

        const actionsToggle = document.getElementById('actions-toggle');
        if (actionsToggle) {
            actionsToggle.addEventListener('click', UIService.toggleActionsPanel);
        }

        const btnPainelGeral = document.getElementById('btn-painel-geral-externo');
        if (btnPainelGeral) {
            btnPainelGeral.addEventListener('click', () => {
                if (typeof PainelGeralService !== 'undefined') {
                    PainelGeralService.abrirPainel(this);
                    const actionsPanel = document.getElementById('actions-panel');
                    if (actionsPanel) {
                        actionsPanel.classList.add('opacity-0', 'scale-95', 'pointer-events-none');
                        const actionsArrow = document.getElementById('actions-arrow');
                        if (actionsArrow) actionsArrow.classList.remove('rotate-180');
                    }
                } else {
                    showNotification("Módulo do painel não carregado.", "error");
                }
            });
        }
        
        const sharePautaBtn = document.getElementById('share-pauta-btn');
        if (sharePautaBtn) {
            sharePautaBtn.addEventListener('click', () => {
                const modal = document.getElementById('share-modal');
                if (modal) {
                    const toggle = document.getElementById('share-toggle');
                    const maskCheck = document.getElementById('mask-names-check');
                    
                    if (this.currentPautaData) {
                        if (toggle) toggle.checked = this.currentPautaData.isPublic || false;
                        if (maskCheck) maskCheck.checked = this.currentPautaData.maskNames || false;
                        
                        const statusText = document.getElementById('share-status-text');
                        if (statusText) statusText.textContent = toggle ? (toggle.checked ? "Público" : "Privado") : "Privado";
                        
                        const linkContainer = document.getElementById('share-link-container');
                        if (linkContainer) {
                            if (toggle && toggle.checked) {
                                linkContainer.classList.remove('hidden');
                                const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
                                const link = baseUrl + '/acompanhamento.html?id=' + this.currentPauta.id;
                                const shareLinkInput = document.getElementById('share-link-input');
                                if (shareLinkInput) shareLinkInput.value = link;
                                const openExternalBtn = document.getElementById('open-external-btn');
                                if (openExternalBtn) openExternalBtn.href = link;
                            } else {
                                linkContainer.classList.add('hidden');
                            }
                        }
                    }
                    modal.classList.remove('hidden');
                }
            });
        }

        const shareToggle = document.getElementById('share-toggle');
        if (shareToggle) {
            shareToggle.addEventListener('change', async (e) => {
                const isPublic = e.target.checked;
                const statusText = document.getElementById('share-status-text');
                if (statusText) statusText.textContent = isPublic ? "Público" : "Privado";
                
                const linkContainer = document.getElementById('share-link-container');
                if (linkContainer) {
                    if (isPublic) {
                        linkContainer.classList.remove('hidden');
                        const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
                        const link = baseUrl + '/acompanhamento.html?id=' + this.currentPauta.id;
                        const shareLinkInput = document.getElementById('share-link-input');
                        if (shareLinkInput) shareLinkInput.value = link;
                        const openExternalBtn = document.getElementById('open-external-btn');
                        if (openExternalBtn) openExternalBtn.href = link;
                    } else {
                        linkContainer.classList.add('hidden');
                    }
                }
                
                try {
                    const pautaRef = doc(this.db, "pautas", this.currentPauta.id);
                    await updateDoc(pautaRef, { isPublic: isPublic });
                    if (this.currentPautaData) this.currentPautaData.isPublic = isPublic;
                    showNotification(isPublic ? "Link público ativado." : "Link público desativado.", "success");
                } catch (error) {
                    console.error(error);
                    showNotification("Erro ao atualizar status.", "error");
                }
            });
        }

        const copyShareLinkBtn = document.getElementById('copy-share-link-btn');
        if (copyShareLinkBtn) {
            copyShareLinkBtn.addEventListener('click', () => {
                const input = document.getElementById('share-link-input');
                if (input) {
                    input.select();
                    navigator.clipboard.writeText(input.value);
                    showNotification("Link copiado!", "info");
                }
            });
        }

        const maskNamesCheck = document.getElementById('mask-names-check');
        if (maskNamesCheck) {
            maskNamesCheck.addEventListener('change', async (e) => {
                const mask = e.target.checked;
                try {
                    const pautaRef = doc(this.db, "pautas", this.currentPauta.id);
                    await updateDoc(pautaRef, { maskNames: mask });
                    if (this.currentPautaData) this.currentPautaData.maskNames = mask;
                    showNotification("Configuração de privacidade atualizada.", "success");
                } catch (error) {
                    showNotification("Erro ao salvar configuração.", "error");
                }
            });
        }

        const viewStatsBtn = document.getElementById('view-stats-btn');
        if (viewStatsBtn) {
            viewStatsBtn.addEventListener('click', () => {
                const modal = document.getElementById('statistics-modal');
                if (!modal) {
                    showNotification("Modal de estatísticas não encontrado", "error");
                    return;
                }
                if (this.allAssisted && this.currentPauta && this.currentPauta.name) {
                    if (typeof StatisticsService !== 'undefined' && typeof StatisticsService.showModal === 'function') {
                        StatisticsService.showModal(this.allAssisted, this.currentPautaData ? this.currentPautaData.useDelegationFlow : false, this.currentPauta.name);
                    } else {
                        showNotification("Erro ao carregar estatísticas", "error");
                    }
                } else {
                    showNotification("Carregue uma pauta primeiro", "info");
                }
            });
        }

        const manageMembersBtn = document.getElementById('manage-members-btn');
        if (manageMembersBtn) {
            manageMembersBtn.addEventListener('click', async () => {
                if (typeof ModalService !== 'undefined' && typeof ModalService.openMembersModal === 'function') {
                    await ModalService.openMembersModal(this);
                } else {
                    showNotification("Erro ao abrir gerenciar membros", "error");
                }
            });
        }

        const manageCollaboratorsBtn = document.getElementById('manage-collaborators-btn');
        if (manageCollaboratorsBtn) {
            manageCollaboratorsBtn.addEventListener('click', () => {
                CollaboratorService.openModal(this);
            });
        }

        const closePautaBtn = document.getElementById('close-pauta-btn');
        if (closePautaBtn) {
            closePautaBtn.addEventListener('click', () => {
                const closeModalTitle = document.getElementById('close-modal-title');
                if (closeModalTitle) closeModalTitle.textContent = 'Fechar Pauta';
                const closeModalMessage = document.getElementById('close-modal-message');
                if (closeModalMessage) closeModalMessage.textContent = 'Para fechar esta pauta, confirme sua senha. Nenhum membro poderá fazer alterações até que você a reabra.';
                const closePautaPassword = document.getElementById('close-pauta-password');
                if (closePautaPassword) closePautaPassword.value = '';
                const confirmClosePautaBtn = document.getElementById('confirm-close-pauta-btn');
                if (confirmClosePautaBtn) confirmClosePautaBtn.textContent = 'Confirmar';
                const closePautaModal = document.getElementById('close-pauta-modal');
                if (closePautaModal) closePautaModal.classList.remove('hidden');
            });
        }

        const reopenPautaBtn = document.getElementById('reopen-pauta-btn');
        if (reopenPautaBtn) {
            reopenPautaBtn.addEventListener('click', () => {
                const closeModalTitle = document.getElementById('close-modal-title');
                if (closeModalTitle) closeModalTitle.textContent = 'Reabrir Pauta';
                const closeModalMessage = document.getElementById('close-modal-message');
                if (closeModalMessage) closeModalMessage.textContent = 'Para reabrir esta pauta, confirme sua senha.';
                const closePautaPassword = document.getElementById('close-pauta-password');
                if (closePautaPassword) closePautaPassword.value = '';
                const confirmClosePautaBtn = document.getElementById('confirm-close-pauta-btn');
                if (confirmClosePautaBtn) confirmClosePautaBtn.textContent = 'Reabrir';
                const closePautaModal = document.getElementById('close-pauta-modal');
                if (closePautaModal) closePautaModal.classList.remove('hidden');
            });
        }

        const confirmClosePautaBtn = document.getElementById('confirm-close-pauta-btn');
        if (confirmClosePautaBtn) {
            confirmClosePautaBtn.addEventListener('click', async () => {
                const password = document.getElementById('close-pauta-password');
                const passwordValue = password ? password.value : '';
                const errorDiv = document.getElementById('close-auth-error');
                if (errorDiv) errorDiv.classList.add('hidden');

                const isReopenBtn = document.getElementById('confirm-close-pauta-btn');
                const isReopen = isReopenBtn ? isReopenBtn.textContent.includes('Reabrir') : false;
                const user = this.auth.currentUser;
                
                if (!user || user.uid !== this.currentPautaOwnerId) {
                    showNotification("Você não tem permissão para esta ação.", "error");
                    const closePautaModal = document.getElementById('close-pauta-modal');
                    if (closePautaModal) closePautaModal.classList.add('hidden');
                    return;
                }

                try {
                    const credential = EmailAuthProvider.credential(user.email, passwordValue);
                    await reauthenticateWithCredential(user, credential);
                    
                    const pautaRef = doc(this.db, "pautas", this.currentPauta.id);
                    await updateDoc(pautaRef, { isClosed: !isReopen });
                    
                    this.isPautaClosed = !isReopen;
                    UIService.togglePautaLock(this);

                    showNotification("Pauta " + (isReopen ? 'reaberta' : 'fechada') + " com sucesso.", 'success', 5000);
                    const closePautaModal = document.getElementById('close-pauta-modal');
                    if (closePautaModal) closePautaModal.classList.add('hidden');
                    
                } catch (error) {
                    if (errorDiv) {
                        errorDiv.textContent = 'Senha incorreta. Tente novamente.';
                        errorDiv.classList.remove('hidden');
                    }
                    showNotification("Falha na autenticação.", "error");
                }
            });
        }

        const cancelClosePautaBtn = document.getElementById('cancel-close-pauta-btn');
        if (cancelClosePautaBtn) {
            cancelClosePautaBtn.addEventListener('click', () => {
                const closePautaModal = document.getElementById('close-pauta-modal');
                if (closePautaModal) closePautaModal.classList.add('hidden');
            });
        }

        const resetAllBtn = document.getElementById('reset-all-btn');
        if (resetAllBtn) {
            resetAllBtn.addEventListener('click', () => {
                const resetConfirmModal = document.getElementById('reset-confirm-modal');
                if (resetConfirmModal) resetConfirmModal.classList.remove('hidden');
            });
        }

        NotesService.setup();

        const addAssistedBtn = document.getElementById('add-assisted-btn');
        if (addAssistedBtn) {
            addAssistedBtn.addEventListener('click', () => {
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
        }

        const fileUpload = document.getElementById('file-upload');
        if (fileUpload) {
            fileUpload.addEventListener('change', (e) => {
                PautaService.handleCSVUpload(e, this);
            });
        }

        const toggleFaltososBtn = document.getElementById('toggle-faltosos-btn');
        if (toggleFaltososBtn) {
            toggleFaltososBtn.addEventListener('click', UIService.toggleFaltosos);
        }

        const searchIds = ['pauta-search', 'aguardando-search', 'em-atendimento-search', 'atendidos-search', 'faltosos-search'];
        for (var i9 = 0; i9 < searchIds.length; i9++) {
            const element = document.getElementById(searchIds[i9]);
            if (element) {
                element.addEventListener('input', () => {
                    UIService.renderAssistedLists(this);
                });
            }
        }

        const downloadPdfBtn = document.getElementById('download-pdf-btn');
        if (downloadPdfBtn) {
            downloadPdfBtn.addEventListener('click', () => {
                const atendidosArray = (this.allAssisted || []).filter(function(a) { return a.status === 'atendido'; });
                const nomePauta = this.currentPauta ? this.currentPauta.name : 'Pauta';
                PDFService.generateAtendidosPDF(atendidosArray, nomePauta);
            });
        }

        const downloadFaltososPdfBtn = document.getElementById('download-faltosos-pdf-btn');
        if (downloadFaltososPdfBtn) {
            downloadFaltososPdfBtn.addEventListener('click', () => {
                const faltososArray = (this.allAssisted || []).filter(function(a) { return a.status === 'faltoso'; });
                if (faltososArray.length === 0) {
                    showNotification("Nenhum assistido faltoso registrado para emitir o relatório.", "info");
                    return;
                }
                const nomePauta = this.currentPauta ? this.currentPauta.name : 'Pauta';
                PDFService.generateFaltososPDF(faltososArray, nomePauta);
            });
        }

        const downloadCollaboratorsBtn = document.getElementById('download-collaborators-pdf-modal');
        if (downloadCollaboratorsBtn) {
            downloadCollaboratorsBtn.addEventListener('click', () => {
                const nomePauta = this.currentPauta ? this.currentPauta.name : 'Pauta';
                const listaAtendimentos = this.allAssisted || [];
                PDFService.generateCollaboratorsPDF(this.colaboradores, listaAtendimentos, nomePauta);
            });
        }

        const clearCollaboratorsBtn = document.getElementById('clear-collaborators-list-modal');
        if (clearCollaboratorsBtn) {
            clearCollaboratorsBtn.addEventListener('click', () => {
                CollaboratorService.clearAll(this);
            });
        }

        const formatHelpLink = document.getElementById('format-help-link');
        if (formatHelpLink) {
            formatHelpLink.addEventListener('click', (e) => {
                e.preventDefault();
                const formatHelpModal = document.getElementById('format-help-modal');
                if (formatHelpModal) formatHelpModal.classList.remove('hidden');
            });
        }

        const privacyPolicyLink = document.getElementById('privacy-policy-link');
        if (privacyPolicyLink) {
            privacyPolicyLink.addEventListener('click', (e) => {
                e.preventDefault();
                const privacyPolicyModal = document.getElementById('privacy-policy-modal');
                if (privacyPolicyModal) privacyPolicyModal.classList.remove('hidden');
            });
        }

        UIService.setupFooterModals();
        this.setupSubjectsAutocomplete();

        document.body.addEventListener('click', (e) => {
            PautaService.handleCardActions(e, this);
        });

        const collaboratorForm = document.getElementById('collaborator-form-modal');
        if (collaboratorForm) {
            collaboratorForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const nome = document.getElementById('collaborator-name-modal');
                const nomeValue = nome ? nome.value.trim() : '';
                if (!nomeValue) {
                    showNotification("Nome obrigatório", "error");
                    return;
                }
                const data = {
                    nome: nomeValue,
                    cargo: document.getElementById('collaborator-role-modal') ? document.getElementById('collaborator-role-modal').value : '',
                    equipe: document.getElementById('collaborator-team-modal') ? document.getElementById('collaborator-team-modal').value : '',
                    email: document.getElementById('collaborator-email-modal') ? document.getElementById('collaborator-email-modal').value || '' : '',
                    telefone: document.getElementById('collaborator-phone-modal') ? document.getElementById('collaborator-phone-modal').value || '' : '',
                    transporte: document.querySelector('input[name="transporte-colaborador"]:checked') ? document.querySelector('input[name="transporte-colaborador"]:checked').value : 'Meios Próprios'
                };
                await CollaboratorService.saveCollaborator(this, data);
            });
        }
        
        const cancelBtns = document.querySelectorAll('[id^="cancel-"], [id^="close"]');
        for (var i10 = 0; i10 < cancelBtns.length; i10++) {
            const btn = cancelBtns[i10];
            if (btn) {
                btn.addEventListener('click', (e) => {
                    const modal = e.target.closest('.fixed');
                    if (modal) modal.classList.add('hidden');
                });
            }
        }

        const chips = document.querySelectorAll('.p-chip');
        for (var i11 = 0; i11 < chips.length; i11++) {
            chips[i11].addEventListener('click', function(e) {
                e.preventDefault();
                this.classList.toggle('selected');
            });
        }

        const confirmPriorityBtn = document.getElementById('confirm-priority-reason-btn');
        if (confirmPriorityBtn) {
            confirmPriorityBtn.addEventListener('click', async () => {
                const selectedChips = document.querySelectorAll('.p-chip.selected');
                const selectedValues = [];
                for (var i12 = 0; i12 < selectedChips.length; i12++) {
                    selectedValues.push(selectedChips[i12].dataset.value);
                }
                const customReason = document.getElementById('priority-reason-input');
                const customReasonValue = customReason ? customReason.value.trim() : '';
                
                let finalReason = selectedValues.join(', ');
                if (customReasonValue) {
                    finalReason = finalReason ? finalReason + ' | Obs: ' + customReasonValue : customReasonValue;
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

                const allChips = document.querySelectorAll('.p-chip');
                for (var i13 = 0; i13 < allChips.length; i13++) {
                    allChips[i13].classList.remove('selected');
                }
                if (customReason) customReason.value = '';
                const priorityModal = document.getElementById('priority-reason-modal');
                if (priorityModal) priorityModal.classList.add('hidden');
                showNotification("Prioridade Ativada!", "success");
            });
        }

        const cancelPriorityBtn = document.getElementById('cancel-priority-reason-btn');
        if (cancelPriorityBtn) {
            cancelPriorityBtn.addEventListener('click', () => {
                const priorityModal = document.getElementById('priority-reason-modal');
                if (priorityModal) priorityModal.classList.add('hidden');
            });
        }

        const backToActionBtn = document.getElementById('back-to-action-selection-btn');
        if (backToActionBtn) {
            backToActionBtn.addEventListener('click', () => {
                if (typeof window.switchToActionSelectionView === 'function') {
                    window.switchToActionSelectionView();
                }
            });
        }
        
        const saveChecklistBtn = document.getElementById('save-checklist-btn');
        if (saveChecklistBtn) {
            saveChecklistBtn.addEventListener('click', async () => {
                const assistedId = window.assistedIdToHandle || window.currentAssistedId;
                if (!assistedId) {
                    showNotification("Erro: assistido não identificado", "error");
                    return;
                }
                
                const container = document.getElementById('checklist-container');
                const checkboxes = container ? container.querySelectorAll('.doc-checkbox:checked') : [];
                const checkedItems = [];
                for (var i14 = 0; i14 < checkboxes.length; i14++) {
                    const cb = checkboxes[i14];
                    const label = cb.closest('label');
                    const span = label ? label.querySelector('span') : null;
                    const typeInput = document.getElementById('type-' + cb.id);
                    checkedItems.push({
                        id: cb.id,
                        text: span ? span.textContent : '',
                        type: typeInput && typeInput.checked ? typeInput.value : 'Físico'
                    });
                }

                const checklistData = {
                    action: window.currentChecklistAction, 
                    checkedIds: checkedItems.map(function(item) { return item.id; }),
                    docTypes: checkedItems.reduce(function(acc, item) { 
                        acc[item.id] = item.type; 
                        return acc; 
                    }, {}),
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
        }

        const closeDetailsModalBtn = document.getElementById('close-assisted-details-modal-btn');
        if (closeDetailsModalBtn) {
            closeDetailsModalBtn.addEventListener('click', () => {
                const detailsModal = document.getElementById('assisted-details-modal');
                if (detailsModal) detailsModal.classList.add('hidden');
            });
        }
        
        const printChecklistBtn = document.getElementById('print-checklist-btn');
        if (printChecklistBtn) {
            printChecklistBtn.addEventListener('click', async () => {
                const { handlePdf } = await import('./detalhes.js');
                if (typeof handlePdf === 'function') {
                    await handlePdf();
                } else {
                    showNotification("Erro: Motor de emissão do checklist não carregado.", "error");
                }
            });
        }
        
        const resetChecklistBtn = document.getElementById('reset-checklist-btn');
        if (resetChecklistBtn) {
            resetChecklistBtn.addEventListener('click', () => {
                if (confirm("Deseja mudar de assunto? Isso apagará o checklist atual.")) {
                    if (typeof window.switchToActionSelectionView === 'function') {
                        window.switchToActionSelectionView();
                    }
                }
            });
        }

        const confirmAttendantBtn = document.getElementById('confirm-attendant-btn');
        if (confirmAttendantBtn) {
            confirmAttendantBtn.addEventListener('click', async () => {
                const select = document.getElementById('attendant-select');
                const attendantName = select ? select.value : null;
                const nomeFinal = attendantName || null;
                const useDist = this.currentPautaData ? this.currentPautaData.useDistributionFlow === true : false;
                const novoStatus = useDist ? 'aguardandoDistribuicao' : 'atendido';

                let attendantData = nomeFinal;
                if (nomeFinal) {
                    const selectedCollab = this.colaboradores ? this.colaboradores.find(function(c) { return c.nome === nomeFinal; }) : null;
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
                
                const attendantModal = document.getElementById('attendant-modal');
                if (attendantModal) attendantModal.classList.add('hidden');
                showNotification(novoStatus === 'atendido' ? "Atendimento finalizado!" : "Enviado para Distribuição ⚖️", "success");
            });
        }

        const cancelAttendantBtn = document.getElementById('cancel-attendant-btn');
        if (cancelAttendantBtn) {
            cancelAttendantBtn.addEventListener('click', () => {
                const attendantModal = document.getElementById('attendant-modal');
                if (attendantModal) attendantModal.classList.add('hidden');
            });
        }

        const confirmEditAttendantBtn = document.getElementById('confirm-edit-attendant-btn');
        if (confirmEditAttendantBtn) {
            confirmEditAttendantBtn.addEventListener('click', async () => {
                const select = document.getElementById('edit-attendant-select');
                const attendantName = select ? select.value : null;
                
                if (!attendantName) {
                    showNotification("Selecione um profissional", "error");
                    return;
                }
                
                const selectedCollab = this.colaboradores ? this.colaboradores.find(function(c) { return c.nome === attendantName; }) : null;
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
                
                const editAttendantModal = document.getElementById('edit-attendant-modal');
                if (editAttendantModal) editAttendantModal.classList.add('hidden');
                showNotification("Atendente atualizado com sucesso!", "success");
            });
        }

        const cancelEditAttendantBtn = document.getElementById('cancel-edit-attendant-btn');
        if (cancelEditAttendantBtn) {
            cancelEditAttendantBtn.addEventListener('click', () => {
                const editAttendantModal = document.getElementById('edit-attendant-modal');
                if (editAttendantModal) editAttendantModal.classList.add('hidden');
            });
        }

        const confirmSelectCollabBtn = document.getElementById('confirm-select-collaborator-btn');
        if (confirmSelectCollabBtn) {
            confirmSelectCollabBtn.addEventListener('click', async () => {
                const collaboratorId = window.selectedCollaboratorId;
                const collaboratorName = window.selectedCollaboratorName || null;
                const acoesRapidas = ['reagendar', 'agendar', 'consulta', 'outros'];
                const isAcaoRapida = acoesRapidas.indexOf(window.assistedTipoAcao) !== -1;

                if (!isAcaoRapida && collaboratorId === undefined) { 
                    showNotification("Selecione um colaborador ou 'Não atribuir'.", "warning");
                    return;
                }

                const isSilentMode = document.getElementById('toggle-silent-mode');
                const isSilentModeChecked = isSilentMode ? isSilentMode.checked : false;

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
                    showNotification(nomeAssistidoAtual + " marcado como atendido por " + atendenteFinal + " (" + tipoDescricao + ").", "success");
                } else if (window.assistedTipoAcao === 'atender_direto') {
                    const atendenteFinal = collaboratorName || this.currentUserName;
                    await PautaService.finishAttendance(this, idAssistidoAtual, atendenteFinal, []);
                    showNotification(nomeAssistidoAtual + " marcado como atendido por " + atendenteFinal + ".", "success");
                } else { 
                    let collaboratorData = null;
                    let emailDestino = null;
                    
                    const novoToken = Math.random().toString(36).substring(2, 10) + Date.now().toString(36).substring(4);

                    if (collaboratorName) {
                        const selectedCollab = this.colaboradores ? this.colaboradores.find(function(c) { return c.nome === collaboratorName; }) : null;
                        emailDestino = selectedCollab ? selectedCollab.email : null;
                        
                        collaboratorData = { id: collaboratorId, name: collaboratorName, email: emailDestino };
                    }

                    const updatePayload = {
                        status: 'emAtendimento',
                        assignedCollaborator: collaboratorData,
                        enviadoPor: this.currentUserName || 'Sistema',
                        inAttendanceTime: new Date().toISOString()
                    };

                    if (collaboratorName && !isSilentModeChecked) {
                        updatePayload.delegationToken = novoToken; 
                    }

                    await PautaService.updateStatus(
                        this.db,
                        this.currentPauta.id,
                        idAssistidoAtual, 
                        updatePayload,
                        this.currentUserName
                    );
                    
                    if (emailDestino && !isSilentModeChecked) {
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
                    } else if (emailDestino && isSilentModeChecked) {
                        showNotification("Card movido para " + collaboratorName + " silenciosamente.", "info");
                    } else {
                        showNotification(nomeAssistidoAtual + " delegado com sucesso.", "success"); 
                    }
                }
                
                const selectCollabModal = document.getElementById('select-collaborator-modal');
                if (selectCollabModal) selectCollabModal.classList.add('hidden');
                window.assistedIdToHandle = null;
                window.assistedNameToHandle = null;
                window.assistedTipoAcao = null;
                window.assistedTipoDescricao = null;
                window.selectedCollaboratorId = undefined;
                window.selectedCollaboratorName = undefined;
            });
        }

        const cancelSelectCollabBtn = document.getElementById('cancel-select-collaborator-btn');
        if (cancelSelectCollabBtn) {
            cancelSelectCollabBtn.addEventListener('click', () => {
                const selectCollabModal = document.getElementById('select-collaborator-modal');
                if (selectCollabModal) selectCollabModal.classList.add('hidden');
                window.selectedCollaboratorId = undefined;
                window.selectedCollaboratorName = undefined;
                window.assistedTipoAcao = null;
                window.assistedTipoDescricao = null;
            });
        }

        const confirmArrivalBtn = document.getElementById('confirm-arrival-btn');
        if (confirmArrivalBtn) {
            confirmArrivalBtn.addEventListener('click', async () => {
                const time = document.getElementById('arrival-time-input');
                const timeValue = time ? time.value : '';
                if (!timeValue) {
                    showNotification("Informe o horário", "error");
                    return;
                }
                const parts = timeValue.split(':');
                const hours = parseInt(parts[0], 10);
                const minutes = parseInt(parts[1], 10);
                const arrivalDate = new Date();
                arrivalDate.setHours(hours, minutes, 0, 0);

                const roomSelect = document.getElementById('arrival-room-select');
                const room = roomSelect && !roomSelect.classList.contains('hidden') ? roomSelect.value : null;

                await PautaService.updateStatus(
                    this.db,
                    this.currentPauta.id,
                    window.assistedIdToHandle,
                    { status: 'aguardando', arrivalTime: arrivalDate.toISOString(), checkInOrder: Date.now(), room: room },
                    this.currentUserName
                );

                const arrivalModal = document.getElementById('arrival-modal');
                if (arrivalModal) arrivalModal.classList.add('hidden');
                showNotification("Chegada registrada com sucesso!", "success");
            });
        }

        const cancelArrivalBtn = document.getElementById('cancel-arrival-btn');
        if (cancelArrivalBtn) {
            cancelArrivalBtn.addEventListener('click', () => {
                const arrivalModal = document.getElementById('arrival-modal');
                if (arrivalModal) arrivalModal.classList.add('hidden');
            });
        }

        const confirmEditAssistedBtn = document.getElementById('confirm-edit-assisted-btn');
        if (confirmEditAssistedBtn) {
            confirmEditAssistedBtn.addEventListener('click', async () => {
                const name = document.getElementById('edit-assisted-name');
                const nameValue = name ? name.value.trim() : '';
                if (!nameValue) {
                    showNotification("O nome não pode ficar em branco.", "error");
                    return;
                }
                
                const updatedData = {
                    name: nameValue,
                    cpf: document.getElementById('edit-assisted-cpf') ? document.getElementById('edit-assisted-cpf').value.trim() || '' : '',
                    numAgendamento: document.getElementById('edit-assisted-num-agendamento') ? document.getElementById('edit-assisted-num-agendamento').value.trim() || '' : '',
                    subject: document.getElementById('edit-assisted-subject') ? document.getElementById('edit-assisted-subject').value.trim() || '' : '',
                    scheduledTime: document.getElementById('edit-scheduled-time') ? document.getElementById('edit-scheduled-time').value || null : null,
                };
                
                const roomSelect = document.getElementById('edit-room-select');
                if (roomSelect && roomSelect.parentElement && !roomSelect.parentElement.classList.contains('hidden')) {
                    updatedData.room = roomSelect.value || null;
                }
                
                await PautaService.updateStatus(
                    this.db,
                    this.currentPauta.id,
                    window.assistedIdToHandle,
                    updatedData,
                    this.currentUserName
                );
                
                const editAssistedModal = document.getElementById('edit-assisted-modal');
                if (editAssistedModal) editAssistedModal.classList.add('hidden');
                showNotification("Dados atualizados com sucesso!", "success");
            });
        }

        const cancelEditAssistedBtn = document.getElementById('cancel-edit-assisted-btn');
        if (cancelEditAssistedBtn) {
            cancelEditAssistedBtn.addEventListener('click', () => {
                const editAssistedModal = document.getElementById('edit-assisted-modal');
                if (editAssistedModal) editAssistedModal.classList.add('hidden');
            });
        }

        const addDemandBtn = document.getElementById('demands-modal-add-demand-btn');
        if (addDemandBtn) {
            addDemandBtn.addEventListener('click', () => {
                const input = document.getElementById('demands-modal-new-demand-input');
                const text = input ? input.value.trim() : '';
                if (text) {
                    const container = document.getElementById('demands-modal-list-container');
                    if (container) {
                        if (container.querySelector('p.text-gray-500')) {
                            container.innerHTML = '';
                        }
                        const li = document.createElement('li');
                        li.className = 'flex justify-between items-center p-2 bg-white rounded-md';
                        li.innerHTML = '<span>' + escapeHTML(text) + '</span><button class="remove-demand-item-btn text-red-500 text-xs">Remover</button>';
                        container.appendChild(li);
                        if (input) input.value = '';
                        if (input) input.focus();
                    }
                }
            });
        }

        const demandsContainer = document.getElementById('demands-modal-list-container');
        if (demandsContainer) {
            demandsContainer.addEventListener('click', (e) => {
                if (e.target.classList.contains('remove-demand-item-btn')) {
                    const li = e.target.closest('li');
                    if (li) li.remove();
                    
                    const container = document.getElementById('demands-modal-list-container');
                    if (container && container.children.length === 0) {
                        container.innerHTML = '<p class="text-gray-500 text-center">Nenhuma demanda adicional.</p>';
                    }
                }
            });
        }

        const saveDemandsBtn = document.getElementById('save-demands-btn');
        if (saveDemandsBtn) {
            saveDemandsBtn.addEventListener('click', async () => {
                const container = document.getElementById('demands-modal-list-container');
                const items = container ? container.querySelectorAll('li') : [];
                const descricoes = [];
                for (var i15 = 0; i15 < items.length; i15++) {
                    const span = items[i15].querySelector('span');
                    if (span) descricoes.push(span.textContent || '');
                }
                
                await PautaService.updateStatus(
                    this.db,
                    this.currentPauta.id,
                    window.assistedIdToHandle,
                    { demandas: { quantidade: descricoes.length, descricoes: descricoes } },
                    this.currentUserName
                );
                
                showNotification("Demandas salvas com sucesso!", "success");
                const demandsModal = document.getElementById('demands-modal');
                if (demandsModal) demandsModal.classList.add('hidden');
            });
        }

        const cancelDemandsBtn = document.getElementById('cancel-demands-btn');
        if (cancelDemandsBtn) {
            cancelDemandsBtn.addEventListener('click', () => {
                const demandsModal = document.getElementById('demands-modal');
                if (demandsModal) demandsModal.classList.add('hidden');
            });
        }

        const closeDemandsModalBtn = document.getElementById('close-demands-modal-btn');
        if (closeDemandsModalBtn) {
            closeDemandsModalBtn.addEventListener('click', () => {
                const demandsModal = document.getElementById('demands-modal');
                if (demandsModal) demandsModal.classList.add('hidden');
            });
        }

        const confirmResetBtn = document.getElementById('confirm-reset-btn');
        if (confirmResetBtn) {
            confirmResetBtn.addEventListener('click', async () => {
                const attendanceCollectionRef = collection(this.db, "pautas", this.currentPauta.id, "attendances");
                const snapshot = await getDocs(attendanceCollectionRef);
                
                if (snapshot.empty) {
                    showNotification("A pauta já está vazia.", "info");
                    const resetConfirmModal = document.getElementById('reset-confirm-modal');
                    if (resetConfirmModal) resetConfirmModal.classList.add('hidden');
                    return;
                }
                
                const batch = writeBatch(this.db);
                snapshot.docs.forEach(function(docRef) {
                    batch.delete(docRef.ref);
                });
                await batch.commit();
                
                showNotification("Pauta zerada com sucesso.", "success");
                const resetConfirmModal = document.getElementById('reset-confirm-modal');
                if (resetConfirmModal) resetConfirmModal.classList.add('hidden');
            });
        }

        const cancelResetBtn = document.getElementById('cancel-reset-btn');
        if (cancelResetBtn) {
            cancelResetBtn.addEventListener('click', () => {
                const resetConfirmModal = document.getElementById('reset-confirm-modal');
                if (resetConfirmModal) resetConfirmModal.classList.add('hidden');
            });
        }

        const confirmEditPautaBtn = document.getElementById('confirm-edit-pauta-btn');
        if (confirmEditPautaBtn) {
            confirmEditPautaBtn.addEventListener('click', async () => {
                const newNameInput = document.getElementById('edit-pauta-name-input');
                const newName = newNameInput ? newNameInput.value.trim() : '';
                if (newName && this.currentPauta && this.currentPauta.id) {
                    await updateDoc(doc(this.db, "pautas", this.currentPauta.id), { name: newName });
                    const pautaTitle = document.getElementById('pauta-title');
                    if (pautaTitle) pautaTitle.textContent = newName;
                    showNotification("Nome da pauta atualizado.", "success");
                    const editPautaModal = document.getElementById('edit-pauta-modal');
                    if (editPautaModal) editPautaModal.classList.add('hidden');
                } else {
                    showNotification("O nome não pode ser vazio.", "error");
                }
            });
        }

        const cancelEditPautaBtn = document.getElementById('cancel-edit-pauta-btn');
        if (cancelEditPautaBtn) {
            cancelEditPautaBtn.addEventListener('click', () => {
                const editPautaModal = document.getElementById('edit-pauta-modal');
                if (editPautaModal) editPautaModal.classList.add('hidden');
            });
        }

        const sendDelegateEmailBtn = document.getElementById('send-delegate-email-btn');
        if (sendDelegateEmailBtn) {
            sendDelegateEmailBtn.addEventListener('click', async () => {
                const emailInput = document.getElementById('collaborator-email-input');
                const emailDestino = emailInput ? emailInput.value.trim() : '';
                
                if (!emailDestino) {
                    showNotification("Por favor, insira o e-mail.", "error");
                    return;
                }

                const btn = document.getElementById('send-delegate-email-btn');
                if (btn) { 
                    btn.disabled = true; 
                    btn.textContent = "Enviando..."; 
                }

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

                    const delegateModal = document.getElementById('delegate-email-modal');
                    if (delegateModal) delegateModal.classList.add('hidden');
                    if (emailInput) emailInput.value = '';
                    showNotification("E-mail enviado e acesso liberado!", "success");
                } catch (error) {
                    showNotification("Falha no envio do e-mail.", "error");
                } finally {
                    if (btn) { 
                        btn.disabled = false; 
                        btn.textContent = "Enviar E-mail"; 
                    }
                }
            });
        }

        const cancelDelegateEmailBtn = document.getElementById('cancel-delegate-email-btn');
        if (cancelDelegateEmailBtn) {
            cancelDelegateEmailBtn.addEventListener('click', () => {
                const delegateModal = document.getElementById('delegate-email-modal');
                if (delegateModal) delegateModal.classList.add('hidden');
            });
        }

        document.body.addEventListener('click', async (e) => {
            if (e.target.classList.contains('remove-member-btn')) {
                const email = e.target.dataset.email;
                if (confirm("Remover " + email + " da pauta?")) {
                    try {
                        const usersRef = collection(this.db, "users");
                        const q = query(usersRef, where("email", "==", email));
                        const querySnapshot = await getDocs(q);
                        
                        if (!querySnapshot.empty) {
                            const userId = querySnapshot.docs[0].id;
                            const pautaRef = doc(this.db, "pautas", this.currentPauta.id);
                            await updateDoc(pautaRef, { members: arrayRemove(userId), memberEmails: arrayRemove(email) });
                            showNotification("Membro " + email + " removido", "success");
                            if (typeof ModalService !== 'undefined' && typeof ModalService.openMembersModal === 'function') {
                                await ModalService.openMembersModal(this);
                            }
                        }
                    } catch (error) {
                        showNotification("Erro ao remover membro", "error");
                    }
                }
            }
        });
        
        const openUserPrefsBtn = document.getElementById('open-user-preferences-btn');
        if (openUserPrefsBtn) {
            openUserPrefsBtn.addEventListener('click', () => {
                this.openUserPreferencesModal();
            });
        }

        const cancelUserPrefsBtn = document.getElementById('cancel-user-preferences-btn');
        if (cancelUserPrefsBtn) {
            cancelUserPrefsBtn.addEventListener('click', () => {
                const userPrefsModal = document.getElementById('user-preferences-modal');
                if (userPrefsModal) userPrefsModal.classList.add('hidden');
            });
        }

        const saveUserPrefsBtn = document.getElementById('save-user-preferences-btn');
        if (saveUserPrefsBtn) {
            saveUserPrefsBtn.addEventListener('click', async () => {
                await this.saveUserPreferences();
            });
        }

        const adminPanelBtnPautaSelection = document.getElementById('admin-panel-btn');
        if (adminPanelBtnPautaSelection) {
            adminPanelBtnPautaSelection.addEventListener('click', () => {
                this.showAdminScreen();
            });
        }
        
        const adminBackBtn = document.getElementById('admin-back-to-pautas-btn');
        if (adminBackBtn) {
            adminBackBtn.addEventListener('click', () => {
                this.showPautaSelectionScreen();
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

            if (actionsPanel && !actionsPanel.classList.contains('hidden') && !actionsPanel.contains(e.target)) {
                const actionsToggleBtn = document.getElementById('actions-toggle');
                if (!actionsToggleBtn || !actionsToggleBtn.contains(e.target)) {
                    actionsPanel.classList.add('opacity-0', 'scale-95', 'pointer-events-none');
                    const actionsArrow = document.getElementById('actions-arrow');
                    if (actionsArrow) actionsArrow.classList.remove('rotate-180');
                }
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

    }

    // ============================================================
    // setupSubjectsAutocomplete
    // ============================================================
    setupSubjectsAutocomplete() {
        const datalist = document.getElementById('subjects-list');
        if (!datalist) return;
        for (var i = 0; i < flatSubjects.length; i++) {
            const subject = flatSubjects[i];
            const option = document.createElement('option');
            option.value = subject.value;
            datalist.appendChild(option);
        }

        const subjectInput = document.getElementById('assisted-subject');
        const descriptionBox = document.getElementById('subject-description');
        
        if (subjectInput) {
            subjectInput.addEventListener('input', function(e) {
                const query = e.target.value.toLowerCase();
                const filtered = flatSubjects.filter(function(item) {
                    return item.value.toLowerCase().includes(query) || item.description.toLowerCase().includes(query);
                });
                datalist.innerHTML = '';
                for (var i2 = 0; i2 < filtered.length; i2++) {
                    const subjectItem = filtered[i2];
                    const option2 = document.createElement('option');
                    option2.value = subjectItem.value;
                    datalist.appendChild(option2);
                }
            });

            subjectInput.addEventListener('change', function() {
                const value = subjectInput.value;
                let selectedText = value;
                if (value.includes(' > ')) {
                    const parts = value.split(' > ');
                    selectedText = parts[parts.length - 1];
                }
                subjectInput.value = selectedText;

                const found = flatSubjects.find(function(s) { 
                    return s.value === value || s.value.split(' > ').pop() === selectedText; 
                });
                if (found && found.description && descriptionBox) {
                    descriptionBox.textContent = found.description;
                    descriptionBox.classList.remove('hidden');
                } else if (descriptionBox) {
                    descriptionBox.classList.add('hidden');
                }
            });
        }

        const subjectInfoBtn = document.getElementById('subject-info-btn');
        if (subjectInfoBtn) {
            subjectInfoBtn.addEventListener('click', () => {
                const value = subjectInput ? subjectInput.value || '' : '';
                const found = flatSubjects.find(function(s) { 
                    return s.value === value || s.value.split(' > ').pop() === value; 
                });
                if (found && found.description && descriptionBox) {
                    descriptionBox.textContent = found.description;
                    descriptionBox.classList.toggle('hidden');
                } else if (descriptionBox) {
                    descriptionBox.textContent = 'Selecione um assunto válido.';
                    descriptionBox.classList.remove('hidden');
                }
            });
        }
    }

    // ============================================================
    // loadUserPreferences / saveUserPreferences / applyUserPreferences
    // ============================================================
    async loadUserPreferences() {
        if (!this.auth || !this.auth.currentUser || !this.db) {
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
        if (!this.auth || !this.auth.currentUser || !this.db) {
            showNotification("Você precisa estar logado para salvar preferências.", "error");
            return;
        }

        const prefEnableSoundsSuccess = document.getElementById('pref-enable-sounds-success');
        const prefEnableSoundsError = document.getElementById('pref-enable-sounds-error');
        const prefEnableSoundsInfo = document.getElementById('pref-enable-sounds-info');
        const prefEnableSoundsWarning = document.getElementById('pref-enable-sounds-warning');
        const prefShowToastsSuccess = document.getElementById('pref-show-toasts-success');
        const prefShowToastsError = document.getElementById('pref-show-toasts-error');
        const prefShowToastsInfo = document.getElementById('pref-show-toasts-info');
        const prefShowToastsWarning = document.getElementById('pref-show-toasts-warning');

        this.userPreferences = {
            enableSoundsSuccess: prefEnableSoundsSuccess ? prefEnableSoundsSuccess.checked : false,
            enableSoundsError: prefEnableSoundsError ? prefEnableSoundsError.checked : false,
            enableSoundsInfo: prefEnableSoundsInfo ? prefEnableSoundsInfo.checked : false,
            enableSoundsWarning: prefEnableSoundsWarning ? prefEnableSoundsWarning.checked : false,
            showToastsSuccess: prefShowToastsSuccess ? prefShowToastsSuccess.checked : false,
            showToastsError: prefShowToastsError ? prefShowToastsError.checked : false,
            showToastsInfo: prefShowToastsInfo ? prefShowToastsInfo.checked : false,
            showToastsWarning: prefShowToastsWarning ? prefShowToastsWarning.checked : false,
        };

        const userDocRef = doc(this.db, "users", this.auth.currentUser.uid);
        try {
            await updateDoc(userDocRef, {
                preferences: this.userPreferences,
                lastPreferenceUpdate: new Date().toISOString()
            });
            
            this.applyUserPreferences();
            const userPrefsModal = document.getElementById('user-preferences-modal');
            if (userPrefsModal) userPrefsModal.classList.add('hidden');
            showNotification("Preferências salvas com sucesso!", 'success');
        } catch (error) {
            showNotification("Erro ao salvar suas preferências.", "error");
        }
    }

    async openUserPreferencesModal() {
        if (!this.auth || !this.auth.currentUser) {
            showNotification("Você precisa estar logado para ver suas preferências.", "error");
            return;
        }

        const nameInput = document.getElementById('pref-user-name');
        if (nameInput) nameInput.value = this.currentUserName || 'Não informado';
        
        const emailInput = document.getElementById('pref-user-email');
        if (emailInput) emailInput.value = this.auth.currentUser.email || 'Não informado';

        await this.loadUserPreferences(); 

        const setChecked = function(id, value) {
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

        const userPrefsModal = document.getElementById('user-preferences-modal');
        if (userPrefsModal) userPrefsModal.classList.remove('hidden');
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

    // ============================================================
    // saveColumnPreferences / loadColumnPreferences / applyColumnPreferences
    // ============================================================
    saveColumnPreferences() {
        const toggleEmAtendimento = document.getElementById('toggle-em-atendimento');
        const toggleDistribuicao = document.getElementById('toggle-distribuicao');
        const toggleFaltosos = document.getElementById('toggle-faltosos');
        
        const preferences = {
            showEmAtendimento: toggleEmAtendimento ? toggleEmAtendimento.checked : false,
            showDistribuicao: toggleDistribuicao ? toggleDistribuicao.checked : false,
            showFaltosos: toggleFaltosos ? toggleFaltosos.checked : false,
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
        
        if (chkEmAtendimento) chkEmAtendimento.checked = preferences.showEmAtendimento;
        if (chkDistribuicao) chkDistribuicao.checked = preferences.showDistribuicao;
        if (chkFaltosos) chkFaltosos.checked = preferences.showFaltosos;
        
        this.applyColumnPreferences(preferences);
    }

    applyColumnPreferences(preferences) {
        const pautaType = this.currentPautaData ? this.currentPautaData.type : null;
        const useDelegationFlow = this.currentPautaData ? this.currentPautaData.useDelegationFlow : false;
        const useDistributionFlow = this.currentPautaData ? this.currentPautaData.useDistributionFlow : false;

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
            }
        }
    }

    // ============================================================
    // showPautaSelectionScreen
    // ============================================================
    async showPautaSelectionScreen() {
        localStorage.setItem('sigep_active_screen', 'pauta-selection');
        if (this.monitorInterval) { 
            clearInterval(this.monitorInterval); 
            this.monitorInterval = null; 
        }
        
        const buttons = document.querySelectorAll('[id^="btn-colabs-disponiveis-"]');
        for (var i = 0; i < buttons.length; i++) {
            buttons[i].remove();
        }
        
        UIService.showScreen('pautaSelection');
        
        this.currentPautaFilter = 'all';
        
        UIService.renderPautaFilters('filters-container', this.currentPautaFilter, async (filter) => {
            this.currentPautaFilter = filter;
            await this.loadPautasWithFilter();
        }, this);
        await this.loadPautasWithFilter();
        this.loadColumnPreferences();
    }

    // ============================================================
    // loadPautasWithFilter - COM FILTRO POR MODO
    // ============================================================
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
            let pautas = snapshot.docs.map(function(doc) { 
                return { id: doc.id, ...doc.data() }; 
            });
            
            const modoAtual = this.currentMode;
            const tiposEvento = ['mutirao', 'plantao', 'acao_social', 'mutirão', 'evento'];
            
            if (modoAtual === 'normal') {
                pautas = pautas.filter(function(p) {
                    let tipoPauta = p.tipo || p.type || 'normal';
                    tipoPauta = String(tipoPauta).toLowerCase();
                    return tiposEvento.indexOf(tipoPauta) === -1;
                });
            } else if (modoAtual === 'evento') {
                pautas = pautas.filter(function(p) {
                    let tipoPauta = p.tipo || p.type || '';
                    tipoPauta = String(tipoPauta).toLowerCase();
                    return tiposEvento.indexOf(tipoPauta) !== -1;
                });
            }
            
            this.mostrarIndicadorModo();
            
            const filtrosAdicionais = {};
            if (this.currentPautaFilter === 'periodo') {
                const filterDataInicial = document.getElementById('filter-data-inicial');
                const filterDataFinal = document.getElementById('filter-data-final');
                const filterTipoPauta = document.getElementById('filter-tipo-pauta');
                filtrosAdicionais.dataInicial = filterDataInicial ? filterDataInicial.value : null;
                filtrosAdicionais.dataFinal = filterDataFinal ? filterDataFinal.value : null;
                filtrosAdicionais.tipo = filterTipoPauta ? filterTipoPauta.value : null;
            }
            
            const filteredPautas = PautaService.filterPautas(pautas, this.currentPautaFilter, user.uid, user.email, filtrosAdicionais);
            
            if (filteredPautas.length === 0) {
                const modoTexto = this.currentMode === 'normal' ? 'Normal' : 'Evento (Mutirão/Plantão/Ação Social)';
                pautasList.innerHTML = '<p class="col-span-full text-center py-8 text-gray-500">Nenhuma pauta do tipo ' + modoTexto + ' encontrada.</p>';
                return;
            }
            
            UIService.renderPautaCards(filteredPautas, user.uid, user.email, this);
            
        } catch (error) {
            console.error("Erro ao carregar pautas:", error);
            if (pautasList) pautasList.innerHTML = '<p class="col-span-full text-center text-red-500">Erro ao carregar pautas</p>';
        }
    }

    // ============================================================
    // loadPauta
    // ============================================================
    async loadPauta(pautaId, pautaName, pautaType) {
        try {
            const pautaDoc = await getDoc(doc(this.db, "pautas", pautaId));
            if (pautaDoc.exists()) {
                const pautaData = pautaDoc.data();
                let dataBase = pautaData.dataAtuacao ? new Date(pautaData.dataAtuacao) : new Date(pautaData.createdAt);
                const expirationDate = new Date(dataBase);
                expirationDate.setDate(dataBase.getDate() + 7);
                if (new Date() > expirationDate) {
                    showNotification("Esta pauta expirou (prazo LGPD de 7 dias a partir da data de atuação) e não pode mais ser acessada.", "error");
                    return;
                }
            }
        } catch (error) {
            console.error("Erro ao verificar expiração:", error);
        }

        this.currentPauta = { id: pautaId, name: pautaName, type: pautaType };
        const pautaTitle = document.getElementById('pauta-title');
        if (pautaTitle) pautaTitle.textContent = pautaName;

        localStorage.setItem('lastPautaId', pautaId);
        localStorage.setItem('lastPautaName', pautaName);
        localStorage.setItem('lastPautaType', pautaType);

        try {
            const pautaDoc = await getDoc(doc(this.db, "pautas", pautaId));
            if (pautaDoc.exists()) {
                this.currentPautaData = pautaDoc.data();
                if (!this.currentPautaData.modo) this.currentPautaData.modo = 'normal';
                this.currentPautaOwnerId = this.currentPautaData.owner;
                this.isPautaClosed = this.currentPautaData.isClosed || false;
                
                if (this.currentPautaData.type === 'multisala' && this.currentPautaData.customRooms) {
                    this.customRoomsList = this.currentPautaData.customRooms;
                } else if (this.currentPautaData.type === 'multisala' && this.currentPautaData.rooms) {
                    this.customRoomsList = this.currentPautaData.rooms;
                } else {
                    this.customRoomsList = [];
                }

                setTimeout(() => {
                    UIService.togglePautaLock(this);
                }, 100);
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
            
            if (typeof CollaboratorService !== 'undefined' && typeof CollaboratorService.setupListener === 'function') {
                CollaboratorService.setupListener(this, pautaId);
            }
            
            this.iniciarMonitorEnvelopes();

            localStorage.setItem('sigep_active_screen', 'app');
            UIService.showScreen('app');
        } catch (error) {
            console.error("Erro ao carregar pauta:", error);
            showNotification("Erro ao carregar pauta", "error");
        }
    }

    // ============================================================
    // setupRealtimeListener
    // ============================================================
    setupRealtimeListener(pautaId) {
        if (this.unsubscribeFromAttendances) this.unsubscribeFromAttendances();
        const attendanceRef = collection(this.db, "pautas", pautaId, "attendances");
        this.unsubscribeFromAttendances = onSnapshot(attendanceRef, (snapshot) => {
            this.allAssisted = snapshot.docs.map(function(doc) { 
                return { id: doc.id, ...doc.data() }; 
            });
            UIService.renderAssistedLists(this);
            setTimeout(() => { 
                if (typeof PautaService.injectRoomSearches === 'function') {
                    PautaService.injectRoomSearches(this); 
                }
            }, 150);
        }, (error) => {
            console.error("Erro no snapshot:", error);
            showNotification("Erro ao carregar dados em tempo real", "error");
        });
    }

    // ============================================================
    // iniciarMonitorEnvelopes
    // ============================================================
    iniciarMonitorEnvelopes() {
        if (this.monitorInterval) clearInterval(this.monitorInterval);
        
        const verificarDisponibilidade = () => {
            if (!this.colaboradores || this.colaboradores.length === 0) return;

            const colabsAtivos = this.colaboradores.filter(c => c.presente === true);
            
            const colabsLivres = colabsAtivos.filter(c => {
                const casosOcupando = this.allAssisted.filter(a => {
                    const emAtendimentoNormal = a.status === 'emAtendimento' && a.assignedCollaborator && a.assignedCollaborator.name === c.nome;
                    const pendenteAssinatura = (a.status === 'aguardandoDistribuicao' || a.status === 'aguardandoCorrecao') && a.defensorResponsavel === c.nome;
                    return emAtendimentoNormal || pendenteAssinatura;
                });
                return casosOcupando.length === 0;
            });

            const headerActions = document.querySelector('.relative.flex.items-center.w-full.sm\\:w-auto.justify-end');
            if (!headerActions) return;

            const btnId = 'btn-colabs-disponiveis-' + this.currentPauta.id;
            
            // Remove botões de outras pautas
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

    // ============================================================
    // applyRoleBasedUI
    // ============================================================
    applyRoleBasedUI() {
        const currentUser = this.currentUser;
        const currentUserRole = currentUser ? currentUser.role : null; 
        const isAuthenticated = this.auth && this.auth.currentUser != null;
        const isUserApproved = currentUser ? currentUser.status === 'approved' : false; 
        const isApoio = currentUserRole === 'apoio'; 
        
        const adminPanelBtnMain = document.getElementById('admin-btn-main');
        const adminPanelBtnPautaSelection = document.getElementById('admin-panel-btn');
        const canAccessAdminPanel = (currentUserRole === 'admin' || currentUserRole === 'superadmin') && isAuthenticated && isUserApproved;
        
        if (adminPanelBtnMain) {
            if (canAccessAdminPanel) adminPanelBtnMain.classList.remove('hidden');
            else adminPanelBtnMain.classList.add('hidden');
        }
        if (adminPanelBtnPautaSelection) {
            if (canAccessAdminPanel) adminPanelBtnPautaSelection.classList.remove('hidden');
            else adminPanelBtnPautaSelection.classList.add('hidden');
        }

        const btnRecepcaoCentral = document.getElementById('btn-recepcao-central');
        if (btnRecepcaoCentral) {
            const isModoEvento = (this.currentMode === 'evento');
            const temPermissao = ['apoio', 'admin', 'superadmin'].indexOf(currentUserRole) !== -1 && isAuthenticated && isUserApproved;
            const deveMostrar = temPermissao && !isModoEvento;
            if (deveMostrar) btnRecepcaoCentral.classList.remove('hidden');
            else btnRecepcaoCentral.classList.add('hidden');
        }

        const closePautaBtn = document.getElementById('close-pauta-btn');
        const reopenPautaBtn = document.getElementById('reopen-pauta-btn');
        const resetAllBtn = document.getElementById('reset-all-btn');
        const manageMembersBtn = document.getElementById('manage-members-btn');
        const manageCollaboratorsBtn = document.getElementById('manage-collaborators-btn');
        const viewStatsBtn = document.getElementById('view-stats-btn');

        const canManagePauta = (isUserApproved && (currentUserRole === 'user' || currentUserRole === 'apoio')) || currentUserRole === 'admin' || currentUserRole === 'superadmin';
        
        if (closePautaBtn) {
            if (canManagePauta) closePautaBtn.classList.remove('hidden');
            else closePautaBtn.classList.add('hidden');
        }
        if (reopenPautaBtn) {
            if (canManagePauta) reopenPautaBtn.classList.remove('hidden');
            else reopenPautaBtn.classList.add('hidden');
        }
        if (resetAllBtn) {
            if (canManagePauta) resetAllBtn.classList.remove('hidden');
            else resetAllBtn.classList.add('hidden');
        }
        if (manageMembersBtn) {
            if (canManagePauta) manageMembersBtn.classList.remove('hidden');
            else manageMembersBtn.classList.add('hidden');
        }
        if (manageCollaboratorsBtn) {
            if (canManagePauta) manageCollaboratorsBtn.classList.remove('hidden');
            else manageCollaboratorsBtn.classList.add('hidden');
        }
        if (viewStatsBtn) {
            if (canAccessAdminPanel) viewStatsBtn.classList.remove('hidden');
            else viewStatsBtn.classList.add('hidden');
        }

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
        if (fileUpload) {
            if (isApoio) fileUpload.disabled = true;
            else fileUpload.disabled = false;
        }
        if (btnSyncVerde) {
            if (isApoio) btnSyncVerde.disabled = true;
            else btnSyncVerde.disabled = false;
        }

        const btnMonitor = document.getElementById('btn-painel-geral-externo');
        if (btnMonitor) {
            const liberadoApoio = this.currentPautaData ? this.currentPautaData.liberarPainelGeralApoio === true : false;
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

    // ============================================================
    // deletePauta
    // ============================================================
    async deletePauta(pautaId, pautaName) {
        const pautaRef = doc(this.db, "pautas", pautaId);
        const pautaSnap = await getDoc(pautaRef);
        
        if (!pautaSnap.exists()) {
            showNotification("Pauta não encontrada!", "error");
            return;
        }
        
        const pautaData = pautaSnap.data();
        const currentUserId = this.auth.currentUser ? this.auth.currentUser.uid : null;
        
        if (pautaData.owner !== currentUserId && 
            this.currentUser && this.currentUser.role !== 'admin' && 
            this.currentUser && this.currentUser.role !== 'superadmin') {
            showNotification("Você não tem permissão para excluir esta pauta!", "error");
            return;
        }
        
        const confirmDelete = confirm("⚠️ ATENÇÃO: Tem certeza que deseja excluir a pauta \"" + pautaName + "\"?\n\nEsta ação irá deletar TODOS os dados da pauta, incluindo:\n- Todos os assistidos\n- Todos os atendimentos\n- Todas as configurações\n\nEsta ação NÃO pode ser desfeita!");
        
        if (!confirmDelete) return;
        
        showNotification("Excluindo pauta \"" + pautaName + "\"...", "info");
        
        try {
            const attendancesRef = collection(this.db, "pautas", pautaId, "attendances");
            const attendancesSnap = await getDocs(attendancesRef);
            
            const batch = writeBatch(this.db);
            let operationCount = 0;
            
            for (var i = 0; i < attendancesSnap.docs.length; i++) {
                const docRef = attendancesSnap.docs[i];
                batch.delete(docRef.ref);
                operationCount++;
                
                if (operationCount >= 490) {
                    await batch.commit();
                    operationCount = 0;
                }
            }
            
            if (operationCount > 0) {
                await batch.commit();
            }
            
            await deleteDoc(pautaRef);
            
            showNotification("Pauta \"" + pautaName + "\" excluída com sucesso!", "success");
            await this.loadPautasWithFilter();
            
        } catch (error) {
            console.error("Erro ao excluir pauta:", error);
            showNotification("Erro ao excluir pauta. Tente novamente.", "error");
        }
    }
}

// ============================================================
// INICIALIZAÇÃO GLOBAL
// ============================================================

window.showNotification = showNotification;
window.openDetailsModal = openDetailsModal;
window.app = new SIGEPApp();

window.renderEstruturaAtual = renderEstruturaAtual;
window.abrirModalNovaRecepcao = abrirModalNovaRecepcao;
window.abrirGerenciarUnidades = abrirGerenciarUnidadesUsuario;

window.loadUsersList = loadUsersList;
window.cleanupOldData = cleanupOldData;
window.approveUser = approveUser;
window.updateUserRole = updateUserRole;
window.deleteUser = deleteUser;
window.loadAuditLogs = loadAuditLogs;
window.exportAuditLogsPDF = exportAuditLogsPDF;
window.loadDashboardData = loadDashboardData;
window.populateUserFilter = populateUserFilter;
window.setupAdminSearch = setupAdminSearch;
window.abrirGerenciadorUnidades = abrirGerenciadorUnidades;
window.abrirImportadorUnidades = abrirImportadorUnidades;
window.abrirModalUsuariosPorUnidade = abrirModalUsuariosPorUnidade;

// SWITCH DE VIEWS PARA CHECKLIST
window.switchToChecklistView = function() {
    const actionSelection = document.getElementById('document-action-selection');
    const checklistView = document.getElementById('document-checklist-view');
    const checklistHeader = document.getElementById('document-checklist-view-header');
    const checklistSearch = document.getElementById('checklist-search-container');
    
    if (actionSelection) actionSelection.classList.add('hidden');
    if (checklistView) checklistView.classList.remove('hidden');
    if (checklistHeader) checklistHeader.classList.remove('hidden');
    if (checklistSearch) checklistSearch.classList.remove('hidden');
};

window.switchToActionSelectionView = function() {
    const checklistView = document.getElementById('document-checklist-view');
    const actionSelection = document.getElementById('document-action-selection');
    const checklistHeader = document.getElementById('document-checklist-view-header');
    const checklistSearch = document.getElementById('checklist-search-container');
    
    if (checklistView) checklistView.classList.add('hidden');
    if (actionSelection) actionSelection.classList.remove('hidden');
    if (checklistHeader) checklistHeader.classList.add('hidden');
    if (checklistSearch) checklistSearch.classList.add('hidden');
};

// FUNÇÕES AUXILIARES PARA CHECKLIST
window.getReuDataFromForm = function() {
    const checkReuUnico = document.getElementById('check-reu-unico');
    const nomeReu = document.getElementById('nome-reu');
    const cpfReu = document.getElementById('cpf-reu');
    const telefoneReu = document.getElementById('telefone-reu');
    const cepReu = document.getElementById('cep-reu');
    const ruaReu = document.getElementById('rua-reu');
    const numeroReu = document.getElementById('numero-reu');
    const complementoReu = document.getElementById('complemento-reu');
    const bairroReu = document.getElementById('bairro-reu');
    const cidadeReu = document.getElementById('cidade-reu');
    const estadoReu = document.getElementById('estado-reu');
    const referenciaReu = document.getElementById('referencia-reu');
    const empresaReu = document.getElementById('empresa-reu');
    const ruaComercialReu = document.getElementById('rua-comercial-reu');
    const numeroComercialReu = document.getElementById('numero-comercial-reu');
    const bairroComercialReu = document.getElementById('bairro-comercial-reu');
    const cidadeComercialReu = document.getElementById('cidade-comercial-reu');
    const estadoComercialReu = document.getElementById('estado-comercial-reu');
    const cepComercialReu = document.getElementById('cep-comercial-reu');
    
    return {
        checkReuUnico: checkReuUnico ? checkReuUnico.checked : false,
        nome: nomeReu ? nomeReu.value || '' : '',
        cpf: cpfReu ? cpfReu.value || '' : '',
        telefone: telefoneReu ? telefoneReu.value || '' : '',
        cep: cepReu ? cepReu.value || '' : '',
        rua: ruaReu ? ruaReu.value || '' : '',
        numero: numeroReu ? numeroReu.value || '' : '',
        complemento: complementoReu ? complementoReu.value || '' : '',
        bairro: bairroReu ? bairroReu.value || '' : '',
        cidade: cidadeReu ? cidadeReu.value || '' : '',
        uf: estadoReu ? estadoReu.value || '' : '',
        referencia: referenciaReu ? referenciaReu.value || '' : '',
        empresa: empresaReu ? empresaReu.value || '' : '',
        rua_comercial: ruaComercialReu ? ruaComercialReu.value || '' : '',
        numero_comercial: numeroComercialReu ? numeroComercialReu.value || '' : '',
        bairro_comercial: bairroComercialReu ? bairroComercialReu.value || '' : '',
        cidade_comercial: cidadeComercialReu ? cidadeComercialReu.value || '' : '',
        uf_comercial: estadoComercialReu ? estadoComercialReu.value || '' : '',
        cep_comercial: cepComercialReu ? cepComercialReu.value || '' : ''
    };
};

window.getExpenseDataFromForm = function() {
    const checkExibirGastos = document.getElementById('check-exibir-gastos');
    const expenseMoradia = document.getElementById('expense-moradia');
    const expenseAlimentacao = document.getElementById('expense-alimentacao');
    const expenseEducacao = document.getElementById('expense-educacao');
    const expenseSaude = document.getElementById('expense-saude');
    const expenseVestuario = document.getElementById('expense-vestuario');
    const expenseLazer = document.getElementById('expense-lazer');
    const expenseOutras = document.getElementById('expense-outras');
    
    return {
        checkExibirGastos: checkExibirGastos ? checkExibirGastos.checked : true,
        moradia: expenseMoradia ? expenseMoradia.value || '' : '',
        alimentacao: expenseAlimentacao ? expenseAlimentacao.value || '' : '',
        educacao: expenseEducacao ? expenseEducacao.value || '' : '',
        saude: expenseSaude ? expenseSaude.value || '' : '',
        vestuario: expenseVestuario ? expenseVestuario.value || '' : '',
        lazer: expenseLazer ? expenseLazer.value || '' : '',
        outras: expenseOutras ? expenseOutras.value || '' : ''
    };
};

// SORT COLABORADORES
window.sortColaboradores = function(criterio) {
    if (typeof CollaboratorService !== 'undefined' && typeof CollaboratorService.sortColaboradores === 'function') {
        CollaboratorService.sortColaboradores(window.app, criterio);
    } else {
        if (!window.app || !window.app.colaboradores) return;
        
        window._sortColabDir = window._sortColabDir === 'asc' ? 'desc' : 'asc';
        var direction = window._sortColabDir === 'asc' ? 1 : -1;
        
        window.app.colaboradores.sort(function(a, b) {
            var valA = (a[criterio] || '').toString().toLowerCase();
            var valB = (b[criterio] || '').toString().toLowerCase();
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

// ============================================================
// EVENTOS DOMContentLoaded
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
    const toggleBtn = document.getElementById('toggle-logic-btn-padrao');
    const content = document.getElementById('logic-explanation-padrao-content');
    
    if (toggleBtn && content) {
        toggleBtn.addEventListener('click', function(e) {
            e.preventDefault();
            content.classList.toggle('hidden');
            toggleBtn.textContent = content.classList.contains('hidden') 
                ? 'Por que esta ordem é a mais justa? (Clique para expandir)'
                : 'Por que esta ordem é a mais justa? (Clique para recolher)';
        });
    }

    const btnManual = document.getElementById('btn-footer-manual');
    const btnTermos = document.getElementById('btn-footer-termos');
    const btnPolitica = document.getElementById('btn-footer-politica');
    
    if (btnManual) {
        btnManual.addEventListener('click', function() { 
            const manualModal = document.getElementById('manual-modal');
            if (manualModal) manualModal.classList.remove('hidden'); 
        });
    }
    if (btnTermos) {
        btnTermos.addEventListener('click', function() { 
            const termsModal = document.getElementById('terms-modal');
            if (termsModal) termsModal.classList.remove('hidden'); 
        });
    }
    if (btnPolitica) {
        btnPolitica.addEventListener('click', function() { 
            const privacyModal = document.getElementById('privacy-policy-modal');
            if (privacyModal) privacyModal.classList.remove('hidden'); 
        });
    }

    var fecharModal = function(modalId) { 
        const modal = document.getElementById(modalId); 
        if (modal) modal.classList.add('hidden'); 
    };
    
    const closeManualBtn = document.getElementById('close-manual-modal-btn');
    if (closeManualBtn) closeManualBtn.addEventListener('click', function() { fecharModal('manual-modal'); });
    
    const closeManualX = document.getElementById('close-manual-modal-x');
    if (closeManualX) closeManualX.addEventListener('click', function() { fecharModal('manual-modal'); });
    
    const closeTermsBtn = document.getElementById('close-terms-modal-btn');
    if (closeTermsBtn) closeTermsBtn.addEventListener('click', function() { fecharModal('terms-modal'); });
    
    const closeTermsX = document.getElementById('close-terms-modal-x');
    if (closeTermsX) closeTermsX.addEventListener('click', function() { fecharModal('terms-modal'); });
    
    const closePolicyX = document.getElementById('close-policy-modal-btn-x');
    if (closePolicyX) closePolicyX.addEventListener('click', function() { fecharModal('privacy-policy-modal'); });
    
    const loginContainer = document.getElementById('login-container');
    const footerLinks = document.getElementById('footer-links');
    const footerInner = document.getElementById('footer-inner-container');
    
    if (loginContainer && footerLinks && footerInner) {
        var updateFooterVisibility = function() {
            if (loginContainer.classList.contains('hidden')) {
                footerLinks.classList.remove('hidden');
                footerLinks.classList.add('flex');
                footerInner.classList.remove('justify-center');
                footerInner.classList.add('justify-between');
                document.body.classList.remove('is-logged-out');
            } else {
                footerLinks.classList.add('hidden');
                footerLinks.classList.remove('flex');
                footerInner.classList.remove('justify-between');
                footerInner.classList.add('justify-center');
                document.body.classList.add('is-logged-out');
            }
        };
        
        updateFooterVisibility();
        var observer = new MutationObserver(updateFooterVisibility);
        observer.observe(loginContainer, { attributes: true, attributeFilter: ['class'] });
    }

    const lgpdModal = document.getElementById('lgpd-acceptance-modal');
    const chkTermos = document.getElementById('lgpd-check-termos');
    const chkPrivacidade = document.getElementById('lgpd-check-privacidade');
    const btnConfirmLgpd = document.getElementById('btn-confirm-lgpd');
    const hasAcceptedLGPD = localStorage.getItem('sigep_lgpd_accepted') === 'true';

    var validateLgpdChecks = function() {
        var termosChecked = chkTermos ? chkTermos.checked : false;
        var privChecked = chkPrivacidade ? chkPrivacidade.checked : false;
        
        if (termosChecked && privChecked) {
            if (btnConfirmLgpd) {
                btnConfirmLgpd.classList.remove('bg-gray-400', 'cursor-not-allowed');
                btnConfirmLgpd.classList.add('bg-green-600', 'hover:bg-green-700');
                btnConfirmLgpd.disabled = false;
            }
        } else {
            if (btnConfirmLgpd) {
                btnConfirmLgpd.classList.add('bg-gray-400', 'cursor-not-allowed');
                btnConfirmLgpd.classList.remove('bg-green-600', 'hover:bg-green-700');
                btnConfirmLgpd.disabled = true;
            }
        }
    };

    if (chkTermos) chkTermos.addEventListener('change', validateLgpdChecks);
    if (chkPrivacidade) chkPrivacidade.addEventListener('change', validateLgpdChecks);

    if (btnConfirmLgpd) {
        btnConfirmLgpd.addEventListener('click', function() {
            localStorage.setItem('sigep_lgpd_accepted', 'true');
            if (lgpdModal) lgpdModal.classList.add('hidden');
            if (window.showToast) window.showToast("Termos e Política aceitos com sucesso!", "success");
        });
    }

    var authObserver = new MutationObserver(function() {
        var isLoginHidden = loginContainer ? loginContainer.classList.contains('hidden') : false;
        if (isLoginHidden && !hasAcceptedLGPD && lgpdModal) {
            lgpdModal.classList.remove('hidden');
        }
    });

    if (loginContainer) {
        authObserver.observe(loginContainer, { attributes: true, attributeFilter: ['class'] });
    }

    var originalConsoleError = console.error;
    console.error = function() {
        if (arguments[0] && typeof arguments[0] === 'string' && arguments[0].includes('Erro ao carregar lista de usuários')) {
            if (document.body.classList.contains('is-logged-out')) return;
        }
        originalConsoleError.apply(console, arguments);
    };

    const tabAgendamento = document.getElementById('tab-agendamento');
    const tabAvulso = document.getElementById('tab-avulso');
    const isScheduledContainer = document.getElementById('is-scheduled-container');
    const radioScheduledNo = document.querySelector('input[name="is-scheduled"][value="no"]');
    const scheduledTimeWrapper = document.getElementById('scheduled-time-wrapper');

    var toggleExclusiveTabs = function(activeTab, inactiveTab) {
        if (!activeTab || !inactiveTab) return;
        activeTab.classList.add('tab-active');
        activeTab.classList.remove('text-gray-500', 'hover:text-gray-700', 'hover:bg-gray-100');
        inactiveTab.classList.remove('tab-active');
        inactiveTab.classList.add('text-gray-500', 'hover:text-gray-700', 'hover:bg-gray-100');
    };

    if (tabAgendamento && tabAvulso) {
        tabAgendamento.addEventListener('click', function() {
            toggleExclusiveTabs(tabAgendamento, tabAvulso);
            if (isScheduledContainer) isScheduledContainer.classList.remove('hidden');
        });
        
        tabAvulso.addEventListener('click', function() {
            toggleExclusiveTabs(tabAvulso, tabAgendamento);
            if (isScheduledContainer) isScheduledContainer.classList.add('hidden');
            if (radioScheduledNo) radioScheduledNo.checked = true;
            if (scheduledTimeWrapper) scheduledTimeWrapper.classList.add('hidden');
        });

        var observerTabs = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.target === tabAgendamento && tabAgendamento.classList.contains('tab-active')) {
                    if (tabAvulso.classList.contains('tab-active')) {
                        tabAvulso.classList.remove('tab-active');
                        tabAvulso.classList.add('text-gray-500', 'hover:text-gray-700', 'hover:bg-gray-100');
                    }
                } else if (mutation.target === tabAvulso && tabAvulso.classList.contains('tab-active')) {
                    if (tabAgendamento.classList.contains('tab-active')) {
                        tabAgendamento.classList.remove('tab-active');
                        tabAgendamento.classList.add('text-gray-500', 'hover:text-gray-700', 'hover:bg-gray-100');
                    }
                }
            });
        });

        observerTabs.observe(tabAgendamento, { attributes: true, attributeFilter: ['class'] });
        observerTabs.observe(tabAvulso, { attributes: true, attributeFilter: ['class'] });
        
        if (tabAgendamento.classList.contains('tab-active') && tabAvulso.classList.contains('tab-active')) {
            toggleExclusiveTabs(tabAgendamento, tabAvulso);
        }
    }

    var setAppState = function(state) {
        if (state === 'login') {
            localStorage.removeItem('sigep_active_screen');
            localStorage.removeItem('sigep_app_state');
        }
    };

    const modoBackToLogin = document.getElementById('modo-back-to-login');
    if (modoBackToLogin) {
        modoBackToLogin.addEventListener('click', function() {
            setAppState('login');
            if (window.app && window.app.logout) window.app.logout();
        });
    }
    
    const btnVoltarLogin = document.getElementById('modo-back-to-login');
    const modoSelectionScreen = document.getElementById('modo-selection-screen');
    
    if (btnVoltarLogin) {
        btnVoltarLogin.addEventListener('click', function() {
            if (modoSelectionScreen) modoSelectionScreen.classList.add('hidden');
            const loginContainer2 = document.getElementById('login-container');
            if (loginContainer2) loginContainer2.classList.remove('hidden');
            if (window.app && window.app.logout) window.app.logout();
        });
    }
});

// ============================================================
// EVENTO blur para CEP
// ============================================================
document.addEventListener('blur', async (e) => {
    if (e.target.id === 'cep-reu') {
        const cep = e.target.value.replace(/\D/g, '');
        if (cep.length === 8) {
            try {
                const response = await fetch('https://viacep.com.br/ws/' + cep + '/json/');
                const data = await response.json();
                if (!data.erro) {
                    const ruaReu = document.getElementById('rua-reu');
                    const bairroReu = document.getElementById('bairro-reu');
                    const cidadeReu = document.getElementById('cidade-reu');
                    const estadoReu = document.getElementById('estado-reu');
                    
                    if (ruaReu) ruaReu.value = data.logradouro || '';
                    if (bairroReu) bairroReu.value = data.bairro || '';
                    if (cidadeReu) cidadeReu.value = data.localidade || '';
                    if (estadoReu) estadoReu.value = data.uf || '';
                } else {
                    showNotification("CEP não encontrado", "error");
                }
            } catch (error) {
                showNotification("Erro ao buscar CEP", "error");
            }
        }
    }
}, true);
