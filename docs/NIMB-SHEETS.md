# Fichas Nimb — modelo 3

Atualização de uso: [três fichas por acesso, revisão de avisos e exportação editável](CHARACTER-SHEETS-QOL.md).

Implementação de 07/09/2026, na continuidade da beta.4. O aplicativo usa o PDF `assets/ficha-t20-nimb.pdf`, cópia integral de `Ficha_Vazia_T20.pdf` fornecida por Brian. O modelo tem três páginas, 236 campos de formulário e 259 anotações nas páginas. As fichas preenchidas podem ter páginas adicionais; editar uma ficha Nimb preserva essas páginas.

## Importação e edição

- São aceitos PDFs editáveis exportados pelo Fichas de Nimb e o modelo editável antigo do BossBar. Uma importação do modelo antigo é convertida para Nimb antes da validação final.
- O editor apresenta os seis atributos diretos do Jogo do Ano. Os identificadores internos antigos (`ModFor`, por exemplo) são mantidos para compatibilidade com encontros e clientes; o campo antigo de escala 10–18 não é usado como atributo.
- A ordem das perícias de Nimb é mapeada explicitamente. Isso inclui os dois Ofícios, Pilotagem, Nobreza, Percepção e o campo nativo `tota23`.
- Os componentes de perícia separam o atributo escolhido, metade do nível, treinamento, outros bônus, tamanho e penalidade de armadura. O campo Outros do Nimb já inclui tamanho/penalidade; o adaptador separa esses termos uma única vez.
- Os totais de ataque importados do Nimb são separados em base da perícia e ajuste. Por exemplo, total +9 e Luta 6 tornam-se base 6 e ajuste +3. A base é somente leitura; o servidor usa a perícia da ficha aprovada. O ajuste aceita números e dados. A migração respeita a antiga indicação de bônus total, sem somar a perícia duas vezes.
- Abreviações de dano/alcance e críticos são reconhecidos. O antigo dano alternativo migra para a segunda arma, preservando nome, dano, crítico, tipo e alcance. Cada arma usa sua própria perícia, ajuste, teste e dano. Desmarcar Duas armas conserva os dados da segunda arma para futura edição.
- Habilidades, poderes, descrições, magias e anotações permanecem como texto editável. Cada campo longo aceita até 100.000 caracteres, com limite global de 2 MiB por envio/rascunho. Textos que excedam os limites são recusados com aviso; não há truncamento intencional.
- O texto das páginas adicionais geradas pelo Nimb também aparece no editor como referência do PDF. Isso inclui “Redução de Dano — Frio: 5” na quarta página de Pythagoras. A página original é preservada; alterações sobre esse conteúdo podem ser registradas em Anotações. A redução de dano não é executada automaticamente nesta etapa. Páginas com fontes, imagens ou estruturas diferentes do formato reconhecido são preservadas e pedem transcrição manual.
- O inventário usa espaços. A quantidade de um conjunto descrito numa linha, como “Flechas (20)”, é preservada como um conjunto. Editar uma linha sincroniza o texto correspondente no PDF. Linhas sem espaços também aparecem como itens, com espaços em branco e aviso para revisão. Os campos duplicados “Equipamento importado” e “Equipamento adicional” não aparecem mais na interface; seus dados continuam preservados no PDF. Excedentes acima de 100 itens permanecem no PDF e geram um aviso.
- Abrir, buscar ou filtrar a ficha não recalcula nem zera a carga importada. Mudanças explícitas de itens/quantidades podem recalculá-la; ambiguidades de unidade ou itens sem espaços exigem revisão antes disso.

Em uma nova importação, PV e PM atuais recebem seus valores máximos, inclusive se o PDF trouxer valores atuais diferentes. Um máximo ausente ou inválido exige revisão. Edição, correção, migração e reabertura de encontros preservam os recursos atuais. A identificação do jogador pode permanecer vazia no PDF, pois a conta já identifica o usuário.

## Migração automática e recuperação

Os perfis são migrados ao abrir o armazenamento do aplicativo ou iniciar a sala. Antes de publicar o PDF convertido, são gravados o PDF e os metadados originais no diretório do perfil:

```text
sheet-before-model-3-<sha256-abreviado>.pdf
sheet-before-model-3-<sha256-abreviado>.json
character-sheet-model-3-<sha256-abreviado>.pdf
```

O salvamento publica primeiro o arquivo novo, depois atualiza a referência do perfil. A cópia original permanece disponível. Uma falha em um perfil preserva sua ficha, registra o motivo e não impede os demais. O modelo e a versão das regras evitam repetir migrações concluídas.

