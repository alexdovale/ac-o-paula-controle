document.addEventListener('DOMContentLoaded', () => {
    // Estrutura de dados em árvore com textos e descrições dos assuntos
    const subjectTree = [
        { text: "Orientação Jurídica", description: "Prestação de informações e esclarecimentos gerais sobre direitos, deveres e as leis, auxiliando o cidadão a entender sua situação e as possíveis soluções legais." },
        { text: "Atendimento Jurídico Integral e Gratuito", description: "O serviço principal da Defensoria, oferecido a pessoas que não possuem condições financeiras para contratar um advogado, abrangendo todas as etapas e necessidades legais." },
        { text: "Ajuizamento e Acompanhamento de Ações Judiciais", description: "Início de processos legais perante o Poder Judiciário e o monitoramento de seu andamento até a decisão final." },
        { text: "Consultas Processuais", description: "Fornecimento de informações sobre o status e o andamento de processos judiciais ou administrativos em que o assistido é parte." },
        {
            text: "Processos Cíveis (gerais)",
            description: "Atuação em demandas judiciais que não se enquadram em áreas especializadas, como disputas de vizinhança, regularização de imóveis, questões condominiais, aluguel, despejo, indenizações diversas e problemas de posse.",
            children: [
                { text: "Ação de Obrigação de Fazer", description: "Ação para exigir que alguém (ou uma empresa/órgão) cumpra uma determinada tarefa ou realize um serviço." },
                { text: "Ação Declaratória de Nulidade", description: "Ação para pedir que a justiça declare a invalidade de um ato jurídico (ex: contrato, multa, cobrança)." },
                { text: "Ação de Indenização (Danos Morais e Materiais)", description: "Ação para buscar compensação financeira por prejuízos sofridos (perdas materiais) e/ou por abalos psicológicos, honra ou dignidade (danos morais)." },
                { text: "Ação Revisional de Débito", description: "Ação para contestar e pedir a alteração de valores de dívidas ou cobranças consideradas abusivas ou indevidas." },
                { text: "Ação de Exigir Contas", description: "Ação para solicitar que uma pessoa (ex: antigo curador, administrador) apresente detalhes e comprovantes de como administrou valores ou bens de outra." }
            ]
        },
        {
            text: "Processos de Família",
            description: "Atuação em questões jurídicas que envolvem relações familiares.",
            children: [
                { text: "Alimentos", description: "Ação para solicitar ou ajustar a pensão alimentícia.", children: [
                    { text: "Ação de Fixação de Alimentos", description: "Para determinar, pela primeira vez, o valor da pensão alimentícia." },
                    { text: "Ação de Majoração de Alimentos", description: "Para pedir o aumento do valor da pensão alimentícia." },
                    { text: "Ação de Oferta de Alimentos", description: "Para que o devedor ofereça formalmente um valor de pensão, buscando regularizar a situação." },
                    { text: "Ação de Alimentos Gravídicos", description: "Para que o futuro pai preste auxílio financeiro à gestante para cobrir despesas da gravidez." },
                    { text: "Ação de Alimentos Avoengos (contra avós)", description: "Para pedir pensão alimentícia aos avós, em caráter subsidiário e complementar, quando os pais não podem ou não conseguem arcar." }
                ]},
                { text: "Divórcio", description: "Ação para dissolver o vínculo matrimonial.", children: [
                    { text: "Divórcio Consensual", description: "Quando ambos os cônjuges concordam com todos os termos da separação (partilha, guarda, etc.)." },
                    { text: "Divórcio Litigioso", description: "Quando os cônjuges não chegam a um acordo sobre um ou mais termos da separação." }
                ]},
                { text: "União Estável", description: "Ação para reconhecer ou dissolver a união estável.", children: [
                    { text: "Reconhecimento e Dissolução de União Estável", description: "Para formalizar judicialmente o início e o fim de uma união estável." },
                    { text: "Reconhecimento / Dissolução de União Estável Post Mortem", description: "Para reconhecer e/ou dissolver uma união estável após o falecimento de um dos companheiros." },
                    { text: "Conversão de União Estável Homoafetiva em Casamento", description: "Para formalizar o casamento a partir de uma união estável entre pessoas do mesmo sexo." }
                ]},
                { text: "Guarda", description: "Ação para definir quem será responsável pelos cuidados e decisões sobre uma criança ou adolescente.", children: [
                    { text: "Guarda (pedida pelos pais)", description: "Quando os próprios genitores buscam a formalização da guarda." },
                    { text: "Guarda (pedida por outra pessoa que não o pai ou a mãe)", description: "Quando um terceiro (ex: avó, tio) busca a guarda de uma criança/adolescente, geralmente em situações excepcionais de incapacidade ou risco com os pais." },
                    { text: "Guarda Compartilhada", description: "Modalidade em que ambos os pais exercem a autoridade parental, mesmo separados, tomando decisões conjuntas sobre os filhos." }
                ]},
                { text: "Regulamentação de Convivência Familiar (Visitas)", description: "Ação para definir judicialmente os dias e horários em que o pai/mãe (ou avós/terceiros) terá contato com a criança/adolescente."},
                { text: "Investigação de Paternidade (DNA)", description: "Ação para buscar o reconhecimento judicial da paternidade biológica.", children: [
                    { text: "Investigação de Paternidade Cumulada com Alimentos", description: "Ação que, além de buscar o reconhecimento, já pede a fixação de pensão alimentícia." },
                    { text: "Investigação de Paternidade Pós Morte", description: "Ação de reconhecimento de paternidade após o falecimento do suposto pai." }
                ]},
                { text: "Curatela", description: "Medida judicial que nomeia um curador para gerir atos negociais e patrimoniais de um adulto que não pode exprimir sua vontade.", children: [
                    { text: "Procedimento de Fixação dos Limites da Curatela (antiga interdição)", description: "Processo para instituir a curatela, definindo os atos para os quais a pessoa precisará de assistência." },
                    { text: "Levantamento de Curatela", description: "Ação para encerrar a curatela quando a causa da incapacidade cessa ou a pessoa recupera a autonomia." }
                ]},
                { text: "Tutela", description: "Medida judicial que nomeia um tutor para cuidar de um menor que não tem pais ou cujos pais perderam o poder familiar." },
                { text: "Adoção", description: "Processo judicial para estabelecer um novo vínculo de filiação, em que uma criança ou adolescente se torna filho legal de pais adotivos." }
            ]
        },
        {
            text: "Processos Criminais",
            description: "Atuação jurídica relacionada a crimes.",
            children: [
                { text: "Defesa de Acusados em Processo Criminal", description: "Representação legal de pessoas que respondem a acusações criminais." },
                { text: "Acompanhamento do Cumprimento da Pena (Execução Penal)", description: "Atuação em favor de pessoas condenadas, para garantir seus direitos durante o cumprimento da pena (regime, progressão, benefícios)." },
                { text: "Atuação em Audiência de Custódia", description: "Assistência a pessoas presas em flagrante, avaliando a legalidade da prisão e buscando medidas alternativas." }
            ]
        },
        {
            text: "Processos de Fazenda Pública",
            description: "Demandas contra o Estado (União, Estados, Municípios) e seus órgãos.",
            children: [
                { text: "Fornecimento de Medicamentos", description: "Ação para compelir o Poder Público a fornecer medicamentos essenciais." },
                { text: "Indenizações contra o Poder Público", description: "Ações para buscar compensação por danos causados por atos ou omissões do Estado." },
                { text: "Previdência Social (estadual e municipal)", description: "Atuação em questões relacionadas a benefícios previdenciários de regimes próprios." },
                { text: "Questionamentos em Cobranças de Impostos, Taxas e Multas", description: "Ações para contestar cobranças indevidas de tributos ou multas por entes públicos." }
            ]
        },
        {
            text: "Processos de Infância e Juventude",
            description: "Ações focadas nos direitos de crianças e adolescentes.",
            children: [
                { text: "Vaga em Escolas e Creches", description: "Ação para garantir o acesso à educação, pleiteando matrícula em creches ou escolas públicas/conveniadas." },
                { text: "Profissionais de Apoio Escolar", description: "Ação para garantir a presença de mediadores ou outros profissionais de apoio para alunos com deficiência na escola." },
                { text: "Obrigação de Fazer (genérica)", description: "Ação para exigir que um órgão cumpra uma obrigação específica em favor da criança/adolescente." },
                { text: "Transporte (demanda de transporte gratuito)", description: "Ação para garantir o direito de transporte gratuito para crianças/adolescentes com deficiência ou necessidades específicas." }
            ]
        },
        { text: "Processos Relacionados a Direitos Humanos", description: "Atuação em casos de violação de direitos fundamentais." },
        { text: "Mediação e Conciliação", description: "Métodos de resolução de conflitos em que um terceiro imparcial auxilia as partes a chegarem a um acordo, evitando ou encerrando o processo judicial." },
        {
            text: "Facilitação de Acesso à Documentação Básica",
            description: "Auxílio na obtenção de documentos essenciais para o exercício da cidadania.",
            children: [
                { text: "Emissão de Carteira de Identidade (1ª e 2ª via)", description: "Apoio no processo para obter ou renovar o RG, incluindo gratuidade se necessário." },
                { text: "Emissão de Certidões (Nascimento, Casamento, Óbito - 1ª e 2ª via)", description: "Auxílio na obtenção de certidões, com foco na gratuidade para hipossuficientes." },
                { text: "Obtenção de 'Nada Consta'", description: "Apoio para obter certidões que atestam a inexistência de pendências legais." }
            ]
        },
        {
            text: "Atendimento em Demandas de Saúde (CRLS)",
            description: "Atuação na Câmara de Resolução de Litígios de Saúde, buscando soluções administrativas para acesso a medicamentos e procedimentos.",
            children: [
                { text: "Acesso a Medicamentos", description: "Conseguir o fornecimento de medicamentos pelo SUS ou plano de saúde." },
                { text: "Agendamento de Procedimentos Cirúrgicos ou Exames", description: "Agilizar a realização de procedimentos médicos." }
            ]
        },
        {
            text: "Orientação sobre Execução Penal",
            description: "Esclarecimentos sobre os direitos de pessoas que cumprem pena.",
            children: [
                { text: "Progressão de Regime", description: "Orientação sobre a mudança para regimes de pena menos rigorosos (Fechado, Semiaberto, Aberto)." },
                { text: "Visita Periódica ao Lar (VPL)", description: "Orientação sobre o direito a saídas temporárias para convivência familiar." },
                { text: "Trabalho/Estudo Extramuros", description: "Orientação sobre a possibilidade de trabalhar ou estudar fora do estabelecimento prisional." },
                { text: "Livramento Condicional", description: "Orientação sobre a liberdade antecipada sob condições." },
                { text: "Indulto", description: "Orientação sobre o perdão da pena concedido por decreto presidencial." }
            ]
        },
        {
            text: "Retificação de Registro Civil",
            description: "Ações para corrigir informações em documentos civis.",
            children: [
                { text: "Retificação de Dados Registrais (Nascimento, Casamento, Óbito)", description: "Correção de erros ou omissões em certidões." },
                { text: "Alteração de Gênero e Nome", description: "Processo para pessoas transgênero alterarem o nome e/ou gênero em seus documentos." }
            ]
        },
        {
            text: "Alvará Judicial",
            description: "Medida judicial simplificada para fins específicos.",
            children: [
                { text: "Alvará para Levantamento de Valores (FGTS, PIS/PASEP)", description: "Para autorizar o saque de valores específicos." },
                { text: "Alvará para Autorização de Viagem ao Exterior (para menor)", description: "Para suprir o consentimento de um dos pais em viagens internacionais de menores." }
            ]
        },
        { text: "Apoio Psicossocial", description: "Prestação de suporte que considera os aspectos psicológicos e sociais do assistido, integrando-o ao atendimento jurídico." },
        { text: "Defesa de Direitos Homoafetivos", description: "Atuação específica para a promoção e defesa dos direitos de pessoas LGBT." }
    ];

    // Função recursiva para achatar a árvore em uma lista de objetos { value, description }
    function flattenTreeWithObjects(nodes, parentPrefix = '') {
        let flatList = [];
        nodes.forEach(node => {
            const currentValue = parentPrefix ? `${parentPrefix} > ${node.text}` : node.text;
            flatList.push({ value: currentValue, description: node.description });

            if (node.children) {
                flatList = flatList.concat(flattenTreeWithObjects(node.children, currentValue));
            }
        });
        return flatList;
    }

    const datalist = document.getElementById('subjects-list');
    const subjectInput = document.getElementById('assisted-subject');
    const descriptionBox = document.getElementById('subject-description');
    const infoButton = document.getElementById('subject-info-btn');

    if (!datalist || !subjectInput || !descriptionBox || !infoButton) {
        console.error('Elementos essenciais para a lista de assuntos não foram encontrados.');
        return;
    }

    const flatSubjects = flattenTreeWithObjects(subjectTree);

    // Adiciona uma nova lista para pesquisa, incluindo a descrição.
    const searchableList = flatSubjects.map(item => ({
        text: item.description,
        value: item.value
    }));

    // Preenche o datalist com as opções de assunto. 
    // MANTÉM apenas o valor original (título completo) no option.
    flatSubjects.forEach(subject => {
        const option = document.createElement('option');
        option.value = subject.value;
        datalist.appendChild(option);
    });

    // Função para pesquisar e atualizar o datalist com base na pesquisa
    const searchAndFilterList = (query) => {
        // Limpa o datalist para que apenas os resultados da busca apareçam
        while (datalist.firstChild) {
            datalist.removeChild(datalist.firstChild);
        }

        // Transforma a busca e os textos em minúsculas para pesquisa sem distinção de maiúsculas/minúsculas
        const lowerCaseQuery = query.toLowerCase();

        // Filtra a lista 'searchableList' onde o texto OU a descrição contenham a busca
        const filteredSubjects = flatSubjects.filter(item =>
            item.value.toLowerCase().includes(lowerCaseQuery) ||
            item.description.toLowerCase().includes(lowerCaseQuery)
        );

        // Adiciona os resultados filtrados ao datalist
        filteredSubjects.forEach(subject => {
            const option = document.createElement('option');
            option.value = subject.value;
            datalist.appendChild(option);
        });
    };

    // Função para verificar e mostrar/ocultar a descrição e habilitar/desabilitar o botão
    const checkSubject = () => {
        const currentValue = subjectInput.value;
        const foundSubject = flatSubjects.find(subject => subject.value === currentValue);

        if (foundSubject && foundSubject.description) {
            descriptionBox.textContent = foundSubject.description;
            descriptionBox.classList.remove('hidden');
            infoButton.disabled = false;
        } else {
            descriptionBox.classList.add('hidden');
            descriptionBox.textContent = '';
            infoButton.disabled = true;
        }
    };
    
    // Adiciona ouvintes de evento ao campo de input
    // O evento 'input' agora chama a função de busca
    subjectInput.addEventListener('input', (e) => {
        searchAndFilterList(e.target.value);
        checkSubject(); // Mantém a verificação da descrição
    });

    // Adiciona um ouvinte para o evento 'change', que é disparado ao selecionar um item do datalist
    subjectInput.addEventListener('change', () => {
        let selectedText = subjectInput.value;
    
        // Lógica para pegar apenas a última parte após o '>'
        if (selectedText.includes(' > ')) {
            const parts = selectedText.split(' > ');
            selectedText = parts[parts.length - 1];
        }
        
        // Insere o texto processado no campo de input
        subjectInput.value = selectedText;
    
        // Chama a função de verificação para exibir a descrição
        checkSubject();
    });

    // Adiciona um ouvinte de clique para gerenciar a seleção e limpeza do campo.
    subjectInput.addEventListener('click', (e) => {
        const input = e.target;
        const isTextSelected = input.selectionStart === 0 && input.selectionEnd === input.value.length;

        // Se o texto já está todo selecionado (indicando um segundo clique),
        // limpa o campo para o usuário ver a lista completa de opções.
        if (isTextSelected) {
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            // Se não, o comportamento padrão do clique é selecionar todo o texto.
            input.select();
        }
    });

    // Adiciona ouvinte de evento ao botão de informação
    infoButton.addEventListener('click', () => {
        if (!infoButton.disabled) {
            descriptionBox.classList.toggle('hidden');
        }
    });

    // Chama a função de busca inicial para popular o datalist
    searchAndFilterList('');
});
