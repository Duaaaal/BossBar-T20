# Fichas por acesso e exportação editável

Atualizado em 12/09/2026, na continuidade da beta.4. Esta mudança não publica uma nova versão.

## Uso

- A janela **Ficha do personagem** oferece três abas, cada uma com nome e retrato próprios. A ficha existente é mantida na primeira aba durante a atualização dos perfis.
- Uma aba vazia permite importar um PDF ou **Criar ficha vazia**. A criação abre o mesmo editor, usando o modelo vazio de Nimb, e exige preencher/revisar os dados antes de salvar.
- Abas vazias mostram **Upload ficha**, **Criar ficha vazia** e **Baixar ficha vazia**. Abas preenchidas mostram **Abrir ficha**, **Exportar PDF editável** e **Baixar ficha vazia**. Os três comandos dividem a largura disponível.
- O nome e retrato ficam na própria aba; o botão **×** de remoção fica dentro da aba ativa e exige confirmação. Remover uma ficha libera a importação naquela aba.
- A troca comum de ficha não gera toast. Solicitações pendentes e decisões do mestre continuam sendo comunicadas.
- O catálogo de poderes e magias continua acessível pelas seções correspondentes do editor.
- A troca de aba é livre fora do combate. Durante o combate, o mestre recebe uma solicitação de **Troca de personagem** na fila de alterações de ficha. O personagem só muda após aprovação. Rascunhos, revisões e ações pendentes precisam ser resolvidos antes da troca.
- Voltar a um personagem no mesmo combate recupera seus PV, PM, condições e recursos. A troca não devolve ações já consumidas pelo acesso. Os personagens inativos também acompanham o encontro salvo.

## Avisos

**Limpar** aparece na mesma linha de **Ir ao campo** (ou **Revisar campo**), à direita, nos avisos informativos de descrição, equivalência de nome e limite inicial de atributo atingido. **Limpar todos** limpa os avisos permitidos na revisão atual. O servidor decide quais avisos podem ser dispensados; o navegador não pode liberar um erro ou uma revisão obrigatória.

Migração incompleta, conteúdo não identificado e discrepâncias que afetam cálculos permanecem visíveis. A confirmação fica vinculada à ficha e ao conteúdo revisado. Alterar esse conteúdo faz o aviso reaparecer na próxima validação; salvar uma ficha sem a condição anterior remove a confirmação obsoleta.

## PDF

O botão de exportação baixa um PDF com o desenho original de Nimb e campos AcroForm editáveis. Equipamento ocupa as duas colunas existentes; ataques permanecem na primeira página; poderes e magias usam seus corpos originais. Anotações e detalhes que não têm um campo próprio usam o espaço disponível dentro do modelo. Não são acrescentadas listas duplicadas de itens, páginas de características ou checkboxes de equipamento selecionado.

O tamanho da fonte se adapta ao espaço. Páginas adicionais são criadas somente quando o conteúdo excede a área ou as linhas disponíveis. Texto reconhecido de anexos entra nas anotações do modelo. Anexos que contêm imagens ou formatos não interpretáveis são preservados, pois não podem ser substituídos por campos de texto sem perder informação. Reexportar não multiplica esses anexos.

As configurações específicas do BossBar permanecem nos metadados. Se detalhes de RD, armas ou equipamentos forem alterados como texto no PDF, o texto editado é preservado em Anotações e a importação exige conferir os campos correspondentes; o programa não interpreta essa prosa como uma nova configuração de combate.

O arquivo conserva os identificadores necessários para reimportar as alterações feitas nos campos, inclusive nas páginas de continuação. Alterações no corpo de poderes ou magias provocam nova identificação do texto ao reimportar. O círculo continua determinando o custo-base de PM segundo as regras atuais do aplicativo.

Para conservar a edição, use **Exportar PDF editável**. Uma impressão posterior por uma impressora PDF do navegador pode produzir uma cópia sem formulário interativo. A exportação usa a ficha salva/aprovada; finalize alterações pendentes antes de exportar.

## Identidade e atributos

