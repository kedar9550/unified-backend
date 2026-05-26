const https = require('https');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
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
    const doi = "10.1002/9781394346998.ch9";
    const crossrefUrl = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
    console.log("Fetching Crossref metadata for:", doi);
    const crossrefRes = await fetchUrl(crossrefUrl);
    console.log("Crossref container-title:", crossrefRes?.message?.["container-title"]);
    console.log("Crossref publisher:", crossrefRes?.message?.publisher);
    console.log("Crossref title:", crossrefRes?.message?.title);
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
