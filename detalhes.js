/**
 * detalhes.js
 * Este módulo gerencia toda a funcionalidade do modal "Ver Detalhes",
 * incluindo a exibição da lista de documentos e o checklist.
 */

// --- Dados e Estado do Módulo ---

// Objeto com as informações de documentos para cada tipo de ação
const documentsData = {
    alimentos_fixacao: {
        title: 'Ação de Alimentos (Fixação)',
        sections: [
            { title: 'Do Representante Legal:', docs: ['ID e CPF', 'Comprovante de residência', 'Certidão de nascimento/casamento', 'Comprovante de renda', 'Dados bancários'] },
            { title: 'Do Filho(a):', docs: ['Certidão de Nascimento', 'Comprovantes de despesas (escola, saúde)'] },
            { title: 'Sobre o Réu:', docs: ['Endereço completo', 'Local de trabalho (se souber)'] }
        ]
    },
    alimentos_oferta: {
        title: 'Oferta de Alimentos',
        sections: [
            { title: 'Do Ofertante:', docs: ['ID e CPF', 'Comprovante de residência', 'Comprovante de renda'] },
            { title: 'Do Filho(a):', docs: ['Certidão de Nascimento'] },
            { title: 'Sobre o Representante Legal:', docs: ['Nome e endereço completo', 'Dados bancários (se souber)'] }
        ]
    },
    alimentos_exoneracao: {
        title: 'Exoneração de Alimentos',
        sections: [
            { title: 'Do Requerente (quem paga):', docs: ['ID e CPF', 'Comprovante de residência', 'Sentença que fixou os alimentos'] },
            { title: 'Do Filho(a) (maior de idade):', docs: ['Nome e endereço completo', 'Comprovante de que não estuda mais ou pode se sustentar (se houver)'] }
        ]
    },
    alimentos_revisional: {
        title: 'Revisional de Alimentos',
        sections: [
            { title: 'Do Requerente:', docs: ['ID e CPF', 'Comprovante de residência', 'Sentença que fixou os alimentos', 'Prova da mudança da situação financeira (desemprego, nova prole, etc.)'] },
            { title: 'Da Outra Parte:', docs: ['Nome e endereço completo'] }
        ]
    },
    divorcio_litigioso: {
        title: 'Divórcio Litigioso',
        sections: [
            { title: 'Do Requerente:', docs: ['ID e CPF', 'Comprovante de residência', 'Certidão de Casamento atualizada'] },
            { title: 'Dos Filhos (se houver):', docs: ['Certidão de Nascimento dos filhos'] },
            { title: 'Dos Bens (se houver):', docs: ['Documentos de propriedade de imóveis, veículos, etc.'] },
            { title: 'Do Cônjuge:', docs: ['Endereço completo para citação'] }
        ]
    },
    divorcio_consensual: {
        title: 'Divórcio Consensual',
        sections: [
            { title: 'De Ambos os Cônjuges:', docs: ['ID e CPF de ambos', 'Comprovante de residência de ambos', 'Certidão de Casamento atualizada', 'Pacto antenupcial (se houver)'] },
            { title: 'Acordo:', docs: ['Definição sobre partilha de bens', 'Definição sobre pensão (se houver)', 'Definição sobre guarda dos filhos (se houver)'] }
        ]
    },
    guarda_visitas: {
        title: 'Guarda e Regul. de Visitas',
        sections: [
            { title: 'Do Requerente:', docs: ['ID e CPF', 'Comprovante de residência'] },
            { title: 'Do Filho(a):', docs: ['Certidão de Nascimento'] },
            { title: 'Da Outra Parte:', docs: ['Nome e endereço completo'] }
        ]
    },
    paternidade: {
        title: 'Investigação de Paternidade',
        sections: [
            { title: 'Do Representante Legal:', docs: ['ID e CPF', 'Comprovante de residência'] },
            { title: 'Do Filho(a):', docs: ['Certidão de Nascimento'] },
            { title: 'Do Suposto Pai:', docs: ['Nome e endereço completo', 'Qualquer prova que indique a paternidade (fotos, mensagens, etc.)'] }
        ]
    },
    uniao_estavel: {
        title: 'União Estável (Rec./Diss.)',
        sections: [
            { title: 'De Ambos os Companheiros:', docs: ['ID e CPF de ambos', 'Comprovante de residência'] },
            { title: 'Provas da União:', docs: ['Fotos do casal', 'Declaração de testemunhas', 'Contas conjuntas', 'Filhos em comum (Certidão de Nascimento)'] }
        ]
    }
};

let currentAssistedId = null;
let currentPautaId = null;
let db = null;
let getUpdatePayload = null;
let showNotification = null;
let allAssisted = [];
let currentChecklistAction = null;

// --- Seletores de DOM ---
const modal = document.getElementById('documents-modal');
const assistedNameEl = document.getElementById('documents-assisted-name');
const actionSelectionView = document.getElementById('document-action-selection');
const checklistView = document.getElementById('document-checklist-view');
const checklistContainer = document.getElementById('checklist-container');
const checklistTitle = document.getElementById('checklist-title');
const backToActionSelectionBtn = document.getElementById('back-to-action-selection-btn');
const saveChecklistBtn = document.getElementById('save-checklist-btn');
const checklistSearch = document.getElementById('checklist-search');
const closeBtn = document.getElementById('close-documents-modal-btn');
const cancelBtn = document.getElementById('cancel-checklist-btn');