Raça, Origem, Classe e Divindade aceitam pesquisa por nome e livro, seleção por teclado e texto livre (inclusive multiclasses). O catálogo compartilhado contém 344 entradas com livro e página: raças e heranças, origens, classes e variantes e divindades dos seis livros fornecidos. Escolher uma opção identifica os bônus raciais conhecidos para a distribuição; as demais funcionalidades dos poderes permanecem fora deste cadastro. Fontes condicionais e regras opcionais exigem registro e revisão.

A seção Atributos separa **Base**, **Bônus** e **Total**, sempre com total somente leitura. A compra usa 10 pontos e os custos do Livro Básico, p. 17: −1 custa −1; 0 custa 0; 1 custa 1; 2 custa 2; 3 custa 4; 4 custa 7. Saldo, barra de pontos, confirmação de conclusão e contornos nos limites acompanham a edição.

**Valores importados da ficha** preserva os totais do PDF: a base é deduzida descontando fontes identificadas. O catálogo compartilhado reúne 68 configurações raciais e 71 opções de fonte, com livro/página dos seis livros e a opção Mestre. Bônus fixos são identificados; escolhas livres de raça, origem e poderes pedem confirmação somente onde há ambiguidade. A seção **De onde vêm os bônus** mostra a decomposição. Pré-requisitos citados em descrições não são tratados como poderes adquiridos. Campos ausentes continuam pendentes; não viram zero silenciosamente. Bases deduzidas fora do intervalo inicial geram aviso sem alterar o total.

O botão **Registrar aumento** abre um popup com pesquisa de fonte, atributo, quantidade, nível de aquisição, duração permanente/temporária e detalhes. Na importação, **Este bônus já está incluído no total do PDF** registra a origem sem somá-lo novamente ao total. Os registros novos vão ao mestre ao salvar; a revisão apresenta fonte, nível e duração em texto legível. Fontes condicionais (item vestido, ritual concluído, magia ativa, opção de poder etc.) precisam ser registradas com sua condição; conhecer uma magia ou possuir um item não ativa seu efeito automaticamente. Este catálogo cadastra alterações de atributos, sem executar as demais mecânicas desses poderes ou magias.

**Aumento de Atributo** concede +1 por aquisição, uma vez por patamar para o mesmo atributo (1–4, 5–10, 11–16, 17–20). Subir de nível não concede pontos automaticamente. O servidor valida aquisição futura, atributo/valor/duração previstos pela fonte e repetições indevidas. Bônus temporários de magias ou itens usam o maior de sua fonte; registros permanentes permanecem separados da base. Exceções da mesa usam Mestre e dependem de aprovação. A variante de envelhecimento de Heróis é uma escolha explícita para revisão, não uma substituição automática da regra do Básico.

**Rolagem de atributos · 4d6** rola quatro dados por atributo, descarta o menor e converte o resultado conforme o Básico. O servidor registra os dados por ficha; o botão fica bloqueado após rolar. Se a soma dos seis atributos iniciais for menor que 6, repete o menor resultado até satisfazer a exceção oficial. O histórico mostra as repetições. Só **Limpar todos os atributos** inicia uma nova distribuição, após confirmação. Resultados diferentes do registro do servidor são recusados ao salvar.

Trocar de método abre confirmação de que a distribuição do rascunho será apagada, mesmo quando já era válida. Valores de compra/personalizados recomeçam em zero; rolagens aguardam seus dados, sem exibir os antigos totais. A ficha salva permanece intacta até a aprovação das mudanças.

**Multiclasse**, acima de Classe, abre uma lista de classes pesquisáveis e níveis. O texto final usa, por exemplo, `Druida 3 / Paladino 1`; o nível do personagem é a soma. A primeira classe permanece identificada pela ordem. Não é permitido repetir classes, combinar uma classe com sua variante nem exceder 20 níveis. O popup explica a regra de PV iniciais, PV subsequentes, PM, perícias e proficiências; esses recursos não são substituídos silenciosamente.

## Navegação e descarte

A demora vinha da releitura e análise do PDF para reconstruir os avisos a cada consulta do perfil, somada a consultas redundantes por troca. A seleção agora retorna a ficha e os dados da aba numa única resposta. Avisos sem confirmações dispensadas usam os metadados existentes; os demais reutilizam a análise enquanto a validação não muda. Cliques durante uma seleção são reunidos para respeitar o último destino escolhido.

