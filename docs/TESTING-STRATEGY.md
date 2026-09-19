# Validação proporcional às mudanças

Preferência definida pelo mantenedor em 12/09/2026: escolher os testes pelo impacto direto e indireto de cada tarefa. Não executar toda a suíte automaticamente a cada ajuste.

Antes de rodar, identificar o comportamento alterado, os consumidores compartilhados e os riscos de regressão. Executar os testes existentes que cobrem esse caminho; criar casos novos quando houver comportamento relevante ainda sem cobertura. Testes não devem apenas repetir a implementação.

| Mudança | Validação habitual |
| --- | --- |
| Texto, CSS e controles da ficha | ESLint dos arquivos alterados, TypeScript, cenários de interface afetados e inspeção das capturas relevantes. |
| Fórmulas e regras compartilhadas | Testes unitários do módulo e de seus consumidores; interface que mostra os resultados; persistência/servidor quando afetados. |
| Rascunhos, importação, exportação ou migração | Casos de preservação de dados, aprovação e reabertura; fixtures reais quando o formato ou importador mudar. |
| IPC, autorização, rede, armazenamento ou infraestrutura | Ampliar para os fluxos integrados e limites de segurança envolvidos. |
| Empacotamento | Compilação de produção e conferência do artefato; smoke Electron quando a mudança afetar sua integração. Não desativar fuses para automatizar o executável final. |
| Preparação de uma versão ou mudança transversal | Executar a revisão ampliada obrigatória de `RELEASE-CHECKLIST.md`, incluindo salas de 1, 3, 5 e 10 jogadores; aproveitar evidência recente somente quando o código correspondente não tiver mudado. |

Aumentar a cobertura quando falhas, novos riscos ou dependências compartilhadas justificarem. Investigar trace e contexto antes de aumentar timeouts ou repetir testes. Não repetir casos aprovados se o código coberto não mudou desde a execução.

Exemplos para mudanças em atributos/perícias (ajustar os arquivos ao impacto real):

```powershell
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/character-attributes.test.mjs tests/character-skills.test.mjs tests/character-resources.test.mjs
npm.cmd run typecheck
npm.cmd run build:web:test
npx.cmd playwright test tests/e2e/web/skill-qol.spec.ts --config=playwright.web.config.mts --project=chromium
```

Executar projetos de navegador em sequência quando usam a mesma pasta de resultados. Informar no encerramento quais verificações passaram e as limitações materiais, sem apresentar resultados antigos como validação da tarefa atual. Esta política orienta o trabalho local; não remove os gates de CI nem substitui a validação de lançamento.

Para Electron, usar `npm.cmd run test:e2e:electron`. Após empacotar, o comando prepara `.vite` a partir do ASAR de produção antes de abrir os perfis descartáveis. O Forge pode restaurar uma compilação de desenvolvimento anterior que ainda aponta para `localhost:5173`; executar Playwright diretamente nesse estado testaria um servidor desligado. Para repetir apenas casos afetados de um pacote já atualizado, executar `node scripts/prepare-electron-e2e.mjs` e depois a seleção desejada do Playwright. A preparação altera somente saídas compiladas em `.vite/build` e `.vite/renderer`.
