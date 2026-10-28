// js/main.js - SIGEP APP PRINCIPAL (COMPLETO COM ROUTER E MÓDULO DE COLETAS E ORDENAÇÃO)

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, query, where, getDoc, getDocs, writeBatch, arrayUnion, arrayRemove, enableMultiTabIndexedDbPersistence, or, and, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { firebaseConfig } from './config.js';
import { AuthService } from './auth.js';
import { PautaService } from './pauta.js';
import { UIService } from './ui.js?v=4';
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
import { MonitoramentoService } from './monitoramento.js';

import { PautaConfigService } from './pautaConfig.js';
import { RecepçãoCentralService } from './recepcaoCentral.js';
import { ImportadorOrgaosService } from './importadorOrgaos.js';
import { renderEstruturaAtual } from './estruturaAtual.js';
import { abrirModalNovaRecepcao } from './novaRecepcao.js';
import { abrirGerenciarUnidades as abrirGerenciarUnidadesUsuario } from './gerenciarUnidadesUsuario.js';
import { SIGEPRouter, ROUTES } from './router.js';
import { PermissoesService } from './permissoes.js';
import { PerfilService } from './perfilService.js';

// Módulos de Coletas & BI
import { ColetasBuilderService } from './coletasBuilderService.js?v=2';
window.ColetasBuilderService = ColetasBuilderService;

import { ColetasBiService } from './coletasBiService.js';
window.ColetasBiService = ColetasBiService;

import { BiEventosService } from './biEventosService.js';
window.BiEventosService = BiEventosService;

