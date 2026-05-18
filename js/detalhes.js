/**
 * ========================================================
 * DETALHES.JS - SIGEP
 * Módulo de Detalhes do Assistido, Checklist de Documentos
 * e Acúmulo de Demandas Adicionais Unificadas por Assunto
 * ========================================================
 */

import { doc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showNotification, escapeHTML } from './utils.js';
import { PDFService } from './pdfService.js';
import { flatSubjects } from './assuntos.js'; // ⚖️ Importação da árvore oficial de assuntos do SIGEP

/* ========================================================
   1. CONSTANTES E CONFIGURAÇÕES
   ======================================================== */

const BASE_DOCS = [
    'Carteira de Identidade (RG) ou Habilitação (CNH)',
    'CPF',
    'Comprovante de Residência (Atualizado - últimos 3 meses)'
];

const INCOME_DOCS_STRUCTURED = [
    { type: 'title', text: '1. TRABALHADOR FORMAL (CLT / SERVIDOR)' },
    'Contracheque (3 últimos meses)',
    'Carteira de Trabalho (Física ou Digital - Print das telas)',
    'Extrato Analítico do FGTS',
    
    { type: 'title', text: '2. APOSENTADO / PENSIONISTA / BPC-LOAS' },
    'Extrato de Pagamento de Benefício (Portal Meu INSS)',
    'Histórico de Crédito - HISCRE (Portal Meu INSS)',
    'Extrato bancário da conta onde recebe o benefício',
    
    { type: 'title', text: '3. AUTÔNOMO / TRABALHADOR INFORMAL' },
    'Declaração de Hipossuficiência (Próprio Punho - informando média mensal)',
    'Extratos Bancários (3 últimos meses)',
    'Comprovante de Inscrição no CadÚnico',
    
    { type: 'title', text: '4. DESEMPREGADO' },
    'Carteira de Trabalho (Página da baixa do último emprego)',
    'Comprovante de Seguro-Desemprego (se estiver recebendo)',
    'Declaração de Hipossuficiência (Informando ausência de renda)',
    'Extrato do CNIS (Meu INSS - prova ausência de vínculo ativo)',
    
    { type: 'title', text: '5. PROVAS GERAIS E IMPOSTO DE RENDA' },
    'Extrato do Bolsa Família',
    'Folha Resumo do CadÚnico',
    'IRPF - Cenário 1 (Declarante): Cópia da Declarat de IR',
    'IRPF - Cenário 2 (Isento): Declaração de Isenção de Imposto de Renda'
];

const COMMON_DOCS_FULL = [...BASE_DOCS, ...INCOME_DOCS_STRUCTURED];

const EXPENSE_CATEGORIES = [
    { id: 'moradia', label: '1. MORADIA (Habitação)', desc: 'Aluguel, condomínio, IPTU, luz, água, gás.' },
    { id: 'alimentacao', label: '2. ALIMENTAÇÃO', desc: 'Supermercado, feira, açougue, lanches, leites especiais.' },
    { id: 'educacao', label: '3. EDUCAÇÃO', desc: 'Mensalidade escolar, material, uniforme, transporte escolar, cursos.' },
    { id: 'saude', label: '4. SAÚDE', desc: 'Plano de saúde, medicamentos, consultas, tratamentos (dentista, psicólogo).' },
    { id: 'vestuario', label: '5. VESTUÁRIO E HIGIENE', desc: 'Roupas, calçados, fraldas, produtos de higiene pessoal.' },
    { id: 'lazer', label: '6. LAZER E TRANSPORTE', desc: 'Passeios, festas, cinema, transporte público, combustível.' },
    { id: 'outras', label: '7. OUTRAS DESPESAS', desc: 'Babá, pets, atividades extracurriculares, celular, internet.' }
];

const ACTIONS_ALWAYS_EXPENSES = [
    'alimentos_fixacao_majoracao_oferta',
    'alimentos_gravidicos',
    'alimentos_avoengos',
    'investigacao_paternidade',
    'guarda'
];

const ACTIONS_WITH_WORK_INFO = [
    'obrigacao_fazer',
    'declaratoria_nulidade',
    'indenizacao_danos',
    'revisional_debito',
    'exigir_contas',
    'alimentos_fixacao_majoracao_oferta',
    'alimentos_gravidicos',
    'alimentos_avoengos',
    'divorcio_litigioso',
    'uniao_estavel',
    'guarda',
    'regulamentacao_convivencia',
    'investigacao_paternidade'
];

/* ========================================================
   2. BASE DE DADOS DE AÇÕES COMPLETA (MAPPED)
   ======================================================== */