As rotas de seleção, consulta do perfil e retratos usados pelas abas não têm limite por contagem de requisições. Autenticação, propriedade da ficha, operação em andamento e aprovação durante combate continuam valendo. O teste cobre 90 seleções seguidas, navegação pela interface sem GET adicional de perfil e cliques concorrentes com destino final correto. No Edge local, a mediana das requisições foi 10 ms, com p95 de 15,5 ms (não é uma promessa de tempo para conexões remotas).

**Fechar sem salvar** e o **X** descartam campos e retrato preparados no editor e liberam a edição sem proposta ao mestre. Recarregar/fechar inesperadamente a página também não envia o rascunho. Rascunhos antigos do armazenamento local não são restaurados. **Validar e corrigir cálculos** só corrige o rascunho; **Salvar e fechar** é a ação que o envia. Avisos dentro do campo omitem a localização redundante; o resumo superior mantém o caminho para navegação.

## Persistência e validação

- O armazenamento de perfis passa à versão 2. PDFs, retratos e confirmações de avisos pertencem a cada uma das três fichas; usuário, senha e bloco de notas continuam pertencendo ao acesso.
- As rotas de seleção e retratos verificam a propriedade da ficha. Edições identificam a ficha aberta e são recusadas se outra janela já tiver trocado o personagem ativo.
- Testes em `tests/character-slots.test.mjs` cobrem migração, isolamento, avisos e edição/reimportação do PDF.
- Testes em `tests/e2e/web/character-slots.spec.ts` cobrem criação, seleção, aprovação/recusa, manutenção de PV/PM/ações, exportação, avisos e disposição em desktop/celular.
- As quatro fichas reais fornecidas (Pythagoras, Hudson, Thok e Furacão Imortal) foram usadas na conferência da exportação e reimportação.

Comandos: `npm run verify`, `npm run build:web:test`, Playwright com `playwright.web.config.mts` e `npm run package`.

A conferência de 12/09 inclui as quatro fichas reais: Furacão Imortal, Hudson e Pythagoras exportam em três páginas; Thok usa continuação para o texto que excede o modelo. Os valores reconhecidos pelo editor permanecem iguais após exportação e reimportação. Aparências e valores dos widgets AcroForm são conferidos separadamente dos testes de importação.

Validação da rodada anterior: lint e TypeScript aprovados; 269 testes unitários; 11 cenários distintos de fichas no Chromium (incluindo os quatro PDFs reais) e cinco cenários no Edge aprovados. O executável Windows foi reconstruído em `out/BossBar - Tormenta20-win32-x64`. Quatro cenários no Electron aprovados: inicialização, catálogo, auditoria visual e biblioteca/retrato compartilhado. Não houve publicação de versão.

## Fontes, carga e revisão de valores — 12/09

**Validar e corrigir cálculos** corrige as fórmulas determinísticas e abre **Revisar valores esperados** para avisos com uma substituição concreta. Cada proposta apresenta campo, valor atual, valor esperado e motivo. PV/PM da progressão básica e dados de referência de magias exigem confirmação, pois podem ter exceções. É possível manter tudo ou escolher quais valores aplicar. Descrições personalizadas não são substituídas. O resultado permanece no rascunho até salvar e passar pela aprovação do mestre.

Campos somente leitura têm tooltips acessíveis por cursor ou foco, com componentes, fontes, limites, ajustes e resultado. Tooltips extensos permitem rolagem; Escape dispensa a explicação. Referências de livros usam itálico, tamanho menor, azul acinzentado e sublinhado discreto no editor, nos avisos, nos seletores, no catálogo e na RD. Conteúdo importado é inserido como texto, sem interpretar HTML.

O estado de alocação fica ao lado de **Atributos**, separado por divisor; o detalhamento se chama **Fontes:** e a ação é **+ Adicionar ponto**. Classes múltiplas aparecem abreviadas quando o campo não está em edição, por exemplo `Dru. 3 / Pal. 1`. O valor salvo e o popup mantêm os nomes completos e a ordem da classe inicial.

