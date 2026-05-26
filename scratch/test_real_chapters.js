const https = require('https');

const ELSEVIER_API_KEY = "0436d4fe788649172354545ceca9e650";

// Dummy publishers mimicking the database publishers
const dummyPublishers = [
  { name: "Springer", type: "International" },
  { name: "Wiley", type: "International" },
  { name: "Elsevier", type: "International" },
  { name: "Nova Science Publishers", type: "International" },
  { name: "CRC Press", type: "International" },
  { name: "Oxford University Press", type: "International" },
  { name: "Cambridge University Press", type: "International" },
  { name: "McGraw Hill Education", type: "International" },
  { name: "Pearson", type: "International" }
];

const testChapters = [
  {
    row: 1,
    chapterTitle: "Essential aspects of Day to Day Life and Its Influence on Industry 4.0",
    expectedBook: "LoRA and IoT Networks for Applications in Industry 4.0",
    expectedPublisher: "Nova Science Publishers"
  },
  {
    row: 2,
    chapterTitle: "A Study on Application of Soft Computing Techniques for Software Effort Estimation",
    expectedBook: "A Journey Towards Bio Inspired Techniques in Software Engineering",
    expectedPublisher: "Springer"
  },
  {
    row: 3,
    chapterTitle: "Periodical Development of Digital Watermarking Technique",
    expectedBook: "Internet of Things and Big Data Applications",
    expectedPublisher: "Springer"
  },
  {
    row: 4,
    chapterTitle: "Effect of CR on the Performance, Emission and Heat Release Rate of a DI Diesel Engine Run by B20 Blend of Waste Cooking Biodiesel in Diesel Fuel",
    expectedBook: "Bioresource Utilization and Bioprocess",
    expectedPublisher: "Springer"
  },
  {
    row: 5,
    chapterTitle: "Energy Harvesting and Storage",
    expectedBook: "Energy Harvesting Technologies for Powering WPAN and IoT Devices for Industry 4.0 Up-Gradation",
    expectedPublisher: "Nova Science Publishers"
  },
  {
    row: 6,
    chapterTitle: "Biomass",
    expectedBook: "Applied Soft Computing Techniques for Renewable Energy", // partial expected
    expectedPublisher: "Nova Science Publishers"
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

function matchPublisher(rawPublisher, publishers) {
  if (!rawPublisher) return null;
  const cleanRaw = rawPublisher.toLowerCase().replace(/[^a-z0-9]/g, "");

  // 1. Try exact match first
  let matched = publishers.find(p => p.name.toLowerCase() === rawPublisher.toLowerCase());

  // 2. Try substring match next
  if (!matched) {
    matched = publishers.find(p => {
      const cleanDbName = p.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      return cleanRaw.includes(cleanDbName) || cleanDbName.includes(cleanRaw);
    });
  }

  // 3. Try major publisher alias mappings
  if (!matched) {
    const lowerRaw = rawPublisher.toLowerCase();
    let alias = "";
    if (lowerRaw.includes("springer")) alias = "Springer";
    else if (lowerRaw.includes("wiley")) alias = "Wiley";
    else if (lowerRaw.includes("elsevier") || lowerRaw.includes("academic press")) alias = "Elsevier";
    else if (lowerRaw.includes("crc") || lowerRaw.includes("taylor")) alias = "CRC Press";
    else if (lowerRaw.includes("oxford")) alias = "Oxford University Press";
    else if (lowerRaw.includes("cambridge")) alias = "Cambridge University Press";
    else if (lowerRaw.includes("nova")) alias = "Nova Science Publishers";

    if (alias) {
      matched = publishers.find(p => p.name.toLowerCase() === alias.toLowerCase());
    }
  }

  return matched;
}

async function testOne(chapter) {
  console.log(`\n=================== ROW ${chapter.row} ===================`);
  console.log(`Input Chapter Title: "${chapter.chapterTitle}"`);
  
  const headers = {
    "X-ELS-APIKey": ELSEVIER_API_KEY,
    "Accept": "application/json"
  };

  // 1. Scopus Search API
  const searchUrl = `https://api.elsevier.com/content/search/scopus?query=TITLE-ABS-KEY("${encodeURIComponent(chapter.chapterTitle)}")`;
  const searchJson = await fetchUrl(searchUrl, headers);
  const entry = searchJson?.["search-results"]?.entry?.[0];

  if (!entry) {
    console.log("❌ Result: Not found in Scopus search.");
    return;
  }

  // Extract scopusId & DOI
  const dcIdentifier = entry["dc:identifier"] || "";
  let scopusId = "";
  if (dcIdentifier.includes("SCOPUS_ID:")) {
    scopusId = dcIdentifier.replace("SCOPUS_ID:", "");
  } else {
    const match = dcIdentifier.match(/\d+/);
    if (match) scopusId = match[0];
  }
  const scopusDoi = entry["prism:doi"] || "";

  // Initialize auto-fill variables
  let scopusBookTitle = "";
  let scopusPublisher = "";
  let scopusMonth = "";
  let scopusYear = "";

  // 1.5. Scopus Abstract Retrieval API
  if (scopusId) {
    const abstractUrl = `https://api.elsevier.com/content/abstract/scopus_id/${scopusId}`;
    const absJson = await fetchUrl(abstractUrl, headers);
    const coredata = absJson?.["abstracts-retrieval-response"]?.coredata || {};
    
    scopusBookTitle = coredata["prism:publicationName"] || "";
    scopusPublisher = coredata["dc:publisher"] || "";
    const coverDate = coredata["prism:coverDate"] || "";
    if (coverDate) {
      const parts = coverDate.split("-");
      if (parts[0]) scopusYear = parts[0];
      if (parts[1]) {
        const monthNum = parseInt(parts[1], 10);
        const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
        scopusMonth = monthNames[monthNum - 1] || "";
      }
    }
  }

  // Search API Fallbacks
  if (!scopusBookTitle) scopusBookTitle = entry["prism:publicationName"] || "";
  if (!scopusYear || !scopusMonth) {
    const coverDate = entry["prism:coverDate"] || "";
    if (coverDate) {
      const parts = coverDate.split("-");
      if (!scopusYear && parts[0]) scopusYear = parts[0];
      if (!scopusMonth && parts[1]) {
        const monthNum = parseInt(parts[1], 10);
        const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
        scopusMonth = monthNames[monthNum - 1] || "";
      }
    }
  }

  // 2. Crossref API Fallback
  let crossrefBookTitle = "";
  let crossrefPublisher = "";
  let crossrefMonth = "";
  let crossrefYear = "";

  if (scopusDoi) {
    const crossrefUrl = `https://api.crossref.org/works/${encodeURIComponent(scopusDoi)}`;
    const crossrefJson = await fetchUrl(crossrefUrl);
    const msg = crossrefJson?.message || {};
    
    const containerTitleArray = msg["container-title"] || [];
    crossrefBookTitle = containerTitleArray.length > 0 ? containerTitleArray[containerTitleArray.length - 1] : "";
    crossrefPublisher = msg.publisher || "";

    const dateSource = msg["published-online"] || msg["published-print"] || msg["published"] || {};
    const dateParts = dateSource["date-parts"]?.[0] || [];
    if (dateParts.length > 0) {
      crossrefYear = String(dateParts[0]);
      if (dateParts.length > 1) {
        const monthNum = parseInt(dateParts[1], 10);
        const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
        crossrefMonth = monthNames[monthNum - 1] || "";
      }
    }
  }

  // Resolution
  const bookTitle = scopusBookTitle || crossrefBookTitle;
  const rawPublisher = (scopusPublisher || crossrefPublisher || "").trim();
  const extractedMonth = scopusMonth || crossrefMonth;
  const extractedYear = scopusYear || crossrefYear;

  const matched = matchPublisher(rawPublisher, dummyPublishers);

  console.log(`✔️ VERIFICATION RESULTS:`);
  console.log(`  Scopus DOI:      ${scopusDoi || "N/A"}`);
  console.log(`  Scopus Book:     "${scopusBookTitle}"`);
  console.log(`  Crossref Book:   "${crossrefBookTitle}"`);
  console.log(`  Final Book:      "${bookTitle}"`);
  console.log(`    (Expected Book: "${chapter.expectedBook}")`);
  console.log(`  Raw Publisher:   "${rawPublisher}"`);
  console.log(`  Matched Local:   "${matched ? matched.name : "None (Others)"}" (Type: ${matched ? matched.type : "N/A"})`);
  console.log(`    (Expected Pub:  "${chapter.expectedPublisher}")`);
  console.log(`  Month & Year:    ${extractedMonth} ${extractedYear}`);
}

async function run() {
  for (const c of testChapters) {
    await testOne(c);
  }
}

run();
