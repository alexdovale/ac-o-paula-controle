/**
 * ========================================================
 * DETALHES.JS - SIGEP (VERSÃO COMPLETA E DINÂMICA)
 * Módulo de Detalhes do Assistido, Checklist Dinâmico,
 * Captação, Gerador de Texto e Planilha de Gastos (PDF/Word).
 * ========================================================
 */

import { doc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showNotification, escapeHTML } from './utils.js';
import { flatSubjects } from './assuntos.js';
import { PDFService } from './pdfService.js';

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

// ⭐ PLANILHA DE GASTOS SEPARADA POR TIPO (COM RATEIO AUTOMÁTICO)
export const EXPENSE_CATEGORIES_COMUNS = [
    { id: 'aluguel', label: 'Aluguel Residencial', desc: 'Valor total do imóvel' },
    { id: 'condominio', label: 'Condomínio', desc: 'Taxa condominial' },
    { id: 'iptu', label: 'IPTU', desc: 'Imposto predial' },
    { id: 'luz', label: 'Energia Elétrica (Luz)', desc: 'Conta de luz da residência' },
    { id: 'agua', label: 'Água / Saneamento', desc: 'Conta de água' },
    { id: 'gas', label: 'Gás de Cozinha', desc: 'Botijão ou encanado' },
    { id: 'internet', label: 'Internet Banda Larga', desc: 'Serviço de internet' },
    { id: 'supermercado', label: 'Supermercado (Alimentação Geral)', desc: 'Compras do mês' }
];

export const EXPENSE_CATEGORIES_EXCLUSIVAS = [
    { id: 'escola', label: 'Mensalidade Escolar / Creche', desc: 'Valor integral' },
    { id: 'material_escolar', label: 'Material Escolar / Livros', desc: 'Despesa com material' },
    { id: 'merenda', label: 'Merenda Escolar / Lanches', desc: 'Custo de lanches' },
    { id: 'plano_saude', label: 'Plano de Saúde / Odontológico', desc: 'Mensalidade' },
    { id: 'lazer_crianca', label: 'Lazer / Atividades Extracurriculares', desc: 'Passeios e cursos' }
];

const ACTIONS_ALWAYS_EXPENSES = [
    'alimentos_fixacao_majoracao_oferta',
    'alimentos_gravidicos',
    'alimentos_avoengos',
    'investigacao_paternidade',
    'guarda'
];

// ⭐ OPÇÕES DE OCUPAÇÃO
const OCUPACOES = [
    'Empregado com vínculo (CLT)',
    'Empregado sem vínculo (Informal)',
    'Autônomo',
    'Aposentado',
    'Do lar',
    'Pensionista',
    'Beneficiário do INSS (BPC/LOAS)',
    'Desempregado',
    'Estudante'
];

/* ========================================================
   2. BASE DE DADOS DE AÇÕES COMPLETA
   ======================================================== */
