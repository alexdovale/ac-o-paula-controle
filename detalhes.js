/**
 * detalhes.js
 * Gerencia o modal de detalhes, checklist, dados do Réu e Planilha de Despesas.
 * Versão: Comprovação de Renda + Planilha de Gastos Automática + PDF Completo
 */

// --- 1. CONSTANTES DE DOCUMENTAÇÃO ---

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
    'Consulta de Restituição IRPF (Prova de Isenção)',

    { type: 'title', text: '4. DESEMPREGADO' },
    'Carteira de Trabalho (Página da baixa do último emprego)',
    'Comprovante de Seguro-Desemprego (se estiver recebendo)',
    'Declaração de Hipossuficiência (Informando ausência de renda)',
    'Extrato do CNIS (Meu INSS - prova ausência de vínculo ativo)',

    { type: 'title', text: '5. PROVAS GERAIS (HIPOSSUFICIÊNCIA)' },
    'Extrato do Bolsa Família',
    'Folha Resumo do CadÚnico',
    'Declaração de IRPF Completa + Recibo (se declarar)'
];

const COMMON_DOCS_FULL = [...BASE_DOCS, ...INCOME_DOCS_STRUCTURED];

// --- CONSTANTES DA PLANILHA DE DESPESAS ---
const EXPENSE_CATEGORIES = [
    { id: 'moradia', label: '1. MORADIA (Habitação)', desc: 'Aluguel, luz, água, gás (divida pelo nº de moradores).' },
    { id: 'alimentacao', label: '2. ALIMENTAÇÃO', desc: 'Mercado, feira, açougue, lanches, leites especiais.' },
    { id: 'educacao', label: '3. EDUCAÇÃO', desc: 'Mensalidade, transporte escolar, material, uniforme, cursos.' },
    { id: 'saude', label: '4. SAÚDE', desc: 'Plano de saúde, farmácia, tratamentos (dentista, psicólogo).' },
    { id: 'vestuario', label: '5. VESTUÁRIO E HIGIENE', desc: 'Roupas, calçados, fraldas, itens de higiene.' },
    { id: 'lazer', label: '6. LAZER E TRANSPORTE', desc: 'Passeios, festas, transporte para atividades.' },
    { id: 'outras', label: '7. OUTRAS DESPESAS', desc: 'Babá, pet, cursos livres, etc.' }
];

// Ações que ativam a planilha de despesas
const ACTIONS_WITH_EXPENSES = [
    'alimentos_fixacao_majoracao_oferta',
    'alimentos_gravidicos',
    'alimentos_avoengos',
    'divorcio_litigioso',
    'divorcio_consensual',
    'investigacao_paternidade',
    'guarda'
];

// Ações que ativam dados profissionais do Réu
const ACTIONS_WITH_WORK_INFO = [
    'alimentos_fixacao_majoracao_oferta',
    'alimentos_gravidicos',
    'alimentos_avoengos',
    'divorcio_litigioso',
    'uniao_estavel_reconhecimento_dissolucao',
    'investigacao_paternidade'
];

// --- 2. DADOS DOS TIPOS DE AÇÃO (Estrutura) ---

