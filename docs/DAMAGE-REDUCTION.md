# Redução de dano e tamanho — 7 de setembro de 2026

## Uso

Na ficha, **Defesa → Redução de dano**, ao lado de **Total**, abre a planilha. No painel privado do mestre, o mesmo editor está em **Alterar Perícias → Configurar redução de dano**. Aplicar RD confirma o rascunho da janela; salvar a ficha ou aplicar as perícias confirma a alteração no respectivo editor. Fichas vinculadas continuam passando pela aprovação do mestre.

A planilha possui cinco cabeçalhos fixos: **Geral, Físico, Elemental, Outros tipos e Origens**. Cada cabeçalho contém RD inteira entre 0 e 999, nome da fonte e exceções; começa em zero e não pode ser removido. Não há linhas extras por padrão. Selecione a categoria junto de **Adicionar fonte** para incluir uma linha com tipo, RD, fonte, nome e exceções. Linhas podem ser removidas; linhas de valor zero adicionadas explicitamente são preservadas. **Cancelar** descarta todas as alterações do rascunho.

Os 11 tipos são ácido, corte, eletricidade, essência, fogo, frio, impacto, luz, perfuração, psíquico e trevas. Os agrupamentos físicos (corte, perfuração e impacto), elementais (ácido, eletricidade, fogo e frio) e demais tipos são atalhos de configuração solicitados para esta interface. O cabeçalho Geral fornece a base universal. A base de Origens vale para todas as origens conhecidas — mundana, mágica, arcana e divina — e exige informar a origem do dano. Mágico, arcano, divino e mundano identificam a origem, separadamente do tipo: fogo de origem divina pode receber as proteções pertinentes a ambos.

## Cálculos e fontes

As bases dos cabeçalhos somam entre si e com as fontes aplicáveis, conforme a configuração solicitada para esta mesa. Esse acúmulo adicional é uma regra de configuração da interface, não uma nova regra atribuída ao Livro Básico. Exemplo: Geral 5 + Físico 3 + uma fonte Corte 2 resulta em RD 10 contra corte. O campo Fonte continua presente apenas nas linhas adicionadas, que seguem os acúmulos abaixo.

- Habilidades diferentes e perícias diferentes acumulam. Repetições da mesma habilidade/perícia, identificadas pelo nome normalizado, usam o maior efeito aplicável.
- Itens, magias, parceiros e ambiente usam o maior efeito aplicável de cada fonte. Os resultados dessas fontes diferentes acumulam entre si.
- As exceções pertencem a cada linha: em RD 10/mágico, dano mágico ignora aquela proteção; outras proteções continuam válidas.
- **Total já revisado** preserva valores cujas fontes já foram somadas, como a antiga RD numérica dos chefões. Ele funciona como um total mínimo das linhas, sem ser somado novamente às fontes discriminadas; as bases dos cabeçalhos são adicionadas depois. Para combinar uma RD antiga com novas proteções pelas regras de fonte, substitua o total anterior por suas fontes individuais. Exceções específicas de poderes e itens podem ser registradas como um total revisado, sem inferência automática pelo nome.
- A redução pode absorver todo o dano. Perda de vida e o comando explícito de ignorar RD passam sem redução. PV temporários só absorvem o dano restante.
- Um efeito em área resolve a resistência sobre o total, arredonda a metade para baixo e aplica RD uma vez; as parcelas visuais preservam o total exato. Ataques independentes e as duas armas aplicam RD separadamente por acerto.
- Em chamas usa dano de fogo nos chefões; sangramento e perda de PV por veneno ignoram RD. O painel aplica sempre as proteções configuradas do chefão; o checkbox de RD foi removido. Um antigo valor desmarcado não desativa mais o dano manual da interface.

Ataques das fichas e do arsenal permitem informar a **Origem do dano**, além do tipo existente. O dano manual do painel tem seletores **Tipo** e **Origem** ao lado de **Valor**, na mesma linha. Quando uma proteção exige um tipo ou origem ausente, os comandos de dano informam o campo a corrigir antes da aplicação. Uma expressão com parcelas de tipos diferentes deve ser aplicada separadamente nesta etapa; não há inferência de componentes pelo texto de poderes ou magias.

## Tamanho e organização da ficha

O tamanho tem seis opções oficiais. Furtividade/manobras: Minúsculo +5/−5; Pequeno +2/−2; Médio 0/0; Grande −2/+2; Enorme −5/+5; Colossal −10/+10. A seleção atualiza os campos derivados e Furtividade. Campos ausentes em fichas antigas são preenchidos quando o tamanho é conhecido; valores importados conflitantes continuam disponíveis para validação/correção.

