# Additional audit of the core rules and explicit equipment/partner sources.
# Variants replace class abilities; sharing a parent class is not inheritance.
rules[:]=[r for r in rules if not (r['kind']=='class' and (r['owner'],r['name']) in [('Duelista','Audácia'),('Ventanista','Especialista')])]
class_effect('Atleta','Façanha Atlética',24,'*',book='heroes',options=list(range(2,42,2)),maxAttribute='FOR',maxMultiplier=2,condition='Façanha Atlética ativada neste teste')
class_effect('Alquimista','Pedra Filosofal',24,'Fortitude',book='heroes',level=20,roll='best',condition='De posse da pedra filosofal')
class_effect('Ventanista','Charme',44,'#NONATTACK',book='heroes',options=list(range(2,42,2)),maxAttribute='CAR',maxMultiplier=2,condition='Charme ativado neste teste')
class_effect('Ventanista','Virar a Casaca',45,'Furtividade',book='heroes',level=7,replaceSkill='Enganação',condition='Disfarce removido com Virar a Casaca; teste para esconder-se')
class_effect('Duelista','Duelo',28,'#ATTACK',book='heroes',options=list(range(2,6)),maximumByLevel=dict(base=2,start=1,every=5,step=1),condition='Contra o oponente escolhido para o duelo')
class_effect('Duelista','Escola de Duelo: Ambidestra',28,'Reflexos',2,book='heroes',level=2,condition='Escola Ambidestra escolhida; duas armas empunhadas, uma delas leve')
for name,skills in [('Distração Oportuna','Reflexos|Vontade'),('Efeito Dramático','#CAR'),('Impulso','Acrobacia|Atletismo')]:class_effect('Duelista','Truques de Capa: '+name,28,skills,5,book='heroes',level=4,condition='Truque de capa '+name+' ativado, usando uma capa adequada')
class_effect('Ermitão','Sítio Sagrado: Terreno Associado',30,'Furtividade|Percepção|Misticismo|Religião|Sobrevivência','SAB',book='heroes',level=3,minimumAmount=1,terrain=True,condition='No terreno registrado; indique qual terreno e o bônus correspondente')
class_effect('Machado de Pedra','Fúria',33,'Luta',book='heroes',options=list(range(2,7)),maximumByLevel=dict(base=2,start=1,every=5,step=1),condition='Fúria ativa; informe o bônus usado')
class_effect('Machado de Pedra','Machado de Pedra',33,'#ATTACK',1,book='heroes',condition='Ataque desarmado, natural ou com arma permitida pela habilidade')
class_effect('Magimarcialista','Magificação',34,'#ATTACK',2,book='heroes',every=5,start=1,condition='Pelo menos uma carga arcana e uma carga marcial disponíveis')
class_effect('Magimarcialista','Dança Defensiva',34,'#RES',book='heroes',level=3,options=[5,10],maximumByLevel=dict(base=5,start=3,every=4,step=5),condition='Dança Defensiva ativada; +10 exige Arte Sublime e carga adicional')
class_effect('Magimarcialista','Crescendo Vitorioso',34,'#ATTACK',book='heroes',level=20,options=list(range(1,21)),maxAttribute='CAR',condition='Informe a quantidade de cargas arcanas disponíveis')
class_effect('Necromante','Necrologia',35,'Cura|Fortitude',2,book='heroes',level=3,every=5,start=3)
class_effect('Necromante','Falar com Mortos',35,'Diplomacia',book='heroes',replaceSkill='Misticismo',condition='Mudar atitude ou persuasão contra morto-vivo')
class_effect('Santo','Ladainha de Combate',38,'#ATTACK',book='heroes',options=list(range(1,7)),maximumByLevel=dict(base=1,start=1,every=4,step=1),condition='Dentro da Ladainha de Combate ativa')
class_effect('Santo','Vaso do Espírito',38,'#RES','CAR',book='heroes',level=3,condition='Vaso do Espírito ativado neste teste')
class_effect('Inovador','Sequência Especial',31,'#ATTACK',book='heroes',options=list(range(1,11)),maximumByLevel=dict(base=2,start=1,every=4,step=2),condition='Informe o bônus acumulado na sequência ativa; armas alternadas')
class_effect('Vassalo','Baluarte',41,'#RES',book='heroes',options=list(range(2,12,2)),maximumByLevel=dict(base=2,start=1,every=4,step=2),condition='Baluarte ativo; informe o bônus escolhido')
class_effect('Vassalo','Suserano',42,'Diplomacia|Intimidação',5,book='heroes',condition='Lidando com vassalos do mesmo suserano de nível inferior ao seu')
class_effect('Vassalo','Montaria',42,'Adestramento|Cavalgar',5,book='heroes',level=5,condition='Teste com sua montaria de classe')
class_effect('Vassalo','Golpe Divino',42,'Luta','CAR',book='heroes',level=8,condition='Golpe Divino ativado neste ataque')
class_effect('Vassalo','Marquês: Governante',43,'#RES','CAR',book='heroes',level=13,condition='Caminho do Governante escolhido ao se tornar Lorde')
for r in rules:
 if r['kind']=='class' and r['owner']=='Caçador' and r['name']=='Explorador':
  for e in r['effects']:e['terrain']=True
