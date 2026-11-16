import { iniciarDemonstracao } from "./ui/demonstracao.js";

const plataforma = document.querySelector("#plataforma");

if (plataforma) {
    iniciarDemonstracao(plataforma, {
        mensagemRodape: "Prévia interativa. Suas marcações e respostas duram até recarregar a página."
    });
}
