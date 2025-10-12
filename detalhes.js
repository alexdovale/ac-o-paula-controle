/**
 * detalhes.js
 * Este módulo gerencia toda a funcionalidade do modal "Ver Detalhes",
 * incluindo a exibição da lista de documentos e o checklist.
 * 
 * Agora com PDF aprimorado: layout profissional, ícones visuais e coluna de observações.
 */

// --- Dados e Estado do Módulo ---
const documentsData = { 
    divorcio_litigioso: {
        title: 'Divórcio Litigioso',
        sections: [
            { title: 'Documentação Comum (Requerente)', docs: [
                'Carteira de Identidade (RG)',
                'CPF',
                'Comprovante de Residência',
                'Certidão de Casamento (atualizada)',
                'Declaração de Hipossuficiência'
            ] },
            { title: 'Sobre o Outro Cônjuge (Réu)', docs: [
                'Endereço do(a) outro(a) cônjuge (réu)'
            ] },
            { title: 'Bens e Filhos (se houver)', docs: [
                'Documentos dos bens (imóveis, veículos, contas) e seus valores',
                'Certidão de Nascimento/Casamento dos filhos',
                'Comprovantes de despesas dos filhos',
                'Informações de renda do réu (para alimentos)',
                'Se há imóvel MCMV: Documentação do imóvel',
                'Se há cotas sociais (empresa): Contrato social, documentos da empresa'
            ] }
        ]
    }
};

// --- Variáveis globais ---
let currentAssistedId = null;
let currentPautaId = null;
let db = null;
let getUpdatePayload = null;
let showNotification = null;
let allAssisted = [];
let currentChecklistAction = null;

// --- Seletores DOM ---
const modal = document.getElementById('documents-modal');
const assistedNameEl = document.getElementById('documents-assisted-name');
const actionSelectionView = document.getElementById('document-action-selection');
const checklistView = document.getElementById('document-checklist-view');
const checklistContainer = document.getElementById('checklist-container');
const checklistTitle = document.getElementById('checklist-title');
const backToActionSelectionBtn = document.getElementById('back-to-action-selection-btn');
const saveChecklistBtn = document.getElementById('save-checklist-btn');
const printChecklistBtn = document.getElementById('print-checklist-btn');
const checklistSearch = document.getElementById('checklist-search');
const closeBtn = document.getElementById('close-documents-modal-btn');
const cancelBtn = document.getElementById('cancel-checklist-btn');

// --- Funções internas ---
function populateActionSelection() {
    const container = document.getElementById('document-action-selection');
    if (!container) return;

    if (!container.querySelector('#action-search-input')) {
        const searchInput = document.createElement('input');
        searchInput.id = 'action-search-input';
        searchInput.type = 'text';
        searchInput.placeholder = 'Pesquisar por assunto...';
        searchInput.className = 'w-full p-2 border border-gray-300 rounded-md mb-4 focus:ring-blue-500 focus:border-blue-500';
        searchInput.addEventListener('input', handleActionSearch);
        container.prepend(searchInput);
    }

    if (container.querySelector('.action-grid-container')) return;

    const instruction = document.createElement('p');
    instruction.className = 'text-gray-600 mb-4';
    instruction.textContent = 'Selecione o tipo de ação para ver a lista de documentos necessários:';

    const gridContainer = document.createElement('div');
    gridContainer.className = 'grid grid-cols-1 md:grid-cols-2 gap-3 action-grid-container';

    Object.keys(documentsData).forEach((actionKey, index) => {
        const actionData = documentsData[actionKey];
        const button = document.createElement('button');
        button.dataset.action = actionKey;
        button.className = 'w-full text-left p-3 bg-gray-50 hover:bg-gray-100 rounded-lg border transition';
        const span = document.createElement('span');
        span.className = 'font-semibold text-gray-800';
        span.textContent = `${index + 1}. ${actionData.title}`;
        button.appendChild(span);
        gridContainer.appendChild(button);
    });

    container.appendChild(instruction);
    container.appendChild(gridContainer);
}

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

const normalizeText = (str) => str?.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() || "";

// --- Eventos ---
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
    const searchInput = document.getElementById('action-search-input');
    if (searchInput) {
        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input'));
    }
}

function handleSearch(e) {
    const searchTerm = normalizeText(e.target.value);
    checklistContainer.querySelectorAll('li').forEach(li => {
        li.style.display = normalizeText(li.textContent).includes(searchTerm) ? 'block' : 'none';
    });
}

function handleActionSearch(e) {
    const searchTerm = normalizeText(e.target.value);
    actionSelectionView.querySelectorAll('.action-grid-container button[data-action]').forEach(btn => {
        btn.style.display = normalizeText(btn.textContent).includes(searchTerm) ? 'block' : 'none';
    });
}

