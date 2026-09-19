# Executed by build-skill-mechanics.py after its initial, reviewed catalog.
# Every entry is a skill modifier, never power execution or a PM transaction.
for name,page,skills,amount in [
 ('Pernas do Mar',48,'Acrobacia|Atletismo',2),('Gatuno',74,'Atletismo',2),('Sombra',74,'Furtividade',2),
 ('Voz Poderosa',80,'Diplomacia|Intimidação',2),('Atlético',130,'Atletismo',2),('Investigador',130,'Investigação',2),
 ('Sentidos Aguçados',130,'Percepção',2),('Astúcia da Serpente',132,'Enganação|Furtividade|Intuição',2),
 ('Golpista Divino',134,'Enganação|Jogatina|Ladinagem',2),('Mente Criminosa',74,'Ladinagem|Furtividade','INT'),
 ('Investigador',130,'Intuição','INT'),('Olhos Vermelhos',137,'Intimidação','tormenta')]:power(name,page,skills,amount)
power('Acrobático',129,'Atletismo',attribute='DES')
for name,page,skills,amount,condition in [
 ('Envolto em Mistério',38,'Enganação|Intimidação',5,'Alvo não treinado em Conhecimento ou Misticismo'),
 ('Superstição',42,'#RES',5,'Resistência contra magia'),('Estrelato',44,'#CAR',5,'Plateia impressionada por Atuação'),
 ('Ataque Acrobático',47,'#ATTACK',2,'Aproximou-se com salto ou pirueta e atacou no mesmo turno'),
 ('Bravata Imprudente',48,'#ATTACK',2,'Venceu o combate sob a penalidade da bravata; até o fim da aventura'),
 ('Autoridade Eclesiástica',57,'Diplomacia|Intimidação',5,'Alvo devoto da sua divindade'),
 ('Missa: Chamado às Armas',58,'#ATTACK',1,'Participou da missa'),('Fuga Formidável',73,'Acrobacia|Atletismo',5,'Fuga Formidável ativa'),
 ('Valentão',66,'#ATTACK',2,'Oponente caído, desprevenido, flanqueado ou indefeso'),
 ('Encontrar Fraqueza',70,'#ATTACK',2,'Oponente de armadura ou construto'),('Convencido',76,'#RES',5,'Resistência contra medo ou efeito mental'),
 ('Lutador de Chão',77,'Luta',2,'Manobra agarrar ou derrubar'),('Nome na Arena',77,'#CAR',2,'Fama reconhecida nesta cena'),
 ('Virtude Paladinesca: Castidade',83,'Intuição',5,'Perceber blefe'),('Julgamento Divino: Coragem',83,'#ATTACK',2,'Contra inimigo com maior ND da cena'),
 ('Combate Defensivo',125,'#ATTACK',-2,'Combate Defensivo ativo até o próximo turno'),('Derrubar Aprimorado',125,'Luta',2,'Manobra derrubar'),
 ('Desarmar Aprimorado',125,'Luta',2,'Manobra desarmar'),('Quebrar Aprimorado',129,'Luta',2,'Manobra quebrar'),
 ('Estilo de Uma Arma',128,'Luta',2,'Arma corpo a corpo em uma mão e outra vazia, exceto desarmado'),('Foco em Arma',128,'#ATTACK',2,'Ataque com a arma escolhida para este poder'),
 ('Finta Aprimorada',128,'Enganação',2,'Fintar'),('Armas da Ambição',132,'#ATTACK',1,'Ataque com arma na qual é proficiente'),
 ('Conjurar Arma',132,'#ATTACK',1,'Ataque com a arma conjurada'),('Dom da Verdade',133,'Intuição',5,'Dom da Verdade ativo'),
 ('Dom da Verdade',133,'Percepção',5,'Dom da Verdade ativo; contra Enganação ou Furtividade'),
 ('Fúria Divina',134,'Luta',2,'Fúria Divina ativa'),('Rejeição Divina',135,'#RES',5,'Resistência contra magia divina'),
 ('Sangue Ofídico',135,'#RES',5,'Resistência contra veneno'),('Empunhadura Rubra',137,'Luta','tormenta','Empunhadura Rubra ativa'),
 ('Legião Aberrante',137,'#RES','tormenta','Efeito de alvo único, não de área'),('Legião Aberrante',137,'Luta','tormenta','Teste contra manobra de combate'),
 ('Mãos Membranosas',137,'Luta','tormenta','Manobra agarrar')]:power(name,page,skills,amount,condition=condition)
