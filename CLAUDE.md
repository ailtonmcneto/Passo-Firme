# Passo Firme — regras para o algoritmo

- Leia `docs/algoritmo.md` antes de mexer em `js/core/` ou `js/util/`. Ele é a especificação; se o código e o documento divergirem, pare e pergunte em vez de escolher sozinho.
- Tudo em `js/core/` e `js/util/` é função pura: sem DOM, sem IndexedDB, sem `Date.now()` nem `new Date()` sem argumento, sem `Math.random()`. A data de hoje entra sempre como parâmetro.
- Datas são strings locais `'YYYY-MM-DD'`. Nunca use `new Date('YYYY-MM-DD')`, que o JS interpreta como UTC e faz a data cair no dia anterior em São Paulo. Toda aritmética de datas passa por `js/util/datas.js`.
- O algoritmo usa só aritmética inteira, inclusive no SM-2 (ease factor em centésimos). Frações viram produto cruzado.
- Todo desempate segue a ordem canônica do `docs/algoritmo.md` §1. A saída tem que ser determinística, porque estes testes vão virar testes golden de uma reimplementação em Java na fase 2.
- Casos de teste com entrada e saída completas vão em `tests/fixtures/*.json`, para o porte em Java reaproveitar; o teste JS lê o JSON.
- Código, nomes e comentários em português, como no resto do repo. Comentários explicam o porquê, não o quê.
- Rode `npm run test:tz` antes de cada commit. Commits pequenos, um por módulo, com mensagens em português.
- No PR, explique as decisões não óbvias. A equipe está aprendendo JS e precisa entender o código para apresentá-lo.
