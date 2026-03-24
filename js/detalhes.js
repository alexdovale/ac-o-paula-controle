/**
 * ========================================================
 * DETALHES.JS - SIGAP
 * Módulo de Checklist e Documentos
 * Versão: 5.0 (Réu como Único Item - COM TESTE)
 * ========================================================
 * 
 * Este módulo gerencia:
 * ✅ Checklist de documentos por ação
 * ✅ Planilha de gastos para ações de alimentos
 * ✅ Dados do réu como UM ÚNICO ITEM no checklist
 * ✅ Integração com PDFService
 * ✅ Salvamento no Firestore
 * 
 * ========================================================
 */

// ========================================================
// TESTE DE VERSÃO - APAGUE ESTA LINHA DEPOIS DE TESTAR
// ========================================================
window.detalhesJsVersion = "5.0 - RÉU EM ÚNICO ITEM";
console.log("%c🚀 detalhes.js versão 5.0 CARREGADO!", "color: green; font-size: 16px; font-weight: bold");
console.log("%c✅ Se você está vendo esta mensagem, o arquivo novo está funcionando!", "color: blue; font-size: 14px");

// ========================================================
// TESTE VISUAL - MOSTRA UM ALERTA PARA CONFIRMAR
// ========================================================
setTimeout(() => {
    console.log("%c🔍 VERIFIQUE O CHECKLIST DO RÉU:", "color: orange; font-size: 14px");
    console.log("%c   Deve aparecer APENAS UM checkbox: '📋 DADOS DO RÉU (Endereço completo e Dados de trabalho)'", "color: orange");
}, 500);

import { doc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showNotification } from './utils.js';
import { PDFService } from './pdfService.js';





/* ========================================================
   1. CONSTANTES E CONFIGURAÇÕES
   ======================================================== */

// 1.1 Documentos Base (comuns a todas as ações)
const BASE_DOCS = [
    'Carteira de Identidade (RG) ou Habilitação (CNH)',
    'CPF',
    'Comprovante de Residência (Atualizado - últimos 3 meses)'
];

// 1.2 Documentos de Renda (estruturados por categoria)
const INCOME_DOCS_STRUCTURED = [
    // Título: Trabalhador Formal
    { type: 'title', text: '1. TRABALHADOR FORMAL (CLT / SERVIDOR)' },
    'Contracheque (3 últimos meses)',
    'Carteira de Trabalho (Física ou Digital - Print das telas)',
    'Extrato Analítico do FGTS',
    
    // Título: Aposentado / Pensionista
    { type: 'title', text: '2. APOSENTADO / PENSIONISTA / BPC-LOAS' },
    'Extrato de Pagamento de Benefício (Portal Meu INSS)',
    'Histórico de Crédito - HISCRE (Portal Meu INSS)',
    'Extrato bancário da conta onde recebe o benefício',
    
    // Título: Autônomo / Informal
    { type: 'title', text: '3. AUTÔNOMO / TRABALHADOR INFORMAL' },
    'Declaração de Hipossuficiência (Próprio Punho - informando média mensal)',
    'Extratos Bancários (3 últimos meses)',
    'Comprovante de Inscrição no CadÚnico',
    
    // Título: Desempregado
    { type: 'title', text: '4. DESEMPREGADO' },
    'Carteira de Trabalho (Página da baixa do último emprego)',
    'Comprovante de Seguro-Desemprego (se estiver recebendo)',
    'Declaração de Hipossuficiência (Informando ausência de renda)',
    'Extrato do CNIS (Meu INSS - prova ausência de vínculo ativo)',
    
    // Título: Provas Gerais
    { type: 'title', text: '5. PROVAS GERAIS E IMPOSTO DE RENDA' },
    'Extrato do Bolsa Família',
    'Folha Resumo do CadÚnico',
    'IRPF - Cenário 1 (Declarante): Cópia da Declarat de IR',
    'IRPF - Cenário 2 (Isento): Declaração de Isenção de Imposto de Renda'
];

// 1.3 Documentos Completos (Base + Renda)
const COMMON_DOCS_FULL = [...BASE_DOCS, ...INCOME_DOCS_STRUCTURED];

// 1.4 Categorias de Gastos (para ações de alimentos)
const EXPENSE_CATEGORIES = [
    { 
        id: 'moradia', 
        label: '1. MORADIA (Habitação)', 
        desc: 'Aluguel, condomínio, IPTU, luz, água, gás.' 
    },
    { 
        id: 'alimentacao', 
        label: '2. ALIMENTAÇÃO', 
        desc: 'Supermercado, feira, açougue, lanches, leites especiais.' 
    },
    { 
        id: 'educacao', 
        label: '3. EDUCAÇÃO', 
        desc: 'Mensalidade escolar, material, uniforme, transporte escolar, cursos.' 
    },
    { 
        id: 'saude', 
        label: '4. SAÚDE', 
        desc: 'Plano de saúde, medicamentos, consultas, tratamentos (dentista, psicólogo, fisioterapia).' 
    },
    { 
        id: 'vestuario', 
        label: '5. VESTUÁRIO E HIGIENE', 
        desc: 'Roupas, calçados, fraldas, produtos de higiene pessoal.' 
    },
    { 
        id: 'lazer', 
        label: '6. LAZER E TRANSPORTE', 
        desc: 'Passeios, festas, cinema, transporte público, combustível.' 
    },
    { 
        id: 'outras', 
        label: '7. OUTRAS DESPESAS', 
        desc: 'Babá, pets, atividades extracurriculares, celular, internet.' 
    }
];

// 1.5 Ações que SEMPRE exigem planilha de gastos
const ACTIONS_ALWAYS_EXPENSES = [
    'alimentos_fixacao_majoracao_oferta',
    'alimentos_gravidicos',
    'alimentos_avoengos',
    'investigacao_paternidade',
    'guarda'
];

// 1.6 Ações que exigem dados de trabalho do réu
const ACTIONS_WITH_WORK_INFO = [
    'alimentos_fixacao_majoracao_oferta',
    'alimentos_gravidicos',
    'alimentos_avoengos',
    'divorcio_litigioso',
    'uniao_estavel_reconhecimento_dissolucao',
    'investigacao_paternidade'
];





/* ========================================================
   2. BASE DE DADOS DE AÇÕES
   ======================================================== */

