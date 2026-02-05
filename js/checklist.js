// js/checklist.js

export const documentsData = {
    "Divórcio": {
        title: "Checklist: Divórcio (Consensual ou Litigioso)",
        sections: [
            { title: "Documentos Pessoais", docs: ["RG e CPF", "Comprovante de residência atualizado", "Comprovante de renda (Contracheque, CTPS ou declaração)"] },
            { title: "Do Casamento", docs: ["Certidão de Casamento (atualizada nos últimos 90 dias)", "Pacto Antenupcial (se houver)"] },
            { title: "Dos Filhos e Bens", docs: ["Certidão de Nascimento dos filhos", "Documentos de veículos (CRLV)", "Escritura, RGI ou contrato de compra e venda de imóveis", "Extratos bancários e dívidas"] }
        ]
    },
    "Alimentos": {
        title: "Checklist: Ação de Alimentos (Pensão)",
        sections: [
            { title: "Do Requerente/Criança", docs: ["Certidão de Nascimento da criança", "RG e CPF do representante legal", "Comprovante de residência"] },
            { title: "Do Réu (Quem vai pagar)", docs: ["Nome completo e endereço (residencial e de trabalho)", "Estimativa de quanto a pessoa ganha"] },
            { title: "Necessidades", docs: ["Recibos de farmácia, escola, mercado", "Comprovante de gastos especiais (saúde/terapia)"] }
        ]
    },
    "Curatela": {
        title: "Checklist: Curatela (Interdição)",
        sections: [
            { title: "Do Requerente", docs: ["RG e CPF", "Comprovante de residência", "Atestado de bons antecedentes"] },
            { title: "Do Interditando", docs: ["Certidão de Nascimento ou Casamento", "Laudo Médico detalhado com CID", "Informações sobre bens ou aposentadoria/benefício"] }
        ]
    }
};

/**
 * Retorna o HTML formatado do checklist baseado no assunto.
 * Agora com suporte a Checkboxes e a classe checklist-row para feedback visual.
 */
export const getChecklistHTML = (subject) => {
    // Busca inteligente: verifica se o assunto contém a palavra chave
    const key = Object.keys(documentsData).find(k => subject.toLowerCase().includes(k.toLowerCase()));
    const data = documentsData[key];

    if (!data) return `<p class="text-gray-500 text-sm italic p-4 text-center">Nenhum checklist de documentos cadastrado para o assunto: "${subject}".</p>`;

    let html = `<div class="space-y-6 p-2">
                    <h3 class="font-bold text-green-700 border-b-2 border-green-100 pb-2 flex items-center gap-2 text-lg">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        ${data.title}
                    </h3>`;

    data.sections.forEach(section => {
        html += `<div class="mb-4">
                    <h4 class="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-3 flex items-center gap-2">
                        <span class="w-2 h-2 bg-gray-300 rounded-full"></span>
                        ${section.title}
                    </h4>
                    <div class="space-y-2">
                        ${section.docs.map(doc => `
                            <label class="checklist-row flex items-center gap-3 w-full cursor-pointer p-3 bg-white border border-gray-100 rounded-lg shadow-sm hover:shadow-md transition-all">
                                <input type="checkbox" class="w-5 h-5 text-green-600 border-gray-300 rounded focus:ring-green-500 transition-transform active:scale-90">
                                <span class="text-sm text-gray-700 font-medium">${doc}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>`;
    });

    html += `</div>`;
    return html;
};
