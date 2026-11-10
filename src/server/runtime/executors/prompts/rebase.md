# TAREFA

O branch `{{item.branch}}` ("{{item.title}}") está sendo rebaseado sobre `origin/{{project.baseBranch}}`, e o
rebase parou em conflitos. Termine o rebase de modo que o branch mantenha tudo o que
`{{project.baseBranch}}` ganhou enquanto este item era desenvolvido **e** tudo o que este item adicionou.

# CONTEXTO

## Estado do rebase

!`git status`

## Commits que este item adiciona

!`git log origin/{{project.baseBranch}}..ORIG_HEAD --oneline`

## O que mudou em `{{project.baseBranch}}` desde que o branch começou

!`git log ORIG_HEAD..origin/{{project.baseBranch}} --oneline`

# RESOLVENDO

Para cada arquivo em conflito:

1. Leia os dois lados e entenda o que cada um queria fazer. A maioria dos conflitos são dois branches
   adicionando coisas diferentes lado a lado — mantenha as duas.
2. Nunca descarte uma mudança de `{{project.baseBranch}}`: ela já foi mesclada e outros trabalhos dependem dela.
3. Arquivos de lock de dependências (`package-lock.json` e afins): não edite à mão — fique com a versão de
   `{{project.baseBranch}}` (`git checkout --ours <arquivo>`; durante um rebase "ours" é a base) e rode o
   gerenciador de pacotes para acrescentar as dependências deste branch.
4. Rode `git add` no arquivo e depois `git rebase --continue` (use `GIT_EDITOR=true` para manter a mensagem
   do commit). Repita até o rebase terminar.

Não use `git rebase --skip` nem `--abort`, e não junte nem reescreva as mensagens dos commits.

# VERIFICANDO

Quando o rebase terminar, rode as verificações do projeto (typecheck, lint e testes, se existirem).

Um rebase sem conflitos ainda pode quebrar coisas — por exemplo, código de `{{project.baseBranch}}` que as
mudanças deste branch não consideram. Se uma verificação falhar, corrija a causa num novo commit que diga
que adapta o branch a `{{project.baseBranch}}`. Nunca pule, enfraqueça ou apague um teste.

Quando o rebase tiver terminado e todas as verificações passarem, escreva <promise>COMPLETE</promise>.
