// js/dashboardService.js

import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showNotification } from './utils.js';
import { UIService } from './ui.js'; // Para mostrar a tela

export const DashboardService = {
    appInstance: null, // Será a instância do SIGAPApp

    /**
     * Inicializa o DashboardService com a instância do aplicativo.
     * @param {object} app - A instância principal do SIGAPApp.
     */
    init(app) {
        this.appInstance = app;
        console.log("📊 DashboardService inicializado.");
    },

    /**
     * Mostra a tela do Dashboard e carrega os dados.
     */
    async showDashboardScreen() {
        if (!this.appInstance || !this.appInstance.auth?.currentUser) {
            showNotification("Usuário não autenticado para acessar o Dashboard.", "error");
            UIService.showScreen('login');
            return;
        }

        console.log("📊 Exibindo tela do Dashboard...");
        UIService.showScreen('dashboard'); // Define a nova tela 'dashboard' no UIService

        // Renderiza o esqueleto de loading
        const dashboardContent = document.getElementById('dashboard-content');
        if (dashboardContent) {
            dashboardContent.innerHTML = '<div class="loader-small mx-auto my-12"></div><p class="text-center text-gray-500 mt-4">Carregando dados do Dashboard...</p>';
        }

        await this.loadDashboardData();
    },

    /**
     * Carrega e processa os dados para o Dashboard.
     */
    async loadDashboardData() {
        if (!this.appInstance || !this.appInstance.db) {
            console.error("Instância do aplicativo ou Firestore não disponíveis.");
            showNotification("Erro interno: dados do app indisponíveis.", "error");
            return;
        }

        const db = this.appInstance.db;
        const currentUser = this.appInstance.auth.currentUser;
        const pautasRef = collection(db, "pautas");

        // Obter todas as pautas que o usuário é membro
        const q = query(pautasRef, where("members", "array-contains", currentUser.uid));

        try {
            const snapshot = await getDocs(q);
            const pautas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            let totalPautasAtivas = 0;
            let totalAssistidosGeral = 0;
            let totalAssistidosAguardando = 0;
            let totalAssistidosEmAtendimento = 0;
            let totalAssistidosAtendidos = 0;
            let totalAssistidosFaltosos = 0;

            const pautasProcessadas = [];

            const now = new Date();

            for (const pauta of pautas) {
                const creationDate = new Date(pauta.createdAt);
                const expirationDate = new Date(creationDate);
                expirationDate.setDate(creationDate.getDate() + 7); // Pautas expiram em 7 dias

                const isExpired = now > expirationDate;

                if (!isExpired) {
                    totalPautasAtivas++;
                    // Buscar atendimentos para cada pauta ativa
                    const attendancesRef = collection(db, "pautas", pauta.id, "attendances");
                    const attSnapshot = await getDocs(attendancesRef);
                    const attendances = attSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                    totalAssistidosGeral += attendances.length;
                    totalAssistidosAguardando += attendances.filter(a => a.status === 'aguardando').length;
                    totalAssistidosEmAtendimento += attendances.filter(a => a.status === 'emAtendimento').length;
                    totalAssistidosAtendidos += attendances.filter(a => a.status === 'atendido').length;
                    totalAssistidosFaltosos += attendances.filter(a => a.status === 'faltoso').length;

                    pautasProcessadas.push({
                        id: pauta.id,
                        name: pauta.name,
                        type: pauta.type,
                        status: pauta.isClosed ? 'Fechada' : 'Aberta',
                        totalAttendances: attendances.length,
                        aguardando: attendances.filter(a => a.status === 'aguardando').length,
                        emAtendimento: attendances.filter(a => a.status === 'emAtendimento').length,
                        atendidos: attendances.filter(a => a.status === 'atendido').length,
                        faltosos: attendances.filter(a => a.status === 'faltoso').length,
                    });
                }
            }

            const dashboardData = {
                totalPautasAtivas,
                totalAssistidosGeral,
                totalAssistidosAguardando,
                totalAssistidosEmAtendimento,
                totalAssistidosAtendidos,
                totalAssistidosFaltosos,
                pautasProcessadas: pautasProcessadas.sort((a,b) => a.name.localeCompare(b.name)), // Ordena por nome
            };
            
            console.log("📊 Dados do Dashboard carregados:", dashboardData);
            this.renderDashboard(dashboardData);

        } catch (error) {
            console.error("Erro ao carregar dados do Dashboard:", error);
            showNotification("Erro ao carregar dados do Dashboard.", "error");
            document.getElementById('dashboard-content').innerHTML = '<p class="text-center text-red-500 mt-4">Não foi possível carregar o Dashboard.</p>';
        }
    },

    /**
     * Renderiza a interface do Dashboard com os dados.
     * @param {object} data - Os dados agregados do dashboard.
     */
    renderDashboard(data) {
        const dashboardContent = document.getElementById('dashboard-content');
        if (!dashboardContent) return;

        let pautasListHtml = '';
        if (data.pautasProcessadas.length > 0) {
            pautasListHtml = data.pautasProcessadas.map(pauta => `
                <div class="bg-white p-4 rounded-lg shadow-sm border border-gray-100 mb-2 hover:shadow-md transition cursor-pointer"
                     onclick="window.app.loadPauta('${pauta.id}', '${pauta.name}', '${pauta.type}')">
                    <h4 class="font-bold text-gray-800 text-lg">${pauta.name}</h4>
                    <p class="text-sm text-gray-600">Total de Assistidos: ${pauta.totalAttendances}</p>
                    <div class="flex flex-wrap gap-x-4 text-xs mt-2">
                        <span class="text-blue-600">Aguardando: ${pauta.aguardando}</span>
                        <span class="text-purple-600">Em Atendimento: ${pauta.emAtendimento}</span>
                        <span class="text-green-600">Atendidos: ${pauta.atendidos}</span>
                        <span class="text-red-600">Faltosos: ${pauta.faltosos}</span>
                    </div>
                </div>
            `).join('');
        } else {
            pautasListHtml = '<p class="text-gray-500 text-center py-8">Nenhuma pauta ativa encontrada.</p>';
        }


        dashboardContent.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div class="bg-blue-100 p-6 rounded-xl text-blue-800 font-bold shadow-md">
                    <p class="text-sm uppercase text-blue-600">Pautas Ativas</p>
                    <h3 class="text-4xl mt-2">${data.totalPautasAtivas}</h3>
                </div>
                <div class="bg-green-100 p-6 rounded-xl text-green-800 font-bold shadow-md">
                    <p class="text-sm uppercase text-green-600">Total de Atendimentos</p>
                    <h3 class="text-4xl mt-2">${data.totalAssistidosGeral}</h3>
                </div>
                <div class="bg-yellow-100 p-6 rounded-xl text-yellow-800 font-bold shadow-md">
                    <p class="text-sm uppercase text-yellow-600">Aguardando</p>
                    <h3 class="text-4xl mt-2">${data.totalAssistidosAguardando}</h3>
                </div>
                <div class="bg-red-100 p-6 rounded-xl text-red-800 font-bold shadow-md">
                    <p class="text-sm uppercase text-red-600">Faltosos</p>
                    <h3 class="text-4xl mt-2">${data.totalAssistidosFaltosos}</h3>
                </div>
            </div>

            <h3 class="text-2xl font-bold text-gray-800 mb-4">Suas Pautas Ativas</h3>
            <div id="dashboard-pautas-list" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                ${pautasListHtml}
            </div>
            
            <div class="mt-12 text-center text-gray-500 text-sm">
                <p>Dados atualizados em: ${new Date().toLocaleString('pt-BR')}</p>
            </div>
        `;
    }
};
