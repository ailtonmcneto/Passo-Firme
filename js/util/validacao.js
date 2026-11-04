// Validação do plano na criação (docs/algoritmo.md §4.1). A capacidade e a viabilidade
// aceitam planos que esta função recusa, como avaliação antes do início, porque no
// replanejamento depois da prova isso é legítimo. Por isso a regra mora aqui, e só o
// gerarCronograma a chama.
import { ehDataValida, diferencaEmDias } from './datas.js';
import { MINIMO_BLOCO_MIN } from '../core/capacidade.js';

function exigirData(valor, nome) {
  if (!ehDataValida(valor)) {
    throw new RangeError(`${nome} deve ser uma data 'YYYY-MM-DD', recebido ${JSON.stringify(valor)}`);
  }
}

export function validarPlano(plano) {
  const { inicio, fim, disponibilidade, duracaoBlocoMin = 30, dataAvaliacao = null } = plano;

  exigirData(inicio, 'inicio');
  exigirData(fim, 'fim');
  if (diferencaEmDias(inicio, fim) < 0) {
    throw new RangeError(`fim (${fim}) vem antes de inicio (${inicio})`);
  }

  if (dataAvaliacao !== null) {
    exigirData(dataAvaliacao, 'dataAvaliacao');
    if (diferencaEmDias(inicio, dataAvaliacao) < 0 || diferencaEmDias(dataAvaliacao, fim) < 0) {
      throw new RangeError(`dataAvaliacao (${dataAvaliacao}) fora do período ${inicio} a ${fim}`);
    }
  }

  if (disponibilidade === null || typeof disponibilidade !== 'object') {
    throw new RangeError('disponibilidade deve ser um objeto ou array indexado por dia da semana (0–6)');
  }
  for (let dia = 0; dia <= 6; dia++) {
    const minutos = disponibilidade[dia] ?? 0;
    if (!Number.isInteger(minutos) || minutos < 0) {
      throw new RangeError(`disponibilidade[${dia}] deve ser um inteiro ≥ 0, recebido ${JSON.stringify(minutos)}`);
    }
  }

  if (!Number.isInteger(duracaoBlocoMin) || duracaoBlocoMin < MINIMO_BLOCO_MIN) {
    throw new RangeError(
      `duracaoBlocoMin deve ser um inteiro ≥ ${MINIMO_BLOCO_MIN}, recebido ${JSON.stringify(duracaoBlocoMin)}`,
    );
  }
}
