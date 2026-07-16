# Recursos empacotados

Esta pasta contém as versões processadas usadas pelo aplicativo e pelo instalador.
Imagens e ícones podem ser referenciados diretamente pelo Vite. No aplicativo
empacotado, a pasta inteira também é copiada para `resources/assets`, fora do ASAR.
Assim, arquivos de áudio e vídeo adicionados futuramente podem usar streaming,
loop e busca temporal sem precisar alterar novamente o empacotamento.

As pastas `Imagens`, `Icones`, `Musica` e `SFX` na raiz são bibliotecas pessoais do
usuário e não entram no instalador. Não substitua os ícones processados daqui por
seus originais sem antes gerar novamente as versões transparentes e o arquivo
`.ico` do Windows.

Os 36 arquivos em `status-icons` são recortes transparentes derivados de
`Icones/Status.png` e `Icones/Status_Coringa.png`. O arquivo `cog.png` é a
versão empacotada, com centro transparente, de `Icones/cog.png`. Para recriar
esses recursos depois de substituir qualquer uma das fontes originais, execute
`npm.cmd run assets:status` a partir da raiz do projeto.
