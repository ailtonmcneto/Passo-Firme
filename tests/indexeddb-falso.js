// IndexedDB falso, em memória, só com o que js/db.js usa: abrir o banco, ler e gravar uma chave
// numa transação, e abortar. Serve para testar a fachada (js/api.js) no Node, que não tem
// IndexedDB, sem instalar nenhuma dependência.
//
// Como no navegador, os avisos (onsuccess, oncomplete, onabort) chegam depois, nunca na hora,
// e a gravação só vale quando a transação termina sem abortar.

// Não recebe nada; devolve { indexedDB, dados }. `dados` é o Map com o que está "gravado".
// Ex.: const { indexedDB, dados } = criarIndexedDBFalso(); globalThis.indexedDB = indexedDB;
export function criarIndexedDBFalso() {
    const dados = new Map();
    const depois = (funcao) => setTimeout(funcao, 0);

    const banco = {
        onversionchange: null,
        close() {},
        createObjectStore() {},
        transaction() {
            const gravacoes = new Map();
            let abortada = false;
            let pedidosAbertos = 0;

            // Quando o último pedido termina sem aborto, a transação grava tudo de uma vez.
            const terminar = () => {
                if (pedidosAbertos > 0 || abortada) return;
                for (const [chave, valor] of gravacoes) dados.set(chave, valor);
                transacao.oncomplete?.();
            };

            const transacao = {
                oncomplete: null,
                onabort: null,
                abort() {
                    if (abortada) return;
                    abortada = true;
                    depois(() => transacao.onabort?.());
                },
                objectStore() {
                    return {
                        get(chave) {
                            const pedido = { result: undefined, onsuccess: null };
                            pedidosAbertos++;
                            depois(() => {
                                if (abortada) return;
                                pedido.result = structuredClone(dados.get(chave));
                                pedido.onsuccess?.();
                                pedidosAbertos--;
                                terminar();
                            });
                            return pedido;
                        },
                        put(valor, chave) {
                            gravacoes.set(chave, structuredClone(valor));
                        },
                    };
                },
            };
            return transacao;
        },
    };

    const indexedDB = {
        open() {
            const pedido = { result: banco, onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null };
            depois(() => {
                pedido.onupgradeneeded?.();
                pedido.onsuccess?.();
            });
            return pedido;
        },
    };

    return { indexedDB, dados };
}
