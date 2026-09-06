# Retomada de encontros e cutscenes

> **Problema conhecido (beta.3):** o usuário confirmou que ainda há stutter de sons e música. A investigação foi adiada; os testes aprovados não significam que o problema foi resolvido. Consulte [KNOWN-ISSUES.md](KNOWN-ISSUES.md).

## Salvar e continuar

A biblioteca e o salvamento automático guardam o estado confirmado do encontro, não um rascunho ainda sem aplicar. O novo formato inclui:

- Chefões, vida, escudo, condições, atributos, preparação, arsenal e ação publicada.
- Fase atual, blackout, fases pendentes e posição da cutscene em andamento.
- Personagens associados ao perfil persistente: PV, PM, PV temporários, condições, recursos, ações disponíveis, privacidade e ficha utilizada no encontro.
- Ordem, rodada, resultados, histórico e ataques que ainda aguardam a rolagem de dano.
- Playlists, trilha selecionada, posição da música e do vídeo de fundo, volumes e configuração do soundboard.

Carregar não reaplica os valores iniciais da fase nem reinicia a iniciativa. O tempo transcorrido do encontro não inclui o período em que ele esteve salvo e fechado. Todos os jogadores continuam exigindo autenticação; novos participantes precisam da aprovação do mestre durante a batalha. O retorno de um perfil já salvo no encontro recupera sua participação sem pedir uma nova aprovação. A ficha preservada no encontro não sobrescreve silenciosamente a ficha de outros encontros.

A sala salva também registra usuários que ainda não enviaram ficha. Ao carregar, personagens ausentes não aparecem no HUD; a apresentação aguarda os usuários salvos retornarem antes de continuar. A janela do mestre mostra quem falta e permite remover alguém dessa espera. **Expulsar** retira um usuário conectado do encontro e da lista de retorno, mas não apaga sua conta, ficha ou anotações. Um usuário expulso que tentar voltar durante a batalha precisa de aprovação novamente.

Uma queda durante a sessão mantém o personagem visível, acinzentado e com **Aguardando reconexão** em vermelho. Ele continua podendo receber dano e condições. A luta só aguarda quando chega a vez dele ou existe uma rolagem manual de dano pendente dele; ações e avanço de turno são então bloqueados até sua reconexão ou remoção pelo mestre. Reconectar devolve a mesma identidade, vida, recursos e posição na ordem de turnos.

Senhas, hashes de senha e tokens de acesso não são incluídos. A biblioteca continua sendo um arquivo privado do mestre: contém fichas e informações não públicas dos personagens. As mídias pessoais continuam sendo referências a arquivos locais; se forem movidas ou excluídas, o fluxo de localizar substitutos também atende às cutscenes.

Salvamentos antigos continuam sendo aceitos, mas não é possível reconstruir informações que a versão antiga não gravou, especialmente dados dos jogadores. Salve novamente no formato novo para registrar um checkpoint completo dos dados disponíveis.

## Configurar uma cutscene

1. Crie pelo menos duas fases no editor de cena.
2. Na fase de origem, marque **Cutscene entre esta fase e a próxima**.
3. Selecione a aba intermediária **Cutscene 1 → 2** (ou a transição correspondente).
4. Configure imagem, GIF ou vídeo, playlist musical, playlist de sons e entrada/saída por fade ou corte imediato.
5. Escolha como avançar:
   - **Manual:** aguarda o botão **Continuar encontro** na janela do mestre.
   - **Automático:** usa a duração do vídeo ou o tempo configurado para uma imagem/GIF.
6. Salve a cena. A cutscene não conta como uma das oito fases e não possui atributos próprios de chefão.

O mestre também pode interromper uma cutscene automática ou um carregamento usando o botão de continuar. O áudio embutido no vídeo começa ativado por padrão e possui volume e botão de mute no editor. Um novo upload visual reativa esse áudio; uma configuração de mute já salva continua sendo respeitada. Música e sons usam as playlists configuradas. Ao concluir, os valores fixos definidos para a próxima fase são aplicados.

