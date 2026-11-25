# Especificação das telas — Passo Firme

Fonte de verdade para `index.html`, `pages/`, `css/`, `js/ui/` e para o contrato com a fachada `js/api.js`.
Fluxo fechado em 04/11/2026 e validado num protótipo navegável. O visual (cores, tipografia, layout, animações) é decisão do responsável pelo front; o que está aqui é o que cada tela pede, mostra e dispara.

As regras de cálculo estão em `docs/algoritmo.md`. Este documento nunca as repete nem as altera.

## 1. Princípios que a tela precisa respeitar

1. **A tela não calcula.** Ela coleta respostas, chama `js/api.js` e mostra o que volta. Nada em `js/ui/` importa de `js/core/` ou de `js/db.js`.
2. **O aluno decide quando, o algoritmo decide o quê.** O aluno marca os horários em que pode estudar; o sistema preenche esses horários com as matérias.
3. **Fricção mínima.** O cadastro inteiro cabe em poucos minutos. Nenhuma pergunta pede nota abstrata; "não sei" é sempre uma resposta válida.
4. **Nunca punir.** Bloco não feito não fica vermelho, não quebra sequência, não é "atraso". Ele volta para o plano.
5. **Honestidade.** Se não cabe, a tela mostra os números e as saídas.
6. **Explicabilidade.** Todo bloco mostra, em uma frase, por que está ali.
7. **A tela principal é "Seu passo de hoje"**, não o calendário.

## 2. Fluxo do produto

1. **Matérias** → 2. **Período** → 3. **Horários livres** → 4. **Viabilidade** → 5. **Seu percurso** → 6. **Uso diário** (passo de hoje, modo foco, autoavaliação, replanejamento).

- Os passos 1 a 4 formam o cadastro. O aluno pode voltar a qualquer um deles antes de criar o plano.
- Depois de criado, o aluno abre o app direto em "Seu passo de hoje".
- Mudar matérias ou horários depois da criação é possível a qualquer momento e sempre termina num replanejamento.

## 3. Telas

### 3.1 Matérias

Para cada matéria: nome e duas perguntas de múltipla escolha. A tela converte cada resposta no número de 1 a 5 que o algoritmo espera.

**Domínio — "Se caísse uma questão disso amanhã, você…"**

| Resposta | Valor |
|---|---|
| não saberia nem começar | 1 |
| lembro de ter visto | 2 |
| entendo, mas erro | 3 |
| resolvo consultando | 4 |
| resolvo tranquilo | 5 |
| não sei | 3 |

**Peso — "Quanto essa matéria pesa no seu objetivo (nota, prova)?"**

| Resposta | Valor |
|---|---|
| quase nada | 1 |
| pouco | 2 |
| o normal | 3 |
| bastante | 4 |
| é a maior parte | 5 |
| não sei | 3 |

- **Opcional, escondido em "mais opções":** "Quer definir quantos blocos essa matéria terá?" Se preenchido, vira `blocosDesejados` (matéria manual).
- A prioridade nunca é perguntada nem mostrada como número; ela é calculada.
- Mínimo de 1 matéria. Nomes repetidos são recusados na própria tela.

### 3.2 Período

- Data de início e data de fim.
- **Opcional:** "Tem uma prova nesse período?" com nome e data. A data precisa estar entre o início e o fim.

### 3.3 Horários livres

- Uma grade semanal (colunas = dias da semana, linhas = horários) em **células de 30 minutos**. O aluno toca nas células em que pode estudar para pintá-las; tocar de novo despinta.
- Embaixo da grade, um contador ao vivo: "N blocos por semana = X h · M blocos no período".
- **Cada célula pintada é exatamente um bloco**, já com o horário dela. Por isso, no MVP, a duração do bloco é fixa em 30 minutos.
- **O que a tela entrega à fachada:** a lista de células `[{ diaSemana, hora }]`, com `diaSemana` de 0 = domingo a 6 = sábado (a mesma convenção do algoritmo) e `hora` em 'HH:MM'. A fachada deriva daí os minutos por dia da semana (células × 30) que o algoritmo recebe.
- **Horário de cada bloco:** num dia, o 1º bloco (por `ordem`) ocupa a célula pintada mais cedo daquele dia da semana, o 2º a seguinte, e assim por diante.
- A faixa de horas exibida e a forma de pintar várias células de uma vez (arrastar o dedo, selecionar uma linha) são decisões de interface.

