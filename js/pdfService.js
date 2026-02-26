// js/pdfService.js - VERSÃO COMPLETA COM PDFService

/**
 * Utilitários de limpeza e formatação
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
    return totalMinutes >= 60 
        ? `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}min` 
        : `${totalMinutes} min`;
};

// ========================================================
// PDF SERVICE - Objeto com todas as funções de PDF
// ========================================================

export const PDFService = {
    /**
     * GERA O RELATÓRIO DE ATENDIDOS
     */
    generateAtendidosPDF(pautaName, atendidos) {
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
            docPDF.text(`Total: ${atendidos.length} assistidos | Assuntos totais: ${totalAssuntos}`, 40, 68);

            // Definição das Colunas
            const head = [["#", "Nome", "Agendado", "Chegou", "Finalizado", "Duração", "Assunto", "Atendente", "Status"]];

            const body = atendidos.map((item, index) => {
                const arrivalDate = getSafeDate(item.arrivalTime);
                const attendedDate = getSafeDate(item.attendedTime);

                let duration = 'N/A';
                if (arrivalDate && attendedDate) {
                    const diffMs = attendedDate.getTime() - arrivalDate.getTime();
                    duration = calculateDuration(Math.round(diffMs / 60000));
                }

                const arrStr = arrivalDate ? arrivalDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '---';
                const attStr = attendedDate ? attendedDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '---';

                // Tratamento inteligente do atendente (String ou Objeto)
                let atendente = 'N/A';
                if (item.attendant) {
                    atendente = (typeof item.attendant === 'object')
                        ? (item.attendant.nome || item.attendant.name || 'N/A')
                        : String(item.attendant);
                }

                return [
                    index + 1,
                    cleanString(item.name),
                    item.scheduledTime || (item.type === 'avulso' ? 'Avulso' : '---'),
                    arrStr,
                    attStr,
                    duration,
                    cleanString(item.subject),
                    cleanString(atendente),
                    item.isConfirmed ? "CONCLUÍDO" : "PENDENTE"
                ];
            });

            // Chamada moderna do autoTable
            docPDF.autoTable({
                head: head,
                body: body,
                startY: 80,
                theme: 'striped',
                headStyles: { fillColor: [22, 163, 74] },
                styles: { fontSize: 8, cellPadding: 4 },
                columnStyles: { 0: { cellWidth: 25 }, 1: { cellWidth: 110 }, 6: { cellWidth: 150 } }
            });

            docPDF.save(`atendidos_${pautaName.replace(/\s+/g, '_')}.pdf`);
            return true;
        } catch (error) {
            console.error("Erro PDF Atendidos:", error);
            alert("Erro ao baixar o PDF. Verifique se o navegador bloqueou o download.");
            return false;
        }
    },

    /**
     * GERA A LISTA DE PRESENÇA DA EQUIPE (DINÂMICA)
     */
    generateCollaboratorsPDF(pautaName, colaboradores, selectedCols = ['nome', 'cargo', 'equipe', 'transporte']) {
        try {
            const { jsPDF } = window.jspdf;
            const docPDF = new jsPDF();

            const colMap = {
                'nome': { label: 'Membro da Equipe', getData: (c) => c.nome },
                'cargo': { label: 'Cargo', getData: (c) => c.cargo || 'N/A' },
                'equipe': { label: 'Equipe', getData: (c) => c.equipe ? `EQP ${c.equipe}` : 'N/A' },
                'presenca': { label: 'Status / Horário', getData: (c) => c.presente ? `Presente (${c.horario})` : 'Ausente' },
                'transporte': { label: 'Deslocamento', getData: (c) => {
                    let desc = c.transporte || 'Não Informado';
                    if (c.transporte === 'Com a Empresa' && c.localEncontro) desc += ` (${c.localEncontro})`;
                    return desc;
                }}
            };

            const header = [selectedCols.map(key => colMap[key] ? colMap[key].label : key)];
            const tableData = colaboradores.map(c =>
                selectedCols.map(key => colMap[key] ? colMap[key].getData(c) : 'N/A')
            );

            docPDF.setFontSize(16);
            docPDF.setTextColor(139, 92, 246);
            docPDF.text("Lista de Presença da Equipe", 14, 25);
            docPDF.text(`Pauta: ${pautaName}`, 14, 40);

            docPDF.autoTable({
                head: header,
                body: tableData,
                startY: 55,
                theme: 'striped',
                headStyles: { fillColor: [139, 92, 246] },
                styles: { fontSize: 9 }
            });

            docPDF.save(`equipe_${pautaName.replace(/\s+/g, '_')}.pdf`);
            return true;
        } catch (e) {
            console.error("Erro PDF Equipe:", e);
            return false;
        }
    },

    /**
     * GERA PDF DE ESTATÍSTICAS (opcional)
     */
    generateStatisticsPDF(pautaName, statsData) {
        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();

            doc.setFontSize(18);
            doc.setTextColor(22, 101, 52);
            doc.text(`Estatísticas - ${pautaName}`, 14, 20);

            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 30);

            let y = 40;

            // Resumo
            doc.setFontSize(12);
            doc.setTextColor(0);
            doc.text("Resumo Geral:", 14, y);
            y += 10;

            doc.setFontSize(10);
            doc.text(`Total de Atendidos: ${statsData.atendidos || 0}`, 20, y);
            y += 7;
            doc.text(`Total de Faltosos: ${statsData.faltosos || 0}`, 20, y);
            y += 7;
            doc.text(`Tempo Médio: ${statsData.tempoMedio || 'N/A'}`, 20, y);

            doc.save(`estatisticas_${pautaName.replace(/\s+/g, '_')}.pdf`);
            return true;
        } catch (error) {
            console.error("Erro PDF Estatísticas:", error);
            return false;
        }
    }
};

// ========================================================
// FUNÇÕES AVULSAS (para compatibilidade com código antigo)
// ========================================================

/**
 * @deprecated Use PDFService.generateAtendidosPDF() instead
 */
export const generateAtendidosPDF = (pautaName, atendidos) => {
    return PDFService.generateAtendidosPDF(pautaName, atendidos);
};

/**
 * @deprecated Use PDFService.generateCollaboratorsPDF() instead
 */
export const generateCollaboratorsPDF = (pautaName, colaboradores, selectedCols) => {
    return PDFService.generateCollaboratorsPDF(pautaName, colaboradores, selectedCols);
};

/**
 * @deprecated Use PDFService.generateStatisticsPDF() instead
 */
export const generateStatisticsPDF = (pautaName, statsData) => {
    return PDFService.generateStatisticsPDF(pautaName, statsData);
};