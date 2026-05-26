const https = require('https');

const ELSEVIER_API_KEY = "0436d4fe788649172354545ceca9e650";

const chapterTitle = "Effect of CR on the Performance, Emission and Heat Release Rate of a DI Diesel Engine Run by B20 Blend of Waste Cooking Biodiesel in Diesel Fuel";

function fetchUrl(url, headers = {}) {
  return new Promise((resolve) => {
    https.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    }).on('error', () => resolve(null));
  });
}

async function run() {
  const headers = {
    "X-ELS-APIKey": ELSEVIER_API_KEY,
    "Accept": "application/json"
  };

  const searchUrl = `https://api.elsevier.com/content/search/scopus?query=TITLE-ABS-KEY("${encodeURIComponent(chapterTitle)}")`;
  const searchJson = await fetchUrl(searchUrl, headers);
  console.log("Scopus Response for Row 4:", JSON.stringify(searchJson, null, 2));
}

run();
