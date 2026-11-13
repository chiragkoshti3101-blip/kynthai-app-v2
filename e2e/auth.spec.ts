import { test, expect } from '@playwright/test';
import { goto, loginAs, DEMO_ACCOUNTS, collectConsoleErrors } from './helpers';

test.describe('Authentication', () => {
  test.describe('Login Page', () => {
    test('login page loads with form elements', async ({ page }) => {
      await goto(page, '/login');
      await page.waitForLoadState('domcontentloaded');

      // Form elements visible
      await expect(page.locator('input[type="email"]')).toBeVisible();
      await expect(page.locator('input[type="password"]')).toBeVisible();
      await expect(page.locator('#login-submit-btn')).toBeVisible();

      // Links to register and forgot password
      const registerLink = page.getByRole('link', { name: /register|sign.?up|create.?account/i });
      if (await registerLink.count() > 0) {
        await expect(registerLink.first()).toBeVisible();
      }
    });

    test('shows validation error for empty form', async ({ page }) => {
      await goto(page, '/login');
      await page.waitForLoadState('domcontentloaded');

      // Submit empty form
      await page.locator('#login-submit-btn').click();

      // The submit handler must surface the "Missing details" validation toast.
      await expect(page.locator('body')).toContainText(/missing details|email and password are required/i, { timeout: 8000 });
      // And must NOT navigate away from the login page.
      expect(page.url()).toContain('/login');
    });

    test('shows error for invalid credentials', async ({ page }) => {
      const errors: string[] = [];
      page.on('console', collectConsoleErrors(errors));

      await goto(page, '/login');
      await page.waitForLoadState('domcontentloaded');

      // Fill with wrong credentials
      await page.fill('input[type="email"]', 'nonexistent@test.com');
      await page.fill('input[type="password"]', 'WrongPassword123!');

      await page.locator('#login-submit-btn').click();

      // The failed POST /auth/login must surface the "Sign in failed" toast.
      await expect(page.locator('body')).toContainText(/sign in failed/i, { timeout: 10000 });
      // Stay on /login — no session issued for bad credentials.
      expect(page.url()).toContain('/login');
    });

    test('logs in with valid demo credentials and redirects to patient portal', async ({ page }) => {
      const errors: string[] = [];
      page.on('console', collectConsoleErrors(errors));

      await goto(page, '/login');
      await page.waitForLoadState('domcontentloaded');

      // Use demo patient credentials
      const demo = DEMO_ACCOUNTS.patient;
      await page.fill('input[type="email"]', demo.email);
      await page.fill('input[type="password"]', demo.password);

      await page.locator('#login-submit-btn').click();

      // Valid credentials must redirect the patient to /patient.
      await page.waitForURL('**/patient**', { timeout: 15000 });
      expect(page.url()).toContain('/patient');
    });
  });

  test.describe('Registration Page', () => {
    test('register page loads with form', async ({ page }) => {
      await goto(page, '/register');
      await page.waitForLoadState('domcontentloaded');

      // Form elements
      const inputs = await page.locator('input').count();
      expect(inputs).toBeGreaterThanOrEqual(2);

      // Submit button present
      await expect(page.getByRole('button', { name: /register|sign.?up|create.?account|submit/i }).first()).toBeVisible();
    });
  });

  test.describe('Forgot Password', () => {
    test('forgot password page loads', async ({ page }) => {
      await goto(page, '/forgot-password');
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('input[type="email"]').or(page.locator('form')).first()).toBeVisible();
    });
  });

  test.describe('Role-Based Redirects', () => {
    test('patient role lands on patient dashboard after login', async ({ page }) => {
      await loginAs(page, 'patient', '/patient');
      // loginAs waits for the redirect — the auth guard must land the patient
      // on the patient dashboard, not leave them on /login.
      expect(page.url()).toContain('/patient');
    });

    test('admin page requires admin role — unauthenticated visit redirects to login', async ({ page }) => {
      // Try accessing admin page directly without auth
      await goto(page, '/admin');

      // Auth guard must bounce unauthenticated visitors to /login.
      await page.waitForURL('**/login**', { timeout: 10000 });
      expect(page.url()).toContain('/login');
    });
  });
});
