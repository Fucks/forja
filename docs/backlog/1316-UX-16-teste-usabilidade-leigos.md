---
key: UX-16
title: "Teste de usabilidade da criação de fluxos com 3 pessoas leigas"
type: human
milestone: "Fase 12 — Experiência de criação de fluxos"
labels: [tipo:qualidade, area:editor]
depends_on: []
---

## Contexto

Meta do épico #185: uma pessoa que nunca usou a Forja monta "Reviewer reprova → volta ao Dev; aprova → testes → PR" em
menos de 15 minutos, sem ajuda. Só um teste com gente de verdade confirma isso. Faça-o quando #{UX-15} estiver
fechada (não fica em `depends_on` porque tarefas humanas não entram na cadeia do agente).

## O que fazer

1. Recrute 3 devs que nunca abriram a Forja.
2. Dê a cada um só a tarefa por escrito (o texto da meta acima) e um projeto com credenciais válidas. Não explique nada.
3. Peça que pensem em voz alta; grave a tela (com consentimento).
4. Anote: tempo total, onde travaram, o que procuraram e não acharam, termos que não entenderam e quantas vezes abriram
   a documentação.
5. Ao fim, pergunte: "O que cada caixa faz?" (para 3 caixas à escolha) e "Como você decidiria sobre o resultado do
   Reviewer?".
6. Consolide os achados em `docs/pesquisa/usabilidade-fluxos.md` e abra issues para os problemas que se repetirem em 2
   ou mais pessoas.

## Resultado esperado

`docs/pesquisa/usabilidade-fluxos.md` commitado com tempos, achados e links das issues abertas. Se a meta de 15 minutos
não for atingida por pelo menos 2 das 3 pessoas, isso também fica registrado, junto com as causas principais.
