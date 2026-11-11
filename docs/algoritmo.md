# Especificação do algoritmo — Passo Firme

Fonte de verdade para `js/core/` e `js/util/`. Todas as decisões foram fechadas em 04/11/2026.
Os testes destes módulos são a especificação que a versão Java (fase 2) terá que reproduzir.

Pipeline: capacidade → viabilidade → alocação → sequenciamento → revisões, com replanejamento (que roda o pipeline de novo) durante o uso.

## 1. Convenções

- **Datas:** strings 'YYYY-MM-DD' no calendário local. A aritmética fica em `js/util/datas.js`, que converte internamente com `Date.UTC` e lê com `getUTC*`. Dia da semana: 0 = domingo … 6 = sábado.
  - Data inválida lança `RangeError`.
  - `somarDias(s, n)` exige `n` inteiro; senão lança `RangeError`.
  - `intervaloDeDatas(inicio, fim)` com `fim` antes de `inicio` devolve `[]`. Quem precisa tratar isso como erro valida antes (a capacidade faz isso, §3).
- **Inteiros:** nenhuma etapa usa float. Uma divisão `a×b / c` vira `Math.floor(a*b/c)` com resto `(a*b) % c`; frações se comparam por produto cruzado. A retenção (§8) é a única exceção, porque só serve para ordenar e exibir.
- **Ordem canônica (R1):** tópicos são ordenados por **prioridade decrescente**, desempatando pela **`ordem` de cadastro crescente**. `ordem` é o índice de cadastro do tópico (padrão: a posição no array de entrada). "Menor prioridade" é o último nessa ordem. O pseudo-tópico `RESERVA` não entra na ordem canônica: ele não é matéria e só existe no sequenciador, que tem a sua própria regra para ele (§6).
  - A ordem existe uma única vez no código: `compararCanonico(a, b)` em `core/prioridade.js`, que recebe objetos com `{ prioridade, ordem }` já prontos. Toda etapa que desempata pela ordem canônica importa esse comparador.
  - `ordenarPorPrioridade(topicos)` calcula a prioridade a partir de `peso` e `dominio` e ordena com `compararCanonico`, sem mutar a entrada. Se dois tópicos repetirem `ordem`, mantêm a posição de entrada (ordenação estável).
- **Pureza:** nenhuma função lê o relógio; "hoje" chega como parâmetro.

## 2. Fórmulas base (`core/prioridade.js`)

- `prioridade = peso × (6 − dominio)`, de 1 a 25.
- `demandaMinima = 6 − dominio`, de 1 a 5.
- `peso` e `dominio` são inteiros de 1 a 5; fora disso, a função lança `RangeError`.
- **Demanda de um tópico:** `blocosDesejados`, quando o aluno preencheu (tópico *manual*); senão, `demandaMinima`. `ehManual(t)` é a única definição de "preencheu": `blocosDesejados` inteiro ≥ 1. No replanejamento, a demanda é o *restante* (§10). Se o tópico tiver `demandaRestante` (inteiro ≥ 0, não `undefined` nem `null`), ela substitui a demanda, inclusive de tópico manual; valor inválido lança `RangeError`. Esta é a única definição da regra: `montarEntradaAlocacao` (§5), `avaliarViabilidade` (§4) e `avaliarRetaFinal` (§6.1) usam `demanda(t)`.
- A autoavaliação alimenta só o SM-2. O domínio declarado não muda automaticamente.

## 3. Etapa 1 — Capacidade (`core/capacidade.js`)

- Constantes: `MINIMO_BLOCO_MIN = 15`; fração de estudo = 4/5.
- `blocosNoDia(minutos, duracaoBlocoMin = 30)` devolve a lista de durações:
  - `minutos ≥ dur`: `n = floor(minutos/dur)` e `sobra = minutos − n·dur`. São n−1 blocos de `dur` e um último de `dur + sobra`.
  - `15 ≤ minutos < dur`: um bloco de `minutos`.
  - `minutos < 15`: nenhum bloco.
  - Todo bloco conta 1 na capacidade, qualquer que seja a duração (R6).
  - `minutos` tem que ser inteiro ≥ 0, e `duracaoBlocoMin` inteiro ≥ `MINIMO_BLOCO_MIN`; senão lança `RangeError`. Duração 0 daria divisão por zero, e um bloco abaixo do mínimo não faz sentido.
- `calcularCapacidade({ inicio, fim, disponibilidade, diasFolga = [], duracaoBlocoMin = 30, dataAvaliacao = null })`:
  - `fim` antes de `inicio` lança `RangeError`.
  - `disponibilidade` é um objeto ou array indexado por dia da semana (0–6), com os minutos de cada dia. Dia da semana sem valor conta como 0 minutos.
  - `dataAvaliacao` fora de `[inicio, fim]` é aceita sem erro: antes de `inicio`, o período inteiro é reserva; depois de `fim`, o período inteiro é janela. Avaliação antes do início é legítima no replanejamento depois da prova. A validação na criação do plano fica em `util/validacao.js`, não aqui.
  - Percorre `[inicio, fim]` inclusive. Dia que está em `diasFolga` não gera bloco.
  - **Janela de estudo (R8):** sem `dataAvaliacao`, é o período inteiro. Com ela, são os dias até `dataAvaliacao` inclusive, e os dias depois da avaliação são inteiros de reserva. A janela mantém os 20% de reserva, para revisar antes da prova; o período depois dela serve para quem tem avaliação intermediária ou conteúdo cumulativo. Os dois casos são válidos (escola e faculdade).
  - `capacidadeTotal` conta os blocos da janela e `capacidadeEstudo = floor(capacidadeTotal × 4 / 5)` (R3).
  - `capacidadeReserva` é `capacidadeTotal − capacidadeEstudo` mais todos os blocos depois da avaliação.
  - Retorna `{ dias: [{ data, blocos: [durações], naJanela }], capacidadeTotal, capacidadeEstudo, capacidadeReserva }`.
