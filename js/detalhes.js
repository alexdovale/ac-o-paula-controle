O erro TypeError: undefined is not an object (evaluating 's.indexOf') acontece porque em algum lugar (muito provavelmente ao pesquisar assuntos, filtrar textos na barra de busca do checklist ou ao converter valores para string), o código tenta manipular uma variável nula ou indefinida.
Para resolver isso e ao mesmo tempo remover os botões de rádio ("bolinhas") duplicados do Perfil Socioeconômico dentro do modal de detalhes (mantendo apenas o campo de seleção limpo), preparei as correções exatas para o seu ficheiro detalhes.js.
O que foi corrigido no detalhes.js:
 * Blindagem anti-undefined (normalizeLocal): Agora a função trata qualquer tipo de dado inesperado (nulo, indefinido ou objectos) sem nunca quebrar a aplicação com erros de indexOf.
 * Remoção das "bolinhas" do Perfil Socioeconômico: Limpamos o trecho de renderização do formulário socioeconômico em detalhes.js para remover os botões de rádio antigos (como os de fonte de renda), mantendo um layout limpo em grade.
Código Completo Atualizado e Blindado (detalhes.js):
Substitua todo o conteúdo do seu ficheiro detalhes.js por este código corrigido:
/**
 * ========================================================
 * DETALHES.JS - SIGEP (VISUAL REORGANIZADO & BLINDADO)
 * Detalhes do Assistido, Checklist de Documentos, Captação Direta,
 * Gerador de Texto e Planilha de Gastos.
 * ========================================================
 */

import { doc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showNotification, escapeHTML } from './utils.js';
import { flatSubjects } from './assuntos.js';
import { PDFService } from './pdfService.js';

import { ico, icoFrom } from './icons.js';
/* ========================================================
   CÉREBRO DE DETECÇÃO DE ASSUNTO
   ======================================================== */
function descobrirAssuntoInteligente(assuntoTexto) {
    if (!assuntoTexto) return null;
    const txt = String(assuntoTexto).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    if (txt.includes('alimento') || txt.includes('pensao') || txt.includes('oferta') || txt.includes('exoneracao') || txt.includes('revisao')) {
        if (txt.includes('gravidic') || txt.includes('gestante')) return 'alimentos_gravidicos';
        if (txt.includes('avo') || txt.includes('avoeng')) return 'alimentos_avoengos';
        return 'alimentos_fixacao_majoracao_oferta';
    }
    if (txt.includes('divorcio') || txt.includes('separacao')) {
        if (txt.includes('consensual') || txt.includes('amigavel') || txt.includes('acordo')) return 'divorcio_consensual';
        return 'divorcio_litigioso';
    }
    if (txt.includes('uniao estavel') || txt.includes('companheir')) return 'uniao_estavel';
    if (txt.includes('guarda')) return 'guarda';
    if (txt.includes('visita') || txt.includes('convivencia')) return 'regulamentacao_convivencia';
    if (txt.includes('paternidade') || txt.includes('maternidade') || txt.includes('dna') || txt.includes('reconhecimento')) return 'investigacao_paternidade';
    if (txt.includes('obrigacao de fazer') || txt.includes('medicamento') || txt.includes('saude') || txt.includes('cirurgia') || txt.includes('internacao')) return 'obrigacao_fazer';
    if (txt.includes('indenizacao') || txt.includes('dano') || txt.includes('moral') || txt.includes('material')) return 'indenizacao_danos';
    if (txt.includes('curatela') || txt.includes('interdicao') || txt.includes('tmo') || txt.includes('curador')) return 'curatela';
    if (txt.includes('retificacao') || txt.includes('registro civil') || txt.includes('nome') || txt.includes('certidao')) return 'retificacao_registro_civil';
    if (txt.includes('alvara') || txt.includes('residuos') || txt.includes('levantamento')) return 'alvara_valores';
    if (txt.includes('vaga') && (txt.includes('escola') || txt.includes('creche') || txt.includes('matricula'))) return 'vaga_escola_creche';
    return null;
}

