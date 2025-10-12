/**
 * detalhes.js
 * Este módulo gerencia toda a funcionalidade do modal "Ver Detalhes",
 * incluindo a exibição da lista de documentos e o checklist.
 */

// --- Dados e Estado do Módulo ---

// Objeto com as informações de documentos para cada tipo de ação
const documentsData = {
    // --- II. PROCESSOS CÍVEIS (Gerais) ---
    obrigacao_fazer: {
        title: 'Ação de Obrigação de Fazer',
        sections: [
            { title: 'Documentação Comum (Requerente)', docs: ['Carteira de Identidade (RG)', 'CPF', 'Comprovante de Residência (com declaração, se em nome de terceiros)', 'Carteira de Trabalho', 'Contracheques (3 últimos meses)', 'Extrato bancário (3 últimos meses)', 'Última Declaração de IR', 'Declaração de Hipossuficiência', 'Comprovante Bolsa Família/LOAS (se houver)'] },
            { title: 'Documentos Específicos do Caso', docs: ['Documentos que comprovem a obrigação (contrato, acordo, etc.)', 'Provas do descumprimento (e-mails, protocolos, fotos, etc.)', 'Se contra concessionária de serviço público: Faturas, protocolos de reclamação.'] }
        ]
    },
    declaratoria_nulidade: {
        title: 'Ação Declaratória de Nulidade',
        sections: [
            { title: 'Documentação Comum (Requerente)', docs: ['Carteira de Identidade (RG)', 'CPF', 'Comprovante de Residência (com declaração, se em nome de terceiros)', 'Carteira de Trabalho', 'Contracheques (3 últimos meses)', 'Extrato bancário (3 últimos meses)', 'Última Declaração de IR', 'Declaração de Hipossuficiência', 'Comprovante Bolsa Família/LOAS (se houver)'] },
            { title: 'Documentos Específicos do Caso', docs: ['Documento ou ato jurídico a ser anulado (contrato, cobrança, multa)', 'Provas da ilegalidade ou abusividade (jurisprudências, extratos)', 'Se contra concessionária (ex: TOI da LIGHT): Cópia do TOI, histórico de consumo.'] }
        ]
    },
    indenizacao_danos: {
        title: 'Ação de Indenização (Danos Morais e Materiais)',
        sections: [
            { title: 'Documentação Comum (Requerente)', docs: ['Carteira de Identidade (RG)', 'CPF', 'Comprovante de Residência (com declaração, se em nome de terceiros)', 'Carteira de Trabalho', 'Contracheques (3 últimos meses)', 'Extrato bancário (3 últimos meses)', 'Última Declaração de IR', 'Declaração de Hipossuficiência', 'Comprovante Bolsa Família/LOAS (se houver)'] },
            { title: 'Documentos Específicos do Caso', docs: ['Provas do evento danoso (boletim de ocorrência, fotos, vídeos)', 'Provas dos danos materiais (notas fiscais, orçamentos, recibos)', 'Provas dos danos morais (laudos psicológicos, atestados, testemunhas)', 'Se contra concessionária: Protocolos, notas de aparelhos queimados.'] }
        ]
    },
    revisional_debito: {
        title: 'Ação Revisional de Débito',
        sections: [
            { title: 'Documentação Comum (Requerente)', docs: ['Carteira de Identidade (RG)', 'CPF', 'Comprovante de Residência (com declaração, se em nome de terceiros)', 'Carteira de Trabalho', 'Contracheques (3 últimos meses)', 'Extrato bancário (3 últimos meses)', 'Última Declaração de IR', 'Declaração de Hipossuficiência', 'Comprovante Bolsa Família/LOAS (se houver)'] },
            { title: 'Documentos Específicos do Caso', docs: ['Contrato ou documento que originou o débito', 'Faturas, extratos ou planilhas do débito', 'Provas de que os valores são indevidos (histórico de consumo, cálculos)', 'Se contra concessionária: Histórico de consumo, protocolos de reclamação.'] }
        ]
    },
    exigir_contas: {
        title: 'Ação de Exigir Contas',
        sections: [
            { title: 'Documentação Comum (Requerente)', docs: ['Carteira de Identidade (RG)', 'CPF', 'Comprovante de Residência (com declaração, se em nome de terceiros)', 'Carteira de Trabalho', 'Contracheques (3 últimos meses)', 'Extrato bancário (3 últimos meses)', 'Última Declaração de IR', 'Declaração de Hipossuficiência', 'Comprovante Bolsa Família/LOAS (se houver)'] },
            { title: 'Documentos Específicos do Caso', docs: ['Documento que comprove a relação de administração/gestão (termo de curatela, contrato)', 'Documentos que indiquem a movimentação de valores (extratos)', 'Provas da recusa em prestar contas ou suspeita de irregularidades.'] }
        ]
    },

    // --- III. PROCESSOS DE FAMÍLIA ---
    alimentos_fixacao_majoracao_oferta: {
        title: 'Alimentos (Fixação / Majoração / Oferta)',
        sections: [
            { title: 'Documentação Comum (Requerente)', docs: ['Carteira de Identidade (RG)', 'CPF', 'Comprovante de Residência (com declaração, se em nome de terceiros)', 'Carteira de Trabalho', 'Contracheques (3 últimos meses)', 'Extrato bancário (3 últimos meses)', 'Última Declaração de IR', 'Declaração de Hipossuficiência', 'Comprovante Bolsa Família/LOAS (se houver)'] },
            { title: 'Documentos do Filho(a)/Alimentando(a)', docs: ['Certidão de Nascimento', 'Comprovantes de despesas (matrícula, escola, saúde, remédios)', 'Laudos de necessidades especiais (se aplicável)'] },
            { title: 'Sobre o Réu (Alimentante)', docs: ['Endereço do(a) alimentante', 'Nome e endereço do trabalho do(a) alimentante (se souber)', 'Dados da(o) empregador(a) da parte ré (CNPJ, se possível)', 'Contracheque(s), extrato bancário ou IR do(a) alimentante (se conseguir)'] },
            { title: 'Para Depósito', docs: ['Dados bancários do(a) representante legal (para depósito da pensão)'] }
        ]
    },
    alimentos_gravidicos: {
        title: 'Ação de Alimentos Gravídicos',
        sections: [
            { title: 'Documentação Comum (Requerente)', docs: ['Carteira de Identidade (RG)', 'CPF', 'Comprovante de Residência (com declaração, se em nome de terceiros)', 'Carteira de Trabalho', 'Contracheques (3 últimos meses)', 'Extrato bancário (3 últimos meses)', 'Última Declaração de IR', 'Declaração de Hipossuficiência', 'Comprovante Bolsa Família/LOAS (se houver)'] },
            { title: 'Documentos Específicos do Caso', docs: ['Comprovante de gravidez (ultrassom, atestado médico)', 'Provas do relacionamento com o suposto pai (fotos, mensagens, testemunhas)', 'Comprovantes das despesas da gravidez (exames, medicamentos, enxoval)'] },
            { title: 'Sobre o Suposto Pai', docs: ['Endereço do suposto pai', 'Informações sobre a profissão e possibilidade financeira do suposto pai'] }
        ]
    },
    alimentos_avoengos: {
        title: 'Ação de Alimentos Avoengos (contra avós)',
        sections: [
            { title: 'Documentação Comum (Requerente)', docs: ['Carteira de Identidade (RG)', 'CPF', 'Comprovante de Residência (com declaração, se em nome de terceiros)', 'Carteira de Trabalho', 'Contracheques (3 últimos meses)', 'Extrato bancário (3 últimos meses)', 'Última Declaração de IR', 'Declaração de Hipossuficiência', 'Comprovante Bolsa Família/LOAS (se houver)'] },
            { title: 'Documentos do Neto(a)/Alimentando(a)', docs: ['Certidão de Nascimento'] },
            { title: 'Sobre os Pais', docs: ['Provas da impossibilidade/insuficiência dos pais (desemprego, decisão judicial anterior, certidão de óbito)'] },
            { title: 'Sobre o(s) Avó(s) Réu(s)', docs: ['Endereço do(a) avó(ô) réu', 'Provas da capacidade financeira do(a) avó(ô) (contracheques, extratos, IR, etc.)'] }
        ]
    },
    divorcio_consensual: {
        title: 'Divórcio Consensual',
        sections: [
            { title: 'Documentação Comum (Ambos os Cônjuges)', docs: ['Carteira de Identidade (RG) de ambos', 'CPF de ambos', 'Comprovante de Residência de ambos', 'Certidão de Casamento (atualizada)'] },
            { title: 'Bens e Filhos (se houver)', docs: ['Documentos dos bens (imóveis, veículos, contas) e seus valores', 'Certidão de Nascimento/Casamento dos filhos', 'Comprovantes de despesas dos filhos', 'Dados bancários para pensão (se houver)'] }
        ]
    },
    divorcio_litigioso: {
        title: 'Divórcio Litigioso',
        sections: [
            { title: 'Documentação Comum (Requerente)', docs: ['Carteira de Identidade (RG)', 'CPF', 'Comprovante de Residência', 'Certidão de Casamento (atualizada)'] },
            { title: 'Sobre o Outro Cônjuge (Réu)', docs: ['Endereço do(a) outro(a) cônjuge (réu)'] },
            { title: 'Bens e Filhos (se houver)', docs: ['Documentos dos bens (imóveis, veículos, contas) e seus valores', 'Certidão de Nascimento/Casamento dos filhos', 'Comprovantes de despesas dos filhos', 'Informações de renda do réu (para alimentos)', 'Se há imóvel MCMV: Documentação do imóvel', 'Se há cotas sociais (empresa): Contrato social, documentos da empresa'] }
        ]
    },
    uniao_estavel_reconhecimento_dissolucao: {
        title: 'Reconhecimento e Dissolução de União Estável',
        sections: [
            { title: 'Documentação Comum (Requerente)', docs: ['Carteira de Identidade (RG)', 'CPF', 'Comprovante de Residência'] },
            { title: 'Dos Companheiros', docs: ['Certidão de Nascimento/Casamento de ambos (para comprovar estado civil)'] },
            { title: 'Provas da União', docs: ['Provas da existência da união estável (fotos, contas conjuntas, contratos, declarações)', 'Endereço do(a) ex-companheiro(a) (réu)'] },
            { title: 'Bens e Filhos (se houver)', docs: ['Documentos dos bens adquiridos na constância da união', 'Certidão de Nascimento/Casamento dos filhos', 'Comprovantes de despesas, informações de renda do réu (para alimentos)'] }
        ]
    },
    uniao_estavel_post_mortem: {
        title: 'Reconhecimento / Dissolução de União Estável Post Mortem',
        sections: [
            { title: 'Documentação Comum (Requerente)', docs: ['Carteira de Identidade (RG)', 'CPF', 'Comprovante de Residência'] },
            { title: 'Documentos do Falecido(a)', docs: ['Certidão de Óbito do(a) companheiro(a) falecido(a)'] },
            { title: 'Provas e Herdeiros', docs: ['Provas da existência da união estável (conforme item anterior)', 'Endereço dos herdeiros do falecido (réus)', 'Documentos que comprovem a inexistência de filhos ou testamento do de cujus'] }
        ]
    },
    conversao_uniao_homoafetiva: {
        title: 'Conversão de União Estável Homoafetiva em Casamento',
        sections: [
            { title: 'Documentação Comum (Ambos)', docs: ['Documentos de Identidade e CPF de ambos', 'Certidão de Nascimento/Casamento de ambos', 'Comprovante de Residência'] },
            { title: 'Provas da União e Testemunhas', docs: ['Provas da união estável (fotos, extratos, declarações)', 'Dados das testemunhas do casamento (nome, RG, CPF, endereço, telefone)'] }
        ]
    },
    guarda: {
        title: 'Guarda (pedida pelos pais / por terceiros)',
        sections: [
            { title: 'Documentação Comum (Requerente)', docs: ['Carteira de Identidade (RG)', 'CPF', 'Comprovante de Residência'] },
            { title: 'Da(s) Criança(s)/Adolescente(s)', docs: ['Certidão de Nascimento'] },
            { title: 'Se pedida pelos pais:', docs: ['Provas do arranjo familiar atual', 'Se houver conflito: Provas da incapacidade do outro genitor ou situação de risco'] },
            { title: 'Se pedida por terceiros (avó/tio/etc.):', docs: ['Declaração de Idoneidade Moral do(a) requerente', 'Atestado médico de boa saúde física e mental (requerente e criança)', 'Comprovante de vacinação e escolar da criança', 'Provas da situação de risco ou incapacidade dos pais (relatórios do Conselho Tutelar)', 'Endereço dos pais (réus)'] }
        ]
    },
    regulamentacao_convivencia: {
        title: 'Regulamentação de Convivência Familiar (Visitas)',
        sections: [
            { title: 'Documentação Comum (Requerente)', docs: ['Carteira de Identidade (RG)', 'CPF', 'Comprovante de Residência'] },
            { title: 'Documentos do Caso', docs: ['Certidão de Nascimento da(s) criança(s)/adolescente(s)', 'Endereço do(s) pais', 'Cópia da decisão ou termo de guarda (se já houver)', 'Propostas de dias e horários para a convivência'] }
        ]
    },
    investigacao_paternidade: {
        title: 'Investigação de Paternidade (com ou sem Alimentos / Pós Morte)',
        sections: [
            { title: 'Documentação Comum (Representante Legal)', docs: ['Carteira de Identidade (RG)', 'CPF', 'Comprovante de Residência'] },
            { title: 'Do Filho(a)', docs: ['Certidão de Nascimento (sem nome do pai ou com pai a ser contestado)', 'Comprovantes de despesas do(a) filho(a) (para pedido de alimentos)'] },
            { title: 'Sobre o Suposto Pai', docs: ['Provas do relacionamento da mãe com o suposto pai (fotos, mensagens, testemunhas)', 'Informações sobre o suposto pai (nome completo, endereço, profissão, etc.)', 'Certidão de Óbito do suposto pai (se for Pós Morte)'] }
        ]
    },
    curatela: {
        title: 'Curatela (antiga interdição)',
        sections: [
            { title: 'Documentação Comum (Requerente/Futuro Curador)', docs: ['Carteira de Identidade (RG)', 'CPF', 'Comprovante de Residência', 'Declaração de Idoneidade Moral', 'Atestado médico de boa saúde física e mental', 'Declaração de Anuência dos demais familiares (se houver)'] },
            { title: 'Do Curatelando(a)', docs: ['RG e CPF', 'Certidão de Nascimento/Casamento', 'Laudos médicos ATUALIZADOS (com CID, indicando impossibilidade de exprimir vontade)', 'Relatórios de equipe multiprofissional/biopsicossocial (se houver)', 'Documentos de bens do(a) curatelando(a) (se possuir)'] }
        ]
    },
    levantamento_curatela: {
        title: 'Levantamento de Curatela',
        sections: [
            { title: 'Documentação Comum (Requerente)', docs: ['Carteira de Identidade (RG)', 'CPF', 'Comprovante de Residência'] },
            { title: 'Documentos do Caso', docs: ['Cópia da sentença ou termo de curatela', 'Laudos médicos ATUALIZADOS comprovando a cessação da incapacidade', 'Documentos que comprovem o retorno do(a) curatelado(a) ao convívio social'] }
        ]
    },
    tutela: {
        title: 'Tutela',
        sections: [
            { title: 'Documentação Comum (Requerente/Futuro Tutor)', docs: ['Carteira de Identidade (RG)', 'CPF', 'Comprovante de Residência', 'Declaração de Idoneidade Moral', 'Atestado médico de boa saúde física e mental'] },
            { title: 'Do Menor e Pais', docs: ['Certidão de Nascimento/Óbito dos pais do(a) menor (para comprovar ausência)', 'Provas da situação de abandono/risco do menor'] }
        ]
    },
    adocao: {
        title: 'Adoção',
        sections: [
            { title: 'Dos Requerentes (Futuros Pais Adotivos)', docs: ['Documentos de Identidade e CPF', 'Comprovante de Residência', 'Habilitação para adoção (se já houver)', 'Estudo psicossocial'] },
            { title: 'Da Criança/Adolescente e Pais Biológicos', docs: ['Certidão de Nascimento', 'Consentimento dos pais biológicos (se consensual) ou provas de destituição do poder familiar'] }
        ]
    },

    // --- IV. PROCESSOS CRIMINAIS E EXECUÇÃO PENAL ---
    defesa_criminal_custodia: {
        title: 'Defesa Criminal / Audiência de Custódia',
        sections: [
            { title: 'Documentação Comum (Assistido/Familiar)', docs: ['Carteira de Identidade (RG)', 'CPF', 'Comprovante de Residência'] },
            { title: 'Documentos do Caso', docs: ['Cópia do Registro de Ocorrência (BO) ou Auto de Prisão em Flagrante (APF)', 'Mandado de Prisão (se houver)', 'Informações sobre o crime/acusação', 'Provas da versão do assistido (testemunhas, áudios, vídeos, fotos)', 'Comprovante de residência fixa e trabalho lícito (para liberdade)', 'Certidão de nascimento de filhos menores/laudos de dependentes (para domiciliar)', 'Certidões de antecedentes criminais'] }
        ]
    },
    execucao_penal: {
        title: 'Acompanhamento de Execução Penal',
        sections: [
            { title: 'Documentação Comum (Apenado/Familiar)', docs: ['Documentos pessoais do apenado'] },
            { title: 'Documentos do Processo', docs: ['Cópia da Sentença Condenatória e Certidão de Trânsito em Julgado', 'Número do Processo de Execução Penal (PEP)'] },
            { title: 'Para Pedidos Específicos', docs: ['Atestados de trabalho/estudo (para remição)', 'Comprovante de residência familiar (para VPL - Visita Periódica ao Lar)', 'Informações sobre comportamento carcerário'] }
        ]
    },

    // --- V. FAZENDA PÚBLICA (contra o Estado) ---
    fornecimento_medicamentos: {
        title: 'Fornecimento de Medicamentos / Cirurgias / Exames',
        sections: [
            { title: 'Documentação Comum (Requerente)', docs: ['Carteira de Identidade (RG)', 'CPF', 'Comprovante de Residência', 'Declaração de Hipossuficiência', 'Comprovante Bolsa Família/LOAS (se houver)'] },
            { title: 'Documentos Médicos', docs: ['Receita médica ATUALIZADA (original)', 'Laudo médico DETALHADO (com CID, justificativa da imprescindibilidade, ineficácia de alternativas do SUS)', 'Comprovante de negativa de fornecimento pelo SUS ou plano de saúde', 'Orçamentos do medicamento/procedimento em locais particulares (mínimo de 3)', 'Carteirinha do plano de saúde (se for contra plano)'] }
        ]
    },
    indenizacao_poder_publico: {
        title: 'Indenizações contra o Poder Público',
        sections: [
            { title: 'Documentação Comum (Requerente)', docs: ['Carteira de Identidade (RG)', 'CPF', 'Comprovante de Residência', 'Declaração de Hipossuficiência'] },
            { title: 'Documentos do Caso', docs: ['Documentos que comprovem o dano e o nexo com a atuação/omissão do ente público (BO, laudos, fotos, notas fiscais)'] }
        ]
    },
    previdencia_estadual_municipal: {
        title: 'Previdência Social (estadual e municipal)',
        sections: [
            { title: 'Documentação Comum (Requerente)', docs: ['Carteira de Identidade (RG)', 'CPF', 'Comprovante de Residência', 'Declaração de Hipossuficiência'] },
            { title: 'Documentos Específicos', docs: ['Documentos específicos do benefício pleiteado ou contestado (ex: certidão de tempo de contribuição, laudos médicos)', 'Comprovante da negativa administrativa'] }
        ]
    },
    questionamento_impostos_taxas: {
        title: 'Questionamentos em Cobranças de Impostos, Taxas e Multas',
        sections: [
            { title: 'Documentação Comum (Requerente)', docs: ['Carteira de Identidade (RG)', 'CPF', 'Comprovante de Residência', 'Declaração de Hipossuficiência'] },
            { title: 'Documentos do Débito', docs: ['Cópia do débito/multa que se busca contestar', 'Documentos que comprovem a indevida cobrança ou o pagamento'] }
        ]
    },

    // --- VI. INFÂNCIA E JUVENTUDE ---
    vaga_escola_creche: {
        title: 'Vaga em Escolas e Creches',
        sections: [
            { title: 'Documentação Comum (Representante Legal)', docs: ['Carteira de Identidade (RG)', 'CPF', 'Comprovante de Residência'] },
            { title: 'Documentos da Criança e do Pedido', docs: ['Certidão de Nascimento da criança', 'Comprovante de inscrição na lista de espera da prefeitura (se houver)', 'Protocolos de solicitação de vaga na CRE/escolas', 'Endereço das creches/escolas próximas à residência', 'Provas da necessidade da vaga (mãe trabalhadora, laudos para crianças com deficiência)'] }
        ]
    },
    apoio_escolar: {
        title: 'Profissionais de Apoio Escolar',
        sections: [
            { title: 'Documentação Comum (Representante Legal)', docs: ['Carteira de Identidade (RG)', 'CPF', 'Comprovante de Residência'] },
            { title: 'Documentos da Criança e do Pedido', docs: ['Certidão de Nascimento da criança/adolescente', 'Laudo médico comprovando a deficiência e a necessidade do profissional de apoio', 'Declaração da escola sobre a matrícula e a ausência do profissional', 'Plano Educacional Individualizado (PEI) (se houver)'] }
        ]
    },
    transporte_gratuito: {
        title: 'Transporte Gratuito (Infância e Juventude)',
        sections: [
            { title: 'Documentação Comum (Representante Legal)', docs: ['Carteira de Identidade (RG)', 'CPF', 'Comprovante de Residência'] },
            { title: 'Documentos da Criança/Adolescente', docs: ['Certidão de Nascimento', 'Laudo médico comprovando a deficiência/doença e a necessidade de transporte', 'Comprovante de negativa da solicitação administrativa de transporte'] }
        ]
    },

    // --- VIII. DOCUMENTAÇÃO E REGISTROS ---
    retificacao_registro_civil: {
        title: 'Retificação de Registro Civil (Dados / Gênero e Nome)',
        sections: [
            { title: 'Documentação Comum (Requerente)', docs: ['Carteira de Identidade (RG)', 'CPF', 'Comprovante de Residência'] },
            { title: 'Para Retificação de Dados', docs: ['Cópia da Certidão a ser retificada', 'Documentos que comprovem o erro ou a omissão (outras certidões, documentos antigos)', 'Certidão de Óbito (se for retificação de óbito de "indigente")'] },
            { title: 'Para Alteração de Gênero e Nome', docs: ['Certidão de Nascimento (original e atualizada)', 'Comprovantes de que a pessoa se identifica com o gênero/nome pleiteado'] }
        ]
    },

    // --- X. ALVARÁ JUDICIAL ---
    alvara_levantamento_valores: {
        title: 'Alvará para Levantamento de Valores (FGTS, PIS/PASEP)',
        sections: [
            { title: 'Documentação Comum (Requerente)', docs: ['Carteira de Identidade (RG)', 'CPF', 'Comprovante de Residência'] },
            { title: 'Documentos do Falecido e dos Valores', docs: ['Certidão de Óbito do titular dos valores', 'Certidão de dependentes habilitados no INSS ou declaração de inexistência', 'Extrato do FGTS/PIS/PASEP comprovando o saldo', 'Comprovantes de relação com o falecido (certidão de nascimento/casamento)'] }
        ]
    },
    alvara_viagem_menor: {
        title: 'Alvará para Autorização de Viagem de Menor ao Exterior',
        sections: [
            { title: 'Documentação Comum (Requerente)', docs: ['Carteira de Identidade (RG)', 'CPF', 'Comprovante de Residência'] },
            { title: 'Documentos do Menor e da Viagem', docs: ['Certidão de Nascimento do(a) menor', 'Passaporte do(a) menor (se já existir)', 'Informações sobre a viagem (datas, destino, motivo)', 'Endereço do(a) genitor(a) que não autoriza (para citação)', 'Provas do benefício da viagem para o menor', 'Provas da impossibilidade de obter o consentimento do outro genitor'] }
        ]
    }
};