- **Slots ocupados:** `calcularCapacidade` aceita `ocupados = []`, uma lista de `{ data, ordem }` de slots já usados por blocos mantidos no replanejamento (§10.1). O slot é tirado do dia antes de contar a capacidade. Um ocupado sem slot correspondente (o dia tem menos blocos, por exemplo depois de mudar os horários) é ignorado.
- O dia que perdeu algum slot ganha `ordens`: as posições reais (1..n) dos slots que sobraram, alinhadas com `blocos`. Os outros dias não têm o campo, para a saída não mudar para quem não usa `ocupados`.

## 4. Etapa 2 — Viabilidade (`core/viabilidade.js`)

- `demandaTotal = Σ demanda(i)`. O plano é viável se e só se `capacidadeEstudo ≥ demandaTotal`, e `deficit = max(0, demandaTotal − capacidadeEstudo)`.
- `cobertura.percentual = floor(100 × min(capacidadeEstudo, demandaTotal) / demandaTotal)`.
- Se for inviável, calcula as três escapatórias:
  1. **Mais tempo (R4, por simulação):** recalcula a capacidade em vez de dividir o déficit.
     - `minutosPorDia` é o menor múltiplo de 5 em [5, 480] que, somado a cada dia da semana com disponibilidade > 0, faz `capacidadeEstudo ≥ demandaTotal`. Se nenhum servir, `null`.
     - `diasAMais` é o menor k em [1, 365] tal que estender `fim` em k dias resolve, com o `novoFim` correspondente. Se nenhum servir, `null`. Se houver `dataAvaliacao`, não existe essa opção e o campo vem `null`.
  2. **Reduzir demanda (R5):** enquanto houver déficit, tira 1 bloco do tópico de *menor* prioridade (ordem canônica) que ainda tenha demanda > 1. Devolve `{ id, antes, depois }` por tópico e `suficiente` (se o déficit fechou).
  3. **Remover tópicos:** retira tópicos inteiros, do de menor prioridade para o de maior, até `demanda ≤ capacidadeEstudo`. Devolve `removidos` (ids, na ordem de remoção) e `demandaRestante`.
- **Bloqueio (R16):** `bloqueante = capacidadeEstudo < número de tópicos com demanda > 0`. A função só informa; quem decide o que fazer é o chamador (§10).
- Para um plano `bloqueante`, só "mais tempo" e "remover tópicos" resolvem. "Reduzir demanda" nunca resolve, porque não baixa nenhum tópico abaixo de 1.
- O plano é gerado mesmo inviável, com uma exceção: na criação, um plano `bloqueante` não é gerado até o aluno escolher uma escapatória. Na escapatória 2, as demandas `depois` entram no alocador; na 3, os tópicos removidos saem da entrada.
- **Assinatura:** `avaliarViabilidade({ plano, topicos })`, em que `plano` é a entrada de `calcularCapacidade` e cada tópico tem `{ id, nome, peso, dominio, blocosDesejados?, ordem? }`. Retorna `{ viavel, bloqueante, capacidadeEstudo, demandaTotal, deficit, cobertura: { percentual }, escapatorias }`, com `escapatorias = null` quando o plano é viável. `capacidadeTotal` não faz parte do retorno; quem precisa dele chama `calcularCapacidade`.
- **Sem tópicos** (`demandaTotal = 0`): o plano é viável e `cobertura.percentual = 100`, para não dividir por zero.
- **Formato das escapatórias:**
  - `maisTempo = { minutosPorDia, diasAMais, novoFim }`. `novoFim` é `null` sempre que `diasAMais` é `null`.
  - As duas buscas reaproveitam `calcularCapacidade`, então os dias de folga continuam sem blocos e a janela continua terminando em `dataAvaliacao`. Os dias somados em `minutosPorDia` são os com disponibilidade > 0, inclusive os que hoje ficam abaixo de 15 min.
  - `reduzirDemanda = { topicos: [{ id, antes, depois }], suficiente }`. A lista traz todos os tópicos, inclusive os que não mudaram, na ordem de entrada (cadastro), para a interface mostrar a lista como o aluno a montou. A ordem canônica decide só de quem os blocos saem.

### 4.1 Validação na criação (`util/validacao.js`)

`validarPlano(plano)` lança `RangeError` quando `inicio` ou `fim` são inválidos, `fim` vem antes de `inicio`, `dataAvaliacao` está fora de `[inicio, fim]` (as bordas valem), algum dia da semana em `disponibilidade` não é inteiro ≥ 0, ou `duracaoBlocoMin` não é inteiro ≥ `MINIMO_BLOCO_MIN`. Sem `dataAvaliacao` e sem `duracaoBlocoMin`, valem os padrões (`null` e 30). Só `gerarCronograma` a chama; a capacidade, a viabilidade e o replanejamento não, porque avaliação antes do início é legítima depois da prova (§3).

## 5. Etapa 3 — Alocação (`core/alocador.js`)

Entrada: `alocar({ topicos: [{ id, prioridade, demanda, manual = false, ordem? }], capacidade })`.
O alocador não sabe se está na geração inicial ou num replanejamento: quem chama passa a demanda certa.

