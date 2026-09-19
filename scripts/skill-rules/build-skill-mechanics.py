from pathlib import Path
import json,re,unicodedata
repo=Path(__file__).resolve().parents[2]
rules=[]
key=lambda x:re.sub('[^a-z0-9]','',unicodedata.normalize('NFD',x.lower()).encode('ascii','ignore').decode())
def add(kind,owner,name,book,page,**kw):
 identifier=f'{book}:{kind}:{key(owner)}:{key(name)}'
 previous=next((r for r in rules if r['id']==identifier),None)
 if previous:
  previous.setdefault('effects',[]).extend(kw.pop('effects',[]));previous.update(kw);return previous
 r=dict(id=identifier,kind=kind,owner=owner,name=name,sourceId=book,page=page,**kw);rules.append(r);return r
def effect(skills,amount=0,**kw):return dict(skills=skills.split('|'),amount=amount,**kw)
def race(owner,name,page,skills='',amount=0,book='core',**kw):return add('race',owner,name,book,page,effects=[effect(skills,amount,**kw)] if skills else [])
def grant(kind,owner,name,book,page,names,count=1,**kw):return add(kind,owner,name,book,page,grant=dict(allowed=names.split('|'),count=count,**kw))
def power(name,page,skills,amount=0,book='core',**kw):return add('ability',name,name,book,page,effects=[effect(skills,amount,**kw)])

# Fixed training is distinct from freely selected training and from numeric bonuses.
for owner,name,book,page,names,count,minimum in [
 ('Humano','Versátil','core',19,'*',2,1),('Kliren','Híbrido','core',28,'*',1,None),('Osteon','Memória Póstuma','core',29,'*',1,0),
 ('Meio-Orc','Adaptável','threats',31,'*',1,None),('Ceratops','Papel Tribal','threats',265,'Cura|Intimidação|Ofício|Sobrevivência',1,None),
 ('Yidishan','Natureza Orgânica','threats',300,'*',1,0),('Hobgoblin','Arte da Guerra','threats',84,'Guerra',1,None),
 ('Galokk','Infância entre Pequenos','heroes',13,'*',1,None),('Mashin','Chassi Mashin','threats',160,'*',2,1)]:
 grant('race',owner,name,book,page,names,count,**({'minimum':minimum} if minimum is not None else {}))

for owner,name,page,skills,amount in [('Elfo','Sentidos Élficos',22,'Misticismo|Percepção',2),('Goblin','Rato das Ruas',23,'Fortitude',2),('Hynne','Pequeno e Rechonchudo',27,'Enganação',2),('Aggelus','Luz Sagrada',30,'Diplomacia|Intuição',2),('Sulfure','Sombras Profanas',30,'Enganação|Furtividade',2)]:race(owner,name,page,skills,amount)
race('Anão','Conhecimento das Rochas',20,'Percepção|Sobrevivência',2,condition='No subterrâneo')
race('Goblin','Engenhoso',23,'*',2,condition='Teste com ferramenta apropriada')
race('Lefou','Cria da Tormenta',24,'#RES',5,condition='Resistência contra lefeu ou Tormenta')
race('Lefou','Deformidade',24,'*',2,choose=2,minimum=1)
race('Hynne','Pequeno e Rechonchudo: Atletismo',27,'Atletismo',attribute='DES')
race('Kliren','Vanguardista',28,'Ofício',2,choose=1)
race('Kliren','Engenhosidade',28,'#NONATTACK','INT',condition='Engenhosidade ativada para este teste')
race('Medusa','Natureza Venenosa',28,'#RES',5,condition='Resistência contra veneno')
race('Trog','Reptiliano',31,'Furtividade',5,condition='Sem armadura ou roupas pesadas')
race('Duende','Tabu',10,'Diplomacia|Iniciativa|Luta|Percepção',-5,book='heroes',choose=1)
race('Eiradaan','Magia Instintiva',12,'Misticismo',book='heroes',attribute='SAB')
race('Eiradaan','Canção da Melancolia',12,'Vontade',book='heroes',condition='Resistência contra efeito mental',roll='worst')
race('Galokk','Meio-Gigante',13,'Intimidação',book='heroes',attribute='FOR')
race('Meio-Elfo','Entre Dois Mundos',14,'#CAR',1,book='heroes')
race('Sátiro','Festeiro Feérico',15,'Atuação|Fortitude',2,book='heroes')
race('Sátiro','Pernas Caprinas',15,'Atletismo',book='heroes',attribute='DES')
power('Língua da Natureza',10,'Adestramento|Sobrevivência',2,book='heroes')
power('Mais Lá do que Aqui',10,'Furtividade',5,book='heroes',condition='Presente ativado')

