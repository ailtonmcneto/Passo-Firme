# Especificação do algoritmo — Passo Firme

Fonte de verdade para `js/core/` e `js/util/`. Todas as decisões foram fechadas em 04/11/2026.
Os testes destes módulos são a especificação que a versão Java (fase 2) terá que reproduzir.

Pipeline: capacidade → viabilidade → alocação → sequenciamento → revisões, com replanejamento (que roda o pipeline de novo) durante o uso.

## 1. Convenções

- **Datas:** strings 'YYYY-MM-DD' no calendário local. A aritmética fica em `js/util/datas.js`, que converte internamente com `Date.UTC` e lê com `getUTC*`. Dia da semana: 0 = domingo … 6 = sábado.
- **Inteiros:** nenhuma etapa usa float. Uma divisão `a×b / c` vira `Math.floor(a*b/c)` com resto `(a*b) % c`; frações se comparam por produto cruzado. A retenção (§8) é a única exceção, porque só serve para ordenar e exibir.
- **Ordem canônica (R1):** tópicos são ordenados por **prioridade decrescente**, desempatando pela **`ordem` de cadastro crescente**. `ordem` é o índice de cadastro do tópico (padrão: a posição no array de entrada). "Menor prioridade" é o último nessa ordem. O pseudo-tópico `RESERVA` fica sempre depois de todos.
- **Pureza:** nenhuma função lê o relógio; "hoje" chega como parâmetro.

## 2. Fórmulas base (`core/prioridade.js`)

- `prioridade = peso × (6 − dominio)`, de 1 a 25.
- `demandaMinima = 6 − dominio`, de 1 a 5.
- `peso` e `dominio` são inteiros de 1 a 5; fora disso, a função lança `RangeError`.
- **Demanda de um tópico:** `blocosDesejados`, quando o aluno preencheu (tópico *manual*); senão, `demandaMinima`. No replanejamento, a demanda é o *restante* (§10).
- A autoavaliação alimenta só o SM-2. O domínio declarado não muda automaticamente.

## 3. Etapa 1 — Capacidade (`core/capacidade.js`)

- Constantes: `MINIMO_BLOCO_MIN = 15`; fração de estudo = 4/5.
- `blocosNoDia(minutos, duracaoBlocoMin = 30)` devolve a lista de durações:
  - `minutos ≥ dur`: `n = floor(minutos/dur)` e `sobra = minutos − n·dur`. São n−1 blocos de `dur` e um último de `dur + sobra`.
  - `15 ≤ minutos < dur`: um bloco de `minutos`.
  - `minutos < 15`: nenhum bloco.
  - Todo bloco conta 1 na capacidade, qualquer que seja a duração (R6).
- `calcularCapacidade({ inicio, fim, disponibilidade, diasFolga = [], duracaoBlocoMin = 30, dataAvaliacao = null })`:
  - `disponibilidade` é um objeto ou array indexado por dia da semana (0–6), com os minutos de cada dia.
  - Percorre `[inicio, fim]` inclusive. Dia que está em `diasFolga` não gera bloco.
  - **Janela de estudo (R8):** sem `dataAvaliacao`, é o período inteiro. Com ela, são os dias até `dataAvaliacao` inclusive, e os dias depois da avaliação são inteiros de reserva. A janela mantém os 20% de reserva, para revisar antes da prova; o período depois dela serve para quem tem avaliação intermediária ou conteúdo cumulativo. Os dois casos são válidos (escola e faculdade).
  - `capacidadeTotal` conta os blocos da janela e `capacidadeEstudo = floor(capacidadeTotal × 4 / 5)` (R3).
  - `capacidadeReserva` é `capacidadeTotal − capacidadeEstudo` mais todos os blocos depois da avaliação.
  - Retorna `{ dias: [{ data, blocos: [durações], naJanela }], capacidadeTotal, capacidadeEstudo, capacidadeReserva }`.

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
- O plano é gerado mesmo inviável, com uma exceção: na criação, um plano `bloqueante` não é gerado até o aluno escolher uma escapatória. Na escapatória 2, as demandas `depois` entram no alocador; na 3, os tópicos removidos saem da entrada.

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