export const documentsData = {
    obrigacao_fazer: { title: 'Obrigação de Fazer', sections: [{ title: 'Base e Renda', docs: COMMON_DOCS_FULL }, { title: 'Específicos', docs: ['Contrato/Acordo', 'Provas do descumprimento'] }] },
    declaratoria_nulidade: { title: 'Declaratória de Nulidade', sections: [{ title: 'Base e Renda', docs: COMMON_DOCS_FULL }, { title: 'Específicos', docs: ['Documento a anular', 'Provas da ilegalidade'] }] },
    indenizacao_danos: { title: 'Ação de Indenização', sections: [{ title: 'Base e Renda', docs: COMMON_DOCS_FULL }, { title: 'Específicos', docs: ['BO', 'Fotos / Vídeos do Dano', 'Orçamentos de Reparo', 'Notas Fiscais de Prejuízos', 'Rol de Testemunhas'] }] },
    revisional_debito: { title: 'Ação Revisional de Débito', sections: [{ title: 'Base e Renda', docs: COMMON_DOCS_FULL }, { title: 'Específicos', docs: ['Contrato de Financiamento', 'Planilha de Evolução do Débito', 'Extratos Bancários Recentes'] }] },
    exigir_contas: { title: 'Ação de Exigir Contas', sections: [{ title: 'Base e Renda', docs: COMMON_DOCS_FULL }, { title: 'Específicos', docs: ['Prova da administração de bens', 'Notificação ou recusa em prestar contas'] }] },
    alimentos_fixacao_majoracao_oferta: { title: 'Alimentos (Fixação / Majoração / Oferta)', sections: [{ title: 'Base e Renda', docs: COMMON_DOCS_FULL }, { title: 'Do Alimentando', docs: ['Certidão de Nascimento', 'Comprovantes de despesas da criança'] }] },
    alimentos_gravidicos: { title: 'Ação de Alimentos Gravídicos', sections: [{ title: 'Base e Renda', docs: COMMON_DOCS_FULL }, { title: 'Da Gestação', docs: ['Exame de Gravidez (Beta HCG)', 'Caderneta de Pré-Natal / Relatórios Médicos'] }] },
    alimentos_avoengos: { title: 'Alimentos Avoengos', sections: [{ title: 'Base e Renda', docs: COMMON_DOCS_FULL }, { title: 'Específicos', docs: ['Certidão de Nascimento', 'Prova da impossibilidade material dos genitores'] }] },
    divorcio_consensual: { title: 'Divórcio Consensual', sections: [{ title: 'Documentação (Ambos)', docs: ['RG e CPF de ambos', 'Comprovante de Residência de ambos', 'Certidão de Casamento Atualizada', ...INCOME_DOCS_STRUCTURED] }, { title: 'Filhos/Bens', docs: ['Certidão de Nascimento dos Filhos', 'Documentos de Propriedade de Bens'] }] },
    divorcio_litigioso: { title: 'Divórcio Litigioso', sections: [{ title: 'Base e Renda', docs: [...COMMON_DOCS_FULL, 'Certidão de Casamento Atualizada'] }, { title: 'Filhos/Bens', docs: ['Certidão de Nascimento dos Filhos', 'Documentos de Propriedade de Bens'] }] },
    uniao_estavel: { title: 'União Estável (Reconhecimento/Dissolução)', sections: [{ title: 'Base e Renda', docs: COMMON_DOCS_FULL }, { title: 'Provas da Convivência', docs: ['Certidão de Nascimento de filhos comuns', 'Comprovante de mesmo endereço', 'Contas bancárias conjuntas', 'Fotos do casal', 'Rol de Testemunhas'] }] },
    guarda: { title: 'Ação de Guarda', sections: [{ title: 'Base e Renda', docs: COMMON_DOCS_FULL }, { title: 'Da Criança', docs: ['Certidão de Nascimento', 'Declaração de Matrícula Escolar', 'Cartão de Vacinação Atualizado'] }] },
    regulamentacao_convivencia: { title: 'Regulamentação de Visitas', sections: [{ title: 'Base e Renda', docs: COMMON_DOCS_FULL }, { title: 'Da Criança', docs: ['Certidão de Nascimento'] }] },
    investigacao_paternidade: { title: 'Investigação de Paternidade', sections: [{ title: 'Base e Renda', docs: COMMON_DOCS_FULL }, { title: 'Da Criança', docs: ['Certidão de Nascimento com paternidade em branco', 'Indícios ou provas do relacionamento'] }] },
    curatela: { title: 'Curatela (Interdição)', sections: [{ title: 'Base e Renda (Curador)', docs: COMMON_DOCS_FULL }, { title: 'Do Curatelando', docs: ['RG e CPF do Curatelando', 'Certidão de Nascimento ou Casamento', 'Extrato de Benefício do INSS', 'Atestado / Laudo Médico Detalhado com CID'] }] },
    retificacao_registro_civil: { title: 'Retificação Registro Civil', sections: [{ title: 'Base e Renda', docs: COMMON_DOCS_FULL }, { title: 'Específicos', docs: ['Certidão que apresenta o erro', 'Documentos antigos que comprovam o dado correto'] }] },
    alvara_valores: { title: 'Alvará (Valores)', sections: [{ title: 'Base e Renda', docs: COMMON_DOCS_FULL }, { title: 'Do Falecido', docs: ['Certidão de Óbito', 'Extratos de contas bancárias / PIS / FGTS / Resíduos'] }] },
    vaga_escola_creche: { title: 'Vaga em Creche/Escola', sections: [{ title: 'Base e Renda', docs: COMMON_DOCS_FULL }, { title: 'Da Criança', docs: ['Certidão de Nascimento', 'Protocolo de Inscrição / Negativa de Vaga'] }] }
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

let _backupAssistedId = null;
let _backupPautaId = null;

const ensureAssistedId = () => {
    if (!currentAssistedId && _backupAssistedId) {
        currentAssistedId = _backupAssistedId;
        currentPautaId = _backupPautaId;
    }
    if (!currentAssistedId && window._lastOpenedAssistedId) {
        currentAssistedId = window._lastOpenedAssistedId;
        currentPautaId = window._lastOpenedPautaId;
    }
    return currentAssistedId;
};

const getEl = (id) => document.getElementById(id);
const normalizeLocal = (str) => str ? str.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : '';

function formatCurrency(v) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v); }
function parseCurrency(s) {
    if (!s) return 0;
    return parseFloat(s.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
}

/* ========================================================
   3.1 GERAÇÃO DE LINK DE CAPTAÇÃO
   ======================================================== */
export async function gerarLinkCaptacao() {
    const pautaId = currentPautaId;
    const assistidoId = currentAssistedId;

    if (!assistidoId || !pautaId || !db) {
        showNotification("Erro: Selecione um assistido primeiro!", "error");
        return;
    }

    const tokenSeguranca = crypto.randomUUID();

    try {
        const assistidoRef = doc(db, "pautas", pautaId, "attendances", assistidoId);
        await updateDoc(assistidoRef, { delegationToken: tokenSeguranca });

        let path = window.location.pathname; 
        path = path.replace('index.html', '');
        if (!path.endsWith('/')) path += '/';
        
        const link = `${window.location.origin}${path}captacao.html?pid=${pautaId}&aid=${assistidoId}&token=${tokenSeguranca}`;

        const assisted = allAssisted.find(a => a.id === assistidoId);
        const nome = assisted?.name ? assisted.name.split(' ')[0] : 'assistido(a)';
        const mensagem = encodeURIComponent(`Olá, ${nome}! Clique aqui para preencher seus dados preliminares:\n\n🔗 ${link}`);

        await navigator.clipboard.writeText(link);
        showNotification("Link seguro gerado e copiado!", "success");

        const modalQr = document.getElementById('modal-captacao-qr');
        const qrContainer = document.getElementById('qrcode-display');
        
        if (modalQr && qrContainer) {
            modalQr.classList.remove('hidden');
            qrContainer.innerHTML = ""; 
            new QRCode(qrContainer, { text: link, width: 220, height: 220, correctLevel : QRCode.CorrectLevel.H });

            document.getElementById('btn-share-wa').onclick = () => {
                const tel = assisted?.telefone?.replace(/\D/g, '') || '';
                window.open(`https://wa.me/${tel.length >= 10 ? '55' + tel : ''}?text=${mensagem}`, '_blank');
            };
        }
    } catch (error) {
        console.error("Erro ao gerar link:", error);
        showNotification("Erro ao preparar o link com segurança.", "error");
    }
}

/* ========================================================
   4. FUNÇÕES DO CHECKLIST E CONDICIONAIS (A MÁGICA ACONTECE AQUI)
   ======================================================== */

// ⭐ RENDERIZA O PERFIL SOCIOECONÔMICO DO ASSISTIDO
function renderAssistidoSocioeconomico(d = {}) {
    return `
        <div class="p-4 sm:p-6 bg-blue-50 border-2 border-blue-200 rounded-2xl shadow-sm mb-6">
            <h3 class="text-sm font-black text-blue-800 uppercase mb-4 flex items-center gap-2"><span>👤</span> 2. PERFIL SOCIOECONÔMICO DO ASSISTIDO</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label class="text-[10px] font-black text-blue-600 uppercase">Ocupação / Vínculo</label>
                    <select id="socio-ocupacao" class="w-full p-2 border border-blue-300 rounded-lg text-sm bg-white mt-1 outline-none focus:ring-2 focus:ring-blue-500 transition">
                        <option value="">Selecione a ocupação para carregar os documentos...</option>
                        ${OCUPACOES.map(opt => `<option value="${opt}" ${d.ocupacao === opt ? 'selected' : ''}>${opt}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="text-[10px] font-black text-blue-600 uppercase">Profissão (Opcional)</label>
                    <input type="text" id="socio-profissao" value="${d.profissao || ''}" class="w-full p-2 border border-blue-300 rounded-lg text-sm bg-white mt-1" placeholder="Ex: Pedreiro, Vendedora...">
                </div>
                <div>
                    <label class="text-[10px] font-black text-blue-600 uppercase">Estado Civil</label>
                    <select id="socio-estado-civil" class="w-full p-2 border border-blue-300 rounded-lg text-sm bg-white mt-1 outline-none">
                        <option value="">Selecione...</option>
                        ${['Solteiro(a)', 'Casado(a)', 'União Estável', 'Divorciado(a)', 'Viúvo(a)', 'Separado(a)'].map(opt => `<option value="${opt}" ${d.estadoCivil === opt ? 'selected' : ''}>${opt}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="text-[10px] font-black text-blue-600 uppercase">Ganhos Mensais (R$)</label>
                    <input type="text" id="socio-ganhos" value="${d.ganhos || ''}" class="w-full p-2 border border-blue-300 rounded-lg text-sm bg-white mt-1" placeholder="R$ 0,00" inputmode="numeric">
                </div>
            </div>
        </div>
    `;
}

// ⭐ RENDERIZA O CHECKLIST DE ACORDO COM A OCUPAÇÃO
function renderDocumentosHTML(data, ocupacao, savedCheckedIds, savedDocTypes) {
    let group = 0; 
    if (['Empregado com vínculo (CLT)'].includes(ocupacao)) group = 1;
    else if (['Aposentado', 'Pensionista', 'Beneficiário do INSS (BPC/LOAS)'].includes(ocupacao)) group = 2;
    else if (['Empregado sem vínculo (Informal)', 'Autônomo'].includes(ocupacao)) group = 3;
    else if (['Do lar', 'Desempregado', 'Estudante'].includes(ocupacao)) group = 4;

    const docsGroup1 = [
        '1. TRABALHADOR FORMAL (CLT / SERVIDOR)',
        'Contracheque (3 últimos meses)',
        'Carteira de Trabalho (Física ou Digital - Print das telas)',
        'Extrato Analítico do FGTS'
    ];
    const docsGroup2 = [
        '2. APOSENTADO / PENSIONISTA / BPC-LOAS',
        'Extrato de Pagamento de Benefício (Portal Meu INSS)',
        'Histórico de Crédito - HISCRE (Portal Meu INSS)',
        'Extrato bancário da conta onde recebe o benefício'
    ];
    const docsGroup3 = [
        '3. AUTÔNOMO / TRABALHADOR INFORMAL',
        'Declaração de Hipossuficiência (Próprio Punho - informando média mensal)',
        'Extratos Bancários (3 últimos meses)',
        'Comprovante de Inscrição no CadÚnico'
    ];
    const docsGroup4 = [
        '4. DESEMPREGADO',
        'Carteira de Trabalho (Página da baixa do último emprego)',
        'Comprovante de Seguro-Desemprego (se estiver recebendo)',
        'Declaração de Hipossuficiência (Informando ausência de renda)',
        'Extrato do CNIS (Meu INSS - prova ausência de vínculo ativo)'
    ];

    let html = `<div class="p-4 sm:p-6 bg-white border-2 border-gray-200 rounded-2xl shadow-sm mb-6">
        <h3 class="text-sm font-black text-gray-800 uppercase mb-4 flex items-center gap-2"><span>📂</span> 3. DOCUMENTOS DA TRIAGEM (CHECKLIST)</h3>`;

    if (group === 0) {
         html += `<div class="p-3 bg-yellow-50 border border-yellow-200 text-yellow-800 text-xs rounded-lg mb-4">
                    ⚠️ <b>Atenção:</b> Preencha o "Ocupação / Vínculo" no Perfil Socioeconômico acima para exibir os itens (1 a 4) de comprovantes de renda.
                  </div>`;
    }

    data.sections.forEach(sec => {
        html += `<h4 class="text-xs font-bold text-gray-700 bg-gray-100 p-2 rounded mt-4 mb-2 uppercase border border-gray-200">${sec.title}</h4>`;
        html += `<div class="space-y-1">`;
        
        sec.docs.forEach(docItem => {
            const isObject = typeof docItem === 'object';
            const text = isObject ? docItem.text : docItem;

            // Filtro Condicional (Roteamento)
            if (docsGroup1.includes(text) && group !== 1) return;
            if (docsGroup2.includes(text) && group !== 2) return;
            if (docsGroup3.includes(text) && group !== 3) return;
            if (docsGroup4.includes(text) && group !== 4) return;
            
            if (isObject && docItem.type === 'title') {
                html += `<h5 class="text-[11px] font-black text-indigo-600 mt-4 mb-2 uppercase pl-1 border-l-2 border-indigo-600">${text}</h5>`;
            } else {
                const id = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
                const isChecked = savedCheckedIds?.includes(id) ? 'checked' : '';
                
                let docTypeHtml = '';
                if (isChecked) {
                    const savedType = savedDocTypes?.[id] || 'Físico';
                    docTypeHtml = `
                        <div id="type-${id}" class="ml-6 mt-1 flex gap-3 text-[10px]">
                            <label class="flex items-center gap-1 cursor-pointer"><input type="radio" name="type-${id}" value="Físico" ${savedType === 'Físico' ? 'checked' : ''}> Físico</label>
                            <label class="flex items-center gap-1 cursor-pointer"><input type="radio" name="type-${id}" value="Digital" ${savedType === 'Digital' ? 'checked' : ''}> Digital (PDF/Foto)</label>
                        </div>
                    `;
                } else {
                    docTypeHtml = `
                        <div id="type-${id}" class="hidden ml-6 mt-1 flex gap-3 text-[10px]">
                            <label class="flex items-center gap-1 cursor-pointer"><input type="radio" name="type-${id}" value="Físico" checked> Físico</label>
                            <label class="flex items-center gap-1 cursor-pointer"><input type="radio" name="type-${id}" value="Digital"> Digital (PDF/Foto)</label>
                        </div>
                    `;
                }

                html += `
                    <div class="flex flex-col border-b border-gray-50 py-1.5 hover:bg-gray-50 transition-colors px-1">
                        <label class="checklist-row flex items-start gap-3 cursor-pointer select-none group">
                            <div class="relative flex items-center justify-center mt-0.5">
                                <input type="checkbox" id="${id}" class="doc-checkbox peer sr-only" ${isChecked}>
                                <div class="w-5 h-5 border-2 border-gray-300 rounded-md peer-checked:bg-indigo-600 peer-checked:border-indigo-600 transition-all flex items-center justify-center group-hover:border-indigo-400">
                                    <svg class="w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
                                </div>
                            </div>
                            <span class="text-xs sm:text-sm text-gray-700 font-medium group-hover:text-indigo-700 transition-colors">${text}</span>
                        </label>
                        ${docTypeHtml}
                    </div>
                `;
            }
        });
        html += `</div>`;
    });
    html += `</div>`;
    return html;
}

// ⭐ NOVA FUNÇÃO PRINCIPAL DE RENDERIZAÇÃO
function renderChecklist(actionKey) {
    currentChecklistAction = actionKey;
    window.currentChecklistAction = actionKey; 
    const data = documentsData[actionKey];
    if (!data) return;

    const containerEl = getEl('checklist-container');
    if (!containerEl) return;

    const assisted = allAssisted.find(a => a.id === currentAssistedId);
    const saved = assisted?.documentChecklist || {};

    const titleEl = getEl('checklist-title');
    if (titleEl) titleEl.textContent = data.title;
    
    getEl('document-checklist-view-header-actions')?.classList.remove('hidden');
    getEl('checklist-search-container')?.classList.remove('hidden');
    
    // Limpa a tela
    containerEl.innerHTML = ''; 

    // 1. ADICIONA O PERFIL SOCIOECONÔMICO DO ASSISTIDO
    containerEl.innerHTML = renderAssistidoSocioeconomico(saved?.socioData);

    // 2. ADICIONA O BOTÃO GERADOR DE TEXTO (Apenas para as Pensões)
    const ASSUNTOS_PENSAO = [
        'alimentos_fixacao_majoracao_oferta',
        'alimentos_gravidicos',
        'alimentos_avoengos',
        'divorcio_consensual',
        'divorcio_litigioso',
        'investigacao_paternidade',
        'guarda'
    ];
    const isLinkDoCidadao = window.location.pathname.includes('captacao');

    if (ASSUNTOS_PENSAO.includes(actionKey) && !isLinkDoCidadao) {
        const calcContainer = document.createElement('div');
        calcContainer.className = "mb-6 p-4 bg-indigo-50 border-2 border-indigo-200 rounded-xl flex items-center justify-between shadow-sm cursor-pointer hover:bg-indigo-100 transition-colors group";
        calcContainer.onclick = () => window.gerarTextoDespesas(currentAssistedId); 
        calcContainer.innerHTML = `
            <div>
                <h4 class="font-black text-indigo-800 text-[11px] sm:text-sm uppercase flex items-center gap-2">
                    <span>🧮</span> Gerador de Texto para Petição (Gastos)
                </h4>
                <p class="text-[10px] sm:text-xs text-indigo-600 mt-1 font-medium">Extrai os gastos apurados e cria um texto pronto para o Word/SEI.</p>
            </div>
            <div class="bg-indigo-600 text-white p-2 rounded-lg shadow-sm group-hover:scale-105 transition-transform shrink-0 ml-3">
                <span>📑</span>
            </div>
        `;
        containerEl.appendChild(calcContainer);
    }

    // 3. ADICIONA O CONTAINER DO CHECKLIST DE DOCUMENTOS (Dinâmico)
    const docsContainer = document.createElement('div');
    docsContainer.id = 'dynamic-docs-container';
    containerEl.appendChild(docsContainer);

    function updateDocsList() {
        const ocupacao = getEl('socio-ocupacao')?.value || '';
        docsContainer.innerHTML = renderDocumentosHTML(data, ocupacao, saved?.checkedIds, saved?.docTypes);
        setupCheckboxEvents(docsContainer);
        updateSelectedCounter();
    }

    // 4. CONFIGURA OS EVENTOS DO PERFIL SOCIOECONÔMICO
    setTimeout(() => {
        const ocupacaoSelect = getEl('socio-ocupacao');
        if (ocupacaoSelect) {
            ocupacaoSelect.addEventListener('change', updateDocsList);
        }
        updateDocsList(); // Carrega a tela pela primeira vez

        const ganhosInput = getEl('socio-ganhos');
        if(ganhosInput) {
            ganhosInput.addEventListener('input', (e) => {
                let v = e.target.value.replace(/\D/g, '');
                e.target.value = v ? (Number(v)/100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';
            });
        }
    }, 100);

    // 5. ADICIONA A PLANILHA DE GASTOS
    if (ACTIONS_ALWAYS_EXPENSES.includes(actionKey)) {
        addExpenseTable(containerEl, saved);
    } else {
        addExpenseButton(containerEl, saved);
    }
}

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
    } catch (e) { console.error("Erro ao atualizar estado no SIGEP:", e); }
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
        });
    });
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

    const todasCategorias = [...EXPENSE_CATEGORIES_COMUNS, ...EXPENSE_CATEGORIES_EXCLUSIVAS];
    const temGastoPreenchido = saved?.expenseData && todasCategorias.some(cat => saved.expenseData[cat.id] && saved.expenseData[cat.id] !== 'R$ 0,00');

    if (temGastoPreenchido) {
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
    
    setTimeout(() => {
        document.getElementById('btn-abrir-gastos')?.addEventListener('click', () => {
            document.getElementById('expense-button-container').style.display = 'none';
            let expCont = document.getElementById('expense-table-container');
            if (!expCont) {
                expCont = document.createElement('div');
                expCont.id = 'expense-table-container';
                expCont.className = 'mt-4';
                containerEl.appendChild(expCont);
            }
            expCont.innerHTML = '';
            expCont.appendChild(renderExpenseTable());
            updateSelectedCounter();
        });
    }, 100);
}