**Itens** mostra moedas e carga no cabeçalho, com divisores. **Carga atual** separa **Bruta | Equipada | Real**; a carga bruta inclui moedas, a equipada contém as unidades selecionadas e a real desconta essas unidades. A carga máxima e Levantar continuam preservando os valores informados. Cada item tem **Espaços** e **Carga Total**, calculada por quantidade × espaços. O título exibe **(Equipado)**; o botão de remover é menor e há apenas duas linhas obrigatórias. As duas colunas de itens permanecem alinhadas. Dados de espaços desconhecidos aparecem como pendência, sem inventar zero.

Na RD, **Imune** fica no canto superior esquerdo de cada cabeçalho/linha, aproveitando a faixa já existente dos títulos. Os totais por tipo detalham todas as proteções, as bases, grupos de acúmulo, o piso revisado e as fontes desconsideradas por tipo, origem ou exceção. A descrição usa o mesmo cálculo aplicado no combate.

### Defesa e preservação do PDF

`src/shared/defense-sources.ts` identifica bônus passivos por raça, origem, poderes registrados, equipamento selecionado e níveis de cada classe. A base é sempre **10**; não há aumento geral por nível. São consideradas, entre outras, Insolência/Esquiva Sagaz, Casca Grossa, Tanga de Peles, Couro Rígido, Chassi de ferro, Carapaça Kappa, Pele de Ferro/Aço, Esquiva, Encouraçado, Carapaça, Escamas Dracônicas, Defesa Estratégica, Herói do Povo, herança de Kundali e origens do Atlas. As restrições de armadura e o não acúmulo do mesmo atributo entram no cálculo. A escolha de um atributo alternativo permanece no campo Atributo-chave; Blindagem, Armadura Brilhante e Duro Como Aço permitem os atributos correspondentes com armadura pesada.

Referências consultadas: Livro Básico, p. 25, 27, 31, 42, 47–48, 54, 69, 76–79, 106, 125, 128, 133, 136–137 e 226; Heróis de Arton, p. 33, 43, 61, 68, 78, 83, 87, 114, 132 e 168; Ameaças de Arton, p. 134, 158, 265, 300, 304 e 333; Atlas de Arton, p. 472 e 474; Deuses de Arton, p. 36. O Guia de Deuses Menores foi consultado para distinguir efeitos dependentes de teste/ativação.

Efeitos situacionais (posturas, ações, gasto de PM, terreno, alvo, aliado ou duração) continuam em **Outros** e sua justificativa enquanto ativos. Conhecer uma magia ou possuir seu texto não ativa sua proteção. Empunhaduras e demais condições que o modelo ainda não registra precisam de revisão manual; o cálculo não deduz essas condições pelo texto descritivo.

Fichas antigas separam uma única vez os bônus reconhecidos do agregado anterior de Outros, preservando o restante. O PDF Nimb mostra o agregado na coluna nativa Outros; os metadados guardam a parcela automática para que reabrir/exportar não a some novamente. O texto dos poderes e magias permanece íntegro.

Testes específicos: `tests/sheet-calculation-sources.test.mjs` e `tests/e2e/web/sheet-source-tooltips.spec.ts`. As regressões de fichas usam a escolha explícita de manter valores personalizados ao revisar a progressão básica.

Verificação concluída: ESLint e TypeScript aprovados; 274 testes unitários aprovados. Ao longo desta rodada passaram 15 cenários distintos no Chromium (incluindo o caso dos quatro PDFs reais) e cinco no Edge. Os dois cenários novos passaram novamente no Edge com o código final. Cinco testes Electron aprovados, incluindo tooltip de RD no painel privado, persistência na biblioteca, catálogo, retrato e auditoria visual. Capturas de itens/carga e da RD em janela curta conferidas. O pacote Windows foi reconstruído; o `app.asar` contém os novos textos e controles. `git diff --check` aprovado. A versão permanece 2.0.0-beta.4, sem publicação.


## Compra de atributos, recursos e consulta aos livros — 12/09

Os textos normais deixam de expor a origem técnica dos dados. PDF continua aparecendo nas ações reais de upload/exportação e em avisos/revisões pertinentes. Informações complementares vazias não ocupam uma área no editor. Termos e números em explicações recebem destaques sem interpretar HTML fornecido pelo usuário.