### 3.4 Viabilidade

Mostra três números:
- blocos no período;
- blocos para estudo (80%);
- blocos que as matérias pedem.

Depois, uma de três situações:

1. **Cabe:** "Cabe tudo. Os N blocos que sobram são divididos entre as matérias, mais para as de maior prioridade, e R ficam livres para revisões." Botão "Montar meu plano". (Se todas as matérias forem manuais, o que sobra vai para a reserva, e o texto diz só quantos ficam livres.)
2. **Não cabe:** "Faltam N blocos (C% de cobertura)." Mostra as saídas que o algoritmo calculou, traduzidas para a linguagem da grade:
   - **Mais tempo:** os minutos a mais por dia viram "pinte mais K horário(s) em cada dia em que você já estuda", com K = minutos ÷ 30, arredondado para cima. Os dias a mais viram "termine em dd/mm em vez de dd/mm". Opção ausente quando o algoritmo devolve null.
   - **Reduzir passagens:** a lista de matérias com o antes e o depois de cada uma.
   - **Tirar matérias:** quais sairiam.
   - **Reta final** (só aparece quando a prova, ou o fim do período, está a 3 dias ou menos): "Em vez de guardar 20% para revisões, todos os seus N horários viram estudo e as matérias se revezam, uma passada por cada uma antes de voltar à primeira. Cobertura: C% em vez de C0%. As revisões voltam depois da prova." Os números vêm de `viabilidade.retaFinal`. É uma escolha única: não se combina com as outras saídas.
   - **Montar assim mesmo**, sabendo que a cobertura é parcial.
3. **Bloqueado** (mais matérias do que blocos de estudo): "São N matérias e só M blocos de estudo." O aluno precisa pintar mais horários, estender o período ou tirar matérias (as saídas "mais tempo" e "tirar matérias" do algoritmo). "Reduzir passagens" não resolve esse caso, e não existe "montar assim mesmo". O botão continua visível e, se tocado, explica o motivo em vez de ficar desabilitado. Exceção: se `viabilidade.retaFinal` existir e não for bloqueante, a reta final aparece como saída também aqui, porque ela resolve o bloqueio.

### 3.5 Seu passo de hoje (tela principal)

- A lista dos blocos de hoje, em ordem de horário. Cada item mostra: horário, matéria, tipo (estudo, revisão, revisão extra, estudo antecipado) e a frase de motivo.
- O próximo bloco pendente fica em destaque, com o botão **Fazer**.
- **Fazer** abre o modo foco: temporizador da duração do bloco, que mede por diferença de `Date.now()` e continua certo com a aba em segundo plano. Ao terminar (ou ao encerrar antes), a autoavaliação:

| Pergunta: "Como foi?" | Resposta enviada |
|---|---|
| Consegui explicar sem consultar | `EXPLIQUEI_SEM_CONSULTAR` |
| Entendi, mas travaria numa questão | `ENTENDI_MAS_TRAVARIA` |
| Não entrou | `NAO_ENTROU` |

- Depois da resposta, uma confirmação curta: "Passo dado. Próxima revisão de X a partir de dd/mm."
- **Pular** está disponível em todo bloco pendente de hoje ou do futuro, sem pedir justificativa.
- Dia sem horário pintado: "Hoje não tem estudo marcado."
- Reserva livre só aparece quando o algoritmo não encontrou nada para pôr nela. Nesse caso, ela aparece como folga, nunca como tarefa.
- **Reta final:** conforme `cobertura` devolvido por `obterHoje`. PERGUNTAR: um cartão com o mesmo texto da §3.4 e os botões Ativar e Agora não. RECUSADA: só um botão discreto "Ativar reta final". ATIVA: uma linha curta avisando que o plano está em reta final até dd/mm. NAO_SE_APLICA: nada. A pergunta aparece uma vez por prova; recusar não gera nova pergunta.

### 3.6 Seu percurso (grade da semana)

