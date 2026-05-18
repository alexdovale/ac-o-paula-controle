// js/pdfService.js - GERADOR DE RELATÓRIOS AUDITÁVEIS (PADRÃO SIGEP)

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

// Auxiliar para calcular a duração entre duas marcas de tempo em minutos textuais
const getDuracaoMinutos = (dataInicialStr, dataFinalStr) => {
    if (!dataInicialStr || !dataFinalStr) return 'N/A';
    const inicio = new Date(dataInicialStr);
    const fim = new Date(dataFinalStr);
    if (isNaN(inicio.getTime()) || isNaN(fim.getTime())) return 'N/A';
    
    const diffMs = fim - inicio;
    const totalMinutos = Math.floor(diffMs / (1000 * 60));
    
    if (totalMinutos < 0) return '0 min';
    if (totalMinutos >= 60) {
        return `${Math.floor(totalMinutos / 60)}h ${totalMinutos % 60}min`;
    }
    return `${totalMinutos} min`;
};

// Auxiliar para calcular o atraso a partir de um horário HH:MM de agendamento e a data/hora da falta
const getDiferencaAgendamento = (scheduledTime, lastActionTimestamp) => {
    if (!scheduledTime || !lastActionTimestamp) return 'N/A';
    const dataFalta = new Date(lastActionTimestamp);
    if (isNaN(dataFalta.getTime())) return 'N/A';

    try {
        const [h, m] = scheduledTime.split(':').map(Number);
        const dataAgendado = new Date(dataFalta);
        dataAgendado.setHours(h, m, 0, 0);

        const diffMs = dataFalta - dataAgendado;
        const totalMinutos = Math.floor(diffMs / (1000 * 60));
        return totalMinutos > 0 ? `${totalMinutos} min` : '0 min';
    } catch (e) {
        return 'N/A';
    }
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
                styles: { lineColor: [0, 0, 0], lineWidth: 1, textColor: [0, 0, 0], fontSize: 10, cellPadding: 6, overflow: 'linebreak' },
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

    async generateAtendidosPDF(atendidosList, pautaNome = "Geral") {
        try {
            await ensureJsPDF();
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'l', unit: 'pt', format: 'a4' });

            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            doc.text("RELATÓRIO DE ASSISTIDOS PROTOCOLADOS / ATENDIDOS", doc.internal.pageSize.getWidth() / 2, 40, { align: "center" });
            
            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            doc.text(`Sistema: SIGEP  |  Pauta: ${pautaNome}  |  Total Atendidos: ${atendidosList.length}`, 40, 65);

            const body = atendidosList.map((a, index) => {
                const dataAtendimento = getSafeDate(a.attendedAt || a.lastActionTimestamp);
                const horaStr = dataAtendimento ? dataAtendimento.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : 'N/A';
                
                const inicioProcesso = a.arrivalTime || a.createdAt;
                const duracaoTotal = getDuracaoMinutos(inicioProcesso, a.attendedAt);
                const lancadoNoVerde = a.isConfirmed ? "Sim" : "Não";

                let assuntoCompleto = a.subject || 'Não Informado';
                if (a.demandas && a.demandas.descricoes && a.demandas.descricoes.length > 0) {
                    assuntoCompleto += '\n[Demandas Adicionais]:\n' + a.demandas.descricoes.map(d => `• ${d}`).join('\n');
                }

                return [
                    index + 1,
                    a.name || 'Não Informado',
                    a.scheduledTime || 'Avulso', 
                    assuntoCompleto, 
                    getAttendantNameForPDF(a),
                    a.numeroProcesso || 'S/ Número',
                    horaStr,
                    duracaoTotal,
                    lancadoNoVerde
                ];
            });

            if (body.length === 0) body.push([{ content: "Nenhum atendimento finalizado nesta pauta.", colSpan: 9, styles: { halign: 'center', fontStyle: 'italic' } }]);

            doc.autoTable({
                startY: 80,
                head: [['Nº', 'NOME DO ASSISTIDO', 'AGENDADO', 'ASSUNTO / DEMANDAS RESOLVIDAS', 'ATENDENTE', 'Nº PROCESSO / PROTOCOLO', 'HORA CONCL.', 'DURAÇÃO', 'LANÇADO VERDE']],
                body: body,
                theme: 'grid', 
                headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9, halign: 'center' },
                styles: { fontSize: 8, cellPadding: 5, valign: 'middle', overflow: 'linebreak' }, 
                columnStyles: { 
                    0: { halign: 'center', cellWidth: 25 }, 
                    1: { cellWidth: 110 }, 
                    2: { halign: 'center', fontStyle: 'bold', cellWidth: 55 },
                    3: { cellWidth: 190 }, 
                    4: { cellWidth: 90 }, 
                    5: { fontStyle: 'bold', halign: 'center', cellWidth: 90 }, 
                    6: { halign: 'center', cellWidth: 50 }, 
                    7: { halign: 'center', fontStyle: 'bold', cellWidth: 60 }, 
                    8: { halign: 'center', cellWidth: 60 } 
                }
            });

            doc.save(`SIGEP_Atendidos_${pautaNome.replace(/\s+/g, '_')}.pdf`);
            return true;
        } catch (error) {
            console.error("Erro ao gerar PDF de Atendidos:", error);
            return false;
        }
    },

    async generateFaltososPDF(faltososList, pautaNome = "Geral") {
        try {
            await ensureJsPDF();
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'l', unit: 'pt', format: 'a4' });

            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            doc.text("RELATÓRIO DE AUSÊNCIAS / FALTOSOS", doc.internal.pageSize.getWidth() / 2, 45, { align: "center" });

            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            doc.text(`Sistema: SIGEP  |  Pauta: ${pautaNome}  |  Total Ausentes: ${faltososList.length}`, 40, 70);

            const body = faltososList.map((f, index) => {
                const dataFalta = getSafeDate(f.lastActionTimestamp);
                const horaFaltaStr = dataFalta ? dataFalta.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : 'N/A';
                const tempoAtraso = getDiferencaAgendamento(f.scheduledTime, f.lastActionTimestamp);
                const lancadoNoVerde = f.isConfirmed ? "Sim" : "Não";

                return [
                    index + 1,
                    f.name || 'Não Informado',
                    f.subject || 'Não Informado',
                    f.scheduledTime || 'Não Agendado',
                    horaFaltaStr,
                    tempoAtraso,
                    lancadoNoVerde
                ];
            });

            if (body.length === 0) body.push([{ content: "Nenhum assistido marcado como faltoso.", colSpan: 7, styles: { halign: 'center', fontStyle: 'italic' } }]);

            doc.autoTable({
                startY: 85,
                head: [['Nº', 'NOME DO ASSISTIDO', 'ASSUNTO PREVISTO', 'HORÁRIO AGENDADO', 'HORA FALTA', 'ATRASO LIMITE', 'LANÇADO VERDE']],
                body: body,
                theme: 'striped',
                headStyles: { fillColor: [153, 27, 27], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9, halign: 'center' },
                styles: { fontSize: 8.5, cellPadding: 6, valign: 'middle', overflow: 'linebreak' }, 
                columnStyles: { 
                    0: { halign: 'center', cellWidth: 30 }, 
                    1: { cellWidth: 160 }, 
                    2: { cellWidth: 220 }, 
                    3: { halign: 'center', fontStyle: 'bold', cellWidth: 80 }, 
                    4: { halign: 'center', cellWidth: 70 }, 
                    5: { fontStyle: 'bold', halign: 'center', cellWidth: 80 }, 
                    6: { halign: 'center', cellWidth: 80 } 
                }
            });

            doc.save(`SIGEP_Faltosos_${pautaNome.replace(/\s+/g, '_')}.pdf`);
            return true;
        } catch (error) {
            console.error("Erro ao gerar PDF de Faltosos:", error);
            return false;
        }
    },

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
            doc.text(`Sistema: SIGEP  |  Pauta: ${pautaNome}  |  Total Equipe: ${colaboradoresList.length}`, 40, 70);

            const body = colaboradoresList.map((c, index) => {
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
                headStyles: { fillColor: [4, 120, 87], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9, halign: 'center' },
                styles: { fontSize: 8.5, cellPadding: 6, valign: 'middle', overflow: 'linebreak' },
                columnStyles: { 
                    0: { halign: 'center', cellWidth: 25 }, 
                    1: { cellWidth: 150 }, 
                    2: { halign: 'center', cellWidth: 100 }, 
                    3: { cellWidth: 90 }, 
                    4: { halign: 'center', cellWidth: 50 }, 
                    5: { halign: 'center', cellWidth: 50 }, 
                    6: { halign: 'center', fontStyle: 'bold', cellWidth: 65 } 
                }
            });

            doc.save(`SIGEP_Produtividade_Equipe_${pautaNome.replace(/\s+/g, '_')}.pdf`);
            return true;
        } catch (error) {
            console.error("Erro ao gerar PDF de Colaboradores:", error);
            return false;
        }
    },

    // ⭐ NOVO E COMPLETO: MOTOR DE MONTAGEM DO PDF DA TRIAGEM / DETALHES (CONECTADO COM demandasAdicionais) ⭐
    async generateChecklistPDF(assistedName, actionTitle, checklistData, documentosTextos) {
        try {
            await ensureJsPDF();
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });

            // 1. TÍTULO PRINCIPAL DO SIGEP
            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            doc.text("EXTRATO DE TRIAGEM E DOCUMENTAÇÃO", doc.internal.pageSize.getWidth() / 2, 45, { align: "center" });

            // 2. QUADRO DE INFORMAÇÕES DO ASSISTIDO
            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            doc.text(`Sistema: SIGEP  |  Emissão: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}`, 40, 70);
            doc.text(`Assistido(a): ${assistedName.toUpperCase()}`, 40, 85);
            doc.text(`Ação Selecionada: ${actionTitle.toUpperCase()}`, 40, 100);

            // 3. CONSTRUÇÃO DA TABELA DO CHECKLIST
            const body = [];
            
            // Filtra e empilha os documentos normais coletados do checklist
            documentosTextos.forEach((item, index) => {
                if (item.id.startsWith('reu-') || item.id.startsWith('gasto-')) return; // Pula os metadados do réu/gastos pois eles ganham blocos dedicados abaixo
                
                const tipoEntrega = checklistData.docTypes && checklistData.docTypes[item.id] ? checklistData.docTypes[item.id] : 'Físico';
                body.push([
                    index + 1,
                    item.text,
                    `CONFERIDO (${tipoEntrega.toUpperCase()})`
                ]);
            });

            // Se o colaborador anexou múltiplos assuntos/demandas adicionais (via assuntos.js)
            if (checklistData.demandasAdicionais && checklistData.demandasAdicionais.length > 0) {
                body.push([{ content: "⚖️ CASOS ACUMULADOS / DEMANDAS ADICIONAIS RESOLVIDAS", colSpan: 3, styles: { fontStyle: 'bold', fillColor: [243, 244, 246] } }]);
                checklistData.demandasAdicionais.forEach((demanda, dIdx) => {
                    body.push([
                        `+${dIdx + 1}`,
                        `Demanda Extra: ${demanda}`,
                        "CONFERIDO E ATENDIDO"
                    ]);
                });
            }

            // Se o checkbox unificado de qualificação do réu estiver preenchido
            if (checklistData.reuData && checklistData.reuData.checkReuUnico) {
                const r = checklistData.reuData;
                body.push([{ content: "👤 QUALIFICAÇÃO DA PARTE CONTRÁRIA (RÉU)", colSpan: 3, styles: { fontStyle: 'bold', fillColor: [fee2e2 || 254, 226, 226], textColor: [185, 28, 28] } }]);
                if (r.nome) body.push(["•", `Nome do Réu: ${r.nome}`, "CITAÇÃO"]);
                if (r.cpf) body.push(["•", `CPF do Réu: ${r.cpf}`, "CITAÇÃO"]);
                if (r.telefone) body.push(["•", `WhatsApp/Contato: ${r.telefone}`, "CITAÇÃO"]);
                if (r.rua) body.push(["•", `Endereço Residencial: ${r.rua}, nº ${r.numero} ${r.complemento ? '- '+r.complemento : ''} - ${r.bairro}, ${r.cidade}/${r.uf}`, "CITAÇÃO PRINCIPAL"]);
                if (r.empresa) body.push(["•", `Endereço Comercial/Trabalho: ${r.empresa} - ${r.rua_comercial}, nº ${r.numero_comercial} - ${r.bairro_comercial}`, "CITAÇÃO ALTERNATIVA"]);
            }

            // Se houver planilha de despesas/gastos cadastrada
            if (checklistData.expenseData && checklistData.expenseData.checkExibirGastos) {
                const g = checklistData.expenseData;
                body.push([{ content: "💰 EXTRACTO DE GASTOS / NECESSIDADES MENSAIS", colSpan: 3, styles: { fontStyle: 'bold', fillColor: [220, 252, 231], textColor: [21, 128, 61] } }]);
                
                const categoriasNome = [
                    {id: 'moradia', label: 'Moradia/Habitação'}, {id: 'alimentacao', label: 'Alimentação'},
                    {id: 'educacao', label: 'Educação/Escola'}, {id: 'saude', label: 'Saúde/Medicamentos'},
                    {id: 'vestuario', label: 'Vestuário/Higiene'}, {id: 'lazer', label: 'Lazer/Combustível'},
                    {id: 'outras', label: 'Outras Despesas'}
                ];

                categoriasNome.forEach(c => {
                    if (g[c.id] && g[c.id] !== 'R$ 0,00') {
                        body.push(["$", c.label, g[c.id]]);
                    }
                });
            }

            // Desenha a tabela com controle estrito de quebra automática de linha
            doc.autoTable({
                startY: 120,
                head: [['Nº', 'DOCUMENTO / ESPECIFICAÇÃO DE TRIAGEM', 'ESTADO DE ENTREGA']],
                body: body,
                theme: 'grid',
                headStyles: { fillColor: [22, 163, 74], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9, halign: 'center' },
                styles: { fontSize: 8.5, cellPadding: 5, valign: 'middle', overflow: 'linebreak' },
                columnStyles: {
                    0: { halign: 'center', cellWidth: 30 },
                    1: { cellWidth: 380 },
                    2: { halign: 'center', cellWidth: 110, fontStyle: 'bold' }
                }
            });

            doc.save(`SIGEP_Triagem_${assistedName.replace(/\s+/g, '_')}.pdf`);
            return true;
        } catch (err) {
            console.error("Erro crítico na montagem do PDF de triagem:", err);
            return false;
        }
    },

    async generateAtaAcaoSocial(pautaName, colaboradores, atendidos, dadosExtras = {}) {
        await ensureJsPDF();
        console.log("Função Ata Social");
    },
    async previewAtaAcaoSocial() { await ensureJsPDF(); },
    async generateStatisticsPDF() { await ensureJsPDF(); }
};

window.PDFService = PDFService;
