import { ico } from './icons.js';
// js/pdfService.js - SIGEP

const loadScript = (src) => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Falha ao carregar ' + src));
    document.head.appendChild(s);
});

const ensureJsPDF = async () => {
    if (typeof window.jspdf === 'undefined') {
        await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
    }
    const probe = new window.jspdf.jsPDF();
    if (typeof probe.autoTable !== 'function') {
        await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js");
    }
};

const yieldThread = () => new Promise(resolve => setTimeout(resolve, 50));
const cleanString = (str) => String(str || '').replace(/"/g, '');

const getSafeDate = (timeValue) => {
    if (!timeValue) return null;
    if (typeof timeValue === 'object' && timeValue.seconds) return new Date(timeValue.seconds * 1000);
    const date = new Date(timeValue);
    return isNaN(date.getTime()) ? null : date;
};

const calculateDuration = (totalMinutes) => {
    if (totalMinutes === null || totalMinutes < 0) return 'N/A';
    return totalMinutes >= 60 ? `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}min` : `${totalMinutes} min`;
};

const formatCurrency = (value) => {
    if (!value) return 'R$ 0,00';
    if (typeof value === 'string' && value.includes('R$')) return value;
    let num = 0;
    if (typeof value === 'string') {
        num = parseFloat(value.replace(/[R$\s]/g, '').replace(',', '.')) || 0;
    } else {
        num = value || 0;
    }
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const getIdentificador = (c) => c.identificador || c.id || c.matricula || c.codigo || '';

const getAttendantNameForPDF = (item) => {
    if (!item) return 'N/A';
    if (item.attendedBy) {
        const name = typeof item.attendedBy === 'object' ? (item.attendedBy.nome || item.attendedBy.name) : item.attendedBy;
        if (name) return String(name).trim();
    }
    if (item.assignedCollaborator && item.assignedCollaborator.name) return String(item.assignedCollaborator.name).trim();
    if (item.attendant) {
        const name = typeof item.attendant === 'object' ? (item.attendant.nome || item.attendant.name) : item.attendant;
        if (name) return String(name).trim();
    }
    return 'N/A';
};

const sortByScheduledTime = (a, b) => {
    const timeA = a.scheduledTime || '';
    const timeB = b.scheduledTime || '';
    if (timeA === '---' || timeA.toLowerCase() === 'avulso' || !timeA) return 1;
    if (timeB === '---' || timeB.toLowerCase() === 'avulso' || !timeB) return -1;
    return timeA.localeCompare(timeB);
};

const compararGrupos = (a, b) => {
    a = String(a ?? '').trim();
    b = String(b ?? '').trim();
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    const na = /^\d+$/.test(a), nb = /^\d+$/.test(b);
    if (na && nb) return Number(a) - Number(b);
    if (na) return -1;
    if (nb) return 1;
    const fixa = ['crc', 'coordenadores'];
    const ia = fixa.indexOf(a.toLowerCase()), ib = fixa.indexOf(b.toLowerCase());
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b, 'pt-BR');
};

const pesoCargo = (cargo) => {
    const c = (cargo || '').toLowerCase();
    if (c.includes('defensor')) return 1;
    if (c.includes('servidor')) return 2;
    return 3;
};

// ========================================================
// IDENTIDADE VISUAL
// ========================================================
const LOGO_ATA_RAW = "https://raw.githubusercontent.com/alexdovale/Calculadora-de-Acervo-Documental/main/logo%20(2).png";
const LOGO_DEFENSORIA_RATIO = 535 / 120;

const LOGOS = {
    horizontal: "https://firebasestorage.googleapis.com/v0/b/pauta-ce162.firebasestorage.app/o/Logo%2FLogo-sigla-horizontal.PNG?alt=media&token=42175606-cfa5-419d-b327-da1a6aa91137",
    vertical: "https://firebasestorage.googleapis.com/v0/b/pauta-ce162.firebasestorage.app/o/Logo%2FLogo-vertical-sem-fundo-sigla-extenso.PNG?alt=media&token=a8c815ac-6e66-415f-bc67-f4e93e02d302",
    marcaDagua: "https://firebasestorage.googleapis.com/v0/b/pauta-ce162.firebasestorage.app/o/Logo%2FLogo-sem-texto-sem-fundo.PNG?alt=media&token=71f18590-da74-40f9-a692-20843d4567da",
    checklist: "https://firebasestorage.googleapis.com/v0/b/pauta-ce162.firebasestorage.app/o/Logo%2FLogo-sigla-texto-horizontal-sem-fundo.PNG?alt=media&token=633132d6-543f-41f2-82c3-cc39e1b563e5"
};

const LOGO_DIM = {
    horizontal: { maxW: 130, maxH: 38 },
    vertical:   { maxW: 80,  maxH: 64 },
    checklist:  { maxW: 150, maxH: 42 }
};

const C = {
    verde: [22, 163, 74],
    verdeEscuro: [21, 128, 61],
    verdeClaro: [240, 253, 244],
    verdeBorda: [187, 247, 208],
    vermelho: [185, 28, 28],
    vermelhoClaro: [254, 242, 242],
    texto: [30, 41, 59],
    cinza: [100, 116, 139],
    cinzaClaro: [241, 245, 249],
    linha: [226, 232, 240],
    zebra: [248, 250, 252]
};

const loadImage = (url) => new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = url;
});

const imgCache = {};
const loadImageSafe = async (url) => {
    if (imgCache[url] === undefined) {
        try { imgCache[url] = await loadImage(url); }
        catch (e) { console.error("Erro ao carregar logo:", e); imgCache[url] = null; }
    }
    return imgCache[url];
};

const logoSize = (img, { maxW = 52, maxH = 36 } = {}) => {
    if (!img) return { w: 0, h: 0 };
    const ratio = img.width / img.height;
    let w = maxW, h = w / ratio;
    if (h > maxH) { h = maxH; w = h * ratio; }
    return { w, h };
};

const drawHeader = (doc, logo, { title, lines = [], margin = 40, logoOpts, centralizado = false, corTitulo }) => {
    const W = doc.internal.pageSize.getWidth();
    const top = 28;
    const { w, h } = logoSize(logo, logoOpts);
    if (logo) { try { doc.addImage(logo, 'PNG', margin, top, w, h); } catch (e) { } }

    const textX = margin + (logo ? w + 14 : 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.setTextColor(...(corTitulo || C.verdeEscuro));

    let ly = top + 28;
    if (centralizado) {
        const cx = W / 2;
        const larg = W - (margin + w + 14) * 2;
        doc.text(title, cx, top + 14, { align: 'center' });
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(...C.cinza);
        lines.forEach(l => {
            const wrapped = doc.splitTextToSize(String(l), larg);
            doc.text(wrapped, cx, ly, { align: 'center' });
            ly += wrapped.length * 12;
        });
    } else {
        doc.text(title, textX, top + 14);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(...C.cinza);
        lines.forEach(l => {
            const wrapped = doc.splitTextToSize(String(l), W - textX - margin - 110);
            doc.text(wrapped, textX, ly);
            ly += wrapped.length * 12;
        });
        doc.setFontSize(8);
        doc.text(`Emitido em ${new Date().toLocaleString('pt-BR')}`, W - margin, top + 8, { align: 'right' });
    }

    const lineY = Math.max(top + h, ly) + 6;
    doc.setDrawColor(...C.verde);
    doc.setLineWidth(1.5);
    doc.line(margin, lineY, W - margin, lineY);
    doc.setLineWidth(0.2);

    if (centralizado) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...C.cinza);
        doc.text(`Emitido em ${new Date().toLocaleString('pt-BR')}`, W - margin, lineY + 11, { align: 'right' });
    }
    return lineY + 14;
};

