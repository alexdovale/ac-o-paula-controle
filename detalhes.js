/**
 * detalhes.js
 * Gerencia o modal de detalhes, checklist (Físico/Digital), dados do Réu e Planilha de Despesas.
 */

import { doc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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
const ACTIONS_CONDITIONAL_EXPENSES = ['divorcio_litigioso', 'divorcio_consensual', 'uniao_estavel_reconhecimento_dissolucao'];
const ACTIONS_WITH_WORK_INFO = ['alimentos_fixacao_majoracao_oferta', 'alimentos_gravidicos', 'alimentos_avoengos', 'divorcio_litigioso', 'uniao_estavel_reconhecimento_dissolucao', 'investigacao_paternidade'];

const documentsData = {
    obrigacao_fazer: { title: 'Ação de Obrigação de Fazer', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Específicos', docs: ['Contrato/Acordo', 'Provas do descumprimento'] }] },
    declaratoria_nulidade: { title: 'Ação Declaratória de Nulidade', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Específicos', docs: ['Documento a anular', 'Provas da ilegalidade'] }] },
    indenizacao_danos: { title: 'Ação de Indenização', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Específicos', docs: ['BO', 'Fotos/Vídeos', 'Orçamentos', 'Notas Fiscais', 'Testemunhas'] }] },
    revisional_debito: { title: 'Ação Revisional de Débito', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Específicos', docs: ['Contrato', 'Planilha da dívida', 'Extratos'] }] },
    exigir_contas: { title: 'Ação de Exigir Contas', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Específicos', docs: ['Prova da gestão de bens', 'Recusa em prestar contas'] }] },
    alimentos_fixacao_majoracao_oferta: { title: 'Alimentos (Fixação / Majoração / Oferta)', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Do Alimentando', docs: ['Certidão de Nascimento', 'Comprovantes de despesas (Planilha abaixo)'] }, { title: 'Sobre o Réu', docs: ['Endereço completo', 'Dados de trabalho'] }] },
    alimentos_gravidicos: { title: 'Ação de Alimentos Gravídicos', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Da Gestação', docs: ['Exame Beta HCG / Ultrassom', 'Pré-Natal', 'Gastos (Planilha abaixo)'] }, { title: 'Do Suposto Pai', docs: ['Indícios de paternidade', 'Endereço/Trabalho'] }] },
    alimentos_avoengos: { title: 'Alimentos Avoengos', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Específicos', docs: ['Certidão de Nascimento', 'Prova da impossibilidade dos pais', 'Planilha de Gastos'] }] },
    divorcio_consensual: { title: 'Divórcio Consensual', sections: [{ title: 'Documentação (Ambos)', docs: ['RG/CPF ambos', 'Comp. Residência ambos', 'Certidão Casamento', ...INCOME_DOCS_STRUCTURED] }, { title: 'Filhos/Bens', docs: ['Certidão Nascimento Filhos', 'Documentos Bens'] }] },
    divorcio_litigioso: { title: 'Divórcio Litigioso', sections: [{ title: 'Documentação Pessoal e Renda', docs: [...COMMON_DOCS_FULL, 'Certidão de Casamento'] }, { title: 'Filhos/Bens', docs: ['Certidão Nascimento Filhos', 'Documentos Bens', 'Planilha de Gastos (se houver alimentos)'] }, { title: 'Sobre o Cônjuge', docs: ['Endereço', 'Trabalho'] }] },
    uniao_estavel_reconhecimento_dissolucao: { title: 'União Estável (Reconhecimento/Dissolução)', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Provas', docs: ['Certidão filhos', 'Contas conjuntas', 'Fotos', 'Testemunhas'] }, { title: 'Bens', docs: ['Documentos dos bens'] }] },
    uniao_estavel_post_mortem: { title: 'União Estável Post Mortem', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Do Falecido', docs: ['Certidão de Óbito', 'Bens deixados'] }, { title: 'Provas da União', docs: ['(Mesmas provas da união estável comum)'] }] },
    conversao_uniao_homoafetiva: { title: 'Conversão União Estável em Casamento', sections: [{ title: 'Documentação (Ambos)', docs: ['RG/CPF', 'Certidões Nascimento', ...INCOME_DOCS_STRUCTURED] }] },
    guarda: { title: 'Ação de Guarda', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Da Criança', docs: ['Certidão Nascimento', 'Matrícula Escolar', 'Cartão Vacina'] }, { title: 'Do Caso', docs: ['Relatório Conselho Tutelar', 'Provas de risco'] }] },
    regulamentacao_convivencia: { title: 'Regulamentação de Visitas', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Da Criança', docs: ['Certidão Nascimento', 'Endereço atual'] }] },
    investigacao_paternidade: { title: 'Investigação de Paternidade', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Da Criança', docs: ['Certidão Nascimento (sem pai)'] }, { title: 'Suposto Pai', docs: ['Nome', 'Endereço', 'Indícios'] }] },
    curatela: { title: 'Curatela (Interdição)', sections: [{ title: 'Documentação Pessoal e Renda (Curador)', docs: COMMON_DOCS_FULL }, { title: 'Do Curatelando', docs: ['RG e CPF', 'Certidão Nascimento/Casamento', 'Renda (INSS)', 'Laudo Médico (CID)'] }] },
    levantamento_curatela: { title: 'Levantamento de Curatela', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Específicos', docs: ['Sentença anterior', 'Laudo médico de capacidade'] }] },
    tutela: { title: 'Tutela (Menor)', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Do Menor', docs: ['Certidão Nascimento', 'Óbito dos pais'] }] },
    adocao: { title: 'Adoção', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Específicos', docs: ['Certidão Casamento/Nasc. adotantes', 'Certidão Criança', 'Sanidade Física/Mental', 'Certidões Negativas'] }] },
    defesa_criminal_custodia: { title: 'Defesa Criminal / Custódia', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Do Caso', docs: ['APF / BO', 'Residência Fixa', 'Carteira de Trabalho', 'Testemunhas'] }] },
    execucao_penal: { title: 'Execução Penal', sections: [{ title: 'Documentação Pessoal e Renda (Familiar)', docs: COMMON_DOCS_FULL }, { title: 'Do Preso', docs: ['Carteira Visitante', 'Carta', 'PEP', 'Certidão Carcerária'] }] },
    fornecimento_medicamentos: { title: 'Medicamentos / Saúde', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Médicos', docs: ['Laudo (CID)', 'Receita', 'Negativa', '3 Orçamentos'] }] },
    indenizacao_poder_publico: { title: 'Indenização contra Estado', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Específicos', docs: ['Provas (BO, Fotos, Laudos)', 'Comprovantes de gastos'] }] },
    previdencia_estadual_municipal: { title: 'Previdência (RPPS)', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Específicos', docs: ['Processo administrativo', 'Portaria'] }] },
    questionamento_impostos_taxas: { title: 'Contestação Impostos/Taxas', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Específicos', docs: ['Carnê/Notificação', 'Comprovantes'] }] },
    vaga_escola_creche: { title: 'Vaga em Creche/Escola', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Da Criança', docs: ['Certidão Nascimento', 'Vacina', 'Protocolo Inscrição/Negativa'] }] },
    apoio_escolar: { title: 'Apoio Escolar (Mediador)', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Da Criança', docs: ['Certidão Nascimento', 'Laudo (CID)', 'Matrícula'] }] },
    transporte_gratuito: { title: 'Transporte Gratuito', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Do Requerente', docs: ['Laudo (CID + Necessidade)', 'Negativa Riocard'] }] },
    retificacao_registro_civil: { title: 'Retificação Registro Civil', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Específicos', docs: ['Certidão a retificar', 'Provas do erro'] }] },
    alvara_levantamento_valores: { title: 'Alvará (Valores)', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Do Falecido', docs: ['Óbito', 'Dependentes INSS', 'Extratos'] }] },
    alvara_viagem_menor: { title: 'Alvará Viagem (Menor)', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Viagem', docs: ['Passagens', 'Destino', 'Acompanhante', 'Endereço genitor ausente'] }] }
};

// --- 2. ESTADO GLOBAL ---

let currentAssistedId = null, currentPautaId = null, db = null, getUpdatePayload = null, showNotification = null, allAssisted = [], currentChecklistAction = null;
const modal = document.getElementById('documents-modal'), assistedNameEl = document.getElementById('documents-assisted-name'), actionSelectionView = document.getElementById('document-action-selection'), checklistView = document.getElementById('document-checklist-view'), checklistContainer = document.getElementById('checklist-container'), checklistTitle = document.getElementById('checklist-title'), backToActionSelectionBtn = document.getElementById('back-to-action-selection-btn'), saveChecklistBtn = document.getElementById('save-checklist-btn'), printChecklistBtn = document.getElementById('print-checklist-btn'), checklistSearch = document.getElementById('checklist-search'), closeBtn = document.getElementById('close-documents-modal-btn'), cancelBtn = document.getElementById('cancel-checklist-btn');

// --- 3. UTILITÁRIOS ---

const normalizeTextLocal = (str) => str ? str.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : '';
const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const parseCurrency = (str) => !str ? 0 : parseFloat(str.replace(/[^\d,]/g, '').replace(',', '.')) || 0;

async function getAddressByCep(cep) {
    const cleanCep = cep.replace(/\D/g, ''); if (cleanCep.length !== 8) return null;
    try { const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`); const data = await response.json(); return data.erro ? null : data; } catch { return null; }
}

function setupCepListener(cepInputId, fields) {
    const cepInput = document.getElementById(cepInputId); if (!cepInput) return;
    cepInput.addEventListener('blur', async (e) => {
        const data = await getAddressByCep(e.target.value);
        if (data) {
            if (fields.rua) document.getElementById(fields.rua).value = data.logradouro;
            if (fields.bairro) document.getElementById(fields.bairro).value = data.bairro;
            if (fields.cidade) document.getElementById(fields.cidade).value = data.localidade;
            if (fields.uf) document.getElementById(fields.uf).value = data.uf;
        }
    });
}

async function updateVisualStatus(state, actionTitle = null) {
    const docRef = doc(db, "pautas", currentPautaId, "attendances", currentAssistedId);
    const data = { documentState: state };
    if (actionTitle) data.selectedAction = actionTitle;
    await updateDoc(docRef, data);
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
    checklistSearch.value = '';

    data.sections.forEach((section, sIdx) => {
        const sectionDiv = document.createElement('div');
        sectionDiv.className = "mb-6";
        sectionDiv.innerHTML = `<h4 class="font-bold text-gray-700 mb-3 border-b-2 border-gray-100 pb-1 uppercase text-xs tracking-wider">${section.title}</h4>`;
        
        const ul = document.createElement('ul'); 
        ul.className = 'space-y-2';

        section.docs.forEach((docItem, dIdx) => {
            const li = document.createElement('li');
            if (typeof docItem === 'object' && docItem.type === 'title') {
                li.innerHTML = `<div class="font-bold text-blue-700 text-[11px] mt-4 mb-2 bg-blue-50 p-2 rounded border-l-4 border-blue-400 uppercase tracking-tighter">${docItem.text}</div>`;
            } else {
                const docText = typeof docItem === 'string' ? docItem : docItem.text;
                const id = `doc-${actionKey}-${sIdx}-${dIdx}`;
                const isChecked = saved?.checkedIds?.includes(id) ? 'checked' : '';
                const savedType = saved?.docTypes ? saved.docTypes[id] : '';

                // ESTRUTURA COM A CLASSE checklist-row PARA FEEDBACK VERDE
                li.innerHTML = `
                    <div class="flex flex-col border-b border-gray-50 pb-2">
                        <label class="checklist-row flex items-center gap-3 w-full cursor-pointer p-2 rounded-lg transition-all hover:bg-gray-50">
                            <input type="checkbox" id="${id}" class="doc-checkbox h-5 w-5 text-green-600 rounded border-gray-300" ${isChecked}>
                            <span class="text-sm text-gray-700 font-medium">${docText}</span>
                        </label>
                        <div id="type-${id}" class="ml-10 mt-1 flex gap-6 ${isChecked ? '' : 'hidden'} animate-fade-in">
                            <label class="flex items-center text-[10px] font-bold text-gray-500 cursor-pointer">
                                <input type="radio" name="type-${id}" value="Físico" class="mr-1" ${savedType === 'Físico' ? 'checked' : ''}> FÍSICO
                            </label>
                            <label class="flex items-center text-[10px] font-bold text-gray-500 cursor-pointer">
                                <input type="radio" name="type-${id}" value="Digital" class="mr-1" ${savedType === 'Digital' ? 'checked' : ''}> DIGITAL
                            </label>
                        </div>
                    </div>`;
            }
            ul.appendChild(li);
        });
        sectionDiv.appendChild(ul); 
        checklistContainer.appendChild(sectionDiv);
    });

    // Eventos de alteração para contador e visual
    checklistContainer.querySelectorAll('.doc-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const typeDiv = document.getElementById(`type-${e.target.id}`);
            if (e.target.checked) {
                typeDiv.classList.remove('hidden');
                if (!typeDiv.querySelector('input:checked')) typeDiv.querySelector('input[value="Físico"]').checked = true;
            } else {
                typeDiv.classList.add('hidden');
            }
            // Dispara o contador do index.html
            checklistContainer.dispatchEvent(new Event('change', { bubbles: true }));
            updateVisualStatus('filling'); 
        });
    });

    // Lógica de Despesas e Outros
    if (ACTIONS_ALWAYS_EXPENSES.includes(actionKey)) {
        checklistContainer.appendChild(renderExpenseTable());
        if (saved?.expenseData) fillExpenseData(saved.expenseData);
    } else if (ACTIONS_CONDITIONAL_EXPENSES.includes(actionKey)) {
        const toggleDiv = document.createElement('div');
        toggleDiv.className = 'mt-6 bg-blue-50 p-4 rounded-xl border-2 border-blue-100 shadow-sm';
        toggleDiv.innerHTML = `<label class="flex items-center cursor-pointer font-black text-blue-800 uppercase text-xs"><input type="checkbox" id="check-has-minors" class="h-5 w-5 text-blue-600 rounded mr-3" ${saved?.hasMinors ? 'checked' : ''}> Há filhos menores / Pedido de Alimentos?</label><div id="conditional-expense-wrapper" class="${saved?.hasMinors ? '' : 'hidden'}"></div>`;
        checklistContainer.appendChild(toggleDiv);
        const wrapper = toggleDiv.querySelector('#conditional-expense-wrapper');
        wrapper.appendChild(renderExpenseTable());
        if (saved?.expenseData) fillExpenseData(saved.expenseData);
        toggleDiv.querySelector('#check-has-minors').addEventListener('change', (e) => { wrapper.classList.toggle('hidden', !e.target.checked); });
    }

    // Seção de Observações
    const obsDiv = document.createElement('div');
    obsDiv.className = 'mt-8 p-4 bg-amber-50 border-2 border-amber-100 rounded-xl';
    obsDiv.innerHTML = `<h4 class="font-black text-amber-800 text-xs uppercase mb-3">Status da Entrega</h4>`;
    const obsOptions = ['Documentação Pendente', 'Documentos Organizados', 'Assistido Ciente'];
    const savedObs = saved?.observations?.selected || [];
    obsOptions.forEach(opt => {
        const checked = savedObs.includes(opt) ? 'checked' : '';
        obsDiv.innerHTML += `<label class="flex items-center cursor-pointer mb-2 text-sm text-amber-900"><input type="checkbox" class="obs-opt h-4 w-4 text-amber-600 mr-3" value="${opt}" ${checked}> ${opt}</label>`;
    });
    obsDiv.innerHTML += `<div class="mt-4"><label class="flex items-center cursor-pointer text-sm font-bold text-amber-900"><input type="checkbox" id="check-other" class="h-4 w-4 text-amber-600 mr-3" ${saved?.observations?.otherText ? 'checked' : ''}> Outras Observações</label><textarea id="text-other" class="w-full mt-2 p-3 border border-amber-200 rounded-lg text-sm bg-white ${saved?.observations?.otherText ? '' : 'hidden'}" rows="3" placeholder="Digite aqui...">${saved?.observations?.otherText || ''}</textarea></div>`;
    obsDiv.querySelector('#check-other').addEventListener('change', (e) => { document.getElementById('text-other').classList.toggle('hidden', !e.target.checked); });
    checklistContainer.appendChild(obsDiv);

    // Formulário do Réu
    const reuForm = renderReuForm(actionKey); 
    checklistContainer.appendChild(reuForm);
    setupCepListener('cep-reu', { rua: 'rua-reu', bairro: 'bairro-reu', cidade: 'cidade-reu', uf: 'estado-reu' });
    if (saved?.reuData) fillReuData(saved.reuData);

    // Força atualização do contador inicial
    checklistContainer.dispatchEvent(new Event('change', { bubbles: true }));
}

function renderReuForm(actionKey) {
    const showWorkInfo = ACTIONS_WITH_WORK_INFO.includes(actionKey);
    const container = document.createElement('div'); 
    container.id = 'dynamic-reu-form'; 
    container.className = 'mt-8 p-5 bg-slate-50 border border-slate-200 rounded-xl shadow-inner';
    container.innerHTML = `
        <h3 class="text-md font-black text-slate-700 mb-4 border-b pb-2 uppercase tracking-tighter">Dados do Réu / Parte Contrária</h3>
        <div class="mb-4"><label class="block text-[10px] font-black text-slate-400 uppercase mb-1">Nome Completo</label><input type="text" id="nome-reu" class="w-full p-2 border rounded-md"></div>
        <div class="grid grid-cols-2 gap-3 mb-4">
            <div><label class="block text-[10px] font-black text-slate-400 uppercase mb-1">CPF</label><input type="text" id="cpf-reu" class="w-full p-2 border rounded-md"></div>
            <div><label class="block text-[10px] font-black text-slate-400 uppercase mb-1">WhatsApp</label><input type="text" id="telefone-reu" class="w-full p-2 border rounded-md"></div>
        </div>
        <div class="grid grid-cols-3 gap-2 mb-4">
            <div><label class="block text-[10px] font-black text-slate-400 uppercase">CEP</label><input type="text" id="cep-reu" class="w-full p-2 border rounded-md"></div>
            <div class="col-span-2"><label class="block text-[10px] font-black text-slate-400 uppercase">Rua</label><input type="text" id="rua-reu" class="w-full p-2 border rounded-md bg-white"></div>
            <div><label class="block text-[10px] font-black text-slate-400 uppercase">Nº</label><input type="text" id="numero-reu" class="w-full p-2 border rounded-md"></div>
            <div class="col-span-2"><label class="block text-[10px] font-black text-slate-400 uppercase">Bairro</label><input type="text" id="bairro-reu" class="w-full p-2 border rounded-md bg-white"></div>
            <div class="col-span-2"><label class="block text-[10px] font-black text-slate-400 uppercase">Cidade</label><input type="text" id="cidade-reu" class="w-full p-2 border rounded-md bg-white"></div>
            <div><label class="block text-[10px] font-black text-slate-400 uppercase">UF</label><input type="text" id="estado-reu" class="w-full p-2 border rounded-md bg-white"></div>
        </div>
        ${showWorkInfo ? `<div class="border-t mt-4 pt-4"><label class="block text-[10px] font-black text-blue-400 uppercase mb-1">Local de Trabalho</label><input type="text" id="empresa-reu" class="w-full p-2 border rounded-md mb-2" placeholder="Nome da empresa"><input type="text" id="endereco-trabalho-reu" class="w-full p-2 border rounded-md" placeholder="Endereço do trabalho"></div>` : ''}`;
    return container;
}

function renderExpenseTable() {
    const container = document.createElement('div'); 
    container.id = 'expense-table-container'; 
    container.className = 'mt-6 p-4 bg-green-50 border-2 border-green-100 rounded-xl shadow-sm';
    let rows = '';
    EXPENSE_CATEGORIES.forEach(c => {
        rows += `<tr class="border-b border-green-100"><td class="py-2 text-xs font-bold text-green-800">${c.label}</td><td><input type="text" id="expense-${c.id}" class="expense-input w-full p-1 bg-white border rounded text-right text-xs" placeholder="R$ 0,00"></td></tr>`;
    });
    container.innerHTML = `<h3 class="text-xs font-black text-green-700 mb-3 uppercase tracking-widest">Planilha Mensal de Gastos</h3><table class="w-full">${rows}</table><div class="mt-3 flex justify-between font-black text-green-900 border-t pt-2"><span>TOTAL:</span><span id="expense-total">R$ 0,00</span></div>`;
    
    // Listener para soma
    container.querySelectorAll('.expense-input').forEach(input => {
        input.addEventListener('input', (e) => {
            let v = e.target.value.replace(/\D/g, '');
            v = (Number(v)/100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            e.target.value = v;
            let total = 0;
            container.querySelectorAll('.expense-input').forEach(i => total += parseCurrency(i.value));
            document.getElementById('expense-total').textContent = formatCurrency(total);
            updateVisualStatus('filling');
        });
    });
    return container;
}

// --- 5. LÓGICA DE SALVAMENTO ---

async function handleSave() {
    if (!currentAssistedId) return;
    const checkedIds = Array.from(checklistContainer.querySelectorAll('.doc-checkbox:checked')).map(cb => cb.id);
    const docTypes = {};
    checkedIds.forEach(id => { docTypes[id] = document.querySelector(`input[name="type-${id}"]:checked`)?.value || 'Físico'; });
    
    const payload = {
        documentChecklist: {
            action: currentChecklistAction,
            checkedIds,
            docTypes,
            hasMinors: document.getElementById('check-has-minors')?.checked || false,
            observations: {
                selected: Array.from(checklistContainer.querySelectorAll('.obs-opt:checked')).map(c => c.value),
                otherText: document.getElementById('check-other')?.checked ? document.getElementById('text-other').value : ''
            },
            reuData: getReuData(),
            expenseData: getExpenseData()
        },
        documentState: 'saved' // STATUS FINAL
    };

    try {
        await updateDoc(doc(db, "pautas", currentPautaId, "attendances", currentAssistedId), payload);
        if (showNotification) showNotification("Progresso salvo com sucesso!");
        modal.classList.add('hidden');
    } catch (e) { console.error(e); }
}

function getReuData() {
    const nome = document.getElementById('nome-reu')?.value;
    if (!nome) return null;
    return {
        nome, cpf: document.getElementById('cpf-reu').value, telefone: document.getElementById('telefone-reu').value,
        cep: document.getElementById('cep-reu').value, rua: document.getElementById('rua-reu').value,
        numero: document.getElementById('numero-reu').value, bairro: document.getElementById('bairro-reu').value,
        cidade: document.getElementById('cidade-reu').value, uf: document.getElementById('estado-reu').value,
        empresa: document.getElementById('empresa-reu')?.value || '',
        enderecoTrabalho: document.getElementById('endereco-trabalho-reu')?.value || ''
    };
}

function getExpenseData() {
    const data = {};
    EXPENSE_CATEGORIES.forEach(c => { data[c.id] = document.getElementById(`expense-${c.id}`)?.value || ''; });
    return data;
}

function fillReuData(d) {
    const s = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    s('nome-reu', d.nome); s('cpf-reu', d.cpf); s('telefone-reu', d.telefone); s('cep-reu', d.cep); s('rua-reu', d.rua);
    s('numero-reu', d.numero); s('bairro-reu', d.bairro); s('cidade-reu', d.cidade); s('estado-reu', d.uf);
    s('empresa-reu', d.empresa); s('endereco-trabalho-reu', d.enderecoTrabalho);
}

function fillExpenseData(d) {
    EXPENSE_CATEGORIES.forEach(c => { const el = document.getElementById(`expense-${c.id}`); if (el) el.value = d[c.id] || ''; });
    let total = 0;
    document.querySelectorAll('.expense-input').forEach(i => total += parseCurrency(i.value));
    document.getElementById('expense-total').textContent = formatCurrency(total);
}

// --- 6. EXPORTS ---

export function setupDetailsModal(config) {
    db = config.db; getUpdatePayload = config.getUpdatePayload; showNotification = config.showNotification;
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
    backToActionSelectionBtn.addEventListener('click', () => {
        checklistView.classList.add('hidden');
        actionSelectionView.classList.remove('hidden');
    });
    saveChecklistBtn.addEventListener('click', handleSave);
    checklistSearch.addEventListener('input', (e) => {
        const term = normalizeTextLocal(e.target.value);
        checklistContainer.querySelectorAll('ul li').forEach(li => {
            li.style.display = normalizeTextLocal(li.textContent).includes(term) ? 'block' : 'none';
        });
    });
    closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
    cancelBtn.addEventListener('click', () => modal.classList.add('hidden'));
}

export function openDetailsModal(config) {
    currentAssistedId = config.assistedId; 
    currentPautaId = config.pautaId; 
    allAssisted = config.allAssisted;
    
    const assisted = allAssisted.find(a => a.id === currentAssistedId); 
    if (!assisted) return;

    assistedNameEl.textContent = assisted.name;
    
    // Limpa a grid de seleção
    actionSelectionView.innerHTML = '';
    const search = document.createElement('input');
    search.placeholder = "Pesquisar assunto...";
    search.className = "w-full p-3 border rounded-xl mb-6 shadow-sm focus:ring-2 focus:ring-green-500 outline-none transition-all";
    search.addEventListener('input', (e) => {
        const term = normalizeTextLocal(e.target.value);
        document.querySelectorAll('.action-grid button').forEach(b => {
            b.style.display = normalizeTextLocal(b.textContent).includes(term) ? 'block' : 'none';
        });
    });
    actionSelectionView.appendChild(search);
    
    const grid = document.createElement('div');
    grid.className = "grid grid-cols-1 md:grid-cols-2 gap-4 action-grid";
    Object.keys(documentsData).forEach(k => {
        const btn = document.createElement('button');
        btn.dataset.action = k;
        btn.className = "text-left p-4 bg-white border-2 border-gray-100 hover:border-green-500 hover:bg-green-50 rounded-xl transition-all shadow-sm group";
        btn.innerHTML = `<div class="flex justify-between items-center"><span class="font-bold text-gray-700 group-hover:text-green-700">${documentsData[k].title}</span><svg class="w-5 h-5 text-gray-300 group-hover:text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" stroke-width="3"></path></svg></div>`;
        grid.appendChild(btn);
    });
    actionSelectionView.appendChild(grid);

    if (assisted.documentChecklist?.action) {
        renderChecklist(assisted.documentChecklist.action);
        actionSelectionView.classList.add('hidden');
        checklistView.classList.remove('hidden');
        checklistView.classList.add('flex');
    } else {
        checklistView.classList.add('hidden');
        actionSelectionView.classList.remove('hidden');
    }
    modal.classList.remove('hidden');
}
