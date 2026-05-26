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

  // Search by exact phrase
  console.log("Searching exact TITLE({Energy Harvesting and Storage})...");
  const searchUrl = `https://api.elsevier.com/content/search/scopus?query=TITLE({Energy Harvesting and Storage})&count=25`;
  const searchJson = await fetchUrl(searchUrl, headers);
  const entries = searchJson?.["search-results"]?.entry || [];
  console.log(`Results found: ${searchJson?.["search-results"]?.["opensearch:totalResults"] || 0}`);
  
  for (const entry of entries) {
    if (entry.error) continue;
    console.log("-----------------------------------------");
    console.log(`Title:      "${entry["dc:title"]}"`);
    console.log(`Book/Jour:  "${entry["prism:publicationName"]}"`);
    console.log(`DOI:        "${entry["prism:doi"] || "N/A"}"`);
    console.log(`Publisher:  "${entry["dc:publisher"] || "N/A"}"`);
    console.log(`Creator:    "${entry["dc:creator"] || "N/A"}"`);
    console.log(`Subtype:    "${entry["subtypeDescription"] || "N/A"}"`);
  }
}

run();
