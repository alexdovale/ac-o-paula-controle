// js/pdfService.js - O arquivo do Relatório

import { escapeHTML } from './utils.js';

export const generateAtendidosPDF = (pautaName, atendidos) => {
    const { jsPDF } = window.jspdf;
    const docPDF = new jsPDF({ orientation: 'l', unit: 'pt', format: 'a4' });

    docPDF.setFontSize(18);
    docPDF.text(`Relatório de Atendidos - ${pautaName}`, 14, 25);
    
    const tableColumn = ["#", "Nome", "Agendado", "Chegou", "Finalizado", "Assunto", "Atendente"];
    const tableRows = atendidos.map((item, index) => [
        index + 1,
        item.name,
        item.scheduledTime || 'Avulso',
        item.arrivalTime ? new Date(item.arrivalTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'N/A',
        item.attendedTime ? new Date(item.attendedTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'N/A',
        item.subject,
        typeof item.attendant === 'object' ? item.attendant.nome : item.attendant || 'Não informado'
    ]);

    docPDF.autoTable(tableColumn, tableRows, { 
        startY: 45,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [22, 163, 74] } 
    });

    docPDF.save(`Relatorio_${pautaName}.pdf`);
};
