// Fórmulas base do algoritmo (docs/algoritmo.md §2) e a ordem canônica de desempate (§1).

// Peso e domínio vêm de uma escala de 1 a 5. Um 0 ou um 2.5 é erro de quem chamou e
// deve aparecer logo, em vez de gerar uma prioridade fora da faixa de 1 a 25.
function exigirNota(valor, nome) {
  if (!Number.isInteger(valor) || valor < 1 || valor > 5) {
    throw new RangeError(`${nome} deve ser um inteiro de 1 a 5, recebido ${JSON.stringify(valor)}`);
  }
}

// Quanto mais importante e menos dominado, maior: peso 5 com domínio 1 dá 5 × 5 = 25.
export function prioridade(t) {
  exigirNota(t.peso, 'peso');
  exigirNota(t.dominio, 'dominio');
  return t.peso * (6 - t.dominio);
}

// Domínio 1 pede 5 blocos; domínio 5 ainda pede 1, para o tópico não sumir do plano.
export function demandaMinima(t) {
  exigirNota(t.dominio, 'dominio');
  return 6 - t.dominio;
}

// Tópico "manual" é aquele em que o aluno escolheu quantos blocos quer. Qualquer outro valor
// (vazio, 0, fração) é tratado como "não preencheu". Fica numa função só porque a demanda e
// o alocador precisam concordar sobre quem é manual.
export function ehManual(t) {
  return Number.isInteger(t.blocosDesejados) && t.blocosDesejados >= 1;
}

// O pedido do aluno vale mais que a fórmula.
export function demanda(t) {
  return ehManual(t) ? t.blocosDesejados : demandaMinima(t);
}

// Ordem canônica (R1): prioridade decrescente e, no empate, ordem de cadastro crescente.
// É o único lugar do código que define essa ordem; o alocador e as demais etapas importam
// este comparador em vez de escrever o seu, para que todos desempatem do mesmo jeito.
// Recebe { prioridade, ordem } já prontos porque nas etapas seguintes o tópico chega só
// com a prioridade calculada, sem peso e domínio.
export function compararCanonico(a, b) {
  return b.prioridade - a.prioridade || a.ordem - b.ordem;
}

// Devolve um array novo porque sort() altera o original, e o chamador pode depender dele.
// Se dois tópicos repetirem `ordem`, ficam na posição de entrada: o sort do JS é estável
// desde o ES2019, assim como o Collections.sort do Java.
export function ordenarPorPrioridade(topicos) {
  return topicos
    .map((topico, indice) => ({
      topico,
      prioridade: prioridade(topico),
      ordem: topico.ordem ?? indice,
    }))
    .sort(compararCanonico)
    .map((item) => item.topico);
}