**Maiores restos (`maioresRestos(topicos, n)`), auxiliar exportado:** distribui n blocos em proporção à prioridade.
- Com `S = Σp`, cada tópico recebe `quota = floor(p·n / S)` e fica com `resto = (p·n) % S`.
- As sobras vão 1 a 1 por resto decrescente; empate de resto segue a ordem canônica.

**Caso viável (C1), quando `Σ demanda ≤ capacidade`:**
1. Cada tópico recebe sua demanda.
2. O excedente `capacidade − Σ demanda` é distribuído por `maioresRestos` entre os tópicos **não manuais com demanda > 0**.
3. Se nenhum tópico for elegível, o excedente volta como `sobra` e vai para a reserva.

**Caso inviável, quando `Σ demanda > capacidade`:**
1. Tópicos com demanda 0 ficam de fora.
2. **Mais tópicos que blocos (R16):** se `capacidade < número de tópicos`, os `capacidade` primeiros na ordem canônica recebem 1 bloco e os demais 0, cada um com o aviso `{ id, tipo: 'TOPICO_SEM_BLOCO' }`. Na criação isso nunca chega aqui, porque o pipeline bloqueia antes (§4); só o replanejamento passa por este caso.
3. Senão, aplica o piso: cada tópico recebe 1, e `resto = capacidade − n`.
4. **Divisão entre grupos (R7):** o `resto` é dividido entre o grupo dos tópicos manuais e o dos automáticos, na proporção do que falta a cada grupo. O que falta a um tópico é `demanda − 1`; o do grupo é a soma disso.
   - `parteManual = floor(resto·Fm / F)` e `parteAuto = floor(resto·Fa / F)`, com `F = Fm + Fa`.
   - Se sobrar 1 bloco, ele vai ao grupo de maior resto `(resto·Fx) % F`; em empate, ao manual, porque o aluno pediu aquele número explicitamente.
5. **Grupo manual, proporcional ao pedido:** `parteManual` é distribuída por maiores restos usando como peso o que falta a cada tópico (`blocosDesejados − 1`), e não a prioridade. Como a parte é menor que o que falta, nenhum tópico passa do que pediu.
6. **Grupo automático, enchimento com teto:** enquanto houver `parteAuto > 0` e tópicos ativos (que ainda não atingiram a demanda), calcula `maioresRestos(ativos, parteAuto)` pela prioridade.
   - Se nenhum tópico recebeu pelo menos o que lhe falta, aplica a distribuição e encerra.
   - Senão, os tópicos saturados recebem exatamente o que lhes falta e saem dos ativos; a parte diminui e o passo se repete.
7. Tópico manual com 1 bloco ou mais que recebeu menos que `blocosDesejados` gera o aviso `{ id, tipo: 'QUOTA_MANUAL_REDUZIDA', desejado, recebido }`. Tópico com 0 blocos recebe só o aviso `TOPICO_SEM_BLOCO`.
8. Sem tópicos manuais, os passos 4 a 6 se reduzem ao enchimento com teto sobre todos.

Saída: `{ blocos: { [id]: n }, sobra, viavel, avisos: [] }`.

Invariantes:
- viável: `Σ blocos + sobra = capacidade`, com cada tópico ≥ demanda;
- inviável: `Σ blocos = capacidade`, com cada tópico ≤ demanda.

### 5.1 Decisões de implementação

- **`montarEntradaAlocacao(topicos)`** converte `{ id, peso, dominio, blocosDesejados?, demandaRestante?, ordem? }` em `{ id, prioridade, demanda, manual, ordem }`, com `ordem` sempre preenchido (o índice quando falta).
  - **`demandaRestante`:** a regra está na §2, dentro de `demanda(t)`; `montarEntradaAlocacao` só chama `demanda(t)`. Quem calcula o valor é o replanejador (§10.4).
- **Pedido do manual no alocador:** a entrada do alocador não tem `blocosDesejados`; o pedido de um tópico manual é a sua `demanda`. Nos passos 4, 5 e 7, "o que falta" é `demanda − 1` e o `desejado` do aviso é a `demanda`. Na criação isso é o próprio `blocosDesejados`; no replanejamento, o restante.
- **`maioresRestos(topicos, n)`** devolve um array de inteiros alinhado com a entrada (`quotas[i]` é de `topicos[i]`). `ordem` ausente vale o índice. `n` tem que ser inteiro ≥ 0; `n > 0` com soma das prioridades 0 (inclusive sem tópicos) lança `RangeError`.
- **Validação de `alocar`:** `capacidade` e cada `demanda` têm que ser inteiros ≥ 0; senão lança `RangeError`. `manual` só é verdadeiro se for `true`.
- **Tópico com demanda 0:** aparece em `blocos` com 0 nos dois casos e não gera aviso, porque já terminou.
- **Avisos** saem na ordem de entrada (cadastro), como a lista de `reduzirDemanda` (§4). Só o caso inviável gera avisos.
- **Enchimento com teto:** tópico automático com demanda 1 já está no teto depois do piso e não começa entre os ativos.

## 6. Etapa 4 — Sequenciamento (`core/sequenciador.js`)

O sequenciador decide **em que ordem** os blocos de cada matéria aparecem. Quantos são, já veio da alocação (§5).

