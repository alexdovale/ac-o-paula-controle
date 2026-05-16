// js/historicoStats.js - MOTOR DE ESTATÍSTICAS E BI (MODERNIZADO)

import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

export const HistoricoStatsService = {

    /**
     * Carrega e processa as estatísticas históricas
     * @param {Object} db - Instância do Firestore
     * @param {string} pautaId - ID da pauta (opcional)
     * @returns {Promise<Object>} - Dados estatísticos processados
     */
    async loadHistoricoStats(db, pautaId = null) {
        try {
            let docsData = [];

            if (pautaId) {
                // Busca de uma pauta específica
                const attendancesRef = collection(db, "pautas", pautaId, "attendances");
                const snapshot = await getDocs(attendancesRef);
                docsData = snapshot.docs.map(doc => doc.data());
            } else {
                // Placeholder: Se quiser buscar de TODAS as pautas do usuário no futuro
                console.warn("ID da Pauta não fornecido. Buscas globais precisam de índices configurados no Firebase.");
                return null;
            }

            return this.processarAtendimentos(docsData);
            
        } catch (error) {
            console.error("Erro crítico ao carregar histórico de estatísticas:", error);
            return null;
        }
    },

    /**
     * Motor de cálculo: Processa os dados brutos e transforma em métricas (KPIs)
     */
    processarAtendimentos(docs) {
        const stats = {
            totalGeral: docs.length,
            totalEfetivos: 0, // Apenas quem realmente foi atendido
            totalFaltas: 0,
            porAssunto: {},
            porPeriodo: {
                manha: 0,  // 06h - 11h59
                tarde: 0,  // 12h - 17h59
                noite: 0   // 18h - 23h59
            },
            tempos: {
                esperaRecepcao: [],    // Chegada até Início do Atendimento
                atendimentoMesa: [],   // Início do Atendimento até Finalização
            },
            metricas: {
                tempoMedioEspera: 0,
                tempoMedioAtendimento: 0,
                taxaAbsenteismo: 0
            }
        };

        docs.forEach(data => {
            // 1. Contagem de Status
            if (data.status === 'faltoso') {
                stats.totalFaltas++;
            } else if (data.status === 'atendido') {
                stats.totalEfetivos++;
            }

            // 2. Ranking de Assuntos
            if (data.subject) {
                const assuntoFormatado = data.subject.trim().toUpperCase();
                stats.porAssunto[assuntoFormatado] = (stats.porAssunto[assuntoFormatado] || 0) + 1;
            }

            // 3. Distribuição por Período do Dia (Usando a chegada real ou agendado)
            const horaReferencia = data.arrivalTime || data.scheduledTime;
            if (horaReferencia) {
                try {
                    let hora = 0;
                    if (horaReferencia.includes('T')) {
                        hora = new Date(horaReferencia).getHours();
                    } else if (horaReferencia.includes(':')) {
                        hora = parseInt(horaReferencia.split(':')[0]);
                    }

                    if (hora >= 6 && hora < 12) stats.porPeriodo.manha++;
                    else if (hora >= 12 && hora < 18) stats.porPeriodo.tarde++;
                    else if (hora >= 18) stats.porPeriodo.noite++;
                } catch (e) { /* Ignora erros de formatação de data obscuros */ }
            }

            // 4. Cálculos de Tempo (TMA e TME)
            if (data.arrivalTime && data.inAttendanceTime) {
                const chegada = new Date(data.arrivalTime).getTime();
                const inicioAtend = new Date(data.inAttendanceTime).getTime();
                const diffEspera = (inicioAtend - chegada) / (1000 * 60); // em minutos
                if (diffEspera >= 0 && diffEspera < 1440) stats.tempos.esperaRecepcao.push(diffEspera);
            }

            if (data.inAttendanceTime && data.attendedTime) {
                const inicioAtend = new Date(data.inAttendanceTime).getTime();
                const fimAtend = new Date(data.attendedTime).getTime();
                const diffAtend = (fimAtend - inicioAtend) / (1000 * 60); // em minutos
                if (diffAtend >= 0 && diffAtend < 1440) stats.tempos.atendimentoMesa.push(diffAtend);
            }
        });

        // ============================================
        // CONSOLIDAÇÃO DAS MÉTRICAS (MÉDIAS)
        // ============================================
        const calcMedia = (arr) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

        stats.metricas.tempoMedioEspera = calcMedia(stats.tempos.esperaRecepcao);
        stats.metricas.tempoMedioAtendimento = calcMedia(stats.tempos.atendimentoMesa);
        
        if (stats.totalGeral > 0) {
            stats.metricas.taxaAbsenteismo = ((stats.totalFaltas / stats.totalGeral) * 100).toFixed(1);
        }

        return stats;
    },

    /**
     * Gera o conteúdo CSV de forma segura (tratando vírgulas em textos)
     */
    exportStatsToCSV(stats) {
        if (!stats) return '';

        // Função interna para proteger textos que contenham vírgula (Padrão internacional CSV)
        const formatCSVText = (text) => `"${String(text).replace(/"/g, '""')}"`;

        let csv = 'METRICA,VALOR\n';
        csv += `Total de Assistidos na Pauta,${stats.totalGeral}\n`;
        csv += `Atendimentos Efetivos,${stats.totalEfetivos}\n`;
        csv += `Faltas (Absenteísmo),${stats.totalFaltas} (${stats.metricas.taxaAbsenteismo}%)\n`;
        csv += `Tempo Medio de Espera (Recepcao),${stats.metricas.tempoMedioEspera} min\n`;
        csv += `Tempo Medio de Atendimento (Mesa),${stats.metricas.tempoMedioAtendimento} min\n\n`;
        
        csv += 'RANKING DE ASSUNTOS\n';
        csv += 'Assunto,Quantidade\n';
        
        // Ordena assuntos do maior para o menor
        const assuntosOrdenados = Object.entries(stats.porAssunto).sort((a, b) => b[1] - a[1]);
        assuntosOrdenados.forEach(([assunto, qtd]) => {
            csv += `${formatCSVText(assunto)},${qtd}\n`;
        });
        
        csv += '\nFLUXO POR PERIODO\n';
        csv += 'Periodo,Quantidade\n';
        csv += `Manha (06h-12h),${stats.porPeriodo.manha}\n`;
        csv += `Tarde (12h-18h),${stats.porPeriodo.tarde}\n`;
        csv += `Noite (18h-23h),${stats.porPeriodo.noite}\n`;
        
        return csv;
    },

    /**
     * Dispara o download automático do CSV gerado
     */
    downloadCSV(stats, pautaName = "Estatisticas") {
        const csvContent = this.exportStatsToCSV(stats);
        if (!csvContent) return;

        // Adiciona BOM para forçar o Excel a ler caracteres especiais (Acentos, ç, etc) corretamente
        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        
        const dataHoje = new Date().toISOString().split('T')[0];
        const nomeArquivoSeguro = pautaName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        
        link.setAttribute("href", url);
        link.setAttribute("download", `relatorio_kpi_${nomeArquivoSeguro}_${dataHoje}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};
