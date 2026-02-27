/**
 * detalhes.js - SIGAP
 * Versão Integral: Checklist, CEP, Planilha de Gastos e PDF Completo com Tipos de Documentos.
 */

import { doc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showNotification } from './utils.js';

// --- 1. CONSTANTES DE DOCUMENTAÇÃO (LISTA INTEGRAL) ---

const BASE_DOCS = ['Carteira de Identidade (RG) ou Habilitação (CNH)', 'CPF', 'Comprovante de Residência (Atualizado - últimos 3 meses)'];
const INCOME_DOCS_STRUCTURED = [
    { type: 'title', text: '1. TRABALHADOR FORMAL (CLT / SERVIDOR)' }, 'Contracheque (3 últimos meses)', 'Carteira de Trabalho (Física ou Digital - Print das telas)', 'Extrato Analítico do FGTS',
    { type: 'title', text: '2. APOSENTADO / PENSIONISTA / BPC-LOAS' }, 'Extrato de Pagamento de Benefício (Portal Meu INSS)', 'Histórico de Crédito - HISCRE (Portal Meu INSS)', 'Extrato bancário da conta onde recebe o benefício',
    { type: 'title', text: '3. AUTÔNOMO / TRABALHADOR INFORMAL' }, 'Declaração de Hipossuficiência (Próprio Punho - informando média mensal)', 'Extratos Bancários (3 últimos meses)', 'Comprovante de Inscrição no CadÚnico',
    { type: 'title', text: '4. DESEMPREGADO' }, 'Carteira de Trabalho (Página da baixa do último emprego)', 'Comprovante de Seguro-Desemprego (se estiver recebendo)', 'Declaração de Hipossuficiência (Informando ausência de renda)', 'Extrato do CNIS (Meu INSS - prova ausência de vínculo ativo)',
    { type: 'title', text: '5. PROVAS GERAIS E IMPOSTO DE RENDA' }, 'Extrato do Bolsa Família', 'Folha Resumo do CadÚnico', 'IRPF - Cenário 1 (Declarante): Cópia da Declarat de IR', 'IRPF - Cenário 2 (Isento): Declaração de Isenção de Imposto de Renda'
];
const COMMON_DOCS_FULL = [...BASE_DOCS, ...INCOME_DOCS_STRUCTURED];

const EXPENSE_CATEGORIES = [
    { id: 'moradia', label: '1. MORADIA (Habitação)', desc: 'Aluguel, luz, água, gás (divida pelo nº de moradores).' },
    { id: 'alimentacao', label: '2. ALIMENTAÇÃO', desc: 'Mercado, feira, açougue, lanches, leites especiais.' },
    { id: 'educacao', label: '3. EDUCAÇÃO', desc: 'Mensalidade, transporte escolar, material, uniforme, cursos.' },
    { id: 'saude', label: '4. SAÚDE', desc: 'Plano de saúde, farmácia, tratamentos (dentista, psicólogo).' },
    { id: 'vestuario', label: '5. VESTUÁRIO E HIGIENE', desc: 'Roupas, calçados, fraldas, itens de higiene.' },
    { id: 'lazer', label: '6. LAZER E TRANSPORTE', desc: 'Passeios, festas, transporte para atividades.' },
    { id: 'outras', label: '7. OUTRAS DESPESAS', desc: 'Babá, pet, cursos livres, etc.' }
];

const ACTIONS_ALWAYS_EXPENSES = ['alimentos_fixacao_majoracao_oferta', 'alimentos_gravidicos', 'alimentos_avoengos', 'investigacao_paternidade', 'guarda'];
const ACTIONS_WITH_WORK_INFO = ['alimentos_fixacao_majoracao_oferta', 'alimentos_gravidicos', 'alimentos_avoengos', 'divorcio_litigioso', 'uniao_estavel_reconhecimento_dissolucao', 'investigacao_paternidade'];

// --- 2. BASE DE DADOS DE AÇÕES (LISTA COMPLETA) ---

