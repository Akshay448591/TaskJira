import { test, expect } from '@playwright/test';

test.describe('TaskJira UI Smoke Test', () => {
  test('landing page redirects to login and displays sign-in interface', async ({ page }) => {
    await page.goto('/');

    // Should redirect to /login or display TaskJira branding
    await expect(page).toHaveTitle(/TaskJira/i);
    
    // Check for email and password input elements
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();

    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).toBeVisible();
  });

  test('navigation to signup page displays name input and submit button', async ({ page }) => {
    await page.goto('/signup');

    const nameInput = page.locator('input[name="name"], input[placeholder*="name" i]');
    await expect(nameInput).toBeVisible();

    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeVisible();
  });
});