race('Anão','Tradição de Heredrimm',20,'#ATTACK',2,condition='Ataque com machado, martelo, marreta ou picareta')
for name,page,skills,amount in [('Saque Rápido',129,'Iniciativa',2),('Dom Artístico',87,'Atuação',2),('Pajem',54,'Diplomacia',2),('Luz Sagrada',31,'Diplomacia|Intuição',2),('Sombras Profanas',31,'Enganação|Furtividade',2)]:power(name,page,skills,amount)
power('Tradição de Heredrimm',20,'#ATTACK',2,condition='Ataque com machado, martelo, marreta ou picareta')
power('Esgrima Mágica',44,'Luta',replaceSkill='Atuação',condition='Inspiração ativa; ataque corpo a corpo com arma leve ou de uma mão')
power('Alpinista Social',89,'Diplomacia',replaceSkill='Enganação')
power('Detetive',91,'Percepção|Intuição',replaceSkill='Investigação',condition='Detetive ativado nesta cena')
power('Contatos no Submundo',73,'Investigação',5,condition='Contatos estabelecidos nesta comunidade; teste para interrogar')
power('Escapista',73,'Acrobacia',5,condition='Escapar, passar por espaço apertado ou passar por inimigo')
power('Escapista',73,'#RES',5,condition='Resistir a efeito de movimento')
power('Montaria',55,'Adestramento|Cavalgar',5,condition='Teste com sua montaria de classe')
power('Espreitar',51,'*',options=list(range(1,14)),condition='Contra a presa marcada; informe o bônus da Marca da Presa, dobrado se Inimigo se aplicar')
power('Postura de Combate: Muralha Intransponível',54,'Reflexos',options=list(range(1,12)),condition='Postura ativa com escudo; informe o bônus da versão ativada')
power('Língua de Prata',80,'#CAR','halfLevel',condition='Língua de Prata ativada para este teste')
power('Ao Sabor do Destino',130,'*',2,choose='DESTINY',condition='Nenhum item mágico usado voluntariamente nesta aventura, exceto poções')
class_effect('Ladino','A Pessoa Certa para o Trabalho',74,'Acrobacia|Atletismo|Atuação|Cavalgar|Conhecimento|Diplomacia|Enganação|Furtividade|Iniciativa|Intimidação|Intuição|Investigação|Jogatina|Ladinagem|Ofício|Percepção|Pilotagem|Reflexos',10,level=20,condition='Habilidade de 20º nível ativada neste teste')
class_effect('Ladino','A Pessoa Certa para o Trabalho',74,'#ATTACK',10,level=20,condition='Habilidade de 20º nível ativada em ataque furtivo')
for name,page,options in [('Gritar Ordens',80,list(range(1,21))),('Comandar',130,[1]),('Inspiração',44,list(range(1,6))),('Baluarte',53,list(range(2,12,2)))]:
 label='Efeito recebido: '+name
 add('optional',label,label,'core',page,effects=[effect('#RES' if name=='Baluarte' else '*',0,options=options,condition='Benefício recebido de um aliado; informe a fonte, a situação e o valor aprovado')])