/* ========================================================
   5. PLANILHA DE GASTOS COM RATEIO AUTOMÁTICO (ATUALIZADA)
   ======================================================== */
function renderExpenseTable() {
    const div = document.createElement('div');
    div.className = 'mt-6 p-4 bg-green-50 border-2 border-green-100 rounded-xl shadow-sm';
    div.id = 'expense-table';
    
    div.innerHTML = `
        <div class="flex items-center gap-3 mb-4 border-b pb-2">
            <input type="checkbox" id="check-exibir-gastos" class="h-5 w-5 text-green-600 rounded border-gray-300 focus:ring-green-500" checked>
            <label for="check-exibir-gastos" class="text-sm font-black text-green-800 uppercase">💰 PLANILHA DE GASTOS COM RATEIO AUTOMÁTICO</label>
        </div>
        <div id="content-planilha-gastos">
            <div class="mb-4 bg-white p-3 rounded-lg border border-green-200 flex items-center justify-between">
                <div>
                    <p class="text-xs font-bold text-slate-700 uppercase">Quantidade de Pessoas na Residência</p>
                    <p class="text-[10px] text-slate-400">Usado para calcular a cota proporcional das contas da casa.</p>
                </div>
                <input type="number" id="expense-moradores" min="1" value="1" class="w-16 p-2 border border-green-300 rounded-lg text-center font-black text-sm bg-slate-50">
            </div>

            <h5 class="text-[10px] font-black uppercase text-green-700 mb-2">Gastos Comuns / Família (Serão Rateados)</h5>
            <div class="space-y-2 mb-4">
                ${EXPENSE_CATEGORIES_COMUNS.map(c => `
                    <div class="flex justify-between items-center bg-white p-2.5 rounded-lg border border-green-100 gap-2">
                        <div class="flex-1">
                            <p class="text-[11px] font-bold text-slate-700 uppercase">${c.label}</p>
                            <p class="text-[9px] text-slate-400">${c.desc}</p>
                        </div>
                        <div class="w-32">
                            <input type="text" id="expense-${c.id}" class="expense-input w-full p-2 bg-slate-50 border border-green-200 rounded-lg text-right text-xs font-bold" placeholder="R$ 0,00" inputmode="numeric">
                        </div>
                    </div>
                `).join('')}
            </div>

            <h5 class="text-[10px] font-black uppercase text-blue-700 mb-2">Gastos Exclusivos da Criança (100% Integrais)</h5>
            <div class="space-y-2 mb-4">
                ${EXPENSE_CATEGORIES_EXCLUSIVAS.map(c => `
                    <div class="flex justify-between items-center bg-white p-2.5 rounded-lg border border-blue-100 gap-2">
                        <div class="flex-1">
                            <p class="text-[11px] font-bold text-slate-700 uppercase">${c.label}</p>
                            <p class="text-[9px] text-slate-400">${c.desc}</p>
                        </div>
                        <div class="w-32">
                            <input type="text" id="expense-${c.id}" class="expense-input w-full p-2 bg-slate-50 border border-blue-200 rounded-lg text-right text-xs font-bold" placeholder="R$ 0,00" inputmode="numeric">
                        </div>
                    </div>
                `).join('')}
            </div>

            <div class="bg-slate-800 text-white p-4 rounded-xl shadow-inner mt-4 space-y-1">
                <div class="flex justify-between text-xs text-slate-300">
                    <span>Subtotal Rateio da Família:</span>
                    <span id="subtotal-familia">R$ 0,00</span>
                </div>
                <div class="flex justify-between text-xs text-slate-300">
                    <span>Subtotal Exclusivo Criança:</span>
                    <span id="subtotal-crianca">R$ 0,00</span>
                </div>
                <div class="flex justify-between items-center border-t border-slate-700 pt-2 mt-1">
                    <span class="text-xs font-black uppercase tracking-wider text-emerald-400">NECESSIDADE MENSAL APURADA:</span>
                    <span id="expense-total" class="text-lg font-black text-emerald-400">R$ 0,00</span>
                </div>
            </div>

            <!-- ⭐ NOVOS BOTÕES PARA GERAR TABELA -->
            <div class="mt-4 flex flex-col sm:flex-row gap-2">
                <button type="button" id="btn-copiar-tabela" class="flex-1 bg-slate-700 hover:bg-slate-800 text-white font-black py-3 rounded-xl text-xs uppercase shadow transition flex items-center justify-center gap-2">
                    <span>📋</span> Copiar Tabela (Para Word/SEI)
                </button>
                <button type="button" id="btn-baixar-planilha-isolada" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3 rounded-xl text-xs uppercase shadow transition flex items-center justify-center gap-2">
                    <span>📄</span> Baixar PDF Limpo
                </button>
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

    const calcularTotais = () => {
        let totalFamilia = 0;
        let totalCrianca = 0;
        const moradores = parseInt(div.querySelector('#expense-moradores')?.value) || 1;

        EXPENSE_CATEGORIES_COMUNS.forEach(c => {
            const el = div.querySelector(`#expense-${c.id}`);
            if (el) totalFamilia += parseCurrency(el.value);
        });

        EXPENSE_CATEGORIES_EXCLUSIVAS.forEach(c => {
            const el = div.querySelector(`#expense-${c.id}`);
            if (el) totalCrianca += parseCurrency(el.value);
        });

        const cotaFamilia = totalFamilia / moradores;
        const totalGeral = cotaFamilia + totalCrianca;

        const subFam = div.querySelector('#subtotal-familia');
        const subCri = div.querySelector('#subtotal-crianca');
        const totalEl = div.querySelector('#expense-total');
        if (subFam) subFam.textContent = formatCurrency(cotaFamilia);
        if (subCri) subCri.textContent = formatCurrency(totalCrianca);
        if (totalEl) totalEl.textContent = formatCurrency(totalGeral);
    };

    div.querySelector('#expense-moradores')?.addEventListener('input', calcularTotais);

    div.querySelectorAll('.expense-input').forEach(inp => {
        inp.addEventListener('input', (e) => {
            let v = e.target.value.replace(/\D/g, '');
            e.target.value = v ? (Number(v)/100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';
            calcularTotais();
        });
    });

    setTimeout(() => {
        // Evento PDF Limpo
        div.querySelector('#btn-baixar-planilha-isolada')?.addEventListener('click', () => {
            const nomeAssistido = document.getElementById('assisted-details-name')?.textContent || 'Assistido';
            const dadosGastos = getExpenseDataFromForm();
            if (window.PDFService && typeof window.PDFService.generatePlanilhaGastosPDF === 'function') {
                window.PDFService.generatePlanilhaGastosPDF(nomeAssistido, dadosGastos);
            } else {
                showNotification("A função de PDF Limpo precisa ser atualizada no pdfService.js", "warning");
            }
        });
        
        // Evento Copiar Tabela
        div.querySelector('#btn-copiar-tabela')?.addEventListener('click', (e) => {
            window.copiarTabelaGastos();
            const btn = e.currentTarget;
            const textoOriginal = btn.innerHTML;
            btn.innerHTML = "<span>✅</span> COPIADO COM SUCESSO!";
            btn.classList.replace('bg-slate-700', 'bg-green-600');
            setTimeout(() => {
                btn.innerHTML = textoOriginal;
                btn.classList.replace('bg-green-600', 'bg-slate-700');
            }, 2500);
        });

        div.querySelector('#fechar-gastos')?.addEventListener('click', () => {
            const container = getEl('expense-table-container');
            if (container) container.innerHTML = '';
            const btnBox = getEl('expense-button-container');
            if (btnBox) btnBox.style.display = 'block';
            updateSelectedCounter();
        });
    }, 100);
}

