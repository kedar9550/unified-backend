const https = require('https');

const ELSEVIER_API_KEY = "0436d4fe788649172354545ceca9e650";

function fetchUrl(url, headers = {}) {
  return new Promise((resolve) => {
    https.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(null);
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

  console.log("Searching chapters in book 'Applied Soft Computing Techniques for Renewable Energy'...");
  const searchUrl = `https://api.elsevier.com/content/search/scopus?query=pub(Applied Soft Computing Techniques for Renewable Energy)&count=100`;
  const searchJson = await fetchUrl(searchUrl, headers);
  const entries = searchJson?.["search-results"]?.entry || [];
  console.log(`Chapters found: ${entries.length}`);
  
  for (const entry of entries) {
    if (entry.error) continue;
    console.log("-----------------------------------------");
    console.log(`Title:      "${entry["dc:title"]}"`);
    console.log(`Authors:    "${entry["dc:creator"] || "N/A"}"`);
    console.log(`DOI:        "${entry["prism:doi"] || "N/A"}"`);
  }
}

run();