Atributos usa o mesmo título das demais categorias. O estado de alocação e **+ Adicionar ponto** ficam na linha do título. O seletor tem 222 px e a explicação permanece ao seu lado. A compra usa **Max., +, −, Min.** em cada atributo: os controles respeitam custos acumulados −1/0/1/2/4/7, bases −1 a 4 e orçamento de 10 pontos. Max. usa o maior valor que cabe no saldo; Min. devolve a base a −1. Base e Total são somente leitura nesse método. A barra aumenta de intensidade a cada ponto, e as fontes evitam repetir a mesma citação. Em telas estreitas, o cabeçalho mantém o botão visível, o estado completo fica disponível no tooltip e os controles de compra têm rolagem horizontal, preservando os botões na mesma linha.

A carga atual mantém as três parcelas no cabeçalho em um campo compacto. Cada parcela identifica sua função pelo tooltip e nome acessível. Fichas criadas no aplicativo começam com dois itens de quantidade 1. Linhas vazias não recebem números que as tornem itens ativos; linhas antigas apenas preenchidas com zeros também não reaparecem.

### PV e PM

O cálculo compartilhado fica em `src/shared/character-resources.ts`. Corrige PM de Ladino (4 por nível), remove o bônus genérico indevido de Inteligência do Inventor e soma o atributo-chave do Arcanista quando identificado. Multiclasse usa PV iniciais apenas na primeira classe, PV subsequentes nas demais e PM por nível de cada classe, sem duplicar o mesmo atributo. Inclui Treinador e Frade e as fontes passivas reconhecidas Duro como Pedra, Sangue Mágico, Vitalidade, Vontade de Ferro e Poder Mágico. Quando o caminho do Arcanista está pendente, os PM já concedidos pelos níveis continuam preenchidos; o atributo-chave fica para revisão. Escolhas não identificadas geram revisão; conhecer o texto de um poder citado como pré-requisito não o concede.

Somente fichas novas aderem ao acompanhamento automático de PV/PM por padrão. Mudanças em classe, nível, atributos e poderes identificados atualizam os máximos. Recursos cheios continuam cheios; recursos gastos são preservados, limitados ao novo máximo. Editar manualmente um máximo desativa seu acompanhamento automático. Fichas existentes mantêm seus máximos personalizados e recebem propostas de substituição com confirmação na validação.

### Referências clicáveis

Citações abrem uma nova aba na página indicada. O mapeamento considera a diferença entre numeração impressa e posição da página no arquivo (Básico: +6; suplementos: +2). Na sala, somente uma conta autenticada recebe autorização de consulta, válida por 30 minutos e revogada com a sessão. A entrega suporta leitura parcial, não guarda cache público e não aceita caminhos arbitrários. A autorização usa cookie HttpOnly restrito às rotas de livros; o token de acesso da conta não aparece no link.

No desktop, o aplicativo abre o navegador padrão com um endereço temporário de leitura em loopback, inclusive em encontros locais. As demais navegações e novas janelas continuam bloqueadas. Os seis manuais não são incluídos no instalador: o mestre mantém os arquivos fornecidos em Downloads; a cópia do Básico também é encontrada no caminho original Desktop/Backup/Pasta_de_tudo. Livros ausentes mostram orientação na consulta.


Verificação desta rodada: 282 testes unitários, ESLint e TypeScript aprovados; 13 cenários distintos no Chromium e cinco no Edge, incluindo quatro fichas Nimb reais. A extensão do cenário de ficha vazia cobre o popup de multiclasse, seu recálculo imediato e Escape fechando somente a lista aberta. Quatro cenários Electron passaram, incluindo abertura efetiva do livro por HTTP local em leitura parcial e preservação dos controles privados. Uma ficha nova foi exportada em três páginas, reaberta com PV 27 / PM 8 e campos editáveis, e sua primeira página foi conferida visualmente. O pacote Windows foi reconstruído, sem publicação de versão.

**Decisão aprovada pelo mestre:** aplicar as progressões próprias das variantes de Heróis de Arton. Todas as 30 classes do catálogo têm progressão: as 14 classes básicas, Treinador, Frade e 14 variantes. Burguês e Ermitão usam PV 12/3, Magimarcialista 16/4, Santo recebe 4 PM/nível; Necromante soma Inteligência e Usurpador soma Carisma. As classes básicas continuam seguindo o Livro Básico.

