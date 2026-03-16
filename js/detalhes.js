/**
 * detalhes.js - SIGAP
 * Versão COMPLETA com formulário de réu atualizado (endereço para citação)
 */

import { doc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showNotification } from './utils.js';
import { PDFService } from './pdfService.js';

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

// --- 5. FUNÇÃO PARA OBTER TIPOS DE DOCUMENTOS DO FORMULÁRIO ---
function getDocTypesFromForm() {
    const docTypes = {};
    document.querySelectorAll('.doc-checkbox:checked').forEach(cb => {
        const typeRadio = document.querySelector(`input[name="type-${cb.id}"]:checked`);
        docTypes[cb.id] = typeRadio ? typeRadio.value : 'Físico';
    });
    return docTypes;
}

// --- 6. FUNÇÃO PARA ATUALIZAR CONTADOR DE ITENS SELECIONADOS ---
function updateSelectedCounter() {
    const container = getEl('checklist-container');
    if (!container) return;
    
    const checkedCount = container.querySelectorAll('.doc-checkbox:checked').length;
    const counterEl = getEl('checklist-counter');
    if (counterEl) {
        counterEl.textContent = `${checkedCount} itens selecionados`;
    }
    
    if (checkedCount > 0) {
        updateDocumentState('filling');
    }
}

// --- 7. FUNÇÃO PARA ATUALIZAR ESTADO DO DOCUMENTO NO FIRESTORE ---
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

// --- 8. FUNÇÃO PARA VERIFICAR SE DEVE MOSTRAR O FORMULÁRIO DO RÉU ---
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

// --- 9. RENDERIZAÇÃO DO CHECKLIST ---
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

    // SEMPRE adicionar a planilha de gastos se a ação exigir
    if (ACTIONS_ALWAYS_EXPENSES.includes(actionKey)) {
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
    } else {
        // Botão opcional para adicionar planilha de gastos
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

    setTimeout(checkReuVisibility, 100);
    updateSelectedCounter();
    
    if (saved?.reuData) {
        setTimeout(() => {
            fillReuData(saved.reuData);
        }, 200);
    }
}