export const documentsData = {
    obrigacao_fazer: {
        title: 'Obrigação de Fazer',
        sections: [
            { title: 'Base e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Específicos', docs: ['Contrato/Acordo', 'Provas do descumprimento', 'Endereço completo', 'Dados de trabalho'] }
        ]
    },
    declaratoria_nulidade: {
        title: 'Declaratória de Nulidade',
        sections: [
            { title: 'Base e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Específicos', docs: ['Documento a anular', 'Provas da ilegalidade', 'Endereço completo'] }
        ]
    },
    indenizacao_danos: {
        title: 'Ação de Indenização',
        sections: [
            { title: 'Base e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Específicos', docs: ['BO', 'Fotos/Vídeos', 'Orçamentos', 'Notas Fiscais', 'Testemunhas', 'Endereço completo', 'Dados de trabalho'] }
        ]
    },
    revisional_debito: {
        title: 'Ação Revisional de Débito',
        sections: [
            { title: 'Base e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Específicos', docs: ['Contrato', 'Planilha da dívida', 'Extratos', 'Endereço completo'] }
        ]
    },
    exigir_contas: {
        title: 'Ação de Exigir Contas',
        sections: [
            { title: 'Base e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Específicos', docs: ['Prova da gestão de bens', 'Recusa em prestar contas', 'Endereço completo'] }
        ]
    },
    alimentos_fixacao_majoracao_oferta: {
        title: 'Alimentos (Fixação / Majoração / Oferta)',
        sections: [
            { title: 'Base e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Do Alimentando', docs: ['Certidão de Nascimento', 'Comprovantes de despesas'] },
            { title: 'Sobre o Réu', docs: ['Endereço completo', 'Dados de trabalho'] }
        ]
    },
    alimentos_gravidicos: {
        title: 'Ação de Alimentos Gravídicos',
        sections: [
            { title: 'Base e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Da Gestação', docs: ['Exame Beta HCG', 'Pré-Natal'] },
            { title: 'Sobre o Réu', docs: ['Indícios de paternidade', 'Endereço completo', 'Dados de trabalho'] }
        ]
    },
    alimentos_avoengos: {
        title: 'Alimentos Avoengos',
        sections: [
            { title: 'Base e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Específicos', docs: ['Certidão de Nascimento', 'Prova da impossibilidade dos pais', 'Endereço completo', 'Dados de trabalho'] }
        ]
    },
    divorcio_consensual: {
        title: 'Divórcio Consensual',
        sections: [
            { title: 'Documentação (Ambos)', docs: ['RG/CPF ambos', 'Comp. Residência ambos', 'Certidão Casamento', ...INCOME_DOCS_STRUCTURED] },
            { title: 'Filhos/Bens', docs: ['Certidão Nascimento Filhos', 'Documentos Bens'] }
        ]
    },
    divorcio_litigioso: {
        title: 'Divórcio Litigioso',
        sections: [
            { title: 'Base e Renda', docs: [...COMMON_DOCS_FULL, 'Certidão de Casamento'] },
            { title: 'Filhos/Bens', docs: ['Certidão Nascimento Filhos', 'Documentos Bens'] },
            { title: 'Sobre o Cônjuge', docs: ['Endereço completo', 'Dados de trabalho'] }
        ]
    },
    uniao_estavel: {
        title: 'União Estável (Reconhecimento/Dissolução)',
        sections: [
            { title: 'Base e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Provas', docs: ['Certidão filhos', 'Contas conjuntas', 'Fotos', 'Testemunhas'] },
            { title: 'Sobre o Réu', docs: ['Endereço completo', 'Dados de trabalho'] }
        ]
    },
    guarda: {
        title: 'Ação de Guarda',
        sections: [
            { title: 'Base e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Da Criança', docs: ['Certidão Nascimento', 'Matrícula Escolar', 'Cartão Vacina'] },
            { title: 'Do Réu', docs: ['Endereço completo', 'Dados de trabalho'] }
        ]
    },
    regulamentacao_convivencia: {
        title: 'Regulamentação de Visitas',
        sections: [
            { title: 'Base e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Da Criança', docs: ['Certidão Nascimento'] },
            { title: 'Sobre o Réu', docs: ['Endereço completo'] }
        ]
    },
    investigacao_paternidade: {
        title: 'Investigação de Paternidade',
        sections: [
            { title: 'Base e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Da Criança', docs: ['Certidão Nascimento (sem pai)'] },
            { title: 'Suposto Pai', docs: ['Endereço completo', 'Dados de trabalho'] }
        ]
    },
    curatela: {
        title: 'Curatela (Interdição)',
        sections: [
            { title: 'Base e Renda (Curador)', docs: COMMON_DOCS_FULL },
            { title: 'Do Curatelando', docs: ['RG e CPF', 'Certidão Nascimento/Casamento', 'Renda (INSS)', 'Laudo Médico (CID)'] }
        ]
    },
    retificacao_registro_civil: {
        title: 'Retificação Registro Civil',
        sections: [
            { title: 'Base e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Específicos', docs: ['Certidão a retificar', 'Provas do erro'] }
        ]
    },
    alvara_valores: {
        title: 'Alvará (Valores)',
        sections: [
            { title: 'Base e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Do Falecido', docs: ['Óbito', 'Extratos'] }
        ]
    },
    vaga_escola_creche: {
        title: 'Vaga em Creche/Escola',
        sections: [
            { title: 'Base e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Da Criança', docs: ['Certidão Nascimento', 'Protocolo Inscrição/Negativa'] }
        ]
    }
};





/* ========================================================
   3. ESTADO GLOBAL
   ======================================================== */

let currentAssistedId = null;      // ID do assistido atual
let currentPautaId = null;         // ID da pauta atual
let db = null;                     // Instância do Firestore
let allAssisted = [];              // Lista de todos os assistidos
let currentChecklistAction = null; // Ação atual do checklist





/* ========================================================
   4. FUNÇÕES AUXILIARES
   ======================================================== */

/**
 * 4.1 Obtém elemento do DOM de forma segura
 * @param {string} id - ID do elemento
 * @returns {HTMLElement|null}
 */
const getEl = (id) => document.getElementById(id);

/**
 * 4.2 Normaliza texto para busca (remove acentos e lowerCase)
 * @param {string} str - Texto a ser normalizado
 * @returns {string}
 */
const normalizeLocal = (str) => str 
    ? str.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() 
    : '';

/**
 * 4.3 Formata valor para moeda brasileira
 * @param {number} v - Valor a ser formatado
 * @returns {string}
 */
function formatCurrency(v) {
    return new Intl.NumberFormat('pt-BR', { 
        style: 'currency', 
        currency: 'BRL' 
    }).format(v);
}

/**
 * 4.4 Converte string de moeda para número
 * @param {string} s - String no formato "R$ 1.234,56"
 * @returns {number}
 */
function parseCurrency(s) {
    if (!s) return 0;
    return parseFloat(s.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
}





/* ========================================================
   5. FUNÇÕES DO CHECKLIST
   ======================================================== */

/**
 * 5.1 Obtém tipos de documentos selecionados (Físico/Digital)
 * @returns {Object}
 */
function getDocTypesFromForm() {
    const docTypes = {};
    document.querySelectorAll('.doc-checkbox:checked').forEach(cb => {
        const typeRadio = document.querySelector(`input[name="type-${cb.id}"]:checked`);
        docTypes[cb.id] = typeRadio ? typeRadio.value : 'Físico';
    });
    return docTypes;
}

/**
 * 5.2 Atualiza contador de itens selecionados
 * Conta: documentos + checkbox único do réu + planilha de gastos
 */
function updateSelectedCounter() {
    const container = getEl('checklist-container');
    if (!container) return;
    
    // Documentos normais do checklist
    const checkedDocs = container.querySelectorAll('.doc-checkbox:checked').length;
    
    // Checkbox único do réu
    const reuCheck = document.getElementById('check-reu-unico')?.checked ? 1 : 0;
    
    // Checkbox da planilha de gastos
    const gastosCheck = document.getElementById('check-exibir-gastos')?.checked ? 1 : 0;
    
    // Total geral
    const totalChecked = checkedDocs + reuCheck + gastosCheck;
    
    const counterEl = getEl('checklist-counter');
    if (counterEl) {
        counterEl.textContent = `${totalChecked} itens selecionados`;
    }
    
    if (totalChecked > 0) {
        updateDocumentState('filling');
    }
}

/**
 * 5.3 Atualiza estado do documento no Firestore
 * @param {string} state - Estado (filling, saved, pdf)
 */
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
        
        console.log(`📊 Status do documento atualizado para: ${state}`);
    } catch (e) {
        console.error("Erro ao atualizar estado:", e);
    }
}