for owner,name,page,skills,amount in [
 ('Meio-Orc','Adaptável',31,'Intimidação',2),('Orc','Vigor Brutal',33,'Fortitude',2),('Ogro','Camada de Ingenuidade',40,'Intuição|Vontade',-5),
 ('Hobgoblin','Metalurgia Hobgoblin',84,'Ofício (armeiro)',2),('Hobgoblin','Táticas de Guerrilha',84,'Furtividade',2),('Nezumi','Pequeno, Mas Não Metade',162,'Intimidação',2),
 ('Tengu','Espírito Corvino',164,'Percepção',2),('Minauro','Mente Aberta',175,'Diplomacia|Investigação',2),('Kobolds','Praga Monstruosa',183,'Sobrevivência',2),
 ('Harpia','Cria de Masmorra',201,'Intimidação|Sobrevivência',2),('Pteros','Sentidos Rapinantes',267,'Percepção|Sobrevivência',2),('Velocis','Sentidos Selvagens',268,'Sobrevivência',2),
 ('Voracis','Rainha da Selva',270,'Atletismo',2),('Voracis','Sentidos Selvagens',270,'Sobrevivência',2),('Nagah','Inocência Dissimulada',333,'Enganação',2),('Finntroll','Presença Arcana',339,'Misticismo',2),
 ('Moreau (Coruja)','Espreitador',304,'Percepção|Vontade',2),('Moreau (Serpente)','Arborícola',304,'Furtividade',2),('Moreau (Serpente)','Instintos Traiçoeiros',304,'Diplomacia',2),
 ('Moreau (Coelho)','Senso de Preservação',304,'Percepção|Reflexos',2),('Moreau (Crocodilo)','Predador Aquático',304,'Furtividade',2),('Moreau (Gato)','Sentidos Felinos',305,'Furtividade|Percepção',2),
 ('Moreau (Leão)','Sentidos da Realeza',305,'Intimidação|Percepção',2),('Moreau (Morcego)','Criatura da Noite',305,'Furtividade|Percepção',2)]:race(owner,name,page,skills,amount,book='threats')
for owner,name,page in [('Meio-Orc','Criatura das Profundezas',31),('Orc','Habitante das Cavernas',33)]:race(owner,name,page,'Percepção|Sobrevivência',2,book='threats',condition='No subterrâneo')
for owner,name,page,skills,attribute in [('Bugbear','Saborear Pavor',79,'Intimidação','FOR'),('Kaijin','Terror Vivo',157,'Intimidação','FOR'),('Ceratops','Paquidérmico',265,'Intimidação','FOR'),('Velocis','Velocista da Planície',268,'Atletismo','DES'),('Moreau (Búfalo)','Marrada Impressionante',304,'Intimidação','FOR'),('Moreau (Urso)','Abraço de Urso',305,'Intimidação','CON')]:race(owner,name,page,skills,book='threats',attribute=attribute)
race('Moreau (Gato)','As Muitas Vidas de um Gato',305,'Acrobacia','CAR',book='threats')
race('Moreau (Raposa)','Esperteza Vulpina',304,'#INT|#CAR',2,book='threats',choose=2)
race('Tabrachi','Saltador',37,'Atletismo',10,book='threats',condition='Atletismo para saltar')
race('Kaijin','Cria da Tormenta',157,'#RES',5,book='threats',condition='Resistência contra lefeu ou Tormenta')
race('Nezumi','Pequeno, Mas Não Metade: medo',162,'#RES',5,book='threats',condition='Medo de uma criatura maior')
race('Centauro','Ginete Natural: cavaleiro',105,'*',-2,book='threats',condition='Carregando um cavaleiro')
race('Elfo-do-mar','Cria das Águas',316,'Furtividade|Sobrevivência',2,book='threats',condition='Dentro da água')
race('Elfo-do-mar','Arsenal do Oceano',316,'#ATTACK',2,book='threats',condition='Ataque com arpão, rede ou tridente')
race('Velocis','Velocista da Planície: testes',268,'Atletismo',book='threats',condition='Atletismo para correr ou saltar',roll='best')
race('Moreau (Coelho)','Pé de Coelho',304,'#DES',book='threats',condition='Pé de Coelho ativado (exceto ataques)',roll='best',exclude=['Luta','Pontaria'])
race('Moreau (Hiena)','Destemor',304,'#RES',2,book='threats',condition='Resistência contra criatura maior')
race('Nagah','Inocência Dissimulada: substituição',333,'#INT|#SAB|#CAR',book='threats',condition='Inocência Dissimulada ativada',replaceSkill='Enganação')
race('Nagah','Fraquezas Ofídicas',333,'#RES',-5,book='threats',condition='Resistência contra Música de bardo')
race('Finntroll','Presença Arcana: resistência',339,'#RES',2,book='threats',condition='Resistência contra magia')
race('Kobolds','Ajuntamento Escamoso',183,'#RES',book='threats',condition='Efeito de alvo único que não causa dano',roll='best')
power('Caminho da Perfeição',160,'*',2,book='threats',choose=1,trained=True)
power('Pernas Aprimoradas',161,'Atletismo',5,book='threats',condition='Maravilha mecânica ativada')

