# Catálogo textual e importação Nimb

Versão do catálogo: `t20-local-2026-09-07`. Migração de fichas: `t20-jda-2026-09-r6`.

O aplicativo passa a compartilhar um catálogo de referências entre importação, validação, ficha do personagem, jogador e mestre. Os registros são textuais: nenhum poder ou magia executa efeitos, consome PM ou altera atributos automaticamente nesta etapa.

## Cobertura e fontes

| Livro fornecido | Magias com ficha completa | Habilidades/poderes no catálogo |
| --- | ---: | --- |
| Livro Básico — Jogo do Ano | 198 | Raças, origens, classes e poderes gerais do capítulo de personagens |
| Heróis de Arton | 22 | Referência para expansão posterior |
| Deuses de Arton | 29 | Referência para expansão posterior |
| Ameaças de Arton | 7 | Referência para expansão posterior |
| Atlas de Arton | Nenhum novo bloco de magia localizado | Presente de Wynlla, p. 111 |
| Guia de Deuses Menores | Nenhum novo bloco de magia localizado | Referência para expansão posterior |

São **256 magias** e **646 registros de habilidades/poderes** (55 raciais, 34 de origem, 396 de classe e 161 gerais). Habilidades homônimas de classes diferentes têm registros e identificadores separados. A cobertura de poderes dos suplementos é incremental; textos ainda desconhecidos permanecem disponíveis para revisão, sem classificação inventada.

As seis fontes, seus nomes de arquivo, quantidades de páginas e SHA-256 estão no catálogo e em `T20-REFERENCE-SOURCES.json`. Cada registro informa livro, página impressa e página do PDF. O Básico é a referência principal. O material foi extraído exclusivamente dos PDFs fornecidos pelo usuário; não foi buscada uma edição diferente na internet.

## Conferência dos PDFs

Os blocos de magia foram identificados pela combinação de título tipográfico, tradição, círculo, escola e cabeçalho de execução/alcance/duração. Foram pesquisados os seis documentos completos, incluindo seções fora do Livro Básico. A extração conserva efeitos e aprimoramentos e distingue alvo, área e efeito criado. Campos não expressos no cabeçalho recebem “Nenhuma”, “Veja efeito” ou “Não se aplica”, conforme o texto e a aplicabilidade.

O índice do Básico foi cruzado com as definições tipográficas de habilidades e poderes. Os textos foram ordenados por coluna; cabeçalhos, tabelas e legendas de ilustrações foram excluídos. Quadros como Familiares Arcanos, Animais Totêmicos, Missas e Efeitos do Golpe Pessoal foram separados das habilidades vizinhas e associados às referências que explicam. A descrição-base é mantida separada dos quadros de contexto para evitar avisos de diferença causados apenas por informação adicional do catálogo.

Casos revisados incluem a continuação de Poder Mágico e Canalizar Energia Positiva/Negativa entre páginas, a divisão de Golpe Divino entre linhas, o quadro de Conjurar Mortos-Vivos ao lado de Momento de Tormenta (Ameaças, p. 405), a pontuação ausente do cabeçalho de Missão Divina e o cabeçalho de Orientação (Básico, p. 200).

## Importação e edição

### O que significa uma diferença de descrição

O aviso compara o texto da ficha com a edição do PDF fornecido, identificada pelo SHA-256. Não certifica que a ficha Nimb está errada nem identifica sozinho qual revisão, suplemento ou adaptação produziu a diferença. O texto da ficha é preservado. Cada aviso textual oferece **Comparar trechos da diferença**, com o primeiro trecho divergente e contexto de ambos os textos, livro/página e acesso à descrição completa no catálogo.

Pontuação, acentos, indicação “JÁ INCLUSO”, pré-requisitos anexados à referência e equivalências como “uma rodada”/“1 rodada” não geram diferenças por si sós. Sinais negativos, valores e condições continuam sendo distinguidos. Exemplos conferidos nas fontes fornecidas:

| Referência | Na ficha Nimb | No PDF de referência |
| --- | --- | --- |
| Olhar Atordoante — Pythagoras, Básico p. 29 | Alvo que passa fica imune por um dia | Atordoamento indicado como “apenas uma vez por cena”; não contém aquela frase de imunidade |
| Natureza Venenosa — Pythagoras, Básico p. 29 | A arma causa +1d12 de dano de veneno | A arma causa perda de 1d12 pontos de vida |
| Orientação — Hudson, Básico p. 200 | Execução Movimento e duração Cena | Execução Padrão e duração 1 rodada |

São diferenças efetivas de texto/condição, e não apenas formatação. Nenhuma foi substituída automaticamente. A automação de seus efeitos continua fora do escopo atual.

### Campos e preservação