Encontros salvos guardam suas próprias fichas. Ao carregar um encontro, a conversão conserva o PDF histórico em `sheetDocument.beforeModel3`, sem substituí-lo pela ficha atual da conta nem alterar os PV/PM, condições, recursos ou turnos do encontro. Ao salvar novamente o encontro, essa cópia acompanha o checkpoint.

Se um atributo-chave não estava identificado ou não correspondia ao bônus antigo, o bônus numérico permanece e a seleção fica “Revisar”. Pesos antigos não são convertidos automaticamente em espaços. O jogador deve rever itens e carga e confirmar “Revisei o equipamento e confirmei a carga em espaços” no painel da pendência de migração. Essa confirmação não ocupa a ficha permanentemente. Campos extras são conservados no campo adicional `BossBar.CanonicalData` do PDF, além da cópia original.

## Ajustes do editor de 07/09/2026

- Os rótulos aceitam quebra de linha. Atributo completo, Bônus total e Dano alternativo foram retirados. Cada armadura tem Limite do atributo: vazio significa sem limite; 0 impede bônus positivo; o nome de uma armadura conhecida sugere o limite do Livro Básico (pesadas: 0; pesadas de mitral: 2; leves: sem limite, pp. 152–153 e 167). O jogador pode alterá-lo, inclusive deixar vazio. Equipamentos desconhecidos conservam o limite importado para revisão manual.
- Armadura e escudo aparece após Defesa; Proficiências vem imediatamente depois. Cada equipamento tem seleção junto ao título e Informações adicionais sob o nome. Só uma armadura e um escudo podem ser selecionados. A troca altera os totais e preserva as demais linhas no PDF. Os campos adicionais são Outros: Defesa e Outros: Penalidade. Valores positivos no ajuste de penalidade reduzem a penalidade; negativos aumentam. A penalidade total é somente leitura e aparece junto ao título após um divisor.
- Cada ataque tem as opções Principal e Duas armas junto ao título. O teste mostra a base de Luta/Pontaria e o ajuste separados por divisor. A segunda arma tem uma linha própria; Informações adicionais encerra o ataque. O ataque principal é a seleção inicial no combate, e outra opção pode ser escolhida. Duas armas são incompatíveis com escudo equipado; o combate também verifica essa restrição para ataques alternativos.
- Na revisão de alinhamento, armadura e escudo passam a ter cabeçalhos, nomes, anotações e valores alinhados. Os cinco valores da armadura e os quatro do escudo permanecem em uma linha. As duas armas usam a mesma grade de oito campos: Arma, Perícia, Teste de ataque, Dano, Margem de crítico, Multiplicador, Tipo e Alcance. Teste de ataque é um único controle visual com base assinada somente leitura à esquerda e expressão editável à direita, separados por divisor. Telas estreitas usam rolagem horizontal local nas linhas; Informações adicionais permanece abaixo.
- Um ataque com duas armas consome uma ação padrão e produz testes independentes. Cada acerto libera seu dano em sequência; críticos são individuais. Penalidades e exceções de poderes continuam nos ajustes manuais. Recursos opcionais de teste afetam a primeira arma e são consumidos uma vez. Se a aplicação de um dano falhar, o dano pendente e sua rolagem são preservados para nova tentativa, sem devolver a ação nem repetir danos já aplicados.
- O tamanho em manobras fica junto ao deslocamento. A CD fica junto a Outros bônus de CD. Os metadados de cada magia permanecem em uma linha, e Círculo reúne o número editável e o custo-base somente leitura, separados por divisor.
- As moedas ficam junto ao título Itens, após um divisor. A moeda personalizada aceita nome e quantidade, sem conversão de valor para Tibares. Alterações na ficha vinculada seguem a proposta e a aprovação do mestre. A quantidade entra na contagem de moedas para carga em espaços, sem conversão monetária.
- “Anotações para Magias” reúne observações, origens de bônus de CD e demais informações relevantes. O campo separado da origem da CD foi retirado; seu texto anterior é anexado às anotações uma única vez.
- O círculo da magia determina o custo-base exibido em PM: 1, 3, 6, 10 ou 15, conforme a Tabela 4-1 do Livro Básico, p. 170. Custos anteriores diferentes permanecem nas anotações. O catálogo reconhece nomes de magias e completa campos vazios; não há gasto automático de PM.
- A revisão de regras do validador é `t20-jda-2026-09-r6`; o modelo PDF continua sendo Nimb 3.

## Validação e correção

O botão **Validar e corrigir cálculos** trabalha sobre o rascunho atual. A prévia retorna os campos corrigidos e as pendências; **Salvar e fechar** confirma o resultado pelo fluxo normal, incluindo a aprovação do mestre para alterações de uma ficha vinculada.