let currentAssistedId = null;
let currentPautaId = null;
let db = null;
let getUpdatePayload = null;
let showNotification = null;
let allAssisted = [];
let currentChecklistAction = null;

// --- Seletores de DOM ---
const modal = document.getElementById('documents-modal');
const assistedNameEl = document.getElementById('documents-assisted-name');
const actionSelectionView = document.getElementById('document-action-selection');
const actionSearchInput = document.getElementById('action-search-input');
const checklistView = document.getElementById('document-checklist-view');
const checklistContainer = document.getElementById('checklist-container');
const checklistTitle = document.getElementById('checklist-title');
const backToActionSelectionBtn = document.getElementById('back-to-action-selection-btn');
const saveChecklistBtn = document.getElementById('save-checklist-btn');
const printChecklistBtn = document.getElementById('print-checklist-btn');
const checklistSearch = document.getElementById('checklist-search');
const closeBtn = document.getElementById('close-documents-modal-btn');
const cancelBtn = document.getElementById('cancel-checklist-btn');


// --- Funções Internas ---

/**
 * Preenche a área de seleção de ações com botões gerados dinamicamente
 * a partir do objeto documentsData.
 */
function populateActionSelection() {
    const container = document.getElementById('document-action-selection');
    if (!container) return;

    // Evita recriar os botões se eles já existirem.
    if (container.querySelector('.action-grid-container')) {
        return;
    }
    
    // Cria o parágrafo de instrução dinamicamente para não apagar outros elementos (como o campo de busca)
    const instruction = document.createElement('p');
    instruction.className = 'text-gray-600 mb-4';
    instruction.textContent = 'Selecione o tipo de ação para ver a lista de documentos necessários:';

    const gridContainer = document.createElement('div');
    gridContainer.className = 'grid grid-cols-1 md:grid-cols-2 gap-3 action-grid-container';

    Object.keys(documentsData).forEach((actionKey, index) => {
        const actionData = documentsData[actionKey];
        const button = document.createElement('button');
        button.dataset.action = actionKey;
        button.className = 'w-full text-left p-3 bg-gray-50 hover:bg-gray-100 rounded-lg border transition';

        const span = document.createElement('span');
        span.className = 'font-semibold text-gray-800';
        span.textContent = `${index + 1}. ${actionData.title}`;

        button.appendChild(span);
        gridContainer.appendChild(button);
    });

    container.appendChild(instruction);
    container.appendChild(gridContainer);
}


