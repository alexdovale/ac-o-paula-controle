/**
 * detalhes.js
 * Gerencia o modal de detalhes, checklist e dados da parte contrária.
 */

// --- 1. CONSTANTES DE DOCUMENTAÇÃO (Listas Padrão) ---

const BASE_DOCS = [
    'Carteira de Identidade (RG) ou Habilitação (CNH)', 
    'CPF', 
    'Comprovante de Residência (Atualizado - últimos 3 meses)'
];

const INCOME_DOCS = [
    '--- TRABALHADOR FORMAL (CLT / SERVIDOR) ---',
    'Contracheque (3 últimos meses)',
    'Carteira de Trabalho (Física ou Digital - Print das telas)',
    'Extrato Analítico do FGTS',
    '--- APOSENTADO / PENSIONISTA / BPC-LOAS ---',
    'Extrato de Pagamento de Benefício (Meu INSS)',
    'Histórico de Crédito - HISCRE (Meu INSS)',
    'Extrato bancário da conta onde recebe o benefício',
    '--- AUTÔNOMO / INFORMAL ---',
    'Declaração de Hipossuficiência (Próprio Punho - informando média mensal)',
    'Extratos Bancários (3 últimos meses)',
    'Comprovante de Inscrição no CadÚnico',
    'Consulta de Restituição IRPF (Prova de Isenção)',
    '--- DESEMPREGADO ---',
    'Carteira de Trabalho (Página da baixa do último emprego)',
    'Comprovante de Seguro-Desemprego (se estiver recebendo)',
    'Declaração de Hipossuficiência (Informando ausência de renda)',
    'Extrato do CNIS (Meu INSS - prova ausência de vínculo)',
    '--- PROVAS GERAIS (HIPOSSUFICIÊNCIA) ---',
    'Extrato do Bolsa Família',
    'Folha Resumo do CadÚnico',
    'Declaração de IRPF Completa + Recibo (se declarar)'
];

// Lista Combinada: Identificação + Renda (Será usada em quase todas as ações)
const COMMON_DOCS_FULL = [...BASE_DOCS, ...INCOME_DOCS];


// --- 2. DADOS DOS TIPOS DE AÇÃO ---