export const documentsData = {
    obrigacao_fazer: {
        title: 'Obrigação de Fazer',
        sections: [
            { title: 'Base e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Específicos', docs: ['Contrato/Acordo', 'Provas do descumprimento'] }
        ]
    },
    declaratoria_nulidade: {
        title: 'Declaratória de Nulidade',
        sections: [
            { title: 'Base e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Específicos', docs: ['Documento a anular', 'Provas da ilegalidade'] }
        ]
    },
    indenizacao_danos: {
        title: 'Ação de Indenização',
        sections: [
            { title: 'Base e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Específicos', docs: ['BO', 'Fotos / Vídeos do Dano', 'Orçamentos de Reparo', 'Notas Fiscais de Prejuízos', 'Rol de Testemunhas'] }
        ]
    },
    revisional_debito: {
        title: 'Ação Revisional de Débito',
        sections: [
            { title: 'Base e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Específicos', docs: ['Contrato de Financiamento', 'Planilha de Evolução do Débito', 'Extratos Bancários Recentes'] }
        ]
    },
    exigir_contas: {
        title: 'Ação de Exigir Contas',
        sections: [
            { title: 'Base e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Específicos', docs: ['Prova da administração de bens', 'Notificação ou recusa em prestar contas'] }
        ]
    },
    alimentos_fixacao_majoracao_oferta: {
        title: 'Alimentos (Fixação / Majoração / Oferta)',
        sections: [
            { title: 'Base e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Do Alimentando', docs: ['Certidão de Nascimento', 'Comprovantes de despesas da criança'] }
        ]
    },
    alimentos_gravidicos: {
        title: 'Ação de Alimentos Gravídicos',
        sections: [
            { title: 'Base e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Da Gestação', docs: ['Exame de Gravidez (Beta HCG)', 'Caderneta de Pré-Natal / Relatórios Médicos'] }
        ]
    },
    alimentos_avoengos: {
        title: 'Alimentos Avoengos',
        sections: [
            { title: 'Base e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Específicos', docs: ['Certidão de Nascimento', 'Prova da impossibilidade material dos genitores'] }
        ]
    },
    divorcio_consensual: {
        title: 'Divórcio Consensual',
        sections: [
            { title: 'Documentação (Ambos)', docs: ['RG e CPF de ambos', 'Comprovante de Residência de ambos', 'Certidão de Casamento Atualizada', ...INCOME_DOCS_STRUCTURED] },
            { title: 'Filhos/Bens', docs: ['Certidão de Nascimento dos Filhos', 'Documentos de Propriedade de Bens'] }
        ]
    },
    divorcio_litigioso: {
        title: 'Divórcio Litigioso',
        sections: [
            { title: 'Base e Renda', docs: [...COMMON_DOCS_FULL, 'Certidão de Casamento Atualizada'] },
            { title: 'Filhos/Bens', docs: ['Certidão de Nascimento dos Filhos', 'Documentos de Propriedade de Bens'] }
        ]
    },
    uniao_estavel: {
        title: 'União Estável (Reconhecimento/Dissolução)',
        sections: [
            { title: 'Base e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Provas da Convivência', docs: ['Certidão de Nascimento de filhos comuns', 'Comprovante de mesmo endereço', 'Contas bancárias conjuntas', 'Fotos do casal', 'Rol de Testemunhas'] }
        ]
    },
    guarda: {
        title: 'Ação de Guarda',
        sections: [
            { title: 'Base e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Da Criança', docs: ['Certidão de Nascimento', 'Declaração de Matrícula Escolar', 'Cartão de Vacinação Atualizado'] }
        ]
    },
    regulamentacao_convivencia: {
        title: 'Regulamentação de Visitas',
        sections: [
            { title: 'Base e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Da Criança', docs: ['Certidão de Nascimento'] }
        ]
    },
    investigacao_paternidade: {
        title: 'Investigação de Paternidade',
        sections: [
            { title: 'Base e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Da Criança', docs: ['Certidão de Nascimento com paternidade em branco', 'Indícios ou provas do relacionamento'] }
        ]
    },
    curatela: {
        title: 'Curatela (Interdição)',
        sections: [
            { title: 'Base e Renda (Curador)', docs: COMMON_DOCS_FULL },
            { title: 'Do Curatelando', docs: ['RG e CPF do Curatelando', 'Certidão de Nascimento ou Casamento', 'Extrato de Benefício do INSS', 'Atestado / Laudo Médico Detalhado com CID'] }
        ]
    },
    retificacao_registro_civil: {
        title: 'Retificação Registro Civil',
        sections: [
            { title: 'Base e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Específicos', docs: ['Certidão que apresenta o erro', 'Documentos antigos que comprovam o dado correto'] }
        ]
    },
    alvara_valores: {
        title: 'Alvará (Valores)',
        sections: [
            { title: 'Base e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Do Falecido', docs: ['Certidão de Óbito', 'Extratos de contas bancárias / PIS / FGTS / Resíduos'] }
        ]
    },
    vaga_escola_creche: {
        title: 'Vaga em Creche/Escola',
        sections: [
            { title: 'Base e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Da Criança', docs: ['Certidão de Nascimento', 'Protocolo de Inscrição / Negativa de Vaga'] }
        ]
    }
};

/* ========================================================
   3. ESTADO GLOBAL
   ======================================================== */
let currentAssistedId = null;      
let currentPautaId = null;         
let db = null;                     
let allAssisted = [];              
let currentChecklistAction = null; 
let demandasAdicionaisLocais = []; 

const getEl = (id) => document.getElementById(id);

const normalizeLocal = (str) => str 
    ? str.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() 
    : '';