- Os textos de `Historico` e dos antigos campos de habilidades são separados em **Habilidades de raça**, **Habilidades de origem**, **Habilidades e poderes de classe** e **Poderes gerais**. Um campo de revisão aparece apenas se houver conteúdo cuja classificação seja incerta.
- A categoria é a do livro. Um poder geral recebido por raça/origem continua em Poderes gerais. A procedência só é registrada quando há evidência; o aplicativo não deduz a escolha do jogador pela mera elegibilidade.
- Os blocos Nimb de `Atualização` e, quando presentes, de `Magias` são interpretados por nome, círculo, escola, execução, alcance, duração, custo e descrição. Vírgulas na duração e parênteses no alcance são preservados.
- Nome e descrição importados são mantidos. O catálogo completa somente os campos vazios. Divergências aparecem como avisos com campo, motivo e referência. A autocorreção não substitui texto personalizado nem decide alterações de regras da mesa.
- O custo exibido junto do círculo é somente leitura: 1, 3, 6, 10 ou 15 PM. Custos anteriores diferentes são preservados em Anotações para Magias. Isso representa o custo-base, não o custo final após poderes ou aprimoramentos.
- Os oito grupos de metadados de magia permanecem em uma linha. Em telas estreitas a rolagem horizontal fica restrita à linha. Efeito continua abaixo, em largura integral.
- Ao cadastrar manualmente uma magia, a seleção de seu nome completa campos vazios. O catálogo pode ser consultado pelo jogador fora do editor e pelo mestre em “Poderes e magias”.

## Migração e persistência

`BossBar.TextCatalogVersion` impede reimportações repetidas. O PDF conserva os textos originais em metadados `BossBar.Original.*`; os campos nativos são sincronizados com as novas categorias ao salvar. Texto não reconhecido é mantido nas anotações ou na categoria de revisão.

Perfis e fichas de encontros antigos usam a migração existente com cópia anterior preservada. Uma ficha Nimb antiga também recebe os dados estruturados no PDF, mesmo quando seu modelo visual já era o atual. PV/PM gastos e outras escolhas não são reinicializados durante migração. Apenas uma importação nova preenche os recursos atuais pelos máximos, conforme a regra já existente.

O resumo compartilhado do personagem passa a expor `catalogVersion`, `abilities` e `spells`, com identificadores de referência, categoria, origem documentada e texto. Isso permite futuras implementações utilizarem os mesmos registros sem reinterpretar PDFs. A projeção pública do combate continua selecionando explicitamente os dados permitidos.

## Exemplos e verificação

| Ficha enviada | Habilidades/poderes | Magias |
| --- | ---: | ---: |
| Furacão Imortal | 6 | 0 |
| Hudson | 17 | 11 |
| Thok | 26 | 23 |
| Pythagoras | 12 | 5 |

Os testes de conteúdo verificam todas as entradas desses quatro exemplos, a classificação, a preservação de descrições, preenchimento de cabeçalhos, custos, migração e reabertura sem duplicação. Os PDFs originais permanecem fora do repositório; os testes locais de aceitação usam `BOSSBAR_NIMB_EXAMPLES_DIRECTORY`. Os testes reproduzíveis incluem somente os campos textuais necessários dos exemplos, além da ficha Nimb sintética independente.

Exemplos de divergências sinalizadas: Orientação de Hudson informa execução/duração diferentes do Básico; Voz Divina de Thok informa alcance diferente; Bênção de Thok traz custo 0 PM, mantido nas anotações enquanto o custo-base exibido é 1 PM. “Código de Héroi” e “Símbolo Sagrado Abençoado” são reconhecidos como nomes alternativos e preservados para revisão.

Entradas: `src/shared/rules-catalog.ts`, `src/shared/character-sheet-content.ts`, `src/shared/data/t20-reference-catalog.json`. Interface compartilhada: `src/rules-catalog-dialog.ts`. Testes: `tests/rules-catalog.test.mjs`, `tests/e2e/web/rules-catalog.spec.ts` e as suítes de fichas Nimb.

O complemento de Conjurar Mortos-Vivos em Ameaças, p. 405, foi aprovado como referência opcional. Seus aprimoramentos aparecem em um painel próprio no catálogo, com a indicação do livro. A importação continua preenchendo o texto padrão do Básico; nenhum aprimoramento é incorporado automaticamente à ficha.

Validação final de 07/09/2026: ESLint, TypeScript e **242 testes unitários aprovados**. A seleção de testes Nimb e catálogo cobre 16 cenários distintos nos quatro navegadores (Chromium, Chrome, Edge e Firefox); após corrigir a espera do teste pela reabertura do editor, os oito casos de PDFs reais e catálogo passaram novamente. Os **dois testes selecionados de Electron** passaram sobre o build final, incluindo o complemento aprovado e a regressão do editor de RD. Capturas do catálogo do jogador/mestre e da linha de magias em desktop e tela estreita foram conferidas. Build web e empacotamento Windows concluídos; nenhum encontro ou perfil real foi alterado pelos testes.