function loadScript(src) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) return resolve();
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Falha ao carregar: ${src}`));
        document.head.appendChild(script);
    });
}

// --- NOVO PDF APRIMORADO ---
async function handleGeneratePdf() {
    if (printChecklistBtn) {
        printChecklistBtn.disabled = true;
        printChecklistBtn.textContent = 'Gerando PDF...';
    }

    try {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

        const title = checklistTitle.textContent;
        const assistedName = assistedNameEl.textContent;
        const data = documentsData[currentChecklistAction];
        const checkedIds = Array.from(checklistContainer.querySelectorAll('input:checked')).map(cb => cb.id);

        const margin = 50;
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        let y = margin;

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(20);
        pdf.setTextColor(0, 82, 136);
        pdf.text('CHECKLIST DE DOCUMENTOS', margin, y);
        y += 30;

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(12);
        pdf.setTextColor(0);
        pdf.text(`Assistido(a): ${assistedName}`, margin, y);
        y += 18;
        pdf.text(`Assunto: ${title}`, margin, y);
        y += 25;

        pdf.setDrawColor(0, 82, 136);
        pdf.setLineWidth(0.5);
        pdf.line(margin, y, pageWidth - margin, y);
        y += 20;

        const checkPageBreak = (extra = 0) => {
            if (y + extra > pageHeight - margin) {
                pdf.addPage();
                y = margin;
            }
        };

        data.sections.forEach((section, sectionIndex) => {
            checkPageBreak(60);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(14);
            pdf.setTextColor(0, 82, 136);
            pdf.text(section.title, margin, y);
            y += 10;

            pdf.setDrawColor(200);
            pdf.line(margin, y, pageWidth - margin, y);
            y += 15;

            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(11);
            pdf.setTextColor(40);

            // Cabeçalho da tabela
            pdf.setFont('helvetica', 'bold');
            pdf.text('Item', margin + 15, y);
            pdf.text('Observações', pageWidth - 220, y);
            y += 10;
            pdf.setFont('helvetica', 'normal');

            section.docs.forEach((docText, docIndex) => {
                const checkboxId = `doc-${currentChecklistAction}-${sectionIndex}-${docIndex}`;
                const isChecked = checkedIds.includes(checkboxId);
                const symbol = isChecked ? '☑' : '☐';
                const fullText = `${symbol} ${docText}`;
                const splitText = pdf.splitTextToSize(fullText, 300);

                splitText.forEach(line => {
                    checkPageBreak(20);
                    pdf.text(line, margin + 15, y);
                    pdf.rect(pageWidth - 230, y - 10, 180, 18); // campo de observação
                    y += 18;
                });
            });

            y += 10;
            pdf.setDrawColor(220);
            pdf.line(margin, y, pageWidth - margin, y);
            y += 20;
        });

        checkPageBreak(50);
        pdf.setFontSize(10);
        pdf.setTextColor(120);
        pdf.text(
            'Documento gerado automaticamente pelo sistema SIGAP - Coordenação de Gestão Documental (DPGERJ)',
            margin,
            pageHeight - margin
        );

        pdf.save(`Checklist - ${assistedName} - ${title}.pdf`);
    } catch (error) {
        console.error("Erro ao gerar PDF:", error);
        if (showNotification) showNotification("Não foi possível gerar o PDF.", "error");
    } finally {
        if (printChecklistBtn) {
            printChecklistBtn.disabled = false;
            printChecklistBtn.textContent = 'Baixar PDF';
        }
    }
}

// --- Exportações ---
export function setupDetailsModal(config) {
    db = config.db;
    getUpdatePayload = config.getUpdatePayload;
    showNotification = config.showNotification;

    actionSelectionView.addEventListener('click', handleActionSelect);
    backToActionSelectionBtn.addEventListener('click', handleBack);
    saveChecklistBtn.addEventListener('click', () => showNotification("Checklist salvo localmente (exemplo).", "info"));
    checklistSearch.addEventListener('input', handleSearch);
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    if (printChecklistBtn) printChecklistBtn.addEventListener('click', handleGeneratePdf);
}

export function openDetailsModal(config) {
    populateActionSelection();
    currentAssistedId = config.assistedId;
    currentPautaId = config.pautaId;
    allAssisted = config.allAssisted;

    const assisted = allAssisted.find(a => a.id === currentAssistedId);
    assistedNameEl.textContent = assisted?.name || 'Assistido não identificado';

    if (assisted?.documentChecklist?.action) {
        renderChecklist(assisted.documentChecklist.action);
        actionSelectionView.classList.add('hidden');
        checklistView.classList.remove('hidden');
        checklistView.classList.add('flex');
    } else handleBack();
    modal.classList.remove('hidden');
}

function closeModal() {
    modal.classList.add('hidden');
}
