// js/colaboradores.js - EQUIPE E PRESENÇA (SIGEP - PADRÃO MINIMALISTA)

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

// ---------- ícones (SVG inline, herdam a cor do texto) ----------
const ICONS = {
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    fileText: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    type: '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>',
    idCard: '<rect x="2" y="4" width="20" height="16" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M15 9h3M15 13h3M5.5 17c.6-1.4 1.9-2 3.5-2s2.9.6 3.5 2"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    loader: '<path d="M21 12a9 9 0 1 1-6.22-8.56"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    plus: '<path d="M5 12h14M12 5v14"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z"/><path d="M12 9v4M12 17h.01"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h20a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>'
};

const ico = (nome, cls = 'w-4 h-4') =>
    `<svg class="${cls} shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[nome] || ''}</svg>`;

const CollaboratorService = {
    currentListener: null,
    editId: null,
    ordemAtual: 'grupo',
    gruposPermitidosAta: ['1', '2', '3', '4', 'CRC', 'Coordenadores'],
    LOGO_URL: 'https://firebasestorage.googleapis.com/v0/b/pauta-ce162.firebasestorage.app/o/logo_defensoria%20(1)%20(1).png?alt=media&token=7a4eeaf6-9a96-40b2-8b38-27651627bba7',
    ataAutoSaveTimer: null,

    compararGrupos(a, b) {
        a = String(a ?? '').trim();
        b = String(b ?? '').trim();

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
        if (window.PDFService && typeof window.PDFService.generateCollaboratorsPDF === 'function') {
            window.PDFService.generateCollaboratorsPDF({
                colaboradores: this.ordenarColaboradores(app.colaboradores || []),
                pautaNome: app.currentPauta.name
            });
        } else {
            showNotification("O serviço de PDF não está disponível no momento.", "error");
        }
    },

    // ===================================================================
    // BASE MASTER (PADRÃO MINIMALISTA LIMPO)
    // ===================================================================
    async abrirModalListagemMaster(app) {
        let modal = document.getElementById('master-list-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'master-list-modal';
            modal.className = 'hidden fixed inset-0 bg-slate-900/65 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm';
            modal.innerHTML = `
                <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh] overflow-hidden">
                    <div class="p-6 pb-4 border-b border-slate-100 flex justify-between items-center shrink-0 bg-white">
                        <div>
                            <h3 class="font-bold text-xl text-slate-800">Base Geral de Colaboradores</h3>
                            <p class="text-sm text-slate-500 mt-0.5">Selecione um membro para preenchimento rápido</p>
                        </div>
                        <button data-close class="text-slate-400 hover:text-slate-600 transition-colors bg-slate-100 p-2 rounded-full shadow-sm" aria-label="Fechar">${ico('x', 'w-5 h-5')}</button>
                    </div>
                    <div class="p-4 bg-slate-50 border-b border-slate-200 shrink-0">
                        <div class="relative">
                            <span class="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">${ico('search', 'w-4 h-4')}</span>
                            <input type="text" id="search-master-list" placeholder="Pesquisar por nome, matrícula, cargo ou equipe..." class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 text-sm text-slate-700 bg-white shadow-sm transition-all font-medium">
                        </div>
                        <p id="master-count" class="text-xs text-slate-500 mt-2 ml-1 font-medium"></p>
                    </div>
                    <div class="overflow-y-auto p-4 flex-1 bg-white space-y-2 custom-scrollbar" id="master-list-container"></div>
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
            <div class="flex flex-col items-center justify-center py-12 text-slate-400">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600 mb-3"></div>
                <p class="text-sm font-medium">Carregando colaboradores...</p>
            </div>`;

        try {
            const querySnapshot = await getDocs(collection(app.db, "colaboradores_gerais"));
            if (querySnapshot.empty) {
                container.innerHTML = `
                    <div class="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
                        <div class="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">${ico('inbox', 'w-6 h-6')}</div>
                        <p class="text-sm font-medium">Nenhum colaborador cadastrado na base.</p>
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
                    <div class="master-item-row flex flex-col sm:flex-row justify-between items-start sm:items-center p-3.5 border border-slate-200 hover:border-blue-300 hover:bg-slate-50 rounded-xl cursor-pointer transition-colors group"
                         data-id="${escapeHTML(dados.id)}" data-search="${escapeHTML(searchString)}">
                        <div class="flex-1 mb-2 sm:mb-0">
                            <div class="font-bold text-slate-800 text-sm">${escapeHTML(dados.nome || 'Sem nome')}</div>
                            <div class="text-xs text-slate-500 mt-1 flex flex-wrap gap-2 items-center">
                                <span class="px-2 py-0.5 rounded-md border text-[10px] font-bold ${this.badgeCargo(cargo)}">${escapeHTML(cargo)}</span>
                                <span>${escapeHTML(tipoId)}: <strong class="text-slate-700">${escapeHTML(dados.id)}</strong></span>
                                ${dados.equipe ? `<span class="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md text-[10px] font-bold">${escapeHTML(this.rotuloGrupo(dados.equipe))}</span>` : ''}
                            </div>
                        </div>
                        <button class="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-700 px-4 py-2 rounded-xl font-bold transition-all text-xs shadow-sm">${ico('check')} Preencher</button>
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
                <div class="flex flex-col items-center justify-center py-12 text-red-500 gap-2">
                    <p class="text-sm font-bold">Não foi possível carregar a base. Tente novamente.</p>
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

            const equipe = dados.equipe || '1';
            this.registrarGrupo(equipe);
            this.updateTeamSelect(equipe);

            const rTransp = document.querySelector(`input[name="transporte-colaborador"][value="${dados.transporte || 'Meios Próprios'}"]`);
            if (rTransp) rTransp.checked = true;

            this.configurarLogicaCargo();
            showNotification(`Dados de ${dados.nome} preenchidos!`, "success");
        } catch (e) {
            console.error("Erro ao buscar master:", e);
        }
    },

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
        if (btn) { btn.disabled = true; btn.innerHTML = `${ico('loader', 'w-4 h-4 animate-spin')} Buscando...`; }

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
            showNotification(`${novos.length} membro(s) importado(s) de "${nomeOrigem}"`, "success");
        } catch (error) {
            console.error("Erro ao importar equipe:", error);
            showNotification("Erro ao importar a equipe. Tente novamente.", "error");
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = textoOriginal; }
        }
    },

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
                ? `${ico('folder', 'w-3.5 h-3.5')} Por grupo`
                : `${ico('type', 'w-3.5 h-3.5')} Por nome`;
        }
    },

    copyDashboardLink(nomeColab) {
        if (!window.app || !window.app.currentPauta) return;
        let baseUrl = window.location.href.split('?')[0];
        baseUrl = baseUrl.substring(0, baseUrl.lastIndexOf('/'));
        if (!baseUrl) baseUrl = window.location.origin;

        const link = `${baseUrl}/mesa_digital.html?pautaId=${window.app.currentPauta.id}&colab=${encodeURIComponent(nomeColab)}&view=dashboard`;

        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(link).then(() => {
                showNotification(`Link da mesa de ${nomeColab} copiado!`, "success");
            }).catch(() => { prompt("Copie o link abaixo para enviar:", link); });
        } else {
            prompt("Copie o link abaixo para enviar ao colaborador:", link);
        }
    },

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

    estadoSalvamento(tipo) {
        const indicator = document.getElementById('ata-save-indicator');
        if (!indicator) return;
        const estados = {
            salvando: { cls: 'text-amber-600', html: `${ico('loader', 'w-3.5 h-3.5 animate-spin')} Salvando...` },
            salvo: { cls: 'text-green-600', html: `${ico('check', 'w-3.5 h-3.5')} Salvo` },
            erro: { cls: 'text-red-600', html: `${ico('alert', 'w-3.5 h-3.5')} Erro ao salvar` }
        };
        const e = estados[tipo];
        if (!e) { indicator.innerHTML = ''; return; }
        indicator.className = `inline-flex items-center gap-1 text-xs font-semibold ${e.cls}`;
        indicator.innerHTML = e.html;
    },

    async autoSaveAtaData(app) {
        if (!app?.currentPauta?.id) return;
        if (this.ataAutoSaveTimer) { clearTimeout(this.ataAutoSaveTimer); this.ataAutoSaveTimer = null; }

        const data = this.lerCamposAta();

        try {
            await updateDoc(doc(app.db, "pautas", app.currentPauta.id), data);
            if (app.currentPautaData) app.currentPautaData = { ...app.currentPautaData, ...data };
            this.estadoSalvamento('salvo');
            setTimeout(() => this.estadoSalvamento(null), 2000);
        } catch (error) {
            console.error("Erro ao salvar dados da ata:", error);
            this.estadoSalvamento('erro');
        }
    },

    triggerAutoSave(app) {
        if (!app?.currentPauta?.id) return;
        if (this.ataAutoSaveTimer) clearTimeout(this.ataAutoSaveTimer);

        this.estadoSalvamento('salvando');
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
            showNotification("Dados da ata salvos com sucesso!", "success");
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
                el.oninput = () => this.triggerAutoSave(app);
                el.onchange = () => this.triggerAutoSave(app);
            }
        });
        const btnSave = document.getElementById('save-ata-data-btn');
        if (btnSave) {
            btnSave.onclick = (e) => { e.preventDefault(); this.saveAtaData(app); };
        }
    },

    openModal(app) {
        const modal = document.getElementById('collaborators-modal');
        if (!modal) return;

        modal.classList.remove('hidden');
        this.resetForm();
        this.updateTeamSelect();
        this.configurarLogicaCargo();
        
        document.querySelectorAll('.btn-exportar-pdf-antigo').forEach(el => el.remove());
        
        this.montarBarraFerramentas(app);
        this.bindBotoesEstaticos(app);

        if (app?.currentPauta?.id) {
            this.setupListener(app, app.currentPauta.id);
        }
    },

    montarBarraFerramentas(app) {
        document.getElementById('collab-toolbar')?.remove();
        document.getElementById('toggle-order-btn')?.remove();
        document.getElementById('export-pdf-custom-btn')?.remove();

        const tabela = document.querySelector('#collaborators-list-table-modal');
        if (!tabela) return;

        const btnNeutro = 'inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 font-bold px-3 py-2 rounded-xl text-xs border border-slate-200 shadow-sm transition-colors';

        const bar = document.createElement('div');
        bar.id = 'collab-toolbar';
        bar.className = 'mb-4 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden';
        bar.innerHTML = `
            <div class="flex flex-wrap items-center gap-2 p-3.5 border-b border-slate-100 bg-slate-50/50">
                <span class="text-xs font-bold text-slate-700 uppercase tracking-wider mr-auto flex items-center gap-2">Organização da Equipe</span>
                <button id="copy-pauta-id-btn" class="${btnNeutro}" title="Copie para colar em outra pauta">${ico('idCard', 'w-3.5 h-3.5')} Copiar ID desta pauta</button>
                <button id="toggle-order-btn" class="${btnNeutro}"></button>
                <button id="export-pdf-custom-btn" class="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold px-3.5 py-2 rounded-xl text-xs shadow-sm transition-colors">${ico('fileText', 'w-3.5 h-3.5')} Configurar Relatório</button>
            </div>
            <div class="p-3.5">
                <label for="import-pauta-id-input" class="block text-xs font-bold text-slate-600 mb-1.5">Copiar equipe de outra pauta <span class="font-normal text-slate-400">(na pauta antiga, use "Copiar ID desta pauta")</span></label>
                <div class="flex flex-col sm:flex-row gap-2">
                    <input id="import-pauta-id-input" type="text" autocomplete="off"
                        placeholder="Cole aqui o ID da pauta de origem"
                        class="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 text-sm text-slate-700 bg-slate-50 focus:bg-white transition-all font-medium">
                    <button id="import-pauta-btn" class="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs shadow-sm transition-colors whitespace-nowrap">${ico('download')} Importar equipe</button>
                </div>
                <label class="mt-2.5 inline-flex items-center gap-2 text-xs text-slate-500 cursor-pointer font-medium">
                    <input type="checkbox" id="import-replace-check" class="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500">
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
                    .then(() => showNotification("ID da pauta copiado!", "success"))
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
            const clone = btnBuscar.cloneNode(true); 
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
            + `<option value="ADD_NEW">+ Adicionar outro grupo...</option>`
            + `<option value="REMOVE_GROUP">− Remover um grupo criado...</option>`;

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
                const remover = prompt("Digite o nome EXATO do grupo que deseja excluir:\n\nGrupos atuais: " + this.gruposPermitidosAta.join(", "))?.trim();

                if (remover) {
                    const index = this.gruposPermitidosAta.findIndex(g => g.toLowerCase() === remover.toLowerCase());
                    if (index !== -1) {
                        this.gruposPermitidosAta.splice(index, 1);
                        showNotification(`Grupo "${remover}" excluído com sucesso!`, "success");
                    } else {
                        showNotification(`Grupo "${remover}" não encontrado.`, "warning");
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

            let mudou = false;
            app.colaboradores.forEach(c => { if (this.registrarGrupo(c.equipe)) mudou = true; });
            if (mudou && this.editId === null) {
                const sel = document.getElementById('collaborator-team-modal');
                this.updateTeamSelect(sel?.value && sel.value !== 'ADD_NEW' && sel.value !== 'REMOVE_GROUP' ? sel.value : '1');
            }

            this.renderTable(app);
        });
    },

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
                    <div class="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center">${ico('users', 'w-6 h-6')}</div>
                    <p class="font-bold text-slate-700 text-sm">Nenhum membro na equipe ainda</p>
                    <p class="text-xs text-slate-400 mt-1">Cadastre pelo formulário ou importe de outra pauta.</p>
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
                        <td colspan="5" class="px-3.5 py-2.5 bg-slate-100 border-y border-slate-200">
                            <div class="flex items-center justify-between gap-2">
                                <span class="font-bold text-slate-800 text-xs flex items-center gap-1.5 uppercase tracking-wide">${escapeHTML(nomeGrupo)}</span>
                                <span class="flex gap-1.5">
                                    <span class="bg-white text-slate-700 border border-slate-200 px-2 py-0.5 rounded-md text-[10px] font-bold">${r.total} membro${r.total === 1 ? '' : 's'}</span>
                                    <span class="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-md text-[10px] font-bold">${r.presentes} presente${r.presentes === 1 ? '' : 's'}</span>
                                </span>
                            </div>
                        </td>
                    </tr>`);
            }

            const presente = !!colab.presente;
            const nomeSafe = escapeHTML(colab.nome);

            html.push(`
                <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors" data-row-id="${colab.id}">
                    <td class="p-3">
                        <div class="flex items-center gap-3 min-w-0">
                            <div class="shrink-0 w-8 h-8 rounded-full ${presente ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'} flex items-center justify-center text-xs font-black">${escapeHTML(this.iniciais(colab.nome))}</div>
                            <div class="min-w-0">
                                <div class="font-bold text-sm text-slate-800 truncate max-w-[150px] sm:max-w-xs">${nomeSafe}</div>
                                <div class="text-[10px] text-slate-400 mt-0.5">${escapeHTML(colab.tipo_id || 'ID')}: ${escapeHTML(colab.identificador || '-')}</div>
                                <span class="md:hidden inline-block mt-1 px-1.5 py-0.5 rounded border text-[9px] font-bold ${this.badgeCargo(colab.cargo)}">${escapeHTML(colab.cargo)}</span>
                            </div>
                        </div>
                    </td>
                    <td class="p-3 text-center align-middle">
                        <label class="relative inline-block w-11 h-6 cursor-pointer select-none" title="${presente ? 'Presente' : 'Ausente'}">
                            <input type="checkbox" class="checkin-checkbox sr-only peer" data-id="${colab.id}" ${presente ? 'checked' : ''}>
                            <span class="absolute inset-0 rounded-full bg-slate-300 peer-checked:bg-emerald-500 transition-colors"></span>
                            <span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5"></span>
                        </label>
                    </td>
                    <td class="p-3 hidden md:table-cell">
                        <span class="px-2 py-1 rounded-md border text-[11px] font-bold ${this.badgeCargo(colab.cargo)}">${escapeHTML(colab.cargo)}</span>
                    </td>
                    <td class="p-3 text-center text-xs font-bold tabular-nums ${presente ? 'text-emerald-600' : 'text-slate-300'}">${escapeHTML(colab.horario || '--:--')}</td>
                    <td class="p-3">
                        <div class="flex justify-center gap-1.5">
                            <button data-action="link" data-nome="${nomeSafe}" class="text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 bg-slate-100 p-2 rounded-lg transition-colors" title="Copiar link da mesa" aria-label="Copiar link da mesa">${ico('link')}</button>
                            <button data-action="edit" data-id="${colab.id}" class="text-slate-600 hover:text-blue-600 hover:bg-blue-50 bg-slate-100 p-2 rounded-lg transition-colors" title="Editar" aria-label="Editar">${ico('pencil')}</button>
                            <button data-action="delete" data-id="${colab.id}" class="text-slate-600 hover:text-red-600 hover:bg-red-50 bg-slate-100 p-2 rounded-lg transition-colors" title="Excluir" aria-label="Excluir">${ico('trash')}</button>
                        </div>
                    </td>
                </tr>`);
        });

        tbody.innerHTML = html.join('');

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
        style.innerHTML = `
            .checkin-checkbox:focus-visible + span { outline: 2px solid #3b82f6; outline-offset: 2px; }
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
            btnSubmit.innerHTML = `${ico('save', 'w-4 h-4')} Atualizar cadastro`;
            btnSubmit.className = "w-full inline-flex items-center justify-center gap-2 bg-slate-800 text-white font-bold py-3 rounded-xl hover:bg-slate-900 transition shadow-sm text-sm";
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
                <div style="text-align: center; margin-bottom: 20px; padding: 10px; border-bottom: 2px solid #334155;">
                    <img src="${this.LOGO_URL}" alt="Logo Defensoria" style="max-height: 80px; width: auto; margin: 0 auto; display: block;" onerror="this.style.display='none'">
                    <h3 style="margin-top: 10px; color: #1e293b;">LISTA DE PRESENÇA - SIGEP</h3>
                    <p style="font-size: 12px; color: #64748b;">Sistema Integrado de Gestão de Pautas</p>
                </div>
                <table border="1" style="width:100%; border-collapse: collapse; font-size: 12px;">
                    <thead>
                        <tr style="background-color: #334155; color: white;">
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
                <div style="margin-top: 15px; font-size: 10px; text-align: center; color: #64748b; border-top: 1px solid #cbd5e1; padding-top: 10px;">
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
            btnSubmit.innerHTML = `${ico('plus', 'w-4 h-4')} Adicionar à equipe`;
            btnSubmit.className = "w-full inline-flex items-center justify-center gap-2 bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition shadow-sm text-sm";
        }
        this.configurarLogicaCargo();
    }
};

export default CollaboratorService;
window.CollaboratorService = CollaboratorService;