export const documentsData = {
    obrigacao_fazer: { title: 'Obrigação de Fazer', sections: [{ title: 'Base e Renda', docs: COMMON_DOCS_FULL }, { title: 'Específicos', docs: ['Contrato/Acordo', 'Provas do descumprimento', 'Endereço completo', 'Dados de trabalho'] }] },
    declaratoria_nulidade: { title: 'Declaratória de Nulidade', sections: [{ title: 'Base e Renda', docs: COMMON_DOCS_FULL }, { title: 'Específicos', docs: ['Documento a anular', 'Provas da ilegalidade', 'Endereço completo'] }] },
    indenizacao_danos: { title: 'Ação de Indenização', sections: [{ title: 'Base e Renda', docs: COMMON_DOCS_FULL }, { title: 'Específicos', docs: ['BO', 'Fotos/Vídeos', 'Orçamentos', 'Notas Fiscais', 'Testemunhas', 'Endereço completo', 'Dados de trabalho'] }] },
    revisional_debito: { title: 'Ação Revisional de Débito', sections: [{ title: 'Base e Renda', docs: COMMON_DOCS_FULL }, { title: 'Específicos', docs: ['Contrato', 'Planilha da dívida', 'Extratos', 'Endereço completo'] }] },
    exigir_contas: { title: 'Ação de Exigir Contas', sections: [{ title: 'Base e Renda', docs: COMMON_DOCS_FULL }, { title: 'Específicos', docs: ['Prova da gestão de bens', 'Recusa em prestar contas', 'Endereço completo'] }] },
    alimentos_fixacao_majoracao_oferta: { title: 'Alimentos (Fixação / Majoração / Oferta)', sections: [{ title: 'Base e Renda', docs: COMMON_DOCS_FULL }, { title: 'Do Alimentando', docs: ['Certidão de Nascimento', 'Comprovantes de despesas'] }, { title: 'Sobre o Réu', docs: ['Endereço completo', 'Dados de trabalho'] }] },
    alimentos_gravidicos: { title: 'Ação de Alimentos Gravídicos', sections: [{ title: 'Base e Renda', docs: COMMON_DOCS_FULL }, { title: 'Da Gestação', docs: ['Exame Beta HCG', 'Pré-Natal'] }, { title: 'Sobre o Réu', docs: ['Indícios de paternidade', 'Endereço completo', 'Dados de trabalho'] }] },
    alimentos_avoengos: { title: 'Alimentos Avoengos', sections: [{ title: 'Base e Renda', docs: COMMON_DOCS_FULL }, { title: 'Específicos', docs: ['Certidão de Nascimento', 'Prova da impossibilidade dos pais', 'Endereço completo', 'Dados de trabalho'] }] },
    divorcio_consensual: { title: 'Divórcio Consensual', sections: [{ title: 'Documentação (Ambos)', docs: ['RG/CPF ambos', 'Comp. Residência ambos', 'Certidão Casamento', ...INCOME_DOCS_STRUCTURED] }, { title: 'Filhos/Bens', docs: ['Certidão Nascimento Filhos', 'Documentos Bens'] }] },
    divorcio_litigioso: { title: 'Divórcio Litigioso', sections: [{ title: 'Base e Renda', docs: [...COMMON_DOCS_FULL, 'Certidão de Casamento'] }, { title: 'Filhos/Bens', docs: ['Certidão Nascimento Filhos', 'Documentos Bens'] }, { title: 'Sobre o Cônjuge', docs: ['Endereço completo', 'Dados de trabalho'] }] },
    uniao_estavel: { title: 'União Estável (Reconhecimento/Dissolução)', sections: [{ title: 'Base e Renda', docs: COMMON_DOCS_FULL }, { title: 'Provas', docs: ['Certidão filhos', 'Contas conjuntas', 'Fotos', 'Testemunhas'] }, { title: 'Sobre o Réu', docs: ['Endereço completo', 'Dados de trabalho'] }] },
    guarda: { title: 'Ação de Guarda', sections: [{ title: 'Base e Renda', docs: COMMON_DOCS_FULL }, { title: 'Da Criança', docs: ['Certidão Nascimento', 'Matrícula Escolar', 'Cartão Vacina'] }, { title: 'Do Réu', docs: ['Endereço completo', 'Dados de trabalho'] }] },
    regulamentacao_convivencia: { title: 'Regulamentação de Visitas', sections: [{ title: 'Base e Renda', docs: COMMON_DOCS_FULL }, { title: 'Da Criança', docs: ['Certidão Nascimento'] }, { title: 'Sobre o Réu', docs: ['Endereço completo'] }] },
    investigacao_paternidade: { title: 'Investigação de Paternidade', sections: [{ title: 'Base e Renda', docs: COMMON_DOCS_FULL }, { title: 'Da Criança', docs: ['Certidão Nascimento (sem pai)'] }, { title: 'Suposto Pai', docs: ['Endereço completo', 'Dados de trabalho'] }] },
    curatela: { title: 'Curatela (Interdição)', sections: [{ title: 'Base e Renda (Curador)', docs: COMMON_DOCS_FULL }, { title: 'Do Curatelando', docs: ['RG e CPF', 'Certidão Nascimento/Casamento', 'Renda (INSS)', 'Laudo Médico (CID)'] }] },
    retificacao_registro_civil: { title: 'Retificação Registro Civil', sections: [{ title: 'Base e Renda', docs: COMMON_DOCS_FULL }, { title: 'Específicos', docs: ['Certidão a retificar', 'Provas do erro'] }] },
    alvara_valores: { title: 'Alvará (Valores)', sections: [{ title: 'Base e Renda', docs: COMMON_DOCS_FULL }, { title: 'Do Falecido', docs: ['Óbito', 'Extratos'] }] },
    vaga_escola_creche: { title: 'Vaga em Creche/Escola', sections: [{ title: 'Base e Renda', docs: COMMON_DOCS_FULL }, { title: 'Da Criança', docs: ['Certidão Nascimento', 'Protocolo Inscrição/Negativa'] }] }
};

