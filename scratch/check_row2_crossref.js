const https = require('https');

const doi = "10.1007/978-3-030-40928-9_8";

function fetchUrl(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
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
  const crossrefUrl = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
  console.log("Fetching Crossref metadata for Row 2 DOI:", doi);
  const res = await fetchUrl(crossrefUrl);
  const msg = res?.message || {};

  console.log("=================== DATE FIELDS IN CROSSREF ===================");
  console.log("published-online:", JSON.stringify(msg["published-online"], null, 2));
  console.log("published-print: ", JSON.stringify(msg["published-print"], null, 2));
  console.log("published:       ", JSON.stringify(msg["published"], null, 2));
  console.log("issued:          ", JSON.stringify(msg["issued"], null, 2));
  console.log("created:         ", JSON.stringify(msg["created"], null, 2));
  console.log("indexed:         ", JSON.stringify(msg["indexed"], null, 2));
  
  const assertions = msg.assertion || [];
  console.log("assertions:      ", JSON.stringify(assertions, null, 2));
}

run();
