import { test, expect } from '@playwright/test';
import dayjs from 'dayjs';


test('@smoke - open incident page has correct title', async ({ page }
) => {
    await page.goto('http://localhost:3000/incident/list');

    // Asert that the page title is visible
    await expect(page.getByTestId("incident-list-Pagetitle")).toBeVisible();

    // Assert that create button is visible
    await expect(page.getByTestId("incident-list-button-success")).toBeVisible();

    // Assert that show visible button is visible
    await expect(page.getByTestId("incident-list-button-warning")).toBeVisible();
});


test('create incident', async ({ page }) => {
  await page.goto('http://localhost:3000/incident/list');
  
  //click on create button in order to create a new incident
  await page.getByTestId("incident-list-button-success").click();

  // Assert that incident name field is visible
  await expect(page.getByText('incident name')).toBeVisible();
  
  
  // insert incident name information
  await page.getByTestId("create-incident-incident-name-input").click();
  await page.getByTestId("create-incident-incident-name-input").fill('Überschwemmung in Erstfeld');

  // select parent incident
  // TODO: fix
  // await page.getByTestId("create-incident-parent-incident-input").selectOption("");

  // insert location information
  await page.getByTestId("create-incident-location-input").click();
  await page.getByTestId("create-incident-location-input").fill('Erstfeld');

  // create a new division for Polizei with Kürzel Pol
  await page.getByTestId("create-incident-add-division-name-input").click();
  await page.getByTestId("create-incident-add-division-name-input").fill('Polizei');
  await page.getByTestId("create-incident-add-division-short-input").click();
  await page.getByTestId("create-incident-add-division-short-input").fill('Pol');
  await page.getByTestId("create-incident-add-division-button").click();

  // remove existing divsion Situation desk officer
  await page.getByTestId("create-incident-remove-division-button").first().click();

    // Assertion that entry with Situation desk officer is removed
  await expect(page.getByText('Situation desk officer')).not.toBeVisible();

  // Click on save buton to create the incident
  const saveButtonClickedAt = new Date();
  console.log('saveButtonClickedAt:', saveButtonClickedAt);
  
  await page.getByTestId("create-incident-save-button").click();
  



  // Assert that the incident was created successfully by checking for a success message or redirection
  // navigation to the incident list to assert that the new incident is listed
  await page.goto('http://localhost:3000/incident/list');
  

  // Assert that the top incident card contains the created incident
  const incidentCard = page.getByTestId('incident-list-incident-card').first();
  await expect(incidentCard).toContainText('Überschwemmung in Erstfeld');
  await expect(incidentCard).toContainText('location: Erstfeld');
  await expect(incidentCard).toContainText(`opened: ${dayjs(saveButtonClickedAt).format('MMMM D, YYYY h:mm A')}`);
  

});