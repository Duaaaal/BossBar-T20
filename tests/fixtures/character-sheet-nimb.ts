import { PDFDocument } from 'pdf-lib';

// Native Nimb field names, independent of the application's canonical adapter.
export const createNimbCharacterSheet = async (overrides: Record<string, string> = {}, extraPage = false) => {
  const document = await PDFDocument.create();
  for (let page = 0; page < (extraPage ? 4 : 3); page++) document.addPage().drawText(`Pagina de referencia ${page + 1}`);
  const form = document.getForm();
  const values: Record<string, string> = {
    Nome: 'Exemplo Nimb', Jogador: '', Raca: 'Humano', Origem: 'Mateiro', Classe: 'Druida 10', nivel: '10', Divindade: 'Allihanna',
    modFor: '1', modDes: '1', modCon: '1', modInt: '2', modSab: '4', modCar: '0',
    vidaMax: '62', vidaAtual: '62', manaMax: '44', manaAtual: '44',
    Texto13: '13', defesa1: '2', defesa2: '0', defesaOutros: '0', modDef: 'modDes', attLimit: '0',
    penalidadeDeArmadura: '2', penalidade1: '2', penalidade2: '0', tFurtividade: '0',
    armadura1: 'Armadura leve', armadura2: '', caracteristicas: 'Armas simples', modTamanho: 'Médio', deslocamento: '9',
    item1: 'Corda (1 espaços)\nBálsamo (0,5 espaços)', item2: '', cargaAtual: '1,5', cargaMaxima: '12', 'T$': '20', TO: '',
    Historico: 'Habilidades de referência preservadas.', Atualização: '',
    'Habilidades de classe e poderes': '', 'Habilidades de Raça e Origem': '',
    Magias: '', Descrição: '', 'Anotações': '', 'Entre aventuras': '',
    modSelectMagia: 'modSab', modificadorMagia: '4', Resistencia: '19', metadeDoNivel: '5',
    ...overrides,
  };
  const attributes = ['modDes', 'modCar', 'modFor', 'modCar', 'modDes', 'modInt', 'modSab', 'modCar', 'modCar', 'modCon', 'modDes', 'modInt', 'modDes', 'modCar', 'modSab', 'modInt', 'modCar', 'modDes', 'modFor', 'modInt', 'modInt', 'modInt', 'modInt', 'modSab', 'modDes', 'modDes', 'modDes', 'modSab', 'modSab', 'modSab'];
  for (let index = 0; index < 30; index++) {
    const penalty = [0, 10, 17].includes(index) ? -2 : 0;
    values[`modSelect${index}`] ??= attributes[index];
    values[`treino${index}`] ??= '0';
    values[`outros${index + 1}`] ??= String(penalty);
    values[index === 22 ? 'tota23' : `total${index + 1}`] ??= String(5 + Number(values[attributes[index]]) + penalty);
    form.createCheckBox(`treinado${index + 1}`).uncheck();
  }
  for (const [name, value] of Object.entries(values)) form.createTextField(name).setText(value);
  form.createCheckBox('checkPesada').uncheck();
  return Buffer.from(await document.save({ updateFieldAppearances: false }));
};