power('Mestre dos Sussurros',45,'Investigação|Enganação',roll='best',condition='Interrogar com Investigação ou intriga com Enganação')
power('Postura de Combate: Torre Inabalável',55,'Reflexos|Vontade',replaceSkill='Fortitude',condition='Torre Inabalável ativa, sem se deslocar')
power('Armeiro',68,'Luta',attribute='INT',condition='Ataque com arma corpo a corpo')
power('Balística',69,'Pontaria',attribute='INT',condition='Ataque com arma à distância')
power('Acuidade com Arma',124,'Luta',attribute='DES',condition='Ataque com arma leve ou ágil')
power('Arremesso Potente',124,'Pontaria',attribute='FOR',condition='Ataque com arma de arremesso')
power('Abençoar Arma',57,'#ATTACK',attribute='SAB',condition='Ataque com arma abençoada')
for name,page,skills,amount in [('Comandar',130,'*',1),('Engenhosidade',68,'#NONATTACK','INT'),('Audácia',47,'#NONATTACK','CAR'),('Golpe Divino',82,'Luta','CAR')]:power(name,page,skills,amount,condition=name+' ativo para este teste')
for name in ['Escaramuça']:
 for rule in rules:
  if rule['name']==name:
   for e in rule.get('effects',[]):e['suppresses']=['Escaramuça Superior']

def class_effect(owner,name,page,skills,amount=0,level=1,book='core',**kw):return add('class',owner,name,book,page,level=level,effects=[effect(skills,amount,**kw)])
for owner in ['Caçador','Seteiro']:class_effect(owner,'Rastreador',50,'Sobrevivência',2,level=2 if owner=='Seteiro' else 1) if owner=='Caçador' else None
class_effect('Caçador','Explorador',51,'Acrobacia|Atletismo|Furtividade|Percepção|Sobrevivência','SAB',level=3,minimumAmount=1,condition='No terreno escolhido para Explorador; informe o terreno na situação')
for owner in ['Inventor','Alquimista']:class_effect(owner,'Engenhosidade',68,'#NONATTACK','INT',condition='Engenhosidade ativa para este teste')
for owner in ['Bucaneiro','Duelista']:class_effect(owner,'Audácia',47,'#NONATTACK','CAR',condition='Audácia ativa para este teste')
for owner in ['Ladino','Ventanista']:class_effect(owner,'Especialista',73,'#NONATTACK','training',choose='INT',trained=True,condition='Especialista ativado para este teste')
class_effect('Bardo','Eclético',45,'*',level=2,choose=1,chooseAtUse=True,train=True,condition='Eclético ativado para este teste')
for owner in ['Bardo','Magimarcialista']:class_effect(owner,'Inspiração',44,'*',1,condition='Inspiração ativa; informe o bônus escolhido',options=list(range(1,6)),maximumByLevel=dict(base=1,start=1,every=4,step=1)) if owner=='Bardo' else None
for owner in ['Nobre','Burguês']:class_effect(owner,'Orgulho',79,'*',condition='Orgulho ativo; informe o bônus escolhido',options=list(range(2,42,2)),maxAttribute='CAR',maxMultiplier=2)
class_effect('Frade','Erudição',39,'#NONATTACK',book='gods',condition='Erudição ativa; informe o bônus escolhido',options=list(range(2,42,2)),maxAttribute='INT',maxMultiplier=2)
class_effect('Cavaleiro','Baluarte',53,'#RES',condition='Baluarte ativo; informe o bônus escolhido',options=list(range(2,12,2)),maximumByLevel=dict(base=2,start=1,every=4,step=2))
class_effect('Cavaleiro','Duelo',53,'#ATTACK',level=2,condition='Ataque contra o oponente do duelo; informe o bônus escolhido',options=list(range(2,6)),maximumByLevel=dict(base=2,start=2,every=5,step=1))
class_effect('Bárbaro','Fúria',41,'Luta',2,condition='Fúria ativa; informe o bônus escolhido',options=list(range(2,7)),maximumByLevel=dict(base=2,start=1,every=5,step=1))
class_effect('Paladino','Golpe Divino',82,'Luta','CAR',condition='Golpe Divino ativo para este ataque')