// --- Funções Internas ---

/**
 * Renderiza a lista de verificação de documentos para uma ação específica.
 * @param {string} actionKey - A chave da ação (ex: 'alimentos_fixacao').
 */
function renderChecklist(actionKey) {
    currentChecklistAction = actionKey;
    const data = documentsData[actionKey];
    if (!data) return;

    const assisted = allAssisted.find(a => a.id === currentAssistedId);
    const savedChecklist = assisted?.documentChecklist;

    checklistTitle.textContent = data.title;
    checklistContainer.innerHTML = '';
    checklistSearch.value = ''; // Limpa a busca

    data.sections.forEach((section, sectionIndex) => {
        const sectionDiv = document.createElement('div');
        const sectionTitleEl = document.createElement('h4');
        sectionTitleEl.className = 'font-bold text-md text-gray-700 mb-2 mt-3 border-b pb-1';
        sectionTitleEl.textContent = section.title;
        sectionDiv.appendChild(sectionTitleEl);

        const list = document.createElement('ul');
        list.className = 'space-y-2';
        section.docs.forEach((docText, docIndex) => {
            const listItem = document.createElement('li');
            const label = document.createElement('label');
            label.className = 'flex items-center text-gray-800 cursor-pointer';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            const checkboxId = `doc-${actionKey}-${sectionIndex}-${docIndex}`;
            checkbox.id = checkboxId;
            checkbox.className = 'h-5 w-5 rounded border-gray-300 text-green-600 focus:ring-green-500 mr-3';
            
            if(savedChecklist && savedChecklist.action === actionKey && savedChecklist.checkedIds?.includes(checkboxId)){
                checkbox.checked = true;
            }

            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(docText));
            listItem.appendChild(label);
            list.appendChild(listItem);
        });
        sectionDiv.appendChild(list);
        checklistContainer.appendChild(sectionDiv);
    });
}

/** Normaliza texto para busca (remove acentos e converte para minúsculas). */
const normalizeText = (str) => {
    if (!str) return '';
    return str.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
};


// --- Manipuladores de Eventos ---

function handleActionSelect(e) {
    const actionButton = e.target.closest('button[data-action]');
    if (!actionButton) return;

    const actionKey = actionButton.dataset.action;
    renderChecklist(actionKey);

    actionSelectionView.classList.add('hidden');
    checklistView.classList.remove('hidden');
    checklistView.classList.add('flex');
}

function handleBack() {
    checklistView.classList.add('hidden');
    checklistView.classList.remove('flex');
    actionSelectionView.classList.remove('hidden');
}

async function handleSave() {
    if (!currentAssistedId || !currentChecklistAction || !db || !currentPautaId) {
        if (showNotification) showNotification("Erro: Faltam dados para salvar.", "error");
        return;
    }

    const checkedCheckboxes = checklistContainer.querySelectorAll('input[type="checkbox"]:checked');
    const checkedIds = Array.from(checkedCheckboxes).map(cb => cb.id);

    const checklistData = {
        action: currentChecklistAction,
        checkedIds: checkedIds
    };

    try {
        const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
        const docRef = doc(db, "pautas", currentPautaId, "attendances", currentAssistedId);
        await updateDoc(docRef, getUpdatePayload({ documentChecklist: checklistData }));
        showNotification("Checklist salvo com sucesso!", "success");
        closeModal();
    } catch (error) {
        console.error("Erro ao salvar o checklist: ", error);
        showNotification("Erro ao salvar o checklist.", "error");
    }
}

function handleSearch(e) {
    const searchTerm = normalizeText(e.target.value);
    const allDocs = checklistContainer.querySelectorAll('li');
    allDocs.forEach(li => {
        const labelText = normalizeText(li.textContent);
        li.style.display = labelText.includes(searchTerm) ? 'block' : 'none';
    });
}

function closeModal() {
    modal.classList.add('hidden');
}


// --- Funções Exportadas ---

/**
 * Configura os listeners de evento para o modal de detalhes.
 * Deve ser chamada uma vez quando a aplicação carrega.
 * @param {object} config - Objeto de configuração com dependências.
 */
export function setupDetailsModal(config) {
    db = config.db;
    getUpdatePayload = config.getUpdatePayload;
    showNotification = config.showNotification;

    actionSelectionView.addEventListener('click', handleActionSelect);
    backToActionSelectionBtn.addEventListener('click', handleBack);
    saveChecklistBtn.addEventListener('click', handleSave);
    checklistSearch.addEventListener('input', handleSearch);
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
}

/**
 * Abre o modal de detalhes para um assistido específico.
 * @param {object} config - Objeto de configuração com os dados da pauta atual.
 */
export function openDetailsModal(config) {
    currentAssistedId = config.assistedId;
    currentPautaId = config.pautaId;
    allAssisted = config.allAssisted;

    const assisted = allAssisted.find(a => a.id === currentAssistedId);
    if (!assisted) {
        console.error("Assistido não encontrado para abrir detalhes.");
        if (showNotification) showNotification("Erro: assistido não encontrado.", "error");
        return;
    }

    assistedNameEl.textContent = assisted.name;
    handleBack(); // Reseta para a visão de seleção de ação
    modal.classList.remove('hidden');
}