for place,page,skills,amount in [('Nivenciuén',36,'Misticismo',2),('Odisseia',36,'Iniciativa|Percepção',2),('Ordine',36,'Intuição|Investigação',2),('Sora',37,'Nobreza|Vontade',2),('Terápolis',37,'Intuição|Vontade',2),('Venomia',37,'Enganação',2)]:race('Suraggel ('+place+')','Herança de '+place,page,skills,amount,book='gods')
race('Suraggel (Deathok)','Herança de Deathok',36,'*',2,book='gods',choose=2)
race('Suraggel (Ramknal)','Herança de Ramknal',36,'Acrobacia|Enganação|Furtividade|Jogatina|Ladinagem',5,book='gods',choose=2,condition='Herança ativada neste teste')
race('Suraggel (Serena)','Herança de Serena',37,'#RES',2,book='gods',condition='Oponente não prejudicado por você nesta cena')
race('Suraggel (Skerry)','Herança de Skerry',37,'Ofício',book='gods',condition='Herança ativada para receber treinamento',train=True,choose=1)
for place,when in [('Solaris','Durante o dia'),('Sombria','Durante a noite')]:race('Suraggel ('+place+')','Herança de '+place,37,'*',1,book='gods',condition=when+'; informe 1, ou 2 na condição especial do livro',options=[1,2])
race('Suraggel (Ordine)','Herança de Ordine: sem rolagem',36,'*',2,book='gods',condition='Escolheu 0, 10 ou 20 no teste')
race('Suraggel (Sora)','Herança de Sora: estendidos',37,'*',2,book='gods',condition='Teste estendido ou perigo complexo')
race('Suraggel (Werra)','Herança de Werra',37,'#ATTACK',1,book='gods',condition='Ataque com arma')

