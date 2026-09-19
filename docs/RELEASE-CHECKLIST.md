# Revisão obrigatória antes de versões

## Escopo e evidência

- Inventariar todo o diff desde a última versão, migrações, permissões, dependências e compatibilidade entre mestre, Electron e navegadores.
- Executar lint, TypeScript, suíte Node, cobertura de transporte/servidor e auditoria de produção. Investigar falhas antes de atualizar testes antigos; preservar asserções de segurança e regras.
- Executar os fluxos web afetados e a regressão transversal nos navegadores suportados; testar Electron com compilação de produção e perfis descartáveis. Conferir importação das fichas reais de referência, edição/descarte, exportação editável, fontes e cálculos, catálogo, combate e restauração de encontros.
- Testar salas de **1, 3, 5 e 10 jogadores**, cada um com ficha própria. Conferir resultados com valores esperados independentes do código de produção: iniciativa, ataque e dano com dados, ações consumidas uma única vez, RD por fonte, cura aprovada, PV/PM, privacidade e reconexão. Fichas pré-carregadas representam usuários que retornam; importação/upload permanece coberta separadamente, sem desativar limites de segurança para facilitar testes.
- Inspecionar telas, mensagens e modais relevantes. Testar biblioteca, fases, cutscenes, preload e áudio. Distinguir sinal medido de escuta no equipamento real.
- Empacotar, conferir ASAR/fuses e realizar instalação/atualização em ambiente descartável antes da publicação. Confirmar CI remoto quando houver push autorizado.

## Comandos

```powershell
npm.cmd run verify
npm.cmd run coverage:netcode
npm.cmd audit --omit=dev
npm.cmd run test:e2e:web
npm.cmd run test:e2e:electron
```

O CI web separa os navegadores em jobs independentes (no máximo dois simultâneos), sem retries, para evitar que o crescimento da suíte concentre toda a compatibilidade em um único timeout. A execução remota precisa ser confirmada após um push autorizado.

A matriz fica em `tests/e2e/web/release-room-matrix.spec.ts` e integra automaticamente a suíte web. Para execução dirigida, após `npm.cmd run build:web:test`:

```powershell
npx.cmd playwright test --config=playwright.web.config.mts release-room-matrix --workers=1 --retries=0
```

Não recompilar a pasta web enquanto uma suíte a utiliza. Usar diretórios de resultados separados. Firefox deve executar em ambiente capaz de iniciar o navegador; falha de infraestrutura antes de abrir a página não conta como teste aprovado. Nenhum retry deve ser omitido do relatório.

## Avaliação final e commit

Registrar data, base Git, testes executados, resultados, falhas corrigidas e limitações em um relatório de revisão. Classificar pendências:

1. **Corrigir antes de lançar:** perda/corrupção de dados, cálculos incorretos, ações bloqueadas ou duplicadas, regressões dos fluxos principais, vazamento de controles privados, ou gate obrigatório sem aprovação.
2. **Pode aguardar a próxima versão:** melhoria sem impacto material, com limitação e alternativa documentadas.
3. **Nenhum problema identificado nos cenários testados:** verificações aprovadas, sem prometer ausência universal de defeitos.

Validações externas ainda não realizadas devem ser declaradas, com recomendação concreta antes da publicação. Um commit local de trabalho validado não substitui a aprovação do instalador, da escuta real ou do CI remoto. Revisar os arquivos preparados: excluir perfis, segredos, mídias pessoais, manuais completos e artefatos gerados. Criar commit somente se autorizado e com gates locais aprovados; publicação exige autorização própria.