function formatCurrency(v) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function parseCurrency(s) {
    if (!s) return 0;
    return parseFloat(s.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
}

/* ========================================================
   5. FUNÇÕES DO CHECKLIST E DEMANDAS ADICIONAIS BY assuntos.js
   ======================================================== */
function getDocTypesFromForm() {
    const docTypes = {};
    document.querySelectorAll('.doc-checkbox:checked').forEach(cb => {
        const typeRadio = document.querySelector(`input[name="type-${cb.id}"]:checked`);
        docTypes[cb.id] = typeRadio ? typeRadio.value : 'Físico';
    });
    return docTypes;
}

function updateSelectedCounter() {
    const container = getEl('checklist-container');
    if (!container) return;
    
    const checkedDocs = container.querySelectorAll('.doc-checkbox:checked').length;
    const reuCheck = document.getElementById('check-reu-unico')?.checked ? 1 : 0;
    const gasesCheck = document.getElementById('check-exibir-gastos')?.checked ? 1 : 0;
    const totalChecked = checkedDocs + reuCheck + gasesCheck + demandasAdicionaisLocais.length;
    
    const counterEl = getEl('checklist-counter');
    if (counterEl) counterEl.textContent = `${totalChecked} itens selecionados no SIGEP`;
    
    if (totalChecked > 0) updateDocumentState('filling');
}

async function updateDocumentState(state) {
    if (!currentAssistedId || !currentPautaId || !db) return;
    try {
        const docRef = doc(db, "pautas", currentPautaId, "attendances", currentAssistedId);
        const actionTitle = currentChecklistAction ? documentsData[currentChecklistAction]?.title : null;
        
        await updateDoc(docRef, { 
            documentState: state,
            selectedAction: actionTitle,
            lastActionBy: window.app?.currentUserName || 'Sistema',
            lastActionTimestamp: new Date().toISOString()
        });
    } catch (e) {
        console.error("Erro ao atualizar estado no SIGEP:", e);
    }
}

function checkReuVisibility() {
    const reuArea = getEl('address-editor-container');
    if (!reuArea) return;
    const actionRequiresReu = ACTIONS_WITH_WORK_INFO.includes(currentChecklistAction);
    if (actionRequiresReu) {
        reuArea.classList.remove('hidden');
        if (reuArea.children.length === 0 || reuArea.innerHTML.trim() === '') renderReuForm('address-editor-container');
    } else {
        reuArea.classList.add('hidden');
    }
}

// ⭐ COMPATIBILIZADO: INTERFACE DO ATENDIMENTO CONECTADA COM O assuntos.js MEDIANTE DATALIST DO SISTEMA ⭐
function injectDemandasAdicionaisInterface(containerEl) {
    let divDemanda = document.getElementById('secao-demandas-adicionais-triagem');
    if (!divDemanda) {
        divDemanda = document.createElement('div');
        divDemanda.id = 'secao-demandas-adicionais-triagem';
        divDemanda.className = 'mt-6 p-4 bg-violet-50 border-2 border-violet-100 rounded-xl shadow-sm';
        containerEl.appendChild(divDemanda);
    }

    divDemanda.innerHTML = `
        <h4 class="text-sm font-bold text-violet-700 mb-2 flex items-center gap-1"><span>⚖️</span> Casos Acumulados no Atendimento</h4>
        <div class="flex gap-2 mb-3">
            <input type="text" id="input-nova-demanda-triagem" list="subjects-list-triagem-dinamico" class="flex-grow p-2.5 border rounded-lg text-xs bg-white outline-none focus:ring-2 focus:ring-violet-500" placeholder="Busque ou digite uma demanda do assuntos.js...">
            <datalist id="subjects-list-triagem-dinamico"></datalist>
            <button type="button" id="btn-add-demanda-triagem" class="bg-violet-600 text-white font-bold px-4 py-2 rounded-lg text-xs hover:bg-violet-700 uppercase transition shadow-sm">Somar</button>
        </div>
        <div id="lista-demandas-triagem-container" class="space-y-1.5 max-h-40 overflow-y-auto"></div>
    `;

    // Alimenta o datalist local de demandas usando a árvore oficial flatSubjects do assuntos.js
    const datalist = divDemanda.querySelector('#subjects-list-triagem-dinamico');
    if (datalist && Array.isArray(flatSubjects)) {
        flatSubjects.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.value;
            datalist.appendChild(opt);
        });
    }

    document.getElementById('btn-add-demanda-triagem').onclick = () => {
        const input = document.getElementById('input-nova-demanda-triagem');
        let text = input ? input.value.trim() : '';
        if (text) {
            // Limpa caminhos de nós de árvore longos se o usuário escolheu pelo clique completo (Ex: "Família > Alimentos" vira "Alimentos")
            if (text.includes(' > ')) text = text.split(' > ').pop();
            demandasAdicionaisLocais.push(text);
            input.value = '';
            renderListaDemandasTriagem();
            updateSelectedCounter();
        }
    };

    renderListaDemandasTriagem();
}

function renderListaDemandasTriagem() {
    const container = document.getElementById('lista-demandas-triagem-container');
    if (!container) return;
    container.innerHTML = '';

    if (demandasAdicionaisLocais.length === 0) {
        container.innerHTML = '<p class="text-[11px] text-gray-400 italic text-center py-2 bg-white rounded border border-dashed">Nenhuma demanda extra cadastrada.</p>';
        return;
    }

    demandasAdicionaisLocais.forEach((dem, idx) => {
        const item = document.createElement('div');
        item.className = "flex justify-between items-center bg-white border p-2 rounded-lg text-xs shadow-sm shadow-slate-100";
        item.innerHTML = `
            <span class="font-bold text-slate-700">• ${escapeHTML(dem)}</span>
            <button type="button" class="text-[10px] text-red-500 hover:text-red-700 bg-red-50 px-2 py-0.5 rounded" data-idx="${idx}">Remover</button>
        `;
        item.querySelector('button').onclick = () => {
            demandasAdicionaisLocais.splice(idx, 1);
            renderListaDemandasTriagem();
            updateSelectedCounter();
        };
        container.appendChild(item);
    });
}