- A mesma grade da tela de horários, mostrando só as linhas com alguma célula pintada, com a matéria de cada bloco dentro da célula. Navegação entre semanas.
- Dias passados ficam atenuados; o dia de hoje é destacado.
- **Estados visuais:** cada estado precisa ser distinguível sem depender só da cor (texto, ícone ou traço).

| Estado | Como aparece |
|---|---|
| Pendente (estudo) | cor da matéria |
| Passo dado | cor da matéria + marca de concluído |
| Perdido (dia passou) | atenuado e riscado, sem vermelho |
| Pulado | atenuado e riscado, com a etiqueta "pulado" |
| Revisão | cor da matéria + etiqueta "revisão" |
| Revisão extra / estudo antecipado | como revisão ou estudo, com a etiqueta "extra" |
| Reserva livre | contorno tracejado, sem cor |
| Fixado | cadeado |

- **Tocar num bloco** abre as ações dele:
  - Trocar com…
  - Fixar aqui ou Desafixar
  - Pular
  - Por que agora?, que mostra o motivo
- Botão **Horários** leva de volta à grade de pintura (§3.3).

### 3.7 Sugestão de ajuste do domínio

- Aparece em "Seu passo de hoje" quando a fachada devolve uma sugestão (regra no `docs/algoritmo.md` §12).
- Texto: "Você marcou 'não entrou' nas 2 últimas vezes em X. Ela parece mais difícil do que você disse. Quer ajustar?" Para a sugestão de subir o domínio, o texto equivalente fala em "3 vezes seguidas sem consultar".
- **Aceitar** replaneja. Se o plano estava cheio, a tela mostra o déficit e as saídas, como na viabilidade. **Manter** fecha a sugestão.

### 3.8 O que mudou

Toda ação que replaneja devolve a lista de mudanças. A tela mostra:
- uma faixa curta no topo de "Seu passo de hoje" ou do percurso, como "2 blocos de ontem não foram feitos e voltaram para o plano: JavaScript qui 08:00, Banco de dados sex 08:30";
- as células alteradas com um contorno, até o aluno abrir a semana de novo.

Nunca usar "atrasado", "falhou" ou contagem de dias perdidos.

## 4. Interações e regras

- **Trocar:** o aluno escolhe um bloco e depois outro, e os dois trocam de lugar. Só se trocam blocos pendentes, de hoje ou do futuro. Os dois ficam fixados, e o replanejamento os respeita (algoritmo §10, C3). Trocar não muda a quantidade de blocos de nenhum dia.
- **Fixar e desafixar:** um bloco fixado não é mexido pelo replanejamento.
- **Pular:** o bloco vira PULADO e volta como demanda no próximo replanejamento. Sem confirmação nem penalidade.
- **Pintar ou despintar depois da criação:** muda a disponibilidade e replaneja. Fixados cuja célula foi despintada perdem a fixação.
- **Quando o front pede replanejamento:** ao abrir o app (a fachada replaneja só se a última atualização foi em outro dia ou se há bloco PENDENTE com data anterior a hoje), ao mudar matérias ou horários e ao responder à reta final. Concluir e pular não replanejam: o dia fica estável enquanto o aluno estuda. A próxima revisão sai no mínimo amanhã, e o bloco pulado volta como demanda no replanejamento do dia seguinte.
- **Nunca:** empurrar bloco para o dia seguinte, marcar algo em vermelho, mostrar sequência de dias, pedir justificativa para pular.
- **Arrastar e soltar:** fora do MVP. Se vier depois, é só outra forma de disparar "trocar".

## 5. Contrato com a fachada (`js/api.js`)

Todas as funções são assíncronas, para que na fase 2 a implementação troque o acesso local por chamadas à API Java sem mudar as telas. Datas sempre como 'YYYY-MM-DD'. A data de hoje é calculada uma vez na tela com `hojeLocal(new Date())` e passada adiante.

