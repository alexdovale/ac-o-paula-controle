// =======================================================
// GERADOR DE RELATÓRIO DE ESTATÍSTICAS EM PDF
// =======================================================
// Gera relatórios customizáveis de estatísticas de pautas,
// com cabeçalho, rodapé, tabelas e percentuais de atendimento.
// =======================================================

async function gerarRelatorioEstatisticas(statsData, pautaName, totalDemands) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'pt', 'a4');

    const margin = 40;
    let yPos = 90; // posição inicial para o conteúdo

    // =======================================================
    // CABEÇALHO E RODAPÉ
    // =======================================================
    function addHeaderAndFooter() {
        const pageCount = doc.internal.getNumberOfPages();

        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);

            // --- Cabeçalho ---
            doc.setFont("helvetica", "bold");
            doc.setFontSize(12);
            doc.text("DEFENSORIA PÚBLICA DO ESTADO DO RIO DE JANEIRO", margin, 40);

            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);
            doc.text(`Relatório de Estatísticas – ${pautaName}`, margin, 60);
            doc.line(margin, 70, doc.internal.pageSize.width - margin, 70);

            // --- Rodapé ---
            const pageHeight = doc.internal.pageSize.height;
            doc.line(margin, pageHeight - 50, doc.internal.pageSize.width - margin, pageHeight - 50);

            doc.setFontSize(8);
            doc.text(
                `Gerado em ${new Date().toLocaleDateString()} às ${new Date().toLocaleTimeString()}`,
                margin,
                pageHeight - 35
            );
            doc.text(`Página ${i} de ${pageCount}`, doc.internal.pageSize.width - margin - 80, pageHeight - 35);
        }
    }

    // =======================================================
    // FUNÇÃO AUXILIAR PARA TÍTULOS DAS SEÇÕES
    // =======================================================
    function addSectionTitle(title) {
        if (yPos > 720) {
            doc.addPage();
            yPos = 90;
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text(title, margin, yPos);
        yPos += 15;
        doc.setLineWidth(0.5);
        doc.line(margin, yPos, doc.internal.pageSize.width - margin, yPos);
        yPos += 15;
    }

    // =======================================================
    // 1. VISÃO GERAL
    // =======================================================
    if (document.getElementById('export-summary').checked) {
        addSectionTitle("Visão Geral");

        const total = statsData.total;
        const attended = statsData.attended;
        const absent = statsData.absent;
        const attendanceRate = total > 0 ? ((attended / total) * 100).toFixed(1) + "%" : "0%";

        const resumo = [
            ["Total de Agendamentos", total],
            ["Atendidos", attended],
            ["Faltosos", absent],
            ["Taxa de Atendimento", attendanceRate]
        ];

        doc.autoTable({
            startY: yPos,
            head: [['Indicador', 'Quantidade']],
            body: resumo,
            styles: { fontSize: 10, cellPadding: 5 },
            headStyles: { fillColor: [0, 102, 153], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [245, 245, 245] },
            margin: { left: margin, right: margin },
            theme: 'grid'
        });
        yPos = doc.lastAutoTable.finalY + 30;
    }

    // =======================================================
    // 2. ATENDIMENTOS POR DEFENSOR
    // =======================================================
    if (document.getElementById('export-defenders').checked && statsData.statsByDefender.length > 0) {
        addSectionTitle("Atendimentos por Defensor");

        doc.autoTable({
            startY: yPos,
            head: [['Defensor(a)', 'Atendimentos', 'Faltosos', 'Total']],
            body: statsData.statsByDefender.map(row => [
                row.defender,
                row.attended,
                row.absent,
                row.total
            ]),
            styles: { fontSize: 9, cellPadding: 4 },
            headStyles: { fillColor: [0, 128, 96], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [240, 240, 240] },
            margin: { left: margin, right: margin },
            theme: 'grid'
        });
        yPos = doc.lastAutoTable.finalY + 30;
    }

    // =======================================================
    // 3. ATENDIMENTOS POR ASSUNTO
    // =======================================================
    if (document.getElementById('export-subjects').checked && statsData.statsBySubject) {
        addSectionTitle("Atendimentos por Assunto");

        doc.autoTable({
            startY: yPos,
            head: [['Assunto', 'Total', 'Atendidos', 'Faltosos', 'Percentual']],
            body: Object.entries(statsData.statsBySubject)
                .sort(([, a], [, b]) => b.total - a.total)
                .map(([subject, data]) => [
                    subject,
                    data.total,
                    data.atendidos,
                    data.faltosos,
                    totalDemands > 0 ? ((data.total / totalDemands) * 100).toFixed(1) + '%' : '0%'
                ]),
            styles: { fontSize: 9, cellPadding: 4 },
            headStyles: { fillColor: [79, 112, 156], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [240, 240, 240] },
            margin: { left: margin, right: margin },
            theme: 'grid'
        });
        yPos = doc.lastAutoTable.finalY + 30;
    }

    // =======================================================
    // 4. ATENDIMENTOS POR HORÁRIO
    // =======================================================
    if (document.getElementById('export-times').checked && statsData.statsByTime.length > 0) {
        addSectionTitle("Atendimentos por Horário");

        doc.autoTable({
            startY: yPos,
            head: [['Horário', 'Quantidade']],
            body: statsData.statsByTime.map(row => [row.time, row.count]),
            styles: { fontSize: 9, cellPadding: 4 },
            headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [245, 245, 245] },
            margin: { left: margin, right: margin },
            theme: 'grid'
        });
        yPos = doc.lastAutoTable.finalY + 30;
    }

    // =======================================================
    // 5. FALTOSOS POR HORÁRIO
    // =======================================================
    if (document.getElementById('export-absentees-time').checked && statsData.statsByTimeFaltosos.length > 0) {
        addSectionTitle("Faltosos por Horário");

        doc.autoTable({
            startY: yPos,
            head: [['Horário', 'Quantidade']],
            body: statsData.statsByTimeFaltosos.map(row => [row.time, row.count]),
            styles: { fontSize: 9, cellPadding: 4 },
            headStyles: { fillColor: [192, 57, 43], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [250, 240, 240] },
            margin: { left: margin, right: margin },
            theme: 'grid'
        });
        yPos = doc.lastAutoTable.finalY + 30;
    }

    // =======================================================
    // FINALIZAÇÃO DO PDF
    // =======================================================
    addHeaderAndFooter();

    const safePautaName = pautaName.replace(/[\\/:*?"<>|]/g, '_');
    const filename = `Relatorio_Estatisticas_${safePautaName}_${new Date().toISOString().slice(0,10)}.pdf`;

    doc.save(filename);
}
