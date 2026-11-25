import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    rotuloDoTipo, dataCurta, textoMudancas, textoPassoDado, textoProximoEstudo, lerHojeDaUrl, comHoje,
} from '../js/ui/textos.js';
import { carregarFixture } from './carregar-fixture.js';
import { somarDias } from '../js/util/datas.js';

// G5: o plano replanejado na sexta, com o estudo pulado (bloco 2) e o perdido (bloco 4).
const g5 = carregarFixture('fluxo-g5-replanejar-sexta.json');

describe('dataCurta', () => {
    test('dia da semana abreviado e dd/mm', () => {
        assert.equal(dataCurta('2026-11-30'), 'seg 30/11');
        assert.equal(dataCurta('2026-12-05'), 'sáb 05/12');
        assert.equal(dataCurta('2026-12-02'), 'qua 02/12');
    });
});

describe('rotuloDoTipo', () => {
    test('os cinco rótulos', () => {
        assert.equal(rotuloDoTipo({ tipo: 'ESTUDO', extra: false }), 'Estudo');
        assert.equal(rotuloDoTipo({ tipo: 'ESTUDO', extra: true }), 'Estudo antecipado');
        assert.equal(rotuloDoTipo({ tipo: 'REVISAO', extra: false }), 'Revisão');
        assert.equal(rotuloDoTipo({ tipo: 'REVISAO', extra: true }), 'Revisão extra');
        assert.equal(rotuloDoTipo({ tipo: 'RESERVA', extra: false }), 'Horário livre');
    });
});

describe('textoMudancas', () => {
    test('G5: uma frase para o pulado e outra para o perdido, na ordem das causas', () => {
        assert.deepEqual(textoMudancas(g5.esperado.mudancas), [
            '1 estudo que você pulou voltou para o plano: Português, seg 30/11 19:30.',
            '1 estudo que ficou para trás voltou para o plano: História, qua 02/12 19:30.',
        ]);
    });

    test('5 perdidos: lista 3 e termina com "e mais 2."', () => {
        const historia = g5.esperado.mudancas[1].antes;
        // Cinco cópias do bloco perdido de História, um dia depois do outro.
        const mudancas = Array.from({ length: 5 }, (_, i) => ({
            antes: { ...historia, id: 100 + i, data: somarDias('2026-11-30', i) }, depois: null, causa: 'PERDIDO_VOLTOU',
        }));
        const [frase] = textoMudancas(mudancas);
        assert.equal(frase, '5 estudos que ficaram para trás voltaram para o plano: '
            + 'História, seg 30/11 19:30; História, ter 01/12 19:30; História, qua 02/12 19:30 e mais 2.');
    });

    test('lista vazia não tem frase', () => {
        assert.deepEqual(textoMudancas([]), []);
    });

    test('revisão agendada, horários e reta final', () => {
        const revisao = { ...g5.esperado.mudancas[0].antes, tipo: 'REVISAO', topicoNome: 'Matemática', data: '2026-12-04' };
        assert.deepEqual(textoMudancas([
            { antes: null, depois: null, causa: 'RETA_FINAL' },
            { antes: null, depois: revisao, causa: 'REVISAO_AGENDADA' },
            { antes: null, depois: null, causa: 'HORARIOS_ALTERADOS' },
        ]), [
            'Reta final ativada.',
            'Revisão de Matemática marcada para sex 04/12.',
            'O plano foi refeito com suas matérias e horários novos.',
        ]);
    });

    test('nenhuma frase pune', () => {
        const frases = textoMudancas(g5.esperado.mudancas).join(' ');
        assert.doesNotMatch(frases, /atrasad|falhou|dias perdidos/i);
    });
});

describe('confirmações da tela de hoje', () => {
    test('passo dado com e sem próxima revisão', () => {
        assert.equal(textoPassoDado('Matemática', '2026-12-02'), 'Passo dado. Próxima revisão de Matemática a partir de qua 02/12.');
        assert.equal(textoPassoDado('Matemática', null), 'Passo dado.');
    });

    test('próximo estudo', () => {
        assert.equal(textoProximoEstudo({ data: '2026-12-02', hora: '19:00' }), 'Seu próximo estudo é qua 02/12 às 19:00.');
    });
});

// Modo de demonstração: ?hoje=YYYY-MM-DD na URL troca a data de hoje da plataforma.
describe('lerHojeDaUrl', () => {
    test('data válida na URL: usa ela, simulada', () => {
        assert.deepEqual(lerHojeDaUrl('?hoje=2026-12-04', '2026-11-25'), { hoje: '2026-12-04', simulado: true });
    });

    test('sem ?hoje: a data real', () => {
        assert.deepEqual(lerHojeDaUrl('', '2026-11-25'), { hoje: '2026-11-25', simulado: false });
    });

    test('data que não existe: ignora e usa a data real', () => {
        assert.deepEqual(lerHojeDaUrl('?hoje=2026-02-30', '2026-11-25'), { hoje: '2026-11-25', simulado: false });
        assert.deepEqual(lerHojeDaUrl('?hoje=amanha', '2026-11-25'), { hoje: '2026-11-25', simulado: false });
    });
});

describe('comHoje', () => {
    test('acrescenta ?hoje aos links de página do site', () => {
        assert.equal(comHoje('../index.html', '2026-12-04'), '../index.html?hoje=2026-12-04');
        assert.equal(comHoje('pages/plataforma.html', '2026-12-04'), 'pages/plataforma.html?hoje=2026-12-04');
    });

    test('troca um ?hoje que já existia e mantém os outros parâmetros e a âncora', () => {
        assert.equal(comHoje('a.html?x=1&hoje=2026-11-30#topo', '2026-12-04'), 'a.html?x=1&hoje=2026-12-04#topo');
    });

    test('âncoras e links para fora ficam como estão', () => {
        assert.equal(comHoje('#sobre', '2026-12-04'), '#sobre');
        assert.equal(comHoje('mailto:a@b.c', '2026-12-04'), 'mailto:a@b.c');
        assert.equal(comHoje('https://exemplo.com/', '2026-12-04'), 'https://exemplo.com/');
    });
});
