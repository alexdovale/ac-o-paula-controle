/**
 * detalhes.js - SIGAP
 * Gerencia o modal de detalhes, checklists, dados do Réu com CEP e Planilha de Despesas.
 */

import { doc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- 1. CONSTANTES E BASE DE DADOS ---

const BASE_DOCS = ['Carteira de Identidade (RG) ou Habilitação (CNH)', 'CPF', 'Comprovante de Residência (Atualizado - últimos 3 meses)'];
const INCOME_DOCS_STRUCTURED = [
    { type: 'title', text: '1. TRABALHADOR FORMAL (CLT / SERVIDOR)' }, 'Contracheque (3 últimos meses)', 'Carteira de Trabalho (Física ou Digital)', 'Extrato Analítico do FGTS',
    { type: 'title', text: '2. APOSENTADO / PENSIONISTA / BPC-LOAS' }, 'Extrato de Pagamento de Benefício (Meu INSS)', 'Histórico de Crédito - HISCRE',
    { type: 'title', text: '3. AUTÔNOMO / INFORMAL' }, 'Declaração de Hipossuficiência (Próprio Punho)', 'Extratos Bancários (3 meses)',
    { type: 'title', text: '4. DESEMPREGADO' }, 'Carteira de Trabalho (Baixa)', 'Comprovante de Seguro-Desemprego', 'Extrato do CNIS',
    { type: 'title', text: '5. IMPOSTO DE RENDA' }, 'IRPF - Cópia da Declarat de IR', 'Declaração de Isenção (se isento)'
];
const COMMON_DOCS_FULL = [...BASE_DOCS, ...INCOME_DOCS_STRUCTURED];

const EXPENSE_CATEGORIES = [
    { id: 'moradia', label: '1. MORADIA', desc: 'Aluguel, luz, água, gás.' },
    { id: 'alimentacao', label: '2. ALIMENTAÇÃO', desc: 'Mercado, feira, lanches.' },
    { id: 'educacao', label: '3. EDUCAÇÃO', desc: 'Mensalidade, material.' },
    { id: 'saude', label: '4. SAÚDE', desc: 'Plano, farmácia, dentista.' },
    { id: 'vestuario', label: '5. VESTUÁRIO/HIGIENE', desc: 'Roupas, fraldas.' },
    { id: 'lazer', label: '6. LAZER/TRANSPORTE', desc: 'Passeios, passagens.' },
    { id: 'outras', label: '7. OUTRAS', desc: 'Babá, pet, cursos.' }
];

const ACTIONS_ALWAYS_EXPENSES = ['alimentos_fixacao_majoracao_oferta', 'alimentos_gravidicos', 'alimentos_avoengos', 'investigacao_paternidade', 'guarda'];

export const documentsData = {
    obrigacao_fazer: { title: 'Obrigação de Fazer', sections: [{ title: 'Documentos Base', docs: COMMON_DOCS_FULL }, { title: 'SOBRE O RÉU', docs: ['Endereço completo', 'Dados de trabalho'] }] },
    indenizacao_danos: { title: 'Ação de Indenização', sections: [{ title: 'Documentos Base', docs: COMMON_DOCS_FULL }, { title: 'SOBRE O RÉU', docs: ['Endereço completo', 'Dados de trabalho'] }] },
    alimentos_fixacao_majoracao_oferta: { title: 'Alimentos (Fixação/Majoração)', sections: [{ title: 'Documentos Base', docs: COMMON_DOCS_FULL }, { title: 'Do Alimentando', docs: ['Certidão de Nascimento'] }, { title: 'SOBRE O RÉU', docs: ['Endereço completo', 'Dados de trabalho'] }] },
    divorcio_consensual: { title: 'Divórcio Consensual', sections: [{ title: 'Documentação (Ambos)', docs: ['Certidão Casamento', ...COMMON_DOCS_FULL] }, { title: 'Filhos/Bens', docs: ['Certidão Nascimento Filhos', 'Documentos de Bens'] }] },
    divorcio_litigioso: { title: 'Divórcio Litigioso', sections: [{ title: 'Documentação', docs: [...COMMON_DOCS_FULL, 'Certidão de Casamento'] }, { title: 'SOBRE O RÉU', docs: ['Endereço completo', 'Dados de trabalho'] }] },
    curatela: { title: 'Curatela (Interdição)', sections: [{ title: 'Curador', docs: COMMON_DOCS_FULL }, { title: 'Curatelando', docs: ['RG/CPF Curatelando', 'Laudo Médico (CID)'] }] },
    retificacao_registro_civil: { title: 'Retificação Registro Civil', sections: [{ title: 'Documentos Base', docs: COMMON_DOCS_FULL }, { title: 'Específicos', docs: ['Certidão a retificar', 'Provas do erro'] }] }
};

// --- 2. ESTADO GLOBAL ---

let currentAssistedId = null, currentPautaId = null, db = null, showNotification = null, allAssisted = [], currentChecklistAction = null;

// Função Auxiliar para pegar elementos com segurança
const getEl = (id) => document.getElementById(id);

// --- 3. UTILITÁRIOS ---

const normalizeLocal = (str) => str ? str.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : '';
const formatCurrency = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const parseCurrency = (s) => !s ? 0 : parseFloat(s.replace(/[^\d,]/g, '').replace(',', '.')) || 0;

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

// --- 4. RENDERIZAÇÃO DO CHECKLIST ---

function renderChecklist(actionKey) {
    currentChecklistAction = actionKey;
    const data = documentsData[actionKey];
    if (!data) return;

    const assisted = allAssisted.find(a => a.id === currentAssistedId);
    const saved = assisted?.documentChecklist;

    if (getEl('checklist-title')) getEl('checklist-title').textContent = data.title;
    if (getEl('checklist-container')) getEl('checklist-container').innerHTML = '';
    if (getEl('checklist-search')) getEl('checklist-search').value = '';

    // MOSTRA CABEÇALHOS (SE EXISTIREM)
    if (getEl('document-checklist-view-header')) getEl('document-checklist-view-header').classList.remove('hidden');
    if (getEl('checklist-search-container')) getEl('checklist-search-container').classList.remove('hidden');

    data.sections.forEach((section, sIdx) => {
        const sectionDiv = document.createElement('div');
        sectionDiv.className = "mb-6";
        sectionDiv.innerHTML = `<h4 class="font-bold text-gray-700 mb-3 border-b pb-1 uppercase text-[10px] tracking-widest">${section.title}</h4>`;
        const ul = document.createElement('ul');
        ul.className = 'space-y-1';

        section.docs.forEach((docItem, dIdx) => {
            const li = document.createElement('li');
            if (typeof docItem === 'object' && docItem.type === 'title') {
                li.innerHTML = `<div class="font-bold text-blue-700 text-[10px] mt-4 mb-2 bg-blue-50 p-2 rounded border-l-4 border-blue-400 uppercase">${docItem.text}</div>`;
            } else {
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
                            <label class="flex items-center text-[10px] text-gray-500 cursor-pointer"><input type="radio" name="type-${id}" value="Físico" ${savedType === 'Físico' ? 'checked' : ''}> FÍSICO</label>
                            <label class="flex items-center text-[10px] text-gray-500 cursor-pointer"><input type="radio" name="type-${id}" value="Digital" ${savedType === 'Digital' ? 'checked' : ''}> DIGITAL</label>
                        </div>
                    </div>`;
            }
            ul.appendChild(li);
        });
        sectionDiv.appendChild(ul);
        if (getEl('checklist-container')) getEl('checklist-container').appendChild(sectionDiv);
    });

    // Injeta os componentes extras
    if (ACTIONS_ALWAYS_EXPENSES.includes(actionKey)) {
        if (getEl('checklist-container')) getEl('checklist-container').appendChild(renderExpenseTable());
    }
    
    // FORMULÁRIO DO RÉU
    const reuForm = renderReuForm();
    if (getEl('address-editor-container')) {
        getEl('address-editor-container').innerHTML = '';
        getEl('address-editor-container').appendChild(reuForm);
    }

    // GATILHO DE VISIBILIDADE DO RÉU
    const checkReuVisibility = () => {
        const checkedLabels = Array.from(document.querySelectorAll('.doc-checkbox:checked'))
                                   .map(cb => cb.closest('label').querySelector('span').textContent);
        const needsReu = checkedLabels.some(txt => txt.includes('Endereço') || txt.includes('Trabalho'));
        if (getEl('address-editor-container')) getEl('address-editor-container').classList.toggle('hidden', !needsReu);
    };

    checklistContainer.querySelectorAll('.doc-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const t = getEl(`type-${e.target.id}`);
            if (t) {
                t.classList.toggle('hidden', !e.target.checked);
                if (e.target.checked && !t.querySelector('input:checked')) t.querySelector('input[value="Físico"]').checked = true;
            }
            checkReuVisibility();
            checklistContainer.dispatchEvent(new Event('change', { bubbles: true }));
            updateVisualStatus('filling');
        });
    });

    if (saved) {
        if (saved.reuData) fillReuData(saved.reuData);
        if (saved.expenseData) fillExpenseData(saved.expenseData);
        checkReuVisibility();
    }
    checklistContainer.dispatchEvent(new Event('change', { bubbles: true }));
}

// --- 5. FORMULÁRIO DO RÉU COM BUSCA DE CEP ---

function renderReuForm() {
    const div = document.createElement('div');
    div.className = 'p-6 bg-slate-50 border-2 border-slate-200 rounded-2xl shadow-inner';
    div.innerHTML = `
        <h3 class="text-xs font-black text-slate-500 mb-4 uppercase border-b pb-2">Preenchimento: Dados do Réu</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div class="col-span-2"><label class="text-[9px] font-black text-slate-400 uppercase">Nome Completo</label><input type="text" id="nome-reu" class="w-full p-2 border rounded-lg text-sm bg-white"></div>
            <div><label class="text-[9px] font-black text-slate-400 uppercase">CPF</label><input type="text" id="cpf-reu" class="w-full p-2 border rounded-lg text-sm bg-white"></div>
            <div><label class="text-[9px] font-black text-slate-400 uppercase">WhatsApp</label><input type="text" id="telefone-reu" class="w-full p-2 border rounded-lg text-sm bg-white"></div>
        </div>
        <div class="grid grid-cols-3 gap-2">
            <div><label class="text-[9px] font-black text-blue-500 uppercase">CEP (Correios)</label><input type="text" id="cep-reu" maxlength="9" placeholder="00000-000" class="w-full p-2 border-2 border-blue-100 rounded-lg text-sm bg-white font-bold"></div>
            <div class="col-span-2"><label class="text-[9px] font-black text-slate-400 uppercase">Rua</label><input type="text" id="rua-reu" class="w-full p-2 border rounded-lg text-sm bg-white"></div>
            <div><label class="text-[9px] font-black text-slate-400 uppercase">Nº</label><input type="text" id="numero-reu" class="w-full p-2 border rounded-lg text-sm bg-white"></div>
            <div class="col-span-2"><label class="text-[9px] font-black text-slate-400 uppercase">Bairro</label><input type="text" id="bairro-reu" class="w-full p-2 border rounded-lg text-sm bg-white"></div>
            <div class="col-span-2"><label class="text-[9px] font-black text-slate-400 uppercase">Cidade</label><input type="text" id="cidade-reu" class="w-full p-2 border rounded-lg text-sm bg-white"></div>
            <div><label class="text-[9px] font-black text-slate-400 uppercase">UF</label><input type="text" id="estado-reu" class="w-full p-2 border rounded-lg text-sm bg-white text-center"></div>
        </div>`;

    const cep = div.querySelector('#cep-reu');
    cep.onblur = async (e) => {
        const val = e.target.value.replace(/\D/g, '');
        if (val.length === 8) {
            const r = await fetch(`https://viacep.com.br/ws/${val}/json/`).then(res => res.json());
            if (!r.erro) {
                div.querySelector('#rua-reu').value = r.logradouro;
                div.querySelector('#bairro-reu').value = r.bairro;
                div.querySelector('#cidade-reu').value = r.localidade;
                div.querySelector('#estado-reu').value = r.uf;
                div.querySelector('#numero-reu').focus();
            }
        }
    };
    return div;
}

function renderExpenseTable() {
    const div = document.createElement('div');
    div.className = 'mt-6 p-4 bg-green-50 border-2 border-green-100 rounded-xl';
    let rows = '';
    EXPENSE_CATEGORIES.forEach(c => {
        rows += `<tr class="border-b border-green-50"><td class="py-2 text-[10px] font-bold text-green-800 uppercase">${c.label}</td><td><input type="text" id="expense-${c.id}" class="expense-input w-full p-1 bg-white border rounded text-right text-xs" placeholder="R$ 0,00"></td></tr>`;
    });
    div.innerHTML = `<h3 class="text-[10px] font-black text-green-700 mb-3 uppercase text-center">Planilha de Gastos</h3><table class="w-full">${rows}</table><div class="mt-3 flex justify-between font-black text-green-900 border-t pt-2"><span>TOTAL:</span><span id="expense-total">R$ 0,00</span></div>`;
    
    div.querySelectorAll('.expense-input').forEach(inp => {
        inp.oninput = (e) => {
            let v = e.target.value.replace(/\D/g, '');
            v = (Number(v)/100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            e.target.value = v;
            let total = 0;
            div.querySelectorAll('.expense-input').forEach(i => total += parseCurrency(i.value));
            const totalEl = document.getElementById('expense-total');
            if(totalEl) totalEl.textContent = formatCurrency(total);
            updateVisualStatus('filling');
        };
    });
    return div;
}

// --- 6. SALVAMENTO, RESET E PDF ---

async function handleSave() {
    if (!currentAssistedId) return;
    const checkedIds = Array.from(checklistContainer.querySelectorAll('.doc-checkbox:checked')).map(cb => cb.id);
    const docTypes = {};
    checkedIds.forEach(id => { docTypes[id] = document.querySelector(`input[name="type-${id}"]:checked`)?.value || 'Físico'; });

    const payload = {
        documentChecklist: {
            action: currentChecklistAction,
            checkedIds, docTypes,
            reuData: getReuDataFromForm(),
            expenseData: getExpenseDataFromForm()
        },
        documentState: 'saved'
    };

    try {
        await updateDoc(doc(db, "pautas", currentPautaId, "attendances", currentAssistedId), payload);
        if (showNotification) showNotification("Dados salvos com sucesso!", "success");
        if (getEl('documents-modal')) getEl('documents-modal').classList.add('hidden');
    } catch (e) { console.error(e); }
}

function getReuDataFromForm() {
    if (!getEl('nome-reu')) return null;
    return {
        nome: getEl('nome-reu').value, cpf: getEl('cpf-reu').value, telefone: getEl('telefone-reu').value,
        cep: getEl('cep-reu').value, rua: getEl('rua-reu').value, numero: getEl('numero-reu').value, 
        bairro: getEl('bairro-reu').value, cidade: getEl('cidade-reu').value, uf: getEl('estado-reu').value
    };
}

function getExpenseDataFromForm() {
    const d = {};
    EXPENSE_CATEGORIES.forEach(c => { d[c.id] = getEl(`expense-${c.id}`)?.value || ''; });
    return d;
}

function fillReuData(d) {
    if (!d) return;
    const s = (id, v) => { const el = getEl(id); if (el) el.value = v || ''; };
    s('nome-reu', d.nome); s('cpf-reu', d.cpf); s('telefone-reu', d.telefone); s('cep-reu', d.cep); s('rua-reu', d.rua);
    s('numero-reu', d.numero); s('bairro-reu', d.bairro); s('cidade-reu', d.cidade); s('estado-reu', d.uf);
}

function fillExpenseData(d) {
    EXPENSE_CATEGORIES.forEach(c => { const el = getEl(`expense-${c.id}`); if (el) el.value = d[c.id] || ''; });
    let total = 0;
    document.querySelectorAll('.expense-input').forEach(i => total += parseCurrency(i.value));
    if (getEl('expense-total')) getEl('expense-total').textContent = formatCurrency(total);
}

async function handlePdf() {
    try {
        await updateVisualStatus('pdf');
        const { jsPDF } = window.jspdf;
        const docPDF = new jsPDF();
        docPDF.setFontSize(16); docPDF.text("Checklist SIGAP", 105, 20, { align: "center" });
        docPDF.setFontSize(12); docPDF.text(`Assistido: ${assistedNameEl.textContent}`, 15, 35);
        docPDF.text(`Ação: ${checklistTitle.textContent}`, 15, 42);
        let y = 55;
        const checked = checklistContainer.querySelectorAll('.doc-checkbox:checked');
        checked.forEach(cb => {
            const text = cb.closest('label').querySelector('span').textContent;
            docPDF.text(`[X] ${text}`, 20, y);
            y += 6; if (y > 280) { docPDF.addPage(); y = 20; }
        });
        docPDF.save(`Checklist_${assistedNameEl.textContent.replace(/\s+/g, '_')}.pdf`);
    } catch (err) { console.error(err); }
}

async function handleResetSelection() {
    if (!confirm("Isso apagará o checklist e o réu. Deseja mudar de assunto?")) return;
    try {
        await updateVisualStatus(null);
        await updateDoc(doc(db, "pautas", currentPautaId, "attendances", currentAssistedId), { documentChecklist: null });
        showNotification("Seleção resetada.");
        handleBack();
    } catch (e) { console.error(e); }
}

function handleBack() {
    if (getEl('document-checklist-view')) getEl('document-checklist-view').classList.add('hidden');
    if (getEl('document-checklist-view-header')) getEl('document-checklist-view-header').classList.add('hidden');
    if (getEl('checklist-search-container')) getEl('checklist-search-container').classList.add('hidden');
    if (getEl('document-action-selection')) getEl('document-action-selection').classList.remove('hidden');
}

// --- 7. EXPORTS ---

export function setupDetailsModal(config) {
    db = config.db; showNotification = config.showNotification;
    
    if (getEl('document-action-selection')) {
        getEl('document-action-selection').addEventListener('click', async (e) => {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;
            const key = btn.dataset.action;
            await updateVisualStatus('selected', documentsData[key].title);
            renderChecklist(key);
            getEl('document-action-selection').classList.add('hidden');
            if (getEl('document-checklist-view')) getEl('document-checklist-view').classList.remove('hidden');
        });
    }

    if (getEl('back-to-action-selection-btn')) getEl('back-to-action-selection-btn').onclick = handleBack;
    if (getEl('save-checklist-btn')) getEl('save-checklist-btn').onclick = handleSave;
    if (getEl('print-checklist-btn')) getEl('print-checklist-btn').onclick = handlePdf;
    if (getEl('reset-checklist-btn')) getEl('reset-checklist-btn').onclick = handleResetSelection;
    
    if (getEl('checklist-search')) {
        getEl('checklist-search').oninput = (e) => {
            const term = normalizeLocal(e.target.value);
            checklistContainer.querySelectorAll('label.checklist-row').forEach(row => {
                const text = normalizeLocal(row.textContent);
                row.closest('div').style.display = text.includes(term) ? 'block' : 'none';
            });
        };
    }
}

export function openDetailsModal(config) {
    currentAssistedId = config.assistedId; currentPautaId = config.pautaId; allAssisted = config.allAssisted;
    const assisted = allAssisted.find(a => a.id === currentAssistedId); if (!assisted) return;
    if (assistedNameEl) assistedNameEl.textContent = assisted.name;
    
    const selectionArea = getEl('document-action-selection');
    if (selectionArea) {
        selectionArea.innerHTML = '<p class="text-gray-500 mb-6 text-sm text-center font-bold">O que o assistido deseja resolver?</p><div class="grid grid-cols-1 sm:grid-cols-2 gap-3 action-grid"></div>';
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
    if (getEl('documents-modal')) getEl('documents-modal').classList.remove('hidden');
}
