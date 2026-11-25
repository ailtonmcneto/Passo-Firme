// Testes da fachada com a sessão gravada: o fluxo diário de ponta a ponta (gerar, abrir o app,
// concluir, pular, replanejar, mudar o cadastro e responder à reta final), sobre o IndexedDB
// falso. Os resultados esperados são as fixtures fluxo-*.json, as mesmas de tests/fluxo.test.js.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { criarIndexedDBFalso } from './indexeddb-falso.js';
import { carregarFixture } from './carregar-fixture.js';
import { blocosDoDia } from '../js/fluxo.js';

const { indexedDB, dados } = criarIndexedDBFalso();
globalThis.indexedDB = indexedDB;

const { rascunho, rascunhoG6, hoje } = carregarFixture('fluxo-cadastro.json');
const g3 = carregarFixture('fluxo-g3-pular.json');
const g5 = carregarFixture('fluxo-g5-replanejar-sexta.json');
const g6 = carregarFixture('fluxo-g6-atualizar-cadastro.json');
const g7 = carregarFixture('fluxo-g7-reta-final.json');

// A fachada guarda a sessão em memória. Para simular "recarregar a página", cada chamada importa
// uma cópia nova do módulo (o ?n= muda o endereço); o banco falso continua o mesmo.
let recargas = 0;
const abrirApp = () => import(`../js/api.js?n=${++recargas}`);

// O que está gravado, sem o `cadastro` que a fachada acrescenta ao cronograma.
const gravada = () => dados.get('atual');
function cronogramaGravado() {
    const { cadastro, ...cronograma } = gravada().cronograma;
    return cronograma;
}

// Gera o plano de base em 11-30, conclui o bloco 1 e pula o 2: a sessão fica igual a G3.
async function chegarEmG3(api) {
    await api.gerarPlanoLocal(rascunho, hoje);
    await api.concluirBloco(1, 'EXPLIQUEI_SEM_CONSULTAR', hoje);
    await api.pularBloco(2, hoje);
}

beforeEach(() => dados.clear());

test('sessão no formato antigo é descartada, mantendo o contador de revisão', async () => {
    dados.set('atual', { rascunho, cronograma: { blocos: [] }, marcacoes: ['2026-11-30/1'], revisao: 7 });
    const api = await abrirApp();
    assert.deepEqual(await api.obterSessao(), { versao: 2, revisao: 7, rascunho: null, cronograma: null });
    assert.equal(await api.obterHoje(hoje), null);

    // A próxima gravação substitui a sessão antiga sem dar conflito de "outra aba".
    await api.salvarRascunho(rascunho);
    assert.deepEqual(gravada(), { versao: 2, revisao: 8, rascunho, cronograma: null });
});

test('gerar, abrir, concluir e pular: a sessão gravada é G3', async () => {
    const api = await abrirApp();
    await api.gerarPlanoLocal(rascunho, hoje);
    assert.deepEqual(gravada().cronograma.cadastro, rascunho);
    assert.deepEqual(gravada().cronograma.blocos.map((b) => b.id), [...Array(16)].map((_, i) => i + 1));

    // Abrir o app no mesmo dia em que o plano foi feito não replaneja nem grava.
    const revisao = gravada().revisao;
    const dia = await api.obterHoje(hoje);
    assert.equal(gravada().revisao, revisao);
    assert.equal(dia.data, hoje);
    assert.deepEqual(dia.blocos.map((b) => [b.id, b.hora, b.topicoId]), [[1, '19:00', 'mat'], [2, '19:30', 'por']]);
    assert.deepEqual(dia.mudancas, []);
    assert.equal(dia.cobertura, 'NAO_SE_APLICA');
    assert.equal(dia.viabilidade.viavel, true);

    assert.deepEqual(await api.concluirBloco(1, 'EXPLIQUEI_SEM_CONSULTAR', hoje), { proximaRevisao: '2026-12-01' });
    assert.deepEqual(await api.pularBloco(2, hoje), { ok: true });
    assert.deepEqual(cronogramaGravado(), g3.esperado);
});

test('abrir o app na sexta replaneja e grava uma vez (G5); recarregar no mesmo dia não grava', async () => {
    await chegarEmG3(await abrirApp());

    const api = await abrirApp();
    const dia = await api.obterHoje('2026-12-04');
    assert.deepEqual(cronogramaGravado(), g5.esperado);
    assert.deepEqual(dia.blocos, blocosDoDia(g5.esperado, '2026-12-04'));
    assert.deepEqual(dia.mudancas, g5.esperado.mudancas);
    assert.deepEqual(dia.viabilidade, g5.esperado.viabilidade);
    assert.equal(dia.retaFinal, g5.esperado.retaFinal);

    const revisao = gravada().revisao;
    await (await abrirApp()).obterHoje('2026-12-04');
    assert.equal(gravada().revisao, revisao);
});