## 6. Etapa 4 — Sequenciamento (`core/sequenciador.js`)

- **Reserva (C4):** é o pseudo-tópico `RESERVA`, com quota igual aos blocos de reserva da janela mais a `sobra` do alocador. Entra no sequenciamento como qualquer tópico, o que espalha os slots livres pelo período. Os dias depois da avaliação são inteiros `RESERVA` e não entram no N.
- **Posição ideal:** N é o número de slots da janela. A posição do k-ésimo bloco (k = 0 … quota−1) é `(2k+1)·N / (2·quota)`. Para comparar `(a, kₐ)` com `(b, k_b)`, compare `(2kₐ+1)·q_b` com `(2k_b+1)·qₐ`.
- **Empate:** menor quota primeiro; depois a ordem canônica (RESERVA por último); depois menor k.
- **Anti-adjacência (R13):** só conta a adjacência dentro do mesmo dia; RESERVA nunca conta como conflito. A passada vai da esquerda para a direita, com janela W = 3:
  - Quando o slot i repete o tópico de i−1 no mesmo dia, procure o primeiro j em i+1 … i+W com tópico diferente do de i.
  - Troque i com j se, depois da troca, nenhum dos slots i−1, i, j e j+1 ficar em conflito. Senão, desfaça e tente o próximo j.
  - Sem troca válida, siga em frente. É melhor-esforço, não garantia.
- **Mapeamento:** consome os blocos de cada dia na ordem e gera `{ data, ordem (1..n no dia), topicoId, tipo, duracaoMin }`, com `tipo` `ESTUDO`, ou `RESERVA` com `topicoId` null.
- **Modo cobertura (R9):** é ativado quando a data-alvo (`dataAvaliacao` ou, se não houver, `fim`) está a ≤ 3 dias de hoje e o plano é inviável. Nesse modo:
  - a reserva da janela vira estudo (`capacidadeEstudo = capacidadeTotal`);
  - a alocação é a normal;
  - o sequenciamento é um round-robin na ordem canônica (rodada 1 com um bloco de cada tópico, rodada 2 e seguintes pulando quem esgotou), sem passada de adjacência;
  - as revisões ficam suspensas até a data-alvo.

## 7. SM-2 (`core/sm2.js`)

- O estado de cada tópico é `{ efCentesimos = 250, intervalo = 0, repeticoes = 0, ultimaRevisao = null, proximaRevisao = null }`.
- `proximaRevisao(estado, qualidade)`:
  - qualidade < 3: `{ ef inalterado, intervalo 1, repeticoes 0 }`;
  - senão: `ef = max(130, ef + 10 − (5−q)·(8 + (5−q)·2))`, que dá +10 para q = 5, 0 para q = 4 e −14 para q = 3;
  - o intervalo é 1 se repeticoes = 0, 3 se repeticoes = 1, e `floor((intervalo·ef + 50) / 100)` nos demais casos (arredondamento meio-para-cima, só com inteiros);
  - as repetições somam 1.
- `aplicarConclusao(estado, qualidade, dataConclusao)` devolve o novo estado com `ultimaRevisao = dataConclusao` e `proximaRevisao = dataConclusao + intervalo`.
- **C5:** qualquer bloco concluído do tópico, de ESTUDO ou de REVISAO, passa por `aplicarConclusao`.
- **Autoavaliação (R15):**
  - `EXPLIQUEI_SEM_CONSULTAR` = 5
  - `ENTENDI_MAS_TRAVARIA` = 3
  - `NAO_ENTROU` = 1

## 8. Retenção e explicabilidade (`core/retencao.js`)

