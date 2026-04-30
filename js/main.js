import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, query, where, getDoc, getDocs, writeBatch, arrayUnion, arrayRemove, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app-check.js";

import { firebaseConfig } from './config.js';
import { AuthService } from './auth.js';
import { PautaService } from './pauta.js?v=20260430'; 
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
import { ApiIntegration } from './api_integration.js'; // Adicionado para a integração Solar/Verde

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
        this.userPreferences = {}; 
        
        this.init();
    }

    async init() {
        try {
            const app = initializeApp(firebaseConfig);
            
            initializeAppCheck(app, {
                provider: new ReCaptchaV3Provider('6LeWfTgsAAAAAHy1y3TFZ1EH-L3btwHsult6Rgy4'),
                isTokenAutoRefreshEnabled: true
            });

            this.db = getFirestore(app);
            this.auth = getAuth(app);

            DashboardService.init(this);

            await this.setupOfflinePersistence();
            this.setupEventListeners();
            this.setupAuthListener();
            
            setupDetailsModal({ db: this.db });
            
        } catch (error) {
            console.error("Erro na inicialização:", error);
            showNotification("Erro ao iniciar o sistema", "error");
        }
    }

    setupOfflinePersistence() {
        try {
            enableIndexedDbPersistence(this.db).catch((err) => {
                if (err.code == 'failed-precondition') {
                    console.warn('⚠️ Persistência desativada: Múltiplas abas abertas.');
                    showNotification('Múltiplas abas detectadas. Feche outras abas para modo offline.', 'warning');
                }
            });
        } catch (e) { console.log(e); }
    
        window.addEventListener('offline', () => document.getElementById('offline-indicator').classList.remove('hidden'));
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
            } else {
                UIService.showScreen('login');
                document.getElementById('admin-panel-btn')?.classList.add('hidden');
                document.getElementById('admin-btn-main')?.classList.add('hidden');
            }
        });
    }

    setupEventListeners() {
        // --- LOGIN E REGISTRO ---
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
        document.getElementById('login-tab-btn')?.addEventListener('click', () => UIService.toggleAuthTabs('login'));
        document.getElementById('register-tab-btn')?.addEventListener('click', () => UIService.toggleAuthTabs('register'));
        document.querySelectorAll('#logout-btn-main, #logout-btn-app').forEach(btn => {
            if (btn) btn.addEventListener('click', () => AuthService.logout(this.auth));
        });

        // --- DASHBOARD E NAVEGAÇÃO ---
        document.getElementById('call-next-assisted-btn')?.addEventListener('click', () => PautaService.callNextAssisted(this));
        document.getElementById('view-dashboard-btn')?.addEventListener('click', () => DashboardService.showDashboardScreen());
        document.getElementById('dashboard-back-to-pautas-btn')?.addEventListener('click', () => this.showPautaSelectionScreen());

        // --- CUSTOMIZAÇÃO DE COLUNAS ---
        const pautaSettingsToggle = document.getElementById('pauta-settings-toggle');
        const pautaSettingsPanel = document.getElementById('pauta-settings-panel');
        if (pautaSettingsToggle && pautaSettingsPanel) {
            pautaSettingsToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                pautaSettingsPanel.classList.toggle('hidden');
                if (!pautaSettingsPanel.classList.contains('hidden')) this.loadColumnPreferences();
            });
            document.addEventListener('click', (e) => {
                if (pautaSettingsPanel && !pautaSettingsPanel.contains(e.target) && !pautaSettingsToggle.contains(e.target)) {
                    pautaSettingsPanel.classList.add('hidden');
                }
            });
        }
        document.getElementById('toggle-em-atendimento')?.addEventListener('change', () => this.saveColumnPreferences());
        document.getElementById('toggle-distribuicao')?.addEventListener('change', () => this.saveColumnPreferences());
        document.getElementById('toggle-faltosos')?.addEventListener('change', () => this.saveColumnPreferences());

        // --- ATA SOCIAL ---
        document.getElementById('btn-gerar-ata-social')?.addEventListener('click', () => {
            if (!this.currentPauta) return showNotification("Nenhuma pauta selecionada!", "error");
            const totalAtendidos = this.allAssisted.filter(a => a.status === 'atendido').length;
            document.getElementById('ata-acao-nome').value = this.currentPauta?.name || '';
            document.getElementById('ata-data').value = new Date().toISOString().split('T')[0];
            document.getElementById('ata-total').value = totalAtendidos;
            document.getElementById('ata-social-modal').classList.remove('hidden');
        });
        document.getElementById('confirm-ata-modal-btn')?.addEventListener('click', () => {
            const dadosExtras = {
                acao: document.getElementById('ata-acao-nome').value,
                endereco: document.getElementById('ata-endereco').value,
                data: document.getElementById('ata-data').value,
                orgao: document.getElementById('ata-orgao').value,
                totalAtendimentos: document.getElementById('ata-total').value
            };
            const atendidos = this.allAssisted.filter(a => a.status === 'atendido');
            document.getElementById('ata-social-modal').classList.add('hidden');
            if (confirm("Deseja VISUALIZAR a Ata antes de baixar?")) {
                PDFService.previewAtaAcaoSocial(this.currentPauta?.name, this.colaboradores, atendidos, dadosExtras);
            } else {
                PDFService.generateAtaAcaoSocial(this.currentPauta?.name, this.colaboradores, atendidos, dadosExtras);
            }
        });

        // --- FORMULÁRIO DE ENTRADA (RÁDIOS) ---
        document.querySelectorAll('input[name="is-scheduled"]').forEach(radio => {
            radio.addEventListener('change', (e) => document.getElementById('scheduled-time-wrapper').classList.toggle('hidden', e.target.value !== 'yes'));
        });
        document.querySelectorAll('input[name="has-arrived"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const wrapper = document.getElementById('arrival-time-wrapper');
                wrapper.classList.toggle('hidden', e.target.value !== 'yes');
                if (e.target.value === 'yes') document.getElementById('arrival-time').value = new Date().toTimeString().slice(0, 5);
            });
        });

        // --- CRIAÇÃO DE PAUTA E INTEGRAÇÃO (CORRIGIDO) ---
        document.getElementById('create-pauta-btn')?.addEventListener('click', () => document.getElementById('pauta-type-modal').classList.remove('hidden'));
        document.querySelectorAll('.pauta-type-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const type = e.currentTarget.dataset.type;
                document.getElementById('pauta-type-modal').classList.add('hidden');
                const createModal = document.getElementById('create-pauta-modal');
                createModal.dataset.pautaType = type;
                document.getElementById('room-config-container').classList.toggle('hidden', type !== 'multisala');
                createModal.classList.remove('hidden');
            });
        });

        document.getElementById('confirm-create-pauta-final-btn')?.addEventListener('click', async () => {
            const pautaName = document.getElementById('create-pauta-name-input').value.trim();
            const pautaType = document.getElementById('create-pauta-modal').dataset.pautaType;
            const orgaoId = document.getElementById('select-orgao-integracao').value;
            const user = this.auth.currentUser;
            if (!pautaName) return showNotification("O nome da pauta não pode ser vazio.", "error");

            try {
                const pautaRef = await addDoc(collection(this.db, "pautas"), {
                    name: pautaName, type: pautaType, owner: user.uid, members: [user.uid],
                    memberEmails: [user.email], isClosed: false, createdAt: new Date().toISOString(),
                    ordemAtendimento: document.querySelector('input[name="ordemAtendimento"]:checked')?.value || 'padrao'
                });

                if (orgaoId) {
                    showNotification("Sincronizando Solar/Verde...", "info");
                    const assistidosOficiais = await ApiIntegration.buscarDadosPautaOficial(orgaoId);
                    for (const ast of assistidosOficiais) {
                        await PautaService.addAssistedManual(this, { ...ast, status: 'pauta', pautaId: pautaRef.id });
                    }
                    showNotification(`Integração concluída!`, 'success');
                }
                document.getElementById('delegation-flow-modal').classList.add('hidden');
                this.showPautaSelectionScreen();
            } catch (error) { showNotification("Erro ao criar pauta.", "error"); }
        });

        // --- ADICIONAR ASSISTIDO (CORRIGIDO PARA EVITAR TYPEERROR) ---
        document.getElementById('add-assisted-btn')?.addEventListener('click', () => {
            if (typeof PautaService.addAssisted === 'function') {
                PautaService.addAssisted(this);
            } else {
                console.error("Erro: addAssisted não encontrado. Verifique pauta.js");
                document.getElementById('add-assisted-modal')?.classList.remove('hidden');
            }
        });

        // --- BACK TO PAUTAS ---
        document.getElementById('back-to-pautas-btn')?.addEventListener('click', () => {
            if (this.unsubscribeFromAttendances) this.unsubscribeFromAttendances();
            if (this.unsubscribeFromCollaborators) this.unsubscribeFromCollaborators();
            this.currentPauta = null;
            UIService.showScreen('pautaSelection');
            this.showPautaSelectionScreen();
        });

        // --- TABS E ESTATÍSTICAS ---
        document.getElementById('tab-agendamento')?.addEventListener('click', () => UIService.switchTab('agendamento', this));
        document.getElementById('tab-avulso')?.addEventListener('click', () => UIService.switchTab('avulso', this));
        document.getElementById('view-stats-btn')?.addEventListener('click', () => {
            if (typeof StatisticsService?.showModal === 'function') {
                StatisticsService.showModal(this.allAssisted, this.currentPautaData?.useDelegationFlow, this.currentPauta.name);
            }
        });

        // --- GESTÃO DA PAUTA (FECHAR/REABRIR/EDITAR) ---
        document.getElementById('close-pauta-btn')?.addEventListener('click', () => {
            document.getElementById('close-modal-title').textContent = 'Fechar Pauta';
            document.getElementById('confirm-close-pauta-btn').textContent = 'Confirmar';
            document.getElementById('close-pauta-modal').classList.remove('hidden');
        });
        document.getElementById('reopen-pauta-btn')?.addEventListener('click', () => {
            document.getElementById('close-modal-title').textContent = 'Reabrir Pauta';
            document.getElementById('confirm-close-pauta-btn').textContent = 'Reabrir';
            document.getElementById('close-pauta-modal').classList.remove('hidden');
        });

        document.getElementById('confirm-close-pauta-btn')?.addEventListener('click', async () => {
            const password = document.getElementById('close-pauta-password')?.value;
            const isReopen = document.getElementById('confirm-close-pauta-btn')?.textContent.includes('Reabrir');
            const user = this.auth.currentUser;
            try {
                const credential = EmailAuthProvider.credential(user.email, password);
                await reauthenticateWithCredential(user, credential);
                await updateDoc(doc(this.db, "pautas", this.currentPauta.id), { isClosed: !isReopen });
                this.isPautaClosed = !isReopen;
                UIService.togglePautaLock(this);
                document.getElementById('close-pauta-modal').classList.add('hidden');
                showNotification(`Pauta ${isReopen ? 'reaberta' : 'fechada'}!`, 'success');
            } catch (e) { showNotification("Senha incorreta.", "error"); }
        });

        // --- LISTENERS DE PRIORIDADE E CHIPS (RESTAURADO) ---
        document.querySelectorAll('.p-chip').forEach(chip => {
            chip.addEventListener('click', function() { this.classList.toggle('selected'); });
        });

        document.getElementById('confirm-priority-reason-btn')?.addEventListener('click', async () => {
            const selectedChips = Array.from(document.querySelectorAll('.p-chip.selected')).map(c => c.dataset.value);
            const custom = document.getElementById('priority-reason-input').value.trim();
            const finalReason = selectedChips.join(', ') + (custom ? ` | Obs: ${custom}` : "");
            if (!finalReason) return showNotification("Selecione um motivo", "error");
            
            await PautaService.updateStatus(this.db, this.currentPauta.id, window.assistedIdToHandle, { priority: 'URGENTE', priorityReason: finalReason }, this.currentUserName);
            document.getElementById('priority-reason-modal').classList.add('hidden');
            showNotification("Prioridade Ativada!", "success");
        });

        // --- CHECKLIST E FORMULÁRIOS DE DETALHES (RESTAURADO) ---
        document.getElementById('save-checklist-btn')?.addEventListener('click', async () => {
            const assistedId = window.assistedIdToHandle || window.currentAssistedId;
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
            await updateDoc(doc(this.db, "pautas", this.currentPauta.id, "attendances", assistedId), { documentChecklist: checklistData, documentState: 'saved' });
            showNotification("Checklist salvo!", "success");
        });

        // --- CEP AUTOMÁTICO (RESTAURADO) ---
        document.addEventListener('blur', async (e) => {
            if (e.target.id === 'cep-reu') {
                const cep = e.target.value.replace(/\D/g, '');
                if (cep.length === 8) {
                    const resp = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
                    const d = await resp.json();
                    if (!d.erro) {
                        document.getElementById('rua-reu').value = d.logradouro || '';
                        document.getElementById('bairro-reu').value = d.bairro || '';
                        document.getElementById('cidade-reu').value = d.localidade || '';
                        document.getElementById('estado-reu').value = d.uf || '';
                    }
                }
            }
        }, true);

        // --- EVENTOS DE BUSCA ---
        ['pauta-search', 'aguardando-search', 'em-atendimento-search', 'atendidos-search', 'faltosos-search'].forEach(id => {
            document.getElementById(id)?.addEventListener('input', () => UIService.renderAssistedLists(this));
        });

        // --- FINALIZAR ATENDIMENTO (RESTAURADO) ---
        document.getElementById('confirm-attendant-btn')?.addEventListener('click', async () => {
            const attendantName = document.getElementById('attendant-select').value;
            const useDist = this.currentPautaData?.useDistributionFlow === true;
            const novoStatus = useDist ? 'aguardandoDistribuicao' : 'atendido';
            let attendantData = attendantName;
            const selectedCollab = this.colaboradores?.find(c => c.nome === attendantName);
            if (selectedCollab) attendantData = { nome: selectedCollab.nome, cargo: selectedCollab.cargo, equipe: selectedCollab.equipe };

            await PautaService.updateStatus(this.db, this.currentPauta.id, window.assistedIdToHandle, { status: novoStatus, attendant: attendantData, attendedTime: new Date().toISOString() }, this.currentUserName);
            document.getElementById('attendant-modal').classList.add('hidden');
            showNotification("Atendimento finalizado!", "success");
        });

        // --- GLOBAL CLICK HANDLER ---
        document.body.addEventListener('click', (e) => {
            PautaService.handleCardActions(e, this);
            if (e.target.classList.contains('remove-member-btn')) this.handleRemoveMember(e);
        });

        this.setupAdminPanel();
        this.setupSubjectsAutocomplete();
    }

    // --- MÉTODOS DE PREFERÊNCIAS ---
    async loadUserPreferences() {
        if (!this.auth?.currentUser) return;
        const docSnap = await getDoc(doc(this.db, "users", this.auth.currentUser.uid));
        this.userPreferences = docSnap.exists() ? docSnap.data().preferences : this.getDefaultNotificationPreferences();
    }

    async saveUserPreferences() {
        this.userPreferences = {
            enableSoundsSuccess: document.getElementById('pref-enable-sounds-success')?.checked,
            showToastsSuccess: document.getElementById('pref-show-toasts-success')?.checked,
        };
        await updateDoc(doc(this.db, "users", this.auth.currentUser.uid), { preferences: this.userPreferences });
        showNotification("Preferências salvas!", "success");
    }

    loadColumnPreferences() {
        const saved = JSON.parse(localStorage.getItem('sigap_column_preferences')) || { showEmAtendimento: true, showDistribuicao: true, showFaltosos: false };
        document.getElementById('toggle-em-atendimento').checked = saved.showEmAtendimento;
        document.getElementById('toggle-distribuicao').checked = saved.showDistribuicao;
        document.getElementById('toggle-faltosos').checked = saved.showFaltosos;
        this.applyColumnPreferences(saved);
    }

    saveColumnPreferences() {
        const prefs = {
            showEmAtendimento: document.getElementById('toggle-em-atendimento').checked,
            showDistribuicao: document.getElementById('toggle-distribuicao').checked,
            showFaltosos: document.getElementById('toggle-faltosos').checked
        };
        localStorage.setItem('sigap_column_preferences', JSON.stringify(prefs));
        this.applyColumnPreferences(prefs);
    }

    applyColumnPreferences(prefs) {
        const data = this.currentPautaData;
        document.getElementById('em-atendimento-column')?.classList.toggle('hidden', !(data?.useDelegationFlow && prefs.showEmAtendimento));
        document.getElementById('distribuicao-column')?.classList.toggle('hidden', !(data?.useDistributionFlow && prefs.showDistribuicao));
        document.getElementById('faltosos-column')?.classList.toggle('hidden', !(data?.type === 'agendado' && prefs.showFaltosos));
    }

    // --- PAUTA CORE ---
    async loadPauta(pautaId, pautaName, pautaType) {
        this.currentPauta = { id: pautaId, name: pautaName, type: pautaType };
        document.getElementById('pauta-title').textContent = pautaName;
        const pautaDoc = await getDoc(doc(this.db, "pautas", pautaId));
        if (pautaDoc.exists()) {
            this.currentPautaData = pautaDoc.data();
            this.currentPautaOwnerId = this.currentPautaData.owner;
            this.isPautaClosed = this.currentPautaData.isClosed || false;
            UIService.togglePautaLock(this);
            this.loadColumnPreferences();
            this.setupRealtimeListener(pautaId);
            CollaboratorService.setupListener(this, pautaId);
            UIService.showScreen('app');
        }
    }

    async showPautaSelectionScreen() {
        UIService.showScreen('pautaSelection');
        this.loadPautasWithFilter();
    }

    async loadPautasWithFilter() {
        const q = query(collection(this.db, "pautas"), where("members", "array-contains", this.auth.currentUser.uid));
        const snap = await getDocs(q);
        PautaService.renderPautaCards(snap.docs.map(d => ({id: d.id, ...d.data()})), this.auth.currentUser.uid, this.auth.currentUser.email, this);
    }

    setupRealtimeListener(pautaId) {
        if (this.unsubscribeFromAttendances) this.unsubscribeFromAttendances();
        this.unsubscribeFromAttendances = onSnapshot(collection(this.db, "pautas", pautaId, "attendances"), (snap) => {
            this.allAssisted = snap.docs.map(d => ({id: d.id, ...d.data()}));
            UIService.renderAssistedLists(this);
        });
    }

    setupAdminPanel() {
        document.getElementById('admin-panel-btn')?.addEventListener('click', () => {
            document.getElementById('admin-modal').classList.remove('hidden');
            loadUsersList(this.db);
        });
    }

    applyRoleBasedUI() {
        const role = this.currentUser?.role;
        const isAdmin = role === 'admin' || role === 'superadmin';
        document.querySelectorAll('#admin-panel-btn, #admin-btn-main').forEach(el => el?.classList.toggle('hidden', !isAdmin));
    }

    renderCustomRooms() {
        const list = document.getElementById('custom-rooms-list');
        list.innerHTML = this.customRoomsList.map((r, i) => `<li>${r} <button class="remove-room-btn" data-index="${i}">X</button></li>`).join('');
    }

    setupSubjectsAutocomplete() {
        const dl = document.getElementById('subjects-list');
        if (!dl) return;
        flatSubjects.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.value;
            dl.appendChild(opt);
        });
    }

    getDefaultNotificationPreferences() {
        return { enableSoundsSuccess: true, enableSoundsError: true, showToastsSuccess: true, showToastsError: true };
    }
}

// Global scope bindings
window.app = new SIGAPApp();
window.showNotification = showNotification;
window.openDetailsModal = openDetailsModal;
window.switchToChecklistView = () => {
    document.getElementById('document-action-selection').classList.add('hidden');
    document.getElementById('document-checklist-view').classList.remove('hidden');
};
window.switchToActionSelectionView = () => {
    document.getElementById('document-checklist-view').classList.add('hidden');
    document.getElementById('document-action-selection').classList.remove('hidden');
};

// Toggle Ordem Atendimento
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('toggle-logic-btn-padrao')?.addEventListener('click', (e) => {
        const content = document.getElementById('logic-explanation-padrao-content');
        content.classList.toggle('hidden');
        e.target.textContent = content.classList.contains('hidden') ? 'Ver explicação' : 'Recolher explicação';
    });
});
