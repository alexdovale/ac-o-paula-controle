// js/pdfService.js 

/**
 * Função utilitária para limpar strings e evitar erros no PDF
 */
const cleanString = (str) => String(str || '').replace(/"/g, '');

/**
 * Converte valores de tempo (ISO ou Timestamp) em objeto Date seguro
 */
const getSafeDate = (timeValue) => {
    if (!timeValue) return null;
    if (typeof timeValue === 'object' && timeValue.seconds) {
        return new Date(timeValue.seconds * 1000);
    }
    const date = new Date(timeValue);
    return isNaN(date.getTime()) ? null : date;
};

/**
 * Calcula a duração entre chegada e finalização em formato amigável
 */
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

        // Cabeçalho do Documento
        docPDF.setFontSize(18);
        docPDF.setTextColor(22, 101, 52); // Verde Escuro
        docPDF.text(`Relatório de Atendidos - ${pautaName}`, 40, 40);
        
        docPDF.setFontSize(10);
        docPDF.setTextColor(100);
        const totalAssuntos = atendidos.reduce((acc, a) => acc + 1 + (a.demandas?.quantidade || 0), 0);
        
        docPDF.text(`Data de Emissão: ${new Date().toLocaleString('pt-BR')}`, 40, 55);
        docPDF.text(`Total de Assistidos: ${atendidos.length} | Total de Assuntos: ${totalAssuntos}`, 40, 68);

        // Configuração das Colunas
        const tableColumn = ["#", "Nome", "Agendado", "Chegou", "Finalizado", "Duração", "Assunto Principal", "Atendente", "Confirmado"]; 
        const tableRows = [];

        atendidos.forEach((item, index) => {
            const arrivalDate = getSafeDate(item.arrivalTime);
            const attendedDate = getSafeDate(item.attendedTime);
            
            let duration = 'N/A';
            let formattedAttendedTime = 'N/A';

            if (arrivalDate && attendedDate) {
                const diffMs = attendedDate.getTime() - arrivalDate.getTime();
                const totalMins = Math.round(diffMs / 60000);
                if (totalMins >= 0) duration = calculateDuration(totalMins);
                formattedAttendedTime = attendedDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            }
            
            const scheduledTimeStr = item.type === 'avulso' ? 'Avulso' : (item.scheduledTime || 'N/A');
            const arrivalTimeStr = arrivalDate ? arrivalDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'N/A';
            const confirmedStatus = item.isConfirmed ? `Sim (${item.confirmationDetails?.confirmedBy || 'N/A'})` : 'Não';
            
            const attendantName = (typeof item.attendant === 'object' && item.attendant !== null) 
                                ? item.attendant.nome || item.attendant.name || 'N/A'
                                : item.attendant || 'N/A';

            tableRows.push([
                index + 1,
                cleanString(item.name),
                scheduledTimeStr,
                arrivalTimeStr,
                formattedAttendedTime,
                duration,
                cleanString(item.subject),
                cleanString(attendantName),
                confirmedStatus
            ]);
        });

        docPDF.autoTable({
            head: [tableColumn],
            body: tableRows,
            startY: 80,
            theme: 'striped',
            styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak' },
            headStyles: { fillColor: [22, 163, 74] }, // Verde SIGAP
            columnStyles: {
                0: { cellWidth: 20 },
                1: { cellWidth: 100 },
                6: { cellWidth: 130 }
            }
        });
        
        docPDF.save(`relatorio_atendidos_${pautaName.replace(/\s+/g, '_')}.pdf`);
    } catch (error) {
        console.error("Erro ao gerar PDF de Atendidos:", error);
        alert("Erro ao gerar PDF. Verifique o console.");
    }
};

/**
 * GERA A LISTA DE PRESENÇA DA EQUIPE (DINÂMICA)
 */
export const generateCollaboratorsPDF = (pautaName, colaboradores, selectedCols = ['nome', 'cargo', 'equipe', 'presenca', 'transporte']) => {
    try {
        const { jsPDF } = window.jspdf;
        const docPDF = new jsPDF();

        // 1. Definição do Mapa de Colunas
        const colMap = {
            'nome': { label: 'Membro da Equipe', getData: (c) => c.nome },
            'cargo': { label: 'Cargo', getData: (c) => c.cargo || 'N/A' },
            'equipe': { label: 'Equipe', getData: (c) => c.equipe ? `EQP ${c.equipe}` : 'N/A' },
            'presenca': { label: 'Status / Horário', getData: (c) => c.presente ? `Presente (${c.horario})` : 'Ausente' },
            'transporte': { label: 'Transporte', getData: (c) => {
                let desc = c.transporte || 'Não Informado';
                if (c.transporte === 'Com a Empresa' && c.localEncontro) desc += ` (${c.localEncontro})`;
                return desc;
            }}
        };

        // 2. Monta Cabeçalho e Corpo baseado na seleção do usuário
        const header = [selectedCols.map(key => colMap[key] ? colMap[key].label : key)];
        const tableData = colaboradores.map(c => 
            selectedCols.map(key => colMap[key] ? colMap[key].getData(c) : 'N/A')
        );

        // 3. Desenho do PDF
        docPDF.setFontSize(16);
        docPDF.setTextColor(139, 92, 246); // Violeta
        docPDF.text("Lista de Presença da Equipe", 14, 25);
        
        docPDF.setFontSize(10);
        docPDF.setTextColor(100);
        docPDF.text(`Pauta: ${pautaName}`, 14, 38);
        docPDF.text(`Emitido em: ${new Date().toLocaleString('pt-BR')}`, 14, 50);

        docPDF.autoTable({
            head: header,
            body: tableData,
            startY: 60,
            theme: 'striped',
            headStyles: { fillColor: [139, 92, 246] }, // Violeta SIGAP
            styles: { fontSize: 8, cellPadding: 5 },
            alternateRowStyles: { fillColor: [250, 245, 255] }
        });

        docPDF.save(`equipe_${pautaName.replace(/\s+/g, '_')}.pdf`);
    } catch (error) {
        console.error("Erro ao gerar PDF de Equipe:", error);
        alert("Erro ao gerar PDF da Equipe.");
    }
};
