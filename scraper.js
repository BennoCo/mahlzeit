const https = require('https');

const SUPABASE_URL = 'https://hkwibmfcjvwseewxdrfj.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

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
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { console.log(`âœ“ Updated "${name}": ${daily}`); resolve(); });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Wochentag auf Deutsch
function getDayName() {
  const days = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
  return days[new Date().getDay()];
}

// Zum chalte Brunne â€” liest das Wochenmenu und gibt den heutigen Tag zurÃ¼ck
async function scrapeChalteBrunne() {
  try {
    const html = await fetch('https://www.zumchaltebrunne.ch/menu');
    const day = getDayName();

    // Suche nach "### Dienstag" etc. und extrahiere Titel + Beschreibung
    const dayRegex = new RegExp(
      `###\\s*${day}\\s*\\n+\\*\\*(.+?)\\*\\*\\s*\\n+([^#]+?)(?=###|$)`,
      'i'
    );

    // HTML zu Text
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '\n')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\n{3,}/g, '\n\n');

    const match = text.match(dayRegex);
    if (match) {
      const title = match[1].trim();
      const desc = match[2].replace(/\s+/g, ' ').trim().substring(0, 120);
      const menu = desc ? `${title} â€” ${desc}` : title;
      await supabaseUpdate('Zum chalte Brunne', menu);
    } else {
      // Fallback: Suche nur nach Tagesname + nÃ¤chste Zeile
      const fallback = new RegExp(`${day}[\\s\\S]{0,20}\\*\\*(.+?)\\*\\*`, 'i');
      const fb = text.match(fallback);
      if (fb) {
        await supabaseUpdate('Zum chalte Brunne', fb[1].trim());
      } else {
        console.log(`Chaltebrunne: Kein Eintrag fÃ¼r ${day} gefunden`);
      }
    }
  } catch (e) {
    console.error('Chaltebrunne Fehler:', e.message);
  }
}

// Karl der Grosse â€” liest das Tagesmenu
async function scrapeKarl() {
  try {
    const html = await fetch('https://www.karldergrosse.ch/bistro/karte');

    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '\n')
      .replace(/&amp;/g, '&')
      .replace(/\n{3,}/g, '\n\n');

    // Tagesmenu-Abschnitt
    const match = text.match(/Tagesmenu[\s\S]{0,600}?(?=Hauptgerichte|##|$)/i);
    if (match) {
      let menu = match[0].replace(/\s+/g, ' ').trim();
      // "Heute gibt es keine Tagesgerichte" abfangen
      if (menu.toLowerCase().includes('keine tagesgerichte') || menu.length < 30) {
        // Fallback auf Hauptgerichte
        const main = text.match(/Hauptgerichte([\s\S]{0,400}?)(?=Vorspeisen|##)/i);
        if (main) {
          menu = main[1].replace(/\s+/g, ' ').trim().substring(0, 200);
          await supabaseUpdate('Karl der Grosse', 'Hauptgerichte: ' + menu);
        } else {
          console.log('Karl: Kein Tagesmenu heute');
        }
        return;
      }
      await supabaseUpdate('Karl der Grosse', menu.substring(0, 200));
    } else {
      console.log('Karl: Kein Tagesmenu-Abschnitt gefunden');
    }
  } catch (e) {
    console.error('Karl Fehler:', e.message);
  }
}

(async () => {
  const day = getDayName();
  console.log(`Mahlzeit Scraper â€” ${day}`);
  await scrapeChalteBrunne();
  await scrapeKarl();
  console.log('Fertig.');
})();
