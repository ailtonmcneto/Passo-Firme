// Etapa 3 do pipeline: quantos blocos cada tópico recebe (docs/algoritmo.md §5).
// O alocador não sabe se está na criação ou num replanejamento: quem chama passa a demanda.
import { compararCanonico, demanda, ehManual, prioridade } from './prioridade.js';

function exigirInteiro(valor, minimo, nome) {
  if (!Number.isInteger(valor) || valor < minimo) {
    throw new RangeError(`${nome} deve ser um inteiro ≥ ${minimo}, recebido ${JSON.stringify(valor)}`);
  }
}

function somar(numeros) {
  return numeros.reduce((soma, n) => soma + n, 0);
}

// O que ainda falta a um tópico depois do piso de 1 bloco.
function falta(t) {
  return t.demanda - 1;
}

// Núcleo do método dos maiores restos, com o peso escolhido por quem chama: a prioridade no
// excedente e no grupo automático, o que falta a cada tópico no grupo manual (R7).
// Os itens já chegam com `ordem`, porque o empate de resto segue a ordem canônica.
//
// Por que funciona só com inteiros: Σ floor(p·n/S) fica no máximo k abaixo de n, e a soma dos
// restos é exatamente k·S. Como cada resto é < S, há mais de k restos positivos, então as k
// sobras sempre caem em tópicos de peso > 0 e nenhum bloco se perde.
function distribuirPorRestos(itens, n, pesoDe) {
  const quotas = itens.map(() => 0);
  if (n === 0) return quotas;

  const pesos = itens.map(pesoDe);
  const total = somar(pesos);
  // Distribuir n > 0 blocos com peso total 0 não tem resposta; é erro de quem chamou.
  if (total === 0) throw new RangeError('maioresRestos: soma dos pesos é 0 com n > 0');

  const restos = pesos.map((p, i) => {
    quotas[i] = Math.floor((p * n) / total);
    return (p * n) % total;
  });

  const sobras = n - somar(quotas);
  const fila = itens
    .map((_, i) => i)
    .sort((i, j) => restos[j] - restos[i] || compararCanonico(itens[i], itens[j]));
  for (let k = 0; k < sobras; k++) quotas[fila[k]]++;
  return quotas;
}

// Distribui n blocos em proporção à prioridade. Devolve um array de inteiros alinhado com a
// entrada (quotas[i] é do topicos[i]), que é o formato mais simples de portar para Java.
export function maioresRestos(topicos, n) {
  exigirInteiro(n, 0, 'n');
  const itens = topicos.map((t, indice) => ({ ...t, ordem: t.ordem ?? indice }));
  return distribuirPorRestos(itens, n, (t) => t.prioridade);
}

// Converte os tópicos do cadastro no formato do alocador. `demandaRestante` é a convenção do
// replanejamento (§10): o replanejador calcula quanto ainda falta e o alocador só respeita.
export function montarEntradaAlocacao(topicos) {
  return topicos.map((t, indice) => {
    const temRestante = t.demandaRestante !== undefined && t.demandaRestante !== null;
    if (temRestante) exigirInteiro(t.demandaRestante, 0, 'demandaRestante');
    return {
      id: t.id,
      prioridade: prioridade(t),
      demanda: temRestante ? t.demandaRestante : demanda(t),
      manual: ehManual(t),
      ordem: t.ordem ?? indice,
    };
  });
}

// Passo 6 do caso inviável. A proporção pura daria a um tópico mais do que ele pediu; então,
// quem atingiria o teto recebe só o que falta e sai, e a parte que sobra é redistribuída entre
// os outros. Repete até ninguém saturar. Cada rodada tira ao menos um tópico, então termina.
function encherComTeto(topicos, parte, recebidos) {
  // Tópico com demanda 1 já está no teto depois do piso, então nem começa ativo.
  let ativos = topicos.filter((t) => falta(t) > 0);
  let restante = parte;

  while (restante > 0 && ativos.length > 0) {
    const quotas = distribuirPorRestos(ativos, restante, (t) => t.prioridade);
    const saturados = ativos.filter((t, k) => quotas[k] >= falta(t));

    if (saturados.length === 0) {
      ativos.forEach((t, k) => { recebidos[t.indice] += quotas[k]; });
      return;
    }

    for (const t of saturados) {
      recebidos[t.indice] += falta(t);
      restante -= falta(t);
    }
    ativos = ativos.filter((t) => !saturados.includes(t));
  }
}

