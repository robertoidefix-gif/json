const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const flags = process.argv[2] === 'allow' ? ['--allow-file-access-from-files'] : [];
  const b = await chromium.launch({ args: flags });
  const p = await b.newPage();
  const logs = [];
  p.on('console', (m) => logs.push(m.type() + ': ' + m.text().slice(0, 300)));
  p.on('pageerror', (e) => logs.push('pageerror: ' + e.message.slice(0, 300)));
  await p.goto('file://' + __dirname + '/prueba-file-sondas.html');
  await p.evaluate(() => window.__run());
  console.log('FLAGS', JSON.stringify(flags), 'Chromium', b.version());
  console.log(JSON.stringify(await p.evaluate(() => window.__R), null, 1));
  console.log(logs.slice(0, 25).join('\n'));
  await b.close();
})();
