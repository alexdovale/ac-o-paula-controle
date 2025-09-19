// Adiciona um ouvinte de evento que será acionado quando o HTML da página for totalmente carregado
document.addEventListener('DOMContentLoaded', () => {

    // Estrutura de dados em árvore com todos os assuntos jurídicos
    const subjectTree = [
        { text: "Orientação Jurídica" },
        { text: "Atendimento Jurídico Integral e Gratuito" },
        { text: "Ajuizamento e Acompanhamento de Ações Judiciais" },
        { text: "Consultas Processuais" },
        {
            text: "Processos Cíveis (gerais)",
            children: [
                { text: "Ação de Obrigação de Fazer" },
                { text: "Ação Declaratória de Nulidade" },
                { text: "Ação de Indenização (Danos Morais e Materiais)" },
                { text: "Ação Revisional de Débito" },
                { text: "Ação de Exigir Contas" }
            ]
        },
        {
            text: "Processos de Família",
            children: [
                {
                    text: "Alimentos",
                    children: [
                        { text: "Ação de Fixação de Alimentos (com e sem vínculo empregatício)" },
                        { text: "Ação de Majoração de Alimentos" },
                        { text: "Ação de Oferta de Alimentos (com e sem vínculo empregatício)" },
                        { text: "Ação de Alimentos Gravídicos" },
                        { text: "Ação de Alimentos Avoengos (contra avós)" }
                    ]
                },
                {
                    text: "Divórcio",
                    children: [
                        { text: "Divórcio Consensual (com ou sem bens/filhos)" },
                        { text: "Divórcio Litigioso (com ou sem bens/filhos)" }
                    ]
                },
                {
                    text: "União Estável",
                    children: [
                        { text: "Reconhecimento e Dissolução de União Estável" },
                        { text: "Reconhecimento / Dissolução de União Estável Post Mortem" },
                        { text: "Conversão de União Estável Homoafetiva em Casamento" }
                    ]
                },
                {
                    text: "Guarda",
                    children: [
                        { text: "Guarda (pedida pelos pais)" },
                        { text: "Guarda (pedida por terceiros)" },
                        { text: "Guarda Compartilhada" }
                    ]
                },
                {
                    text: "Regulamentação de Convivência Familiar (Visitas)",
                    children: [{ text: "Regulamentação de Visitas" }]
                },
                {
                    text: "Investigação de Paternidade (DNA)",
                    children: [
                        { text: "Investigação de Paternidade Cumulada com Alimentos" },
                        { text: "Investigação de Paternidade Pós Morte" }
                    ]
                },
                {
                    text: "Curatela",
                    children: [
                        { text: "Procedimento de Fixação dos Limites da Curatela (antiga interdição)" },
                        { text: "Levantamento de Curatela" }
                    ]
                },
                { text: "Tutela" },
                { text: "Adoção" }
            ]
        },
        {
            text: "Processos Criminais",
            children: [
                { text: "Defesa de Acusados em Processo Criminal" },
                { text: "Acompanhamento do Cumprimento da Pena (Execução Penal)" },
                { text: "Atuação em Audiência de Custódia" }
            ]
        },
        {
            text: "Processos de Fazenda Pública",
            children: [
                { text: "Fornecimento de Medicamentos" },
                { text: "Indenizações contra o Poder Público" },
                { text: "Previdência Social (estadual e municipal)" },
                { text: "Questionamentos em Cobranças de Impostos, Taxas e Multas" }
            ]
        },
        {
            text: "Processos de Infância e Juventude",
            children: [
                { text: "Vaga em Escolas e Creches" },
                { text: "Profissionais de Apoio Escolar" },
                { text: "Obrigação de Fazer (genérica)" },
                { text: "Transporte (demanda de transporte gratuito)" }
            ]
        },
        { text: "Processos Relacionados a Direitos Humanos" },
        { text: "Mediação e Conciliação" },
        {
            text: "Facilitação de Acesso à Documentação Básica",
            children: [
                { text: "Emissão de Carteira de Identidade (1ª e 2ª via)" },
                { text: "Emissão de Certidões (Nascimento, Casamento, Óbito)" },
                { text: "Obtenção de 'Nada Consta'" }
            ]
        },
        {
            text: "Atendimento em Demandas de Saúde (CRLS)",
            children: [
                { text: "Acesso a Medicamentos" },
                { text: "Agendamento de Procedimentos Cirúrgicos ou Exames" }
            ]
        },
        {
            text: "Orientação sobre Execução Penal",
            children: [
                { text: "Progressão de Regime (Fechado, Semiaberto, Aberto)" },
                { text: "Visita Periódica ao Lar (VPL)" },
                { text: "Trabalho/Estudo Extramuros" },
                { text: "Livramento Condicional" },
                { text: "Indulto" }
            ]
        },
        {
            text: "Retificação de Registro Civil",
            children: [
                { text: "Retificação de Dados Registrais (Nascimento, Casamento, Óbito)" },
                { text: "Alteração de Gênero e Nome" }
            ]
        },
        {
            text: "Alvará Judicial",
            children: [
                { text: "Alvará para Levantamento de Valores (FGTS, PIS/PASEP)" },
                { text: "Alvará para Autorização de Viagem ao Exterior (para menor)" }
            ]
        },
        { text: "Apoio Psicossocial" },
        { text: "Defesa de Direitos Homoafetivos" }
    ];

    // Função recursiva para achatar a árvore de assuntos em uma lista simples
    // Ex: "Processos de Família > Alimentos > Ação de Alimentos Gravídicos"
    function flattenTree(nodes, parentPrefix = '') {
        let flatList = [];
        nodes.forEach(node => {
            // Cria o texto completo do item, incluindo os pais
            const currentText = parentPrefix ? `${parentPrefix} > ${node.text}` : node.text;
            flatList.push(currentText);
            // Se o item tiver filhos, chama a função para eles também
            if (node.children) {
                flatList = flatList.concat(flattenTree(node.children, currentText));
            }
        });
        return flatList;
    }

    // Pega o elemento <datalist> do HTML
    const datalist = document.getElementById('subjects-list');
    // Gera a lista achatada de assuntos
    const flatSubjects = flattenTree(subjectTree);

    // Itera sobre a lista de assuntos e cria um <option> para cada um
    flatSubjects.forEach(subject => {
        const option = document.createElement('option');
        option.value = subject;
        datalist.appendChild(option);
    });
});