// Caso inviável (Σ demanda > capacidade). `ativos` são só os tópicos com demanda > 0.
function alocarInviavel(ativos, capacidade, recebidos) {
  // R16: não dá nem 1 bloco para cada um. Os primeiros da ordem canônica ficam com 1.
  if (capacidade < ativos.length) {
    [...ativos].sort(compararCanonico).slice(0, capacidade).forEach((t) => { recebidos[t.indice] = 1; });
    return;
  }

  // Piso: todo tópico aparece ao menos uma vez no plano.
  for (const t of ativos) recebidos[t.indice] = 1;
  const resto = capacidade - ativos.length;

  // R7: o resto é dividido entre os grupos na proporção do que falta a cada um. Assim o pedido
  // explícito do aluno não é atropelado por um automático de prioridade alta, nem o contrário.
  // F > 0 sempre: Σ demanda > capacidade implica Σ (demanda − 1) > capacidade − n = resto.
  const manuais = ativos.filter((t) => t.manual);
  const automaticos = ativos.filter((t) => !t.manual);
  const faltaManual = somar(manuais.map(falta));
  const faltaAuto = somar(automaticos.map(falta));
  const F = faltaManual + faltaAuto;

  let parteManual = Math.floor((resto * faltaManual) / F);
  let parteAuto = Math.floor((resto * faltaAuto) / F);
  // Os dois restos somam F ou 0, então sobra no máximo 1 bloco. No empate vai ao manual,
  // porque o aluno pediu aquele número explicitamente.
  if (parteManual + parteAuto < resto) {
    if ((resto * faltaManual) % F >= (resto * faltaAuto) % F) parteManual++;
    else parteAuto++;
  }

  // Grupo manual: o peso é o que falta, não a prioridade, para cada um receber na proporção do
  // que pediu. Como parteManual < Σ falta (o caso é inviável), ninguém passa do pedido e não
  // é preciso enchimento com teto aqui.
  distribuirPorRestos(manuais, parteManual, falta).forEach((q, k) => {
    recebidos[manuais[k].indice] += q;
  });

  encherComTeto(automaticos, parteAuto, recebidos);
}

export function alocar({ topicos, capacidade }) {
  exigirInteiro(capacidade, 0, 'capacidade');

  // `indice` liga cada tópico à sua posição em `recebidos`, mesmo depois de filtrar e ordenar.
  const itens = topicos.map((t, indice) => {
    exigirInteiro(t.demanda, 0, 'demanda');
    return {
      id: t.id,
      prioridade: t.prioridade,
      demanda: t.demanda,
      manual: t.manual === true,
      ordem: t.ordem ?? indice,
      indice,
    };
  });

  const recebidos = itens.map(() => 0);
  const demandaTotal = somar(itens.map((t) => t.demanda));
  const viavel = demandaTotal <= capacidade;
  let sobra = 0;
  const avisos = [];

  if (viavel) {
    // C1: cada um recebe a demanda e o excedente vai para os automáticos que ainda estudam.
    // Manual não recebe excedente porque o aluno disse quantos blocos quer; demanda 0 não
    // recebe porque o tópico já terminou.
    for (const t of itens) recebidos[t.indice] = t.demanda;
    const excedente = capacidade - demandaTotal;
    const elegiveis = itens.filter((t) => !t.manual && t.demanda > 0);
    if (elegiveis.length === 0) {
      sobra = excedente;
    } else {
      distribuirPorRestos(elegiveis, excedente, (t) => t.prioridade).forEach((q, k) => {
        recebidos[elegiveis[k].indice] += q;
      });
    }
  } else {
    alocarInviavel(itens.filter((t) => t.demanda > 0), capacidade, recebidos);

    // Na ordem de entrada (cadastro), como as demais listas mostradas ao aluno.
    // Tópico de demanda 0 já terminou: ficar sem bloco é o esperado, não merece aviso.
    for (const t of itens) {
      const r = recebidos[t.indice];
      if (t.demanda === 0) continue;
      if (r === 0) {
        avisos.push({ id: t.id, tipo: 'TOPICO_SEM_BLOCO' });
      } else if (t.manual && r < t.demanda) {
        avisos.push({ id: t.id, tipo: 'QUOTA_MANUAL_REDUZIDA', desejado: t.demanda, recebido: r });
      }
    }
  }

  const blocos = {};
  for (const t of itens) blocos[t.id] = recebidos[t.indice];
  return { blocos, sobra, viavel, avisos };
}
