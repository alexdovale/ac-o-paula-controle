// js/pdfService.js

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

const getIdentificador = (colaborador) => {
    if (colaborador.identificador) return colaborador.identificador;
    if (colaborador.id) return colaborador.id;
    if (colaborador.matricula) return colaborador.matricula;
    if (colaborador.codigo) return colaborador.codigo;
    return 'N/A';
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

    // ⭐ IMPLEMENTAÇÃO: RELATÓRIO DE ASSISTIDOS ATENDIDOS ⭐
    async generateAtendidosPDF(atendidosList, pautaNome = "Geral") {
        try {
            await ensureJsPDF();
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'l', unit: 'pt', format: 'a4' }); // Paisagem para caber mais colunas

            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            doc.text("RELATÓRIO DE ASSISTIDOS PROTOCOLADOS / ATENDIDOS", doc.internal.pageSize.getWidth() / 2, 40, { align: "center" });
            
            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            doc.text(`Pauta / Mutirão: ${pautaNome}  |  Total de Atendidos: ${atendidosList.length}`, 40, 65);

            const body = atendidosList.map((a, index) => {
                const dataAtendimento = getSafeDate(a.attendedAt || a.lastActionTimestamp);
                const horaStr = dataAtendimento ? dataAtendimento.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : 'N/A';
                return [
                    index + 1,
                    a.name || 'Não Informado',
                    a.cpf || 'N/A',
                    a.subject || 'Não Informado',
                    getAttendantNameForPDF(a),
                    a.numeroProcesso || 'S/ Número',
                    horaStr
                ];
            });

            if (body.length === 0) body.push([{ content: "Nenhum atendimento finalizado nesta pauta.", colSpan: 7, styles: { halign: 'center', fontStyle: 'italic' } }]);

            doc.autoTable({
                startY: 80,
                head: [['Nº', 'NOME DO ASSISTIDO', 'CPF', 'ASSUNTO / DEMANDA', 'ATENDENTE RESPONSÁVEL', 'Nº PROTOCOLO / PROCESSO', 'HORA']],
                body: body,
                theme: 'striped',
                headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9, halign: 'center' },
                styles: { fontSize: 9, cellPadding: 5, valign: 'middle' },
                columnStyles: { 0: { halign: 'center' }, 2: { halign: 'center' }, 5: { fontStyle: 'bold', halign: 'center' }, 6: { halign: 'center' } }
            });

            doc.save(`Relatorio_Atendidos_${pautaNome.replace(/\s+/g, '_')}.pdf`);
            return true;
        } catch (error) {
            console.error("Erro ao gerar PDF de Atendidos:", error);
            return false;
        }
    },

    // ⭐ IMPLEMENTAÇÃO: RELATÓRIO DE ASSISTIDOS FALTOSOS ⭐
    async generateFaltososPDF(faltososList, pautaNome = "Geral") {
        try {
            await ensureJsPDF();
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });

            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            doc.text("RELATÓRIO DE AUSÊNCIAS / FALTOSOS", doc.internal.pageSize.getWidth() / 2, 45, { align: "center" });

            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            doc.text(`Pauta / Mutirão: ${pautaNome}  |  Total de Faltosos: ${faltososList.length}`, 40, 70);

            const body = faltososList.map((f, index) => [
                index + 1,
                f.name || 'Não Informado',
                f.cpf || 'N/A',
                f.subject || 'Não Informado',
                f.scheduledTime || 'N/A'
            ]);

            if (body.length === 0) body.push([{ content: "Nenhum assistido marcado como faltoso.", colSpan: 5, styles: { halign: 'center', fontStyle: 'italic' } }]);

            doc.autoTable({
                startY: 85,
                head: [['Nº', 'NOME DO ASSISTIDO', 'CPF', 'ASSUNTO PREVISTO', 'HORÁRIO AGENDADO']],
                body: body,
                theme: 'striped',
                headStyles: { fillColor: [153, 27, 27], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9, halign: 'center' }, // Vermelho escuro p/ faltosos
                styles: { fontSize: 9, cellPadding: 6, valign: 'middle' },
                columnStyles: { 0: { halign: 'center' }, 2: { halign: 'center' }, 4: { halign: 'center', fontStyle: 'bold' } }
            });

            doc.save(`Relatorio_Faltosos_${pautaNome.replace(/\s+/g, '_')}.pdf`);
            return true;
        } catch (error) {
            console.error("Erro ao gerar PDF de Faltosos:", error);
            return false;
        }
    },

    // ⭐ IMPLEMENTAÇÃO: RELATÓRIO DE PRODUTIVIDADE E COLABORADORES ⭐
    async generateCollaboratorsPDF(colaboradoresList, todosAtendimentos, pautaNome = "Geral") {
        try {
            await ensureJsPDF();
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });

            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            doc.text("RELATÓRIO DE PRODUTIVIDADE DA EQUIPE", doc.internal.pageSize.getWidth() / 2, 45, { align: "center" });

            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            doc.text(`Pauta: ${pautaNome}  |  Total de Colaboradores Cadastrados: ${colaboradoresList.length}`, 40, 70);

            const body = colaboradoresList.map((c, index) => {
                // Filtra quantos atendimentos passaram ou foram concluídos por este colaborador específico
                const concluidos = todosAtendimentos.filter(a => a.status === 'atendido' && getAttendantNameForPDF(a) === c.nome).length;
                const emMesa = todosAtendimentos.filter(a => a.status === 'emAtendimento' && a.assignedCollaborator?.name === c.nome).length;

                return [
                    index + 1,
                    c.nome || 'Não Informado',
                    getIdentificador(c),
                    c.cargo || 'Não Informado',
                    c.equipe || 'N/A',
                    emMesa,
                    concluidos
                ];
            });

            if (body.length === 0) body.push([{ content: "Nenhum colaborador registrado nesta equipe.", colSpan: 7, styles: { halign: 'center', fontStyle: 'italic' } }]);

            doc.autoTable({
                startY: 85,
                head: [['Nº', 'NOME COMPLETO', 'IDENTIFICADOR / MATRÍCULA', 'CARGO', 'EQUIPE', 'EM MESA', 'CONCLUÍDOS']],
                body: body,
                theme: 'striped',
                headStyles: { fillColor: [4, 120, 87], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9, halign: 'center' }, // Emerald p/ produtividade
                styles: { fontSize: 9, cellPadding: 6, valign: 'middle' },
                columnStyles: { 0: { halign: 'center' }, 2: { halign: 'center' }, 4: { halign: 'center' }, 5: { halign: 'center' }, 6: { halign: 'center', fontStyle: 'bold' } }
            });

            doc.save(`Produtividade_Equipe_${pautaNome.replace(/\s+/g, '_')}.pdf`);
            return true;
        } catch (error) {
            console.error("Erro ao gerar PDF de Colaboradores:", error);
            return false;
        }
    },

    async generateAtaAcaoSocial(pautaName, colaboradores, atendidos, dadosExtras = {}) {
        await ensureJsPDF();
        console.log("Função Ata Social");
    },
    async previewAtaAcaoSocial() { await ensureJsPDF(); },
    async generateChecklistPDF() { await ensureJsPDF(); },
    async generateStatisticsPDF() { await ensureJsPDF(); }
};

window.PDFService = PDFService;