# Supplemental powers with deterministic skill effects. Their acquisition is explicit.
for name,page,skills,amount in [
 ('Análise Tática',68,'Guerra',2),('Velho de Guerra',69,'Intimidação',5),('Caminhar pelas Paredes',73,'Atletismo',10),
 ('Líder Enérgico',75,'Iniciativa','CAR'),('Herói dos Sete Instrumentos',80,'*','halfTraining'),('Pose Assustadora',80,'Intimidação',2),
 ('Devoção Iluminada',86,'Vontade',2),('Estirpe Arcana',87,'Misticismo',2),('Fragrância de Rosas',88,'Diplomacia',2),
 ('Ossos Afiados',90,'Intimidação',2),('Valentia Nata',91,'Iniciativa',5)]:power(name,page,skills,amount,book='heroes',**({'untrainedBonus':True} if name=='Herói dos Sete Instrumentos' else {'condition':'Atletismo para saltar'} if name=='Caminhar pelas Paredes' else {}))
for name,page,skills,amount,condition in [
 ('Celebridade Artoniana',58,'*',5,'Alvo reconhecido como fã nesta aventura'),('Postura de Combate: Armamento Pesado',64,'Fortitude',2,'Postura ativa com arma de duas mãos'),
 ('Missa: Mente Abençoada',65,'#SAB',2,'Participou da missa'),('Xadrez de Batalha',69,'Reflexos',2,'Contra o oponente estudado'),
 ('Finta Acrobática',71,'Enganação','DES','Fintar'),('Dança Marcial',74,'Acrobacia',2,'Dança Marcial ativa'),('Dança Marcial',74,'Enganação',2,'Dança Marcial ativa, ao fintar'),
 ('Gingado Elusivo',74,'Reflexos',5,'Dança Marcial ativa, contra efeito hostil'),('Virtude Paladinesca: Paciência',77,'*',2,'Meditação concluída e benefício ativo'),
 ('Coragem Aguerrida',78,'*',2,'Metade ou menos dos PV máximos'),('Diligente',80,'#NONATTACK',2,'Gastou movimento se concentrando; tarefa de até uma ação completa'),
 ('Coro Sibilante',86,'#CAR',2,'Coro Sibilante ativo, exceto ataques'),('Ginete de Javali',88,'Adestramento|Cavalgar',2,'Com o parceiro javali'),
 ('Lógica Gnômica',89,'#NONATTACK','INT','Lógica Gnômica ativa para este teste')]:power(name,page,skills,amount,book='heroes',condition=condition)
power('Dança Acrobática',58,'Acrobacia',book='heroes',replaceSkill='Atuação')
power('Batedor Marcial',61,'Guerra',book='heroes',replaceSkill='Sobrevivência')
power('Flecheiro',61,'Ofício',book='heroes',replaceSkill='Sobrevivência',condition='Fabricar munições com materiais naturais')
power('Artesão Criativo',70,'Ofício',book='heroes',replaceSkill='Ofício (artesão)')
power('Gênio Inovador',71,'*',book='heroes',choose=2,minimum=1,attribute='INT')
power('Falatório Criativo',87,'#CAR',book='heroes',choose=1,attribute='INT')
power('Alma Inabalável',56,'#RES',book='heroes',condition='Alma Inabalável ativada para este teste',replaceSkill='Intimidação')
power('Programação Holística',90,'*',book='heroes',choose=1,chooseAtUse=True,condition='Programação Holística ativada para esta perícia até o fim do dia',train=True)
power('Andarilho Urbano',80,'Enganação|Investigação',2,book='heroes',condition='Dentro de uma cidade')
power('Impostor',80,'*',book='heroes',condition='Uma vez por cena; teste que exija no máximo uma ação completa',replaceSkill='Enganação')
power('Meditação Autoafirmativa',80,'*',book='heroes',condition='Benefício de treinamento conquistado pela meditação, ainda na mesma semana',train=True,choose=1)

grant('ability','Biblioteca Divina','Biblioteca Divina','gods',43,'*',perTier=True)
power('Estudante Diligente',40,'*',book='gods',choose=1,condition='Escolha do dia registrada; penalidade de PM administrada separadamente',train=True)
power('Dom da Vontade',44,'Vontade',2,book='gods')
power('Jurista Divino',45,'Nobreza',book='gods',attribute='SAB')
power('Jurista Divino',45,'Diplomacia|Intimidação',book='gods',replaceSkill='Nobreza')
power('Seguir a Norma',78,'Fortitude|Vontade',2,book='gods')
power('Cancioneiro da Esperança',43,'#NONATTACK',2,book='gods',condition='Canção ativa, sem executar ação hostil')
power('Convicção Ambiciosa',44,'*',2,book='gods',condition='Encontro contra o dobro de inimigos ou ND maior que o grupo')
power('Quem Ri Por Último',72,'*',1,book='gods',condition='Último na iniciativa, contra alvo que já agiu')
power('Domínio da Pólvora',110,'#NONATTACK',2,book='gods',condition='Teste relacionado a arma de fogo')

