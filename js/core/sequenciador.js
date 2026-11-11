// Etapa 4 do pipeline: em que ordem os blocos de cada matéria aparecem (docs/algoritmo.md §6).
// Quantos blocos cada uma tem já veio do alocador; aqui só se decide a posição.
import { compararCanonico } from './prioridade.js';

// Pseudo-tópico dos blocos livres. Não é matéria: não tem prioridade nem ordem de cadastro,
// então nunca passa pelo compararCanonico. A regra dele fica no comparador deste arquivo.
export const RESERVA = 'RESERVA';

function exigirInteiro(valor, minimo, nome) {
  if (!Number.isInteger(valor) || valor < minimo) {
    throw new RangeError(`${nome} deve ser um inteiro ≥ ${minimo}, recebido ${JSON.stringify(valor)}`);
  }
}

// Junta cada matéria à sua quota e valida a entrada. Devolve as matérias com `ordem` sempre
// preenchido (o índice quando falta, como no alocador) e a quota da RESERVA à parte.
// Uma quota de matéria que não está em `topicos` é erro: sem prioridade e ordem, não há como
// desempatá-la, e silenciosamente ignorá-la faria sumir blocos.
function prepararQuotas(quotas, topicos) {
  const materias = topicos.map((t, indice) => {
    if (t.id === RESERVA) throw new RangeError(`o id "${RESERVA}" é reservado e não pode ser de matéria`);
    const quota = quotas[t.id] ?? 0;
    exigirInteiro(quota, 0, `quota de ${t.id}`);
    return { id: t.id, quota, prioridade: t.prioridade, ordem: t.ordem ?? indice };
  });

  const conhecidos = new Set(topicos.map((t) => t.id));
  for (const id of Object.keys(quotas)) {
    if (id !== RESERVA && !conhecidos.has(id)) {
      throw new RangeError(`quota para "${id}", que não está entre as matérias`);
    }
  }

  const reserva = quotas[RESERVA] ?? 0;
  exigirInteiro(reserva, 0, 'quota da RESERVA');
  return { materias, reserva };
}

function exigirSoma(materias, reserva, N) {
  exigirInteiro(N, 0, 'N');
  const soma = materias.reduce((s, m) => s + m.quota, reserva);
  if (soma !== N) {
    throw new RangeError(`a soma das quotas (${soma}) tem que ser igual a N (${N})`);
  }
}

// Ordem dos blocos pela posição ideal (2k+1)·N / (2·quota). O N é o mesmo dos dois lados e
// se cancela, então a comparação é só o produto cruzado (2kₐ+1)·q_b contra (2k_b+1)·qₐ,
// sem divisão e sem float.
function compararBlocos(a, b) {
  const posicao = (2 * a.k + 1) * b.quota - (2 * b.k + 1) * a.quota;
  if (posicao !== 0) return posicao;

  // 1. Menor quota primeiro: a matéria frequente tem outro bloco logo adiante, a rara não;
  //    então quem cede o slot disputado é a frequente.
  if (a.quota !== b.quota) return a.quota - b.quota;

  // 2. A RESERVA vem depois da matéria: o bloco livre fica logo depois do estudo, que é
  //    onde as revisões (que vencem dias depois do estudo) vão precisar dele.
  const reservaA = a.id === RESERVA;
  const reservaB = b.id === RESERVA;
  if (reservaA !== reservaB) return reservaA ? 1 : -1;

  // 3. Entre matérias, a ordem canônica. Não há critério 4: blocos da mesma matéria nunca
  //    empatam na posição, e duas matérias empatadas aqui têm a mesma quota e o mesmo k.
  return compararCanonico(a, b);
}

export function ordenarPorPosicaoIdeal({ quotas, topicos, N }) {
  const { materias, reserva } = prepararQuotas(quotas, topicos);
  exigirSoma(materias, reserva, N);

  const participantes = [...materias, { id: RESERVA, quota: reserva }];
  const blocos = [];
  for (const p of participantes) {
    for (let k = 0; k < p.quota; k++) blocos.push({ ...p, k });
  }
  return blocos.sort(compararBlocos).map((b) => b.id);
}

// Reta final (§6.1): uma passada por cada matéria, na ordem canônica, antes de voltar à
// primeira. Quem esgota sai das rodadas seguintes; a RESERVA (só a sobra, nesse modo) fecha
// cada rodada enquanto tiver blocos.
export function sequenciarRevezamento(quotas, topicos) {
  const { materias, reserva } = prepararQuotas(quotas, topicos);
  const fila = [...materias].sort(compararCanonico).map((m) => ({ id: m.id, restante: m.quota }));
  fila.push({ id: RESERVA, restante: reserva });

  const sequencia = [];
  let ativos = fila.filter((item) => item.restante > 0);
  while (ativos.length > 0) {
    for (const item of ativos) {
      sequencia.push(item.id);
      item.restante--;
    }
    ativos = ativos.filter((item) => item.restante > 0);
  }
  return sequencia;
}

// Distribui a sequência pelos blocos de cada dia, na ordem. Os dias fora da janela (depois da
// avaliação) não consomem a sequência: são inteiros de reserva.
// Num dia com slots ocupados (§3), a posição real de cada slot livre vem em `dia.ordens`;
// nos outros, é só a posição na lista.
export function mapearParaDias(sequencia, dias) {
  const slotsNaJanela = dias
    .filter((dia) => dia.naJanela)
    .reduce((soma, dia) => soma + dia.blocos.length, 0);
  if (slotsNaJanela !== sequencia.length) {
    throw new RangeError(
      `a sequência tem ${sequencia.length} blocos, mas a janela tem ${slotsNaJanela} slots`,
    );
  }

  const blocos = [];
  let proximo = 0;
  for (const dia of dias) {
    dia.blocos.forEach((duracaoMin, i) => {
      const id = dia.naJanela ? sequencia[proximo++] : RESERVA;
      const ehReserva = id === RESERVA;
      blocos.push({
        data: dia.data,
        ordem: dia.ordens ? dia.ordens[i] : i + 1,
        topicoId: ehReserva ? null : id,
        tipo: ehReserva ? 'RESERVA' : 'ESTUDO',
        duracaoMin,
      });
    });
  }
  return blocos;
}

// Compõe a etapa. O modo vem de quem chama (o pipeline decide com core/cobertura.js); aqui ele
// só muda a quota da RESERVA e a forma de ordenar.
export function sequenciar({ capacidade, alocacao, topicos, modoCobertura = false }) {
  const { capacidadeTotal, capacidadeEstudo, dias } = capacidade;
  // Na reta final a reserva da janela já virou estudo na alocação; só a sobra fica livre.
  const reserva = modoCobertura
    ? alocacao.sobra
    : capacidadeTotal - capacidadeEstudo + alocacao.sobra;
  const quotas = { ...alocacao.blocos, [RESERVA]: reserva };

  // Confere a soma nos dois modos: o revezamento não usa N, mas uma soma errada ali também
  // sobraria ou faltaria slot na hora de mapear.
  const { materias } = prepararQuotas(quotas, topicos);
  exigirSoma(materias, reserva, capacidadeTotal);

  const sequencia = modoCobertura
    ? sequenciarRevezamento(quotas, topicos)
    : ordenarPorPosicaoIdeal({ quotas, topicos, N: capacidadeTotal });
  return mapearParaDias(sequencia, dias);
}
