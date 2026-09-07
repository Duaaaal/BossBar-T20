# Arsenais reutilizáveis e resistências interativas

Implementação na branch `feature/multiplayer-web`, ainda sem alteração de versão ou commit de lançamento.

## Biblioteca e editor de cena

- A janela do mestre tem **Biblioteca de ataques**. O editor de cena oferece **Escolher armas / ataques** para o chefão selecionado na fase, e o painel também permite abrir a biblioteca pelo arsenal.
- Cada registro contém nome, teste (Luta/Pontaria), bônus, dano por acerto, quantidade de ataques (1–20), margem/multiplicador crítico, tipo de dano, alcance/área, tags e condições aplicadas ao acertar.
- Tags são etiquetas de organização e busca, por exemplo `Chefão: Dragão` e `Fase: 2`. Elas não impedem o mestre de reutilizar o ataque em outro contexto.
- A biblioteca guarda até 500 registros no perfil local. Cada arsenal recebe uma cópia: editar ou excluir o original não modifica retroativamente fases já configuradas. Alterações no editor continuam exigindo **Salvar cena**.
- Tipos de dano e alcances usam opções do manual fornecido (Jogo do Ano, páginas impressas 143, 224–225 e 230). Áreas permitem informar metros inteiros. Valores legados não reconhecidos são preservados para não invalidar fichas existentes.

## Ataques e testes dos jogadores

- Em ataques múltiplos do chefão contra jogadores, cada alvo selecionado recebe a quantidade configurada de testes de ataque. Todos os acertos/falhas são determinados antes da etapa de dano; o botão de dano existente continua necessário.
- Cada acerto tem sua própria rolagem de dano, incluindo dados adicionais de crítico. Não se trata da divisão de um único dano em parcelas.
- As condições configuradas são verificadas por alvo atingido, uma vez por condição após a sequência, com perícia, CD, duração e eventual dano recorrente próprios.
- Resistências de condições e de dano em área são manuais por padrão, com botão no HUD do dono do personagem. Não consomem ação padrão nem exigem que seja o turno dele. A configuração pessoal **Rolar resistências automaticamente** permite automatizar novas solicitações.
- O mestre pode resolver resistências pela apresentação Electron. Outros jogadores não recebem os identificadores privados dessas solicitações. Repetir uma solicitação já resolvida não gera outra rolagem.
- Uma resistência pendente bloqueia o avanço do turno e é incluída no checkpoint. A edição/revisão pendente da ficha continua bloqueando o controle do jogador.
- O modal de ataque do jogador separa as fórmulas base, somente leitura, dos bônus adicionais de ataque e dano. O servidor calcula a base a partir da ficha, sem confiar em uma fórmula substituta enviada pelo navegador.
- A aprovação vale para o par de bônus adicionais daquele jogador na sala. Usar os mesmos valores, inclusive com outra arma, não pede aprovação novamente. Mudar qualquer bônus exige outra aprovação; recursos que já exigiam autorização mantêm sua regra própria.

## Retratos e música

- A rota de retratos compartilhados permite incorporação pela origem do Electron, mantendo o token da sala e a validação do arquivo. O retrato continua visível independentemente da privacidade dos valores da ficha; clicar permite ampliar.
- O botão de loop de cada linha da playlist faz aquela faixa repetir quando for alcançada. As anteriores podem tocar uma vez; avançar manualmente permite seguir para a próxima. Essa escolha é salva na cena e preservada nos encontros e na apresentação.

## Validação e limites

Foram acrescentados testes de persistência/cópia por fase, fórmulas, loop individual, resistências manuais e automáticas, acesso por outro usuário, múltiplos acertos, aprovação de bônus e retratos entre navegador e Electron. Nenhuma dependência nova foi instalada.

Validação desta implementação: lint e TypeScript aprovados; 189 testes unitários aprovados; matriz web com 45 aprovados e 18 pulados pelos filtros existentes; suíte Electron completa com 3 aprovados. O gate de cobertura do netcode passou com 65,23% de linhas e 72,59% de ramificações. Os cenários adicionais de interface também verificam campos base somente leitura, bônus negativos e resolução duplicada de dano.

Os testes de salas são locais, com clientes independentes e cenários de rede degradada; não equivalem a um ensaio em redes externas reais. Firefox continua com a limitação ambiental já documentada. O stutter de áudio permanece explicitamente pendente em [problemas conhecidos](KNOWN-ISSUES.md); loop individual não representa uma correção desse problema.

## Suggested commit summary

```text
Add reusable boss arsenals and interactive resistance rolls

- Add a persistent attack library with searchable tags and independent boss/phase arsenals.
- Configure multi-strike attacks, per-hit damage and on-hit conditions with resistance checks.
- Default player resistances to owner-controlled rolls, with a personal automatic-roll preference.
- Preserve pending resistances across encounter checkpoints and prevent duplicate damage resolution.
- Separate authoritative weapon formulas from approved player attack/damage adjustments.
- Standardize damage types and weapon range/area selectors while retaining legacy sheet values.
- Allow room-protected portraits to render in Electron and remain interactive across player HUDs.
- Persist per-track playlist looping through scene playback, previews and encounter saves.
- Expand unit, browser and Electron integration coverage without changing release metadata.
```