const drawKpis = (doc, y, items, margin = 40) => {
    const W = doc.internal.pageSize.getWidth();
    const gap = 8, h = 44;
    const w = (W - margin * 2 - gap * (items.length - 1)) / items.length;
    items.forEach((it, i) => {
        const x = margin + i * (w + gap);
        const cor = it.cor || C.verde;
        doc.setFillColor(...C.cinzaClaro);
        doc.roundedRect(x, y, w, h, 4, 4, 'F');
        doc.setFillColor(...cor);
        doc.roundedRect(x, y + 6, 3, h - 12, 1.5, 1.5, 'F');
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.setTextColor(...C.texto);
        doc.text(String(it.valor), x + 14, y + 21);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...C.cinza);
        doc.text(String(it.label), x + 14, y + 34);
    });
    return y + h + 16;
};

// Marca d'água: imagem ampliada e centralizada
const drawWatermark = (doc, img) => {
    if (!img || !PDFService.options.marcaDagua) return;
    try {
        const W = doc.internal.pageSize.getWidth();
        const H = doc.internal.pageSize.getHeight();
        const ratio = img.width / img.height;
        let w = W * 0.8, h = w / ratio;
        if (h > H * 0.7) { h = H * 0.7; w = h * ratio; }
        doc.saveGraphicsState();
        doc.setGState(new doc.GState({ opacity: 0.07 }));
        doc.addImage(img, 'PNG', (W - w) / 2, (H - h) / 2, w, h);
        doc.restoreGraphicsState();
    } catch (e) { console.warn('watermark', e); }
};

const applyFooters = (doc, { marcaDagua = null, textoSistema = true } = {}) => {
    const total = doc.internal.getNumberOfPages();
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    for (let i = 1; i <= total; i++) {
        doc.setPage(i);
        drawWatermark(doc, marcaDagua);
        doc.setDrawColor(...C.linha);
        doc.setLineWidth(0.5);
        doc.line(40, H - 28, W - 40, H - 28);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        if (textoSistema) doc.text("SIGEP · Sistema de Gerenciamento de Pauta", 40, H - 16);
        doc.text(`Página ${i} de ${total}`, W - 40, H - 16, { align: 'right' });
    }
};