/**
 * 5.4 Verifica se deve mostrar o formulário do réu
 */
function checkReuVisibility() {
    const reuArea = getEl('address-editor-container');
    if (!reuArea) return;
    
    const actionRequiresReu = ACTIONS_WITH_WORK_INFO.includes(currentChecklistAction);
    
    if (actionRequiresReu) {
        console.log("👤 Ação requer dados do réu, mostrando formulário");
        reuArea.classList.remove('hidden');
        if (reuArea.children.length === 0 || reuArea.innerHTML.trim() === '') {
            renderReuForm('address-editor-container');
        }
    } else {
        const containerEl = getEl('checklist-container');
        if (containerEl) {
            const checkedLabels = Array.from(containerEl.querySelectorAll('.doc-checkbox:checked')).map(cb => 
                cb.closest('label')?.querySelector('span')?.textContent || ''
            );
            
            const needsReu = checkedLabels.some(txt => 
                txt.includes('Endereço') || 
                txt.includes('Trabalho') || 
                txt.includes('Sobre o Réu') || 
                txt.includes('Sobre o Cônjuge') || 
                txt.includes('Suposto Pai')
            );
            
            if (needsReu) {
                reuArea.classList.remove('hidden');
                if (reuArea.children.length === 0 || reuArea.innerHTML.trim() === '') {
                    renderReuForm('address-editor-container');
                }
            } else {
                reuArea.classList.add('hidden');
            }
        } else {
            reuArea.classList.add('hidden');
        }
    }
}

/**
 * 5.5 Renderiza o checklist de documentos
 * @param {string} actionKey - Chave da ação selecionada
 */
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

    // Atualiza título
    const titleEl = getEl('checklist-title');
    if (titleEl) titleEl.textContent = data.title;
    
    // Mostra cabeçalho e busca
    const headerEl = getEl('document-checklist-view-header');
    if (headerEl) headerEl.classList.remove('hidden');
    
    const searchEl = getEl('checklist-search-container');
    if (searchEl) searchEl.classList.remove('hidden');
    
    containerEl.innerHTML = ''; 

    // Renderiza seções
    data.sections.forEach((section, sIdx) => {
        const sectionDiv = document.createElement('div');
        sectionDiv.className = "mb-6";
        sectionDiv.innerHTML = `<h4 class="font-bold text-gray-700 mb-3 border-b pb-1 uppercase text-[10px] tracking-widest">${section.title}</h4>`;
        const ul = document.createElement('ul');
        ul.className = 'space-y-1';

        section.docs.forEach((docItem, dIdx) => {
            const li = document.createElement('li');
            
            if (typeof docItem === 'object' && docItem.type === 'title') {
                // Título de seção (não é checkbox)
                li.innerHTML = `<div class="font-bold text-blue-700 text-[10px] mt-4 mb-2 bg-blue-50 p-2 rounded border-l-4 border-blue-400 uppercase tracking-tighter">${docItem.text}</div>`;
            } else {
                // Item de documento (checkbox)
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

    // Adiciona planilha de gastos se necessário
    if (ACTIONS_ALWAYS_EXPENSES.includes(actionKey)) {
        addExpenseTable(containerEl, saved);
    } else {
        addExpenseButton(containerEl, saved);
    }

    // Eventos dos checkboxes
    setupCheckboxEvents(containerEl);
    
    setTimeout(checkReuVisibility, 100);
    updateSelectedCounter();
    
    // Carrega dados salvos
    if (saved?.reuData) {
        setTimeout(() => {
            fillReuData(saved.reuData);
        }, 200);
    }
}

/**
 * 5.6 Adiciona tabela de gastos (para ações que sempre exigem)
 * @param {HTMLElement} containerEl - Container onde adicionar
 * @param {Object} saved - Dados salvos
 */
function addExpenseTable(containerEl, saved) {
    console.log("💰 Ação requer planilha de gastos, adicionando...");
    
    let expenseContainer = document.getElementById('expense-table-container');
    if (!expenseContainer) {
        expenseContainer = document.createElement('div');
        expenseContainer.id = 'expense-table-container';
        expenseContainer.className = 'mt-4';
        containerEl.appendChild(expenseContainer);
    }
    
    expenseContainer.innerHTML = '';
    expenseContainer.appendChild(renderExpenseTable());
    
    if (saved?.expenseData) {
        console.log("📊 Preenchendo dados de gastos salvos:", saved.expenseData);
        fillExpenseData(saved.expenseData);
    }
}

/**
 * 5.7 Adiciona botão para abrir planilha de gastos (ações opcionais)
 * @param {HTMLElement} containerEl - Container onde adicionar
 * @param {Object} saved - Dados salvos
 */
function addExpenseButton(containerEl, saved) {
    const expenseButton = document.createElement('div');
    expenseButton.className = 'mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg text-center';
    expenseButton.id = 'expense-button-container';
    expenseButton.innerHTML = `
        <button id="btn-abrir-gastos" class="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-green-700">
            + Adicionar Planilha de Gastos
        </button>
    `;
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

/**
 * 5.8 Configura eventos dos checkboxes
 * @param {HTMLElement} containerEl - Container com os checkboxes
 */
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
            
            const anyChecked = containerEl.querySelectorAll('.doc-checkbox:checked').length > 0;
            if (anyChecked) {
                updateDocumentState('filling');
            }
        });
    });

    // Evento do botão de abrir gastos
    setTimeout(() => {
        document.getElementById('btn-abrir-gastos')?.addEventListener('click', () => {
            const expenseButton = document.getElementById('expense-button-container');
            if (expenseButton) expenseButton.style.display = 'none';
            
            let expenseContainer = document.getElementById('expense-table-container');
            if (!expenseContainer) {
                expenseContainer = document.createElement('div');
                expenseContainer.id = 'expense-table-container';
                expenseContainer.className = 'mt-4';
                containerEl.appendChild(expenseContainer);
            }
            expenseContainer.innerHTML = '';
            expenseContainer.appendChild(renderExpenseTable());
        });
    }, 100);
}





/* ========================================================
   6. FORMULÁRIO DO RÉU (VERSÃO COM UM ÚNICO ITEM NO CHECKLIST)
   ======================================================== */

/**
 * 6.1 Renderiza formulário completo do réu
 * @param {string} containerId - ID do container
 */
