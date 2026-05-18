// js/pdfService.js - VERSÃO FINAL CONSOLIDADA (SIGEP + Checklist Textual + Ata Social)

/**
 * Baixa as bibliotecas de PDF automaticamente se não existirem
 */
const ensureJsPDF = async () => {
    if (typeof window.jspdf === 'undefined') {
        console.log("Baixando biblioteca PDF...");
        await new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
            script.onload = resolve;
            document.head.appendChild(script);
        });
        await new Promise((resolve) => {
            const script2 = document.createElement('script');
            script2.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js";
            script2.onload = resolve;
            document.head.appendChild(script2);
        });
    }
};

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

const formatCurrency = (value) => {
    if (!value) return 'R$ 0,00';
    if (typeof value === 'string' && value.includes('R$')) return value;
    
    let num = 0;
    if (typeof value === 'string') {
        const cleanValue = value.replace(/[R$\s]/g, '').replace(',', '.');
        num = parseFloat(cleanValue) || 0;
    } else {
        num = value || 0;
    }
    
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

// Helper para obter identificador
const getIdentificador = (colaborador) => {
    if (colaborador.identificador) return colaborador.identificador;
    if (colaborador.id) return colaborador.id;
    if (colaborador.matricula) return colaborador.matricula;
    if (colaborador.codigo) return colaborador.codigo;
    return '';
};

const getAttendantNameForPDF = (item) => {
    if (!item) return 'N/A';
    if (item.attendedBy) {
        const name = typeof item.attendedBy === 'object' ? (item.attendedBy.nome || item.attendedBy.name) : item.attendedBy;
        if (name) return String(name).trim();
    }
    if (item.assignedCollaborator && item.assignedCollaborator.name) {
        return String(item.assignedCollaborator.name).trim();
    }
    if (item.attendant) {
        const name = typeof item.attendant === 'object' ? (item.attendant.nome || item.attendant.name) : item.attendant;
        if (name) return String(name).trim();
    }
    return 'N/A';
};

// ========================================================
// PDF SERVICE - VERSÃO FINAL
// ========================================================

export const PDFService = {
    
    async generatePlanilhaGastosPDF(assistedName, expenseData) {
        try {
            await ensureJsPDF(); 
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });

            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            doc.text("PLANILHA DE DESPESAS ATUAIS", doc.internal.pageSize.getWidth() / 2, 60, { align: "center" });

            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);
            doc.text(`Assistido(a): ${assistedName}`, 40, 90);

            const categorias = [
                { id: 'moradia', label: 'Moradia na parcela referente à criança/adolescente\n(tais como condomínio, internet, luz e água)' },
                { id: 'alimentacao', label: 'Alimentação' },
                { id: 'educacao', label: 'Creche/escola / Curso / atividade extracurricular' },
                { id: 'saude', label: 'Gastos com problemas de saúde / Plano de saúde / Medicamentos' },
                { id: 'vestuario', label: 'Vestuário / Uniforme Escolar' },
                { id: 'lazer', label: 'Transporte / Lazer' },
                { id: 'outras', label: 'Outras (especificar)' }
            ];

            let total = 0;
            const body = [];

            categorias.forEach(cat => {
                let valor = expenseData[cat.id] || '';
                if (valor && valor !== 'R$ 0,00' && String(valor).trim() !== '') {
                    const num = parseFloat(String(valor).replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
                    total += num;
                    body.push([
                        { content: cat.label, styles: { halign: 'center', valign: 'middle' } },
                        { content: valor, styles: { halign: 'center', valign: 'middle' } }
                    ]);
                }
            });

            if (body.length === 0) {
                 body.push([{content: 'Nenhuma despesa informada.', colSpan: 2, styles: {halign: 'center', fontStyle: 'italic'}}]);
            } else {
                 const totalFormatted = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                 body.push([
                     { content: 'TOTAL', styles: { fontStyle: 'bold', halign: 'center' } },
                     { content: totalFormatted, styles: { fontStyle: 'bold', halign: 'center' } }
                 ]);
            }

            doc.autoTable({
                startY: 110,
                head: [[
                    { content: 'DESCRIÇÃO', styles: { halign: 'center', fontStyle: 'bold', fillColor: [255,255,255], textColor: [0,0,0], lineWidth: 1, lineColor: [0,0,0] } },
                    { content: 'VALOR MENSAL', styles: { halign: 'center', fontStyle: 'bold', fillColor: [255,255,255], textColor: [0,0,0], lineWidth: 1, lineColor: [0,0,0] } }
                ]],
                body: body,
                theme: 'grid',
                styles: { lineColor: [0, 0, 0], lineWidth: 1, textColor: [0, 0, 0], fontSize: 10, cellPadding: 6 },
                columnStyles: { 0: { cellWidth: 280 }, 1: { cellWidth: 150 } },
                margin: { left: (doc.internal.pageSize.getWidth() - 430) / 2 }
            });

            doc.save(`Planilha_Despesas_${(assistedName||'Assistido').replace(/\s+/g, '_')}.pdf`);
            return true;
        } catch (error) {
            console.error("Erro PDF Planilha:", error);
            return false;
        }
    },

    /**
     * GERA ATA DE AÇÃO SOCIAL
     */
    async generateAtaAcaoSocial(pautaName, colaboradores, atendidos, dadosExtras = {}) {
        try {
            await ensureJsPDF();
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({
                orientation: 'p',
                unit: 'mm',
                format: 'a4'
            });
            
            // DADOS PARA O CABEÇALHO
            const dataInput = dadosExtras.data ? new Date(dadosExtras.data + 'T12:00:00') : new Date();
            const dia = dataInput.getDate();
            const mesExtenso = dataInput.toLocaleString('pt-BR', { month: 'long' });
            const ano = dataInput.getFullYear();
            
            const endereco = dadosExtras.endereco || "Não informado";
            const nomeDaAcao = dadosExtras.acao || pautaName;
            const orgaoAtendimentoConteudo = dadosExtras.orgao || "NÃO INFORMADO";
            const totalAtendidos = dadosExtras.totalAtendimentos !== undefined 
                ? dadosExtras.totalAtendimentos 
                : atendidos.length;

            // 1. LOGO (106x25mm)
            const logoUrl = "https://raw.githubusercontent.com/alexdovale/calculo-mensuracao-codoc/main/logo.png";
            try {
                // Centralizado: (210 - 106) / 2 = 52mm de margem esquerda
                doc.addImage(logoUrl, 'PNG', 52, 8, 106, 25);
            } catch(e) { console.warn("Logo não carregada:", e); }

            // 2. TÍTULO
            doc.setFont("helvetica", "bold");
            doc.setFontSize(13);
            doc.text("ATA AÇÃO SOCIAL", 105, 45, { align: "center" });

            // 3. TEXTO INTRODUTÓRIO (limitado à largura das tabelas = 170mm)
            doc.setFont("helvetica", "normal");
            doc.setFontSize(9);
            
            const introText = `Aos ${dia} dias do mês de ${mesExtenso} do ano de ${ano}, a partir das 9h, em ${endereco}, trabalharam na ${nomeDaAcao}, os(as) Defensores(as) Públicos(as) abaixo listados(as), bem como os(as) servidores(as), conforme listagem a seguir:`;
            
            const splitIntro = doc.splitTextToSize(introText, 170);
            doc.text(splitIntro, 20, 55);
            
            let currentY = 55 + (splitIntro.length * 4.5);

            const sortedColaboradores = [...colaboradores].sort((a, b) => {
                const eqA = a.equipe || '';
                const eqB = b.equipe || '';
                if (eqA !== eqB) return eqA.localeCompare(eqB);
                return (a.nome || '').localeCompare(b.nome || '');
            });

            const defensores = sortedColaboradores.filter(c => c.cargo && c.cargo.toLowerCase().includes('defensor'));
            const servidores = sortedColaboradores.filter(c => c.cargo && !c.cargo.toLowerCase().includes('defensor'));

            const larguraNome = 65;
            const larguraIdentificador = 30;
            const larguraAssinatura = 170 - larguraNome - larguraIdentificador;

            if (defensores.length > 0) {
                doc.autoTable({
                    startY: currentY + 1,
                    head: [[
                        { content: 'DEFENSOR(A) PÚBLICO(A)', colSpan: 3, styles: { halign: 'center', fontStyle: 'bold', fontSize: 9, fillColor: [146, 208, 80] } }
                    ]],
                    body: [
                        [
                            { content: 'NOME', styles: { fillColor: [226, 239, 218], fontStyle: 'bold', halign: 'center', fontSize: 8 } },
                            { content: 'MATRÍCULA', styles: { fillColor: [226, 239, 218], fontStyle: 'bold', halign: 'center', fontSize: 8 } },
                            { content: 'ASSINATURA', styles: { fillColor: [226, 239, 218], fontStyle: 'bold', halign: 'center', fontSize: 8 } }
                        ],
                        ...defensores.map(c => [
                            { content: c.nome || '', styles: { halign: 'center', fontSize: 8, cellPadding: 2 } },
                            { content: getIdentificador(c), styles: { halign: 'center', fontSize: 8, cellPadding: 2 } },
                            { content: '', styles: { halign: 'center', fontSize: 8, cellPadding: 2 } }
                        ])
                    ],
                    theme: 'grid',
                    headStyles: { fillColor: [146, 208, 80], textColor: [0, 0, 0], halign: 'center', fontStyle: 'bold', fontSize: 9 },
                    styles: { fontSize: 8, cellPadding: 2.5, lineColor: [0, 0, 0], lineWidth: 0.2, valign: 'middle', halign: 'center' },
                    columnStyles: { 0: { cellWidth: larguraNome }, 1: { cellWidth: larguraIdentificador }, 2: { cellWidth: larguraAssinatura } },
                    margin: { left: 20, right: 20 }
                });
                currentY = doc.lastAutoTable.finalY + 2;
            }

            if (servidores.length > 0) {
                doc.autoTable({
                    startY: currentY,
                    head: [[
                        { content: 'SERVIDOR(A)', colSpan: 3, styles: { halign: 'center', fontStyle: 'bold', fontSize: 9, fillColor: [146, 208, 80] } }
                    ]],
                    body: [
                        [
                            { content: 'NOME', styles: { fillColor: [226, 239, 218], fontStyle: 'bold', halign: 'center', fontSize: 8 } },
                            { content: 'ID FUNCIONAL', styles: { fillColor: [226, 239, 218], fontStyle: 'bold', halign: 'center', fontSize: 8 } },
                            { content: 'ASSINATURA', styles: { fillColor: [226, 239, 218], fontStyle: 'bold', halign: 'center', fontSize: 8 } }
                        ],
                        ...servidores.map(c => [
                            { content: c.nome || '', styles: { halign: 'center', fontSize: 8, cellPadding: 2 } },
                            { content: getIdentificador(c), styles: { halign: 'center', fontSize: 8, cellPadding: 2 } },
                            { content: '', styles: { halign: 'center', fontSize: 8, cellPadding: 2 } }
                        ])
                    ],
                    theme: 'grid',
                    headStyles: { fillColor: [146, 208, 80], textColor: [0, 0, 0], halign: 'center', fontStyle: 'bold', fontSize: 9 },
                    styles: { fontSize: 8, cellPadding: 2.5, lineColor: [0, 0, 0], lineWidth: 0.2, valign: 'middle', halign: 'center' },
                    columnStyles: { 0: { cellWidth: larguraNome }, 1: { cellWidth: larguraIdentificador }, 2: { cellWidth: larguraAssinatura } },
                    margin: { left: 20, right: 20 }
                });
                currentY = doc.lastAutoTable.finalY + 2;
            }

            doc.autoTable({
                startY: currentY,
                body: [
                    [
                        { content: 'ÓRGÃO DE ATENDIMENTO - AS', styles: { fillColor: [226, 239, 218], fontStyle: 'bold', halign: 'center', fontSize: 8 } },
                        { content: 'TOTAL DE ATENDIMENTOS', styles: { fillColor: [226, 239, 218], fontStyle: 'bold', halign: 'center', fontSize: 8 } }
                    ],
                    [
                        { content: orgaoAtendimentoConteudo.toUpperCase(), styles: { halign: 'center', fontSize: 8, cellPadding: 3 } },
                        { content: String(totalAtendidos), styles: { halign: 'center', fontSize: 10, fontStyle: 'bold', cellPadding: 3 } }
                    ]
                ],
                theme: 'grid',
                styles: { 
                    fontSize: 8, 
                    halign: 'center', 
                    cellPadding: 3, 
                    lineColor: [0, 0, 0], 
                    lineWidth: 0.2,
                    valign: 'middle'
                },
                columnStyles: { 0: { cellWidth: 110 }, 1: { cellWidth: 60 } },
                margin: { left: 20, right: 20 }
            });
            
            currentY = doc.lastAutoTable.finalY + 6;

            doc.setFont("helvetica", "bold");
            doc.setFontSize(8);
            doc.text("OBSERVAÇÕES:", 20, currentY);
            doc.setDrawColor(0, 0, 0);
            doc.line(20, currentY + 3, 190, currentY + 3);
            
            for (let i = 1; i <= 3; i++) {
                const lineY = currentY + 6 + (i * 4.5);
                if (lineY < doc.internal.pageSize.getHeight() - 15) {
                    doc.setDrawColor(200, 200, 200);
                    doc.line(20, lineY, 190, lineY);
                }
            }

            const nomeArquivo = `Ata_Social_${(dadosExtras.acao || pautaName).replace(/\s+/g, '_')}.pdf`;
            doc.save(nomeArquivo);
            console.log("✅ Ata gerada com sucesso!");
            return true;
            
        } catch (error) {
            console.error("Erro ao gerar Ata Social:", error);
            alert("Erro ao gerar a ata. Verifique o console para mais detalhes.");
            return false;
        }
    },

    /**
     * VISUALIZAR ATA (PREVIEW)
     */
    async previewAtaAcaoSocial(pautaName, colaboradores, atendidos, dadosExtras = {}) {
        try {
            await ensureJsPDF();
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({
                orientation: 'p',
                unit: 'mm',
                format: 'a4'
            });
            
            const dataInput = dadosExtras.data ? new Date(dadosExtras.data + 'T12:00:00') : new Date();
            const dia = dataInput.getDate();
            const mesExtenso = dataInput.toLocaleString('pt-BR', { month: 'long' });
            const ano = dataInput.getFullYear();
            
            const endereco = dadosExtras.endereco || "Não informado";
            const nomeDaAcao = dadosExtras.acao || pautaName;
            const orgaoAtendimentoConteudo = dadosExtras.orgao || "NÃO INFORMADO";
            const totalAtendidos = dadosExtras.totalAtendimentos !== undefined 
                ? dadosExtras.totalAtendimentos 
                : atendidos.length;

            const logoUrl = "https://raw.githubusercontent.com/alexdovale/calculo-mensuracao-codoc/main/logo.png";
            try {
                doc.addImage(logoUrl, 'PNG', 52, 8, 106, 25);
            } catch(e) {}

            doc.setFont("helvetica", "bold");
            doc.setFontSize(13);
            doc.text("ATA AÇÃO SOCIAL", 105, 45, { align: "center" });

            doc.setFont("helvetica", "normal");
            doc.setFontSize(9);
            const introText = `Aos ${dia} dias do mês de ${mesExtenso} do ano de ${ano}, a partir das 9h, em ${endereco}, trabalharam na ${nomeDaAcao}, os(as) Defensores(as) Públicos(as) abaixo listados(as), bem como os(as) servidores(as), conforme listagem a seguir:`;
            
            const splitIntro = doc.splitTextToSize(introText, 170);
            doc.text(splitIntro, 20, 55);
            
            let currentY = 55 + (splitIntro.length * 4.5);

            const sortedColaboradores = [...colaboradores].sort((a, b) => {
                const eqA = a.equipe || '';
                const eqB = b.equipe || '';
                if (eqA !== eqB) return eqA.localeCompare(eqB);
                return (a.nome || '').localeCompare(b.nome || '');
            });

            const defensores = sortedColaboradores.filter(c => c.cargo && c.cargo.toLowerCase().includes('defensor'));
            const servidores = sortedColaboradores.filter(c => c.cargo && !c.cargo.toLowerCase().includes('defensor'));

            const larguraNome = 65;
            const larguraIdentificador = 30;
            const larguraAssinatura = 170 - larguraNome - larguraIdentificador;

            if (defensores.length > 0) {
                doc.autoTable({
                    startY: currentY + 1,
                    head: [[{ content: 'DEFENSOR(A) PÚBLICO(A)', colSpan: 3, styles: { halign: 'center', fontStyle: 'bold', fontSize: 9, fillColor: [146, 208, 80] } }]],
                    body: [
                        [
                            { content: 'NOME', styles: { fillColor: [226, 239, 218], fontStyle: 'bold', halign: 'center', fontSize: 8 } },
                            { content: 'MATRÍCULA', styles: { fillColor: [226, 239, 218], fontStyle: 'bold', halign: 'center', fontSize: 8 } },
                            { content: 'ASSINATURA', styles: { fillColor: [226, 239, 218], fontStyle: 'bold', halign: 'center', fontSize: 8 } }
                        ],
                        ...defensores.map(c => [c.nome || '', getIdentificador(c), ''])
                    ],
                    theme: 'grid',
                    headStyles: { fillColor: [146, 208, 80], textColor: [0, 0, 0], halign: 'center', fontStyle: 'bold', fontSize: 9 },
                    styles: { fontSize: 8, cellPadding: 2.5, lineColor: [0, 0, 0], lineWidth: 0.2, valign: 'middle', halign: 'center' },
                    columnStyles: { 0: { cellWidth: larguraNome }, 1: { cellWidth: larguraIdentificador }, 2: { cellWidth: larguraAssinatura } },
                    margin: { left: 20, right: 20 }
                });
                currentY = doc.lastAutoTable.finalY + 2;
            }

            if (servidores.length > 0) {
                doc.autoTable({
                    startY: currentY,
                    head: [[{ content: 'SERVIDOR(A)', colSpan: 3, styles: { halign: 'center', fontStyle: 'bold', fontSize: 9, fillColor: [146, 208, 80] } }]],
                    body: [
                        [
                            { content: 'NOME', styles: { fillColor: [226, 239, 218], fontStyle: 'bold', halign: 'center', fontSize: 8 } },
                            { content: 'ID FUNCIONAL', styles: { fillColor: [226, 239, 218], fontStyle: 'bold', halign: 'center', fontSize: 8 } },
                            { content: 'ASSINATURA', styles: { fillColor: [226, 239, 218], fontStyle: 'bold', halign: 'center', fontSize: 8 } }
                        ],
                        ...servidores.map(c => [c.nome || '', getIdentificador(c), ''])
                    ],
                    theme: 'grid',
                    headStyles: { fillColor: [146, 208, 80], textColor: [0, 0, 0], halign: 'center', fontStyle: 'bold', fontSize: 9 },
                    styles: { fontSize: 8, cellPadding: 2.5, lineColor: [0, 0, 0], lineWidth: 0.2, valign: 'middle', halign: 'center' },
                    columnStyles: { 0: { cellWidth: larguraNome }, 1: { cellWidth: larguraIdentificador }, 2: { cellWidth: larguraAssinatura } },
                    margin: { left: 20, right: 20 }
                });
                currentY = doc.lastAutoTable.finalY + 2;
            }

            doc.autoTable({
                startY: currentY,
                body: [
                    [
                        { content: 'ÓRGÃO DE ATENDIMENTO - AS', styles: { fillColor: [226, 239, 218], fontStyle: 'bold', halign: 'center', fontSize: 8 } },
                        { content: 'TOTAL DE ATENDIMENTOS', styles: { fillColor: [226, 239, 218], fontStyle: 'bold', halign: 'center', fontSize: 8 } }
                    ],
                    [
                        { content: orgaoAtendimentoConteudo.toUpperCase(), styles: { halign: 'center', fontSize: 8, cellPadding: 3 } },
                        { content: String(totalAtendidos), styles: { halign: 'center', fontSize: 10, fontStyle: 'bold', cellPadding: 3 } }
                    ]
                ],
                theme: 'grid',
                styles: { fontSize: 8, halign: 'center', cellPadding: 3, lineColor: [0, 0, 0], lineWidth: 0.2, valign: 'middle' },
                columnStyles: { 0: { cellWidth: 110 }, 1: { cellWidth: 60 } },
                margin: { left: 20, right: 20 }
            });
            
            currentY = doc.lastAutoTable.finalY + 6;

            doc.setFont("helvetica", "bold");
            doc.setFontSize(8);
            doc.text("OBSERVAÇÕES:", 20, currentY);
            doc.line(20, currentY + 3, 190, currentY + 3);
            
            for (let i = 1; i <= 3; i++) {
                const lineY = currentY + 6 + (i * 4.5);
                if (lineY < doc.internal.pageSize.getHeight() - 15) {
                    doc.setDrawColor(200, 200, 200);
                    doc.line(20, lineY, 190, lineY);
                }
            }

            const blob = doc.output('bloburl');
            window.open(blob, '_blank');
            return true;
            
        } catch (error) {
            console.error("Erro ao visualizar Ata:", error);
            return false;
        }
    },

    /**
     * GERA O RELATÓRIO DE ATENDIDOS
     */
    async generateAtendidosPDF(pautaName, atendidos) {
        try {
            await ensureJsPDF();
            const { jsPDF } = window.jspdf;
            const docPDF = new jsPDF({ orientation: 'l', unit: 'pt', format: 'a4' });

            docPDF.setFontSize(18);
            docPDF.setTextColor(22, 163, 74); // Verde SIGAP
            docPDF.text(`Relatório de Atendidos - ${pautaName}`, 40, 40);

            docPDF.setFontSize(10);
            docPDF.setTextColor(100);
            const totalAssuntos = atendidos.reduce((acc, a) => acc + 1 + (a.demandas?.quantidade || 0), 0);
            docPDF.text(`Data: ${new Date().toLocaleString('pt-BR')}`, 40, 55);
            docPDF.text(`Total: ${atendidos.length} assistidos | Assuntos totais: ${totalAssuntos}`, 40, 68);

            const head = [["#", "Nome", "Agendado", "Chegou", "Chamado", "Duração", "Assunto", "Atendente", "Validado Verde"]];

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

            docPDF.autoTable({
                head: head,
                body: body,
                startY: 80,
                theme: 'striped',
                headStyles: { fillColor: [22, 163, 74] }, // Verde SIGAP
                styles: { fontSize: 8, cellPadding: 4, halign: 'center' },
                columnStyles: { 0: { cellWidth: 25 }, 1: { cellWidth: 110 }, 6: { cellWidth: 150 } }
            });

            docPDF.save(`atendidos_${pautaName.replace(/\s+/g, '_')}.pdf`);
            return true;
        } catch (error) {
            console.error("Erro PDF Atendidos:", error);
            return false;
        }
    },
    
    /**
     * GERA O RELATÓRIO DE FALTOSOS
     */
    async generateFaltososPDF(pautaName, faltosos) {
        try {
            await ensureJsPDF();
            const { jsPDF } = window.jspdf;
            const docPDF = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });

            docPDF.setFontSize(18);
            docPDF.setTextColor(22, 163, 74); // Verde SIGAP
            docPDF.text(`Relatório de Faltosos - ${pautaName}`, 40, 40);

            docPDF.setFontSize(10);
            docPDF.setTextColor(100);
            docPDF.text(`Data de Emissão: ${new Date().toLocaleString('pt-BR')}`, 40, 55);
            docPDF.text(`Total de Ausências: ${faltosos.length}`, 40, 68);

            const head = [["#", "Nome do Assistido", "Agendado", "Assunto", "Falta às", "Verde"]];

            const body = faltosos.map((item, index) => {
                const logTime = getSafeDate(item.lastActionTimestamp);
                const faltaStr = logTime ? logTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '---';

                return [
                    index + 1,
                    cleanString(item.name).toUpperCase(),
                    item.scheduledTime || (item.type === 'avulso' ? 'Avulso' : '---'),
                    cleanString(item.subject).toUpperCase(), 
                    faltaStr,
                    item.isConfirmed ? "OK" : "PEND"
                ];
            });

            docPDF.autoTable({
                head: head,
                body: body,
                startY: 85,
                theme: 'grid',
                headStyles: { fillColor: [22, 163, 74] }, // Verde SIGAP
                styles: { fontSize: 8, cellPadding: 5, halign: 'center', valign: 'middle', overflow: 'linebreak' },
                columnStyles: { 
                    1: { halign: 'left', cellWidth: 140 }, 
                    3: { halign: 'left', cellWidth: 160 }, 
                    5: { fontStyle: 'bold' }               
                }
            });

            const pageCount = docPDF.internal.getNumberOfPages();
            for(let i = 1; i <= pageCount; i++) {
                docPDF.setPage(i);
                docPDF.setFontSize(7);
                docPDF.text(`SIGEP - Sistema de Gerenciamento de Pauta | Página ${i} de ${pageCount}`, 40, 820);
            }

            docPDF.save(`faltosos_${pautaName.replace(/\s+/g, '_')}.pdf`);
            return true;
        } catch (error) {
            console.error("Erro PDF Faltosos:", error);
            return false;
        }
    },

    /**
     * GERA LISTA DE COLABORADORES ORDENADA
     */
    async generateCollaboratorsPDF(pautaName, colaboradores, selectedCols = ['nome', 'cargo', 'equipe', 'transporte']) {
        try {
            await ensureJsPDF();
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

            const sortedColaboradores = [...colaboradores].sort((a, b) => {
                const equipeA = a.equipe || 'Sem Equipe';
                const equipeB = b.equipe || 'Sem Equipe';
                if (equipeA !== equipeB) return equipeA.localeCompare(equipeB);

                const getCargoWeight = (cargo) => {
                    const c = (cargo || '').toLowerCase();
                    if (c.includes('defensor')) return 1;
                    if (c.includes('servidor')) return 2;
                    return 3;
                };

                const weightA = getCargoWeight(a.cargo);
                const weightB = getCargoWeight(b.cargo);
                
                if (weightA !== weightB) return weightA - weightB;
                
                return (a.nome || '').localeCompare(b.nome || '');
            });

            const header = [selectedCols.map(key => colMap[key] ? colMap[key].label : key)];
            
            const tableData = [];
            let currentEquipe = null;

            sortedColaboradores.forEach(c => {
                const equipeAtual = c.equipe ? `Equipe ${c.equipe}` : 'Sem Equipe';
                
                if (equipeAtual !== currentEquipe) {
                    currentEquipe = equipeAtual;
                    tableData.push([
                        {
                            content: equipeAtual.toUpperCase(),
                            colSpan: selectedCols.length,
                            styles: { 
                                fillColor: [240, 253, 244], 
                                textColor: [21, 128, 61],   
                                fontStyle: 'bold', 
                                halign: 'center'            
                            } 
                        }
                    ]);
                }
                
                tableData.push(selectedCols.map(key => colMap[key] ? colMap[key].getData(c) : 'N/A'));
            });

            docPDF.setFontSize(16);
            docPDF.setTextColor(22, 163, 74); // Verde SIGAP
            docPDF.text("Lista de Presença da Equipe", 14, 25);
            docPDF.text(`Pauta: ${pautaName}`, 14, 40);

            docPDF.autoTable({
                head: header,
                body: tableData,
                startY: 55,
                theme: 'striped',
                headStyles: { fillColor: [22, 163, 74] }, // Verde SIGAP
                styles: { fontSize: 9, halign: 'center', valign: 'middle' }
            });

            docPDF.save(`equipe_${pautaName.replace(/\s+/g, '_')}.pdf`);
            return true;
        } catch (e) {
            console.error("Erro PDF Equipe:", e);
            return false;
        }
    },

    /**
     * GERA PDF DE ESTATÍSTICAS
     */
    async generateStatisticsPDF(pautaName, statsData) {
        try {
            await ensureJsPDF();
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();

            doc.setFontSize(18);
            doc.setTextColor(22, 101, 52); // Verde escuro SIGAP
            doc.text(`Estatísticas - ${pautaName}`, 14, 20);

            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 30);

            let y = 40;

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
    },

    // ⭐ 5. EXTRATO INDIVIDUAL TEXTUAL (CHECKLIST IDÊNTICO À IMAGEM DE REFERÊNCIA) ⭐
    async generateChecklistPDF(assistedName, actionTitle, checklistData, documentosTextos) {
        try {
            await ensureJsPDF();
            const { jsPDF } = window.jspdf;
            
            // Criando PDF em formato retrato (A4)
            const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });

            let y = 60; 
            const marginX = 50; 
            const maxWidth = doc.internal.pageSize.getWidth() - (marginX * 2);
            const pageHeight = doc.internal.pageSize.getHeight();

            // Quebra de página automática
            const checkPage = (heightToAdd = 20) => {
                if (y + heightToAdd >= pageHeight - 50) {
                    doc.addPage();
                    y = 60; 
                }
            };

            // Injeta textos e aplica recuos
            const addText = (text, isBold = false, size = 10, indent = 0) => {
                doc.setFont("helvetica", isBold ? "bold" : "normal");
                doc.setFontSize(size);
                
                const textLines = doc.splitTextToSize(text, maxWidth - indent);
                checkPage(textLines.length * (size * 1.2));
                
                doc.text(textLines, marginX + indent, y);
                y += (textLines.length * (size * 1.2)) + 5;
            };

            // --- CABEÇALHO ---
            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            doc.text("Checklist de Atendimento - SIGEP", doc.internal.pageSize.getWidth() / 2, y, { align: "center" });
            y += 40;

            addText(`Assistido: ${assistedName.toUpperCase()}`, false, 11);
            addText(`Ação: ${actionTitle}`, false, 11);
            y += 30;

            // --- 1. DOCUMENTAÇÃO ENTREGUE ---
            addText("DOCUMENTAÇÃO ENTREGUE:", true, 11);
            y += 10;
            
            documentosTextos.forEach((item) => {
                if (item.id.startsWith('reu-') || item.id.startsWith('gastos-') || item.id.startsWith('gasto-')) return;
                const tipoEntrega = checklistData.docTypes && checklistData.docTypes[item.id] ? checklistData.docTypes[item.id] : 'Físico';
                addText(`[X] ${item.text} - [${tipoEntrega.toUpperCase()}]`, false, 10, 20); 
            });
            y += 20;

            // --- 2. DEMANDAS ADICIONAIS ---
            if (checklistData.demandasAdicionais && checklistData.demandasAdicionais.length > 0) {
                addText("DEMANDAS ADICIONAIS:", true, 11);
                y += 10;
                checklistData.demandasAdicionais.forEach((demanda) => {
                    addText(`• ${demanda}`, false, 10, 20);
                });
                y += 20;
            }

            // --- 3. PLANILHA DE GASTOS ---
            if (checklistData.expenseData && checklistData.expenseData.checkExibirGastos) {
                const g = checklistData.expenseData;
                addText("PLANILHA DE GASTOS:", true, 11);
                y += 10;
                
                const categoriasNome = [
                    { id: 'moradia', label: '1. MORADIA (Habitação)' },
                    { id: 'alimentacao', label: '2. ALIMENTAÇÃO' },
                    { id: 'educacao', label: '3. EDUCAÇÃO' },
                    { id: 'saude', label: '4. SAÚDE' },
                    { id: 'vestuario', label: '5. VESTUÁRIO E HIGIENE' },
                    { id: 'lazer', label: '6. LAZER E TRANSPORTE' },
                    { id: 'outras', label: '7. OUTRAS DESPESAS' }
                ];

                let totalGastos = 0;
                categoriasNome.forEach(c => {
                    const valorStr = g[c.id] || 'R$ 0,00';
                    addText(`${c.label}: ${valorStr}`, false, 10, 20); 
                    
                    const num = parseFloat(String(valorStr).replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
                    totalGastos += num;
                });

                if (totalGastos > 0) {
                    y += 5; 
                    const totalFormatado = totalGastos.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                    addText(`${totalFormatado}`, true, 10, 20); 
                }
                y += 20;
            }

            // --- 4. DADOS DA PARTE CONTRÁRIA (RÉU) ---
            if (checklistData.reuData && checklistData.reuData.checkReuUnico) {
                const r = checklistData.reuData;
                addText("DADOS DA PARTE CONTRÁRIA (RÉU):", true, 11);
                y += 10;
                
                if (r.nome) addText(`Nome: ${r.nome.toUpperCase()}`, false, 10, 20);
                
                let contatoStr = '';
                if (r.cpf) contatoStr += `CPF: ${r.cpf}`;
                if (r.telefone) {
                    if (contatoStr) contatoStr += ` | `;
                    contatoStr += `WhatsApp: ${r.telefone}`;
                }
                if (contatoStr) addText(contatoStr, false, 10, 20);
                
                if (r.rua) {
                    let endStr = `Endereço: ${r.rua}`;
                    if(r.numero) endStr += `, ${r.numero}`;
                    if(r.complemento) endStr += ` - ${r.complemento}`;
                    if(r.bairro) endStr += ` - ${r.bairro}`;
                    addText(endStr, false, 10, 20);
                    
                    let cidStr = '';
                    if(r.cidade) cidStr += `Cidade: ${r.cidade}`;
                    if(r.uf) cidStr += `/${r.uf}`;
                    if(r.cep) {
                        if (cidStr) cidStr += ` | `;
                        cidStr += `CEP: ${r.cep}`;
                    }
                    if (cidStr) addText(cidStr, false, 10, 20);
                }

                if (r.empresa) {
                    y += 5;
                    addText(`Empresa (Trabalho): ${r.empresa.toUpperCase()}`, false, 10, 20);
                    
                    let endComStr = `End. Comercial: ${r.rua_comercial}`;
                    if(r.numero_comercial) endComStr += `, ${r.numero_comercial}`;
                    if(r.complemento_comercial) endComStr += ` - ${r.complemento_comercial}`;
                    if(r.bairro_comercial) endComStr += ` - ${r.bairro_comercial}`;
                    addText(endComStr, false, 10, 20);

                    let cidComStr = '';
                    if(r.cidade_comercial) cidComStr += `Cidade: ${r.cidade_comercial}`;
                    if(r.uf_comercial) cidComStr += `/${r.uf_comercial}`;
                    if(r.cep_comercial) {
                        if (cidComStr) cidComStr += ` | `;
                        cidComStr += `CEP: ${r.cep_comercial}`;
                    }
                    if (cidComStr) addText(cidComStr, false, 10, 20);
                }
            }

            doc.save(`Checklist_SIGEP_${assistedName.replace(/\s+/g, '_')}.pdf`);
            return true;
        } catch (err) {
            console.error("Erro crítico na montagem do PDF textual:", err);
            return false;
        }
    }
};

// ========================================================
// EXPORTAÇÕES
// ========================================================

export const generateAtendidosPDF = (pautaName, atendidos) => {
    return PDFService.generateAtendidosPDF(pautaName, atendidos);
};

export const generateChecklistPDF = (assistedName, actionTitle, checklistData, documentosTextos) => {
    return PDFService.generateChecklistPDF(assistedName, actionTitle, checklistData, documentosTextos);
};

export const generateCollaboratorsPDF = (pautaName, colaboradores, selectedCols) => {
    return PDFService.generateCollaboratorsPDF(pautaName, colaboradores, selectedCols);
};

export const generateStatisticsPDF = (pautaName, statsData) => {
    return PDFService.generateStatisticsPDF(pautaName, statsData);
};

export const generateFaltososPDF = (pautaName, faltosos) => {
    return PDFService.generateFaltososPDF(pautaName, faltosos);
};


window.PDFService = PDFService;

console.log("✅ pdfService.js carregado - VERSÃO FINAL CONSOLIDADA!");
