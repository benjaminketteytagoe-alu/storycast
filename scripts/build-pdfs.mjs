// Turns docs/research.html and docs/documentation.html into PDFs with Chrome.
//   npm run docs:pdf     build both PDFs once
//   npm run docs:watch   rebuild a PDF every time its HTML file is saved
// Uses your installed Chrome/Chromium/Edge. Set CHROME_PATH if it isn't found.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const DOCS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const FILES = ['research', 'documentation'];

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  const found = candidates.find((p) => p && fs.existsSync(p));
  if (!found) {
    console.error('Could not find Chrome. Run again with CHROME_PATH=/path/to/chrome');
    process.exit(1);
  }
  return found;
}

async function build(browser, name) {
  const page = await browser.newPage();
  try {
    await page.goto(pathToFileURL(path.join(DOCS, `${name}.html`)).href, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({ path: path.join(DOCS, `${name}.pdf`), format: 'A4', printBackground: true, preferCSSPageSize: true });
    console.log(`✓ docs/${name}.pdf`);
  } catch (err) {
    console.error(`✗ docs/${name}.pdf: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await page.close();
  }
}

const browser = await puppeteer.launch({ executablePath: findBrowser(), headless: true });
for (const name of FILES) await build(browser, name);

if (!process.argv.includes('--watch')) {
  await browser.close();
} else {
  console.log('Watching docs/*.html. Press Ctrl+C to stop.');
  const timers = {};
  for (const name of FILES) {
    fs.watch(path.join(DOCS, `${name}.html`), () => {
      // Editors often write a file in several steps; wait for them to finish.
      clearTimeout(timers[name]);
      timers[name] = setTimeout(() => build(browser, name), 400);
    });
  }
  process.on('SIGINT', async () => { await browser.close(); process.exit(0); });
}
