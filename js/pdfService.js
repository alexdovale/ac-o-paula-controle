// js/pdfService.js - VERSÃO FINAL COM ATA SOCIAL OTIMIZADA

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

// Helper para obter ID/Matrícula corretamente
const getIdentificador = (colaborador) => {
    // Prioriza o campo 'identificador' que é o padrão do sistema
    if (colaborador.identificador) return colaborador.identificador;
    // Fallback para outros campos possíveis
    if (colaborador.id) return colaborador.id;
    if (colaborador.matricula) return colaborador.matricula;
    if (colaborador.codigo) return colaborador.codigo;
    return '';
};

// Helper para obter o tipo de identificador
const getTipoIdentificador = (colaborador) => {
    if (colaborador.tipo_id) return colaborador.tipo_id;
    // Inferir pelo cargo
    if (colaborador.cargo && colaborador.cargo.toLowerCase().includes('defensor')) return 'ID';
    return 'Matrícula';
};

// ========================================================
// PDF SERVICE - Objeto com todas as funções de PDF
// ========================================================

export const PDFService = {
    /**
     * FUNÇÃO INTERNA: CONSTRÓI O DOCUMENTO DA ATA SOCIAL
     */
    _buildAtaAcaoSocialDoc(pautaName, colaboradores, atendidos, dadosExtras = {}) {
        const { jsPDF } = window.jspdf;
        
        // ORIENTAÇÃO RETRATO (altura maior para caber tudo)
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
        const orgaoAtendimento = dadosExtras.orgao || "ÓRGÃO DE ATENDIMENTO - AS";
        
        // TOTAL DE ATENDIMENTOS (pode ser personalizado ou automático)
        let totalAtendidos = dadosExtras.totalAtendimentos !== undefined 
            ? dadosExtras.totalAtendimentos 
            : atendidos.length;

        // 1. LOGO DA DEFENSORIA (esticada horizontalmente +10)
        const logoUrl = "https://raw.githubusercontent.com/alexdovale/calculo-mensuracao-codoc/main/logo.png";
        
        try {
            // Logo com largura 60 (era 50, +10) e altura proporcional 24
            doc.addImage(logoUrl, 'PNG', 75, 8, 60, 24);
        } catch (e) {
            console.warn("Não foi possível carregar a logo:", e);
        }

        // 2. TÍTULO
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.text("ATA AÇÃO SOCIAL", 105, 42, { align: "center" });

        // 3. TEXTO INTRODUTÓRIO DINÂMICO
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        
        // Destacar nome da ação em negrito no texto
        const introText = `Aos ${dia} dias do mês de ${mesExtenso} do ano de ${ano}, a partir das 9h, trabalharam na ${nomeDaAcao}, os(as) Defensores(as) Públicos(as) abaixo listados(as), bem como os(as) servidores(as), conforme listagem a seguir:`;
        
        const splitIntro = doc.splitTextToSize(introText, 170);
        doc.text(splitIntro, 20, 52);
        
        let currentY = 52 + (splitIntro.length * 5);

        // ====================================================
        // CLASSIFICAÇÃO DOS COLABORADORES POR CARGO
        // ====================================================
        
        // Defensores (qualquer cargo que contenha 'defensor')
        const defensores = colaboradores.filter(c => 
            c.cargo && c.cargo.toLowerCase().includes('defensor')
        );
        
        // Servidores, CRC, Coordenadores (excluindo defensores)
        const cargosPrincipais = ['servidor', 'crc', 'coordenador', 'coordenadora', 'tecnico', 'analista'];
        const servidoresPrincipais = colaboradores.filter(c => {
            if (!c.cargo) return false;
            const cargoLower = c.cargo.toLowerCase();
            return cargosPrincipais.some(cargo => cargoLower.includes(cargo)) && 
                   !cargoLower.includes('defensor');
        });
        
        // Outros cargos (Voluntários, Estagiários, etc)
        const outrosCargos = colaboradores.filter(c => {
            if (!c.cargo) return true;
            const cargoLower = c.cargo.toLowerCase();
            return !cargoLower.includes('defensor') && 
                   !cargosPrincipais.some(cargo => cargoLower.includes(cargo));
        });

        // ====================================================
        // FUNÇÃO AUXILIAR: CALCULAR LARGURA MÁXIMA DO NOME
        // ====================================================
        const calcularLarguraMaximaNome = (lista) => {
            let maxLength = 0;
            lista.forEach(c => {
                const nomeLen = (c.nome || '').length;
                if (nomeLen > maxLength) maxLength = nomeLen;
            });
            // Converte caracteres para mm (aproximadamente 4.5mm por 10 caracteres)
            return Math.max(70, Math.min(100, maxLength * 1.2));
        };

        // ====================================================
        // TABELA 1: DEFENSOR(A) PÚBLICO(A) - COM MESCLAGEM
        // ====================================================
        if (defensores.length > 0) {
            const larguraNome = calcularLarguraMaximaNome(defensores);
            const larguraIdentificador = 40;
            const larguraAssinatura = 190 - larguraNome - larguraIdentificador - 40; // 40 = margens
            
            doc.autoTable({
                startY: currentY + 2,
                head: [[
                    { content: 'DEFENSOR(A) PÚBLICO(A)', colSpan: 3, styles: { halign: 'center', fontStyle: 'bold', fontSize: 10, fillColor: [146, 208, 80] } }
                ]],
                body: [
                    [
                        { content: 'NOME', styles: { fillColor: [226, 239, 218], fontStyle: 'bold', halign: 'center' } },
                        { content: 'MATRÍCULA', styles: { fillColor: [226, 239, 218], fontStyle: 'bold', halign: 'center' } },
                        { content: 'ASSINATURA', styles: { fillColor: [226, 239, 218], fontStyle: 'bold', halign: 'center' } }
                    ],
                    ...defensores.map(c => [
                        { content: c.nome || '', styles: { halign: 'center' } },
                        { content: getIdentificador(c), styles: { halign: 'center' } },
                        { content: '', styles: { halign: 'center' } }
                    ])
                ],
                theme: 'grid',
                headStyles: { 
                    fillColor: [146, 208, 80], 
                    textColor: [0, 0, 0], 
                    halign: 'center', 
                    fontStyle: 'bold',
                    fontSize: 10
                },
                styles: { 
                    fontSize: 9, 
                    cellPadding: 4, 
                    lineColor: [0, 0, 0], 
                    lineWidth: 0.3,
                    valign: 'middle',
                    halign: 'center'
                },
                columnStyles: { 
                    0: { cellWidth: larguraNome }, 
                    1: { cellWidth: larguraIdentificador }, 
                    2: { cellWidth: larguraAssinatura } 
                },
                margin: { left: 20, right: 20 }
            });
            currentY = doc.lastAutoTable.finalY + 5;
        }

        // ====================================================
        // TABELA 2: SERVIDOR(A) - COM MESCLAGEM
        // ====================================================
        if (servidoresPrincipais.length > 0) {
            const larguraNome = calcularLarguraMaximaNome(servidoresPrincipais);
            const larguraIdentificador = 45;
            const larguraAssinatura = 190 - larguraNome - larguraIdentificador - 40;
            
            doc.autoTable({
                startY: currentY,
                head: [[
                    { content: 'SERVIDOR(A)', colSpan: 3, styles: { halign: 'center', fontStyle: 'bold', fontSize: 10, fillColor: [146, 208, 80] } }
                ]],
                body: [
                    [
                        { content: 'NOME', styles: { fillColor: [226, 239, 218], fontStyle: 'bold', halign: 'center' } },
                        { content: 'ID FUNCIONAL', styles: { fillColor: [226, 239, 218], fontStyle: 'bold', halign: 'center' } },
                        { content: 'ASSINATURA', styles: { fillColor: [226, 239, 218], fontStyle: 'bold', halign: 'center' } }
                    ],
                    ...servidoresPrincipais.map(c => [
                        { content: c.nome || '', styles: { halign: 'center' } },
                        { content: getIdentificador(c), styles: { halign: 'center' } },
                        { content: '', styles: { halign: 'center' } }
                    ])
                ],
                theme: 'grid',
                headStyles: { 
                    fillColor: [146, 208, 80], 
                    textColor: [0, 0, 0], 
                    halign: 'center', 
                    fontStyle: 'bold',
                    fontSize: 10
                },
                styles: { 
                    fontSize: 9, 
                    cellPadding: 4, 
                    lineColor: [0, 0, 0], 
                    lineWidth: 0.3,
                    valign: 'middle',
                    halign: 'center'
                },
                columnStyles: { 
                    0: { cellWidth: larguraNome }, 
                    1: { cellWidth: larguraIdentificador }, 
                    2: { cellWidth: larguraAssinatura } 
                },
                margin: { left: 20, right: 20 }
            });
            currentY = doc.lastAutoTable.finalY + 5;
        }

        // ====================================================
        // TABELA 3: VOLUNTÁRIOS E OUTROS CARGOS
        // ====================================================
        if (outrosCargos.length > 0) {
            const larguraNome = calcularLarguraMaximaNome(outrosCargos);
            const larguraCargo = 50;
            const larguraIdentificador = 40;
            const larguraAssinatura = 190 - larguraNome - larguraCargo - larguraIdentificador - 40;
            
            doc.autoTable({
                startY: currentY,
                head: [[
                    { content: 'VOLUNTÁRIOS E DEMAIS COLABORADORES', colSpan: 4, styles: { halign: 'center', fontStyle: 'bold', fontSize: 10, fillColor: [200, 200, 200] } }
                ]],
                body: [
                    [
                        { content: 'NOME', styles: { fillColor: [226, 239, 218], fontStyle: 'bold', halign: 'center' } },
                        { content: 'CARGO', styles: { fillColor: [226, 239, 218], fontStyle: 'bold', halign: 'center' } },
                        { content: 'ID FUNCIONAL', styles: { fillColor: [226, 239, 218], fontStyle: 'bold', halign: 'center' } },
                        { content: 'ASSINATURA', styles: { fillColor: [226, 239, 218], fontStyle: 'bold', halign: 'center' } }
                    ],
                    ...outrosCargos.map(c => [
                        { content: c.nome || '', styles: { halign: 'center' } },
                        { content: c.cargo || 'Não informado', styles: { halign: 'center' } },
                        { content: getIdentificador(c), styles: { halign: 'center' } },
                        { content: '', styles: { halign: 'center' } }
                    ])
                ],
                theme: 'grid',
                headStyles: { 
                    fillColor: [200, 200, 200], 
                    textColor: [0, 0, 0], 
                    halign: 'center', 
                    fontStyle: 'bold',
                    fontSize: 9
                },
                styles: { 
                    fontSize: 8, 
                    cellPadding: 3, 
                    lineColor: [0, 0, 0], 
                    lineWidth: 0.3,
                    valign: 'middle',
                    halign: 'center'
                },
                columnStyles: { 
                    0: { cellWidth: larguraNome }, 
                    1: { cellWidth: larguraCargo },
                    2: { cellWidth: larguraIdentificador }, 
                    3: { cellWidth: larguraAssinatura } 
                },
                margin: { left: 20, right: 20 }
            });
            currentY = doc.lastAutoTable.finalY + 5;
        }

        // ====================================================
        // TABELA RODAPÉ (ÓRGÃO E TOTAL DE ATENDIMENTOS)
        // ====================================================
        doc.autoTable({
            startY: currentY,
            body: [
                [
                    { content: orgaoAtendimento.toUpperCase(), styles: { fillColor: [226, 239, 218], fontStyle: 'bold', halign: 'center' } },
                    { content: 'TOTAL DE ATENDIMENTOS', styles: { fillColor: [226, 239, 218], fontStyle: 'bold', halign: 'center' } }
                ],
                [
                    { content: nomeDaAcao.toUpperCase(), styles: { halign: 'center' } },
                    { content: String(totalAtendidos), styles: { halign: 'center' } }
                ]
            ],
            theme: 'grid',
            styles: { 
                fontSize: 10, 
                halign: 'center', 
                cellPadding: 6, 
                lineColor: [0, 0, 0], 
                lineWidth: 0.3,
                valign: 'middle'
            },
            columnStyles: { 0: { cellWidth: 100 }, 1: { cellWidth: 50 } },
            margin: { left: 20, right: 20 }
        });
        
        currentY = doc.lastAutoTable.finalY + 10;

        // ====================================================
        // OBSERVAÇÕES (com linha e área para anotações)
        // ====================================================
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text("OBSERVAÇÕES:", 20, currentY);
        doc.setDrawColor(0, 0, 0);
        doc.line(20, currentY + 4, 190, currentY + 4);
        
        // Adicionar linhas para anotações manuais
        for (let i = 1; i <= 5; i++) {
            const lineY = currentY + 8 + (i * 6);
            if (lineY < doc.internal.pageSize.getHeight() - 20) {
                doc.setDrawColor(200, 200, 200);
                doc.line(20, lineY, 190, lineY);
            }
        }

        return doc;
    },

    /**
     * VISUALIZAR ATA (PREVIEW)
     */
    previewAtaAcaoSocial(pautaName, colaboradores, atendidos, dadosExtras = {}) {
        const doc = this._buildAtaAcaoSocialDoc(pautaName, colaboradores, atendidos, dadosExtras);
        const blob = doc.output('bloburl');
        window.open(blob, '_blank');
    },

    /**
     * GERA ATA DE AÇÃO SOCIAL (DOCUMENTO OFICIAL)
     * @param {string} pautaName - Nome da pauta/local da ação
     * @param {Array} colaboradores - Lista de colaboradores com nome, cargo, identificador, tipo_id
     * @param {Array} atendidos - Lista de atendidos (para total de atendimentos)
     * @param {Object} dadosExtras - Dados adicionais (data, endereco, acao, orgao, totalAtendimentos)
     * @returns {boolean} - Sucesso ou falha na geração
     */
    generateAtaAcaoSocial(pautaName, colaboradores, atendidos, dadosExtras = {}) {
        try {
            const doc = this._buildAtaAcaoSocialDoc(pautaName, colaboradores, atendidos, dadosExtras);
            const nomeArquivo = `Ata_Social_${(dadosExtras.acao || pautaName).replace(/\s+/g, '_')}.pdf`;
            doc.save(nomeArquivo);
            return true;
        } catch (error) {
            console.error("Erro ao gerar Ata Social:", error);
            alert("Erro ao gerar a ata. Verifique o console para mais detalhes.");
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
            alert("Erro ao baixar o PDF. Verifique se o navegador bloqueou o download.");
            return false;
        }
    },

    /**
     * GERA PDF DO CHECKLIST COMPLETO
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
     * GERA A LISTA DE PRESENÇA DA EQUIPE
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
// FUNÇÕES AVULSAS (para compatibilidade)
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

// Tornar PDFService global
window.PDFService = PDFService;

console.log("✅ pdfService.js carregado com sucesso (versão final com todos os ajustes)!");
