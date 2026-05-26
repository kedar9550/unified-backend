const https = require('https');

const ELSEVIER_API_KEY = "0436d4fe788649172354545ceca9e650";

const testChapters = [
  {
    row: 4,
    chapterTitle: "Effect of CR on the Performance, Emission and Heat Release Rate of a DI Diesel Engine Run by B20 Blend of Waste Cooking Biodiesel in Diesel Fuel",
    expectedBook: "Bioresource Utilization and Bioprocess"
  },
  {
    row: 5,
    chapterTitle: "Energy Harvesting and Storage",
    expectedBook: "Energy Harvesting Technologies for Powering WPAN and IoT Devices for Industry 4.0 Up-Gradation"
  },
  {
    row: 6,
    chapterTitle: "Biomass",
    expectedBook: "Applied Soft Computing Techniques for Renewable Energy Source"
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

function cleanTitle(t) {
  return t ? t.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
}

async function run() {
  const headers = {
    "X-ELS-APIKey": ELSEVIER_API_KEY,
    "Accept": "application/json"
  };

  for (const c of testChapters) {
    console.log(`\n=================== ROW ${c.row}: "${c.chapterTitle}" ===================`);
    
    // Let's query Scopus with count=20 so we get a wide list of potential matches
    const searchUrl = `https://api.elsevier.com/content/search/scopus?query=TITLE-ABS-KEY("${encodeURIComponent(c.chapterTitle)}")&count=20`;
    const searchJson = await fetchUrl(searchUrl, headers);
    const entries = searchJson?.["search-results"]?.entry || [];
    
    console.log(`Total results in list: ${entries.length}`);

    // Let's look for the entry that best matches the title
    const userClean = cleanTitle(c.chapterTitle);
    let bestEntry = null;
    let exactMatchFound = false;

    for (const entry of entries) {
      const entryClean = cleanTitle(entry["dc:title"]);
      if (entryClean === userClean) {
        bestEntry = entry;
        exactMatchFound = true;
        break;
      }
    }

    // If no exact match, fallback to the one where entry clean title contains user clean title or vice versa
    if (!bestEntry) {
      for (const entry of entries) {
        const entryClean = cleanTitle(entry["dc:title"]);
        if (entryClean.includes(userClean) || userClean.includes(entryClean)) {
          bestEntry = entry;
          break;
        }
      }
    }

    // Otherwise fallback to entry[0]
    if (!bestEntry && entries.length > 0) {
      bestEntry = entries[0];
    }

    if (bestEntry) {
      console.log(`Selected Entry Title: "${bestEntry["dc:title"]}" (Exact Match: ${exactMatchFound})`);
      console.log(`Selected Entry Book:  "${bestEntry["prism:publicationName"]}"`);
      console.log(`Selected Entry DOI:   "${bestEntry["prism:doi"] || "N/A"}"`);
    } else {
      console.log("❌ No entry matched!");
    }
  }
}

run();
