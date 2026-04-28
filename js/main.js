// js/main.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, query, where, getDoc, getDocs, writeBatch, arrayUnion, arrayRemove, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app-check.js";

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
        this.currentPautaFilter = 'all'; // Estado do filtro
        //this.userPreferences = {}; // Campo para armazenar as preferências do usuário

        
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
            
            // Inicializa o detalhes.js
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
                    console.warn('O sistema funcionará normalmente, mas sem cache offline.');
                    showNotification(
                        'Múltiplas abas detectadas. Feche outras abas para ativar o modo offline.',
                        'warning'
                    );
                } else if (err.code == 'unimplemented') {
                    console.warn('⚠️ Navegador não suporta persistência offline.');
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
                await this.loadUserPreferences(); // <--- CARREGA AS PREFERÊNCIAS AQUI
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

        document.getElementById('login-tab-btn')?.addEventListener('click', () => {
            UIService.toggleAuthTabs('login');
        });

        document.getElementById('register-tab-btn')?.addEventListener('click', () => {
            UIService.toggleAuthTabs('register');
        });

        document.querySelectorAll('#logout-btn-main, #logout-btn-app').forEach(btn => {
            if (btn) btn.addEventListener('click', () => AuthService.logout(this.auth));
        });

        // Listener para o botão "Chamar Próximo Assistido"
        document.getElementById('call-next-assisted-btn')?.addEventListener('click', () => {
            PautaService.callNextAssisted(this);
        });

         // Botão para ver o Dashboard
        document.getElementById('view-dashboard-btn')?.addEventListener('click', () => {
            DashboardService.showDashboardScreen();
        });

        // Botão "Voltar para Pautas" no Dashboard
        document.getElementById('dashboard-back-to-pautas-btn')?.addEventListener('click', () => {
            this.showPautaSelectionScreen();
        });        

        // ================================================
        // NOVO: LISTENERS PARA CUSTOMIZAÇÃO DE COLUNAS
        // ================================================
        const pautaSettingsToggle = document.getElementById('pauta-settings-toggle');
        const pautaSettingsPanel = document.getElementById('pauta-settings-panel');
        const toggleEmAtendimento = document.getElementById('toggle-em-atendimento');
        const toggleDistribuicao = document.getElementById('toggle-distribuicao');
        const toggleFaltosos = document.getElementById('toggle-faltosos');

        if (pautaSettingsToggle && pautaSettingsPanel) {
            pautaSettingsToggle.addEventListener('click', (e) => {
                e.stopPropagation(); // Impede que o clique se propague para o document e feche imediatamente
                pautaSettingsPanel.classList.toggle('hidden');
                // Preenche os checkboxes com o estado atual das colunas ao abrir o painel
                if (!pautaSettingsPanel.classList.contains('hidden')) {
                    this.loadColumnPreferences();
                }
            });

            // Fecha o painel de configurações se clicar fora dele
            document.addEventListener('click', (e) => {
                if (pautaSettingsPanel && !pautaSettingsPanel.contains(e.target) && !pautaSettingsToggle.contains(e.target)) {
                    pautaSettingsPanel.classList.add('hidden');
                }
            });
        }

        // Listeners para os checkboxes de toggle
        toggleEmAtendimento?.addEventListener('change', () => this.saveColumnPreferences());
        toggleDistribuicao?.addEventListener('change', () => this.saveColumnPreferences());
        toggleFaltosos?.addEventListener('change', () => this.saveColumnPreferences());


        // ================================================
        // BOTÃO GERAR ATA SOCIAL - COM MODAL PERSONALIZADO
        // ================================================
        document.getElementById('btn-gerar-ata-social')?.addEventListener('click', () => {
            console.log("🚀 Botão Gerar Ata Social clicado");
            
            if (!this.currentPauta) {
                showNotification("Nenhuma pauta selecionada!", "error");
                return;
            }
            
            // Preencher valores padrão no modal
            const totalAtendidos = this.allAssisted.filter(a => a.status === 'atendido').length;
            document.getElementById('ata-acao-nome').value = this.currentPauta?.name || '';
            document.getElementById('ata-data').value = new Date().toISOString().split('T')[0];
            document.getElementById('ata-total').value = totalAtendidos;
            document.getElementById('ata-endereco').value = '';
            document.getElementById('ata-orgao').value = '';
            
            // Mostrar modal
            document.getElementById('ata-social-modal').classList.remove('hidden');
        });
        
        // Confirmar no modal
        document.getElementById('confirm-ata-modal-btn')?.addEventListener('click', () => {
            const acaoNome = document.getElementById('ata-acao-nome').value.trim();
            const endereco = document.getElementById('ata-endereco').value.trim();
            const dataAcao = document.getElementById('ata-data').value;
            const orgaoNome = document.getElementById('ata-orgao').value.trim();
            const totalManual = document.getElementById('ata-total').value;
            
            if (!acaoNome) {
                showNotification("Informe o nome da Ação Social", "error");
                return;
            }
            
            if (!endereco) {
                showNotification("Informe o endereço", "error");
                return;
            }
            
            if (!dataAcao) {
                showNotification("Informe a data", "error");
                return;
            }
            
            if (!orgaoNome) {
                showNotification("Informe o Órgão de Atendimento", "error");
                return;
            }
            
            if (!totalManual || totalManual < 0) {
                showNotification("Informe um total válido de atendimentos", "error");
                return;
            }
            
            const atendidos = this.allAssisted.filter(a => a.status === 'atendido');
            const dadosExtras = { 
                acao: acaoNome, 
                endereco: endereco, 
                data: dataAcao,
                orgao: orgaoNome,
                totalAtendimentos: totalManual
            };
            
            // Fechar modal
            document.getElementById('ata-social-modal').classList.add('hidden');
            
            // Perguntar se quer visualizar
            if (confirm("Deseja VISUALIZAR a Ata antes de baixar?")) {
                PDFService.previewAtaAcaoSocial(this.currentPauta?.name, this.colaboradores, atendidos, dadosExtras);
            } else {
                PDFService.generateAtaAcaoSocial(this.currentPauta?.name, this.colaboradores, atendidos, dadosExtras);
            }
        });
        
        // Cancelar modal
        document.getElementById('cancel-ata-modal-btn')?.addEventListener('click', () => {
            document.getElementById('ata-social-modal').classList.add('hidden');
        });
        
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.quick-action-toggle') && !e.target.closest('[id^="quick-menu-"]')) {
                document.querySelectorAll('[id^="quick-menu-"]').forEach(menu => {
                    menu.classList.add('hidden');
                });
            }
        });

        // ================================================
        // LISTENERS DOS BOTÕES DE RÁDIO DO FORMULÁRIO
        // ================================================
        
        document.querySelectorAll('input[name="is-scheduled"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const wrapper = document.getElementById('scheduled-time-wrapper');
                if (e.target.value === 'yes') {
                    wrapper.classList.remove('hidden');
                } else {
                    wrapper.classList.add('hidden');
                }
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

        // ================================================
        // BOTÕES PRINCIPAIS
        // ================================================

        // Botão Criar Pauta
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
            const orgaoId = document.getElementById('select-orgao-integracao').value; // PEGA O ÓRGÃO
            const user = this.auth.currentUser;
            
            if (!pautaName) {
                showNotification("O nome da pauta não pode ser vazio.", "error");
                return;
            }
        
            try {
                // 1. Cria a estrutura da Pauta
                const pautaRef = await addDoc(collection(this.db, "pautas"), {
                    name: pautaName,
                    type: pautaType,
                    owner: user.uid,
                    members: [user.uid],
                    memberEmails: [user.email],
                    isClosed: false,
                    createdAt: new Date().toISOString(),
                    ordemAtendimento: document.querySelector('input[name="ordemAtendimento"]:checked')?.value || 'padrao'
                });
        
                // 2. O PULO DO GATO: Se selecionou órgão, busca os nomes via Mock
                if (orgaoId) {
                    showNotification("Sincronizando com base de dados Solar/Verde...", "info");
                    
                    // Chama a função que criamos no api_integration.js
                    const assistidosOficiais = await ApiIntegration.buscarDadosPautaOficial(orgaoId);
                    
                    // Grava os nomes na pauta recém-criada
                    for (const ast of assistidosOficiais) {
                        await PautaService.addAssistedManual(this, {
                            ...ast,
                            status: 'pauta',
                            externalId: `INT-${orgaoId}-${Date.now()}-${Math.random()}` // Evita duplicados
                        });
                    }
                    showNotification(`Integração concluída: ${assistidosOficiais.length} assistidos importados.`, 'success');
                } else {
                    showNotification("Pauta criada com sucesso!", 'success');
                }
        
                // 3. Limpa e fecha modais
                document.getElementById('create-pauta-name-input').value = '';
                document.getElementById('select-orgao-integracao').value = '';
                document.getElementById('delegation-flow-modal').classList.add('hidden');
                
                this.showPautaSelectionScreen();
                
            } catch (error) {
                console.error("Erro ao criar pauta com integração:", error);
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
        
        // Botão Compartilhar
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

        // Toggle do link público
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

        // Copiar link
        document.getElementById('copy-share-link-btn')?.addEventListener('click', () => {
            const input = document.getElementById('share-link-input');
            input.select();
            navigator.clipboard.writeText(input.value);
            showNotification("Link copiado!", "info");
        });

        // Ocultar sobrenomes
        document.getElementById('mask-names-check')?.addEventListener('change', async (e) => {
            const mask = e.target.checked;
            try {
                const pautaRef = doc(this.db, "pautas", this.currentPauta.id);
                await updateDoc(pautaRef, { maskNames: mask });
                this.currentPautaData.maskNames = mask;
                showNotification("Configuração de privacidade atualizada.", "success");
            } catch (error) {
                showNotification("Erro ao salvar configuração.", "error");
            }
        });

       // Botão Estatísticas
        document.getElementById('view-stats-btn')?.addEventListener('click', () => {
            console.log("Botão estatísticas clicado");
            
            const modal = document.getElementById('statistics-modal');
            if (!modal) {
                console.error("Modal de estatísticas não encontrado");
                showNotification("Modal de estatísticas não encontrado", "error");
                return;
            }
            
            if (this.allAssisted && this.currentPauta?.name) {
                if (typeof StatisticsService?.showModal === 'function') {
                    StatisticsService.showModal(this.allAssisted, this.currentPautaData?.useDelegationFlow, this.currentPauta.name);
                } else {
                    console.error("StatisticsService.showModal não é uma função");
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

        // Botão Editar Configurações da Pauta
        document.getElementById('edit-pauta-config-btn')?.addEventListener('click', () => {
            if (!this.currentPautaData) return;
            
            // Preencher valores atuais no modal
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

        // Confirmar edição de configurações
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
                
                // Atualizar dados locais
                this.currentPautaData.type = newType;
                this.currentPautaData.ordemAtendimento = newOrdem;
                this.currentPautaData.useDelegationFlow = newDelegation;
                this.currentPautaData.useDistributionFlow = newDistribution;
                
                // Re-aplica as preferências de coluna considerando as novas configurações da pauta
                this.loadColumnPreferences();
                
                showNotification("Configurações atualizadas com sucesso!", "success");
                document.getElementById('edit-pauta-config-modal').classList.add('hidden');
                
            } catch (error) {
                console.error("Erro ao atualizar configurações:", error);
                showNotification("Erro ao atualizar configurações", "error");
            }
        });

        document.getElementById('cancel-edit-pauta-config-btn')?.addEventListener('click', () => {
            document.getElementById('edit-pauta-config-modal').classList.add('hidden');
        });

        document.getElementById('manage-members-btn')?.addEventListener('click', async () => {
            console.log("Botão gerenciar membros clicado");
            
            if (typeof ModalService?.openMembersModal === 'function') {
                await ModalService.openMembersModal(this);
            } else {
                console.error("ModalService.openMembersModal não é uma função");
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

        // ======================================================================
        // ⭐ NOVO: NOTIFICAÇÃO MELHORADA PARA FECHAR/REABRIR PAUTA ⭐
        // ======================================================================
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

                showNotification(
                    `Pauta ${isReopen ? 'reaberta' : 'fechada'} com sucesso.`, 
                    'success', 
                    5000 
                );
                document.getElementById('close-pauta-modal')?.classList.add('hidden');
                
            } catch (error) {
                console.error("Authentication failed:", error);
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

        // ==============================================================
        // 🛠 FIX APLICADO AQUI: Proteção para garantir que não haja TypeErrors
        // se a função 'addAssisted' não existir ou tiver outro nome no pauta.js
        // ==============================================================
        document.getElementById('add-assisted-btn')?.addEventListener('click', () => {
            if (typeof PautaService.addAssisted === 'function') {
                PautaService.addAssisted(this);
            } else {
                console.error("Erro detectado: PautaService.addAssisted não é uma função. Verifique o arquivo pauta.js.");
                showNotification("Esta ação requer atualização no código do serviço de pauta.", "warning");
                
                // Fallback seguro: se a função pretendia abrir o modal diretamente, tenta fazê-lo pelo ID comum
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

        // ================================================
        // FORMULÁRIO DE COLABORADORES
        // ================================================
        
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
        
        document.querySelectorAll('[id^="cancel-"], [id^="close-"]').forEach(btn => {
            if (btn) {
                btn.addEventListener('click', (e) => {
                    const modal = e.target.closest('.fixed');
                    if (modal) modal.classList.add('hidden');
                });
            }
        });

        // ================================================
        // LISTENERS DOS MODAIS DE PRIORIDADE
        // ================================================

        // Selecionar/desselecionar chips de prioridade
        document.querySelectorAll('.p-chip').forEach(chip => {
            chip.addEventListener('click', function(e) {
                e.preventDefault();
                this.classList.toggle('selected');
                console.log("Chip clicado:", this.dataset.value, "selected:", this.classList.contains('selected'));
            });
        });

        // Confirmar prioridade
        document.getElementById('confirm-priority-reason-btn')?.addEventListener('click', async () => {
            console.log("Confirmar prioridade clicado");
            
            const selectedChips = Array.from(document.querySelectorAll('.p-chip.selected'))
                                       .map(chip => chip.dataset.value);
                                       
            const customReason = document.getElementById('priority-reason-input')?.value.trim() || '';
            
            let finalReason = selectedChips.join(', ');
            if (customReason) {
                finalReason = finalReason ? `${finalReason} | Obs: ${customReason}` : customReason;
            }

            console.log("Razão final:", finalReason);

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
                { 
                    priority: 'URGENTE', 
                    priorityReason: finalReason 
                },
                this.currentUserName
            );

            document.querySelectorAll('.p-chip').forEach(c => c.classList.remove('selected'));
            document.getElementById('priority-reason-input').value = '';
            document.getElementById('priority-reason-modal')?.classList.add('hidden');
            showNotification("Prioridade Ativada!", "success");
        });

        // Cancelar prioridade
        document.getElementById('cancel-priority-reason-btn')?.addEventListener('click', () => {
            document.getElementById('priority-reason-modal')?.classList.add('hidden');
        });

        // ================================================
        // LISTENERS DO MODAL DE DETALHES (CHECKLIST)
        // ================================================
        
        // Botão Voltar
        document.getElementById('back-to-action-selection-btn')?.addEventListener('click', () => {
            if (typeof window.switchToActionSelectionView === 'function') {
                window.switchToActionSelectionView();
            }
        });
        
        // --- CORREÇÃO NO SALVAR CHECKLIST ---
        document.getElementById('save-checklist-btn')?.addEventListener('click', async () => {
            console.log("💾 Salvar checklist clicado");
            
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

            // Coletando dados do formulário (funções globais do detalhes.js)
            const checklistData = {
                action: window.currentChecklistAction, // Variável global do detalhes.js
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
                
                // IMPORTANTE: Não fechamos o modal e nem mudamos de aba para o usuário ver que salvou e continuar ali.
                console.log("✅ Checklist salvo e mantido na tela.");
            } catch (error) {
                console.error("Erro ao salvar:", error);
                showNotification("Erro ao salvar checklist", "error");
            }
        });

        // Botão Fechar Modal (X)
        document.getElementById('close-assisted-details-modal-btn')?.addEventListener('click', () => {
            document.getElementById('assisted-details-modal').classList.add('hidden');
        });
        
        // Botão PDF
        document.getElementById('print-checklist-btn')?.addEventListener('click', async () => {
            showNotification("Gerando PDF...", "info");
            
            try {
                const assistedName = document.getElementById('documents-assisted-name')?.textContent || 'Assistido';
                const actionTitle = document.getElementById('checklist-title')?.textContent || '';

                // Coleta documentos marcados
                const documentosTextos = [];
                document.querySelectorAll('.doc-checkbox:checked').forEach(cb => {
                    let text = '';
                    const label = cb.closest('label');
                    if (label) {
                        const span = label.querySelector('span:not(.sr-only)');
                        if (span) text = span.textContent;
                    }
                    documentosTextos.push({
                        id: cb.id,
                        text: (text || cb.id || 'Documento').trim()
                    });
                });

                // Coleta tipos (Fisico/Digital)
                const docTypes = {};
                document.querySelectorAll('.doc-checkbox:checked').forEach(cb => {
                    const typeRadio = document.querySelector(`input[name="type-${cb.id}"]:checked`);
                    docTypes[cb.id] = typeRadio ? typeRadio.value : 'Fisico';
                });

                // Coleta dados do reu — prioriza detalhes.js (window), fallback local
                const reu = getReuDataFromForm();

                // Coleta dados de gastos — prioriza detalhes.js (window), fallback local
                const gastos = getExpenseDataFromForm();

                // Monta checklistData completo
                const checklistData = {
                    checkedIds: Array.from(document.querySelectorAll('.doc-checkbox:checked')).map(cb => cb.id),
                    docTypes: docTypes,
                    reuData: reu,
                    expenseData: gastos
                };

                const resultado = PDFService.generateChecklistPDF(
                    assistedName, actionTitle, checklistData, documentosTextos
                );

                if (resultado) {
                    showNotification("PDF gerado com sucesso!", "success");
                } else {
                    showNotification("Erro ao gerar PDF", "error");
                }
            } catch (err) {
                console.error("Erro PDF:", err);
                showNotification("Erro ao gerar PDF: " + err.message, "error");
            }
        });
        
        // Botão Mudar (Reset)
        document.getElementById('reset-checklist-btn')?.addEventListener('click', () => {
            if (confirm("Deseja mudar de assunto? Isso apagará o checklist atual.")) {
                if (typeof window.switchToActionSelectionView === 'function') {
                    window.switchToActionSelectionView();
                }
            }
        });
        
        // Funções auxiliares — lêem direto do DOM (mesmos IDs do detalhes.js)
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

        // ================================================
        // LISTENERS DO MODAL DE ATENDENTE (FINALIZAR)
        // ================================================

        // Confirmar atendimento (finalizar)
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
                    attendantData = { 
                        nome: selectedCollab.nome, 
                        cargo: selectedCollab.cargo, 
                        equipe: selectedCollab.equipe 
                    };
                }
            }

            await PautaService.updateStatus(
                this.db,
                this.currentPauta.id,
                window.assistedIdToHandle,
                { 
                    status: novoStatus, 
                    attendant: attendantData, 
                    attendedTime: new Date().toISOString() 
                },
                this.currentUserName
            );
            
            document.getElementById('attendant-modal')?.classList.add('hidden');
            showNotification(novoStatus === 'atendido' ? "Atendimento finalizado!" : "Enviado para Distribuição ⚖️", "success");
        });

        // Cancelar atendimento
        document.getElementById('cancel-attendant-btn')?.addEventListener('click', () => {
            document.getElementById('attendant-modal')?.classList.add('hidden');
        });

        // ================================================
        // LISTENERS DO MODAL DE EDIÇÃO DE ATENDENTE
        // ================================================

        // Confirmar edição de atendente
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

        // Cancelar edição de atendente
        document.getElementById('cancel-edit-attendant-btn')?.addEventListener('click', () => {
            document.getElementById('edit-attendant-modal')?.classList.add('hidden');
        });

        // ================================================
        // LISTENERS DO MODAL DE SELEÇÃO DE COLABORADOR
        // ================================================

        // Confirmar seleção de colaborador
        document.getElementById('confirm-select-collaborator-btn')?.addEventListener('click', async () => {
            // pauta.js seta window.selectedCollaboratorId e window.selectedCollaboratorName ao clicar num item
            // 'null' (string) = "Não atribuir"; undefined = nada selecionado ainda
            const collaboratorId = window.selectedCollaboratorId;
            const collaboratorName = window.selectedCollaboratorName || null;

            // Ações rápidas: Reagendar, Agendar, Consulta, Outros
            // Devem finalizar o atendimento direto (status: 'atendido')
            const acoesRapidas = ['reagendar', 'agendar', 'consulta', 'outros'];
            const isAcaoRapida = acoesRapidas.includes(window.assistedTipoAcao);

            // Para ações rápidas: se nada selecionado, usa o usuário logado
            // Para fluxo normal: exige seleção
            if (!isAcaoRapida && collaboratorId === undefined) { // Garante que algo foi selecionado para delegação/atendimento direto
                showNotification("Selecione um colaborador ou 'Não atribuir'.", "warning");
                return;
            }

            if (isAcaoRapida) {
                // Finaliza direto como atendido, registrando quem atendeu e o tipo de ação
                const tipoDescricao = window.assistedTipoDescricao || window.assistedTipoAcao || 'Ação rápida';
                const atendenteFinal = collaboratorName || this.currentUserName;

                await PautaService.updateStatus(
                    this.db,
                    this.currentPauta.id,
                    window.assistedIdToHandle,
                    {
                        status: 'atendido',
                        attendedBy: atendenteFinal,
                        attendedAt: new Date().toISOString(),
                        inAttendanceTime: new Date().toISOString(),
                        isConfirmed: false,
                        finalizadoPeloColaborador: true,
                        distributionStatus: 'completed',
                        tipoAcaoRapida: tipoDescricao,
                        assignedCollaborator: collaboratorName
                            ? { id: collaboratorId, name: collaboratorName }
                            : null
                    },
                    this.currentUserName
                );

                showNotification(`${window.assistedNameToHandle} marcado como atendido por ${atendenteFinal} (${tipoDescricao}).`, "success");

            } else if (window.assistedTipoAcao === 'atender_direto') { // ⭐ NOVA LÓGICA PARA 'ATENDER DIRETO'
                const atendenteFinal = collaboratorName || this.currentUserName; // Pode ser 'Não atribuir' ou um nome

                await PautaService.finishAttendance(
                    this, // Passa a instância do app
                    window.assistedIdToHandle,
                    atendenteFinal, // Atendente pode ser null/nome
                    [] // Sem demandas por enquanto para atendimento direto
                );
                showNotification(`${window.assistedNameToHandle} marcado como atendido por ${atendenteFinal}.`, "success");

            } else { // Lógica existente para delegação normal
                let collaboratorData = null;
                if (collaboratorName) {
                    collaboratorData = { id: collaboratorId, name: collaboratorName };
                    showNotification(`${window.assistedNameToHandle} atribuído a ${collaboratorName}.`, "success");
                } else {
                    showNotification(`${window.assistedNameToHandle} movido para 'Em Atendimento' sem colaborador atribuído.`, "success");
                }

                await PautaService.updateStatus(
                    this.db,
                    this.currentPauta.id,
                    window.assistedIdToHandle,
                    {
                        status: 'emAtendimento',
                        assignedCollaborator: collaboratorData,
                        inAttendanceTime: new Date().toISOString()
                    },
                    this.currentUserName
                );
                showNotification(`${window.assistedNameToHandle} delegado para ${collaboratorName || 'ninguém (aguardando atribuição)'}.`, "success"); 

            }
            
            document.getElementById('select-collaborator-modal')?.classList.add('hidden');
            // Limpa as variáveis globais após a ação
            window.assistedIdToHandle = null;
            window.assistedNameToHandle = null;
            window.assistedTipoAcao = null;
            window.assistedTipoDescricao = null;
            window.selectedCollaboratorId = undefined;
            window.selectedCollaboratorName = undefined;
        });

        // Cancelar seleção de colaborador
        document.getElementById('cancel-select-collaborator-btn')?.addEventListener('click', () => {
            document.getElementById('select-collaborator-modal')?.classList.add('hidden');
            window.selectedCollaboratorId = undefined;
            window.selectedCollaboratorName = undefined;
            window.assistedTipoAcao = null;
            window.assistedTipoDescricao = null;
        });

        // ================================================
        // LISTENERS DOS MODAIS DE CHEGADA
        // ================================================

        // Confirmar chegada
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
                {
                    status: 'aguardando',
                    arrivalTime: arrivalDate.toISOString(),
                    checkInOrder: Date.now(),
                    room: room
                },
                this.currentUserName
            );

            document.getElementById('arrival-modal')?.classList.add('hidden');
            showNotification("Chegada registrada com sucesso!", "success");
        });

        // Cancelar chegada
        document.getElementById('cancel-arrival-btn')?.addEventListener('click', () => {
            document.getElementById('arrival-modal')?.classList.add('hidden');
        });

        // ================================================
        // LISTENERS DO MODAL DE EDIÇÃO DE ASSISTIDO
        // ================================================

        // Confirmar edição de assistido
        document.getElementById('confirm-edit-assisted-btn')?.addEventListener('click', async () => {
            const name = document.getElementById('edit-assisted-name')?.value.trim();
            if (!name) {
                showNotification("O nome não pode ficar em branco.", "error");
                return;
            }
            
            const updatedData = {
                name: name,
                cpf: document.getElementById('edit-assisted-cpf')?.value.trim() || '',
                subject: document.getElementById('edit-assisted-subject')?.value.trim() || '',
                scheduledTime: document.getElementById('edit-scheduled-time')?.value || null,
            };
            
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

        // Cancelar edição de assistido
        document.getElementById('cancel-edit-assisted-btn')?.addEventListener('click', () => {
            document.getElementById('edit-assisted-modal')?.classList.add('hidden');
        });

        // ================================================
        // LISTENERS DO MODAL DE DEMANDAS
        // ================================================

        // Adicionar demanda
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
                    li.innerHTML = `
                        <span>${escapeHTML(text)}</span>
                        <button class="remove-demand-item-btn text-red-500 text-xs">Remover</button>
                    `;
                    container.appendChild(li);
                    input.value = '';
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
            
            const demandsData = {
                quantidade: descricoes.length,
                descricoes: descricoes
            };
            
            await PautaService.updateStatus(
                this.db,
                this.currentPauta.id,
                window.assistedIdToHandle,
                { demandas: demandsData },
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

        // ================================================
        // LISTENERS DO MODAL DE CONFIRMAÇÃO DE RESET
        // ================================================

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

        // ================================================
        // LISTENERS DO MODAL DE EDIÇÃO DE NOME DA PAUTA
        // ================================================

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

        // ================================================
        // LISTENERS DO MODAL DE DELEGAÇÃO POR EMAIL
        // ================================================

        document.getElementById('send-delegate-email-btn')?.addEventListener('click', async () => {
            const emailInput = document.getElementById('collaborator-email-input');
            const emailDestino = emailInput?.value.trim();
            
            if (!emailDestino) {
                showNotification("Por favor, insira o e-mail.", "error");
                return;
            }

            const btn = document.getElementById('send-delegate-email-btn');
            if (btn) {
                btn.disabled = true;
                btn.textContent = "Enviando...";
            }

            const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
            const urlFinal = `${baseUrl}/atendimento_externo.html?pautaId=${this.currentPauta.id}&assistidoId=${window.assistedIdForDelegation}&collaboratorName=${encodeURIComponent(this.currentUserName)}`;

            let nomeColega = window.collaboratorNameForDelegation;
            if (!nomeColega || nomeColega === "Não informado" || nomeColega === "undefined") {
                nomeColega = "Colega Colaborador";
            }

            try {
                await EmailService.sendDelegationEmail(
                    emailDestino, 
                    nomeColega, 
                    window.assistedNameForDelegation, 
                    this.currentUserName,
                    this.currentPauta.id,
                    window.assistedIdForDelegation
                );

                document.getElementById('delegate-email-modal')?.classList.add('hidden');
                if (emailInput) emailInput.value = '';
                
            } catch (error) {
                console.error("Erro ao enviar email:", error);
                showNotification("Falha no envio do e-mail.", "error");
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = "Enviar Link por E-mail";
                }
            }
        });

        document.getElementById('cancel-delegate-email-btn')?.addEventListener('click', () => {
            document.getElementById('delegate-email-modal')?.classList.add('hidden');
        });

        // ================================================
        // LISTENER GLOBAL PARA REMOVER MEMBROS
        // ================================================
        
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
                            
                            await updateDoc(pautaRef, {
                                members: arrayRemove(userId),
                                memberEmails: arrayRemove(email)
                            });
                            
                            showNotification(`Membro ${email} removido`, "success");
                            
                            if (typeof ModalService?.openMembersModal === 'function') {
                                await ModalService.openMembersModal(this);
                            }
                        }
                    } catch (error) {
                        console.error("Erro ao remover membro:", error);
                        showNotification("Erro ao remover membro", "error");
                    }
                }
            }
        });

        // ================================================
        // NOVO: LISTENERS PARA PREFERÊNCIAS DO USUÁRIO
        // ================================================
        document.getElementById('open-user-preferences-btn')?.addEventListener('click', () => {
            this.openUserPreferencesModal();
        });

        document.getElementById('cancel-user-preferences-btn')?.addEventListener('click', () => {
            document.getElementById('user-preferences-modal').classList.add('hidden');
        });

        document.getElementById('save-user-preferences-btn')?.addEventListener('click', async () => {
            await this.saveUserPreferences();
        });

        // ================================================
        // CONFIGURAÇÃO DO PAINEL ADMIN
        // ================================================
        
        this.setupAdminPanel();
    }

    // ================================================
    // NOVOS: MÉTODOS PARA GERENCIAR PREFERÊNCIAS DO USUÁRIO
    // ================================================

    /**
     * Carrega as preferências do usuário do Firestore.
     */


    async loadUserPreferences() {
        if (!this.auth?.currentUser || !this.db) {
            // Define padrões se não houver usuário autenticado
            this.userPreferences = this.getDefaultNotificationPreferences(); 
            return;
        }

        const userDocRef = doc(this.db, "users", this.auth.currentUser.uid);
        try {
            const docSnap = await getDoc(userDocRef);
            if (docSnap.exists()) {
                const userData = docSnap.data();
                // Carrega as preferências salvas ou usa os padrões
                this.userPreferences = userData.preferences || this.getDefaultNotificationPreferences(); 
                console.log("⚙️ Preferências do usuário carregadas:", this.userPreferences);
            } else {
                // Padrão se o documento do usuário não existir ou não tiver preferências
                this.userPreferences = this.getDefaultNotificationPreferences(); 
                console.log("⚙️ Documento de preferências do usuário não encontrado. Usando padrões.");
            }
        } catch (error) {
            console.error("Erro ao carregar preferências do usuário:", error);
            this.userPreferences = this.getDefaultNotificationPreferences(); // Fallback em caso de erro
            showNotification("Erro ao carregar suas preferências.", "error");
            playSound('error');
        }
        this.applyUserPreferences(); // Aplica imediatamente após carregar
    }

    async saveUserPreferences() {
        if (!this.auth?.currentUser || !this.db) {
            showNotification("Você precisa estar logado para salvar preferências.", "error");
            playSound('error');
            return;
        }

        // Coleta TODAS as preferências do formulário
        this.userPreferences = {
            // Sons
            enableSoundsSuccess: document.getElementById('pref-enable-sounds-success')?.checked || false,
            enableSoundsError: document.getElementById('pref-enable-sounds-error')?.checked || false,
            enableSoundsInfo: document.getElementById('pref-enable-sounds-info')?.checked || false, // Inclui chime
            enableSoundsWarning: document.getElementById('pref-enable-sounds-warning')?.checked || false,

            // Mensagens na Tela (Toasts)
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
            playSound('success');
            console.log("⚙️ Preferências do usuário salvas:", this.userPreferences);
        } catch (error) {
            console.error("Erro ao salvar preferências do usuário:", error);
            showNotification("Erro ao salvar suas preferências.", "error");
            playSound('error');
        }
    }

        async openUserPreferencesModal() {
        if (!this.auth?.currentUser) {
            showNotification("Você precisa estar logado para ver suas preferências.", "error");
            playSound('error');
            return;
        }

        // Use o operador ?. ou verifique a existência antes de atribuir
        const nameInput = document.getElementById('pref-user-name');
        if (nameInput) nameInput.value = this.currentUserName || 'Não informado';
        
        const emailInput = document.getElementById('pref-user-email');
        if (emailInput) emailInput.value = this.auth.currentUser.email || 'Não informado';

        await this.loadUserPreferences(); 

        // Função auxiliar para evitar repetição e erros de 'null'
        const setChecked = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.checked = value;
        };

        // Sons
        setChecked('pref-enable-sounds-success', this.userPreferences.enableSoundsSuccess || false);
        setChecked('pref-enable-sounds-error', this.userPreferences.enableSoundsError || false);
        setChecked('pref-enable-sounds-info', this.userPreferences.enableSoundsInfo || false);
        setChecked('pref-enable-sounds-warning', this.userPreferences.enableSoundsWarning || false);

        // Toasts
        setChecked('pref-show-toasts-success', this.userPreferences.showToastsSuccess || false);
        setChecked('pref-show-toasts-error', this.userPreferences.showToastsError || false);
        setChecked('pref-show-toasts-info', this.userPreferences.showToastsInfo || false);
        setChecked('pref-show-toasts-warning', this.userPreferences.showToastsWarning || false);

        document.getElementById('user-preferences-modal')?.classList.remove('hidden');
    }


    /**
     * Aplica as preferências carregadas ou salvas.
     * Esta função será chamada para controlar o comportamento do sistema.
     * Por enquanto, apenas loga e a função playSound/showNotification fará a verificação real.
     */
    applyUserPreferences() {
        console.log("⚙️ Aplicando preferências do usuário:", this.userPreferences);
    }

    /**
     * Retorna as preferências padrão de notificação.
     */
    getDefaultNotificationPreferences() {
        return {
            // Sons: todos ativados por padrão
            enableSoundsSuccess: true,
            enableSoundsError: true,
            enableSoundsInfo: true,
            enableSoundsWarning: true,
            // Toasts: todos ativados por padrão
            showToastsSuccess: true,
            showToastsError: true,
            showToastsInfo: true,
            showToastsWarning: true,
        };
    }

    // ================================================
    // NOVO: MÉTODOS PARA GERENCIAR VISIBILIDADE DAS COLUNAS
    // ================================================

    /**
     * Salva as preferências de visibilidade das colunas no localStorage.
     */
    saveColumnPreferences() {
        const preferences = {
            showEmAtendimento: document.getElementById('toggle-em-atendimento')?.checked || false,
            showDistribuicao: document.getElementById('toggle-distribuicao')?.checked || false,
            showFaltosos: document.getElementById('toggle-faltosos')?.checked || false,
        };
        localStorage.setItem('sigap_column_preferences', JSON.stringify(preferences));
        this.applyColumnPreferences(preferences);
    }

    /**
     * Carrega as preferências de visibilidade das colunas do localStorage
     * e aplica à interface, atualizando os checkboxes no painel.
     */
    loadColumnPreferences() {
        const savedPreferences = localStorage.getItem('sigap_column_preferences');
        let preferences = {
            showEmAtendimento: true, // Padrão
            showDistribuicao: true,  // Padrão
            showFaltosos: false,     // Padrão
        };
        if (savedPreferences) {
            preferences = JSON.parse(savedPreferences);
        }

        // Atualiza os checkboxes no painel de configurações
        const chkEmAtendimento = document.getElementById('toggle-em-atendimento');
        const chkDistribuicao = document.getElementById('toggle-distribuicao');
        const chkFaltosos = document.getElementById('toggle-faltosos');
        
        if(chkEmAtendimento) chkEmAtendimento.checked = preferences.showEmAtendimento;
        if(chkDistribuicao) chkDistribuicao.checked = preferences.showDistribuicao;
        if(chkFaltosos) chkFaltosos.checked = preferences.showFaltosos;
        
        this.applyColumnPreferences(preferences);
    }

    /**
     * Aplica as preferências de visibilidade às colunas HTML.
     * @param {object} preferences - Objeto com as preferências de visibilidade.
     */
    applyColumnPreferences(preferences) {
        // Obter o tipo da pauta atual para aplicar regras específicas
        const pautaType = this.currentPautaData?.type;
        const useDelegationFlow = this.currentPautaData?.useDelegationFlow;
        const useDistributionFlow = this.currentPautaData?.useDistributionFlow;

        const emAtendimentoColumn = document.getElementById('em-atendimento-column');
        const distribuicaoColumn = document.getElementById('distribuicao-column');
        const faltososColumn = document.getElementById('faltosos-column');

        // Em Atendimento (coluna "Delegar")
        if (emAtendimentoColumn) {
            // Se a pauta usa delegação, mas a preferência do usuário é esconder, esconde.
            // Se a pauta NÃO usa delegação, SEMPRE esconde (a preferência do usuário não anula a regra da pauta).
            if (useDelegationFlow && preferences.showEmAtendimento) {
                emAtendimentoColumn.classList.remove('hidden');
            } else {
                emAtendimentoColumn.classList.add('hidden');
            }
        }

        // Distribuição
        if (distribuicaoColumn) {
            // Se a pauta usa fluxo de distribuição, mas a preferência do usuário é esconder, esconde.
            // Se a pauta NÃO usa fluxo de distribuição, SEMPRE esconde.
            if (useDistributionFlow && preferences.showDistribuicao) {
                distribuicaoColumn.classList.remove('hidden');
            } else {
                distribuicaoColumn.classList.add('hidden');
            }
        }
        
        // Faltosos
        if (faltososColumn) {
            // A coluna de Faltosos só é relevante para pautas agendadas
            // E se o botão "Ver Faltosos" não estiver ativo (pois ele substitui Pauta pela coluna Faltosos)
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
                li.innerHTML = `
                    <span>🏢 ${escapeHTML(room)}</span>
                    <button class="remove-room-btn text-red-500" data-index="${index}">Remover</button>
                `;
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
                    item.value.toLowerCase().includes(query) ||
                    item.description.toLowerCase().includes(query)
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
        const btnAdmin = document.getElementById('admin-panel-btn');
        const adminModal = document.getElementById('admin-modal');
        
        if (btnAdmin && adminModal) {
            btnAdmin.onclick = () => {
                adminModal.classList.remove('hidden');
                loadUsersList(this.db);
                populateUserFilter(this.db);
            };
        }

        document.getElementById('max-admin-btn')?.addEventListener('click', () => {
            const window = document.getElementById('admin-window');
            if (window) {
                window.classList.toggle('max-w-4xl');
                window.classList.toggle('max-w-none');
                window.classList.toggle('rounded-lg');
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
            console.log("Carregando logs de auditoria...");
            
            const btn = document.getElementById('view-audit-logs-btn');
            const originalText = btn.textContent;
            btn.textContent = "Carregando...";
            btn.disabled = true;
            
            try {
                await loadAuditLogs(this.db);
            } catch (error) {
                console.error("Erro ao carregar logs:", error);
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
        localStorage.setItem('lastPautaType', pautaType);

        try {
            const pautaDoc = await getDoc(doc(this.db, "pautas", pautaId));
            
            if (pautaDoc.exists()) {
                this.currentPautaData = pautaDoc.data();
                this.currentPautaOwnerId = this.currentPautaData.owner;
                this.isPautaClosed = this.currentPautaData.isClosed || false;
                
                UIService.togglePautaLock(this);

                // Aplica as preferências de coluna e as regras da pauta atual
                this.loadColumnPreferences();
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

        // Aplica as preferências de coluna também na tela de seleção,
        // para garantir que tudo fique consistente ao carregar uma pauta.
        this.loadColumnPreferences();
    }

    async loadPautasWithFilter() {
        const user = this.auth.currentUser;
        if (!user) return;
        
        const pautasList = document.getElementById('pautas-list');
        if (!pautasList) {
            console.error("Elemento pautas-list não encontrado");
            return;
        }
        
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
            
            const filteredPautas = PautaService.filterPautas(
                pautas, 
                this.currentPautaFilter, 
                user.uid, 
                user.email,
                filtrosAdicionais
            );
            
            PautaService.renderPautaCards(
                filteredPautas, 
                user.uid, 
                user.email,
                this
            );
            
        } catch (error) {
            console.error("Erro ao carregar pautas:", error);
            if (pautasList) {
                pautasList.innerHTML = '<p class="col-span-full text-center text-red-500">Erro ao carregar pautas</p>';
            }
        }
    }

    async deletePauta(pautaId, pautaName) {
        console.log("🗑️ Tentando deletar pauta:", pautaId, pautaName);
        
        if (!this.db || !this.auth) {
            console.error("Database ou Auth não inicializados");
            showNotification("Erro: sistema não inicializado", "error");
            return;
        }
        
        try {
            const success = await PautaService.deletePauta(
                this.db, 
                this.auth, 
                pautaId, 
                pautaName, 
                this.currentUserName || 'Sistema'
            );
            
            if (success) {
                playSound('success'); // Som ao deletar a pauta
                await this.loadPautasWithFilter();
            }
        } catch (error) {
            console.error("Erro ao deletar pauta:", error);
            showNotification("Erro ao deletar pauta: " + error.message, "error");
        }
    }

    refreshAssistedList() {
        if (this.unsubscribeFromAttendances) {
            console.log("🔄 Lista será atualizada pelo listener");
        } else {
            this.loadAssistedList();
        }
    }
    
    async loadAssistedList() {
        if (!this.currentPauta?.id) return;
        
        try {
            const attendanceRef = collection(this.db, "pautas", this.currentPauta.id, "attendances");
            const snapshot = await getDocs(attendanceRef);
            this.allAssisted = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            UIService.renderAssistedLists(this);
        } catch (error) {
            console.error("Erro ao carregar lista:", error);
        }
    }

    setupRealtimeListener(pautaId) {
        if (this.unsubscribeFromAttendances) this.unsubscribeFromAttendances();
        
        const attendanceRef = collection(this.db, "pautas", pautaId, "attendances");
        this.unsubscribeFromAttendances = onSnapshot(attendanceRef, (snapshot) => {
            this.allAssisted = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            UIService.renderAssistedLists(this);
        }, (error) => {
            console.error("Erro no listener:", error);
            showNotification("Erro ao carregar dados", "error");
        });
    }
}

// ========================================================
// EXPORTS ADICIONAIS E GLOBAIS
// ========================================================

window.showNotification = showNotification;
window.openDetailsModal = openDetailsModal;

// ========================================================
// FUNÇÕES GLOBAIS DE CONTROLE DE TELA DO CHECKLIST
// (Você pode utilizar essas chamadas direto do seu detalhes.js)
// ========================================================
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

// Adiciona a função de ordenação ao escopo global (window)
window.sortColaboradores = function(criterio) {
    // Verifica se a função existe no CollaboratorService e a chama
    if (typeof CollaboratorService !== 'undefined' && typeof CollaboratorService.sortColaboradores === 'function') {
        CollaboratorService.sortColaboradores(window.app, criterio);
    } else {
        // FALLBACK: Caso a função não exista no serviço, faz a ordenação básica aqui
        if (!window.app || !window.app.colaboradores) return;
        
        // Alterna entre Crescente e Decrescente
        window._sortColabDir = window._sortColabDir === 'asc' ? 'desc' : 'asc';
        const direction = window._sortColabDir === 'asc' ? 1 : -1;
        
        window.app.colaboradores.sort((a, b) => {
            let valA = (a[criterio] || '').toString().toLowerCase();
            let valB = (b[criterio] || '').toString().toLowerCase();
            if (valA < valB) return -1 * direction;
            if (valA > valB) return 1 * direction;
            return 0;
        });
        
        // Renderiza a lista atualizada (chame a sua função de renderização exata aqui)
        if (typeof CollaboratorService !== 'undefined' && typeof CollaboratorService.renderModalList === 'function') {
            CollaboratorService.renderModalList(window.app);
        } else if (typeof CollaboratorService !== 'undefined' && typeof CollaboratorService.updateList === 'function') {
            CollaboratorService.updateList(window.app);
        } else {
            console.warn("Ordenado com sucesso, mas a função de re-renderização da tabela não foi encontrada.");
        }
    }
};

window.app = new SIGAPApp();

setTimeout(() => {
    if (window.app && typeof window.app.deletePauta === 'function') {
        console.log("✅ Método deletePauta disponível globalmente");
        window.app.deletePauta = window.app.deletePauta.bind(window.app);
    } else if (window.app) {
        console.log("⚠️ Recriando método deletePauta");
        window.app.deletePauta = window.app.deletePauta.bind(window.app);
    } else {
        console.error("❌ App não inicializado");
    }
}, 500);

console.log("🔍 Verificando métodos:", {
    deletePauta: typeof window.app?.deletePauta,
    loadPauta: typeof window.app?.loadPauta
});

// ================================================
// EVENTO DE CEP
// ================================================
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
                console.error("Erro ao buscar CEP:", error);
                showNotification("Erro ao buscar CEP", "error");
            }
        }
    }
}, true);

// ================================================
// Script para o toggle da explicação da ordem de atendimento
// ================================================
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