// --- 3. ESTADO GLOBAL E SELETORES ---

let currentAssistedId = null, currentPautaId = null, db = null, customShowNotification = null, allAssisted = [], currentChecklistAction = null;
const getEl = (id) => document.getElementById(id);

const normalizeLocal = (str) => str ? str.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : '';
const formatCurrency = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const parseCurrency = (s) => !s ? 0 : parseFloat(s.replace(/[^\d,]/g, '').replace(',', '.')) || 0;

async function updateVisualStatus(state, actionTitle = null) {
    if (!currentAssistedId || !currentPautaId) return;
    const docRef = doc(db, "pautas", currentPautaId, "attendances", currentAssistedId);
    const updateData = { documentState: state };
    if (state === null) { updateData.selectedAction = null; updateData.documentState = null; }
    else if (actionTitle) { updateData.selectedAction = actionTitle; }
    await updateDoc(docRef, updateData);
}

// --- 4. FORMULÁRIOS DINÂMICOS ---

function renderReuForm(containerId) {
    const container = getEl(containerId);
    if (!container) return;
    const showWork = ACTIONS_WITH_WORK_INFO.includes(currentChecklistAction);

    container.innerHTML = `
        <div class="p-4 sm:p-6 bg-blue-50 border-2 border-blue-200 rounded-2xl shadow-sm mt-6">
            <h3 class="text-xs font-black text-blue-600 mb-4 uppercase flex items-center gap-2 tracking-tighter">📍 DADOS DA PARTE CONTRÁRIA (RÉU)</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="col-span-2"><label class="text-[9px] font-black text-gray-400 uppercase">Nome Completo</label><input type="text" id="nome-reu" class="w-full p-2 border rounded-lg bg-white shadow-sm"></div>
                <div><label class="text-[9px] font-black text-gray-400 uppercase">CPF</label><input type="text" id="cpf-reu" class="w-full p-2 border rounded-lg bg-white shadow-sm"></div>
                <div><label class="text-[9px] font-black text-gray-400 uppercase">WhatsApp</label><input type="text" id="telefone-reu" class="w-full p-2 border rounded-lg bg-white shadow-sm"></div>
            </div>
            <div class="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
                <div><label class="text-[9px] font-black text-blue-500 uppercase font-bold">CEP</label><input type="text" id="cep-reu" maxlength="9" placeholder="00000-000" class="w-full p-2 border-2 border-blue-200 rounded-lg bg-white font-bold shadow-sm text-blue-600"></div>
                <div class="col-span-1 sm:col-span-2"><label class="text-[9px] font-black text-gray-400 uppercase">Rua</label><input type="text" id="rua-reu" class="w-full p-2 border rounded-lg bg-white shadow-sm"></div>
                <div><label class="text-[9px] font-black text-gray-400 uppercase">Nº</label><input type="text" id="numero-reu" class="w-full p-2 border rounded-lg bg-white shadow-sm"></div>
                <div class="col-span-1 sm:col-span-2"><label class="text-[9px] font-black text-gray-400 uppercase">Bairro</label><input type="text" id="bairro-reu" class="w-full p-2 border rounded-lg bg-white shadow-sm"></div>
                <div class="col-span-2"><label class="text-[9px] font-black text-gray-400 uppercase">Cidade</label><input type="text" id="cidade-reu" class="w-full p-2 border rounded-lg bg-white shadow-sm"></div>
                <div class="col-span-1"><label class="text-[9px] font-black text-gray-400 uppercase">UF</label><input type="text" id="estado-reu" maxlength="2" class="w-full p-2 border rounded-lg bg-white text-center shadow-sm"></div>
            </div>
            ${showWork ? `
                <div class="mt-4 pt-4 border-t border-blue-100">
                    <label class="text-[9px] font-black text-blue-400 uppercase">Local de Trabalho / Renda</label>
                    <input type="text" id="empresa-reu" placeholder="Empresa / Profissão" class="w-full p-2 border rounded-lg bg-white mb-2 shadow-sm">
                    <input type="text" id="endereco-trabalho-reu" placeholder="Endereço comercial" class="w-full p-2 border rounded-lg bg-white shadow-sm">
                </div>` : ''}
        </div>`;

    const cepInp = getEl('cep-reu');
    if (cepInp) {
        cepInp.onblur = async () => {
            const val = cepInp.value.replace(/\D/g, '');
            if (val.length === 8) {
                const r = await fetch(`https://viacep.com.br/ws/${val}/json/`).then(res => res.json());
                if (!r.erro) {
                    getEl('rua-reu').value = r.logradouro; getEl('bairro-reu').value = r.bairro;
                    getEl('cidade-reu').value = r.localidade; getEl('estado-reu').value = r.uf;
                    getEl('numero-reu').focus();
                }
            }
        };
    }
}

