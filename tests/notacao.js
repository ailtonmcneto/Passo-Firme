// Notação compacta dos blocos, para os testes mostrarem um cronograma inteiro numa linha:
//   11-11 #1:a #2:revb #3:c* #4:R; 11-12 #1:d[F]
// R = RESERVA, rev = REVISAO, * = extra, [C] = CONCLUIDO, [P] = PULADO, [F] = fixado.
// As fixtures guardam os blocos completos; a notação serve para conferir à mão.
export function notacao(blocos) {
  const dias = new Map();
  for (const b of blocos) {
    let texto = b.tipo === 'RESERVA' ? 'R' : `${b.tipo === 'REVISAO' ? 'rev' : ''}${b.topicoId}`;
    if (b.extra === true) texto += '*';
    if (b.status === 'CONCLUIDO') texto += '[C]';
    if (b.status === 'PULADO') texto += '[P]';
    if (b.fixado === true) texto += '[F]';

    const dia = b.data.slice(5);
    if (!dias.has(dia)) dias.set(dia, []);
    dias.get(dia).push(`#${b.ordem}:${texto}`);
  }
  return [...dias].map(([dia, itens]) => `${dia} ${itens.join(' ')}`).join('; ');
}

// Quantos blocos a alocação deu a cada matéria, contados nos blocos gerados: os ESTUDO novos
// (sem id, porque quem dá o id é a fachada) que não são extra. O replanejador não devolve a
// alocação, então é assim que os testes a conferem.
export function alocacaoNosBlocos(blocos, ids) {
  const contagem = Object.fromEntries(ids.map((id) => [id, 0]));
  for (const b of blocos) {
    if (b.id === undefined && b.tipo === 'ESTUDO' && b.extra !== true) contagem[b.topicoId]++;
  }
  return contagem;
}
