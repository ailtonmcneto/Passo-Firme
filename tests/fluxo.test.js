import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    iniciarCronograma, precisaReplanejar, replanejarCronograma, concluir, pular,
    atualizarCadastro, responderCobertura, blocosDoDia,
} from '../js/fluxo.js';
import { montarPrevia } from '../js/api.js';
import { carregarFixture } from './carregar-fixture.js';

// Notação da especificação, um dia por trecho: "11-30 1:19:00:mat 2:19:30:por; 12-02 3:19:00:R".
// Cada bloco é id:hora:matéria, com R = RESERVA e * = extra. As fixtures guardam os blocos
// completos; a notação é a parte conferida à mão.
function notacao(blocos) {
    const dias = new Map();
    for (const b of blocos) {
        const texto = `${b.id}:${b.hora}:${b.tipo === 'RESERVA' ? 'R' : b.topicoId}${b.extra ? '*' : ''}`;
        const dia = b.data.slice(5);
        if (!dias.has(dia)) dias.set(dia, []);
        dias.get(dia).push(texto);
    }
    return [...dias].map(([dia, itens]) => `${dia} ${itens.join(' ')}`).join('; ');
}

// Os blocos de hoje em diante, que são os que o replanejamento refaz.
const futuros = (cronograma, hoje) => cronograma.blocos.filter((b) => b.data >= hoje);
const doBloco = (cronograma, id) => cronograma.blocos.find((b) => b.id === id);
// Cada mudança resumida em causa e id do bloco (null quando a causa não tem bloco).
const resumoMudancas = (mudancas) =>
    mudancas.map((m) => ({ causa: m.causa, id: m.antes?.id ?? m.depois?.id ?? null }));
const numeros = (c) => ({
    viavel: c.viabilidade.viavel,
    capacidadeEstudo: c.viabilidade.capacidadeEstudo,
    demandaTotal: c.viabilidade.demandaTotal,
    cobertura: c.viabilidade.cobertura.percentual,
});

const cadastro = carregarFixture('fluxo-cadastro.json');
const g1 = carregarFixture('fluxo-g1-iniciar.json');
const g2 = carregarFixture('fluxo-g2-concluir.json');
const g3 = carregarFixture('fluxo-g3-pular.json');
const g4 = carregarFixture('fluxo-g4-replanejar-quarta.json');
const g5 = carregarFixture('fluxo-g5-replanejar-sexta.json');
const g6 = carregarFixture('fluxo-g6-atualizar-cadastro.json');
const g7 = carregarFixture('fluxo-g7-reta-final.json');

describe('iniciarCronograma', () => {
    test('a prévia da fixture é a que a fachada monta para o cadastro de base', async () => {
        assert.deepEqual(await montarPrevia(cadastro.rascunho, cadastro.hoje), g1.entrada.previa);
    });

    test('G1: ids 1 a 16 na ordem dos blocos, proximoId 17', () => {
        const G1 = iniciarCronograma(g1.entrada.previa, g1.entrada.hoje);
        assert.deepEqual(G1, g1.esperado);
        assert.deepEqual(numeros(G1), { viavel: true, capacidadeEstudo: 12, demandaTotal: 10, cobertura: 100 });
        assert.equal(G1.cobertura, 'NAO_SE_APLICA');
        assert.deepEqual(G1.topicos.map((t) => [t.id, t.blocosAlocados]), [['mat', 6], ['por', 4], ['his', 2]]);
        assert.equal(G1.versao, 2);
        assert.equal(G1.proximoId, 17);
        assert.equal(G1.proximaSequencia, 1);
        assert.equal(G1.atualizadoEm, '2026-11-30');
        assert.deepEqual(G1.mudancas, []);
        assert.equal(notacao(G1.blocos),
            '11-30 1:19:00:mat 2:19:30:por; 12-02 3:19:00:R 4:19:30:his; 12-04 5:08:00:mat 6:08:30:por; ' +
            '12-05 7:10:00:R 8:10:30:mat; 12-07 9:19:00:mat 10:19:30:por; 12-09 11:19:00:R 12:19:30:his; ' +
            '12-11 13:08:00:mat 14:08:30:por; 12-12 15:10:00:R 16:10:30:mat');
    });

    test('prévia bloqueada não vira cronograma', () => {
        assert.throws(() => iniciarCronograma({ ...g1.entrada.previa, bloqueado: true }, '2026-11-30'), RangeError);
    });
});

