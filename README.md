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

🛠️ Tecnologias Utilizadas
Frontend:

HTML5

Tailwind CSS

JavaScript (Vanilla JS)

Backend & Database:

Google Firebase:

Firestore: para o banco de dados NoSQL em tempo real.

Authentication: para o gerenciamento de usuários.

Bibliotecas:

jsPDF & jsPDF-AutoTable: para a geração dos relatórios em PDF.

🚀 Como Executar o Projeto
Para rodar este projeto, você precisará de uma conta no Firebase.

Clone o Repositório:

git clone [https://github.com/seu-usuario/seu-repositorio.git](https://github.com/seu-usuario/seu-repositorio.git)

Configure o Firebase:

Acesse o console do Firebase.

Crie um novo projeto.

No seu projeto, vá para Authentication e habilite o provedor Email/Senha.

Vá para Firestore Database, crie um banco de dados e inicie em modo de produção.

Nas regras do Firestore (Rules), cole o seguinte para permitir que apenas usuários logados acessem os dados:

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}

Nas configurações do seu projeto (Project settings), encontre e copie o objeto de configuração do Firebase para web (firebaseConfig).

Adicione suas Credenciais:

Abra o arquivo js/firebase-config.js.

Cole o objeto firebaseConfig que você copiou do console do Firebase.

Configure o Administrador:

Cadastre-se na sua própria aplicação.

No console do Firebase, vá em Authentication e copie o UID do seu usuário recém-criado.

Abra o arquivo js/pautas.js e cole o seu UID na constante ADMIN_UID.

Vá em Firestore Database, encontre a coleção users, o documento com seu UID e mude o campo status de "pending" para "approved".

Pronto!

Abra o arquivo index.html em seu navegador para começar a usar.

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