const documentsData = {
    // CÍVEL
    obrigacao_fazer: { title: 'Ação de Obrigação de Fazer', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Específicos', docs: ['Contrato/Acordo', 'Provas do descumprimento'] }] },
    declaratoria_nulidade: { title: 'Ação Declaratória de Nulidade', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Específicos', docs: ['Documento a anular', 'Provas da ilegalidade'] }] },
    indenizacao_danos: { title: 'Ação de Indenização', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Específicos', docs: ['BO', 'Fotos/Vídeos', 'Orçamentos', 'Notas Fiscais', 'Testemunhas'] }] },
    revisional_debito: { title: 'Ação Revisional de Débito', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Específicos', docs: ['Contrato', 'Planilha da dívida', 'Extratos'] }] },
    exigir_contas: { title: 'Ação de Exigir Contas', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Específicos', docs: ['Prova da gestão de bens', 'Recusa em prestar contas'] }] },

    // FAMÍLIA
    alimentos_fixacao_majoracao_oferta: { title: 'Alimentos (Fixação / Majoração / Oferta)', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Do Alimentando', docs: ['Certidão de Nascimento', 'Comprovantes de despesas (Planilha abaixo)'] }, { title: 'Sobre o Réu', docs: ['Endereço completo', 'Dados de trabalho'] }] },
    alimentos_gravidicos: { title: 'Ação de Alimentos Gravídicos', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Da Gestação', docs: ['Exame Beta HCG / Ultrassom', 'Pré-Natal', 'Gastos (Planilha abaixo)'] }, { title: 'Do Suposto Pai', docs: ['Indícios de paternidade', 'Endereço/Trabalho'] }] },
    alimentos_avoengos: { title: 'Alimentos Avoengos', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Específicos', docs: ['Certidão de Nascimento', 'Prova da impossibilidade dos pais', 'Planilha de Gastos'] }] },
    divorcio_consensual: { title: 'Divórcio Consensual', sections: [{ title: 'Documentação (Ambos)', docs: ['RG/CPF ambos', 'Comp. Residência ambos', 'Certidão Casamento', ...INCOME_DOCS_STRUCTURED] }, { title: 'Filhos/Bens', docs: ['Certidão Nascimento Filhos', 'Documentos Bens'] }] },
    divorcio_litigioso: { title: 'Divórcio Litigioso', sections: [{ title: 'Documentação Pessoal e Renda', docs: [...COMMON_DOCS_FULL, 'Certidão de Casamento'] }, { title: 'Filhos/Bens', docs: ['Certidão Nascimento Filhos', 'Documentos Bens', 'Planilha de Gastos (se houver alimentos)'] }, { title: 'Sobre o Cônjuge', docs: ['Endereço', 'Trabalho'] }] },
    uniao_estavel_reconhecimento_dissolucao: { title: 'União Estável (Reconhecimento/Dissolução)', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Provas', docs: ['Certidão filhos', 'Contas conjuntas', 'Fotos', 'Testemunhas'] }] },
    uniao_estavel_post_mortem: { title: 'União Estável Post Mortem', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Do Falecido', docs: ['Certidão de Óbito', 'Bens deixados'] }] },
    conversao_uniao_homoafetiva: { title: 'Conversão União Estável em Casamento', sections: [{ title: 'Documentação (Ambos)', docs: ['RG/CPF', 'Certidões Nascimento', ...INCOME_DOCS_STRUCTURED] }] },
    guarda: { title: 'Ação de Guarda', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Da Criança', docs: ['Certidão Nascimento', 'Matrícula Escolar', 'Cartão Vacina'] }] },
    regulamentacao_convivencia: { title: 'Regulamentação de Visitas', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Da Criança', docs: ['Certidão Nascimento', 'Endereço atual'] }] },
    investigacao_paternidade: { title: 'Investigação de Paternidade', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Da Criança', docs: ['Certidão Nascimento (sem pai)'] }, { title: 'Suposto Pai', docs: ['Nome', 'Endereço', 'Indícios'] }] },
    curatela: { title: 'Curatela (Interdição)', sections: [{ title: 'Documentação Pessoal e Renda (Curador)', docs: COMMON_DOCS_FULL }, { title: 'Do Curatelando', docs: ['RG/CPF', 'Certidão Nascimento/Casamento', 'Renda (INSS)', 'Laudo Médico (CID)'] }] },
    levantamento_curatela: { title: 'Levantamento de Curatela', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Específicos', docs: ['Sentença anterior', 'Laudo médico de capacidade'] }] },
    tutela: { title: 'Tutela (Menor)', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Do Menor', docs: ['Certidão Nascimento', 'Óbito dos pais'] }] },
    adocao: { title: 'Adoção', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Específicos', docs: ['Certidão Casamento/Nasc. adotantes', 'Certidão Criança', 'Sanidade Física/Mental', 'Certidões Negativas'] }] },

    // CRIMINAL
    defesa_criminal_custodia: { title: 'Defesa Criminal / Custódia', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Do Caso', docs: ['APF / BO', 'Residência Fixa', 'Carteira de Trabalho', 'Testemunhas'] }] },
    execucao_penal: { title: 'Execução Penal', sections: [{ title: 'Documentação Pessoal e Renda (Familiar)', docs: COMMON_DOCS_FULL }, { title: 'Do Preso', docs: ['Carteira Visitante', 'Carta', 'PEP', 'Certidão Carcerária'] }] },

    // FAZENDA
    fornecimento_medicamentos: { title: 'Medicamentos / Saúde', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Médicos', docs: ['Laudo (CID)', 'Receita', 'Negativa', '3 Orçamentos'] }] },
    indenizacao_poder_publico: { title: 'Indenização contra Estado', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Específicos', docs: ['Provas (BO, Fotos, Laudos)', 'Comprovantes de gastos'] }] },
    previdencia_estadual_municipal: { title: 'Previdência (RPPS)', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Específicos', docs: ['Processo administrativo', 'Portaria'] }] },
    questionamento_impostos_taxas: { title: 'Contestação Impostos/Taxas', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Específicos', docs: ['Carnê/Notificação', 'Comprovantes'] }] },

    // INFÂNCIA
    vaga_escola_creche: { title: 'Vaga em Creche/Escola', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Da Criança', docs: ['Certidão Nascimento', 'Vacina', 'Protocolo Inscrição/Negativa'] }] },
    apoio_escolar: { title: 'Apoio Escolar (Mediador)', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Da Criança', docs: ['Certidão Nascimento', 'Laudo (CID)', 'Matrícula'] }] },
    transporte_gratuito: { title: 'Transporte Gratuito', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Do Requerente', docs: ['Laudo (CID + Necessidade)', 'Negativa Riocard'] }] },

    // OUTROS
    retificacao_registro_civil: { title: 'Retificação Registro Civil', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Específicos', docs: ['Certidão a retificar', 'Provas do erro'] }] },
    alvara_levantamento_valores: { title: 'Alvará (Valores)', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Do Falecido', docs: ['Óbito', 'Dependentes INSS', 'Extratos'] }] },
    alvara_viagem_menor: { title: 'Alvará Viagem (Menor)', sections: [{ title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, { title: 'Viagem', docs: ['Passagens', 'Destino', 'Acompanhante', 'Endereço genitor ausente'] }] }
};

// --- 3. ESTADO GLOBAL ---

let currentAssistedId = null;
let currentPautaId = null;
let db = null;
let getUpdatePayload = null;
let showNotification = null;
let allAssisted = [];
let currentChecklistAction = null;

// Seletores
const modal = document.getElementById('documents-modal');
const assistedNameEl = document.getElementById('documents-assisted-name');
const actionSelectionView = document.getElementById('document-action-selection');
const checklistView = document.getElementById('document-checklist-view');
const checklistContainer = document.getElementById('checklist-container');
const checklistTitle = document.getElementById('checklist-title');
const backToActionSelectionBtn = document.getElementById('back-to-action-selection-btn');
const saveChecklistBtn = document.getElementById('save-checklist-btn');
const printChecklistBtn = document.getElementById('print-checklist-btn');
const checklistSearch = document.getElementById('checklist-search');
const closeBtn = document.getElementById('close-documents-modal-btn');
const cancelBtn = document.getElementById('cancel-checklist-btn');

// --- 4. UTILITÁRIOS E VIACEP ---

const normalizeText = (str) => str ? str.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : '';

// Formata moeda (BRL)
const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

// Converte string "R$ 1.000,00" para float
const parseCurrency = (str) => {
    if (!str) return 0;
    return parseFloat(str.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
};

async function getAddressByCep(cep) {
    const cleanCep = cep.replace(/\D/g, ''); 
    if (cleanCep.length !== 8) return null;
    try {
        const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
        const data = await response.json();
        return data.erro ? null : data;
    } catch { return null; }
}

function setupCepListener(cepInputId, fields) {
    const cepInput = document.getElementById(cepInputId);
    if (!cepInput) return;

    cepInput.addEventListener('input', (e) => {
        let v = e.target.value.replace(/\D/g, '');
        if (v.length > 5) v = v.substring(0, 5) + '-' + v.substring(5, 8);
        e.target.value = v;
    });

    cepInput.addEventListener('blur', async (e) => {
        const data = await getAddressByCep(e.target.value);
        if (data) {
            if (fields.rua) document.getElementById(fields.rua).value = data.logradouro;
            if (fields.bairro) document.getElementById(fields.bairro).value = data.bairro;
            if (fields.cidade) document.getElementById(fields.cidade).value = data.localidade;
            if (fields.uf) document.getElementById(fields.uf).value = data.uf;
            if (showNotification) showNotification("Endereço encontrado!", "success");
        } else if (showNotification) {
            showNotification("CEP não encontrado.", "warning");
        }
    });
}

// --- 5. COMPONENTES DE UI ---

// Geração do Formulário do Réu
function renderReuForm(actionKey) {
    const showWorkInfo = ACTIONS_WITH_WORK_INFO.includes(actionKey);

    const container = document.createElement('div');
    container.id = 'dynamic-reu-form';
    container.className = 'mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg';

    container.innerHTML = `
        <h3 class="text-lg font-bold text-gray-800 mb-4 border-b pb-2">Dados da Parte Contrária (Réu)</h3>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div><label class="block text-sm text-gray-700">CPF</label><input type="text" id="cpf-reu" class="mt-1 block w-full p-2 border rounded-md"></div>
            <div><label class="block text-sm text-gray-700">Telefone/Zap</label><input type="text" id="telefone-reu" class="mt-1 block w-full p-2 border rounded-md"></div>
            <div><label class="block text-sm text-gray-700">E-mail</label><input type="email" id="email-reu" class="mt-1 block w-full p-2 border rounded-md"></div>
        </div>
        <h4 class="text-sm font-semibold text-gray-600 mb-2">Endereço</h4>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div><label class="block text-xs text-gray-500">CEP</label><input type="text" id="cep-reu" maxlength="9" class="w-full p-2 border rounded-md"></div>
            <div class="md:col-span-2"><label class="block text-xs text-gray-500">Rua</label><input type="text" id="rua-reu" class="w-full p-2 border rounded-md bg-gray-100"></div>
            <div><label class="block text-xs text-gray-500">Número</label><input type="text" id="numero-reu" class="w-full p-2 border rounded-md"></div>
            <div><label class="block text-xs text-gray-500">Bairro</label><input type="text" id="bairro-reu" class="w-full p-2 border rounded-md bg-gray-100"></div>
            <div><label class="block text-xs text-gray-500">Cidade/UF</label><div class="flex gap-2"><input type="text" id="cidade-reu" class="w-full p-2 border rounded-md bg-gray-100"><input type="text" id="estado-reu" class="w-16 p-2 border rounded-md bg-gray-100"></div></div>
        </div>
        ${showWorkInfo ? `
        <div class="border-t pt-4 mt-4">
            <h4 class="text-sm font-semibold text-blue-700 mb-2">Dados Profissionais</h4>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label class="block text-sm text-gray-700">Empresa/Empregador</label><input type="text" id="empresa-reu" class="mt-1 w-full p-2 border rounded-md"></div>
                <div><label class="block text-sm text-gray-700">Endereço Trabalho</label><input type="text" id="endereco-trabalho-reu" class="mt-1 w-full p-2 border rounded-md"></div>
            </div>
        </div>` : ''}
    `;
    return container;
}

// Geração da Planilha de Despesas (NOVA)
function renderExpenseTable() {
    const container = document.createElement('div');
    container.id = 'expense-table-container';
    container.className = 'mt-6 p-4 bg-green-50 border border-green-200 rounded-lg';

    let rowsHtml = '';
    EXPENSE_CATEGORIES.forEach(cat => {
        rowsHtml += `
            <tr class="bg-white border-b hover:bg-gray-50">
                <td class="p-3 text-sm font-semibold text-gray-700">${cat.label}</td>
                <td class="p-3 text-xs text-gray-500">${cat.desc}</td>
                <td class="p-3">
                    <input type="text" id="expense-${cat.id}" class="expense-input w-full p-2 border rounded text-right" placeholder="R$ 0,00" oninput="formatExpenseInput(this)">
                </td>
            </tr>
        `;
    });

    container.innerHTML = `
        <h3 class="text-lg font-bold text-green-800 mb-2">Planilha de Despesas da Criança</h3>
        <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
                <thead>
                    <tr class="bg-green-100 text-green-800 text-xs uppercase">
                        <th class="p-3 w-1/4">Categoria</th>
                        <th class="p-3 w-1/2">Orientação</th>
                        <th class="p-3 w-1/4 text-right">Valor Mensal</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
                <tfoot>
                    <tr class="bg-green-200 font-bold text-green-900">
                        <td colspan="2" class="p-3 text-right">TOTAL GERAL:</td>
                        <td class="p-3 text-right" id="expense-total">R$ 0,00</td>
                    </tr>
                </tfoot>
            </table>
        </div>
    `;
    return container;
}

// Lógica de cálculo e formatação da tabela de despesas
window.formatExpenseInput = function(input) {
    let value = input.value.replace(/\D/g, '');
    value = (Number(value) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    input.value = value;
    calculateExpenseTotal();
}

function calculateExpenseTotal() {
    let total = 0;
    const inputs = document.querySelectorAll('.expense-input');
    inputs.forEach(input => {
        total += parseCurrency(input.value);
    });
    document.getElementById('expense-total').textContent = formatCurrency(total);
}

// --- 6. RENDERIZAÇÃO GERAL ---

function populateActionSelection() {
    const container = document.getElementById('document-action-selection');
    if (!container) return;

    let searchInput = document.getElementById('action-search-input');
    if (!searchInput) {
        searchInput = document.createElement('input');
        searchInput.id = 'action-search-input';
        searchInput.type = 'text';
        searchInput.placeholder = 'Pesquisar assunto...';
        searchInput.className = 'w-full p-2 border border-gray-300 rounded-md mb-4 focus:ring-green-500';
        searchInput.addEventListener('input', handleActionSearch);
        container.prepend(searchInput);
    }

    let grid = container.querySelector('.action-grid');
    if (grid) return;

    grid = document.createElement('div');
    grid.className = 'grid grid-cols-1 md:grid-cols-2 gap-3 action-grid';

    Object.keys(documentsData).forEach((key) => {
        const btn = document.createElement('button');
        btn.dataset.action = key;
        btn.className = 'text-left p-3 bg-white border hover:bg-green-50 hover:border-green-300 rounded-lg transition shadow-sm';
        btn.innerHTML = `<span class="font-semibold text-gray-700">${documentsData[key].title}</span>`;
        grid.appendChild(btn);
    });
    container.appendChild(grid);
}

function renderChecklist(actionKey) {
    currentChecklistAction = actionKey;
    const data = documentsData[actionKey];
    if (!data) return;

    const assisted = allAssisted.find(a => a.id === currentAssistedId);
    const saved = assisted?.documentChecklist;

    checklistTitle.textContent = data.title;
    checklistContainer.innerHTML = '';
    checklistSearch.value = '';

    // 1. Docs
    data.sections.forEach((section, sIdx) => {
        const div = document.createElement('div');
        div.innerHTML = `<h4 class="font-bold text-gray-700 mt-4 mb-2 border-b">${section.title}</h4>`;
        const ul = document.createElement('ul');
        ul.className = 'space-y-2';
        
        section.docs.forEach((docItem, dIdx) => {
            const li = document.createElement('li');
            if (typeof docItem === 'object' && docItem.type === 'title') {
                li.innerHTML = `<div class="font-bold text-blue-700 text-sm mt-3 mb-1 bg-blue-50 p-1 rounded">${docItem.text}</div>`;
            } else {
                const docText = typeof docItem === 'string' ? docItem : docItem.text;
                const id = `doc-${actionKey}-${sIdx}-${dIdx}`;
                const isChecked = saved?.checkedIds?.includes(id) ? 'checked' : '';
                li.innerHTML = `<label class="flex items-center cursor-pointer hover:bg-gray-50 p-1 rounded"><input type="checkbox" id="${id}" class="h-5 w-5 text-green-600 rounded border-gray-300 mr-2" ${isChecked}><span class="text-sm text-gray-700">${docText}</span></label>`;
            }
            ul.appendChild(li);
        });
        div.appendChild(ul);
        checklistContainer.appendChild(div);
    });

    // 2. Tabela de Despesas (Condicional)
    if (ACTIONS_WITH_EXPENSES.includes(actionKey)) {
        const table = renderExpenseTable();
        checklistContainer.appendChild(table);
        // Preencher dados salvos da tabela
        if (saved?.expenseData) {
            fillExpenseData(saved.expenseData);
        }
    }

    // 3. Observações
    const obsDiv = document.createElement('div');
    obsDiv.className = 'mt-6 bg-yellow-50 p-4 rounded-lg border border-yellow-100';
    obsDiv.innerHTML = `<h4 class="font-bold text-gray-800 mb-2">Status da Documentação</h4>`;
    const obsOptions = ['Documentação Pendente', 'Documentos Organizados', 'Assistido Ciente'];
    const savedObs = saved?.observations?.selected || [];

    obsOptions.forEach(opt => {
        const checked = savedObs.includes(opt) ? 'checked' : '';
        const label = document.createElement('label');
        label.className = 'flex items-center cursor-pointer mb-1';
        label.innerHTML = `<input type="checkbox" class="obs-opt h-4 w-4 text-yellow-600 mr-2" value="${opt}" ${checked}> ${opt}`;
        obsDiv.appendChild(label);
    });

    const otherText = saved?.observations?.otherText || '';
    const showOther = !!otherText;
    const otherDiv = document.createElement('div');
    otherDiv.className = 'mt-2';
    otherDiv.innerHTML = `<label class="flex items-center cursor-pointer"><input type="checkbox" id="check-other" class="h-4 w-4 text-yellow-600 mr-2" ${showOther ? 'checked' : ''}> Outras Observações</label><textarea id="text-other" class="w-full mt-2 p-2 border rounded text-sm ${showOther ? '' : 'hidden'}" rows="2" placeholder="Descreva...">${otherText}</textarea>`;
    otherDiv.querySelector('#check-other').addEventListener('change', (e) => {
        document.getElementById('text-other').classList.toggle('hidden', !e.target.checked);
    });
    obsDiv.appendChild(otherDiv);
    checklistContainer.appendChild(obsDiv);

    // 4. Formulário Réu
    const reuForm = renderReuForm(actionKey);
    checklistContainer.appendChild(reuForm);
    setupCepListener('cep-reu', { rua: 'rua-reu', bairro: 'bairro-reu', cidade: 'cidade-reu', uf: 'estado-reu' });
    if (saved?.reuData) fillReuData(saved.reuData);
}

// --- 7. MANIPULAÇÃO DE DADOS (GET/SET) ---

function fillReuData(data) {
    const setVal = (id, val) => { const el = document.getElementById(id); if(el) el.value = val || ''; };
    setVal('cpf-reu', data.cpf); setVal('telefone-reu', data.telefone); setVal('email-reu', data.email);
    setVal('cep-reu', data.cep); setVal('rua-reu', data.rua); setVal('numero-reu', data.numero);
    setVal('bairro-reu', data.bairro); setVal('cidade-reu', data.cidade); setVal('estado-reu', data.uf);
    setVal('empresa-reu', data.empresa); setVal('endereco-trabalho-reu', data.enderecoTrabalho);
}

function getReuData() {
    const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
    const ids = ['cpf-reu', 'telefone-reu', 'email-reu', 'cep-reu', 'rua-reu', 'empresa-reu'];
    if (!ids.some(id => getVal(id) !== '')) return null;
    return {
        cpf: getVal('cpf-reu'), telefone: getVal('telefone-reu'), email: getVal('email-reu'),
        cep: getVal('cep-reu'), rua: getVal('rua-reu'), numero: getVal('numero-reu'),
        bairro: getVal('bairro-reu'), cidade: getVal('cidade-reu'), uf: getVal('estado-reu'),
        empresa: getVal('empresa-reu'), enderecoTrabalho: getVal('endereco-trabalho-reu')
    };
}

function fillExpenseData(data) {
    EXPENSE_CATEGORIES.forEach(cat => {
        const input = document.getElementById(`expense-${cat.id}`);
        if(input) input.value = data[cat.id] || '';
    });
    calculateExpenseTotal();
}

function getExpenseData() {
    if (!document.getElementById('expense-table-container')) return null;
    const data = {};
    EXPENSE_CATEGORIES.forEach(cat => {
        const input = document.getElementById(`expense-${cat.id}`);
        if(input) data[cat.id] = input.value;
    });
    return data;
}

async function handleSave() {
    if (!currentAssistedId || !currentPautaId) return;

    const checkedIds = Array.from(checklistContainer.querySelectorAll('input[type="checkbox"][id^="doc-"]:checked')).map(cb => cb.id);
    const obsSelected = Array.from(checklistContainer.querySelectorAll('.obs-opt:checked')).map(cb => cb.value);
    const otherText = document.getElementById('check-other')?.checked ? document.getElementById('text-other').value : '';
    
    const payload = {
        documentChecklist: {
            action: currentChecklistAction,
            checkedIds: checkedIds,
            observations: { selected: obsSelected, otherText: otherText },
            reuData: getReuData(),
            expenseData: getExpenseData() // Salva a planilha
        }
    };

    try {
        const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
        await updateDoc(doc(db, "pautas", currentPautaId, "attendances", currentAssistedId), getUpdatePayload(payload));
        if (showNotification) showNotification("Dados salvos!", "success");
        closeModal();
    } catch (e) {
        console.error(e);
        if (showNotification) showNotification("Erro ao salvar.", "error");
    }
}

// --- 8. EVENTOS DE UI ---

function handleActionSelect(e) {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    renderChecklist(btn.dataset.action);
    actionSelectionView.classList.add('hidden');
    checklistView.classList.remove('hidden');
    checklistView.classList.add('flex');
}

function handleBack() {
    checklistView.classList.add('hidden');
    checklistView.classList.remove('flex');
    actionSelectionView.classList.remove('hidden');
}

function handleActionSearch(e) {
    const term = normalizeText(e.target.value);
    actionSelectionView.querySelectorAll('.action-grid button').forEach(btn => {
        btn.style.display = normalizeText(btn.textContent).includes(term) ? 'block' : 'none';
    });
}

function handleSearch(e) {
    const term = normalizeText(e.target.value);
    checklistContainer.querySelectorAll('ul li').forEach(li => {
        li.style.display = normalizeText(li.textContent).includes(term) ? 'block' : 'none';
    });
}

function closeModal() { modal.classList.add('hidden'); }

// --- 9. GERAÇÃO DE PDF (COMPLETA) ---

async function handleGeneratePdf() {
    if (printChecklistBtn) printChecklistBtn.textContent = "Gerando...";
    const { jsPDF } = window.jspdf || await import('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let y = 20;

    // Cabeçalho
    doc.setFontSize(16); doc.setFont("helvetica", "bold");
    doc.text("Checklist de Atendimento", pageWidth / 2, y, { align: "center" });
    y += 15;
    doc.setFontSize(12); doc.setFont("helvetica", "normal");
    doc.text(`Assistido(a): ${assistedNameEl.textContent}`, 15, y);
    y += 7;
    doc.text(`Ação: ${checklistTitle.textContent}`, 15, y);
    y += 15;
    
    // 1. Itens da Checklist
    doc.setFont("helvetica", "bold"); doc.text("Documentos Entregues:", 15, y); y += 8;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    const checked = checklistContainer.querySelectorAll('input[type="checkbox"][id^="doc-"]:checked');
    if (checked.length > 0) {
        checked.forEach(cb => {
            const text = cb.nextElementSibling.textContent.trim();
            const lines = doc.splitTextToSize(`- ${text}`, pageWidth - 30);
            if (y + (lines.length * 5) > pageHeight - 20) { doc.addPage(); y = 20; }
            doc.text(lines, 20, y);
            y += lines.length * 5;
        });
    } else {
        doc.text("- Nenhum documento marcado.", 20, y); y += 7;
    }

    // 2. Planilha de Despesas (Se houver)
    const expenses = getExpenseData();
    if (expenses && Object.values(expenses).some(v => v)) {
        y += 10;
        if (y > pageHeight - 150) { doc.addPage(); y = 20; }
        doc.line(15, y, pageWidth - 15, y); y += 10;
        
        doc.setFont("helvetica", "bold"); doc.setFontSize(12);
        doc.text("Planilha de Despesas (Criança)", 15, y); y += 8;
        doc.setFont("helvetica", "normal"); doc.setFontSize(10);

        let total = 0;
        EXPENSE_CATEGORIES.forEach(cat => {
            const valStr = expenses[cat.id];
            if (valStr) {
                doc.text(`${cat.label}:`, 20, y);
                doc.text(`${valStr}`, pageWidth - 30, y, { align: 'right' });
                total += parseCurrency(valStr);
                y += 6;
            }
        });
        y += 2;
        doc.setFont("helvetica", "bold");
        doc.text("TOTAL MENSAL:", 20, y);
        doc.text(formatCurrency(total), pageWidth - 30, y, { align: 'right' });
        y += 8;
    }

    // 3. Observações
    y += 10;
    if (y > pageHeight - 40) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.text("Status / Observações:", 15, y); y += 8;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    
    checklistContainer.querySelectorAll('.obs-opt:checked').forEach(cb => {
        doc.text(`[X] ${cb.value}`, 20, y); y += 6;
    });
    const other = document.getElementById('text-other');
    if (other && !other.classList.contains('hidden') && other.value) {
        const lines = doc.splitTextToSize(`Obs: ${other.value}`, pageWidth - 30);
        doc.text(lines, 20, y); y += lines.length * 5;
    }

    // 4. Dados do Réu
    const reuData = getReuData(); 
    if (reuData) {
        y += 10;
        if (y > pageHeight - 100) { doc.addPage(); y = 20; }
        doc.line(15, y, pageWidth - 15, y); y += 10;
        doc.setFont("helvetica", "bold"); doc.setFontSize(13);
        doc.text("Dados da Parte Contrária (Réu)", 15, y); y += 10;
        doc.setFontSize(11); doc.setFont("helvetica", "normal");

        const printField = (l, v) => { if (v && v.trim()) { doc.text(`${l}: ${v}`, 20, y); y += 6; } };
        printField("CPF", reuData.cpf);
        printField("Telefone", reuData.telefone);
        printField("E-mail", reuData.email);
        
        let end = [reuData.rua, reuData.numero, reuData.bairro, reuData.cidade, reuData.uf].filter(Boolean).join(', ');
        if (reuData.cep) end += ` (CEP: ${reuData.cep})`;
        if (end.length > 5) {
            const lines = doc.splitTextToSize(`Endereço: ${end}`, pageWidth - 40);
            doc.text(lines, 20, y); y += lines.length * 6;
        }

        if (reuData.empresa || reuData.enderecoTrabalho) {
            y += 4;
            doc.setFont("helvetica", "bold"); doc.text("Dados Profissionais:", 20, y); y += 6;
            doc.setFont("helvetica", "normal");
            printField("Empresa", reuData.empresa);
            printField("End. Trabalho", reuData.enderecoTrabalho);
        }
    }
    
    doc.save(`Checklist_${normalizeText(assistedNameEl.textContent).replace(/\s+/g, '_')}.pdf`);
    if (printChecklistBtn) printChecklistBtn.textContent = "Baixar PDF";
}

// --- 10. EXPORTS ---

export function setupDetailsModal(config) {
    db = config.db; getUpdatePayload = config.getUpdatePayload; showNotification = config.showNotification;
    actionSelectionView.addEventListener('click', handleActionSelect);
    backToActionSelectionBtn.addEventListener('click', handleBack);
    saveChecklistBtn.addEventListener('click', handleSave);
    checklistSearch.addEventListener('input', handleSearch);
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    if (printChecklistBtn) printChecklistBtn.addEventListener('click', handleGeneratePdf);
}

export function openDetailsModal(config) {
    populateActionSelection();
    currentAssistedId = config.assistedId; currentPautaId = config.pautaId; allAssisted = config.allAssisted;
    const assisted = allAssisted.find(a => a.id === currentAssistedId);
    if (!assisted) return;
    assistedNameEl.textContent = assisted.name;
    if (assisted.documentChecklist?.action) {
        renderChecklist(assisted.documentChecklist.action);
        actionSelectionView.classList.add('hidden'); checklistView.classList.remove('hidden'); checklistView.classList.add('flex');
    } else { handleBack(); }
    modal.classList.remove('hidden');
}
