// main.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app-check.js";

import { firebaseConfig } from './config.js';
import { AuthService } from './auth.js';
import { PautaService } from './pauta.js';
import { UIService } from './ui.js';
import { CollaboratorService } from './colaboradores.js';
import { NotesService } from './notes.js';
import { ModalService } from './modal.js';
import { PDFService } from './pdfService.js';
import { showNotification } from './utils.js';
import { setupDetailsModal } from './detalhes.js';

class SIGAPApp {
    constructor() {
        this.db = null;
        this.auth = null;
        this.currentUser = null;
        this.currentUserName = '';
        this.currentPauta = null;
        this.currentPautaData = null;
        this.currentPautaOwnerId = null;
        this.isPautaClosed = false;
        this.allAssisted = [];
        this.colaboradores = [];
        this.unsubscribeFromAttendances = null;
        this.unsubscribeFromCollaborators = null;

        this.init();
    }

    async init() {
        try {
            const app = initializeApp(firebaseConfig);
            this.db = getFirestore(app);
            this.auth = getAuth(app);

            // App Check
            initializeAppCheck(app, {
                provider: new ReCaptchaV3Provider('6LeWfTgsAAAAAHy1y3TFZ1EH-L3btwHsult6Rgy4'),
                isTokenAutoRefreshEnabled: true
            });

            // Persistência offline
            try {
                await enableIndexedDbPersistence(this.db);
                console.log("Persistência Offline Ativada!");
            } catch (err) {
                if (err.code === 'failed-precondition') {
                    console.warn('Múltiplas abas abertas - persistência desativada');
                }
            }

            // Monitor de conexão
            window.addEventListener('offline', () => {
                document.getElementById('offline-indicator')?.classList.remove('hidden');
            });

            window.addEventListener('online', () => {
                document.getElementById('offline-indicator')?.classList.add('hidden');
                showNotification("Conexão restabelecida!", "success");
            });

            this.setupAuthListener();
            this.setupEventListeners();
            setupDetailsModal({ db: this.db, showNotification });

        } catch (error) {
            console.error("Erro na inicialização:", error);
            showNotification("Erro ao iniciar o sistema", "error");
        }
    }

    setupAuthListener() {
        onAuthStateChanged(this.auth, async (user) => {
            if (user) {
                await AuthService.handleAuthState(this, user);
            } else {
                UIService.showScreen('login');
                document.getElementById('admin-panel-btn')?.classList.add('hidden');
                document.getElementById('admin-btn-main')?.classList.add('hidden');
            }
        });
    }

