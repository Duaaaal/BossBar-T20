# Projeto BossBar — continuidade e validação

Trabalhe no repositório existente e preserve as alterações do usuário. O modo local e a apresentação transmitida pelo Discord continuam suportados, além das salas web. Controles privados do mestre não podem ser enviados aos jogadores.

## Antes de cada versão

É obrigatório seguir `docs/RELEASE-CHECKLIST.md`: revisar todas as mudanças desde a versão anterior, compatibilidade e cálculos; investigar testes desatualizados; testar jogadores fictícios com fichas individuais em salas de **1, 3, 5 e 10 jogadores**. Testar ações, ataques, dados, PV/PM, RD, cura, turnos, persistência e permissões.

Registrar a evidência e concluir com uma avaliação explícita: **corrigir antes de lançar**, **pode aguardar a próxima versão** ou **nenhum problema identificado nos cenários testados**. Distinguir testes automatizados, inspeção visual, escuta real, instalador e CI remoto. Testes de áudio não substituem escuta para encerrar relatos de microcortes.

Durante tarefas comuns, selecionar testes por impacto conforme `docs/TESTING-STRATEGY.md`. Antes de uma versão, executar a revisão ampliada. Não atualizar expectativas somente para tornar o teste verde: conferir primeiro a regra e o comportamento esperado.

Commit, push, tag e publicação são ações distintas; executar apenas o que estiver autorizado. Ao concluir uma tarefa, apresentar três sugestões concretas de próximos passos.