// --- 10. FORMULÁRIO DO RÉU (VERSÃO COMPLETA COM ENDEREÇO PARA CITAÇÃO) ---
function renderReuForm(containerId) {
    const container = getEl(containerId);
    if (!container) return;
    
    const showWork = ACTIONS_WITH_WORK_INFO.includes(currentChecklistAction);

    container.innerHTML = `
        <div class="p-4 sm:p-6 bg-red-50 border-2 border-red-200 rounded-2xl shadow-sm mt-6">
            <h3 class="text-xs font-black text-red-600 mb-4 uppercase flex items-center gap-2 tracking-tighter">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                DADOS DA PARTE CONTRÁRIA (RÉU) - ENDEREÇO PARA CITAÇÃO
            </h3>
            
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

            <!-- SEÇÃO 1: IDENTIFICAÇÃO BÁSICA -->
            <div class="bg-white p-3 rounded-lg border border-gray-200 mb-4">
                <h4 class="text-[10px] font-black text-gray-500 uppercase mb-3">1. IDENTIFICAÇÃO DO RÉU</h4>
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

            <!-- SEÇÃO 2: ENDEREÇO RESIDENCIAL (PRINCIPAL) -->
            <div class="bg-red-50 p-3 rounded-lg border border-red-200 mb-4">
                <h4 class="text-[10px] font-black text-red-600 uppercase mb-3 flex items-center gap-1">
                    2. ENDEREÇO PARA CITAÇÃO (RESIDENCIAL)
                    <span class="text-[8px] font-normal text-red-500 ml-1">(Mais importante)</span>
                </h4>
                
                <!-- Linha: CEP com botão de busca -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
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
                        <label class="text-[9px] font-black text-gray-400 uppercase">Logradouro (Rua, Avenida, etc.)</label>
                        <input type="text" id="rua-reu" placeholder="Ex: Rua das Flores, Avenida Brasil..." 
                               class="w-full p-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-red-500">
                    </div>
                </div>
                
                <!-- Linha: Número e Complemento -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
                    <div>
                        <label class="text-[9px] font-black text-gray-400 uppercase">Número</label>
                        <input type="text" id="numero-reu" placeholder="123" 
                               class="w-full p-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-red-500">
                    </div>
                    <div class="md:col-span-2">
                        <label class="text-[9px] font-black text-gray-400 uppercase">Complemento</label>
                        <input type="text" id="complemento-reu" placeholder="Apto 201, Bloco B, Casa 5..." 
                               class="w-full p-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-red-500">
                    </div>
                </div>
                
                <!-- Linha: Bairro -->
                <div class="mb-3">
                    <label class="text-[9px] font-black text-gray-400 uppercase">Bairro</label>
                    <input type="text" id="bairro-reu" placeholder="Centro, Copacabana, Tijuca..." 
                           class="w-full p-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-red-500">
                </div>
                
                <!-- Linha: Cidade e Estado -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
                    <div class="md:col-span-2">
                        <label class="text-[9px] font-black text-gray-400 uppercase">Cidade</label>
                        <input type="text" id="cidade-reu" placeholder="Rio de Janeiro" 
                               class="w-full p-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-red-500">
                    </div>
                    <div>
                        <label class="text-[9px] font-black text-gray-400 uppercase">Estado</label>
                        <select id="estado-reu" class="w-full p-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-red-500">
                            <option value="">Selecione...</option>
                            <option value="AC">Acre (AC)</option>
                            <option value="AL">Alagoas (AL)</option>
                            <option value="AP">Amapá (AP)</option>
                            <option value="AM">Amazonas (AM)</option>
                            <option value="BA">Bahia (BA)</option>
                            <option value="CE">Ceará (CE)</option>
                            <option value="DF">Distrito Federal (DF)</option>
                            <option value="ES">Espírito Santo (ES)</option>
                            <option value="GO">Goiás (GO)</option>
                            <option value="MA">Maranhão (MA)</option>
                            <option value="MT">Mato Grosso (MT)</option>
                            <option value="MS">Mato Grosso do Sul (MS)</option>
                            <option value="MG">Minas Gerais (MG)</option>
                            <option value="PA">Pará (PA)</option>
                            <option value="PB">Paraíba (PB)</option>
                            <option value="PR">Paraná (PR)</option>
                            <option value="PE">Pernambuco (PE)</option>
                            <option value="PI">Piauí (PI)</option>
                            <option value="RJ" selected>Rio de Janeiro (RJ)</option>
                            <option value="RN">Rio Grande do Norte (RN)</option>
                            <option value="RS">Rio Grande do Sul (RS)</option>
                            <option value="RO">Rondônia (RO)</option>
                            <option value="RR">Roraima (RR)</option>
                            <option value="SC">Santa Catarina (SC)</option>
                            <option value="SP">São Paulo (SP)</option>
                            <option value="SE">Sergipe (SE)</option>
                            <option value="TO">Tocantins (TO)</option>
                        </select>
                    </div>
                </div>
                
                <!-- Linha: Ponto de Referência -->
                <div>
                    <label class="text-[9px] font-black text-gray-400 uppercase">Ponto de Referência</label>
                    <input type="text" id="referencia-reu" placeholder="Ex: Próximo à padaria X, Em frente ao posto de saúde Y" 
                           class="w-full p-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-red-500">
                    <p class="text-[8px] text-gray-500 mt-1">Informação importante para localização</p>
                </div>
            </div>

            <!-- SEÇÃO 3: ENDEREÇO COMERCIAL/TRABALHO (ALTERNATIVO) -->
            <div class="bg-gray-50 p-3 rounded-lg border border-gray-200">
                <h4 class="text-[10px] font-black text-gray-500 uppercase mb-3">
                    3. ENDEREÇO PARA CITAÇÃO (COMERCIAL/TRABALHO - Alternativo)
                    <span class="text-[8px] font-normal text-gray-400 ml-1">(Preencha apenas se o residencial for incerto)</span>
                </h4>
                
                <!-- Nome da Empresa -->
                <div class="mb-3">
                    <label class="text-[9px] font-black text-gray-400 uppercase">Nome da Empresa/Local de Trabalho</label>
                    <input type="text" id="empresa-reu" placeholder="Razão social ou nome fantasia" 
                           class="w-full p-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-gray-500">
                </div>
                
                <!-- Logradouro Comercial -->
                <div class="mb-3">
                    <label class="text-[9px] font-black text-gray-400 uppercase">Logradouro</label>
                    <input type="text" id="rua-comercial-reu" placeholder="Ex: Avenida Rio Branco" 
                           class="w-full p-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-gray-500">
                </div>
                
                <!-- Número e Complemento Comercial -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
                    <div>
                        <label class="text-[9px] font-black text-gray-400 uppercase">Número</label>
                        <input type="text" id="numero-comercial-reu" placeholder="123" 
                               class="w-full p-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-gray-500">
                    </div>
                    <div class="md:col-span-2">
                        <label class="text-[9px] font-black text-gray-400 uppercase">Complemento</label>
                        <input type="text" id="complemento-comercial-reu" placeholder="Sala 1001, Andar 5..." 
                               class="w-full p-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-gray-500">
                    </div>
                </div>
                
                <!-- Bairro Comercial -->
                <div class="mb-3">
                    <label class="text-[9px] font-black text-gray-400 uppercase">Bairro</label>
                    <input type="text" id="bairro-comercial-reu" placeholder="Centro" 
                           class="w-full p-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-gray-500">
                </div>
                
                <!-- Cidade, Estado e CEP Comercial -->
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
                            <option value="AC">AC</option>
                            <option value="AL">AL</option>
                            <option value="AP">AP</option>
                            <option value="AM">AM</option>
                            <option value="BA">BA</option>
                            <option value="CE">CE</option>
                            <option value="DF">DF</option>
                            <option value="ES">ES</option>
                            <option value="GO">GO</option>
                            <option value="MA">MA</option>
                            <option value="MT">MT</option>
                            <option value="MS">MS</option>
                            <option value="MG">MG</option>
                            <option value="PA">PA</option>
                            <option value="PB">PB</option>
                            <option value="PR">PR</option>
                            <option value="PE">PE</option>
                            <option value="PI">PI</option>
                            <option value="RJ" selected>RJ</option>
                            <option value="RN">RN</option>
                            <option value="RS">RS</option>
                            <option value="RO">RO</option>
                            <option value="RR">RR</option>
                            <option value="SC">SC</option>
                            <option value="SP">SP</option>
                            <option value="SE">SE</option>
                            <option value="TO">TO</option>
                        </select>
                    </div>
                    <div>
                        <label class="text-[9px] font-black text-gray-400 uppercase">CEP</label>
                        <input type="text" id="cep-comercial-reu" placeholder="00000-000" maxlength="9"
                               class="w-full p-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-gray-500">
                    </div>
                </div>
            </div>

            <!-- BOTÃO PARA SALVAR -->
            <div class="mt-4 text-right">
                <button type="button" id="salvar-reu-btn" 
                        class="bg-red-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-700 text-xs uppercase">
                    Salvar Dados do Réu
                </button>
            </div>
        </div>
    `;

    // ===== FUNCIONALIDADE DE BUSCA DE CEP =====
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

    // Evento para o botão de busca
    if (buscarBtn) {
        buscarBtn.addEventListener('click', () => {
            buscarCEP(cepInp.value, 'residencial');
        });
    }

    // Evento para o campo de CEP (blur)
    if (cepInp) {
        cepInp.addEventListener('blur', () => {
            buscarCEP(cepInp.value, 'residencial');
        });
    }

    // Busca de CEP comercial
    const cepComercial = getEl('cep-comercial-reu');
    if (cepComercial) {
        cepComercial.addEventListener('blur', () => {
            buscarCEP(cepComercial.value, 'comercial');
        });
    }

    // Botão salvar
    const salvarBtn = document.getElementById('salvar-reu-btn');
    if (salvarBtn) {
        salvarBtn.addEventListener('click', () => {
            const event = new CustomEvent('reuSalvo', { detail: getReuDataFromForm() });
            document.dispatchEvent(event);
            showNotification("Dados do réu salvos!", "success");
        });
    }
}