function renderReuForm(containerId) {
    const container = getEl(containerId);
    if (!container) return;

    console.log("%c👤 RENDERIZANDO FORMULÁRIO DO RÉU (versão com único checkbox)", "color: purple; font-weight: bold");

    container.innerHTML = `
        <div class="p-4 sm:p-6 bg-red-50 border-2 border-red-200 rounded-2xl shadow-sm mt-6">
            <!-- Cabeçalho -->
            <div class="flex items-center gap-2 mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                <h3 class="text-sm font-black text-red-600 uppercase">
                    DADOS DA PARTE CONTRÁRIA (RÉU) - ENDEREÇO PARA CITAÇÃO
                </h3>
            </div>
            
            <!-- AVISO DE IMPORTÂNCIA -->
            <div class="bg-yellow-100 border-l-4 border-yellow-400 p-3 mb-4 rounded">
                <div class="flex">
                    <div class="flex-shrink-0">
                        <svg class="h-5 w-5 text-yellow-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                        </svg>
                    </div>
                    <div class="ml-3">
                        <p class="text-xs text-yellow-700">
                            <span class="font-bold">⚠️ IMPORTANTE:</span> Esta é a informação mais importante para que o processo possa começar. Forneça o endereço mais completo e atualizado possível.
                        </p>
                    </div>
                </div>
            </div>

            <!-- CHECKBOX ÚNICO QUE CONTROLA TUDO -->
            <div class="bg-white p-4 rounded-lg border border-gray-200 mb-4" style="border: 2px solid #f97316;">
                <div class="flex items-center gap-3">
                    <input type="checkbox" id="check-reu-unico" class="h-5 w-5 text-red-600 rounded border-gray-300 focus:ring-red-500" checked>
                    <label for="check-reu-unico" class="text-sm font-bold text-gray-700 cursor-pointer" style="font-size: 16px; color: #b91c1c;">
                        📋 DADOS DO RÉU (Endereço completo e Dados de trabalho)
                    </label>
                </div>
                <p class="text-[9px] text-gray-500 mt-1 ml-8">
                    Marque esta opção para incluir todos os dados do réu no processo
                </p>
                <p class="text-green-600 text-xs mt-2 font-bold ml-8">
                    ✅ TESTE: Este é o NOVO formulário com ÚNICO checkbox!
                </p>
            </div>

            <!-- TODO O CONTEÚDO DO RÉU (aparece/desaparece com o checkbox) -->
            <div id="content-reu-completo">
                ${renderReuIdentificacao()}
                ${renderReuResidencial()}
                ${renderReuComercial()}
            </div>

            <!-- Botão Salvar -->
            ${renderReuSaveButton()}
        </div>
    `;

    // Inicializa eventos
    initReuUnicoCheckbox();
    initCepSearch();
    initReuSaveButton();
    
    setTimeout(updateSelectedCounter, 100);
}

/**
 * 6.2 Renderiza seção de identificação do réu
 * @returns {string}
 */