const tableBase = (extra = {}) => ({
    theme: 'grid',
    headStyles: { fillColor: C.verde, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', fontSize: 8.5, lineColor: C.verde },
    alternateRowStyles: { fillColor: C.zebra },
    styles: { fontSize: 8.5, cellPadding: { top: 5, bottom: 5, left: 6, right: 6 }, lineColor: C.linha, lineWidth: 0.4, valign: 'middle', overflow: 'linebreak', textColor: C.texto },
    margin: { top: 45, left: 40, right: 40, bottom: 42 },
    ...extra
});

// ========================================================
// ATA AÇÃO SOCIAL (inalterada)
// ========================================================
const ataTabelaPessoas = (doc, startY, titulo, labelId, lista, larguras) => {
    doc.autoTable({
        startY,
        head: [[{ content: titulo, colSpan: 3, styles: { halign: 'center', fontStyle: 'bold', fontSize: 9, fillColor: [146, 208, 80] } }]],
        body: [
            [
                { content: 'NOME', styles: { fillColor: [226, 239, 218], fontStyle: 'bold', halign: 'center', fontSize: 8 } },
                { content: labelId, styles: { fillColor: [226, 239, 218], fontStyle: 'bold', halign: 'center', fontSize: 8 } },
                { content: 'ASSINATURA', styles: { fillColor: [226, 239, 218], fontStyle: 'bold', halign: 'center', fontSize: 8 } }
            ],
            ...lista.map(c => [
                { content: c.nome || '', styles: { halign: 'center', fontSize: 8, cellPadding: 2, overflow: 'linebreak' } },
                { content: getIdentificador(c), styles: { halign: 'center', fontSize: 8, cellPadding: 2 } },
                { content: '', styles: { halign: 'center', fontSize: 8, cellPadding: 2 } }
            ])
        ],
        theme: 'grid',
        headStyles: { fillColor: [146, 208, 80], textColor: [0, 0, 0], halign: 'center', fontStyle: 'bold', fontSize: 9 },
        styles: { fontSize: 8, cellPadding: 2.5, lineColor: [0, 0, 0], lineWidth: 0.2, valign: 'middle', halign: 'center' },
        columnStyles: { 0: { cellWidth: larguras.nome }, 1: { cellWidth: larguras.id }, 2: { cellWidth: larguras.assinatura } },
        margin: { left: 20, right: 20 }
    });
    return doc.lastAutoTable.finalY + 2;
};

const buildAtaAcaoSocialPDF = async (doc, pautaName, colaboradores, atendidos, dadosExtras = {}) => {
    const dataInput = dadosExtras.data ? new Date(dadosExtras.data + 'T12:00:00') : new Date();
    const dia = dataInput.getDate();
    const mesExtenso = dataInput.toLocaleString('pt-BR', { month: 'long' });
    const ano = dataInput.getFullYear();

    const endereco = dadosExtras.endereco || "Não informado";
    const nomeDaAcao = dadosExtras.acao || pautaName || "Ação Social";
    const orgaoAtendimentoConteudo = dadosExtras.orgao || "NÃO INFORMADO";
    const totalAtendidos = dadosExtras.totalAtendimentos !== undefined ? dadosExtras.totalAtendimentos : (atendidos || []).length;

    try {
        const img = await loadImage(LOGO_ATA_RAW);
        const pageWidth = doc.internal.pageSize.getWidth();
        const logoWidth = 90;
        const logoHeight = logoWidth / LOGO_DEFENSORIA_RATIO;
        doc.addImage(img, 'PNG', (pageWidth - logoWidth) / 2, 8, logoWidth, logoHeight);
    } catch (e) {
        console.error("Erro ao inserir logo RAW no PDF da Ata:", e);
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

    const defensores = (colaboradores || [])
        .filter(c => c.cargo && c.cargo.toLowerCase().includes('defensor'))
        .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    const servidores = (colaboradores || [])
        .filter(c => c.cargo && !c.cargo.toLowerCase().includes('defensor'))
        .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

    const larguraNome = 65, larguraId = 30;
    const larguras = { nome: larguraNome, id: larguraId, assinatura: 170 - larguraNome - larguraId };

    await yieldThread();

    if (defensores.length > 0) currentY = ataTabelaPessoas(doc, currentY + 1, 'DEFENSOR(A) PÚBLICO(A)', 'MATRÍCULA', defensores, larguras);
    if (servidores.length > 0) currentY = ataTabelaPessoas(doc, currentY, 'SERVIDOR(A)', 'ID FUNCIONAL', servidores, larguras);

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
        styles: { fontSize: 8, halign: 'center', cellPadding: 3, lineColor: [0, 0, 0], lineWidth: 0.2, valign: 'middle', halign: 'center' },
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
};

// ========================================================
// PDF SERVICE
// ========================================================
export const PDFService = {
    options: { marcaDagua: true },

    async generatePlanilhaGastosPDF(assistedName, expenseData) {
        if (window.showNotification) window.showNotification("Gerando demonstrativo, aguarde...", "info");
        try {
            await ensureJsPDF();
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });

            let y = 60;
            doc.setFont("helvetica", "bold");
            doc.setFontSize(12);
            doc.text("DEMONSTRATIVO DE DESPESAS MENSAIS", doc.internal.pageSize.getWidth() / 2, y, { align: "center" });
            y += 30;

            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);
            doc.text(`Representante Legal: ${(assistedName || 'REQUERENTE').toUpperCase()}`, 40, y);
            y += 18;

            const moradores = expenseData?.quantidadeMoradores || '1';
            doc.text(`Quantidade de pessoas na residência (Base para rateio): ${moradores}`, 40, y);
            y += 25;

            const bodyRows = [];
            let totalFamilia = 0;
            let totalCrianca = 0;

            const limpaMoeda = (valStr) => {
                if (!valStr || valStr === 'R$ 0,00') return 0;
                return parseFloat(String(valStr).replace(/[^\d,]/g, '').replace(',', '.')) || 0;
            };

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

            bodyRows.push([{ content: '1. Despesas Residenciais Comuns (Rateadas)', colSpan: 3, styles: { fillColor: [240, 240, 240], fontStyle: 'bold', textColor: [0, 0, 0] } }]);
            comuns.forEach(c => {
                const valTotal = limpaMoeda(expenseData?.[c.id]);
                const cotaParte = valTotal / parseInt(moradores || 1);
                if (valTotal > 0) {
                    totalFamilia += cotaParte;
                    bodyRows.push([c.label, formatCurrency(valTotal), formatCurrency(cotaParte) + ` (Cota 1/${moradores})`]);
                }
            });

            const exclusivas = [
                { id: 'escola', label: 'Mensalidade Escolar / Creche' },
                { id: 'material_escolar', label: 'Material Escolar / Livros' },
                { id: 'merenda', label: 'Merenda Escolar / Lanches' },
                { id: 'plano_saude', label: 'Plano de Saúde / Odontológico' },
                { id: 'lazer_crianca', label: 'Lazer / Atividades Extracurriculares' }
            ];

            bodyRows.push([{ content: '2. Despesas Exclusivas (Integrais)', colSpan: 3, styles: { fillColor: [240, 240, 240], fontStyle: 'bold', textColor: [0, 0, 0] } }]);
            exclusivas.forEach(c => {
                const valIntegral = limpaMoeda(expenseData?.[c.id]);
                if (valIntegral > 0) {
                    totalCrianca += valIntegral;
                    bodyRows.push([c.label, formatCurrency(valIntegral), formatCurrency(valIntegral) + ' (Integral)']);
                }
            });

            const totalGeral = totalFamilia + totalCrianca;
            await yieldThread();

            doc.autoTable({
                startY: y,
                head: [["Descrição da Despesa", "Valor Total Referência", "Valor Apurado (Necessidade)"]],
                body: bodyRows,
                margin: { left: 40, right: 40 },
                theme: 'grid',
                headStyles: { fillColor: [230, 230, 230], textColor: [0, 0, 0], halign: 'center', fontSize: 10, lineColor: [0, 0, 0], lineWidth: 0.5 },
                styles: { fontSize: 9, cellPadding: 5, valign: 'middle', lineColor: [0, 0, 0], lineWidth: 0.5, textColor: [0, 0, 0], overflow: 'linebreak' },
                columnStyles: { 1: { halign: 'center', cellWidth: 110 }, 2: { halign: 'center', cellWidth: 130 } }
            });

            const finalY = doc.lastAutoTable.finalY + 15;
            doc.autoTable({
                startY: finalY,
                body: [
                    ["Subtotal (Gastos Proporcionais / Rateados)", formatCurrency(totalFamilia)],
                    ["Subtotal (Gastos Exclusivos / Integrais)", formatCurrency(totalCrianca)],
                    [{ content: "TOTAL DA NECESSIDADE MENSAL APURADA", styles: { fontStyle: 'bold' } }, { content: formatCurrency(totalGeral), styles: { fontStyle: 'bold' } }]
                ],
                margin: { left: 40, right: 40 },
                theme: 'grid',
                styles: { fontSize: 9, cellPadding: 6, valign: 'middle', lineColor: [0, 0, 0], lineWidth: 0.5, textColor: [0, 0, 0] },
                columnStyles: { 0: { cellWidth: 350 }, 1: { halign: 'center' } }
            });

            doc.save(`Demonstrativo_Despesas_${(assistedName || 'Requerente').replace(/\s+/g, '_')}.pdf`);
            if (window.showNotification) window.showNotification("PDF Padrão gerado com sucesso!", "success");
            return true;
        } catch (error) {
            console.error("Erro PDF Planilha de Gastos:", error);
            if (window.showNotification) window.showNotification("Erro ao gerar PDF da planilha.", "error");
            return false;
        }
    },

    async generateAtaAcaoSocial(pautaName, colaboradores, atendidos, dadosExtras = {}) {
        if (window.showNotification) window.showNotification("Gerando Ata Social, aguarde...", "info");
        try {
            await ensureJsPDF();
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
            await buildAtaAcaoSocialPDF(doc, pautaName, colaboradores, atendidos, dadosExtras);
            doc.save(`Ata_Social_${(dadosExtras.acao || pautaName || 'Evento').replace(/\s+/g, '_')}.pdf`);
            if (window.showNotification) window.showNotification("Ata gerada com sucesso!", "success");
            return true;
        } catch (error) {
            console.error("Erro ao gerar Ata Social:", error);
            if (window.showNotification) window.showNotification("Falha ao gerar Ata Social.", "error");
            return false;
        }
    },

    async previewAtaAcaoSocial(pautaName, colaboradores, atendidos, dadosExtras = {}) {
        if (window.showNotification) window.showNotification("Preparando pré-visualização, aguarde...", "info");
        try {
            await ensureJsPDF();
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
            await buildAtaAcaoSocialPDF(doc, pautaName, colaboradores, atendidos, dadosExtras);
            window.open(URL.createObjectURL(doc.output('blob')), '_blank');
            return true;
        } catch (error) {
            console.error("Erro ao gerar Preview da Ata Social:", error);
            if (window.showNotification) window.showNotification("Falha na pré-visualização.", "error");
            return false;
        }
    },

    async generateAtendidosPDF(arg1, arg2) {
        return new Promise((resolve) => {
            const modalId = 'pdf-column-selector-modal';
            document.getElementById(modalId)?.remove();

            const opcoes = [
                { v: 'numAgendamento', l: 'Nº do Agendamento / Senha', on: false },
                { v: 'numeroProcesso', l: 'Número do Processo / CNP / VERDE', on: true },
                { v: 'scheduledTime', l: 'Horário Agendado', on: true },
                { v: 'arrivalTime', l: 'Horário de Chegada', on: true },
                { v: 'attendedTime', l: 'Horário de Finalização', on: true },
                { v: 'duration', l: 'Duração do Atendimento', on: true },
                { v: 'subject', l: 'Assunto Principal', on: true },
                { v: 'demandas', l: 'Demandas Adicionais', on: true },
                { v: 'resultado', l: 'Resultado (Atendido / Reagendado / Cancelado + Motivo)', on: true },
                { v: 'attendant', l: 'Responsável pelo Atendimento', on: true }
            ];

            const modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm transition-opacity';
            modal.innerHTML = `
                <div class="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
                    <div class="p-5 border-b border-slate-100 bg-slate-50">
                        <h3 class="text-lg font-black text-slate-800 flex items-center gap-2">${ico('fileText', 'w-5 h-5')} Configurar relatório</h3>
                    </div>
                    <div class="p-5 overflow-y-auto">
                        <p class="text-xs text-slate-500 mb-4 font-medium">Selecione quais informações devem constar no PDF final:</p>
                        <div class="space-y-2 mb-2" id="pdf-columns-checkboxes">
                            <label class="flex items-center gap-3 p-3 border rounded-xl bg-slate-50 opacity-70 cursor-not-allowed border-slate-200">
                                <input type="checkbox" checked disabled class="w-5 h-5 text-emerald-600 rounded">
                                <span class="font-bold text-slate-700 text-sm">Nome do Assistido (obrigatório)</span>
                            </label>
                            ${opcoes.map(o => `
                            <label class="flex items-center gap-3 p-3 border rounded-xl cursor-pointer hover:bg-emerald-50 hover:border-emerald-300 transition border-slate-200">
                                <input type="checkbox" value="${o.v}" ${o.on ? 'checked' : ''} class="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500">
                                <span class="font-bold text-slate-700 text-sm">${o.l}</span>
                            </label>`).join('')}
                        </div>
                    </div>
                    <div class="p-5 bg-slate-50 border-t border-slate-100 flex gap-3">
                        <button id="cancel-pdf-btn" class="flex-1 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold py-3 rounded-xl transition-colors text-xs uppercase shadow-sm">Cancelar</button>
                        <button id="confirm-pdf-btn" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl transition-colors shadow-md text-xs uppercase flex items-center justify-center gap-2"><span>Gerar PDF</span></button>
                    </div>
                </div>`;
            document.body.appendChild(modal);

            document.getElementById('cancel-pdf-btn').onclick = () => { modal.remove(); resolve(false); };

            document.getElementById('confirm-pdf-btn').onclick = async () => {
                const btn = document.getElementById('confirm-pdf-btn');
                btn.innerHTML = `<span class="animate-spin">${ico('loader', 'w-4 h-4 animate-spin')}</span> Gerando...`;
                btn.disabled = true;

                const selectedColumns = Array.from(document.querySelectorAll('#pdf-columns-checkboxes input:checked:not([disabled])')).map(cb => cb.value);
                const atendidosList = Array.isArray(arg1) ? arg1 : (Array.isArray(arg2) ? arg2 : []);

                let pautaNome = 'Geral';
                if (typeof arg1 === 'string') pautaNome = arg1;
                else if (typeof arg2 === 'string') pautaNome = arg2;
                else if (window.app && window.app.currentPauta && window.app.currentPauta.name) pautaNome = window.app.currentPauta.name;

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
            const doc = new jsPDF({ orientation: 'l', unit: 'pt', format: 'a4' });
            const logo = await loadImageSafe(LOGOS.horizontal);
            const marca = await loadImageSafe(LOGOS.marcaDagua);

            atendidosList = [...(atendidosList || [])].sort(sortByScheduledTime);

            let somaMin = 0, nMin = 0;
            let totalReagendados = 0;
            let totalCancelados = 0;
            let totalConcluidos = 0;

            atendidosList.forEach(a => {
                const motivo = (a.motivoEncerramento || '').toLowerCase();
                if (motivo.startsWith('reagendado')) totalReagendados++;
                else if (a.status === 'cancelado') totalCancelados++;
                else totalConcluidos++;
            });

            const totalDemandas = atendidosList.reduce((acc, a) => acc + 1 + (a.demandas?.quantidade || 0), 0);

            const colDef = [
                { key: 'name', label: 'Nome completo' },
                { key: 'numAgendamento', label: 'Nº Agend.' },
                { key: 'numeroProcesso', label: 'CNP / VERDE' },
                { key: 'scheduledTime', label: 'Agendado' },
                { key: 'arrivalTime', label: 'Chegou' },
                { key: 'attendedTime', label: 'Chamado/Fim' },
                { key: 'duration', label: 'Duração' },
                { key: 'subject', label: 'Assunto' },
                { key: 'demandas', label: 'Demandas Adicionais' },
                { key: 'resultado', label: 'Resultado / Motivo' },
                { key: 'attendant', label: 'Atendente' }
            ];
            const activeCols = colDef.filter(c => c.key === 'name' || selectedColumns.includes(c.key));
            const head = [["#", ...activeCols.map(c => c.label)]];

            await yieldThread();

            const body = atendidosList.map((item, index) => {
                const arrivalDate = getSafeDate(item.arrivalTime);
                const attendedDate = getSafeDate(item.attendedTime || item.attendedAt);

                let duration = 'N/A';
                if (arrivalDate && attendedDate) {
                    const min = Math.round((attendedDate.getTime() - arrivalDate.getTime()) / 60000);
                    duration = calculateDuration(min);
                    if (min >= 0) { somaMin += min; nMin++; }
                }

                const hora = (d) => d ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '---';
                const demandasStr = item.demandas?.descricoes?.length ? item.demandas.descricoes.join(', ') : '---';
                const processoStr = item.numeroProcesso || item.idCasoVerde || item.processo || '---';

                const motivoStr = item.motivoEncerramento || '';
                let resultadoTexto = 'ATENDIDO';
                if (motivoStr.toLowerCase().startsWith('reagendado')) {
                    resultadoTexto = `REAGENDADO: ${motivoStr.replace(/^reagendado:\s*/i, '')}`;
                } else if (item.status === 'cancelado') {
                    resultadoTexto = motivoStr ? `CANCELADO: ${motivoStr.replace(/^cancelado:\s*/i, '')}` : 'CANCELADO';
                } else if (item.status === 'aguardandoNumero') {
                    resultadoTexto = 'AGUARDANDO CNP';
                }

                const rowData = {
                    name: cleanString(item.name).toUpperCase(),
                    numAgendamento: item.numAgendamento || item.numeroAgendamento || '---',
                    numeroProcesso: cleanString(processoStr).toUpperCase(),
                    scheduledTime: item.scheduledTime || (item.type === 'avulso' ? 'Avulso' : '---'),
                    arrivalTime: hora(arrivalDate),
                    attendedTime: hora(attendedDate),
                    duration,
                    subject: cleanString(item.subject).toUpperCase(),
                    demandas: cleanString(demandasStr).toUpperCase(),
                    resultado: cleanString(resultadoTexto).toUpperCase(),
                    attendant: cleanString(getAttendantNameForPDF(item)).toUpperCase()
                };
                return [index + 1, ...activeCols.map(c => rowData[c.key])];
            });

            if (body.length === 0) {
                body.push([{ content: "Nenhum atendimento finalizado nesta pauta até o momento.", colSpan: activeCols.length + 1, styles: { halign: 'center', fontStyle: 'italic', textColor: C.cinza } }]);
            }

            let y = drawHeader(doc, logo, { title: 'Relatório de Atendidos e Status', lines: [`Pauta: ${pautaNome}`], logoOpts: LOGO_DIM.horizontal });
            y = drawKpis(doc, y, [
                { label: 'Concluídos', valor: totalConcluidos },
                { label: 'Reagendados', valor: totalReagendados, cor: [245, 158, 11] },
                { label: 'Cancelados', valor: totalCancelados, cor: C.vermelho },
                { label: 'Volume total', valor: totalDemandas, cor: [59, 130, 246] }
            ]);

            await yieldThread();

            const fixas = { numAgendamento: 55, scheduledTime: 55, arrivalTime: 50, attendedTime: 60, duration: 55, numeroProcesso: 80 };
            const columnStyles = { 0: { cellWidth: 24, halign: 'center', textColor: C.cinza } };
            activeCols.forEach((c, i) => {
                const idx = i + 1;
                if (c.key === 'name') columnStyles[idx] = { halign: 'left', fontStyle: 'bold' };
                else if (['subject', 'demandas', 'resultado', 'attendant'].includes(c.key)) columnStyles[idx] = { halign: 'left' };
                else columnStyles[idx] = { halign: 'center', cellWidth: fixas[c.key] || 'auto' };
            });

            doc.autoTable(tableBase({ head, body, startY: y, columnStyles }));

            applyFooters(doc, { marcaDagua: marca });

            doc.save(`Relatorio_Atendidos_${(pautaNome || 'Pauta').replace(/\s+/g, '_')}.pdf`);
            if (window.showNotification) window.showNotification("Relatório gerado com sucesso!", "success");
            return true;
        } catch (error) {
            console.error("Erro PDF Atendidos Personalizado:", error);
            if (window.showNotification) window.showNotification("Falha na geração do PDF.", "error");
            return false;
        }
    },

    async generateFaltososPDF(arg1, arg2) {
        if (window.showNotification) window.showNotification("Gerando lista de faltosos, aguarde...", "info");
        try {
            await ensureJsPDF();
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
            const logo = await loadImageSafe(LOGOS.horizontal);
            const marca = await loadImageSafe(LOGOS.marcaDagua);

            let faltososList = Array.isArray(arg1) ? arg1 : (Array.isArray(arg2) ? arg2 : []);

            let pautaNome = 'Geral';
            if (typeof arg1 === 'string') pautaNome = arg1;
            else if (typeof arg2 === 'string') pautaNome = arg2;
            else if (window.app && window.app.currentPauta && window.app.currentPauta.name) pautaNome = window.app.currentPauta.name;

            faltososList = [...(faltososList || [])].sort(sortByScheduledTime);

            let y = drawHeader(doc, logo, { title: 'Relatório de Faltosos', lines: [`Pauta: ${pautaNome}`], logoOpts: LOGO_DIM.horizontal });
            y = drawKpis(doc, y, [{ label: 'Total de ausências', valor: faltososList.length, cor: C.vermelho }]);

            await yieldThread();

            const body = faltososList.map((item, index) => {
                const logTime = getSafeDate(item.lastActionTimestamp);
                return [
                    index + 1,
                    cleanString(item.name).toUpperCase(),
                    item.scheduledTime || (item.type === 'avulso' ? 'Avulso' : '---'),
                    cleanString(item.subject).toUpperCase(),
                    logTime ? logTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '---'
                ];
            });
            if (body.length === 0) {
                body.push([{ content: "Nenhum assistido marcado como faltoso.", colSpan: 5, styles: { halign: 'center', fontStyle: 'italic', textColor: C.cinza } }]);
            }

            doc.autoTable(tableBase({
                head: [["#", "Nome do assistido", "Agendado", "Assunto", "Falta às"]],
                body,
                startY: y,
                headStyles: { fillColor: C.vermelho, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', fontSize: 8.5, lineColor: C.vermelho },
                alternateRowStyles: { fillColor: [254, 250, 250] },
                columnStyles: {
                    0: { cellWidth: 26, halign: 'center', textColor: C.cinza },
                    1: { halign: 'left', fontStyle: 'bold' },
                    2: { cellWidth: 60, halign: 'center' },
                    3: { halign: 'left' },
                    4: { cellWidth: 55, halign: 'center' }
                }
            }));

            applyFooters(doc, { marcaDagua: marca });
            doc.save(`faltosos_${(pautaNome || 'Pauta').replace(/\s+/g, '_')}.pdf`);
            return true;
        } catch (error) {
            console.error("Erro PDF Faltosos:", error);
            if (window.showNotification) window.showNotification("Erro ao gerar PDF de faltosos.", "error");
            return false;
        }
    },

    async generateCollaboratorsPDF(arg1, arg2, arg3) {
        return new Promise((resolve) => {
            let colaboradores = [];
            let pautaNome = 'Geral';

            if (arg1 && !Array.isArray(arg1) && arg1.colaboradores) {
                colaboradores = arg1.colaboradores || [];
                pautaNome = arg1.pautaNome || 'Geral';
            } else if (Array.isArray(arg1)) {
                colaboradores = arg1;
                if (typeof arg2 === 'string') pautaNome = arg2;
            }

            if (pautaNome === 'Geral' && window.app && window.app.currentPauta && window.app.currentPauta.name) {
                pautaNome = window.app.currentPauta.name;
            }

            if (!colaboradores || colaboradores.length === 0) {
                if (window.showNotification) window.showNotification("Nenhum colaborador encontrado.", "warning");
                resolve(false);
                return;
            }

            const modalId = 'pdf-colab-selector-modal';
            document.getElementById(modalId)?.remove();

            const opcoes = [
                { v: 'cargo', l: 'Cargo', on: true },
                { v: 'equipe', l: 'Equipe', on: true },
                { v: 'identificador', l: 'Matrícula/ID', on: false },
                { v: 'telefone', l: 'Telefone', on: false },
                { v: 'email', l: 'E-mail', on: false },
                { v: 'horario', l: 'Chegada', on: false },
                { v: 'transporte', l: 'Deslocamento', on: true }
            ];

            const modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm transition-opacity';
            modal.innerHTML = `
                <div class="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
                    <div class="p-5 border-b border-slate-100 bg-slate-50">
                        <h3 class="text-lg font-black text-slate-800 flex items-center gap-2">${ico('fileText', 'w-5 h-5')} Configurar relatório de Equipe</h3>
                    </div>
                    <div class="p-5 overflow-y-auto">
                        <p class="text-xs text-slate-500 mb-4 font-medium">Selecione quais colunas deseja exibir no PDF:</p>
                        <div class="space-y-2 mb-2" id="pdf-colab-checkboxes">
                            <label class="flex items-center gap-3 p-3 border rounded-xl bg-slate-50 opacity-70 cursor-not-allowed border-slate-200">
                                <input type="checkbox" checked disabled class="w-5 h-5 text-emerald-600 rounded">
                                <span class="font-bold text-slate-700 text-sm">Nome do Colaborador (obrigatório)</span>
                            </label>
                            ${opcoes.map(o => `
                            <label class="flex items-center gap-3 p-3 border rounded-xl cursor-pointer hover:bg-emerald-50 hover:border-emerald-300 transition border-slate-200">
                                <input type="checkbox" value="${o.v}" ${o.on ? 'checked' : ''} class="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500">
                                <span class="font-bold text-slate-700 text-sm">${o.l}</span>
                            </label>`).join('')}
                        </div>
                    </div>
                    <div class="p-5 bg-slate-50 border-t border-slate-100 flex gap-3">
                        <button id="cancel-colab-pdf-btn" class="flex-1 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold py-3 rounded-xl transition-colors text-xs uppercase shadow-sm">Cancelar</button>
                        <button id="confirm-colab-pdf-btn" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl transition-colors shadow-md text-xs uppercase flex items-center justify-center gap-2"><span>Gerar PDF</span></button>
                    </div>
                </div>`;
            document.body.appendChild(modal);

            document.getElementById('cancel-colab-pdf-btn').onclick = () => { modal.remove(); resolve(false); };
            document.getElementById('confirm-colab-pdf-btn').onclick = async () => {
                const btn = document.getElementById('confirm-colab-pdf-btn');
                btn.innerHTML = 'Gerando...';
                btn.disabled = true;

                const selectedColumns = ['nome', ...Array.from(document.querySelectorAll('#pdf-colab-checkboxes input:checked:not([disabled])')).map(cb => cb.value)];

                const success = await PDFService._buildCollaboratorsPDF(colaboradores, pautaNome, selectedColumns);
                modal.remove();
                resolve(success);
            };
        });
    },

    async _buildCollaboratorsPDF(colaboradores, pautaNome, colunas) {
        try {
            await ensureJsPDF();
            const { jsPDF } = window.jspdf;

            const doc = new jsPDF({ orientation: colunas.length > 5 ? 'l' : 'p', unit: 'pt', format: 'a4' });
            const logo = await loadImageSafe(LOGOS.vertical);
            const marca = await loadImageSafe(LOGOS.marcaDagua);

            const colMap = {
                nome: { label: 'Membro da equipe', get: (c) => c.nome || '' },
                cargo: { label: 'Cargo', get: (c) => c.cargo || 'N/A' },
                equipe: { label: 'Equipe', get: (c) => c.equipe ? (/^\d+$/.test(c.equipe) ? `Equipe ${c.equipe}` : c.equipe) : 'N/A' },
                identificador: { label: 'Matrícula/ID', get: (c) => c.identificador || 'N/A' },
                telefone: { label: 'Telefone', get: (c) => c.telefone || 'N/A' },
                email: { label: 'E-mail', get: (c) => c.email || 'N/A' },
                horario: { label: 'Chegada', get: (c) => c.horario || '--:--' },
                transporte: {
                    label: 'Deslocamento', get: (c) => {
                        let desc = c.transporte || 'Não informado';
                        if (c.transporte === 'Com a Empresa' && c.localEncontro) desc += ` (${c.localEncontro})`;
                        return desc;
                    }
                }
            };

            const ordenados = [...colaboradores].sort((a, b) => {
                const g = compararGrupos(a.equipe, b.equipe);
                if (g !== 0) return g;
                const w = pesoCargo(a.cargo) - pesoCargo(b.cargo);
                return w !== 0 ? w : (a.nome || '').localeCompare(b.nome || '', 'pt-BR');
            });

            const porEquipe = {};
            ordenados.forEach(c => { const k = c.equipe || ''; porEquipe[k] = (porEquipe[k] || 0) + 1; });

            await yieldThread();

            const tableData = [];
            let atual = null;
            ordenados.forEach(c => {
                const k = c.equipe || '';
                if (k !== atual) {
                    atual = k;
                    const nome = k ? (/^\d+$/.test(k) ? `Equipe ${k}` : k) : 'Sem equipe';
                    tableData.push([{
                        content: `${nome.toUpperCase()}  ·  ${porEquipe[k]} membro${porEquipe[k] === 1 ? '' : 's'}`,
                        colSpan: colunas.length,
                        styles: { fillColor: [220, 252, 231], textColor: C.verdeEscuro, fontStyle: 'bold', halign: 'left', fontSize: 9 }
                    }]);
                }
                tableData.push(colunas.map(key => colMap[key] ? colMap[key].get(c) : 'N/A'));
            });

            const defensores = colaboradores.filter(c => pesoCargo(c.cargo) === 1).length;
            const servidores = colaboradores.filter(c => pesoCargo(c.cargo) === 2).length;

            let y = drawHeader(doc, logo, { title: 'Lista das Equipes', lines: [`Pauta: ${pautaNome}`], logoOpts: LOGO_DIM.vertical });

            y = drawKpis(doc, y, [
                { label: 'Total de membros', valor: colaboradores.length },
                { label: 'Defensores(as)', valor: defensores, cor: [139, 92, 246] },
                { label: 'Servidores(as)', valor: servidores, cor: [245, 158, 11] }
            ]);

            const idxNome = colunas.indexOf('nome');
            const columnStyles = {};
            if (idxNome >= 0) columnStyles[idxNome] = { halign: 'left', fontStyle: 'bold' };

            doc.autoTable(tableBase({
                head: [colunas.map(key => colMap[key] ? colMap[key].label : key)],
                body: tableData,
                startY: y,
                columnStyles,
                styles: { ...tableBase().styles, halign: 'center' }
            }));

            applyFooters(doc, { marcaDagua: marca });
            doc.save(`equipe_${(pautaNome || 'Pauta').replace(/\s+/g, '_')}.pdf`);
            if (window.showNotification) window.showNotification("PDF da equipe gerado com sucesso!", "success");
            return true;
        } catch (e) {
            console.error("Erro PDF Equipe:", e);
            if (window.showNotification) window.showNotification("Erro ao gerar PDF de equipe.", "error");
            return false;
        }
    },

    async generateChecklistPDF(assistedName, actionTitle, checklistData, documentosTextos, despesasTextos) {
        if (window.showNotification) window.showNotification("Gerando checklist, aguarde...", "info");
        try {
            await ensureJsPDF();
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
            const logo = await loadImageSafe(LOGOS.checklist);
            const marca = await loadImageSafe(LOGOS.marcaDagua);

            const W = doc.internal.pageSize.getWidth();
            const H = doc.internal.pageSize.getHeight();
            const m = 40;
            const contentW = W - m * 2;

            let y = drawHeader(doc, logo, {
                title: 'Checklist de Atendimento',
                lines: [`Assistido: ${String(assistedName).toUpperCase()}`, `Ação: ${actionTitle}`],
                logoOpts: LOGO_DIM.checklist
            });

            const ensure = (h) => {
                if (y + h > H - 48) {
                    doc.addPage();
                    const { w, h: lh } = logoSize(logo, LOGO_DIM.checklist);
                    if (logo) { try { doc.addImage(logo, 'PNG', m, 20, w * 0.7, lh * 0.7); } catch (e) { } }
                    y = 60;
                }
            };

            const section = (titulo) => {
                ensure(40);
                doc.setFillColor(...C.verdeClaro);
                doc.rect(m, y, contentW, 20, 'F');
                doc.setFillColor(...C.verde);
                doc.rect(m, y, 3, 20, 'F');
                doc.setFont("helvetica", "bold");
                doc.setFontSize(10);
                doc.setTextColor(...C.verdeEscuro);
                doc.text(titulo, m + 12, y + 13.5);
                y += 30;
            };

            const checkItem = (texto, tag) => {
                doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
                const tagW = tag ? doc.getTextWidth(tag) + 12 : 0;
                doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
                doc.setTextColor(...C.texto);
                const linhas = doc.splitTextToSize(texto, contentW - 28 - (tagW ? tagW + 8 : 0));
                const lh = doc.getLineHeight();
                const altura = Math.max(linhas.length * 12.5, 14);
                ensure(altura + 6);

                doc.setDrawColor(...C.verde);
                doc.setLineWidth(0.9);
                doc.rect(m + 8, y - 8, 10, 10);
                doc.setLineWidth(1.4);
                doc.line(m + 10, y - 3, m + 12.5, y - 0.5);
                doc.line(m + 12.5, y - 0.5, m + 17, y - 7);
                doc.setLineWidth(0.2);

                doc.text(linhas, m + 26, y);

                if (tag) {
                    const ultima = linhas[linhas.length - 1];
                    const bx = m + 26 + doc.getTextWidth(ultima) + 8;
                    const by = y + (linhas.length - 1) * lh;
                    doc.setFillColor(...C.cinzaClaro);
                    doc.roundedRect(bx, by - 10, tagW, 14, 3, 3, 'F');
                    doc.setFont("helvetica", "bold");
                    doc.setFontSize(7.5);
                    doc.setTextColor(...C.cinza);
                    doc.text(tag, bx + tagW / 2, by - 0.5, { align: 'center' });
                }
                y += altura + 6;
            };

            const bullet = (texto) => {
                doc.setFont("helvetica", "normal");
                doc.setFontSize(9.5);
                doc.setTextColor(...C.texto);
                const linhas = doc.splitTextToSize(texto, contentW - 30);
                ensure(linhas.length * 12.5 + 4);
                doc.setFillColor(...C.verde);
                doc.circle(m + 13, y - 3, 1.8, 'F');
                doc.text(linhas, m + 24, y);
                y += linhas.length * 12.5 + 4;
            };

            const tabelaKV = (rows, opts = {}) => {
                doc.autoTable(tableBase({
                    startY: y,
                    body: rows,
                    theme: 'plain',
                    margin: { top: 60, left: m, right: m, bottom: 42 },
                    styles: { fontSize: 9, cellPadding: { top: 4, bottom: 4, left: 8, right: 8 }, textColor: C.texto, lineColor: C.linha, lineWidth: 0, overflow: 'linebreak' },
                    alternateRowStyles: { fillColor: C.zebra },
                    columnStyles: { 0: { cellWidth: opts.w0 || 150, fontStyle: 'bold', textColor: C.cinza }, 1: { halign: opts.align1 || 'left' } },
                    ...(opts.extra || {})
                }));
                y = doc.lastAutoTable.finalY + 18;
            };

            section('DOCUMENTAÇÃO ENTREGUE');
            const docsVisiveis = (documentosTextos || []).filter(item =>
                !(item.id.startsWith('reu-') || item.id.startsWith('gastos-') || item.id.startsWith('gasto-')));
            if (docsVisiveis.length === 0) {
                doc.setFont("helvetica", "italic"); doc.setFontSize(9.5); doc.setTextColor(...C.cinza);
                doc.text('Nenhum documento registrado.', m + 8, y);
                y += 20;
            }
            docsVisiveis.forEach(item => {
                const tipo = checklistData.docTypes?.[item.id] || 'Físico';
                checkItem(item.text, tipo.toUpperCase());
            });
            y += 12;

            if (checklistData.demandasAdicionais?.length > 0) {
                section('DEMANDAS ADICIONAIS');
                checklistData.demandasAdicionais.forEach(d => bullet(d));
                y += 12;
            }

            await yieldThread();

            if (checklistData.expenseData?.checkExibirGastos) {
                const g = checklistData.expenseData;
                section('PLANILHA DE GASTOS');

                const limpaMoeda = (valStr) => {
                    if (!valStr || valStr === 'R$ 0,00') return 0;
                    return parseFloat(String(valStr).replace(/[^\d,]/g, '').replace(',', '.')) || 0;
                };

                const formatMoeda = (num) => num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                const moradores = Math.max(1, parseInt(g.quantidadeMoradores || 1));

                const comuns = [
                    { id: 'aluguel', label: 'Aluguel Residencial' },
                    { id: 'condominio', label: 'Condomínio' },
                    { id: 'iptu', label: 'IPTU' },
                    { id: 'luz', label: 'Energia Elétrica' },
                    { id: 'agua', label: 'Água/Saneamento' },
                    { id: 'gas', label: 'Gás de Cozinha' },
                    { id: 'internet', label: 'Internet' },
                    { id: 'supermercado', label: 'Supermercado' }
                ];

                const exclusivas = [
                    { id: 'escola', label: 'Mensalidade Escolar' },
                    { id: 'material_escolar', label: 'Material Escolar/Livros' },
                    { id: 'merenda', label: 'Merenda/Lanches' },
                    { id: 'plano_saude', label: 'Plano de Saúde' },
                    { id: 'lazer_crianca', label: 'Lazer/Atividades' }
                ];

                let totalRateado = 0;
                let totalIntegral = 0;
                const rows = [];

                rows.push([{ content: `DESPESAS COMUNS (Rateio 1/${moradores})`, colSpan: 2, styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } }]);
                let achouComum = false;
                comuns.forEach(c => {
                    const val = limpaMoeda(g[c.id]);
                    if (val > 0) {
                        const cota = val / moradores;
                        totalRateado += cota;
                        rows.push([`${c.label} (Total: ${formatMoeda(val)})`, formatMoeda(cota)]);
                        achouComum = true;
                    }
                });
                if (!achouComum) rows.push([{ content: 'Nenhuma informada', colSpan: 2, styles: { fontStyle: 'italic', textColor: C.cinza } }]);

                rows.push([{ content: 'DESPESAS EXCLUSIVAS (Integrais)', colSpan: 2, styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } }]);
                let achouExclusiva = false;
                exclusivas.forEach(c => {
                    const val = limpaMoeda(g[c.id]);
                    if (val > 0) {
                        totalIntegral += val;
                        rows.push([c.label, formatMoeda(val)]);
                        achouExclusiva = true;
                    }
                });
                if (!achouExclusiva) rows.push([{ content: 'Nenhuma informada', colSpan: 2, styles: { fontStyle: 'italic', textColor: C.cinza } }]);

                const totalGeral = totalRateado + totalIntegral;

                if (totalGeral === 0) {
                    rows.push([{ content: 'NENHUM GASTO TOTAL INFORMADO', colSpan: 2, styles: { halign: 'center', fontStyle: 'bold', textColor: C.vermelho } }]);
                } else {
                    rows.push([
                        { content: 'NECESSIDADE MENSAL APURADA', styles: { fontStyle: 'bold', textColor: C.verdeEscuro, fillColor: C.verdeClaro } },
                        { content: formatMoeda(totalGeral), styles: { fontStyle: 'bold', textColor: C.verdeEscuro, fillColor: C.verdeClaro } }
                    ]);
                }

                tabelaKV(rows, { w0: 260, align1: 'right' });
            }

            if (checklistData.reuData?.checkReuUnico) {
                const r = checklistData.reuData;
                const ligar = (...partes) => partes.filter(Boolean).join(' | ');
                const campo = (valor, naoSei) => {
                    if (naoSei) return 'Não informado (não soube informar)';
                    return valor && String(valor).trim() !== '' ? valor : '';
                };

                const dados = [];
                const add = (rotulo, valor) => { if (valor) dados.push([rotulo, valor]); };

                add('Nome', r.nome ? r.nome.toUpperCase() : '');
                add('Contato', ligar(r.cpf && `CPF: ${r.cpf}`, r.telefone && `WhatsApp: ${r.telefone}`));
                if (r.rua) {
                    add('Endereço', [r.rua, r.numero, r.complemento, r.bairro].filter(Boolean).join(', '));
                    add('Cidade / CEP', ligar((r.cidade || r.uf) && `${r.cidade || ''}${r.uf ? '/' + r.uf : ''}`, r.cep && `CEP: ${r.cep}`));
                }
                if (r.empresa) {
                    add('Empresa (trabalho)', r.empresa.toUpperCase());
                    add('End. comercial', [r.rua_comercial, r.numero_comercial, r.complemento_comercial, r.bairro_comercial].filter(Boolean).join(', '));
                    add('Cidade / CEP', ligar((r.cidade_comercial || r.uf_comercial) && `${r.cidade_comercial || ''}${r.uf_comercial ? '/' + r.uf_comercial : ''}`, r.cep_comercial && `CEP: ${r.cep_comercial}`));
                }

                if (dados.length > 0) {
                    section('DADOS DA PARTE CONTRÁRIA (RÉU)');
                    tabelaKV(dados);
                }

                const ganhos = r.ganhosNaoSei ? '' : (r.ganhos && r.ganhos !== 'R$ 0,00' ? r.ganhos : '');
                const socio = [];
                const addSocio = (rotulo, valor, naoSei) => {
                    const v = campo(valor, naoSei);
                    if (v) socio.push([rotulo, v]);
                };
                addSocio('Ocupação', r.ocupacao, r.ocupacaoNaoSei);
                addSocio('Profissão', r.profissao, r.profissaoNaoSei);
                addSocio('Estado civil', r.estadoCivil, r.estadoCivilNaoSei);
                addSocio('Ganhos líquidos', ganhos, r.ganhosNaoSei);
                if (r.fonteRenda && r.fonteRenda.trim() !== '') socio.push(['Fonte de renda', r.fonteRenda]);

                if (socio.length > 0) {
                    section('PERFIL SOCIOECONÔMICO DO RÉU');
                    tabelaKV(socio);
                }
            }

            applyFooters(doc, { marcaDagua: marca });
            doc.save(`Checklist_SIGEP_${String(assistedName).replace(/\s+/g, '_')}.pdf`);
            if (window.showNotification) window.showNotification("Checklist exportado!", "success");
            return true;
        } catch (err) {
            console.error("Erro crítico na montagem do PDF do checklist:", err);
            if (window.showNotification) window.showNotification("Falha ao exportar checklist.", "error");
            return false;
        }
    }
};

export const generateAtendidosPDF = (arg1, arg2) => PDFService.generateAtendidosPDF(arg1, arg2);
export const generateChecklistPDF = (assistedName, actionTitle, checklistData, documentosTextos, despesasTextos) => PDFService.generateChecklistPDF(assistedName, actionTitle, checklistData, documentosTextos, despesasTextos);
export const generateCollaboratorsPDF = (arg1, arg2, arg3) => PDFService.generateCollaboratorsPDF(arg1, arg2, arg3);
export const generateFaltososPDF = (arg1, arg2) => PDFService.generateFaltososPDF(arg1, arg2);

export default PDFService;
window.PDFService = PDFService;
