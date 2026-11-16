const demonstracao = document.querySelector("#demonstracao");

if (demonstracao) iniciarDemonstracao(demonstracao);

function iniciarDemonstracao(painel) {
    const buscar = seletor => painel.querySelector(seletor);
    const abas = [...painel.querySelectorAll('[role="tab"]')];
    const secoes = [...painel.querySelectorAll('[role="tabpanel"]')];
    const estudos = [...painel.querySelectorAll(".demonstracao-estudo")];
    const materias = [...painel.querySelectorAll(".demonstracao-materia")];
    const formulario = buscar("#demonstracao-formulario");
    const resultado = buscar("#demonstracao-resultado");
    const anuncio = buscar("#demonstracao-status");
    let materiaAtual = 0;
    let editandoResposta = false;

    function selecionarAba(nome, moverFoco = false) {
        const selecionada = abas.find(aba => aba.dataset.aba === nome);
        if (!selecionada) return;
        abas.forEach(aba => {
            const ativa = aba === selecionada;
            aba.setAttribute("aria-selected", String(ativa));
            aba.tabIndex = ativa ? 0 : -1;
        });
        secoes.forEach(secao => {
            secao.hidden = secao.id !== selecionada.getAttribute("aria-controls");
        });
        if (moverFoco) selecionada.focus();
    }

    function marcarEstudo(botao, concluido) {
        botao.setAttribute("aria-pressed", String(concluido));
        const icone = document.createElement("span");
        icone.setAttribute("aria-hidden", "true");
        icone.textContent = concluido ? "✓" : "○";
        botao.querySelector(".demonstracao-estudo-estado").replaceChildren(
            icone, concluido ? " Passo dado" : " Pendente"
        );
    }

    function mostrarMateria(indice, moverFoco = false) {
        materiaAtual = indice;
        formulario.hidden = false;
        resultado.hidden = true;
        materias.forEach((materia, posicao) => {
            materia.hidden = posicao !== indice;
            // Campos ocultos não devem impedir a validação nativa da etapa visível.
            materia.disabled = posicao !== indice;
        });
        const titulo = materias[indice].querySelector("legend");
        buscar("#demonstracao-etapa").textContent = `Matéria ${indice + 1} de ${materias.length} · ${titulo.textContent}`;
        buscar("#demonstracao-progresso").value = indice + 1;
        buscar('[data-acao="materia-anterior"]').hidden = indice === 0;
        buscar("#demonstracao-continuar").textContent = editandoResposta
            ? "Atualizar minhas respostas"
            : indice === materias.length - 1 ? "Ver minhas respostas" : "Próxima matéria";
        if (moverFoco) titulo.focus();
    }

    function lerResposta(campo) {
        return {
            valor: campo.value === "nao-sei" ? 3 : Number(campo.value),
            texto: campo.selectedOptions[0].textContent
        };
    }

    function mostrarRespostas() {
        const itens = materias.map(materia => {
            const nome = materia.querySelector("legend").textContent;
            const dominio = lerResposta(materia.querySelector('[name^="dominio-"]'));
            const peso = lerResposta(materia.querySelector('[name^="peso-"]'));
            const item = document.createElement("li");
            const titulo = document.createElement("strong");
            const textoDominio = document.createElement("p");
            const textoPeso = document.createElement("p");
            const editar = document.createElement("button");
            titulo.textContent = nome;
            textoDominio.textContent = `Domínio: ${dominio.texto}`;
            textoPeso.textContent = `Peso no objetivo: ${peso.texto}`;
            editar.type = "button";
            editar.className = "demonstracao-link";
            editar.dataset.acao = "editar-materia";
            editar.dataset.materia = materia.dataset.materia;
            editar.textContent = `Editar ${nome}`;
            item.dataset.materia = materia.dataset.materia;
            item.append(titulo, textoDominio, textoPeso, editar);
            return item;
        });
        buscar("#demonstracao-respostas").replaceChildren(...itens);
        formulario.hidden = true;
        resultado.hidden = false;
        editandoResposta = false;
        buscar("#demonstracao-resultado-titulo").focus();
        anuncio.textContent = "Respostas das três matérias prontas para conferir. Você pode editar cada uma.";
    }

    function reiniciar() {
        estudos.forEach(botao => marcarEstudo(botao, false));
        formulario.reset();
        buscar("#demonstracao-respostas").replaceChildren();
        editandoResposta = false;
        mostrarMateria(0);
        selecionarAba("percurso");
        anuncio.textContent = "Exemplo reiniciado. Estudos pendentes e respostas limpas.";
        buscar("#demonstracao-reiniciar").focus();
    }

    painel.addEventListener("click", evento => {
        const botao = evento.target.closest("button");
        if (!botao || !painel.contains(botao) || botao.disabled) return;
        if (botao.dataset.aba) {
            selecionarAba(botao.dataset.aba);
        } else if (botao.classList.contains("demonstracao-estudo")) {
            const concluido = botao.getAttribute("aria-pressed") !== "true";
            marcarEstudo(botao, concluido);
            anuncio.textContent = `${botao.dataset.descricao}: ${concluido ? "passo dado" : "pendente novamente"}.`;
        } else if (botao.id === "demonstracao-reiniciar") {
            reiniciar();
        } else if (botao.dataset.acao === "ver-materias") {
            selecionarAba("materias");
            if (resultado.hidden) mostrarMateria(materiaAtual, true);
            else buscar("#demonstracao-resultado-titulo").focus();
        } else if (botao.dataset.acao === "ver-percurso") {
            selecionarAba("percurso", true);
        } else if (botao.dataset.acao === "materia-anterior") {
            mostrarMateria(materiaAtual - 1, true);
        } else if (botao.dataset.acao === "editar-materia") {
            editandoResposta = true;
            mostrarMateria(materias.findIndex(materia => materia.dataset.materia === botao.dataset.materia), true);
        }
    });

    formulario.addEventListener("submit", evento => {
        evento.preventDefault();
        if (!formulario.reportValidity()) return;
        if (!editandoResposta && materiaAtual < materias.length - 1) {
            mostrarMateria(materiaAtual + 1, true);
            return;
        }
        // Ao editar, também conferimos as outras etapas antes de montar o resumo.
        const incompleta = materias.findIndex(materia =>
            [...materia.querySelectorAll("select")].some(campo => campo.value === "")
        );
        if (incompleta !== -1) {
            mostrarMateria(incompleta, true);
            formulario.reportValidity();
            return;
        }
        mostrarRespostas();
    });

    buscar('[role="tablist"]').addEventListener("keydown", evento => {
        const indice = abas.indexOf(evento.target);
        if (indice === -1) return;
        const destinos = {
            ArrowRight: (indice + 1) % abas.length,
            ArrowLeft: (indice - 1 + abas.length) % abas.length,
            Home: 0,
            End: abas.length - 1
        };
        if (!Object.hasOwn(destinos, evento.key)) return;
        evento.preventDefault();
        selecionarAba(abas[destinos[evento.key]].dataset.aba, true);
    });

    painel.querySelectorAll("button[disabled], select[disabled]").forEach(controle => {
        controle.disabled = false;
    });
    mostrarMateria(0);
    selecionarAba("percurso");
    buscar("#demonstracao-instrucao").textContent = "Exemplo fictício. Explore à vontade; nada é salvo após recarregar a página.";
}
