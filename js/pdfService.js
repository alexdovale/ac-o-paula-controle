// js/pdfService.js - VERSÃO COMPLETA COM LOGO BASE64 EMBUTIDA

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

// ⭐ LOGO DO SIGEP (Base64 embutido para evitar CORS)
const LOGO_SIGEP_BASE64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAYAAAAeP4ixAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAOxAAADsQBlSsOGwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAKwSURBVGiB7Zo9a1RBFIafc/cmm0SwiQpBGyGthU1IfkCwSBHUGJE0aYR0aYJgYyEWQYj5CYKCjV9gEVHEWGilYKWQwlaCnaCajRrN3tz5mNybq2Hu3rmze/YphJw5c+Z9zpmzZ46AEEIIIYQQQgghhBBCCCGEEEKIIx0zHdpUM8+IHl3tRPQX6HE0X6b1UjQv9arTG5mB7jWzgPV2tcIcygGsmpnGMNix0Ceu0lLmY9Ush61t1Y8IIHaAWTML28zMJoB5MysFoATwBngAjAKPgGdRi4BxIArMxcI6MBYjfD6w+0MAu1HVrGj7rGhmT4FDLh8Dr0w0UAVAbxfNp6bKfAFeuNjcAZaBA1x1qDnwF9jL4StYAb5FvwLvk9qBx4CXaB9m2tCuYhU1g0tL1e8GbpvZUwM3/aCqVc2+5HRFgT6K2z7UzF5Z0c06gZtmNh+ySVeBYyMvLLR8OQa8NrPbgcZ6kUlUtaqZcTDQmS1mZgM8sY6cB8WsD2tQ8zHauSg75qqqvZGFbURuBPg/1lXKzAodkFqBp9FZA49loH/ATgt5HTgNHEuonKnmOzIfawADN4FcmjkKrCbUYwP+AEdmVjXKPDOzg4GGRkIA/4CDaL7N9BypqkrRZZeCzZt5wAmgZ0W9bGZNt2sFeB14FzIggDngLNDVK2smxFEuM3sLHADWo7N3F7jiM4g6wH7RRSt3KvJ0Af0U0k+7WVE1szaLEsG/pgKfqubdyE6XgO9AZzXjDbjvC9qRk4U3IWRgOeTt3apqO/I+gOuBrJ0R5XqWt1R1BQvQxW5oAn5kZ5KYgE/m+R7KcJ7PzJZdfD7RHmCy5knOzKyw3Z7h9vV5tOfsIQQqD4YQQgghhBBCCCGEEEIIIYQQosB/AIIQ3sh3rK8HAAAAAElFTkSuQmCC";

// ⭐ LOGO DA DEFENSORIA (Base64 embutido - GARANTIDO!)
const LOGO_DEFENSORIA_BASE64 = "data:image/png;base64,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";

// ⭐ FUNÇÃO: Adiciona cabeçalho com logo do SIGEP (Base64)
const addLogoHeader = async (doc, startY = 20) => {
    try {
        doc.addImage(LOGO_SIGEP_BASE64, 'PNG', doc.internal.pageSize.getWidth() - 35, startY, 25, 25);
        return true;
    } catch(e) {
        console.warn("Erro ao inserir logo SIGEP no PDF", e);
        return false;
    }
};

// ⭐ FUNÇÃO: Adiciona rodapé padrão
const addFooter = (doc, pageNumber, totalPages) => {
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`SIGEP - Sistema de Gerenciamento de Pauta | ${new Date().toLocaleString('pt-BR')} | Página ${pageNumber}`, 
             doc.internal.pageSize.getWidth() / 2, pageHeight - 10, { align: 'center' });
};

