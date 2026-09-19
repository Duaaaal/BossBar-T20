# Combate, variantes e continuidade de áudio — 08/09/2026

## Variantes textuais

Em **Poderes e magias**, cada referência permite cadastrar descrições com livro, revisão e página. O mestre registra variantes aprovadas; jogadores autenticados enviam propostas, consultam as aprovadas e acompanham suas próprias propostas. A aprovação ou recusa é exclusiva do mestre. O catálogo indica propostas pendentes ao ser aberto.

Os registros ficam em `reference-variants.json`, na pasta de dados do aplicativo, com gravação atômica e versionada. Revisões aprovadas são preservadas: uma nova descrição exige uma nova revisão. Propostas não publicadas não são exibidas aos demais jogadores. O texto base e as fichas existentes não são substituídos. Variantes são consulta textual; não executam regras nem mudam automaticamente a comparação da ficha com o texto base.

## Modificadores de ataque e dano

Os campos de bônus na janela de combate aceitam números, somas, subtrações e dados: `1d6 + 3`, `2d6 + 4 - 1d4`. A gramática é limitada e não executa código. O servidor valida e rola os dados após a aprovação dos ajustes pelo mestre. Valores recebidos do navegador não substituem o ataque nem o dano da ficha.

Cada arma rola seus ajustes separadamente. No crítico, os dados adicionais de dano não são multiplicados. A rolagem de dano pendente salva a fórmula da arma e o ajuste separadamente, inclusive no checkpoint, evitando multiplicação incorreta após retomar o encontro. O total só é limitado a zero depois de somar todos os termos.

## Redução de dano e imunidade

A RD aprovada na ficha alimenta o estado de combate e acompanha o personagem na reconexão e no encontro salvo. A restauração também recupera a RD da validação salva em encontros antigos que não tinham a propriedade no estado de combate.

Tipo, categoria, origem, fontes e exceções são considerados nos danos diretos e de área, antes dos PV temporários. Uma sequência visual de parcelas é um único efeito e recebe RD uma vez; ataques explicitamente independentes recebem RD por acerto. No dano de área, a resistência é resolvida antes da RD. Perda de vida e comandos explícitos de ignorar RD conservam suas exceções.

Cada categoria/fonte tem **Imune**. Regra personalizada autorizada por Brian: dano positivo abrangido pela imunidade causa exatamente **1**, mesmo se a RD numérica reduziria o total a zero. Dano originalmente zero continua zero. A proteção respeita as exceções em **Ignorada por**. A mesma configuração é compartilhada por chefões e fichas.

## Cura manual

O botão **Realizar cura** do jogador permite selecionar qualquer participante do combate com PV e informar uma expressão como `2d8 + 5`. A solicitação não rola dados nem altera PV antes da aprovação. O mestre vê alvo, fórmula e custo de ação. Aprovar consome uma ação padrão do solicitante; negar preserva a ação. Mudança de turno, ação indisponível ou alvo removido são revalidados antes de executar.

No painel principal do mestre, cada personagem tem **Curar [nome]**. Essa cura é direta e aceita a mesma gramática. A resolução comum é autoritativa, limita os PV ao máximo, trata estabilização e não ressuscita jogadores mortos. Registra os dados e os PV efetivamente recuperados. Pedidos já aplicados não repetem a cura.

Por decisão do usuário, a propriedade que faz um inimigo receber dano de cura será cadastrada em uma implementação futura. Nesta versão, cura recupera PV também quando o alvo é um inimigo. A resolução de alvos e a transição de PV podem ser reutilizadas por futuras magias e habilidades.

## Rascunho e biblioteca

O texto de **Próxima ação** só é recarregado quando mudam o chefão selecionado ou o texto publicado dessa ação. Atualizações de PV e turnos não apagam a digitação.

A biblioteca permite marcar vários ataques e usar **Aplicar selecionados**, tanto no arsenal do painel privado quanto no editor de cena. A seleção é aplicada em lote, sem truncar silenciosamente o limite de 20 ataques do arsenal.

## Validação de áudio e limite da conclusão

O relato específico é a faixa `Ludwig fase 2.mp3` (146,8865 s, MP3 CBR 192 kbps, estéreo 44,1 kHz), travando perto de sete segundos após a primeira volta em navegador provavelmente Chromium. Foram corrigidos dois caminhos: eventos `seeked` do decodificador nativo não podem reiniciar o loop decodificado ativo; posições recebidas na reconexão usam módulo da duração para loops, evitando posicionamento exatamente em EOF. Buscas intencionais continuam passando pelo comando explícito de transporte.

O teste `real-music-loop.spec.ts`, habilitado por `BOSSBAR_REAL_LOOP_MEDIA`, tocou o arquivo real desde o início até mais de 12 s após a primeira volta no Chrome for Testing. Houve uma única criação da fonte audível, nenhuma parada e sinal PCM na saída da fonte após a fronteira. A comparação com o comportamento anterior também passou sem falha espontânea. A regressão controlada reproduz o reinício por buscas nativas deslocadas e demonstra que a correção o impede.

Assim, há correções verificadas para caminhos capazes de repetir fragmentos, mas o gatilho exato da ocorrência na mesa ainda não foi reproduzido. A captura observa o grafo Web Audio, não o dispositivo físico nem Discord. A investigação anterior de microcortes entre cutscene e fase permanece separada em `KNOWN-ISSUES.md`.

## Verificação desta entrega

ESLint, TypeScript e 252 testes unitários aprovados. Os fluxos selecionados de ataques, cura, propostas e RD passaram em Chromium, Chrome for Testing, Edge e Firefox. Os testes de adoção de áudio, loop e fim de faixa passaram em Chrome e Firefox, após corrigir no teste a espera pelo snapshot inicial de mídia. No Electron foram conferidos cadastro de variantes, seleção múltipla de ataques, rascunho durante alteração de PV e configuração de imunidade. O pacote Windows foi gerado e o diff passou na verificação de espaços em branco. Os testes usaram perfis temporários; nenhum encontro real foi alterado.
