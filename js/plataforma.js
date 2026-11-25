import { obterSessao, salvarRascunho, resumirDisponibilidade, avaliarRascunho, gerarPlanoLocal, marcarEstudo } from './api.js';
import { hojeLocal, somarDias, diaDaSemana, diferencaEmDias } from './util/datas.js';

const hoje = hojeLocal(new Date());
const buscar = seletor => document.querySelector(seletor);
const dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const nomesEtapas = ['materias', 'perfil', 'periodo', 'horarios', 'conferir'];
let rascunho;
let cronograma = null;
let marcacoes = new Set();
let etapa = 'materias';
let materiaAtual = 0;
let inicioSemana;
let viabilidade;
let ocupado = false;
let proximoId = 1;

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

function atualizarAviso() {
    buscar('#aviso-rascunho').hidden = !cronograma || JSON.stringify(rascunho) === JSON.stringify(cronograma.cadastro);
}

function selecionarAba(nome, foco = false) {
    if (nome === 'percurso' && !cronograma) return;
    for (const aba of document.querySelectorAll('[role="tab"]')) {
        const ativa = aba.id === 'aba-' + nome;
        aba.setAttribute('aria-selected', String(ativa));
        aba.tabIndex = ativa ? 0 : -1;
    }
    buscar('#exemplo-materias').hidden = nome !== 'materias';
    buscar('#exemplo-percurso').hidden = nome !== 'percurso';
    if (foco) buscar('#aba-' + nome).focus();
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
        : nome === 'conferir' ? 'Montar meu plano →' : 'Continuar →';
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
    buscar('#fim').min = buscar('#inicio').value;
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
    viabilidade = await avaliarRascunho(rascunho, hoje);
    mostrarEtapa('conferir');
    buscar('#numero-total').textContent = viabilidade.blocosNoPeriodo;
    buscar('#numero-estudo').textContent = viabilidade.capacidadeEstudo;
    buscar('#numero-demanda').textContent = viabilidade.demandaTotal;
    buscar('#aviso-substituicao').hidden = !cronograma;
    const alternativas = buscar('#alternativas-plano'); alternativas.replaceChildren();
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
        if (rascunho.plano.inicio < hoje) throw new Error('Escolha uma data de início a partir de hoje.');
        await resumirDisponibilidade(rascunho.plano, rascunho.celulas);
        await salvar(); mostrarEtapa('horarios');
    } else if (etapa === 'horarios') {
        await salvar(); await conferir();
    } else {
        const selecionada = buscar('input[name="escolha"]:checked');
        const resultado = await gerarPlanoLocal(rascunho, hoje, selecionada ? { tipo: selecionada.value } : null);
        if (resultado.bloqueado) throw new Error(viabilidade.bloqueante
            ? 'Ajuste os horários ou as matérias, ou escolha a reta final quando disponível.'
            : 'Escolha uma alternativa acima para continuar com o plano.');
        const sessao = await obterSessao();
        cronograma = sessao.cronograma; marcacoes = new Set(sessao.marcacoes);
        inicioSemana = somarDias(cronograma.plano.inicio, -diaDaSemana(cronograma.plano.inicio));
        buscar('#aba-percurso').disabled = false;
        buscar('#estado-salvamento').textContent = 'Plano salvo neste navegador';
        renderizarCronograma(); selecionarAba('percurso');
        buscar('#exemplo-percurso h2').focus();
        buscar('#anuncio').textContent = 'Seu cronograma foi calculado e salvo.';
    }
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