    setupEventListeners() {
        // Login
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

        // Tabs de login
        document.getElementById('login-tab-btn')?.addEventListener('click', () => {
            UIService.toggleAuthTabs('login');
        });

        document.getElementById('register-tab-btn')?.addEventListener('click', () => {
            UIService.toggleAuthTabs('register');
        });

        // Logout
        document.querySelectorAll('#logout-btn-main, #logout-btn-app').forEach(btn => {
            btn.addEventListener('click', () => AuthService.logout(this.auth));
        });

        // Botões principais
        document.getElementById('create-pauta-btn')?.addEventListener('click', () => {
            ModalService.openPautaTypeModal(this);
        });

        document.getElementById('back-to-pautas-btn')?.addEventListener('click', () => {
            if (this.unsubscribeFromAttendances) this.unsubscribeFromAttendances();
            if (this.unsubscribeFromCollaborators) this.unsubscribeFromCollaborators();
            this.currentPauta = null;
            this.allAssisted = [];
            this.colaboradores = [];
            PautaService.showPautaSelectionScreen(this);
        });

        // Tabs de atendimento
        document.getElementById('tab-agendamento')?.addEventListener('click', () => {
            UIService.switchTab('agendamento', this);
        });

        document.getElementById('tab-avulso')?.addEventListener('click', () => {
            UIService.switchTab('avulso', this);
        });

        // Ações
        document.getElementById('actions-toggle')?.addEventListener('click', UIService.toggleActionsPanel);

        document.getElementById('share-pauta-btn')?.addEventListener('click', () => {
            ModalService.openShareModal(this);
        });

        document.getElementById('view-stats-btn')?.addEventListener('click', () => {
            const { renderStatisticsModal } = require('./estatisticas.js');
            renderStatisticsModal(this.allAssisted, this.currentPautaData?.useDelegationFlow, this.currentPauta?.name);
        });

        document.getElementById('edit-pauta-name-btn')?.addEventListener('click', () => {
            document.getElementById('edit-pauta-name-input').value = this.currentPauta?.name || '';
            document.getElementById('edit-pauta-modal').classList.remove('hidden');
        });

        document.getElementById('manage-members-btn')?.addEventListener('click', async () => {
            await ModalService.openMembersModal(this);
        });

        document.getElementById('manage-collaborators-btn')?.addEventListener('click', () => {
            CollaboratorService.openModal(this);
        });

        document.getElementById('close-pauta-btn')?.addEventListener('click', () => {
            ModalService.openClosePautaModal(this);
        });

        document.getElementById('reopen-pauta-btn')?.addEventListener('click', () => {
            ModalService.openReopenPautaModal(this);
        });

        document.getElementById('reset-all-btn')?.addEventListener('click', () => {
            document.getElementById('reset-confirm-modal').classList.remove('hidden');
        });

        document.getElementById('notes-btn')?.addEventListener('click', () => {
            NotesService.openModal();
        });

        document.getElementById('save-notes-btn')?.addEventListener('click', () => {
            NotesService.save();
        });

        document.getElementById('close-notes-btn')?.addEventListener('click', () => {
            NotesService.closeModal();
        });

        // Adicionar assistido
        document.getElementById('add-assisted-btn')?.addEventListener('click', () => {
            PautaService.addAssisted(this);
        });

        // Upload CSV
        document.getElementById('file-upload')?.addEventListener('change', (e) => {
            PautaService.handleCSVUpload(e, this);
        });

        // Botão alternar faltosos
        document.getElementById('toggle-faltosos-btn')?.addEventListener('click', UIService.toggleFaltosos);

        // Pesquisas
        ['pauta-search', 'aguardando-search', 'em-atendimento-search', 'atendidos-search', 'faltosos-search'].forEach(id => {
            document.getElementById(id)?.addEventListener('input', () => {
                UIService.renderAssistedLists(this);
            });
        });

        // Botões de PDF
        document.getElementById('download-pdf-btn')?.addEventListener('click', () => {
            const atendidos = this.allAssisted.filter(a => a.status === 'atendido');
            PDFService.generateAtendidosPDF(this.currentPauta?.name || 'Pauta', atendidos);
        });

        document.getElementById('download-faltosos-pdf-btn')?.addEventListener('click', () => {
            const faltosos = this.allAssisted.filter(a => a.status === 'faltoso');
            PDFService.generateAtendidosPDF(`${this.currentPauta?.name || 'Pauta'} (FALTOSOS)`, faltosos);
        });

        document.getElementById('download-collaborators-pdf-modal')?.addEventListener('click', () => {
            const selectedCols = Array.from(document.querySelectorAll('.pdf-col-check:checked'))
                .map(cb => cb.value);
            PDFService.generateCollaboratorsPDF(this.currentPauta?.name || 'Pauta', this.colaboradores, selectedCols);
        });

        document.getElementById('clear-collaborators-list-modal')?.addEventListener('click', () => {
            if (confirm("Limpar toda a lista?")) {
                CollaboratorService.clearAll(this);
            }
        });

        // Links de ajuda
        document.getElementById('format-help-link')?.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('format-help-modal').classList.remove('hidden');
        });

        document.getElementById('privacy-policy-link')?.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('privacy-policy-modal').classList.remove('hidden');
        });

        // Botões de cancelar/fechar
        document.querySelectorAll('[id^="cancel-"], [id^="close-"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.target.closest('.fixed');
                if (modal) modal.classList.add('hidden');
            });
        });

        // Botões de confirmação
        document.getElementById('confirm-arrival-btn')?.addEventListener('click', async () => {
            const time = document.getElementById('arrival-time-input').value;
            if (!time) {
                showNotification("Informe o horário", "error");
                return;
            }

            const [hours, minutes] = time.split(':');
            const arrivalDate = new Date();
            arrivalDate.setHours(hours, minutes, 0, 0);

            const room = document.getElementById('arrival-room-select')?.value;

            await PautaService.updateStatus(
                this.db,
                this.currentPauta.id,
                window.assistedIdToHandle,
                {
                    status: 'aguardando',
                    arrivalTime: arrivalDate.toISOString(),
                    checkInOrder: Date.now(),
                    room: room
                },
                this.currentUserName
            );

            document.getElementById('arrival-modal').classList.add('hidden');
        });

        // Configurar modais do rodapé
        UIService.setupFooterModals();

        // Event listener global para ações dos cards
        document.body.addEventListener('click', (e) => {
            PautaService.handleCardActions(e, this);
        });
    }

    async loadPauta(pautaId, pautaName, pautaType) {
        this.currentPauta = { id: pautaId, name: pautaName, type: pautaType };
        document.getElementById('pauta-title').textContent = pautaName;

        localStorage.setItem('lastPautaId', pautaId);
        localStorage.setItem('lastPautaType', pautaType);

        const pautaDoc = await getDoc(doc(this.db, "pautas", pautaId));
        if (pautaDoc.exists()) {
            this.currentPautaData = pautaDoc.data();
            this.currentPautaOwnerId = this.currentPautaData.owner;
            this.isPautaClosed = this.currentPautaData.isClosed || false;

            UIService.togglePautaLock(this);

            const emAtendimentoColumn = document.getElementById('em-atendimento-column');
            const distColumn = document.getElementById('distribuicao-column');

            if (this.currentPautaData.useDelegationFlow) {
                emAtendimentoColumn?.classList.remove('hidden');
            } else {
                emAtendimentoColumn?.classList.add('hidden');
            }

            if (this.currentPautaData.useDistributionFlow) {
                distColumn?.classList.remove('hidden');
            } else {
                distColumn?.classList.add('hidden');
            }
        }

        this.setupRealtimeListener(pautaId);
        CollaboratorService.setupListener(this, pautaId);
        UIService.showScreen('app');
    }

    setupRealtimeListener(pautaId) {
        if (this.unsubscribeFromAttendances) this.unsubscribeFromAttendances();

        const attendanceRef = collection(this.db, "pautas", pautaId, "attendances");
        this.unsubscribeFromAttendances = onSnapshot(attendanceRef, (snapshot) => {
            this.allAssisted = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            UIService.renderAssistedLists(this);
        });
    }

    renderLists() {
        UIService.renderAssistedLists(this);
    }
}

// Inicializar aplicação
window.app = new SIGAPApp();