describe('precisaReplanejar', () => {
    test('mesmo dia e nada pendente no passado → false', () => {
        assert.equal(precisaReplanejar(g1.esperado, '2026-11-30'), false);
    });

    test('dia novo → true', () => {
        assert.equal(precisaReplanejar(g1.esperado, '2026-12-01'), true);
    });

    test('mesmo dia, mas um ESTUDO PENDENTE de ontem → true', () => {
        // Os blocos 1 e 2 são de 11-30 e continuam pendentes, como se o plano tivesse sido
        // atualizado em 12-01 sem marcar os perdidos.
        const cronograma = { ...g1.esperado, atualizadoEm: '2026-12-01' };
        assert.equal(precisaReplanejar(cronograma, '2026-12-01'), true);
    });

    test('mesmo dia e só uma RESERVA PENDENTE no passado → false (horário livre não é tarefa)', () => {
        // G5 foi replanejado em 12-04: no passado sobrou só a RESERVA 3 (12-02) como PENDENTE.
        assert.equal(precisaReplanejar(g5.esperado, '2026-12-04'), false);
    });
});

describe('concluir e pular', () => {
    test('G2: concluir grava o Passo dado e não replaneja', () => {
        const { cronograma, blocoId, resposta, hoje } = g2.entrada;
        const resultado = concluir(cronograma, blocoId, resposta, hoje);
        assert.deepEqual(resultado, g2.esperado);

        const G2 = resultado.cronograma;
        const bloco = doBloco(G2, 1);
        assert.equal(bloco.status, 'CONCLUIDO');
        assert.equal(bloco.qualidade, 5);
        assert.equal(bloco.concluidoEm, '2026-11-30');
        assert.equal(bloco.sequenciaConclusao, 1);
        assert.equal(G2.proximaSequencia, 2);
        assert.equal(resultado.proximaRevisao, '2026-12-01');
        // O dia não muda: o bloco 2 continua Português às 19:30, e nenhum id novo foi gasto.
        assert.deepEqual(G2.blocos.filter((b) => b.id !== 1), cronograma.blocos.filter((b) => b.id !== 1));
        assert.equal(G2.proximoId, 17);
    });

    test('G3: pular grava PULADO e não replaneja', () => {
        const { cronograma, blocoId, hoje } = g3.entrada;
        const G3 = pular(cronograma, blocoId, hoje);
        assert.deepEqual(G3, g3.esperado);
        assert.equal(doBloco(G3, 2).status, 'PULADO');
        assert.deepEqual({ ...G3, blocos: G3.blocos.filter((b) => b.id !== 2) },
            { ...cronograma, blocos: cronograma.blocos.filter((b) => b.id !== 2) });
    });

    test('erros: bloco de outro dia, bloco já concluído e resposta inválida', () => {
        const G1 = g1.esperado;
        const G2 = g2.esperado.cronograma;
        assert.throws(() => concluir(G1, 5, 'NAO_ENTROU', '2026-11-30'), RangeError);
        assert.throws(() => concluir(G2, 1, 'NAO_ENTROU', '2026-11-30'), RangeError);
        assert.throws(() => concluir(G1, 1, 'MAIS_OU_MENOS', '2026-11-30'), RangeError);
        assert.throws(() => concluir(G1, 1, 'toString', '2026-11-30'), RangeError);
        assert.throws(() => concluir(G1, 99, 'NAO_ENTROU', '2026-11-30'), RangeError);
    });

    test('erros: não se pula RESERVA, bloco do passado nem bloco já resolvido', () => {
        assert.throws(() => pular(g1.esperado, 3, '2026-11-30'), RangeError);
        assert.throws(() => pular(g1.esperado, 1, '2026-12-01'), RangeError);
        assert.throws(() => pular(g3.esperado, 2, '2026-11-30'), RangeError);
        // Bloco do futuro pode ser pulado.
        assert.equal(doBloco(pular(g1.esperado, 5, '2026-11-30'), 5).status, 'PULADO');
    });

    test('a mensagem de erro é para o aluno', () => {
        assert.throws(() => concluir(g1.esperado, 5, 'NAO_ENTROU', '2026-11-30'),
            { name: 'RangeError', message: 'Só dá para concluir um estudo pendente de hoje.' });
    });
});

