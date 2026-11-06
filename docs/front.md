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
   - **Montar assim mesmo**, sabendo que a cobertura é parcial.
3. **Bloqueado** (mais matérias do que blocos de estudo): "São N matérias e só M blocos de estudo." O aluno precisa pintar mais horários, estender o período ou tirar matérias (as saídas "mais tempo" e "tirar matérias" do algoritmo). "Reduzir passagens" não resolve esse caso, e não existe "montar assim mesmo". O botão continua visível e, se tocado, explica o motivo em vez de ficar desabilitado.

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
- **Quando o front pede replanejamento:** ao abrir o app (a fachada replaneja só se houver bloco PENDENTE com data anterior a hoje ou se a última geração foi em outro dia), ao concluir ou pular um bloco, ao mudar horários ou matérias, ao aceitar uma sugestão de domínio, ao escolher uma saída de viabilidade.
- **Nunca:** empurrar bloco para o dia seguinte, marcar algo em vermelho, mostrar sequência de dias, pedir justificativa para pular.
- **Arrastar e soltar:** fora do MVP. Se vier depois, é só outra forma de disparar "trocar".

## 5. Contrato com a fachada (`js/api.js`)

Todas as funções são assíncronas, para que na fase 2 a implementação troque o acesso local por chamadas à API Java sem mudar as telas. Datas sempre como 'YYYY-MM-DD'. A data de hoje é calculada uma vez na tela com `hojeLocal(new Date())` e passada adiante.

| Função | Recebe | Devolve |
|---|---|---|
| `avaliarRascunho(rascunho)` | `{ plano, topicos, celulas }` ainda não salvos | `viabilidade` (sem gravar nada) |
| `criarPlano(rascunho, escolha?)` | rascunho e a saída escolhida, se houver | `{ planoId, bloqueado, viabilidade }` |
| `obterHoje(planoId, hoje)` | — | `{ data, blocos, sugestao, mudancas }`; replaneja antes, se for preciso |
| `obterSemana(planoId, inicioSemana)` | data da segunda-feira | `{ dias: [{ data, blocos }] }` |
| `concluirBloco(blocoId, resposta, hoje)` | uma das três respostas | `{ proximaRevisao, sugestao, mudancas }` |
| `pularBloco(blocoId, hoje)` | — | `{ mudancas }` |
| `trocarBlocos(blocoIdA, blocoIdB, hoje)` | — | `{ mudancas }` |
| `definirFixado(blocoId, fixado)` | true ou false | `{ ok }` |
| `atualizarCelulas(planoId, celulas, hoje)` | nova lista de células | `{ viabilidade, mudancas }` |
| `atualizarTopicos(planoId, topicos, hoje)` | matérias alteradas | `{ viabilidade, mudancas }` |
| `responderSugestao(topicoId, aceitar, hoje)` | true ou false | `{ viabilidade, mudancas }` |

- **Bloco, como a tela recebe:** `{ id, data, hora, ordem, topicoId, topicoNome, tipo, extra, status, fixado, motivo, duracaoMin }`, com `tipo` ESTUDO, REVISAO ou RESERVA, e `status` PENDENTE, CONCLUIDO, PULADO ou PERDIDO. `hora` é preenchida pela fachada a partir das células (§3.3).
- **Mudanças:** `[{ antes: bloco | null, depois: bloco | null, causa }]`, com `causa` PERDIDO_VOLTOU, PULADO_VOLTOU, REVISAO_AGENDADA, AJUSTE_DOMINIO ou HORARIOS_ALTERADOS. Quem calcula é a fachada, comparando os blocos futuros antes e depois do replanejamento.
- **Viabilidade:** o objeto devolvido por `avaliarViabilidade` (algoritmo §4), acrescido pela fachada de `capacidadeTotal` e `capacidadeReserva` (de `calcularCapacidade`), que a tela usa nos números do §3.4. A tradução para "pinte mais K horários" é feita na tela.
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

A seção `about-us` de `index.html` apresenta um painel interativo para explicar a plataforma antes do cadastro. É uma demonstração identificada como tal, com dados fictícios fixos e estado apenas em memória. Não cria planos, não persiste dados, não exige cadastro e não acessa `js/api.js`, `js/core/` ou banco de dados. As interações alternam cenários preparados; não calculam prioridade, capacidade, revisão ou replanejamento. Esta seção não altera o contrato da fachada nem substitui as telas dos §§3 e 4.

O painel tem três abas:

- **Seu passo de hoje**, aberta inicialmente: mostra blocos de 30 minutos com horário, matéria, tipo e motivo previamente escritos. Fazer abre uma prévia do modo foco com `30:00` estático, explicitamente identificado como exemplo sem contagem. Simular a conclusão abre a pergunta "Como foi?" com as três respostas do §3.5. A resposta mostra "Passo dado" e uma explicação demonstrativa das revisões, sem calcular uma data. Pular mostra o estado "Pulado" e um cenário fixo de retorno ao plano, sem exigir justificativa, impor punição ou prometer transferência para o dia seguinte.
- **Seu percurso**: apresenta uma semana fictícia com os horários e os tipos de bloco. Reflete os estados simulados da aba de hoje e identifica as mudanças do cenário de retorno ao plano. É uma prévia da organização, sem edição real de horários ou geração de cronograma.
- **Sua assessoria**: explica como matérias, domínio declarado e peso orientam a distribuição dentro dos horários disponíveis, além da verificação de viabilidade, autoavaliação, revisões e ajustes do plano. A assessoria é automatizada; o painel não promete acompanhamento humano nem representa um canal de contato.

Reiniciar exemplo restaura os dados e estados iniciais e volta à aba Seu passo de hoje. Estados usam texto e ícone, sem depender só de cor. As abas permitem navegação pelo teclado, mantêm foco visível e identificam a seleção e o painel correspondente para tecnologias assistivas. Confirmações são anunciadas sem exigir que o visitante procure a mudança. A disposição se adapta a telas pequenas e respeita a preferência por movimento reduzido. Sem JavaScript, uma mensagem informa que a interação precisa dele e o conteúdo introdutório continua legível.
