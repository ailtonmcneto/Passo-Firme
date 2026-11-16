import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avaliarRascunho, montarPrevia, resumirDisponibilidade } from '../js/api.js';
import { gerarCronograma } from '../js/core/pipeline.js';
import { diaDaSemana } from '../js/util/datas.js';
import { carregarFixture } from './carregar-fixture.js';

const casos = carregarFixture('plataforma-geracao.json');
const base = casos[0].rascunho;
const hoje = casos[0].hoje;

for (const caso of casos) {
    test(caso.descricao, async () => {
        const original = structuredClone(caso.rascunho);
        assert.deepEqual(await montarPrevia(caso.rascunho, caso.hoje, caso.escolha), caso.esperado);
        assert.deepEqual(caso.rascunho, original);
    });
}

test('fachada preserva a saída do pipeline e só preenche horários escolhidos', async () => {
    const resultado = await montarPrevia(base, hoje);
    const direto = gerarCronograma({ plano: resultado.plano, topicos: base.topicos, hoje });
    assert.deepEqual(resultado.blocos.map(({ id, hora, topicoNome, ...bloco }) => bloco), direto.blocos);
    assert.equal(resultado.blocos.length, 7);
    assert.equal(resultado.blocos.filter(b => b.topicoId === 'mat').length, 4);
    assert.equal(resultado.blocos.filter(b => b.topicoId === 'his').length, 1);
    assert.equal(resultado.blocos.filter(b => b.tipo === 'RESERVA').length, 2);
    for (const bloco of resultado.blocos) {
        assert.ok(base.celulas.some(celula => celula.diaSemana === diaDaSemana(bloco.data) && celula.hora === bloco.hora));
        assert.equal(bloco.duracaoMin, 30);
    }
});

test('respostas de domínio alteram a distribuição real', async () => {
    const alterado = { ...base, topicos: base.topicos.map(t => ({ ...t, dominio: t.id === 'mat' ? 5 : 2 })) };
    const resultado = await montarPrevia(alterado, hoje);
    assert.equal(resultado.blocos.filter(b => b.topicoId === 'mat').length, 1);
    assert.equal(resultado.blocos.filter(b => b.topicoId === 'his').length, 4);
});

test('plano parcial exige escolha e bloqueio nunca ignora matérias', async () => {
    const parcial = { ...base, celulas: base.celulas.slice(0, 4) };
    assert.equal((await montarPrevia(parcial, hoje)).bloqueado, true);
    const aceito = await montarPrevia(parcial, hoje, { tipo: 'PARCIAL' });
    assert.equal(aceito.bloqueado, false);
    assert.ok(aceito.viabilidade.cobertura.percentual < 100);
    assert.equal(new Set(aceito.blocos.filter(b => b.tipo === 'ESTUDO').map(b => b.topicoId)).size, 2);
    assert.equal((await montarPrevia(casos[1].rascunho, hoje, { tipo: 'PARCIAL' })).bloqueado, true);
    const reduzido = await montarPrevia(parcial, hoje, { tipo: 'REDUZIR_DEMANDA' });
    assert.equal(reduzido.bloqueado, false);
    assert.equal(reduzido.viabilidade.viavel, true);
});

test('reta final não ativa sozinha', async () => {
    const caso = casos[2];
    const resultado = await montarPrevia(caso.rascunho, caso.hoje);
    assert.equal(resultado.bloqueado, true);
    assert.notEqual(resultado.cobertura, 'ATIVA');
});

test('contador aceita seleção vazia e distingue semana de período', async () => {
    assert.deepEqual(await resumirDisponibilidade(base.plano, []), { blocosPorSemana: 0, minutosPorSemana: 0, blocosNoPeriodo: 0 });
    assert.deepEqual(await resumirDisponibilidade({ ...base.plano, fim: '2026-12-06' }, base.celulas), { blocosPorSemana: 7, minutosPorSemana: 210, blocosNoPeriodo: 14 });
});

test('prova limita a janela e mantém horários depois dela', async () => {
    const avaliacao = await avaliarRascunho({ ...base, plano: { ...base.plano, dataAvaliacao: '2026-11-25' } }, hoje);
    assert.equal(avaliacao.blocosNoPeriodo, 7);
    assert.equal(avaliacao.capacidadeTotal, 4);
    assert.equal(avaliacao.capacidadeEstudo, 3);
    assert.equal(avaliacao.capacidadeReserva, 4);
});

test('entradas inválidas são recusadas sem gerar plano', async () => {
    const entradas = [
        { ...base, topicos: [] },
        { ...base, topicos: [base.topicos[0], { ...base.topicos[1], nome: ' matemática ' }] },
        { ...base, topicos: base.topicos.map(t => ({ ...t, id: '__proto__' })) },
        { ...base, topicos: [{ ...base.topicos[0], dominio: 0 }] },
        { ...base, topicos: [{ ...base.topicos[0], peso: '5' }] },
        { ...base, topicos: [{ ...base.topicos[0], blocosDesejados: -1 }] },
        { ...base, celulas: [] },
        { ...base, celulas: [{ diaSemana: 7, hora: '08:00' }] },
        { ...base, celulas: [{ diaSemana: 1, hora: '24:00' }] },
        { ...base, celulas: [{ diaSemana: 1, hora: '08:15' }] },
        { ...base, celulas: [base.celulas[0], base.celulas[0]] },
        { ...base, plano: { inicio: '2026-11-15', fim: '2026-11-29' } },
        { ...base, plano: { inicio: '2026-11-23', fim: '2026-11-22' } },
        { ...base, plano: { inicio: '2026-11-23', fim: '2028-11-23' } },
        { ...base, plano: { inicio: '2026-11-23', fim: '2026-11-23' }, celulas: [{ diaSemana: 2, hora: '08:00' }] },
        { ...base, plano: { ...base.plano, dataAvaliacao: '2026-12-01' } }
    ];
    for (const entrada of entradas) await assert.rejects(montarPrevia(entrada, hoje), RangeError);
    await assert.rejects(montarPrevia(base, hoje, { tipo: 'COBERTURA' }), RangeError);
    await assert.rejects(montarPrevia(base, hoje, { tipo: 'DESCONHECIDO' }), RangeError);
});