| Função | Recebe | Devolve |
|---|---|---|
| `avaliarRascunho(rascunho, hoje)` | `{ plano, topicos, celulas }` ainda não salvos; `hoje` porque a reta final depende da data | `viabilidade` (sem gravar nada) |
| `criarPlano(rascunho, escolha?)` | rascunho e a saída escolhida, se houver; a escolha pode ser `{ tipo: 'COBERTURA' }` | `{ planoId, bloqueado, viabilidade }` |
| `obterHoje(planoId, hoje)` | — | `{ data, blocos, sugestao, mudancas, cobertura }`, com `cobertura` um dos estados da §6.1 do algoritmo; replaneja antes, se for preciso |
| `obterSemana(planoId, inicioSemana)` | data da segunda-feira | `{ dias: [{ data, blocos }] }` |
| `concluirBloco(blocoId, resposta, hoje)` | uma das três respostas | `{ proximaRevisao, sugestao, mudancas }` |
| `pularBloco(blocoId, hoje)` | — | `{ mudancas }` |
| `trocarBlocos(blocoIdA, blocoIdB, hoje)` | — | `{ mudancas }` |
| `definirFixado(blocoId, fixado)` | true ou false | `{ ok }` |
| `atualizarCelulas(planoId, celulas, hoje)` | nova lista de células | `{ viabilidade, mudancas }` |
| `atualizarTopicos(planoId, topicos, hoje)` | matérias alteradas | `{ viabilidade, mudancas }` |
| `responderSugestao(topicoId, aceitar, hoje)` | true ou false | `{ viabilidade, mudancas }` |
| `responderCobertura(planoId, aceitar, hoje)` | true ou false | `{ viabilidade, mudancas }` |

### 5.1 Implementação local na plataforma

O cadastro do §11 e o uso diário usam as funções assíncronas abaixo. Elas seguem a §5 sem o `planoId`, porque este navegador guarda um plano só. `obterSemana`, `trocarBlocos`, `definirFixado` e `responderSugestao` ficam para outra entrega; a tela "Seu passo de hoje" (§3.5) também.

| Função | Recebe | Devolve |
|---|---|---|
| `resumirDisponibilidade(plano, celulas)` | período e células, inclusive lista vazia | `{ blocosPorSemana, minutosPorSemana, blocosNoPeriodo }`, derivados da capacidade |
| `avaliarRascunho(rascunho, hoje)` | como na §5 | `viabilidade`, sem gravar nada |
| `montarPrevia(rascunho, hoje, escolha?)` | `{ plano, topicos, celulas }`; escolha `null` ou `{ tipo: 'PARCIAL' \| 'REDUZIR_DEMANDA' \| 'COBERTURA' }` | `{ bloqueado, plano, topicos, celulas, blocos, viabilidade, retaFinal, cobertura, avisos }`, sem gravar dados |
| `obterSessao()` | — | `{ versao: 2, revisao, rascunho, cronograma }`, ou o estado vazio na primeira visita |
| `salvarRascunho(rascunho)` | cadastro, mesmo incompleto | sessão atualizada; preserva o cronograma |
| `gerarPlanoLocal(rascunho, hoje, escolha?)` | mesmos parâmetros de `montarPrevia` | resultado calculado; se não bloqueado, grava o cronograma novo junto com o rascunho |
| `obterHoje(hoje)` | — | `{ data, blocos, mudancas, cobertura, retaFinal, viabilidade }`, com os blocos de hoje; replaneja e grava antes, se for preciso (§4). Sem cronograma, devolve `null` |
| `concluirBloco(blocoId, resposta, hoje)` | uma das três respostas da §3.5 | `{ proximaRevisao }` |
| `pularBloco(blocoId, hoje)` | — | `{ ok: true }` |
| `atualizarCadastro(rascunho, hoje)` | cadastro revisto de um plano em andamento | `{ viabilidade, mudancas }` |
| `responderCobertura(aceitar, hoje)` | true ou false | `{ viabilidade, mudancas }` |

**Sessão versão 2.** A store guarda `{ versao: 2, revisao, rascunho, cronograma }`. Uma sessão sem `versao: 2` (o formato antigo, com `marcacoes`) é descartada: `obterSessao` devolve o estado vazio e a próxima gravação a substitui, mantendo o contador `revisao` para a proteção contra outra aba continuar funcionando. Só existiam sessões de teste, então não há migração.

