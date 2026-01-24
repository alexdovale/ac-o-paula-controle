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
 */
export const getChecklistHTML = (subject) => {
    // Busca inteligente: verifica se o assunto contém a palavra chave (ex: "Alimentos" em "Ação de Alimentos")
    const key = Object.keys(documentsData).find(k => subject.toLowerCase().includes(k.toLowerCase()));
    const data = documentsData[key];

    if (!data) return `<p class="text-gray-500 text-sm italic p-4">Nenhum checklist de documentos cadastrado para o assunto: "${subject}".</p>`;

    let html = `<div class="space-y-4 p-2">
                    <h3 class="font-bold text-green-700 border-b pb-2 flex items-center gap-2">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        ${data.title}
                    </h3>`;

    data.sections.forEach(section => {
        html += `<div>
                    <h4 class="text-xs font-bold uppercase text-gray-500 tracking-wider mb-2">${section.title}</h4>
                    <ul class="space-y-1">
                        ${section.docs.map(doc => `
                            <li class="flex items-start text-sm text-gray-700">
                                <span class="text-green-500 mr-2">•</span> ${doc}
                            </li>
                        `).join('')}
                    </ul>
                </div>`;
    });

    html += `</div>`;
    return html;
};
