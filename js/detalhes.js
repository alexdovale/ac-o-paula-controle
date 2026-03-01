/**
 * detalhes.js - SIGAP
 * Versão COMPLETA com busca de assuntos e design 100% responsivo para mobile
 */

import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showNotification } from './utils.js';

// --- 1. CONSTANTES DE DOCUMENTAÇÃO ---
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

// --- 2. BASE DE DADOS DE AÇÕES ---
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

// --- 3. ESTADO GLOBAL ---
let currentAssistedId = null;
let currentPautaId = null;
let db = null;
let allAssisted = [];
let currentChecklistAction = null;

const getEl = (id) => document.getElementById(id);

const normalizeLocal = (str) => str ? str.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : '';

// --- 4. FUNÇÕES AUXILIARES ---
function formatCurrency(v) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function parseCurrency(s) {
    return !s ? 0 : parseFloat(s.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
}

// --- 5. RENDERIZAÇÃO DO CHECKLIST ---
function renderChecklist(actionKey) {
    console.log("📋 Renderizando checklist para:", actionKey);
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

    // Adicionar listeners aos checkboxes
    containerEl.querySelectorAll('.doc-checkbox').forEach(cb => {
        cb.onchange = (e) => {
            const t = getEl(`type-${e.target.id}`);
            if (t) {
                t.classList.toggle('hidden', !e.target.checked);
                if (e.target.checked && !t.querySelector('input:checked')) {
                    t.querySelector('input[value="Físico"]').checked = true;
                }
            }
            // Atualizar status para 'filling' quando qualquer checkbox for alterado
            updateDocumentState('filling');
        };
    });
}

// --- 6. FUNÇÃO PARA ATUALIZAR ESTADO DO DOCUMENTO ---
async function updateDocumentState(state) {
    if (!currentAssistedId || !currentPautaId || !db) return;
    
    try {
        const docRef = doc(db, "pautas", currentPautaId, "attendances", currentAssistedId);
        await updateDoc(docRef, { 
            documentState: state,
            selectedAction: currentChecklistAction ? documentsData[currentChecklistAction]?.title : null
        });
    } catch (e) {
        console.error("Erro ao atualizar estado:", e);
    }
}

// --- 7. FORMULÁRIOS DINÂMICOS ---
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
        };
    });
    return div;
}

function getReuDataFromForm() {
    if (!getEl('nome-reu')) return null;
    return {
        nome: getEl('nome-reu')?.value || '',
        cpf: getEl('cpf-reu')?.value || '',
        telefone: getEl('telefone-reu')?.value || '',
        cep: getEl('cep-reu')?.value || '',
        rua: getEl('rua-reu')?.value || '',
        numero: getEl('numero-reu')?.value || '',
        bairro: getEl('bairro-reu')?.value || '',
        cidade: getEl('cidade-reu')?.value || '',
        uf: getEl('estado-reu')?.value || '',
        empresa: getEl('empresa-reu')?.value || '',
        enderecoTrabalho: getEl('endereco-trabalho-reu')?.value || ''
    };
}

function getExpenseDataFromForm() {
    const d = {};
    EXPENSE_CATEGORIES.forEach(c => {
        d[c.id] = getEl(`expense-${c.id}`)?.value || '';
    });
    return d;
}

function fillReuData(d) {
    if (!d) return;
    const s = (id, v) => { const el = getEl(id); if (el) el.value = v || ''; };
    s('nome-reu', d.nome);
    s('cpf-reu', d.cpf);
    s('telefone-reu', d.telefone);
    s('cep-reu', d.cep);
    s('rua-reu', d.rua);
    s('numero-reu', d.numero);
    s('bairro-reu', d.bairro);
    s('cidade-reu', d.cidade);
    s('estado-reu', d.uf);
    s('empresa-reu', d.empresa);
    s('endereco-trabalho-reu', d.enderecoTrabalho);
}

function fillExpenseData(d) {
    EXPENSE_CATEGORIES.forEach(c => {
        const el = getEl(`expense-${c.id}`);
        if (el) el.value = d[c.id] || '';
    });
    let total = 0;
    document.querySelectorAll('.expense-input').forEach(i => total += parseCurrency(i.value));
    const totalEl = getEl('expense-total');
    if(totalEl) totalEl.textContent = formatCurrency(total);
}

