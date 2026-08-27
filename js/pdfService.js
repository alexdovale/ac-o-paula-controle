// js/pdfService.js - VERSÃO DEFINITIVA ATUALIZADA

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

// Função auxiliar para ordenar por horário de agendamento (Ex: "09:00", "13:30")
const sortByScheduledTime = (a, b) => {
    const timeA = a.scheduledTime || '';
    const timeB = b.scheduledTime || '';
    
    if (timeA === '---' || timeA.toLowerCase() === 'avulso' || !timeA) return 1;
    if (timeB === '---' || timeB.toLowerCase() === 'avulso' || !timeB) return -1;
    
    return timeA.localeCompare(timeB);
};

// LOGOS TRANSFORMADAS EM RAW GITHUB
const LOGO_ATA_RAW = "https://raw.githubusercontent.com/alexdovale/Calculadora-de-Acervo-Documental/main/logo%20(2).png";
const LOGO_DEMAIS_PDF_RAW = "https://raw.githubusercontent.com/alexdovale/ponto.codoc/main/imagem.png";

// Proporção padrão mantida
const LOGO_DEFENSORIA_RATIO = 535 / 120;

// Função auxiliar para carregar imagens de URLs externas de forma assíncrona
const loadImage = (url) => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => resolve(img);
        img.onerror = (e) => reject(e);
        img.src = url;
    });
};

// FUNÇÃO: Adiciona a logo nos demais relatórios/estatísticas (Exceção da Ata)
const addLogoHeader = async (doc, startY = 15) => {
    const larguraDesejada = 45;
    const alturaMaxima = 35; 

    try {
        const img = await loadImage(LOGO_DEMAIS_PDF_RAW);
        const proporcaoReal = img.width / img.height;
        let alturaProporcional = larguraDesejada / proporcaoReal;

        if (alturaProporcional > alturaMaxima) {
            alturaProporcional = alturaMaxima;
        }

        doc.addImage(img, 'PNG', 40, startY, larguraDesejada, alturaProporcional);

        return {
            success: true,
            height: alturaProporcional,
            bottomY: startY + alturaProporcional
        };
    } catch (e) {
        console.error("❌ Erro ao renderizar a logo do SIGEP:", e);
        return { success: false, height: 0, bottomY: startY };
    }
};

// FUNÇÃO: Adiciona rodapé padrão
const addFooter = (doc, pageNumber, totalPages) => {
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`SIGEP - Sistema de Gerenciamento de Pauta | ${new Date().toLocaleString('pt-BR')} | Página ${pageNumber}`, 
             doc.internal.pageSize.getWidth() / 2, pageHeight - 10, { align: 'center' });
};

