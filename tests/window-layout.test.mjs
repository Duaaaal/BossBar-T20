import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateInitialDockedPresentationSize,
  calculateProportionalDockedSize,
} from '../src/shared/window-layout.ts';

const calculate = (workAreaWidth, workAreaHeight, controlHeight) =>
  calculateInitialDockedPresentationSize({
    workAreaWidth,
    workAreaHeight,
    masterWidth: 430,
    gap: 12,
    controlHeight,
    nativeFrameBudget: 48,
  });

test('mantém apresentação e painel dentro de uma área útil Full HD', () => {
  for (const [height, controlHeight] of [[1080, 389], [1040, 374]]) {
    const layout = calculate(1920, height, controlHeight);
    assert.ok(layout.estimatedGroupHeight <= height);
    assert.ok(layout.contentWidth <= layout.playerAreaWidth);
    assert.ok(Math.abs(layout.contentWidth / layout.contentHeight - (16 / 9)) < 0.003);
  }
});

test('reduz proporcionalmente o grupo em áreas úteis menores', () => {
  const layout = calculateInitialDockedPresentationSize({
    workAreaWidth: 1366,
    workAreaHeight: 728,
    masterWidth: 390,
    gap: 12,
    controlHeight: 280,
    nativeFrameBudget: 48,
  });
  assert.equal(layout.playerAreaWidth, 964);
  assert.ok(layout.estimatedGroupHeight <= 728);
  assert.ok(layout.contentWidth < 800);
});

const resizeGroup = (overrides = {}) => calculateProportionalDockedSize({
  requestedContentWidth: 960,
  currentContentWidth: 1200,
  currentControlHeight: 360,
  availableContentWidth: 1920,
  workAreaHeight: 1080,
  frameHeight: 39,
  topInset: 31,
  dockOverlap: 1,
  minimumContentWidth: 640,
  minimumControlHeight: 120,
  maximumControlHeight: 430,
  scaleControlHeight: true,
  ...overrides,
});

test('redimensiona apresentacao e painel com a mesma escala', () => {
  const layout = resizeGroup();
  assert.equal(layout.contentWidth, 960);
  assert.equal(layout.contentHeight, 540);
  assert.equal(layout.controlHeight, 288);
  assert.equal(layout.contentWidth / 1200, layout.controlHeight / 360);
});

test('usa os limites do monitor atual sem depender da resolucao primaria', () => {
  const smallerDisplay = resizeGroup({
    requestedContentWidth: 1200,
    availableContentWidth: 1280,
    workAreaHeight: 720,
  });
  const largerDisplay = resizeGroup({
    requestedContentWidth: 1200,
    availableContentWidth: 2560,
    workAreaHeight: 1400,
  });

  assert.ok(smallerDisplay.contentWidth < largerDisplay.contentWidth);
  assert.ok(
    smallerDisplay.contentHeight + 31 - 1 + smallerDisplay.controlHeight <= 720,
  );
  assert.equal(largerDisplay.contentWidth, 1200);
  assert.equal(largerDisplay.controlHeight, 360);
});

test('mantem o painel minimizado fixo enquanto redimensiona o video', () => {
  const layout = resizeGroup({
    currentControlHeight: 32,
    scaleControlHeight: false,
  });
  assert.equal(layout.contentWidth, 960);
  assert.equal(layout.contentHeight, 540);
  assert.equal(layout.controlHeight, 32);
});

test('inicia a apresentacao preferencial em 1280 por 720', () => {
  const layout = calculateInitialDockedPresentationSize({
    workAreaWidth: 2560,
    workAreaHeight: 1392,
    masterWidth: 430,
    gap: 12,
    controlHeight: 360,
    nativeFrameBudget: 48,
    preferredContentWidth: 1280,
  });
  assert.equal(layout.contentWidth, 1280);
  assert.equal(layout.contentHeight, 720);
});

test('impede que o painel expandido encolha a ponto de ocultar campos', () => {
  const layout = calculateProportionalDockedSize({
    requestedContentWidth: 500,
    currentContentWidth: 1280,
    currentControlHeight: 360,
    availableContentWidth: 1920,
    workAreaHeight: 1392,
    frameHeight: 39,
    topInset: 31,
    dockOverlap: 1,
    minimumContentWidth: 960,
    minimumControlHeight: 350,
    maximumControlHeight: 430,
    scaleControlHeight: true,
  });
  assert.equal(layout.contentWidth, 960);
  assert.equal(layout.controlHeight, 350);
});