# Special origins grant all listed skills. Duplicate grants allow another CLASS skill.
origins={
 'heroes':{
 47:{'Bacharel':'Conhecimento|Diplomacia|Nobreza','Boticário':'Cura|Ofício (alquimista)','Caçador de Ratos':'Furtividade|Investigação|Sobrevivência'},
 48:{'Carpinteiro de Guilda':'Ofício (artesão)','Catador da Catástrofe':'Fortitude|Percepção','Chef Hynne':'Ofício (cozinheiro)'},
 49:{'Cirurgião-Barbeiro':'Cura|Ofício (barbeiro)','Citadino Abastado':'Nobreza|Ofício','Cocheiro':'Adestramento|Pilotagem'},
 50:{'Construtor':'Fortitude|Ofício (pedreiro)','Contrabandista':'Enganação|Ladinagem','Coureiro':'Fortitude|Ofício (coureiro)'},
 51:{'Escriba':'Conhecimento|Ofício (escriba)','Espião':'Enganação|Ladinagem','Ferreiro Militar':'Ofício (armeiro)','Freira':'Cura'},
 52:{'Goradista':'Ofício (cozinheiro)','Insciente':'Sobrevivência','Interrogador':'Intimidação|Investigação'},
 53:{'Ladrão de Túmulos':'Ladinagem|Sobrevivência','Menestrel':'Atuação'},
 54:{'Padeiro':'Ofício (cozinheiro)','Pescador':'Ofício (pescador)|Sobrevivência'},
 55:{'Servo':'Diplomacia|Ofício (serviçal)'}},
 'atlas':{
 470:{'Agricultor Sambur':'Adestramento|Sobrevivência','Amazona de Hippion':'Cavalgar','Amoque Púrpura':'Intimidação','Anão de Armas':'Ofício (armeiro)','Aprendiz de Drogadora':'Cura|Ofício (alquimista)'},
 471:{'Aristocrata Dai’zenshi':'Nobreza','Armeiro Armado':'Ofício (armeiro)','Assistente Forense':'Investigação','Bandoleiro da Fortaleza':'Furtividade|Intimidação','Barão Arruinado':'Nobreza','Catador da Cidade Velha':'Fortitude|Percepção'},
 473:{'Desertor da Supremacia':'Guerra'},
 474:{'Escudeiro da Luz':'Nobreza','Escudeiro Solitário':'Enganação|Ladinagem'},
 475:{'Estudante do Colégio Real':'Cura','Filhote da Revoada':'Acrobacia|Pilotagem','Ginete de Tumarkhân':'Cavalgar','Grumete Pirata':'Acrobacia|Atletismo|Reflexos'},
 476:{'Legionário':'Guerra','Lenhador de Tollon':'Ofício (artesão)','Liricista de Lenórienn':'Atuação','Membro do Principado':'Diplomacia|Intuição','Nobre Zakharoviano':'Ofício (armeiro)'},
 477:{'Prisioneiro das Catacumbas':'Percepção|Reflexos','Profeta do Akzath':'Religião','Rebelde Agitador':'Iniciativa'},
 478:{'Recruta da Fênix':'Cavalgar','Sábio Matemático':'Conhecimento','Selvagem Sanguinário':'Sobrevivência','Sucateiro de Batalhas':'Guerra|Investigação','Tamalu':'Diplomacia|Nobreza','Tocado pela Dama Altiva':'Adestramento'},
 479:{'Tocado pelo Indomável':'Atletismo'}}}
for book,pages in origins.items():
 for page,entries in pages.items():
  for owner,names in entries.items():
   for name in names.split('|'):grant('origin',owner,'Benefício: '+name,book,page,name,duplicate='class')
def origin(owner,page,skills,amount=0,book='heroes',name='Benefício',**kw):return add('origin',owner,name,book,page,effects=[effect(skills,amount,**kw)])
for owner,page,skills,amount,book in [
 ('Mensageiro',53,'#RES',2,'heroes'),('Pedinte',54,'Enganação|Furtividade',2,'heroes'),('Pescador',54,'Iniciativa',2,'heroes'),
 ('Aprendiz de Dragoeiro',470,'Reflexos',2,'atlas'),('Criado pelas Voracis',472,'Sobrevivência',2,'atlas'),('Descendente colleniano',473,'Percepção',2,'atlas'),
 ('Duyshidakk Infiltrado',474,'Furtividade|Vontade',2,'atlas'),('Estandarte Vivo',474,'Sobrevivência',2,'atlas'),('Explorador de Ruínas',475,'Ladinagem|Percepção|Reflexos',2,'atlas'),
 ('Insurgente Tapistano',476,'#RES',1,'atlas'),('Liricista de Lenórienn',476,'Atuação',2,'atlas'),('Nômade Sar-Allan',476,'Fortitude|Sobrevivência',2,'atlas'),('Pescador Parrudo',477,'Atletismo|Fortitude|Sobrevivência',2,'atlas'),('Tradicionalista Svalano',479,'Fortitude|Vontade',1,'atlas'),('Trapaceiro Ahleniense',479,'Enganação|Furtividade',2,'atlas')]:origin(owner,page,skills,amount,book)
