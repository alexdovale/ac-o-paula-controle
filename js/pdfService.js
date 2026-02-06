/**
 * js/pdfService.js - SIGAP
 * Gerador de Relatórios em PDF
 */

const cleanString = (str) => String(str || '').replace(/"/g, '');

const getSafeDate = (timeValue) => {
    if (!timeValue) return null;
    if (typeof timeValue === 'object' && timeValue.seconds) {
        return new Date(timeValue.seconds * 1000);
    }
    const date = new Date(timeValue);
    return isNaN(date.getTime()) ? null : date;
};

const calculateDuration = (totalMinutes) => {
    if (totalMinutes === null || totalMinutes < 0) return 'N/A';
    if (totalMinutes >= 60) {
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
    return `${totalMinutes} min`;
};

/**
 * GERA O RELATÓRIO DE ATENDIDOS
 */
export const generateAtendidosPDF = (pautaName, atendidos) => {
    try {
        const { jsPDF } = window.jspdf;
        const docPDF = new jsPDF({ orientation: 'l', unit: 'pt', format: 'a4' }); 

        // Cabeçalho
        docPDF.setFontSize(18);
        docPDF.setTextColor(22, 101, 52); 
        docPDF.text(`Relatório de Atendidos - ${pautaName}`, 40, 40);
        
        docPDF.setFontSize(10);
        docPDF.setTextColor(100);
        const totalAssuntos = atendidos.reduce((acc, a) => acc + 1 + (a.demandas?.quantidade || 0), 0);
        docPDF.text(`Data: ${new Date().toLocaleString('pt-BR')}`, 40, 55);
        docPDF.text(`Total: ${atendidos.length} assistidos | ${totalAssuntos} assuntos`, 40, 68);

        const tableColumn = ["#", "Nome", "Agendado", "Chegou", "Finalizado", "Duração", "Assunto Principal", "Atendente", "Confirmado"]; 
        const tableRows = [];

        atendidos.forEach((item, index) => {
            const arrivalDate = getSafeDate(item.arrivalTime);
            const attendedDate = getSafeDate(item.attendedTime);
            let duration = 'N/A';
            let formattedArrival = arrivalDate ? arrivalDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'N/A';
            let formattedAttended = attendedDate ? attendedDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'N/A';

            if (arrivalDate && attendedDate) {
                const diffMs = attendedDate.getTime() - arrivalDate.getTime();
                duration = calculateDuration(Math.round(diffMs / 60000));
            }
            
            const attendantName = (typeof item.attendant === 'object' && item.attendant !== null) 
                                ? item.attendant.nome || item.attendant.name || 'N/A'
                                : item.attendant || 'N/A';

            tableRows.push([
                index + 1,
                cleanString(item.name),
                item.scheduledTime || (item.type === 'avulso' ? 'Avulso' : 'N/A'),
                formattedArrival,
                formattedAttended,
                duration,
                cleanString(item.subject),
                cleanString(attendantName),
                item.isConfirmed ? "SIM" : "NÃO"
            ]);
        });

        docPDF.autoTable({
            head: [tableColumn],
            body: tableRows,
            startY: 80,
            theme: 'striped',
            styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak' },
            headStyles: { fillColor: [22, 163, 74] },
            columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 100 }, 6: { cellWidth: 140 } }
        });
        
        docPDF.save(`atendidos_${pautaName.replace(/\s+/g, '_')}.pdf`);
    } catch (error) {
        console.error("Erro no PDF Atendidos:", error);
        alert("Erro ao gerar o PDF. Verifique o console do navegador.");
    }
};

/**
 * GERA A LISTA DE PRESENÇA DA EQUIPE (DINÂMICA)
 */
export const generateCollaboratorsPDF = (pautaName, colaboradores, selectedCols = ['nome', 'cargo', 'equipe', 'presenca', 'transporte']) => {
    try {
        const { jsPDF } = window.jspdf;
        const docPDF = new jsPDF();

        const colMap = {
            'nome': { label: 'Membro', getData: (c) => c.nome },
            'cargo': { label: 'Cargo', getData: (c) => c.cargo || 'N/A' },
            'equipe': { label: 'Equipe', getData: (c) => c.equipe ? `EQP ${c.equipe}` : 'N/A' },
            'presenca': { label: 'Horário', getData: (c) => c.presente ? c.horario : 'Ausente' },
            'transporte': { label: 'Transporte', getData: (c) => c.transporte || 'N/A' }
        };

        const header = [selectedCols.map(key => colMap[key].label)];
        const tableData = colaboradores.map(c => selectedCols.map(key => colMap[key].getData(c)));

        docPDF.setFontSize(16);
        docPDF.setTextColor(139, 92, 246);
        docPDF.text("Lista de Presença da Equipe", 14, 25);
        docPDF.text(`Pauta: ${pautaName}`, 14, 40);

        docPDF.autoTable({
            head: header,
            body: tableData,
            startY: 50,
            headStyles: { fillColor: [139, 92, 246] },
            styles: { fontSize: 8 }
        });

        docPDF.save(`equipe_${pautaName.replace(/\s+/g, '_')}.pdf`);
    } catch (e) {
        console.error("Erro no PDF Equipe:", e);
    }
};