Cada pendência indica o campo, o motivo, o valor esperado quando determinável e a ação recomendada. O painel de revisão permite ir diretamente ao campo. Erros ficam vermelhos; avisos ficam destacados sem impedir a revisão manual. Falhas sem causa identificável informam erro inesperado. Quando a correção não resolve, o jogador é orientado a revisar os dados ou recriar a ficha pelo modelo vazio.

As correções automáticas tratam aritmética verificável e limites de PV/PM. Não escolhem atributos desconhecidos, não inventam PV/PM atuais e não atribuem bônus a poderes não implementados. Bônus importados de Defesa ou CD sem origem identificada são preservados em Outros e pedem justificativa. Diferenças na progressão de PV/PM ou excesso de carga são avisos: podem depender de escolhas, regras especiais ou informações ausentes.

## Fontes e escopo

O **Livro Básico — Jogo do Ano** permanece a base absoluta. Foram consultadas as regras pertinentes aos atributos, perícias e carga; o cálculo de perícias está na p. 114, Jogatina exige treinamento na p. 120, e carga em espaços está na p. 141 (numeração impressa). Uma perícia que exige treinamento mantém seu valor calculado, mas o requisito de uso continua separado.

O inventário de fontes está em [T20-REFERENCE-SOURCES.json](T20-REFERENCE-SOURCES.json), com nome, tamanho, número de páginas e SHA-256 dos seis manuais fornecidos. O catálogo textual compartilhado reúne 256 magias e 646 habilidades/poderes com páginas de referência. A cobertura por livro e os critérios de extração estão em [T20-TEXT-CATALOG.md](T20-TEXT-CATALOG.md).

Conforme a decisão de Brian, uma regra suplementar que altere a base deverá ser apresentada para revisão e aprovação manual. Se a aprovação manual não puder ocorrer, Brian autorizou aprovação automática como padrão. Nenhuma substituição de regra por suplemento foi aplicada nesta etapa; não há aprovação por tempo decorrido implementada.

Poderes, habilidades, magias e itens são importados e editados como dados. Habilidades/poderes são classificados nos campos de raça, origem, classe e poderes gerais; descrições personalizadas são preservadas e diferenças são sinalizadas. A execução de requisitos, interações e efeitos continua fora desta etapa. O complemento de Conjurar Mortos-Vivos em Ameaças, p. 405, foi aprovado para consulta opcional, mantendo o Básico como padrão da importação.

## Verificação

A revisão do catálogo textual (r5) passou em ESLint, TypeScript e 242 testes unitários. Os fluxos de importação, edição, migração e consulta foram confirmados em Chromium, Chrome, Edge e Firefox, incluindo as quatro fichas locais, layout de uma linha e reabertura. Os dois testes selecionados de Electron passaram, cobrindo catálogo, complemento opcional e regressão de RD. Os builds web e do pacote Windows foram concluídos.

Revisão de alinhamento de 07/09/2026: TypeScript e ESLint aprovados; 23 testes de ficha/perfil aprovados; 6 testes de navegador aprovados e 2 pulos previstos, em Chromium, Chrome, Edge e Firefox. As verificações medem alinhamento, alturas, oito campos por arma, colunas idênticas entre armas, ausência de quebra e persistência da expressão `+1d6 + 3 + 2d2`. Pacote Windows atualizado.

```powershell
npm.cmd run verify
npm.cmd run test:e2e:web
npm.cmd run test:e2e:electron
```

Para incluir as quatro amostras locais na matriz de navegador, sem copiá-las para o repositório:

```powershell
$env:BOSSBAR_NIMB_EXAMPLES_DIRECTORY = 'C:\Users\Brian\Downloads'
npm.cmd run test:e2e:web
```

Os testes usam perfis temporários e não alteram os PDFs originais nem as contas reais. As fixtures independentes exercitam campos nativos, reordenação das perícias, textos longos, página extra, inventário, migração, recuperação e preservação do estado do encontro.

Resultado da revisão de equipamento e duas armas em 07/09/2026: ESLint, TypeScript e 216 testes unitários aprovados; 27 testes selecionados de navegador aprovados, com 5 pulos previstos; 5 testes Electron aprovados. A matriz cobre Chromium, Chrome, Edge e Firefox, incluindo as quatro fichas reais, o ataque principal, duas rolagens e dois danos pela interface, aprovação de alterações e recuperação do rascunho. Os testes unitários também verificam falha de aplicação do segundo dano, preservação da rolagem, limite manual, troca de equipamento e migração de fichas que tinham apenas bônus totais.