import { injetarModais } from './modais.js';
import { ico } from './icons.js';
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
        
        this.currentMode = localStorage.getItem('sigep_current_mode') || 'normal';
        this.currentUnidadeExibicao = localStorage.getItem('sigep_unidade_ativa') || 'todas';
        
        this.init();
    }

    async init() {
        try {
            const app = initializeApp(firebaseConfig);
            this.db   = getFirestore(app);
            this.auth = getAuth(app);

            // PAINEL PÚBLICO: link ?painel=true abre direto, sem login
            if (new URLSearchParams(window.location.search).get('painel') === 'true') {
                window.app = this;
                const { PainelPublicoService } = await import('./painelPublico.js');
                await PainelPublicoService.init(this);
                return; // não cria router nem listener de login
            }
    
            this.router = new SIGEPRouter(this, {
                UIService,
                DashboardService,
                RecepçãoCentralService,
                PerfilService,
                Permissoes: PermissoesService,
                showNotification,
            });
            this.router.init();
    
            DashboardService.init(this);
            await this.setupOfflinePersistence();
            
            this.setupEventListeners();
            this.setupAuthListener();        
    
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
        if (this.router) this.router.navigate(ROUTES.ADMIN, {}, false);
    }

    showColetasScreen() {
        if (this.router) this.router.navigate(ROUTES.COLETAS, {}, false);
    }

    // Chamado pelo router ao sair da tela de Coletas: para o BI e limpa o que ficou aberto
    fecharColetas() {
        try { window.ColetasBiService?.fechar?.(); } catch (e) { console.warn(e); }
        const construtor = document.getElementById('container-construtor-coleta');
        if (construtor) { construtor.classList.add('hidden'); construtor.innerHTML = ''; }
        document.getElementById('coletas-container')?.classList.add('hidden');
    }

    // ----- Modais do menu de Ações (abertos pelas rotas do router) -----
    _modalOpeners() {
        return {
            [ROUTES.MONITOR_EQUIPE]: () => PainelGeralService.abrirPainel(this),
            [ROUTES.COMPARTILHAMENTO]: () => {
                const modal = document.getElementById('share-modal');
                if (!modal || !this.currentPautaData) return;
                document.getElementById('share-toggle').checked = this.currentPautaData.isPublic || false;
                document.getElementById('mask-names-check').checked = this.currentPautaData.maskNames || false;
                const isPublic = this.currentPautaData.isPublic;
                document.getElementById('share-status-text').textContent = isPublic ? 'Público' : 'Privado';
                if (isPublic) {
                    document.getElementById('share-link-container').classList.remove('hidden');
                    const link = `${window.location.origin}${window.location.pathname.replace('index.html', '')}acompanhamento.html?id=${this.currentPauta.id}`;
                    document.getElementById('share-link-input').value = link;
                    document.getElementById('open-external-btn').href = link;
                } else {
                    document.getElementById('share-link-container').classList.add('hidden');
                }
                modal.classList.remove('hidden');
            },
            [ROUTES.TOTEM]: () => {
                const totemUrl = `${window.location.origin}${window.location.pathname.replace('index.html', '')}totem.html?pautaId=${this.currentPauta.id}&r=app`;
                window.open(totemUrl, '_blank');
            },
            [ROUTES.ESTATISTICAS]: () => {
                if (typeof StatisticsService?.showModal === 'function') {
                    StatisticsService.showModal(this.allAssisted || [], this.currentPautaData?.useDelegationFlow, this.currentPauta?.name);
                }
            },
            [ROUTES.EDITAR_NOME_PAUTA]: () => {
                document.getElementById('edit-pauta-name-input').value = this.currentPauta?.name || '';
                document.getElementById('edit-pauta-modal')?.classList.remove('hidden');
            },
            [ROUTES.CONFIGURACAO_PAUTA]: () => PautaConfigService.abrirModalEdicao(this),
            [ROUTES.COMPARTILHAR_PAUTA]: () => ModalService?.openMembersModal?.(this),
            [ROUTES.COLABORADORES_PAUTA]: () => CollaboratorService.openModal(this),
            [ROUTES.ANOTACOES_PAUTA]: () => NotesService.openModal()
        };
    }

    async openPautaModal(route) {
        const abrir = this._modalOpeners()[route];
        if (abrir) await abrir();
    }

    // Fecha os modais do menu de Ações (usado ao sair de uma rota de modal)
    closePautaModals() {
        ['share-modal', 'statistics-modal', 'edit-pauta-modal', 'edit-pauta-config-modal', 'bi-links-modal', 'collaborators-modal', 'members-modal', 'notes-modal']
            .forEach(id => document.getElementById(id)?.classList.add('hidden'));
        document.getElementById('painel-geral-externo-modal')?.remove();
    }

    async renderAdminContent() {
        const container = document.getElementById('admin-content');
        if (!container) return;
        
        container.innerHTML = `
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-2xl font-bold text-gray-800">Painel do Administrador</h2>
            </div>
            
            <div class="mb-6 flex flex-wrap gap-3">
                <button id="btn-unidades-master" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2.5 rounded-xl transition shadow-md flex items-center gap-2 text-sm">
                    <span>${ico('building')}</span> Gerenciar Unidades / Órgãos
                </button>
                <button id="btn-recepcoes-master" class="bg-purple-600 hover:bg-purple-700 text-white font-bold px-5 py-2.5 rounded-xl transition shadow-md flex items-center gap-2 text-sm">
                    <span>${ico('landmark')}</span> Gerenciar Recepções (Unidades de Apoio)
                </button>
            </div>
            
            <div class="mb-8">
                <div class="mb-4">
                    <input type="text" id="search-pendentes" placeholder="Buscar usuário pendente..." class="w-full sm:w-80 px-4 py-2 border rounded-lg">
                </div>
                <h3 class="text-lg font-bold text-amber-700 mb-3 border-b pb-2">${ico('clock', 'w-5 h-5')} Usuários Pendentes</h3>
                <div id="pending-users-list" class="space-y-2"></div>
                <div id="pagination-pendentes" class="mt-4"></div>
            </div>
            
            <div class="mt-8">
                <div class="mb-4">
                    <input type="text" id="search-usuarios" placeholder="Buscar usuário..." class="w-full sm:w-80 px-4 py-2 border rounded-lg">
                </div>
                <h3 class="text-lg font-bold text-slate-800 mb-3 border-b pb-2">${ico('users', 'w-5 h-5')} Usuários do Sistema</h3>
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
                    <button id="view-audit-logs-btn" class="bg-blue-600 text-white px-4 py-2 rounded-lg">${ico('search')} Carregar Logs</button>
                    <button id="export-audit-pdf-btn" class="hidden bg-red-600 text-white px-4 py-2 rounded-lg">${ico('fileText')} Exportar PDF</button>
                    <button id="cleanup-old-data-btn" class="bg-amber-600 text-white px-4 py-2 rounded-lg">${ico('trash')} Limpar Dados</button>
                    <button id="btn-load-dashboard" class="bg-emerald-600 text-white px-4 py-2 rounded-lg">${ico('chart')} BI Dashboard</button>
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
                                    <th class="p-3">Usuário</th>
                                    <th class="p-3">Ação</th>
                                    <th class="p-3">Detalhes</th>
                                </tr>
                            </thead>
                            <tbody id="audit-logs-table-body"></tbody>
                        </table>
                    </div>
                </div>
                <div id="pagination-logs" class="mt-4"></div>
                <div id="dashboard-results" class="hidden mt-6"></div>
            </div>

            <div id="permissoes-container" class="mt-10 pt-6 border-t"></div>
        `;
        
        if (AdminService?.setupAdminEvents) {
            AdminService.setupAdminEvents(this);
        }
        PermissoesService.renderAdmin(document.getElementById('permissoes-container'), this);
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
        const isAdmin = this.currentUser?.role === 'admin' || this.currentUser?.role === 'superadmin' || this.currentUser?.role === 'superadmin_global';

        if (isAdmin) {
            try {
                const snap = await getDocs(collection(this.db, "unidades"));
                const allUnidades = snap.docs.map(d => d.data().nome).filter(Boolean).sort();
                
                let html = `<option value="todas">Todas as Unidades (Visão Admin)</option>`;
                if (userUnidades.length > 0) {
                    html += `<optgroup label="Minhas Unidades Vinculadas">`;
                    userUnidades.forEach(u => {
                        const nome = typeof u === 'string' ? u : (u.unidadeNome || u.nome || u.name);
                        if (nome) html += `<option value="${escapeHTML(nome)}">${escapeHTML(nome)}</option>`;
                    });
                    html += `</optgroup><optgroup label="Todas as Unidades do Sistema">`;
                }
                allUnidades.forEach(nome => {
                    html += `<option value="${escapeHTML(nome)}">${escapeHTML(nome)}</option>`;
                });
                if (userUnidades.length > 0) html += `</optgroup>`;
                select.innerHTML = html;
            } catch (err) {
                select.innerHTML = `<option value="todas">Erro ao carregar unidades</option>`;
            }
        } else {
            let html = `<option value="todas">Todas as minhas unidades</option>`;
            userUnidades.forEach(u => {
                const nome = typeof u === 'string' ? u : (u.unidadeNome || u.nome || u.name);
                if (nome) html += `<option value="${escapeHTML(nome)}">${escapeHTML(nome)}</option>`;
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
                    await PermissoesService.carregar(this);
                    this.applyRoleBasedUI();
                    await this.router.resolveInitialRoute();
                } else {
                    this.currentUser = null;
                    PermissoesService.limpar();
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
            console.warn('Cache/Offline warning:', err.code);
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
            const actionsToggle = document.getElementById('actions-toggle');
            const actionsPanel = document.getElementById('actions-panel');
            
            if (actionsPanel && actionsPanel.contains(e.target)) {
                return;
            }

            if (actionsPanel && !actionsPanel.classList.contains('hidden') && !actionsPanel.contains(e.target) && !actionsToggle?.contains(e.target)) {
                actionsPanel.classList.add('opacity-0', 'scale-95', 'pointer-events-none');
                document.getElementById('actions-arrow')?.classList.remove('rotate-180');
            }
            
            const pautaSettingsToggle = document.getElementById('pauta-settings-toggle');
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
            AuthService.logout(this.auth);
            const cleanUrl = window.location.origin + window.location.pathname;
            window.history.pushState({}, '', cleanUrl);
        });
    }

    setupPautaMenuEvents() {
        document.getElementById('actions-toggle')?.addEventListener('click', UIService.toggleActionsPanel);

        // Botões do menu de Ações: cada um navega para a sua rota e o router abre o modal.
        const irParaRota = (btnId, rota) => {
            document.getElementById(btnId)?.addEventListener('click', (e) => {
                e.preventDefault(); // <--- ESTA É A MÁGICA: Impede o redirecionamento/reload da página!
                if (!this.currentPauta) return;
                e.stopImmediatePropagation();
                document.getElementById('actions-panel')?.classList.add('opacity-0', 'scale-95', 'pointer-events-none');
                document.getElementById('actions-arrow')?.classList.remove('rotate-180');
                this.router.navigate(rota, { pautaId: this.currentPauta.id }, false);
            });
        };
        
        irParaRota('btn-painel-geral-externo', ROUTES.MONITOR_EQUIPE);
        irParaRota('share-pauta-btn', ROUTES.COMPARTILHAMENTO);
        irParaRota('open-totem-btn', ROUTES.TOTEM);
        irParaRota('view-stats-btn', ROUTES.ESTATISTICAS);
        irParaRota('edit-pauta-name-btn', ROUTES.EDITAR_NOME_PAUTA);
        irParaRota('edit-pauta-config-btn', ROUTES.CONFIGURACAO_PAUTA);
        irParaRota('manage-members-btn', ROUTES.COMPARTILHAR_PAUTA);
        irParaRota('manage-collaborators-btn', ROUTES.COLABORADORES_PAUTA);
        irParaRota('notes-btn', ROUTES.ANOTACOES_PAUTA);

        document.getElementById('btn-monitor-pauta-global')?.addEventListener('click', (e) => {
            e.preventDefault(); // <--- Coloque aqui também por segurança
            if (!this.currentPauta) return;
            document.getElementById('actions-panel')?.classList.add('opacity-0', 'scale-95', 'pointer-events-none');
            document.getElementById('actions-arrow')?.classList.remove('rotate-180');
            if (window.abrirMonitoramentoGlobal) window.abrirMonitoramentoGlobal();
        });

        // ... O resto do código (share-toggle, mask-names-check, etc) continua igual
        document.getElementById('share-toggle')?.addEventListener('change', async (e) => {
            const isPublic = e.target.checked;
            const statusText = document.getElementById('share-status-text');
            const linkContainer = document.getElementById('share-link-container');
            const linkInput = document.getElementById('share-link-input');
            const openBtn = document.getElementById('open-external-btn');

            if (this.currentPauta && this.currentPauta.id) {
                try {
                    await updateDoc(doc(this.db, "pautas", this.currentPauta.id), { isPublic: isPublic });
                    if(this.currentPautaData) this.currentPautaData.isPublic = isPublic;
                } catch (err) {
                    showNotification("Erro ao publicar a pauta.", "error");
                    e.target.checked = !isPublic;
                    return;
                }
            }

            if (isPublic) {
                statusText.textContent = 'Público';
                statusText.classList.remove('text-gray-900');
                statusText.classList.add('text-pink-600');
                linkContainer.classList.remove('hidden');
                
                const pautaId = this.currentPauta?.id || 'ID_DA_PAUTA';
                const baseUrl = window.location.origin + window.location.pathname.replace('index.html', '');
                const shareUrl = `${baseUrl}acompanhamento.html?id=${pautaId}`;
                
                if (linkInput) linkInput.value = shareUrl;
                if (openBtn) openBtn.href = shareUrl;
            } else {
                statusText.textContent = 'Privado';
                statusText.classList.remove('text-pink-600');
                statusText.classList.add('text-gray-900');
                linkContainer.classList.add('hidden');
            }
        });

        document.getElementById('mask-names-check')?.addEventListener('change', async (e) => {
            const maskNames = e.target.checked;
            if (this.currentPauta && this.currentPauta.id) {
                try {
                    await updateDoc(doc(this.db, "pautas", this.currentPauta.id), { maskNames: maskNames });
                    if(this.currentPautaData) this.currentPautaData.maskNames = maskNames;
                } catch (err) {}
            }
        });

        document.getElementById('copy-share-link-btn')?.addEventListener('click', () => {
            const linkInput = document.getElementById('share-link-input');
            if (linkInput && linkInput.value) {
                navigator.clipboard.writeText(linkInput.value);
                if (window.showNotification) {
                    window.showNotification("Link público copiado com sucesso!", "success");
                } else {
                    alert("Link copiado!");
                }
            }
        });

        // BOTÃO EXCLUSIVO DO TOTEM (AUTOATENDIMENTO DE CHEGADA - INTACTO)
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

        // ------------------------------------------------------------------------------------------
        // 1. INJEÇÃO DO GRUPO "PAINEL DA TV" NO MENU AÇÕES (SEPARADO DO TOTEM!)
        // ------------------------------------------------------------------------------------------
        const observerMenuAcoes = new MutationObserver(() => {
            const actionsPanel = document.getElementById('actions-panel');
            if (actionsPanel && !actionsPanel.classList.contains('hidden') && !actionsPanel.classList.contains('opacity-0')) {
                const tvAtivada = this.currentPautaData?.useTvPanel !== false;
                let tvGroup = document.getElementById('tv-panel-actions-group');
                
                if (!tvGroup) {
                    tvGroup = document.createElement('div');
                    tvGroup.id = 'tv-panel-actions-group';
                    tvGroup.innerHTML = `
                        <div class="h-px bg-slate-100 my-2 mx-3"></div>
                        <p class="px-4 pt-1 pb-1.5 text-[11px] text-slate-400 uppercase tracking-wider font-bold">Painel da TV / Fila</p>
                        
                        <button id="config-local-tv-btn" class="w-full text-left px-4 py-2 hover:bg-indigo-50 flex items-center gap-3 transition-colors">
                            <span class="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm shadow-sm shrink-0">${ico('mapPin')}</span>
                            <span>
                                <span class="text-sm font-semibold text-slate-700 block leading-tight">Meu Local (Guichê)</span>
                                <span class="text-[11px] font-normal text-slate-400 block leading-tight mt-0.5">Definir de onde estou chamando</span>
                            </span>
                        </button>

                        <button id="abrir-config-tv-btn" class="w-full text-left px-4 py-2 hover:bg-purple-50 flex items-center gap-3 transition-colors">
                            <span class="w-7 h-7 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center text-sm shadow-sm shrink-0">${ico('tv')}</span>
                            <span>
                                <span class="text-sm font-semibold text-purple-800 block leading-tight">Configurar Painel TV</span>
                                <span class="text-[11px] font-normal text-purple-500 block leading-tight mt-0.5">Logo, Som, Vídeo e Modo Visual</span>
                            </span>
                        </button>
                    `;
                    
                    // Insere abaixo do botão do Totem (sem esconder o Totem!)
                    const totemBtnOriginal = document.getElementById('open-totem-btn');
                    if (totemBtnOriginal && totemBtnOriginal.parentNode) {
                        totemBtnOriginal.parentNode.insertBefore(tvGroup, totemBtnOriginal.nextSibling);
                    } else {
                        actionsPanel.appendChild(tvGroup);
                    }

                    // Ação 1: Definir Local / Guichê padrão na pauta
                    tvGroup.querySelector('#config-local-tv-btn').addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (this.currentPauta) {
                            const localSalvo = localStorage.getItem('sigep_tv_local_' + this.currentPauta.id);
                            const novoLocal = prompt(
                                "Qual o seu Local de Atendimento atual?\n(Ex: Guichê 1, Sala 3, Mesa 5)\n\nIsso será usado para chamar os assistidos na TV de forma automática.",
                                localSalvo || ""
                            );
                            if (novoLocal !== null && novoLocal.trim() !== "") {
                                localStorage.setItem('sigep_tv_local_' + this.currentPauta.id, novoLocal.trim());
                                showNotification(`Local da TV definido como: ${novoLocal.trim()}`, "success");
                            }
                            actionsPanel.classList.add('opacity-0', 'scale-95', 'pointer-events-none');
                            document.getElementById('actions-arrow')?.classList.remove('rotate-180');
                        }
                    });

                    // Ação 2: Abrir Modal Visual Completo do Painel TV (Igual ao da Recepção Central)
                    tvGroup.querySelector('#abrir-config-tv-btn').addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.abrirModalConfigTVPauta();
                        actionsPanel.classList.add('opacity-0', 'scale-95', 'pointer-events-none');
                        document.getElementById('actions-arrow')?.classList.remove('rotate-180');
                    });
                }

                if (tvAtivada) {
                    tvGroup.classList.remove('hidden');
                } else {
                    tvGroup.classList.add('hidden');
                }
                PermissoesService.aplicarUI(this.currentUser);
            }
        });
        
        const actionsPanelEl = document.getElementById('actions-panel');
        if (actionsPanelEl) {
            observerMenuAcoes.observe(actionsPanelEl, { attributes: true, attributeFilter: ['class'] });
        }

        // ------------------------------------------------------------------------------------------
        // 2. INJEÇÃO DO INTERRUPTOR "USAR PAINEL DA TV" DENTRO DO MODAL DE EDIÇÃO DE CONFIGURAÇÕES
        // ------------------------------------------------------------------------------------------
        const observerEdicao = new MutationObserver(() => {
            const modalEdicao = document.getElementById('edit-pauta-config-modal');
            if (modalEdicao && !modalEdicao.classList.contains('hidden')) {
                let divConfigTV = document.getElementById('edit-use-tv-panel-container');
                if (!divConfigTV) {
                    const btnCancelarSalvar = document.getElementById('confirm-edit-pauta-config-btn')?.parentNode;
                    if (btnCancelarSalvar) {
                        divConfigTV = document.createElement('div');
                        divConfigTV.id = 'edit-use-tv-panel-container';
                        divConfigTV.className = 'mb-4 p-3 bg-indigo-50 rounded-lg border border-indigo-100 mx-5';
                        divConfigTV.innerHTML = `
                            <label class="flex items-center cursor-pointer gap-3">
                                <input type="checkbox" id="edit-use-tv-panel" class="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer">
                                <div>
                                    <span class="block text-sm font-bold text-slate-800">${ico('tv')} Utilizar Painel da TV</span>
                                    <span class="block text-[10px] text-slate-500">Se ativado, exibe o configurador do Painel TV no menu Ações e envia chamadas para a TV.</span>
                                </div>
                            </label>
                        `;
                        btnCancelarSalvar.parentNode.insertBefore(divConfigTV, btnCancelarSalvar);

                        // Garante que ao clicar em Salvar Configurações, o valor de useTvPanel seja salvo no Firebase
                        const btnSalvar = document.getElementById('confirm-edit-pauta-config-btn');
                        if (btnSalvar && !btnSalvar.hasAttribute('data-tv-hooked')) {
                            btnSalvar.setAttribute('data-tv-hooked', 'true');
                            btnSalvar.addEventListener('click', async () => {
                                if (!this.currentPauta?.id) return;
                                const tvVal = document.getElementById('edit-use-tv-panel')?.checked ?? true;
                                try {
                                    await updateDoc(doc(this.db, "pautas", this.currentPauta.id), { useTvPanel: tvVal });
                                    if (this.currentPautaData) this.currentPautaData.useTvPanel = tvVal;
                                    const tvGroupMenu = document.getElementById('tv-panel-actions-group');
                                    if (tvGroupMenu) tvGroupMenu.classList.toggle('hidden', !tvVal);
                                } catch (e) {
                                    console.error("Erro ao salvar useTvPanel:", e);
                                }
                            });
                        }
                    }
                }
                const tvCheck = document.getElementById('edit-use-tv-panel');
                if (tvCheck && this.currentPautaData) {
                    tvCheck.checked = this.currentPautaData.useTvPanel !== false;
                }
            }
        });
        
        const modalEdicaoEl = document.getElementById('edit-pauta-config-modal');
        if (modalEdicaoEl) observerEdicao.observe(modalEdicaoEl, { attributes: true, attributeFilter: ['class'] });
        // ------------------------------------------------------------------------------------------
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
            
            // AUDITORIA AUTOMÁTICA DE EDIÇÃO
            if (window.MonitoramentoService) {
                await window.MonitoramentoService.registrarAcaoHistorico(this.currentPauta.id, window.assistedIdToHandle, "Dados do assistido editados manualmente", this);
            }
            
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

        document.getElementById('confirm-edit-attendant-btn')?.addEventListener('click', async () => {
            const nomeFinal = document.getElementById('edit-attendant-select')?.value || null;
            if (!nomeFinal) {
                showNotification("Selecione um novo atendente.", "warning");
                return;
            }

            let attendantData = nomeFinal;
            const selectedCollab = this.colaboradores?.find(c => c.nome === nomeFinal);
            if (selectedCollab) {
                attendantData = { nome: selectedCollab.nome, cargo: selectedCollab.cargo, equipe: selectedCollab.equipe };
            }

            await PautaService.updateStatus(this.db, this.currentPauta.id, window.assistedIdToHandle, { 
                attendant: attendantData, 
                attendedBy: nomeFinal,
                assignedCollaborator: { id: selectedCollab ? selectedCollab.id : 'manual', name: nomeFinal }
            }, this.currentUserName);
            
            document.getElementById('edit-attendant-modal')?.classList.add('hidden');
            showNotification("Atendente atualizado com sucesso!", "success");
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

        const handlePDF = (type, e) => {
            if (e) {
                e.preventDefault();
                e.stopImmediatePropagation();
                document.getElementById('actions-panel')?.classList.add('opacity-0', 'scale-95', 'pointer-events-none');
                document.getElementById('actions-arrow')?.classList.remove('rotate-180');
            }
            
            const nomePauta = this.currentPauta?.name || 'Pauta';
            if (type === 'atendidos') PDFService.generateAtendidosPDF((this.allAssisted || []).filter(a => a.status === 'atendido'), nomePauta);
            if (type === 'faltosos') {
                const f = (this.allAssisted || []).filter(a => a.status === 'faltoso');
                if (f.length === 0) return showNotification("Nenhum assistido faltoso.", "info");
                PDFService.generateFaltososPDF(f, nomePauta);
            }
            if (type === 'colaboradores') PDFService.generateCollaboratorsPDF(this.colaboradores, this.allAssisted || [], nomePauta);
        };
        
        document.getElementById('download-pdf-btn')?.addEventListener('click', (e) => handlePDF('atendidos', e));
        document.getElementById('btn-metrica-atendidos')?.addEventListener('click', (e) => handlePDF('atendidos', e));
        document.getElementById('download-faltosos-pdf-btn')?.addEventListener('click', (e) => handlePDF('faltosos', e));

        document.getElementById('btn-gerar-ata-social')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopImmediatePropagation();
            document.getElementById('actions-panel')?.classList.add('opacity-0', 'scale-95', 'pointer-events-none');
            document.getElementById('actions-arrow')?.classList.remove('rotate-180');
            
            document.getElementById('ata-acao-nome').value = this.currentPauta?.name || '';
            document.getElementById('ata-data').value = new Date().toISOString().split('T')[0];
            document.getElementById('ata-total').value = this.allAssisted.filter(a => a.status === 'atendido').length;
            document.getElementById('ata-social-modal').classList.remove('hidden');
        });
        
        document.getElementById('confirm-ata-modal-btn')?.addEventListener('click', (e) => {
            e.preventDefault();
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

        // CORREÇÃO: Abre e fecha a explicação da ordem de atendimento
        const toggleLogicBtn = document.getElementById('toggle-logic-btn-padrao');
        const logicContent = document.getElementById('logic-explanation-padrao-content');
        if (toggleLogicBtn && logicContent) {
            toggleLogicBtn.addEventListener('click', () => {
                logicContent.classList.toggle('hidden');
            });
        }

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
            const isAdmin = this.currentUser?.role === 'admin' || this.currentUser?.role === 'superadmin' || this.currentUser?.role === 'superadmin_global';
            const modoAtual = this.currentMode;

            let qUser;
            const orgaoDoUsuario = this.currentUser.orgaoId || 'padrao_dprj';

            if (this.currentUser?.role === 'superadmin_global') {
                qUser = query(collection(this.db, "pautas"));
            } else if (isAdmin) {
                qUser = query(collection(this.db, "pautas"), where("orgaoId", "==", orgaoDoUsuario));
            } else {
                qUser = query(
                    collection(this.db, "pautas"),
                    and(
                        where("orgaoId", "==", orgaoDoUsuario),
                        or(
                            where("owner", "==", user.uid),
                            where("members", "array-contains", user.uid)
                        )
                    )
                );
            }
            
            const snapUser = await getDocs(qUser);
            snapUser.docs.forEach(doc => pautasMap.set(doc.id, { id: doc.id, ...doc.data() }));
            
            let pautas = Array.from(pautasMap.values());
            
            const tiposEventoValidos = ['mutirao', 'plantao', 'acao_social', 'mutirão', 'evento', 'mutirao_atendimento'];

            if (modoAtual === 'evento') {
                pautas = pautas.filter(p => {
                    const tipoPauta = String(p.tipo || p.type || 'normal').toLowerCase().trim();
                    return tiposEventoValidos.some(t => tipoPauta.includes(t)) || 
                           String(p.name || '').toLowerCase().includes('mutirão') || 
                           String(p.name || '').toLowerCase().includes('plantão');
                });
            } else {
                pautas = pautas.filter(p => {
                    const tipoPauta = String(p.tipo || p.type || 'normal').toLowerCase().trim();
                    const ehMutiraoNoNome = String(p.name || '').toLowerCase().includes('mutirão') || String(p.name || '').toLowerCase().includes('plantão');
                    return !tiposEventoValidos.some(t => tipoPauta.includes(t)) && !ehMutiraoNoNome;
                });
            }

            if (this.currentUnidadeExibicao && this.currentUnidadeExibicao !== 'todas') {
                pautas = pautas.filter(p => p.unidadeNome === this.currentUnidadeExibicao);
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
                        const isAdminFiltro = this.currentUser?.role === 'admin' || this.currentUser?.role === 'superadmin' || this.currentUser?.role === 'superadmin_global';
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
                        return new Date() <= dExp && !p.isClosed && p.fechada !== true;
                    }); break;
                case 'expired':
                    filteredPautas = filteredPautas.filter(p => {
                        if (!p.createdAt) return false;
                        const dExp = new Date(p.createdAt); dExp.setDate(dExp.getDate() + 7);
                        return new Date() > dExp || p.isClosed || p.fechada === true;
                    }); break;
                default:
                    // REGRA LGPD E ATIVAS: Remove automaticamente pautas fechadas (isClosed ou fechada === true) ou expiradas (7 dias)
                    filteredPautas = filteredPautas.filter(p => {
                        if (p.isClosed === true || p.fechada === true) return false;
                        if (p.createdAt) {
                            const dataCriacao = new Date(p.createdAt);
                            const dataExpiracao = new Date(dataCriacao);
                            dataExpiracao.setDate(dataCriacao.getDate() + 7);
                            if (new Date() > dataExpiracao) return false; // Expirada pelo prazo de 7 dias da LGPD
                        }
                        return true;
                    });
                    break;
            }

            const searchInput = document.getElementById('search-pautas-input');
            if (searchInput && searchInput.value) {
                const termo = searchInput.value.toLowerCase().trim();
                filteredPautas = filteredPautas.filter(p => (p.name || '').toLowerCase().includes(termo));
            }

            filteredPautas.sort((a, b) => {
                const getTempo = (dataStrObj) => {
                    if (!dataStrObj) return 0;
                    if (dataStrObj.seconds) return dataStrObj.seconds * 1000;
                    const parseado = new Date(dataStrObj).getTime();
                    return isNaN(parseado) ? 0 : parseado;
                };
                return getTempo(b.createdAt) - getTempo(a.createdAt);
            });
            
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

    // FUNÇÃO MESTRA PARA O MODAL DE CONFIGURAÇÃO DA TV NA PAUTA INDIVIDUAL (IGUAL À RECEPÇÃO CENTRAL)
    async abrirModalConfigTVPauta() {
        if (!this.currentPauta) return;
        const pautaId = this.currentPauta.id;
        const pautaName = this.currentPauta.name;
        
        let logoAtual = '';
        try {
            const configSnap = await getDoc(doc(this.db, "pautas", pautaId, "painel", "config"));
            if (configSnap.exists()) logoAtual = configSnap.data().logoUrl || '';
        } catch(e) {}

        const cacheConfig = JSON.parse(localStorage.getItem(`sigep_tv_config_${pautaId}`) || '{}');
        const modoAtual = cacheConfig.modo || 'tv';
        const videoAtual = cacheConfig.video || '';
        const somAtual = cacheConfig.som !== undefined ? cacheConfig.som : true;

        const modalId = 'modal-config-tv-individual';
        let modal = document.getElementById(modalId);
        if (modal) modal.remove();

        modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'fixed inset-0 bg-slate-900/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in';
        
        modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]" onclick="event.stopPropagation()">
            <div class="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <div>
                    <h3 class="font-bold text-xl text-slate-800">Configurar Painel da TV</h3>
                    <p class="text-sm font-semibold text-slate-500 mt-0.5">${escapeHTML(pautaName)}</p>
                </div>
                <button class="text-slate-400 hover:text-slate-600 transition-colors fechar-modal-tv bg-white p-2 rounded-full shadow-sm">
                    <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
            </div>
            
            <div class="p-6 overflow-y-auto space-y-7 bg-white flex-1 custom-scrollbar">
                <!-- Modos de Visualização -->
                <div>
                    <span class="block text-sm font-extrabold text-slate-800 mb-3 uppercase tracking-wide">1. Modo de visualização</span>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <label class="tv-modo-card relative border-2 rounded-xl p-5 text-center cursor-pointer transition-all ${modoAtual === 'fila' ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'}">
                            <input type="radio" name="tv_modo" value="fila" class="hidden" ${modoAtual === 'fila' ? 'checked' : ''}>
                            <div class="text-3xl mb-2">${ico('clipboard', 'w-8 h-8')}</div>
                            <div class="font-bold text-slate-800 text-sm">Lista (Fila)</div>
                            <div class="text-[11px] font-medium text-slate-500 mt-1.5 leading-tight">Visão em grade mostrando quem está nas mesas e os próximos da fila.</div>
                        </label>
                        <label class="tv-modo-card relative border-2 rounded-xl p-5 text-center cursor-pointer transition-all ${modoAtual === 'tv' ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'}">
                            <input type="radio" name="tv_modo" value="tv" class="hidden" ${modoAtual === 'tv' ? 'checked' : ''}>
                            <div class="text-3xl mb-2">${ico('tv', 'w-8 h-8')}</div>
                            <div class="font-bold text-slate-800 text-sm">TV Padrão</div>
                            <div class="text-[11px] font-medium text-slate-500 mt-1.5 leading-tight">Painel de chamada limpo (fundo azul) com aviso sonoro e histórico.</div>
                        </label>
                        <label class="tv-modo-card relative border-2 rounded-xl p-5 text-center cursor-pointer transition-all ${modoAtual === 'video' ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'}">
                            <input type="radio" name="tv_modo" value="video" class="hidden" ${modoAtual === 'video' ? 'checked' : ''}>
                            <div class="text-3xl mb-2">▶️</div>
                            <div class="font-bold text-slate-800 text-sm">TV + Vídeo</div>
                            <div class="text-[11px] font-medium text-slate-500 mt-1.5 leading-tight">Exibe vídeos institucionais dividindo a tela com os últimos chamados.</div>
                        </label>
                    </div>
                </div>
                
                <!-- YouTube (Só aparece se Vídeo selecionado) -->
                <div id="tv-video-container" class="transition-opacity duration-300 ${modoAtual === 'video' ? 'opacity-100' : 'opacity-50 pointer-events-none'}">
                    <label class="block text-sm font-extrabold text-slate-800 mb-2 uppercase tracking-wide">2. Link do YouTube (Obrigatório para Modo Vídeo)</label>
                    <input type="text" id="tv_video_url" value="${escapeHTML(videoAtual)}" class="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none font-mono" placeholder="Ex: https://www.youtube.com/watch?v=XyZ123...">
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <!-- Som -->
                    <div>
                        <span class="block text-sm font-extrabold text-slate-800 mb-3 uppercase tracking-wide">Aviso Sonoro</span>
                        <div class="grid grid-cols-2 gap-3">
                            <label class="tv-som-card border-2 rounded-xl p-3.5 text-center cursor-pointer transition-all ${somAtual === true ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'}">
                                <input type="radio" name="tv_som" value="1" class="hidden" ${somAtual === true ? 'checked' : ''}>
                                <span class="font-bold text-slate-700 text-sm flex items-center justify-center gap-2">${ico('bell')} Ativado</span>
                            </label>
                            <label class="tv-som-card border-2 rounded-xl p-3.5 text-center cursor-pointer transition-all ${somAtual === false ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'}">
                                <input type="radio" name="tv_som" value="0" class="hidden" ${somAtual === false ? 'checked' : ''}>
                                <span class="font-bold text-slate-700 text-sm flex items-center justify-center gap-2">${ico('bellOff')} Silencioso</span>
                            </label>
                        </div>
                    </div>

                    <!-- Logo -->
                    <div>
                        <span class="block text-sm font-extrabold text-slate-800 mb-3 uppercase tracking-wide">Logo do Painel Público</span>
                        <div class="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <div id="tv-logo-preview" class="w-24 h-24 bg-white border border-dashed border-slate-300 rounded-lg flex items-center justify-center shrink-0 overflow-hidden relative">
                            </div>
                            <div class="flex-1">
                                <div class="flex flex-col gap-2">
                                    <button type="button" id="tv-logo-enviar" class="px-3 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-colors w-full text-center shadow-sm">Subir Imagem</button>
                                    <button type="button" id="tv-logo-remover" class="px-3 py-2 bg-white border border-slate-300 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-100 transition-colors w-full text-center">Usar Padrão</button>
                                    <input type="file" id="tv-logo-file" accept="image/png,image/jpeg,image/webp,image/svg+xml" class="hidden">
                                </div>
                                <p class="text-[9px] font-semibold text-slate-500 mt-2 leading-tight">Aceito: PNG, JPG, WebP ou SVG (máx. 5MB).</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Link Gerado -->
                 <div>
                    <span class="block text-sm font-extrabold text-slate-800 mb-2 uppercase tracking-wide">PIN de acesso (opcional)</span>
                    <input type="password" id="tv_pin_novo" maxlength="12" autocomplete="new-password" class="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none" placeholder="Digite um PIN para proteger o painel (vazio = manter)">
                    <label class="flex items-center gap-2 mt-2 text-xs font-semibold text-slate-600"><input type="checkbox" id="tv_pin_remover"> Remover PIN (deixar o painel aberto)</label>
                </div>
                
                <div class="bg-blue-50/50 border border-blue-100 p-5 rounded-xl">
                    <div class="flex justify-between items-center mb-2">
                        <span class="block text-xs font-extrabold text-blue-900 uppercase tracking-wider">Link gerado para a Smart TV</span>
                        <span class="bg-blue-200 text-blue-800 text-[9px] font-bold px-2 py-0.5 rounded uppercase">Copia e cola no navegador da TV</span>
                    </div>
                    <textarea id="tv_preview_link" readonly class="w-full bg-white border border-blue-200 rounded-lg p-3 text-xs font-mono text-blue-700 outline-none resize-none h-16 shadow-inner"></textarea>
                </div>
            </div>
            
            <div class="px-6 py-5 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row gap-3 justify-end items-center">
                <button class="w-full sm:w-auto px-5 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors fechar-modal-tv text-sm">Cancelar</button>
                <button id="tv-btn-copiar" class="w-full sm:w-auto px-6 py-3 rounded-xl font-bold bg-slate-800 text-white hover:bg-slate-900 transition-colors text-sm shadow-md flex items-center justify-center gap-2">${ico('clipboard')} Copiar Link</button>
                <button id="tv-btn-salvar-abrir" class="w-full sm:w-auto px-6 py-3 rounded-xl font-black bg-blue-600 text-white hover:bg-blue-700 transition-colors text-sm shadow-lg flex items-center justify-center gap-2">${ico('monitor')} Salvar e Abrir TV</button>
            </div>
        </div>
        `;
        
        modal.addEventListener('click', () => modal.remove());
        document.body.appendChild(modal);

        const desenharPreview = () => {
            const box = document.getElementById('tv-logo-preview');
            box.replaceChildren();
            if (logoAtual) {
                const img = document.createElement('img');
                img.src = logoAtual; img.alt = 'Logo do órgão';
                img.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;padding:4px;';
                box.appendChild(img);
            } else {
                const t = document.createElement('span');
                t.className = 'text-[10px] font-bold text-center leading-tight'; t.style.color = '#94a3b8'; t.innerHTML = 'Logo<br>SIGEP<br>(Padrão)';
                box.appendChild(t);
            }
        };
        desenharPreview();

        const updatePreview = () => {
            const modo  = modal.querySelector('input[name="tv_modo"]:checked').value;
            const video = encodeURIComponent(document.getElementById('tv_video_url').value.trim());
            const som   = modal.querySelector('input[name="tv_som"]:checked').value;
            
            const containerVideo = document.getElementById('tv-video-container');
            if (modo === 'video') {
                containerVideo.classList.remove('opacity-50', 'pointer-events-none');
                containerVideo.classList.add('opacity-100');
            } else {
                containerVideo.classList.add('opacity-50', 'pointer-events-none');
                containerVideo.classList.remove('opacity-100');
            }

            const nome = encodeURIComponent(pautaName);
            const baseUrl = window.location.origin + window.location.pathname;
            const link = `${baseUrl}?painel=true&pautas=${pautaId}&nome=${nome}&modo=${modo}&video=${video}&som=${som}`;

            document.getElementById('tv_preview_link').value = link;
            return { link, modo, video, som };
        };

        const ligarGrupo = (name, cardClass, extraClassesAtivo) => {
            modal.querySelectorAll(`input[name="${name}"]`).forEach(radio => {
                radio.addEventListener('change', () => {
                    modal.querySelectorAll(`.${cardClass}`).forEach(c => {
                        c.classList.remove('border-blue-500', 'bg-blue-50', 'ring-2', 'ring-1', 'ring-blue-200');
                        c.classList.add('border-slate-200', 'hover:border-blue-300', 'hover:bg-slate-50');
                    });
                    const pai = radio.closest(`.${cardClass}`);
                    pai.classList.remove('border-slate-200', 'hover:border-blue-300', 'hover:bg-slate-50');
                    pai.classList.add(...extraClassesAtivo.split(' '));
                    updatePreview();
                });
            });
        };
        ligarGrupo('tv_modo', 'tv-modo-card', 'border-blue-500 bg-blue-50 ring-2 ring-blue-200');
        ligarGrupo('tv_som', 'tv-som-card', 'border-blue-500 bg-blue-50 ring-1 ring-blue-200');

        document.getElementById('tv_video_url').addEventListener('input', updatePreview);
        updatePreview();

        const reduzirImagem = (file) => new Promise((resolve, reject) => {
            if (!/^image\//.test(file.type)) return reject(new Error('Arquivo não é uma imagem.'));
            if (file.size > 5 * 1024 * 1024) return reject(new Error('Imagem maior que 5 MB.'));
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
            reader.onload = () => {
                if (file.type === 'image/svg+xml') {
                    return reader.result.length > 400000 ? reject(new Error('SVG muito grande.')) : resolve(reader.result);
                }
                const img = new Image();
                img.onerror = () => reject(new Error('Imagem inválida.'));
                img.onload = () => {
                    const escala = Math.min(1, 160 / img.height, 480 / img.width);
                    const c = document.createElement('canvas');
                    c.width = Math.max(1, Math.round(img.width * escala));
                    c.height = Math.max(1, Math.round(img.height * escala));
                    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                    const out = c.toDataURL('image/png');
                    out.length > 500000 ? reject(new Error('Imagem complexa demais.')) : resolve(out);
                };
                img.src = reader.result;
            };
            reader.readAsDataURL(file);
        });

        document.getElementById('tv-logo-enviar').addEventListener('click', () => document.getElementById('tv-logo-file').click());
        document.getElementById('tv-logo-file').addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try { logoAtual = await reduzirImagem(file); desenharPreview(); updatePreview(); }
            catch (err) { showNotification(err.message, 'error'); }
            e.target.value = '';
        });
        document.getElementById('tv-logo-remover').addEventListener('click', () => { logoAtual = ''; desenharPreview(); updatePreview(); });

        modal.querySelectorAll('.fechar-modal-tv').forEach(b => b.addEventListener('click', () => modal.remove()));

        const saveConfig = async () => {
            const data = updatePreview();
            const configToSave = { modo: data.modo, video: decodeURIComponent(data.video), som: data.som === '1' };

            localStorage.setItem(`sigep_tv_config_${pautaId}`, JSON.stringify(configToSave));

            const orgaoId = this.currentUser?.orgaoId || null;
            try {
                const payload = { logoUrl: logoAtual || '', orgaoId, atualizadoEm: new Date().toISOString() };
                const pinNovo = document.getElementById('tv_pin_novo')?.value.trim();
                if (document.getElementById('tv_pin_remover')?.checked) {
                    payload.tvPinHash = '';
                } else if (pinNovo) {
                    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('sigep-tv:' + pinNovo));
                    payload.tvPinHash = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
                }
                await setDoc(doc(this.db, "pautas", pautaId, "painel", "config"), payload, { merge: true });
            } catch (err) {
                console.warn('Falha ao salvar logo do painel no banco:', err);
            }

            return data.link;
        };

        document.getElementById('tv-btn-copiar').addEventListener('click', async () => {
            const link = await saveConfig();
            navigator.clipboard.writeText(link).then(() => {
                showNotification("Configuração salva e link copiado!", "success");
                modal.remove();
            }).catch(() => showNotification("Erro ao copiar o link.", "error"));
        });

        document.getElementById('tv-btn-salvar-abrir').addEventListener('click', async () => {
            const link = await saveConfig();
            window.open(link, '_blank');
            modal.remove();
        });
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

                // Garante que o bloco do Painel TV no menu Ações respeite a configuração da pauta carregada
                const tvAtivada = this.currentPautaData.useTvPanel !== false;
                const tvGroupMenu = document.getElementById('tv-panel-actions-group');
                if (tvGroupMenu) {
                    tvGroupMenu.classList.toggle('hidden', !tvAtivada);
                }
                
                const tolerancia = this.currentPautaData.toleranciaAtraso || this.currentPautaData.tolerancia || 15;
                
                const descPontuais = document.getElementById('desc-pontuais');
                if (descPontuais) descPontuais.innerHTML = `Agendados que chegam no horário (ou com até <b>${tolerancia} min</b> de tolerância). O desempate é por quem fez o check-in na recepção primeiro.`;
                
                const descAtrasados = document.getElementById('desc-atrasados');
                if (descAtrasados) descAtrasados.innerHTML = `Atrasos superiores a <b>${tolerancia} min</b>. Perdem o direito ao horário agendado original e passam a valer pelo horário real em que chegaram na unidade.`;
                
                const descExemplo2 = document.getElementById('desc-exemplo2');
                if (descExemplo2) descExemplo2.innerHTML = `* Pedro atrasou mais de <b>${tolerancia} min</b>. O sistema o "pune" e a hora dele passa a ser a hora real (09:20), ficando atrás da Ana (09:10).`;

                if (!this.currentPautaData.modo) this.currentPautaData.modo = 'normal';
                this.currentPautaOwnerId = this.currentPautaData.owner;
                this.isPautaClosed = this.currentPautaData.isClosed || false;

                if (this.currentPautaData.isPublic === undefined) {
                    this.currentPautaData.isPublic = true;
                    updateDoc(doc(this.db, "pautas", pautaId), { isPublic: true }).catch(err => console.error(err));
                }
                
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

                const tipoConfig = String(this.currentPautaData.type || this.currentPautaData.tipo || 'hibrido').toLowerCase();
                const tabAgendamento = document.getElementById('tab-agendamento');
                const tabAvulso = document.getElementById('tab-avulso');
                const navTabs = document.getElementById('nav-tabs-atendimento');

                if (tabAgendamento && tabAvulso) {
                    tabAgendamento.classList.remove('hidden');
                    tabAvulso.classList.remove('hidden');
                    if (navTabs) navTabs.classList.remove('hidden');

                    if (tipoConfig === 'agendamento' && this.currentPautaData.permiteAvulso !== true) {
                        tabAvulso.classList.add('hidden');
                        UIService.switchTab('agendamento', this);
                    } 
                    else if (tipoConfig === 'avulso' && this.currentPautaData.permiteAgendamento !== true) {
                        tabAgendamento.classList.add('hidden');
                        UIService.switchTab('avulso', this);
                    } 
                    else {
                        UIService.switchTab('agendamento', this);
                    }
                }
            }

            this.setupRealtimeListener(pautaId);
            this.setupOuvinteSolicitacoesPuxada(pautaId);
            
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
        if (this.unsubscribePuxadas) this.unsubscribePuxadas();

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
        
        if (!confirm(`ATENÇÃO: Tem certeza que deseja excluir a pauta "${pautaName}"?\n\nEsta ação NÃO pode ser desfeita!`)) return;
        
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
            btnEnvelope.innerHTML = `<span class="text-sm">${ico('mail')}</span> <span class="text-xs tracking-wider">${colabsLivres.length} LIVRE(S)</span>`;
        } else {
            if (btnEnvelope) btnEnvelope.remove();
        }
    }

    setupColetas() {
        document.getElementById('btn-modulo-coletas')?.addEventListener('click', () => {
            this.router.navigate(ROUTES.COLETAS, {}, false);
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
                
                const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
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
            const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
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
                            <p class="text-[11px] font-bold text-slate-500 mt-1">${ico('bookOpen', 'w-3.5 h-3.5')} ${data.dicionarioDeCampos?.length || 0} campos cadastrados | ${ico('link', 'w-3.5 h-3.5')} ${data.linksExternos?.length || 0} links gerados</p>
                        </div>
                        <div class="flex gap-2 w-full sm:w-auto">
                            <button onclick="window.abrirConstrutor('${docSnap.id}')" class="flex-1 sm:flex-none bg-indigo-100 hover:bg-indigo-200 text-indigo-800 font-bold px-4 py-2 rounded-lg text-xs transition border border-indigo-200 shadow-sm">${ico('settings', 'w-3.5 h-3.5')} Configurar</button>
                            <button onclick="window.verResultados('${docSnap.id}')" class="flex-1 sm:flex-none bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold px-4 py-2 rounded-lg text-xs transition border border-emerald-200 shadow-sm">${ico('trendingUp', 'w-3.5 h-3.5')} Resultados</button>
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
                
                this.currentUser.orgaoId = userData.orgaoId || 'padrao_dprj'; 
                
                this.userPreferences = userData.preferences || { enableSoundsSuccess: true };
                this.applyRoleBasedUI(); 
            }
        } catch (error) { 
            console.error("Erro ao carregar perfil:", error); 
        }
    }

    applyRoleBasedUI() {
        if (!this.currentUser) return;
        const isAdmin = (this.currentUser?.role === 'admin' || this.currentUser?.role === 'superadmin' || this.currentUser?.role === 'superadmin_global');
        document.querySelectorAll('#admin-panel-btn, #admin-btn-main').forEach(b => { if (b) b.classList.toggle('hidden', !isAdmin); });
        PermissoesService.aplicarUI(this.currentUser);
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
        console.log("Aplicando preferências:", this.userPreferences);
    }

    getDefaultNotificationPreferences() {
        return {
            enableSoundsSuccess: true, enableSoundsError: true, enableSoundsInfo: true, enableSoundsWarning: true,
            showToastsSuccess: true, showToastsError: true, showToastsInfo: true, showToastsWarning: true,
        };
    }

    // ─── CENTRAL DE SOLICITAÇÕES DE PUXADA DE CASOS ───────────────────────────

    // ─── OUVINTE DE SOLICITAÇÕES DE PUXADA ───────────────────────────────────

    setupOuvinteSolicitacoesPuxada(pautaId) {
        if (this.unsubscribePuxadas) this.unsubscribePuxadas();
        
        const attendancesRef = collection(this.db, "pautas", pautaId, "attendances");
        const q = query(attendancesRef, where("status", "==", "aguardandoAutorizacaoPuxada"));

        this.unsubscribePuxadas = onSnapshot(q, (snapshot) => {
            const solicitacoes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            this.atualizarBadgeNotificacaoPauta(solicitacoes);
        });
    }

    atualizarBadgeNotificacaoPauta(solicitacoes) {
        let badge = document.getElementById('badge-puxadas-pendentes');
        const headerActions = document.querySelector('.relative.flex.items-center.w-full.sm\\:w-auto.justify-end') || document.querySelector('header');
        
        if (solicitacoes.length > 0) {
            if (!badge && headerActions) {
                badge = document.createElement('button');
                badge.id = 'badge-puxadas-pendentes';
                badge.className = 'mr-3 bg-amber-500 hover:bg-amber-600 text-white font-black py-2 px-3 rounded-lg transition text-xs flex items-center gap-2 shadow-md animate-pulse shrink-0';
                badge.onclick = () => this.abrirModalGestaoPuxadas(solicitacoes);
                headerActions.prepend(badge);
            }
            if (badge) {
                badge.innerHTML = `🔔 Pedidos de Puxada <span class="bg-white text-amber-700 px-2 py-0.5 rounded-full text-xs font-black">${solicitacoes.length}</span>`;
            }
        } else if (badge) {
            badge.remove();
        }
    }

    abrirModalGestaoPuxadas(solicitacoes) {
        let modal = document.getElementById('modal-gestao-puxadas');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'modal-gestao-puxadas';
            modal.className = 'fixed inset-0 bg-slate-900/80 z-[99999] flex items-center justify-center p-4 backdrop-blur-sm';
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div class="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                <div class="bg-slate-900 px-6 py-4 flex justify-between items-center text-white shrink-0">
                    <h3 class="font-black text-sm uppercase tracking-wider">Solicitações de Atendimento Pendentes (${solicitacoes.length})</h3>
                    <button onclick="document.getElementById('modal-gestao-puxadas')?.remove()" class="text-slate-400 hover:text-white text-2xl font-bold">&times;</button>
                </div>
                <div class="p-5 overflow-y-auto space-y-4 bg-slate-50 flex-1 custom-scrollbar">
                    ${solicitacoes.map(item => {
                        // Formata os dados de exibição do card original
                        const urgenciaBadge = item.priority === 'URGENTE' ? `<span class="bg-red-100 text-red-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">Urgente</span>` : '';
                        const horarioAgendado = item.scheduledTime ? `Agendado: <b>${escapeHTML(item.scheduledTime)}</b>` : '';
                        const chegada = item.arrivalTime ? `Chegada: <b>${new Date(item.arrivalTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</b>` : '';

                        return `
                            <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                                <div class="flex justify-between items-start gap-2">
                                    <div>
                                        <div class="flex items-center gap-2 mb-1">
                                            <h4 class="font-black text-slate-800 text-base">${escapeHTML(item.name)}</h4>
                                            ${urgenciaBadge}
                                        </div>
                                        <p class="text-xs text-slate-500 font-bold">Assunto: ${escapeHTML(item.subject || 'Sem assunto')}</p>
                                    </div>
                                    <span class="text-[10px] font-black bg-blue-50 text-blue-700 px-2.5 py-1 rounded-md uppercase tracking-wider shrink-0">Solicitante: ${escapeHTML(item.solicitacaoPuxada?.solicitante || 'Colaborador')}</span>
                                </div>

                                <div class="flex flex-wrap gap-3 text-[11px] text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                                    ${horarioAgendado ? `<span>${horarioAgendado}</span>` : ''}
                                    ${chegada ? `<span>• ${chegada}</span>` : ''}
                                    ${item.room ? `<span>• Sala/Local: <b>${escapeHTML(item.room)}</b></span>` : ''}
                                </div>

                                <p class="text-xs text-slate-600 bg-amber-50/60 p-3 rounded-xl border border-amber-100 italic">
                                    <b>Motivo informado:</b> "${escapeHTML(item.solicitacaoPuxada?.motivo || 'Sem motivo')}"
                                </p>

                                <div class="flex gap-2 pt-2">
                                    <button onclick="window.recusarPuxada('${item.id}')" class="flex-1 bg-red-50 hover:bg-red-100 text-red-600 font-black py-2.5 rounded-xl text-xs uppercase tracking-wider transition">Recusar</button>
                                    <button onclick="window.autorizarEChamarTV('${item.id}', '${escapeHTML(item.name)}', '${escapeHTML(item.solicitacaoPuxada?.solicitante || '')}')" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2.5 rounded-xl text-xs uppercase tracking-wider transition shadow-sm">Autorizar e Abrir Atendimento</button>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>`;
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
window.autorizarEChamarTV = async function(assistidoId, nomeAssistido, nomeColaborador) {
    const pautaId = window.app?.currentPauta?.id;
    if (!pautaId) return;

    try {
        const { doc, updateDoc, arrayUnion } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
        const docRef = doc(window.app.db, "pautas", pautaId, "attendances", assistidoId);
        
        // Atualiza o status para emAtendimento e preenche o colaborador solicitante
        await updateDoc(docRef, {
            status: 'emAtendimento',
            assignedCollaborator: { name: nomeColaborador },
            inAttendanceTime: new Date().toISOString(),
            solicitacaoPuxada: null,
            historicoAcoes: arrayUnion(`Puxada autorizada para ${nomeColaborador}`)
        });

        // Fecha o modal de gestão de puxadas
        document.getElementById('modal-gestao-puxadas')?.remove();

        if (window.showNotification) {
            window.showNotification(`Atendimento autorizado para ${nomeColaborador}!`, "success");
        }

        // ABRIR O MODAL/PAINEL DE ATENDIMENTO/ATRIBUIÇÃO COM O COLABORADOR JÁ PREENCHIDO
        // Dispara a função nativa do seu sistema que abre o modal de delegação/atendimento do caso
        if (typeof window.app?.loadPauta === 'function') {
            // Se preferir abrir diretamente a tela individual do assistido na mesa:
            const baseUrl = window.location.href.split('?')[0];
            window.location.href = `${baseUrl}?pautaId=${pautaId}&assistidoId=${assistidoId}`;
        }

    } catch (e) {
        console.error(e);
        alert("Erro ao autorizar atendimento.");
    }
};

window.recusarPuxada = async function(assistidoId) {
    const pautaId = window.app?.currentPauta?.id;
    if (!pautaId) return;
    
    try {
        const { doc, updateDoc, arrayUnion } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
        const docRef = doc(window.app.db, "pautas", pautaId, "attendances", assistidoId);
        await updateDoc(docRef, {
            status: 'aguardando', // Devolve para a fila normal
            solicitacaoPuxada: null,
            historicoAcoes: arrayUnion("Solicitação de puxada recusada pela pauta")
        });
        if (window.showNotification) window.showNotification("Solicitação recusada e caso devolvido à fila.", "info");
    } catch(e) {
        console.error(e);
    }
};

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
        complemento_comercial: document.getElementById('complemento-comercial-reu')?.value || '',
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
    window.ColetasBiService.abrirResultados(window.app.db, coletaId);
};

window.ApiIntegration = {
    simularSincronizacaoVerde: function(pautaId) {
        console.log("Simulando sincronização verde para a pauta:", pautaId);
        showNotification("Sincronização simulada com sucesso!", "success");
    }
};

window.abrirMonitoramento = function(pautaId, assistidoId, assistidoNome) {
    if(window.MonitoramentoService) window.MonitoramentoService.abrirMonitoramento(pautaId, assistidoId, assistidoNome, window.app);
};

window.abrirMonitoramentoGlobal = function() {
    if(window.MonitoramentoService) window.MonitoramentoService.abrirMonitoramentoGlobal(window.app);
};

window.toggleMonitorVerde = function(pautaId, assistidoId, isVerde) {
    if(window.MonitoramentoService && window.MonitoramentoService.toggleMonitorVerde) {}
};

window.salvarMonitorLink = function(pautaId, assistidoId, inputId) {};

window.salvarMonitorObs = function(pautaId, assistidoId, inputId) {};

window.registrarAcaoHistorico = function(pautaId, assistidoId, descricaoAcao) {
    if(window.MonitoramentoService) window.MonitoramentoService.registrarAcaoHistorico(pautaId, assistidoId, descricaoAcao, window.app);
};

window.renderizarListaMonitorGlobal = function(filtro = '') {
    if(window.MonitoramentoService) window.MonitoramentoService.renderizarListaMonitorGlobal(window.app, filtro);
};