- `retencao(diasDesdeUltima, S) = e^(−t/S)`, com `S = max(1, intervalo)` (R14). É float, mas só serve para ordenar e exibir; os testes comparam com tolerância.
- O desempate por retenção é feito por inteiros: ordene por `diasDesdeUltima / S` decrescente, comparando por produto cruzado. Isso equivale a ordenar a retenção do menor para o maior.
- `motivoDoBloco(bloco, topico, contexto)` gera uma frase curta: "peso alto, domínio baixo", "revisão: estudado há 3 dias", "não revisado há 6 dias".
  - Peso ≥ 4 é "alto", ≤ 2 é "baixo"; domínio ≤ 2 é "baixo", ≥ 4 é "alto".

## 9. Revisões na reserva (`core/revisoes.js`)

- Cada tópico tem **no máximo uma revisão pendente**: a da `proximaRevisao` atual. A próxima só nasce quando esta é concluída, o que encadeia as revisões e evita que estourem a reserva.
- `encaixarRevisoes({ blocos, topicos, hoje, modoCobertura })`:
  1. Candidatos são os tópicos com `proximaRevisao` não nula e ≤ último dia do plano. Revisão atrasada (`proximaRevisao < hoje`) conta como devida hoje (R10).
  2. **C5:** se existe um bloco ESTUDO do tópico com `hoje ≤ data ≤ max(hoje, proximaRevisao)`, não agenda revisão, porque o estudo cumpre esse papel.
  3. A ordem de encaixe é: data devida crescente; depois menor retenção (§8); depois a ordem canônica.
  4. Cada revisão ocupa o primeiro slot RESERVA livre com `data ≥ max(hoje, devida)`, que vira `tipo REVISAO` com o `topicoId` do tópico. Se não houver slot livre até o fim, gera o aviso `{ id, tipo: 'REVISAO_SEM_ESPACO', devida }`.
  5. No modo cobertura, as revisões só são encaixadas depois da data-alvo.
- **Reserva livre de hoje:** depois de encaixar as revisões devidas, `preencherReservaDeHoje({ blocos, topicos, hoje })` preenche cada slot RESERVA ainda livre com data = hoje (dias futuros são regenerados de qualquer jeito, então não são preenchidos).
  1. Vira `REVISAO` com `extra: true`, para o tópico estudado (com ao menos um bloco CONCLUIDO) de menor retenção (§8). Um tópico diferente por slot, seguindo a ordem de retenção.
  2. Se não houver tópico estudado disponível, vira `ESTUDO` com `extra: true` (estudo antecipado) do tópico de maior prioridade que ainda tenha demanda restante. Quando concluído, conta como ESTUDO concluído no C2 e reduz a demanda.
  3. Se nem isso houver, o slot continua RESERVA, e a interface o mostra como folga.
  - Bloco extra é como qualquer outro: o aluno pode pular sem penalidade, e a conclusão passa pelo SM-2 (C5).
  - O `motivo` diz que é extra: "revisão extra: c é o assunto que você estudou há mais tempo".
  - No modo cobertura, não vale esta regra.

## 10. Replanejamento (`core/replanejador.js`)

- **Quando (R11):** a função é pura e quem chama decide quando rodar. A fachada chama ao abrir o app, se houver bloco PENDENTE com data < hoje ou se a última geração foi em outro dia; depois de `concluirBloco`; e depois de uma edição na planilha.
- **Histórico:** blocos com data < hoje e blocos CONCLUIDO nunca mudam. Bloco PENDENTE no passado vira PERDIDO. PULADO é a escolha explícita do aluno de pular e, para a demanda, vale como perdido. Bloco perdido nunca é empurrado para o dia seguinte: volta como demanda.
- **C2:** cada tópico guarda `blocosAlocados`, o resultado da alocação inicial ou de uma edição de quota. No replanejamento, `demanda = max(0, blocosAlocados − ESTUDOs CONCLUIDO − ESTUDOs fixados futuros)`. O replanejamento não sobrescreve `blocosAlocados`.
- **C3:** um bloco editado na planilha ganha `fixado: true`. Blocos fixados futuros ficam onde estão e seus slots saem da capacidade. Mudar a quantidade de blocos de um tópico grava `blocosDesejados` e `blocosAlocados`.
- **Bloqueio só na criação (R16):** `gerarCronograma` devolve `{ bloqueado: true, viabilidade }`, sem blocos, quando a viabilidade é `bloqueante`. A interface mostra as escapatórias e só gera depois da escolha. `replanejar` nunca bloqueia: gera o que cabe, com o aviso `TOPICO_SEM_BLOCO` (§5) e as escapatórias calculadas, para o aluno não ficar sem plano.
- **Passos:**
  1. Calcula a capacidade de `max(hoje, inicio)` até `fim`, menos os slots fixados.
  2. Roda a viabilidade e a alocação com a demanda restante.
  3. Sequencia nos slots livres.
  4. Encaixa as revisões a partir do estado SM-2 atual (R12: revisões futuras não fixadas são sempre regeneradas).
  5. Preenche a reserva livre de hoje (§9).
