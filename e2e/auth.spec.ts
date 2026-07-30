import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should display login page', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible({ timeout: 10000 });
  });

  test('should reject invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email Address').fill('wrong@test.com');
    await page.getByLabel('Password').fill('wrongpass');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/login/);
  });
});

test.describe('Health Endpoint', () => {
  test('should return 200 with status', async ({ page }) => {
    const response = await page.request.get('/api/health');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('checks');
    expect(body.checks).toHaveProperty('calendarRetry');
  });
});

test.describe('API Endpoints - Auth Required', () => {
  test('should reject unauthenticated requests to /api/bookings', async ({ page }) => {
    const response = await page.request.get('/api/bookings');
    expect(response.status()).toBe(401);
  });

  test('should reject unauthenticated requests to /api/doctors', async ({ page }) => {
    const response = await page.request.get('/api/doctors');
    expect(response.status()).toBe(401);
  });

  test('should reject unauthenticated requests to /api/audit-logs', async ({ page }) => {
    const response = await page.request.get('/api/audit-logs');
    expect(response.status()).toBe(401);
  });
});
