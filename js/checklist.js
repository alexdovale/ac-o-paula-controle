// js/checklist.js
import { escapeHTML } from './utils.js';

export const getChecklistHTML = (acao, savedData = null) => {
    const documentos = getDocumentosPorAcao(acao);
    
    let html = '<div class="space-y-4">';
    
    // Documentos
    documentos.forEach((doc, index) => {
        const docId = `doc_${index}`;
        const isChecked = savedData?.checkedIds?.includes(docId) || false;
        const docType = savedData?.docTypes?.[docId] || 'Físico';
        
        html += `
            <div class="border rounded-lg p-3 bg-white">
                <div class="flex items-center justify-between">
                    <label class="flex items-center gap-2 cursor-pointer flex-1">
                        <input type="checkbox" class="doc-checkbox" id="${docId}" ${isChecked ? 'checked' : ''}>
                        <span class="text-sm">${doc}</span>
                    </label>
                    <div class="flex gap-2">
                        <label class="text-xs">
                            <input type="radio" name="type-${docId}" value="Físico" ${docType === 'Físico' ? 'checked' : ''}> Físico
                        </label>
                        <label class="text-xs">
                            <input type="radio" name="type-${docId}" value="Digital" ${docType === 'Digital' ? 'checked' : ''}> Digital
                        </label>
                    </div>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    
    // Adicionar seção de endereço do réu
    html += getEnderecoHTML(savedData?.reuData);
    
    // Adicionar seção de gastos mensais
    html += getGastosHTML(savedData?.expenseData);
    
    return html;
};

function getEnderecoHTML(reuData = {}) {
    return `
        <div class="mt-8 border-t pt-6">
            <h4 class="text-md font-bold text-gray-700 mb-4">🏠 Endereço do Réu / Obrigado</h4>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Nome Completo</label>
                    <input type="text" id="nome-reu" class="w-full p-2 border rounded-lg text-sm" value="${escapeHTML(reuData.nome || '')}">
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-1">CPF</label>
                    <input type="text" id="cpf-reu" class="w-full p-2 border rounded-lg text-sm" value="${escapeHTML(reuData.cpf || '')}">
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Telefone</label>
                    <input type="text" id="telefone-reu" class="w-full p-2 border rounded-lg text-sm" value="${escapeHTML(reuData.telefone || '')}">
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-1">CEP</label>
                    <input type="text" id="cep-reu" class="w-full p-2 border rounded-lg text-sm" value="${escapeHTML(reuData.cep || '')}">
                </div>
                <div class="md:col-span-2">
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Endereço</label>
                    <input type="text" id="rua-reu" class="w-full p-2 border rounded-lg text-sm" value="${escapeHTML(reuData.rua || '')}">
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Número</label>
                    <input type="text" id="numero-reu" class="w-full p-2 border rounded-lg text-sm" value="${escapeHTML(reuData.numero || '')}">
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Bairro</label>
                    <input type="text" id="bairro-reu" class="w-full p-2 border rounded-lg text-sm" value="${escapeHTML(reuData.bairro || '')}">
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Cidade</label>
                    <input type="text" id="cidade-reu" class="w-full p-2 border rounded-lg text-sm" value="${escapeHTML(reuData.cidade || '')}">
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-1">UF</label>
                    <input type="text" id="estado-reu" class="w-full p-2 border rounded-lg text-sm" value="${escapeHTML(reuData.uf || '')}">
                </div>
                <div class="md:col-span-2">
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Empresa (Local de Trabalho)</label>
                    <input type="text" id="empresa-reu" class="w-full p-2 border rounded-lg text-sm" value="${escapeHTML(reuData.empresa || '')}">
                </div>
                <div class="md:col-span-2">
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Endereço do Trabalho</label>
                    <input type="text" id="endereco-trabalho-reu" class="w-full p-2 border rounded-lg text-sm" value="${escapeHTML(reuData.enderecoTrabalho || '')}">
                </div>
            </div>
        </div>
    `;
}

function getGastosHTML(expenseData = {}) {
    return `
        <div class="mt-8 border-t pt-6">
            <h4 class="text-md font-bold text-gray-700 mb-4">💰 Gastos Mensais</h4>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Moradia (Aluguel/Prestação)</label>
                    <input type="text" id="expense-moradia" class="w-full p-2 border rounded-lg text-sm" value="${escapeHTML(expenseData.moradia || '')}">
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Alimentação</label>
                    <input type="text" id="expense-alimentacao" class="w-full p-2 border rounded-lg text-sm" value="${escapeHTML(expenseData.alimentacao || '')}">
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Educação</label>
                    <input type="text" id="expense-educacao" class="w-full p-2 border rounded-lg text-sm" value="${escapeHTML(expenseData.educacao || '')}">
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Saúde</label>
                    <input type="text" id="expense-saude" class="w-full p-2 border rounded-lg text-sm" value="${escapeHTML(expenseData.saude || '')}">
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Vestuário</label>
                    <input type="text" id="expense-vestuario" class="w-full p-2 border rounded-lg text-sm" value="${escapeHTML(expenseData.vestuario || '')}">
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Lazer</label>
                    <input type="text" id="expense-lazer" class="w-full p-2 border rounded-lg text-sm" value="${escapeHTML(expenseData.lazer || '')}">
                </div>
                <div class="md:col-span-2">
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Outras Despesas</label>
                    <input type="text" id="expense-outras" class="w-full p-2 border rounded-lg text-sm" value="${escapeHTML(expenseData.outras || '')}">
                </div>
            </div>
        </div>
    `;
}

function getDocumentosPorAcao(acao) {
    const documentosBase = [
        'RG',
        'CPF',
        'Comprovante de Residência',
        'Certidão de Casamento',
        'Certidão de Nascimento'
    ];
    
    const documentosEspecificos = {
        'Divórcio Consensual': [
            'Certidão de Casamento Atualizada',
            'Comprovante de Bens do Casal',
            'Comprovante de Renda de Ambos',
            ' Pacto Antenupcial (se houver)'
        ],
        'Alimentos': [
            'Comprovante de Renda do Alimentante',
            'Comprovante de Despesas do Alimentando',
            'Comprovante de Renda do Alimentando (se maior)',
            'Comprovante de Matrícula Escolar'
        ],
        'Guarda de Menores': [
            'Comprovante de Renda do Requerente',
            'Comprovante de Residência',
            'Declaração Escolar do Menor',
            'Relatório Psicossocial (se houver)'
        ],
        'Aposentadoria por Idade': [
            'Carteira de Trabalho',
            'Extrato CNIS',
            'Comprovante de Contribuições',
            'Documento de Identidade'
        ],
        'BPC/LOAS': [
            'Comprovante de Renda Familiar',
            'Laudo Médico (se PCD)',
            'Comprovante de Despesas Médicas',
            'Declaração do CADÚNICO'
        ]
    };
    
    // Verificar se há documentos específicos para esta ação
    let especificos = [];
    for (const [key, docs] of Object.entries(documentosEspecificos)) {
        if (acao.toLowerCase().includes(key.toLowerCase())) {
            especificos = docs;
            break;
        }
    }
    
    return [...documentosBase, ...especificos];
}

// Função para gerar PDF completo
export const generateCompletePDF = async (assistedData, checklistData) => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    let y = 20;
    const margin = 20;
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Título
    doc.setFontSize(18);
    doc.setTextColor(22, 163, 74);
    doc.text("Checklist de Atendimento - SIGAP", pageWidth / 2, y, { align: "center" });
    y += 15;
    
    // Dados do Assistido
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(`Assistido: ${assistedData.name || 'Não informado'}`, margin, y);
    y += 7;
    doc.text(`Ação: ${assistedData.selectedAction || 'Não informada'}`, margin, y);
    y += 7;
    doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, margin, y);
    y += 15;
    
    // Documentos
    if (checklistData?.checkedIds?.length > 0) {
        doc.setFontSize(14);
        doc.setTextColor(22, 163, 74);
        doc.text("📋 Documentação Apresentada:", margin, y);
        y += 10;
        
        doc.setFontSize(10);
        doc.setTextColor(60, 60, 60);
        
        checklistData.checkedIds.forEach((id, index) => {
            const docType = checklistData.docTypes?.[id] || 'Físico';
            const docText = document.getElementById(id)?.closest('label')?.querySelector('span')?.textContent || id;
            
            doc.text(`✓ ${docText} (${docType})`, margin + 5, y);
            y += 6;
            
            if (y > 280) {
                doc.addPage();
                y = 20;
            }
        });
        y += 10;
    }
    
    // Endereço do Réu (se houver dados)
    if (checklistData?.reuData && Object.values(checklistData.reuData).some(v => v)) {
        if (y > 250) {
            doc.addPage();
            y = 20;
        }
        
        doc.setFontSize(14);
        doc.setTextColor(22, 163, 74);
        doc.text("🏠 Dados do Réu/Obrigado:", margin, y);
        y += 10;
        
        doc.setFontSize(10);
        doc.setTextColor(60, 60, 60);
        
        const reu = checklistData.reuData;
        if (reu.nome) {
            doc.text(`Nome: ${reu.nome}`, margin + 5, y);
            y += 5;
        }
        if (reu.cpf) {
            doc.text(`CPF: ${reu.cpf}`, margin + 5, y);
            y += 5;
        }
        if (reu.telefone) {
            doc.text(`Telefone: ${reu.telefone}`, margin + 5, y);
            y += 5;
        }
        if (reu.cep || reu.rua || reu.numero) {
            const endereco = `${reu.rua || ''}, ${reu.numero || ''} - ${reu.bairro || ''}, ${reu.cidade || ''}/${reu.uf || ''} - CEP: ${reu.cep || ''}`;
            doc.text(`Endereço: ${endereco}`, margin + 5, y);
            y += 5;
        }
        if (reu.empresa) {
            doc.text(`Empresa: ${reu.empresa}`, margin + 5, y);
            y += 5;
        }
        if (reu.enderecoTrabalho) {
            doc.text(`End. Trabalho: ${reu.enderecoTrabalho}`, margin + 5, y);
            y += 5;
        }
        y += 10;
    }
    
    // Gastos Mensais (se houver dados)
    if (checklistData?.expenseData && Object.values(checklistData.expenseData).some(v => v)) {
        if (y > 250) {
            doc.addPage();
            y = 20;
        }
        
        doc.setFontSize(14);
        doc.setTextColor(22, 163, 74);
        doc.text("💰 Gastos Mensais:", margin, y);
        y += 10;
        
        doc.setFontSize(10);
        doc.setTextColor(60, 60, 60);
        
        const gastos = checklistData.expenseData;
        if (gastos.moradia) {
            doc.text(`Moradia: R$ ${gastos.moradia}`, margin + 5, y);
            y += 5;
        }
        if (gastos.alimentacao) {
            doc.text(`Alimentação: R$ ${gastos.alimentacao}`, margin + 5, y);
            y += 5;
        }
        if (gastos.educacao) {
            doc.text(`Educação: R$ ${gastos.educacao}`, margin + 5, y);
            y += 5;
        }
        if (gastos.saude) {
            doc.text(`Saúde: R$ ${gastos.saude}`, margin + 5, y);
            y += 5;
        }
        if (gastos.vestuario) {
            doc.text(`Vestuário: R$ ${gastos.vestuario}`, margin + 5, y);
            y += 5;
        }
        if (gastos.lazer) {
            doc.text(`Lazer: R$ ${gastos.lazer}`, margin + 5, y);
            y += 5;
        }
        if (gastos.outras) {
            doc.text(`Outras: R$ ${gastos.outras}`, margin + 5, y);
            y += 5;
        }
    }
    
    // Rodapé
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text("Documento gerado pelo SIGAP - Sistema de Gerenciamento de Pauta", pageWidth / 2, 290, { align: "center" });
    
    doc.save(`checklist_${assistedData.name || 'assistido'}_${new Date().toISOString().slice(0,10)}.pdf`);
};