- **Entrada:** a capacidade (§3), a alocação (§5) e as matérias no formato `{ id, prioridade, ordem }` (a saída de `montarEntradaAlocacao`). O sequenciador não decide o modo: recebe `modoCobertura` (true ou false) de quem chama.
- **Reserva (C4):** é o pseudo-tópico `RESERVA`. Sua quota é `capacidadeTotal − capacidadeEstudo + sobra`; no modo cobertura, só `sobra`. Ela entra no sequenciamento como as matérias, o que espalha os blocos livres pelo período. Os dias depois da avaliação (`naJanela` false) são inteiros `RESERVA` e não entram no N.
  - A RESERVA não é matéria: não tem prioridade nem ordem de cadastro. Por isso a regra dela fica no sequenciador, e o `compararCanonico` continua comparando só matérias.
- **Posição ideal:** N é `capacidadeTotal`, o número de slots da janela, e tem que ser igual à soma das quotas (matérias + RESERVA); senão, `RangeError`. A posição do k-ésimo bloco (k = 0 … quota−1) é `(2k+1)·N / (2·quota)`. Para comparar `(a, kₐ)` com `(b, k_b)`, compare `(2kₐ+1)·q_b` com `(2k_b+1)·qₐ`.
- **Desempate**, nesta ordem:
  1. menor quota primeiro;
  2. a `RESERVA` vem depois da matéria: o estudo acontece primeiro e o bloco livre logo depois, que é onde as revisões (que vencem dias depois do estudo) precisam dele;
  3. entre matérias, `compararCanonico` (§1).
  - Não há outro critério. Dois blocos da mesma matéria nunca têm a mesma posição, e duas matérias empatadas na posição e na quota têm o mesmo k. Verificado por força bruta em 09/11/2026 (1 a 6 matérias, quotas de 1 a 12): nenhum empate passa do critério 3.
- **Blocos seguidos (R13):** não há correção. A posição ideal já intercala as matérias quando a proporção permite; quando uma matéria ocupa a maior parte do período, blocos seguidos são aceitos.
- **Mapeamento:** consome os blocos de cada dia na ordem e gera `{ data, ordem (1..n no dia), topicoId, tipo, duracaoMin }`, com `tipo` `ESTUDO`, ou `RESERVA` com `topicoId` null. A `ordem` de cada bloco é `dia.ordens[i]` quando o dia tem `ordens` (§3), e `i + 1` nos outros.

### 6.1 Reta final (modo cobertura, R9) — `core/cobertura.js`

Para a situação "prova em poucos dias e não cabe tudo". O sistema **detecta e pergunta**; nunca ativa sozinho.

- **Data-alvo:** `dataAvaliacao` ou, sem ela, `fim`.
- **Condição:** o plano não cabe (`viavel` false na viabilidade normal, §4) **e** `0 ≤ diferencaEmDias(hoje, dataAlvo) ≤ 3`. Exemplo: hoje 09, prova 12 → vale; hoje 08 → não vale.
- **Resposta do aluno:** `plano.respostaCobertura = null | { resposta: 'ACEITO' | 'RECUSADO', dataAlvo }`. A resposta só vale se a sua `dataAlvo` for a data-alvo atual do plano; se a prova mudou de data, conta como `null`. Assim a pergunta é feita uma vez por prova.
- **Ativa se e só se** a resposta válida é `ACEITO` **e** a condição vale. Se o plano voltar a caber, o modo se desliga sem nova pergunta; se deixar de caber de novo antes da prova, volta sem perguntar.
- `estadoCobertura({ plano, viabilidade, hoje })` devolve:
  - `NAO_SE_APLICA`: a condição não vale (mesmo com ACEITO guardado);
  - `PERGUNTAR`: a condição vale e não há resposta válida;
  - `RECUSADA`: a condição vale e a resposta é RECUSADO (a tela oferece o botão para ativar);
  - `ATIVA`: a condição vale e a resposta é ACEITO.
- `avaliarRetaFinal({ plano, topicos })` dá os números da quinta saída: `capacidadeEstudo = capacidadeTotal` (a reserva da janela vira estudo), `cobertura.percentual = floor(100·min(capacidadeTotal, demandaTotal) / demandaTotal)` e `bloqueante = capacidadeTotal < número de matérias com demanda > 0`. A demanda segue as mesmas regras da viabilidade (inclusive `demandaRestante`).
- **Com o modo ativo:**
  - a alocação usa `capacidade = capacidadeTotal` (quem faz isso é o pipeline);
  - a sequência é um **revezamento** na ordem canônica: uma rodada com um bloco de cada matéria, depois as seguintes pulando quem esgotou; se houver `RESERVA` (sobra), ela entra por último em cada rodada;
  - as revisões ficam suspensas até a data-alvo (§9).
- **Na criação:** é a quinta saída da viabilidade, uma escolha única (não se combina com reduzir passagens nem tirar matérias). Está disponível quando a condição vale e `avaliarRetaFinal` não é bloqueante, inclusive quando o plano normal é bloqueante. Escolher grava `respostaCobertura = { resposta: 'ACEITO', dataAlvo }`.

### 6.2 Decisões de implementação

- **`quotas`** é um objeto `{ [id]: n }`, com `RESERVA` como chave da reserva. Matéria sem chave tem quota 0. Lançam `RangeError`: quota que não é inteiro ≥ 0, quota de um id que não está entre as matérias (não teria como desempatar) e matéria com id `RESERVA`. `ordem` ausente vale o índice, como no alocador.
- **`mapearParaDias(sequencia, dias)`** lança `RangeError` se o número de slots da janela for diferente do tamanho da sequência.
- **`sequenciar`** confere a soma das quotas contra `capacidadeTotal` também no modo cobertura: o revezamento não usa N, mas uma soma errada sobraria ou faltaria slot no mapeamento. Devolve o array de blocos na ordem dos dias.
- **`avaliarRetaFinal`** devolve `{ capacidadeEstudo, demandaTotal, cobertura: { percentual }, bloqueante }`. A demanda vem de `montarEntradaAlocacao` (§5.1), que é a regra da viabilidade e respeita `demandaRestante`. Sem demanda, a cobertura é 100%, como na viabilidade.
- **`respostaCobertura`** ausente conta como `null`, assim como uma `resposta` que não seja `ACEITO` nem `RECUSADO`.

