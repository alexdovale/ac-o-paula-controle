// js/checklist.js

export const documentsData = {
    "Divórcio": {
        title: "Checklist: Divórcio",
        sections: [
            { title: "Pessoais", docs: ["RG e CPF", "Comprovante de residência", "Contracheque/Renda"] },
            { title: "Casamento/Filhos", docs: ["Certidão de Casamento", "Certidão de Nascimento dos filhos"] },
            { title: "Bens", docs: ["Documento de Veículos", "Escritura de Imóveis"] }
        ]
    },
    "Alimentos": {
        title: "Checklist: Pensão Alimentícia",
        sections: [
            { title: "Criança", docs: ["Certidão de Nascimento", "Lista de gastos mensais"] },
            { title: "Representante", docs: ["RG/CPF", "Endereço do Réu (Pai/Mãe)"] }
        ]
    }
};

export const getChecklistHTML = (subject) => {
    const key = Object.keys(documentsData).find(k => subject.toLowerCase().includes(k.toLowerCase()));
    const data = documentsData[key];
    if (!data) return `<p class="p-4 text-gray-400 italic">Nenhum checklist cadastrado para: ${subject}</p>`;

    let html = `<div class="space-y-4">`;
    data.sections.forEach(sec => {
        html += `<div><h4 class="font-bold text-gray-700 border-b mb-2">${sec.title}</h4><ul class="space-y-1">`;
        sec.docs.forEach(doc => {
            html += `<li class="flex items-center text-sm text-gray-600"><input type="checkbox" class="mr-2"> ${doc}</li>`;
        });
        html += `</ul></div>`;
    });
    return html + `</div>`;
};
