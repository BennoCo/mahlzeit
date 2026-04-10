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
      res.on('end', () => { console.log(`Updated ${name}: ${daily}`); resolve(); });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Karl der Grosse scraper
async function scrapeKarl() {
  try {
    const html = await fetch('https://www.karldergrosse.ch/bistro/karte');
    // Tagesmenu extrahieren
    const match = html.match(/Tagesmenu[\s\S]*?<\/section>/i) ||
                  html.match(/Tagesgericht[\s\S]{0,500}/i) ||
                  html.match(/Heute gibt es([\s\S]{0,300}?)(?=<\/p>|<h[1-6])/i);
    if (match) {
      // HTML tags entfernen
      let menu = match[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      menu = menu.substring(0, 200);
      if (menu.length > 20) {
        await supabaseUpdate('Karl der Grosse', menu);
        return;
      }
    }
    // Fallback: Hauptgerichte extrahieren
    const mainMatch = html.match(/Hauptgerichte([\s\S]{0,800}?)(?=##|Vorspeisen)/i);
    if (mainMatch) {
      let menu = mainMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 200);
      await supabaseUpdate('Karl der Grosse', menu);
    } else {
      console.log('Karl: Kein MenÃ¼ gefunden, Ã¼berspringe Update');
    }
  } catch (e) {
    console.error('Karl scrape error:', e.message);
  }
}

// Zum chalte Brunne scraper
async function scrapeChalteBrunne() {
  try {
    const html = await fetch('https://www.zumchaltebrunne.ch/menu');
    // Wochenmenu extrahieren
    const match = html.match(/Mittagsmenu diese Woche([\s\S]{0,1000}?)(?=##|<\/section>|Schweizer Bratwurst)/i) ||
                  html.match(/Wochenmenu([\s\S]{0,800}?)(?=##|<\/section>)/i) ||
                  html.match(/Mittagsmen[uÃ¼]([\s\S]{0,600}?)(?=##|<\/section>)/i);
    if (match) {
      let menu = match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 200);
      if (menu.length > 20) {
        await supabaseUpdate('Zum chalte Brunne', menu);
        return;
      }
    }
    console.log('Chaltebrunne: Kein MenÃ¼ gefunden, Ã¼berspringe Update');
  } catch (e) {
    console.error('Chaltebrunne scrape error:', e.message);
  }
}

(async () => {
  console.log('Starte MenÃ¼-Scraper...');
  await scrapeKarl();
  await scrapeChalteBrunne();
  console.log('Fertig.');
})();
