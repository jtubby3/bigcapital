import { test, expect, type Locator, type Page } from "@playwright/test";
import { faker } from "@faker-js/faker";
import {
  createCustomerViaApi,
  createDeliveredInvoiceViaApi,
  createItemViaApi,
  findItemIdByName,
  readApiAuth,
} from "./_api";
import {
  selectCustomer,
  selectEntryItem,
  waitForInvoiceForm,
  waitForInvoicesList,
} from "./_invoices";

const API_BASE = process.env.PLAYWRIGHT_TEST_API_URL || "http://localhost:3000";

// Unique name so the invoice form's item picker resolves a single item.
const ITEM_NAME = `E2E Date Item ${faker.string.alphanumeric(6)}`;

// West of UTC, where UTC midnight is still the previous day. Date inputs
// showed stored dates a day early here and saved picked days a day late.
test.use({ timezoneId: "America/Los_Angeles" });

/**
 * Seeds a fresh customer through the API and returns it.
 */
async function seedCustomer() {
  const auth = readApiAuth();
  const displayName = `E2E Date Customer ${faker.string.alphanumeric(6)}`;
  const customer = await createCustomerViaApi(API_BASE, auth, {
    displayName,
  });
  return { id: customer.id as number, displayName };
}

/** Returns the native invoice calendar-date input. */
function invoiceDateInput(page: Page): Locator {
  return page.locator("#invoiceDate");
}

test.describe("date inputs", () => {
  test.beforeAll(async () => {
    const auth = readApiAuth();

    // Seeds the item that the invoice forms select.
    await createItemViaApi(API_BASE, auth, {
      name: ITEM_NAME,
      type: "service",
    });
  });

  test("should show today by default and save the selected calendar date.", async ({
    page,
  }) => {
    const customer = await seedCustomer();

    await page.goto("/invoices/new");
    await waitForInvoiceForm(page, "New Invoice");
    await selectCustomer(page, customer.displayName);
    await selectEntryItem(page, ITEM_NAME);

    const today = await page.evaluate(() => {
      const now = new Date();
      const pad = (value: number) => String(value).padStart(2, "0");
      return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    });
    await expect(invoiceDateInput(page)).toHaveValue(today);

    // Pick a different day without depending on the browser's native picker UI.
    const pickedDate = today.endsWith("-01")
      ? `${today.slice(0, 8)}02`
      : `${today.slice(0, 8)}01`;
    await invoiceDateInput(page).fill(pickedDate);

    const createRequest = page.waitForRequest(
      (request) =>
        new URL(request.url()).pathname === "/api/sale-invoices" &&
        request.method() === "POST",
      { timeout: 20_000 },
    );
    await page.getByRole("button", { name: "Save for later" }).click();

    const body = (await createRequest).postDataJSON();
    expect(body.invoice_date ?? body.invoiceDate).toBe(pickedDate);

    await waitForInvoicesList(page);
  });

  test("should show the stored date on the edit form.", async ({ page }) => {
    const auth = readApiAuth();
    const customer = await seedCustomer();
    const itemId = await findItemIdByName(API_BASE, auth, ITEM_NAME);

    const invoice = await createDeliveredInvoiceViaApi(API_BASE, auth, {
      customerId: customer.id,
      itemId,
      rate: 100,
      date: "2026-08-31",
    });

    const invoiceResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          `/api/sale-invoices/${invoice.id}` &&
        response.request().method() === "GET",
      { timeout: 30_000 },
    );
    await page.goto(`/invoices/${invoice.id}/edit`);
    await waitForInvoiceForm(page, "Edit Invoice");

    const served = await (await invoiceResponse).json();
    const servedDate: string = served.invoice_date ?? served.invoiceDate;

    // `DATE` columns are served as calendar dates, not UTC instants.
    expect(servedDate).toBe("2026-08-31");

    await expect(invoiceDateInput(page)).toHaveValue("2026-08-31");
  });
});