**Cronograma.** `{ versao: 2, plano, topicos, celulas, blocos, proximoId, proximaSequencia, atualizadoEm, viabilidade, retaFinal, cobertura, avisos, mudancas }`, calculado pelas funções puras de `js/fluxo.js`, que só a fachada importa.
- `topicos` traz `blocosAlocados` (algoritmo §10.3, C2).
- `blocos` traz todos os blocos do plano, passados e futuros, no formato "Bloco, como a tela recebe" (abaixo). O passado é o histórico de onde o SM-2 tira as revisões.
- O `id` de um bloco é um inteiro dado na ordem de criação, e `proximoId` é o próximo livre. Um id nunca é reaproveitado, nem depois de um replanejamento: um id como `'2026-11-30/1'` (a posição) passaria a apontar para outro bloco depois de refazer o plano.
- `proximaSequencia` é o próximo `sequenciaConclusao` (algoritmo §11).
- `atualizadoEm` é o `hoje` do último replanejamento (ou da criação).
- `mudancas` são as da última vez que o plano foi refeito, para a faixa "O que mudou" (§3.8).
- A fachada guarda também `cadastro`, o rascunho que gerou ou atualizou o cronograma, para a tela avisar quando há alterações por aplicar.

**O que cada ação faz.**
- `gerarPlanoLocal` só é aceita quando não há cronograma ou quando o plano ainda não começou (`hoje < plano.inicio`). Os ids começam em 1, na ordem dos blocos.
- `concluirBloco` aceita só bloco PENDENTE de hoje que não seja RESERVA. Grava `status: 'CONCLUIDO'`, `qualidade`, `concluidoEm = hoje` e `sequenciaConclusao`. `proximaRevisao` é a do SM-2 recalculado com essa conclusão. Não replaneja (§4).
- `pularBloco` aceita só bloco PENDENTE de hoje ou do futuro que não seja RESERVA. Grava `status: 'PULADO'`. Não replaneja (§4).
- Replanejar (ao abrir, ao atualizar o cadastro, ao responder à reta final) roda `replanejar` (algoritmo §10.4). Os blocos com data anterior a hoje ficam como estão, exceto os perdidos, que viram PERDIDO; os mantidos ficam iguais; os novos ganham id, `hora` e `topicoNome`. `mudancas` traz as causas da ação (`HORARIOS_ALTERADOS` ou `RETA_FINAL`) e mais uma entrada por bloco pulado desde o último replanejamento (`PULADO_VOLTOU`), por bloco que virou PERDIDO (`PERDIDO_VOLTOU`), com `antes` igual ao bloco como estava, e por revisão comum nova de uma matéria que não tinha revisão pendente (`REVISAO_AGENDADA`, com `depois` igual à revisão).
- Depois de um replanejamento, `viabilidade` é a de `avaliarViabilidade` de hoje em diante, com `retaFinal`; depois do fim do plano, é `null`.
- `atualizarCadastro` troca o fim, a prova (`dataAvaliacao` e `nomeAvaliacao`), a disponibilidade e as células; o início e a `respostaCobertura` ficam. Matéria nova entra sem `blocosAlocados` (o replanejador usa a demanda). Matéria com domínio diferente passa por `aplicarAjusteDominio` (algoritmo §12), que ajusta `blocosAlocados` das automáticas. Matéria com `blocosDesejados` diferente fica com `blocosAlocados = blocosDesejados`; se o pedido foi apagado, ela volta a ser automática e perde `blocosAlocados`. Matéria removida sai da lista, e os blocos dela continuam no histórico. Depois replaneja com a causa `HORARIOS_ALTERADOS`.
- `responderCobertura` grava `plano.respostaCobertura = { resposta: 'ACEITO' | 'RECUSADO', dataAlvo }` e replaneja; aceitar acrescenta a causa `RETA_FINAL`. É recusada quando a reta final não se aplica, para uma recusa antecipada não calar a pergunta (algoritmo §6.1). A fachada replaneja antes, se for preciso, para conferir o estado de hoje.

