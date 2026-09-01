// js/main.js - SIGEP APP PRINCIPAL (COMPLETO COM ROUTER E MÓDULO DE COLETAS)

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
// 🔥 OTIMIZAÇÃO: A importação do 'or' foi adicionada aqui para permitir as consultas compostas
import { getFirestore, collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, query, where, getDoc, getDocs, writeBatch, arrayUnion, arrayRemove, enableMultiTabIndexedDbPersistence, or } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { firebaseConfig } from './config.js';
import { AuthService } from './auth.js';
import { PautaService } from './pauta.js';
import { UIService } from './ui.js?v=2';
import CollaboratorService from './colaboradores.js'; 
window.CollaboratorService = CollaboratorService;  
import { ModalService } from './modal.js?v=20260707';
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
import { SIGEPRouter, ROUTES } from './router.js';
import { PerfilService } from './perfilService.js';

// Módulo de Coletas & BI
import { ColetasBuilderService } from './coletasBuilderService.js?v=2';
window.ColetasBuilderService = ColetasBuilderService;

import { ColetasBiService } from './coletasBiService.js';
window.ColetasBiService = ColetasBiService;

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
        
        // CARREGA O MODO SALVO DO LOCALSTORAGE (persistência após refresh)
        this.currentMode = localStorage.getItem('sigep_current_mode') || 'normal';
        this.currentUnidadeExibicao = localStorage.getItem('sigep_unidade_ativa') || 'todas';
        
        this.init();
    }

    async init() {
        try {
            const app = initializeApp(firebaseConfig);
            this.db   = getFirestore(app);
            this.auth = getAuth(app);
    
            // ── Inicializa o router antes de qualquer verificação de URL ──
            this.router = new SIGEPRouter(this, {
                UIService,
                DashboardService,
                RecepçãoCentralService,
                PerfilService,
                showNotification,
            });
            this.router.init();
    
            DashboardService.init(this);
            await this.setupOfflinePersistence();
            
            this.setupEventListeners();
            this.setupAuthListener();       // dispara resolveInitialRoute() internamente
    
            setupDetailsModal({ db: this.db });
            this.loadExternalModalsContent();
            PautaConfigService.init(this);
            this.setupModoListeners();
    
            window.app = this;
    
            if (AdminService?.setupAdminEvents) {
                AdminService.setupAdminEvents(this);
            }
    
        } catch (error) {
            console.error('Erro na inicialização:', error);
            showNotification('Erro ao iniciar o sistema SIGEP', 'error');
        }
    }

    // ============================================================
    // MÉTODOS DE COMPATIBILIDADE LEGADA E RENDERIZAÇÃO
    // ============================================================
    showPautaSelectionScreen() {
        document.getElementById('app-container')?.classList.add('hidden');
        document.getElementById('dashboard-container')?.classList.add('hidden');
        document.getElementById('admin-container')?.classList.add('hidden');
        document.getElementById('modo-selection-screen')?.classList.add('hidden');
        document.getElementById('coletas-container')?.classList.add('hidden');
        document.getElementById('meu-perfil-container')?.classList.add('hidden');
        document.getElementById('pauta-selection-container')?.classList.remove('hidden');
    }
    
    showAppScreen() {
        if (this.router) this.router.navigate(ROUTES.APP, {}, false);
    }
    
    showLoginScreen() {
        if (this.router) this.router.navigate(ROUTES.LOGIN, {}, false);
    }
    
    showDashboardScreen() {
        if (this.router) this.router.navigate(ROUTES.DASHBOARD, {}, false);
    }
    
    showRecepcaoCentralScreen() {
        if (this.router) this.router.navigate(ROUTES.RECEPCAO_CENTRAL, {}, false);
    }

    showAdminScreen() {
        document.getElementById('pauta-selection-container')?.classList.add('hidden');
        document.getElementById('dashboard-container')?.classList.add('hidden');
        document.getElementById('app-container')?.classList.add('hidden');
        document.getElementById('modo-selection-screen')?.classList.add('hidden');
        document.getElementById('coletas-container')?.classList.add('hidden');
        document.getElementById('meu-perfil-container')?.classList.add('hidden');
        document.getElementById('admin-container')?.classList.remove('hidden');
        this.renderAdminContent();
    }

    showColetasScreen() {
        document.getElementById('pauta-selection-container')?.classList.add('hidden');
        document.getElementById('dashboard-container')?.classList.add('hidden');
        document.getElementById('app-container')?.classList.add('hidden');
        document.getElementById('modo-selection-screen')?.classList.add('hidden');
        document.getElementById('admin-container')?.classList.add('hidden');
        document.getElementById('meu-perfil-container')?.classList.add('hidden');
        document.getElementById('coletas-container')?.classList.remove('hidden');
        this.listarColetas();
    }

    // 🔥 ADMIN RENDERIZADO VIA HTML EXTERNO (DESACOPLADO DO MAIN)
    // 🔥 ADMIN RENDERIZADO DIRETAMENTE (SEM FETCH, EVITA ERROS DE CORS LOCAL)
    async renderAdminContent() {
        const container = document.getElementById('admin-content');
        if (!container) return;
        
        container.innerHTML = `
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-2xl font-bold text-gray-800">Painel do Administrador</h2>
            </div>
            
            <div class="mb-6 flex flex-wrap gap-3">
                <button id="btn-unidades-master" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2.5 rounded-xl transition shadow-md flex items-center gap-2 text-sm">
                    <span>🏢</span> Gerenciar Unidades / Órgãos
                </button>
                <button id="btn-recepcoes-master" class="bg-purple-600 hover:bg-purple-700 text-white font-bold px-5 py-2.5 rounded-xl transition shadow-md flex items-center gap-2 text-sm">
                    <span>🏛️</span> Gerenciar Recepções (Unidades de Apoio)
                </button>
            </div>
            
            <div class="mb-8">
                <div class="mb-4">
                    <input type="text" id="search-pendentes" placeholder="Buscar usuário pendente..." class="w-full sm:w-80 px-4 py-2 border rounded-lg">
                </div>
                <h3 class="text-lg font-bold text-amber-700 mb-3 border-b pb-2">⏳ Usuários Pendentes</h3>
                <div id="pending-users-list" class="space-y-2"></div>
                <div id="pagination-pendentes" class="mt-4"></div>
            </div>
            
            <div class="mt-8">
                <div class="mb-4">
                    <input type="text" id="search-usuarios" placeholder="Buscar usuário..." class="w-full sm:w-80 px-4 py-2 border rounded-lg">
                </div>
                <h3 class="text-lg font-bold text-slate-800 mb-3 border-b pb-2">👥 Usuários do Sistema</h3>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm border-collapse">
                        <thead class="bg-slate-100">
                            <tr>
                                <th class="p-3 text-left">Usuário / Perfil Atual</th>
                                <th class="p-3 text-center">Unidades</th>
                                <th class="p-3 text-center">Alterar Permissão</th>
                                <th class="p-3 text-center">Ações</th>
                            </tr>
                        </thead>
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
                            <thead class="bg-slate-100">
                                <tr>
                                    <th class="p-3">Data/Hora</th>
                                    <th>Usuário</th>
                                    <th>Ação</th>
                                    <th>Detalhes</th>
                                </tr>
                            </thead>
                            <tbody id="audit-logs-table-body"></tbody>
                        </table>
                    </div>
                </div>
                <div id="pagination-logs" class="mt-4"></div>
                <div id="dashboard-results" class="hidden mt-6"></div>
            </div>
        `;
        
        // Entrega o controle de eventos para o AdminService
        if (AdminService?.setupAdminEvents) {
            AdminService.setupAdminEvents(this);
        }
    }

    setupModoListeners() {
        document.getElementById('btn-modo-normal')?.addEventListener('click', () => {
            this.currentMode = 'normal';
            localStorage.setItem('sigep_current_mode', 'normal');
            this.abrirModalSelecaoUnidade();
        });
    
        document.getElementById('btn-modo-evento')?.addEventListener('click', async () => {
            this.currentMode = 'evento';
            localStorage.setItem('sigep_current_mode', 'evento');
            localStorage.removeItem('sigep_app_state');
            
            await this.router.navigate(ROUTES.PAUTA_SELECTION, {}, true);
            this.applyRoleBasedUI();
            showNotification('Modo Evento ativado', 'info', 3000);
        });
    }

    async abrirModalSelecaoUnidade() {
        const modal = document.getElementById('select-unidade-modal');
        const select = document.getElementById('modal-unidade-select');
        if (!modal || !select) return;

        select.innerHTML = '<option value="todas">Carregando...</option>';
        modal.classList.remove('hidden');

        const userUnidades = this.currentUser?.unidades || [];
        const isAdmin = this.currentUser?.role === 'admin' || this.currentUser?.role === 'superadmin';

        if (isAdmin) {
            try {
                const { getDocs, collection } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
                const snap = await getDocs(collection(this.db, "unidades"));
                const allUnidades = snap.docs.map(d => d.data().nome).filter(Boolean).sort();
                
                let html = `<option value="todas">🌍 Todas as Unidades (Visão Admin)</option>`;
                if (userUnidades.length > 0) {
                    html += `<optgroup label="Minhas Unidades Vinculadas">`;
                    userUnidades.forEach(u => {
                        const nome = typeof u === 'string' ? u : (u.unidadeNome || u.nome || u.name);
                        if (nome) html += `<option value="${escapeHTML(nome)}">📍 ${escapeHTML(nome)}</option>`;
                    });
                    html += `</optgroup><optgroup label="Todas as Unidades do Sistema">`;
                }
                allUnidades.forEach(nome => {
                    html += `<option value="${escapeHTML(nome)}">🏢 ${escapeHTML(nome)}</option>`;
                });
                if (userUnidades.length > 0) html += `</optgroup>`;
                select.innerHTML = html;
            } catch (err) {
                select.innerHTML = `<option value="todas">🌍 Erro ao carregar unidades</option>`;
            }
        } else {
            let html = `<option value="todas">🌍 Todas as minhas unidades</option>`;
            userUnidades.forEach(u => {
                const nome = typeof u === 'string' ? u : (u.unidadeNome || u.nome || u.name);
                if (nome) html += `<option value="${escapeHTML(nome)}">📍 ${escapeHTML(nome)}</option>`;
            });
            select.innerHTML = html;
        }

        if (this.currentUnidadeExibicao) {
            const options = Array.from(select.options).map(opt => opt.value);
            if (options.includes(this.currentUnidadeExibicao)) select.value = this.currentUnidadeExibicao;
        }

        document.getElementById('cancel-unidade-modal').onclick = () => {
            modal.classList.add('hidden');
        };

        document.getElementById('confirm-unidade-modal').onclick = async () => {
            this.currentUnidadeExibicao = select.value;
            localStorage.setItem('sigep_unidade_ativa', select.value);
            modal.classList.add('hidden');
            
            localStorage.removeItem('sigep_app_state');
            await this.router.navigate(ROUTES.PAUTA_SELECTION, {}, true);
            this.applyRoleBasedUI();
            showNotification('Modo Normal ativado', 'info', 3000);
        };
    }

    voltarParaSelecaoModo() {
        this._teardownPauta();
        this.router.navigate(ROUTES.MODO_SELECTION, {}, false);
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
            try {
                if (user) {
                    await AuthService.handleAuthState(this, user);
                    await this.loadUserPreferences();
                    this.applyRoleBasedUI();
                    await this.router.resolveInitialRoute();
                } else {
                    this.currentUser = null;
                    await this.router.navigate(ROUTES.LOGIN, {}, true);
                }
            } catch (error) {
                console.error("Erro crítico na verificação de autenticação:", error);
                await this.router.navigate(ROUTES.LOGIN, {}, true);
            } finally {
                this.hideLoadingScreen();
            }
        });
    }

    hideLoadingScreen() {
        const idsDeCarregamento = [
            'loading-screen', 'global-loader', 'splash-screen', 
            'loading-container', 'auth-loading-spinner'
        ];
        idsDeCarregamento.forEach(id => {
            const loader = document.getElementById(id);
            if (loader) {
                loader.classList.add('hidden');
                loader.style.display = 'none'; 
            }
        });
    }

    async setupOfflinePersistence() {
        try {
            await enableMultiTabIndexedDbPersistence(this.db);
        } catch (err) {
            console.warn('⚠️ Cache/Offline warning:', err.code);
        }
        window.addEventListener('offline', () => document.getElementById('offline-indicator')?.classList.remove('hidden'));
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
                    if (container) container.innerHTML = html; 
                }
            } catch (error) {
                console.error(`Erro ao tentar buscar ${item.url}:`, error);
            }
        }
    }

    setupEventListeners() {
        this.setupAuthEvents();
        this.setupNavigationEvents();
        this.setupPautaMenuEvents();
        this.setupPautaSettingsEvents();
        this.setupAttendanceEvents();
        this.setupChecklistEvents();
        this.setupMiscEvents();
        this.setupGlobalModalsAndFooterEvents();
        
        NotesService.setup();
        UIService.setupFooterModals();
        this.setupSubjectsAutocomplete();
        this.setupColetas();
    }

    setupAuthEvents() {
        AuthService.setupEvents(this);
    }

    setupNavigationEvents() {
        document.getElementById('view-dashboard-btn')?.addEventListener('click', () => this.router.navigate(ROUTES.DASHBOARD, {}, false));
        document.getElementById('dashboard-back-to-pautas-btn')?.addEventListener('click', () => this.router.navigate(ROUTES.PAUTA_SELECTION, {}, false));       
        document.getElementById('btn-recepcao-central')?.addEventListener('click', () => this.router.navigate(ROUTES.RECEPCAO_CENTRAL, {}, false));
        
        document.getElementById('open-user-preferences-btn')?.addEventListener('click', () => this.router.navigate(ROUTES.MEU_PERFIL, {}, false));
        document.getElementById('perfil-back-btn')?.addEventListener('click', () => this.router.navigate(ROUTES.PAUTA_SELECTION, {}, false));
        
        document.getElementById('admin-panel-btn')?.addEventListener('click', () => this.router.navigate(ROUTES.ADMIN, {}, false));
        
        document.getElementById('back-to-pautas-btn')?.addEventListener('click', () => {
            this._teardownPauta();
            this.router.navigate(ROUTES.PAUTA_SELECTION, {}, false);
        });

        document.getElementById('btn-trocar-modo')?.addEventListener('click', () => this.voltarParaSelecaoModo());
        document.getElementById('btn-trocar-modo-app')?.addEventListener('click', () => this.voltarParaSelecaoModo());
        document.getElementById('btn-trocar-unidade')?.addEventListener('click', () => this.abrirModalSelecaoUnidade());

        document.getElementById('create-pauta-btn')?.addEventListener('click', async () => {
            const modoAtual = this.currentMode;
            if (modoAtual === 'evento') {
                const tipoEvento = await this.mostrarSeletorTipoEvento();
                if (!tipoEvento) return;
                this.tipoPautaSelecionado = tipoEvento;
            } else {
                this.tipoPautaSelecionado = 'normal';
            }
            document.getElementById('pauta-type-modal')?.classList.remove('hidden');
        });

        document.addEventListener('click', (e) => {
            const adminModal = document.getElementById('admin-modal');
            const pautaSettingsToggle = document.getElementById('pauta-settings-toggle');
            const actionsToggle = document.getElementById('actions-toggle');
            
            const actionsPanel = document.getElementById('actions-panel');
            if (actionsPanel && !actionsPanel.classList.contains('hidden') && !actionsPanel.contains(e.target) && !actionsToggle?.contains(e.target)) {
                actionsPanel.classList.add('opacity-0', 'scale-95', 'pointer-events-none');
                document.getElementById('actions-arrow')?.classList.remove('rotate-180');
            }
            
            const pautaSettingsPanel = document.getElementById('pauta-settings-panel');
            if (pautaSettingsPanel && !pautaSettingsPanel.classList.contains('hidden') && pautaSettingsToggle && !pautaSettingsToggle.contains(e.target)) {
                 pautaSettingsPanel.classList.add('hidden');
                 document.getElementById('pauta-settings-arrow')?.classList.remove('rotate-180');
            }
        });
        
        document.getElementById('modo-back-to-login')?.addEventListener('click', () => {
            localStorage.removeItem('sigep_active_screen');
            localStorage.removeItem('sigep_app_state');
            document.getElementById('modo-selection-screen')?.classList.add('hidden');
            document.getElementById('login-container')?.classList.remove('hidden');
            if(window.app && window.app.logout) window.app.logout();
            const cleanUrl = window.location.origin + window.location.pathname;
            window.history.pushState({}, '', cleanUrl);
        });
    }

    setupPautaMenuEvents() {
        document.getElementById('actions-toggle')?.addEventListener('click', UIService.toggleActionsPanel);

        document.getElementById('btn-painel-geral-externo')?.addEventListener('click', (e) => {
            if (e.isTrusted && this.currentPauta) {
                this.router.navigate(ROUTES.MONITOR_EQUIPE, { pautaId: this.currentPauta.id }, false);
                return;
            }
            if (typeof PainelGeralService !== 'undefined') {
                PainelGeralService.abrirPainel(this);
            }
        });

        document.getElementById('share-pauta-btn')?.addEventListener('click', (e) => {
            if (e.isTrusted && this.currentPauta) {
                this.router.navigate(ROUTES.COMPARTILHAMENTO, { pautaId: this.currentPauta.id }, false);
                return;
            }
            const modal = document.getElementById('share-modal');
            if (modal && this.currentPautaData) {
                document.getElementById('share-toggle').checked = this.currentPautaData.isPublic || false;
                document.getElementById('mask-names-check').checked = this.currentPautaData.maskNames || false;
                
                const isPublic = this.currentPautaData.isPublic;
                document.getElementById('share-status-text').textContent = isPublic ? "Público" : "Privado";
                
                if (isPublic) {
                    document.getElementById('share-link-container').classList.remove('hidden');
                    const link = `${window.location.origin}${window.location.pathname.replace('index.html', '')}acompanhamento.html?id=${this.currentPauta.id}`;
                    document.getElementById('share-link-input').value = link;
                    document.getElementById('open-external-btn').href = link;
                } else {
                    document.getElementById('share-link-container').classList.add('hidden');
                }
                modal.classList.remove('hidden');
            }
        });

        document.getElementById('open-totem-btn')?.addEventListener('click', (e) => {
            if (e.isTrusted && this.currentPauta) {
                this.router.navigate(ROUTES.TOTEM, { pautaId: this.currentPauta.id }, false);
                return;
            }
            if (this.currentPauta) {
                const totemUrl = `${window.location.origin}${window.location.pathname.replace('index.html', '')}totem.html?pautaId=${this.currentPauta.id}&r=app`;
                window.open(totemUrl, '_blank');
            }
        });

        document.getElementById('view-stats-btn')?.addEventListener('click', (e) => {
            if (e.isTrusted && this.currentPauta) {
                this.router.navigate(ROUTES.ESTATISTICAS, { pautaId: this.currentPauta.id }, false);
                return;
            }
            if (this.allAssisted && typeof StatisticsService?.showModal === 'function') {
                StatisticsService.showModal(this.allAssisted, this.currentPautaData?.useDelegationFlow, this.currentPauta?.name);
            }
        });

        document.getElementById('edit-pauta-name-btn')?.addEventListener('click', (e) => {
            if (e.isTrusted && this.currentPauta) {
                this.router.navigate(ROUTES.EDITAR_NOME_PAUTA, { pautaId: this.currentPauta.id }, false);
                return;
            }
            document.getElementById('edit-pauta-name-input').value = this.currentPauta?.name || '';
            document.getElementById('edit-pauta-modal')?.classList.remove('hidden');
        });

        document.getElementById('edit-pauta-config-btn')?.addEventListener('click', (e) => {
            if (e.isTrusted && this.currentPauta) {
                this.router.navigate(ROUTES.CONFIGURACAO_PAUTA, { pautaId: this.currentPauta.id }, false);
                return;
            }
            const modal = document.getElementById('bi-links-modal');
            if (modal) {
                modal.classList.remove('hidden');
                if (window.ColetasBuilderService && this.currentPautaData) {
                    document.getElementById('container-bi-links').innerHTML = window.ColetasBuilderService.renderConstrutorHTML(this.currentPautaData);
                    document.getElementById('bi-btn-adicionar-parceiro')?.addEventListener('click', () => {
                        window.ColetasBuilderService.adicionarParceiro(this.db, this.currentPauta.id, this.currentPautaData);
                    });
                }
            }
        });

        document.getElementById('manage-members-btn')?.addEventListener('click', async (e) => {
            if (e.isTrusted && this.currentPauta) {
                this.router.navigate(ROUTES.COMPARTILHAR_PAUTA, { pautaId: this.currentPauta.id }, false);
                return;
            }
            if (typeof ModalService?.openMembersModal === 'function') await ModalService.openMembersModal(this);
        });

        document.getElementById('manage-collaborators-btn')?.addEventListener('click', (e) => {
            if (e.isTrusted && this.currentPauta) {
                this.router.navigate(ROUTES.COLABORADORES_PAUTA, { pautaId: this.currentPauta.id }, false);
                return;
            }
            CollaboratorService.openModal(this);
        });

        document.getElementById('notes-btn')?.addEventListener('click', (e) => {
            if (e.isTrusted && this.currentPauta) {
                e.stopImmediatePropagation();
                this.router.navigate(ROUTES.ANOTACOES_PAUTA, { pautaId: this.currentPauta.id }, false);
                return;
            }
        });
    }

    setupPautaSettingsEvents() {
        const pautaSettingsToggle = document.getElementById('pauta-settings-toggle');
        const pautaSettingsPanel = document.getElementById('pauta-settings-panel');
        if (pautaSettingsToggle && pautaSettingsPanel) {
            pautaSettingsToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                pautaSettingsPanel.classList.toggle('hidden');
                if (!pautaSettingsPanel.classList.contains('hidden')) this.loadColumnPreferences();
            });
        }

        document.getElementById('toggle-em-atendimento')?.addEventListener('change', () => this.saveColumnPreferences());
        document.getElementById('toggle-distribuicao')?.addEventListener('change', () => this.saveColumnPreferences());
        document.getElementById('toggle-faltosos')?.addEventListener('change', () => this.saveColumnPreferences());

        document.getElementById('btn-manage-rooms')?.addEventListener('click', () => {
            const listContainer = document.getElementById('manage-rooms-list');
            if (!listContainer) return;
            listContainer.innerHTML = '';
            
            if (this.currentPautaData?.type === 'multisala' && this.customRoomsList?.length > 0) {
                this.customRoomsList.forEach((room) => {
                    const div = document.createElement('div');
                    div.className = "flex gap-2 items-center mb-3 bg-gray-50 p-2 rounded-lg border";
                    div.innerHTML = `<input type="text" class="room-edit-input flex-1 p-2 border rounded" data-original="${escapeHTML(room)}" value="${escapeHTML(room)}">`;
                    listContainer.appendChild(div);
                });
            }
            document.getElementById('manage-rooms-modal')?.classList.remove('hidden');
        });
        
        document.getElementById('save-manage-rooms-btn')?.addEventListener('click', async () => {
            const inputs = document.querySelectorAll('.room-edit-input');
            const newRoomsList = [];
            const roomChanges = []; 
            inputs.forEach(input => {
                const newName = input.value.trim();
                if (newName) {
                    newRoomsList.push(newName);
                    if (newName !== input.dataset.original) roomChanges.push({ oldName: input.dataset.original, newName });
                }
            });

            try {
                await updateDoc(doc(this.db, "pautas", this.currentPauta.id), { customRooms: newRoomsList, rooms: newRoomsList });
                this.customRoomsList = newRoomsList;
                if (this.currentPautaData) this.currentPautaData.customRooms = newRoomsList;

                if (roomChanges.length > 0) {
                    const batch = writeBatch(this.db);
                    let hasChanges = false;
                    this.allAssisted.forEach(assisted => {
                        const change = roomChanges.find(c => c.oldName === assisted.room);
                        if (change) {
                            batch.update(doc(this.db, "pautas", this.currentPauta.id, "attendances", assisted.id), { room: change.newName });
                            hasChanges = true;
                        }
                    });
                    if (hasChanges) await batch.commit();
                }
                document.getElementById('manage-rooms-modal')?.classList.add('hidden');
                if (typeof UIService.renderAssistedLists === 'function') UIService.renderAssistedLists(this);
            } catch (error) {
                showNotification("Erro ao atualizar salas.", "error");
            }
        });

        const openCloseModal = (isReopen) => {
            document.getElementById('close-modal-title').textContent = isReopen ? 'Reabrir Pauta' : 'Fechar Pauta';
            document.getElementById('close-pauta-password').value = '';
            document.getElementById('confirm-close-pauta-btn').textContent = isReopen ? 'Reabrir' : 'Confirmar';
            document.getElementById('close-pauta-modal').classList.remove('hidden');
        };
        document.getElementById('close-pauta-btn')?.addEventListener('click', () => openCloseModal(false));
        document.getElementById('reopen-pauta-btn')?.addEventListener('click', () => openCloseModal(true));
        
        document.getElementById('confirm-close-pauta-btn')?.addEventListener('click', async () => {
            const password = document.getElementById('close-pauta-password')?.value;
            const isReopen = document.getElementById('confirm-close-pauta-btn')?.textContent.includes('Reabrir');
            const user = this.auth.currentUser;
            
            if (!user || user.uid !== this.currentPautaOwnerId) return showNotification("Sem permissão.", "error");

            try {
                await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
                await updateDoc(doc(this.db, "pautas", this.currentPauta.id), { isClosed: !isReopen });
                this.isPautaClosed = !isReopen;
                UIService.togglePautaLock(this);
                document.getElementById('close-pauta-modal')?.classList.add('hidden');
                showNotification(`Pauta ${isReopen ? 'reaberta' : 'fechada'}.`, 'success');
            } catch (error) {
                showNotification("Senha incorreta.", "error");
            }
        });
        
        document.getElementById('reset-all-btn')?.addEventListener('click', () => document.getElementById('reset-confirm-modal').classList.remove('hidden'));
        document.getElementById('confirm-reset-btn')?.addEventListener('click', async () => {
            const snapshot = await getDocs(collection(this.db, "pautas", this.currentPauta.id, "attendances"));
            const batch = writeBatch(this.db);
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            document.getElementById('reset-confirm-modal')?.classList.add('hidden');
            showNotification("Pauta zerada com sucesso.", "success");
        });
    }

    setupAttendanceEvents() {
        document.getElementById('call-next-assisted-btn')?.addEventListener('click', () => PautaService.callNextAssisted(this));
        
        document.getElementById('add-assisted-btn')?.addEventListener('click', () => {
            if (typeof PautaService.addAssisted === 'function') PautaService.addAssisted(this);
            else document.getElementById('add-assisted-modal')?.classList.remove('hidden');
        });

        document.body.addEventListener('click', (e) => {
            PautaService.handleCardActions(e, this);
            
            const removeBtn = e.target.closest('.remove-member-btn');
            if (removeBtn) {
                const email = removeBtn.dataset.email;
                if (this.currentPautaData && email === this.currentPautaData.ownerEmail) {
                    return showNotification("O dono da pauta não pode ser removido!", "error");
                }
                if (confirm(`Remover ${email} da pauta?`)) {
                    getDocs(query(collection(this.db, "users"), where("email", "==", email))).then(async snapshot => {
                        if (!snapshot.empty) {
                            await updateDoc(doc(this.db, "pautas", this.currentPauta.id), { 
                                members: arrayRemove(snapshot.docs[0].id), memberEmails: arrayRemove(email) 
                            });
                            if (typeof ModalService?.openMembersModal === 'function') await ModalService.openMembersModal(this);
                        }
                    });
                }
            }
        });

        this._bindModalConfirmation('confirm-edit-assisted-btn', async () => {
            const name = document.getElementById('edit-assisted-name')?.value.trim();
            if (!name) return showNotification("O nome não pode ficar em branco.", "error");
            
            const updatedData = {
                name: name,
                cpf: document.getElementById('edit-assisted-cpf')?.value.trim() || '',
                numAgendamento: document.getElementById('edit-assisted-num-agendamento')?.value.trim() || '',
                subject: document.getElementById('edit-assisted-subject')?.value.trim() || '',
                scheduledTime: document.getElementById('edit-scheduled-time')?.value || null,
            };
            const roomSelect = document.getElementById('edit-room-select');
            if (roomSelect && !roomSelect.parentElement.classList.contains('hidden')) updatedData.room = roomSelect.value || null;
            
            await PautaService.updateStatus(this.db, this.currentPauta.id, window.assistedIdToHandle, updatedData, this.currentUserName);
            document.getElementById('edit-assisted-modal')?.classList.add('hidden');
        });

        this._bindModalConfirmation('confirm-priority-reason-btn', async () => {
            const selectedChips = Array.from(document.querySelectorAll('.p-chip.selected')).map(chip => chip.dataset.value);
            const customReason = document.getElementById('priority-reason-input')?.value.trim() || '';
            let finalReason = selectedChips.join(', ');
            if (customReason) finalReason = finalReason ? `${finalReason} | Obs: ${customReason}` : customReason;

            if (!finalReason) return showNotification("Selecione um motivo.", "error");
            await PautaService.updateStatus(this.db, this.currentPauta.id, window.assistedIdToHandle, { priority: 'URGENTE', priorityReason: finalReason }, this.currentUserName);
            document.getElementById('priority-reason-modal')?.classList.add('hidden');
        });

        this._bindModalConfirmation('save-demands-btn', async () => {
            const items = document.getElementById('demands-modal-list-container')?.querySelectorAll('li') || [];
            const descricoes = Array.from(items).map(li => li.querySelector('span')?.textContent || '');
            await PautaService.updateStatus(this.db, this.currentPauta.id, window.assistedIdToHandle, { demandas: { quantidade: descricoes.length, descricoes: descricoes } }, this.currentUserName);
            document.getElementById('demands-modal')?.classList.add('hidden');
        });

        this._bindModalConfirmation('confirm-arrival-btn', async () => {
            const time = document.getElementById('arrival-time-input')?.value;
            if (!time) return showNotification("Informe o horário", "error");
            const arrivalDate = new Date();
            arrivalDate.setHours(...time.split(':'), 0, 0);
            
            const roomSelect = document.getElementById('arrival-room-select');
            const room = roomSelect && !roomSelect.classList.contains('hidden') ? roomSelect.value : null;

            await PautaService.updateStatus(this.db, this.currentPauta.id, window.assistedIdToHandle, { status: 'aguardando', arrivalTime: arrivalDate.toISOString(), checkInOrder: Date.now(), room: room }, this.currentUserName);
            document.getElementById('arrival-modal')?.classList.add('hidden');
        });
        
        document.getElementById('confirm-attendant-btn')?.addEventListener('click', async () => {
            const nomeFinal = document.getElementById('attendant-select')?.value || null;
            const useDist = this.currentPautaData?.useDistributionFlow === true;
            const novoStatus = useDist ? 'aguardandoDistribuicao' : 'atendido';

            let attendantData = nomeFinal;
            const selectedCollab = this.colaboradores?.find(c => c.nome === nomeFinal);
            if (selectedCollab) attendantData = { nome: selectedCollab.nome, cargo: selectedCollab.cargo, equipe: selectedCollab.equipe };

            const mapaProdutividadeBI = {};
            if (novoStatus === 'atendido') {
                mapaProdutividadeBI[this.currentUserName || "Servidor"] = 1; 
                if (nomeFinal) mapaProdutividadeBI[nomeFinal] = 1;
            }

            await PautaService.updateStatus(this.db, this.currentPauta.id, window.assistedIdToHandle, { 
                status: novoStatus, attendant: attendantData, enviadoPor: this.currentUserName || "Servidor",
                attendedBy: nomeFinal, trabalhosPorUsuario: novoStatus === 'atendido' ? mapaProdutividadeBI : null, attendedTime: new Date().toISOString() 
            }, this.currentUserName);
            
            document.getElementById('attendant-modal')?.classList.add('hidden');
        });
        
        document.getElementById('confirm-select-collaborator-btn')?.addEventListener('click', async () => {
            const isAcaoRapida = ['reagendar', 'agendar', 'consulta', 'outros'].includes(window.assistedTipoAcao);
            if (!isAcaoRapida && window.selectedCollaboratorId === null) return showNotification("Selecione um colaborador.", "warning");
            
            const isSilentMode = localStorage.getItem('sigep_silent_mode') === 'true' || document.getElementById('toggle-silent-mode')?.checked;
            
            if (isAcaoRapida) {
                await PautaService.updateStatus(this.db, this.currentPauta.id, window.assistedIdToHandle, {
                    status: 'atendido', attendedBy: window.selectedCollaboratorName || this.currentUserName,
                    enviadoPor: this.currentUserName || 'Sistema', inAttendanceTime: new Date().toISOString(),
                    tipoAcaoRapida: window.assistedTipoDescricao, finalizadoPeloColaborador: true
                }, this.currentUserName);
            } else if (window.assistedTipoAcao === 'atender_direto') {
                await PautaService.finishAttendance(this, window.assistedIdToHandle, window.selectedCollaboratorName || this.currentUserName, []);
            } else {
                let colabData = null, emailDestino = null;
                const novoToken = Math.random().toString(36).substring(2, 10) + Date.now().toString(36).substring(4);
                
                if (window.selectedCollaboratorName) {
                    const collab = this.colaboradores?.find(c => c.nome === window.selectedCollaboratorName);
                    emailDestino = collab?.email || null;
                    colabData = { id: window.selectedCollaboratorId, name: window.selectedCollaboratorName, email: emailDestino };
                }

                await PautaService.updateStatus(this.db, this.currentPauta.id, window.assistedIdToHandle, {
                    status: 'emAtendimento', assignedCollaborator: colabData, enviadoPor: this.currentUserName || 'Sistema',
                    inAttendanceTime: new Date().toISOString(), ...(window.selectedCollaboratorName && { delegationToken: novoToken })
                }, this.currentUserName);

                if (emailDestino && !isSilentMode) {
                    EmailService.sendDelegationEmail(emailDestino, window.selectedCollaboratorName, window.assistedNameToHandle, this.currentUserName, this.currentPauta.id, window.assistedIdToHandle, novoToken);
                }
            }
            document.getElementById('select-collaborator-modal')?.classList.add('hidden');
        });
    }

    setupChecklistEvents() {
        document.getElementById('save-checklist-btn')?.addEventListener('click', async () => {
            const assistedId = window.assistedIdToHandle || window.currentAssistedId;
            const container = document.getElementById('checklist-container');
            const checkedItems = Array.from(container.querySelectorAll('.doc-checkbox:checked')).map(cb => ({
                id: cb.id, type: document.querySelector(`input[name="type-${cb.id}"]:checked`)?.value || 'Físico'
            }));

            const checklistData = {
                action: window.currentChecklistAction, 
                checkedIds: checkedItems.map(item => item.id),
                docTypes: checkedItems.reduce((acc, item) => { acc[item.id] = item.type; return acc; }, {}),
                reuData: window.getReuDataFromForm ? window.getReuDataFromForm() : {},
                expenseData: window.getExpenseDataFromForm ? window.getExpenseDataFromForm() : {}
            };

            await updateDoc(doc(this.db, "pautas", this.currentPauta.id, "attendances", assistedId), {
                documentChecklist: checklistData, documentState: 'saved'
            });
            showNotification("Checklist salvo com sucesso!", "success");
        });

        document.getElementById('print-checklist-btn')?.addEventListener('click', async () => {
            const { handlePdf } = await import('./detalhes.js');
            if (typeof handlePdf === 'function') await handlePdf();
        });
        
        document.getElementById('reset-checklist-btn')?.addEventListener('click', () => {
            if (confirm("Deseja mudar de assunto? Isso apagará o checklist atual.") && typeof window.switchToActionSelectionView === 'function') {
                window.switchToActionSelectionView();
            }
        });
        document.getElementById('back-to-action-selection-btn')?.addEventListener('click', () => {
            if (typeof window.switchToActionSelectionView === 'function') window.switchToActionSelectionView();
        });
    }

    setupMiscEvents() {
        document.getElementById('file-upload')?.addEventListener('change', (e) => PautaService.handleCSVUpload(e, this));
        document.getElementById('toggle-faltosos-btn')?.addEventListener('click', UIService.toggleFaltosos);
        
        ['pauta-search', 'aguardando-search', 'em-atendimento-search', 'atendidos-search', 'faltosos-search'].forEach(id => {
            document.getElementById(id)?.addEventListener('input', () => UIService.renderAssistedLists(this));
        });

        const handlePDF = (type) => {
            const nomePauta = this.currentPauta?.name || 'Pauta';
            if (type === 'atendidos') PDFService.generateAtendidosPDF((this.allAssisted || []).filter(a => a.status === 'atendido'), nomePauta);
            if (type === 'faltosos') {
                const f = (this.allAssisted || []).filter(a => a.status === 'faltoso');
                if (f.length === 0) return showNotification("Nenhum assistido faltoso.", "info");
                PDFService.generateFaltososPDF(f, nomePauta);
            }
            if (type === 'colaboradores') PDFService.generateCollaboratorsPDF(this.colaboradores, this.allAssisted || [], nomePauta);
        };
        document.getElementById('download-pdf-btn')?.addEventListener('click', () => handlePDF('atendidos'));
        document.getElementById('btn-metrica-atendidos')?.addEventListener('click', () => handlePDF('atendidos'));
        document.getElementById('download-faltosos-pdf-btn')?.addEventListener('click', () => handlePDF('faltosos'));
        document.getElementById('download-collaborators-pdf-modal')?.addEventListener('click', () => handlePDF('colaboradores'));

        document.getElementById('btn-gerar-ata-social')?.addEventListener('click', () => {
            document.getElementById('ata-acao-nome').value = this.currentPauta?.name || '';
            document.getElementById('ata-data').value = new Date().toISOString().split('T')[0];
            document.getElementById('ata-total').value = this.allAssisted.filter(a => a.status === 'atendido').length;
            document.getElementById('ata-social-modal').classList.remove('hidden');
        });
        document.getElementById('confirm-ata-modal-btn')?.addEventListener('click', () => {
            const data = { 
                acao: document.getElementById('ata-acao-nome')?.value, 
                endereco: document.getElementById('ata-endereco')?.value, 
                data: document.getElementById('ata-data')?.value, 
                orgao: document.getElementById('ata-orgao')?.value, 
                totalAtendimentos: document.getElementById('ata-total')?.value 
            };
            if (!data.acao || !data.endereco || !data.data || !data.orgao) return showNotification("Preencha os campos obrigatórios.", "error");
            document.getElementById('ata-social-modal').classList.add('hidden');
            const handler = confirm("Deseja VISUALIZAR a Ata antes de baixar?") ? PDFService.previewAtaAcaoSocial : PDFService.generateAtaAcaoSocial;
            handler(this.currentPauta?.name, this.colaboradores, this.allAssisted.filter(a => a.status === 'atendido'), data);
        });

        document.getElementById('collaborator-form-modal')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nome = document.getElementById('collaborator-name-modal')?.value.trim();
            if (!nome) return showNotification("Nome obrigatório", "error");
            await CollaboratorService.saveCollaborator(this, {
                nome: nome, cargo: document.getElementById('collaborator-role-modal')?.value,
                equipe: document.getElementById('collaborator-team-modal')?.value, email: document.getElementById('collaborator-email-modal')?.value || '',
                telefone: document.getElementById('collaborator-phone-modal')?.value || '', transporte: document.querySelector('input[name="transporte-colaborador"]:checked')?.value || 'Meios Próprios'
            });
        });
    }

    setupGlobalModalsAndFooterEvents() {
        document.querySelectorAll('[id^="cancel-"], [id^="close"]').forEach(btn => {
            if (btn) btn.addEventListener('click', (e) => e.target.closest('.fixed')?.classList.add('hidden'));
        });

        document.getElementById('format-help-link')?.addEventListener('click', (e) => { e.preventDefault(); document.getElementById('format-help-modal').classList.remove('hidden'); });
        document.getElementById('privacy-policy-link')?.addEventListener('click', (e) => { e.preventDefault(); document.getElementById('privacy-policy-modal').classList.remove('hidden'); });

        document.querySelectorAll('.p-chip').forEach(chip => {
            chip.addEventListener('click', function(e) {
                e.preventDefault();
                this.classList.toggle('selected');
            });
        });
    }

    _bindModalConfirmation(btnId, callback) {
        document.getElementById(btnId)?.addEventListener('click', callback);
    }

    async loadPautasWithFilter(filterOptions = null) {
        const user = this.auth.currentUser;
        if (!user) return;
        
        const pautasList = document.getElementById('pautas-list');
        if (!pautasList) return;
        pautasList.innerHTML = '<p class="col-span-full text-center py-8">Carregando pautas SIGEP...</p>';
        
        try {
            const userDoc = await getDoc(doc(this.db, "users", user.uid));
            if (userDoc.exists()) {
                const userData = userDoc.data();
                this.currentUser = { ...this.currentUser, ...userData };
            }
        } catch (err) {
            console.warn("Aviso: erro ao buscar dados adicional do usuário.", err);
        }
    
        try {
            let pautasMap = new Map();
            const isAdmin = this.currentUser?.role === 'admin' || this.currentUser?.role === 'superadmin';
            const modoAtual = this.currentMode;
            const tiposEvento = ['mutirao', 'plantao', 'acao_social', 'mutirão', 'evento'];

            let baseConstraints = [];

            // 🛠️ CORREÇÃO: Só aplica o filtro restrito de tipo se realmente estivermos no modo evento 
            // E o usuário não estiver limpando os filtros globais
            if (modoAtual === 'evento' && !filterOptions) {
                baseConstraints.push(where("type", "in", tiposEvento));
            }

            if (modoAtual === 'normal' && this.currentUnidadeExibicao && this.currentUnidadeExibicao !== 'todas' && !filterOptions) {
                baseConstraints.push(where("unidadeNome", "==", this.currentUnidadeExibicao));
            }

            if (isAdmin) {
                const qAdmin = query(collection(this.db, "pautas"), ...baseConstraints);
                const snapAll = await getDocs(qAdmin);
                snapAll.docs.forEach(doc => pautasMap.set(doc.id, { id: doc.id, ...doc.data() }));
            } else {
                const qUser = query(
                    collection(this.db, "pautas"),
                    or(
                        where("owner", "==", user.uid),
                        where("members", "array-contains", user.uid)
                    ),
                    ...baseConstraints
                );
                
                try {
                    const snapUser = await getDocs(qUser);
                    snapUser.docs.forEach(doc => pautasMap.set(doc.id, { id: doc.id, ...doc.data() }));
                } catch (queryError) {
                    console.error("Erro na Query! Crie o índice sugerido pelo console (F12).", queryError);
                    pautasList.innerHTML = `<p class="col-span-full text-center text-red-500 font-bold mt-4">Abra o console (F12) e clique no link gerado pelo Firebase para criar o Índice Composto necessário.</p>`;
                    return;
                }
            }
            
            let pautas = Array.from(pautasMap.values());
            
            if (modoAtual === 'normal') {
                pautas = pautas.filter(p => {
                    let tipoPauta = p.tipo || p.type || 'normal';
                    tipoPauta = String(tipoPauta).toLowerCase();
                    return !tiposEvento.includes(tipoPauta);
                });
            }

            const btnTrocarUnidade = document.getElementById('btn-trocar-unidade');
            if (btnTrocarUnidade) {
                if (modoAtual === 'normal') {
                    btnTrocarUnidade.classList.remove('hidden');
                    btnTrocarUnidade.classList.add('flex');
                } else {
                    btnTrocarUnidade.classList.add('hidden');
                    btnTrocarUnidade.classList.remove('flex');
                }
            }
            
            this.mostrarIndicadorModo();
            let filteredPautas = [...pautas];
            
            if (filterOptions) {
                switch (filterOptions.tipo) {
                    case 'periodo':
                        if (filterOptions.dataInicial && filterOptions.dataFinal) {
                            const dataInicial = new Date(filterOptions.dataInicial);
                            const dataFinal = new Date(filterOptions.dataFinal);
                            dataFinal.setHours(23, 59, 59);
                            filteredPautas = filteredPautas.filter(pauta => {
                                if (!pauta.createdAt) return false;
                                const dataCriacao = new Date(pauta.createdAt);
                                return dataCriacao >= dataInicial && dataCriacao <= dataFinal;
                            });
                        }
                        if (filterOptions.tipoPauta && filterOptions.tipoPauta !== 'todos') {
                            filteredPautas = filteredPautas.filter(pauta => pauta.type === filterOptions.tipoPauta);
                        }
                        break;
                        
                    case 'unidades':
                        const userUnidades = this.currentUser?.unidades || [];
                        const isAdminFiltro = this.currentUser?.role === 'admin' || this.currentUser?.role === 'superadmin';
                        if (!isAdminFiltro && userUnidades.length > 0) {
                            const userUnidadesNomes = userUnidades.map(u => u.unidadeNome);
                            filteredPautas = filteredPautas.filter(pauta => userUnidadesNomes.includes(pauta.unidadeNome));
                        }
                        if (filterOptions.unidade && filterOptions.unidade !== 'todas') {
                            filteredPautas = filteredPautas.filter(pauta => pauta.unidadeNome === filterOptions.unidade);
                        }
                        if (filterOptions.status && filterOptions.status !== 'todas') {
                            filteredPautas = filteredPautas.filter(pauta => {
                                if (!pauta.createdAt) return false;
                                const dataCriacao = new Date(pauta.createdAt);
                                const dataExpiracao = new Date(dataCriacao);
                                dataExpiracao.setDate(dataCriacao.getDate() + 7);
                                const isExpired = new Date() > dataExpiracao;
                                if (filterOptions.status === 'ativas') return !isExpired && !pauta.isClosed;
                                else if (filterOptions.status === 'expiradas') return isExpired || pauta.isClosed;
                                return true;
                            });
                        }
                        break;
                }
            }
            
            switch (this.currentPautaFilter) {
                case 'my': filteredPautas = filteredPautas.filter(p => p.owner === user.uid); break;
                case 'shared': filteredPautas = filteredPautas.filter(p => p.members?.includes(user.email) && p.owner !== user.uid); break;
                case 'active':
                    filteredPautas = filteredPautas.filter(p => {
                        if (!p.createdAt) return false;
                        const dExp = new Date(p.createdAt); dExp.setDate(dExp.getDate() + 7);
                        return new Date() <= dExp && !p.isClosed;
                    }); break;
                case 'expired':
                    filteredPautas = filteredPautas.filter(p => {
                        if (!p.createdAt) return false;
                        const dExp = new Date(p.createdAt); dExp.setDate(dExp.getDate() + 7);
                        return new Date() > dExp || p.isClosed;
                    }); break;
            }
            
            if (filteredPautas.length === 0) {
                const modoTexto = this.currentMode === 'normal' ? 'Normal' : 'Evento (Mutirão/Plantão/Ação Social)';
                pautasList.innerHTML = `<p class="col-span-full text-center py-8 text-gray-500">Nenhuma pauta do tipo ${modoTexto} encontrada.</p>`;
                return;
            }
            
            UIService.renderPautaCards(filteredPautas, user.uid, user.email, this);
            
        } catch (error) {
            console.error("Erro fatal ao carregar pautas:", error);
            if (pautasList) pautasList.innerHTML = `<p class="col-span-full text-center text-red-500">Erro: ${error.message}</p>`;
        }
    }

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
        document.getElementById('pauta-title').textContent = pautaName;

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

                setTimeout(() => { UIService.togglePautaLock(this); }, 100);
                this.loadColumnPreferences();
                this.applyRoleBasedUI();
                
                const btnManageRooms = document.getElementById('btn-manage-rooms');
                if (btnManageRooms) {
                    btnManageRooms.classList.toggle('hidden', this.currentPautaData.type !== 'multisala');
                }

                if (typeof PautaService.populateRoomSelects === 'function') {
                    PautaService.populateRoomSelects(this);
                }
            }

            this.setupRealtimeListener(pautaId);
            
            if (typeof CollaboratorService?.setupListener === 'function') {
                CollaboratorService.setupListener(this, pautaId);
            } else if (typeof window.CollaboratorService?.setupListener === 'function') {
                window.CollaboratorService.setupListener(this, pautaId);
            }
            
            const appContainer = document.getElementById('app-container');
            if (appContainer && appContainer.classList.contains('hidden')) {
                document.getElementById('pauta-selection-container')?.classList.add('hidden');
                document.getElementById('dashboard-container')?.classList.add('hidden');
                document.getElementById('admin-container')?.classList.add('hidden');
                document.getElementById('modo-selection-screen')?.classList.add('hidden');
                appContainer.classList.remove('hidden');
            }

        } catch (error) {
            console.error("Erro ao carregar pauta:", error);
            showNotification("Erro ao carregar pauta", "error");
        }
    }

    _teardownPauta() {
        if (this.unsubscribeFromAttendances)  this.unsubscribeFromAttendances();
        if (this.unsubscribeFromCollaborators) this.unsubscribeFromCollaborators();

        document.querySelectorAll('[id^="btn-colabs-disponiveis-"]').forEach(btn => btn.remove());

        this.currentPauta = null;
        this.allAssisted  = [];
        this.colaboradores = [];

        localStorage.removeItem('lastPautaId');
        localStorage.removeItem('lastPautaName');
        localStorage.removeItem('lastPautaType');
    }

    setupRealtimeListener(pautaId) {
        if (this.unsubscribeFromAttendances) this.unsubscribeFromAttendances();
        const attendanceRef = collection(this.db, "pautas", pautaId, "attendances");
        this.unsubscribeFromAttendances = onSnapshot(attendanceRef, (snapshot) => {
            this.allAssisted = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            UIService.renderAssistedLists(this);
            this.atualizarMonitorEnvelopes();

            setTimeout(() => { 
                if (typeof PautaService.injectRoomSearches === 'function') PautaService.injectRoomSearches(this); 
            }, 150);
        }, (error) => {
            console.error("Erro no snapshot:", error);
            showNotification("Erro ao carregar dados em tempo real", "error");
        });
    }

    async deletePauta(pautaId, pautaName) {
        const pautaRef = doc(this.db, "pautas", pautaId);
        const pautaSnap = await getDoc(pautaRef);
        
        if (!pautaSnap.exists()) return showNotification("Pauta não encontrada!", "error");
        
        const pautaData = pautaSnap.data();
        const currentUserId = this.auth.currentUser?.uid;
        
        if (pautaData.owner !== currentUserId && this.currentUser?.role !== 'admin' && this.currentUser?.role !== 'superadmin') {
            return showNotification("Você não tem permissão para excluir esta pauta!", "error");
        }
        
        if (!confirm(`⚠️ ATENÇÃO: Tem certeza que deseja excluir a pauta "${pautaName}"?\n\nEsta ação NÃO pode ser desfeita!`)) return;
        
        showNotification(`Excluindo pauta "${pautaName}"...`, "info");
        
        try {
            const attendancesSnap = await getDocs(collection(this.db, "pautas", pautaId, "attendances"));
            const batch = writeBatch(this.db);
            let operationCount = 0;
            
            for (const doc of attendancesSnap.docs) {
                batch.delete(doc.ref);
                operationCount++;
                if (operationCount >= 490) { await batch.commit(); operationCount = 0; }
            }
            if (operationCount > 0) await batch.commit();
            await deleteDoc(pautaRef);
            
            showNotification(`Pauta "${pautaName}" excluída com sucesso!`, "success");
            await this.loadPautasWithFilter();
            
        } catch (error) {
            console.error("Erro ao excluir pauta:", error);
            showNotification("Erro ao excluir pauta. Tente novamente.", "error");
        }
    }
    
    atualizarMonitorEnvelopes() {
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

        const btnId = `btn-colabs-disponiveis-${this.currentPauta.id}`;
        document.querySelectorAll('[id^="btn-colabs-disponiveis-"]').forEach(btn => { if (btn.id !== btnId) btn.remove(); });

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
    }

    setupColetas() {
        document.getElementById('btn-modulo-coletas')?.addEventListener('click', () => {
            this.router.navigate(ROUTES.PAINEL_PUBLICO, {}, false); 
            this.showColetasScreen();
        });

        document.getElementById('coletas-back-btn')?.addEventListener('click', () => {
            this.router.navigate(ROUTES.PAUTA_SELECTION, {}, false);
        });

        document.getElementById('btn-nova-coleta')?.addEventListener('click', async () => {
            const nome = prompt("Qual o nome desta Coleta Estatística? (Ex: Produtividade - Varas de Família)");
            if (!nome) return;

            try {
                const novaColeta = {
                    nomeDaColeta: nome, dicionarioDeCampos: [], linksExternos: [],
                    criadoPor: this.currentUserName || this.auth?.currentUser?.email || 'Sistema',
                    criadoEm: new Date().toISOString()
                };
                
                await addDoc(collection(this.db, "formularios_coleta"), novaColeta);
                showNotification("Nova coleta criada com sucesso!", "success");
                this.listarColetas();
            } catch (error) {
                showNotification("Erro ao criar coleta no banco de dados.", "error");
            }
        });
    }

    async listarColetas() {
        const container = document.getElementById('lista-de-coletas');
        if (!container) return;
        
        container.innerHTML = '<p class="text-center text-slate-400 py-4 font-bold animate-pulse">Buscando coletas ativas...</p>';

        try {
            const querySnapshot = await getDocs(collection(this.db, "formularios_coleta"));
            if (querySnapshot.empty) {
                container.innerHTML = '<p class="text-center text-slate-400 py-4">Nenhuma coleta estatística criada ainda.</p>';
                return;
            }

            let html = '';
            querySnapshot.forEach(docSnap => {
                const data = docSnap.data();
                html += `
                    <div class="bg-white border border-slate-200 p-4 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center shadow-sm gap-4 mb-3">
                        <div>
                            <h5 class="font-black text-slate-800 text-sm uppercase">${escapeHTML(data.nomeDaColeta)}</h5>
                            <p class="text-[11px] font-bold text-slate-500 mt-1">📚 ${data.dicionarioDeCampos?.length || 0} campos cadastrados | 🔗 ${data.linksExternos?.length || 0} links gerados</p>
                        </div>
                        <div class="flex gap-2 w-full sm:w-auto">
                            <button onclick="window.abrirConstrutor('${docSnap.id}')" class="flex-1 sm:flex-none bg-indigo-100 hover:bg-indigo-200 text-indigo-800 font-bold px-4 py-2 rounded-lg text-xs transition border border-indigo-200 shadow-sm">⚙️ Configurar</button>
                            <button onclick="window.verResultados('${docSnap.id}')" class="flex-1 sm:flex-none bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold px-4 py-2 rounded-lg text-xs transition border border-emerald-200 shadow-sm">📈 Resultados</button>
                        </div>
                    </div>
                `;
            });
            container.innerHTML = html;
        } catch (error) {
            container.innerHTML = '<p class="text-center text-red-500 py-4 font-bold">Erro ao carregar do servidor.</p>';
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
                const filtered = flatSubjects.filter(item => item.value.toLowerCase().includes(query) || item.description.toLowerCase().includes(query));
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

    async loadUserPreferences() {
        if (!this.auth?.currentUser || !this.db) return;
        try {
            const docSnap = await getDoc(doc(this.db, "users", this.auth.currentUser.uid));
            if (docSnap.exists()) {
                const userData = docSnap.data();
                this.currentUser = { ...this.currentUser, ...userData }; 
                this.userPreferences = userData.preferences || { enableSoundsSuccess: true };
                this.applyRoleBasedUI(); 
            }
        } catch (error) { console.error("Erro ao carregar perfil:", error); }
    }

    applyRoleBasedUI() {
        if (!this.currentUser) return;
        const isAdmin = (this.currentUser?.role === 'admin' || this.currentUser?.role === 'superadmin');
        document.querySelectorAll('#admin-panel-btn, #admin-btn-main').forEach(b => { if (b) b.classList.toggle('hidden', !isAdmin); });
    }

    async openUserPreferencesModal() {
        if (!this.auth?.currentUser) return showNotification("Você precisa estar logado.", "error");

        const nameInput = document.getElementById('pref-user-name');
        if (nameInput) nameInput.value = this.currentUserName || 'Não informado';
        
        const emailInput = document.getElementById('pref-user-email');
        if (emailInput) emailInput.value = this.auth.currentUser.email || 'Não informado';

        await this.loadUserPreferences(); 

        const setChecked = (id, value) => { const el = document.getElementById(id); if (el) el.checked = value; };
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
        console.log("⚙️ Aplicando preferências:", this.userPreferences);
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
        let preferences = savedPreferences ? JSON.parse(savedPreferences) : { showEmAtendimento: true, showDistribuicao: true, showFaltosos: false };

        const chkEmAtendimento = document.getElementById('toggle-em-atendimento');
        const chkDistribuicao = document.getElementById('toggle-distribuicao');
        const chkFaltosos = document.getElementById('toggle-faltosos');
        
        if(chkEmAtendimento) chkEmAtendimento.checked = preferences.showEmAtendimento;
        if(chkDistribuicao) chkDistribuicao.checked = preferences.showDistribuicao;
        if(chkFaltosos) chkFaltosos.checked = preferences.showFaltosos;
        
        this.applyColumnPreferences(preferences);
    }

    applyColumnPreferences(preferences) {
        const useDelegationFlow = this.currentPautaData?.useDelegationFlow;
        const useDistributionFlow = this.currentPautaData?.useDistributionFlow;

        const emAtendimentoColumn = document.getElementById('em-atendimento-column');
        const distribuicaoColumn = document.getElementById('distribuicao-column');
        const faltososColumn = document.getElementById('faltosos-column');

        if (emAtendimentoColumn) emAtendimentoColumn.classList.toggle('hidden', !(useDelegationFlow && preferences.showEmAtendimento));
        if (distribuicaoColumn) distribuicaoColumn.classList.toggle('hidden', !(useDistributionFlow && preferences.showDistribuicao));
        
        if (faltososColumn) {
            const pautaColumn = document.getElementById('pauta-column');
            if (this.currentPautaData?.type === 'agendamento' && preferences.showFaltosos && pautaColumn && !pautaColumn.classList.contains('hidden')) {
                 faltososColumn.classList.remove('hidden');
            }
        }
    }
}

// ============================================================
// INICIALIZAÇÃO GLOBAL E COMPATIBILIDADE LEGADA
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
window.abrirGerenciadorUnidades = abrirGerenciarUnidades;
window.abrirImportadorUnidades = abrirImportadorUnidades;
window.abrirModalUsuariosPorUnidade = abrirModalUsuariosPorUnidade;

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
    const lgpdJaAceito = () => localStorage.getItem('sigep_lgpd_accepted') === 'true';

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
        if (isLoginHidden && !lgpdJaAceito() && lgpdModal) {
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
});

