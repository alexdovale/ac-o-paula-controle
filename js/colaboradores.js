// js/colaboradores.js
import { 
    collection, 
    onSnapshot, 
    addDoc, 
    doc, 
    updateDoc, 
    deleteDoc, 
    getDocs, 
    writeBatch,
    getDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { escapeHTML, showNotification } from './utils.js';

// Ordem hierárquica dos cargos
const CARGO_ORDER = {
    'Coordenador(a)': 1,
    'Coordenador': 1,
    'Defensor(a)': 2,
    'Defensor': 2,
    'Residente': 3,
    'Residente (Direito)': 3,
    'Servidor(a)': 4,
    'Servidor': 4,
    'CRC': 4.5,
    'Técnico(a) de TI': 5,
    'Técnico de TI': 5,
    'Assessor(a)': 6,
    'Assessor': 6,
    'Estagiário(a)': 7,
    'Estagiário': 7,
    'Voluntário(a)': 8,
    'Voluntário': 8,
    'Outro': 9
};

const DEFAULT_CARGO_ORDER = 99;

const CollaboratorService = {
    currentListener: null,
    editId: null,
    customTeams: [],

    init() {
        this.loadCustomTeams();
        console.log("✅ CollaboratorService inicializado");
    },

    loadCustomTeams() {
        try {
            const saved = localStorage.getItem('sigap_custom_teams');
            this.customTeams = saved ? JSON.parse(saved) : [];
            if (!this.customTeams.includes('CRC')) {
                this.customTeams.unshift('CRC');
                this.saveCustomTeams();
            }
        } catch (e) {
            console.error("Erro ao carregar equipes:", e);
            this.customTeams = ['CRC'];
        }
    },

    saveCustomTeams() {
        try {
            localStorage.setItem('sigap_custom_teams', JSON.stringify(this.customTeams));
        } catch (e) {
            console.error("Erro ao salvar equipes:", e);
        }
    },

    openModal(app) {
        console.log("📋 Abrindo modal de colaboradores", app);
        
        const modal = document.getElementById('collaborators-modal');
        if (!modal) {
            console.error("Modal de colaboradores não encontrado");
            showNotification("Erro: Modal não encontrado", "error");
            return;
        }

        modal.classList.remove('hidden');
        this.resetForm();
        this.updateTeamSelect();
        this.updateCargoSelect();
        
        if (app && app.currentPauta && app.currentPauta.id) {
            this.setupListener(app, app.currentPauta.id);
        }
    },

    closeModal() {
        const modal = document.getElementById('collaborators-modal');
        if (modal) modal.classList.add('hidden');
    },

    setupListener(app, pautaId) {
        if (!pautaId || !app?.db) return;
        
        console.log("📋 Configurando listener para pauta:", pautaId);
        
        if (this.currentListener) {
            this.currentListener();
        }
        
        const ref = collection(app.db, "pautas", pautaId, "collaborators");
        this.currentListener = onSnapshot(ref, (snapshot) => {
            const lista = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            lista.sort((a, b) => {
                const teamA = a.equipe || '0';
                const teamB = b.equipe || '0';
                
                if (teamA === 'CRC' && teamB !== 'CRC') return -1;
                if (teamA !== 'CRC' && teamB === 'CRC') return 1;
                
                if (teamA !== teamB) {
                    return String(teamA).localeCompare(String(teamB), undefined, { numeric: true });
                }
                
                const orderA = CARGO_ORDER[a.cargo] || DEFAULT_CARGO_ORDER;
                const orderB = CARGO_ORDER[b.cargo] || DEFAULT_CARGO_ORDER;
                
                if (orderA !== orderB) {
                    return orderA - orderB;
                }
                
                return (a.nome || '').localeCompare(b.nome || '');
            });
            
            app.colaboradores = lista;
            this.salvarNoLocalStorage(app);
            this.renderTable(app);
        }, (error) => {
            console.error("Erro no listener:", error);
        });
    },

    salvarNoLocalStorage(app) {
        try {
            if (app && app.colaboradores) {
                localStorage.setItem('sigap_colaboradores', JSON.stringify(app.colaboradores));
                console.log("📋 Colaboradores salvos no localStorage:", app.colaboradores.length);
            }
        } catch (e) {
            console.error("Erro ao salvar no localStorage:", e);
        }
    },

    renderTable(app) {
        const tbody = document.querySelector('#collaborators-list-table-modal tbody');
        if (!tbody) return;

        tbody.innerHTML = '';
        let selfT = 0, compT = 0;

        (app.colaboradores || []).forEach(colab => {
            if (colab.transporte === 'Meios Próprios') selfT++; 
            else if (colab.transporte === 'Com a Empresa') compT++;
            
            const row = document.createElement('tr');
            let rowClass = "border-b hover:bg-gray-50 transition-colors";
            let leaderBadge = '';
            
            if (CARGO_ORDER[colab.cargo] === 1) {
                rowClass += " bg-purple-50 font-bold";
                leaderBadge = '<span class="ml-2 text-xs bg-purple-200 px-2 py-1 rounded-full">Coordenador</span>';
            } else if (CARGO_ORDER[colab.cargo] === 2) {
                rowClass += " bg-green-50";
                leaderBadge = '<span class="ml-2 text-xs bg-green-200 px-2 py-1 rounded-full">Defensor</span>';
            }
            
            if (colab.equipe === 'CRC') {
                rowClass += " border-l-4 border-blue-500";
            }
            
            row.className = rowClass;
            
            row.innerHTML = `
                <td class="p-3">
                    <div class="flex items-center">
                        <span>${escapeHTML(colab.nome || '')}</span>
                        ${leaderBadge}
                    </div>
                </td>
                <td class="p-3 text-center">
                    <input type="checkbox" class="checkin-checkbox w-5 h-5 text-green-600 rounded" 
                           data-id="${colab.id}" ${colab.presente ? 'checked' : ''}>
                </td>
                <td class="p-3 text-[10px]">
                    <b>${escapeHTML(colab.cargo || 'N/A')}</b><br>
                    <span class="${colab.equipe === 'CRC' ? 'text-blue-600 font-black' : 'text-gray-600 font-bold'} uppercase">
                        ${colab.equipe === 'CRC' ? '🔵 CRC' : `EQP ${escapeHTML(colab.equipe || 'N/A')}`}
                    </span>
                </td>
                <td class="p-3 font-mono text-[10px] text-gray-400">${colab.horario || '--:--'}</td>
                <td class="p-3 text-center flex justify-center gap-3">
                    <button class="edit-collaborator-btn text-blue-400 text-lg" data-id="${colab.id}" title="Editar">✏️</button>
                    <button class="delete-collaborator-btn text-red-300 text-lg" data-id="${colab.id}" title="Excluir">🗑️</button>
                </td>
            `;
            tbody.appendChild(row);
        });

        document.getElementById('total-participants-count').textContent = app.colaboradores?.length || 0;
        document.getElementById('self-transport-count').textContent = selfT;
        document.getElementById('company-transport-count').textContent = compT;

        this.addEventListeners(app);
    },

    addEventListeners(app) {
        document.querySelectorAll('#collaborators-modal .checkin-checkbox').forEach(checkbox => {
            checkbox.onchange = async (e) => {
                const docId = e.target.dataset.id;
                const presente = e.target.checked;
                await this.togglePresence(app, docId, presente);
            };
        });

        document.querySelectorAll('#collaborators-modal .edit-collaborator-btn').forEach(btn => {
            btn.onclick = async (e) => {
                const docId = e.currentTarget.dataset.id;
                await this.editCollaborator(app, docId);
            };
        });

        document.querySelectorAll('#collaborators-modal .delete-collaborator-btn').forEach(btn => {
            btn.onclick = (e) => {
                const docId = e.currentTarget.dataset.id;
                if (confirm("Remover este membro?")) {
                    this.deleteCollaborator(app, docId);
                }
            };
        });
    },

    async togglePresence(app, id, presente) {
        try {
            const ref = doc(app.db, "pautas", app.currentPauta.id, "collaborators", id);
            const horario = presente ? new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
            await updateDoc(ref, { presente, horario });
        } catch (error) {
            console.error("Erro ao marcar presença:", error);
        }
    },

    async saveCollaborator(app, data) {
        if (!app.currentPauta?.id) {
            showNotification("Nenhuma pauta selecionada", "error");
            return;
        }

        try {
            const ref = collection(app.db, "pautas", app.currentPauta.id, "collaborators");
            
            if (this.editId) {
                await updateDoc(doc(ref, this.editId), data);
                showNotification("Membro atualizado!");
            } else {
                await addDoc(ref, { ...data, presente: false, horario: '--:--' });
                showNotification("Membro adicionado!");
            }
            
            this.resetForm();
        } catch (error) {
            console.error("Erro ao salvar:", error);
            showNotification("Erro ao salvar membro", "error");
        }
    },

    async editCollaborator(app, id) {
        try {
            const ref = doc(app.db, "pautas", app.currentPauta.id, "collaborators", id);
            const snap = await getDoc(ref);
            
            if (snap.exists()) {
                const c = snap.data();
                this.editId = id;
                
                document.getElementById('collaborator-name-modal').value = c.nome || '';
                this.updateCargoSelect(c.cargo || 'Defensor(a)');
                this.updateTeamSelect(c.equipe || '1');
                document.getElementById('collaborator-phone-modal').value = c.telefone || '';
                document.getElementById('collaborator-email-modal').value = c.email || '';
                
                const rTransp = document.querySelector(`input[name="transporte-colaborador"][value="${c.transporte || 'Meios Próprios'}"]`);
                if (rTransp) rTransp.checked = true;

                document.getElementById('add-collaborator-btn-modal').textContent = "Atualizar Membro";
            }
        } catch (error) {
            console.error("Erro ao editar:", error);
        }
    },

    async deleteCollaborator(app, id) {
        try {
            const ref = doc(app.db, "pautas", app.currentPauta.id, "collaborators", id);
            await deleteDoc(ref);
            showNotification("Membro removido!");
        } catch (error) {
            console.error("Erro ao deletar:", error);
        }
    },

    async clearAll(app) {
        if (!confirm("Tem certeza que deseja apagar TODOS os membros?")) return;
        
        try {
            const ref = collection(app.db, "pautas", app.currentPauta.id, "collaborators");
            const snapshot = await getDocs(ref);
            
            if (snapshot.empty) return;

            const batch = writeBatch(app.db);
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            
            showNotification("Lista limpa!");
        } catch (error) {
            console.error("Erro ao limpar lista:", error);
        }
    },

    resetForm() {
        const form = document.getElementById('collaborator-form-modal');
        if (form) form.reset();
        this.editId = null;
        const btn = document.getElementById('add-collaborator-btn-modal');
        if (btn) btn.textContent = "Salvar Membro";
        
        this.updateTeamSelect('1');
        this.updateCargoSelect('Defensor(a)');
        
        const transpDefault = document.querySelector('input[name="transporte-colaborador"][value="Meios Próprios"]');
        if (transpDefault) transpDefault.checked = true;
    },

    getTeamOptions() {
        const numericTeams = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
        const specialTeams = ['CRC'];
        const allTeams = [...specialTeams];
        
        numericTeams.forEach(team => {
            if (!allTeams.includes(team)) allTeams.push(team);
        });
        
        this.customTeams.forEach(team => {
            if (!allTeams.includes(team) && team !== 'CRC') allTeams.push(team);
        });
        
        return allTeams;
    },

    getCargoOptions() {
        return [
            'Coordenador(a)',
            'Defensor(a)',
            'Residente',
            'Servidor(a)',
            'CRC',
            'Técnico(a) de TI',
            'Assessor(a)',
            'Estagiário(a)',
            'Voluntário(a)',
            'Outro'
        ];
    },

    renderCargoSelect(selectedValue = 'Defensor(a)') {
        const cargos = this.getCargoOptions();
        let html = '';
        cargos.forEach(cargo => {
            const selected = cargo === selectedValue ? 'selected' : '';
            html += `<option value="${escapeHTML(cargo)}" ${selected}>${escapeHTML(cargo)}</option>`;
        });
        return html;
    },

    renderTeamSelect(selectedValue = '1') {
        const options = this.getTeamOptions();
        let html = '';
        options.forEach(team => {
            const selected = team === selectedValue ? 'selected' : '';
            const displayTeam = team === 'CRC' ? 'CRC (Central de Relacionamento)' : `EQP ${team}`;
            html += `<option value="${escapeHTML(team)}" ${selected}>${displayTeam}</option>`;
        });
        html += `<option value="__new__">➕ Criar Nova Equipe...</option>`;
        return html;
    },

    updateCargoSelect(selectedValue = 'Defensor(a)') {
        const select = document.getElementById('collaborator-role-modal');
        if (select) {
            select.innerHTML = this.renderCargoSelect(selectedValue);
        }
    },

    updateTeamSelect(selectedValue = '1') {
        const select = document.getElementById('collaborator-team-modal');
        if (select) {
            select.innerHTML = this.renderTeamSelect(selectedValue);
            select.onchange = null;
            select.addEventListener('change', (e) => {
                if (e.target.value === '__new__') {
                    this.promptNewTeam();
                }
            });
        }
    },

    promptNewTeam() {
        const teamName = prompt("Digite o nome da nova equipe:");
        if (teamName && teamName.trim() !== '') {
            if (this.addCustomTeam(teamName)) {
                this.updateTeamSelect(teamName);
                showNotification(`Equipe "${teamName}" criada!`);
            } else {
                showNotification("Esta equipe já existe!", "error");
            }
        }
    },

    addCustomTeam(teamName) {
        if (!teamName || teamName.trim() === '') return false;
        const cleanName = teamName.trim();
        if (this.customTeams.some(t => t.toLowerCase() === cleanName.toLowerCase())) return false;
        this.customTeams.push(cleanName);
        this.saveCustomTeams();
        return true;
    },

    removeCustomTeam(teamName) {
        if (teamName === 'CRC') {
            showNotification("A equipe CRC não pode ser removida!", "error");
            return false;
        }
        const index = this.customTeams.findIndex(t => t.toLowerCase() === teamName.toLowerCase());
        if (index !== -1) {
            this.customTeams.splice(index, 1);
            this.saveCustomTeams();
            return true;
        }
        return false;
    },

    manageTeams() {
        const teams = this.customTeams.filter(t => t !== 'CRC');
        let message = "EQUIPES DISPONÍVEIS:\n\n";
        message += "🔵 CRC (fixa)\n";
        
        if (teams.length > 0) {
            teams.forEach((team, index) => {
                message += `${index + 1}. ${team}\n`;
            });
        } else {
            message += "\nNenhuma equipe personalizada.\n";
        }
        
        message += "\nCOMANDOS:\n";
        message += "- 'novo: NOME' para criar\n";
        message += "- 'del: NOME' para remover\n";
        message += "- 'sair' para fechar";
        
        const action = prompt(message);
        
        if (action) {
            if (action.startsWith('novo:')) {
                const name = action.substring(5).trim();
                if (name && name !== 'CRC') {
                    if (this.addCustomTeam(name)) {
                        showNotification(`Equipe "${name}" criada!`);
                        this.updateTeamSelect();
                    } else {
                        showNotification("Esta equipe já existe!", "error");
                    }
                }
            } else if (action.startsWith('del:')) {
                const name = action.substring(4).trim();
                if (this.removeCustomTeam(name)) {
                    showNotification(`Equipe "${name}" removida!`);
                    this.updateTeamSelect();
                }
            } else if (action !== 'sair') {
                showNotification("Comando não reconhecido", "error");
            }
        }
    },

    getColaboradorByNome(nome) {
        try {
            const stored = localStorage.getItem('sigap_colaboradores');
            const colaboradores = stored ? JSON.parse(stored) : [];
            return colaboradores.find(c => c.nome === nome) || null;
        } catch (e) {
            return null;
        }
    },

    getColaboradoresPorEquipe() {
        try {
            const stored = localStorage.getItem('sigap_colaboradores');
            const colaboradores = stored ? JSON.parse(stored) : [];
            const porEquipe = {};
            colaboradores.forEach(col => {
                const equipe = col.equipe || 'Equipe Não Definida';
                if (!porEquipe[equipe]) porEquipe[equipe] = [];
                porEquipe[equipe].push(col);
            });
            return porEquipe;
        } catch (e) {
            return {};
        }
    }
};

CollaboratorService.init();

// ========================================================
// EXPORTAÇÕES - PRONTO PARA USAR COM import * as
// ========================================================

export default CollaboratorService;
window.CollaboratorService = CollaboratorService;

console.log("✅ colaboradores.js carregado com sucesso!");