function renderReuIdentificacao() {
    return `
        <div class="bg-white p-3 rounded-lg border border-gray-200 mb-4">
            <h4 class="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                <span class="w-1 h-4 bg-red-600 rounded"></span>
                1. IDENTIFICAÇÃO DO RÉU
            </h4>
            
            <div class="space-y-3">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div class="md:col-span-2">
                        <label class="text-[9px] font-black text-gray-400 uppercase">Nome Completo</label>
                        <input type="text" id="nome-reu" placeholder="Nome completo do réu" 
                               class="w-full p-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-red-500">
                    </div>
                    <div>
                        <label class="text-[9px] font-black text-gray-400 uppercase">CPF</label>
                        <input type="text" id="cpf-reu" placeholder="000.000.000-00" maxlength="14"
                               class="w-full p-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-red-500">
                    </div>
                    <div>
                        <label class="text-[9px] font-black text-gray-400 uppercase">Telefone / WhatsApp</label>
                        <input type="text" id="telefone-reu" placeholder="(21) 99999-9999" maxlength="15"
                               class="w-full p-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-red-500">
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * 6.3 Renderiza seção de endereço residencial
 * @returns {string}
 */
function renderReuResidencial() {
    return `
        <div class="bg-red-50 p-3 rounded-lg border border-red-200 mb-4">
            <h4 class="text-sm font-bold text-red-700 mb-3 flex items-center gap-2">
                <span class="w-1 h-4 bg-red-600 rounded"></span>
                2. ENDEREÇO PARA CITAÇÃO (RESIDENCIAL)
                <span class="text-[8px] font-normal text-red-500 ml-2">(Mais importante)</span>
            </h4>
            
            <div class="space-y-3">
                <!-- CEP -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div class="md:col-span-1">
                        <label class="text-[9px] font-black text-gray-400 uppercase">CEP</label>
                        <div class="flex">
                            <input type="text" id="cep-reu" maxlength="9" placeholder="00000-000" 
                                   class="w-full p-2 border-2 border-red-200 rounded-l-lg bg-white text-sm focus:ring-2 focus:ring-red-500">
                            <button type="button" id="buscar-cep-reu-btn" 
                                    class="bg-red-600 text-white px-3 rounded-r-lg hover:bg-red-700 text-xs font-bold">
                                Buscar
                            </button>
                        </div>
                    </div>
                    <div class="md:col-span-2">
                        <label class="text-[9px] font-black text-gray-400 uppercase">Logradouro</label>
                        <input type="text" id="rua-reu" placeholder="Rua, Avenida, etc." 
                               class="w-full p-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-red-500">
                    </div>
                </div>
                
                <!-- Número e Complemento -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div>
                        <label class="text-[9px] font-black text-gray-400 uppercase">Número</label>
                        <input type="text" id="numero-reu" placeholder="123" 
                               class="w-full p-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-red-500">
                    </div>
                    <div class="md:col-span-2">
                        <label class="text-[9px] font-black text-gray-400 uppercase">Complemento</label>
                        <input type="text" id="complemento-reu" placeholder="Apto 201, Bloco B..." 
                               class="w-full p-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-red-500">
                    </div>
                </div>
                
                <!-- Bairro -->
                <div>
                    <label class="text-[9px] font-black text-gray-400 uppercase">Bairro</label>
                    <input type="text" id="bairro-reu" placeholder="Centro, Copacabana..." 
                           class="w-full p-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-red-500">
                </div>
                
                <!-- Cidade e Estado -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div class="md:col-span-2">
                        <label class="text-[9px] font-black text-gray-400 uppercase">Cidade</label>
                        <input type="text" id="cidade-reu" placeholder="Rio de Janeiro" 
                               class="w-full p-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-red-500">
                    </div>
                    <div>
                        <label class="text-[9px] font-black text-gray-400 uppercase">Estado</label>
                        <select id="estado-reu" class="w-full p-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-red-500">
                            <option value="">Selecione...</option>
                            ${renderUfOptions()}
                        </select>
                    </div>
                </div>
                
                <!-- Ponto de Referência -->
                <div>
                    <label class="text-[9px] font-black text-gray-400 uppercase">Ponto de Referência</label>
                    <input type="text" id="referencia-reu" placeholder="Próximo à padaria, em frente ao posto..." 
                           class="w-full p-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-red-500">
                </div>
            </div>
        </div>
    `;
}

/**
 * 6.4 Renderiza seção de endereço comercial
 * @returns {string}
 */
function renderReuComercial() {
    return `
        <div class="bg-gray-50 p-3 rounded-lg border border-gray-200">
            <h4 class="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                <span class="w-1 h-4 bg-gray-600 rounded"></span>
                3. DADOS DE TRABALHO (Endereço Comercial - Alternativo)
                <span class="text-[8px] font-normal text-gray-500 ml-2">(Se residencial for incerto)</span>
            </h4>
            
            <div class="space-y-3">
                <!-- Empresa -->
                <div>
                    <label class="text-[9px] font-black text-gray-400 uppercase">Empresa/Local de Trabalho</label>
                    <input type="text" id="empresa-reu" placeholder="Razão social" 
                           class="w-full p-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-gray-500">
                </div>
                
                <!-- Logradouro -->
                <div>
                    <label class="text-[9px] font-black text-gray-400 uppercase">Logradouro</label>
                    <input type="text" id="rua-comercial-reu" placeholder="Avenida..." 
                           class="w-full p-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-gray-500">
                </div>
                
                <!-- Número e Complemento -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div>
                        <label class="text-[9px] font-black text-gray-400 uppercase">Número</label>
                        <input type="text" id="numero-comercial-reu" placeholder="123" 
                               class="w-full p-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-gray-500">
                    </div>
                    <div class="md:col-span-2">
                        <label class="text-[9px] font-black text-gray-400 uppercase">Complemento</label>
                        <input type="text" id="complemento-comercial-reu" placeholder="Sala 1001..." 
                               class="w-full p-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-gray-500">
                    </div>
                </div>
                
                <!-- Bairro -->
                <div>
                    <label class="text-[9px] font-black text-gray-400 uppercase">Bairro</label>
                    <input type="text" id="bairro-comercial-reu" placeholder="Centro" 
                           class="w-full p-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-gray-500">
                </div>
                
                <!-- Cidade, Estado, CEP -->
                <div class="grid grid-cols-1 md:grid-cols-4 gap-2">
                    <div class="md:col-span-2">
                        <label class="text-[9px] font-black text-gray-400 uppercase">Cidade</label>
                        <input type="text" id="cidade-comercial-reu" placeholder="Rio de Janeiro" 
                               class="w-full p-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-gray-500">
                    </div>
                    <div>
                        <label class="text-[9px] font-black text-gray-400 uppercase">Estado</label>
                        <select id="estado-comercial-reu" class="w-full p-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-gray-500">
                            <option value="">UF</option>
                            ${renderUfOptions()}
                        </select>
                    </div>
                    <div>
                        <label class="text-[9px] font-black text-gray-400 uppercase">CEP</label>
                        <input type="text" id="cep-comercial-reu" placeholder="00000-000" maxlength="9"
                               class="w-full p-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-gray-500">
                    </div>
                </div>
                
                <!-- Botão Buscar CEP -->
                <div class="flex justify-end">
                    <button type="button" id="buscar-cep-comercial-reu-btn" 
                            class="bg-gray-600 text-white px-3 py-2 rounded-lg hover:bg-gray-700 text-xs font-bold flex items-center gap-1">
                        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        Buscar CEP
                    </button>
                </div>
            </div>
        </div>
    `;
}

/**
 * 6.5 Renderiza opções de UF para select
 * @returns {string}
 */
function renderUfOptions() {
    const ufs = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
    return ufs.map(uf => `<option value="${uf}">${uf}</option>`).join('');
}

/**
 * 6.6 Renderiza botão salvar
 * @returns {string}
 */
function renderReuSaveButton() {
    return `
        <div class="mt-4 text-right">
            <button type="button" id="salvar-reu-btn" 
                    class="bg-red-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-700 text-xs uppercase">
                Salvar Dados do Réu
            </button>
        </div>
    `;
}

/**
 * 6.7 Inicializa checkbox único do réu
 */
function initReuUnicoCheckbox() {
    const checkUnico = document.getElementById('check-reu-unico');
    const contentCompleto = document.getElementById('content-reu-completo');
    
    if (checkUnico && contentCompleto) {
        checkUnico.addEventListener('change', function() {
            if (this.checked) {
                contentCompleto.style.display = 'block';
            } else {
                contentCompleto.style.display = 'none';
            }
            updateSelectedCounter();
        });
    }
}

/**
 * 6.8 Inicializa busca de CEP
 */
function initCepSearch() {
    const cepInp = getEl('cep-reu');
    const buscarBtn = document.getElementById('buscar-cep-reu-btn');
    
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
                        getEl('numero-reu').focus();
                    } else {
                        getEl('rua-comercial-reu').value = r.logradouro || '';
                        getEl('bairro-comercial-reu').value = r.bairro || '';
                        getEl('cidade-comercial-reu').value = r.localidade || '';
                        getEl('estado-comercial-reu').value = r.uf || '';
                    }
                    showNotification("Endereço encontrado!", "success");
                } else {
                    showNotification("CEP não encontrado", "error");
                }
            } catch (error) {
                console.error("Erro ao buscar CEP:", error);
                showNotification("Erro ao buscar CEP", "error");
            }
        }
    }

    if (buscarBtn && cepInp) {
        buscarBtn.addEventListener('click', () => buscarCEP(cepInp.value, 'residencial'));
        cepInp.addEventListener('blur', () => buscarCEP(cepInp.value, 'residencial'));
    }

    const buscarComercialBtn = document.getElementById('buscar-cep-comercial-reu-btn');
    const cepComercial = getEl('cep-comercial-reu');
    
    if (buscarComercialBtn && cepComercial) {
        buscarComercialBtn.addEventListener('click', () => buscarCEP(cepComercial.value, 'comercial'));
        cepComercial.addEventListener('blur', () => buscarCEP(cepComercial.value, 'comercial'));
    }
}

/**
 * 6.9 Inicializa botão salvar do réu
 */
function initReuSaveButton() {
    const salvarBtn = document.getElementById('salvar-reu-btn');
    if (salvarBtn) {
        salvarBtn.addEventListener('click', () => {
            const event = new CustomEvent('reuSalvo', { detail: getReuDataFromForm() });
            document.dispatchEvent(event);
            showNotification("Dados do réu salvos!", "success");
        });
    }
}





/* ========================================================
   7. PLANILHA DE GASTOS
   ======================================================== */

/**
 * 7.1 Renderiza tabela de gastos
 * @returns {HTMLElement}
 */
function renderExpenseTable() {
    const div = document.createElement('div');
    div.className = 'mt-6 p-4 bg-green-50 border-2 border-green-100 rounded-xl shadow-sm';
    div.id = 'expense-table';
    
    div.innerHTML = `
        <div class="flex items-center gap-3 mb-3">
            <input type="checkbox" id="check-exibir-gastos" class="h-5 w-5 text-green-600 rounded border-gray-300 focus:ring-green-500" checked>
            <label for="check-exibir-gastos" class="text-sm font-bold text-green-700 cursor-pointer">
                💰 PLANILHA DE GASTOS MENSAIS (Ações de Alimentos)
            </label>
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
                            <input type="text" id="expense-${c.id}" class="expense-input w-full p-2 bg-white border border-green-200 rounded-lg text-right text-xs" 
                                   placeholder="R$ 0,00" inputmode="numeric">
                        </td>
                    </tr>
                `).join('')}
            </table>
            <div class="mt-4 flex justify-between font-black text-green-900 border-t border-green-200 pt-3 text-sm">
                <span>TOTAL MENSAL:</span>
                <span id="expense-total">R$ 0,00</span>
            </div>
            <div class="mt-2 text-right">
                <button id="fechar-gastos" class="text-[10px] text-gray-500 hover:text-gray-700 underline">
                    Fechar planilha
                </button>
            </div>
        </div>
    `;

    initExpenseTableEvents(div);
    return div;
}