## 7. SM-2 (`core/sm2.js`)

O SM-2 decide quando cada matéria deve voltar como revisão. O estado dele **não é gravado**: é sempre recalculado a partir dos blocos concluídos, do mesmo jeito que o cronograma é sempre regenerado. Assim não existe estado que possa ficar diferente do histórico.

- **Estado** de uma matéria: `{ efCentesimos, intervalo, repeticoes, ultimaRevisao, proximaRevisao }`. O inicial é `{ 250, 0, 0, null, null }`.
- **Inteiros:** o ease factor fica em centésimos (250 = 2,50). Em ponto flutuante, 1,94 vira 1,9399999999999997, e 25 × 1,94 = 48,5 arredonda para 48 em vez de 49; numa varredura de todas as sequências de até 10 respostas, 4.965 intervalos saíram diferentes do valor exato. Com inteiros, a conta é exata em JS, em Java e no papel.
- `proximaRevisao(estado, qualidade)`, a fórmula de uma repetição:
  - qualidade < 3: `{ ef inalterado, intervalo 1, repeticoes 0 }`;
  - senão: `ef = max(130, ef + 10 − (5−q)·(8 + (5−q)·2))`, que dá +10 para q = 5, 0 para q = 4 e −14 para q = 3;
  - o intervalo é 1 se repeticoes = 0, 3 se repeticoes = 1, e `floor((intervalo·ef + 50) / 100)` nos demais casos (arredondamento meio-para-cima, só com inteiros);
  - as repetições somam 1.
- **Ordem das conclusões:** `concluidoEm` crescente, depois `sequenciaConclusao` crescente. Nunca pelo `id`, que é a ordem de criação dos blocos, não a de conclusão.
- **Uma repetição por dia:** repetir no mesmo dia não espaça. Por isso cada matéria conta no máximo uma repetição por dia, e vale a **última** resposta daquele dia.
- **C5:** qualquer bloco concluído da matéria, de ESTUDO ou de REVISAO (inclusive os extras), conta. Blocos PENDENTE, PULADO e PERDIDO não contam.
- `estadoDoTopico(blocosDoTopico)`: percorre os blocos concluídos da matéria na ordem das conclusões, agrupa por `concluidoEm` e aplica `proximaRevisao` uma vez por dia, com a qualidade da última conclusão do dia. `ultimaRevisao` é o último dia com conclusão, e `proximaRevisao = ultimaRevisao + intervalo`.
- `estadosPeloHistorico(blocos)`: devolve um `Map` de `topicoId` para o estado, só com as matérias que têm pelo menos uma conclusão. Agrupa os blocos por matéria e chama `estadoDoTopico` em cada grupo: O(n log n) no total. Quem precisa dos estados (revisões, retenção, replanejamento) chama esta função **uma vez** e consulta o mapa; nunca recalcula bloco a bloco.
- **Autoavaliação (R15):** `QUALIDADE_POR_RESPOSTA`:
  - `EXPLIQUEI_SEM_CONSULTAR` = 5
  - `ENTENDI_MAS_TRAVARIA` = 3
  - `NAO_ENTROU` = 1

### 7.1 Decisões de implementação

- **`proximaRevisao`** devolve só `{ efCentesimos, intervalo, repeticoes }`. As datas ficam com `estadoDoTopico`, que sabe em que dia cada repetição aconteceu. O intervalo da terceira repetição em diante usa o ef já atualizado, como no SM-2 original.
- **`conclusoesEmOrdem(blocos)`** também é exportada: filtra os blocos CONCLUIDO, valida e ordena (§7). É o único lugar com a ordem das conclusões; o estimador (§12) a importa, como as etapas importam `compararCanonico`. Blocos PENDENTE, PULADO e PERDIDO são ignorados sem validação.
- **Validação (RangeError)**, só nos blocos CONCLUIDO: `qualidade` que não seja inteiro de 0 a 5, `concluidoEm` inválido, `sequenciaConclusao` que não seja inteiro ≥ 0 e duas conclusões com a mesma `sequenciaConclusao`. Em `estadosPeloHistorico`, a repetição é conferida entre todas as matérias, porque a sequência é única no plano.
- **Bloco sem `topicoId`** (uma RESERVA) não é matéria e fica fora de `estadosPeloHistorico`.
- **Sem conclusões**, `estadoDoTopico` devolve uma cópia de `ESTADO_INICIAL` (que é congelado).

## 8. Retenção e explicabilidade (`core/retencao.js`)