// --- 11. PLANILHA DE GASTOS ---
function renderExpenseTable() {
    const div = document.createElement('div');
    div.className = 'mt-6 p-4 bg-green-50 border-2 border-green-100 rounded-xl shadow-sm';
    div.id = 'expense-table';
    let rows = '';
    
    EXPENSE_CATEGORIES.forEach(c => {
        rows += `
            <tr class="border-b border-green-100 last:border-0">
                <td class="py-3">
                    <p class="text-[10px] font-bold text-green-800 uppercase leading-none">${c.label}</p>
                    <p class="text-[9px] text-green-600 italic opacity-75">${c.desc}</p>
                </td>
                <td class="py-3 pl-2">
                    <input type="text" id="expense-${c.id}" class="expense-input w-full p-2 bg-white border border-green-200 rounded-lg text-right text-xs shadow-sm outline-none" 
                           placeholder="R$ 0,00" inputmode="numeric">
                </td>
            </tr>`;
    });
    
    div.innerHTML = `
        <h3 class="text-[10px] font-black text-green-700 mb-3 uppercase text-center font-bold tracking-widest">Planilha de Gastos Mensais</h3>
        <table class="w-full border-collapse">
            ${rows}
        </table>
        <div class="mt-4 flex justify-between font-black text-green-900 border-t border-green-200 pt-3 text-sm">
            <span>TOTAL MENSAL:</span>
            <span id="expense-total">R$ 0,00</span>
        </div>
        <div class="mt-2 text-right">
            <button id="fechar-gastos" class="text-[10px] text-gray-500 hover:text-gray-700 underline">Fechar planilha</button>
        </div>
    `;
    
    div.querySelectorAll('.expense-input').forEach(inp => {
        inp.addEventListener('input', (e) => {
            let v = e.target.value.replace(/\D/g, '');
            if (v) {
                v = (Number(v)/100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                e.target.value = v;
            } else {
                e.target.value = '';
            }
            
            let total = 0;
            div.querySelectorAll('.expense-input').forEach(i => {
                total += parseCurrency(i.value);
            });
            const totalEl = document.getElementById('expense-total');
            if(totalEl) totalEl.textContent = formatCurrency(total);
            
            updateDocumentState('filling');
        });
    });
    
    setTimeout(() => {
        document.getElementById('fechar-gastos')?.addEventListener('click', () => {
            const container = document.getElementById('expense-table-container');
            if (container) {
                container.innerHTML = '';
            }
            const expenseButton = document.getElementById('expense-button-container');
            if (expenseButton) expenseButton.style.display = 'block';
        });
    }, 100);
    
    return div;
}

// --- 12. FUNÇÕES PARA PEGAR DADOS DOS FORMULÁRIOS ---
function getReuDataFromForm() {
    return {
        // Identificação
        nome: getEl('nome-reu')?.value || '',
        cpf: getEl('cpf-reu')?.value || '',
        telefone: getEl('telefone-reu')?.value || '',
        
        // Endereço residencial
        cep: getEl('cep-reu')?.value || '',
        rua: getEl('rua-reu')?.value || '',
        numero: getEl('numero-reu')?.value || '',
        complemento: getEl('complemento-reu')?.value || '',
        bairro: getEl('bairro-reu')?.value || '',
        cidade: getEl('cidade-reu')?.value || '',
        uf: getEl('estado-reu')?.value || '',
        referencia: getEl('referencia-reu')?.value || '',
        
        // Endereço comercial
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
        
        // Garantir que nunca retorne undefined
        if (!valor || valor.trim() === '') {
            valor = 'R$ 0,00';
        }
        
        d[cat.id] = valor;
    });
    return d;
}