for name,page,skills,amount,condition in [
 ('Liberdade das Montanhas',7,'*',2,'Contra criatura em terreno mais baixo'),('Poder da Amizade',9,'*',2,'Amigo em alcance médio com quem pode trocar olhares'),
 ('Igual ao Lar',23,'*',1,'No lar preparado pelo poder'),('Ginete Altivo',25,'#ATTACK|Cavalgar',2,'Montado em cavalo'),
 ('Manha da Cidade',38,'Conhecimento|Investigação|Ladinagem|Nobreza','SAB','Dentro de comunidade'),('Véu de Toris',47,'Furtividade',5,'Véu de Toris ativo'),
 ('Irmão da Coragem',51,'Vontade',2,'Já possuía imunidade a medo de outra fonte')]:power(name,page,skills,amount,book='minor',condition=condition,**({'minimumAmount':1,'untrained':True} if name=='Manha da Cidade' else {'ignoreArmor':True} if name=='Véu de Toris' else {}))
power('Liberdade das Montanhas',7,'Atletismo',book='minor',roll='best',condition='Atletismo para escalar')
power('Canção Divina',14,'Atuação',book='minor',attribute='SAB')
power('Selvageria Marcial',26,'Guerra',book='minor',replaceSkill='Sobrevivência')
power('Passo do Caçador',33,'Sobrevivência',2,book='minor')
power('Passo do Caçador',33,'Furtividade','SAB',book='minor')
power('Sono Reparador',36,'*',book='minor',dice='1d6',condition='Descanso inspirador; benefício ainda não usado neste dia')
grant('ability','Alimento da Alma','Alimento da Alma','minor',44,'Ofício (cozinheiro)')
power('Irmão da Coragem',51,'*',book='minor',condition='Uma vez por cena, em situação de perigo',replaceSkill='Vontade')

# Optional rules are ONLY discovered through the explicit, master-reviewed register.
for name,page,skills,amount,kw in [
 ('Idade: No Meu Tempo...',291,'Intuição|Vontade',-5,{}),('Idade: Rabugento',291,'#CAR',-5,{'exclude':['Intimidação']}),
 ('Idade: Turrão',291,'*',0,{'noHalfUntrained':True})]:add('optional',name,name,'heroes',page,effects=[effect(skills,amount,**kw)])
grant('optional','Domínio: Biblioteca','Domínio: Biblioteca','heroes',316,'*')

def spell(name,page,skills,amount=0,book='core',condition='Efeito da magia recebido e ativo para este teste',**kw):return add('spell',name,name,book,page,effects=[effect(skills,amount,condition=condition,**kw)])
for name,page,skills,amount,condition in [
 ('Aparência Perfeita',180,'Diplomacia|Enganação',5,'Aparência Perfeita ativa'),('Aviso',182,'Iniciativa|Percepção',5,'Aviso: alerta, próximo teste nesta cena'),
 ('Detectar Ameaças',190,'#RES',5,'Aprimoramento ativo, contra armadilha'),('Escuridão',193,'Furtividade',10,'Aprimoramento de sombras pessoais ativo'),
 ('Invisibilidade',195,'Furtividade',10,'Invisível, contra ouvir'),('Metamorfose',198,'Enganação',20,'Disfarçar-se com a forma assumida'),
 ('Névoa',200,'#ATTACK',-2,'Dentro da névoa aprimorada que reduz ataques'),('Primor Atlético',201,'Atletismo',10,'Primor Atlético ativo'),
 ('Proteção Contra Magia',202,'#RES',5,'Proteção ativa contra magia'),('Salto Dimensional',205,'Reflexos',5,'Aprimoramento de reação contra o efeito atual'),
 ('Servos Invisíveis',206,'#NONATTACK',2,'Servo usado neste teste, exceto resistência'),('Tempestade Divina',208,'Percepção',-5,'Na chuva, neve ou granizo da magia'),
 ('Visão da Verdade',211,'Percepção',10,'Aprimoramento de sentidos apurados ativo')]:spell(name,page,skills,amount,condition=condition,**({'exclude':['#RES']} if name=='Servos Invisíveis' else {}))