const documentsData = {
    // --- CÍVEL ---
    obrigacao_fazer: { 
        title: 'Ação de Obrigação de Fazer', 
        sections: [
            { title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, 
            { title: 'Específicos do Caso', docs: ['Contrato ou acordo descumprido', 'Protocolos de atendimento', 'Troca de e-mails/mensagens', 'Fotos/Vídeos do problema'] }
        ] 
    },
    declaratoria_nulidade: { 
        title: 'Ação Declaratória de Nulidade', 
        sections: [
            { title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, 
            { title: 'Específicos do Caso', docs: ['Cópia do contrato/multa a ser anulado', 'Comprovantes de pagamento indevido', 'Laudos ou pareces (se houver)'] }
        ] 
    },
    indenizacao_danos: { 
        title: 'Ação de Indenização (Danos)', 
        sections: [
            { title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL }, 
            { title: 'Específicos do Caso', docs: ['Boletim de Ocorrência (se aplicável)', 'Fotos/Vídeos dos danos', 'Três orçamentos (para dano material)', 'Notas fiscais de gastos', 'Nome e endereço de testemunhas'] }
        ] 
    },
    revisional_debito: {
        title: 'Ação Revisional de Débito',
        sections: [
            { title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Específicos do Caso', docs: ['Contrato de empréstimo/financiamento', 'Planilha de evolução da dívida', 'Extratos comprovando os descontos'] }
        ]
    },
    exigir_contas: {
        title: 'Ação de Exigir Contas',
        sections: [
            { title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Específicos do Caso', docs: ['Documento que prova a gestão de bens pelo réu', 'Provas da recusa em prestar contas'] }
        ]
    },

    // --- FAMÍLIA ---
    alimentos_fixacao_majoracao_oferta: {
        title: 'Alimentos (Fixação / Majoração / Oferta)',
        sections: [
            { title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Do Alimentando (Filho)', docs: ['Certidão de Nascimento', 'Comprovantes de despesas (Escola, Curso, Natação)', 'Comprovantes de saúde (Plano, remédios, tratamentos)', 'Notas fiscais de vestuário/alimentação'] },
            { title: 'Sobre o Réu', docs: ['Endereço completo (Indispensável)', 'Informações sobre trabalho/renda do réu (Nome da empresa, endereço)'] }
        ]
    },
    alimentos_gravidicos: {
        title: 'Ação de Alimentos Gravídicos',
        sections: [
            { title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Da Gestação', docs: ['Exame Beta HCG / Ultrassom', 'Cartão de Pré-Natal', 'Receitas médicas e notas de medicamentos', 'Orçamento de enxoval/parto'] },
            { title: 'Do Suposto Pai', docs: ['Indícios de paternidade (Conversas WhatsApp, Fotos juntos, Testemunhas)', 'Endereço e Local de Trabalho do Réu'] }
        ]
    },
    alimentos_avoengos: {
        title: 'Alimentos Avoengos (Contra Avós)',
        sections: [
            { title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Específicos', docs: ['Certidão de Nascimento do Neto', 'Prova da impossibilidade dos pais pagarem (prisão, morte, desaparecimento)', 'Endereço dos Avós'] }
        ]
    },
    divorcio_consensual: {
        title: 'Divórcio Consensual',
        sections: [
            { title: 'Documentação (Ambos)', docs: ['RG e CPF de ambos', 'Comprovante de Residência de ambos', 'Certidão de Casamento (Atualizada - 90 dias)', ...INCOME_DOCS] },
            { title: 'Filhos e Bens', docs: ['Certidão de Nascimento dos filhos', 'Documento do Imóvel (RGI ou Compra e Venda)', 'CRLV de Veículos'] }
        ]
    },
    divorcio_litigioso: {
        title: 'Divórcio Litigioso',
        sections: [
            { title: 'Documentação Pessoal e Renda', docs: [...COMMON_DOCS_FULL, 'Certidão de Casamento (Atualizada - 90 dias)'] },
            { title: 'Filhos e Bens', docs: ['Certidão de Nascimento dos filhos', 'Comprovantes de despesas dos filhos', 'Documentos dos bens a partilhar (RGI, CRLV, Extratos)'] },
            { title: 'Sobre o Cônjuge (Réu)', docs: ['Endereço atual', 'Local de trabalho'] }
        ]
    },
    uniao_estavel_reconhecimento_dissolucao: {
        title: 'União Estável (Reconhecimento/Dissolução)',
        sections: [
            { title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Provas da União', docs: ['Certidão de Nascimento dos filhos em comum', 'Contas em nome de ambos no mesmo endereço', 'Fotos do casal', 'Declarações de testemunhas', 'Seguro de vida/Plano de saúde como dependente'] },
            { title: 'Bens', docs: ['Documentos dos bens adquiridos durante a união'] }
        ]
    },
    uniao_estavel_post_mortem: {
        title: 'União Estável Post Mortem',
        sections: [
            { title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Do Falecido', docs: ['Certidão de Óbito', 'Certidão de bens deixados'] },
            { title: 'Provas da União', docs: ['(Mesmas provas da união estável comum)'] }
        ]
    },
    conversao_uniao_homoafetiva: {
        title: 'Conversão de União Estável em Casamento',
        sections: [
            { title: 'Documentação (Ambos)', docs: ['RG/CPF e Comprovante de Residência de ambos', 'Certidões de Nascimento atualizadas', ...INCOME_DOCS] }
        ]
    },
    guarda: {
        title: 'Ação de Guarda',
        sections: [
            { title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Da Criança', docs: ['Certidão de Nascimento', 'Comprovante de matrícula escolar', 'Cartão de vacinação'] },
            { title: 'Do Caso', docs: ['Relatório do Conselho Tutelar (se houver)', 'Provas de maus tratos/negligência da outra parte (se houver)'] }
        ]
    },
    regulamentacao_convivencia: {
        title: 'Regulamentação de Visitas',
        sections: [
            { title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Da Criança', docs: ['Certidão de Nascimento', 'Endereço onde a criança reside'] }
        ]
    },
    investigacao_paternidade: {
        title: 'Investigação de Paternidade',
        sections: [
            { title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Da Criança', docs: ['Certidão de Nascimento (sem o nome do pai)'] },
            { title: 'Sobre o Suposto Pai', docs: ['Nome completo', 'Endereço residencial ou trabalho', 'Provas do relacionamento (se houver)'] }
        ]
    },
    curatela: {
        title: 'Curatela (Interdição)',
        sections: [
            { title: 'Documentação Pessoal e Renda (Curador)', docs: COMMON_DOCS_FULL },
            { title: 'Do Curatelando', docs: ['RG e CPF', 'Certidão de Nascimento/Casamento', 'Comprovante de Renda (Benefício INSS)', 'Laudo Médico Atualizado (com CID e expressa menção à incapacidade)'] }
        ]
    },
    levantamento_curatela: {
        title: 'Levantamento de Curatela',
        sections: [
            { title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Específicos', docs: ['Cópia da sentença de interdição', 'Laudo médico atestando a recuperação da capacidade'] }
        ]
    },
    tutela: {
        title: 'Tutela (Menor)',
        sections: [
            { title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Do Menor', docs: ['Certidão de Nascimento', 'Certidão de Óbito dos pais (ou comprovante de destituição do poder familiar)'] }
        ]
    },
    adocao: {
        title: 'Adoção',
        sections: [
            { title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Específicos', docs: ['Certidão de Casamento/Nascimento dos adotantes', 'Certidão de Nascimento da criança', 'Atestado de Sanidade Física e Mental', 'Certidões Negativas Cíveis e Criminais'] }
        ]
    },

    // --- CRIMINAL ---
    defesa_criminal_custodia: {
        title: 'Defesa Criminal / Audiência de Custódia',
        sections: [
            { title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Do Caso', docs: ['Auto de Prisão em Flagrante / BO', 'Comprovante de Residência Fixa', 'Carteira de Trabalho Assinada (para pedir liberdade)', 'Nome e endereço de testemunhas'] }
        ]
    },
    execucao_penal: {
        title: 'Execução Penal (VPL, Livramento, Progressão)',
        sections: [
            { title: 'Documentação Pessoal e Renda (Familiar)', docs: COMMON_DOCS_FULL },
            { title: 'Do Preso', docs: ['Carteira de Visitante', 'Carta do preso', 'Número do Processo de Execução (PEP)', 'Certidão Carcerária (se tiver)'] }
        ]
    },

    // --- FAZENDA PÚBLICA ---
    fornecimento_medicamentos: {
        title: 'Medicamentos / Saúde',
        sections: [
            { title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Médicos', docs: ['Laudo Médico (com CID e justificativa)', 'Receita Médica (Original e Atual)', 'Negativa da Secretaria de Saúde/Plano', 'Três orçamentos de farmácias diferentes'] }
        ]
    },
    indenizacao_poder_publico: {
        title: 'Indenização contra o Estado',
        sections: [
            { title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Específicos', docs: ['Provas do fato (BO, Fotos, Laudos)', 'Comprovantes de gastos/danos'] }
        ]
    },
    previdencia_estadual_municipal: {
        title: 'Previdência (RPPS)',
        sections: [
            { title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Específicos', docs: ['Processo administrativo do benefício', 'Portaria de aposentadoria/pensão'] }
        ]
    },
    questionamento_impostos_taxas: {
        title: 'Contestação de Impostos/Taxas',
        sections: [
            { title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Específicos', docs: ['Carnê do IPTU/Taxa', 'Notificação da Dívida Ativa', 'Comprovantes de pagamento (se houver)'] }
        ]
    },

    // --- INFÂNCIA ---
    vaga_escola_creche: {
        title: 'Vaga em Creche/Escola',
        sections: [
            { title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Da Criança', docs: ['Certidão de Nascimento', 'Cartão de Vacinação', 'Comprovante de Inscrição/Negativa da escola', 'Número do protocolo 1746 (se Rio)'] }
        ]
    },
    apoio_escolar: {
        title: 'Profissional de Apoio Escolar (Mediador)',
        sections: [
            { title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Da Criança', docs: ['Certidão de Nascimento', 'Laudo Médico (CID + Necessidade de mediador)', 'Comprovante de Matrícula'] }
        ]
    },
    transporte_gratuito: {
        title: 'Transporte Gratuito (Passe Livre)',
        sections: [
            { title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Do Requerente', docs: ['Laudo Médico (CID + Necessidade de transporte)', 'Negativa do Riocard/Fetranspor'] }
        ]
    },

    // --- REGISTROS ---
    retificacao_registro_civil: {
        title: 'Retificação de Registro Civil',
        sections: [
            { title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Específicos', docs: ['Certidão a ser retificada (Original)', 'Documentos que provam o erro (outras certidões, batistério, documentos escolares)'] }
        ]
    },
    
    // --- ALVARÁ ---
    alvara_levantamento_valores: {
        title: 'Alvará (Levantamento de Valores)',
        sections: [
            { title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Do Falecido', docs: ['Certidão de Óbito', 'Certidão de Dependentes Habilitados (INSS) ou Negativa', 'Extratos de PIS/FGTS/Conta Bancária'] }
        ]
    },
    alvara_viagem_menor: {
        title: 'Alvará de Viagem (Menor)',
        sections: [
            { title: 'Documentação Pessoal e Renda', docs: COMMON_DOCS_FULL },
            { title: 'Viagem', docs: ['Passagens/Reserva', 'Endereço de destino', 'Documentos de quem acompanhará', 'Endereço do genitor que nega/ausente'] }
        ]
    }
};

// Lista de ações que exigem dados profissionais do Réu
const ACTIONS_WITH_WORK_INFO = [
    'alimentos_fixacao_majoracao_oferta',
    'alimentos_gravidicos',
    'alimentos_avoengos',
    'divorcio_litigioso',
    'uniao_estavel_reconhecimento_dissolucao',
    'investigacao_paternidade'
];

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

// --- 5. RENDERIZAÇÃO DO FORMULÁRIO DO RÉU ---

function renderReuForm(actionKey) {
    const showWorkInfo = ACTIONS_WITH_WORK_INFO.includes(actionKey);

    const container = document.createElement('div');
    container.id = 'dynamic-reu-form';
    container.className = 'mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg';

    container.innerHTML = `
        <h3 class="text-lg font-bold text-gray-800 mb-4 border-b pb-2">Dados da Parte Contrária (Réu)</h3>
        
        <!-- Dados Pessoais e Contato -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
                <label class="block text-sm font-medium text-gray-700">CPF</label>
                <input type="text" id="cpf-reu" placeholder="000.000.000-00" class="mt-1 block w-full p-2 border rounded-md">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">Telefone/WhatsApp</label>
                <input type="text" id="telefone-reu" placeholder="(00) 00000-0000" class="mt-1 block w-full p-2 border rounded-md">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">E-mail</label>
                <input type="email" id="email-reu" placeholder="nome@exemplo.com" class="mt-1 block w-full p-2 border rounded-md">
            </div>
        </div>

        <!-- Endereço Residencial -->
        <h4 class="text-sm font-semibold text-gray-600 mb-2">Endereço Residencial</h4>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
                <label class="block text-xs text-gray-500">CEP</label>
                <input type="text" id="cep-reu" maxlength="9" class="w-full p-2 border rounded-md">
            </div>
            <div class="md:col-span-2">
                <label class="block text-xs text-gray-500">Rua/Logradouro</label>
                <input type="text" id="rua-reu" class="w-full p-2 border rounded-md bg-gray-100">
            </div>
            <div>
                <label class="block text-xs text-gray-500">Número</label>
                <input type="text" id="numero-reu" class="w-full p-2 border rounded-md">
            </div>
            <div>
                <label class="block text-xs text-gray-500">Bairro</label>
                <input type="text" id="bairro-reu" class="w-full p-2 border rounded-md bg-gray-100">
            </div>
            <div>
                <label class="block text-xs text-gray-500">Cidade/UF</label>
                <div class="flex gap-2">
                    <input type="text" id="cidade-reu" class="w-full p-2 border rounded-md bg-gray-100">
                    <input type="text" id="estado-reu" class="w-16 p-2 border rounded-md bg-gray-100">
                </div>
            </div>
        </div>

        <!-- Dados Profissionais (Condicional) -->
        ${showWorkInfo ? `
        <div class="border-t pt-4 mt-4">
            <h4 class="text-sm font-semibold text-blue-700 mb-2">Dados Profissionais (Necessário para o processo)</h4>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700">Nome da Empresa / Empregador</label>
                    <input type="text" id="empresa-reu" placeholder="Onde o réu trabalha?" class="mt-1 w-full p-2 border rounded-md">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700">Endereço do Trabalho</label>
                    <input type="text" id="endereco-trabalho-reu" placeholder="Endereço completo da empresa" class="mt-1 w-full p-2 border rounded-md">
                </div>
            </div>
        </div>
        ` : ''}
    `;
    return container;
}

// --- 6. RENDERIZAÇÃO DA CHECKLIST ---

function populateActionSelection() {
    const container = document.getElementById('document-action-selection');
    if (!container) return;

    let searchInput = document.getElementById('action-search-input');
    if (!searchInput) {
        searchInput = document.createElement('input');
        searchInput.id = 'action-search-input';
        searchInput.type = 'text';
        searchInput.placeholder = 'Pesquisar por assunto...';
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

    // 1. Lista de Documentos (Gera HTML da checklist)
    data.sections.forEach((section, sIdx) => {
        const div = document.createElement('div');
        div.innerHTML = `<h4 class="font-bold text-gray-700 mt-4 mb-2 border-b">${section.title}</h4>`;
        const ul = document.createElement('ul');
        ul.className = 'space-y-2';
        
        section.docs.forEach((docName, dIdx) => {
            const li = document.createElement('li');
            const id = `doc-${actionKey}-${sIdx}-${dIdx}`;
            const isChecked = saved?.checkedIds?.includes(id) ? 'checked' : '';
            
            li.innerHTML = `
                <label class="flex items-center cursor-pointer">
                    <input type="checkbox" id="${id}" class="h-5 w-5 text-green-600 rounded border-gray-300 mr-2" ${isChecked}>
                    <span class="text-sm">${docName}</span>
                </label>
            `;
            ul.appendChild(li);
        });
        div.appendChild(ul);
        checklistContainer.appendChild(div);
    });

    // 2. Observações (NOME ALTERADO)
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

    // Outras observações
    const otherText = saved?.observations?.otherText || '';
    const showOther = !!otherText;
    const otherDiv = document.createElement('div');
    otherDiv.className = 'mt-2';
    otherDiv.innerHTML = `
        <label class="flex items-center cursor-pointer">
            <input type="checkbox" id="check-other" class="h-4 w-4 text-yellow-600 mr-2" ${showOther ? 'checked' : ''}>
            Outras Observações
        </label>
        <textarea id="text-other" class="w-full mt-2 p-2 border rounded text-sm ${showOther ? '' : 'hidden'}" rows="2" placeholder="Descreva...">${otherText}</textarea>
    `;
    otherDiv.querySelector('#check-other').addEventListener('change', (e) => {
        document.getElementById('text-other').classList.toggle('hidden', !e.target.checked);
    });
    obsDiv.appendChild(otherDiv);
    checklistContainer.appendChild(obsDiv);

    // 3. Formulário do Réu (Geração e Listener)
    const reuForm = renderReuForm(actionKey);
    checklistContainer.appendChild(reuForm);
    setupCepListener('cep-reu', { rua: 'rua-reu', bairro: 'bairro-reu', cidade: 'cidade-reu', uf: 'estado-reu' });

    // 4. Preenchimento de Dados Salvos
    if (saved?.reuData) {
        fillReuData(saved.reuData);
    }
}

// --- 7. MANIPULAÇÃO DE DADOS (GET/SET) ---

function fillReuData(data) {
    const setVal = (id, val) => { const el = document.getElementById(id); if(el) el.value = val || ''; };
    setVal('cpf-reu', data.cpf);
    setVal('telefone-reu', data.telefone);
    setVal('email-reu', data.email);
    setVal('cep-reu', data.cep);
    setVal('rua-reu', data.rua);
    setVal('numero-reu', data.numero);
    setVal('bairro-reu', data.bairro);
    setVal('cidade-reu', data.cidade);
    setVal('estado-reu', data.uf);
    setVal('empresa-reu', data.empresa);
    setVal('endereco-trabalho-reu', data.enderecoTrabalho);
}

function getReuData() {
    const getVal = (id) => document.getElementById(id)?.value || '';
    const ids = ['cpf-reu', 'telefone-reu', 'email-reu', 'cep-reu', 'rua-reu', 'empresa-reu'];
    const hasData = ids.some(id => getVal(id) !== '');

    if (!hasData) return null;

    return {
        cpf: getVal('cpf-reu'),
        telefone: getVal('telefone-reu'),
        email: getVal('email-reu'),
        cep: getVal('cep-reu'),
        rua: getVal('rua-reu'),
        numero: getVal('numero-reu'),
        bairro: getVal('bairro-reu'),
        cidade: getVal('cidade-reu'),
        uf: getVal('estado-reu'),
        empresa: getVal('empresa-reu'),
        enderecoTrabalho: getVal('endereco-trabalho-reu')
    };
}

async function handleSave() {
    if (!currentAssistedId || !currentPautaId) return;

    // Salva checkboxes
    const checkedIds = Array.from(checklistContainer.querySelectorAll('input[type="checkbox"][id^="doc-"]:checked')).map(cb => cb.id);
    // Salva observações
    const obsSelected = Array.from(checklistContainer.querySelectorAll('.obs-opt:checked')).map(cb => cb.value);
    const otherText = document.getElementById('check-other')?.checked ? document.getElementById('text-other').value : '';
    // Salva dados do Réu
    const reuData = getReuData();

    const payload = {
        documentChecklist: {
            action: currentChecklistAction,
            checkedIds: checkedIds,
            observations: { selected: obsSelected, otherText: otherText },
            reuData: reuData
        }
    };

    try {
        const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
        await updateDoc(doc(db, "pautas", currentPautaId, "attendances", currentAssistedId), getUpdatePayload(payload));
        if (showNotification) showNotification("Dados salvos com sucesso!", "success");
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
    const btns = actionSelectionView.querySelectorAll('.action-grid button');
    btns.forEach(btn => {
        btn.style.display = normalizeText(btn.textContent).includes(term) ? 'block' : 'none';
    });
}

function handleSearch(e) {
    const term = normalizeText(e.target.value);
    const lis = checklistContainer.querySelectorAll('ul li');
    lis.forEach(li => {
        li.style.display = normalizeText(li.textContent).includes(term) ? 'block' : 'none';
    });
}

function closeModal() {
    modal.classList.add('hidden');
}

// --- 9. GERAÇÃO DE PDF (COMPLETA) ---

async function handleGeneratePdf() {
    if (printChecklistBtn) printChecklistBtn.textContent = "Gerando...";
    
    // Importação dinâmica para não pesar o carregamento inicial
    const { jsPDF } = window.jspdf || await import('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let y = 20;

    // --- Cabeçalho ---
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Checklist de Atendimento", pageWidth / 2, y, { align: "center" });
    
    y += 15;
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(`Assistido(a): ${assistedNameEl.textContent}`, 15, y);
    y += 7;
    doc.text(`Ação: ${checklistTitle.textContent}`, 15, y);
    y += 15;
    
    // --- 1. Itens da Checklist (Marcados) ---
    doc.setFont("helvetica", "bold");
    doc.text("Documentos Entregues:", 15, y);
    y += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    
    // Pega todos os checkboxes de documentos marcados
    const checked = checklistContainer.querySelectorAll('input[type="checkbox"][id^="doc-"]:checked');
    
    if (checked.length > 0) {
        checked.forEach(cb => {
            // Pega o texto do span vizinho ao checkbox
            const text = cb.nextElementSibling.textContent.trim();
            
            // Quebra de linha se texto for longo
            const lines = doc.splitTextToSize(`- ${text}`, pageWidth - 30);
            
            // Verifica quebra de página
            if (y + (lines.length * 5) > pageHeight - 20) { doc.addPage(); y = 20; }
            
            doc.text(lines, 20, y);
            y += lines.length * 5;
        });
    } else {
        doc.text("- Nenhum documento marcado.", 20, y);
        y += 7;
    }

    // --- 2. Observações ---
    y += 10;
    if (y > pageHeight - 40) { doc.addPage(); y = 20; }
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Status / Observações:", 15, y);
    y += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    
    const obs = checklistContainer.querySelectorAll('.obs-opt:checked');
    if (obs.length > 0) {
        obs.forEach(cb => {
            doc.text(`[X] ${cb.value}`, 20, y);
            y += 6;
        });
    }

    const other = document.getElementById('text-other');
    if (other && !other.classList.contains('hidden') && other.value) {
        const lines = doc.splitTextToSize(`Obs: ${other.value}`, pageWidth - 30);
        if (y + (lines.length * 5) > pageHeight - 20) { doc.addPage(); y = 20; }
        doc.text(lines, 20, y);
        y += lines.length * 5;
    }

    // --- 3. Dados da Parte Contrária (Réu) - BLOCO NOVO ---
    
    // Tenta pegar os dados salvos ou os que estão na tela agora
    const reuData = getReuData(); 

    if (reuData) { // Só imprime se houver dados
        y += 15;
        if (y > pageHeight - 60) { doc.addPage(); y = 20; }

        // Linha divisória
        doc.setLineWidth(0.5);
        doc.line(15, y, pageWidth - 15, y);
        y += 15;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.text("Dados da Parte Contrária (Réu)", 15, y);
        y += 10;
        doc.setFontSize(11);
        doc.setFont("helvetica", "normal");

        // Função auxiliar para imprimir campos
        const printField = (label, value) => {
            if (value && value.trim() !== "") {
                doc.text(`${label}: ${value}`, 20, y);
                y += 6;
            }
        };

        printField("CPF", reuData.cpf);
        printField("Telefone/WhatsApp", reuData.telefone);
        printField("E-mail", reuData.email);
        
        // Monta endereço
        let end = reuData.rua;
        if (reuData.numero) end += `, ${reuData.numero}`;
        if (reuData.bairro) end += ` - ${reuData.bairro}`;
        if (reuData.cidade) end += ` - ${reuData.cidade}`;
        if (reuData.uf) end += `/${reuData.uf}`;
        if (reuData.cep) end += ` (CEP: ${reuData.cep})`;
        
        if (end && end.length > 5) {
            const endLines = doc.splitTextToSize(`Endereço: ${end}`, pageWidth - 40);
            if (y + (endLines.length * 6) > pageHeight - 20) { doc.addPage(); y = 20; }
            doc.text(endLines, 20, y);
            y += endLines.length * 6;
        }

        // Dados Profissionais
        if (reuData.empresa || reuData.enderecoTrabalho) {
            y += 4;
            if (y > pageHeight - 40) { doc.addPage(); y = 20; }
            doc.setFont("helvetica", "bold");
            doc.text("Dados Profissionais:", 20, y);
            y += 6;
            doc.setFont("helvetica", "normal");
            printField("Empresa", reuData.empresa);
            printField("End. Trabalho", reuData.enderecoTrabalho);
        }
    }
    
    // Salvar
    doc.save(`Checklist_${normalizeText(assistedNameEl.textContent).replace(/\s+/g, '_')}.pdf`);
    if (printChecklistBtn) printChecklistBtn.textContent = "Baixar PDF";
}

// --- 10. EXPORTS ---

export function setupDetailsModal(config) {
    db = config.db;
    getUpdatePayload = config.getUpdatePayload;
    showNotification = config.showNotification;

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
    currentAssistedId = config.assistedId;
    currentPautaId = config.pautaId;
    allAssisted = config.allAssisted;

    const assisted = allAssisted.find(a => a.id === currentAssistedId);
    if (!assisted) return;

    assistedNameEl.textContent = assisted.name;

    if (assisted.documentChecklist?.action) {
        renderChecklist(assisted.documentChecklist.action);
        actionSelectionView.classList.add('hidden');
        checklistView.classList.remove('hidden');
        checklistView.classList.add('flex');
    } else {
        handleBack();
    }
    modal.classList.remove('hidden');
}