**Persistência.** A persistência usa IndexedDB em `js/db.js`, acessado somente pela fachada. A store `sessao` guarda rascunho e cronograma juntos, e cada ação lê a sessão, chama `js/fluxo.js` e grava numa só operação, para que uma falha não deixe partes de planos diferentes. As gravações são serializadas na fachada e verificam uma revisão na transação para impedir que outra aba sobrescreva alterações silenciosamente. Abrir o app no mesmo dia, sem nada a replanejar, não grava. Falhas de gravação são mostradas como erro, nunca como sucesso. Depois de abrir o banco, `js/db.js` pede armazenamento persistente (`navigator.storage.persist()`), sem esperar a resposta e sem tratar a recusa como erro. É salvamento no mesmo navegador e origem, sem conta, servidor ou sincronização entre dispositivos. O armazenamento normalizado em stores de domínio do §6 fica para depois.

`avaliarRascunho` acrescenta também `blocosPorSemana`, `minutosPorSemana` e `blocosNoPeriodo` à viabilidade. `capacidadeTotal` continua sendo a janela de estudo; `blocosNoPeriodo` inclui os horários depois da prova, quando houver. `montarPrevia` usa `gerarCronograma` e devolve blocos no formato do §5, com horários derivados das células ordenadas de cada dia. A viabilidade devolvida por ela usa os números do resultado final da geração (depois de reduzir passagens, se escolhido), e `retaFinal` vem da geração. Uma entrada inviável sem escolha explícita não gera blocos; a opção PARCIAL só é aceita quando não há bloqueio. Reduzir demanda e reta final só podem ser escolhidas quando suas saídas resolvem o caso. Mais tempo e retirada de matérias são aplicados ao rascunho antes de avaliar novamente.

O cadastro exige início a partir de hoje, período inclusivo de até 366 dias, ao menos uma matéria e um horário que ocorra no período. Em `atualizarCadastro`, o início tem que ser o do plano em andamento e o fim tem que ser a partir de hoje; o resto da validação é a mesma. As células usam 00:00 a 23:30 em passos de 30 minutos, com dia de 0 a 6 e sem duplicatas. Nomes de matérias são aparados e comparados sem diferenças de maiúsculas ou acentos. IDs de matérias são strings únicas, não vazias, diferentes de `RESERVA`, `__proto__`, `constructor` e `prototype`. Domínio/peso são inteiros de 1 a 5; “não sei” vira 3. A fachada valida as entradas e lança `RangeError` em português. O limite de período evita grades e buscas excessivas no navegador; nenhuma regra do algoritmo é alterada.

- **Bloco, como a tela recebe:** `{ id, data, hora, ordem, topicoId, topicoNome, tipo, extra, status, fixado, motivo, duracaoMin }`, com `tipo` ESTUDO, REVISAO ou RESERVA, e `status` PENDENTE, CONCLUIDO, PULADO ou PERDIDO. `id` é inteiro. `hora` é preenchida pela fachada a partir das células (§3.3). O bloco concluído traz também `qualidade`, `concluidoEm` e `sequenciaConclusao` (algoritmo §11).
- **Mudanças:** `[{ antes: bloco | null, depois: bloco | null, causa }]`, com `causa` PERDIDO_VOLTOU, PULADO_VOLTOU, REVISAO_AGENDADA, AJUSTE_DOMINIO, HORARIOS_ALTERADOS ou RETA_FINAL. Quem calcula é a fachada, comparando os blocos futuros antes e depois do replanejamento.
- **Viabilidade:** o objeto devolvido por `avaliarViabilidade` (algoritmo §4), acrescido pela fachada de `capacidadeTotal` e `capacidadeReserva` (de `calcularCapacidade`) e de `retaFinal` (resultado de `avaliarRetaFinal`, algoritmo §6.1, ou null quando a condição da reta final não vale), que a tela usa nos números do §3.4. A tradução para "pinte mais K horários" é feita na tela.
- **Erros:** a fachada lança `RangeError` com mensagem em português quando a entrada é inválida, e a tela mostra a mensagem junto do campo.
- Este contrato é o ponto de encontro entre quem faz as telas e quem faz a lógica. Qualquer mudança passa primeiro por este documento.

## 6. Dados que a tela usa

- **Nova store `celulas`:** `{ id, planoId, diaSemana, hora }`. É a fonte da disponibilidade; os minutos por dia da semana são derivados dela.
- O restante do modelo está no `docs/algoritmo.md` §11 e no contexto do projeto.
- O rascunho do cadastro pode ficar em memória até "Montar meu plano". Nada é gravado antes disso.

