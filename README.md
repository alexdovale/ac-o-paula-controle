SIGEP - Sistema de Gerenciamento de Pauta
SIGEP é uma aplicação web moderna, projetada para gerenciar em tempo real as pautas de atendimento da Defensoria Pública. O sistema oferece uma plataforma colaborativa para que múltiplos usuários possam organizar e acompanhar o fluxo de assistidos de forma justa, transparente e eficiente.

🎯 Sobre o Projeto
Este sistema foi criado para resolver a necessidade de um controle de pautas dinâmico e colaborativo. Ele substitui processos manuais por uma interface digital que organiza a fila de espera com base em uma lógica de prioridades justa, considerando pontualidade e urgência, e permite que toda a equipe veja as atualizações instantaneamente.

✨ Funcionalidades Principais
Autenticação de Usuários: Sistema seguro de login e cadastro, com um painel de administração para aprovação de novas contas.

Gerenciamento Multi-Pauta: Crie e gerencie múltiplas pautas de atendimento. O acesso é restrito aos membros convidados.

Colaboração em Tempo Real: Todas as alterações (chegadas, atendimentos finalizados, etc.) são sincronizadas instantaneamente para todos os membros da pauta através do Firestore.

Fila de Atendimento Inteligente: A fila de espera é ordenada automaticamente com base em uma lógica de prioridades que considera:

Urgência: Casos marcados como urgentes vão para o topo da fila.

Pontualidade: Recompensa assistidos que chegam no horário ou adiantados.

Tolerância a Atrasos: Gerencia atrasos de forma justa, sem prejudicar quem foi pontual.

Importação de Pauta (CSV): Carregue rapidamente uma lista de assistidos agendados a partir de um arquivo CSV.

Atendimentos Agendados e Avulsos: Suporte para ambos os tipos de atendimento em abas separadas.

Geração de Relatórios (PDF): Exporte um relatório em PDF com o resumo de todos os assistidos atendidos na pauta.

Progressive Web App (PWA): O sistema pode ser "instalado" em computadores e dispositivos móveis para acesso rápido e funcionamento offline.

SITE QUE USO: 
https://dashboard.emailjs.com/admin
https://firebase.google.com/


📂 Estrutura do Projeto
/
|-- index.html            # Página de Login
|-- pautas.html           # Página de seleção de pautas
|-- app.html              # Página principal da aplicação
|-- manifest.json         # Configuração do PWA
|-- sw.js                 # Service Worker para PWA
|-- css/
|   |-- style.css         # Estilos customizados
|-- js/
    |-- firebase-config.js# Configuração do Firebase
    |-- auth.js           # Lógica da página de login
    |-- pautas.js         # Lógica da página de pautas
    |-- app.js            # Lógica principal do gerenciador
    |-- utils.js          # Funções utilitárias (notificações, PWA)

📄 Licença
Este projeto está sob a licença MIT. Veja o arquivo LICENSE para mais detalhes.

👤 Autor
Desenvolvido por Alex do Vale com a colaboração do Gemini.
