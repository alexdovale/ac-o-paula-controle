// js/atendimentoExternoService.js - MESA DIGITAL COMPLETA (COM FILTRO DE PAUTAS ATIVAS, LGPD, MODAL DE PUXADA, PAUSA RÁPIDA, SALVAMENTO VERDE/CNP E MOTIVO DE REAGENDAMENTO/CANCELAMENTO)
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    getFirestore, doc, getDoc, updateDoc, collection,
    getDocs, arrayUnion, onSnapshot, query, where
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { firebaseConfig } from './config.js';
import { documentsData, EXPENSE_CATEGORIES_COMUNS, EXPENSE_CATEGORIES_EXCLUSIVAS } from './detalhes.js';
import { PDFService } from './pdfService.js';
import { EmailService } from './emailService.js';
import { showNotification, playSound, escapeHTML } from './utils.js';
import { ico } from './icons.js';

// ─── HELPERS DE STATUS E CORES ────────────────────────────────────────────────

const statusMap = {
    pauta:                      { cor: 'text-slate-600 border-slate-200 bg-slate-50',      txt: 'Na Pauta' },
    aguardando:                 { cor: 'text-amber-700 border-amber-200 bg-amber-50',      txt: 'Espera' },
    emAtendimento:              { cor: 'text-blue-700 border-blue-200 bg-blue-50',         txt: 'Atendendo' },
    aguardandoDistribuicao:     { cor: 'text-cyan-700 border-cyan-200 bg-cyan-50',         txt: 'No Defensor' },
    aguardandoCorrecao:         { cor: 'text-orange-700 border-orange-200 bg-orange-50',   txt: 'Avaliação' },
    atendido:                   { cor: 'text-emerald-700 border-emerald-200 bg-emerald-50',txt: 'Concluído' },
    cancelado:                  { cor: 'text-rose-700 border-rose-200 bg-rose-50',         txt: 'Cancelado' },
    aguardandoNumero:           { cor: 'text-indigo-700 border-indigo-200 bg-indigo-50',   txt: 'Aguard. CNP' },
    faltoso:                    { cor: 'text-red-700 border-red-200 bg-red-50',            txt: 'Faltoso' },
    aguardandoAutorizacaoPuxada:{ cor: 'text-violet-700 border-violet-200 bg-violet-50',   txt: 'Puxada pendente' },
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ─── SERVIÇO PRINCIPAL ────────────────────────────────────────────────────────

export const AtendimentoExternoService = {

    pautaId: null,
    pautaNome: 'Pauta',
    pautaTipo: '',
    pautaFechada: false,
    assistidoId: null,
    colaboradorNome: null,
    colaboradorId: null,
    fluxoSelecionado: null,
    subFluxoDireto: 'normal', // 'normal' | 'reagendar' | 'cancelar'
    assistidoData: null,
    todosColaboradores: [],
    colaboradorAtual: null,
    isProcessing: false,
    todosAtendimentosPauta: [],
    demandasAdicionaisLocais: [],
    unsubscribeDashboard: null,
    unsubscribePauta: null,
    unsubscribeAssistido: null,
    pautaCompletaAberta: false,
    _gruposPautaEstado: {},
    _assinaturaAssistido: '',

    // ─── INIT ─────────────────────────────────────────────────────────────────

    async init() {
        console.log("Mesa Digital V5 Inicializada (Gerador Verde Salvo + Fluxos Completos)");

        const urlParams = new URLSearchParams(window.location.search.replace(/&amp;/g, '&'));
        this.pautaId       = urlParams.get('pautaId') || urlParams.get('pid') || this.pautaId;
        this.assistidoId   = urlParams.get('assistidoId') || urlParams.get('aid') || this.assistidoId;
        const tokenRecebido= urlParams.get('token');

        if (!this.pautaId) {
            this.showError("Link Incompleto", "Falta o identificador da pauta na URL.");
            return;
        }

        try {
            if (auth && typeof auth.authStateReady === 'function') {
                await auth.authStateReady();
            } else if (auth && auth.currentUser === null) {
                await new Promise(resolve => setTimeout(resolve, 300));
            }

            const user = auth?.currentUser;
            if (!user) {
                this.showError("Acesso Negado", "Sessão expirada. Volte e faça login novamente no painel principal.");
                return;
            }

            if (!db) {
                this.showError("Erro de Conexão", "Banco de dados não inicializado.");
                return;
            }

            const pautaDoc = await getDoc(doc(db, "pautas", this.pautaId));
            if (!pautaDoc.exists()) {
                this.showError("Pauta não localizada", "A pauta informada não existe mais no sistema.");
                return;
            }

            const pautaData = pautaDoc.data();

            // VALIDAÇÃO DE PAUTA ATIVA (LGPD 7 DIAS + FECHAMENTO MANUAL NO FIREBASE)
            const fechadaBanco = pautaData.isClosed === true || pautaData.fechada === true;
            let expiradaBanco = false;
            if (pautaData.createdAt) {
                const dataBase = pautaData.dataAtuacao ? new Date(pautaData.dataAtuacao) : new Date(pautaData.createdAt);
                const expirationDate = new Date(dataBase);
                expirationDate.setDate(dataBase.getDate() + 7);
                if (new Date() > expirationDate) {
                    expiradaBanco = true;
                }
            }

            if (fechadaBanco || expiradaBanco) {
                this.showError("Pauta Indisponível", "Esta pauta foi fechada ou expirou pelo prazo de 7 dias da LGPD e não pode mais ser acessada.");
                return;
            }

            this.pautaNome = pautaData.name || 'Pauta';
            this.pautaTipo = pautaData.type || 'agendamento';
            this.pautaFechada = false;

            const colabRef = collection(db, "pautas", this.pautaId, "collaborators");
            const q = query(colabRef, where("email", "==", user.email));
            const snap = await getDocs(q);

            if (snap.empty) {
                this.showError("Acesso Negado", "O seu usuário não está vinculado como colaborador desta pauta.");
                return;
            }

            this.colaboradorAtual = { id: snap.docs[0].id, ...snap.docs[0].data() };
            this.colaboradorNome = this.colaboradorAtual.nome;
            this.colaboradorId = this.colaboradorAtual.id;

            await this.carregarColaboradoresGerais();

            if (this.assistidoId) {
                await this.iniciarAtendimentoIndividual(tokenRecebido, pautaData);
                return;
            }

            this._ajustarGrelhaKanban();
            await this.iniciarDashboardKanban();

        } catch (error) {
            console.error("Erro na inicialização:", error);
            this.showError("Conexão Perdida", "Falha ao conectar com o banco de dados.");
        }
    },

    // ─── NAVEGAÇÃO SEGURA DE RETORNO (CORREÇÃO DO ERRO DO PRINT) ──────────────

    voltarParaDashboard() {
        const btnVoltar = document.getElementById('btn-voltar-dashboard') || document.getElementById('btn-voltar-portal');
        if (btnVoltar && this._modoVoltar === 'mesa') {
            btnVoltar.click();
            return;
        }
        if (this.unsubscribeAssistido) {
            this.unsubscribeAssistido();
            this.unsubscribeAssistido = null;
        }
        this.assistidoId = null;
        this.assistidoData = null;
        this._ajustarGrelhaKanban();
        this.renderizarKanban();
        this.iniciarDashboardKanban();
        this.atualizarBadgeHeader();
    },

    // ─── LÓGICA DE DADOS (DASHBOARD) ──────────────────────────────────────────

    async iniciarDashboardKanban() {
        this._cancelarListeners();

        this.unsubscribePauta = onSnapshot(doc(db, "pautas", this.pautaId), (snap) => {
            if (snap.exists()) {
                const dados = snap.data();
                const fechou = dados.fechada === true || dados.isClosed === true;
                if (fechou !== this.pautaFechada) {
                    this.pautaFechada = fechou;
                    this.renderizarKanban();
                }
            }
        });

        let primeiraCarga = true;
        let meusAnteriores = new Set();
        this.unsubscribeDashboard = onSnapshot(
            collection(db, "pautas", this.pautaId, "attendances"),
            (snap) => {
                this.todosAtendimentosPauta = snap.docs.map(d => ({ id: d.id, ...d.data() }));

                if (!primeiraCarga) {
                    snap.docChanges().forEach(change => {
                        if (change.type === 'added' && change.doc.data().status === 'aguardando') {
                            if (typeof showNotification === 'function') showNotification(`Novo assistido na fila: ${change.doc.data().name}`, "info");
                            if (typeof playSound === 'function') playSound();
                        }
                    });
                }
                const meusAgora = new Set(this.todosAtendimentosPauta.filter(a => this._pertenceAMim(a)).map(a => a.id));
                if (!primeiraCarga) {
                    this.todosAtendimentosPauta.forEach(a => {
                        if (meusAgora.has(a.id) && !meusAnteriores.has(a.id)) {
                            if (typeof showNotification === 'function') showNotification(`Novo caso na sua mesa: ${a.name}`, "info");
                            if (typeof playSound === 'function') playSound();
                        }
                    });
                }
                meusAnteriores = meusAgora;
                primeiraCarga = false;

                this.atualizarBadgeHeader();
                this.renderizarKanban();
                if (this.pautaCompletaAberta) this._renderizarPautaCompleta();
            },
            (error) => console.error("Erro no realtime:", error)
        );

        this.prepararFiltroKanban();
        this._ligarCliqueNosCards();
        this._injetarBotaoPausaHeader();
    },

    async iniciarAtendimentoIndividual(tokenRecebido, pautaData) {
        this._cancelarListeners();

        this.unsubscribePauta = onSnapshot(doc(db, "pautas", this.pautaId), (snap) => {
            if (snap.exists()) {
                const dados = snap.data();
                this.pautaFechada = dados.fechada === true || dados.isClosed === true;
                if (this.pautaFechada) this.renderizarSplitScreen(this.assistidoData, pautaData);
            }
        });

        const docSnap = await getDoc(doc(db, "pautas", this.pautaId, "attendances", this.assistidoId));
        if (!docSnap.exists()) {
            this.showError("Processo não encontrado", "Este assistido não está mais na pauta.");
            return;
        }

        const assistido = { id: docSnap.id, ...docSnap.data() };
        this.assistidoData = assistido;
        this.demandasAdicionaisLocais = assistido.demandas?.descricoes ? [...assistido.demandas.descricoes] : [];

        if (tokenRecebido && assistido.delegationToken && assistido.delegationToken !== tokenRecebido) {
            this.showError("Acesso Seguro", "Este link expirou (o caso foi repassado). Abra o caso pela sua mesa.");
            return;
        }

        this.renderizarSplitScreen(assistido, pautaData);
        this.atualizarBadgeHeader();
        this._assinaturaAssistido = this._assinaturaDados(assistido);
        this._escutarAssistido(pautaData);
        this._registrarAbertura(assistido);
        this.setupListeners();
        this._injetarBotaoPausaHeader();
    },



    // ─── BOTÃO E MODAIS DE PAUSA NA HEADER DA MESA DIGITAL ─────────────── //    _abrirModalDefinirPausa() {
        document.getElementById('modal-definir-pausa')?.remove();

        const modal = document.createElement('div');
        modal.id = 'modal-definir-pausa';
        modal.className = 'fixed inset-0 bg-slate-900/60 z-[99999] flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm animate-fade-in';
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

        modal.innerHTML = `
            <div class="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-slate-200" onclick="event.stopPropagation()">
                <div class="px-5 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                    <div class="flex items-center gap-2.5">
                        <span class="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center text-sm shadow-sm font-bold">⏸</span>
                        <div>
                            <h3 class="font-black text-sm sm:text-base text-slate-800 uppercase tracking-wide leading-tight">Registrar Pausa</h3>
                            <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Informe sua ausência temporária</p>
                        </div>
                    </div>
                    <button id="btn-fechar-modal-pausa" class="text-slate-400 hover:text-slate-700 bg-white border border-slate-200 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition">✕</button>
                </div>

                <div class="p-5 space-y-4">
                    <div>
                        <label class="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">Motivos Rápidos</label>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <button type="button" class="btn-preset-pausa text-left px-3 py-2.5 rounded-xl border border-slate-200 hover:border-amber-400 hover:bg-amber-50 text-xs font-bold text-slate-700 transition" data-motivo="Almoço">
                                Almoço
                            </button>
                            <button type="button" class="btn-preset-pausa text-left px-3 py-2.5 rounded-xl border border-slate-200 hover:border-amber-400 hover:bg-amber-50 text-xs font-bold text-slate-700 transition" data-motivo="Banheiro / Café">
                                Banheiro / Café
                            </button>
                            <button type="button" class="btn-preset-pausa sm:col-span-2 text-left px-3 py-2.5 rounded-xl border border-slate-200 hover:border-amber-400 hover:bg-amber-50 text-xs font-bold text-slate-700 transition" data-motivo="Atendimento Externo / Diligência">
                                Atendimento Externo / Diligência
                            </button>
                        </div>
                    </div>

                    <div>
                        <label for="input-motivo-pausa" class="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1.5">Ou digite outro motivo</label>
                        <input type="text" id="input-motivo-pausa" class="w-full p-3 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none font-medium" placeholder="Ex: Ligação com assistido, Reunião de equipe...">
                    </div>
                </div>

                <div class="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex gap-2 justify-end">
                    <button type="button" id="btn-cancelar-pausa" class="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition">Cancelar</button>
                    <button type="button" id="btn-confirmar-pausa" class="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black rounded-xl uppercase tracking-wider transition shadow-sm active:scale-95">Ativar Pausa</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const input = modal.querySelector('#input-motivo-pausa');
        modal.querySelector('#btn-fechar-modal-pausa').onclick = () => modal.remove();
        modal.querySelector('#btn-cancelar-pausa').onclick = () => modal.remove();

        modal.querySelectorAll('.btn-preset-pausa').forEach(btn => {
            btn.onclick = () => {
                input.value = btn.dataset.motivo;
                modal.querySelectorAll('.btn-preset-pausa').forEach(b => b.classList.remove('border-amber-500', 'bg-amber-50'));
                btn.classList.add('border-amber-500', 'bg-amber-50');
            };
        });

        modal.querySelector('#btn-confirmar-pausa').onclick = async () => {
            const motivo = input.value.trim() || 'Ausência momentânea';
            modal.remove();
            await this._executarPausa(motivo);
        };
    },


    async _executarPausa(motivo) {
        if (!this.colaboradorAtual?.id) return;
        try {
            await updateDoc(doc(db, "pautas", this.pautaId, "collaborators", this.colaboradorAtual.id), {
                status: 'pausado',
                motivoPausa: motivo,
                currentAttendance: null
            });

            this.colaboradorAtual.status = 'pausado';
            this.colaboradorAtual.motivoPausa = motivo;
            this.colaboradorAtual.currentAttendance = null;

            if (typeof showNotification === 'function') {
                showNotification(`Pausa ativada: ${motivo}`, "warning");
            }

            this._injetarBotaoPausaHeader();
            this.atualizarBadgeHeader();
        } catch (e) {
            console.error("Erro ao registrar pausa:", e);
            alert("Erro ao registrar pausa no sistema.");
        }
    },

    _abrirModalConfirmarRetorno() {
        document.getElementById('modal-confirmar-retorno')?.remove();

        const modal = document.createElement('div');
        modal.id = 'modal-confirmar-retorno';
        modal.className = 'fixed inset-0 bg-slate-900/60 z-[99999] flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm animate-fade-in';
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

        modal.innerHTML = `
            <div class="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-slate-200" onclick="event.stopPropagation()">
                <div class="px-5 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                    <h3 class="font-black text-sm text-slate-800 uppercase tracking-wide">Retornar ao Trabalho</h3>
                    <button id="btn-fechar-modal-retorno" class="text-slate-400 hover:text-slate-700 bg-white border border-slate-200 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition">✕</button>
                </div>

                <div class="p-5 text-center">
                    <span class="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 inline-flex items-center justify-center text-xl mb-3">✅</span>
                    <p class="text-sm font-bold text-slate-800 leading-snug">Você está pausado no momento.</p>
                    <p class="text-xs text-slate-500 mt-1">Deseja finalizar sua pausa e retornar ao status disponível?</p>
                </div>

                <div class="px-5 py-3.5 bg-slate-50 border-t border-slate-100 grid grid-cols-2 gap-2.5">
                    <button type="button" id="btn-nao-retornar" class="w-full py-2.5 rounded-xl text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 transition active:scale-95">Não, continuar pausado</button>
                    <button type="button" id="btn-sim-retornar" class="w-full py-2.5 rounded-xl text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 transition uppercase tracking-wider shadow-sm active:scale-95">Sim, Retornar</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelector('#btn-fechar-modal-retorno').onclick = () => modal.remove();
        modal.querySelector('#btn-nao-retornar').onclick = () => modal.remove();

        modal.querySelector('#btn-sim-retornar').onclick = async () => {
            modal.remove();
            await this._executarRetorno();
        };
    },

    async _executarRetorno() {
        if (!this.colaboradorAtual?.id) return;
        try {
            await updateDoc(doc(db, "pautas", this.pautaId, "collaborators", this.colaboradorAtual.id), {
                status: 'disponivel',
                motivoPausa: null
            });

            this.colaboradorAtual.status = 'disponivel';
            this.colaboradorAtual.motivoPausa = null;

            if (typeof showNotification === 'function') {
                showNotification("Você retornou ao trabalho!", "success");
            }

            this._injetarBotaoPausaHeader();
            this.atualizarBadgeHeader();
        } catch (e) {
            console.error("Erro ao retornar ao trabalho:", e);
            alert("Erro ao atualizar status.");
        }
    },

    _assinaturaDados(a) {
        return JSON.stringify([a.name, a.subject, a.status, a.numeroProcesso || null, a.idCasoVerde || null, a.motivoEncerramento || null, a.documentChecklist || null, a.demandas?.descricoes || null, a.historicoTransferencia || null]);
    },

    _escutarAssistido(pautaData) {
        if (this.unsubscribeAssistido) { this.unsubscribeAssistido(); this.unsubscribeAssistido = null; }
        this.unsubscribeAssistido = onSnapshot(
            doc(db, "pautas", this.pautaId, "attendances", this.assistidoId),
            (snap) => {
                if (!snap.exists() || !this.assistidoId) return;
                const novo = snap.data();
                const statusAnterior = this.assistidoData?.status;
                const assinatura = this._assinaturaDados(novo);
                if (assinatura === this._assinaturaAssistido) return;
                this._assinaturaAssistido = assinatura;
                this.assistidoData = { id: snap.id, ...novo };

                const nomeEl = document.getElementById('assistido-nome');
                const assuntoEl = document.getElementById('assistido-assunto');
                if (nomeEl) nomeEl.textContent = novo.name || 'Assistido';
                if (assuntoEl) assuntoEl.textContent = novo.subject || 'Sem assunto';

                if (statusAnterior !== novo.status && !this.isProcessing) {
                    this.renderizarSplitScreen(this.assistidoData, pautaData);
                } else {
                    this._renderizarLadoEsquerdo(this.assistidoData);
                }
            },
            (error) => console.error("Erro no realtime do assistido:", error)
        );
    },

    _registrarAbertura(assistido) {
        if (this.pautaFechada || !this.colaboradorNome) return;
        if (['atendido', 'aguardandoNumero', 'faltoso', 'cancelado'].includes(assistido.status)) return;
        const ultimo = (Array.isArray(assistido.historicoAcoes) ? assistido.historicoAcoes : []).slice(-1)[0] || '';
        if (ultimo.startsWith('Aberto na Mesa Digital') && ultimo.includes(`(por ${this.colaboradorNome})`)) return;
        updateDoc(doc(db, "pautas", this.pautaId, "attendances", assistido.id), {
            historicoAcoes: arrayUnion(this._registroHistorico('Aberto na Mesa Digital'))
        }).catch(() => {});
    },

    _cancelarListeners() {
        if (this.unsubscribeDashboard) { this.unsubscribeDashboard(); this.unsubscribeDashboard = null; }
        if (this.unsubscribePauta) { this.unsubscribePauta(); this.unsubscribePauta = null; }
        if (this.unsubscribeAssistido) { this.unsubscribeAssistido(); this.unsubscribeAssistido = null; }
    },

    async carregarColaboradoresGerais() {
        try {
            const snap = await getDocs(collection(db, "pautas", this.pautaId, "collaborators"));
            this.todosColaboradores = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch { this.todosColaboradores = []; }
    },

    _registroHistorico(descricao, iso = new Date().toISOString(), autor = this.colaboradorNome) {
        const hora = new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        return `${descricao} (por ${autor || 'Mesa Digital'}) às ${hora}`;
    },

    _gerarTokenSeguro() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID().substring(0, 8);
        return Math.random().toString(36).substring(2, 10) + Date.now().toString(36).substring(4);
    },

    showError(titulo, message) {
        const shell = document.getElementById('shell-atendimento');
        if (shell) shell.classList.add('hidden');

        const wrapper = document.getElementById('main-wrapper');
        if (wrapper) {
            wrapper.innerHTML = `
                <div class="w-full max-w-lg mx-auto my-auto animate-fade-in mt-10">
                    <div class="bg-red-600 p-6 rounded-t-3xl shadow-xl flex flex-col items-center justify-center">
                        <h1 class="text-white font-black text-2xl uppercase tracking-widest text-center">Acesso Negado</h1>
                    </div>
                    <div class="p-8 text-center bg-white rounded-b-3xl shadow-xl border border-gray-200">
                        <span class="text-6xl block mb-6 text-red-400">${ico('lock', 'w-16 h-16 inline-block')}</span>
                        <h2 class="text-lg font-black text-gray-800 uppercase tracking-wide mb-2">${titulo}</h2>
                        <p class="text-gray-500 font-semibold text-sm">${message}</p>
                        <button onclick="window.location.href = window.location.pathname" class="mt-8 w-full bg-slate-800 text-white font-black px-6 py-4 rounded-xl hover:bg-slate-950 transition-colors uppercase tracking-widest text-sm shadow-md active:scale-95">VOLTAR AO PORTAL</button>
                    </div>
                </div>`;
        }
    },

    atualizarBadgeHeader() {
        const badge = document.getElementById('status-indicator');
        if (!badge) return;

        const isNaTelaIndividual = !!this.assistidoId;
        const meusCasos = this.todosAtendimentosPauta.filter(a =>
            a.status === 'emAtendimento' && a.assignedCollaborator?.name === this.colaboradorNome
        );

        const estaPausado = this.colaboradorAtual?.status === 'pausado';
        const livre = meusCasos.length === 0 && !isNaTelaIndividual && !estaPausado;

        if (estaPausado) {
            badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-400 shrink-0"></span> <span>PAUSADO</span>`;
            badge.className = `bg-amber-50 border border-amber-200 text-amber-800 text-[9px] sm:text-[10px] font-black px-2.5 sm:px-4 py-2 rounded-lg shadow-sm uppercase tracking-widest flex items-center gap-1.5 sm:gap-2 shrink-0 transition-colors`;
        } else {
            badge.innerHTML = livre
                ? `<span class="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span> <span>LIVRE</span>`
                : `<span class="w-2 h-2 rounded-full bg-amber-500 shrink-0 animate-pulse"></span> <span>OCUPADO</span>`;

            badge.className = `bg-white border ${livre ? 'text-emerald-700 border-emerald-200' : 'text-amber-700 border-amber-200'} text-[9px] sm:text-[10px] font-black px-2.5 sm:px-4 py-2 rounded-lg shadow-sm uppercase tracking-widest flex items-center gap-1.5 sm:gap-2 shrink-0 transition-colors`;
        }

        if (this.colaboradorAtual?.id && this.colaboradorAtual.id !== 'manual') {
            const novoStatus = estaPausado ? 'pausado' : (livre ? 'disponivel' : 'ocupado');
            const atendimentoAtualId = (livre || estaPausado) ? null : (meusCasos[0]?.id || this.assistidoId || null);

            if (this.colaboradorAtual.status !== novoStatus || this.colaboradorAtual.currentAttendance !== atendimentoAtualId) {
                this.colaboradorAtual.status = novoStatus;
                this.colaboradorAtual.currentAttendance = atendimentoAtualId;

                updateDoc(doc(db, "pautas", this.pautaId, "collaborators", this.colaboradorAtual.id), {
                    status: novoStatus,
                    currentAttendance: atendimentoAtualId
                }).catch(() => {});
            }
        }
    },

    _ehDefensor() {
        return this.colaboradorAtual?.cargo?.toLowerCase().includes('defensor') === true;
    },

    _ehPendenteDoDefensor(a) {
        return this._ehDefensor()
            && ['aguardandoDistribuicao', 'aguardandoCorrecao'].includes(a.status)
            && a.defensorResponsavel === this.colaboradorNome;
    },
    _pertenceAMim(a) {
        return (a.status === 'emAtendimento' && a.assignedCollaborator?.name === this.colaboradorNome) || this._ehPendenteDoDefensor(a);
    },

    // ─── RENDERIZAÇÃO: KANBAN COM 4 COLUNAS ───────────────────────────────────

    _ajustarGrelhaKanban() {
        const grid = document.querySelector('#view-dashboard .grid');
        if (grid) {
            grid.className = 'grid grid-cols-1 lg:grid-cols-4 gap-4 flex-1 min-h-0 pb-2';

            if (!document.getElementById('kanban-pauta-geral')) {
                const col4 = document.createElement('div');
                col4.className = "bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden h-full max-h-[60vh] lg:max-h-full";
                col4.innerHTML = `
                    <div class="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center shrink-0">
                        <h3 class="font-black text-slate-700 uppercase tracking-widest text-[11px] flex items-center gap-2">📋 Pauta Geral</h3>
                        <div class="flex items-center gap-2">
                            <button id="btn-pauta-completa" class="bg-slate-800 hover:bg-slate-950 text-white font-black text-[9px] uppercase tracking-widest px-3 py-1.5 rounded-lg transition active:scale-95">Ver completa</button>
                            <span id="count-pauta-geral" class="bg-slate-200 text-slate-600 px-2.5 py-1 rounded-lg text-[10px] font-black">0</span>
                        </div>
                    </div>
                    <div id="kanban-pauta-geral" class="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar bg-slate-50/50"></div>
                `;
                grid.appendChild(col4);
                col4.querySelector('#btn-pauta-completa').onclick = () => this.abrirPautaCompleta();
            }

            const titleCol3 = document.querySelector('#kanban-auditoria')?.previousElementSibling?.querySelector('h3');
            if (titleCol3) titleCol3.innerHTML = '✅ Meus Concluídos';
        }
    },

    _configurarBotaoVoltar(modo) {
        if (this._modoVoltar === modo) return;
        const antigo = document.getElementById('btn-voltar-portal');
        if (!antigo) return;
        const btn = antigo.cloneNode(true);
        antigo.replaceWith(btn);
        const spans = btn.querySelectorAll('span');
        if (modo === 'mesa') {
            if (spans[0]) spans[0].textContent = 'Voltar à Mesa';
            if (spans[1]) spans[1].textContent = 'Voltar';
            btn.title = 'Voltar à Mesa de Trabalho';
            btn.onclick = () => {
                if (this.unsubscribeAssistido) { this.unsubscribeAssistido(); this.unsubscribeAssistido = null; }
                this.assistidoId = null;
                this.assistidoData = null;
                this._ajustarGrelhaKanban();
                this.renderizarKanban();
                this.iniciarDashboardKanban();
                this.atualizarBadgeHeader();
            };
        } else {
            if (spans[0]) spans[0].textContent = 'Voltar às Pautas';
            if (spans[1]) spans[1].textContent = 'Voltar';
            btn.title = 'Voltar ao Portal de Pautas';
            btn.onclick = () => { window.location.href = window.location.pathname; };
        }
        this._modoVoltar = modo;
    },

    _atualizarCabecalhoDashboard() {
        const titulo = document.getElementById('assistido-nome');
        const sub = document.getElementById('assistido-assunto');
        if (titulo) titulo.textContent = this.pautaNome || 'Mesa de Trabalho';
        if (sub) {
            const cargo = this.colaboradorAtual?.cargo ? ` • ${this.colaboradorAtual.cargo}` : '';
            sub.textContent = `${this.colaboradorNome || ''}${cargo}`;
        }
    },

    renderizarKanban() {
        this._configurarBotaoVoltar('portal');
        this._atualizarCabecalhoDashboard();
        document.getElementById('view-dashboard').classList.remove('hidden');
        document.getElementById('view-dashboard').classList.add('flex');
        document.getElementById('view-atendimento').classList.add('hidden');
        document.getElementById('view-atendimento').classList.remove('flex');

        const url = new URL(window.location.href);
        if (url.searchParams.has('assistidoId')) {
            url.searchParams.delete('assistidoId');
            window.history.pushState({}, '', url);
        }

        const espera = this.todosAtendimentosPauta.filter(a => a.status === 'aguardando');
        const mesa = this.todosAtendimentosPauta.filter(a => this._pertenceAMim(a));
        const meusConcluidos = this.todosAtendimentosPauta.filter(a => {
            const isDone = ['atendido', 'aguardandoNumero', 'aguardandoDistribuicao', 'aguardandoCorrecao', 'cancelado'].includes(a.status);
            return isDone && !this._ehPendenteDoDefensor(a) && (a.enviadoPor === this.colaboradorNome || a.attendedBy === this.colaboradorNome);
        });

        const pautaGeral = this.todosAtendimentosPauta.filter(a => {
            const isMine = this._pertenceAMim(a) ||
                          (['atendido', 'aguardandoNumero', 'aguardandoDistribuicao', 'aguardandoCorrecao', 'cancelado'].includes(a.status) && (a.enviadoPor === this.colaboradorNome || a.attendedBy === this.colaboradorNome));
            const isEspera = a.status === 'aguardando';
            return !isMine && !isEspera && a.status !== 'faltoso';
        });

        espera.sort((a,b) => (a.checkInOrder || 0) - (b.checkInOrder || 0));
        mesa.sort((a,b) => new Date(b.enviadoEm || b.inAttendanceTime || 0) - new Date(a.enviadoEm || a.inAttendanceTime || 0));
        meusConcluidos.sort((a,b) => new Date(b.attendedAt || b.inAttendanceTime || 0) - new Date(a.attendedAt || a.inAttendanceTime || 0));
        pautaGeral.sort((a,b) => new Date(b.attendedAt || b.inAttendanceTime || 0) - new Date(a.attendedAt || a.inAttendanceTime || 0));

        this._injetarCardsColuna('kanban-espera', 'count-espera', espera, 'puxar', 'Ninguém na fila.');
        this._injetarCardsColuna('kanban-mesa', 'count-mesa', mesa, 'mesa', 'Sua mesa está limpa.');
        this._injetarCardsColuna('kanban-auditoria', 'count-auditoria', meusConcluidos, 'auditoria', 'Nenhum concluído por você.');
        this._injetarCardsColuna('kanban-pauta-geral', 'count-pauta-geral', pautaGeral, 'auditoria', 'Sem outros casos em andamento.');

        this._setupAcoesCards();
        this._aplicarFiltroKanban();
    },

    _ligarCliqueNosCards() {
        if (this._cliqueCardsPronto) return;
        this._cliqueCardsPronto = true;
        document.addEventListener('click', (e) => {
            if (e.target.closest('a, button, input, select, textarea')) return;
            const card = e.target.closest('.kanban-card[data-assistido-id]');
            if (card) this.abrirHistoricoRapido(card.dataset.assistidoId);
        });
    },

    setupListeners() {
        document.getElementById('tab-btn-encerramento')?.addEventListener('click', () => this.switchTab('encerramento'));
        document.getElementById('tab-btn-historico')?.addEventListener('click', () => this.switchTab('historico'));
    },

    switchTab(tab) {
        const btnEnc = document.getElementById('tab-btn-encerramento');
        const btnHis = document.getElementById('tab-btn-historico');
        const abaEnc = document.getElementById('aba-encerramento');
        const abaHis = document.getElementById('aba-historico');
        if (!abaEnc || !abaHis) return;
        const ativo = 'flex-1 py-3.5 text-center font-black text-[11px] uppercase tracking-widest border-b-2 transition-colors';
        const inativo = 'flex-1 py-3.5 text-center font-bold text-[11px] uppercase tracking-widest text-slate-400 border-b-2 border-transparent hover:text-slate-600 transition-colors';
        if (tab === 'encerramento') {
            if (btnEnc) btnEnc.className = `${ativo} text-slate-800 border-slate-800`;
            if (btnHis) btnHis.className = inativo;
            abaEnc.classList.remove('hidden'); abaHis.classList.add('hidden');
        } else {
            if (btnHis) btnHis.className = `${ativo} text-indigo-600 border-indigo-600`;
            if (btnEnc) btnEnc.className = inativo;
            abaHis.classList.remove('hidden'); abaEnc.classList.add('hidden');
        }
    },

    _aplicarFiltroKanban() {
        const searchInput = document.getElementById('kanban-search');
        const termo = (searchInput?.value || '').toLowerCase().trim();
        document.querySelectorAll('#view-dashboard .kanban-card').forEach(card => {
            card.style.display = !termo || card.textContent.toLowerCase().includes(termo) ? '' : 'none';
        });
    },

    prepararFiltroKanban() {
        const searchInput = document.getElementById('kanban-search');
        if (!searchInput || searchInput.dataset.filtroPronto) return;
        searchInput.dataset.filtroPronto = '1';
        searchInput.addEventListener('input', () => this._aplicarFiltroKanban());
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
                    <p class="text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">${msgVazio}</p>
                </div>
            `;
            return;
        }
        container.innerHTML = lista.map(item => this._htmlCardKanban(item, modo)).join('');
    },

    _htmlCardKanban(assistido, modo) {
        let st = statusMap[assistido.status] || { cor: 'text-slate-600 border-slate-200 bg-slate-50', txt: assistido.status };
        const ehPendente = ['aguardandoDistribuicao', 'aguardandoCorrecao'].includes(assistido.status);
        const paraMim = this._ehPendenteDoDefensor(assistido);
        if (paraMim) {
            st = { ...st, txt: assistido.status === 'aguardandoCorrecao' ? 'Avaliar' : (assistido.finalidadeEnvio === 'distribuir' ? 'Distribuir' : 'Assinar') };
        }
        const primeiroNome = (n) => escapeHTML(String(n || '').split(' ')[0]);
        const urgencia = assistido.priority === 'URGENTE' ? 'border-l-[4px] border-l-red-500' : '';
        const badgeUrgencia = assistido.priority === 'URGENTE' ? `<span class="text-red-500 shrink-0 animate-pulse">${ico('alertCircle', 'w-4 h-4')}</span>` : '';

        const baseUrl = window.location.href.split('?')[0];
        const linkIndividual = `${baseUrl}?pautaId=${this.pautaId}&assistidoId=${assistido.id}`;

        let donoLabel = assistido.assignedCollaborator?.name ? `Com ${primeiroNome(assistido.assignedCollaborator.name)}` :
                        (assistido.attendedBy ? `Por ${primeiroNome(assistido.attendedBy)}` : '');
        if (ehPendente) {
            donoLabel = paraMim ? (assistido.enviadoPor ? `De ${primeiroNome(assistido.enviadoPor)}` : '') : (assistido.defensorResponsavel ? `Com ${primeiroNome(assistido.defensorResponsavel)}` : 'Distribuição');
        }

        const puxadaPendente = assistido.status === 'aguardandoAutorizacaoPuxada';
        if (puxadaPendente) {
            donoLabel = assistido.solicitacaoPuxada?.solicitante ? `Pede ${primeiroNome(assistido.solicitacaoPuxada.solicitante)}` : '';
        }

        let botoesHtml = '';
        if (this.pautaFechada) {
            botoesHtml = `<div class="mt-3 text-center py-2 bg-slate-100 rounded-lg text-[9px] font-black text-slate-400 uppercase tracking-widest">Pauta Encerrada</div>`;
            if (modo === 'auditoria') {
                botoesHtml = `<a href="${linkIndividual}" class="block mt-3 bg-slate-800 hover:bg-slate-950 text-white font-black text-[10px] uppercase tracking-widest py-2 rounded-lg transition shadow-sm text-center active:scale-95">Auditar / Histórico</a>`;
            }
        } else if (puxadaPendente) {
            const sol = assistido.solicitacaoPuxada || {};
            const souEu = sol.solicitante === this.colaboradorNome;
            const motivo = sol.motivo ? `<p class="mt-2 text-[10px] text-slate-500 italic bg-violet-50 border border-violet-100 rounded-lg p-2">${escapeHTML(sol.motivo)}</p>` : '';
            if (souEu) {
                botoesHtml = `${motivo}<div class="mt-3 text-center py-2 bg-violet-50 rounded-lg text-[9px] font-black text-violet-700 uppercase tracking-widest">Aguardando autorização</div>`;
            } else {
                botoesHtml = `${motivo}
                    <div class="flex gap-2 mt-3">
                        <button class="btn-autorizar-puxada flex-1 bg-violet-600 hover:bg-violet-700 text-white font-black text-[10px] uppercase tracking-widest py-2.5 rounded-xl transition shadow-sm active:scale-95" data-assistido-id="${assistido.id}">Autorizar</button>
                        <button class="btn-negar-puxada flex-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-black text-[10px] uppercase tracking-widest py-2.5 rounded-xl transition shadow-sm active:scale-95" data-assistido-id="${assistido.id}">Negar</button>
                    </div>`;
            }
        } else {
            if (modo === 'puxar') {
                botoesHtml = `<button type="button" class="btn-puxar-caso block w-full mt-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-[10px] uppercase tracking-widest py-2.5 rounded-xl transition shadow-sm text-center active:scale-95" data-assistido-id="${assistido.id}" data-assistido-nome="${escapeHTML(assistido.name)}">Puxar para mim</button>`;
            } else if (modo === 'mesa' && ehPendente) {
                botoesHtml = `<a href="${linkIndividual}" class="block mt-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] uppercase tracking-widest py-2.5 rounded-xl transition shadow-sm text-center active:scale-95">${assistido.status === 'aguardandoCorrecao' ? 'Avaliar' : 'Abrir / Assinar'}</a>`;
            } else if (modo === 'mesa') {
                botoesHtml = `
                    <div class="flex gap-2 mt-3">
                        <a href="${linkIndividual}" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] uppercase tracking-widest py-2.5 rounded-xl transition shadow-sm text-center active:scale-95">Abrir</a>
                        <button class="btn-devolver-caso flex-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-black text-[10px] uppercase tracking-widest py-2.5 rounded-xl transition shadow-sm active:scale-95" data-pauta-id="${this.pautaId}" data-assistido-id="${assistido.id}">Devolver</button>
                    </div>`;
            } else {
                if (assistido.status === 'aguardandoNumero') {
                    botoesHtml += `<a href="${linkIndividual}" class="block mt-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[10px] uppercase tracking-widest py-2.5 rounded-xl transition shadow-sm text-center active:scale-95">Registrar CNP</a>`;
                }
                botoesHtml += `<button class="btn-auditar-nativo block w-full mt-3 bg-slate-800 hover:bg-slate-950 text-white font-black text-[10px] uppercase tracking-widest py-2 rounded-lg transition shadow-sm text-center active:scale-95" data-assistido-id="${assistido.id}" data-assistido-nome="${escapeHTML(assistido.name)}">Histórico Rápido</button>`;
            }
        }

        const cnpTag = assistido.numeroProcesso
            ? `<div class="text-[9px] font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded mb-2 inline-block w-fit">CNP/VERDE: ${escapeHTML(assistido.numeroProcesso)}</div>`
            : '';

        return `
            <div class="kanban-card cursor-pointer bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col hover:shadow-md transition-shadow ${urgencia}" data-assistido-id="${assistido.id}" title="Ver histórico do checklist">
                <div class="flex justify-between items-start mb-2 gap-2">
                    <h4 class="font-black text-slate-800 text-sm leading-tight line-clamp-2">${escapeHTML(assistido.name)}</h4>
                    ${badgeUrgencia}
                </div>
                <div class="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 mb-2 truncate">
                    <span class="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0"></span> ${escapeHTML(assistido.subject || 'Sem assunto')}
                </div>
                ${cnpTag}
                <div class="flex justify-between items-center mt-auto pt-2 border-t border-slate-100">
                    <span class="text-[9px] font-black px-2 py-1 rounded-md border ${st.cor} uppercase tracking-widest">${st.txt}</span>
                    <span class="font-bold text-[9px] text-slate-400 uppercase truncate max-w-[80px] text-right">${donoLabel}</span>
                </div>
                ${botoesHtml}
            </div>
        `;
    },

    _setupAcoesCards() {
        document.querySelectorAll('.btn-devolver-caso:not([data-bound])').forEach(btn => {
            btn.dataset.bound = '1';
            btn.addEventListener('click', async (e) => {
                const b = e.currentTarget;
                if (!confirm("Devolver este caso para a Fila de Espera?")) return;

                try {
                    await updateDoc(doc(db, "pautas", b.dataset.pautaId, "attendances", b.dataset.assistidoId), {
                        status: 'aguardando', assignedCollaborator: null, inAttendanceTime: null,
                        historicoAcoes: arrayUnion(this._registroHistorico('Devolvido para a fila de espera')),
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

        document.querySelectorAll('.btn-auditar-nativo:not([data-bound])').forEach(btn => {
            btn.dataset.bound = '1';
            btn.addEventListener('click', (e) => this.abrirHistoricoRapido(e.currentTarget.dataset.assistidoId));
        });

        document.querySelectorAll('.btn-puxar-caso:not([data-bound])').forEach(btn => {
            btn.dataset.bound = '1';
            btn.addEventListener('click', (e) => {
                const b = e.currentTarget;
                this._solicitarPuxarCaso(b.dataset.assistidoId, b.dataset.assistidoNome);
            });
        });

        document.querySelectorAll('.btn-autorizar-puxada:not([data-bound])').forEach(btn => {
            btn.dataset.bound = '1';
            btn.addEventListener('click', (e) => this._autorizarPuxada(e.currentTarget.dataset.assistidoId));
        });
        document.querySelectorAll('.btn-negar-puxada:not([data-bound])').forEach(btn => {
            btn.dataset.bound = '1';
            btn.addEventListener('click', (e) => this._negarPuxada(e.currentTarget.dataset.assistidoId));
        });
    },

    // ─── MODAL RENDERIZADO PARA PUXAR CASO ────────────────────────────────────

    _solicitarPuxarCaso(assistidoId, nomeAssistido) {
        document.getElementById('modal-solicitar-puxada')?.remove();

        const modal = document.createElement('div');
        modal.id = 'modal-solicitar-puxada';
        modal.className = 'fixed inset-0 bg-slate-900/60 z-[99999] flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm animate-fade-in';
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

        modal.innerHTML = `
            <div class="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-slate-200" onclick="event.stopPropagation()">
                <div class="px-5 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                    <div class="flex items-center gap-2.5">
                        <span class="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center text-sm shadow-sm font-bold">📥</span>
                        <div>
                            <h3 class="font-black text-sm sm:text-base text-slate-800 uppercase tracking-wide leading-tight">Puxar Atendimento</h3>
                            <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5 truncate max-w-[220px] sm:max-w-xs">${escapeHTML(nomeAssistido)}</p>
                        </div>
                    </div>
                    <button id="btn-fechar-modal-puxada" class="text-slate-400 hover:text-slate-700 bg-white border border-slate-200 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition">✕</button>
                </div>

                <div class="p-5 space-y-4">
                    <div>
                        <label class="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">Motivos Rápidos</label>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <button type="button" class="btn-preset-puxada text-left px-3 py-2 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50 text-xs font-bold text-slate-700 transition" data-motivo="Atendimento prioritário / Urgência">
                                🚨 Urgência / Prioridade
                            </button>
                            <button type="button" class="btn-preset-puxada text-left px-3 py-2 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50 text-xs font-bold text-slate-700 transition" data-motivo="Assistido presente no guichê">
                                📍 Presente no guichê
                            </button>
                            <button type="button" class="btn-preset-puxada sm:col-span-2 text-left px-3 py-2 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50 text-xs font-bold text-slate-700 transition" data-motivo="Retorno / Continuidade de caso">
                                🔄 Continuidade de atendimento
                            </button>
                        </div>
                    </div>

                    <div>
                        <label for="input-motivo-puxada" class="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1.5">Justificativa da Solicitação</label>
                        <input type="text" id="input-motivo-puxada" value="Atendimento prioritário / Urgência" class="w-full p-3 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none font-medium" placeholder="Informe a justificativa...">
                    </div>
                </div>

                <div class="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex gap-2 justify-end">
                    <button type="button" id="btn-cancelar-puxada" class="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition">Cancelar</button>
                    <button type="button" id="btn-confirmar-puxada" class="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-xl uppercase tracking-wider transition shadow-sm active:scale-95 flex items-center gap-1.5">
                        Confirmar e Puxar
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const input = modal.querySelector('#input-motivo-puxada');
        modal.querySelector('#btn-fechar-modal-puxada').onclick = () => modal.remove();
        modal.querySelector('#btn-cancelar-puxada').onclick = () => modal.remove();

        modal.querySelectorAll('.btn-preset-puxada').forEach(btn => {
            btn.onclick = () => {
                input.value = btn.dataset.motivo;
                modal.querySelectorAll('.btn-preset-puxada').forEach(b => b.classList.remove('border-blue-500', 'bg-blue-50'));
                btn.classList.add('border-blue-500', 'bg-blue-50');
            };
        });

        modal.querySelector('#btn-confirmar-puxada').onclick = async () => {
            const motivo = input.value.trim() || 'Atendimento prioritário / Urgência';
            modal.remove();

            const timestampIso = new Date().toISOString();
            const colabNome = this.colaboradorNome || 'Colaborador';

            try {
                await updateDoc(doc(db, "pautas", this.pautaId, "attendances", assistidoId), {
                    status: 'aguardandoAutorizacaoPuxada',
                    solicitacaoPuxada: {
                        solicitante: colabNome,
                        solicitanteId: this.colaboradorId || '',
                        solicitanteEmail: this.colaboradorAtual?.email || '',
                        motivo: motivo,
                        solicitadoEm: timestampIso
                    },
                    historicoAcoes: arrayUnion(this._registroHistorico(`Solicitou puxar caso para si (Motivo: ${motivo})`, timestampIso, colabNome))
                });

                if (typeof showNotification === 'function') {
                    showNotification("Solicitação enviada para a pauta!", "success");
                }
            } catch (err) {
                console.error(err);
                alert("Erro ao solicitar puxada de caso.");
            }
        };
    },

    async _autorizarPuxada(assistidoId) {
        const a = this.todosAtendimentosPauta.find(x => x.id === assistidoId);
        const sol = a?.solicitacaoPuxada;
        if (!a || !sol) return;
        if (!confirm(`Autorizar que ${sol.solicitante} puxe "${a.name}" para a mesa dele(a)?`)) return;

        const iso = new Date().toISOString();
        const destino = this.todosColaboradores.find(c => c.nome === sol.solicitante);
        try {
            await updateDoc(doc(db, "pautas", this.pautaId, "attendances", assistidoId), {
                status: 'emAtendimento',
                assignedCollaborator: { id: destino?.id || sol.solicitanteId || 'manual', name: sol.solicitante, email: destino?.email || sol.solicitanteEmail || '' },
                inAttendanceTime: iso,
                solicitacaoPuxada: null,
                historicoAcoes: arrayUnion(this._registroHistorico(`Puxada autorizada para ${sol.solicitante}`, iso)),
                history: arrayUnion({ action: 'TRANSFERENCIA_DE_CASO', by: this.colaboradorNome, msg: `Puxada autorizada por ${this.colaboradorNome} para ${sol.solicitante}`, at: iso })
            });
            if (destino?.id) {
                updateDoc(doc(db, "pautas", this.pautaId, "collaborators", destino.id), { status: 'ocupado', currentAttendance: assistidoId }).catch(() => {});
            }
            if (typeof showNotification === 'function') showNotification("Puxada autorizada.", "success");
        } catch (error) {
            console.error(error);
            alert("Erro ao autorizar a puxada.");
        }
    },

    async _negarPuxada(assistidoId) {
        const a = this.todosAtendimentosPauta.find(x => x.id === assistidoId);
        const sol = a?.solicitacaoPuxada;
        if (!a) return;
        if (!confirm(`Negar a solicitação e devolver "${a.name}" para a fila de espera?`)) return;

        const iso = new Date().toISOString();
        try {
            await updateDoc(doc(db, "pautas", this.pautaId, "attendances", assistidoId), {
                status: 'aguardando',
                solicitacaoPuxada: null,
                historicoAcoes: arrayUnion(this._registroHistorico(`Puxada negada${sol?.solicitante ? ` (solicitante: ${sol.solicitante})` : ''}`, iso))
            });
            if (typeof showNotification === 'function') showNotification("Solicitação negada. Caso voltou para a fila.", "info");
        } catch (error) {
            console.error(error);
            alert("Erro ao negar a puxada.");
        }
    },

    _criarOverlay(id, titulo, larguraMax = 'max-w-3xl') {
        document.getElementById(id)?.remove();
        const el = document.createElement('div');
        el.id = id;
        el.className = 'fixed inset-0 z-[9999] bg-slate-900/60 flex items-stretch sm:items-center justify-center sm:p-6';
        el.innerHTML = `
            <div class="bg-slate-50 w-full ${larguraMax} sm:rounded-3xl shadow-2xl flex flex-col max-h-full overflow-hidden">
                <div class="flex items-center justify-between gap-3 px-5 py-4 bg-white border-b border-slate-200 shrink-0">
                    <h3 class="font-black text-slate-800 text-sm sm:text-base leading-tight truncate">${titulo}</h3>
                    <button data-fechar class="shrink-0 bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-[10px] uppercase tracking-widest px-4 py-2 rounded-lg active:scale-95">Fechar</button>
                </div>
                <div data-corpo class="flex-1 overflow-y-auto p-4 sm:p-5 custom-scrollbar"></div>
            </div>`;
        document.body.appendChild(el);

        const fechar = () => this._fecharOverlay(id);
        el.querySelector('[data-fechar]').onclick = fechar;
        el.addEventListener('click', (e) => { if (e.target === el) fechar(); });
        if (!this._escOverlayPronto) {
            this._escOverlayPronto = true;
            document.addEventListener('keydown', (e) => {
                if (e.key !== 'Escape') return;
                ['overlay-linha-tempo', 'overlay-historico-rapido', 'overlay-pauta-completa'].forEach(i => { if (document.getElementById(i)) this._fecharOverlay(i); });
            });
        }
        return el.querySelector('[data-corpo]');
    },

    _fecharOverlay(id) {
        document.getElementById(id)?.remove();
        if (id === 'overlay-pauta-completa') this.pautaCompletaAberta = false;
    },

    abrirHistoricoRapido(assistidoId) {
        const assistido = this.todosAtendimentosPauta.find(a => a.id === assistidoId);
        if (!assistido) { alert("Assistido não encontrado na pauta."); return; }

        const corpo = this._criarOverlay('overlay-historico-rapido', `Histórico • ${escapeHTML(assistido.name || 'Assistido')}`);
        this._renderizarLadoEsquerdo({ ...assistido, id: assistido.id }, corpo, { botoes: false });

        const btn = document.createElement('button');
        btn.className = 'w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white font-black text-[10px] uppercase tracking-widest py-3 rounded-xl active:scale-95';
        btn.textContent = 'Linha do tempo completa';
        btn.onclick = () => {
            if (typeof window.abrirMonitoramento === 'function') window.abrirMonitoramento(this.pautaId, assistido.id, assistido.name);
            else this.abrirLinhaDoTempo(assistido);
        };
        corpo.appendChild(btn);
    },

    abrirLinhaDoTempo(assistido) {
        const rotulos = {
            APROVADO_E_CONCLUIDO: 'Concluído', APROVADO_AGUARDANDO_NUMERO: 'Aguardando CNP',
            ENVIADO_PARA_REVISAO: 'Enviado ao defensor', ENVIADO_PARA_CORRECAO: 'Enviado para avaliação',
            DEVOLVIDO_COM_ERRO: 'Devolvido para correção', TRANSFERENCIA_DE_CASO: 'Transferido',
            ATENDIMENTO_PAUSADO: 'Atendimento pausado', DEVOLVIDO_PARA_FILA: 'Devolvido para a fila',
            DEVOLVIDO_PARA_CORRECAO: 'Devolvido para correção', APROVADO_E_DISTRIBUIDO: 'Distribuído',
            DEVOLVIDO_PARA_DISTRIBUICAO: 'Devolvido à distribuição', REAGENDADO: 'Reagendado', CANCELADO: 'Cancelado'
        };
        const hhmm = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const fmtData = (d) => d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

        const doMesa = (Array.isArray(assistido.history) ? assistido.history : []).map(ev => ({
            quando: ev.at ? new Date(ev.at) : new Date(0),
            rotulo: rotulos[ev.action] || String(ev.action || 'Movimentação').replace(/_/g, ' '),
            texto: ev.msg || '', por: ev.by || '', exibe: ev.at ? fmtData(new Date(ev.at)) : '',
            chave: `${ev.by}|${ev.at ? hhmm(ev.at) : ''}`
        }));
        const chavesMesa = new Set(doMesa.map(e => e.chave));

        const base = new Date(assistido.arrivalTime || assistido.createdAt || Date.now());
        const doMonitor = [];
        (Array.isArray(assistido.historicoAcoes) ? assistido.historicoAcoes : []).forEach(txt => {
            const m = String(txt).match(/^(.*?)(?: \(por (.+?)\))? às (\d{2}):(\d{2})$/);
            const quando = new Date(base);
            if (m) quando.setHours(parseInt(m[3]), parseInt(m[4]), 0, 0);
            const ev = { quando, rotulo: m ? m[1] : String(txt), texto: '', por: m?.[2] || '', exibe: m ? `${m[3]}:${m[4]}` : '', chave: m ? `${m[2] || ''}|${m[3]}:${m[4]}` : '' };
            if (!ev.chave || !chavesMesa.has(ev.chave) || /^Aberto na Mesa Digital/.test(ev.rotulo)) doMonitor.push(ev);
        });

        const eventos = [];
        if (assistido.arrivalTime) eventos.push({ quando: new Date(assistido.arrivalTime), rotulo: 'Chegada na recepção', texto: '', por: '', exibe: hhmm(assistido.arrivalTime) });
        eventos.push(...doMesa, ...doMonitor);
        eventos.sort((a, b) => a.quando - b.quando);

        const corpo = this._criarOverlay('overlay-linha-tempo', `Linha do tempo • ${escapeHTML(assistido.name || 'Assistido')}`, 'max-w-xl');
        if (eventos.length === 0) {
            corpo.innerHTML = `<div class="text-center py-16 bg-white rounded-2xl border border-slate-200"><p class="text-xs font-bold uppercase tracking-widest text-slate-500">Nenhuma movimentação registrada.</p></div>`;
            return;
        }
        corpo.innerHTML = `<ol class="relative border-l-2 border-slate-200 ml-3 space-y-5">${eventos.map(ev => `
            <li class="ml-5">
                <span class="absolute -left-[7px] w-3 h-3 rounded-full bg-blue-500 border-2 border-white"></span>
                <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <div class="flex justify-between items-start gap-3">
                        <p class="text-xs font-black text-slate-800">${escapeHTML(ev.rotulo)}</p>
                        <span class="text-[10px] font-bold text-slate-400 shrink-0">${ev.exibe}</span>
                    </div>
                    ${ev.texto ? `<p class="text-xs text-slate-600 mt-1.5 leading-relaxed">${escapeHTML(ev.texto)}</p>` : ''}
                    ${ev.por ? `<p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-2">por ${escapeHTML(ev.por)}</p>` : ''}
                </div>
            </li>`).join('')}</ol>`;
    },

    abrirPautaCompleta() {
        this.pautaCompletaAberta = true;
        this._criarOverlay('overlay-pauta-completa', escapeHTML(this.pautaNome), 'max-w-6xl');
        this._renderizarPautaCompleta();
    },

    _renderizarPautaCompleta() {
        const corpo = document.querySelector('#overlay-pauta-completa [data-corpo]');
        if (!corpo) { this.pautaCompletaAberta = false; return; }

        corpo.querySelectorAll('details[data-grupo]').forEach(d => { this._gruposPautaEstado[d.dataset.grupo] = d.open; });
        const scrollTop = corpo.scrollTop;

        const todos = this.todosAtendimentosPauta;
        const por = (...status) => todos.filter(a => status.includes(a.status));
        const espera = por('aguardando');
        const atendendo = por('emAtendimento');
        const revisao = por('aguardandoDistribuicao', 'aguardandoCorrecao');
        const concluidos = por('atendido', 'aguardandoNumero');
        const faltosos = por('faltoso');
        const cancelados = por('cancelado');
        const total = todos.length;
        const pct = total > 0 ? Math.round((concluidos.length / total) * 100) : 0;

        if (total === 0) {
            corpo.innerHTML = `<div class="text-center py-20 bg-white rounded-2xl border border-slate-200"><p class="font-black text-slate-700 uppercase tracking-widest text-sm">Pauta vazia</p><p class="text-xs text-slate-500 mt-2">Ainda não há assistidos nesta pauta.</p></div>`;
            return;
        }

        const kpi = (n, label, cor) => `
            <div class="bg-${cor}-50 border border-${cor}-100 rounded-2xl p-4 text-center shadow-sm">
                <div class="text-2xl font-black text-${cor}-600">${n}</div>
                <div class="text-[9px] text-${cor}-600 font-bold uppercase tracking-wider mt-1">${label}</div>
            </div>`;

        const grupo = (titulo, lista, abertoPadrao) => {
            if (lista.length === 0) return '';
            const aberto = this._gruposPautaEstado[titulo] ?? (abertoPadrao ?? lista.length <= 8);
            return `
                <details data-grupo="${titulo}" ${aberto ? 'open' : ''} class="mb-4 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <summary class="p-4 bg-slate-50 text-[11px] font-black text-slate-700 uppercase tracking-widest cursor-pointer select-none flex justify-between items-center hover:bg-slate-100">
                        <span>${titulo} <span class="bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full ml-2">${lista.length}</span></span>
                    </summary>
                    <div class="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        ${lista.map(a => this._htmlCardKanban(a, 'auditoria')).join('')}
                    </div>
                </details>`;
        };

        corpo.innerHTML = `
            <div class="flex items-center justify-between mb-3 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                <div>
                    <p class="font-black text-slate-800 text-sm">${total} ${total === 1 ? 'assistido' : 'assistidos'} na pauta</p>
                    <p class="text-[10px] text-slate-500 uppercase tracking-wider mt-1">${escapeHTML(this.pautaTipo)}${this.pautaFechada ? ' • encerrada' : ''}</p>
                </div>
                <span class="text-sm font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-100">${pct}% concluído</span>
            </div>
            <div class="h-2 bg-slate-200 rounded-full mb-5 overflow-hidden"><div class="h-full bg-emerald-500" style="width:${pct}%"></div></div>
            <div class="grid grid-cols-2 sm:grid-cols-6 gap-3 mb-6">
                ${kpi(espera.length, 'Espera', 'amber')}
                ${kpi(atendendo.length, 'Atendendo', 'blue')}
                ${kpi(revisao.length, 'Com defensor / avaliação', 'cyan')}
                ${kpi(concluidos.length, 'Concluídos', 'emerald')}
                ${kpi(faltosos.length, 'Faltosos', 'red')}
                ${kpi(cancelados.length, 'Cancelados', 'rose')}
            </div>
            ${grupo('Aguardando', espera.sort((a,b) => (a.checkInOrder || 0) - (b.checkInOrder || 0)))}
            ${grupo('Em atendimento', atendendo)}
            ${grupo('Com defensor / avaliação', revisao)}
            ${grupo('Concluídos', concluidos, false)}
            ${grupo('Faltosos', faltosos, false)}
            ${grupo('Cancelados', cancelados, false)}
        `;

        this._setupAcoesCards();
        corpo.scrollTop = scrollTop;
    },

    renderizarSplitScreen(assistido, pautaData) {
        document.getElementById('view-dashboard').classList.add('hidden');
        document.getElementById('view-dashboard').classList.remove('flex');
        document.getElementById('view-atendimento').classList.remove('hidden');
        document.getElementById('view-atendimento').classList.add('flex');

        const baseUrl = window.location.href.split('?')[0];
        window.history.pushState({}, '', `${baseUrl}?pautaId=${this.pautaId}&assistidoId=${assistido.id}`);

        document.getElementById('assistido-nome').textContent = assistido.name || 'Assistido';
        document.getElementById('assistido-assunto').textContent = assistido.subject || 'Sem assunto';

        this._configurarBotaoVoltar('mesa');

        this._renderizarLadoEsquerdo(assistido);

        if (this.pautaFechada) {
            this._renderizarPainelFechado();
        } else if (['atendido', 'aguardandoNumero', 'cancelado'].includes(assistido.status)) {
            this._renderizarPainelFinalizado(assistido);
        } else {
            this._renderizarPainelAcoes(assistido, pautaData);
        }
    },

    _infoDocumento(id, actionData) {
        let nome = id.replace(/-/g, ' ').toUpperCase(), secao = 'Outros';
        if (actionData && id.startsWith('doc-')) {
            const parts = id.split('-');
            const dIdx = parseInt(parts.pop());
            const sIdx = parseInt(parts.pop());
            const sec = actionData.sections[sIdx];
            if (!isNaN(sIdx) && !isNaN(dIdx) && sec) {
                secao = sec.title;
                const docObj = sec.docs[dIdx];
                if (docObj) nome = typeof docObj === 'string' ? docObj : docObj.text;
            }
        }
        return { nome, secao };
    },

    _brl(v) { return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); },

    _calcularGastos(g) {
        const moradores = Math.max(1, parseInt(g?.quantidadeMoradores) || 1);
        const num = (v) => (!v || v === 'R$ 0,00') ? 0 : (parseFloat(String(v).replace(/[^\d,]/g, '').replace(',', '.')) || 0);
        const familia = [], crianca = [];
        let totalFamilia = 0, totalCrianca = 0;
        EXPENSE_CATEGORIES_COMUNS.forEach(c => { const v = num(g?.[c.id]); if (v > 0) { totalFamilia += v / moradores; familia.push({ label: c.label, total: v, cota: v / moradores }); } });
        EXPENSE_CATEGORIES_EXCLUSIVAS.forEach(c => { const v = num(g?.[c.id]); if (v > 0) { totalCrianca += v; crianca.push({ label: c.label, total: v }); } });
        return { moradores, familia, crianca, totalFamilia, totalCrianca, total: totalFamilia + totalCrianca };
    },

    async _baixarChecklistPdf(assistido) {
        const svc = PDFService?.generateChecklistPDF ? PDFService : window.PDFService;
        if (!svc || typeof svc.generateChecklistPDF !== 'function') { alert("Módulo de PDF não carregado."); return; }

        const chk = assistido.documentChecklist || {};
        const actionData = (documentsData || {})[chk.action];
        const ids = (chk.checkedIds || []).filter(id => !id.startsWith('reu-') && !id.startsWith('gasto-'));
        const documentosTextos = ids.map(id => ({ id, text: this._infoDocumento(id, actionData).nome }));

        const g = chk.expenseData;
        const despesasTextos = [];
        if (g?.checkExibirGastos) {
            const c = this._calcularGastos(g);
            if (c.total > 0) {
                despesasTextos.push(`Quantidade de pessoas na residência: ${c.moradores}`);
                c.familia.forEach(i => despesasTextos.push(`${i.label}: Total ${this._brl(i.total)} / Cota (1/${c.moradores}): ${this._brl(i.cota)}`));
                c.crianca.forEach(i => despesasTextos.push(`${i.label}: ${this._brl(i.total)} (Integral)`));
                despesasTextos.push(`NECESSIDADE MENSAL APURADA: ${this._brl(c.total)}`);
            }
        }

        const checklistData = {
            checkedIds: chk.checkedIds || [], docTypes: chk.docTypes || {}, reuData: chk.reuData || {},
            expenseData: g || {}, socioData: chk.socioData || {},
            demandasAdicionais: assistido.demandas?.descricoes || [], textosDespesas: despesasTextos
        };

        try {
            showNotification("Gerando PDF do checklist...", "info");
            const r = await svc.generateChecklistPDF(assistido.name || 'Assistido', actionData?.title || chk.action || '', checklistData, documentosTextos, despesasTextos);
            if (r) showNotification("PDF emitido com sucesso!", "success");
        } catch (e) {
            console.error(e);
            showNotification("Erro na emissão do PDF", "error");
        }
    },

    _copiarTextoPeticao(assistido) {
        const c = this._calcularGastos(assistido.documentChecklist?.expenseData);
        if (c.total === 0) { showNotification("Os valores de despesa estão zerados.", "warning"); return; }
        const nome = assistido.name || 'O requerente';
        const pessoas = `${c.moradores} ${c.moradores === 1 ? 'pessoa' : 'pessoas'}`;
        const txt = [
            `Em relação às despesas mensais para a manutenção e subsistência de ${nome}, conforme os dados colhidos em triagem socioeconômica, o montante apurado corresponde a ${this._brl(c.total)}.`,
            '',
            `O referido valor engloba tanto as despesas exclusivas quanto o rateio proporcional das despesas do núcleo familiar (composto por ${pessoas}), divididas da seguinte forma:`,
            '',
            `Cota-parte de despesas residenciais e alimentares (rateio de 1/${c.moradores}):`,
            ...(c.familia.length ? c.familia.map(i => `• ${i.label} (total ${this._brl(i.total)}; cota: ${this._brl(i.cota)})`) : ['• Nenhuma despesa informada nesta categoria.']),
            `Subtotal proporcional: ${this._brl(c.totalFamilia)}`,
            '',
            'Despesas exclusivas (100% da necessidade):',
            ...(c.crianca.length ? c.crianca.map(i => `• ${i.label} (integral: ${this._brl(i.total)})`) : ['• Nenhuma despesa informada nesta categoria.']),
            `Subtotal exclusivo: ${this._brl(c.totalCrianca)}`
        ].join('\n');
        navigator.clipboard.writeText(txt)
            .then(() => showNotification("Texto copiado! Cole na petição.", "success"))
            .catch(() => showNotification("Não foi possível copiar o texto.", "error"));
    },

    _renderizarLadoEsquerdo(assistido, container = document.getElementById('aba-historico'), opcoes = {}) {
        const mostrarBotoes = opcoes.botoes !== false;
        if (!container) return;
        let html = '';
        const fmtEnd = (rua, num, comp, bairro, cidade, uf, cep) => [
            [rua, num].filter(Boolean).join(', '), comp, bairro, [cidade, uf].filter(Boolean).join('/'), cep ? `CEP ${cep}` : ''
        ].filter(Boolean).join(' - ');

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

        if (assistido.motivoEncerramento) {
            html += `
                <div class="w-full bg-amber-50 border border-amber-200 p-4 rounded-xl shadow-sm mb-6 flex items-start gap-4 relative overflow-hidden">
                    <div class="absolute left-0 top-0 bottom-0 w-1.5 bg-amber-500"></div>
                    <div class="bg-amber-100 p-2 rounded-lg shrink-0 text-amber-700">📌</div>
                    <div>
                        <p class="text-[10px] font-black uppercase tracking-widest text-amber-700 mb-1">Motivo Registrado</p>
                        <p class="text-xs font-bold leading-relaxed text-slate-700">${escapeHTML(assistido.motivoEncerramento)}</p>
                    </div>
                </div>`;
        }

        const temDetalhes = typeof window.openDetailsModal === 'function' && !!document.getElementById('assisted-details-modal');
        if (mostrarBotoes) html += `
            <div class="grid grid-cols-1 ${temDetalhes ? 'sm:grid-cols-2' : ''} gap-4 mb-6">
                ${temDetalhes ? `
                <button id="btn-nativ-docs" class="bg-indigo-600 hover:bg-indigo-700 text-white p-4 rounded-2xl shadow-sm border border-indigo-500 flex flex-col items-center justify-center gap-2 transition-transform active:scale-95 group">
                    <span class="text-2xl text-indigo-200 group-hover:text-white transition-colors">${ico('folder', 'w-8 h-8')}</span>
                    <span class="font-black uppercase tracking-widest text-[10px] text-center">Editar Checklist (Original)</span>
                </button>` : ''}
                <button id="btn-nativ-time" class="bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-2xl shadow-sm border border-blue-500 flex flex-col items-center justify-center gap-2 transition-transform active:scale-95 group">
                    <span class="text-2xl text-blue-200 group-hover:text-white transition-colors">${ico('clock', 'w-8 h-8')}</span>
                    <span class="font-black uppercase tracking-widest text-[10px] text-center">Linha do Tempo Completa</span>
                </button>
            </div>
        `;

        const notaEnvio = assistido.notasRevisao || assistido.reviewMotivoDevolucao;
        if (notaEnvio && ['aguardandoDistribuicao', 'aguardandoCorrecao', 'emAtendimento'].includes(assistido.status)) {
            html += `
                <div class="w-full bg-amber-50 border border-amber-200 p-4 rounded-xl shadow-sm mb-6 relative overflow-hidden">
                    <div class="absolute left-0 top-0 bottom-0 w-1.5 bg-amber-400"></div>
                    <p class="text-[10px] font-black uppercase tracking-widest text-amber-700 mb-1">Nota${assistido.enviadoPor ? ` de ${escapeHTML(assistido.enviadoPor)}` : ''}${assistido.finalidadeEnvio ? ` • ${assistido.finalidadeEnvio === 'distribuir' ? 'distribuir' : assistido.finalidadeEnvio === 'corrigir' ? 'corrigir' : 'assinar'}` : ''}</p>
                    <p class="text-xs font-bold leading-relaxed text-slate-700">${escapeHTML(notaEnvio)}</p>
                </div>`;
        }

        const idVerdeOuCnp = assistido.numeroProcesso || assistido.idCasoVerde || '';
        const urlVerdeDireta = this._gerarUrlVerde(idVerdeOuCnp);

        const txtVal = (v) => Array.isArray(v) ? v.filter(Boolean).join(' | ') : (v == null ? '' : String(v));
        const linhasId = [
            ['Nome', assistido.name], ['CPF', assistido.cpf], ['Telefone', assistido.telefone || assistido.phone],
            ['Agendamento', assistido.numeroAgendamento || assistido.numAgendamento], ['Assunto', assistido.subject],
            ['Horário agendado', assistido.scheduledTime],
            ['Chegada', assistido.arrivalTime ? new Date(assistido.arrivalTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''],
            ['Sala', assistido.room], ['Nº do processo / CNP', idVerdeOuCnp]
        ].filter(([, v]) => txtVal(v).trim() !== '');

        if (linhasId.length) {
            html += `
                <div class="bg-white p-5 rounded-2xl mb-6 border border-slate-200 shadow-sm">
                    <h4 class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-1.5">${ico('user', 'w-3.5 h-3.5')} IDENTIFICAÇÃO</h4>
                    <div class="space-y-1">${linhasId.map(([k, v]) => `<div class="flex justify-between items-center py-2 border-b border-slate-100 gap-3"><span class="text-[10px] font-black text-slate-400 uppercase tracking-widest shrink-0">${k}</span><span class="text-xs font-bold text-slate-700 text-right break-words">${escapeHTML(txtVal(v))}</span></div>`).join('')}</div>
                    ${urlVerdeDireta ? `
                        <div class="mt-3 pt-3 border-t border-slate-100">
                            <a href="${urlVerdeDireta}" target="_blank" rel="noopener" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] uppercase tracking-widest py-2.5 px-4 rounded-xl shadow-sm flex items-center justify-center gap-2 transition active:scale-95">
                                Abrir Caso ${escapeHTML(idVerdeOuCnp)} no VERDE &nearr;
                            </a>
                        </div>
                    ` : ''}
                </div>`;
        }

        const chk = assistido.documentChecklist || {};
        const baseDeDados = documentsData || window.documentsData || {};

        if (!chk.action) {
            html += `<div class="text-center py-10 bg-slate-50 border border-slate-200 rounded-2xl"><span class="text-4xl block mb-2 text-slate-300">${ico('inbox')}</span><p class="text-xs font-bold uppercase tracking-widest text-slate-500">Nenhum checklist da recepção registado.</p></div>`;
        } else {
            const actionData = baseDeDados[chk.action];
            const actionTitle = actionData ? actionData.title : chk.action.replace(/_/g, ' ').toUpperCase();

            html += `
                <div class="bg-slate-900 p-5 rounded-2xl mb-6 shadow-md relative overflow-hidden">
                    <p class="text-[10px] text-blue-400 font-black uppercase tracking-widest mb-1.5">Ação Selecionada na Recepção</p>
                    <p class="text-base font-black text-white uppercase leading-tight">${actionTitle}</p>
                </div>`;

            if (chk.socioData) {
                const s = chk.socioData;
                let socioHtml = '';
                const addLinha = (label, val) => {
                    if (val && val.trim() !== '' && val !== 'Selecione' && val !== 'R$ 0,00' && !val.includes('Selecione')) {
                        socioHtml += `<div class="flex justify-between items-center py-2 border-b border-slate-100"><span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">${label}</span><span class="text-xs font-bold text-slate-700 text-right w-2/3 break-words">${escapeHTML(val)}</span></div>`;
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

            const idsDocs = (chk.checkedIds || []).filter(id => !id.startsWith('reu-') && !id.startsWith('gasto-'));
            if (idsDocs.length > 0) {
                const totalPrevisto = actionData
                    ? actionData.sections.reduce((t, sec) => t + sec.docs.filter(d => !(typeof d === 'object' && d.type === 'title')).length, 0)
                    : 0;
                const grupos = new Map();
                idsDocs.forEach(id => {
                    const info = this._infoDocumento(id, actionData);
                    if (!grupos.has(info.secao)) grupos.set(info.secao, []);
                    grupos.get(info.secao).push({ id, nome: info.nome });
                });
                html += `<div class="bg-white p-5 rounded-2xl mb-6 border border-slate-200 shadow-sm">
                       <div class="flex items-center justify-between gap-2 mb-4">
                            <h4 class="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">${ico('fileText', 'w-3.5 h-3.5')} DOCUMENTOS RECOLHIDOS</h4>
                            <span class="text-[10px] font-black px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 shrink-0">${idsDocs.length}${totalPrevisto ? ` de ${totalPrevisto}` : ''}</span>
                       </div>
                       <button data-baixar-checklist class="w-full mb-4 bg-slate-800 hover:bg-slate-950 text-white font-black py-2.5 rounded-xl text-[10px] uppercase tracking-widest shadow-sm active:scale-95 flex items-center justify-center gap-2">${ico('fileText', 'w-3.5 h-3.5')} Baixar checklist completo (PDF)</button>`;
                grupos.forEach((docs, secao) => {
                    html += `<p class="text-[10px] font-black text-sky-700 uppercase tracking-wider mt-3 mb-2">${escapeHTML(secao)}</p><ul class="space-y-2">`;
                    docs.forEach(({ id, nome }) => {
                        const tipo = chk.docTypes && chk.docTypes[id] ? chk.docTypes[id] : 'Físico';
                        const tipoClass = tipo === 'Físico' ? 'text-amber-700 bg-amber-100 border-amber-200' : 'text-blue-700 bg-blue-100 border-blue-200';
                        html += `
                            <li class="text-xs bg-slate-50 border border-slate-100 p-3 rounded-xl flex justify-between items-center gap-2">
                                <span class="font-bold text-slate-700 pr-2 flex items-start gap-2">${ico('checkCircle', 'w-4 h-4 text-emerald-500 shrink-0')} <span>${escapeHTML(nome)}</span></span>
                                <span class="font-black text-[9px] uppercase tracking-widest ${tipoClass} px-2.5 py-1 rounded-lg border shrink-0">${tipo}</span>
                            </li>`;
                    });
                    html += `</ul>`;
                });
                html += `</div>`;
            }

            if (assistido.demandas && assistido.demandas.descricoes && assistido.demandas.descricoes.length > 0) {
                html += `
                    <div class="bg-violet-50 p-5 rounded-2xl mb-6 border border-violet-200 shadow-sm relative overflow-hidden">
                        <div class="absolute top-0 left-0 w-1 h-full bg-violet-500"></div>
                        <h4 class="text-[10px] font-black text-violet-800 uppercase tracking-widest mb-3 pl-1 flex items-center gap-1">
                            <span>${ico('scale', 'w-3.5 h-3.5')}</span> DEMANDAS ACUMULADAS
                        </h4>
                        <ul class="space-y-2">
                            ${assistido.demandas.descricoes.map(dem => `<li class="text-xs bg-white p-3 rounded-xl border border-violet-100 shadow-sm flex items-center gap-2 font-medium text-slate-700"><span class="text-violet-500 font-black">•</span> ${escapeHTML(dem)}</li>`).join('')}
                        </ul>
                    </div>
                `;
            }

            if (chk.expenseData && chk.expenseData.checkExibirGastos) {
                const g = chk.expenseData;
                const moradores = Math.max(1, parseInt(g.quantidadeMoradores) || 1);
                const num = (v) => (!v || v === 'R$ 0,00') ? 0 : (parseFloat(String(v).replace(/[^\d,]/g, '').replace(',', '.')) || 0);
                const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                const linha = (rotulo, detalhe, valor) => `<div class="flex justify-between items-center gap-3 text-xs py-2 border-b border-emerald-100/50"><span class="text-emerald-800 font-bold">${rotulo}${detalhe ? `<span class="block text-[10px] font-medium text-emerald-600/80">${detalhe}</span>` : ''}</span><span class="font-black text-emerald-900 bg-white px-2 py-0.5 rounded shadow-sm border border-emerald-100 shrink-0">${valor}</span></div>`;

                let totalFamilia = 0, totalCrianca = 0, htmlFamilia = '', htmlCrianca = '';
                EXPENSE_CATEGORIES_COMUNS.forEach(c => {
                    const v = num(g[c.id]);
                    if (v > 0) { totalFamilia += v / moradores; htmlFamilia += linha(escapeHTML(c.label), `total ${brl(v)}`, brl(v / moradores)); }
                });
                EXPENSE_CATEGORIES_EXCLUSIVAS.forEach(c => {
                    const v = num(g[c.id]);
                    if (v > 0) { totalCrianca += v; htmlCrianca += linha(escapeHTML(c.label), 'integral', brl(v)); }
                });

                const totalGeral = totalFamilia + totalCrianca;
                if (totalGeral > 0) {
                    html += `
                        <div class="bg-emerald-50 p-5 rounded-2xl mb-6 border border-emerald-200 shadow-sm">
                            <h4 class="text-[10px] font-black text-emerald-800 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                                <span>${ico('coins', 'w-3.5 h-3.5')}</span> PLANILHA DE GASTOS
                            </h4>
                            <p class="text-[10px] font-bold text-emerald-700/70 mb-3">${moradores} ${moradores === 1 ? 'pessoa' : 'pessoas'} na residência</p>
                            ${htmlFamilia ? `<p class="text-[10px] font-black text-emerald-700 uppercase mt-2">Cota da família (rateio 1/${moradores})</p>${htmlFamilia}` : ''}
                            ${htmlCrianca ? `<p class="text-[10px] font-black text-sky-700 uppercase mt-3">Exclusivos da criança</p>${htmlCrianca}` : ''}
                            <div class="flex justify-between font-black text-emerald-950 border-t-2 border-emerald-200 pt-4 mt-4 text-sm items-center">
                                <span class="uppercase tracking-widest">Necessidade mensal</span>
                                <span class="bg-white px-3 py-1 rounded-lg shadow-sm border border-emerald-300 text-lg">${brl(totalGeral)}</span>
                            </div>
                            <button data-baixar-planilha class="mt-5 w-full bg-white border border-emerald-300 text-emerald-700 font-black py-3 rounded-xl text-xs hover:bg-emerald-100 transition-colors shadow-sm flex items-center justify-center gap-2 uppercase tracking-widest active:scale-95">
                                ${ico('fileText', 'w-4 h-4')} Baixar planilha PDF
                            </button>
                            <button data-copiar-texto class="mt-3 w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3 rounded-xl text-xs transition-colors shadow-sm flex items-center justify-center gap-2 uppercase tracking-widest active:scale-95">
                                ${ico('clipboard', 'w-4 h-4')} Copiar texto para a petição
                            </button>
                        </div>
                    `;
                }
            }

            if (chk.reuData && chk.reuData.checkReuUnico) {
                const reu = chk.reuData;
                html += `
                    <div class="bg-rose-50 p-5 rounded-2xl mb-6 border border-rose-200 shadow-sm">
                        <h4 class="text-[10px] font-black text-rose-800 uppercase tracking-widest mb-4 flex items-center gap-1.5"><span>${ico('user', 'w-3.5 h-3.5')}</span> POLO PASSIVO (RÉU)</h4>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6 text-xs text-slate-700 bg-white p-4 rounded-xl border border-rose-100 shadow-sm">
                            ${reu.nome ? `<p><b class="text-rose-900 font-black block mb-1">Nome Completo:</b> ${escapeHTML(reu.nome)}</p>` : ''}
                            ${reu.cpf ? `<p><b class="text-rose-900 font-black block mb-1">CPF:</b> ${escapeHTML(reu.cpf)}</p>` : ''}
                            ${reu.telefone ? `<p><b class="text-rose-900 font-black block mb-1">Telefone:</b> ${escapeHTML(reu.telefone)}</p>` : ''}
                            ${reu.ocupacao ? `<p><b class="text-rose-900 font-black block mb-1">Ocupação:</b> ${escapeHTML(reu.ocupacao)}${reu.profissao ? ' — ' + escapeHTML(reu.profissao) : ''}</p>` : ''}
                            ${reu.estadoCivil ? `<p><b class="text-rose-900 font-black block mb-1">Estado civil:</b> ${escapeHTML(reu.estadoCivil)}</p>` : ''}
                            ${reu.ganhos ? `<p><b class="text-rose-900 font-black block mb-1">Ganhos:</b> ${escapeHTML(reu.ganhos)}${reu.fonteRenda ? ' (' + escapeHTML(reu.fonteRenda) + ')' : ''}</p>` : ''}
                            ${reu.referencia ? `<p class="sm:col-span-2"><b class="text-rose-900 font-black block mb-1">Ponto de referência:</b> ${escapeHTML(reu.referencia)}</p>` : ''}
                            ${(reu.rua || reu.cep) ? `<p class="sm:col-span-2 pt-3 border-t border-rose-100"><b class="text-rose-900 font-black block mb-1.5">Endereço Residencial:</b> ${escapeHTML(fmtEnd(reu.rua, reu.numero, reu.complemento, reu.bairro, reu.cidade, reu.uf, reu.cep))}</p>` : ''}
                            ${(reu.empresa || reu.rua_comercial) ? `<p class="sm:col-span-2 pt-3 border-t border-rose-100"><b class="text-rose-900 font-black block mb-1.5">Endereço de Trabalho:</b> ${escapeHTML([reu.empresa, fmtEnd(reu.rua_comercial, reu.numero_comercial, reu.complemento_comercial, reu.bairro_comercial, reu.cidade_comercial, reu.uf_comercial, reu.cep_comercial)].filter(Boolean).join(' — '))}</p>` : ''}
                        </div>
                    </div>
                `;
            }
        }

        const arquivos = Array.isArray(assistido.documentosDigitalizados) ? assistido.documentosDigitalizados : [];
        if (assistido.noVerde || assistido.pdfLink || assistido.pdfObservacoes || arquivos.length) {
            const urlOk = (u) => /^https?:\/\//i.test(u || '') ? escapeHTML(u) : '#';
            html += `
                <div class="bg-white p-5 rounded-2xl mb-6 border border-slate-200 shadow-sm">
                    <h4 class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-1.5">${ico('folder', 'w-3.5 h-3.5')} ACOMPANHAMENTO</h4>
                    <div class="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-200 mb-3">
                        <span class="text-[11px] font-bold text-slate-600">Verde</span>
                        <span class="px-2.5 py-1 rounded-lg font-black text-[9px] uppercase ${assistido.noVerde ? 'bg-green-600 text-white' : 'bg-slate-200 text-slate-600'}">${assistido.noVerde ? 'Inserido' : 'Pendente'}</span>
                    </div>
                    ${assistido.pdfLink ? `<a href="${urlOk(assistido.pdfLink)}" target="_blank" rel="noopener" class="block text-center bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-[11px] font-bold py-2 rounded-xl mb-3">Abrir link principal</a>` : ''}
                    ${assistido.pdfObservacoes ? `<p class="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200 italic mb-3">${escapeHTML(assistido.pdfObservacoes)}</p>` : ''}
                    ${arquivos.map(d => `<div class="flex justify-between items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200 mb-1.5"><span class="text-[11px] font-bold text-slate-700 truncate">${escapeHTML(d.titulo || d.nomeArquivo || 'Arquivo')}</span><a href="${urlOk(d.url)}" target="_blank" rel="noopener" class="bg-slate-700 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg shrink-0">Abrir</a></div>`).join('')}
                </div>`;
        }

        container.innerHTML = html;

        const btnPlanilha = container.querySelector('[data-baixar-planilha]');
        if (btnPlanilha) {
            btnPlanilha.onclick = () => {
                const gerar = PDFService?.generatePlanilhaGastosPDF || window.PDFService?.generatePlanilhaGastosPDF;
                const dono = PDFService?.generatePlanilhaGastosPDF ? PDFService : window.PDFService;
                if (typeof gerar === 'function') gerar.call(dono, assistido.name || 'Assistido', assistido.documentChecklist.expenseData);
                else alert("Módulo de PDF não carregado.");
            };
        }

        container.querySelector('[data-baixar-checklist]')?.addEventListener('click', () => this._baixarChecklistPdf(assistido));
        container.querySelector('[data-copiar-texto]')?.addEventListener('click', () => this._copiarTextoPeticao(assistido));

        if (!mostrarBotoes) return;

        setTimeout(() => {
            const btnDocs = container.querySelector('#btn-nativ-docs');
            const btnTime = container.querySelector('#btn-nativ-time');

            if (btnDocs) {
                btnDocs.addEventListener('click', () => {
                    if (typeof window.openDetailsModal === 'function') {
                        window.openDetailsModal({ assistedId: assistido.id, pautaId: this.pautaId, allAssisted: this.todosAtendimentosPauta, db: db });
                    } else if (window.openDetailsModal) {
                        window.openDetailsModal(assistido, this.pautaId);
                    } else {
                        alert("Módulo de Detalhes Original não carregado na página.");
                    }
                });
            }

            if (btnTime) {
                btnTime.addEventListener('click', () => {
                    if (window.abrirMonitoramento) window.abrirMonitoramento(this.pautaId, assistido.id, assistido.name);
                    else this.abrirLinhaDoTempo(assistido);
                });
            }
        }, 100);
    },

    _renderizarPainelFechado() {
        const aba = document.getElementById('aba-encerramento');
        aba.innerHTML = `
            <div class="text-center p-6 bg-red-50 rounded-2xl border border-red-200 shadow-sm mt-4 mb-6">
                <div class="w-14 h-14 bg-red-500 rounded-full flex items-center justify-center text-white mx-auto shadow-sm mb-4">${ico('lock', 'w-6 h-6')}</div>
                <h2 class="text-lg font-black text-red-800 uppercase tracking-wider mb-2">Pauta Fechada</h2>
                <p class="text-xs font-bold text-red-700 leading-relaxed">O Coordenador fechou a pauta. Você está em modo somente leitura. Nenhuma ação pode ser executada neste assistido.</p>
            </div>
            <button id="btn-voltar-painel-fechado" class="w-full bg-slate-800 hover:bg-slate-950 text-white font-black py-4 rounded-xl shadow-md transition-all text-xs uppercase tracking-widest active:scale-95">Voltar para a Mesa</button>
        `;
        document.getElementById('btn-voltar-painel-fechado').onclick = () => this.voltarParaDashboard();
    },

    async registrarCnpFinal() {
        if (this.pautaFechada || this.isProcessing) return;
        const cnp = document.getElementById('input-cnp-final')?.value.trim() || '';
        if (!cnp) { alert("Informe o número do processo (CNP)."); return; }

        this.isProcessing = true;
        try {
            const iso = new Date().toISOString();
            await updateDoc(doc(db, "pautas", this.pautaId, "attendances", this.assistidoId), {
                status: 'atendido',
                numeroProcesso: cnp,
                idCasoVerde: cnp,
                finalizadoPeloColaborador: true,
                distributionStatus: 'completed',
                historicoAcoes: arrayUnion(this._registroHistorico(`CNP registrado: ${cnp}`, iso)),
                history: arrayUnion({ action: 'APROVADO_E_DISTRIBUIDO', by: this.colaboradorNome || 'Sistema', msg: `Nº CNP: ${cnp}`, at: iso })
            });
            if (typeof showNotification === 'function') showNotification("CNP registrado. Caso concluído!", "success");
            this.voltarParaDashboard();
        } catch (error) {
            console.error(error);
            alert(`Erro ao registrar o CNP: ${error.message}`);
        } finally {
            this.isProcessing = false;
        }
    },

    _renderizarPainelFinalizado(assistido) {
        const aba = document.getElementById('aba-encerramento');
        if (assistido.status === 'aguardandoNumero') {
            aba.innerHTML = `
                <div class="p-6 bg-indigo-50 rounded-2xl border border-indigo-200 shadow-sm mt-4 mb-6">
                    <h2 class="text-base font-black text-indigo-800 uppercase tracking-wider mb-2 text-center">Aguardando Nº do Processo</h2>
                    <p class="text-xs font-bold text-indigo-700 leading-relaxed text-center mb-4">Aprovado por <b>${escapeHTML(assistido.attendedBy || 'Defensor')}</b>. Informe o CNP para concluir a distribuição.</p>
                    <input type="text" id="input-cnp-final" class="w-full p-3 border border-indigo-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none font-mono" placeholder="Ex: 1045239">
                    <button id="btn-registrar-cnp" class="w-full mt-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3.5 rounded-xl shadow-md text-xs uppercase tracking-widest active:scale-95">Registrar CNP e Concluir</button>
                </div>
                <button id="btn-voltar-painel-finalizado" class="w-full bg-slate-800 hover:bg-slate-950 text-white font-black py-4 rounded-xl shadow-md transition-all text-xs uppercase tracking-widest mb-3 active:scale-95">Voltar para a Mesa</button>
            `;
            document.getElementById('btn-registrar-cnp').onclick = () => this.registrarCnpFinal();
            document.getElementById('btn-voltar-painel-finalizado').onclick = () => this.voltarParaDashboard();
            return;
        }

        const ehCancelado = assistido.status === 'cancelado';
        aba.innerHTML = `
            <div class="text-center p-6 ${ehCancelado ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'} rounded-2xl border shadow-sm mt-4 mb-6">
                <div class="w-14 h-14 ${ehCancelado ? 'bg-rose-500' : 'bg-emerald-500'} rounded-full flex items-center justify-center text-white mx-auto shadow-sm mb-4">${ico('check', 'w-8 h-8')}</div>
                <h2 class="text-lg font-black ${ehCancelado ? 'text-rose-800' : 'text-emerald-800'} uppercase tracking-wider mb-2">${ehCancelado ? 'Atendimento Encerrado' : 'Protocolo Concluído'}</h2>
                <p class="text-xs font-bold ${ehCancelado ? 'text-rose-700' : 'text-emerald-700'} leading-relaxed">Registrado por <b>${escapeHTML(assistido.attendedBy || 'Servidor')}</b>.</p>
                ${assistido.motivoEncerramento ? `<div class="mt-3 p-3 bg-white rounded-xl border border-slate-200 text-xs font-bold text-slate-700">${escapeHTML(assistido.motivoEncerramento)}</div>` : ''}
                ${assistido.numeroProcesso ? `<div class="mt-4 pt-3 border-t border-emerald-200"><span class="bg-white px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-900 font-mono text-sm font-black shadow-sm">CNP / VERDE: ${escapeHTML(assistido.numeroProcesso)}</span></div>` : ''}
            </div>
            <button id="btn-voltar-painel-finalizado" class="w-full bg-slate-800 hover:bg-slate-950 text-white font-black py-4 rounded-xl shadow-md transition-all text-xs uppercase tracking-widest mb-3 active:scale-95">Voltar para a Mesa</button>
        `;
        document.getElementById('btn-voltar-painel-finalizado').onclick = () => this.voltarParaDashboard();
    },

    // ─── GERADOR DE LINK DIRETO VERDE (COM SALVAMENTO NO FIREBASE) ──────────

    _gerarUrlVerde(idCaso) {
        const limpo = String(idCaso || '').trim();
        if (!/^\d+$/.test(limpo) || parseInt(limpo, 10) <= 0) return '';
        return `https://verde.rj.def.br/verde/pages/caso/prontuario.xhtml?idCaso=${limpo}&vtPauta=true`;
    },

    _htmlCartaoVerde(assistido, isDefensor) {
        const idCasoAtual = assistido.numeroProcesso || assistido.idCasoVerde || '';
        const urlGerada = this._gerarUrlVerde(idCasoAtual);

        return `
            <div class="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-md mb-6">
                <div class="flex items-center justify-between mb-1">
                    <p class="text-[10px] font-black uppercase tracking-widest text-emerald-400">Gerador de Link Direto • VERDE</p>
                    <span class="text-[9px] font-bold text-slate-400 uppercase">Compartilhado na Pauta</span>
                </div>
                <p class="text-xs font-medium text-slate-300 mb-3">Informe o Número do Caso (ID) para gerar o link e salvar para o Defensor e equipe:</p>

                <div class="flex gap-2 mb-3">
                    <input type="text" id="input-id-caso-verde" value="${escapeHTML(idCasoAtual)}" placeholder="Ex: 7039722" class="flex-1 p-3 bg-slate-800 border border-slate-700 rounded-xl text-xs font-mono text-white outline-none focus:ring-2 focus:ring-emerald-500">
                    <button type="button" id="btn-salvar-id-verde" class="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] uppercase tracking-wider px-4 rounded-xl shadow-sm active:scale-95 transition-colors shrink-0">
                        Salvar ID
                    </button>
                </div>

                <div id="container-link-verde-gerado" class="${urlGerada ? '' : 'hidden'} space-y-2 mt-3 pt-3 border-t border-slate-800">
                    <div class="p-2.5 bg-slate-800/80 rounded-xl border border-slate-700/50 break-all font-mono text-[10px] text-emerald-300 select-all" id="texto-url-gerada">
                        ${urlGerada}
                    </div>
                    <div class="flex gap-2 pt-1">
                        <button type="button" id="btn-copiar-link-verde" class="flex-1 bg-white/10 hover:bg-white/20 text-white font-black text-[10px] uppercase tracking-widest py-2.5 rounded-xl active:scale-95 transition-colors">Copiar Link</button>
                        <a href="${urlGerada}" id="btn-abrir-link-verde" target="_blank" rel="noopener" class="flex-1 text-center bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] uppercase tracking-widest py-2.5 rounded-xl shadow-sm active:scale-95 transition-colors">Abrir no VERDE &nearr;</a>
                    </div>
                </div>
            </div>`;
    },

    _setupGeradorVerde(assistido) {
        const inputId = document.getElementById('input-id-caso-verde');
        const inputCnpDireto = document.getElementById('input-numero-caso');
        const btnSalvar = document.getElementById('btn-salvar-id-verde');
        const containerLink = document.getElementById('container-link-verde-gerado');
        const textoUrl = document.getElementById('texto-url-gerada');
        const btnAbrir = document.getElementById('btn-abrir-link-verde');
        const btnCopiar = document.getElementById('btn-copiar-link-verde');

        if (!inputId) return;

        const processarValor = (rawVal) => {
            const apenasNumeros = rawVal.replace(/\D/g, '');
            if (apenasNumeros && parseInt(apenasNumeros, 10) > 0) {
                inputId.value = apenasNumeros;
                if (inputCnpDireto && !inputCnpDireto.value.trim()) {
                    inputCnpDireto.value = apenasNumeros;
                }
                const url = this._gerarUrlVerde(apenasNumeros);
                if (textoUrl) textoUrl.textContent = url;
                if (btnAbrir) btnAbrir.href = url;
                if (containerLink) containerLink.classList.remove('hidden');
            } else {
                if (containerLink) containerLink.classList.add('hidden');
            }
        };

        inputId.addEventListener('input', (e) => { processarValor(e.target.value); });
        inputId.addEventListener('paste', (e) => {
            e.preventDefault();
            const colarTexto = (e.clipboardData || window.clipboardData).getData('text');
            processarValor(colarTexto);
        });

        // Sincroniza se o usuário digitar no campo CNP do Finalizar
        if (inputCnpDireto) {
            inputCnpDireto.addEventListener('input', (e) => {
                const limpo = e.target.value.replace(/\D/g, '');
                if (limpo) processarValor(limpo);
            });
        }

        // Botão para salvar o ID/Link do VERDE imediatamente para todos os colaboradores e Defensor terem acesso
        if (btnSalvar) {
            btnSalvar.onclick = async () => {
                const valor = inputId.value.trim();
                const textoOriginal = btnSalvar.textContent;
                btnSalvar.disabled = true;
                btnSalvar.textContent = "Salvando...";
                try {
                    const iso = new Date().toISOString();
                    await updateDoc(doc(db, "pautas", this.pautaId, "attendances", this.assistidoId), {
                        numeroProcesso: valor,
                        idCasoVerde: valor,
                        noVerde: !!valor,
                        historicoAcoes: arrayUnion(this._registroHistorico(`ID do Caso VERDE salvo: ${valor || 'limpo'}`, iso))
                    });
                    if (this.assistidoData) {
                        this.assistidoData.numeroProcesso = valor;
                        this.assistidoData.idCasoVerde = valor;
                    }
                    if (inputCnpDireto) inputCnpDireto.value = valor;
                    if (typeof showNotification === 'function') {
                        showNotification("ID do VERDE salvo! O Defensor e a equipe já têm acesso ao link.", "success");
                    }
                } catch (err) {
                    console.error("Erro ao salvar ID do Verde:", err);
                    alert("Erro ao salvar o número do caso.");
                } finally {
                    btnSalvar.disabled = false;
                    btnSalvar.textContent = textoOriginal;
                }
            };
        }

        if (btnCopiar) {
            btnCopiar.onclick = () => {
                const url = textoUrl?.textContent?.trim();
                if (url) {
                    navigator.clipboard?.writeText(url).then(() => {
                        if (typeof showNotification === 'function') showNotification("Link copiado para a área de transferência!", "success");
                        else alert("Link copiado!");
                    }).catch(() => {});
                }
            };
        }
    },

    _renderizarPainelAcoes(assistido, pautaData) {
        const aba = document.getElementById('aba-encerramento');
        const isDefensor = this.colaboradorAtual?.cargo?.toLowerCase().includes('defensor');
        const temDefensorNaPauta = this.todosColaboradores.some(c => c.cargo?.toLowerCase().includes('defensor'));
        const showDistribuicao = (pautaData.useDistributionFlow || temDefensorNaPauta) && !isDefensor;

        let html = this._htmlCartaoVerde(assistido, isDefensor) + `
            <div class="grid grid-cols-1 gap-3 mb-6">
                <button id="btn-opt-direto" class="fluxo-opt-btn bg-emerald-50 border border-emerald-300 ring-2 ring-emerald-100 p-4 rounded-2xl text-left transition-all shadow-md group">
                    <span class="block text-emerald-600 mb-1">${ico('checkCircle', 'w-7 h-7')}</span>
                    <span class="block font-black text-slate-800 text-sm mt-2">${isDefensor ? "Concluir e Distribuir" : "Finalizar Protocolo"}</span>
                    <span class="block text-[10px] text-slate-500 mt-1 uppercase tracking-wider font-bold">Concluir atendimento, reagendar ou cancelar</span>
                </button>
        `;

        if (showDistribuicao) {
            html += `
                <button id="btn-opt-dist" class="fluxo-opt-btn bg-white border border-slate-200 p-4 rounded-2xl text-left transition-all hover:bg-blue-50 hover:border-blue-300 group">
                    <span class="block text-blue-600 mb-1">${ico('send', 'w-7 h-7')}</span>
                    <span class="block font-black text-slate-800 text-sm mt-2">Enviar ao Defensor</span>
                    <span class="block text-[10px] text-slate-500 mt-1 uppercase tracking-wider font-bold">Assinar, distribuir ou corrigir</span>
                </button>
                <button id="btn-opt-correcao" class="fluxo-opt-btn bg-white border border-slate-200 p-4 rounded-2xl text-left transition-all hover:bg-amber-50 hover:border-amber-300 group">
                    <span class="block text-amber-600 mb-1">${ico('helpCircle', 'w-7 h-7')}</span>
                    <span class="block font-black text-slate-800 text-sm mt-2">Pedir Correção / Avaliação</span>
                    <span class="block text-[10px] text-slate-500 mt-1 uppercase tracking-wider font-bold">Defensor corrige ou avalia</span>
                </button>
            `;
        }

        if (isDefensor) {
            html += `
                <button id="btn-opt-devolver" class="fluxo-opt-btn bg-white border border-slate-200 p-4 rounded-2xl text-left transition-all hover:bg-orange-50 hover:border-orange-300 group">
                    <span class="block text-orange-600 mb-1">${ico('arrowLeft', 'w-7 h-7')}</span>
                    <span class="block font-black text-slate-800 text-sm mt-2">Devolver p/ Correção</span>
                    <span class="block text-[10px] text-slate-500 mt-1 uppercase tracking-wider font-bold">Retornar à mesa de origem</span>
                </button>
                <button id="btn-opt-devolver-dist" class="fluxo-opt-btn bg-white border border-slate-200 p-4 rounded-2xl text-left transition-all hover:bg-cyan-50 hover:border-cyan-300 group">
                    <span class="block text-cyan-600 mb-1">${ico('inbox', 'w-7 h-7')}</span>
                    <span class="block font-black text-slate-800 text-sm mt-2">Devolver à Distribuição</span>
                    <span class="block text-[10px] text-slate-500 mt-1 uppercase tracking-wider font-bold">Voltar para a fila de distribuição</span>
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
                    <span class="block font-black text-slate-800 text-[11px] uppercase mt-2">Pausar Atendimento</span>
                </button>
            </div>
        </div>`;

        html += `
            <div id="secao-demandas-adicionais-externo" class="bg-indigo-50 p-5 rounded-2xl border border-indigo-100 mb-6 shadow-sm">
                <label class="block text-[10px] font-black text-indigo-800 uppercase tracking-widest mb-3 flex items-center gap-1.5"><span>${ico('clipboard', 'w-3.5 h-3.5')}</span> Demandas Adicionais (Estatística)</label>
                <div class="flex gap-2 mb-3">
                    <input type="text" id="input-nova-demanda-externo" class="flex-grow p-3 border border-indigo-200 rounded-xl text-xs outline-none bg-white focus:ring-2 focus:ring-indigo-500 font-medium" placeholder="Ex: Divórcio, Alimentos...">
                    <button type="button" id="btn-add-demanda-externo" class="bg-indigo-600 text-white font-bold px-4 py-3 rounded-xl text-[10px] hover:bg-indigo-700 transition-colors shadow-sm uppercase tracking-wider shrink-0">Adicionar</button>
                </div>
                <div id="container-lista-demandas-externo" class="space-y-1.5 max-h-32 overflow-y-auto pr-1 custom-scrollbar"></div>
            </div>

            <!-- APARECE SOMENTE QUANDO CLICAR EM FINALIZAR PROTOCOLO -->
            <div id="config-numero-processo" class="bg-white p-5 rounded-2xl border border-slate-200 mb-6 shadow-sm space-y-4">
                <div>
                    <label class="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Resultado da Finalização</label>
                    <div class="grid grid-cols-3 gap-2">
                        <button type="button" data-subfluxo="normal" class="btn-subfluxo-direto py-2.5 px-2 rounded-xl border border-emerald-500 bg-emerald-50 text-emerald-800 font-black text-[10px] uppercase tracking-wider transition">
                            ✅ Atendido
                        </button>
                        <button type="button" data-subfluxo="reagendar" class="btn-subfluxo-direto py-2.5 px-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 hover:bg-amber-50 font-black text-[10px] uppercase tracking-wider transition">
                            📅 Reagendar
                        </button>
                        <button type="button" data-subfluxo="cancelar" class="btn-subfluxo-direto py-2.5 px-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 hover:bg-rose-50 font-black text-[10px] uppercase tracking-wider transition">
                            ❌ Cancelar
                        </button>
                    </div>
                </div>

                <div id="box-cnp-finalizar">
                    <label class="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5"><span>${ico('fileText', 'w-3.5 h-3.5')}</span> Nº CNP / Processo (Opcional)</label>
                    <input type="text" id="input-numero-caso" value="${escapeHTML(assistido.numeroProcesso || assistido.idCasoVerde || '')}" class="w-full p-3 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none font-mono placeholder:font-sans" placeholder="Ex: 7039722">
                </div>

                <div id="box-motivo-reagendar-cancelar" class="hidden">
                    <label id="label-motivo-reagendar-cancelar" class="block text-[10px] font-black text-amber-700 uppercase tracking-widest mb-1.5">Motivo Obrigatório</label>
                    <textarea id="input-motivo-reagendar-cancelar" rows="2" class="w-full p-3 border border-amber-300 rounded-xl text-xs bg-amber-50/40 focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none resize-none font-medium" placeholder="Informe o motivo pelo qual não seguiu o atendimento..."></textarea>
                </div>
            </div>

            <div id="config-distribuicao" class="hidden bg-white p-5 rounded-2xl border border-slate-200 mb-6 shadow-sm space-y-4">
                <div>
                    <label class="block text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1.5">Defensor(a)</label>
                    <select id="select-defensor-distribuicao" class="w-full p-3 border border-slate-200 rounded-xl text-xs bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700"></select>
                </div>
                <div>
                    <label class="block text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1.5">Finalidade</label>
                    <select id="select-finalidade-envio" class="w-full p-3 border border-slate-200 rounded-xl text-xs bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700">
                        <option value="assinar">Assinar</option>
                        <option value="distribuir">Distribuir</option>
                        <option value="corrigir">Corrigir</option>
                    </select>
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

            <div id="config-devolver-dist" class="hidden bg-white p-5 rounded-2xl border border-slate-200 mb-6 shadow-sm space-y-4">
                <div>
                    <label class="block text-[10px] font-black text-cyan-600 uppercase tracking-widest mb-1.5">Observação para a distribuição</label>
                    <textarea id="notas-devolver-dist" rows="2" class="w-full p-3 border border-slate-200 rounded-xl text-xs bg-slate-50 outline-none focus:ring-2 focus:ring-cyan-500 resize-none"></textarea>
                </div>
            </div>

            <div id="config-transferencia" class="hidden bg-white p-5 rounded-2xl border border-slate-200 mb-6 shadow-sm space-y-4">
                <div>
                    <label class="block text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-1.5">Transferir para</label>
                    <select id="select-transferir-colega" class="w-full p-3 border border-slate-200 rounded-xl text-xs bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-700"></select>
                </div>
            </div>

            <button id="btn-finalizar-dinamico" class="w-full bg-slate-900 hover:bg-slate-950 text-white font-black py-4 rounded-2xl shadow-lg transition-all text-xs uppercase tracking-widest active:scale-95 flex justify-center items-center gap-2 mt-auto mb-2">
                EXECUTAR AÇÃO ${ico('arrowRight', 'w-4 h-4')}
            </button>
        `;

        aba.innerHTML = html;
        this.povoarSelectsDinamicos();
        this.atualizarListaDemandasInterfaceExterna();
        this._setupGeradorVerde(assistido);

        this.fluxoSelecionado = 'direto';
        this.subFluxoDireto = 'normal';

        // Alternância entre Concluir Normal, Reagendar e Cancelar dentro de Finalizar
        const botoesSubFluxo = aba.querySelectorAll('.btn-subfluxo-direto');
        const boxCnp = document.getElementById('box-cnp-finalizar');
        const boxMotivo = document.getElementById('box-motivo-reagendar-cancelar');
        const labelMotivo = document.getElementById('label-motivo-reagendar-cancelar');
        const inputMotivo = document.getElementById('input-motivo-reagendar-cancelar');

        botoesSubFluxo.forEach(btn => {
            btn.addEventListener('click', () => {
                const sub = btn.dataset.subfluxo;
                this.subFluxoDireto = sub;

                botoesSubFluxo.forEach(b => {
                    b.className = 'btn-subfluxo-direto py-2.5 px-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 font-black text-[10px] uppercase tracking-wider transition';
                });

                if (sub === 'normal') {
                    btn.className = 'btn-subfluxo-direto py-2.5 px-2 rounded-xl border border-emerald-500 bg-emerald-50 text-emerald-800 font-black text-[10px] uppercase tracking-wider transition shadow-sm';
                    boxCnp?.classList.remove('hidden');
                    boxMotivo?.classList.add('hidden');
                } else if (sub === 'reagendar') {
                    btn.className = 'btn-subfluxo-direto py-2.5 px-2 rounded-xl border border-amber-500 bg-amber-50 text-amber-800 font-black text-[10px] uppercase tracking-wider transition shadow-sm';
                    boxCnp?.classList.add('hidden');
                    boxMotivo?.classList.remove('hidden');
                    if (labelMotivo) labelMotivo.textContent = 'Motivo do Reagendamento (Obrigatório)';
                    if (inputMotivo) {
                        inputMotivo.placeholder = 'Ex: Faltou documentação, assistido pediu nova data...';
                        inputMotivo.focus();
                    }
                } else if (sub === 'cancelar') {
                    btn.className = 'btn-subfluxo-direto py-2.5 px-2 rounded-xl border border-rose-500 bg-rose-50 text-rose-800 font-black text-[10px] uppercase tracking-wider transition shadow-sm';
                    boxCnp?.classList.add('hidden');
                    boxMotivo?.classList.remove('hidden');
                    if (labelMotivo) labelMotivo.textContent = 'Motivo do Cancelamento (Obrigatório)';
                    if (inputMotivo) {
                        inputMotivo.placeholder = 'Ex: Desistiu do atendimento, não quis prosseguir...';
                        inputMotivo.focus();
                    }
                }
            });
        });

        const botoesFluxo = document.querySelectorAll('.fluxo-opt-btn');
        const configBoxes = {
            'direto': document.getElementById('config-numero-processo'),
            'distribuicao': document.getElementById('config-distribuicao'),
            'correcao': document.getElementById('config-correcao'),
            'devolver': document.getElementById('config-devolver'),
            'devolverDist': document.getElementById('config-devolver-dist'),
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
                'devolverDist': 'bg-cyan-50 border border-cyan-300 ring-2 ring-cyan-100 shadow-md',
                'transferir': 'bg-indigo-50 border border-indigo-300 ring-2 ring-indigo-100 shadow-md',
                'pausar': 'bg-slate-100 border border-slate-400 ring-2 ring-slate-200 shadow-md'
            };
            btnClicado.className = `fluxo-opt-btn ${coresAvas[fluxo]} p-4 rounded-2xl text-left transition-all shadow-md group`;

            Object.keys(configBoxes).forEach(key => {
                if (configBoxes[key]) configBoxes[key].classList.add('hidden');
            });
            if (configBoxes[fluxo]) configBoxes[fluxo].classList.remove('hidden');
        };

        document.getElementById('btn-opt-direto')?.addEventListener('click', (e) => setAtivo(e.currentTarget, 'direto'));
        document.getElementById('btn-opt-dist')?.addEventListener('click', (e) => setAtivo(e.currentTarget, 'distribuicao'));
        document.getElementById('btn-opt-correcao')?.addEventListener('click', (e) => setAtivo(e.currentTarget, 'correcao'));
        document.getElementById('btn-opt-devolver')?.addEventListener('click', (e) => setAtivo(e.currentTarget, 'devolver'));
        document.getElementById('btn-opt-devolver-dist')?.addEventListener('click', (e) => setAtivo(e.currentTarget, 'devolverDist'));
        document.getElementById('btn-opt-transferir')?.addEventListener('click', (e) => setAtivo(e.currentTarget, 'transferir'));
        document.getElementById('btn-opt-pausar')?.addEventListener('click', (e) => setAtivo(e.currentTarget, 'pausar'));

        document.getElementById('btn-opt-direto')?.click();

        document.getElementById('btn-add-demanda-externo').onclick = () => this.adicionarNovaDemandaFluxoExterno();
        document.getElementById('btn-finalizar-dinamico').onclick = () => this.finalizarProcesso();
    },

    adicionarNovaDemandaFluxoExterno() {
        const input = document.getElementById('input-nova-demanda-externo');
        const text = input ? input.value.trim() : '';
        if (text) {
            this.demandasAdicionaisLocais.push(text);
            input.value = '';
            this.atualizarListaDemandasInterfaceExterna();
        }
    },

    removerDemandaFluxoExterno(index) {
        this.demandasAdicionaisLocais.splice(index, 1);
        this.atualizarListaDemandasInterfaceExterna();
    },

    atualizarListaDemandasInterfaceExterna() {
        const container = document.getElementById('container-lista-demandas-externo');
        if (!container) return;
        container.innerHTML = '';

        if (this.demandasAdicionaisLocais.length === 0) {
            container.innerHTML = `<p class="text-[10px] text-indigo-400 font-medium text-center py-3 bg-white/50 rounded-xl border border-dashed border-indigo-200">Nenhum caso extra somado.</p>`;
            return;
        }

        this.demandasAdicionaisLocais.forEach((dem, index) => {
            const div = document.createElement('div');
            div.className = "flex justify-between items-center bg-white border border-indigo-100 p-2.5 rounded-xl shadow-sm text-xs";
            div.innerHTML = `
                <span class="font-bold text-slate-700 flex items-center gap-1.5">${ico('scale', 'w-3 h-3 text-indigo-400')} ${escapeHTML(dem)}</span>
                <button type="button" class="text-[9px] font-bold text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-2 py-1 rounded-lg transition-colors" data-index="${index}">Remover</button>
            `;
            div.querySelector('button').onclick = () => this.removerDemandaFluxoExterno(index);
            container.appendChild(div);
        });
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

        // Captura unificada do CNP / ID do Caso no VERDE
        const numProcessoSeguro = (
            document.getElementById('input-numero-caso')?.value.trim() ||
            document.getElementById('input-id-caso-verde')?.value.trim() ||
            this.assistidoData?.numeroProcesso ||
            ''
        );

        const colabSeguro = this.colaboradorNome || 'Sistema';
        const pautaIdSeguro = this.pautaId || '';
        const assistidoIdSeguro = this.assistidoId || '';

        // Validação de motivo obrigatório caso seja Reagendar ou Cancelar
        if (this.fluxoSelecionado === 'direto' && (this.subFluxoDireto === 'reagendar' || this.subFluxoDireto === 'cancelar')) {
            const motivoDigitado = document.getElementById('input-motivo-reagendar-cancelar')?.value.trim() || '';
            if (!motivoDigitado) {
                alert(`É obrigatório informar o motivo para ${this.subFluxoDireto === 'reagendar' ? 'reagendar' : 'cancelar'} o atendimento.`);
                document.getElementById('input-motivo-reagendar-cancelar')?.focus();
                return;
            }
        }

        this.isProcessing = true;
        const btnFinalizar = document.getElementById('btn-finalizar-dinamico');
        btnFinalizar.disabled = true;
        btnFinalizar.innerHTML = '<span class="animate-pulse">PROCESSANDO...</span>';

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

                if (this.subFluxoDireto === 'reagendar' || this.subFluxoDireto === 'cancelar') {
                    const ehReagendar = this.subFluxoDireto === 'reagendar';
                    const motivo = document.getElementById('input-motivo-reagendar-cancelar')?.value.trim() || '';
                    const rotuloMotivo = ehReagendar ? `Reagendado: ${motivo}` : `Cancelado: ${motivo}`;

                    await updateDoc(docRef, {
                        ...atualizacaoDeResponsavel,
                        status: 'atendido',
                        attendedBy: colabSeguro,
                        enviadoPor: enviadoPorColaborador,
                        trabalhosPorUsuario: mapaProdutividadeBI,
                        attendedAt: timestampIso,
                        finalizadoPeloColaborador: true,
                        numeroProcesso: numProcessoSeguro,
                        idCasoVerde: numProcessoSeguro,
                        motivoEncerramento: rotuloMotivo,
                        demandas: objetoDemandasFinal,
                        historicoAcoes: arrayUnion(this._registroHistorico(`${ehReagendar ? 'Atendimento reagendado' : 'Atendimento cancelado'} — Motivo: ${motivo}`, timestampIso, colabSeguro)),
                        history: arrayUnion({
                            action: ehReagendar ? 'REAGENDADO' : 'CANCELADO',
                            by: colabSeguro,
                            msg: rotuloMotivo,
                            at: timestampIso
                        })
                    });

                    tituloSucesso = ehReagendar ? "Caso Reagendado!" : "Atendimento Cancelado!";
                    subtituloSucesso = `Motivo registrado: ${motivo}`;
                } else {
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
                        idCasoVerde: numProcessoSeguro,
                        demandas: objetoDemandasFinal,
                        historicoAcoes: arrayUnion(this._registroHistorico(statusDestinoFinal === 'atendido' ? (numProcessoSeguro ? `Atendimento concluído na Mesa Digital — CNP ${numProcessoSeguro}` : 'Atendimento concluído na Mesa Digital') : 'Aprovado na Mesa Digital, aguardando nº do processo', timestampIso, colabSeguro)),
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
            }
            else if (this.fluxoSelecionado === 'distribuicao') {
                const def = document.getElementById('select-defensor-distribuicao')?.value || '';
                const nota = document.getElementById('notas-distribuicao-dinamico')?.value || '';
                const rawFinalidade = document.getElementById('select-finalidade-envio')?.value || 'assinar';
                const finalidade = ['assinar', 'distribuir', 'corrigir'].includes(rawFinalidade) ? rawFinalidade : 'assinar';
                const verboFinalidade = finalidade === 'distribuir' ? 'distribuição' : (finalidade === 'corrigir' ? 'correção' : 'assinatura');

                if (!def) {
                    alert("Obrigatório selecionar um Defensor.");
                    this.isProcessing = false;
                    btnFinalizar.disabled = false;
                    btnFinalizar.innerHTML = `EXECUTAR AÇÃO ${ico('arrowRight', 'w-4 h-4 inline-block')}`;
                    return;
                }

                colaboradorDestinoObj = this.todosColaboradores.find(c => c.nome === def);
                const statusEnvio = finalidade === 'corrigir' ? 'aguardandoCorrecao' : 'aguardandoDistribuicao';

                await updateDoc(docRef, {
                    ...atualizacaoDeResponsavel,
                    status: statusEnvio,
                    defensorResponsavel: def,
                    notasRevisao: nota,
                    reviewMotivoDevolucao: finalidade === 'corrigir' ? nota : null,
                    numeroProcesso: numProcessoSeguro,
                    idCasoVerde: numProcessoSeguro,
                    finalidadeEnvio: finalidade,
                    enviadoEm: timestampIso,
                    distributionStatus: 'pending',
                    enviadoPor: colabSeguro,
                    delegationToken: novoToken,
                    demandas: objetoDemandasFinal,
                    historicoAcoes: arrayUnion(this._registroHistorico(`Enviado para ${verboFinalidade} do Defensor(a) ${def}`, timestampIso, colabSeguro)),
                    history: arrayUnion({
                        action: finalidade === 'corrigir' ? 'ENVIADO_PARA_CORRECAO' : 'ENVIADO_PARA_REVISAO',
                        by: colabSeguro,
                        msg: nota || `Enviado para ${verboFinalidade} do Defensor(a) ${def}`,
                        at: timestampIso
                    })
                });

                tituloSucesso = finalidade === 'corrigir' ? "Enviado p/ Correção!" : "Enviado ao Defensor!";
                subtituloSucesso = `O Defensor(a) ${def} já recebeu o caso para ${verboFinalidade}.`;
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
                    numeroProcesso: numProcessoSeguro,
                    idCasoVerde: numProcessoSeguro,
                    finalidadeEnvio: 'corrigir',
                    enviadoEm: timestampIso,
                    enviadoPor: colabSeguro,
                    delegationToken: novoToken,
                    demandas: objetoDemandasFinal,
                    historicoAcoes: arrayUnion(this._registroHistorico(`Enviado para avaliação do Defensor(a) ${def}`, timestampIso, colabSeguro)),
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
                    assignedCollaborator: { id: colaboradorDestinoObj?.id || 'manual', name: serv, email: colaboradorDestinoObj?.email || '' },
                    inAttendanceTime: timestampIso,
                    numeroProcesso: numProcessoSeguro,
                    idCasoVerde: numProcessoSeguro,
                    delegationToken: novoToken,
                    historicoTransferencia: `Devolvido p/ Correção por ${colabSeguro}. Msg: ${nota}`,
                    demandas: objetoDemandasFinal,
                    historicoAcoes: arrayUnion(this._registroHistorico(`Devolvido para correção na mesa de ${serv}`, timestampIso, colabSeguro)),
                    history: arrayUnion({
                        action: 'DEVOLVIDO_COM_ERRO',
                        by: colabSeguro,
                        msg: nota || `Retornado para correção na mesa de ${serv}`,
                        at: timestampIso
                    })
                });

                if (colaboradorDestinoObj?.id) {
                    updateDoc(doc(db, "pautas", pautaIdSeguro, "collaborators", colaboradorDestinoObj.id), { status: 'ocupado', currentAttendance: assistidoIdSeguro }).catch(() => {});
                }
                tituloSucesso = "Processo Devolvido!";
                subtituloSucesso = `O colega ${serv} deve corrigir o documento.`;
            }
            else if (this.fluxoSelecionado === 'devolverDist') {
                const nota = document.getElementById('notas-devolver-dist')?.value || '';

                await updateDoc(docRef, {
                    status: 'aguardandoDistribuicao',
                    distributionStatus: 'pending',
                    defensorResponsavel: null,
                    finalidadeEnvio: 'distribuir',
                    enviadoEm: timestampIso,
                    notasRevisao: nota,
                    numeroProcesso: numProcessoSeguro,
                    idCasoVerde: numProcessoSeguro,
                    demandas: objetoDemandasFinal,
                    historicoAcoes: arrayUnion(this._registroHistorico('Devolvido para a distribuição', timestampIso, colabSeguro)),
                    history: arrayUnion({
                        action: 'DEVOLVIDO_PARA_DISTRIBUICAO',
                        by: colabSeguro,
                        msg: nota || 'Devolvido pelo defensor para a fila de distribuição',
                        at: timestampIso
                    })
                });

                tituloSucesso = "Devolvido à Distribuição!";
                subtituloSucesso = "O caso voltou para a fila de distribuição.";
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
                    assignedCollaborator: { id: colaboradorDestinoObj?.id || 'manual', name: colega, email: colaboradorDestinoObj?.email || '' },
                    inAttendanceTime: timestampIso,
                    numeroProcesso: numProcessoSeguro,
                    idCasoVerde: numProcessoSeguro,
                    delegationToken: novoToken,
                    historicoTransferencia: `Transferência de ${colabSeguro} para ${colega}.`,
                    demandas: objetoDemandasFinal,
                    historicoAcoes: arrayUnion(this._registroHistorico(`Transferido para a mesa de ${colega}`, timestampIso, colabSeguro)),
                    history: arrayUnion({
                        action: 'TRANSFERENCIA_DE_CASO',
                        by: colabSeguro,
                        msg: `Caso repassado para a mesa do colega ${colega}`,
                        at: timestampIso
                    })
                });

                if (colaboradorDestinoObj?.id) {
                    updateDoc(doc(db, "pautas", pautaIdSeguro, "collaborators", colaboradorDestinoObj.id), { status: 'ocupado', currentAttendance: assistidoIdSeguro }).catch(() => {});
                }
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
                    numeroProcesso: numProcessoSeguro,
                    idCasoVerde: numProcessoSeguro,
                    demandas: objetoDemandasFinal,
                    historicoAcoes: arrayUnion(this._registroHistorico('Atendimento pausado e devolvido à fila de espera', timestampIso, colabSeguro)),
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

            this.voltarParaDashboard();

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
    }
};

export default AtendimentoExternoService;
window.AtendimentoExternoService = AtendimentoExternoService;
