# Passo Firme

O Passo Firme monta um plano de estudos a partir das suas matérias, do quanto você já sabe de cada uma e dos horários em que pode estudar. Todo dia ele mostra o que estudar agora, agenda revisões conforme as suas respostas e, quando um estudo não é feito, devolve esse estudo ao plano sem punição. Se o tempo não dá para tudo, ele mostra os números e as saídas possíveis.

## Como abrir

- **Pelo GitHub Pages:** https://ailtonmcneto.github.io/Passo-Firme/ (endereço a confirmar depois de ligar o Pages no repositório).
- **No seu computador:** sirva a pasta do repositório com um servidor estático e abra o endereço que ele mostrar. Abrir o `index.html` direto (`file://`) não funciona, porque o navegador não carrega ES Modules por `file://`. Qualquer um destes serve:

  ```sh
  npx serve .
  # ou
  python -m http.server 8000
  ```

  A plataforma fica em `pages/plataforma.html`.

## Testes

Precisa do Node 22 ou mais novo. Não há dependências para instalar.

```sh
npm test         # roda todos os testes uma vez
npm run test:tz  # roda em três fusos (São Paulo, Tóquio e UTC), para pegar erros de data
```

Rode `npm run test:tz` antes de cada commit.

## Modo de demonstração

Para mostrar o uso diário sem esperar os dias passarem, acrescente `?hoje=AAAA-MM-DD` ao endereço da plataforma. A plataforma passa a usar essa data como hoje e mostra no topo "Modo demonstração: hoje é …", com um link para sair. Os links entre a plataforma e a página inicial mantêm a data enquanto o modo estiver ligado.

Roteiro sugerido, com um plano de 30/11 a 13/12:

1. Abra `pages/plataforma.html?hoje=2026-11-30` e crie o plano (matérias, período de 30/11 a 13/12 e horários).
2. Em "Seu passo de hoje", marque um bloco como feito (Feito → Como foi?) e pule outro.
3. Abra `pages/plataforma.html?hoje=2026-12-04` para ver o replanejamento: a faixa "O que mudou" mostra o que voltou para o plano.
4. Abra com uma data a 3 dias ou menos do fim, como `pages/plataforma.html?hoje=2026-12-11`, para ver o cartão da reta final (aparece quando o tempo que resta não cobre tudo).

Só avançar a data é um caso tratado. Voltar no tempo com o mesmo plano não é: quando a data avança, o plano gravado é refeito e os blocos dos dias que passaram ficam marcados como não feitos. Para recomeçar a demonstração, apague os dados do site no navegador (nas ferramentas de desenvolvedor, Application → Storage → Clear site data).

## Organização das pastas

| Pasta ou arquivo | O que tem |
|---|---|
| `js/core/` e `js/util/` | o algoritmo: funções puras, sem tela nem banco |
| `js/fluxo.js` | o uso diário: criar, concluir, pular e replanejar o cronograma |
| `js/api.js` | a fachada: o único ponto que as telas chamam |
| `js/db.js` | o salvamento no navegador |
| `js/plataforma.js` e `js/ui/` | as telas |
| `docs/` | as especificações (`algoritmo.md` e `front.md`) |
| `tests/` | os testes, com os casos em `tests/fixtures/` |

## Onde ficam os seus dados

Só neste navegador, no IndexedDB. Não há conta nem servidor, e os dados não passam de um dispositivo para outro. Limpar os dados do site apaga o plano.

## Equipe

- Ailton Neto
- Arthur Tavares
- Fernando Meira

## Licença

MIT. Veja [LICENSE](LICENSE).