function renderChecklist(actionKey) {
    currentChecklistAction = actionKey;
    window.currentChecklistAction = actionKey; 
    const data = documentsData[actionKey];
    if (!data) return;

    const containerEl = getEl('checklist-container');
    if (!containerEl) return;

    const assisted = allAssisted.find(a => a.id === currentAssistedId);
    const saved = assisted?.documentChecklist;

    const titleEl = getEl('checklist-title');
    if (titleEl) titleEl.textContent = data.title;
    
    getEl('document-checklist-view-header-actions')?.classList.remove('hidden');
    getEl('checklist-search-container')?.classList.remove('hidden');
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
                            <label class="flex items-center text-[9px] font-black text-gray-400 cursor-pointer">
                                <input type="radio" name="type-${id}" value="Físico" ${savedType === 'Físico' ? 'checked' : ''}> FÍSICO
                            </label>
                            <label class="flex items-center text-[9px] font-black text-gray-400 cursor-pointer">
                                <input type="radio" name="type-${id}" value="Digital" ${savedType === 'Digital' ? 'checked' : ''}> DIGITAL
                            </label>
                        </div>
                    </div>`;
            }
            ul.appendChild(li);
        });
        sectionDiv.appendChild(ul);
        containerEl.appendChild(sectionDiv);
    });

    if (ACTIONS_ALWAYS_EXPENSES.includes(actionKey)) {
        addExpenseTable(containerEl, saved);
    } else {
        addExpenseButton(containerEl, saved);
    }

    injectDemandasAdicionaisInterface(containerEl);

    setupCheckboxEvents(containerEl);
    setTimeout(checkReuVisibility, 100);
    updateSelectedCounter();
    
    if (saved?.reuData) setTimeout(() => fillReuData(saved.reuData), 200);
}

function addExpenseTable(containerEl, saved) {
    let expenseContainer = document.getElementById('expense-table-container');
    if (!expenseContainer) {
        expenseContainer = document.createElement('div');
        expenseContainer.id = 'expense-table-container';
        expenseContainer.className = 'mt-4';
        containerEl.appendChild(expenseContainer);
    }
    expenseContainer.innerHTML = '';
    expenseContainer.appendChild(renderExpenseTable());
    if (saved?.expenseData) fillExpenseData(saved.expenseData);
}

function addExpenseButton(containerEl, saved) {
    const expenseButton = document.createElement('div');
    expenseButton.className = 'mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg text-center';
    expenseButton.id = 'expense-button-container';
    expenseButton.innerHTML = `<button id="btn-abrir-gastos" class="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-green-700">+ Adicionar Planilha de Gastos</button>`;
    containerEl.appendChild(expenseButton);
    
    if (saved?.expenseData && Object.values(saved.expenseData).some(v => v && v !== 'R$ 0,00')) {
        expenseButton.style.display = 'none';
        let expenseContainer = document.getElementById('expense-table-container');
        if (!expenseContainer) {
            expenseContainer = document.createElement('div');
            expenseContainer.id = 'expense-table-container';
            expenseContainer.className = 'mt-4';
            containerEl.appendChild(expenseContainer);
        }
        expenseContainer.innerHTML = '';
        expenseContainer.appendChild(renderExpenseTable());
        fillExpenseData(saved.expenseData);
    }
}

function setupCheckboxEvents(containerEl) {
    containerEl.querySelectorAll('.doc-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const t = getEl(`type-${e.target.id}`);
            if (t) {
                t.classList.toggle('hidden', !e.target.checked);
                if (e.target.checked && !t.querySelector('input:checked')) {
                    t.querySelector('input[value="Físico"]').checked = true;
                }
            }
            updateSelectedCounter();
            checkReuVisibility();
        });
    });

    setTimeout(() => {
        document.getElementById('btn-abrir-gastos')?.addEventListener('click', () => {
            document.getElementById('expense-button-container').style.display = 'none';
            let expenseContainer = document.getElementById('expense-table-container');
            if (!expenseContainer) {
                expenseContainer = document.createElement('div');
                expenseContainer.id = 'expense-table-container';
                expenseContainer.className = 'mt-4';
                containerEl.appendChild(expenseContainer);
            }
            expenseContainer.innerHTML = '';
            expenseContainer.appendChild(renderExpenseTable());
            updateSelectedCounter();
        });
    }, 100);
}

/* ========================================================
   6. FORMULÁRIO DO RÉU
   ======================================================== */
function renderReuForm(containerId) {
    const container = getEl(containerId);
    if (!container) return;

    container.innerHTML = `
        <div class="p-4 sm:p-6 bg-red-50 border-2 border-red-200 rounded-2xl shadow-sm mt-6">
            <div class="flex items-center gap-2 mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                <h3 class="text-sm font-black text-red-600 uppercase">DADOS DA PARTE CONTRÁRIA (RÉU) - ENDEREÇO PARA CITAÇÃO</h3>
            </div>
            
            <div class="bg-white p-4 rounded-lg border border-gray-200 mb-4" style="border: 2px solid #f97316;">
                <div class="flex items-center gap-3">
                    <input type="checkbox" id="check-reu-unico" class="h-5 w-5 text-red-600 rounded border-gray-300 focus:ring-red-500" checked>
                    <label for="check-reu-unico" class="text-sm font-bold text-gray-700 cursor-pointer">
                        📋 DADOS DO RÉU (Endereço completo e Dados de trabalho)
                    </label>
                </div>
            </div>

            <div id="content-reu-completo">
                ${renderReuIdentificacao()}
                ${renderReuResidencial()}
                ${renderReuComercial()}
            </div>
            ${renderReuSaveButton()}
        </div>
    `;

    initReuUnicoCheckbox();
    initCepSearch();
    initReuSaveButton();
}

function renderReuIdentificacao() {
    return `
        <div class="bg-white p-3 rounded-lg border border-gray-200 mb-4">
            <h4 class="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2"><span class="w-1 h-4 bg-red-600 rounded"></span>1. IDENTIFICAÇÃO DO RÉU</h4>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div class="md:col-span-2">
                    <label class="text-[9px] font-black text-gray-400 uppercase">Nome Completo</label>
                    <input type="text" id="nome-reu" placeholder="Nome completo do réu" class="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white">
                </div>
                <div>
                    <label class="text-[9px] font-black text-gray-400 uppercase">CPF</label>
                    <input type="text" id="cpf-reu" placeholder="000.000.000-00" maxlength="14" class="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white">
                </div>
                <div>
                    <label class="text-[9px] font-black text-gray-400 uppercase">Telefone</label>
                    <input type="text" id="telefone-reu" placeholder="(21) 99999-9999" maxlength="15" class="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white">
                </div>
            </div>
        </div>
    `;
}

function renderReuResidencial() {
    return `
        <div class="bg-red-50 p-3 rounded-lg border border-red-200 mb-4">
            <h4 class="text-sm font-bold text-red-700 mb-3 flex items-center gap-2"><span class="w-1 h-4 bg-red-600 rounded"></span>2. ENDEREÇO RESIDENCIAL</h4>
            <div class="space-y-3">
                <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div>
                        <label class="text-[9px] font-black text-gray-400 uppercase">CEP</label>
                        <div class="flex">
                            <input type="text" id="cep-reu" maxlength="9" placeholder="00000-000" class="w-full p-2 border-2 border-red-200 rounded-l-lg text-sm bg-white">
                            <button type="button" id="buscar-cep-reu-btn" class="bg-red-600 text-white px-3 rounded-r-lg text-xs font-bold">Buscar</button>
                        </div>
                    </div>
                    <div class="md:col-span-2">
                        <label class="text-[9px] font-black text-gray-400 uppercase">Logradouro</label>
                        <input type="text" id="rua-reu" class="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white">
                    </div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div><label class="text-[9px] font-black text-gray-400 uppercase">Número</label><input type="text" id="numero-reu" class="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white"></div>
                    <div class="md:col-span-2"><label class="text-[9px] font-black text-gray-400 uppercase">Complemento</label><input type="text" id="complemento-reu" class="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white"></div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div class="md:col-span-2"><label class="text-[9px] font-black text-gray-400 uppercase">Bairro</label><input type="text" id="bairro-reu" class="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white"></div>
                    <div><label class="text-[9px] font-black text-gray-400 uppercase">Cidade</label><input type="text" id="cidade-reu" class="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white"></div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div><label class="text-[9px] font-black text-gray-400 uppercase">Estado</label><select id="estado-reu" class="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white">${renderUfOptions()}</select></div>
                    <div><label class="text-[9px] font-black text-gray-400 uppercase">Ponto de Referência</label><input type="text" id="referencia-reu" class="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white"></div>
                </div>
            </div>
        </div>
    `;
}

function renderReuComercial() {
    return `
        <div class="bg-gray-50 p-3 rounded-lg border border-gray-200">
            <h4 class="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2"><span class="w-1 h-4 bg-gray-600 rounded"></span>3. DADOS DE TRABALHO</h4>
            <div class="space-y-3">
                <div><label class="text-[9px] font-black text-gray-400 uppercase">Empresa</label><input type="text" id="empresa-reu" class="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white"></div>
                <div><label class="text-[9px] font-black text-gray-400 uppercase">Logradouro Comercial</label><input type="text" id="rua-comercial-reu" class="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white"></div>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div><label class="text-[9px] font-black text-gray-400 uppercase">Número</label><input type="text" id="numero-comercial-reu" class="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white"></div>
                    <div class="md:col-span-2"><label class="text-[9px] font-black text-gray-400 uppercase">Complemento</label><input type="text" id="complemento-comercial-reu" class="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white"></div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div class="md:col-span-2"><label class="text-[9px] font-black text-gray-400 uppercase">Bairro</label><input type="text" id="bairro-comercial-reu" class="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white"></div>
                    <div><label class="text-[9px] font-black text-gray-400 uppercase">Cidade</label><input type="text" id="cidade-comercial-reu" class="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white"></div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div><label class="text-[9px] font-black text-gray-400 uppercase">Estado</label><select id="estado-comercial-reu" class="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white">${renderUfOptions()}</select></div>
                    <div><label class="text-[9px] font-black text-gray-400 uppercase">CEP Comercial</label><input type="text" id="cep-comercial-reu" placeholder="00000-000" maxlength="9" class="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white"></div>
                </div>
                <div class="flex justify-end"><button type="button" id="buscar-cep-comercial-reu-btn" class="bg-gray-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold">Buscar CEP Comercial</button></div>
            </div>
        </div>
    `;
}

function renderUfOptions() {
    const ufs = ['RJ','SP','MG','ES','PR','SC','RS','BA','CE','PE','DF','GO','MT','MS','AM','PA','AC','AL','AP','MA','PB','PI','RN','RO','RR','SE','TO'];
    return '<option value="">Selecionar UF</option>' + ufs.map(uf => `<option value="${uf}">${uf}</option>`).join('');
}

function renderReuSaveButton() {
    return `<div class="mt-4 text-right"><button type="button" id="salvar-reu-btn" class="bg-red-600 text-white font-bold py-2 px-4 rounded-lg text-xs uppercase shadow-sm">Salvar Dados do Réu</button></div>`;
}

function initReuUnicoCheckbox() {
    const checkUnico = getEl('check-reu-unico');
    const contentCompleto = getEl('content-reu-completo'); 
    if (checkUnico && contentCompleto) {
        checkUnico.addEventListener('change', function() {
            contentCompleto.style.display = this.checked ? 'block' : 'none';
            updateSelectedCounter();
        });
    }
}

function initCepSearch() {
    const cepInp = getEl('cep-reu');
    const buscarBtn = getEl('buscar-cep-reu-btn'); 
    
    async function buscarCEP(cep, tipo = 'residencial') {
        const val = cep.replace(/\D/g, '');
        if (val.length === 8) {
            try {
                const response = await fetch(`https://viacep.com.br/ws/${val}/json/`);
                const r = await response.json();
                if (!r.erro) {
                    if (tipo === 'residencial') {
                        getEl('rua-reu').value = r.logradouro || '';
                        getEl('bairro-reu').value = r.bairro || '';
                        getEl('cidade-reu').value = r.localidade || '';
                        getEl('estado-reu').value = r.uf || '';
                    } else {
                        getEl('rua-comercial-reu').value = r.logradouro || '';
                        getEl('bairro-comercial-reu').value = r.bairro || '';
                        getEl('cidade-comercial-reu').value = r.localidade || '';
                        getEl('estado-comercial-reu').value = r.uf || '';
                    }
                    showNotification("Endereço sincronizado no SIGEP!", "success");
                }
            } catch (error) {
                showNotification("Erro na busca do CEP", "error");
            }
        }
    }

    if (buscarBtn && cepInp) {
        buscarBtn.addEventListener('click', () => buscarCEP(cepInp.value, 'residencial'));
        cepInp.addEventListener('blur', () => buscarCEP(cepInp.value, 'residencial'));
    }

    const buscarComercialBtn = getEl('buscar-cep-comercial-reu-btn'); 
    const cepComercial = getEl('cep-comercial-reu');
    if (buscarComercialBtn && cepComercial) {
        buscarComercialBtn.addEventListener('click', () => buscarCEP(cepComercial.value, 'comercial'));
        cepComercial.addEventListener('blur', () => buscarCEP(cepComercial.value, 'comercial'));
    }
}

