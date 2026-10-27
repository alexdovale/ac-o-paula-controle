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
    pautaTipo: '',
    pautaFechada: false, 
    assistidoId: null,
    colaboradorNome: null,
    colaboradorId: null,
    fluxoSelecionado: null,
    assistidoData: null,
    todosColaboradores: [],
    colaboradorAtual: null,
    isProcessing: false,
    todosAtendimentosPauta: [],
    demandasAdicionaisLocais: [],
    unsubscribeDashboard: null,
    unsubscribePauta: null,

    async init() {
        console.log("Mesa Digital V3 Inicializada (Identidade Segura)");

        const urlParams = new URLSearchParams(window.location.search.replace(/&amp;/g, '&'));
        this.pautaId       = urlParams.get('pautaId') || urlParams.get('pid');
        this.assistidoId   = urlParams.get('assistidoId') || urlParams.get('aid');
        const tokenRecebido= urlParams.get('token');

        if (!this.pautaId) {
            this.showError("Link Incompleto", "Falta o identificador da pauta na URL.");
            return;
        }

        try {
            const user = auth.currentUser;
            if (!user) {
                this.showError("Acesso Negado", "Sessão expirada. Volte e faça login novamente.");
                return;
            }

            const pautaDoc = await getDoc(doc(db, "pautas", this.pautaId));
            if (!pautaDoc.exists()) {
                this.showError("Pauta não localizada", "A pauta informada não existe mais.");
                return;
            }
            const pautaData = pautaDoc.data();
            this.pautaNome = pautaData.name || 'Pauta';
            this.pautaTipo = pautaData.type || 'agendamento';
            this.pautaFechada = pautaData.fechada === true;

            // O CRUZAMENTO DE DADOS ACONTECE AQUI (Ignorando o que vem no link)
            const colabRef = collection(db, "pautas", this.pautaId, "collaborators");
            const q = query(colabRef, where("email", "==", user.email));
            const snap = await getDocs(q);

            if (snap.empty) {
                this.showError("Acesso Negado", "Seu usuário não foi convidado para esta pauta.");
                return;
            }

            this.colaboradorAtual = { id: snap.docs[0].id, ...snap.docs[0].data() };
            this.colaboradorNome = this.colaboradorAtual.nome; // Nome real puxado do banco!
            this.colaboradorId = this.colaboradorAtual.id;

            await this.carregarColaboradoresGerais();

            if (this.assistidoId) {
                await this.iniciarAtendimentoIndividual(tokenRecebido, pautaData);
                return;
            }

            await this.iniciarDashboardKanban();

        } catch (error) {
            console.error("Erro na inicialização:", error);
            this.showError("Conexão Perdida", "Falha ao conectar com o banco de dados.");
        }
    },

    async iniciarDashboardKanban() {
        this._cancelarListeners();
        
        this.unsubscribePauta = onSnapshot(doc(db, "pautas", this.pautaId), (snap) => {
            if (snap.exists()) {
                const fechou = snap.data().fechada === true;
                if (fechou !== this.pautaFechada) {
                    this.pautaFechada = fechou;
                    this.renderizarKanban();
                }
            }
        });

        this.unsubscribeDashboard = onSnapshot(collection(db, "pautas", this.pautaId, "attendances"), (snap) => {
            this.todosAtendimentosPauta = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            this.atualizarBadgeHeader();
            this.renderizarKanban();
        });

        this.prepararFiltroKanban();
    },

    async iniciarAtendimentoIndividual(tokenRecebido, pautaData) {
        this._cancelarListeners();

        this.unsubscribePauta = onSnapshot(doc(db, "pautas", this.pautaId), (snap) => {
            if(snap.exists()) {
                this.pautaFechada = snap.data().fechada === true;
                if(this.pautaFechada) this.renderizarSplitScreen(this.assistidoData, pautaData);
            }
        });

        const docSnap = await getDoc(doc(db, "pautas", this.pautaId, "attendances", this.assistidoId));
        if (!docSnap.exists()) {
            this.showError("Processo não encontrado", "Este assistido não está mais na pauta.");
            return;
        }

        const assistido = docSnap.data();
        this.assistidoData = assistido;
        this.demandasAdicionaisLocais = assistido.demandas?.descricoes ? [...assistido.demandas.descricoes] : [];

        if (assistido.delegationToken && assistido.delegationToken !== tokenRecebido) {
            this.showError("Acesso Seguro", "O token de segurança é inválido ou expirou.");
            return;
        }

        this.renderizarSplitScreen(assistido, pautaData);
        this.atualizarBadgeHeader();
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
        
        const wrapper = document.getElementById('main-wrapper');
        wrapper.innerHTML = `
            <div class="w-full max-w-lg mx-auto my-auto animate-fade-in">
                <div class="bg-red-600 p-6 rounded-t-3xl shadow-xl flex flex-col items-center justify-center">
                    <h1 class="text-white font-black text-2xl uppercase tracking-widest text-center">Acesso Negado</h1>
                </div>
                <div class="p-8 text-center bg-white rounded-b-3xl shadow-xl border border-gray-200">
                    <span class="text-6xl block mb-6 text-red-400">${ico('lock', 'w-16 h-16 inline-block')}</span>
                    <h2 class="text-lg font-black text-gray-800 uppercase tracking-wide mb-2">${titulo}</h2>
                    <p class="text-gray-500 font-semibold text-sm">${message}</p>
                    <button onclick="window.location.href = window.location.pathname" class="mt-8 w-full bg-slate-800 text-white font-black px-6 py-4 rounded-xl hover:bg-slate-900 transition-colors uppercase tracking-widest text-sm shadow-md active:scale-95">VOLTAR</button>
                </div>
            </div>`;
    },

    atualizarBadgeHeader() {
        const badge = document.getElementById('status-indicator');
        if (!badge) return;

        const isNaTelaIndividual = !!this.assistidoId;
        const meusCasos = this.todosAtendimentosPauta.filter(a =>
            a.status === 'emAtendimento' && a.assignedCollaborator?.name === this.colaboradorNome
        );

        const livre = meusCasos.length === 0 && !isNaTelaIndividual;

        badge.innerHTML = livre 
            ? `<span class="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span> <span class="hidden sm:inline">LIVRE</span>`
            : `<span class="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span> <span class="hidden sm:inline">OCUPADO</span>`;
        
        badge.className = `bg-white border ${livre ? 'text-emerald-700 border-emerald-200' : 'text-amber-700 border-amber-200'} text-[9px] sm:text-[10px] font-black px-3 sm:px-4 py-2 rounded-lg shadow-sm uppercase tracking-widest flex items-center gap-2 transition-colors`;

        if (this.colaboradorAtual?.id && this.colaboradorAtual.id !== 'manual') {
            const novoStatus = livre ? 'disponivel' : 'ocupado';
            if (this.colaboradorAtual.status !== novoStatus) {
                this.colaboradorAtual.status = novoStatus; 
                updateDoc(doc(db, "pautas", this.pautaId, "collaborators", this.colaboradorAtual.id), { status: novoStatus }).catch(()=>{});
            }
        }
    },

    // ─── RENDERIZAÇÃO: KANBAN (VISÃO GERAL) ───────────────────────────────────

    renderizarKanban() {
        document.getElementById('view-dashboard').classList.remove('hidden');
        document.getElementById('view-dashboard').classList.add('flex');
        document.getElementById('view-atendimento').classList.add('hidden');
        document.getElementById('view-atendimento').classList.remove('flex');
        
        const url = new URL(window.location.href);
        url.searchParams.delete('assistidoId');
        window.history.pushState({}, '', url);

        const isDefensor = this.colaboradorAtual?.cargo?.toLowerCase().includes('defensor') === true;

        // FILA DE ESPERA (Todos veem)
        const espera = this.todosAtendimentosPauta.filter(a => a.status === 'aguardando');
        
        // MINHA MESA
        const mesa = this.todosAtendimentosPauta.filter(a => a.status === 'emAtendimento' && a.assignedCollaborator?.name === this.colaboradorNome);
        
        // AUDITORIA (Se Defensor vê tudo finalizado/transferido. Se Servidor vê o que ele enviou/finalizou)
        const auditoria = this.todosAtendimentosPauta.filter(a => {
            const finalizado = ['atendido', 'aguardandoNumero', 'aguardandoDistribuicao', 'aguardandoCorrecao'].includes(a.status);
            if (!finalizado) return false;
            if (isDefensor) return true;
            return a.enviadoPor === this.colaboradorNome || a.attendedBy === this.colaboradorNome;
        });

        // Ordenação Básica
        espera.sort((a,b) => (a.checkInOrder || 0) - (b.checkInOrder || 0));
        mesa.sort((a,b) => new Date(b.inAttendanceTime || 0) - new Date(a.inAttendanceTime || 0));
        auditoria.sort((a,b) => new Date(b.attendedAt || b.inAttendanceTime || 0) - new Date(a.attendedAt || a.inAttendanceTime || 0));

        this._injetarCardsColuna('kanban-espera', 'count-espera', espera, 'puxar', 'Ninguém na fila.');
        this._injetarCardsColuna('kanban-mesa', 'count-mesa', mesa, 'mesa', 'Sua mesa está limpa.');
        this._injetarCardsColuna('kanban-auditoria', 'count-auditoria', auditoria, 'auditoria', 'Nenhum processo concluído.');

        this._setupAcoesCards();
    },

    prepararFiltroKanban() {
        const searchInput = document.getElementById('kanban-search');
        if (!searchInput) return;

        searchInput.addEventListener('input', (e) => {
            const termo = e.target.value.toLowerCase().trim();
            document.querySelectorAll('.kanban-card').forEach(card => {
                const texto = card.textContent.toLowerCase();
                card.style.display = texto.includes(termo) ? '' : 'none';
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
                <div class="flex flex-col items-center justify-center py-10 opacity-60">
                    <span class="text-3xl text-slate-300 mb-2">${ico('inbox')}</span>
                    <p class="text-[10px] font-black uppercase tracking-widest text-slate-400">${msgVazio}</p>
                </div>
            `;
            return;
        }

        container.innerHTML = lista.map(item => this._htmlCardKanban(item, modo)).join('');
    },

    _htmlCardKanban(assistido, modo) {
        const st = statusMap[assistido.status] || { cor: 'text-slate-600 border-slate-200 bg-slate-50', txt: assistido.status };
        const urgencia = assistido.priority === 'URGENTE' ? 'border-l-4 border-l-red-500' : '';
        const badgeUrgencia = assistido.priority === 'URGENTE' ? `<span class="text-red-500 shrink-0 animate-pulse">${ico('alertCircle', 'w-4 h-4')}</span>` : '';
        
        const baseUrl = window.location.href.split('?')[0];
        const linkIndividual = `${baseUrl}?pautaId=${this.pautaId}&assistidoId=${assistido.id}`;

        let botoesHtml = '';
        if (this.pautaFechada) {
            botoesHtml = `<div class="mt-3 text-center py-2 bg-slate-100 rounded-lg text-[9px] font-black text-slate-400 uppercase tracking-widest">Pauta Encerrada</div>`;
        } else {
            if (modo === 'puxar') {
                botoesHtml = `<a href="${linkIndividual}" class="block mt-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-[10px] uppercase tracking-widest py-2.5 rounded-xl transition shadow-sm text-center">Atender</a>`;
            } else if (modo === 'mesa') {
                botoesHtml = `
                    <div class="flex gap-2 mt-3">
                        <a href="${linkIndividual}" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] uppercase tracking-widest py-2.5 rounded-xl transition shadow-sm text-center">Abrir</a>
                        <button class="btn-devolver-caso flex-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-black text-[10px] uppercase tracking-widest py-2.5 rounded-xl transition shadow-sm" data-pauta-id="${this.pautaId}" data-assistido-id="${assistido.id}">Devolver</button>
                    </div>`;
            } else {
                botoesHtml = `<a href="${linkIndividual}" class="block mt-3 bg-slate-800 hover:bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest py-2 rounded-lg transition shadow-sm text-center">Ver Processo</a>`;
            }
        }

        return `
            <div class="kanban-card bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col hover:shadow-md transition-shadow ${urgencia}">
                <div class="flex justify-between items-start mb-2 gap-2">
                    <h4 class="font-black text-slate-800 text-sm leading-tight line-clamp-2">${escapeHTML(assistido.name)}</h4>
                    ${badgeUrgencia}
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
                        history: arrayUnion({ action: 'DEVOLVIDO_PARA_FILA', by: this.colaboradorNome, msg: `Devolvido para a fila por ${this.colaboradorNome}`, at: new Date().toISOString() })
                    });
                    if (this.colaboradorAtual?.id) {
                        await updateDoc(doc(db, "pautas", this.pautaId, "collaborators", this.colaboradorAtual.id), { status: 'disponivel', currentAttendance: null }).catch(() => {});
                    }
                    if (typeof showNotification === 'function') showNotification("Caso devolvido.", "info");
                } catch (error) {
                    console.error(error);
                    alert("Erro ao devolver caso.");
                }
            });
        });
    },

    // ─── RENDERIZAÇÃO: SPLIT-SCREEN (ATENDIMENTO INDIVIDUAL) ──────────────────

    renderizarSplitScreen(assistido, pautaData) {
        document.getElementById('view-dashboard').classList.add('hidden');
        document.getElementById('view-dashboard').classList.remove('flex');
        document.getElementById('view-atendimento').classList.remove('hidden');
        document.getElementById('view-atendimento').classList.add('flex');

        const baseUrl = window.location.href.split('?')[0];
        window.history.pushState({}, '', `${baseUrl}?pautaId=${this.pautaId}&assistidoId=${assistido.id}`);

        document.getElementById('assistido-nome').textContent = assistido.name || 'Assistido';
        document.getElementById('assistido-assunto').textContent = assistido.subject || 'Sem assunto';
        
        document.getElementById('btn-voltar-portal').onclick = () => {
            this.assistidoId = null;
            this.assistidoData = null;
            this.renderizarKanban();
        };

        this._renderizarLadoEsquerdo(assistido);

        if (this.pautaFechada) {
            this._renderizarPainelFechado(assistido);
        } else if (['atendido', 'aguardandoNumero'].includes(assistido.status)) {
            this._renderizarPainelFinalizado(assistido);
        } else {
            this._renderizarPainelAcoes(assistido, pautaData);
        }
    },

    _renderizarLadoEsquerdo(assistido) {
        const container = document.getElementById('aba-historico');
        let html = '';

        if (assistido.historicoTransferencia) {
            html += `
                <div class="w-full bg-blue-50 border border-blue-200 p-4 rounded-xl shadow-sm mb-6 flex items-start gap-4 relative overflow-hidden">
                    <div class="absolute left-0 top-0 bottom-0 w-1.5 bg-blue-500"></div>
                    <div class="bg-blue-100 p-2 rounded-lg shrink-0 text-blue-600">${ico('refresh', 'w-5 h-5')}</div>
                    <div>
                        <p class="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-1">Última Movimentação</p>
                        <p class="text-xs font-bold leading-relaxed text-slate-700">${escapeHTML(assistido.historicoTransferencia)}</p>
                    </div>
                </div>`;
        }

        const chk = assistido.documentChecklist || {};
        const baseDeDados = documentsData || window.documentsData || {};
        
        if (!chk.action) {
            html += `<div class="text-center py-10 bg-slate-50 border border-slate-200 rounded-2xl"><span class="text-4xl block mb-2 text-slate-300">${ico('inbox')}</span><p class="text-xs font-bold uppercase tracking-widest text-slate-500">Nenhum checklist da recepção.</p></div>`;
        } else {
            const actionData = baseDeDados[chk.action];
            const actionTitle = actionData ? actionData.title : chk.action.replace(/_/g, ' ').toUpperCase();
            
            html += `
                <div class="bg-slate-900 p-5 rounded-2xl mb-6 shadow-md relative overflow-hidden">
                    <p class="text-[10px] text-blue-400 font-black uppercase tracking-widest mb-1.5">Ação / Pedido Principal</p>
                    <p class="text-base font-black text-white uppercase leading-tight">${actionTitle}</p>
                </div>`;

            if (chk.socioData) {
                const s = chk.socioData;
                let socioHtml = '';
                const addLinha = (label, val) => {
                    if (val && val.trim() !== '' && val !== 'Selecione' && val !== 'R$ 0,00' && !val.includes('Selecione')) {
                        socioHtml += `<div class="flex justify-between items-center py-2 border-b border-slate-100"><span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">${label}</span><span class="text-xs font-bold text-slate-700">${escapeHTML(val)}</span></div>`;
                    }
                };
                addLinha('Ocupação', s.ocupacao); addLinha('Profissão', s.profissao); addLinha('Estado Civil', s.estadoCivil); addLinha('Renda', s.ganhos); addLinha('Fonte Renda', s.fonteRenda);
                
                if (socioHtml) {
                    html += `
                        <div class="bg-white p-5 rounded-2xl mb-6 border border-slate-200 shadow-sm">
                            <h4 class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-1.5">${ico('user', 'w-3.5 h-3.5')} PERFIL SOCIOECONÔMICO</h4>
                            <div class="space-y-1">${socioHtml}</div>
                        </div>`;
                }
            }

            if (chk.checkedIds && chk.checkedIds.length > 0) {
                html += `<div class="bg-white p-5 rounded-2xl mb-6 border border-slate-200 shadow-sm">
                         <h4 class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-1.5">${ico('fileText', 'w-3.5 h-3.5')} DOCUMENTOS RECOLHIDOS</h4>
                         <ul class="space-y-2">`;
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
                    const tipo = chk.docTypes && chk.docTypes[id] ? chk.docTypes[id] : 'Físico';
                    const tipoClass = tipo === 'Físico' ? 'text-amber-700 bg-amber-100 border-amber-200' : 'text-blue-700 bg-blue-100 border-blue-200';
                    html += `
                        <li class="text-xs bg-slate-50 border border-slate-100 p-3 rounded-xl flex justify-between items-center">
                            <span class="font-bold text-slate-700 pr-2 flex items-center gap-2">${ico('checkCircle', 'w-4 h-4 text-emerald-500 shrink-0')} ${docName}</span> 
                            <span class="font-black text-[9px] uppercase tracking-widest ${tipoClass} px-2.5 py-1 rounded-lg border shrink-0">${tipo}</span>
                        </li>`;
                });
                html += `</ul></div>`;
            }
        }
        container.innerHTML = html;
    },

    _renderizarPainelFechado() {
        const aba = document.getElementById('aba-encerramento');
        aba.innerHTML = `
            <div class="text-center p-6 bg-red-50 rounded-2xl border border-red-200 shadow-sm mt-4 mb-6">
                <div class="w-14 h-14 bg-red-500 rounded-full flex items-center justify-center text-white mx-auto shadow-sm mb-4">${ico('lock', 'w-6 h-6')}</div>
                <h2 class="text-lg font-black text-red-800 uppercase tracking-wider mb-2">Pauta Fechada</h2>
                <p class="text-xs font-bold text-red-700 leading-relaxed">O Coordenador fechou a pauta. Você está em modo somente leitura (Auditoria). Nenhuma ação pode ser executada neste assistido.</p>
            </div>
            <button onclick="document.getElementById('btn-voltar-portal').click()" class="w-full bg-slate-800 hover:bg-slate-900 text-white font-black py-4 rounded-xl shadow-md transition-all text-xs uppercase tracking-widest active:scale-95">Voltar para a Mesa</button>
        `;
    },

    _renderizarPainelFinalizado(assistido) {
        const aba = document.getElementById('aba-encerramento');
        aba.innerHTML = `
            <div class="text-center p-6 bg-emerald-50 rounded-2xl border border-emerald-200 shadow-sm mt-4 mb-6">
                <div class="w-14 h-14 bg-emerald-500 rounded-full flex items-center justify-center text-white mx-auto shadow-sm mb-4">${ico('check', 'w-8 h-8')}</div>
                <h2 class="text-lg font-black text-emerald-800 uppercase tracking-wider mb-2">Protocolo Concluído</h2>
                <p class="text-xs font-bold text-emerald-700 leading-relaxed">Atendimento salvo por <b>${escapeHTML(assistido.attendedBy || 'Servidor')}</b>.</p>
                ${assistido.numeroProcesso ? `<div class="mt-4 pt-3 border-t border-emerald-200"><span class="bg-white px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-900 font-mono text-sm font-black shadow-sm">CNP: ${escapeHTML(assistido.numeroProcesso)}</span></div>` : ''}
            </div>
            <button onclick="document.getElementById('btn-voltar-portal').click()" class="w-full bg-slate-800 hover:bg-slate-900 text-white font-black py-4 rounded-xl shadow-md transition-all text-xs uppercase tracking-widest mb-3 active:scale-95">Voltar para a Mesa</button>
        `;
    },

    _renderizarPainelAcoes(assistido, pautaData) {
        const aba = document.getElementById('aba-encerramento');
        const isDefensor = this.colaboradorAtual?.cargo?.toLowerCase().includes('defensor');
        const showDistribuicao = pautaData.useDistributionFlow && !isDefensor;

        let html = `
            <div class="grid grid-cols-1 gap-3 mb-6">
                <button id="btn-opt-direto" class="fluxo-opt-btn bg-emerald-50 border border-emerald-300 ring-2 ring-emerald-100 p-4 rounded-2xl text-left transition-all shadow-md group">
                    <span class="block text-emerald-600 mb-1">${ico('checkCircle', 'w-7 h-7')}</span>
                    <span class="block font-black text-slate-800 text-sm mt-2">${isDefensor ? "Concluir / Assinar" : "Finalizar Protocolo"}</span>
                    <span class="block text-[10px] text-slate-500 mt-1 uppercase tracking-wider font-bold">Encerrar o caso</span>
                </button>
        `;

        if (showDistribuicao) {
            html += `
                <button id="btn-opt-dist" class="fluxo-opt-btn bg-white border border-slate-200 p-4 rounded-2xl text-left transition-all hover:bg-blue-50 hover:border-blue-300 group">
                    <span class="block text-blue-600 mb-1">${ico('send', 'w-7 h-7')}</span>
                    <span class="block font-black text-slate-800 text-sm mt-2">Enviar ao Defensor</span>
                    <span class="block text-[10px] text-slate-500 mt-1 uppercase tracking-wider font-bold">Encaminhar petição</span>
                </button>
                <button id="btn-opt-correcao" class="fluxo-opt-btn bg-white border border-slate-200 p-4 rounded-2xl text-left transition-all hover:bg-amber-50 hover:border-amber-300 group">
                    <span class="block text-amber-600 mb-1">${ico('helpCircle', 'w-7 h-7')}</span>
                    <span class="block font-black text-slate-800 text-sm mt-2">Pedir Avaliação</span>
                    <span class="block text-[10px] text-slate-500 mt-1 uppercase tracking-wider font-bold">Dúvidas com defensor</span>
                </button>
            `;
        }

        if (isDefensor) {
            html += `
                <button id="btn-opt-devolver" class="fluxo-opt-btn bg-white border border-slate-200 p-4 rounded-2xl text-left transition-all hover:bg-orange-50 hover:border-orange-300 group">
                    <span class="block text-orange-600 mb-1">${ico('arrowLeft', 'w-7 h-7')}</span>
                    <span class="block font-black text-slate-800 text-sm mt-2">Devolver c/ Erro</span>
                    <span class="block text-[10px] text-slate-500 mt-1 uppercase tracking-wider font-bold">Retornar ao servidor</span>
                </button>
            `;
        }

        html += `
            <div class="grid grid-cols-2 gap-3">
                <button id="btn-opt-transferir" class="fluxo-opt-btn bg-white border border-slate-200 p-4 rounded-2xl text-left transition-all hover:bg-indigo-50 hover:border-indigo-300 group">
                    <span class="block text-indigo-600 mb-1">${ico('refresh', 'w-5 h-5')}</span>
                    <span class="block font-black text-slate-800 text-[11px] uppercase mt-2">Transferir</span>
                </button>
                <button id="btn-opt-pausar" class="fluxo-opt-btn bg-white border border-slate-200 p-4 rounded-2xl text-left transition-all hover:bg-slate-100 hover:border-slate-300 group">
                    <span class="block text-slate-600 mb-1">${ico('pause', 'w-5 h-5')}</span>
                    <span class="block font-black text-slate-800 text-[11px] uppercase mt-2">Pausar</span>
                </button>
            </div>
        </div>`;

        html += `
            <div id="config-numero-processo" class="bg-white p-5 rounded-2xl border border-slate-200 mb-6 shadow-sm space-y-4">
                <div>
                    <label class="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5"><span>${ico('fileText', 'w-3.5 h-3.5')}</span> Nº CNP (Opcional)</label>
                    <input type="text" id="input-numero-caso" value="${assistido.numeroProcesso || ''}" class="w-full p-3 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none font-mono placeholder:font-sans" placeholder="Ex: 1045239">
                </div>
            </div>

            <div id="config-distribuicao" class="hidden bg-white p-5 rounded-2xl border border-slate-200 mb-6 shadow-sm space-y-4">
                <div>
                    <label class="block text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1.5">Defensor(a)</label>
                    <select id="select-defensor-distribuicao" class="w-full p-3 border border-slate-200 rounded-xl text-xs bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700"></select>
                </div>
                <div>
                    <label class="block text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1.5">Nota Interna</label>
                    <textarea id="notas-distribuicao-dinamico" rows="2" class="w-full p-3 border border-slate-200 rounded-xl text-xs bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 resize-none"></textarea>
                </div>
            </div>

            <div id="config-correcao" class="hidden bg-white p-5 rounded-2xl border border-slate-200 mb-6 shadow-sm space-y-4">
                <div>
                    <label class="block text-[10px] font-black text-amber-500 uppercase tracking-widest mb-1.5">Defensor(a) Avaliador</label>
                    <select id="select-defensor-correcao" class="w-full p-3 border border-slate-200 rounded-xl text-xs bg-slate-50 outline-none focus:ring-2 focus:ring-amber-500 font-bold text-slate-700"></select>
                </div>
                <div>
                    <label class="block text-[10px] font-black text-amber-500 uppercase tracking-widest mb-1.5">Dúvida</label>
                    <textarea id="notas-correcao-dinamico" rows="2" class="w-full p-3 border border-slate-200 rounded-xl text-xs bg-slate-50 outline-none focus:ring-2 focus:ring-amber-500 resize-none"></textarea>
                </div>
            </div>

            <div id="config-devolver" class="hidden bg-white p-5 rounded-2xl border border-slate-200 mb-6 shadow-sm space-y-4">
                <div>
                    <label class="block text-[10px] font-black text-orange-500 uppercase tracking-widest mb-1.5">Devolver para</label>
                    <select id="select-servidor-devolver" class="w-full p-3 border border-slate-200 rounded-xl text-xs bg-slate-50 outline-none focus:ring-2 focus:ring-orange-500 font-bold text-slate-700"></select>
                </div>
                <div>
                    <label class="block text-[10px] font-black text-orange-500 uppercase tracking-widest mb-1.5">Motivo</label>
                    <textarea id="notas-devolver-dinamico" rows="2" class="w-full p-3 border border-slate-200 rounded-xl text-xs bg-slate-50 outline-none focus:ring-2 focus:ring-orange-500 resize-none"></textarea>
                </div>
            </div>

            <div id="config-transferencia" class="hidden bg-white p-5 rounded-2xl border border-slate-200 mb-6 shadow-sm space-y-4">
                <div>
                    <label class="block text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-1.5">Transferir para</label>
                    <select id="select-transferir-colega" class="w-full p-3 border border-slate-200 rounded-xl text-xs bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-700"></select>
                </div>
            </div>

            <button id="btn-finalizar-dinamico" class="w-full bg-slate-900 hover:bg-black text-white font-black py-4 rounded-2xl shadow-lg transition-all text-xs uppercase tracking-widest active:scale-95 flex justify-center items-center gap-2 mt-auto">
                EXECUTAR AÇÃO ${ico('arrowRight', 'w-4 h-4')}
            </button>
        `;

        aba.innerHTML = html;
        this.povoarSelectsDinamicos();

        this.fluxoSelecionado = 'direto';
        const botoesFluxo = document.querySelectorAll('.fluxo-opt-btn');
        const configBoxes = {
            'direto': document.getElementById('config-numero-processo'),
            'distribuicao': document.getElementById('config-distribuicao'),
            'correcao': document.getElementById('config-correcao'),
            'devolver': document.getElementById('config-devolver'),
            'transferir': document.getElementById('config-transferencia'),
            'pausar': null
        };

        const setAtivo = (btnClicado, fluxo) => {
            this.fluxoSelecionado = fluxo;
            botoesFluxo.forEach(b => b.className = 'fluxo-opt-btn bg-white border border-slate-200 p-4 rounded-2xl text-left transition-all hover:shadow-md group');
            const coresAvas = {
                'direto': 'bg-emerald-50 border border-emerald-300 ring-2 ring-emerald-100 shadow-md',
                'distribuicao': 'bg-blue-50 border border-blue-300 ring-2 ring-blue-100 shadow-md',
                'correcao': 'bg-amber-50 border border-amber-300 ring-2 ring-amber-100 shadow-md',
                'devolver': 'bg-orange-50 border border-orange-300 ring-2 ring-orange-100 shadow-md',
                'transferir': 'bg-indigo-50 border border-indigo-300 ring-2 ring-indigo-100 shadow-md',
                'pausar': 'bg-slate-100 border border-slate-400 ring-2 ring-slate-200 shadow-md'
            };
            btnClicado.className = `fluxo-opt-btn ${coresAvas[fluxo]} p-4 rounded-2xl text-left transition-all shadow-md group`;

            Object.keys(configBoxes).forEach(key => {
                if(configBoxes[key]) configBoxes[key].classList.add('hidden');
            });
            if(configBoxes[fluxo]) configBoxes[fluxo].classList.remove('hidden');
        };

        document.getElementById('btn-opt-direto')?.addEventListener('click', (e) => setAtivo(e.currentTarget, 'direto'));
        document.getElementById('btn-opt-dist')?.addEventListener('click', (e) => setAtivo(e.currentTarget, 'distribuicao'));
        document.getElementById('btn-opt-correcao')?.addEventListener('click', (e) => setAtivo(e.currentTarget, 'correcao'));
        document.getElementById('btn-opt-devolver')?.addEventListener('click', (e) => setAtivo(e.currentTarget, 'devolver'));
        document.getElementById('btn-opt-transferir')?.addEventListener('click', (e) => setAtivo(e.currentTarget, 'transferir'));
        document.getElementById('btn-opt-pausar')?.addEventListener('click', (e) => setAtivo(e.currentTarget, 'pausar'));

        document.getElementById('btn-opt-direto')?.click();
        document.getElementById('btn-finalizar-dinamico').onclick = () => this.finalizarProcesso();
    },

    povoarSelectsDinamicos() {
        const defensores = this.todosColaboradores.filter(c => c.cargo?.toLowerCase().includes('defensor'));
        const equipeTecnica = this.todosColaboradores.filter(c => !c.cargo?.toLowerCase().includes('defensor')); 
        const todosMenosEu = this.todosColaboradores.filter(c => c.nome !== this.colaboradorNome);

        const preencher = (idSelect, lista, defaultOpt, valueToSelect = null) => {
            const select = document.getElementById(idSelect);
            if (!select) return;
            select.innerHTML = `<option value="">${defaultOpt}</option>`;
            lista.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.nome;
                opt.textContent = `${c.nome} ${c.cargo ? '- '+c.cargo : ''}`;
                if (valueToSelect === c.nome) opt.selected = true;
                select.appendChild(opt);
            });
        };

        preencher('select-defensor-distribuicao', defensores, '--- SELECIONE ---');
        preencher('select-defensor-correcao', defensores, '--- SELECIONE ---');
        preencher('select-transferir-colega', todosMenosEu, '--- SELECIONE ---');
        
        const enviadoPorInicial = this.assistidoData?.enviadoPor || '';
        preencher('select-servidor-devolver', equipeTecnica, '--- SELECIONE ---', enviadoPorInicial);
    },

    async finalizarProcesso() {
        if (this.pautaFechada) {
            alert("Ação negada. A pauta foi fechada pelo administrador.");
            return;
        }

        if (!this.fluxoSelecionado || this.isProcessing) return;

        this.isProcessing = true;
        const btnFinalizar = document.getElementById('btn-finalizar-dinamico');
        btnFinalizar.disabled = true;
        btnFinalizar.innerHTML = '<span class="animate-pulse">PROCESSANDO...</span>';

        const numProcessoSeguro = document.getElementById('input-numero-caso')?.value.trim() || '';
        const colabSeguro = this.colaboradorNome || 'Sistema'; 
        const pautaIdSeguro = this.pautaId || '';
        const assistidoIdSeguro = this.assistidoId || '';

        let tituloSucesso = "Atendimento Atualizado!";
        let subtituloSucesso = "Ação registrada com sucesso.";
        let colaboradorDestinoObj = null;

        const objetoDemandasFinal = {
            quantidade: this.demandasAdicionaisLocais.length,
            descricoes: this.demandasAdicionaisLocais
        };

        try {
            const pautaDoc = await getDoc(doc(db, "pautas", pautaIdSeguro));
            const pautaConfigAtiva = pautaDoc.exists() ? pautaDoc.data() : { useDistributionFlow: false };
            const temDistribuicaoAtiva = pautaConfigAtiva.useDistributionFlow === true;

            const docRef = doc(db, "pautas", pautaIdSeguro, "attendances", assistidoIdSeguro);
            const novoToken = this._gerarTokenSeguro();
            const timestampIso = new Date().toISOString();

            const atualizacaoDeResponsavel = {
                assignedCollaborator: {
                    id: this.colaboradorId || this.colaboradorAtual?.id || '',
                    name: this.colaboradorNome
                }
            };

            if (this.fluxoSelecionado === 'direto') {
                const enviadoPorColaborador = this.assistidoData?.enviadoPor || null;
                const mapaProdutividadeBI = {};
                if (enviadoPorColaborador) mapaProdutividadeBI[enviadoPorColaborador] = 1; 
                mapaProdutividadeBI[colabSeguro] = 1; 

                let statusDestinoFinal = 'aguardandoNumero';
                if (numProcessoSeguro || !temDistribuicaoAtiva) statusDestinoFinal = 'atendido';

                await updateDoc(docRef, {
                    ...atualizacaoDeResponsavel,
                    status: statusDestinoFinal,
                    attendedBy: colabSeguro,                    
                    enviadoPor: enviadoPorColaborador,                
                    trabalhosPorUsuario: mapaProdutividadeBI,       
                    creatorEmail: enviadoPorColaborador ? null : (this.colaboradorAtual?.email || null), 
                    attendedAt: timestampIso,
                    finalizadoPeloColaborador: statusDestinoFinal === 'atendido',
                    numeroProcesso: numProcessoSeguro,
                    demandas: objetoDemandasFinal, 
                    history: arrayUnion({
                        action: statusDestinoFinal === 'atendido' ? 'APROVADO_E_CONCLUIDO' : 'APROVADO_AGUARDANDO_NUMERO',
                        by: colabSeguro,
                        msg: numProcessoSeguro ? `Nº CNP: ${numProcessoSeguro}` : 'Aprovado e protocolado internamente',
                        at: timestampIso
                    })
                });

                tituloSucesso = "Atendimento Finalizado!";
                subtituloSucesso = statusDestinoFinal === 'atendido' ? "Processo concluído e salvo." : "Atendimento encerrado sem número de processo.";
            } 
            else if (this.fluxoSelecionado === 'distribuicao') {
                const def = document.getElementById('select-defensor-distribuicao')?.value || '';
                const nota = document.getElementById('notas-distribuicao-dinamico')?.value || '';
                if (!def) { 
                    alert("Obrigatório selecionar um Defensor."); 
                    this.isProcessing = false;
                    btnFinalizar.disabled = false; 
                    btnFinalizar.innerHTML = `EXECUTAR AÇÃO ${ico('arrowRight', 'w-4 h-4 inline-block')}`; 
                    return; 
                }
                
                colaboradorDestinoObj = this.todosColaboradores.find(c => c.nome === def);

                await updateDoc(docRef, {
                    ...atualizacaoDeResponsavel,
                    status: 'aguardandoDistribuicao',
                    defensorResponsavel: def,
                    notasRevisao: nota,
                    numeroProcesso: numProcessoSeguro,
                    enviadoPor: colabSeguro, 
                    delegationToken: novoToken,
                    demandas: objetoDemandasFinal, 
                    history: arrayUnion({
                        action: 'ENVIADO_PARA_REVISAO',
                        by: colabSeguro,
                        msg: nota || `Enviado para assinatura do Defensor(a) ${def}`,
                        at: timestampIso
                    })
                });

                tituloSucesso = "Enviado à Distribuição!";
                subtituloSucesso = `O Defensor(a) ${def} já recebeu o documento.`;
            }
            else if (this.fluxoSelecionado === 'correcao') {
                const def = document.getElementById('select-defensor-correcao')?.value || '';
                const nota = document.getElementById('notas-correcao-dinamico')?.value || '';
                if (!def) { 
                    alert("Obrigatório selecionar um Defensor."); 
                    this.isProcessing = false;
                    btnFinalizar.disabled = false; 
                    btnFinalizar.innerHTML = `EXECUTAR AÇÃO ${ico('arrowRight', 'w-4 h-4 inline-block')}`; 
                    return; 
                }
                
                colaboradorDestinoObj = this.todosColaboradores.find(c => c.nome === def);

                await updateDoc(docRef, { 
                    ...atualizacaoDeResponsavel,
                    status: 'aguardandoCorrecao', 
                    defensorResponsavel: def, 
                    notasRevisao: nota, 
                    reviewMotivoDevolucao: nota,
                    enviadoPor: colabSeguro, 
                    delegationToken: novoToken,
                    demandas: objetoDemandasFinal,
                    history: arrayUnion({
                        action: 'ENVIADO_PARA_CORRECAO',
                        by: colabSeguro,
                        msg: nota || `Avaliação solicitada ao Defensor(a) ${def}`,
                        at: timestampIso
                    })
                });

                tituloSucesso = "Enviado p/ Avaliação!";
                subtituloSucesso = `O Defensor(a) ${def} avaliará a dúvida inserida.`;
            }
            else if (this.fluxoSelecionado === 'devolver') {
                const serv = document.getElementById('select-servidor-devolver')?.value || '';
                const nota = document.getElementById('notas-devolver-dinamico')?.value || '';
                if (!serv) { 
                    alert("Selecione o profissional de destino."); 
                    this.isProcessing = false;
                    btnFinalizar.disabled = false; 
                    btnFinalizar.innerHTML = `EXECUTAR AÇÃO ${ico('arrowRight', 'w-4 h-4 inline-block')}`; 
                    return; 
                }
                
                colaboradorDestinoObj = this.todosColaboradores.find(c => c.nome === serv);

                await updateDoc(docRef, {
                    status: 'emAtendimento', 
                    assignedCollaborator: { name: serv, email: colaboradorDestinoObj?.email || '' },
                    inAttendanceTime: timestampIso, 
                    delegationToken: novoToken,
                    historicoTransferencia: `Devolvido p/ Correção por ${colabSeguro}. Msg: ${nota}`,
                    demandas: objetoDemandasFinal,
                    history: arrayUnion({
                        action: 'DEVOLVIDO_COM_ERRO',
                        by: colabSeguro,
                        msg: nota || `Retornado para correção na mesa de ${serv}`,
                        at: timestampIso
                    })
                });

                tituloSucesso = "Processo Devolvido!";
                subtituloSucesso = `O colega ${serv} deve corrigir o documento.`;
            }
            else if (this.fluxoSelecionado === 'transferir') {
                const colega = document.getElementById('select-transferir-colega')?.value || '';
                if (!colega) { 
                    alert("Selecione um colega."); 
                    this.isProcessing = false;
                    btnFinalizar.disabled = false; 
                    btnFinalizar.innerHTML = `EXECUTAR AÇÃO ${ico('arrowRight', 'w-4 h-4 inline-block')}`; 
                    return; 
                }
                
                colaboradorDestinoObj = this.todosColaboradores.find(c => c.nome === colega);

                await updateDoc(docRef, {
                    status: 'emAtendimento', 
                    assignedCollaborator: { name: colega, email: colaboradorDestinoObj?.email || '' },
                    inAttendanceTime: timestampIso, 
                    delegationToken: novoToken,
                    historicoTransferencia: `Transferência de ${colabSeguro} para ${colega}.`,
                    demandas: objetoDemandasFinal,
                    history: arrayUnion({
                        action: 'TRANSFERENCIA_DE_CASO',
                        by: colabSeguro,
                        msg: `Caso repassado para a mesa do colega ${colega}`,
                        at: timestampIso
                    })
                });

                tituloSucesso = "Transferência Ativa!";
                subtituloSucesso = `Caso transferido com sucesso para ${colega}.`;
            } 
            else if (this.fluxoSelecionado === 'pausar') {
                await updateDoc(docRef, {
                    status: 'aguardando', 
                    assignedCollaborator: null,
                    delegatedBy: null,
                    delegatedAt: null,
                    inAttendanceTime: null,
                    distributionStatus: null,
                    demandas: objetoDemandasFinal,
                    history: arrayUnion({
                        action: 'ATENDIMENTO_PAUSADO',
                        by: colabSeguro,
                        msg: 'Atendimento pausado pelo colaborador. Retornado para a fila de Espera.',
                        at: timestampIso
                    })
                });

                tituloSucesso = "Pausa Registrada";
                subtituloSucesso = "O assistido foi mandado de volta à fila de espera.";
            }

            if (colaboradorDestinoObj && colaboradorDestinoObj.email) {
                if (typeof EmailService !== 'undefined' && EmailService.sendDelegationEmail) {
                    await EmailService.sendDelegationEmail(
                        colaboradorDestinoObj.email,
                        colaboradorDestinoObj.nome,
                        this.assistidoData?.name || "Assistido",
                        colabSeguro,
                        pautaIdSeguro,
                        assistidoIdSeguro,
                        novoToken
                    );
                }
            }

            if (typeof showNotification === 'function') {
                showNotification(tituloSucesso, "success");
            } else {
                alert(`${tituloSucesso}\n${subtituloSucesso}`);
            }
            
            document.getElementById('btn-voltar-portal').click();

        } catch (error) {
            console.error("Erro no processamento:", error);
            alert(`Erro ao salvar no banco de dados. Motivo: ${error.message}`);
            if (btnFinalizar) {
                btnFinalizar.disabled = false;
                btnFinalizar.innerHTML = `EXECUTAR AÇÃO ${ico('arrowRight', 'w-4 h-4 inline-block')}`;
            }
        } finally {
            this.isProcessing = false; 
        }
    },

    setupListeners() {
        // Removidos os botões de tabulação, pois a interface agora é estática.
    },
};

export default AtendimentoExternoService;
window.AtendimentoExternoService = AtendimentoExternoService;