/* ========================================================
   1. CONSTANTES E CONFIGURAÇÕES DE DOCUMENTOS
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
    'alimentos_fixacao_majoracao_oferta', 'alimentos_gravidicos', 'alimentos_avoengos',
    'investigacao_paternidade', 'guarda'
];

const ACTIONS_WITH_WORK_INFO = [
    'obrigacao_fazer', 'declaratoria_nulidade', 'indenizacao_danos', 'revisional_debito',
    'exigir_contas', 'alimentos_fixacao_majoracao_oferta', 'alimentos_gravidicos',
    'alimentos_avoengos', 'divorcio_litigioso', 'uniao_estavel', 'guarda',
    'regulamentacao_convivencia', 'investigacao_paternidade'
];

const OCUPACOES = [
    'Empregado com vínculo (CLT)', 'Empregado sem vínculo (Informal)', 'Autônomo',
    'Aposentado', 'Do lar', 'Pensionista', 'Beneficiário do INSS (BPC/LOAS)',
    'Desempregado', 'Estudante'
];

const OCUPACOES_COM_PROFISSAO = ['Empregado com vínculo (CLT)', 'Empregado sem vínculo (Informal)', 'Autônomo'];
const ESTADOS_CIVIS = ['Solteiro(a)', 'Casado(a)', 'União Estável', 'Divorciado(a)', 'Viúvo(a)', 'Separado(a)'];

const ICONES_ACAO = {
    obrigacao_fazer: 'building', declaratoria_nulidade: 'fileText', indenizacao_danos: 'zap', revisional_debito: 'landmark',
    exigir_contas: 'fileText', alimentos_fixacao_majoracao_oferta: 'baby', alimentos_gravidicos: 'heart',
    alimentos_avoengos: 'user', divorcio_consensual: 'userPlus', divorcio_litigioso: 'scale', uniao_estavel: 'heart',
    guarda: 'baby', regulamentacao_convivencia: 'clock', investigacao_paternidade: 'userCheck', curatela: 'shield',
    retificacao_registro_civil: 'pencil', alvara_valores: 'coins', vaga_escola_creche: 'building'
};

/* ========================================================
   2. BASE DE DADOS DE AÇÕES
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
   3. ESTADO GLOBAL E UTILITÁRIOS (BLINDADOS)
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

const normalizeLocal = (str) => {
    if (!str) return '';
    try {
        const texto = typeof str === 'object' ? (str.text || str.title || JSON.stringify(str)) : String(str);
        return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    } catch (e) {
        return '';
    }
};

function formatCurrency(v) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function parseCurrency(s) {
    if (!s) return 0;
    return parseFloat(String(s).replace(/[^\d,]/g, '').replace(',', '.')) || 0;
}

const mascaraMoeda = (e) => {
    const v = e.target.value.replace(/\D/g, '');
    e.target.value = v ? (Number(v) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';
};
const mascaraCPF = (e) => {
    const v = e.target.value.replace(/\D/g, '').slice(0, 11);
    e.target.value = v.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
};
const mascaraTelefone = (e) => {
    const v = e.target.value.replace(/\D/g, '').slice(0, 11);
    e.target.value = v.length > 10 ? v.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
        : v.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').replace(/-$/, '');
};
const mascaraCEP = (e) => {
    const v = e.target.value.replace(/\D/g, '').slice(0, 8);
    e.target.value = v.length > 5 ? v.replace(/(\d{5})(\d{1,3})/, '$1-$2') : v;
};

const INPUT_CLS = 'w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition';
const LABEL_CLS = 'block text-[11px] font-bold text-slate-500 mb-1';

const campo = (id, label, { placeholder = '', maxlength = '', inputmode = '', span = '' } = {}) => `
    <div class="${span}">
        <label for="${id}" class="${LABEL_CLS}">${label}</label>
        <input type="text" id="${id}" ${placeholder ? `placeholder="${placeholder}"` : ''} ${maxlength ? `maxlength="${maxlength}"` : ''} ${inputmode ? `inputmode="${inputmode}"` : ''} class="${INPUT_CLS}">
    </div>`;

const seletor = (id, label, opcoes, { span = '', primeira = 'Selecione' } = {}) => `
    <div class="${span}">
        <label for="${id}" class="${LABEL_CLS}">${label}</label>
        <select id="${id}" class="${INPUT_CLS}">
            <option value="">${primeira}</option>
            ${opcoes.map(o => `<option value="${o}">${o}</option>`).join('')}
        </select>
    </div>`;

const naoSeiCheck = (id) => `
    <label class="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 cursor-pointer whitespace-nowrap select-none">
        <input type="checkbox" id="${id}" class="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600"> Não sei informar
    </label>`;

const cartaoSecao = (titulo, icone, corpo, tom = 'slate') => {
    const tons = {
        slate: 'border-slate-200 bg-white', red: 'border-red-200 bg-red-50/40',
        blue: 'border-sky-200 bg-sky-50/40', green: 'border-emerald-200 bg-emerald-50/40'
    };
    return `
        <section class="mb-5 rounded-2xl border ${tons[tom]} shadow-sm overflow-hidden">
            <header class="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                <span class="text-slate-500">${icoFrom(icone, 'w-4 h-4')}</span>
                <h4 class="text-xs font-black text-slate-700 uppercase tracking-wide">${titulo}</h4>
            </header>
            <div class="p-4">${corpo}</div>
        </section>`;
};

/* ========================================================
   3.1 LINK DE CAPTAÇÃO
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
        await updateDoc(doc(db, "pautas", pautaId, "attendances", assistidoId), { delegationToken: tokenSeguranca });

        let path = window.location.pathname;
        path = path.replace('index.html', '');
        if (!path.endsWith('/')) path += '/';

        const link = `${window.location.origin}${path}captacao.html?pid=${pautaId}&aid=${assistidoId}&token=${tokenSeguranca}`;

        const assisted = allAssisted.find(a => a.id === assistidoId);
        const nome = assisted?.name ? assisted.name.split(' ')[0] : 'assistido(a)';
        const mensagem = encodeURIComponent(`Olá, ${nome}! Clique aqui para preencher seus dados preliminares:\n\n${link}`);

        await navigator.clipboard.writeText(link);
        showNotification("Link seguro gerado e copiado!", "success");

        const modalQr = document.getElementById('modal-captacao-qr');
        const qrContainer = document.getElementById('qrcode-display');

        if (modalQr && qrContainer) {
            modalQr.classList.remove('hidden');
            qrContainer.innerHTML = "";
            new QRCode(qrContainer, { text: link, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.H });

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
   4. CHECKLIST, PROGRESSO E DEMANDAS ADICIONAIS
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

    const todos = container.querySelectorAll('.doc-checkbox').length;
    const marcados = container.querySelectorAll('.doc-checkbox:checked').length;
    const reuCheck = document.getElementById('check-reu-unico')?.checked ? 1 : 0;
    const gastosCheck = document.getElementById('check-exibir-gastos')?.checked ? 1 : 0;
    const totalChecked = marcados + reuCheck + gastosCheck + demandasAdicionaisLocais.length;

    const counterEl = getEl('checklist-counter');
    if (counterEl) counterEl.textContent = `${totalChecked} itens selecionados no SIGEP`;

    const pct = todos > 0 ? Math.round((marcados / todos) * 100) : 0;
    const label = getEl('progress-label');
    const pctEl = getEl('progress-pct');
    const bar = getEl('progress-bar');
    if (label) label.textContent = `${marcados} de ${todos} documentos recebidos`;
    if (pctEl) pctEl.textContent = `${pct}%`;
    if (bar) bar.style.width = `${pct}%`;

    container.querySelectorAll('[data-section-block]').forEach(sec => {
        const t = sec.querySelectorAll('.doc-checkbox').length;
        const c = sec.querySelectorAll('.doc-checkbox:checked').length;
        const el = sec.querySelector('.section-count');
        if (el) {
            el.textContent = `${c}/${t}`;
            el.classList.toggle('text-emerald-600', t > 0 && c === t);
            el.classList.toggle('bg-emerald-100', t > 0 && c === t);
            el.classList.toggle('text-slate-500', !(t > 0 && c === t));
            el.classList.toggle('bg-slate-100', !(t > 0 && c === t));
        }
    });

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
    if (ACTIONS_WITH_WORK_INFO.includes(currentChecklistAction)) {
        reuArea.classList.remove('hidden');
        if (reuArea.children.length === 0 || reuArea.innerHTML.trim() === '') renderReuForm('address-editor-container');
    } else {
        reuArea.classList.add('hidden');
    }
}

function injectDemandasAdicionaisInterface(containerEl) {
    let divDemanda = document.getElementById('secao-demandas-adicionais-triagem');
    if (!divDemanda) {
        divDemanda = document.createElement('div');
        divDemanda.id = 'secao-demandas-adicionais-triagem';
        divDemanda.className = 'mt-5 p-4 bg-violet-50 border border-violet-200 rounded-2xl shadow-sm';
        containerEl.appendChild(divDemanda);
    }

    divDemanda.innerHTML = `
        <h4 class="text-xs font-black text-violet-700 uppercase tracking-wide mb-1 flex items-center gap-2"><span>${ico('scale', 'w-3.5 h-3.5')}</span> Casos acumulados no atendimento</h4>
        <p class="text-[11px] text-violet-500 mb-3">Some outras demandas do mesmo assistido para que entrem nas estatísticas.</p>
        <div class="flex gap-2 mb-3">
            <input type="text" id="input-nova-demanda-triagem" list="subjects-list-triagem-dinamico" class="flex-grow px-3 py-2.5 border border-violet-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-violet-500" placeholder="Busque ou digite uma demanda...">
            <datalist id="subjects-list-triagem-dinamico"></datalist>
            <button type="button" id="btn-add-demanda-triagem" class="bg-violet-600 text-white font-bold px-4 py-2 rounded-lg text-xs hover:bg-violet-700 uppercase transition shadow-sm">Somar</button>
        </div>
        <div id="lista-demandas-triagem-container" class="flex flex-wrap gap-2"></div>
    `;

    const datalist = divDemanda.querySelector('#subjects-list-triagem-dinamico');
    if (datalist && Array.isArray(flatSubjects)) {
        flatSubjects.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.value;
            datalist.appendChild(opt);
        });
    }

    const adicionar = () => {
        const input = document.getElementById('input-nova-demanda-triagem');
        let text = input ? input.value.trim() : '';
        if (!text) return;
        if (text.includes(' > ')) text = text.split(' > ').pop();
        demandasAdicionaisLocais.push(text);
        input.value = '';
        renderListaDemandasTriagem();
        updateSelectedCounter();
    };
    document.getElementById('btn-add-demanda-triagem').onclick = adicionar;
    document.getElementById('input-nova-demanda-triagem').onkeydown = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); adicionar(); }
    };

    renderListaDemandasTriagem();
}

function renderListaDemandasTriagem() {
    const container = document.getElementById('lista-demandas-triagem-container');
    if (!container) return;
    container.innerHTML = '';

    if (demandasAdicionaisLocais.length === 0) {
        container.innerHTML = '<p class="w-full text-[11px] text-slate-400 italic text-center py-2 bg-white rounded-lg border border-dashed border-violet-200">Nenhuma demanda extra cadastrada.</p>';
        return;
    }

    demandasAdicionaisLocais.forEach((dem, idx) => {
        const chip = document.createElement('span');
        chip.className = 'inline-flex items-center gap-1.5 bg-white border border-violet-200 text-violet-800 text-xs font-bold pl-3 pr-1.5 py-1 rounded-full shadow-sm';
        chip.innerHTML = `${escapeHTML(dem)} <button type="button" class="w-5 h-5 rounded-full text-red-500 hover:bg-red-100 leading-none" title="Remover" aria-label="Remover demanda">×</button>`;
        chip.querySelector('button').onclick = () => {
            demandasAdicionaisLocais.splice(idx, 1);
            renderListaDemandasTriagem();
            updateSelectedCounter();
        };
        container.appendChild(chip);
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

    const progress = document.createElement('div');
    progress.id = 'checklist-progress-card';
    progress.className = 'sticky top-0 z-10 mb-4 p-3 bg-white/95 backdrop-blur border border-slate-200 rounded-xl shadow-sm';
    progress.innerHTML = `
        <div class="flex items-center justify-between text-xs font-bold text-slate-600 mb-1.5">
            <span id="progress-label">0 documentos recebidos</span>
            <span id="progress-pct" class="text-emerald-600">0%</span>
        </div>
        <div class="h-2 bg-slate-100 rounded-full overflow-hidden"><div id="progress-bar" class="h-full bg-emerald-500 rounded-full transition-all duration-300" style="width:0%"></div></div>`;
    containerEl.appendChild(progress);

    const ASSUNTOS_PENSAO = [
        'alimentos_fixacao_majoracao_oferta', 'alimentos_gravidicos', 'alimentos_avoengos',
        'divorcio_consensual', 'divorcio_litigioso', 'investigacao_paternidade', 'guarda'
    ];
    const isLinkDoCidadao = window.location.pathname.includes('captacao');

    if (ASSUNTOS_PENSAO.includes(actionKey) && !isLinkDoCidadao) {
        const calc = document.createElement('button');
        calc.type = 'button';
        calc.className = 'w-full mb-5 p-4 bg-gradient-to-r from-indigo-50 to-white border border-indigo-200 rounded-2xl flex items-center justify-between text-left shadow-sm hover:shadow-md hover:border-indigo-300 transition group';
        calc.onclick = () => window.gerarTextoDespesas(currentAssistedId);
        calc.innerHTML = `
            <span>
                <span class="block font-black text-indigo-800 text-xs sm:text-sm uppercase">${ico('calculator', 'w-3.5 h-3.5')} Gerador de texto para petição</span>
                <span class="block text-[11px] sm:text-xs text-indigo-600 mt-1 font-medium">Usa os gastos apurados e cria um texto pronto para o Word/SEI.</span>
            </span>
            <span class="bg-indigo-600 text-white w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ml-3 group-hover:scale-105 transition">${ico('fileText')}</span>`;
        containerEl.appendChild(calc);
    }

    const socioSection = document.createElement('div');
    socioSection.innerHTML = cartaoSecao('Dados socioeconômicos do assistido', 'user', `
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
            ${seletor('socio-ocupacao', 'Ocupação', OCUPACOES, { primeira: 'Selecione a ocupação' })}
            <div id="socio-profissao-container" class="hidden">
                <label for="socio-profissao" class="${LABEL_CLS}">Profissão / cargo</label>
                <input type="text" id="socio-profissao" placeholder="Digite a profissão ou cargo" class="${INPUT_CLS}">
            </div>
            ${seletor('socio-estado-civil', 'Estado civil', ESTADOS_CIVIS)}
            <div>
                <label for="socio-ganhos" class="${LABEL_CLS}">Renda familiar (R$)</label>
                <input type="text" id="socio-ganhos" placeholder="R$ 0,00" inputmode="numeric" class="${INPUT_CLS}">
            </div>
        </div>
    `);
    containerEl.appendChild(socioSection.firstElementChild);

    const ocupacaoSelect = containerEl.querySelector('#socio-ocupacao');
    const profissaoContainer = containerEl.querySelector('#socio-profissao-container');
    const profissaoInput = containerEl.querySelector('#socio-profissao');

    const checkProfissaoVisibility = () => {
        if (OCUPACOES_COM_PROFISSAO.includes(ocupacaoSelect.value)) {
            profissaoContainer.classList.remove('hidden');
        } else {
            profissaoContainer.classList.add('hidden');
            profissaoInput.value = '';
        }
    };
    ocupacaoSelect.addEventListener('change', checkProfissaoVisibility);
    containerEl.querySelector('#socio-ganhos').addEventListener('input', mascaraMoeda);

    if (saved?.socioData) {
        const s = saved.socioData;
        if (s.ocupacao) ocupacaoSelect.value = s.ocupacao;
        if (s.profissao) profissaoInput.value = s.profissao;
        if (s.estadoCivil) getEl('socio-estado-civil').value = s.estadoCivil;
        if (s.ganhos) getEl('socio-ganhos').value = s.ganhos;
    }
    if (OCUPACOES_COM_PROFISSAO.includes(ocupacaoSelect.value)) profissaoContainer.classList.remove('hidden');

    data.sections.forEach((section, sIdx) => {
        const sec = document.createElement('section');
        sec.setAttribute('data-section-block', '');
        sec.className = 'mb-5 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden';
        sec.innerHTML = `
            <header class="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
                <h4 class="text-xs font-black text-slate-700 uppercase tracking-wide">${section.title}</h4>
                <span class="section-count text-[11px] font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">0/0</span>
            </header>
            <ul class="p-2 space-y-0.5"></ul>`;
        const ul = sec.querySelector('ul');

        section.docs.forEach((docItem, dIdx) => {
            const li = document.createElement('li');
            if (typeof docItem === 'object' && docItem.type === 'title') {
                li.innerHTML = `<div class="mt-3 mb-1 mx-1 px-3 py-1.5 text-[10px] font-black uppercase tracking-tight text-sky-700 bg-sky-50 rounded-md border border-sky-100">${docItem.text}</div>`;
            } else {
                const docText = typeof docItem === 'string' ? docItem : docItem.text;
                const id = `doc-${actionKey}-${sIdx}-${dIdx}`;
                const isChecked = saved?.checkedIds?.includes(id);
                const savedType = saved?.docTypes ? saved.docTypes[id] : 'Físico';

                li.innerHTML = `
                    <div class="flex flex-col border-b border-slate-50">
                        <label class="checklist-row flex items-center gap-3 w-full cursor-pointer px-3 py-2.5 rounded-lg transition-colors hover:bg-slate-50 ${isChecked ? 'bg-emerald-50' : ''}">
                            <input type="checkbox" id="${id}" class="doc-checkbox h-5 w-5 shrink-0 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" ${isChecked ? 'checked' : ''}>
                            <span class="text-sm text-slate-700 font-medium">${docText}</span>
                        </label>
                        <div id="type-${id}" class="ml-11 mb-2 ${isChecked ? '' : 'hidden'}">
                            <div class="inline-flex rounded-lg bg-slate-100 p-0.5">
                                <label class="cursor-pointer">
                                    <input type="radio" name="type-${id}" value="Físico" class="peer sr-only" ${savedType !== 'Digital' ? 'checked' : ''}>
                                    <span class="block px-3 py-1 rounded-md text-[10px] font-black text-slate-500 peer-checked:bg-white peer-checked:text-emerald-700 peer-checked:shadow transition">${ico('fileText', 'w-3 h-3')} FÍSICO</span>
                                </label>
                                <label class="cursor-pointer">
                                    <input type="radio" name="type-${id}" value="Digital" class="peer sr-only" ${savedType === 'Digital' ? 'checked' : ''}>
                                    <span class="block px-3 py-1 rounded-md text-[10px] font-black text-slate-500 peer-checked:bg-white peer-checked:text-sky-700 peer-checked:shadow transition">${ico('smartphone', 'w-3 h-3')} DIGITAL</span>
                                </label>
                            </div>
                        </div>
                    </div>`;
            }
            ul.appendChild(li);
        });
        containerEl.appendChild(sec);
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
    expenseButton.className = 'mt-4 p-4 bg-white border border-dashed border-emerald-300 rounded-2xl text-center';
    expenseButton.id = 'expense-button-container';
    expenseButton.innerHTML = `<button id="btn-abrir-gastos" type="button" class="bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-emerald-700 shadow-sm transition">${ico('coins')} Adicionar planilha de gastos</button>`;
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
            e.target.closest('label')?.classList.toggle('bg-emerald-50', e.target.checked);
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
   5. FORMULÁRIO DO RÉU
   ======================================================== */
