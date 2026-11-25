import {
    obterSessao, salvarRascunho, resumirDisponibilidade, avaliarRascunho, gerarPlanoLocal, obterHoje, atualizarCadastro,
    concluirBloco, pularBloco, responderCobertura,
} from './api.js';
import { hojeLocal, somarDias, diaDaSemana, diferencaEmDias } from './util/datas.js';
import { rotuloDoTipo, textoMudancas, textoPassoDado, textoProximoEstudo, lerHojeDaUrl, dataCurta } from './ui/textos.js';
import { manterHojeNosLinks } from './ui/modo-demonstracao.js';

// A data de hoje é lida uma vez e passada a todas as chamadas da fachada (front.md §5).
// No modo de demonstração (?hoje=YYYY-MM-DD na URL), ela é a data da URL; senão, a do relógio.
const { hoje, simulado } = lerHojeDaUrl(location.search, hojeLocal(new Date()));
const buscar = seletor => document.querySelector(seletor);
const dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const nomesEtapas = ['materias', 'perfil', 'periodo', 'horarios', 'conferir'];
let rascunho;
let cronograma = null;
let etapa = 'materias';
let materiaAtual = 0;
let inicioSemana;
let viabilidade;
let ocupado = false;
let proximoId = 1;
// O dia como a fachada devolveu em obterHoje: { data, blocos, mudancas, cobertura, retaFinal, viabilidade }.
let dia = null;
// As mudanças que o aluno fechou na faixa "O que mudou", em texto. Fechar só esconde até
// recarregar a página; se vierem mudanças diferentes (outro replanejamento), a faixa volta.
let mudancasFechadas = null;
// O botão "Feito" que abriu o "Como foi?", para o foco voltar a ele ao cancelar.
let origemDoDialogo = null;

function elemento(tag, classe, texto) {
    const no = document.createElement(tag);
    if (classe) no.className = classe;
    if (texto != null) no.textContent = texto;
    return no;
}

function formatarData(data, opcoes = { day: '2-digit', month: '2-digit' }) {
    const [ano, mes, dia] = data.split('-').map(Number);
    return new Intl.DateTimeFormat('pt-BR', opcoes).format(new Date(ano, mes - 1, dia, 12));
}

function mensagem(erro) {
    buscar('#erro').textContent = erro.message;
    buscar('#erro').hidden = false;
    buscar('#erro').focus();
}

async function executar(tarefa) {
    if (ocupado) return;
    ocupado = true;
    buscar('#erro').hidden = true;
    buscar('#plataforma').setAttribute('aria-busy', 'true');
    try { await tarefa(); }
    catch (erro) { mensagem(erro); }
    finally { ocupado = false; buscar('#plataforma').removeAttribute('aria-busy'); }
}

async function salvar() {
    buscar('#estado-salvamento').textContent = 'Salvando…';
    try {
        await salvarRascunho(rascunho);
        buscar('#estado-salvamento').textContent = 'Salvo neste navegador';
    } catch (erro) {
        buscar('#estado-salvamento').textContent = 'Alterações não salvas';
        throw erro;
    }
    atualizarAviso();
}

// O plano já começou (hoje é o início ou depois)? Aí o início não muda mais, e rever o cadastro
// aplica as alterações sobre o plano (atualizarCadastro) em vez de gerar outro.
function emAndamento() {
    return Boolean(cronograma) && hoje >= cronograma.plano.inicio;
}

// Trava o campo de início quando o plano está em andamento, com a data do plano.
function atualizarTravaInicio() {
    const inicio = buscar('#inicio');
    inicio.readOnly = emAndamento();
    if (emAndamento()) { inicio.value = cronograma.plano.inicio; rascunho.plano.inicio = cronograma.plano.inicio; }
    atualizarProva();
}

// O próximo número livre para o id de matéria nova. Conta também as matérias do plano e as do
// histórico de blocos: reaproveitar o id de uma matéria removida daria a ela o histórico antigo.
function calcularProximoId() {
    const ids = rascunho.topicos.map(topico => topico.id);
    if (cronograma) ids.push(...cronograma.topicos.map(topico => topico.id), ...cronograma.blocos.map(bloco => bloco.topicoId));
    const numeros = ids.filter(Boolean).map(id => Number(String(id).replace('materia-', ''))).filter(Number.isFinite);
    return Math.max(0, ...numeros) + 1;
}

function atualizarAviso() {
    buscar('#aviso-rascunho').hidden = !cronograma || JSON.stringify(rascunho) === JSON.stringify(cronograma.cadastro);
}

// Recebe o nome da aba ('materias', 'hoje' ou 'percurso'); mostra o painel dela e esconde os outros.
// Ex.: selecionarAba('hoje', true) → painel de hoje visível e foco na aba.
// Hoje e percurso só abrem com plano gerado.
function selecionarAba(nome, foco = false) {
    if ((nome === 'percurso' || nome === 'hoje') && !cronograma) return;
    for (const aba of document.querySelectorAll('[role="tab"]')) {
        const ativa = aba.id === 'aba-' + nome;
        aba.setAttribute('aria-selected', String(ativa));
        aba.tabIndex = ativa ? 0 : -1;
    }
    buscar('#exemplo-materias').hidden = nome !== 'materias';
    buscar('#exemplo-hoje').hidden = nome !== 'hoje';
    buscar('#exemplo-percurso').hidden = nome !== 'percurso';
    if (foco) buscar('#aba-' + nome).focus();
}

// Recebe o nome da aba; seleciona e, se for a de hoje, busca o dia de novo na fachada.
// Ex.: await abrirAba('hoje') → chama obterHoje e redesenha a lista.
// Buscar de novo ao abrir garante que a lista mostra o que está gravado agora (por exemplo,
// depois de aplicar alterações no cadastro).
async function abrirAba(nome, foco = false) {
    selecionarAba(nome, foco);
    if (nome === 'hoje') await carregarHoje();
}

