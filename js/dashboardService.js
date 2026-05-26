// js/dashboardService.js - DASHBOARD GLOBAL DO USUÁRIO (MODERNIZADO)

import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showNotification } from './utils.js';
import { UIService } from './ui.js';

export const DashboardService = {
    appInstance: null,

    /**
     * Inicializa o DashboardService com a instância do aplicativo.
     */
    init(app) {
        this.appInstance = app;
    },

    /**
     * Mostra a tela do Dashboard e exibe o estado de carregamento.
     */
    async showDashboardScreen() {
        if (!this.appInstance || !this.appInstance.auth?.currentUser) {
            showNotification("Usuário não autenticado para acessar o Dashboard.", "error");
            UIService.showScreen('login');
            return;
        }

        UIService.showScreen('dashboard'); 

        const dashboardContent = document.getElementById('dashboard-content');
        if (dashboardContent) {
            // Skeleton Loading Premium
            dashboardContent.innerHTML = `
                <div class="flex flex-col items-center justify-center py-20 animate-pulse">
                    <div class="w-16 h-16 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
                    <h3 class="text-lg font-bold text-slate-700">Consolidando seus dados...</h3>
                    <p class="text-sm text-slate-500 mt-2">Isso pode levar alguns segundos dependendo do volume de pautas.</p>
                </div>
            `;
        }

        await this.loadDashboardData();
    },

    /**
     * Carrega e processa os dados para o Dashboard.
     */
    async loadDashboardData() {
        if (!this.appInstance || !this.appInstance.db) {
            showNotification("Erro interno de conexão. Tente recarregar a página.", "error");
            return;
        }
    
        const db = this.appInstance.db;
        const currentUser = this.appInstance.auth.currentUser;
        const modoAtual = this.appInstance.currentMode; // ⭐ PEGA O MODO ATUAL
        
        const pautasRef = collection(db, "pautas");
        const q = query(pautasRef, where("members", "array-contains", currentUser.uid));
    
        try {
            const snapshot = await getDocs(q);
            let pautas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // ============================================================
            // ⭐ FILTRO POR MODO (NORMAL vs EVENTO) - MESMA LÓGICA DO MAIN.JS
            // ============================================================
            const tiposNormais = ['normal', 'agendamento', null, undefined, ''];
            const tiposEvento = ['mutirao', 'plantao', 'acao_social', 'mutirão', 'evento'];
            
            if (modoAtual === 'normal') {
                // Modo Normal: APENAS pautas que NÃO são de evento
                pautas = pautas.filter(p => {
                    let tipoPauta = p.tipo || p.type || 'normal';
                    tipoPauta = String(tipoPauta).toLowerCase();
                    return !tiposEvento.includes(tipoPauta);
                });
            } else if (modoAtual === 'evento') {
                // Modo Evento: APENAS pautas que SÃO de evento
                pautas = pautas.filter(p => {
                    let tipoPauta = p.tipo || p.type || '';
                    tipoPauta = String(tipoPauta).toLowerCase();
                    return tiposEvento.includes(tipoPauta);
                });
            }
            
            console.log(`📊 Dashboard - Modo: ${modoAtual}, Pautas filtradas: ${pautas.length}`);
    
            let metricas = {
                ativas: 0,
                total: 0,
                aguardando: 0,
                emMesa: 0,
                concluidos: 0,
                faltosos: 0
            };
    
            const pautasProcessadas = [];
            const now = new Date();
    
            // Processa todas as pautas ativas (menos de 7 dias)
            for (const pauta of pautas) {
                const creationDate = new Date(pauta.createdAt);
                const expirationDate = new Date(creationDate);
                expirationDate.setDate(creationDate.getDate() + 7);
    
                if (now <= expirationDate) {
                    metricas.ativas++;
                    
                    const attendancesRef = collection(db, "pautas", pauta.id, "attendances");
                    const attSnapshot = await getDocs(attendancesRef);
                    const attendances = attSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
                    const aguardando = attendances.filter(a => a.status === 'aguardando').length;
                    const emMesa = attendances.filter(a => a.status === 'emAtendimento' || a.status === 'aguardandoDistribuicao' || a.status === 'aguardandoCorrecao').length;
                    const atendidos = attendances.filter(a => a.status === 'atendido').length;
                    const faltosos = attendances.filter(a => a.status === 'faltoso').length;
    
                    metricas.total += attendances.length;
                    metricas.aguardando += aguardando;
                    metricas.emMesa += emMesa;
                    metricas.concluidos += atendidos;
                    metricas.faltosos += faltosos;
    
                    pautasProcessadas.push({
                        id: pauta.id,
                        name: pauta.name,
                        type: pauta.type,
                        isOwner: pauta.owner === currentUser.uid,
                        total: attendances.length,
                        aguardando,
                        emMesa,
                        atendidos,
                        faltosos,
                    });
                }
            }
    
            this.renderDashboard({ metricas, pautas: pautasProcessadas.sort((a,b) => a.name.localeCompare(b.name)) });
    
        } catch (error) {
            console.error("Erro ao carregar Dashboard:", error);
            showNotification("Falha ao montar o Dashboard geral.", "error");
            document.getElementById('dashboard-content').innerHTML = `
                <div class="bg-red-50 p-6 rounded-xl border border-red-200 text-center">
                    <span class="text-4xl block mb-2">⚠️</span>
                    <h3 class="text-red-800 font-bold">Erro de Carregamento</h3>
                    <p class="text-red-600 text-sm mt-1">Verifique sua conexão e tente novamente.</p>
                </div>`;
        }
    },

    /**
     * Renderiza a interface do Dashboard com os dados.
     */
    renderDashboard(data) {
        const dashboardContent = document.getElementById('dashboard-content');
        if (!dashboardContent) return;

        // 1. Renderiza os Cards das Pautas
        let pautasListHtml = '';
        if (data.pautas.length > 0) {
            pautasListHtml = data.pautas.map(pauta => `
                <button onclick="window.app.loadPauta('${pauta.id}', '${pauta.name}', '${pauta.type}')" 
                        class="w-full text-left bg-white p-5 rounded-2xl shadow-sm border border-slate-200 hover:border-indigo-400 hover:shadow-lg transition-all duration-200 relative group overflow-hidden flex flex-col h-full">
                    
                    <div class="absolute top-0 left-0 w-1 h-full ${pauta.isOwner ? 'bg-indigo-500' : 'bg-slate-300'} group-hover:w-1.5 transition-all"></div>
                    
                    <div class="flex justify-between items-start mb-4 pl-2">
                        <div>
                            <h4 class="font-black text-slate-800 text-lg leading-tight group-hover:text-indigo-700 transition-colors">${pauta.name}</h4>
                            <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">${pauta.isOwner ? '👑 Criada por você' : '🤝 Compartilhada'}</span>
                        </div>
                        <span class="bg-slate-100 text-slate-600 text-xs font-black px-2 py-1 rounded-lg">
                            ${pauta.total}
                        </span>
                    </div>

                    <div class="grid grid-cols-2 gap-2 mt-auto pl-2">
                        <div class="bg-slate-50 p-2 rounded border border-slate-100 flex flex-col justify-between">
                            <span class="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Aguardando</span>
                            <span class="text-base font-black text-slate-700">${pauta.aguardando}</span>
                        </div>
                        <div class="bg-slate-50 p-2 rounded border border-slate-100 flex flex-col justify-between">
                            <span class="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Em Fluxo</span>
                            <span class="text-base font-black text-indigo-600">${pauta.emMesa}</span>
                        </div>
                        <div class="bg-emerald-50 p-2 rounded border border-emerald-100 flex flex-col justify-between">
                            <span class="text-[9px] font-bold text-emerald-600 uppercase tracking-widest">Concluídos</span>
                            <span class="text-base font-black text-emerald-700">${pauta.atendidos}</span>
                        </div>
                        <div class="bg-rose-50 p-2 rounded border border-rose-100 flex flex-col justify-between">
                            <span class="text-[9px] font-bold text-rose-600 uppercase tracking-widest">Faltosos</span>
                            <span class="text-base font-black text-rose-700">${pauta.faltosos}</span>
                        </div>
                    </div>
                </button>
            `).join('');
        } else {
            pautasListHtml = `
                <div class="col-span-full bg-white p-10 rounded-2xl border border-dashed border-slate-300 text-center opacity-70">
                    <span class="text-5xl block mb-4">📭</span>
                    <h3 class="text-lg font-bold text-slate-700">Nenhuma Pauta Ativa</h3>
                    <p class="text-slate-500 text-sm mt-2">Você não possui pautas criadas ou compartilhadas nos últimos 7 dias.</p>
                </div>
            `;
        }

        // 2. Renderiza a Tela Completa
        dashboardContent.innerHTML = `
            <div class="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 mb-8">
                <div class="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                    <div class="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mb-3">📁</div>
                    <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Pautas Ativas</p>
                    <h3 class="text-3xl font-black text-slate-800">${data.metricas.ativas}</h3>
                </div>
                
                <div class="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                    <div class="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center mb-3">👥</div>
                    <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Assistidos (Total)</p>
                    <h3 class="text-3xl font-black text-slate-800">${data.metricas.total}</h3>
                </div>
                
                <div class="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                    <div class="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mb-3">⏳</div>
                    <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Na Recepção</p>
                    <h3 class="text-3xl font-black text-blue-600">${data.metricas.aguardando}</h3>
                </div>

                <div class="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                    <div class="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-3">✅</div>
                    <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Atendidos</p>
                    <h3 class="text-3xl font-black text-emerald-600">${data.metricas.concluidos}</h3>
                </div>

                <div class="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                    <div class="w-8 h-8 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mb-3">🚫</div>
                    <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Faltosos</p>
                    <h3 class="text-3xl font-black text-rose-600">${data.metricas.faltosos}</h3>
                </div>
            </div>

            <div class="flex items-center justify-between mb-4 mt-8 px-1 border-b border-slate-200 pb-2">
                <h3 class="text-lg font-black text-slate-800 flex items-center gap-2">
                    <span class="text-indigo-500">📋</span> Painéis Disponíveis
                </h3>
            </div>
            
            <div id="dashboard-pautas-list" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                ${pautasListHtml}
            </div>
            
            <div class="mt-12 text-center">
                <span class="inline-flex items-center gap-2 bg-slate-100 text-slate-500 px-3 py-1.5 rounded-full text-xs font-bold border border-slate-200 shadow-sm">
                    <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    Sincronizado hoje às ${new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}
                </span>
            </div>
        `;
    }
};