// ============================================================
// EVENTO blur para CEP
// ============================================================
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


// ============================================================
// FUNÇÕES GLOBAIS DO MÓDULO DE COLETAS (BI)
// ============================================================

window.abrirConstrutor = async (coletaId) => {
    if (!window.app || !window.app.db) return;
    
    try {
        const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
        const docRef = doc(window.app.db, "formularios_coleta", coletaId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists() && window.ColetasBuilderService) {
            const container = document.getElementById('container-construtor-coleta');
            
            container.innerHTML = window.ColetasBuilderService.renderConstrutorHTML(docSnap.data(), coletaId);
            container.classList.remove('hidden');
            
            window.ColetasBuilderService.initEventos(window.app.db, coletaId, docSnap.data());
            
            document.getElementById('coletas-container').querySelector('.overflow-y-auto, div.bg-white')?.scrollBy({ top: 300, behavior: 'smooth' });
        } else {
            showNotification("Erro: Serviço construtor não carregado.", "error");
        }
    } catch (e) {
        console.error(e);
        showNotification("Erro ao carregar estrutura da coleta.", "error");
    }
};

window.verResultados = async (coletaId) => {
    if (!window.app || !window.app.db) return;
    ColetasBiService.abrirResultados(window.app.db, coletaId);
};

window.ApiIntegration = {
    simularSincronizacaoVerde: function(pautaId) {
        console.log("Simulando sincronização verde para a pauta:", pautaId);
        showNotification("Sincronização simulada com sucesso!", "success");
    }
};
