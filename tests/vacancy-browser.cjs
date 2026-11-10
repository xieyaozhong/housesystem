const assert = require('node:assert/strict');
const { createCipheriv, pbkdf2Sync, randomBytes } = require('node:crypto');
const { chromium } = require('playwright');

async function checkVacancyPage(browser, url) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const password = randomBytes(24).toString('hex');
    const salt = randomBytes(16);
    const iter = 1000;
    const key = pbkdf2Sync(password, salt, iter, 32, 'sha256');
    const rooms = ['平德501', '逢甲701', '忠明南867-R1'];
    const fixtures = [
      ['secure-data.js', 'HOUSE_VAULT', { properties: rooms.map(code => ({ code })) }],
      ['ops-secure.js', 'HOUSE_OPS_SECURE', {
        vacancies: [{ room: '平德501' }], rented: [], checkouts: [], weekly_accounts: []
      }],
      ['finance-secure.js', 'HOUSE_FINANCE_SECURE', { accounts: [] }],
      ['ops-delta-secure.js', 'HOUSE_OPS_DELTA_SECURE', {}],
      ['vendor-payables-secure.js', 'HOUSE_VENDOR_PAYABLES_SECURE', {}],
    ];
    for (const [file, variable, data] of fixtures) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const ciphertext = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final(), cipher.getAuthTag()]);
      const envelope = { salt: salt.toString('base64'), iter, iv: iv.toString('base64'), ct: ciphertext.toString('base64') };
      await context.route(u => u.pathname.endsWith('/' + file), route => route.fulfill({
        contentType: 'application/javascript', body: 'window.' + variable + '=' + JSON.stringify(envelope)
      }));
    }
    await context.route(u => u.pathname.endsWith('/checkout-seed.js'), route => route.fulfill({
      contentType: 'application/javascript', body: 'export const CHECKOUT_SEED = null;'
    }));

    const page = await context.newPage();
    await page.goto(url);
    await page.locator('#pw').fill(password);
    await page.locator('#unlock').click();

    async function verifyRooms() {
      await page.locator('#lock').waitFor({ state: 'hidden' });
      const byRoom = (selector, room) => page.locator(selector).filter({
        has: page.getByText(room, { exact: true })
      });
      assert.equal(await byRoom('#cards article', '平德501').count(), 0);
      const rented = byRoom('#rented tr', '平德501');
      assert.equal(await rented.count(), 1);
      assert.equal(await rented.getByText('已出租', { exact: true }).isVisible(), true);
      const pingdeSummary = byRoom('#rentRows tr', '平德501');
      assert.equal(await pingdeSummary.getByText('已出租', { exact: true }).isVisible(), true);
      for (const [room, rent] of [['逢甲701', '12,000'], ['忠明南867-R1', '11,000']]) {
        const card = byRoom('#cards article', room);
        assert.equal(await card.getByText('目前空房', { exact: true }).isVisible(), true);
        assert.equal(await card.getByText('NT$ ' + rent, { exact: true }).isVisible(), true);
        const summary = byRoom('#rentRows tr', room);
        assert.equal(await summary.getByText(rent + ' 元', { exact: true }).isVisible(), true);
        assert.equal(await summary.getByText('空房', { exact: true }).isVisible(), true);
        assert.equal(await byRoom('#rented tr', room).count(), 0);
      }
    }
    await verifyRooms();
    await page.reload();
    await verifyRooms();
  } finally {
    await context.close();
  }
}

module.exports = { checkVacancyPage };

if (require.main === module) {
  (async () => {
    const url = process.argv[2];
    assert.ok(url, 'Pass the vacancy page URL to verify');
    const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
    try {
      await checkVacancyPage(browser, url);
      console.log('PASS vacancy status and monthly rents on unlock and reload (fixture data)');
    } finally {
      await browser.close();
    }
  })().catch(error => { console.error(error); process.exitCode = 1; });
}