function initReuSaveButton() {
    const salvarBtn = getEl('salvar-reu-btn'); 
    if (salvarBtn) {
        salvarBtn.addEventListener('click', () => {
            handleSave(false);
            showNotification("Dados de qualificação salvos!", "success");
        });
    }
}

/* ========================================================
   7. PLANILHA DE GASTOS
   ======================================================== */
function renderExpenseTable() {
    const div = document.createElement('div');
    div.className = 'mt-6 p-4 bg-green-50 border-2 border-green-100 rounded-xl shadow-sm';
    div.id = 'expense-table';
    
    div.innerHTML = `
        <div class="flex items-center gap-3 mb-3">
            <input type="checkbox" id="check-exibir-gastos" class="h-5 w-5 text-green-600 rounded border-gray-300 focus:ring-green-500" checked>
            <label for="check-exibir-gastos" class="text-sm font-bold text-green-700 cursor-pointer">💰 PLANILHA DE GASTOS MENSAIS</label>
        </div>
        <div id="content-planilha-gastos">
            <table class="w-full border-collapse">
                ${EXPENSE_CATEGORIES.map(c => `
                    <tr class="border-b border-green-100 last:border-0">
                        <td class="py-3">
                            <p class="text-[10px] font-bold text-green-800 uppercase">${c.label}</p>
                            <p class="text-[9px] text-green-600 italic">${c.desc}</p>
                        </td>
                        <td class="py-3 pl-2">
                            <input type="text" id="expense-${c.id}" class="expense-input w-full p-2 bg-white border border-green-200 rounded-lg text-right text-xs" placeholder="R$ 0,00" inputmode="numeric">
                        </td>
                    </tr>
                `).join('')}
            </table>
            <div class="mt-4 flex justify-between font-black text-green-900 border-t border-green-200 pt-3 text-sm">
                <span>TOTAL CALCULADO:</span>
                <span id="expense-total">R$ 0,00</span>
            </div>
            <div class="mt-2 text-right"><button id="fechar-gastos" class="text-[10px] text-gray-500 hover:text-gray-700 underline">Fechar planilha</button></div>
        </div>
    `;
    initExpenseTableEvents(div);
    return div;
}