power('Familiar (Gato)',38,'Furtividade',2,stack='partner')
power('Familiar (Corvo)',38,'Misticismo|Vontade',roll='best',condition='Familiar corvo presente; benefício ativado neste teste')
power('Familiar (Rato)',38,'Fortitude',attribute='CAST',stack='partner')
power('Determinação Inabalável',68,'#RES',2,book='heroes',condition='Metade ou menos dos PV máximos')
for r in rules:
 if r['name']=='Xadrez de Batalha':
  for e in r.get('effects',[]):e['amount']='chess'
 if r['name'] in ['Luz Sagrada','Sombras Profanas']:r['page']=31
 if r['name']=='Comandar':
  for e in r.get('effects',[]):e['condition']='Comandar recebido de outro personagem nesta cena'

def item(name,page,skills,amount=0,condition='Item vestido ou empunhado para este teste',**kw):
 return add('item',name,name,'core',page,effects=[effect(skills,amount,condition=condition,**kw)])
for name,skills in [('Bandana','Intimidação'),('Camisa Bufante','Atuação'),('Capa Esvoaçante','Enganação'),('Capa Pesada','Fortitude'),('Gorro de Ervas','Vontade'),('Luva de Pelica','Ladinagem'),('Manto Eclesiástico','Religião'),('Robe Místico','Misticismo'),('Sapatos de Camurça','Acrobacia'),('Tabardo','Diplomacia'),('Veste de Seda','Reflexos')]:item(name,159,skills,1)
item('Símbolo Sagrado',157,'#RES',1,condition='Símbolo vestido ou empunhado, da divindade da qual é devoto')
item('Coleção de Livros',158,'Conhecimento|Guerra|Misticismo|Nobreza|Religião',1,choose=1,condition='Consultando a coleção ligada à perícia escolhida')
item('Luneta',158,'Percepção',5,condition='Observando em alcance longo ou além com a luneta')
item('Andrajos de Aldeão',159,'Investigação',2,condition='Vestindo andrajos, ao interrogar')
item('Andrajos de Aldeão',159,'#CAR',-2,condition='Vestindo andrajos, contra pessoa que valoriza classe social')
item('Casaco Longo',159,'Fortitude',5,condition='Vestindo o casaco, contra efeito de frio')
item('Casaco Longo',159,'Acrobacia|Furtividade|Ladinagem',-2,condition='Vestindo o casaco; penalidade de armadura ainda não incluída em Outros')
item('Enfeite de Elmo',159,'#RES',2,condition='Elmo vestido, contra medo')
item('Farrapos de Ermitão',159,'Adestramento',2)
item('Farrapos de Ermitão',159,'Diplomacia',-2)
item('Farrapos de Ermitão',159,'Investigação',-2,condition='Vestindo os farrapos, ao interrogar')
item('Manto Camuflado',159,'Furtividade',2,condition='Manto vestido no terreno para o qual foi feito')
item('Melhoria: Aprimorado',164,'*',0,choose=1,options=[1,2,3,4,5,6],condition='Informe o bônus TOTAL do item na perícia, já incluindo +1 por Aprimorado; outros itens não acumulam')
item('Melhoria: Banhado a Ouro',164,'Diplomacia',options=[-2,2],condition='Item ostentado; escolha -2 se o alvo despreza ostentação, ou +2')
item('Melhoria: Cravejado de Gemas',164,'Enganação',2)
item('Melhoria: Discreto',164,'Ladinagem',5,condition='Ocultar o item discreto')
item('Melhoria: Macabro',165,'Intimidação',2)
item('Melhoria: Macabro',165,'Diplomacia',-2)
item('Melhoria: Equilibrada',165,'Luta',2,condition='Manobra com a arma equilibrada')
item('Melhoria: Certeira',164,'#ATTACK',1,condition='Ataque com a arma certeira; bônus ainda não incluído no ajuste da arma')
item('Melhoria: Pungente',166,'#ATTACK',2,condition='Ataque com a arma pungente; bônus ainda não incluído no ajuste da arma')
item('Melhoria: Selada',166,'#RES',1,condition='Armadura ou escudo selado equipado')
# These sources require explicit registration and master approval. No partner is spawned.
for tier,amount,count in [('Iniciante',2,2),('Veterano',2,3),('Mestre',4,3)]:
 name='Parceiro Ajudante: '+tier
 add('optional',name,name,'core',260,effects=[effect('#NONATTACK',amount,choose=count,stack='partner',condition='Parceiro presente e auxiliando o personagem')])
