// js/checklist.js

export const documentsData = {
    "Divórcio Consensual": {
        title: "Checklist: Divórcio Consensual",
        sections: [
            { title: "Documentos dos Cônjuges", docs: ["RG e CPF", "Comprovante de residência", "Comprovante de renda (CTPS, contracheque)"] },
            { title: "Documentos do Casamento", docs: ["Certidão de Casamento (atualizada 90 dias)", "Pacto Antenupcial (se houver)"] },
            { title: "Filhos e Bens", docs: ["Certidão de Nascimento dos filhos", "Documentos de veículos (CRLV)", "Escritura ou RGI de imóveis", "Extratos bancários"] }
        ]
    },
    "Ação de Alimentos": {
        title: "Checklist: Fixação de Alimentos",
        sections: [
            { title: "Do Requerente", docs: ["RG e CPF", "Comprovante de residência", "Certidão de Nascimento da criança"] },
            { title: "Do Réu (Pai/Mãe)", docs: ["Nome completo", "Endereço residencial e comercial", "Número de telefone (se tiver)"] },
            { title: "Necessidades", docs: ["Recibos de farmácia, escola, aluguel", "Lista de gastos mensais da criança"] }
        ]
    },
    "Curatela": {
        title: "Checklist: Curatela (Interdição)",
        sections: [
            { title: "Do Requerente", docs: ["RG, CPF e residência", "Atestado de bons antecedentes"] },
            { title: "Do Interditando (Idoso/Enfermo)", docs: ["Certidão de Nascimento ou Casamento", "Laudo médico detalhado com CID", "Informações sobre bens e aposentadoria"] }
        ]
    }
    // Você pode adicionar mais conforme a demanda do seu cartório/núcleo
};

export const getChecklistHTML = (subject) => {
    // Tenta achar pelo nome exato ou parte dele
    const key = Object.keys(documentsData).find(k => subject.includes(k));
    const data = documentsData[key];

    if (!data) return `<p class="text-gray-500">Nenhum checklist específico cadastrado para este assunto.</p>`;

    let html = `<div class="space-y-4">`;
    data.sections.forEach(section => {
        html += `<div><h4 class="font-bold text-gray-700 border-b">${section.title}</h4><ul class="list-disc ml-5 text-sm">`;
        section.docs.forEach(doc => html += `<li class="py-1">${doc}</li>`);
        html += `</ul></div>`;
    });
    html += `</div>`;
    return html;
};