for owner,page,skills,amount,book,condition in [
 ('Caçador de Ratos',47,'*',2,'heroes','Contra criatura duas categorias de tamanho menor'),('Carcereiro',48,'#RES',2,'heroes','Contra efeito mental'),('Carcereiro',48,'*',2,'heroes','Teste contra Enganação, Furtividade ou Intimidação'),('Contrabandista',50,'Ladinagem',5,'heroes','Esconder itens em si ou veículo'),('Cocheiro',49,'#RES',2,'heroes','Conduzindo um veículo'),
 ('Insciente',52,'#RES',5,'heroes','Resistência contra magia'),('Ladrão de Túmulos',53,'*',2,'heroes','Teste contra morto-vivo'),('Pescador',54,'*',2,'heroes','Ação preparada'),('Servo',55,'Diplomacia|Enganação',2,'heroes','Contra alguém de status superior'),
 ('Bandoleiro da Fortaleza',471,'#RES',5,'atlas','Resistência contra medo'),('Cativo das Fadas',472,'#RES',2,'atlas','Resistência contra espírito ou magia'),('Escudeiro Solitário',474,'Enganação',10,'atlas','Disfarce de cavaleiro da Luz'),('Lenhador de Tollon',476,'#NONATTACK',5,'atlas','Teste relacionado à madeira'),
 ('Ginete de Tumarkhân',475,'Adestramento|Cavalgar',2,'atlas','Com o seu parceiro tumarkhân'),('Prisioneiro das Catacumbas',477,'#RES',5,'atlas','Contra armadilha ou efeito de movimento'),('Turista da Academia',479,'#RES',2,'atlas','Resistência contra magia'),
 ('Procurado: Vivo ou Morto',477,'Intimidação',5,'atlas','Alvo reconhece sua fama'),('Procurado: Vivo ou Morto',477,'Diplomacia',-5,'atlas','Alvo reconhece sua fama')]:origin(owner,page,skills,amount,book,name='Benefício: '+condition,condition=condition)
for owner,page,skills,attribute,book in [('Espião',51,'#NONATTACK','CAR','heroes'),('Duyshidakk Infiltrado',474,'Enganação','SAB','atlas'),('Emissário Ubaneri',474,'Misticismo','SAB','atlas'),('Liricista de Lenórienn',476,'Misticismo','CAR','atlas'),('Tradicionalista Svalano',479,'Conhecimento|Nobreza','SAB','atlas'),('Trapaceiro Ahleniense',479,'Ladinagem','CAR','atlas'),('Um com os Kami',479,'Misticismo','SAB','atlas')]:origin(owner,page,skills,book=book,name='Atributo alternativo',attribute=attribute,**({'choose':1} if owner=='Espião' else {}))
origin('Tradicionalista Svalano',479,'Conhecimento|Nobreza',book='atlas',name='Testes sem treinamento',untrained=True)
origin('Padeiro',54,'Atletismo',replaceSkill='Ofício (cozinheiro)')
origin('Servo',55,'Nobreza',name='Ofício serviçal',replaceSkill='Ofício (serviçal)')
origin('Agricultor Sambur',470,'*',book='atlas',dice='1d6',condition='Benefício ativado, uma vez por cena')
origin('Filhote da Revoada',475,'Acrobacia|Pilotagem',book='atlas',roll='best',condition='Benefício ativado')

grant('ability','Treinamento em Perícia','Treinamento em Perícia','core',131,'*')
grant('ability','Conhecimento Enciclopédico','Conhecimento Enciclopédico','core',132,'#INT',2)
grant('ability','Educação Privilegiada','Educação Privilegiada','core',79,'#NOBRE',2)
for level,name,skills,page in [(1,'Jovem Pajem','Adestramento|Ofício (armeiro)',41),(2,'Valete','Diplomacia|Nobreza',42),(3,'Escudeiro Aprendiz','Cavalgar',42),(4,'Guarda do Castelo','Intuição',42),(5,'Vigilante de Estradas','Percepção',42)]:
 r=grant('class','Vassalo',name,'heroes',page,skills,duplicate='bonus');r['level']=level
for owner,name,level,page,every in [('Bárbaro','Instinto Selvagem',3,42,6),('Machado de Pedra','Instinto Selvagem',3,42,6)]:
 add('class',owner,name,'core',page,level=level,effects=[effect('Percepção|Reflexos',1,every=every,start=level)])