Os controles visuais são entrada e **Blackout (s)**, de 0 a 10 segundos. Ao terminar a mídia, a imagem corta imediatamente para preto e permanece assim pelo tempo escolhido; zero revela a próxima fase imediatamente. O fade de entrada visual da próxima fase começa ao terminar esse blackout. Som/trilha mantém seus próprios fades de entrada e saída, independentes do blackout. Arquivos antigos usam o antigo tempo de saída visual como duração do blackout até que seja editado.

Durante a cutscene e seu blackout, HUDs de chefões/personagens, resultados e controles de turno ficam ocultos, tanto no Electron quanto no navegador. A próxima fase começa no fim da mídia e sua música pode tocar durante o blackout. A playlist é preparada antecipadamente; ao assumir a próxima faixa, o player normal recebe a mesma instância de áudio, decoder e grafo sonoro que já estavam tocando. A troca não reabre o arquivo, não procura outra posição e não interrompe a reprodução para criar um segundo decoder.

A duração automática é a maior duração real entre o vídeo e uma passagem pelas playlists de música/sons. Sem mídia temporizada, utiliza o tempo configurado para a imagem. Mídia de 30 segundos com blackout de 5 segundos inicia a música seguinte em 30 segundos e libera a imagem em 35 segundos. Um arquivo já encerrado não é prolongado artificialmente. O modo manual continua avançando quando o mestre decidir.

O vídeo visual fica sempre mudo internamente; uma segunda instância de mídia reproduz sua trilha embutida, com ganho, volume e mute independentes da imagem. Não há extração de arquivos nem alteração do vídeo original. Os dois transportes seguem o mesmo relógio: imagem/vídeo obedece aos fades visuais; a trilha embutida e as playlists obedecem aos fades de som.

Todas as fases, inclusive a primeira, possuem entrada visual e sonora independentes de 0 a 10 segundos. Os valores acompanham a cena salva e o relógio público da apresentação. Os controles da próxima música continuam disponíveis durante a saída da cutscene. Um salvamento feito nessa saída já registra a fase seguinte, evitando reaplicar seus valores ao retomar.

Cada fase também oferece **HUD: intervalo** (0 a 60 segundos) e **HUD: fade de entrada** (0 a 10 segundos). O intervalo e o fade do HUD começam a contar somente após o blackout da cutscene, assim como a entrada visual da fase. Blackout de 5 s com fade de 2 s revela imagem e HUD entre os segundos 5 e 7; um intervalo adicional do HUD é somado depois desses 5 s. Chefões, personagens e controles compartilham esse relógio no aplicativo e nos navegadores, sem reposicionar os elementos. A entrada sonora permanece independente, para permitir música durante o blackout.

O X do cabeçalho fecha a edição da cutscene sem apagá-la. O X da aba ou **Excluir cutscene** abre confirmação; a remoção só entra em vigor ao salvar a cena e não apaga arquivos originais. Antes de salvar, Ctrl+Z pode desfazer a exclusão.

Loops de faixas pequenas usam um buffer de áudio com repetição contínua, mantendo o transporte de pausa/seek/volume. A decodificação adicional tem orçamento próprio de 96 MB por apresentação e aceita arquivos codificados de até 20 MB; arquivos maiores preservam reprodução por streaming. Trocas entre itens de uma playlist usam as mídias pré-carregadas e o evento de fim, sem aguardar o próximo ciclo de sincronização. Silêncios gravados no próprio arquivo não são removidos automaticamente.

O relógio do buffer decodificado é autoritativo durante loops. A divergência do relógio do decoder MP3 não reinicia mais a fonte a cada verificação periódica. A entrada no buffer tem uma rampa de 20 ms. A assinatura de comandos de seek permanece estável ao trocar de faixa, evitando reaplicar um comando antigo ao áudio recebido da cutscene. Fontes antigas são liberadas sem descartar a fonte transferida. A sincronização considera a volta do loop e evita seek para jitter pequeno; seeks solicitados nos controles continuam explícitos. Isso corrige causas de microcortes no código, mas não constitui garantia auditiva para todos os codecs, drivers, máquinas ou arquivos. Para uma entrada musical sem silêncio intencional, configure a entrada de Som/trilha da fase seguinte em 0 s; o blackout visual pode manter sua duração desejada.