function mostrarEtapa(nome, foco = true) {
    etapa = nome;
    selecionarAba('materias');
    for (const campo of document.querySelectorAll('.cadastro-etapa')) {
        campo.hidden = campo.dataset.etapa !== nome;
        campo.disabled = campo.hidden;
    }
    const indicePasso = Math.max(0, nomesEtapas.indexOf(nome) - 1);
    document.querySelectorAll('.cadastro-passos li').forEach((item, indice) => {
        if (indice === indicePasso) item.setAttribute('aria-current', 'step');
        else item.removeAttribute('aria-current');
    });
    buscar('[data-acao="voltar"]').hidden = nome === 'materias';
    buscar('#continuar').textContent = nome === 'materias' ? 'Responder sobre minhas matérias →'
        : nome === 'conferir' ? (emAndamento() ? 'Aplicar alterações →' : 'Montar meu plano →') : 'Continuar →';
    buscar('#exemplo-materias').classList.toggle('etapa-ampla', nome === 'horarios');
    if (nome === 'perfil') preencherPerfil();
    if (nome === 'materias') renderizarMaterias();
    if (nome === 'horarios') renderizarHorarios();
    if (foco) buscar('[data-etapa="' + nome + '"] legend').focus();
}

function renderizarMaterias() {
    buscar('#lista-materias').replaceChildren(...rascunho.topicos.map((topico, indice) => {
        const item = elemento('li', 'materia-cadastrada');
        item.dataset.cor = indice % 3;
        const nome = elemento('strong', null, topico.nome);
        const editar = elemento('button', 'demonstracao-link', topico.dominio ? 'Rever respostas' : 'Responder');
        editar.type = 'button'; editar.dataset.acao = 'responder'; editar.dataset.id = topico.id;
        editar.setAttribute('aria-label', 'Responder sobre ' + topico.nome);
        const remover = elemento('button', 'demonstracao-link', 'Remover');
        remover.type = 'button'; remover.dataset.acao = 'remover'; remover.dataset.id = topico.id;
        remover.setAttribute('aria-label', 'Remover ' + topico.nome);
        item.append(nome, editar, remover);
        return item;
    }));
    buscar('#materias-vazias').hidden = rascunho.topicos.length > 0;
}

async function adicionarMateria() {
    const campo = buscar('#nova-materia');
    const nome = campo.value.trim();
    const normalizar = valor => valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
    campo.setCustomValidity(!nome ? 'Digite o nome da matéria.' :
        rascunho.topicos.some(topico => normalizar(topico.nome) === normalizar(nome)) ? 'Essa matéria já está na lista.' : '');
    if (!campo.reportValidity()) return;
    const id = 'materia-' + proximoId++;
    rascunho.topicos.push({ id, nome, dominio: null, peso: null, respostaDominio: '', respostaPeso: '' });
    await salvar();
    campo.value = '';
    renderizarMaterias();
    campo.focus();
}

function preencherPerfil() {
    const topico = rascunho.topicos[materiaAtual];
    buscar('#titulo-perfil').textContent = topico.nome;
    buscar('#progresso-perfil').textContent = 'Matéria ' + (materiaAtual + 1) + ' de ' + rascunho.topicos.length;
    buscar('#progresso-materias').max = rascunho.topicos.length;
    buscar('#progresso-materias').value = materiaAtual + 1;
    buscar('#dominio').value = topico.respostaDominio || topico.dominio || '';
    buscar('#peso').value = topico.respostaPeso || topico.peso || '';
    buscar('#blocos-desejados').value = topico.blocosDesejados ?? '';
}

function coletarPerfil() {
    const topico = rascunho.topicos[materiaAtual];
    for (const [campo, resposta] of [['dominio', 'respostaDominio'], ['peso', 'respostaPeso']]) {
        const valor = buscar('#' + campo).value;
        topico[resposta] = valor;
        topico[campo] = valor === '' ? null : valor === 'nao-sei' ? 3 : Number(valor);
    }
    const blocos = buscar('#blocos-desejados').value;
    topico.blocosDesejados = blocos === '' ? null : Number(blocos);
}

function coletarPeriodo() {
    rascunho.plano.inicio = buscar('#inicio').value;
    rascunho.plano.fim = buscar('#fim').value;
    rascunho.plano.dataAvaliacao = buscar('#tem-prova').checked ? buscar('#data-prova').value : null;
    rascunho.plano.nomeAvaliacao = buscar('#tem-prova').checked ? buscar('#nome-prova').value : '';
}

function atualizarProva() {
    const tem = buscar('#tem-prova').checked;
    buscar('#campos-prova').hidden = !tem;
    buscar('#data-prova').required = tem;
    buscar('#nome-prova').required = tem;
    // Com o plano em andamento, o fim não pode ficar no passado.
    buscar('#fim').min = emAndamento() && hoje > buscar('#inicio').value ? hoje : buscar('#inicio').value;
    buscar('#fim').max = buscar('#inicio').value ? somarDias(buscar('#inicio').value, 365) : '';
    buscar('#data-prova').min = buscar('#inicio').value;
    buscar('#data-prova').max = buscar('#fim').value;
}

function cabecalhoGrade(tabela, datas = null) {
    const linha = elemento('tr');
    const horario = elemento('th', null, 'Horário'); horario.scope = 'col'; linha.append(horario);
    dias.forEach((dia, indice) => {
        const celula = elemento('th', null, dia); celula.scope = 'col';
        if (datas) {
            celula.append(elemento('span', 'data-coluna', formatarData(datas[indice])));
            if (datas[indice] === hoje) { celula.classList.add('dia-atual'); celula.append(elemento('span', 'data-coluna', 'Hoje')); }
        }
        linha.append(celula);
    });
    tabela.querySelector('thead').replaceChildren(linha);
}