for tier,amount in [('Iniciante',2),('Veterano',3),('Mestre',4)]:
 name='Parceiro Combatente: '+tier
 add('optional',name,name,'core',261,effects=[effect('#ATTACK',amount,stack='partner',condition='Parceiro presente e auxiliando o personagem')])
for name,skills in [('Perseguidor','Percepção|Sobrevivência'),('Vigilante','Percepção|Iniciativa')]:
 name='Parceiro '+name
 add('optional',name,name,'core',261,effects=[effect(skills,2,stack='partner',condition='Parceiro presente e auxiliando o personagem')])
add('optional','Parceiro Guardião: Mestre','Parceiro Guardião: Mestre','core',261,effects=[effect('#RES',2,stack='partner',condition='Parceiro presente e auxiliando o personagem')])

# Final cross-check against skills mentioned by powers and spell improvements.
power('Força Indomável',42,'Atletismo','classLevel',condition='Força Indomável ativada antes de conhecer o resultado do teste')
class_effect('Guerreiro','Ataque Especial',65,'#ATTACK',options=[4,8,12,16,20],includeHalfOptions=True,maximumByLevel=dict(base=4,start=1,every=4,step=4),condition='Bônus destinado ao teste de ataque; os valores pela metade dividem o benefício igualmente com dano. Ajuste dano e gasto de PM manualmente')
power('Sangue dos Inimigos',42,'#ATTACK',options=list(range(1,21)),maximumByLevel=dict(base=1,start=1,every=1,step=1),condition='Em fúria; informe os acertos críticos e inimigos reduzidos a 0 PV nesta cena')
power('Mão na Boca',74,'Luta',2,condition='Manobra de agarrar')
power('Até Acertar',76,'Luta',options=list(range(2,102,2)),condition='Ataque desarmado contra o mesmo alvo; +2 por erro consecutivo, até acertar ou encerrar a cena')
power('Julgamento Divino: Vindicação',83,'#ATTACK',options=[1,2,3,4,5],maximumByLevel=dict(base=1,start=0,every=5,step=1),condition='Ataque contra o alvo marcado por Vindicação')
power('Julgamento Divino: Vindicação',83,'#ATTACK',-5,condition='Ataque contra OUTRO alvo enquanto Vindicação está ativa')
power('Estilo de Arremesso',125,'Pontaria',2,requiresAbilities=['Saque Rápido'],condition='Ataque com arma de arremesso, possuindo Saque Rápido')
power('Curandeira Perfeita',133,'Cura',options=[2,5],condition='Usando maleta de medicamentos: +2 normal ou +5 aprimorada')
power('Percepção Temporal',134,'#ATTACK|Reflexos','SAB',capAmountByClassLevel=True,condition='Percepção Temporal ativa nesta cena')
add('optional','Efeito recebido: Oficina de Campo','Efeito recebido: Oficina de Campo','core',70,effects=[effect('#ATTACK',1,condition='Ataque com a arma que recebeu manutenção hoje')])
for r in rules:
 if r['kind']=='class' and r['name']=='Fúria' and r['owner'] in ['Bárbaro','Machado de Pedra']:
  for e in r.get('effects',[]):e['doubleFromLevel']=20

def skillspell(name,page,skills,amount=0,book='core',**kw):
 return add('spell',name,name,book,page,effects=[effect(skills,amount,**kw)])
