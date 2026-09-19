# Áudio suspenso, reconexão e HUD — 19/09/2026

## Evidência e limites do diagnóstico

Foram inspecionados os traces do artefato Firefox do [CI 35471762375](https://github.com/Duaaaal/BossBar-T20/actions/runs/35471762375). Na sala de três jogadores, combate, RD, cura e privacidade chegaram ao resultado esperado; a chamada `reload()` ficou sem resposta. Na sala de dez, oito jogadores entraram normalmente; a avaliação JavaScript que consultava o HUD do nono não retornou. Isso é diferente de receber repetidamente um nome incorreto ou um HUD vazio. Não houve erro JavaScript registrado nesses dois traces.

Antes das mudanças desta tarefa, os sete cenários de cutscene e salas de 1, 3, 5 e 10 jogadores passaram no Firefox Windows local, sem retries. A falha remota não foi reproduzida nessa execução. O MP3 sintético foi conferido com FFmpeg 7.1: a decodificação terminou sem avisos/erros; não foi estabelecido como causa. O fallback existente para MP4 sem áudio foi preservado.

No código havia tentativas de `AudioContext.resume()` em efeitos assíncronos e no timer de 25 ms, sem um caminho de retomada diretamente ligado ao gesto do usuário. Com autoplay bloqueado, a promessa pode permanecer pendente, o relógio do contexto não avança e rampas de ganho não chegam ao destino. A [documentação do Web Audio](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices) recomenda criar ou retomar o contexto no gesto do usuário. Isso fundamenta a correção de recuperação, mas não prova que autoplay foi a causa da suspensão no runner remoto.

## Correções

- Contextos de apresentação registrados para retomada por clique/toque/teclado, com botão **Ativar áudio** enquanto houver suspensão. Uma solicitação automática pendente não é repetida a cada tick; gestos podem tentar novamente. Contextos fechados removem seus listeners. A transferência de cutscene para música continua usando o mesmo contexto.
- Silenciamento explícito do áudio do vídeo cancela as rampas e aplica ganho zero, inclusive quando o relógio estiver suspenso.
- O canal de transição só cria contexto quando há áudio a reproduzir. A atualização inicial de mute não cria um contexto musical vazio.
- Desconexões invalidam a fila anterior, cancelam downloads/verificações pendentes e preservam blobs já prontos. Um snapshot antigo não pode publicar estado após perder sua conexão. Reservas de memória antigas não alteram a contabilidade de um cache novo.
- Downloads têm prazo de **15 segundos sem progresso**, renovado a cada bloco recebido. Não é um limite para a duração total de arquivos grandes. O manifesto também tem prazo e cancelamento. São mantidas as três tentativas existentes e a ordenação entre sons de impacto e PV do HUD.
- Falhas de transporte durante a reconexão mantêm o estado de desconexão; erros de autorização continuam distintos.

## Validação por impacto

Os testes novos cobrem o relógio de áudio nativo sem o aplicativo, recuperação por gesto com relógio nativo e sem recriação do contexto, ausência de sobreposição do botão, dupla queda de rede durante preload, preservação do HUD próprio e descarte de eventos antigos. Os testes unitários verificam timeout por inatividade, renovação por progresso, descarte do timer e consumo de mídia com/sem retenção em memória.

O teste de recuperação simula a restrição de permissão, mantendo AudioContext, ganho e relógio nativos. Não é escuta humana. O teste independente anexa `native-audio-output` com estado, relógio, sample rate e resultado da retomada para ajudar a identificar indisponibilidade do backend no próximo CI.

Validação local por impacto, sem retries:

- 14 testes unitários de download, fila de eventos, loop e transferência de áudio aprovados.
- 16 cenários distintos do Firefox aprovados entre as seleções executadas: áudio nativo/recuperação, cutscene, rede, presença e salas de 1, 3, 5 e 10 jogadores.
- 14 cenários Chromium aprovados: áudio, cutscene, rede e salas de 1, 3, 5 e 10 jogadores.
- Dois cenários Electron aprovados: janelas/apresentação e retomada de encontro, fases e cutscenes, com perfis descartáveis.
- TypeScript, ESLint dos arquivos alterados, build web, empacotamento Electron e `git diff --check` aprovados. O botão foi inspecionado em captura do Firefox e sua área clicável é conferida pelo teste.

Durante os novos testes, a simulação de gesto foi ajustada para durar o evento nativo completo, em vez de terminar num microtask entre listeners. A permanência offline revelou também o indicador incorreto de erro nas tentativas automáticas; o aplicativo foi corrigido e os sete cenários de áudio/rede passaram novamente no Firefox.

**Avaliação: confirmar o novo CI antes de lançar.** Os caminhos locais afetados estão aprovados. A causa específica da suspensão e das chamadas sem resposta no runner Windows ainda não foi confirmada; o próximo CI deve executar também o diagnóstico nativo independente. Esta investigação não certifica a saída de áudio do runner nem encerra o relato de microcortes com Ludwig. Não houve alteração de preferências do Firefox, aumento de retries, remoção de asserções ou exclusão de cenários. Não foi criada versão, tag ou publicação nesta tarefa.