describe('replanejarCronograma', () => {
    test('G4: abriu na quarta; o pulado volta como demanda e ninguém se perde', () => {
        const { cronograma, hoje } = g4.entrada;
        const G4 = replanejarCronograma(cronograma, hoje);
        assert.deepEqual(G4, g4.esperado);

        assert.deepEqual(doBloco(G4, 1), doBloco(cronograma, 1));
        assert.deepEqual(doBloco(G4, 2), doBloco(cronograma, 2));
        assert.equal(G4.blocos.some((b) => b.status === 'PERDIDO'), false);
        assert.deepEqual(resumoMudancas(G4.mudancas), [{ causa: 'PULADO_VOLTOU', id: 2 }]);
        assert.deepEqual(numeros(G4), { viavel: true, capacidadeEstudo: 11, demandaTotal: 11, cobertura: 100 });
        assert.equal(G4.proximoId, 31);
        assert.equal(G4.atualizadoEm, '2026-12-02');
        assert.equal(notacao(futuros(G4, hoje)),
            '12-02 17:19:00:mat 18:19:30:por; 12-04 19:08:00:R 20:08:30:his; 12-05 21:10:00:mat 22:10:30:por; ' +
            '12-07 23:19:00:R 24:19:30:mat; 12-09 25:19:00:por 26:19:30:mat; 12-11 27:08:00:his 28:08:30:R; ' +
            '12-12 29:10:00:por 30:10:30:mat');
        // O estudo de Matemática em 12-02 cumpre a revisão que venceu em 12-01 (C5).
        assert.equal(G4.blocos.some((b) => b.tipo === 'REVISAO'), false);
    });

    test('G5: abriu na sexta; o estudo de quarta vira PERDIDO e a reserva fica como está', () => {
        const { cronograma, hoje } = g5.entrada;
        const G5 = replanejarCronograma(cronograma, hoje);
        assert.deepEqual(G5, g5.esperado);

        assert.deepEqual(G5.blocos.filter((b) => b.data < hoje).map((b) => [b.id, b.tipo, b.status]), [
            [1, 'ESTUDO', 'CONCLUIDO'], [2, 'ESTUDO', 'PULADO'], [3, 'RESERVA', 'PENDENTE'], [4, 'ESTUDO', 'PERDIDO'],
        ]);
        assert.deepEqual(resumoMudancas(G5.mudancas), [
            { causa: 'PULADO_VOLTOU', id: 2 }, { causa: 'PERDIDO_VOLTOU', id: 4 },
        ]);
        assert.deepEqual(numeros(G5), { viavel: false, capacidadeEstudo: 9, demandaTotal: 11, cobertura: 81 });
        assert.equal(G5.proximoId, 29);
        assert.equal(notacao(futuros(G5, hoje)),
            '12-04 17:08:00:mat 18:08:30:mat*; 12-05 19:10:00:por 20:10:30:his; 12-07 21:19:00:mat 22:19:30:R; ' +
            '12-09 23:19:00:mat 24:19:30:mat; 12-11 25:08:00:por 26:08:30:his; 12-12 27:10:00:R 28:10:30:mat');
        assert.equal(doBloco(G5, 18).motivo,
            'estudo antecipado: sobrou tempo hoje e Matemática é a matéria de maior prioridade que ainda falta');
    });

    test('G7: perto do fim e sem caber, pergunta pela reta final; aceitar refaz em revezamento', () => {
        const { cronograma, hoje } = g7.replanejar.entrada;
        const G7 = replanejarCronograma(cronograma, hoje);
        assert.deepEqual(G7, g7.replanejar.esperado);
        assert.equal(G7.cobertura, 'PERGUNTAR');
        assert.deepEqual(numeros(G7), { viavel: false, capacidadeEstudo: 3, demandaTotal: 11, cobertura: 27 });
        assert.equal(notacao(futuros(G7, hoje)), '12-11 17:08:00:mat 18:08:30:por; 12-12 19:10:00:his 20:10:30:R');
        assert.deepEqual(resumoMudancas(G7.mudancas), [
            { causa: 'PULADO_VOLTOU', id: 2 },
            ...[4, 5, 6, 8, 9, 10, 12].map((id) => ({ causa: 'PERDIDO_VOLTOU', id })),
        ]);

        const ativa = responderCobertura(G7, true, hoje);
        assert.deepEqual(ativa, g7.responder.esperado);
        assert.equal(ativa.cobertura, 'ATIVA');
        assert.deepEqual(ativa.plano.respostaCobertura, { resposta: 'ACEITO', dataAlvo: '2026-12-13' });
        assert.deepEqual(resumoMudancas(ativa.mudancas), [{ causa: 'RETA_FINAL', id: null }]);
        assert.equal(notacao(futuros(ativa, hoje)), '12-11 21:08:00:mat 22:08:30:por; 12-12 23:10:00:his 24:10:30:mat');
    });

    test('recusar a reta final grava a resposta e não acrescenta causa', () => {
        const recusada = responderCobertura(g7.replanejar.esperado, false, '2026-12-11');
        assert.equal(recusada.cobertura, 'RECUSADA');
        assert.deepEqual(recusada.mudancas, []);
    });

    test('responder à reta final fora dela é recusado', () => {
        assert.throws(() => responderCobertura(g1.esperado, true, '2026-11-30'), RangeError);
        assert.throws(() => responderCobertura(g7.replanejar.esperado, 'sim', '2026-12-11'), RangeError);
    });

    test('uma revisão nova aparece em "O que mudou"', () => {
        // Os dois estudos de segunda concluídos. Na sexta, a revisão de Português (vencida em 12-01)
        // cai no 2º horário de hoje, porque o próximo estudo de Português só vem no sábado. A de
        // Matemática não entra: o estudo de Matemática de hoje cumpre o papel dela (C5).
        const um = concluir(g1.esperado, 1, 'EXPLIQUEI_SEM_CONSULTAR', '2026-11-30').cronograma;
        const dois = concluir(um, 2, 'EXPLIQUEI_SEM_CONSULTAR', '2026-11-30').cronograma;
        const depois = replanejarCronograma(dois, '2026-12-04');
        assert.deepEqual(resumoMudancas(depois.mudancas), [
            { causa: 'PERDIDO_VOLTOU', id: 4 }, { causa: 'REVISAO_AGENDADA', id: 18 },
        ]);
        const revisao = doBloco(depois, 18);
        assert.deepEqual([revisao.data, revisao.hora, revisao.topicoId, revisao.tipo, revisao.extra],
            ['2026-12-04', '08:30', 'por', 'REVISAO', false]);
        // Replanejar de novo no mesmo dia não anuncia a mesma revisão outra vez.
        const deNovo = replanejarCronograma(depois, '2026-12-04');
        assert.deepEqual(resumoMudancas(deNovo.mudancas), []);
    });

    test('depois do fim, o passado fica e não há futuro', () => {
        const fim = replanejarCronograma(g3.esperado, '2026-12-14');
        assert.equal(fim.viabilidade, null);
        assert.equal(fim.cobertura, 'NAO_SE_APLICA');
        assert.equal(fim.blocos.length, 16);
        assert.equal(fim.proximoId, 17);
    });
});