Resultado histórico da revisão anterior do editor: ESLint, TypeScript e 211 testes unitários aprovados; 15 testes selecionados de navegador aprovados, com 5 pulos previstos; 5 testes Electron aprovados. O cenário de moeda confirmou tanto a rejeição quanto a aprovação pelo mestre.

Após a matriz, a disposição da segunda arma em largura de 390 pixels recebeu um ajuste de grade. O cenário de layout e aprovação passou novamente no Chromium; as capturas foram conferidas e o pacote Windows foi atualizado.

Resultado histórico da integração inicial em 07/09/2026:

- ESLint, TypeScript e 208 testes unitários aprovados.
- Matriz completa de navegador: 85 aprovados e 19 pulos previstos, incluindo as quatro amostras reais. Após os ajustes finais, os 8 casos específicos do Nimb passaram nos quatro navegadores; a última revisão de interface e escrita do PDF também passou nos 4 casos selecionados de Chromium.
- Empacotamento Windows concluído; os 5 testes Electron passaram sobre o pacote final.
- Importar, editar, salvar e reler as quatro amostras conserva os 236 campos nativos, os textos longos e as 3/3/3/4 páginas. O PDF vazio distribuído tem o mesmo SHA-256 do arquivo fornecido: `eca410aaeaf5153fefefb2ca9dbc7e2c23f14c7a7783f951d6d05078975a2d4a`.
- O editor foi inspecionado em desktop e em largura de 390 pixels; a primeira página exportada de Thok e a página adicional de Pythagoras também foram conferidas visualmente.


## RD, tamanho e rodapé (r4)

A ficha e o painel privado compartilham a planilha de RD por fonte, tipo e origem. Tamanho usa as seis categorias oficiais e atualiza Furtividade e manobras; a Defesa total é derivada. Itens usam duas colunas e as ações de validação/descarte ficam no rodapé. Consulte [DAMAGE-REDUCTION.md](DAMAGE-REDUCTION.md) para regras, migração, comportamento dos ataques e limites da automação.

## Campos compactos de ataque

A revisão visual r6 mantém avisos em painéis expansíveis abaixo das linhas compactas de Defesa, armas e valores de armaduras/escudos. Tamanho mantém apenas o seletor e seu título. O cartão do editor tem altura limitada à tela; a rolagem fica nas áreas de campos e avisos, preservando título e rodapé inclusive ao usar Ir ao campo.

As duas armas usam a mesma linha: Arma, Perícia, Teste de ataque, Dano, Origem, Crítico, Tipo e Alcance. Crítico reúne margem e multiplicador em um campo visual com divisor e indicação ×; ambos permanecem editáveis e conservam a validação individual. Origem fica imediatamente à direita de Dano. Os nomes canônicos de persistência não mudaram. O teste de edição cobre as duas armas, alinhamento, salvamento e reabertura dos valores de crítico e origem.

## Carga do equipamento selecionado (r6)

Verificação da r6: ESLint, TypeScript e **247 testes unitários** aprovados; **20 testes de navegador** aprovados em Chromium, Chrome, Edge e Firefox, incluindo os quatro PDFs reais, erros/avisos expandidos, rolagem até campos, linha de Defesa, carga, salvamento e reabertura; **2 testes Electron** aprovados. As capturas desktop e mobile foram conferidas. Build web e pacote Windows atualizados. Os testes usaram perfis temporários e preservaram os PDFs originais.

Por solicitação de Brian, a carga aplica uma **regra da mesa**: unidades de armadura/escudo selecionadas como equipadas e armas do ataque principal não contam. Em Duas armas, uma unidade de cada arma é descontada. O Básico, p. 141, continua sendo a referência de espaços e moedas; ele não determina essa isenção geral.

O vínculo usa o nome completo do item e do equipamento, ignorando maiúsculas, acentos e espaços duplicados, preservando diferenças em melhorias e detalhes. As unidades continuam no inventário; apenas sua contribuição para a carga é retirada. Cópias extras e armas de ataques não principais contam normalmente. Itens equipados mostram uma indicação compacta das unidades excluídas. Equipamento sem linha correspondente nos itens não é somado nem descontado de outro item.

Ao alterar seleção, nomes, quantidade, espaços ou moedas, editor e servidor usam o mesmo cálculo. Cópias homônimas com espaços diferentes exigem nomes distintos para identificar a unidade equipada; a carga anterior permanece até essa revisão. Itens não equipados sem espaços também pedem revisão. A primeira migração preserva o total importado em `BossBar.Original.CargaTotal`, registra `BossBar.InventoryLoadVersion` e recalcula quando há dados suficientes. As cópias de recuperação do PDF e os PV/PM gastos continuam preservados.
