/**
 * detalhes.js - SIGAP
 * Gerencia o modal de detalhes com função de Reset/Cancelamento de seleção.
 */

import { doc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- 1. CONSTANTES E BASE DE DADOS ---

const BASE_DOCS = ['Carteira de Identidade (RG) ou Habilitação (CNH)', 'CPF', 'Comprovante de Residência (Atualizado - últimos 3 meses)'];
const INCOME_DOCS_STRUCTURED = [
    { type: 'title', text: '1. TRABALHADOR FORMAL (CLT / SERVIDOR)' }, 'Contracheque (3 últimos meses)', 'Carteira de Trabalho (Física ou Digital - Print das telas)', 'Extrato Analítico do FGTS',
    { type: 'title', text: '2. APOSENTADO / PENSIONISTA / BPC-LOAS' }, 'Extrato de Pagamento de Benefício (Portal Meu INSS)', 'Histórico de Crédito - HISCRE (Portal Meu INSS)', 'Extrato bancário da conta onde recebe o benefício',
    { type: 'title', text: '3. AUTÔNOMO / TRABALHADOR INFORMAL' }, 'Declaração de Hipossuficiência (Informando média mensal)', 'Extratos Bancários (3 últimos meses)', 'Comprovante de Inscrição no CadÚnico',
    { type: 'title', text: '4. DESEMPREGADO' }, 'Carteira de Trabalho (Página da baixa do último emprego)', 'Comprovante de Seguro-Desemprego', 'Extrato do CNIS (Meu INSS)',
    { type: 'title', text: '5. IMPOSTO DE RENDA' }, 'IRPF - Cópia da Declaração completa', 'Declaração de Isenção (se isento)'
];
const COMMON_DOCS_FULL = [...BASE_DOCS, ...INCOME_DOCS_STRUCTURED];

const EXPENSE_CATEGORIES = [
    { id: 'moradia', label: '1. MORADIA (Habitação)', desc: 'Aluguel, luz, água, gás.' },
    { id: 'alimentacao', label: '2. ALIMENTAÇÃO', desc: 'Mercado, feira, açougue, lanches.' },
    { id: 'educacao', label: '3. EDUCAÇÃO', desc: 'Mensalidade, transporte escolar, material.' },
    { id: 'saude', label: '4. SAÚDE', desc: 'Plano de saúde, farmácia, dentista.' },
    { id: 'vestuario', label: '5. VESTUÁRIO E HIGIENE', desc: 'Roupas, calçados, fraldas.' },
    { id: 'lazer', label: '6. LAZER E TRANSPORTE', desc: 'Passeios, festas, passagens.' },
    { id: 'outras', label: '7. OUTRAS DESPESAS', desc: 'Babá, pet, cursos extras.' }
];

const ACTIONS_ALWAYS_EXPENSES = ['alimentos_fixacao_majoracao_oferta', 'alimentos_gravidicos', 'alimentos_avoengos', 'investigacao_paternidade', 'guarda'];

export const documentsData = {
    obrigacao_fazer: { title: 'Obrigação de Fazer', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Específicos', docs: ['Contrato/Acordo', 'Provas do descumprimento'] }] },
    indenizacao_danos: { title: 'Ação de Indenização', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Específicos', docs: ['BO', 'Fotos/Vídeos', 'Orçamentos', 'Notas Fiscais'] }] },
    alimentos_fixacao_majoracao_oferta: { title: 'Alimentos (Fixação/Majoração)', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Do Alimentando', docs: ['Certidão de Nascimento', 'Comprovantes de despesas'] }, { title: 'Sobre o Réu', docs: ['Endereço completo', 'Dados de trabalho'] }] },
    alimentos_gravidicos: { title: 'Alimentos Gravídicos', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Da Gestação', docs: ['Exame Beta HCG', 'Pré-Natal'] }] },
    divorcio_consensual: { title: 'Divórcio Consensual', sections: [{ title: 'Documentação (Ambos)', docs: ['Certidão Casamento', ...COMMON_DOCS_FULL] }, { title: 'Filhos/Bens', docs: ['Certidão Nascimento Filhos', 'Documentos de Bens'] }] },
    divorcio_litigioso: { title: 'Divórcio Litigioso', sections: [{ title: 'Documentação Pessoal e Renda', docs: [...COMMON_DOCS_FULL, 'Certidão de Casamento'] }, { title: 'Filhos/Bens', docs: ['Certidão Nascimento Filhos', 'Documentos de Bens'] }] },
    uniao_estavel_reconhecimento_dissolucao: { title: 'União Estável', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Provas', docs: ['Certidão filhos', 'Contas conjuntas', 'Fotos', 'Testemunhas'] }] },
    guarda: { title: 'Ação de Guarda', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Da Criança', docs: ['Certidão Nascimento', 'Matrícula Escolar'] }] },
    curatela: { title: 'Curatela (Interdição)', sections: [{ title: 'Documentador (Curador)', docs: COMMON_DOCS_FULL }, { title: 'Do Curatelando', docs: ['RG/CPF Curatelando', 'Laudo Médico (CID)'] }] },
    retificacao_registro_civil: { title: 'Retificação Registro Civil', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Específicos', docs: ['Certidão a retificar', 'Provas do erro'] }] },
    vaga_escola_creche: { title: 'Vaga em Creche/Escola', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Da Criança', docs: ['Certidão Nascimento', 'Protocolo Inscrição/Negativa'] }] },
    medicamentos_saude: { title: 'Medicamentos / Saúde', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Médicos', docs: ['Laudo (CID)', 'Receita', 'Negativa do Estado/Município'] }] }
};

// --- 2. ESTADO GLOBAL ---

let currentAssistedId = null, currentPautaId = null, db = null, showNotification = null, allAssisted = [], currentChecklistAction = null;

const modal = document.getElementById('documents-modal'),
      assistedNameEl = document.getElementById('documents-assisted-name'),
      actionSelectionView = document.getElementById('document-action-selection'),
      checklistView = document.getElementById('document-checklist-view'),
      checklistContainer = document.getElementById('checklist-container'),
      checklistTitle = document.getElementById('checklist-title'),
      backBtn = document.getElementById('back-to-action-selection-btn'),
      saveBtn = document.getElementById('save-checklist-btn'),
      printBtn = document.getElementById('print-checklist-btn'),
      resetBtn = document.getElementById('reset-checklist-btn'); // NOVO BOTÃO

// --- 3. UTILITÁRIOS ---

const normalizeLocal = (str) => str ? str.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : '';
const formatCurrency = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const parseCurrency = (s) => !s ? 0 : parseFloat(s.replace(/[^\d,]/g, '').replace(',', '.')) || 0;

async function updateVisualStatus(state, actionTitle = null) {
    const docRef = doc(db, "pautas", currentPautaId, "attendances", currentAssistedId);
    const updateData = { documentState: state };
    // Se o state for null, limpa os nomes
    if (state === null) {
        updateData.selectedAction = null;
        updateData.documentState = null;
    } else if (actionTitle) {
        updateData.selectedAction = actionTitle;
    }
    await updateDoc(docRef, updateData);
}

// --- 4. RENDERIZAÇÃO ---

function renderChecklist(actionKey) {
    currentChecklistAction = actionKey;
    const data = documentsData[actionKey];
    if (!data) return;

    const assisted = allAssisted.find(a => a.id === currentAssistedId);
    const saved = assisted?.documentChecklist;

    checklistTitle.textContent = data.title;
    checklistContainer.innerHTML = '';

    data.sections.forEach((section, sIdx) => {
        const div = document.createElement('div');
        div.className = "mb-6";
        div.innerHTML = `<h4 class="font-bold text-gray-700 mb-3 border-b pb-1 uppercase text-[10px] tracking-widest">${section.title}</h4>`;
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
                            <label class="flex items-center text-[10px] text-gray-500 cursor-pointer">
                                <input type="radio" name="type-${id}" value="Físico" class="mr-1" ${savedType === 'Físico' ? 'checked' : ''}> FÍSICO
                            </label>
                            <label class="flex items-center text-[10px] text-gray-500 cursor-pointer">
                                <input type="radio" name="type-${id}" value="Digital" class="mr-1" ${savedType === 'Digital' ? 'checked' : ''}> DIGITAL
                            </label>
                        </div>
                    </div>`;
            }
            ul.appendChild(li);
        });
        div.appendChild(ul);
        checklistContainer.appendChild(div);
    });

    checklistContainer.querySelectorAll('.doc-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const typeDiv = document.getElementById(`type-${e.target.id}`);
            if (e.target.checked) {
                typeDiv.classList.remove('hidden');
                if (!typeDiv.querySelector('input:checked')) typeDiv.querySelector('input[value="Físico"]').checked = true;
            } else { typeDiv.classList.add('hidden'); }
            checklistContainer.dispatchEvent(new Event('change', { bubbles: true }));
            updateVisualStatus('filling');
        });
    });

    if (ACTIONS_ALWAYS_EXPENSES.includes(actionKey)) checklistContainer.appendChild(renderExpenseTable());
    checklistContainer.appendChild(renderReuForm(actionKey));

    if (saved) {
        if (saved.reuData) fillReuData(saved.reuData);
        if (saved.expenseData) fillExpenseData(saved.expenseData);
    }
    checklistContainer.dispatchEvent(new Event('change', { bubbles: true }));
}

function renderReuForm(actionKey) {
    const div = document.createElement('div');
    div.className = 'mt-8 p-4 bg-slate-50 border border-slate-200 rounded-xl';
    div.innerHTML = `<h3 class="text-[10px] font-black text-slate-400 mb-4 uppercase">Dados do Réu</h3>
        <div class="space-y-3">
            <input type="text" id="nome-reu" placeholder="Nome Completo" class="w-full p-2 border rounded text-sm">
            <div class="grid grid-cols-2 gap-2">
                <input type="text" id="cpf-reu" placeholder="CPF" class="p-2 border rounded text-sm">
                <input type="text" id="telefone-reu" placeholder="WhatsApp" class="p-2 border rounded text-sm">
            </div>
            <div class="grid grid-cols-3 gap-2">
                <input type="text" id="cep-reu" placeholder="CEP" maxlength="9" class="p-2 border rounded text-sm">
                <input type="text" id="rua-reu" placeholder="Rua" class="col-span-2 p-2 border rounded text-sm bg-white">
                <input type="text" id="numero-reu" placeholder="Nº" class="p-2 border rounded text-sm">
                <input type="text" id="bairro-reu" placeholder="Bairro" class="col-span-2 p-2 border rounded text-sm bg-white">
            </div>
        </div>`;
    return div;
}

function renderExpenseTable() {
    const div = document.createElement('div');
    div.className = 'mt-6 p-4 bg-green-50 border border-green-100 rounded-xl';
    let rows = '';
    EXPENSE_CATEGORIES.forEach(c => {
        rows += `<tr class="border-b border-green-50"><td class="py-2 text-[10px] font-bold text-green-800 uppercase">${c.label}</td><td><input type="text" id="expense-${c.id}" class="expense-input w-full p-1 bg-white border rounded text-right text-xs" placeholder="R$ 0,00"></td></tr>`;
    });
    div.innerHTML = `<h3 class="text-[10px] font-black text-green-700 mb-3 uppercase">Planilha de Gastos</h3><table class="w-full">${rows}</table><div class="mt-2 text-right font-black text-green-900" id="expense-total">Total: R$ 0,00</div>`;
    return div;
}

// --- 5. SALVAMENTO E RESET ---

async function handleSave() {
    if (!currentAssistedId) return;
    const checkedIds = Array.from(checklistContainer.querySelectorAll('.doc-checkbox:checked')).map(cb => cb.id);
    const docTypes = {};
    checkedIds.forEach(id => { docTypes[id] = document.querySelector(`input[name="type-${id}"]:checked`)?.value || 'Físico'; });

    const payload = {
        documentChecklist: {
            action: currentChecklistAction,
            checkedIds, docTypes,
            reuData: { nome: document.getElementById('nome-reu')?.value || '' },
            expenseData: getExpenseData()
        },
        documentState: 'saved'
    };

    try {
        await updateDoc(doc(db, "pautas", currentPautaId, "attendances", currentAssistedId), payload);
        showNotification("Checklist salvo!");
        modal.classList.add('hidden');
    } catch (e) { console.error(e); }
}

async function handleResetSelection() {
    if (!confirm("Isso apagará todo o checklist e o endereço salvo para este assistido. Deseja mudar de assunto?")) return;

    try {
        const docRef = doc(db, "pautas", currentPautaId, "attendances", currentAssistedId);
        await updateDoc(docRef, {
            documentChecklist: null,
            documentState: null,
            selectedAction: null
        });
        
        showNotification("Seleção resetada.");
        // Volta para a tela de escolha
        checklistView.classList.replace('flex','hidden');
        actionSelectionView.classList.remove('hidden');
    } catch (e) { console.error(e); }
}

function getExpenseData() {
    const d = {};
    EXPENSE_CATEGORIES.forEach(c => { d[c.id] = document.getElementById(`expense-${c.id}`)?.value || ''; });
    return d;
}

function fillReuData(d) { if(document.getElementById('nome-reu')) document.getElementById('nome-reu').value = d.nome || ''; }
function fillExpenseData(d) { EXPENSE_CATEGORIES.forEach(c => { if(document.getElementById(`expense-${c.id}`)) document.getElementById(`expense-${c.id}`).value = d[c.id] || ''; }); }

// --- 6. PDF ---

async function handlePdf() {
    try {
        await updateVisualStatus('pdf');
        const { jsPDF } = window.jspdf;
        const docPDF = new jsPDF();
        docPDF.setFontSize(16); docPDF.text("Checklist de Documentos - SIGAP", 105, 20, { align: "center" });
        docPDF.setFontSize(12); docPDF.text(`Assistido: ${assistedNameEl.textContent}`, 15, 35);
        docPDF.text(`Matéria: ${checklistTitle.textContent}`, 15, 42);
        let y = 55;
        const checked = checklistContainer.querySelectorAll('.doc-checkbox:checked');
        checked.forEach(cb => {
            const text = cb.closest('label').querySelector('span').textContent;
            docPDF.text(`[X] ${text}`, 20, y);
            y += 6;
        });
        docPDF.save(`Checklist_${normalizeLocal(assistedNameEl.textContent).replace(/\s+/g, '_')}.pdf`);
    } catch (err) { console.error(err); }
}

// --- 7. EXPORTS ---

export function setupDetailsModal(config) {
    db = config.db; showNotification = config.showNotification;
    
    actionSelectionView.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const key = btn.dataset.action;
        await updateVisualStatus('selected', documentsData[key].title);
        renderChecklist(key);
        actionSelectionView.classList.add('hidden');
        checklistView.classList.remove('hidden');
        checklistView.classList.add('flex');
    });

    backBtn.onclick = () => { checklistView.classList.replace('flex','hidden'); actionSelectionView.classList.remove('hidden'); };
    saveBtn.onclick = handleSave;
    printBtn.onclick = handlePdf;
    resetBtn.onclick = handleResetSelection; // LIGA O BOTÃO DE RESET
}

export function openDetailsModal(config) {
    currentAssistedId = config.assistedId; currentPautaId = config.pautaId; allAssisted = config.allAssisted;
    const assisted = allAssisted.find(a => a.id === currentAssistedId); if (!assisted) return;
    assistedNameEl.textContent = assisted.name;
    
    actionSelectionView.innerHTML = '<p class="text-gray-500 mb-6 text-sm text-center">Selecione o assunto jurídico:</p><div class="grid grid-cols-1 sm:grid-cols-2 gap-3 action-grid"></div>';
    const grid = actionSelectionView.querySelector('.action-grid');
    
    Object.keys(documentsData).forEach(k => {
        const btn = document.createElement('button');
        btn.dataset.action = k;
        btn.className = "text-left p-4 bg-white border-2 border-gray-100 hover:border-green-500 rounded-xl transition-all shadow-sm group";
        btn.innerHTML = `<span class="font-bold text-gray-700 uppercase text-xs">${documentsData[k].title}</span>`;
        btn.onclick = () => { renderChecklist(k); actionSelectionView.classList.add('hidden'); checklistView.classList.remove('hidden'); checklistView.classList.add('flex');};
        grid.appendChild(btn);
    });

    if (assisted.documentChecklist?.action) {
        renderChecklist(assisted.documentChecklist.action);
        actionSelectionView.classList.add('hidden');
        checklistView.classList.remove('hidden'); checklistView.classList.add('flex');
    } else {
        checklistView.classList.replace('flex','hidden'); actionSelectionView.classList.remove('hidden');
    }
    modal.classList.remove('hidden');
}