function renderUfOptions() {
    const ufs = ['RJ', 'SP', 'MG', 'ES', 'PR', 'SC', 'RS', 'BA', 'CE', 'PE', 'DF', 'GO', 'MT', 'MS', 'AM', 'PA', 'AC', 'AL', 'AP', 'MA', 'PB', 'PI', 'RN', 'RO', 'RR', 'SE', 'TO'];
    return '<option value="">UF</option>' + ufs.map(uf => `<option value="${uf}">${uf}</option>`).join('');
}

const ufSelect = (id) => `
    <div>
        <label for="${id}" class="${LABEL_CLS}">Estado</label>
        <select id="${id}" class="${INPUT_CLS}">${renderUfOptions()}</select>
    </div>`;

function renderReuForm(containerId) {
    const container = getEl(containerId);
    if (!container) return;

    container.innerHTML = `
        <div class="mt-6 rounded-2xl border-2 border-red-200 bg-red-50/50 shadow-sm overflow-hidden">
            <div class="px-4 py-3 bg-red-600 text-white flex flex-wrap items-center justify-between gap-2">
                <h3 class="text-sm font-black uppercase tracking-wide flex items-center gap-2">${ico('home')} Dados da parte contrária (réu)</h3>
                <label for="check-reu-unico" class="flex items-center gap-2 text-xs font-bold cursor-pointer bg-white/15 px-3 py-1.5 rounded-lg hover:bg-white/25 transition">
                    <input type="checkbox" id="check-reu-unico" class="h-4 w-4 rounded border-white text-red-600 focus:ring-white" checked>
                    Incluir no checklist
                </label>
            </div>

            <div id="content-reu-completo" class="p-4 space-y-4">
                ${cartaoSecao('1. Identificação', 'idCard', `
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                        ${campo('nome-reu', 'Nome completo', { placeholder: 'Nome completo do réu', span: 'md:col-span-2' })}
                        ${campo('cpf-reu', 'CPF', { placeholder: '000.000.000-00', maxlength: 14, inputmode: 'numeric' })}
                        ${campo('telefone-reu', 'Telefone', { placeholder: '(21) 99999-9999', maxlength: 15, inputmode: 'tel' })}
                    </div>`)}

                ${cartaoSecao('2. Endereço residencial', 'mapPin', `
                    <div class="grid grid-cols-1 md:grid-cols-6 gap-3">
                        <div class="md:col-span-2">
                            <label for="cep-reu" class="${LABEL_CLS}">CEP</label>
                            <div class="flex">
                                <input type="text" id="cep-reu" maxlength="9" placeholder="00000-000" inputmode="numeric" class="${INPUT_CLS} rounded-r-none">
                                <button type="button" id="buscar-cep-reu-btn" class="bg-red-600 hover:bg-red-700 text-white px-3 rounded-r-lg text-xs font-bold transition">Buscar</button>
                            </div>
                        </div>
                        ${campo('rua-reu', 'Logradouro', { span: 'md:col-span-4' })}
                        ${campo('numero-reu', 'Número', { span: 'md:col-span-2' })}
                        ${campo('complemento-reu', 'Complemento', { span: 'md:col-span-4' })}
                        ${campo('bairro-reu', 'Bairro', { span: 'md:col-span-3' })}
                        ${campo('cidade-reu', 'Cidade', { span: 'md:col-span-2' })}
                        <div class="md:col-span-1">${ufSelect('estado-reu')}</div>
                        ${campo('referencia-reu', 'Ponto de referência', { span: 'md:col-span-6' })}
                    </div>`, 'red')}

                ${cartaoSecao('3. Dados de trabalho', 'building', `
                    <div class="grid grid-cols-1 md:grid-cols-6 gap-3">
                        ${campo('empresa-reu', 'Empresa', { span: 'md:col-span-6' })}
                        ${campo('rua-comercial-reu', 'Logradouro comercial', { span: 'md:col-span-6' })}
                        ${campo('numero-comercial-reu', 'Número', { span: 'md:col-span-2' })}
                        ${campo('complemento-comercial-reu', 'Complemento', { span: 'md:col-span-4' })}
                        ${campo('bairro-comercial-reu', 'Bairro', { span: 'md:col-span-3' })}
                        ${campo('cidade-comercial-reu', 'Cidade', { span: 'md:col-span-2' })}
                        <div class="md:col-span-1">${ufSelect('estado-comercial-reu')}</div>
                        <div class="md:col-span-6">
                            <label for="cep-comercial-reu" class="${LABEL_CLS}">CEP comercial</label>
                            <div class="flex md:max-w-xs">
                                <input type="text" id="cep-comercial-reu" placeholder="00000-000" maxlength="9" inputmode="numeric" class="${INPUT_CLS} rounded-r-none">
                                <button type="button" id="buscar-cep-comercial-reu-btn" class="bg-slate-600 hover:bg-slate-700 text-white px-3 rounded-r-lg text-xs font-bold transition whitespace-nowrap">Buscar</button>
                            </div>
                        </div>
                    </div>`)}

                ${cartaoSecao('4. Perfil socioeconômico', 'chart', `
                    <div class="space-y-4">
                        <div>
                            <label for="reu-ocupacao" class="${LABEL_CLS}">Ocupação</label>
                            <div class="flex flex-wrap gap-2 items-center">
                                <select id="reu-ocupacao" class="${INPUT_CLS} flex-1 min-w-[180px]">
                                    <option value="">Selecione</option>
                                    ${OCUPACOES.map(o => `<option value="${o}">${o}</option>`).join('')}
                                </select>
                                ${naoSeiCheck('reu-ocupacao-nao-sei')}
                            </div>
                        </div>
                        <div id="reu-profissao-container" class="hidden">
                            <label for="reu-profissao" class="${LABEL_CLS}">Profissão</label>
                            <div class="flex flex-wrap gap-2 items-center">
                                <input type="text" id="reu-profissao" placeholder="Digite a profissão" class="${INPUT_CLS} flex-1 min-w-[180px]">
                                ${naoSeiCheck('reu-profissao-nao-sei')}
                            </div>
                        </div>
                        <div>
                            <label for="reu-estado-civil" class="${LABEL_CLS}">Estado civil</label>
                            <div class="flex flex-wrap gap-2 items-center">
                                <select id="reu-estado-civil" class="${INPUT_CLS} flex-1 min-w-[180px]">
                                    <option value="">Selecione</option>
                                    ${ESTADOS_CIVIS.map(o => `<option value="${o}">${o}</option>`).join('')}
                                </select>
                                ${naoSeiCheck('reu-estado-civil-nao-sei')}
                            </div>
                        </div>
                        <div>
                            <label for="reu-ganhos" class="${LABEL_CLS}">Ganhos líquidos mensais (R$)</label>
                            <div class="flex flex-wrap gap-2 items-center mb-2">
                                <input type="text" id="reu-ganhos" placeholder="R$ 0,00" inputmode="numeric" class="${INPUT_CLS} flex-1 min-w-[180px]">
                                ${naoSeiCheck('reu-ganhos-nao-sei')}
                            </div>
                        </div>
                    </div>`, 'blue')}

                <div class="text-right">
                    <button type="button" id="salvar-reu-btn" class="bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 px-5 rounded-xl text-xs uppercase shadow-sm transition">${ico('save', 'w-3.5 h-3.5')} Salvar dados do réu</button>
                </div>
            </div>
        </div>
    `;

    initReuUnicoCheckbox();
    initCepSearch();
    initReuSaveButton();
    initReuSocioeconomicoEvents();

    getEl('cpf-reu')?.addEventListener('input', mascaraCPF);
    getEl('telefone-reu')?.addEventListener('input', mascaraTelefone);
    getEl('cep-reu')?.addEventListener('input', mascaraCEP);
    getEl('cep-comercial-reu')?.addEventListener('input', mascaraCEP);
}