// FUNÇÃO: buildAtaAcaoSocialPDF - EXCLUSIVA COM LOGO DA ATA CENTRALIZADA
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

    try {
        const img = await loadImage(LOGO_ATA_RAW);
        const pageWidth = doc.internal.pageSize.getWidth();
        const logoWidth = 90; 
        const logoHeight = logoWidth / LOGO_DEFENSORIA_RATIO; 
        const xPos = (pageWidth - logoWidth) / 2;
        
        doc.addImage(img, 'PNG', xPos, 8, logoWidth, logoHeight);
        console.log("✅ Logo RAW inserida com sucesso no PDF da Ata!");
    } catch(e) { 
        console.error("❌ Erro ao inserir logo RAW no PDF da Ata:", e); 
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("ATA AÇÃO SOCIAL", 105, 52, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    
    const introText = `Aos ${dia} dias do mês de ${mesExtenso} do ano de ${ano}, a partir das 9h, em ${endereco}, trabalharam na ${nomeDaAcao}, os(as) Defensores(as) Públicos(as) abaixo listados(as), bem como os(as) servidores(as), conforme listagem a seguir:`;
    
    const splitIntro = doc.splitTextToSize(introText, 170);
    doc.text(splitIntro, 20, 62);
    
    let currentY = 62 + (splitIntro.length * 4.5);

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

// ========================================================
// PDF SERVICE - EXPORT
// ========================================================

export const PDFService = {
    
        async generatePlanilhaGastosPDF(assistedName, expenseData) {
        try {
            await ensureJsPDF(); 
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });

            // Adiciona a logo padrão do SIGEP no topo
            const logoInfo = await addLogoHeader(doc, 20);
            let y = Math.max(55, logoInfo.bottomY + 20);

            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            doc.text("PLANILHA DE GASTOS E NECESSIDADE MENSAIS", doc.internal.pageSize.getWidth() / 2, y, { align: "center" });
            y += 30;

            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);
            doc.text(`Assistido(a): ${assistedName.toUpperCase()}`, 40, y);
            y += 18;

            const moradores = expenseData?.quantidadeMoradores || '1';
            doc.text(`Número de moradores na residência: ${moradores}`, 40, y);
            y += 25;

            // Transforma os dados salvos no Firebase em linhas para a tabela do AutoTable
            const bodyRows = [];
            let totalFamilia = 0;
            let totalCrianca = 0;

            const limpaMoeda = (valStr) => {
                if (!valStr || valStr === 'R$ 0,00') return 0;
                return parseFloat(String(valStr).replace(/[^\d,]/g, '').replace(',', '.')) || 0;
            };

            // Categorias Comuns (Rateadas)
            const comuns = [
                { id: 'aluguel', label: 'Aluguel Residencial' },
                { id: 'condominio', label: 'Condomínio' },
                { id: 'iptu', label: 'IPTU' },
                { id: 'luz', label: 'Energia Elétrica (Luz)' },
                { id: 'agua', label: 'Água / Saneamento' },
                { id: 'gas', label: 'Gás de Cozinha' },
                { id: 'internet', label: 'Internet Banda Larga' },
                { id: 'supermercado', label: 'Supermercado (Alimentação)' }
            ];

            bodyRows.push([{ content: 'GASTOS COMUNS / FAMÍLIA (RATEADOS)', colSpan: 3, styles: { fillColor: [240, 253, 244], fontStyle: 'bold', textColor: [21, 128, 61] } }]);
            
            comuns.forEach(c => {
                const valTotal = limpaMoeda(expenseData?.[c.id]);
                const cotaParte = valTotal / parseInt(moradores || 1);
                if (valTotal > 0) {
                    totalFamilia += cotaParte;
                    bodyRows.push([
                        c.label, 
                        formatCurrency(valTotal), 
                        formatCurrency(cotaParte) + ` (1/${moradores})`
                    ]);
                }
            });

            // Categorias Exclusivas da Criança
            const exclusivas = [
                { id: 'escola', label: 'Mensalidade Escolar / Creche' },
                { id: 'material_escolar', label: 'Material Escolar / Livros' },
                { id: 'merenda', label: 'Merenda Escolar / Lanches' },
                { id: 'plano_saude', label: 'Plano de Saúde / Odontológico' },
                { id: 'lazer_crianca', label: 'Lazer / Atividades Extracurriculares' }
            ];

            bodyRows.push([{ content: 'GASTOS EXCLUSIVOS DA CRIANÇA (INTEGRAIS)', colSpan: 3, styles: { fillColor: [239, 246, 255], fontStyle: 'bold', textColor: [29, 78, 216] } }]);

            exclusivas.forEach(c => {
                const valIntegral = limpaMoeda(expenseData?.[c.id]);
                if (valIntegral > 0) {
                    totalCrianca += valIntegral;
                    bodyRows.push([
                        c.label, 
                        formatCurrency(valIntegral), 
                        formatCurrency(valIntegral) + ' (Integral)'
                    ]);
                }
            });

            const totalGeral = totalFamilia + totalCrianca;

            doc.autoTable({
                startY: y,
                head: [["Descrição Detalhada do Gasto", "Valor Total Família", "Gasto Proporcional / Integral"]],
                body: bodyRows,
                margin: { left: 40, right: 40 },
                theme: 'grid',
                headStyles: { fillColor: [22, 163, 74], halign: 'center', fontSize: 9 },
                styles: { fontSize: 8, cellPadding: 5, valign: 'middle' },
                columnStyles: { 
                    1: { halign: 'right', cellWidth: 110 }, 
                    2: { halign: 'right', cellWidth: 130 } 
                }
            });

            let finalY = doc.lastAutoTable.finalY + 15;

            // Quadro Resumo Final
            doc.autoTable({
                startY: finalY,
                head: [[{ content: 'RESUMO DOS VALORES APURADOS', colSpan: 2, styles: { fillColor: [30, 41, 59], halign: 'center', fontStyle: 'bold' } }]],
                body: [
                    ["Subtotal - Gastos Proporcionais da Família (Cota)", formatCurrency(totalFamilia)],
                    ["Subtotal - Gastos Exclusivos da Criança", formatCurrency(totalCrianca)],
                    ["VALOR TOTAL DA NECESSIDADE MENSAL APURADA", formatCurrency(totalGeral)]
                ],
                margin: { left: 40, right: 40 },
                theme: 'grid',
                styles: { fontSize: 9, cellPadding: 6, valign: 'middle' },
                columnStyles: { 
                    0: { fontStyle: 'bold', cellWidth: 350 }, 
                    1: { halign: 'right', fontStyle: 'bold', textColor: [22, 163, 74] } 
                }
            });

            addFooter(doc, 1, 1);

            doc.save(`Planilha_Gastos_${(assistedName||'Assistido').replace(/\s+/g, '_')}.pdf`);
            if (window.showNotification) window.showNotification("Planilha PDF gerada com sucesso!", "success");
            return true;
        } catch (error) {
            console.error("Erro PDF Planilha de Gastos:", error);
            if (window.showNotification) window.showNotification("Erro ao gerar PDF da planilha.", "error");
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

    // MÉTODOS PARA RELATÓRIO DE ATENDIDOS COM SELEÇÃO DE COLUNAS
    async generateAtendidosPDF(arg1, arg2) {
        return new Promise((resolve) => {
            const modalId = 'pdf-column-selector-modal';
            let modal = document.getElementById(modalId);
            if (modal) modal.remove();

            modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm transition-opacity';
            
            modal.innerHTML = `
                <div class="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
                    <div class="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                        <h3 class="text-lg font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-600"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> 
                            Configurar Relatório
                        </h3>
                    </div>
                    <div class="p-5 overflow-y-auto">
                        <p class="text-xs text-slate-500 mb-4 font-medium">Selecione quais informações devem constar no PDF final:</p>
                        
                        <div class="space-y-2 mb-2" id="pdf-columns-checkboxes">
                            <label class="flex items-center gap-3 p-3 border rounded-xl bg-slate-50 opacity-70 cursor-not-allowed border-slate-200">
                                <input type="checkbox" checked disabled class="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500">
                                <span class="font-bold text-slate-700 text-sm">Nome do Assistido (Obrigatório)</span>
                            </label>
                            <label class="flex items-center gap-3 p-3 border rounded-xl cursor-pointer hover:bg-slate-50 transition border-slate-200">
                                <input type="checkbox" value="numAgendamento" class="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500">
                                <span class="font-bold text-slate-700 text-sm">Nº do Agendamento / Senha</span>
                            </label>
                            <label class="flex items-center gap-3 p-3 border rounded-xl cursor-pointer hover:bg-slate-50 transition border-slate-200">
                                <input type="checkbox" value="scheduledTime" checked class="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500">
                                <span class="font-bold text-slate-700 text-sm">Horário Agendado</span>
                            </label>
                            <label class="flex items-center gap-3 p-3 border rounded-xl cursor-pointer hover:bg-slate-50 transition border-slate-200">
                                <input type="checkbox" value="arrivalTime" checked class="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500">
                                <span class="font-bold text-slate-700 text-sm">Horário de Chegada</span>
                            </label>
                            <label class="flex items-center gap-3 p-3 border rounded-xl cursor-pointer hover:bg-slate-50 transition border-slate-200">
                                <input type="checkbox" value="attendedTime" checked class="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500">
                                <span class="font-bold text-slate-700 text-sm">Horário de Finalização</span>
                            </label>
                            <label class="flex items-center gap-3 p-3 border rounded-xl cursor-pointer hover:bg-slate-50 transition border-slate-200">
                                <input type="checkbox" value="duration" checked class="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500">
                                <span class="font-bold text-slate-700 text-sm">Duração do Atendimento</span>
                            </label>
                            <label class="flex items-center gap-3 p-3 border rounded-xl cursor-pointer hover:bg-slate-50 transition border-slate-200">
                                <input type="checkbox" value="subject" checked class="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500">
                                <span class="font-bold text-slate-700 text-sm">Assunto Principal</span>
                            </label>
                            <label class="flex items-center gap-3 p-3 border rounded-xl cursor-pointer hover:bg-slate-50 transition border-slate-200">
                                <input type="checkbox" value="demandas" class="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500">
                                <span class="font-bold text-slate-700 text-sm">Demandas Adicionais</span>
                            </label>
                            <label class="flex items-center gap-3 p-3 border rounded-xl cursor-pointer hover:bg-slate-50 transition border-slate-200">
                                <input type="checkbox" value="attendant" checked class="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500">
                                <span class="font-bold text-slate-700 text-sm">Responsável pelo Atendimento</span>
                            </label>
                        </div>
                    </div>
                    <div class="p-5 bg-slate-50 border-t border-slate-100 flex gap-3">
                        <button id="cancel-pdf-btn" class="flex-1 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold py-3 rounded-xl transition-colors text-xs uppercase shadow-sm">Cancelar</button>
                        <button id="confirm-pdf-btn" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl transition-colors shadow-md text-xs uppercase flex items-center justify-center gap-2">
                            <span>Gerar PDF</span>
                        </button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);

            document.getElementById('cancel-pdf-btn').onclick = () => {
                modal.remove();
                resolve(false);
            };

            document.getElementById('confirm-pdf-btn').onclick = async () => {
                const btn = document.getElementById('confirm-pdf-btn');
                btn.innerHTML = `<span class="animate-spin">⏳</span> Gerando...`;
                btn.disabled = true;

                const selectedColumns = Array.from(document.querySelectorAll('#pdf-columns-checkboxes input:checked:not([disabled])')).map(cb => cb.value);
                
                let atendidosList = Array.isArray(arg1) ? arg1 : (Array.isArray(arg2) ? arg2 : []);
                const pautaNome = typeof arg1 === 'string' ? arg1 : (typeof arg2 === 'string' ? arg2 : 'Geral');

                const success = await PDFService._buildAtendidosPDF(atendidosList, pautaNome, selectedColumns);
                
                modal.remove();
                resolve(success);
            };
        });
    },

    async _buildAtendidosPDF(atendidosList, pautaNome, selectedColumns) {
        try {
            await ensureJsPDF();
            const { jsPDF } = window.jspdf;
            const docPDF = new jsPDF({ orientation: 'l', unit: 'pt', format: 'a4' });

            const logoInfo = await addLogoHeader(docPDF, 20);
            const tituloY = Math.max(55, logoInfo.bottomY + 20);

            // Ordenação
            atendidosList = [...atendidosList].sort(sortByScheduledTime);

            docPDF.setFontSize(18);
            docPDF.setTextColor(22, 163, 74); 
            docPDF.text(`Relatório de Atendidos - ${pautaNome}`, 40, tituloY);

            docPDF.setFontSize(10);
            docPDF.setTextColor(100);
            const totalAssuntos = atendidosList.reduce((acc, a) => acc + 1 + (a.demandas?.quantidade || 0), 0);
            docPDF.text(`Data da Emissão: ${new Date().toLocaleString('pt-BR')}`, 40, tituloY + 15);
            docPDF.text(`Total: ${atendidosList.length} assistidos | Volume de Demandas (Múltiplas): ${totalAssuntos}`, 40, tituloY + 28);

            // Definição Mestre das Colunas
            const colDef = [
                { key: 'name', label: 'Nome Completo' },
                { key: 'numAgendamento', label: 'Nº Agend.' },
                { key: 'scheduledTime', label: 'Agendado' },
                { key: 'arrivalTime', label: 'Chegou' },
                { key: 'attendedTime', label: 'Chamado/Fim' },
                { key: 'duration', label: 'Duração' },
                { key: 'subject', label: 'Assunto' },
                { key: 'demandas', label: 'Demandas Adicionais' },
                { key: 'attendant', label: 'Atendente' }
            ];

            // Filtra as colunas ativas (Nome é obrigatório)
            const activeCols = colDef.filter(c => c.key === 'name' || selectedColumns.includes(c.key));

            // Monta o Header do AutoTable
            const head = [["#", ...activeCols.map(c => c.label)]];

            // Monta o Body
            const body = atendidosList.map((item, index) => {
                const arrivalDate = getSafeDate(item.arrivalTime);
                const attendedDate = getSafeDate(item.attendedTime || item.attendedAt); 

                let duration = 'N/A';
                if (arrivalDate && attendedDate) {
                    const diffMs = attendedDate.getTime() - arrivalDate.getTime();
                    duration = calculateDuration(Math.round(diffMs / 60000));
                }

                const arrStr = arrivalDate ? arrivalDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '---';
                const attStr = attendedDate ? attendedDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '---';
                const atendente = getAttendantNameForPDF(item);
                
                let demandasStr = '---';
                if (item.demandas && item.demandas.descricoes && item.demandas.descricoes.length > 0) {
                    demandasStr = item.demandas.descricoes.join(', ');
                }

                const rowData = {
                    name: cleanString(item.name).toUpperCase(),
                    numAgendamento: item.numAgendamento || item.numeroAgendamento || '---',
                    scheduledTime: item.scheduledTime || (item.type === 'avulso' ? 'Avulso' : '---'),
                    arrivalTime: arrStr,
                    attendedTime: attStr,
                    duration: duration,
                    subject: cleanString(item.subject).toUpperCase(),
                    demandas: cleanString(demandasStr).toUpperCase(),
                    attendant: cleanString(atendente).toUpperCase()
                };

                return [index + 1, ...activeCols.map(c => rowData[c.key])];
            });

            if (body.length === 0) {
                body.push([{ 
                    content: "Nenhum atendimento finalizado nesta pauta até o momento.", 
                    colSpan: activeCols.length + 1, 
                    styles: { halign: 'center', fontStyle: 'italic' } 
                }]);
            }

            // A largura das colunas se ajustará automaticamente baseada na seleção
            // Fixamos apenas a largura da coluna do número "#" e alinhamento do Nome
            docPDF.autoTable({
                head: head,
                body: body,
                startY: tituloY + 45,
                theme: 'striped',
                headStyles: { fillColor: [22, 163, 74], halign: 'center' },
                styles: { fontSize: 8, cellPadding: 4, halign: 'center', valign: 'middle' },
                columnStyles: { 
                    0: { cellWidth: 25 }, 
                    1: { halign: 'left' } // A coluna 1 (Nome) sempre será alinhada à esquerda
                }
            });

            addFooter(docPDF, 1, 1);

            docPDF.save(`Relatorio_Atendidos_${pautaNome.replace(/\s+/g, '_')}.pdf`);
            if (window.showNotification) window.showNotification("Relatório gerado com sucesso!", "success");
            return true;
        } catch (error) {
            console.error("Erro PDF Atendidos Personalizado:", error);
            if (window.showNotification) window.showNotification("Falha na geração do PDF.", "error");
            return false;
        }
    },
    
    async generateFaltososPDF(arg1, arg2) {
        try {
            await ensureJsPDF();
            const { jsPDF } = window.jspdf;
            const docPDF = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });

            const logoInfo = await addLogoHeader(docPDF, 20);
            const tituloY = Math.max(55, logoInfo.bottomY + 20);

            let faltososList = Array.isArray(arg1) ? arg1 : (Array.isArray(arg2) ? arg2 : []);
            const pautaNome = typeof arg1 === 'string' ? arg1 : (typeof arg2 === 'string' ? arg2 : 'Geral');

            faltososList = [...faltososList].sort(sortByScheduledTime);

            docPDF.setFontSize(18);
            docPDF.setTextColor(22, 163, 74);
            docPDF.text(`Relatório de Faltosos - ${pautaNome}`, 40, tituloY);

            docPDF.setFontSize(10);
            docPDF.setTextColor(100);
            docPDF.text(`Data de Emissão: ${new Date().toLocaleString('pt-BR')}`, 40, tituloY + 15);
            docPDF.text(`Total de Ausências: ${faltososList.length}`, 40, tituloY + 28);

            const head = [["#", "Nome do Assistido", "Agendado", "Assunto", "Falta às"]];

            const body = faltososList.map((item, index) => {
                const logTime = getSafeDate(item.lastActionTimestamp);
                const faltaStr = logTime ? logTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '---';

                return [
                    index + 1,
                    cleanString(item.name).toUpperCase(),
                    item.scheduledTime || (item.type === 'avulso' ? 'Avulso' : '---'),
                    cleanString(item.subject).toUpperCase(), 
                    faltaStr
                ];
            });

            if (body.length === 0) body.push([{ content: "Nenhum assistido marcado como faltoso.", colSpan: 5, styles: { halign: 'center', fontStyle: 'italic' } }]);

            docPDF.autoTable({
                head: head,
                body: body,
                startY: tituloY + 45,
                theme: 'grid',
                headStyles: { fillColor: [22, 163, 74] },
                styles: { fontSize: 8, cellPadding: 5, halign: 'center', valign: 'middle', overflow: 'linebreak' },
                columnStyles: { 
                    1: { halign: 'left', cellWidth: 160 }, 
                    3: { halign: 'left', cellWidth: 180 }
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

            const logoInfo = await addLogoHeader(docPDF, 15);
            const tituloY = Math.max(40, logoInfo.bottomY + 20);

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
            docPDF.text("LISTA DAS EQUIPES", 14, tituloY);
            
            docPDF.setFontSize(10);
            docPDF.text(`PAUTA: ${pautaNome.toUpperCase()}`, 14, tituloY + 15);

            docPDF.autoTable({
                head: header,
                body: tableData,
                startY: tituloY + 30,
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

            const marginX = 50; 
            const maxWidth = doc.internal.pageSize.getWidth() - (marginX * 2);
            const pageHeight = doc.internal.pageSize.getHeight();

            const logoInfo = await addLogoHeader(doc, 15);
            let y = Math.max(60, logoInfo.bottomY + 20);

            const checkPage = (heightToAdd = 20) => {
                if (y + heightToAdd >= pageHeight - 50) {
                    const pageNumber = doc.internal.getNumberOfPages() + 1;
                    addFooter(doc, pageNumber, 1);
                    doc.addPage();
                    y = 60;
                    addLogoHeader(doc, 15);
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
                
                let profession = r.profissao;
                if (r.profissaoNaoSei) profession = 'Não informado (Não soube informar)';
                if (profession && profession.trim() !== '' && !r.profissaoNaoSei) {
                    dadosReuSocio.push(`Profissão: ${profession}`);
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

// EXPORTS AVULSOS
export const generateAtendidosPDF = (arg1, arg2) => PDFService.generateAtendidosPDF(arg1, arg2);
export const generateChecklistPDF = (assistedName, actionTitle, checklistData, documentosTextos) => PDFService.generateChecklistPDF(assistedName, actionTitle, checklistData, documentosTextos);
export const generateCollaboratorsPDF = (arg1, arg2, arg3) => PDFService.generateCollaboratorsPDF(arg1, arg2, arg3);
export const generateFaltososPDF = (arg1, arg2) => PDFService.generateFaltososPDF(arg1, arg2);

window.PDFService = PDFService;
