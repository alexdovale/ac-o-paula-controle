// js/pdfService.js - VERSÃO COMPLETA COM LOGO GARANTIDA

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

// ⭐ LOGO DO SIGEP
const LOGO_SIGEP_URL = "https://firebasestorage.googleapis.com/v0/b/pauta-ce162.firebasestorage.app/o/logo_sigep.png?alt=media&token=b067528b-df81-4fbf-bc22-0d2b01acbbe6";

// ⭐ LOGO DA DEFENSORIA - URL CORRIGIDA
const LOGO_DEFENSORIA_URL = "https://firebasestorage.googleapis.com/v0/b/pauta-ce162.firebasestorage.app/o/logo_defensoria%20(1)%20(1).png?alt=media&token=7a4eeaf6-9a96-40b2-8b38-27651627bba7";

// ⭐ FUNÇÃO GARANTIDA: Carrega imagem com fetch + base64
const loadImageBase64 = async (url) => {
    try {
        console.log(`🖼️ Tentando carregar logo: ${url}`);
        
        // Tenta via fetch primeiro (mais confiável)
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const blob = await response.blob();
        
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64data = reader.result;
                console.log("✅ Logo carregada com sucesso via fetch!");
                resolve(base64data);
            };
            reader.onerror = (err) => {
                console.warn("❌ Erro no FileReader, tentando método alternativo...", err);
                // Fallback: método alternativo
                loadImageViaCanvas(url).then(resolve).catch(reject);
            };
            reader.readAsDataURL(blob);
        });
    } catch (fetchError) {
        console.warn("⚠️ Fetch falhou, tentando método alternativo (canvas)...", fetchError);
        return loadImageViaCanvas(url);
    }
};

// ⭐ MÉTODO ALTERNATIVO: Via Canvas (com crossOrigin)
const loadImageViaCanvas = (url) => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.referrerPolicy = 'no-referrer';
        
        let timeoutId = setTimeout(() => {
            reject(new Error('Timeout ao carregar imagem via canvas'));
        }, 15000);
        
        img.onload = () => {
            clearTimeout(timeoutId);
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                const base64 = canvas.toDataURL('image/png');
                console.log("✅ Logo carregada via canvas!");
                resolve(base64);
            } catch (e) {
                reject(e);
            }
        };
        
        img.onerror = () => {
            clearTimeout(timeoutId);
            reject(new Error('Erro ao carregar imagem via canvas'));
        };
        
        // Tenta com diferentes variações da URL
        let src = url;
        if (!src.includes('?')) {
            src += '?t=' + Date.now();
        } else {
            src += '&t=' + Date.now();
        }
        img.src = src;
    });
};

// ⭐ FUNÇÃO: Adiciona cabeçalho com logo do SIGEP
const addLogoHeader = async (doc, startY = 20) => {
    try {
        const logoBase64 = await loadImageBase64(LOGO_SIGEP_URL);
        if (logoBase64) {
            const pageWidth = doc.internal.pageSize.getWidth();
            doc.addImage(logoBase64, 'PNG', pageWidth - 35, startY, 25, 25);
            return true;
        }
    } catch(e) {
        console.warn("Erro ao inserir logo SIGEP no PDF", e);
    }
    return false;
};

// ⭐ FUNÇÃO: Adiciona rodapé padrão
const addFooter = (doc, pageNumber, totalPages) => {
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`SIGEP - Sistema de Gerenciamento de Pauta | ${new Date().toLocaleString('pt-BR')} | Página ${pageNumber}`, 
             doc.internal.pageSize.getWidth() / 2, pageHeight - 10, { align: 'center' });
};

// ⭐ FUNÇÃO GARANTIDA: buildAtaAcaoSocialPDF - COM LOGO OBRIGATÓRIA
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

    // ⭐⭐⭐ LOGO DA DEFENSORIA - OBRIGATÓRIA ⭐⭐⭐
    console.log("🖼️ Carregando logo da Defensoria...");
    let logoDefensoria = null;
    
    try {
        logoDefensoria = await loadImageBase64(LOGO_DEFENSORIA_URL);
    } catch (e) {
        console.error("❌ Erro ao carregar logo da Defensoria:", e);
    }
    
    // ⭐ SE A LOGO NÃO CARREGAR, USA UMA LOGO BASE64 EMBUTIDA (FALLBACK) ⭐
    if (!logoDefensoria) {
        console.warn("⚠️ Logo não carregou, usando logo base64 embutida de emergência...");
        // Esta é uma logo genérica da Defensoria Pública em base64 (minimalista)
        // Você pode substituir por uma logo real em base64 se preferir
        logoDefensoria = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='50'%3E%3Crect width='200' height='50' fill='%231a56db'/%3E%3Ctext x='10' y='35' font-family='Arial' font-size='20' fill='white' font-weight='bold'%3EDEFENSORIA PÚBLICA%3C/text%3E%3C/svg%3E";
    }
    
    // Insere a logo no centro superior
    if (logoDefensoria) {
        try { 
            const pageWidth = doc.internal.pageSize.getWidth();
            const logoWidth = 90;
            const logoHeight = 25;
            const xPos = (pageWidth - logoWidth) / 2;
            doc.addImage(logoDefensoria, 'PNG', xPos, 8, logoWidth, logoHeight);
            console.log("✅ Logo da Defensoria inserida com sucesso no PDF!");
        } catch(e) { 
            console.error("❌ Erro ao inserir logo no PDF:", e); 
        }
    } else {
        console.error("❌ Logo não disponível para inserção!");
    }

    // Título
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("ATA AÇÃO SOCIAL", 105, 45, { align: "center" });

    // Texto introdutório
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    
    const introText = `Aos ${dia} dias do mês de ${mesExtenso} do ano de ${ano}, a partir das 9h, em ${endereco}, trabalharam na ${nomeDaAcao}, os(as) Defensores(as) Públicos(as) abaixo listados(as), bem como os(as) servidores(as), conforme listagem a seguir:`;
    
    const splitIntro = doc.splitTextToSize(introText, 170);
    doc.text(splitIntro, 20, 55);
    
    let currentY = 55 + (splitIntro.length * 4.5);

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

// ⭐ NOVA FUNÇÃO AUXILIAR - GERAÇÃO DINÂMICA DE TABELA DE COLABORADORES
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

            const logoSigep = await loadImageBase64(LOGO_SIGEP_URL);
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