function fillReuData(d) {
    if (!d) return;
    
    const setValue = (id, value) => {
        const el = getEl(id);
        if (el) el.value = value || '';
    };
    
    // Identificação
    setValue('nome-reu', d.nome);
    setValue('cpf-reu', d.cpf);
    setValue('telefone-reu', d.telefone);
    
    // Endereço residencial
    setValue('cep-reu', d.cep);
    setValue('rua-reu', d.rua);
    setValue('numero-reu', d.numero);
    setValue('complemento-reu', d.complemento);
    setValue('bairro-reu', d.bairro);
    setValue('cidade-reu', d.cidade);
    setValue('estado-reu', d.uf);
    setValue('referencia-reu', d.referencia);
    
    // Endereço comercial
    setValue('empresa-reu', d.empresa);
    setValue('rua-comercial-reu', d.rua_comercial);
    setValue('numero-comercial-reu', d.numero_comercial);
    setValue('complemento-comercial-reu', d.complemento_comercial);
    setValue('bairro-comercial-reu', d.bairro_comercial);
    setValue('cidade-comercial-reu', d.cidade_comercial);
    setValue('estado-comercial-reu', d.uf_comercial);
    setValue('cep-comercial-reu', d.cep_comercial);
}

function fillExpenseData(d) {
    if (!d) return;
    
    EXPENSE_CATEGORIES.forEach(cat => {
        const el = getEl(`expense-${cat.id}`);
        if (el && d[cat.id]) {
            el.value = d[cat.id];
        }
    });
    
    let total = 0;
    document.querySelectorAll('.expense-input').forEach(i => {
        total += parseCurrency(i.value);
    });
    const totalEl = getEl('expense-total');
    if(totalEl) totalEl.textContent = formatCurrency(total);
}

