// Retenção e explicabilidade (docs/algoritmo.md §8): quanto o aluno ainda deve lembrar de uma
// matéria e a frase que explica por que cada bloco está onde está.
import { diferencaEmDias } from '../util/datas.js';

// Curva do esquecimento e^(−t/S) (R14): t são os dias desde a última revisão e S o intervalo do
// SM-2, que mede quanto tempo a memória dura. É a única conta em ponto flutuante do algoritmo,
// porque serve só para exibir; para ordenar, use compararPorRetencao, que é exata.
// S abaixo de 1 vira 1: intervalo 0 é o estado inicial, e dividir por ele daria infinito.
export function retencao(t, S) {
  return Math.exp(-t / Math.max(1, S));
}

export function diasDesdeUltima(estado, data) {
  if (estado == null || estado.ultimaRevisao == null) {
    throw new RangeError('diasDesdeUltima: a matéria ainda não tem conclusão (ultimaRevisao nula)');
  }
  return diferencaEmDias(estado.ultimaRevisao, data);
}

// Menor retenção primeiro. Como e^(−x) diminui quando x cresce, ordenar a retenção do menor para
// o maior é o mesmo que ordenar t/S do maior para o menor, e essa fração se compara por produto
// cruzado: t_a/S_a > t_b/S_b ⇔ t_a·S_b > t_b·S_a (S é sempre ≥ 1, então o sinal não inverte).
// Assim o desempate não depende de arredondamento de float e dá o mesmo em Java.
// Empate devolve 0, para quem chama encadear o próximo critério com ||.
export function compararPorRetencao(a, b) {
  return b.diasDesdeUltima * Math.max(1, a.intervalo) - a.diasDesdeUltima * Math.max(1, b.intervalo);
}

function exigirNota(valor, nome) {
  if (!Number.isInteger(valor) || valor < 1 || valor > 5) {
    throw new RangeError(`${nome} deve ser um inteiro de 1 a 5, recebido ${JSON.stringify(valor)}`);
  }
}

// As faixas são invertidas entre peso e domínio de propósito: peso alto e domínio baixo são os
// dois motivos para estudar mais.
function nivelDoPeso(peso) {
  exigirNota(peso, 'peso');
  if (peso >= 4) return 'alto';
  return peso === 3 ? 'médio' : 'baixo';
}

function nivelDoDominio(dominio) {
  exigirNota(dominio, 'dominio');
  if (dominio <= 2) return 'baixo';
  return dominio === 3 ? 'médio' : 'alto';
}

function dias(n) {
  return n === 1 ? '1 dia' : `${n} dias`;
}

// A frase de "Por que agora?". `estado` é o do SM-2 da matéria (§7), ou null se ela nunca foi
// concluída; só a revisão comum precisa dele. Os dias são contados até a data do bloco, e não até
// hoje, porque o motivo é gerado também para os blocos dos próximos dias.
// Sem ponto final nem exclamação, como pede o tom do docs/front.md §7.
export function motivoDoBloco(bloco, topico, estado) {
  switch (bloco.tipo) {
    case 'RESERVA':
      return 'horário livre';

    case 'ESTUDO':
      if (bloco.extra === true) {
        return `estudo antecipado: sobrou tempo hoje e ${topico.nome} é a matéria de maior prioridade que ainda falta`;
      }
      return `peso ${nivelDoPeso(topico.peso)}, domínio ${nivelDoDominio(topico.dominio)}`;

    case 'REVISAO': {
      if (bloco.extra === true) {
        return `revisão extra: ${topico.nome} é o assunto que você estudou há mais tempo`;
      }
      // Uma revisão comum só nasce de uma conclusão, então sem estado é erro de quem chamou.
      const passados = diasDesdeUltima(estado, bloco.data);
      // Atrasada é a revisão que acontece depois do dia devido (R10). A frase só constata há
      // quanto tempo a matéria não é revisada, sem falar em atraso (docs/front.md §3.8).
      if (diferencaEmDias(estado.proximaRevisao, bloco.data) > 0) {
        return `não revisado há ${dias(passados)}`;
      }
      return `revisão: estudado há ${dias(passados)}`;
    }

    default:
      throw new RangeError(`tipo de bloco desconhecido: ${JSON.stringify(bloco.tipo)}`);
  }
}
