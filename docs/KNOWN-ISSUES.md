# Problemas conhecidos

## Loop da música nos jogadores — mitigação em 08/09/2026

Brian relatou repetição de um fragmento perto de sete segundos após a primeira volta de `Ludwig fase 2.mp3`, apenas nos jogadores. Buscas emitidas pelo decodificador nativo agora não reiniciam uma fonte de loop decodificada que já está tocando. A reconexão também normaliza posições pelo módulo da duração. A regressão controlada cobre a repetição por eventos de busca deslocados.

O arquivo real foi reproduzido integralmente no Chrome for Testing até mais de 12 s depois da primeira volta, sem reinícios e com sinal PCM. A comparação com o código anterior também não reproduziu espontaneamente a falha. **O gatilho da ocorrência na mesa permanece em investigação**; não há confirmação de escuta do usuário. Procedimento e limites em `COMBAT-EXPANSION.md`.

Na revisão de 19/09/2026, uma nova execução com `Ludwig fase 2.mp3` no Chrome for Testing observou 160,21 s, uma inicialização da fonte, zero reinícios e sinal em 57/57 amostras verificadas depois da primeira volta. A pendência de escuta e reprodução da ocorrência na mesa permanece aberta; detalhes em `PRE-RELEASE-REVIEW-2026-09-19.md`.

## Áudio: microcortes em investigação — 2.0.0-beta.4

Em 06/09/2026, Brian confirmou que ainda percebe microcortes/stutter nos sons e na música, especialmente na transição cutscene → próxima fase. A beta.3 foi autorizada com essa limitação e a pendência permanece na beta.4. Testes de transporte e ganho não substituem a confirmação auditiva do usuário.

Na continuidade de 07/09/2026, a configuração audiovisual salva de **Ludwig, o Amaldiçoado** foi reproduzida com os arquivos reais, main e renderer Electron, usando perfil temporário. O vídeo de transformação dura aproximadamente 44,59 s; a introdução da fase 2 dura 7,18 s e atravessa o blackout de 5 s. A captura anterior à correção mostrou transferência contínua do decoder para a fase, mas uma lacuna de aproximadamente **22,21 ms** na troca introdução → música principal, cerca de 2,18 s depois dessa transferência. O player abria novamente a faixa e substituía seu contexto de áudio nesse momento.

Foram implementados: rearmamento do timer de fronteira caso dispare cedo, preparação limitada ao próximo decoder conhecido (incluindo retorno circular de playlists com mais de uma faixa), adoção sem recarga e preservação do contexto/ganhos de saída ao terminar a introdução. O estado autoritativo continua selecionando a faixa; preparar o decoder não inicia sua reprodução. A preparação é descartada ao encerrar a batalha.

Na captura após a correção, a troca introdução → música principal apresentou **4,50 ms** sem sinal e manteve o mesmo contexto de áudio. A transferência do decoder para a fase permaneceu contínua. Entretanto, a fronteira anterior vídeo → introdução apresentou **17,04 ms** sem sinal, com o evento de reprodução aproximadamente 14 ms após o horário planejado. São capturas individuais; a diferença não representa uma média estatística nem demonstra solução completa. O atraso residual exige investigação adicional do agendamento/reprodução e comparação por escuta.

O coletor observa PCM no grafo antes do dispositivo do Windows, somando os canais em mono e procurando amplitude absoluta inferior a `1e-7` durante pelo menos 3 ms. Pequenos silêncios presentes nas referências decodificadas dos próprios arquivos foram separados da lacuna da troca. A captura não atravessa driver, dispositivo físico ou Discord. **A pendência permanece aberta** para confirmação por escuta e investigação de qualquer interrupção residual.

A preparação da próxima faixa depende das informações disponíveis: o Electron recebe a playlist completa, enquanto a projeção pública web envia somente a faixa ativa. O teste em navegadores com playlist completa exercita a entrada do Electron; ele não demonstra preparação antecipada da próxima faixa no protocolo público atual. A preservação do contexto se aplica aos dois modos.

## Firefox no ambiente local

Na auditoria de 06/09/2026, o Firefox falhou antes de acessar o BossBar no Windows/Node 24/Playwright. A tentativa isolada com Node 22.23.2 também falhou em `browserContext.newPage`, com `Cannot read properties of undefined (reading '_page')`. Apenas trocar o Node não resolveu naquele ambiente.

Na investigação de continuidade, o smoke passou com Node 24.18.0, Playwright 1.61.1 e Firefox 151.0 (revisão 1532), fora do sandbox restrito de execução do agente, com perfil temporário e sem flags ou preferências adicionais. Dentro desse limite, o Firefox registrou `SpawnTarget(Error:0)` antes do erro `_page`. A comparação isola a falha de abertura ao limite de execução do agente nesta máquina; a política, token ou job do Windows responsável ainda não foi identificado.

Com o navegador funcional, os testes revelaram problemas concretos: o elemento de áudio rejeitava um MP4 sem trilha sonora, o PNG de fundo da fixture tinha dados comprimidos inválidos e o MP4 sintético antigo podia chegar ao fim imediatamente. O player agora tenta um elemento de vídeo separado somente quando o decoder de áudio retorna erro de formato não suportado. O PNG foi reparado, preservando seu pixel branco opaco. O MP4 foi substituído por uma mídia codificada normalmente, de 64×64, 24 fps, 96 quadros e quatro segundos; o gerador copia esse seed validado. As referências de tela inteira do Firefox foram recapturadas no navegador real e revisadas visualmente.

O diagnóstico da instabilidade mostrou decoders em EOF e tentativas subsequentes de correção de posição. A comparação antiga podia aceitar dois clientes parados no fim. O teste passou a exigir também correspondência entre cada posição e o relógio da apresentação, mantendo a tolerância de 0,35 s, e salva os eventos/relógios em JSON nas aprovações e falhas. Com a nova mídia, cinco execuções Firefox passaram sem retries. A matriz web completa também passou sem retries: 77 testes aprovados e 19 pulos previstos.

O Firefox voltou à matriz local padrão; não há exclusão automática por Windows/Node 24. O CI web continua configurado com Node 22. Sua execução remota não foi confirmada nesta continuidade.