/**
 * Renderiza a lista de verificação de documentos para uma ação específica.
 * @param {string} actionKey - A chave da ação (ex: 'alimentos_fixacao').
 */
function renderChecklist(actionKey) {
    currentChecklistAction = actionKey;
    const data = documentsData[actionKey];
    if (!data) return;

    const assisted = allAssisted.find(a => a.id === currentAssistedId);
    const savedChecklist = assisted?.documentChecklist;

    checklistTitle.textContent = data.title;
    checklistContainer.innerHTML = '';
    checklistSearch.value = '';

    data.sections.forEach((section, sectionIndex) => {
        const sectionDiv = document.createElement('div');
        const sectionTitleEl = document.createElement('h4');
        sectionTitleEl.className = 'font-bold text-md text-gray-700 mb-2 mt-3 border-b pb-1';
        sectionTitleEl.textContent = section.title;
        sectionDiv.appendChild(sectionTitleEl);

        const list = document.createElement('ul');
        list.className = 'space-y-2';
        section.docs.forEach((docText, docIndex) => {
            const listItem = document.createElement('li');
            const label = document.createElement('label');
            label.className = 'flex items-center text-gray-800 cursor-pointer';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            const checkboxId = `doc-${actionKey}-${sectionIndex}-${docIndex}`;
            checkbox.id = checkboxId;
            checkbox.className = 'h-5 w-5 rounded border-gray-300 text-green-600 focus:ring-green-500 mr-3';
            
            if(savedChecklist && savedChecklist.action === actionKey && savedChecklist.checkedIds?.includes(checkboxId)){
                checkbox.checked = true;
            }

            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(docText));
            listItem.appendChild(label);
            list.appendChild(listItem);
        });
        sectionDiv.appendChild(list);
        checklistContainer.appendChild(sectionDiv);
    });
}

