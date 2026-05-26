const https = require('https');

const ELSEVIER_API_KEY = "0436d4fe788649172354545ceca9e650";

function fetchUrl(url, headers = {}) {
  return new Promise((resolve, reject) => {
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
    }).on('error', reject);
  });
}

async function run() {
  try {
    // Querying scopus for some recent book chapters
    const searchUrl = `https://api.elsevier.com/content/search/scopus?query=DOCTYPE(ch)&count=2`;
    const headers = {
      "X-ELS-APIKey": ELSEVIER_API_KEY,
      "Accept": "application/json"
    };

    console.log("Searching Scopus for book chapters...");
    const searchRes = await fetchUrl(searchUrl, headers);
    const entry = searchRes?.["search-results"]?.entry;
    if (entry && entry.length > 0) {
      console.log("Found entry keys:", Object.keys(entry[0]));
      console.log("Full First Entry details:");
      console.log(JSON.stringify(entry[0], null, 2));

      // Let's check if we can query the Abstract Retrieval API using the first entry's Scopus ID
      const dcIdentifier = entry[0]["dc:identifier"] || "";
      const scopusId = dcIdentifier.replace("SCOPUS_ID:", "");
      if (scopusId) {
        console.log("\n--- Testing Abstract Retrieval API with Scopus ID:", scopusId, "---");
        const abstractUrl = `https://api.elsevier.com/content/abstract/scopus_id/${scopusId}`;
        const absRes = await fetchUrl(abstractUrl, headers);
        console.log("Abstract Retrieval API keys:", Object.keys(absRes));
        if (absRes?.["abstracts-response"]) {
          console.log("abstracts-response keys:", Object.keys(absRes["abstracts-response"]));
          console.log("coredata keys:", Object.keys(absRes["abstracts-response"]?.coredata || {}));
          console.log("coredata details:", JSON.stringify(absRes["abstracts-response"]?.coredata, null, 2));
          console.log("item keys:", Object.keys(absRes["abstracts-response"]?.item || {}));
        }
      }
    } else {
      console.log("No entries found or searchRes was:", searchRes);
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