for name,page,skills,options in [('Arma Mágica',181,'#ATTACK',[1,2,3,4,5]),('Armamento da Natureza',181,'#ATTACK',[1,2,3,4,5]),('Bênção',182,'#ATTACK',[1,2,3,4,5]),('Perdição',201,'#ATTACK',[-1,-2,-3,-4,-5]),('Aura Divina',182,'#RES',list(range(5,26))),('Círculo da Justiça',183,'Acrobacia|Enganação|Furtividade|Ladinagem',[-5,-10,-20]),('Disfarce Ilusório',191,'Enganação',[10,20]),('Dispersar as Trevas',191,'#RES',list(range(4,16))),('Heroísmo',194,'#ATTACK',[4,6]),('Proteção Divina',202,'#RES',list(range(2,16))),('Transformação de Guerra',210,'Luta',list(range(6,16))),('Vestimenta da Fé',210,'#RES',[1,2,3,4,5])]:spell(name,page,skills,options=options,condition='Efeito ativo; informe o bônus ou penalidade da versão utilizada e sua situação')
spell('Oração',200,'*',options=[-5,-4,-3,-2,2,3,4,5],stackGroup='prayer',condition='Oração ativa; informe o modificador recebido')
spell('Proteção Divina',202,'#RES',5,stackGroup='divine-protection-reaction',condition='Aprimoramento de reação, próximo teste; acumula com a versão básica')
spell('Concentração de Combate',185,'#ATTACK',roll='best')
spell('Concentração de Combate',185,'Reflexos',10,condition='Aprimoramento de 5º círculo ativo')
spell('Orientação',200,'*',roll='best',condition='Orientação recebida para este teste; respeite a restrição do aprimoramento usado')
spell('Primor Atlético',201,'Atletismo',30,condition='Salto com o aprimoramento ativo (total de +30)',stackGroup='spell')
spell('Primor Atlético',201,'#FOR|#DES|#CON',roll='best',condition='Aprimoramento para rolar dois dados ativo')
for name,page,skills,amount,book,condition in [
 ('Farejar Fortuna',254,'*',5,'heroes','Aprimoramento ativo para identificar item ou localizar tesouro'),('Máquina de Combate',254,'Atletismo|Luta',5,'heroes','Máquina de Combate ativa'),
 ('Piscar',255,'#ATTACK',2,'heroes','Piscar ativo'),('Viagem Onírica',255,'Percepção',-10,'heroes','Notar ruídos próximos do corpo adormecido'),
 ('Escapatória de Hyninn',61,'Reflexos',5,'gods','Escapatória ativa para este teste'),('Escapatória de Hyninn',61,'Ladinagem',5,'gods','Desarmar armadilha com Escapatória'),
 ('Paixão de Marah',62,'#CAR',2,'gods','Paixão de Marah ativa, exceto Intimidação'),('Percepção Rubra',63,'#ATTACK|Reflexos',1,'gods','Percepção Rubra ativa'),
 ('Perturbação Sombria',63,'Percepção',-5,'gods','Afetado pela aura'),('Posse de Arsenal',63,'Percepção',5,'gods','Percepção contra punga'),
 ('Posse de Arsenal',63,'Luta',5,'gods','Contra manobra desarmar ou quebrar'),('Toque de Megalokk',65,'Intimidação',5,'gods','Forma monstruosa ativa'),
 ('Toque de Megalokk',65,'#CAR',-5,'gods','Forma monstruosa ativa, exceto Intimidação')]:spell(name,page,skills,amount,book=book,condition=condition,**({'exclude':['Intimidação']} if name in ['Paixão de Marah','Toque de Megalokk'] and skills=='#CAR' else {}))
spell('Voz da Razão',65,'Conhecimento|Diplomacia|Intimidação',book='gods',options=[5,10])

# Correct the inherited text catalog's page-boundary classification for Tormenta powers.
tormenta='Anatomia Insana|Antenas|Armamento Aberrante|Articulações Flexíveis|Asas Insetoides|Carapaça|Corpo Aberrante|Cuspir Enxame|Dentes Afiados|Desprezar a Realidade|Empunhadura Rubra|Fome de Mana|Larva Explosiva|Legião Aberrante|Mãos Membranosas|Membros Estendidos|Membros Extras|Mente Aberrante|Olhos Vermelhos|Pele Corrompida|Sangue Ácido|Visco Rubro'.split('|')
catalog_path=repo/'src/shared/data/t20-reference-catalog.json'
catalog=json.loads(catalog_path.read_text(encoding='utf8'))
for entry in catalog['abilities']:
 if key(entry['name']) in {key(n) for n in tormenta}:entry['subcategory']='tormenta'
catalog_path.write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