const normalizeText = (str) => {
    if (!str) return '';
    return str.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
};


// --- Manipuladores de Eventos ---

function handleActionSelect(e) {
    const actionButton = e.target.closest('button[data-action]');
    if (!actionButton) return;

    const actionKey = actionButton.dataset.action;
    renderChecklist(actionKey);

    actionSelectionView.classList.add('hidden');
    checklistView.classList.remove('hidden');
    checklistView.classList.add('flex');
}

function handleBack() {
    checklistView.classList.add('hidden');
    checklistView.classList.remove('flex');
    actionSelectionView.classList.remove('hidden');
    if (actionSearchInput) {
        actionSearchInput.value = '';
        actionSearchInput.dispatchEvent(new Event('input'));
    }
}

async function handleSave() {
    if (!currentAssistedId || !currentChecklistAction || !db || !currentPautaId) {
        if (showNotification) showNotification("Erro: Faltam dados para salvar.", "error");
        return;
    }

    const checkedCheckboxes = checklistContainer.querySelectorAll('input[type="checkbox"]:checked');
    const checkedIds = Array.from(checkedCheckboxes).map(cb => cb.id);

    const checklistData = {
        action: currentChecklistAction,
        checkedIds: checkedIds
    };

    try {
        const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
        const docRef = doc(db, "pautas", currentPautaId, "attendances", currentAssistedId);
        await updateDoc(docRef, getUpdatePayload({ documentChecklist: checklistData }));
        showNotification("Checklist salvo com sucesso!", "success");
        closeModal();
    } catch (error) {
        console.error("Erro ao salvar o checklist: ", error);
        showNotification("Erro ao salvar o checklist.", "error");
    }
}