function renderizarHorarios() {
    const tabela = buscar('#grade-disponibilidade');
    cabecalhoGrade(tabela);
    const faixa = buscar('#faixa-horarios').value;
    const primeiro = faixa === 'todos' ? 0 : Number(faixa) * 2;
    const ultimo = faixa === 'todos' ? 48 : primeiro + 12;
    const selecionadas = new Set(rascunho.celulas.map(celula => celula.diaSemana + '/' + celula.hora));
    const linhas = [];
    for (let indice = primeiro; indice < ultimo; indice++) {
        const hora = String(Math.floor(indice / 2)).padStart(2, '0') + (indice % 2 ? ':30' : ':00');
        const linha = elemento('tr');
        const titulo = elemento('th', null, hora); titulo.scope = 'row'; linha.append(titulo);
        dias.forEach((dia, diaSemana) => {
            const celula = elemento('td');
            const chave = diaSemana + '/' + hora;
            const botao = elemento('button', 'celula-horario', selecionadas.has(chave) ? '✓' : '+');
            botao.type = 'button'; botao.dataset.slot = chave;
            botao.setAttribute('aria-label', dia + ', ' + hora);
            botao.setAttribute('aria-pressed', String(selecionadas.has(chave)));
            celula.append(botao); linha.append(celula);
        });
        linhas.push(linha);
    }
    tabela.querySelector('tbody').replaceChildren(...linhas);
    atualizarContador().catch(mensagem);
}

async function atualizarContador() {
    const resumo = await resumirDisponibilidade(rascunho.plano, rascunho.celulas);
    const horas = Math.floor(resumo.minutosPorSemana / 60);
    const minutos = resumo.minutosPorSemana % 60;
    buscar('#contador-horarios').textContent = resumo.blocosPorSemana + ' blocos por semana = ' + horas + ' h' +
        (minutos ? ' 30 min' : '') + ' · ' + resumo.blocosNoPeriodo + ' blocos no período';
}

function botaoAcao(texto, acao) {
    const botao = elemento('button', 'demonstracao-link', texto);
    botao.type = 'button'; botao.dataset.acao = acao; return botao;
}

function alternativa(valor, texto) {
    const rotulo = elemento('label', 'alternativa');
    const radio = elemento('input'); radio.type = 'radio'; radio.name = 'escolha'; radio.value = valor;
    rotulo.append(radio, elemento('span', null, texto));
    return rotulo;
}

async function conferir() {
    const alternativas = buscar('#alternativas-plano'); alternativas.replaceChildren();
    // Plano em andamento: a avaliação de plano novo não vale (o início já passou e parte do
    // tempo já foi usado). A viabilidade de verdade vem do replanejamento, depois de aplicar.
    buscar('.numeros-plano').hidden = emAndamento();
    if (emAndamento()) {
        viabilidade = null;
        mostrarEtapa('conferir');
        buscar('#aviso-substituicao').hidden = true;
        buscar('#situacao-plano').textContent = 'Seu plano já começou. Ao aplicar, ele é refeito de hoje em diante com as respostas e os horários novos. Os passos dados continuam no seu percurso.';
        return;
    }
    viabilidade = await avaliarRascunho(rascunho, hoje);
    mostrarEtapa('conferir');
    buscar('#numero-total').textContent = viabilidade.blocosNoPeriodo;
    buscar('#numero-estudo').textContent = viabilidade.capacidadeEstudo;
    buscar('#numero-demanda').textContent = viabilidade.demandaTotal;
    buscar('#aviso-substituicao').hidden = !cronograma;
    const nomes = ids => rascunho.topicos.filter(topico => ids.includes(topico.id)).map(topico => topico.nome).join(', ');
    if (viabilidade.viavel) {
        buscar('#situacao-plano').textContent = 'Cabe no seu tempo. O algoritmo distribui os estudos conforme suas respostas e reserva espaço para revisões.';
    } else {
        buscar('#situacao-plano').textContent = viabilidade.bloqueante
            ? 'São ' + rascunho.topicos.length + ' matérias e só ' + viabilidade.capacidadeEstudo + ' blocos de estudo. Ajuste o plano para incluir todas.'
            : 'Faltam ' + viabilidade.deficit + ' blocos. Seu tempo cobre ' + viabilidade.cobertura.percentual + '% do que as matérias pedem.';
        const saidas = viabilidade.escapatorias;
        if (saidas.maisTempo.minutosPorDia !== null) alternativas.append(elemento('p', 'demonstracao-nota', 'Uma opção: marque mais ' + Math.ceil(saidas.maisTempo.minutosPorDia / 30) + ' horário(s) em cada dia em que já estuda.'));
        alternativas.append(botaoAcao('Ajustar meus horários', 'ajustar-horarios'));
        if (saidas.maisTempo.novoFim && diferencaEmDias(rascunho.plano.inicio, saidas.maisTempo.novoFim) < 366) {
            alternativas.append(botaoAcao('Estender o período até ' + formatarData(saidas.maisTempo.novoFim), 'estender'));
        }
        if (saidas.removerTopicos.removidos.length && saidas.removerTopicos.removidos.length < rascunho.topicos.length) {
            alternativas.append(botaoAcao('Retirar do plano: ' + nomes(saidas.removerTopicos.removidos), 'retirar-sugeridas'));
        }
        if (!viabilidade.bloqueante) {
            alternativas.append(alternativa('PARCIAL', 'Montar assim mesmo, com cobertura parcial de ' + viabilidade.cobertura.percentual + '%.'));
            if (saidas.reduzirDemanda.suficiente) {
                const detalhes = saidas.reduzirDemanda.topicos.filter(topico => topico.antes !== topico.depois)
                    .map(topico => nomes([topico.id]) + ': ' + topico.antes + ' → ' + topico.depois + ' blocos').join('; ');
                alternativas.append(alternativa('REDUZIR_DEMANDA', 'Reduzir passagens. ' + detalhes + '.'));
            }
        }
        if (viabilidade.retaFinal && !viabilidade.retaFinal.bloqueante) {
            alternativas.append(alternativa('COBERTURA', 'Ativar reta final: todos os ' + viabilidade.retaFinal.capacidadeEstudo +
                ' horários da janela viram estudo, com revezamento entre matérias. Cobertura de ' + viabilidade.retaFinal.cobertura.percentual + '%. As revisões voltam depois da data-alvo.'));
        }
    }
}

