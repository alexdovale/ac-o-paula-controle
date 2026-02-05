/**
 * detalhes.js - SIGAP
 * Versão Blindada (Evita erro de classList null)
 */

import { doc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- BASE DE DADOS (documentsData mantido igual) ---
export const documentsData = {
    obrigacao_fazer: { title: 'Obrigação de Fazer', sections: [{ title: 'Documentos Base', docs: ['RG e CPF', 'Comprovante Residência', 'Comprovante Renda'] }, { title: 'SOBRE O RÉU', docs: ['Endereço completo', 'Dados de trabalho'] }] },
    alimentos_fixacao_majoracao_oferta: { title: 'Alimentos (Fixação/Majoração)', sections: [{ title: 'Documentos Base', docs: ['RG e CPF', 'Comprovante Residência', 'Comprovante Renda'] }, { title: 'Do Alimentando', docs: ['Certidão de Nascimento'] }, { title: 'SOBRE O RÉU', docs: ['Endereço completo', 'Dados de trabalho'] }] },
    divorcio_consensual: { title: 'Divórcio Consensual', sections: [{ title: 'Documentação (Ambos)', docs: ['Certidão Casamento', 'RG/CPF ambos'] }, { title: 'Filhos/Bens', docs: ['Certidão Nascimento Filhos', 'Documentos de Bens'] }] },
    divorcio_litigioso: { title: 'Divórcio Litigioso', sections: [{ title: 'Documentação', docs: ['Certidão Casamento', 'RG/CPF'] }, { title: 'SOBRE O RÉU', docs: ['Endereço completo', 'Dados de trabalho'] }] },
    curatela: { title: 'Curatela (Interdição)', sections: [{ title: 'Curador', docs: ['RG/CPF'] }, { title: 'Curatelando', docs: ['RG/CPF Curatelando', 'Laudo Médico (CID)'] }] }
};

// --- ESTADO GLOBAL ---
let currentAssistedId = null, currentPautaId = null, db = null, showNotification = null, allAssisted = [], currentChecklistAction = null;

// Funções de utilidade
const normalizeLocal = (str) => str ? str.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : '';
const parseCurrency = (s) => !s ? 0 : parseFloat(s.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
const formatCurrency = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

// --- FUNÇÃO PARA PEGAR ELEMENTOS COM SEGURANÇA ---
const getEl = (id) => document.getElementById(id);

async function updateVisualStatus(state, actionTitle = null) {
    const docRef = doc(db, "pautas", currentPautaId, "attendances", currentAssistedId);
    const updateData = { documentState: state };
    if (state === null) {
        updateData.selectedAction = null; updateData.documentState = null;
    } else if (actionTitle) {
        updateData.selectedAction = actionTitle;
    }
    await updateDoc(docRef, updateData);
}

function handleBack() {
    // PROTEÇÃO: Só tenta mexer se o elemento existir
    if (getEl('document-checklist-view')) getEl('document-checklist-view').classList.add('hidden');
    if (getEl('document-checklist-view-header')) getEl('document-checklist-view-header').classList.add('hidden');
    if (getEl('checklist-search-container')) getEl('checklist-search-container').classList.add('hidden');
    if (getEl('document-action-selection')) getEl('document-action-selection').classList.remove('hidden');
}

function renderChecklist(actionKey) {
    currentChecklistAction = actionKey;
    const data = documentsData[actionKey];
    if (!data) return;

    const assisted = allAssisted.find(a => a.id === currentAssistedId);
    const saved = assisted?.documentChecklist;

    if (getEl('checklist-title')) getEl('checklist-title').textContent = data.title;
    if (getEl('checklist-container')) getEl('checklist-container').innerHTML = '';
    
    // MOSTRA CABEÇALHOS (Se existirem no HTML)
    if (getEl('document-checklist-view-header')) getEl('document-checklist-view-header').classList.remove('hidden');
    if (getEl('checklist-search-container')) getEl('checklist-search-container').classList.remove('hidden');

    data.sections.forEach((section, sIdx) => {
        const div = document.createElement('div');
        div.className = "mb-6";
        div.innerHTML = `<h4 class="font-bold text-gray-700 mb-3 border-b pb-1 uppercase text-[10px] tracking-widest">${section.title}</h4>`;
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
                        <input type="checkbox" id="${id}" class="doc-checkbox h-5 w-5 text-green-600" ${isChecked}>
                        <span class="text-sm text-gray-700">${docText}</span>
                    </label>
                    <div id="type-${id}" class="ml-10 mt-1 flex gap-4 ${isChecked ? '' : 'hidden'}">
                        <label class="text-[10px] text-gray-500 cursor-pointer"><input type="radio" name="type-${id}" value="Físico" ${savedType === 'Físico' ? 'checked' : ''}> FÍSICO</label>
                        <label class="text-[10px] text-gray-500 cursor-pointer"><input type="radio" name="type-${id}" value="Digital" ${savedType === 'Digital' ? 'checked' : ''}> DIGITAL</label>
                    </div>
                </div>`;
            ul.appendChild(li);
        });
        div.appendChild(ul);
        if (getEl('checklist-container')) getEl('checklist-container').appendChild(div);
    });

    // Gatilho visual do Réu
    const checkReuVisibility = () => {
        const checkedLabels = Array.from(document.querySelectorAll('.doc-checkbox:checked')).map(cb => cb.closest('label').textContent);
        const needsReu = checkedLabels.some(txt => txt.includes('Endereço') || txt.includes('Trabalho'));
        const reuForm = getEl('address-editor-container');
        if (reuForm) reuForm.classList.toggle('hidden', !needsReu);
    };

    document.querySelectorAll('.doc-checkbox').forEach(cb => {
        cb.onchange = (e) => {
            const t = getEl(`type-${e.target.id}`);
            if (t) t.classList.toggle('hidden', !e.target.checked);
            checkReuVisibility();
            if (getEl('checklist-container')) getEl('checklist-container').dispatchEvent(new Event('change', { bubbles: true }));
            updateVisualStatus('filling');
        };
    });
}

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
    if (getEl('save-checklist-btn')) getEl('save-checklist-btn').onclick = () => { /* lógica de salvar */ };
    if (getEl('print-checklist-btn')) getEl('print-checklist-btn').onclick = () => { /* lógica de pdf */ };
}

export function openDetailsModal(config) {
    currentAssistedId = config.assistedId; 
    currentPautaId = config.pautaId; 
    allAssisted = config.allAssisted;
    
    const assisted = allAssisted.find(a => a.id === currentAssistedId); 
    if (!assisted) return;

    if (getEl('documents-assisted-name')) getEl('documents-assisted-name').textContent = assisted.name;
    if (getEl('documents-modal')) getEl('documents-modal').classList.remove('hidden');

    // Limpa e Renderiza a grid de seleção
    const selectionArea = getEl('document-action-selection');
    if (selectionArea) {
        selectionArea.innerHTML = '<p class="text-gray-500 mb-6 text-sm text-center">Selecione o assunto:</p><div class="grid grid-cols-1 sm:grid-cols-2 gap-3 action-grid"></div>';
        const grid = selectionArea.querySelector('.action-grid');
        Object.keys(documentsData).forEach(k => {
            const btn = document.createElement('button');
            btn.dataset.action = k;
            btn.className = "text-left p-4 bg-white border-2 border-gray-100 hover:border-green-500 rounded-xl transition-all shadow-sm group";
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
}
