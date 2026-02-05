/**
 * detalhes.js - SIGAP
 * Gerencia o modal de detalhes, checklists, dados do Réu com CEP e Planilha de Despesas.
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
    try { await updateDoc(docRef, updateData); } catch(e) { console.error(e); }
}

// --- 4. FORMULÁRIO DO RÉU COM BUSCA DE CEP ---
function renderReuForm() {
    const container = getEl('address-editor-container');
    if (!container) return;

    container.innerHTML = `
        <div class="p-6 bg-blue-50 border-2 border-blue-200 rounded-2xl shadow-sm">
            <h3 class="text-xs font-black text-blue-600 mb-4 uppercase flex items-center gap-2">📍 DADOS DA PARTE CONTRÁRIA (RÉU)</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="col-span-2"><label class="text-[9px] font-black text-gray-400 uppercase">Nome Completo</label><input type="text" id="nome-reu" class="w-full p-2 border rounded-lg bg-white"></div>
                <div><label class="text-[9px] font-black text-gray-400 uppercase">CPF</label><input type="text" id="cpf-reu" class="w-full p-2 border rounded-lg bg-white"></div>
                <div><label class="text-[9px] font-black text-gray-400 uppercase">WhatsApp</label><input type="text" id="telefone-reu" class="w-full p-2 border rounded-lg bg-white"></div>
            </div>
            <div class="mt-4 grid grid-cols-3 gap-2">
                <div><label class="text-[9px] font-black text-blue-500 uppercase font-bold">CEP (Busca Auto)</label><input type="text" id="cep-reu" maxlength="9" placeholder="00000-000" class="w-full p-2 border-2 border-blue-300 rounded-lg bg-white font-bold text-blue-700"></div>
                <div class="col-span-2"><label class="text-[9px] font-black text-gray-400 uppercase">Rua</label><input type="text" id="rua-reu" class="w-full p-2 border rounded-lg bg-white"></div>
                <div><label class="text-[9px] font-black text-gray-400 uppercase">Nº</label><input type="text" id="numero-reu" class="w-full p-2 border rounded-lg bg-white"></div>
                <div class="col-span-2"><label class="text-[9px] font-black text-gray-400 uppercase">Bairro</label><input type="text" id="bairro-reu" class="w-full p-2 border rounded-lg bg-white"></div>
                <div class="col-span-2"><label class="text-[9px] font-black text-gray-400 uppercase">Cidade</label><input type="text" id="cidade-reu" class="w-full p-2 border rounded-lg bg-white"></div>
                <div><label class="text-[9px] font-black text-gray-400 uppercase">UF</label><input type="text" id="estado-reu" class="w-full p-2 border rounded-lg bg-white text-center"></div>
            </div>
        </div>`;

    // Lógica ViaCEP
    const cepInp = getEl('cep-reu');
    if (cepInp) {
        cepInp.onblur = async () => {
            const val = cepInp.value.replace(/\D/g, '');
            if (val.length === 8) {
                const r = await fetch(`https://viacep.com.br/ws/${val}/json/`).then(res => res.json());
                if (!r.erro) {
                    getEl('rua-reu').value = r.logradouro;
                    getEl('bairro-reu').value = r.bairro;
                    getEl('cidade-reu').value = r.localidade;
                    getEl('estado-reu').value = r.uf;
                    getEl('numero-reu').focus();
                }
            }
        };
    }
}

// --- 5. RENDERIZAÇÃO DO CHECKLIST ---
function renderChecklist(actionKey) {
    currentChecklistAction = actionKey;
    const data = documentsData[actionKey];
    if (!data) return;

    const assisted = allAssisted.find(a => a.id === currentAssistedId);
    const saved = assisted?.documentChecklist;

    if (getEl('checklist-title')) getEl('checklist-title').textContent = data.title;
    if (getEl('document-checklist-view-header')) getEl('document-checklist-view-header').classList.remove('hidden');
    if (getEl('checklist-search-container')) getEl('checklist-search-container').classList.remove('hidden');
    if (getEl('checklist-container')) getEl('checklist-container').innerHTML = '';

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

            li.innerHTML = `
                <div class="flex flex-col border-b border-gray-50 pb-1">
                    <label class="checklist-row flex items-center gap-3 w-full cursor-pointer p-2 rounded-lg transition-all hover:bg-gray-50">
                        <input type="checkbox" id="${id}" class="doc-checkbox h-5 w-5 text-green-600 rounded border-gray-300" ${isChecked}>
                        <span class="text-sm text-gray-700 font-medium">${docText}</span>
                    </label>
                </div>`;
            ul.appendChild(li);
        });
        sectionDiv.appendChild(ul);
        if (getEl('checklist-container')) getEl('checklist-container').appendChild(sectionDiv);
    });

    // Gatilho do Formulário do Réu
    const checkReuVisibility = () => {
        const checkedLabels = Array.from(document.querySelectorAll('.doc-checkbox:checked')).map(cb => cb.closest('label').textContent);
        const needsReu = checkedLabels.some(txt => txt.includes('Endereço') || txt.includes('Trabalho'));
        if (getEl('address-editor-container')) getEl('address-editor-container').classList.toggle('hidden', !needsReu);
    };

    renderReuForm(); // Cria o formulário
    if (saved?.reuData) fillReuData(saved.reuData); // Popula dados se existirem
    checkReuVisibility(); // Verifica se deve mostrar agora

    document.querySelectorAll('.doc-checkbox').forEach(cb => {
        cb.onchange = () => {
            checkReuVisibility();
            if (getEl('checklist-container')) getEl('checklist-container').dispatchEvent(new Event('change', { bubbles: true }));
            updateVisualStatus('filling');
        };
    });
}

// --- 6. SALVAMENTO E AÇÕES ---
async function handleSave() {
    if (!currentAssistedId) return;
    const container = getEl('checklist-container');
    if (!container) return;

    const checkedIds = Array.from(container.querySelectorAll('.doc-checkbox:checked')).map(cb => cb.id);
    
    // Coleta dados do Réu
    const reuData = {
        nome: getEl('nome-reu')?.value || '',
        cpf: getEl('cpf-reu')?.value || '',
        telefone: getEl('telefone-reu')?.value || '',
        cep: getEl('cep-reu')?.value || '',
        rua: getEl('rua-reu')?.value || '',
        numero: getEl('numero-reu')?.value || '',
        bairro: getEl('bairro-reu')?.value || '',
        cidade: getEl('cidade-reu')?.value || '',
        uf: getEl('estado-reu')?.value || ''
    };

    const payload = {
        documentChecklist: { action: currentChecklistAction, checkedIds, reuData },
        documentState: 'saved'
    };

    await updateDoc(doc(db, "pautas", currentPautaId, "attendances", currentAssistedId), payload);
    if (showNotification) showNotification("Progresso salvo!");
    if (getEl('documents-modal')) getEl('documents-modal').classList.add('hidden');
}

async function handlePdf() {
    await updateVisualStatus('pdf');
    const { jsPDF } = window.jspdf;
    const docPDF = new jsPDF();
    docPDF.setFontSize(14);
    docPDF.text(`Checklist - ${assistedNameEl.textContent}`, 15, 20);
    docPDF.save("Checklist_SIGAP.pdf");
}

async function handleReset() {
    if (!confirm("Isso apagará o checklist e os dados do réu. Continuar?")) return;
    await updateVisualStatus(null);
    await updateDoc(doc(db, "pautas", currentPautaId, "attendances", currentAssistedId), { documentChecklist: null });
    if (getEl('document-checklist-view')) getEl('document-checklist-view').classList.add('hidden');
    if (getEl('document-checklist-view-header')) getEl('document-checklist-view-header').classList.add('hidden');
    if (getEl('document-action-selection')) getEl('document-action-selection').classList.remove('hidden');
}

// --- 7. EXPORTS ---
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

    if (getEl('back-to-action-selection-btn')) getEl('back-to-action-selection-btn').onclick = () => {
        if (getEl('document-checklist-view')) getEl('document-checklist-view').classList.add('hidden');
        if (getEl('document-checklist-view-header')) getEl('document-checklist-view-header').classList.add('hidden');
        if (getEl('document-action-selection')) getEl('document-action-selection').classList.remove('hidden');
    };

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
        if (getEl('document-checklist-view')) getEl('document-checklist-view').classList.add('hidden');
        if (getEl('document-checklist-view-header')) getEl('document-checklist-view-header').classList.add('hidden');
        if (selectionArea) selectionArea.classList.remove('hidden');
    }
    if (getEl('documents-modal')) getEl('documents-modal').classList.remove('hidden');
}
