# Enquadramento, continuidade e importação de fichas

Implementado no branch `feature/multiplayer-web`, sem alterar a versão de lançamento.

## Comportamento

- O histórico apresenta as entradas mais recentes primeiro. A numeração, os horários, a privacidade e a marcação de ações desfeitas continuam vinculados ao registro original.
- Fases e cutscenes possuem enquadramento independente: **Original** conserva a mídia inteira, **Ampliar** preenche sem distorcer e pode cortar bordas, **Esticar** preenche deformando a proporção quando necessário. A escolha é salva no encontro e enviada aos clientes.
- O editor lê as dimensões da mídia local e sinaliza proporções diferentes de 16:9. A referência recomendada é **1920 × 1080 px**. Uma janela de navegador com outra proporção não pode simultaneamente preservar a proporção, mostrar a mídia inteira e preencher toda a tela; o enquadramento determina essa escolha.
- A biblioteca de ataques abre uma janela independente com preload restrito. A seleção contextual continua disponível nos arsenais de fase e chefão.
- Ao fechar uma batalha ativa, o mestre escolhe cancelar, fechar sem adicionar um salvamento à biblioteca ou salvar e fechar. Sobrescritas exigem nova decisão; falhas de gravação mantêm o aplicativo aberto. O salvamento automático anterior à saída permanece.
- O mestre pode assumir personagens desconectados na categoria Jogadores e atuar pelo HUD da apresentação Electron. As mesmas regras, recursos e resultados do personagem são usados no servidor. Reconectar não devolve o controle silenciosamente: o mestre deve devolvê-lo; enquanto isso, o usuário não pode agir ou editar a ficha. A escolha de controle é temporária e não é restaurada em outro encontro.

## Importação PDF

A referência é `assets/ficha-t20-v2-editavel.pdf`: duas páginas, 332 campos AcroForm canônicos e 333 widgets. O PDF original não foi modificado. Foi feita inspeção dos campos, renderização da primeira página e teste de leitura/edição/revalidação do próprio modelo distribuído, além das fichas sintéticas de regressão.

- Uma ficha editável compatível, mas inválida, fica em uma importação temporária e não substitui a ficha aceita nem os valores do personagem na sala.
- Campos inválidos recebem destaque vermelho e indicação do erro. O editor impede concluir enquanto existirem erros; o servidor repete a validação completa, inclusive quando um cliente ignora a validação visual.
- A importação pode ser descartada mantendo a ficha anterior. Cálculos objetivamente corrigíveis também podem ser corrigidos automaticamente antes de iniciar ajustes manuais; erros ambíguos permanecem destacados.
- São verificados campos obrigatórios, inteiros e limites, fórmulas de dados, componentes de perícias e defesa, tipos de dano, alcance e crítico. Bônus legados como `+5`, crítico `x3`, diferenças de maiúsculas/acentos e aliases inequívocos são compatíveis. Tipos ou alcances desconhecidos não são adivinhados.
- PV atuais negativos são válidos. A antiga escala de atributos continua ignorada em favor dos modificadores. Diferenças que podem ser justificadas por poderes, raça ou outras exceções permanecem avisos, não impedimentos automáticos.
- O campo legado Jogador só aparece no editor quando estiver vazio e precisar ser corrigido, evitando aumentar a linha de identidade das fichas válidas.
- PDFs achatados, digitalizações sem os campos esperados e documentos incompatíveis não são importados como fichas válidas. Não foi implementado OCR nem inferência arbitrária de regras/poderes não cadastrados.
- A edição e validação não executam scripts JavaScript embutidos no PDF. O sistema trabalha com os valores dos campos; isso não equivale a uma auditoria antivírus de qualquer PDF fornecido externamente.

## Evidências de regressão

Resultado final: lint, TypeScript, **192 testes unitários**, **54 testes web** (Chromium, Chrome e Edge), **5 testes Electron** e empacotamento aprovados. A matriz web conservou 18 casos ignorados pelos filtros de escopo já existentes. Nenhuma dependência foi alterada. Na preparação do lançamento, a versão foi atualizada para **2.0.0-beta.4**, com lint, TypeScript e os 192 testes unitários novamente aprovados.

- `tests/player-profile.test.mjs`: modelo distribuído, entradas ambíguas, crítico legado, PV negativo e round-trip do editor.
- `tests/multiplayer.test.mjs`: controle offline, iniciativa, teste de perícia, bloqueio do usuário durante a posse do mestre, devolução e preservação de PV.
- `tests/e2e/web/import-and-media-fit.spec.ts`: importação isolada, descarte, correção incompleta rejeitada, correção final, reparo automático e enquadramento em dois clientes com proporções diferentes.
- `tests/e2e/electron/final-touches.spec.ts`: aviso de proporção, enquadramento salvo, cancelamento do fechamento e gravação na biblioteca antes da saída.
- Suítes existentes de histórico, arsenais, retratos, checkpoints, HUD, rede degradada, sincronização audiovisual e dez clientes foram mantidas.

Os testes de sala usam hospedagem local isolada com clientes de navegador reais, não um túnel público de produção. O Firefox ainda falha em `browserContext.newPage` antes de carregar uma página vazia neste ambiente. O stutter de áudio previamente relatado permanece aberto, conforme `KNOWN-ISSUES.md`; testes de sincronização não substituem validação auditiva com as mídias reais.