// --- 8. AÇÕES (SALVAR, PDF, RESET) ---
async function handleSave() {
    console.log("💾 handleSave chamado");
    
    if (!currentAssistedId || !currentPautaId) {
        showNotification("Erro: assistido não identificado", "error");
        return;
    }
    
    if (!db) {
        console.error("db não definido");
        showNotification("Erro de conexão com banco de dados", "error");
        return;
    }
    
    const container = getEl('checklist-container');
    const checkedIds = Array.from(container.querySelectorAll('.doc-checkbox:checked')).map(cb => cb.id);
    const docTypes = {};
    checkedIds.forEach(id => {
        docTypes[id] = document.querySelector(`input[name="type-${id}"]:checked`)?.value || 'Físico';
    });

    const payload = {
        documentChecklist: {
            action: currentChecklistAction,
            checkedIds,
            docTypes,
            reuData: getReuDataFromForm(),
            expenseData: getExpenseDataFromForm()
        },
        documentState: 'saved'
    };

    try {
        const docRef = doc(db, "pautas", currentPautaId, "attendances", currentAssistedId);
        await updateDoc(docRef, payload);
        showNotification("Dados salvos com sucesso!");
        getEl('documents-modal').classList.add('hidden');
    } catch (e) {
        console.error("Erro ao salvar:", e);
        showNotification("Erro ao salvar dados", "error");
    }
}

async function handlePdf() {
    showNotification("Gerando PDF...", "info");
    
    // Atualizar estado para PDF
    if (currentAssistedId && currentPautaId && db) {
        await updateDocumentState('pdf');
    }
    
    try {
        const { jsPDF } = window.jspdf;
        const docPDF = new jsPDF();
        const pageWidth = docPDF.internal.pageSize.getWidth();
        let y = 20;

        docPDF.setFontSize(16);
        docPDF.text("Checklist de Atendimento - SIGAP", pageWidth / 2, y, { align: "center" });
        y += 15;

        docPDF.setFontSize(12);
        docPDF.text(`Assistido: ${getEl('documents-assisted-name')?.textContent || ''}`, 15, y);
        y += 7;
        docPDF.text(`Ação: ${getEl('checklist-title')?.textContent || ''}`, 15, y);
        y += 15;

        const checked = document.querySelectorAll('.doc-checkbox:checked');
        
        if (checked.length > 0) {
            docPDF.setFont("helvetica", "bold");
            docPDF.text("DOCUMENTAÇÃO ENTREGUE:", 15, y);
            y += 8;
            docPDF.setFont("helvetica", "normal");
            docPDF.setFontSize(10);
            
            checked.forEach(cb => {
                const text = cb.closest('label').querySelector('span').textContent;
                const type = document.querySelector(`input[name="type-${cb.id}"]:checked`)?.value || 'Físico';
                docPDF.text(`[X] ${text} - [${type.toUpperCase()}]`, 20, y);
                y += 6;
                if (y > 280) {
                    docPDF.addPage();
                    y = 20;
                }
            });
        }

        docPDF.save(`Checklist_SIGAP.pdf`);
        showNotification("PDF gerado com sucesso!");
    } catch (err) {
        console.error("Erro PDF:", err);
        showNotification("Erro ao gerar PDF", "error");
    }
}

async function handleReset() {
    if (!confirm("Isso apagará o checklist e o réu. Deseja mudar de assunto?")) return;
    try {
        if (db && currentPautaId && currentAssistedId) {
            const docRef = doc(db, "pautas", currentPautaId, "attendances", currentAssistedId);
            await updateDoc(docRef, { 
                documentChecklist: null,
                documentState: null,
                selectedAction: null
            });
        }
        handleBack();
    } catch (e) {
        console.error(e);
    }
}

function handleBack() {
    getEl('document-checklist-view')?.classList.add('hidden');
    getEl('document-checklist-view-header')?.classList.add('hidden');
    getEl('checklist-search-container')?.classList.add('hidden');
    getEl('document-action-selection')?.classList.remove('hidden');
    getEl('address-editor-container')?.classList.add('hidden');
}