No HUD do próprio jogador, os pontos de ação e heróico internos abrem os respectivos controles, inclusive pelo teclado; os antigos atalhos laterais foram removidos. O comando de dano pendente aparece imediatamente abaixo do ícone de combate.

Sucessos naturais dos jogadores (incluindo extrema vantagem), fracassos naturais e o som de dano crítico reduzem proporcionalmente a música a 35% do ganho escolhido pelo usuário, sem mutá-la ou alterar a posição da barra de volume. A redução começa com a reprodução real do SFX, e a restauração começa no fim do som, com rampa de 250 ms, sem intervalo silencioso imposto pelo host. Sons simultâneos mantêm a redução até o último terminar. A sequência dramática de crítico do chefão conserva seu controle de volume separado. Preferências locais de volume/mute continuam sendo respeitadas.

## Resetar

Na janela do mestre, **Resetar** abre duas opções, ambas com confirmação:

- **Resetar encontro:** volta à espera e aos valores registrados no início da batalha, preservando a cena, playlists, personagens e a sala hospedada. Reinicia iniciativa, rodadas, histórico e mídias. O registro inicial acompanha os novos salvamentos e inclui a ficha inicial dos personagens; personagens que chegaram depois são registrados ao terem sua primeira ficha válida.
- **Resetar tudo:** mantém a função anterior de voltar aos padrões do aplicativo.

Um encontro antigo sem registro inicial usa a configuração da primeira fase para os chefões. Não é possível reconstruir retroativamente valores iniciais dos personagens que nunca foram salvos. Contas e senhas não são alteradas pelo reset do encontro.

Com uma cutscene marcada, os controles de transição da fase ficam desativados: entrada e saída são configuradas na aba intermediária. A música anterior continua durante a preparação e faz fade out junto com a entrada visual. Os controles da playlist ativa mostram e controlam a reprodução real na apresentação, inclusive durante a cutscene, sem abrir uma segunda prévia simultânea.

O carregamento de um encontro renova o pré-carregamento de fundos, vídeos, playlists e efeitos: localmente na apresentação Electron e, após a conexão, nos navegadores dos jogadores. Arquivos pequenos reutilizam URLs locais em memória; arquivos grandes são transferidos em blocos para aproveitar o cache HTTP ou do sistema sem manter o arquivo inteiro na memória JavaScript. Os limites de cache continuam sendo respeitados. Não é possível transferir mídias para um jogador antes de ele acessar a sala, nem garantir que o navegador mantenha indefinidamente arquivos grandes em cache.

## Sincronização

Electron e navegador utilizam o mesmo renderer. A apresentação aguarda a mídia decodificável em todos os participantes conectados e recebe um instante comum de início, calculado pelo host. Os navegadores estimam a diferença de relógio com amostras de ida e volta. Vídeo e áudio corrigem desvios em relação à linha do tempo compartilhada; quem chega depois alcança a posição atual.

Uma mídia que falhar mantém a cutscene aguardando, em vez de iniciar incompleta. O mestre pode então continuar manualmente. Isso não elimina limitações físicas da rede nem as políticas de reprodução automática do navegador. Uma aba suspensa ou uma conexão interrompida pode precisar recuperar sua posição ao voltar.

## Validação adicionada

- Barreira de mídia, cancelamento, desconexão e rejeição de confirmações de outra cutscene.
- Serialização, validação e retomada do tempo de encontro.
- Reprodução real de MP4 e duas trilhas de áudio em dois clientes, com atraso artificial no carregamento de um deles.
- Retomada de personagens e fichas, recursos e condições após novo login autorizado.
- Espera de participantes salvos, expulsão sem exclusão da conta, usuários sem ficha e dano em personagens temporariamente desconectados.
- Pausa no turno desconectado, retomada da mesma identidade e entrada de HUD com atraso/fade em dois clientes.
- Transferência da mesma instância de áudio sem pausa, esvaziamento ou seek; pausa e troca de faixa após a transferência.
- Fluxo Electron: cutscene manual e automática, retomada de fase/blackout, reinício do processo e salvamento durante a cutscene.