- `retencao(diasDesdeUltima, S) = e^(−t/S)`, com `t` = dias desde `ultimaRevisao` e `S = max(1, intervalo)`, os dois tirados do estado do SM-2 (§7) (R14). É float, mas só serve para ordenar e exibir; os testes comparam com tolerância.
- O desempate por retenção é feito por inteiros: ordene por `diasDesdeUltima / S` decrescente, comparando por produto cruzado. Isso equivale a ordenar a retenção do menor para o maior.
- `motivoDoBloco(bloco, topico, estado)` gera a frase curta que explica o bloco. `estado` é o estado do SM-2 da matéria (§7), ou null se ela nunca foi concluída. Os dias são contados até `bloco.data`, não até hoje, porque o motivo é gerado para blocos futuros também.
  - ESTUDO: "peso P, domínio D", com P e D em {"alto", "médio", "baixo"}. Peso ≥ 4 é alto, 3 é médio, ≤ 2 é baixo; domínio ≤ 2 é baixo, 3 é médio, ≥ 4 é alto. Ex.: "peso alto, domínio baixo".
  - ESTUDO extra (estudo antecipado): "estudo antecipado: sobrou tempo hoje e N é a matéria de maior prioridade que ainda falta".
  - REVISAO no dia devido ou antes: "revisão: estudado há X dias" (X = dias de `ultimaRevisao` até `bloco.data`; "há 1 dia" no singular).
  - REVISAO atrasada (`bloco.data > proximaRevisao`): "não revisado há X dias".
  - REVISAO extra: "revisão extra: N é o assunto que você estudou há mais tempo".
  - RESERVA: "horário livre".
  - Frases sem ponto final e sem exclamação (docs/front.md §7). N é o nome da matéria.

### 8.1 Decisões de implementação

- **`compararPorRetencao(a, b)`** recebe `{ diasDesdeUltima, intervalo }` e devolve `b.dias·max(1, a.intervalo) − a.dias·max(1, b.intervalo)`: negativo quando `a` tem menor retenção. Empate devolve 0, e quem chama encadeia o próximo critério.
- **`diasDesdeUltima(estado, data)`** com `estado` null ou `ultimaRevisao` null lança `RangeError`: matéria sem conclusão não tem retenção.
- **`motivoDoBloco`** lança `RangeError` para REVISAO comum sem estado (uma revisão comum só nasce de uma conclusão), para `tipo` desconhecido e para peso ou domínio fora de 1 a 5 num ESTUDO. `extra` só vale se for `true`. "Atrasada" é `diferencaEmDias(proximaRevisao, bloco.data) > 0`.

## 9. Revisões na reserva (`core/revisoes.js`)

As revisões ocupam os blocos RESERVA que o sequenciador espalhou pelo período (§6). Elas não são guardadas: a cada replanejamento saem de novo do estado do SM-2 (R12).

- **Entrada comum:** `blocos` (todos os blocos com data ≥ hoje: os novos do sequenciador e os mantidos, §10.1), `topicos` no formato de `montarEntradaAlocacao` (`{ id, prioridade, demanda, manual, ordem }`), `estados` (o `Map` de `estadosPeloHistorico`, §7, calculado uma vez por quem chama) e `hoje`.
- Os slots são percorridos por data crescente e depois `ordem`. Um **slot livre** é um bloco RESERVA PENDENTE. As duas funções devolvem blocos novos e não mutam a entrada.
- **Pulado hoje:** matéria com bloco PULADO hoje não recebe revisão hoje nem bloco extra hoje. Pular é escolha do aluno (o plano é sugestão); a revisão pode cair de amanhã em diante.

### `encaixarRevisoes({ blocos, topicos, estados, hoje, fim, modoCobertura = false, dataAlvo = null })` → `{ blocos, avisos }`

1. **Candidatos:** matérias com estado no mapa e `proximaRevisao ≤ fim`. Matéria que já tem REVISAO PENDENTE entre os blocos (uma revisão fixada, §10.1) não é candidata: cada matéria tem no máximo uma revisão pendente.
2. **Data devida:** `max(hoje, proximaRevisao)`. Revisão atrasada conta como devida hoje (R10).
3. **Ordem de encaixe:** devida crescente; depois menor retenção em `hoje` (`compararPorRetencao` com `diasDesdeUltima(estado, hoje)` e o `intervalo` do estado, §8); depois `compararCanonico`.
4. Para cada candidata, nessa ordem, procure o primeiro slot livre com data ≥ devida. Se a matéria tem bloco PULADO hoje, a data mínima é amanhã. No modo cobertura, só valem slots com data > `dataAlvo` (as revisões voltam depois da prova).
5. **C5:** se existe bloco ESTUDO PENDENTE da matéria com `hoje ≤ data ≤ data do slot encontrado`, não agenda: o estudo chega antes e cumpre o papel da revisão. Sem slot, vale qualquer ESTUDO PENDENTE futuro da matéria.
6. Senão, o slot vira `{ tipo: 'REVISAO', topicoId, extra: false }`. Sem slot e sem estudo futuro, gera o aviso `{ id, tipo: 'REVISAO_SEM_ESPACO', devida }`, exceto no modo cobertura, em que as revisões estão suspensas de propósito.

### `preencherReservaDeHoje({ blocos, topicos, estados, hoje })` → `blocos`

Roda depois de `encaixarRevisoes`, fora da reta final. Para cada slot livre com data = hoje, em ordem:
1. **Revisão extra:** vira `REVISAO` com `extra: true` para a matéria estudada (com estado no mapa) de menor retenção em hoje (desempate por `compararCanonico`) que ainda não foi usada neste preenchimento e não tem bloco PENDENTE (ESTUDO ou REVISAO) hoje.
2. **Estudo antecipado:** senão, vira `ESTUDO` com `extra: true` para a matéria com `demanda > 0` de maior prioridade (`compararCanonico`) ainda não usada neste preenchimento.
3. Senão, continua RESERVA, e a tela o mostra como folga.
- As matérias com bloco PULADO hoje ficam fora dos passos 1 e 2.
- Dias futuros não são preenchidos: são regenerados a cada replanejamento.
- Bloco extra é como qualquer outro: o aluno pode pular sem penalidade; concluído, passa pelo SM-2 (C5), e o ESTUDO extra concluído conta como ESTUDO concluído no C2 (§10.4).