function renderizarCronograma() {
    const tabela = buscar('#grade-cronograma');
    const datas = Array.from({ length: 7 }, (_, indice) => somarDias(inicioSemana, indice));
    cabecalhoGrade(tabela, datas);
    buscar('#titulo-semana').textContent = formatarData(datas[0]) + ' a ' + formatarData(datas[6], { day: '2-digit', month: '2-digit', year: 'numeric' });
    buscar('#semana-anterior').disabled = inicioSemana <= cronograma.plano.inicio;
    buscar('#semana-proxima').disabled = datas[6] >= cronograma.plano.fim;
    buscar('#periodo-plano').textContent = formatarData(cronograma.plano.inicio) + ' a ' + formatarData(cronograma.plano.fim) + ' · Estudos de 30 minutos.';
    buscar('#aviso-cobertura').hidden = cronograma.cobertura !== 'ATIVA' && cronograma.viabilidade.viavel;
    buscar('#aviso-cobertura').textContent = cronograma.cobertura === 'ATIVA'
        ? 'Reta final ativada até ' + formatarData(cronograma.plano.dataAvaliacao || cronograma.plano.fim) + '.'
        : 'Plano com cobertura parcial: ' + cronograma.viabilidade.cobertura.percentual + '%.';
    const cores = new Map(cronograma.topicos.map((topico, indice) => [topico.id, indice % 3]));
    buscar('#legenda-materias').replaceChildren(...cronograma.topicos.map(topico => {
        const nome = elemento('span', 'legenda-materia', topico.nome); nome.dataset.cor = cores.get(topico.id); return nome;
    }));
    const porSlot = new Map(cronograma.blocos.map(bloco => [bloco.data + '/' + bloco.hora, bloco]));
    const horarios = [...new Set(cronograma.celulas.map(celula => celula.hora))].sort();
    tabela.querySelector('tbody').replaceChildren(...horarios.map(hora => {
        const linha = elemento('tr');
        const titulo = elemento('th', null, hora); titulo.scope = 'row'; linha.append(titulo);
        datas.forEach(data => {
            const celula = elemento('td');
            const bloco = porSlot.get(data + '/' + hora);
            if (!bloco) celula.append(elemento('span', 'demonstracao-livre', data < cronograma.plano.inicio || data > cronograma.plano.fim ? '—' : 'Livre'));
            else if (bloco.tipo === 'RESERVA') {
                const reserva = elemento('div', 'bloco-reserva', 'Horário livre');
                reserva.append(elemento('small', null, 'Reserva para revisões')); celula.append(reserva);
            } else {
                const botao = elemento('button', 'demonstracao-estudo');
                botao.type = 'button'; botao.id = 'bloco-' + bloco.id; botao.dataset.bloco = bloco.id; botao.dataset.cor = cores.get(bloco.topicoId);
                botao.setAttribute('aria-pressed', String(marcacoes.has(bloco.id)));
                botao.setAttribute('aria-label', bloco.topicoNome + ', ' + formatarData(data) + ', ' + hora + '. ' + bloco.motivo);
                botao.append(elemento('span', 'demonstracao-estudo-hora', hora + ' · 30 min'),
                    elemento('strong', 'demonstracao-estudo-materia', bloco.topicoNome),
                    elemento('span', 'demonstracao-estudo-assunto', (bloco.tipo === 'REVISAO' ? 'Revisão' : 'Estudo') + (bloco.extra ? ' extra' : '')),
                    elemento('span', 'motivo-estudo', bloco.motivo),
                    elemento('span', 'demonstracao-estudo-estado', marcacoes.has(bloco.id) ? '✓ Passo dado' : '○ Pendente'));
                celula.append(botao);
            }
            if (data < hoje) celula.classList.add('dia-passado');
            linha.append(celula);
        });
        return linha;
    }));
    atualizarAviso();
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
            selecionarAba(botao.id === 'aba-percurso' ? 'percurso' : 'materias'); return;
        }
        if (botao.dataset.slot) {
            const [dia, hora] = botao.dataset.slot.split('/');
            const indice = rascunho.celulas.findIndex(celula => celula.diaSemana === Number(dia) && celula.hora === hora);
            if (indice >= 0) rascunho.celulas.splice(indice, 1);
            else rascunho.celulas.push({ diaSemana: Number(dia), hora });
            botao.setAttribute('aria-pressed', String(indice < 0)); botao.textContent = indice < 0 ? '✓' : '+';
            await atualizarContador(); await salvar(); return;
        }
        if (botao.dataset.bloco) {
            const sessao = await marcarEstudo(botao.dataset.bloco, !marcacoes.has(botao.dataset.bloco));
            marcacoes = new Set(sessao.marcacoes);
            renderizarCronograma(); document.getElementById(botao.id)?.focus();
            buscar('#anuncio').textContent = marcacoes.has(botao.dataset.bloco) ? 'Passo dado. Marcação salva.' : 'Estudo pendente. Marcação salva.'; return;
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
        if (acao === 'ajustar-horarios') mostrarEtapa('horarios');
        if (acao === 'estender') { rascunho.plano.fim = viabilidade.escapatorias.maisTempo.novoFim; buscar('#fim').value = rascunho.plano.fim; await salvar(); await conferir(); }
        if (acao === 'retirar-sugeridas') {
            const removidas = viabilidade.escapatorias.removerTopicos.removidos;
            rascunho.topicos = rascunho.topicos.filter(topico => !removidas.includes(topico.id)); await salvar(); await conferir();
        }
    });
});
buscar('[role="tablist"]').addEventListener('keydown', evento => {
    const abas = [...document.querySelectorAll('[role="tab"]:not(:disabled)')];
    const indice = abas.indexOf(evento.target);
    if (indice < 0) return;
    const destinos = { ArrowRight: (indice + 1) % abas.length, ArrowLeft: (indice - 1 + abas.length) % abas.length, Home: 0, End: abas.length - 1 };
    if (!(evento.key in destinos)) return;
    evento.preventDefault(); const aba = abas[destinos[evento.key]];
    selecionarAba(aba.id === 'aba-percurso' ? 'percurso' : 'materias', true);
});

executar(async () => {
    const sessao = await obterSessao();
    rascunho = sessao.rascunho ?? { plano: { inicio: hoje, fim: somarDias(hoje, 13), dataAvaliacao: null, nomeAvaliacao: '' }, topicos: [], celulas: [] };
    cronograma = sessao.cronograma; marcacoes = new Set(sessao.marcacoes);
    const numeros = rascunho.topicos.map(topico => Number(topico.id.replace('materia-', ''))).filter(Number.isFinite);
    proximoId = Math.max(0, ...numeros) + 1;
    buscar('#inicio').value = rascunho.plano.inicio; buscar('#inicio').min = hoje;
    buscar('#fim').value = rascunho.plano.fim;
    buscar('#tem-prova').checked = Boolean(rascunho.plano.dataAvaliacao);
    buscar('#nome-prova').value = rascunho.plano.nomeAvaliacao ?? '';
    buscar('#data-prova').value = rascunho.plano.dataAvaliacao ?? '';
    atualizarProva();
    buscar('#aba-materias').disabled = false;
    buscar('#aba-percurso').disabled = !cronograma;
    buscar('#continuar').disabled = false;
    buscar('[data-acao="voltar"]').disabled = false;
    mostrarEtapa('materias', false);
    if (cronograma) {
        const referencia = hoje < cronograma.plano.inicio ? cronograma.plano.inicio : hoje > cronograma.plano.fim ? cronograma.plano.fim : hoje;
        inicioSemana = somarDias(referencia, -diaDaSemana(referencia));
        renderizarCronograma(); selecionarAba('percurso');
    }
    buscar('#estado-salvamento').textContent = 'Salvo neste navegador';
}).then(() => {
    if (!rascunho) buscar('#estado-salvamento').textContent = 'Dados indisponíveis — recarregue para tentar novamente';
});