// --- 13. FUNÇÃO PARA GERAR PDF (GASTOS E RÉU COMO ITENS) ---
async function handlePdf() {
    showNotification("Gerando PDF...", "info");
    
    try {
        console.log("=".repeat(50));
        console.log("🚀 INICIANDO GERAÇÃO DE PDF");
        console.log("=".repeat(50));
        
        // 1. Dados básicos
        const assistedName = getEl('documents-assisted-name')?.textContent || 'Assistido';
        const actionTitle = getEl('checklist-title')?.textContent || '';
        
        console.log("👤 Assistido:", assistedName);
        console.log("📋 Ação:", actionTitle);
        
        // 2. Coletar documentos marcados no checklist original
        const documentosTextos = [];
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
            if (!text || text.trim() === '') {
                text = cb.id || 'Documento';
            }
            
            documentosTextos.push({
                id: cb.id,
                text: text.trim()
            });
        });
        
        // ===== 3. VERIFICAR DADOS DO RÉU =====
        const reu = getReuDataFromForm();
        
        // Verificar se TEM dados do réu preenchidos
        const temReu = Object.values(reu).some(v => v && v.trim() !== '');
        
        if (temReu) {
            console.log("👤 DADOS DA PARTE CONTRÁRIA encontrados!");
            
            // Criar linhas para cada campo preenchido do réu
            const linhasReu = [];
            
            // Nome
            if (reu.nome && reu.nome.trim() !== '') {
                linhasReu.push(`👤 Nome do Réu: ${reu.nome}`);
            }
            
            // CPF e Telefone
            if (reu.cpf && reu.cpf.trim() !== '') {
                linhasReu.push(`📄 CPF do Réu: ${reu.cpf}`);
            }
            
            if (reu.telefone && reu.telefone.trim() !== '') {
                linhasReu.push(`📞 Telefone do Réu: ${reu.telefone}`);
            }
            
            // ENDEREÇO RESIDENCIAL
            if (reu.cep && reu.cep.trim() !== '') {
                linhasReu.push(`📍 CEP Residencial: ${reu.cep}`);
            }
            
            if (reu.rua && reu.rua.trim() !== '') {
                let enderecoCompleto = `🏠 Endereço Residencial: ${reu.rua}`;
                if (reu.numero && reu.numero.trim() !== '') {
                    enderecoCompleto += `, nº ${reu.numero}`;
                }
                if (reu.complemento && reu.complemento.trim() !== '') {
                    enderecoCompleto += ` - ${reu.complemento}`;
                }
                linhasReu.push(enderecoCompleto);
            }
            
            if (reu.bairro && reu.bairro.trim() !== '') {
                linhasReu.push(`🏘️ Bairro: ${reu.bairro}`);
            }
            
            if (reu.cidade && reu.cidade.trim() !== '') {
                let cidadeLinha = `🌆 Cidade: ${reu.cidade}`;
                if (reu.uf && reu.uf.trim() !== '') {
                    cidadeLinha += ` - ${reu.uf}`;
                }
                linhasReu.push(cidadeLinha);
            }
            
            if (reu.referencia && reu.referencia.trim() !== '') {
                linhasReu.push(`📍 Ponto de Referência: ${reu.referencia}`);
            }
            
            // ENDEREÇO COMERCIAL
            if (reu.empresa && reu.empresa.trim() !== '') {
                linhasReu.push(`💼 Empresa: ${reu.empresa}`);
            }
            
            if (reu.rua_comercial && reu.rua_comercial.trim() !== '') {
                let endComercial = `🏢 Endereço Comercial: ${reu.rua_comercial}`;
                if (reu.numero_comercial && reu.numero_comercial.trim() !== '') {
                    endComercial += `, nº ${reu.numero_comercial}`;
                }
                if (reu.complemento_comercial && reu.complemento_comercial.trim() !== '') {
                    endComercial += ` - ${reu.complemento_comercial}`;
                }
                linhasReu.push(endComercial);
            }
            
            if (reu.bairro_comercial && reu.bairro_comercial.trim() !== '') {
                linhasReu.push(`🏘️ Bairro Comercial: ${reu.bairro_comercial}`);
            }
            
            if (reu.cidade_comercial && reu.cidade_comercial.trim() !== '') {
                let cidadeComercial = `🌆 Cidade Comercial: ${reu.cidade_comercial}`;
                if (reu.uf_comercial && reu.uf_comercial.trim() !== '') {
                    cidadeComercial += ` - ${reu.uf_comercial}`;
                }
                linhasReu.push(cidadeComercial);
            }
            
            if (reu.cep_comercial && reu.cep_comercial.trim() !== '') {
                linhasReu.push(`📍 CEP Comercial: ${reu.cep_comercial}`);
            }
            
            // Adicionar CADA linha como um item separado no checklist
            linhasReu.forEach((linha, index) => {
                documentosTextos.push({
                    id: `reu-item-${index}`,
                    text: linha
                });
            });
        }
        
        // ===== 4. VERIFICAR GASTOS =====
        const gastos = getExpenseDataFromForm();
        const categorias = ['moradia', 'alimentacao', 'educacao', 'saude', 'vestuario', 'lazer', 'outras'];
        const nomesCategorias = {
            moradia: 'Moradia',
            alimentacao: 'Alimentação',
            educacao: 'Educação',
            saude: 'Saúde',
            vestuario: 'Vestuário',
            lazer: 'Lazer',
            outras: 'Outras'
        };
        
        // Verificar se TEM gastos preenchidos
        const temGastos = Object.values(gastos).some(v => v && v !== 'R$ 0,00' && v.trim() !== '');
        
        if (temGastos) {
            console.log("💰 GASTOS MENSAIS encontrados!");
            
            // Adicionar título da seção de gastos
            documentosTextos.push({
                id: 'gastos-titulo',
                text: '💰 PLANILHA DE GASTOS MENSAIS:'
            });
            
            // Adicionar CADA gasto como um item separado
            categorias.forEach(cat => {
                const valor = gastos[cat];
                if (valor && valor !== 'R$ 0,00' && valor.trim() !== '') {
                    documentosTextos.push({
                        id: `gasto-${cat}`,
                        text: `   • ${nomesCategorias[cat]}: ${valor}`
                    });
                }
            });
        }
        
        console.log("📄 TOTAL DE ITENS PARA O PDF:", documentosTextos.length);
        
        // 5. Preparar checklistData
        const checklistData = {
            checkedIds: Array.from(document.querySelectorAll('.doc-checkbox:checked')).map(cb => cb.id),
            docTypes: getDocTypesFromForm(),
            reuData: reu,
            expenseData: gastos
        };
        
        // Adicionar os IDs dos novos itens ao checkedIds
        documentosTextos.forEach(item => {
            if (item.id.startsWith('reu-item-') || item.id.startsWith('gasto-') || item.id === 'gastos-titulo') {
                checklistData.checkedIds.push(item.id);
                if (!checklistData.docTypes) checklistData.docTypes = {};
                checklistData.docTypes[item.id] = 'Digital';
            }
        });
        
        console.log("📦 Dados completos enviados:", checklistData);
        
        // 6. Gerar PDF
        const resultado = PDFService.generateChecklistPDF(
            assistedName, 
            actionTitle, 
            checklistData, 
            documentosTextos
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

// --- 14. FUNÇÃO PARA SALVAR ---
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

    const reuData = getReuDataFromForm();
    const expenseData = getExpenseDataFromForm();
    
    const actionKey = currentChecklistAction;
    const actionTitle = actionKey && documentsData[actionKey] ? documentsData[actionKey].title : null;

    const payload = {
        documentChecklist: {
            action: actionKey,
            checkedIds: checkedIds,
            docTypes: docTypes,
            reuData: reuData,
            expenseData: expenseData
        },
        documentState: 'saved',
        selectedAction: actionTitle,
        lastActionBy: window.app?.currentUserName || 'Sistema',
        lastActionTimestamp: new Date().toISOString()
    };

    console.log("💾 Salvando payload:", payload);

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

// --- 15. FUNÇÃO DE DIAGNÓSTICO ---
window.diagnosticarPDF = function() {
    console.log("=".repeat(60));
    console.log("🔍 DIAGNÓSTICO COMPLETO DO PDF");
    console.log("=".repeat(60));
    
    console.log("\n1. DADOS DO RÉU:");
    const reu = getReuDataFromForm();
    console.table(reu);
    
    console.log("\n2. DADOS DE GASTOS:");
    const gastos = getExpenseDataFromForm();
    console.table(gastos);
    
    console.log("\n3. DOCUMENTOS MARCADOS:");
    const docs = [];
    document.querySelectorAll('.doc-checkbox:checked').forEach(cb => {
        docs.push(cb.id);
    });
    console.log(docs);
    
    console.log("\n✅ Diagnóstico concluído!");
    return { reu, gastos, docs };
};

// --- 16. EXPORTS PRINCIPAIS ---
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
        console.log("✅ Checklist encontrado! Carregando:", assisted.documentChecklist.action);
        
        currentChecklistAction = assisted.documentChecklist.action;
        renderChecklist(assisted.documentChecklist.action);
        
        if (selectionArea) selectionArea.classList.add('hidden');
        if (checklistView) {
            checklistView.classList.remove('hidden');
            checklistView.classList.add('flex');
        }
        if (checklistHeader) checklistHeader.classList.remove('hidden');
        if (searchContainer) searchContainer.classList.remove('hidden');
        
        const titleEl = getEl('checklist-title');
        if (titleEl && documentsData[assisted.documentChecklist.action]) {
            titleEl.textContent = documentsData[assisted.documentChecklist.action].title;
        }
        
        if (assisted.documentChecklist.reuData) {
            setTimeout(() => {
                fillReuData(assisted.documentChecklist.reuData);
                checkReuVisibility();
            }, 300);
        }
        
        if (assisted.documentChecklist.expenseData) {
            setTimeout(() => {
                fillExpenseData(assisted.documentChecklist.expenseData);
            }, 300);
        }
        
        setTimeout(checkReuVisibility, 400);
        
    } else {
        console.log("❌ Nenhum checklist encontrado. Mostrando seleção de assuntos.");
        
        if (checklistView) {
            checklistView.classList.add('hidden');
            checklistView.classList.remove('flex');
        }
        if (checklistHeader) checklistHeader.classList.add('hidden');
        if (searchContainer) searchContainer.classList.add('hidden');
        if (reuContainer) reuContainer.classList.add('hidden');
        if (selectionArea) selectionArea.classList.remove('hidden');
        
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
    }
    
    const modal = getEl('documents-modal');
    if (modal) modal.classList.remove('hidden');
}

// Tornar funções globais
window.openDetailsModal = openDetailsModal;
window.setupDetailsModal = setupDetailsModal;
window.documentsData = documentsData;
window.getReuDataFromForm = getReuDataFromForm;
window.getExpenseDataFromForm = getExpenseDataFromForm;

console.log("✅ detalhes.js carregado com sucesso!");
