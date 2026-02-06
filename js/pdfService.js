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
 * GERA O RELATÓRIO DE ATENDIDOS - VERSÃO ROBUSTA
 */
export const generateAtendidosPDF = (pautaName, atendidos) => {
    try {
        if (!window.jspdf) {
            alert("Erro: Biblioteca PDF não carregada. Recarregue a página.");
            return;
        }

        const { jsPDF } = window.jspdf;
        const docPDF = new jsPDF({ orientation: 'l', unit: 'pt', format: 'a4' }); 

        // Título
        docPDF.setFontSize(18);
        docPDF.setTextColor(22, 101, 52); 
        docPDF.text(`Relatório de Atendidos - ${pautaName || 'Sem Título'}`, 40, 40);
        
        docPDF.setFontSize(10);
        docPDF.setTextColor(100);
        docPDF.text(`Emitido em: ${new Date().toLocaleString('pt-BR')}`, 40, 55);

        // Cabeçalho da Tabela
        const tableColumn = ["#", "Nome", "Agendado", "Chegou", "Finalizado", "Duração", "Assunto", "Atendente"]; 
        const tableRows = [];

        atendidos.forEach((item, index) => {
            // Garantia de strings seguras para não quebrar o PDF
            const nomeAssistido = String(item.name || 'NOME NÃO INFORMADO');
            const assunto = String(item.subject || 'NÃO INFORMADO');
            
            // Tratamento de datas
            const arrivalDate = getSafeDate(item.arrivalTime);
            const attendedDate = getSafeDate(item.attendedTime);
            
            let duration = 'N/A';
            let formattedArrival = arrivalDate ? arrivalDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'N/A';
            let formattedAttended = attendedDate ? attendedDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'N/A';

            if (arrivalDate && attendedDate) {
                const diffMs = attendedDate.getTime() - arrivalDate.getTime();
                duration = calculateDuration(Math.round(diffMs / 60000));
            }
            
            // Tratamento do Atendente (pode ser string ou objeto)
            let nomeAtendente = 'N/A';
            if (item.attendant) {
                nomeAtendente = (typeof item.attendant === 'object') 
                    ? (item.attendant.nome || item.attendant.name || 'N/A') 
                    : String(item.attendant);
            }

            tableRows.push([
                index + 1,
                nomeAssistido,
                item.scheduledTime || (item.type === 'avulso' ? 'Avulso' : 'N/A'),
                formattedArrival,
                formattedAttended,
                duration,
                assunto,
                nomeAtendente
            ]);
        });

        // Gerar Tabela
        docPDF.autoTable({
            head: [tableColumn],
            body: tableRows,
            startY: 70,
            theme: 'striped',
            headStyles: { fillColor: [22, 163, 74] },
            styles: { fontSize: 8, cellPadding: 3 },
            columnStyles: {
                0: { cellWidth: 25 },
                1: { cellWidth: 120 },
                6: { cellWidth: 150 }
            }
        });
        
        const fileName = `atendidos_${(pautaName || 'pauta').replace(/\s+/g, '_')}.pdf`;
        docPDF.save(fileName);
        console.log("PDF de Atendidos gerado com sucesso.");

    } catch (error) {
        console.error("ERRO CRÍTICO NO PDF ATENDIDOS:", error);
        alert("Ocorreu um erro técnico ao gerar o PDF. Verifique se há nomes com caracteres muito estranhos na lista.");
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
