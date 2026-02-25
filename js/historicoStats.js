// js/historicoStats.js
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/**
 * Carrega estatísticas históricas de atendimentos
 * @param {Object} db - Instância do Firestore
 * @param {string} pautaId - ID da pauta (opcional, se não fornecido, busca todas)
 * @returns {Promise<Object>} - Dados estatísticos
 */
export async function loadHistoricoStats(db, pautaId = null) {
    try {
        let stats = {
            totalAtendimentos: 0,
            porAssunto: {},
            porPeriodo: {},
            tempoMedioAtendimento: 0,
            taxaAbsenteismo: 0
        };

        if (pautaId) {
            // Busca apenas de uma pauta específica
            const attendancesRef = collection(db, "pautas", pautaId, "attendances");
            const snapshot = await getDocs(attendancesRef);
            
            stats = processarAtendimentos(snapshot.docs);
        } else {
            // Busca de todas as pautas do usuário
            // Implementar conforme necessidade
            console.log("Buscando estatísticas de todas as pautas");
        }

        return stats;
    } catch (error) {
        console.error("Erro ao carregar histórico:", error);
        return null;
    }
}

/**
 * Processa os documentos de atendimento para gerar estatísticas
 * @param {Array} docs - Array de documentos do Firestore
 * @returns {Object} - Estatísticas processadas
 */
function processarAtendimentos(docs) {
    const stats = {
        totalAtendimentos: docs.length,
        porAssunto: {},
        porPeriodo: {
            manha: 0,  // 06h-12h
            tarde: 0,  // 12h-18h
            noite: 0   // 18h-22h
        },
        temposAtendimento: [],
        totalFaltas: 0
    };

    docs.forEach(doc => {
        const data = doc.data();
        
        // Estatísticas por assunto
        if (data.subject) {
            stats.porAssunto[data.subject] = (stats.porAssunto[data.subject] || 0) + 1;
        }

        // Estatísticas por período do dia
        if (data.scheduledTime) {
            const hora = parseInt(data.scheduledTime.split(':')[0]);
            if (hora >= 6 && hora < 12) stats.porPeriodo.manha++;
            else if (hora >= 12 && hora < 18) stats.porPeriodo.tarde++;
            else if (hora >= 18 && hora < 22) stats.porPeriodo.noite++;
        }

        // Tempo de atendimento (se tiver arrivalTime e attendedTime)
        if (data.arrivalTime && data.attendedTime) {
            const chegada = new Date(data.arrivalTime).getTime();
            const saida = new Date(data.attendedTime).getTime();
            const tempoMinutos = (saida - chegada) / (1000 * 60);
            
            if (tempoMinutos > 0 && tempoMinutos < 1440) { // Ignorar valores absurdos
                stats.temposAtendimento.push(tempoMinutos);
            }
        }

        // Contar faltas
        if (data.status === 'faltoso') {
            stats.totalFaltas++;
        }
    });

    // Calcular tempo médio
    if (stats.temposAtendimento.length > 0) {
        const soma = stats.temposAtendimento.reduce((acc, t) => acc + t, 0);
        stats.tempoMedioAtendimento = Math.round(soma / stats.temposAtendimento.length);
    }

    // Calcular taxa de absenteísmo
    if (stats.totalAtendimentos > 0) {
        stats.taxaAbsenteismo = ((stats.totalFaltas / stats.totalAtendimentos) * 100).toFixed(1);
    }

    return stats;
}

/**
 * Exporta estatísticas em formato CSV
 * @param {Object} stats - Objeto com estatísticas
 * @returns {string} - String formatada em CSV
 */
export function exportStatsToCSV(stats) {
    let csv = 'Tipo,Valor\n';
    csv += `Total de Atendimentos,${stats.totalAtendimentos}\n`;
    csv += `Taxa de Absenteísmo,${stats.taxaAbsenteismo}%\n`;
    csv += `Tempo Médio de Atendimento,${stats.tempoMedioAtendimento} minutos\n\n`;
    
    csv += 'ASSUNTOS\n';
    csv += 'Assunto,Quantidade\n';
    Object.entries(stats.porAssunto).forEach(([assunto, qtd]) => {
        csv += `${assunto},${qtd}\n`;
    });
    
    csv += '\nPERÍODOS\n';
    csv += 'Período,Quantidade\n';
    csv += `Manhã (06h-12h),${stats.porPeriodo.manha}\n`;
    csv += `Tarde (12h-18h),${stats.porPeriodo.tarde}\n`;
    csv += `Noite (18h-22h),${stats.porPeriodo.noite}\n`;
    
    return csv;
}