## 7. Textos e vocabulário

- **Termos com a metáfora** (só nestes lugares):
  - "Seu passo de hoje": a tela principal;
  - "Passo dado": bloco concluído;
  - "Seu percurso": a grade da semana.
- **Termos planos no resto:** bloco, matéria, revisão, plano.
- **Frases de motivo:** vêm prontas da fachada (algoritmo §8 e §9). A tela não monta motivo sozinha.
- **Tom:** frases curtas, sem ponto de exclamação, sem "parabéns", sem "infelizmente". Exemplos:
  - "2 blocos de ontem não foram feitos. Voltaram para o plano."
  - "Não cabe tudo: faltam 3 blocos."
  - "Hoje não tem estudo marcado."
- **Datas na tela:** formatadas com `Intl.DateTimeFormat('pt-BR')`, a partir das strings 'YYYY-MM-DD'.

## 8. Fora do MVP

- Arrastar e soltar blocos.
- IA no cadastro (o aluno descreve em texto livre e o sistema preenche).
- Painel de acompanhamento e desempenho (RF09).
- Exportação e importação em JSON (RF10).
- Duração de bloco diferente de 30 minutos.
- Múltiplas provas no mesmo período.

## 9. Em aberto (decisão do responsável pelo front)

- Identidade visual da plataforma (a landing usa Poppins e o logo das pegadas).
- Prioridade entre celular e computador, e como a grade de pintura funciona em tela pequena.
- Detalhes do modo foco: pausa, encerrar antes, som ou notificação no fim.
- Se entra alguma visão extra, como o calendário do mês.
- Onboarding: se o cadastro mostra um exemplo preenchido ou começa vazio.

## 10. Demonstração na landing

A seção `about-us` de `index.html` apresenta uma demonstração da organização dos estudos, identificada como exemplo ilustrativo com dados fictícios. A grade é predefinida para mostrar a interface, sem alegar que foi gerada pelo algoritmo. No navegador, o painel só altera estados e respostas em memória: não calcula planejamento, não importa `js/core/`, `js/db.js` ou `js/api.js`, não replaneja, não cadastra nem persiste dados. O contrato da fachada permanece inalterado.

São duas abas horizontais, acessíveis por botões separados:

- **Seu percurso**, aberta inicialmente: mostra uma grade semanal com domingo, segunda, terça, quarta, quinta, sexta e sábado em colunas. As linhas agrupam as faixas 08:00–10:00, 10:00–12:00, 12:00–14:00 e 14:00–16:00. Cada cartão mostra matéria, assunto e seu horário específico de 30 minutos, além do estado **Pendente** ou **Passo dado**. Um botão permite marcar como estudado e voltar a pendente. A marcação muda apenas o exemplo; não agenda revisões nem simula a conclusão de um bloco real. Os estados têm texto e marca visual, sem depender só da cor e sem tratar pendências como punição.
- **Suas matérias**: apresenta um formulário em três etapas, uma matéria por vez: Matemática, Português e História, as mesmas matérias da grade. O botão **Responder sobre minhas matérias** abre essa aba na etapa em andamento (ou no resumo, se já concluído). Para cada matéria, usa as perguntas e alternativas de domínio e peso do §3.1, incluindo **não sei**, correspondente a 3. Todos os campos são obrigatórios, com validação nativa do navegador antes de avançar. A etapa indica a posição no formulário; é possível voltar à matéria anterior sem perder respostas. As etapas inativas ficam ocultas e desabilitadas para não bloquear a validação da matéria visível. Ao terminar, um resumo confirma as respostas textuais por matéria e permite editar cada uma. O exemplo apresenta a autoavaliação do aluno; não atribui nota, não faz avaliação objetiva da proficiência e não recalcula a grade.

As faixas de duas horas são apenas agrupamentos visuais: os blocos continuam com 30 minutos, como previsto no MVP. A grade não representa datas reais, não destaca o dia atual e não simula sequenciamento ou replanejamento. Essas escolhas mantêm a demonstração pequena sem mudar as regras da plataforma.

Trocar de aba preserva as marcações, a etapa atual e as respostas, inclusive antes de enviar o formulário. **Reiniciar** devolve todos os cartões a pendente, limpa respostas e resumo, retorna o questionário à primeira matéria e abre Seu percurso. Nada permanece após recarregar a página.

