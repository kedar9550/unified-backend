const https = require('https');

const ELSEVIER_API_KEY = "0436d4fe788649172354545ceca9e650";
const chapterTitle = "Machine Learning in Healthcare"; // Let's try to query something generic or search for book chapters

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
    const searchUrl = `https://api.elsevier.com/content/search/scopus?query=TITLE-ABS-KEY("${encodeURIComponent(chapterTitle)}")&count=5`;
    const headers = {
      "X-ELS-APIKey": ELSEVIER_API_KEY,
      "Accept": "application/json"
    };

    console.log("Searching Scopus for:", chapterTitle);
    const searchRes = await fetchUrl(searchUrl, headers);
    console.log("Search Results:", JSON.stringify(searchRes, null, 2));

    const entry = searchRes?.["search-results"]?.entry?.[0];
    if (entry) {
      const doi = entry["prism:doi"];
      console.log("Found entry with DOI:", doi);
      console.log("Scopus Publication Name:", entry["prism:publicationName"]);
      console.log("Scopus isbn:", entry["prism:isbn"]);
      
      if (doi) {
        const crossrefUrl = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
        console.log("Fetching Crossref metadata for:", doi);
        const crossrefRes = await fetchUrl(crossrefUrl);
        console.log("Crossref Result Message:", JSON.stringify(crossrefRes?.message, null, 2));
      }
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