async function avancar() {
    if (etapa === 'materias') {
        if (buscar('#nova-materia').value.trim()) {
            await adicionarMateria();
            if (buscar('#nova-materia').value.trim()) return;
        }
        if (!rascunho.topicos.length) throw new Error('Adicione pelo menos uma matéria para continuar.');
        materiaAtual = 0;
        mostrarEtapa('perfil');
    } else if (etapa === 'perfil') {
        coletarPerfil();
        if (!buscar('#cadastro').reportValidity()) return;
        await salvar();
        if (materiaAtual < rascunho.topicos.length - 1) { materiaAtual++; mostrarEtapa('perfil'); }
        else mostrarEtapa('periodo');
    } else if (etapa === 'periodo') {
        coletarPeriodo();
        if (!buscar('#cadastro').reportValidity()) return;
        if (!emAndamento() && rascunho.plano.inicio < hoje) throw new Error('Escolha uma data de início a partir de hoje.');
        await resumirDisponibilidade(rascunho.plano, rascunho.celulas);
        await salvar(); mostrarEtapa('horarios');
    } else if (etapa === 'horarios') {
        await salvar(); await conferir();
    } else if (emAndamento()) {
        // Plano em andamento: as alterações são aplicadas sobre ele, sem perder o histórico.
        await atualizarCadastro(rascunho, hoje);
        await mostrarPlanoSalvo(hoje, 'Alterações aplicadas. O plano foi refeito de hoje em diante.');
    } else {
        const selecionada = buscar('input[name="escolha"]:checked');
        const resultado = await gerarPlanoLocal(rascunho, hoje, selecionada ? { tipo: selecionada.value } : null);
        if (resultado.bloqueado) throw new Error(viabilidade.bloqueante
            ? 'Ajuste os horários ou as matérias, ou escolha a reta final quando disponível.'
            : 'Escolha uma alternativa acima para continuar com o plano.');
        await mostrarPlanoSalvo(resultado.plano.inicio, 'Seu cronograma foi calculado e salvo.');
    }
}

// Recebe a data da semana a mostrar e o aviso para leitores de tela; lê o plano gravado e
// abre o percurso nessa semana.
// Ex.: mostrarPlanoSalvo('2026-11-30', 'Seu cronograma foi calculado e salvo.').
async function mostrarPlanoSalvo(referencia, aviso) {
    inicioSemana = somarDias(referencia, -diaDaSemana(referencia));
    // carregarHoje lê o dia e o plano gravados e redesenha as duas abas.
    await carregarHoje();
    atualizarTravaInicio();
    buscar('#aba-hoje').disabled = false;
    buscar('#aba-percurso').disabled = false;
    buscar('#estado-salvamento').textContent = 'Plano salvo neste navegador';
    selecionarAba('percurso');
    buscar('#exemplo-percurso h2').focus();
    buscar('#anuncio').textContent = aviso;
}

async function voltar() {
    if (etapa === 'perfil') {
        coletarPerfil(); await salvar();
        if (materiaAtual > 0) { materiaAtual--; mostrarEtapa('perfil'); }
        else mostrarEtapa('materias');
    } else {
        if (etapa === 'periodo') { coletarPeriodo(); await salvar(); materiaAtual = rascunho.topicos.length - 1; }
        mostrarEtapa(nomesEtapas[nomesEtapas.indexOf(etapa) - 1]);
    }
}

// Como cada status aparece no percurso (docs/front.md §3.6). O texto garante que o estado não
// dependa só da cor; o CSS atenua e risca o pulado e o perdido, sem vermelho.
const ESTADOS = {
    PENDENTE: '○ Pendente',
    CONCLUIDO: '✓ Passo dado',
    PULADO: '↷ Pulado',
    PERDIDO: '– Não feito',
};

// Recebe um bloco de estudo ou revisão e a cor da matéria; devolve o cartão dele no percurso.
// Ex.: bloco CONCLUIDO de Matemática → cartão com "✓ Passo dado" e o motivo em "Por que agora?".
// É um cartão sem ação: "Feito" e "Pular" ficam na aba "Seu passo de hoje".
function cartaoDoBloco(bloco, cor) {
    const cartao = elemento('div', 'demonstracao-estudo estado-' + bloco.status.toLowerCase());
    cartao.id = 'bloco-' + bloco.id; cartao.dataset.cor = cor;
    const tipo = elemento('span', 'demonstracao-estudo-assunto', bloco.tipo === 'REVISAO' ? 'Revisão' : 'Estudo');
    if (bloco.extra) tipo.append(' ', elemento('span', 'etiqueta-bloco', 'extra'));
    const motivo = elemento('span', 'motivo-estudo');
    motivo.append(elemento('strong', null, 'Por que agora? '), bloco.motivo);
    cartao.append(elemento('span', 'demonstracao-estudo-hora', bloco.hora + ' · 30 min'),
        elemento('strong', 'demonstracao-estudo-materia', bloco.topicoNome),
        tipo, motivo,
        elemento('span', 'demonstracao-estudo-estado', ESTADOS[bloco.status]));
    return cartao;
}