## Controles de atributos e campos vazios — 12/09

Título, estado da distribuição, seletor, tabela de custos e **+ Adicionar ponto** compartilham uma linha. A tabela alinha **Valor** sobre **Custo**, com as seis colunas correspondentes. **Fontes:** começa expandido. O texto “Bônus não gastam pontos” foi removido.

Chegar a um limite inicial permitido não gera aviso de validação. A base máxima recebe um brilho intenso; a mínima recebe um contorno discreto. Os botões continuam recebendo cliques no limite para explicar a impossibilidade de aumentar/diminuir, em um popup de dois segundos, sem alterar o valor. Falta de saldo também tem explicação breve. Valores fora do intervalo permitido continuam sendo erros.

A confirmação da troca de método espera o seletor nativo concluir sua seleção. Compra e valores manuais sem rolagens pendentes não dependem do servidor de dados. Entrar em rolagens, ou sair de uma distribuição que já possui dados registrados, mantém o reinício autorizado no servidor. Cancelar preserva o método anterior; falhas necessárias de rede aparecem em uma janela explícita. Depois de sair das rolagens, a distribuição manual/por pontos deixa de carregar essa dependência.

Zeros numéricos repetidos no modelo, como `000` e `0000`, passam a `0`, inclusive na base derivada dos ataques. A normalização se restringe a campos numéricos e fórmulas compostas somente por zero; nomes e expressões de dados são preservados. Ao digitar zeros repetidos, sair do campo também normaliza sua apresentação.

Fichas novas não executam mais uma correção geral na criação. Marcadores não numéricos do modelo vazio, como `ND`, ficam em branco; campos que dependem de informação do jogador mantêm a lacuna. PV/PM são preenchidos quando há classe e atributos suficientes, conforme o acompanhamento automático já existente. Carga máxima e Levantar permanecem em branco até informados ou calculados pelo botão de validação; valores personalizados existentes continuam preservados. A ficha continua começando com dois itens.

Regressões específicas: `tests/e2e/web/attribute-controls.spec.ts` verifica a troca por interação com o seletor nativo, cancelamento, falha de rede, saída das rolagens, bloqueio de nova rolagem, duração do popup, limites sem avisos, alinhamento das duas linhas de custos e preenchimento explícito de carga. O teste de ficha vazia em `tests/character-resources.test.mjs` verifica zeros únicos, lacunas preservadas e ausência de marcadores inválidos que impeçam a correção.

Verificação concluída: 282 testes unitários, ESLint e TypeScript aprovados; 12 cenários distintos no Chromium (incluindo as quatro fichas reais de Nimb), quatro no Edge e dois no Electron. O pacote Windows foi reconstruído e seu conteúdo conferido para os novos controles, tabela e mensagens. `git diff --check` aprovado. A versão permanece 2.0.0-beta.4.

## Perícias, rolagens e tooltips — 12/09

O texto do estado da distribuição foi retirado da linha entre **Atributos** e o seletor. Os botões de rolagem usam o padrão dourado da ficha, mostram o resultado e os quatro dados, destacando qual foi descartado. O bloqueio de nova rolagem e a exceção oficial da soma mínima continuam no servidor.

O mesmo tooltip de quatro linhas acompanha Base, Bônus e Total de cada atributo. PV e PM apresentam classe/nível, base, progressão e total, incluindo Constituição, multiclasse e as fontes adicionais já reconhecidas. Somente a classe inicial recebe PV iniciais; as demais usam a progressão por nível. A base de ataque mostra a perícia, atributo, metade do nível, treino, outros e eventuais ajustes de tamanho/armadura. Títulos, termos e números têm destaque visual. Tooltips se fecham quando o usuário altera um controle para não deixar uma explicação antiga sobre a ficha atualizada.

Metade do nível, atributo, treino e total das perícias são somente leitura. A fórmula compartilhada atualiza a tela imediatamente ao marcar treino, alterar nível/atributo, mudar equipamento ou tamanho; o servidor recalcula novamente ao salvar. Treinamento concede +2 nos níveis 1–6, +4 em 7–14 e +6 em 15–20. Atuação também exige treinamento, conforme a tabela do Básico, p. 115. Avisos de fórmula resolvidos pelo recálculo deixam de aparecer.

