// js/historicoStats.js
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/**
 * Salva um snapshot permanente da pauta antes dela sumir do sistema
 */
export const salvarEstatisticaPermanente = async (db, pautaData, atendimentos) => {
    const statsRef = collection(db, "estatisticas_permanentes");
    
    // Compila os dados da pauta
    const resumo = {
        pautaId: pautaData.id || 'N/A',
        nomePauta: pautaData.name,
        criador: pautaData.ownerName || pautaData.ownerEmail,
        dataCriacao: pautaData.createdAt,
        dataFechamento: new Date().toISOString(),
        totalAtendidos: atendimentos.filter(a => a.status === 'atendido').length,
        totalFaltosos: atendimentos.filter(a => a.status === 'faltoso').length,
        assuntos: atendimentos.map(a => a.subject),
        timestamp: serverTimestamp()
    };

    return await addDoc(statsRef, resumo);
};