function renderizarCronograma() {
    const tabela = buscar('#grade-cronograma');
    const datas = Array.from({ length: 7 }, (_, indice) => somarDias(inicioSemana, indice));
    cabecalhoGrade(tabela, datas);
    buscar('#titulo-semana').textContent = formatarData(datas[0]) + ' a ' + formatarData(datas[6], { day: '2-digit', month: '2-digit', year: 'numeric' });
    buscar('#semana-anterior').disabled = inicioSemana <= cronograma.plano.inicio;
    buscar('#semana-proxima').disabled = datas[6] >= cronograma.plano.fim;
    buscar('#periodo-plano').textContent = formatarData(cronograma.plano.inicio) + ' a ' + formatarData(cronograma.plano.fim) + ' · Estudos de 30 minutos.';
    // Depois do fim do plano a viabilidade vem null: não há mais o que cobrir.
    const parcial = Boolean(cronograma.viabilidade) && !cronograma.viabilidade.viavel;
    buscar('#aviso-cobertura').hidden = cronograma.cobertura !== 'ATIVA' && !parcial;
    buscar('#aviso-cobertura').textContent = cronograma.cobertura === 'ATIVA'
        ? 'Reta final ativada até ' + formatarData(cronograma.plano.dataAvaliacao || cronograma.plano.fim) + '.'
        : 'Plano com cobertura parcial: ' + cronograma.viabilidade.cobertura.percentual + '%.';
    const cores = new Map(cronograma.topicos.map((topico, indice) => [topico.id, indice % 3]));
    buscar('#legenda-materias').replaceChildren(...cronograma.topicos.map(topico => {
        const nome = elemento('span', 'legenda-materia', topico.nome); nome.dataset.cor = cores.get(topico.id); return nome;
    }));
    // Os blocos da semana por "data/hora". Uma lista, e não um bloco só, porque depois de mudar
    // os horários um bloco mantido (passo dado, pulado) pode dividir o horário com um novo.
    const daSemana = cronograma.blocos.filter(bloco => bloco.data >= datas[0] && bloco.data <= datas[6]);
    const porSlot = new Map();
    for (const bloco of daSemana) {
        const chave = bloco.data + '/' + bloco.hora;
        porSlot.set(chave, [...(porSlot.get(chave) ?? []), bloco]);
    }
    // As linhas são os horários pintados e também os dos blocos da semana, para que um passo
    // dado num horário que depois foi despintado continue aparecendo.
    const horarios = [...new Set([...cronograma.celulas.map(celula => celula.hora), ...daSemana.map(bloco => bloco.hora)])].sort();
    tabela.querySelector('tbody').replaceChildren(...horarios.map(hora => {
        const linha = elemento('tr');
        const titulo = elemento('th', null, hora); titulo.scope = 'row'; linha.append(titulo);
        datas.forEach(data => {
            const celula = elemento('td');
            const blocos = porSlot.get(data + '/' + hora) ?? [];
            // Sem bloco: "—", e não "Livre", para não confundir com a reserva ("Horário livre").
            if (!blocos.length) celula.append(elemento('span', 'demonstracao-livre', '—'));
            for (const bloco of blocos) {
                if (bloco.tipo === 'RESERVA') {
                    const reserva = elemento('div', 'bloco-reserva', 'Horário livre');
                    reserva.append(elemento('small', null, 'Reserva para revisões')); celula.append(reserva);
                } else {
                    celula.append(cartaoDoBloco(bloco, cores.get(bloco.topicoId)));
                }
            }
            if (data < hoje) celula.classList.add('dia-passado');
            linha.append(celula);
        });
        return linha;
    }));
    atualizarAviso();
}

// ----- Seu passo de hoje (docs/front.md §3.5) -----
// A tela só mostra o que a fachada devolve: os textos vêm de js/ui/textos.js e as ações chamam
// js/api.js. Concluir e pular não replanejam (§4), então o resto do dia fica como o aluno viu.

// Lê na fachada o dia (obterHoje replaneja antes, se for preciso) e o plano gravado; redesenha
// as abas de hoje e do percurso, para as duas mostrarem o mesmo estado.
// Ex.: await carregarHoje() depois de concluir o bloco 1 → ele aparece como "✓ Passo dado".
async function carregarHoje() {
    dia = await obterHoje(hoje);
    cronograma = (await obterSessao()).cronograma;
    if (!dia || !cronograma) return;
    renderizarHoje();
    renderizarCronograma();
}

// Recebe um texto; escreve na região de status da aba de hoje, que o leitor de tela anuncia.
// Ex.: anunciarHoje('Passo dado.').
function anunciarHoje(texto) {
    buscar('#status-hoje').textContent = texto;
}

// Desenha a aba de hoje inteira, na ordem pedida: O que mudou, reta final, cobertura parcial
// e a lista dos blocos.
function renderizarHoje() {
    // Título com o dia de hoje, ex.: "Quarta-feira, 25/11".
    const titulo = formatarData(hoje, { weekday: 'long', day: '2-digit', month: '2-digit' });
    buscar('#titulo-hoje').textContent = titulo.charAt(0).toUpperCase() + titulo.slice(1);
    renderizarMudancas();
    renderizarRetaFinal();
    // A mesma linha de cobertura parcial do percurso. Com a reta final ativa ela não aparece
    // (como no percurso): a viabilidade guardada é a do plano normal, e o número confundiria.
    const parcial = Boolean(dia.viabilidade) && !dia.viabilidade.viavel && dia.cobertura !== 'ATIVA';
    buscar('#aviso-cobertura-hoje').hidden = !parcial;
    if (parcial) buscar('#aviso-cobertura-hoje').textContent = 'Plano com cobertura parcial: ' + dia.viabilidade.cobertura.percentual + '%.';
    renderizarBlocosDeHoje();
}

// Faixa "O que mudou" (§3.8): uma frase por causa, ou nada. Some se o aluno fechou estas
// mesmas mudanças.
function renderizarMudancas() {
    const frases = textoMudancas(dia.mudancas);
    const fechada = JSON.stringify(dia.mudancas) === mudancasFechadas;
    buscar('#faixa-mudancas').hidden = frases.length === 0 || fechada;
    buscar('#lista-mudancas').replaceChildren(...frases.map(frase => elemento('li', null, frase)));
}