/* ========================================================
   6. FUNÇÕES DE DADOS E SALVAMENTO
   ======================================================== */
function getExpenseDataFromForm() {
    const d = {};
    const todasCategorias = [...EXPENSE_CATEGORIES_COMUNS, ...EXPENSE_CATEGORIES_EXCLUSIVAS];
    todasCategorias.forEach(cat => {
        const el = getEl(`expense-${cat.id}`);
        let valor = el ? el.value || '' : '';
        d[cat.id] = (!valor || valor.trim() === '') ? 'R$ 0,00' : valor;
    });
    d.quantidadeMoradores = getEl('expense-moradores')?.value || '1';
    d.checkExibirGastos = getEl('check-exibir-gastos')?.checked || false;
    return d;
}

function fillExpenseData(d) {
    if (!d) return;
    const todasCategorias = [...EXPENSE_CATEGORIES_COMUNS, ...EXPENSE_CATEGORIES_EXCLUSIVAS];
    todasCategorias.forEach(cat => {
        const el = getEl(`expense-${cat.id}`);
        if (el && d[cat.id]) el.value = d[cat.id];
    });
    if (getEl('expense-moradores') && d.quantidadeMoradores) getEl('expense-moradores').value = d.quantidadeMoradores;

    const checkGastos = getEl('check-exibir-gastos'); 
    if (checkGastos && d.checkExibirGastos !== undefined) {
        checkGastos.checked = d.checkExibirGastos;
        const contentGastos = getEl('content-planilha-gastos'); 
        if (contentGastos) contentGastos.style.display = d.checkExibirGastos ? 'block' : 'none';
    }

    const moradores = parseInt(getEl('expense-moradores')?.value) || 1;
    let totalFamilia = 0, totalCrianca = 0;
    EXPENSE_CATEGORIES_COMUNS.forEach(c => { const el = getEl(`expense-${c.id}`); if (el) totalFamilia += parseCurrency(el.value); });
    EXPENSE_CATEGORIES_EXCLUSIVAS.forEach(c => { const el = getEl(`expense-${c.id}`); if (el) totalCrianca += parseCurrency(el.value); });

    const cotaFamilia = totalFamilia / moradores;
    if (getEl('subtotal-familia')) getEl('subtotal-familia').textContent = formatCurrency(cotaFamilia);
    if (getEl('subtotal-crianca')) getEl('subtotal-crianca').textContent = formatCurrency(totalCrianca);
    if (getEl('expense-total')) getEl('expense-total').textContent = formatCurrency(cotaFamilia + totalCrianca);
    updateSelectedCounter();
}

