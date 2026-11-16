<!-- Gerado por `npm run docs:nodes` a partir de src/web/docs/node_docs. Não edite à mão. -->

# Map

> Processa cada item separadamente, vários ao mesmo tempo

## O que faz

Processa cada item separadamente, até N ao mesmo tempo. Dentro do grupo, cada nó vê um item só. Ao sair do grupo, os resultados voltam a ser uma lista.

## Quando usar

- Logo depois de uma Fonte, para trabalhar em cada issue por conta própria.
- Para desenvolver várias issues em paralelo.

## Entradas

Nenhuma.

## Saídas

Nenhuma.

## Campos

### Itens em paralelo (`concurrency`)

Quantos itens o grupo processa ao mesmo tempo, até 16.

- Padrão: 1 (um por vez)

### Esperar todos (`barrier`)

O passo depois do grupo só começa quando todos os itens terminam o grupo.

- Padrão: Desligado

### Parar na primeira falha (`failFast`)

Se um item falhar, cancela os outros.

- Padrão: Desligado

## Exemplos

### Três issues em paralelo

Dev dentro de um Map com 3 itens em paralelo.

```json
{
  "concurrency": 3
}
```

## Erros comuns

- Aumentar os itens em paralelo além do que o limite de uso do Claude aguenta.
- Esperar que um nó dentro do grupo veja os outros itens.

## Relacionados

- [Fonte](source.md)
- [Loop](loop.md)
