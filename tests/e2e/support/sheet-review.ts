import { expect, type Page } from '@playwright/test';

/** Existing scenarios preserve customized PV/PM when reviewing base progression. */
export const keepCustomizedSheetValues = async (page: Page) => {
  const confirmation = page.getByRole('dialog', { name: 'Revisar valores esperados', exact: true });
  const validate = page.getByRole('button', { name: 'Validar e corrigir cálculos', exact: true });
  await expect.poll(async () => await confirmation.isVisible() || await validate.isEnabled()).toBeTruthy();
  if (await confirmation.isVisible()) await confirmation.getByRole('button', { name: 'Manter valores atuais', exact: true }).click();
  await expect(validate).toBeEnabled();
};
