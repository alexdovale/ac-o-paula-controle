// js/colaboradores.js - EQUIPE E PRESENÇA (SIGEP)
// Novidades:
//  - Grupos sempre em sequência: 1, 2, 3 ... 10, depois CRC, Coordenadores, depois outros (A-Z)
//  - Importar equipe de outra pauta colando apenas o ID (ou o link) da pauta de origem
//  - Interface do modal reorganizada (barra de ferramentas, cartões por equipe, avatares, badges)

import {
    collection,
    addDoc,
    doc,
    updateDoc,
    deleteDoc,
    getDocs,
    writeBatch,
    getDoc,
    setDoc,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { escapeHTML, showNotification } from './utils.js';

// Ordem fixa para grupos "nomeados" (depois dos numéricos)
const ORDEM_FIXA = ['CRC', 'Coordenadores'];

const CollaboratorService = {
    currentListener: null,
    editId: null,
    ordemAtual: 'grupo',
    gruposPermitidosAta: ['1', '2', '3', '4', 'CRC', 'Coordenadores'],
    LOGO_URL: 'https://firebasestorage.googleapis.com/v0/b/pauta-ce162.firebasestorage.app/o/logo_defensoria%20(1)%20(1).png?alt=media&token=7a4eeaf6-9a96-40b2-8b38-27651627bba7',
    ataAutoSaveTimer: null,

    // ===================================================================
    // ⭐ ORDENAÇÃO DE GRUPOS (1,2,3,4,5... depois CRC, Coordenadores, outros)
    // ===================================================================
    compararGrupos(a, b) {
        a = String(a ?? '').trim();
        b = String(b ?? '').trim();

        // Sem grupo sempre por último
        if (!a && !b) return 0;
        if (!a) return 1;
        if (!b) return -1;

        const aNum = /^\d+$/.test(a);
        const bNum = /^\d+$/.test(b);
        if (aNum && bNum) return Number(a) - Number(b);
        if (aNum) return -1;
        if (bNum) return 1;

        const ia = ORDEM_FIXA.findIndex(x => x.toLowerCase() === a.toLowerCase());
        const ib = ORDEM_FIXA.findIndex(x => x.toLowerCase() === b.toLowerCase());
        if (ia !== -1 && ib !== -1) return ia - ib;
        if (ia !== -1) return -1;
        if (ib !== -1) return 1;

        return a.localeCompare(b, 'pt-BR');
    },

    // Registra um grupo na lista (se novo) e reordena. Retorna true se adicionou.
    registrarGrupo(grupo) {
        const g = String(grupo ?? '').trim();
        if (!g) return false;
        const existe = this.gruposPermitidosAta.some(x => x.toLowerCase() === g.toLowerCase());
        if (existe) return false;
        this.gruposPermitidosAta.push(g);
        this.gruposPermitidosAta.sort((a, b) => this.compararGrupos(a, b));
        return true;
    },

    rotuloGrupo(g) {
        return /^\d+$/.test(String(g)) ? `Equipe ${g}` : String(g);
    },

    // ===================================================================
    // PDF
    // ===================================================================
    async exportarPDFCustomizado(app) {
        const checks = document.querySelectorAll('.pdf-col-selector:checked');
        const camposEscolhidos = Array.from(checks).map(el => el.value);

        if (camposEscolhidos.length === 0) {
            showNotification("Selecione pelo menos um campo para o PDF", "warning");
            return;
        }

        await window.PDFService.generateCollaboratorsPDF({
            colaboradores: this.ordenarColaboradores(app.colaboradores || []),
            pautaNome: app.currentPauta.name,
            colunas: camposEscolhidos
        });
    },

    abrirModalExportacaoPDF(app) {
        let modal = document.getElementById('export-pdf-config-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'export-pdf-config-modal';
            modal.className = 'fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center hidden backdrop-blur-sm';
            modal.innerHTML = `
                <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
                    <div class="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-4 flex justify-between items-center">
                        <h3 class="text-white font-bold text-lg">📄 Exportar PDF da equipe</h3>
                        <button data-close class="text-white hover:text-gray-200 text-2xl leading-none">&times;</button>
                    </div>
                    <div class="p-6">
                        <p class="text-sm text-slate-600 mb-4">Escolha os campos que aparecerão no PDF:</p>
                        <div id="pdf-field-selector-modal" class="grid grid-cols-2 gap-2 mb-6"></div>
                        <div class="flex gap-3">
                            <button id="confirm-export-pdf-btn" class="flex-1 bg-emerald-600 text-white font-bold py-3 rounded-xl hover:bg-emerald-700 transition">Gerar PDF</button>
                            <button data-close class="flex-1 bg-slate-200 text-slate-700 font-bold py-3 rounded-xl hover:bg-slate-300 transition">Cancelar</button>
                        </div>
                    </div>
                </div>`;
            document.body.appendChild(modal);
            modal.querySelectorAll('[data-close]').forEach(b => b.onclick = () => modal.classList.add('hidden'));
            modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
        }

        const campos = [
            { value: 'nome', label: 'Nome', default: true },
            { value: 'cargo', label: 'Cargo', default: true },
            { value: 'equipe', label: 'Equipe', default: true },
            { value: 'identificador', label: 'Matrícula/ID', default: false },
            { value: 'telefone', label: 'Telefone', default: false },
            { value: 'email', label: 'E-mail', default: false },
            { value: 'transporte', label: 'Transporte', default: false },
            { value: 'horario', label: 'Horário de chegada', default: true }
        ];

        document.getElementById('pdf-field-selector-modal').innerHTML = campos.map(c => `
            <label class="flex items-center gap-2 p-3 rounded-xl border border-slate-200 hover:bg-emerald-50 hover:border-emerald-300 cursor-pointer transition">
                <input type="checkbox" class="pdf-col-selector w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500" value="${c.value}" ${c.default ? 'checked' : ''}>
                <span class="text-sm text-slate-700 font-medium">${c.label}</span>
            </label>`).join('');

        document.getElementById('confirm-export-pdf-btn').onclick = async () => {
            const checks = document.querySelectorAll('#pdf-field-selector-modal .pdf-col-selector:checked');
            const camposEscolhidos = Array.from(checks).map(el => el.value);
            if (camposEscolhidos.length === 0) {
                showNotification("Selecione pelo menos um campo para o PDF", "warning");
                return;
            }
            await window.PDFService.generateCollaboratorsPDF({
                colaboradores: this.ordenarColaboradores(app.colaboradores || []),
                pautaNome: app.currentPauta.name,
                colunas: camposEscolhidos
            });
            modal.classList.add('hidden');
        };

        modal.classList.remove('hidden');
    },

    // ===================================================================
    // BASE MASTER
    // ===================================================================
    async abrirModalListagemMaster(app) {
        let modal = document.getElementById('master-list-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'master-list-modal';
            modal.className = 'fixed inset-0 bg-black/70 z-[9999] flex items-center justify-center hidden backdrop-blur-sm';
            modal.innerHTML = `
                <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden flex flex-col h-[85vh]">
                    <div class="bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-5 flex justify-between items-center shrink-0">
                        <h3 class="text-white font-black text-xl flex items-center gap-2"><span>👥</span> Base geral de colaboradores</h3>
                        <button data-close class="text-white hover:text-violet-200 text-3xl font-bold leading-none transition-colors">&times;</button>
                    </div>
                    <div class="p-5 bg-slate-50 border-b border-slate-200 shrink-0">
                        <input type="text" id="search-master-list" placeholder="🔎  Pesquisar por nome, matrícula, cargo ou equipe..." class="w-full px-4 py-3 rounded-xl border-2 border-violet-200 focus:outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-500/20 text-slate-700 font-medium transition-all">
                        <p id="master-count" class="text-xs text-slate-500 mt-2 ml-1"></p>
                    </div>
                    <div class="overflow-y-auto p-3 sm:p-5 flex-1 bg-white" id="master-list-container"></div>
                </div>`;
            document.body.appendChild(modal);
            modal.querySelectorAll('[data-close]').forEach(b => b.onclick = () => modal.classList.add('hidden'));
            modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });

            const normaliza = s => String(s || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            document.getElementById('search-master-list').addEventListener('input', (e) => {
                const termo = normaliza(e.target.value);
                let visiveis = 0;
                document.querySelectorAll('.master-item-row').forEach(item => {
                    const ok = normaliza(item.getAttribute('data-search')).includes(termo);
                    item.style.display = ok ? 'flex' : 'none';
                    if (ok) visiveis++;
                });
                const c = document.getElementById('master-count');
                if (c) c.textContent = `${visiveis} resultado(s)`;
            });
        }

        modal.classList.remove('hidden');
        document.getElementById('search-master-list').value = '';
        const container = document.getElementById('master-list-container');
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full text-slate-400">
                <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-600 mb-4"></div>
                <p class="font-medium">Carregando colaboradores...</p>
            </div>`;

        try {
            const querySnapshot = await getDocs(collection(app.db, "colaboradores_gerais"));
            if (querySnapshot.empty) {
                container.innerHTML = `
                    <div class="flex flex-col items-center justify-center h-full text-slate-400">
                        <span class="text-4xl mb-2">📭</span>
                        <p class="text-center font-medium">Nenhum colaborador cadastrado na base.</p>
                    </div>`;
                return;
            }

            const lista = [];
            querySnapshot.forEach(d => lista.push({ id: d.id, ...d.data() }));
            lista.sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));

            document.getElementById('master-count').textContent = `${lista.length} colaborador(es) na base`;

            container.innerHTML = lista.map(dados => {
                const tipoId = dados.tipo_id || 'ID';
                const cargo = dados.cargo || 'Membro';
                const searchString = `${dados.nome} ${dados.id} ${cargo} ${dados.equipe || ''}`;
                return `
                    <div class="master-item-row flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 mb-3 border border-slate-200 hover:border-violet-300 hover:bg-violet-50 rounded-xl cursor-pointer transition-colors group"
                         data-id="${escapeHTML(dados.id)}" data-search="${escapeHTML(searchString)}">
                        <div class="flex-1 mb-3 sm:mb-0">
                            <div class="font-black text-slate-800 text-base group-hover:text-violet-700">${escapeHTML(dados.nome || 'Sem nome')}</div>
                            <div class="text-xs font-semibold text-slate-500 mt-1 flex flex-wrap gap-2 items-center">
                                <span class="bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">${escapeHTML(cargo)}</span>
                                <span>${escapeHTML(tipoId)}: <strong class="text-slate-700">${escapeHTML(dados.id)}</strong></span>
                                ${dados.equipe ? `<span class="bg-violet-100 text-violet-700 px-2 py-0.5 rounded">${escapeHTML(this.rotuloGrupo(dados.equipe))}</span>` : ''}
                            </div>
                        </div>
                        <button class="w-full sm:w-auto bg-white border-2 border-violet-200 text-violet-700 group-hover:bg-violet-600 group-hover:border-violet-600 group-hover:text-white px-5 py-2 rounded-xl font-bold transition-all text-sm">Preencher</button>
                    </div>`;
            }).join('');

            container.querySelectorAll('.master-item-row').forEach(row => {
                row.onclick = async () => {
                    const id = row.dataset.id;
                    modal.classList.add('hidden');
                    const inputIdentificador = document.getElementById('collaborator-identificador-modal');
                    if (inputIdentificador) {
                        inputIdentificador.value = id;
                        await this.buscarColaboradorMaster(app, id);
                    }
                };
            });

            setTimeout(() => document.getElementById('search-master-list')?.focus(), 100);
        } catch (error) {
            console.error("Erro ao listar master:", error);
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center h-full text-red-500">
                    <span class="text-4xl mb-2">⚠️</span>
                    <p class="text-center font-bold">Não foi possível carregar a base. Tente novamente.</p>
                </div>`;
        }
    },

    async buscarColaboradorMaster(app, identificador) {
        const idLimpo = identificador.trim().split('/').pop();
        if (!idLimpo) return;

        try {
            const snap = await getDoc(doc(app.db, "colaboradores_gerais", idLimpo));
            if (!snap.exists()) {
                showNotification(`Matrícula/ID ${idLimpo} não encontrada na base geral.`, "warning");
                return;
            }
            const dados = snap.data();
            const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };

            set('collaborator-name-modal', dados.nome || '');
            set('collaborator-role-modal', dados.cargo || 'Defensor(a)');
            set('collaborator-phone-modal', dados.telefone || '');
            set('collaborator-email-modal', dados.email || '');

            // Garante que o grupo existe no select (e na ordem correta)
            const equipe = dados.equipe || '1';
            this.registrarGrupo(equipe);
            this.updateTeamSelect(equipe);

            const rTransp = document.querySelector(`input[name="transporte-colaborador"][value="${dados.transporte || 'Meios Próprios'}"]`);
            if (rTransp) rTransp.checked = true;

            this.configurarLogicaCargo();
            showNotification(`Dados de ${dados.nome} preenchidos! ✅`, "success");
        } catch (e) {
            console.error("Erro ao buscar master:", e);
        }
    },

    // ===================================================================
    // ⭐ IMPORTAR EQUIPE DE OUTRA PAUTA (só com o ID)
    // ===================================================================
    extrairPautaId(texto) {
        const t = String(texto || '').trim();
        if (!t) return '';
        const m = t.match(/[?&]pautaId=([^&#\s]+)/i);
        if (m) return decodeURIComponent(m[1]);
        return t.split('/').pop().split('?')[0].trim();
    },

    async importarEquipeDePauta(app) {
        if (!app?.currentPauta?.id) {
            showNotification("Selecione uma pauta primeiro", "error");
            return;
        }

        const input = document.getElementById('import-pauta-id-input');
        const btn = document.getElementById('import-pauta-btn');
        const substituir = document.getElementById('import-replace-check')?.checked || false;
        const origemId = this.extrairPautaId(input?.value);

        if (!origemId) {
            showNotification("Cole o ID da pauta de origem", "warning");
            input?.focus();
            return;
        }
        if (origemId === app.currentPauta.id) {
            showNotification("A pauta de origem é a mesma pauta atual", "warning");
            return;
        }

        const textoOriginal = btn?.innerHTML;
        if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Buscando...'; }

        try {
            const origemSnap = await getDoc(doc(app.db, "pautas", origemId));
            if (!origemSnap.exists()) {
                showNotification("Pauta de origem não encontrada. Confira o ID.", "error");
                return;
            }
            const nomeOrigem = origemSnap.data()?.name || origemId;

            const colsSnap = await getDocs(collection(app.db, "pautas", origemId, "collaborators"));
            if (colsSnap.empty) {
                showNotification(`A pauta "${nomeOrigem}" não tem colaboradores cadastrados.`, "warning");
                return;
            }

            const destinoRef = collection(app.db, "pautas", app.currentPauta.id, "collaborators");
            const atuais = app.colaboradores || [];
            const chave = c => String(c.identificador || c.nome || '').trim().toLowerCase();
            const jaExistem = new Set(substituir ? [] : atuais.map(chave));

            const novos = [];
            colsSnap.forEach(d => {
                const c = d.data();
                if (!jaExistem.has(chave(c))) {
                    novos.push({
                        nome: c.nome || '',
                        cargo: c.cargo || '',
                        identificador: c.identificador || '',
                        equipe: c.equipe || '',
                        telefone: c.telefone || '',
                        email: c.email || '',
                        transporte: c.transporte || 'Meios Próprios',
                        tipo_id: c.tipo_id || (c.cargo === 'Defensor(a)' ? 'Matrícula' : 'ID'),
                        presente: false,
                        horario: '--:--',
                        updatedAt: new Date().toISOString()
                    });
                }
            });

            if (novos.length === 0) {
                showNotification("Todos os colaboradores dessa pauta já estão na equipe atual.", "info");
                return;
            }

            const msg = substituir
                ? `Isto vai APAGAR os ${atuais.length} membro(s) atuais e importar ${novos.length} de "${nomeOrigem}". Continuar?`
                : `Importar ${novos.length} membro(s) de "${nomeOrigem}" para esta pauta?`;
            if (!confirm(msg)) return;

            // Monta as operações (Firestore: máx. 500 por batch)
            const ops = [];
            if (substituir) atuais.forEach(c => ops.push({ tipo: 'del', ref: doc(destinoRef, c.id) }));
            novos.forEach(n => ops.push({ tipo: 'set', ref: doc(destinoRef), data: n }));

            for (let i = 0; i < ops.length; i += 450) {
                const batch = writeBatch(app.db);
                ops.slice(i, i + 450).forEach(op => {
                    if (op.tipo === 'del') batch.delete(op.ref);
                    else batch.set(op.ref, op.data);
                });
                await batch.commit();
            }

            if (input) input.value = '';
            showNotification(`${novos.length} membro(s) importado(s) de "${nomeOrigem}" ✅`, "success");
        } catch (error) {
            console.error("Erro ao importar equipe:", error);
            showNotification("Erro ao importar a equipe. Tente novamente.", "error");
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = textoOriginal; }
        }
    },

    // ===================================================================
    // ORDENAÇÃO DOS COLABORADORES
    // ===================================================================
    ordenarColaboradores(colaboradores) {
        if (this.ordemAtual === 'nome') {
            return [...colaboradores].sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
        }
        const getCargoWeight = (cargo) => {
            const c = (cargo || '').toLowerCase();
            if (c.includes('defensor')) return 1;
            if (c.includes('servidor')) return 2;
            return 3;
        };
        return [...colaboradores].sort((a, b) => {
            const g = this.compararGrupos(a.equipe, b.equipe);
            if (g !== 0) return g;
            const w = getCargoWeight(a.cargo) - getCargoWeight(b.cargo);
            if (w !== 0) return w;
            return (a.nome || '').localeCompare(b.nome || '', 'pt-BR');
        });
    },

    filtrarParaAta(colaboradores) {
        return colaboradores.filter(colab => this.gruposPermitidosAta.includes(colab.equipe || ''));
    },

    toggleOrdem() {
        this.ordemAtual = this.ordemAtual === 'grupo' ? 'nome' : 'grupo';
        this.atualizarBotaoOrdem();
        if (window.app) this.renderTable(window.app);
    },

    atualizarBotaoOrdem() {
        const btn = document.getElementById('toggle-order-btn');
        if (btn) {
            btn.innerHTML = this.ordemAtual === 'grupo'
                ? '<span>📁</span> Por grupo'
                : '<span>🔤</span> Por nome';
        }
    },

    copyDashboardLink(nomeColab) {
        if (!window.app || !window.app.currentPauta) return;
        let baseUrl = window.location.href.split('?')[0];
        baseUrl = baseUrl.substring(0, baseUrl.lastIndexOf('/'));
        if (!baseUrl) baseUrl = window.location.origin;

        const link = `${baseUrl}/atendimento_externo.html?pautaId=${window.app.currentPauta.id}&colab=${encodeURIComponent(nomeColab)}&view=dashboard`;

        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(link).then(() => {
                showNotification(`Link da mesa de ${nomeColab} copiado!`, "success");
            }).catch(() => { prompt("Copie o link abaixo para enviar:", link); });
        } else {
            prompt("Copie o link abaixo para enviar ao colaborador:", link);
        }
    },

    // ===================================================================
    // ATA SOCIAL
    // ===================================================================
    lerCamposAta() {
        return {
            ataAcaoNome: document.getElementById('ata-acao-nome')?.value?.trim() || '',
            ataEndereco: document.getElementById('ata-endereco')?.value?.trim() || '',
            ataData: document.getElementById('ata-data')?.value || '',
            ataTotalManual: document.getElementById('ata-total')?.value || '',
            ataOrgao: document.getElementById('ata-orgao')?.value?.trim() || '',
            ataLogoURL: this.LOGO_URL,
            ataLastUpdate: new Date().toISOString()
        };
    },

    async autoSaveAtaData(app) {
        if (!app?.currentPauta?.id) return;
        if (this.ataAutoSaveTimer) { clearTimeout(this.ataAutoSaveTimer); this.ataAutoSaveTimer = null; }

        const data = this.lerCamposAta();
        const indicator = document.getElementById('ata-save-indicator');

        try {
            await updateDoc(doc(app.db, "pautas", app.currentPauta.id), data);
            if (app.currentPautaData) app.currentPautaData = { ...app.currentPautaData, ...data };
            if (indicator) {
                indicator.textContent = '💾 Salvo';
                indicator.className = 'text-green-600 text-xs font-semibold';
                setTimeout(() => { indicator.textContent = ''; }, 2000);
            }
        } catch (error) {
            console.error("Erro ao salvar dados da ata:", error);
            if (indicator) {
                indicator.textContent = '⚠️ Erro ao salvar';
                indicator.className = 'text-red-600 text-xs font-semibold';
            }
        }
    },

    triggerAutoSave(app) {
        if (!app?.currentPauta?.id) return;
        if (this.ataAutoSaveTimer) clearTimeout(this.ataAutoSaveTimer);

        const indicator = document.getElementById('ata-save-indicator');
        if (indicator) {
            indicator.textContent = '💾 Salvando...';
            indicator.className = 'text-amber-600 text-xs font-semibold';
        }
        this.ataAutoSaveTimer = setTimeout(() => this.autoSaveAtaData(app), 1000);
    },

    async saveAtaData(app) {
        if (!app?.currentPauta?.id) {
            showNotification("Selecione uma pauta primeiro", "error");
            return;
        }
        const btnSave = document.getElementById('save-ata-data-btn');
        if (btnSave) btnSave.disabled = true;

        const data = this.lerCamposAta();
        try {
            await updateDoc(doc(app.db, "pautas", app.currentPauta.id), data);
            if (app.currentPautaData) app.currentPautaData = { ...app.currentPautaData, ...data };
            this.atualizarLogoAta();
            showNotification("Dados da ata salvos com sucesso! 💾", "success");
            document.getElementById('ata-social-modal')?.classList.add('hidden');
        } catch (error) {
            console.error("Erro ao salvar dados da ata:", error);
            showNotification("Erro ao salvar dados no banco.", "error");
        } finally {
            if (btnSave) btnSave.disabled = false;
        }
    },

    atualizarLogoAta() {
        const logoImg = document.getElementById('logo-ata-social');
        if (logoImg) {
            logoImg.src = this.LOGO_URL;
            logoImg.onerror = function () {
                this.style.display = 'none';
                const fallback = document.getElementById('logo-fallback-ata');
                if (fallback) fallback.style.display = 'block';
            };
        }
    },

    async loadAtaData(app) {
        if (!app?.currentPauta?.id) return;
        try {
            const pautaDoc = await getDoc(doc(app.db, "pautas", app.currentPauta.id));
            if (pautaDoc.exists()) {
                const data = pautaDoc.data();
                const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
                set('ata-acao-nome', data.ataAcaoNome || app.currentPauta.name || '');
                set('ata-endereco', data.ataEndereco || '');
                set('ata-data', data.ataData || '');
                set('ata-total', data.ataTotalManual || '');
                set('ata-orgao', data.ataOrgao || '');
                this.atualizarLogoAta();
            }
        } catch (error) {
            console.error("Erro ao carregar dados da ata:", error);
        }
    },

    configurarAutoSaveAta(app) {
        ['ata-acao-nome', 'ata-endereco', 'ata-data', 'ata-total', 'ata-orgao'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                // Atribuição por propriedade evita listeners duplicados
                el.oninput = () => this.triggerAutoSave(app);
                el.onchange = () => this.triggerAutoSave(app);
            }
        });
        const btnSave = document.getElementById('save-ata-data-btn');
        if (btnSave) {
            btnSave.onclick = (e) => { e.preventDefault(); this.saveAtaData(app); };
        }
    },

    // ===================================================================
    // MODAL DA EQUIPE
    // ===================================================================
    openModal(app) {
        const modal = document.getElementById('collaborators-modal');
        if (!modal) return;

        modal.classList.remove('hidden');
        this.resetForm();
        this.updateTeamSelect();
        this.configurarLogicaCargo();
        this.montarBarraFerramentas(app);
        this.bindBotoesEstaticos(app);

        if (app?.currentPauta?.id) {
            this.setupListener(app, app.currentPauta.id);
        }
    },

    // Barra de ferramentas: ordenação, PDF e importação por ID de pauta
    montarBarraFerramentas(app) {
        document.getElementById('collab-toolbar')?.remove();
        document.getElementById('toggle-order-btn')?.remove();
        document.getElementById('export-pdf-custom-btn')?.remove();

        const tabela = document.querySelector('#collaborators-list-table-modal');
        if (!tabela) return;

        const bar = document.createElement('div');
        bar.id = 'collab-toolbar';
        bar.className = 'mb-4 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden';
        bar.innerHTML = `
            <div class="flex flex-wrap items-center gap-2 p-3 border-b border-slate-100 bg-slate-50/70">
                <span class="text-sm font-black text-slate-700 mr-auto flex items-center gap-2">👥 Organização da equipe</span>
                <button id="copy-pauta-id-btn" class="inline-flex items-center gap-2 bg-white hover:bg-slate-100 text-slate-700 font-bold px-3 py-2 rounded-lg text-xs border border-slate-200 shadow-sm transition-colors" title="Copie para colar em outra pauta">🆔 Copiar ID desta pauta</button>
                <button id="toggle-order-btn" class="inline-flex items-center gap-2 bg-white hover:bg-slate-100 text-slate-700 font-bold px-3 py-2 rounded-lg text-xs border border-slate-200 shadow-sm transition-colors"></button>
                <button id="export-pdf-custom-btn" class="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-2 rounded-lg text-xs shadow-sm transition-colors">📄 Exportar PDF</button>
            </div>
            <div class="p-3">
                <label for="import-pauta-id-input" class="block text-[11px] font-bold text-slate-500 mb-1.5">Copiar equipe de outra pauta <span class="font-normal text-slate-400">(na pauta antiga, use "Copiar ID desta pauta")</span></label>
                <div class="flex flex-col sm:flex-row gap-2">
                    <input id="import-pauta-id-input" type="text" autocomplete="off"
                        placeholder="Cole aqui o ID da pauta de origem"
                        class="flex-1 min-w-0 px-3 py-2.5 rounded-lg border-2 border-slate-200 focus:outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-500/15 text-sm text-slate-700 transition-all">
                    <button id="import-pauta-btn" class="inline-flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 text-white font-bold px-4 py-2.5 rounded-lg text-sm shadow-sm transition-colors whitespace-nowrap">📥 Importar equipe</button>
                </div>
                <label class="mt-2 inline-flex items-center gap-2 text-[11px] text-slate-500 cursor-pointer">
                    <input type="checkbox" id="import-replace-check" class="h-3.5 w-3.5 rounded border-slate-300 text-violet-600 focus:ring-violet-500">
                    Substituir a equipe atual (apaga os membros desta pauta antes de importar)
                </label>
            </div>`;

        tabela.parentElement.insertBefore(bar, tabela);
        this.atualizarBotaoOrdem();

        document.getElementById('toggle-order-btn').onclick = () => this.toggleOrdem();
        document.getElementById('copy-pauta-id-btn').onclick = () => {
            const id = app?.currentPauta?.id;
            if (!id) return;
            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(id)
                    .then(() => showNotification("ID da pauta copiado! Cole na pauta nova para importar a equipe.", "success"))
                    .catch(() => prompt("Copie o ID da pauta:", id));
            } else {
                prompt("Copie o ID da pauta:", id);
            }
        };
        document.getElementById('export-pdf-custom-btn').onclick = () => this.abrirModalExportacaoPDF(app);
        document.getElementById('import-pauta-btn').onclick = () => this.importarEquipeDePauta(app);
        document.getElementById('import-pauta-id-input').onkeydown = (e) => {
            if (e.key === 'Enter') { e.preventDefault(); this.importarEquipeDePauta(app); }
        };
    },

    // Botões que existem no HTML da página (ligados uma única vez ao abrir o modal)
    bindBotoesEstaticos(app) {
        const btnAta = document.getElementById('btn-gerar-ata-social');
        if (btnAta) {
            btnAta.onclick = () => {
                this.loadAtaData(app);
                document.getElementById('ata-social-modal')?.classList.remove('hidden');
                setTimeout(() => {
                    this.configurarAutoSaveAta(app);
                    this.atualizarLogoAta();
                }, 100);
            };
        }

        const btnBuscar = document.getElementById('buscar-master-btn');
        if (btnBuscar) {
            const clone = btnBuscar.cloneNode(true); // remove listeners antigos
            btnBuscar.parentNode.replaceChild(clone, btnBuscar);
            clone.onclick = (e) => { e.preventDefault(); this.abrirModalListagemMaster(app); };
        }

        const btnListar = document.getElementById('listar-master-btn');
        if (btnListar) {
            btnListar.onclick = (e) => { e.preventDefault(); this.abrirModalListagemMaster(app); };
        }

        const ataModal = document.getElementById('ata-social-modal');
        if (ataModal) {
            ataModal.onclick = (e) => { if (e.target === ataModal) ataModal.classList.add('hidden'); };
        }
    },

    configurarLogicaCargo() {
        const cargoSelect = document.getElementById('collaborator-role-modal');
        const labelIdentificador = document.getElementById('label-identificador-modal');
        if (cargoSelect && labelIdentificador) {
            const atualiza = () => {
                labelIdentificador.textContent = (cargoSelect.value === "Defensor(a)") ? "Matrícula" : "ID";
            };
            atualiza();
            cargoSelect.onchange = atualiza;
        }
    },

    updateTeamSelect(selectedValue = '1') {
        const select = document.getElementById('collaborator-team-modal');
        if (!select) return;

        if (selectedValue !== 'REMOVE_GROUP' && selectedValue !== 'ADD_NEW') {
            this.registrarGrupo(selectedValue);
        }
        
        const grupos = [...this.gruposPermitidosAta].sort((a, b) => this.compararGrupos(a, b));

        select.innerHTML = grupos.map(g =>
            `<option value="${escapeHTML(g)}" ${String(selectedValue) === g ? 'selected' : ''}>${escapeHTML(this.rotuloGrupo(g))}</option>`
        ).join('') 
        + `<option disabled>──────────</option>`
        + `<option value="ADD_NEW">➕ Adicionar outro grupo...</option>`
        + `<option value="REMOVE_GROUP">❌ Remover um grupo criado...</option>`;

        select.onchange = (e) => {
            if (e.target.value === 'ADD_NEW') {
                const novo = prompt("Digite o número ou nome do novo grupo (ex: 5):")?.trim();
                if (novo) {
                    this.registrarGrupo(novo);
                    this.updateTeamSelect(novo); 
                } else {
                    this.updateTeamSelect('1');
                }
            } else if (e.target.value === 'REMOVE_GROUP') {
                const remover = prompt("Digite o nome EXATO do grupo que deseja excluir da lista:\n\nGrupos atuais: " + this.gruposPermitidosAta.join(", "))?.trim();
                
                if (remover) {
                    const index = this.gruposPermitidosAta.findIndex(g => g.toLowerCase() === remover.toLowerCase());
                    if (index !== -1) {
                        this.gruposPermitidosAta.splice(index, 1);
                        if (typeof showNotification !== 'undefined') showNotification(`Grupo "${remover}" excluído com sucesso!`, "success");
                    } else {
                        if (typeof showNotification !== 'undefined') showNotification(`Grupo "${remover}" não encontrado.`, "warning");
                    }
                }
                this.updateTeamSelect('1');
            }
        };
    },

    async saveCollaborator(app) {
        if (!app?.currentPauta?.id) return;

        const cargo = document.getElementById('collaborator-role-modal')?.value || '';
        const data = {
            nome: document.getElementById('collaborator-name-modal')?.value?.trim() || '',
            cargo,
            identificador: document.getElementById('collaborator-identificador-modal')?.value?.trim() || '',
            equipe: document.getElementById('collaborator-team-modal')?.value || '',
            telefone: document.getElementById('collaborator-phone-modal')?.value?.trim() || '',
            email: document.getElementById('collaborator-email-modal')?.value?.trim() || '',
            transporte: document.querySelector('input[name="transporte-colaborador"]:checked')?.value || 'Meios Próprios',
            tipo_id: (cargo === "Defensor(a)") ? "Matrícula" : "ID",
            updatedAt: new Date().toISOString()
        };

        if (!data.nome || !data.identificador) {
            showNotification("Preencha Nome e Matrícula/ID", "warning");
            return;
        }
        if (data.equipe === 'ADD_NEW' || data.equipe === 'REMOVE_GROUP') {
            showNotification("Escolha o grupo do colaborador", "warning");
            return;
        }

        try {
            const colRef = collection(app.db, "pautas", app.currentPauta.id, "collaborators");
            if (this.editId) {
                await updateDoc(doc(colRef, this.editId), data);
            } else {
                await addDoc(colRef, { ...data, presente: false, horario: '--:--' });
            }

            // Atualiza a base master sempre que salva/edita
            await setDoc(doc(app.db, "colaboradores_gerais", data.identificador), data, { merge: true });

            this.registrarGrupo(data.equipe);
            showNotification("Membro salvo com sucesso!", "success");
            this.resetForm();
        } catch (error) {
            console.error(error);
            showNotification("Erro ao salvar no banco de dados.", "error");
        }
    },

    setupListener(app, pautaId) {
        if (this.currentListener) this.currentListener();
        const ref = collection(app.db, "pautas", pautaId, "collaborators");
        this.currentListener = onSnapshot(ref, (snapshot) => {
            app.colaboradores = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

            // Qualquer grupo que exista na pauta entra na lista, já na ordem certa
            let mudou = false;
            app.colaboradores.forEach(c => { if (this.registrarGrupo(c.equipe)) mudou = true; });
            if (mudou && this.editId === null) {
                const sel = document.getElementById('collaborator-team-modal');
                this.updateTeamSelect(sel?.value && sel.value !== 'ADD_NEW' && sel.value !== 'REMOVE_GROUP' ? sel.value : '1');
            }

            this.renderTable(app);
        });
    },

    // ===================================================================
    // TABELA (cartões por equipe, avatares, badges)
    // ===================================================================
    iniciais(nome) {
        const p = String(nome || '?').trim().split(/\s+/).filter(Boolean);
        if (p.length === 0) return '?';
        return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
    },

    badgeCargo(cargo) {
        const c = (cargo || '').toLowerCase();
        if (c.includes('defensor')) return 'bg-blue-50 text-blue-700 border-blue-200';
        if (c.includes('servidor')) return 'bg-amber-50 text-amber-700 border-amber-200';
        return 'bg-slate-100 text-slate-600 border-slate-200';
    },

    renderTable(app) {
        const tbody = document.querySelector('#collaborators-list-table-modal tbody');
        if (!tbody) return;

        this.injetarEstilos();

        const lista = app.colaboradores || [];
        const ordenados = this.ordenarColaboradores(lista);

        // Contagem por grupo (para o cabeçalho de cada equipe)
        const resumo = {};
        lista.forEach(c => {
            const g = c.equipe || '';
            resumo[g] = resumo[g] || { total: 0, presentes: 0 };
            resumo[g].total++;
            if (c.presente) resumo[g].presentes++;
        });

        let selfT = 0, compT = 0;
        let ultimoGrupo = null;
        const html = [];

        if (ordenados.length === 0) {
            html.push(`
                <tr><td colspan="5" class="p-10 text-center">
                    <div class="text-4xl mb-2">🧑‍🤝‍🧑</div>
                    <p class="font-bold text-slate-600">Nenhum membro na equipe ainda</p>
                    <p class="text-xs text-slate-400 mt-1">Cadastre pelo formulário ou importe de outra pauta usando o ID dela.</p>
                </td></tr>`);
        }

        ordenados.forEach(colab => {
            if (colab.transporte === 'Meios Próprios') selfT++; else compT++;

            if (this.ordemAtual === 'grupo' && ultimoGrupo !== (colab.equipe || '')) {
                ultimoGrupo = colab.equipe || '';
                const r = resumo[ultimoGrupo] || { total: 0, presentes: 0 };
                const nomeGrupo = ultimoGrupo ? this.rotuloGrupo(ultimoGrupo) : 'Sem grupo';
                html.push(`
                    <tr class="grupo-header">
                        <td colspan="5" class="px-3 py-2.5 bg-gradient-to-r from-violet-50 to-white border-y border-violet-200">
                            <div class="flex items-center justify-between gap-2">
                                <span class="font-black text-violet-900 text-xs sm:text-sm flex items-center gap-2">📁 ${escapeHTML(nomeGrupo)}</span>
                                <span class="flex gap-1.5">
                                    <span class="bg-white text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full text-[10px] font-bold">${r.total} membro${r.total === 1 ? '' : 's'}</span>
                                    <span class="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full text-[10px] font-bold">${r.presentes} presente${r.presentes === 1 ? '' : 's'}</span>
                                </span>
                            </div>
                        </td>
                    </tr>`);
            }

            const presente = !!colab.presente;
            const nomeSafe = escapeHTML(colab.nome);

            html.push(`
                <tr class="border-b border-slate-100 hover:bg-slate-50/70 transition-colors" data-row-id="${colab.id}">
                    <td class="p-3">
                        <div class="flex items-center gap-3 min-w-0">
                            <div class="shrink-0 w-9 h-9 rounded-full ${presente ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'} flex items-center justify-center text-xs font-black">${escapeHTML(this.iniciais(colab.nome))}</div>
                            <div class="min-w-0">
                                <div class="font-bold text-sm text-slate-800 truncate max-w-[150px] sm:max-w-xs">${nomeSafe}</div>
                                <div class="text-[10px] text-slate-400 mt-0.5">${escapeHTML(colab.tipo_id || 'ID')}: ${escapeHTML(colab.identificador || '-')}</div>
                                <span class="md:hidden inline-block mt-1 px-1.5 py-0.5 rounded border text-[9px] font-bold ${this.badgeCargo(colab.cargo)}">${escapeHTML(colab.cargo)}</span>
                            </div>
                        </div>
                    </td>
                    <td class="p-3 text-center align-middle">
                        <label class="relative inline-block w-12 h-6 cursor-pointer select-none" title="${presente ? 'Presente' : 'Ausente'}">
                            <input type="checkbox" class="checkin-checkbox sr-only peer" data-id="${colab.id}" ${presente ? 'checked' : ''}>
                            <span class="absolute inset-0 rounded-full bg-slate-300 peer-checked:bg-emerald-500 transition-colors"></span>
                            <span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-6"></span>
                        </label>
                    </td>
                    <td class="p-3 hidden md:table-cell">
                        <span class="px-2 py-1 rounded-md border text-[11px] font-bold ${this.badgeCargo(colab.cargo)}">${escapeHTML(colab.cargo)}</span>
                    </td>
                    <td class="p-3 text-center text-xs font-black ${presente ? 'text-emerald-600' : 'text-slate-300'}">${escapeHTML(colab.horario || '--:--')}</td>
                    <td class="p-3">
                        <div class="flex justify-center gap-1.5">
                            <button data-action="link" data-nome="${nomeSafe}" class="text-emerald-600 hover:text-white hover:bg-emerald-500 bg-emerald-50 p-2 rounded-lg transition-colors" title="Copiar link da mesa">🔗</button>
                            <button data-action="edit" data-id="${colab.id}" class="text-blue-600 hover:text-white hover:bg-blue-500 bg-blue-50 p-2 rounded-lg transition-colors" title="Editar">✏️</button>
                            <button data-action="delete" data-id="${colab.id}" class="text-red-500 hover:text-white hover:bg-red-500 bg-red-50 p-2 rounded-lg transition-colors" title="Excluir">🗑️</button>
                        </div>
                    </td>
                </tr>`);
        });

        tbody.innerHTML = html.join('');

        // Delegação de eventos (um único handler, sem risco de aspas no nome)
        tbody.onclick = (e) => {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;
            const { action, id, nome } = btn.dataset;
            if (action === 'link') this.copyDashboardLink(nome);
            else if (action === 'edit') this.editCollaborator(app, id);
            else if (action === 'delete') this.deleteCollaborator(app, id);
        };
        tbody.onchange = async (e) => {
            const cb = e.target.closest('.checkin-checkbox');
            if (!cb) return;
            const pres = cb.checked;
            const hor = pres ? new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
            try {
                await updateDoc(doc(app.db, "pautas", app.currentPauta.id, "collaborators", cb.dataset.id), { presente: pres, horario: hor });
            } catch (err) {
                console.error(err);
                cb.checked = !pres;
                showNotification("Não foi possível atualizar a presença.", "error");
            }
        };

        const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        setTxt('total-participants-count', lista.length);
        setTxt('self-transport-count', selfT);
        setTxt('company-transport-count', compT);
    },

    injetarEstilos() {
        if (document.getElementById('toggle-css-colaboradores')) return;
        const style = document.createElement('style');
        style.id = 'toggle-css-colaboradores';
        // Switch feito com classes "peer" do Tailwind; só garante o foco visível
        style.innerHTML = `
            .checkin-checkbox:focus-visible + span { outline: 2px solid #10b981; outline-offset: 2px; }
            #collaborators-list-table-modal tr.grupo-header td { position: sticky; top: 0; z-index: 1; }
        `;
        document.head.appendChild(style);
    },

    async editCollaborator(app, id) {
        const snap = await getDoc(doc(app.db, "pautas", app.currentPauta.id, "collaborators", id));
        if (!snap.exists()) return;

        const c = snap.data();
        this.editId = id;
        const set = (elId, v) => { const el = document.getElementById(elId); if (el) el.value = v; };

        set('collaborator-name-modal', c.nome || '');
        set('collaborator-role-modal', c.cargo || '');
        set('collaborator-identificador-modal', c.identificador || '');
        set('collaborator-phone-modal', c.telefone || '');
        set('collaborator-email-modal', c.email || '');

        this.registrarGrupo(c.equipe);
        this.updateTeamSelect(c.equipe || '1');

        const rTransp = document.querySelector(`input[name="transporte-colaborador"][value="${c.transporte || 'Meios Próprios'}"]`);
        if (rTransp) rTransp.checked = true;

        const btnSubmit = document.getElementById('add-collaborator-btn-modal');
        if (btnSubmit) {
            btnSubmit.innerHTML = "💾 Atualizar cadastro";
            btnSubmit.className = "w-full bg-violet-600 text-white font-black py-4 rounded-xl hover:bg-violet-700 transition shadow-lg uppercase tracking-widest text-sm";
        }
        this.configurarLogicaCargo();

        const scrollArea = document.getElementById('collaborators-modal')?.querySelector('.scrollable-content');
        if (scrollArea) scrollArea.scrollTo({ top: 0, behavior: 'smooth' });
    },

    async deleteCollaborator(app, id) {
        if (confirm("Remover este membro da equipe atual?")) {
            await deleteDoc(doc(app.db, "pautas", app.currentPauta.id, "collaborators", id));
            showNotification("Membro removido da pauta!", "success");
        }
    },

    gerarAta(app) {
        const filtrados = this.filtrarParaAta(app.colaboradores);
        if (filtrados.length === 0) return null;

        let html = `
            <div style="font-family: sans-serif; max-width: 100%;">
                <div style="text-align: center; margin-bottom: 20px; padding: 10px; border-bottom: 3px solid #1a56db;">
                    <img src="${this.LOGO_URL}" alt="Logo Defensoria" style="max-height: 80px; width: auto; margin: 0 auto; display: block;" onerror="this.style.display='none'">
                    <h3 style="margin-top: 10px; color: #1a56db;">LISTA DE PRESENÇA - SIGEP</h3>
                    <p style="font-size: 12px; color: #666;">Sistema Integrado de Gestão de Pautas</p>
                </div>
                <table border="1" style="width:100%; border-collapse: collapse; font-size: 12px;">
                    <thead>
                        <tr style="background-color: #1a56db; color: white;">
                            <th style="padding: 8px;">Nome</th>
                            <th style="padding: 8px;">Cargo</th>
                            <th style="padding: 8px;">Equipe</th>
                            <th style="padding: 8px;">Horário</th>
                        </tr>
                    </thead>
                    <tbody>`;

        this.ordenarColaboradores(filtrados).forEach(c => {
            html += `<tr>
                <td style="padding: 6px;">${escapeHTML(c.nome)}</td>
                <td style="padding: 6px;">${escapeHTML(c.cargo)}</td>
                <td style="padding: 6px;">${escapeHTML(c.equipe)}</td>
                <td style="padding: 6px; text-align: center;">${c.horario || '--:--'}</td>
            </tr>`;
        });

        html += `
                    </tbody>
                </table>
                <div style="margin-top: 15px; font-size: 10px; text-align: center; color: #888; border-top: 1px solid #ddd; padding-top: 10px;">
                    <p>Gerado automaticamente pelo SIGEP em ${new Date().toLocaleString('pt-BR')}</p>
                </div>
            </div>`;
        return html;
    },

    resetForm() {
        const form = document.getElementById('collaborator-form-modal');
        if (form) form.reset();

        this.editId = null;
        const btnSubmit = document.getElementById('add-collaborator-btn-modal');
        if (btnSubmit) {
            btnSubmit.innerHTML = "➕ Adicionar à equipe";
            btnSubmit.className = "w-full bg-emerald-600 text-white font-black py-4 rounded-xl hover:bg-emerald-700 transition shadow-lg uppercase tracking-widest text-sm";
        }
        this.configurarLogicaCargo();
    }
};

export default CollaboratorService;
window.CollaboratorService = CollaboratorService;