O MP4 sintético de teste teve seus comprimentos internos corrigidos e duração ampliada para quatro segundos, permitindo testar decodificação e posição reais. O MP3 sintético também foi completado: seu cabeçalho anunciava 43 frames, mas o arquivo continha apenas cinco frames de áudio; a duração agora é realmente um segundo, verificada pelo decodificador do Electron, sem seek além do fim do arquivo.

A política de segurança autoriza o renderer a ler seu protocolo local de mídia e URLs `blob:` do cache. Não foi liberado acesso genérico a origens HTTP externas. Nos navegadores, a autorização de `blob:` também cobre a decodificação dos loops já carregados.

Validação local em 06/09/2026: lint e TypeScript sem erros; 186 testes unitários aprovados; suíte web com 39 aprovados e 18 pulados pelos filtros existentes (Chromium, Chrome e Edge); pacote e suíte Electron completa com dois testes aprovados. Os testes incluem redução proporcional da música e restauração no fim real do SFX em dois clientes, efeitos sobrepostos, fades visuais/HUD após blackout, transferência do áudio sem interrupção/reposicionamento, espera e expulsão de participantes, preservação do alvo desconectado, retomada autenticada, estabilidade do loop sob divergência de relógio, seek explícito, duração automática sem acréscimo do fade, início da fase durante a saída, entrada da primeira fase e fechamento/exclusão/desfazer da aba. Firefox permanece excluído nesta combinação local Windows/Node 24 pela limitação ambiental já registrada; não foi apresentado como validado nesta execução. A sincronização foi exercitada em clientes locais com atraso simulado, não em conexões residenciais externas pela Internet. O MP4 sintético não contém áudio gravado; a independência da trilha embutida é verificada pelo transporte e ganho de áudio, não por avaliação auditiva de um vídeo real.

## Suggested commit summary

```text
feat: resume encounter checkpoints and add synchronized phase cutscenes

- Preserve committed boss and player state, character sheets, turns, history,
  pending damage, active phases, blackout and media positions in library saves.
- Restore saved encounters without restarting initiative or reapplying phase HP.
- Add intermediate cutscene tabs with visual media, music, SFX, transitions,
  manual/automatic completion, editor close and confirmed undoable deletion.
- Coordinate media readiness and shared playback clocks across Electron and web.
- Preserve authenticated reconnects without resetting the current presentation.
- Save room membership, wait for saved users to reconnect and hide absent
  characters on restore; allow the host to remove users without deleting accounts.
- Keep disconnected characters targetable with reconnection HUD indicators;
  pause when their turn or pending manual action requires them to reconnect.
- Move resource actions into the owner's HUD and place pending damage below combat.
- Add saved, synchronized per-phase HUD delay and fade-in controls that begin
  after the cutscene blackout, alongside the independent visual entrance.
- Duck music proportionally during player natural/critical SFX and restore on
  actual playback completion; handle overlapping effects without muting music
  or interfering with the boss critical envelope and user volume controls.
- Add checkpoint, real-media synchronization and Electron restart regressions.
- Crossfade scene music into cutscenes and expose optional video audio controls.
- Synchronize active playlist controls with the presentation transport.
- Refresh encounter-wide media preloading on Electron and connected web clients.
- Add confirmed encounter restart from a persisted initial-state baseline,
  distinct from resetting the application defaults.
- Separate embedded video audio from the visual transport, default audio on,
  and hide presentation HUDs throughout cutscenes.
- Add independent cutscene audio fades, a timed visual exit blackout,
  and per-phase visual/audio entrances after the blackout.
- Start the next phase at the media boundary and overlap outgoing fades without
  extending cutscene duration; preserve live transport controls and checkpoints.
- Preload the next phase playlist and transfer its active audio element and
  graph without reloading, pausing or seeking; release obsolete audio resources.
- Add bounded decoded audio loops and immediate preloaded playlist advancement.
- Keep decoded loop clocks stable instead of restarting sources on native clock
  jitter; retain a stable seek subscription and preserve explicit seek commands.
- Allow only required local/blob media reads under CSP and repair the truncated
  synthetic MP3 fixture; verify actual decoded duration and loop playback.
```