// Reta final conforme `cobertura` (§3.5): cartão com a pergunta, botão discreto, linha de aviso
// ou nada. Os números vêm prontos da fachada: C da reta final e C0 do plano normal.
function renderizarRetaFinal() {
    const area = buscar('#reta-final-hoje');
    const { dataAvaliacao, fim } = cronograma.plano;
    // A data-alvo é a da prova, se houver; senão, o fim do plano.
    const alvo = formatarData(dataAvaliacao || fim);
    if (dia.cobertura === 'PERGUNTAR') {
        const cartao = elemento('div', 'cartao-reta-final');
        cartao.append(elemento('p', null, (dataAvaliacao ? 'A prova' : 'O fim do plano') + ' é em ' + alvo +
            ' e não cabe tudo. Em vez de guardar horários para revisão, todos viram estudo e as matérias se revezam. Cobertura: ' +
            dia.retaFinal.cobertura.percentual + '% em vez de ' + dia.viabilidade.cobertura.percentual + '%.'));
        const ativar = botaoAcao('Ativar reta final', 'ativar-reta-final');
        ativar.className = 'demonstracao-botao';
        const acoes = elemento('div', 'acoes-reta-final');
        acoes.append(ativar, botaoAcao('Agora não', 'recusar-reta-final'));
        cartao.append(acoes);
        area.replaceChildren(cartao);
    } else if (dia.cobertura === 'RECUSADA') {
        // O aluno disse "Agora não": a pergunta não volta, mas ele pode mudar de ideia.
        area.replaceChildren(botaoAcao('Ativar reta final', 'ativar-reta-final'));
    } else if (dia.cobertura === 'ATIVA') {
        area.replaceChildren(elemento('p', 'linha-reta-final', 'Plano em reta final até ' + alvo + '.'));
    } else {
        area.replaceChildren();
    }
}

// Lista dos blocos de hoje e a frase de resumo (dia sem estudo, ou passos de hoje dados).
function renderizarBlocosDeHoje() {
    // Ordem de horário. No mesmo horário (um bloco mantido e um novo), a ordem do dia desempata.
    const blocos = [...dia.blocos].sort((a, b) => a.hora.localeCompare(b.hora) || a.ordem - b.ordem);
    const estudos = blocos.filter(bloco => bloco.tipo !== 'RESERVA');
    // O próximo passo é o primeiro estudo ou revisão ainda pendente.
    const proximo = estudos.find(bloco => bloco.status === 'PENDENTE');
    const cores = new Map(cronograma.topicos.map((topico, indice) => [topico.id, indice % 3]));

    const resumo = [];
    if (!estudos.length) {
        resumo.push('Hoje não tem estudo marcado.');
        // O próximo estudo sai dos blocos do percurso, que a sessão já trouxe.
        const seguinte = cronograma.blocos
            .filter(bloco => bloco.data > hoje && bloco.tipo !== 'RESERVA' && bloco.status === 'PENDENTE')
            .sort((a, b) => a.data.localeCompare(b.data) || a.hora.localeCompare(b.hora))[0];
        if (seguinte) resumo.push(textoProximoEstudo(seguinte));
    } else if (!proximo) {
        resumo.push('Os passos de hoje estão dados.');
    }
    buscar('#resumo-hoje').replaceChildren(...resumo.map(texto => elemento('p', 'resumo-hoje', texto)));

    buscar('#lista-hoje').hidden = blocos.length === 0;
    buscar('#lista-hoje').replaceChildren(...blocos.map(bloco => bloco.tipo === 'RESERVA'
        ? itemDeFolga(bloco)
        : itemDeEstudo(bloco, cores.get(bloco.topicoId), bloco === proximo)));
}

// Recebe um bloco de estudo ou revisão de hoje, a cor da matéria e se ele é o próximo passo;
// devolve o item da lista, com "Feito" e "Pular" se ainda estiver pendente.
// Ex.: bloco 1 de Matemática, pendente e próximo → item em destaque com a etiqueta "Próximo passo".
function itemDeEstudo(bloco, cor, ehProximo) {
    const item = elemento('li', 'item-hoje estado-' + bloco.status.toLowerCase());
    if (ehProximo) item.classList.add('item-proximo');
    item.dataset.cor = cor;
    const cabeca = elemento('div', 'item-hoje-cabeca');
    cabeca.append(elemento('span', 'demonstracao-estudo-hora', bloco.hora + ' · ' + bloco.duracaoMin + ' min'));
    // O destaque não depende só da cor: a etiqueta diz em texto qual é o próximo.
    if (ehProximo) cabeca.append(elemento('span', 'etiqueta-bloco', 'Próximo passo'));
    const motivo = elemento('p', 'motivo-estudo');
    motivo.append(elemento('strong', null, 'Por que agora? '), bloco.motivo);
    item.append(cabeca,
        elemento('strong', 'demonstracao-estudo-materia', bloco.topicoNome),
        elemento('span', 'demonstracao-estudo-assunto', rotuloDoTipo(bloco)),
        motivo,
        elemento('span', 'demonstracao-estudo-estado', ESTADOS[bloco.status]));
    if (bloco.status === 'PENDENTE') {
        const descricao = bloco.topicoNome + ', ' + bloco.hora;
        const feito = elemento('button', 'demonstracao-botao', 'Feito');
        feito.type = 'button'; feito.dataset.acao = 'feito'; feito.dataset.id = bloco.id;
        feito.setAttribute('aria-label', 'Feito: ' + descricao);
        const pular = botaoAcao('Pular', 'pular');
        pular.dataset.id = bloco.id;
        pular.setAttribute('aria-label', 'Pular: ' + descricao);
        const acoes = elemento('div', 'acoes-hoje');
        acoes.append(feito, pular);
        item.append(acoes);
    }
    return item;
}

