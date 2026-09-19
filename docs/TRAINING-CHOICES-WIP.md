# Fontes de treinamento e efeitos no HUD — 14/09/2026

Implementação concluída no repositório existente. Executável local reconstruído; sem commit, tag, publicação ou alteração da versão 2.0.0-beta.4.

## Comportamento

- Perícias obrigatórias aparecem apenas no resumo compacto. Escolhas seguem uma fonte por vez, começando pelas listas limitadas. Escolhas explícitas permanecem vinculadas à fonte; somente opções elegíveis aparecem.
- A ficha principal destaca perícias treinadas, sem checkbox. São três perícias por linha na largura usual, duas/uma nas telas menores.
- Trocas de benefício oferecem poderes e habilidades permitidos pelo catálogo. A seleção insere o texto na categoria do livro e registra a concessão por raça/origem. Ao trocar a escolha, só a inserção automática daquela fonte é removida. Texto importado, personalizado ou concedido por outra fonte permanece.
- Pré-requisitos reconhecidos (atributos, nível, treinamento e raça) são conferidos. Uma nova concessão incompatível também é recusada no salvamento. Requisitos ainda não automatizados aparecem para revisão obrigatória do mestre. Aplicar fontes altera o rascunho; a aprovação continua no salvamento da ficha.
- O botão ✦ Efeitos e bônus fica junto ao HUD. A ficha cadastra fontes; a ativação condicional acontece no HUD, com situação, valores permitidos e duração.
- O servidor aplica efeitos das fontes da ficha aprovada a perícias, iniciativa, testes de ataque e resistências. A requisição não define o valor do bônus. A ativação é privada para seu jogador e para o mestre.
- Efeitos terminam ao desativar, encerrar combate, trocar ficha ou vencer a duração. Suporta próximo teste, turno atual, rodadas, minutos e horas de jogo. Um minuto corresponde a dez rodadas; a duração não usa relógio de tempo real. Repetir uma requisição idêntica não reinicia a duração.
- Execução completa de poderes e gasto automático de PM permanecem fora desta etapa. Ativações antigas gravadas no editor são limpas ao ler a ficha.

## Dados e limites

- Catálogo textual compartilhado: `t20-local-2026-09-14`. Foram acrescentadas 155 referências de poderes gerais de Heróis de Arton (p. 78–95) e dez maravilhas de Mashin de Ameaças de Arton (p. 160–161). Disponíveis também na consulta geral de poderes.
- Escolhas de benefício: 34 origens comuns, Humano, Osteon, Yidishan, Mashin e a troca de bônus de Deformidade do Lefou. Origens especiais continuam nas concessões próprias do catálogo de perícias; golems/Mashin não recebem benefícios de origem.
- Herança humanoide usa as habilidades com referência textual e tipo humanoide já conferidos no catálogo básico. Habilidades de raças suplementares ainda sem essa referência completa não são oferecidas automaticamente por essa alternativa; continuam possíveis como registro manual sujeito ao mestre. Não se presume que qualquer habilidade racial seja elegível.
- As condições continuam declaradas pelo jogador. O sistema não presume terreno, posicionamento, gasto de PM, composição do grupo ou cumprimento de requisitos complexos.
- Extração reproduzível em `scripts/skill-rules/build-training-benefit-catalog.py`; os livros locais não são copiados para o instalador. Páginas 78, 80 e 94 de Heróis conferidas visualmente, incluindo a tabela de Meditação Autoafirmativa e a exclusão da caixa editorial da página 94.

## Verificação por impacto

Não foi executada a suíte inteira. Foram selecionados os testes que cobrem treinamento, catálogo, persistência, cálculo, transporte, permissões e interface envolvidos nesta mudança.

- 57 testes Node: character-skills, skill-automation, training-choices, training-benefits, skill-effect-runtime, skill-sheet-persistence e rules-catalog.
- Dois testes de integração do servidor: fontes aprovadas em iniciativa/duas armas/resistências e ativações do HUD com expiração e consumo no próximo teste.
- Três testes de permissões de preload.
- 12 testes Chromium distintos: skill-automation (4), skill-qol (2), training-choices (1), training-benefits (1), player-skill-effects (1), attack-resistance (3).
- Dois testes Electron: inicialização das janelas/IPC e consulta de catálogo pelo mestre, usando perfis descartáveis.
- TypeScript, ESLint nos arquivos alterados, build web, empacotamento e conferência do conteúdo do ASAR.
- Capturas inspecionadas em `test-results/training-hud-final` e `test-results/training-hud-verified`, incluindo larguras 1200 e 600.

Durante a verificação, a busca de benefícios foi corrigida para selecionar e mostrar o primeiro resultado filtrado. A regressão de combate passou após atualizar a preparação de duas fichas antigas de teste para usar os cálculos atuais, incluindo o atributo +2 no ataque. O comando do HUD também foi incluído na lista de permissões do preload da apresentação.

Os resultados Chromium foram obtidos em execuções direcionadas sucessivas; as falhas anteriores ficaram resolvidas e não foram omitidas por aumento de timeout. Os testes Electron usam o runtime de desenvolvimento com o código compilado e perfis isolados; o ASAR do executável empacotado foi inspecionado separadamente.
