# Automação de perícias — 14/09/2026

Esta implementação compartilha as regras entre edição, validação, importação, exportação e resolução dos testes em sala. O Livro Básico — Jogo do Ano continua sendo a base. As listas próprias das variantes e as fontes opcionais dos suplementos seguem as decisões aprovadas pelo mantenedor.

## Fontes e decisões

O catálogo de identidade contém 30 classes, 95 opções de raça e 131 origens. As 30 listas de treinamento de classe e as 131 origens têm registros próprios em `src/shared/data/t20-skill-training.json`. Nem toda raça ou origem concede um modificador numérico de perícia.

O catálogo adicional `src/shared/data/t20-skill-mechanics.json` contém 558 registros com livro, página, proprietário e mecânica estruturada:

| Livro | Registros |
| --- | ---: |
| Livro Básico — Jogo do Ano | 237 |
| Heróis de Arton | 144 |
| Ameaças de Arton | 53 |
| Atlas de Arton | 74 |
| Deuses de Arton | 38 |
| Guia de Deuses Menores | 12 |

As fontes incluem concessões fixas, escolhas, bônus passivos, substituições de atributo/perícia, efeitos condicionais, itens, parceiros e regras opcionais. Idade e domínios só entram depois de registro explícito e aprovação da ficha pelo mestre. Conhecer uma magia ou carregar um item disponibiliza sua fonte; isso não ativa seus efeitos.

Os registros podem ser reproduzidos com `python scripts/skill-rules/build-skill-mechanics.py`. O gerador e seus dois arquivos complementares contêm as decisões revisadas; não executam texto recebido dos livros ou de uma ficha. A enumeração de registros não é uma declaração de que todas as combinações entre livros foram testadas.

## Treinamentos e alterações de identidade

- A classe inicial concede seus treinamentos. Acrescentar uma multiclasse não repete os treinamentos iniciais.
- Inteligência permanente concede vagas; bônus temporários não concedem treinamento permanente.
- Concessões fixas são preenchidas e aparecem como **Automática**. Só escolhas abertas precisam de intervenção do jogador.
- Uma perícia ocupa uma única concessão. Escolhas válidas são preservadas por fonte, inclusive ao mudar de nível.
- Remover uma fonte retira apenas suas concessões automáticas do rascunho. Registros do mestre permanecem; escolhas afetadas ficam em revisão.
- Textos antigos nas categorias de raça, classe e origem são preservados para revisão, mas deixam de conceder bônus se a identidade correspondente foi removida.
- Ofícios são especializações independentes. Os dois campos originais são reutilizados; podem ser acrescentadas especializações até o limite de segurança de 40.
- O bônus de treinamento é +2 nos níveis 1–6, +4 nos níveis 7–14 e +6 nos níveis 15–20.

Explorador e Terreno Associado controlam terrenos e melhorias por nível da classe. Vassalo exige treinamento anterior comprovado antes de transformar uma concessão repetida em +2. As habilidades substituídas das variantes não são herdadas apenas porque têm uma classe básica correspondente.

## Bônus e testes em combate

`character-skills.ts` calcula atributo, metade do nível, treinamento, outros, tamanho, penalidade de armadura e fontes aplicáveis. O atributo substituído por uma fonte volta ao valor anterior quando essa fonte deixa de existir. Uma perícia pode somar seu atributo-chave novamente quando uma habilidade permite; duas fontes que somam o mesmo atributo não duplicam esse bônus.

Fontes cumulativas somam; itens, magias e outras categorias não cumulativas usam o maior benefício aplicável. Exceções documentadas, como Oração, têm grupo próprio. Dados extras de magias também competem entre si e com o bônus fixo da mesma categoria. O resultado natural continua sendo a face do d20, independentemente dos dados extras.

O jogador pode ativar fontes aprovadas para o teste, informar a situação e escolher um valor permitido. Isso vale para testes de perícia, cada arma de um ataque, Iniciativa, primeiros socorros e resistências. O servidor valida os identificadores e os valores com a ficha aprovada; o cliente não fornece a fórmula da regra. Ajustes manuais de ataque continuam separados.

O bônus de Ataque Especial é limitado pelo nível de guerreiro e permite a divisão igual com dano. O componente de dano e o custo continuam sob controle manual. Fúria Titânica dobra as opções de Fúria no nível correspondente. Dados de auxílio apresentam as fórmulas disponíveis; seu estoque, aprimoramentos e consumo são informados pelo jogador e conferidos pelo mestre.

Esta etapa não executa poderes ou magias nem desconta PM automaticamente. Gatilhos após conhecer um resultado, novas tentativas, escolhas de 10/20, sucessos automáticos, consumo de estoques e mudanças de situação que dependem de julgamento continuam sendo resolvidos manualmente. Não são convertidos silenciosamente em vantagem ou bônus numérico. Benefícios personalizados podem ser registrados nas fontes adicionais do mestre. Um Familiar sem animal identificado pede completar essa escolha.

## Importações, rascunhos e persistência

O modelo continua em versão 3; a revisão de regras passa para `t20-jda-2026-09-r8`. `BossBar.Pericias.Fontes` usa versão 2 para propriedade das concessões e `BossBar.Pericias.Efeitos` usa versão 1 para escolhas, ativações, terrenos, reconciliação da importação e fontes do mestre. Metadados antigos são lidos sem apagar valores personalizados.