function renderExpenseTable() {
    const div = document.createElement('div');
    div.className = 'mt-6 p-4 bg-green-50 border-2 border-green-100 rounded-xl shadow-sm';
    let rows = '';
    EXPENSE_CATEGORIES.forEach(c => {
        rows += `
            <tr class="border-b border-green-100 last:border-0">
                <td class="py-3"><p class="text-[10px] font-bold text-green-800 uppercase leading-none">${c.label}</p><p class="text-[9px] text-green-600 italic opacity-75">${c.desc}</p></td>
                <td class="py-3 pl-2"><input type="text" id="expense-${c.id}" class="expense-input w-full p-2 bg-white border border-green-200 rounded-lg text-right text-xs shadow-sm outline-none" placeholder="R$ 0,00"></td>
            </tr>`;
    });
    div.innerHTML = `<h3 class="text-[10px] font-black text-green-700 mb-3 uppercase text-center font-bold tracking-widest">Planilha de Gastos</h3><table class="w-full border-collapse">${rows}</table><div class="mt-4 flex justify-between font-black text-green-900 border-t border-green-200 pt-3 text-sm"><span>TOTAL MENSAL:</span><span id="expense-total">R$ 0,00</span></div>`;
    
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

// --- 7. RENDERIZAÇÃO DO CHECKLIST ---

function renderChecklist(actionKey) {
    console.log("Renderizando checklist para:", actionKey);
    currentChecklistAction = actionKey;
    const data = documentsData[actionKey];
    if (!data) {
        console.error("Ação não encontrada:", actionKey);
        return;
    }

    const containerEl = getEl('checklist-container');
    if (!containerEl) {
        console.error("Container checklist-container não encontrado");
        return;
    }

    const assisted = allAssisted.find(a => a.id === currentAssistedId);
    const saved = assisted?.documentChecklist;

    const titleEl = getEl('checklist-title');
    if (titleEl) titleEl.textContent = data.title;
    
    const headerEl = getEl('document-checklist-view-header');
    if (headerEl) headerEl.classList.remove('hidden');
    
    const searchEl = getEl('checklist-search-container');
    if (searchEl) searchEl.classList.remove('hidden');
    
    containerEl.innerHTML = ''; 

    data.sections.forEach((section, sIdx) => {
        const sectionDiv = document.createElement('div');
        sectionDiv.className = "mb-6";
        sectionDiv.innerHTML = `<h4 class="font-bold text-gray-700 mb-3 border-b pb-1 uppercase text-[10px] tracking-widest">${section.title}</h4>`;
        const ul = document.createElement('ul');
        ul.className = 'space-y-1';

        section.docs.forEach((docItem, dIdx) => {
            const li = document.createElement('li');
            if (typeof docItem === 'object' && docItem.type === 'title') {
                li.innerHTML = `<div class="font-bold text-blue-700 text-[10px] mt-4 mb-2 bg-blue-50 p-2 rounded border-l-4 border-blue-400 uppercase tracking-tighter">${docItem.text}</div>`;
            } else {
                const docText = typeof docItem === 'string' ? docItem : docItem.text;
                const id = `doc-${actionKey}-${sIdx}-${dIdx}`;
                const isChecked = saved?.checkedIds?.includes(id) ? 'checked' : '';
                const savedType = saved?.docTypes ? saved.docTypes[id] : 'Físico';

                li.innerHTML = `
                    <div class="flex flex-col border-b border-gray-50 pb-1">
                        <label class="checklist-row flex items-center gap-3 w-full cursor-pointer p-2 rounded-lg transition-all hover:bg-gray-50">
                            <input type="checkbox" id="${id}" class="doc-checkbox h-5 w-5 text-green-600 rounded border-gray-300 shadow-sm" ${isChecked}>
                            <span class="text-sm text-gray-700 font-medium">${docText}</span>
                        </label>
                        <div id="type-${id}" class="ml-10 mt-1 flex gap-4 ${isChecked ? '' : 'hidden'}">
                            <label class="flex items-center text-[9px] font-black text-gray-400 cursor-pointer"><input type="radio" name="type-${id}" value="Físico" ${savedType === 'Físico' ? 'checked' : ''}> FÍSICO</label>
                            <label class="flex items-center text-[9px] font-black text-gray-400 cursor-pointer"><input type="radio" name="type-${id}" value="Digital" ${savedType === 'Digital' ? 'checked' : ''}> DIGITAL</label>
                        </div>
                    </div>`;
            }
            ul.appendChild(li);
        });
        sectionDiv.appendChild(ul);
        containerEl.appendChild(sectionDiv);
    });

    if (ACTIONS_ALWAYS_EXPENSES.includes(actionKey)) {
        containerEl.appendChild(renderExpenseTable());
        if (saved?.expenseData) fillExpenseData(saved.expenseData);
    }

    const checkReuVisibility = () => {
        const checkedLabels = Array.from(containerEl.querySelectorAll('.doc-checkbox:checked')).map(cb => cb.closest('label').querySelector('span').textContent);
        const needsReu = checkedLabels.some(txt => txt.includes('Endereço') || txt.includes('Trabalho') || txt.includes('Sobre o Réu') || txt.includes('Sobre o Cônjuge') || txt.includes('Suposto Pai'));
        const reuArea = getEl('address-editor-container');
        if (reuArea) {
            reuArea.classList.toggle('hidden', !needsReu);
            if (needsReu) {
                renderReuForm('address-editor-container');
                if (saved?.reuData) fillReuData(saved.reuData);
            }
        }
    };

    containerEl.querySelectorAll('.doc-checkbox').forEach(cb => {
        cb.onchange = (e) => {
            const t = getEl(`type-${e.target.id}`);
            if (t) {
                t.classList.toggle('hidden', !e.target.checked);
                if (e.target.checked && !t.querySelector('input:checked')) t.querySelector('input[value="Físico"]').checked = true;
            }
            checkReuVisibility();
            containerEl.dispatchEvent(new Event('change', { bubbles: true }));
            updateVisualStatus('filling');
        };
    });

    checkReuVisibility();
    containerEl.dispatchEvent(new Event('change', { bubbles: true }));
}

// --- 8. SALVAMENTO E AÇÕES ---

async function handleSave() {
    if (!currentAssistedId) return;
    const container = getEl('checklist-container');
    const checkedIds = Array.from(container.querySelectorAll('.doc-checkbox:checked')).map(cb => cb.id);
    const docTypes = {};
    checkedIds.forEach(id => { docTypes[id] = document.querySelector(`input[name="type-${id}"]:checked`)?.value || 'Físico'; });

    const payload = {
        documentChecklist: {
            action: currentChecklistAction, checkedIds, docTypes,
            reuData: getReuDataFromForm(),
            expenseData: getExpenseDataFromForm()
        },
        documentState: 'saved'
    };

    try {
        await updateDoc(doc(db, "pautas", currentPautaId, "attendances", currentAssistedId), payload);
        showNotification("Dados salvos com sucesso!");
        getEl('documents-modal').classList.add('hidden');
    } catch (e) { console.error(e); }
}

function getReuDataFromForm() {
    if (!getEl('nome-reu')) return null;
    return {
        nome: getEl('nome-reu').value, cpf: getEl('cpf-reu').value, telefone: getEl('telefone-reu').value,
        cep: getEl('cep-reu').value, rua: getEl('rua-reu').value, numero: getEl('numero-reu').value, 
        bairro: getEl('bairro-reu').value, cidade: getEl('cidade-reu').value, uf: getEl('estado-reu').value,
        empresa: getEl('empresa-reu')?.value || '', enderecoTrabalho: getEl('endereco-trabalho-reu')?.value || ''
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
    s('empresa-reu', d.empresa); s('endereco-trabalho-reu', d.enderecoTrabalho);
}

function fillExpenseData(d) {
    EXPENSE_CATEGORIES.forEach(c => { const el = getEl(`expense-${c.id}`); if (el) el.value = d[c.id] || ''; });
    let total = 0;
    document.querySelectorAll('.expense-input').forEach(i => total += parseCurrency(i.value));
    const totalEl = getEl('expense-total'); if(totalEl) totalEl.textContent = formatCurrency(total);
}

// --- 9. GERAÇÃO DE PDF ---

async function handlePdf() {
    try {
        await updateVisualStatus('pdf');
        const { jsPDF } = window.jspdf;
        const docPDF = new jsPDF();
        const pageWidth = docPDF.internal.pageSize.getWidth();
        let y = 20;

        docPDF.setFontSize(16);
        docPDF.text("Checklist de Atendimento - SIGAP", pageWidth / 2, y, { align: "center" });
        y += 15;

        docPDF.setFontSize(12);
        docPDF.text(`Assistido: ${getEl('documents-assisted-name')?.textContent || ''}`, 15, y); y += 7;
        docPDF.text(`Ação: ${getEl('checklist-title')?.textContent || ''}`, 15, y); y += 15;

        // 1. DOCUMENTAÇÃO COM TIPO (FÍSICO/DIGITAL)
        docPDF.setFont("helvetica", "bold");
        docPDF.text("DOCUMENTAÇÃO ENTREGUE:", 15, y); y += 8;
        docPDF.setFont("helvetica", "normal");
        docPDF.setFontSize(10);
        
        const checked = document.querySelectorAll('.doc-checkbox:checked');
        checked.forEach(cb => {
            const text = cb.closest('label').querySelector('span').textContent;
            const type = document.querySelector(`input[name="type-${cb.id}"]:checked`)?.value || 'Físico';
            docPDF.text(`[X] ${text} - [${type.toUpperCase()}]`, 20, y);
            y += 6; if (y > 280) { docPDF.addPage(); y = 20; }
        });

        // 2. PLANILHA DE GASTOS
        const expenses = getExpenseDataFromForm();
        if (Object.values(expenses).some(v => v)) {
            y += 10;
            docPDF.setFont("helvetica", "bold");
            docPDF.text("PLANILHA DE GASTOS:", 15, y); y += 8;
            docPDF.setFont("helvetica", "normal");
            EXPENSE_CATEGORIES.forEach(c => {
                if (expenses[c.id]) {
                    docPDF.text(`${c.label}: ${expenses[c.id]}`, 20, y);
                    y += 6;
                }
            });
            const total = getEl('expense-total')?.textContent || 'R$ 0,00';
            docPDF.setFont("helvetica", "bold");
            docPDF.text(`${total}`, 20, y); y += 10;
        }

        // 3. DADOS DO RÉU
        const reu = getReuDataFromForm();
        if (reu && reu.nome) {
            y += 5;
            if (y > 250) { docPDF.addPage(); y = 20; }
            docPDF.setFont("helvetica", "bold");
            docPDF.text("DADOS DA PARTE CONTRÁRIA (RÉU):", 15, y); y += 8;
            docPDF.setFont("helvetica", "normal");
            docPDF.text(`Nome: ${reu.nome}`, 20, y); y += 6;
            docPDF.text(`CPF: ${reu.cpf} | WhatsApp: ${reu.telefone}`, 20, y); y += 6;
            docPDF.text(`Endereço: ${reu.rua}, ${reu.numero} - ${reu.bairro}`, 20, y); y += 6;
            docPDF.text(`Cidade: ${reu.cidade}/${reu.uf} | CEP: ${reu.cep}`, 20, y);
        }

        docPDF.save(`Checklist_SIGAP.pdf`);
    } catch (err) { console.error("Erro PDF:", err); }
}

async function handleReset() {
    if (!confirm("Isso apagará o checklist e o réu. Deseja mudar de assunto?")) return;
    try {
        await updateVisualStatus(null);
        await updateDoc(doc(db, "pautas", currentPautaId, "attendances", currentAssistedId), { documentChecklist: null });
        handleBack();
    } catch (e) { console.error(e); }
}

function handleBack() {
    if (getEl('document-checklist-view')) getEl('document-checklist-view').classList.add('hidden');
    if (getEl('document-checklist-view-header')) getEl('document-checklist-view-header').classList.add('hidden');
    if (getEl('checklist-search-container')) getEl('checklist-search-container').classList.add('hidden');
    if (getEl('document-action-selection')) getEl('document-action-selection').classList.remove('hidden');
    if (getEl('address-editor-container')) getEl('address-editor-container').classList.add('hidden');
}

// --- 10. EXPORTS ---

export function setupDetailsModal(config) {
    console.log("setupDetailsModal chamado", config);
    db = config.db; 
    customShowNotification = config.showNotification;
    
    const actionSelection = getEl('document-action-selection');
    if (actionSelection) {
        // IMPORTANTE: Remover listeners antigos para evitar duplicação
        const newActionSelection = actionSelection.cloneNode(true);
        actionSelection.parentNode.replaceChild(newActionSelection, actionSelection);
        
        newActionSelection.addEventListener('click', async (e) => {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;
            
            const key = btn.dataset.action;
            console.log("Ação selecionada:", key);
            
            await updateVisualStatus('selected', documentsData[key].title);
            renderChecklist(key);
            
            // Esconder seleção e mostrar checklist
            const selectionArea = getEl('document-action-selection');
            const checklistView = getEl('document-checklist-view');
            
            if (selectionArea) selectionArea.classList.add('hidden');
            if (checklistView) {
                checklistView.classList.remove('hidden');
                checklistView.classList.add('flex');
            }
        });
    }

    const backBtn = getEl('back-to-action-selection-btn');
    if (backBtn) {
        backBtn.onclick = handleBack;
    }

    const saveBtn = getEl('save-checklist-btn');
    if (saveBtn) {
        saveBtn.onclick = handleSave;
    }

    const printBtn = getEl('print-checklist-btn');
    if (printBtn) {
        printBtn.onclick = handlePdf;
    }

    const resetBtn = getEl('reset-checklist-btn');
    if (resetBtn) {
        resetBtn.onclick = handleReset;
    }
    
    const searchInput = getEl('checklist-search');
    if (searchInput) {
        searchInput.oninput = (e) => {
            const term = normalizeLocal(e.target.value);
            document.querySelectorAll('label.checklist-row').forEach(row => {
                const text = normalizeLocal(row.textContent);
                row.closest('div').style.display = text.includes(term) ? 'block' : 'none';
            });
        };
    }
}

export function openDetailsModal(config) {
    console.log("openDetailsModal chamado", config);
    
    if (!config || !config.assistedId || !config.pautaId) {
        console.error("Configuração inválida para openDetailsModal", config);
        return;
    }
    
    currentAssistedId = config.assistedId; 
    currentPautaId = config.pautaId; 
    allAssisted = config.allAssisted || [];
    
    const assisted = allAssisted.find(a => a.id === currentAssistedId); 
    if (!assisted) {
        console.error("Assistido não encontrado:", currentAssistedId);
        return;
    }
    
    const nameEl = getEl('documents-assisted-name');
    if (nameEl) nameEl.textContent = assisted.name;
    
    // Preparar área de seleção de assunto
    const selectionArea = getEl('document-action-selection');
    if (selectionArea) {
        selectionArea.innerHTML = '<p class="text-gray-500 mb-6 text-sm text-center font-bold uppercase tracking-widest opacity-50">Selecione o Assunto</p><div class="grid grid-cols-1 sm:grid-cols-2 gap-3 action-grid"></div>';
        const grid = selectionArea.querySelector('.action-grid');
        if (grid) {
            Object.keys(documentsData).forEach(k => {
                const btn = document.createElement('button');
                btn.dataset.action = k;
                btn.className = "text-left p-4 bg-white border-2 border-gray-100 hover:border-green-500 rounded-xl transition-all shadow-sm group";
                btn.innerHTML = `<span class="font-bold text-gray-700 uppercase text-xs tracking-tighter">${documentsData[k].title}</span>`;
                grid.appendChild(btn);
            });
        }
    }

    // Se já tiver um checklist salvo, carregar direto
    if (assisted.documentChecklist?.action) {
        renderChecklist(assisted.documentChecklist.action);
        if (selectionArea) selectionArea.classList.add('hidden');
        const checklistView = getEl('document-checklist-view');
        if (checklistView) {
            checklistView.classList.remove('hidden');
            checklistView.classList.add('flex');
        }
    } else {
        // Garantir que a view de checklist esteja escondida
        const checklistView = getEl('document-checklist-view');
        if (checklistView) {
            checklistView.classList.add('hidden');
            checklistView.classList.remove('flex');
        }
        if (selectionArea) selectionArea.classList.remove('hidden');
    }
    
    const modal = getEl('documents-modal');
    if (modal) {
        modal.classList.remove('hidden');
    } else {
        console.error("Modal de documentos não encontrado");
    }
}

// Tornar a função global para acesso pelo pauta.js
window.openDetailsModal = openDetailsModal;
window.setupDetailsModal = setupDetailsModal;