- **Aluno sumido (R10):** sai naturalmente das regras acima. Os blocos perdidos voltam como demanda, há no máximo uma revisão atrasada por tópico e a viabilidade é recalculada com números honestos.
- **Terminou antes do prazo:** demanda 0 em todos os tópicos. Todos os slots viram RESERVA e o plano passa a ter só revisões e sugestões.
- Saída: `{ blocosFuturos, viabilidade, avisos }`.

## 11. Modelo de dados — campos novos ou alterados

- `blocos`:
  - `status: 'PENDENTE' | 'CONCLUIDO' | 'PULADO' | 'PERDIDO'` substitui `concluido`;
  - `tipo: 'ESTUDO' | 'REVISAO' | 'RESERVA'`;
  - ganha `fixado` e `motivo`.
  - O atraso é derivado de `concluidoEm − data`, sem campo próprio.
- `blocos` ganha também `extra` (revisão extra ou estudo antecipado, §9).
- `topicos`:
  - `efCentesimos` substitui `easeFactor`;
  - ganha `blocosAlocados`, `ultimaRevisao`, `proximaRevisao` e `dominioRevisadoApos` (§12).

## 12. Sugestão de ajuste do domínio (`core/estimador.js`)

A autoavaliação nunca muda o domínio sozinha; ela gera uma sugestão que o aluno aceita ou recusa. Esta é a implementação inicial da interface `EstimadorDificuldade` prevista no contexto: uma regra determinística que um modelo pode substituir depois.

- `sugerirAjusteDominio(topico, blocosDoTopico)`:
  - Ordena os blocos CONCLUIDO do tópico por `concluidoEm` e depois por `id`, e ignora os `topico.dominioRevisadoApos` primeiros (padrão 0). Assim só contam as respostas dadas depois da última sugestão aceita ou recusada, sem depender de relógio.
  - **Para baixo:** se as 2 últimas qualidades forem 1 ("não entrou") e o domínio for > 1, sugere `{ id, de: dominio, para: dominio − 1, motivo }`.
  - **Para cima:** se as 3 últimas qualidades forem 5 ("expliquei sem consultar") e o domínio for < 5, sugere `para: dominio + 1`.
  - Senão, devolve null.
  - Exemplo de motivo: "você marcou 'não entrou' nas 2 últimas vezes em SO; o domínio declarado é 4".
- `aplicarAjusteDominio(topico, novoDominio, blocosDoTopico)`: devolve o tópico com o novo domínio e `dominioRevisadoApos` igual ao número de blocos CONCLUIDO do tópico.
  - Tópico automático: `blocosAlocados += (6 − novo) − (6 − antigo)`, nunca abaixo do número de ESTUDOs já concluídos.
  - Tópico manual: `blocosAlocados` não muda, porque o aluno pediu uma quantidade; só a prioridade muda.
  - Depois, quem chama roda `replanejar`.
- `recusarAjusteDominio(topico, blocosDoTopico)`: devolve o tópico com `dominioRevisadoApos` igual ao número de blocos CONCLUIDO. Assim a mesma sugestão só volta depois de uma nova sequência de respostas.
