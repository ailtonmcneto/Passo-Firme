# Passo Firme — guia para agentes de código

Vale para qualquer agente (Claude Code, Codex ou outro). Este arquivo só traz regras e aponta onde está cada coisa; o conteúdo fica nos documentos de `docs/`.

## Regras comuns

- As especificações são a fonte de verdade: `docs/algoritmo.md` para o algoritmo e `docs/front.md` para as telas e o contrato com a fachada. Se o código e o documento divergirem, pare e pergunte em vez de escolher sozinho.
- Se a especificação não cobrir um caso, decida o mínimo, registre a decisão no documento correspondente e liste-a na descrição do PR.
- Código, nomes e comentários em português, como no resto do repo. Comentários explicam o porquê, não o quê.
- ES Modules, sem frameworks e sem dependências de runtime (Chart.js via CDN é a única exceção prevista).
- Uma branch por tarefa, a partir da main. Rode `npm run test:tz` antes de cada commit. Commits pequenos, com mensagens em português; no algoritmo, um commit por módulo.
- Não faça merge. Faça o push da branch e entregue a descrição do PR (o `gh` pode não estar instalado).
- No PR, explique as decisões não óbvias. A equipe está aprendendo JS e precisa entender o código para apresentá-lo.

## Ao mexer em `js/core/` ou `js/util/` (algoritmo)

- Leia `docs/algoritmo.md` antes de começar.
- Tudo em `js/core/` e `js/util/` é função pura: sem DOM, sem IndexedDB, sem `Date.now()` nem `new Date()` sem argumento, sem `Math.random()`. A data de hoje entra sempre como parâmetro.
- Datas são strings locais `'YYYY-MM-DD'`. Nunca use `new Date('YYYY-MM-DD')`, que o JS interpreta como UTC e faz a data cair no dia anterior em São Paulo. Toda aritmética de datas passa por `js/util/datas.js`.
- O algoritmo usa só aritmética inteira, inclusive no SM-2 (ease factor em centésimos). Frações viram produto cruzado.
- Todo desempate segue a ordem canônica do `docs/algoritmo.md` §1. A saída tem que ser determinística, porque estes testes vão virar testes golden de uma reimplementação em Java na fase 2.
- Casos de teste com entrada e saída completas vão em `tests/fixtures/*.json`, para o porte em Java reaproveitar; o teste JS lê o JSON.

## Ao mexer nas telas (`index.html`, `pages/`, `css/`, `js/ui/`) ou na fachada (`js/api.js`)

- Leia `docs/front.md` antes de começar.
- A tela nunca calcula: só chama as funções de `js/api.js`. Nada em `js/ui/` importa de `js/core/` ou de `js/db.js`.
- `js/api.js` é o único lugar que junta `js/core/` e `js/db.js`. Mudanças no contrato da fachada passam primeiro pelo `docs/front.md` §5.
- A data de hoje é obtida uma vez na tela com `hojeLocal(new Date())` e passada à fachada. Para exibir datas, use `Intl.DateTimeFormat('pt-BR')` a partir das strings `'YYYY-MM-DD'`.
- Siga o vocabulário e o tom do `docs/front.md` §7. Nunca punir: bloco não feito não fica vermelho nem vira "atraso".
- Estados visuais não podem depender só de cor (`docs/front.md` §3.6).