// ⭐ FUNÇÃO GARANTIDA: buildAtaAcaoSocialPDF - COM LOGO BASE64
const buildAtaAcaoSocialPDF = async (doc, pautaName, colaboradores, atendidos, dadosExtras = {}) => {
    console.log("📄 Iniciando geração da Ata Social...");
    
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

    // ⭐⭐⭐ LOGO DA DEFENSORIA - BASE64 EMBUTIDO (GARANTIDO!) ⭐⭐⭐
    try { 
        const pageWidth = doc.internal.pageSize.getWidth();
        const logoWidth = 90;
        const logoHeight = 30;
        const xPos = (pageWidth - logoWidth) / 2;
        doc.addImage(LOGO_DEFENSORIA_BASE64, 'PNG', xPos, 8, logoWidth, logoHeight);
        console.log("✅ Logo da Defensoria inserida com sucesso via Base64!");
    } catch(e) { 
        console.error("❌ Erro ao inserir logo no PDF:", e); 
    }

    // Título
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("ATA AÇÃO SOCIAL", 105, 48, { align: "center" });

    // Texto introdutório
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    
    const introText = `Aos ${dia} dias do mês de ${mesExtenso} do ano de ${ano}, a partir das 9h, em ${endereco}, trabalharam na ${nomeDaAcao}, os(as) Defensores(as) Públicos(as) abaixo listados(as), bem como os(as) servidores(as), conforme listagem a seguir:`;
    
    const splitIntro = doc.splitTextToSize(introText, 170);
    doc.text(splitIntro, 20, 58);
    
    let currentY = 58 + (splitIntro.length * 4.5);

    // Ordena colaboradores
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

    // Tabela de Defensores
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

    // Tabela de Servidores
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

    // Órgão e Total
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

    // Observações
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
    
    console.log("✅ Ata Social gerada com sucesso!");
};

// ⭐ FUNÇÃO AUXILIAR - GERAÇÃO DINÂMICA DE TABELA DE COLABORADORES
const generateCollaboratorsTable = (docPDF, colaboradores, pautaNome, campos) => {
    const colMap = {
        'nome': { label: 'Membro', getData: (c) => c.nome || 'N/A' },
        'cargo': { label: 'Cargo', getData: (c) => c.cargo || 'N/A' },
        'equipe': { label: 'Equipe', getData: (c) => c.equipe ? `EQP ${c.equipe}` : 'N/A' },
        'transporte': { label: 'Deslocamento', getData: (c) => {
            let desc = c.transporte || 'Não Informado';
            if (c.transporte === 'Com a Empresa' && c.localEncontro) desc += ` (${c.localEncontro})`;
            return desc;
        }},
        'status': { label: 'Status', getData: (c) => c.presente ? 'Presente' : 'Ausente' },
        'presenca': { label: 'Status / Horário', getData: (c) => c.presente ? `Presente (${c.horario})` : 'Ausente' },
        'identificador': { label: 'Matrícula/ID', getData: (c) => getIdentificador(c) }
    };

    const header = [campos.map(key => colMap[key]?.label || key)];
    
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

    const tableData = [];
    let currentEquipe = null;

    sortedColaboradores.forEach(c => {
        const equipeAtual = c.equipe ? `Equipe ${c.equipe}` : 'Sem Equipe';
        
        if (equipeAtual !== currentEquipe) {
            currentEquipe = equipeAtual;
            tableData.push([
                {
                    content: equipeAtual.toUpperCase(),
                    colSpan: campos.length,
                    styles: { fillColor: [240, 253, 244], textColor: [21, 128, 61], fontStyle: 'bold', halign: 'center' }
                }
            ]);
        }
        
        tableData.push(campos.map(key => colMap[key] ? colMap[key].getData(c) : 'N/A'));
    });

    docPDF.autoTable({
        head: header,
        body: tableData,
        startY: 70,
        theme: 'striped',
        headStyles: { fillColor: [22, 163, 74] },
        styles: { fontSize: 9, halign: 'center', valign: 'middle' }
    });
};