// Recebe uma reserva livre; devolve o item como folga, sem botões (§3.5: nunca como tarefa).
// Ex.: reserva das 20:00 → "20:00 · 30 min", "Horário livre".
function itemDeFolga(bloco) {
    const item = elemento('li', 'item-hoje item-folga');
    item.append(elemento('span', 'demonstracao-estudo-hora', bloco.hora + ' · ' + bloco.duracaoMin + ' min'),
        elemento('strong', null, rotuloDoTipo(bloco)),
        elemento('span', 'motivo-estudo', 'Nada marcado neste horário. É uma folga.'));
    return item;
}

// Recebe o id do bloco em que o aluno tocou "Feito" e o próprio botão; abre o "Como foi?".
// Ex.: abrirComoFoi(1, botao) → dialog com "Matemática · Estudo · 19:00" e foco no primeiro botão.
// Esc fecha o dialog sozinho (comportamento do <dialog>) e equivale a Cancelar.
function abrirComoFoi(blocoId, botaoFeito) {
    const bloco = dia.blocos.find(item => item.id === blocoId);
    const dialogo = buscar('#dialogo-como-foi');
    dialogo.dataset.blocoId = blocoId;
    origemDoDialogo = botaoFeito;
    buscar('#bloco-como-foi').textContent = bloco.topicoNome + ' · ' + rotuloDoTipo(bloco) + ' · ' + bloco.hora;
    dialogo.showModal();
    dialogo.querySelector('[data-resposta]').focus();
}

// Recebe a resposta escolhida no "Como foi?"; conclui o bloco, fecha o dialog e redesenha.
// Ex.: responderComoFoi('EXPLIQUEI_SEM_CONSULTAR') → status "Passo dado. Próxima revisão de Matemática a partir de qua 02/12."
async function responderComoFoi(resposta) {
    const dialogo = buscar('#dialogo-como-foi');
    const blocoId = Number(dialogo.dataset.blocoId);
    const bloco = dia.blocos.find(item => item.id === blocoId);
    anunciarHoje('');
    let resultado;
    // `finally` fecha o dialog mesmo se a fachada recusar, para a mensagem de erro aparecer na
    // página e não ficar escondida atrás dele.
    try { resultado = await concluirBloco(blocoId, resposta, hoje); }
    finally { dialogo.close(); }
    await carregarHoje();
    anunciarHoje(textoPassoDado(bloco.topicoNome, resultado.proximaRevisao));
    focarDepoisDaAcao();
}

// Recebe o id de um bloco de hoje; marca como pulado, sem pedir confirmação nem justificativa.
// Ex.: await pular(2) → bloco 2 com "↷ Pulado" e o aviso de que ele volta para o plano.
async function pular(blocoId) {
    anunciarHoje('');
    await pularBloco(blocoId, hoje);
    await carregarHoje();
    anunciarHoje('Tudo bem. Esse estudo volta para o plano nos próximos dias.');
    focarDepoisDaAcao();
}

// Recebe a resposta ao cartão da reta final (true = ativar); a fachada replaneja e a tela
// redesenha com o dia novo.
// Ex.: await responderRetaFinal(true) → linha "Plano em reta final até 13/12." e faixa "Reta final ativada."
async function responderRetaFinal(aceitar) {
    anunciarHoje('');
    await responderCobertura(aceitar, hoje);
    await carregarHoje();
    anunciarHoje(aceitar ? 'O plano foi refeito de hoje em diante.' : 'O plano continua como está.');
    buscar('#titulo-hoje').focus();
}

// Depois de concluir ou pular, o botão tocado some da lista. O foco vai para o "Feito" do
// próximo passo, ou para o título se não houver mais nada pendente, para não se perder.
function focarDepoisDaAcao() {
    const proximoFeito = buscar('#lista-hoje .item-proximo [data-acao="feito"]');
    (proximoFeito ?? buscar('#titulo-hoje')).focus();
}

