import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  // Capture console messages
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.error('PAGE ERROR:', error.message));
  page.on('requestfailed', request => {
    console.log(`REQUEST FAILED: ${request.url()} - ${request.failure().errorText}`);
  });

  try {
    await page.goto('http://localhost:5173/asrs', { waitUntil: 'networkidle0', timeout: 10000 });
    console.log('Page loaded successfully!');
  } catch (err) {
    console.error('Error loading page:', err.message);
  } finally {
    await browser.close();
  }
})();
