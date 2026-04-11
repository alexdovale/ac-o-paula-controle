// js/pdfService.js - VERSÃO FINAL CORRIGIDA (Texto limitado + Logo 106x25mm)

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

// ========================================================
// PDF SERVICE - VERSÃO FINAL
// ========================================================

export const PDFService = {
    /**
     * GERA ATA DE AÇÃO SOCIAL
     * @param {string} pautaName - Nome da pauta/ação
     * @param {array} colaboradores - Lista de colaboradores
     * @param {array} atendidos - Lista de atendidos
     * @param {object} dadosExtras - Dados adicionais { data, endereco, acao, orgao, totalAtendimentos }
     */
    generateAtaAcaoSocial(pautaName, colaboradores, atendidos, dadosExtras = {}) {
        try {
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
            // AGORA VOCÊ INFORMA O NOME DO ÓRGÃO - NÃO VEM MAIS FIXO
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
            
            // Divide o texto com largura máxima de 170mm (mesma das tabelas)
            const splitIntro = doc.splitTextToSize(introText, 170);
            doc.text(splitIntro, 20, 55);
            
            let currentY = 55 + (splitIntro.length * 4.5);

            // Filtrar por cargo
            const defensores = colaboradores.filter(c => c.cargo && c.cargo.toLowerCase().includes('defensor'));
            const servidores = colaboradores.filter(c => c.cargo && !c.cargo.toLowerCase().includes('defensor'));

            // CONFIGURAÇÃO DE LARGURAS (ASSINATURA É A MAIOR)
            const larguraNome = 65;
            const larguraIdentificador = 30;
            const larguraAssinatura = 170 - larguraNome - larguraIdentificador;

            // ====================================================
            // TABELA 1: DEFENSOR(A) PÚBLICO(A) - MATRÍCULA
            // ====================================================
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

            // ====================================================
            // TABELA 2: SERVIDOR(A) - ID FUNCIONAL
            // ====================================================
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

            // ====================================================
            // TABELA RODAPÉ
            // TÍTULO: "ÓRGÃO DE ATENDIMENTO - AS"
            // CONTEÚDO: VALOR INFORMADO VIA PARÂMETRO (ou NÃO INFORMADO)
            // ====================================================
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

            // ====================================================
            // OBSERVAÇÕES
            // ====================================================
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
    previewAtaAcaoSocial(pautaName, colaboradores, atendidos, dadosExtras = {}) {
        try {
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

            const defensores = colaboradores.filter(c => c.cargo && c.cargo.toLowerCase().includes('defensor'));
            const servidores = colaboradores.filter(c => c.cargo && !c.cargo.toLowerCase().includes('defensor'));

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
    generateAtendidosPDF(pautaName, atendidos) {
        try {
            const { jsPDF } = window.jspdf;
            const docPDF = new jsPDF({ orientation: 'l', unit: 'pt', format: 'a4' });

            docPDF.setFontSize(18);
            docPDF.setTextColor(22, 101, 52);
            docPDF.text(`Relatório de Atendidos - ${pautaName}`, 40, 40);

            docPDF.setFontSize(10);
            docPDF.setTextColor(100);
            const totalAssuntos = atendidos.reduce((acc, a) => acc + 1 + (a.demandas?.quantidade || 0), 0);
            docPDF.text(`Data: ${new Date().toLocaleString('pt-BR')}`, 40, 55);
            docPDF.text(`Total: ${atendidos.length} assistidos | Assuntos totais: ${totalAssuntos}`, 40, 68);

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
                headStyles: { fillColor: [22, 163, 74] },
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
     * GERA PDF DO CHECKLIST
     */
    generateChecklistPDF(assistedName, actionTitle, checklistData, documentosTextos = []) {
        try {
            const { jsPDF } = window.jspdf;
            const docPDF = new jsPDF();
            const pageWidth = docPDF.internal.pageSize.getWidth();
            const pageHeight = docPDF.internal.pageSize.getHeight();
            let y = 20;
            const margin = 15;

            docPDF.setFontSize(18);
            docPDF.setTextColor(22, 163, 74);
            docPDF.setFont("helvetica", "bold");
            docPDF.text("SIGAP - CHECKLIST DE ATENDIMENTO", pageWidth / 2, y, { align: "center" });
            y += 8;
            
            docPDF.setFontSize(10);
            docPDF.setTextColor(100, 100, 100);
            docPDF.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, pageWidth / 2, y, { align: "center" });
            y += 15;

            docPDF.setFontSize(12);
            docPDF.setTextColor(0, 0, 0);
            docPDF.setFont("helvetica", "bold");
            docPDF.text("1. DADOS DO ASSISTIDO", margin, y);
            y += 7;
            docPDF.setFont("helvetica", "normal");
            docPDF.setFontSize(10);
            
            docPDF.text(`Nome: ${assistedName || 'Não informado'}`, margin + 5, y);
            y += 6;
            docPDF.text(`Ação: ${actionTitle || 'Não selecionada'}`, margin + 5, y);
            y += 10;

            docPDF.setFont("helvetica", "bold");
            docPDF.setFontSize(11);
            docPDF.text("2. DOCUMENTOS SELECIONADOS:", margin, y);
            y += 7;
            docPDF.setFont("helvetica", "normal");
            docPDF.setFontSize(9);
            
            if (documentosTextos && documentosTextos.length > 0) {
                documentosTextos.forEach((doc) => {
                    if (y > pageHeight - 20) {
                        docPDF.addPage();
                        y = 20;
                    }
                    
                    const isSpecial = doc.id.startsWith('reu-') || doc.id.startsWith('gasto-');
                    const prefix = isSpecial ? '' : '[X] ';
                    
                    if (doc.id === 'reu-titulo' || doc.id === 'gastos-titulo') {
                        docPDF.setFont("helvetica", "bold");
                        docPDF.text(doc.text.trim(), margin + 5, y);
                        docPDF.setFont("helvetica", "normal");
                    } else {
                        docPDF.text(`${prefix}${doc.text}`, margin + 5, y);
                    }
                    y += 5;
                });
            } else {
                docPDF.text("Nenhum documento selecionado.", margin + 5, y);
                y += 5;
            }
            y += 5;

            if (checklistData && checklistData.expenseData) {
                const expData = checklistData.expenseData;
                const hasExpenses = expData.checkExibirGastos !== false && Object.entries(expData).some(([k, v]) =>
                    k !== 'checkExibirGastos' && v && typeof v === 'string' && v.trim() !== '' && v.trim() !== 'R$ 0,00'
                );
                
                if (hasExpenses) {
                    if (y > pageHeight - 80) {
                        docPDF.addPage();
                        y = 20;
                    }
                    
                    docPDF.setFont("helvetica", "bold");
                    docPDF.setFontSize(11);
                    docPDF.text("3. GASTOS MENSAIS INFORMADOS:", margin, y);
                    y += 7;
                    docPDF.setFont("helvetica", "normal");
                    docPDF.setFontSize(9);
                    
                    const categorias = [
                        { id: 'moradia', label: 'Moradia' },
                        { id: 'alimentacao', label: 'Alimentação' },
                        { id: 'educacao', label: 'Educação' },
                        { id: 'saude', label: 'Saúde' },
                        { id: 'vestuario', label: 'Vestuário' },
                        { id: 'lazer', label: 'Lazer' },
                        { id: 'outras', label: 'Outras' }
                    ];
                    
                    categorias.forEach(cat => {
                        let valor = checklistData.expenseData[cat.id] || '';
                        if (valor && String(valor).trim() !== '' && valor !== 'R$ 0,00') {
                            if (y > pageHeight - 20) {
                                docPDF.addPage();
                                y = 20;
                            }
                            docPDF.text(`• ${cat.label}: ${valor}`, margin + 5, y);
                            y += 5;
                        }
                    });
                    y += 5;
                }
            }

            if (checklistData && checklistData.reuData) {
                const reu = checklistData.reuData;
                const hasReu = reu.checkReuUnico === true && (reu.nome || reu.rua || reu.cep);
                if (hasReu) {
                    if (y > pageHeight - 80) { docPDF.addPage(); y = 20; }
                    docPDF.setFont("helvetica", "bold");
                    docPDF.setFontSize(11);
                    docPDF.text("4. DADOS DA PARTE CONTRARIA (REU):", margin, y);
                    y += 7;
                    docPDF.setFont("helvetica", "normal");
                    docPDF.setFontSize(9);

                    if (reu.nome) { docPDF.text(`Nome: ${reu.nome}`, margin + 5, y); y += 5; }
                    if (reu.cpf) { docPDF.text(`CPF: ${reu.cpf}`, margin + 5, y); y += 5; }
                    if (reu.rua) {
                        let end = `Endereço: ${reu.rua}`;
                        if (reu.numero) end += `, ${reu.numero}`;
                        if (reu.complemento) end += ` - ${reu.complemento}`;
                        docPDF.text(end, margin + 5, y); y += 5;
                    }
                    if (reu.bairro) { docPDF.text(`Bairro: ${reu.bairro}`, margin + 5, y); y += 5; }
                    if (reu.cidade || reu.uf) { docPDF.text(`${reu.cidade || ''}${reu.uf ? ' - ' + reu.uf : ''}`, margin + 5, y); y += 5; }
                    if (reu.cep) { docPDF.text(`CEP: ${reu.cep}`, margin + 5, y); y += 5; }
                    y += 3;
                }
            }

            const pageCount = docPDF.internal.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                docPDF.setPage(i);
                docPDF.setFontSize(8);
                docPDF.setTextColor(150, 150, 150);
                docPDF.text(
                    `Página ${i} de ${pageCount}`,
                    pageWidth - margin - 20,
                    pageHeight - 10
                );
            }

            const nomeArquivo = `Checklist_${(assistedName || 'Assistido').replace(/\s+/g, '_')}.pdf`;
            docPDF.save(nomeArquivo);
            return true;
            
        } catch (error) {
            console.error("Erro no PDFService:", error);
            return false;
        }
    },

    /**
     * GERA LISTA DE COLABORADORES
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
                styles: { fontSize: 9, halign: 'center' }
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

window.PDFService = PDFService;

console.log("✅ pdfService.js carregado - VERSÃO FINAL (Logo 106x25mm, Texto limitado)!");