function handleSearch(e) {
    const searchTerm = normalizeText(e.target.value);
    const allDocs = checklistContainer.querySelectorAll('li');
    allDocs.forEach(li => {
        const labelText = normalizeText(li.textContent);
        li.style.display = labelText.includes(searchTerm) ? 'block' : 'none';
    });
}

function handleActionSearch(e) {
    const searchTerm = normalizeText(e.target.value);
    const allActions = actionSelectionView.querySelectorAll('.action-grid-container button[data-action]');
    allActions.forEach(btn => {
        const actionText = normalizeText(btn.textContent);
        btn.style.display = actionText.includes(searchTerm) ? 'block' : 'none';
    });
}

function handlePrint() {
    const title = checklistTitle.textContent;
    const assistedName = assistedNameEl.textContent;

    const printWindow = window.open('', '_blank');
    printWindow.document.write('<html><head><title>Imprimir Checklist</title>');
    printWindow.document.write(`
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 2rem; line-height: 1.5; }
            h1, h2 { color: #111827; border-bottom: 2px solid #e5e7eb; padding-bottom: 0.5rem; }
            h1 { font-size: 1.875rem; }
            h2 { font-size: 1.5rem; margin-top: 1.5rem; }
            h4 { font-size: 1.125rem; margin-top: 1.5rem; margin-bottom: 0.75rem; color: #374151; }
            ul { list-style-type: none; padding-left: 0; }
            li { margin-bottom: 0.5rem; font-size: 1rem; color: #4b5563; }
        </style>
    `);
    printWindow.document.write('</head><body>');
    printWindow.document.write(`<h1>Checklist de Documentos</h1>`);
    printWindow.document.write(`<h2>Assistido(a): ${assistedName}</h2>`);
    printWindow.document.write(`<h2>Assunto: ${title}</h2>`);

    let printableHtml = '';
    const sections = checklistContainer.querySelectorAll('div > div');
    sections.forEach(section => {
        const sectionTitleEl = section.querySelector('h4');
        if (sectionTitleEl) {
            printableHtml += `<h4>${sectionTitleEl.textContent}</h4>`;
            printableHtml += '<ul>';
            const items = section.querySelectorAll('li');
            items.forEach(item => {
                const checkbox = item.querySelector('input');
                const label = item.querySelector('label').textContent;
                const symbol = checkbox.checked ? '☑' : '☐';
                printableHtml += `<li>${symbol} ${label}</li>`;
            });
            printableHtml += '</ul>';
        }
    });

    printWindow.document.write(printableHtml);
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 250);
}

function closeModal() {
    modal.classList.add('hidden');
}


// --- Funções Exportadas ---

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
    
    if (actionSearchInput) actionSearchInput.addEventListener('input', handleActionSearch);
    if (printChecklistBtn) printChecklistBtn.addEventListener('click', handlePrint);
}

export function openDetailsModal(config) {
    // MODIFICAÇÃO: Garante que os botões de ação sejam criados.
    populateActionSelection();
    
    currentAssistedId = config.assistedId;
    currentPautaId = config.pautaId;
    allAssisted = config.allAssisted;

    const assisted = allAssisted.find(a => a.id === currentAssistedId);
    if (!assisted) {
        console.error("Assistido não encontrado para abrir detalhes.");
        if (showNotification) showNotification("Erro: assistido não encontrado.", "error");
        return;
    }

    assistedNameEl.textContent = assisted.name;

    if (assisted.documentChecklist && assisted.documentChecklist.action) {
        const savedAction = assisted.documentChecklist.action;
        renderChecklist(savedAction);
        actionSelectionView.classList.add('hidden');
        checklistView.classList.remove('hidden');
        checklistView.classList.add('flex');
    } else {
        handleBack(); 
    }
    
    modal.classList.remove('hidden');
}