for owner in ['Bucaneiro','Duelista']:
 add('class',owner,'Esquiva Sagaz','core',48,level=3,effects=[effect('Reflexos',1,every=4,start=3,condition='Sem armadura pesada e sem estar imóvel')])
for owner in ['Druida','Ermitão']:
 add('class',owner,'Empatia Selvagem','core',61,effects=[effect('Adestramento',2,requiresRace='Dahllan')])

for name,page,skills,amount in [('Esquiva',125,'Reflexos',2),('Vitalidade',129,'Fortitude',2),('Vontade de Ferro',131,'Vontade',2),('Mente Analítica',134,'Intuição|Investigação|Vontade',2),('Mente Vazia',134,'Iniciativa|Percepção|Vontade',2),('Escamas Dracônicas',133,'Fortitude',2),('Esse Cheiro...',88,'Fortitude',2),('Força dos Penhascos',62,'Fortitude',2),('Liberdade da Pradaria',62,'Reflexos',2),('Tranquilidade dos Lagos',63,'Vontade',2),('Sarado',77,'Fortitude','FOR')]:power(name,page,skills,amount)
power('Fé Guerreira',133,'Guerra',attribute='SAB')
power('Etiqueta',54,'Diplomacia|Nobreza',2,choose=1)
power('Antenas',136,'Iniciativa|Percepção|Vontade','tormenta')
power('Articulações Flexíveis',136,'Acrobacia|Furtividade|Reflexos','tormenta')
power('Mãos Membranosas',137,'Atletismo|Fortitude','tormenta')
for name,page,skills,amount,condition in [
 ('Inexpugnável',128,'#RES',2,'Usando armadura pesada'),('Atraente',130,'#CAR',2,'Alvo pode sentir atração física por você'),('Lobo Solitário',130,'*',1,'Sem aliado em alcance curto'),('Torcida',131,'*',2,'Torcida a seu favor'),
 ('Amigo Especial',85,'Adestramento',5,'Teste com animal'),('Esforçado',95,'*',2,'Teste estendido ou perigo complexo'),('Afinidade com a Tormenta',132,'#RES',10,'Contra Tormenta, suas criaturas ou devotos de Aharadak'),
 ('Folião',48,'#CAR',2,'Durante festa'),('Escaramuça',51,'Reflexos',2,'Moveu-se 6m e está sem armadura pesada'),('Escaramuça Superior',51,'Reflexos',5,'Moveu-se 6m e está sem armadura pesada'),('Saqueador de Tumbas',74,'Investigação',5,'Encontrar armadilhas'),
 ('Saqueador de Tumbas',74,'#RES',5,'Resistir a armadilha'),('Missa: Escudo Divino',58,'#RES',1,'Participou da missa'),('Solidez',55,'#RES','shield','Usando escudo')]:power(name,page,skills,amount,condition=condition)
power('Especialista',73,'#NONATTACK','training',choose='INT',trained=True,condition='Especialista ativado para este teste')
power('Foco em Perícia',130,'#NONATTACK',choose=1,trained=True,condition='Foco em Perícia ativado',roll='best')
power('Eclético',45,'*',choose=1,chooseAtUse=True,condition='Eclético ativado para este teste',train=True)
power('Palpite Fundamentado',90,'#INT|#SAB',condition='Palpite Fundamentado ativado',replaceSkill='Conhecimento')
power('Língua dos Becos',77,'#CAR',condition='Língua dos Becos ativada',attribute='FOR')
power('Cultura Exótica',90,'*',condition='Cultura Exótica ativada para este teste',untrained=True)
power('Aura Sagrada',84,'#RES','CAR',condition='Dentro da Aura Sagrada ativa')
power('Mente Aberrante',137,'#RES','tormenta',condition='Resistência contra efeito mental')

# The catalog is data, never executable text from books or from uploaded sheets.
exec((Path(__file__).parent/'skill-mechanics-more.py').read_text(encoding='utf8'))
exec((Path(__file__).parent/'skill-mechanics-completion.py').read_text(encoding='utf8'))
out=repo/'src/shared/data/t20-skill-mechanics.json'
out.write_text(json.dumps({'version':1,'rules':rules},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(f'{len(rules)} regras escritas em {out}')
