const https = require('https');

const ELSEVIER_API_KEY = "0436d4fe788649172354545ceca9e650";

const testChapters = [
  {
    row: 1,
    chapterTitle: "Essential aspects of Day to Day Life and Its Influence on Industry 4.0"
  },
  {
    row: 5,
    chapterTitle: "Energy Harvesting and Storage"
  },
  {
    row: 6,
    chapterTitle: "Biomass"
  }
];

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

  for (const c of testChapters) {
    console.log(`\n=================== BRACES TITLE SEARCH: "${c.chapterTitle}" ===================`);
    // Enclose title inside curly braces for exact phrase search
    const query = `TITLE({${c.chapterTitle}})`;
    const searchUrl = `https://api.elsevier.com/content/search/scopus?query=${encodeURIComponent(query)}&count=5`;
    const searchJson = await fetchUrl(searchUrl, headers);
    const entries = searchJson?.["search-results"]?.entry || [];
    console.log(`Total results found: ${searchJson?.["search-results"]?.["opensearch:totalResults"] || 0}`);
    if (entries.length > 0 && !entries[0].error) {
      console.log(`Top Matched Title: "${entries[0]["dc:title"]}"`);
      console.log(`Top Matched Book:  "${entries[0]["prism:publicationName"]}"`);
    } else {
      console.log("❌ No entries found.");
    }
  }
}

run();
