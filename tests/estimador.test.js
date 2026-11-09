import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarAjusteDominio, recusarAjusteDominio, sugerirAjusteDominio } from '../js/core/estimador.js';
import { carregarFixture } from './carregar-fixture.js';

const fixture = carregarFixture('estimador.json');

describe('D: sugerirAjusteDominio', () => {
  for (const caso of fixture.sugerir) {
    test(caso.nome, () => {
      assert.deepEqual(sugerirAjusteDominio(caso.topico, caso.blocos), caso.esperado);
    });
  }

  test('ordenar pelos ids daria null no caso da sequência (prova que o teste distingue as duas ordens)', () => {
    const caso = fixture.sugerir.find((c) => c.nome.startsWith('ordem pela sequência'));
    // Renumerando a sequência pela ordem dos ids, as qualidades ficam [1,1,5].
    const pelosIds = [...caso.blocos]
      .sort((a, b) => a.id - b.id)
      .map((b, i) => ({ ...b, sequenciaConclusao: i + 1 }));
    assert.equal(sugerirAjusteDominio(caso.topico, pelosIds), null);
  });

  test('a recusa recomeça a sequência', () => {
    const { topico, blocos, topicoRecusado, passos } = fixture.recusa;
    assert.notEqual(sugerirAjusteDominio(topico, blocos), null);

    const recusado = recusarAjusteDominio(topico, blocos);
    assert.deepEqual(recusado, topicoRecusado);
    assert.equal(sugerirAjusteDominio(recusado, blocos), null);

    let historico = blocos;
    for (const { novoBloco, esperado } of passos) {
      historico = [...historico, novoBloco];
      assert.deepEqual(sugerirAjusteDominio(recusado, historico), esperado);
    }
  });

  test('blocos inválidos lançam RangeError (mesma validação do SM-2)', () => {
    const topico = { id: 'so', nome: 'SO', peso: 3, dominio: 3 };
    const bloco = { id: 1, topicoId: 'so', tipo: 'ESTUDO', status: 'CONCLUIDO', concluidoEm: '2026-11-09', sequenciaConclusao: 1, qualidade: 1 };
    assert.throws(() => sugerirAjusteDominio(topico, [bloco, { ...bloco, id: 2 }]), RangeError);
    assert.throws(() => sugerirAjusteDominio(topico, [{ ...bloco, qualidade: 6 }]), RangeError);
  });
});

describe('D: aplicarAjusteDominio', () => {
  for (const caso of fixture.aplicar) {
    test(caso.nome, () => {
      const copia = structuredClone(caso.topico);
      assert.deepEqual(aplicarAjusteDominio(caso.topico, caso.novoDominio, caso.blocos), caso.esperado);
      assert.deepEqual(caso.topico, copia, 'não muta o tópico recebido');
    });
  }

  test('depois de aplicar, as respostas antigas não geram nova sugestão', () => {
    const caso = fixture.aplicar[0];
    const ajustado = aplicarAjusteDominio(caso.topico, caso.novoDominio, caso.blocos);
    assert.equal(sugerirAjusteDominio(ajustado, caso.blocos), null);
  });

  test('novo domínio fora de 1 a 5 ou automático sem blocosAlocados lança RangeError', () => {
    const caso = fixture.aplicar[0];
    assert.throws(() => aplicarAjusteDominio(caso.topico, 0, caso.blocos), RangeError);
    assert.throws(() => aplicarAjusteDominio(caso.topico, 6, caso.blocos), RangeError);
    const { blocosAlocados, ...semAlocados } = caso.topico;
    assert.throws(() => aplicarAjusteDominio(semAlocados, 3, caso.blocos), RangeError);
  });
});