function initExpenseTableEvents(div) {
    const checkGastos = div.querySelector('#check-exibir-gastos');
    const contentGastos = div.querySelector('#content-planilha-gastos');
    
    if (checkGastos && contentGastos) {
        checkGastos.addEventListener('change', function() {
            contentGastos.style.display = this.checked ? 'block' : 'none';
            updateSelectedCounter();
        });
    }

    div.querySelectorAll('.expense-input').forEach(inp => {
        inp.addEventListener('input', (e) => {
            let v = e.target.value.replace(/\D/g, '');
            e.target.value = v ? (Number(v)/100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';
            
            let total = 0;
            div.querySelectorAll('.expense-input').forEach(i => total += parseCurrency(i.value));
            const totalEl = div.querySelector('#expense-total');
            if(totalEl) totalEl.textContent = formatCurrency(total);
        });
    });

    setTimeout(() => {
        div.querySelector('#fechar-gastos')?.addEventListener('click', () => {
            getEl('expense-table-container').innerHTML = '';
            const btnBox = getEl('expense-button-container');
            if (btnBox) btnBox.style.display = 'block';
            updateSelectedCounter();
        });
    }, 100);
}

/* ========================================================
   8. FUNÇÕES DE DADOS (GET/SET)
   ======================================================== */
function getReuDataFromForm() {
    return {
        checkReuUnico: getEl('check-reu-unico')?.checked || false,
        nome: getEl('nome-reu')?.value || '',
        cpf: getEl('cpf-reu')?.value || '',
        telefone: getEl('telefone-reu')?.value || '',
        cep: getEl('cep-reu')?.value || '',
        rua: getEl('rua-reu')?.value || '',
        numero: getEl('numero-reu')?.value || '',
        complemento: getEl('complemento-reu')?.value || '',
        bairro: getEl('bairro-reu')?.value || '',
        cidade: getEl('cidade-reu')?.value || '',
        uf: getEl('estado-reu')?.value || '',
        referencia: getEl('referencia-reu')?.value || '',
        empresa: getEl('empresa-reu')?.value || '',
        rua_comercial: getEl('rua-comercial-reu')?.value || '',
        numero_comercial: getEl('numero-comercial-reu')?.value || '',
        complemento_comercial: getEl('complemento-comercial-reu')?.value || '',
        bairro_comercial: getEl('bairro-comercial-reu')?.value || '',
        cidade_comercial: getEl('cidade-comercial-reu')?.value || '',
        uf_comercial: getEl('estado-comercial-reu')?.value || '',
        cep_comercial: getEl('cep-comercial-reu')?.value || ''
    };
}

function getExpenseDataFromForm() {
    const d = {};
    EXPENSE_CATEGORIES.forEach(cat => {
        const el = getEl(`expense-${cat.id}`);
        let valor = el ? el.value || '' : '';
        d[cat.id] = (!valor || valor.trim() === '') ? 'R$ 0,00' : valor;
    });
    d.checkExibirGastos = getEl('check-exibir-gastos')?.checked || false;
    return d;
}

function fillReuData(d) {
    if (!d) return;
    const setValue = (id, val) => { const el = getEl(id); if (el) el.value = val || ''; };
    
    getEl('check-reu-unico').checked = d.checkReuUnico || false;
    setValue('nome-reu', d.nome);
    setValue('cpf-reu', d.cpf);
    setValue('telefone-reu', d.telefone);
    setValue('cep-reu', d.cep);
    setValue('rua-reu', d.rua);
    setValue('numero-reu', d.numero);
    setValue('complemento-reu', d.complemento);
    setValue('bairro-reu', d.bairro);
    setValue('cidade-reu', d.cidade);
    setValue('estado-reu', d.uf);
    setValue('referencia-reu', d.referencia);
    setValue('empresa-reu', d.empresa);
    setValue('rua-comercial-reu', d.rua_comercial);
    setValue('numero-comercial-reu', d.numero_comercial);
    setValue('complemento-comercial-reu', d.complemento_comercial);
    setValue('bairro-comercial-reu', d.bairro_comercial);
    setValue('cidade-comercial-reu', d.cidade_comercial);
    setValue('estado-comercial-reu', d.uf_comercial);
    setValue('cep-comercial-reu', d.cep_comercial);
    
    setTimeout(() => updateReuVisibility(d), 100);
}

function updateReuVisibility(d) {
    const contentCompleto = getEl('content-reu-completo'); 
    if (contentCompleto) contentCompleto.style.display = d.checkReuUnico ? 'block' : 'none';
    updateSelectedCounter();
}

function fillExpenseData(d) {
    if (!d) return;
    EXPENSE_CATEGORIES.forEach(cat => {
        const el = getEl(`expense-${cat.id}`);
        if (el && d[cat.id]) el.value = d[cat.id];
    });
    
    const checkGastos = getEl('check-exibir-gastos'); 
    if (checkGastos && d.checkExibirGastos !== undefined) {
        checkGastos.checked = d.checkExibirGastos;
        const contentGastos = getEl('content-planilha-gastos'); 
        if (contentGastos) contentGastos.style.display = d.checkExibirGastos ? 'block' : 'none';
    }
    
    let total = 0;
    document.querySelectorAll('.expense-input').forEach(i => total += parseCurrency(i.value));
    const totalEl = getEl('expense-total');
    if(totalEl) totalEl.textContent = formatCurrency(total);
    
    updateSelectedCounter();
}

/* ========================================================
   9. FUNÇÕES DE AÇÃO CORRIGIDAS (MOTO PDF CONECTADO)
   ======================================================== */

// 👑 CORREÇÃO DO BOTÃO PDF: Mapeado exatamente com as assinaturas reais e robustas exigidas pelo SIGEP 👑
async function handlePdf() {
    showNotification("Gerando PDF unificado...", "info");
    try {
        const assistedName = getEl('assisted-details-name')?.textContent || 'Assistido';
        const actionTitle = getEl('checklist-title')?.textContent || '';
        const documentosTextos = collectCheckedDocuments();
        
        const reu = getReuDataFromForm();
        const gastos = getExpenseDataFromForm();
        
        if (reu.checkReuUnico) addReuToPdfData(documentosTextos, reu);
        addExpensesToPdfData(documentosTextos, gastos);
        
        const checklistData = {
            checkedIds: Array.from(document.querySelectorAll('.doc-checkbox:checked')).map(cb => cb.id),
            docTypes: getDocTypesFromForm(),
            reuData: reu,
            expenseData: gastos,
            demandasAdicionais: demandasAdicionaisLocais // Passa o array de multiplos casos para enquadrar no papel
        };
        
        // CORREÇÃO CRÍTICA: Chama o método global exposto pelo PDFService unificado
        const resultado = PDFService.generateChecklistPDF(assistedName, actionTitle, checklistData, documentosTextos);
        if (resultado) {
            showNotification("PDF emitido com sucesso!");
            await handleSave(false);
        }
    } catch (err) {
        console.error("Falha ao processar PDF:", err);
        showNotification("Erro na emissão do PDF", "error");
    }
}

function collectCheckedDocuments() {
    const documentos = [];
    document.querySelectorAll('.doc-checkbox:checked').forEach(cb => {
        let text = '';
        const label = cb.closest('label');
        if (label) {
            const span = label.querySelector('span:not(.sr-only)');
            if (span) text = span.textContent;
        }
        documentos.push({ id: cb.id, text: (text || cb.id).trim() });
    });
    return documentos;
}

function addReuToPdfData(documentosTextos, reu) {
    documentosTextos.push({ id: 'reu-titulo', text: '👤 DADOS DA QUALIFICAÇÃO DO RÉU:' });
    if (reu.nome) documentosTextos.push({ id: 'reu-n', text: `   • Nome: ${reu.nome}` });
    if (reu.cpf) documentosTextos.push({ id: 'reu-c', text: `   • CPF: ${reu.cpf}` });
    if (reu.rua) documentosTextos.push({ id: 'reu-r', text: `   • Citação em: ${reu.rua}, nº ${reu.numero} - ${reu.bairro}` });
}

function addExpensesToPdfData(documentosTextos, gastos) {
    if (!gastos.checkExibirGastos) return;
    documentosTextos.push({ id: 'gastos-titulo', text: '💰 EXTRATO DE DESPESAS ACUMULADAS:' });
    EXPENSE_CATEGORIES.forEach(cat => {
        if (gastos[cat.id] && gastos[cat.id] !== 'R$ 0,00') {
            documentosTextos.push({ id: `g-pdf-${cat.id}`, text: `   • ${cat.label}: ${gastos[cat.id]}` });
        }
    });
}

async function handleSave(closeModal = true) {
    if (!currentAssistedId || !currentPautaId || !db) {
        showNotification("Dados incompletos para salvar", "error");
        return;
    }
    
    const container = getEl('checklist-container');
    const checkedIds = container ? Array.from(container.querySelectorAll('.doc-checkbox:checked')).map(cb => cb.id) : [];
    
    const payload = {
        documentChecklist: {
            action: currentChecklistAction,
            checkedIds: checkedIds,
            docTypes: getDocTypesFromForm(),
            reuData: getReuDataFromForm(),
            expenseData: getExpenseDataFromForm()
        },
        demandas: {
            quantidade: demandasAdicionaisLocais.length,
            descricoes: demandasAdicionaisLocais 
        },
        documentState: 'saved',
        selectedAction: currentChecklistAction ? documentsData[currentChecklistAction]?.title : null,
        lastActionBy: window.app?.currentUserName || 'Sistema',
        lastActionTimestamp: new Date().toISOString()
    };

    try {
        await updateDoc(doc(db, "pautas", currentPautaId, "attendances", currentAssistedId), payload);
        if (closeModal) {
            showNotification("Triagem salva no SIGEP com sucesso!");
            closeAssistedDetailsModal();
        }
        if (window.app && typeof window.app.refreshAssistedList === 'function') window.app.refreshAssistedList();
    } catch (e) {
        showNotification("Falha ao salvar no banco", "error");
    }
}

async function handleReset() {
    if (!confirm("Deseja apagar as qualificações e o checklist atual?")) return;
    try {
        await updateDoc(doc(db, "pautas", currentPautaId, "attendances", currentAssistedId), { 
            documentChecklist: null,
            documentState: null,
            selectedAction: null,
            demandas: null
        });
        demandasAdicionaisLocais = [];
        window._lastOpenedAssistedId = null;
        currentChecklistAction = null;
        handleBack();
        showNotification("Triagem limpa.", "info");
    } catch (e) {
        showNotification("Erro ao limpar", "error");
    }
}

function handleBack() {
    getEl('document-checklist-view')?.classList.add('hidden');
    getEl('document-checklist-view-header-actions')?.classList.add('hidden'); 
    getEl('checklist-search-container')?.classList.add('hidden');
    getEl('address-editor-container')?.classList.add('hidden'); 
    getEl('document-action-selection')?.classList.remove('hidden'); 
}

function closeAssistedDetailsModal() {
    getEl('assisted-details-modal').classList.add('hidden');
    currentAssistedId = null;
    currentPautaId = null;
    currentChecklistAction = null;
    window._lastOpenedAssistedId = null; 
    demandasAdicionaisLocais = [];
    handleBack(); 
}

/* ========================================================
   11. EXPORTS E INICIALIZAÇÃO
   ======================================================== */
export function setupDetailsModal(config) {
    db = config.db;
    getEl('close-assisted-details-modal-btn').onclick = closeAssistedDetailsModal;
    getEl('back-to-action-selection-btn').onclick = handleBack;
    getEl('save-checklist-btn').onclick = () => handleSave(true);
    getEl('print-checklist-btn').onclick = handlePdf; // Link direto do clique mapeado para o handlePdf corrigido
    getEl('reset-checklist-btn').onclick = handleReset;
    
    const searchInput = getEl('checklist-search');
    if (searchInput) {
        searchInput.oninput = (e) => {
            const term = normalizeLocal(e.target.value);
            document.querySelectorAll('label.checklist-row').forEach(row => {
                const parentDiv = row.closest('div.flex.flex-col.border-b'); 
                if (parentDiv) parentDiv.style.display = normalizeLocal(row.textContent).includes(term) ? 'block' : 'none';
            });
        };
    }
}

export async function openDetailsModal(config) {
    currentAssistedId = config.assistedId;
    currentPautaId = config.pautaId;
    allAssisted = config.allAssisted || [];
    db = config.db || window.app?.db;
    
    try {
        const docSnap = await getDoc(doc(db, "pautas", currentPautaId, "attendances", currentAssistedId));
        if (docSnap.exists()) {
            const data = docSnap.data();
            
            if (data.numeroAgendamento && getEl('edit-assisted-num-agendamento')) {
                getEl('edit-assisted-num-agendamento').value = data.numeroAgendamento;
            }

            demandasAdicionaisLocais = (data.demandas && data.demandas.descricoes) ? [...data.demandas.descricoes] : [];
            const idx = allAssisted.findIndex(a => a.id === currentAssistedId);
            if (idx !== -1) allAssisted[idx] = { id: currentAssistedId, ...data };
            else allAssisted.push({ id: currentAssistedId, ...data });
        }
    } catch (e) { console.error(e); }
    
    const assisted = allAssisted.find(a => a.id === currentAssistedId);
    if (!assisted) return;
    
    if (getEl('assisted-details-name')) getEl('assisted-details-name').textContent = assisted.name;
    
    const selectionArea = getEl('document-action-selection');
    const checklistView = getEl('document-checklist-view');

    window._lastOpenedAssistedId = currentAssistedId;
    
    if (assisted.documentChecklist && assisted.documentChecklist.action) {
        selectionArea?.classList.add('hidden');
        checklistView?.classList.remove('hidden');
        renderChecklist(assisted.documentChecklist.action);
    } else {
        checklistView?.classList.add('hidden');
        selectionArea?.classList.remove('hidden');
        renderSubjectSelection(selectionArea);
    }
    
    getEl('assisted-details-modal')?.classList.remove('hidden');
}

function renderSubjectSelection(selectionArea) {
    if (!selectionArea) return;
    selectionArea.innerHTML = `
        <div class="p-2 sm:p-4">
            <div class="mb-4"><input type="text" id="subject-search-input" placeholder="🔍 Buscar assunto no SIGEP..." class="w-full p-3 border-2 border-gray-200 rounded-xl text-sm outline-none"></div>
            <p class="text-gray-500 mb-4 text-xs sm:text-sm text-center font-bold uppercase tracking-widest opacity-60">Selecione o Assunto</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 action-grid max-h-[50vh] overflow-y-auto p-1"></div>
        </div>
    `;
    
    const grid = selectionArea.querySelector('.action-grid');
    const searchInput = selectionArea.querySelector('#subject-search-input');
    const subjectsList = Object.keys(documentsData).map(k => ({ key: k, title: documentsData[k].title }));
    
    function renderFilteredSubjects(filterText = '') {
        grid.innerHTML = '';
        const filtered = subjectsList.filter(s => normalizeLocal(s.title).includes(normalizeLocal(filterText)));
        filtered.forEach(({key, title}) => {
            const btn = document.createElement('button');
            btn.className = "text-left p-3 bg-white border-2 border-gray-100 hover:border-green-500 rounded-xl transition-all shadow-sm text-xs sm:text-sm uppercase font-bold text-gray-700 tracking-tighter";
            btn.textContent = title;
            btn.onclick = async (e) => {
                e.preventDefault();
                try {
                    await updateDoc(doc(db, "pautas", currentPautaId, "attendances", currentAssistedId), {
                        "documentChecklist.action": key,
                        documentState: 'filling'
                    });
                } catch (err) { console.error(err); }
                renderChecklist(key);
                selectionArea.classList.add('hidden');
                getEl('document-checklist-view').classList.remove('hidden');
            };
            grid.appendChild(btn);
        });
    }
    renderFilteredSubjects();
    searchInput.addEventListener('input', (e) => renderFilteredSubjects(e.target.value));
}

window.openDetailsModal = openDetailsModal;
window.setupDetailsModal = setupDetailsModal;
window.documentsData = documentsData;