test('gerarPlanoLocal só vale antes de o plano começar', async () => {
    const api = await abrirApp();
    const amanha = { ...rascunho, plano: { ...rascunho.plano, inicio: '2026-12-01' } };
    await api.gerarPlanoLocal(amanha, hoje);
    // Ainda não começou: gerar de novo substitui o plano.
    await api.gerarPlanoLocal(rascunho, hoje);
    assert.equal(gravada().cronograma.plano.inicio, '2026-11-30');

    // Começou hoje: gerar de novo apagaria o histórico.
    await assert.rejects(api.gerarPlanoLocal(rascunho, hoje), RangeError);
});

test('atualizarCadastro aplica o cadastro novo sobre o plano em andamento (G6)', async () => {
    const api = await abrirApp();
    await chegarEmG3(api);

    const resposta = await api.atualizarCadastro(rascunhoG6, hoje);
    assert.deepEqual(resposta, { viabilidade: g6.esperado.viabilidade, mudancas: g6.esperado.mudancas });
    assert.deepEqual(cronogramaGravado(), g6.esperado);
    assert.deepEqual(gravada().cronograma.cadastro, rascunhoG6);
    assert.deepEqual(gravada().rascunho, rascunhoG6);
});

test('atualizarCadastro recusa outro início e fim no passado', async () => {
    const api = await abrirApp();
    await api.gerarPlanoLocal(rascunho, hoje);
    const revisao = gravada().revisao;

    const outroInicio = { ...rascunho, plano: { ...rascunho.plano, inicio: '2026-12-01' } };
    await assert.rejects(api.atualizarCadastro(outroInicio, hoje), /início não muda/);
    const fimNoPassado = { ...rascunho, plano: { ...rascunho.plano, fim: '2026-12-01' } };
    await assert.rejects(api.atualizarCadastro(fimNoPassado, '2026-12-02'), /fim a partir de hoje/);
    assert.equal(gravada().revisao, revisao);
});

test('responderCobertura replaneja o dia antes de responder (G7)', async () => {
    const api = await abrirApp();
    await chegarEmG3(api);
    await assert.rejects(api.responderCobertura(true, hoje), RangeError);

    const resposta = await api.responderCobertura(true, '2026-12-11');
    const esperado = g7.responder.esperado;
    assert.deepEqual(resposta, { viabilidade: esperado.viabilidade, mudancas: esperado.mudancas });
    assert.deepEqual(cronogramaGravado(), esperado);
});

test('sem plano, as ações recusam; um erro não trava as ações seguintes', async () => {
    const api = await abrirApp();
    await assert.rejects(api.concluirBloco(1, 'NAO_ENTROU', hoje), /ainda não tem um plano/);

    await api.gerarPlanoLocal(rascunho, hoje);
    await assert.rejects(api.concluirBloco(5, 'NAO_ENTROU', hoje), RangeError);
    await assert.rejects(api.pularBloco(99, hoje), RangeError);
    assert.deepEqual(await api.pularBloco(2, hoje), { ok: true });
    assert.equal(gravada().cronograma.blocos[1].status, 'PULADO');
});

test('outra aba gravou depois: a gravação desta é recusada e nada se perde', async () => {
    const abaA = await abrirApp();
    await abaA.gerarPlanoLocal(rascunho, hoje);
    const abaB = await abrirApp();
    await abaB.obterSessao();

    await abaA.concluirBloco(1, 'NAO_ENTROU', hoje);
    await assert.rejects(abaB.pularBloco(2, hoje), /outra aba/);
    assert.equal(gravada().cronograma.blocos[0].status, 'CONCLUIDO');
    assert.equal(gravada().cronograma.blocos[1].status, 'PENDENTE');
});

test('mexer no que obterHoje devolve não altera a sessão', async () => {
    const api = await abrirApp();
    await api.gerarPlanoLocal(rascunho, hoje);
    const dia = await api.obterHoje('2026-12-02');
    dia.blocos[0].status = 'CONCLUIDO';
    dia.mudancas.push('lixo');
    const sessao = await api.obterSessao();
    assert.equal(sessao.cronograma.blocos.find((b) => b.id === dia.blocos[0].id).status, 'PENDENTE');
    assert.equal(sessao.cronograma.mudancas.includes('lixo'), false);
});