// --- 9. EXPORTS PRINCIPAIS ---
export function setupDetailsModal(config) {
    console.log("⚙️ setupDetailsModal chamado", config);
    db = config.db;

    // Configurar botões
    getEl('back-to-action-selection-btn').onclick = handleBack;
    getEl('save-checklist-btn').onclick = handleSave;
    getEl('print-checklist-btn').onclick = handlePdf;
    getEl('reset-checklist-btn').onclick = handleReset;
    
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
    console.log("🔓 openDetailsModal chamado", config);
    
    if (!config || !config.assistedId || !config.pautaId) {
        console.error("Configuração inválida");
        return;
    }
    
    currentAssistedId = config.assistedId;
    window.currentAssistedId = config.assistedId; // Garantir disponibilidade global
    currentPautaId = config.pautaId;
    allAssisted = config.allAssisted || [];
    
    const assisted = allAssisted.find(a => a.id === currentAssistedId);
    if (!assisted) {
        console.error("Assistido não encontrado");
        return;
    }
    
    getEl('documents-assisted-name').textContent = assisted.name;
    
    // === SEÇÃO DE BUSCA DE ASSUNTOS (RESPONSIVA) ===
    const selectionArea = getEl('document-action-selection');
    if (selectionArea) {
        selectionArea.innerHTML = `
            <div class="p-2 sm:p-4">
                <div class="mb-4">
                    <input type="text" 
                           id="subject-search-input" 
                           placeholder="🔍 Buscar assunto..." 
                           class="w-full p-3 border-2 border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all">
                </div>
                <p class="text-gray-500 mb-4 text-xs sm:text-sm text-center font-bold uppercase tracking-widest opacity-50">Selecione o Assunto</p>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 action-grid max-h-[50vh] overflow-y-auto p-1"></div>
            </div>
        `;
        
        const grid = selectionArea.querySelector('.action-grid');
        const searchInput = selectionArea.querySelector('#subject-search-input');
        
        // Criar array com todos os assuntos para busca
        const subjectsList = Object.keys(documentsData).map(key => ({
            key,
            title: documentsData[key].title
        }));
        
        // Função para renderizar os botões filtrados
        function renderFilteredSubjects(filterText = '') {
            grid.innerHTML = '';
            const filtered = subjectsList.filter(s => 
                normalizeLocal(s.title).includes(normalizeLocal(filterText))
            );
            
            if (filtered.length === 0) {
                grid.innerHTML = '<p class="text-center text-gray-400 py-8 col-span-2">Nenhum assunto encontrado</p>';
                return;
            }
            
            filtered.forEach(({key, title}) => {
                const btn = document.createElement('button');
                btn.dataset.action = key;
                btn.className = "text-left p-3 sm:p-4 bg-white border-2 border-gray-100 hover:border-green-500 rounded-xl transition-all shadow-sm group text-sm sm:text-base";
                btn.innerHTML = `<span class="font-bold text-gray-700 uppercase text-[10px] sm:text-xs tracking-tighter">${title}</span>`;
                
                btn.onclick = (e) => {
                    e.preventDefault();
                    console.log("🎯 Botão clicado:", key, title);
                    renderChecklist(key);
                    selectionArea.classList.add('hidden');
                    getEl('document-checklist-view').classList.remove('hidden');
                    getEl('document-checklist-view').classList.add('flex');
                    
                    // Atualizar estado para 'selected'
                    updateDocumentState('selected');
                };
                
                grid.appendChild(btn);
            });
        }
        
        // Renderizar todos inicialmente
        renderFilteredSubjects();
        
        // Adicionar listener para busca
        searchInput.addEventListener('input', (e) => {
            renderFilteredSubjects(e.target.value);
        });
    }

    if (assisted.documentChecklist?.action) {
        renderChecklist(assisted.documentChecklist.action);
        selectionArea?.classList.add('hidden');
        getEl('document-checklist-view')?.classList.remove('hidden');
        getEl('document-checklist-view')?.classList.add('flex');
    } else {
        getEl('document-checklist-view')?.classList.add('hidden');
        getEl('document-checklist-view')?.classList.remove('flex');
        selectionArea?.classList.remove('hidden');
    }
    
    getEl('documents-modal')?.classList.remove('hidden');
}

// Tornar funções globais
window.openDetailsModal = openDetailsModal;
window.setupDetailsModal = setupDetailsModal;
window.documentsData = documentsData;

console.log("✅ detalhes.js carregado com sucesso!");
console.log("📋 documentsData keys:", Object.keys(documentsData));