As abas permitem navegação pelas setas, Home e End, com apenas a selecionada na sequência de Tab, foco visível e painéis inativos com `hidden`. A grade usa cabeçalhos de dia e faixa de horário. No celular, mantém os sete dias na horizontal dentro de uma área com rolagem localizada, acessível pelo teclado e identificada com instrução de rolagem; a página inteira não deve transbordar. Os campos têm rótulos associados e as mudanças usam uma região de status com anúncio `polite`. O painel respeita movimento reduzido. Sem JavaScript, a grade inicial continua legível, os controles ficam desabilitados e um aviso explica que as interações precisam dele.

## 11. Plataforma com cadastro e geração real

A plataforma começa vazia no cadastro: matérias → proficiência → período → horários → conferência de viabilidade. O aluno informa os nomes, responde domínio e peso de uma matéria por vez, escolhe o período e pinta seus horários de 30 minutos. A dificuldade é representada pelo domínio declarado, sem uma nota adicional. Não há cronograma antes de terminar o cadastro e solicitar a geração.

- A tela chama somente `js/api.js` para capacidade, viabilidade e geração. A fachada executa os módulos existentes do algoritmo. A demonstração da landing continua fictícia e independente.
- O visual mantém Poppins, azul, verde, painel branco, abas **Suas matérias** e **Seu percurso**, e grade semanal de domingo a sábado. A aba do percurso só fica disponível depois da geração. A semana mostra datas reais, somente linhas com horários selecionados e navegação entre semanas limitada ao período. Blocos exibem o motivo devolvido pelo algoritmo; reservas aparecem como tempo livre e extras são identificados.
- As respostas e horários podem ser revistos pelo cadastro. Um aviso informa quando há alterações por aplicar; a nova grade só substitui a anterior após a geração confirmada. A matéria pode ser removida com atualização do rascunho, preservando as respostas das restantes.
- Quando não cabe, a conferência mostra os números e as saídas calculadas: ajustar horários, estender período quando possível, reduzir passagens, retirar matérias, reta final ou aceitar cobertura parcial quando permitido. A geração bloqueada mantém o cadastro e explica como continuar.
- Respostas e cronograma são salvos localmente conforme §5.1 e restaurados ao reabrir. Ao abrir, a plataforma chama `obterHoje`, para o plano já vir replanejado. O percurso mostra o status de cada bloco conforme a tabela do §3.6 (Passo dado, pulado, perdido, extra); tocar num bloco mostra o motivo ("Por que agora?") e não muda o status nesta entrega. Horário fora das células pintadas aparece como "—", para não confundir com a reserva ("Horário livre"). Antes do início do plano, rever o cadastro gera o plano de novo; com o plano em andamento, aplica as alterações com `atualizarCadastro`, e a data de início fica travada. O cálculo inicial e a distribuição são reais, através do pipeline.
- Decisões desta entrega, até a tela "Seu passo de hoje" chegar:
  - O bloco do percurso é um cartão sem ação (não é botão), com o motivo sempre visível sob "Por que agora?". O estado também vem em texto: "○ Pendente", "✓ Passo dado", "↷ Pulado" e "– Não feito" (perdido).
  - Um horário pode mostrar mais de um bloco: depois de mudar os horários, um bloco mantido (passo dado, pulado) pode ficar no mesmo horário de um novo. As linhas da semana são os horários pintados e também os horários dos blocos daquela semana, para um passo dado num horário despintado continuar aparecendo.
  - Com o plano em andamento, a conferência não mostra os números de plano novo nem as saídas (elas valem só na criação). O botão vira "Aplicar alterações", e a cobertura depois do replanejamento aparece no aviso de cobertura parcial do percurso.
  - O id de uma matéria nova nunca repete o de uma matéria que já esteve no plano, para ela não herdar o histórico de blocos da antiga.
- Há retorno entre etapas, validação junto dos campos, foco visível, abas por teclado, região de status, rolagem localizada das grades e respeito ao movimento reduzido. Sem JavaScript, o aviso informa que o cadastro precisa dele. O rodapé informa que o salvamento é neste navegador.
