// js/pdfService.js - VERSÃO COMPLETA E CORRIGIDA COM PDFService

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

/**
 * Formata CPF (000.000.000-00)
 */
const formatCPF = (cpf) => {
    if (!cpf) return '';
    const numeros = String(cpf).replace(/\D/g, '');
    if (numeros.length !== 11) return cpf;
    return numeros.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
};

/**
 * Formata CEP (00000-000)
 */
const formatCEP = (cep) => {
    if (!cep) return '';
    const numeros = String(cep).replace(/\D/g, '');
    if (numeros.length !== 8) return cep;
    return numeros.replace(/(\d{5})(\d{3})/, '$1-$2');
};

/**
 * Formata moeda (R$ 0,00)
 */
const formatCurrency = (value) => {
    if (!value) return 'R$ 0,00';
    // Se já estiver formatado, retorna como está
    if (typeof value === 'string' && value.includes('R$')) return value;
    
    // Tenta converter para número
    let num = 0;
    if (typeof value === 'string') {
        // Remove R$ e espaços, substitui vírgula por ponto
        const cleanValue = value.replace(/[R$\s]/g, '').replace(',', '.');
        num = parseFloat(cleanValue) || 0;
    } else {
        num = value || 0;
    }
    
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

// ========================================================
// PDF SERVICE - Objeto com todas as funções de PDF
// ========================================================

export const PDFService = {
    /**
     * GERA O RELATÓRIO DE ATENDIDOS
     */
    generateAtendidosPDF(pautaName, atendidos) {
        try {
            const { jsPDF } = window.jspdf;
            const docPDF = new jsPDF({ orientation: 'l', unit: 'pt', format: 'a4' });

            // Cabeçalho
            docPDF.setFontSize(18);
            docPDF.setTextColor(22, 101, 52);
            docPDF.text(`Relatório de Atendidos - ${pautaName}`, 40, 40);

            docPDF.setFontSize(10);
            docPDF.setTextColor(100);
            const totalAssuntos = atendidos.reduce((acc, a) => acc + 1 + (a.demandas?.quantidade || 0), 0);
            docPDF.text(`Data: ${new Date().toLocaleString('pt-BR')}`, 40, 55);
            docPDF.text(`Total: ${atendidos.length} assistidos | Assuntos totais: ${totalAssuntos}`, 40, 68);

            // Definição das Colunas
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

                // Tratamento inteligente do atendente (String ou Objeto)
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

            // Chamada moderna do autoTable
            docPDF.autoTable({
                head: head,
                body: body,
                startY: 80,
                theme: 'striped',
                headStyles: { fillColor: [22, 163, 74] },
                styles: { fontSize: 8, cellPadding: 4 },
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
     * GERA PDF DO CHECKLIST COMPLETO (CORRIGIDO - VERSÃO FINAL)
     */
    generateChecklistPDF(assistedName, actionTitle, checklistData, documentosTextos = []) {
        try {
            console.log("📄 PDFService: GERANDO PDF COM DADOS RECEBIDOS:", {
                assistedName,
                actionTitle,
                checklistData,
                documentosTextos: documentosTextos.length
            });
            
            const { jsPDF } = window.jspdf;
            const docPDF = new jsPDF();
            const pageWidth = docPDF.internal.pageSize.getWidth();
            const pageHeight = docPDF.internal.pageSize.getHeight();
            let y = 20;
            const margin = 15;

            // ===== CABEÇALHO =====
            docPDF.setFontSize(18);
            docPDF.setTextColor(22, 163, 74);
            docPDF.setFont("helvetica", "bold");
            docPDF.text("SIGAP - CHECKLIST DE ATENDIMENTO", pageWidth / 2, y, { align: "center" });
            y += 8;
            
            docPDF.setFontSize(10);
            docPDF.setTextColor(100, 100, 100);
            docPDF.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, pageWidth / 2, y, { align: "center" });
            y += 15;

            // ===== 1. DADOS DO ASSISTIDO =====
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

            // ===== 2. DOCUMENTAÇÃO SELECIONADA =====
            docPDF.setFont("helvetica", "bold");
            docPDF.setFontSize(11);
            docPDF.text("2. DOCUMENTOS SELECIONADOS:", margin, y);
            y += 7;
            docPDF.setFont("helvetica", "normal");
            docPDF.setFontSize(9);
            
            if (documentosTextos && documentosTextos.length > 0) {
                documentosTextos.forEach((doc, index) => {
                    if (y > pageHeight - 20) {
                        docPDF.addPage();
                        y = 20;
                    }
                    
                    // Itens especiais (reu, gastos) nao recebem checkmark nem tipo
                    const isSpecial = doc.id.startsWith('reu-') || doc.id.startsWith('gasto-');
                    
                    const tipo = (!isSpecial && checklistData?.docTypes && checklistData.docTypes[doc.id])
                        ? ` [${checklistData.docTypes[doc.id]}]`
                        : '';
                    
                    // Remove emojis e chars nao suportados por helvetica
                    const safeText = doc.text.replace(/[^\x00-\x7F\xC0-\xFF\s\-\,\.\:\;\!\?\(\)\/\\\[\]#@$%&*+<>=~^|]/g, '');
                    
                    const prefix = isSpecial ? '' : '[X] ';
                    
                    if (doc.id === 'reu-titulo' || doc.id === 'gastos-titulo') {
                        docPDF.setFont("helvetica", "bold");
                        docPDF.text(safeText.trim(), margin + 5, y);
                        docPDF.setFont("helvetica", "normal");
                    } else {
                        docPDF.text(`${prefix}${safeText}${tipo}`, margin + 5, y);
                    }
                    y += 5;
                });
            } else {
                docPDF.text("Nenhum documento selecionado.", margin + 5, y);
                y += 5;
            }
            y += 5;

            // ===== 3. PLANILHA DE GASTOS =====
            if (checklistData && checklistData.expenseData) {
                const expData = checklistData.expenseData;
                // Só mostra se checkExibirGastos for true E tiver valores preenchidos
                const gastoAtivo = expData.checkExibirGastos !== false;
                const hasExpenses = gastoAtivo && Object.entries(expData).some(([k, v]) =>
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
                    
                    // Cabeçalho da tabela
                    docPDF.setFillColor(240, 240, 240);
                    docPDF.rect(margin, y - 4, pageWidth - 2*margin, 6, 'F');
                    docPDF.setFont("helvetica", "bold");
                    docPDF.text("DESCRIÇÃO", margin + 5, y);
                    docPDF.text("VALOR", pageWidth - margin - 40, y, { align: 'right' });
                    y += 6;
                    docPDF.setFont("helvetica", "normal");
                    
                    // Lista de categorias
                    const categorias = [
                        { id: 'moradia', label: 'Moradia' },
                        { id: 'alimentacao', label: 'Alimentação' },
                        { id: 'educacao', label: 'Educação' },
                        { id: 'saude', label: 'Saúde' },
                        { id: 'vestuario', label: 'Vestuário' },
                        { id: 'lazer', label: 'Lazer' },
                        { id: 'outras', label: 'Outras' }
                    ];
                    
                    let total = 0;
                    
                    categorias.forEach(cat => {
                        let valor = checklistData.expenseData[cat.id] || '';
                        
                        // Só mostra se tiver valor
                        if (valor && String(valor).trim() !== '' && valor !== 'R$ 0,00') {
                            if (y > pageHeight - 20) {
                                docPDF.addPage();
                                y = 20;
                            }
                            
                            docPDF.text(cat.label, margin + 5, y);
                            docPDF.text(valor, pageWidth - margin - 40, y, { align: 'right' });
                            y += 5;
                            
                            // Calcula total
                            const valorNumerico = parseFloat(String(valor).replace(/[R$\s.]/g, '').replace(',', '.')) || 0;
                            total += valorNumerico;
                        }
                    });
                    
                    // Mostra total
                    if (total > 0) {
                        y += 2;
                        docPDF.setDrawColor(200, 200, 200);
                        docPDF.line(margin, y - 2, pageWidth - margin, y - 2);
                        docPDF.setFont("helvetica", "bold");
                        docPDF.text("TOTAL:", margin + 5, y + 2);
                        docPDF.text(`R$ ${total.toFixed(2).replace('.', ',')}`, pageWidth - margin - 40, y + 2, { align: 'right' });
                        y += 10;
                    } else {
                        y += 5;
                    }
                }
            }


            // ===== 4. DADOS DO RÉU =====
            if (checklistData && checklistData.reuData) {
                const reu = checklistData.reuData;
                // Só mostra se checkReuUnico === true e tiver ao menos nome ou endereço
                const hasReu = reu.checkReuUnico === true && (reu.nome || reu.rua || reu.cep);
                if (hasReu) {
                    if (y > pageHeight - 80) { docPDF.addPage(); y = 20; }
                    docPDF.setFont("helvetica", "bold");
                    docPDF.setFontSize(11);
                    docPDF.text("4. DADOS DA PARTE CONTRARIA (REU):", margin, y);
                    y += 7;
                    docPDF.setFont("helvetica", "normal");
                    docPDF.setFontSize(9);

                    const addLinha = (texto) => {
                        if (y > pageHeight - 20) { docPDF.addPage(); y = 20; }
                        const safe = texto.replace(/[^ -À-ÿ\s\-\,\.\:\;\!\?\(\)\/\[\]#@$%&*+<>=~^|]/g, '');
                        const linhas = docPDF.splitTextToSize(safe, pageWidth - 2*margin - 10);
                        docPDF.text(linhas, margin + 5, y);
                        y += 5 * linhas.length;
                    };

                    if (reu.nome)     addLinha(`Nome: ${reu.nome}`);
                    if (reu.cpf)      addLinha(`CPF: ${reu.cpf}`);
                    if (reu.telefone) addLinha(`Tel: ${reu.telefone}`);
                    if (reu.rua) {
                        let end = `Endereco: ${reu.rua}`;
                        if (reu.numero) end += `, n ${reu.numero}`;
                        if (reu.complemento) end += ` - ${reu.complemento}`;
                        addLinha(end);
                    }
                    if (reu.bairro)    addLinha(`Bairro: ${reu.bairro}`);
                    if (reu.cidade || reu.uf) addLinha(`${reu.cidade || ''}${reu.uf ? ' - ' + reu.uf : ''}`);
                    if (reu.cep)       addLinha(`CEP: ${reu.cep}`);
                    if (reu.referencia) addLinha(`Referencia: ${reu.referencia}`);
                    if (reu.empresa)   addLinha(`Empresa: ${reu.empresa}`);
                    if (reu.rua_comercial) {
                        let endC = `End. Comercial: ${reu.rua_comercial}`;
                        if (reu.numero_comercial) endC += `, n ${reu.numero_comercial}`;
                        addLinha(endC);
                    }
                    if (reu.bairro_comercial) addLinha(`Bairro Comercial: ${reu.bairro_comercial}`);
                    if (reu.cidade_comercial || reu.uf_comercial) {
                        addLinha(`${reu.cidade_comercial || ''}${reu.uf_comercial ? ' - ' + reu.uf_comercial : ''}`);
                    }
                    if (reu.cep_comercial) addLinha(`CEP Comercial: ${reu.cep_comercial}`);
                    y += 3;
                }
            }

            // ===== RODAPÉ =====
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

            // Salvar PDF
            const nomeArquivo = `Checklist_${(assistedName || 'Assistido').replace(/\s+/g, '_')}.pdf`;
            docPDF.save(nomeArquivo);
            console.log("✅ PDF gerado com sucesso!");
            return true;
            
        } catch (error) {
            console.error("❌ Erro no PDFService:", error);
            return false;
        }
    },

    /**
     * GERA A LISTA DE PRESENÇA DA EQUIPE (DINÂMICA)
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
                styles: { fontSize: 9 }
            });

            docPDF.save(`equipe_${pautaName.replace(/\s+/g, '_')}.pdf`);
            return true;
        } catch (e) {
            console.error("Erro PDF Equipe:", e);
            return false;
        }
    },

    /**
     * GERA PDF DE ESTATÍSTICAS (opcional)
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

            // Resumo
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
// FUNÇÕES AVULSAS (para compatibilidade com código antigo)
// ========================================================

/**
 * @deprecated Use PDFService.generateAtendidosPDF() instead
 */
export const generateAtendidosPDF = (pautaName, atendidos) => {
    return PDFService.generateAtendidosPDF(pautaName, atendidos);
};

/**
 * @deprecated Use PDFService.generateChecklistPDF() instead
 */
export const generateChecklistPDF = (assistedName, actionTitle, checklistData, documentosTextos) => {
    return PDFService.generateChecklistPDF(assistedName, actionTitle, checklistData, documentosTextos);
};

/**
 * @deprecated Use PDFService.generateCollaboratorsPDF() instead
 */
export const generateCollaboratorsPDF = (pautaName, colaboradores, selectedCols) => {
    return PDFService.generateCollaboratorsPDF(pautaName, colaboradores, selectedCols);
};

/**
 * @deprecated Use PDFService.generateStatisticsPDF() instead
 */
export const generateStatisticsPDF = (pautaName, statsData) => {
    return PDFService.generateStatisticsPDF(pautaName, statsData);
};

// Tornar PDFService global
window.PDFService = PDFService;

console.log("✅ pdfService.js carregado com sucesso!");