## 10. Pipeline e replanejamento (`core/pipeline.js`, `core/replanejador.js`)

O cronograma é sempre derivado, nunca acumulado. Criar e replanejar rodam as mesmas etapas, de hoje em diante, sobre o que ainda falta: regenerar é a operação normal, não a excepcional.

### 10.1 O que muda e o que fica

- **Passado** (data < hoje) nunca muda. ESTUDO e REVISAO PENDENTE no passado viram PERDIDO: o replanejador devolve os ids, e quem grava é a fachada. RESERVA do passado fica como está.
- **Mantidos:** blocos com data ≥ hoje e status CONCLUIDO ou PULADO, e blocos PENDENTE com `fixado: true` (C3). Eles não mudam e ocupam o seu slot: entram na capacidade como `ocupados` (§3). Sem isso, um bloco concluído hoje às 10h teria o seu horário redistribuído no replanejamento seguinte.
- **Regenerados:** todo o resto com data ≥ hoje (PENDENTE não fixado) é descartado e gerado de novo (R12).
- PULADO é a escolha explícita de pular: para a demanda, vale como perdido e volta como demanda. Bloco perdido nunca é empurrado para o dia seguinte.

### 10.2 `montarFuturo({ plano, topicos, mantidos = [], historico = [], hoje })` (em `core/pipeline.js`)

É o miolo comum à criação e ao replanejamento. `topicos` vem no formato de cadastro (`{ id, nome, peso, dominio, blocosDesejados?, ordem?, demandaRestante? }`).
1. `planoEfetivo = { ...plano, inicio: max(hoje, plano.inicio), ocupados }`, com `ocupados` = `{ data, ordem }` dos mantidos. O mesmo objeto vai para `calcularCapacidade`, `avaliarViabilidade` e `avaliarRetaFinal`, para os três contarem os mesmos slots.
2. Calcula a capacidade e a viabilidade (que respeita `demandaRestante`, §2).
3. `cobertura = estadoCobertura({ plano, viabilidade, hoje })`; `retaFinal = condicaoDeCobertura(...) ? avaliarRetaFinal({ plano: planoEfetivo, topicos }) : null`; a reta final está ativa quando `cobertura === 'ATIVA'`.
4. `entrada = montarEntradaAlocacao(topicos)` e `alocar` com `capacidadeTotal` (reta final ativa) ou `capacidadeEstudo`.
5. `sequenciar` com `modoCobertura` igual à reta final ativa. Cada bloco novo ganha `status: 'PENDENTE'`, `extra: false` e `fixado: false`.
6. `estados = estadosPeloHistorico(historico)`, uma vez.
7. `encaixarRevisoes` com mantidos + novos, `fim: plano.fim`, `modoCobertura` e `dataAlvo: dataAlvo(plano)`.
8. Fora da reta final, `preencherReservaDeHoje`.
9. Cada bloco novo recebe `motivo = motivoDoBloco(bloco, tópico, estados.get(topicoId) ?? null)`. Os mantidos ficam como estão.
10. Devolve `{ blocos, alocacao, viabilidade, retaFinal, cobertura, avisos }`, com os blocos em ordem de data e `ordem` e os avisos da alocação antes dos das revisões. Os blocos novos não têm `id`: quem grava (a fachada) dá os ids.

### 10.3 `gerarCronograma({ plano, topicos, hoje, reduzirDemanda = false })` (em `core/pipeline.js`)

- Chama `validarPlano(plano)`; `fim` antes de `hoje` lança `RangeError`.
- Começa em `max(hoje, inicio)`: um plano criado com início no passado não gera blocos no passado.
- `reduzirDemanda: true` é a escapatória 2 escolhida: cada tópico recebe `demandaRestante` igual ao `depois` de `viabilidade.escapatorias.reduzirDemanda`, e a viabilidade é recalculada com ela. As outras saídas a fachada aplica antes de chamar: "mais tempo" muda o plano, "tirar matérias" muda a lista e a reta final grava `respostaCobertura`.
- **Bloqueio só na criação (R16):** se a viabilidade é `bloqueante`, devolve `{ bloqueado: true, blocos: [], topicos (como vieram), viabilidade, retaFinal, cobertura, avisos: [] }`. Exceção: `cobertura` ATIVA e `retaFinal` não bloqueante (a reta final resolve o bloqueio).
- Senão, chama `montarFuturo` sem mantidos nem histórico e devolve `{ bloqueado: false, blocos, topicos, viabilidade, retaFinal, cobertura, avisos }`, com cada tópico devolvido com `blocosAlocados = alocacao.blocos[id]` (C2) e sem `demandaRestante`.

### 10.4 `replanejar({ plano, topicos, blocos, hoje })` (em `core/replanejador.js`)