// ========================================================
// PDF SERVICE - EXPORT (VERSÃO HÍBRIDA COMPLETA)
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

            doc.autoTable({
                startY: 110,
                head: [["Categoria", "Valor Mensal (R$)"]],
                body: [
                    ["Moradia", formatCurrency(expenseData?.moradia)],
                    ["Alimentação", formatCurrency(expenseData?.alimentacao)],
                    ["Educação", formatCurrency(expenseData?.educacao)],
                    ["Saúde", formatCurrency(expenseData?.saude)],
                    ["Vestuário e Higiene", formatCurrency(expenseData?.vestuario)],
                    ["Lazer e Transporte", formatCurrency(expenseData?.lazer)],
                    ["Outras Despesas", formatCurrency(expenseData?.outras)]
                ],
                margin: { left: (doc.internal.pageSize.getWidth() - 430) / 2 },
                theme: 'striped',
                headStyles: { fillColor: [22, 163, 74] }
            });

            doc.save(`Planilha_Despesas_${(assistedName||'Assistido').replace(/\s+/g, '_')}.pdf`);
            return true;
        } catch (error) {
            console.error("Erro PDF Planilha:", error);
            return false;
        }
    },

    async generateAtaAcaoSocial(pautaName, colaboradores, atendidos, dadosExtras = {}) {
        try {
            await ensureJsPDF();
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
            
            await buildAtaAcaoSocialPDF(doc, pautaName, colaboradores, atendidos, dadosExtras);
            
            doc.save(`Ata_Social_${(dadosExtras.acao || pautaName).replace(/\s+/g, '_')}.pdf`);
            return true;
            
        } catch (error) {
            console.error("Erro ao gerar Ata Social:", error);
            return false;
        }
    },

    async previewAtaAcaoSocial(pautaName, colaboradores, atendidos, dadosExtras = {}) {
        try {
            await ensureJsPDF();
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
            
            await buildAtaAcaoSocialPDF(doc, pautaName, colaboradores, atendidos, dadosExtras);
            
            const pdfBlob = doc.output('blob');
            const pdfUrl = URL.createObjectURL(pdfBlob);
            window.open(pdfUrl, '_blank');
            return true;
            
        } catch (error) {
            console.error("Erro ao gerar Preview da Ata Social:", error);
            return false;
        }
    },

    async generateAtendidosPDF(arg1, arg2) {
        try {
            await ensureJsPDF();
            const { jsPDF } = window.jspdf;
            const docPDF = new jsPDF({ orientation: 'l', unit: 'pt', format: 'a4' });

            await addLogoHeader(docPDF, 20);

            const atendidosList = Array.isArray(arg1) ? arg1 : (Array.isArray(arg2) ? arg2 : []);
            const pautaNome = typeof arg1 === 'string' ? arg1 : (typeof arg2 === 'string' ? arg2 : 'Geral');

            docPDF.setFontSize(18);
            docPDF.setTextColor(22, 163, 74); 
            docPDF.text(`Relatório de Atendidos - ${pautaNome}`, 40, 55);

            docPDF.setFontSize(10);
            docPDF.setTextColor(100);
            const totalAssuntos = atendidosList.reduce((acc, a) => acc + 1 + (a.demandas?.quantidade || 0), 0);
            docPDF.text(`Data: ${new Date().toLocaleString('pt-BR')}`, 40, 70);
            docPDF.text(`Total: ${atendidosList.length} assistidos | Assuntos totais: ${totalAssuntos}`, 40, 83);

            const head = [["#", "Nome", "Agendado", "Chegou", "Chamado", "Duração", "Assunto", "Atendente", "Validado Verde"]];

            const body = atendidosList.map((item, index) => {
                const arrivalDate = getSafeDate(item.arrivalTime);
                const attendedDate = getSafeDate(item.attendedTime);

                let duration = 'N/A';
                if (arrivalDate && attendedDate) {
                    const diffMs = attendedDate.getTime() - arrivalDate.getTime();
                    duration = calculateDuration(Math.round(diffMs / 60000));
                }

                const arrStr = arrivalDate ? arrivalDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '---';
                const attStr = attendedDate ? attendedDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '---';
                let atendente = getAttendantNameForPDF(item);

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

            if (body.length === 0) body.push([{ content: "Nenhum atendimento finalizado nesta pauta.", colSpan: 9, styles: { halign: 'center', fontStyle: 'italic' } }]);

            docPDF.autoTable({
                head: head,
                body: body,
                startY: 100,
                theme: 'striped',
                headStyles: { fillColor: [22, 163, 74] },
                styles: { fontSize: 8, cellPadding: 4, halign: 'center' },
                columnStyles: { 0: { cellWidth: 25 }, 1: { cellWidth: 110 }, 6: { cellWidth: 150 } }
            });

            addFooter(docPDF, 1, 1);

            docPDF.save(`atendidos_${pautaNome.replace(/\s+/g, '_')}.pdf`);
            return true;
        } catch (error) {
            console.error("Erro PDF Atendidos:", error);
            return false;
        }
    },
    
    async generateFaltososPDF(arg1, arg2) {
        try {
            await ensureJsPDF();
            const { jsPDF } = window.jspdf;
            const docPDF = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });

            await addLogoHeader(docPDF, 20);

            const faltososList = Array.isArray(arg1) ? arg1 : (Array.isArray(arg2) ? arg2 : []);
            const pautaNome = typeof arg1 === 'string' ? arg1 : (typeof arg2 === 'string' ? arg2 : 'Geral');

            docPDF.setFontSize(18);
            docPDF.setTextColor(22, 163, 74);
            docPDF.text(`Relatório de Faltosos - ${pautaNome}`, 40, 55);

            docPDF.setFontSize(10);
            docPDF.setTextColor(100);
            docPDF.text(`Data de Emissão: ${new Date().toLocaleString('pt-BR')}`, 40, 70);
            docPDF.text(`Total de Ausências: ${faltososList.length}`, 40, 83);

            const head = [["#", "Nome do Assistido", "Agendado", "Assunto", "Falta às", "Verde"]];

            const body = faltososList.map((item, index) => {
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

            if (body.length === 0) body.push([{ content: "Nenhum assistido marcado como faltoso.", colSpan: 6, styles: { halign: 'center', fontStyle: 'italic' } }]);

            docPDF.autoTable({
                head: head,
                body: body,
                startY: 100,
                theme: 'grid',
                headStyles: { fillColor: [22, 163, 74] },
                styles: { fontSize: 8, cellPadding: 5, halign: 'center', valign: 'middle', overflow: 'linebreak' },
                columnStyles: { 
                    1: { halign: 'left', cellWidth: 140 }, 
                    3: { halign: 'left', cellWidth: 160 }, 
                    5: { fontStyle: 'bold' } 
                }
            });

            addFooter(docPDF, 1, 1);

            docPDF.save(`faltosos_${pautaNome.replace(/\s+/g, '_')}.pdf`);
            return true;
        } catch (error) {
            console.error("Erro PDF Faltosos:", error);
            return false;
        }
    },

    async generateCollaboratorsPDF(arg1, arg2, arg3) {
        try {
            await ensureJsPDF();
            const { jsPDF } = window.jspdf;
            const docPDF = new jsPDF();

            await addLogoHeader(docPDF, 15);

            let colaboradores = [];
            let pautaNome = 'Geral';
            let colunas = ['nome', 'cargo', 'equipe', 'transporte'];

            if (arg1 && !Array.isArray(arg1) && arg1.colaboradores) {
                colaboradores = arg1.colaboradores || [];
                pautaNome = arg1.pautaNome || 'Geral';
                colunas = arg1.colunas || ['nome', 'cargo', 'equipe', 'transporte'];
            } else if (Array.isArray(arg1)) {
                colaboradores = arg1;
                if (typeof arg2 === 'string') pautaNome = arg2;
                if (Array.isArray(arg3)) colunas = arg3;
            }

            if (!colaboradores || colaboradores.length === 0) {
                console.warn("Nenhum colaborador na lista para gerar PDF.");
                return false;
            }

            const colMap = {
                'nome': { label: 'Membro da Equipe', getData: (c) => c.nome },
                'cargo': { label: 'Cargo', getData: (c) => c.cargo || 'N/A' },
                'equipe': { label: 'Equipe', getData: (c) => c.equipe ? `EQP ${c.equipe}` : 'N/A' },
                'presenca': { label: 'Status / Horário', getData: (c) => c.presente ? `Presente (${c.horario})` : 'Ausente' },
                'identificador': { label: 'Matrícula/ID', getData: (c) => c.identificador || 'N/A' },
                'telefone': { label: 'Telefone', getData: (c) => c.telefone || 'N/A' },
                'email': { label: 'E-mail', getData: (c) => c.email || 'N/A' },
                'horario': { label: 'Chegada', getData: (c) => c.horario || '--:--' },
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

            const header = [colunas.map(key => colMap[key] ? colMap[key].label : key)];
            const tableData = [];
            let currentEquipe = null;

            sortedColaboradores.forEach(c => {
                const equipeAtual = c.equipe ? `Equipe ${c.equipe}` : 'Sem Equipe';
                
                if (equipeAtual !== currentEquipe) {
                    currentEquipe = equipeAtual;
                    tableData.push([
                        {
                            content: equipeAtual.toUpperCase(),
                            colSpan: colunas.length, 
                            styles: { fillColor: [240, 253, 244], textColor: [21, 128, 61], fontStyle: 'bold', halign: 'center' }
                        }
                    ]);
                }
                
                tableData.push(colunas.map(key => colMap[key] ? colMap[key].getData(c) : 'N/A'));
            });

            docPDF.setFontSize(16);
            docPDF.setTextColor(22, 163, 74); 
            docPDF.text("Lista de Presença da Equipe", 14, 40);
            
            docPDF.setFontSize(10);
            docPDF.text(`Pauta: ${pautaNome}`, 14, 55);

            docPDF.autoTable({
                head: header,
                body: tableData,
                startY: 70,
                theme: 'striped',
                headStyles: { fillColor: [22, 163, 74] },
                styles: { fontSize: 9, halign: 'center', valign: 'middle' }
            });

            addFooter(docPDF, 1, 1);

            docPDF.save(`equipe_${pautaNome.replace(/\s+/g, '_')}.pdf`);
            return true;
        } catch (e) {
            console.error("Erro PDF Equipe:", e);
            return false;
        }
    },
    
    async generateChecklistPDF(assistedName, actionTitle, checklistData, documentosTextos) {
        try {
            await ensureJsPDF();
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });

            let y = 60; 
            const marginX = 50; 
            const maxWidth = doc.internal.pageSize.getWidth() - (marginX * 2);
            const pageHeight = doc.internal.pageSize.getHeight();

            const logoSigep = LOGO_SIGEP_BASE64;
            if (logoSigep) {
                try {
                    doc.addImage(logoSigep, 'PNG', doc.internal.pageSize.getWidth() - 45, 15, 35, 35);
                } catch(e) {
                    console.warn("Erro ao inserir logo SIGEP no PDF", e);
                }
            }

            const checkPage = (heightToAdd = 20) => {
                if (y + heightToAdd >= pageHeight - 50) {
                    const pageNumber = doc.internal.getNumberOfPages() + 1;
                    addFooter(doc, pageNumber, 1);
                    doc.addPage();
                    y = 60;
                    if (logoSigep) {
                        try {
                            doc.addImage(logoSigep, 'PNG', doc.internal.pageSize.getWidth() - 45, 15, 35, 35);
                        } catch(e) {}
                    }
                }
            };

            const addText = (text, isBold = false, size = 10, indent = 0) => {
                doc.setFont("helvetica", isBold ? "bold" : "normal");
                doc.setFontSize(size);
                const textLines = doc.splitTextToSize(text, maxWidth - indent);
                checkPage(textLines.length * (size * 1.2));
                doc.text(textLines, marginX + indent, y);
                y += (textLines.length * (size * 1.2)) + 5;
            };

            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            doc.text("Checklist de Atendimento - SIGEP", doc.internal.pageSize.getWidth() / 2, y, { align: "center" });
            y += 40;

            addText(`Assistido: ${assistedName.toUpperCase()}`, false, 11);
            addText(`Ação: ${actionTitle}`, false, 11);
            y += 30;

            addText("DOCUMENTAÇÃO ENTREGUE:", true, 11);
            y += 10;
            
            documentosTextos.forEach((item) => {
                if (item.id.startsWith('reu-') || item.id.startsWith('gastos-') || item.id.startsWith('gasto-')) return;
                const tipoEntrega = checklistData.docTypes && checklistData.docTypes[item.id] ? checklistData.docTypes[item.id] : 'Físico';
                addText(`[X] ${item.text} - [${tipoEntrega.toUpperCase()}]`, false, 10, 20); 
            });
            y += 20;

            if (checklistData.demandasAdicionais && checklistData.demandasAdicionais.length > 0) {
                addText("DEMANDAS ADICIONAIS:", true, 11);
                y += 10;
                checklistData.demandasAdicionais.forEach((demanda) => {
                    addText(`• ${demanda}`, false, 10, 20);
                });
                y += 20;
            }

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
                    if (valorStr !== 'R$ 0,00') {
                        addText(`${c.label}: ${valorStr}`, false, 10, 20); 
                        const num = parseFloat(String(valorStr).replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
                        totalGastos += num;
                    }
                });

                if (totalGastos > 0) {
                    y += 5; 
                    const totalFormatado = totalGastos.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                    addText(`TOTAL: ${totalFormatado}`, true, 10, 20); 
                }
                y += 20;
            }

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

                let temDadosReuSocio = false;
                const dadosReuSocio = [];
                
                let ocupacao = r.ocupacao;
                if (r.ocupacaoNaoSei) ocupacao = 'Não informado (Não soube informar)';
                if (ocupacao && ocupacao.trim() !== '' && !r.ocupacaoNaoSei) {
                    dadosReuSocio.push(`Ocupação: ${ocupacao}`);
                    temDadosReuSocio = true;
                } else if (r.ocupacaoNaoSei) {
                    dadosReuSocio.push(`Ocupação: Não informado (Não soube informar)`);
                    temDadosReuSocio = true;
                }
                
                let profissao = r.profissao;
                if (r.profissaoNaoSei) profissao = 'Não informado (Não soube informar)';
                if (profissao && profissao.trim() !== '' && !r.profissaoNaoSei) {
                    dadosReuSocio.push(`Profissão: ${profissao}`);
                    temDadosReuSocio = true;
                } else if (r.profissaoNaoSei) {
                    dadosReuSocio.push(`Profissão: Não informado (Não soube informar)`);
                    temDadosReuSocio = true;
                }
                
                let estadoCivil = r.estadoCivil;
                if (r.estadoCivilNaoSei) estadoCivil = 'Não informado (Não soube informar)';
                if (estadoCivil && estadoCivil.trim() !== '' && !r.estadoCivilNaoSei) {
                    dadosReuSocio.push(`Estado Civil: ${estadoCivil}`);
                    temDadosReuSocio = true;
                } else if (r.estadoCivilNaoSei) {
                    dadosReuSocio.push(`Estado Civil: Não informado (Não soube informar)`);
                    temDadosReuSocio = true;
                }
                
                let ganhos = r.ganhos;
                if (r.ganhosNaoSei) ganhos = 'Não informado (Não soube informar)';
                if (ganhos && ganhos.trim() !== '' && ganhos !== 'R$ 0,00' && !r.ganhosNaoSei) {
                    dadosReuSocio.push(`Ganhos Líquidos: ${ganhos}`);
                    temDadosReuSocio = true;
                } else if (r.ganhosNaoSei) {
                    dadosReuSocio.push(`Ganhos Líquidos: Não informado (Não soube informar)`);
                    temDadosReuSocio = true;
                }
                
                if (r.fonteRenda && r.fonteRenda.trim() !== '') {
                    dadosReuSocio.push(`Fonte de Renda: ${r.fonteRenda}`);
                    temDadosReuSocio = true;
                }
                
                if (temDadosReuSocio) {
                    y += 10;
                    addText("PERFIL SOCIOECONÔMICO DO RÉU:", true, 11);
                    y += 10;
                    dadosReuSocio.forEach(dado => {
                        addText(`• ${dado}`, false, 10, 20);
                    });
                    y += 20;
                }
            }

            const totalPages = doc.internal.getNumberOfPages();
            for (let i = 1; i <= totalPages; i++) {
                doc.setPage(i);
                addFooter(doc, i, totalPages);
            }

            doc.save(`Checklist_SIGEP_${assistedName.replace(/\s+/g, '_')}.pdf`);
            return true;
        } catch (err) {
            console.error("Erro crítico na montagem do PDF textual:", err);
            return false;
        }
    }
};

// ⭐ EXPORTS AVULSOS
export const generateAtendidosPDF = (arg1, arg2) => PDFService.generateAtendidosPDF(arg1, arg2);
export const generateChecklistPDF = (assistedName, actionTitle, checklistData, documentosTextos) => PDFService.generateChecklistPDF(assistedName, actionTitle, checklistData, documentosTextos);
export const generateCollaboratorsPDF = (arg1, arg2, arg3) => PDFService.generateCollaboratorsPDF(arg1, arg2, arg3);
export const generateFaltososPDF = (arg1, arg2) => PDFService.generateFaltososPDF(arg1, arg2);

window.PDFService = PDFService;
