# CI, instalação e atualização — 19/09/2026

O primeiro CI do commit `43596af` foi consultado no run `35469997975`. Regras, tipos, cobertura e pacote foram aprovados. O Electron revelou dependências indevidas dos testes no computador do mantenedor: navegador Chromium ausente no job integrado, consulta de um manual local não disponível no runner e uma asserção que exigia caber integralmente um formulário rolável numa tela de 720p. As verificações foram corrigidas preservando acesso ao PDF por range, alcance dos controles e limites do contêiner.

O teste de ducking também capturava rampas de todos os canais: a transferência do decodificador nativo para o loop decodificado inclui uma rampa legítima para zero. A sonda agora identifica o AudioParam do ducking e exige redução, restauração e ausência de mute nesse mesmo canal. O código de áudio não foi alterado nesta tarefa.

Validação local inicial: três cenários Electron e dois cenários de áudio (Chromium e Chrome) aprovados, sem retries; TypeScript, ESLint dos testes alterados, parser PowerShell, sintaxe JavaScript e YAML aprovados. Os testes de instalação ainda dependem da execução remota.

## Instalação real em ambiente descartável

`scripts/test-installed-upgrade.ps1` recusa execução fora de runners Windows hospedados pelo GitHub. O job gera o instalador a partir do pacote já verificado, instala do zero, confere registro no Windows, executável, atualizador e interface; depois instala a versão pública `1.5.2`, atualiza para a versão do checkout e confere preservação das notas tanto no arquivo quanto na interface do mestre.

A versão `1.5.2` é a única release pública com instalador disponível no momento desta consulta. Seu SHA-256 publicado é verificado antes da execução: `d0602a0ddab2579839772dd2f8b4947d4b0f1dbf4da7a6d57ef8d2abeb5be64d`. Isso não equivale a testar atualização a partir de todas as versões intermediárias. A versão do projeto continua `2.0.0-beta.4`.

A interface instalada é inspecionada pelo protocolo Chromium local, mantendo os fuses de produção. Não se habilita Node no executável nem se modifica o ASAR. Dados usados são sintéticos; a instalação e os perfis reais do mantenedor não são tocados.