skillspell('Acalmar Animal',178,'Adestramento|Diplomacia',10,condition='Teste contra o alvo acalmado, sem hostilidade posterior')
skillspell('Caminhos da Natureza',183,'Sobrevivência',5,condition='Truque ativo, para se orientar')
skillspell('Localização',197,'Sobrevivência',5,condition='Truque ativo, para se orientar')
skillspell('Luz',197,'Diplomacia',10,condition='Halo divino do aprimoramento de +5 PM ativo')
skillspell('Controlar a Gravidade',186,'Atletismo',20,condition='Efeito Reduzir ativo, ao escalar ou saltar')
skillspell('Controlar a Gravidade',186,'#ATTACK',-2,condition='Levitando sob o efeito Reduzir')
for name,page,variants,condition in [
 ('Comunhão Com a Natureza',184,[f'{n}d{s}' for s in [4,6,8] for n in [2,4,6]],'Em área natural; escolha dados de auxílio disponíveis conforme o círculo e aprimoramentos. Registre o consumo manualmente'),
 ('Contato Extraplanar',186,[f'{n}d{s}' for s in [6,12] for n in [1,2,3]],'Escolha dados de auxílio disponíveis conforme o círculo e aprimoramentos. Registre o consumo e a perda eventual de PM manualmente')]:
 skillspell(name,page,'*',options=list(range(1,len(variants)+1)),diceValues={str(i+1):d for i,d in enumerate(variants)},condition=condition)
skillspell('Desfazer Engenhoca',253,'Misticismo',book='heroes',options=list(range(5,105,5)),condition='Aprimoramento ativo: +5 por vez que viu a engenhoca ser usada nesta cena')
skillspell('Punho de Mitral',255,'Luta',book='heroes',options=[1,2],condition='Ataque desarmado com a mão transformada, sem segurar nada')
skillspell('Toque do Horizonte',255,'#ATTACK',book='heroes',options=[1,2,3,4,5],stack='item',condition='Dentro do alcance original da arma; bônus de encanto limitado pelo círculo disponível ao conjurador')
skillspell('Arma de Jade',60,'#ATTACK',book='gods',options=list(range(1,11)),stack='item',condition='Arma afetada; bônus limitado pelo círculo disponível, dobrado somente contra espíritos')
skillspell('Arsenal de Allihanna',60,'#ATTACK',book='gods',options=[1,2,3,4,5],stack='item',condition='Arma invocada nas mãos do conjurador; bônus limitado pelo círculo disponível')
skillspell('Couraça de Allihanna',60,'Furtividade',5,book='gods',condition='Aprimoramento de folhas e galhos ativo')
skillspell('Couraça de Allihanna',60,'#RES',book='gods',options=[2,3,4,5],stack='item',condition='Aprimoramento de resistência ativo; use o bônus concedido à Defesa pelo encanto')
skillspell('Euforia de Valkaria',61,'#ATTACK',book='gods',options=[1,2,3,4,5],condition='Em desvantagem: dobro de inimigos ou ND superior; bônus limitado pelo círculo disponível')
skillspell('Euforia de Valkaria',61,'Vontade',5,book='gods',condition='Versão de reação ativa nesta rodada')
skillspell('Infortúnio de Sszzaas',62,'#RES',book='gods',options=[-2,-3,-4,-5],choose=1,condition='Resistência originalmente mais baixa do alvo; escolha a penalidade da maldição ativa')
skillspell('Infortúnio de Sszzaas',62,'*',2,book='gods',condition='Cristal de memórias consumido ao resolver uma busca')
skillspell('Sorriso da Fortuna',64,'Jogatina',book='gods',roll='best',condition='Jogo mundano; um uso disponível da magia, sem o aprimoramento de número da sorte')
skillspell('Sorriso da Fortuna',64,'Jogatina',book='gods',roll='worst',condition='Alvo da versão de reação que confunde o jogador')
skillspell('Sorriso da Fortuna',64,'*',book='gods',roll='best',condition='Aprimoramento de devoto de Hyninn, primeiro teste da perícia na cena')