buscar('#cadastro').addEventListener('submit', evento => { evento.preventDefault(); executar(avancar); });
buscar('#nova-materia').addEventListener('input', evento => evento.target.setCustomValidity(''));
buscar('#nova-materia').addEventListener('keydown', evento => {
    if (evento.key === 'Enter') { evento.preventDefault(); executar(adicionarMateria); }
});
buscar('#cadastro').addEventListener('change', evento => {
    if (evento.target.id === 'faixa-horarios') { renderizarHorarios(); return; }
    if (etapa === 'perfil') coletarPerfil();
    if (etapa === 'periodo') { atualizarProva(); coletarPeriodo(); }
    // A gravação é enfileirada na fachada; o clique seguinte deve continuar funcionando.
    salvar().catch(mensagem);
});
buscar('#plataforma').addEventListener('click', evento => {
    const botao = evento.target.closest('button');
    if (!botao || botao.disabled || botao.type === 'submit') return;
    executar(async () => {
        if (botao.getAttribute('role') === 'tab') {
            // O nome da aba vem do id: 'aba-hoje' → 'hoje'.
            await abrirAba(botao.id.replace('aba-', '')); return;
        }
        // Os três botões do "Como foi?" trazem a resposta em data-resposta.
        if (botao.dataset.resposta) { await responderComoFoi(botao.dataset.resposta); return; }
        if (botao.dataset.slot) {
            const [dia, hora] = botao.dataset.slot.split('/');
            const indice = rascunho.celulas.findIndex(celula => celula.diaSemana === Number(dia) && celula.hora === hora);
            if (indice >= 0) rascunho.celulas.splice(indice, 1);
            else rascunho.celulas.push({ diaSemana: Number(dia), hora });
            botao.setAttribute('aria-pressed', String(indice < 0)); botao.textContent = indice < 0 ? '✓' : '+';
            await atualizarContador(); await salvar(); return;
        }
        if (botao.id === 'semana-anterior' || botao.id === 'semana-proxima') {
            inicioSemana = somarDias(inicioSemana, botao.id === 'semana-anterior' ? -7 : 7); renderizarCronograma(); return;
        }
        const acao = botao.dataset.acao;
        if (acao === 'adicionar') await adicionarMateria();
        if (acao === 'voltar') await voltar();
        if (acao === 'editar') mostrarEtapa('materias');
        if (acao === 'responder') { materiaAtual = rascunho.topicos.findIndex(topico => topico.id === botao.dataset.id); mostrarEtapa('perfil'); }
        if (acao === 'remover') { rascunho.topicos = rascunho.topicos.filter(topico => topico.id !== botao.dataset.id); await salvar(); renderizarMaterias(); buscar('#nova-materia').focus(); }
        if (acao === 'feito') abrirComoFoi(Number(botao.dataset.id), botao);
        if (acao === 'cancelar-feito') buscar('#dialogo-como-foi').close();
        if (acao === 'pular') await pular(Number(botao.dataset.id));
        if (acao === 'fechar-mudancas') {
            mudancasFechadas = JSON.stringify(dia.mudancas); renderizarMudancas();
            // O botão Fechar sumiu com a faixa; o foco vai para o título da aba.
            buscar('#titulo-hoje').focus();
        }
        if (acao === 'ativar-reta-final') await responderRetaFinal(true);
        if (acao === 'recusar-reta-final') await responderRetaFinal(false);
        if (acao === 'ajustar-horarios') mostrarEtapa('horarios');
        if (acao === 'estender') { rascunho.plano.fim = viabilidade.escapatorias.maisTempo.novoFim; buscar('#fim').value = rascunho.plano.fim; await salvar(); await conferir(); }
        if (acao === 'retirar-sugeridas') {
            const removidas = viabilidade.escapatorias.removerTopicos.removidos;
            rascunho.topicos = rascunho.topicos.filter(topico => !removidas.includes(topico.id)); await salvar(); await conferir();
        }
    });
});
// Ao fechar o "Como foi?" (Cancelar ou Esc), o foco volta ao "Feito" que o abriu. Só quando o
// foco ficou solto na página: depois de responder ou de um erro, quem decide o foco é a ação.
buscar('#dialogo-como-foi').addEventListener('close', () => {
    const solto = !document.activeElement || document.activeElement === document.body;
    if (solto && origemDoDialogo?.isConnected) origemDoDialogo.focus();
    origemDoDialogo = null;
});
buscar('[role="tablist"]').addEventListener('keydown', evento => {
    const abas = [...document.querySelectorAll('[role="tab"]:not(:disabled)')];
    const indice = abas.indexOf(evento.target);
    if (indice < 0) return;
    const destinos = { ArrowRight: (indice + 1) % abas.length, ArrowLeft: (indice - 1 + abas.length) % abas.length, Home: 0, End: abas.length - 1 };
    if (!(evento.key in destinos)) return;
    evento.preventDefault();
    const nome = abas[destinos[evento.key]].id.replace('aba-', '');
    // O foco muda na hora; a busca do dia na fachada vem em seguida.
    selecionarAba(nome, true);
    if (nome === 'hoje') executar(carregarHoje);
});

// Modo de demonstração: avisa no topo qual é o "hoje" simulado, com um link para sair (a mesma
// página sem ?hoje), e faz os links para as outras páginas levarem o ?hoje junto.
// Ex.: plataforma.html?hoje=2026-12-02 → "Modo demonstração: hoje é qua 02/12."
function mostrarModoDemonstracao() {
    if (!simulado) return;
    buscar('#texto-demonstracao').textContent = 'Modo demonstração: hoje é ' + dataCurta(hoje) + '.';
    buscar('#faixa-demonstracao').hidden = false;
    manterHojeNosLinks(location.search);
}

mostrarModoDemonstracao();
executar(async () => {
    // Antes de desenhar, a fachada replaneja o plano se ele é de outro dia (§4).
    dia = await obterHoje(hoje);
    const sessao = await obterSessao();
    rascunho = sessao.rascunho ?? { plano: { inicio: hoje, fim: somarDias(hoje, 13), dataAvaliacao: null, nomeAvaliacao: '' }, topicos: [], celulas: [] };
    cronograma = sessao.cronograma;
    proximoId = calcularProximoId();
    buscar('#inicio').value = rascunho.plano.inicio; buscar('#inicio').min = hoje;
    buscar('#fim').value = rascunho.plano.fim;
    buscar('#tem-prova').checked = Boolean(rascunho.plano.dataAvaliacao);
    buscar('#nome-prova').value = rascunho.plano.nomeAvaliacao ?? '';
    buscar('#data-prova').value = rascunho.plano.dataAvaliacao ?? '';
    atualizarTravaInicio();
    buscar('#aba-materias').disabled = false;
    buscar('#aba-hoje').disabled = !cronograma;
    buscar('#aba-percurso').disabled = !cronograma;
    buscar('#continuar').disabled = false;
    buscar('[data-acao="voltar"]').disabled = false;
    mostrarEtapa('materias', false);
    if (cronograma) {
        const referencia = hoje < cronograma.plano.inicio ? cronograma.plano.inicio : hoje > cronograma.plano.fim ? cronograma.plano.fim : hoje;
        inicioSemana = somarDias(referencia, -diaDaSemana(referencia));
        // Com plano, a plataforma abre em "Seu passo de hoje" (§2); sem plano, no cadastro.
        renderizarCronograma(); renderizarHoje(); selecionarAba('hoje');
    }
    buscar('#estado-salvamento').textContent = 'Salvo neste navegador';
}).then(() => {
    if (!rascunho) buscar('#estado-salvamento').textContent = 'Dados indisponíveis — recarregue para tentar novamente';
});
