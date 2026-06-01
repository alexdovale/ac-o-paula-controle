// main.js - SIGEP APP PRINCIPAL (COMPLETO)

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
import { 
    logAction, loadUsersList, cleanupOldData, approveUser, updateUserRole, 
    deleteUser, loadAuditLogs, exportAuditLogsPDF, loadDashboardData, 
    populateUserFilter, setupAdminSearch, abrirGerenciadorUnidades,
    abrirImportadorUnidades, abrirModalUsuariosPorUnidade, AdminService
} from './admin.js';
import { parsePautaCSV } from './csvHandler.js';
import { getChecklistHTML } from './checklist.js';
import { PainelGeralService } from './painelGeralService.js'; 

import { PautaConfigService } from './pautaConfig.js';
import { RecepçãoCentralService } from './recepcaoCentral.js';
import { ImportadorOrgaosService } from './importadorOrgaos.js';
import { renderEstruturaAtual } from './estruturaAtual.js';
import { abrirModalNovaRecepcao } from './novaRecepcao.js';
import { abrirGerenciarUnidades as abrirGerenciarUnidadesUsuario } from './gerenciarUnidadesUsuario.js';

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
    }

    async init() {
        try {
            const app = initializeApp(firebaseConfig);
            this.db = getFirestore(app);
            this.auth = getAuth(app);

            // ============================================================
            // VERIFICAR SE É A TELA DA TV (PAINEL PÚBLICO NATIVO)
            // ============================================================
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('painel') === 'true') {
                const { PainelPublicoService } = await import('./painelPublico.js');
                await PainelPublicoService.init(this);
                return; 
            }
            // ============================================================

            DashboardService.init(this);

            await this.setupOfflinePersistence();
            this.setupEventListeners();
            this.setupAuthListener();
            
            setupDetailsModal({ db: this.db });
            this.loadExternalModalsContent();
            
            PautaConfigService.init(this);
            this.setupModoListeners();
            
            window.app = this;
            
            if (AdminService && AdminService.setupAdminEvents) {
                AdminService.setupAdminEvents(this);
            }
            
            // Ouvinte para botão voltar/avançar do navegador (Routing SPA)
            window.addEventListener('popstate', () => {
                if (this.auth && this.auth.currentUser) {
                    this.handleRoute();
                }
            });

        } catch (error) {
            console.error("Erro na inicialização:", error);
            showNotification("Erro ao iniciar o sistema SIGEP", "error");
        }
    }

    // ============================================================
    // SISTEMA DE ROTAS NATIVAS
    // ============================================================
    changeUrl(path) {
        const url = new URL(window.location.href);
        const segments = url.pathname.split('/').filter(s => s !== '');
        
        // Garante que a raiz do repositório no GitHub Pages seja mantida
        let basePath = '/';
        if (segments.length > 0 && segments[0] === 'ac-o-paula-controle') {
            basePath = '/ac-o-paula-controle/';
        }
        
        window.history.pushState({}, '', basePath + path);
    }

    handleRoute() {
        if (!this.auth?.currentUser) return;
        const path = window.location.pathname.toLowerCase();
        
        if (path.includes('/admin')) {
            this.showAdminScreen();
        } else if (path.includes('/recepcaocentral')) {
            RecepçãoCentralService.abrir(this);
        } else if (path.includes('/dashboard')) {
            DashboardService.showDashboardScreen();
        } else {
            this.showPautaSelectionScreen();
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
        document.getElementById('btn-unidades-master')?.addEventListener('click', () => {
            if (ImportadorOrgaosService && typeof ImportadorOrgaosService.abrirModalMaster === 'function') {
                ImportadorOrgaosService.abrirModalMaster(this);
            } else if (typeof abrirGerenciadorUnidades === 'function') {
                abrirGerenciadorUnidades(this.db);
            }
        });
        
        document.getElementById('admin-back-to-pautas-btn')?.addEventListener('click', () => {
            this.changeUrl('');
            this.showPautaSelectionScreen();
        });
        
        document.getElementById('view-audit-logs-btn')?.addEventListener('click', async () => {
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
        
        document.getElementById('cleanup-old-data-btn')?.addEventListener('click', () => {
            cleanupOldData(this.db);
        });
        
        document.getElementById('btn-load-dashboard')?.addEventListener('click', () => {
            loadDashboardData(this.db);
        });
        
        document.getElementById('export-audit-pdf-btn')?.addEventListener('click', () => {
            exportAuditLogsPDF(this.db);
        });
        
        document.getElementById('filter-log-user')?.addEventListener('change', () => loadAuditLogs(this.db));
        document.getElementById('filter-log-action')?.addEventListener('change', () => loadAuditLogs(this.db));
        document.getElementById('filter-log-start')?.addEventListener('change', () => loadAuditLogs(this.db));
        document.getElementById('filter-log-end')?.addEventListener('change', () => loadAuditLogs(this.db));
    }

    setupModoListeners() {
        document.getElementById('btn-modo-normal')?.addEventListener('click', async () => {
            this.currentMode = 'normal';
            localStorage.setItem('sigep_current_mode', 'normal');
            localStorage.setItem('sigep_active_screen', 'pauta-selection');
            localStorage.removeItem('sigep_app_state');
            await this.showPautaSelectionScreen();
            this.applyRoleBasedUI();
            showNotification('Modo Normal ativado - Atendimento regular', 'info', 3000);
        });
    
        document.getElementById('btn-modo-evento')?.addEventListener('click', async () => {
            this.currentMode = 'evento';
            localStorage.setItem('sigep_current_mode', 'evento');
            localStorage.setItem('sigep_active_screen', 'pauta-selection');
            localStorage.removeItem('sigep_app_state');
            await this.showPautaSelectionScreen();
            this.applyRoleBasedUI();
            showNotification('Modo Evento ativado - Mutirão/Plantão/Ação Social', 'info', 3000);
        });
    }

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
        document.querySelectorAll('[id^="btn-colabs-disponiveis-"]').forEach(btn => btn.remove());

        UIService.showScreen('modoSelection');
        this.applyRoleBasedUI();
        showNotification('Modo alterado com sucesso!', 'info', 2000);
    }

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
            
            modal.querySelectorAll('.tipo-evento-btn').forEach(btn => {
                btn.addEventListener('click', () => handleSelect(btn.dataset.tipo));
            });
            
            modal.querySelector('#cancel-tipo-evento').addEventListener('click', () => {
                modal.remove();
                resolve(null);
            });
        });
    }

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

                const path = window.location.pathname.toLowerCase();
                const isRoot = path.endsWith('/') || path.endsWith('/index.html') || path.endsWith('/ac-o-paula-controle') || path.endsWith('/ac-o-paula-controle/');

                // Restaura o estado salvo da pauta se estiver na raiz
                if (isRoot && telaAtiva === 'app' && pautaId && pautaNome) {
                    await this.loadPauta(pautaId, pautaNome, pautaTipo);
                } else {
                    // Resolve as rotas ativas (admin, recepcaocentral, etc)
                    this.handleRoute();
                }

            } else {
                UIService.showScreen('login');
                document.getElementById('admin-panel-btn')?.classList.add('hidden');
                document.getElementById('admin-btn-main')?.classList.add('hidden');
            }
        });
    }

    setupOfflinePersistence() {
        try {
            enableIndexedDbPersistence(this.db, { synchronizeTabs: true }).catch((err) => {
                if (err.code == 'failed-precondition') {
                    console.warn('⚠️ Persistência desativada: Múltiplas abas abertas.');
                    showNotification('Múltiplas abas detectadas. Feche outras abas para evitar erros no modo offline.', 'warning');
                } else if (err.code == 'unimplemented') {
                    console.warn('⚠️ Navegador não suporta persistência offline.');
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
                }
            } catch (error) {
                console.error(`Erro ao tentar buscar ${item.url}:`, error);
            }
        }
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
            this.changeUrl('dashboard');
            DashboardService.showDashboardScreen();
        });

        document.getElementById('dashboard-back-to-pautas-btn')?.addEventListener('click', () => {
            this.changeUrl('');
            this.showPautaSelectionScreen();
        });        

        document.getElementById('btn-recepcao-central')?.addEventListener('click', async () => {
            this.changeUrl('recepcaocentral');
            await RecepçãoCentralService.abrir(this);
        });

        document.getElementById('btn-trocar-modo')?.addEventListener('click', () => {
            this.voltarParaSelecaoModo();
        });
        
        document.getElementById('btn-trocar-modo-app')?.addEventListener('click', () => {
            this.voltarParaSelecaoModo();
        });

        document.getElementById('create-pauta-btn')?.addEventListener('click', async () => {
            const modoAtual = this.currentMode;
            
            if (modoAtual === 'evento') {
                const tipoEvento = await this.mostrarSeletorTipoEvento();
                if (!tipoEvento) return;
                this.tipoPautaSelecionado = tipoEvento;
            } else {
                this.tipoPautaSelecionado = 'normal';
            }
            
            const typeModal = document.getElementById('pauta-type-modal');
            if (typeModal) {
                typeModal.classList.remove('hidden');
            } else {
                showNotification("Modal de tipo de pauta não encontrado.", "error");
            }
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
            document.querySelectorAll('[id^="btn-colabs-disponiveis-"]').forEach(btn => btn.remove());

            this.changeUrl('');
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

        // ---------------- ROTAS ATUALIZADAS AQUI ---------------- 
        const adminPanelBtnPautaSelection = document.getElementById('admin-panel-btn');
        if (adminPanelBtnPautaSelection) {
            adminPanelBtnPautaSelection.addEventListener('click', () => {
                this.changeUrl('admin');
                this.showAdminScreen();
            });
        }
        
        const adminBackBtn = document.getElementById('admin-back-to-pautas-btn');
        if (adminBackBtn) {
            adminBackBtn.addEventListener('click', () => {
                this.changeUrl('');
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

window.getReuDataFromForm = function() {
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
};

window.getExpenseDataFromForm = function() {
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
    
    if(btnManual) btnManual.addEventListener('click', () => { document.getElementById('manual-modal')?.classList.remove('hidden'); });
    if(btnTermos) btnTermos.addEventListener('click', () => { document.getElementById('terms-modal')?.classList.remove('hidden'); });
    if(btnPolitica) btnPolitica.addEventListener('click', () => { document.getElementById('privacy-policy-modal')?.classList.remove('hidden'); });

    const fecharModal = (modalId) => { const modal = document.getElementById(modalId); if(modal) modal.classList.add('hidden'); }
    document.getElementById('close-manual-modal-btn')?.addEventListener('click', () => fecharModal('manual-modal'));
    document.getElementById('close-manual-modal-x')?.addEventListener('click', () => fecharModal('manual-modal'));
    document.getElementById('close-terms-modal-btn')?.addEventListener('click', () => fecharModal('terms-modal'));
    document.getElementById('close-terms-modal-x')?.addEventListener('click', () => fecharModal('terms-modal'));
    document.getElementById('close-policy-modal-btn-x')?.addEventListener('click', () => fecharModal('privacy-policy-modal'));
    
    const loginContainer = document.getElementById('login-container');
    const footerLinks = document.getElementById('footer-links');
    const footerInner = document.getElementById('footer-inner-container');
    
    if (loginContainer && footerLinks && footerInner) {
        const updateFooterVisibility = () => {
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
        const observer = new MutationObserver(updateFooterVisibility);
        observer.observe(loginContainer, { attributes: true, attributeFilter: ['class'] });
    }

    const lgpdModal = document.getElementById('lgpd-acceptance-modal');
    const chkTermos = document.getElementById('lgpd-check-termos');
    const chkPrivacidade = document.getElementById('lgpd-check-privacidade');
    const btnConfirmLgpd = document.getElementById('btn-confirm-lgpd');
    const hasAcceptedLGPD = localStorage.getItem('sigep_lgpd_accepted') === 'true';

    const validateLgpdChecks = () => {
        if (chkTermos?.checked && chkPrivacidade?.checked) {
            btnConfirmLgpd?.classList.remove('bg-gray-400', 'cursor-not-allowed');
            btnConfirmLgpd?.classList.add('bg-green-600', 'hover:bg-green-700');
            if (btnConfirmLgpd) btnConfirmLgpd.disabled = false;
        } else {
            btnConfirmLgpd?.classList.add('bg-gray-400', 'cursor-not-allowed');
            btnConfirmLgpd?.classList.remove('bg-green-600', 'hover:bg-green-700');
            if (btnConfirmLgpd) btnConfirmLgpd.disabled = true;
        }
    };

    if (chkTermos) chkTermos.addEventListener('change', validateLgpdChecks);
    if (chkPrivacidade) chkPrivacidade.addEventListener('change', validateLgpdChecks);

    if (btnConfirmLgpd) {
        btnConfirmLgpd.addEventListener('click', () => {
            localStorage.setItem('sigep_lgpd_accepted', 'true');
            if (lgpdModal) lgpdModal.classList.add('hidden');
            if(window.showToast) window.showToast("Termos e Política aceitos com sucesso!", "success");
        });
    }

    const authObserver = new MutationObserver(() => {
        const isLoginHidden = loginContainer?.classList.contains('hidden');
        if (isLoginHidden && !hasAcceptedLGPD && lgpdModal) {
            lgpdModal.classList.remove('hidden');
        }
    });

    if (loginContainer) {
        authObserver.observe(loginContainer, { attributes: true, attributeFilter: ['class'] });
    }

    const originalConsoleError = console.error;
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

    const toggleExclusiveTabs = (activeTab, inactiveTab) => {
        if(!activeTab || !inactiveTab) return;
        activeTab.classList.add('tab-active');
        activeTab.classList.remove('text-gray-500', 'hover:text-gray-700', 'hover:bg-gray-100');
        inactiveTab.classList.remove('tab-active');
        inactiveTab.classList.add('text-gray-500', 'hover:text-gray-700', 'hover:bg-gray-100');
    };

    if (tabAgendamento && tabAvulso) {
        tabAgendamento.addEventListener('click', () => {
            toggleExclusiveTabs(tabAgendamento, tabAvulso);
            if(isScheduledContainer) isScheduledContainer.classList.remove('hidden');
        });
        
        tabAvulso.addEventListener('click', () => {
            toggleExclusiveTabs(tabAvulso, tabAgendamento);
            if(isScheduledContainer) isScheduledContainer.classList.add('hidden');
            if(radioScheduledNo) radioScheduledNo.checked = true;
            if(scheduledTimeWrapper) scheduledTimeWrapper.classList.add('hidden');
        });

        const observerTabs = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
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

    const setAppState = (state) => {
        if (state === 'login') {
            localStorage.removeItem('sigep_active_screen');
            localStorage.removeItem('sigep_app_state');
        }
    };

    document.getElementById('modo-back-to-login')?.addEventListener('click', () => {
        setAppState('login');
        if (window.app && window.app.logout) window.app.logout();
    });
    
    const btnVoltarLogin = document.getElementById('modo-back-to-login');
    const modoSelectionScreen = document.getElementById('modo-selection-screen');
    
    if(btnVoltarLogin) {
        btnVoltarLogin.addEventListener('click', () => {
            if (modoSelectionScreen) modoSelectionScreen.classList.add('hidden');
            document.getElementById('login-container')?.classList.remove('hidden');
            if(window.app && window.app.logout) window.app.logout();
        });
    }
});

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
