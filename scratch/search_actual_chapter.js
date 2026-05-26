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

  // Search by author "Ranjit" and title word "Energy"
  console.log("Searching Scopus by author and title keywords...");
  const searchUrl = `https://api.elsevier.com/content/search/scopus?query=AUTHOR-NAME(Ranjit) AND TITLE(Energy)&count=25`;
  const searchJson = await fetchUrl(searchUrl, headers);
  const entries = searchJson?.["search-results"]?.entry || [];
  console.log(`Results found: ${entries.length}`);
  
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