**Fontes de treinamento** mostra as perícias obrigatórias e escolhas da classe inicial, Inteligência permanente positiva, benefícios de origens comuns e fontes raciais reconhecidas. O orçamento não aumenta ao adicionar uma segunda classe. A seleção é confrontada com as listas permitidas, e uma perícia não consome duas concessões ao mesmo tempo. Inteligência temporária não concede treinamentos permanentes. As escolhas ambíguas de origem/raça pedem confirmação da quantidade realmente usada para perícias.

Novos treinamentos fora dessas concessões são impedidos tanto na interface quanto no servidor. Seleções antigas sem fonte identificada são preservadas e geram avisos obrigatórios de revisão. Origens especiais, habilidades e exceções ainda sem regra automatizada usam **Fontes adicionais**, com perícia, nome da fonte e justificativa; seguem a aprovação da ficha pelo mestre. Isso não implementa a execução de poderes nem efeitos temporários de treinamento. O catálogo aplica as listas das 30 classes. **Decisão aprovada pelo mestre nesta rodada: usar as quantidades e listas próprias das variantes de Heróis de Arton**, mantendo as classes básicas conforme o Livro Básico.

Os tooltips de tamanho, moeda personalizada e componentes intermediários das perícias foram removidos. Os três segmentos de carga usam a mesma explicação de carga bruta, equipada e real; Carga máxima e Levantar mostram suas contas. O atributo-chave das magias agora reúne seletor e valor calculado, separados por divisor, sem tooltip nem campo duplicado.

Verificação do código após a retomada: **286 testes unitários, ESLint e TypeScript aprovados; 12 cenários no Chromium, incluindo as quatro fichas Nimb reais; cinco cenários no Edge**. `tests/character-skills.test.mjs` verifica patamares, fontes permanentes/temporárias, listas de classe, multiclasse, especialização de Ofício, persistência no formulário Nimb e rejeição de treinamento excedente pelo servidor. `tests/e2e/web/skill-qol.spec.ts` verifica o fluxo de treino, fontes adicionais, leitura dos campos, atualização do ataque, tooltips e o campo combinado de magia. O pacote Windows habitual foi reconstruído e seu ASAR conferido em 12/09/2026, às 22:22:44 UTC, mantendo a versão 2.0.0-beta.4. Dois cenários Electron passaram (fluxo principal e consulta ao catálogo). A tentativa adicional de controlar diretamente o executável empacotado pelo Playwright foi encerrada porque o fuse de segurança desativa o inspector do Node; essa proteção foi conferida e mantida. A inspeção do ASAR confirmou a presença das novas regras, controles e tooltips. Nenhuma versão foi publicada.

## Treinamento organizado e explicações compactas — 12/09

Na rolagem, a explicação visível passa a **Role 4 dados; some os 3 maiores.**, sem scroll no texto. Os botões mostram somente o dado e **Rolar**. Resultados continuam na Base; o bloqueio de nova rolagem e a exceção oficial continuam funcionando. O botão **Limpar todos os atributos** foi removido. Trocar o método ainda pede confirmação para reiniciar o rascunho.

Os tooltips de atributos, PV/PM, total das perícias, base de ataque e carga usam equações com valores e fontes entre parênteses, com os destaques visuais existentes. A base do ataque não repete uma linha com o nome da perícia. Os cálculos completos de PV/PM mantêm multiclasse, Constituição, fontes reconhecidas, limites mínimos e diferenças personalizadas. Seletor e modificador de magia compartilham uma borda, altura e divisor internos.

**Fontes de treinamento** tem botão próprio no padrão da ficha e uma janela com resumo de selecionadas, vagas, saldo e perícias sem fonte. Fontes da classe inicial, Inteligência, raça e origem aparecem em cartões contextualizados, com escolhas pendentes destacadas e referências expansíveis. Quantidades ainda não confirmadas aparecem como vagas possíveis. Benefícios de Humano/origem só são explicados quando essas fontes existem no personagem; as listas próprias de variantes continuam aplicadas.