describe('atualizarCadastro', () => {
    test('G6: terça 19:00 a mais e História com domínio 2', () => {
        const { cronograma, cadastro: novo, hoje } = g6.entrada;
        const G6 = atualizarCadastro(cronograma, novo, hoje);
        assert.deepEqual(G6, g6.esperado);

        // aplicarAjusteDominio: a demanda de História sobe de 6 − 4 = 2 para 6 − 2 = 4.
        assert.equal(G6.topicos.find((t) => t.id === 'his').blocosAlocados, 4);
        assert.deepEqual(resumoMudancas(G6.mudancas), [{ causa: 'HORARIOS_ALTERADOS', id: null }]);
        assert.deepEqual(numeros(G6), { viavel: false, capacidadeEstudo: 12, demandaTotal: 13, cobertura: 92 });
        assert.deepEqual(doBloco(G6, 1), doBloco(cronograma, 1));
        assert.deepEqual(doBloco(G6, 2), doBloco(cronograma, 2));
        assert.equal(notacao(futuros(G6, hoje).filter((b) => b.id > 2)),
            '12-01 17:19:00:mat; 12-02 18:19:00:por 19:19:30:R; 12-04 20:08:00:his 21:08:30:mat; ' +
            '12-05 22:10:00:por 23:10:30:R; 12-07 24:19:00:his 25:19:30:mat; 12-08 26:19:00:por; ' +
            '12-09 27:19:00:R 28:19:30:mat; 12-11 29:08:00:his 30:08:30:por; 12-12 31:10:00:R 32:10:30:mat');
    });

    test('matéria nova entra sem blocosAlocados e matéria removida sai da lista', () => {
        const { cronograma, cadastro: novo, hoje } = g6.entrada;
        const topicos = [
            ...novo.topicos.filter((t) => t.id !== 'his'),
            { id: 'geo', nome: 'Geografia', peso: 3, dominio: 2, ordem: 3 },
        ];
        const resultado = atualizarCadastro(cronograma, { ...novo, topicos }, hoje);
        assert.deepEqual(resultado.topicos.map((t) => t.id), ['mat', 'por', 'geo']);
        assert.equal('blocosAlocados' in resultado.topicos[2], false);
        // O histórico de quem saiu continua lá, e a matéria nova ganha estudos.
        assert.equal(resultado.blocos.some((b) => b.topicoId === 'geo' && b.tipo === 'ESTUDO'), true);
        assert.equal(resultado.blocos.some((b) => b.topicoId === 'his' && b.data >= hoje), false);
    });

    test('blocosDesejados diferente vira a nova promessa; apagar o pedido volta ao automático', () => {
        const { cronograma, cadastro: novo, hoje } = g6.entrada;
        const comPedido = novo.topicos.map((t) => (t.id === 'por' ? { ...t, blocosDesejados: 2 } : t));
        const manual = atualizarCadastro(cronograma, { ...novo, topicos: comPedido }, hoje);
        assert.equal(manual.topicos[1].blocosAlocados, 2);
        assert.equal(manual.topicos[1].blocosDesejados, 2);

        const automatico = atualizarCadastro(manual, novo, hoje);
        assert.equal('blocosAlocados' in automatico.topicos[1], false);
        assert.equal('blocosDesejados' in automatico.topicos[1], false);
    });

    test('o início do plano não muda', () => {
        const { cronograma, cadastro: novo, hoje } = g6.entrada;
        const resultado = atualizarCadastro(cronograma, { ...novo, plano: { ...novo.plano, inicio: '2026-12-01' } }, hoje);
        assert.equal(resultado.plano.inicio, '2026-11-30');
    });
});

test('blocosDoDia devolve os blocos da data em ordem de horário', () => {
    const embaralhado = { ...g1.esperado, blocos: [...g1.esperado.blocos].reverse() };
    assert.deepEqual(blocosDoDia(embaralhado, '2026-12-04').map((b) => b.id), [5, 6]);
    assert.deepEqual(blocosDoDia(embaralhado, '2026-12-01'), []);
});

test('nenhuma função altera o cronograma recebido', () => {
    const entrada = structuredClone(g3.esperado);
    replanejarCronograma(entrada, '2026-12-04');
    concluir(entrada, 5, 'NAO_ENTROU', '2026-12-04');
    pular(entrada, 5, '2026-12-04');
    atualizarCadastro(entrada, g6.entrada.cadastro, '2026-11-30');
    assert.deepEqual(entrada, g3.esperado);
});