async function handleSave(closeModal = true) {
    ensureAssistedId();
    if (!currentAssistedId || !currentPautaId || !db) {
        showNotification("Erro: assistido não identificado. Feche e reabra o modal.", "error");
        return;
    }
    
    const container = getEl('checklist-container');
    const checkedIds = container ? Array.from(container.querySelectorAll('.doc-checkbox:checked')).map(cb => cb.id) : [];
    
    // Captura os novos campos socioeconômicos do Assistido
    const socioData = {
        ocupacao: document.getElementById('socio-ocupacao')?.value || '',
        profissao: document.getElementById('socio-profissao')?.value || '',
        estadoCivil: document.getElementById('socio-estado-civil')?.value || '',
        ganhos: document.getElementById('socio-ganhos')?.value || ''
    };
    
    const payload = {
        documentChecklist: {
            action: currentChecklistAction,
            checkedIds: checkedIds,
            docTypes: getDocTypesFromForm(),
            expenseData: getExpenseDataFromForm(),
            socioData: socioData
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
        console.error("Erro ao salvar:", e);
        showNotification("Falha ao salvar no banco", "error");
    }
}

async function handleReset() {
    if (!confirm("Deseja apagar as qualificações e o checklist atual?")) return;
    try {
        await updateDoc(doc(db, "pautas", currentPautaId, "attendances", currentAssistedId), { 
            documentChecklist: null, documentState: null, selectedAction: null, demandas: null 
        });
        window._lastOpenedAssistedId = null;
        currentChecklistAction = null;
        handleBack();
        showNotification("Triagem limpa.", "info");
    } catch (e) { showNotification("Erro ao limpar", "error"); }
}

function handleBack() {
    getEl('document-checklist-view')?.classList.add('hidden');
    getEl('document-checklist-view-header-actions')?.classList.add('hidden'); 
    getEl('checklist-search-container')?.classList.add('hidden');
    getEl('document-action-selection')?.classList.remove('hidden'); 
}

function closeAssistedDetailsModal() {
    getEl('assisted-details-modal').classList.add('hidden');
    currentAssistedId = null; currentPautaId = null; currentChecklistAction = null;
    window._lastOpenedAssistedId = null; 
    handleBack(); 
}

/* ========================================================
   7. GERADORES (TEXTO PARA PETIÇÃO E TABELA WORD/SEI)
   ======================================================== */

// ⭐ NOVO: FUNÇÃO PARA COPIAR A TABELA FORMATADA (HTML) PARA A ÁREA DE TRANSFERÊNCIA
window.copiarTabelaGastos = async () => {
    const dados = getExpenseDataFromForm();
    const nomeAssistido = document.getElementById('assisted-details-name')?.textContent || 'O Requerente';
    const qtdMoradores = parseInt(dados.quantidadeMoradores || 1);

    const limpaMoeda = (valStr) => {
        if (!valStr || valStr === 'R$ 0,00') return 0;
        return parseFloat(valStr.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
    };
    const formataMoeda = (valor) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);

    let linhasComuns = '';
    let totalFamilia = 0;
    
    EXPENSE_CATEGORIES_COMUNS.forEach(cat => {
        const val = limpaMoeda(dados[cat.id]);
        if (val > 0) {
            const cota = val / qtdMoradores;
            totalFamilia += cota;
            linhasComuns += `
                <tr>
                    <td style="border: 1px solid black; padding: 5px;">${cat.label}</td>
                    <td style="border: 1px solid black; padding: 5px; text-align: center;">R$ ${formataMoeda(val)}</td>
                    <td style="border: 1px solid black; padding: 5px; text-align: center;"><b>R$ ${formataMoeda(cota)}</b></td>
                </tr>`;
        }
    });

    let linhasExclusivas = '';
    let totalCrianca = 0;

    EXPENSE_CATEGORIES_EXCLUSIVAS.forEach(cat => {
        const val = limpaMoeda(dados[cat.id]);
        if (val > 0) {
            totalCrianca += val;
            linhasExclusivas += `
                <tr>
                    <td style="border: 1px solid black; padding: 5px;" colspan="2">${cat.label}</td>
                    <td style="border: 1px solid black; padding: 5px; text-align: center;"><b>R$ ${formataMoeda(val)}</b></td>
                </tr>`;
        }
    });

    const totalGeral = totalFamilia + totalCrianca;

    if (totalGeral === 0) {
        showNotification("Preencha a planilha antes de copiar.", "warning");
        return;
    }

    const tabelaHTML = `
        <table style="border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; font-size: 11pt; color: black;">
            <thead>
                <tr>
                    <th colspan="3" style="border: 1px solid black; padding: 8px; background-color: #f2f2f2; text-align: center;">
                        <b>DEMONSTRATIVO DE DESPESAS MENSAIS - ${nomeAssistido.toUpperCase()}</b>
                    </th>
                </tr>
                <tr>
                    <th style="border: 1px solid black; padding: 8px; text-align: left;">Descrição da Despesa</th>
                    <th style="border: 1px solid black; padding: 8px; text-align: center;">Valor Integral</th>
                    <th style="border: 1px solid black; padding: 8px; text-align: center;">Cota-Parte / Necessidade</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td colspan="3" style="border: 1px solid black; padding: 8px; background-color: #f9f9f9;">
                        <b>1. Despesas Residenciais Comuns (Rateio em ${qtdMoradores} partes)</b>
                    </td>
                </tr>
                ${linhasComuns || '<tr><td colspan="3" style="border: 1px solid black; padding: 5px; text-align: center;">Sem despesas comuns</td></tr>'}
                
                <tr>
                    <td colspan="3" style="border: 1px solid black; padding: 8px; background-color: #f9f9f9;">
                        <b>2. Despesas Exclusivas (Integral)</b>
                    </td>
                </tr>
                ${linhasExclusivas || '<tr><td colspan="3" style="border: 1px solid black; padding: 5px; text-align: center;">Sem despesas exclusivas</td></tr>'}
                
                <tr>
                    <td colspan="2" style="border: 1px solid black; padding: 8px; text-align: right;"><b>TOTAL DA NECESSIDADE MENSAL APURADA:</b></td>
                    <td style="border: 1px solid black; padding: 8px; text-align: center; background-color: #e6e6e6;"><b>R$ ${formataMoeda(totalGeral)}</b></td>
                </tr>
            </tbody>
        </table>
        <br>
    `;

    try {
        const blobHtml = new Blob([tabelaHTML], { type: "text/html" });
        const clipboardItem = new ClipboardItem({ "text/html": blobHtml });
        await navigator.clipboard.write([clipboardItem]);
        showNotification("Tabela copiada com sucesso! Cole (Ctrl+V) no Word ou SEI.", "success");
    } catch (err) {
        console.error('Falha ao copiar tabela: ', err);
        showNotification("O navegador bloqueou a cópia. Tente novamente.", "error");
    }
};

window.gerarTextoDespesas = (assistidoId) => {
    const assisted = allAssisted.find(a => a.id === assistidoId);
    if (!assisted || !assisted.documentChecklist || !assisted.documentChecklist.expenseData) {
        showNotification("Nenhuma despesa foi preenchida na triagem para este caso.", "error");
        return;
    }

    const g = assisted.documentChecklist.expenseData;
    const nomeAssistido = assisted.name ? assisted.name.split(' ')[0] : 'O requerente';
    const qtdMoradores = parseInt(g.quantidadeMoradores || 1);

    let gastosFamiliaHtml = ''; let gastosCriancaHtml = '';
    let totalFamilia = 0; let totalExclusivoCrianca = 0;

    const limpaMoeda = (valStr) => {
        if (!valStr || valStr === 'R$ 0,00') return 0;
        return parseFloat(valStr.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
    };
    const formataMoeda = (valor) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);

    EXPENSE_CATEGORIES_COMUNS.forEach(cat => {
        const val = limpaMoeda(g[cat.id]);
        if (val > 0) {
            const cota = val / qtdMoradores;
            totalFamilia += cota;
            gastosFamiliaHtml += `<li>${cat.label} (Total R$ ${formataMoeda(val)} / Cota: <b>R$ ${formataMoeda(cota)}</b>)</li>`;
        }
    });

    EXPENSE_CATEGORIES_EXCLUSIVAS.forEach(cat => {
        const val = limpaMoeda(g[cat.id]);
        if (val > 0) {
            totalExclusivoCrianca += val;
            gastosCriancaHtml += `<li>${cat.label} (Integral: <b>R$ ${formataMoeda(val)}</b>)</li>`;
        }
    });

    const totalFinal = totalFamilia + totalExclusivoCrianca;
    if (totalFinal === 0) { showNotification("Os valores de despesa estão zerados.", "warning"); return; }

    const textoGerado = `
Em relação às despesas mensais para a manutenção e subsistência de ${nomeAssistido}, o montante apurado corresponde a **R$ ${formataMoeda(totalFinal)}**.

O referido valor engloba tanto as despesas exclusivas quanto o rateio proporcional das despesas do núcleo familiar (composto por ${qtdMoradores} pessoas), divididas da seguinte forma:

**Cota-parte de Despesas Residenciais e Alimentares (Rateio de 1/${qtdMoradores}):**
<ul>
${gastosFamiliaHtml || '<li>Nenhuma despesa informada nesta categoria.</li>'}
</ul>
<i>Subtotal proporcional: R$ ${formataMoeda(totalFamilia)}</i>

**Despesas Exclusivas (100% da necessidade):**
<ul>
${gastosCriancaHtml || '<li>Nenhuma despesa informada nesta categoria.</li>'}
</ul>
<i>Subtotal exclusivo: R$ ${formataMoeda(totalExclusivoCrianca)}</i>
    `.trim();

    exibirModalCopia(textoGerado);
};

function exibirModalCopia(textoHtml) {
    const existing = document.getElementById('modal-texto-peticao');
    if (existing) existing.remove();

    const div = document.createElement('div');
    div.id = "modal-texto-peticao";
    div.className = "fixed inset-0 bg-slate-900/80 z-[100] flex items-center justify-center p-4 backdrop-blur-sm";
    div.innerHTML = `
        <div class="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div class="bg-indigo-600 p-4 text-white flex justify-between items-center">
                <h3 class="font-black uppercase tracking-wider text-sm flex items-center gap-2"><span>📑</span> Texto Base para Petição</h3>
                <button onclick="document.getElementById('modal-texto-peticao').remove()" class="text-indigo-200 hover:text-white text-2xl font-bold">&times;</button>
            </div>
            <div class="p-6">
                <p class="text-[10px] uppercase font-black text-slate-400 mb-2">Trecho Gerado Pelo Sistema</p>
                <div id="caixa-texto-copia" class="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm text-slate-700 leading-relaxed font-serif max-h-64 overflow-y-auto">${textoHtml}</div>
                <button id="btn-copiar-texto-peticao" class="mt-4 w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3.5 rounded-xl uppercase tracking-widest text-xs shadow-lg transition-all flex justify-center items-center gap-2">
                    <span>📋</span> Copiar para a Área de Transferência
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(div);

    document.getElementById('btn-copiar-texto-peticao').onclick = () => {
        const textoPuro = document.getElementById('caixa-texto-copia').innerText;
        navigator.clipboard.writeText(textoPuro).then(() => {
            const btn = document.getElementById('btn-copiar-texto-peticao');
            btn.innerHTML = "<span>✅</span> COPIADO COM SUCESSO!";
            btn.classList.replace('bg-emerald-600', 'bg-slate-800');
            setTimeout(() => document.getElementById('modal-texto-peticao').remove(), 1500);
        });
    };
}

/* ========================================================
   8. EXPORTS E INICIALIZAÇÃO
   ======================================================== */
export function setupDetailsModal(config) {
    db = config.db;
    getEl('close-assisted-details-modal-btn').onclick = closeAssistedDetailsModal;
    getEl('back-to-action-selection-btn').onclick = handleBack;
    getEl('save-checklist-btn').onclick = () => handleSave(true);
    getEl('reset-checklist-btn').onclick = handleReset;
    const btnCaptacao = getEl('btn-gerar-captacao'); if (btnCaptacao) btnCaptacao.onclick = gerarLinkCaptacao;
    
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
    currentAssistedId = config.assistedId; currentPautaId = config.pautaId;
    allAssisted = config.allAssisted || []; db = config.db || window.app?.db;
    
    _backupAssistedId = currentAssistedId; _backupPautaId = currentPautaId;
    window._lastOpenedAssistedId = currentAssistedId; window._lastOpenedPautaId = currentPautaId;
    
    try {
        const docSnap = await getDoc(doc(db, "pautas", currentPautaId, "attendances", currentAssistedId));
        if (docSnap.exists()) {
            const data = docSnap.data();
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
                try { await updateDoc(doc(db, "pautas", currentPautaId, "attendances", currentAssistedId), { "documentChecklist.action": key, documentState: 'filling' }); } catch (err) { console.error(err); }
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

// ⭐ EXPORTAÇÕES PARA O WINDOW (ACESSO GLOBAL)
window.openDetailsModal = openDetailsModal;
window.setupDetailsModal = setupDetailsModal;
window.documentsData = documentsData;
window.EXPENSE_CATEGORIES_COMUNS = EXPENSE_CATEGORIES_COMUNS;
window.EXPENSE_CATEGORIES_EXCLUSIVAS = EXPENSE_CATEGORIES_EXCLUSIVAS;
window.gerarLinkCaptacao = gerarLinkCaptacao;
window.gerarTextoDespesas = window.gerarTextoDespesas;
window.copiarTabelaGastos = window.copiarTabelaGastos;