A janela permite buscar, marcar/desmarcar e filtrar somente as perícias selecionadas. Cada seleção mostra uma distribuição compatível entre as fontes e ocupa uma única vaga. Ao esgotar as fontes compatíveis, outras escolhas ficam desabilitadas. Fontes adicionais têm campos identificados e validação de justificativa, duplicatas e novas escolhas sem suporte. Origens sem regra automatizada continuam exigindo conferência e registro explícito.

Cancelar ou Escape descarta as alterações da janela de treinamento. **Aplicar fontes** atualiza o rascunho e recalcula perícias e ataques imediatamente; a aprovação do mestre permanece ao salvar a ficha. Remover uma fonte não pode introduzir treinamento sem suporte silenciosamente. Dados antigos não identificados permanecem para revisão.

Validação desta tarefa: **19 testes unitários relevantes**, ESLint dos arquivos alterados, TypeScript, **sete cenários distintos no Chromium e dois no Edge**, todos aprovados. As capturas cobrem treinamento em 1200 e 600 px, fontes adicionais e o campo combinado de magia. O teste identificou e permitiu corrigir o nome acessível do botão com ícone e a inconsistência do sinal positivo do ataque após aplicar fontes. Os testes de recursos foram repetidos somente após o ajuste final na apresentação dos limites mínimos.

Foi adotada a [estratégia de testes por impacto](TESTING-STRATEGY.md). Não foram repetidas as suítes de áudio, rede, combate ou Electron, cujos caminhos não mudaram nesta tarefa. Compilação de produção e conferência do pacote local complementam a validação da interface; não há publicação de nova versão.

Pacote local reconstruído e conferido: `out/BossBar - Tormenta20-win32-x64/resources/app.asar`, modificado em **12/09/2026 às 23:48:58 UTC**. O conteúdo inclui a nova janela, a explicação curta e o campo combinado, sem o botão removido. O fuse que bloqueia o inspector do Node permaneceu desativando a depuração do executável. `git diff --check` aprovado; versão preservada em 2.0.0-beta.4.

## Fontes automáticas, rolagens e novas fichas — 14/09

Os quatro dados de atributos aparecem ao lado do título; o menor fica riscado e o total soma os três maiores. Novas fichas e novas importações recebem validação automática quando identidade e atributos permitem os cálculos. Valores personalizados são preservados para revisão. A prévia automática, a validação manual e o fechamento agora aguardam uns aos outros; um conflito real reproduzido com Pythagoras foi corrigido.

Treinamentos obrigatórios são preenchidos por fonte. Escolhas válidas permanecem; concessões automáticas de fontes removidas deixam de valer, inclusive quando o texto antigo da habilidade ainda está na ficha. Fontes do mestre são preservadas. Ofícios adicionais são independentes e sobrevivem à exportação/reimportação editável.

O catálogo reúne **558 registros de mecânicas de perícia nos seis livros**, além das listas de **30 classes e 131 origens**. Efeitos condicionais exigem situação informada. Idade, domínios e outras regras opcionais só valem depois de registro e aprovação. Testes em sala usam as mesmas regras para perícias, Iniciativa, resistências e as duas armas de um ataque. Dados e bônus respeitam acúmulos por fonte; esta etapa não executa poderes nem desconta PM automaticamente. Decisões e limites estão em [Automação de perícias](SKILL-AUTOMATION.md).

Verificação: **63 testes unitários/de integração distintos por impacto**, ESLint dos arquivos alterados e TypeScript aprovados. **Sete cenários Chromium e dois Electron** passaram; um dos cenários percorre as quatro fichas reais de Furacão Imortal, Hudson, Thok e Pythagoras, com correção, aprovação e reabertura sem perda de texto. A matriz de progressão cobre as 30 classes de 1 a 20. Capturas de 1200, 960 e 600 px e o PDF exportado foram inspecionados. O teste das fichas reais foi atualizado para cumprir a aprovação do mestre e usar o botão atual de remoção.

Pacote local reconstruído em **14/09/2026 às 16:58:31 UTC**, com a versão **2.0.0-beta.4** preservada. A conferência do ASAR confirmou revisão de regras r7, novos eventos de teste, catálogo, revisão de fontes antigas e serialização das prévias. `git diff --check` passou. Não houve publicação e não foram repetidas as suítes de áudio sem relação com esta tarefa.
