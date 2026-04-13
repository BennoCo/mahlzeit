const https = require('https');
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
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { console.log(`âœ“ Updated "${name}":\n${daily}`); resolve(); });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function getDayName() {
  return ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'][new Date().getDay()];
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

async function scrapeChalteBrunne() {
  try {
    const html = await fetch('https://www.zumchaltebrunne.ch/menu');
    const text = htmlToText(html);
    const day = getDayName();

    const menuStart = text.search(/Mittagsmenu\s*-\s*KW/i);
    if (menuStart === -1) { await supabaseUpdate('Zum chalte Brunne', 'Heute kein Mittagsmen\u00fc'); return; }
    const menuSection = text.substring(menuStart, menuStart + 3000);
    const lines = menuSection.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    const allDays = ['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'];
    const otherDays = allDays.filter(d => d !== day);
    const stopWords = ['was unser', 'bio-fleisch', 'tÃ¤glich frisch', 'biologische', 'mittagsmenus', 'Ã¶ffnungszeiten', 'reservierung', 'takeaway', 'take-away', 'jetzt'];

    let dayIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === day || lines[i].toLowerCase() === day.toLowerCase()) { dayIdx = i; break; }
    }
    if (dayIdx === -1) {
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(day.toLowerCase())) { dayIdx = i; break; }
      }
    }
    if (dayIdx === -1) { await supabaseUpdate('Zum chalte Brunne', 'Heute kein Mittagsmen\u00fc'); return; }

    const menuLines = [];
    for (let i = dayIdx + 1; i < lines.length; i++) {
      const line = lines[i].replace(/\*\*/g, '').trim();
      // Stopp bei nÃ¤chstem Tag
      if (otherDays.some(d => line === d)) break;
      // Stopp bei generischen Beschreibungstexten
      if (stopWords.some(w => line.toLowerCase().startsWith(w))) break;
      // Maximal Titel + 1 Beschreibungszeile
      if (menuLines.length >= 2) break;
      if (line.length > 3) menuLines.push(line);
    }

    if (menuLines.length > 0) {
      await supabaseUpdate('Zum chalte Brunne', menuLines.join('\n'));
    } else {
      await supabaseUpdate('Zum chalte Brunne', 'Heute kein Mittagsmen\u00fc');
    }
  } catch (e) {
    console.error('Chaltebrunne Fehler:', e.message);
  }
}

async function scrapeKarl() {
  try {
    const html = await fetch('https://www.karldergrosse.ch/bistro/karte');
    const text = htmlToText(html);
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    let inTagesmenu = false;
    const menuLines = [];
    for (let i = 0; i < lines.length; i++) {
      if (/tagesmenu/i.test(lines[i])) { inTagesmenu = true; continue; }
      if (inTagesmenu) {
        if (/hauptgerichte|vorspeisen|snacks|sÃ¼sses/i.test(lines[i])) break;
        if (/keine tagesgerichte/i.test(lines[i])) { inTagesmenu = false; break; }
        if (lines[i].length > 4) menuLines.push(lines[i]);
      }
    }

    if (menuLines.length > 0) {
      await supabaseUpdate('Karl der Grosse', menuLines.join('\n').substring(0, 300));
      return;
    }

    // Fallback: Hauptgerichte
    let inMain = false;
    const mainLines = [];
    for (const line of lines) {
      if (/hauptgerichte/i.test(line)) { inMain = true; continue; }
      if (inMain && /vorspeisen|snacks|sÃ¼sses/i.test(line)) break;
      if (inMain && line.length > 8 && !/^\d+[\.,]/.test(line) && !/^CHF/i.test(line)) {
        mainLines.push(line);
        if (mainLines.length >= 4) break;
      }
    }
    if (mainLines.length > 0) {
      await supabaseUpdate('Karl der Grosse', mainLines.join('\n').substring(0, 300));
    } else {
      console.log('Karl: Kein MenÃ¼ gefunden');
    }
  } catch (e) {
    console.error('Karl Fehler:', e.message);
  }
}

(async () => {
  console.log(`Mahlzeit Scraper â€” ${getDayName()}`);
  await scrapeChalteBrunne();
  await scrapeKarl();
  console.log('Fertig.');
})();
