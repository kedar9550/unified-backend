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
    const scopusId = "105036800549";
    const headers = {
      "X-ELS-APIKey": ELSEVIER_API_KEY,
      "Accept": "application/json"
    };

    console.log("Fetching Abstract Retrieval for Scopus ID:", scopusId);
    const url = `https://api.elsevier.com/content/abstract/scopus_id/${scopusId}`;
    const res = await fetchUrl(url, headers);
    
    const absResp = res?.["abstracts-retrieval-response"];
    if (absResp) {
      console.log("Coredata keys:", Object.keys(absResp.coredata || {}));
      console.log("Coredata:", JSON.stringify(absResp.coredata, null, 2));
      console.log("Item keys:", Object.keys(absResp.item || {}));
      if (absResp.item) {
        console.log("Item bibrecord keys:", Object.keys(absResp.item.bibrecord || {}));
        console.log("Item bibrecord head keys:", Object.keys(absResp.item.bibrecord?.head || {}));
        console.log("Item bibrecord source details:", JSON.stringify(absResp.item.bibrecord?.head?.source, null, 2));
      }
    } else {
      console.log("No abstracts-retrieval-response found. Full response keys:", Object.keys(res));
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
