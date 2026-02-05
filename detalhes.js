/**
 * detalhes.js - SIGAP
 * Versão Ultra-Robusta (Previne erros de null / classList)
 */

import { doc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- 1. BASE DE DADOS INTEGRAL ---
export const documentsData = {
    obrigacao_fazer: { title: 'Obrigação de Fazer', sections: [{ title: 'Documentos Base', docs: ['RG e CPF', 'Comprovante Residência', 'Comprovante Renda'] }, { title: 'SOBRE O RÉU', docs: ['Endereço completo', 'Dados de trabalho'] }] },
    indenizacao_danos: { title: 'Ação de Indenização', sections: [{ title: 'Documentos Base', docs: ['RG e CPF', 'Comprovante Residência', 'Comprovante Renda'] }, { title: 'SOBRE O RÉU', docs: ['Endereço completo', 'Dados de trabalho'] }] },
    alimentos_fixacao_majoracao_oferta: { title: 'Alimentos (Fixação/Majoração)', sections: [{ title: 'Documentos Base', docs: ['RG e CPF', 'Comprovante Residência', 'Comprovante Renda'] }, { title: 'Do Alimentando', docs: ['Certidão de Nascimento'] }, { title: 'SOBRE O RÉU', docs: ['Endereço completo', 'Dados de trabalho'] }] },
    divorcio_consensual: { title: 'Divórcio Consensual', sections: [{ title: 'Documentação (Ambos)', docs: ['Certidão Casamento', 'RG/CPF ambos'] }, { title: 'Filhos/Bens', docs: ['Certidão Nascimento Filhos', 'Documentos de Bens'] }] },
    divorcio_litigioso: { title: 'Divórcio Litigioso', sections: [{ title: 'Documentação', docs: ['Certidão Casamento', 'RG/CPF'] }, { title: 'SOBRE O RÉU', docs: ['Endereço completo', 'Dados de trabalho'] }] },
    curatela: { title: 'Curatela (Interdição)', sections: [{ title: 'Curador', docs: ['RG/CPF'] }, { title: 'Curatelando', docs: ['RG/CPF Curatelando', 'Laudo Médico (CID)'] }] },
    retificacao_registro_civil: { title: 'Retificação Registro Civil', sections: [{ title: 'Documentos Base', docs: ['RG e CPF', 'Certidão a retificar', 'Provas do erro'] }] }
};

const EXPENSE_CATEGORIES = [
    { id: 'moradia', label: '1. MORADIA' }, { id: 'alimentacao', label: '2. ALIMENTAÇÃO' },
    { id: 'educacao', label: '3. EDUCAÇÃO' }, { id: 'saude', label: '4. SAÚDE' },
    { id: 'vestuario', label: '5. VESTUÁRIO' }, { id: 'lazer', label: '6. LAZER' }, { id: 'outras', label: '7. OUTRAS' }
];

// --- 2. ESTADO GLOBAL ---
let currentAssistedId = null, currentPautaId = null, db = null, showNotification = null, allAssisted = [], currentChecklistAction = null;

// Função de segurança para capturar elementos sem dar erro de 'null'
const getEl = (id) => document.getElementById(id);

// --- 3. UTILITÁRIOS ---
const normalizeLocal = (str) => str ? str.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : '';
const formatCurrency = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const parseCurrency = (s) => !s ? 0 : parseFloat(s.replace(/[^\d,]/g, '').replace(',', '.')) || 0;

async function updateVisualStatus(state, actionTitle = null) {
    if (!currentAssistedId || !currentPautaId) return;
    const docRef = doc(db, "pautas", currentPautaId, "attendances", currentAssistedId);
    const updateData = { documentState: state };
    if (state === null) { updateData.selectedAction = null; updateData.documentState = null; }
    else if (actionTitle) { updateData.selectedAction = actionTitle; }
    try { await updateDoc(docRef, updateData); } catch(e) { console.error("Erro status visual:", e); }
}

// --- 4. NAVEGAÇÃO ---
function handleBack() {
    const view = getEl('document-checklist-view');
    const header = getEl('document-checklist-view-header');
    const search = getEl('checklist-search-container');
    const selection = getEl('document-action-selection');

    if (view) view.classList.add('hidden');
    if (header) header.classList.add('hidden');
    if (search) search.classList.add('hidden');
    if (selection) selection.classList.remove('hidden');
}

// --- 5. RENDERIZAÇÃO ---
function renderChecklist(actionKey) {
    currentChecklistAction = actionKey;
    const data = documentsData[actionKey];
    if (!data) return;

    const assisted = allAssisted.find(a => a.id === currentAssistedId);
    const saved = assisted?.documentChecklist;

    const titleEl = getEl('checklist-title');
    const containerEl = getEl('checklist-container');
    const headerEl = getEl('document-checklist-view-header');
    const searchEl = getEl('checklist-search-container');

    if (titleEl) titleEl.textContent = data.title;
    if (headerEl) headerEl.classList.remove('hidden');
    if (searchEl) searchEl.classList.remove('hidden');
    if (containerEl) containerEl.innerHTML = '';

    data.sections.forEach((section, sIdx) => {
        const sectionDiv = document.createElement('div');
        sectionDiv.className = "mb-6";
        sectionDiv.innerHTML = `<h4 class="font-bold text-gray-700 mb-3 border-b pb-1 uppercase text-[10px] tracking-widest">${section.title}</h4>`;
        const ul = document.createElement('ul');
        ul.className = 'space-y-1';

        section.docs.forEach((docItem, dIdx) => {
            const li = document.createElement('li');
            const docText = typeof docItem === 'string' ? docItem : docItem.text;
            const id = `doc-${actionKey}-${sIdx}-${dIdx}`;
            const isChecked = saved?.checkedIds?.includes(id) ? 'checked' : '';
            const savedType = saved?.docTypes ? saved.docTypes[id] : '';

            li.innerHTML = `
                <div class="flex flex-col border-b border-gray-50 pb-1">
                    <label class="checklist-row flex items-center gap-3 w-full cursor-pointer p-2 rounded-lg transition-all hover:bg-gray-50">
                        <input type="checkbox" id="${id}" class="doc-checkbox h-5 w-5 text-green-600 rounded border-gray-300" ${isChecked}>
                        <span class="text-sm text-gray-700 font-medium">${docText}</span>
                    </label>
                    <div id="type-${id}" class="ml-10 mt-1 flex gap-4 ${isChecked ? '' : 'hidden'}">
                        <label class="text-[10px] text-gray-500 cursor-pointer"><input type="radio" name="type-${id}" value="Físico" ${savedType === 'Físico' ? 'checked' : ''}> FÍSICO</label>
                        <label class="text-[10px] text-gray-500 cursor-pointer"><input type="radio" name="type-${id}" value="Digital" ${savedType === 'Digital' ? 'checked' : ''}> DIGITAL</label>
                    </div>
                </div>`;
            ul.appendChild(li);
        });
        sectionDiv.appendChild(ul);
        if (containerEl) containerEl.appendChild(sectionDiv);
    });

    const checkReuVisibility = () => {
        const checkedLabels = Array.from(document.querySelectorAll('.doc-checkbox:checked')).map(cb => cb.closest('label').textContent);
        const needsReu = checkedLabels.some(txt => txt.includes('Endereço') || txt.includes('Trabalho'));
        const reuContainer = getEl('address-editor-container');
        if (reuContainer) reuContainer.classList.toggle('hidden', !needsReu);
    };

    document.querySelectorAll('.doc-checkbox').forEach(cb => {
        cb.onchange = (e) => {
            const t = getEl(`type-${e.target.id}`);
            if (t) t.classList.toggle('hidden', !e.target.checked);
            checkReuVisibility();
            if (containerEl) containerEl.dispatchEvent(new Event('change', { bubbles: true }));
            updateVisualStatus('filling');
        };
    });

    if (saved?.reuData) fillReuData(saved.reuData);
    checkReuVisibility();
}

// --- 6. FORMULÁRIO RÉU (CEP) ---
function fillReuData(d) {
    const s = (id, v) => { const el = getEl(id); if (el) el.value = v || ''; };
    s('nome-reu', d.nome); s('cep-reu', d.cep); s('rua-reu', d.rua); s('bairro-reu', d.bairro);
}

// --- 7. SALVAMENTO E PDF ---
async function handleSave() {
    if (!currentAssistedId) return;
    const container = getEl('checklist-container');
    if (!container) return;

    const checkedIds = Array.from(container.querySelectorAll('.doc-checkbox:checked')).map(cb => cb.id);
    const docTypes = {};
    checkedIds.forEach(id => { docTypes[id] = document.querySelector(`input[name="type-${id}"]:checked`)?.value || 'Físico'; });

    const payload = {
        documentChecklist: {
            action: currentChecklistAction,
            checkedIds, docTypes,
            reuData: { nome: getEl('nome-reu')?.value || '', cep: getEl('cep-reu')?.value || '' }
        },
        documentState: 'saved'
    };

    await updateDoc(doc(db, "pautas", currentPautaId, "attendances", currentAssistedId), payload);
    if (showNotification) showNotification("Salvo!");
    if (getEl('documents-modal')) getEl('documents-modal').classList.add('hidden');
}

async function handlePdf() {
    await updateVisualStatus('pdf');
    const { jsPDF } = window.jspdf;
    const docPDF = new jsPDF();
    docPDF.text("Checklist SIGAP", 10, 10);
    docPDF.save("Checklist.pdf");
}

async function handleReset() {
    if (!confirm("Resetar seleção?")) return;
    await updateVisualStatus(null);
    await updateDoc(doc(db, "pautas", currentPautaId, "attendances", currentAssistedId), { documentChecklist: null });
    handleBack();
}

// --- 8. EXPORTS ---
export function setupDetailsModal(config) {
    db = config.db; showNotification = config.showNotification;
    
    if (getEl('document-action-selection')) {
        getEl('document-action-selection').onclick = async (e) => {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;
            const key = btn.dataset.action;
            await updateVisualStatus('selected', documentsData[key].title);
            renderChecklist(key);
            getEl('document-action-selection').classList.add('hidden');
            if (getEl('document-checklist-view')) getEl('document-checklist-view').classList.remove('hidden');
        };
    }

    if (getEl('back-to-action-selection-btn')) getEl('back-to-action-selection-btn').onclick = handleBack;
    if (getEl('save-checklist-btn')) getEl('save-checklist-btn').onclick = handleSave;
    if (getEl('print-checklist-btn')) getEl('print-checklist-btn').onclick = handlePdf;
    if (getEl('reset-checklist-btn')) getEl('reset-checklist-btn').onclick = handleReset;
}

export function openDetailsModal(config) {
    currentAssistedId = config.assistedId; currentPautaId = config.pautaId; allAssisted = config.allAssisted;
    const assisted = allAssisted.find(a => a.id === currentAssistedId);
    if (!assisted) return;

    if (getEl('documents-assisted-name')) getEl('documents-assisted-name').textContent = assisted.name;
    
    const selectionArea = getEl('document-action-selection');
    if (selectionArea) {
        selectionArea.innerHTML = '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 action-grid"></div>';
        const grid = selectionArea.querySelector('.action-grid');
        Object.keys(documentsData).forEach(k => {
            const btn = document.createElement('button');
            btn.dataset.action = k;
            btn.className = "text-left p-4 bg-white border-2 border-gray-100 hover:border-green-500 rounded-xl transition-all shadow-sm";
            btn.innerHTML = `<span class="font-bold text-gray-700 uppercase text-xs">${documentsData[k].title}</span>`;
            grid.appendChild(btn);
        });
    }

    if (assisted.documentChecklist?.action) {
        renderChecklist(assisted.documentChecklist.action);
        if (selectionArea) selectionArea.classList.add('hidden');
        if (getEl('document-checklist-view')) getEl('document-checklist-view').classList.remove('hidden');
    } else {
        handleBack();
    }
    if (getEl('documents-modal')) getEl('documents-modal').classList.remove('hidden');
}
