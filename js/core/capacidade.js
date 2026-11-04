// Etapa 1 do pipeline: quantos blocos de estudo cabem no período (docs/algoritmo.md §3).
import { ehDataValida, diferencaEmDias, diaDaSemana, intervaloDeDatas } from '../util/datas.js';

// Menos de 15 minutos não rende uma sessão de estudo, então essas sobras são descartadas.
export const MINIMO_BLOCO_MIN = 15;

// 4/5 da janela vira estudo e 1/5 fica de reserva. Guardamos numerador e denominador
// separados para fazer a conta só com inteiros (R3): floor(total × 4 / 5).
const ESTUDO_NUMERADOR = 4;
const ESTUDO_DENOMINADOR = 5;

function exigirMinutos(valor, nome) {
  if (!Number.isInteger(valor) || valor < 0) {
    throw new RangeError(`${nome} deve ser um inteiro ≥ 0, recebido ${JSON.stringify(valor)}`);
  }
}

function exigirData(valor, nome) {
  if (!ehDataValida(valor)) {
    throw new RangeError(`${nome} deve ser uma data 'YYYY-MM-DD', recebido ${JSON.stringify(valor)}`);
  }
}

// A sobra é somada ao último bloco em vez de virar um bloco curto: 140 min dão
// [30, 30, 30, 50], não [30, 30, 30, 30, 20]. Assim o tempo do aluno não se perde e todo
// bloco continua contando 1 na capacidade (R6), qualquer que seja a duração.
export function blocosNoDia(minutos, duracaoBlocoMin = 30) {
  exigirMinutos(minutos, 'minutos');
  // Bloco menor que o mínimo não faz sentido, e duração 0 daria divisão por zero.
  if (!Number.isInteger(duracaoBlocoMin) || duracaoBlocoMin < MINIMO_BLOCO_MIN) {
    throw new RangeError(
      `duracaoBlocoMin deve ser um inteiro ≥ ${MINIMO_BLOCO_MIN}, recebido ${JSON.stringify(duracaoBlocoMin)}`,
    );
  }

  if (minutos < MINIMO_BLOCO_MIN) return [];
  if (minutos < duracaoBlocoMin) return [minutos];

  const n = Math.floor(minutos / duracaoBlocoMin);
  const sobra = minutos - n * duracaoBlocoMin;
  const blocos = Array(n).fill(duracaoBlocoMin);
  blocos[n - 1] += sobra;
  return blocos;
}

export function calcularCapacidade({
  inicio,
  fim,
  disponibilidade,
  diasFolga = [],
  duracaoBlocoMin = 30,
  dataAvaliacao = null,
}) {
  exigirData(inicio, 'inicio');
  exigirData(fim, 'fim');
  if (diferencaEmDias(inicio, fim) < 0) {
    throw new RangeError(`fim (${fim}) vem antes de inicio (${inicio})`);
  }
  if (dataAvaliacao !== null) exigirData(dataAvaliacao, 'dataAvaliacao');
  if (disponibilidade === null || typeof disponibilidade !== 'object') {
    throw new RangeError('disponibilidade deve ser um objeto ou array indexado por dia da semana (0–6)');
  }
  for (const folga of diasFolga) exigirData(folga, 'diasFolga');

  const folgas = new Set(diasFolga);
  const dias = [];
  let capacidadeTotal = 0;
  let blocosDepoisDaAvaliacao = 0;

  for (const data of intervaloDeDatas(inicio, fim)) {
    // Dia da semana sem valor cadastrado conta como 0 minutos (dia sem estudo).
    const minutos = disponibilidade[diaDaSemana(data)] ?? 0;
    const blocos = folgas.has(data) ? [] : blocosNoDia(minutos, duracaoBlocoMin);
    // R8: a janela termina no dia da avaliação, inclusive; o que vem depois é reserva inteira.
    const naJanela = dataAvaliacao === null || diferencaEmDias(data, dataAvaliacao) >= 0;

    dias.push({ data, blocos, naJanela });
    if (naJanela) capacidadeTotal += blocos.length;
    else blocosDepoisDaAvaliacao += blocos.length;
  }

  const capacidadeEstudo = Math.floor((capacidadeTotal * ESTUDO_NUMERADOR) / ESTUDO_DENOMINADOR);
  const capacidadeReserva = capacidadeTotal - capacidadeEstudo + blocosDepoisDaAvaliacao;

  return { dias, capacidadeTotal, capacidadeEstudo, capacidadeReserva };
}
