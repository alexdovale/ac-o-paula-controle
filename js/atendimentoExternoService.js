import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    getFirestore, doc, getDoc, updateDoc, collection,
    getDocs, arrayUnion, onSnapshot, query, where
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { firebaseConfig } from './config.js';
import { documentsData } from './detalhes.js';
import { EmailService } from './emailService.js';
import { showNotification, playSound, escapeHTML } from './utils.js';
import { ico } from './icons.js';

const statusMap = {
    pauta:                  { cor: 'text-slate-600 border-slate-200 bg-slate-50',    txt: 'Na Pauta' },
    aguardando:             { cor: 'text-amber-700 border-amber-200 bg-amber-50',     txt: 'Espera' },
    emAtendimento:          { cor: 'text-blue-700 border-blue-200 bg-blue-50',        txt: 'Atendendo' },
    aguardandoDistribuicao: { cor: 'text-cyan-700 border-cyan-200 bg-cyan-50',        txt: 'No Defensor' },
    aguardandoCorrecao:     { cor: 'text-orange-700 border-orange-200 bg-orange-50',  txt: 'Avaliação' },
    atendido:               { cor: 'text-emerald-700 border-emerald-200 bg-emerald-50',txt: 'Concluído' },
    aguardandoNumero:       { cor: 'text-indigo-700 border-indigo-200 bg-indigo-50',  txt: 'Aguard. CNP' },
    faltoso:                { cor: 'text-red-700 border-red-200 bg-red-50',           txt: 'Faltoso' },
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export const AtendimentoExternoService = {
    pautaId: null,
    pautaNome: 'Pauta',
    pautaFechada: false, 
    assistidoId: null,
    colaboradorNome: null,
    colaboradorId: null,
    colaboradorAtual: null,
    isProcessing: false,
    todosAtendimentosPauta: [],
    demandasAdicionaisLocais: [],
    unsubscribeDashboard: null,
    unsubscribePauta: null,

    async init() {
        console.log("Mesa Digital: Sincronização Kanban Ativa");

        const urlParams = new URLSearchParams(window.location.search.replace(/&amp;/g, '&'));
        this.pautaId       = urlParams.get('pautaId') || urlParams.get('pid');
        this.assistidoId   = urlParams.get('assistidoId') || urlParams.get('aid');
        const tokenRecebido= urlParams.get('token');

        if (!this.pautaId) return this.showError("Link Incompleto", "Falta o identificador da pauta na URL.");

        try {
            const user = auth.currentUser;
            if (!user) return this.showError("Acesso Negado", "Sessão expirada. Faça login novamente.");

            const pautaDoc = await getDoc(doc(db, "pautas", this.pautaId));
            if (!pautaDoc.exists()) return this.showError("Pauta não localizada", "A pauta não existe mais.");
            
            const pautaData = pautaDoc.data();
            this.pautaNome = pautaData.name || 'Pauta';
            this.pautaFechada = pautaData.fechada === true;

            const snap = await getDocs(query(collection(db, "pautas", this.pautaId, "collaborators"), where("email", "==", user.email)));
            if (snap.empty) return this.showError("Acesso Negado", "Seu usuário não está vinculado a esta pauta.");

            this.colaboradorAtual = { id: snap.docs[0].id, ...snap.docs[0].data() };
            this.colaboradorNome = this.colaboradorAtual.nome;
            this.colaboradorId = this.colaboradorAtual.id;

            await this.carregarColaboradoresGerais();

            if (this.assistidoId) {
                await this.iniciarAtendimentoIndividual(tokenRecebido, pautaData);
            } else {
                await this.iniciarDashboardKanban();
            }

        } catch (error) {
            console.error("Erro na inicialização:", error);
            this.showError("Erro de Conexão", "Falha ao conectar com o banco de dados.");
        }
    },

    async iniciarDashboardKanban() {
        this._cancelarListeners();
        
        const shell = document.getElementById('shell-atendimento');
        if (shell) shell.classList.remove('hidden');

        this.unsubscribePauta = onSnapshot(doc(db, "pautas", this.pautaId), (snap) => {
            if (snap.exists()) {
                this.pautaFechada = snap.data().fechada === true;
                this.renderizarKanban();
            }
        });

        this.unsubscribeDashboard = onSnapshot(collection(db, "pautas", this.pautaId, "attendances"), (snap) => {
            this.todosAtendimentosPauta = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            this.renderizarKanban();
        });

        this.prepararFiltroKanban();
    },

    async iniciarAtendimentoIndividual(tokenRecebido, pautaData) {
        this._cancelarListeners();

        const shell = document.getElementById('shell-atendimento');
        if (shell) shell.classList.remove('hidden');

        const docSnap = await getDoc(doc(db, "pautas", this.pautaId, "attendances", this.assistidoId));
        if (!docSnap.exists()) return this.showError("Processo não encontrado", "Este assistido não está na pauta.");

        const assistido = docSnap.data();
        this.assistidoData = assistido;
        this.demandasAdicionaisLocais = assistido.demandas?.descricoes ? [...assistido.demandas.descricoes] : [];

        this.renderizarSplitScreen(assistido, pautaData);
    },

    _cancelarListeners() {
        if (this.unsubscribeDashboard) { this.unsubscribeDashboard(); this.unsubscribeDashboard = null; }
        if (this.unsubscribePauta) { this.unsubscribePauta(); this.unsubscribePauta = null; }
    },

    async carregarColaboradoresGerais() {
        try {
            const snap = await getDocs(collection(db, "pautas", this.pautaId, "collaborators"));
            this.todosColaboradores = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch { this.todosColaboradores = []; }
    },

    _gerarTokenSeguro() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID().substring(0, 8);
        return Math.random().toString(36).substring(2, 10) + Date.now().toString(36).substring(4);
    },

    showError(titulo, message) {
        const shell = document.getElementById('shell-atendimento');
        if (shell) shell.classList.add('hidden');
        document.getElementById('main-wrapper').innerHTML = `
            <div class="w-full max-w-md mx-auto my-auto p-6 bg-white rounded-3xl shadow-xl text-center border border-slate-200 mt-20">
                <span class="text-5xl block mb-4">🔒</span>
                <h2 class="text-lg font-black text-slate-800 uppercase mb-2">${titulo}</h2>
                <p class="text-xs text-slate-500 font-semibold mb-6">${message}</p>
                <button onclick="window.location.href = window.location.pathname" class="w-full bg-slate-900 text-white font-black py-3.5 rounded-xl uppercase tracking-widest text-xs">Voltar</button>
            </div>`;
    },

    // ─── RENDERIZAÇÃO DO KANBAN ───────────────────────────────────────────────

    renderizarKanban() {
        const viewDashboard = document.getElementById('view-dashboard');
        const viewAtendimento = document.getElementById('view-atendimento');
        if (viewDashboard) { viewDashboard.classList.remove('hidden'); viewDashboard.classList.add('flex'); }
        if (viewAtendimento) { viewAtendimento.classList.add('hidden'); viewAtendimento.classList.remove('flex'); }

        const url = new URL(window.location.href);
        url.searchParams.delete('assistidoId');
        window.history.pushState({}, '', url);

        // Separação correta nas 3 colunas do seu HTML
        const espera = this.todosAtendimentosPauta.filter(a => a.status === 'aguardando');
        const mesa = this.todosAtendimentosPauta.filter(a => a.status === 'emAtendimento' && a.assignedCollaborator?.name === this.colaboradorNome);
        const auditoria = this.todosAtendimentosPauta.filter(a => ['atendido', 'aguardandoNumero', 'aguardandoDistribuicao', 'aguardandoCorrecao'].includes(a.status));

        espera.sort((a,b) => (a.checkInOrder || 0) - (b.checkInOrder || 0));
        mesa.sort((a,b) => new Date(b.inAttendanceTime || 0) - new Date(a.inAttendanceTime || 0));
        auditoria.sort((a,b) => new Date(b.attendedAt || b.inAttendanceTime || 0) - new Date(a.attendedAt || a.inAttendanceTime || 0));

        this._injetarCardsColuna('kanban-espera', 'count-espera', espera, 'puxar', 'Ninguém na fila.');
        this._injetarCardsColuna('kanban-mesa', 'count-mesa', mesa, 'mesa', 'Sua mesa está limpa.');
        this._injetarCardsColuna('kanban-auditoria', 'count-auditoria', auditoria, 'auditoria', 'Nenhum concluído.');

        this._setupAcoesCards();
    },

    prepararFiltroKanban() {
        const searchInput = document.getElementById('kanban-search');
        if (!searchInput) return;
        searchInput.addEventListener('input', (e) => {
            const termo = e.target.value.toLowerCase().trim();
            document.querySelectorAll('.kanban-card').forEach(card => {
                card.style.display = card.textContent.toLowerCase().includes(termo) ? '' : 'none';
            });
        });
    },

    _injetarCardsColuna(colunaId, countId, lista, modo, msgVazio) {
        const container = document.getElementById(colunaId);
        const count = document.getElementById(countId);
        if (!container || !count) return;

        count.textContent = lista.length;

        if (lista.length === 0) {
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center py-10 opacity-50">
                    <span class="text-3xl text-slate-300 mb-2">📥</span>
                    <p class="text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">${msgVazio}</p>
                </div>
            `;
            return;
        }

        container.innerHTML = lista.map(item => this._htmlCardKanban(item, modo)).join('');
    },

    _htmlCardKanban(assistido, modo) {
        const st = statusMap[assistido.status] || { cor: 'text-slate-600 border-slate-200 bg-slate-50', txt: assistido.status };
        const urgencia = assistido.priority === 'URGENTE' ? 'border-l-4 border-l-red-500' : '';
        const baseUrl = window.location.href.split('?')[0];
        const linkIndividual = `${baseUrl}?pautaId=${this.pautaId}&assistidoId=${assistido.id}`;

        let botoesHtml = '';
        if (this.pautaFechada) {
            botoesHtml = `<div class="mt-3 text-center py-2 bg-slate-100 rounded-lg text-[9px] font-black text-slate-400 uppercase tracking-widest">Pauta Encerrada</div>`;
        } else {
            if (modo === 'puxar') {
                botoesHtml = `<a href="${linkIndividual}" class="block mt-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-[10px] uppercase tracking-widest py-2.5 rounded-xl transition text-center shadow-sm active:scale-95">Atender</a>`;
            } else if (modo === 'mesa') {
                botoesHtml = `
                    <div class="flex gap-2 mt-3">
                        <a href="${linkIndividual}" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] uppercase tracking-widest py-2.5 rounded-xl transition text-center shadow-sm active:scale-95">Abrir</a>
                        <button class="btn-devolver-caso flex-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-black text-[10px] uppercase tracking-widest py-2.5 rounded-xl transition shadow-sm active:scale-95" data-pauta-id="${this.pautaId}" data-assistido-id="${assistido.id}">Devolver</button>
                    </div>`;
            } else {
                botoesHtml = `<a href="${linkIndividual}" class="block mt-3 bg-slate-800 hover:bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest py-2 rounded-lg transition text-center shadow-sm active:scale-95">Ver Processo</a>`;
            }
        }

        return `
            <div class="kanban-card bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col hover:shadow-md transition-shadow ${urgencia}">
                <div class="flex justify-between items-start mb-2 gap-2">
                    <h4 class="font-black text-slate-800 text-sm leading-tight line-clamp-2">${escapeHTML(assistido.name)}</h4>
                </div>
                <div class="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 mb-2 truncate">
                    <span class="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0"></span> ${escapeHTML(assistido.subject || 'Sem assunto')}
                </div>
                <div class="flex justify-between items-center mt-auto pt-2 border-t border-slate-100">
                    <span class="text-[9px] font-black px-2 py-1 rounded-md border ${st.cor} uppercase tracking-widest">${st.txt}</span>
                    ${assistido.numeroProcesso ? `<span class="font-mono text-[9px] font-bold text-slate-400">CNP: ${escapeHTML(assistido.numeroProcesso)}</span>` : ''}
                </div>
                ${botoesHtml}
            </div>
        `;
    },

    _setupAcoesCards() {
        document.querySelectorAll('.btn-devolver-caso').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const b = e.currentTarget;
                if (!confirm("Devolver este caso para a Fila de Espera?")) return;
                try {
                    await updateDoc(doc(db, "pautas", b.dataset.pautaId, "attendances", b.dataset.assistidoId), {
                        status: 'aguardando', assignedCollaborator: null, inAttendanceTime: null,
                        history: arrayUnion({ action: 'DEVOLVIDO_PARA_FILA', by: this.colaboradorNome, msg: `Devolvido por ${this.colaboradorNome}`, at: new Date().toISOString() })
                    });
                    if (this.colaboradorAtual?.id) {
                        await updateDoc(doc(db, "pautas", this.pautaId, "collaborators", this.colaboradorAtual.id), { status: 'disponivel', currentAttendance: null }).catch(() => {});
                    }
                    if (typeof showNotification === 'function') showNotification("Caso devolvido.", "info");
                } catch (error) {
                    alert("Erro ao devolver caso.");
                }
            });
        });
    },

    // ─── TELA INDIVIDUAL (SPLIT-SCREEN) ──────────────────────────────────────

    renderizarSplitScreen(assistido, pautaData) {
        const viewDashboard = document.getElementById('view-dashboard');
        const viewAtendimento = document.getElementById('view-atendimento');
        if (viewDashboard) { viewDashboard.classList.add('hidden'); viewDashboard.classList.remove('flex'); }
        if (viewAtendimento) { viewAtendimento.classList.remove('hidden'); viewAtendimento.classList.add('flex'); }

        const baseUrl = window.location.href.split('?')[0];
        window.history.pushState({}, '', `${baseUrl}?pautaId=${this.pautaId}&assistidoId=${assistido.id}`);

        document.getElementById('assistido-nome').textContent = assistido.name || 'Assistido';
        document.getElementById('assistido-assunto').textContent = assistido.subject || 'Sem assunto';
        
        document.getElementById('btn-voltar-portal').onclick = () => {
            this.assistidoId = null;
            this.assistidoData = null;
            this.renderizarKanban();
        };

        this._renderizarHistoricoLadoEsquerdo(assistido);

        if (this.pautaFechada) {
            this._renderizarPainelFechado();
        } else if (['atendido', 'aguardandoNumero'].includes(assistido.status)) {
            this._renderizarPainelFinalizado(assistido);
        } else {
            this._renderizarPainelAcoes(assistido, pautaData);
        }
    },

    _renderizarHistoricoLadoEsquerdo(assistido) {
        const container = document.getElementById('aba-historico');
        if (!container) return;

        let html = '';
        if (assistido.historicoTransferencia) {
            html += `
                <div class="w-full bg-blue-50 border border-blue-200 p-4 rounded-xl shadow-sm mb-6 flex items-start gap-4">
                    <div class="bg-blue-100 p-2 rounded-lg text-blue-600">🔄</div>
                    <div>
                        <p class="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-1">Última Movimentação</p>
                        <p class="text-xs font-bold text-slate-700">${escapeHTML(assistido.historicoTransferencia)}</p>
                    </div>
                </div>`;
        }

        const chk = assistido.documentChecklist || {};
        const baseDeDados = documentsData || window.documentsData || {};
        
        if (!chk.action) {
            html += `<div class="text-center py-20 bg-slate-50 border border-slate-200 rounded-2xl"><span class="text-4xl block mb-2">📁</span><p class="text-xs font-bold uppercase tracking-widest text-slate-500">Nenhum checklist da recepção registado.</p></div>`;
        } else {
            const actionData = baseDeDados[chk.action];
            const actionTitle = actionData ? actionData.title : chk.action.replace(/_/g, ' ').toUpperCase();
            
            html += `
                <div class="bg-slate-900 p-5 rounded-2xl mb-6 shadow-md text-white">
                    <p class="text-[10px] text-blue-400 font-black uppercase tracking-widest mb-1">Ação Principal</p>
                    <p class="text-base font-black uppercase">${actionTitle}</p>
                </div>`;

            if (chk.socioData) {
                const s = chk.socioData;
                let socioHtml = '';
                const addL = (lbl, val) => { if (val && val !== 'Selecione' && val !== 'R$ 0,00') socioHtml += `<div class="flex justify-between py-2 border-b border-slate-100 text-xs"><span class="font-black text-slate-400">${lbl}</span><span class="font-bold text-slate-700">${escapeHTML(val)}</span></div>`; };
                addL('Ocupação', s.ocupacao); addL('Profissão', s.profissao); addL('Estado Civil', s.estadoCivil); addL('Renda', s.ganhos);
                if (socioHtml) html += `<div class="bg-white p-5 rounded-2xl mb-6 border border-slate-200 shadow-sm"><h4 class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Perfil Socioeconômico</h4>${socioHtml}</div>`;
            }

            if (chk.checkedIds && chk.checkedIds.length > 0) {
                html += `<div class="bg-white p-5 rounded-2xl mb-6 border border-slate-200 shadow-sm"><h4 class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Documentos Recolhidos</h4><ul class="space-y-2">`;
                chk.checkedIds.forEach(id => {
                    if (id.startsWith('reu-') || id.startsWith('gasto-')) return;
                    let docName = id.replace(/-/g, ' ').toUpperCase();
                    if (actionData && id.startsWith('doc-')) {
                        const parts = id.split('-');
                        const dIdx = parseInt(parts.pop());
                        const sIdx = parseInt(parts.pop());
                        if (!isNaN(sIdx) && !isNaN(dIdx) && actionData.sections[sIdx]) {
                            const docObj = actionData.sections[sIdx].docs[dIdx];
                            if (docObj) docName = typeof docObj === 'string' ? docObj : docObj.text;
                        }
                    }
                    html += `<li class="text-xs bg-slate-50 p-2.5 rounded-xl flex justify-between items-center"><span class="font-bold text-slate-700">✓ ${docName}</span></li>`;
                });
                html += `</ul></div>`;
            }
        }
        container.innerHTML = html;
    },

    _renderizarPainelFechado() {
        document.getElementById('aba-encerramento').innerHTML = `<div class="text-center p-6 bg-red-50 rounded-2xl border border-red-200 mt-4"><h2 class="text-lg font-black text-red-800 uppercase mb-2">Pauta Fechada</h2><p class="text-xs font-bold text-red-700">Modo leitura ativado.</p></div>`;
    },

    _renderizarPainelFinalizado(assistido) {
        document.getElementById('aba-encerramento').innerHTML = `
            <div class="text-center p-6 bg-emerald-50 rounded-2xl border border-emerald-200 mt-4 mb-4">
                <h2 class="text-lg font-black text-emerald-800 uppercase mb-2">Protocolo Concluído</h2>
                <p class="text-xs font-bold text-emerald-700">Por ${escapeHTML(assistido.attendedBy || 'Servidor')}</p>
                ${assistido.numeroProcesso ? `<div class="mt-3"><span class="bg-white px-3 py-1.5 rounded border border-emerald-300 font-mono text-xs font-bold">CNP: ${escapeHTML(assistido.numeroProcesso)}</span></div>` : ''}
            </div>`;
    },

    _renderizarPainelAcoes(assistido, pautaData) {
        const aba = document.getElementById('aba-encerramento');
        const isDefensor = this.colaboradorAtual?.cargo?.toLowerCase().includes('defensor');

        aba.innerHTML = `
            <div class="space-y-4">
                <div>
                    <label class="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Nº CNP / Processo</label>
                    <input type="text" id="input-numero-caso" value="${assistido.numeroProcesso || ''}" class="w-full p-3 border border-slate-200 rounded-xl text-xs bg-slate-50 font-mono outline-none focus:bg-white" placeholder="Ex: 1045239">
                </div>
                <button id="btn-finalizar-dinamico" class="w-full bg-slate-900 text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest shadow-lg active:scale-95">Finalizar Protocolo</button>
            </div>
        `;

        document.getElementById('btn-finalizar-dinamico').onclick = async () => {
            const num = document.getElementById('input-numero-caso').value.trim();
            await updateDoc(doc(db, "pautas", this.pautaId, "attendances", assistido.id), {
                status: 'atendido',
                attendedBy: this.colaboradorNome,
                numeroProcesso: num,
                attendedAt: new Date().toISOString()
            });
            showNotification("Atendimento concluído!", "success");
            this.renderizarKanban();
        };
    }
};

export default AtendimentoExternoService;
window.AtendimentoExternoService = AtendimentoExternoService;
