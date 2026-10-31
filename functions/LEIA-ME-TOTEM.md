# Totem de autoatendimento — configuração

O novo totem não acessa o Firestore. A página `totem.html` conversa só com duas Cloud Functions
(`totemConfig` e `totemCheckin`), então os dados dos assistidos (CPF, nome) deixam de ficar expostos no navegador.

## O que mudou
| Antes | Agora |
|---|---|
| Totem baixava todos os atendimentos da pauta no navegador | A busca é feita no servidor; o navegador só recebe o resultado |
| Link `?pautaId=...` (qualquer um podia usar) | Link com **token** (`?rec=...&t=...`), que você pode revogar |
| Só uma pauta por totem | Totem **geral** (todas as pautas da recepção no dia) ou **por pauta** |
| Logo e verde fixos | Logo, cores e nome do órgão configuráveis |
| Ticket com "DEFENSORIA PÚBLICA" fixo | Ticket com o nome do órgão configurado |

## Onde cada arquivo vai (estrutura do seu projeto)
Seu projeto tem tudo na raiz, exceto os `.js`, que ficam na pasta `js/`. Fica assim:

```
raiz do projeto/
├─ index.html            ← o seu, NÃO precisa mexer
├─ totem.html            ← NOVO, ao lado do index.html
├─ firebase.json         ← SUBSTITUA pelo novo (tem o hosting de antes + as funções)
├─ package.json          ← SUBSTITUA (só a descrição mudou)
├─ functions/            ← NOVA pasta
│   ├─ index.js
│   ├─ totem.js
│   └─ package.json      (é outro package.json, só da pasta functions)
└─ js/
    ├─ recepcaoCentral.js  ← SUBSTITUA
    └─ logos.js            ← NOVO
```

**Sobre o index.html:** não coloque nada dentro dele. O `totem.html` é uma página separada
(abre sozinha no computador/tablet do totem, no endereço `seu-site/totem.html`). O seu `index.html`
continua como está e segue carregando o `recepcaoCentral.js` do jeito de sempre.

O `firebase.json` novo mantém o seu hosting (`"public": "."`) e acrescenta duas coisas:
- `ignore`: impede que a pasta `functions/` (código das funções) e os `.md`/`.exemplo` sejam publicados no site;
- um cabeçalho para o `totem.html` sempre baixar a versão mais nova (o totem não fica com versão velha em cache).

## 1. Pré-requisitos
- Projeto Firebase no plano **Blaze** (obrigatório para Cloud Functions; o uso do totem cabe com folga na cota gratuita).
- Node.js 20 e o Firebase CLI: `npm install -g firebase-tools`

## 2. Publicar as funções
1. Copie a pasta `functions/` para a raiz do projeto (ao lado do `firebase.json`) e
   substitua o `firebase.json` pelo que veio neste pacote.
2. Terminal, na raiz do projeto:
   ```bash
   firebase login
   firebase use pauta-ce162
   cd functions && npm install && cd ..
   firebase deploy --only functions
   ```
3. Ao terminar, o deploy mostra a URL de cada função. Teste no navegador:
   `https://southamerica-east1-pauta-ce162.cloudfunctions.net/totemConfig`
   → deve responder `{"erro":"parametros-invalidos"}` (isso é o esperado: a função está no ar).
4. Se essa URL não responder, use as URLs `...a.run.app` que o deploy mostrou e troque os dois valores
   em `URLS` no começo do script de `totem.html`.

## 3. Regras do Firestore
Publique o que está em `firestore.rules.exemplo` **somando** às suas regras atuais (coleções `totens` e `totem_limites`).
Não restrinja a leitura das pautas antes de ler o aviso no próprio arquivo (o painel de TV pode depender dela).

## 4. Publicar o site (totem.html e os .js)
Com `totem.html` na raiz (ao lado do `index.html`) e `recepcaoCentral.js` / `logos.js` na pasta `js/`:
```bash
firebase deploy --only hosting
```
O botão "Totem" monta o link a partir do endereço do seu sistema, trocando `index.html` por `totem.html`.

## 5. Usar
1. Abra a **Recepção Central** do setor: isso ativa o totem **do dia**.
2. Em **Painel TV**, preencha **nome do órgão**, **logo** e **cores** e salve.
3. Clique em **Totem** (cabeçalho = todas as pautas; dentro de uma pauta = só ela).
4. Copie o link (ou use o QR code) e abra no computador/tablet do totem, em tela cheia.
5. Em **Gerar novo link** você revoga o link anterior (ex.: link vazou ou totem trocado de lugar).

Os links antigos (`?pautaId=...`) deixam de funcionar. Gere um novo para cada totem.

## Regras de funcionamento
- O totem só funciona no dia em que a recepção foi aberta. Se ninguém abrir a recepção, ele avisa "não foi ativado hoje".
- Pautas criadas depois entram quando a recepção for recarregada.
- Agendamentos **cancelados** não geram senha. Quem já está na fila, em atendimento ou finalizado recebe "já confirmou".
- Se o CPF estiver em mais de uma pauta, o assistido escolhe a dele na tela.
- Cada IP pode fazer até 20 tentativas por minuto; passou disso, recebe aviso para aguardar.
- A tela volta ao início sozinha após 60 s sem toque.
- A função grava `status`, `arrivalTime`, `checkInOrder` e `checkInOrigem: "totem"` no atendimento.
  Ela **não passa** pelo `PautaService.updateStatus`; se esse método registra histórico/log, o check-in do totem não aparecerá nele.

## Manutenção
- Logs: `firebase functions:log --only totemCheckin` (sem CPF; só ids).
- A coleção `totem_limites` cresce pouco (um documento por IP). Se quiser, limpe de tempos em tempos.
- Teste local da lógica (sem Firebase): `node functions/test.js`

## Cores
A cor do texto sobre botões é calculada automaticamente (claro/escuro) para manter a leitura. Sem cores configuradas, vale o verde padrão.
