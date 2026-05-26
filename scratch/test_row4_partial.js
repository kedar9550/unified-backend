const https = require('https');

const ELSEVIER_API_KEY = "0436d4fe788649172354545ceca9e650";

const query = 'TITLE-ABS-KEY("Waste Cooking Biodiesel" AND "DI Diesel Engine")';

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

  const searchUrl = `https://api.elsevier.com/content/search/scopus?query=${encodeURIComponent(query)}&count=5`;
  const searchJson = await fetchUrl(searchUrl, headers);
  console.log("Scopus Response for Partial Search:", JSON.stringify(searchJson, null, 2));
}

run();
