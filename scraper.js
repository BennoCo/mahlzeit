const puppeteer = require('puppeteer');
const https = require('https');

const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

function supabaseUpdate(name, daily) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ daily });
    const options = {
      hostname: 'hkwibmfcjvwseewxdrfj.supabase.co',
      path: `/rest/v1/restaurants?name=eq.${encodeURIComponent(name)}`,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { console.log(`\u2713 Updated "${name}":\n${daily}`); resolve(); });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function getDayName() {
  return ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'][new Date().getDay()];
}

async function getPageText(browser, url) {
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  // Warte bis Inhalte geladen
  await new Promise(r => setTimeout(r, 2000));
  const text = await page.evaluate(() => document.body.innerText);
  await page.close();
  return text;
}

async function scrapeChalteBrunne(browser) {
  try {
    const text = await getPageText(browser, 'https://www.zumchaltebrunne.ch/menu');
    const day = getDayName();

    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // Mittagsmenu-Abschnitt finden
    const menuStartIdx = lines.findIndex(l => /Mittagsmenu.*KW/i.test(l));
    if (menuStartIdx === -1) {
      await supabaseUpdate('Zum chalte Brunne', 'Heute kein Mittagsmen\u00fc');
      return;
    }

    const menuLines = lines.slice(menuStartIdx, menuStartIdx + 50);
    const allDays = ['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'];
    const otherDays = allDays.filter(d => d !== day);
    const stopWords = ['was unser', 'bio-fleisch', 't\u00e4glich frisch', 'biologische', '\u00f6ffnungszeiten', 'reservierung', 'takeaway', 'take-away'];

    // Tagesindex finden
    let dayIdx = menuLines.findIndex(l => l.trim() === day);
    if (dayIdx === -1) dayIdx = menuLines.findIndex(l => l.toLowerCase().includes(day.toLowerCase()));

    if (dayIdx === -1) {
      await supabaseUpdate('Zum chalte Brunne', 'Heute kein Mittagsmen\u00fc');
      return;
    }

    // Zeilen nach dem Tag sammeln (max 2: Titel + Beschreibung)
    const result = [];
    for (let i = dayIdx + 1; i < menuLines.length; i++) {
      const line = menuLines[i].trim();
      if (!line) continue;
      if (otherDays.some(d => line === d)) break;
      if (stopWords.some(w => line.toLowerCase().startsWith(w))) break;
      if (result.length >= 2) break;
      result.push(line);
    }

    if (result.length > 0) {
      await supabaseUpdate('Zum chalte Brunne', result.join('\n'));
    } else {
      await supabaseUpdate('Zum chalte Brunne', 'Heute kein Mittagsmen\u00fc');
    }
  } catch (e) {
    console.error('Chaltebrunne Fehler:', e.message);
  }
}

async function scrapeKarl(browser) {
  try {
    const text = await getPageText(browser, 'https://www.karldergrosse.ch/bistro/karte');
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // Tageskarte-Abschnitt finden
    const tageskartaIdx = lines.findIndex(l => /tageskarte|tagesmenu/i.test(l));

    if (tageskartaIdx !== -1) {
      const menuLines = [];
      for (let i = tageskartaIdx + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (/hauptgerichte|vorspeisen|snacks|s\u00fcsses/i.test(line)) break;
        if (/keine tagesgerichte/i.test(line)) break;
        if (/^\d+[\.,]\d+$|^Klein$|^Gross$/i.test(line)) continue;
        if (line.length > 4) menuLines.push(line);
      }
      if (menuLines.length > 0) {
        await supabaseUpdate('Karl der Grosse', menuLines.join('\n').substring(0, 300));
        return;
      }
    }

    // Fallback: Hauptgerichte
    const hauptIdx = lines.findIndex(l => /hauptgerichte/i.test(l));
    if (hauptIdx !== -1) {
      const mainLines = [];
      for (let i = hauptIdx + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (/vorspeisen|snacks|s\u00fcsses/i.test(line)) break;
        if (line.length > 8 && !/^\d+[\.,]/.test(line) && !/^CHF/i.test(line) && !/^Klein$|^Gross$/i.test(line)) {
          mainLines.push(line);
          if (mainLines.length >= 4) break;
        }
      }
      if (mainLines.length > 0) {
        await supabaseUpdate('Karl der Grosse', mainLines.join('\n').substring(0, 300));
        return;
      }
    }

    console.log('Karl: Kein Men\u00fc gefunden');
  } catch (e) {
    console.error('Karl Fehler:', e.message);
  }
}

(async () => {
  const day = getDayName();
  console.log(`Mahlzeit Scraper \u2014 ${day}`);

  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: true
  });

  try {
    await scrapeChalteBrunne(browser);
    await scrapeKarl(browser);
  } finally {
    await browser.close();
  }

  console.log('Fertig.');
})();
