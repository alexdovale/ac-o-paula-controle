// main.js - Código mínimo no HTML
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app-check.js";

import { firebaseConfig } from './config.js';
import { AuthService } from './auth.js';
import { PautaService } from './pauta.js';
import { UIService } from './ui.js';
import { CollaboratorService } from './colaboradores.js';
import { NotesService } from './notes.js';
import { ModalService } from './modal.js';
import { StatisticsService } from './estatisticas.js';
import { PDFService } from './pdfService.js';
import { EmailService } from './emailService.js';
import { Utils } from './utils.js';

class SIGAPApp {
    constructor() {
        this.db = null;
        this.auth = null;
        this.currentUser = null;
        this.currentPauta = null;
        this.allAssisted = [];
        this.colaboradores = [];
        
        this.init();
    }

    async init() {
        try {
            const app = initializeApp(firebaseConfig);
            this.db = getFirestore(app);
            this.auth = getAuth(app);
            
            initializeAppCheck(app, {
                provider: new ReCaptchaV3Provider('6LeWfTgsAAAAAHy1y3TFZ1EH-L3btwHsult6Rgy4'),
                isTokenAutoRefreshEnabled: true
            });

            await this.setupOfflinePersistence();
            this.setupEventListeners();
            this.setupAuthListener();
            
        } catch (error) {
            console.error("Erro na inicialização:", error);
            Utils.showNotification("Erro ao iniciar o sistema", "error");
        }
    }

    setupOfflinePersistence() {
        // Configuração de persistência offline
    }

    setupAuthListener() {
        AuthService.onAuthStateChanged(this.auth, (user) => {
            this.currentUser = user;
            UIService.handleAuthState(user);
        });
    }

    setupEventListeners() {
        // Login
        document.getElementById('login-form').addEventListener('submit', (e) => {
            e.preventDefault();
            AuthService.login(this.auth, this);
        });

        // Logout
        document.querySelectorAll('#logout-btn-main, #logout-btn-app').forEach(btn => {
            btn.addEventListener('click', () => AuthService.logout(this.auth));
        });

        // Criar pauta
        document.getElementById('create-pauta-btn').addEventListener('click', () => {
            ModalService.openPautaTypeModal(this);
        });

        // Tabs
        document.getElementById('tab-agendamento').addEventListener('click', () => {
            UIService.switchTab('agendamento', this);
        });
        
        document.getElementById('tab-avulso').addEventListener('click', () => {
            UIService.switchTab('avulso', this);
        });

        // Ações
        document.getElementById('actions-toggle').addEventListener('click', UIService.toggleActionsPanel);
        
        document.getElementById('share-pauta-btn').addEventListener('click', () => {
            ModalService.openShareModal(this);
        });

        document.getElementById('view-stats-btn').addEventListener('click', () => {
            StatisticsService.showModal(this.allAssisted, this.currentPauta);
        });

        document.getElementById('manage-collaborators-btn').addEventListener('click', () => {
            CollaboratorService.openModal(this);
        });

        document.getElementById('notes-btn').addEventListener('click', () => {
            NotesService.openModal();
        });

        // Botões de modais do rodapé
        UIService.setupFooterModals();

        // Pesquisa
        UIService.setupSearchListeners(() => this.renderLists());

        // Upload CSV
        document.getElementById('file-upload').addEventListener('change', (e) => {
            PautaService.handleCSVUpload(e, this);
        });

        // Botão alternar faltosos
        document.getElementById('toggle-faltosos-btn').addEventListener('click', UIService.toggleFaltosos);

        // Delegation events via service
        document.body.addEventListener('click', (e) => {
            PautaService.handleCardActions(e, this);
        });
    }

    async loadPauta(pautaId) {
        this.currentPauta = await PautaService.loadPautaData(this.db, pautaId);
        this.setupRealtimeListener(pautaId);
        this.setupCollaboratorsListener(pautaId);
        UIService.showScreen('app');
    }

    setupRealtimeListener(pautaId) {
        PautaService.setupAttendancesListener(this.db, pautaId, (data) => {
            this.allAssisted = data;
            this.renderLists();
        });
    }

    setupCollaboratorsListener(pautaId) {
        CollaboratorService.setupListener(this.db, pautaId, (data) => {
            this.colaboradores = data;
            CollaboratorService.renderTable(this.colaboradores);
        });
    }

    renderLists() {
        UIService.renderAssistedLists(this.allAssisted, this.currentPauta, this.colaboradores);
    }
}

// Inicialização
window.app = new SIGAPApp();
