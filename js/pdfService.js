// js/pdfService.js

export const generateAtendidosPDF = (pautaName, atendidos) => {
    const { jsPDF } = window.jspdf;
    const docPDF = new jsPDF({ orientation: 'l', unit: 'pt', format: 'a4' });

    docPDF.setFontSize(18);
    docPDF.text(`Relatório de Atendidos - ${pautaName}`, 14, 25);
    
    docPDF.setFontSize(10);
    docPDF.text(`Data: ${new Date().toLocaleDateString('pt-BR')} | Total: ${atendidos.length}`, 14, 40);

    const tableColumn = ["#", "Nome", "Agendado", "Chegou", "Finalizado", "Duração", "Assunto", "Atendente"];
    
    const tableRows = atendidos.map((item, index) => {
        const arrivalDate = item.arrivalTime ? new Date(item.arrivalTime) : null;
        const attendedDate = item.attendedTime ? (item.attendedTime.seconds ? new Date(item.attendedTime.seconds * 1000) : new Date(item.attendedTime)) : null;
        
        let duration = 'N/A';
        if (arrivalDate && attendedDate && !isNaN(attendedDate)) {
            const diffMs = attendedDate.getTime() - arrivalDate.getTime();
            const totalMins = Math.round(diffMs / 60000);
            duration = totalMins >= 60 ? 
                `${Math.floor(totalMins/60)}h ${totalMins%60}min` : 
                `${totalMins} min`;
        }

        return [
            index + 1,
            item.name,
            item.scheduledTime || (item.type === 'avulso' ? 'Avulso' : 'N/A'),
            arrivalDate ? arrivalDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'N/A',
            attendedDate ? attendedDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'N/A',
            duration,
            item.subject,
            typeof item.attendant === 'object' ? (item.attendant.nome || item.attendant.name) : (item.attendant || 'N/A')
        ];
    });

    docPDF.autoTable(tableColumn, tableRows, { 
        startY: 50,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [22, 163, 74] }, // Verde Tailwind
        alternateRowStyles: { fillColor: [240, 240, 240] }
    });

    docPDF.save(`Relatorio_${pautaName.replace(/\s+/g, '_')}.pdf`);
};

export const generateCollaboratorsPDF = (pautaName, colaboradores) => {
    const { jsPDF } = window.jspdf;
    const docPDF = new jsPDF();
    const presentes = colaboradores.filter(c => c.presente);

    docPDF.setFontSize(16);
    docPDF.text(`Lista de Presença: ${pautaName}`, 14, 20);

    const head = [['Nome', 'Cargo', 'Equipe', 'Transporte', 'Horário']];
    const body = presentes.map(c => [
        c.nome, 
        c.cargo || 'N/A', 
        c.equipe || 'N/A', 
        c.transporte || 'N/A', 
        c.horario || '--:--'
    ]);

    docPDF.autoTable({
        head: head,
        body: body,
        startY: 30,
        headStyles: { fillColor: [37, 99, 235] } // Azul
    });

    docPDF.save(`Equipe_${pautaName.replace(/\s+/g, '_')}.pdf`);
};
