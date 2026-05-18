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
    
    // 1. PLANILHA ISOLADA DE GASTOS
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
                     { content: 'TOTAL DAS NECESSIDADES MENSAL', styles: { fontStyle: 'bold', halign: 'center', fillColor: [240, 253, 244] } },
                     { content: totalFormatted, styles: { fontStyle: 'bold', halign: 'center', fillColor: [220, 252, 231], textColor: [21, 128, 61] } }
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

    // 2. RELATÓRIO GLOBAL DE ATENDIDOS (MÉTRICAS)
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

    // 3. RELATÓRIO DE AUSÊNCIAS (MÉTRICAS)
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

    // 4. RELATÓRIO DE PRODUTIVIDADE DA EQUIPE (MÉTRICAS)
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

    // ⭐ 5. EXTRATO INDIVIDUAL TEXTUAL (FORMATO IDÊNTICO À IMAGEM DE REFERÊNCIA) ⭐
    async generateChecklistPDF(assistedName, actionTitle, checklistData, documentosTextos) {
        try {
            await ensureJsPDF();
            const { jsPDF } = window.jspdf;
            
            // Criando PDF em formato retrato (A4)
            const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });

            let y = 60; // Cursor Vertical Y inicial
            const marginX = 50; // Margem Esquerda
            const maxWidth = doc.internal.pageSize.getWidth() - (marginX * 2);
            const pageHeight = doc.internal.pageSize.getHeight();

            // Função auxiliar para quebra de página
            const checkPage = (heightToAdd = 20) => {
                if (y + heightToAdd >= pageHeight - 50) {
                    doc.addPage();
                    y = 60; // Reseta o Y na nova página
                }
            };

            // Função auxiliar para injetar textos
            const addText = (text, isBold = false, size = 10, indent = 0) => {
                doc.setFont("helvetica", isBold ? "bold" : "normal");
                doc.setFontSize(size);
                
                const textLines = doc.splitTextToSize(text, maxWidth - indent);
                checkPage(textLines.length * (size * 1.2));
                
                doc.text(textLines, marginX + indent, y);
                y += (textLines.length * (size * 1.2)) + 5;
            };

            // --- CABEÇALHO ---
            // Título centralizado
            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            doc.text("Checklist de Atendimento - SIGEP", doc.internal.pageSize.getWidth() / 2, y, { align: "center" });
            y += 40;

            // Dados do assistido
            addText(`Assistido: ${assistedName.toUpperCase()}`, false, 11);
            addText(`Ação: ${actionTitle}`, false, 11);
            y += 30; // Espaçamento antes da próxima seção

            // --- 1. DOCUMENTAÇÃO ENTREGUE ---
            addText("DOCUMENTAÇÃO ENTREGUE:", true, 11);
            y += 10;
            
            documentosTextos.forEach((item) => {
                if (item.id.startsWith('reu-') || item.id.startsWith('gastos-') || item.id.startsWith('gasto-')) return;
                const tipoEntrega = checklistData.docTypes && checklistData.docTypes[item.id] ? checklistData.docTypes[item.id] : 'Físico';
                addText(`[X] ${item.text} - [${tipoEntrega.toUpperCase()}]`, false, 10, 20); // Recuo de 20pt
            });
            y += 20;

            // --- 2. DEMANDAS ADICIONAIS (Se houver) ---
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
                    addText(`${c.label}: ${valorStr}`, false, 10, 20); // Recuo de 20pt
                    
                    const num = parseFloat(String(valorStr).replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
                    totalGastos += num;
                });

                if (totalGastos > 0) {
                    y += 5; // Pequeno espaço antes do total
                    const totalFormatado = totalGastos.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                    addText(`${totalFormatado}`, true, 10, 20); // Negrito, recuado
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

            // Efetua o download do arquivo
            doc.save(`Checklist_SIGEP_${assistedName.replace(/\s+/g, '_')}.pdf`);
            return true;
        } catch (err) {
            console.error("Erro crítico na montagem do PDF textual:", err);
            return false;
        }
    },

    // 6. STUBS PARA EXPANSÕES FUTURAS
    async generateAtaAcaoSocial(pautaName, colaboradores, atendidos, dadosExtras = {}) {
        await ensureJsPDF();
        console.log("Função Ata Social");
    },
    async previewAtaAcaoSocial() { await ensureJsPDF(); },
    async generateStatisticsPDF() { await ensureJsPDF(); }
};

window.PDFService = PDFService;
