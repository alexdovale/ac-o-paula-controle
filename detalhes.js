/**
 * detalhes.js
 * Este módulo gerencia toda a funcionalidade do modal "Ver Detalhes",
 * incluindo a exibição da lista de documentos, o checklist e a geração de PDF.
 */

// --- Dados e Estado do Módulo ---

// Objeto com as informações de documentos para cada tipo de ação
const documentsData = {
    // --- II. PROCESSOS CÍVEIS (Gerais) ---
    obrigacao_fazer: {
        title: 'Ação de Obrigação de Fazer',
        sections: [
            { title: 'Documentação Comum (Requerente)', docs: ['Carteira de Identidade (RG)', 'CPF', 'Comprovante de Residência (com declaração, se em nome de terceiros)', 'Carteira de Trabalho', 'Contracheques (3 últimos meses)', 'Extrato bancário (3 últimos meses)', 'Última Declaração de IR', 'Declaração de Hipossuficiência', 'Comprovante Bolsa Família/LOAS (se houver)'] },
            { title: 'Documentos Específicos do Caso', docs: ['Documentos que comprovem a obrigação (contrato, acordo, etc.)', 'Provas do descumprimento (e-mails, protocolos, fotos, etc.)', 'Se contra concessionária de serviço público: Faturas, protocolos de reclamação.'] }
        ]
    },
    declaratoria_nulidade: {
        title: 'Ação Declaratória de Nulidade',
        sections: [
            { title: 'Documentação Comum (Requerente)', docs: ['Carteira de Identidade (RG)', 'CPF', 'Comprovante de Residência (com declaração, se em nome de terceiros)', 'Carteira de Trabalho', 'Contracheques (3 últimos meses)', 'Extrato bancário (3 últimos meses)', 'Última Declaração de IR', 'Declaração de Hipossuficiência', 'Comprovante Bolsa Família/LOAS (se houver)'] },
            { title: 'Documentos Específicos do Caso', docs: ['Documento ou ato jurídico a ser anulado (contrato, cobrança, multa)', 'Provas da ilegalidade ou abusividade (jurisprudências, extratos)', 'Se contra concessionária (ex: TOI da LIGHT): Cópia do TOI, histórico de consumo.'] }
        ]
    },
    indenizacao_danos: {
        title: 'Ação de Indenização (Danos Morais e Materiais)',
        sections: [
            { title: 'Documentação Comum (Requerente)', docs: ['Carteira de Identidade (RG)', 'CPF', 'Comprovante de Residência (com declaração, se em nome de terceiros)', 'Carteira de Trabalho', 'Contracheques (3 últimos meses)', 'Extrato bancário (3 últimos meses)', 'Última Declaração de IR', 'Declaração de Hipossuficiência', 'Comprovante Bolsa Família/LOAS (se houver)'] },
            { title: 'Documentos Específicos do Caso', docs: ['Provas do evento danoso (boletim de ocorrência, fotos, vídeos)', 'Provas dos danos materiais (notas fiscais, orçamentos, recibos)', 'Provas dos danos morais (laudos psicológicos, atestados, testemunhas)', 'Se contra concessionária: Protocolos, notas de aparelhos queimados.'] }
        ]
    },
    revisional_debito: {
        title: 'Ação Revisional de Débito',
        sections: [
            { title: 'Documentação Comum (Requerente)', docs: ['Carteira de Identidade (RG)', 'CPF', 'Comprovante de Residência (com declaração, se em nome de terceiros)', 'Carteira de Trabalho', 'Contracheques (3 últimos meses)', 'Extrato bancário (3 últimos meses)', 'Última Declaração de IR', 'Declaração de Hipossuficiência', 'Comprovante Bolsa Família/LOAS (se houver)'] },
            { title: 'Documentos Específicos do Caso', docs: ['Contrato ou documento que originou o débito', 'Faturas, extratos ou planilhas do débito', 'Provas de que os valores são indevidos (histórico de consumo, cálculos)', 'Se contra concessionária: Histórico de consumo, protocolos de reclamação.'] }
        ]
    },
    exigir_contas: {
        title: 'Ação de Exigir Contas',
        sections: [
            { title: 'Documentação Comum (Requerente)', docs: ['Carteira de Identidade (RG)', 'CPF', 'Comprovante de Residência (com declaração, se em nome de terceiros)', 'Carteira de Trabalho', 'Contracheques (3 últimos meses)', 'Extrato bancário (3 últimos meses)', 'Última Declaração de IR', 'Declaração de Hipossuficiência', 'Comprovante Bolsa Família/LOAS (se houver)'] },
            { title: 'Documentos Específicos do Caso', docs: ['Documento que comprove a relação de administração/gestão (termo de curatela, contrato)', 'Documentos que indiquem a movimentação de valores (extratos)', 'Provas da recusa em prestar contas ou suspeita de irregularidades.'] }
        ]
    },

    // --- III. PROCESSOS DE FAMÍLIA ---
    alimentos_fixacao_majoracao_oferta: {
        title: 'Alimentos (Fixação / Majoração / Oferta)',
        sections: [
            { title: 'Documentação Comum (Requerente)', docs: ['Carteira de Identidade (RG)', 'CPF', 'Comprovante de Residência (com declaração, se em nome de terceiros)', 'Carteira de Trabalho', 'Contracheques (3 últimos meses)', 'Extrato bancário (3 últimos meses)', 'Última Declaração de IR', 'Declaração de Hipossuficiência', 'Comprovante Bolsa Família/LOAS (se houver)'] },
            { title: 'Documentos do Filho(a)/Alimentando(a)', docs: ['Certidão de Nascimento', 'Comprovantes de despesas (matrícula, escola, saúde, remédios)', 'Laudos de necessidades especiais (se aplicável)'] },
            { title: 'Sobre o Réu (Alimentante)', docs: ['Endereço do(a) alimentante', 'Nome e endereço do trabalho do(a) alimentante (se souber)', 'Dados da(o) empregador(a) da parte ré (CNPJ, se possível)', 'Contracheque(s), extrato bancário ou IR do(a) alimentante (se conseguir)'] },
            { title: 'Para Depósito', docs: ['Dados bancários do(a) representante legal (para depósito da pensão)'] }
        ]
    },
    // ... (restante do objeto `documentsData` permanece o mesmo)
    alvara_viagem_menor: {
        title: 'Alvará para Autorização de Viagem de Menor ao Exterior',
        sections: [
            { title: 'Documentação Comum (Requerente)', docs: ['Carteira de Identidade (RG)', 'CPF', 'Comprovante de Residência'] },
            { title: 'Documentos do Menor e da Viagem', docs: ['Certidão de Nascimento do(a) menor', 'Passaporte do(a) menor (se já existir)', 'Informações sobre a viagem (datas, destino, motivo)', 'Endereço do(a) genitor(a) que não autoriza (para citação)', 'Provas do benefício da viagem para o menor', 'Provas da impossibilidade de obter o consentimento do outro genitor'] }
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
const actionSearchInput = document.getElementById('action-search-input');
const actionButtonsContainer = document.getElementById('action-buttons-container');
const checklistView = document.getElementById('document-checklist-view');
const checklistContainer = document.getElementById('checklist-container');
const checklistTitle = document.getElementById('checklist-title');
const backToActionSelectionBtn = document.getElementById('back-to-action-selection-btn');
const saveChecklistBtn = document.getElementById('save-checklist-btn');
const pdfChecklistBtn = document.getElementById('pdf-checklist-btn');
const checklistSearch = document.getElementById('checklist-search');
const closeBtn = document.getElementById('close-documents-modal-btn');
const cancelBtn = document.getElementById('cancel-checklist-btn');


// --- Funções Internas ---

/**
 * Preenche a área de seleção de ações com botões gerados dinamicamente
 * a partir do objeto documentsData.
 */
function populateActionSelection() {
    if (!actionButtonsContainer) return;

    // Evita recriar os botões se eles já existirem.
    if (actionButtonsContainer.hasChildNodes()) {
        return;
    }

    Object.keys(documentsData).forEach((actionKey, index) => {
        const actionData = documentsData[actionKey];
        const button = document.createElement('button');
        button.dataset.action = actionKey;
        button.className = 'w-full text-left p-3 bg-gray-50 hover:bg-gray-100 rounded-lg border transition';

        const span = document.createElement('span');
        span.className = 'font-semibold text-gray-800';
        span.textContent = `${index + 1}. ${actionData.title}`;

        button.appendChild(span);
        actionButtonsContainer.appendChild(button);
    });
}


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
    checklistSearch.value = '';

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
    if (actionSearchInput) {
        actionSearchInput.value = '';
        actionSearchInput.dispatchEvent(new Event('input'));
    }
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
    
    // Simulação para o exemplo local
    try {
        if (db.pautas[currentPautaId].attendances[currentAssistedId]) {
             db.pautas[currentPautaId].attendances[currentAssistedId].documentChecklist = checklistData;
             showNotification("Checklist salvo com sucesso!", "success");
             console.log("Estado atual do DB Mockado:", db);
             closeModal();
        } else {
            throw new Error("Assistido não encontrado no DB Mockado");
        }
    } catch (error) {
         console.error("Erro ao salvar o checklist (simulado): ", error);
         showNotification("Erro ao salvar o checklist.", "error");
    }

    /*
    // CÓDIGO ORIGINAL PARA FIREBASE (manter se for usar com Firebase)
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
    */
}

function handleSearch(e) {
    const searchTerm = normalizeText(e.target.value);
    const allDocs = checklistContainer.querySelectorAll('li');
    allDocs.forEach(li => {
        const labelText = normalizeText(li.textContent);
        li.style.display = labelText.includes(searchTerm) ? 'block' : 'none';
    });
}

function handleActionSearch(e) {
    const searchTerm = normalizeText(e.target.value);
    const allActions = actionButtonsContainer.querySelectorAll('button[data-action]');
    allActions.forEach(btn => {
        const actionText = normalizeText(btn.textContent);
        btn.style.display = actionText.includes(searchTerm) ? 'block' : 'none';
    });
}

/**
 * **NOVA FUNÇÃO**
 * Gera um PDF do checklist atual.
 * Requer as bibliotecas jsPDF e html2canvas.
 */
async function handleGeneratePdf() {
    if (!currentChecklistAction) {
        showNotification("Nenhuma ação selecionada para gerar PDF.", "warning");
        return;
    }

    const { jsPDF } = window.jspdf;
    const button = pdfChecklistBtn;
    const originalButtonText = button.innerHTML;

    try {
        // Mostra estado de carregamento
        button.disabled = true;
        button.innerHTML = `
            <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Gerando...
        `;

        const doc = new jsPDF({
            orientation: 'p',
            unit: 'mm',
            format: 'a4'
        });

        const assistedName = assistedNameEl.textContent;
        const actionTitle = checklistTitle.textContent;

        const canvas = await html2canvas(checklistContainer, {
            scale: 2, // Melhora a qualidade da imagem
            useCORS: true
        });

        const imgData = canvas.toDataURL('image/png');
        const imgProps = doc.getImageProperties(imgData);
        const pdfWidth = doc.internal.pageSize.getWidth();
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
        
        let position = 0;
        const pageMargin = 15;
        let heightLeft = pdfHeight;
        
        // Adiciona cabeçalho
        doc.setFontSize(18);
        doc.text("Checklist de Documentos", pdfWidth / 2, pageMargin, { align: 'center' });
        doc.setFontSize(12);
        doc.text(`Assistido(a): ${assistedName}`, pageMargin, pageMargin + 10);
        doc.text(`Ação: ${actionTitle}`, pageMargin, pageMargin + 16);
        
        // Posição inicial da imagem do checklist
        position = pageMargin + 25;
        
        doc.addImage(imgData, 'PNG', pageMargin, position, pdfWidth - (pageMargin * 2), pdfHeight);
        heightLeft -= doc.internal.pageSize.getHeight();

        while (heightLeft >= 0) {
            position = heightLeft - pdfHeight;
            doc.addPage();
            doc.addImage(imgData, 'PNG', pageMargin, position, pdfWidth - (pageMargin * 2), pdfHeight);
            heightLeft -= doc.internal.pageSize.getHeight();
        }

        const fileName = `Checklist_${assistedName.replace(/\s/g, '_')}_${actionTitle.replace(/\s/g, '_')}.pdf`;
        doc.save(fileName);

    } catch (error) {
        console.error("Erro ao gerar PDF:", error);
        showNotification("Ocorreu um erro ao gerar o PDF.", "error");
    } finally {
        // Restaura o botão
        button.disabled = false;
        button.innerHTML = originalButtonText;
    }
}

function closeModal() {
    modal.classList.add('hidden');
}


// --- Funções Exportadas ---

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
    
    if (actionSearchInput) actionSearchInput.addEventListener('input', handleActionSearch);
    if (pdfChecklistBtn) pdfChecklistBtn.addEventListener('click', handleGeneratePdf);
}

export function openDetailsModal(config) {
    // Garante que os botões de ação sejam criados apenas uma vez.
    populateActionSelection();
    
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
    
    // Mostra o checklist salvo, se existir, ou a tela de seleção.
    if (assisted.documentChecklist && assisted.documentChecklist.action) {
        const savedAction = assisted.documentChecklist.action;
        renderChecklist(savedAction);
        actionSelectionView.classList.add('hidden');
        checklistView.classList.remove('hidden');
        checklistView.classList.add('flex');
    } else {
        handleBack(); 
    }
    
    modal.classList.remove('hidden');
}