/**
 * 7.2 Inicializa eventos da tabela de gastos
 * @param {HTMLElement} div - Container da tabela
 */
function initExpenseTableEvents(div) {
    // Checkbox da planilha
    const checkGastos = div.querySelector('#check-exibir-gastos');
    const contentGastos = div.querySelector('#content-planilha-gastos');
    
    if (checkGastos && contentGastos) {
        checkGastos.addEventListener('change', function() {
            contentGastos.style.display = this.checked ? 'block' : 'none';
            updateSelectedCounter();
        });
    }

    // Inputs de gastos
    div.querySelectorAll('.expense-input').forEach(inp => {
        inp.addEventListener('input', (e) => {
            let v = e.target.value.replace(/\D/g, '');
            e.target.value = v ? (Number(v)/100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';
            
            let total = 0;
            div.querySelectorAll('.expense-input').forEach(i => {
                total += parseCurrency(i.value);
            });
            const totalEl = div.querySelector('#expense-total');
            if(totalEl) totalEl.textContent = formatCurrency(total);
            
            updateDocumentState('filling');
        });
    });

    // Botão fechar
    setTimeout(() => {
        div.querySelector('#fechar-gastos')?.addEventListener('click', () => {
            const container = document.getElementById('expense-table-container');
            if (container) container.innerHTML = '';
            
            const expenseButton = document.getElementById('expense-button-container');
            if (expenseButton) expenseButton.style.display = 'block';
        });
    }, 100);
}





/* ========================================================
   8. FUNÇÕES DE DADOS (GET/SET)
   ======================================================== */

/**
 * 8.1 Obtém dados do réu do formulário
 * @returns {Object}
 */
function getReuDataFromForm() {
    return {
        // Checkbox único
        checkReuUnico: getEl('check-reu-unico')?.checked || false,
        
        // Identificação
        nome: getEl('nome-reu')?.value || '',
        cpf: getEl('cpf-reu')?.value || '',
        telefone: getEl('telefone-reu')?.value || '',
        
        // Residencial
        cep: getEl('cep-reu')?.value || '',
        rua: getEl('rua-reu')?.value || '',
        numero: getEl('numero-reu')?.value || '',
        complemento: getEl('complemento-reu')?.value || '',
        bairro: getEl('bairro-reu')?.value || '',
        cidade: getEl('cidade-reu')?.value || '',
        uf: getEl('estado-reu')?.value || '',
        referencia: getEl('referencia-reu')?.value || '',
        
        // Comercial
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

/**
 * 8.2 Obtém dados de gastos do formulário
 * @returns {Object}
 */
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

/**
 * 8.3 Preenche dados do réu no formulário
 * @param {Object} d - Dados do réu
 */
function fillReuData(d) {
    if (!d) return;
    
    const setValue = (id, value) => {
        const el = getEl(id);
        if (el) el.value = value || '';
    };
    
    const setChecked = (id, value) => {
        const el = getEl(id);
        if (el) el.checked = value || false;
    };
    
    // Checkbox único
    setChecked('check-reu-unico', d.checkReuUnico);
    
    // Identificação
    setValue('nome-reu', d.nome);
    setValue('cpf-reu', d.cpf);
    setValue('telefone-reu', d.telefone);
    
    // Residencial
    setValue('cep-reu', d.cep);
    setValue('rua-reu', d.rua);
    setValue('numero-reu', d.numero);
    setValue('complemento-reu', d.complemento);
    setValue('bairro-reu', d.bairro);
    setValue('cidade-reu', d.cidade);
    setValue('estado-reu', d.uf);
    setValue('referencia-reu', d.referencia);
    
    // Comercial
    setValue('empresa-reu', d.empresa);
    setValue('rua-comercial-reu', d.rua_comercial);
    setValue('numero-comercial-reu', d.numero_comercial);
    setValue('complemento-comercial-reu', d.complemento_comercial);
    setValue('bairro-comercial-reu', d.bairro_comercial);
    setValue('cidade-comercial-reu', d.cidade_comercial);
    setValue('estado-comercial-reu', d.uf_comercial);
    setValue('cep-comercial-reu', d.cep_comercial);
    
    // Atualizar visibilidade
    setTimeout(() => updateReuVisibility(d), 100);
}

/**
 * 8.4 Atualiza visibilidade das seções do réu
 * @param {Object} d - Dados do réu
 */
function updateReuVisibility(d) {
    const contentCompleto = document.getElementById('content-reu-completo');
    
    if (contentCompleto) {
        contentCompleto.style.display = d.checkReuUnico ? 'block' : 'none';
    }
    
    updateSelectedCounter();
}

/**
 * 8.5 Preenche dados de gastos no formulário
 * @param {Object} d - Dados de gastos
 */
function fillExpenseData(d) {
    if (!d) return;
    
    EXPENSE_CATEGORIES.forEach(cat => {
        const el = getEl(`expense-${cat.id}`);
        if (el && d[cat.id]) el.value = d[cat.id];
    });
    
    const checkGastos = getEl('check-exibir-gastos');
    if (checkGastos && d.checkExibirGastos !== undefined) {
        checkGastos.checked = d.checkExibirGastos;
        const contentGastos = document.getElementById('content-planilha-gastos');
        if (contentGastos) contentGastos.style.display = d.checkExibirGastos ? 'block' : 'none';
    }
    
    let total = 0;
    document.querySelectorAll('.expense-input').forEach(i => total += parseCurrency(i.value));
    const totalEl = getEl('expense-total');
    if(totalEl) totalEl.textContent = formatCurrency(total);
    
    updateSelectedCounter();
}





/* ========================================================
   9. FUNÇÕES DE AÇÃO (PDF, SALVAR, RESET)
   ======================================================== */

/**
 * 9.1 Gera PDF com todos os dados
 */
async function handlePdf() {
    showNotification("Gerando PDF...", "info");
    
    try {
        console.log("=".repeat(50));
        console.log("🚀 INICIANDO GERAÇÃO DE PDF");
        console.log("=".repeat(50));
        
        // Dados básicos
        const assistedName = getEl('documents-assisted-name')?.textContent || 'Assistido';
        const actionTitle = getEl('checklist-title')?.textContent || '';
        
        // Documentos marcados
        const documentosTextos = collectCheckedDocuments();
        
        // Dados do réu e gastos
        const reu = getReuDataFromForm();
        const gastos = getExpenseDataFromForm();
        
        // Adiciona dados do réu ao PDF (apenas se o checkbox único estiver marcado)
        if (reu.checkReuUnico) {
            addReuToPdfData(documentosTextos, reu);
        }
        
        // Adiciona dados de gastos ao PDF
        addExpensesToPdfData(documentosTextos, gastos);
        
        // Prepara dados completos
        const checklistData = {
            checkedIds: Array.from(document.querySelectorAll('.doc-checkbox:checked')).map(cb => cb.id),
            docTypes: getDocTypesFromForm(),
            reuData: reu,
            expenseData: gastos
        };
        
        // Adiciona IDs dos novos itens
        documentosTextos.forEach(item => {
            if (item.id.startsWith('reu-') || item.id.startsWith('gasto-')) {
                checklistData.checkedIds.push(item.id);
                if (!checklistData.docTypes) checklistData.docTypes = {};
                checklistData.docTypes[item.id] = 'Digital';
            }
        });
        
        // Gera PDF
        const resultado = PDFService.generateChecklistPDF(
            assistedName, actionTitle, checklistData, documentosTextos
        );
        
        if (resultado) {
            console.log("✅ PDF gerado com sucesso!");
            showNotification("PDF gerado com sucesso!");
            await handleSave(false);
        } else {
            console.error("❌ Erro ao gerar PDF");
            showNotification("Erro ao gerar PDF", "error");
        }
        
    } catch (err) {
        console.error("❌ Erro:", err);
        showNotification("Erro ao gerar PDF: " + err.message, "error");
    }
}

/**
 * 9.2 Coleta documentos marcados
 * @returns {Array}
 */
function collectCheckedDocuments() {
    const documentos = [];
    document.querySelectorAll('.doc-checkbox:checked').forEach(cb => {
        let text = '';
        const label = cb.closest('label');
        if (label) {
            const span = label.querySelector('span:not(.sr-only)');
            if (span) text = span.textContent;
        }
        if (!text) {
            const parentDiv = cb.closest('div');
            if (parentDiv) {
                const possibleSpan = parentDiv.querySelector('span');
                if (possibleSpan) text = possibleSpan.textContent;
            }
        }
        documentos.push({
            id: cb.id,
            text: (text || cb.id || 'Documento').trim()
        });
    });
    return documentos;
}

/**
 * 9.3 Adiciona dados do réu ao PDF
 * @param {Array} documentosTextos - Array de documentos
 * @param {Object} reu - Dados do réu
 */
function addReuToPdfData(documentosTextos, reu) {
    documentosTextos.push({
        id: 'reu-titulo',
        text: '👤 DADOS DO RÉU (Endereço para citação):'
    });
    
    const linhas = [];
    
    // Identificação
    if (reu.nome) linhas.push(`   • Nome do Réu: ${reu.nome}`);
    if (reu.cpf) linhas.push(`   • CPF do Réu: ${reu.cpf}`);
    if (reu.telefone) linhas.push(`   • Telefone do Réu: ${reu.telefone}`);
    
    // Residencial
    if (reu.cep) linhas.push(`   • CEP Residencial: ${reu.cep}`);
    if (reu.rua) {
        let end = `   • Endereço Residencial: ${reu.rua}`;
        if (reu.numero) end += `, nº ${reu.numero}`;
        if (reu.complemento) end += ` - ${reu.complemento}`;
        linhas.push(end);
    }
    if (reu.bairro) linhas.push(`   • Bairro: ${reu.bairro}`);
    if (reu.cidade) {
        let cidade = `   • Cidade: ${reu.cidade}`;
        if (reu.uf) cidade += ` - ${reu.uf}`;
        linhas.push(cidade);
    }
    if (reu.referencia) linhas.push(`   • Ponto de Referência: ${reu.referencia}`);
    
    // Comercial
    if (reu.empresa) linhas.push(`   • Empresa: ${reu.empresa}`);
    if (reu.rua_comercial) {
        let end = `   • Endereço Comercial: ${reu.rua_comercial}`;
        if (reu.numero_comercial) end += `, nº ${reu.numero_comercial}`;
        if (reu.complemento_comercial) end += ` - ${reu.complemento_comercial}`;
        linhas.push(end);
    }
    if (reu.bairro_comercial) linhas.push(`   • Bairro Comercial: ${reu.bairro_comercial}`);
    if (reu.cidade_comercial) {
        let cidade = `   • Cidade Comercial: ${reu.cidade_comercial}`;
        if (reu.uf_comercial) cidade += ` - ${reu.uf_comercial}`;
        linhas.push(cidade);
    }
    if (reu.cep_comercial) linhas.push(`   • CEP Comercial: ${reu.cep_comercial}`);
    
    linhas.forEach((linha, i) => {
        documentosTextos.push({ id: `reu-item-${i}`, text: linha });
    });
}

/**
 * 9.4 Adiciona dados de gastos ao PDF
 * @param {Array} documentosTextos - Array de documentos
 * @param {Object} gastos - Dados de gastos
 */
function addExpensesToPdfData(documentosTextos, gastos) {
    const temGastos = gastos.checkExibirGastos === true && Object.entries(gastos).some(([k, v]) => k !== 'checkExibirGastos' && v && typeof v === 'string' && v !== 'R$ 0,00' && v.trim() !== '');
    
    if (!temGastos) return;
    
    documentosTextos.push({
        id: 'gastos-titulo',
        text: '💰 PLANILHA DE GASTOS MENSAIS (Ação de Alimentos):'
    });
    
    const categorias = [
        { id: 'moradia', label: 'Moradia' },
        { id: 'alimentacao', label: 'Alimentação' },
        { id: 'educacao', label: 'Educação' },
        { id: 'saude', label: 'Saúde' },
        { id: 'vestuario', label: 'Vestuário' },
        { id: 'lazer', label: 'Lazer' },
        { id: 'outras', label: 'Outras' }
    ];
    
    categorias.forEach(cat => {
        const valor = gastos[cat.id];
        if (valor && valor !== 'R$ 0,00' && valor.trim() !== '') {
            documentosTextos.push({
                id: `gasto-${cat.id}`,
                text: `   • ${cat.label}: ${valor}`
            });
        }
    });
}

/**
 * 9.5 Salva dados no Firestore
 * @param {boolean} closeModal - Se deve fechar o modal após salvar
 */
async function handleSave(closeModal = true) {
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
    if (!container) {
        console.error("Container checklist não encontrado");
        return;
    }
    
    const checkedIds = Array.from(container.querySelectorAll('.doc-checkbox:checked')).map(cb => cb.id);
    const docTypes = {};
    checkedIds.forEach(id => {
        const radio = document.querySelector(`input[name="type-${id}"]:checked`);
        docTypes[id] = radio ? radio.value : 'Físico';
    });

    const payload = {
        documentChecklist: {
            action: currentChecklistAction,
            checkedIds: checkedIds,
            docTypes: docTypes,
            reuData: getReuDataFromForm(),
            expenseData: getExpenseDataFromForm()
        },
        documentState: 'saved',
        selectedAction: currentChecklistAction ? documentsData[currentChecklistAction]?.title : null,
        lastActionBy: window.app?.currentUserName || 'Sistema',
        lastActionTimestamp: new Date().toISOString()
    };

    try {
        const docRef = doc(db, "pautas", currentPautaId, "attendances", currentAssistedId);
        await updateDoc(docRef, payload);
        
        console.log("✅ Dados salvos com sucesso!");
        
        if (closeModal) {
            showNotification("Dados salvos com sucesso!");
            getEl('documents-modal').classList.add('hidden');
        }
        
        if (window.app && typeof window.app.refreshAssistedList === 'function') {
            window.app.refreshAssistedList();
        }
        
    } catch (e) {
        console.error("❌ Erro ao salvar:", e);
        showNotification("Erro ao salvar dados: " + e.message, "error");
    }
}

/**
 * 9.6 Reseta o checklist
 */
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

/**
 * 9.7 Volta para seleção de ação
 */
function handleBack() {
    getEl('document-checklist-view')?.classList.add('hidden');
    getEl('document-checklist-view-header')?.classList.add('hidden');
    getEl('checklist-search-container')?.classList.add('hidden');
    getEl('document-action-selection')?.classList.remove('hidden');
    getEl('address-editor-container')?.classList.add('hidden');
}





/* ========================================================
   10. FUNÇÃO DE DIAGNÓSTICO
   ======================================================== */

window.diagnosticarPDF = function() {
    console.log("=".repeat(60));
    console.log("🔍 DIAGNÓSTICO COMPLETO DO PDF");
    console.log("=".repeat(60));
    
    console.log("\n1. DADOS DO RÉU:");
    console.table(getReuDataFromForm());
    
    console.log("\n2. DADOS DE GASTOS:");
    console.table(getExpenseDataFromForm());
    
    console.log("\n3. DOCUMENTOS MARCADOS:");
    const docs = [];
    document.querySelectorAll('.doc-checkbox:checked').forEach(cb => docs.push(cb.id));
    console.log(docs);
    
    console.log("\n4. CONTAGEM TOTAL:");
    console.log(`📊 ${getEl('checklist-counter')?.textContent}`);
    
    console.log("\n✅ Diagnóstico concluído!");
};





/* ========================================================
   11. EXPORTS E INICIALIZAÇÃO
   ======================================================== */

/**
 * 11.1 Configura o modal de detalhes
 * @param {Object} config - Configuração com db
 */
export function setupDetailsModal(config) {
    console.log("⚙️ setupDetailsModal chamado", config);
    db = config.db;

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

/**
 * 11.2 Abre o modal de detalhes
 * @param {Object} config - Configuração com IDs e dados
 */
export async function openDetailsModal(config) {
    console.log("🔓 openDetailsModal chamado", config);
    
    if (!config || !config.assistedId || !config.pautaId) {
        console.error("Configuração inválida");
        return;
    }
    
    currentAssistedId = config.assistedId;
    window.currentAssistedId = config.assistedId;
    window.assistedIdToHandle = config.assistedId;
    currentPautaId = config.pautaId;
    allAssisted = config.allAssisted || [];
    db = config.db || window.app?.db;
    
    // Busca dados atualizados
    try {
        if (db && currentPautaId && currentAssistedId) {
            const docRef = doc(db, "pautas", currentPautaId, "attendances", currentAssistedId);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                const data = docSnap.data();
                const index = allAssisted.findIndex(a => a.id === currentAssistedId);
                if (index !== -1) {
                    allAssisted[index] = { id: currentAssistedId, ...data };
                } else {
                    allAssisted.push({ id: currentAssistedId, ...data });
                }
            }
        }
    } catch (error) {
        console.error("Erro ao buscar dados atualizados:", error);
    }
    
    const assisted = allAssisted.find(a => a.id === currentAssistedId);
    if (!assisted) {
        console.error("Assistido não encontrado");
        return;
    }
    
    getEl('documents-assisted-name').textContent = assisted.name;
    
    const selectionArea = getEl('document-action-selection');
    const checklistView = getEl('document-checklist-view');
    const checklistHeader = getEl('document-checklist-view-header');
    const searchContainer = getEl('checklist-search-container');
    const reuContainer = getEl('address-editor-container');
    
    if (assisted.documentChecklist && assisted.documentChecklist.action) {
        // Carrega checklist salvo
        console.log("✅ Checklist encontrado! Carregando:", assisted.documentChecklist.action);
        
        currentChecklistAction = assisted.documentChecklist.action;
        renderChecklist(assisted.documentChecklist.action);
        
        selectionArea?.classList.add('hidden');
        checklistView?.classList.remove('hidden');
        checklistView?.classList.add('flex');
        checklistHeader?.classList.remove('hidden');
        searchContainer?.classList.remove('hidden');
        
        const titleEl = getEl('checklist-title');
        if (titleEl && documentsData[assisted.documentChecklist.action]) {
            titleEl.textContent = documentsData[assisted.documentChecklist.action].title;
        }
        
        if (assisted.documentChecklist.reuData) {
            setTimeout(() => fillReuData(assisted.documentChecklist.reuData), 300);
        }
        
        if (assisted.documentChecklist.expenseData) {
            setTimeout(() => fillExpenseData(assisted.documentChecklist.expenseData), 300);
        }
        
        setTimeout(checkReuVisibility, 400);
        
    } else {
        // Mostra seleção de assunto
        console.log("❌ Nenhum checklist encontrado. Mostrando seleção de assuntos.");
        
        checklistView?.classList.add('hidden');
        checklistView?.classList.remove('flex');
        checklistHeader?.classList.add('hidden');
        searchContainer?.classList.add('hidden');
        reuContainer?.classList.add('hidden');
        selectionArea?.classList.remove('hidden');
        
        renderSubjectSelection(selectionArea);
    }
    
    getEl('documents-modal')?.classList.remove('hidden');
}

/**
 * 11.3 Renderiza seleção de assuntos
 * @param {HTMLElement} selectionArea - Container da seleção
 */
function renderSubjectSelection(selectionArea) {
    if (!selectionArea) return;
    
    selectionArea.innerHTML = `
        <div class="p-2 sm:p-4">
            <div class="mb-4">
                <input type="text" id="subject-search-input" 
                       placeholder="🔍 Buscar assunto..." 
                       class="w-full p-3 border-2 border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none">
            </div>
            <p class="text-gray-500 mb-4 text-xs sm:text-sm text-center font-bold uppercase tracking-widest opacity-50">
                Selecione o Assunto
            </p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 action-grid max-h-[50vh] overflow-y-auto p-1"></div>
        </div>
    `;
    
    const grid = selectionArea.querySelector('.action-grid');
    const searchInput = selectionArea.querySelector('#subject-search-input');
    
    const subjectsList = Object.keys(documentsData).map(key => ({
        key,
        title: documentsData[key].title
    }));
    
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
                renderChecklist(key);
                selectionArea.classList.add('hidden');
                getEl('document-checklist-view').classList.remove('hidden');
                getEl('document-checklist-view').classList.add('flex');
                updateDocumentState('selected');
            };
            
            grid.appendChild(btn);
        });
    }
    
    renderFilteredSubjects();
    searchInput.addEventListener('input', (e) => renderFilteredSubjects(e.target.value));
}





/* ========================================================
   12. EXPORTS ADICIONAIS E GLOBAIS
   ======================================================== */

// Torna funções globais para acesso no console
window.openDetailsModal = openDetailsModal;
window.setupDetailsModal = setupDetailsModal;
window.documentsData = documentsData;
window.getReuDataFromForm = getReuDataFromForm;
window.getExpenseDataFromForm = getExpenseDataFromForm;

console.log("✅ detalhes.js carregado com sucesso!");