- **Quando (R11):** a função é pura e quem chama decide quando rodar. Os gatilhos estão no docs/front.md §4.
- `perdidos`: ids dos ESTUDO e REVISAO PENDENTE com data < hoje.
- **Depois do fim** (`hoje > fim`): devolve `{ perdidos, blocosFuturos: [], viabilidade: null, retaFinal: null, cobertura: 'NAO_SE_APLICA', avisos: [] }`.
- **C2:** `demandaRestante = max(0, blocosAlocados − ESTUDOs CONCLUIDO da matéria (qualquer data, extras inclusive) − ESTUDOs PENDENTE fixados mantidos)`. Matéria sem `blocosAlocados` (adicionada depois da criação) usa `demanda(t)` no lugar. O replanejamento não sobrescreve `blocosAlocados`.
- Chama `montarFuturo({ plano, topicos com demandaRestante, mantidos, historico: blocos, hoje })`.
- **Nunca bloqueia:** gera o que cabe, com o aviso `TOPICO_SEM_BLOCO` (§5) e as escapatórias calculadas, para o aluno não ficar sem plano.
- Devolve `{ perdidos, blocosFuturos, viabilidade, retaFinal, cobertura, avisos }`. `blocosFuturos` traz todos os blocos com data ≥ hoje em ordem de data e `ordem`: os mantidos, iguais e com `id`, e os novos, sem `id`. A fachada apaga os PENDENTE não fixados com data ≥ hoje e grava os novos.
- **Aluno sumido (R10):** sai das regras acima. Os blocos perdidos voltam como demanda, há no máximo uma revisão por matéria e a viabilidade é recalculada com números honestos. Se faltar pouco para a prova, a reta final é oferecida (PERGUNTAR), nunca ligada sozinha.
- **Terminou antes do prazo:** demanda 0 em todas as matérias. Todos os slots viram RESERVA, e o plano passa a ter só revisões e blocos extras.

## 11. Modelo de dados — campos novos ou alterados

- `blocos`:
  - `status: 'PENDENTE' | 'CONCLUIDO' | 'PULADO' | 'PERDIDO'` substitui `concluido`;
  - `tipo: 'ESTUDO' | 'REVISAO' | 'RESERVA'`;
  - ganha `fixado` e `motivo`;
  - ao ser concluído, o bloco grava `qualidade` (0 a 5, de `QUALIDADE_POR_RESPOSTA`), `concluidoEm` ('YYYY-MM-DD', a data local em que o aluno marcou Feito) e `sequenciaConclusao` (inteiro, único no plano, crescente na ordem das conclusões, gerado pela fachada).
  - O atraso é derivado de `diferencaEmDias(data, concluidoEm)`, sem campo próprio.
- `blocos` ganha também `extra` (revisão extra ou estudo antecipado, §9).
- `topicos`: não guarda estado do SM-2 (§7: ele é recalculado pelo histórico); ganha `blocosAlocados` e `dominioRevisadoApos` (§12).
- `planos` ganha `respostaCobertura: null | { resposta: 'ACEITO' | 'RECUSADO', dataAlvo }` (§6.1).

## 12. Sugestão de ajuste do domínio (`core/estimador.js`)

A autoavaliação nunca muda o domínio sozinha; ela gera uma sugestão que o aluno aceita ou recusa. Esta é a implementação inicial da interface `EstimadorDificuldade` prevista no contexto: uma regra determinística que um modelo pode substituir depois.

- `sugerirAjusteDominio(topico, blocosDoTopico)`:
  - Ordena os blocos CONCLUIDO do tópico na ordem das conclusões (§7: `concluidoEm`, depois `sequenciaConclusao`), e ignora os `topico.dominioRevisadoApos` primeiros (padrão 0). Assim só contam as respostas dadas depois da última sugestão aceita ou recusada, sem depender de relógio. Aqui cada conclusão conta, mesmo duas no mesmo dia: o estimador olha as respostas, não o espaçamento.
  - **Para baixo:** se as 2 últimas qualidades forem 1 ("não entrou") e o domínio for > 1, sugere `{ id, de: dominio, para: dominio − 1, motivo }`.
  - **Para cima:** se as 3 últimas qualidades forem 5 ("expliquei sem consultar") e o domínio for < 5, sugere `para: dominio + 1`.
  - Senão, devolve null.
  - Exemplo de motivo: "você marcou 'não entrou' nas 2 últimas vezes em SO; o domínio declarado é 4".
- `aplicarAjusteDominio(topico, novoDominio, blocosDoTopico)`: devolve o tópico com o novo domínio e `dominioRevisadoApos` igual ao número de blocos CONCLUIDO do tópico.
  - Tópico automático: `blocosAlocados += (6 − novo) − (6 − antigo)`, nunca abaixo do número de ESTUDOs já concluídos.
  - Tópico manual: `blocosAlocados` não muda, porque o aluno pediu uma quantidade; só a prioridade muda.
  - Depois, quem chama roda `replanejar`.
- `recusarAjusteDominio(topico, blocosDoTopico)`: devolve o tópico com `dominioRevisadoApos` igual ao número de blocos CONCLUIDO. Assim a mesma sugestão só volta depois de uma nova sequência de respostas.

### 12.1 Decisões de implementação

- **Respostas exatas:** "para baixo" exige qualidade exatamente 1 (`NAO_ENTROU`) e "para cima", exatamente 5 (`EXPLIQUEI_SEM_CONSULTAR`). As qualidades 0, 2 e 4 não são oferecidas pela tela e não disparam sugestão.
- **Motivo de subir:** usa o texto do botão da tela (docs/front.md §3.5): "você marcou 'consegui explicar sem consultar' nas 3 últimas vezes em SO; o domínio declarado é 2".
- **ESTUDOs já concluídos**, o piso de `blocosAlocados`, incluem os extras (estudo antecipado), que contam como ESTUDO concluído no C2 (§9).
- **Validação (RangeError):** `dominio` ou `novoDominio` fora de 1 a 5; tópico automático sem `blocosAlocados` inteiro ≥ 0 em `aplicarAjusteDominio`; e os mesmos erros de bloco do SM-2 (§7.1), porque a ordem vem de `conclusoesEmOrdem`.
- `aplicarAjusteDominio` e `recusarAjusteDominio` devolvem um tópico novo e não mutam a entrada.