O tamanho próprio das armas, o dano e o deslocamento são preservados. A ficha orienta a revisão das armas após trocar o tamanho. O Total de Defesa é somente leitura e é recalculado pelos componentes e pelo equipamento selecionado. Os valores de Defesa e o botão de RD ficam na mesma linha; em telas estreitas, há rolagem horizontal local. Um resumo compacto das proteções positivas e suas exceções aparece abaixo de Origem dos outros bônus de Defesa.

Itens aparecem em duas colunas, adaptando-se a uma coluna em telas estreitas. Validar e corrigir cálculos e Descartar importação ficam no rodapé, junto de Salvar e fechar.

## Referências e persistência

Base: Livro Básico — Jogo do Ano, páginas impressas 106–107 (tamanho), 226 (acúmulos e arredondamento), 228 (perda de vida), 229 (RD e exceções) e 230 (tipos de dano). A definição de RD também foi localizada em Ameaças de Arton, página 19 do PDF. A busca nos cinco suplementos fornecidos identificou a regra opcional **RD Combinada**, em Heróis de Arton, página 306 do PDF; ela não foi ativada. Os demais livros permanecem material de referência, sem implementação automática de seus catálogos de habilidades.

`src/shared/damage-reduction.ts` concentra tipos, validação e cálculo. `src/damage-reduction-editor.ts` é o editor compartilhado. As fichas usam `BossBar.RD` nos dados canônicos preservados no PDF; o resumo e o estado de combate recebem o perfil estruturado. Chefões, biblioteca, fases e checkpoints preservam `damageReductions`; o antigo escalar permanece compatível como total universal. O perfil versão 1 aceita `categories`, com as cinco bases independentes. Perfis anteriores continuam com suas entradas e regras de acúmulo intactas; os novos cabeçalhos aparecem zerados ao abrir o editor. A versão das regras da ficha é `t20-jda-2026-09-r4`.

Os manuais originais não são alterados nem incluídos no aplicativo.

## Verificação da entrega anterior

TypeScript e ESLint sem erros; 228 testes unitários aprovados. A matriz de Chromium, Chrome, Edge e Firefox aprovou 24 testes web (quatro casos de PDFs locais ficam desligados por padrão). Uma execução local adicional aprovou o caso dos quatro PDFs reais — Furacão Imortal, Hudson, Thok e Pythagoras — com importação, correção e reabertura. Os seis testes Electron passaram, incluindo a nova planilha, dano absorvido por completo, parcelas e gravação da RD na biblioteca. Após o ajuste final da altura da janela, os quatro testes web da RD e o teste Electron da RD passaram novamente. Pacote Windows atualizado e `git diff --check` sem problemas de espaço em branco.

## Ajustes dos cabeçalhos e do painel — verificação

ESLint e TypeScript aprovados; 231 testes unitários passaram. A matriz web de ficha, RD e combate passou em Chromium, Chrome, Edge e Firefox (24 aprovados; quatro casos de PDFs locais desativados por padrão). As verificações finais de remoção/cancelamento, posição do resumo e geometria da Defesa passaram nos quatro navegadores. No Electron, os cinco casos de regressão passaram; o caso de RD passou após corrigir um seletor ambíguo no próprio teste. Esse caso verifica dano manual com a preferência antiga desmarcada, absorção, parcelas e persistência na biblioteca. Capturas conferidas em 1280 px e 390 px; painel privado conferido em 1280 × 420. Executável Windows atualizado e diff sem erros de espaço em branco.

## Refinamento visual

A janela usa o tema escuro e dourado do aplicativo, categorias com contorno, destaque discreto para proteções ativas, totais compactos e rodapé com ação principal destacada. O botão × superior cancela o rascunho. A ajuda exibe um símbolo ?; clicar nele ou no texto alterna a explicação, com suporte a teclado. A área das categorias rola independentemente dos botões, inclusive no painel privado de 1280 × 420.

Verificação deste refinamento: ESLint, TypeScript e 231 testes unitários aprovados; 12 testes web nos quatro navegadores (quatro casos de PDFs locais desativados); dois testes Electron de RD e layout aprovados. Capturas de desktop, celular e painel privado conferidas. Executável Windows atualizado.

## Fontes nos totais — 12/09

O checkbox Imune ocupa o canto superior esquerdo dos cabeçalhos e das linhas, junto à faixa dos títulos. Os chips dos totais têm tooltip por cursor/foco com todas as fontes, bases, regras de acúmulo, piso revisado e proteções não aplicáveis. `damageReductionBreakdown` é usado tanto pela explicação quanto por `resolveDamageReduction`, evitando divergência entre apresentação e dano real. Referências dos livros têm apresentação distinta. O comportamento foi conferido no Chromium, Edge e Electron, inclusive em painel de pouca altura; veja a verificação atual em `CHARACTER-SHEETS-QOL.md`.