A importação compara cada total com atributo, nível, treinamento, tamanho, equipamento e fontes passivas reconhecidas. Bônus identificados são contados uma vez; somente a diferença sem fonte permanece em Outros, com aviso obrigatório por perícia. O jogador pode ajustar Outros, usar o cálculo conhecido ou transferir a diferença para uma fonte registrada, sujeita à aprovação no salvamento. A exportação apresenta os bônus nos campos Nimb e registra sua composição para evitar duplicação ao reimportar.

Nomes com escolhas explícitas e distribuições numéricas completas e inequívocas preenchem as escolhas correspondentes. Foi conferida, por exemplo, a distribuição de Deformidade do Furacão Imortal. Várias distribuições possíveis continuam para revisão. Ofícios vazios não geram diferenças artificiais. Resolver uma fonte pendente pode explicar o residual, mas aumentos posteriores de nível ou atributos não são absorvidos como bônus antigos. Descrições não são interpretadas como código nem substituídas por fórmulas presumidas.

Novas fichas e novas importações passam pela validação automática quando raça, classes/níveis e os seis atributos estão válidos. A fila agrupa alterações, permite apenas uma prévia em andamento e ignora respostas anteriores a uma nova edição, troca de ficha ou fechamento. As prévias não enviam pedidos de aprovação. Valores personalizados de uma importação são preservados e as substituições propostas ficam para revisão.

Validar manualmente, salvar, descartar ou reabrir aguarda a requisição automática em andamento terminar antes de acessar a mesma ficha. Cancelar a aplicação de uma prévia não é tratado como cancelamento da operação no servidor. O caso de concorrência foi reproduzido com Pythagoras e ganhou cobertura específica.

Aplicar fontes altera somente o rascunho. Cancelar a janela de fontes descarta suas alterações; fechar a ficha sem salvar descarta o rascunho completo. A aprovação acontece pelo fluxo existente de salvamento.

A exportação mantém campos editáveis, guarda os metadados e apresenta Ofícios adicionais no espaço de texto disponível do modelo Nimb. Nova página só é criada se faltar espaço. A conta exportada inclui também as fontes adicionais, para que suas parcelas correspondam ao total.

## Verificação por impacto

Os casos novos cobrem concessões, remoção de fontes, Inteligência permanente, especializações, preservação da importação, variantes, terrenos, valores forjados, acúmulo de bônus e dados extras. Uma matriz percorre as 30 classes do nível 1 ao 20, conferindo treinamento com fonte e resultados finitos; ela complementa os exemplos de regras, sem substituí-los.

Os testes de interface cobrem nova ficha, importação com PV/PM personalizados, quatro dados no título, Ofícios, regras opcionais, limites de terreno e apresentação em larguras de 1200, 960 e 600 pixels. Migração, exportação/reimportação, ataques com duas armas, Iniciativa e resistências têm casos de integração. O PDF exportado e as capturas da interface são inspecionados visualmente.

As suítes sem relação com esta alteração, como reprodução de áudio, não são repetidas. Compilação, análise estática e verificações do pacote local completam a entrega; nenhuma versão é publicada por esta tarefa.

Resultado da rodada inicial de automação (14/09/2026): **63 testes unitários/de integração por impacto, sete cenários Chromium e dois Electron aprovados**, mais ESLint, TypeScript e `git diff --check`. O cenário com arquivos reais percorreu Furacão Imortal, Hudson, Thok e Pythagoras. O ASAR local foi reconstruído e conferido em **14/09/2026 às 16:58:31 UTC**, mantendo 2.0.0-beta.4. Os testes Electron usam o runtime de desenvolvimento com perfil descartável; a conferência do executável empacotado é feita pelo conteúdo do ASAR, sem desativar seus fuses de segurança.

## Ajustes de conferência e interface — 19/09/2026

- Janela de fontes com altura estável e rolagem interna; expandir caixas não redimensiona nem reposiciona a janela. Popups compartilhados mantêm a altura inicial ao expandir seu conteúdo.
- Uma linha resume perícias/poderes escolhidos, fontes adicionais e poderes gerais sem vínculo com as concessões. Perícias natas ficam compactas na coluna das fontes, marcadas e bloqueadas, com tooltip e referência consultável.
- Escolhas continuam fonte por fonte. A lista destaca as selecionadas; fontes adicionais e efeitos têm cabeçalhos iguais, espaçamento reduzido e divisor próprio. O título Perícias segue as demais seções da ficha.
- O código Nimb `3` é convertido em Médio. Raças de tamanho fixo preenchem o tamanho automaticamente; novas fichas de duendes e golens com opção de tamanho exigem escolha. Tamanhos válidos importados permanecem. Limpar a seleção também limpa o campo do PDF.
- Aplicar fontes mescla apenas as alterações do popup no rascunho atual. Isso impede que uma prévia automática concorrente faça perder a edição ao substituir a lista de campos.

Validação direcionada: **68 testes Node distintos e 11 cenários Chromium distintos aprovados**, considerando as execuções finais de cada caso. Inclui migração, exportação/reimportação, bônus positivos/negativos, Deformidade inequívoca/ambígua, tamanhos, combate, cancelamento, multiclasse, aumento de atributo, popups e os quatro PDFs reais. As quatro fichas reais terminaram sem diferenças de bônus de perícias não identificadas. Isso não significa que todas as suas escolhas ou demais avisos estejam dispensados de revisão.

TypeScript e ESLint passaram. Capturas de 1200 e 600 pixels foram inspecionadas em `test-results/skill-reconciliation-final`. O executável local foi reconstruído; o ASAR de **19/09/2026 às 16:29:25 UTC** contém a revisão r8 e a nova interface. A versão permanece 2.0.0-beta.4. Não houve publicação. Áudio e outras suítes sem relação com as mudanças não foram repetidos.