function initReuUnicoCheckbox() {
    const checkUnico = getEl('check-reu-unico');
    const contentCompleto = getEl('content-reu-completo');
    if (checkUnico && contentCompleto) {
        checkUnico.addEventListener('change', function () {
            contentCompleto.style.display = this.checked ? 'block' : 'none';
            updateSelectedCounter();
        });
    }
}

function initCepSearch() {
    async function buscarCEP(cep, tipo = 'residencial') {
        const val = cep.replace(/\D/g, '');
        if (val.length !== 8) return;
        try {
            const response = await fetch(`https://viacep.com.br/ws/${val}/json/`);
            const r = await response.json();
            if (r.erro) {
                showNotification("CEP não encontrado.", "warning");
                return;
            }
            const sufixo = tipo === 'residencial' ? '' : 'comercial-';
            const set = (id, v) => { const el = getEl(id); if (el) el.value = v || ''; };
            if (tipo === 'residencial') {
                set('rua-reu', r.logradouro); set('bairro-reu', r.bairro); set('cidade-reu', r.localidade); set('estado-reu', r.uf);
            } else {
                set(`rua-${sufixo}reu`, r.logradouro); set(`bairro-${sufixo}reu`, r.bairro); set(`cidade-${sufixo}reu`, r.localidade); set(`estado-${sufixo}reu`, r.uf);
            }
            showNotification("Endereço sincronizado no SIGEP!", "success");
        } catch (error) {
            showNotification("Erro na busca do CEP", "error");
        }
    }

    const cepInp = getEl('cep-reu');
    const buscarBtn = getEl('buscar-cep-reu-btn');
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

function initReuSocioeconomicoEvents() {
    const ganhosInput = document.getElementById('reu-ganhos');
    if (ganhosInput) ganhosInput.addEventListener('input', mascaraMoeda);

    const reuOcupacaoSelect = document.getElementById('reu-ocupacao');
    const reuProfissaoContainer = document.getElementById('reu-profissao-container');
    const reuProfissaoInput = document.getElementById('reu-profissao');

    if (reuOcupacaoSelect && reuProfissaoContainer) {
        const check = () => {
            if (OCUPACOES_COM_PROFISSAO.includes(reuOcupacaoSelect.value)) {
                reuProfissaoContainer.classList.remove('hidden');
            } else {
                reuProfissaoContainer.classList.add('hidden');
                if (reuProfissaoInput) reuProfissaoInput.value = '';
            }
        };
        reuOcupacaoSelect.addEventListener('change', check);
        check();
    }

    const ligarNaoSei = (checkId, campoEl, { esconde } = {}) => {
        const chk = document.getElementById(checkId);
        if (!chk || !campoEl) return;
        chk.addEventListener('change', (e) => {
            campoEl.disabled = e.target.checked;
            campoEl.value = e.target.checked ? 'Não informado' : '';
            if (esconde && e.target.checked) esconde.classList.add('hidden');
        });
    };
    ligarNaoSei('reu-ocupacao-nao-sei', reuOcupacaoSelect, { esconde: reuProfissaoContainer });
    ligarNaoSei('reu-profissao-nao-sei', reuProfissaoInput);
    ligarNaoSei('reu-estado-civil-nao-sei', document.getElementById('reu-estado-civil'));
    ligarNaoSei('reu-ganhos-nao-sei', ganhosInput);
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
   6. PLANILHA DE GASTOS COM RATEIO AUTOMÁTICO
   ======================================================== */
function renderExpenseTable() {
    const div = document.createElement('div');
    div.className = 'mt-5 rounded-2xl border border-emerald-200 bg-emerald-50/40 shadow-sm overflow-hidden';
    div.id = 'expense-table';

    const linha = (c, tom) => {
        const t = tom === 'verde'
            ? 'border-emerald-100 focus:ring-emerald-500 focus:border-emerald-500'
            : 'border-sky-100 focus:ring-sky-500 focus:border-sky-500';
        return `
            <div class="flex items-center justify-between gap-3 bg-white p-2.5 rounded-xl border ${tom === 'verde' ? 'border-emerald-100' : 'border-sky-100'}">
                <label for="expense-${c.id}" class="flex-1 min-w-0">
                    <span class="block text-[12px] font-bold text-slate-700 truncate">${c.label}</span>
                    <span class="block text-[10px] text-slate-400">${c.desc}</span>
                </label>
                <input type="text" id="expense-${c.id}" class="expense-input w-32 shrink-0 px-2.5 py-2 bg-slate-50 border ${t} rounded-lg text-right text-xs font-bold outline-none focus:ring-2" placeholder="R$ 0,00" inputmode="numeric">
            </div>`;
    };

    div.innerHTML = `
        <div class="px-4 py-3 bg-emerald-600 text-white flex items-center justify-between gap-2">
            <label for="check-exibir-gastos" class="flex items-center gap-2 text-sm font-black uppercase cursor-pointer">
                <input type="checkbox" id="check-exibir-gastos" class="h-4 w-4 rounded border-white text-emerald-700 focus:ring-white" checked>
                ${ico('coins')} Planilha de gastos com rateio
            </label>
            <button id="fechar-gastos" type="button" class="text-[11px] font-bold bg-white/15 hover:bg-white/25 px-2.5 py-1 rounded-lg transition">Fechar</button>
        </div>
        <div id="content-planilha-gastos" class="p-4">
            <div class="mb-4 bg-white p-3 rounded-xl border border-emerald-200 flex items-center justify-between gap-3">
                <div>
                    <p class="text-xs font-black text-slate-700 uppercase">Pessoas na residência</p>
                    <p class="text-[10px] text-slate-400">Define a cota de cada conta da casa.</p>
                </div>
                <input type="number" id="expense-moradores" min="1" value="1" class="w-16 p-2 border border-emerald-300 rounded-lg text-center font-black text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500">
            </div>

            <h5 class="text-[11px] font-black uppercase text-emerald-700 mb-2">Gastos comuns da família <span class="font-medium normal-case text-slate-400">(serão rateados)</span></h5>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-2 mb-5">${EXPENSE_CATEGORIES_COMUNS.map(c => linha(c, 'verde')).join('')}</div>

            <h5 class="text-[11px] font-black uppercase text-sky-700 mb-2">Gastos exclusivos da criança <span class="font-medium normal-case text-slate-400">(100% integrais)</span></h5>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-2 mb-5">${EXPENSE_CATEGORIES_EXCLUSIVAS.map(c => linha(c, 'azul')).join('')}</div>

            <div class="bg-gradient-to-br from-slate-800 to-slate-900 text-white p-4 rounded-2xl shadow-inner space-y-1.5">
                <div class="flex justify-between text-xs text-slate-300"><span>Cota da família (rateio)</span><span id="subtotal-familia">R$ 0,00</span></div>
                <div class="flex justify-between text-xs text-slate-300"><span>Exclusivos da criança</span><span id="subtotal-crianca">R$ 0,00</span></div>
                <div class="flex justify-between items-center border-t border-slate-600 pt-2 mt-1">
                    <span class="text-xs font-black uppercase tracking-wider text-emerald-400">Necessidade mensal apurada</span>
                    <span id="expense-total" class="text-xl font-black text-emerald-400">R$ 0,00</span>
                </div>
            </div>

            <button type="button" id="btn-baixar-planilha-isolada" class="mt-4 w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3 rounded-xl text-xs uppercase shadow transition flex items-center justify-center gap-2">
                <span>${ico('fileText', 'w-3.5 h-3.5')}</span> Baixar apenas a planilha (PDF)
            </button>
        </div>
    `;
    initExpenseTableEvents(div);
    return div;
}

function initExpenseTableEvents(div) {
    const checkGastos = div.querySelector('#check-exibir-gastos');
    const contentGastos = div.querySelector('#content-planilha-gastos');

    if (checkGastos && contentGastos) {
        checkGastos.addEventListener('change', function () {
            contentGastos.style.display = this.checked ? 'block' : 'none';
            updateSelectedCounter();
        });
    }

    const calcularTotais = () => {
        let totalFamilia = 0, totalCrianca = 0;
        const moradores = Math.max(1, parseInt(div.querySelector('#expense-moradores')?.value) || 1);

        EXPENSE_CATEGORIES_COMUNS.forEach(c => { const el = div.querySelector(`#expense-${c.id}`); if (el) totalFamilia += parseCurrency(el.value); });
        EXPENSE_CATEGORIES_EXCLUSIVAS.forEach(c => { const el = div.querySelector(`#expense-${c.id}`); if (el) totalCrianca += parseCurrency(el.value); });

        const cotaFamilia = totalFamilia / moradores;
        const set = (sel, v) => { const el = div.querySelector(sel); if (el) el.textContent = formatCurrency(v); };
        set('#subtotal-familia', cotaFamilia);
        set('#subtotal-crianca', totalCrianca);
        set('#expense-total', cotaFamilia + totalCrianca);
    };

    div.querySelector('#expense-moradores')?.addEventListener('input', calcularTotais);
    div.querySelectorAll('.expense-input').forEach(inp => {
        inp.addEventListener('input', (e) => { mascaraMoeda(e); calcularTotais(); });
    });

    div.querySelector('#btn-baixar-planilha-isolada')?.addEventListener('click', () => {
        const nomeAssistido = document.getElementById('assisted-details-name')?.textContent || 'Assistido';
        const dadosGastos = getExpenseDataFromForm();
        if (window.PDFService && typeof window.PDFService.generatePlanilhaGastosPDF === 'function') {
            window.PDFService.generatePlanilhaGastosPDF(nomeAssistido, dadosGastos);
        } else {
            showNotification("Motor de PDF não carregado.", "error");
        }
    });

    div.querySelector('#fechar-gastos')?.addEventListener('click', () => {
        const container = getEl('expense-table-container');
        if (container) container.innerHTML = '';
        const btnBox = getEl('expense-button-container');
        if (btnBox) btnBox.style.display = 'block';
        updateSelectedCounter();
    });
}

/* ========================================================
   7. FUNÇÕES DE DADOS (GET/SET)
   ======================================================== */
function getReuDataFromForm() {
    const v = (id) => getEl(id)?.value || '';
    const c = (id) => getEl(id)?.checked || false;
    return {
        checkReuUnico: c('check-reu-unico'),
        nome: v('nome-reu'), cpf: v('cpf-reu'), telefone: v('telefone-reu'),
        cep: v('cep-reu'), rua: v('rua-reu'), numero: v('numero-reu'), complemento: v('complemento-reu'),
        bairro: v('bairro-reu'), cidade: v('cidade-reu'), uf: v('estado-reu'), referencia: v('referencia-reu'),
        empresa: v('empresa-reu'), rua_comercial: v('rua-comercial-reu'), numero_comercial: v('numero-comercial-reu'),
        complemento_comercial: v('complemento-comercial-reu'), bairro_comercial: v('bairro-comercial-reu'),
        cidade_comercial: v('cidade-comercial-reu'), uf_comercial: v('estado-comercial-reu'), cep_comercial: v('cep-comercial-reu'),
        ocupacao: v('reu-ocupacao'), ocupacaoNaoSei: c('reu-ocupacao-nao-sei'),
        profissao: v('reu-profissao'), profissaoNaoSei: c('reu-profissao-nao-sei'),
        estadoCivil: v('reu-estado-civil'), estadoCivilNaoSei: c('reu-estado-civil-nao-sei'),
        ganhos: v('reu-ganhos'), ganhosNaoSei: c('reu-ganhos-nao-sei')
    };
}

function getSocioDataFromForm() {
    return {
        ocupacao: document.getElementById('socio-ocupacao')?.value || '',
        profissao: document.getElementById('socio-profissao')?.value || '',
        estadoCivil: document.getElementById('socio-estado-civil')?.value || '',
        ganhos: document.getElementById('socio-ganhos')?.value || ''
    };
}

function getExpenseDataFromForm() {
    const d = {};
    let totalCalculado = 0;
    const moradores = Math.max(1, parseInt(getEl('expense-moradores')?.value) || 1);

    [...EXPENSE_CATEGORIES_COMUNS, ...EXPENSE_CATEGORIES_EXCLUSIVAS].forEach(cat => {
        const el = getEl(`expense-${cat.id}`);
        const valor = el ? el.value || '' : '';
        d[cat.id] = (!valor || valor.trim() === '') ? 'R$ 0,00' : valor;
        
        totalCalculado += parseCurrency(d[cat.id]);
    });
    
    d.quantidadeMoradores = moradores.toString();
    d.checkExibirGastos = getEl('check-exibir-gastos')?.checked || false;
    d.temGastos = totalCalculado > 0;
    d.total = totalCalculado;

    return d;
}

function fillReuData(d) {
    if (!d) return;
    const setValue = (id, val) => { const el = getEl(id); if (el) el.value = val || ''; };

    const chkUnico = getEl('check-reu-unico');
    if (chkUnico) chkUnico.checked = d.checkReuUnico || false;

    setValue('nome-reu', d.nome); setValue('cpf-reu', d.cpf); setValue('telefone-reu', d.telefone);
    setValue('cep-reu', d.cep); setValue('rua-reu', d.rua); setValue('numero-reu', d.numero);
    setValue('complemento-reu', d.complemento); setValue('bairro-reu', d.bairro); setValue('cidade-reu', d.cidade);
    setValue('estado-reu', d.uf); setValue('referencia-reu', d.referencia); setValue('empresa-reu', d.empresa);
    setValue('rua-comercial-reu', d.rua_comercial); setValue('numero-comercial-reu', d.numero_comercial);
    setValue('complemento-comercial-reu', d.complemento_comercial); setValue('bairro-comercial-reu', d.bairro_comercial);
    setValue('cidade-comercial-reu', d.cidade_comercial); setValue('estado-comercial-reu', d.uf_comercial);
    setValue('cep-comercial-reu', d.cep_comercial);

    const preencherNaoSei = (campoId, valor, checkId, flag) => {
        setValue(campoId, valor);
        if (flag) {
            const chk = getEl(checkId);
            const el = getEl(campoId);
            if (chk) chk.checked = true;
            if (el) el.disabled = true;
        }
    };
    preencherNaoSei('reu-ocupacao', d.ocupacao, 'reu-ocupacao-nao-sei', d.ocupacaoNaoSei);
    preencherNaoSei('reu-profissao', d.profissao, 'reu-profissao-nao-sei', d.profissaoNaoSei);
    preencherNaoSei('reu-estado-civil', d.estadoCivil, 'reu-estado-civil-nao-sei', d.estadoCivilNaoSei);
    preencherNaoSei('reu-ganhos', d.ganhos, 'reu-ganhos-nao-sei', d.ganhosNaoSei);

    setTimeout(() => {
        const reuOcupacaoSelect = document.getElementById('reu-ocupacao');
        if (reuOcupacaoSelect && !d.ocupacaoNaoSei) reuOcupacaoSelect.dispatchEvent(new Event('change'));
        if (d.profissao && !d.profissaoNaoSei && OCUPACOES_COM_PROFISSAO.includes(d.ocupacao)) setValue('reu-profissao', d.profissao);
        updateReuVisibility(d);
    }, 100);
}

function updateReuVisibility(d) {
    const contentCompleto = getEl('content-reu-completo');
    if (contentCompleto) contentCompleto.style.display = d.checkReuUnico ? 'block' : 'none';
    updateSelectedCounter();
}

function fillExpenseData(d) {
    if (!d) return;
    [...EXPENSE_CATEGORIES_COMUNS, ...EXPENSE_CATEGORIES_EXCLUSIVAS].forEach(cat => {
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

    const moradores = Math.max(1, parseInt(getEl('expense-moradores')?.value) || 1);
    let totalFamilia = 0, totalCrianca = 0;
    EXPENSE_CATEGORIES_COMUNS.forEach(c => { const el = getEl(`expense-${c.id}`); if (el) totalFamilia += parseCurrency(el.value); });
    EXPENSE_CATEGORIES_EXCLUSIVAS.forEach(c => { const el = getEl(`expense-${c.id}`); if (el) totalCrianca += parseCurrency(el.value); });

    const cotaFamilia = totalFamilia / moradores;
    const set = (id, v) => { const el = getEl(id); if (el) el.textContent = formatCurrency(v); };
    set('subtotal-familia', cotaFamilia);
    set('subtotal-crianca', totalCrianca);
    set('expense-total', cotaFamilia + totalCrianca);

    updateSelectedCounter();
}

/* ========================================================
   8. PDF E SALVAMENTO
   ======================================================== */
async function handlePdf() {
    if (!PDFService || typeof PDFService.generateChecklistPDF !== 'function') {
        console.error("PDFService não disponível:", PDFService);
        showNotification("Erro: Motor de PDF não carregado. Recarregue a página.", "error");
        return;
    }

    showNotification("Gerando PDF unificado...", "info");
    try {
        const assistedName = getEl('assisted-details-name')?.textContent || 'Assistido';
        const actionTitle = getEl('checklist-title')?.textContent || '';
        
        const documentosTextos = collectCheckedDocuments();

        const reu = getReuDataFromForm();
        const gastos = getExpenseDataFromForm();

        const despesasTextos = [];
        if (gastos.checkExibirGastos && gastos.temGastos) {
            const qtdMoradores = parseInt(gastos.quantidadeMoradores || 1);
            const limpaMoeda = (v) => (!v || v === 'R$ 0,00') ? 0 : (parseFloat(String(v).replace(/[^\d,]/g, '').replace(',', '.')) || 0);

            despesasTextos.push(`Quantidade de pessoas na residência: ${qtdMoradores}`);

            let cotaTotal = 0;
            EXPENSE_CATEGORIES_COMUNS.forEach(cat => {
                const val = limpaMoeda(gastos[cat.id]);
                if (val > 0) {
                    cotaTotal += (val / qtdMoradores);
                    despesasTextos.push(`${cat.label}: Total ${gastos[cat.id]} / Cota (1/${qtdMoradores}): ${formatCurrency(val / qtdMoradores)}`);
                }
            });

            let integralTotal = 0;
            EXPENSE_CATEGORIES_EXCLUSIVAS.forEach(cat => {
                const val = limpaMoeda(gastos[cat.id]);
                if (val > 0) {
                    integralTotal += val;
                    despesasTextos.push(`${cat.label}: ${gastos[cat.id]} (Integral)`);
                }
            });

            despesasTextos.push(`NECESSIDADE MENSAL APURADA: ${formatCurrency(cotaTotal + integralTotal)}`);
        }

        const checklistData = {
            checkedIds: Array.from(document.querySelectorAll('.doc-checkbox:checked')).map(cb => cb.id),
            docTypes: getDocTypesFromForm(),
            reuData: reu,
            expenseData: gastos,
            socioData: getSocioDataFromForm(),
            demandasAdicionais: demandasAdicionaisLocais,
            textosDespesas: despesasTextos 
        };

        const resultado = await PDFService.generateChecklistPDF(assistedName, actionTitle, checklistData, documentosTextos, despesasTextos);
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

async function handleSave(closeModal = true) {
    ensureAssistedId();

    if (!currentAssistedId || !currentPautaId || !db) {
        showNotification("Erro: assistido não identificado. Feche e reabra o modal.", "error");
        return;
    }

    const container = getEl('checklist-container');
    const checkedIds = container ? Array.from(container.querySelectorAll('.doc-checkbox:checked')).map(cb => cb.id) : [];

    const payload = {
        documentChecklist: {
            action: currentChecklistAction,
            checkedIds,
            docTypes: getDocTypesFromForm(),
            reuData: getReuDataFromForm(),
            expenseData: getExpenseDataFromForm(),
            socioData: getSocioDataFromForm()
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
        console.error("Erro ao salvar:", e);
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
   11. GERADOR DE TEXTO PARA PETIÇÃO (COM RATEIO)
   ======================================================== */
window.gerarTextoDespesas = () => {
    const g = getExpenseDataFromForm();
    const nomeAssistido = document.getElementById('assisted-details-name')?.textContent || 'O requerente';
    const qtdMoradores = Math.max(1, parseInt(g.quantidadeMoradores || 1));

    const limpaMoeda = (valStr) => (!valStr || valStr === 'R$ 0,00') ? 0 : (parseFloat(String(valStr).replace(/[^\d,]/g, '').replace(',', '.')) || 0);

    const familiaHtml = [], familiaTxt = [];
    const criancaHtml = [], criancaTxt = [];
    let totalFamilia = 0, totalCrianca = 0;

    EXPENSE_CATEGORIES_COMUNS.forEach(cat => {
        const val = limpaMoeda(g[cat.id]);
        if (val > 0) {
            const cota = val / qtdMoradores;
            totalFamilia += cota;
            familiaHtml.push(`<li>${cat.label} (total ${formatCurrency(val)}; cota: <b>${formatCurrency(cota)}</b>)</li>`);
            familiaTxt.push(`• ${cat.label} (total ${formatCurrency(val)}; cota: ${formatCurrency(cota)})`);
        }
    });

    EXPENSE_CATEGORIES_EXCLUSIVAS.forEach(cat => {
        const val = limpaMoeda(g[cat.id]);
        if (val > 0) {
            totalCrianca += val;
            criancaHtml.push(`<li>${cat.label} (integral: <b>${formatCurrency(val)}</b>)</li>`);
            criancaTxt.push(`• ${cat.label} (integral: ${formatCurrency(val)})`);
        }
    });

    const totalFinal = totalFamilia + totalCrianca;
    if (totalFinal === 0) {
        showNotification("Atenção: Os valores de despesa estão zerados. Preencha a planilha.", "warning");
        return;
    }

    const intro = `Em relação às despesas mensais para a manutenção e subsistência de ${nomeAssistido}, conforme os dados colhidos em triagem socioeconômica, o montante apurado corresponde a`;
    const explica = `O referido valor engloba tanto as despesas exclusivas quanto o rateio proporcional das despesas do núcleo familiar (composto por ${qtdMoradores} ${qtdMoradores === 1 ? 'pessoa' : 'pessoas'}), divididas da seguinte forma:`;

    const html = `
        <p class="mb-3">${intro} <b>${formatCurrency(totalFinal)}</b>.</p>
        <p class="mb-3">${explica}</p>
        <p class="font-bold mt-4">Cota-parte de despesas residenciais e alimentares (rateio de 1/${qtdMoradores}):</p>
        <ul class="list-disc pl-5 my-2 space-y-1">${familiaHtml.join('') || '<li>Nenhuma despesa informada nesta categoria.</li>'}</ul>
        <p class="italic text-slate-500">Subtotal proporcional: ${formatCurrency(totalFamilia)}</p>
        <p class="font-bold mt-4">Despesas exclusivas (100% da necessidade):</p>
        <ul class="list-disc pl-5 my-2 space-y-1">${criancaHtml.join('') || '<li>Nenhuma despesa informada nesta categoria.</li>'}</ul>
        <p class="italic text-slate-500">Subtotal exclusivo: ${formatCurrency(totalCrianca)}</p>`;

    const txt = [
        `${intro} ${formatCurrency(totalFinal)}.`,
        '',
        explica,
        '',
        `Cota-parte de despesas residenciais e alimentares (rateio de 1/${qtdMoradores}):`,
        ...(familiaTxt.length ? familiaTxt : ['• Nenhuma despesa informada nesta categoria.']),
        `Subtotal proporcional: ${formatCurrency(totalFamilia)}`,
        '',
        'Despesas exclusivas (100% da necessidade):',
        ...(criancaTxt.length ? criancaTxt : ['• Nenhuma despesa informada nesta categoria.']),
        `Subtotal exclusivo: ${formatCurrency(totalCrianca)}`
    ].join('\n');

    exibirModalCopia(html, txt, totalFinal);
};

function exibirModalCopia(textoHtml, textoPuro, total) {
    document.getElementById('modal-texto-peticao')?.remove();

    const div = document.createElement('div');
    div.id = "modal-texto-peticao";
    div.className = "fixed inset-0 bg-slate-900/80 z-[100] flex items-center justify-center p-4 backdrop-blur-sm";
    div.innerHTML = `
        <div class="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div class="bg-gradient-to-r from-indigo-600 to-violet-600 p-4 text-white flex justify-between items-center shrink-0">
                <div>
                    <h3 class="font-black uppercase tracking-wide text-sm flex items-center gap-2"><span>${ico('fileText')}</span> Texto base para petição</h3>
                    <p class="text-[11px] text-indigo-100 mt-0.5">Necessidade mensal apurada: <b>${formatCurrency(total)}</b></p>
                </div>
                <button id="fechar-modal-peticao" class="text-indigo-100 hover:text-white text-2xl font-bold leading-none" aria-label="Fechar">&times;</button>
            </div>
            <div class="p-5 overflow-y-auto">
                <p class="text-[10px] uppercase font-black text-slate-400 mb-2">Trecho gerado pelo sistema (revise antes de usar)</p>
                <div class="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-700 leading-relaxed font-serif">${textoHtml}</div>
            </div>
            <div class="p-4 border-t border-slate-100 bg-slate-50 flex gap-2 shrink-0">
                <button id="btn-fechar-peticao" class="px-4 bg-white border border-slate-300 text-slate-600 font-bold rounded-xl text-xs uppercase hover:bg-slate-100 transition">Fechar</button>
                <button id="btn-copiar-texto-peticao" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3 rounded-xl uppercase tracking-wider text-xs shadow-lg transition active:scale-95 flex justify-center items-center gap-2">
                    <span>${ico('clipboard', 'w-3.5 h-3.5')}</span> Copiar texto
                </button>
            </div>
        </div>`;
    document.body.appendChild(div);

    const fechar = () => div.remove();
    document.getElementById('fechar-modal-peticao').onclick = fechar;
    document.getElementById('btn-fechar-peticao').onclick = fechar;
    div.addEventListener('click', (e) => { if (e.target === div) fechar(); });

    document.getElementById('btn-copiar-texto-peticao').onclick = () => {
        navigator.clipboard.writeText(textoPuro).then(() => {
            const btn = document.getElementById('btn-copiar-texto-peticao');
            btn.innerHTML = "<span>" + ico('checkCircle') + "</span> Copiado!";
            btn.classList.replace('bg-emerald-600', 'bg-slate-800');
            setTimeout(fechar, 1200);
        }).catch(() => showNotification("Não foi possível copiar. Selecione o texto manualmente.", "error"));
    };
}

/* ========================================================
   12. EXPORTS E INICIALIZAÇÃO
   ======================================================== */
export function setupDetailsModal(config) {
    db = config.db;
    getEl('close-assisted-details-modal-btn').onclick = closeAssistedDetailsModal;
    getEl('back-to-action-selection-btn').onclick = handleBack;
    getEl('save-checklist-btn').onclick = () => handleSave(true);
    getEl('print-checklist-btn').onclick = handlePdf;
    getEl('reset-checklist-btn').onclick = handleReset;

    const btnCaptacao = getEl('btn-gerar-captacao');
    if (btnCaptacao) btnCaptacao.onclick = gerarLinkCaptacao;

    const searchInput = getEl('checklist-search');
    if (searchInput) {
        searchInput.oninput = (e) => {
            const term = normalizeLocal(e.target.value);
            document.querySelectorAll('label.checklist-row').forEach(row => {
                const parentDiv = row.closest('div.flex.flex-col.border-b');
                if (parentDiv) parentDiv.style.display = normalizeLocal(row.textContent).includes(term) ? 'flex' : 'none';
            });
        };
    }
}

export async function openDetailsModal(config) {
    currentAssistedId = config.assistedId;
    currentPautaId = config.pautaId;
    allAssisted = config.allAssisted || [];
    db = config.db || window.app?.db;

    _backupAssistedId = currentAssistedId;
    _backupPautaId = currentPautaId;
    window._lastOpenedAssistedId = currentAssistedId;
    window._lastOpenedPautaId = currentPautaId;

    try {
        const docSnap = await getDoc(doc(db, "pautas", currentPautaId, "attendances", currentAssistedId));
        if (docSnap.exists()) {
            const data = docSnap.data();

            const textoAssunto = data.subject || data.materia || data.assunto || '';
            if (!data.documentChecklist?.action && textoAssunto) {
                const assuntoDetectado = descobrirAssuntoInteligente(textoAssunto);
                if (assuntoDetectado) {
                    await updateDoc(doc(db, "pautas", currentPautaId, "attendances", currentAssistedId), {
                        "documentChecklist.action": assuntoDetectado,
                        documentState: 'filling',
                        selectedAction: documentsData[assuntoDetectado]?.title || null
                    });
                    data.documentChecklist = data.documentChecklist || {};
                    data.documentChecklist.action = assuntoDetectado;
                }
            }

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

    const nameHeader = getEl('assisted-details-name');
    if (nameHeader) nameHeader.textContent = assisted.name || 'Sem Nome';

    const cpfEl = getEl('assisted-details-cpf');
    if (cpfEl) cpfEl.textContent = assisted.cpf ? `CPF: ${assisted.cpf}` : '';

    const agendamentoEl = getEl('assisted-details-agendamento');
    if (agendamentoEl) {
        const numAg = assisted.numeroAgendamento || assisted.numAgendamento || assisted.protocolo || 'N/A';
        agendamentoEl.textContent = `Agendamento: #${numAg}`;
    }

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
            <div class="relative mb-4">
                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">${ico('search')}</span>
                <input type="text" id="subject-search-input" placeholder="Buscar assunto..." class="w-full pl-10 pr-4 py-3 border-2 border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 transition">
            </div>
            <p class="text-slate-500 mb-3 text-xs text-center font-bold uppercase tracking-widest opacity-70">Selecione o assunto ou digite para filtrar</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 action-grid max-h-[50vh] overflow-y-auto p-1"></div>
            <p id="subject-empty" class="hidden text-center text-sm text-slate-400 py-8">Nenhum assunto encontrado. Tente outra palavra.</p>
        </div>
    `;

    const grid = selectionArea.querySelector('.action-grid');
    const searchInput = selectionArea.querySelector('#subject-search-input');
    const emptyMsg = selectionArea.querySelector('#subject-empty');
    const subjectsList = Object.keys(documentsData).map(k => ({ key: k, title: documentsData[k].title }));

    function renderFilteredSubjects(filterText = '') {
        grid.innerHTML = '';
        const filtroSeguro = filterText || '';
        const filtered = subjectsList.filter(s => {
            const tituloSeguro = s && s.title ? s.title : '';
            return normalizeLocal(tituloSeguro).includes(normalizeLocal(filtroSeguro));
        });
        emptyMsg.classList.toggle('hidden', filtered.length > 0);

        filtered.forEach(({ key, title }) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = "flex items-center gap-3 text-left p-3 bg-white border-2 border-slate-100 hover:border-emerald-400 hover:bg-emerald-50/50 rounded-xl transition-all shadow-sm";
            btn.innerHTML = `
                <span class="w-10 h-10 shrink-0 rounded-lg bg-slate-100 flex items-center justify-center text-xl">${icoFrom(ICONES_ACAO[key] || 'folder', 'w-5 h-5')}</span>
                <span class="text-xs sm:text-sm font-bold text-slate-700 leading-tight">${title}</span>`;
            btn.onclick = async (e) => {
                e.preventDefault();
                try {
                    await updateDoc(doc(db, "pautas", currentPautaId, "attendances", currentAssistedId), {
                        "documentChecklist.action": key,
                        documentState: 'filling',
                        selectedAction: title
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

// EXPORTAÇÕES PARA O WINDOW (ACESSO GLOBAL)
window.openDetailsModal = openDetailsModal;
window.setupDetailsModal = setupDetailsModal;
window.documentsData = documentsData;
window.EXPENSE_CATEGORIES_COMUNS = EXPENSE_CATEGORIES_COMUNS;
window.EXPENSE_CATEGORIES_EXCLUSIVAS = EXPENSE_CATEGORIES_EXCLUSIVAS;
window.gerarLinkCaptacao = gerarLinkCaptacao;

